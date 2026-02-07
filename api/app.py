from flask import Flask, jsonify, request
from flask_cors import CORS
import json
import os
import jwt
import platform
import sys
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_migrate import Migrate
from sqlalchemy import inspect, text
from models import db, Movie, TVShow, Season, Episode, Admin, User, WatchHistory, MyList, UploadRequest, BugReport, BlacklistToken, Notification, UserSession, UserActivity
from tqdm import tqdm
from api.utils import check_ffmpeg_available, setup_request_logging
# Import the logger functions instead of redefining them
from utils.logger import log_info, log_success, log_warning, log_error, log_section, log_section_end
from utils.logger import log_step, log_substep, log_data, Colors, log_fancy, log_banner, log_status

# CDN ENDPOINTS imports
from cdn.movies_cdn import movie_cdn_bp
from cdn.tv_cdn import tv_cdn_bp
from cdn.search_cdn import search_cdn_bp
from cdn.cdn import cdn_bp
from cdn.cdn_admin import cdn_admin_bp
from cdn.discovery_cdn import discovery_cdn_bp

# API ENDPOINTS
from api.routes.upload import upload_bp
from api.routes.stream import stream_bp
from api.routes.movies import movies_bp
from api.routes.shows import shows_bp
from api.routes.auth import auth_bp
from api.routes.admin import admin_bp
from api.routes.search import search_bp
from api.routes.bug_report import bug_bp
from api.routes.mylist import mylist_bp
from api.routes.upload_request import upload_request_bp
from api.routes.watch_history import watch_history_bp
from api.routes.notifications import notifications_bp
from api.routes.analytics import analytics_bp
from api.routes.file_parser import file_parser_bp
from api.routes.discovery import discovery_bp
from api.routes.service_control import service_control_bp

# Service controller for checking service status
from api.service_controller import (
    get_service_config,
    is_service_enabled,
    is_maintenance_mode,
    should_allow_admin_access
)

# Print server header with version and timestamp
timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
version = "1.0.0"  # You can define your app version here
header = f"\n{Colors.BOLD}{Colors.BLUE}╔{'═' * 70}╗{Colors.RESET}\n"
header += f"{Colors.BOLD}{Colors.BLUE}║{Colors.WHITE} AMANFLIX API SERVER {Colors.CYAN}v{version} {Colors.YELLOW}• {Colors.WHITE}{timestamp}{' ' * (45 - len(version) - len(timestamp))}{Colors.BOLD}{Colors.BLUE}║{Colors.RESET}\n"
header += f"{Colors.BOLD}{Colors.BLUE}╚{'═' * 70}╝{Colors.RESET}\n"
log_fancy(header)

# Print AMANFLIX ASCII banner with improved styling
banner = f"""
{Colors.RED}╔═══════════════════════════════════════════════════════════════════╗
║{Colors.CYAN}{Colors.BOLD}                                                                 {Colors.RED}  ║
║{Colors.CYAN}{Colors.BOLD}  █████╗ ███╗   ███╗ █████╗ ███╗   ██╗███████╗██╗     ██╗██╗  ██╗{Colors.RED}  ║
║{Colors.CYAN}{Colors.BOLD} ██╔══██╗████╗ ████║██╔══██╗████╗  ██║██╔════╝██║     ██║╚██╗██╔╝{Colors.RED}  ║
║{Colors.CYAN}{Colors.BOLD} ███████║██╔████╔██║███████║██╔██╗ ██║█████╗  ██║     ██║ ╚███╔╝ {Colors.RED}  ║
║{Colors.CYAN}{Colors.BOLD} ██╔══██║██║╚██╔╝██║██╔══██║██║╚██╗██║██╔══╝  ██║     ██║ ██╔██╗ {Colors.RED}  ║
║{Colors.CYAN}{Colors.BOLD} ██║  ██║██║ ╚═╝ ██║██║  ██║██║ ╚████║██║     ███████╗██║██╔╝ ██╗{Colors.RED}  ║
║{Colors.CYAN}{Colors.BOLD} ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝     ╚══════╝╚═╝╚═╝  ╚═╝{Colors.RED}  ║
║{Colors.CYAN}{Colors.BOLD}                                                                 {Colors.RED}  ║
║{' ' * 21}{Colors.YELLOW}Your Ultimate Streaming Platform{Colors.RED}{' ' * 12}  ║
╚═══════════════════════════════════════════════════════════════════╝{Colors.RESET}
"""
log_fancy(banner)

# System information with improved formatting
log_section("SYSTEM INFORMATION")
log_data("Time", datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
log_data("OS", f"{platform.system()} {platform.release()}")
log_data("Python", sys.version.split()[0])
log_data("Working Directory", os.getcwd())
log_section_end()

log_section("INITIALIZING SERVICES")
# Check FFMPEG availability with enhanced visual indicators
ffmpeg_status = check_ffmpeg_available()
box_width = 52
if (ffmpeg_status):
    print(f"\n{Colors.GREEN}┌{'─' * box_width}┐")
    print(f"│ ✓ FFMPEG DETECTED AND AVAILABLE{' ' * (box_width - 32)}│")
    print(f"│ {Colors.WHITE}All streaming features will be fully functional{Colors.GREEN}{' ' * (box_width - 48)}│")
    print(f"└{'─' * box_width}┘{Colors.RESET}\n")
    log_success("FFMPEG is ready for media processing")
else:
    print(f"\n{Colors.RED}┌{'─' * box_width}┐")
    print(f"│ ✗ FFMPEG NOT DETECTED{' ' * (box_width - 22)}│")
    print(f"│ {Colors.YELLOW}⚠ WARNING: Streaming functionality will be limited{Colors.RED}{' ' * (box_width - 51)}│")
    print(f"│ {Colors.WHITE}Install FFMPEG to enable all streaming features{Colors.RED}{' ' * (box_width - 48)}│")
    print(f"└{'─' * box_width}┘{Colors.RESET}\n")
    log_warning("Limited functionality: FFMPEG not available")
log_section_end()

# Flask application initialization with section header
log_section("FLASK APPLICATION")
log_step("Initializing Flask app")
app = Flask(__name__)
CORS(app)
app = setup_request_logging(app)

log_step("Configuring database")
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///amanflix_db.db'
db.init_app(app)
migrate = Migrate(app, db)

bcrypt = Bcrypt(app)

# Endpoints that should always be accessible even when service is down
ALWAYS_ACCESSIBLE_ENDPOINTS = [
    '/api/service/',      # Service status endpoints
    '/api/admin/login',   # Admin login
    '/api/admin/verify',  # Admin verification
    '/api/admin/logout',  # Admin logout
    '/api/admin/profile', # Admin profile
    '/ip',                # IP endpoint
]

# Endpoint prefixes for admin-only routes (accessible when service is down if admin access is allowed)
ADMIN_ENDPOINT_PREFIXES = [
    '/api/admin/',
]

@app.before_request
def check_service_status():
    """
    Check if the service is enabled before processing each request.
    
    - Admin endpoints remain accessible if allow_admin_access is True
    - Service status endpoint is always accessible
    - All other endpoints return 503 when service is disabled
    """
    path = request.path
    
    # Always allow certain endpoints
    for endpoint in ALWAYS_ACCESSIBLE_ENDPOINTS:
        if path.startswith(endpoint):
            return None
    
    # Check if service is enabled
    if is_service_enabled():
        return None
    
    # Service is down - check if this is an admin endpoint
    if should_allow_admin_access():
        for prefix in ADMIN_ENDPOINT_PREFIXES:
            if path.startswith(prefix):
                return None
    
    # Service is down and this is not an allowed endpoint
    config = get_service_config()
    return jsonify({
        'error': 'service_unavailable',
        'message': config.get('maintenance_message', 'Service is temporarily unavailable'),
        'title': config.get('maintenance_title', 'Service Down'),
        'estimated_downtime': config.get('estimated_downtime'),
        'maintenance_mode': config.get('maintenance_mode', False)
    }), 503

# Add session cleanup handler to prevent session poisoning
@app.teardown_request
def cleanup_session(exception=None):
    """
    Clean up database session after each request.
    
    This prevents 'database is locked' errors from poisoning subsequent requests
    by ensuring each request starts with a clean session state.
    """
    if exception:
        try:
            db.session.rollback()
        except Exception:
            pass
    try:
        db.session.remove()
    except Exception:
        pass

log_step("Registering endpoints")
log_substep("CDN endpoints: movies, tv, search, cdn, admin, discovery")
# CDN ENDPOINTS register
app.register_blueprint(movie_cdn_bp)
app.register_blueprint(tv_cdn_bp)
app.register_blueprint(search_cdn_bp)
app.register_blueprint(cdn_bp)
app.register_blueprint(cdn_admin_bp)
app.register_blueprint(discovery_cdn_bp)

log_substep("API endpoints: upload, stream, movies, shows, auth, admin, search, bug reports, mylist, upload requests, watch history, notifications, analytics, file parser, discovery")
# API ENDPOINTS register
app.register_blueprint(upload_bp)
app.register_blueprint(stream_bp)
app.register_blueprint(movies_bp)
app.register_blueprint(shows_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(search_bp)
app.register_blueprint(bug_bp)
app.register_blueprint(mylist_bp)
app.register_blueprint(upload_request_bp)
app.register_blueprint(watch_history_bp)
app.register_blueprint(notifications_bp)
app.register_blueprint(analytics_bp)
app.register_blueprint(file_parser_bp)
app.register_blueprint(discovery_bp)
app.register_blueprint(service_control_bp)
log_substep("Service control endpoints registered")
log_section_end()

# Content catalog loading with improved progress indicators
log_section("CONTENT CATALOG")

def check_cdn_structure():
    """Check if all required CDN directories and files exist."""
    required_dirs = ['cdn/files', 'cdn/posters_combined']
    required_files = [
        'cdn/files/movies_little_clean.json',
        'cdn/files/tv_little_clean.json', 
        'cdn/files/movies_with_images.json',
        'cdn/files/tv_with_images.json'
    ]
    
    missing_dirs = []
    missing_files = []
    
    # Check directories
    for dir_path in required_dirs:
        if not os.path.exists(dir_path):
            missing_dirs.append(dir_path)
    
    # Check files (only if directories exist)
    if not missing_dirs:
        for file_path in required_files:
            if not os.path.exists(file_path):
                missing_files.append(file_path)
    
    return missing_dirs, missing_files

def exit_with_cdn_error(missing_dirs, missing_files):
    """Exit the application with a clear error message about missing CDN structure."""
    print(f"\n{Colors.RED}┌{'─' * 70}┐")
    print(f"│{Colors.BOLD} ❌ CRITICAL ERROR: Required CDN structure is missing{Colors.RED}{' ' * 17}│")
    print(f"└{'─' * 70}┘{Colors.RESET}")
    print(f"\n{Colors.RED}The application cannot start without the required CDN directories and files.{Colors.RESET}")
    
    if missing_dirs:
        print(f"\n{Colors.YELLOW}Missing directories:{Colors.RESET}")
        for dir_path in missing_dirs:
            print(f"  ❌ {dir_path}")
    
    if missing_files:
        print(f"\n{Colors.YELLOW}Missing files:{Colors.RESET}")
        for file_path in missing_files:
            print(f"  ❌ {file_path}")
    
    print(f"\n{Colors.CYAN}To fix this issue:{Colors.RESET}")
    print(f"1. Create the missing directories manually")
    print(f"2. Add the JSON files")
    print(f"3. Or run the setup script: setup.bat (Windows) or setup.sh (Linux/macOS)")
    print(f"\n{Colors.RED}Application terminated.{Colors.RESET}\n")
    sys.exit(1)

# Check CDN structure before proceeding
log_step("Verifying CDN structure")
missing_dirs, missing_files = check_cdn_structure()

if missing_dirs or missing_files:
    exit_with_cdn_error(missing_dirs, missing_files)

log_success("CDN structure verified successfully")
log_step("Loading content databases")

def load_data(file_path, media_type):
    """
    Load data from JSON file and clean unwanted fields.
    This function ensures that any watch_history or other unwanted fields
    are removed from the data when loaded from disk.
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Clean unwanted fields and add required metadata
        cleaned_count = 0
        for item in tqdm(data, desc=f"Loading and cleaning {media_type} data"):
            # Remove unwanted fields that shouldn't be in the main data files
            fields_to_remove = ['watch_history', 'user_specific_data']
            fields_removed = False
            
            for field in fields_to_remove:
                if field in item:
                    del item[field]
                    fields_removed = True
                    
            if fields_removed:
                cleaned_count += 1
            
            # Add required metadata
            item['media_type'] = media_type
            item['dir_type'] = 'cdn'
        
        if cleaned_count > 0:
            log_warning(f"Cleaned {cleaned_count} items with unwanted fields from {file_path}")
            
        return data
    except FileNotFoundError:
        log_warning(f"File not found: {file_path} - returning empty list")
        return []
    except json.JSONDecodeError as e:
        log_warning(f"Invalid JSON in {file_path}: {e} - returning empty list")
        return []
    except Exception as e:
        log_warning(f"Error loading {file_path}: {e} - returning empty list")
        return []

def load_only_images_data(file_path, media_type):
    """
    Load data with images from JSON file and clean unwanted fields.
    This function ensures that any watch_history or other unwanted fields
    are removed from the data when loaded from disk.
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        all_items = []
        cleaned_count = 0
        
        for item in tqdm(data, desc=f"Loading {media_type} with images"):
            # Remove unwanted fields that shouldn't be in the main data files
            fields_to_remove = ['watch_history', 'user_specific_data']
            fields_removed = False
            
            for field in fields_to_remove:
                if field in item:
                    del item[field]
                    fields_removed = True
                    
            if fields_removed:
                cleaned_count += 1
            
            # Add required metadata
            item['media_type'] = media_type
            
            # Check if images exist
            poster_path = item.get('poster_path', '').replace("/", "")
            backdrop_path = item.get('backdrop_path', '').replace("/", "")
            if poster_path and os.path.exists(os.path.join('cdn/posters_combined', poster_path)) and backdrop_path and os.path.exists(os.path.join('cdn/posters_combined', backdrop_path)):
                all_items.append(item)
        
        if cleaned_count > 0:
            log_warning(f"Cleaned {cleaned_count} items with unwanted fields from {file_path}")
            
        return all_items
    except FileNotFoundError:
        log_warning(f"File not found: {file_path} - returning empty list")
        return []
    except json.JSONDecodeError as e:
        log_warning(f"Invalid JSON in {file_path}: {e} - returning empty list")
        return []
    except Exception as e:
        log_warning(f"Error loading {file_path}: {e} - returning empty list")
        return []

# Loading content with better progress display
movies = load_data('cdn/files/movies_little_clean.json', 'movie')
log_success(f"Movies catalog loaded: {Colors.BOLD}{len(movies):,}{Colors.RESET} titles")

tv_series = load_data('cdn/files/tv_little_clean.json', 'tv')
log_success(f"TV catalog loaded: {Colors.BOLD}{len(tv_series):,}{Colors.RESET} titles")

movies_with_images = load_data('cdn/files/movies_with_images.json', 'movie')
log_success(f"Movies with images loaded: {Colors.BOLD}{len(movies_with_images)}{Colors.RESET} titles")

tv_series_with_images = load_data('cdn/files/tv_with_images.json', 'tv')
log_success(f"TV shows with images loaded: {Colors.BOLD}{len(tv_series_with_images)}{Colors.RESET} titles")

all_items = movies + tv_series
item_index = {item['id']: index for index, item in enumerate(all_items)}

all_items_with_images = movies_with_images + tv_series_with_images
item_index_with_images = {item['id']: index for index, item in enumerate(all_items)}

log_success(f"Created content index with {Colors.BOLD}{len(item_index)}{Colors.RESET} items")

def rebuild_content_indexes():
    """Rebuild the search indexes after content data changes."""
    global all_items, item_index, all_items_with_images, item_index_with_images
    
    # Clear data helpers cache when content is updated
    try:
        from utils.data_helpers import clear_data_cache
        clear_data_cache()
    except ImportError:
        pass  # data_helpers might not be available during initial setup
    
    # Rebuild all_items and its index
    all_items = movies + tv_series
    item_index = {item['id']: index for index, item in enumerate(all_items)}
    
    # Rebuild all_items_with_images and its index
    all_items_with_images = movies_with_images + tv_series_with_images
    item_index_with_images = {item['id']: index for index, item in enumerate(all_items_with_images)}
    
    print(f"Rebuilt content indexes: {len(all_items)} total items, {len(all_items_with_images)} with images")

log_section_end()

progresses = {}

# Final startup success message with current time and border
current_time = datetime.now().strftime('%H:%M:%S')
print(f"\n{Colors.BOLD}{Colors.GREEN}┌{'─' * 52}┐")
print(f"│ ✅ AMANFLIX API READY AT {current_time}{' ' * (26 - len(current_time))}│")
print(f"└{'─' * 52}┘{Colors.RESET}")
print(f"{Colors.BOLD}{Colors.CYAN}{'─' * 70}{Colors.RESET}\n")

@app.route('/ip')
def get_ip():
    # Access the client's IP address
    client_ip = request.remote_addr
    return jsonify(ip=client_ip)

# Handler for 400 Bad Request
@app.errorhandler(400)
def bad_request_error(error):
    return jsonify(error='Oops! Something is not right with your request. Please check and try again.', error_reason = "bad_requet"), 400

# Handler for 401 Unauthorized
@app.errorhandler(401)
def unauthorized_error(error):
    return jsonify(error='Sorry, you need to log in to access this.', error_reason = "unauthorized"), 401

# Handler for 403 Forbidden
@app.errorhandler(403)
def forbidden_error(error):
    return jsonify(error="Access Denied. You don't have permission for this action.", error_reason = "forbidden"), 403

# Handler for 404 Not Found
@app.errorhandler(404)
def not_found_error(error):
    return jsonify(error="The page you're looking for seems to have vanished into thin air.", error_reason = "not_found"), 404

# Handler for 500 Internal Server Error
# @app.errorhandler(500)
# def internal_server_error(error):
#     print(error)
#     return jsonify(error='Our servers are sweating! We\'re working to fix this.', error_reason = "internal_server"), 500

# Handler for 503 Service Unavailable
@app.errorhandler(503)
def service_unavailable_error(error):
    return jsonify(error='We\'re temporarily unavailable. Please try again later.', error_reason = "service_unavailable"), 503

# @app.errorhandler(Exception)  # Catching all exceptions
# def handle_exception(error):
#     return jsonify(error=str(error)), 500


def check_database_schema():
    """
    Check if the database schema matches the SQLAlchemy models.
    Returns a tuple (is_valid, errors_list)
    """
    errors = []
    
    try:
        inspector = inspect(db.engine)
        existing_tables = inspector.get_table_names()
        
        # Get all model classes from imported models
        models_to_check = [Movie, TVShow, Season, Episode, Admin, User, WatchHistory, MyList, UploadRequest, BugReport, BlacklistToken, Notification, UserSession, UserActivity]
        
        log_step("Checking database schema against models")
        
        for model in models_to_check:
            table_name = model.__tablename__
            
            # Check if table exists
            if table_name not in existing_tables:
                errors.append(f"Table '{table_name}' does not exist in database but is defined in models")
                continue
            
            # Get columns from database
            db_columns = {col['name']: col for col in inspector.get_columns(table_name)}
            
            # Get columns from model
            model_columns = {}
            for column_name, column_obj in model.__table__.columns.items():
                model_columns[column_name] = column_obj
            
            # Check for missing columns in database
            for col_name, col_obj in model_columns.items():
                if col_name not in db_columns:
                    col_type = str(col_obj.type)
                    nullable = "NULL" if col_obj.nullable else "NOT NULL"
                    errors.append(
                        f"Column '{table_name}.{col_name}' ({col_type}, {nullable}) "
                        f"exists in model but not in database"
                    )
            
            # Check for extra columns in database (optional warning)
            for col_name in db_columns:
                if col_name not in model_columns:
                    log_warning(f"Column '{table_name}.{col_name}' exists in database but not in model (may be OK)")
        
        return len(errors) == 0, errors
        
    except Exception as e:
        return False, [f"Error during schema validation: {str(e)}"]


if __name__ == '__main__':
    # Create tables
    with app.app_context():
        db.create_all()
    
    # Validate database schema
    log_section("DATABASE SCHEMA VALIDATION")
    with app.app_context():
        schema_valid, schema_errors = check_database_schema()
        
        if not schema_valid:
            log_error("Database schema is out of sync with models!")
            log_banner("MIGRATION REQUIRED", "Database schema does not match model definitions", "error")
            
            print(f"\n{Colors.RED}┌{'─' * 70}┐")
            print(f"│{Colors.BOLD} ❌ CRITICAL ERROR: Database migration required{Colors.RED}{' ' * 25}│")
            print(f"└{'─' * 70}┘{Colors.RESET}")
            
            print(f"\n{Colors.YELLOW}Schema Issues Detected:{Colors.RESET}")
            for i, error in enumerate(schema_errors, 1):
                print(f"{Colors.RED}  {i}. {error}{Colors.RESET}")
            
            # Generate migration message based on errors
            missing_columns = []
            missing_tables = []
            table_column_map = {}
            column_tables_map = {}  # Map columns to tables they're being added to
            
            for error in schema_errors:
                if "Column" in error and "exists in model but not in database" in error:
                    # Extract table.column from error message
                    parts = error.split("'")
                    if len(parts) >= 2:
                        table_col = parts[1]
                        table, column = table_col.split('.')
                        if table not in table_column_map:
                            table_column_map[table] = []
                        table_column_map[table].append(column)
                        
                        # Also map column to tables for grouping
                        if column not in column_tables_map:
                            column_tables_map[column] = []
                        column_tables_map[column].append(table)
                        
                        missing_columns.append(table_col)
                elif "Table" in error and "does not exist" in error:
                    parts = error.split("'")
                    if len(parts) >= 2:
                        missing_tables.append(parts[1])
            
            # Build migration message
            migration_msg_parts = []
            
            if missing_tables:
                table_names = [t.capitalize() for t in missing_tables]
                if len(table_names) == 1:
                    migration_msg_parts.append(f"Create {table_names[0]} table")
                else:
                    migration_msg_parts.append(f"Create {', '.join(table_names[:-1])} and {table_names[-1]} tables")
            
            # Group columns by which tables they're being added to
            if column_tables_map:
                processed_columns = set()
                for column, tables in column_tables_map.items():
                    if column in processed_columns:
                        continue
                    
                    # Capitalize table names properly
                    table_names = []
                    for t in tables:
                        if t == 'tvshow':
                            table_names.append('TVShow')
                        elif t == 'user_activity':
                            table_names.append('UserActivity')
                        elif t == 'user_session':
                            table_names.append('UserSession')
                        else:
                            table_names.append(t.capitalize())
                    
                    # Format the table list
                    if len(table_names) == 1:
                        table_str = table_names[0]
                    else:
                        table_str = ', '.join(table_names[:-1]) + f" and {table_names[-1]}"
                    
                    migration_msg_parts.append(f"Add {column} to {table_str}")
                    processed_columns.add(column)
            
            suggested_message = " and ".join(migration_msg_parts) if migration_msg_parts else "Update database schema"
            
            # Display suggested migration message
            print(f"\n{Colors.GREEN}{Colors.BOLD}📋 Suggested Migration Message:{Colors.RESET}")
            print(f"{Colors.CYAN}{Colors.BOLD}{suggested_message}{Colors.RESET}\n")
            
            print(f"\n{Colors.CYAN}To fix this issue:{Colors.RESET}")
            print(f"1. Run: {Colors.YELLOW}python create_superadmin.py{Colors.RESET}")
            print(f"2. Select option: {Colors.YELLOW}15{Colors.RESET} (Database Migration Management)")
            
            # Check if migrations directory exists
            migrations_dir = os.path.join(os.getcwd(), 'migrations')
            if not os.path.exists(migrations_dir):
                print(f"3. Select option: {Colors.YELLOW}1{Colors.RESET} (Initialize Migration Repository)")
                print(f"4. Then select: {Colors.YELLOW}2{Colors.RESET} (Generate New Migration)")
                print(f"5. When prompted for message, paste: {Colors.CYAN}{suggested_message}{Colors.RESET}")
                print(f"6. Finally select: {Colors.YELLOW}3{Colors.RESET} (Apply Migrations)")
            else:
                print(f"3. Select option: {Colors.YELLOW}2{Colors.RESET} (Generate New Migration)")
                print(f"4. When prompted for message, paste: {Colors.CYAN}{suggested_message}{Colors.RESET}")
                print(f"5. Then select: {Colors.YELLOW}3{Colors.RESET} (Apply Migrations)")
            
            print(f"6. Restart the application")
            print(f"\n{Colors.RED}Application terminated.{Colors.RESET}\n")
            
            log_error("Application terminated due to schema mismatch")
            log_section_end()
            sys.exit(1)
        else:
            log_success("Database schema validation passed - all models match database")
            log_section_end()

    # Check for superadmin after database initialization
    log_section("SUPERADMIN VERIFICATION")
    with app.app_context():
        superadmin = Admin.query.filter_by(role='superadmin').first()
        
        if not superadmin:
            log_error("No superadmin found in the database!")
            log_banner("CRITICAL: NO SUPERADMIN DETECTED", "Application cannot start without a superadmin account", "error")
            
            print(f"{Colors.RED}┌{'─' * 70}┐")
            print(f"│{Colors.BOLD} ❌ CRITICAL ERROR: No superadmin account found{Colors.RED}{' ' * 23}│")
            print(f"└{'─' * 70}┘{Colors.RESET}")
            print(f"\n{Colors.RED}The application requires at least one superadmin account to function properly.{Colors.RESET}")
            print(f"\n{Colors.CYAN}To create a superadmin account:{Colors.RESET}")
            print(f"1. Run: {Colors.YELLOW}python create_superadmin.py{Colors.RESET}")
            print(f"2. Follow the prompts to create your superadmin account")
            print(f"3. Restart the application")
            print(f"\n{Colors.RED}Application terminated.{Colors.RESET}\n")
            
            log_error("Application terminated due to missing superadmin account")
            log_section_end()
            sys.exit(1)
        else:
            log_success(f"Superadmin verification passed: {Colors.BOLD}{superadmin.username}{Colors.RESET}")
            log_section_end()
    
    app.run(debug=False, host='0.0.0.0', port=5001, threaded=True)
    # For production set host to machine ip
