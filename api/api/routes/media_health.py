"""Admin endpoints for scanning and repairing defective media files.

A full-library scan reads every file's container and cannot finish inside a
request, so scans and repairs run on background threads with module-level
progress state, mirroring the pattern already used for re-encodes in
`stream.py`. One scan and one repair run at a time.
"""

import json
import os
import threading
from contextlib import contextmanager
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from api.media_health import (
    BLOCKING_ISSUES,
    ISSUE_MISSING_FILE,
    REPAIRABLE_ISSUES,
    analyze_file,
    list_backups,
    prune_backups,
    repair_file,
    restore_backup,
)
from api.utils import admin_token_required
from models import Episode, Movie, Season, TVShow
from paths import LOGS_DIR, UPLOADS_DIR
from utils.logger import log_error, log_info

media_health_bp = Blueprint('media_health_bp', __name__, url_prefix='/api/admin/media-health')

REPORT_PATH = os.path.join(LOGS_DIR, 'media_health_report.json')

_lock = threading.Lock()

_scan_state = {
    'state': 'idle',      # idle | running | done | failed
    'scanned': 0,
    'total': 0,
    'current': None,
    'started_at': None,
    'finished_at': None,
    'scope': None,
    'error': None,
}

# The latest scan results. Kept separate from _scan_state because repairs and
# restores mutate it after the scan that produced it has finished - that is what
# makes a repaired file disappear from the flagged list without a rescan.
_report = {'generated_at': None, 'scope': None, 'total': 0, 'results': []}

_repair_state = {
    'state': 'idle',
    'processed': 0,
    'total': 0,
    'current': None,
    'results': [],
    'started_at': None,
    'finished_at': None,
}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _video_path(video_id):
    return os.path.join(UPLOADS_DIR, f'{video_id}.mp4')


def _collect_targets(scope):
    """Every known video_id with a display label, as [{video_id, type, title, ...}].

    Must be called inside an application context.
    """
    targets = []

    if scope in ('all', 'movies'):
        for movie in Movie.query.all():
            if movie.video_id is None:
                continue
            targets.append({
                'video_id': str(movie.video_id),
                'type': 'movie',
                'title': movie.title,
                'subtitle': '',
                'content_id': movie.movie_id,
            })

    if scope in ('all', 'shows'):
        rows = (
            Episode.query
            .join(Season, Episode.season_id == Season.id)
            .join(TVShow, Season.tvshow_id == TVShow.show_id)
            .add_columns(TVShow.title, TVShow.show_id, Season.season_number)
            .all()
        )
        for episode, show_title, show_id, season_number in rows:
            if episode.video_id is None:
                continue
            targets.append({
                'video_id': str(episode.video_id),
                'type': 'episode',
                'title': show_title,
                'subtitle': f'S{season_number:02d}E{episode.episode_number:02d}'
                            + (f' - {episode.title}' if episode.title else ''),
                'content_id': show_id,
            })

    return targets


def _write_report():
    """Persist the report so the page can render without rescanning.

    Caller must hold _lock.
    """
    try:
        os.makedirs(LOGS_DIR, exist_ok=True)
        with open(REPORT_PATH, 'w', encoding='utf-8') as fh:
            json.dump(_report, fh, indent=2)
    except OSError as e:
        log_error(f'Could not write media health report: {e}')


def _load_report():
    """Return the report, reading the saved one from disk on first access.

    Caller must hold _lock.
    """
    if _report['results'] or not os.path.exists(REPORT_PATH):
        return _report
    try:
        with open(REPORT_PATH, encoding='utf-8') as fh:
            saved = json.load(fh)
        if isinstance(saved, dict):
            _report.update({k: saved.get(k, _report[k]) for k in _report})
    except (OSError, json.JSONDecodeError) as e:
        log_error(f'Could not read media health report: {e}')
    return _report


def _classify(entry):
    """Annotate a result with whether it blocks playback and can be remuxed."""
    entry['repairable'] = bool(
        entry['issues'] and all(i in REPAIRABLE_ISSUES for i in entry['issues'])
    )
    entry['blocking'] = any(i in BLOCKING_ISSUES for i in entry['issues'])
    return entry


def _analyze_target(target):
    """Scan one catalogued title, distinguishing 'no file' from 'bad file'."""
    path = _video_path(target['video_id'])
    if not os.path.exists(path):
        analysis = {'issues': [ISSUE_MISSING_FILE], 'severity': 'error', 'details': {}}
    else:
        analysis = analyze_file(path)
    return _classify(dict(target, **analysis))


def _refresh_report_entries(video_ids):
    """Re-analyze the named files and update the cached report in place.

    Runs after a repair or a restore so the flagged list reflects reality:
    repaired titles fall off it (their issue list becomes empty) and restored
    ones come back, with no rescan of the whole library.
    """
    wanted = {str(v) for v in video_ids}
    with _lock:
        results = _load_report()['results']
        targets = [e for e in results if e.get('video_id') in wanted]

    if not targets:
        return

    # Probe outside the lock: ffprobe is slow and status polling must stay responsive.
    fresh = {e['video_id']: _analyze_target(e) for e in targets}

    with _lock:
        for entry in _report['results']:
            updated = fresh.get(entry.get('video_id'))
            if updated:
                entry.update(updated)
        _write_report()


@contextmanager
def _stream_lock(video_id):
    """Block streaming of a title while its file is being swapped.

    Reuses the locks in stream.py so /stream and /can-watch behave exactly as
    they do during a re-encode. Imported lazily to keep module import order free
    of a cycle between the two route modules.
    """
    from api.routes.stream import _file_locks, _reencode_in_progress, _reencode_lock

    lock_event = threading.Event()
    with _reencode_lock:
        if video_id in _reencode_in_progress:
            raise RuntimeError('already being processed')
        _reencode_in_progress.add(video_id)
        _file_locks[video_id] = lock_event
    try:
        yield
    finally:
        with _reencode_lock:
            _reencode_in_progress.discard(video_id)
            if video_id in _file_locks:
                _file_locks[video_id].set()
                del _file_locks[video_id]


def _run_scan(app, scope):
    try:
        with app.app_context():
            targets = _collect_targets(scope)

        with _lock:
            _scan_state['total'] = len(targets)

        results = []
        for index, target in enumerate(targets, start=1):
            with _lock:
                _scan_state['scanned'] = index
                _scan_state['current'] = target['title']
            results.append(_analyze_target(target))

        finished_at = _now()
        with _lock:
            _report.update({
                'generated_at': finished_at,
                'scope': scope,
                'total': len(targets),
                'results': results,
            })
            _scan_state['state'] = 'done'
            _scan_state['finished_at'] = finished_at
            _scan_state['current'] = None
            _write_report()

        flagged = sum(1 for r in results if r['issues'])
        log_info(f'Media health scan finished: {flagged}/{len(results)} files flagged')

    except Exception as e:
        log_error(f'Media health scan failed: {e}')
        with _lock:
            _scan_state['state'] = 'failed'
            _scan_state['error'] = str(e)
            _scan_state['finished_at'] = _now()


def _run_repairs(video_ids):
    from api.routes.stream import reencode_log

    results = []
    repaired_ids = []
    try:
        for index, video_id in enumerate(video_ids, start=1):
            with _lock:
                _repair_state['processed'] = index
                _repair_state['current'] = video_id

            path = _video_path(video_id)
            if not os.path.exists(path):
                results.append({'video_id': video_id, 'repaired': False, 'reason': 'file not found'})
                continue

            try:
                with _stream_lock(video_id):
                    result = repair_file(path, video_id, logger=reencode_log)
            except RuntimeError as e:
                results.append({'video_id': video_id, 'repaired': False, 'reason': str(e)})
                continue

            results.append(result)
            if result.get('repaired'):
                repaired_ids.append(video_id)

            with _lock:
                _repair_state['results'] = list(results)

        with _lock:
            _repair_state['results'] = results
            _repair_state['state'] = 'done'
            _repair_state['finished_at'] = _now()
            _repair_state['current'] = None

    except Exception as e:
        log_error(f'Media health repair run failed: {e}')
        with _lock:
            _repair_state['state'] = 'failed'
            _repair_state['results'] = results
            _repair_state['finished_at'] = _now()
    finally:
        # Drop repaired titles off the flagged list without needing a rescan.
        if repaired_ids:
            _refresh_report_entries(repaired_ids)


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------

@media_health_bp.route('/scan/start', methods=['POST'])
@admin_token_required('moderator')
def start_scan(current_admin):
    """Begin a read-only scan of the library. Never modifies any file."""
    data = request.get_json(silent=True) or {}
    scope = data.get('scope', 'all')
    if scope not in ('all', 'movies', 'shows'):
        return jsonify(message='Invalid scope'), 400

    with _lock:
        if _scan_state['state'] == 'running':
            return jsonify(message='A scan is already running', state='running'), 409
        _scan_state.update({
            'state': 'running', 'scanned': 0, 'total': 0, 'current': None,
            'started_at': _now(), 'finished_at': None, 'scope': scope,
            'results': [], 'error': None,
        })

    from flask import current_app
    thread = threading.Thread(
        target=_run_scan,
        args=(current_app._get_current_object(), scope),
        daemon=True,
    )
    thread.start()

    log_info(f'Media health scan started by {current_admin.username} (scope={scope})')
    return jsonify(message='Scan started', state='running'), 202


@media_health_bp.route('/scan/status', methods=['GET'])
@admin_token_required('moderator')
def scan_status(current_admin):
    with _lock:
        state = dict(_scan_state)
        state['flagged'] = sum(1 for r in _report['results'] if r['issues'])
        if _scan_state['state'] in ('done', 'failed'):
            state['results'] = _report['results']
    return jsonify(state), 200


@media_health_bp.route('/report', methods=['GET'])
@admin_token_required('moderator')
def last_report(current_admin):
    """The latest results, kept current as repairs and restores land."""
    with _lock:
        return jsonify(dict(_load_report())), 200


@media_health_bp.route('/repair', methods=['POST'])
@admin_token_required('moderator')
def repair(current_admin):
    """Repair the given video_ids in the background. Each is backed up first."""
    data = request.get_json(silent=True) or {}
    video_ids = [str(v) for v in (data.get('video_ids') or [])]

    if not video_ids:
        return jsonify(message='No video_ids provided'), 400

    with _lock:
        if _repair_state['state'] == 'running':
            return jsonify(message='A repair run is already in progress', state='running'), 409
        _repair_state.update({
            'state': 'running', 'processed': 0, 'total': len(video_ids),
            'current': None, 'results': [], 'started_at': _now(), 'finished_at': None,
        })

    threading.Thread(target=_run_repairs, args=(video_ids,), daemon=True).start()

    log_info(f'Media health repair started by {current_admin.username} for {len(video_ids)} file(s)')
    return jsonify(message='Repair started', state='running', total=len(video_ids)), 202


@media_health_bp.route('/repair/status', methods=['GET'])
@admin_token_required('moderator')
def repair_status(current_admin):
    with _lock:
        return jsonify(dict(_repair_state)), 200


@media_health_bp.route('/backups', methods=['GET'])
@admin_token_required('moderator')
def backups(current_admin):
    entries = list_backups()
    return jsonify({
        'backups': entries,
        'count': len(entries),
        'total_size': sum(e['size'] for e in entries),
    }), 200


@media_health_bp.route('/backups/restore', methods=['POST'])
@admin_token_required('moderator')
def restore(current_admin):
    """Put a backup back in place, keeping the file it replaces as a new backup.

    Moderator-level on purpose: this is the undo for a repair, and undo should
    never be harder to reach than the action it reverses. Pruning stays
    admin-only because that one cannot be undone.
    """
    data = request.get_json(silent=True) or {}
    name = data.get('name')
    if not name:
        return jsonify(message='No backup name provided'), 400

    video_id = str(name).split('.')[0]
    if not video_id:
        return jsonify(message='Could not determine which title this backup belongs to'), 400

    from api.routes.stream import reencode_log

    try:
        with _stream_lock(video_id):
            result = restore_backup(name, _video_path(video_id), video_id, logger=reencode_log)
    except RuntimeError:
        return jsonify(message='That title is currently being processed'), 409

    if not result['restored']:
        return jsonify(message=result['reason'], **result), 400

    _refresh_report_entries([video_id])
    log_info(f'{current_admin.username} restored backup {name} for video {video_id}')
    return jsonify(message='Backup restored', **result), 200


@media_health_bp.route('/backups/prune', methods=['POST'])
@admin_token_required('admin')
def prune(current_admin):
    """Delete old backups. Restricted to admin: this destroys the only copy of
    the pre-repair originals."""
    data = request.get_json(silent=True) or {}
    try:
        max_age_days = int(data.get('max_age_days', 14))
    except (TypeError, ValueError):
        return jsonify(message='max_age_days must be a number'), 400
    if max_age_days < 0:
        return jsonify(message='max_age_days must not be negative'), 400

    result = prune_backups(max_age_days)
    log_info(f'{current_admin.username} pruned {result["deleted"]} media backup(s)')
    return jsonify(result), 200
