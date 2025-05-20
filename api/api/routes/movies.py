from flask import Blueprint, request, jsonify, abort
from models import Movie
from api.utils import admin_token_required, sort
import os
import random

movies_bp = Blueprint('movies_bp', __name__, url_prefix='/api')

# Endpoint to get all movies with pagination
@movies_bp.route('/movies', methods=['GET'])
def get_movies():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    order = request.args.get('order', 'asc', type=str)  # Default order is ascending
    sort_by_field = request.args.get('sort_by', None, type=str)  # Default sort_by is None

    # Assuming sort_by_field is a valid column name in the Movie model
    sort_by = getattr(Movie, sort_by_field, None) if sort_by_field else None

    query = Movie.query
    
    paginated_movies = query.paginate(page=page, per_page=per_page, error_out=False)
    return jsonify([movie.serialize for movie in paginated_movies.items]), 200

@movies_bp.route('/movies/random', methods=['GET'])
def get__random_movie():
    genre = request.args.get('genre', '', type=str)
    min_rating = request.args.get('min_rating', 0, type=float)
    max_rating = request.args.get('max_rating', 10, type=float)
    per_page = request.args.get('per_page', 20, type=int)

    movies = Movie.query.all()

    def apply_filters(items, item_type):
        results = []
        for title in items:
            item = title.serialize
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
    return jsonify(limited_results)

# Endpoint to search for movies by title
@movies_bp.route('/movies/search', methods=['GET'])
def search_movies():
    query = request.args.get('q', '', type=str)
    max_results = request.args.get('max_results', 3, type=int)
    movies = Movie.query.filter(Movie.title.ilike(f'%{query}%')).all()
    result = [movie.serialize for movie in movies]
    limited_result = result[:max_results]
    return jsonify(limited_result)

@movies_bp.route('/movies/<int:movie_id>', methods=['GET'])
def get_movie(movie_id):
    movie = Movie.query.filter_by(movie_id=movie_id).first()
    if movie is None:
        return jsonify(message="The selected Movie not found!"), 404
    return jsonify(movie.serialize)

@movies_bp.route('/movies/<int:movie_id>/check', methods=['GET'])
# @admin_token_required('moderator')
def check_movie(movie_id):
    movie = Movie.query.filter_by(movie_id=movie_id).first()
    if movie is None:
        mp4_filepath = os.path.join('uploads', str(movie_id) + '.mp4')
        if os.path.exists(mp4_filepath):
            return jsonify(message="Video exist but Movie's not. Enable Force overwrite to upload a new Video.", exist=True, return_reason="check_video_found")
    else:
        mp4_filepath = os.path.join('uploads', str(movie.video_id) + '.mp4')
        if os.path.exists(mp4_filepath):
            return jsonify(message="Video and Movie exist. Enable Force overwrite to upload a new Video.", exist=True, return_reason="check_video_movie_found")
    return jsonify(message="Video's not exist. Please upload a video", exist=False, return_reason="check_video_not_found")