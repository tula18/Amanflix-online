import datetime
from flask import Blueprint, request, jsonify, abort, current_app
from cdn.utils import paginate
from api.utils import generate_admin_token, role_hierarchy, admin_token_required
from models import Admin, db, User, BlacklistToken, BugReport, UploadRequest
from utils.logger import log_info, log_success, log_warning, log_error
import os
import json
import csv
from io import StringIO
from werkzeug.utils import secure_filename
from base64 import b85encode
import hashlib

admin_bp = Blueprint('admin_bp', __name__, url_prefix='/api/admin')

@admin_bp.route('/create', methods=['POST'])
@admin_token_required('admin')
def create_admin(current_admin):
    from app import bcrypt
    data = request.form.to_dict()
    username = data.get('username')
    password = data.get('password')
    email = data.get('email')

    role_to_create = role = data.get('role', 'moderator')

    if role not in role_hierarchy:
        return jsonify({'message': 'Invalid role'}), 400

    if username == '' or password == '' or email == '' or role_to_create == '':
        return {'message': 'password or username are blank'}, 400

    # Check if the user already exists in the database
    existing_admin_by_username = Admin.query.filter_by(username=data['username']).first()
    existing_admin_by_email = Admin.query.filter_by(email=data['email']).first()

    if existing_admin_by_username or existing_admin_by_email:
        return {'message': 'User already exists'}, 400
        

    if role_hierarchy[current_admin.role] <= role_hierarchy[role_to_create]:
        return jsonify({'message': f'You can only create roles below your role. Your role: {current_admin.role}, Selected role: {role}'}), 403

    hashed_password = bcrypt.generate_password_hash(data['password']).decode('utf-8')
    new_admin = Admin(username=data['username'], email=data['email'], password=hashed_password, role=role_to_create)

    db.session.add(new_admin)
    db.session.commit()

    api_key = generate_admin_token(new_admin.id, role_to_create)
    return jsonify({'message': f'{role_to_create} Admin registered successfully!', 'api_key': api_key})

@admin_bp.route('/login', methods=['POST'])
def admin_login():
    from app import bcrypt
    data = request.form.to_dict()

    username = data.get('username')
    password = data.get('password')

    if not username or not password or username == '' or password == '':
        log_warning("Admin login attempt with missing credentials")
        return {'message': 'Both username and password are required'}, 400

    admin = Admin.query.filter_by(username=username).first()

    if not admin or not bcrypt.check_password_hash(admin.password, data['password']):
        log_warning(f"Failed admin login attempt for username: {username}")
        return jsonify({'message': 'Login failed! Check your credentials.'}), 401

    # Check if admin account is disabled
    if admin.disabled:
        log_warning(f"Disabled admin attempted login: {username}")
        return jsonify({'message': 'Your admin account has been disabled. Please contact a superadmin.'}), 403

    token = generate_admin_token(admin.id, admin.role)
    log_success(f"Admin login successful: {username} ({admin.role})")

    # Check if token is blacklisted
    blacklisted_token = BlacklistToken.query.filter_by(token=token).first()

    if blacklisted_token:
        # Token is blacklisted, so delete it and generate a new one
        db.session.delete(blacklisted_token)
        db.session.commit()
    else:
        new_token = token

    return jsonify({'api_key': token, 'role': admin.role, 'username': admin.username})

@admin_bp.route('/logout', methods=['POST'])
@admin_token_required('moderator')
def logout(current_admin):
    token = request.headers.get('Authorization').split(" ")[1]
    blacklist_token = BlacklistToken(token=token)
    try:
        db.session.add(blacklist_token)
        db.session.commit()
        return jsonify({'message': 'Successfully logged out.'})

    except:
        return jsonify({'message': 'Failed to blacklist the token.'}), 500

@admin_bp.route('/verify', methods=['POST'])
@admin_token_required('moderator')
def verify(current_admin):
    return jsonify({'valid': True, 'role': current_admin.role})

@admin_bp.route('/profile', methods=['GET'])
@admin_token_required('moderator')
def profile(current_admin):
    return jsonify(current_admin.serialize())

@admin_bp.route('/update', methods=['POST'])
@admin_token_required("moderator")
def update_self_admin(current_admin):
    data = request.form.to_dict()
    newUsername = data.get('username')
    newEmail = data.get('email')
    newPassword = data.get('newPassword')

    message = "Profile updated successfully!"
    

    if current_admin:
        # Check for new username existence
        if newUsername and current_admin.username != newUsername:
            username_exists = User.query.filter_by(username=newUsername).first() is not None
            if username_exists:
                return {'message': 'Username already exists'}, 400

        # Check for new email existence
        if newEmail and current_admin.email != newEmail:
            email_exists = User.query.filter_by(email=newEmail).first() is not None
            if email_exists:
                return {'message': 'Email already in use'}, 400

    # Check if password is provided and update if so
    if 'password' in data:
        if not data['password'] or data['password'] == '':
            return jsonify({'message': 'Current Password cannot be blank'}), 400
        if newPassword:
            if not newPassword or newPassword == '':
                return jsonify({'message': 'New Password cannot be blank'}), 400
        else:
            return jsonify({'message': 'Please include your New password'}), 400
        from app import bcrypt

        if not current_admin or not bcrypt.check_password_hash(current_admin.password, data['password']):
            return jsonify({'message': 'Check your credentials.'}), 401
        hashed_password = bcrypt.generate_password_hash(data['newPassword']).decode('utf-8')
        current_admin.password = hashed_password
        message = 'Profile and password updated successfully!'

    # Update other fields
    current_admin.username = data.get('username', current_admin.username)
    current_admin.email = data.get('email', current_admin.email)

    db.session.commit()

    return jsonify({'message': message, 'username': current_admin.username, 'email': current_admin.email})

@admin_bp.route('/admin', methods=['POST'])
@admin_token_required('admin')
def get_admin(current_admin):
    admin_id = request.form.get('admin_id')

    if not admin_id or admin_id == '':
        return jsonify({'message': 'Please provide a User ID to delete'}), 400

    wanted_user = Admin.query.get(admin_id)

    if not wanted_user:
        return jsonify({'message': f'The Requested user: {admin_id} not found'}), 400

    return jsonify(wanted_user.serialize())

@admin_bp.route('/update/<int:admin_id>', methods=['POST'])
@admin_token_required('admin')
def update_admin(current_admin, admin_id):
    data = request.form.to_dict()
    newUsername = request.form.get('username')
    newEmail = request.form.get('email')
    newPassword = request.form.get('newPassword')
    newRole = request.form.get('newRole')

    admin = Admin.query.get(admin_id)
    pwd_message = ""
    role_message = ""

    if not admin:
        return jsonify({'message': f'The Admin ID: {admin_id} not found'}), 404
    
    changes = []
    if admin.username != data.get('username', admin.username):
        changes.append('Username')
    if admin.email != data.get('email', admin.email):
        changes.append('Email')
    if data.get('newPassword'):
        changes.append('Password')
    if role_hierarchy[current_admin.role] > role_hierarchy[admin.role] and data.get('newRole'):
        changes.append('Role')

    if not changes:
        return jsonify({'message': 'No changes made'}), 200

    if role_hierarchy[current_admin.role] <= role_hierarchy[admin.role]:
        return jsonify({'message': 'Insufficient permissions to update this role.'}), 403

    if newUsername and admin.username != newUsername:
        username_exists = Admin.query.filter_by(username=newUsername).first() is not None
        if username_exists:
            return {'message': 'Username already exists'}, 400
        if not newUsername.strip():
            return jsonify({'message': "New Username cannot be blank!"}), 400

    if newEmail and admin.email != newEmail:
        email_exists = Admin.query.filter_by(email=newEmail).first() is not None
        if email_exists:
            return {'message': 'Email already in use'}, 400
        if not newEmail.strip():
            return jsonify({'message': "New Email cannot be blank!"}), 400

    if newPassword:
        if newPassword:
            if not newPassword or newPassword == '':
                return jsonify({'message': 'New Password cannot be blank'}), 400
        else:
            return jsonify({'message': 'Please include your New password'}), 400
        
        from app import bcrypt

        hashed_password = bcrypt.generate_password_hash(newPassword).decode('utf-8')
        admin.password = hashed_password
        pwd_message = "and password "

    
    if newRole:
        if newRole not in role_hierarchy:
            return jsonify({'message': 'Invalid role selected.'}), 400
        admin.role = data.get('newRole', admin.role)
        role_message = "and role "
        
    admin.username = data.get('username', admin.username)
    admin.email = data.get('email', admin.email)
    
    db.session.commit()

    return jsonify({'message': f"{admin.username}'s Profile {pwd_message}{role_message}updated successfully!", 'username': admin.username, 'email': admin.email, 'role': admin.role})

@admin_bp.route('/delete/<int:admin_id>', methods=['DELETE'])
@admin_token_required('admin')
def delete_admin(current_admin, admin_id):
    from app import bcrypt

    data = request.form.to_dict()
    password = request.form.get('password')
    admin_to_delete = Admin.query.get(admin_id)
    if not password or password == '':
        return jsonify({'message': 'Please provide a password'}), 400

    if not current_admin or not bcrypt.check_password_hash(current_admin.password, data.get('password')):
            return jsonify({'message': 'Password incorrect! Check your credentials.'}), 401
    
    if admin_to_delete.id == current_admin.id:
        db.session.delete(current_admin)
        db.session.commit()
        return jsonify({'message': 'Your account has been deleted successfully.'})

    if not admin_to_delete:
        return jsonify({'message': 'Admin not found.'}), 404

    if role_hierarchy[current_admin.role] <= role_hierarchy[admin_to_delete.role]:
        return jsonify({'message': 'Insufficient permissions to delete this role.'}), 403

    db.session.delete(admin_to_delete)
    db.session.commit()
    return jsonify({'message': f'Admin {admin_to_delete.username} deleted successfully.'})

@admin_bp.route('/disable/<int:admin_id>', methods=['POST'])
@admin_token_required('superadmin')
def disable_admin(current_admin, admin_id):
    admin_to_disable = Admin.query.get(admin_id)
    
    if not admin_to_disable:
        return jsonify({'message': f'Admin with ID {admin_id} not found'}), 404
    
    # Only superadmins can disable other admins
    if current_admin.role != 'superadmin':
        return jsonify({'message': 'Only superadmins can disable admin accounts.'}), 403
    
    # Prevent disabling self
    if current_admin.id == admin_id:
        return jsonify({'message': 'You cannot disable your own account.'}), 400
    
    # Check if admin is already disabled
    if admin_to_disable.disabled:
        return jsonify({'message': f'Admin {admin_to_disable.username} is already disabled.'}), 400
    
    # Safety check: prevent disabling the last active superadmin
    if admin_to_disable.role == 'superadmin':
        active_superadmins = Admin.query.filter_by(role='superadmin', disabled=False).count()
        if active_superadmins <= 1:
            return jsonify({'message': 'Cannot disable the last active superadmin account.'}), 400
    
    admin_to_disable.disabled = True
    db.session.commit()
    
    log_warning(f"Admin {admin_to_disable.username} ({admin_to_disable.role}) disabled by superadmin {current_admin.username}")
    return jsonify({'message': f'Admin {admin_to_disable.username} has been disabled successfully.'})

@admin_bp.route('/enable/<int:admin_id>', methods=['POST'])
@admin_token_required('superadmin')
def enable_admin(current_admin, admin_id):
    admin_to_enable = Admin.query.get(admin_id)
    
    if not admin_to_enable:
        return jsonify({'message': f'Admin with ID {admin_id} not found'}), 404
    
    # Only superadmins can enable other admins
    if current_admin.role != 'superadmin':
        return jsonify({'message': 'Only superadmins can enable admin accounts.'}), 403
    
    # Check if admin is already enabled
    if not admin_to_enable.disabled:
        return jsonify({'message': f'Admin {admin_to_enable.username} is already enabled.'}), 400
    
    admin_to_enable.disabled = False
    db.session.commit()
    
    log_success(f"Admin {admin_to_enable.username} ({admin_to_enable.role}) enabled by superadmin {current_admin.username}")
    return jsonify({'message': f'Admin {admin_to_enable.username} has been enabled successfully.'})

@admin_bp.route('/list', methods=['GET'])
@admin_token_required('moderator')
def list_admins(current_admin):
    admins = Admin.query.filter(Admin.role.in_(role for role, level in role_hierarchy.items() if level < role_hierarchy[current_admin.role])).all()
    return jsonify([admin.serialize() for admin in admins])

@admin_bp.route('/user/list')
@admin_token_required('admin')
def get_users(current_admin):
    users = User.query.all()
    return jsonify([user.serialize() for user in users])

@admin_bp.route('/user/ban', methods=['POST'])
@admin_token_required('admin')
def ban_user(current_admin):
    data = request.form.to_dict()
    user_id = data.get('user_id')
    reason = data.get('reason', 'No reason provided')
    duration = data.get('duration', None)


    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    user.is_banned = True
    user.ban_reason = reason
    if duration:
        user.ban_until = datetime.datetime.utcnow() + datetime.timedelta(hours=int(duration))
    else:
        user.ban_until = None

    db.session.commit()

    return jsonify({'message': f'User {user.username} has been banned'})

@admin_bp.route('/user/unban', methods=['POST'])
@admin_token_required('admin')
def unban_user(current_admin):
    data = request.form.to_dict()
    user_id = data.get('user_id')

    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    user.is_banned = False
    user.ban_reason = None
    user.ban_until = None

    db.session.commit()

    return jsonify({'message': f'User {user.username} has been unbanned'})

@admin_bp.route('/user/delete', methods=['DELETE'])
@admin_token_required('admin')
def delete_user(current_admin):
    from app import bcrypt
    user_id = request.form.get('user_id')
    password = request.form.get('password')

    if not password or password == '':
        return jsonify({'message': 'Please provide a password'}), 400

    if not user_id or user_id == '':
        return jsonify({'message': 'Please provide a User ID to delete'}), 400

    if not bcrypt.check_password_hash(current_admin.password, password):
        return jsonify({'message': 'Password incorrect! Check your credentials.'}), 401

    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404
    
    username = user.username  # Store username before deletion
    
    try:
        # For SQLite databases, CASCADE DELETE might not work properly
        # So we manually delete related records first
        
        # Delete watch history records
        from models import WatchHistory, MyList
        db.session.query(WatchHistory).filter(WatchHistory.user_id == user_id).delete()
        
        # Delete MyList records (watchlist)
        db.session.query(MyList).filter(MyList.user_id == user_id).delete()
        
        # Bug reports and upload requests should be handled by cascade since they use backref
        # But we can be explicit if needed
        
        # Now delete the user
        db.session.delete(user)
        db.session.commit()
        
        log_success(f"Admin {current_admin.username} deleted user {username} (ID: {user_id})")
        return jsonify({'message': f'The account {username} has been deleted successfully.'})
    except Exception as e:
        db.session.rollback()
        log_error(f"Failed to delete user {username} (ID: {user_id}): {str(e)}")
        return jsonify({'message': f'Failed to delete user: {str(e)}'}), 500

@admin_bp.route('/user', methods=['POST'])
@admin_token_required('admin')
def get_user(current_admin):
    user_id = request.form.get('user_id')

    if not user_id or user_id == '':
        return jsonify({'message': 'Please provide a User ID to delete'}), 400

    current_user = User.query.get(user_id)

    if not current_user:
        return jsonify({'message': f'The Requested user: {user_id} not found'}), 400

    return jsonify(current_user.serialize())

@admin_bp.route('/user/update', methods=['POST'])
@admin_token_required('admin')
def update_user(current_admin):
    from app import bcrypt
    user_id = request.form.get('user_id')
    newUsername = request.form.get('username')
    newEmail = request.form.get('email')
    newPassword = request.form.get('newPassword')

    if not user_id or user_id == '':
        return jsonify({'message': 'Please provide a User ID to delete'}), 400

    current_user = User.query.get(user_id)

    if not current_user:
        return jsonify({'message': f'The User ID: {user_id} not found'}), 400

    message = f"{current_user.username}'s Profile updated successfully!"

    # Check for new username existence
    if newUsername and current_user.username != newUsername:
        username_exists = User.query.filter_by(username=newUsername).first() is not None
        if username_exists:
            return {'message': 'Username already exists'}, 400

    # Check for new email existence
    if newEmail and current_user.email != newEmail:
        email_exists = User.query.filter_by(email=newEmail).first() is not None
        if email_exists:
            return {'message': 'Email already in use'}, 400

    if not newUsername or not newUsername.strip():
        return jsonify({'message': "New Username cannot be blank!"}), 400

    if not newEmail or not newEmail.strip():
        return jsonify({'message': "New Email cannot be blank!"}), 400

    if newPassword:
        if newPassword:
            if not newPassword or newPassword == '':
                return jsonify({'message': 'New Password cannot be blank'}), 400
        else:
            return jsonify({'message': 'Please include your New password'}), 400
        from app import bcrypt
        hashed_password = bcrypt.generate_password_hash(newPassword).decode('utf-8')
        current_user.password = hashed_password
        message = f"{current_user.username}'s Profile and password updated successfully!"

    # Update other fields
    current_user.username = request.form.get('username', current_user.username)
    current_user.email = request.form.get('email', current_user.email)

    db.session.commit()


    return jsonify({'message': message, 'username': current_user.username, 'email': current_user.email})

@admin_bp.route('/bugs', methods=['GET'])
@admin_token_required('moderator')
def list_bugs(current_admin):
    reports = BugReport.query.all()

    all_reports = [{'id': report.id, 'title': report.title, 'description': report.description, 'created_at': report.created_at, 'reporter': User.query.filter_by(id=report.reporter_id).first().username, 'resolved': report.resolved} for report in reports]
    return jsonify(all_reports), 200

@admin_bp.route('/bugs/<int:bug_id>', methods=['DELETE'])
@admin_token_required('moderator')
def delete_bug(current_admin, bug_id):
    report = BugReport.query.filter_by(id=bug_id).first()
    if not report:
        return jsonify({'message': 'Bug report not found'}), 404
    
    db.session.delete(report)
    db.session.commit()

    return jsonify({'message': 'Bug report deleted'}), 200

@admin_bp.route('/bugs/<int:bug_id>/resolve', methods=['POST'])
@admin_token_required('moderator')
def resolve_bug(current_admin, bug_id):
    report = BugReport.query.filter_by(id=bug_id).first()
    if not report:
        log_warning(f"Attempt to resolve non-existent bug ID: {bug_id}")
        return jsonify({'message': 'Bug report not found'}), 404

    report.resolved = True
    db.session.commit()
    log_success(f"Bug #{bug_id} resolved by admin: {current_admin.username}")
    
    return jsonify({'message': 'Bug report marked as resolved'}), 200

@admin_bp.route('/bugs/<int:bug_id>/reopen', methods=['POST'])
@admin_token_required('moderator')
def reopen_bug(current_admin, bug_id):
    report = BugReport.query.filter_by(id=bug_id).first()
    if not report:
        return jsonify({'message': 'Bug report not found'}), 404

    report.resolved = False
    db.session.commit()

    return jsonify({'message': 'Bug report reopened'}), 200

@admin_bp.route('/unresolved_count', methods=['GET'])
@admin_token_required('moderator')
def unresolved_count(current_admin):
    unresolved_reports = BugReport.query.filter_by(resolved=False).all()
    count = len(unresolved_reports)

    return jsonify({'unresolved_count': count}), 200

@admin_bp.route('/uploadRequests_count', methods=['GET'])
@admin_token_required('moderator')
def uploadRequests_count(current_admin):
    unresolved_requests = UploadRequest.query.all()
    count = len(unresolved_requests)

    return jsonify({'uploadRequests_count': count}), 200

@admin_bp.route('/uploadRequests', methods=['GET'])
@admin_token_required('moderator')
def get_all_uploadRequests(current_admin):
    from utils.data_helpers import get_tv_shows, get_movies
    temp_tv_series = get_tv_shows()
    temp_movies = get_movies()
    uploadRequest_items = UploadRequest.query.all()
    with_duplicates = request.args.get('with_duplicates', 'false').lower() == 'true'

    titles = []

    #add with dulicates
    for title in uploadRequest_items:
        requests_count = len(UploadRequest.query.filter_by(content_id=title.content_id).all())
        if title.content_type == 'movie':
            movie = next((item for item in temp_movies if item["id"] == title.content_id), None)
            if movie:
                new_data = {
                    'id': title.id,
                    'title_id': movie['id'],
                    'imdb_id': movie.get('imdb_id', None),  # Use get() with default value
                    'media_type': movie.get('media_type', 'movie'),
                    'release_date': movie.get('release_date', None),
                    'title': movie.get('title', 'Unknown Title'),
                    'backdrop_path': movie.get('backdrop_path', None),
                    'username': User.query.filter_by(id=title.user_id).first().username,
                    'count': requests_count
                }
                # Rest of the code remains the same
                if with_duplicates:
                    titles.append(new_data)
                else:
                    # Check if the title already exists in the list
                    found = False
                    for existing_title in titles:
                        if existing_title['title_id'] == new_data['title_id']:
                            found = True
                            break
                    if not found:
                        titles.append(new_data)
        elif title.content_type == 'tv':
            tv = next((item for item in temp_tv_series if item["id"] == title.content_id), None)
            if tv:
                new_data = {
                    'id': title.id,
                    'title_id': tv['id'],
                    'imdb_id': tv.get('imdb_id', None),  # Using get() with default value
                    'media_type': tv.get('media_type', 'tv'),
                    'release_date': tv.get('first_air_date', None),  # TV shows use first_air_date
                    'title': tv.get('name', 'Unknown Show'),  # TV shows use name, not title
                    'backdrop_path': tv.get('backdrop_path', None),
                    'username': User.query.filter_by(id=title.user_id).first().username,
                    'count': requests_count
                }
                # Rest of the code remains the same
                if with_duplicates:
                    titles.append(new_data)
                else:
                    # Check if the title already exists in the list
                    found = False
                    for existing_title in titles:
                        if existing_title['title_id'] == new_data['title_id']:
                            found = True
                            break
                    if not found:
                        titles.append(new_data)

    return jsonify(titles), 200

@admin_bp.route('/uploadRequest/delete/<int:request_id>', methods=['DELETE'])
@admin_token_required('admin')
def delete_upload_request(current_admin, request_id):
    upload_request = UploadRequest.query.get(request_id)

    if not upload_request:
        return jsonify({'message': 'Upload request not found'}), 404

    db.session.delete(upload_request)
    db.session.commit()

    return jsonify({'message': 'Upload request deleted successfully'}), 200

@admin_bp.route('/import/cdn_data', methods=['POST'])
@admin_token_required('admin')
def import_cdn_data(current_admin):
    try:
        log_info(f"CDN import started by admin: {current_admin.username} ({current_admin.id})")
        
        # Check if the request contains file(s)
        log_info(f"Request files: {list(request.files.keys())}")
        log_info(f"Form data: {request.form}")
        
        if 'data_file' not in request.files and not any(key.startswith('image_') for key in request.files):
            log_warning("No files provided in the request")
            return jsonify({'success': False, 'message': 'No files provided'}), 400

        # Get merge option
        merge_content = request.form.get('merge', 'true').lower() == 'true'
        log_info(f"Merge content option: {merge_content}")
        
        # First collect all data but wait to process it
        content_data = None
        movies_data = []
        tv_data = []
        image_files = []
        
        # 1. FIRST PROCESS IMAGES - so they're available when checking existence
        for key in request.files:
            if key.startswith('image_'):
                image_files.append(request.files[key])
        
        log_info(f"Image files to process: {len(image_files)}")
        saved_filenames = []
        
        if image_files:
            # Get the path to the posters_combined directory
            posters_dir = os.path.join('cdn', 'posters_combined')
            log_info(f"Posters directory: {posters_dir}")
            
            if not os.path.exists(posters_dir):
                log_info(f"Creating posters directory: {posters_dir}")
                os.makedirs(posters_dir)
            
            # Process and save each image
            saved_images = 0
            for image_file in image_files:
                if image_file.filename == '':
                    log_warning("Empty filename in image file, skipping")
                    continue
                
                # Save the image file
                filename = secure_filename(image_file.filename)
                file_path = os.path.join(posters_dir, filename)
                log_info(f"Saving image: {filename} to {file_path}")
                try:
                    image_file.save(file_path)
                    saved_images += 1
                    saved_filenames.append(filename)
                except Exception as e:
                    log_error(f"Error saving image {filename}: {str(e)}")
            
            log_info(f"Saved {saved_images} images")
        
        # 2. THEN PROCESS JSON/CSV DATA (after images are already saved)
        if 'data_file' in request.files:
            data_file = request.files['data_file']
            log_info(f"Processing data file: {data_file.filename}, mimetype: {data_file.mimetype}")
            
            if data_file.filename == '':
                log_warning("Empty filename provided for data file")
                return jsonify({'success': False, 'message': 'No data file selected'}), 400
            
            # Process the data file
            if data_file.filename.endswith('.json'):
                log_info("Processing as JSON file")
                file_content = data_file.read()
                log_info(f"File content size: {len(file_content)} bytes")
                try:
                    content_data = json.loads(file_content.decode('utf-8'))
                    log_info(f"JSON parsed successfully. Items: {len(content_data)}")
                except Exception as e:
                    try:
                        # If that fails, try to decode the file content using utf-8-sig
                        content_data = json.loads(file_content.decode('utf-8-sig'))
                        log_info(f"JSON parsed successfully with utf-8-sig. Items: {len(content_data)}")
                    except Exception as e:
                        log_error(f"JSON parsing error: {str(e)}")
                        return jsonify({'success': False, 'message': f'Error parsing JSON: {str(e)}'}), 400
            elif data_file.filename.endswith('.csv'):
                log_info("Processing as CSV file")
                csv_data = data_file.read().decode('utf-8')
                log_info(f"CSV content size: {len(csv_data)} bytes")
                try:
                    content_data = convert_csv_to_json(csv_data)
                    log_info(f"CSV converted to JSON. Items: {len(content_data)}")
                except Exception as e:
                    log_error(f"CSV conversion error: {str(e)}")
                    return jsonify({'success': False, 'message': f'Error converting CSV: {str(e)}'}), 400
            else:
                log_warning(f"Unsupported file format: {data_file.filename}")
                return jsonify({'success': False, 'message': 'Unsupported file format. Supported formats: JSON, CSV (TXT files are converted to JSON in frontend)'}), 400
            
            # Sort content into movies and TV shows
            log_info("Sorting content by media type")
            
            for i, item in enumerate(content_data):
                media_type = item.get('media_type')
                if media_type == 'movie':
                    movies_data.append(item)
                elif media_type == 'tv':
                    tv_data.append(item)
                else:
                    log_warning(f"Unknown media_type in item {i}: {media_type}")
            
            log_info(f"Sorted content - Movies: {len(movies_data)}, TV Shows: {len(tv_data)}")
            
            # Update the CDN files
            from utils.data_helpers import get_movies, get_tv_shows, get_movies_with_images, get_tv_shows_with_images
            temp_movies = get_movies(clean=False)
            temp_tv_series = get_tv_shows(clean=False)
            temp_movies_with_images = get_movies_with_images(clean=False)
            temp_tv_series_with_images = get_tv_shows_with_images(clean=False)
            log_info(f"Current content - Movies: {len(temp_movies)}, TV Shows: {len(temp_tv_series)}")
            
            # Update the normal content files
            if merge_content:
                log_info("Merging with existing content")
                # Merge with existing content
                update_cdn_content('movies', movies_data, temp_movies, merge=True)
                update_cdn_content('tv', tv_data, temp_tv_series, merge=True)
            else:
                log_info("Replacing existing content")
                # Replace existing content
                update_cdn_content('movies', movies_data, temp_movies, merge=False)
                update_cdn_content('tv', tv_data, temp_tv_series, merge=False)
                
            # Update the with_images files for the imported items only
            log_info("Updating with_images files for imported content")
            update_with_images_content('movies', movies_data, temp_movies_with_images)
            update_with_images_content('tv', tv_data, temp_tv_series_with_images)
        
        # For items that may have been associated with newly uploaded images
        # but weren't in the JSON file - look for them separately
        if saved_filenames:
            log_info("Updating with_images data for newly saved images")
            update_with_images_for_new_files(saved_filenames)
        
        log_success(f"CDN import completed successfully by {current_admin.username}")
        return jsonify({'success': True, 'message': 'Content imported successfully'}), 200
    
    except Exception as e:
        error_message = f"Error importing CDN data: {str(e)}"
        log_error(error_message)
        import traceback
        log_error(f"Traceback: {traceback.format_exc()}")
        return jsonify({'success': False, 'message': error_message}), 500

@admin_bp.route('/read_files_as_hex', methods=['POST'])
@admin_token_required('moderator')
def read_files_as_hex(current_admin):
    try:
        data = request.get_json()
        if data is None:
            return jsonify({'error': 'Invalid request'}), 400
        zip_data = bytes(data['zip_data'])

        base85_string = b85encode(zip_data).decode('utf-8')
        checksum = hashlib.md5(zip_data).hexdigest()

        return jsonify({'base85_string': base85_string, 'checksum': checksum}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Helper function to update CDN content
def update_cdn_content(content_type, new_data, existing_data, merge=True):
    """Update the CDN content files for movies or TV series."""
    try:
        # Get the path to the CDN file
        cdn_file_path = os.path.join(current_app.root_path, f'cdn/files/{content_type}_little_clean.json')
        log_info(f"Updating {content_type} CDN file: {cdn_file_path}")
        log_info(f"New data items: {len(new_data)}, Existing data items: {len(existing_data)}")
        
        if merge:
            log_info(f"Merging {len(new_data)} items into existing {content_type} data")
            # Create a dictionary of existing items by ID for quick lookup
            existing_dict = {item['id']: item for item in existing_data}
            
            # Update existing items or add new ones
            updated_count = 0
            added_count = 0
            for item in new_data:
                if item['id'] in existing_dict:
                    # Update existing item
                    existing_dict[item['id']].update(item)
                    updated_count += 1
                else:
                    # Add new item
                    existing_data.append(item)
                    added_count += 1
            
            log_info(f"{content_type.capitalize()}: Updated {updated_count} existing items, added {added_count} new items")
            
            # Write the updated data back to the file
            with open(cdn_file_path, 'w') as f:
                json.dump(existing_data, f, indent=2)
                log_success(f"Successfully wrote merged {content_type} data to {cdn_file_path}")
        else:
            log_info(f"Replacing existing {content_type} data with {len(new_data)} items")
            # Replace the entire content
            with open(cdn_file_path, 'w') as f:
                json.dump(new_data, f, indent=2)
                log_success(f"Successfully wrote replaced {content_type} data to {cdn_file_path}")
        
        # Update the in-memory data
        if content_type == 'movies':
            # Direct reference to avoid shadowing the parameter
            import app
            app.movies = new_data if not merge else existing_data
            log_info(f"Updated in-memory movies data, new count: {len(app.movies)}")
        elif content_type == 'tv':
            # Direct reference to avoid shadowing the parameter
            import app
            app.tv_series = new_data if not merge else existing_data
            log_info(f"Updated in-memory tv_series data, new count: {len(app.tv_series)}")
        
        # Rebuild derived data structures for search functionality
        import app
        app.rebuild_content_indexes()
        log_info("Rebuilt content indexes after data update")
    
    except Exception as e:
        log_error(f"Error in update_cdn_content for {content_type}: {str(e)}")
        import traceback
        log_error(f"Traceback: {traceback.format_exc()}")
        raise


# New helper function to update the with_images content
def update_with_images_content(content_type, new_data, existing_with_images):
    """Update the with_images files for movies or TV shows."""
    try:
        # Path to the with_images file
        with_images_file_path = os.path.join(current_app.root_path, f'cdn/files/{content_type}_with_images.json')
        log_info(f"Updating {content_type}_with_images file: {with_images_file_path}")
        
        # Clean up existing_with_images to remove malformed entries
        valid_entries = []
        for item in existing_with_images:
            # Only keep items with at least an id field
            if 'id' in item and isinstance(item['id'], int):
                valid_entries.append(item)
            else:
                log_warning(f"Removing invalid entry from {content_type}_with_images: {item}")
        
        existing_with_images = valid_entries
        log_info(f"After cleanup: {len(existing_with_images)} valid entries in {content_type}_with_images")
        
        # Create a dictionary of existing items by ID for quick lookup
        existing_dict = {item['id']: item for item in existing_with_images if 'id' in item}
        
        # Import from cdn.utils to check image existence
        from cdn.utils import check_images_existence
        
        # Only process the new items that were imported
        updated_count = 0
        added_count = 0
        skipped_count = 0
        
        for item in new_data:
            if 'id' not in item:
                log_warning(f"Skipping item without ID: {item}")
                skipped_count += 1
                continue
                
            try:
                has_images = check_images_existence(item)
                log_info(f"Item {item.get('id')} ({item.get('title', item.get('name', 'Unknown'))}) has_images: {has_images}")
                
                if has_images:
                    if item['id'] in existing_dict:
                        # Update existing item
                        existing_dict[item['id']].update(item)
                        updated_count += 1
                        log_info(f"Updated item in {content_type}_with_images: {item['id']}")
                    else:
                        # Add new item
                        existing_with_images.append(item)
                        added_count += 1
                        log_info(f"Added new item to {content_type}_with_images: {item['id']}")
                else:
                    log_info(f"Skipping item without images: {item['id']}")
                    skipped_count += 1
            except Exception as e:
                log_error(f"Error processing item {item.get('id')}: {str(e)}")
                skipped_count += 1
        
        log_info(f"{content_type.capitalize()}_with_images: Updated {updated_count} items, added {added_count} items, skipped {skipped_count} items")
        
        # Write the updated data back to the file
        with open(with_images_file_path, 'w') as f:
            json.dump(existing_with_images, f, indent=2)
            log_success(f"Successfully wrote updated {content_type}_with_images data")
        
        # Update the in-memory data
        if content_type == 'movies':
            # Direct reference to avoid variable shadowing
            import app
            app.movies_with_images = existing_with_images
            log_info(f"Updated in-memory movies_with_images, new count: {len(app.movies_with_images)}")
        elif content_type == 'tv':
            # Direct reference to avoid variable shadowing
            import app
            app.tv_series_with_images = existing_with_images
            log_info(f"Updated in-memory tv_series_with_images, new count: {len(app.tv_series_with_images)}")
        
        # Rebuild derived data structures for search functionality
        import app
        app.rebuild_content_indexes()
        log_info("Rebuilt content indexes after with_images data update")
    
    except Exception as e:
        log_error(f"Error in update_with_images_content for {content_type}: {str(e)}")
        import traceback
        log_error(f"Traceback: {traceback.format_exc()}")
        raise


# Function to update with_images data for newly uploaded image files
def update_with_images_for_new_files(filenames):
    """Update with_images data for items with newly uploaded image files."""
    try:
        from utils.data_helpers import get_movies, get_tv_shows, get_movies_with_images, get_tv_shows_with_images
        temp_movies = get_movies(clean=False)
        temp_tv_series = get_tv_shows(clean=False)
        temp_movies_with_images = get_movies_with_images(clean=False)
        temp_tv_series_with_images = get_tv_shows_with_images(clean=False)
        import app
        
        # Extract IDs from filenames (assumes format like poster_123.jpg or backdrop_123.jpg)
        updated_items = set()
        
        for filename in filenames:
            # Try to extract potential content IDs from the filename
            parts = filename.split('_')
            if len(parts) >= 2:
                try:
                    # Assuming ID is the part before the extension and after the first underscore
                    potential_id = int(parts[-1].split('.')[0])
                    updated_items.add(potential_id)
                except ValueError:
                    pass
        
        if not updated_items:
            log_info("No content IDs could be extracted from uploaded image filenames")
            return
            
        log_info(f"Checking {len(updated_items)} potential content IDs for image updates")
        
        # Check movies
        movies_updated = 0
        for item_id in updated_items:
            movie = next((m for m in temp_movies if m['id'] == item_id), None)
            if movie:
                from cdn.utils import check_images_existence
                if check_images_existence(movie):
                    # Add to or update in temp_movies_with_images
                    existing_index = next((i for i, m in enumerate(temp_movies_with_images) if m['id'] == item_id), None)
                    if existing_index is not None:
                        temp_movies_with_images[existing_index] = movie
                    else:
                        temp_movies_with_images.append(movie)
                    movies_updated += 1
        
        # Check TV shows
        tv_updated = 0
        for item_id in updated_items:
            show = next((s for s in temp_tv_series if s['id'] == item_id), None)
            if show:
                from cdn.utils import check_images_existence
                if check_images_existence(show):
                    # Add to or update in temp_tv_series_with_images
                    existing_index = next((i for i, s in enumerate(temp_tv_series_with_images) if s['id'] == item_id), None)
                    if existing_index is not None:
                        temp_tv_series_with_images[existing_index] = show
                    else:
                        temp_tv_series_with_images.append(show)
                    tv_updated += 1
        
        log_info(f"Updated with_images data: {movies_updated} movies, {tv_updated} TV shows")
        
        # Save the updated with_images files
        movies_file_path = os.path.join(current_app.root_path, 'cdn/files/movies_with_images.json')
        tv_file_path = os.path.join(current_app.root_path, 'cdn/files/tv_with_images.json')
        
        with open(movies_file_path, 'w') as f:
            json.dump(temp_movies_with_images, f, indent=2)
            
        with open(tv_file_path, 'w') as f:
            json.dump(temp_tv_series_with_images, f, indent=2)
            
        # Update in-memory data
        app.movies_with_images = temp_movies_with_images
        app.tv_series_with_images = temp_tv_series_with_images
        
        # Rebuild derived data structures for search functionality
        app.rebuild_content_indexes()
        
        log_success(f"Successfully updated with_images files for newly uploaded images")
        
    except Exception as e:
        log_error(f"Error updating with_images data for new files: {str(e)}")
        import traceback
        log_error(f"Traceback: {traceback.format_exc()}")
        raise


# Helper function to convert CSV to JSON
def convert_csv_to_json(csv_data):
    """Convert CSV data to JSON format."""
    reader = csv.DictReader(StringIO(csv_data))
    result = []
    for row in reader:
        # Process the row data (convert string values to appropriate types)
        processed_row = {}
        for key, value in row.items():
            # Try to convert string values to appropriate types
            processed_row[key] = try_convert_value(value)
        result.append(processed_row)
    return result

def try_convert_value(value):
    """Try to convert string value to appropriate type."""
    if not value or not isinstance(value, str):
        return value
    
    # Try to convert to int
    try:
        return int(value)
    except ValueError:
        pass
    
    # Try to convert to float
    try:
        return float(value)
    except ValueError:
        pass
    
    # If it's a JSON-like string (list or dict), try to parse it
    if (value.startswith('[') and value.endswith(']')) or (value.startswith('{') and value.endswith('}')):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            pass
    
    # Return original string if no conversion applies
    return value