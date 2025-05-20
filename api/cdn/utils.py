import os

def paginate(data, page, per_page):
    start = (page - 1) * per_page
    end = start + per_page
    return data[start:end]


def calculate_similarity(item1, item2):
    def get_genres_sim(item):
        genres = item.get('genres', '')
        if isinstance(genres, str):
            return set(genres.lower().split(','))
        elif isinstance(genres, list):
            return set(g['name'].lower() for g in genres if isinstance(g, dict) and 'name' in g)
        return set()

    genres1 = get_genres_sim(item1)
    genres2 = get_genres_sim(item2)

    genre_similarity = len(genres1.intersection(genres2))
    language_similarity = item1.get('original_language') == item2.get('original_language')
    return genre_similarity + (1 if language_similarity else 0)


def filter_valid_genres(item, genres):
    genres = [g.strip().lower() for g in genres.split(',')]
    item_genres = item.get('genres', '')
    if isinstance(item_genres, str):
        item_genres_list = [g.strip().lower() for g in item_genres.split(',')]
        return all(g in item_genres_list for g in genres)
    elif isinstance(item_genres, list):
        return any(isinstance(g, dict) and any(genre.lower() in g.get('name', '').lower() for genre in genres) for g in item_genres)
    return False


def check_images_existence(item):
    if isinstance(item, tuple):
        item, _ = item
    poster_path = item.get('poster_path', '')
    backdrop_path = item.get('backdrop_path', '')

    if type(poster_path) == str:
        poster_path = poster_path.replace("/", "")
    if type(backdrop_path) == str:
        backdrop_path = backdrop_path.replace("/", "")

    if all(path is not None for path in [poster_path, backdrop_path]):
        # if os.path.exists(os.path.join('cdn/posters_combined', poster_path)) and os.path.exists(os.path.join('cdn/posters_combined', backdrop_path)):
        if os.path.exists(os.path.join('cdn/posters_combined', backdrop_path)):
            return True
    return False

