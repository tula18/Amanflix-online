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
from models import db, Movie, TVShow, Season, Episode
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
if ffmpeg_status:
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

database_path = 'database'
bcrypt = Bcrypt(app)

log_step("Registering endpoints")
log_substep("CDN endpoints: movies, tv, search, cdn")
# CDN ENDPOINTS register
app.register_blueprint(movie_cdn_bp)
app.register_blueprint(tv_cdn_bp)
app.register_blueprint(search_cdn_bp)
app.register_blueprint(cdn_bp)

log_substep("API endpoints: auth, uploads, streams, etc.")
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
log_section_end()

# Content catalog loading with improved progress indicators
log_section("CONTENT CATALOG")
log_step("Loading content databases")

# Modify your existing load functions to use the new logging utilities
def load_movies_db():
    db_path = os.path.join(database_path, "movies.json")
    os.makedirs(database_path, exist_ok=True)
    if (os.path.exists(db_path)):
        try:
            with open(db_path, 'r') as f:
                log_success(f"Loaded movies database from {db_path}")
                return json.load(f)
        except json.decoder.JSONDecodeError:
            log_error("Movie database file corrupted, using empty database")
            return []
    else:
        log_warning(f"Movie database file not found, creating new database at {db_path}")
        return []

def save_movies_db(db):
    print(f"{Colors.YELLOW}Saving database{Colors.RESET}")
    db_path = os.path.join(database_path, "movies.json")
    with open(db_path, 'w') as f:
        json.dump(db, f)

def load_data(file_path, media_type):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    for item in tqdm(data, desc=f"Loading {media_type} data"):
        item['media_type'] = media_type
        item['dir_type'] = 'cdn'
    return data

def load_only_images_data(file_path, media_type):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    all_items = []
    for item in tqdm(data, desc=f"Loading {media_type} with images"):
        item['media_type'] = media_type
        poster_path = item.get('poster_path', '').replace("/", "")
        backdrop_path = item.get('backdrop_path', '').replace("/", "")
        if poster_path and os.path.exists(os.path.join('cdn/posters_combined', poster_path)) and backdrop_path and os.path.exists(os.path.join('cdn/posters_combined', backdrop_path)):
            all_items.append(item)
    return all_items

# Loading content with better progress display
movies = load_data('cdn/files/movies_little_clean.json', 'movie')
log_success(f"Movies catalog loaded: {Colors.BOLD}{len(movies):,}{Colors.RESET} titles")

tv_series = load_data('cdn/files/tv_little_clean.json', 'tv')
log_success(f"TV catalog loaded: {Colors.BOLD}{len(tv_series):,}{Colors.RESET} titles")

movies_with_images = load_data('cdn/files/movies_with_images.json', 'movie')
log_success(f"Movies with images loaded: {Colors.BOLD}{len(movies_with_images)}{Colors.RESET} titles")

tv_series_with_images = load_data('cdn/files/tv_with_images.json', 'tv')
log_success(f"TV shows with images loaded: {Colors.BOLD}{len(tv_series_with_images)}{Colors.RESET} titles")

movies_db = load_movies_db()

all_items = movies + tv_series
item_index = {item['id']: index for index, item in enumerate(all_items)}

all_items_with_images = movies_with_images + tv_series_with_images
item_index_with_images = {item['id']: index for index, item in enumerate(all_items)}

log_success(f"Created content index with {Colors.BOLD}{len(item_index)}{Colors.RESET} items")
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

# Create tables
with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
    # For production set host to machine ip
