from flask import Blueprint, request, jsonify
from api.utils import admin_token_required
import guessit
import os
import re
import concurrent.futures
from utils.logger import log_info, log_error, log_success
from cdn.search_cdn import _perform_search, _perform_search_with_images

file_parser_bp = Blueprint('file_parser_bp', __name__, url_prefix='/api/uploads')

# Video file extensions to accept
VALID_VIDEO_EXTENSIONS = {'.mkv', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp'}

def is_video_file(filename):
    """Check if the file has a valid video extension."""
    _, ext = os.path.splitext(filename.lower())
    return ext in VALID_VIDEO_EXTENSIONS

def contains_hebrew(text):
    """Check if text contains Hebrew characters."""
    hebrew_range = r'[\u0590-\u05FF]'
    return bool(re.search(hebrew_range, text))

def contains_arabic(text):
    """Check if text contains Arabic characters."""
    arabic_range = r'[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]'
    return bool(re.search(arabic_range, text))

def get_hebrew_content_ratio(text):
    """Calculate the ratio of Hebrew characters to total non-ASCII characters."""
    hebrew_chars = len(re.findall(r'[\u0590-\u05FF]', text))
    non_ascii_chars = len(re.findall(r'[^\x00-\x7F]', text))
    
    if non_ascii_chars == 0:
        return 0.0
    return hebrew_chars / non_ascii_chars

def should_use_hebrew_parsing(filename, guessit_result):
    """Determine if Hebrew parsing should be used based on multiple factors."""
    # Check for Hebrew characters in filename
    has_hebrew = contains_hebrew(filename)
    has_arabic = contains_arabic(filename)
    hebrew_ratio = get_hebrew_content_ratio(filename)
    
    # If there's no Hebrew content at all, don't use Hebrew parsing
    if not has_hebrew:
        return False
    
    # Check for Hebrew season/episode patterns
    hebrew_patterns = [
        r'ע(\d+)\s*פ(\d+)',      # Standard: ע1 פ2
        r'עונה\s*(\d+)\s*פרק\s*(\d+)',  # Full words: עונה 1 פרק 2
        r'ס(\d+)\s*א(\d+)',       # Alternative: ס1 א2 (season/episode)
        r'S(\d+)E(\d+)',          # English pattern in Hebrew context (only if Hebrew content exists)
    ]
    
    hebrew_pattern_match = None
    for pattern in hebrew_patterns:
        match = re.search(pattern, filename, re.IGNORECASE)
        if match:
            hebrew_pattern_match = match
            break
    
    # Check GuessIt parsing quality
    guessit_has_season = guessit_result.get('season') is not None
    guessit_has_episode = guessit_result.get('episode') is not None
    guessit_detected_episode = guessit_result.get('type') == 'episode'
    guessit_has_title = bool(guessit_result.get('title', '').strip())
    
    # Enhanced decision logic:
    # 1. If Hebrew episode pattern is found AND Hebrew content exists, use Hebrew parsing
    # 2. If significant Hebrew content AND GuessIt failed to detect episodes properly
    # 3. If Hebrew content > 50% AND GuessIt title is poor quality
    # 4. Avoid Hebrew parsing for Arabic content without Hebrew
    
    if hebrew_pattern_match and has_hebrew:
        return True
    
    if has_arabic and not has_hebrew:
        # Arabic content without Hebrew - don't use Hebrew parsing
        return False
    
    if has_hebrew and hebrew_ratio > 0.3:
        # Significant Hebrew content
        if not (guessit_has_season and guessit_has_episode and guessit_detected_episode):
            return True
        
        # Check if GuessIt title quality is poor for Hebrew content
        if guessit_has_title:
            title = guessit_result.get('title', '')
            # If title is very short or contains mostly punctuation/numbers
            if len(title.strip()) < 3 or len(re.sub(r'[^\w\s]', '', title)) < 2:
                return True
    
    return False

def parse_hebrew_episode_pattern(filename):
    """Parse Hebrew episode patterns with multiple format support."""
    # Multiple Hebrew patterns for season and episode
    patterns = [
        (r'ע(\d+)\s*פ(\d+)', 'ע\d+ פ\d+'),           # Standard: ע1 פ2
        (r'עונה\s*(\d+)\s*פרק\s*(\d+)', 'עונה \d+ פרק \d+'),  # Full: עונה 1 פרק 2
        (r'ס(\d+)\s*א(\d+)', 'ס\d+ א\d+'),           # Alternative: ס1 א2
        (r'S(\d+)E(\d+)', 'S\d+E\d+'),               # English in Hebrew context
        (r'season\s*(\d+)\s*episode\s*(\d+)', 'season \d+ episode \d+'),  # English words
    ]
    
    for pattern, pattern_desc in patterns:
        match = re.search(pattern, filename, re.IGNORECASE)
        if match:
            season = int(match.group(1))
            episode = int(match.group(2))
            
            # Remove the season/episode pattern and extract both show title and episode title
            title_with_episode = re.sub(pattern, '', filename, flags=re.IGNORECASE)
            # Remove file extension
            title_with_episode = os.path.splitext(title_with_episode)[0]
            
            # Try to separate show title from episode title BEFORE cleanup
            # This preserves the original separators
            episode_title = None
            show_title = title_with_episode
            
            # Check for episode title separators
            separators = [' - ', ' – ', ' — ', ' : ']
            for sep in separators:
                if sep in title_with_episode:
                    parts = title_with_episode.split(sep, 1)
                    if len(parts) == 2 and len(parts[1].strip()) > 2:
                        show_title = parts[0].strip()
                        episode_title = parts[1].strip()
                        break
            
            # Now clean up both titles separately
            # Clean show title
            show_title = re.sub(r'[-_\.]+', ' ', show_title)
            show_title = re.sub(r'\s+', ' ', show_title).strip()
            
            # Clean episode title if found
            if episode_title:
                episode_title = re.sub(r'[-_\.]+', ' ', episode_title)
                episode_title = re.sub(r'\s+', ' ', episode_title).strip()
            
            # Remove common quality indicators and release info from both
            quality_patterns = [
                r'\b(1080p|720p|480p|4K|HD|HDRip|BluRay|WEBRip|HDTV)\b',
                r'\b(x264|x265|H\.264|H\.265|AVC|HEVC)\b',
                r'\b(AAC|MP3|AC3|DTS)\b',
                r'\b(PROPER|REPACK|INTERNAL|LIMITED)\b',
                r'\[[^\]]*\]',  # Remove content in brackets
                r'\([^)]*\)',   # Remove content in parentheses if it looks like release info
            ]
            
            for quality_pattern in quality_patterns:
                show_title = re.sub(quality_pattern, '', show_title, flags=re.IGNORECASE)
                if episode_title:
                    episode_title = re.sub(quality_pattern, '', episode_title, flags=re.IGNORECASE)
            
            # Final cleanup
            show_title = re.sub(r'\s+', ' ', show_title).strip()
            if episode_title:
                episode_title = re.sub(r'\s+', ' ', episode_title).strip()
            
            clean_title = show_title
            
            # Don't return empty titles
            if not clean_title or len(clean_title) < 2:
                continue
            
            return {
                'title': clean_title,
                'season': season,
                'episode': episode,
                'episode_title': episode_title or f"Episode {episode}",
                'type': 'episode',
                'pattern_used': pattern_desc
            }
    
    return None

def search_cdn_metadata(title, content_type, year=None):
    """Search CDN/TMDB for metadata based on title and type."""
    try:
        # Use existing CDN search functionality
        media_type = 'movies' if content_type == 'movie' else 'tv'
        
        # Perform search with high max results to get best match
        results = _perform_search_with_images(
            query=title,
            genre='',
            min_rating=0,
            max_rating=10,
            media_type=media_type,
            is_random=False,
            with_images=True,
            page=1,
            per_page=10
        )
        
        if not results:
            return None
            
        # Try to find best match by year if provided
        if year and results:
            year_matches = []
            for result in results:
                result_year = None
                if content_type == 'movie' and result.get('release_date'):
                    result_year = int(result['release_date'][:4])
                elif content_type == 'tv' and result.get('first_air_date'):
                    result_year = int(result['first_air_date'][:4])
                
                if result_year == year:
                    year_matches.append(result)
            
            if year_matches:
                results = year_matches
        
        # Return the best match (first result)
        return results[0] if results else None
        
    except Exception as e:
        log_error(f"Error searching CDN metadata for '{title}': {str(e)}")
        return None

def parse_single_file(filename):
    """Parse a single filename using GuessIt and enhanced Hebrew parsing."""
    try:
        if not is_video_file(filename):
            return {
                'filename': filename,
                'error': f'Invalid file type. Only video files are supported: {", ".join(VALID_VIDEO_EXTENSIONS)}'
            }
        
        # Use GuessIt to parse the filename first
        guess = guessit.guessit(filename)
        
        # Determine if we should use Hebrew parsing based on smart detection
        use_hebrew = should_use_hebrew_parsing(filename, guess)
        
        # Store Hebrew parse result for later use
        hebrew_parse = None
        
        if use_hebrew:
            # Try Hebrew parsing
            hebrew_parse = parse_hebrew_episode_pattern(filename)
            if hebrew_parse:
                title = hebrew_parse['title']
                season_number = hebrew_parse['season']
                episode_number = hebrew_parse['episode']
                content_type = 'tv'
                year = guess.get('year')  # Still try to get year from GuessIt if available
                parsing_method = 'hebrew'
                
                log_info(f"Hebrew parsing successful for '{filename}': {hebrew_parse['pattern_used']} -> '{title}' S{season_number}E{episode_number}")
            else:
                # Hebrew detection triggered but no pattern found, fallback to GuessIt
                title = guess.get('title')
                if not title:
                    return {
                        'filename': filename,
                        'error': 'Could not extract title from filename using either Hebrew or GuessIt parsing'
                    }
                
                content_type = 'movie'
                if guess.get('type') == 'episode':
                    content_type = 'tv'
                
                year = guess.get('year')
                season_number = guess.get('season')
                episode_number = guess.get('episode')
                parsing_method = 'guessit_fallback'
                
                log_info(f"Hebrew detection triggered but no pattern found for '{filename}', using GuessIt fallback")
        else:
            # Use GuessIt results
            title = guess.get('title')
            if not title:
                return {
                    'filename': filename,
                    'error': 'Could not extract title from filename'
                }
            
            # Determine content type
            content_type = 'movie'
            if guess.get('type') == 'episode':
                content_type = 'tv'
            
            year = guess.get('year')
            season_number = guess.get('season')
            episode_number = guess.get('episode')
            parsing_method = 'guessit'
            
            log_info(f"GuessIt parsing for '{filename}': '{title}' ({content_type})")
        
        # Enhanced metadata search with better error handling
        try:
            cdn_data = search_cdn_metadata(title, 'movie' if content_type == 'movie' else 'tv', year)
            if cdn_data:
                log_info(f"Found CDN metadata for '{title}': {cdn_data.get('name', cdn_data.get('title', 'Unknown'))}")
            else:
                log_info(f"No CDN metadata found for '{title}'")
        except Exception as e:
            log_error(f"Error searching CDN metadata for '{title}': {str(e)}")
            cdn_data = None
        
        # Detect subtitle indicators in filename
        has_subtitles = detect_subtitle_indicators(filename)
        
        # Also check GuessIt subtitle_language detection
        if not has_subtitles and guess.get('subtitle_language'):
            has_subtitles = True

        # Build comprehensive result
        result = {
            'filename': filename,
            'content_type': content_type,
            'title': title,
            'parsing_method': parsing_method,
            'has_subtitles': has_subtitles,
            'parsing_metadata': {
                'has_hebrew': contains_hebrew(filename),
                'has_arabic': contains_arabic(filename),
                'hebrew_ratio': get_hebrew_content_ratio(filename),
                'guessit_confidence': {
                    'has_title': bool(guess.get('title', '').strip()),
                    'has_season': guess.get('season') is not None,
                    'has_episode': guess.get('episode') is not None,
                    'detected_as_episode': guess.get('type') == 'episode'
                }
            },
            'guessit_data': {
                'title': title,
                'year': year,
                'season': season_number,
                'episode': episode_number,
                'type': 'episode' if content_type == 'tv' else guess.get('type'),
                'release_group': guess.get('release_group'),
                'video_codec': guess.get('video_codec'),
                'audio_codec': guess.get('audio_codec'),
                'resolution': guess.get('screen_size'),
                'source': guess.get('source'),
                'container': guess.get('container'),
                'language': guess.get('language'),
                'subtitle_language': guess.get('subtitle_language'),
                'hebrew_parsed': parsing_method == 'hebrew'
            },
            'cdn_data': cdn_data,
            'quality_info': {
                'resolution': guess.get('screen_size'),
                'video_codec': guess.get('video_codec'),
                'audio_codec': guess.get('audio_codec'),
                'source': guess.get('source'),
                'release_group': guess.get('release_group')
            }
        }
        
        # Add episode-specific data for TV shows
        if content_type == 'tv' and season_number is not None and episode_number is not None:
            result['season_number'] = season_number
            result['episode_number'] = episode_number
            
            # Try to get episode title from different sources in priority order:
            # 1. Hebrew parsing result (if Hebrew parsing was used)
            # 2. CDN data
            # 3. Extract from filename
            episode_title = None
            
            # Check if Hebrew parsing provided an episode title
            if parsing_method == 'hebrew' and use_hebrew and hebrew_parse and hebrew_parse.get('episode_title'):
                episode_title = hebrew_parse['episode_title']
            
            # If no Hebrew episode title, try CDN data
            if not episode_title and cdn_data and cdn_data.get('seasons'):
                for season in cdn_data['seasons']:
                    if season.get('season_number') == season_number:
                        for episode in season.get('episodes', []):
                            if episode.get('episode_number') == episode_number:
                                episode_title = episode.get('name')
                                break
                        break
            
            # If no CDN episode title found, extract from filename
            if not episode_title:
                episode_title = extract_episode_name_from_filename(filename, title, season_number, episode_number)
            
            result['episode_title'] = episode_title
        
        return result
        
    except Exception as e:
        log_error(f"Error parsing file '{filename}': {str(e)}")
        return {
            'filename': filename,
            'error': f'Parsing error: {str(e)}'
        }

def group_episodes(parsed_files):
    """Group TV show episodes under their parent show with enhanced metadata."""
    movies = []
    shows = {}
    
    for parsed_file in parsed_files:
        if 'error' in parsed_file:
            movies.append(parsed_file)  # Keep errors in the list
            continue
            
        if parsed_file['content_type'] == 'movie':
            movies.append(parsed_file)
        else:  # TV show
            show_title = parsed_file['title']
            
            if show_title not in shows:
                # Extract year from the first episode's guessit_data if available
                year = parsed_file.get('guessit_data', {}).get('year')
                
                shows[show_title] = {
                    'content_type': 'tv',
                    'title': show_title,
                    'year': year,
                    'cdn_data': parsed_file.get('cdn_data'),
                    'parsing_summary': {
                        'methods_used': set(),
                        'total_episodes': 0,
                        'hebrew_episodes': 0,
                        'seasons_found': set()
                    },
                    'episodes': {}  # Use dict to organize by season
                }
            
            # Update parsing summary
            method = parsed_file.get('parsing_method', 'unknown')
            shows[show_title]['parsing_summary']['methods_used'].add(method)
            shows[show_title]['parsing_summary']['total_episodes'] += 1
            
            if parsed_file.get('guessit_data', {}).get('hebrew_parsed', False):
                shows[show_title]['parsing_summary']['hebrew_episodes'] += 1
            
            # Organize episodes by season
            season_num = parsed_file.get('season_number', 1)
            shows[show_title]['parsing_summary']['seasons_found'].add(season_num)
            
            if season_num not in shows[show_title]['episodes']:
                shows[show_title]['episodes'][season_num] = []
            
            # Add episode to the season with enhanced metadata
            episode_data = {
                'filename': parsed_file['filename'],
                'season': season_num,
                'episode': parsed_file.get('episode_number'),
                'title': parsed_file.get('episode_title', f"Episode {parsed_file.get('episode_number', '')}"),
                'overview': '',  # Can be filled from CDN data if available
                'has_subtitles': parsed_file.get('has_subtitles', False),  # Include subtitle detection
                'parsing_method': method,
                'quality_info': parsed_file.get('quality_info', {}),
                'guessit_data': parsed_file['guessit_data']
            }
            
            shows[show_title]['episodes'][season_num].append(episode_data)
    
    # Sort episodes within each season and convert sets to lists for JSON serialization
    for show in shows.values():
        for season_episodes in show['episodes'].values():
            season_episodes.sort(key=lambda ep: ep.get('episode') or 0)
        
        # Convert sets to sorted lists for JSON compatibility
        show['parsing_summary']['methods_used'] = sorted(list(show['parsing_summary']['methods_used']))
        show['parsing_summary']['seasons_found'] = sorted(list(show['parsing_summary']['seasons_found']))
    
    # Combine movies and shows
    result = movies + list(shows.values())
    
    return result

@file_parser_bp.route('/parse-files', methods=['POST'])
@admin_token_required('moderator')
def parse_files(current_admin):
    """Parse multiple filenames and return metadata."""
    try:
        data = request.get_json()
        if not data or 'filenames' not in data:
            return jsonify({'error': 'Missing filenames in request'}), 400
        
        filenames = data['filenames']
        if not isinstance(filenames, list):
            return jsonify({'error': 'Filenames must be a list'}), 400
        
        if not filenames:
            return jsonify({'error': 'No filenames provided'}), 400
        
        log_info(f"Admin {current_admin.username} is parsing {len(filenames)} files")
        
        # Parse files concurrently for better performance
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            parsed_files = list(executor.map(parse_single_file, filenames))
        
        # Group TV show episodes under their parent shows
        grouped_results = group_episodes(parsed_files)
        
        # Enhanced statistics calculation
        success_count = sum(1 for item in grouped_results if 'error' not in item)
        error_count = sum(1 for item in grouped_results if 'error' in item)
        
        # Calculate parsing method statistics
        parsing_stats = {
            'hebrew': 0,
            'guessit': 0,
            'guessit_fallback': 0
        }
        
        hebrew_files = []
        tv_shows_count = 0
        movies_count = 0
        total_episodes = 0
        
        for item in grouped_results:
            if 'error' in item:
                continue
                
            if item['content_type'] == 'tv':
                tv_shows_count += 1
                if 'parsing_summary' in item:
                    total_episodes += item['parsing_summary']['total_episodes']
                    for method in item['parsing_summary']['methods_used']:
                        if method in parsing_stats:
                            parsing_stats[method] += item['parsing_summary']['total_episodes']
            else:
                movies_count += 1
                # For movies, check individual parsing method
                method = item.get('parsing_method', 'unknown')
                if method in parsing_stats:
                    parsing_stats[method] += 1
        
        # Find Hebrew files for logging
        for parsed_file in parsed_files:
            if parsed_file.get('parsing_metadata', {}).get('has_hebrew', False):
                hebrew_files.append(parsed_file['filename'])
        
        # Enhanced logging
        if hebrew_files:
            log_info(f"Hebrew files detected: {len(hebrew_files)} files")
            for hf in hebrew_files[:5]:  # Log first 5 Hebrew files
                log_info(f"  - {hf}")
        
        log_success(f"Parsed {len(filenames)} files: {success_count} successful, {error_count} errors")
        log_info(f"Content breakdown: {tv_shows_count} TV shows ({total_episodes} episodes), {movies_count} movies")
        log_info(f"Parsing methods: Hebrew={parsing_stats['hebrew']}, GuessIt={parsing_stats['guessit']}, Fallback={parsing_stats['guessit_fallback']}")
        print(grouped_results)

        def make_json_serializable(obj):
            if isinstance(obj, dict):
                return {key: make_json_serializable(value) for key, value in obj.items()}
            elif isinstance(obj, list):
                return [make_json_serializable(item) for item in obj]
            elif hasattr(obj, '__dict__'):
                return {key: make_json_serializable(value) for key, value in obj.__dict__.items()}
            elif hasattr(obj, 'name'):  # for objects with a 'name' attribute, like languages
                return obj.name
            else:
                return obj
        
        return jsonify({
            'results': [make_json_serializable(item) for item in grouped_results],
            'stats': {
                'total_files': len(filenames),
                'successful': success_count,
                'errors': error_count,
                'content_breakdown': {
                    'tv_shows': tv_shows_count,
                    'movies': movies_count,
                    'total_episodes': total_episodes
                },
                'parsing_methods': parsing_stats,
                'hebrew_files_detected': len(hebrew_files)
            }
        })
        
    except Exception as e:
        log_error(f"Error in parse_files endpoint: {str(e)}")
        return jsonify({'error': f'Server error: {str(e)}'}), 500

def extract_episode_name_from_filename(filename, show_title, season_num, episode_num):
    """Extract episode name from filename by removing show title, season/episode info, and file extension."""
    try:
        # Remove file extension
        name_without_ext = os.path.splitext(filename)[0]
        
        # First, look for episode title separators before any cleanup
        # Common separators: " - ", " – ", " — ", " : "
        episode_title = None
        separators = [' - ', ' – ', ' — ', ' : ', '  ']
        
        # Check if there's a clear episode title separator
        for sep in separators:
            if sep in name_without_ext:
                # Split and look for the episode title part
                parts = name_without_ext.split(sep)
                if len(parts) >= 2:
                    # Usually the last meaningful part is the episode title
                    for part in reversed(parts[1:]):
                        part = part.strip()
                        # Check if this part looks like an episode title (not quality info)
                        if (len(part) > 3 and 
                            not re.match(r'^[0-9\.\-_]+$', part) and  # Not just numbers/separators
                            not re.search(r'\b(1080p?|720p?|480p?|4K|UHD|HDR|BluRay|BDRip|DVDRip|WEBRip|HDTV|WEB)\b', part, re.IGNORECASE) and
                            not re.search(r'\b(x264|x265|H\.?264|H\.?265|HEVC|AVC|AAC|AC3|DTS|MP3|FLAC)\b', part, re.IGNORECASE) and
                            not re.search(r'\b(INTERNAL|REPACK|PROPER|EXTENDED|UNCUT|DC|DIRECTORS?.CUT)\b', part, re.IGNORECASE) and
                            not re.search(r'\b(YIFY|ETHEL|RARBG|PublicHD|FGT|KILLERS|LOL|DIMENSION|with)\b', part, re.IGNORECASE) and
                            not re.search(r'\b(subtitles?|sub|subs|english|hebrew)\b', part, re.IGNORECASE) and
                            not re.search(r'^[A-Z0-9]+-with.*', part, re.IGNORECASE)):  # Release group patterns
                            
                            # Additional cleaning for release groups and quality at the end
                            cleaned_part = re.sub(r'-[A-Z0-9]+$', '', part)  # Remove trailing release groups like -KILLERS
                            cleaned_part = re.sub(r'\b(1080p?|720p?|480p?|4K|UHD|HDR|BluRay|WEB)\b.*$', '', cleaned_part, flags=re.IGNORECASE)  # Remove quality and everything after
                            cleaned_part = cleaned_part.strip()
                            
                            if len(cleaned_part) > 3:
                                episode_title = cleaned_part
                                break
                if episode_title:
                    break
        
        # If we found a good episode title, return it
        if episode_title:
            return episode_title
        
        # If no separator found, try to extract by removing known patterns
        cleaned_name = name_without_ext
        
        # Common patterns to remove
        patterns_to_remove = [
            # Show title variations (be more careful with escaping)
            re.escape(show_title) if show_title else '',
            # Season/Episode patterns
            rf'[Ss]0?{season_num}[Ee]0?{episode_num}',
            rf'[Ss]{season_num:02d}[Ee]{episode_num:02d}',
            rf'Season\s*{season_num}\s*Episode\s*{episode_num}',
            rf'{season_num}x{episode_num:02d}',
            rf'{season_num}x0?{episode_num}',
            # Hebrew patterns
            rf'ע0?{season_num}\s*פ0?{episode_num}',
            rf'עונה\s*{season_num}\s*פרק\s*{episode_num}',
            rf'ס0?{season_num}\s*א0?{episode_num}',
            # Quality/source indicators (more comprehensive)
            r'\b(1080p?|720p?|480p?|4K|UHD|HDR|BluRay|BDRip|DVDRip|WEBRip|HDTV|WEB)\b',
            r'\b(x264|x265|H\.?264|H\.?265|HEVC|AVC)\b',
            r'\b(AAC|AC3|DTS|MP3|FLAC)\b',
            r'\b(INTERNAL|REPACK|PROPER|EXTENDED|UNCUT|DC|DIRECTORS?.CUT)\b',
            r'\b(YIFY|ETHEL|RARBG|PublicHD|FGT|KILLERS|LOL|DIMENSION|with)\b',  # Common release groups
            r'\b(subtitles?|sub|subs)\b',  # Subtitle indicators
            r'\[[^\]]*\]',  # Remove anything in brackets
            r'\([^)]*\)',   # Remove anything in parentheses
            # Release groups (pattern: hyphen followed by group name)
            r'\-[A-Za-z0-9]+(-with)?.*$',
            # Year patterns
            r'\b(19|20)\d{2}\b',
            # Extra separators and quality info
            r'[\.\-_]+$',  # Remove trailing dots, dashes, underscores
            r'^[\.\-_]+',  # Remove leading dots, dashes, underscores
        ]
        
        # Apply all patterns
        for pattern in patterns_to_remove:
            if pattern:  # Skip empty patterns
                cleaned_name = re.sub(pattern, '', cleaned_name, flags=re.IGNORECASE)
        
        # Clean up multiple separators and whitespace
        cleaned_name = re.sub(r'[\.\-_]+', ' ', cleaned_name)  # Replace separators with spaces
        cleaned_name = re.sub(r'\s+', ' ', cleaned_name)  # Multiple spaces to single space
        cleaned_name = cleaned_name.strip(' .-_')  # Remove leading/trailing separators
        
        # If we have a meaningful episode name, return it
        # But be more strict about what constitutes a "meaningful" name
        if (len(cleaned_name) > 3 and 
            not re.match(r'^[0-9\s\.\-_]+$', cleaned_name) and  # Not just numbers and separators
            not re.search(r'\b(1080p?|720p?|480p?|4K|UHD|HDR|BluRay|BDRip|DVDRip|WEBRip|HDTV|WEB)\b', cleaned_name, re.IGNORECASE) and
            not re.search(r'\b(x264|x265|H\.?264|H\.?265|HEVC|AVC|AAC|AC3|DTS|MP3|FLAC)\b', cleaned_name, re.IGNORECASE)):
            return cleaned_name
            
        # Fallback to generic episode name
        return f"Episode {episode_num}"
        
    except Exception as e:
        log_error(f"Error extracting episode name from '{filename}': {str(e)}")
        return f"Episode {episode_num}"

def detect_subtitle_indicators(filename):
    """
    Detect subtitle-related indicators in the filename.
    Returns True if the filename contains subtitle-related tags.
    """
    subtitle_patterns = [
        r'\bwith[_\-\s]*subtitles?\b',  # with_subtitles, with-subtitles, with subtitles
        r'\bsub(?:titles?)?\b',         # sub, subs, subtitle, subtitles
        r'\bcc\b',                      # closed captions
        r'\bcaptions?\b',               # caption, captions
        r'\bhardcoded\b',               # hardcoded subs
        r'\bembedded\b',                # embedded subs
        r'\bintern(?:al)?\b',           # internal subs
        r'\bext(?:ernal)?\b',           # external subs
        r'\b(?:en|eng|english)[_\-\s]*sub',    # english subs
        r'\b(?:he|heb|hebrew)[_\-\s]*sub',     # hebrew subs
        r'\b(?:es|spa|spanish)[_\-\s]*sub',    # spanish subs
        r'\b(?:fr|fre|french)[_\-\s]*sub',     # french subs
        r'\b(?:de|ger|german)[_\-\s]*sub',     # german subs
        r'\b(?:it|ita|italian)[_\-\s]*sub',    # italian subs
        r'\b(?:pt|por|portuguese)[_\-\s]*sub', # portuguese subs
        r'\b(?:ru|rus|russian)[_\-\s]*sub',    # russian subs
        r'\b(?:ja|jap|japanese)[_\-\s]*sub',   # japanese subs
        r'\b(?:ko|kor|korean)[_\-\s]*sub',     # korean subs
        r'\b(?:zh|chi|chinese)[_\-\s]*sub',    # chinese subs
        r'\b(?:ar|ara|arabic)[_\-\s]*sub',     # arabic subs
        r'\bmulti[_\-\s]*sub',          # multi-language subs
        r'\bdual[_\-\s]*sub',           # dual subs
        r'\bsrt\b',                     # srt files mentioned
        r'\bvtt\b',                     # vtt files mentioned
        r'\bass\b',                     # ass files mentioned
        r'\bssa\b'                      # ssa files mentioned
    ]
    
    filename_lower = filename.lower()
    
    for pattern in subtitle_patterns:
        if re.search(pattern, filename_lower, re.IGNORECASE):
            return True
    
    return False
