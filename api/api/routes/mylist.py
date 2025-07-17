from flask import Blueprint, request, jsonify, abort
from api.utils import token_required
from cdn.utils import paginate
from models import User, MyList, db, Movie, TVShow

mylist_bp = Blueprint('mylist_bp', __name__, url_prefix='/api/mylist')

@mylist_bp.route('/add', methods=['POST'])
@token_required
def add_to_mylist(current_user):
    data = request.form.to_dict()
    content_type = data.get('content_type')
    content_id = data.get('content_id')

    if not content_type or not content_id:
        return jsonify({'message': 'Content type and content ID are required'}), 400

    existing_entry = MyList.query.filter_by(user_id=current_user.id, content_type=content_type, content_id=content_id).first()
    if existing_entry:
        return jsonify({'message': 'This item is already in your watchlist', 'exist': True}), 400

    mylist_item = MyList(user_id=current_user.id, content_type=content_type, content_id=content_id)
    db.session.add(mylist_item)
    db.session.commit()

    return jsonify({'message': 'Item added to watchlist successfully.', 'action': 'add', 'exist': True})


@mylist_bp.route('/delete', methods=['POST'])
@token_required
def delete_from_mylist(current_user):
    data = request.form.to_dict()
    content_type = data.get('content_type')
    content_id = data.get('content_id')

    if not content_type or not content_id:
        return jsonify({'message': 'Content type and content ID are required'}), 400

    mylist_item = MyList.query.filter_by(user_id=current_user.id, content_type=content_type,content_id=content_id).first()
    mylist_items = MyList.query.filter_by(user_id=current_user.id, content_type=content_type,content_id=content_id).all()
    if not mylist_item:
        return jsonify({'message': 'This item is not in your watchlist', 'action': 'delete', 'exist': False}), 400

    db.session.delete(mylist_item)
    db.session.commit()

    return jsonify({'message': 'Item removed to watchlist successfully.', 'action': 'delete', 'exist': False})


@mylist_bp.route('/check', methods=['POST'])
@token_required
def check_in_mylist(current_user):
    data = request.form.to_dict()
    content_type = data.get('content_type')
    content_id = data.get('content_id')

    if not content_type or not content_id:
        return jsonify({'message': 'Content type and content ID are required'}), 400

    existing_entry = MyList.query.filter_by(user_id=current_user.id, content_type=content_type, content_id=content_id).first()
    if existing_entry:
        return jsonify({'exists': True}), 200

    return jsonify({'exists': False}), 200

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

    mylist_items = MyList.query.filter_by(user_id=current_user.id).all()

    # Fetch movie details for each item in the watchlist
    titles = []
    for title in mylist_items:
        content_item = None
        
        if title.content_type == 'movie':
            movie = Movie.query.filter_by(movie_id=title.content_id).first()
            if movie:
                content_item = movie.serialize
            else:
                movie = next((item for item in temp_movies if item["id"] == title.content_id), None)
                if movie:
                    content_item = movie
        
        elif title.content_type == 'tv':
            tv_show = TVShow.query.filter_by(show_id=title.content_id).first()
            if tv_show:
                content_item = tv_show.serialize
                # Ensure TV shows have an id field (copy from show_id if needed)
                if 'show_id' in content_item and 'id' not in content_item:
                    content_item['id'] = content_item['show_id']
            else:
                tv = next((item for item in temp_tv_series if item["id"] == title.content_id), None)
                if tv:
                    content_item = tv
                    # Ensure TV shows have an id field (copy from show_id if needed)
                    if 'show_id' in content_item and 'id' not in content_item:
                        content_item['id'] = content_item['show_id']
        
        if content_item:
            # Consistently set content_type/media_type for frontend
            content_item['media_type'] = title.content_type
            content_item['content_type'] = title.content_type
            
            # Add watch history if requested
            if include_watch_history:
                watch_history = serialize_watch_history(
                    content_id=title.content_id,
                    content_type=title.content_type,
                    current_user=current_user,
                    include_next_episode=True
                )
                if watch_history:
                    content_item['watch_history'] = watch_history
                    
            titles.append(content_item)

    limited_titles = paginate(titles, page, per_page)
    return jsonify(limited_titles), 200