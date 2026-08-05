/*
 * exec_authority.c — @deckent/exec-authority-native (W3-PR-A skeleton)
 *
 * N-API surface for the identity-stable execution authority
 * (docs/analysis/platform-execution-authority-adapters-2026-08-05.md §4).
 * POSIX-portable by design: every *at-family primitive compiles and is unit
 * tested on Linux too, so the Darwin adapter consumes code that CI exercised
 * on two platforms. Darwin-only identity sources are #ifdef-guarded and
 * return typed absence elsewhere — callers stay fail-closed, never guessing.
 *
 * Every function throws a JS Error whose `code` property carries the errno
 * name (e.g. ENOENT, ENOTDIR, ELOOP); no primitive ever silently falls back
 * to path-based I/O.
 */

#define NAPI_VERSION 8
#include <node_api.h>

#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#ifdef __APPLE__
#include <sys/mount.h>
#include <sys/param.h>
#include <sys/sysctl.h>
#include <sys/time.h>
#include <uuid/uuid.h>
#endif

#define MAX_NAME_BYTES 4096

static napi_value throw_errno(napi_env env, const char *syscall, int err) {
  char msg[256];
  const char *code;
  switch (err) {
    case ENOENT: code = "ENOENT"; break;
    case ENOTDIR: code = "ENOTDIR"; break;
    case EISDIR: code = "EISDIR"; break;
    case ELOOP: code = "ELOOP"; break;
    case EACCES: code = "EACCES"; break;
    case EPERM: code = "EPERM"; break;
    case EEXIST: code = "EEXIST"; break;
    case ENOTEMPTY: code = "ENOTEMPTY"; break;
    case EBADF: code = "EBADF"; break;
    case EINVAL: code = "EINVAL"; break;
    case EXDEV: code = "EXDEV"; break;
    default: code = "EUNKNOWN"; break;
  }
  snprintf(msg, sizeof(msg), "%s failed: %s (errno %d)", syscall, code, err);
  napi_throw_error(env, code, msg);
  return NULL;
}

/* One bounded, NUL-clean path/name argument. Rejects empty and embedded NUL. */
static bool get_name_arg(napi_env env, napi_value value, char *out, size_t cap) {
  size_t len = 0;
  if (napi_get_value_string_utf8(env, value, out, cap, &len) != napi_ok) {
    napi_throw_error(env, "EINVAL", "string argument required");
    return false;
  }
  if (len == 0 || len >= cap - 1) {
    napi_throw_error(env, "EINVAL", "name argument length out of bounds");
    return false;
  }
  if (strlen(out) != len) {
    napi_throw_error(env, "EINVAL", "name argument contains NUL");
    return false;
  }
  return true;
}

static bool get_fd_arg(napi_env env, napi_value value, int32_t *out) {
  if (napi_get_value_int32(env, value, out) != napi_ok || *out < 0) {
    napi_throw_error(env, "EINVAL", "non-negative fd argument required");
    return false;
  }
  return true;
}

/* openDirAt(parentFd | null, name) → fd
 * O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC through the parent handle —
 * the caller never re-walks an absolute path once a root is pinned. */
static napi_value OpenDirAt(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (argc < 2) { napi_throw_error(env, "EINVAL", "openDirAt(parentFd|null, name)"); return NULL; }

  napi_valuetype t;
  napi_typeof(env, argv[0], &t);
  int32_t parent = AT_FDCWD;
  if (t != napi_null && !get_fd_arg(env, argv[0], &parent)) return NULL;

  char name[MAX_NAME_BYTES];
  if (!get_name_arg(env, argv[1], name, sizeof(name))) return NULL;

  int fd = openat(parent, name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (fd < 0) return throw_errno(env, "openat", errno);

  napi_value result;
  napi_create_int32(env, fd, &result);
  return result;
}

/* closeFd(fd) — explicit lifetime; the JS side owns descriptor hygiene. */
static napi_value CloseFd(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  int32_t fd;
  if (argc < 1 || !get_fd_arg(env, argv[0], &fd)) return NULL;
  if (close(fd) != 0) return throw_errno(env, "close", errno);
  napi_value undef;
  napi_get_undefined(env, &undef);
  return undef;
}

/* fstatIdentity(fd) → { dev, ino, isDirectory } (dev/ino as decimal strings —
 * bigint-exact, matching ExecutionLockDirectoryIdentity's string contract). */
static napi_value FstatIdentity(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  int32_t fd;
  if (argc < 1 || !get_fd_arg(env, argv[0], &fd)) return NULL;

  struct stat st;
  if (fstat(fd, &st) != 0) return throw_errno(env, "fstat", errno);

  char dev[32], ino[32];
  snprintf(dev, sizeof(dev), "%llu", (unsigned long long)st.st_dev);
  snprintf(ino, sizeof(ino), "%llu", (unsigned long long)st.st_ino);

  napi_value result, v;
  napi_create_object(env, &result);
  napi_create_string_utf8(env, dev, NAPI_AUTO_LENGTH, &v);
  napi_set_named_property(env, result, "dev", v);
  napi_create_string_utf8(env, ino, NAPI_AUTO_LENGTH, &v);
  napi_set_named_property(env, result, "ino", v);
  napi_get_boolean(env, S_ISDIR(st.st_mode), &v);
  napi_set_named_property(env, result, "isDirectory", v);
  return result;
}

/* readdirFd(fd) → sorted names[] (".", ".." excluded). Uses a dup so the
 * caller's descriptor position/lifetime is never consumed by fdopendir. */
static napi_value ReaddirFd(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  int32_t fd;
  if (argc < 1 || !get_fd_arg(env, argv[0], &fd)) return NULL;

  int dupfd = dup(fd);
  if (dupfd < 0) return throw_errno(env, "dup", errno);
  DIR *dir = fdopendir(dupfd);
  if (dir == NULL) {
    int err = errno;
    close(dupfd);
    return throw_errno(env, "fdopendir", err);
  }
  rewinddir(dir);

  napi_value result;
  napi_create_array(env, &result);
  uint32_t index = 0;
  struct dirent *entry;
  errno = 0;
  while ((entry = readdir(dir)) != NULL) {
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) continue;
    napi_value name;
    napi_create_string_utf8(env, entry->d_name, NAPI_AUTO_LENGTH, &name);
    napi_set_element(env, result, index++, name);
    errno = 0;
  }
  int read_err = errno;
  closedir(dir);
  if (read_err != 0) return throw_errno(env, "readdir", read_err);
  return result;
}

/* unlinkAt(dirFd, name, removeDir) — file unlink or AT_REMOVEDIR rmdir,
 * always relative to the pinned directory handle. */
static napi_value UnlinkAt(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  int32_t fd;
  if (argc < 3 || !get_fd_arg(env, argv[0], &fd)) return NULL;
  char name[MAX_NAME_BYTES];
  if (!get_name_arg(env, argv[1], name, sizeof(name))) return NULL;
  bool remove_dir = false;
  napi_get_value_bool(env, argv[2], &remove_dir);

  if (unlinkat(fd, name, remove_dir ? AT_REMOVEDIR : 0) != 0) {
    return throw_errno(env, "unlinkat", errno);
  }
  napi_value undef;
  napi_get_undefined(env, &undef);
  return undef;
}

/* renameAt(fromDirFd, fromName, toDirFd, toName) */
static napi_value RenameAt(napi_env env, napi_callback_info info) {
  size_t argc = 4;
  napi_value argv[4];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  int32_t from_fd, to_fd;
  if (argc < 4 || !get_fd_arg(env, argv[0], &from_fd)) return NULL;
  char from_name[MAX_NAME_BYTES];
  if (!get_name_arg(env, argv[1], from_name, sizeof(from_name))) return NULL;
  if (!get_fd_arg(env, argv[2], &to_fd)) return NULL;
  char to_name[MAX_NAME_BYTES];
  if (!get_name_arg(env, argv[3], to_name, sizeof(to_name))) return NULL;

  if (renameat(from_fd, from_name, to_fd, to_name) != 0) {
    return throw_errno(env, "renameat", errno);
  }
  napi_value undef;
  napi_get_undefined(env, &undef);
  return undef;
}

/* mountIdentity(fd) → { available, fsid? } — Darwin f_fsid via fstatfs;
 * typed absence elsewhere (Linux consumers keep /proc mnt_id). */
static napi_value MountIdentity(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  int32_t fd;
  if (argc < 1 || !get_fd_arg(env, argv[0], &fd)) return NULL;

  napi_value result, v;
  napi_create_object(env, &result);
#ifdef __APPLE__
  struct statfs sfs;
  if (fstatfs(fd, &sfs) != 0) return throw_errno(env, "fstatfs", errno);
  char fsid[64];
  snprintf(fsid, sizeof(fsid), "%d:%d", sfs.f_fsid.val[0], sfs.f_fsid.val[1]);
  napi_get_boolean(env, true, &v);
  napi_set_named_property(env, result, "available", v);
  napi_create_string_utf8(env, fsid, NAPI_AUTO_LENGTH, &v);
  napi_set_named_property(env, result, "fsid", v);
#else
  (void)fd;
  napi_get_boolean(env, false, &v);
  napi_set_named_property(env, result, "available", v);
#endif
  return result;
}

/* fdPath(fd) → kernel-verified CURRENT path of an open handle (W3-PR-B slice-2,
 * design §10 step-3: the one primitive consumers need when a path-only API such
 * as SQLite must be handed a path derived from a pinned handle). Darwin:
 * fcntl(F_GETPATH) — the only kernel facility resolving a handle to its live
 * path. Other POSIX: readlink(/proc/self/fd/N), so Linux CI exercises the same
 * op surface the Darwin adapter ships. Never a cached or caller-supplied path. */
static napi_value FdPath(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  int32_t fd;
  if (argc < 1 || !get_fd_arg(env, argv[0], &fd)) return NULL;

#ifdef __APPLE__
  char path[MAXPATHLEN];
  if (fcntl(fd, F_GETPATH, path) != 0) {
    return throw_errno(env, "fcntl(F_GETPATH)", errno);
  }
#else
  char link[64];
  char path[MAX_NAME_BYTES];
  snprintf(link, sizeof(link), "/proc/self/fd/%d", fd);
  ssize_t len = readlink(link, path, sizeof(path) - 1);
  if (len < 0) return throw_errno(env, "readlink(/proc/self/fd)", errno);
  path[len] = '\0';
#endif

  napi_value result;
  napi_create_string_utf8(env, path, NAPI_AUTO_LENGTH, &result);
  return result;
}

/* hostBootIdentity() → { available, hostUuid?, bootTime? } (Darwin only). */
static napi_value HostBootIdentity(napi_env env, napi_callback_info info) {
  (void)info;
  napi_value result, v;
  napi_create_object(env, &result);
#ifdef __APPLE__
  uuid_t uuid;
  struct timespec wait = { .tv_sec = 2, .tv_nsec = 0 };
  if (gethostuuid(uuid, &wait) != 0) return throw_errno(env, "gethostuuid", errno);
  uuid_string_t uuid_str;
  uuid_unparse_lower(uuid, uuid_str);

  struct timeval boottime;
  size_t len = sizeof(boottime);
  int mib[2] = { CTL_KERN, KERN_BOOTTIME };
  if (sysctl(mib, 2, &boottime, &len, NULL, 0) != 0) {
    return throw_errno(env, "sysctl(kern.boottime)", errno);
  }
  char boot[64];
  snprintf(boot, sizeof(boot), "%lld", (long long)boottime.tv_sec);

  napi_get_boolean(env, true, &v);
  napi_set_named_property(env, result, "available", v);
  napi_create_string_utf8(env, uuid_str, NAPI_AUTO_LENGTH, &v);
  napi_set_named_property(env, result, "hostUuid", v);
  napi_create_string_utf8(env, boot, NAPI_AUTO_LENGTH, &v);
  napi_set_named_property(env, result, "bootTime", v);
#else
  napi_get_boolean(env, false, &v);
  napi_set_named_property(env, result, "available", v);
#endif
  return result;
}

static napi_value Init(napi_env env, napi_value exports) {
  const struct { const char *name; napi_callback fn; } fns[] = {
    { "openDirAt", OpenDirAt },
    { "closeFd", CloseFd },
    { "fstatIdentity", FstatIdentity },
    { "readdirFd", ReaddirFd },
    { "unlinkAt", UnlinkAt },
    { "renameAt", RenameAt },
    { "mountIdentity", MountIdentity },
    { "fdPath", FdPath },
    { "hostBootIdentity", HostBootIdentity },
  };
  for (size_t i = 0; i < sizeof(fns) / sizeof(fns[0]); i += 1) {
    napi_value fn;
    napi_create_function(env, fns[i].name, NAPI_AUTO_LENGTH, fns[i].fn, NULL, &fn);
    napi_set_named_property(env, exports, fns[i].name, fn);
  }
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
