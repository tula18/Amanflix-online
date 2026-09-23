"""Tests for corrupt-display-matrix detection and repair.

Fixtures are generated with ffmpeg rather than committed, so the suite skips
cleanly on a machine without it. The corrupt fixture is built by zeroing the
video track's `tkhd` matrix directly, which is exactly the on-disk shape of the
real defect (an all-zero matrix yields a `nan` rotation).
"""

import os
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api import media_health as mh


def _have(tool):
    return shutil.which(tool) is not None


def _make_sample(path, extra_args=None):
    """A short multi-stream mp4: 1 video + 2 audio, so stream loss is detectable."""
    cmd = [
        'ffmpeg', '-y', '-v', 'error',
        '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=2',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
        '-f', 'lavfi', '-i', 'sine=frequency=880:duration=2',
        '-map', '0:v', '-map', '1:a', '-map', '2:a',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
    ] + (extra_args or []) + [path]
    subprocess.run(cmd, check=True, capture_output=True)


def _corrupt_matrix(path):
    """Zero the video track's tkhd matrix, reproducing the real-world defect."""
    offsets = mh._tkhd_matrix_offsets(path)
    with open(path, 'r+b') as fh:
        fh.seek(offsets[0])
        fh.write(struct.pack('>9i', *([0] * 9)))


@unittest.skipUnless(_have('ffmpeg') and _have('ffprobe'), 'ffmpeg/ffprobe required')
class MediaHealthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.TemporaryDirectory()
        cls.good = os.path.join(cls.tmpdir.name, 'good.mp4')
        cls.rotated = os.path.join(cls.tmpdir.name, 'rotated.mp4')
        _make_sample(cls.good)
        _make_sample(cls.rotated)
        # A legitimate 90 degree rotation, which must never be treated as damage.
        subprocess.run(
            ['ffmpeg', '-y', '-v', 'error', '-display_rotation', '90',
             '-i', cls.good, '-map', '0', '-c', 'copy', cls.rotated],
            check=True, capture_output=True,
        )

    @classmethod
    def tearDownClass(cls):
        cls.tmpdir.cleanup()

    def _corrupt_copy(self, name='bad.mp4'):
        path = os.path.join(self.tmpdir.name, name)
        shutil.copy2(self.good, path)
        _corrupt_matrix(path)
        return path

    # -- detection --------------------------------------------------------

    def test_healthy_file_reports_no_matrix_issue(self):
        result = mh.analyze_file(self.good)
        self.assertNotIn(mh.ISSUE_CORRUPT_DISPLAY_MATRIX, result['issues'])

    def test_corrupt_matrix_is_detected(self):
        result = mh.analyze_file(self._corrupt_copy('detect.mp4'))
        self.assertIn(mh.ISSUE_CORRUPT_DISPLAY_MATRIX, result['issues'])
        self.assertEqual(result['severity'], 'error')

    def test_legitimate_rotation_is_not_flagged(self):
        """A real 90 degree rotation has a non-zero matrix and must be left alone."""
        probe = mh.probe_video(self.rotated)
        self.assertIn('rotation of 90', probe['stderr'].lower().replace('.00', ''))
        result = mh.analyze_file(self.rotated)
        self.assertNotIn(mh.ISSUE_CORRUPT_DISPLAY_MATRIX, result['issues'])

    def test_missing_file_is_unreadable(self):
        result = mh.analyze_file(os.path.join(self.tmpdir.name, 'nope.mp4'))
        self.assertIn(mh.ISSUE_UNREADABLE, result['issues'])

    def test_non_media_file_is_unreadable(self):
        junk = os.path.join(self.tmpdir.name, 'junk.mp4')
        with open(junk, 'wb') as fh:
            fh.write(b'not a video')
        self.assertIn(mh.ISSUE_UNREADABLE, mh.analyze_file(junk)['issues'])

    def test_display_matrix_parser_ignores_offset_labels(self):
        raw = '\n00000000:        65536           0           0\n' \
              '00000001:            0       65536           0\n' \
              '00000002:            0           0  1073741824\n'
        self.assertEqual(
            mh._parse_display_matrix(raw),
            (65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824),
        )

    # -- repair -----------------------------------------------------------

    def test_repair_clears_matrix_and_keeps_all_streams(self):
        path = self._corrupt_copy('repair.mp4')
        before = mh.analyze_file(path)

        result = mh.repair_file(path, 'test-repair')
        self.addCleanup(lambda: result.get('backup') and os.path.exists(result['backup'])
                        and os.remove(result['backup']))

        self.assertTrue(result['repaired'], result['reason'])
        after = mh.analyze_file(path)
        self.assertNotIn(mh.ISSUE_CORRUPT_DISPLAY_MATRIX, after['issues'])
        self.assertEqual(after['details']['stream_count'], before['details']['stream_count'])

    def test_repair_preserves_video_bitstream(self):
        """Repair must be a stream copy: the encoded video may not be re-encoded."""
        path = self._corrupt_copy('lossless.mp4')

        def video_md5(target):
            out = subprocess.run(
                ['ffmpeg', '-v', 'error', '-i', target, '-map', '0:v:0', '-c', 'copy', '-f', 'md5', '-'],
                capture_output=True, text=True, check=True,
            )
            return out.stdout.strip()

        original_md5 = video_md5(path)
        result = mh.repair_file(path, 'test-lossless')
        self.addCleanup(lambda: result.get('backup') and os.path.exists(result['backup'])
                        and os.remove(result['backup']))

        self.assertTrue(result['repaired'], result['reason'])
        self.assertEqual(video_md5(path), original_md5)

    def test_tkhd_patch_fallback_repairs_without_ffmpeg(self):
        """With every remux strategy unavailable, the byte patch must still fix it."""
        path = self._corrupt_copy('fallback.mp4')
        original = mh._remux_commands
        mh._remux_commands = lambda src, dst: []
        try:
            result = mh.repair_file(path, 'test-fallback')
        finally:
            mh._remux_commands = original
        self.addCleanup(lambda: result.get('backup') and os.path.exists(result['backup'])
                        and os.remove(result['backup']))

        self.assertTrue(result['repaired'], result['reason'])
        self.assertEqual(result['strategy'], 'tkhd_patch')
        self.assertNotIn(mh.ISSUE_CORRUPT_DISPLAY_MATRIX, mh.analyze_file(path)['issues'])

    def test_repair_is_a_noop_on_a_healthy_file(self):
        path = os.path.join(self.tmpdir.name, 'healthy.mp4')
        subprocess.run(
            ['ffmpeg', '-y', '-v', 'error', '-i', self.good, '-map', '0',
             '-c', 'copy', '-movflags', '+faststart', path],
            check=True, capture_output=True,
        )
        result = mh.repair_file(path, 'test-noop')
        self.assertFalse(result['repaired'])
        self.assertEqual(result['reason'], 'nothing to repair')

    # -- backups and restore ---------------------------------------------

    def test_backup_path_never_collides(self):
        """Stamps are second-resolution, so two backups in one second must not
        resolve to the same file - a collision would destroy an existing backup."""
        created = []
        try:
            for _ in range(3):
                path = mh.backup_path_for('collide-test')
                self.assertNotIn(path, created)
                open(path, 'wb').close()  # occupy it, as a real backup would
                created.append(path)
        finally:
            for path in created:
                os.path.exists(path) and os.remove(path)

    def test_restore_overwrites_the_live_file_and_keeps_the_backup(self):
        path = self._corrupt_copy('restore.mp4')
        repair = mh.repair_file(path, 'test-restore')
        self.addCleanup(lambda: repair.get('backup') and os.path.exists(repair['backup'])
                        and os.remove(repair['backup']))
        self.assertTrue(repair['repaired'], repair['reason'])
        self.assertNotIn(mh.ISSUE_CORRUPT_DISPLAY_MATRIX, mh.analyze_file(path)['issues'])

        backup_name = os.path.basename(repair['backup'])
        result = mh.restore_backup(backup_name, path, 'test-restore')

        self.assertTrue(result['restored'], result['reason'])
        # The pre-repair file is live again...
        self.assertIn(mh.ISSUE_CORRUPT_DISPLAY_MATRIX, mh.analyze_file(path)['issues'])
        # ...the backup is still there, so the restore can be repeated...
        self.assertTrue(os.path.exists(repair['backup']))
        # ...and no second backup was created for the discarded file.
        self.assertNotIn('new_backup', result)
        siblings = [n for n in os.listdir(mh.REPAIR_BACKUPS_DIR) if n.startswith('test-restore.')]
        self.assertEqual(len(siblings), 1, siblings)

    def test_restore_leaves_no_temp_file_behind(self):
        path = self._corrupt_copy('restore_tmp.mp4')
        repair = mh.repair_file(path, 'test-restore-tmp')
        self.addCleanup(lambda: repair.get('backup') and os.path.exists(repair['backup'])
                        and os.remove(repair['backup']))

        mh.restore_backup(os.path.basename(repair['backup']), path, 'test-restore-tmp')
        self.assertFalse(os.path.exists(f'{path}.restore.tmp.mp4'))

    def test_restore_rejects_paths_outside_the_backup_directory(self):
        for name in ['../../etc/passwd', '/etc/passwd', 'sub/dir.mp4', '', 'missing.mp4']:
            self.assertIsNone(mh.resolve_backup(name), name)

    def test_restore_refuses_an_unreadable_backup(self):
        """A damaged backup must never be swapped in over a working file."""
        junk = os.path.join(mh.REPAIR_BACKUPS_DIR, 'junk-test.99999999999999.mp4')
        os.makedirs(mh.REPAIR_BACKUPS_DIR, exist_ok=True)
        with open(junk, 'wb') as fh:
            fh.write(b'not a video')
        self.addCleanup(lambda: os.path.exists(junk) and os.remove(junk))

        live = os.path.join(self.tmpdir.name, 'live.mp4')
        shutil.copy2(self.good, live)

        result = mh.restore_backup(os.path.basename(junk), live, 'junk-test')
        self.assertFalse(result['restored'])
        self.assertIn('readable', result['reason'])
        # The working file is untouched.
        self.assertNotIn(mh.ISSUE_UNREADABLE, mh.analyze_file(live)['issues'])

    def test_verify_rejects_output_that_lost_streams(self):
        """The guard that catches a remux missing -map 0."""
        path = self._corrupt_copy('lossy.mp4')
        before = mh.analyze_file(path)
        stripped = os.path.join(self.tmpdir.name, 'stripped.mp4')
        # Matrix cleared, but no -map 0: default selection keeps only one audio
        # track. Isolates the stream-count guard from the matrix check.
        subprocess.run(
            ['ffmpeg', '-y', '-v', 'error', '-display_rotation', '0',
             '-i', path, '-c', 'copy', stripped],
            check=True, capture_output=True,
        )
        ok, reason = mh._verify_repair(before, stripped)
        self.assertFalse(ok)
        self.assertIn('stream count', reason)


if __name__ == '__main__':
    unittest.main()
