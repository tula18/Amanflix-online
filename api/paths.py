import os
import json

# Load data_config.json if it exists, otherwise fall back to original relative paths
_config = {}
_config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config', 'data_config.json')

if os.path.exists(_config_path):
    with open(_config_path, 'r') as f:
        _config = json.load(f)

_raw_root = _config.get('data_root', '').replace('\\', os.sep)
if _raw_root:
    # Keep as relative path from api/ (data_root is relative to paths.py's directory)
    _api_dir = os.path.dirname(os.path.abspath(__file__))
    DATA_ROOT = os.path.normpath(os.path.join(_api_dir, _raw_root))
    DATA_ROOT = os.path.relpath(DATA_ROOT)
else:
    DATA_ROOT = ''

# Data directories - when DATA_ROOT is empty, these resolve to the original relative paths
UPLOADS_DIR = os.path.join(DATA_ROOT, 'uploads') if DATA_ROOT else 'uploads'
CDN_FILES_DIR = os.path.join(DATA_ROOT, 'files') if DATA_ROOT else 'cdn/files'
CDN_POSTERS_DIR = os.path.join(DATA_ROOT, 'posters_combined') if DATA_ROOT else 'cdn/posters_combined'
INSTANCE_DIR = os.path.join(DATA_ROOT, 'instance') if DATA_ROOT else 'instance'
BACKUPS_DIR = os.path.join(DATA_ROOT, 'backups') if DATA_ROOT else 'backups'
LOGS_DIR = os.path.join(DATA_ROOT, 'logs') if DATA_ROOT else 'logs'

# Database URI - SQLite requires an absolute path
if DATA_ROOT:
    _instance_abs = os.path.abspath(INSTANCE_DIR)
    os.makedirs(_instance_abs, exist_ok=True)
    DB_URI = f'sqlite:///{os.path.join(_instance_abs, "amanflix_db.db")}'
else:
    DB_URI = 'sqlite:///amanflix_db.db'
