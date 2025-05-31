from flask import Blueprint, jsonify, request
from models import db, WatchHistory, Movie, TVShow, Season, Episode, User
from api.routes.auth import token_required
from datetime import datetime
from sqlalchemy import desc
from api.utils import create_watch_id, parse_watch_id
from utils.logger import log_error, log_info, log_debug

watch_history_bp = Blueprint('watch_history', __name__, url_prefix='/api/watch-history')

# Example of consistent response format
def format_watch_response(watch_history, content=None):
    """Format watch history response consistently"""
    response = {
        'id': watch_history.id,
        'content_type': watch_history.content_type,
        'content_id': watch_history.content_id,
        'watch_timestamp': watch_history.watch_timestamp,
        'total_duration': watch_history.total_duration,
        'progress_percentage': watch_history.progress_percentage,
        'is_completed': watch_history.is_completed,
        'last_watched': watch_history.last_watched.isoformat()
    }
    
    if watch_history.content_type == 'tv':
        response['season_number'] = watch_history.season_number
        response['episode_number'] = watch_history.episode_number
        response['episode_id'] = create_watch_id('tv', watch_history.content_id, 
                                             watch_history.season_number, 
                                             watch_history.episode_number)
    else:
        response['episode_id'] = create_watch_id('movie', watch_history.content_id)
    
    if content:
        response['content'] = content
        
    return response

@watch_history_bp.route('/update', methods=['POST'])
@token_required
def update_watch_history(current_user):
    """Update user's watch history"""
    data = request.json
    
    if not data:
        return jsonify({'message': 'No data provided'}), 400
    
    content_id = data.get('content_id')
    content_type = data.get('content_type')
    watch_timestamp = data.get('watch_timestamp')
    total_duration = data.get('total_duration')
    season_number = data.get('season_number')
    episode_number = data.get('episode_number')
    
    # Calculate progress percentage
    progress_percentage = 0
    if total_duration > 0:
        progress_percentage = (watch_timestamp / total_duration) * 100
    
    # Check if entry exists
    watch_history = None
    if content_type == 'movie':
        watch_history = WatchHistory.query.filter_by(
            user_id=current_user.id,
            content_id=content_id,
            content_type=content_type
        ).first()
    else:
        watch_history = WatchHistory.query.filter_by(
            user_id=current_user.id,
            content_id=content_id,
            content_type=content_type,
            season_number=season_number,
            episode_number=episode_number
        ).first()
    
    # Is it completed?
    is_completed = progress_percentage > 90
    
    # Create or update watch history
    if watch_history:
        watch_history.watch_timestamp = watch_timestamp
        watch_history.total_duration = total_duration
        watch_history.progress_percentage = progress_percentage
        watch_history.last_watched = datetime.utcnow()
        watch_history.is_completed = is_completed
    else:
        watch_history = WatchHistory(
            user_id=current_user.id,
            content_id=content_id,
            content_type=content_type,
            watch_timestamp=watch_timestamp,
            total_duration=total_duration,
            progress_percentage=progress_percentage,
            season_number=season_number,
            episode_number=episode_number,
            is_completed=is_completed
        )
        db.session.add(watch_history)
    
    db.session.commit()
    return jsonify(watch_history.serialize()), 200

@watch_history_bp.route('/continue-watching', methods=['GET'])
@token_required
def get_continue_watching(current_user):
    """Get a list of content the user was watching but hasn't finished"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    
    # For TV shows, we'll need to get all watch history entries first
    tv_history = WatchHistory.query.filter_by(
        user_id=current_user.id,
        content_type='tv'
    ).order_by(desc(WatchHistory.last_watched)).all()
    
    # Group by show_id to find the most recently watched episode for each show
    tv_show_history = {}
    for item in tv_history:
        if item.content_id not in tv_show_history:
            tv_show_history[item.content_id] = item
    
    
    # For movies, we'll get in-progress items
    movie_history = WatchHistory.query.filter_by(
        user_id=current_user.id,
        content_type='movie'
    ).filter(
        WatchHistory.progress_percentage > 1,
        WatchHistory.progress_percentage < 90
    ).order_by(desc(WatchHistory.last_watched)).all()
    
    
    # Combine both lists
    all_history = list(tv_show_history.values()) + movie_history
    
    # Sort by last watched and apply pagination manually
    all_history.sort(key=lambda x: x.last_watched, reverse=True)
    start_idx = (page - 1) * per_page
    end_idx = start_idx + per_page
    paginated_history = all_history[start_idx:end_idx]
    
    
    result = []
    
    # Process each item
    for item in paginated_history:
        content = None
        
        # Handle movies
        if item.content_type == 'movie':
            
            # Skip completed movies
            if item.progress_percentage >= 90:
                continue
                
            # Try to get from DB first
            movie = Movie.query.filter_by(movie_id=item.content_id).first()
            if movie:
                content = movie.serialize
                content['source'] = 'database'
            else:
                # If not in DB, try from CDN
                from app import movies, item_index
                if item.content_id in item_index:
                    content = movies[item_index[item.content_id]].copy()
                    content['source'] = 'cdn'
                    
            if content:
                content['watch_history'] = item.serialize()
                result.append(content)
                
        # Handle TV shows
        else:  # item.content_type == 'tv'
            
            # If episode is not completed, always show it
            if item.progress_percentage < 90 and not item.is_completed:
                # Try to get from DB first
                tv_show = TVShow.query.filter_by(show_id=item.content_id).first()
                
                if tv_show:
                    content = tv_show.serialize
                    content['source'] = 'database'
                    content['watch_history'] = item.serialize()
                    result.append(content)
                else:
                    # If not in DB, try from CDN
                    from app import tv_series, item_index
                    if item.content_id in item_index:
                        content = tv_series[item_index[item.content_id]].copy()
                        content['source'] = 'cdn'
                        content['watch_history'] = item.serialize()
                        result.append(content)
            
            # If episode is completed, check if there's a next episode
            else:
                next_episode_info = get_next_episode_info(current_user, item)
                
                # Only show if there's a valid next episode (not a restart)
                if next_episode_info:
                    
                    # Check if the next episode is just a restart of the same episode
                    is_restart_same_episode = (
                        next_episode_info.get('season_number') == item.season_number and
                        next_episode_info.get('episode_number') == item.episode_number and
                        next_episode_info.get('restarted', False)
                    )
                    
                    # Don't show if it's just suggesting to restart the same episode
                    if is_restart_same_episode:
                        continue
                        
                    # Try to get from DB first
                    tv_show = TVShow.query.filter_by(show_id=item.content_id).first()
                    
                    if tv_show:
                        content = tv_show.serialize
                        content['source'] = 'database'
                        
                        # Create a copy of the watch history with next episode info
                        watch_history_data = item.serialize()
                        watch_history_data['next_episode'] = next_episode_info
                        content['watch_history'] = watch_history_data
                        result.append(content)
                    else:
                        # If not in DB, try from CDN
                        from app import tv_series, item_index
                        if item.content_id in item_index:
                            content = tv_series[item_index[item.content_id]].copy()
                            content['source'] = 'cdn'
                            
                            # Create a copy of the watch history with next episode info
                            watch_history_data = item.serialize()
                            watch_history_data['next_episode'] = next_episode_info
                            content['watch_history'] = watch_history_data
                            result.append(content)
                else:
                    # No next episode found, skip this show
                    continue
    
    return jsonify(result), 200

def get_next_episode_info(current_user, watch_history):
    """Helper function to get information about the next episode to watch"""
    content_id = watch_history.content_id
    
    # Define colors for terminal output
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    CYAN = '\033[96m'
    RED = '\033[91m'
    MAGENTA = '\033[95m'
    RESET = '\033[0m'
    
    # Try to get show from DB
    show = TVShow.query.filter_by(show_id=content_id).first()
    
    next_episode_info = None
    single_episode_show = False
    
    if show:
        # Find from DB
        current_season = Season.query.filter_by(
            tvshow_id=content_id, 
            season_number=watch_history.season_number
        ).first()
        
        # Check if this is a single episode show
        all_seasons = Season.query.filter_by(tvshow_id=content_id).all()
        
        # Check how many episodes in each season
        for season in all_seasons:
            episodes = Episode.query.filter_by(season_id=season.id).all()
        
        if len(all_seasons) == 1 and current_season:
            episodes_in_season = Episode.query.filter_by(season_id=current_season.id).count()
            if episodes_in_season == 1:
                single_episode_show = True
        
        if single_episode_show and watch_history.is_completed:
            # Don't suggest anything for completed single episode shows
            return None
            
        if current_season:
            # Try to find next episode in current season
            next_episode = Episode.query.filter_by(
                season_id=current_season.id
            ).filter(
                Episode.episode_number > watch_history.episode_number
            ).order_by(Episode.episode_number).first()
            
            if next_episode:
                next_episode_info = {
                    'season_number': watch_history.season_number,
                    'episode_number': next_episode.episode_number,
                    'episode_id': create_watch_id('tv', content_id, watch_history.season_number, next_episode.episode_number),
                    'title': next_episode.title,
                    'overview': next_episode.overview,
                    'runtime': next_episode.runtime,
                    'is_next_season': False
                }
                
                # Check if there's already a watch history for this next episode
                next_episode_history = WatchHistory.query.filter_by(
                    user_id=current_user.id,
                    content_id=content_id,
                    content_type='tv',
                    season_number=watch_history.season_number,
                    episode_number=next_episode.episode_number
                ).first()
                
                if next_episode_history:
                    next_episode_info.update({
                        'progress_percentage': next_episode_history.progress_percentage,
                        'total_duration': next_episode_history.total_duration,
                        'watch_timestamp': next_episode_history.watch_timestamp,
                        'is_completed': next_episode_history.is_completed
                    })
            else:
                # No next episode in current season, find first episode of next season
                next_season = Season.query.filter_by(
                    tvshow_id=content_id
                ).filter(
                    Season.season_number > watch_history.season_number
                ).order_by(Season.season_number).first()
                
                if next_season:
                    first_episode = Episode.query.filter_by(
                        season_id=next_season.id
                    ).order_by(Episode.episode_number).first()
                    
                    if first_episode:
                        next_episode_info = {
                            'season_number': next_season.season_number,
                            'episode_number': first_episode.episode_number,
                            'episode_id': create_watch_id('tv', content_id, next_season.season_number, first_episode.episode_number),
                            'title': first_episode.title,
                            'overview': first_episode.overview,
                            'runtime': first_episode.runtime,
                            'is_next_season': True
                        }
                else:
                    # No next season found, restart from the first episode
                    first_season = Season.query.filter_by(tvshow_id=content_id).order_by(Season.season_number).first()
                    if first_season:
                        first_episode = Episode.query.filter_by(season_id=first_season.id).order_by(Episode.episode_number).first()
                        if first_episode:
                            # Don't suggest restart if it's the same episode
                            if first_season.season_number == watch_history.season_number and first_episode.episode_number == watch_history.episode_number:
                                return None
                            
                            # Check if we've already watched first episode - users likely don't want to restart
                            first_episode_history = WatchHistory.query.filter_by(
                                user_id=current_user.id,
                                content_id=content_id,
                                content_type='tv',
                                season_number=first_season.season_number,
                                episode_number=first_episode.episode_number
                            ).first()
                            
                            if first_episode_history and first_episode_history.is_completed:
                                # If user has completed all episodes, don't suggest anything
                                all_completed = True
                                for season in all_seasons:
                                    episodes = Episode.query.filter_by(season_id=season.id).all()
                                    for episode in episodes:
                                        episode_history = WatchHistory.query.filter_by(
                                            user_id=current_user.id,
                                            content_id=content_id,
                                            content_type='tv',
                                            season_number=season.season_number,
                                            episode_number=episode.episode_number,
                                            is_completed=True
                                        ).first()
                                        if not episode_history:
                                            all_completed = False
                                            break
                                    if not all_completed:
                                        break
                                
                                if all_completed:
                                    return None
                                
                                # Otherwise, if not suggesting restart, return None to hide this show
                                return None
                                
                            next_episode_info = {
                                'season_number': first_season.season_number,
                                'episode_number': first_episode.episode_number,
                                'episode_id': create_watch_id('tv', content_id, first_season.season_number, first_episode.episode_number),
                                'title': first_episode.title,
                                'overview': first_episode.overview,
                                'runtime': first_episode.runtime,
                                'is_next_season': True,
                                'restarted': True
                            }
    else:
        # Check CDN for single episode shows
        from app import tv_series, item_index
        if content_id in item_index:
            show_info = tv_series[item_index[content_id]]
            seasons_count = show_info.get('number_of_seasons', 0)
            episodes_count = show_info.get('number_of_episodes', 0)
            
            
            if seasons_count == 1 and episodes_count == 1 and watch_history.is_completed:
                # Single episode show and it's completed
                return None
    
    if not next_episode_info:
        # Fallback for CDN or incomplete DB info - check if we should generate an estimate
        from app import tv_series, item_index
        if content_id in item_index:
            show_info = tv_series[item_index[content_id]]
            seasons_count = show_info.get('number_of_seasons', 0)
            episodes_count = show_info.get('number_of_episodes', 0)
            
            
            # If it's a single episode show that's completed, don't suggest anything
            if seasons_count == 1 and episodes_count == 1 and watch_history.is_completed:
                return None
        
        # For other cases, generate an estimate
        season_number = watch_history.season_number
        episode_number = watch_history.episode_number + 1
        
        
        # If episode number is too high, go to next season
        if episode_number > 20:  # Using 20 as a reasonable limit
            season_number += 1
            episode_number = 1
        
        # If we're estimating a high season number, restart the show
        if season_number > 10:  # Using 10 as a reasonable limit for max seasons
            # Only mark as restarted if we're actually going to a different episode
            if not (season_number == 1 and episode_number == 1 and 
                   watch_history.season_number == 1 and watch_history.episode_number == 1):
                next_episode_info = {
                    'season_number': 1,
                    'episode_number': 1,
                    'episode_id': create_watch_id('tv', content_id, 1, 1),
                    'is_estimated': True,
                    'restarted': True,
                    'is_next_season': season_number != watch_history.season_number
                }
        else:
            # Only create next_episode_info if it's a different episode
            if not (season_number == watch_history.season_number and episode_number == watch_history.episode_number):
                next_episode_info = {
                    'season_number': season_number,
                    'episode_number': episode_number,
                    'episode_id': create_watch_id('tv', content_id, season_number, episode_number),
                    'is_estimated': True,
                    'is_next_season': season_number > watch_history.season_number
                }
    
    return next_episode_info

@watch_history_bp.route('/get/<content_type>/<int:content_id>', methods=['GET'])
@token_required
def get_watch_history(current_user, content_type, content_id):
    """Get watch history for specific content"""
    season = request.args.get('season', type=int)
    episode = request.args.get('episode', type=int)
    
    query = WatchHistory.query.filter_by(
        user_id=current_user.id,
        content_id=content_id,
        content_type=content_type
    )
    
    if content_type == 'tv' and season and episode:
        query = query.filter_by(
            season_number=season,
            episode_number=episode
        )
    
    watch_history = query.first()
    
    if watch_history:
        return jsonify(watch_history.serialize()), 200
    else:
        return jsonify({'message': 'No watch history found'}), 404

@watch_history_bp.route('/show/<int:show_id>', methods=['GET'])
@token_required
def get_show_progress(current_user, show_id):
    """Get all episodes progress for a specific show"""
    episodes = WatchHistory.query.filter_by(
        user_id=current_user.id,
        content_id=show_id,
        content_type='tv'
    ).all()
    
    result = []
    for episode in episodes:
        episode_id = f"{show_id}{episode.season_number}{episode.episode_number}"
        result.append({
            'episodeId': episode_id,
            'seasonNumber': episode.season_number,
            'episodeNumber': episode.episode_number,
            'progress': episode.progress_percentage,
            'is_completed': episode.is_completed,
            'last_watched': episode.last_watched.isoformat()
        })
    
    return jsonify(result), 200

@watch_history_bp.route('/next-episode/<int:show_id>', methods=['GET'])
@token_required
def get_next_episode(current_user, show_id):
    """Get the next episode to watch for a TV show"""
    # Try to get from DB first
    show = TVShow.query.filter_by(show_id=show_id).first()
    
    if not show:
        # If not in DB, get from CDN
        from app import tv_series, item_index
        if show_id not in item_index:
            return jsonify({'message': 'Show not found'}), 404

    # Get the last watched episode
    last_watched = WatchHistory.query.filter_by(
        user_id=current_user.id,
        content_id=show_id,
        content_type='tv'
    ).order_by(desc(WatchHistory.last_watched)).first()
    
    if not last_watched:
        # No history - return first episode
        if show:
            # Get from DB
            first_season = Season.query.filter_by(tvshow_id=show_id).order_by(Season.season_number).first()
            if first_season:
                first_episode = Episode.query.filter_by(season_id=first_season.id).order_by(Episode.episode_number).first()
                if first_episode:
                    return jsonify({
                        'show_id': show_id,
                        'season_number': first_season.season_number,
                        'episode_number': first_episode.episode_number,
                        'episode_id': create_watch_id('tv', show_id, first_season.season_number, first_episode.episode_number),
                        'timestamp': 0,
                        'total_duration': first_episode.runtime or 0,
                        'progress': 0
                    }), 200
        
        # Default case - return first episode of season 1
        return jsonify({
            'show_id': show_id,
            'season_number': 1,
            'episode_number': 1,
            'episode_id': create_watch_id('tv', show_id, 1, 1),
            'timestamp': 0,
            'progress': 0
        }), 200
    
    # If last watched episode is not completed, return it
    if not last_watched.is_completed:
        return jsonify({
            'show_id': show_id,
            'season_number': last_watched.season_number,
            'episode_number': last_watched.episode_number,
            'watch_timestamp': last_watched.watch_timestamp,
            'progress_percentage': last_watched.progress_percentage,
            'episode_id': create_watch_id('tv', show_id, last_watched.season_number, last_watched.episode_number),
            'is_completed': False
        }), 200
    
    # If last watched episode is completed, find the next episode
    if show:
        # Find from DB
        current_season = Season.query.filter_by(
            tvshow_id=show_id, 
            season_number=last_watched.season_number
        ).first()
        
        if current_season:
            next_episode = Episode.query.filter_by(
                season_id=current_season.id
            ).filter(
                Episode.episode_number > last_watched.episode_number
            ).order_by(Episode.episode_number).first()
            
            if next_episode:
                # Check if there's watch history for this next episode
                next_episode_history = WatchHistory.query.filter_by(
                    user_id=current_user.id,
                    content_id=show_id,  # Changed from content_id to show_id
                    content_type='tv',
                    season_number=last_watched.season_number,  # Changed from watch_history to last_watched
                    episode_number=next_episode.episode_number
                ).first()
                
                next_episode_info = {
                    'season_number': last_watched.season_number,  # Changed from watch_history to last_watched
                    'episode_number': next_episode.episode_number,
                    'episode_id': create_watch_id('tv', show_id, last_watched.season_number, next_episode.episode_number),  # Changed from content_id to show_id and watch_history to last_watched
                    'title': next_episode.title,
                    'overview': next_episode.overview,
                    'runtime': next_episode.runtime,
                    'is_next_season': False
                }
                
                # Add progress information if available
                if next_episode_history:
                    next_episode_info.update({
                        'progress_percentage': next_episode_history.progress_percentage,
                        'total_duration': next_episode_history.total_duration,
                        'watch_timestamp': next_episode_history.watch_timestamp,
                        'is_completed': next_episode_history.is_completed
                    })
                return jsonify(next_episode_info), 200
            
            # No next episode in current season, find first episode of next season
            next_season = Season.query.filter_by(
                tvshow_id=show_id
            ).filter(
                Season.season_number > last_watched.season_number
            ).order_by(Season.season_number).first()
            
            if next_season:
                first_episode = Episode.query.filter_by(
                    season_id=next_season.id
                ).order_by(Episode.episode_number).first()
                
                if first_episode:
                    return jsonify({
                        'show_id': show_id,
                        'season_number': next_season.season_number,
                        'episode_number': first_episode.episode_number,
                        'episode_id': create_watch_id('tv', show_id, next_season.season_number, first_episode.episode_number)
                    }), 200
            
            # No next season found, this was the last episode of the last season
            # Restart from the first episode of the first season
            first_season = Season.query.filter_by(tvshow_id=show_id).order_by(Season.season_number).first()
            if first_season:
                first_episode = Episode.query.filter_by(season_id=first_season.id).order_by(Episode.episode_number).first()
                if first_episode:
                    return jsonify({
                        'show_id': show_id,
                        'season_number': first_season.season_number,
                        'episode_number': first_episode.episode_number,
                        'episode_id': create_watch_id('tv', show_id, first_season.season_number, first_episode.episode_number),
                        'restarted': True  # Indicate that we're restarting the show
                    }), 200
    
    # For shows from CDN or if we couldn't find proper next episode in DB
    # First try to get the next episode in sequence
    season_number = last_watched.season_number
    episode_number = last_watched.episode_number + 1
    
    # If episode number is too high, go to next season
    if episode_number > 20:  # Using 20 as a reasonable limit
        season_number += 1
        episode_number = 1
    
    # If we're estimating a high season number, restart the show
    if season_number > 10:  # Using 10 as a reasonable limit for max seasons
        season_number = 1
        episode_number = 1
        return jsonify({
            'show_id': show_id,
            'season_number': season_number,
            'episode_number': episode_number,
            'episode_id': create_watch_id('tv', show_id, season_number, episode_number),
            'is_estimated': True,
            'restarted': True  # Indicate we're restarting the show
        }), 200
    
    return jsonify({
        'show_id': show_id,
        'season_number': season_number,
        'episode_number': episode_number,
        'episode_id': create_watch_id('tv', show_id, season_number, episode_number),
        'is_estimated': True  # Flag to indicate this is an estimated next episode
    }), 200

@watch_history_bp.route('/parse/<watch_id>', methods=['GET'])
def parse_watch_identifier(watch_id):
    """Parse a watch ID and return its components"""
    parsed = parse_watch_id(watch_id)
    if parsed:
        return jsonify(parsed), 200
    return jsonify({'message': 'Invalid watch ID format'}), 400

@watch_history_bp.route('/get-by-id/<watch_id>', methods=['GET'])
@token_required
def get_watch_history_by_id(current_user, watch_id):
    """Get watch history for specific content using the watch ID format"""
    parsed = parse_watch_id(watch_id)
    if not parsed:
        return jsonify({'message': 'Invalid watch ID format'}), 400
        
    content_type = parsed['content_type']
    content_id = parsed['content_id']
    
    query = WatchHistory.query.filter_by(
        user_id=current_user.id,
        content_id=content_id,
        content_type=content_type
    )
    
    if content_type == 'tv':
        season_number = parsed['season_number'] 
        episode_number = parsed['episode_number']
        query = query.filter_by(
            season_number=season_number,
            episode_number=episode_number
        )
    
    watch_history = query.first()
    
    if watch_history:
        return jsonify(watch_history.serialize()), 200
    else:
        return jsonify({'message': 'No watch history found'}), 404

@watch_history_bp.route('/current/<content_type>/<int:content_id>', methods=['GET'])
@token_required
def get_current_progress(current_user, content_type, content_id):
    """Get current episode and watch position for TV shows or current watch position for movies"""
    if content_type not in ['tv', 'movie']:
        return jsonify({'message': 'Invalid content type. Must be "tv" or "movie"'}), 400
    
    if content_type == 'movie':
        # Get the watch history for this movie
        watch_history = WatchHistory.query.filter_by(
            user_id=current_user.id,
            content_id=content_id,
            content_type='movie'
        ).first()
        
        if not watch_history:
            return jsonify({'message': 'No watch history found for this movie'}), 404
        
        return jsonify({
            'content_type': 'movie',
            'content_id': content_id,
            'watch_timestamp': watch_history.watch_timestamp,
            'total_duration': watch_history.total_duration,
            'progress_percentage': watch_history.progress_percentage,
            'is_completed': watch_history.is_completed
        }), 200
    
    else:  # TV show
        # Get the most recently watched episode for this show
        watch_history = WatchHistory.query.filter_by(
            user_id=current_user.id,
            content_id=content_id,
            content_type='tv'
        ).order_by(desc(WatchHistory.last_watched)).first()
        
        if not watch_history:
            return jsonify({'message': 'No watch history found for this TV show'}), 404
        
        # Get episode details if possible
        episode_details = None
        try:
            show = TVShow.query.filter_by(show_id=content_id).first()
            if show:
                season = Season.query.filter_by(
                    tvshow_id=content_id,
                    season_number=watch_history.season_number
                ).first()
                
                if season:
                    episode = Episode.query.filter_by(
                        season_id=season.id,
                        episode_number=watch_history.episode_number
                    ).first()
                    
                    if episode:
                        episode_details = {
                            'title': episode.title,
                            'overview': episode.overview,
                            'runtime': episode.runtime
                        }
        except Exception as e:
            log_error(f"Error fetching episode details: {e}")
            
        response = {
            'content_type': 'tv',
            'content_id': content_id,
            'season_number': watch_history.season_number,
            'episode_number': watch_history.episode_number,
            'watch_timestamp': watch_history.watch_timestamp,
            'total_duration': watch_history.total_duration,
            'progress_percentage': watch_history.progress_percentage,
            'is_completed': watch_history.is_completed,
            'episode_id': create_watch_id('tv', content_id, watch_history.season_number, watch_history.episode_number)
        }
        
        if episode_details:
            response['episode_details'] = episode_details
            
        # Add information about what will play next
        if watch_history.is_completed:
            # If current episode is completed, get next episode information
            next_episode_info = None
            
            if show:
                # Find from DB
                current_season = Season.query.filter_by(
                    tvshow_id=content_id, 
                    season_number=watch_history.season_number
                ).first()
                
                if current_season:
                    # Try to find next episode in current season
                    next_episode = Episode.query.filter_by(
                        season_id=current_season.id
                    ).filter(
                        Episode.episode_number > watch_history.episode_number
                    ).order_by(Episode.episode_number).first()
                    
                    if next_episode:
                        next_episode_info = {
                            'season_number': watch_history.season_number,
                            'episode_number': next_episode.episode_number,
                            'episode_id': create_watch_id('tv', content_id, watch_history.season_number, next_episode.episode_number),
                            'title': next_episode.title,
                            'overview': next_episode.overview,
                            'runtime': next_episode.runtime,
                            'is_next_season': False
                        }
                        
                        # Add progress information if available - First define next_episode_history
                        next_episode_history = WatchHistory.query.filter_by(
                            user_id=current_user.id,
                            content_id=content_id,
                            content_type='tv',
                            season_number=watch_history.season_number,
                            episode_number=next_episode.episode_number
                        ).first()
                        
                        # Then use it
                        if next_episode_history:
                            next_episode_info.update({
                                'progress_percentage': next_episode_history.progress_percentage,
                                'total_duration': next_episode_history.total_duration,
                                'watch_timestamp': next_episode_history.watch_timestamp,
                                'is_completed': next_episode_history.is_completed
                            })
                    else:
                        # No next episode in current season, find first episode of next season
                        next_season = Season.query.filter_by(
                            tvshow_id=content_id
                        ).filter(
                            Season.season_number > watch_history.season_number
                        ).order_by(Season.season_number).first()
                        
                        if next_season:
                            first_episode = Episode.query.filter_by(
                                season_id=next_season.id
                            ).order_by(Episode.episode_number).first()
                            
                            if first_episode:
                                next_episode_info = {
                                    'season_number': next_season.season_number,
                                    'episode_number': first_episode.episode_number,
                                    'episode_id': create_watch_id('tv', content_id, next_season.season_number, first_episode.episode_number),
                                    'title': first_episode.title,
                                    'overview': first_episode.overview,
                                    'runtime': first_episode.runtime,
                                    'is_next_season': True
                                }
                        else:
                            # No next season found, restart from the first episode
                            first_season = Season.query.filter_by(tvshow_id=content_id).order_by(Season.season_number).first()
                            if first_season:
                                first_episode = Episode.query.filter_by(season_id=first_season.id).order_by(Episode.episode_number).first()
                                if first_episode:
                                    next_episode_info = {
                                        'season_number': first_season.season_number,
                                        'episode_number': first_episode.episode_number,
                                        'episode_id': create_watch_id('tv', content_id, first_season.season_number, first_episode.episode_number),
                                        'title': first_episode.title,
                                        'overview': first_episode.overview,
                                        'runtime': first_episode.runtime,
                                        'is_next_season': True,
                                        'restarted': True
                                    }
            
            if next_episode_info:
                response['next_episode'] = next_episode_info
            else:
                # Fallback for CDN or when DB info is incomplete
                # Just provide basic next episode information
                season_number = watch_history.season_number
                episode_number = watch_history.episode_number + 1
                
                # If episode number is too high, go to next season
                if episode_number > 20:  # Using 20 as a reasonable limit
                    season_number += 1
                    episode_number = 1
                
                # If we're estimating a high season number, restart the show
                if season_number > 10:  # Using 10 as a reasonable limit for max seasons
                    response['next_episode'] = {
                        'season_number': 1,
                        'episode_number': 1,
                        'episode_id': create_watch_id('tv', content_id, 1, 1),
                        'is_estimated': True,
                        'restarted': True,
                        'is_next_season': True
                    }
                else:
                    response['next_episode'] = {
                        'season_number': season_number,
                        'episode_number': episode_number,
                        'episode_id': create_watch_id('tv', content_id, season_number, episode_number),
                        'is_estimated': True,
                        'is_next_season': season_number > watch_history.season_number
                    }
        
        return jsonify(response), 200