from flask import Blueprint, request, jsonify
from api.utils import admin_token_required
import guessit
import os
import concurrent.futures
from utils.logger import log_info, log_error, log_success
from cdn.search_cdn import _perform_search

file_parser_bp = Blueprint('file_parser_bp', __name__, url_prefix='/api/uploads')

# Video file extensions to accept
VALID_VIDEO_EXTENSIONS = {'.mkv', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp'}

def is_video_file(filename):
    """Check if the file has a valid video extension."""
    _, ext = os.path.splitext(filename.lower())
    return ext in VALID_VIDEO_EXTENSIONS

def search_cdn_metadata(title, content_type, year=None):
    """Search CDN/TMDB for metadata based on title and type."""
    try:
        # Use existing CDN search functionality
        media_type = 'movies' if content_type == 'movie' else 'tv'
        
        # Perform search with high max results to get best match
        results = _perform_search(
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
    """Parse a single filename using GuessIt and search for metadata."""
    try:
        if not is_video_file(filename):
            return {
                'filename': filename,
                'error': f'Invalid file type. Only video files are supported: {", ".join(VALID_VIDEO_EXTENSIONS)}'
            }
        
        # Use GuessIt to parse the filename
        guess = guessit.guessit(filename)
        
        # Extract basic information
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
        
        # Search for metadata
        cdn_data = search_cdn_metadata(title, 'movie' if content_type == 'movie' else 'tv', year)
        
        result = {
            'filename': filename,
            'content_type': content_type,
            'title': title,
            'guessit_data': {
                'title': title,
                'year': year,
                'season': season_number,
                'episode': episode_number,
                'type': guess.get('type'),
                'release_group': guess.get('release_group'),
                'video_codec': guess.get('video_codec'),
                'audio_codec': guess.get('audio_codec'),
                'resolution': guess.get('screen_size'),
                'source': guess.get('source')
            },
            'cdn_data': cdn_data
        }
        
        # Add episode-specific data for TV shows
        if content_type == 'tv' and season_number is not None and episode_number is not None:
            result['season_number'] = season_number
            result['episode_number'] = episode_number
            
            # Try to get episode title from CDN data if available
            episode_title = f"Episode {episode_number}"
            if cdn_data and cdn_data.get('seasons'):
                for season in cdn_data['seasons']:
                    if season.get('season_number') == season_number:
                        for episode in season.get('episodes', []):
                            if episode.get('episode_number') == episode_number:
                                episode_title = episode.get('name', episode_title)
                                break
                        break
            
            result['episode_title'] = episode_title
        
        return result
        
    except Exception as e:
        log_error(f"Error parsing file '{filename}': {str(e)}")
        return {
            'filename': filename,
            'error': f'Parsing error: {str(e)}'
        }

def group_episodes(parsed_files):
    """Group TV show episodes under their parent show."""
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
                shows[show_title] = {
                    'content_type': 'tv',
                    'title': show_title,
                    'cdn_data': parsed_file.get('cdn_data'),
                    'episodes': []
                }
            
            # Add episode to the show
            episode_data = {
                'filename': parsed_file['filename'],
                'season_number': parsed_file.get('season_number'),
                'episode_number': parsed_file.get('episode_number'),
                'episode_title': parsed_file.get('episode_title', f"Episode {parsed_file.get('episode_number', '')}"),
                'guessit_data': parsed_file['guessit_data']
            }
            
            shows[show_title]['episodes'].append(episode_data)
    
    # Sort episodes within each show
    for show in shows.values():
        show['episodes'].sort(key=lambda ep: (ep.get('season_number', 0), ep.get('episode_number', 0)))
    
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
        
        if len(filenames) > 100:  # Limit to prevent abuse
            return jsonify({'error': 'Too many files. Maximum 100 files per request'}), 400
        
        log_info(f"Admin {current_admin.username} is parsing {len(filenames)} files")
        
        # Parse files concurrently for better performance
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            parsed_files = list(executor.map(parse_single_file, filenames))
        
        # Group TV show episodes under their parent shows
        grouped_results = group_episodes(parsed_files)
        
        # Count success/error statistics
        success_count = sum(1 for item in grouped_results if 'error' not in item)
        error_count = sum(1 for item in grouped_results if 'error' in item)
        
        log_success(f"Parsed {len(filenames)} files: {success_count} successful, {error_count} errors")
        
        return jsonify({
            'results': grouped_results,
            'stats': {
                'total_files': len(filenames),
                'successful': success_count,
                'errors': error_count
            }
        })
        
    except Exception as e:
        log_error(f"Error in parse_files endpoint: {str(e)}")
        return jsonify({'error': f'Server error: {str(e)}'}), 500
