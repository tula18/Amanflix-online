"""
Timing logs for /api/stream, written to logs/stream_diagnostics.log.

Each stream request writes two lines that share a request number (#N):

REQUEST  How long the handler took before the first byte could go out, split
         into phases: lookup (watch id -> video id, may hit the DB for an
         episode), stat (file exists check on the NAS), lock_wait (waiting out
         a re-encode) and open (send_file opening and sizing the file).
DONE     How the transfer went: bytes read, total time, and how that time
         splits between reading from disk (read_ms) and waiting for the client
         or network to take the data (wait_ms). Also whether the file is
         faststart and whether the client hung up before the end.

Reading it:
- High lookup_ms on a REQUEST: the episode lookup is waiting on SQLite.
- High stat_ms/open_ms, or read_ms close to total_ms with a low read_MBps:
  the NAS is the bottleneck.
- Low read_ms but high wait_ms: the network or the client is the limit.
  Browsers also stop reading once their buffer is full and cancel the request
  on a seek, so long open-ended transfers that end with complete=no are normal.
- faststart=no: the browser has to fetch the end of the file before playback
  can start; expect a second range request near the end of the file.

The log lives on the NAS, so lines are handed to a background thread and the
request never waits for the write.
"""

import atexit
import itertools
import logging
import os
import queue
import threading
import time
from logging.handlers import QueueHandler, QueueListener

from werkzeug.wsgi import FileWrapper

from paths import LOGS_DIR
from utils.logger import SafeRotatingFileHandler

# Handler time before the response can start that is worth flagging
SLOW_REQUEST_MS = 1000
# A single read from disk that is worth flagging
SLOW_READ_MS = 500


def _setup_stream_logger():
    os.makedirs(LOGS_DIR, exist_ok=True)

    stream_logger = logging.getLogger('amanflix.stream')
    stream_logger.setLevel(logging.INFO)
    stream_logger.propagate = False

    if stream_logger.hasHandlers():
        stream_logger.handlers.clear()

    handler = SafeRotatingFileHandler(
        os.path.join(LOGS_DIR, 'stream_diagnostics.log'),
        maxBytes=5242880,  # 5MB
        backupCount=5,
        encoding='utf-8'
    )
    handler.setLevel(logging.INFO)
    handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))

    log_queue = queue.SimpleQueue()
    stream_logger.addHandler(QueueHandler(log_queue))
    listener = QueueListener(log_queue, handler, respect_handler_level=True)
    listener.start()
    atexit.register(listener.stop)
    return stream_logger


stream_log = _setup_stream_logger()

_request_numbers = itertools.count(1)

# path -> (size, mtime, is_faststart); checking means reading box headers off the NAS
_faststart_cache = {}
_faststart_lock = threading.Lock()


def _faststart_status(path):
    """'yes', 'no' or 'unknown'; cached until the file changes."""
    from api.media_health import has_faststart
    try:
        st = os.stat(path)
    except OSError:
        return 'unknown'
    with _faststart_lock:
        cached = _faststart_cache.get(path)
    if cached and cached[:2] == (st.st_size, st.st_mtime):
        return 'yes' if cached[2] else 'no'
    result = has_faststart(path)
    with _faststart_lock:
        _faststart_cache[path] = (st.st_size, st.st_mtime, result)
    return 'yes' if result else 'no'


def _ms(seconds):
    return round(seconds * 1000)


class StreamTrace:
    """Collects the timings of one stream request and writes its log lines."""

    def __init__(self, request, watch_id):
        self.number = next(_request_numbers)
        self.watch_id = watch_id
        self.video_id = None
        self.file_path = None
        self.range = request.headers.get('Range', 'none')
        self.client = request.remote_addr
        self.started = time.perf_counter()
        self._last_mark = self.started
        self.phases = []
        self.responded_at = None
        self.expected_bytes = None

    def mark(self, phase):
        """Record the time spent since the previous mark under `phase`."""
        now = time.perf_counter()
        self.phases.append((phase, _ms(now - self._last_mark)))
        self._last_mark = now

    def install_file_wrapper(self, environ):
        """Have send_file wrap the file in a TimedFileWrapper.

        Returns False when the WSGI server supplies its own file wrapper (a
        production server may send the file without Python reading it); that
        one is left alone and the DONE line is not written.
        """
        if 'wsgi.file_wrapper' in environ:
            return False
        environ['wsgi.file_wrapper'] = lambda file, buffer_size=8192: TimedFileWrapper(file, buffer_size, self)
        return True

    def log_request(self, status, note=''):
        self.responded_at = time.perf_counter()
        total = _ms(self.responded_at - self.started)
        phases = ' '.join(f'{name}_ms={ms}' for name, ms in self.phases)
        line = (
            f'REQUEST  #{self.number} | watch_id={self.watch_id} | video_id={self.video_id} | '
            f'range={self.range} | status={status} | handler_ms={total} | {phases} | '
            f'content_length={self.expected_bytes} | client={self.client}'
        )
        if note:
            line += f' | {note}'
        if total >= SLOW_REQUEST_MS:
            stream_log.warning(f'{line} | SLOW')
        else:
            stream_log.info(line)

    def log_done(self, wrapper):
        now = time.perf_counter()
        total_s = now - (self.responded_at or self.started)
        read_s = wrapper.read_seconds
        mb = wrapper.bytes_read / (1024 * 1024)
        complete = self.expected_bytes is not None and wrapper.bytes_read >= self.expected_bytes
        first_read = _ms(wrapper.first_read_at - self.responded_at) if wrapper.first_read_at and self.responded_at else None
        line = (
            f'DONE     #{self.number} | video_id={self.video_id} | range={self.range} | '
            f'bytes={wrapper.bytes_read} | expected={self.expected_bytes} | complete={"yes" if complete else "no"} | '
            f'total_ms={_ms(total_s)} | read_ms={_ms(read_s)} | wait_ms={_ms(max(total_s - read_s, 0))} | '
            f'first_read_after_ms={first_read} | reads={wrapper.reads} | max_read_ms={_ms(wrapper.max_read_seconds)} | '
            f'slow_reads={wrapper.slow_reads} | read_MBps={mb / read_s if read_s else 0:.1f} | '
            f'avg_MBps={mb / total_s if total_s else 0:.1f} | faststart={_faststart_status(self.file_path)}'
        )
        if wrapper.slow_reads:
            stream_log.warning(f'{line} | SLOW_DISK')
        else:
            stream_log.info(line)


class TimedFileWrapper(FileWrapper):
    """FileWrapper that times each read from disk and logs a summary on close.

    Subclasses FileWrapper so range requests keep seeking straight to the
    requested offset instead of reading the file from the start.
    """

    def __init__(self, file, buffer_size, trace):
        super().__init__(file, buffer_size)
        self.trace = trace
        self.bytes_read = 0
        self.reads = 0
        self.read_seconds = 0.0
        self.max_read_seconds = 0.0
        self.slow_reads = 0
        self.first_read_at = None
        self._closed = False

    def __next__(self):
        started = time.perf_counter()
        data = self.file.read(self.buffer_size)
        elapsed = time.perf_counter() - started
        if self.first_read_at is None:
            self.first_read_at = started
        self.reads += 1
        self.read_seconds += elapsed
        self.max_read_seconds = max(self.max_read_seconds, elapsed)
        if elapsed * 1000 >= SLOW_READ_MS:
            self.slow_reads += 1
        if data:
            self.bytes_read += len(data)
            return data
        raise StopIteration()

    def close(self):
        # Called by the server once the response ends, finished or not
        if not self._closed:
            self._closed = True
            try:
                self.trace.log_done(self)
            except Exception as e:
                stream_log.error(f'DONE     #{self.trace.number} | could not log transfer: {e}')
        super().close()


def log_can_watch(watch_id, video_id, result, lookup_ms, total_ms):
    line = (
        f'CANWATCH | watch_id={watch_id} | video_id={video_id} | result={result} | '
        f'lookup_ms={lookup_ms} | handler_ms={total_ms}'
    )
    if total_ms >= SLOW_REQUEST_MS:
        stream_log.warning(f'{line} | SLOW')
    else:
        stream_log.info(line)
