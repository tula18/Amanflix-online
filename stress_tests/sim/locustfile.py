"""
Amanflix production-slowness simulation.

Replays what the real React frontend sends (see repo/src), for two kinds of users:
  BrowserUser - browses: Home burst, Movies/TV genre pages, search, My List, hover, modal
  ViewerUser  - watches: streams video byte ranges and saves progress every 10s

Run:
  stress_tests/venv/bin/locust -f stress_tests/sim/locustfile.py --host http://127.0.0.1:5001
  then open http://localhost:8089 (e.g. 150 users, ramp 5/s)

Env knobs:
  SIM_STREAM_MBPS      video bitrate per viewer in Mbit/s (default 5, 0 = no streaming)
  SIM_IMAGES_PER_ROW   card images the browser loads per Home row (default 17 = whole row)
  SIM_PARALLEL         parallel connections per browser (default 6, like Chrome HTTP/1.1)

Rows named "PAGE ..." are whole page loads (what a user feels), not single requests.
"""

import itertools
import json
import os
import random
import time
import uuid

import gevent
from gevent.pool import Pool
from locust import HttpUser, between, constant, events, task

SIM_DIR = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(SIM_DIR, 'sim_users.json')) as f:
    _users = json.load(f)
PASSWORD = _users['password']
_username_cycle = itertools.cycle(_users['usernames'])

STREAM_MBPS = float(os.environ.get('SIM_STREAM_MBPS', '5'))
IMAGES_PER_ROW = int(os.environ.get('SIM_IMAGES_PER_ROW', '17'))
PARALLEL = int(os.environ.get('SIM_PARALLEL', '6'))

PER_PAGE = 17  # HomePage.js: itemsPerPage * 3 - 1 on a typical desktop width
CHUNK_BYTES = 1024 * 1024

# Slider.js appends include_watch_history=true to every slider URL
HOME_SLIDERS = [
    ('Home: new-titles', f'/api/discovery/new-titles?per_page={PER_PAGE}&with_images=true&days=5'),
    ('Home: /api/movies', f'/api/movies?per_page={PER_PAGE}&order=desc&reverse=true'),
    ('Home: /api/shows', f'/api/shows?per_page={PER_PAGE}&order=desc&reverse=true'),
    ('Home: /cdn/movies/random', f'/cdn/movies/random?min_rating=8.9&with_images=true&per_page={PER_PAGE}'),
    ('Home: /cdn/tv/random', f'/cdn/tv/random?min_rating=8.9&with_images=true&per_page={PER_PAGE}'),
    ('Home: /cdn/movies', f'/cdn/movies?per_page={PER_PAGE}&include_watch_history=true'),
    ('Home: /cdn/tv', f'/cdn/tv?per_page={PER_PAGE}&include_watch_history=true'),
]

SEARCH_TERMS = ['the', 'love', 'man', 'war', 'star', 'night', 'house', 'dark', 'king', 'girl',
                'iron', 'breaking', 'friends', 'office', 'game', 'lost', 'dead', 'world']

# Uploaded content with real files in Data/uploads (movie ids / (show, season, episode))
WATCHABLE = [
    ('movie', 10138, None, None), ('movie', 157336, None, None),
    ('tv', 1400, 1, 1), ('tv', 1400, 1, 2), ('tv', 1400, 1, 3), ('tv', 1400, 1, 4),
    ('tv', 1400, 1, 5), ('tv', 1400, 2, 1), ('tv', 1416, 2, 25), ('tv', 1416, 2, 26),
    ('tv', 1416, 2, 28), ('tv', 34307, 1, 11), ('tv', 34307, 11, 1),
]


def fire_page_event(name, start, exception=None):
    events.request.fire(
        request_type='PAGE', name=name, response_time=(time.perf_counter() - start) * 1000,
        response_length=0, exception=exception, context={},
    )


def media_type(item):
    t = item.get('media_type') or item.get('content_type') or item.get('type')
    if t in ('movie', 'movies'):
        return 'movie'
    if t in ('tv', 'tv_series', 'show', 'shows'):
        return 'tv'
    return 'tv' if (item.get('first_air_date') or item.get('name') or item.get('show_id')) else 'movie'


def item_id(item):
    return item.get('id') or item.get('show_id') or item.get('movie_id')


class AmanflixUser(HttpUser):
    abstract = True

    def on_start(self):
        self.username = next(_username_cycle)
        self.token = None
        self.session_id = None
        self.etags = {}          # per-user browser cache: image path -> ETag
        self.last_items = []     # cards seen on the last page, for hover/modal

        with self.client.post('/api/auth/login', data={'username': self.username, 'password': PASSWORD},
                              name='/api/auth/login', catch_response=True) as r:
            if r.status_code != 200:
                r.failure(f'login failed {r.status_code}: run seed_sim_data.py first')
                self.stop()
                return
            self.token = r.json()['api_key']

        data = self.call('POST', '/api/analytics/sessions', json={})
        self.session_id = (data or {}).get('session_id') or str(uuid.uuid4())

    # ── request helpers ─────────────────────────────────────────
    def headers(self, extra=None):
        h = {'Authorization': f'Bearer {self.token}', 'X-Session-ID': self.session_id or ''}
        if extra:
            h.update(extra)
        return h

    def call(self, method, path, name=None, ok=(), parse=True, **kw):
        """One request. Fails on 5xx, auth errors, unexpected 4xx and 'database is locked'."""
        headers = self.headers(kw.pop('headers', None))
        with self.client.request(method, path, name=name or path.split('?')[0], headers=headers,
                                 catch_response=True, **kw) as r:
            status = r.status_code
            ctype = r.headers.get('Content-Type', '')
            text = r.text if ('json' in ctype or 'text' in ctype) else ''
            if 'database is locked' in text:
                r.failure('database is locked')
            elif status == 0:
                r.failure(f'no response: {type(r.error).__name__}: {str(r.error)[:120]}')
            elif status >= 500:
                r.failure(f'HTTP {status}')
            elif status >= 400 and status not in ok:
                r.failure(f'HTTP {status}')
            else:
                r.success()
                if parse and 'json' in ctype:
                    try:
                        return r.json()
                    except ValueError:
                        return None
            return None

    def image(self, backdrop_path):
        """Like the browser: first load is a full GET, then a conditional GET (no Cache-Control is sent)."""
        if not backdrop_path:
            return
        path = f'/cdn/images{backdrop_path}'
        extra = {'If-None-Match': self.etags[path]} if path in self.etags else None
        with self.client.get(path, name='/cdn/images/[backdrop]', headers=extra,
                             catch_response=True) as r:
            if r.status_code in (200, 304):
                if r.headers.get('ETag'):
                    self.etags[path] = r.headers['ETag']
                r.success()
            elif r.status_code == 404:
                r.success()  # the frontend falls back to unkwon_image.jpg
            elif r.status_code == 0:
                r.failure(f'no response: {type(r.error).__name__}: {str(r.error)[:120]}')
            else:
                r.failure(f'HTTP {r.status_code}')

    def parallel(self, jobs):
        pool = Pool(PARALLEL)
        greenlets = [pool.spawn(fn) for fn in jobs]
        gevent.joinall(greenlets)
        return [g.value for g in greenlets]

    # ── pages ───────────────────────────────────────────────────
    def app_shell(self):
        """App.js + Navbar + NotificationsDropdown on every full page load."""
        return [
            lambda: self.call('GET', '/api/service/status'),
            lambda: self.call('GET', '/ip'),
            lambda: self.call('GET', '/ip'),
            lambda: self.call('GET', '/api/auth/profile'),
            lambda: self.call('GET', '/api/notifications/unread/count'),
        ]

    def verify(self):
        return self.call('POST', '/api/auth/verify')

    def home(self):
        start = time.perf_counter()
        # PrivateRoute gates the page on verify; it verifies again once authenticated
        shell = self.app_shell()
        self.verify()

        def banner():
            data = self.call('GET', '/api/discovery/random?per_page=1')
            if data:
                item = data[0]
                self.call('GET', f'/api/watch-history/current/{media_type(item)}/{item_id(item)}',
                          name='/api/watch-history/current/[type]/[id]', ok=(404,))
                return [item]
            return []

        def slider(name, url):
            return lambda: self.call('GET', f'{url}&include_watch_history=true', name=name) or []

        results = self.parallel(
            shell + [self.verify, banner,
                     lambda: self.call('GET', '/api/watch-history/continue-watching?per_page=20') or []]
            + [slider(n, u) for n, u in HOME_SLIDERS]
        )
        fire_page_event('PAGE Home: rows ready', start)

        rows = [r for r in results[len(shell) + 1:] if isinstance(r, list)]
        items = [i for row in rows for i in row if isinstance(i, dict)]
        self.last_items = items or self.last_items
        images = [i.get('backdrop_path') for row in rows for i in row[:IMAGES_PER_ROW] if isinstance(i, dict)]
        self.parallel([lambda p=p: self.image(p) for p in images])
        fire_page_event('PAGE Home: images loaded', start)

    def genre_page(self, list_type):
        start = time.perf_counter()
        self.verify()
        genres = self.call('GET', f'/cdn/genres?list_type={list_type}') or []
        media = 'movies' if list_type == 'movies' else 'tv'
        rows = self.parallel([
            lambda g=g: self.call(
                'GET', f'/cdn/search?media_type={media}&random=true&with_images=true&genre={g}'
                       f'&per_page=10&include_watch_history=true',
                name=f'/cdn/search?genre=[g] ({list_type} page)') or []
            for g in genres
        ])
        fire_page_event(f'PAGE {list_type.title()}: rows ready', start)
        images = [i.get('backdrop_path') for row in rows if isinstance(row, list) for i in row[:6]]
        self.parallel([lambda p=p: self.image(p) for p in images])
        fire_page_event(f'PAGE {list_type.title()}: images loaded', start)

    # ── tasks shared by both user types ─────────────────────────
    def heartbeat(self):
        self.call('POST', '/api/analytics/heartbeat', json={'session_id': self.session_id})


class BrowserUser(AmanflixUser):
    """Someone browsing the catalog. Think time between actions like a real person."""
    weight = 4
    wait_time = between(5, 20)

    def on_start(self):
        super().on_start()
        self.home()

    @task(5)
    def open_home(self):
        self.home()

    @task(1)
    def open_movies_page(self):
        self.genre_page('movies')

    @task(1)
    def open_tv_page(self):
        self.genre_page('tv')

    @task(2)
    def search(self):
        start = time.perf_counter()
        q = random.choice(SEARCH_TERMS)
        params = (f'q={q}&with_images=true&include_watch_history=true&media_type=all'
                  f'&min_rating=0&max_rating=10&fuzzy=true')
        self.parallel([
            lambda: self.call('GET', '/cdn/facets'),
            # SearchPage starts with isLoggedIn=false: fires /cdn/search, aborts it, re-fires auth-search
            lambda: self.call('GET', f'/cdn/search?{params}', name='/cdn/search?q=[q] (pre-login race)'),
        ])
        results = self.parallel([
            lambda: self.call('GET', f'/cdn/auth-search?{params}', name='/cdn/auth-search?q=[q]'),
            lambda: self.call('GET', f'/cdn/autocomplete?q={q}', name='/cdn/autocomplete?q=[q]'),
        ])
        fire_page_event('PAGE Search: results ready', start)
        found = results[0]
        items = found.get('results', found) if isinstance(found, dict) else (found or [])
        if isinstance(items, list):
            self.parallel([lambda p=i.get('backdrop_path'): self.image(p)
                           for i in items[:18] if isinstance(i, dict)])

    @task(1)
    def my_list(self):
        start = time.perf_counter()
        self.verify()
        data = self.call('GET', '/api/mylist/all?page=1&per_page=10&include_watch_history=true')
        fire_page_event('PAGE My List: rows ready', start)
        items = data.get('items', data.get('results', [])) if isinstance(data, dict) else (data or [])
        if isinstance(items, list):
            self.parallel([lambda p=i.get('backdrop_path'): self.image(p)
                           for i in items if isinstance(i, dict)])

    @task(4)
    def hover_card(self):
        """HoverCard.js after a 400ms hover."""
        if not self.last_items:
            return
        item = random.choice(self.last_items)
        jobs = [lambda: self.call('POST', '/api/mylist/check',
                                  data={'content_type': media_type(item), 'content_id': item_id(item)})]
        if media_type(item) == 'tv':
            jobs.append(lambda: self.call('GET', f'/api/watch-history/next-episode/{item_id(item)}',
                                          name='/api/watch-history/next-episode/[id]', ok=(404,)))
        self.parallel(jobs)

    @task(2)
    def open_modal(self):
        """Model.js on click, then SimilarVideoCard.js per similar title."""
        if not self.last_items:
            return
        start = time.perf_counter()
        item = random.choice(self.last_items)
        mtype, cid = media_type(item), item_id(item)
        form = {'content_type': mtype, 'content_id': cid}
        results = self.parallel([
            lambda: self.call('POST', '/api/mylist/check', data=form),
            lambda: self.call('POST', '/api/uploadRequest/check', data=form),
            lambda: self.call('GET', f'/cdn/{"movies" if mtype == "movie" else "tv"}/{cid}/similar'
                                     f'?with_images=true&include_watch_history=true',
                              name='/cdn/[type]/[id]/similar', ok=(404,)) or [],
            lambda: self.call('GET', f'/api/{"movies" if mtype == "movie" else "shows"}/{cid}/check',
                              name='/api/[movies|shows]/[id]/check', ok=(404,)),
            lambda: self.call('GET', f'/api/watch-history/current/{mtype}/{cid}',
                              name='/api/watch-history/current/[type]/[id]', ok=(404,)),
        ])
        fire_page_event('PAGE Modal: open', start)
        similar = results[2] if isinstance(results[2], list) else []
        jobs = []
        for s in similar[:12]:
            if not isinstance(s, dict):
                continue
            jobs += [
                lambda s=s: self.call('POST', '/api/mylist/check',
                                      data={'content_type': media_type(s), 'content_id': item_id(s)}),
                lambda s=s: self.call('GET', f'/api/movies/{item_id(s)}/check',
                                      name='/api/[movies|shows]/[id]/check', ok=(404,)),
                lambda s=s: self.image(s.get('backdrop_path')),
            ]
        self.parallel(jobs)

    @task(1)
    def keep_alive(self):
        self.heartbeat()


class ViewerUser(AmanflixUser):
    """Someone watching: video byte ranges at a steady bitrate + progress save every 10s."""
    weight = 6
    wait_time = constant(0)

    def on_start(self):
        super().on_start()
        self.last_heartbeat = time.monotonic()
        # Most viewers arrive through Home before pressing play
        if random.random() < 0.5:
            self.home()

    @task
    def watch_session(self):
        ctype, cid, season, episode = random.choice(WATCHABLE)
        watch_id = f'm-{cid}' if ctype == 'movie' else f't-{cid}-{season}-{episode}'
        self.call('GET', f'/api/stream/can-watch/{watch_id}', name='/api/stream/can-watch/[id]')
        self.call('GET', f'/api/watch-history/current/{ctype}/{cid}',
                  name='/api/watch-history/current/[type]/[id]', ok=(404,))

        duration = 2700
        position = random.uniform(10, duration * 0.5)
        offset = random.randint(0, 50) * CHUNK_BYTES
        seconds_per_chunk = (CHUNK_BYTES * 8 / (STREAM_MBPS * 1_000_000)) if STREAM_MBPS > 0 else None
        watch_for = random.uniform(10 * 60, 30 * 60)
        started = last_save = time.monotonic()

        while time.monotonic() - started < watch_for:
            tick = time.monotonic()
            if seconds_per_chunk:
                offset = self.stream_chunk(watch_id, offset)
            if time.monotonic() - last_save >= 10:
                position += time.monotonic() - last_save
                last_save = time.monotonic()
                payload = {'content_type': ctype, 'content_id': cid,
                           'watch_timestamp': position, 'total_duration': duration}
                if ctype == 'tv':
                    payload.update(season_number=season, episode_number=episode)
                self.call('POST', '/api/watch-history/update', json=payload)
            if time.monotonic() - self.last_heartbeat >= 300:
                self.last_heartbeat = time.monotonic()
                self.heartbeat()
            gevent.sleep(max(0.0, (seconds_per_chunk or 10) - (time.monotonic() - tick)))

        # Back to browsing for the next title
        if random.random() < 0.3:
            self.home()

    def stream_chunk(self, watch_id, offset):
        with self.client.get(f'/api/stream/{watch_id}', name='/api/stream/[id] (1MB range)',
                             headers={'Range': f'bytes={offset}-{offset + CHUNK_BYTES - 1}'},
                             catch_response=True, stream=True) as r:
            if r.status_code == 416:
                r.success()
                return 0  # past the end of the file: start over
            if r.status_code == 0:
                r.failure(f'no response: {type(r.error).__name__}: {str(r.error)[:120]}')
                return offset
            if r.status_code not in (200, 206):
                r.failure(f'HTTP {r.status_code}')
                return offset
            read = 0
            for block in r.iter_content(64 * 1024):
                read += len(block)
                if read >= CHUNK_BYTES:  # never pull a whole file if Range was ignored
                    break
            r.success()
            # Content-Range: bytes start-end/total -> wrap to the start like a rewatch, never past EOF
            total = r.headers.get('Content-Range', '').rpartition('/')[2]
        nxt = offset + CHUNK_BYTES
        return 0 if total.isdigit() and nxt >= int(total) else nxt
