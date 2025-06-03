#!/usr/bin/env python3
"""
Amanflix Superadmin Management Tool
====================================

This script allows you to create and manage superadmin accounts for the Amanflix application.
It provides a secure and user-friendly interface for admin management.

Usage: python create_superadmin.py
"""

import sys
import re
import getpass
from datetime import datetime
from models import db, Admin
from app import bcrypt, app
from utils.logger import (
    log_info, log_success, log_warning, log_error, log_section, log_section_end,
    log_step, log_substep, log_data, Colors, log_fancy, log_banner
)

def validate_email(email):
    """Validate email format using regex. Returns True for empty emails (optional)."""
    # Allow empty email (optional field)
    if not email or email.strip() == "":
        return True, "Email is optional"
    
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if re.match(pattern, email) is not None:
        return True, "Email is valid"
    else:
        return False, "Please enter a valid email address"

def validate_password(password):
    """Validate password strength."""
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter"
    if not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter"
    if not re.search(r'\d', password):
        return False, "Password must contain at least one digit"
    return True, "Password is strong"

def validate_username(username):
    """Validate username format."""
    if len(username) < 3:
        return False, "Username must be at least 3 characters long"
    if len(username) > 50:
        return False, "Username must be less than 50 characters"
    if not re.match(r'^[a-zA-Z0-9_-]+$', username):
        return False, "Username can only contain letters, numbers, underscores, and hyphens"
    return True, "Username is valid"

def get_secure_input(prompt, validator=None, is_password=False, allow_empty=False):
    """Get user input with validation and security measures."""
    max_attempts = 3
    attempts = 0
    
    while attempts < max_attempts:
        try:
            if is_password:
                value = getpass.getpass(f"{Colors.CYAN}{prompt}{Colors.RESET}")
            else:
                value = input(f"{Colors.CYAN}{prompt}{Colors.RESET}")
            
            if not value.strip() and not allow_empty:
                log_warning("This field cannot be empty. Please try again.")
                attempts += 1
                continue
            
            if validator:
                is_valid, message = validator(value.strip())
                if not is_valid:
                    log_error(f"Validation failed: {message}")
                    attempts += 1
                    continue
            
            return value.strip()
            
        except KeyboardInterrupt:
            log_warning("\nOperation cancelled by user.")
            return None
        except Exception as e:
            log_error(f"Input error: {e}")
            attempts += 1
    
    log_error("Maximum attempts exceeded. Operation cancelled.")
    return None

def display_admin_list():
    """Display all existing admin accounts in a formatted table."""
    try:
        admins = Admin.query.all()
        
        if not admins:
            log_info("No admin accounts found in the database.")
            return
        
        log_section("EXISTING ADMIN ACCOUNTS")
        
        # Header
        print(f"{Colors.BOLD}{Colors.WHITE}{'ID':<4} {'Username':<20} {'Email':<30} {'Role':<15} {'Created':<20}{Colors.RESET}")
        print(f"{Colors.GRAY}{'─' * 4} {'─' * 20} {'─' * 30} {'─' * 15} {'─' * 20}{Colors.RESET}")
          # Admin entries
        for admin in admins:
            role_color = Colors.RED if admin.role == 'superadmin' else Colors.YELLOW if admin.role == 'admin' else Colors.BLUE
            created_date = admin.created_at.strftime('%Y-%m-%d %H:%M') if admin.created_at else 'Unknown'
            email_display = admin.email if admin.email else 'Not provided'
            
            print(f"{Colors.WHITE}{admin.id:<4} {admin.username:<20} {email_display:<30} "
                  f"{role_color}{admin.role:<15}{Colors.WHITE} {created_date:<20}{Colors.RESET}")
        
        log_section_end()
        
    except Exception as e:
        log_error(f"Failed to retrieve admin list: {e}")

def create_superadmin():
    """Create a new superadmin account with comprehensive validation."""
    log_section("CREATE SUPERADMIN ACCOUNT")
    
    try:
        # Check if superadmin already exists
        existing_superadmin = Admin.query.filter_by(role='superadmin').first()
        if existing_superadmin:
            log_warning(f"A superadmin account already exists: {existing_superadmin.username}")
            choice = get_secure_input("Do you want to create another superadmin? (y/N): ", allow_empty=True)
            if choice.lower() != 'y':
                log_info("Operation cancelled.")
                return False
        
        log_step("Please provide the following information:")
        
        # Get username
        log_substep("Username (3-50 characters, alphanumeric, _, -):")
        username = get_secure_input("Username: ", validate_username)
        if not username:
            return False
        
        # Check if username exists
        if Admin.query.filter_by(username=username).first():
            log_error(f"Username '{username}' already exists. Please choose a different one.")
            return False
          # Get email (optional)
        log_substep("Email address (optional - press Enter to skip):")
        email = get_secure_input("Email: ", validate_email, allow_empty=True)
        if email is None:  # User cancelled
            return False
        
        # Check if email exists (only if provided)
        if email and Admin.query.filter_by(email=email).first():
            log_error(f"Email '{email}' already exists. Please choose a different one.")
            return False
        
        # Get password
        log_substep("Password (min 8 chars, must include: uppercase, lowercase, digit, special char):")
        password = get_secure_input("Password: ", validate_password, is_password=True)
        if not password:
            return False
        
        # Confirm password
        confirm_password = get_secure_input("Confirm Password: ", is_password=True)
        if not confirm_password or password != confirm_password:
            log_error("Passwords do not match. Operation cancelled.")
            return False
          # Final confirmation
        log_step("Review your information:")
        log_data("Username", username)
        log_data("Email", email if email else "Not provided")
        log_data("Role", "superadmin")
        
        confirm = get_secure_input("Create this superadmin account? (y/N): ", allow_empty=True)
        if confirm.lower() != 'y':
            log_info("Operation cancelled.")
            return False
        
        # Create the account
        log_step("Creating superadmin account...")
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
        admin = Admin(
            username=username,
            email=email if email else None,  # Set to None if empty
            password=hashed_password,
            role='superadmin'
        )
        
        db.session.add(admin)
        db.session.commit()
        
        log_success(f"Superadmin account '{username}' created successfully!")
        log_banner("✅ SUPERADMIN CREATED", f"Username: {username}", "success")
        log_section_end()
        return True
        
    except Exception as e:
        db.session.rollback()
        log_error(f"Failed to create superadmin account: {e}")
        log_section_end()
        return False

def delete_admin():
    """Delete an admin account with safety checks."""
    log_section("DELETE ADMIN ACCOUNT")
    
    try:
        # Display current admins
        display_admin_list()
        
        # Get username to delete
        username = get_secure_input("Enter username to delete: ")
        if not username:
            return False
        
        # Find the admin
        admin_to_delete = Admin.query.filter_by(username=username).first()
        if not admin_to_delete:
            log_error(f"No admin found with username '{username}'.")
            return False
        
        # Safety check for last superadmin
        if admin_to_delete.role == 'superadmin':
            superadmin_count = Admin.query.filter_by(role='superadmin').count()
            if superadmin_count <= 1:
                log_error("Cannot delete the last superadmin account! Create another superadmin first.")
                return False
          # Show admin details
        log_step("Admin account to delete:")
        log_data("Username", admin_to_delete.username)
        log_data("Email", admin_to_delete.email if admin_to_delete.email else "Not provided")
        log_data("Role", admin_to_delete.role)
        log_data("Created", admin_to_delete.created_at.strftime('%Y-%m-%d %H:%M') if admin_to_delete.created_at else 'Unknown')
        
        # Final confirmation
        log_warning("This action cannot be undone!")
        confirm = get_secure_input(f"Type '{username}' to confirm deletion: ")
        if confirm != username:
            log_error("Confirmation failed. Operation cancelled.")
            return False
        
        # Delete the account
        log_step("Deleting admin account...")
        db.session.delete(admin_to_delete)
        db.session.commit()
        
        log_success(f"Admin account '{username}' deleted successfully!")
        log_section_end()
        return True
        
    except Exception as e:
        db.session.rollback()
        log_error(f"Failed to delete admin account: {e}")
        log_section_end()
        return False

def display_menu():
    """Display the main menu with options."""
    # Display header
    log_banner("🔐 AMANFLIX SUPERADMIN MANAGER", "Secure Admin Account Management", "info")
    
    # Display current admin count
    try:
        total_admins = Admin.query.count()
        superadmin_count = Admin.query.filter_by(role='superadmin').count()
        
        log_step("Current Status:")
        log_data("Total Admins", total_admins)
        log_data("Superadmins", superadmin_count)
        
        if superadmin_count == 0:
            log_warning("⚠️  No superadmin accounts found! You should create one.")
        
    except Exception as e:
        log_error(f"Failed to get admin count: {e}")
    
    # Menu options
    print(f"\n{Colors.BOLD}{Colors.WHITE}Available Options:{Colors.RESET}")
    print(f"{Colors.GREEN}1.{Colors.RESET} Create Superadmin Account")
    print(f"{Colors.YELLOW}2.{Colors.RESET} View All Admin Accounts")
    print(f"{Colors.RED}3.{Colors.RESET} Delete Admin Account")
    print(f"{Colors.BLUE}4.{Colors.RESET} Change Admin Password")
    print(f"{Colors.GRAY}5.{Colors.RESET} Exit")
    print()

def change_admin_password():
    """Change password for an existing admin account."""
    log_section("CHANGE ADMIN PASSWORD")
    
    try:
        # Display current admins
        display_admin_list()
        
        # Get username
        username = get_secure_input("Enter username to change password: ")
        if not username:
            return False
        
        # Find the admin
        admin = Admin.query.filter_by(username=username).first()
        if not admin:
            log_error(f"No admin found with username '{username}'.")
            return False
        
        log_step(f"Changing password for: {admin.username} ({admin.role})")
        
        # Get new password
        new_password = get_secure_input("New Password: ", validate_password, is_password=True)
        if not new_password:
            return False
        
        # Confirm password
        confirm_password = get_secure_input("Confirm New Password: ", is_password=True)
        if not confirm_password or new_password != confirm_password:
            log_error("Passwords do not match. Operation cancelled.")
            return False
        
        # Update password
        log_step("Updating password...")
        hashed_password = bcrypt.generate_password_hash(new_password).decode('utf-8')
        admin.password = hashed_password
        db.session.commit()
        
        log_success(f"Password updated successfully for '{username}'!")
        log_section_end()
        return True
        
    except Exception as e:
        db.session.rollback()
        log_error(f"Failed to change password: {e}")
        log_section_end()
        return False

def main():
    """Main application loop."""
    try:
        # Print startup banner
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        header = f"\n{Colors.BOLD}{Colors.BLUE}╔{'═' * 60}╗{Colors.RESET}\n"
        header += f"{Colors.BOLD}{Colors.BLUE}║{Colors.WHITE} AMANFLIX SUPERADMIN MANAGER {Colors.YELLOW}• {Colors.WHITE}{timestamp}{' ' * (60 - 28 - len(timestamp) - 3)}{Colors.BLUE}║{Colors.RESET}\n"
        header += f"{Colors.BOLD}{Colors.BLUE}╚{'═' * 60}╝{Colors.RESET}\n"
        log_fancy(header)
        
        while True:
            with app.app_context():
                display_menu()
            
            choice = get_secure_input("Enter your choice (1-5): ", allow_empty=True)
            
            if not choice:
                continue
            
            with app.app_context():
                if choice == '1':
                    create_superadmin()
                elif choice == '2':
                    display_admin_list()
                elif choice == '3':
                    delete_admin()
                elif choice == '4':
                    change_admin_password()
                elif choice == '5':
                    log_banner("👋 GOODBYE", "Thank you for using Amanflix Admin Manager!", "info")
                    break
                else:
                    log_error("Invalid choice. Please select 1-5.")
            
            # Pause before showing menu again
            if choice != '5':
                input(f"\n{Colors.GRAY}Press Enter to continue...{Colors.RESET}")
                print("\n" * 2)  # Clear screen effect
    
    except KeyboardInterrupt:
        log_warning("\n\nOperation cancelled by user. Goodbye!")
    except Exception as e:
        log_error(f"Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()