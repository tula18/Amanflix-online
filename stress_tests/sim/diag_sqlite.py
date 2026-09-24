"""
Measure what ONE per-card watch-history lookup costs on the simulated NAS, and why.

Runs the exact query serialize_watch_history() issues for a card (api/api/utils.py) against a
copy of the DB, under slowfs, and counts file reads / injected delay per step:
  cold, warm (same connection again), after another connection commits a progress save,
  with a bigger page cache, and with an index.

    stress_tests/sim/diag_sqlite.py      (re-execs itself under slowfs)
"""

import ctypes
import os
import shutil
import sqlite3
import subprocess
import sys
import time

SIM = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(SIM, '..', '..'))
DYLIB = os.path.join(SIM, 'slowfs', 'slowfs.dylib')
SRC_DB = os.path.join(REPO, 'Data', 'instance', 'amanflix_db.db')
DB = os.path.join(SIM, 'reports', '_diag_copy.db')

if 'SLOWFS_PREFIX' not in os.environ:
    subprocess.run(['cc', '-O2', '-dynamiclib', '-o', DYLIB, os.path.join(SIM, 'slowfs', 'slowfs.c')], check=True)
    env = dict(os.environ, DYLD_INSERT_LIBRARIES=DYLIB, SLOWFS_PREFIX=REPO)
    sys.exit(subprocess.run([sys.executable, __file__], env=env).returncode)

fs = ctypes.CDLL(DYLIB)
fs.slowfs_ops.restype = fs.slowfs_delay_us.restype = fs.slowfs_bytes_read.restype = ctypes.c_uint64
READ, LOCK, OPEN, STAT = 5, 3, 0, 1

# Same SQL SQLAlchemy emits for WatchHistory.query.filter_by(user_id, content_id, content_type).first()
CARD_SQL = ('SELECT * FROM watch_history WHERE watch_history.user_id = ? AND watch_history.content_id = ? '
            'AND watch_history.content_type = ? LIMIT 1 OFFSET 0')


def measure(label, fn):
    before = [fs.slowfs_ops(i) for i in range(8)], [fs.slowfs_delay_us(i) for i in range(8)], fs.slowfs_bytes_read()
    t = time.perf_counter()
    fn()
    wall = (time.perf_counter() - t) * 1000
    ops = [fs.slowfs_ops(i) - before[0][i] for i in range(8)]
    injected = sum(fs.slowfs_delay_us(i) - before[1][i] for i in range(8)) / 1000
    mb = (fs.slowfs_bytes_read() - before[2]) / 1e6
    print(f'{label:58} {wall:8.1f} ms | page reads {ops[READ]:5d} ({mb:5.1f} MB) | locks {ops[LOCK]:3d} '
          f'| opens {ops[OPEN]} | NAS wait {injected:7.1f} ms')


shutil.copy2(SRC_DB, DB)
setup = sqlite3.connect(DB)
pages = setup.execute('PRAGMA page_count').fetchone()[0]
wh_rows = setup.execute('SELECT COUNT(*) FROM watch_history').fetchone()[0]
user_id = setup.execute("SELECT id FROM user WHERE username = 'sim_user_007'").fetchone()[0]
hit = setup.execute('SELECT content_id, content_type FROM watch_history WHERE user_id = ? LIMIT 1', (user_id,)).fetchone()
setup.close()
miss = (27205, 'movie')  # a catalog card this user never watched (the common case on Home)
print(f'DB: {pages} pages ({pages * 4 / 1024:.1f} MB), watch_history rows: {wh_rows}, default page cache ≈ 2 MB\n')

reader = sqlite3.connect(DB, check_same_thread=False)   # like one pooled connection
writer = sqlite3.connect(DB, check_same_thread=False)   # another pooled connection (a progress save)

card = lambda c, key: c.execute(CARD_SQL, (user_id, key[0], key[1])).fetchall()

print('-- no index (production today) --')
measure('card lookup, cold (card NOT in history)', lambda: card(reader, miss))
measure('same lookup again, same connection (warm?)', lambda: card(reader, miss))
measure('card lookup, card IS in history', lambda: card(reader, hit))
measure('another connection saves progress (UPDATE + COMMIT)', lambda: (
    writer.execute('UPDATE watch_history SET watch_timestamp = watch_timestamp + 1 WHERE user_id = ? '
                   'AND content_id = ?', (user_id, hit[0])), writer.commit()))
measure('card lookup right after that save', lambda: card(reader, miss))
measure('17 cards (one Home row) back to back', lambda: [card(reader, (miss[0] + i, 'movie')) for i in range(17)])

print('\n-- bigger page cache (PRAGMA cache_size = 64 MB) --')
reader.execute('PRAGMA cache_size = -65536')
measure('card lookup (fills the bigger cache)', lambda: card(reader, miss))
measure('card lookup again (warm)', lambda: card(reader, miss))
measure('another connection saves progress', lambda: (
    writer.execute('UPDATE watch_history SET watch_timestamp = watch_timestamp + 1 WHERE user_id = ? '
                   'AND content_id = ?', (user_id, hit[0])), writer.commit()))
measure('card lookup right after that save', lambda: card(reader, miss))

print('\n-- with index on watch_history(user_id, content_type, content_id) --')
measure('CREATE INDEX (one-time)', lambda: (writer.execute(
    'CREATE INDEX ix_wh_user_content ON watch_history (user_id, content_type, content_id)'), writer.commit()))
reader.execute('PRAGMA cache_size = -2000')
card(reader, miss)  # re-reads the schema so the plan below reflects the new index
print('   plan:', reader.execute('EXPLAIN QUERY PLAN ' + CARD_SQL, (1, 1, 'movie')).fetchall()[0][3])
measure('card lookup right after the index commit (cold)', lambda: card(reader, miss))
measure('17 cards (one Home row) back to back', lambda: [card(reader, (miss[0] + i, 'movie')) for i in range(17)])
measure('another connection saves progress', lambda: (
    writer.execute('UPDATE watch_history SET watch_timestamp = watch_timestamp + 1 WHERE user_id = ? '
                   'AND content_id = ?', (user_id, hit[0])), writer.commit()))
measure('card lookup right after that save', lambda: card(reader, miss))

reader.close()
writer.close()
os.remove(DB)
