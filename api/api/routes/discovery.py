from flask import Blueprint, request, jsonify
from api.utils import token_required, serialize_watch_history
from cdn.utils import paginate, check_images_existence
from models import Movie, TVShow, db
from sqlalchemy import func, text
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
        # Query movies from database
        if content_type != 'tv':
            movie_query = Movie.query
            
            # Apply rating filters
            if min_rating > 0:
                movie_query = movie_query.filter(Movie.vote_average >= min_rating)
            if max_rating < 10:
                movie_query = movie_query.filter(Movie.vote_average <= max_rating)
            
            # Apply image filters if requested
            if with_images:
                movie_query = movie_query.filter(
                    Movie.poster_path.isnot(None),
                    Movie.backdrop_path.isnot(None)
                )
            
            # Get all matching movies and serialize them
            movies = movie_query.all()
            for movie in movies:
                movie_data = movie.serialize
                movie_data['id'] = movie.movie_id  # Ensure consistent id field
                combined_content.append(movie_data)
        
        # Query TV shows from database
        if content_type != 'movie':
            tv_query = TVShow.query
            
            # Apply rating filters
            if min_rating > 0:
                tv_query = tv_query.filter(TVShow.vote_average >= min_rating)
            if max_rating < 10:
                tv_query = tv_query.filter(TVShow.vote_average <= max_rating)
            
            # Apply image filters if requested
            if with_images:
                tv_query = tv_query.filter(
                    TVShow.poster_path.isnot(None),
                    TVShow.backdrop_path.isnot(None)
                )
            
            # Get all matching TV shows and serialize them
            tv_shows = tv_query.all()
            for tv_show in tv_shows:
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
        # Query movies from database
        if content_type != 'tv':
            movie_query = Movie.query
            
            # Apply image filters if requested
            if with_images:
                movie_query = movie_query.filter(
                    Movie.poster_path.isnot(None),
                    Movie.backdrop_path.isnot(None)
                )
            
            # Order by vote_average descending as a proxy for popularity
            movie_query = movie_query.filter(Movie.vote_average.isnot(None)).order_by(Movie.vote_average.desc())
            
            # Get movies and serialize them
            movies = movie_query.all()
            for movie in movies:
                movie_data = movie.serialize
                movie_data['id'] = movie.movie_id
                # Calculate popularity score
                vote_average = movie_data.get('vote_average', 0) or 0
                movie_data['popularity_score'] = vote_average * 10  # Simple popularity calculation
                combined_content.append(movie_data)
        
        # Query TV shows from database
        if content_type != 'movie':
            tv_query = TVShow.query
            
            # Apply image filters if requested
            if with_images:
                tv_query = tv_query.filter(
                    TVShow.poster_path.isnot(None),
                    TVShow.backdrop_path.isnot(None)
                )
            
            # Order by vote_average descending
            tv_query = tv_query.filter(TVShow.vote_average.isnot(None)).order_by(TVShow.vote_average.desc())
            
            # Get TV shows and serialize them
            tv_shows = tv_query.all()
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
        # Query movies from database
        if content_type != 'tv':
            movie_query = Movie.query.filter(Movie.vote_average >= min_rating)
            
            # Apply image filters if requested
            if with_images:
                movie_query = movie_query.filter(
                    Movie.poster_path.isnot(None),
                    Movie.backdrop_path.isnot(None)
                )
            
            # Order by vote_average descending for featured content
            movie_query = movie_query.order_by(Movie.vote_average.desc())
            
            # Get movies and serialize them
            movies = movie_query.all()
            for movie in movies:
                movie_data = movie.serialize
                movie_data['id'] = movie.movie_id
                combined_content.append(movie_data)
        
        # Query TV shows from database
        if content_type != 'movie':
            tv_query = TVShow.query.filter(TVShow.vote_average >= min_rating)
            
            # Apply image filters if requested
            if with_images:
                tv_query = tv_query.filter(
                    TVShow.poster_path.isnot(None),
                    TVShow.backdrop_path.isnot(None)
                )
            
            # Order by vote_average descending
            tv_query = tv_query.order_by(TVShow.vote_average.desc())
            
            # Get TV shows and serialize them
            tv_shows = tv_query.all()
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
