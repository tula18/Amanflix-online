import os
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

from flask import Flask


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api import progress_buffer
from api.cache import blacklist_cache, user_cache
from api.db_utils import safe_commit
from api.routes.watch_history import watch_history_bp
from api.utils import generate_token
from models import User, WatchHistory, db


class DatabaseTestCase(unittest.TestCase):
    """A file database (not :memory:) so a second connection can hold a lock on it."""

    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmpdir.name, 'test.db')
        self.app = Flask(__name__)
        self.app.config['TESTING'] = True
        self.app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{self.db_path}'
        self.app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {'connect_args': {'timeout': 0.2}}
        self.app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
        db.init_app(self.app)
        self.app.register_blueprint(watch_history_bp)
        user_cache.clear()
        blacklist_cache.clear()
        with self.app.app_context():
            db.create_all()
            user = User(username='viewer', password='x')
            db.session.add(user)
            db.session.commit()
            self.user_id = user.id
            self.token = generate_token(user.id)

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.engine.dispose()
        user_cache.clear()
        blacklist_cache.clear()
        self.tmpdir.cleanup()

    def hold_write_lock(self, seconds):
        """Lock the database from another connection, like a concurrent writer on the NAS."""
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.execute('BEGIN EXCLUSIVE')

        def release():
            time.sleep(seconds)
            conn.rollback()
            conn.close()

        thread = threading.Thread(target=release)
        thread.start()
        return thread

    def rows(self):
        conn = sqlite3.connect(self.db_path)
        try:
            return conn.execute('SELECT content_id, watch_timestamp, is_completed FROM watch_history '
                                'ORDER BY id').fetchall()
        finally:
            conn.close()


class SafeCommitTests(DatabaseTestCase):
    def add_row(self):
        db.session.add(WatchHistory(user_id=self.user_id, content_type='movie', content_id=1,
                                    watch_timestamp=5, total_duration=100))

    def test_lock_is_retried_when_changes_can_be_reapplied(self):
        with self.app.app_context():
            self.add_row()
            releaser = self.hold_write_lock(0.3)
            self.assertTrue(safe_commit(apply=self.add_row))
            releaser.join()
        self.assertEqual(self.rows(), [(1, 5, 0)])

    def test_lock_without_reapply_reports_failure_and_saves_nothing(self):
        with self.app.app_context():
            self.add_row()
            releaser = self.hold_write_lock(0.5)
            self.assertFalse(safe_commit())
            releaser.join()
        self.assertEqual(self.rows(), [])


class ProgressBufferTests(DatabaseTestCase):
    def setUp(self):
        super().setUp()
        self.original_flush_seconds = progress_buffer.FLUSH_SECONDS
        progress_buffer.FLUSH_SECONDS = 3600  # tests flush explicitly
        progress_buffer._pending.clear()
        progress_buffer.init_app(self.app)
        self.client = self.app.test_client()

    def tearDown(self):
        progress_buffer._pending.clear()
        progress_buffer.FLUSH_SECONDS = self.original_flush_seconds
        super().tearDown()

    def save(self, content_id, position, final=False, duration=1000):
        body = {'content_type': 'movie', 'content_id': content_id,
                'watch_timestamp': position, 'total_duration': duration}
        if final:
            body['final'] = True
        response = self.client.post('/api/watch-history/update', json=body,
                                    headers={'Authorization': f'Bearer {self.token}'})
        self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
        return response.get_json()

    def test_new_row_is_written_immediately(self):
        self.save(7, 100)
        self.assertEqual(self.rows(), [(7, 100, 0)])

    def test_position_updates_are_batched_and_visible_before_flush(self):
        self.save(7, 100)
        response = self.save(7, 200)
        self.assertEqual(response['watch_timestamp'], 200)
        self.save(7, 300)
        self.assertEqual(self.rows(), [(7, 100, 0)])  # not written yet

        with self.app.app_context():
            row = WatchHistory.query.filter_by(user_id=self.user_id, content_id=7).first()
            self.assertEqual(row.watch_timestamp, 300)  # reads see the pending save

        self.assertTrue(progress_buffer.flush())
        self.assertEqual(self.rows(), [(7, 300, 0)])

    def test_many_rows_are_written_in_one_transaction(self):
        for content_id in range(1, 6):
            self.save(content_id, 100)
        for content_id in range(1, 6):
            self.save(content_id, 250)

        from sqlalchemy import event
        commits = []
        on_commit = lambda conn: commits.append(1)
        with self.app.app_context():
            event.listen(db.engine, 'commit', on_commit)
            try:
                self.assertTrue(progress_buffer.flush())
            finally:
                event.remove(db.engine, 'commit', on_commit)
        self.assertEqual(len(commits), 1)
        self.assertEqual([r[1] for r in self.rows()], [250] * 5)

    def test_completion_and_final_save_are_written_immediately(self):
        self.save(7, 100)
        self.save(8, 100)
        self.save(8, 150)             # pending
        self.save(7, 950)             # completes the title: written now, with everything pending
        self.assertEqual(self.rows(), [(7, 950, 1), (8, 150, 0)])

        self.save(8, 400, final=True)
        self.assertEqual(self.rows(), [(7, 950, 1), (8, 400, 0)])

    def test_failed_flush_keeps_saves_for_the_next_attempt(self):
        self.save(7, 100)
        self.save(7, 200)
        with self.app.app_context():
            releaser = self.hold_write_lock(1.5)
            self.assertFalse(progress_buffer.flush())
            releaser.join()
            self.assertIsNotNone(progress_buffer.pending_for(
                WatchHistory.query.filter_by(content_id=7).first().id))
            self.assertTrue(progress_buffer.flush())
        self.assertEqual(self.rows(), [(7, 200, 0)])

    def test_update_of_deleted_row_does_not_touch_a_new_row_with_its_id(self):
        self.save(7, 100)
        self.save(7, 200)  # pending for row 1
        conn = sqlite3.connect(self.db_path)
        conn.execute('DELETE FROM watch_history')
        # a different title reuses id 1
        conn.execute("INSERT INTO watch_history (id, user_id, content_type, content_id, watch_timestamp, "
                     "total_duration, progress_percentage, is_completed) VALUES (1, ?, 'movie', 9, 5, 100, 5, 0)",
                     (self.user_id,))
        conn.commit()
        conn.close()
        with self.app.app_context():
            self.assertTrue(progress_buffer.flush())
        self.assertEqual(self.rows(), [(9, 5, 0)])


if __name__ == '__main__':
    unittest.main()
