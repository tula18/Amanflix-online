"""
Data helper utilities for safely accessing and cleaning global data variables.

This module provides safe getter functions that return deep copies of the global
data variables to prevent unwanted modifications to the original data that could
be saved back to JSON files.

Key features:
- Deep copying to prevent data contamination 
- Efficient read operations with deep copy only (force_clean=False by default)
- Data cleaning ONLY when explicitly requested (force_clean=True) for save/export operations
- Performance optimizations for large datasets with caching
- Comprehensive error handling
- Global variables remain read-only in memory

Optimized Performance Strategy:
- Read operations: Deep copy only (fast, data isolation guaranteed)
- Save/Export operations: Deep copy + cleaning (force_clean=True)
- Cleaning only on import/export and explicit force_clean requests
- Global data cleaned only during import/export cycles, not per request
- Memory-efficient deep copying preserves data isolation without unnecessary processing
"""

import copy
import time
from functools import lru_cache
from utils.logger import log_error, log_warning, log_debug, log_info

# Cache for performance optimization (cleared when data is updated)
_data_cache = {}
_cache_timestamps = {}
CACHE_TTL = 300  # 5 minutes cache TTL

# Performance testing flags
DISABLE_CACHE_FOR_TESTING = False  # Set to True to disable cache for testing
ENABLE_PERFORMANCE_LOGGING = False  # Set to True to enable timing logs for debugging


def clear_data_cache():
    """Clear the data cache when source data is updated."""
    global _data_cache, _cache_timestamps
    _data_cache.clear()
    _cache_timestamps.clear()
    log_info("Data cache cleared")


def _is_cache_valid(cache_key):
    """Check if cached data is still valid based on TTL."""
    if cache_key not in _cache_timestamps:
        return False
    return (time.time() - _cache_timestamps[cache_key]) < CACHE_TTL


def _get_cached_data(cache_key):
    """Get data from cache if valid."""
    if cache_key in _data_cache and _is_cache_valid(cache_key):
        log_debug(f"Cache hit for {cache_key}")
        return _data_cache[cache_key]
    return None


def _cache_data(cache_key, data):
    """Cache data with timestamp."""
    _data_cache[cache_key] = data
    _cache_timestamps[cache_key] = time.time()
    log_debug(f"Cached data for {cache_key}")


def clean_item_data(item, fields_to_remove=None):
    """
    Clean unwanted fields from a data item.
    
    Args:
        item (dict): The data item to clean
        fields_to_remove (list): List of field names to remove. 
                                Defaults to ['watch_history'] if None
    
    Returns:
        dict: Cleaned copy of the item
    """
    if fields_to_remove is None:
        fields_to_remove = ['watch_history']
    
    try:
        # Create a copy to avoid modifying the original
        cleaned_item = copy.deepcopy(item)
        
        # Remove unwanted fields
        for field in fields_to_remove:
            if field in cleaned_item:
                del cleaned_item[field]
                log_debug(f"Removed field '{field}' from item ID: {cleaned_item.get('id', 'unknown')}")
        
        return cleaned_item
    except Exception as e:
        log_error(f"Error cleaning item data: {str(e)}")
        # Return the original item if cleaning fails
        return copy.deepcopy(item)


def clean_data_list(data_list, fields_to_remove=None, clean=True):
    """
    Clean unwanted fields from a list of data items with performance optimizations.
    
    Args:
        data_list (list): List of data items to clean
        fields_to_remove (list): List of field names to remove
        clean (bool): Whether to perform cleaning or just deep copy
    
    Returns:
        list: Cleaned deep copy of the data list
    """
    try:
        if not data_list:
            return []
            
        if not clean:
            # Just return a deep copy without cleaning (optimized for read operations)
            log_debug(f"Performing fast deep copy of {len(data_list)} items (no cleaning)")
            return copy.deepcopy(data_list)
        
        # Set default fields to remove
        if fields_to_remove is None:
            fields_to_remove = ['watch_history', 'user_specific_data']
        
        # Optimize for large datasets by only deep copying items that need cleaning
        cleaned_data = []
        items_cleaned = 0
        
        for item in data_list:
            # Check if item needs cleaning
            needs_cleaning = any(field in item for field in fields_to_remove)
            
            if needs_cleaning:
                cleaned_item = clean_item_data(item, fields_to_remove)
                cleaned_data.append(cleaned_item)
                items_cleaned += 1
            else:
                # Item doesn't need cleaning, just deep copy it
                cleaned_data.append(copy.deepcopy(item))
        
        if items_cleaned > 0:
            log_debug(f"Cleaned {items_cleaned} items out of {len(data_list)} total items")
        else:
            log_debug(f"No items needed cleaning out of {len(data_list)} total items")
        
        return cleaned_data
    except Exception as e:
        log_error(f"Error cleaning data list: {str(e)}")
        # Return a deep copy without cleaning if something goes wrong
        return copy.deepcopy(data_list)


def get_movies(force_clean=False, fields_to_remove=None):
    """
    Get a safe, deep-copied version of the movies data with caching.
    
    Args:
        force_clean (bool): Whether to force cleaning of unwanted fields. 
                           Only use when saving/exporting data. Defaults to False
        fields_to_remove (list): Custom list of fields to remove when force_clean=True
    
    Returns:
        list: Deep copy of movies data, cleaned only if force_clean=True
    """
    try:
        # Performance testing: start timing
        start_time = time.time() if ENABLE_PERFORMANCE_LOGGING else None
        
        # Create cache key based on parameters
        cache_key = f"movies_force_clean_{force_clean}_fields_{fields_to_remove}"
        
        # Check cache first (unless disabled for testing)
        if not DISABLE_CACHE_FOR_TESTING:
            cached_data = _get_cached_data(cache_key)
            if cached_data is not None:
                if ENABLE_PERFORMANCE_LOGGING:
                    elapsed = time.time() - start_time
                    log_info(f"🚀 PERFORMANCE [MOVIES CACHE HIT]: {elapsed:.4f}s for {len(cached_data)} items")
                return cached_data
        
        # Import and process data
        from app import movies
        
        # Performance testing: time the operation
        process_start = time.time() if ENABLE_PERFORMANCE_LOGGING else None
        
        if force_clean:
            # Only clean when explicitly requested (for save/export operations)
            result = clean_data_list(movies, fields_to_remove, clean=True)
            log_debug(f"Force cleaned movies data for save/export operation")
        else:
            # Fast deep copy without cleaning (for all read operations)
            # This provides complete data isolation without unnecessary processing
            result = copy.deepcopy(movies)
            log_debug(f"Fast deep copy of movies data for read operation")
        
        if ENABLE_PERFORMANCE_LOGGING:
            process_elapsed = time.time() - process_start
            total_elapsed = time.time() - start_time
            operation = "CLEAN" if force_clean else "COPY"
            log_info(f"⚡ PERFORMANCE [MOVIES {operation}]: Process took {process_elapsed:.4f}s, Total: {total_elapsed:.4f}s for {len(result)} items")
        
        # Cache the result (unless disabled for testing)
        if not DISABLE_CACHE_FOR_TESTING:
            _cache_data(cache_key, result)
        
        return result
    except ImportError as e:
        log_error(f"Error importing movies data: {str(e)}")
        return []
    except Exception as e:
        log_error(f"Error getting movies data: {str(e)}")
        return []


def get_tv_shows(force_clean=False, fields_to_remove=None):
    """
    Get a safe, deep-copied version of the TV series data with caching.
    
    Args:
        force_clean (bool): Whether to force cleaning of unwanted fields.
                           Only use when saving/exporting data. Defaults to False
        fields_to_remove (list): Custom list of fields to remove when force_clean=True
    
    Returns:
        list: Deep copy of TV series data, cleaned only if force_clean=True
    """
    try:
        # Performance testing: start timing
        start_time = time.time() if ENABLE_PERFORMANCE_LOGGING else None
        
        # Create cache key based on parameters
        cache_key = f"tv_series_force_clean_{force_clean}_fields_{fields_to_remove}"
        
        # Check cache first (unless disabled for testing)
        if not DISABLE_CACHE_FOR_TESTING:
            cached_data = _get_cached_data(cache_key)
            if cached_data is not None:
                if ENABLE_PERFORMANCE_LOGGING:
                    elapsed = time.time() - start_time
                    log_info(f"🚀 PERFORMANCE [TV CACHE HIT]: {elapsed:.4f}s for {len(cached_data)} items")
                return cached_data
            
        # Import and process data
        from app import tv_series
        
        # Performance testing: time the operation
        process_start = time.time() if ENABLE_PERFORMANCE_LOGGING else None
        
        if force_clean:
            # Only clean when explicitly requested (for save/export operations)
            result = clean_data_list(tv_series, fields_to_remove, clean=True)
            log_debug(f"Force cleaned TV series data for save/export operation")
        else:
            # Just return deep copy without cleaning (for read operations)
            result = copy.deepcopy(tv_series)
        
        if ENABLE_PERFORMANCE_LOGGING:
            process_elapsed = time.time() - process_start
            total_elapsed = time.time() - start_time
            operation = "CLEAN" if force_clean else "COPY"
            log_info(f"⚡ PERFORMANCE [TV {operation}]: Process took {process_elapsed:.4f}s, Total: {total_elapsed:.4f}s for {len(result)} items")
        
        # Cache the result (unless disabled for testing)
        if not DISABLE_CACHE_FOR_TESTING:
            _cache_data(cache_key, result)
        
        return result
    except ImportError as e:
        log_error(f"Error importing TV series data: {str(e)}")
        return []
    except Exception as e:
        log_error(f"Error getting TV series data: {str(e)}")
        return []


def get_movies_with_images(force_clean=False, fields_to_remove=None):
    """
    Get a safe, deep-copied version of the movies with images data with caching.
    
    Args:
        force_clean (bool): Whether to force cleaning of unwanted fields.
                           Only use when saving/exporting data. Defaults to False
        fields_to_remove (list): Custom list of fields to remove when force_clean=True
    
    Returns:
        list: Deep copy of movies with images data, cleaned only if force_clean=True
    """
    try:
        # Performance testing: start timing
        start_time = time.time() if ENABLE_PERFORMANCE_LOGGING else None
        
        # Create cache key based on parameters
        cache_key = f"movies_with_images_force_clean_{force_clean}_fields_{fields_to_remove}"
        
        # Check cache first (unless disabled for testing)
        if not DISABLE_CACHE_FOR_TESTING:
            cached_data = _get_cached_data(cache_key)
            if cached_data is not None:
                if ENABLE_PERFORMANCE_LOGGING:
                    elapsed = time.time() - start_time
                    log_info(f"🚀 PERFORMANCE [MOVIES_IMG CACHE HIT]: {elapsed:.4f}s for {len(cached_data)} items")
                return cached_data
            
        # Import and process data
        from app import movies_with_images
        
        # Performance testing: time the operation
        process_start = time.time() if ENABLE_PERFORMANCE_LOGGING else None
        
        if force_clean:
            # Only clean when explicitly requested (for save/export operations)
            result = clean_data_list(movies_with_images, fields_to_remove, clean=True)
            log_debug(f"Force cleaned movies with images data for save/export operation")
        else:
            # Just return deep copy without cleaning (for read operations)
            result = copy.deepcopy(movies_with_images)
        
        if ENABLE_PERFORMANCE_LOGGING:
            process_elapsed = time.time() - process_start
            total_elapsed = time.time() - start_time
            operation = "CLEAN" if force_clean else "COPY"
            log_info(f"⚡ PERFORMANCE [MOVIES_IMG {operation}]: Process took {process_elapsed:.4f}s, Total: {total_elapsed:.4f}s for {len(result)} items")
        
        # Cache the result (unless disabled for testing)
        if not DISABLE_CACHE_FOR_TESTING:
            _cache_data(cache_key, result)
        
        return result
    except ImportError as e:
        log_error(f"Error importing movies with images data: {str(e)}")
        return []
    except Exception as e:
        log_error(f"Error getting movies with images data: {str(e)}")
        return []


def get_tv_shows_with_images(force_clean=False, fields_to_remove=None):
    """
    Get a safe, deep-copied version of the TV series with images data with caching.
    
    Args:
        force_clean (bool): Whether to force cleaning of unwanted fields.
                           Only use when saving/exporting data. Defaults to False
        fields_to_remove (list): Custom list of fields to remove when force_clean=True
    
    Returns:
        list: Deep copy of TV series with images data, cleaned only if force_clean=True
    """
    try:
        # Performance testing: start timing
        start_time = time.time() if ENABLE_PERFORMANCE_LOGGING else None
        
        # Create cache key based on parameters
        cache_key = f"tv_series_with_images_force_clean_{force_clean}_fields_{fields_to_remove}"
        
        # Check cache first (unless disabled for testing)
        if not DISABLE_CACHE_FOR_TESTING:
            cached_data = _get_cached_data(cache_key)
            if cached_data is not None:
                if ENABLE_PERFORMANCE_LOGGING:
                    elapsed = time.time() - start_time
                    log_info(f"🚀 PERFORMANCE [TV_IMG CACHE HIT]: {elapsed:.4f}s for {len(cached_data)} items")
                return cached_data
            
        # Import and process data
        from app import tv_series_with_images
        
        # Performance testing: time the operation
        process_start = time.time() if ENABLE_PERFORMANCE_LOGGING else None
        
        if force_clean:
            # Only clean when explicitly requested (for save/export operations)
            result = clean_data_list(tv_series_with_images, fields_to_remove, clean=True)
            log_debug(f"Force cleaned TV series with images data for save/export operation")
        else:
            # Just return deep copy without cleaning (for read operations)
            result = copy.deepcopy(tv_series_with_images)
        
        if ENABLE_PERFORMANCE_LOGGING:
            process_elapsed = time.time() - process_start
            total_elapsed = time.time() - start_time
            operation = "CLEAN" if force_clean else "COPY"
            log_info(f"⚡ PERFORMANCE [TV_IMG {operation}]: Process took {process_elapsed:.4f}s, Total: {total_elapsed:.4f}s for {len(result)} items")
        
        # Cache the result (unless disabled for testing)
        if not DISABLE_CACHE_FOR_TESTING:
            _cache_data(cache_key, result)
        
        return result
    except ImportError as e:
        log_error(f"Error importing TV series with images data: {str(e)}")
        return []
    except Exception as e:
        log_error(f"Error getting TV series with images data: {str(e)}")
        return []


def get_all_items(force_clean=False, fields_to_remove=None):
    """
    Get a safe, deep-copied version of all content items (movies + TV shows).
    
    Args:
        force_clean (bool): Whether to force cleaning of unwanted fields.
                           Only use when saving/exporting data. Defaults to False
        fields_to_remove (list): Custom list of fields to remove when force_clean=True
    
    Returns:
        list: Deep copy of all content items, cleaned only if force_clean=True
    """
    try:
        movies_data = get_movies(force_clean, fields_to_remove)
        tv_data = get_tv_shows(force_clean, fields_to_remove)
        return movies_data + tv_data
    except Exception as e:
        log_error(f"Error getting all items data: {str(e)}")
        return []


def get_all_items_with_images(force_clean=False, fields_to_remove=None):
    """
    Get a safe, deep-copied version of all content items with images.
    
    Args:
        force_clean (bool): Whether to force cleaning of unwanted fields.
                           Only use when saving/exporting data. Defaults to False
        fields_to_remove (list): Custom list of fields to remove when force_clean=True
    
    Returns:
        list: Deep copy of all content items with images, cleaned only if force_clean=True
    """
    try:
        movies_data = get_movies_with_images(force_clean, fields_to_remove)
        tv_data = get_tv_shows_with_images(force_clean, fields_to_remove)
        return movies_data + tv_data
    except Exception as e:
        log_error(f"Error getting all items with images data: {str(e)}")
        return []


def build_item_index(data_list):
    """
    Build an index mapping item IDs to their position in the data list.
    
    Args:
        data_list (list): List of data items with 'id' field
    
    Returns:
        dict: Mapping of item ID to index in the list
    """
    try:
        return {item['id']: index for index, item in enumerate(data_list)}
    except Exception as e:
        log_error(f"Error building item index: {str(e)}")
        return {}


def clean_and_save_global_data(fields_to_remove=None):
    """
    Clean unwanted fields from all global data variables and save them back to files.
    This function should only be called when explicitly saving/exporting data.
    
    Args:
        fields_to_remove (list): List of field names to remove. 
                                Defaults to ['watch_history', 'user_specific_data']
    
    Returns:
        dict: Summary of the cleaning operation
    """
    import json
    import os
    # Note: Flask import will be handled in the try block to avoid import errors
    
    if fields_to_remove is None:
        fields_to_remove = ['watch_history', 'user_specific_data']
    
    results = {
        'files_processed': [],
        'items_cleaned': 0,
        'errors': []
    }
    
    try:
        # Import Flask only when needed
        try:
            from flask import current_app
        except ImportError:
            log_warning("Flask not available, using relative paths")
            current_app = None
            
        import app
        
        # Use force_clean=True for all data when saving
        log_info("Starting global data cleaning for save/export operation...")
        
        # Define the data to clean and their corresponding file paths
        data_to_clean = [
            {
                'getter_func': lambda: get_movies(force_clean=True, fields_to_remove=fields_to_remove),
                'file_path': 'cdn/files/movies_little_clean.json',
                'name': 'movies'
            },
            {
                'getter_func': lambda: get_tv_shows(force_clean=True, fields_to_remove=fields_to_remove),
                'file_path': 'cdn/files/tv_little_clean.json',
                'name': 'tv_series'
            },
            {
                'getter_func': lambda: get_movies_with_images(force_clean=True, fields_to_remove=fields_to_remove),
                'file_path': 'cdn/files/movies_with_images.json',
                'name': 'movies_with_images'
            },
            {
                'getter_func': lambda: get_tv_shows_with_images(force_clean=True, fields_to_remove=fields_to_remove),
                'file_path': 'cdn/files/tv_with_images.json',
                'name': 'tv_series_with_images'
            }
        ]
        
        for data_info in data_to_clean:
            try:
                # Get the original data to count items that need cleaning
                original_data = getattr(app, data_info['name'])
                original_count = len(original_data)
                
                # Count items with unwanted fields
                items_with_unwanted_fields = 0
                for item in original_data:
                    if any(field in item for field in fields_to_remove):
                        items_with_unwanted_fields += 1
                
                # Get cleaned data using force_clean=True
                cleaned_data = data_info['getter_func']()
                
                # Update the global variable with cleaned data
                setattr(app, data_info['name'], cleaned_data)
                
                # Save to file
                if current_app:
                    file_path = os.path.join(current_app.root_path, data_info['file_path'])
                else:
                    file_path = data_info['file_path']
                    
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(cleaned_data, f, indent=2, ensure_ascii=False)
                
                results['files_processed'].append({
                    'file': data_info['file_path'],
                    'name': data_info['name'],
                    'original_count': original_count,
                    'items_with_unwanted_fields': items_with_unwanted_fields,
                    'final_count': len(cleaned_data)
                })
                
                results['items_cleaned'] += items_with_unwanted_fields
                
                log_info(f"Cleaned and saved {data_info['name']}: {items_with_unwanted_fields} items cleaned")
                
            except Exception as e:
                error_msg = f"Error cleaning {data_info['name']}: {str(e)}"
                log_error(error_msg)
                results['errors'].append(error_msg)
        
        # Clear cache after cleaning
        clear_data_cache()
        
        # Rebuild content indexes
        try:
            app.rebuild_content_indexes()
        except AttributeError:
            log_warning("rebuild_content_indexes function not available")
        
        log_info(f"Global data cleaning completed: {results['items_cleaned']} items cleaned across {len(results['files_processed'])} files")
        
    except Exception as e:
        error_msg = f"Critical error during global data cleaning: {str(e)}"
        log_error(error_msg)
        results['errors'].append(error_msg)
    
    return results


def validate_data_integrity():
    """
    Validate that the global data variables don't contain unwanted fields.
    
    Returns:
        dict: Validation results
    """
    results = {
        'is_valid': True,
        'issues_found': [],
        'recommendations': []
    }
    
    unwanted_fields = ['watch_history', 'user_specific_data']
    
    try:
        import app
        
        data_sources = [
            ('movies', app.movies),
            ('tv_series', app.tv_series),
            ('movies_with_images', app.movies_with_images),
            ('tv_series_with_images', app.tv_series_with_images)
        ]
        
        for source_name, data in data_sources:
            items_with_issues = 0
            for item in data:
                for field in unwanted_fields:
                    if field in item:
                        items_with_issues += 1
                        break
            
            if items_with_issues > 0:
                results['is_valid'] = False
                issue = f"{source_name}: {items_with_issues} items contain unwanted fields"
                results['issues_found'].append(issue)
                results['recommendations'].append(f"Run clean-files endpoint or clean_and_save_global_data() for {source_name}")
                log_warning(issue)
        
        if results['is_valid']:
            log_info("Data integrity validation passed: No unwanted fields found")
        else:
            log_warning(f"Data integrity validation failed: {len(results['issues_found'])} issues found")
            
    except Exception as e:
        error_msg = f"Error during data integrity validation: {str(e)}"
        log_error(error_msg)
        results['is_valid'] = False
        results['issues_found'].append(error_msg)
    
    return results


def count_unwanted_fields(fields_to_check=None, include_files=False):
    """
    Count items containing unwanted fields across all data sources.
    
    Args:
        fields_to_check (list): List of field names to check for (default: ['watch_history'])
        include_files (bool): Whether to also check JSON files directly (default: False)
    
    Returns:
        dict: Dictionary with counts for each data source
    """
    if fields_to_check is None:
        fields_to_check = ['watch_history']
    
    try:
        # Import data directly (without cleaning) to check for contamination
        from app import movies, tv_series, movies_with_images, tv_series_with_images
        
        contamination_report = {
            'movies': 0,
            'tv_series': 0, 
            'movies_with_images': 0,
            'tv_series_with_images': 0,
            'total_contaminated': 0,
            'total_items': 0,
            'contaminated_fields': {},
            'data_sources': {
                'movies': {'total': len(movies), 'contaminated': 0, 'fields': {}},
                'tv_series': {'total': len(tv_series), 'contaminated': 0, 'fields': {}},
                'movies_with_images': {'total': len(movies_with_images), 'contaminated': 0, 'fields': {}},
                'tv_series_with_images': {'total': len(tv_series_with_images), 'contaminated': 0, 'fields': {}}
            }
        }
        
        # If include_files is True, also add file data
        if include_files:
            contamination_report['data_sources'].update({
                'movies_file': {'total': 0, 'contaminated': 0, 'fields': {}},
                'tv_series_file': {'total': 0, 'contaminated': 0, 'fields': {}},
                'movies_with_images_file': {'total': 0, 'contaminated': 0, 'fields': {}},
                'tv_series_with_images_file': {'total': 0, 'contaminated': 0, 'fields': {}}
            })
        
        # Helper function to check and count contaminated items
        def check_contamination(data_list, source_name):
            contaminated_count = 0
            field_counts = {}
            
            for item in data_list:
                item_contaminated = False
                for field in fields_to_check:
                    if field in item:
                        item_contaminated = True
                        field_counts[field] = field_counts.get(field, 0) + 1
                        
                if item_contaminated:
                    contaminated_count += 1
            
            contamination_report['data_sources'][source_name]['contaminated'] = contaminated_count
            contamination_report['data_sources'][source_name]['fields'] = field_counts
            
            return contaminated_count, field_counts
        
        # Check each in-memory data source
        movies_contaminated, movies_fields = check_contamination(movies, 'movies')
        tv_contaminated, tv_fields = check_contamination(tv_series, 'tv_series')
        movies_img_contaminated, movies_img_fields = check_contamination(movies_with_images, 'movies_with_images')
        tv_img_contaminated, tv_img_fields = check_contamination(tv_series_with_images, 'tv_series_with_images')
        
        # Update summary counts for in-memory data
        contamination_report['movies'] = movies_contaminated
        contamination_report['tv_series'] = tv_contaminated
        contamination_report['movies_with_images'] = movies_img_contaminated
        contamination_report['tv_series_with_images'] = tv_img_contaminated
        
        # If include_files is True, also check the JSON files directly
        if include_files:
            import json
            import os
            from flask import current_app
            
            # Define file paths for direct JSON reading
            file_paths = {
                'movies_file': 'cdn/files/movies_little_clean.json',
                'tv_series_file': 'cdn/files/tv_little_clean.json',
                'movies_with_images_file': 'cdn/files/movies_with_images.json',
                'tv_series_with_images_file': 'cdn/files/tv_with_images.json'
            }
            
            for source_name, file_path in file_paths.items():
                try:
                    full_path = os.path.join(current_app.root_path, file_path)
                    if os.path.exists(full_path):
                        with open(full_path, 'r', encoding='utf-8') as f:
                            file_data = json.load(f)
                        
                        # Update total count for this file source
                        contamination_report['data_sources'][source_name]['total'] = len(file_data)
                        
                        # Check contamination in file data
                        file_contaminated, file_fields = check_contamination(file_data, source_name)
                        
                        log_info(f"File {file_path}: {file_contaminated}/{len(file_data)} items contaminated")
                    else:
                        log_warning(f"File not found: {full_path}")
                        contamination_report['data_sources'][source_name]['total'] = 0
                        contamination_report['data_sources'][source_name]['contaminated'] = 0
                        contamination_report['data_sources'][source_name]['fields'] = {}
                        
                except Exception as e:
                    log_error(f"Error reading file {file_path}: {str(e)}")
                    contamination_report['data_sources'][source_name]['total'] = 0
                    contamination_report['data_sources'][source_name]['contaminated'] = 0
                    contamination_report['data_sources'][source_name]['fields'] = {}
        
        # Calculate totals (in-memory + files if requested)
        total_contaminated = sum(
            data['contaminated'] for data in contamination_report['data_sources'].values()
        )
        total_items = sum(
            data['total'] for data in contamination_report['data_sources'].values()
        )
        
        contamination_report['total_contaminated'] = total_contaminated
        contamination_report['total_items'] = total_items
        
        # Combine field counts from all sources
        all_field_counts = {}
        for source_data in contamination_report['data_sources'].values():
            for field, count in source_data['fields'].items():
                all_field_counts[field] = all_field_counts.get(field, 0) + count
        
        contamination_report['contaminated_fields'] = all_field_counts
        
        # Calculate contamination percentage
        contamination_report['contamination_percentage'] = (
            (contamination_report['total_contaminated'] / contamination_report['total_items']) * 100
            if contamination_report['total_items'] > 0 else 0
        )
        
        source_info = f"in-memory data"
        if include_files:
            source_info += " and JSON files"
        
        log_info(f"Data contamination check completed ({source_info}): {contamination_report['total_contaminated']}/{contamination_report['total_items']} items contaminated ({contamination_report['contamination_percentage']:.2f}%)")
        
        return contamination_report
        
    except Exception as e:
        log_error(f"Error counting unwanted fields: {str(e)}")
        return {
            'error': str(e),
            'total_contaminated': 0,
            'total_items': 0,
            'contamination_percentage': 0,
            'data_sources': {}
        }
