from models import db, Admin
from app import bcrypt, app

from flask import Flask, current_app

# Set up the Flask app context
    

def create_superadmin(username='superadmin', email='superadmin@example.com', password='password123'):
    all_users = Admin.query.all()

    if len(all_users) == 1:
        inp = input('\033[31mYou already have a superadmin.\033[m would you want to delete it? press "C" to continue anyway [Y/N/C]\033[m ')
        if inp == 'Y':
            admin = Admin.query.first()
            db.session.delete(admin)
            db.session.commit()
        elif inp == 'C':
            print('Continuing...')
        else:
            print('OK. existing...')
            return False

    username = input("Enter desired username: ")
    email = input("Enter email address: ")
    password = input("Enter desired password: ")
    
    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    admin = Admin(username=username, email=email, password=hashed_password, role='superadmin')
    db.session.add(admin)
    db.session.commit()

def delete_superadmin():
    username = input('Enter the username of the superadmin you want to delete: ')

    # Check if the admin exists
    admin_to_delete = Admin.query.filter_by(username=username).first()
    if admin_to_delete:
        try:
            db.session.delete(admin_to_delete)
            db.session.commit()
            print("\033[32mSuperadmin user '{}' has been deleted.".format(username))  # Green text
        except Exception as e:
            print("\033[31mAn error occurred while deleting the user: {}\033[m".format(e))  # Red text
    else:
        print("\033[31mNo superadmin user found with the username '{}'\033[m.".format(username))  # Red text

def display_menu():
    print('\033[36mAll users:\033[m')
    for user in Admin.query.all():
        print('\033[33m{}\033[m - {} - {}'.format(user.username, user.email, user.role))
    
    print('\033[36mSelect an option:\033[m')
    print('1. Create Superadmin')
    print('2. Delete Superadmin')
    print('3. Exit')

if __name__ == "__main__":
    while True:
        with app.app_context():
            display_menu()
        
        choice = input("Enter your choice (1/2/3): ")
        
        if choice == '1':
            with app.app_context():
                create_superadmin()
        elif choice == '2':
            with app.app_context():
                delete_superadmin()
        elif choice == '3':
            print("Exiting...")
            break
        else:
            print('\033[31mInvalid choice. Please select 1, 2, or 3.\033[m')