// slowfs: make file I/O under a path prefix behave like a network share (SMB NAS), without root.
//
// Injected into one process with DYLD_INSERT_LIBRARIES. Every file operation on a path under
// SLOWFS_PREFIX pays what an SMB client would: a network round trip per request, and a shared
// bandwidth cap for the bytes. Nothing else on the machine is affected.
//
// Model (defaults approximate a Windows SMB client talking to a NAS over gigabit):
//   open / openat / unlink / rename / mkdir ..... 1 RTT        (SMB CREATE etc. always hit the server)
//   stat / lstat / access ...................... 1 RTT, then cached per path for 10s
//                                                   (Windows FileInfoCacheLifetime)
//   byte-range locks (fcntl F_SETLK/GETLK) ..... 1 RTT        (SQLite locking)
//   fsync / F_FULLFSYNC ......................... 1 RTT + SLOWFS_FSYNC_MS (NAS commit to disk)
//   pread at a non-sequential offset ........... 1 RTT + bytes/bandwidth (SQLite page reads)
//   sequential read/pread ...................... 1 RTT per SLOWFS_READAHEAD_KB + bytes/bandwidth
//   write/pwrite on a normal fd ................ 1 RTT + bytes/bandwidth (write-through)
//   write on an O_APPEND fd (log files) ........ bytes/bandwidth only (write-behind cache), unless
//                                                   SLOWFS_APPEND_RTT=1
//   close / fstat / lseek ...................... free
// Reads and writes each share one link of SLOWFS_BW_MBPS (full duplex), serialized across threads.
//
// Env:
//   SLOWFS_PREFIX       absolute path prefix treated as remote (required)
//   SLOWFS_RTT_US       round trip in microseconds (default 1000)
//   SLOWFS_BW_MBPS      link bandwidth in MB/s (default 100)
//   SLOWFS_FSYNC_MS     extra NAS flush time (default 5)
//   SLOWFS_READAHEAD_KB client read-ahead window for sequential reads (default 1024)
//   SLOWFS_APPEND_RTT   1 = charge an RTT per append write too (default 0)
//   SLOWFS_STATS        file to rewrite every 5s with op counts and injected delay
//
// Build: cc -O2 -dynamiclib -o slowfs.dylib slowfs.c

#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <pthread.h>
#include <stdarg.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/param.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#define DYLD_INTERPOSE(_replacement, _replacee)                                              \
    __attribute__((used)) static struct {                                                   \
        const void *replacement;                                                            \
        const void *replacee;                                                               \
    } _interpose_##_replacee __attribute__((section("__DATA,__interpose"))) = {             \
        (const void *)(unsigned long)&_replacement, (const void *)(unsigned long)&_replacee};

#define MAX_FDS 65536
#define STAT_CACHE_SLOTS 65536

enum { OP_OPEN, OP_STAT, OP_STAT_CACHED, OP_LOCK, OP_FSYNC, OP_READ, OP_WRITE, OP_META, OP_COUNT };
static const char *op_names[OP_COUNT] = {"open", "stat", "stat(cached)", "lock", "fsync", "read", "write", "unlink/rename/mkdir"};

static char g_prefix[PATH_MAX];
static size_t g_prefix_len;
static int g_enabled;
static long g_rtt_us = 1000;
static double g_bw_bytes_per_us = 100.0;  // 100 MB/s = 100 bytes/us
static long g_fsync_us = 5000;
static long g_readahead = 1024 * 1024;
static int g_append_rtt;

static unsigned char g_remote[MAX_FDS];     // fd -> 1 if remote
static unsigned char g_append[MAX_FDS];     // fd -> 1 if opened O_APPEND
static off_t g_next_off[MAX_FDS];           // expected next offset for sequential detection
static long g_ra_left[MAX_FDS];             // read-ahead bytes left before the next RTT

static _Atomic uint64_t g_ops[OP_COUNT];
static _Atomic uint64_t g_delay_us[OP_COUNT];
static _Atomic uint64_t g_bytes_read, g_bytes_written;

static struct { uint64_t hash; int64_t expires_us; } g_stat_cache[STAT_CACHE_SLOTS];
static pthread_mutex_t g_stat_lock = PTHREAD_MUTEX_INITIALIZER;

// Serial links (full duplex): the time each direction becomes free again
static pthread_mutex_t g_link_lock = PTHREAD_MUTEX_INITIALIZER;
static int64_t g_read_free_us, g_write_free_us;

static int64_t now_us(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (int64_t)ts.tv_sec * 1000000 + ts.tv_nsec / 1000;
}

static void sleep_until(int64_t t) {
    int64_t d = t - now_us();
    if (d > 0) usleep((useconds_t)d);
}

static void account(int op, int64_t start) {
    atomic_fetch_add(&g_ops[op], 1);
    atomic_fetch_add(&g_delay_us[op], (uint64_t)(now_us() - start));
}

static void rtt(int op) {
    int64_t start = now_us();
    sleep_until(start + g_rtt_us);
    account(op, start);
}

// Move `bytes` over the shared link, plus an RTT if `with_rtt`.
static void transfer(int op, size_t bytes, int is_write, int with_rtt) {
    int64_t start = now_us();
    int64_t done;
    pthread_mutex_lock(&g_link_lock);
    int64_t *free_at = is_write ? &g_write_free_us : &g_read_free_us;
    int64_t begin = *free_at > start ? *free_at : start;
    done = begin + (int64_t)((double)bytes / g_bw_bytes_per_us);
    *free_at = done;
    pthread_mutex_unlock(&g_link_lock);
    if (with_rtt) done += g_rtt_us;
    sleep_until(done);
    account(op, start);
    atomic_fetch_add(is_write ? &g_bytes_written : &g_bytes_read, bytes);
}

static int is_remote_path(const char *path) {
    if (!g_enabled || !path) return 0;
    if (path[0] == '/') return strncmp(path, g_prefix, g_prefix_len) == 0;
    char cwd[PATH_MAX];
    if (!getcwd(cwd, sizeof cwd)) return 0;
    return strncmp(cwd, g_prefix, g_prefix_len) == 0;
}

static int is_remote_at(int dirfd, const char *path) {
    if (!g_enabled || !path) return 0;
    if (path[0] == '/' || dirfd == AT_FDCWD) return is_remote_path(path);
    char dir[PATH_MAX];
    if (fcntl(dirfd, F_GETPATH, dir) == -1) return 0;
    return strncmp(dir, g_prefix, g_prefix_len) == 0;
}

static int fd_remote(int fd) { return g_enabled && fd >= 0 && fd < MAX_FDS && g_remote[fd]; }

static void track_open(int fd, int flags) {
    if (fd < 0 || fd >= MAX_FDS) return;
    g_remote[fd] = 1;
    g_append[fd] = (flags & O_APPEND) ? 1 : 0;
    g_next_off[fd] = -1;
    g_ra_left[fd] = 0;
}

static uint64_t path_hash(const char *path) {
    uint64_t h = 1469598103934665603ULL;
    char cwd[PATH_MAX];
    if (path[0] != '/' && getcwd(cwd, sizeof cwd))
        for (const char *p = cwd; *p; p++) h = (h ^ (unsigned char)*p) * 1099511628211ULL;
    for (const char *p = path; *p; p++) h = (h ^ (unsigned char)*p) * 1099511628211ULL;
    return h ? h : 1;
}

// Stat-like calls: RTT unless this path was looked up in the last 10s
static void stat_delay(const char *path) {
    uint64_t h = path_hash(path);
    int64_t t = now_us();
    size_t slot = h % STAT_CACHE_SLOTS;
    pthread_mutex_lock(&g_stat_lock);
    int hit = g_stat_cache[slot].hash == h && g_stat_cache[slot].expires_us > t;
    if (!hit) { g_stat_cache[slot].hash = h; g_stat_cache[slot].expires_us = t + 10 * 1000000LL; }
    pthread_mutex_unlock(&g_stat_lock);
    if (hit) atomic_fetch_add(&g_ops[OP_STAT_CACHED], 1);
    else rtt(OP_STAT);
}

static void read_delay(int fd, off_t off, size_t n) {
    int sequential = (off < 0) || (g_next_off[fd] == off);
    int with_rtt = 1;
    if (sequential && g_ra_left[fd] >= (long)n) {
        with_rtt = 0;
        g_ra_left[fd] -= (long)n;
    } else {
        g_ra_left[fd] = sequential ? g_readahead - (long)n : 0;
    }
    if (off >= 0) g_next_off[fd] = off + (off_t)n;
    transfer(OP_READ, n, 0, with_rtt);
}

static void write_delay(int fd, size_t n) {
    transfer(OP_WRITE, n, 1, g_append[fd] ? g_append_rtt : 1);
}

// ── interposed calls ─────────────────────────────────────────────
static int my_open(const char *path, int flags, ...) {
    mode_t mode = 0;
    if (flags & O_CREAT) { va_list ap; va_start(ap, flags); mode = (mode_t)va_arg(ap, int); va_end(ap); }
    int remote = is_remote_path(path);
    if (remote) rtt(OP_OPEN);
    int fd = open(path, flags, mode);
    if (remote && fd >= 0) track_open(fd, flags);
    return fd;
}
DYLD_INTERPOSE(my_open, open)

static int my_openat(int dirfd, const char *path, int flags, ...) {
    mode_t mode = 0;
    if (flags & O_CREAT) { va_list ap; va_start(ap, flags); mode = (mode_t)va_arg(ap, int); va_end(ap); }
    int remote = is_remote_at(dirfd, path);
    if (remote) rtt(OP_OPEN);
    int fd = openat(dirfd, path, flags, mode);
    if (remote && fd >= 0) track_open(fd, flags);
    return fd;
}
DYLD_INTERPOSE(my_openat, openat)

static int my_close(int fd) {
    if (fd >= 0 && fd < MAX_FDS) g_remote[fd] = 0;
    return close(fd);
}
DYLD_INTERPOSE(my_close, close)

static ssize_t my_read(int fd, void *buf, size_t n) {
    ssize_t r = read(fd, buf, n);
    if (r > 0 && fd_remote(fd)) read_delay(fd, -1, (size_t)r);
    return r;
}
DYLD_INTERPOSE(my_read, read)

static ssize_t my_pread(int fd, void *buf, size_t n, off_t off) {
    ssize_t r = pread(fd, buf, n, off);
    if (r >= 0 && fd_remote(fd)) read_delay(fd, off, r > 0 ? (size_t)r : 1);
    return r;
}
DYLD_INTERPOSE(my_pread, pread)

static ssize_t my_write(int fd, const void *buf, size_t n) {
    if (fd_remote(fd)) write_delay(fd, n);
    return write(fd, buf, n);
}
DYLD_INTERPOSE(my_write, write)

static ssize_t my_pwrite(int fd, const void *buf, size_t n, off_t off) {
    if (fd_remote(fd)) write_delay(fd, n);
    return pwrite(fd, buf, n, off);
}
DYLD_INTERPOSE(my_pwrite, pwrite)

static int my_fsync(int fd) {
    if (fd_remote(fd)) { int64_t s = now_us(); sleep_until(s + g_rtt_us + g_fsync_us); account(OP_FSYNC, s); }
    return fsync(fd);
}
DYLD_INTERPOSE(my_fsync, fsync)

static int my_fcntl(int fd, int cmd, ...) {
    va_list ap;
    va_start(ap, cmd);
    void *arg = va_arg(ap, void *);
    va_end(ap);
    if (fd_remote(fd)) {
        if (cmd == F_SETLK || cmd == F_SETLKW || cmd == F_GETLK) rtt(OP_LOCK);
        else if (cmd == F_FULLFSYNC) { int64_t s = now_us(); sleep_until(s + g_rtt_us + g_fsync_us); account(OP_FSYNC, s); }
    }
    return fcntl(fd, cmd, arg);
}
DYLD_INTERPOSE(my_fcntl, fcntl)

static int my_stat(const char *path, struct stat *st) {
    if (is_remote_path(path)) stat_delay(path);
    return stat(path, st);
}
DYLD_INTERPOSE(my_stat, stat)

static int my_lstat(const char *path, struct stat *st) {
    if (is_remote_path(path)) stat_delay(path);
    return lstat(path, st);
}
DYLD_INTERPOSE(my_lstat, lstat)

static int my_fstatat(int dirfd, const char *path, struct stat *st, int flags) {
    if (is_remote_at(dirfd, path)) stat_delay(path);
    return fstatat(dirfd, path, st, flags);
}
DYLD_INTERPOSE(my_fstatat, fstatat)

static int my_access(const char *path, int mode) {
    if (is_remote_path(path)) stat_delay(path);
    return access(path, mode);
}
DYLD_INTERPOSE(my_access, access)

static int my_unlink(const char *path) {
    if (is_remote_path(path)) rtt(OP_META);
    return unlink(path);
}
DYLD_INTERPOSE(my_unlink, unlink)

static int my_rename(const char *from, const char *to) {
    if (is_remote_path(from)) rtt(OP_META);
    return rename(from, to);
}
DYLD_INTERPOSE(my_rename, rename)

static int my_mkdir(const char *path, mode_t mode) {
    if (is_remote_path(path)) rtt(OP_META);
    return mkdir(path, mode);
}
DYLD_INTERPOSE(my_mkdir, mkdir)

// ── counters for in-process callers (ctypes) ─────────────────────
// op: 0 open, 1 stat, 2 stat(cached), 3 lock, 4 fsync, 5 read, 6 write, 7 meta
__attribute__((visibility("default"))) uint64_t slowfs_ops(int op) {
    return (op >= 0 && op < OP_COUNT) ? atomic_load(&g_ops[op]) : 0;
}
__attribute__((visibility("default"))) uint64_t slowfs_delay_us(int op) {
    return (op >= 0 && op < OP_COUNT) ? atomic_load(&g_delay_us[op]) : 0;
}
__attribute__((visibility("default"))) uint64_t slowfs_bytes_read(void) { return atomic_load(&g_bytes_read); }

// ── stats reporter ───────────────────────────────────────────────
static char g_stats_path[PATH_MAX];

static void *stats_thread(void *unused) {
    (void)unused;
    uint64_t prev_ops[OP_COUNT] = {0}, prev_delay[OP_COUNT] = {0};
    int64_t started = now_us();
    for (;;) {
        sleep(5);
        char tmp[PATH_MAX + 8];
        snprintf(tmp, sizeof tmp, "%s.tmp", g_stats_path);
        g_enabled = 0;  // don't slow down our own stats file if it lives under the prefix
        FILE *f = fopen(tmp, "w");
        if (f) {
            fprintf(f, "slowfs  prefix=%s  rtt=%ldus  bw=%.0fMB/s  fsync=+%ldms  uptime=%llds\n",
                    g_prefix, g_rtt_us, g_bw_bytes_per_us, g_fsync_us / 1000,
                    (long long)((now_us() - started) / 1000000));
            fprintf(f, "read %.1f MB  written %.1f MB\n\n",
                    atomic_load(&g_bytes_read) / 1e6, atomic_load(&g_bytes_written) / 1e6);
            fprintf(f, "%-22s %12s %10s %16s %14s\n", "op", "total", "last 5s", "injected total", "injected 5s");
            for (int i = 0; i < OP_COUNT; i++) {
                uint64_t o = atomic_load(&g_ops[i]), d = atomic_load(&g_delay_us[i]);
                fprintf(f, "%-22s %12llu %10llu %14.1fs %13.2fs\n", op_names[i], (unsigned long long)o,
                        (unsigned long long)(o - prev_ops[i]), d / 1e6, (d - prev_delay[i]) / 1e6);
                prev_ops[i] = o;
                prev_delay[i] = d;
            }
            fclose(f);
            rename(tmp, g_stats_path);
        }
        g_enabled = 1;
    }
    return NULL;
}

__attribute__((constructor)) static void slowfs_init(void) {
    const char *p = getenv("SLOWFS_PREFIX");
    if (!p || p[0] != '/') return;
    strlcpy(g_prefix, p, sizeof g_prefix);
    g_prefix_len = strlen(g_prefix);
    const char *v;
    if ((v = getenv("SLOWFS_RTT_US"))) g_rtt_us = atol(v);
    if ((v = getenv("SLOWFS_BW_MBPS"))) g_bw_bytes_per_us = atof(v);
    if ((v = getenv("SLOWFS_FSYNC_MS"))) g_fsync_us = atol(v) * 1000;
    if ((v = getenv("SLOWFS_READAHEAD_KB"))) g_readahead = atol(v) * 1024;
    if ((v = getenv("SLOWFS_APPEND_RTT"))) g_append_rtt = atoi(v);
    g_enabled = 1;
    if ((v = getenv("SLOWFS_STATS")) && v[0] == '/') {
        strlcpy(g_stats_path, v, sizeof g_stats_path);
        pthread_t t;
        pthread_create(&t, NULL, stats_thread, NULL);
        pthread_detach(t);
    }
}
