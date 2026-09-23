#!/usr/bin/env python3
"""Create and inspect deliberately broken videos, for testing Media Health.

The defect this reproduces is an all-zero display matrix in the video track's
`tkhd` box, which makes the derived rotation `nan`. Chrome 143+ rejects the
video track outright: audio plays, the picture stays black, and no MediaError is
raised. That is the exact on-disk shape of the real-world defect, so a file
broken here exercises the whole pipeline.

Usage, from the api/ directory:

    python tools/media_test.py status  <video_id>
    python tools/media_test.py corrupt <video_id>      # backs up first
    python tools/media_test.py restore <video_id>      # newest backup
    python tools/media_test.py sample  <output.mp4>    # standalone broken file

`corrupt` always backs the original up into the repair-backups directory first,
so anything it touches can be put back from the Media Health page or with
`restore`. It refuses to run on a file that is already broken.
"""

import argparse
import os
import struct
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.media_health import (  # noqa: E402
    ISSUE_CORRUPT_DISPLAY_MATRIX,
    analyze_file,
    backup_path_for,
    list_backups,
    restore_backup,
    _tkhd_matrix_offsets,
)
from paths import REPAIR_BACKUPS_DIR, UPLOADS_DIR  # noqa: E402

ZERO_MATRIX = struct.pack('>9i', *([0] * 9))


def video_path(video_id):
    return os.path.join(UPLOADS_DIR, f'{video_id}.mp4')


def zero_display_matrix(path):
    """Zero the video track's transformation matrix, in place."""
    offsets = _tkhd_matrix_offsets(path)
    if not offsets:
        raise ValueError('no tkhd box found - is this really an MP4?')
    with open(path, 'r+b') as fh:
        fh.seek(offsets[0])  # first track is the video track
        fh.write(ZERO_MATRIX)


def describe(path):
    if not os.path.exists(path):
        return 'missing'
    result = analyze_file(path)
    return ', '.join(result['issues']) if result['issues'] else 'ok'


def cmd_status(args):
    path = video_path(args.video_id)
    print(f'file   : {path}')
    print(f'status : {describe(path)}')

    backups = [b for b in list_backups() if b['video_id'] == str(args.video_id)]
    print(f'backups: {len(backups)}')
    for backup in backups:
        print(f'         {backup["name"]}  ({backup["size"]:,} bytes)  {backup["modified"]}')
    return 0


def cmd_corrupt(args):
    path = video_path(args.video_id)
    if not os.path.exists(path):
        print(f'No such file: {path}', file=sys.stderr)
        return 1

    before = analyze_file(path)
    if ISSUE_CORRUPT_DISPLAY_MATRIX in before['issues']:
        print('Already has a corrupt display matrix - nothing to do.')
        return 0

    backup = backup_path_for(args.video_id)
    with open(path, 'rb') as src, open(backup, 'wb') as dst:
        while chunk := src.read(4 * 1024 * 1024):
            dst.write(chunk)

    try:
        zero_display_matrix(path)
    except Exception as e:
        os.replace(backup, path)  # put the original straight back
        print(f'Failed to corrupt the file, original restored: {e}', file=sys.stderr)
        return 1

    after = analyze_file(path)
    if ISSUE_CORRUPT_DISPLAY_MATRIX not in after['issues']:
        os.replace(backup, path)
        print('The detector does not see the damage; original restored.', file=sys.stderr)
        return 1

    print(f'Corrupted : {path}')
    print(f'Backup    : {os.path.basename(backup)}')
    print(f'Detected  : {", ".join(after["issues"])}')
    print()
    print('Play this title in Chrome 143+ and you should get a black screen with')
    print('working audio. Undo with the Restore button on the Media Health page,')
    print(f'or: python tools/media_test.py restore {args.video_id}')
    return 0


def cmd_restore(args):
    backups = [b for b in list_backups() if b['video_id'] == str(args.video_id)]
    if not backups:
        print(f'No backups for video {args.video_id} in {REPAIR_BACKUPS_DIR}', file=sys.stderr)
        return 1

    newest = backups[0]  # list_backups() is newest first
    result = restore_backup(newest['name'], video_path(args.video_id), str(args.video_id))
    if not result['restored']:
        print(f'Restore failed: {result["reason"]}', file=sys.stderr)
        return 1

    print(f'Restored {newest["name"]} over video {args.video_id}')
    print(f'Status   : {describe(video_path(args.video_id))}')
    return 0


def cmd_sample(args):
    """A small standalone broken mp4, for testing uploads without real content."""
    subprocess.run(
        [
            'ffmpeg', '-y', '-v', 'error',
            '-f', 'lavfi', '-i', f'testsrc=size=640x360:rate=25:duration={args.duration}',
            '-f', 'lavfi', '-i', f'sine=frequency=440:duration={args.duration}',
            '-map', '0:v', '-map', '1:a',
            '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            args.output,
        ],
        check=True, capture_output=True,
    )
    zero_display_matrix(args.output)

    print(f'Wrote    : {args.output} ({os.path.getsize(args.output):,} bytes)')
    print(f'Detected : {describe(args.output)}')
    print()
    print('Upload this through Admin > Upload Movie to test the on-upload auto-fix,')
    print('or copy it into the uploads folder as an existing video_id.')
    return 0


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest='command', required=True)

    p = sub.add_parser('status', help='show the health of one stored video')
    p.add_argument('video_id')
    p.set_defaults(func=cmd_status)

    p = sub.add_parser('corrupt', help='break a stored video, backing it up first')
    p.add_argument('video_id')
    p.set_defaults(func=cmd_corrupt)

    p = sub.add_parser('restore', help='put the newest backup back')
    p.add_argument('video_id')
    p.set_defaults(func=cmd_restore)

    p = sub.add_parser('sample', help='write a small standalone broken mp4')
    p.add_argument('output')
    p.add_argument('--duration', type=int, default=5)
    p.set_defaults(func=cmd_sample)

    args = parser.parse_args()
    return args.func(args)


if __name__ == '__main__':
    sys.exit(main())
