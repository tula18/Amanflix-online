"""
Service Controller Module

This module manages the service status configuration for Amanflix.
It handles enabling/disabling the service, maintenance mode, and stores
configuration both in memory and in a JSON file for persistence.
"""

import json
import os
from datetime import datetime
from threading import Lock
from utils.logger import log_info, log_warning, log_success

# Path to the service config file
CONFIG_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config')
SERVICE_CONFIG_PATH = os.path.join(CONFIG_DIR, 'service_config.json')

# In-memory cache of service config
_service_config = None
_config_lock = Lock()

# Default configuration
DEFAULT_CONFIG = {
    "service_enabled": True,
    "maintenance_mode": False,
    "maintenance_message": "Amanflix is currently under maintenance. Please check back soon!",
    "maintenance_title": "Service Temporarily Unavailable",
    "estimated_downtime": None,
    "last_updated": None,
    "updated_by": None,
    "allow_admin_access": True
}


def _ensure_config_dir():
    """Ensure the config directory exists."""
    if not os.path.exists(CONFIG_DIR):
        os.makedirs(CONFIG_DIR)


def _load_config_from_file():
    """Load configuration from JSON file."""
    global _service_config
    
    _ensure_config_dir()
    
    if os.path.exists(SERVICE_CONFIG_PATH):
        try:
            with open(SERVICE_CONFIG_PATH, 'r', encoding='utf-8') as f:
                _service_config = json.load(f)
                log_info(f"Service config loaded from file: service_enabled={_service_config.get('service_enabled')}")
        except (json.JSONDecodeError, IOError) as e:
            log_warning(f"Failed to load service config from file: {e}. Using defaults.")
            _service_config = DEFAULT_CONFIG.copy()
    else:
        log_info("No service config file found. Creating with defaults.")
        _service_config = DEFAULT_CONFIG.copy()
        _save_config_to_file()
    
    return _service_config


def _save_config_to_file():
    """Save current configuration to JSON file."""
    global _service_config
    
    _ensure_config_dir()
    
    try:
        with open(SERVICE_CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(_service_config, f, indent=4)
        log_success("Service config saved to file")
        return True
    except IOError as e:
        log_warning(f"Failed to save service config to file: {e}")
        return False


def get_service_config():
    """
    Get the current service configuration.
    
    Returns:
        dict: Current service configuration
    """
    global _service_config
    
    with _config_lock:
        if _service_config is None:
            _load_config_from_file()
        return _service_config.copy()


def is_service_enabled():
    """
    Check if the service is enabled.
    
    Returns:
        bool: True if service is enabled, False otherwise
    """
    config = get_service_config()
    return config.get('service_enabled', True) and not config.get('maintenance_mode', False)


def is_maintenance_mode():
    """
    Check if maintenance mode is active.
    
    Returns:
        bool: True if maintenance mode is active, False otherwise
    """
    config = get_service_config()
    return config.get('maintenance_mode', False)


def should_allow_admin_access():
    """
    Check if admin access should be allowed when service is down.
    
    Returns:
        bool: True if admin access is allowed, False otherwise
    """
    config = get_service_config()
    return config.get('allow_admin_access', True)


def update_service_config(updates, updated_by=None):
    """
    Update the service configuration.
    
    Args:
        updates (dict): Dictionary of configuration updates
        updated_by (str): Username of admin making the update
        
    Returns:
        dict: Updated configuration
    """
    global _service_config
    
    with _config_lock:
        if _service_config is None:
            _load_config_from_file()
        
        # Update only allowed fields
        allowed_fields = [
            'service_enabled',
            'maintenance_mode',
            'maintenance_message',
            'maintenance_title',
            'estimated_downtime',
            'allow_admin_access'
        ]
        
        for field in allowed_fields:
            if field in updates:
                _service_config[field] = updates[field]
        
        # Update metadata
        _service_config['last_updated'] = datetime.now().isoformat()
        _service_config['updated_by'] = updated_by
        
        _save_config_to_file()
        
        log_info(f"Service config updated by {updated_by}: service_enabled={_service_config.get('service_enabled')}, maintenance_mode={_service_config.get('maintenance_mode')}")
        
        return _service_config.copy()


def enable_service(updated_by=None):
    """
    Enable the service.
    
    Args:
        updated_by (str): Username of admin enabling the service
        
    Returns:
        dict: Updated configuration
    """
    return update_service_config({
        'service_enabled': True,
        'maintenance_mode': False
    }, updated_by)


def disable_service(message=None, title=None, estimated_downtime=None, updated_by=None):
    """
    Disable the service.
    
    Args:
        message (str): Custom maintenance message
        title (str): Custom maintenance title
        estimated_downtime (str): Estimated downtime information
        updated_by (str): Username of admin disabling the service
        
    Returns:
        dict: Updated configuration
    """
    updates = {
        'service_enabled': False
    }
    
    if message:
        updates['maintenance_message'] = message
    if title:
        updates['maintenance_title'] = title
    if estimated_downtime:
        updates['estimated_downtime'] = estimated_downtime
    
    return update_service_config(updates, updated_by)


def enable_maintenance_mode(message=None, title=None, estimated_downtime=None, updated_by=None):
    """
    Enable maintenance mode.
    
    Args:
        message (str): Custom maintenance message
        title (str): Custom maintenance title
        estimated_downtime (str): Estimated downtime information
        updated_by (str): Username of admin enabling maintenance mode
        
    Returns:
        dict: Updated configuration
    """
    updates = {
        'maintenance_mode': True
    }
    
    if message:
        updates['maintenance_message'] = message
    if title:
        updates['maintenance_title'] = title
    if estimated_downtime:
        updates['estimated_downtime'] = estimated_downtime
    
    return update_service_config(updates, updated_by)


def disable_maintenance_mode(updated_by=None):
    """
    Disable maintenance mode.
    
    Args:
        updated_by (str): Username of admin disabling maintenance mode
        
    Returns:
        dict: Updated configuration
    """
    return update_service_config({
        'maintenance_mode': False,
        'estimated_downtime': None
    }, updated_by)


# Initialize config on module load
_load_config_from_file()
