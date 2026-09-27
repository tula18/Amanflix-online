from flask import Blueprint, jsonify, request
from cdn.utils import filter_valid_genres, check_images_existence, paginate
from api.utils import token_required, attach_watch_history
from utils.data_helpers import get_movies, get_tv_shows, get_movies_with_images, get_tv_shows_with_images, cached_for_catalog
from utils.fuzzy import fuzzy_filter_and_rank
import random

search_cdn_bp = Blueprint('search_cdn_bp', __name__, url_prefix='/cdn')

@search_cdn_bp.route('/autocomplete', methods=['GET'])
def autocomplete():
    temp_movies = get_movies_with_images()
    temp_tv_series = get_tv_shows_with_images()
    query = request.args.get('q', '', type=str)
    max_results = request.args.get('max_results', 10, type=int)
    sources = (temp_movies, temp_tv_series)

    all_items = cached_for_catalog(('autocomplete_items',), sources, lambda: [
        {"id": item['id'], "title": item['title']} for item in temp_movies
    ] + [
        {"id": item['id'], "name": item['name']} for item in temp_tv_series if isinstance(item.get('name'), str)
    ])

    # Many users type the same first letters: rank each query once per catalog version
    suggestions = cached_for_catalog(('autocomplete', query, max_results), sources, lambda: fuzzy_filter_and_rank(
        query,
        all_items,
        lambda item: item.get('title') or item.get('name') or '',
    )[:max_results])

    return jsonify(suggestions)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_year(item, item_type):
    """Return the release year as an int, or None if unavailable."""
    date_field = 'release_date' if item_type == 'movie' else 'first_air_date'
    date_str = item.get(date_field, '') or ''
    try:
        return int(str(date_str)[:4])
    except (ValueError, TypeError):
        return None


# Common search functionality extracted to a helper function
def _perform_search(query, genre, min_rating, max_rating, media_type, is_random,
                    with_images, page, per_page, year=None, fuzzy=False,
                    fuzzy_threshold=0.25):
    temp_movies = get_movies()
    temp_tv_series = get_tv_shows()

    temp_movies_search = temp_movies
    temp_tv_series_search = temp_tv_series

    if with_images:
        temp_movies_search = get_movies_with_images()
        temp_tv_series_search = get_tv_shows_with_images()

    # Filtering the whole catalog is the expensive part and depends only on these parameters, so
    # it's done once per catalog version. Catalog items are shared by every request: the result
    # type is tracked separately and only added to copies of the page that is returned.
    filtered, item_types = cached_for_catalog(
        ('search_filter', genre, min_rating, max_rating, media_type, year, with_images),
        (temp_movies_search, temp_tv_series_search),
        lambda: _filter_catalog(temp_movies_search, temp_tv_series_search, genre, min_rating,
                                max_rating, media_type, year))
    final_results = filtered

    # Text matching — fuzzy or exact substring (also the same for everyone with these parameters)
    if query:
        def match():
            if fuzzy:
                return fuzzy_filter_and_rank(
                    query,
                    filtered,
                    text_getter=lambda item: item.get('title') or item.get('name') or '',
                    threshold=fuzzy_threshold,
                )
            q_lower = query.lower()
            return [
                item for item in filtered
                if q_lower in (item.get('title') or item.get('name') or '').lower()
            ]

        final_results = cached_for_catalog(
            ('search_match', genre, min_rating, max_rating, media_type, year, with_images, query,
             bool(fuzzy), fuzzy_threshold),
            (temp_movies_search, temp_tv_series_search), match)

    # A copy: the cached lists are shared and shuffle works in place
    final_results = list(final_results)

    if is_random:
        random.shuffle(final_results)

    return [{**item, 'type': item_types[id(item)]} for item in paginate(final_results, page, per_page)]


def _filter_catalog(movies, tv_series, genre, min_rating, max_rating, media_type, year):
    """The catalog items matching the filters, and a map id(item) -> result type."""
    item_types = {}

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
            # Year facet
            if year is not None:
                item_year = _extract_year(item, item_type)
                if item_year != year:
                    continue
            # Rating facet
            if not (min_rating <= vote_average <= max_rating):
                continue
            # Genre facet
            if genre and not filter_valid_genres(item, genre):
                continue
            item_types[id(item)] = item_type
            results.append(item)
        return results

    if media_type == 'movies':
        results = apply_filters(movies, 'movie')
    elif media_type == 'tv':
        results = apply_filters(tv_series, 'tv_series')
    else:
        results = apply_filters(movies, 'movie') + apply_filters(tv_series, 'tv_series')
    return results, item_types

# _perform_search_with_images is now handled by passing with_images=True to _perform_search
# Kept as a thin alias for backwards compatibility.
def _perform_search_with_images(query, genre, min_rating, max_rating, media_type, is_random,
                                with_images, page, per_page, year=None, fuzzy=False,
                                fuzzy_threshold=0.25):
    return _perform_search(
        query=query, genre=genre, min_rating=min_rating, max_rating=max_rating,
        media_type=media_type, is_random=is_random, with_images=with_images,
        page=page, per_page=per_page, year=year, fuzzy=fuzzy,
        fuzzy_threshold=fuzzy_threshold,
    )

# ---------------------------------------------------------------------------
# Facets endpoint — returns distinct genres and year range for the catalogue
# ---------------------------------------------------------------------------

@search_cdn_bp.route('/facets', methods=['GET'])
def get_facets():
    """Return available filter facets: distinct genres and min/max release year."""
    movies = get_movies()
    tv_series = get_tv_shows()
    return jsonify(cached_for_catalog(('facets',), (movies, tv_series), lambda: _compute_facets(movies, tv_series)))


def _compute_facets(movies, tv_series):
    genres: set = set()
    years: list = []

    for item in movies:
        _collect_genres(item, genres)
        y = _extract_year(item, 'movie')
        if y:
            years.append(y)

    for item in tv_series:
        _collect_genres(item, genres)
        y = _extract_year(item, 'tv_series')
        if y:
            years.append(y)

    return {
        'genres': sorted(genres),
        'year_min': min(years) if years else None,
        'year_max': max(years) if years else None,
    }


def _collect_genres(item, genre_set: set):
    """Extract genre names from an item and add them to genre_set."""
    raw = item.get('genres', '')
    if isinstance(raw, list):
        for g in raw:
            if isinstance(g, dict) and g.get('name'):
                genre_set.add(g['name'].strip())
    elif isinstance(raw, str) and raw:
        for g in raw.split(','):
            g = g.strip()
            if g:
                genre_set.add(g)


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
    year = request.args.get('year', None, type=int)
    fuzzy = request.args.get('fuzzy', False, type=bool)
    fuzzy_threshold = request.args.get('fuzzy_threshold', 0.25, type=float)

    limited_results = _perform_search(
        query=query,
        genre=genre,
        min_rating=min_rating,
        max_rating=max_rating,
        media_type=media_type,
        is_random=is_random,
        with_images=with_images,
        page=page,
        per_page=per_page,
        year=year,
        fuzzy=fuzzy,
        fuzzy_threshold=fuzzy_threshold,
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
    year = request.args.get('year', None, type=int)
    fuzzy = request.args.get('fuzzy', False, type=bool)
    fuzzy_threshold = request.args.get('fuzzy_threshold', 0.25, type=float)

    limited_results = _perform_search(
        query=query,
        genre=genre,
        min_rating=min_rating,
        max_rating=max_rating,
        media_type=media_type,
        is_random=is_random,
        with_images=with_images,
        page=page,
        per_page=per_page,
        year=year,
        fuzzy=fuzzy,
        fuzzy_threshold=fuzzy_threshold,
    )
    
    # Add watch history if requested (only available in authenticated search)
    if include_watch_history:
        limited_results = attach_watch_history(limited_results, current_user, lambda i: 'movie' if i.get('type') == 'movie' else 'tv', include_next_episode=True)
    
    return jsonify(limited_results)
