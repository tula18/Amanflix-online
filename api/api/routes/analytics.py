from flask import Blueprint, request, jsonify, g
from models import db, UserSession, UserActivity, User, Admin, WatchHistory, Movie, TVShow
from api.utils import admin_token_required, token_required
from datetime import datetime, timedelta
from sqlalchemy import func, desc, and_, case  # Add case here
from utils.logger import log_debug, log_info, log_error
from api.db_utils import safe_commit
import uuid
import psutil
import json

analytics_bp = Blueprint('analytics_bp', __name__, url_prefix='/api/analytics')

# Session Management Endpoints
@analytics_bp.route('/sessions', methods=['POST'])
def create_session():
    """Create a new user session and return session_id"""
    import sys
    
    log_debug(f"---- Session creation requested ----")
    log_debug(f"Headers: {str(dict(request.headers))}")
    
    session_id = str(uuid.uuid4())
    user_id = None
    
    # Try to get user from token if available
    token = request.headers.get('Authorization')
    log_debug(f"Auth token present: {bool(token)}")
    
    if token:
        try:
            token = token.split(" ")[1]
            log_debug(f"Token: {token[:10]}...")
            
            import jwt
            data = jwt.decode(token, 'test', algorithms=['HS256'])
            user_id = data['sub']
            log_debug(f"Decoded user_id: {user_id}")
        except Exception as e:
            log_error(f"Token decode error: {str(e)}")
            pass
    
    # Check if a session already exists for this user/device
    existing_session = None
    if user_id:
        existing_session = UserSession.query.filter_by(
            user_id=user_id, 
            ended_at=None
        ).order_by(UserSession.last_active_at.desc()).first()
    
    if existing_session:
        log_info(f"Found existing active session for user {user_id}: {existing_session.session_id}")
        return jsonify({
            'session_id': existing_session.session_id,
            'user_id': user_id,
            'message': 'Using existing session'
        }), 200
    
    # Create new session
    log_info(f"Creating new session {session_id} for user {user_id}")
    session = UserSession(
        session_id=session_id,
        user_id=user_id,
        user_agent=request.headers.get('User-Agent'),
        ip_address=request.remote_addr
    )
    
    db.session.add(session)
    if not safe_commit():
        return jsonify({'error': 'Failed to create session due to database error'}), 500
    
    return jsonify({
        'session_id': session_id,
        'user_id': user_id,
        'message': 'New session created'
    }), 201

@analytics_bp.route('/heartbeat', methods=['POST'])
def heartbeat():
    """Update last_active_at for a session and update user_id if needed"""
    data = request.json
    session_id = data.get('session_id')
    
    if not session_id:
        return jsonify({'error': 'No session_id provided'}), 400
    
    session = UserSession.query.filter_by(session_id=session_id).first()
    if not session:
        return jsonify({'error': 'Invalid session_id'}), 404
    
    # Update last_active_at timestamp
    session.last_active_at = datetime.utcnow()
    
    # Check if user has logged in/changed
    user_id = None
    token = request.headers.get('Authorization')
    
    if token:
        try:
            token = token.split(" ")[1]
            import jwt
            data = jwt.decode(token, 'test', algorithms=['HS256'])
            
            # Handle both user and admin tokens
            if 'role' in data:  # Admin token
                user_id = f"admin:{data['sub']}"
            else:  # User token
                # Convert to int for proper comparison with session.user_id
                user_id = int(data['sub'])
                
            log_debug(f"Heartbeat with token, user_id: {user_id} (type: {type(user_id)}), session_user: {session.user_id} (type: {type(session.user_id)})")
            
            # Update session's user_id if it has changed (anonymous → logged in)
            if user_id and str(session.user_id) != str(user_id):
                log_info(f"Session {session_id}: User ID changed from {session.user_id} to {user_id}")
                session.user_id = user_id
        except Exception as e:
            log_debug(f"Error decoding token in heartbeat: {str(e)}")
    
    if not safe_commit():
        return jsonify({'error': 'Failed to update session'}), 500
    
    return jsonify({
        'status': 'success',
        'user_id': session.user_id
    }), 200

@analytics_bp.route('/end-session', methods=['POST'])
def end_session():
    """Mark a session as ended"""
    data = request.json
    session_id = data.get('session_id')
    
    if not session_id:
        return jsonify({'error': 'No session_id provided'}), 400
    
    session = UserSession.query.filter_by(session_id=session_id).first()
    if not session:
        return jsonify({'error': 'Invalid session_id'}), 404
    
    if not session.ended_at:
        session.ended_at = datetime.utcnow()
        if not safe_commit():
            return jsonify({'error': 'Failed to end session'}), 500
    
    return jsonify({'status': 'success'}), 200

# Analytics Dashboard Endpoints
@analytics_bp.route('/dashboard', methods=['GET'])
@admin_token_required('moderator')
def get_dashboard_data(current_admin):
    """Get aggregated analytics data for dashboard"""
    now = datetime.utcnow()
    
    # Get time range from query params (default: 24 hours)
    days = request.args.get('days', 1, type=int)
    start_time = now - timedelta(days=days)
    
    # 1. User & Session Metrics
    daily_active_users = (
        db.session.query(
            func.date(UserSession.last_active_at).label('date'),
            func.count(func.distinct(UserSession.user_id)).label('count')
        )
        .filter(UserSession.last_active_at >= start_time, UserSession.user_id != None)
        .group_by(func.date(UserSession.last_active_at))
        .all()
    )
    
    total_sessions = UserSession.query.filter(
        UserSession.started_at >= start_time
    ).count()
    
    new_users = User.query.filter(
        User.created_at >= start_time
    ).count()
    
    # Replace the average duration calculation with this more robust version
    # that includes both completed and active sessions

    # For completed sessions
    completed_sessions_avg = db.session.query(
        func.avg(
            # Using SQLite-friendly datetime calculations
            func.strftime('%s', UserSession.ended_at) - func.strftime('%s', UserSession.started_at)
        )
    ).filter(
        UserSession.started_at >= start_time,
        UserSession.ended_at != None
    ).scalar() or 0

    # For active sessions - use last_active_at instead of ended_at
    active_sessions_avg = db.session.query(
        func.avg(
            # Using SQLite-friendly datetime calculations
            func.strftime('%s', func.coalesce(UserSession.last_active_at, datetime.utcnow())) - 
            func.strftime('%s', UserSession.started_at)
        )
    ).filter(
        UserSession.started_at >= start_time,
        UserSession.ended_at == None
    ).scalar() or 0

    # Count of each type of session
    completed_count = UserSession.query.filter(
        UserSession.started_at >= start_time,
        UserSession.ended_at != None
    ).count()

    active_count = UserSession.query.filter(
        UserSession.started_at >= start_time,
        UserSession.ended_at == None
    ).count()

    # Weighted average of session durations
    total_count = completed_count + active_count
    if total_count > 0:
        avg_duration = ((completed_sessions_avg * completed_count) + 
                       (active_sessions_avg * active_count)) / total_count
    else:
        avg_duration = 0

    log_debug(f"Session duration - Completed: {completed_sessions_avg}s ({completed_count} sessions), " +
             f"Active: {active_sessions_avg}s ({active_count} sessions), " +
             f"Combined: {avg_duration}s")
    
    # 2. Request Throughput
    requests_per_minute = (
        db.session.query(
            func.strftime('%Y-%m-%d %H:%M:00', UserActivity.timestamp).label('minute'),
            func.count(UserActivity.id).label('count')
        )
        .filter(UserActivity.timestamp >= start_time)
        .group_by('minute')
        .order_by('minute')
        .all()
    )
    
    top_endpoints = (
        db.session.query(
            UserActivity.endpoint,
            func.count(UserActivity.id).label('count')
        )
        .filter(UserActivity.timestamp >= start_time)
        .group_by(UserActivity.endpoint)
        .order_by(desc('count'))
        .limit(10)
        .all()
    )
    
    # 3. Performance & Reliability
    # Get sorted response times for all relevant records
    sorted_response_times = db.session.query(UserActivity.response_time_ms)\
        .filter(
            UserActivity.timestamp >= start_time,
            UserActivity.response_time_ms != None
        )\
        .order_by(UserActivity.response_time_ms.asc())\
        .all()

    # Calculate percentiles manually
    p50_latency = p90_latency = p99_latency = 0

    if sorted_response_times:
        # Extract response times from query result
        response_times = [rt[0] for rt in sorted_response_times]
        
        # Calculate indices for percentiles
        total_count = len(response_times)
        if total_count > 0:
            p50_index = int(total_count * 0.5)
            p90_index = int(total_count * 0.9)
            p99_index = int(total_count * 0.99)
            
            # Get values at percentile positions
            p50_latency = response_times[p50_index] if p50_index < total_count else 0
            p90_latency = response_times[p90_index] if p90_index < total_count else 0
            p99_latency = response_times[p99_index] if p99_index < total_count else 0
    
    from sqlalchemy import cast, String

    error_counts = (
        db.session.query(
            func.substr(cast(UserActivity.status_code, String), 1, 1).label('error_type'),
            func.count(UserActivity.id).label('count')
        )
        .filter(
            UserActivity.timestamp >= start_time,
            UserActivity.status_code >= 400
        )
        .group_by('error_type')
        .all()
    )
    
    # 4. System & Infrastructure Health (real-time)
    system_health = {
        'cpu_percent': psutil.cpu_percent(),
        'memory_percent': psutil.virtual_memory().percent,
        'disk_usage_percent': psutil.disk_usage('/').percent,
        'boot_time': psutil.boot_time()
    }
    
    # 5. Real-Time & Alerts
    active_sessions = UserSession.query.filter(
        UserSession.last_active_at >= now - timedelta(minutes=5),
        UserSession.ended_at == None
    ).count()
    
    # Format response data
    response = {
        'user_metrics': {
            'daily_active_users': [{'date': str(d[0]), 'count': d[1]} for d in daily_active_users],
            'total_sessions': total_sessions,
            'new_users': new_users,
            'returning_users': total_sessions - new_users if total_sessions > new_users else 0,
            'avg_session_duration_seconds': round(avg_duration, 2)
        },
        'request_throughput': {
            'requests_per_minute': [{'minute': str(r[0]), 'count': r[1]} for r in requests_per_minute],
            'top_endpoints': [{'endpoint': e[0], 'count': e[1]} for e in top_endpoints]
        },
        'performance': {
            'p50_latency_ms': p50_latency,
            'p90_latency_ms': p90_latency,
            'p99_latency_ms': p99_latency,
            'error_counts': [{'type': e[0], 'count': e[1]} for e in error_counts]
        },
        'system_health': system_health,
        'real_time': {
            'active_sessions': active_sessions
        }
    }
    
    return jsonify(response), 200

@analytics_bp.route('/sessions/active', methods=['GET'])
@admin_token_required('admin')
def get_active_sessions(current_admin):
    """Get currently active sessions"""
    minutes = request.args.get('minutes', 5, type=int)
    active_time = datetime.utcnow() - timedelta(minutes=minutes)
    
    sessions = UserSession.query.filter(
        UserSession.last_active_at >= active_time,
        UserSession.ended_at == None
    ).all()
    
    return jsonify([s.serialize() for s in sessions]), 200

@analytics_bp.route('/content-metrics', methods=['GET'])
@admin_token_required('moderator')
def get_content_metrics(current_admin):
    """Get content performance metrics from watch history data"""
    from utils.logger import log_debug, log_info, log_error
    
    # Get time range from query params (default: 7 days)
    days = request.args.get('days', 7, type=int)
    now = datetime.utcnow()
    start_time = now - timedelta(days=days)
    
    try:
        # 1. Most watched content (count watch history entries per content)
        most_watched_movies = (
            db.session.query(
                WatchHistory.content_id,
                Movie.title,
                func.count(WatchHistory.id).label('view_count')
            )
            .filter(
                WatchHistory.content_type == 'movie',
                WatchHistory.last_watched >= start_time
            )
            .outerjoin(Movie, Movie.movie_id == WatchHistory.content_id)
            .group_by(WatchHistory.content_id, Movie.title)
            .order_by(db.desc('view_count'))
            .limit(10)
            .all()
        )
        
        most_watched_shows = (
            db.session.query(
                WatchHistory.content_id,
                TVShow.title,
                func.count(WatchHistory.id).label('view_count')
            )
            .filter(
                WatchHistory.content_type == 'tv',
                WatchHistory.last_watched >= start_time
            )
            .outerjoin(TVShow, TVShow.show_id == WatchHistory.content_id)
            .group_by(WatchHistory.content_id, TVShow.title)
            .order_by(db.desc('view_count'))
            .limit(10)
            .all()
        )
        
        # 2. Completion rates for content
        completion_stats = (
            db.session.query(
                func.sum(case((WatchHistory.is_completed == True, 1), else_=0)).label('completed'),
                func.sum(case((WatchHistory.is_completed == False, 1), else_=0)).label('not_completed')
            )
            .filter(WatchHistory.last_watched >= start_time)
            .first()
        )
        
        completed_count = completion_stats.completed or 0
        not_completed_count = completion_stats.not_completed or 0
        total_count = completed_count + not_completed_count
        completion_rate = round((completed_count / total_count) * 100) if total_count > 0 else 0
        
        # 3. Most popular genres (extract from movies and shows)
        movie_genres = {}
        show_genres = {}
        
        # Get movies with watch history entries
        movie_watches = (
            db.session.query(
                Movie.genres,
                func.count(WatchHistory.id).label('view_count')
            )
            .join(WatchHistory, (WatchHistory.content_id == Movie.movie_id) & 
                              (WatchHistory.content_type == 'movie'))
            .filter(WatchHistory.last_watched >= start_time)
            .group_by(Movie.genres)
            .all()
        )
        
        # Get TV shows with watch history entries
        show_watches = (
            db.session.query(
                TVShow.genres,
                func.count(WatchHistory.id).label('view_count')
            )
            .join(WatchHistory, (WatchHistory.content_id == TVShow.show_id) & 
                              (WatchHistory.content_type == 'tv'))
            .filter(WatchHistory.last_watched >= start_time)
            .group_by(TVShow.genres)
            .all()
        )
        
        # Process movie genres
        for item in movie_watches:
            if item.genres:
                for genre in item.genres.split(', '):
                    if genre in movie_genres:
                        movie_genres[genre] += item.view_count
                    else:
                        movie_genres[genre] = item.view_count
        
        # Process TV show genres
        for item in show_watches:
            if item.genres:
                for genre in item.genres.split(', '):
                    if genre in show_genres:
                        show_genres[genre] += item.view_count
                    else:
                        show_genres[genre] = item.view_count
        
        # Combine and sort genres
        all_genres = {}
        for genre, count in movie_genres.items():
            all_genres[genre] = all_genres.get(genre, 0) + count
            
        for genre, count in show_genres.items():
            all_genres[genre] = all_genres.get(genre, 0) + count
        
        # Sort and get top genres
        top_genres = [{"genre": k, "count": v} for k, v in 
                     sorted(all_genres.items(), key=lambda item: item[1], reverse=True)[:8]]
        
        # 4. Content type distribution (movies vs. tv)
        movie_views = (
            db.session.query(func.count(WatchHistory.id))
            .filter(
                WatchHistory.content_type == 'movie',
                WatchHistory.last_watched >= start_time
            )
            .scalar() or 0
        )
        
        tv_views = (
            db.session.query(func.count(WatchHistory.id))
            .filter(
                WatchHistory.content_type == 'tv',
                WatchHistory.last_watched >= start_time
            )
            .scalar() or 0
        )
        
        # 5. Daily viewing trends
        daily_views = (
            db.session.query(
                func.date(WatchHistory.last_watched).label('date'),
                func.count(WatchHistory.id).label('count')
            )
            .filter(WatchHistory.last_watched >= start_time)
            .group_by('date')
            .order_by('date')
            .all()
        )
        
        log_debug(f"Most watched shows: {[{'id': s.content_id, 'title': s.title, 'views': s.view_count} for s in most_watched_shows]}")
        log_debug(f"Top genres: {top_genres}")
        
        return jsonify({
            'most_watched': {
                'movies': [
                    {
                        'id': item.content_id,
                        'title': item.title or f"Unknown Movie {item.content_id}",
                        'views': item.view_count,
                        'type': 'movie'
                    } for item in most_watched_movies
                ],
                'shows': [
                    {
                        'id': item.content_id,
                        'title': item.title or f"Unknown Show {item.content_id}",
                        'views': item.view_count,
                        'type': 'tv'
                    } for item in most_watched_shows
                ]
            },
            'completion_metrics': {
                'completed_count': completed_count,
                'not_completed_count': not_completed_count,
                'completion_rate': completion_rate,
                'completion_data': [
                    {'name': 'Completed', 'value': completed_count},
                    {'name': 'Not Completed', 'value': not_completed_count}
                ]
            },
            'genre_popularity': top_genres,
            'content_type_distribution': [
                {'name': 'Movies', 'value': movie_views},
                {'name': 'TV Shows', 'value': tv_views}
            ],
            'daily_viewing_trends': [
                {
                    'date': item.date if isinstance(item.date, str) else item.date.strftime('%Y-%m-%d'),
                    'views': item.count
                } for item in daily_views
            ]
        })
    except Exception as e:
        log_error(f"Error retrieving content metrics: {str(e)}")
        return jsonify({'error': 'Failed to retrieve content metrics'}), 500

@analytics_bp.route('/data-integrity', methods=['GET'])
@admin_token_required('moderator')
def get_data_integrity_metrics(current_admin):
    """Get data integrity metrics including unwanted field contamination"""
    try:
        from utils.data_helpers import count_unwanted_fields
        
        # Get unwanted fields to check from query params
        fields_param = request.args.get('fields', 'watch_history')
        fields_to_check = [f.strip() for f in fields_param.split(',') if f.strip()]
        
        # Get include_files flag from query params
        include_files = request.args.get('include_files', 'false').lower() == 'true'
        
        log_info(f"Checking data integrity for fields: {fields_to_check}, include_files: {include_files}")
        
        # Get contamination report
        contamination_report = count_unwanted_fields(fields_to_check, include_files)
        
        # Add timestamp and request info
        contamination_report['timestamp'] = datetime.utcnow().isoformat()
        contamination_report['checked_fields'] = fields_to_check
        contamination_report['include_files'] = include_files
        
        # Calculate health status
        contamination_percentage = contamination_report.get('contamination_percentage', 0)
        if contamination_percentage == 0:
            health_status = 'excellent'
        elif contamination_percentage < 1:
            health_status = 'good'
        elif contamination_percentage < 5:
            health_status = 'warning'
        else:
            health_status = 'critical'
        
        contamination_report['health_status'] = health_status
        
        return jsonify(contamination_report), 200
        
    except Exception as e:
        log_error(f"Error getting data integrity metrics: {str(e)}")
        return jsonify({
            'error': 'Failed to get data integrity metrics',
            'total_contaminated': 0,
            'total_items': 0,
            'contamination_percentage': 0,
            'health_status': 'error'
        }), 500