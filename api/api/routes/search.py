from flask import Blueprint, request, jsonify, abort
from models import Movie, TVShow
from api.cache import get_all_movies_cached, get_all_shows_cached
from cdn.utils import filter_valid_genres, check_images_existence
from utils.fuzzy import fuzzy_filter_and_rank
import random

search_bp = Blueprint('search_bp', __name__, url_prefix='/api')

@search_bp.route('/autocomplete', methods=['GET'])
def autocomplete():
    query = request.args.get('q', '', type=str)
    max_results = request.args.get('max_results', 10, type=int)

    movies = get_all_movies_cached()
    tv_series = get_all_shows_cached()

    all_items = [
        {"id": item.get('id'), "title": item.get('title')} for item in movies
    ] + [
        {"id": item.get('show_id'), "name": item.get('title')} for item in tv_series
    ]

    suggestions = fuzzy_filter_and_rank(
        query,
        all_items,
        lambda item: item.get('title') or item.get('name') or '',
    )[:max_results]

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
    year = request.args.get('year', None, type=int)
    fuzzy = request.args.get('fuzzy', False, type=bool)
    fuzzy_threshold = request.args.get('fuzzy_threshold', 0.25, type=float)

    movies = get_all_movies_cached()
    tv_series = get_all_shows_cached()

    def _extract_year(item, item_type):
        date_field = 'release_date' if item_type == 'movie' else 'first_air_date'
        date_str = item.get(date_field, '') or ''
        try:
            return int(str(date_str)[:4])
        except (ValueError, TypeError):
            return None

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
            if year is not None and _extract_year(item, item_type) != year:
                continue
            if not (min_rating <= vote_average <= max_rating):
                continue
            if genre and not filter_valid_genres(item, genre):
                continue
            item['type'] = item_type
            results.append(item)
        return results

    if media_type == 'movies':
        final_results = apply_filters(movies, 'movie')
    elif media_type == 'tv':
        final_results = apply_filters(tv_series, 'tv_series')
    else:
        final_results = apply_filters(movies, 'movie') + apply_filters(tv_series, 'tv_series')

    # Text matching — fuzzy or exact substring
    if query:
        if fuzzy:
            final_results = fuzzy_filter_and_rank(
                query,
                final_results,
                text_getter=lambda item: item.get('title') or '',
                threshold=fuzzy_threshold,
            )
        else:
            q_lower = query.lower()
            final_results = [
                item for item in final_results
                if q_lower in (item.get('title') or '').lower()
            ]

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