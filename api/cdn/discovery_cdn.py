from flask import Blueprint, request, jsonify
from cdn.utils import paginate, check_images_existence
import random

discovery_cdn_bp = Blueprint('discovery_cdn_bp', __name__, url_prefix='/cdn')

@discovery_cdn_bp.route('/discovery/random', methods=['GET'])
def get_cdn_discovery_random():
    """
    CDN Discovery endpoint that returns random content from both movies and TV shows
    This is a fallback when the main API is not available
    """
    from app import movies, tv_series, movies_with_images, tv_series_with_images
    
    # Get query parameters
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 1, type=int)  # Default to 1 for banner
    min_rating = request.args.get('min_rating', 0, type=float)
    max_rating = request.args.get('max_rating', 10, type=float)
    with_images = request.args.get('with_images', False, type=bool)
    content_type = request.args.get('content_type', '')  # 'movie', 'tv', or '' for both
    
    # Choose data source based on image requirements
    if with_images:
        temp_movies = movies_with_images
        temp_tv = tv_series_with_images
    else:
        temp_movies = movies
        temp_tv = tv_series
    
    # Apply content type filter
    combined_content = []
    if content_type == 'movie':
        # Add media_type to all movies
        combined_content = [dict(item, media_type='movie') for item in temp_movies]
    elif content_type == 'tv':
        # Add media_type to all TV shows
        combined_content = [dict(item, media_type='tv') for item in temp_tv]
    else:
        # Combine both types
        movies_with_type = [dict(item, media_type='movie') for item in temp_movies]
        tv_with_type = [dict(item, media_type='tv') for item in temp_tv]
        combined_content = movies_with_type + tv_with_type
    
    # Shuffle the combined content
    shuffled_content = combined_content.copy()
    random.shuffle(shuffled_content)
    
    def apply_filters(items):
        """Apply rating filters to content items"""
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
    
    # Apply filters
    filtered_content = apply_filters(shuffled_content)
    
    # Paginate results
    paginated_content = paginate(filtered_content, page, per_page)
    
    return jsonify(paginated_content)

@discovery_cdn_bp.route('/discovery/trending', methods=['GET'])
def get_cdn_discovery_trending():
    """
    Get trending content from both movies and TV shows based on popularity
    CDN version without authentication
    """
    from app import movies, tv_series, movies_with_images, tv_series_with_images
    
    # Get query parameters
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    with_images = request.args.get('with_images', False, type=bool)
    content_type = request.args.get('content_type', '')  # 'movie', 'tv', or '' for both
    
    # Choose data source based on image requirements
    if with_images:
        temp_movies = movies_with_images
        temp_tv = tv_series_with_images
    else:
        temp_movies = movies
        temp_tv = tv_series
    
    # Apply content type filter and add media_type
    combined_content = []
    if content_type == 'movie':
        combined_content = [dict(item, media_type='movie') for item in temp_movies]
    elif content_type == 'tv':
        combined_content = [dict(item, media_type='tv') for item in temp_tv]
    else:
        # Combine both types
        movies_with_type = [dict(item, media_type='movie') for item in temp_movies]
        tv_with_type = [dict(item, media_type='tv') for item in temp_tv]
        combined_content = movies_with_type + tv_with_type
    
    # Sort by popularity (assuming higher vote_average * vote_count indicates trending)
    def get_popularity_score(item):
        vote_average = item.get('vote_average', 0)
        vote_count = item.get('vote_count', 0)
        popularity = item.get('popularity', 0)
        
        # Use TMDB's popularity score if available, otherwise calculate
        if popularity > 0:
            return popularity
        else:
            return vote_average * vote_count if vote_average and vote_count else 0
    
    sorted_content = sorted(combined_content, key=get_popularity_score, reverse=True)
    
    # Paginate results
    paginated_content = paginate(sorted_content, page, per_page)
    
    return jsonify(paginated_content)

@discovery_cdn_bp.route('/discovery/featured', methods=['GET'])
def get_cdn_discovery_featured():
    """
    Get featured content from both movies and TV shows
    Based on high ratings and popularity
    CDN version without authentication
    """
    from app import movies, tv_series, movies_with_images, tv_series_with_images
    
    # Get query parameters
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    with_images = request.args.get('with_images', False, type=bool)
    content_type = request.args.get('content_type', '')  # 'movie', 'tv', or '' for both
    min_rating = request.args.get('min_rating', 7.0, type=float)  # Higher default for featured
    
    # Choose data source based on image requirements
    if with_images:
        temp_movies = movies_with_images
        temp_tv = tv_series_with_images
    else:
        temp_movies = movies
        temp_tv = tv_series
    
    # Apply content type filter and add media_type
    combined_content = []
    if content_type == 'movie':
        combined_content = [dict(item, media_type='movie') for item in temp_movies]
    elif content_type == 'tv':
        combined_content = [dict(item, media_type='tv') for item in temp_tv]
    else:
        # Combine both types
        movies_with_type = [dict(item, media_type='movie') for item in temp_movies]
        tv_with_type = [dict(item, media_type='tv') for item in temp_tv]
        combined_content = movies_with_type + tv_with_type
    
    # Filter for high-quality content
    def is_featured_worthy(item):
        vote_average = item.get('vote_average', 0)
        vote_count = item.get('vote_count', 0)
        
        if isinstance(vote_average, str):
            try:
                vote_average = float(vote_average)
            except ValueError:
                return False
        
        # Must have good rating and sufficient votes
        return vote_average >= min_rating and vote_count >= 100
    
    featured_content = [item for item in combined_content if is_featured_worthy(item)]
    
    # Sort by vote average descending
    featured_content.sort(key=lambda x: x.get('vote_average', 0), reverse=True)
    
    # Add some randomness to avoid always showing the same content
    if len(featured_content) > per_page * 2:
        # Take top items but add some randomness
        top_items = featured_content[:per_page * 2]
        random.shuffle(top_items)
        featured_content = top_items
    
    # Paginate results
    paginated_content = paginate(featured_content, page, per_page)
    
    return jsonify(paginated_content)
