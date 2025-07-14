from flask import Blueprint, jsonify, request, abort
from cdn.utils import paginate, calculate_similarity, check_images_existence
from api.utils import token_required, serialize_watch_history
from utils.data_helpers import get_movies, get_movies_with_images
import random
import os
import time

movie_cdn_bp = Blueprint('movie_cdn_bp', __name__, url_prefix='/cdn')

# Endpoint to get all movies with pagination
@movie_cdn_bp.route('/movies', methods=['GET'])
@token_required
def get_movies_endpoint(current_user):
    temp_movies = get_movies()
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    include_watch_history = request.args.get('include_watch_history', False, type=bool)
    
    paginated_movies = paginate(temp_movies, page, per_page)
    
    # Add watch history if requested
    if include_watch_history:
        for movie in paginated_movies:
            watch_history = serialize_watch_history(
                content_id=movie['id'],
                content_type='movie',
                current_user=current_user,
                include_next_episode=False
            )
            if watch_history:
                movie['watch_history'] = watch_history
    
    return jsonify(paginated_movies)

# Endpoint to search for movies by title
@movie_cdn_bp.route('/movies/search', methods=['GET'])
@token_required
def search_movies(current_user):
    temp_movies = get_movies()
    query = request.args.get('q', '', type=str)
    max_results = request.args.get('max_results', 3, type=int)
    include_watch_history = request.args.get('include_watch_history', False, type=bool)
    
    result = [item for item in temp_movies if query.lower() in str(item.get('title', '')).lower()]
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

# Endpoint to get a single movie by ID
@movie_cdn_bp.route('/movies/<int:movie_id>')
@token_required
def get_movie(current_user, movie_id):
    temp_movies = get_movies()
    include_watch_history = request.args.get('include_watch_history', False, type=bool)
    
    movie = next((item for item in temp_movies if item["id"] == movie_id), None)
    if not movie:
        return jsonify(message="The selected Movie not found!"), 404
    
    # Add watch history if requested
    if include_watch_history:
        watch_history = serialize_watch_history(
            content_id=movie_id,
            content_type='movie',
            current_user=current_user,
            include_next_episode=False
        )
        if watch_history:
            movie['watch_history'] = watch_history
    
    return jsonify(movie)

# Endpoint to get a random movie with pagination
@movie_cdn_bp.route('/movies/random', methods=['GET'])
@token_required
def get__random_movie(current_user):
    temp_movies = get_movies()
    temp_movies_with_images = get_movies_with_images()
    func_start_time = time.time()
    
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    min_rating = request.args.get('min_rating', 0, type=float)
    max_rating = request.args.get('max_rating', 10, type=float)
    with_images = request.args.get('with_images', False, type=bool)
    include_watch_history = request.args.get('include_watch_history', False, type=bool)

    movies_to_use = temp_movies
    if with_images:
        movies_to_use = temp_movies_with_images

    shuffled_movies = movies_to_use.copy()
    random.shuffle(shuffled_movies)

    def apply_filters(items):
        results = []
        for item in items:
            vote_average = item.get('vote_average', 0)
            if isinstance(vote_average, str):
                try:
                    vote_average = float(vote_average)
                except ValueError:
                    continue
            if min_rating <= vote_average <= max_rating:
                results.append(item)
        return results

    movie_results = apply_filters(shuffled_movies)
    with_images_start_time = time.time()
    paginated_movies = paginate(movie_results, page, per_page)
    
    # Add watch history if requested
    if include_watch_history:
        for movie in paginated_movies:
            watch_history = serialize_watch_history(
                content_id=movie['id'],
                content_type='movie',
                current_user=current_user,
                include_next_episode=False
            )
            if watch_history:
                movie['watch_history'] = watch_history

    end_time = time.time()
    
    return jsonify(paginated_movies)

@movie_cdn_bp.route('/movies/<int:movie_id>/similar', methods=['GET'])
@token_required
def get_similar_movies(current_user, movie_id):
    temp_movies = get_movies()
    temp_movies_with_images = get_movies_with_images()

    with_images = request.args.get('with_images', False, type=bool)
    is_random = request.args.get('random', False, type=bool)
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 12, type=int)
    include_watch_history = request.args.get('include_watch_history', False, type=bool)

    movies_to_use = temp_movies
    if with_images:
        movies_to_use = temp_movies_with_images

    movie = next((item for item in movies_to_use if item["id"] == movie_id), None)
    if not movie:
        return jsonify(message="The selected Movie not found!"), 404
    
    similar_movies = []
    for item in movies_to_use:
        if item['id'] != movie_id:
            similarity = calculate_similarity(movie, item)
            if similarity > 0:
                similar_movies.append((item, similarity))
    
    similar_movies = sorted(similar_movies, key=lambda x: x[1], reverse=True)

    if is_random:
        random.shuffle(similar_movies)

    paginated_movies = paginate(similar_movies, page, per_page)
    result = [item for item, _ in paginated_movies]
    
    # Add watch history if requested
    if include_watch_history:
        for movie in result:
            watch_history = serialize_watch_history(
                content_id=movie['id'],
                content_type='movie',
                current_user=current_user,
                include_next_episode=False
            )
            if watch_history:
                movie['watch_history'] = watch_history
    
    return jsonify(result)
