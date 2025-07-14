from flask import Blueprint, request, jsonify, abort
from api.utils import token_required
from cdn.utils import paginate
from models import User, UploadRequest, db, Movie, TVShow

upload_request_bp = Blueprint('upload_request_bp', __name__, url_prefix='/api/uploadRequest')

@upload_request_bp.route('/add', methods=['POST'])
@token_required
def add_to_uploadRequest(current_user):
    data = request.form.to_dict()
    content_type = data.get('content_type')
    content_id = data.get('content_id')

    if not content_type or not content_id:
        return jsonify({'message': 'Content type and content ID are required'}), 400

    existing_entry = UploadRequest.query.filter_by(user_id=current_user.id, content_type=content_type, content_id=content_id).first()
    if existing_entry:
        return jsonify({'message': 'This item is already in your Upload Requests', 'exist': True}), 400

    uploadRequest_item = UploadRequest(user_id=current_user.id, content_type=content_type, content_id=content_id)
    db.session.add(uploadRequest_item)
    db.session.commit()

    return jsonify({'message': 'Item added to Upload Requests successfully.', 'action': 'add', 'exist': True})

@upload_request_bp.route('/delete', methods=['POST'])
@token_required
def delete_from_uploadRequest(current_user):
    data = request.form.to_dict()
    content_type = data.get('content_type')
    content_id = data.get('content_id')

    if not content_type or not content_id:
        return jsonify({'message': 'Content type and content ID are required'}), 400

    uploadRequest_item = UploadRequest.query.filter_by(user_id=current_user.id, content_type=content_type,content_id=content_id).first()
    uploadRequest_items = UploadRequest.query.filter_by(user_id=current_user.id, content_type=content_type,content_id=content_id).all()
    if not uploadRequest_item:
        return jsonify({'message': 'This item is not in your Upload Requests', 'action': 'delete', 'exist': False}), 400

    db.session.delete(uploadRequest_item)
    db.session.commit()

    return jsonify({'message': 'Item removed from Upload Requests successfully.', 'action': 'delete', 'exist': False})

@upload_request_bp.route('/check', methods=['POST'])
@token_required
def check_in_uploadRequest(current_user):
    data = request.form.to_dict()
    content_type = data.get('content_type')
    content_id = data.get('content_id')

    if not content_type or not content_id:
        return jsonify({'message': 'Content type and content ID are required'}), 400

    existing_entry = UploadRequest.query.filter_by(user_id=current_user.id, content_type=content_type, content_id=content_id).first()
    if existing_entry:
        return jsonify({'exists': True}), 200

    return jsonify({'exists': False}), 200

@upload_request_bp.route('/all', methods=['GET'])
@token_required
def get_all_uploadRequest(current_user):
    from utils.data_helpers import get_movies, get_tv_shows
    temp_movies = get_movies()
    temp_tv_series = get_tv_shows()
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)

    uploadRequest_items = UploadRequest.query.filter_by(user_id=current_user.id).all()

    # Fetch movie details for each item in the watchlist
    titles = []
    for title in uploadRequest_items:
        if title.content_type == 'movie':
            movie = next((item for item in temp_movies if item["id"] == title.content_id), None)
            if movie:
                titles.append(movie)
            pass
        elif title.content_type == 'tv':
            tv = next((item for item in temp_tv_series if item["id"] == title.content_id), None)
            if tv:
                titles.append(tv)
            pass

    limited_titles = paginate(titles, page, per_page)

    return jsonify(limited_titles), 200