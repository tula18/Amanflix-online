import copy
import random
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path

from flask import Flask


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.utils import attach_watch_history, serialize_watch_history
from models import Episode, Season, TVShow, User, WatchHistory, db


MOVIE_IDS = [11, 12, 13, 14, 15]
DB_SHOW_IDS = [100, 200, 300]   # shows with seasons and episodes in the DB
CATALOG_SHOW_IDS = [900, 901]   # shows only in the JSON catalog, not in the DB


class AttachWatchHistoryTests(unittest.TestCase):
    """attach_watch_history (one query per content type) must return what per-card serialize_watch_history did."""

    def setUp(self):
        self.app = Flask(__name__)
        self.app.config['TESTING'] = True
        self.app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        self.app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
        db.init_app(self.app)
        self.ctx = self.app.app_context()
        self.ctx.push()
        db.create_all()
        self.seed()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.ctx.pop()

    def seed(self):
        rng = random.Random(7)
        video_id = 1
        self.episodes = {}  # show_id -> [(season, episode)]
        for show_id in DB_SHOW_IDS:
            db.session.add(TVShow(
                show_id=show_id, title=f'Show {show_id}', genres='Drama', created_by='', overview='',
                poster_path='', backdrop_path='', vote_average=8.0, tagline='', spoken_languages='en',
                first_air_date=None, last_air_date=None, production_companies='', production_countries='',
                networks='', status='Ended', seasons=[]))
            for season_number in (1, 2):
                season = Season(id=None, season_number=season_number, tvshow_id=show_id, episode=None)
                db.session.add(season)
                db.session.flush()
                for episode_number in (1, 2, 3):
                    episode = Episode(id=video_id, episode_number=episode_number, title=f'E{episode_number}',
                                      overview='', runtime=40, video_id=video_id)
                    episode.season_id = season.id
                    db.session.add(episode)
                    video_id += 1
                    self.episodes.setdefault(show_id, []).append((season_number, episode_number))

        base = datetime(2026, 9, 1)
        self.users = []
        for n in range(6):
            user = User(username=f'user{n}', password='x')
            db.session.add(user)
            db.session.flush()
            self.users.append(user)

            def add(ctype, cid, season=None, episode=None, completed=False, when=None):
                db.session.add(WatchHistory(
                    user_id=user.id, content_type=ctype, content_id=cid,
                    watch_timestamp=100, total_duration=1000,
                    progress_percentage=95.0 if completed else 10.0,
                    season_number=season, episode_number=episode, is_completed=completed,
                    last_watched=when or base + timedelta(hours=rng.randint(0, 500))))

            for movie_id in MOVIE_IDS:
                if rng.random() < 0.6:
                    add('movie', movie_id, completed=rng.random() < 0.4)
            add('movie', MOVIE_IDS[0], when=base)  # a duplicate row for one movie

            for show_id in DB_SHOW_IDS:
                mode = (n + show_id) % 3
                if mode == 0:
                    # finished the whole show, last episode watched last
                    for i, (s, e) in enumerate(self.episodes[show_id]):
                        add('tv', show_id, s, e, completed=True, when=base + timedelta(hours=i))
                elif mode == 1:
                    # finished the last episode but skipped some earlier ones
                    for s, e in self.episodes[show_id][::2]:
                        add('tv', show_id, s, e, completed=rng.random() < 0.7)
                    s, e = self.episodes[show_id][-1]
                    add('tv', show_id, s, e, completed=True, when=base + timedelta(days=60))
            for show_id in CATALOG_SHOW_IDS:
                if rng.random() < 0.5:
                    add('tv', show_id, 1, rng.randint(1, 5), completed=rng.random() < 0.5)
        db.session.commit()

    def items(self):
        movies = [{'id': i, 'title': f'Movie {i}', 'media_type': 'movie'} for i in MOVIE_IDS + [99]]
        shows = [{'id': i, 'name': f'Show {i}', 'media_type': 'tv'} for i in DB_SHOW_IDS + CATALOG_SHOW_IDS + [999]]
        return movies, shows

    def per_card(self, items, user, content_type, include_next_episode):
        result = []
        for item in items:
            watch_history = serialize_watch_history(content_id=item['id'], content_type=content_type,
                                                    current_user=user, include_next_episode=include_next_episode)
            result.append({**item, 'watch_history': watch_history} if watch_history else item)
        return result

    def test_matches_per_card_lookup(self):
        movies, shows = self.items()
        for user in self.users:
            for with_next in (False, True):
                self.assertEqual(attach_watch_history(movies, user, 'movie', include_next_episode=with_next),
                                 self.per_card(movies, user, 'movie', with_next))
                self.assertEqual(attach_watch_history(shows, user, 'tv', include_next_episode=with_next),
                                 self.per_card(shows, user, 'tv', with_next))

    def test_mixed_types_and_string_ids(self):
        movies, shows = self.items()
        mixed = movies + shows
        user = self.users[0]
        result = attach_watch_history(mixed, user, lambda i: i['media_type'],
                                      include_next_episode=lambda i: i['media_type'] == 'tv')
        expected = self.per_card(movies, user, 'movie', False) + self.per_card(shows, user, 'tv', True)
        self.assertEqual(result, expected)

        as_strings = [{**item, 'id': str(item['id'])} for item in movies]
        with_history = [item.get('watch_history') for item in attach_watch_history(as_strings, user, 'movie')]
        self.assertEqual(with_history, [item.get('watch_history') for item in expected[:len(movies)]])

    def test_finished_show_and_next_episode_are_present(self):
        _, shows = self.items()
        seen = {'finished': False, 'next': False}
        for user in self.users:
            for item in attach_watch_history(shows, user, 'tv', include_next_episode=True):
                history = item.get('watch_history') or {}
                seen['finished'] |= history.get('finished_show') is True
                seen['next'] |= 'next_episode' in history
        self.assertTrue(all(seen.values()), f'test data should cover these cases: {seen}')

    def test_shared_items_are_not_modified(self):
        movies, shows = self.items()
        before = copy.deepcopy(movies + shows)
        for user in self.users:
            attach_watch_history(movies, user, 'movie')
            attach_watch_history(shows, user, 'tv', include_next_episode=True)
        self.assertEqual(movies + shows, before)

    def test_one_watch_history_query_per_content_type(self):
        from sqlalchemy import event

        movies, shows = self.items()
        statements = []
        listener = lambda conn, cursor, statement, *args: statements.append(statement)
        event.listen(db.engine, 'before_cursor_execute', listener)
        try:
            attach_watch_history(movies + shows, self.users[1], lambda i: i['media_type'])
        finally:
            event.remove(db.engine, 'before_cursor_execute', listener)
        from_watch_history = [s for s in statements if 'FROM watch_history' in s]
        self.assertLessEqual(len(from_watch_history), 2)


if __name__ == '__main__':
    unittest.main()
