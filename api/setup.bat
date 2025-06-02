@echo off
REM Amanflix API Setup Script for Windows
echo Setting up Amanflix API...

REM Check for required CDN directories FIRST
echo Checking required CDN directories...
set "SETUP_FAILED=0"

if not exist "cdn\files" (
    echo [X] CDN files directory does not exist
    set "SETUP_FAILED=1"
) else (
    echo [OK] CDN files directory exists
)

if not exist "cdn\posters_combined" (
    echo [X] CDN posters directory does not exist
    set "SETUP_FAILED=1"
) else (
    echo [OK] CDN posters directory exists
)

if "%SETUP_FAILED%"=="1" (
    echo.
    echo [X] SETUP FAILED: Required CDN directories are missing
    echo Please create the following directories before running setup:
    echo   - cdn\files\
    echo   - cdn\posters_combined\
    echo.
    echo Required files in cdn\files\:
    echo   - movies_little_clean.json
    echo   - tv_little_clean.json
    echo   - movies_with_images.json
    echo   - tv_with_images.json
    pause
    exit /b 1
)

echo [OK] All required CDN directories are ready
echo.

REM Check Python version
echo Checking Python version...
python --version

REM Create virtual environment (optional but recommended)
echo Creating virtual environment...
python -m venv venv
call venv\Scripts\activate

REM Install Python requirements
echo Installing Python packages...
python -m pip install --upgrade pip
pip install -r requirements.txt

REM Check FFMPEG installation
echo Checking FFMPEG installation...
ffmpeg -version >nul 2>&1
if %errorlevel% == 0 (
    echo [OK] FFMPEG is installed and ready
) else (
    echo [X] FFMPEG is not installed
    echo Please install FFMPEG from https://ffmpeg.org/
    echo Add it to your system PATH
)
REM Initialize database
echo Initializing database...
python -c "from app import app, db; app.app_context().push(); db.create_all(); print('Database initialized successfully')" 2>nul
if %errorlevel% neq 0 (
    echo Database initialization failed. Make sure all requirements are installed.
    pause
    exit /b 1
)

REM Create superadmin (optional)
echo To create a superadmin user, run:
echo python create_superadmin.py

echo Setup complete! Run 'python app.py' to start the server.
pause
