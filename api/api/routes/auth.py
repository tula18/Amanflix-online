from flask import Blueprint, request, jsonify, abort

from api.utils import generate_token, token_required
from models import User, db, BlacklistToken

auth_bp = Blueprint('auth_bp', __name__, url_prefix='/api/auth')

@auth_bp.route('/register', methods=['POST'])
def register():
    from app import bcrypt
    data = request.form.to_dict()

    # Check required fields (email is optional)
    if data.get('username', '') == '' or data.get('password', '') == '':
        return {'message': 'Username and password are required'}, 400

    # Check if the user already exists in the database
    existing_user_by_username = User.query.filter_by(username=data['username']).first()
    
    # Only check email uniqueness if email is provided
    existing_user_by_email = None
    if data.get('email'):
        existing_user_by_email = User.query.filter_by(email=data['email']).first()

    if existing_user_by_username or existing_user_by_email:
        return {'message': 'User already exists'}, 400

    hashed_password = bcrypt.generate_password_hash(data['password']).decode('utf-8')
    
    # Create user with optional email
    email = data.get('email') if data.get('email') else None
    new_user = User(username=data['username'], email=email, password=hashed_password)

    db.session.add(new_user)
    db.session.commit()

    api_key = generate_token(new_user.id)

    return jsonify({'message': 'User registered successfully!', 'api_key': api_key})

@auth_bp.route('/login', methods=['POST'])
def login():
    from app import bcrypt
    data = request.form.to_dict()

    if data['username'] == '' or data['password'] == '':
        return {'message': 'password or username are blank'}, 400

    user = User.query.filter_by(username=data['username']).first()

    if not user or not bcrypt.check_password_hash(user.password, data['password']):
        return jsonify({'message': 'Login failed! Check your credentials.'}), 401

    token = generate_token(user.id)

    # Check if token is blacklisted
    blacklisted_token = BlacklistToken.query.filter_by(token=token).first()

    if blacklisted_token:
        # Token is blacklisted, so delete it and generate a new one
        db.session.delete(blacklisted_token)
        db.session.commit()
    else:
        new_token = token

    return jsonify({'api_key': token})

@auth_bp.route('/logout', methods=['POST'])
@token_required
def logout(current_user):
    token = request.headers.get('Authorization').split(" ")[1]
    blacklist_token = BlacklistToken(token=token)

    try:
        db.session.add(blacklist_token)
        db.session.commit()
        return jsonify({'message': 'Successfully logged out.'})

    except:
        return jsonify({'message': 'Failed to blacklist the token.'}), 500

@auth_bp.route('/verify', methods=['POST'])
@token_required
def verify(current_user):
    client_ip = request.remote_addr
    return jsonify({'message': 'valid', 'ip': client_ip})

@auth_bp.route('/profile', methods=['GET'])
@token_required
def profile(current_user):
    return jsonify(current_user.serialize())

@auth_bp.route('/delete', methods=['DELETE'])
@token_required
def delete_user(current_user):
    from app import bcrypt
    data = request.form.to_dict()
    if not data.get('password') or data.get('password') == '':
        return jsonify({'message': 'Please provide a password'}), 400

    if not current_user or not bcrypt.check_password_hash(current_user.password, data.get('password')):
        return jsonify({'message': 'Password incorrect! Check your credentials.'}), 401
    db.session.delete(current_user)
    db.session.commit()
    return jsonify({'message': 'Your account has been deleted successfully.'}), 200

@auth_bp.route('/update', methods=['POST'])
@token_required
def update_user(current_user):
    data = request.form.to_dict()
    newUsername = data.get('username')
    newEmail = data.get('email')
    newPassword = data.get('newPassword')

    message = "Profile updated successfully!"
    

    if current_user:
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

        if not current_user or not bcrypt.check_password_hash(current_user.password, data['password']):
            return jsonify({'message': 'Check your credentials.'}), 401
        hashed_password = bcrypt.generate_password_hash(data['newPassword']).decode('utf-8')
        current_user.password = hashed_password
        message = 'Profile and password updated successfully!'

    # Update other fields
    current_user.username = data.get('username', current_user.username)
    current_user.email = data.get('email', current_user.email)

    db.session.commit()

    return jsonify({'message': message, 'username': current_user.username, 'email': current_user.email})