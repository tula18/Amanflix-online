"""
Capture API responses for a few sim users, to prove a backend change returns the same data.

    stress_tests/venv/bin/python stress_tests/sim/parity_capture.py before --restart-per-user
    stress_tests/venv/bin/python stress_tests/sim/parity_capture.py after
    stress_tests/venv/bin/python stress_tests/sim/parity_capture.py --compare before after

Starts the backend itself (local mode, debug off) on port 5001 and only sends reads, so the DB is not
changed. Endpoints that shuffle their results (/random, discovery/random, search with random=true)
are left out; they can't be compared response for response.

--restart-per-user gives every user a fresh backend process. Use it for a baseline taken before the
shared-cache fix: without it, one user's watch history can leak into the next user's responses.
Snapshots go to stress_tests/sim/reports/parity/<label>.json.
"""

import argparse
import json
import os
import signal
import subprocess
import sys
import time

import requests

SIM_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.abspath(os.path.join(SIM_DIR, '..', '..'))
API_DIR = os.path.join(REPO_DIR, 'api')
OUT_DIR = os.path.join(SIM_DIR, 'reports', 'parity')
BASE = 'http://127.0.0.1:5001'

with open(os.path.join(SIM_DIR, 'sim_users.json')) as f:
    _users = json.load(f)

SEARCH_TERMS = ['the', 'breaking', 'office']


def start_backend(label):
    os.makedirs(OUT_DIR, exist_ok=True)
    out = open(os.path.join(OUT_DIR, f'backend-{label}.out'), 'a')
    env = dict(os.environ, AMANFLIX_DEBUG='0', PYTHONUNBUFFERED='1')
    proc = subprocess.Popen([os.path.join(API_DIR, 'venv', 'bin', 'python'), 'app.py'], cwd=API_DIR,
                            env=env, stdout=out, stderr=subprocess.STDOUT, start_new_session=True)
    deadline = time.time() + 180
    while time.time() < deadline:
        if proc.poll() is not None:
            sys.exit(f'backend exited early, see {out.name}')
        try:
            requests.get(f'{BASE}/api/service/status', timeout=2)
            return proc
        except requests.RequestException:
            time.sleep(1)
    stop_backend(proc)
    sys.exit('backend did not start within 180 s')


def stop_backend(proc):
    try:
        os.killpg(proc.pid, signal.SIGINT)
        proc.wait(timeout=30)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        os.killpg(proc.pid, signal.SIGKILL)
        proc.wait()


def get(session, path):
    r = session.get(BASE + path, timeout=120)
    try:
        body = r.json()
    except ValueError:
        body = r.text[:500]
    return {'status': r.status_code, 'body': body}


def media(item):
    return 'tv' if item.get('media_type') == 'tv' or item.get('content_type') == 'tv' \
        or 'first_air_date' in item or 'show_id' in item else 'movie'


def item_id(item):
    return item.get('show_id') or item.get('movie_id') or item.get('content_id') or item.get('id')


def capture_user(username):
    s = requests.Session()
    # Visitor queue: get a ticket like the frontend does (a capture never fills the site)
    queue = s.post(f'{BASE}/api/service/queue/check-in', json={})
    if queue.status_code == 200:
        s.headers['X-Visitor-Ticket'] = queue.json()['ticket']
    r = s.post(f'{BASE}/api/auth/login', data={'username': username, 'password': _users['password']})
    r.raise_for_status()
    s.headers['Authorization'] = f"Bearer {r.json()['api_key']}"

    paths = [
        '/api/movies?per_page=100&order=desc&reverse=true&include_watch_history=true',
        '/api/shows?per_page=100&order=desc&reverse=true&include_watch_history=true',
        '/api/discovery/new-titles?per_page=17&with_images=true&days=5&include_watch_history=true',
        '/cdn/movies?per_page=17&include_watch_history=true',
        '/cdn/tv?per_page=17&include_watch_history=true',
        '/api/watch-history/continue-watching?per_page=20',
        '/api/mylist/all?page=1&per_page=10&include_watch_history=true',
        '/api/mylist/all?page=2&per_page=10&include_watch_history=true',
        '/cdn/genres?list_type=movies',
        '/cdn/genres?list_type=tv',
        '/cdn/facets',
    ]
    for q in SEARCH_TERMS:
        paths.append(f'/cdn/auth-search?q={q}&with_images=true&include_watch_history=true&media_type=all'
                     f'&min_rating=0&max_rating=10&fuzzy=true')
        paths.append(f'/cdn/autocomplete?q={q}')
    result = {p: get(s, p) for p in paths}

    # Every title the user has history for or that is in the DB: per-title endpoints
    items = []
    for p in paths[:2] + ['/api/watch-history/continue-watching?per_page=20']:
        body = result[p]['body']
        rows = body if isinstance(body, list) else (body.get('items') or body.get('results') or []) \
            if isinstance(body, dict) else []
        items += [i for i in rows if isinstance(i, dict)]
    seen = set()
    for item in items:
        key = (media(item), item_id(item))
        if None in key or key in seen:
            continue
        seen.add(key)
        mtype, cid = key
        more = [f'/api/watch-history/current/{mtype}/{cid}',
                f'/cdn/{"movies" if mtype == "movie" else "tv"}/{cid}',
                f'/cdn/{"movies" if mtype == "movie" else "tv"}/{cid}/similar?with_images=true'
                f'&include_watch_history=true',
                f'/api/{"movies" if mtype == "movie" else "shows"}/{cid}/check']
        if mtype == 'tv':
            more.append(f'/api/watch-history/next-episode/{cid}')
        for p in more:
            result[p] = get(s, p)
    return result


def capture(label, users, restart_per_user):
    snapshot = {}
    proc = None
    try:
        # Two passes in one process catch data that leaks from one user to the next
        passes = 1 if restart_per_user else 2
        for n in range(passes):
            for username in users:
                if restart_per_user or proc is None:
                    if proc:
                        stop_backend(proc)
                    proc = start_backend(label)
                print(f'• pass {n + 1}: {username}', flush=True)
                data = capture_user(username)
                if n == 0:
                    snapshot[username] = data
                elif data != snapshot[username]:
                    changed = [p for p in data if data[p] != snapshot[username].get(p)]
                    print(f'  ✗ {username}: {len(changed)} responses changed on pass 2, e.g. {changed[:3]}')
    finally:
        if proc:
            stop_backend(proc)
    path = os.path.join(OUT_DIR, f'{label}.json')
    with open(path, 'w') as f:
        json.dump(snapshot, f, indent=1, sort_keys=True, default=str)
    total = sum(len(v) for v in snapshot.values())
    print(f'• {total} responses for {len(users)} users → {path}')


def first_diff(a, b, where=''):
    if type(a) is not type(b):
        return f'{where}: {str(a)[:120]!r} → {str(b)[:120]!r}'
    if isinstance(a, dict):
        for k in sorted(set(a) | set(b), key=str):
            if a.get(k, '<missing>') != b.get(k, '<missing>'):
                return first_diff(a.get(k, '<missing>'), b.get(k, '<missing>'), f'{where}.{k}')
    elif isinstance(a, list):
        if len(a) != len(b):
            return f'{where}: {len(a)} items → {len(b)} items'
        for i, (x, y) in enumerate(zip(a, b)):
            if x != y:
                return first_diff(x, y, f'{where}[{i}]')
    elif a != b:
        return f'{where}: {str(a)[:120]!r} → {str(b)[:120]!r}'
    return None


def compare(before_label, after_label):
    load = lambda label: json.load(open(os.path.join(OUT_DIR, f'{label}.json')))
    before, after = load(before_label), load(after_label)
    same = diff = 0
    for user in before:
        for path, resp in before[user].items():
            other = after.get(user, {}).get(path)
            if other == resp:
                same += 1
            else:
                diff += 1
                print(f'✗ {user} {path}\n    {first_diff(resp, other) if other else "missing in " + after_label}')
    print(f'\n{same} identical, {diff} different')
    return diff == 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('label', nargs='?')
    ap.add_argument('--users', type=int, default=5)
    ap.add_argument('--restart-per-user', action='store_true')
    ap.add_argument('--compare', nargs=2, metavar=('BEFORE', 'AFTER'))
    args = ap.parse_args()
    if args.compare:
        sys.exit(0 if compare(*args.compare) else 1)
    if not args.label:
        ap.error('label required')
    step = max(1, len(_users['usernames']) // args.users)
    capture(args.label, _users['usernames'][::step][:args.users], args.restart_per_user)


if __name__ == '__main__':
    main()
