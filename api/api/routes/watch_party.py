from flask import Blueprint, jsonify, request
import json
import random
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
PARTY_CODE_LENGTH = 6
CODE_ALPHABET = ''.join(ch for ch in string.ascii_uppercase + string.digits if ch not in '0O1I')
ALLOWED_REACTIONS = {'👍', '😂', '❤️', '😮', '🔥', '👏'}

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

    return {
        'code': party['code'],
        'watch_id': party['watch_id'],
        'leader_id': party['leader_id'],
        'current_user_id': int(current_user_id) if current_user_id is not None else None,
        'is_leader': bool(current_member and current_member.get('is_leader')),
        'members': members,
        'playback': playback,
        'chat': list(party['chat']),
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


def _join_party_for_user(user, code, announce=False):
    normalized_code = _normalize_code(code)
    with _party_lock:
        _cleanup_expired_locked()
        party = _parties.get(normalized_code)
        if not party:
            return None
        _touch_party_locked(party)
        was_member = int(user.id) in party['members']
        _upsert_member_locked(party, user)
        if announce and not was_member:
            _append_system_message_locked(
                party,
                f"{getattr(user, 'username', f'User {user.id}')} joined the party"
            )
        return _serialize_party_locked(party, user.id)


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
    party = _join_party_for_user(current_user, data.get('code'), announce=True)
    if not party:
        return jsonify({'message': 'Party not found or expired'}), 404
    _broadcast_party_state(party['code'])
    return jsonify({'party': party}), 200


@watch_party_bp.route('/<string:code>', methods=['GET'])
@token_required
def get_watch_party(current_user, code):
    party = _join_party_for_user(current_user, code)
    if not party:
        return jsonify({'message': 'Party not found or expired'}), 404
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
    raw_message = data.get('message')
    if not isinstance(raw_message, str):
        return None, 'Message is required'
    message_text = raw_message.strip()
    if not message_text:
        return None, 'Message is required'
    if len(message_text) > MAX_CHAT_LENGTH:
        message_text = message_text[:MAX_CHAT_LENGTH]

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
    reaction = data.get('reaction')
    if reaction not in ALLOWED_REACTIONS:
        return None, 'Invalid reaction'

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

                if message_type == 'playback':
                    with _party_lock:
                        party = _parties.get(normalized_code)
                        if not party:
                            ws.send(_json_message('party_expired', code=normalized_code))
                            break
                        _touch_party_locked(party)
                        _upsert_member_locked(party, user)
                        playback, error = _handle_playback_message(party, user, data)
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
