"""
Media health: detection and repair of container-level defects in stored MP4s.

The defect that motivated this module is a degenerate H.264 Display Matrix: the
video track's `tkhd` transformation matrix is all zeros, so the rotation derived
from it is `nan`. Chrome <=114 ignored it; Chrome 143+ validates it strictly and
refuses to render the video track, producing a black screen with working audio.

Two things about this defect drive the design here:

* ffprobe's JSON output does not expose it. It reports `"rotation": 0` for a
  broken file, while the human-readable stderr says `rotation of nan degrees`.
  Both streams are captured from a single probe so either signal can be used.

* The command that repairs it depends on the ffmpeg build. ffmpeg 8.x propagates
  the broken side data through a stream copy, so it survives a naive remux;
  older builds drop it and the mov muxer writes an identity matrix instead.
  Rather than hardcode a command, `repair_file` tries strategies in order and
  re-probes its own output, accepting the first one that is actually clean.
"""

import json
import math
import os
import re
import shutil
import struct
import subprocess
from datetime import datetime, timedelta, timezone

from paths import REPAIR_BACKUPS_DIR
from utils.logger import log_error, log_info, log_warning

# Issue codes produced by analyze_file()
ISSUE_CORRUPT_DISPLAY_MATRIX = 'corrupt_display_matrix'
ISSUE_NO_VIDEO_STREAM = 'no_video_stream'
ISSUE_UNREADABLE = 'unreadable'
ISSUE_NOT_FASTSTART = 'not_faststart'
# Raised by the library scan when a catalogued title has no file on disk at all,
# as distinct from a file that exists but cannot be read.
ISSUE_MISSING_FILE = 'missing_file'

# Issues severe enough to break playback, as opposed to merely degrading it.
BLOCKING_ISSUES = {
    ISSUE_CORRUPT_DISPLAY_MATRIX,
    ISSUE_NO_VIDEO_STREAM,
    ISSUE_UNREADABLE,
    ISSUE_MISSING_FILE,
}

# Issues a remux can actually fix. Anything else needs a real re-encode.
REPAIRABLE_ISSUES = {
    ISSUE_CORRUPT_DISPLAY_MATRIX,
    ISSUE_NOT_FASTSTART,
}

# The identity transform as stored in `tkhd`, in 16.16 / 2.30 fixed point.
IDENTITY_MATRIX = (0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000)

_NAN_ROTATION_RE = re.compile(r'rotation of nan degrees', re.IGNORECASE)

PROBE_TIMEOUT = 120
REMUX_TIMEOUT = 3600

# Cached result of the `-display_rotation` capability probe (see _supports_display_rotation).
_display_rotation_supported = None


# --------------------------------------------------------------------------
# Probing
# --------------------------------------------------------------------------

def probe_video(path):
    """Probe a media file, returning both of ffprobe's output channels.

    Deliberately runs at default verbosity rather than `-v error`: the
    `displaymatrix: rotation of nan degrees` line only appears on stderr at
    info level, and it is the most reliable signal of the defect across ffprobe
    versions. stdout carries the JSON. One subprocess yields both.

    Returns {'data': <parsed json or None>, 'stderr': <str>, 'ok': <bool>}.
    """
    cmd = [
        'ffprobe', '-hide_banner',
        '-print_format', 'json',
        '-show_streams', '-show_format',
        path,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=PROBE_TIMEOUT)
    except subprocess.TimeoutExpired:
        return {'data': None, 'stderr': 'ffprobe timed out', 'ok': False}
    except FileNotFoundError:
        return {'data': None, 'stderr': 'ffprobe is not installed or not in PATH', 'ok': False}
    except Exception as e:
        return {'data': None, 'stderr': str(e), 'ok': False}

    stderr = result.stderr.decode('utf-8', errors='ignore')

    data = None
    try:
        # json.loads accepts bare NaN, which some ffprobe builds emit for rotation.
        data = json.loads(result.stdout.decode('utf-8', errors='ignore'))
    except json.JSONDecodeError:
        data = None

    return {
        'data': data,
        'stderr': stderr,
        'ok': result.returncode == 0 and isinstance(data, dict),
    }


def _first_video_stream(data):
    for stream in (data or {}).get('streams', []) or []:
        if stream.get('codec_type') == 'video':
            return stream
    return None


def _parse_display_matrix(raw):
    """Pull the 9 integers out of ffprobe's `displaymatrix` string.

    The string looks like:
        "\\n00000000:    65536    0    0\\n00000001: ..."
    i.e. each row is prefixed with an offset label that must not be counted as
    a matrix value. Returns a 9-tuple, or None if it does not parse.
    """
    if not isinstance(raw, str):
        return None
    values = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        # Drop the "00000000:" offset prefix before reading the row's values.
        _, _, rest = line.partition(':')
        for token in rest.split():
            try:
                values.append(int(token))
            except ValueError:
                return None
    return tuple(values) if len(values) == 9 else None


def has_corrupt_display_matrix(probe):
    """True when the video track carries a degenerate display matrix.

    Checks three independent signals, because which ones are available depends
    on the ffprobe build:

      1. The `rotation of nan degrees` line on stderr. This is the signal that
         was validated against the real affected file on the server.
      2. An all-zero `displaymatrix` in the JSON. Version-stable, and the
         underlying cause of the nan (rotation is derived via atan2(0, 0)).
      3. A `rotation` value that is literally NaN, for builds that emit it.

    A legitimately rotated video (90/180/270) has a non-zero matrix and a finite
    rotation, so it matches none of these and is left alone.
    """
    if _NAN_ROTATION_RE.search(probe.get('stderr') or ''):
        return True

    stream = _first_video_stream(probe.get('data'))
    if not stream:
        return False

    for side_data in stream.get('side_data_list', []) or []:
        if side_data.get('side_data_type') != 'Display Matrix':
            continue

        matrix = _parse_display_matrix(side_data.get('displaymatrix'))
        if matrix is not None and not any(matrix):
            return True

        rotation = side_data.get('rotation')
        if rotation is not None:
            try:
                if math.isnan(float(rotation)):
                    return True
            except (TypeError, ValueError):
                # A non-numeric rotation is itself a sign of a malformed matrix.
                return True

    return False


# --------------------------------------------------------------------------
# MP4 box walking
# --------------------------------------------------------------------------

# Boxes whose payload is a sequence of further boxes, for the paths we care about.
_CONTAINER_BOXES = {b'moov', b'trak', b'mdia', b'edts'}


def _iter_boxes(fh, start, end, recurse=True):
    """Yield (type, header_offset, header_size, total_size) for MP4 boxes in a range."""
    offset = start
    while offset + 8 <= end:
        fh.seek(offset)
        header = fh.read(8)
        if len(header) < 8:
            return
        size = struct.unpack('>I', header[:4])[0]
        box_type = header[4:8]
        header_size = 8

        if size == 1:
            # 64-bit extended size follows the type field.
            ext = fh.read(8)
            if len(ext) < 8:
                return
            size = struct.unpack('>Q', ext)[0]
            header_size = 16
        elif size == 0:
            # Box extends to the end of its container.
            size = end - offset

        if size < header_size or offset + size > end:
            return

        yield box_type, offset, header_size, size

        if recurse and box_type in _CONTAINER_BOXES:
            for inner in _iter_boxes(fh, offset + header_size, offset + size):
                yield inner

        offset += size


def has_faststart(path):
    """True when `moov` precedes `mdat`, which lets browsers start playback sooner."""
    try:
        size = os.path.getsize(path)
        with open(path, 'rb') as fh:
            for box_type, _, _, _ in _iter_boxes(fh, 0, size, recurse=False):
                if box_type == b'moov':
                    return True
                if box_type == b'mdat':
                    return False
    except (OSError, struct.error):
        return True  # Unreadable structure is reported separately; don't double-flag.
    return True


def _tkhd_matrix_offsets(path):
    """Absolute file offsets of the 36-byte matrix field in each track's `tkhd`.

    Track order matches the order of `trak` boxes, which is the order ffprobe
    reports streams in.
    """
    offsets = []
    size = os.path.getsize(path)
    with open(path, 'rb') as fh:
        for box_type, offset, header_size, box_size in _iter_boxes(fh, 0, size):
            if box_type != b'tkhd':
                continue
            body = offset + header_size
            fh.seek(body)
            version = fh.read(1)
            if not version:
                continue
            # version(1) + flags(3), then creation/modification/track_id/reserved/
            # duration, then reserved(8) + layer(2) + alternate_group(2) +
            # volume(2) + reserved(2) before the matrix.
            times = 32 if version[0] == 1 else 20
            matrix_offset = body + 4 + times + 8 + 2 + 2 + 2 + 2
            if matrix_offset + 36 <= offset + box_size:
                offsets.append(matrix_offset)
    return offsets


# --------------------------------------------------------------------------
# Analysis
# --------------------------------------------------------------------------

def analyze_file(path, check_faststart=True):
    """Inspect one media file and report what is wrong with it.

    Returns {'issues': [...], 'severity': 'ok'|'warn'|'error', 'details': {...}}.
    """
    details = {}
    issues = []

    if not os.path.exists(path):
        return {'issues': [ISSUE_UNREADABLE], 'severity': 'error',
                'details': {'error': 'file not found'}}

    try:
        details['size'] = os.path.getsize(path)
    except OSError:
        details['size'] = None

    probe = probe_video(path)

    if not probe['ok']:
        details['error'] = (probe['stderr'] or '').strip()[-500:]
        return {'issues': [ISSUE_UNREADABLE], 'severity': 'error', 'details': details}

    data = probe['data']
    streams = data.get('streams', []) or []
    details['stream_count'] = len(streams)
    details['video_streams'] = sum(1 for s in streams if s.get('codec_type') == 'video')
    details['audio_streams'] = sum(1 for s in streams if s.get('codec_type') == 'audio')

    try:
        details['duration'] = float((data.get('format') or {}).get('duration'))
    except (TypeError, ValueError):
        details['duration'] = None

    if not details['video_streams']:
        issues.append(ISSUE_NO_VIDEO_STREAM)

    if has_corrupt_display_matrix(probe):
        issues.append(ISSUE_CORRUPT_DISPLAY_MATRIX)

    if check_faststart and not has_faststart(path):
        issues.append(ISSUE_NOT_FASTSTART)

    if any(i in BLOCKING_ISSUES for i in issues):
        severity = 'error'
    elif issues:
        severity = 'warn'
    else:
        severity = 'ok'

    return {'issues': issues, 'severity': severity, 'details': details}


# --------------------------------------------------------------------------
# Repair
# --------------------------------------------------------------------------

def _supports_display_rotation():
    """Whether this ffmpeg accepts the `-display_rotation` input option (>= 5.1)."""
    global _display_rotation_supported
    if _display_rotation_supported is not None:
        return _display_rotation_supported
    try:
        result = subprocess.run(
            ['ffmpeg', '-hide_banner', '-h', 'full'],
            capture_output=True, timeout=60,
        )
        output = result.stdout.decode('utf-8', errors='ignore')
        _display_rotation_supported = 'display_rotation' in output
    except Exception:
        _display_rotation_supported = False
    return _display_rotation_supported


def _remux_commands(src, dst):
    """Repair strategies to try in order, as (name, argv) pairs.

    Ordered cheapest-and-most-correct first. Each is a stream copy, so they run
    in seconds regardless of file length, and none of them touch the encoded
    video bitstream.
    """
    commands = []

    if _supports_display_rotation():
        # Overrides the display matrix at the input, so the muxer writes identity.
        commands.append(('display_rotation', [
            'ffmpeg', '-y', '-v', 'error',
            '-display_rotation', '0',
            '-i', src,
            '-map', '0', '-c', 'copy',
            '-movflags', '+faststart',
            dst,
        ]))

    # On older builds the broken side data is simply not carried across a copy,
    # so a plain remux is enough. `-map 0` keeps every stream: without it,
    # default stream selection silently drops extra audio and subtitle tracks.
    commands.append(('remux', [
        'ffmpeg', '-y', '-v', 'error',
        '-i', src,
        '-map', '0', '-c', 'copy',
        '-map_metadata', '0',
        '-movflags', '+faststart',
        dst,
    ]))

    return commands


def _patch_tkhd_matrix(src, dst):
    """Write the identity matrix into every track's `tkhd`, bypassing ffmpeg.

    The fallback of last resort: it depends on nothing but the container layout,
    so it still works on an ffmpeg build whose remux behaviour we did not
    anticipate. Copies first, then patches in place, leaving `src` untouched.
    """
    shutil.copy2(src, dst)
    offsets = _tkhd_matrix_offsets(dst)
    if not offsets:
        raise ValueError('no tkhd boxes found')
    packed = struct.pack('>9i', *IDENTITY_MATRIX)
    with open(dst, 'r+b') as fh:
        for offset in offsets:
            fh.seek(offset)
            fh.write(packed)


def _verify_repair(original, candidate):
    """Confirm a candidate file is genuinely fixed and did not lose anything.

    Returns (ok, reason).
    """
    if not os.path.exists(candidate) or os.path.getsize(candidate) == 0:
        return False, 'output missing or empty'

    # faststart is not required for the output to be an improvement, and
    # checking it here would reject the tkhd-patch strategy for no reason.
    after = analyze_file(candidate, check_faststart=False)

    if ISSUE_CORRUPT_DISPLAY_MATRIX in after['issues']:
        return False, 'display matrix still corrupt'
    if ISSUE_UNREADABLE in after['issues']:
        return False, 'output is unreadable'
    if ISSUE_NO_VIDEO_STREAM in after['issues']:
        return False, 'output has no video stream'

    before_count = original['details'].get('stream_count')
    after_count = after['details'].get('stream_count')
    if before_count and after_count != before_count:
        return False, f'stream count changed ({before_count} -> {after_count})'

    before_duration = original['details'].get('duration')
    after_duration = after['details'].get('duration')
    if before_duration and after_duration and abs(before_duration - after_duration) > 1.0:
        return False, f'duration changed ({before_duration:.2f} -> {after_duration:.2f})'

    return True, 'ok'


def backup_path_for(video_id):
    """A free path for a new backup of this title.

    The timestamp only has second resolution, so two operations on the same file
    within one second would otherwise collide - and a collision here overwrites
    an existing backup, which is the one thing this directory exists to prevent.
    Never returns a path that is already taken.
    """
    os.makedirs(REPAIR_BACKUPS_DIR, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')

    path = os.path.join(REPAIR_BACKUPS_DIR, f'{video_id}.{stamp}.mp4')
    attempt = 1
    while os.path.exists(path):
        path = os.path.join(REPAIR_BACKUPS_DIR, f'{video_id}.{stamp}-{attempt}.mp4')
        attempt += 1
    return path


def repair_file(path, video_id, logger=None):
    """Repair a file in place, keeping a backup of the original.

    Tries each strategy and re-probes its own output, accepting the first result
    that verifies clean. A zero exit code is not treated as proof of repair,
    because the naive remux succeeds while changing nothing on newer ffmpeg.

    Returns a result dict with at least {'repaired': bool, 'reason': str}.
    """
    def _log(message, level='info'):
        if logger:
            getattr(logger, level)(message)
        elif level == 'error':
            log_error(message)
        elif level == 'warning':
            log_warning(message)
        else:
            log_info(message)

    before = analyze_file(path)
    result = {
        'video_id': video_id,
        'repaired': False,
        'strategy': None,
        'reason': '',
        'issues_before': before['issues'],
        'backup': None,
    }

    fixable = [i for i in before['issues'] if i in REPAIRABLE_ISSUES]
    if not fixable:
        result['reason'] = 'nothing to repair' if not before['issues'] else 'issues are not remux-repairable'
        return result

    tmp_path = f'{path}.repair.tmp.mp4'
    strategies = list(_remux_commands(path, tmp_path))
    strategies.append(('tkhd_patch', None))

    for name, cmd in strategies:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        try:
            if cmd is None:
                _patch_tkhd_matrix(path, tmp_path)
            else:
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=REMUX_TIMEOUT)
                if proc.returncode != 0:
                    _log(f'REPAIR   | video_id={video_id} | strategy={name} | ffmpeg failed: {proc.stderr[:300]}', 'warning')
                    continue
        except subprocess.TimeoutExpired:
            _log(f'REPAIR   | video_id={video_id} | strategy={name} | timed out', 'warning')
            continue
        except Exception as e:
            _log(f'REPAIR   | video_id={video_id} | strategy={name} | {e}', 'warning')
            continue

        ok, reason = _verify_repair(before, tmp_path)
        if not ok:
            _log(f'REPAIR   | video_id={video_id} | strategy={name} | rejected: {reason}', 'warning')
            continue

        backup = backup_path_for(video_id)
        try:
            shutil.move(path, backup)
        except Exception as e:
            _log(f'REPAIR   | video_id={video_id} | backup failed: {e}', 'error')
            result['reason'] = f'backup failed: {e}'
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            return result

        try:
            os.replace(tmp_path, path)
        except Exception as e:
            # Put the original back rather than leaving the title unplayable.
            shutil.move(backup, path)
            _log(f'REPAIR   | video_id={video_id} | swap failed, original restored: {e}', 'error')
            result['reason'] = f'swap failed: {e}'
            return result

        result.update({
            'repaired': True,
            'strategy': name,
            'reason': 'ok',
            'backup': backup,
            'issues_after': analyze_file(path)['issues'],
        })
        _log(f'REPAIRED | video_id={video_id} | strategy={name} | issues={before["issues"]} | backup={os.path.basename(backup)}')
        return result

    if os.path.exists(tmp_path):
        os.remove(tmp_path)
    result['reason'] = 'all repair strategies failed'
    _log(f'REPAIR   | video_id={video_id} | all strategies failed', 'error')
    return result


# --------------------------------------------------------------------------
# Backups
# --------------------------------------------------------------------------

def list_backups():
    """Every file in the repair backup directory, newest first."""
    entries = []
    if not os.path.isdir(REPAIR_BACKUPS_DIR):
        return entries
    for name in os.listdir(REPAIR_BACKUPS_DIR):
        full = os.path.join(REPAIR_BACKUPS_DIR, name)
        if not os.path.isfile(full):
            continue
        try:
            stat = os.stat(full)
        except OSError:
            continue
        entries.append({
            'name': name,
            'video_id': name.split('.')[0],
            'size': stat.st_size,
            'modified': datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        })
    entries.sort(key=lambda e: e['modified'], reverse=True)
    return entries


def resolve_backup(name):
    """Map a backup filename to a real path inside the backup directory.

    Rejects anything that is not a plain filename directly inside that
    directory, so a crafted name cannot reach other parts of the filesystem.
    Returns None when the name is unsafe or the file does not exist.
    """
    if not name or os.path.basename(name) != name:
        return None

    root = os.path.realpath(REPAIR_BACKUPS_DIR)
    path = os.path.realpath(os.path.join(root, name))

    if os.path.dirname(path) != root or not os.path.isfile(path):
        return None
    return path


def restore_backup(name, dst_path, video_id, logger=None):
    """Overwrite the live file with a backup.

    Destructive by design: whatever is currently in place is discarded, and the
    backup itself stays put so the same restore can be repeated. The copy lands
    on a temp file first and is then swapped in atomically, so an interrupted
    restore cannot leave a half-written file in service.
    """
    def _log(message, level='info'):
        if logger:
            getattr(logger, level)(message)
        elif level == 'error':
            log_error(message)
        else:
            log_info(message)

    result = {'video_id': video_id, 'restored': False, 'reason': ''}

    src = resolve_backup(name)
    if not src:
        result['reason'] = 'backup not found'
        return result

    # Refuse to install something that is not playable media, so a damaged
    # backup cannot be swapped in over a working file.
    check = analyze_file(src, check_faststart=False)
    if ISSUE_UNREADABLE in check['issues'] or ISSUE_NO_VIDEO_STREAM in check['issues']:
        result['reason'] = 'backup is not a readable video'
        return result

    tmp_path = f'{dst_path}.restore.tmp.mp4'
    try:
        os.makedirs(os.path.dirname(os.path.abspath(dst_path)), exist_ok=True)
        shutil.copy2(src, tmp_path)
        os.replace(tmp_path, dst_path)
    except Exception as e:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        _log(f'RESTORE  | video_id={video_id} | failed: {e}', 'error')
        result['reason'] = str(e)
        return result

    result.update({
        'restored': True,
        'reason': 'ok',
        'issues_after': analyze_file(dst_path)['issues'],
    })
    _log(f'RESTORED | video_id={video_id} | from={name} | previous file discarded')
    return result


def prune_backups(max_age_days=14):
    """Delete backups older than max_age_days. Returns {'deleted', 'freed'}."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    deleted, freed = 0, 0
    if not os.path.isdir(REPAIR_BACKUPS_DIR):
        return {'deleted': 0, 'freed': 0}
    for name in os.listdir(REPAIR_BACKUPS_DIR):
        full = os.path.join(REPAIR_BACKUPS_DIR, name)
        if not os.path.isfile(full):
            continue
        try:
            stat = os.stat(full)
            if datetime.fromtimestamp(stat.st_mtime, timezone.utc) >= cutoff:
                continue
            size = stat.st_size
            os.remove(full)
            deleted += 1
            freed += size
        except OSError as e:
            log_warning(f'Could not prune backup {name}: {e}')
    return {'deleted': deleted, 'freed': freed}
