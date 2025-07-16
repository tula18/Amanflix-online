from flask import Blueprint, request, jsonify, abort
from models import Movie, TVShow
from cdn.utils import filter_valid_genres, check_images_existence
import random

search_bp = Blueprint('search_bp', __name__, url_prefix='/api')

@search_bp.route('/autocomplete', methods=['GET'])
def autocomplete():
    query = request.args.get('q', '', type=str).lower()
    max_results = request.args.get('max_results', 10, type=int)

    movies = Movie.query.all()
    tv_series = TVShow.query.all()

    movie_suggestions = [
        {"id": item.id, "title": item.title} for item in movies if query in str(item.title.lower())
    ]
    tv_suggestions = [
        {"id": item.id, "name": item.title} for item in tv_series if isinstance(item.title, str) and query in item.title.lower()
    ]

    suggestions = list(movie_suggestions + tv_suggestions)
    suggestions = suggestions[:max_results]

    return jsonify(suggestions)

# Advanced search endpoint for movies and tv series combined
@search_bp.route('/search', methods=['GET'])
def advanced_search():
    query = request.args.get('q', '', type=str)
    genre = request.args.get('genre', '', type=str)
    min_rating = request.args.get('min_rating', 0, type=float)
    max_rating = request.args.get('max_rating', 10, type=float)
    max_results = request.args.get('max_results', 20, type=int)
    media_type = request.args.get('media_type', 'all', type=str)
    is_random = request.args.get('random', False, type=bool)
    with_images = request.args.get('with_images', False, type=bool)

    movies = Movie.query.all()
    tv_series = TVShow.query.all()


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
            if query.lower() in str(title_or_name).lower() and \
                    (filter_valid_genres(item, genre) if genre else True) and \
                    (min_rating <= vote_average <= max_rating):
                item['type'] = item_type
                results.append(item)
        return results

    if media_type == 'movies':
        movie_results = apply_filters(movies, 'movie')
        final_results = movie_results
    elif media_type == 'tv':
        tv_results = apply_filters(tv_series, 'tv_series')
        final_results = tv_results
    else:
        movie_results = apply_filters(movies, 'movie')
        tv_results = apply_filters(tv_series, 'tv_series')
        final_results = movie_results + tv_results

    if is_random:
        random.shuffle(final_results)

    if with_images:
        limited_results = []
        for item in final_results:
            exist = check_images_existence(item)
            if exist:
                limited_results.append(item)
            if len(limited_results) >= max_results:
                break
    else:
        limited_results = final_results[:max_results]


    return jsonify(limited_results)