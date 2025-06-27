import hashlib
import pyqrcode
import os
# import cv2
import numpy as np
import base64

def read_files_as_hex(file_path):
    print(f"Reading file: {file_path}")
    with open(file_path, 'rb') as file:
        file_bytes = file.read()
    base64_string = base64.b85encode(file_bytes).decode('utf-8')
    checksum = hashlib.md5(file_bytes).hexdigest()
    print(f"File read successfully. Base64 len: {len(base64_string)} chars. Checksum: {checksum}")
    with open('output.txt', 'w') as f:
        f.write(base64_string)
    return base64_string, checksum

def split_hex_string(hex_string, start_chunk_size=2048):
    print(f"Splitting hex string into chunks of {start_chunk_size} chars...")
    hex_len = len(hex_string)
    current_chunk = 0
    chunks = []

    while current_chunk < hex_len:
        print(current_chunk)
        metadata = f"chunk_{len(chunks)}:?:"
        chunk_size = start_chunk_size - len(metadata)
        current_chunk += chunk_size
        chunk = metadata+hex_string[current_chunk - chunk_size:current_chunk]
        chunks.append(chunk)
        print(f"\rProcessing chunk {len(chunks)}, Starting: {chunk[:10]}... len: {len(chunk)} chunk len: {chunk_size}")

    print(f"\nTotal chunks created: {len(chunks)}")
    return chunks

def create_qr_codes(hex_chunks, output_dir, error_cor='L'):
    print(f"Generating QR codes and saving to Dir: {output_dir}")
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"Directory {output_dir} created.")

    for index, chunk in enumerate(hex_chunks):
        print(f"Chunk {index + 1}/{len(hex_chunks)}: Start: {chunk.split(':?:')[1][:10]}... {chunk[-10:]}")
        qr = pyqrcode.create(chunk, error=error_cor)
        qr_file_path = os.path.join(output_dir, f"qr_{index:04d}.png")
        qr.png(qr_file_path, scale=10)

# def create_video_from_qr_images(output_dir,video_file):
#     print(f"Creating video from Qr CODES images in {output_dir}...")
#     images = sorted([img for img in os.listdir(output_dir) if img.endswith('.png')])
#     fps = 1
#     size = (1920, 1920)
#     video_writer = cv2.VideoWriter(video_file, cv2.VideoWriter_fourcc(*'mp4v'), fps, size)

#     for index, image_file in enumerate(images):
#         img_path = os.path.join(output_dir, image_file)
#         img = cv2.imread(img_path)
#         img = cv2.resize(img, size)
#         video_writer.write(img)
#         print(f"Frame {index + 1}/{len(images)} added to video.")
#     video_writer.release()
#     print(f"Video saved as {video_file}")

def verify_checksum(chunks, original_checksum):
    chunks_full = ''
    for chunk in chunks:
        data_sep = chunk.split(":?:")
        chunks_full += data_sep[1]
    decoded_bytes = base64.b64decode(chunks_full.encode('utf-8'))
    checksum = hashlib.md5(decoded_bytes).hexdigest()
    if original_checksum == checksum:
        print("Checksum verified. Video creation complete.")
    else:
        print("Checksum mismatch! Data might be corrupted.")

def main(chunk_size=2950, error_cor="L"):
    file_path = "amanflix_1.1_update.7z"
    output_dir = "amanflix_1.1_update-qr"
    video_file = "output_update.mp4"

    if error_cor not in ['L', 'M', 'Q', 'H']:
        raise Exception("Invalid error correction")
    hex_string, checksum = read_files_as_hex(file_path)
    hex_chunks = split_hex_string(hex_string, chunk_size)
    create_qr_codes(hex_chunks, output_dir, error_cor)
    # create_video_from_qr_images(output_dir, video_file)
    verify_checksum(hex_chunks, checksum)
    print("Video creation complete.")

if __name__ == "__main__":
    main()
