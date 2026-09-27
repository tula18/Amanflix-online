"""
Playback progress saves, written to the database in batches.

The player saves its position about every 10 seconds, so at peak there are several saves per
second. Committing each one separately is what makes SQLite on the network share report
"database is locked": every commit locks the whole database file and makes every other
connection drop its page cache.

Instead, a save that only moves the position of an existing row is kept here and all of them are
written together, in one transaction, every FLUSH_SECONDS. A save that creates a row, changes
whether the title is completed, or is the player's final save when it closes is written at once
(together with anything pending).

Rows read through the ORM get their pending values applied as they load, so users always see
their latest position. If the process is killed, up to FLUSH_SECONDS of progress can be lost;
on a normal exit pending saves are written first.

AMANFLIX_PROGRESS_FLUSH_SECONDS=0 turns batching off (every save is written at once).
"""

import atexit
import os
import signal
import threading
import time

from sqlalchemy import and_, bindparam, event, update
from sqlalchemy.orm.attributes import set_committed_value

from utils.logger import log_error, log_info, log_warning

FLUSH_SECONDS = float(os.environ.get('AMANFLIX_PROGRESS_FLUSH_SECONDS', '5'))

# Columns a progress save changes; the rest of the row is left alone
FIELDS = ('watch_timestamp', 'total_duration', 'progress_percentage', 'last_watched', 'is_completed')

_lock = threading.Lock()
_pending = {}         # row id -> {'user_id', 'content_id', **FIELDS}
_flush_lock = threading.Lock()
_app = None
_thread = None
_stop = threading.Event()


def init_app(app):
    """Remember the app (the flusher needs an app context) and write pending saves on exit."""
    global _app
    _app = app
    atexit.register(flush)
    # pm2 and service managers stop the process with SIGTERM; make that a normal exit so the
    # atexit flush runs. Only possible from the main thread, and only if nobody else handles it.
    if threading.current_thread() is threading.main_thread() and hasattr(signal, 'SIGTERM'):
        if signal.getsignal(signal.SIGTERM) in (signal.SIG_DFL, None):
            signal.signal(signal.SIGTERM, lambda signum, frame: _exit_on_signal())


def _exit_on_signal():
    raise SystemExit(0)


def save(row, values, write_now=False):
    """
    Record a progress save for an existing WatchHistory row.

    Args:
        row: The WatchHistory row being updated (only its id, user_id and content_id are used)
        values (dict): New values for FIELDS
        write_now (bool): Write it (and everything pending) before returning

    Returns:
        bool: False if a save that had to be written now could not be written
    """
    entry = {'user_id': row.user_id, 'content_id': row.content_id, **values}
    with _lock:
        _pending[row.id] = entry
    if write_now or FLUSH_SECONDS <= 0:
        return flush()
    _ensure_flusher()
    return True


def pending_for(row_id):
    """The pending values for a row, or None."""
    with _lock:
        entry = _pending.get(row_id)
        return dict(entry) if entry else None


def flush():
    """
    Write every pending save in one transaction.

    Returns:
        bool: True if everything taken was written (or there was nothing to write)
    """
    from models import db, WatchHistory
    from api.db_utils import safe_commit

    with _flush_lock:
        with _lock:
            batch = dict(_pending)
            _pending.clear()
        if not batch:
            return True

        params = [{'_id': row_id, '_user_id': e['user_id'], '_content_id': e['content_id'],
                   **{f: e[f] for f in FIELDS}} for row_id, e in batch.items()]
        # Matching user and content too: a row deleted meanwhile could have its id reused
        statement = update(WatchHistory.__table__).where(and_(
            WatchHistory.__table__.c.id == bindparam('_id'),
            WatchHistory.__table__.c.user_id == bindparam('_user_id'),
            WatchHistory.__table__.c.content_id == bindparam('_content_id'),
        )).values({f: bindparam(f) for f in FIELDS})

        def apply():
            db.session.execute(statement, params)

        def write():
            try:
                apply()
            except Exception as e:
                # e.g. "database is locked" while writing; safe_commit can't retry what never ran
                log_warning(f"Writing {len(params)} progress saves failed: {e}")
                db.session.rollback()
                time.sleep(0.2)
                try:
                    apply()
                except Exception as e2:
                    log_error(f"Writing {len(params)} progress saves failed again: {e2}")
                    db.session.rollback()
                    return False
            return safe_commit(apply=apply)

        started = time.time()
        if _app is not None and not _has_app_context():
            with _app.app_context():
                ok = write()
                db.session.remove()
        else:
            ok = write()

        if ok:
            log_info(f"Wrote {len(params)} progress saves in {time.time() - started:.2f}s")
            return True

        # Put them back unless a newer save for the same row arrived meanwhile
        with _lock:
            for row_id, entry in batch.items():
                _pending.setdefault(row_id, entry)
        log_warning(f"{len(batch)} progress saves kept for the next attempt")
        return False


def _has_app_context():
    from flask import has_app_context
    return has_app_context()


def _ensure_flusher():
    global _thread
    if _thread is not None and _thread.is_alive():
        return
    with _lock:
        if _thread is not None and _thread.is_alive():
            return
        _thread = threading.Thread(target=_flush_loop, name='progress-flush', daemon=True)
        _thread.start()


def _flush_loop():
    while not _stop.wait(FLUSH_SECONDS):
        try:
            flush()
        except Exception as e:
            log_error(f"Progress flush failed: {e}")


def _apply_pending(target, *args):
    """ORM load/refresh hook: show a row's pending progress instead of what the database has."""
    if not _pending:
        return
    entry = pending_for(target.id)
    if entry:
        for field in FIELDS:
            set_committed_value(target, field, entry[field])


def register_listeners():
    from models import WatchHistory
    if not event.contains(WatchHistory, 'load', _apply_pending):
        event.listen(WatchHistory, 'load', _apply_pending)
        event.listen(WatchHistory, 'refresh', _apply_pending)


register_listeners()
