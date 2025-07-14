#!/usr/bin/env python3
"""
Test script to verify the enhanced data integrity functionality
with include_files parameter.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from models import db
from app import create_app

def test_data_integrity_enhanced():
    """Test the enhanced data integrity checking with include_files parameter."""
    
    print("🧪 Testing Enhanced Data Integrity Functionality")
    print("=" * 60)
    
    # Create Flask app context
    app = create_app()
    
    with app.app_context():
        try:
            from utils.data_helpers import count_unwanted_fields
            
            print("\n1. Testing in-memory data only (include_files=False)")
            print("-" * 50)
            
            # Test with in-memory data only
            result_memory_only = count_unwanted_fields(['watch_history'], include_files=False)
            
            print(f"📊 Memory-only results:")
            print(f"   Total items: {result_memory_only['total_items']}")
            print(f"   Contaminated items: {result_memory_only['total_contaminated']}")
            print(f"   Contamination %: {result_memory_only['contamination_percentage']:.2f}%")
            print(f"   Data sources: {list(result_memory_only['data_sources'].keys())}")
            
            print("\n2. Testing with files included (include_files=True)")
            print("-" * 50)
            
            # Test with files included
            result_with_files = count_unwanted_fields(['watch_history'], include_files=True)
            
            print(f"📊 Results with files:")
            print(f"   Total items: {result_with_files['total_items']}")
            print(f"   Contaminated items: {result_with_files['total_contaminated']}")
            print(f"   Contamination %: {result_with_files['contamination_percentage']:.2f}%")
            print(f"   Data sources: {list(result_with_files['data_sources'].keys())}")
            
            print("\n3. Comparing results")
            print("-" * 50)
            
            memory_sources = set(result_memory_only['data_sources'].keys())
            file_sources = set(result_with_files['data_sources'].keys())
            file_only_sources = file_sources - memory_sources
            
            print(f"📈 Memory-only sources: {memory_sources}")
            print(f"📂 File-only sources: {file_only_sources}")
            print(f"🔍 Total sources with files: {len(file_sources)}")
            
            # Show detailed breakdown
            print("\n4. Detailed source breakdown")
            print("-" * 50)
            
            for source, data in result_with_files['data_sources'].items():
                source_type = "📂 File" if source.endswith('_file') else "💾 Memory"
                contaminated = data['contaminated']
                total = data['total']
                percentage = (contaminated / total * 100) if total > 0 else 0
                
                print(f"   {source_type} {source}: {contaminated}/{total} ({percentage:.1f}%)")
            
            print("\n✅ Enhanced data integrity testing completed!")
            
            # Test the analytics endpoint simulation
            print("\n5. Simulating analytics endpoint calls")
            print("-" * 50)
            
            print("🌐 Simulating API calls:")
            print(f"   GET /api/analytics/data-integrity?fields=watch_history&include_files=false")
            print(f"   → Would return {result_memory_only['total_contaminated']} contaminated items")
            
            print(f"   GET /api/analytics/data-integrity?fields=watch_history&include_files=true")
            print(f"   → Would return {result_with_files['total_contaminated']} contaminated items")
            
            difference = result_with_files['total_contaminated'] - result_memory_only['total_contaminated']
            if difference != 0:
                print(f"   📊 Difference: {difference} additional contaminated items found in files")
            else:
                print("   📊 No difference between memory and file data")
            
        except Exception as e:
            print(f"❌ Error during testing: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    return True

if __name__ == "__main__":
    success = test_data_integrity_enhanced()
    if success:
        print("\n🎉 All tests completed successfully!")
        sys.exit(0)
    else:
        print("\n💥 Tests failed!")
        sys.exit(1)
