from flask import Blueprint, jsonify, request
from cdn.utils import filter_valid_genres, check_images_existence, paginate
from api.utils import token_required, serialize_watch_history
import random

search_cdn_bp = Blueprint('search_cdn_bp', __name__, url_prefix='/cdn')

@search_cdn_bp.route('/autocomplete', methods=['GET'])
def autocomplete():
    from app import tv_series, movies
    query = request.args.get('q', '', type=str).lower()
    max_results = request.args.get('max_results', 10, type=int)

    movie_suggestions = [
        {"id": item['id'], "title": item['title']} for item in movies if query in str(item.get('title', '')).lower()
    ]
    tv_suggestions = [
        {"id": item['id'], "name": item['name']} for item in tv_series if isinstance(item.get('name'), str) and query in item.get('name').lower()
    ]

    suggestions = movie_suggestions + tv_suggestions
    suggestions = suggestions[:max_results]

    return jsonify(suggestions)

# Common search functionality extracted to a helper function
def _perform_search(query, genre, min_rating, max_rating, media_type, is_random, with_images, page, per_page):
    from app import tv_series, movies

    def apply_filters(items, item_type):
        results = []
        for item in items:
            title_or_name = item.get('title' if item_type == 'movie' else 'name', '')
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

    temp_movies = movies
    temp_tv_series = tv_series

    if with_images:
        from app import movies_with_images, tv_series_with_images
        temp_movies = movies_with_images
        temp_tv_series = tv_series_with_images

    if media_type == 'movies':
        movie_results = apply_filters(temp_movies, 'movie')
        final_results = movie_results
    elif media_type == 'tv':
        tv_results = apply_filters(temp_tv_series, 'tv_series')
        final_results = tv_results
    else:
        movie_results = apply_filters(temp_movies, 'movie')
        tv_results = apply_filters(temp_tv_series, 'tv_series')
        final_results = movie_results + tv_results

    if is_random:
        random.shuffle(final_results)

    return paginate(final_results, page, per_page)

def _perform_search_with_images(query, genre, min_rating, max_rating, media_type, is_random, with_images, page, per_page):
    from app import tv_series, movies

    def apply_filters(items, item_type):
        results = []
        for item in items:
            title_or_name = item.get('title' if item_type == 'movie' else 'name', '')
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

    # Check if with_images is True
    if with_images:
        from app import movies_with_images, tv_series_with_images

        # Get IDs from movies_with_images
        temp_movies_with_images_ids = [item['id'] for item in movies_with_images if query.lower() in item.get('title', '').lower()]

        # Filter movies based on IDs
        temp_movies = [item for item in movies if item['id'] in temp_movies_with_images_ids]

        # Do the same for TV series
        temp_tv_series_with_images_ids = [item['id'] for item in tv_series_with_images if query.lower() in item.get('name', '').lower()]
        temp_tv_series = [item for item in tv_series if item['id'] in temp_tv_series_with_images_ids]

    else:
        # If with_images is False, use the original lists
        temp_movies = movies
        temp_tv_series = tv_series

    if media_type == 'movies':
        movie_results = apply_filters(temp_movies, 'movie')
        final_results = movie_results
    elif media_type == 'tv':
        tv_results = apply_filters(temp_tv_series, 'tv_series')
        final_results = tv_results
    else:
        movie_results = apply_filters(temp_movies, 'movie')
        tv_results = apply_filters(temp_tv_series, 'tv_series')
        final_results = movie_results + tv_results

    if is_random:
        random.shuffle(final_results)

    return paginate(final_results, page, per_page)

# Public search endpoint that doesn't require authentication
@search_cdn_bp.route('/search', methods=['GET'])
def public_search():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    query = request.args.get('q', '', type=str)
    genre = request.args.get('genre', '', type=str)
    min_rating = request.args.get('min_rating', 0, type=float)
    max_rating = request.args.get('max_rating', 10, type=float)
    media_type = request.args.get('media_type', 'all', type=str)
    is_random = request.args.get('random', False, type=bool)
    with_images = request.args.get('with_images', False, type=bool)
    
    limited_results = _perform_search(
        query=query,
        genre=genre,
        min_rating=min_rating,
        max_rating=max_rating,
        media_type=media_type,
        is_random=is_random,
        with_images=with_images,
        page=page,
        per_page=per_page
    )
    
    return jsonify(limited_results)

# Authenticated search endpoint that can include watch history
@search_cdn_bp.route('/auth-search', methods=['GET'])
@token_required
def authenticated_search(current_user):
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    query = request.args.get('q', '', type=str)
    genre = request.args.get('genre', '', type=str)
    min_rating = request.args.get('min_rating', 0, type=float)
    max_rating = request.args.get('max_rating', 10, type=float)
    media_type = request.args.get('media_type', 'all', type=str)
    is_random = request.args.get('random', False, type=bool)
    with_images = request.args.get('with_images', False, type=bool)
    include_watch_history = request.args.get('include_watch_history', True, type=bool)
    
    limited_results = _perform_search(
        query=query,
        genre=genre,
        min_rating=min_rating,
        max_rating=max_rating,
        media_type=media_type,
        is_random=is_random,
        with_images=with_images,
        page=page,
        per_page=per_page
    )
    
    # Add watch history if requested (only available in authenticated search)
    if include_watch_history:
        for item in limited_results:
            content_type = 'movie' if item.get('type') == 'movie' else 'tv'
            watch_history = serialize_watch_history(
                content_id=item['id'],
                content_type=content_type,
                current_user=current_user,
                include_next_episode=True
            )
            if watch_history:
                item['watch_history'] = watch_history
    
    return jsonify(limited_results)
