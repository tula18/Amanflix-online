# Amanflix Load Testing Suite

A comprehensive load testing tool specifically designed for the Amanflix streaming platform API, with a focus on identifying and reproducing database locking issues, particularly around watch history operations.

## Features

- **Concurrent User Simulation**: Simulate 50-200 concurrent users with realistic behavior patterns
- **Database Lock Detection**: Specifically designed to trigger and detect "database is locked" errors
- **Watch History Focus**: Heavy emphasis on watch history update operations that commonly cause contention
- **Burst Mode**: Simulates sudden traffic spikes to stress-test the system
- **Comprehensive Metrics**: Detailed performance metrics, response times, and error analysis
- **JWT Token Management**: Proper authentication handling for all API calls
- **Session Analytics**: Tracks user sessions and heartbeats
- **Realistic Streaming Patterns**: Simulates actual user viewing behavior

## Key Testing Scenarios

### 1. Authentication and User Session Flow
- Register new users or use existing accounts
- Login to obtain authentication tokens
- Maintain session heartbeats
- Create concurrent user sessions

### 2. Content Browsing Flow
- Browse TV shows and movies (random, popular, trending)
- Search for content by title, genre, or other criteria
- Access detailed content information

### 3. Watch History Simulation (Critical Focus Area)
- Multiple users updating watch history simultaneously
- Update watch progress at various intervals (start, middle, near completion)
- Rapid consecutive updates to the same watch history record
- Concurrent updates from the same user on different devices
- Transaction collision scenarios

### 4. My List Operations
- Add/remove content to personal lists
- Check content status in lists
- Retrieve full list contents

## Installation

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Ensure Amanflix API is running:**
   ```bash
   cd ../api
   python app.py
   ```
   The API should be running on `http://localhost:5001`

## Usage

### Basic Load Test
```bash
python amanflix_load_test.py
```

### Custom Configuration
```bash
# Test with 200 users for 15 minutes
python amanflix_load_test.py --users 200 --duration 15

# Test against different API endpoint
python amanflix_load_test.py --url http://192.168.1.100:5001

# Disable burst mode and cleanup
python amanflix_load_test.py --no-burst --no-cleanup

# High concurrency test
python amanflix_load_test.py --users 150 --max-concurrent 100
```

### Command Line Options

| Option | Default | Description |
|--------|---------|-------------|
| `--users` | 100 | Number of concurrent users |
| `--duration` | 10 | Test duration in minutes |
| `--url` | http://localhost:5001 | Base URL for API |
| `--max-concurrent` | 50 | Maximum concurrent requests |
| `--no-cleanup` | False | Skip cleanup of test data |
| `--focus-watch-history` | True | Focus on watch history operations |
| `--no-burst` | False | Disable burst mode |
| `--report-file` | Auto | Custom filename for detailed report |

## Test Strategy

### Concurrency Model
- Creates 50-200 simulated users
- Implements realistic viewing patterns with sudden traffic spikes
- Uses a 70/30 read/write operation ratio
- Focuses on creating transaction collisions by targeting the same resources

### Database-Specific Testing
- Deliberately creates transaction contention scenarios
- Implements rapid sequential watch history updates (< 1 second apart)
- Tests database recovery after errors
- Measures response times during high database contention

### Error Reproduction Approach
The test specifically focuses on reproducing:
- "database is locked" errors in watch history updates
- Scenarios where multiple users update watch progress for the same show/movie
- High frequency updates during streaming simulation
- Multiple clients updating watch history with different progress percentages

## Understanding the Results

### Key Metrics

1. **Database Lock Errors**: The primary metric for identifying concurrency issues
2. **Watch History Updates**: Number of successful watch progress updates
3. **Response Times**: P95 and P99 percentiles indicate system stress
4. **Throughput**: Requests per second under load
5. **Error Rate**: Overall failure percentage

### Sample Output
```
================================================================================
AMANFLIX LOAD TEST RESULTS
================================================================================
Test Duration: 600.45 seconds
Number of Users: 100
Total Requests: 15,234
Successful Requests: 14,892
Failed Requests: 342
Watch History Updates: 8,456
Database Lock Errors: 23

Performance Metrics:
Throughput: 25.38 requests/second
Error Rate: 2.25%
Average Response Time: 0.142 seconds
Min Response Time: 0.023 seconds
Max Response Time: 4.567 seconds
95th Percentile: 0.456 seconds
99th Percentile: 1.234 seconds

⚠️  DATABASE LOCK ISSUES DETECTED!
Total Database Lock Errors: 23
Lock Error Rate: 0.15%

Top Users with Lock Errors:
  1. loadtest_user_45_1721201234: 5 lock errors
  2. loadtest_user_78_1721201234: 4 lock errors
  3. loadtest_user_12_1721201234: 3 lock errors
```

### Detailed Reports

The tool generates two types of reports:

1. **Console Output**: Real-time progress and final summary
2. **JSON Report**: Detailed metrics saved to file for analysis

The JSON report includes:
- Test configuration parameters
- Aggregated performance metrics
- Per-user statistics
- Error details and patterns
- Response time distributions

## Identifying Database Lock Issues

### When Database Locks Occur
- Multiple users updating the same content's watch history simultaneously
- Rapid consecutive updates from the same user
- High frequency of database write operations
- Insufficient database connection pooling

### Common Lock Error Patterns
```
"database is locked"
"SQLite database is locked"
"database table is locked"
```

### Recommended Actions Based on Results

If database lock errors are detected:

1. **Review Database Configuration**
   - Check SQLite WAL mode settings
   - Verify connection pooling configuration
   - Consider transaction timeout settings

2. **Code Review**
   - Check for long-running transactions
   - Verify proper connection cleanup
   - Review watch history update logic

3. **Infrastructure**
   - Consider database scaling options
   - Implement connection pooling
   - Add retry logic with exponential backoff

## Test Data Management

### User Creation
- Creates unique test users with timestamp-based names
- Automatically handles user registration and authentication
- Manages JWT tokens for all API calls

### Content Selection
- Loads actual content from API endpoints
- Falls back to dummy content if API is unavailable
- Simulates realistic content selection patterns

### Cleanup
- Automatically removes test users and data (unless `--no-cleanup` is used)
- Ends user sessions properly
- Logs out all test users

## Troubleshooting

### Common Issues

1. **API Not Running**
   ```
   Error: Connection refused to localhost:5001
   ```
   Solution: Ensure the Amanflix API is running on port 5001

2. **Authentication Failures**
   ```
   Error: 401 Unauthorized
   ```
   Solution: Check API authentication endpoints and token generation

3. **High Memory Usage**
   ```
   Memory usage spikes during test
   ```
   Solution: Reduce `--users` or `--max-concurrent` values

4. **No Database Locks Detected**
   ```
   Zero database lock errors despite high load
   ```
   Solution: Increase `--users`, enable burst mode, or check database configuration

### Performance Tuning

For maximum database stress:
```bash
python amanflix_load_test.py \
  --users 200 \
  --duration 15 \
  --max-concurrent 100 \
  --focus-watch-history
```

For stability testing:
```bash
python amanflix_load_test.py \
  --users 50 \
  --duration 30 \
  --max-concurrent 25 \
  --no-burst
```

## Log Files

The test generates several log files:

- `amanflix_load_test_YYYYMMDD_HHMMSS.log`: Detailed test execution log
- `amanflix_load_test_report_YYYYMMDD_HHMMSS.json`: Comprehensive test results

## Contributing

To extend the test suite:

1. Add new test scenarios in the `_perform_read_operation` or `_perform_write_operation` methods
2. Implement additional API endpoint testing
3. Add new metrics to the `TestResults` class
4. Enhance error detection patterns

## License

This tool is part of the Amanflix project and follows the same licensing terms.
