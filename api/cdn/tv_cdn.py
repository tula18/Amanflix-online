from flask import Blueprint, jsonify, request, abort
from cdn.utils import paginate, calculate_similarity, check_images_existence
from api.utils import token_required, serialize_watch_history
from utils.data_helpers import get_tv_shows, get_tv_shows_with_images
import random

tv_cdn_bp = Blueprint('tv_cdn_bp', __name__, url_prefix='/cdn')

# Endpoint to get all TV series with pagination
@tv_cdn_bp.route('/tv', methods=['GET'])
@token_required
def get_tv_series(current_user):
    temp_tv_series = get_tv_shows()
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    include_watch_history = request.args.get('include_watch_history', False, type=bool)
    
    paginated_tv_series = paginate(temp_tv_series, page, per_page)
    
    # Add watch history if requested
    if include_watch_history:
        for show in paginated_tv_series:
            watch_history = serialize_watch_history(
                content_id=show['id'],
                content_type='tv',
                current_user=current_user,
                include_next_episode=True
            )
            if watch_history:
                show['watch_history'] = watch_history
    
    return jsonify(paginated_tv_series)

# Endpoint to search for TV series by title
@tv_cdn_bp.route('/tv/search', methods=['GET'])
@token_required
def search_tv_series(current_user):
    temp_tv_series = get_tv_shows()
    query = request.args.get('q', '', type=str)
    max_results = request.args.get('max_results', 3, type=int)
    include_watch_history = request.args.get('include_watch_history', False, type=bool)
    
    result = [
        item for item in temp_tv_series
        if query.lower() in str(item.get('name', '')).lower()
    ]
    limited_result = result[:max_results]
    
    # Add watch history if requested
    if include_watch_history:
        for show in limited_result:
            watch_history = serialize_watch_history(
                content_id=show['id'],
                content_type='tv',
                current_user=current_user,
                include_next_episode=True
            )
            if watch_history:
                show['watch_history'] = watch_history
    
    return jsonify(limited_result)

# Endpoint to get a single TV series by ID
@tv_cdn_bp.route('/tv/<int:tv_id>')
@token_required
def get_tv(current_user, tv_id):
    temp_tv_series = get_tv_shows()
    include_watch_history = request.args.get('include_watch_history', False, type=bool)
    
    tv = next((item for item in temp_tv_series if item["id"] == tv_id), None)
    if not tv:
        return jsonify(message="The selected Show not found!"), 404
    
    # Add watch history if requested
    if include_watch_history:
        watch_history = serialize_watch_history(
            content_id=tv_id,
            content_type='tv',
            current_user=current_user,
            include_next_episode=True
        )
        if watch_history:
            tv['watch_history'] = watch_history
    
    return jsonify(tv)

# Endpoint to get random TV shows with pagination
@tv_cdn_bp.route('/tv/random', methods=['GET'])
@token_required
def get_random_tv(current_user):
    temp_tv_series = get_tv_shows()
    temp_tv_series_with_images = get_tv_shows_with_images()
    
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    min_rating = request.args.get('min_rating', 0, type=float)
    max_rating = request.args.get('max_rating', 10, type=float)
    with_images = request.args.get('with_images', False, type=bool)
    include_watch_history = request.args.get('include_watch_history', False, type=bool)
    
    temp_shows = temp_tv_series
    if with_images:
        temp_shows = temp_tv_series_with_images
    
    shuffled_tv = temp_shows.copy()
    random.shuffle(shuffled_tv)
    
    def apply_filters(items):
        results = []
        for item in items:
            vote_average = item.get('vote_average', 0)
            if isinstance(vote_average, str):
                try:
                    vote_average = float(vote_average)
                except ValueError:
                    continue
            if (min_rating <= vote_average <= max_rating):
                results.append(item)
        return results
    
    tv_results = apply_filters(shuffled_tv)
    
    paginated_tv_series = paginate(tv_results, page, per_page)
    
    # Add watch history if requested
    if include_watch_history:
        for show in paginated_tv_series:
            watch_history = serialize_watch_history(
                content_id=show['id'],
                content_type='tv',
                current_user=current_user,
                include_next_episode=True
            )
            if watch_history:
                show['watch_history'] = watch_history
    
    return jsonify(paginated_tv_series)

@tv_cdn_bp.route('/tv/<int:tv_id>/similar', methods=['GET'])
@token_required
def get_similar_tv_series(current_user, tv_id):
    temp_tv_series = get_tv_shows()
    temp_tv_series_with_images = get_tv_shows_with_images()
    
    with_images = request.args.get('with_images', False, type=bool)
    is_random = request.args.get('random', False, type=bool)
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 12, type=int)
    include_watch_history = request.args.get('include_watch_history', False, type=bool)
    
    temp_shows = temp_tv_series
    if with_images:
        temp_shows = temp_tv_series_with_images
    
    tv = next((item for item in temp_shows if item["id"] == tv_id), None)
    if not tv:
        return jsonify(message="The selected Show not found!"), 404
    
    similar_tv = []
    for item in temp_shows:
        if item['id'] != tv_id:
            similarity = calculate_similarity(tv, item)
            if similarity > 0:
                similar_tv.append((item, similarity))
    
    similar_tv = sorted(similar_tv, key=lambda x: x[1], reverse=True)
    
    if is_random:
        random.shuffle(similar_tv)
    
    paginated_shows = paginate(similar_tv, page, per_page)
    result = [item for item, _ in paginated_shows]
    
    # Add watch history if requested
    if include_watch_history:
        for show in result:
            watch_history = serialize_watch_history(
                content_id=show['id'],
                content_type='tv',
                current_user=current_user,
                include_next_episode=True
            )
            if watch_history:
                show['watch_history'] = watch_history
    
    return jsonify(result)