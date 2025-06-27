from flask import Blueprint, jsonify, request, current_app
from api.utils import admin_token_required
import json
import os
import traceback
from utils.logger import log_error, log_success, log_warning

cdn_admin_bp = Blueprint('cdn_admin_bp', __name__, url_prefix='/api/cdn/admin')

@cdn_admin_bp.route('/content/<string:content_type>/<int:content_id>', methods=['PUT'])
@admin_token_required('moderator')
def update_cdn_content(current_admin, content_type, content_id):
    """Update a content item directly in the CDN JSON file"""
    try:
        # Get the request data
        data = request.get_json()
        if not data:
            return jsonify({"message": "No data provided"}), 400

        # Validate content_type
        if content_type not in ['movie', 'tv']:
            return jsonify({"message": f"Invalid content type: {content_type}. Must be 'movie' or 'tv'"}), 400
            
        # Get the correct file path based on content type
        cdn_file_path = os.path.join(
            current_app.root_path, 
            f'cdn/files/{"movies" if content_type == "movie" else "tv"}_little_clean.json'
        )
        
        # Read the existing content
        items = []
        try:
            with open(cdn_file_path, 'r', encoding='utf-8') as f:
                items = json.load(f)
        except FileNotFoundError:
            return jsonify({"message": f"CDN file not found: {cdn_file_path}"}), 404
        except json.JSONDecodeError as e:
            return jsonify({"message": f"Error parsing CDN file: {str(e)}"}), 500
        
        # Find and update the item
        item_found = False
        for i, item in enumerate(items):
            if item.get('id') == content_id:
                # Preserve the id field
                data['id'] = content_id
                items[i] = data
                item_found = True
                break
        
        if not item_found:
            return jsonify({"message": f"Content with ID {content_id} not found in CDN data"}), 404
        
        # Write back to the file
        try:
            with open(cdn_file_path, 'w', encoding='utf-8') as f:
                json.dump(items, f, indent=2)
        except Exception as e:
            # Log and return error
            log_error(f"Error writing to CDN file: {str(e)}")
            return jsonify({"message": f"Error updating CDN file: {str(e)}"}), 500
        
        # Update the in-memory data
        import app
        if content_type == 'movie':
            app.movies = items
        else:
            app.tv_series = items
            
        # Rebuild search indexes after content update
        app.rebuild_content_indexes()
            
        # Also update the "with_images" version if needed
        try:
            from cdn.utils import check_images_existence
            if check_images_existence(data):
                with_images_file_path = os.path.join(
                    current_app.root_path, 
                    f'cdn/files/{"movies" if content_type == "movie" else "tv"}_with_images.json'
                )
                
                # Read with_images content
                with_images_items = []
                try:
                    with open(with_images_file_path, 'r', encoding='utf-8') as f:
                        with_images_items = json.load(f)
                except FileNotFoundError:
                    return jsonify({"message": f"With images CDN file not found: {with_images_file_path}"}), 404
                except json.JSONDecodeError as e:
                    return jsonify({"message": f"Error parsing with images CDN file: {str(e)}"}), 500
                
                # Update or add to with_images
                with_images_found = False
                for i, item in enumerate(with_images_items):
                    if item.get('id') == content_id:
                        with_images_items[i] = data
                        with_images_found = True
                        break
                
                if not with_images_found:
                    with_images_items.append(data)
                    
                # Write back to the with_images file
                try:
                    with open(with_images_file_path, 'w', encoding='utf-8') as f:
                        json.dump(with_images_items, f, indent=2)
                except Exception as e:
                    # Log and continue - this is not critical
                    log_error(f"Warning: Error writing to with images CDN file: {str(e)}")
                    
                # Update in-memory with_images data
                if content_type == 'movie':
                    app.movies_with_images = with_images_items
                else:
                    app.tv_series_with_images = with_images_items
        except Exception as e:
            # Log but continue - this is not critical
            log_error(f"Warning: Error updating with_images data: {str(e)}")
        
        return jsonify({
            "message": f"{content_type.capitalize()} with ID {content_id} updated successfully in CDN",
            "updated": True
        }), 200
    
    except Exception as e:
        error_msg = f"Error updating CDN content: {str(e)}"
        log_error(error_msg)
        return jsonify({"message": error_msg, "error": str(e)}), 500

@cdn_admin_bp.route('/content/<string:content_type>/<int:content_id>', methods=['DELETE'])
@admin_token_required('moderator')
def delete_cdn_content(current_admin, content_type, content_id):
    """Delete a content item and its associated images from the CDN"""
    try:
        # First get the content item to find associated images
        cdn_file_path = os.path.join(
            current_app.root_path, 
            f'cdn/files/{"movies" if content_type == "movie" else "tv"}_little_clean.json'
        )
        
        # Read the existing content
        items = []
        with open(cdn_file_path, 'r') as f:
            items = json.load(f)
            
        # Find the item before deletion to get image paths
        content_item = next((item for item in items if item.get('id') == content_id), None)
        
        if not content_item:
            return jsonify({"message": f"Content with ID {content_id} not found in CDN data"}), 404
            
        # Collect image paths to delete
        image_paths = []
        
        # Add poster and backdrop
        if content_item.get('poster_path'):
            image_paths.append(content_item['poster_path'].lstrip('/'))
        if content_item.get('backdrop_path'):
            image_paths.append(content_item['backdrop_path'].lstrip('/'))
            
        # For TV shows, also collect season posters and episode stills
        if content_type == 'tv' and 'seasons' in content_item:
            for season in content_item['seasons']:
                if season.get('poster_path'):
                    image_paths.append(season['poster_path'].lstrip('/'))
                    
                if 'episodes' in season:
                    for episode in season['episodes']:
                        if episode.get('still_path'):
                            image_paths.append(episode['still_path'].lstrip('/'))
        
        # Now delete the content from the JSON file
        original_count = len(items)
        items = [item for item in items if item.get('id') != content_id]
        
        if len(items) == original_count:
            return jsonify({"message": f"Content with ID {content_id} not found in CDN data"}), 404
        
        # Write back to the file
        with open(cdn_file_path, 'w') as f:
            json.dump(items, f, indent=2)
        
        # Update the in-memory data
        import app
        if content_type == 'movie':
            app.movies = items
        else:
            app.tv_series = items
            
        # Rebuild search indexes after content deletion
        app.rebuild_content_indexes()
            
        # Also update the "with_images" version
        try:
            with_images_file_path = os.path.join(
                current_app.root_path, 
                f'cdn/files/{"movies" if content_type == "movie" else "tv"}_with_images.json'
            )
            
            # Read with_images content
            with_images_items = []
            with open(with_images_file_path, 'r') as f:
                with_images_items = json.load(f)
            
            # Remove from with_images if present
            with_images_items = [item for item in with_images_items if item.get('id') != content_id]
                
            # Write back to the with_images file
            with open(with_images_file_path, 'w') as f:
                json.dump(with_images_items, f, indent=2)
                
            # Update in-memory with_images data
            if content_type == 'movie':
                app.movies_with_images = with_images_items
            else:
                app.tv_series_with_images = with_images_items
        except Exception as e:
            # Log but continue - this is not critical
            log_error(f"Warning: Error updating with_images data: {str(e)}")
        
        # Delete the actual image files
        images_deleted = 0
        for path in image_paths:
            try:
                file_path = os.path.join(current_app.root_path, 'cdn/posters_combined', path)
                if os.path.exists(file_path):
                    os.remove(file_path)
                    images_deleted += 1
            except Exception as e:
                log_warning(f"Warning: Could not delete image file {path}: {str(e)}")
                
        return jsonify({
            "message": f"{content_type.capitalize()} with ID {content_id} deleted successfully from CDN",
            "deleted": True,
            "images_deleted": images_deleted
        }), 200
    
    except Exception as e:
        error_msg = f"Error deleting CDN content: {str(e)}"
        log_error(error_msg)
        return jsonify({"message": error_msg, "error": str(e)}), 500