# Production-slowness simulation

Reproduces the production slowness on a developer Mac: card rows and pages take seconds to load while
video plays fine. Production is an HP mini running `py app.py` (Flask dev server, debug off). Its code,
SQLite DB, logs, posters and videos all sit on a NAS over SMB, capped at about 100 MB/s, with 110–150
concurrent users at peak.

The simulation runs the real backend (unchanged) under 150 simulated users and measures every page,
endpoint and SQL statement. It can run the backend in two modes:

- **`local`**: code and `Data/` on the Mac's SSD. Shows CPU and locking problems with no NAS involved.
- **`slowfs`**: the same backend, but every file operation under the repo pays NAS costs
  (a network round trip per request, a shared 100 MB/s link). No root needed.

Nothing is copied, and production is never touched.

---

## Quick start

Run everything from the repo root. Before you start:
- plug in the charger and keep the lid open (a sleeping Mac invalidates a run);
- stop your dev backend, since the simulation needs port 5001.

```bash
# One time: 150 test users with watch history and My List (backs up the DB first)
api/venv/bin/python stress_tests/sim/seed_sim_data.py
# (on a new machine, first: python3 -m venv stress_tests/venv && stress_tests/venv/bin/pip install -r stress_tests/requirements.txt)

# Run A: local disk, 150 users, 5 minutes. Watch live at http://localhost:8089
PROFILE=1 stress_tests/sim/run_experiment.sh local A-mine 5

# Run B: simulated NAS, same load
PROFILE=1 stress_tests/sim/run_experiment.sh slowfs B-mine 5
```

Each run starts the backend, waits for it, runs Locust, saves every report into
`stress_tests/sim/reports/<label>/`, and stops the backend. Usage:
`run_experiment.sh <local|slowfs> <label> [minutes=5] [users=150]`.

## Reading the results

| File in `reports/<label>/` | What it tells you |
|---|---|
| `locust.html` | Charts and per-request table. The `PAGE ...` rows are whole page loads (what a user feels), e.g. `PAGE Home: rows ready`. |
| `profile.txt` | Only with `PROFILE=1`. Per endpoint: p50/p95, CPU, SQL count and time, **time waiting for a DB connection (pool)**, log lines. Also the top SQL statements with the Amanflix line that issued them, what in-flight requests are doing, and stalls. |
| `slowfs-stats.txt` | Only in `slowfs` mode. Simulated-NAS operation counts and injected delay by type (open, stat, lock, fsync, read, write). |
| `backend.out` | The backend's console output (like pm2's log), including tracebacks. |
| `INVALID.txt` | Present only if the Mac slept during the run. Discard that run. |

Locust exits with code 1 whenever any request failed. That's expected.

## Files

| File | Purpose |
|---|---|
| `run_experiment.sh` | One complete, repeatable run (see Quick start). Keeps the Mac awake and flags a run as invalid if it slept anyway. |
| `run_backend.sh` | Starts the backend like production (`AMANFLIX_DEBUG=0`) in `local`, `slowfs` or `nas` mode. `PROFILE=1` adds the profiler. |
| `locustfile.py` | The simulated users. **BrowserUser** (40%) replays the frontend's real request sequence: auth checks, the Home burst of ~13 requests with 6 parallel connections, images with browser-style revalidation, Movies/TV genre pages, search, My List, hover and modal. **ViewerUser** (60%) streams video byte ranges and saves progress every 10 s, like `WatchPage.js`. |
| `seed_sim_data.py` | Creates `sim_user_000…149` (password in the generated `sim_users.json`) with 20–80 watch-history rows and 5–30 My List entries each. It backs up the DB to `amanflix_db.db.pre-sim` once. `--restore` puts that backup back. |
| `profiled_app.py` | Runs `api/app.py` with instrumentation attached and no app changes (Flask signals, SQLAlchemy events, a sampling profiler). A py-spy stand-in that needs no sudo. |
| `slowfs/slowfs.c` | The NAS simulator: a small library injected with `DYLD_INSERT_LIBRARIES` into the backend process only. Built automatically. |
| `diag_sqlite.py` | Explains a single per-card watch-history lookup on the simulated NAS: page reads and time cold, warm, after another connection commits, with a bigger cache, and with an index. Works on a temporary copy of the DB. |
| `nas_sim.sh` | Optional alternative to slowfs: a real loopback SMB mount throttled with pf/dnctl. Needs sudo and macOS File Sharing. `up` / `down` / `status`. |

## Settings (environment variables)

| Variable | Default | Effect |
|---|---|---|
| `PROFILE` | 0 | 1 = attach the profiler (writes `profile.txt`) |
| `SLOWFS_RTT_US` | 1000 | Simulated NAS round trip in microseconds |
| `SLOWFS_BW_MBPS` | 100 | NAS link bandwidth in MB/s (shared by all threads) |
| `SLOWFS_FSYNC_MS` | 5 | Extra time for the NAS to commit to disk on fsync |
| `SLOWFS_APPEND_RTT` | 0 | 1 = also charge a round trip per log-file write (0 assumes SMB write-behind caching) |
| `SIM_STREAM_MBPS` | 5 | Video bitrate per viewer (0 = no streaming) |
| `SIM_IMAGES_PER_ROW` | 17 | Card images the browser loads per Home row |
| `SIM_PARALLEL` | 6 | Parallel connections per browser (Chrome HTTP/1.1) |

Example, a slower NAS: `SLOWFS_RTT_US=3000 SLOWFS_BW_MBPS=50 PROFILE=1 stress_tests/sim/run_experiment.sh slowfs B-slow 5`

## How slowfs models the NAS

Delays apply only to paths under the repo, and only inside the backend process:

- **1 round trip:** open, stat (then cached per path for 10 s, like Windows' SMB metadata cache), byte-range
  locks, a random-offset read (SQLite pages), and a write-through write.
- **Round trip plus flush time:** fsync.
- **Sequential reads:** one round trip per 1 MB read-ahead window, plus the bytes over the link.
- **Log appends:** bandwidth only.
- **Free:** close, fstat and lseek.

It assumes Windows does not keep its own cached copy of the SQLite file, which is the worst case. Real
production numbers are probably between run A and run B.

## Baseline (2026-09-23, before any fix, no index)

These are the two kept runs, `reports/A-profiled` and `reports/B-profiled`: 150 users, 5 minutes each.

| | Run A (local disk) | Run B (simulated NAS) |
|---|---|---|
| Home: rows ready, median / slowest 5% | 2.2 s / 7.4 s | **78 s / 129 s** |
| Search, median / slowest 5% | 1.8 s / 7.1 s | 45 s / 47 s |
| Progress save, median / slowest 5% | 0.13 s / 2.4 s | 30 s / 34 s (148 failed) |
| Requests that failed after waiting 30 s for a DB connection | 0 | 1,037 |

Run A's failures are mostly connection resets under burst load: the dev server can't accept that many
new connections at once. Browsers retry these.

**Root cause found:** `serialize_watch_history` ([api/api/utils.py](../../api/api/utils.py)) runs one
watch-history query **per card**, about 17 per row. `watch_history` has no index, so each query reads the
whole table: about 1,000 pages, 4 MB. On local disk that costs 1.4 ms, because the OS caches the file. On
the NAS it costs about 620 ms, and every progress save throws away SQLite's page cache, so nothing stays
warm. Requests hold one of the 15 pooled DB connections across all their queries, so the pool runs out.
Everything else, even the login check, then waits in line, and writes starve, which is where
"database is locked" comes from.

Run `diag_sqlite.py` to see the per-query numbers on this machine.

## Housekeeping

- Put the DB back as it was before seeding: `api/venv/bin/python stress_tests/sim/seed_sim_data.py --restore`
- `reports/`, `sim_users.json` and the built `slowfs.dylib` are git-ignored.
- The only app change the simulation needs: `api/app.py` reads `AMANFLIX_DEBUG`. The default `1` keeps
  today's behaviour; the simulation sets `0` to match production.
