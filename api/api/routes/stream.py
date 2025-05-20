from flask import Blueprint, request, jsonify, send_file, make_response
from werkzeug.utils import secure_filename
from api.utils import ensure_upload_folder_exists, parse_watch_id
from models import Episode, Season 
import os

stream_bp = Blueprint('stream_bp', __name__, url_prefix='/api')

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
    
    # For TV shows, we might need to lookup the actual video file based on season and episode
    if content_type == 'tv':
        season_number = parsed['season_number']
        episode_number = parsed['episode_number']
        
        # Look up the specific episode
        episode = Episode.query.join(Season).filter(
            Season.tvshow_id == content_id,
            Season.season_number == season_number,
            Episode.episode_number == episode_number
        ).first()
        
        if episode:
            video_id = episode.video_id
        else:
            # Fallback to constructing a predictable ID if not in database
            video_id = f"{content_id}{season_number}{episode_number}"
    else:
        # For movies, the content ID is the video ID
        video_id = str(content_id)
    
    # Check if the file exists
    mp4_path = os.path.join('uploads', f"{video_id}.mp4")
    avi_path = os.path.join('uploads', f"{video_id}.avi")

    if os.path.exists(mp4_path):
        file_path = mp4_path
        mimetype = 'video/mp4'
    elif os.path.exists(avi_path):
        file_path = avi_path
        mimetype = 'video/x-msvideo'
    else:
        return jsonify(message="File not found"), 404

    # Rest of the streaming code remains the same
    try:
        return send_file(file_path, mimetype=mimetype)
    except FileNotFoundError:
        return jsonify({"message":"The content is not available", "error_reason": "video_not_found"}), 404
    except Exception as e:
        return jsonify({"message":"Our apologies, something went wrong on our end.", "error_reason": "video_error"})

@stream_bp.route('/watch/<string:filename>', methods=['GET'])
def stream_video2(filename):
    from app import app
    # Check if the file exists
    mp4_path = os.path.join('uploads', filename + '.mp4')
    avi_path = os.path.join('uploads', filename + '.avi')

    if os.path.exists(mp4_path):
        file_path = mp4_path
        mimetype = 'video/mp4'
    elif os.path.exists(avi_path):
        file_path = avi_path
        mimetype = 'video/x-msvideo'
    else:
        return jsonify(message="File not found"), 404

    # Set up the response
    response = make_response()
    response.headers['Content-Type'] = mimetype
    
    # For MP4, allow streaming; for AVI, prevent download
    if mimetype == 'video/mp4':
        response.headers['Content-Disposition'] = f'inline; filename={os.path.basename(mp4_path)}'
    else:
        response.headers['Content-Disposition'] = f'attachment; filename={os.path.basename(avi_path)}'

    try:
        return app.send_from_directory('uploads', os.path.basename(file_path), response=response)
    except FileNotFoundError:
        return jsonify(message="The content is not available"), 404
    except Exception as e:
        return jsonify(message="Our apologies, something went wrong on our end.")