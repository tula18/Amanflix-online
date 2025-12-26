"""
Database utility functions for safe operations with SQLite.

This module provides:
- Retry decorator for handling transient "database is locked" errors
- Safe commit/rollback helpers
- Context managers for database operations

These utilities help prevent SQLite locking issues in concurrent environments,
especially when the database is hosted on a network shared folder.
"""

import time
import functools
from typing import Callable, TypeVar, Any
from sqlite3 import OperationalError
from sqlalchemy.exc import OperationalError as SQLAlchemyOperationalError
from utils.logger import log_warning, log_error, log_info

# Type variable for generic function return types
T = TypeVar('T')

# =============================================================================
# Configuration
# =============================================================================

# Maximum number of retry attempts for database operations
DB_MAX_RETRIES = 3

# Base delay between retries (seconds) - uses exponential backoff
DB_RETRY_BASE_DELAY = 0.1

# Maximum delay between retries (seconds)
DB_RETRY_MAX_DELAY = 1.0


# =============================================================================
# Retry Decorator
# =============================================================================

def db_retry(max_retries: int = DB_MAX_RETRIES, base_delay: float = DB_RETRY_BASE_DELAY):
    """
    Decorator that retries a function on SQLite "database is locked" errors.
    
    Uses exponential backoff between retries. Always performs a rollback
    before retrying to ensure a clean session state.
    
    Args:
        max_retries: Maximum number of retry attempts (default: 3)
        base_delay: Base delay in seconds for exponential backoff (default: 0.1)
    
    Usage:
        @db_retry()
        def update_watch_history(user_id, data):
            # ... database operations ...
            db.session.commit()
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> T:
            from models import db
            
            last_exception = None
            
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                    
                except (OperationalError, SQLAlchemyOperationalError) as e:
                    error_str = str(e).lower()
                    
                    # Only retry on "database is locked" errors
                    if "database is locked" not in error_str and "locked" not in error_str:
                        raise
                    
                    last_exception = e
                    
                    # Don't retry if we've exhausted attempts
                    if attempt >= max_retries:
                        log_error(f"DB operation failed after {max_retries + 1} attempts: {func.__name__}")
                        break
                    
                    # Calculate delay with exponential backoff
                    delay = min(base_delay * (2 ** attempt), DB_RETRY_MAX_DELAY)
                    
                    log_warning(
                        f"Database locked in {func.__name__}, "
                        f"attempt {attempt + 1}/{max_retries + 1}, "
                        f"retrying in {delay:.2f}s"
                    )
                    
                    # Rollback before retry to ensure clean session
                    try:
                        db.session.rollback()
                    except Exception as rollback_error:
                        log_error(f"Rollback failed: {rollback_error}")
                    
                    time.sleep(delay)
                    
                except Exception as e:
                    # For non-locking errors, rollback and re-raise
                    try:
                        db.session.rollback()
                    except Exception:
                        pass
                    raise
            
            # If we get here, all retries failed
            if last_exception:
                raise last_exception
            
        return wrapper
    return decorator


# =============================================================================
# Safe Commit Helper
# =============================================================================

def safe_commit() -> bool:
    """
    Safely commit the current database session with retry logic.
    
    Returns:
        True if commit succeeded, False if all retries failed.
    
    Usage:
        db.session.add(new_record)
        if not safe_commit():
            return jsonify({'error': 'Database error'}), 500
    """
    from models import db
    
    for attempt in range(DB_MAX_RETRIES + 1):
        try:
            db.session.commit()
            return True
            
        except (OperationalError, SQLAlchemyOperationalError) as e:
            error_str = str(e).lower()
            
            if "database is locked" not in error_str and "locked" not in error_str:
                log_error(f"Database error (non-locking): {e}")
                db.session.rollback()
                return False
            
            if attempt >= DB_MAX_RETRIES:
                log_error(f"safe_commit failed after {DB_MAX_RETRIES + 1} attempts")
                db.session.rollback()
                return False
            
            delay = min(DB_RETRY_BASE_DELAY * (2 ** attempt), DB_RETRY_MAX_DELAY)
            log_warning(f"Database locked during commit, attempt {attempt + 1}, retrying in {delay:.2f}s")
            
            try:
                db.session.rollback()
            except Exception:
                pass
            
            time.sleep(delay)
            
        except Exception as e:
            log_error(f"Unexpected error during commit: {e}")
            try:
                db.session.rollback()
            except Exception:
                pass
            return False
    
    return False


def safe_rollback() -> None:
    """
    Safely rollback the current database session.
    
    Silently handles any errors during rollback.
    """
    from models import db
    
    try:
        db.session.rollback()
    except Exception as e:
        log_error(f"Error during rollback: {e}")


# =============================================================================
# Context Manager for DB Operations
# =============================================================================

class db_operation:
    """
    Context manager for database operations with automatic rollback on error.
    
    Usage:
        with db_operation():
            user = User(name="test")
            db.session.add(user)
            # Automatically commits on success, rolls back on error
    
    Or with manual commit control:
        with db_operation(auto_commit=False) as op:
            user = User(name="test")
            db.session.add(user)
            op.commit()  # Manual commit with retry logic
    """
    
    def __init__(self, auto_commit: bool = True):
        self.auto_commit = auto_commit
        self._committed = False
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        from models import db
        
        if exc_type is not None:
            # An exception occurred - rollback
            safe_rollback()
            return False  # Re-raise the exception
        
        if self.auto_commit and not self._committed:
            # Auto-commit mode - commit the transaction
            if not safe_commit():
                safe_rollback()
                raise RuntimeError("Database commit failed after retries")
        
        return False
    
    def commit(self) -> bool:
        """
        Manually commit the transaction with retry logic.
        
        Returns True if successful, False otherwise.
        """
        self._committed = True
        return safe_commit()
    
    def rollback(self) -> None:
        """Manually rollback the transaction."""
        safe_rollback()


# =============================================================================
# Utility Functions
# =============================================================================

def ensure_session_clean() -> None:
    """
    Ensure the database session is in a clean state.
    
    Call this at the start of a request or operation to ensure
    no stale transaction state from previous operations.
    """
    from models import db
    
    try:
        # Check if session has uncommitted changes
        if db.session.new or db.session.dirty or db.session.deleted:
            log_warning("Session had uncommitted changes, rolling back")
            db.session.rollback()
    except Exception as e:
        log_error(f"Error checking session state: {e}")
        try:
            db.session.rollback()
        except Exception:
            pass
