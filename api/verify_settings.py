#!/usr/bin/env python3
"""
Quick verification of current cache settings
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from utils.data_helpers import DISABLE_CACHE_FOR_TESTING, ENABLE_PERFORMANCE_LOGGING

print("🔧 Current Data Helpers Settings:")
print("=" * 50)
print(f"DISABLE_CACHE_FOR_TESTING = {DISABLE_CACHE_FOR_TESTING}")
print(f"ENABLE_PERFORMANCE_LOGGING = {ENABLE_PERFORMANCE_LOGGING}")
print()

if not DISABLE_CACHE_FOR_TESTING:
    print("✅ CACHE: ENABLED - API will use caching for optimal performance")
else:
    print("🚫 CACHE: DISABLED - API will not use caching")

if ENABLE_PERFORMANCE_LOGGING:
    print("📊 PERFORMANCE LOGS: ENABLED - Detailed timing information will be logged")
else:
    print("🔇 PERFORMANCE LOGS: DISABLED - Clean operation, no timing logs")

print()
print("🚀 Status: API ready for production use!" if not DISABLE_CACHE_FOR_TESTING and not ENABLE_PERFORMANCE_LOGGING else "🧪 Status: API in testing/debug mode")
