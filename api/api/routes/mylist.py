from flask import Blueprint, request, jsonify, abort
from api.utils import token_required
from cdn.utils import paginate
from models import User, MyList, db, Movie, TVShow
from api.db_utils import safe_commit
from api.cache import get_user_mylist_cached, invalidate_user_mylist, get_movie_by_id_cached, get_show_by_id_cached

mylist_bp = Blueprint('mylist_bp', __name__, url_prefix='/api/mylist')

def _normalize_content_type(content_type):
    if isinstance(content_type, str):
        content_type = content_type.lower()
    if content_type in ('movie', 'movies'):
        return 'movie'
    if content_type in ('tv', 'tv_series', 'show', 'shows'):
        return 'tv'
    return content_type

def _same_mylist_item(item, content_type, content_id):
    return (
        _normalize_content_type(item.content_type) == content_type
        and item.content_id == content_id
    )

def _get_mylist_payload():
    data = request.form.to_dict()
    content_type = _normalize_content_type(data.get('content_type'))
    content_id = data.get('content_id')

    if not content_type or not content_id:
        return content_type, content_id, jsonify({'message': 'Content type and content ID are required'}), 400

    try:
        content_id = int(content_id)
    except (TypeError, ValueError):
        return content_type, content_id, jsonify({'message': 'Content ID must be a valid integer'}), 400

    return content_type, content_id, None, None

@mylist_bp.route('/add', methods=['POST'])
@token_required
def add_to_mylist(current_user):
    content_type, content_id, error_response, status_code = _get_mylist_payload()
    if error_response is not None:
        return error_response, status_code

    user_entries = MyList.query.filter_by(user_id=current_user.id, content_id=content_id).all()
    existing_entry = next((entry for entry in user_entries if _same_mylist_item(entry, content_type, content_id)), None)
    if existing_entry:
        return jsonify({'message': 'This item is already in your watchlist', 'exist': True}), 400

    mylist_item = MyList(user_id=current_user.id, content_type=content_type, content_id=content_id)
    db.session.add(mylist_item)
    if not safe_commit():
        return jsonify({'message': 'Failed to add to watchlist due to database error'}), 500

    invalidate_user_mylist(current_user.id)
    return jsonify({'message': 'Item added to watchlist successfully.', 'action': 'add', 'exist': True})


@mylist_bp.route('/delete', methods=['POST'])
@token_required
def delete_from_mylist(current_user):
    content_type, content_id, error_response, status_code = _get_mylist_payload()
    if error_response is not None:
        return error_response, status_code

    user_entries = MyList.query.filter_by(user_id=current_user.id, content_id=content_id).all()
    mylist_item = next((entry for entry in user_entries if _same_mylist_item(entry, content_type, content_id)), None)
    if not mylist_item:
        return jsonify({'message': 'This item is not in your watchlist', 'action': 'delete', 'exist': False}), 400

    db.session.delete(mylist_item)
    if not safe_commit():
        return jsonify({'message': 'Failed to remove from watchlist due to database error'}), 500

    invalidate_user_mylist(current_user.id)
    return jsonify({'message': 'Item removed to watchlist successfully.', 'action': 'delete', 'exist': False})


@mylist_bp.route('/check', methods=['POST'])
@token_required
def check_in_mylist(current_user):
    content_type, content_id, error_response, status_code = _get_mylist_payload()
    if error_response is not None:
        return error_response, status_code

    mylist_entries = get_user_mylist_cached(current_user.id)
    exists = any(
        _normalize_content_type(entry['content_type']) == content_type and entry['content_id'] == content_id
        for entry in mylist_entries
    )
    return jsonify({'exists': exists}), 200

@mylist_bp.route('/all', methods=['GET'])
@token_required
def get_all_mylist(current_user):
    from utils.data_helpers import get_tv_shows, get_movies
    temp_tv_series = get_tv_shows()
    temp_movies = get_movies()
    from api.utils import serialize_watch_history
    
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    include_watch_history = request.args.get('include_watch_history', False, type=bool)

    mylist_entries = get_user_mylist_cached(current_user.id)

    # Fetch movie details for each item in the watchlist
    titles = []
    for entry in mylist_entries:
        content_item = None
        content_type = entry['content_type']
        content_id = entry['content_id']
        
        if content_type == 'movie':
            cached_movie = get_movie_by_id_cached(content_id)
            if cached_movie:
                content_item = dict(cached_movie)
            else:
                movie = next((item for item in temp_movies if item["id"] == content_id), None)
                if movie:
                    content_item = movie
        
        elif content_type == 'tv':
            cached_show = get_show_by_id_cached(content_id)
            if cached_show:
                content_item = dict(cached_show)
                # Ensure TV shows have an id field (copy from show_id if needed)
                if 'show_id' in content_item and 'id' not in content_item:
                    content_item['id'] = content_item['show_id']
            else:
                tv = next((item for item in temp_tv_series if item["id"] == content_id), None)
                if tv:
                    content_item = tv
                    # Ensure TV shows have an id field (copy from show_id if needed)
                    if 'show_id' in content_item and 'id' not in content_item:
                        content_item['id'] = content_item['show_id']
        
        if content_item:
            # Consistently set content_type/media_type for frontend
            content_item['media_type'] = content_type
            content_item['content_type'] = content_type
            
            # Add watch history if requested
            if include_watch_history:
                watch_history = serialize_watch_history(
                    content_id=content_id,
                    content_type=content_type,
                    current_user=current_user,
                    include_next_episode=True
                )
                if watch_history:
                    content_item['watch_history'] = watch_history
                    
            titles.append(content_item)

    limited_titles = paginate(titles, page, per_page)
    return jsonify(limited_titles), 200
