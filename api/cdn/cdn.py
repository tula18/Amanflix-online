from flask import Blueprint, jsonify, send_from_directory, request
import os
from utils.logger import log_error

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
    from app import movies, tv_series

    list_type = request.args.get('list_type', 'all', type=str)

    if list_type == 'movies':
        use_list = movies
    elif list_type == 'tv':
        use_list = tv_series
    else:
        use_list = movies + tv_series

    genres = set()
    for item in use_list:
        if "genres" in item:
            if isinstance(item['genres'], str):
                genres.update([g.strip().lower() for g in item['genres'].split(',')])
            elif isinstance(item['genres'], list):
                genres.update([g['name'].lower() for g in item['genres'] if isinstance(g, dict) and 'name' in g])
    return jsonify(sorted(genres))
