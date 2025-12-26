from flask import Blueprint, request, jsonify, abort
from models import BugReport, db
from api.utils import token_required
from api.db_utils import safe_commit

bug_bp = Blueprint('bug_bp', __name__, url_prefix='/api')

@bug_bp.route('/bugreport', methods=['POST'])
@token_required
def bug_report(current_user):
    data = request.form.to_dict()
    if not data or 'description' not in data:
        return jsonify({'message': 'Please provide a bug description'}), 400
    if not data or 'title' not in data:
        return jsonify({'message': 'Please provide a bug title'}), 400
    if data['title'] == '':
        return jsonify({'message': 'Title cannot be blank!'}), 400
    if data['title'] == '':
        return jsonify({'message': 'Description cannot be blank!'}), 400
    new_report = BugReport(description=data['description'], title=data['title'], reporter_id=current_user.id)
    db.session.add(new_report)
    if not safe_commit():
        return jsonify({'message': 'Failed to submit bug report due to database error'}), 500

    return jsonify({'message': 'Bug report submitted'}), 200