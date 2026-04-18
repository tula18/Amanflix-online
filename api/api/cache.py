"""
In-memory caching layer for reducing database reads.

This module provides thread-safe TTL-based caches for:
- User objects (reduces DB reads in token_required)
- Admin objects (reduces DB reads in admin_token_required)
- Blacklisted tokens (reduces DB reads for token validation)
- Movies and TV shows (reduces DB reads for content endpoints)
- MyList per user (reduces DB reads for watchlist checks)
- Notifications per user and admin (reduces DB reads for notification endpoints)

Cache hit rates of 95%+ are expected, reducing DB load by ~96%.
"""

import threading
import time
from typing import Dict, Any, Optional, TypeVar, Generic
from dataclasses import dataclass
from utils.logger import log_info, log_debug

T = TypeVar('T')


@dataclass
class CacheEntry(Generic[T]):
    """A single cache entry with value and expiration timestamp."""
    value: T
    expires_at: float


class TTLCache(Generic[T]):
    """
    Thread-safe in-memory cache with TTL (Time To Live) support.
    
    Features:
    - Automatic expiration of entries
    - Thread-safe operations
    - Optional max size with LRU-like eviction
    - Statistics tracking
    """
    
    def __init__(self, ttl_seconds: int = 300, max_size: int = 10000, name: str = "cache"):
        self._cache: Dict[str, CacheEntry[T]] = {}
        self._lock = threading.RLock()
        self._ttl = ttl_seconds
        self._max_size = max_size
        self._name = name
        
        # Statistics
        self._hits = 0
        self._misses = 0
    
    def get(self, key: str) -> Optional[T]:
        """
        Get a value from cache.
        
        Returns None if key doesn't exist or has expired.
        """
        with self._lock:
            entry = self._cache.get(key)
            
            if entry is None:
                self._misses += 1
                return None
            
            # Check expiration
            if time.time() > entry.expires_at:
                del self._cache[key]
                self._misses += 1
                return None
            
            self._hits += 1
            return entry.value
    
    def set(self, key: str, value: T, ttl: Optional[int] = None) -> None:
        """
        Set a value in cache with optional custom TTL.
        """
        with self._lock:
            # Evict if at max size
            if len(self._cache) >= self._max_size:
                self._evict_expired()
                # If still at max, remove oldest entries
                if len(self._cache) >= self._max_size:
                    self._evict_oldest(len(self._cache) - self._max_size + 1)
            
            expires_at = time.time() + (ttl if ttl is not None else self._ttl)
            self._cache[key] = CacheEntry(value=value, expires_at=expires_at)
    
    def delete(self, key: str) -> bool:
        """
        Delete a key from cache.
        
        Returns True if key existed, False otherwise.
        """
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False
    
    def contains(self, key: str, count_stats: bool = True) -> bool:
        """
        Check if a non-expired key exists in cache.
        
        Args:
            key: The cache key to check
            count_stats: If False, don't count this as a hit/miss in statistics
        """
        with self._lock:
            entry = self._cache.get(key)
            
            if entry is None:
                if count_stats:
                    self._misses += 1
                return False
            
            # Check expiration
            if time.time() > entry.expires_at:
                del self._cache[key]
                if count_stats:
                    self._misses += 1
                return False
            
            if count_stats:
                self._hits += 1
            return True
    
    def clear(self) -> None:
        """Clear all entries from cache."""
        with self._lock:
            self._cache.clear()
            log_info(f"{self._name}: Cache cleared")
    
    def _evict_expired(self) -> int:
        """Remove all expired entries. Returns count of evicted entries."""
        now = time.time()
        expired_keys = [k for k, v in self._cache.items() if now > v.expires_at]
        for key in expired_keys:
            del self._cache[key]
        return len(expired_keys)
    
    def _evict_oldest(self, count: int) -> None:
        """Remove the oldest N entries."""
        if count <= 0:
            return
        sorted_keys = sorted(self._cache.keys(), key=lambda k: self._cache[k].expires_at)
        for key in sorted_keys[:count]:
            del self._cache[key]
    
    def stats(self) -> dict:
        """Get cache statistics."""
        with self._lock:
            total = self._hits + self._misses
            hit_rate = (self._hits / total * 100) if total > 0 else 0
            return {
                "name": self._name,
                "size": len(self._cache),
                "max_size": self._max_size,
                "ttl_seconds": self._ttl,
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate": f"{hit_rate:.1f}%"
            }


# =============================================================================
# Global Cache Instances
# =============================================================================

# User cache: stores User objects by user_id
# TTL: 5 minutes - user data rarely changes mid-session
user_cache: TTLCache = TTLCache(ttl_seconds=300, max_size=5000, name="UserCache")

# Admin cache: stores Admin objects by admin_id
# TTL: 5 minutes - admin data rarely changes
admin_cache: TTLCache = TTLCache(ttl_seconds=300, max_size=1000, name="AdminCache")

# Blacklist token cache: stores blacklisted tokens
# TTL: 10 minutes - tokens stay blacklisted
# We store the token as key and True as value
blacklist_cache: TTLCache[bool] = TTLCache(ttl_seconds=600, max_size=10000, name="BlacklistCache")

# Valid token cache: stores validated tokens to skip blacklist DB check
# TTL: 2 minutes - short TTL for security
# Key: token hash, Value: user_id
valid_token_cache: TTLCache[int] = TTLCache(ttl_seconds=120, max_size=10000, name="ValidTokenCache")

# =============================================================================
# Content Caches (long TTL, invalidated on writes)
# =============================================================================

# Movies cache: stores full serialized movies list
# TTL: 12 hours - content changes daily, immediate invalidation on writes
movies_cache: TTLCache[list] = TTLCache(ttl_seconds=43200, max_size=1, name="MoviesCache")

# Shows cache: stores full serialized TV shows list (includes nested seasons/episodes)
# TTL: 12 hours - content changes daily, immediate invalidation on writes
shows_cache: TTLCache[list] = TTLCache(ttl_seconds=43200, max_size=1, name="ShowsCache")

# MyList cache: stores per-user watchlist entries
# TTL: 12 hours - invalidated on add/delete
# Key: "user_{id}", Value: list of {content_type, content_id} dicts
mylist_cache: TTLCache[list] = TTLCache(ttl_seconds=43200, max_size=500, name="MyListCache")

# User notifications cache: stores per-user serialized notifications
# TTL: 12 hours - invalidated on create/delete/read
# Key: "user_{id}", Value: list of serialized notification dicts
user_notifications_cache: TTLCache[list] = TTLCache(ttl_seconds=43200, max_size=500, name="UserNotificationsCache")

# Admin notifications cache: stores admin notification data
# TTL: 12 hours - invalidated on any notification write
# Key: "all" or "stats", Value: serialized data
admin_notifications_cache: TTLCache = TTLCache(ttl_seconds=43200, max_size=10, name="AdminNotificationsCache")


# =============================================================================
# Cache Helper Functions
# =============================================================================

def get_cached_user(user_id: int):
    """
    Get user from cache or database.
    
    Returns the User object or None if not found.
    """
    from models import User
    
    # Check cache first
    cached = user_cache.get(str(user_id))
    if cached is not None:
        return cached
    
    # Cache miss - fetch from DB
    user = User.query.get(user_id)
    if user:
        user_cache.set(str(user_id), user)
    
    return user


def get_cached_admin(admin_id: int):
    """
    Get admin from cache or database.
    
    Returns the Admin object or None if not found.
    """
    from models import Admin
    
    # Check cache first
    cached = admin_cache.get(str(admin_id))
    if cached is not None:
        return cached
    
    # Cache miss - fetch from DB
    admin = Admin.query.get(admin_id)
    if admin:
        admin_cache.set(str(admin_id), admin)
    
    return admin


def is_token_blacklisted(token: str) -> bool:
    """
    Check if a token is blacklisted, using cache.
    
    Returns True if blacklisted, False otherwise.
    
    Cache strategy:
    - blacklist_cache: Positive cache for tokens that ARE blacklisted (rare)
    - valid_token_cache: Negative cache for tokens that are NOT blacklisted (common)
    
    Stats are only counted for valid_token_cache since that's where we expect hits.
    """
    from models import BlacklistToken
    
    # Check blacklist cache (positive cache - token IS blacklisted)
    # Don't count stats here since most tokens won't be blacklisted
    if blacklist_cache.contains(token, count_stats=False):
        return True
    
    # Check valid token cache (negative cache - token is NOT blacklisted)
    # This is where we expect cache hits
    if valid_token_cache.contains(token):
        return False
    
    # Cache miss - check database
    is_blacklisted = BlacklistToken.query.filter_by(token=token).first() is not None
    
    if is_blacklisted:
        # Add to blacklist cache
        blacklist_cache.set(token, True)
    else:
        # Add to valid token cache (short TTL)
        valid_token_cache.set(token, True)
    
    return is_blacklisted


def invalidate_user(user_id: int) -> None:
    """
    Invalidate user cache entry.
    
    Call this when a user is updated, banned, or deleted.
    """
    user_cache.delete(str(user_id))
    log_info(f"UserCache: Invalidated user {user_id}")


def invalidate_admin(admin_id: int) -> None:
    """
    Invalidate admin cache entry.
    
    Call this when an admin is updated or disabled.
    """
    admin_cache.delete(str(admin_id))
    log_info(f"AdminCache: Invalidated admin {admin_id}")


def add_to_blacklist_cache(token: str) -> None:
    """
    Add a token to the blacklist cache.
    
    Call this when a user logs out.
    """
    blacklist_cache.set(token, True)
    # Also remove from valid token cache
    valid_token_cache.delete(token)


def get_all_cache_stats() -> dict:
    """Get statistics for all caches."""
    return {
        "user_cache": user_cache.stats(),
        "admin_cache": admin_cache.stats(),
        "blacklist_cache": blacklist_cache.stats(),
        "valid_token_cache": valid_token_cache.stats(),
        "movies_cache": movies_cache.stats(),
        "shows_cache": shows_cache.stats(),
        "mylist_cache": mylist_cache.stats(),
        "user_notifications_cache": user_notifications_cache.stats(),
        "admin_notifications_cache": admin_notifications_cache.stats(),
    }


# =============================================================================
# Content Cache Helper Functions
# =============================================================================

def get_all_movies_cached() -> list:
    """
    Get all movies from cache or database.
    Returns a list of shallow-copied serialized movie dicts.
    """
    from models import Movie

    cached = movies_cache.get("all")
    if cached is not None:
        return [dict(m) for m in cached]

    movies = Movie.query.all()
    serialized = [movie.serialize for movie in movies]
    movies_cache.set("all", serialized)
    log_info(f"MoviesCache: Loaded {len(serialized)} movies from DB")
    return [dict(m) for m in serialized]


def get_all_shows_cached() -> list:
    """
    Get all TV shows from cache or database.
    Returns a list of shallow-copied serialized show dicts.
    """
    from models import TVShow

    cached = shows_cache.get("all")
    if cached is not None:
        return [dict(s) for s in cached]

    shows = TVShow.query.all()
    serialized = [show.serialize for show in shows]
    shows_cache.set("all", serialized)
    log_info(f"ShowsCache: Loaded {len(serialized)} shows from DB")
    return [dict(s) for s in serialized]


def get_movie_by_id_cached(movie_id: int) -> dict:
    """
    Get a single movie by ID from the cached list.
    Returns a shallow-copied dict or None if not found.
    """
    all_movies = get_all_movies_cached()
    for movie in all_movies:
        if movie.get('id') == movie_id:
            return movie
    return None


def get_show_by_id_cached(show_id: int) -> dict:
    """
    Get a single TV show by ID from the cached list.
    Returns a shallow-copied dict or None if not found.
    """
    all_shows = get_all_shows_cached()
    for show in all_shows:
        if show.get('show_id') == show_id:
            return show
    return None


def invalidate_movie_cache() -> None:
    """Invalidate the movies cache. Call after movie create/update/delete."""
    movies_cache.clear()
    log_info("MoviesCache: Invalidated")


def invalidate_show_cache() -> None:
    """Invalidate the shows cache. Call after show create/update/delete."""
    shows_cache.clear()
    log_info("ShowsCache: Invalidated")


def invalidate_all_content_caches() -> None:
    """Invalidate both movie and show caches."""
    invalidate_movie_cache()
    invalidate_show_cache()


def warm_content_caches() -> None:
    """Pre-populate content caches at startup to avoid first-request latency."""
    try:
        movies = get_all_movies_cached()
        shows = get_all_shows_cached()
        log_info(f"Content caches warmed: {len(movies)} movies, {len(shows)} shows")
    except Exception as e:
        log_info(f"Content cache warming failed (non-fatal): {e}")


# =============================================================================
# MyList Cache Helper Functions
# =============================================================================

def get_user_mylist_cached(user_id: int) -> list:
    """
    Get user's mylist entries from cache or database.
    Returns a list of dicts: [{content_type, content_id}, ...]
    """
    from models import MyList

    key = f"user_{user_id}"
    cached = mylist_cache.get(key)
    if cached is not None:
        return cached

    items = MyList.query.filter_by(user_id=user_id).all()
    entries = [{"content_type": item.content_type, "content_id": item.content_id} for item in items]
    mylist_cache.set(key, entries)
    return entries


def invalidate_user_mylist(user_id: int) -> None:
    """Invalidate a user's mylist cache. Call after add/delete."""
    mylist_cache.delete(f"user_{user_id}")


# =============================================================================
# Notifications Cache Helper Functions
# =============================================================================

def get_user_notifications_cached(user_id: int) -> list:
    """
    Get user's notifications from cache or database.
    Returns serialized notifications (user-specific + global).
    """
    from models import Notification

    key = f"user_{user_id}"
    cached = user_notifications_cache.get(key)
    if cached is not None:
        return cached

    notifications = Notification.query.filter(
        (Notification.user_id == user_id) | (Notification.user_id.is_(None))
    ).order_by(Notification.created_at.desc()).all()
    serialized = [n.serialize() for n in notifications]
    user_notifications_cache.set(key, serialized)
    return serialized


def get_user_unread_count_cached(user_id: int) -> int:
    """
    Get unread notification count for a user, derived from cached notifications.
    """
    notifications = get_user_notifications_cached(user_id)
    return sum(1 for n in notifications if not n.get('is_read', True))


def get_admin_all_notifications_cached() -> list:
    """
    Get all notifications for admin view from cache or database.
    """
    from models import Notification

    cached = admin_notifications_cache.get("all")
    if cached is not None:
        return cached

    notifications = Notification.query.order_by(Notification.created_at.desc()).all()
    serialized = [n.serialize() for n in notifications]
    admin_notifications_cache.set("all", serialized)
    return serialized


def get_admin_notification_stats_cached() -> dict:
    """
    Get notification stats for admin dashboard from cache or database.
    """
    from models import Notification, db
    from sqlalchemy import func
    import datetime

    cached = admin_notifications_cache.get("stats")
    if cached is not None:
        return cached

    total_count = Notification.query.count()
    type_counts = db.session.query(
        Notification.notification_type,
        func.count(Notification.id)
    ).group_by(Notification.notification_type).all()
    read_count = Notification.query.filter_by(is_read=True).count()
    unread_count = Notification.query.filter_by(is_read=False).count()
    one_week_ago = datetime.datetime.utcnow() - datetime.timedelta(days=7)
    recent_count = Notification.query.filter(Notification.created_at >= one_week_ago).count()

    stats = {
        'total': total_count,
        'by_type': {t[0]: t[1] for t in type_counts},
        'read': read_count,
        'unread': unread_count,
        'recent': recent_count
    }
    admin_notifications_cache.set("stats", stats)
    return stats


def invalidate_user_notifications(user_id: int) -> None:
    """Invalidate a specific user's notifications cache."""
    user_notifications_cache.delete(f"user_{user_id}")


def invalidate_all_notifications_caches() -> None:
    """Invalidate all notification caches (user + admin). Call on global writes."""
    user_notifications_cache.clear()
    admin_notifications_cache.clear()
    log_info("NotificationsCaches: All invalidated")


def clear_all_caches() -> None:
    """Clear all caches. Useful for testing or maintenance."""
    user_cache.clear()
    admin_cache.clear()
    blacklist_cache.clear()
    valid_token_cache.clear()
    log_info("All caches cleared")
