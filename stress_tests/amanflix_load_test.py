#!/usr/bin/env python3
"""
Amanflix Load Testing Suite
===========================

Comprehensive load testing for the Amanflix streaming platform API with focus on
identifying and reproducing database locking issues, particularly around watch history operations.

Key Features:
- Concurrent user simulation (50-200 users)
- Focus on watch history transaction contention
- Realistic streaming behavior patterns
- Database lock error reproduction
- JWT token management
- Detailed error logging and performance metrics

Author: Amanflix Team
Date: July 2025
"""

import asyncio
import aiohttp
import json
import random
import time
import logging
import statistics
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor
import uuid
import argparse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(f'amanflix_load_test_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

@dataclass
class TestConfig:
    """Test configuration parameters"""
    base_url: str = "http://localhost:5001"
    num_users: int = 100
    test_duration_minutes: int = 10
    max_concurrent_requests: int = 50
    read_write_ratio: float = 0.7  # 70% reads, 30% writes
    watch_update_frequency: float = 2.0  # seconds between watch updates
    rapid_update_probability: float = 0.3  # chance of rapid consecutive updates
    session_heartbeat_interval: float = 30.0  # seconds
    cleanup_test_data: bool = True
    focus_on_watch_history: bool = True
    enable_burst_mode: bool = True  # Enable sudden traffic spikes

@dataclass
class UserStats:
    """Statistics for a single user session"""
    user_id: int = 0
    username: str = ""
    token: str = ""
    session_id: str = ""
    requests_sent: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    database_lock_errors: int = 0
    watch_history_updates: int = 0
    response_times: List[float] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    current_content: Optional[Dict] = None
    watch_progress: float = 0.0
    last_heartbeat: float = 0.0

@dataclass
class TestResults:
    """Overall test results and metrics"""
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    database_lock_errors: int = 0
    watch_history_updates: int = 0
    avg_response_time: float = 0.0
    max_response_time: float = 0.0
    min_response_time: float = 0.0
    p95_response_time: float = 0.0
    p99_response_time: float = 0.0
    throughput_rps: float = 0.0
    error_rate: float = 0.0
    user_stats: List[UserStats] = field(default_factory=list)
    start_time: datetime = field(default_factory=datetime.now)
    end_time: Optional[datetime] = None

class AmanflixLoadTester:
    """Main load testing class for Amanflix API"""
    
    def __init__(self, config: TestConfig):
        self.config = config
        self.results = TestResults()
        self.test_users: List[UserStats] = []
        self.content_catalog: List[Dict] = []
        self.tv_catalog: List[Dict] = []
        self.running = False
        
    async def setup_test_environment(self):
        """Initialize test environment and load content catalogs"""
        logger.info("Setting up test environment...")
        
        async with aiohttp.ClientSession() as session:
            # Load content catalogs for realistic testing
            await self._load_content_catalogs(session)
            
            # Create test users if needed
            await self._prepare_test_users(session)
            
        logger.info(f"Test environment ready with {len(self.test_users)} users")
        logger.info(f"Content catalog: {len(self.content_catalog)} movies, {len(self.tv_catalog)} TV shows")

    async def _load_content_catalogs(self, session: aiohttp.ClientSession):
        """Load movie and TV show catalogs for testing"""
        try:
            # Load movies
            async with session.get(f"{self.config.base_url}/api/movies") as response:
                if response.status == 200:
                    data = await response.json()
                    self.content_catalog = data.get('movies', [])[:50]  # Limit for testing
                    
            # Load TV shows
            async with session.get(f"{self.config.base_url}/api/shows") as response:
                if response.status == 200:
                    data = await response.json()
                    self.tv_catalog = data.get('shows', [])[:50]  # Limit for testing
                    
        except Exception as e:
            logger.warning(f"Could not load content catalogs: {e}")
            
        # Create dummy content for testing if API didn't provide enough data
        if len(self.content_catalog) == 0 and len(self.tv_catalog) == 0:
            logger.info("No content loaded from API, creating dummy content for testing")
            self._create_dummy_content()

    def _create_dummy_content(self):
        """Create dummy content data for testing when API is unavailable"""
        for i in range(50):
            self.content_catalog.append({
                'id': 1000 + i,
                'title': f'Test Movie {i}',
                'media_type': 'movie',
                'runtime': random.randint(90, 180)
            })
            
        for i in range(50):
            self.tv_catalog.append({
                'id': 2000 + i,
                'title': f'Test TV Show {i}',
                'media_type': 'tv',
                'seasons': [
                    {
                        'season_number': 1,
                        'episodes': [
                            {'episode_number': j, 'runtime': random.randint(20, 60)}
                            for j in range(1, random.randint(6, 13))
                        ]
                    }
                ]
            })

    async def _prepare_test_users(self, session: aiohttp.ClientSession):
        """Create or prepare test user accounts"""
        logger.info(f"Preparing {self.config.num_users} test users...")
        
        # Create user accounts concurrently
        tasks = []
        for i in range(self.config.num_users):
            username = f"loadtest_user_{i}_{int(time.time())}"
            password = "testpass123"
            tasks.append(self._create_test_user(session, username, password))
            
        self.test_users = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Filter out failed user creations
        self.test_users = [user for user in self.test_users if isinstance(user, UserStats)]
        
        logger.info(f"Successfully created {len(self.test_users)} test users")

    async def _create_test_user(self, session: aiohttp.ClientSession, username: str, password: str) -> UserStats:
        """Create a single test user and authenticate"""
        try:
            user_stats = UserStats(username=username)
            
            # Register user
            register_data = {
                'username': username,
                'password': password
            }
            
            async with session.post(
                f"{self.config.base_url}/api/auth/register",
                data=register_data
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    user_stats.token = data.get('api_key', '')
                else:
                    # Try to login if user already exists
                    async with session.post(
                        f"{self.config.base_url}/api/auth/login",
                        data=register_data
                    ) as login_response:
                        if login_response.status == 200:
                            data = await login_response.json()
                            user_stats.token = data.get('api_key', '')
                        else:
                            raise Exception(f"Failed to create/login user: {await login_response.text()}")
            
            # Create analytics session
            headers = {'Authorization': f'Bearer {user_stats.token}'}
            async with session.post(
                f"{self.config.base_url}/api/analytics/sessions",
                headers=headers
            ) as response:
                if response.status in [200, 201]:
                    data = await response.json()
                    user_stats.session_id = data.get('session_id', '')
                    user_stats.user_id = data.get('user_id', 0)
            
            return user_stats
            
        except Exception as e:
            logger.error(f"Failed to create test user {username}: {e}")
            raise

    async def run_load_test(self):
        """Execute the main load test"""
        logger.info("Starting Amanflix load test...")
        self.running = True
        self.results.start_time = datetime.now()
        
        # Create semaphore to limit concurrent requests
        semaphore = asyncio.Semaphore(self.config.max_concurrent_requests)
        
        # Start user simulation tasks
        user_tasks = []
        for user in self.test_users:
            task = asyncio.create_task(self._simulate_user_behavior(user, semaphore))
            user_tasks.append(task)
        
        # Start burst mode task if enabled
        if self.config.enable_burst_mode:
            burst_task = asyncio.create_task(self._burst_mode_controller())
            user_tasks.append(burst_task)
        
        # Start monitoring task
        monitor_task = asyncio.create_task(self._monitor_test_progress())
        user_tasks.append(monitor_task)
        
        try:
            # Run test for specified duration
            await asyncio.sleep(self.config.test_duration_minutes * 60)
            
        finally:
            # Stop the test
            self.running = False
            
            # Cancel all tasks
            for task in user_tasks:
                task.cancel()
            
            # Wait for tasks to complete
            await asyncio.gather(*user_tasks, return_exceptions=True)
            
        self.results.end_time = datetime.now()
        await self._cleanup_test_data()
        self._calculate_final_results()

    async def _simulate_user_behavior(self, user: UserStats, semaphore: asyncio.Semaphore):
        """Simulate realistic user behavior patterns"""
        async with aiohttp.ClientSession() as session:
            headers = {'Authorization': f'Bearer {user.token}'}
            
            while self.running:
                try:
                    async with semaphore:
                        # Adjust read/write ratio when focusing on watch history
                        effective_read_ratio = self.config.read_write_ratio
                        if self.config.focus_on_watch_history:
                            # When focusing on watch history, increase write operations to 60%
                            effective_read_ratio = 0.4  # 40% reads, 60% writes
                        
                        # Decide on action based on configured ratios
                        if random.random() < effective_read_ratio:
                            await self._perform_read_operation(session, user, headers)
                        else:
                            await self._perform_write_operation(session, user, headers)
                        
                        # Send heartbeat if needed
                        if time.time() - user.last_heartbeat > self.config.session_heartbeat_interval:
                            await self._send_heartbeat(session, user, headers)
                            user.last_heartbeat = time.time()
                        
                        # Random delay between operations
                        await asyncio.sleep(random.uniform(0.5, 3.0))
                        
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    user.errors.append(str(e))
                    user.failed_requests += 1
                    await asyncio.sleep(1)  # Brief pause on error

    async def _perform_read_operation(self, session: aiohttp.ClientSession, user: UserStats, headers: Dict):
        """Perform read operations (browsing, searching, etc.)"""
        operations = [
            self._browse_movies,
            self._browse_tv_shows,
            self._search_content,
            self._get_user_profile,
            self._get_continue_watching,
            self._get_my_list
        ]
        
        operation = random.choice(operations)
        await operation(session, user, headers)

    async def _perform_write_operation(self, session: aiohttp.ClientSession, user: UserStats, headers: Dict):
        """Perform write operations with focus on watch history"""
        if self.config.focus_on_watch_history and random.random() < 0.95:
            # 95% of write operations should be watch history updates when focusing
            await self._update_watch_history(session, user, headers)
        else:
            operations = [
                self._add_to_my_list,
                self._remove_from_my_list,
                self._update_user_profile
            ]
            operation = random.choice(operations)
            await operation(session, user, headers)

    async def _update_watch_history(self, session: aiohttp.ClientSession, user: UserStats, headers: Dict):
        """Update watch history - CRITICAL for database lock testing"""
        start_time = time.time()
        
        try:
            # Select content for watching
            if not user.current_content or random.random() < 0.3:
                all_content = self.content_catalog + self.tv_catalog
                if all_content:
                    user.current_content = random.choice(all_content)
                    user.watch_progress = 0.0
            
            if not user.current_content:
                return
            
            # Simulate watch progress
            content = user.current_content
            if content.get('media_type') == 'movie':
                duration = content.get('runtime', 120) * 60  # Convert to seconds
                progress_increment = random.uniform(10, 120)  # 10 seconds to 2 minutes
            else:
                # For TV shows, pick a random episode
                seasons = content.get('seasons', [])
                if seasons:
                    season = random.choice(seasons)
                    episodes = season.get('episodes', [])
                    if episodes:
                        episode = random.choice(episodes)
                        duration = episode.get('runtime', 45) * 60
                        progress_increment = random.uniform(10, 60)
                    else:
                        return
                else:
                    return
            
            user.watch_progress += progress_increment
            user.watch_progress = min(user.watch_progress, duration)
            
            # Prepare watch history update
            update_data = {
                'content_id': content['id'],
                'content_type': content['media_type'],
                'watch_timestamp': int(user.watch_progress),
                'total_duration': int(duration)
            }
            
            # Add season/episode info for TV shows
            if content.get('media_type') == 'tv':
                seasons = content.get('seasons', [])
                if seasons:
                    season = seasons[0]  # Use first season for simplicity
                    episodes = season.get('episodes', [])
                    if episodes:
                        episode = episodes[0]  # Use first episode for simplicity
                        update_data['season_number'] = season.get('season_number', 1)
                        update_data['episode_number'] = episode.get('episode_number', 1)
            
            # Make the API call
            async with session.post(
                f"{self.config.base_url}/api/watch-history/update",
                json=update_data,
                headers=headers
            ) as response:
                response_time = time.time() - start_time
                user.response_times.append(response_time)
                user.requests_sent += 1
                
                if response.status == 200:
                    user.successful_requests += 1
                    user.watch_history_updates += 1
                    
                    # Check for rapid update scenario
                    if random.random() < self.config.rapid_update_probability:
                        await asyncio.sleep(0.1)  # Very short delay
                        await self._update_watch_history(session, user, headers)
                        
                else:
                    user.failed_requests += 1
                    error_text = await response.text()
                    
                    # Check for database lock errors
                    if 'database is locked' in error_text.lower() or 'locked' in error_text.lower():
                        user.database_lock_errors += 1
                        logger.warning(f"Database lock detected for user {user.username}: {error_text}")
                    
                    user.errors.append(f"Watch history update failed: {error_text}")
                    
        except Exception as e:
            response_time = time.time() - start_time
            user.response_times.append(response_time)
            user.failed_requests += 1
            user.errors.append(f"Watch history exception: {str(e)}")
            
            if 'database is locked' in str(e).lower():
                user.database_lock_errors += 1

    async def _browse_movies(self, session: aiohttp.ClientSession, user: UserStats, headers: Dict):
        """Browse movies catalog"""
        start_time = time.time()
        try:
            params = {
                'page': random.randint(1, 5),
                'per_page': random.choice([10, 20, 50])
            }
            
            async with session.get(
                f"{self.config.base_url}/api/movies",
                params=params,
                headers=headers
            ) as response:
                await self._record_response(user, response, start_time)
                
        except Exception as e:
            user.failed_requests += 1
            user.errors.append(f"Browse movies error: {str(e)}")

    async def _browse_tv_shows(self, session: aiohttp.ClientSession, user: UserStats, headers: Dict):
        """Browse TV shows catalog"""
        start_time = time.time()
        try:
            params = {
                'page': random.randint(1, 5),
                'per_page': random.choice([10, 20, 50])
            }
            
            async with session.get(
                f"{self.config.base_url}/api/shows",
                params=params,
                headers=headers
            ) as response:
                await self._record_response(user, response, start_time)
                
        except Exception as e:
            user.failed_requests += 1
            user.errors.append(f"Browse TV shows error: {str(e)}")

    async def _search_content(self, session: aiohttp.ClientSession, user: UserStats, headers: Dict):
        """Search for content"""
        start_time = time.time()
        try:
            search_terms = ['action', 'comedy', 'drama', 'thriller', 'adventure', 'test']
            query = random.choice(search_terms)
            
            params = {
                'q': query,
                'max_results': random.choice([10, 20, 50])
            }
            
            async with session.get(
                f"{self.config.base_url}/api/search",
                params=params,
                headers=headers
            ) as response:
                await self._record_response(user, response, start_time)
                
        except Exception as e:
            user.failed_requests += 1
            user.errors.append(f"Search error: {str(e)}")

    async def _get_continue_watching(self, session: aiohttp.ClientSession, user: UserStats, headers: Dict):
        """Get continue watching list"""
        start_time = time.time()
        try:
            async with session.get(
                f"{self.config.base_url}/api/watch-history/continue-watching",
                headers=headers
            ) as response:
                await self._record_response(user, response, start_time)
                
        except Exception as e:
            user.failed_requests += 1
            user.errors.append(f"Continue watching error: {str(e)}")

    async def _get_my_list(self, session: aiohttp.ClientSession, user: UserStats, headers: Dict):
        """Get user's personal list"""
        start_time = time.time()
        try:
            async with session.get(
                f"{self.config.base_url}/api/mylist/all",
                headers=headers
            ) as response:
                await self._record_response(user, response, start_time)
                
        except Exception as e:
            user.failed_requests += 1
            user.errors.append(f"My list error: {str(e)}")

    async def _add_to_my_list(self, session: aiohttp.ClientSession, user: UserStats, headers: Dict):
        """Add content to user's list"""
        start_time = time.time()
        try:
            all_content = self.content_catalog + self.tv_catalog
            if not all_content:
                return
                
            content = random.choice(all_content)
            data = {
                'content_id': content['id'],
                'content_type': content['media_type']
            }
            
            async with session.post(
                f"{self.config.base_url}/api/mylist/add",
                json=data,
                headers=headers
            ) as response:
                await self._record_response(user, response, start_time)
                
        except Exception as e:
            user.failed_requests += 1
            user.errors.append(f"Add to list error: {str(e)}")

    async def _remove_from_my_list(self, session: aiohttp.ClientSession, user: UserStats, headers: Dict):
        """Remove content from user's list"""
        start_time = time.time()
        try:
            all_content = self.content_catalog + self.tv_catalog
            if not all_content:
                return
                
            content = random.choice(all_content)
            data = {
                'content_id': content['id'],
                'content_type': content['media_type']
            }
            
            async with session.post(
                f"{self.config.base_url}/api/mylist/delete",
                json=data,
                headers=headers
            ) as response:
                await self._record_response(user, response, start_time)
                
        except Exception as e:
            user.failed_requests += 1
            user.errors.append(f"Remove from list error: {str(e)}")

    async def _get_user_profile(self, session: aiohttp.ClientSession, user: UserStats, headers: Dict):
        """Get user profile"""
        start_time = time.time()
        try:
            async with session.get(
                f"{self.config.base_url}/api/auth/profile",
                headers=headers
            ) as response:
                await self._record_response(user, response, start_time)
                
        except Exception as e:
            user.failed_requests += 1
            user.errors.append(f"Get profile error: {str(e)}")

    async def _update_user_profile(self, session: aiohttp.ClientSession, user: UserStats, headers: Dict):
        """Update user profile"""
        start_time = time.time()
        try:
            data = {
                'email': f"{user.username}@test.com"
            }
            
            async with session.post(
                f"{self.config.base_url}/api/auth/update",
                data=data,
                headers=headers
            ) as response:
                await self._record_response(user, response, start_time)
                
        except Exception as e:
            user.failed_requests += 1
            user.errors.append(f"Update profile error: {str(e)}")

    async def _send_heartbeat(self, session: aiohttp.ClientSession, user: UserStats, headers: Dict):
        """Send session heartbeat"""
        start_time = time.time()
        try:
            data = {'session_id': user.session_id}
            
            async with session.post(
                f"{self.config.base_url}/api/analytics/heartbeat",
                json=data,
                headers=headers
            ) as response:
                await self._record_response(user, response, start_time)
                
        except Exception as e:
            user.failed_requests += 1
            user.errors.append(f"Heartbeat error: {str(e)}")

    async def _record_response(self, user: UserStats, response: aiohttp.ClientResponse, start_time: float):
        """Record response metrics"""
        response_time = time.time() - start_time
        user.response_times.append(response_time)
        user.requests_sent += 1
        
        if response.status < 400:
            user.successful_requests += 1
        else:
            user.failed_requests += 1
            error_text = await response.text()
            user.errors.append(f"HTTP {response.status}: {error_text}")
            
            # Check for database lock errors
            if 'database is locked' in error_text.lower():
                user.database_lock_errors += 1

    async def _burst_mode_controller(self):
        """Control burst mode - sudden traffic spikes"""
        while self.running:
            try:
                # Wait random interval between bursts
                await asyncio.sleep(random.uniform(30, 180))
                
                if not self.running:
                    break
                
                logger.info("Initiating burst mode - traffic spike!")
                
                # Create additional concurrent requests for a short period
                burst_tasks = []
                burst_users = random.sample(self.test_users, min(20, len(self.test_users)))
                
                for user in burst_users:
                    # Create multiple rapid watch history updates
                    for _ in range(random.randint(3, 8)):
                        task = asyncio.create_task(self._burst_watch_update(user))
                        burst_tasks.append(task)
                
                # Wait for burst to complete
                await asyncio.gather(*burst_tasks, return_exceptions=True)
                
                logger.info("Burst mode completed")
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Burst mode error: {e}")

    async def _burst_watch_update(self, user: UserStats):
        """Perform rapid watch history update during burst mode"""
        async with aiohttp.ClientSession() as session:
            headers = {'Authorization': f'Bearer {user.token}'}
            await self._update_watch_history(session, user, headers)

    async def _monitor_test_progress(self):
        """Monitor and log test progress"""
        while self.running:
            try:
                await asyncio.sleep(30)  # Report every 30 seconds
                
                total_requests = sum(user.requests_sent for user in self.test_users)
                successful_requests = sum(user.successful_requests for user in self.test_users)
                failed_requests = sum(user.failed_requests for user in self.test_users)
                database_locks = sum(user.database_lock_errors for user in self.test_users)
                watch_updates = sum(user.watch_history_updates for user in self.test_users)
                
                elapsed_time = (datetime.now() - self.results.start_time).total_seconds()
                rps = total_requests / elapsed_time if elapsed_time > 0 else 0
                
                logger.info(f"Progress: {total_requests} total requests, "
                          f"{successful_requests} successful, {failed_requests} failed, "
                          f"{database_locks} DB locks, {watch_updates} watch updates, "
                          f"{rps:.2f} RPS")
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Monitor error: {e}")

    async def _cleanup_test_data(self):
        """Clean up test data if configured"""
        if not self.config.cleanup_test_data:
            return
            
        logger.info("Cleaning up test data...")
        
        async with aiohttp.ClientSession() as session:
            cleanup_tasks = []
            
            for user in self.test_users:
                if user.token:
                    task = asyncio.create_task(self._cleanup_user_data(session, user))
                    cleanup_tasks.append(task)
            
            await asyncio.gather(*cleanup_tasks, return_exceptions=True)
        
        logger.info("Test data cleanup completed")

    async def _cleanup_user_data(self, session: aiohttp.ClientSession, user: UserStats):
        """Clean up data for a single user"""
        try:
            headers = {'Authorization': f'Bearer {user.token}'}
            
            # End analytics session
            if user.session_id:
                data = {'session_id': user.session_id}
                async with session.post(
                    f"{self.config.base_url}/api/analytics/end-session",
                    json=data,
                    headers=headers
                ) as response:
                    pass  # Ignore response
            
            # Logout user
            async with session.post(
                f"{self.config.base_url}/api/auth/logout",
                headers=headers
            ) as response:
                pass  # Ignore response
                
        except Exception as e:
            logger.warning(f"Cleanup failed for user {user.username}: {e}")

    def _calculate_final_results(self):
        """Calculate final test results and statistics"""
        logger.info("Calculating final results...")
        
        # Aggregate stats from all users
        all_response_times = []
        for user in self.test_users:
            self.results.total_requests += user.requests_sent
            self.results.successful_requests += user.successful_requests
            self.results.failed_requests += user.failed_requests
            self.results.database_lock_errors += user.database_lock_errors
            self.results.watch_history_updates += user.watch_history_updates
            all_response_times.extend(user.response_times)
        
        # Calculate response time statistics
        if all_response_times:
            self.results.avg_response_time = statistics.mean(all_response_times)
            self.results.max_response_time = max(all_response_times)
            self.results.min_response_time = min(all_response_times)
            
            sorted_times = sorted(all_response_times)
            self.results.p95_response_time = sorted_times[int(len(sorted_times) * 0.95)]
            self.results.p99_response_time = sorted_times[int(len(sorted_times) * 0.99)]
        
        # Calculate throughput and error rate
        duration = (self.results.end_time - self.results.start_time).total_seconds()
        if duration > 0:
            self.results.throughput_rps = self.results.total_requests / duration
        
        if self.results.total_requests > 0:
            self.results.error_rate = self.results.failed_requests / self.results.total_requests
        
        self.results.user_stats = self.test_users.copy()

    def print_results(self):
        """Print comprehensive test results"""
        print("\n" + "="*80)
        print("AMANFLIX LOAD TEST RESULTS")
        print("="*80)
        
        duration = (self.results.end_time - self.results.start_time).total_seconds()
        
        print(f"Test Duration: {duration:.2f} seconds")
        print(f"Number of Users: {len(self.test_users)}")
        print(f"Total Requests: {self.results.total_requests:,}")
        print(f"Successful Requests: {self.results.successful_requests:,}")
        print(f"Failed Requests: {self.results.failed_requests:,}")
        print(f"Watch History Updates: {self.results.watch_history_updates:,}")
        print(f"Database Lock Errors: {self.results.database_lock_errors:,}")
        
        print(f"\nPerformance Metrics:")
        print(f"Throughput: {self.results.throughput_rps:.2f} requests/second")
        print(f"Error Rate: {self.results.error_rate:.2%}")
        print(f"Average Response Time: {self.results.avg_response_time:.3f} seconds")
        print(f"Min Response Time: {self.results.min_response_time:.3f} seconds")
        print(f"Max Response Time: {self.results.max_response_time:.3f} seconds")
        print(f"95th Percentile: {self.results.p95_response_time:.3f} seconds")
        print(f"99th Percentile: {self.results.p99_response_time:.3f} seconds")
        
        if self.results.database_lock_errors > 0:
            print(f"\n⚠️  DATABASE LOCK ISSUES DETECTED!")
            print(f"Total Database Lock Errors: {self.results.database_lock_errors}")
            print(f"Lock Error Rate: {self.results.database_lock_errors / self.results.total_requests:.2%}")
            
            # Show users with most lock errors
            lock_users = [(user.username, user.database_lock_errors) 
                         for user in self.test_users if user.database_lock_errors > 0]
            lock_users.sort(key=lambda x: x[1], reverse=True)
            
            print(f"\nTop Users with Lock Errors:")
            for i, (username, locks) in enumerate(lock_users[:5]):
                print(f"  {i+1}. {username}: {locks} lock errors")
        
        print(f"\nUser Statistics Summary:")
        successful_users = len([u for u in self.test_users if u.successful_requests > 0])
        print(f"Active Users: {successful_users}/{len(self.test_users)}")
        
        if self.test_users:
            avg_requests_per_user = statistics.mean([u.requests_sent for u in self.test_users])
            print(f"Average Requests per User: {avg_requests_per_user:.1f}")
        
        print("="*80)

    def save_detailed_report(self, filename: Optional[str] = None):
        """Save detailed test report to file"""
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"amanflix_load_test_report_{timestamp}.json"
        
        report = {
            'test_config': {
                'base_url': self.config.base_url,
                'num_users': self.config.num_users,
                'test_duration_minutes': self.config.test_duration_minutes,
                'max_concurrent_requests': self.config.max_concurrent_requests,
                'read_write_ratio': self.config.read_write_ratio,
                'focus_on_watch_history': self.config.focus_on_watch_history,
                'enable_burst_mode': self.config.enable_burst_mode
            },
            'test_results': {
                'start_time': self.results.start_time.isoformat(),
                'end_time': self.results.end_time.isoformat(),
                'duration_seconds': (self.results.end_time - self.results.start_time).total_seconds(),
                'total_requests': self.results.total_requests,
                'successful_requests': self.results.successful_requests,
                'failed_requests': self.results.failed_requests,
                'database_lock_errors': self.results.database_lock_errors,
                'watch_history_updates': self.results.watch_history_updates,
                'throughput_rps': self.results.throughput_rps,
                'error_rate': self.results.error_rate,
                'avg_response_time': self.results.avg_response_time,
                'min_response_time': self.results.min_response_time,
                'max_response_time': self.results.max_response_time,
                'p95_response_time': self.results.p95_response_time,
                'p99_response_time': self.results.p99_response_time
            },
            'user_details': [
                {
                    'username': user.username,
                    'user_id': user.user_id,
                    'requests_sent': user.requests_sent,
                    'successful_requests': user.successful_requests,
                    'failed_requests': user.failed_requests,
                    'database_lock_errors': user.database_lock_errors,
                    'watch_history_updates': user.watch_history_updates,
                    'avg_response_time': statistics.mean(user.response_times) if user.response_times else 0,
                    'errors': user.errors[:10]  # Limit to first 10 errors
                }
                for user in self.test_users
            ]
        }
        
        with open(filename, 'w') as f:
            json.dump(report, f, indent=2)
        
        logger.info(f"Detailed report saved to {filename}")

async def main():
    """Main function to run the load test"""
    parser = argparse.ArgumentParser(description='Amanflix Load Testing Suite')
    parser.add_argument('--users', type=int, default=100, help='Number of concurrent users (default: 100)')
    parser.add_argument('--duration', type=int, default=10, help='Test duration in minutes (default: 10)')
    parser.add_argument('--url', default='http://localhost:5001', help='Base URL for API (default: http://localhost:5001)')
    parser.add_argument('--max-concurrent', type=int, default=50, help='Max concurrent requests (default: 50)')
    parser.add_argument('--no-cleanup', action='store_true', help='Skip cleanup of test data')
    parser.add_argument('--focus-watch-history', action='store_true', default=True, help='Focus on watch history operations')
    parser.add_argument('--no-burst', action='store_true', help='Disable burst mode')
    parser.add_argument('--report-file', help='Custom filename for detailed report')
    
    args = parser.parse_args()
    
    # Create test configuration
    config = TestConfig(
        base_url=args.url,
        num_users=args.users,
        test_duration_minutes=args.duration,
        max_concurrent_requests=args.max_concurrent,
        cleanup_test_data=not args.no_cleanup,
        focus_on_watch_history=args.focus_watch_history,
        enable_burst_mode=not args.no_burst
    )
    
    # Create and run load tester
    tester = AmanflixLoadTester(config)
    
    try:
        await tester.setup_test_environment()
        await tester.run_load_test()
        
        # Print and save results
        tester.print_results()
        tester.save_detailed_report(args.report_file)
        
    except KeyboardInterrupt:
        logger.info("Test interrupted by user")
        tester.running = False
        await tester._cleanup_test_data()
        
    except Exception as e:
        logger.error(f"Test failed with error: {e}")
        raise

if __name__ == "__main__":
    asyncio.run(main())
