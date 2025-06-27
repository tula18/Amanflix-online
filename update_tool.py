import os
import json
import filecmp
import shutil
import argparse
from tqdm import tqdm
import hashlib

def load_folder_ignore(folder_path):
    folder_ignore_file = os.path.join(folder_path, '.folderignore')
    if os.path.exists(folder_ignore_file):
        with open(folder_ignore_file, 'r') as f:
            return f.readlines()
    return []

def should_ignore_file(file_path, folder_ignore):
    file_name = os.path.basename(file_path)
    for pattern in folder_ignore:
        pattern = pattern.strip()
        if file_name.endswith(pattern):
            return True
    return False

def calculate_folder_hash(folder_path):
    hash = hashlib.sha256()
    for root, dirs, files in sorted(os.walk(folder_path)):
        for file in sorted(files):
            file_path = os.path.join(root, file)
            with open(file_path, 'rb') as f:
                file_content = f.read()
                hash.update(file_content)
    return hash.hexdigest()

def create_update_package(folder1, folder2, output_folder, verbose, exclude_ignored, max_file_size):
    print(f"Creating update package from {folder1} to {folder2}...")
    changes = {'added': [], 'removed': [], 'modified': []}

    folder_ignore1 = load_folder_ignore(folder1)
    folder_ignore2 = load_folder_ignore(folder2)

    total_files = 0
    for root, dirs, files in os.walk(folder1):
        total_files += len(files)
    for root, dirs, files in os.walk(folder2):
        total_files += len(files)

    print(f"Total files to process: {total_files}")
    with tqdm(total=total_files, desc="Comparing files") as pbar:
        # Walk through the first folder
        for root, dirs, files in os.walk(folder1):
            for file in files:
                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, folder1)
                file_path2 = os.path.join(folder2, relative_path)

                if should_ignore_file(file_path, folder_ignore1):
                    if verbose:
                        print(f"Ignoring file {file_path}")
                    pbar.update(1)
                    continue

                if not os.path.exists(file_path2):
                    changes['removed'].append(relative_path)
                    if verbose:
                        print(f"File {file_path} removed in {folder2}")
                elif not filecmp.cmp(file_path, file_path2, shallow=False):
                    changes['modified'].append(relative_path)
                    if verbose:
                        print(f"File {file_path} modified in {folder2}")

                pbar.update(1)

        # Walk through the second folder
        for root, dirs, files in os.walk(folder2):
            for file in files:
                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, folder2)
                file_path1 = os.path.join(folder1, relative_path)

                if should_ignore_file(file_path, folder_ignore2):
                    if verbose:
                        print(f"Ignoring file {file_path}")
                    pbar.update(1)
                    continue

                if not os.path.exists(file_path1):
                    changes['added'].append(relative_path)
                    if verbose:
                        print(f"File {file_path} added in {folder2}")

                pbar.update(1)

    # Filter out ignored files
    if exclude_ignored:
        print("Excluding ignored files")
        folder_ignore = load_folder_ignore(folder2)
        changes = {k: [f for f in v if not should_ignore_file(os.path.join(folder2, f), folder_ignore)] for k, v in changes.items()}

    # Filter out files larger than the maximum size
    if max_file_size:
        print(f"Only including files smaller than {max_file_size} bytes")
        changes = {k: [f for f in v if os.path.getsize(os.path.join(folder2, f)) < max_file_size] for k, v in changes.items()}

    # Create output folder if it doesn't exist
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)
        print(f"Output folder {output_folder} created")

    # Calculate the hash of the new version folder
    folder_hash = calculate_folder_hash(folder2)

    if verbose:
        print(f"Folder hash: {folder_hash}")

    # Create a JSON file with the changes
    changes_file = os.path.join(output_folder, 'changes.json')
    with open(changes_file, 'w') as f:
        json.dump({
            'changes': changes,
            'folder_hash': folder_hash
        }, f, indent=4)
    print(f"Update package created in {output_folder}")

    # Copy changed files to the output folder
    for change_type in ['added', 'modified']:
        for file in changes[change_type]:
            src_path = os.path.join(folder2, file)
            dst_path = os.path.join(output_folder, file)
            os.makedirs(os.path.dirname(dst_path), exist_ok=True)
            shutil.copy2(src_path, dst_path)
            if verbose:
                print(f"File {src_path} copied to {dst_path}")

    print(f"Update package creation complete")

def apply_update_package(base_folder, update_package_path, output_folder, verbose):
    print(f"Applying update package from {update_package_path} to {base_folder}...")
    update_package = load_update_package(update_package_path)

    # Create output folder if it doesn't exist
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)
        print(f"Output folder {output_folder} created")

    # Copy the base folder to the output folder
    for root, dirs, files in os.walk(base_folder):
        for file in files:
            file_path = os.path.join(root, file)
            relative_path = os.path.relpath(file_path, base_folder)
            dst_path = os.path.join(output_folder, relative_path)
            os.makedirs(os.path.dirname(dst_path), exist_ok=True)
            shutil.copy2(file_path, dst_path)
            if verbose:
                print(f"File {file_path} copied to {dst_path}")

    # Apply the changes from the update package
    for change_type in ['added', 'modified']:
        for file in update_package['changes'][change_type]:
            src_path = os.path.join(update_package_path, file)
            dst_path = os.path.join(output_folder, file)
            os.makedirs(os.path.dirname(dst_path), exist_ok=True)
            shutil.copy2(src_path, dst_path)
            if verbose:
                print(f"File {src_path} copied to {dst_path}")

    for file in update_package['changes']['removed']:
        dst_path = os.path.join(output_folder, file)
        os.remove(dst_path)
        if verbose:
            print(f"File {dst_path} removed")

    print(f"Update package application complete")

    # Calculate the hash of the updated folder
    folder_hash = calculate_folder_hash(output_folder)

    if update_package['folder_hash'] != folder_hash:
        print(f"Error: The update package was not applied successfully. Hash mismatch.")
    else:
        print(f"The update package was applied successfully. Hash: {folder_hash}")

def load_update_package(update_package_path):
    with open(os.path.join(update_package_path, 'changes.json'), 'r') as f:
        return json.load(f)

def main():
    parser = argparse.ArgumentParser(description="Update package creation and application tool")
    subparsers = parser.add_subparsers(dest='command')

    create_parser = subparsers.add_parser('create', help='Create an update package')
    create_parser.add_argument("-v1", "--version1", help="Path to the first folder (base version)", required=True)
    create_parser.add_argument("-v2", "--version2", help="Path to the second folder (updated version)", required=True)
    create_parser.add_argument("-o", "--output", help="Path to the output folder (update package)", required=True)
    create_parser.add_argument("-v", "--verbose", help="Enable verbose mode", action="store_true")
    create_parser.add_argument("-e", "--exclude-ignored", help="Exclude ignored files", action="store_true")
    create_parser.add_argument("-m", "--max-file-size", help="Only include files smaller than this size", type=int)

    apply_parser = subparsers.add_parser('apply', help='Apply an update package')
    apply_parser.add_argument("-b", "--base", help="Path to the base folder", required=True)
    apply_parser.add_argument("-u", "--update", help="Path to the update package folder", required=True)
    apply_parser.add_argument("-o", "--output", help="Path to the output folder", required=True)
    apply_parser.add_argument("-v", "--verbose", help="Enable verbose mode", action="store_true")

    args = parser.parse_args()

    if args.command == 'create':
        create_update_package(args.version1, args.version2, args.output, args.verbose, args.exclude_ignored, args.max_file_size)
    elif args.command == 'apply':
        apply_update_package(args.base, args.update, args.output, args.verbose)

if __name__ == "__main__":
    main()