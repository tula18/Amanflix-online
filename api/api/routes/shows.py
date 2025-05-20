from flask import Blueprint, request, jsonify, abort
from models import TVShow
from api.utils import admin_token_required
import os

shows_bp = Blueprint('shows_bp', __name__, url_prefix='/api')

@shows_bp.route('/shows', methods=['GET'])
def get_shows():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    paginated_shows = TVShow.query.paginate(page=page, per_page=per_page, error_out=False)
    return jsonify([show.serialize for show in paginated_shows.items]), 200

@shows_bp.route('/shows/search', methods=['GET'])
def search_show():
    query = request.args.get('q', '', type=str)
    max_results = request.args.get('max_results', 3, type=int)
    shows = TVShow.query.filter(TVShow.title.ilike(f'%{query}%')).all()
    result = [shows.serialize for show in shows]
    limited_result = result[:max_results]
    return jsonify(limited_result)

@shows_bp.route('/shows/<int:show_id>', methods=['GET'])
def get_show(show_id):
    show = TVShow.query.filter_by(show_id=show_id).first()
    if show is None:
        return jsonify(message="The selected Show not found!"), 404
    return jsonify(show.serialize)

@shows_bp.route('/shows/<int:show_id>/check', methods=['GET'])
def check_show_exists(show_id):
    """Check if a TV show exists in the database and has video files"""
    from models import TVShow, Season, Episode
    import os
    
    show = TVShow.query.filter_by(show_id=show_id).first()
    if not show:
        return jsonify({
            "exist": False,
            "message": "TV show not found", 
            "return_reason": "not_found"
        }), 200
    
    result = {
        "exist": True,
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
    
    # Also add a simple check if any episodes have videos available
    has_episodes = False
    for season_num in result["episodes"]:
        for episode_num in result["episodes"][season_num]:
            if result["episodes"][season_num][episode_num]["exists"]:
                has_episodes = True
                break
        if has_episodes:
            break
    
    # Format the response to match what the Model.js component expects
    if not has_episodes:
        result["exist"] = False
        result["message"] = "TV show exists but has no streamable episodes"
        result["return_reason"] = "no_video"
    else:
        result["return_reason"] = "ready"
    
    return jsonify(result), 200