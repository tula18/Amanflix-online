from flask import Blueprint, jsonify, request
import json
import random
import re
import string
import threading
import time
import uuid
from datetime import datetime, timezone

import jwt

from api.cache import get_cached_user, is_token_blacklisted
from api.utils import parse_watch_id, token_required


watch_party_bp = Blueprint('watch_party', __name__, url_prefix='/api/watch-party')

PARTY_TTL_SECONDS = 2 * 60 * 60
MAX_CHAT_MESSAGES = 100
MAX_CHAT_LENGTH = 500
SPAM_WINDOW_SECONDS = 10
SPAM_MAX_MESSAGES = 5
SPAM_DUPLICATE_SECONDS = 8
PARTY_CODE_LENGTH = 6
CODE_ALPHABET = ''.join(ch for ch in string.ascii_uppercase + string.digits if ch not in '0O1I')
ALLOWED_REACTIONS = {'👍', '😂', '❤️', '😮', '🔥', '👏'}
PROFANITY_PATTERNS = (
    r'\bf+u+c+k+\b',
    r'\bs+h+i+t+\b',
    r'\bb+i+t+c+h+\b',
    r'\ba+s+s+h+o+l+e+\b',
    r'\bc+u+n+t+\b',
    r'\bd+i+c+k+\b',
    r'\bp+u+s+s+y+\b',
)
DEFAULT_PARTY_SETTINGS = {
    'members_can_control_playback': True,
    'chat_enabled': True,
    'reactions_enabled': True,
    'show_playback_feed': True,
    'party_locked': False,
    'profanity_filter_enabled': True,
    'spam_protection_enabled': True,
}

_party_lock = threading.RLock()
_parties = {}
_socket_route_registered = False


def _utc_now_iso():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def _utc_timestamp_iso(timestamp):
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat().replace('+00:00', 'Z')


def _normalize_code(code):
    return (code or '').strip().upper()


def _safe_float(value, default=0.0):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if number < 0:
        return 0.0
    return number


def _valid_watch_id(watch_id):
    if not isinstance(watch_id, str) or not watch_id.strip():
        return False
    try:
        return parse_watch_id(watch_id.strip()) is not None
    except (TypeError, ValueError):
        return False


def _generate_party_code_locked():
    for _ in range(100):
        code = ''.join(random.choice(CODE_ALPHABET) for _ in range(PARTY_CODE_LENGTH))
        if code not in _parties:
            return code
    raise RuntimeError('Could not generate a unique party code')


def _current_position_locked(party, now=None):
    playback = party['playback']
    position = float(playback.get('position', 0.0))
    if playback.get('playing'):
        timestamp = now if now is not None else time.time()
        position += max(0.0, timestamp - float(playback.get('updated_at', timestamp)))
    return max(0.0, position)


def _touch_party_locked(party):
    now = time.time()
    party['last_activity'] = now
    return now


def _cleanup_expired_locked():
    now = time.time()
    expired_codes = [
        code for code, party in _parties.items()
        if now - party.get('last_activity', party.get('created_at', now)) > PARTY_TTL_SECONDS
    ]
    expired_connections = []
    for code in expired_codes:
        party = _parties.pop(code, None)
        if not party:
            continue
        expired_connections.extend(record['ws'] for record in party.get('connections', {}).values())
    return expired_codes, expired_connections


def _upsert_member_locked(party, user, connected=None):
    user_id = int(user.id)
    now = time.time()
    member = party['members'].get(user_id, {})
    member.update({
        'id': user_id,
        'username': getattr(user, 'username', f'User {user_id}'),
        'is_leader': user_id == party['leader_id'],
        'last_seen': now,
    })
    if connected is not None:
        member['connected'] = bool(connected)
    elif 'connected' not in member:
        member['connected'] = False
    if 'chat_muted' not in member:
        member['chat_muted'] = False
    party['members'][user_id] = member
    return member


def _serialize_member(member):
    connected = bool(member.get('connected'))
    return {
        'id': member['id'],
        'username': member.get('username') or f"User {member['id']}",
        'is_leader': bool(member.get('is_leader')),
        'connected': connected,
        'connection_status': 'online' if connected else 'offline',
        'last_seen': member.get('last_seen'),
        'chat_muted': bool(member.get('chat_muted')),
    }


def _party_expires_in_locked(party, now=None):
    timestamp = now if now is not None else time.time()
    return max(0, int(PARTY_TTL_SECONDS - (timestamp - party['last_activity'])))


def _serialize_party_locked(party, current_user_id=None):
    now = time.time()
    playback = dict(party['playback'])
    playback['position'] = _current_position_locked(party, now)
    playback['updated_at'] = now

    current_member = party['members'].get(int(current_user_id)) if current_user_id is not None else None
    members = sorted(
        (_serialize_member(member) for member in party['members'].values()),
        key=lambda item: (not item['is_leader'], item['username'].lower())
    )

    settings = {**DEFAULT_PARTY_SETTINGS, **party.get('settings', {})}

    return {
        'code': party['code'],
        'watch_id': party['watch_id'],
        'leader_id': party['leader_id'],
        'current_user_id': int(current_user_id) if current_user_id is not None else None,
        'is_leader': bool(current_member and current_member.get('is_leader')),
        'members': members,
        'playback': playback,
        'chat': list(party['chat']),
        'settings': settings,
        'created_at': party['created_at_iso'],
        'last_activity': party['last_activity'],
        'expires_in': _party_expires_in_locked(party, now),
        'expires_at': _utc_timestamp_iso(party['last_activity'] + PARTY_TTL_SECONDS),
    }


def _json_message(message_type, **payload):
    data = {'type': message_type}
    data.update(payload)
    return json.dumps(data)


def _connection_snapshot_locked(code):
    party = _parties.get(code)
    if not party:
        return []
    return [(conn_id, record['ws']) for conn_id, record in party.get('connections', {}).items()]


def _remove_connections(code, connection_ids):
    if not connection_ids:
        return
    with _party_lock:
        party = _parties.get(code)
        if not party:
            return
        for conn_id in connection_ids:
            party.get('connections', {}).pop(conn_id, None)
        _refresh_member_connections_locked(party)


def _send_to_connections(code, connections, payload):
    failed = []
    for conn_id, ws in connections:
        try:
            ws.send(payload)
        except Exception:
            failed.append(conn_id)
    _remove_connections(code, failed)


def _broadcast(code, message_type, **payload):
    message = _json_message(message_type, **payload)
    with _party_lock:
        connections = _connection_snapshot_locked(code)
    _send_to_connections(code, connections, message)


def _broadcast_party_state(code):
    with _party_lock:
        party = _parties.get(code)
        if not party:
            return
        messages = [
            (
                conn_id,
                record['ws'],
                _json_message('party_state', party=_serialize_party_locked(party, record['user_id']))
            )
            for conn_id, record in party.get('connections', {}).items()
        ]

    failed = []
    for conn_id, ws, message in messages:
        try:
            ws.send(message)
        except Exception:
            failed.append(conn_id)
    _remove_connections(code, failed)


def _refresh_member_connections_locked(party):
    connected_user_ids = {record['user_id'] for record in party.get('connections', {}).values()}
    for user_id, member in party['members'].items():
        member['connected'] = user_id in connected_user_ids


def _append_chat_item_locked(party, item):
    party['chat'].append(item)
    if len(party['chat']) > MAX_CHAT_MESSAGES:
        del party['chat'][:-MAX_CHAT_MESSAGES]
    return item


def _append_system_message_locked(party, message):
    return _append_chat_item_locked(party, {
        'id': uuid.uuid4().hex[:12],
        'type': 'system',
        'message': message,
        'created_at': _utc_now_iso(),
    })


def _format_playback_position(seconds):
    safe_seconds = max(0, int(seconds or 0))
    hours = safe_seconds // 3600
    minutes = (safe_seconds % 3600) // 60
    remaining_seconds = safe_seconds % 60
    if hours:
        return f'{hours}:{minutes:02d}:{remaining_seconds:02d}'
    return f'{minutes}:{remaining_seconds:02d}'


def _append_playback_action_locked(party, user, action, position):
    settings = {**DEFAULT_PARTY_SETTINGS, **party.get('settings', {})}
    if not settings.get('show_playback_feed', True):
        return None
    if action not in {'play', 'pause', 'seek'}:
        return None

    username = getattr(user, 'username', f'User {user.id}')
    action_text = {
        'play': 'played',
        'pause': 'paused',
        'seek': 'seeked to',
    }[action]
    position_label = _format_playback_position(position)
    return _append_chat_item_locked(party, {
        'id': uuid.uuid4().hex[:12],
        'type': 'playback_action',
        'user_id': int(user.id),
        'username': username,
        'action': action,
        'position': max(0.0, float(position or 0.0)),
        'message': f'{username} {action_text} {position_label}',
        'created_at': _utc_now_iso(),
    })


def _normalize_chat_control_text(text):
    return re.sub(r'\s+', ' ', (text or '').strip().lower())


def _contains_profanity(text):
    normalized = _normalize_chat_control_text(text)
    return any(re.search(pattern, normalized) for pattern in PROFANITY_PATTERNS)


def _check_chat_controls_locked(party, user, content, check_duplicate=True):
    settings = {**DEFAULT_PARTY_SETTINGS, **party.get('settings', {})}
    member = party['members'].get(int(user.id))
    if not member:
        return None

    is_leader = int(user.id) == party['leader_id']
    if (
        not is_leader and
        settings.get('profanity_filter_enabled', True) and
        _contains_profanity(content)
    ):
        return 'Message blocked by profanity filter'

    if is_leader or not settings.get('spam_protection_enabled', True):
        return None

    now = time.time()
    timestamps = [
        timestamp for timestamp in member.get('chat_timestamps', [])
        if now - float(timestamp) <= SPAM_WINDOW_SECONDS
    ]
    if len(timestamps) >= SPAM_MAX_MESSAGES:
        member['chat_timestamps'] = timestamps
        return 'Slow down before sending another message'

    normalized = _normalize_chat_control_text(content)
    if (
        check_duplicate and
        normalized and
        member.get('last_chat_text') == normalized and
        now - float(member.get('last_chat_at', 0)) <= SPAM_DUPLICATE_SECONDS
    ):
        member['chat_timestamps'] = timestamps
        return 'Duplicate message blocked'

    timestamps.append(now)
    member['chat_timestamps'] = timestamps
    member['last_chat_text'] = normalized
    member['last_chat_at'] = now
    return None


def _decode_user_from_token(raw_token):
    token = (raw_token or '').strip()
    if token.startswith('Bearer '):
        token = token.split(' ', 1)[1].strip()
    if not token:
        return None, 'token_missing'
    try:
        data = jwt.decode(token, 'test', algorithms=['HS256'])
        user = get_cached_user(int(data['sub']))
        if not user:
            return None, 'user_not_exist'
        if is_token_blacklisted(token):
            return None, 'user_logged_out'
        if getattr(user, 'is_banned', False):
            return None, 'user_banned'
        return user, None
    except jwt.ExpiredSignatureError:
        return None, 'token_expired'
    except jwt.InvalidTokenError:
        return None, 'token_invalid'
    except Exception:
        return None, 'auth_error'


def _create_party_for_user(user, watch_id):
    with _party_lock:
        _cleanup_expired_locked()
        code = _generate_party_code_locked()
        now = time.time()
        party = {
            'code': code,
            'watch_id': watch_id,
            'leader_id': int(user.id),
            'created_at': now,
            'created_at_iso': _utc_now_iso(),
            'last_activity': now,
            'members': {},
            'chat': [],
            'connections': {},
            'settings': dict(DEFAULT_PARTY_SETTINGS),
            'playback': {
                'position': 0.0,
                'playing': False,
                'updated_at': now,
                'version': 0,
                'last_action': 'created',
            },
        }
        _upsert_member_locked(party, user, connected=False)
        _append_system_message_locked(party, f"{getattr(user, 'username', f'User {user.id}')} started the party")
        _parties[code] = party
        return _serialize_party_locked(party, user.id)


def _join_party_for_user_with_error(user, code, announce=False):
    normalized_code = _normalize_code(code)
    with _party_lock:
        _cleanup_expired_locked()
        party = _parties.get(normalized_code)
        if not party:
            return None, 'Party not found or expired'
        _touch_party_locked(party)
        was_member = int(user.id) in party['members']
        settings = {**DEFAULT_PARTY_SETTINGS, **party.get('settings', {})}
        if settings.get('party_locked', False) and not was_member:
            return None, 'Party is locked'
        _upsert_member_locked(party, user)
        if announce and not was_member:
            _append_system_message_locked(
                party,
                f"{getattr(user, 'username', f'User {user.id}')} joined the party"
            )
        return _serialize_party_locked(party, user.id), None


def _join_party_for_user(user, code, announce=False):
    party, _ = _join_party_for_user_with_error(user, code, announce)
    return party


@watch_party_bp.route('/create', methods=['POST'])
@token_required
def create_watch_party(current_user):
    data = request.get_json(silent=True) or {}
    watch_id = (data.get('watch_id') or '').strip()
    if not _valid_watch_id(watch_id):
        return jsonify({'message': 'Invalid watch_id'}), 400

    party = _create_party_for_user(current_user, watch_id)
    return jsonify({'party': party}), 201


@watch_party_bp.route('/join', methods=['POST'])
@token_required
def join_watch_party(current_user):
    data = request.get_json(silent=True) or {}
    party, error = _join_party_for_user_with_error(current_user, data.get('code'), announce=True)
    if not party:
        return jsonify({'message': error}), 403 if error == 'Party is locked' else 404
    _broadcast_party_state(party['code'])
    return jsonify({'party': party}), 200


@watch_party_bp.route('/<string:code>', methods=['GET'])
@token_required
def get_watch_party(current_user, code):
    party, error = _join_party_for_user_with_error(current_user, code)
    if not party:
        return jsonify({'message': error}), 403 if error == 'Party is locked' else 404
    return jsonify({'party': party}), 200


@watch_party_bp.route('/<string:code>', methods=['DELETE'])
@token_required
def end_watch_party(current_user, code):
    normalized_code = _normalize_code(code)
    with _party_lock:
        _cleanup_expired_locked()
        party = _parties.get(normalized_code)
        if not party:
            return jsonify({'message': 'Party not found or expired'}), 404
        if int(current_user.id) != party['leader_id']:
            return jsonify({'message': 'Only the party leader can end this party'}), 403
        connections = _connection_snapshot_locked(normalized_code)
        _parties.pop(normalized_code, None)

    _send_to_connections(normalized_code, connections, _json_message('party_ended', code=normalized_code))
    return jsonify({'message': 'Party ended'}), 200


def _handle_chat_message(party, user, data):
    settings = {**DEFAULT_PARTY_SETTINGS, **party.get('settings', {})}
    if not settings.get('chat_enabled', True):
        return None, 'Chat is disabled for this party'
    member = party['members'].get(int(user.id))
    if member and member.get('chat_muted'):
        return None, 'You are muted in this party'

    raw_message = data.get('message')
    if not isinstance(raw_message, str):
        return None, 'Message is required'
    message_text = raw_message.strip()
    if not message_text:
        return None, 'Message is required'
    if len(message_text) > MAX_CHAT_LENGTH:
        message_text = message_text[:MAX_CHAT_LENGTH]

    control_error = _check_chat_controls_locked(party, user, message_text)
    if control_error:
        return None, control_error

    message = {
        'id': uuid.uuid4().hex[:12],
        'type': 'message',
        'user_id': int(user.id),
        'username': getattr(user, 'username', f'User {user.id}'),
        'message': message_text,
        'created_at': _utc_now_iso(),
    }
    return _append_chat_item_locked(party, message), None


def _handle_reaction_message(party, user, data):
    settings = {**DEFAULT_PARTY_SETTINGS, **party.get('settings', {})}
    if not settings.get('chat_enabled', True):
        return None, 'Chat is disabled for this party'
    if not settings.get('reactions_enabled', True):
        return None, 'Reactions are disabled for this party'
    member = party['members'].get(int(user.id))
    if member and member.get('chat_muted'):
        return None, 'You are muted in this party'

    reaction = data.get('reaction')
    if reaction not in ALLOWED_REACTIONS:
        return None, 'Invalid reaction'

    control_error = _check_chat_controls_locked(party, user, f'reaction:{reaction}', check_duplicate=False)
    if control_error:
        return None, control_error

    message = {
        'id': uuid.uuid4().hex[:12],
        'type': 'reaction',
        'user_id': int(user.id),
        'username': getattr(user, 'username', f'User {user.id}'),
        'message': reaction,
        'reaction': reaction,
        'created_at': _utc_now_iso(),
    }
    return _append_chat_item_locked(party, message), None


def _handle_settings_update_message(party, user, data):
    if int(user.id) != party['leader_id']:
        return 'Only the party leader can update settings'

    incoming_settings = data.get('settings')
    if not isinstance(incoming_settings, dict):
        return 'Settings are required'

    allowed_keys = set(DEFAULT_PARTY_SETTINGS)
    next_settings = {**DEFAULT_PARTY_SETTINGS, **party.get('settings', {})}
    changed_keys = []
    for key, value in incoming_settings.items():
        if key not in allowed_keys:
            continue
        bool_value = bool(value)
        if next_settings.get(key) != bool_value:
            next_settings[key] = bool_value
            changed_keys.append(key)

    if not changed_keys:
        return 'No setting changes'

    party['settings'] = next_settings
    _append_system_message_locked(party, 'Party settings updated')
    return None


def _handle_moderation_message(party, user, data):
    if int(user.id) != party['leader_id']:
        return 'Only the party leader can moderate chat'

    action = data.get('action')
    if action not in {'mute', 'unmute', 'delete_message'}:
        return 'Invalid moderation action'

    if action in {'mute', 'unmute'}:
        try:
            target_user_id = int(data.get('target_user_id'))
        except (TypeError, ValueError):
            return 'Invalid member'

        target_member = party['members'].get(target_user_id)
        if not target_member:
            return 'Member not found'
        if target_user_id == party['leader_id']:
            return 'Cannot mute the leader'

        target_member['chat_muted'] = action == 'mute'
        target_name = target_member.get('username') or f'User {target_user_id}'
        verb = 'muted' if action == 'mute' else 'unmuted'
        _append_system_message_locked(party, f'{target_name} was {verb} in chat')
        return None

    message_id = (data.get('message_id') or '').strip()
    if not message_id:
        return 'Message is required'

    before_count = len(party['chat'])
    party['chat'] = [
        item for item in party['chat']
        if not (
            item.get('id') == message_id and
            item.get('type') in {'message', 'reaction'}
        )
    ]
    if len(party['chat']) == before_count:
        return 'Message not found'

    _append_system_message_locked(party, 'A chat message was removed')
    return None


def _handle_leader_transfer_message(party, user, data):
    if int(user.id) != party['leader_id']:
        return 'Only the party leader can transfer leadership'

    try:
        target_user_id = int(data.get('target_user_id'))
    except (TypeError, ValueError):
        return 'Invalid member'

    target_member = party['members'].get(target_user_id)
    if not target_member:
        return 'Member not found'
    if target_user_id == party['leader_id']:
        return 'This member is already the leader'
    if not target_member.get('connected'):
        return 'Member must be connected to become leader'

    old_leader = party['members'].get(party['leader_id'], {})
    old_leader_name = old_leader.get('username') or getattr(user, 'username', f'User {user.id}')
    new_leader_name = target_member.get('username') or f'User {target_user_id}'

    party['leader_id'] = target_user_id
    for member in party['members'].values():
        member['is_leader'] = member['id'] == target_user_id

    _append_system_message_locked(party, f"{old_leader_name} made {new_leader_name} the leader")
    return None


def _handle_playback_message(party, user, data):
    action = data.get('action')
    if action not in {'play', 'pause', 'seek', 'sync'}:
        return None, 'Invalid playback action'

    is_leader = int(user.id) == party['leader_id']
    if action in {'seek', 'sync'} and not is_leader:
        return None, 'Only the party leader can seek or sync playback'
    settings = {**DEFAULT_PARTY_SETTINGS, **party.get('settings', {})}
    if action in {'play', 'pause'} and not is_leader and not settings.get('members_can_control_playback', True):
        return None, 'Only the party leader can control playback'

    now = time.time()
    current_position = _current_position_locked(party, now)
    requested_position = _safe_float(data.get('position'), current_position)

    if action in {'play', 'pause'}:
        next_position = requested_position
        next_playing = action == 'play'
    elif action == 'seek':
        next_position = requested_position
        next_playing = bool(data.get('playing', party['playback'].get('playing', False)))
    else:
        next_position = requested_position
        next_playing = bool(data.get('playing', party['playback'].get('playing', True)))

    party['playback'].update({
        'position': next_position,
        'playing': next_playing,
        'updated_at': now,
        'version': int(party['playback'].get('version', 0)) + 1,
        'last_action': action,
    })
    return dict(party['playback'], position=_current_position_locked(party, now), updated_at=now), None


def _handle_watch_change_message(party, user, data):
    if int(user.id) != party['leader_id']:
        return 'Only the party leader can change the video'

    watch_id = (data.get('watch_id') or '').strip()
    if not _valid_watch_id(watch_id):
        return 'Invalid watch_id'
    if watch_id == party.get('watch_id'):
        return None

    now = time.time()
    party['watch_id'] = watch_id
    party['playback'].update({
        'position': 0.0,
        'playing': bool(data.get('playing', False)),
        'updated_at': now,
        'version': int(party['playback'].get('version', 0)) + 1,
        'last_action': 'watch_change',
    })
    _append_system_message_locked(
        party,
        f"{getattr(user, 'username', f'User {user.id}')} changed the video"
    )
    return None


def register_watch_party_socket(sock):
    global _socket_route_registered
    if _socket_route_registered:
        return
    _socket_route_registered = True

    @sock.route('/ws/<string:code>', bp=watch_party_bp)
    def watch_party_socket(ws, code):
        normalized_code = _normalize_code(code)
        conn_id = uuid.uuid4().hex
        user = None
        left_by_user = False
        try:
            raw_auth = ws.receive(timeout=10)
            auth_data = json.loads(raw_auth or '{}')
            if auth_data.get('type') != 'auth':
                ws.send(_json_message('error', message='Authentication message required'))
                ws.close()
                return

            user, auth_error = _decode_user_from_token(auth_data.get('token'))
            if auth_error:
                ws.send(_json_message('error', message='Authentication failed', error_reason=auth_error))
                ws.close()
                return

            with _party_lock:
                _cleanup_expired_locked()
                party = _parties.get(normalized_code)
                if not party:
                    ws.send(_json_message('party_expired', code=normalized_code))
                    ws.close()
                    return

                was_member = int(user.id) in party['members']
                settings = {**DEFAULT_PARTY_SETTINGS, **party.get('settings', {})}
                if settings.get('party_locked', False) and not was_member:
                    ws.send(_json_message('error', message='Party is locked'))
                    ws.close()
                    return

                _touch_party_locked(party)
                _upsert_member_locked(party, user, connected=True)
                party['connections'][conn_id] = {'ws': ws, 'user_id': int(user.id)}
                state = _serialize_party_locked(party, user.id)

            ws.send(_json_message('ready', party=state))
            _broadcast_party_state(normalized_code)

            while True:
                raw_message = ws.receive()
                if raw_message is None:
                    break

                try:
                    data = json.loads(raw_message)
                except (TypeError, json.JSONDecodeError):
                    ws.send(_json_message('error', message='Invalid JSON message'))
                    continue

                message_type = data.get('type')
                if message_type == 'heartbeat':
                    with _party_lock:
                        party = _parties.get(normalized_code)
                        if not party:
                            ws.send(_json_message('party_expired', code=normalized_code))
                            break
                        _touch_party_locked(party)
                        member = party['members'].get(int(user.id))
                        if member:
                            member['last_seen'] = time.time()
                        expires_in = _party_expires_in_locked(party)
                        last_activity = party['last_activity']
                    ws.send(_json_message('pong', expires_in=expires_in, last_activity=last_activity))
                    continue

                if message_type == 'chat':
                    with _party_lock:
                        party = _parties.get(normalized_code)
                        if not party:
                            ws.send(_json_message('party_expired', code=normalized_code))
                            break
                        _touch_party_locked(party)
                        message, error = _handle_chat_message(party, user, data)
                    if error:
                        ws.send(_json_message('error', message=error))
                    else:
                        _broadcast(normalized_code, 'chat_message', message=message)
                    continue

                if message_type == 'reaction':
                    with _party_lock:
                        party = _parties.get(normalized_code)
                        if not party:
                            ws.send(_json_message('party_expired', code=normalized_code))
                            break
                        _touch_party_locked(party)
                        message, error = _handle_reaction_message(party, user, data)
                    if error:
                        ws.send(_json_message('error', message=error))
                    else:
                        _broadcast(normalized_code, 'chat_message', message=message)
                    continue

                if message_type == 'typing':
                    is_typing = bool(data.get('typing'))
                    with _party_lock:
                        party = _parties.get(normalized_code)
                        if not party:
                            continue
                        others = [
                            (cid, record['ws'])
                            for cid, record in party.get('connections', {}).items()
                            if record['user_id'] != int(user.id)
                        ]
                    payload = _json_message(
                        'typing',
                        user_id=int(user.id),
                        username=getattr(user, 'username', f'User {user.id}'),
                        typing=is_typing
                    )
                    _send_to_connections(normalized_code, others, payload)
                    continue

                if message_type == 'leader_transfer':
                    with _party_lock:
                        party = _parties.get(normalized_code)
                        if not party:
                            ws.send(_json_message('party_expired', code=normalized_code))
                            break
                        _touch_party_locked(party)
                        error = _handle_leader_transfer_message(party, user, data)
                    if error:
                        ws.send(_json_message('error', message=error))
                    else:
                        _broadcast_party_state(normalized_code)
                    continue

                if message_type == 'party_settings':
                    with _party_lock:
                        party = _parties.get(normalized_code)
                        if not party:
                            ws.send(_json_message('party_expired', code=normalized_code))
                            break
                        _touch_party_locked(party)
                        error = _handle_settings_update_message(party, user, data)
                    if error:
                        ws.send(_json_message('error', message=error))
                    else:
                        _broadcast_party_state(normalized_code)
                    continue

                if message_type == 'watch_change':
                    with _party_lock:
                        party = _parties.get(normalized_code)
                        if not party:
                            ws.send(_json_message('party_expired', code=normalized_code))
                            break
                        _touch_party_locked(party)
                        error = _handle_watch_change_message(party, user, data)
                    if error:
                        ws.send(_json_message('error', message=error))
                    else:
                        _broadcast_party_state(normalized_code)
                    continue

                if message_type == 'playback':
                    feed_item = None
                    with _party_lock:
                        party = _parties.get(normalized_code)
                        if not party:
                            ws.send(_json_message('party_expired', code=normalized_code))
                            break
                        _touch_party_locked(party)
                        _upsert_member_locked(party, user)
                        playback, error = _handle_playback_message(party, user, data)
                        if not error:
                            feed_item = _append_playback_action_locked(
                                party,
                                user,
                                data.get('action'),
                                playback.get('position', 0.0)
                            )
                    if error:
                        ws.send(_json_message('error', message=error))
                    else:
                        _broadcast(
                            normalized_code,
                            'playback',
                            playback=playback,
                            action=data.get('action'),
                            source_user_id=int(user.id)
                        )
                        if feed_item:
                            _broadcast(normalized_code, 'chat_message', message=feed_item)
                    continue

                if message_type == 'moderation':
                    with _party_lock:
                        party = _parties.get(normalized_code)
                        if not party:
                            ws.send(_json_message('party_expired', code=normalized_code))
                            break
                        _touch_party_locked(party)
                        error = _handle_moderation_message(party, user, data)
                    if error:
                        ws.send(_json_message('error', message=error))
                    else:
                        _broadcast_party_state(normalized_code)
                    continue

                if message_type == 'kick':
                    kicked_connections_local = []
                    with _party_lock:
                        party = _parties.get(normalized_code)
                        if not party:
                            ws.send(_json_message('party_expired', code=normalized_code))
                            break
                        if int(user.id) != party['leader_id']:
                            ws.send(_json_message('error', message='Only the party leader can kick members'))
                            continue
                        try:
                            target_user_id = int(data.get('target_user_id'))
                        except (TypeError, ValueError):
                            ws.send(_json_message('error', message='Invalid member'))
                            continue
                        target_member = party['members'].get(target_user_id)
                        if not target_member:
                            ws.send(_json_message('error', message='Member not found'))
                            continue
                        if target_user_id == party['leader_id']:
                            ws.send(_json_message('error', message='Cannot kick the leader'))
                            continue
                        kicked_connections_local = [
                            (cid, record['ws'])
                            for cid, record in party.get('connections', {}).items()
                            if record['user_id'] == target_user_id
                        ]
                        for cid, _ in kicked_connections_local:
                            party.get('connections', {}).pop(cid, None)
                        target_name = target_member.get('username') or f'User {target_user_id}'
                        party['members'].pop(target_user_id, None)
                        _refresh_member_connections_locked(party)
                        _append_system_message_locked(party, f'{target_name} was kicked from the party')
                    kicked_payload = _json_message('kicked', message='You were kicked from the party')
                    for _, kicked_ws in kicked_connections_local:
                        try:
                            kicked_ws.send(kicked_payload)
                            kicked_ws.close()
                        except Exception:
                            pass
                    _broadcast_party_state(normalized_code)
                    continue

                if message_type == 'leave':
                    left_by_user = True
                    break

                ws.send(_json_message('error', message='Unknown message type'))

        except Exception:
            try:
                ws.close()
            except Exception:
                pass
        finally:
            with _party_lock:
                party = _parties.get(normalized_code)
                if party:
                    party.get('connections', {}).pop(conn_id, None)
                    if user is not None:
                        member = party['members'].get(int(user.id))
                        if member:
                            member['last_seen'] = time.time()
                    _refresh_member_connections_locked(party)
                    if left_by_user and user is not None:
                        user_has_connection = any(
                            record['user_id'] == int(user.id)
                            for record in party.get('connections', {}).values()
                        )
                        if not user_has_connection:
                            _append_system_message_locked(
                                party,
                                f"{getattr(user, 'username', f'User {user.id}')} left the party"
                            )
            _broadcast_party_state(normalized_code)
