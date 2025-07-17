# Amanflix Load Testing Suite - Implementation Summary

## Overview

I've created a comprehensive load testing suite for the Amanflix streaming platform API specifically designed to identify and reproduce database locking issues, particularly around watch history operations. The suite consists of several files working together to provide thorough testing capabilities.

## Files Created

### 1. `amanflix_load_test.py` - Main Load Testing Engine
**Purpose**: The core load testing application that simulates realistic user behavior and stress-tests the API.

**Key Features**:
- **Concurrent User Simulation**: Creates 50-200 simulated users with realistic behavior patterns
- **Database Lock Detection**: Specifically targets watch history operations that commonly cause SQLite database locks
- **Burst Mode**: Simulates sudden traffic spikes to trigger contention scenarios
- **Comprehensive Metrics**: Tracks response times, error rates, and database lock occurrences
- **JWT Authentication**: Proper token management for all API calls
- **Session Management**: Handles user sessions and heartbeats
- **Automatic Cleanup**: Removes test data and users after completion

**Critical Testing Scenarios**:
- Multiple users updating watch history simultaneously
- Rapid consecutive updates to the same content
- Transaction collision scenarios
- High-frequency database writes
- Concurrent updates from different sessions

### 2. `requirements.txt` - Dependencies
Lists the Python packages needed:
- `aiohttp==3.9.1` - Asynchronous HTTP client for concurrent requests
- `asyncio-pool==0.5.2` - Additional async utilities

### 3. `README.md` - Comprehensive Documentation
**Contains**:
- Detailed installation and usage instructions
- Command-line options and examples
- Test strategy explanation
- Results interpretation guide
- Troubleshooting section
- Performance tuning recommendations

### 4. `run_test.sh` - Interactive Test Runner
**Purpose**: Bash script that provides a menu-driven interface for running common test configurations.

**Test Configurations**:
- Quick Test (25 users, 5 minutes)
- Standard Test (100 users, 10 minutes)
- Heavy Load Test (200 users, 15 minutes)
- Database Stress Test (150 users, focus on watch history)
- Stability Test (50 users, 30 minutes)
- Custom Test (user-defined parameters)

### 5. `config_template.json` - Configuration Template
**Purpose**: JSON template for advanced configuration options including:
- API settings and timeouts
- Test parameters and user behavior
- Watch history focus settings
- Error detection patterns
- Logging and reporting options

### 6. `validate_api.py` - Connection Validator
**Purpose**: Quick validation script to verify API connectivity before running full load tests.

**Validation Steps**:
1. Basic connectivity test
2. User registration test
3. Authentication verification
4. Content endpoint access
5. Watch history functionality
6. User cleanup

## How It Works

### User Simulation Strategy
The load tester creates realistic user sessions that:

1. **Register/Login**: Creates unique test users with proper authentication
2. **Browse Content**: Simulates browsing movies and TV shows
3. **Watch Content**: Updates watch history with realistic progress tracking
4. **Manage Lists**: Adds/removes content from personal lists
5. **Search**: Performs content searches with various terms
6. **Maintain Sessions**: Sends regular heartbeats to analytics endpoints

### Database Lock Detection
The suite is specifically designed to trigger database locks through:

- **Concurrent Watch Updates**: Multiple users updating the same content simultaneously
- **Rapid Fire Updates**: Consecutive updates with minimal delays (< 1 second)
- **Transaction Contention**: High volume of simultaneous database writes
- **Burst Traffic**: Sudden spikes in user activity

### Key Testing Ratios
- **70% Read Operations**: Browsing, searching, profile access
- **30% Write Operations**: Watch history updates, list modifications
- **80% of Writes**: Focus on watch history (the critical area for locks)
- **30% Rapid Updates**: Probability of consecutive rapid updates

## Usage Examples

### Basic Load Test
```bash
python amanflix_load_test.py
```
Runs default configuration: 100 users for 10 minutes

### High Stress Test
```bash
python amanflix_load_test.py --users 200 --duration 15 --max-concurrent 100
```
Maximum stress test to trigger database locks

### Database Focus Test
```bash
python amanflix_load_test.py --users 150 --focus-watch-history --duration 12
```
Concentrates on watch history operations

### Interactive Menu
```bash
./run_test.sh
```
Provides user-friendly menu for test selection

## Expected Outcomes

### Successful Database Lock Detection
When database locks occur, you'll see output like:
```
⚠️  DATABASE LOCK ISSUES DETECTED!
Total Database Lock Errors: 23
Lock Error Rate: 0.15%

Top Users with Lock Errors:
  1. loadtest_user_45: 5 lock errors
  2. loadtest_user_78: 4 lock errors
```

### Performance Metrics
The suite provides comprehensive metrics:
- **Response Times**: Average, min, max, P95, P99
- **Throughput**: Requests per second
- **Error Rates**: Overall and database-specific
- **User Statistics**: Per-user performance data

### Detailed Reports
Two types of output:
1. **Console Summary**: Real-time progress and final results
2. **JSON Report**: Detailed metrics for analysis and archiving

## Installation and Setup

1. **Navigate to the stress_tests directory**:
   ```bash
   cd /Users/almogcohen/Documents/Developer/Python/Amanflix-online/stress_tests
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Ensure API is running**:
   ```bash
   cd ../api
   python app.py
   ```

4. **Validate connection**:
   ```bash
   python validate_api.py
   ```

5. **Run load test**:
   ```bash
   python amanflix_load_test.py
   # or
   ./run_test.sh
   ```

## Key Benefits

### For Database Lock Detection
- **Targeted Testing**: Specifically designed to trigger SQLite lock conditions
- **Realistic Scenarios**: Simulates actual streaming platform usage patterns
- **Detailed Error Tracking**: Identifies which operations and users encounter locks
- **Reproduction Capability**: Can consistently reproduce lock conditions for debugging

### For Performance Analysis
- **Comprehensive Metrics**: Tracks all relevant performance indicators
- **Concurrent Load**: Tests system behavior under realistic concurrent usage
- **Bottleneck Identification**: Helps identify system limitations and bottlenecks
- **Scalability Testing**: Validates system performance at different user loads

### For Development and Debugging
- **Error Pattern Analysis**: Identifies common failure scenarios
- **Performance Regression Testing**: Can be used for continuous performance monitoring
- **Load Capacity Planning**: Helps determine system capacity limits
- **API Endpoint Validation**: Tests all critical API endpoints under load

## Customization Options

The load testing suite is highly configurable:

- **User Count**: 1-500+ concurrent users
- **Test Duration**: Minutes to hours
- **Operation Mix**: Adjustable read/write ratios
- **Focus Areas**: Can emphasize specific API endpoints
- **Error Handling**: Configurable retry logic and error detection
- **Reporting**: Customizable output formats and detail levels

This comprehensive load testing suite provides everything needed to identify, reproduce, and analyze database locking issues in the Amanflix streaming platform while also serving as a general-purpose API load testing tool.
