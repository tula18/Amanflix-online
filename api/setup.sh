#!/bin/bash

# Amanflix API Setup Script for Linux/macOS
echo "Setting up Amanflix API..."

# Check for required CDN directories FIRST
echo "Checking required CDN directories..."
SETUP_FAILED=0

if [ ! -d "cdn/files" ]; then
    echo "[X] CDN files directory does not exist"
    SETUP_FAILED=1
else
    echo "[OK] CDN files directory exists"
fi

if [ ! -d "cdn/posters_combined" ]; then
    echo "[X] CDN posters directory does not exist"
    SETUP_FAILED=1
else
    echo "[OK] CDN posters directory exists"
fi

if [ $SETUP_FAILED -eq 1 ]; then
    echo ""
    echo "[X] SETUP FAILED: Required CDN directories are missing"
    echo "Please create the following directories before running setup:"
    echo "  - cdn/files/"
    echo "  - cdn/posters_combined/"
    echo ""
    echo "Required files in cdn/files/:"
    echo "  - movies_little_clean.json"
    echo "  - tv_little_clean.json"
    echo "  - movies_with_images.json"
    echo "  - tv_with_images.json"
    exit 1
fi

echo "[OK] All required CDN directories are ready"
echo ""

# Check Python version
echo "Checking Python version..."
python3 --version

# Create virtual environment (optional but recommended)
echo "Creating virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install Python requirements
echo "Installing Python packages..."
pip install --upgrade pip
pip install -r requirements.txt

# Check FFMPEG installation
echo "Checking FFMPEG installation..."
if command -v ffmpeg &> /dev/null; then
    echo "[OK] FFMPEG is installed"
    ffmpeg -version | head -1
else
    echo "[X] FFMPEG is not installed"
    echo "Please install FFMPEG:"
    echo "  Ubuntu/Debian: sudo apt install ffmpeg"
    echo "  macOS: brew install ffmpeg"
    echo "  Windows: Download from https://ffmpeg.org/"
fi

# Initialize database
echo "Initializing database..."
python3 -c "from app import app, db; app.app_context().push(); db.create_all(); print('Database initialized successfully')" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "Database initialization failed. Make sure all requirements are installed."
    exit 1
fi

# Create superadmin (optional)
echo "To create a superadmin user, run:"
echo "python3 create_superadmin.py"

echo "Setup complete! Run 'python3 app.py' to start the server."
