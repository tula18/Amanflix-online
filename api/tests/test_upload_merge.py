import io
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from flask import Flask


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.cache import admin_cache, blacklist_cache, shows_cache
from api.routes import upload as upload_route
from api.routes.upload import upload_bp
from api.utils import generate_admin_token
from models import Admin, Episode, Season, TVShow, db


class UploadMergeEndpointTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.original_uploads_dir = upload_route.UPLOADS_DIR
        self.original_duration = upload_route.get_video_duration_in_minutes
        upload_route.UPLOADS_DIR = self.tmpdir.name
        upload_route.get_video_duration_in_minutes = lambda path: 42

        admin_cache.clear()
        blacklist_cache.clear()
        shows_cache.clear()

        self.app = Flask(__name__)
        self.app.config['TESTING'] = True
        self.app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        self.app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
        db.init_app(self.app)
        self.app.register_blueprint(upload_bp)

        with self.app.app_context():
            db.create_all()
            admin = Admin(
                username='mod',
                email='mod@example.com',
                password='unused',
                role='moderator'
            )
            db.session.add(admin)
            db.session.commit()
            self.token = generate_admin_token(admin.id, admin.role)

        self.client = self.app.test_client()

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

        upload_route.UPLOADS_DIR = self.original_uploads_dir
        upload_route.get_video_duration_in_minutes = self.original_duration
        self.tmpdir.cleanup()
        admin_cache.clear()
        blacklist_cache.clear()
        shows_cache.clear()

    @property
    def headers(self):
        return {'Authorization': f'Bearer {self.token}'}

    def create_show(self, show_id=100):
        show = TVShow(
            show_id=show_id,
            title='Existing Show',
            genres='Drama',
            created_by='',
            overview='Existing overview',
            poster_path='',
            backdrop_path='',
            vote_average=8.0,
            tagline='',
            spoken_languages='en',
            first_air_date=datetime(2020, 1, 1),
            last_air_date=datetime(2020, 1, 1),
            production_companies='',
            production_countries='',
            networks='',
            status='Returning Series',
            seasons=[]
        )
        db.session.add(show)
        db.session.commit()
        return show

    def create_episode(self, show_id=100, season_number=1, episode_number=1, with_file=False, content=b'old-video'):
        season = Season.query.filter_by(tvshow_id=show_id, season_number=season_number).first()
        if not season:
            season = Season(
                id=int(f'{show_id}{season_number:02d}'),
                season_number=season_number,
                tvshow_id=show_id,
                episode=[]
            )
            db.session.add(season)
            db.session.flush()

        video_id = upload_route.get_episode_video_id(show_id, season_number, episode_number)
        episode = Episode(
            id=video_id,
            episode_number=episode_number,
            title=f'Episode {episode_number}',
            overview='',
            has_subtitles=False,
            video_id=video_id,
            runtime=20
        )
        episode.season_id = season.id
        db.session.add(episode)
        db.session.commit()

        if with_file:
            with open(os.path.join(self.tmpdir.name, f'{video_id}.mp4'), 'wb') as handle:
                handle.write(content)

        return episode

    def patch_merge(self, show_id, seasons, files=None):
        data = {'seasons': json.dumps(seasons)}
        for field, payload in (files or {}).items():
            data[field] = (io.BytesIO(payload), f'{field}.mp4')

        return self.client.patch(
            f'/api/upload/show/{show_id}/episodes',
            data=data,
            headers=self.headers,
            content_type='multipart/form-data'
        )

    def test_add_episode_preserves_existing_episode(self):
        with self.app.app_context():
            self.create_show()
            self.create_episode(episode_number=1, with_file=True)

        response = self.patch_merge(
            100,
            [{'season_number': 1, 'episodes': [{'episode_number': 2, 'title': 'Second'}]}],
            {'video_season_1_episode_2': b'new-video'}
        )

        self.assertEqual(response.status_code, 200, response.get_json())
        with self.app.app_context():
            season = Season.query.filter_by(tvshow_id=100, season_number=1).first()
            self.assertIsNotNone(Episode.query.filter_by(season_id=season.id, episode_number=1).first())
            self.assertIsNotNone(Episode.query.filter_by(season_id=season.id, episode_number=2).first())
            self.assertTrue(os.path.exists(os.path.join(self.tmpdir.name, '10001002.mp4')))

    def test_add_new_season_to_existing_show(self):
        with self.app.app_context():
            self.create_show()
            self.create_episode(episode_number=1, with_file=True)

        response = self.patch_merge(
            100,
            [{'season_number': 2, 'episodes': [{'episode_number': 1, 'title': 'Season Two'}]}],
            {'video_season_2_episode_1': b'season-two'}
        )

        self.assertEqual(response.status_code, 200, response.get_json())
        payload = response.get_json()['result']
        self.assertEqual(payload['created_seasons'], [2])
        with self.app.app_context():
            self.assertIsNotNone(Season.query.filter_by(tvshow_id=100, season_number=2).first())
            self.assertTrue(os.path.exists(os.path.join(self.tmpdir.name, '10002001.mp4')))

    def test_fill_existing_episode_with_missing_video(self):
        with self.app.app_context():
            self.create_show()
            self.create_episode(episode_number=1, with_file=False)

        response = self.patch_merge(
            100,
            [{'season_number': 1, 'episodes': [{'episode_number': 1, 'title': 'Filled'}]}],
            {'video_season_1_episode_1': b'filled-video'}
        )

        self.assertEqual(response.status_code, 200, response.get_json())
        payload = response.get_json()['result']
        self.assertEqual(len(payload['filled_missing']), 1)
        self.assertTrue(os.path.exists(os.path.join(self.tmpdir.name, '10001001.mp4')))

    def test_existing_episode_is_skipped_without_force(self):
        with self.app.app_context():
            self.create_show()
            self.create_episode(episode_number=1, with_file=True, content=b'original-video')

        response = self.patch_merge(
            100,
            [{'season_number': 1, 'episodes': [{'episode_number': 1, 'title': 'Should Skip'}]}],
            {'video_season_1_episode_1': b'replacement-video'}
        )

        self.assertEqual(response.status_code, 200, response.get_json())
        payload = response.get_json()['result']
        self.assertEqual(len(payload['skipped_existing']), 1)
        with open(os.path.join(self.tmpdir.name, '10001001.mp4'), 'rb') as handle:
            self.assertEqual(handle.read(), b'original-video')

    def test_existing_episode_is_overwritten_with_force(self):
        with self.app.app_context():
            self.create_show()
            self.create_episode(episode_number=1, with_file=True, content=b'original-video')

        response = self.patch_merge(
            100,
            [{'season_number': 1, 'episodes': [{'episode_number': 1, 'title': 'Overwrite', 'force': True}]}],
            {'video_season_1_episode_1': b'replacement-video'}
        )

        self.assertEqual(response.status_code, 200, response.get_json())
        payload = response.get_json()['result']
        self.assertEqual(len(payload['overwritten']), 1)
        with open(os.path.join(self.tmpdir.name, '10001001.mp4'), 'rb') as handle:
            self.assertEqual(handle.read(), b'replacement-video')

    def test_validate_auto_mode_allows_existing_show_merge(self):
        with self.app.app_context():
            self.create_show()
            self.create_episode(episode_number=1, with_file=True)

        response = self.client.post(
            '/api/upload/validate',
            data=json.dumps({
                'content_type': 'tv',
                'content_id': 100,
                'validation_type': 'review',
                'mode': 'auto',
                'episodes': [
                    {'season_number': 1, 'episode_number': 1},
                    {'season_number': 1, 'episode_number': 2}
                ],
                'content_data': {
                    'id': 100,
                    'name': 'Existing Show',
                    'overview': 'Existing overview',
                    'first_air_date': '2020-01-01',
                    'last_air_date': '2020-01-01',
                    'vote_average': 8,
                    'genres': 'Drama'
                }
            }),
            headers={**self.headers, 'Content-Type': 'application/json'}
        )

        self.assertEqual(response.status_code, 200, response.get_json())
        payload = response.get_json()
        self.assertTrue(payload['can_upload'])
        self.assertEqual(payload['mode'], 'merge')
        self.assertEqual(payload['merge_summary']['skipped_existing'], 1)
        self.assertEqual(payload['merge_summary']['new_episode'], 1)
        self.assertFalse(any(error['type'] == 'duplicate_database' for error in payload['errors']))


if __name__ == '__main__':
    unittest.main()
