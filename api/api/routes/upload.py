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
        updated_season_ids = set()

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
                    video_path = os.path.join('uploads', f'{episode_id}.mp4')
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
    data = request.get_json()
    
    pprint(data, indent=2)
    
    if not data:
        return jsonify(success=False, message="No data provided"), 400
    
    content_type = data.get('content_type')  # 'movie' or 'tv'
    content_id = data.get('content_id')
    
    if not content_type or not content_id:
        return jsonify(success=False, message="content_type and content_id are required"), 400
    
    try:
        content_id = int(content_id)
    except (ValueError, TypeError):
        return jsonify(success=False, message="content_id must be a valid integer"), 400
    
    validation_result = {
        'success': True,
        'can_upload': True,
        'warnings': [],
        'errors': [],
        'content_type': content_type,
        'content_id': content_id
    }
    
    if content_type == 'movie':
        # Check if movie already exists in database
        existing_movie = Movie.query.filter_by(movie_id=content_id).first()
        if existing_movie:
            validation_result['can_upload'] = False
            validation_result['errors'].append({
                'type': 'duplicate_database',
                'message': f"Movie with ID {content_id} already exists in the database",
                'suggestion': "Try editing the existing movie from the Manage Movies page or enable Force Overwrite"
            })
        
        # Check if video file already exists
        video_filepath = os.path.join('uploads', str(content_id) + '.mp4')
        if os.path.exists(video_filepath):
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
    
    elif content_type == 'tv':
        # Check if TV show already exists in database
        existing_show = TVShow.query.filter_by(show_id=content_id).first()
        if existing_show:
            validation_result['can_upload'] = False
            validation_result['errors'].append({
                'type': 'duplicate_database',
                'message': f"TV Show with ID {content_id} already exists in the database",
                'suggestion': "Try editing the existing show from the Manage Shows page or enable Force Overwrite"
            })
        
        # For TV shows, check episodes if provided
        episodes_data = data.get('episodes', [])
        if episodes_data and existing_show:
            existing_episodes = []
            for episode_data in episodes_data:
                season_num = episode_data.get('season_number')
                episode_num = episode_data.get('episode_number')
                if season_num and episode_num:
                    # Check if episode file exists
                    episode_filename = f"{content_id}{season_num}{episode_num}.mp4"
                    episode_filepath = os.path.join('uploads', episode_filename)
                    if os.path.exists(episode_filepath):
                        existing_episodes.append(f"S{season_num}E{episode_num}")
            
            if existing_episodes:
                validation_result['warnings'].append({
                    'type': 'duplicate_episodes',
                    'message': f"Some episodes already exist: {', '.join(existing_episodes)}",
                    'suggestion': "Enable Force Overwrite for individual episodes to replace them"
                })
    
    else:
        return jsonify(success=False, message="content_type must be 'movie' or 'tv'"), 400
    
    # Set overall success based on whether there are any blocking errors
    validation_result['success'] = validation_result['can_upload']
    
    return jsonify(validation_result), 200