from flask import Blueprint, request, jsonify
from api.utils import token_required, serialize_watch_history
from api.cache import get_all_movies, get_all_shows
from cdn.utils import paginate, check_images_existence
from models import Movie, TVShow, db
from sqlalchemy import func, text
from datetime import datetime, timedelta
import random

discovery_bp = Blueprint('discovery_bp', __name__, url_prefix='/api')

@discovery_bp.route('/discovery/random', methods=['GET'])
@token_required
def get_discovery_random(current_user):
    """
    Discovery endpoint that returns random content from both movies and TV shows
    This is specifically designed for banner and discovery purposes
    Queries from database instead of JSON files
    """
    # Get query parameters
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 1, type=int)  # Default to 1 for banner
    min_rating = request.args.get('min_rating', 0, type=float)
    max_rating = request.args.get('max_rating', 10, type=float)
    with_images = request.args.get('with_images', False, type=bool)
    include_watch_history = request.args.get('include_watch_history', False, type=bool)
    content_type = request.args.get('content_type', '')  # 'movie', 'tv', or '' for both
    
    combined_content = []
    
    try:
        # Query movies from cache
        if content_type != 'tv':
            for movie in get_all_movies():
                if min_rating > 0 and (movie.vote_average or 0) < min_rating:
                    continue
                if max_rating < 10 and (movie.vote_average or 0) > max_rating:
                    continue
                if with_images and (not movie.poster_path or not movie.backdrop_path):
                    continue
                movie_data = movie.serialize
                movie_data['id'] = movie.movie_id  # Ensure consistent id field
                combined_content.append(movie_data)
        
        # Query TV shows from cache
        if content_type != 'movie':
            for tv_show in get_all_shows():
                if min_rating > 0 and (tv_show.vote_average or 0) < min_rating:
                    continue
                if max_rating < 10 and (tv_show.vote_average or 0) > max_rating:
                    continue
                if with_images and (not tv_show.poster_path or not tv_show.backdrop_path):
                    continue
                tv_data = tv_show.serialize
                tv_data['id'] = tv_show.show_id  # Ensure consistent id field
                combined_content.append(tv_data)
        
        # Shuffle the combined content for randomness
        random.shuffle(combined_content)
        
        # Paginate results
        start = (page - 1) * per_page
        end = start + per_page
        paginated_content = combined_content[start:end]
        
        # Add watch history if requested
        if include_watch_history:
            for item in paginated_content:
                item_content_type = item.get('media_type', 'movie')
                watch_history = serialize_watch_history(
                    content_id=item['id'],
                    content_type=item_content_type,
                    current_user=current_user,
                    include_next_episode=(item_content_type == 'tv')
                )
                if watch_history:
                    item['watch_history'] = watch_history
        
        return jsonify(paginated_content)
        
    except Exception as e:
        return jsonify({'error': f'Database query failed: {str(e)}'}), 500

@discovery_bp.route('/discovery/trending', methods=['GET'])
@token_required
def get_discovery_trending(current_user):
    """
    Get trending content from both movies and TV shows based on popularity
    Queries from database instead of JSON files
    """
    # Get query parameters
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    with_images = request.args.get('with_images', False, type=bool)
    include_watch_history = request.args.get('include_watch_history', False, type=bool)
    content_type = request.args.get('content_type', '')  # 'movie', 'tv', or '' for both
    
    combined_content = []
    
    try:
        # Query movies from cache
        if content_type != 'tv':
            movies = [m for m in get_all_movies() if m.vote_average is not None]
            if with_images:
                movies = [m for m in movies if m.poster_path and m.backdrop_path]
            movies = sorted(movies, key=lambda m: m.vote_average or 0, reverse=True)
            for movie in movies:
                movie_data = movie.serialize
                movie_data['id'] = movie.movie_id
                # Calculate popularity score
                vote_average = movie_data.get('vote_average', 0) or 0
                movie_data['popularity_score'] = vote_average * 10  # Simple popularity calculation
                combined_content.append(movie_data)
        
        # Query TV shows from cache
        if content_type != 'movie':
            tv_shows = [s for s in get_all_shows() if s.vote_average is not None]
            if with_images:
                tv_shows = [s for s in tv_shows if s.poster_path and s.backdrop_path]
            tv_shows = sorted(tv_shows, key=lambda s: s.vote_average or 0, reverse=True)
            for tv_show in tv_shows:
                tv_data = tv_show.serialize
                tv_data['id'] = tv_show.show_id
                # Calculate popularity score
                vote_average = tv_data.get('vote_average', 0) or 0
                tv_data['popularity_score'] = vote_average * 10  # Simple popularity calculation
                combined_content.append(tv_data)
        
        # Sort by popularity score
        combined_content.sort(key=lambda x: x.get('popularity_score', 0), reverse=True)
        
        # Paginate results
        start = (page - 1) * per_page
        end = start + per_page
        paginated_content = combined_content[start:end]
        
        # Add watch history if requested
        if include_watch_history:
            for item in paginated_content:
                item_content_type = item.get('media_type', 'movie')
                watch_history = serialize_watch_history(
                    content_id=item['id'],
                    content_type=item_content_type,
                    current_user=current_user,
                    include_next_episode=(item_content_type == 'tv')
                )
                if watch_history:
                    item['watch_history'] = watch_history
        
        return jsonify(paginated_content)
        
    except Exception as e:
        return jsonify({'error': f'Database query failed: {str(e)}'}), 500

@discovery_bp.route('/discovery/featured', methods=['GET'])
@token_required
def get_discovery_featured(current_user):
    """
    Get featured content from both movies and TV shows
    Based on high ratings and popularity from database
    """
    # Get query parameters
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    with_images = request.args.get('with_images', False, type=bool)
    include_watch_history = request.args.get('include_watch_history', False, type=bool)
    content_type = request.args.get('content_type', '')  # 'movie', 'tv', or '' for both
    min_rating = request.args.get('min_rating', 7.0, type=float)  # Higher default for featured
    
    combined_content = []
    
    try:
        # Query movies from cache
        if content_type != 'tv':
            movies = [m for m in get_all_movies() if (m.vote_average or 0) >= min_rating]
            if with_images:
                movies = [m for m in movies if m.poster_path and m.backdrop_path]
            movies = sorted(movies, key=lambda m: m.vote_average or 0, reverse=True)
            for movie in movies:
                movie_data = movie.serialize
                movie_data['id'] = movie.movie_id
                combined_content.append(movie_data)
        
        # Query TV shows from cache
        if content_type != 'movie':
            tv_shows = [s for s in get_all_shows() if (s.vote_average or 0) >= min_rating]
            if with_images:
                tv_shows = [s for s in tv_shows if s.poster_path and s.backdrop_path]
            tv_shows = sorted(tv_shows, key=lambda s: s.vote_average or 0, reverse=True)
            for tv_show in tv_shows:
                tv_data = tv_show.serialize
                tv_data['id'] = tv_show.show_id
                combined_content.append(tv_data)
        
        # Sort by vote average descending
        combined_content.sort(key=lambda x: x.get('vote_average', 0) or 0, reverse=True)
        
        # Add some randomness to avoid always showing the same content
        if len(combined_content) > per_page * 2:
            # Take top items but add some randomness
            top_items = combined_content[:per_page * 2]
            random.shuffle(top_items)
            combined_content = top_items
        
        # Paginate results
        start = (page - 1) * per_page
        end = start + per_page
        paginated_content = combined_content[start:end]
        
        # Add watch history if requested
        if include_watch_history:
            for item in paginated_content:
                item_content_type = item.get('media_type', 'movie')
                watch_history = serialize_watch_history(
                    content_id=item['id'],
                    content_type=item_content_type,
                    current_user=current_user,
                    include_next_episode=(item_content_type == 'tv')
                )
                if watch_history:
                    item['watch_history'] = watch_history
        
        return jsonify(paginated_content)
        
    except Exception as e:
        return jsonify({'error': f'Database query failed: {str(e)}'}), 500


@discovery_bp.route('/discovery/new-titles', methods=['GET'])
@token_required
def get_discovery_new_titles(current_user):
    """
    Get the most recently added content (movies and TV shows).
    Filters by the added_at timestamp so only titles added within
    the last N days are returned (default 5 days).
    """
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    days = request.args.get('days', 5, type=int)  # Only titles added in the last N days
    with_images = request.args.get('with_images', False, type=bool)
    include_watch_history = request.args.get('include_watch_history', False, type=bool)
    content_type = request.args.get('content_type', '')  # 'movie', 'tv', or '' for both

    combined_content = []
    cutoff = datetime.utcnow() - timedelta(days=days)

    try:
        # --- Movies ---
        if content_type != 'tv':
            movies = [
                m for m in get_all_movies()
                if m.added_at is not None and m.added_at >= cutoff
            ]
            if with_images:
                movies = [m for m in movies if m.poster_path and m.backdrop_path]
            movies = sorted(movies, key=lambda m: m.added_at, reverse=True)
            for movie in movies:
                movie_data = movie.serialize
                movie_data['id'] = movie.movie_id
                combined_content.append(movie_data)

        # --- TV Shows ---
        if content_type != 'movie':
            tv_shows = [
                s for s in get_all_shows()
                if s.added_at is not None and s.added_at >= cutoff
            ]
            if with_images:
                tv_shows = [s for s in tv_shows if s.poster_path and s.backdrop_path]
            tv_shows = sorted(tv_shows, key=lambda s: s.added_at, reverse=True)
            for tv_show in tv_shows:
                tv_data = tv_show.serialize
                tv_data['id'] = tv_show.show_id
                combined_content.append(tv_data)

        # Sort all content together by added_at descending
        combined_content.sort(
            key=lambda x: x.get('added_at') or '',
            reverse=True
        )

        # Paginate
        start = (page - 1) * per_page
        end = start + per_page
        paginated_content = combined_content[start:end]

        # Add watch history if requested
        if include_watch_history:
            for item in paginated_content:
                item_content_type = item.get('media_type', 'movie')
                watch_history = serialize_watch_history(
                    content_id=item['id'],
                    content_type=item_content_type,
                    current_user=current_user,
                    include_next_episode=(item_content_type == 'tv')
                )
                if watch_history:
                    item['watch_history'] = watch_history

        return jsonify(paginated_content)

    except Exception as e:
        return jsonify({'error': f'Database query failed: {str(e)}'}), 500
