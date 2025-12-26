"""
Service Control API Routes

This module provides API endpoints for superadmins to control
the service status (enable/disable service, maintenance mode).
"""

from flask import Blueprint, request, jsonify
from api.utils import admin_token_required
from api.service_controller import (
    get_service_config,
    update_service_config,
    enable_service,
    disable_service,
    enable_maintenance_mode,
    disable_maintenance_mode,
    is_service_enabled,
    is_maintenance_mode
)
from utils.logger import log_info, log_warning, log_success

service_control_bp = Blueprint('service_control_bp', __name__, url_prefix='/api/service')


@service_control_bp.route('/status', methods=['GET'])
def get_service_status():
    """
    Get the current service status.
    This endpoint is public so users can check if the service is available.
    
    Returns:
        JSON with service status information
    """
    config = get_service_config()
    
    return jsonify({
        'service_enabled': config.get('service_enabled', True),
        'maintenance_mode': config.get('maintenance_mode', False),
        'maintenance_message': config.get('maintenance_message'),
        'maintenance_title': config.get('maintenance_title'),
        'estimated_downtime': config.get('estimated_downtime'),
        'is_available': is_service_enabled()
    })


@service_control_bp.route('/config', methods=['GET'])
@admin_token_required('superadmin')
def get_full_config(current_admin):
    """
    Get the full service configuration (superadmin only).
    
    Returns:
        JSON with full service configuration
    """
    config = get_service_config()
    return jsonify(config)


@service_control_bp.route('/config', methods=['POST'])
@admin_token_required('superadmin')
def update_config(current_admin):
    """
    Update the service configuration (superadmin only).
    
    Expected form data:
        - service_enabled: bool (optional)
        - maintenance_mode: bool (optional)
        - maintenance_message: string (optional)
        - maintenance_title: string (optional)
        - estimated_downtime: string (optional)
        - allow_admin_access: bool (optional)
    
    Returns:
        JSON with updated configuration
    """
    data = request.form.to_dict()
    
    # Convert string booleans to actual booleans
    updates = {}
    
    if 'service_enabled' in data:
        updates['service_enabled'] = data['service_enabled'].lower() == 'true'
    
    if 'maintenance_mode' in data:
        updates['maintenance_mode'] = data['maintenance_mode'].lower() == 'true'
    
    if 'maintenance_message' in data:
        updates['maintenance_message'] = data['maintenance_message']
    
    if 'maintenance_title' in data:
        updates['maintenance_title'] = data['maintenance_title']
    
    if 'estimated_downtime' in data:
        updates['estimated_downtime'] = data['estimated_downtime'] if data['estimated_downtime'] else None
    
    if 'allow_admin_access' in data:
        updates['allow_admin_access'] = data['allow_admin_access'].lower() == 'true'
    
    if not updates:
        return jsonify({'message': 'No valid configuration updates provided'}), 400
    
    updated_config = update_service_config(updates, current_admin.username)
    
    log_success(f"Service config updated by superadmin {current_admin.username}")
    
    return jsonify({
        'message': 'Service configuration updated successfully',
        'config': updated_config
    })


@service_control_bp.route('/enable', methods=['POST'])
@admin_token_required('superadmin')
def enable_service_route(current_admin):
    """
    Enable the service (superadmin only).
    This will enable the service and disable maintenance mode.
    
    Returns:
        JSON with success message and updated configuration
    """
    config = enable_service(current_admin.username)
    
    log_success(f"Service enabled by superadmin {current_admin.username}")
    
    return jsonify({
        'message': 'Service has been enabled',
        'config': config
    })


@service_control_bp.route('/disable', methods=['POST'])
@admin_token_required('superadmin')
def disable_service_route(current_admin):
    """
    Disable the service (superadmin only).
    This will disable the service and automatically disable maintenance mode.
    
    Expected form data:
        - message: Custom maintenance message (optional)
        - title: Custom maintenance title (optional)
        - estimated_downtime: Estimated downtime info (optional)
    
    Returns:
        JSON with success message and updated configuration
    """
    data = request.form.to_dict()
    
    message = data.get('message')
    title = data.get('title')
    estimated_downtime = data.get('estimated_downtime')
    
    config = disable_service(
        message=message,
        title=title,
        estimated_downtime=estimated_downtime,
        updated_by=current_admin.username
    )
    
    log_warning(f"Service disabled by superadmin {current_admin.username}")
    
    return jsonify({
        'message': 'Service has been disabled',
        'config': config
    })


@service_control_bp.route('/maintenance/enable', methods=['POST'])
@admin_token_required('superadmin')
def enable_maintenance_route(current_admin):
    """
    Enable maintenance mode (superadmin only).
    This will enable the service (if not already enabled) and activate maintenance mode.
    
    Expected form data:
        - message: Custom maintenance message (optional)
        - title: Custom maintenance title (optional)
        - estimated_downtime: Estimated downtime info (optional)
    
    Returns:
        JSON with success message and updated configuration
    """
    data = request.form.to_dict()
    
    message = data.get('message')
    title = data.get('title')
    estimated_downtime = data.get('estimated_downtime')
    
    config = enable_maintenance_mode(
        message=message,
        title=title,
        estimated_downtime=estimated_downtime,
        updated_by=current_admin.username
    )
    
    log_warning(f"Maintenance mode enabled by superadmin {current_admin.username}")
    
    return jsonify({
        'message': 'Maintenance mode has been enabled',
        'config': config
    })


@service_control_bp.route('/maintenance/disable', methods=['POST'])
@admin_token_required('superadmin')
def disable_maintenance_route(current_admin):
    """
    Disable maintenance mode (superadmin only).
    
    Returns:
        JSON with success message and updated configuration
    """
    config = disable_maintenance_mode(current_admin.username)
    
    log_success(f"Maintenance mode disabled by superadmin {current_admin.username}")
    
    return jsonify({
        'message': 'Maintenance mode has been disabled',
        'config': config
    })
