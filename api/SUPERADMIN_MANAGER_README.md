# Amanflix Superadmin Management Tool - Enhanced Features

This document outlines all the enhanced features added to the `create_superadmin.py` script.

## 🚀 What's New

The script has been significantly enhanced with comprehensive admin management capabilities, security features, and system tools.

## 📋 Feature Overview

### 🔐 Account Management
1. **Create Superadmin Account** - Original functionality with enhanced validation
2. **Create Admin Account (Any Role)** - Create accounts with moderator, admin, or superadmin roles
3. **View All Admin Accounts** - Enhanced table display with role colors
4. **Delete Admin Account** - Safety checks to prevent deleting last superadmin
5. **Change Admin Password** - Secure password updates with validation
6. **Toggle Admin Status** - Enable/disable accounts (requires database schema update)

### 📊 Bulk Operations
7. **Bulk Create Admins (from CSV)** - Import multiple admin accounts from CSV files
8. **Export Admin Data** - Export to CSV, JSON, or both formats

### 🔧 System Tools
9. **Generate Admin Analytics Report** - Comprehensive reporting and analytics
10. **Create Database Backup** - Automatic backup creation with timestamps
11. **System Health Check** - Complete system diagnostics and health monitoring

## 🛡️ Enhanced Security Features

### Password Validation
- **Minimum 8 characters** (configurable)
- **Uppercase, lowercase, digits, and special characters required**
- **Common weak pattern detection** (123, abc, password, etc.)
- **Forbidden username checking**

### Email Validation
- **Proper email format validation**
- **Domain restrictions** (configurable)
- **Duplicate email prevention**

### Username Validation
- **3-50 character length**
- **Alphanumeric, underscore, and hyphen only**
- **Cannot start with numbers**
- **Forbidden username list** (admin, root, superuser, etc.)

## 📁 Directory Structure

The script creates and manages the following directories:
```
api/
├── backups/           # Database backups with timestamps
├── exports/           # Exported admin data (CSV/JSON)
├── logs/             # Application logs
└── instance/         # Database files
```

## 🔧 Configuration

The script includes configurable constants:

```python
CONFIG = {
    'MIN_PASSWORD_LENGTH': 8,
    'MAX_LOGIN_ATTEMPTS': 3,
    'PASSWORD_EXPIRY_DAYS': 90,
    'BACKUP_DIR': 'backups',
    'EXPORT_DIR': 'exports',
    'ALLOWED_EMAIL_DOMAINS': [],  # Empty = all domains allowed
    'FORBIDDEN_USERNAMES': ['admin', 'root', 'superuser', 'administrator', 'system']
}
```

## 📈 Bulk Admin Creation

### CSV Format
Create a CSV file with the following structure:
```csv
username,email,password,role
john_admin,john@example.com,SecurePass123!,admin
jane_mod,jane@example.com,StrongPass456!,moderator
```

### Supported Roles
- `superadmin` - Full system access
- `admin` - Administrative access
- `moderator` - Limited access

### Example File
Use the provided `bulk_admin_example.csv` as a template.

## 📊 Analytics Report Features

The analytics report provides:
- **Total admin counts by role**
- **Account creation timeline**
- **Email domain analysis**
- **Security recommendations**
- **Recent activity (last 30 days)**

## 🔍 System Health Check

Comprehensive system diagnostics including:
- ✅ Database connectivity test
- ✅ Admin account integrity check
- ✅ File system permissions verification
- ✅ Backup directory status
- ✅ Configuration validation
- ✅ Security policy compliance

## 💾 Backup & Export Features

### Automatic Backups
- Created before bulk operations
- Timestamped filenames
- Stored in `backups/` directory

### Export Options
- **CSV Format**: Spreadsheet-compatible
- **JSON Format**: API-compatible
- **Both Formats**: Complete data export

## 🎯 Usage Examples

### 1. Create a Single Admin
```bash
python create_superadmin.py
# Choose option 1 or 2 depending on role needed
```

### 2. Bulk Create from CSV
```bash
python create_superadmin.py
# Choose option 7, provide CSV file path
```

### 3. Generate Analytics Report
```bash
python create_superadmin.py
# Choose option 9 for comprehensive analytics
```

### 4. System Health Check
```bash
python create_superadmin.py
# Choose option 11 for full system diagnostics
```

## 🚨 Security Recommendations

1. **Multiple Superadmins**: Always maintain at least 2 superadmin accounts
2. **Email Addresses**: Ensure all admins have valid email addresses
3. **Regular Backups**: Create backups before major changes
4. **Health Checks**: Run system health checks regularly
5. **Password Policies**: Use strong passwords meeting all requirements

## 🔮 Future Enhancements

To implement the "Toggle Admin Status" feature:
1. Add `is_active = db.Column(db.Boolean, default=True)` to the Admin model
2. Update login logic to check `is_active` status
3. Modify admin routes to respect active status

## 🐛 Troubleshooting

### Common Issues
1. **Database Connection Failed**: Check if Flask app is properly configured
2. **Permission Denied**: Ensure write permissions for backup/export directories
3. **CSV Import Errors**: Verify CSV format matches required structure
4. **Validation Failures**: Check password/username requirements

### Log Files
Check the following log files for detailed error information:
- `logs/amanflix.log` - General application logs
- `logs/api_requests.log` - API request logs

## 📞 Support

For issues or questions:
1. Check the logs for detailed error messages
2. Run system health check (option 11)
3. Verify configuration settings
4. Ensure database connectivity

---

**Note**: This enhanced version maintains backward compatibility while adding powerful new features for comprehensive admin management.
