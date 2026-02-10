from flask import Blueprint, request, jsonify, send_file, make_response
from werkzeug.utils import secure_filename
from api.utils import ensure_upload_folder_exists, parse_watch_id, get_episode_video_id_cached, token_required
from models import Episode, Season 
import os
import subprocess
import threading
import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime

stream_bp = Blueprint('stream_bp', __name__, url_prefix='/api')

# Track which files are currently being re-encoded to avoid duplicate jobs
_reencode_in_progress = set()
_reencode_lock = threading.Lock()

# Track which files are locked (being re-encoded) so streaming can be blocked
_file_locks = {}  # video_id -> threading.Event (set = unlocked, clear = locked)

# Setup dedicated re-encode logger
def _setup_reencode_logger():
    logs_dir = os.path.join(os.getcwd(), 'logs')
    os.makedirs(logs_dir, exist_ok=True)
    
    reencode_logger = logging.getLogger('amanflix.reencode')
    reencode_logger.setLevel(logging.INFO)
    reencode_logger.propagate = False
    
    if reencode_logger.hasHandlers():
        reencode_logger.handlers.clear()
    
    handler = RotatingFileHandler(
        os.path.join(logs_dir, 'reencode_history.log'),
        maxBytes=5242880,  # 5MB
        backupCount=5,
        encoding='utf-8'
    )
    handler.setLevel(logging.INFO)
    handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
    reencode_logger.addHandler(handler)
    return reencode_logger

reencode_log = _setup_reencode_logger()


def _detect_corrupt_track(error_message):
    """Detect which track is corrupt from the browser's error message."""
    msg = (error_message or '').lower()
    if 'video' in msg:
        return 'video'
    elif 'audio' in msg:
        return 'audio'
    # If unclear, re-encode both to be safe
    return 'both'


def _reencode_file(file_path, video_id, watch_id='', error_message='', reported_by=''):
    """Re-encode the corrupt track(s) of a video file using ffmpeg to fix decode errors."""
    # Create a lock event for this file
    lock_event = threading.Event()  # starts unset = locked
    with _reencode_lock:
        _file_locks[video_id] = lock_event

    corrupt_track = _detect_corrupt_track(error_message)

    reencode_log.info(f'STARTED  | video_id={video_id} | watch_id={watch_id} | reported_by={reported_by} | track={corrupt_track} | file={file_path}')
    reencode_log.info(f'REASON   | video_id={video_id} | {error_message}')

    # Build ffmpeg command based on which track is corrupt
    if corrupt_track == 'audio':
        ffmpeg_cmd = ['ffmpeg', '-y', '-i', file_path, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k']
    elif corrupt_track == 'video':
        ffmpeg_cmd = ['ffmpeg', '-y', '-i', file_path, '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-c:a', 'copy']
    else:
        # Both tracks - full re-encode
        ffmpeg_cmd = ['ffmpeg', '-y', '-i', file_path, '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-c:a', 'aac', '-b:a', '192k']

    # Video re-encoding can take much longer
    timeout = 3600 if corrupt_track == 'audio' else 7200  # 1h for audio, 2h for video/both

    try:
        file_size_before = os.path.getsize(file_path)
        temp_path = file_path + '.reencode.mp4'
        start_time = datetime.now()

        result = subprocess.run(
            ffmpeg_cmd + [temp_path],
            capture_output=True, text=True, timeout=timeout
        )

        elapsed = (datetime.now() - start_time).total_seconds()

        if result.returncode == 0 and os.path.exists(temp_path):
            file_size_after = os.path.getsize(temp_path)
            os.replace(temp_path, file_path)
            reencode_log.info(
                f'SUCCESS  | video_id={video_id} | track={corrupt_track} | duration={elapsed:.1f}s | '
                f'size_before={file_size_before} | size_after={file_size_after}'
            )
        else:
            reencode_log.error(f'FAILED   | video_id={video_id} | track={corrupt_track} | duration={elapsed:.1f}s | stderr={result.stderr[:500]}')
            if os.path.exists(temp_path):
                os.remove(temp_path)
    except subprocess.TimeoutExpired:
        reencode_log.error(f'TIMEOUT  | video_id={video_id} | track={corrupt_track} | Exceeded timeout limit')
        temp_path = file_path + '.reencode.mp4'
        if os.path.exists(temp_path):
            os.remove(temp_path)
    except Exception as e:
        reencode_log.error(f'ERROR    | video_id={video_id} | {e}')
        temp_path = file_path + '.reencode.mp4'
        if os.path.exists(temp_path):
            os.remove(temp_path)
    finally:
        # Unlock the file
        with _reencode_lock:
            _reencode_in_progress.discard(video_id)
            if video_id in _file_locks:
                _file_locks[video_id].set()  # signal unlocked
                del _file_locks[video_id]
        reencode_log.info(f'UNLOCKED | video_id={video_id}')

@stream_bp.route('/stream/can-watch/<string:watch_id>', methods=['GET'])
@token_required
def can_watch_video(current_user, watch_id):
    """Check if a video is available for streaming or being processed"""
    # Parse the watch ID format
    parsed = parse_watch_id(watch_id)
    if not parsed:
        return jsonify(available=False, reason="invalid_id"), 400
    
    # Extract content information
    content_type = parsed['content_type']
    content_id = parsed['content_id']
    
    # For TV shows, use cached episode lookup
    if content_type == 'tv':
        season_number = parsed['season_number']
        episode_number = parsed['episode_number']
        video_id = get_episode_video_id_cached(content_id, season_number, episode_number)
        if not video_id:
            return jsonify(available=False, reason="not_found"), 404
    else:
        video_id = str(content_id)
    
    # Check if file exists
    file_path = os.path.join('uploads', f"{video_id}.mp4")
    if not os.path.exists(file_path):
        return jsonify(available=False, reason="not_found"), 404
    
    # Check if being processed
    with _reencode_lock:
        is_processing = video_id in _file_locks
    
    if is_processing:
        return jsonify(available=False, reason="processing"), 503
    
    return jsonify(available=True), 200

@stream_bp.route('/stream/<string:watch_id>', methods=['GET'])
def stream_video(watch_id):
    """Stream video content based on watch ID"""
    # Parse the watch ID format
    parsed = parse_watch_id(watch_id)
    if not parsed:
        return jsonify(message="Invalid watch ID format"), 400
    
    # Extract content information
    content_type = parsed['content_type']
    content_id = parsed['content_id']
    
    # For TV shows, use cached episode lookup to avoid DB queries
    if content_type == 'tv':
        season_number = parsed['season_number']
        episode_number = parsed['episode_number']
        
        # Use cached lookup - this avoids DB queries and session poisoning issues
        video_id = get_episode_video_id_cached(content_id, season_number, episode_number)
        
        if not video_id:
            # If cache lookup failed and returned None, return 404
            return jsonify(message="Episode not found"), 404
    else:
        # For movies, the content ID is the video ID
        video_id = str(content_id)
    
    # Check if the file exists
    mp4_path = os.path.join('uploads', f"{video_id}.mp4")
    if os.path.exists(mp4_path):
        file_path = mp4_path
        mimetype = 'video/mp4'
    else:
        return jsonify(message="File not found"), 404

    # Wait if the file is currently being re-encoded
    with _reencode_lock:
        lock_event = _file_locks.get(video_id)
    if lock_event is not None:
        # Wait up to 10 minutes for re-encode to finish
        finished = lock_event.wait(timeout=600)
        if not finished:
            return jsonify({"message": "Video is being processed, please try again later.", "error_reason": "video_processing"}), 503

    # Stream the video file
    try:
        return send_file(file_path, mimetype=mimetype)
    except FileNotFoundError:
        return jsonify({"message":"The content is not available", "error_reason": "video_not_found"}), 404
    except Exception as e:
        return jsonify({"message":"Our apologies, something went wrong on our end.", "error_reason": "video_error"}), 500


@stream_bp.route('/stream/report-error', methods=['POST'])
@token_required
def report_video_error(current_user):
    """Handle video decode error reports from the client.
    If the error is a decode error (code 3), re-encode the audio track in the background."""
    data = request.get_json()
    if not data:
        return jsonify(message="Missing request body"), 400

    watch_id = data.get('watch_id')
    error_code = data.get('error_code')
    error_message = data.get('error_message', '')

    if not watch_id:
        return jsonify(message="Missing watch_id"), 400

    # Only handle decode errors (code 3)
    if error_code != 3:
        return jsonify(message="Error reported", action="none"), 200

    # Resolve watch_id to actual file path
    parsed = parse_watch_id(watch_id)
    if not parsed:
        return jsonify(message="Invalid watch ID format"), 400

    content_type = parsed['content_type']
    content_id = parsed['content_id']

    if content_type == 'tv':
        video_id = get_episode_video_id_cached(content_id, parsed['season_number'], parsed['episode_number'])
        if not video_id:
            return jsonify(message="Episode not found"), 404
    else:
        video_id = str(content_id)

    file_path = os.path.join('uploads', f"{video_id}.mp4")
    if not os.path.exists(file_path):
        return jsonify(message="Video file not found"), 404

    # Check if already re-encoding
    with _reencode_lock:
        if video_id in _reencode_in_progress:
            return jsonify(message="Re-encode already in progress for this video", action="in_progress"), 200
        _reencode_in_progress.add(video_id)

    # Run re-encode in background thread
    reencode_log.info(f'REPORTED | video_id={video_id} | watch_id={watch_id} | user={current_user.username} | error_message={error_message[:200]}')
    thread = threading.Thread(
        target=_reencode_file,
        args=(file_path, video_id),
        kwargs={'watch_id': watch_id, 'error_message': error_message, 'reported_by': current_user.username},
        daemon=True
    )
    thread.start()

    return jsonify(message="Decode error received, re-encoding audio in background", action="reencode_started"), 200