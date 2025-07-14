from flask import Blueprint, jsonify, send_from_directory, request
from utils.data_helpers import get_movies, get_tv_shows
import os
from utils.logger import log_error
from api.utils import admin_token_required

cdn_bp = Blueprint('cdn_bp', __name__, url_prefix='/cdn')

# Endpoint to serve images
@cdn_bp.route('/images/<path:filename>', methods=['GET'])
def get_image(filename):
    try:
        return send_from_directory('cdn/posters_combined', filename)
    except FileNotFoundError:
        log_error("File not found")
        return jsonify({"message":"File not found.", "error_reason": "image_not_found"}), 404
    except Exception as e:
        log_error(f"An error occurred. Error: {str(e)}")
        return jsonify({"message":f"An error occurred. Error: {str(e)}", "error_reason": "image_error"}), 500

@cdn_bp.route('/images/<path:filename>/check', methods=['GET'])
def check_image(filename):
    filepath = os.path.join('cdn','posters_combined', filename)
    if os.path.exists(filepath) and os.path.isfile(filepath):
        return jsonify(exist=True, return_reason="check_image_found", url=filename)
    else:
        return jsonify(exist=False, return_reason="check_image_not_found", url=filename)

@cdn_bp.route('/genres', methods=['GET'])
def get_genres():
    temp_movies = get_movies()
    temp_tv_series = get_tv_shows()

    list_type = request.args.get('list_type', 'all', type=str)

    if list_type == 'movies':
        use_list = temp_movies
    elif list_type == 'tv':
        use_list = temp_tv_series
    else:
        use_list = temp_movies + temp_tv_series

    genres = set()
    for item in use_list:
        if "genres" in item:
            if isinstance(item['genres'], str):
                genres.update([g.strip().lower() for g in item['genres'].split(',')])
            elif isinstance(item['genres'], list):
                genres.update([g['name'].lower() for g in item['genres'] if isinstance(g, dict) and 'name' in g])
    return jsonify(sorted(genres))

@cdn_bp.route('/combined', methods=['GET'])
@admin_token_required('moderator')
def get_combined_content(current_admin):
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 15, type=int), 100)  # Limit max items per page
    content_type = request.args.get('content_type', '')
    search_query = request.args.get('q', '')
    
    temp_movies = get_movies()
    temp_tv_series = get_tv_shows()
    
    # Apply content type filter
    if content_type == 'movie':
        items = temp_movies
    elif content_type == 'tv':
        items = temp_tv_series
    else:
        # Combine both, sorted by ID
        items = sorted(temp_movies + temp_tv_series, key=lambda x: x.get('id', 0))
    
    # Apply search filter if provided
    if search_query:
        filtered_items = []
        for item in items:
            title = item.get('title') or item.get('name') or ''
            if search_query.lower() in title.lower():
                filtered_items.append(item)
        items = filtered_items
    
    # Calculate total for pagination
    total = len(items)
    
    # Apply pagination
    start = (page - 1) * per_page
    end = start + per_page
    paginated_items = items[start:end]
    
    return jsonify({
        'items': paginated_items,
        'total': total,
        'page': page,
        'per_page': per_page
    })
