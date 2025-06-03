from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=True)  # Changed to nullable=True
    password = db.Column(db.String(200), nullable=False)
    is_banned = db.Column(db.Boolean, default=False)
    ban_reason = db.Column(db.String(200), nullable=True)
    ban_until = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=db.func.now())
    updated_at = db.Column(db.DateTime, nullable=True, onupdate=db.func.now())

    watch_history = db.relationship('WatchHistory', back_populates='user', lazy=True)
    watchlist = db.relationship('MyList', backref='user', lazy=True)

    def serialize(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'is_banned': self.is_banned,
            'ban_reason': self.ban_reason,
            'ban_until': self.ban_until,
            'created_at': self.created_at,
            'updated_at': self.updated_at
        }

class Admin(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(50), nullable=False)
    disabled = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=db.func.now())
    updated_at = db.Column(db.DateTime, nullable=True, onupdate=db.func.now())

    def __repr__(self):
        return f'<Admin {self.username} - {self.role}>'

    def serialize(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'disabled': self.disabled,
            'created_at': self.created_at,
            'updated_at': self.updated_at
        }

class BugReport(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    reporter_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    title = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=db.func.now())
    resolved = db.Column(db.Boolean, default=False)

    def serialize(self):
        return {
            'id': self.id,
            'reporter': self.reporter_id,
            'description': self.content,
            'created_at': self.date_created,
            'resolved': self.resolved,
        }

class BlacklistToken(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(500), unique=True, nullable=False)
    blacklisted_on = db.Column(db.DateTime, default=db.func.now())

class WatchHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content_type = db.Column(db.String(50), nullable=False)  # 'movie' or 'tv'
    content_id = db.Column(db.Integer, nullable=False)
    watch_timestamp = db.Column(db.Integer, default=0)  # Position in seconds
    total_duration = db.Column(db.Integer, default=0)  # Total duration in seconds
    progress_percentage = db.Column(db.Float, default=0)  # Progress as percentage
    season_number = db.Column(db.Integer, nullable=True)  # Only for TV shows
    episode_number = db.Column(db.Integer, nullable=True)  # Only for TV shows
    watched_at = db.Column(db.DateTime, default=db.func.now())
    last_watched = db.Column(db.DateTime, default=db.func.now(), onupdate=db.func.now())
    is_completed = db.Column(db.Boolean, default=False)  # If progress > 90%

    # Add relationship to user
    user = db.relationship('User', back_populates='watch_history', lazy=True)
    
    def serialize(self):
        return {
            'id': self.id,
            'content_type': self.content_type,
            'content_id': self.content_id,
            'watch_timestamp': self.watch_timestamp,
            'total_duration': self.total_duration,
            'progress_percentage': self.progress_percentage,
            'season_number': self.season_number,
            'episode_number': self.episode_number,
            'watched_at': self.watched_at.isoformat(),
            'last_watched': self.last_watched.isoformat(),
            'is_completed': self.is_completed
        }

class MyList(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content_type = db.Column(db.String(50), nullable=False)
    content_id = db.Column(db.Integer, nullable=False)
    added_at = db.Column(db.DateTime, default=db.func.now())

class UploadRequest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content_type = db.Column(db.String(50), nullable=False)
    content_id = db.Column(db.Integer, nullable=False)
    added_at = db.Column(db.DateTime, default=db.func.now())

class Movie(db.Model):
    movie_id = db.Column(db.Integer, primary_key=True, unique=True)
    title = db.Column(db.String(255), nullable=False)
    overview = db.Column(db.Text, nullable=False)
    tagline = db.Column(db.String(255), nullable=True)
    release_date = db.Column(db.DateTime, nullable=True, default=datetime.utcnow)
    vote_average = db.Column(db.Float, nullable=True)
    genres = db.Column(db.String(200), nullable=True)
    keywords = db.Column(db.String(255), nullable=True)
    poster_path = db.Column(db.String(255), nullable=True)
    backdrop_path = db.Column(db.String(255), nullable=True)
    runtime = db.Column(db.Integer, nullable=True)
    production_companies = db.Column(db.String(255), nullable=True)
    production_countries = db.Column(db.String(255), nullable=True)
    spoken_languages = db.Column(db.String(100), nullable=True)
    budget = db.Column(db.Integer, nullable=True)
    revenue = db.Column(db.Integer, nullable=True)
    status = db.Column(db.String(255), nullable=True)
    video_id = db.Column(db.Integer, primary_key=True, unique=True)
    has_subtitles = db.Column(db.Boolean, nullable=True)
    in_production = db.Column(db.Boolean, nullable=True)

    def __init__(self, in_production, status, revenue, budget, production_countries, production_companies, has_subtitles, video_id, movie_id, title, overview, tagline=None, release_date=None, vote_average=None, genres=None, keywords=None, poster_path=None, backdrop_path=None, runtime=None, spoken_languages=None):
        self.movie_id = movie_id
        self.video_id = video_id
        self.title = title
        self.overview = overview
        self.tagline = tagline
        self.release_date = datetime.strptime(release_date, '%Y-%m-%d') if release_date else None
        self.vote_average = vote_average
        self.genres = genres
        self.keywords = keywords
        self.poster_path = poster_path
        self.backdrop_path = backdrop_path
        self.runtime = runtime
        self.spoken_languages = spoken_languages
        self.production_companies = production_companies
        self.production_countries = production_countries
        self.budget = budget
        self.revenue = revenue
        self.status = status
        self.has_subtitles = has_subtitles
        self.in_production = in_production

    def __repl__(self):
        return f"<Movie {self.title} {self.movie_id}>"

    @property
    def serialize(self):
        """Return object data in easily serializable format"""
        return {
            'id': self.movie_id,
            'title': self.title,
            'overview': self.overview,
            'tagline': self.tagline,
            'release_date': self.release_date.isoformat() if self.release_date else None,
            'vote_average': self.vote_average,
            'genres': self.genres,
            'keywords': self.keywords,
            'poster_path': self.poster_path,
            'backdrop_path': self.backdrop_path,
            'runtime': self.runtime,
            'spoken_languages': self.spoken_languages,
            'video_id': self.video_id,
            'has_subtitles': self.has_subtitles,
            'production_companies': self.production_companies,
            'production_countries': self.production_countries,
            'budget': self.budget,
            'revenue': self.revenue,
            'status': self.status,
            'in_production': self.in_production,
            'media_type': 'movie'
        }

class TVShow(db.Model):
    __tablename__ = 'tvshow'

    show_id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    genres = db.Column(db.String(200), nullable=True)
    created_by = db.Column(db.String(200), nullable=True)
    overview = db.Column(db.Text, nullable=False)
    poster_path = db.Column(db.String(255), nullable=True)
    backdrop_path = db.Column(db.String(255), nullable=True)
    vote_average = db.Column(db.Float, nullable=True)
    tagline = db.Column(db.String(255), nullable=True)
    spoken_languages = db.Column(db.String(100), nullable=True)
    first_air_date = db.Column(db.DateTime, nullable=True, default=datetime.utcnow)
    last_air_date = db.Column(db.DateTime, nullable=True, default=datetime.utcnow)
    production_companies = db.Column(db.String(255), nullable=True)
    production_countries = db.Column(db.String(255), nullable=True)
    networks = db.Column(db.String(100), nullable=True)
    status = db.Column(db.String(255), nullable=True)
    seasons = db.relationship('Season', backref='tvshow', lazy=True)

    def __init__(self, show_id, title, genres, created_by, overview, poster_path, backdrop_path, vote_average, tagline, spoken_languages,first_air_date, last_air_date, production_companies, production_countries, networks, status, seasons):
        self.show_id = show_id
        self.title = title
        self.genres = genres
        self.created_by = created_by
        self.overview = overview
        self.poster_path = poster_path
        self.backdrop_path = backdrop_path
        self.vote_average = vote_average
        self.tagline = tagline
        self.spoken_languages = spoken_languages
        self.first_air_date = first_air_date
        self.last_air_date = last_air_date
        self.production_companies = production_companies
        self.production_countries = production_countries
        self.networks = networks
        self.status = status
        self.seasons = seasons

    def __repl__(self):
        return f"<TVShow {self.title} {self.show_id}>"

    @property
    def serialize(self):
        """Return object data in easily serializable format"""
        return {
            'show_id': self.show_id,
            'title': self.title,
            'genres': self.genres,
            'created_by': self.created_by,
            'overview': self.overview,
            'poster_path': self.poster_path,
            'backdrop_path': self.backdrop_path,
            'vote_average': self.vote_average,
            'tagline': self.tagline,
            'spoken_languages': self.spoken_languages,
            'first_air_date': self.first_air_date.isoformat() if self.first_air_date else None,
            'last_air_date': self.last_air_date.isoformat() if self.last_air_date else None,
            'production_companies': self.production_companies,
            'production_countries': self.production_countries,
            'networks': self.networks,
            'status': self.status,
            'media_type': 'tv',
            'seasons': [season.serialize for season in self.seasons]
        }
    
class Season(db.Model):
    __tablename__ = 'season'

    id = db.Column(db.Integer, primary_key=True)
    season_number = db.Column(db.Integer, nullable=True)
    tvshow_id = db.Column(db.Integer, db.ForeignKey('tvshow.show_id'), nullable=False)
    episodes = db.relationship('Episode', backref='season', lazy=True, primaryjoin="Season.id == Episode.season_id")

    def __init__(self, id, season_number, tvshow_id, episode):
        self.id = id
        self.season_number = season_number
        self.tvshow_id = tvshow_id
        self.episode = episode
    
    def __repl__(self):
        return f"<Season {self.season_number} {self.tvshow_id}>"

    @property
    def serialize(self):
        return {
            'season_number': self.season_number,
            'tvshow_id': self.tvshow_id,
            'episodes': [episode.serialize for episode in self.episodes]
        }

class Episode(db.Model):
    __tablename__ = 'episode'

    id = db.Column(db.Integer, primary_key=True)
    season_id = db.Column(db.Integer, db.ForeignKey('season.id'), nullable=False)
    episode_number = db.Column(db.Integer, nullable=True)
    title = db.Column(db.String(255), nullable=True)
    overview = db.Column(db.Text, nullable=True)
    has_subtitles = db.Column(db.Boolean, nullable=True)
    video_id = db.Column(db.Integer, primary_key=True, unique=True)
    runtime = db.Column(db.Integer)  # Runtime in minutes

    def __init__(self, id, episode_number, title, overview, has_subtitles, video_id, runtime):
        self.id = id
        self.episode_number = episode_number
        self.title = title
        self.overview = overview
        self.has_subtitles = has_subtitles
        self.video_id = video_id
        self.runtime = runtime

    def __repl__(self):
        return f"<Season {self.title} {self.episode_number} {self.id}>"

    @property
    def serialize(self):
        return {
            'episode_number': self.episode_number,
            'title': self.title,
            'overview': self.overview,
            'has_subtitles': self.has_subtitles,
            'video_id': self.video_id,
            'runtime': self.runtime
        }

class Notification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    message = db.Column(db.Text, nullable=False)
    notification_type = db.Column(db.String(20), nullable=False)  # account, system, content, prompt, warning
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)  # Null for global notifications
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_read = db.Column(db.Boolean, default=False)
    link = db.Column(db.String(200), nullable=True)  # Optional link to redirect users
    
    def __init__(self, id, title, message, notification_type, user_id, created_at, is_read, link):
        self.id = id
        self.title = title
        self.message = message
        self.notification_type = notification_type
        self.user_id = user_id
        self.created_at = created_at if created_at else datetime.utcnow()
        self.is_read = is_read
        self.link = link
    
    def serialize(self):
        return {
            'id': self.id,
            'title': self.title,
            'message': self.message,
            'type': self.notification_type,
            'user_id': self.user_id,
            'created_at': self.created_at,
            'is_read': self.is_read,
            'link': self.link
        }

class UserSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(64), unique=True, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)  # Nullable for anonymous sessions
    user_agent = db.Column(db.String(255))
    ip_address = db.Column(db.String(45))
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_active_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    ended_at = db.Column(db.DateTime, nullable=True)
    
    # Add relationship to user
    user = db.relationship('User', backref=db.backref('sessions', lazy=True))
    
    def serialize(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'user_id': self.user_id,
            'user_agent': self.user_agent,
            'ip_address': self.ip_address,
            'started_at': self.started_at,
            'last_active_at': self.last_active_at,
            'ended_at': self.ended_at,
            'duration': (self.ended_at - self.started_at).total_seconds() if self.ended_at else None
        }

class UserActivity(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(64), db.ForeignKey('user_session.session_id'), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    endpoint = db.Column(db.String(255), nullable=False)
    method = db.Column(db.String(10), nullable=False)  # GET, POST, etc.
    path = db.Column(db.String(255), nullable=False)
    query_params = db.Column(db.Text, nullable=True)
    referrer = db.Column(db.String(255), nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    response_time_ms = db.Column(db.Integer, nullable=True)
    status_code = db.Column(db.Integer, nullable=True)
    
    # Add relationships
    user = db.relationship('User', backref=db.backref('activities', lazy=True))
    session = db.relationship('UserSession', backref=db.backref('activities', lazy=True), foreign_keys=[session_id])
    
    def serialize(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'user_id': self.user_id,
            'endpoint': self.endpoint,
            'method': self.method,
            'path': self.path,
            'timestamp': self.timestamp,
            'response_time_ms': self.response_time_ms,
            'status_code': self.status_code
        }

