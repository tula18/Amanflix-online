from flask import Blueprint, request, jsonify
from models import db, Notification, User
from api.utils import token_required, admin_token_required
from sqlalchemy import func, desc
import datetime

notifications_bp = Blueprint('notifications_bp', __name__)

# Admin routes for managing notifications
@notifications_bp.route('/api/admin/notifications', methods=['POST'])
@admin_token_required('admin')
def create_notification(current_admin):
    data = request.json
    title = data.get('title')
    message = data.get('message')
    notification_type = data.get('type', 'system')
    user_id = data.get('user_id')  # Single user notification
    user_ids = data.get('user_ids', [])  # Multiple users notification
    link = data.get('link')
    
    if not title or not message:
        return jsonify({'message': 'Title and message are required'}), 400
    
    created_notifications = []
    
    # Single user notification
    if user_id:
        user = User.query.get(user_id)
        if not user:
            return jsonify({'message': 'User not found'}), 404
        
        notification = Notification(
            title=title,
            message=message,
            notification_type=notification_type,
            user_id=user_id,
            link=link,
            is_read=False,
            created_at=datetime.datetime.utcnow(),
            id=None  # Let the database assign the ID
        )
        
        db.session.add(notification)
        created_notifications.append(notification)
    
    # Multiple users notification
    elif user_ids:
        for uid in user_ids:
            user = User.query.get(uid)
            if not user:
                continue  # Skip invalid users
                
            notification = Notification(
                title=title,
                message=message,
                notification_type=notification_type,
                user_id=uid,
                link=link,
                is_read=False,
                created_at=datetime.datetime.utcnow(),
                id=None  # Let the database assign the ID
            )
            
            db.session.add(notification)
            created_notifications.append(notification)
    
    # Global notification
    else:
        notification = Notification(
            title=title,
            message=message,
            notification_type=notification_type,
            user_id=None,  # Global notification
            link=link,
            is_read=False,
            created_at=datetime.datetime.utcnow(),
            id=None  # Let the database assign the ID
        )
        
        db.session.add(notification)
        created_notifications.append(notification)
    
    db.session.commit()
    
    return jsonify({
        'message': f'Successfully created {len(created_notifications)} notification(s)',
        'notifications': [n.serialize() for n in created_notifications]
    }), 201

@notifications_bp.route('/api/admin/notifications', methods=['GET'])
@admin_token_required('admin')
def get_all_notifications(current_admin):
    notifications = Notification.query.order_by(Notification.created_at.desc()).all()
    return jsonify([n.serialize() for n in notifications]), 200

@notifications_bp.route('/api/admin/notifications/<int:notification_id>', methods=['DELETE'])
@admin_token_required('admin')
def delete_notification(current_admin, notification_id):
    notification = Notification.query.get(notification_id)
    if not notification:
        return jsonify({'message': 'Notification not found'}), 404
    
    db.session.delete(notification)
    db.session.commit()
    
    return jsonify({'message': 'Notification deleted successfully'}), 200

@notifications_bp.route('/api/admin/notifications/<int:notification_id>', methods=['PUT'])
@admin_token_required('admin')
def update_notification(current_admin, notification_id):
    notification = Notification.query.get(notification_id)
    if not notification:
        return jsonify({'message': 'Notification not found'}), 404
    
    data = request.json
    if 'title' in data:
        notification.title = data['title']
    if 'message' in data:
        notification.message = data['message']
    if 'type' in data:
        notification.notification_type = data['type']
    if 'link' in data:
        notification.link = data['link']
    
    db.session.commit()
    
    return jsonify({
        'message': 'Notification updated successfully',
        'notification': notification.serialize()
    }), 200

# Get notification stats for admin dashboard
@notifications_bp.route('/api/admin/notifications/stats', methods=['GET'])
@admin_token_required('moderator')
def get_notification_stats(current_admin):
    # Total count
    total_count = Notification.query.count()
    
    # Count by type
    type_counts = db.session.query(
        Notification.notification_type, 
        func.count(Notification.id)
    ).group_by(Notification.notification_type).all()
    
    # Count read/unread
    read_count = Notification.query.filter_by(is_read=True).count()
    unread_count = Notification.query.filter_by(is_read=False).count()
    
    # Recent activity (last 7 days)
    one_week_ago = datetime.datetime.utcnow() - datetime.timedelta(days=7)
    recent_count = Notification.query.filter(Notification.created_at >= one_week_ago).count()
    
    return jsonify({
        'total': total_count,
        'by_type': {t[0]: t[1] for t in type_counts},
        'read': read_count,
        'unread': unread_count,
        'recent': recent_count
    }), 200

# Filter notifications
@notifications_bp.route('/api/admin/notifications/filter', methods=['GET'])
@admin_token_required('moderator')
def filter_notifications(current_admin):
    notification_type = request.args.get('type')
    user_id = request.args.get('user_id')
    is_read = request.args.get('is_read')
    is_global = request.args.get('is_global', 'false')
    
    query = Notification.query
    
    if notification_type:
        query = query.filter_by(notification_type=notification_type)
    
    if user_id:
        query = query.filter_by(user_id=user_id)
    elif is_global.lower() == 'true':
        query = query.filter(Notification.user_id.is_(None))
        
    if is_read is not None:
        is_read_bool = is_read.lower() == 'true'
        query = query.filter_by(is_read=is_read_bool)
    
    notifications = query.order_by(Notification.created_at.desc()).all()
    return jsonify([n.serialize() for n in notifications]), 200

# Delete multiple notifications
@notifications_bp.route('/api/admin/notifications/bulk-delete', methods=['POST'])
@admin_token_required('admin')
def bulk_delete_notifications(current_admin):
    notification_ids = request.json.get('notification_ids', [])
    
    if not notification_ids:
        return jsonify({'message': 'No notification IDs provided'}), 400
    
    deleted_count = 0
    for notification_id in notification_ids:
        notification = Notification.query.get(notification_id)
        if notification:
            db.session.delete(notification)
            deleted_count += 1
    
    db.session.commit()
    
    return jsonify({
        'message': f'{deleted_count} notifications deleted successfully',
        'deleted_count': deleted_count
    }), 200

# Send notification to all users
@notifications_bp.route('/api/admin/notifications/broadcast', methods=['POST'])
@admin_token_required('admin')
def broadcast_notification(current_admin):
    data = request.json
    title = data.get('title')
    message = data.get('message')
    notification_type = data.get('type', 'system')
    link = data.get('link')
    
    if not title or not message:
        return jsonify({'message': 'Title and message are required'}), 400
    
    # Create a global notification (user_id is None)
    notification = Notification(
        title=title,
        message=message,
        notification_type=notification_type,
        user_id=None,
        link=link,
        is_read=False,
        created_at=datetime.datetime.utcnow(),
        id=None  # Let the database assign the ID
    )
    
    db.session.add(notification)
    db.session.commit()
    
    return jsonify({
        'message': 'Broadcast notification sent successfully',
        'notification': notification.serialize()
    }), 201

# User routes for viewing and managing notifications
@notifications_bp.route('/api/notifications', methods=['GET'])
@token_required
def get_user_notifications(current_user):
    # Get user-specific and global notifications
    notifications = Notification.query.filter(
        (Notification.user_id == current_user.id) | (Notification.user_id.is_(None))
    ).order_by(Notification.created_at.desc()).all()
    
    return jsonify([n.serialize() for n in notifications]), 200

@notifications_bp.route('/api/notifications/unread/count', methods=['GET'])
@token_required
def get_unread_count(current_user):
    # Count unread notifications for the current user
    count = Notification.query.filter(
        ((Notification.user_id == current_user.id) | (Notification.user_id.is_(None))) &
        (Notification.is_read == False)
    ).count()
    
    return jsonify({'unread_count': count}), 200

@notifications_bp.route('/api/notifications/<int:notification_id>/read', methods=['PUT'])
@token_required
def mark_notification_read(current_user, notification_id):
    notification = Notification.query.get(notification_id)
    if not notification:
        return jsonify({'message': 'Notification not found'}), 404
    
    # Make sure the notification belongs to this user or is global
    if notification.user_id and notification.user_id != current_user.id:
        return jsonify({'message': 'Unauthorized'}), 403
    
    notification.is_read = True
    db.session.commit()
    
    return jsonify({'message': 'Notification marked as read'}), 200

@notifications_bp.route('/api/notifications/read-all', methods=['PUT'])
@token_required
def mark_all_notifications_read(current_user):
    # Mark all user's notifications as read
    Notification.query.filter(
        ((Notification.user_id == current_user.id) | (Notification.user_id.is_(None))) &
        (Notification.is_read == False)
    ).update({Notification.is_read: True})
    
    db.session.commit()
    
    return jsonify({'message': 'All notifications marked as read'}), 200