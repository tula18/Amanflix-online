#!/usr/bin/env python3
"""
JSON to Formatted Text Converter

This script converts JSON files to formatted text files:
- formatted_txt: Flattened key-value pairs

Usage:
    python json_to_formatted_txt.py input.json [output_prefix]
"""

import json
import sys
import os
from tqdm import tqdm


def flatten_json(data, prefix='', flattened=None):
    """
    Recursively flatten a JSON structure into key-value pairs.
    
    Args:
        data: The JSON data to flatten
        prefix: The current key prefix
        flattened: The dictionary to store flattened data
    
    Returns:
        Dictionary with flattened key-value pairs
    """
    if flattened is None:
        flattened = {}

    if isinstance(data, dict):
        for key, value in data.items():
            flatten_json(value, prefix + key + '_', flattened)
    elif isinstance(data, list):
        if len(data) == 0:
            # Mark empty arrays with a special marker
            flattened[prefix[:-1] + '_EMPTY_ARRAY'] = "EMPTY_ARRAY"
        else:
            for index, item in enumerate(data):
                flatten_json(item, prefix + str(index) + '_', flattened)
    else:
        flattened[prefix[:-1]] = str(data)  # Ensure data is converted to string

    return flattened


def save_as_formatted_txt(data, output_path):
    """
    Save JSON data as formatted_txt (flattened key-value pairs).
    
    Args:
        data: JSON data to save
        output_path: Path to save the formatted_txt file
    """
    print(f"Converting to formatted_txt: {output_path}")
    
    flattened_data = flatten_json(data)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        for key, value in tqdm(flattened_data.items(), desc="Writing formatted_txt"):
            f.write(f"{key}:val: {value}\n")
    
    print(f"Successfully saved formatted_txt to: {output_path}")


def load_json_file(json_file_path):
    """
    Load JSON data from a file.
    
    Args:
        json_file_path: Path to the JSON file
    
    Returns:
        Loaded JSON data
    """
    print(f"Loading JSON file: {json_file_path}")
    
    try:
        with open(json_file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        print(f"Successfully loaded JSON file with {len(data) if isinstance(data, (list, dict)) else 1} items")
        return data
    except FileNotFoundError:
        print(f"Error: File '{json_file_path}' not found.")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON format in '{json_file_path}': {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error loading JSON file: {e}")
        sys.exit(1)


def main():
    """Main function to handle command line arguments and convert files."""
    if len(sys.argv) < 2:
        print("Usage: python json_to_formatted_txt.py <input.json> [output_prefix]")
        print("\nExample:")
        print("  python json_to_formatted_txt.py data.json")
        print("  python json_to_formatted_txt.py data.json my_output")
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    # Generate output prefix
    if len(sys.argv) >= 3:
        output_prefix = sys.argv[2]
    else:
        # Use input filename without extension as prefix
        output_prefix = os.path.splitext(os.path.basename(input_file))[0]
    
    # Generate output file paths
    formatted_txt_path = f"{output_prefix}_formatted.txt"
    
    # Load JSON data
    data = load_json_file(input_file)
    
    # Convert to formatted_txt
    print("\nStarting conversion...")
    save_as_formatted_txt(data, formatted_txt_path)
    
    print(f"\nConversion completed!")
    print(f"File created:")
    print(f"  - {formatted_txt_path}")


if __name__ == "__main__":
    main()
