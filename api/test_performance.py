#!/usr/bin/env python3
"""
Test script to comprehensively test the performance logging of getter functions
with and without caching to compare performance impact.
"""

import sys
import os
import time
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up environment before importing app modules
os.environ['FLASK_ENV'] = 'testing'

import utils.data_helpers as dh
from utils.data_helpers import get_movies, get_tv_shows, get_movies_with_images, get_tv_shows_with_images

def test_with_cache_disabled():
    """Test performance with cache disabled"""
    print("\n" + "="*80)
    print("🚫 TESTING WITH CACHE DISABLED")
    print("="*80)
    
    # Ensure cache is disabled
    dh.DISABLE_CACHE_FOR_TESTING = True
    dh.ENABLE_PERFORMANCE_LOGGING = True
    dh.clear_data_cache()
    
    print("📽️  Testing get_movies() - First call (no cache)...")
    start = time.time()
    movies = get_movies()
    elapsed = time.time() - start
    print(f"✅ Retrieved {len(movies)} movies in {elapsed:.4f}s")
    
    print("\n📽️  Testing get_movies() - Second call (no cache)...")
    start = time.time()
    movies2 = get_movies()
    elapsed = time.time() - start
    print(f"✅ Retrieved {len(movies2)} movies in {elapsed:.4f}s")
    
    print("\n📺 Testing get_tv_shows() - First call (no cache)...")
    start = time.time()
    tv_shows = get_tv_shows()
    elapsed = time.time() - start
    print(f"✅ Retrieved {len(tv_shows)} TV shows in {elapsed:.4f}s")
    
    print("\n📺 Testing get_tv_shows() - Second call (no cache)...")
    start = time.time()
    tv_shows2 = get_tv_shows()
    elapsed = time.time() - start
    print(f"✅ Retrieved {len(tv_shows2)} TV shows in {elapsed:.4f}s")
    
    print("\n🖼️  Testing get_movies_with_images() (no cache)...")
    start = time.time()
    movies_img = get_movies_with_images()
    elapsed = time.time() - start
    print(f"✅ Retrieved {len(movies_img)} movies with images in {elapsed:.4f}s")
    
    print("\n🖼️  Testing get_tv_shows_with_images() (no cache)...")
    start = time.time()
    tv_img = get_tv_shows_with_images()
    elapsed = time.time() - start
    print(f"✅ Retrieved {len(tv_img)} TV shows with images in {elapsed:.4f}s")


def test_with_cache_enabled():
    """Test performance with cache enabled"""
    print("\n" + "="*80)
    print("🚀 TESTING WITH CACHE ENABLED")
    print("="*80)
    
    # Enable cache and clear it first
    dh.DISABLE_CACHE_FOR_TESTING = False
    dh.ENABLE_PERFORMANCE_LOGGING = True
    dh.clear_data_cache()
    
    print("📽️  Testing get_movies() - First call (cache miss)...")
    start = time.time()
    movies = get_movies()
    elapsed = time.time() - start
    print(f"✅ Retrieved {len(movies)} movies in {elapsed:.4f}s")
    
    print("\n📽️  Testing get_movies() - Second call (cache hit)...")
    start = time.time()
    movies2 = get_movies()
    elapsed = time.time() - start
    print(f"✅ Retrieved {len(movies2)} movies in {elapsed:.4f}s")
    
    print("\n📽️  Testing get_movies() - Third call (cache hit)...")
    start = time.time()
    movies3 = get_movies()
    elapsed = time.time() - start
    print(f"✅ Retrieved {len(movies3)} movies in {elapsed:.4f}s")
    
    print("\n📺 Testing get_tv_shows() - First call (cache miss)...")
    start = time.time()
    tv_shows = get_tv_shows()
    elapsed = time.time() - start
    print(f"✅ Retrieved {len(tv_shows)} TV shows in {elapsed:.4f}s")
    
    print("\n� Testing get_tv_shows() - Second call (cache hit)...")
    start = time.time()
    tv_shows2 = get_tv_shows()
    elapsed = time.time() - start
    print(f"✅ Retrieved {len(tv_shows2)} TV shows in {elapsed:.4f}s")
    
    print("\n🖼️  Testing get_movies_with_images() - First call (cache miss)...")
    start = time.time()
    movies_img = get_movies_with_images()
    elapsed = time.time() - start
    print(f"✅ Retrieved {len(movies_img)} movies with images in {elapsed:.4f}s")
    
    print("\n🖼️  Testing get_movies_with_images() - Second call (cache hit)...")
    start = time.time()
    movies_img2 = get_movies_with_images()
    elapsed = time.time() - start
    print(f"✅ Retrieved {len(movies_img2)} movies with images in {elapsed:.4f}s")
    
    print("\n🖼️  Testing get_tv_shows_with_images() - First call (cache miss)...")
    start = time.time()
    tv_img = get_tv_shows_with_images()
    elapsed = time.time() - start
    print(f"✅ Retrieved {len(tv_img)} TV shows with images in {elapsed:.4f}s")
    
    print("\n🖼️  Testing get_tv_shows_with_images() - Second call (cache hit)...")
    start = time.time()
    tv_img2 = get_tv_shows_with_images()
    elapsed = time.time() - start
    print(f"✅ Retrieved {len(tv_img2)} TV shows with images in {elapsed:.4f}s")


def test_cache_performance_comparison():
    """Compare performance with multiple rapid calls"""
    print("\n" + "="*80)
    print("⚡ RAPID CALLS PERFORMANCE COMPARISON")
    print("="*80)
    
    num_calls = 5
    
    # Test without cache
    print(f"\n🚫 Testing {num_calls} rapid calls WITHOUT cache:")
    dh.DISABLE_CACHE_FOR_TESTING = True
    dh.ENABLE_PERFORMANCE_LOGGING = False  # Disable detailed logging for cleaner output
    dh.clear_data_cache()
    
    start_total = time.time()
    for i in range(num_calls):
        start = time.time()
        movies = get_movies()
        elapsed = time.time() - start
        print(f"   Call {i+1}: {elapsed:.4f}s ({len(movies)} items)")
    total_no_cache = time.time() - start_total
    print(f"🚫 Total time without cache: {total_no_cache:.4f}s")
    
    # Test with cache
    print(f"\n🚀 Testing {num_calls} rapid calls WITH cache:")
    dh.DISABLE_CACHE_FOR_TESTING = False
    dh.ENABLE_PERFORMANCE_LOGGING = False
    dh.clear_data_cache()
    
    start_total = time.time()
    for i in range(num_calls):
        start = time.time()
        movies = get_movies()
        elapsed = time.time() - start
        cache_status = "miss" if i == 0 else "hit"
        print(f"   Call {i+1}: {elapsed:.4f}s ({len(movies)} items) - cache {cache_status}")
    total_with_cache = time.time() - start_total
    print(f"🚀 Total time with cache: {total_with_cache:.4f}s")
    
    # Calculate improvement
    improvement = ((total_no_cache - total_with_cache) / total_no_cache) * 100
    speedup = total_no_cache / total_with_cache if total_with_cache > 0 else float('inf')
    
    print(f"\n📊 PERFORMANCE SUMMARY:")
    print(f"   • Without cache: {total_no_cache:.4f}s")
    print(f"   • With cache:    {total_with_cache:.4f}s") 
    print(f"   • Improvement:   {improvement:.1f}% faster")
    print(f"   • Speedup:       {speedup:.1f}x")


def test_performance():
    """Main performance testing function - Tests: WITH CACHE → WITHOUT CACHE → WITH CACHE"""
    print("🧪 COMPREHENSIVE PERFORMANCE TEST FOR DATA HELPERS")
    print("🎯 Testing sequence: WITH CACHE → WITHOUT CACHE → WITH CACHE")
    print("⏱️  All times include data loading + cleaning operations")
    
    # TEST 1: WITH CACHE
    test_with_cache_enabled()
    
    # TEST 2: WITHOUT CACHE
    test_with_cache_disabled()
    
    # TEST 3: WITH CACHE AGAIN
    print("\n" + "="*80)
    print("🔄 RE-TESTING WITH CACHE ENABLED (ROUND 2)")
    print("="*80)
    test_with_cache_enabled()
    
    # Performance comparison
    test_cache_performance_comparison()
    
    print("\n" + "="*80)
    print("✨ COMPREHENSIVE PERFORMANCE TEST COMPLETED!")
    print("="*80)
    print("\n💡 Test Sequence Summary:")
    print("   1️⃣  WITH CACHE: Shows cache miss → cache hit performance")
    print("   2️⃣  WITHOUT CACHE: Shows consistent timing (no caching)")
    print("   3️⃣  WITH CACHE AGAIN: Confirms cache functionality restored")
    print("   4️⃣  RAPID CALLS: Direct comparison of cache vs no-cache")
    
    print(f"\n🔧 Key Observations:")
    print("   • Cache hits should be significantly faster than cache misses")
    print("   • Without cache, all calls should have similar timing")
    print("   • Performance logs show detailed timing breakdown")
    
    # Reset to testing state
    dh.DISABLE_CACHE_FOR_TESTING = True  # Keep disabled for testing
    dh.ENABLE_PERFORMANCE_LOGGING = True  # Keep logging enabled
    
    print(f"\n🔧 Current settings restored:")
    print(f"   • DISABLE_CACHE_FOR_TESTING = {dh.DISABLE_CACHE_FOR_TESTING}")
    print(f"   • ENABLE_PERFORMANCE_LOGGING = {dh.ENABLE_PERFORMANCE_LOGGING}")


if __name__ == "__main__":
    test_performance()
