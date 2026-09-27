"""
Visitor limit with a waiting queue.

At most `max_visitors` browsers use the site at once (the limit is set by a superadmin on the
Service Control page and stored with the other service settings). Everyone else waits in line,
sees their position and an estimated wait, and gets in automatically when a slot frees.

A visitor is a ticket: a random id kept in the browser's localStorage, so all tabs of one browser
share one slot. Browsers check in regularly (POST /api/service/queue/check-in):
- An admitted visitor who stops checking in (every tab closed) loses the slot after TAB_TIMEOUT.
- An admitted visitor with no activity (no input, no video playing) for IDLE_TIMEOUT goes back to
  the end of the line, but only when someone is waiting for the slot.
- A waiting visitor who stops checking in leaves the line after WAITING_TIMEOUT, or at once when
  the waiting page is closed (POST /api/service/queue/leave).

Admins never wait and never take a slot: their check-in (with the admin token) gets an admin ticket
that lets every request through. State is kept in memory: the app runs as a single process.
"""

import re
import secrets
import threading
import time
from collections import OrderedDict, deque

# Chrome runs timers in tabs hidden for 5+ minutes about once a minute, so these leave room for
# a background tab's check-ins to arrive late without losing its place
TAB_TIMEOUT = 120
WAITING_TIMEOUT = 120
IDLE_TIMEOUT = 15 * 60
# A spot given up by closing the waiting page is kept this long, because a page refresh also
# sends the leave: checking in again within it keeps the place in line
LEAVE_GRACE = 10

# How often browsers should check in (returned as next_check_seconds)
ADMITTED_CHECK_SECONDS = 20
WAITING_CHECK_SECONDS = 5          # near the front of the line
WAITING_CHECK_SECONDS_FAR = 10     # further back, to keep the polling cheap
NEAR_FRONT = 20

# Estimated wait before enough slots have freed up to measure how fast the line moves
DEFAULT_VISIT_SECONDS = 30 * 60
MIN_RELEASES_FOR_RATE = 5

_TICKET_PATTERN = re.compile(r'^[A-Za-z0-9_-]{16,64}$')


class VisitorQueue:
    def __init__(self, get_settings, clock=time.time):
        """
        Args:
            get_settings: Function returning (enabled, max_visitors)
            clock: Function returning the current time in seconds (replaceable in tests)
        """
        self._get_settings = get_settings
        self._clock = clock
        self._lock = threading.Lock()
        self._active = OrderedDict()   # ticket -> {'last_seen', 'last_activity', 'admitted_at'}
        self._waiting = OrderedDict()  # ticket -> {'joined_at', 'last_seen', 'last_activity', 'reason'}
        self._admins = {}              # admin tickets (not counted) -> last_seen
        self._releases = deque(maxlen=30)       # when slots were freed, for the wait estimate
        self._visit_lengths = deque(maxlen=50)  # how long recent visitors kept their slot
        self._admitted_times = deque()          # admissions in the last hour (admin stats)
        self._released_times = deque()          # releases in the last hour (admin stats)

    # ── public ────────────────────────────────────────────────────────────

    def check_in(self, ticket=None, idle_seconds=0, is_admin=False):
        """
        Join the line, or report that this browser is still here.

        Args:
            ticket: The browser's ticket, or None for a new visitor
            idle_seconds: Seconds since the last user activity (input or video playing) in the tab
            is_admin: The check-in came with a valid admin token: admitted without taking a slot

        Returns:
            dict: {'status': 'admitted'|'waiting', 'ticket', 'position', 'ahead', 'queue_length',
                   'eta_seconds', 'next_check_seconds', 'reason'}
        """
        now = self._clock()
        enabled, limit = self._get_settings()
        idle = _clamp_idle(idle_seconds)

        with self._lock:
            if not _valid_ticket(ticket):
                ticket = secrets.token_urlsafe(18)

            if is_admin:
                # Give up any visitor slot or place in line this browser had
                if ticket in self._active:
                    self._release(ticket, now)
                self._waiting.pop(ticket, None)
                self._admins[ticket] = now
                self._sweep(now, enabled, limit)
                return self._admitted_response(ticket)
            self._admins.pop(ticket, None)

            # Record this check-in before sweeping, so a visitor who just came back isn't released
            entry = self._active.get(ticket)
            if entry is not None:
                entry['last_seen'] = now
                entry['last_activity'] = max(entry['last_activity'], now - idle)
            elif ticket in self._waiting:
                waiting_entry = self._waiting[ticket]
                waiting_entry['last_seen'] = now
                waiting_entry.pop('left_at', None)
                waiting_entry['last_activity'] = max(waiting_entry['last_activity'], now - idle)

            self._sweep(now, enabled, limit)

            if ticket not in self._active and ticket not in self._waiting:
                # A new visitor, or one whose ticket was forgotten (restart): straight in if
                # there is room and nobody is ahead
                if not self._line(now) and self._has_room(enabled, limit):
                    self._admit(ticket, now, idle)
                else:
                    self._waiting[ticket] = {'joined_at': now, 'last_seen': now,
                                             'last_activity': now - idle, 'reason': None}

            if ticket in self._active:
                return self._admitted_response(ticket)
            return self._waiting_response(ticket, now, limit)

    def leave(self, ticket):
        """Leave the line (the waiting page was closed or refreshed; see LEAVE_GRACE)."""
        with self._lock:
            entry = self._waiting.get(ticket)
            if entry is not None:
                entry['left_at'] = self._clock()

    def is_admitted(self, ticket):
        """Whether a request with this ticket may use the site. Also counts as a sign of life."""
        enabled, limit = self._get_settings()
        if not enabled:
            return True
        if not _valid_ticket(ticket):
            return False
        with self._lock:
            now = self._clock()
            if ticket in self._admins:
                self._admins[ticket] = max(self._admins[ticket], now)
                return True
            entry = self._active.get(ticket)
            if entry is None:
                return False
            entry['last_seen'] = max(entry['last_seen'], now)
            return True

    def stats(self):
        """Numbers for the admin dashboard."""
        now = self._clock()
        enabled, limit = self._get_settings()
        with self._lock:
            self._sweep(now, enabled, limit)
            return {
                'enabled': enabled,
                'limit': limit,
                'active': len(self._active),
                'waiting': len(self._line(now)),
                'eta_for_next_seconds': round(self._seconds_per_slot(now, limit)) if self._line(now) else 0,
                'admitted_last_hour': len(self._admitted_times),
                'released_last_hour': len(self._released_times),
            }

    # ── internals (called with the lock held) ─────────────────────────────

    def _sweep(self, now, enabled, limit):
        for ticket, entry in list(self._active.items()):
            if now - entry['last_seen'] > TAB_TIMEOUT:
                self._release(ticket, now)
        for ticket, last_seen in list(self._admins.items()):
            if now - last_seen > TAB_TIMEOUT:
                del self._admins[ticket]
        for ticket, entry in list(self._waiting.items()):
            if now - entry['last_seen'] > WAITING_TIMEOUT or now - entry.get('left_at', now) > LEAVE_GRACE:
                del self._waiting[ticket]

        # Idle visitors give up their slot only to people who are waiting for one: at most as many
        # as are waiting beyond the free slots, longest idle first. They go to the end of the line.
        if enabled:
            present = sum(1 for entry in self._waiting.values()
                          if 'left_at' not in entry and not self._is_idle(entry, now))
            needed = present - max(limit - len(self._active), 0)
            idle = sorted((entry['last_activity'], ticket) for ticket, entry in self._active.items()
                          if self._is_idle(entry, now))
            for _, ticket in idle[:max(needed, 0)]:
                entry = self._active[ticket]
                self._release(ticket, now)
                self._waiting[ticket] = {'joined_at': now, 'last_seen': entry['last_seen'],
                                         'last_activity': entry['last_activity'], 'reason': 'idle'}

        self._promote(now, enabled, limit)
        for times in (self._admitted_times, self._released_times):
            while times and now - times[0] > 3600:
                times.popleft()

    def _has_room(self, enabled, limit):
        return not enabled or len(self._active) < limit

    @staticmethod
    def _is_idle(entry, now):
        return now - entry['last_activity'] >= IDLE_TIMEOUT

    def _line(self, now):
        """Waiting tickets in the order they get in: people who are there, then idle ones."""
        here = [(t, e) for t, e in self._waiting.items() if 'left_at' not in e]
        present = [t for t, e in here if not self._is_idle(e, now)]
        idle = [t for t, e in here if self._is_idle(e, now)]
        return present + idle

    def _promote(self, now, enabled, limit):
        for ticket in self._line(now):
            if not self._has_room(enabled, limit):
                break
            entry = self._waiting.pop(ticket)
            # Counts as seen now: if the visitor already left, the slot frees after TAB_TIMEOUT
            self._admit(ticket, now, 0, last_seen=max(entry['last_seen'], now))
            self._active[ticket]['last_activity'] = entry['last_activity']

    def _admit(self, ticket, now, idle, last_seen=None):
        self._active[ticket] = {'last_seen': last_seen or now, 'last_activity': now - idle,
                                'admitted_at': now}
        self._admitted_times.append(now)

    def _release(self, ticket, now):
        entry = self._active.pop(ticket)
        self._releases.append(now)
        self._released_times.append(now)
        self._visit_lengths.append(now - entry['admitted_at'])

    def _seconds_per_slot(self, now, limit):
        """How long, on average, until the next slot frees up."""
        recent = [t for t in self._releases if now - t <= 3600]
        if len(recent) >= MIN_RELEASES_FOR_RATE:
            return max((now - recent[0]) / len(recent), 1)
        visit = (sum(self._visit_lengths) / len(self._visit_lengths)) if self._visit_lengths \
            else DEFAULT_VISIT_SECONDS
        return max(visit / max(limit, 1), 1)

    def _admitted_response(self, ticket):
        return {'status': 'admitted', 'ticket': ticket, 'position': 0, 'ahead': 0,
                'queue_length': sum(1 for e in self._waiting.values() if 'left_at' not in e), 'eta_seconds': 0,
                'next_check_seconds': ADMITTED_CHECK_SECONDS, 'reason': None}

    def _waiting_response(self, ticket, now, limit):
        position = self._line(now).index(ticket) + 1
        return {'status': 'waiting', 'ticket': ticket, 'position': position, 'ahead': position - 1,
                'queue_length': len(self._line(now)),
                'eta_seconds': round(position * self._seconds_per_slot(now, limit)),
                'next_check_seconds': WAITING_CHECK_SECONDS if position <= NEAR_FRONT
                else WAITING_CHECK_SECONDS_FAR,
                'reason': self._waiting[ticket]['reason']}


def _valid_ticket(ticket):
    return isinstance(ticket, str) and bool(_TICKET_PATTERN.match(ticket))


def _clamp_idle(idle_seconds):
    try:
        return min(max(float(idle_seconds or 0), 0), 24 * 3600)
    except (TypeError, ValueError):
        return 0


def _settings_from_service_config():
    from api.service_controller import get_service_config
    config = get_service_config()
    try:
        limit = max(int(config.get('max_visitors') or 0), 1)
    except (TypeError, ValueError):
        limit = 150
    return bool(config.get('visitor_limit_enabled')), limit


# The queue the app uses
visitor_queue = VisitorQueue(_settings_from_service_config)


# Requests not checked: the queue itself (/api/service/), admin and analytics endpoints, and
# requests that can't carry a header (poster images, video streams, the watch-party socket)
QUEUE_EXEMPT_PREFIXES = (
    '/api/service/',
    '/api/admin/',
    '/api/analytics/',
    '/cdn/images/',
    '/api/stream/',
    '/api/watch-party/ws/',
)


def is_admin_request(request):
    """Whether the request carries a valid token of an existing, enabled admin."""
    import jwt
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        return False
    try:
        data = jwt.decode(auth[7:].strip(), 'test', algorithms=['HS256'])
    except jwt.PyJWTError:
        return False
    # A user token has no role; its id could match an admin's, so the id alone isn't enough
    if 'role' not in data:
        return False
    from api.cache import get_cached_admin
    admin = get_cached_admin(data['sub'])
    return admin is not None and not admin.disabled


def install_visitor_gate(app, queue=None):
    """Turn away /api/ and /cdn/ requests unless they carry the ticket of an admitted visitor."""
    from flask import jsonify, request

    queue = queue or visitor_queue

    @app.before_request
    def check_visitor_queue():
        path = request.path
        if request.method == 'OPTIONS' or not (path.startswith('/api/') or path.startswith('/cdn/')):
            return None
        if path.startswith(QUEUE_EXEMPT_PREFIXES):
            return None
        if queue.is_admitted(request.headers.get('X-Visitor-Ticket')):
            return None
        if is_admin_request(request):
            return None
        return jsonify({
            'error': 'queue_required',
            'error_reason': 'queue_required',
            'message': 'The site is full right now. You are in line and will get in automatically.'
        }), 503
