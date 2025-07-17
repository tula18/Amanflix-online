#!/usr/bin/env python3
"""
Amanflix API Connection Validator
Quick validation script to check if the load tester can connect to the API
"""

import asyncio
import aiohttp
import sys
import time

async def validate_api_connection(base_url="http://localhost:5001"):
    """Validate that the API is accessible and responding"""
    print(f"Validating connection to {base_url}...")
    
    try:
        async with aiohttp.ClientSession() as session:
            # Test basic connectivity
            print("1. Testing basic connectivity...")
            async with session.get(f"{base_url}/ip") as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"   ✓ Connected! Your IP: {data.get('ip', 'unknown')}")
                else:
                    print(f"   ✗ Connection failed with status {response.status}")
                    return False
            
            # Test user registration
            print("2. Testing user registration...")
            test_username = f"validation_user_{int(time.time())}"
            register_data = {
                'username': test_username,
                'password': 'testpass123'
            }
            
            async with session.post(f"{base_url}/api/auth/register", data=register_data) as response:
                if response.status == 200:
                    data = await response.json()
                    token = data.get('api_key', '')
                    print(f"   ✓ User registration successful")
                    
                    # Test authenticated request
                    print("3. Testing authenticated request...")
                    headers = {'Authorization': f'Bearer {token}'}
                    async with session.get(f"{base_url}/api/auth/profile", headers=headers) as auth_response:
                        if auth_response.status == 200:
                            print(f"   ✓ Authentication working")
                        else:
                            print(f"   ✗ Authentication failed with status {auth_response.status}")
                            return False
                    
                    # Test content endpoints
                    print("4. Testing content endpoints...")
                    async with session.get(f"{base_url}/api/movies") as movies_response:
                        if movies_response.status == 200:
                            print(f"   ✓ Movies endpoint accessible")
                        else:
                            print(f"   ⚠ Movies endpoint returned status {movies_response.status}")
                    
                    async with session.get(f"{base_url}/api/shows") as shows_response:
                        if shows_response.status == 200:
                            print(f"   ✓ TV shows endpoint accessible")
                        else:
                            print(f"   ⚠ TV shows endpoint returned status {shows_response.status}")
                    
                    # Test watch history endpoint
                    print("5. Testing watch history endpoint...")
                    watch_data = {
                        'content_id': 1,
                        'content_type': 'movie',
                        'watch_timestamp': 300,
                        'total_duration': 7200
                    }
                    
                    async with session.post(f"{base_url}/api/watch-history/update", 
                                          json=watch_data, headers=headers) as watch_response:
                        if watch_response.status == 200:
                            print(f"   ✓ Watch history update successful")
                        else:
                            print(f"   ⚠ Watch history update returned status {watch_response.status}")
                    
                    # Cleanup test user
                    print("6. Cleaning up test user...")
                    async with session.post(f"{base_url}/api/auth/logout", headers=headers) as logout_response:
                        if logout_response.status == 200:
                            print(f"   ✓ User logout successful")
                        else:
                            print(f"   ⚠ User logout returned status {logout_response.status}")
                    
                    return True
                    
                else:
                    print(f"   ✗ User registration failed with status {response.status}")
                    error_text = await response.text()
                    print(f"   Error: {error_text}")
                    return False
                    
    except aiohttp.ClientConnectorError:
        print(f"   ✗ Cannot connect to {base_url}")
        print(f"   Make sure the Amanflix API is running on port 5001")
        return False
    except Exception as e:
        print(f"   ✗ Validation failed with error: {e}")
        return False

async def main():
    print("Amanflix API Connection Validator")
    print("=" * 40)
    
    # Check default URL
    success = await validate_api_connection()
    
    if success:
        print("\n✅ API validation successful!")
        print("The load testing suite should work properly.")
        print("\nTo run the load test:")
        print("  python amanflix_load_test.py")
        print("  or")
        print("  ./run_test.sh")
    else:
        print("\n❌ API validation failed!")
        print("Please check the following:")
        print("1. Ensure the Amanflix API is running:")
        print("   cd ../api && python app.py")
        print("2. Verify the API is accessible on http://localhost:5001")
        print("3. Check for any firewall or network issues")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
