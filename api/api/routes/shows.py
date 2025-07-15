from flask import Blueprint, request, jsonify, abort
from models import TVShow
from api.utils import admin_token_required, token_required, serialize_watch_history
import os

shows_bp = Blueprint('shows_bp', __name__, url_prefix='/api')

@shows_bp.route('/shows', methods=['GET'])
@token_required
def get_shows(current_user):
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    order = request.args.get('order', 'asc', type=str)  # Default order is ascending
    sort_by_field = request.args.get('sort_by', None, type=str)  # Default sort_by is None
    include_watch_history = request.args.get('include_watch_history', False, type=bool)
    reverse = request.args.get('reverse', False, type=bool)
    
    # Get all Shows first
    query = TVShow.query
    
    # Apply sorting if sort_by_field is provided
    if sort_by_field:
        sort_by = getattr(TVShow, sort_by_field, None)
        if sort_by:
            if order.lower() == 'desc':
                query = query.order_by(sort_by.desc())
            else:
                query = query.order_by(sort_by.asc())
                
    # Get all shows and reverse the list
    all_shows = query.all()
    if reverse:
        all_shows.reverse()
    
    # Manual pagination on the reversed list
    total = len(all_shows)
    start = (page - 1) * per_page
    end = start + per_page
    shows_page = all_shows[start:end]
    
    show_list = [movie.serialize for movie in shows_page]
    
    # Add watch history if requested
    if include_watch_history:
        for show in show_list:
            watch_history = serialize_watch_history(
                content_id=show['show_id'],
                content_type='tv',
                current_user=current_user,
                include_next_episode=True
            )
            if watch_history:
                show['watch_history'] = watch_history
    
    return jsonify(show_list), 200

@shows_bp.route('/shows/search', methods=['GET'])
@token_required
def search_show(current_user):
    query = request.args.get('q', '', type=str)
    max_results = request.args.get('max_results', 3, type=int)
    include_watch_history = request.args.get('include_watch_history', False, type=bool)
    
    shows = TVShow.query.filter(TVShow.title.ilike(f'%{query}%')).all()
    result = [show.serialize for show in shows]
    limited_result = result[:max_results]
    
    # Add watch history if requested
    if include_watch_history:
        for show in limited_result:
            watch_history = serialize_watch_history(
                content_id=show['show_id'],
                content_type='tv',
                current_user=current_user,
                include_next_episode=True
            )
            if watch_history:
                show['watch_history'] = watch_history
    
    return jsonify(limited_result)

@shows_bp.route('/shows/<int:show_id>', methods=['GET'])
@token_required
def get_show(current_user, show_id):
    include_watch_history = request.args.get('include_watch_history', False, type=bool)
    
    show = TVShow.query.filter_by(show_id=show_id).first()
    if show is None:
        return jsonify(message="The selected Show not found!"), 404
    
    show_data = show.serialize
    
    # Add watch history if requested
    if include_watch_history:
        watch_history = serialize_watch_history(
            content_id=show_data['show_id'],
            content_type='tv',
            current_user=current_user,
            include_next_episode=True
        )
        if watch_history:
            show_data['watch_history'] = watch_history
    
    return jsonify(show_data)

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