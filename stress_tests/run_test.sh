#!/bin/bash

# Amanflix Load Test Runner
# Quick test configurations for common scenarios

echo "Amanflix Load Testing Suite"
echo "=========================="
echo ""

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is required but not found."
    exit 1
fi

# Check if requirements are installed
python3 -c "import aiohttp" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "Installing required dependencies..."
    pip3 install -r requirements.txt
fi

# Function to check if API is running
check_api() {
    echo "Checking if Amanflix API is running..."
    curl -s http://localhost:5001/ip > /dev/null
    if [ $? -eq 0 ]; then
        echo "✓ API is running on port 5001"
        return 0
    else
        echo "✗ API is not responding on port 5001"
        echo "Please start the API server first:"
        echo "  cd ../api && python app.py"
        return 1
    fi
}

# Test configurations
run_quick_test() {
    echo "Running Quick Test (25 users, 5 minutes)..."
    python3 amanflix_load_test.py --users 25 --duration 5 --max-concurrent 15
}

run_standard_test() {
    echo "Running Standard Test (100 users, 10 minutes)..."
    python3 amanflix_load_test.py --users 100 --duration 10 --max-concurrent 50
}

run_heavy_test() {
    echo "Running Heavy Load Test (200 users, 15 minutes)..."
    python3 amanflix_load_test.py --users 200 --duration 15 --max-concurrent 100
}

run_database_stress_test() {
    echo "Running Database Stress Test (150 users, focus on watch history)..."
    python3 amanflix_load_test.py --users 150 --duration 12 --max-concurrent 80 --focus-watch-history
}

run_stability_test() {
    echo "Running Stability Test (50 users, 30 minutes, no burst)..."
    python3 amanflix_load_test.py --users 50 --duration 30 --max-concurrent 25 --no-burst
}

run_custom_test() {
    echo "Enter custom test parameters:"
    read -p "Number of users (default: 100): " users
    read -p "Duration in minutes (default: 10): " duration
    read -p "Max concurrent requests (default: 50): " concurrent
    
    users=${users:-100}
    duration=${duration:-10}
    concurrent=${concurrent:-50}
    
    echo "Running Custom Test ($users users, $duration minutes)..."
    python3 amanflix_load_test.py --users $users --duration $duration --max-concurrent $concurrent
}

# Main menu
show_menu() {
    echo ""
    echo "Select a test configuration:"
    echo "1) Quick Test (25 users, 5 min) - Good for initial testing"
    echo "2) Standard Test (100 users, 10 min) - Default configuration"
    echo "3) Heavy Load Test (200 users, 15 min) - High stress test"
    echo "4) Database Stress Test (150 users, 12 min) - Focus on DB locks"
    echo "5) Stability Test (50 users, 30 min) - Long-running test"
    echo "6) Custom Test - Enter your own parameters"
    echo "7) Exit"
    echo ""
}

# Check API first
if ! check_api; then
    exit 1
fi

# Main loop
while true; do
    show_menu
    read -p "Enter your choice (1-7): " choice
    
    case $choice in
        1)
            run_quick_test
            ;;
        2)
            run_standard_test
            ;;
        3)
            run_heavy_test
            ;;
        4)
            run_database_stress_test
            ;;
        5)
            run_stability_test
            ;;
        6)
            run_custom_test
            ;;
        7)
            echo "Exiting..."
            exit 0
            ;;
        *)
            echo "Invalid choice. Please enter 1-7."
            ;;
    esac
    
    echo ""
    read -p "Press Enter to return to menu or Ctrl+C to exit..."
done
