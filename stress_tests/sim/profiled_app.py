"""
Run api/app.py with diagnostics attached (no sudo, no changes to the app):

1. Per-endpoint accounting (Flask signals + SQLAlchemy events + patched pool/logging):
   wall time p50/p95, CPU time of the request thread, SQL statements and SQL time,
   time waiting for a pooled DB connection, log records and time spent logging.
2. Top SQL statements by total time, keyed by the Amanflix line that issued them.
3. A sampling profiler over in-flight request threads (what they are doing right now).
4. Process CPU use and "stalls": moments where the sampler itself could not run for >100ms.

Writes SIM_PROFILE_OUT every 5s. run_backend.sh uses this when PROFILE=1:
    cd api && python ../stress_tests/sim/profiled_app.py
"""

import builtins
import collections
import logging
import os
import resource
import runpy
import sys
import threading
import time

API_DIR = os.getcwd()
INTERVAL = float(os.environ.get('SIM_PROFILE_INTERVAL', '0.05'))
OUT = os.environ.get('SIM_PROFILE_OUT', os.path.join(API_DIR, 'profile.txt'))
WINDOW = 10.0
STALL_MS = 100

_local = threading.local()
_lock = threading.Lock()


def app_frame(frame):
    """Innermost frame in Amanflix code (api/, not the venv)."""
    while frame is not None:
        path = frame.f_code.co_filename
        if path.startswith(API_DIR) and '/venv/' not in path:
            return f'{frame.f_code.co_name} ({os.path.relpath(path, API_DIR)}:{frame.f_lineno})'
        frame = frame.f_back
    return '(no app frame)'


# ── 1. per-request accounting ──────────────────────────────────────
class Endpoint:
    __slots__ = ('walls', 'cpu', 'sql_n', 'sql_ms', 'pool_ms', 'log_n', 'log_ms', 'errors')

    def __init__(self):
        self.walls = []
        self.cpu = self.sql_n = self.sql_ms = self.pool_ms = self.log_n = self.log_ms = self.errors = 0


endpoints = collections.defaultdict(Endpoint)
sql_stats = collections.defaultdict(lambda: [0, 0.0, 0.0])  # key -> [count, total ms, max ms]
pool_state = {'max_checked_out': 0, 'waits_over_1s': 0, 'timeouts': 0}


def current():
    return getattr(_local, 'req', None)


def on_request_started(sender, **_):
    _local.req = {'t0': time.perf_counter(), 'cpu0': time.thread_time(),
                  'sql_n': 0, 'sql_ms': 0.0, 'pool_ms': 0.0, 'log_n': 0, 'log_ms': 0.0, 'error': False}


def on_exception(sender, exception=None, **_):
    st = current()
    if st:
        st['error'] = True


def on_teardown(sender, **_):
    st = current()
    if not st:
        return
    _local.req = None
    from flask import request
    name = f'{request.method} {request.url_rule.rule if request.url_rule else request.path}'
    wall = (time.perf_counter() - st['t0']) * 1000
    cpu = (time.thread_time() - st['cpu0']) * 1000
    with _lock:
        e = endpoints[name]
        e.walls.append(wall)
        e.cpu += cpu
        e.sql_n += st['sql_n']
        e.sql_ms += st['sql_ms']
        e.pool_ms += st['pool_ms']
        e.log_n += st['log_n']
        e.log_ms += st['log_ms']
        e.errors += st['error']


def install_hooks():
    import flask
    from sqlalchemy import event
    from sqlalchemy.engine import Engine
    from sqlalchemy.pool import QueuePool

    flask.request_started.connect(on_request_started, weak=False)
    flask.got_request_exception.connect(on_exception, weak=False)
    flask.request_tearing_down.connect(on_teardown, weak=False)

    @event.listens_for(Engine, 'before_cursor_execute')
    def _before(conn, cursor, statement, params, context, executemany):
        conn.info.setdefault('_diag_t', []).append(time.perf_counter())

    @event.listens_for(Engine, 'after_cursor_execute')
    def _after(conn, cursor, statement, params, context, executemany):
        ms = (time.perf_counter() - conn.info['_diag_t'].pop()) * 1000
        key = (' '.join(statement.split())[:110], app_frame(sys._getframe(1)))
        with _lock:
            s = sql_stats[key]
            s[0] += 1
            s[1] += ms
            s[2] = max(s[2], ms)
        st = current()
        if st:
            st['sql_n'] += 1
            st['sql_ms'] += ms

    original_do_get = QueuePool._do_get

    def timed_do_get(self):
        t = time.perf_counter()
        try:
            return original_do_get(self)
        except Exception:
            pool_state['timeouts'] += 1
            raise
        finally:
            ms = (time.perf_counter() - t) * 1000
            pool_state['max_checked_out'] = max(pool_state['max_checked_out'], self.checkedout())
            if ms > 1000:
                pool_state['waits_over_1s'] += 1
            st = current()
            if st:
                st['pool_ms'] += ms

    QueuePool._do_get = timed_do_get

    original_handle = logging.Handler.handle

    def timed_handle(self, record):
        t = time.perf_counter()
        try:
            return original_handle(self, record)
        finally:
            st = current()
            if st:
                st['log_n'] += 1
                st['log_ms'] += (time.perf_counter() - t) * 1000

    logging.Handler.handle = timed_handle

    original_print = builtins.print

    def timed_print(*args, **kwargs):
        t = time.perf_counter()
        try:
            return original_print(*args, **kwargs)
        finally:
            st = current()
            if st:
                st['log_ms'] += (time.perf_counter() - t) * 1000

    builtins.print = timed_print


# ── 3/4. sampling profiler + stall detector ────────────────────────
CATEGORIES = [
    ('logging (file/console writes)', ('/logging/', 'utils/logger.py')),
    ('waiting for a DB connection (pool)', ('sqlalchemy/pool/', 'sqlalchemy/util/queue.py')),
    ('sqlite / SQLAlchemy', ('/sqlalchemy/', 'sqlite3')),
    ('copy.deepcopy (catalog cache)', ('/copy.py',)),
    ('json encode/decode', ('/json/', 'flask/json')),
    ('send_file / file read', ('werkzeug/wsgi.py', 'werkzeug/utils.py')),
    ('random / shuffle', ('/random.py',)),
    ('socket / response write', ('/socket.py', 'socketserver.py')),
]


def categorize(frames):
    for frame in frames:  # innermost first
        path = frame.f_code.co_filename
        for name, markers in CATEGORIES:
            if any(m in path for m in markers):
                return name
    return 'other Python (app logic, CPU)'


class Sampler:
    def __init__(self):
        self.total = {k: collections.Counter() for k in ('cat', 'app')}
        self.recent = collections.deque()
        self.active_hist = collections.deque()
        self.stalls = []  # (time, ms, top app frames)
        self.stall_frames = collections.Counter()
        self.me = None
        self.cpu_hist = collections.deque()

    def sample(self, late_ms):
        now = time.monotonic()
        active, running = 0, []
        for tid, frame in sys._current_frames().items():
            if tid == self.me:
                continue
            frames = []
            f = frame
            while f is not None:
                frames.append(f)
                f = f.f_back
            if not any(fr.f_code.co_name == 'run_wsgi' for fr in frames):
                continue
            active += 1
            cat = categorize(frames)
            app = app_frame(frame)
            self.total['cat'][cat] += 1
            self.total['app'][app] += 1
            self.recent.append((now, cat, app))
            if cat.startswith(('other Python', 'copy', 'json', 'random')):
                running.append(app)
        self.active_hist.append((now, active))
        if late_ms > STALL_MS:
            # The GIL was held elsewhere; the CPU-bound frames right now are the suspects
            self.stalls.append((time.strftime('%H:%M:%S'), late_ms, collections.Counter(running).most_common(3)))
            for app in set(running):
                self.stall_frames[app] += 1
        while self.recent and now - self.recent[0][0] > WINDOW:
            self.recent.popleft()
        while self.active_hist and now - self.active_hist[0][0] > WINDOW:
            self.active_hist.popleft()

    def run(self):
        self.me = threading.get_ident()
        last_write = last_cpu_t = time.monotonic()
        ru = resource.getrusage(resource.RUSAGE_SELF)
        last_cpu = ru.ru_utime + ru.ru_stime
        while True:
            t = time.monotonic()
            time.sleep(INTERVAL)
            late_ms = (time.monotonic() - t - INTERVAL) * 1000
            try:
                self.sample(late_ms)
            except Exception:
                pass
            if time.monotonic() - last_write >= 5:
                ru = resource.getrusage(resource.RUSAGE_SELF)
                cpu = ru.ru_utime + ru.ru_stime
                self.cpu_hist.append(100 * (cpu - last_cpu) / (time.monotonic() - last_cpu_t))
                last_cpu, last_cpu_t = cpu, time.monotonic()
                last_write = time.monotonic()
                try:
                    self.write()
                except Exception as exc:  # never take the server down
                    sys.stderr.write(f'profiler write failed: {exc}\n')

    def write(self):
        def pct_table(counter, n):
            total = sum(counter.values()) or 1
            return [f'  {100 * c / total:5.1f}%  {name}' for name, c in counter.most_common(n)]

        with _lock:
            eps = {k: (sorted(v.walls), v.cpu, v.sql_n, v.sql_ms, v.pool_ms, v.log_n, v.log_ms, v.errors)
                   for k, v in endpoints.items()}
            sqls = sorted(sql_stats.items(), key=lambda kv: -kv[1][1])[:25]

        lines = [f'Amanflix diagnostics  {time.strftime("%H:%M:%S")}   process CPU last 5s: '
                 f'{self.cpu_hist[-1] if self.cpu_hist else 0:.0f}% of one core   '
                 f'DB pool: max checked out {pool_state["max_checked_out"]}, waits >1s {pool_state["waits_over_1s"]}, '
                 f'timeouts {pool_state["timeouts"]}', '']

        lines.append('== PER ENDPOINT (whole run; averages per request) ==')
        lines.append(f'{"endpoint":52} {"n":>6} {"p50":>7} {"p95":>7} {"cpu":>6} {"sql#":>6} {"sql ms":>7} '
                     f'{"pool":>6} {"log#":>5} {"log ms":>6} {"err":>4} {"CPU share":>9}')
        total_cpu = sum(v[1] for v in eps.values()) or 1
        for name, (walls, cpu, sql_n, sql_ms, pool_ms, log_n, log_ms, errs) in sorted(
                eps.items(), key=lambda kv: -kv[1][0][int(len(kv[1][0]) * 0.95)] if kv[1][0] else 0):
            n = len(walls) or 1
            p = lambda q: walls[min(int(len(walls) * q), len(walls) - 1)] if walls else 0
            lines.append(f'{name[:52]:52} {len(walls):6d} {p(.5):7.0f} {p(.95):7.0f} {cpu / n:6.1f} {sql_n / n:6.1f} '
                         f'{sql_ms / n:7.1f} {pool_ms / n:6.0f} {log_n / n:5.1f} {log_ms / n:6.1f} {errs:4d} '
                         f'{100 * cpu / total_cpu:8.1f}%')
        lines += ['', '  (ms; cpu = CPU time of the request thread; pool = waiting for a DB connection; '
                      'CPU share = share of all request CPU)', '']

        lines.append('== TOP SQL BY TOTAL TIME (statement | issued from) ==')
        for (stmt, caller), (count, total, mx) in sqls:
            lines.append(f'  {total / 1000:8.1f}s  n={count:6d}  avg {total / count:7.1f}ms  max {mx:7.0f}ms  {caller}')
            lines.append(f'            {stmt}')
        lines.append('')

        recent = {k: collections.Counter() for k in ('cat', 'app')}
        for _, cat, app in list(self.recent):
            recent['cat'][cat] += 1
            recent['app'][app] += 1
        hist = [a for _, a in list(self.active_hist)]
        lines += [
            f'== SAMPLED: what in-flight requests are doing (last {WINDOW:.0f}s; requests in flight avg '
            f'{sum(hist) / max(len(hist), 1):.1f}, max {max(hist, default=0)}) ==',
            *pct_table(recent['cat'], 9), '', '-- innermost Amanflix frame, last 10s --', *pct_table(recent['app'], 12),
            '', '== SAMPLED, WHOLE RUN ==', *pct_table(self.total['cat'], 9),
            '', '-- innermost Amanflix frame, whole run --', *pct_table(self.total['app'], 20), '',
            f'== STALLS: sampler blocked >{STALL_MS}ms ({len(self.stalls)} so far); CPU-bound frames at that moment ==',
            *[f'  {n:4d}x  {app}' for app, n in self.stall_frames.most_common(12)],
            '  last stalls:', *[f'    {t}  {ms:6.0f}ms  {top}' for t, ms, top in self.stalls[-8:]],
        ]
        tmp = OUT + '.tmp'
        with open(tmp, 'w') as f:
            f.write('\n'.join(lines) + '\n')
        os.replace(tmp, OUT)


sys.path.insert(0, API_DIR)
install_hooks()
threading.Thread(target=Sampler().run, name='sim-profiler', daemon=True).start()
sys.argv = [os.path.join(API_DIR, 'app.py')]
runpy.run_path(os.path.join(API_DIR, 'app.py'), run_name='__main__')
