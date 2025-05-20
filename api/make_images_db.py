from cdn.utils import check_images_existence
import json
import os
from tqdm import tqdm

def load_only_images_data(file_path, media_type: str):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    print(f"Original {media_type} loaded with: {len(data)}")
    all_items = []
    for item in tqdm(data, desc=f"Loading {media_type}_with_images"):
        if check_images_existence(item):
            all_items.append(item)
    return all_items

def save_movies_db(db, data):
    db_path = os.path.join(db)
    print(f"Saving database: {db_path}")
    print(db_path)
    with open(db_path, 'w') as f:
        json.dump(data, f)

movies_with_images = load_only_images_data('cdn/files/movies_little_clean.json', 'movie')
print(f"Movies_with_images loaded with: {len(movies_with_images)}")

tv_series_with_images = load_only_images_data('cdn/files/tv_little_clean.json', 'tv')
print(f"TV_with_images loaded with: {len(tv_series_with_images)}")

save_movies_db("cdn/files/movies_with_images.json", movies_with_images)
save_movies_db("cdn/files/tv_with_images.json", tv_series_with_images)

print("Done.")