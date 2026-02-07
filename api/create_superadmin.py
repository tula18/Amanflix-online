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
import csv
import json
import os
import shutil
import hashlib
import subprocess
from datetime import datetime, timedelta
from io import StringIO
from models import db, Admin
from app import bcrypt, app
from utils.logger import (
    log_info, log_success, log_warning, log_error, log_section, log_section_end,
    log_step, log_substep, log_data, Colors, log_fancy, log_banner
)

# Configuration constants
CONFIG = {
    'MIN_PASSWORD_LENGTH': 8,
    'MAX_LOGIN_ATTEMPTS': 3,
    'PASSWORD_EXPIRY_DAYS': 90,
    'BACKUP_DIR': 'backups',
    'EXPORT_DIR': 'exports',
    'ALLOWED_EMAIL_DOMAINS': [],  # Empty list means all domains allowed
    'FORBIDDEN_USERNAMES': ['admin', 'root', 'superuser', 'administrator', 'system']
}

def validate_email(email):
    """Validate email format using regex. Returns True for empty emails (optional)."""
    # Allow empty email (optional field)
    if not email or email.strip() == "":
        return True, "Email is optional"
    
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if re.match(pattern, email) is not None:
        # Check domain restrictions if configured
        if CONFIG['ALLOWED_EMAIL_DOMAINS']:
            domain = email.split('@')[1].lower()
            if domain not in CONFIG['ALLOWED_EMAIL_DOMAINS']:
                return False, f"Email domain not allowed. Allowed domains: {', '.join(CONFIG['ALLOWED_EMAIL_DOMAINS'])}"
        return True, "Email is valid"
    else:
        return False, "Please enter a valid email address"

def validate_password(password):
    """Validate password strength with enhanced security checks."""
    if len(password) < CONFIG['MIN_PASSWORD_LENGTH']:
        return False, f"Password must be at least {CONFIG['MIN_PASSWORD_LENGTH']} characters long"
    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter"
    if not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter"
    
    # Check for common weak patterns
    common_patterns = ['abc', 'password', 'admin', 'qwerty']
    password_lower = password.lower()
    for pattern in common_patterns:
        if pattern in password_lower:
            return False, f"Password contains a common weak pattern: {pattern}"
    
    return True, "Password is strong"

def validate_username(username):
    """Validate username format with enhanced checks."""
    if len(username) < 3:
        return False, "Username must be at least 3 characters long"
    if len(username) > 50:
        return False, "Username must be less than 50 characters"
    if not re.match(r'^[a-zA-Z0-9_-]+$', username):
        return False, "Username can only contain letters, numbers, underscores, and hyphens"
    
    # Check forbidden usernames
    if username.lower() in CONFIG['FORBIDDEN_USERNAMES']:
        return False, f"Username '{username}' is not allowed. Please choose a different one."
    
    # Check if username starts with number
    if username[0].isdigit():
        return False, "Username cannot start with a number"
    
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
        print(f"{Colors.BOLD}{Colors.WHITE}{'ID':<4} {'Username':<20} {'Email':<30} {'Role':<15} {'Status':<10} {'Created':<20}{Colors.RESET}")
        print(f"{Colors.GRAY}{'─' * 4} {'─' * 20} {'─' * 30} {'─' * 15} {'─' * 10} {'─' * 20}{Colors.RESET}")
        # Admin entries
        for admin in admins:
            # Determine role color and status
            if admin.disabled:
                status = "🔒 DISABLED"
                status_color = Colors.RED
            else:
                status = "🔓 ACTIVE"
                status_color = Colors.GREEN
              # Set role color based on actual role
            if admin.role == 'superadmin':
                role_color = Colors.RED
            elif admin.role == 'admin':
                role_color = Colors.YELLOW
            else:
                role_color = Colors.BLUE
            
            created_date = admin.created_at.strftime('%Y-%m-%d %H:%M') if admin.created_at else 'Unknown'
            email_display = admin.email if admin.email else 'Not provided'
            
            print(f"{Colors.WHITE}{admin.id:<4} {admin.username:<20} {email_display:<30} "
                  f"{role_color}{admin.role:<15}{status_color}{status:<10}{Colors.WHITE} {created_date:<20}{Colors.RESET}")
        
        log_section_end()
        
    except Exception as e:
        log_error(f"Failed to retrieve admin list: {e}")

def create_superadmin():
    """Create a new superadmin account with comprehensive validation."""
    log_section("CREATE SUPERADMIN ACCOUNT")
    
    try:        # Check if superadmin already exists
        existing_superadmin = Admin.query.filter_by(role='superadmin').first()
        if existing_superadmin:
            log_error("⚠️  SECURITY WARNING: A superadmin account already exists!")
            log_warning(f"Existing superadmin: {existing_superadmin.username}")
            log_warning("Having multiple superadmins can create security and management issues.")
            log_warning("It is STRONGLY RECOMMENDED to have only ONE superadmin account.")
            print(f"\n{Colors.RED}{Colors.BOLD}WARNING: This action may compromise system security!{Colors.RESET}")
            choice = get_secure_input("Do you still want to create another superadmin? (y/N): ", allow_empty=True)
            if choice.lower() != 'y':
                log_info("Operation cancelled. This is the recommended action.")
                return False
            log_warning("Proceeding with multiple superadmins - USE WITH EXTREME CAUTION!")
        
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
        log_substep("Password (min 8 chars, must include: uppercase, lowercase):")
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
        elif superadmin_count > 1:
            log_error(f"⚠️  SECURITY ALERT: {superadmin_count} superadmin accounts detected!")
            log_warning("Multiple superadmins can create security risks. Consider having only one.")
        
    except Exception as e:
        log_error(f"Failed to get admin count: {e}")
    
    # Menu options
    print(f"\n{Colors.BOLD}{Colors.WHITE}Available Options:{Colors.RESET}")
    
    # Check if this is a first-time setup
    try:
        admin_count = Admin.query.count()
        if admin_count == 0:
            print(f"\n{Colors.BOLD}{Colors.GREEN}🚀 First Time Setup:{Colors.RESET}")
            print(f"{Colors.CYAN}14.{Colors.RESET} Quick Setup Wizard (Recommended for first-time users)")
            print()
    except:
        pass
    
    print(f"\n{Colors.BOLD}{Colors.CYAN}📊 Account Management:{Colors.RESET}")
    print(f"{Colors.GREEN}1.{Colors.RESET} Create Superadmin Account")
    print(f"{Colors.BLUE}2.{Colors.RESET} Create Admin Account (Any Role)")
    print(f"{Colors.YELLOW}3.{Colors.RESET} View All Admin Accounts")
    print(f"{Colors.RED}4.{Colors.RESET} Delete Admin Account")
    print(f"{Colors.MAGENTA}5.{Colors.RESET} Change Admin Password")
    print(f"{Colors.CYAN}6.{Colors.RESET} Toggle Admin Status (Enable/Disable)")
    print(f"{Colors.WHITE}7.{Colors.RESET} List Disabled Admins")
    print(f"{Colors.GREEN}8.{Colors.RESET} Batch Restore Disabled Admins")
    
    print(f"\n{Colors.BOLD}{Colors.CYAN}📈 Bulk Operations:{Colors.RESET}")
    print(f"{Colors.GREEN}9.{Colors.RESET} Bulk Create Admins (from CSV)")
    print(f"{Colors.YELLOW}10.{Colors.RESET} Export Admin Data")
    
    print(f"\n{Colors.BOLD}{Colors.CYAN}🔧 System Tools:{Colors.RESET}")
    print(f"{Colors.BLUE}11.{Colors.RESET} Generate Admin Analytics Report")
    print(f"{Colors.MAGENTA}12.{Colors.RESET} Create Database Backup")
    print(f"{Colors.WHITE}13.{Colors.RESET} System Health Check")
    print(f"{Colors.GREEN}14.{Colors.RESET} Quick Setup Wizard")
    print(f"{Colors.CYAN}15.{Colors.RESET} Database Migration Management")
    
    print(f"\n{Colors.GRAY}0.{Colors.RESET} Exit")
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

def create_backup():
    """Create a backup of the database before critical operations."""
    try:
        log_step("Creating database backup...")
        
        # Create backup directory if it doesn't exist
        backup_dir = CONFIG['BACKUP_DIR']
        os.makedirs(backup_dir, exist_ok=True)
        
        # Generate backup filename with timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_filename = f"amanflix_db_backup_{timestamp}.db"
        backup_path = os.path.join(backup_dir, backup_filename)
        
        # Copy database file
        db_path = 'instance/amanflix_db.db'
        if os.path.exists(db_path):
            shutil.copy2(db_path, backup_path)
            log_success(f"Database backup created: {backup_path}")
            return backup_path
        else:
            log_warning("Database file not found. Backup skipped.")
            return None
    except Exception as e:
        log_error(f"Failed to create backup: {e}")
        return None

def export_admin_data(format_type='csv'):
    """Export admin data to CSV or JSON format."""
    try:
        log_step(f"Exporting admin data to {format_type.upper()}...")
        
        # Create export directory if it doesn't exist
        export_dir = CONFIG['EXPORT_DIR']
        os.makedirs(export_dir, exist_ok=True)
        
        # Get all admins
        admins = Admin.query.all()
        
        if not admins:
            log_warning("No admin accounts found to export.")
            return False
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        if format_type.lower() == 'csv':
            filename = f"admin_export_{timestamp}.csv"
            filepath = os.path.join(export_dir, filename)
            
            with open(filepath, 'w', newline='', encoding='utf-8') as csvfile:
                fieldnames = ['id', 'username', 'email', 'role', 'created_at', 'updated_at']
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                
                writer.writeheader()
                for admin in admins:
                    writer.writerow({
                        'id': admin.id,
                        'username': admin.username,
                        'email': admin.email or 'Not provided',
                        'role': admin.role,
                        'created_at': admin.created_at.strftime('%Y-%m-%d %H:%M:%S') if admin.created_at else 'Unknown',
                        'updated_at': admin.updated_at.strftime('%Y-%m-%d %H:%M:%S') if admin.updated_at else 'Never'
                    })
        
        elif format_type.lower() == 'json':
            filename = f"admin_export_{timestamp}.json"
            filepath = os.path.join(export_dir, filename)
            
            admin_data = []
            for admin in admins:
                admin_data.append({
                    'id': admin.id,
                    'username': admin.username,
                    'email': admin.email or 'Not provided',
                    'role': admin.role,
                    'created_at': admin.created_at.strftime('%Y-%m-%d %H:%M:%S') if admin.created_at else 'Unknown',
                    'updated_at': admin.updated_at.strftime('%Y-%m-%d %H:%M:%S') if admin.updated_at else 'Never'
                })
            
            with open(filepath, 'w', encoding='utf-8') as jsonfile:
                json.dump(admin_data, jsonfile, indent=2, ensure_ascii=False)
        
        log_success(f"Admin data exported to: {filepath}")
        return True
        
    except Exception as e:
        log_error(f"Failed to export admin data: {e}")
        return False

def bulk_create_admins():
    """Create multiple admin accounts from a CSV file."""
    log_section("BULK CREATE ADMINS FROM CSV")
    
    try:
        csv_file = get_secure_input("Enter CSV file path (or press Enter to see format): ", allow_empty=True)
        
        if not csv_file:
            log_info("CSV Format required:")
            log_info("username,email,password,role")
            log_info("Example:")
            log_info("john_doe,john@example.com,SecurePass123!,admin")
            log_info("jane_smith,jane@example.com,StrongPass456!,moderator")
            return False
        
        if not os.path.exists(csv_file):
            log_error(f"File not found: {csv_file}")
            return False
        
        # Create backup before bulk operation
        backup_path = create_backup()
        
        # Read and validate CSV
        created_count = 0
        failed_count = 0
        
        with open(csv_file, 'r', encoding='utf-8') as file:
            reader = csv.DictReader(file)
            
            if not all(field in reader.fieldnames for field in ['username', 'email', 'password', 'role']):
                log_error("CSV file must have columns: username, email, password, role")
                return False
            
            for row_num, row in enumerate(reader, start=2):
                try:
                    username = row['username'].strip()
                    email = row['email'].strip()
                    password = row['password'].strip()
                    role = row['role'].strip()
                    
                    # Validate each field
                    username_valid, username_msg = validate_username(username)
                    if not username_valid:
                        log_error(f"Row {row_num}: {username_msg}")
                        failed_count += 1
                        continue
                    
                    email_valid, email_msg = validate_email(email)
                    if not email_valid:
                        log_error(f"Row {row_num}: {email_msg}")
                        failed_count += 1
                        continue
                    
                    password_valid, password_msg = validate_password(password)
                    if not password_valid:
                        log_error(f"Row {row_num}: {password_msg}")
                        failed_count += 1
                        continue
                    
                    if role not in ['superadmin', 'admin', 'moderator']:
                        log_error(f"Row {row_num}: Invalid role '{role}'. Must be: superadmin, admin, or moderator")
                        failed_count += 1
                        continue
                    
                    # Check if user already exists
                    existing_admin = Admin.query.filter(
                        (Admin.username == username) | (Admin.email == email)
                    ).first()
                    
                    if existing_admin:
                        log_error(f"Row {row_num}: Admin with username '{username}' or email '{email}' already exists")
                        failed_count += 1
                        continue
                    
                    # Create admin
                    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
                    admin = Admin(
                        username=username,
                        email=email if email else None,
                        password=hashed_password,
                        role=role
                    )
                    
                    db.session.add(admin)
                    db.session.commit()
                    
                    log_success(f"Created admin: {username} ({role})")
                    created_count += 1
                    
                except Exception as e:
                    log_error(f"Row {row_num}: Failed to create admin - {e}")
                    failed_count += 1
                    db.session.rollback()
        
        log_banner("BULK CREATION COMPLETE", f"Created: {created_count} | Failed: {failed_count}", "success" if failed_count == 0 else "warning")
        log_section_end()
        return True
        
    except Exception as e:
        log_error(f"Bulk creation failed: {e}")
        db.session.rollback()
        log_section_end()
        return False

def toggle_admin_status():
    """Enable or disable admin accounts using the disabled field."""
    log_section("TOGGLE ADMIN STATUS")
    
    try:
        # Display current admins
        display_admin_list()
        
        username = get_secure_input("Enter username to toggle status: ")
        if not username:
            return False
        
        admin = Admin.query.filter_by(username=username).first()
        if not admin:
            log_error(f"No admin found with username '{username}'.")
            return False
        
        # Show current status
        log_step("Current admin details:")
        log_data("Username", admin.username)
        log_data("Email", admin.email if admin.email else "Not provided")
        log_data("Role", admin.role)
        log_data("Created", admin.created_at.strftime('%Y-%m-%d %H:%M') if admin.created_at else 'Unknown')
        
        # Check if admin is currently disabled
        current_status = "disabled" if admin.disabled else "active"
        log_data("Current Status", current_status.upper())
        
        # Safety check for last active superadmin
        if admin.role == 'superadmin' and not admin.disabled:
            active_superadmin_count = Admin.query.filter_by(role='superadmin', disabled=False).count()
            if active_superadmin_count <= 1:
                log_error("Cannot disable the last active superadmin account!")
                log_info("Create another superadmin first, or restore a disabled superadmin.")
                return False
        
        # Determine action
        if not admin.disabled:
            action = "disable"
            log_warning(f"This will DISABLE admin '{username}'")
        else:
            action = "enable"
            log_info(f"This will ENABLE admin '{username}'")
        
        # Confirm action
        confirm = get_secure_input(f"Are you sure you want to {action} this admin? (y/N): ").lower()
        if confirm not in ['y', 'yes']:
            log_info("Operation cancelled.")
            return False
        
        # Update the admin status
        log_step(f"{action.capitalize()}ing admin account...")
        admin.disabled = not admin.disabled
        admin.updated_at = datetime.now()
        db.session.commit()
        
        status_emoji = "🔒" if action == "disable" else "🔓"
        status_text = "DISABLED" if admin.disabled else "ACTIVE"
        log_success(f"{status_emoji} Admin '{username}' has been {action}d successfully!")
        log_data("New Status", status_text)
        
        # Log the action for audit purposes
        log_info(f"Admin status change logged: {username} -> {status_text}")
        
        log_section_end()
        return True
        
    except Exception as e:
        db.session.rollback()
        log_error(f"Failed to toggle admin status: {e}")
        log_section_end()
        return False

def generate_admin_report():
    """Generate comprehensive admin analytics report."""
    log_section("ADMIN ANALYTICS REPORT")
    
    try:
        admins = Admin.query.all()
        
        if not admins:
            log_info("No admin accounts found.")
            return False
        
        # Basic statistics
        total_admins = len(admins)
        role_counts = {}
        for admin in admins:
            role_counts[admin.role] = role_counts.get(admin.role, 0) + 1
        
        # Recent activity (last 30 days)
        thirty_days_ago = datetime.now() - timedelta(days=30)
        recent_admins = [admin for admin in admins if admin.created_at and admin.created_at >= thirty_days_ago]
        
        # Display report
        log_banner("📊 ADMIN ANALYTICS REPORT", f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", "info")
        
        log_step("Summary Statistics:")
        log_data("Total Admins", total_admins)
        
        for role, count in role_counts.items():
            percentage = (count / total_admins) * 100
            log_data(f"{role.capitalize()} Accounts", f"{count} ({percentage:.1f}%)")
        
        log_data("New Admins (Last 30 days)", len(recent_admins))
        
        log_step("Account Creation Timeline:")
        if admins:
            oldest_admin = min(admins, key=lambda x: x.created_at if x.created_at else datetime.now())
            newest_admin = max(admins, key=lambda x: x.created_at if x.created_at else datetime.min)
            
            if oldest_admin.created_at:
                log_data("First Admin Created", oldest_admin.created_at.strftime('%Y-%m-%d'))
            if newest_admin.created_at:
                log_data("Latest Admin Created", newest_admin.created_at.strftime('%Y-%m-%d'))
        
        # Email domain analysis
        log_step("Email Domain Analysis:")
        email_domains = {}
        admins_with_email = [admin for admin in admins if admin.email]
        
        for admin in admins_with_email:
            domain = admin.email.split('@')[1].lower()
            email_domains[domain] = email_domains.get(domain, 0) + 1
        
        if email_domains:
            for domain, count in sorted(email_domains.items(), key=lambda x: x[1], reverse=True):
                percentage = (count / len(admins_with_email)) * 100
                log_data(f"@{domain}", f"{count} ({percentage:.1f}%)")
        else:
            log_data("Email Domains", "No email addresses found")
        
        # Security recommendations
        log_step("Security Recommendations:")
        if role_counts.get('superadmin', 0) > 3:
            log_warning(f"High number of superadmin accounts ({role_counts['superadmin']}). Consider reviewing necessity.")
        
        admins_without_email = total_admins - len(admins_with_email)
        if admins_without_email > 0:
            log_warning(f"{admins_without_email} admin(s) don't have email addresses.")
        
        log_success("Report generation completed!")
        
        # Offer to export report
        export_choice = get_secure_input("Export this report? (y/N): ", allow_empty=True)
        if export_choice.lower() == 'y':
            export_admin_data('json')
        
        log_section_end()
        return True
        
    except Exception as e:
        log_error(f"Failed to generate report: {e}")
        log_section_end()
        return False

def system_health_check():
    """Perform system health checks and display status."""
    log_section("SYSTEM HEALTH CHECK")
    
    try:
        health_issues = []
        
        log_step("Checking database connectivity...")
        try:
            # Test database connection
            Admin.query.count()
            log_success("✅ Database connection: OK")
        except Exception as e:
            log_error(f"❌ Database connection: FAILED - {e}")
            health_issues.append("Database connection failed")
        
        log_step("Checking admin account integrity...")
        try:
            admins = Admin.query.all()
            total_admins = len(admins)
            superadmin_count = len([a for a in admins if a.role == 'superadmin'])
            
            if superadmin_count == 0:
                log_error("❌ No superadmin accounts found!")
                health_issues.append("No superadmin accounts")
            elif superadmin_count == 1:
                log_success("✅ Exactly one superadmin account found (recommended)")
            else:
                log_warning(f"⚠️  Multiple superadmin accounts found: {superadmin_count} (security risk)")
            
            # Check for admins without emails
            admins_without_email = len([a for a in admins if not a.email])
            if admins_without_email > 0:
                log_warning(f"⚠️  {admins_without_email} admin(s) without email addresses")
            
            log_success(f"✅ Total admin accounts: {total_admins}")
            
        except Exception as e:
            log_error(f"❌ Admin account check: FAILED - {e}")
            health_issues.append("Admin account check failed")
        
        log_step("Checking file system permissions...")
        try:
            # Check if we can create directories
            test_dir = "temp_health_check"
            os.makedirs(test_dir, exist_ok=True)
            os.rmdir(test_dir)
            log_success("✅ File system permissions: OK")
        except Exception as e:
            log_error(f"❌ File system permissions: FAILED - {e}")
            health_issues.append("File system permission issues")
        
        log_step("Checking backup directory...")
        try:
            backup_dir = CONFIG['BACKUP_DIR']
            if os.path.exists(backup_dir):
                backup_files = [f for f in os.listdir(backup_dir) if f.endswith('.db')]
                log_success(f"✅ Backup directory exists with {len(backup_files)} backup(s)")
            else:
                log_warning("⚠️  Backup directory doesn't exist")
                os.makedirs(backup_dir, exist_ok=True)
                log_success("✅ Created backup directory")
        except Exception as e:
            log_error(f"❌ Backup directory check: FAILED - {e}")
            health_issues.append("Backup directory issues")
        
        log_step("Checking configuration...")
        config_issues = []
        
        if CONFIG['MIN_PASSWORD_LENGTH'] < 8:
            config_issues.append("Password length requirement too low")
        
        if not CONFIG['FORBIDDEN_USERNAMES']:
            config_issues.append("No forbidden usernames configured")
        
        if config_issues:
            for issue in config_issues:
                log_warning(f"⚠️  {issue}")
        else:
            log_success("✅ Configuration: OK")
        
        # Summary
        log_step("Health Check Summary:")
        if not health_issues:
            log_banner("🎉 SYSTEM HEALTHY", "All checks passed successfully!", "success")
        else:
            log_banner("⚠️  ISSUES FOUND", f"{len(health_issues)} issue(s) detected", "warning")
            for issue in health_issues:
                log_error(f"• {issue}")
        
        log_section_end()
        return len(health_issues) == 0
        
    except Exception as e:
        log_error(f"Health check failed: {e}")
        log_section_end()
        return False

def export_menu():
    """Submenu for export options."""
    log_section("EXPORT ADMIN DATA")
    
    while True:
        try:
            print(f"\n{Colors.BOLD}{Colors.WHITE}Export Options:{Colors.RESET}")
            print(f"{Colors.GREEN}1.{Colors.RESET} Export to CSV")
            print(f"{Colors.YELLOW}2.{Colors.RESET} Export to JSON")
            print(f"{Colors.BLUE}3.{Colors.RESET} Export Both Formats")
            print(f"{Colors.GRAY}0.{Colors.RESET} Back to Main Menu")
            
            choice = get_secure_input("Select export format (0-3): ", allow_empty=True)
            
            if choice == '1':
                export_admin_data('csv')
            elif choice == '2':
                export_admin_data('json')
            elif choice == '3':
                export_admin_data('csv')
                export_admin_data('json')
            elif choice == '0':
                log_section_end()
                return True
            else:
                log_error("Invalid choice. Please select 0-3.")
            
            # Pause before showing submenu again
            if choice and choice != '0':
                input(f"\n{Colors.GRAY}Press Enter to continue...{Colors.RESET}")
                print("\n")
                
        except Exception as e:
            log_error(f"Export menu failed: {e}")
            input(f"\n{Colors.GRAY}Press Enter to continue...{Colors.RESET}")
            print("\n")

def create_admin_any_role():
    """Create an admin account with any role (not just superadmin)."""
    log_section("CREATE ADMIN ACCOUNT")
    
    try:
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
        
        # Get role
        log_substep("Select role:")
        print(f"{Colors.GREEN}1.{Colors.RESET} Moderator")
        print(f"{Colors.YELLOW}2.{Colors.RESET} Admin")
        print(f"{Colors.RED}3.{Colors.RESET} Superadmin")
        
        role_choice = get_secure_input("Enter role choice (1-3): ")
        if not role_choice:
            return False
        
        role_map = {'1': 'moderator', '2': 'admin', '3': 'superadmin'}
        if role_choice not in role_map:
            log_error("Invalid role choice. Operation cancelled.")
            return False
        
        role = role_map[role_choice]
        
        # Get password
        log_substep("Password (min 8 chars, must include: uppercase, lowercase):")
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
        log_data("Role", role)
        
        confirm = get_secure_input("Create this admin account? (y/N): ", allow_empty=True)
        if confirm.lower() != 'y':
            log_info("Operation cancelled.")
            return False
        
        # Create the account
        log_step("Creating admin account...")
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
        admin = Admin(
            username=username,
            email=email if email else None,  # Set to None if empty
            password=hashed_password,
            role=role
        )
        
        db.session.add(admin)
        db.session.commit()
        
        log_success(f"Admin account '{username}' created successfully with role '{role}'!")
        log_banner("✅ ADMIN CREATED", f"Username: {username} | Role: {role}", "success")
        log_section_end()
        return True
        
    except Exception as e:
        db.session.rollback()
        log_error(f"Failed to create admin account: {e}")
        log_section_end()
        return False

def list_disabled_admins():
    """List all disabled admin accounts."""
    log_section("DISABLED ADMIN ACCOUNTS")
    
    try:
        disabled_admins = Admin.query.filter_by(disabled=True).all()
        
        if not disabled_admins:
            log_info("No disabled admin accounts found.")
            return False
        
        log_step(f"Found {len(disabled_admins)} disabled admin account(s):")
        
        # Header
        print(f"\n{Colors.BOLD}{Colors.WHITE}{'ID':<4} {'Username':<20} {'Email':<30} {'Role':<15} {'Disabled Since':<20}{Colors.RESET}")
        print(f"{Colors.GRAY}{'─' * 4} {'─' * 20} {'─' * 30} {'─' * 15} {'─' * 20}{Colors.RESET}")
        
        for admin in disabled_admins:
            disabled_date = admin.updated_at.strftime('%Y-%m-%d %H:%M') if admin.updated_at else 'Unknown'
            email_display = admin.email if admin.email else 'Not provided'
            
            print(f"{Colors.RED}{admin.id:<4} {admin.username:<20} {email_display:<30} "
                  f"{admin.role:<15} {disabled_date:<20}{Colors.RESET}")
        
        log_section_end()
        return True
        
    except Exception as e:
        log_error(f"Failed to list disabled admins: {e}")
        log_section_end()
        return False

def batch_restore_admins():
    """Restore multiple disabled admin accounts at once."""
    log_section("BATCH RESTORE DISABLED ADMINS")
    
    try:
        disabled_admins = Admin.query.filter_by(disabled=True).all()
        
        if not disabled_admins:
            log_info("No disabled admin accounts found to restore.")
            return False
        
        # Show disabled admins
        list_disabled_admins()
        
        log_step("Restore Options:")
        print(f"{Colors.GREEN}1.{Colors.RESET} Restore all disabled admins")
        print(f"{Colors.YELLOW}2.{Colors.RESET} Restore specific admins by username")
        print(f"{Colors.GRAY}3.{Colors.RESET} Cancel")
        
        choice = get_secure_input("Select option (1-3): ")
        if not choice or choice == '3':
            log_info("Operation cancelled.")
            return False
        
        if choice == '1':
            # Restore all disabled admins
            log_warning(f"This will restore ALL {len(disabled_admins)} disabled admin accounts.")
            confirm = get_secure_input("Are you sure? (y/N): ").lower()
            if confirm != 'y':
                log_info("Operation cancelled.")
                return False
            
            restored_count = 0
            for admin in disabled_admins:
                try:
                    admin.disabled = False
                    admin.updated_at = datetime.now()
                    restored_count += 1
                    log_success(f"🔓 Restored: {admin.username} ({admin.role})")
                except Exception as e:
                    log_error(f"Failed to restore {admin.username}: {e}")
            
            db.session.commit()
            log_banner("✅ BATCH RESTORE COMPLETE", f"Restored {restored_count} admin accounts", "success")
            
        elif choice == '2':
            # Restore specific admins
            usernames_input = get_secure_input("Enter usernames separated by commas: ")
            if not usernames_input:
                return False
            
            usernames = [name.strip() for name in usernames_input.split(',')]
            restored_count = 0
            
            for username in usernames:
                admin = Admin.query.filter_by(username=username).first()
                if not admin:
                    log_error(f"Admin '{username}' not found.")
                    continue
                
                if not admin.disabled:
                    log_warning(f"Admin '{username}' is not disabled.")
                    continue
                
                try:
                    admin.disabled = False
                    admin.updated_at = datetime.now()
                    restored_count += 1
                    log_success(f"🔓 Restored: {username} ({admin.role})")
                except Exception as e:
                    log_error(f"Failed to restore {username}: {e}")
            
            db.session.commit()
            log_banner("✅ SELECTIVE RESTORE COMPLETE", f"Restored {restored_count} admin accounts", "success")
        
        log_section_end()
        return True
        
    except Exception as e:
        db.session.rollback()
        log_error(f"Batch restore failed: {e}")
        log_section_end()
        return False

def quick_setup_wizard():
    """Quick setup wizard for first-time users."""
    log_section("AMANFLIX QUICK SETUP WIZARD")
    
    try:
        # Check if any admins exist
        admin_count = Admin.query.count()
        
        if admin_count > 0:
            log_info(f"Found {admin_count} existing admin account(s).")
            choice = get_secure_input("Run setup wizard anyway? (y/N): ").lower()
            if choice != 'y':
                return False
        
        log_banner("🚀 WELCOME TO AMANFLIX", "Let's set up your admin accounts!", "info")
        
        # Step 1: Create first superadmin
        log_step("Step 1: Create your first superadmin account")
        log_info("This account will have full system access.")
        
        if not create_superadmin():
            log_error("Failed to create superadmin. Setup cancelled.")
            return False
        
        # Step 2: Optional - Create additional admins
        log_step("Step 2: Create additional admin accounts (optional)")
        choice = get_secure_input("Would you like to create additional admin accounts? (y/N): ").lower()
        
        if choice == 'y':
            while True:
                if not create_admin_any_role():
                    break
                
                another = get_secure_input("Create another admin account? (y/N): ").lower()
                if another != 'y':
                    break
        
        # Step 3: Create database backup
        log_step("Step 3: Create initial database backup")
        backup_path = create_backup()
        if backup_path:
            log_success(f"Initial backup created: {backup_path}")
        
        # Step 4: Generate setup report
        log_step("Step 4: Generate setup summary")
        final_admin_count = Admin.query.count()
        superadmin_count = Admin.query.filter_by(role='superadmin').count()
        
        log_banner("✅ SETUP COMPLETE", "Your Amanflix admin system is ready!", "success")
        log_data("Total Admin Accounts", final_admin_count)
        log_data("Superadmin Accounts", superadmin_count)
        log_data("Database Backup", "Created" if backup_path else "Skipped")
        
        log_info("🎯 Next Steps:")
        log_info("• Test login with your new admin account")
        log_info("• Configure user permissions as needed")
        log_info("• Set up regular database backups")
        log_info("• Review security settings")
        
        log_section_end()
        return True
        
    except Exception as e:
        log_error(f"Setup wizard failed: {e}")
        log_section_end()
        return False

def run_database_migration():
    """Run database migrations using Flask-Migrate."""
    log_section("DATABASE MIGRATION")
    
    while True:
        try:
            log_step("Database Migration Options")
            print(f"\n{Colors.BOLD}{Colors.WHITE}Migration Options:{Colors.RESET}")
            print(f"{Colors.GREEN}1.{Colors.RESET} Initialize Migration Repository (First Time Setup)")
            print(f"{Colors.BLUE}2.{Colors.RESET} Generate New Migration")
            print(f"{Colors.YELLOW}3.{Colors.RESET} Apply Migrations (Upgrade Database)")
            print(f"{Colors.CYAN}4.{Colors.RESET} Show Current Migration Status")
            print(f"{Colors.MAGENTA}5.{Colors.RESET} Show Migration History")
            print(f"{Colors.RED}6.{Colors.RESET} Downgrade Database (Previous Migration)")
            print(f"{Colors.GRAY}7.{Colors.RESET} Cleanup Migration Backups")
            print(f"{Colors.YELLOW}0.{Colors.RESET} Back to Main Menu")
            
            choice = get_secure_input("Select migration operation (0-7): ", allow_empty=True)
            
            if choice == '1':
                initialize_migration_repo()
            elif choice == '2':
                generate_migration()
            elif choice == '3':
                apply_migrations()
            elif choice == '4':
                show_migration_status()
            elif choice == '5':
                show_migration_history()
            elif choice == '6':
                downgrade_database()
            elif choice == '7':
                cleanup_migration_backups()
            elif choice == '0':
                log_section_end()
                return True
            else:
                log_error("Invalid choice. Please select 0-7.")
            
            # Pause before showing submenu again
            if choice and choice != '0':
                input(f"\n{Colors.GRAY}Press Enter to continue...{Colors.RESET}")
                print("\n")
                
        except Exception as e:
            log_error(f"Migration menu failed: {e}")
            input(f"\n{Colors.GRAY}Press Enter to continue...{Colors.RESET}")
            print("\n")

def initialize_migration_repo():
    """Initialize Flask-Migrate repository."""
    try:
        log_step("Initializing migration repository...")
        
        # Check if migrations directory already exists
        if os.path.exists('migrations'):
            log_warning("Migration repository already exists.")
            choice = get_secure_input("Reinitialize? This will remove existing migration history (y/N): ").lower()
            if choice != 'y':
                return True
            
            # Create backup directory in backups folder
            os.makedirs(CONFIG['BACKUP_DIR'], exist_ok=True)
            backup_dir = os.path.join(CONFIG['BACKUP_DIR'], f"migrations_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
            shutil.move('migrations', backup_dir)
            log_info(f"Existing migrations backed up to: {backup_dir}")
        
        # Run flask db init
        result = subprocess.run(['flask', 'db', 'init'], 
                              capture_output=True, text=True, cwd=os.getcwd())
        
        if result.returncode == 0:
            log_success("Migration repository initialized successfully!")
            log_info("You can now generate migrations with option 2.")
            return True
        else:
            log_error(f"Failed to initialize migration repository:")
            log_error(result.stderr)
            return False
            
    except Exception as e:
        log_error(f"Failed to initialize migration repository: {e}")
        return False

def generate_migration():
    """Generate a new migration."""
    try:
        log_step("Generating new migration...")
        
        # Check if migrations directory exists
        if not os.path.exists('migrations'):
            log_error("Migration repository not initialized. Please run option 1 first.")
            return False
        
        # Get migration message
        message = get_secure_input("Enter migration message (optional): ", allow_empty=True)
        if not message:
            message = f"Auto-generated migration {datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # Run flask db migrate
        cmd = ['flask', 'db', 'migrate', '-m', message]
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=os.getcwd())
        
        if result.returncode == 0:
            log_success(f"Migration generated successfully: {message}")
            log_info("Review the migration file in migrations/versions/ before applying.")
            log_info("Use option 3 to apply the migration to the database.")
            return True
        else:
            log_error(f"Failed to generate migration:")
            log_error(result.stderr)
            return False
            
    except Exception as e:
        log_error(f"Failed to generate migration: {e}")
        return False

def apply_migrations():
    """Apply pending migrations to the database."""
    try:
        log_step("Applying database migrations...")
        
        # Check if migrations directory exists
        if not os.path.exists('migrations'):
            log_error("Migration repository not initialized. Please run option 1 first.")
            return False
        
        # Create backup before migration
        log_substep("Creating database backup before migration...")
        backup_path = create_backup()
        if backup_path:
            log_success(f"Backup created: {backup_path}")
        
        # Show current status first
        log_substep("Checking migration status...")
        status_result = subprocess.run(['flask', 'db', 'current'], 
                                     capture_output=True, text=True, cwd=os.getcwd())
        
        if status_result.returncode == 0:
            current_revision = status_result.stdout.strip()
            if current_revision:
                log_info(f"Current database revision: {current_revision}")
            else:
                log_info("Database is not versioned yet.")
        
        # Confirm migration
        log_warning("This will modify your database structure.")
        confirm = get_secure_input("Continue with migration? (y/N): ").lower()
        if confirm != 'y':
            log_info("Migration cancelled.")
            return True
        
        # Run flask db upgrade
        result = subprocess.run(['flask', 'db', 'upgrade'], 
                              capture_output=True, text=True, cwd=os.getcwd())
        
        if result.returncode == 0:
            log_success("Database migrations applied successfully!")
            log_info("Database schema is now up to date.")
            return True
        else:
            log_error(f"Failed to apply migrations:")
            log_error(result.stderr)
            log_warning("Database may be in an inconsistent state.")
            if backup_path:
                log_info(f"Restore from backup if needed: {backup_path}")
            return False
            
    except Exception as e:
        log_error(f"Failed to apply migrations: {e}")
        return False

def show_migration_status():
    """Show current migration status."""
    try:
        log_step("Checking migration status...")
        
        # Check if migrations directory exists
        if not os.path.exists('migrations'):
            log_error("Migration repository not initialized. Please run option 1 first.")
            return False
        
        # Get current revision
        current_result = subprocess.run(['flask', 'db', 'current'], 
                                      capture_output=True, text=True, cwd=os.getcwd())
        
        # Get head revision
        heads_result = subprocess.run(['flask', 'db', 'heads'], 
                                    capture_output=True, text=True, cwd=os.getcwd())
        
        if current_result.returncode == 0 and heads_result.returncode == 0:
            current_revision = current_result.stdout.strip()
            head_revision = heads_result.stdout.strip()
            
            print(f"\n{Colors.BOLD}{Colors.WHITE}Migration Status:{Colors.RESET}")
            print(f"{Colors.CYAN}Current Database Revision:{Colors.RESET} {current_revision if current_revision else 'None (not versioned)'}")
            print(f"{Colors.CYAN}Latest Available Revision:{Colors.RESET} {head_revision if head_revision else 'None'}")
            
            if current_revision == head_revision:
                log_success("✅ Database is up to date!")
            elif not current_revision:
                log_warning("⚠️  Database is not versioned. Run migrations to version it.")
            else:
                log_warning("⚠️  Database needs migration. There are pending migrations.")
            
            return True
        else:
            log_error("Failed to check migration status.")
            return False
            
    except Exception as e:
        log_error(f"Failed to check migration status: {e}")
        return False

def show_migration_history():
    """Show migration history."""
    try:
        log_step("Showing migration history...")
        
        # Check if migrations directory exists
        if not os.path.exists('migrations'):
            log_error("Migration repository not initialized. Please run option 1 first.")
            return False
        
        # Run flask db history
        result = subprocess.run(['flask', 'db', 'history'], 
                              capture_output=True, text=True, cwd=os.getcwd())
        
        if result.returncode == 0:
            if result.stdout.strip():
                print(f"\n{Colors.BOLD}{Colors.WHITE}Migration History:{Colors.RESET}")
                print(result.stdout)
            else:
                log_info("No migration history found.")
            return True
        else:
            log_error(f"Failed to get migration history:")
            log_error(result.stderr)
            return False
            
    except Exception as e:
        log_error(f"Failed to get migration history: {e}")
        return False

def downgrade_database():
    """Downgrade database to previous migration."""
    try:
        log_step("Database downgrade...")
        
        # Check if migrations directory exists
        if not os.path.exists('migrations'):
            log_error("Migration repository not initialized. Please run option 1 first.")
            return False
        
        # Show current status
        show_migration_status()
        
        # Get downgrade target
        target = get_secure_input("Enter target revision (or 'previous' for one step back): ", allow_empty=True)
        if not target:
            target = '-1'  # One step back
        elif target.lower() == 'previous':
            target = '-1'
        
        # Create backup before downgrade
        log_substep("Creating database backup before downgrade...")
        backup_path = create_backup()
        if backup_path:
            log_success(f"Backup created: {backup_path}")
        
        # Confirm downgrade
        log_warning("This will modify your database structure and may result in data loss.")
        confirm = get_secure_input("Continue with downgrade? (y/N): ").lower()
        if confirm != 'y':
            log_info("Downgrade cancelled.")
            return True
        
        # Run flask db downgrade
        result = subprocess.run(['flask', 'db', 'downgrade', target], 
                              capture_output=True, text=True, cwd=os.getcwd())
        
        if result.returncode == 0:
            log_success("Database downgrade completed successfully!")
            return True
        else:
            log_error(f"Failed to downgrade database:")
            log_error(result.stderr)
            log_warning("Database may be in an inconsistent state.")
            if backup_path:
                log_info(f"Restore from backup if needed: {backup_path}")
            return False
            
    except Exception as e:
        log_error(f"Failed to downgrade database: {e}")
        return False

def cleanup_migration_backups():
    """Clean up any old migration backup directories."""
    try:
        log_step("Cleaning up migration backup directories...")
        
        # Look for migration backup directories in current directory
        current_dir_backups = [d for d in os.listdir('.') if d.startswith('migrations_backup_')]
        
        # Look for migration backup directories in backups folder
        backup_dir_backups = []
        if os.path.exists(CONFIG['BACKUP_DIR']):
            backup_dir_backups = [d for d in os.listdir(CONFIG['BACKUP_DIR']) if d.startswith('migrations_backup_')]
        
        total_backups = len(current_dir_backups) + len(backup_dir_backups)
        
        if total_backups == 0:
            log_info("No migration backup directories found.")
            return True
        
        log_info(f"Found {total_backups} migration backup directories:")
        
        # List current directory backups
        for backup in current_dir_backups:
            log_info(f"  - {backup} (in current directory)")
        
        # List backups directory backups
        for backup in backup_dir_backups:
            log_info(f"  - {backup} (in backups directory)")
        
        # Ask user what to do
        print(f"\n{Colors.YELLOW}Cleanup Options:{Colors.RESET}")
        print("1. Remove all migration backups")
        print("2. Keep backups (no action)")
        print("3. Move current directory backups to backups folder")
        
        choice = get_secure_input("Select cleanup option (1-3): ", allow_empty=True)
        
        if choice == '1':
            # Remove all backups
            removed_count = 0
            for backup in current_dir_backups:
                try:
                    shutil.rmtree(backup)
                    log_info(f"Removed: {backup}")
                    removed_count += 1
                except Exception as e:
                    log_error(f"Failed to remove {backup}: {e}")
            
            for backup in backup_dir_backups:
                try:
                    backup_path = os.path.join(CONFIG['BACKUP_DIR'], backup)
                    shutil.rmtree(backup_path)
                    log_info(f"Removed: {backup_path}")
                    removed_count += 1
                except Exception as e:
                    log_error(f"Failed to remove {backup_path}: {e}")
            
            log_success(f"Removed {removed_count} migration backup directories.")
            
        elif choice == '3':
            # Move current directory backups to backups folder
            os.makedirs(CONFIG['BACKUP_DIR'], exist_ok=True)
            moved_count = 0
            
            for backup in current_dir_backups:
                try:
                    dest_path = os.path.join(CONFIG['BACKUP_DIR'], backup)
                    shutil.move(backup, dest_path)
                    log_info(f"Moved {backup} to {dest_path}")
                    moved_count += 1
                except Exception as e:
                    log_error(f"Failed to move {backup}: {e}")
            
            log_success(f"Moved {moved_count} migration backup directories to backups folder.")
        
        else:
            log_info("No cleanup performed.")
        
        return True
        
    except Exception as e:
        log_error(f"Failed to cleanup migration backups: {e}")
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
                choice = get_secure_input("Enter your choice (0-15): ", allow_empty=True)
            
            if not choice:
                continue
            
            with app.app_context():
                if choice == '1':
                    create_superadmin()
                elif choice == '2':
                    create_admin_any_role()
                elif choice == '3':
                    display_admin_list()
                elif choice == '4':
                    delete_admin()
                elif choice == '5':
                    change_admin_password()
                elif choice == '6':
                    toggle_admin_status()
                elif choice == '7':
                    list_disabled_admins()
                elif choice == '8':
                    batch_restore_admins()
                elif choice == '9':
                    bulk_create_admins()
                elif choice == '10':
                    export_menu()
                elif choice == '11':
                    generate_admin_report()
                elif choice == '12':
                    create_backup()
                elif choice == '13':
                    system_health_check()
                elif choice == '14':
                    quick_setup_wizard()
                elif choice == '15':
                    run_database_migration()
                elif choice == '0':
                    log_banner("👋 GOODBYE", "Thank you for using Amanflix Admin Manager!", "info")
                    break
                else:
                    log_error("Invalid choice. Please select 0-15.")
            
            # Pause before showing menu again
            if choice != '0':
                input(f"\n{Colors.GRAY}Press Enter to continue...{Colors.RESET}")
                print("\n" * 2)  # Clear screen effect
    
    except KeyboardInterrupt:
        log_warning("\n\nOperation cancelled by user. Goodbye!")
    except Exception as e:
        log_error(f"Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()