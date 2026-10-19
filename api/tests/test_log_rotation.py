import io
import logging
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest import mock


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from utils.logger import SafeRotatingFileHandler


def _record(message):
    return logging.LogRecord('test', logging.INFO, __file__, 0, message, None, None)


class SafeRotatingFileHandlerTest(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmpdir.name, 'api_requests.log')
        self.handler = SafeRotatingFileHandler(self.path, maxBytes=50, backupCount=3, encoding='utf-8')
        self.handler.setFormatter(logging.Formatter('%(message)s'))

    def tearDown(self):
        self.handler.close()
        self.tmpdir.cleanup()

    def _read(self, path=None):
        with open(path or self.path, encoding='utf-8') as f:
            return f.read()

    def test_rotates_normally(self):
        for i in range(10):
            self.handler.emit(_record(f'line {i:02d} padding padding'))
        self.assertTrue(os.path.exists(self.path + '.1'))

    def test_keeps_writing_when_file_is_locked(self):
        """WinError 32: another process holds the file, so the rename fails."""
        locked = PermissionError(32, 'The process cannot access the file because it is being used by another process')
        stderr = io.StringIO()
        with mock.patch.object(self.handler, 'rotate', side_effect=locked) as rotate, \
                mock.patch.object(self.handler, 'handleError') as handle_error, \
                redirect_stderr(stderr):
            for i in range(10):
                self.handler.emit(_record(f'line {i:02d} padding padding'))
            handle_error.assert_not_called()
            # One failed attempt, then it waits instead of retrying on every record
            self.assertEqual(rotate.call_count, 1)
        self.assertEqual(stderr.getvalue().count('Could not rotate'), 1)
        content = self._read()
        for i in range(10):
            self.assertIn(f'line {i:02d}', content)

    def test_retries_rotation_after_the_wait(self):
        with mock.patch.object(self.handler, 'rotate', side_effect=PermissionError(32, 'locked')), \
                redirect_stderr(io.StringIO()):
            for i in range(5):
                self.handler.emit(_record(f'line {i:02d} padding padding'))
        self.handler._next_rotate_attempt = 0.0  # the retry wait is over
        self.handler.emit(_record('after the lock is gone'))
        self.assertIn('line 00', self._read(self.path + '.1'))
        self.assertEqual(self._read(), 'after the lock is gone\n')


if __name__ == '__main__':
    unittest.main()
