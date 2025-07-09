import datetime
import os
import jwt
import json  # Add this import
from flask import request, jsonify
from tqdm import tqdm
from datetime import datetime, timedelta
from functools import wraps
import subprocess
from utils.logger import log_api
from utils.logger import log_warning, log_info, log_error

from models import User, BlacklistToken, db, Admin

role_hierarchy = {'superadmin': 3, 'admin': 2, 'moderator': 1}

# Global variable to track ffmpeg availability
ffmpeg_available = None

def check_ffmpeg_available():
    """Check if ffmpeg is available on the system"""
    global ffmpeg_available
    try:
        # Run a simple ffmpeg command to check if it's available
        subprocess.run(["ffmpeg", "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        ffmpeg_available = True
    except (subprocess.SubprocessError, FileNotFoundError):
        ffmpeg_available = False
    return ffmpeg_available

# Check ffmpeg availability when module is loaded
check_ffmpeg_available()

def ensure_upload_folder_exists():
    upload_folder = 'uploads'
    if not os.path.exists(upload_folder):
        os.makedirs(upload_folder)

def save_with_progress(src_file, dst_path, convert_to_mp4=True):
    """
    Save the uploaded file with a progress bar, optionally converting to MP4 format.
    If conversion is enabled and the source is not an MP4, it will be converted using ffmpeg.
    
    Args:
        src_file: The source file (from request.files)
        dst_path: The destination file path
        convert_to_mp4: Whether to convert non-MP4 files to MP4 format (default: True)
    """
    total_size = request.content_length
    chunk_size = 1024 * 1024  # 1MB
    progress_bar = tqdm(total=total_size, unit='B', unit_scale=True)
    
    # Check if source file is an MP4
    src_filename = src_file.filename
    _, src_ext = os.path.splitext(src_filename)
    is_src_mp4 = src_ext.lower() == '.mp4'
    
    # Check if we should attempt conversion
    should_convert = convert_to_mp4 and not is_src_mp4 and ffmpeg_available
    
    # Ensure dst_path has .mp4 extension when conversion is needed
    if should_convert:
        # Replace any existing extension with .mp4
        dst_path = os.path.splitext(dst_path)[0] + '.mp4'
    
    # If it's already an MP4, we don't need conversion, or ffmpeg is not available
    if is_src_mp4 or not convert_to_mp4 or not ffmpeg_available:
        # Just save directly
        with open(dst_path, 'wb') as f:
            while True:
                chunk = src_file.stream.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                progress_bar.update(len(chunk))
        
        progress_bar.close()
        if convert_to_mp4 and not is_src_mp4 and not ffmpeg_available:
            log_warning("ffmpeg not available. File saved without conversion.")
        return
    
    # For non-MP4 files that need conversion
    # Create a temporary file path with original extension
    temp_path = dst_path + ".temp" + src_ext
    
    # Save the uploaded file to the temporary path
    with open(temp_path, 'wb') as f:
        while True:
            chunk = src_file.stream.read(chunk_size)
            if not chunk:
                break
            f.write(chunk)
            progress_bar.update(len(chunk))
    
    progress_bar.close()
    
    try:
        # Convert to MP4
        log_info(f"Converting to mp4: {dst_path}")
        subprocess.run(["ffmpeg", "-i", temp_path, dst_path], check=True)
        
        # Remove the temporary file
        os.remove(temp_path)
        
    except subprocess.SubprocessError as e:
        # Clean up both files on error
        if os.path.exists(dst_path):
            os.remove(dst_path)
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise Exception(f"Video conversion failed: {str(e)}")
    except FileNotFoundError:
        # Clean up the temporary file
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise Exception("Video conversion failed: ffmpeg is not installed or not in PATH")

def validate_episode_data(title_data, required_fields= ['title', 'id', 'overview', 'release_date', 'vote_average', 'genres', 'runtime'], season_number=0, episode_number=0):
    for field in required_fields:
        if field not in title_data or not title_data[field]:
            return jsonify(message=f'No {field} Provided For Season {season_number} Episode {episode_number}'), 400
    return None

def validate_title_data(title_data, required_fields= ['title', 'id', 'overview', 'release_date', 'vote_average', 'genres', 'runtime']):
    for field in required_fields:
        if field not in title_data or not title_data[field]:
            return jsonify(message=f'No {field} Provided'), 400
    return None

def generate_token(user_id):
    payload = {
        'exp': datetime.utcnow() + timedelta(days=10),
        'iat': datetime.utcnow(),
        'sub': str(user_id)  # ensure subject is a string
    }
    return jwt.encode(payload, 'test', algorithm='HS256')

def generate_admin_token(admin_id, role):
    payload = {
        'exp': datetime.utcnow() + timedelta(days=1),
        'iat': datetime.utcnow(),
        'sub': str(admin_id),  # ensure subject is a string
        'role': role
    }
    return jwt.encode(payload, 'test', algorithm='HS256')

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        endpoint = request.path
        if not token:
            return jsonify({'message': 'Token is missing!', "error_reason": "token_missing"}), 403

        try:
            token = token.split(" ")[1]
            data = jwt.decode(token.strip(), 'test', algorithms=['HS256'])
            current_user = User.query.get(data['sub'])

            if not current_user:
                return jsonify({'message': 'User not found', "error_reason": "user_not_exist"}), 404

            if BlacklistToken.query.filter_by(token=token).one_or_none():
                return jsonify({'message': 'Token has been blacklisted!', "error_reason": "user_logged_out"}), 403

            if current_user.is_banned and "logout" not in endpoint:
                if current_user.ban_until and current_user.ban_until > datetime.utcnow():
                    return jsonify({'message': 'You are temporarily banned until ' + str(current_user.ban_until) + f". For {current_user.ban_reason}", "error_reason": "user_temp_banned"}), 403
                elif not current_user.ban_until:
                    return jsonify({'message': 'You are  permanently banned.' + f" For {current_user.ban_reason}", 'reason': current_user.ban_reason, "error_reason": "user_perm_banned"}), 403
                else:
                    current_user.is_banned = False
                    current_user.ban_reason = None
                    current_user.ban_until = None
                    db.session.commit()
        except jwt.ExpiredSignatureError:
            return jsonify({'message': 'Token has expired!', "error_reason": "token_expired"}), 403
        except jwt.InvalidTokenError as e:
            log_error(f"InvalidTokenError: {e}")
            return jsonify({'message': 'Token is invalid!', "error_reason": "token_invalid"}), 403

        return f(current_user, *args, **kwargs)
    return decorated

def admin_token_required(required_role):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            token = request.headers.get('Authorization')

            if not token:
                return jsonify({'message': 'Token is missing!', "error_reason": "admin_token_missing"}), 403

            try:
                token = token.split(" ")[1]
                data = jwt.decode(token, 'test', algorithms=['HS256'])
                current_admin = Admin.query.get(data['sub'])
                if not current_admin:
                    return jsonify({'message': 'Admin not found.', "error_reason": "admin_not_exist"}), 404

                # Check if admin account is disabled
                if current_admin.disabled:
                    return jsonify({'message': 'Admin account has been disabled. Please contact a superadmin.', "error_reason": "admin_account_disabled"}), 403

                if BlacklistToken.query.filter_by(token=token).one_or_none():
                    return jsonify({'message': 'Token has been blacklisted!', "error_reason": "admin_logged_out"}), 403

                if role_hierarchy.get(current_admin.role, 0) < role_hierarchy.get(required_role, 0):
                    return jsonify({'message': f'Access denied! {required_role} role is required.', "error_reason": "admin_access_denied"}), 403

            except jwt.ExpiredSignatureError:
                return jsonify({'message': 'Token has expired!', "error_reason": "admin_token_expired"}), 403
            except jwt.InvalidTokenError:
                return jsonify({'message': 'Token is invalid!', "error_reason": "admin_token_invalid"}), 403

            return f(current_admin, *args, **kwargs)
        return decorated_function
    return decorator

def sort(query, order, sort_by=None):
    """
    Sorts a SQLAlchemy query based on the provided order and optional sort_by parameters.

    :param query: SQLAlchemy query object
    :param order: The order direction ('asc' or 'desc')
    :param sort_by: The field to sort by (optional)
    :return: Sorted SQLAlchemy query object
    """
    if sort_by:
        if order.lower() == 'asc':
            query = query.order_by(getattr(sort_by, 'asc')())
        elif order.lower() == 'desc':
            query = query.order_by(getattr(sort_by, 'desc')())
    else:
        if order.lower() == 'asc':
            query = query.order_by(None)
        elif order.lower() == 'desc':
            query = query.order_by('desc')

    return query

def create_watch_id(content_type, content_id, season_number=None, episode_number=None):
    """Create a watch ID in the format m-{id} or t-{id}-{season}-{episode}"""
    if content_type == 'movie':
        return f"m-{content_id}"
    elif content_type == 'tv':
        return f"t-{content_id}-{season_number}-{episode_number}"
    return None

def parse_watch_id(watch_id):
    """Parse a watch ID into its components"""
    parts = watch_id.split('-')
    
    if len(parts) < 2:
        return None
    
    if parts[0] == 'm':
        return {
            'content_type': 'movie',
            'content_id': int(parts[1])
        }
    elif parts[0] == 't' and len(parts) >= 4:
        return {
            'content_type': 'tv',
            'content_id': int(parts[1]),
            'season_number': int(parts[2]),
            'episode_number': int(parts[3])
        }
    return None

def serialize_watch_history(content_id, content_type, current_user, season_number=None, episode_number=None, include_next_episode=True):
    """
    Return a serialized watch history for a given content (movie or TV show episode)
    
    Args:
        content_id (int): The ID of the content
        content_type (str): Either 'movie' or 'tv'
        current_user (User): The current user object
        season_number (int, optional): Required for TV shows
        episode_number (int, optional): Required for TV shows
        include_next_episode (bool): Whether to include next episode information
        
    Returns:
        dict: Serialized watch history information, or None if no history found
    """
    from models import WatchHistory, TVShow, Season, Episode
    from api.routes.watch_history import get_next_episode_info
    from sqlalchemy import func, desc
    
    # Check if entry exists in database
    query = WatchHistory.query.filter_by(
        user_id=current_user.id,
        content_id=content_id,
        content_type=content_type
    )

    log_info(f"Querying watch history for user {current_user.id}, content {content_id}, type {content_type}")
    
    if content_type == 'tv' and season_number and episode_number:
        # If specific episode requested, get that one
        query = query.filter_by(
            season_number=season_number,
            episode_number=episode_number
        )
    elif content_type == 'tv':
        # If no specific episode requested, get the last watched one
        query = query.order_by(desc(WatchHistory.last_watched))
    
    watch_history = query.first()
    
    if not watch_history:
        log_info(f"No watch history found for user {current_user.id}, content {content_id}, type {content_type}")
        return None
        
    # Base response
    response = {
        'content_type': watch_history.content_type,
        'content_id': watch_history.content_id,
        'watch_timestamp': watch_history.watch_timestamp,
        'total_duration': watch_history.total_duration,
        'progress_percentage': watch_history.progress_percentage,
        'is_completed': watch_history.is_completed,
        'last_watched': watch_history.last_watched.isoformat()
    }
    
    # Add TV show specific fields
    if watch_history.content_type == 'tv':
        response['season_number'] = watch_history.season_number
        response['episode_number'] = watch_history.episode_number
        response['episode_id'] = create_watch_id('tv', watch_history.content_id, 
                                             watch_history.season_number, 
                                             watch_history.episode_number)
        
        # Add episode details if possible
        try:
            show = TVShow.query.filter_by(show_id=content_id).first()
            last_episode = False
            finished_show = False
            
            if show:
                season = Season.query.filter_by(
                    tvshow_id=content_id,
                    season_number=watch_history.season_number
                ).first()
                
                if season:
                    episode = Episode.query.filter_by(
                        season_id=season.id,
                        episode_number=watch_history.episode_number
                    ).first()
                    
                    if episode:
                        response['episode_details'] = {
                            'title': episode.title,
                            'overview': episode.overview,
                            'runtime': episode.runtime
                        }
                
                # Check if this is the last episode
                last_season = Season.query.filter_by(tvshow_id=content_id).order_by(Season.season_number.desc()).first()
                if last_season and last_season.season_number == watch_history.season_number:
                    last_episode_in_season = Episode.query.filter_by(season_id=last_season.id).order_by(Episode.episode_number.desc()).first()
                    if last_episode_in_season and last_episode_in_season.episode_number == watch_history.episode_number:
                        last_episode = True
                
                # Check if user has finished the entire show
                if last_episode and watch_history.is_completed:
                    # Check if all episodes are completed
                    all_seasons = Season.query.filter_by(tvshow_id=content_id).all()
                    all_completed = True
                    
                    for s in all_seasons:
                        all_episodes = Episode.query.filter_by(season_id=s.id).all()
                        for e in all_episodes:
                            # Skip current episode as we already know it's completed
                            if s.season_number == watch_history.season_number and e.episode_number == watch_history.episode_number:
                                continue
                                
                            # Check if this episode has been watched and completed
                            ep_history = WatchHistory.query.filter_by(
                                user_id=current_user.id,
                                content_id=content_id,
                                content_type='tv',
                                season_number=s.season_number,
                                episode_number=e.episode_number,
                                is_completed=True
                            ).first()
                            
                            if not ep_history:
                                all_completed = False
                                break
                        
                        if not all_completed:
                            break
                    
                    finished_show = all_completed
            
            response['last_episode'] = last_episode
            response['finished_show'] = finished_show
            
        except Exception as e:
            log_error(f"Error determining episode status: {e}")
            response['last_episode'] = False
            response['finished_show'] = False
    else:
        response['episode_id'] = create_watch_id('movie', watch_history.content_id)
    
    # Include next episode info if requested and the current episode is completed
    if include_next_episode and watch_history.content_type == 'tv' and watch_history.is_completed:
        next_episode_info = get_next_episode_info(current_user, watch_history)
        if next_episode_info:
            response['next_episode'] = next_episode_info
    
    return response

def setup_request_logging(app):
    """Setup request logging with after_request handler"""
    # Disable Flask's default Werkzeug logger
    import logging
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)

    # Define excluded paths
    excluded_paths = ['/images/', '/stream/']
    
    @app.before_request
    def before_request():
        request.start_time = datetime.now()
        
    @app.after_request
    def log_request(response):
        if request.path.startswith(('/api/', '/cdn/')):
            # Calculate request duration
            duration = None
            if hasattr(request, 'start_time'):
                duration_delta = datetime.now() - request.start_time
                duration = round(duration_delta.total_seconds() * 1000)
            
            # Try to get authenticated user from token if present
            user_id = None
            session_id = request.headers.get('X-Session-ID')
            token = request.headers.get('Authorization')
            
            if token:
                try:
                    token = token.split(" ")[1]
                    data = jwt.decode(token.strip(), 'test', algorithms=['HS256'])
                    
                    if 'role' in data:  # Admin token
                        from models import Admin
                        current_admin = Admin.query.get(data['sub'])
                        if current_admin:
                            user_id = f"admin:{current_admin.id}"
                    else:  # User token
                        from models import User
                        current_user = User.query.get(data['sub'])
                        if current_user:
                            user_id = current_user.id
                except Exception as e:
                    log_error(f"Error decoding token: {e}")

            # Get client IP
            ip = request.remote_addr
            
            # Format log message
            log_api(request.method, request.path, response.status_code, user_id, ip, duration)
            
            # Log to UserActivity table
            # if not any(excluded_path in request.path for excluded_path in excluded_paths):
            #     try:
            #         from models import UserActivity, db
                    
            #         # Extract request details but limit size to prevent DB overload
            #         query_params = None
            #         if request.query_string:
            #             query_dict = {k: v for k, v in request.args.items()}
            #             query_params = json.dumps(query_dict)[:255]  # Limit size
                        
            #         # Create activity record
            #         activity = UserActivity(
            #             session_id=session_id,
            #             user_id=user_id,
            #             endpoint=request.endpoint or "unknown",
            #             method=request.method,
            #             path=request.path[:255],  # Limit size
            #             query_params=query_params,
            #             referrer=request.referrer[:255] if request.referrer else None,
            #             timestamp=datetime.utcnow(),
            #             response_time_ms=duration,
            #             status_code=response.status_code
            #         )
                    
            #         db.session.add(activity)
            #         db.session.commit()
            #     except Exception as e:
            #         log_error(f"Error logging activity: {e}")
            #         # Don't let logging failures affect the response
            #         pass
            
        return response
        
    return app