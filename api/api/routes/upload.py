import json
from datetime import datetime
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from werkzeug.datastructures import FileStorage
from api.utils import ensure_upload_folder_exists, save_with_progress, validate_title_data, validate_episode_data, admin_token_required
from models import Movie, TVShow, Season, Episode
import os
import subprocess
import json
from tqdm import tqdm
from pprint import pprint
from utils.logger import log_success, log_error, log_warning, log_info

upload_bp = Blueprint('upload_bp', __name__, url_prefix='/api/upload')

def get_video_metadata(video_path):
    """Extract metadata from video file using FFmpeg"""
    try:
        cmd = [
            'ffprobe', 
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            log_error(f"Error running ffprobe: {result.stderr}")
            return None
            
        metadata = json.loads(result.stdout)
        return metadata
    except Exception as e:
        log_error(f"Error getting video metadata: {str(e)}")
        return None

def get_video_duration_in_minutes(video_path):
    """Get video duration in minutes using FFmpeg"""
    try:
        metadata = get_video_metadata(video_path)
        if not metadata or 'format' not in metadata:
            return None
            
        # Get duration in seconds
        duration_seconds = float(metadata['format']['duration'])
        # Convert to minutes and round
        duration_minutes = round(duration_seconds / 60)
        return duration_minutes
    except Exception as e:
        log_error(f"Error calculating video duration: {str(e)}")
        return None

def get_file_size(file_path):
    """Get file size in bytes"""
    try:
        return os.path.getsize(file_path)
    except OSError as e:
        log_error(f"Error getting file size for {file_path}: {str(e)}")
        return None

def get_file_modified_date(file_path):
    """Get file modification date"""
    try:
        timestamp = os.path.getmtime(file_path)
        return datetime.fromtimestamp(timestamp)
    except OSError as e:
        log_error(f"Error getting file modified date for {file_path}: {str(e)}")
        return None

def validate_video_quality(video_path):
    """Validate video quality parameters"""
    try:
        metadata = get_video_metadata(video_path)
        if not metadata:
            return [], ["Could not read video metadata"]
        
        warnings = []
        errors = []
        
        # Find video stream
        video_stream = None
        for stream in metadata.get('streams', []):
            if stream.get('codec_type') == 'video':
                video_stream = stream
                break
        
        if not video_stream:
            errors.append("No video stream found in file")
            return warnings, errors
        
        # Check resolution
        width = video_stream.get('width', 0)
        height = video_stream.get('height', 0)
        
        if width < 640 or height < 480:
            warnings.append(f"Low resolution: {width}x{height}. Recommended minimum: 640x480")
        elif width >= 3840 and height >= 2160:
            warnings.append(f"4K content detected: {width}x{height}. Ensure sufficient storage space")
        
        # Check bitrate
        bit_rate = video_stream.get('bit_rate')
        if bit_rate:
            bit_rate = int(bit_rate)
            if bit_rate < 500000:  # 500 kbps
                warnings.append(f"Low bitrate: {bit_rate // 1000} kbps. Quality may be poor")
            elif bit_rate > 50000000:  # 50 Mbps
                warnings.append(f"Very high bitrate: {bit_rate // 1000000} Mbps. Large file size expected")
        
        # Check codec
        codec = video_stream.get('codec_name', '').lower()
        if codec not in ['h264', 'h265', 'hevc', 'av1']:
            warnings.append(f"Unusual video codec: {codec}. Compatibility may vary")
        
        return warnings, errors
    except Exception as e:
        log_error(f"Error validating video quality: {str(e)}")
        return [], ["Error analyzing video quality"]

def validate_language(content_data):
    """Validate language information"""
    warnings = []
    common_languages = [
        'af', 'am', 'ar', 'as', 'az', 'bg', 'bn', 'br', 'ca', 'co', 'cs', 'cy',
        'da', 'de', 'el', 'en', 'es', 'et', 'eu', 'fi', 'fo', 'fr', 'fur', 'ga', 
        'gl', 'gu', 'ha', 'he', 'hi', 'hr', 'hu', 'hy', 'id', 'ig', 'is', 'it', 
        'ja', 'ka', 'kk', 'km', 'kn', 'ko', 'ky', 'lad', 'lb', 'lo', 'lt', 'lv', 
        'ml', 'mn', 'ms', 'mt', 'my', 'ne', 'nl', 'no', 'or', 'pa', 'pl', 'pt', 
        'rm', 'ro', 'ru', 'sc', 'si', 'sk', 'sp', 'sl', 'sv', 'sw', 'ta', 'te', 'th', 
        'ti', 'tk', 'tl', 'tr', 'ur', 'uz', 'vi', 'xh', 'yo', 'zh', 'zu'
    ]
    
    spoken_languages = content_data.get('spoken_languages', [])
    if isinstance(spoken_languages, str):
        spoken_languages = [spoken_languages]
    
    if not spoken_languages:
        warnings.append("No language information available")
    else:
        for lang in spoken_languages:
            if isinstance(lang, dict):
                lang_code = lang.get('iso_639_1', '').lower()
            else:
                lang_code = str(lang).lower()[:2]
            
            if lang_code and lang_code not in common_languages:
                warnings.append(f"Uncommon language detected: {lang_code}")
    
    return warnings

def validate_genres(content_data, content_type):
    """Validate genre information"""
    valid_genres = {
        'movie': [
            'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
            'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery',
            'Romance', 'Science Fiction', 'TV Movie', 'Thriller', 'War', 'Western'
        ],
        'tv': [
            'Action & Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
            'Drama', 'Family', 'Kids', 'Mystery', 'News', 'Reality', 'Sci-Fi & Fantasy',
            'Soap', 'Talk', 'War & Politics', 'Western'
        ]
    }
    
    warnings = []
    genres = content_data.get('genres', [])
    
    if isinstance(genres, str):
        genres = [g.strip() for g in genres.split(',')]
    elif isinstance(genres, list) and genres and isinstance(genres[0], dict):
        genres = [g.get('name', '') for g in genres]
    
    if not genres:
        warnings.append("No genre information available")
        return warnings
    
    valid_list = valid_genres.get(content_type, [])
    for genre in genres:
        if genre and genre not in valid_list:
            warnings.append(f"Unusual genre: {genre}")
    
    return warnings

def validate_runtime(runtime, content_type):
    """Validate runtime duration"""
    warnings = []
    
    if not runtime:
        warnings.append("No runtime information available")
        return warnings
    
    try:
        runtime = int(runtime)
        if content_type == 'movie':
            if runtime < 60:
                warnings.append(f"Very short movie: {runtime} minutes. Typical movies are 90+ minutes")
            elif runtime > 300:
                warnings.append(f"Very long movie: {runtime} minutes. Verify this is correct")
        elif content_type == 'tv':
            if runtime < 15:
                warnings.append(f"Very short episode: {runtime} minutes")
            elif runtime > 120:
                warnings.append(f"Very long episode: {runtime} minutes. Verify this is correct")
    except (ValueError, TypeError):
        warnings.append("Invalid runtime format")
    
    return warnings

def validate_file_integrity(file_path):
    """Basic file integrity checks"""
    warnings = []
    errors = []
    
    try:
        # Check if file exists and is readable
        if not os.path.exists(file_path):
            errors.append("File does not exist")
            return warnings, errors
        
        if not os.access(file_path, os.R_OK):
            errors.append("File is not readable")
            return warnings, errors
        
        # Check file size
        file_size = get_file_size(file_path)
        if file_size is None:
            warnings.append("Could not determine file size")
        elif file_size < 1024 * 1024:  # Less than 1MB
            warnings.append("File is very small (< 1MB). May be corrupted")
        elif file_size > 50 * 1024 * 1024 * 1024:  # Greater than 50GB
            warnings.append("File is very large (> 50GB). Ensure sufficient storage")
        
        # Try to read video metadata as integrity check
        metadata = get_video_metadata(file_path)
        if not metadata:
            warnings.append("Could not read video metadata. File may be corrupted")
        
    except Exception as e:
        errors.append(f"File integrity check failed: {str(e)}")
    
    return warnings, errors

def validate_video_file(file):
    """Validate that the file is a valid video file"""
    if not file or file.filename == '':
        return False, "No file selected"
        
    # Check file extension
    allowed_extensions = {'.mp4', '.avi', '.mkv', '.mov', '.wmv'}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_extensions:
        return False, f"File type not allowed. Allowed types: {', '.join(allowed_extensions)}"
    
    return True, None

@upload_bp.route('/progress/<id>', methods=['GET'])
@admin_token_required('moderator')
def get_progress(id):
    from app import progresses
    progress = progresses.get(id, {})
    return jsonify(progress)

@upload_bp.route('/movie', methods=['POST'])
@admin_token_required('moderator')
def upload_movie(current_admin):
    from models import db, Movie, UploadRequest
    from app import progresses
    
    # Add logging
    log_info(f"Admin {current_admin.username} is uploading a new movie")
    
    movie_data = {
        "id": request.form.get('id', None, type=int),
        "title": request.form.get('title', None, type=str),
        "overview": request.form.get('overview', None, type=str),
        "tagline": request.form.get('tagline', '', type=str),
        "release_date": request.form.get('release_date', None, type=str),
        "vote_average": request.form.get('vote_average', None, type=float),
        "genres": request.form.get('genres', None, type=str),
        "keywords": request.form.get('keywords', '', type=str),
        "poster_path": request.form.get('poster_path', '', type=str),
        "backdrop_path": request.form.get('backdrop_path', '', type=str),
        "runtime": request.form.get('runtime', None, type=int),
        "production_companies": request.form.get('production_companies', '', type=str),
        "production_countries": request.form.get('production_countries', '', type=str),
        "spoken_languages": request.form.get('spoken_languages', '', type=str),
        "budget": request.form.get('budget', None, type=int),
        "revenue": request.form.get('revenue', None, type=int),
        "status": request.form.get('status', '', type=str),
        "has_subtitles": request.form.get('has_subtitles', None, type=bool),
        "in_production": request.form.get('in_production', None, type=bool),
        "force": request.form.get('force', False, type=bool)
    }

    existing_movie = Movie.query.filter_by(movie_id=movie_data['id']).first()
    if existing_movie and not movie_data['force']:
        return jsonify(message=f"A movie with id {movie_data['id']} already exists in the database."), 400

    filepath = os.path.join('uploads', str(movie_data['id']) + '.mp4')
    if os.path.exists(filepath) and not movie_data['force']:
        return jsonify(message=f"A video with movie id {movie_data['id']} already exists."), 400

    error = validate_title_data(movie_data)
    if error:
        return error

    if 'vid_movie' not in request.files:
        return jsonify(message='No video Provided'), 400

    video = request.files.get('vid_movie')
    
    # Validate video file
    is_valid, error_msg = validate_video_file(video)
    if not is_valid:
        return jsonify(message=error_msg), 400

    ensure_upload_folder_exists()
    video_filename = secure_filename(video.filename)
    video_extension = os.path.splitext(video_filename)[1]
    full_video_name = str(movie_data['id']) + str(video_extension)
    video_filename = secure_filename(full_video_name)
    video_path = os.path.join('uploads', video_filename)

    # Check if file exists
    if os.path.exists(video_path) and not movie_data['force']:
        return jsonify(message='A video file with the same name already exists. Please choose a different name.'), 400

    try:
        save_with_progress(video, video_path)
        
        # Always try to get video runtime from FFmpeg first
        detected_runtime = get_video_duration_in_minutes(video_path)
        if detected_runtime:
            movie_data['runtime'] = detected_runtime
        elif not movie_data['runtime']:
            # Only if FFmpeg failed and no runtime was provided
            return jsonify(message="Could not detect video runtime automatically and no runtime was provided."), 400
    except Exception as e:
        # Clean up the partially uploaded file if it exists
        if os.path.exists(video_path):
            try:
                os.remove(video_path)
            except:
                pass
        log_error(f"Failed to upload movie: {str(e)}")
        return jsonify(message=f"An error occurred during file upload. Please try again later. Error: {str(e)}"), 500

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
        in_production=movie_data['in_production']
    )
    forced_text = ''
    try:
        try:
            if existing_movie and movie_data['force']:
                # If force is set, delete the existing movie
                db.session.delete(existing_movie)
                db.session.commit()
                forced_text = 'Forced'
            db.session.add(new_movie)
            existing_entries = UploadRequest.query.filter_by(content_id=movie_data['id'], content_type='movie').all()
            for entry in existing_entries:
                db.session.delete(entry)
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise e
    except Exception as e:
        log_error(f"Failed to upload movie: {str(e)}")
        return jsonify(message=f"An error occurred while saving the movie to the database. Error: {str(e)}"), 500

    log_success(f"Movie '{movie_data['title']}' (ID: {movie_data['id']}) uploaded successfully by {current_admin.username}")
    return jsonify(message=f"Movie '{movie_data['title']}' {forced_text} uploaded successfully."), 200

@upload_bp.route('/movie/<int:movie_id>', methods=['PUT'])
@admin_token_required('moderator')
def update_movie(current_admin, movie_id):
    from models import db, Movie
    from app import progresses

    # Fetch the movie from the database
    movie = Movie.query.filter_by(movie_id=movie_id).first()
    if not movie:
        return jsonify(message=f"Movie with id {movie_id} not found in the database."), 404


    movie_data = {
        "title": request.form.get('title', None, type=str),
        "overview": request.form.get('overview', None, type=str),
        "tagline": request.form.get('tagline', '', type=str),
        "release_date": (datetime.strptime(request.form.get('release_date', ''), "%Y-%m-%d") if request.form.get('release_date') else None),
        "vote_average": request.form.get('vote_average', None, type=float),
        "genres": request.form.get('genres', None, type=str),
        "keywords": request.form.get('keywords', '', type=str),
        "poster_path": request.form.get('poster_path', '', type=str),
        "backdrop_path": request.form.get('backdrop_path', '', type=str),
        "runtime": request.form.get('runtime', None, type=int),
        "production_companies": request.form.get('production_companies', '', type=str),
        "production_countries": request.form.get('production_countries', '', type=str),
        "spoken_languages": request.form.get('spoken_languages', '', type=str),
        "budget": request.form.get('budget', None, type=int),
        "revenue": request.form.get('revenue', None, type=int),
        "status": request.form.get('status', '', type=str),
        "has_subtitles": bool(request.form.get('has_subtitles').lower() == 'true'),
        "in_production": bool(request.form.get('in_production').lower() == 'true'),
        "force": bool(request.form.get('force').lower() == 'true'),
    }

    error = validate_title_data(movie_data, ['title', 'overview', 'release_date', 'vote_average', 'genres', 'runtime'])
    if error:
        return error

    if 'vid_movie' in request.files:  # Check if a new video file is provided
        video = request.files.get('vid_movie')
        
        # Validate video file
        if video.filename != '':
            is_valid, error_msg = validate_video_file(video)
            if not is_valid:
                return jsonify(message=error_msg), 400
                
            video_filename = secure_filename(
                str(movie_id) + os.path.splitext(video.filename)[1])
            video_path = os.path.join('uploads', video_filename)

            # Check if file exists and handle if user wants to force the update
            if os.path.exists(video_path) and not movie_data['force']:
                return jsonify(message='A video file with the same name already exists. Please choose a different name or check the "Force Overwrite" option.'), 400

            try:
                save_with_progress(video, video_path)
                
                # Always try to get video runtime from FFmpeg first
                detected_runtime = get_video_duration_in_minutes(video_path)
                if detected_runtime:
                    movie_data['runtime'] = detected_runtime
                elif not movie_data.get('runtime'):
                    # Use existing runtime if FFmpeg fails and no new runtime provided
                    movie_data['runtime'] = movie.runtime
            except Exception as e:
                # Clean up the partially uploaded file if it exists
                if os.path.exists(video_path):
                    try:
                        os.remove(video_path)
                    except:
                        pass
                return jsonify(message=f"An error occurred during file upload. Please try again later. Error: {str(e)}"), 500

            movie.video_id = movie_id  # Update the video_id in the database

    # Update the movie details
    movie.title = movie_data.get('title', movie.title)
    movie.overview = movie_data.get('overview', movie.overview)
    movie.tagline = movie_data.get('tagline', movie.tagline)
    movie.release_date = movie_data.get('release_date', movie.release_date)
    movie.vote_average = movie_data.get('vote_average', movie.vote_average)
    movie.genres = movie_data.get('genres', movie.genres)
    movie.keywords = movie_data.get('keywords', movie.keywords)
    movie.poster_path = movie_data.get('poster_path', movie.poster_path)
    movie.backdrop_path = movie_data.get('backdrop_path', movie.backdrop_path)
    movie.runtime = movie_data.get('runtime', movie.runtime)
    movie.production_companies = movie_data.get('production_companies', movie.production_companies)
    movie.production_countries = movie_data.get('production_countries', movie.production_countries)
    movie.spoken_languages = movie_data.get('spoken_languages', movie.spoken_languages)
    movie.budget = movie_data.get('budget', movie.budget)
    movie.revenue = movie_data.get('revenue', movie.revenue)
    movie.status = movie_data.get('status', movie.status)
    movie.has_subtitles = movie_data.get('has_subtitles', movie.has_subtitles)
    movie.in_production = movie_data.get('in_production', movie.in_production)

    # try:
    db.session.commit()
    # except Exception as e:
    #     return jsonify(message=f"An error occurred while updating the movie. Error: {str(e)}"), 500

    return jsonify(message=f"Movie '{movie.title}' updated successfully."), 200

@upload_bp.route('/movie/delete/<int:movie_id>', methods=['DELETE'])
@admin_token_required('moderator')
def delete_movie(current_admin, movie_id):
    from models import db, Movie
    from app import progresses
    from app import bcrypt

    data = request.form.to_dict()
    password = request.form.get('password')
    if not password or password == '':
        return jsonify({'message': 'Please provide your password'}), 400

    if not current_admin or not bcrypt.check_password_hash(current_admin.password, password):
            return jsonify({'message': 'Password incorrect! Check your credentials.'}), 401

    # Fetch the movie from the database
    movie = Movie.query.filter_by(movie_id=movie_id).first()
    if not movie:
        return jsonify(message=f"Movie with id {movie_id} not found in the database."), 404

    filepath = os.path.join('uploads', str(movie.video_id) + '.mp4')
    if os.path.exists(filepath):
        try:
            os.remove(filepath)
        except OSError as e:
            return jsonify({'message': str(e)})
    
    db.session.delete(movie)
    db.session.commit()
    
    return jsonify(message=f"Movie {movie.title} deleted successfully")

@upload_bp.route('/show', methods=['POST'])
@admin_token_required('moderator')
def upload_tvshow(current_admin):
    from models import db, TVShow, Season, Episode
    from app import progresses

    # List to track all uploaded video files for cleanup if needed
    uploaded_files = []
    
    tvshow_data = request.form
    seasons_data = request.form.get('seasons')
    seasons_data = json.loads(seasons_data) if seasons_data else []


    if not tvshow_data or not seasons_data:
        return jsonify(message='Both TV show data and seasons data are required.'), 400

    tvshow_data = {
        "show_id": tvshow_data.get('show_id', None, type=int),
        "title": tvshow_data.get('title', None, type=str),
        "genres": tvshow_data.get('genres', None, type=str),
        "created_by": tvshow_data.get('created_by', None, type=str),
        "overview": tvshow_data.get('overview', None, type=str),
        "poster_path": tvshow_data.get('poster_path', None, type=str),
        "backdrop_path": tvshow_data.get('backdrop_path', None, type=str),
        "vote_average": tvshow_data.get('vote_average', None, type=float),
        "tagline": tvshow_data.get('tagline', None, type=str),
        "spoken_languages": tvshow_data.get('spoken_languages', None, type=str),
        "first_air_date": (datetime.strptime(tvshow_data.get('first_air_date', ''), "%Y-%m-%d") if tvshow_data.get('first_air_date') else None),
        "last_air_date": (datetime.strptime(tvshow_data.get('last_air_date', ''), "%Y-%m-%d") if tvshow_data.get('last_air_date') else None),
        "production_companies": tvshow_data.get('production_companies', None, type=str),
        "production_countries": tvshow_data.get('production_countries', None, type=str),
        "networks": tvshow_data.get('networks', None, type=str),
        "status": tvshow_data.get('status', None, type=str)
    }

    existing_show = TVShow.query.filter_by(show_id=tvshow_data['show_id']).first()
    if existing_show and tvshow_data['show_id']:
        return jsonify(message=f"A TV show with id {tvshow_data['show_id']} already exists in the database."), 400

    error = validate_title_data(tvshow_data, ['title', 'show_id', 'genres', 'created_by', 'overview', 'first_air_date', 'last_air_date'])
    if error:
        # Clean up all files and database records
        cleanup_uploaded_files(uploaded_files, new_show.show_id)
        return error

    if not seasons_data:
        return jsonify(message='No seasons data provided.'), 400

    for season in seasons_data:
        if 'season_number' not in season or 'episodes' not in season:
            return jsonify(message='Invalid seasons data format.'), 400

    new_show = TVShow(
        show_id=tvshow_data['show_id'],
        title=tvshow_data['title'],
        genres=tvshow_data['genres'],
        created_by=tvshow_data['created_by'],
        overview=tvshow_data['overview'],
        poster_path=tvshow_data['poster_path'],
        backdrop_path=tvshow_data['backdrop_path'],
        vote_average=tvshow_data['vote_average'],
        tagline=tvshow_data['tagline'],
        spoken_languages=tvshow_data['spoken_languages'],
        first_air_date=tvshow_data['first_air_date'],
        last_air_date=tvshow_data['last_air_date'],
        production_companies=tvshow_data['production_companies'],
        production_countries=tvshow_data['production_countries'],
        networks=tvshow_data['networks'],
        status=tvshow_data['status'],
        seasons=[]  # Add this empty list for seasons
    )

    try:
        db.session.add(new_show)
        db.session.commit()

        ensure_upload_folder_exists()

        for season_data in seasons_data:
            error = validate_title_data(season_data, ['season_number'])
            if error:
                # Clean up all files and database records
                cleanup_uploaded_files(uploaded_files, new_show.show_id)
                return error

            # Generate a unique ID for the season
            season_id = int(f'{new_show.show_id}{season_data["season_number"]}')

            season = Season(
                id=season_id,
                season_number=season_data['season_number'],
                tvshow_id=new_show.show_id,
                episode=[]  # Empty list for episodes, to be populated later
            )
            db.session.add(season)
            db.session.commit()

            episodes_data = season_data.get('episodes')
            for episode_data in episodes_data:
                error = validate_episode_data(episode_data, ['title', 'episode_number'], season_data['season_number'], episode_data['episode_number'])
                if error:
                    # Clean up all files and database records
                    cleanup_uploaded_files(uploaded_files, new_show.show_id)
                    return error

                video_file = request.files.get(f'video_season_{season_data["season_number"]}_episode_{episode_data["episode_number"]}')
                video_file = request.files.get(f'video_season_{season_data["season_number"]}_episode_{episode_data["episode_number"]}')
                if not video_file:
                    # Clean up all files and database records
                    cleanup_uploaded_files(uploaded_files, new_show.show_id)
                    return jsonify({'message': f'Video file is required for season {season_data["season_number"]}, Episode {episode_data["episode_number"]}.'}), 400

                # Validate video file
                is_valid, error_msg = validate_video_file(video_file)
                if not is_valid:
                    # Clean up all files and database records
                    cleanup_uploaded_files(uploaded_files, new_show.show_id)
                    return jsonify(message=f"Season {season_data['season_number']}, Episode {episode_data['episode_number']}: {error_msg}"), 400

                file_ext = os.path.splitext(secure_filename(video_file.filename))[1]
                video_filename = f'{new_show.show_id}{season_data["season_number"]}{episode_data["episode_number"]}{file_ext}'
                video_path = os.path.join('uploads', video_filename)

                # After your initial episode error validation
                video_path = os.path.join('uploads', f'{new_show.show_id}{season_data["season_number"]}{episode_data["episode_number"]}.mp4')
                if os.path.exists(video_path) and not episode_data.get('force', False):
                    # Clean up all files and database records
                    cleanup_uploaded_files(uploaded_files, new_show.show_id)
                    return jsonify({
                        'message': f'Video for season {season_data["season_number"]}, Episode {episode_data["episode_number"]} already exists. Use force upload to overwrite.'
                    }, 400)

                try:
                    save_with_progress(video_file, video_path)
                    # Add to the list of uploaded files
                    uploaded_files.append(video_path)
                    
                    # Always get episode runtime from FFmpeg
                    detected_runtime = get_video_duration_in_minutes(video_path)
                    if detected_runtime:
                        # Add runtime to episode data
                        episode_data['runtime'] = detected_runtime
                    else:
                        # Could set a default here if needed
                        episode_data['runtime'] = episode_data.get('runtime', 0)
                except Exception as e:
                    # Clean up all files and database records
                    cleanup_uploaded_files(uploaded_files, new_show.show_id)
                    return jsonify(message=f"An error occurred during file upload for S{season_data['season_number']}E{episode_data['episode_number']}. Error: {str(e)}"), 500

                file_id = int(f'{new_show.show_id}{season_data["season_number"]}{episode_data["episode_number"]}')

                has_subtitles_value = episode_data.get('has_subtitles')
                if isinstance(has_subtitles_value, bool):
                    has_subtitles = has_subtitles_value
                elif isinstance(has_subtitles_value, str):
                    has_subtitles = has_subtitles_value.lower() == 'true'
                else:
                    has_subtitles = False

                episode = Episode(
                    id=file_id,
                    episode_number=episode_data.get('episode_number'),
                    title=episode_data.get('title'),
                    overview=episode_data.get('overview'),
                    has_subtitles=has_subtitles,
                    video_id=file_id,
                    # Add runtime to Episode if your model supports it
                    runtime=episode_data.get('runtime', 0)
                )
                episode.season_id = season.id  # Set the season_id for the episode
                db.session.add(episode)
        db.session.commit()
    except Exception as e:
        # Enhanced cleanup with show_id
        cleanup_uploaded_files(uploaded_files, tvshow_data['show_id'])
        
        # Rollback the database session (as a fallback)
        db.session.rollback()
        
        return jsonify(message=f"An error occurred while saving the TV show and its seasons/episodes to the database. Error: {str(e)}"), 500

    return jsonify({'message': f'TV Show {new_show.title} uploaded successfully with all seasons and episodes'}), 200

# Add this helper function to clean up files
def cleanup_uploaded_files(file_paths, show_id=None):
    """
    Clean up uploaded files when an error occurs and remove associated database records
    
    Args:
        file_paths (list): List of file paths to delete
        show_id (int, optional): TV show ID to delete from database
    """
    from models import db, TVShow, Season, Episode
    
    # Delete physical files first
    for path in file_paths:
        if os.path.exists(path):
            try:
                os.remove(path)
            except Exception as e:
                log_error(f"Error removing file {path}: {str(e)}")
    
    # Delete database records if show_id is provided
    if show_id:
        try:
            # Find the show
            show = TVShow.query.filter_by(show_id=show_id).first()
            if show:
                # Delete all episodes and seasons
                for season in show.seasons:
                    for episode in season.episodes:
                        db.session.delete(episode)
                    
                    db.session.delete(season)
                
                # Delete the show itself
                db.session.delete(show)
                
                # Commit the changes
                db.session.commit()
        except Exception as e:
            db.session.rollback()

@upload_bp.route('/show/delete/<int:show_id>', methods=['DELETE'])
@admin_token_required('moderator')
def delete_tvshow(current_admin, show_id):
    from models import db, TVShow, Season, Episode
    from app import progresses
    from app import bcrypt

    data = request.form.to_dict()
    password = request.form.get('password')
    if not password or password == '':
        return jsonify({'message': 'Please provide your password'}), 400

    if not current_admin or not bcrypt.check_password_hash(current_admin.password, password):
        return jsonify({'message': 'Password incorrect! Check your credentials.'}), 401

    # Fetch the show from the database
    show = TVShow.query.filter_by(show_id=show_id).first()
    if not show:
        return jsonify(message=f"TV show with id {show_id} not found in the database."), 404

    # Delete all episodes and their video files
    for season in show.seasons:
        for episode in season.episodes:
            # Delete video file associated with the episode
            filepath = os.path.join('uploads', f"{episode.video_id}.mp4")
            if os.path.exists(filepath):
                try:
                    os.remove(filepath)
                except OSError as e:
                    return jsonify({'message': str(e)})
            
            # Delete episode from database
            db.session.delete(episode)
        
        # Delete season from database
        db.session.delete(season)
    
    # Delete show from database
    db.session.delete(show)
    db.session.commit()
    
    return jsonify(message=f"TV show {show.title} deleted successfully")

# Add this new endpoint near the other TV show routes

@upload_bp.route('/show/<int:show_id>/check', methods=['GET'])
@admin_token_required('moderator')
def check_show_episodes(current_admin, show_id):
    from models import TVShow, Season, Episode
    
    show = TVShow.query.filter_by(show_id=show_id).first()
    if not show:
        return jsonify({
            "exists": False,
            "message": f"No TV show found with ID {show_id}",
            "episodes": {}
        }), 404
    
    result = {
        "exists": True,
        "message": f"TV show '{show.title}' exists",
        "episodes": {}
    }
    
    # Check each episode
    for season in show.seasons:
        season_num = season.season_number
        if season_num not in result["episodes"]:
            result["episodes"][season_num] = {}
        
        for episode in season.episodes:
            episode_num = episode.episode_number
            video_path = os.path.join('uploads', f"{episode.video_id}.mp4")
            
            result["episodes"][season_num][episode_num] = {
                "exists": os.path.exists(video_path),
                "message": f"Video for S{season_num}E{episode_num} exists" if os.path.exists(video_path) else f"No video found for S{season_num}E{episode_num}"
            }
    
    return jsonify(result)

@upload_bp.route('/show/<int:show_id>', methods=['PUT'])
@admin_token_required('moderator')
def update_tvshow(current_admin, show_id):
    from models import db, TVShow, Season, Episode
    from app import progresses
    from datetime import datetime  # Make sure this import is present

    tvshow_data = request.form
    seasons_data = request.form.get('seasons')
    seasons_data = json.loads(seasons_data) if seasons_data else []

    # Find the show
    show = TVShow.query.filter_by(show_id=show_id).first()
    if not show:
        return jsonify(message=f"TV show with id {show_id} not found."), 404

    # Update the show's basic info
    show.title = tvshow_data.get('title', show.title)
    show.genres = tvshow_data.get('genres', show.genres)
    show.created_by = tvshow_data.get('created_by', show.created_by)
    show.overview = tvshow_data.get('overview', show.overview)
    show.poster_path = tvshow_data.get('poster_path', show.poster_path)
    show.backdrop_path = tvshow_data.get('backdrop_path', show.backdrop_path)
    
    # Convert string vote_average to float
    vote_average = tvshow_data.get('vote_average')
    if vote_average:
        try:
            show.vote_average = float(vote_average)
        except (ValueError, TypeError):
            # If conversion fails, keep the existing value
            pass
    
    show.tagline = tvshow_data.get('tagline', show.tagline)
    show.spoken_languages = tvshow_data.get('spoken_languages', show.spoken_languages)
    
    # Convert date strings to datetime objects
    first_air_date = tvshow_data.get('first_air_date')
    if first_air_date:
        try:
            show.first_air_date = datetime.strptime(first_air_date, '%Y-%m-%d')
        except (ValueError, TypeError):
            # If parsing fails, keep the existing value
            pass
    
    last_air_date = tvshow_data.get('last_air_date')
    if last_air_date:
        try:
            show.last_air_date = datetime.strptime(last_air_date, '%Y-%m-%d')
        except (ValueError, TypeError):
            # If parsing fails, keep the existing value
            pass
    
    show.production_companies = tvshow_data.get('production_companies', show.production_companies)
    show.production_countries = tvshow_data.get('production_countries', show.production_countries)
    show.networks = tvshow_data.get('networks', show.networks)
    show.status = tvshow_data.get('status', show.status)

    try:
        # Update the database with new show info
        db.session.commit()
        log_success(f"Updated TV show {show.name} (ID: {show_id})")

        ensure_upload_folder_exists()

        # Handle seasons - this gets complex as we need to track what's new, changed, or removed
        current_season_ids = {season.id for season in show.seasons}
        updated_season_ids = set();

        for season_data in seasons_data:
            season_number = season_data['season_number']
            season_id = int(f'{show_id}{season_number}')
            updated_season_ids.add(season_id)
            
            # Find or create season
            season = Season.query.filter_by(id=season_id).first()
            if not season:
                season = Season(
                    id=season_id,
                    season_number=season_number,
                    tvshow_id=show.show_id,
                    episode=[]
                )
                db.session.add(season)
                db.session.commit()
            
            # Track current and updated episode IDs for this season
            current_episode_ids = {episode.id for episode in season.episodes}
            updated_episode_ids = set()
            
            # Process episodes
            for episode_data in season_data.get('episodes', []):
                episode_number = episode_data.get('episode_number')
                episode_id = int(f'{show_id}{season_number}{episode_number}')
                updated_episode_ids.add(episode_id)
                
                # Check if episode exists
                episode = Episode.query.filter_by(id=episode_id).first()
                
                # Create new episode or update existing one
                if not episode:
                    # Create new episode
                    episode = Episode(
                        id=episode_id,
                        episode_number=episode_number,
                        title=episode_data.get('title'),
                        overview=episode_data.get('overview'),
                        has_subtitles=episode_data.get('has_subtitles', False),
                        video_id=episode_id
                    )
                    episode.season_id = season.id
                    db.session.add(episode)
                else:
                    # Update existing episode
                    episode.title = episode_data.get('title', episode.title)
                    episode.overview = episode_data.get('overview', episode.overview)
                    episode.has_subtitles = episode_data.get('has_subtitles', episode.has_subtitles)
                
                # Look for video file upload
                video_key = f'video_season_{season_number}_episode_{episode_number}'
                if video_key in request.files:
                    video_file = request.files[video_key]
                    if video_file and video_file.filename:
                        video_path = os.path.join('uploads', f'{episode_id}.mp4')
                        
                        # Check if we should overwrite
                        force = episode_data.get('force', False)
                        if os.path.exists(video_path) and not force:
                            return jsonify({
                                'message': f'Video for season {season_number}, episode {episode_number} already exists. Use force upload to overwrite.'
                            }), 400
                        
                        # Save the new video file
                        try:
                            save_with_progress(video_file, video_path)
                            
                            # Always get episode runtime from FFmpeg
                            detected_runtime = get_video_duration_in_minutes(video_path)
                            if detected_runtime:
                                # Update episode runtime if your model supports it
                                episode.runtime = detected_runtime
                            else:
                                # Keep existing runtime or use provided runtime
                                if hasattr(episode, 'runtime'):
                                    episode.runtime = episode_data.get('runtime', episode.runtime)
                        except Exception as e:
                            # Clean up the partially uploaded file if it exists
                            if os.path.exists(video_path):
                                try:
                                    os.remove(video_path)
                                except:
                                    pass
                            log_error(f"Error updating TV show ID {show_id}: {e}")
                            return jsonify(message=f"An error occurred during file upload for S{season_number}E{episode_number}. Error: {str(e)}"), 500
            
            # Delete episodes that weren't in the update
            for episode_id in current_episode_ids - updated_episode_ids:
                episode = Episode.query.filter_by(id=episode_id).first()
                if episode:
                    # Delete video file
                    video_path = os.path.join('uploads', f'{episode.video_id}.mp4')
                    if os.path.exists(video_path):
                        os.remove(video_path)
                    
                    # Delete episode from database
                    db.session.delete(episode)
        
        # Delete seasons that weren't in the update
        for season_id in current_season_ids - updated_season_ids:
            season = Season.query.filter_by(id=season_id).first()
            if season:
                # Delete all episodes in this season
                for episode in season.episodes:
                    # Delete video file
                    video_path = os.path.join('uploads', f'{episode.id}.mp4')
                    if os.path.exists(video_path):
                        os.remove(video_path)
                    
                    # Delete episode from database
                    db.session.delete(episode)
                
                # Delete season from database
                db.session.delete(season)
        
        # Commit all changes
        db.session.commit()
        
        return jsonify({'message': f'TV Show {show.title} updated successfully'}), 200
    
    except Exception as e:
        db.session.rollback()
        log_error(f"Error updating TV show ID {show_id}: {e}")
        return jsonify(message=f"An error occurred while updating the TV show: {str(e)}"), 500

@upload_bp.route('/validate', methods=['POST'])
@admin_token_required('moderator')
def validate_upload(current_admin):
    """Pre-upload validation endpoint to check if content can be uploaded"""
    try:
        data = request.get_json()
        log_info(f"🔍 Validation request from admin {current_admin.username}: {data}")
        
        if not data:
            log_warning("❌ No data provided in validation request")
            return jsonify(success=False, message="No data provided"), 400
        
        content_type = data.get('content_type')  # 'movie' or 'tv'
        content_id = data.get('content_id')
        content_data = data.get('content_data', {})  # Additional content metadata for validation
        
        log_info(f"📊 Validating {content_type} with ID {content_id}")
        
        if not content_type or not content_id:
            log_warning("❌ Missing content_type or content_id in validation request")
            return jsonify(success=False, message="content_type and content_id are required"), 400
        
        try:
            content_id = int(content_id)
        except (ValueError, TypeError):
            log_warning(f"❌ Invalid content_id format: {content_id}")
            return jsonify(success=False, message="content_id must be a valid integer"), 400
        
        validation_result = {
            'success': True,
            'can_upload': True,
            'warnings': [],
            'errors': [],
            'info': [],
            'content_type': content_type,
            'content_id': content_id,
            'system_checks': {
                'disk_space': None,
                'existing_content': None,
                'file_validation': None
            }
        }
        
        log_info(f"🚀 Starting validation checks for {content_type} ID {content_id}")
        
        # System-wide checks
        try:
            log_info("💾 Checking disk space...")
            # Check disk space
            free_space = get_free_disk_space('uploads')
            if free_space:
                free_gb = free_space / (1024**3)
                validation_result['system_checks']['disk_space'] = f"{free_gb:.1f} GB available"
                log_info(f"💾 Disk space check: {free_gb:.1f} GB available")
                if free_gb < 1:
                    validation_result['errors'].append({
                        'type': 'insufficient_disk_space',
                        'message': f"Low disk space: {free_gb:.1f} GB remaining",
                        'suggestion': "Free up disk space before uploading large files"
                    })
                    log_warning(f"⚠️ Low disk space: {free_gb:.1f} GB")
                elif free_gb < 5:
                    validation_result['warnings'].append({
                        'type': 'low_disk_space',
                        'message': f"Limited disk space: {free_gb:.1f} GB remaining",
                        'suggestion': "Monitor disk usage during upload"
                    })
                    log_info(f"⚠️ Limited disk space: {free_gb:.1f} GB")
            else:
                log_warning("💾 Could not determine disk space")
        except Exception as e:
            log_error(f"💾 Disk space check failed: {str(e)}")
            validation_result['warnings'].append({
                'type': 'disk_space_check_failed',
                'message': "Could not check available disk space",
                'suggestion': "Ensure sufficient storage before uploading"
            })
        
        if content_type == 'movie':
            log_info(f"🎬 Validating movie ID {content_id}")
            # Check if movie already exists in database
            existing_movie = Movie.query.filter_by(movie_id=content_id).first()
            if existing_movie:
                log_warning(f"🎬 Movie ID {content_id} already exists: {existing_movie.title}")
                validation_result['can_upload'] = False
                validation_result['errors'].append({
                    'type': 'duplicate_database',
                    'message': f"Movie '{existing_movie.title}' (ID: {content_id}) already exists in database",
                    'suggestion': "Try editing the existing movie from the Manage Movies page or enable Force Overwrite",
                    'details': {
                        'existing_title': existing_movie.title,
                        'existing_year': existing_movie.release_date.year if existing_movie.release_date else None
                    }
                })
            else:
                log_info(f"🎬 Movie ID {content_id} not found in database - OK to upload")
            
            # Check if video file already exists
            video_filepath = os.path.join('uploads', str(content_id) + '.mp4')
            log_info(f"📁 Checking for existing video file: {video_filepath}")
            if os.path.exists(video_filepath):
                log_warning(f"📁 Video file already exists: {video_filepath}")
                if existing_movie:
                    validation_result['errors'].append({
                        'type': 'duplicate_file_and_database',
                        'message': f"Both movie data and video file already exist for ID {content_id}",
                        'suggestion': "Enable Force Overwrite to replace existing content"
                    })
                else:
                    validation_result['warnings'].append({
                        'type': 'orphaned_file',
                        'message': f"Video file exists but no database entry found for movie ID {content_id}",
                        'suggestion': "The upload will link the video to the new database entry"
                    })
                
                # Validate existing file integrity
                log_info(f"🔍 Validating existing file integrity: {video_filepath}")
                warnings, errors = validate_file_integrity(video_filepath)
                for warning in warnings:
                    validation_result['warnings'].append({
                        'type': 'file_integrity_warning',
                        'message': f"Existing file issue: {warning}",
                        'suggestion': "Consider replacing with a higher quality file"
                    })
                for error in errors:
                    validation_result['errors'].append({
                        'type': 'file_integrity_error',
                        'message': f"Existing file error: {error}",
                        'suggestion': "File must be replaced"
                    })
            else:
                log_info(f"📁 No existing video file found - OK to upload")
            
            # Content metadata validation
            if content_data:
                log_info(f"📋 Validating content metadata for movie ID {content_id}")
                # Validate languages
                language_warnings = validate_language(content_data)
                for warning in language_warnings:
                    validation_result['warnings'].append({
                        'type': 'language',
                        'message': warning,
                        'suggestion': "Add language information for better categorization"
                    })
                
                # Validate genres
                genre_warnings = validate_genres(content_data, 'movie')
                for warning in genre_warnings:
                    validation_result['warnings'].append({
                        'type': 'genre',
                        'message': warning,
                        'suggestion': "Verify genre classification"
                    })
                  # Validate runtime
                runtime = content_data.get('runtime')
                runtime_warnings = validate_runtime(runtime, 'movie')
                for warning in runtime_warnings:
                    validation_result['warnings'].append({
                        'type': 'runtime',
                        'message': warning,
                        'suggestion': "Verify runtime information"
                    })
                
                # NEW VALIDATIONS
                
                # Validate release date
                release_date = content_data.get('release_date')
                if release_date:
                    log_info(f"📅 Validating release date for movie ID {content_id}: {release_date}")
                    date_warnings, date_errors = validate_release_date(release_date, 'movie')
                    for warning in date_warnings:
                        validation_result['warnings'].append({
                            'type': 'release_date_warning',
                            'message': warning,
                            'suggestion': "Verify the release date is correct"
                        })
                    for error in date_errors:
                        validation_result['errors'].append({
                            'type': 'release_date_error',
                            'message': error,
                            'suggestion': "Correct the release date format or value"
                        })
                
                # Validate poster and backdrop images
                poster_path = content_data.get('poster_path')
                backdrop_path = content_data.get('backdrop_path')
                if poster_path or backdrop_path:
                    log_info(f"🖼️ Validating poster/backdrop for movie ID {content_id}")
                    image_warnings, image_errors = validate_thumbnail_poster_local(poster_path, backdrop_path, 'movie', content_id)
                    for warning in image_warnings:
                        validation_result['warnings'].append({
                            'type': 'image_validation_warning',
                            'message': warning,
                            'suggestion': "Check image files and paths"
                        })
                    for error in image_errors:
                        validation_result['errors'].append({
                            'type': 'image_validation_error',
                            'message': error,
                            'suggestion': "Fix image file issues"
                        })
                
                # Content categorization
                log_info(f"🏷️ Analyzing content categorization for movie ID {content_id}")
                cat_warnings, cat_errors = validate_content_categorization(content_data, 'movie')
                for warning in cat_warnings:
                    validation_result['warnings'].append({
                        'type': 'categorization',
                        'message': warning,
                        'suggestion': "Review content categorization"
                    })
                for error in cat_errors:
                    validation_result['errors'].append({
                        'type': 'categorization_error',
                        'message': error,
                        'suggestion': "Fix categorization issues"
                    })
                
                # Content scanning (if video file exists)
                if os.path.exists(video_filepath):
                    log_info(f"🔍 Performing content scanning for movie ID {content_id}")
                    scan_warnings, scan_errors = validate_content_scanning(video_filepath)
                    for warning in scan_warnings:                        validation_result['warnings'].append({
                            'type': 'content_scan_warning',
                            'message': warning,
                            'suggestion': "Review content scan results"
                        })
                    for error in scan_errors:
                        validation_result['errors'].append({
                            'type': 'content_scan_error',
                            'message': error,
                            'suggestion': "Address content scanning issues"
                        })                  # Check for similar titles in database
                title = content_data.get('title', '')
                if title:
                    log_info(f"🔍 Checking for similar movie titles to: {title}")
                    similar_movies = Movie.query.filter(
                        Movie.title.ilike(f"%{title}%")
                    ).limit(3).all()
                    
                    if similar_movies:
                        similar_titles = [f"'{m.title}' ({m.release_date.year if m.release_date else 'Unknown'})" for m in similar_movies[:3]]
                        log_info(f"🔍 Found similar movie titles: {similar_titles}")
                        validation_result['warnings'].append({
                            'type': 'similar_titles',
                            'message': f"Similar titles found: {', '.join(similar_titles)}",
                            'suggestion': "Verify this is not a duplicate with different metadata"
                        })
                
                # Estimate movie file size for space checking
                estimated_size = content_data.get('estimated_file_size')
                if estimated_size:
                    try:
                        estimated_size = int(estimated_size)
                        log_info(f"💾 Movie estimated size: {estimated_size / (1024*1024):.1f}MB")
                    except (ValueError, TypeError):
                        estimated_size = 2 * 1024 * 1024 * 1024  # Default 2GB for movies
                        log_info(f"💾 Invalid movie size provided, using default: 2GB")
                else:
                    estimated_size = 2 * 1024 * 1024 * 1024  # Default 2GB for movies
                    log_info(f"💾 No movie size provided, using default: 2GB")
                
                # Check if estimated upload size fits available disk space
                free_space = get_free_disk_space('uploads')
                if free_space and estimated_size > free_space * 0.9:  # Leave 10% buffer
                    validation_result['errors'].append({
                        'type': 'insufficient_space_for_upload',
                        'message': f"Estimated upload size ({estimated_size / (1024*1024):.0f}MB) exceeds available disk space ({free_space / (1024*1024):.0f}MB)",
                        'suggestion': "Free up disk space before uploading the movie"
                    })
                    log_warning(f"⚠️ Insufficient space: need {estimated_size / (1024*1024):.0f}MB, have {free_space / (1024*1024):.0f}MB")
                elif free_space and estimated_size > free_space * 0.7:  # Warn at 70% usage
                    validation_result['warnings'].append({
                        'type': 'limited_space_for_upload',
                        'message': f"Estimated upload size ({estimated_size / (1024*1024):.0f}MB) will use significant disk space ({free_space / (1024*1024):.0f}MB available)",
                        'suggestion': "Monitor disk space during movie upload"
                    })
                    log_info(f"⚠️ Limited space warning: uploading {estimated_size / (1024*1024):.0f}MB to {free_space / (1024*1024):.0f}MB available")
                
                # Add size estimation info
                validation_result['info'].append({
                    'type': 'estimated_upload_size',
                    'message': f"Estimated movie upload size: {estimated_size / (1024*1024):.0f}MB",
                    'suggestion': "Actual file size may vary"
                })
            else:
                log_info(f"📋 No content metadata provided for movie ID {content_id}")
        
        elif content_type == 'tv':
            log_info(f"📺 Validating TV show ID {content_id}")
            # Check if TV show already exists in database
            existing_show = TVShow.query.filter_by(show_id=content_id).first()
            if existing_show:
                log_warning(f"📺 TV show ID {content_id} already exists: {existing_show.title}")
                validation_result['can_upload'] = False
                validation_result['errors'].append({
                    'type': 'duplicate_database',
                    'message': f"TV Show '{existing_show.title}' (ID: {content_id}) already exists in database",
                    'suggestion': "Try editing the existing show from the Manage Shows page or enable Force Overwrite",
                    'details': {
                        'existing_title': existing_show.title,
                        'existing_year': existing_show.first_air_date.year if existing_show.first_air_date else None
                    }
                })
            else:
                log_info(f"📺 TV show ID {content_id} not found in database - OK to upload")
            
            # For TV shows, check episodes if provided
            episodes_data = data.get('episodes', [])
            if episodes_data:
                log_info(f"📺 Validating {len(episodes_data)} episodes for TV show ID {content_id}")
                existing_episodes = []
                episode_warnings = []
                episode_errors = []
                
                for episode_data in episodes_data:
                    season_num = episode_data.get('season_number')
                    episode_num = episode_data.get('episode_number')
                    if season_num and episode_num:
                        # Check if episode file exists
                        episode_filename = f"{content_id}S{season_num:02d}E{episode_num:02d}.mp4"
                        episode_filepath = os.path.join('uploads', episode_filename)
                        
                        log_info(f"📁 Checking episode file: {episode_filepath}")
                        
                        if os.path.exists(episode_filepath):
                            existing_episodes.append(f"S{season_num}E{episode_num}")
                            log_warning(f"📁 Episode file already exists: {episode_filepath}")
                            
                            # Validate episode file integrity
                            warnings, errors = validate_file_integrity(episode_filepath)
                            episode_warnings.extend(warnings)
                            episode_errors.extend(errors)
                            
                            # Validate video quality
                            quality_warnings, quality_errors = validate_video_quality(episode_filepath)
                            episode_warnings.extend(quality_warnings)
                            episode_errors.extend(quality_errors)
                
                if existing_episodes:
                    validation_result['warnings'].append({
                        'type': 'duplicate_episodes',
                        'message': f"Some episodes already exist: {', '.join(existing_episodes)}",
                        'suggestion': "Enable Force Overwrite for individual episodes to replace them"
                    })
                
                # Add episode-specific warnings and errors
                for warning in episode_warnings:
                    validation_result['warnings'].append({
                        'type': 'episode_file_warning',
                        'message': f"Episode file issue: {warning}",
                        'suggestion': "Review episode files before upload"
                    })
                
                for error in episode_errors:
                    validation_result['errors'].append({
                        'type': 'episode_file_error',
                        'message': f"Episode file error: {error}",
                        'suggestion': "Fix episode file issues before upload"
                    })
            else:
                log_info(f"📺 No episodes data provided for TV show ID {content_id}")
              # Content metadata validation for TV shows
            if content_data:
                log_info(f"📋 Validating content metadata for TV show ID {content_id}")
                # Validate languages
                language_warnings = validate_language(content_data)
                for warning in language_warnings:
                    validation_result['warnings'].append({
                        'type': 'language',
                        'message': warning,
                        'suggestion': "Add language information for better categorization"
                    })
                
                # Validate genres
                genre_warnings = validate_genres(content_data, 'tv')
                for warning in genre_warnings:
                    validation_result['warnings'].append({
                        'type': 'genre',
                        'message': warning,
                        'suggestion': "Verify TV show genre classification"
                    })
                
                # NEW VALIDATIONS FOR TV SHOWS
                
                # Validate release date (first_air_date for TV shows)
                first_air_date = content_data.get('first_air_date') or content_data.get('release_date')
                if first_air_date:
                    log_info(f"📅 Validating first air date for TV show ID {content_id}: {first_air_date}")
                    date_warnings, date_errors = validate_release_date(first_air_date, 'tv')
                    for warning in date_warnings:
                        validation_result['warnings'].append({
                            'type': 'release_date_warning',
                            'message': warning,
                            'suggestion': "Verify the first air date is correct"
                        })
                    for error in date_errors:
                        validation_result['errors'].append({
                            'type': 'release_date_error',
                            'message': error,
                            'suggestion': "Correct the first air date format or value"
                        })
                
                # Validate season/episode numbering
                if episodes_data:
                    log_info(f"🔢 Validating season/episode numbering for TV show ID {content_id}")
                    numbering_warnings, numbering_errors = validate_season_episode_numbering(content_data, episodes_data)
                    for warning in numbering_warnings:
                        validation_result['warnings'].append({
                            'type': 'episode_numbering_warning',
                            'message': warning,
                            'suggestion': "Review episode numbering for consistency"
                        })
                    for error in numbering_errors:
                        validation_result['errors'].append({
                            'type': 'episode_numbering_error',
                            'message': error,
                            'suggestion': "Fix episode numbering issues"
                        })
                
                # Validate poster and backdrop images
                poster_path = content_data.get('poster_path')
                backdrop_path = content_data.get('backdrop_path')
                if poster_path or backdrop_path:
                    log_info(f"🖼️ Validating poster/backdrop for TV show ID {content_id}")
                    image_warnings, image_errors = validate_thumbnail_poster_local(poster_path, backdrop_path, 'tv', content_id)
                    for warning in image_warnings:
                        validation_result['warnings'].append({
                            'type': 'image_validation_warning',
                            'message': warning,
                            'suggestion': "Check image files and paths"
                        })
                    for error in image_errors:
                        validation_result['errors'].append({
                            'type': 'image_validation_error',
                            'message': error,
                            'suggestion': "Fix image file issues"
                        })
                
                # Content categorization
                log_info(f"🏷️ Analyzing content categorization for TV show ID {content_id}")
                cat_warnings, cat_errors = validate_content_categorization(content_data, 'tv')
                for warning in cat_warnings:
                    validation_result['warnings'].append({
                        'type': 'categorization',
                        'message': warning,
                        'suggestion': "Review content categorization"
                    })
                for error in cat_errors:
                    validation_result['errors'].append({
                        'type': 'categorization_error',
                        'message': error,
                        'suggestion': "Fix categorization issues"
                    })
                
                # Content scanning for episode files
                if episodes_data:
                    log_info(f"🔍 Performing content scanning for TV show episodes")
                    for episode_data in episodes_data:
                        season_num = episode_data.get('season_number')
                        episode_num = episode_data.get('episode_number')
                        if season_num and episode_num:
                            episode_filename = f"{content_id}S{season_num:02d}E{episode_num:02d}.mp4"
                            episode_filepath = os.path.join('uploads', episode_filename)
                            
                            if os.path.exists(episode_filepath):
                                scan_warnings, scan_errors = validate_content_scanning(episode_filepath)
                                for warning in scan_warnings:
                                    validation_result['warnings'].append({
                                        'type': 'content_scan_warning',
                                        'message': f"Episode S{season_num}E{episode_num}: {warning}",
                                        'suggestion': "Review episode content scan results"
                                    })
                                for error in scan_errors:
                                    validation_result['errors'].append({
                                        'type': 'content_scan_error',
                                        'message': f"Episode S{season_num}E{episode_num}: {error}",
                                        'suggestion': "Address episode content scanning issues"
                                    })
                
                # Pre-upload space reservation for episodes
                total_estimated_size = 0
                # Get episodes from content_data as well as the validation episodes_data
                content_episodes = content_data.get('episodes', [])
                all_episodes = episodes_data + content_episodes  # Combine both sources
                
                for episode_data in all_episodes:
                    estimated_size = episode_data.get('estimated_file_size')
                    if estimated_size:
                        try:
                            total_estimated_size += int(estimated_size)
                            log_info(f"💾 Added episode size: {int(estimated_size) / (1024*1024):.1f}MB")
                        except (ValueError, TypeError):
                            pass
                
                # If no file sizes provided, use default estimation
                if total_estimated_size == 0:
                    episode_count = max(len(episodes_data), len(content_episodes))
                    if episode_count == 0:
                        episode_count = 1  # Default to at least 1 episode
                    total_estimated_size = episode_count * 500 * 1024 * 1024  # 500MB per episode
                    log_info(f"💾 No episode sizes provided, using default: {episode_count} episodes × 500MB = {total_estimated_size / (1024*1024):.0f}MB")
                
                # Check if estimated upload size fits available disk space
                if total_estimated_size > 0:
                    log_info(f"💾 Estimated upload size: {total_estimated_size / (1024*1024):.1f}MB")
                    free_space = get_free_disk_space('uploads')
                    if free_space and total_estimated_size > free_space * 0.9:  # Leave 10% buffer
                        validation_result['errors'].append({
                            'type': 'insufficient_space_for_upload',
                            'message': f"Estimated upload size ({total_estimated_size / (1024*1024):.0f}MB) exceeds available disk space ({free_space / (1024*1024):.0f}MB)",
                            'suggestion': "Free up disk space before uploading episodes"
                        })
                        log_warning(f"⚠️ Insufficient space: need {total_estimated_size / (1024*1024):.0f}MB, have {free_space / (1024*1024):.0f}MB")
                    elif free_space and total_estimated_size > free_space * 0.7:  # Warn at 70% usage
                        validation_result['warnings'].append({
                            'type': 'limited_space_for_upload',
                            'message': f"Estimated upload size ({total_estimated_size / (1024*1024):.0f}MB) will use significant disk space ({free_space / (1024*1024):.0f}MB available)",
                            'suggestion': "Monitor disk space during episode uploads"
                        })
                        log_info(f"⚠️ Limited space warning: uploading {total_estimated_size / (1024*1024):.0f}MB to {free_space / (1024*1024):.0f}MB available")
                    
                    # Add size estimation info
                    validation_result['info'].append({
                        'type': 'estimated_upload_size',
                        'message': f"Estimated total upload size: {total_estimated_size / (1024*1024):.0f}MB for {max(len(episodes_data), len(content_episodes))} episodes",
                        'suggestion': "Actual file sizes may vary"
                    })
                
                # Check for similar titles in database
                title = content_data.get('title', '')
                if title:
                    log_info(f"🔍 Checking for similar TV show titles to: {title}")
                    similar_shows = TVShow.query.filter(
                        TVShow.title.ilike(f"%{title}%")
                    ).limit(3).all()
                    
                    if similar_shows:
                        similar_titles = [f"'{s.title}' ({s.first_air_date.year if s.first_air_date else 'Unknown'})" for s in similar_shows[:3]]
                        log_info(f"🔍 Found similar TV show titles: {similar_titles}")
                        validation_result['warnings'].append({
                            'type': 'similar_titles',
                            'message': f"Similar titles found: {', '.join(similar_titles)}",
                            'suggestion': "Verify this is not a duplicate with different metadata"
                        })
            else:
                log_info(f"📋 No content metadata provided for TV show ID {content_id}")
        
        else:
            log_warning(f"❌ Invalid content_type: {content_type}")
            return jsonify(success=False, message="content_type must be 'movie' or 'tv'"), 400
        
        # Add informational messages
        validation_result['info'].append({
            'type': 'validation_complete',
            'message': f"Validation completed for {content_type} ID {content_id}",
            'timestamp': datetime.now().isoformat()
        })
        
        if validation_result['warnings']:
            validation_result['info'].append({
                'type': 'warnings_found',
                'message': f"Found {len(validation_result['warnings'])} warnings that should be reviewed",
                'suggestion': "Warnings won't prevent upload but should be addressed for better quality"
            })
        
        # Set overall success based on whether there are any blocking errors
        validation_result['success'] = validation_result['can_upload'] and len(validation_result['errors']) == 0
        
        # Update system checks summary
        if not validation_result['errors']:
            validation_result['system_checks']['existing_content'] = "No conflicts found"
            validation_result['system_checks']['file_validation'] = "Passed basic checks"
        else:
            validation_result['system_checks']['existing_content'] = "Conflicts detected"
            validation_result['system_checks']['file_validation'] = "Issues found"
        
        log_info(f"✅ Validation completed for {content_type} ID {content_id}: {len(validation_result['errors'])} errors, {len(validation_result['warnings'])} warnings, can_upload: {validation_result['can_upload']}")
        
        return jsonify(validation_result), 200
        
    except Exception as e:
        log_error(f"💥 Validation endpoint error: {str(e)}")
        return jsonify({
            'success': False,
            'can_upload': False,
            'errors': [{ 
                'type': 'server_error', 
                'message': f"Server error during validation: {str(e)}"
            }],
            'warnings': [],
            'info': []
        }), 500

@upload_bp.route('/validate/test', methods=['POST'])
@admin_token_required('moderator')
def test_validation(current_admin):
    """Test endpoint to simulate various validation scenarios"""
    try:
        data = request.get_json()
        scenario = data.get('scenario', 'success')
        content_type = data.get('content_type', 'movie')
        content_id = data.get('content_id', 12345)
        
        log_info(f"🧪 Testing validation scenario: {scenario} for {content_type} ID {content_id}")
        
        # Simulate different validation scenarios
        if scenario == 'success':
            return jsonify({
                'success': True,
                'can_upload': True,
                'warnings': [],
                'errors': [],
                'info': [
                    {'message': 'All validation checks passed successfully', 'type': 'general'}
                ],
                'content_type': content_type,
                'content_id': content_id,
                'system_checks': {
                    'disk_space': '25.4 GB available',
                    'existing_content': 'No conflicts found',
                    'file_validation': 'Ready for upload'
                }
            })
        
        elif scenario == 'duplicate':
            return jsonify({
                'success': False,
                'can_upload': False,
                'warnings': [
                    {
                        'type': 'similar_titles',
                        'message': 'Found similar title: "The Matrix Reloaded" (2003)',
                        'suggestion': 'Verify this is not a duplicate with different metadata'
                    }
                ],
                'errors': [
                    {
                        'type': 'duplicate_database',
                        'message': f'{content_type.title()} "The Matrix" (ID: {content_id}) already exists in database',
                        'suggestion': 'Try editing the existing movie from the Manage Movies page or enable Force Overwrite',
                        'details': {
                            'existing_title': 'The Matrix',
                            'existing_year': 1999
                        }
                    }
                ],
                'info': [],
                'content_type': content_type,
                'content_id': content_id,
                'system_checks': {
                    'disk_space': '25.4 GB available',
                    'existing_content': 'Conflict detected',
                    'file_validation': 'Blocked by duplicate'
                }
            })
        
        elif scenario == 'warnings':
            return jsonify({
                'success': True,
                'can_upload': True,
                'warnings': [
                    {
                        'type': 'content_rating',
                        'message': 'Content rating not specified or may be inappropriate',
                        'suggestion': 'Verify content rating is appropriate'
                    },
                    {
                        'type': 'low_disk_space',
                        'message': 'Limited disk space: 4.2 GB remaining',
                        'suggestion': 'Monitor disk usage during upload'
                    },
                    {
                        'type': 'file_integrity_warning',
                        'message': 'Video quality lower than recommended (480p)',
                        'suggestion': 'Consider replacing with a higher quality file'
                    }
                ],
                'errors': [],
                'info': [
                    {'message': 'Upload will proceed despite warnings', 'type': 'general'}
                ],
                'content_type': content_type,
                'content_id': content_id,
                'system_checks': {
                    'disk_space': '4.2 GB available',
                    'existing_content': 'No conflicts',
                    'file_validation': 'Quality concerns'
                }
            })
        
        elif scenario == 'multiple_errors':
            return jsonify({
                'success': False,
                'can_upload': False,
                'warnings': [
                    {
                        'type': 'runtime',
                        'message': 'Runtime information missing or invalid',
                        'suggestion': 'Verify runtime information'
                    }
                ],
                'errors': [
                    {
                        'type': 'duplicate_file_and_database',
                        'message': f'Both {content_type} data and video file already exist for ID {content_id}',
                        'suggestion': 'Enable Force Overwrite to replace existing content'
                    },
                    {
                        'type': 'file_integrity_error',
                        'message': 'Video file is corrupted or unreadable',
                        'suggestion': 'File must be replaced with a valid video file'
                    },
                    {
                        'type': 'insufficient_disk_space',
                        'message': 'Low disk space: 0.8 GB remaining',
                        'suggestion': 'Free up disk space before uploading large files'
                    }
                ],
                'info': [],
                'content_type': content_type,
                'content_id': content_id,
                'system_checks': {
                    'disk_space': '0.8 GB available',
                    'existing_content': 'Multiple conflicts',
                    'file_validation': 'Critical errors found'
                }
            })
        
        else:
            return jsonify({'error': f'Unknown scenario: {scenario}'}), 400
            
    except Exception as e:
        log_error(f"💥 Test validation error: {str(e)}")
        return jsonify({'error': str(e)}), 500

def validate_release_date(release_date, content_type):
    """Validate release date for movies and TV shows"""
    from datetime import datetime, date
    
    warnings = []
    errors = []
    
    if not release_date:
        warnings.append(f"No release date provided for {content_type}")
        return warnings, errors
    
    try:
        # Parse the date string
        if isinstance(release_date, str):
            # Try different date formats
            date_formats = ['%Y-%m-%d', '%Y-%m-%d %H:%M:%S', '%Y/%m/%d', '%d/%m/%Y', '%m/%d/%Y']
            parsed_date = None
            
            for fmt in date_formats:
                try:
                    parsed_date = datetime.strptime(release_date, fmt).date()
                    break
                except ValueError:
                    continue
            
            if not parsed_date:
                errors.append(f"Invalid date format: {release_date}. Use YYYY-MM-DD format")
                return warnings, errors
        elif isinstance(release_date, datetime):
            parsed_date = release_date.date()
        elif isinstance(release_date, date):
            parsed_date = release_date
        else:
            errors.append("Invalid date type provided")
            return warnings, errors
        
        current_date = date.today()
        
        # Check if date is too far in the future
        if parsed_date > current_date:
            # Allow up to 2 years in the future for announced content
            max_future_date = date(current_date.year + 2, current_date.month, current_date.day)
            if parsed_date > max_future_date:
                warnings.append(f"Release date is very far in the future: {parsed_date}")
            else:
                warnings.append(f"Future release date: {parsed_date}")
        
        # Check if date is too old without proper context
        if content_type == 'movie':
            # Movies before 1888 (first motion picture) are suspicious
            if parsed_date.year < 1888:
                errors.append(f"Release date too early for a movie: {parsed_date}")
            elif parsed_date.year < 1920:
                warnings.append(f"Very early movie date: {parsed_date}. Verify if this is a historical film")
        elif content_type == 'tv':
            # TV shows before 1928 (first TV broadcast) are suspicious
            if parsed_date.year < 1928:
                errors.append(f"Release date too early for a TV show: {parsed_date}")
            elif parsed_date.year < 1950:
                warnings.append(f"Very early TV show date: {parsed_date}. Verify if this is correct")
        
        # Check for common date errors (year typos)
        if parsed_date.year > current_date.year + 10:
            warnings.append(f"Release year {parsed_date.year} seems too far in future")
        
    except Exception as e:
        errors.append(f"Error validating release date: {str(e)}")
    
    return warnings, errors

def validate_season_episode_numbering(show_data, episodes_data):
    """Validate TV show season and episode numbering for consistency"""
    warnings = []
    errors = []
    
    if not episodes_data:
        warnings.append("No episode data provided for validation")
        return warnings, errors
    
    try:
        # Group episodes by season
        seasons = {}
        for episode in episodes_data:
            season_num = episode.get('season_number')
            episode_num = episode.get('episode_number')
            
            if season_num is None or episode_num is None:
                errors.append("Missing season or episode number in episode data")
                continue
            
            if season_num not in seasons:
                seasons[season_num] = []
            seasons[season_num].append(episode_num)
        
        # Validate each season
        for season_num, episode_numbers in seasons.items():
            # Check for negative numbers
            if season_num < 0:
                errors.append(f"Invalid season number: {season_num} (cannot be negative)")
            if any(ep < 1 for ep in episode_numbers):
                errors.append(f"Invalid episode numbers in season {season_num} (episodes must start from 1)")
            
            # Check for duplicates
            duplicates = set()
            seen = set()
            for ep_num in episode_numbers:
                if ep_num in seen:
                    duplicates.add(ep_num)
                seen.add(ep_num)
            
            if duplicates:
                errors.append(f"Duplicate episodes in season {season_num}: {sorted(duplicates)}")
            
            # Check for gaps in episode numbering
            sorted_episodes = sorted(episode_numbers)
            if sorted_episodes:
                expected_episodes = list(range(1, max(sorted_episodes) + 1))
                missing_episodes = set(expected_episodes) - set(sorted_episodes)
                if missing_episodes:
                    warnings.append(f"Missing episodes in season {season_num}: {sorted(missing_episodes)}")
                
                # Check for unusual episode counts
                episode_count = len(sorted_episodes)
                if episode_count > 50:
                    warnings.append(f"Season {season_num} has unusually many episodes: {episode_count}")
                elif episode_count == 1:
                    warnings.append(f"Season {season_num} has only one episode (special/pilot?)")
        
        # Check season numbering
        season_numbers = sorted(seasons.keys())
        if season_numbers:
            # Check if seasons start from 0 or 1
            if min(season_numbers) == 0:
                warnings.append("Season numbering starts from 0 (some shows use this for specials)")
            elif min(season_numbers) > 1:
                missing_seasons = list(range(1, min(season_numbers)))
                warnings.append(f"Missing earlier seasons: {missing_seasons}")
            
            # Check for gaps in season numbering
            for i in range(len(season_numbers) - 1):
                current_season = season_numbers[i]
                next_season = season_numbers[i + 1]
                if next_season != current_season + 1:
                    gap = list(range(current_season + 1, next_season))
                    warnings.append(f"Gap in season numbering: missing seasons {gap}")
        
    except Exception as e:
        errors.append(f"Error validating season/episode numbering: {str(e)}")
    
    return warnings, errors

def validate_thumbnail_poster_local(poster_path, backdrop_path, content_type, content_id):
    """Validate poster and backdrop images exist in local folders"""
    warnings = []
    errors = []
    
    def validate_local_image(image_path, image_type):
        """Helper function to validate a single local image"""
        local_warnings = []
        local_errors = []
        
        if not image_path:
            local_warnings.append(f"No {image_type} path provided")
            return local_warnings, local_errors
        
        try:
            # Check if it's a URL (starts with http) - we'll handle URLs differently
            if image_path.startswith('http'):
                local_warnings.append(f"{image_type} is a URL, not a local file")
                return local_warnings, local_errors
              # Check for common image folders - use both relative and absolute paths
            possible_folders = [
                'cdn/posters_combined', 
                os.path.join(os.getcwd(), 'cdn/posters_combined'),
            ]
            
            image_found = False
            checked_paths = []
            for folder in possible_folders:
                # Handle paths that start with '/' by removing the leading slash
                clean_image_path = image_path.lstrip('/')
                full_path = os.path.join(folder, clean_image_path)
                checked_paths.append(full_path)
                
                if os.path.exists(full_path):
                    image_found = True
                    log_info(f"✅ Found {image_type} at: {full_path}")
                    
                    # Check file size
                    try:
                        file_size = os.path.getsize(full_path)
                        if file_size == 0:
                            local_errors.append(f"{image_type} file is empty: {full_path}")
                        elif file_size < 1024:  # Less than 1KB
                            local_warnings.append(f"{image_type} file is very small: {file_size} bytes")
                        elif file_size > 10 * 1024 * 1024:  # Greater than 10MB
                            local_warnings.append(f"{image_type} file is very large: {file_size / (1024*1024):.1f} MB")
                    except OSError as e:
                        local_warnings.append(f"Could not check {image_type} file size: {str(e)}")
                    
                    # Try to validate image format using file extension
                    valid_extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
                    if not any(full_path.lower().endswith(ext) for ext in valid_extensions):
                        local_warnings.append(f"{image_type} doesn't have a standard image extension")
            
                    break
            
            if not image_found:
                # Check if the path itself exists (might be absolute path)
                if os.path.exists(image_path):
                    local_warnings.append(f"{image_type} found at absolute path: {image_path}")
                else:
                    local_errors.append(f"{image_type} file not found in any expected folder: {image_path}")
                    local_errors.append(f"Checked folders: {', '.join(possible_folders)}")
        
        except Exception as e:
            local_errors.append(f"Error validating {image_type}: {str(e)}")
        
        return local_warnings, local_errors
    
    # Validate poster
    poster_warnings, poster_errors = validate_local_image(poster_path, "poster")
    warnings.extend(poster_warnings)
    errors.extend(poster_errors)
    
    # Validate backdrop
    backdrop_warnings, backdrop_errors = validate_local_image(backdrop_path, "backdrop")
    warnings.extend(backdrop_warnings)
    errors.extend(backdrop_errors)
    
    return warnings, errors

def validate_content_scanning(file_path):
    """Basic content scanning for security and appropriateness"""
    import hashlib
    
    warnings = []
    errors = []
    
    if not file_path or not os.path.exists(file_path):
        errors.append("File not found for content scanning")
        return warnings, errors
    
    try:
        # File type detection using basic methods
        try:
            # Try to use python-magic if available
            import magic
            file_type = magic.from_file(file_path, mime=True)
            if not file_type.startswith('video/'):
                errors.append(f"File is not a video file: {file_type}")
                return warnings, errors
        except ImportError:
            # Fallback to file extension check
            video_extensions = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v']
            if not any(file_path.lower().endswith(ext) for ext in video_extensions):
                warnings.append("Could not verify file type (python-magic not available)")
        except Exception as e:
            warnings.append(f"Could not detect file type: {str(e)}")
        
        # File size check
        file_size = os.path.getsize(file_path)
        if file_size == 0:
            errors.append("File is empty")
            return warnings, errors
        elif file_size < 1024 * 1024:  # Less than 1MB
            warnings.append("File is suspiciously small for a video")
        elif file_size > 100 * 1024 * 1024 * 1024:  # Greater than 100GB
            warnings.append("File is extremely large")
        
        # Basic security scanning (file extension check)
        dangerous_extensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.com', '.msi']
        if any(file_path.lower().endswith(ext) for ext in dangerous_extensions):
            errors.append("File has dangerous extension")
        
        # Calculate file hash for duplicate detection
        try:
            hasher = hashlib.md5()
            with open(file_path, 'rb') as f:
                # Read first 64KB for quick hash (for large files)
                chunk = f.read(65536)
                hasher.update(chunk)
            file_hash = hasher.hexdigest()
            log_info(f"File hash (first 64KB): {file_hash}")
            
        except Exception as e:
            warnings.append(f"Could not calculate file hash: {str(e)}")
        
        # Basic metadata extraction for content analysis
        try:
            metadata = get_video_metadata(file_path)
            if metadata:
                # Check for suspicious metadata
                format_info = metadata.get('format', {})
                
                # Check duration
                duration = format_info.get('duration')
                if duration:
                    duration_seconds = float(duration)
                    if duration_seconds < 60:  # Less than 1 minute
                        warnings.append("Video is very short")
                    elif duration_seconds > 8 * 60 * 60:  # More than 8 hours
                        warnings.append("Video is unusually long")
                
                # Check for multiple video streams
                video_streams = [s for s in metadata.get('streams', []) if s.get('codec_type') == 'video']
                if len(video_streams) > 1:
                    warnings.append("Multiple video streams detected")
                
                # Check for suspicious metadata tags
                suspicious_tags = ['copyright', 'encrypted', 'drm', 'protection']
                tags = format_info.get('tags', {})
                if isinstance(tags, dict):
                    for key, value in tags.items():
                        if any(tag in str(key).lower() or tag in str(value).lower() for tag in suspicious_tags):
                            warnings.append(f"Suspicious metadata tag found: {key}={value}")
            
        except Exception as e:
            warnings.append(f"Could not analyze video metadata: {str(e)}")
    
    except Exception as e:
        errors.append(f"Content scanning failed: {str(e)}")
    
    return warnings, errors

def validate_content_categorization(content_data, content_type):
    """Automatic content categorization and validation"""
    warnings = []
    errors = []
    
    try:
        title = content_data.get('title', '').lower()
        overview = content_data.get('overview', '').lower()
        genres = content_data.get('genres', [])
        
        # Convert genres to list if it's a string
        if isinstance(genres, str):
            genres = [g.strip().lower() for g in genres.split(',')]
        elif isinstance(genres, list):
            genres = [g.lower() if isinstance(g, str) else str(g).lower() for g in genres]
        
        # Define category keywords
        category_keywords = {
            'animated': ['animation', 'cartoon', 'anime', 'animated'],
            'documentary': ['documentary', 'biography', 'true story', 'based on true'],
            'horror': ['horror', 'scary', 'haunted', 'zombie', 'vampire', 'ghost'],
            'comedy': ['comedy', 'funny', 'humor', 'laugh', 'comic'],
            'action': ['action', 'fight', 'battle', 'war', 'combat', 'martial arts'],
            'romance': ['romance', 'love', 'romantic', 'wedding', 'relationship'],
            'sci-fi': ['science fiction', 'sci-fi', 'space', 'alien', 'future', 'robot'],
            'fantasy': ['fantasy', 'magic', 'wizard', 'dragon', 'supernatural'],
            'thriller': ['thriller', 'suspense', 'mystery', 'detective', 'crime'],
            'family': ['family', 'kids', 'children', 'disney', 'pixar'],
            'adult': ['adult', 'mature', 'explicit', 'rated r', '18+']
        }
        
        # Analyze title and overview for category hints
        text_to_analyze = f"{title} {overview}"
        detected_categories = []
        
        for category, keywords in category_keywords.items():
            if any(keyword in text_to_analyze for keyword in keywords):
                detected_categories.append(category)
        
        # Check genre consistency
        genre_inconsistencies = []
        if 'animated' in detected_categories and not any('animation' in g for g in genres):
            genre_inconsistencies.append("Content appears animated but animation genre not listed")
        
        if 'documentary' in detected_categories and not any('documentary' in g for g in genres):
            genre_inconsistencies.append("Content appears to be documentary but genre not listed")
        
        if 'horror' in detected_categories and not any('horror' in g for g in genres):
            genre_inconsistencies.append("Content appears to be horror but genre not listed")
        
        # Content type validation
        if content_type == 'movie':
            # Check if this might be a TV show episode
            episode_indicators = ['episode', 'season', 'part', 'chapter', 's01e', 's1e', 'ep']
            if any(indicator in title for indicator in episode_indicators):
                warnings.append("Title suggests this might be an episode, not a movie")
        
        elif content_type == 'tv':
            # Check if this might be a movie
            movie_indicators = ['the movie', 'feature film', 'theatrical release']
            if any(indicator in title for indicator in movie_indicators):
                warnings.append("Title suggests this might be a movie, not a TV episode")
        
        # Language detection (basic)
        non_english_indicators = ['subtitled', 'dubbed', 'foreign', 'international']
        if any(indicator in overview for indicator in non_english_indicators):
            warnings.append("Content may be non-English language")
        
        # Suggest content categorization
        if detected_categories:
            warnings.append(f"Detected content categories: {', '.join(detected_categories)}")
        
        if genre_inconsistencies:
            for inconsistency in genre_inconsistencies:
                warnings.append(f"Genre inconsistency: {inconsistency}")
        
    except Exception as e:
        errors.append(f"Content categorization failed: {str(e)}")
    
    return warnings, errors

def get_free_disk_space(path):
    """Get free disk space in bytes for the given path"""
    try:
        # Try statvfs (Unix/Linux/macOS)
        statvfs = os.statvfs(path)
        return statvfs.f_frsize * statvfs.f_bavail
    except (AttributeError, OSError):
        # Fallback for systems without statvfs
        try:
            import shutil
            total, used, free = shutil.disk_usage(path)
            return free
        except Exception:
            return None

def get_file_size(file_path):
    """Get file size in bytes"""
    try:
        return os.path.getsize(file_path)
    except OSError:
        return None