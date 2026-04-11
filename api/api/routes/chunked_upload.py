"""
Chunked / resumable upload endpoints.

Upload flow
-----------
1. Frontend splits file into ~10 MB chunks.
2. For each chunk call  POST /api/upload/chunk
3. Call  GET /api/upload/chunk/status/<upload_id>  to resume after interruptions.
4. After all chunks are transferred:
     - movies  →  POST /api/upload/finalize/movie
     - episodes → POST /api/upload/finalize/episode  (one per episode)
     - show DB  →  POST /api/upload/finalize/show   (once all episodes done)
5. Optional cleanup:  DELETE /api/upload/chunk/<upload_id>
"""

import json
import os
import re
import shutil
from datetime import datetime

from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename

from api.utils import (
    ensure_upload_folder_exists,
    validate_title_data,
    validate_episode_data,
    admin_token_required,
)
from paths import UPLOADS_DIR, TEMP_UPLOAD_DIR
from utils.logger import log_error, log_info, log_success, log_warning

chunked_upload_bp = Blueprint('chunked_upload_bp', __name__, url_prefix='/api/upload')


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _safe_upload_id(upload_id: str) -> str:
    """
    Return a filesystem-safe version of an upload_id.
    Only keep alphanumerics, dashes and underscores so that
    secure_filename cannot turn it into an empty string.
    """
    cleaned = re.sub(r'[^A-Za-z0-9_\-]', '_', upload_id)
    return cleaned[:128]  # cap length


def _temp_dir(upload_id: str) -> str:
    return os.path.join(TEMP_UPLOAD_DIR, _safe_upload_id(upload_id))


def _ensure_temp_dir(upload_id: str) -> str:
    path = _temp_dir(upload_id)
    os.makedirs(path, exist_ok=True)
    return path


def _received_chunks(upload_id: str):
    """Return sorted list of already-received chunk indices."""
    d = _temp_dir(upload_id)
    if not os.path.isdir(d):
        return []
    received = []
    for name in os.listdir(d):
        if name.startswith('chunk_'):
            try:
                received.append(int(name.split('_', 1)[1]))
            except ValueError:
                pass
    return sorted(received)


def _assemble_chunks(upload_id: str, dest_path: str, total_chunks: int):
    """
    Concatenate chunk_0 … chunk_(total_chunks-1) into *dest_path*.
    Raises ValueError if any chunk is missing, OSError on I/O problems.
    """
    d = _temp_dir(upload_id)
    missing = [i for i in range(total_chunks) if not os.path.isfile(os.path.join(d, f'chunk_{i}'))]
    if missing:
        raise ValueError(f"Missing chunks: {missing}")

    os.makedirs(os.path.dirname(dest_path) if os.path.dirname(dest_path) else '.', exist_ok=True)

    with open(dest_path, 'wb') as out:
        for i in range(total_chunks):
            chunk_path = os.path.join(d, f'chunk_{i}')
            with open(chunk_path, 'rb') as cf:
                shutil.copyfileobj(cf, out)

    shutil.rmtree(d, ignore_errors=True)


# ---------------------------------------------------------------------------
# chunk upload / status / abort
# ---------------------------------------------------------------------------

@chunked_upload_bp.route('/chunk', methods=['POST'])
@admin_token_required('moderator')
def upload_chunk(current_admin):
    """Receive a single chunk and persist it to the temp directory."""
    upload_id = request.form.get('upload_id', '').strip()
    chunk_index = request.form.get('chunk_index', type=int)
    total_chunks = request.form.get('total_chunks', type=int)

    if not upload_id or chunk_index is None or not total_chunks:
        return jsonify(message='upload_id, chunk_index and total_chunks are required'), 400

    if 'chunk' not in request.files:
        return jsonify(message='No chunk file provided'), 400

    chunk_file = request.files['chunk']
    d = _ensure_temp_dir(upload_id)
    chunk_path = os.path.join(d, f'chunk_{chunk_index}')
    chunk_file.save(chunk_path)

    log_info(f"Chunk {chunk_index}/{total_chunks - 1} saved for upload_id={upload_id}")
    return jsonify(
        success=True,
        upload_id=upload_id,
        chunk_index=chunk_index,
        total_chunks=total_chunks,
    ), 200


@chunked_upload_bp.route('/chunk/status/<path:upload_id>', methods=['GET'])
@admin_token_required('moderator')
def get_chunk_status(current_admin, upload_id):
    """Return which chunks have already been received for *upload_id*."""
    received = _received_chunks(upload_id)
    return jsonify(
        upload_id=upload_id,
        received_chunks=received,
        status='in_progress' if received else 'not_started',
    ), 200


@chunked_upload_bp.route('/chunk/<path:upload_id>', methods=['DELETE'])
@admin_token_required('moderator')
def abort_chunk_upload(current_admin, upload_id):
    """Delete all temp chunks for *upload_id*."""
    d = _temp_dir(upload_id)
    if os.path.isdir(d):
        shutil.rmtree(d, ignore_errors=True)
    return jsonify(success=True, message='Upload aborted and temp files removed'), 200


# ---------------------------------------------------------------------------
# finalize movie
# ---------------------------------------------------------------------------

@chunked_upload_bp.route('/finalize/movie', methods=['POST'])
@admin_token_required('moderator')
def finalize_movie(current_admin):
    """
    Assemble chunks into the final .mp4 file, then write the movie record to DB.
    Accepts the same form fields as POST /api/upload/movie plus upload_id and
    total_chunks.
    """
    from models import db, Movie, UploadRequest
    from api.routes.upload import (
        get_video_duration_in_minutes,
        validate_video_file as _unused,  # noqa – kept for reference
    )

    upload_id = request.form.get('upload_id', '').strip()
    total_chunks = request.form.get('total_chunks', type=int)

    if not upload_id or not total_chunks:
        return jsonify(message='upload_id and total_chunks are required'), 400

    movie_data = {
        'id': request.form.get('id', type=int),
        'title': request.form.get('title', type=str),
        'overview': request.form.get('overview', type=str),
        'tagline': request.form.get('tagline', '', type=str),
        'release_date': request.form.get('release_date', type=str),
        'vote_average': request.form.get('vote_average', type=float),
        'genres': request.form.get('genres', type=str),
        'keywords': request.form.get('keywords', '', type=str),
        'poster_path': request.form.get('poster_path', '', type=str),
        'backdrop_path': request.form.get('backdrop_path', '', type=str),
        'runtime': request.form.get('runtime', type=int),
        'production_companies': request.form.get('production_companies', '', type=str),
        'production_countries': request.form.get('production_countries', '', type=str),
        'spoken_languages': request.form.get('spoken_languages', '', type=str),
        'budget': request.form.get('budget', type=int),
        'revenue': request.form.get('revenue', type=int),
        'status': request.form.get('status', '', type=str),
        'has_subtitles': request.form.get('has_subtitles', type=bool),
        'in_production': request.form.get('in_production', type=bool),
        'force': request.form.get('force', False, type=bool),
    }

    existing_movie = Movie.query.filter_by(movie_id=movie_data['id']).first()
    if existing_movie and not movie_data['force']:
        return jsonify(message=f"A movie with id {movie_data['id']} already exists in the database."), 400

    error = validate_title_data(movie_data)
    if error:
        return error

    ensure_upload_folder_exists()
    video_path = os.path.join(UPLOADS_DIR, f"{movie_data['id']}.mp4")

    if os.path.exists(video_path) and not movie_data['force']:
        return jsonify(message='A video file with the same id already exists.'), 400

    # Assemble chunks
    try:
        _assemble_chunks(upload_id, video_path, total_chunks)
    except ValueError as e:
        return jsonify(message=str(e)), 400
    except Exception as e:
        log_error(f"Chunk assembly failed for movie {movie_data['id']}: {e}")
        return jsonify(message=f"File assembly failed: {str(e)}"), 500

    # Detect runtime
    detected_runtime = get_video_duration_in_minutes(video_path)
    if detected_runtime:
        movie_data['runtime'] = detected_runtime
    elif not movie_data.get('runtime'):
        if os.path.exists(video_path):
            os.remove(video_path)
        return jsonify(message='Could not detect video runtime and none was provided.'), 400

    # Write to DB
    new_movie = Movie(
        movie_id=movie_data['id'],
        title=movie_data['title'],
        overview=movie_data['overview'],
        tagline=movie_data['tagline'],
        release_date=movie_data['release_date'],
        vote_average=movie_data['vote_average'],
        genres=movie_data['genres'],
        keywords=movie_data['keywords'],
        poster_path=movie_data['poster_path'],
        backdrop_path=movie_data['backdrop_path'],
        runtime=movie_data['runtime'],
        production_companies=movie_data['production_companies'],
        production_countries=movie_data['production_countries'],
        spoken_languages=movie_data['spoken_languages'],
        budget=movie_data['budget'],
        revenue=movie_data['revenue'],
        status=movie_data['status'],
        video_id=movie_data['id'],
        has_subtitles=movie_data['has_subtitles'],
        in_production=movie_data['in_production'],
    )

    try:
        if existing_movie and movie_data['force']:
            db.session.delete(existing_movie)
            db.session.commit()
        existing_requests = UploadRequest.query.filter_by(
            content_id=movie_data['id'], content_type='movie'
        ).all()
        for req in existing_requests:
            db.session.delete(req)
        db.session.add(new_movie)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        log_error(f"DB write failed for movie {movie_data['id']}: {e}")
        return jsonify(message=f"Database error: {str(e)}"), 500

    log_success(
        f"Movie '{movie_data['title']}' (ID: {movie_data['id']}) "
        f"finalized by {current_admin.username}"
    )
    forced_text = ' (Forced)' if existing_movie and movie_data['force'] else ''
    return jsonify(
        message=f"Movie '{movie_data['title']}'{forced_text} uploaded successfully."
    ), 200


# ---------------------------------------------------------------------------
# finalize episode  (assembles video file only – no DB write)
# ---------------------------------------------------------------------------

@chunked_upload_bp.route('/finalize/episode', methods=['POST'])
@admin_token_required('moderator')
def finalize_episode(current_admin):
    """
    Assemble chunk files for one TV episode into the final .mp4.
    Returns the video_id and detected runtime so the caller can persist the DB
    record later via POST /api/upload/finalize/show.

    Required form fields:
        upload_id, total_chunks, show_id, season_number, episode_number
    Optional:
        force  (bool, default false)
    """
    from api.routes.upload import get_video_duration_in_minutes

    upload_id = request.form.get('upload_id', '').strip()
    total_chunks = request.form.get('total_chunks', type=int)
    show_id = request.form.get('show_id', type=int)
    season_number = request.form.get('season_number', type=int)
    episode_number = request.form.get('episode_number', type=int)
    force = request.form.get('force', 'false').lower() == 'true'

    if not all([upload_id, total_chunks, show_id, season_number is not None, episode_number is not None]):
        return jsonify(message='upload_id, total_chunks, show_id, season_number and episode_number are required'), 400

    video_id = int(f'{show_id}{season_number}{episode_number}')
    video_path = os.path.join(UPLOADS_DIR, f'{video_id}.mp4')

    if os.path.exists(video_path) and not force:
        return jsonify(
            message=f'Video for S{season_number}E{episode_number} already exists. Use force=true to overwrite.'
        ), 400

    ensure_upload_folder_exists()

    try:
        _assemble_chunks(upload_id, video_path, total_chunks)
    except ValueError as e:
        return jsonify(message=str(e)), 400
    except Exception as e:
        log_error(f"Chunk assembly failed for S{season_number}E{episode_number}: {e}")
        return jsonify(message=f"File assembly failed: {str(e)}"), 500

    detected_runtime = get_video_duration_in_minutes(video_path)

    log_success(
        f"Episode S{season_number}E{episode_number} (video_id={video_id}) assembled "
        f"by {current_admin.username}"
    )
    return jsonify(
        success=True,
        video_id=video_id,
        runtime=detected_runtime,
    ), 200


# ---------------------------------------------------------------------------
# finalize show  (DB write only – all episode files already assembled)
# ---------------------------------------------------------------------------

@chunked_upload_bp.route('/finalize/show', methods=['POST'])
@admin_token_required('moderator')
def finalize_show(current_admin):
    """
    Create the TV show, seasons and episodes in the database.
    All episode video files must already be on disk (assembled via
    POST /api/upload/finalize/episode).

    Body (JSON):
    {
        "show": { show metadata fields },
        "seasons": [
            {
                "season_number": 1,
                "episodes": [
                    {
                        "episode_number": 1,
                        "title": "...",
                        "overview": "...",
                        "has_subtitles": false,
                        "runtime": 42,
                        "video_id": 12310101
                    }
                ]
            }
        ]
    }
    """
    from models import db, TVShow, Season, Episode

    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify(message='JSON body is required'), 400

    show_raw = data.get('show', {})
    seasons_data = data.get('seasons', [])

    if not show_raw or not seasons_data:
        return jsonify(message='show and seasons are required'), 400

    show_id = show_raw.get('show_id')
    if not show_id:
        return jsonify(message='show.show_id is required'), 400

    existing_show = TVShow.query.filter_by(show_id=show_id).first()
    if existing_show:
        return jsonify(message=f"A TV show with id {show_id} already exists."), 400

    # Parse dates
    def _parse_date(val):
        if not val:
            return None
        for fmt in ('%Y-%m-%d', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M:%S.%f'):
            try:
                return datetime.strptime(val[:len(fmt) - 2], fmt[:len(fmt) - 2])
            except ValueError:
                pass
        try:
            return datetime.strptime(val[:10], '%Y-%m-%d')
        except ValueError:
            return None

    new_show = TVShow(
        show_id=show_id,
        title=show_raw.get('title', ''),
        genres=show_raw.get('genres', ''),
        created_by=show_raw.get('created_by', ''),
        overview=show_raw.get('overview', ''),
        poster_path=show_raw.get('poster_path', ''),
        backdrop_path=show_raw.get('backdrop_path', ''),
        vote_average=show_raw.get('vote_average'),
        tagline=show_raw.get('tagline', ''),
        spoken_languages=show_raw.get('spoken_languages', ''),
        first_air_date=_parse_date(show_raw.get('first_air_date')),
        last_air_date=_parse_date(show_raw.get('last_air_date')),
        production_companies=show_raw.get('production_companies', ''),
        production_countries=show_raw.get('production_countries', ''),
        networks=show_raw.get('networks', ''),
        status=show_raw.get('status', ''),
        seasons=[],
    )

    try:
        db.session.add(new_show)
        db.session.flush()  # get show_id without committing

        for season_data in seasons_data:
            season_number = season_data.get('season_number')
            if season_number is None:
                db.session.rollback()
                return jsonify(message='season_number is required in each season'), 400

            season_id = int(f'{show_id}{season_number}')
            season = Season(
                id=season_id,
                season_number=season_number,
                tvshow_id=show_id,
                episode=[],
            )
            db.session.add(season)
            db.session.flush()

            for ep_data in season_data.get('episodes', []):
                episode_number = ep_data.get('episode_number')
                if episode_number is None:
                    db.session.rollback()
                    return jsonify(message='episode_number is required in each episode'), 400

                video_id = ep_data.get('video_id', int(f'{show_id}{season_number}{episode_number}'))

                has_subtitles_val = ep_data.get('has_subtitles', False)
                if isinstance(has_subtitles_val, str):
                    has_subtitles_val = has_subtitles_val.lower() == 'true'

                episode = Episode(
                    id=video_id,
                    episode_number=episode_number,
                    title=ep_data.get('title', f'Episode {episode_number}'),
                    overview=ep_data.get('overview', ''),
                    has_subtitles=has_subtitles_val,
                    video_id=video_id,
                    runtime=ep_data.get('runtime', 0),
                )
                episode.season_id = season_id
                db.session.add(episode)

        db.session.commit()
    except Exception as e:
        db.session.rollback()
        log_error(f"DB write failed for show {show_id}: {e}")
        return jsonify(message=f"Database error: {str(e)}"), 500

    log_success(
        f"TV show '{new_show.title}' (ID: {show_id}) finalized by {current_admin.username}"
    )
    return jsonify(
        message=f"TV Show '{new_show.title}' uploaded successfully with all seasons and episodes."
    ), 200
