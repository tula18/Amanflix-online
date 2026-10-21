"""
CPU limits for background ffmpeg encodes.

x264 uses every core by default and ffmpeg runs at normal priority, so a few
re-encodes running at once take 100% of the CPU and starve the web server and
the streams it is serving. Three limits keep encodes in the background:

* At most AMANFLIX_ENCODE_MAX_JOBS encodes run at once (default 1). Others wait
  their turn in encode_slot().
* Each encode uses at most AMANFLIX_ENCODE_THREADS threads (default: a quarter
  of the logical CPUs, at least 2).
* ffmpeg runs at the lowest CPU priority (nice 19 / IDLE_PRIORITY_CLASS) and,
  on Linux, best-effort lowest I/O priority, so anything the site needs to do
  runs first.
"""

import os
import shutil
import subprocess
import sys
import threading
from contextlib import contextmanager

_cpus = os.cpu_count() or 4

MAX_JOBS = max(1, int(os.environ.get('AMANFLIX_ENCODE_MAX_JOBS', '1')))
THREADS = max(1, int(os.environ.get('AMANFLIX_ENCODE_THREADS', str(max(2, _cpus // 4)))))

_slots = threading.BoundedSemaphore(MAX_JOBS)
_ionice = shutil.which('ionice') if sys.platform.startswith('linux') else None


@contextmanager
def encode_slot():
    """Block until fewer than MAX_JOBS encodes are running, then hold a slot."""
    _slots.acquire()
    try:
        yield
    finally:
        _slots.release()


def thread_args():
    """ffmpeg output options that cap the encoder's thread count."""
    return ['-threads', str(THREADS)]


def _lower_priority():
    os.nice(19)


def run_low_priority(cmd, **kwargs):
    """subprocess.run() with the command at the lowest CPU and I/O priority."""
    if sys.platform == 'win32':
        kwargs['creationflags'] = kwargs.get('creationflags', 0) | subprocess.IDLE_PRIORITY_CLASS
    else:
        kwargs['preexec_fn'] = _lower_priority
        if _ionice:
            cmd = [_ionice, '-c', '2', '-n', '7'] + list(cmd)
    return subprocess.run(cmd, **kwargs)
