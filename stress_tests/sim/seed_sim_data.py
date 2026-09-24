#!/usr/bin/env python3
"""
Seed the local DB with realistic users for the production-slowness simulation.

Run with the API venv (it has bcrypt):
    api/venv/bin/python stress_tests/sim/seed_sim_data.py            # seed 150 users
    api/venv/bin/python stress_tests/sim/seed_sim_data.py --users 200
    api/venv/bin/python stress_tests/sim/seed_sim_data.py --restore  # put the pre-sim DB back

The DB is backed up once to amanflix_db.db.pre-sim before the first change.
Seeding is idempotent: existing sim users are skipped.
"""

import argparse
import json
import os
import random
import shutil
import sqlite3
import sys
from datetime import datetime, timedelta, timezone

import bcrypt

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA_DIR = os.path.join(ROOT, 'Data')
DB_PATH = os.path.join(DATA_DIR, 'instance', 'amanflix_db.db')
BACKUP_PATH = DB_PATH + '.pre-sim'
USERS_FILE = os.path.join(os.path.dirname(__file__), 'sim_users.json')

USERNAME_PREFIX = 'sim_user_'
PASSWORD = 'simpass123'


def ts(dt):
    # Same text format SQLAlchemy uses for SQLite DateTime columns
    return dt.strftime('%Y-%m-%d %H:%M:%S.%f')


def load_catalog_ids():
    ids = {}
    for key, name in (('movie', 'movies_with_images.json'), ('tv', 'tv_with_images.json')):
        with open(os.path.join(DATA_DIR, 'files', name), encoding='utf-8') as f:
            ids[key] = [item['id'] for item in json.load(f) if item.get('id') is not None]
    return ids


def load_db_content(cur):
    movies = [r[0] for r in cur.execute('SELECT movie_id FROM movie')]
    # {show_id: [(season_number, [episode_numbers...]), ...]} ordered by season
    shows = {}
    rows = cur.execute('''
        SELECT s.tvshow_id, s.season_number, e.episode_number
        FROM season s JOIN episode e ON e.season_id = s.id
        ORDER BY s.tvshow_id, s.season_number, e.episode_number
    ''')
    for show_id, season, episode in rows:
        seasons = shows.setdefault(show_id, {})
        seasons.setdefault(season, []).append(episode)
    return movies, shows


def history_rows(user_id, rng, catalog, db_movies, db_shows, now):
    rows = []

    def add(ctype, cid, season=None, episode=None, completed=None):
        duration = rng.randint(1200, 9000)
        if completed is None:
            completed = rng.random() < 0.35
        position = int(duration * (rng.uniform(0.91, 1.0) if completed else rng.uniform(0.05, 0.89)))
        watched = now - timedelta(days=rng.uniform(0, 60))
        rows.append((
            user_id, ctype, cid, position, duration, position / duration * 100,
            season, episode, ts(watched), ts(watched + timedelta(minutes=rng.randint(1, 180))),
            1 if completed else 0,
        ))

    # Uploaded content in the DB, so the finished_show / next_episode paths run
    for movie_id in db_movies:
        if rng.random() < 0.6:
            add('movie', movie_id)
    for show_id, seasons in db_shows.items():
        if rng.random() < 0.7:
            season_list = sorted(seasons)
            watch_all = rng.random() < 0.4  # some users finished the whole show
            for season in season_list:
                for episode in seasons[season]:
                    if watch_all or rng.random() < 0.5:
                        add('tv', show_id, season, episode, completed=True if watch_all else None)

    # Catalog titles, so cards in the CDN rows also find history
    target = rng.randint(20, 80)
    while len(rows) < target:
        if rng.random() < 0.5:
            add('movie', rng.choice(catalog['movie']))
        else:
            add('tv', rng.choice(catalog['tv']), rng.randint(1, 3), rng.randint(1, 10))
    return rows


def restore():
    if not os.path.exists(BACKUP_PATH):
        sys.exit(f'No backup found at {BACKUP_PATH}')
    shutil.copy2(BACKUP_PATH, DB_PATH)
    print(f'Restored {DB_PATH} from {BACKUP_PATH}')


def seed(num_users):
    if not os.path.exists(BACKUP_PATH):
        shutil.copy2(DB_PATH, BACKUP_PATH)
        print(f'Backed up DB to {BACKUP_PATH}')

    rng = random.Random(42)
    catalog = load_catalog_ids()
    conn = sqlite3.connect(DB_PATH, timeout=30)
    cur = conn.cursor()
    db_movies, db_shows = load_db_content(cur)

    password_hash = bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt(12)).decode()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    usernames, created = [], 0
    history_total = mylist_total = 0

    for i in range(num_users):
        username = f'{USERNAME_PREFIX}{i:03d}'
        usernames.append(username)
        if cur.execute('SELECT 1 FROM user WHERE username = ?', (username,)).fetchone():
            continue

        cur.execute(
            'INSERT INTO user (username, password, is_banned, created_at) VALUES (?, ?, 0, ?)',
            (username, password_hash, ts(now)),
        )
        user_id = cur.lastrowid
        created += 1

        rows = history_rows(user_id, rng, catalog, db_movies, db_shows, now)
        cur.executemany('''
            INSERT INTO watch_history (user_id, content_type, content_id, watch_timestamp, total_duration,
                progress_percentage, season_number, episode_number, watched_at, last_watched, is_completed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', rows)
        history_total += len(rows)

        mylist = set()
        for _ in range(rng.randint(5, 30)):
            ctype = rng.choice(('movie', 'tv'))
            mylist.add((ctype, rng.choice(catalog[ctype])))
        cur.executemany(
            'INSERT INTO my_list (user_id, content_type, content_id, added_at) VALUES (?, ?, ?, ?)',
            [(user_id, ctype, cid, ts(now - timedelta(days=rng.uniform(0, 90)))) for ctype, cid in mylist],
        )
        mylist_total += len(mylist)

    conn.commit()
    counts = {t: cur.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t in ('user', 'watch_history', 'my_list')}
    conn.close()

    with open(USERS_FILE, 'w') as f:
        json.dump({'password': PASSWORD, 'usernames': usernames}, f, indent=2)

    print(f'Created {created} users ({num_users - created} already existed), '
          f'{history_total} watch_history rows, {mylist_total} my_list rows')
    print(f'DB totals: {counts}')
    print(f'Wrote {USERS_FILE}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--users', type=int, default=150)
    parser.add_argument('--restore', action='store_true', help='restore the DB from the pre-sim backup')
    args = parser.parse_args()
    restore() if args.restore else seed(args.users)
