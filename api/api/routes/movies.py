from flask import Blueprint, request, jsonify, abort
from models import Movie
from api.utils import admin_token_required, sort, token_required, serialize_watch_history
from api.cache import get_all_movies_cached, get_movie_by_id_cached
from cdn.utils import filter_valid_genres
from paths import UPLOADS_DIR
import os
import random

movies_bp = Blueprint('movies_bp', __name__, url_prefix='/api')

# Endpoint to get all movies with pagination
@movies_bp.route('/movies', methods=['GET'])
@token_required
def get_movies(current_user):
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    order = request.args.get('order', 'asc', type=str)  # Default order is ascending
    sort_by_field = request.args.get('sort_by', None, type=str)  # Default sort_by is None
    include_watch_history = request.args.get('include_watch_history', False, type=bool)
    reverse = request.args.get('reverse', False, type=bool)
    
    # Get all Movies from cache
    all_movies_data = get_all_movies_cached()
    
    # Apply sorting if sort_by_field is provided
    if sort_by_field:
        reverse_sort = order.lower() == 'desc'
        all_movies_data.sort(key=lambda m: m.get(sort_by_field) or '', reverse=reverse_sort)
                
    if reverse:
        all_movies_data.reverse()
    
    # Manual pagination on the reversed list
    total = len(all_movies_data)
    start = (page - 1) * per_page
    end = start + per_page
    movies_page = all_movies_data[start:end]
    
    movie_list = movies_page
    
    # Add watch history if requested
    if include_watch_history:
        for movie in movie_list:
            watch_history = serialize_watch_history(
                content_id=movie['id'],
                content_type='movie',
                current_user=current_user,
                include_next_episode=False
            )
            if watch_history:
                movie['watch_history'] = watch_history
    
    return jsonify(movie_list), 200

@movies_bp.route('/movies/random', methods=['GET'])
@token_required
def get__random_movie(current_user):
    genre = request.args.get('genre', '', type=str)
    min_rating = request.args.get('min_rating', 0, type=float)
    max_rating = request.args.get('max_rating', 10, type=float)
    per_page = request.args.get('per_page', 20, type=int)
    include_watch_history = request.args.get('include_watch_history', False, type=bool)

    movies = get_all_movies_cached()

    def apply_filters(items, item_type):
        results = []
        for item in items:
            title_or_name = item.get('title')
            vote_average = item.get('vote_average', 0)
            if isinstance(vote_average, str):
                try:
                    vote_average = float(vote_average)
                except ValueError:
                    continue
            if (filter_valid_genres(item, genre) if genre else True) and \
                    (min_rating <= vote_average <= max_rating):
                item['type'] = item_type
                results.append(item)
        return results

    movie_results = apply_filters(movies, 'movie')
    random.shuffle(movie_results)

    limited_results = movie_results[:per_page]
    
    # Add watch history if requested
    if include_watch_history:
        for movie in limited_results:
            watch_history = serialize_watch_history(
                content_id=movie['id'],
                content_type='movie',
                current_user=current_user,
                include_next_episode=False
            )
            if watch_history:
                movie['watch_history'] = watch_history
    
    return jsonify(limited_results)

# Endpoint to search for movies by title
@movies_bp.route('/movies/search', methods=['GET'])
@token_required
def search_movies(current_user):
    query = request.args.get('q', '', type=str)
    max_results = request.args.get('max_results', 3, type=int)
    include_watch_history = request.args.get('include_watch_history', False, type=bool)
    
    all_movies = get_all_movies_cached()
    result = [m for m in all_movies if query.lower() in (m.get('title') or '').lower()]
    limited_result = result[:max_results]
    
    # Add watch history if requested
    if include_watch_history:
        for movie in limited_result:
            watch_history = serialize_watch_history(
                content_id=movie['id'],
                content_type='movie',
                current_user=current_user,
                include_next_episode=False
            )
            if watch_history:
                movie['watch_history'] = watch_history
    
    return jsonify(limited_result)

@movies_bp.route('/movies/<int:movie_id>', methods=['GET'])
@token_required
def get_movie(current_user, movie_id):
    include_watch_history = request.args.get('include_watch_history', False, type=bool)
    
    movie_data = get_movie_by_id_cached(movie_id)
    if movie_data is None:
        return jsonify(message="The selected Movie not found!"), 404
    
    # Add watch history if requested
    if include_watch_history:
        watch_history = serialize_watch_history(
            content_id=movie_data['id'],
            content_type='movie',
            current_user=current_user,
            include_next_episode=False
        )
        if watch_history:
            movie_data['watch_history'] = watch_history
    
    return jsonify(movie_data)

@movies_bp.route('/movies/<int:movie_id>/check', methods=['GET'])
# @admin_token_required('moderator')
def check_movie(movie_id):
    movie = Movie.query.filter_by(movie_id=movie_id).first()
    if movie is None:
        mp4_filepath = os.path.join(UPLOADS_DIR, str(movie_id) + '.mp4')
        if os.path.exists(mp4_filepath):
            return jsonify(message="Video exist but Movie's not. Enable Force overwrite to upload a new Video.", exist=True, return_reason="check_video_found")
    else:
        mp4_filepath = os.path.join(UPLOADS_DIR, str(movie.video_id) + '.mp4')
        if os.path.exists(mp4_filepath):
            return jsonify(message="Video and Movie exist. Enable Force overwrite to upload a new Video.", exist=True, return_reason="check_video_movie_found")
    return jsonify(message="Video's not exist. Please upload a video", exist=False, return_reason="check_video_not_found")