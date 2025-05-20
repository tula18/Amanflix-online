import datetime
from flask import Blueprint, request, jsonify, abort
from cdn.utils import paginate
from api.utils import generate_admin_token, role_hierarchy, admin_token_required
from models import Admin, db, User, BlacklistToken, BugReport, UploadRequest
from utils.logger import log_info, log_success, log_warning, log_error

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
    db.session.delete(user)
    db.session.commit()

    return jsonify({'message': f'The account {user.username} has been deleted successfully.'})

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
    from app import tv_series, movies
    uploadRequest_items = UploadRequest.query.all()
    with_duplicates = request.args.get('with_duplicates', 'false').lower() == 'true'

    titles = []

    #add with dulicates
    for title in uploadRequest_items:
        requests_count = len(UploadRequest.query.filter_by(content_id=title.content_id).all())
        if title.content_type == 'movie':
            movie = next((item for item in movies if item["id"] == title.content_id), None)
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
            tv = next((item for item in tv_series if item["id"] == title.content_id), None)
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