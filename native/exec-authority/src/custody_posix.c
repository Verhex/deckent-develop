#include "custody_common.h"

#if !defined(__linux__) && !defined(__APPLE__)
#error "custody_posix.c is only valid for Linux and Darwin builds"
#endif

#include <node_api.h>

#include <errno.h>
#include <dirent.h>
#include <fcntl.h>
#include <inttypes.h>
#include <limits.h>
#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>
#include <time.h>

#if defined(__linux__)
#include <linux/fs.h>
#include <linux/magic.h>
#include <sys/syscall.h>
#include <sys/statfs.h>
#include <sys/sysmacros.h>
#elif defined(__APPLE__)
#include <sys/mount.h>
#endif

#define DECKENT_POSIX_RESOURCE_MAGIC UINT64_C(0x6465636b706f7369)
#define DECKENT_POSIX_MAX_COMPONENT_BYTES 4096u
#define DECKENT_POSIX_MAX_INGRESS_PATH_BYTES 32767u
#define DECKENT_POSIX_MAX_PUBLICATION_BYTES UINT64_C(1073741824)
#define DECKENT_POSIX_COMPARE_BUFFER_BYTES 65536u
#define DECKENT_POSIX_MAX_PARENT_WALK_STEPS 32768u

#define DECKENT_POSIX_CAP_ANONYMOUS_TEMPFILE (1u << 0)
#define DECKENT_POSIX_CAP_DIRECTORY_DURABILITY (1u << 1)
#define DECKENT_POSIX_CAP_HARD_LINKS (1u << 2)
#define DECKENT_POSIX_CAP_NO_REPLACE_PUBLISH (1u << 3)
#define DECKENT_POSIX_CAP_STABLE_OBJECT_ID (1u << 4)

typedef enum deckent_posix_disposition {
  DECKENT_POSIX_OPEN_EXISTING = 1,
  DECKENT_POSIX_CREATE_NEW = 2,
  DECKENT_POSIX_OPEN_OR_CREATE = 3,
} deckent_posix_disposition;

typedef struct deckent_posix_identity_snapshot {
  struct stat status;
  uint64_t mount_id;
  uint64_t fs_magic;
  uint32_t evidence_bits;
  uint32_t capability_bits;
} deckent_posix_identity_snapshot;

typedef struct deckent_posix_resource {
  uint64_t magic;
  deckent_native_handle_kind kind;
  int fd;
  int parent_fd;
  uint64_t parent_generation;
  char *target_name;
  uint64_t max_bytes;
  uint64_t length;
  uint32_t evidence_bits;
  uint32_t capability_bits;
  deckent_posix_identity_snapshot durability_identity;
  uint32_t durability_evidence_bits;
  bool durability_identity_valid;
  struct stat named_create_identity;
  bool named_create_identity_valid;
  bool anonymous_publication;
  bool namespace_linked;
} deckent_posix_resource;

typedef struct deckent_posix_named_create_guard {
  int object_fd;
  int parent_fd;
  char *name;
  struct stat created_identity;
  bool active;
} deckent_posix_named_create_guard;

static void clear_pending_exception(napi_env env) {
  bool pending = false;
  napi_value ignored;
  if (napi_is_exception_pending(env, &pending) == napi_ok && pending) {
    (void)napi_get_and_clear_last_exception(env, &ignored);
  }
}

static void end_borrow_or_fatal(
  napi_env env,
  deckent_native_borrow *borrow,
  const char *message
) {
  if (deckent_native_end_borrow(env, borrow)) return;
  napi_fatal_error(
    "deckent.exec-authority",
    NAPI_AUTO_LENGTH,
    message,
    NAPI_AUTO_LENGTH
  );
}

static napi_value take_pending_exception(napi_env env) {
  bool pending = false;
  napi_value exception = NULL;
  if (napi_is_exception_pending(env, &pending) != napi_ok || !pending) return NULL;
  if (napi_get_and_clear_last_exception(env, &exception) != napi_ok) return NULL;
  return exception;
}

static napi_value throw_typed(
  napi_env env,
  const char *code,
  const char *message
) {
  clear_pending_exception(env);
  return deckent_native_throw(env, code, message);
}

static napi_value restore_pending_or_throw(
  napi_env env,
  napi_value saved,
  const char *fallback_code,
  const char *fallback_message
) {
  clear_pending_exception(env);
  if (saved != NULL && napi_throw(env, saved) == napi_ok) return NULL;
  return throw_typed(env, fallback_code, fallback_message);
}

static napi_value throw_errno_typed(napi_env env, int error) {
  switch (error) {
    case ENOENT:
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_NOT_FOUND,
        "POSIX custody object was not found"
      );
    case EEXIST:
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_ALREADY_EXISTS,
        "POSIX custody object already exists"
      );
    case ELOOP:
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_REPARSE_REJECTED,
        "POSIX custody rejected a symbolic-link boundary"
      );
    case ENOTDIR:
    case EISDIR:
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_OBJECT_TYPE_MISMATCH,
        "POSIX custody object type did not match"
      );
    case ENOSYS:
    case ENOTSUP:
#if defined(EOPNOTSUPP) && EOPNOTSUPP != ENOTSUP
    case EOPNOTSUPP:
#endif
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_VOLUME_UNSUPPORTED,
        "POSIX custody primitive is unavailable on this volume"
      );
    case EFBIG:
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_SIZE_LIMIT,
        "POSIX custody byte limit was exceeded"
      );
    default:
      return throw_typed(
        env,
        "E_EXEC_AUTH_NATIVE_OPERATION",
        "POSIX custody operation failed"
      );
  }
}

static bool set_named_value(
  napi_env env,
  napi_value object,
  const char *name,
  napi_value value
) {
  return deckent_native_define_own_value(env, object, name, value);
}

static bool set_named_string(
  napi_env env,
  napi_value object,
  const char *name,
  const char *value
) {
  napi_value text;
  if (napi_create_string_utf8(env, value, NAPI_AUTO_LENGTH, &text) != napi_ok) {
    throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "POSIX custody result string could not be created"
    );
    return false;
  }
  return set_named_value(env, object, name, text);
}

static bool set_named_uint32(
  napi_env env,
  napi_value object,
  const char *name,
  uint32_t value
) {
  napi_value number;
  if (napi_create_uint32(env, value, &number) != napi_ok) {
    throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "POSIX custody result integer could not be created"
    );
    return false;
  }
  return set_named_value(env, object, name, number);
}

static bool set_named_double(
  napi_env env,
  napi_value object,
  const char *name,
  double value
) {
  napi_value number;
  if (napi_create_double(env, value, &number) != napi_ok) {
    throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "POSIX custody result number could not be created"
    );
    return false;
  }
  return set_named_value(env, object, name, number);
}

static bool set_named_boolean(
  napi_env env,
  napi_value object,
  const char *name,
  bool value
) {
  napi_value boolean;
  if (napi_get_boolean(env, value, &boolean) != napi_ok) {
    throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "POSIX custody result boolean could not be created"
    );
    return false;
  }
  return set_named_value(env, object, name, boolean);
}

static bool set_named_null(
  napi_env env,
  napi_value object,
  const char *name
) {
  napi_value null_value;
  if (napi_get_null(env, &null_value) != napi_ok) {
    throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "POSIX custody null field could not be created"
    );
    return false;
  }
  return set_named_value(env, object, name, null_value);
}

static bool freeze_object(napi_env env, napi_value object) {
  if (napi_object_freeze(env, object) == napi_ok) return true;
  throw_typed(
    env,
    "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
    "POSIX custody nested record could not be frozen"
  );
  return false;
}

static bool get_exact_input(
  napi_env env,
  deckent_native_state *state,
  deckent_custody_operation operation,
  size_t argc,
  napi_value *argv,
  napi_value *input
) {
  if (argc != 1u || argv == NULL) {
    throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "POSIX custody input record shape is invalid"
    );
    return false;
  }
  if (!deckent_native_require_input_snapshot(
        env,
        state,
        argv[0],
        operation
      )) return false;
  *input = argv[0];
  return true;
}

static bool get_named_value(
  napi_env env,
  napi_value input,
  const char *name,
  napi_value *value
) {
  if (deckent_native_get_own_value(env, input, name, value)) return true;
  throw_typed(
    env,
    "E_EXEC_AUTH_NATIVE_ARGUMENT",
    "POSIX custody input field could not be read"
  );
  return false;
}

static bool get_named_string_alloc(
  napi_env env,
  napi_value input,
  const char *name,
  size_t maximum_bytes,
  char **value
) {
  napi_value field;
  napi_valuetype type;
  size_t length = 0u;
  size_t copied = 0u;
  char *text;
  if (!get_named_value(env, input, name, &field)
      || napi_typeof(env, field, &type) != napi_ok
      || type != napi_string
      || napi_get_value_string_utf8(env, field, NULL, 0u, &length) != napi_ok
      || length == 0u
      || length > maximum_bytes
      || length == SIZE_MAX) {
    throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "POSIX custody string field is invalid"
    );
    return false;
  }
  text = (char *)malloc(length + 1u);
  if (text == NULL) {
    throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "POSIX custody string allocation failed"
    );
    return false;
  }
  if (napi_get_value_string_utf8(env, field, text, length + 1u, &copied) != napi_ok
      || copied != length
      || strlen(text) != length) {
    free(text);
    throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "POSIX custody string field encoding is invalid"
    );
    return false;
  }
  *value = text;
  return true;
}

static bool get_named_exact_string(
  napi_env env,
  napi_value input,
  const char *name,
  const char *expected
) {
  char *value = NULL;
  bool matches;
  if (!get_named_string_alloc(env, input, name, 64u, &value)) return false;
  matches = strcmp(value, expected) == 0;
  free(value);
  if (!matches) {
    throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "POSIX custody policy field is invalid"
    );
  }
  return matches;
}

static bool get_named_disposition(
  napi_env env,
  napi_value input,
  deckent_posix_disposition *disposition
) {
  char *value = NULL;
  if (!get_named_string_alloc(env, input, "disposition", 32u, &value)) {
    return false;
  }
  if (strcmp(value, DECKENT_CUSTODY_DISPOSITION_OPEN_EXISTING) == 0) {
    *disposition = DECKENT_POSIX_OPEN_EXISTING;
  } else if (strcmp(value, DECKENT_CUSTODY_DISPOSITION_CREATE_NEW) == 0) {
    *disposition = DECKENT_POSIX_CREATE_NEW;
  } else if (strcmp(value, DECKENT_CUSTODY_DISPOSITION_OPEN_OR_CREATE) == 0) {
    *disposition = DECKENT_POSIX_OPEN_OR_CREATE;
  } else {
    free(value);
    throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "POSIX custody disposition is invalid"
    );
    return false;
  }
  free(value);
  return true;
}

static bool get_named_safe_positive_u64(
  napi_env env,
  napi_value input,
  const char *name,
  uint64_t maximum,
  uint64_t *value
) {
  napi_value field;
  napi_valuetype type;
  double number;
  if (!get_named_value(env, input, name, &field)
      || napi_typeof(env, field, &type) != napi_ok
      || type != napi_number
      || napi_get_value_double(env, field, &number) != napi_ok
      || !isfinite(number)
      || number < 1.0
      || floor(number) != number
      || number > 9007199254740991.0
      || number > (double)maximum) {
    throw_typed(
      env,
      DECKENT_NATIVE_ERROR_SIZE_LIMIT,
      "POSIX custody byte bound is invalid"
    );
    return false;
  }
  *value = (uint64_t)number;
  return true;
}

static bool valid_component(const char *value) {
  size_t length;
  if (value == NULL) return false;
  length = strlen(value);
  return length > 0u
    && length <= DECKENT_POSIX_MAX_COMPONENT_BYTES
    && strcmp(value, ".") != 0
    && strcmp(value, "..") != 0
    && strchr(value, '/') == NULL
    && strchr(value, '\\') == NULL;
}

static bool get_named_component(
  napi_env env,
  napi_value input,
  const char *name,
  char **component
) {
  if (!get_named_string_alloc(
        env,
        input,
        name,
        DECKENT_POSIX_MAX_COMPONENT_BYTES,
        component
      )) return false;
  if (!valid_component(*component)) {
    free(*component);
    *component = NULL;
    throw_typed(
      env,
      DECKENT_NATIVE_ERROR_INVALID_COMPONENT,
      "POSIX custody name must be one safe component"
    );
    return false;
  }
  return true;
}

static bool valid_ingress_path(const char *path) {
  const char *cursor;
  const char *component;
  if (path == NULL || path[0] != '/') return false;
  if (path[1] == '\0') return true;
  if (path[1] == '/' || path[strlen(path) - 1u] == '/') return false;
  cursor = path + 1;
  component = cursor;
  for (;;) {
    if (*cursor == '/' || *cursor == '\0') {
      size_t length = (size_t)(cursor - component);
      if (length == 0u
          || length > DECKENT_POSIX_MAX_COMPONENT_BYTES
          || (length == 1u && component[0] == '.')
          || (length == 2u && component[0] == '.' && component[1] == '.')) {
        return false;
      }
      if (*cursor == '\0') return true;
      component = cursor + 1;
    }
    cursor += 1;
  }
}

static int close_once(int fd) {
  if (fd < 0) return 0;
  return close(fd) == 0 ? 0 : -1;
}

static bool close_owned_fd(int *fd) {
  int owned;
  if (fd == NULL || *fd < 0) return true;
  owned = *fd;
  *fd = -1;
  return close_once(owned) == 0;
}

static bool close_owned_pair(int *first, int *second) {
  bool first_closed = close_owned_fd(first);
  bool second_closed = close_owned_fd(second);
  return first_closed && second_closed;
}

static int close_posix_resource(uintptr_t opaque) {
  deckent_posix_resource *resource = (deckent_posix_resource *)opaque;
  int cleanup_status = 0;
  if (resource == NULL || resource->magic != DECKENT_POSIX_RESOURCE_MAGIC) {
    return -1;
  }
  resource->magic = 0u;
  if (!close_owned_fd(&resource->fd)) cleanup_status = -1;
  if (!close_owned_fd(&resource->parent_fd)) cleanup_status = -1;
  free(resource->target_name);
  resource->target_name = NULL;
  free(resource);
  return cleanup_status;
}

static deckent_posix_resource *create_resource(
  deckent_native_handle_kind kind,
  int fd,
  int parent_fd,
  uint64_t parent_generation,
  uint32_t evidence_bits,
  uint32_t capability_bits
) {
  deckent_posix_resource *resource =
    (deckent_posix_resource *)calloc(1u, sizeof(*resource));
  if (resource == NULL) return NULL;
  resource->magic = DECKENT_POSIX_RESOURCE_MAGIC;
  resource->kind = kind;
  resource->fd = fd;
  resource->parent_fd = parent_fd;
  resource->parent_generation = parent_generation;
  resource->evidence_bits = evidence_bits;
  resource->capability_bits = capability_bits;
  return resource;
}

static bool valid_resource(
  const deckent_posix_resource *resource,
  deckent_native_handle_kind expected_kind
) {
  return resource != NULL
    && resource->magic == DECKENT_POSIX_RESOURCE_MAGIC
    && resource->fd >= 0
    && (expected_kind == DECKENT_NATIVE_HANDLE_ANY
      || resource->kind == expected_kind);
}

static uint32_t rights_for_kind(deckent_native_handle_kind kind) {
  switch (kind) {
    case DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY:
    case DECKENT_NATIVE_HANDLE_DIRECTORY:
      return DECKENT_NATIVE_RIGHT_TRAVERSE
        | DECKENT_NATIVE_RIGHT_IDENTITY
        | DECKENT_NATIVE_RIGHT_APPLY_PRIVATE
        | DECKENT_NATIVE_RIGHT_SYNC
        | DECKENT_NATIVE_RIGHT_PUBLISH;
    case DECKENT_NATIVE_HANDLE_READ_FILE:
      return DECKENT_NATIVE_RIGHT_READ | DECKENT_NATIVE_RIGHT_IDENTITY;
    case DECKENT_NATIVE_HANDLE_PUBLICATION:
      return DECKENT_NATIVE_RIGHT_APPEND
        | DECKENT_NATIVE_RIGHT_IDENTITY
        | DECKENT_NATIVE_RIGHT_APPLY_PRIVATE
        | DECKENT_NATIVE_RIGHT_SYNC
        | DECKENT_NATIVE_RIGHT_PUBLISH
        | DECKENT_NATIVE_RIGHT_ABORT;
    default:
      return DECKENT_NATIVE_RIGHT_NONE;
  }
}

static uint32_t base_evidence_for_kind(deckent_native_handle_kind kind) {
  uint32_t evidence = DECKENT_NATIVE_EVIDENCE_COMPONENT_NOFOLLOW
    | DECKENT_NATIVE_EVIDENCE_OWNER_PRIVATE
    | DECKENT_NATIVE_EVIDENCE_OBJECT_TYPE
    | DECKENT_NATIVE_EVIDENCE_OWNER_IDENTITY;
  if (kind == DECKENT_NATIVE_HANDLE_READ_FILE
      || kind == DECKENT_NATIVE_HANDLE_PUBLICATION) {
    evidence |= DECKENT_NATIVE_EVIDENCE_LINK_COUNT
      | DECKENT_NATIVE_EVIDENCE_SIZE;
  }
  return evidence;
}

static bool capture_identity(
  napi_env env,
  int fd,
  uint32_t evidence_bits,
  uint32_t capability_bits,
  deckent_posix_identity_snapshot *identity
) {
  struct stat status;
  memset(identity, 0, sizeof(*identity));
  if (fstat(fd, &status) != 0) {
    throw_errno_typed(env, errno);
    return false;
  }
#if defined(__linux__)
  {
    struct statx extended;
    struct statfs filesystem;
    dev_t extended_device;
    const unsigned int mask = STATX_BASIC_STATS | STATX_MNT_ID;
    memset(&extended, 0, sizeof(extended));
    if (statx(
          fd,
          "",
          AT_EMPTY_PATH | AT_NO_AUTOMOUNT | AT_SYMLINK_NOFOLLOW,
          mask,
          &extended
        ) != 0
        || (extended.stx_mask & mask) != mask) {
      throw_typed(
        env,
        DECKENT_NATIVE_ERROR_VOLUME_UNSUPPORTED,
        "Linux custody requires exact statx mount identity"
      );
      return false;
    }
    extended_device = makedev(extended.stx_dev_major, extended.stx_dev_minor);
    if (extended_device != status.st_dev
        || extended.stx_ino != (uint64_t)status.st_ino
        || extended.stx_size != (uint64_t)status.st_size
        || extended.stx_nlink != (uint32_t)status.st_nlink
        || extended.stx_uid != (uint32_t)status.st_uid
        || (extended.stx_mode & S_IFMT) != (status.st_mode & S_IFMT)
        || (extended.stx_mode & 07777u) != (status.st_mode & 07777u)) {
      throw_typed(
        env,
        DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
        "Linux custody identity sources did not agree"
      );
      return false;
    }
    if (fstatfs(fd, &filesystem) != 0) {
      throw_errno_typed(env, errno);
      return false;
    }
    identity->mount_id = extended.stx_mnt_id;
    identity->fs_magic = (uint64_t)(unsigned long)filesystem.f_type;
  }
#elif defined(__APPLE__)
  {
    struct statfs filesystem;
    if (fstatfs(fd, &filesystem) != 0) {
      throw_errno_typed(env, errno);
      return false;
    }
    if ((filesystem.f_flags & MNT_LOCAL) == 0) {
      throw_typed(
        env,
        DECKENT_NATIVE_ERROR_REMOTE_VOLUME_UNSUPPORTED,
        "Darwin custody requires an OS-confirmed local volume"
      );
      return false;
    }
    identity->mount_id =
      ((uint64_t)(uint32_t)filesystem.f_fsid.val[0] << 32)
      | (uint64_t)(uint32_t)filesystem.f_fsid.val[1];
    identity->fs_magic = 0u;
  }
#endif
  if (status.st_size < 0) {
    throw_typed(
      env,
      DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "POSIX custody identity contains an invalid signed field"
    );
    return false;
  }
  identity->status = status;
  identity->evidence_bits = evidence_bits;
  identity->capability_bits = capability_bits;
  return true;
}

static bool same_snapshot(
  const deckent_posix_identity_snapshot *left,
  const deckent_posix_identity_snapshot *right
) {
  if (left->status.st_dev != right->status.st_dev
      || left->status.st_ino != right->status.st_ino
      || left->status.st_mode != right->status.st_mode
      || left->status.st_uid != right->status.st_uid
      || left->status.st_gid != right->status.st_gid
      || left->status.st_nlink != right->status.st_nlink
      || left->status.st_size != right->status.st_size
      || left->mount_id != right->mount_id
      || left->fs_magic != right->fs_magic) return false;
#if defined(__linux__)
  return left->status.st_mtim.tv_sec == right->status.st_mtim.tv_sec
    && left->status.st_mtim.tv_nsec == right->status.st_mtim.tv_nsec
    && left->status.st_ctim.tv_sec == right->status.st_ctim.tv_sec
    && left->status.st_ctim.tv_nsec == right->status.st_ctim.tv_nsec;
#elif defined(__APPLE__)
  return left->status.st_mtimespec.tv_sec == right->status.st_mtimespec.tv_sec
    && left->status.st_mtimespec.tv_nsec == right->status.st_mtimespec.tv_nsec
    && left->status.st_ctimespec.tv_sec == right->status.st_ctimespec.tv_sec
    && left->status.st_ctimespec.tv_nsec == right->status.st_ctimespec.tv_nsec;
#endif
}

static bool same_mount(
  const deckent_posix_identity_snapshot *left,
  const deckent_posix_identity_snapshot *right
) {
  return left->status.st_dev == right->status.st_dev
    && left->mount_id == right->mount_id;
}

static bool validate_owner_private(
  napi_env env,
  const deckent_posix_identity_snapshot *identity,
  deckent_native_handle_kind kind,
  bool require_named_link
) {
  mode_t private_mode;
  if (kind == DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY
      || kind == DECKENT_NATIVE_HANDLE_DIRECTORY) {
    if (!S_ISDIR(identity->status.st_mode)) {
      throw_typed(
        env,
        DECKENT_NATIVE_ERROR_OBJECT_TYPE_MISMATCH,
        "POSIX custody expected a directory"
      );
      return false;
    }
    private_mode = 0700;
  } else {
    if (!S_ISREG(identity->status.st_mode)) {
      throw_typed(
        env,
        DECKENT_NATIVE_ERROR_OBJECT_TYPE_MISMATCH,
        "POSIX custody expected a regular file"
      );
      return false;
    }
    private_mode = identity->status.st_mode & 0200 ? 0600 : 0400;
    if ((identity->status.st_mode & 07777) != private_mode) {
      throw_typed(
        env,
        DECKENT_NATIVE_ERROR_PRIVACY_UNCONFIRMED,
        "POSIX custody regular-file mode is not owner-private"
      );
      return false;
    }
    if (require_named_link && identity->status.st_nlink != 1) {
      throw_typed(
        env,
        DECKENT_NATIVE_ERROR_LINK_COUNT_UNSAFE,
        "POSIX custody requires exactly one file link"
      );
      return false;
    }
    if (!require_named_link && identity->status.st_nlink != 0) {
      throw_typed(
        env,
        DECKENT_NATIVE_ERROR_LINK_COUNT_UNSAFE,
        "POSIX anonymous publication unexpectedly has a name"
      );
      return false;
    }
  }
  if (identity->status.st_uid != geteuid()) {
    throw_typed(
      env,
      DECKENT_NATIVE_ERROR_PRIVACY_UNCONFIRMED,
      "POSIX custody object owner is not the effective principal"
    );
    return false;
  }
  if ((kind == DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY
        || kind == DECKENT_NATIVE_HANDLE_DIRECTORY)
      && (identity->status.st_mode & 07777) != private_mode) {
    throw_typed(
      env,
      DECKENT_NATIVE_ERROR_PRIVACY_UNCONFIRMED,
      "POSIX custody directory mode is not owner-private"
    );
    return false;
  }
  return true;
}

static bool format_decimal(char *buffer, size_t capacity, uint64_t value) {
  int length = snprintf(buffer, capacity, "%" PRIu64, value);
  return length > 0 && (size_t)length < capacity;
}

static bool create_capabilities_array(
  napi_env env,
  uint32_t capability_bits,
  napi_value *array
) {
  static const struct {
    uint32_t bit;
    const char *name;
  } capabilities[] = {
    { DECKENT_POSIX_CAP_ANONYMOUS_TEMPFILE,
      DECKENT_CUSTODY_VOLUME_CAP_ANONYMOUS_TEMPFILE },
    { DECKENT_POSIX_CAP_DIRECTORY_DURABILITY,
      DECKENT_CUSTODY_VOLUME_CAP_DIRECTORY_DURABILITY },
    { DECKENT_POSIX_CAP_HARD_LINKS,
      DECKENT_CUSTODY_VOLUME_CAP_HARD_LINKS },
    { DECKENT_POSIX_CAP_NO_REPLACE_PUBLISH,
      DECKENT_CUSTODY_VOLUME_CAP_NO_REPLACE_PUBLISH },
    { DECKENT_POSIX_CAP_STABLE_OBJECT_ID,
      DECKENT_CUSTODY_VOLUME_CAP_STABLE_OBJECT_ID },
  };
  uint32_t count = 0u;
  uint32_t output_index = 0u;
  size_t index;
  napi_value value;
  for (index = 0u; index < sizeof(capabilities) / sizeof(capabilities[0]); index += 1u) {
    if ((capability_bits & capabilities[index].bit) != 0u) count += 1u;
  }
  if (napi_create_array_with_length(env, count, array) != napi_ok) {
    throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "POSIX custody capability array could not be created"
    );
    return false;
  }
  for (index = 0u; index < sizeof(capabilities) / sizeof(capabilities[0]); index += 1u) {
    if ((capability_bits & capabilities[index].bit) == 0u) continue;
    if (napi_create_string_utf8(
          env,
          capabilities[index].name,
          NAPI_AUTO_LENGTH,
          &value
        ) != napi_ok
        || !deckent_native_define_own_index(
          env,
          *array,
          output_index,
          value
        )) {
      throw_typed(
        env,
        "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
        "POSIX custody capability entry could not be created"
      );
      return false;
    }
    output_index += 1u;
  }
  return freeze_object(env, *array);
}

static bool create_identity_record(
  napi_env env,
  const deckent_posix_identity_snapshot *identity,
  napi_value *record
) {
  char size[32];
  char link_count[32];
  char device[32];
  char inode[32];
  char mount[64];
#if defined(__linux__)
  char magic[32];
#endif
  char mode[8];
  char owner[32];
  const char *object_type;
  napi_value capabilities;
  if (!format_decimal(size, sizeof(size), (uint64_t)identity->status.st_size)
      || !format_decimal(
        link_count,
        sizeof(link_count),
        (uint64_t)identity->status.st_nlink
      )
      || !format_decimal(device, sizeof(device), (uint64_t)identity->status.st_dev)
      || !format_decimal(inode, sizeof(inode), (uint64_t)identity->status.st_ino)
      || !format_decimal(owner, sizeof(owner), (uint64_t)identity->status.st_uid)) {
    throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "POSIX custody identity formatting failed"
    );
    return false;
  }
#if defined(__linux__)
  if (!format_decimal(mount, sizeof(mount), identity->mount_id)
      || snprintf(magic, sizeof(magic), "0x%" PRIx64, identity->fs_magic) <= 0) {
    throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "Linux custody mount identity formatting failed"
    );
    return false;
  }
#elif defined(__APPLE__)
  if (snprintf(
        mount,
        sizeof(mount),
        "fsid:0x%08" PRIx32 ":0x%08" PRIx32,
        (uint32_t)(identity->mount_id >> 32),
        (uint32_t)identity->mount_id
      ) <= 0) {
    throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "Darwin custody mount identity formatting failed"
    );
    return false;
  }
#endif
  if (snprintf(mode, sizeof(mode), "%04o", identity->status.st_mode & 0777) != 4) {
    throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "POSIX custody mode formatting failed"
    );
    return false;
  }
  object_type = S_ISDIR(identity->status.st_mode)
    ? "DIRECTORY"
    : (S_ISREG(identity->status.st_mode) ? "REGULAR_FILE" : "OTHER");
  if (napi_create_object(env, record) != napi_ok
      || !create_capabilities_array(env, identity->capability_bits, &capabilities)
      || !set_named_null(env, *record, "daclCanonicalHash")
      || !set_named_null(env, *record, "daclEntryCount")
      || !set_named_null(env, *record, "daclOwnerAllowMask")
      || !set_named_null(env, *record, "daclPresent")
      || !set_named_null(env, *record, "daclProtected")
      || !set_named_string(env, *record, "dev", device)
      || !set_named_uint32(
        env,
        *record,
        "featureEvidenceBits",
        identity->evidence_bits
      )
      || !set_named_null(env, *record, "fileId")
#if defined(__linux__)
      || !set_named_string(env, *record, "fsMagic", magic)
#elif defined(__APPLE__)
      || !set_named_null(env, *record, "fsMagic")
#endif
      || !set_named_string(env, *record, "ino", inode)
      || !set_named_string(env, *record, "kind", "custody-identity")
      || !set_named_string(env, *record, "linkCount", link_count)
      || !set_named_string(env, *record, "mntId", mount)
      || !set_named_string(env, *record, "mode", mode)
      || !set_named_string(env, *record, "objectType", object_type)
      || !set_named_null(env, *record, "ownerSid")
      || !set_named_string(env, *record, "ownerUid", owner)
#if defined(__linux__)
      || !set_named_string(env, *record, "platform", "linux")
#elif defined(__APPLE__)
      || !set_named_string(env, *record, "platform", "darwin")
#endif
      || !set_named_null(env, *record, "reparseTag")
      || !set_named_uint32(env, *record, "schemaVersion", 1u)
      || !set_named_string(env, *record, "size", size)
      || !set_named_value(env, *record, "volumeCapabilities", capabilities)
      || !set_named_null(env, *record, "volumeId")
      || !set_named_null(env, *record, "volumeRemote")) {
    return false;
  }
  return freeze_object(env, *record);
}

static bool capture_resource_identity(
  napi_env env,
  const deckent_posix_resource *resource,
  deckent_posix_identity_snapshot *identity
) {
  uint32_t current_evidence;
  const uint32_t persistent_evidence = resource == NULL
    ? 0u
    : resource->evidence_bits & (
      DECKENT_NATIVE_EVIDENCE_ANONYMOUS_TEMPFILE
      | DECKENT_NATIVE_EVIDENCE_ANONYMOUS_NO_REPLACE_PUBLISH
      | DECKENT_NATIVE_EVIDENCE_PUBLISH_AT_EMPTY_PATH
      | DECKENT_NATIVE_EVIDENCE_PUBLISH_PROC_FD_ALIAS
    );
  if (!valid_resource(resource, DECKENT_NATIVE_HANDLE_ANY)) {
    throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "POSIX custody resource is invalid"
    );
    return false;
  }
  current_evidence = base_evidence_for_kind(resource->kind)
    | persistent_evidence;
  if (!capture_identity(
        env,
        resource->fd,
        current_evidence,
        resource->capability_bits,
        identity
      )
      || !validate_owner_private(
        env,
        identity,
        resource->kind,
        resource->kind == DECKENT_NATIVE_HANDLE_READ_FILE
          || (resource->kind == DECKENT_NATIVE_HANDLE_PUBLICATION
            && resource->namespace_linked)
      )) return false;
  if (resource->durability_identity_valid
      && same_snapshot(&resource->durability_identity, identity)) {
    identity->evidence_bits |= resource->durability_evidence_bits;
  }
  return true;
}

static void clear_resource_durability(deckent_posix_resource *resource) {
  if (resource == NULL) return;
  memset(&resource->durability_identity, 0, sizeof(resource->durability_identity));
  resource->durability_evidence_bits = DECKENT_NATIVE_EVIDENCE_NONE;
  resource->durability_identity_valid = false;
  resource->evidence_bits &= ~(
    DECKENT_NATIVE_EVIDENCE_FILE_DURABILITY
    | DECKENT_NATIVE_EVIDENCE_DIRECTORY_DURABILITY
  );
}

static void record_resource_durability(
  deckent_posix_resource *resource,
  const deckent_posix_identity_snapshot *identity,
  uint32_t evidence_bits
) {
  if (resource == NULL || identity == NULL) return;
  resource->durability_identity = *identity;
  resource->durability_evidence_bits = evidence_bits & (
    DECKENT_NATIVE_EVIDENCE_FILE_DURABILITY
    | DECKENT_NATIVE_EVIDENCE_DIRECTORY_DURABILITY
  );
  resource->durability_identity_valid = true;
  resource->evidence_bits &= ~(
    DECKENT_NATIVE_EVIDENCE_FILE_DURABILITY
    | DECKENT_NATIVE_EVIDENCE_DIRECTORY_DURABILITY
  );
  resource->evidence_bits |= resource->durability_evidence_bits;
}

static bool sync_descriptor(int fd, bool is_directory) {
#if defined(__APPLE__)
  if (!is_directory && fcntl(fd, F_FULLFSYNC, 0) != 0) return false;
  if (is_directory && fsync(fd) != 0) return false;
  return true;
#else
  (void)is_directory;
  return fsync(fd) == 0;
#endif
}

static bool same_created_directory_identity(
  const struct stat *created,
  const struct stat *observed
) {
  return created != NULL
    && observed != NULL
    && S_ISDIR(created->st_mode)
    && S_ISDIR(observed->st_mode)
    && created->st_dev == observed->st_dev
    && created->st_ino == observed->st_ino
    && created->st_uid == observed->st_uid
    && created->st_gid == observed->st_gid
    && (created->st_mode & 07777) == (observed->st_mode & 07777);
}

static bool rollback_created_directory(
  int object_fd,
  int parent_fd,
  const char *name,
  const struct stat *created_identity
) {
  struct stat object_before;
  struct stat named_before;
  struct stat object_after;
  struct stat absent_probe;
  int absence_error;
  if (object_fd < 0
      || parent_fd < 0
      || !valid_component(name)
      || created_identity == NULL
      || fstat(object_fd, &object_before) != 0
      || !same_created_directory_identity(created_identity, &object_before)
      || fstatat(parent_fd, name, &named_before, AT_SYMLINK_NOFOLLOW) != 0
      || !same_created_directory_identity(created_identity, &named_before)
      || unlinkat(parent_fd, name, AT_REMOVEDIR) != 0
      || fstat(object_fd, &object_after) != 0
      || !same_created_directory_identity(created_identity, &object_after)
      || object_after.st_nlink != 0) {
    return false;
  }
  errno = 0;
  if (fstatat(parent_fd, name, &absent_probe, AT_SYMLINK_NOFOLLOW) == 0) {
    return false;
  }
  absence_error = errno;
  if (absence_error != ENOENT || !sync_descriptor(parent_fd, true)) return false;
  return true;
}

static void initialize_named_create_guard(
  deckent_posix_named_create_guard *guard
) {
  memset(guard, 0, sizeof(*guard));
  guard->object_fd = -1;
  guard->parent_fd = -1;
}

static bool arm_named_create_guard(
  const deckent_posix_resource *resource,
  const char *name,
  const struct stat *created_identity,
  deckent_posix_named_create_guard *guard,
  bool *partial_cleanup_confirmed
) {
  initialize_named_create_guard(guard);
  *partial_cleanup_confirmed = true;
  if (!valid_resource(resource, DECKENT_NATIVE_HANDLE_ANY)
      || resource->parent_fd < 0
      || !valid_component(name)
      || created_identity == NULL) return false;
  guard->object_fd = fcntl(resource->fd, F_DUPFD_CLOEXEC, 3);
  if (guard->object_fd >= 0) {
    guard->parent_fd = fcntl(resource->parent_fd, F_DUPFD_CLOEXEC, 3);
  }
  if (guard->object_fd >= 0 && guard->parent_fd >= 0) {
    guard->name = strdup(name);
  }
  if (guard->object_fd < 0 || guard->parent_fd < 0 || guard->name == NULL) {
    *partial_cleanup_confirmed = close_owned_pair(
      &guard->object_fd,
      &guard->parent_fd
    );
    free(guard->name);
    guard->name = NULL;
    return false;
  }
  guard->created_identity = *created_identity;
  guard->active = true;
  return true;
}

static bool release_named_create_guard(
  deckent_posix_named_create_guard *guard
) {
  bool closed;
  if (guard == NULL || !guard->active) return true;
  closed = close_owned_pair(&guard->object_fd, &guard->parent_fd);
  free(guard->name);
  guard->name = NULL;
  guard->active = false;
  return closed;
}

static bool rollback_named_create_guard(
  deckent_posix_named_create_guard *guard
) {
  bool rolled_back;
  bool closed;
  if (guard == NULL || !guard->active) return false;
  rolled_back = rollback_created_directory(
    guard->object_fd,
    guard->parent_fd,
    guard->name,
    &guard->created_identity
  );
  closed = release_named_create_guard(guard);
  return rolled_back && closed;
}

static deckent_native_created_guard_result resolve_named_create_guard(
  uintptr_t opaque_guard,
  bool accept
) {
  deckent_posix_named_create_guard *guard =
    (deckent_posix_named_create_guard *)opaque_guard;
  bool confirmed;
  if (guard == NULL || !guard->active) {
    return DECKENT_NATIVE_CREATED_GUARD_INVALID;
  }
  confirmed = accept
    ? release_named_create_guard(guard)
    : rollback_named_create_guard(guard);
  free(guard);
  if (!confirmed) return DECKENT_NATIVE_CREATED_GUARD_UNCONFIRMED;
  return accept
    ? DECKENT_NATIVE_CREATED_GUARD_ACCEPTED
    : DECKENT_NATIVE_CREATED_GUARD_ROLLED_BACK;
}

static napi_value finish_open_failure(
  napi_env env,
  bool created,
  int *object_fd,
  int *parent_fd,
  const char *created_name,
  const struct stat *created_identity,
  const char *fallback_code,
  const char *fallback_message
) {
  napi_value saved = take_pending_exception(env);
  bool rolled_back = !created;
  bool closed;
  if (created) {
    rolled_back = rollback_created_directory(
      object_fd == NULL ? -1 : *object_fd,
      parent_fd == NULL ? -1 : *parent_fd,
      created_name,
      created_identity
    );
  }
  closed = close_owned_pair(object_fd, parent_fd);
  if (created && (!rolled_back || !closed)) {
    return throw_typed(
      env,
      DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
      "POSIX custody named-create rollback was not confirmed"
    );
  }
  if (!created && !closed) {
    return throw_typed(
      env,
      DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
      "POSIX custody open failure cleanup was not confirmed"
    );
  }
  return restore_pending_or_throw(
    env,
    saved,
    fallback_code,
    fallback_message
  );
}

static bool sync_object_and_parent(
  napi_env env,
  const deckent_posix_resource *resource,
  bool object_is_directory,
  bool sync_parent
) {
  if (!sync_descriptor(resource->fd, object_is_directory)
      || (sync_parent
        && resource->parent_fd >= 0
        && !sync_descriptor(resource->parent_fd, true))) {
    throw_typed(
      env,
      DECKENT_NATIVE_ERROR_DURABILITY_UNCONFIRMED,
      "POSIX custody durability could not be confirmed"
    );
    return false;
  }
  return true;
}

static bool duplicate_parent_resource(
  napi_env env,
  deckent_native_state *state,
  napi_value parent_handle,
  uint32_t required_rights,
  int *parent_fd,
  uint64_t *parent_generation,
  deckent_posix_identity_snapshot *parent_identity
) {
  deckent_native_borrow borrow;
  deckent_posix_resource *parent;
  int duplicate;
  int saved_error;
  bool captured;
  bool duplicate_closed;
  deckent_posix_identity_snapshot source_identity;
  memset(&borrow, 0, sizeof(borrow));
  if (!deckent_native_borrow_handle(
        env,
        state,
        parent_handle,
        DECKENT_NATIVE_HANDLE_ANY,
        required_rights,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &borrow
      )) return false;
  parent = (deckent_posix_resource *)borrow.resource;
  if (!valid_resource(parent, DECKENT_NATIVE_HANDLE_ANY)
      || (parent->kind != DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY
        && parent->kind != DECKENT_NATIVE_HANDLE_DIRECTORY)) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "invalid parent borrow could not be released"
    );
    throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_KIND",
      "POSIX custody parent must be a pinned directory"
    );
    return false;
  }
  duplicate = fcntl(parent->fd, F_DUPFD_CLOEXEC, 3);
  if (duplicate < 0) {
    saved_error = errno;
    end_borrow_or_fatal(
      env,
      &borrow,
      "parent duplication borrow could not be released"
    );
    throw_errno_typed(env, saved_error);
    return false;
  }
  captured = capture_resource_identity(env, parent, &source_identity)
    && capture_identity(
      env,
      duplicate,
      source_identity.evidence_bits,
      source_identity.capability_bits,
      parent_identity
    )
    && validate_owner_private(env, parent_identity, parent->kind, false)
    && same_snapshot(&source_identity, parent_identity);
  *parent_generation = borrow.generation;
  if (!deckent_native_end_borrow(env, &borrow)) {
    duplicate_closed = close_owned_fd(&duplicate);
    if (!duplicate_closed) {
      throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "POSIX custody parent duplicate cleanup was not confirmed"
      );
    }
    return false;
  }
  if (!captured) {
    napi_value saved = take_pending_exception(env);
    duplicate_closed = close_owned_fd(&duplicate);
    if (!duplicate_closed) {
      throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "POSIX custody rejected parent duplicate cleanup was not confirmed"
      );
      return false;
    }
    restore_pending_or_throw(
      env,
      saved,
      DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "POSIX custody parent identity changed while duplicating authority"
    );
    return false;
  }
  *parent_fd = duplicate;
  return true;
}

static int open_existing_directory_at(int parent_fd, const char *name) {
  return openat(
    parent_fd,
    name,
    O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC
  );
}

typedef enum deckent_posix_root_walk_result {
  DECKENT_POSIX_ROOT_WALK_ERROR = 0,
  DECKENT_POSIX_ROOT_WALK_DISJOINT = 1,
  DECKENT_POSIX_ROOT_WALK_OVERLAP = 2,
  DECKENT_POSIX_ROOT_WALK_UNCONFIRMED = 3,
} deckent_posix_root_walk_result;

static bool close_root_walk_descriptors(
  napi_env env,
  int *current_fd,
  int *parent_fd,
  const char *message
) {
  if (close_owned_pair(current_fd, parent_fd)) return true;
  throw_typed(
    env,
    DECKENT_NATIVE_ERROR_ROOT_SEPARATION_UNCONFIRMED,
    message
  );
  return false;
}

static bool same_physical_directory(
  const deckent_posix_identity_snapshot *left,
  const deckent_posix_identity_snapshot *right
) {
  return left->status.st_dev == right->status.st_dev
    && left->status.st_ino == right->status.st_ino;
}

static bool same_exact_directory(
  const deckent_posix_identity_snapshot *left,
  const deckent_posix_identity_snapshot *right
) {
  return same_physical_directory(left, right)
    && left->mount_id == right->mount_id;
}

static bool mount_alias_is_ambiguous(
  const deckent_posix_identity_snapshot *left,
  const deckent_posix_identity_snapshot *right
) {
  return same_physical_directory(left, right)
    && left->mount_id != right->mount_id;
}

static bool capture_unprivileged_directory_identity(
  napi_env env,
  int fd,
  deckent_posix_identity_snapshot *identity
) {
  const uint32_t evidence = DECKENT_NATIVE_EVIDENCE_COMPONENT_NOFOLLOW
    | DECKENT_NATIVE_EVIDENCE_OBJECT_TYPE;
  if (!capture_identity(
        env,
        fd,
        evidence,
        DECKENT_POSIX_CAP_STABLE_OBJECT_ID,
        identity
      )) return false;
  if (!S_ISDIR(identity->status.st_mode)) {
    throw_typed(
      env,
      DECKENT_NATIVE_ERROR_OBJECT_TYPE_MISMATCH,
      "POSIX project root must be a directory"
    );
    return false;
  }
  return true;
}

static bool open_canonical_project_directory(
  napi_env env,
  char *path,
  int *project_fd
) {
  char *cursor;
  char *separator;
  int current_fd = -1;
  int next_fd = -1;
  if (!valid_ingress_path(path)) {
    throw_typed(
      env,
      DECKENT_NATIVE_ERROR_INVALID_COMPONENT,
      "POSIX project root path is not a canonical absolute component walk"
    );
    return false;
  }
  current_fd = open("/", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (current_fd < 0) {
    throw_errno_typed(env, errno);
    return false;
  }
  if (path[1] == '\0') {
    *project_fd = current_fd;
    return true;
  }
  cursor = path + 1;
  for (;;) {
    separator = strchr(cursor, '/');
    if (separator != NULL) *separator = '\0';
    next_fd = open_existing_directory_at(current_fd, cursor);
    if (separator != NULL) *separator = '/';
    if (next_fd < 0) {
      int saved_error = errno;
      if (!close_owned_fd(&current_fd)) {
        throw_typed(
          env,
          DECKENT_NATIVE_ERROR_ROOT_SEPARATION_UNCONFIRMED,
          "POSIX project root walk cleanup was not confirmed"
        );
        return false;
      }
      throw_errno_typed(env, saved_error);
      return false;
    }
    if (!close_owned_fd(&current_fd)) {
      (void)close_owned_fd(&next_fd);
      throw_typed(
        env,
        DECKENT_NATIVE_ERROR_ROOT_SEPARATION_UNCONFIRMED,
        "POSIX project root descriptor transition was not confirmed"
      );
      return false;
    }
    current_fd = next_fd;
    next_fd = -1;
    if (separator == NULL) break;
    cursor = separator + 1;
  }
  *project_fd = current_fd;
  return true;
}

static deckent_posix_root_walk_result walk_to_namespace_root(
  napi_env env,
  int start_fd,
  const deckent_posix_identity_snapshot *other_start,
  deckent_posix_identity_snapshot *namespace_root
) {
  int current_fd = -1;
  int parent_fd = -1;
  uint32_t step;
  deckent_posix_identity_snapshot current;
  deckent_posix_identity_snapshot parent;
  current_fd = fcntl(start_fd, F_DUPFD_CLOEXEC, 3);
  if (current_fd < 0) {
    throw_typed(
      env,
      DECKENT_NATIVE_ERROR_ROOT_SEPARATION_UNCONFIRMED,
      "POSIX root walk could not retain its starting authority"
    );
    return DECKENT_POSIX_ROOT_WALK_ERROR;
  }
  for (step = 0u; step < DECKENT_POSIX_MAX_PARENT_WALK_STEPS; step += 1u) {
    if (!capture_unprivileged_directory_identity(env, current_fd, &current)) {
      napi_value saved = take_pending_exception(env);
      if (!close_root_walk_descriptors(
            env,
            &current_fd,
            &parent_fd,
            "POSIX root walk identity cleanup was not confirmed"
          )) return DECKENT_POSIX_ROOT_WALK_ERROR;
      (void)restore_pending_or_throw(
        env,
        saved,
        DECKENT_NATIVE_ERROR_ROOT_SEPARATION_UNCONFIRMED,
        "POSIX root walk identity could not be confirmed"
      );
      return DECKENT_POSIX_ROOT_WALK_ERROR;
    }
    if (same_exact_directory(&current, other_start)) {
      if (!close_root_walk_descriptors(
            env,
            &current_fd,
            &parent_fd,
            "POSIX overlap proof cleanup was not confirmed"
          )) return DECKENT_POSIX_ROOT_WALK_ERROR;
      return DECKENT_POSIX_ROOT_WALK_OVERLAP;
    }
    if (mount_alias_is_ambiguous(&current, other_start)) {
      if (!close_root_walk_descriptors(
            env,
            &current_fd,
            &parent_fd,
            "POSIX mount-alias proof cleanup was not confirmed"
          )) return DECKENT_POSIX_ROOT_WALK_ERROR;
      return DECKENT_POSIX_ROOT_WALK_UNCONFIRMED;
    }
    parent_fd = openat(
      current_fd,
      "..",
      O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC
    );
    if (parent_fd < 0
        || !capture_unprivileged_directory_identity(env, parent_fd, &parent)) {
      napi_value saved = take_pending_exception(env);
      if (!close_root_walk_descriptors(
            env,
            &current_fd,
            &parent_fd,
            "POSIX root parent-walk cleanup was not confirmed"
          )) return DECKENT_POSIX_ROOT_WALK_ERROR;
      (void)restore_pending_or_throw(
        env,
        saved,
        DECKENT_NATIVE_ERROR_ROOT_SEPARATION_UNCONFIRMED,
        "POSIX root parent walk could not be confirmed"
      );
      return DECKENT_POSIX_ROOT_WALK_ERROR;
    }
    if (same_physical_directory(&current, &parent)) {
      bool root_exact = same_exact_directory(&current, &parent);
      if (!close_root_walk_descriptors(
            env,
            &current_fd,
            &parent_fd,
            "POSIX namespace-root proof cleanup was not confirmed"
          )) return DECKENT_POSIX_ROOT_WALK_ERROR;
      if (!root_exact) return DECKENT_POSIX_ROOT_WALK_UNCONFIRMED;
      *namespace_root = current;
      return DECKENT_POSIX_ROOT_WALK_DISJOINT;
    }
    if (mount_alias_is_ambiguous(&current, &parent)) {
      if (!close_root_walk_descriptors(
            env,
            &current_fd,
            &parent_fd,
            "POSIX mount-transition cleanup was not confirmed"
          )) return DECKENT_POSIX_ROOT_WALK_ERROR;
      return DECKENT_POSIX_ROOT_WALK_UNCONFIRMED;
    }
    if (!close_owned_fd(&current_fd)) {
      bool parent_closed = close_owned_fd(&parent_fd);
      throw_typed(
        env,
        DECKENT_NATIVE_ERROR_ROOT_SEPARATION_UNCONFIRMED,
        parent_closed
          ? "POSIX root walk descriptor cleanup was not confirmed"
          : "POSIX root walk descriptor-pair cleanup was not confirmed"
      );
      return DECKENT_POSIX_ROOT_WALK_ERROR;
    }
    current_fd = parent_fd;
    parent_fd = -1;
  }
  if (!close_root_walk_descriptors(
        env,
        &current_fd,
        &parent_fd,
        "POSIX finite root-walk cleanup was not confirmed"
      )) return DECKENT_POSIX_ROOT_WALK_ERROR;
  throw_typed(
    env,
    DECKENT_NATIVE_ERROR_ROOT_SEPARATION_UNCONFIRMED,
    "POSIX root walk exceeded its finite bound"
  );
  return DECKENT_POSIX_ROOT_WALK_ERROR;
}

static napi_value finish_root_separation_failure(
  napi_env env,
  deckent_native_borrow *custody_borrow,
  int *project_fd,
  const char *code,
  const char *message
) {
  napi_value saved = take_pending_exception(env);
  bool project_closed = close_owned_fd(project_fd);
  end_borrow_or_fatal(
    env,
    custody_borrow,
    "root-separation failure borrow could not be released"
  );
  if (!project_closed) {
    return throw_typed(
      env,
      DECKENT_NATIVE_ERROR_ROOT_SEPARATION_UNCONFIRMED,
      "POSIX project root cleanup was not confirmed"
    );
  }
  if (code != NULL) return throw_typed(env, code, message);
  return restore_pending_or_throw(
    env,
    saved,
    DECKENT_NATIVE_ERROR_ROOT_SEPARATION_UNCONFIRMED,
    "POSIX root separation could not be confirmed"
  );
}

static napi_value invoke_prove_root_separation(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value custody_handle;
  napi_value custody_identity_record;
  napi_value project_identity_record;
  napi_value result;
  char *project_path = NULL;
  int project_fd = -1;
  deckent_native_borrow custody_borrow;
  deckent_posix_resource *custody_resource;
  deckent_posix_identity_snapshot custody_before;
  deckent_posix_identity_snapshot custody_after;
  deckent_posix_identity_snapshot project_before;
  deckent_posix_identity_snapshot project_after;
  deckent_posix_identity_snapshot custody_namespace_root;
  deckent_posix_identity_snapshot project_namespace_root;
  deckent_posix_root_walk_result project_walk;
  deckent_posix_root_walk_result custody_walk;
  const uint32_t proof_evidence = DECKENT_NATIVE_EVIDENCE_COMPONENT_NOFOLLOW
    | DECKENT_NATIVE_EVIDENCE_OBJECT_TYPE
    | DECKENT_NATIVE_EVIDENCE_ROOT_SEPARATION;
  memset(&custody_borrow, 0, sizeof(custody_borrow));
  if (!get_exact_input(
        env,
        state,
        DECKENT_CUSTODY_OPERATION_PROVE_ROOT_SEPARATION,
        argc,
        argv,
        &input
      )
      || !get_named_value(env, input, "custodyRoot", &custody_handle)
      || !get_named_string_alloc(
        env,
        input,
        "canonicalProjectRoot",
        DECKENT_POSIX_MAX_INGRESS_PATH_BYTES,
        &project_path
      )) {
    free(project_path);
    return NULL;
  }
  if (!valid_ingress_path(project_path)) {
    free(project_path);
    return throw_typed(
      env,
      DECKENT_NATIVE_ERROR_INVALID_COMPONENT,
      "POSIX project root path is not canonical"
    );
  }
  if (!deckent_native_borrow_handle(
        env,
        state,
        custody_handle,
        DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY,
        DECKENT_NATIVE_RIGHT_TRAVERSE | DECKENT_NATIVE_RIGHT_IDENTITY,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &custody_borrow
      )) {
    free(project_path);
    return NULL;
  }
  custody_resource = (deckent_posix_resource *)custody_borrow.resource;
  if (!valid_resource(
        custody_resource,
        DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY
      )
      || !capture_resource_identity(env, custody_resource, &custody_before)
      || !validate_owner_private(
        env,
        &custody_before,
        DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY,
        false
      )
      || !open_canonical_project_directory(env, project_path, &project_fd)
      || !capture_unprivileged_directory_identity(
        env,
        project_fd,
        &project_before
      )) {
    free(project_path);
    return finish_root_separation_failure(
      env,
      &custody_borrow,
      &project_fd,
      NULL,
      NULL
    );
  }
  free(project_path);
  project_path = NULL;

  project_walk = walk_to_namespace_root(
    env,
    project_fd,
    &custody_before,
    &project_namespace_root
  );
  if (project_walk == DECKENT_POSIX_ROOT_WALK_OVERLAP) {
    return finish_root_separation_failure(
      env,
      &custody_borrow,
      &project_fd,
      DECKENT_NATIVE_ERROR_ROOT_OVERLAP,
      "POSIX custody root contains the project root"
    );
  }
  if (project_walk == DECKENT_POSIX_ROOT_WALK_ERROR) {
    return finish_root_separation_failure(
      env,
      &custody_borrow,
      &project_fd,
      NULL,
      NULL
    );
  }
  if (project_walk != DECKENT_POSIX_ROOT_WALK_DISJOINT) {
    return finish_root_separation_failure(
      env,
      &custody_borrow,
      &project_fd,
      DECKENT_NATIVE_ERROR_ROOT_SEPARATION_UNCONFIRMED,
      "POSIX project ancestry or mount alias was not confirmable"
    );
  }
  custody_walk = walk_to_namespace_root(
    env,
    custody_resource->fd,
    &project_before,
    &custody_namespace_root
  );
  if (custody_walk == DECKENT_POSIX_ROOT_WALK_OVERLAP) {
    return finish_root_separation_failure(
      env,
      &custody_borrow,
      &project_fd,
      DECKENT_NATIVE_ERROR_ROOT_OVERLAP,
      "POSIX project root contains the custody root"
    );
  }
  if (custody_walk == DECKENT_POSIX_ROOT_WALK_ERROR) {
    return finish_root_separation_failure(
      env,
      &custody_borrow,
      &project_fd,
      NULL,
      NULL
    );
  }
  if (custody_walk != DECKENT_POSIX_ROOT_WALK_DISJOINT) {
    return finish_root_separation_failure(
      env,
      &custody_borrow,
      &project_fd,
      DECKENT_NATIVE_ERROR_ROOT_SEPARATION_UNCONFIRMED,
      "POSIX custody ancestry or mount alias was not confirmable"
    );
  }
  if (!same_exact_directory(
        &custody_namespace_root,
        &project_namespace_root
      )
      || mount_alias_is_ambiguous(&custody_before, &project_before)
      || !capture_resource_identity(env, custody_resource, &custody_after)
      || !capture_unprivileged_directory_identity(
        env,
        project_fd,
        &project_after
      )
      || !same_snapshot(&custody_before, &custody_after)
      || !same_snapshot(&project_before, &project_after)) {
    clear_pending_exception(env);
    return finish_root_separation_failure(
      env,
      &custody_borrow,
      &project_fd,
      DECKENT_NATIVE_ERROR_ROOT_SEPARATION_UNCONFIRMED,
      "POSIX root separation identity was not stable"
    );
  }
  if (!close_owned_fd(&project_fd)) {
    return finish_root_separation_failure(
      env,
      &custody_borrow,
      &project_fd,
      DECKENT_NATIVE_ERROR_ROOT_SEPARATION_UNCONFIRMED,
      "POSIX project root cleanup was not confirmed"
    );
  }
  if (!create_identity_record(env, &custody_after, &custody_identity_record)
      || !create_identity_record(env, &project_after, &project_identity_record)) {
    return finish_root_separation_failure(
      env,
      &custody_borrow,
      &project_fd,
      NULL,
      NULL
    );
  }
  result = deckent_native_create_result_record(env);
  if (result == NULL
      || !set_named_value(
        env,
        result,
        "custodyIdentity",
        custody_identity_record
      )
      || !set_named_uint32(
        env,
        result,
        "featureEvidenceBits",
        proof_evidence
      )
      || !set_named_string(env, result, "kind", "custody-root-separation")
      || !set_named_value(
        env,
        result,
        "projectIdentity",
        project_identity_record
      )
      || !set_named_uint32(env, result, "schemaVersion", 1u)
      || !set_named_string(env, result, "state", "CONFIRMED")
      || !deckent_native_finalize_result_record(
        env,
        result,
        DECKENT_CUSTODY_OPERATION_PROVE_ROOT_SEPARATION
      )) {
    return finish_root_separation_failure(
      env,
      &custody_borrow,
      &project_fd,
      NULL,
      NULL
    );
  }
  if (!deckent_native_end_borrow(env, &custody_borrow)) return NULL;
  return result;
}

static bool open_directory_component(
  napi_env env,
  int parent_fd,
  const char *name,
  deckent_posix_disposition disposition,
  int *opened_fd,
  bool *created
) {
  int fd;
  int saved_error;
  *created = false;
  if (disposition == DECKENT_POSIX_OPEN_EXISTING) {
    fd = open_existing_directory_at(parent_fd, name);
    if (fd < 0) {
      throw_errno_typed(env, errno);
      return false;
    }
    *opened_fd = fd;
    return true;
  }
  if (disposition == DECKENT_POSIX_CREATE_NEW) {
    if (mkdirat(parent_fd, name, 0700) != 0) {
      throw_errno_typed(env, errno);
      return false;
    }
    *created = true;
    fd = open_existing_directory_at(parent_fd, name);
    if (fd < 0) {
      throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
        "POSIX custody created directory could not be rebound safely"
      );
      return false;
    }
    *opened_fd = fd;
    return true;
  }
  fd = open_existing_directory_at(parent_fd, name);
  if (fd >= 0) {
    *opened_fd = fd;
    return true;
  }
  saved_error = errno;
  if (saved_error != ENOENT) {
    throw_errno_typed(env, saved_error);
    return false;
  }
  if (mkdirat(parent_fd, name, 0700) == 0) {
    *created = true;
    fd = open_existing_directory_at(parent_fd, name);
    if (fd < 0) {
      throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
        "POSIX custody created directory could not be rebound safely"
      );
      return false;
    }
    *opened_fd = fd;
    return true;
  }
  saved_error = errno;
  if (saved_error != EEXIST) {
    throw_errno_typed(env, saved_error);
    return false;
  }
  fd = open_existing_directory_at(parent_fd, name);
  if (fd < 0) {
    throw_errno_typed(env, errno);
    return false;
  }
  *opened_fd = fd;
  return true;
}

static deckent_native_retire_result retire_returned_handle(
  napi_env env,
  deckent_native_state *state,
  napi_value handle,
  deckent_native_handle_kind kind
) {
  clear_pending_exception(env);
  deckent_native_retire_result retired = deckent_native_retire_handle(
    env,
    state,
    handle,
    kind,
    rights_for_kind(kind),
    DECKENT_NATIVE_HANDLE_STATE_OPEN
  );
  clear_pending_exception(env);
  return retired;
}

static napi_value return_open_result(
  napi_env env,
  deckent_native_state *state,
  deckent_custody_operation operation,
  deckent_posix_resource *resource,
  bool created,
  const char *created_name,
  const struct stat *created_identity
) {
  deckent_posix_identity_snapshot identity;
  napi_value identity_record;
  napi_value result;
  napi_value handle;
  napi_value saved;
  deckent_native_handle_kind kind = resource->kind;
  deckent_native_retire_result cleanup;
  deckent_posix_named_create_guard *guard = NULL;
  bool guard_partial_cleanup = true;
  bool rolled_back;
  bool resource_closed;
  if (created) {
    resource->target_name = strdup(created_name);
    if (resource->target_name == NULL) {
      rolled_back = rollback_created_directory(
        resource->fd,
        resource->parent_fd,
        created_name,
        created_identity
      );
      resource_closed = close_posix_resource((uintptr_t)resource) == 0;
      if (!rolled_back || !resource_closed) {
        return throw_typed(
          env,
          DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
          "POSIX custody create identity retention was not confirmed"
        );
      }
      return throw_typed(
        env,
        "E_EXEC_AUTH_NATIVE_ALLOCATION",
        "POSIX custody create identity retention allocation failed"
      );
    }
    resource->named_create_identity = *created_identity;
    resource->named_create_identity_valid = true;
    guard = (deckent_posix_named_create_guard *)calloc(1u, sizeof(*guard));
    if (guard == NULL) {
      rolled_back = rollback_created_directory(
        resource->fd,
        resource->parent_fd,
        created_name,
        created_identity
      );
      resource_closed = close_posix_resource((uintptr_t)resource) == 0;
      if (!rolled_back || !resource_closed) {
        return throw_typed(
          env,
          DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
          "POSIX custody create guard allocation cleanup was not confirmed"
        );
      }
      return throw_typed(
        env,
        "E_EXEC_AUTH_NATIVE_ALLOCATION",
        "POSIX custody create guard allocation failed"
      );
    }
  }
  if (created && !arm_named_create_guard(
        resource,
        created_name,
        created_identity,
        guard,
        &guard_partial_cleanup
      )) {
    rolled_back = rollback_created_directory(
      resource->fd,
      resource->parent_fd,
      created_name,
      created_identity
    );
    resource_closed = close_posix_resource((uintptr_t)resource) == 0;
    free(guard);
    guard = NULL;
    if (!rolled_back || !resource_closed || !guard_partial_cleanup) {
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
        "POSIX custody create rollback authority was not retained"
      );
    }
    return throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "POSIX custody create rollback authority allocation failed"
    );
  }
  if (!capture_resource_identity(env, resource, &identity)
      || !validate_owner_private(
        env,
        &identity,
        kind,
        kind == DECKENT_NATIVE_HANDLE_READ_FILE
      )
      || (created && !same_created_directory_identity(
        created_identity,
        &identity.status
      ))) {
    saved = take_pending_exception(env);
    rolled_back = !created || rollback_named_create_guard(guard);
    free(guard);
    guard = NULL;
    resource_closed = close_posix_resource((uintptr_t)resource) == 0;
    if (created && (!rolled_back || !resource_closed)) {
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
        "POSIX custody named-create verification was not confirmed"
      );
    }
    if (!created && !resource_closed) {
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "POSIX custody rejected open resource cleanup was not confirmed"
      );
    }
    return restore_pending_or_throw(
      env,
      saved,
      DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "POSIX custody open identity verification failed"
    );
  }
  result = deckent_native_create_result_record(env);
  if (result == NULL || !create_identity_record(env, &identity, &identity_record)) {
    saved = take_pending_exception(env);
    rolled_back = !created || rollback_named_create_guard(guard);
    free(guard);
    guard = NULL;
    resource_closed = close_posix_resource((uintptr_t)resource) == 0;
    if (created && (!rolled_back || !resource_closed)) {
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
        "POSIX custody named-create result was not accepted"
      );
    }
    if (!created && !resource_closed) {
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "POSIX custody rejected open result cleanup was not confirmed"
      );
    }
    return restore_pending_or_throw(
      env,
      saved,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "POSIX custody open result construction failed"
    );
  }
  handle = deckent_native_create_handle(
    env,
    state,
    kind,
    rights_for_kind(kind),
    (uintptr_t)resource,
    close_posix_resource
  );
  if (handle == NULL) {
    saved = take_pending_exception(env);
    rolled_back = !created || rollback_named_create_guard(guard);
    free(guard);
    guard = NULL;
    if (created && !rolled_back) {
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
        "POSIX custody named-create handle exposure was not confirmed"
      );
    }
    return restore_pending_or_throw(
      env,
      saved,
      "E_EXEC_AUTH_NATIVE_HANDLE_CREATE",
      "POSIX custody open handle creation failed"
    );
  }
  if (!set_named_value(env, result, "handle", handle)
      || !set_named_value(env, result, "identity", identity_record)
      || !set_named_string(env, result, "kind", "custody-open")
      || !set_named_uint32(env, result, "schemaVersion", 1u)
      || !set_named_string(
        env,
        result,
        "state",
        created ? "CREATED" : "OPENED"
      )) {
    saved = take_pending_exception(env);
    rolled_back = !created || rollback_named_create_guard(guard);
    free(guard);
    guard = NULL;
    cleanup = retire_returned_handle(env, state, handle, kind);
    if (created && (!rolled_back || cleanup != DECKENT_NATIVE_RETIRE_CONFIRMED)) {
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
        "POSIX custody named-create result finalization was not confirmed"
      );
    }
    if (cleanup != DECKENT_NATIVE_RETIRE_CONFIRMED) {
      return throw_typed(
        env,
        "E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED",
        "POSIX custody rejected open handle cleanup was not confirmed"
      );
    }
    return restore_pending_or_throw(
      env,
      saved,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "POSIX custody open result could not be finalized"
    );
  }
  if (created && !deckent_native_bind_created_result_guard(
        env,
        state,
        result,
        operation,
        handle,
        (uintptr_t)guard,
        resolve_named_create_guard
      )) {
    saved = take_pending_exception(env);
    rolled_back = rollback_named_create_guard(guard);
    free(guard);
    guard = NULL;
    cleanup = retire_returned_handle(env, state, handle, kind);
    if (!rolled_back || cleanup != DECKENT_NATIVE_RETIRE_CONFIRMED) {
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
        "POSIX custody created-result guard binding cleanup was not confirmed"
      );
    }
    return restore_pending_or_throw(
      env,
      saved,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "POSIX custody created-result guard could not be bound"
    );
  }
  if (created) guard = NULL;
  if (!deckent_native_finalize_result_record(env, result, operation)) {
    if (created) {
      /* Common boundary owns the guard and will rollback before rethrow. */
      return NULL;
    }
    saved = take_pending_exception(env);
    cleanup = retire_returned_handle(env, state, handle, kind);
    if (cleanup != DECKENT_NATIVE_RETIRE_CONFIRMED) {
      return throw_typed(
        env,
        "E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED",
        "POSIX custody rejected open handle cleanup was not confirmed"
      );
    }
    return restore_pending_or_throw(
      env,
      saved,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "POSIX custody open result could not be finalized"
    );
  }
  return result;
}

static napi_value invoke_open_root(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  deckent_posix_disposition disposition;
  char *path = NULL;
  char *cursor;
  char *separator;
  int current_fd = -1;
  int next_fd = -1;
  int parent_fd = -1;
  bool created = false;
  deckent_posix_identity_snapshot identity;
  struct stat created_identity;
  deckent_posix_resource *resource;
  napi_value open_result;
  if (!get_exact_input(
        env,
        state,
        DECKENT_CUSTODY_OPERATION_OPEN_ROOT,
        argc,
        argv,
        &input
      )
      || !get_named_string_alloc(
        env,
        input,
        "path",
        DECKENT_POSIX_MAX_INGRESS_PATH_BYTES,
        &path
      )
      || !get_named_disposition(env, input, &disposition)
      || !get_named_exact_string(
        env,
        input,
        "privacyPolicy",
        DECKENT_CUSTODY_PRIVACY_OWNER_PRIVATE
      )) {
    free(path);
    return NULL;
  }
  if (!valid_ingress_path(path)) {
    free(path);
    return throw_typed(
      env,
      DECKENT_NATIVE_ERROR_INVALID_COMPONENT,
      "POSIX custody root path is not a canonical absolute component walk"
    );
  }
  current_fd = open(
    "/",
    O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC
  );
  if (current_fd < 0) {
    free(path);
    return throw_errno_typed(env, errno);
  }
  if (path[1] == '\0') {
    if (disposition == DECKENT_POSIX_CREATE_NEW) {
      bool closed = close_owned_fd(&current_fd);
      free(path);
      if (!closed) {
        return throw_typed(
          env,
          DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
          "POSIX custody root ingress cleanup was not confirmed"
        );
      }
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_ALREADY_EXISTS,
        "POSIX custody root path already exists"
      );
    }
    resource = create_resource(
      DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY,
      current_fd,
      -1,
      0u,
      base_evidence_for_kind(DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY),
      DECKENT_POSIX_CAP_STABLE_OBJECT_ID
    );
    free(path);
    if (resource == NULL) {
      if (!close_owned_fd(&current_fd)) {
        return throw_typed(
          env,
          DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
          "POSIX custody root allocation cleanup was not confirmed"
        );
      }
      return throw_typed(
        env,
        "E_EXEC_AUTH_NATIVE_ALLOCATION",
        "POSIX custody root resource allocation failed"
      );
    }
    return return_open_result(
      env,
      state,
      DECKENT_CUSTODY_OPERATION_OPEN_ROOT,
      resource,
      false,
      NULL,
      NULL
    );
  }
  cursor = path + 1;
  for (;;) {
    separator = strchr(cursor, '/');
    if (separator != NULL) *separator = '\0';
    if (separator != NULL) {
      next_fd = open_existing_directory_at(current_fd, cursor);
      if (next_fd < 0) {
        int saved_error = errno;
        bool closed = close_owned_fd(&current_fd);
        free(path);
        if (!closed) {
          return throw_typed(
            env,
            DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
            "POSIX custody root walk cleanup was not confirmed"
          );
        }
        return throw_errno_typed(env, saved_error);
      }
      if (!close_owned_fd(&current_fd)) {
        bool next_closed = close_owned_fd(&next_fd);
        free(path);
        if (!next_closed) {
          return throw_typed(
            env,
            DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
            "POSIX custody root walk descriptor cleanup was not confirmed"
          );
        }
        return throw_typed(
          env,
          DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
          "POSIX custody root walk descriptor transition was not confirmed"
        );
      }
      current_fd = next_fd;
      next_fd = -1;
      cursor = separator + 1;
      continue;
    }
    parent_fd = current_fd;
    current_fd = -1;
    if (!open_directory_component(
          env,
          parent_fd,
          cursor,
          disposition,
          &next_fd,
          &created
        )) {
      bool parent_closed = close_owned_fd(&parent_fd);
      free(path);
      if (!parent_closed || created) {
        return throw_typed(
          env,
          created
            ? DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED
            : DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
          "POSIX custody final root component cleanup was not confirmed"
        );
      }
      return NULL;
    }
    break;
  }
  if (created && fstat(next_fd, &created_identity) != 0) {
    open_result = finish_open_failure(
      env,
      true,
      &next_fd,
      &parent_fd,
      cursor,
      NULL,
      DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "POSIX custody created root identity was not captured"
    );
    free(path);
    return open_result;
  }
  if (!capture_identity(
        env,
        next_fd,
        base_evidence_for_kind(DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY),
        DECKENT_POSIX_CAP_STABLE_OBJECT_ID,
        &identity
      )
      || !validate_owner_private(
        env,
        &identity,
        DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY,
        false
      )
      || (created
        && (!sync_descriptor(next_fd, true)
          || !sync_descriptor(parent_fd, true)))) {
    open_result = finish_open_failure(
      env,
      created,
      &next_fd,
      &parent_fd,
      created ? cursor : NULL,
      created ? &created_identity : NULL,
      DECKENT_NATIVE_ERROR_DURABILITY_UNCONFIRMED,
      "POSIX custody root create/open verification failed"
    );
    free(path);
    return open_result;
  }
  resource = create_resource(
    DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY,
    next_fd,
    parent_fd,
    0u,
    base_evidence_for_kind(DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY),
    DECKENT_POSIX_CAP_STABLE_OBJECT_ID
      | (created ? DECKENT_POSIX_CAP_DIRECTORY_DURABILITY : 0u)
  );
  if (resource == NULL) {
    open_result = finish_open_failure(
      env,
      created,
      &next_fd,
      &parent_fd,
      created ? cursor : NULL,
      created ? &created_identity : NULL,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "POSIX custody root resource allocation failed"
    );
    free(path);
    return open_result;
  }
  if (created) {
    record_resource_durability(
      resource,
      &identity,
      DECKENT_NATIVE_EVIDENCE_DIRECTORY_DURABILITY
    );
  }
  open_result = return_open_result(
    env,
    state,
    DECKENT_CUSTODY_OPERATION_OPEN_ROOT,
    resource,
    created,
    created ? cursor : NULL,
    created ? &created_identity : NULL
  );
  free(path);
  return open_result;
}

static napi_value invoke_open_directory_at(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value parent_handle;
  deckent_posix_disposition disposition;
  char *name = NULL;
  int parent_fd = -1;
  int child_fd = -1;
  uint64_t parent_generation = 0u;
  bool created = false;
  bool child_captured;
  bool mount_matches;
  deckent_posix_identity_snapshot parent_identity;
  deckent_posix_identity_snapshot child_identity;
  struct stat created_identity;
  deckent_posix_resource *resource;
  napi_value open_result;
  if (!get_exact_input(
        env,
        state,
        DECKENT_CUSTODY_OPERATION_OPEN_DIRECTORY_AT,
        argc,
        argv,
        &input
      )
      || !get_named_value(env, input, "parent", &parent_handle)
      || !get_named_component(env, input, "name", &name)
      || !get_named_disposition(env, input, &disposition)
      || !get_named_exact_string(
        env,
        input,
        "privacyPolicy",
        DECKENT_CUSTODY_PRIVACY_OWNER_PRIVATE
      )) {
    free(name);
    return NULL;
  }
  if (!duplicate_parent_resource(
        env,
        state,
        parent_handle,
        DECKENT_NATIVE_RIGHT_TRAVERSE,
        &parent_fd,
        &parent_generation,
        &parent_identity
      )) {
    free(name);
    return NULL;
  }
  if (!open_directory_component(
        env,
        parent_fd,
        name,
        disposition,
        &child_fd,
        &created
      )) {
    bool parent_closed = close_owned_fd(&parent_fd);
    free(name);
    if (!parent_closed || created) {
      return throw_typed(
        env,
        created
          ? DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED
          : DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "POSIX custody directory-open failure cleanup was not confirmed"
      );
    }
    return NULL;
  }
  if (created && fstat(child_fd, &created_identity) != 0) {
    open_result = finish_open_failure(
      env,
      true,
      &child_fd,
      &parent_fd,
      name,
      NULL,
      DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "POSIX custody created directory identity was not captured"
    );
    free(name);
    return open_result;
  }
  child_captured = capture_identity(
    env,
    child_fd,
    base_evidence_for_kind(DECKENT_NATIVE_HANDLE_DIRECTORY),
    DECKENT_POSIX_CAP_STABLE_OBJECT_ID,
    &child_identity
  );
  mount_matches = child_captured && same_mount(&parent_identity, &child_identity);
  if (!child_captured
      || !mount_matches
      || !validate_owner_private(
        env,
        &child_identity,
        DECKENT_NATIVE_HANDLE_DIRECTORY,
        false
      )
      || (created
        && (!sync_descriptor(child_fd, true)
          || !sync_descriptor(parent_fd, true)))) {
    open_result = finish_open_failure(
      env,
      created,
      &child_fd,
      &parent_fd,
      created ? name : NULL,
      created ? &created_identity : NULL,
      child_captured && !mount_matches
        ? DECKENT_NATIVE_ERROR_VOLUME_UNSUPPORTED
        : DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      child_captured && !mount_matches
        ? "POSIX custody child crossed the pinned parent mount"
        : "POSIX custody child create/open verification failed"
    );
    free(name);
    return open_result;
  }
  resource = create_resource(
    DECKENT_NATIVE_HANDLE_DIRECTORY,
    child_fd,
    parent_fd,
    parent_generation,
    base_evidence_for_kind(DECKENT_NATIVE_HANDLE_DIRECTORY)
      | (created ? DECKENT_NATIVE_EVIDENCE_DIRECTORY_DURABILITY : 0u),
    DECKENT_POSIX_CAP_STABLE_OBJECT_ID
      | (created ? DECKENT_POSIX_CAP_DIRECTORY_DURABILITY : 0u)
  );
  if (resource == NULL) {
    open_result = finish_open_failure(
      env,
      created,
      &child_fd,
      &parent_fd,
      created ? name : NULL,
      created ? &created_identity : NULL,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "POSIX custody directory resource allocation failed"
    );
    free(name);
    return open_result;
  }
  if (created) {
    record_resource_durability(
      resource,
      &child_identity,
      DECKENT_NATIVE_EVIDENCE_DIRECTORY_DURABILITY
    );
  }
  open_result = return_open_result(
    env,
    state,
    DECKENT_CUSTODY_OPERATION_OPEN_DIRECTORY_AT,
    resource,
    created,
    created ? name : NULL,
    created ? &created_identity : NULL
  );
  free(name);
  return open_result;
}

static napi_value invoke_open_file_at(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value parent_handle;
  deckent_posix_disposition disposition = 0;
  char *name = NULL;
  int parent_fd = -1;
  int file_fd = -1;
  uint64_t parent_generation = 0u;
  deckent_posix_identity_snapshot parent_identity;
  deckent_posix_identity_snapshot file_identity;
  deckent_posix_resource *resource;
  bool file_captured;
  bool mount_matches;
  if (!get_exact_input(
        env,
        state,
        DECKENT_CUSTODY_OPERATION_OPEN_FILE_AT,
        argc,
        argv,
        &input
      )
      || !get_named_value(env, input, "parent", &parent_handle)
      || !get_named_component(env, input, "name", &name)
      || !get_named_disposition(env, input, &disposition)
      || !get_named_exact_string(
        env,
        input,
        "privacyPolicy",
        DECKENT_CUSTODY_PRIVACY_OWNER_PRIVATE
      )) {
    free(name);
    return NULL;
  }
  if (disposition != DECKENT_POSIX_OPEN_EXISTING) {
    free(name);
    return throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "POSIX custody file open is existing-only"
    );
  }
  if (!duplicate_parent_resource(
        env,
        state,
        parent_handle,
        DECKENT_NATIVE_RIGHT_TRAVERSE,
        &parent_fd,
        &parent_generation,
        &parent_identity
      )) {
    free(name);
    return NULL;
  }
  file_fd = openat(
    parent_fd,
    name,
    O_RDONLY | O_NONBLOCK | O_NOFOLLOW | O_CLOEXEC
  );
  free(name);
  if (file_fd < 0) {
    int saved_error = errno;
    bool parent_closed = close_owned_fd(&parent_fd);
    if (!parent_closed) {
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "POSIX custody rejected file parent cleanup was not confirmed"
      );
    }
    return throw_errno_typed(env, saved_error);
  }
  file_captured = capture_identity(
    env,
    file_fd,
    base_evidence_for_kind(DECKENT_NATIVE_HANDLE_READ_FILE),
    DECKENT_POSIX_CAP_STABLE_OBJECT_ID,
    &file_identity
  );
  mount_matches = file_captured && same_mount(&parent_identity, &file_identity);
  if (!file_captured
      || !mount_matches
      || !validate_owner_private(
        env,
        &file_identity,
        DECKENT_NATIVE_HANDLE_READ_FILE,
        true
      )) {
    napi_value saved = take_pending_exception(env);
    bool closed = close_owned_pair(&file_fd, &parent_fd);
    if (!closed) {
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "POSIX custody rejected file cleanup was not confirmed"
      );
    }
    if (file_captured && !mount_matches) {
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_VOLUME_UNSUPPORTED,
        "POSIX custody file crossed the pinned parent mount"
      );
    }
    return restore_pending_or_throw(
      env,
      saved,
      DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "POSIX custody file identity validation failed"
    );
  }
  resource = create_resource(
    DECKENT_NATIVE_HANDLE_READ_FILE,
    file_fd,
    parent_fd,
    parent_generation,
    base_evidence_for_kind(DECKENT_NATIVE_HANDLE_READ_FILE),
    DECKENT_POSIX_CAP_STABLE_OBJECT_ID
  );
  if (resource == NULL) {
    if (!close_owned_pair(&file_fd, &parent_fd)) {
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "POSIX custody file allocation cleanup was not confirmed"
      );
    }
    return throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "POSIX custody file resource allocation failed"
    );
  }
  return return_open_result(
    env,
    state,
    DECKENT_CUSTODY_OPERATION_OPEN_FILE_AT,
    resource,
    false,
    NULL,
    NULL
  );
}

static bool copy_identity_fields(
  napi_env env,
  napi_value source,
  napi_value target
) {
  static const char *const keys[] = {
    "daclCanonicalHash",
    "daclEntryCount",
    "daclOwnerAllowMask",
    "daclPresent",
    "daclProtected",
    "dev",
    "featureEvidenceBits",
    "fileId",
    "fsMagic",
    "ino",
    "kind",
    "linkCount",
    "mntId",
    "mode",
    "objectType",
    "ownerSid",
    "ownerUid",
    "platform",
    "reparseTag",
    "schemaVersion",
    "size",
    "volumeCapabilities",
    "volumeId",
    "volumeRemote",
  };
  size_t index;
  napi_value value;
  for (index = 0u; index < sizeof(keys) / sizeof(keys[0]); index += 1u) {
    if (!deckent_native_get_own_value(env, source, keys[index], &value)
        || !set_named_value(env, target, keys[index], value)) return false;
  }
  return true;
}

static napi_value invoke_identity(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value handle;
  napi_value nested;
  napi_value result;
  deckent_native_borrow borrow;
  deckent_posix_resource *resource;
  deckent_posix_identity_snapshot identity;
  memset(&borrow, 0, sizeof(borrow));
  if (!get_exact_input(
        env,
        state,
        DECKENT_CUSTODY_OPERATION_IDENTITY,
        argc,
        argv,
        &input
      )
      || !get_named_value(env, input, "handle", &handle)
      || !deckent_native_borrow_handle(
        env,
        state,
        handle,
        DECKENT_NATIVE_HANDLE_ANY,
        DECKENT_NATIVE_RIGHT_IDENTITY,
        DECKENT_NATIVE_HANDLE_STATE_OPEN
          | DECKENT_NATIVE_HANDLE_STATE_PUBLISHED_UNCONFIRMED
          | DECKENT_NATIVE_HANDLE_STATE_APPEND_FAILED,
        &borrow
      )) return NULL;
  resource = (deckent_posix_resource *)borrow.resource;
  if (!capture_resource_identity(env, resource, &identity)
      || !create_identity_record(env, &identity, &nested)) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "identity failure borrow could not be released"
    );
    return NULL;
  }
  result = deckent_native_create_result_record(env);
  if (result == NULL
      || !copy_identity_fields(env, nested, result)
      || !deckent_native_finalize_result_record(
        env,
        result,
        DECKENT_CUSTODY_OPERATION_IDENTITY
      )) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "identity result borrow could not be released"
    );
    return NULL;
  }
  if (!deckent_native_end_borrow(env, &borrow)) return NULL;
  return result;
}

static napi_value create_probe_result(
  napi_env env,
  const deckent_posix_identity_snapshot *identity,
  bool available,
  uint32_t evidence_bits
) {
  napi_value result;
  napi_value identity_record;
  if (!create_identity_record(env, identity, &identity_record)) return NULL;
  result = deckent_native_create_result_record(env);
  if (result == NULL
      || !set_named_boolean(env, result, "available", available)
      || !set_named_uint32(
        env,
        result,
        "featureEvidenceBits",
        evidence_bits
      )
      || !set_named_value(env, result, "identity", identity_record)
      || !set_named_string(env, result, "kind", "custody-probe")
#if defined(__linux__)
      || !set_named_string(env, result, "platform", "linux")
#elif defined(__APPLE__)
      || !set_named_string(env, result, "platform", "darwin")
#endif
      || !set_named_uint32(env, result, "schemaVersion", 1u)
      || !deckent_native_finalize_result_record(
        env,
        result,
        DECKENT_CUSTODY_OPERATION_PROBE
      )) return NULL;
  return result;
}

static napi_value invoke_probe(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value handle;
  deckent_native_borrow borrow;
  deckent_posix_resource *resource;
  deckent_posix_identity_snapshot identity;
  uint32_t evidence_bits;
  uint32_t capability_bits;
  bool available = false;
#if defined(__linux__)
  int temporary_fd;
#endif
  napi_value result;
  memset(&borrow, 0, sizeof(borrow));
  if (!get_exact_input(
        env,
        state,
        DECKENT_CUSTODY_OPERATION_PROBE,
        argc,
        argv,
        &input
      )
      || !get_named_value(env, input, "handle", &handle)
      || !deckent_native_borrow_handle(
        env,
        state,
        handle,
        DECKENT_NATIVE_HANDLE_ANY,
        DECKENT_NATIVE_RIGHT_PUBLISH | DECKENT_NATIVE_RIGHT_IDENTITY,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &borrow
      )) return NULL;
  resource = (deckent_posix_resource *)borrow.resource;
  if (!valid_resource(resource, DECKENT_NATIVE_HANDLE_ANY)
      || (resource->kind != DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY
        && resource->kind != DECKENT_NATIVE_HANDLE_DIRECTORY)) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "invalid probe borrow could not be released"
    );
    return throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_KIND",
      "POSIX custody probe requires a directory handle"
    );
  }
  if (!capture_resource_identity(env, resource, &identity)) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "probe identity borrow could not be released"
    );
    return NULL;
  }
  evidence_bits = identity.evidence_bits;
  capability_bits = resource->capability_bits;
#if defined(__linux__)
  temporary_fd = openat(
    resource->fd,
    ".",
    O_TMPFILE | O_RDWR | O_CLOEXEC,
    0600
  );
  if (temporary_fd >= 0) {
    deckent_posix_identity_snapshot temporary_identity;
    if (!capture_identity(
          env,
          temporary_fd,
          base_evidence_for_kind(DECKENT_NATIVE_HANDLE_PUBLICATION)
            | DECKENT_NATIVE_EVIDENCE_ANONYMOUS_TEMPFILE,
          DECKENT_POSIX_CAP_STABLE_OBJECT_ID
            | DECKENT_POSIX_CAP_ANONYMOUS_TEMPFILE,
          &temporary_identity
        )
        || !same_mount(&identity, &temporary_identity)
        || !validate_owner_private(
          env,
          &temporary_identity,
          DECKENT_NATIVE_HANDLE_PUBLICATION,
          false
        )) {
      napi_value saved = take_pending_exception(env);
      bool temporary_closed = close_owned_fd(&temporary_fd);
      end_borrow_or_fatal(
        env,
        &borrow,
        "anonymous probe failure borrow could not be released"
      );
      if (!temporary_closed) {
        return throw_typed(
          env,
          DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
          "POSIX custody rejected anonymous probe cleanup was not confirmed"
        );
      }
      return restore_pending_or_throw(
        env,
        saved,
        DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
        "POSIX custody anonymous probe identity was not confirmed"
      );
    }
    if (!close_owned_fd(&temporary_fd)) {
      end_borrow_or_fatal(
        env,
        &borrow,
        "anonymous probe cleanup borrow could not be released"
      );
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "POSIX custody anonymous probe cleanup was not confirmed"
      );
    }
    available = true;
    evidence_bits |= DECKENT_NATIVE_EVIDENCE_ANONYMOUS_TEMPFILE;
    capability_bits |= DECKENT_POSIX_CAP_ANONYMOUS_TEMPFILE;
  }
#endif
  if (!capture_resource_identity(env, resource, &identity)) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "probe completion borrow could not be released"
    );
    return NULL;
  }
  identity.evidence_bits |= evidence_bits
    & DECKENT_NATIVE_EVIDENCE_ANONYMOUS_TEMPFILE;
  identity.capability_bits |= capability_bits
    & DECKENT_POSIX_CAP_ANONYMOUS_TEMPFILE;
  evidence_bits = identity.evidence_bits;
  result = create_probe_result(env, &identity, available, evidence_bits);
  if (!deckent_native_end_borrow(env, &borrow)) return NULL;
  return result;
}

static napi_value create_evidence_result(
  napi_env env,
  deckent_custody_operation operation,
  const char *operation_name,
  uint32_t evidence_bits
) {
  napi_value result = deckent_native_create_result_record(env);
  if (result == NULL
      || !set_named_uint32(
        env,
        result,
        "featureEvidenceBits",
        evidence_bits
      )
      || !set_named_string(env, result, "kind", "custody-evidence")
      || !set_named_string(env, result, "operation", operation_name)
      || !set_named_uint32(env, result, "schemaVersion", 1u)
      || !set_named_string(env, result, "state", "CONFIRMED")
      || !deckent_native_finalize_result_record(env, result, operation)) return NULL;
  return result;
}

static napi_value invoke_apply_private(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value handle;
  napi_value result;
  deckent_native_borrow borrow;
  deckent_posix_resource *resource;
  deckent_posix_identity_snapshot identity;
  mode_t mode;
  memset(&borrow, 0, sizeof(borrow));
  if (!get_exact_input(
        env,
        state,
        DECKENT_CUSTODY_OPERATION_APPLY_PRIVATE,
        argc,
        argv,
        &input
      )
      || !get_named_value(env, input, "handle", &handle)
      || !deckent_native_borrow_handle(
        env,
        state,
        handle,
        DECKENT_NATIVE_HANDLE_ANY,
        DECKENT_NATIVE_RIGHT_APPLY_PRIVATE,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &borrow
      )) return NULL;
  resource = (deckent_posix_resource *)borrow.resource;
  if (!valid_resource(resource, DECKENT_NATIVE_HANDLE_ANY)
      || (resource->kind != DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY
        && resource->kind != DECKENT_NATIVE_HANDLE_DIRECTORY
        && resource->kind != DECKENT_NATIVE_HANDLE_PUBLICATION)) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "invalid privacy borrow could not be released"
    );
    return throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_KIND",
      "POSIX custody privacy operation received an invalid handle kind"
    );
  }
  mode = resource->kind == DECKENT_NATIVE_HANDLE_PUBLICATION ? 0600 : 0700;
  clear_resource_durability(resource);
  if (fchmod(resource->fd, mode) != 0
      || !capture_resource_identity(env, resource, &identity)
      ) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "privacy failure borrow could not be released"
    );
    return throw_typed(
      env,
      DECKENT_NATIVE_ERROR_PRIVACY_UNCONFIRMED,
      "POSIX custody privacy readback was not confirmed"
    );
  }
  result = create_evidence_result(
    env,
    DECKENT_CUSTODY_OPERATION_APPLY_PRIVATE,
    "APPLY_PRIVATE",
    identity.evidence_bits
  );
  if (!deckent_native_end_borrow(env, &borrow)) return NULL;
  return result;
}

static napi_value invoke_sync(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value handle;
  napi_value result;
  deckent_native_borrow borrow;
  deckent_posix_resource *resource;
  deckent_posix_identity_snapshot before;
  deckent_posix_identity_snapshot after;
  deckent_posix_identity_snapshot parent_before;
  deckent_posix_identity_snapshot parent_after;
  uint32_t durability_evidence;
  bool is_directory;
  bool has_parent;
  memset(&borrow, 0, sizeof(borrow));
  if (!get_exact_input(
        env,
        state,
        DECKENT_CUSTODY_OPERATION_SYNC,
        argc,
        argv,
        &input
      )
      || !get_named_value(env, input, "handle", &handle)
      || !deckent_native_borrow_handle(
        env,
        state,
        handle,
        DECKENT_NATIVE_HANDLE_ANY,
        DECKENT_NATIVE_RIGHT_SYNC,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &borrow
      )) return NULL;
  resource = (deckent_posix_resource *)borrow.resource;
  if (!valid_resource(resource, DECKENT_NATIVE_HANDLE_ANY)
      || (resource->kind != DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY
        && resource->kind != DECKENT_NATIVE_HANDLE_DIRECTORY
        && resource->kind != DECKENT_NATIVE_HANDLE_PUBLICATION)) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "invalid sync borrow could not be released"
    );
    return throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_KIND",
      "POSIX custody sync received an invalid handle kind"
    );
  }
  is_directory = resource->kind != DECKENT_NATIVE_HANDLE_PUBLICATION;
  /*
   * A custody root is the admitted trust boundary. Its retained traversal
   * parent can legitimately be shared (for example /tmp) and is outside the
   * root's owner-private authority. Root-content durability therefore fsyncs
   * the pinned root itself; child directories and publications still bind and
   * sync their in-boundary parent.
   */
  has_parent = resource->parent_fd >= 0
    && resource->kind != DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY;
  if (!capture_resource_identity(env, resource, &before)
      || (has_parent
        && (!capture_identity(
          env,
          resource->parent_fd,
          base_evidence_for_kind(DECKENT_NATIVE_HANDLE_DIRECTORY),
          resource->capability_bits,
          &parent_before
        )
          || !validate_owner_private(
            env,
            &parent_before,
            DECKENT_NATIVE_HANDLE_DIRECTORY,
            false
          )
          || !same_mount(&before, &parent_before)))
      || !sync_object_and_parent(env, resource, is_directory, has_parent)
      || !capture_resource_identity(env, resource, &after)
      || !same_snapshot(&before, &after)
      || (has_parent
        && (!capture_identity(
          env,
          resource->parent_fd,
          base_evidence_for_kind(DECKENT_NATIVE_HANDLE_DIRECTORY),
          resource->capability_bits,
          &parent_after
        )
          || !validate_owner_private(
            env,
            &parent_after,
            DECKENT_NATIVE_HANDLE_DIRECTORY,
            false
          )
          || !same_snapshot(&parent_before, &parent_after)
          || !same_mount(&after, &parent_after)))) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "durability failure borrow could not be released"
    );
    return throw_typed(
      env,
      DECKENT_NATIVE_ERROR_DURABILITY_UNCONFIRMED,
      "POSIX custody durability identity was not stable"
    );
  }
  durability_evidence = is_directory
    ? DECKENT_NATIVE_EVIDENCE_DIRECTORY_DURABILITY
    : DECKENT_NATIVE_EVIDENCE_FILE_DURABILITY
      | DECKENT_NATIVE_EVIDENCE_DIRECTORY_DURABILITY;
  record_resource_durability(resource, &after, durability_evidence);
  after.evidence_bits |= durability_evidence;
  resource->capability_bits |= DECKENT_POSIX_CAP_DIRECTORY_DURABILITY;
  result = create_evidence_result(
    env,
    DECKENT_CUSTODY_OPERATION_SYNC,
    "SYNC",
    after.evidence_bits
  );
  if (!deckent_native_end_borrow(env, &borrow)) return NULL;
  return result;
}

static napi_value invoke_begin_publication(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value parent_handle;
  char *name = NULL;
  uint64_t max_bytes;
#if defined(__linux__)
  int parent_fd = -1;
  int staging_fd = -1;
  uint64_t parent_generation = 0u;
  deckent_posix_identity_snapshot parent_identity;
  deckent_posix_identity_snapshot staging_identity;
  deckent_posix_resource *resource;
  napi_value handle;
#endif
  if (!get_exact_input(
        env,
        state,
        DECKENT_CUSTODY_OPERATION_BEGIN_PUBLICATION,
        argc,
        argv,
        &input
      )
      || !get_named_value(env, input, "parent", &parent_handle)
      || !get_named_component(env, input, "name", &name)
      || !get_named_safe_positive_u64(
        env,
        input,
        "maxBytes",
        DECKENT_POSIX_MAX_PUBLICATION_BYTES,
        &max_bytes
      )) {
    free(name);
    return NULL;
  }
#if defined(__APPLE__)
  (void)state;
  (void)parent_handle;
  (void)max_bytes;
  free(name);
  return throw_typed(
    env,
    DECKENT_NATIVE_ERROR_VOLUME_UNSUPPORTED,
    "Darwin custody has no proven anonymous no-replace publication primitive"
  );
#elif defined(__linux__)
  if (!duplicate_parent_resource(
        env,
        state,
        parent_handle,
        DECKENT_NATIVE_RIGHT_PUBLISH,
        &parent_fd,
        &parent_generation,
        &parent_identity
      )) {
    free(name);
    return NULL;
  }
  staging_fd = openat(
    parent_fd,
    ".",
    O_TMPFILE | O_RDWR | O_CLOEXEC,
    0600
  );
  if (staging_fd < 0) {
    int saved_error = errno;
    bool parent_closed = close_owned_fd(&parent_fd);
    free(name);
    if (!parent_closed) {
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "Linux custody rejected publication parent cleanup was not confirmed"
      );
    }
    if (saved_error == EOPNOTSUPP
        || saved_error == ENOTSUP
        || saved_error == EISDIR
        || saved_error == EINVAL
        || saved_error == ENOSYS) {
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_VOLUME_UNSUPPORTED,
        "Linux custody anonymous temporary files are unavailable on this mount"
      );
    }
    return throw_errno_typed(env, saved_error);
  }
  if (!capture_identity(
        env,
        staging_fd,
        base_evidence_for_kind(DECKENT_NATIVE_HANDLE_PUBLICATION)
          | DECKENT_NATIVE_EVIDENCE_ANONYMOUS_TEMPFILE,
        DECKENT_POSIX_CAP_STABLE_OBJECT_ID
          | DECKENT_POSIX_CAP_ANONYMOUS_TEMPFILE,
        &staging_identity
      )
      || !same_mount(&parent_identity, &staging_identity)
      || !validate_owner_private(
        env,
        &staging_identity,
        DECKENT_NATIVE_HANDLE_PUBLICATION,
        false
      )) {
    napi_value saved = take_pending_exception(env);
    bool closed = close_owned_pair(&staging_fd, &parent_fd);
    free(name);
    if (!closed) {
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "Linux custody rejected staging cleanup was not confirmed"
      );
    }
    return restore_pending_or_throw(
      env,
      saved,
      DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "Linux custody staging identity validation failed"
    );
  }
  resource = create_resource(
    DECKENT_NATIVE_HANDLE_PUBLICATION,
    staging_fd,
    parent_fd,
    parent_generation,
    base_evidence_for_kind(DECKENT_NATIVE_HANDLE_PUBLICATION)
      | DECKENT_NATIVE_EVIDENCE_ANONYMOUS_TEMPFILE,
    DECKENT_POSIX_CAP_STABLE_OBJECT_ID
      | DECKENT_POSIX_CAP_ANONYMOUS_TEMPFILE
  );
  if (resource == NULL) {
    bool closed = close_owned_pair(&staging_fd, &parent_fd);
    free(name);
    if (!closed) {
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "Linux custody publication allocation cleanup was not confirmed"
      );
    }
    return throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "Linux custody publication resource allocation failed"
    );
  }
  resource->target_name = name;
  resource->max_bytes = max_bytes;
  resource->length = 0u;
  resource->anonymous_publication = true;
  handle = deckent_native_create_handle(
    env,
    state,
    DECKENT_NATIVE_HANDLE_PUBLICATION,
    rights_for_kind(DECKENT_NATIVE_HANDLE_PUBLICATION),
    (uintptr_t)resource,
    close_posix_resource
  );
  return handle;
#endif
}

static napi_value create_append_result(napi_env env, size_t byte_length) {
  napi_value result = deckent_native_create_result_record(env);
  if (result == NULL
      || !set_named_double(env, result, "byteLength", (double)byte_length)
      || !set_named_string(env, result, "kind", "custody-append")
      || !set_named_uint32(env, result, "schemaVersion", 1u)
      || !set_named_string(env, result, "state", "APPENDED")
      || !deckent_native_finalize_result_record(
        env,
        result,
        DECKENT_CUSTODY_OPERATION_APPEND_PUBLICATION
      )) return NULL;
  return result;
}

static void mark_append_failed_or_fatal(
  napi_env env,
  deckent_native_state *state,
  napi_value publication_handle
) {
  if (deckent_native_mark_append_failed(
        env,
        state,
        publication_handle
      )) return;
  napi_fatal_error(
    "deckent.exec-authority",
    NAPI_AUTO_LENGTH,
    "uncertain append could not be bound to APPEND_FAILED state",
    NAPI_AUTO_LENGTH
  );
}

static void wipe_and_free_bytes(unsigned char **bytes, size_t length) {
  volatile unsigned char *cursor;
  size_t index;
  if (bytes == NULL || *bytes == NULL) return;
  cursor = (volatile unsigned char *)*bytes;
  for (index = 0u; index < length; index += 1u) cursor[index] = 0u;
  free(*bytes);
  *bytes = NULL;
}

static napi_value invoke_append_publication(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value publication_handle;
  napi_value bytes_value;
  napi_value array_buffer;
  napi_value result;
  napi_typedarray_type array_type;
  size_t byte_length = 0u;
  size_t byte_offset = 0u;
  void *bytes = NULL;
  unsigned char *owned_bytes = NULL;
  bool is_array_buffer = false;
  bool detached = false;
  deckent_native_borrow borrow;
  deckent_posix_resource *resource;
  deckent_posix_identity_snapshot current_identity;
  size_t written = 0u;
  memset(&borrow, 0, sizeof(borrow));
  if (!get_exact_input(
        env,
        state,
        DECKENT_CUSTODY_OPERATION_APPEND_PUBLICATION,
        argc,
        argv,
        &input
      )
      || !get_named_value(env, input, "publication", &publication_handle)
      || !get_named_value(env, input, "bytes", &bytes_value)
      || napi_get_typedarray_info(
        env,
        bytes_value,
        &array_type,
        &byte_length,
        &bytes,
        &array_buffer,
        &byte_offset
      ) != napi_ok
      || array_type != napi_uint8_array
      || byte_length > DECKENT_POSIX_MAX_PUBLICATION_BYTES
      || napi_is_arraybuffer(env, array_buffer, &is_array_buffer) != napi_ok
      || !is_array_buffer
      || napi_is_detached_arraybuffer(env, array_buffer, &detached) != napi_ok
      || detached
      || (byte_length > 0u && bytes == NULL)) {
    return throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "POSIX custody append requires a bounded Uint8Array"
    );
  }
  (void)byte_offset;
  if (byte_length > 0u) {
    owned_bytes = (unsigned char *)malloc(byte_length);
    if (owned_bytes == NULL) {
      return throw_typed(
        env,
        "E_EXEC_AUTH_NATIVE_ALLOCATION",
        "POSIX custody append byte snapshot allocation failed"
      );
    }
    memcpy(owned_bytes, bytes, byte_length);
  }
  if (!deckent_native_borrow_handle(
        env,
        state,
        publication_handle,
        DECKENT_NATIVE_HANDLE_PUBLICATION,
        DECKENT_NATIVE_RIGHT_APPEND,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &borrow
      )) {
    wipe_and_free_bytes(&owned_bytes, byte_length);
    return NULL;
  }
  resource = (deckent_posix_resource *)borrow.resource;
  if (!valid_resource(resource, DECKENT_NATIVE_HANDLE_PUBLICATION)
      || !resource->anonymous_publication
      || !capture_resource_identity(env, resource, &current_identity)
      || resource->length > resource->max_bytes
      || (uint64_t)byte_length > resource->max_bytes - resource->length) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "invalid append borrow could not be released"
    );
    wipe_and_free_bytes(&owned_bytes, byte_length);
    return throw_typed(
      env,
      DECKENT_NATIVE_ERROR_SIZE_LIMIT,
      "POSIX custody publication exceeded its hard byte bound"
    );
  }
  result = create_append_result(env, byte_length);
  if (result == NULL) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "append result failure borrow could not be released"
    );
    wipe_and_free_bytes(&owned_bytes, byte_length);
    return NULL;
  }
  clear_resource_durability(resource);
  while (written < byte_length) {
    ssize_t amount = pwrite(
      resource->fd,
      owned_bytes + written,
      byte_length - written,
      (off_t)(resource->length + written)
    );
    if (amount < 0 && errno == EINTR) continue;
    if (amount <= 0) {
      mark_append_failed_or_fatal(env, state, publication_handle);
      clear_pending_exception(env);
      end_borrow_or_fatal(
        env,
        &borrow,
        "APPEND_FAILED borrow could not be released"
      );
      wipe_and_free_bytes(&owned_bytes, byte_length);
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_IO_UNCONFIRMED,
        "POSIX custody append completion was not confirmed"
      );
    }
    written += (size_t)amount;
  }
  resource->length += (uint64_t)byte_length;
  wipe_and_free_bytes(&owned_bytes, byte_length);
  if (!deckent_native_end_borrow(env, &borrow)) {
    clear_pending_exception(env);
    mark_append_failed_or_fatal(env, state, publication_handle);
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "completed append borrow could not be released",
      NAPI_AUTO_LENGTH
    );
    return NULL;
  }
  return result;
}

static bool pread_full(
  int fd,
  unsigned char *buffer,
  size_t length,
  off_t offset,
  size_t *observed
) {
  size_t total = 0u;
  while (total < length) {
    ssize_t amount = pread(fd, buffer + total, length - total, offset + (off_t)total);
    if (amount < 0 && errno == EINTR) continue;
    if (amount <= 0) {
      *observed = total;
      return false;
    }
    total += (size_t)amount;
  }
  *observed = total;
  return true;
}

static napi_value invoke_read_bounded(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value file_handle;
  napi_value array_buffer;
  napi_value bytes_value;
  napi_value before_record;
  napi_value after_record;
  napi_value result;
  void *buffer = NULL;
  uint64_t max_bytes;
  uint64_t file_size;
  size_t observed = 0u;
  bool eof = false;
  unsigned char eof_probe = 0u;
  deckent_native_borrow borrow;
  deckent_posix_resource *resource;
  deckent_posix_identity_snapshot before;
  deckent_posix_identity_snapshot after;
  uint32_t read_evidence;
  bool after_captured;
  memset(&borrow, 0, sizeof(borrow));
  if (!get_exact_input(
        env,
        state,
        DECKENT_CUSTODY_OPERATION_READ_BOUNDED,
        argc,
        argv,
        &input
      )
      || !get_named_value(env, input, "file", &file_handle)
      || !get_named_safe_positive_u64(
        env,
        input,
        "maxBytes",
        DECKENT_POSIX_MAX_PUBLICATION_BYTES,
        &max_bytes
      )
      || !deckent_native_borrow_handle(
        env,
        state,
        file_handle,
        DECKENT_NATIVE_HANDLE_READ_FILE,
        DECKENT_NATIVE_RIGHT_READ,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &borrow
      )) return NULL;
  resource = (deckent_posix_resource *)borrow.resource;
  if (!valid_resource(resource, DECKENT_NATIVE_HANDLE_READ_FILE)) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "invalid read borrow could not be released"
    );
    return throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "POSIX custody read resource is invalid"
    );
  }
  read_evidence = resource->evidence_bits
    | DECKENT_NATIVE_EVIDENCE_BOUNDED_READ;
  if (!capture_identity(
        env,
        resource->fd,
        read_evidence,
        resource->capability_bits,
        &before
      )
      || !validate_owner_private(
        env,
        &before,
        DECKENT_NATIVE_HANDLE_READ_FILE,
        true
      )) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "read identity borrow could not be released"
    );
    return NULL;
  }
  file_size = (uint64_t)before.status.st_size;
  if (file_size > max_bytes || file_size > SIZE_MAX) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "bounded read limit borrow could not be released"
    );
    return throw_typed(
      env,
      DECKENT_NATIVE_ERROR_SIZE_LIMIT,
      "POSIX custody bounded read limit was exceeded"
    );
  }
  if (napi_create_arraybuffer(env, (size_t)file_size, &buffer, &array_buffer) != napi_ok
      || napi_create_typedarray(
        env,
        napi_uint8_array,
        (size_t)file_size,
        array_buffer,
        0u,
        &bytes_value
      ) != napi_ok) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "read allocation failure borrow could not be released"
    );
    return throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "POSIX custody bounded read buffer allocation failed"
    );
  }
  if (file_size > 0u
      && !pread_full(
        resource->fd,
        (unsigned char *)buffer,
        (size_t)file_size,
        0,
        &observed
      )) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "read failure borrow could not be released"
    );
    return throw_typed(
      env,
      DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "POSIX custody file changed during bounded read"
    );
  }
  observed = (size_t)file_size;
  if (file_size < max_bytes) {
    ssize_t amount;
    do {
      amount = pread(resource->fd, &eof_probe, 1u, (off_t)file_size);
    } while (amount < 0 && errno == EINTR);
    if (amount != 0) {
      end_borrow_or_fatal(
        env,
        &borrow,
        "read EOF proof borrow could not be released"
      );
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
        "POSIX custody EOF proof changed during bounded read"
      );
    }
    eof = true;
  }
  after_captured = capture_identity(
    env,
    resource->fd,
    read_evidence,
    resource->capability_bits,
    &after
  );
  if (!after_captured
      || !same_snapshot(&before, &after)
      || !create_identity_record(env, &before, &before_record)
      || !create_identity_record(env, &after, &after_record)) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "read identity result borrow could not be released"
    );
    if (after_captured && !same_snapshot(&before, &after)) {
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
        "POSIX custody identity changed during bounded read"
      );
    }
    return NULL;
  }
  result = deckent_native_create_result_record(env);
  if (result == NULL
      || !set_named_value(env, result, "after", after_record)
      || !set_named_value(env, result, "before", before_record)
      || !set_named_value(env, result, "bytes", bytes_value)
      || !set_named_boolean(env, result, "eof", eof)
      || !set_named_string(env, result, "kind", "custody-read")
      || !set_named_double(env, result, "observedBytes", (double)observed)
      || !set_named_double(env, result, "requestedMaxBytes", (double)max_bytes)
      || !set_named_uint32(env, result, "schemaVersion", 1u)
      || !deckent_native_finalize_result_record(
        env,
        result,
        DECKENT_CUSTODY_OPERATION_READ_BOUNDED
      )) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "read result finalization borrow could not be released"
    );
    return NULL;
  }
  if (!deckent_native_end_borrow(env, &borrow)) return NULL;
  return result;
}

#if defined(__linux__)
typedef enum deckent_posix_compare_result {
  DECKENT_POSIX_COMPARE_ERROR = -1,
  DECKENT_POSIX_COMPARE_DIFFERENT = 0,
  DECKENT_POSIX_COMPARE_IDENTICAL = 1,
} deckent_posix_compare_result;

static deckent_posix_compare_result compare_regular_files(
  napi_env env,
  int staging_fd,
  int existing_fd,
  uint64_t maximum
) {
  deckent_posix_identity_snapshot staging_before;
  deckent_posix_identity_snapshot existing_before;
  deckent_posix_identity_snapshot staging_after;
  deckent_posix_identity_snapshot existing_after;
  unsigned char *staging_buffer;
  unsigned char *existing_buffer;
  uint64_t offset = 0u;
  uint64_t size;
  deckent_posix_compare_result outcome = DECKENT_POSIX_COMPARE_ERROR;
  const uint32_t evidence = base_evidence_for_kind(
    DECKENT_NATIVE_HANDLE_READ_FILE
  ) | DECKENT_NATIVE_EVIDENCE_BOUNDED_READ;
  if (!capture_identity(
        env,
        staging_fd,
        evidence,
        DECKENT_POSIX_CAP_STABLE_OBJECT_ID,
        &staging_before
      )
      || !validate_owner_private(
        env,
        &staging_before,
        DECKENT_NATIVE_HANDLE_PUBLICATION,
        false
      )
      || !capture_identity(
        env,
        existing_fd,
        evidence,
        DECKENT_POSIX_CAP_STABLE_OBJECT_ID,
        &existing_before
      )
      || !validate_owner_private(
        env,
        &existing_before,
        DECKENT_NATIVE_HANDLE_READ_FILE,
        true
      )) return DECKENT_POSIX_COMPARE_ERROR;
  if (!S_ISREG(staging_before.status.st_mode)
      || staging_before.status.st_size < 0
      || existing_before.status.st_size < 0
      || (uint64_t)staging_before.status.st_size > maximum
      || (uint64_t)existing_before.status.st_size > maximum) {
    throw_typed(
      env,
      DECKENT_NATIVE_ERROR_SIZE_LIMIT,
      "POSIX custody collision comparison exceeded its hard bound"
    );
    return DECKENT_POSIX_COMPARE_ERROR;
  }
  if (staging_before.status.st_size != existing_before.status.st_size) {
    return DECKENT_POSIX_COMPARE_DIFFERENT;
  }
  size = (uint64_t)staging_before.status.st_size;
  staging_buffer = (unsigned char *)malloc(DECKENT_POSIX_COMPARE_BUFFER_BYTES);
  existing_buffer = (unsigned char *)malloc(DECKENT_POSIX_COMPARE_BUFFER_BYTES);
  if (staging_buffer == NULL || existing_buffer == NULL) {
    free(staging_buffer);
    free(existing_buffer);
    throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "POSIX custody collision comparison allocation failed"
    );
    return DECKENT_POSIX_COMPARE_ERROR;
  }
  while (offset < size) {
    size_t chunk = (size - offset) > DECKENT_POSIX_COMPARE_BUFFER_BYTES
      ? DECKENT_POSIX_COMPARE_BUFFER_BYTES
      : (size_t)(size - offset);
    size_t staging_observed = 0u;
    size_t existing_observed = 0u;
    if (!pread_full(
          staging_fd,
          staging_buffer,
          chunk,
          (off_t)offset,
          &staging_observed
        )
        || !pread_full(
          existing_fd,
          existing_buffer,
          chunk,
          (off_t)offset,
          &existing_observed
        )
        || staging_observed != chunk
        || existing_observed != chunk) {
      throw_typed(
        env,
        DECKENT_NATIVE_ERROR_IO_UNCONFIRMED,
        "POSIX custody collision comparison was incomplete"
      );
      goto cleanup;
    }
    if (memcmp(staging_buffer, existing_buffer, chunk) != 0) {
      outcome = DECKENT_POSIX_COMPARE_DIFFERENT;
      goto cleanup;
    }
    offset += (uint64_t)chunk;
  }
  if (!capture_identity(
        env,
        staging_fd,
        evidence,
        DECKENT_POSIX_CAP_STABLE_OBJECT_ID,
        &staging_after
      )
      || !capture_identity(
        env,
        existing_fd,
        evidence,
        DECKENT_POSIX_CAP_STABLE_OBJECT_ID,
        &existing_after
      )
      || !same_snapshot(&staging_before, &staging_after)
      || !same_snapshot(&existing_before, &existing_after)) {
    throw_typed(
      env,
      DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "POSIX custody collision identity changed during comparison"
    );
    goto cleanup;
  }
  outcome = DECKENT_POSIX_COMPARE_IDENTICAL;

cleanup:
  free(staging_buffer);
  free(existing_buffer);
  return outcome;
}

#if defined(__linux__)
typedef enum deckent_posix_link_result {
  DECKENT_POSIX_LINK_UNAVAILABLE = 0,
  DECKENT_POSIX_LINK_CREATED = 1,
  DECKENT_POSIX_LINK_COLLISION = 2,
  DECKENT_POSIX_LINK_AMBIGUOUS = 3,
} deckent_posix_link_result;

static bool mark_publication_unconfirmed_or_fatal(
  napi_env env,
  deckent_native_state *state,
  napi_value publication_handle
);

static bool link_error_is_unsupported(int error) {
  return error == EPERM
    || error == EACCES
    || error == EINVAL
    || error == ENOENT
    || error == ENOSYS
    || error == ENOTSUP
#if defined(EOPNOTSUPP) && EOPNOTSUPP != ENOTSUP
    || error == EOPNOTSUPP
#endif
    ;
}

static deckent_posix_link_result publish_through_verified_proc_alias(
  napi_env env,
  deckent_native_state *state,
  napi_value publication_handle,
  deckent_posix_resource *publication,
  bool *cleanup_confirmed
) {
  int private_fd = -1;
  int proc_fd = -1;
  int alias_fd = -1;
  int saved_error;
  struct statfs proc_filesystem;
  deckent_posix_identity_snapshot private_identity;
  deckent_posix_identity_snapshot alias_identity;
  char numeric_fd[32];
  int numeric_length;
  deckent_posix_link_result outcome = DECKENT_POSIX_LINK_UNAVAILABLE;
  *cleanup_confirmed = true;
  private_fd = fcntl(publication->fd, F_DUPFD_CLOEXEC, 3);
  if (private_fd < 0) {
    throw_errno_typed(env, errno);
    return DECKENT_POSIX_LINK_UNAVAILABLE;
  }
  proc_fd = open(
    "/proc/self/fd",
    O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC
  );
  if (proc_fd < 0
      || fstatfs(proc_fd, &proc_filesystem) != 0
      || (uint64_t)(unsigned long)proc_filesystem.f_type
        != (uint64_t)(unsigned long)PROC_SUPER_MAGIC) {
    clear_pending_exception(env);
    goto cleanup;
  }
  numeric_length = snprintf(numeric_fd, sizeof(numeric_fd), "%d", private_fd);
  if (numeric_length <= 0 || (size_t)numeric_length >= sizeof(numeric_fd)) {
    outcome = DECKENT_POSIX_LINK_AMBIGUOUS;
    goto cleanup;
  }
  alias_fd = openat(proc_fd, numeric_fd, O_RDONLY | O_CLOEXEC);
  if (alias_fd < 0
      || !capture_identity(
        env,
        private_fd,
        publication->evidence_bits,
        publication->capability_bits,
        &private_identity
      )
      || !capture_identity(
        env,
        alias_fd,
        publication->evidence_bits,
        publication->capability_bits,
        &alias_identity
      )
      || !same_snapshot(&private_identity, &alias_identity)) {
    clear_pending_exception(env);
    outcome = DECKENT_POSIX_LINK_AMBIGUOUS;
    goto cleanup;
  }
  if (linkat(
        proc_fd,
        numeric_fd,
        publication->parent_fd,
        publication->target_name,
        AT_SYMLINK_FOLLOW
      ) == 0) {
    publication->namespace_linked = true;
    (void)mark_publication_unconfirmed_or_fatal(
      env,
      state,
      publication_handle
    );
    outcome = DECKENT_POSIX_LINK_CREATED;
    goto cleanup;
  }
  saved_error = errno;
  if (saved_error == EEXIST) {
    outcome = DECKENT_POSIX_LINK_COLLISION;
  } else if (link_error_is_unsupported(saved_error)) {
    outcome = DECKENT_POSIX_LINK_UNAVAILABLE;
  } else {
    outcome = DECKENT_POSIX_LINK_AMBIGUOUS;
  }

cleanup:
  if (!close_owned_fd(&alias_fd)) *cleanup_confirmed = false;
  if (!close_owned_fd(&proc_fd)) *cleanup_confirmed = false;
  if (!close_owned_fd(&private_fd)) *cleanup_confirmed = false;
  return outcome;
}
#endif

static napi_value create_publication_unconfirmed_result(
  napi_env env,
  uint32_t evidence_bits,
  const char *reason_code,
  napi_value read_handle,
  napi_value identity_record
) {
  napi_value result = deckent_native_create_result_record(env);
  if (result == NULL
      || !set_named_uint32(
        env,
        result,
        "featureEvidenceBits",
        evidence_bits
      )
      || (identity_record == NULL
        ? !set_named_null(env, result, "identity")
        : !set_named_value(env, result, "identity", identity_record))
      || !set_named_string(env, result, "kind", "custody-publication")
      || (read_handle == NULL
        ? !set_named_null(env, result, "readHandle")
        : !set_named_value(env, result, "readHandle", read_handle))
      || !set_named_string(env, result, "reasonCode", reason_code)
      || !set_named_uint32(env, result, "schemaVersion", 1u)
      || !set_named_string(
        env,
        result,
        "state",
        "PUBLISHED_UNCONFIRMED"
      )
      || !deckent_native_finalize_result_record(
        env,
        result,
        DECKENT_CUSTODY_OPERATION_SEAL_PUBLICATION
      )) {
    return throw_typed(
      env,
      DECKENT_NATIVE_ERROR_PUBLISH_UNCONFIRMED,
      "POSIX custody publication reconciliation record was not confirmed"
    );
  }
  return result;
}

static napi_value create_publication_success_result(
  napi_env env,
  deckent_native_state *state,
  const char *publication_state,
  deckent_posix_resource *read_resource,
  uint32_t evidence_bits,
  napi_value *read_handle_output,
  napi_value *identity_output,
  deckent_native_retire_result *cleanup_output
) {
  deckent_posix_identity_snapshot identity;
  napi_value identity_record;
  napi_value result;
  napi_value read_handle;
  *cleanup_output = DECKENT_NATIVE_RETIRE_REJECTED;
  *identity_output = NULL;
  if (!capture_resource_identity(env, read_resource, &identity)
      || !validate_owner_private(
        env,
        &identity,
        DECKENT_NATIVE_HANDLE_READ_FILE,
        true
      )
      || !create_identity_record(env, &identity, &identity_record)) {
    napi_value saved = take_pending_exception(env);
    if (close_posix_resource((uintptr_t)read_resource) != 0) {
      *cleanup_output = DECKENT_NATIVE_RETIRE_CLEANUP_UNCONFIRMED;
      return throw_typed(
        env,
        "E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED",
        "POSIX custody rejected read resource cleanup was not confirmed"
      );
    }
    restore_pending_or_throw(
      env,
      saved,
      DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "POSIX custody final read identity was not confirmed"
    );
    return NULL;
  }
  result = deckent_native_create_result_record(env);
  if (result == NULL) {
    napi_value saved = take_pending_exception(env);
    if (close_posix_resource((uintptr_t)read_resource) != 0) {
      *cleanup_output = DECKENT_NATIVE_RETIRE_CLEANUP_UNCONFIRMED;
      return throw_typed(
        env,
        "E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED",
        "POSIX custody rejected read result cleanup was not confirmed"
      );
    }
    restore_pending_or_throw(
      env,
      saved,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "POSIX custody final read result could not be created"
    );
    return NULL;
  }
  read_handle = deckent_native_create_handle(
    env,
    state,
    DECKENT_NATIVE_HANDLE_READ_FILE,
    rights_for_kind(DECKENT_NATIVE_HANDLE_READ_FILE),
    (uintptr_t)read_resource,
    close_posix_resource
  );
  if (read_handle == NULL) return NULL;
  if (!set_named_uint32(
        env,
        result,
        "featureEvidenceBits",
        evidence_bits
      )
      || !set_named_value(env, result, "identity", identity_record)
      || !set_named_string(env, result, "kind", "custody-publication")
      || !set_named_value(env, result, "readHandle", read_handle)
      || !set_named_null(env, result, "reasonCode")
      || !set_named_uint32(env, result, "schemaVersion", 1u)
      || !set_named_string(env, result, "state", publication_state)
      || !deckent_native_finalize_result_record(
        env,
        result,
        DECKENT_CUSTODY_OPERATION_SEAL_PUBLICATION
      )) {
    *cleanup_output = retire_returned_handle(
      env,
      state,
      read_handle,
      DECKENT_NATIVE_HANDLE_READ_FILE
    );
    return NULL;
  }
  *read_handle_output = read_handle;
  *identity_output = identity_record;
  return result;
}

static bool mark_publication_unconfirmed_or_fatal(
  napi_env env,
  deckent_native_state *state,
  napi_value publication_handle
) {
  if (deckent_native_mark_published_unconfirmed(
        env,
        state,
        publication_handle
      )) return true;
  napi_fatal_error(
    "deckent.exec-authority",
    NAPI_AUTO_LENGTH,
    "namespace effect could not be bound to PUBLISHED_UNCONFIRMED state",
    NAPI_AUTO_LENGTH
  );
  return false;
}

static napi_value finish_publication_success(
  napi_env env,
  deckent_native_state *state,
  napi_value publication_handle,
  deckent_native_borrow *publication_borrow,
  const char *publication_state,
  deckent_posix_resource *read_resource,
  uint32_t evidence_bits
) {
  napi_value read_handle = NULL;
  napi_value identity_record = NULL;
  napi_value reconciliation_result;
  deckent_native_retire_result rejected_cleanup;
  napi_value result = create_publication_success_result(
    env,
    state,
    publication_state,
    read_resource,
    evidence_bits,
    &read_handle,
    &identity_record,
    &rejected_cleanup
  );
  if (result == NULL) {
    end_borrow_or_fatal(
      env,
      publication_borrow,
      "rejected publication result borrow could not be released"
    );
    if (rejected_cleanup == DECKENT_NATIVE_RETIRE_CLEANUP_UNCONFIRMED) {
      return throw_typed(
        env,
        "E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED",
        "POSIX custody rejected read handle cleanup was not confirmed"
      );
    }
    return NULL;
  }
  reconciliation_result = create_publication_unconfirmed_result(
    env,
    evidence_bits,
    DECKENT_CUSTODY_REASON_CLEANUP_UNCONFIRMED,
    read_handle,
    identity_record
  );
  if (reconciliation_result == NULL) {
    rejected_cleanup = retire_returned_handle(
      env,
      state,
      read_handle,
      DECKENT_NATIVE_HANDLE_READ_FILE
    );
    end_borrow_or_fatal(
      env,
      publication_borrow,
      "publication reconciliation preparation borrow could not be released"
    );
    if (rejected_cleanup == DECKENT_NATIVE_RETIRE_CLEANUP_UNCONFIRMED) {
      return throw_typed(
        env,
        "E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED",
        "POSIX custody reconciliation read handle cleanup was not confirmed"
      );
    }
    return throw_typed(
      env,
      DECKENT_NATIVE_ERROR_PUBLISH_UNCONFIRMED,
      "POSIX custody reconciliation result could not be prepared"
    );
  }
  end_borrow_or_fatal(
    env,
    publication_borrow,
    "publication success borrow could not be released"
  );
  if (!deckent_native_bind_seal_result_transfer(
        env,
        state,
        result,
        reconciliation_result,
        publication_handle,
        read_handle,
        false
      )) return NULL;
  return result;
}

static napi_value finish_publication_unconfirmed(
  napi_env env,
  deckent_native_borrow *borrow,
  uint32_t evidence_bits,
  const char *reason_code
) {
  if (reason_code != NULL
      && strcmp(
        reason_code,
        DECKENT_CUSTODY_REASON_CLEANUP_UNCONFIRMED
      ) == 0) {
    end_borrow_or_fatal(
      env,
      borrow,
      "cleanup-unconfirmed publication borrow could not be released"
    );
    return throw_typed(
      env,
      DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
      "POSIX custody ancillary cleanup was not confirmed"
    );
  }
  napi_value result = create_publication_unconfirmed_result(
    env,
    evidence_bits,
    reason_code,
    NULL,
    NULL
  );
  if (result == NULL) {
    clear_pending_exception(env);
    end_borrow_or_fatal(
      env,
      borrow,
      "unconfirmed publication result borrow could not be released"
    );
    return throw_typed(
      env,
      DECKENT_NATIVE_ERROR_PUBLISH_UNCONFIRMED,
      "POSIX custody publication truth could not be returned"
    );
  }
  end_borrow_or_fatal(
    env,
    borrow,
    "unconfirmed publication borrow could not be released"
  );
  return result;
}
#endif

static napi_value invoke_seal_publication(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value publication_handle;
  deckent_native_borrow borrow;
  deckent_posix_resource *publication;
#if defined(__linux__)
  deckent_posix_link_result link_result;
  bool proc_cleanup_confirmed = true;
  bool publication_state_marked = false;
  uint32_t provenance = DECKENT_NATIVE_EVIDENCE_NONE;
  uint32_t success_evidence;
  uint32_t success_capabilities;
  int final_fd = -1;
  int final_parent_fd = -1;
  deckent_posix_identity_snapshot staging_identity;
  deckent_posix_identity_snapshot final_identity;
  deckent_posix_identity_snapshot compared_identity;
  deckent_posix_identity_snapshot final_parent_identity;
  deckent_posix_resource *read_resource;
  napi_value result;
#endif
  memset(&borrow, 0, sizeof(borrow));
  if (!get_exact_input(
        env,
        state,
        DECKENT_CUSTODY_OPERATION_SEAL_PUBLICATION,
        argc,
        argv,
        &input
      )
      || !get_named_value(env, input, "publication", &publication_handle)
      || !deckent_native_borrow_handle(
        env,
        state,
        publication_handle,
        DECKENT_NATIVE_HANDLE_PUBLICATION,
        DECKENT_NATIVE_RIGHT_PUBLISH,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &borrow
      )) return NULL;
  publication = (deckent_posix_resource *)borrow.resource;
  if (!valid_resource(publication, DECKENT_NATIVE_HANDLE_PUBLICATION)
      || !publication->anonymous_publication
      || publication->target_name == NULL) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "invalid publication borrow could not be released"
    );
    return throw_typed(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "POSIX custody publication session is invalid"
    );
  }
#if defined(__APPLE__)
  (void)publication;
  end_borrow_or_fatal(
    env,
    &borrow,
    "unsupported Darwin publication borrow could not be released"
  );
  return throw_typed(
    env,
    DECKENT_NATIVE_ERROR_VOLUME_UNSUPPORTED,
    "Darwin custody publication remains an explicit unsupported HOLD"
  );
#elif defined(__linux__)
  clear_resource_durability(publication);
  if (fchmod(publication->fd, 0400) != 0
      || !capture_resource_identity(env, publication, &staging_identity)
      || !validate_owner_private(
        env,
        &staging_identity,
        DECKENT_NATIVE_HANDLE_PUBLICATION,
        false
      )
      || (uint64_t)staging_identity.status.st_size != publication->length
      || !sync_descriptor(publication->fd, false)) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "staging durability borrow could not be released"
    );
    return throw_typed(
      env,
      DECKENT_NATIVE_ERROR_DURABILITY_UNCONFIRMED,
      "Linux custody staging file durability was not confirmed"
      );
  }
  record_resource_durability(
    publication,
    &staging_identity,
    DECKENT_NATIVE_EVIDENCE_FILE_DURABILITY
  );
  if (linkat(
        publication->fd,
        "",
        publication->parent_fd,
        publication->target_name,
        AT_EMPTY_PATH
      ) == 0) {
    publication->namespace_linked = true;
    (void)mark_publication_unconfirmed_or_fatal(
      env,
      state,
      publication_handle
    );
    publication_state_marked = true;
    link_result = DECKENT_POSIX_LINK_CREATED;
    provenance = DECKENT_NATIVE_EVIDENCE_PUBLISH_AT_EMPTY_PATH;
  } else {
    int link_error = errno;
    if (link_error == EEXIST) {
      link_result = DECKENT_POSIX_LINK_COLLISION;
      provenance = DECKENT_NATIVE_EVIDENCE_PUBLISH_AT_EMPTY_PATH;
    } else if (link_error_is_unsupported(link_error)) {
      link_result = publish_through_verified_proc_alias(
        env,
        state,
        publication_handle,
        publication,
        &proc_cleanup_confirmed
      );
      publication_state_marked = link_result == DECKENT_POSIX_LINK_CREATED;
      provenance = DECKENT_NATIVE_EVIDENCE_PUBLISH_PROC_FD_ALIAS;
    } else {
      link_result = DECKENT_POSIX_LINK_AMBIGUOUS;
    }
  }
  if (!proc_cleanup_confirmed && !publication_state_marked) {
    (void)mark_publication_unconfirmed_or_fatal(
      env,
      state,
      publication_handle
    );
    end_borrow_or_fatal(
      env,
      &borrow,
      "proc publication cleanup borrow could not be released"
    );
    return throw_typed(
      env,
      DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
      "Linux custody proc-fd publication cleanup was not confirmed"
    );
  }
  if (link_result == DECKENT_POSIX_LINK_UNAVAILABLE) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "unsupported publication borrow could not be released"
    );
    return throw_typed(
      env,
      DECKENT_NATIVE_ERROR_VOLUME_UNSUPPORTED,
      "Linux custody has no verified no-replace publication primitive"
    );
  }
  if (link_result == DECKENT_POSIX_LINK_AMBIGUOUS) {
    publication->namespace_linked = true;
    if (!publication_state_marked) {
      (void)mark_publication_unconfirmed_or_fatal(
        env,
        state,
        publication_handle
      );
    }
    return finish_publication_unconfirmed(
      env,
      &borrow,
      publication->evidence_bits | provenance,
      DECKENT_CUSTODY_REASON_FINAL_IDENTITY_UNCONFIRMED
    );
  }
  success_evidence = publication->evidence_bits
    | DECKENT_NATIVE_EVIDENCE_ANONYMOUS_NO_REPLACE_PUBLISH
    | provenance;
  success_capabilities = publication->capability_bits
    | DECKENT_POSIX_CAP_HARD_LINKS
    | DECKENT_POSIX_CAP_NO_REPLACE_PUBLISH;
  if (link_result == DECKENT_POSIX_LINK_COLLISION) {
    deckent_posix_compare_result comparison;
    napi_value saved;
    bool compare_fd_closed;
    final_fd = openat(
      publication->parent_fd,
      publication->target_name,
      O_RDONLY | O_NONBLOCK | O_NOFOLLOW | O_CLOEXEC
    );
    if (final_fd < 0) {
      end_borrow_or_fatal(
        env,
        &borrow,
        "collision inspection borrow could not be released"
      );
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_NAMESPACE_CONFLICT,
        "POSIX custody collision target could not be inspected safely"
      );
    }
    comparison = compare_regular_files(
      env,
      publication->fd,
      final_fd,
      publication->max_bytes
    );
    if (comparison != DECKENT_POSIX_COMPARE_IDENTICAL) {
      saved = take_pending_exception(env);
      compare_fd_closed = close_owned_fd(&final_fd);
      end_borrow_or_fatal(
        env,
        &borrow,
        "collision comparison borrow could not be released"
      );
      if (!compare_fd_closed) {
        (void)mark_publication_unconfirmed_or_fatal(
          env,
          state,
          publication_handle
        );
        return throw_typed(
          env,
          DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
          "POSIX custody collision comparison cleanup was not confirmed"
        );
      }
      if (comparison == DECKENT_POSIX_COMPARE_DIFFERENT) {
        return throw_typed(
          env,
          DECKENT_NATIVE_ERROR_NAMESPACE_CONFLICT,
          "POSIX custody existing object has different bytes"
        );
      }
      return restore_pending_or_throw(
        env,
        saved,
        DECKENT_NATIVE_ERROR_IO_UNCONFIRMED,
        "POSIX custody collision comparison failed"
      );
    }
    if (!capture_identity(
          env,
          final_fd,
          success_evidence,
          success_capabilities,
          &compared_identity
        )
        || !validate_owner_private(
          env,
          &compared_identity,
          DECKENT_NATIVE_HANDLE_READ_FILE,
          true
        )
        || !capture_identity(
          env,
          publication->parent_fd,
          base_evidence_for_kind(DECKENT_NATIVE_HANDLE_DIRECTORY),
          publication->capability_bits,
          &final_parent_identity
        )
        || !validate_owner_private(
          env,
          &final_parent_identity,
          DECKENT_NATIVE_HANDLE_DIRECTORY,
          false
        )
        || !same_mount(&final_parent_identity, &compared_identity)
        || (uint64_t)compared_identity.status.st_size != publication->length
        || !sync_descriptor(final_fd, false)
        || !sync_descriptor(publication->parent_fd, true)) {
      saved = take_pending_exception(env);
      compare_fd_closed = close_owned_fd(&final_fd);
      end_borrow_or_fatal(
        env,
        &borrow,
        "collision durability borrow could not be released"
      );
      if (!compare_fd_closed) {
        (void)mark_publication_unconfirmed_or_fatal(
          env,
          state,
          publication_handle
        );
        return throw_typed(
          env,
          DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
          "POSIX custody collision durability cleanup was not confirmed"
        );
      }
      if (saved != NULL) {
        return restore_pending_or_throw(
          env,
          saved,
          DECKENT_NATIVE_ERROR_DURABILITY_UNCONFIRMED,
          "POSIX custody collision durability was not confirmed"
        );
      }
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_DURABILITY_UNCONFIRMED,
        "POSIX custody existing collision durability was not confirmed"
      );
    }
    if (!close_owned_fd(&final_fd)) {
      (void)mark_publication_unconfirmed_or_fatal(
        env,
        state,
        publication_handle
      );
      end_borrow_or_fatal(
        env,
        &borrow,
        "collision rebind borrow could not be released"
      );
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "POSIX custody collision comparison descriptor cleanup was not confirmed"
      );
    }
    success_evidence |= DECKENT_NATIVE_EVIDENCE_FILE_DURABILITY
      | DECKENT_NATIVE_EVIDENCE_DIRECTORY_DURABILITY;
    success_capabilities |= DECKENT_POSIX_CAP_DIRECTORY_DURABILITY;
    final_fd = openat(
      publication->parent_fd,
      publication->target_name,
      O_RDONLY | O_NONBLOCK | O_NOFOLLOW | O_CLOEXEC
    );
    final_parent_fd = fcntl(
      publication->parent_fd,
      F_DUPFD_CLOEXEC,
      3
    );
    if (final_fd < 0
        || final_parent_fd < 0
        || !capture_identity(
          env,
          publication->parent_fd,
          base_evidence_for_kind(DECKENT_NATIVE_HANDLE_DIRECTORY),
          publication->capability_bits,
          &final_parent_identity
        )
        || !validate_owner_private(
          env,
          &final_parent_identity,
          DECKENT_NATIVE_HANDLE_DIRECTORY,
          false
        )
        || !capture_identity(
          env,
          final_fd,
          success_evidence,
          success_capabilities,
          &final_identity
        )
        || !validate_owner_private(
          env,
          &final_identity,
          DECKENT_NATIVE_HANDLE_READ_FILE,
          true
        )
        || !same_snapshot(&compared_identity, &final_identity)
        || !same_mount(&final_parent_identity, &final_identity)
        || (uint64_t)final_identity.status.st_size != publication->length) {
      saved = take_pending_exception(env);
      if (!close_owned_pair(&final_fd, &final_parent_fd)) {
        (void)mark_publication_unconfirmed_or_fatal(
          env,
          state,
          publication_handle
        );
        end_borrow_or_fatal(
          env,
          &borrow,
          "collision rebind cleanup borrow could not be released"
        );
        return throw_typed(
          env,
          DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
          "POSIX custody collision rebind cleanup was not confirmed"
        );
      }
      end_borrow_or_fatal(
        env,
        &borrow,
        "collision rebind failure borrow could not be released"
      );
      return restore_pending_or_throw(
        env,
        saved,
        DECKENT_NATIVE_ERROR_NAMESPACE_CONFLICT,
        "POSIX custody collision target changed during final rebind"
      );
    }
    read_resource = create_resource(
      DECKENT_NATIVE_HANDLE_READ_FILE,
      final_fd,
      final_parent_fd,
      publication->parent_generation,
      success_evidence,
      success_capabilities
    );
    if (read_resource == NULL) {
      bool closed = close_owned_pair(&final_fd, &final_parent_fd);
      if (!closed) {
        (void)mark_publication_unconfirmed_or_fatal(
          env,
          state,
          publication_handle
        );
      }
      end_borrow_or_fatal(
        env,
        &borrow,
        "collision allocation failure borrow could not be released"
      );
      if (!closed) {
        return throw_typed(
          env,
          DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
          "POSIX custody collision read resource cleanup was not confirmed"
        );
      }
      return throw_typed(
        env,
        "E_EXEC_AUTH_NATIVE_ALLOCATION",
        "POSIX custody collision read resource allocation failed"
      );
    }
    record_resource_durability(
      read_resource,
      &final_identity,
      DECKENT_NATIVE_EVIDENCE_FILE_DURABILITY
        | DECKENT_NATIVE_EVIDENCE_DIRECTORY_DURABILITY
    );
    result = finish_publication_success(
      env,
      state,
      publication_handle,
      &borrow,
      "EXISTING_IDENTICAL",
      read_resource,
      success_evidence
    );
    return result;
  }
  publication->namespace_linked = true;
  if (!publication_state_marked) {
    (void)mark_publication_unconfirmed_or_fatal(
      env,
      state,
      publication_handle
    );
  }
  if (!proc_cleanup_confirmed) {
    return finish_publication_unconfirmed(
      env,
      &borrow,
      success_evidence,
      DECKENT_CUSTODY_REASON_CLEANUP_UNCONFIRMED
    );
  }
  if (!sync_descriptor(publication->fd, false)
      || !sync_descriptor(publication->parent_fd, true)) {
    return finish_publication_unconfirmed(
      env,
      &borrow,
      success_evidence,
      DECKENT_CUSTODY_REASON_DIRECTORY_DURABILITY_UNCONFIRMED
    );
  }
  success_evidence |= DECKENT_NATIVE_EVIDENCE_FILE_DURABILITY
    | DECKENT_NATIVE_EVIDENCE_DIRECTORY_DURABILITY;
  success_capabilities |= DECKENT_POSIX_CAP_DIRECTORY_DURABILITY;
  final_fd = openat(
    publication->parent_fd,
    publication->target_name,
    O_RDONLY | O_NONBLOCK | O_NOFOLLOW | O_CLOEXEC
  );
  final_parent_fd = fcntl(publication->parent_fd, F_DUPFD_CLOEXEC, 3);
  if (final_fd < 0
      || final_parent_fd < 0
      || !capture_identity(
        env,
        publication->parent_fd,
        base_evidence_for_kind(DECKENT_NATIVE_HANDLE_DIRECTORY),
        publication->capability_bits,
        &final_parent_identity
      )
      || !validate_owner_private(
        env,
        &final_parent_identity,
        DECKENT_NATIVE_HANDLE_DIRECTORY,
        false
      )
      || !capture_identity(
        env,
        final_fd,
        success_evidence,
        success_capabilities,
        &final_identity
      )
      || !validate_owner_private(
        env,
        &final_identity,
        DECKENT_NATIVE_HANDLE_READ_FILE,
        true
      )
      || final_identity.status.st_dev != staging_identity.status.st_dev
      || final_identity.status.st_ino != staging_identity.status.st_ino
      || final_identity.mount_id != staging_identity.mount_id
      || (uint64_t)final_identity.status.st_size != publication->length
      || !same_mount(&final_parent_identity, &final_identity)) {
    bool final_cleanup_confirmed = close_owned_pair(
      &final_fd,
      &final_parent_fd
    );
    clear_pending_exception(env);
    return finish_publication_unconfirmed(
      env,
      &borrow,
      success_evidence,
      final_cleanup_confirmed
        ? DECKENT_CUSTODY_REASON_FINAL_IDENTITY_UNCONFIRMED
        : DECKENT_CUSTODY_REASON_CLEANUP_UNCONFIRMED
    );
  }
  read_resource = create_resource(
    DECKENT_NATIVE_HANDLE_READ_FILE,
    final_fd,
    final_parent_fd,
    publication->parent_generation,
    success_evidence,
    success_capabilities
  );
  if (read_resource == NULL) {
    bool final_cleanup_confirmed = close_owned_pair(
      &final_fd,
      &final_parent_fd
    );
    return finish_publication_unconfirmed(
      env,
      &borrow,
      success_evidence,
      final_cleanup_confirmed
        ? DECKENT_CUSTODY_REASON_FINAL_IDENTITY_UNCONFIRMED
        : DECKENT_CUSTODY_REASON_CLEANUP_UNCONFIRMED
    );
  }
  record_resource_durability(
    read_resource,
    &final_identity,
    DECKENT_NATIVE_EVIDENCE_FILE_DURABILITY
      | DECKENT_NATIVE_EVIDENCE_DIRECTORY_DURABILITY
  );
  result = finish_publication_success(
    env,
    state,
    publication_handle,
    &borrow,
    "CREATED",
    read_resource,
    success_evidence
  );
  if (result == NULL) {
    clear_pending_exception(env);
    return throw_typed(
      env,
      DECKENT_NATIVE_ERROR_PUBLISH_UNCONFIRMED,
      "POSIX custody published result exposure was not confirmed"
    );
  }
  return result;
#endif
}

static napi_value create_cleanup_result(
  napi_env env,
  bool confirmed
) {
  napi_value result = deckent_native_create_result_record(env);
  if (result == NULL
      || !set_named_string(env, result, "kind", "custody-cleanup")
      || (confirmed
        ? !set_named_null(env, result, "reasonCode")
        : !set_named_string(
          env,
          result,
          "reasonCode",
          DECKENT_CUSTODY_REASON_CLEANUP_UNCONFIRMED
        ))
      || !set_named_uint32(env, result, "schemaVersion", 1u)
      || !set_named_string(
        env,
        result,
        "state",
        confirmed ? "CLEANUP_CONFIRMED" : "CLEANUP_UNCONFIRMED"
      )
      || !deckent_native_finalize_result_record(
        env,
        result,
        DECKENT_CUSTODY_OPERATION_ABORT_PUBLICATION
      )) {
    if (!confirmed) {
      return throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "POSIX custody cleanup truth could not be returned"
      );
    }
    return NULL;
  }
  return result;
}

static napi_value invoke_abort_publication(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value publication_handle;
  napi_value confirmed_result;
  napi_value unconfirmed_result;
  if (!get_exact_input(
        env,
        state,
        DECKENT_CUSTODY_OPERATION_ABORT_PUBLICATION,
        argc,
        argv,
        &input
      )
      || !get_named_value(env, input, "publication", &publication_handle)) {
    return NULL;
  }
  confirmed_result = create_cleanup_result(env, true);
  if (confirmed_result == NULL) return NULL;
  unconfirmed_result = create_cleanup_result(env, false);
  if (unconfirmed_result == NULL) return NULL;
  if (!deckent_native_bind_abort_result_transfer(
        env,
        state,
        confirmed_result,
        unconfirmed_result,
        publication_handle
      )) return NULL;
  return confirmed_result;
}

static bool custody_scan_deadline_ok(napi_env env, uint64_t deadline_unix_ms) {
  struct timespec now;
  uint64_t now_ms;
  if (clock_gettime(CLOCK_REALTIME, &now) != 0 || now.tv_sec < 0
      || (uint64_t)now.tv_sec > (UINT64_MAX - 999u) / 1000u) {
    throw_typed(
      env,
      DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_DEADLINE,
      "POSIX custody directory scan clock is unavailable"
    );
    return false;
  }
  now_ms = (uint64_t)now.tv_sec * 1000u + (uint64_t)now.tv_nsec / 1000000u;
  if (now_ms > deadline_unix_ms) {
    throw_typed(
      env,
      DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_DEADLINE,
      "POSIX custody directory scan deadline expired"
    );
    return false;
  }
  return true;
}

static bool custody_safe_scan_name(const char *name, size_t length) {
  size_t index;
  if (name == NULL || length == 0u || length > 128u
      || !((name[0] >= 'a' && name[0] <= 'z')
        || (name[0] >= '0' && name[0] <= '9'))) return false;
  for (index = 1u; index < length; index += 1u) {
    const char value = name[index];
    if (!((value >= 'a' && value <= 'z')
        || (value >= '0' && value <= '9')
        || value == '.' || value == '_' || value == '-')) return false;
  }
  return true;
}

static int custody_scan_name_compare(const void *left, const void *right) {
  const char *const *left_name = (const char *const *)left;
  const char *const *right_name = (const char *const *)right;
  return strcmp(*left_name, *right_name);
}

static void custody_scan_names_free(char ***names, size_t count) {
  size_t index;
  if (names == NULL || *names == NULL) return;
  for (index = 0u; index < count; index += 1u) free((*names)[index]);
  free(*names);
  *names = NULL;
}

static napi_value invoke_scan_directory_bounded(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value directory_value;
  napi_value names_value = NULL;
  napi_value before_value;
  napi_value after_value;
  napi_value result;
  deckent_native_borrow borrow;
  deckent_posix_resource *resource;
  deckent_posix_identity_snapshot before;
  deckent_posix_identity_snapshot after;
  uint64_t max_entries;
  uint64_t max_name_bytes;
  uint64_t deadline_unix_ms;
  int duplicate = -1;
  DIR *directory = NULL;
  char **names = NULL;
  size_t count = 0u;
  size_t capacity = 0u;
  napi_value saved = NULL;
  bool directory_closed = true;
  memset(&borrow, 0, sizeof(borrow));
  if (!get_exact_input(
        env,
        state,
        DECKENT_CUSTODY_OPERATION_SCAN_DIRECTORY_BOUNDED,
        argc,
        argv,
        &input
      )
      || !get_named_value(env, input, "directory", &directory_value)
      || !get_named_safe_positive_u64(
        env, input, "maxEntries", 100000u, &max_entries)
      || !get_named_safe_positive_u64(
        env, input, "maxNameBytes", 128u, &max_name_bytes)
      || !get_named_safe_positive_u64(
        env, input, "deadlineUnixMs", UINT64_C(9007199254740991),
        &deadline_unix_ms)
      || !custody_scan_deadline_ok(env, deadline_unix_ms)
      || !deckent_native_borrow_handle(
        env,
        state,
        directory_value,
        DECKENT_NATIVE_HANDLE_ANY,
        DECKENT_NATIVE_RIGHT_TRAVERSE | DECKENT_NATIVE_RIGHT_IDENTITY,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &borrow
      )) return NULL;
  resource = (deckent_posix_resource *)borrow.resource;
  if (!valid_resource(resource, DECKENT_NATIVE_HANDLE_ANY)
      || (resource->kind != DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY
        && resource->kind != DECKENT_NATIVE_HANDLE_DIRECTORY)
      || !capture_resource_identity(env, resource, &before)) goto failed;
  duplicate = fcntl(resource->fd, F_DUPFD_CLOEXEC, 3);
  if (duplicate < 0) {
    throw_errno_typed(env, errno);
    goto failed;
  }
  directory = fdopendir(duplicate);
  if (directory == NULL) {
    int saved_error = errno;
    if (!close_owned_fd(&duplicate)) {
      throw_typed(
        env,
        DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "POSIX custody directory scan setup cleanup was not confirmed"
      );
    } else {
      throw_errno_typed(env, saved_error);
    }
    goto failed;
  }
  directory_closed = false;
  duplicate = -1;
  for (;;) {
    struct dirent *entry;
    size_t length;
    char **expanded;
    errno = 0;
    entry = readdir(directory);
    if (entry == NULL) {
      if (errno != 0) throw_errno_typed(env, errno);
      if (errno != 0) goto failed;
      break;
    }
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) {
      continue;
    }
    if (!custody_scan_deadline_ok(env, deadline_unix_ms)) goto failed;
    length = strlen(entry->d_name);
    if (length > (size_t)max_name_bytes
        || !custody_safe_scan_name(entry->d_name, length)) {
      throw_typed(
        env,
        DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_ENTRY_INVALID,
        "POSIX custody directory scan found an unsafe child name"
      );
      goto failed;
    }
    if (count >= (size_t)max_entries) {
      throw_typed(
        env,
        DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_BOUNDS,
        "POSIX custody directory scan exceeded its entry bound"
      );
      goto failed;
    }
    if (count == capacity) {
      size_t next_capacity = capacity == 0u
        ? ((size_t)max_entries < 32u ? (size_t)max_entries : 32u)
        : (capacity > (size_t)max_entries / 2u
          ? (size_t)max_entries : capacity * 2u);
      if (next_capacity <= capacity
          || next_capacity > SIZE_MAX / sizeof(*expanded)) {
        throw_typed(
          env,
          DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_BOUNDS,
          "POSIX custody directory scan allocation bound overflowed"
        );
        goto failed;
      }
      expanded = (char **)realloc(names, next_capacity * sizeof(*expanded));
      if (expanded == NULL) {
        throw_typed(
          env,
          "E_EXEC_AUTH_NATIVE_ALLOCATION",
          "POSIX custody directory scan allocation failed"
        );
        goto failed;
      }
      names = expanded;
      capacity = next_capacity;
    }
    names[count] = strdup(entry->d_name);
    if (names[count] == NULL) {
      throw_typed(
        env,
        "E_EXEC_AUTH_NATIVE_ALLOCATION",
        "POSIX custody directory scan entry allocation failed"
      );
      goto failed;
    }
    count += 1u;
  }
  if (!custody_scan_deadline_ok(env, deadline_unix_ms)) goto failed;
  if (count > 1u) qsort(names, count, sizeof(*names), custody_scan_name_compare);
  if (!custody_scan_deadline_ok(env, deadline_unix_ms)) goto failed;
  if (closedir(directory) != 0) {
    directory = NULL;
    throw_typed(
      env,
      DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
      "POSIX custody directory scan cleanup was not confirmed"
    );
    goto failed;
  }
  directory = NULL;
  directory_closed = true;
  if (!capture_resource_identity(env, resource, &after)
      || !same_snapshot(&before, &after)) {
    clear_pending_exception(env);
    throw_typed(
      env,
      DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_MUTATED,
      "POSIX custody directory changed during bounded scan"
    );
    goto failed;
  }
  if (napi_create_array_with_length(env, count, &names_value) != napi_ok) goto failed;
  for (size_t index = 0u; index < count; index += 1u) {
    napi_value name_value;
    if (!custody_scan_deadline_ok(env, deadline_unix_ms)
        || napi_create_string_utf8(env, names[index], NAPI_AUTO_LENGTH, &name_value)
          != napi_ok
        || !deckent_native_define_own_index(env, names_value, (uint32_t)index, name_value)) {
      goto failed;
    }
  }
  if (!custody_scan_deadline_ok(env, deadline_unix_ms)
      || !freeze_object(env, names_value)
      || !create_identity_record(env, &before, &before_value)
      || !create_identity_record(env, &after, &after_value)) goto failed;
  result = deckent_native_create_result_record(env);
  if (result == NULL
      || !set_named_value(env, result, "after", after_value)
      || !set_named_value(env, result, "before", before_value)
      || !set_named_double(env, result, "deadlineUnixMs", (double)deadline_unix_ms)
      || !set_named_double(env, result, "entryCount", (double)count)
      || !set_named_string(env, result, "kind", "custody-directory-scan")
      || !set_named_string(
        env, result, "mutationEvidence", "DIRECTORY_IDENTITY_STABLE")
      || !set_named_value(env, result, "names", names_value)
      || !set_named_double(env, result, "requestedMaxEntries", (double)max_entries)
      || !set_named_double(env, result, "requestedMaxNameBytes", (double)max_name_bytes)
      || !set_named_uint32(env, result, "schemaVersion", 1u)
      || !set_named_string(env, result, "state", "SCANNED")
      || !deckent_native_finalize_result_record(
        env, result, DECKENT_CUSTODY_OPERATION_SCAN_DIRECTORY_BOUNDED)) goto failed;
  if (!deckent_native_end_borrow(env, &borrow)) goto failed;
  custody_scan_names_free(&names, count);
  return result;
failed:
  saved = take_pending_exception(env);
  if (directory != NULL) {
    directory_closed = closedir(directory) == 0;
    directory = NULL;
  } else if (duplicate >= 0) {
    directory_closed = close_owned_fd(&duplicate);
  }
  custody_scan_names_free(&names, count);
  if (borrow.active) {
    end_borrow_or_fatal(
      env, &borrow, "POSIX custody failed directory scan borrow cleanup failed");
  }
  if (!directory_closed) {
    return throw_typed(
      env,
      DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
      "POSIX custody failed directory scan cleanup was not confirmed"
    );
  }
  return restore_pending_or_throw(
    env,
    saved,
    DECKENT_NATIVE_ERROR_IO_UNCONFIRMED,
    "POSIX custody directory scan failed without typed evidence"
  );
}

static napi_value custody_posix_invoke(
  napi_env env,
  deckent_native_state *state,
  deckent_custody_operation operation,
  size_t argc,
  napi_value *argv
) {
  switch (operation) {
    case DECKENT_CUSTODY_OPERATION_PROBE:
      return invoke_probe(env, state, argc, argv);
    case DECKENT_CUSTODY_OPERATION_OPEN_ROOT:
      return invoke_open_root(env, state, argc, argv);
    case DECKENT_CUSTODY_OPERATION_OPEN_DIRECTORY_AT:
      return invoke_open_directory_at(env, state, argc, argv);
    case DECKENT_CUSTODY_OPERATION_OPEN_FILE_AT:
      return invoke_open_file_at(env, state, argc, argv);
    case DECKENT_CUSTODY_OPERATION_BEGIN_PUBLICATION:
      return invoke_begin_publication(env, state, argc, argv);
    case DECKENT_CUSTODY_OPERATION_APPEND_PUBLICATION:
      return invoke_append_publication(env, state, argc, argv);
    case DECKENT_CUSTODY_OPERATION_SEAL_PUBLICATION:
      return invoke_seal_publication(env, state, argc, argv);
    case DECKENT_CUSTODY_OPERATION_ABORT_PUBLICATION:
      return invoke_abort_publication(env, state, argc, argv);
    case DECKENT_CUSTODY_OPERATION_READ_BOUNDED:
      return invoke_read_bounded(env, state, argc, argv);
    case DECKENT_CUSTODY_OPERATION_IDENTITY:
      return invoke_identity(env, state, argc, argv);
    case DECKENT_CUSTODY_OPERATION_APPLY_PRIVATE:
      return invoke_apply_private(env, state, argc, argv);
    case DECKENT_CUSTODY_OPERATION_SYNC:
      return invoke_sync(env, state, argc, argv);
    case DECKENT_CUSTODY_OPERATION_PROVE_ROOT_SEPARATION:
      return invoke_prove_root_separation(env, state, argc, argv);
    case DECKENT_CUSTODY_OPERATION_SCAN_DIRECTORY_BOUNDED:
      return invoke_scan_directory_bounded(env, state, argc, argv);
    default:
      return throw_typed(
        env,
        "E_EXEC_AUTH_NATIVE_OPERATION",
        "POSIX custody operation is not part of backend version 1"
      );
  }
}

const deckent_custody_backend_v1 *deckent_custody_posix_backend_v1(void) {
  static const deckent_custody_backend_v1 backend = {
    (uint32_t)sizeof(deckent_custody_backend_v1),
    DECKENT_EXEC_AUTHORITY_ABI_VERSION_NUMBER,
#if defined(__linux__)
    DECKENT_NATIVE_PLATFORM_LINUX,
#elif defined(__APPLE__)
    DECKENT_NATIVE_PLATFORM_DARWIN,
#endif
    DECKENT_NATIVE_FEATURE_CUSTODY_POSIX,
    custody_posix_invoke,
  };
  return &backend;
}

#if defined(__linux__)

/* execution-effect-linux-v1: separate effect-v2 trust domain. */
#define DECKENT_EFFECT_RESOURCE_MAGIC UINT64_C(0x6465666665637432)
#define DECKENT_EFFECT_MAX_ENTRIES 1000000u
#define DECKENT_EFFECT_MAX_AGGREGATE_PATH_BYTES UINT64_C(16777216)
#define DECKENT_EFFECT_MAX_FILE_BYTES UINT64_C(17179869184)
#define DECKENT_EFFECT_MAX_TOTAL_BYTES UINT64_C(274877906944)
#define DECKENT_EFFECT_MAX_DEPTH 256u
#define DECKENT_EFFECT_MAX_PATH_BYTES 16384u
#define DECKENT_EFFECT_MAX_NAME_BYTES 255u
#define DECKENT_EFFECT_IO_BUFFER_BYTES 65536u
#define DECKENT_EFFECT_LIMITS_BYTES 56u

typedef struct deckent_effect_sha256 {
  uint32_t state[8];
  uint64_t bit_count;
  uint8_t block[64];
  size_t block_length;
} deckent_effect_sha256;

typedef struct deckent_effect_limits {
  uint32_t max_entries;
  uint32_t max_depth;
  uint32_t max_path_bytes;
  uint32_t max_name_bytes;
  uint64_t max_file_bytes;
  uint64_t max_total_bytes;
  uint64_t max_manifest_bytes;
  uint64_t deadline_unix_ms;
} deckent_effect_limits;

typedef struct deckent_effect_resource {
  uint64_t magic;
  deckent_effect_handle_kind kind;
  int fd;
  int parent_fd;
  char *private_name;
  dev_t root_device;
  uint64_t root_mount_id;
  uint64_t expected_bytes;
  uint64_t observed_bytes;
  char expected_digest[72];
  deckent_effect_sha256 content_hash;
  deckent_posix_identity_snapshot source_identity;
  uint64_t deadline_unix_ms;
  uint64_t max_chunk_bytes;
  uint64_t chunk_count;
  mode_t expected_mode;
  bool sealed;
  bool failed;
} deckent_effect_resource;

static uint32_t effect_rotr(uint32_t value, uint32_t bits) {
  return (value >> bits) | (value << (32u - bits));
}

static void effect_sha256_transform(deckent_effect_sha256 *context, const uint8_t block[64]) {
  static const uint32_t constants[64] = {
    0x428a2f98u,0x71374491u,0xb5c0fbcfu,0xe9b5dba5u,0x3956c25bu,0x59f111f1u,0x923f82a4u,0xab1c5ed5u,
    0xd807aa98u,0x12835b01u,0x243185beu,0x550c7dc3u,0x72be5d74u,0x80deb1feu,0x9bdc06a7u,0xc19bf174u,
    0xe49b69c1u,0xefbe4786u,0x0fc19dc6u,0x240ca1ccu,0x2de92c6fu,0x4a7484aau,0x5cb0a9dcu,0x76f988dau,
    0x983e5152u,0xa831c66du,0xb00327c8u,0xbf597fc7u,0xc6e00bf3u,0xd5a79147u,0x06ca6351u,0x14292967u,
    0x27b70a85u,0x2e1b2138u,0x4d2c6dfcu,0x53380d13u,0x650a7354u,0x766a0abbu,0x81c2c92eu,0x92722c85u,
    0xa2bfe8a1u,0xa81a664bu,0xc24b8b70u,0xc76c51a3u,0xd192e819u,0xd6990624u,0xf40e3585u,0x106aa070u,
    0x19a4c116u,0x1e376c08u,0x2748774cu,0x34b0bcb5u,0x391c0cb3u,0x4ed8aa4au,0x5b9cca4fu,0x682e6ff3u,
    0x748f82eeu,0x78a5636fu,0x84c87814u,0x8cc70208u,0x90befffau,0xa4506cebu,0xbef9a3f7u,0xc67178f2u,
  };
  uint32_t words[64];
  uint32_t a,b,c,d,e,f,g,h,index;
  for (index = 0u; index < 16u; index += 1u) {
    size_t offset = (size_t)index * 4u;
    words[index] = ((uint32_t)block[offset] << 24)
      | ((uint32_t)block[offset + 1u] << 16)
      | ((uint32_t)block[offset + 2u] << 8)
      | (uint32_t)block[offset + 3u];
  }
  for (index = 16u; index < 64u; index += 1u) {
    uint32_t x = words[index - 15u];
    uint32_t y = words[index - 2u];
    uint32_t s0 = effect_rotr(x, 7u) ^ effect_rotr(x, 18u) ^ (x >> 3u);
    uint32_t s1 = effect_rotr(y, 17u) ^ effect_rotr(y, 19u) ^ (y >> 10u);
    words[index] = words[index - 16u] + s0 + words[index - 7u] + s1;
  }
  a=context->state[0]; b=context->state[1]; c=context->state[2]; d=context->state[3];
  e=context->state[4]; f=context->state[5]; g=context->state[6]; h=context->state[7];
  for (index = 0u; index < 64u; index += 1u) {
    uint32_t s1 = effect_rotr(e,6u)^effect_rotr(e,11u)^effect_rotr(e,25u);
    uint32_t choose = (e & f) ^ ((~e) & g);
    uint32_t temp1 = h + s1 + choose + constants[index] + words[index];
    uint32_t s0 = effect_rotr(a,2u)^effect_rotr(a,13u)^effect_rotr(a,22u);
    uint32_t majority = (a & b) ^ (a & c) ^ (b & c);
    uint32_t temp2 = s0 + majority;
    h=g; g=f; f=e; e=d+temp1; d=c; c=b; b=a; a=temp1+temp2;
  }
  context->state[0]+=a; context->state[1]+=b; context->state[2]+=c; context->state[3]+=d;
  context->state[4]+=e; context->state[5]+=f; context->state[6]+=g; context->state[7]+=h;
}

static void effect_sha256_init(deckent_effect_sha256 *context) {
  static const uint32_t initial[8] = {
    0x6a09e667u,0xbb67ae85u,0x3c6ef372u,0xa54ff53au,
    0x510e527fu,0x9b05688cu,0x1f83d9abu,0x5be0cd19u,
  };
  memcpy(context->state, initial, sizeof(initial));
  context->bit_count = 0u;
  context->block_length = 0u;
}

static void effect_sha256_update(deckent_effect_sha256 *context, const uint8_t *data, size_t length) {
  size_t index;
  for (index = 0u; index < length; index += 1u) {
    context->block[context->block_length++] = data[index];
    if (context->block_length == 64u) {
      effect_sha256_transform(context, context->block);
      context->bit_count += 512u;
      context->block_length = 0u;
    }
  }
}

static void effect_sha256_finish(deckent_effect_sha256 *context, uint8_t output[32]) {
  uint32_t index;
  uint64_t bits = context->bit_count + (uint64_t)context->block_length * 8u;
  context->block[context->block_length++] = 0x80u;
  if (context->block_length > 56u) {
    while (context->block_length < 64u) context->block[context->block_length++] = 0u;
    effect_sha256_transform(context, context->block);
    context->block_length = 0u;
  }
  while (context->block_length < 56u) context->block[context->block_length++] = 0u;
  for (index = 0u; index < 8u; index += 1u) {
    context->block[63u-index] = (uint8_t)(bits >> (index * 8u));
  }
  effect_sha256_transform(context, context->block);
  for (index = 0u; index < 8u; index += 1u) {
    output[index*4u]=(uint8_t)(context->state[index]>>24);
    output[index*4u+1u]=(uint8_t)(context->state[index]>>16);
    output[index*4u+2u]=(uint8_t)(context->state[index]>>8);
    output[index*4u+3u]=(uint8_t)context->state[index];
  }
}

static void effect_digest_text(const uint8_t digest[32], char output[72]) {
  static const char hex[] = "0123456789abcdef";
  size_t index;
  memcpy(output, "sha256:", 7u);
  for (index = 0u; index < 32u; index += 1u) {
    output[7u+index*2u] = hex[digest[index] >> 4];
    output[8u+index*2u] = hex[digest[index] & 0x0fu];
  }
  output[71] = '\0';
}

static int close_effect_resource(uintptr_t opaque) {
  deckent_effect_resource *resource = (deckent_effect_resource *)opaque;
  int status = 0;
  if (resource == NULL || resource->magic != DECKENT_EFFECT_RESOURCE_MAGIC) return -1;
  resource->magic = 0u;
  if (resource->private_name != NULL && resource->parent_fd >= 0
      && unlinkat(resource->parent_fd, resource->private_name, 0) != 0
      && errno != ENOENT) status = -1;
  if (resource->fd >= 0 && close(resource->fd) != 0) status = -1;
  if (resource->parent_fd >= 0 && close(resource->parent_fd) != 0) status = -1;
  free(resource->private_name);
  free(resource);
  return status;
}

static deckent_effect_resource *create_effect_resource(
  napi_env env,
  deckent_effect_handle_kind kind,
  int fd
) {
  deckent_effect_resource *resource = calloc(1u, sizeof(*resource));
  struct stat status;
  deckent_posix_identity_snapshot identity;
  if (resource == NULL) {
    throw_typed(env, "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "execution-effect resource allocation failed");
    return NULL;
  }
  resource->magic = DECKENT_EFFECT_RESOURCE_MAGIC;
  resource->kind = kind;
  resource->fd = fd;
  resource->parent_fd = -1;
  if (fstat(fd, &status) != 0) {
    int saved_error = errno;
    free(resource);
    throw_errno_typed(env, saved_error);
    return NULL;
  }
  if (!capture_identity(env, fd, 0u, 0u, &identity)) {
    free(resource);
    return NULL;
  }
  resource->root_device = status.st_dev;
  resource->root_mount_id = identity.mount_id;
  return resource;
}

static bool effect_exact_input(
  napi_env env,
  deckent_native_state *state,
  deckent_effect_operation operation,
  size_t argc,
  napi_value *argv,
  napi_value *input
) {
  if (argc != 1u || argv == NULL
      || !deckent_effect_require_input_snapshot(env, state, argv[0], operation)) {
    return false;
  }
  *input = argv[0];
  return true;
}

static void effect_end_borrow_or_fatal(
  napi_env env,
  deckent_effect_borrow *borrow,
  const char *message
) {
  if (deckent_effect_end_borrow(env, borrow)) return;
  napi_fatal_error("deckent.execution-effect", NAPI_AUTO_LENGTH,
    message, NAPI_AUTO_LENGTH);
}

static bool effect_safe_relative_path(const char *path) {
  const char *cursor;
  const char *component;
  size_t total;
  if (path == NULL) return false;
  total = strlen(path);
  if (total == 0u || total > DECKENT_EFFECT_MAX_PATH_BYTES
      || path[0] == '/' || path[total - 1u] == '/' || strchr(path, '\\') != NULL) {
    return false;
  }
  if (strcmp(path, ".") == 0) return true;
  cursor = path;
  component = cursor;
  for (;;) {
    if (*cursor == '/' || *cursor == '\0') {
      size_t length = (size_t)(cursor - component);
      if (length == 0u || length > DECKENT_EFFECT_MAX_NAME_BYTES
          || (length == 1u && component[0] == '.')
          || (length == 2u && component[0] == '.' && component[1] == '.')) return false;
      if (*cursor == '\0') return true;
      component = cursor + 1;
    }
    cursor += 1;
  }
}

static bool effect_same_root_mount(
  const deckent_effect_resource *root,
  const deckent_posix_identity_snapshot *identity
);

static bool effect_valid_utf8(const char *value, size_t length) {
  const unsigned char *bytes = (const unsigned char *)value;
  size_t index = 0u;
  while (index < length) {
    unsigned char first = bytes[index++];
    uint32_t codepoint;
    size_t remaining;
    if (first <= 0x7fu) continue;
    if (first >= 0xc2u && first <= 0xdfu) {
      codepoint = (uint32_t)(first & 0x1fu);
      remaining = 1u;
    } else if (first >= 0xe0u && first <= 0xefu) {
      codepoint = (uint32_t)(first & 0x0fu);
      remaining = 2u;
    } else if (first >= 0xf0u && first <= 0xf4u) {
      codepoint = (uint32_t)(first & 0x07u);
      remaining = 3u;
    } else {
      return false;
    }
    if (remaining > length - index) return false;
    for (size_t offset = 0u; offset < remaining; offset += 1u) {
      unsigned char continuation = bytes[index++];
      if ((continuation & 0xc0u) != 0x80u) return false;
      codepoint = (codepoint << 6u) | (uint32_t)(continuation & 0x3fu);
    }
    if ((remaining == 1u && codepoint < 0x80u)
        || (remaining == 2u && codepoint < 0x800u)
        || (remaining == 3u && codepoint < 0x10000u)
        || (codepoint >= 0xd800u && codepoint <= 0xdfffu)
        || codepoint > 0x10ffffu) return false;
  }
  return true;
}

static bool effect_open_child_relative(
  napi_env env,
  const deckent_effect_resource *root,
  int parent_fd,
  const char *component,
  int *opened,
  deckent_posix_identity_snapshot *identity
) {
  int candidate = -1;
  int readable = -1;
  deckent_posix_identity_snapshot readable_identity;
  size_t length = component == NULL ? 0u : strlen(component);
  if (root == NULL || root->magic != DECKENT_EFFECT_RESOURCE_MAGIC
      || parent_fd < 0 || opened == NULL || identity == NULL
      || !valid_component(component) || !effect_valid_utf8(component, length)) {
    throw_typed(env, DECKENT_EFFECT_ERROR_ENVELOPE,
      "execution-effect directory entry encoding is invalid");
    return false;
  }
  candidate = openat(parent_fd, component, O_PATH | O_NOFOLLOW | O_CLOEXEC);
  if (candidate < 0) { throw_errno_typed(env, errno); return false; }
  if (!capture_identity(env, candidate, DECKENT_NATIVE_EVIDENCE_COMPONENT_NOFOLLOW,
        DECKENT_POSIX_CAP_STABLE_OBJECT_ID, identity)) goto failed;
  if (!effect_same_root_mount(root, identity)) {
    throw_typed(env, DECKENT_NATIVE_ERROR_VOLUME_UNSUPPORTED,
      "execution-effect traversal crossed a filesystem or mount boundary");
    goto failed;
  }
  if (S_ISDIR(identity->status.st_mode)) {
    readable = openat(parent_fd, component,
      O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (readable < 0) { throw_errno_typed(env, errno); goto failed; }
    if (!capture_identity(env, readable, DECKENT_NATIVE_EVIDENCE_COMPONENT_NOFOLLOW,
          DECKENT_POSIX_CAP_STABLE_OBJECT_ID, &readable_identity)) goto failed;
    if (!same_snapshot(identity, &readable_identity)
        || !effect_same_root_mount(root, &readable_identity)) {
      throw_typed(env, DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
        "execution-effect readable directory identity changed");
      goto failed;
    }
    if (!close_owned_fd(&candidate)) {
      throw_typed(env, DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "execution-effect path descriptor cleanup was not confirmed");
      goto failed;
    }
    candidate = readable;
    readable = -1;
    *identity = readable_identity;
  }
  *opened = candidate;
  return true;
failed:
  (void)close_owned_fd(&readable);
  (void)close_owned_fd(&candidate);
  return false;
}

static int effect_open_ingress_root(const char *path) {
  int current = -1;
  int next = -1;
  char *copy;
  char *cursor;
  char *component;
  if (!valid_ingress_path(path)) { errno = EINVAL; return -1; }
  current = open("/", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (current < 0 || strcmp(path, "/") == 0) return current;
  copy = strdup(path + 1);
  if (copy == NULL) { close(current); errno = ENOMEM; return -1; }
  cursor = copy;
  component = copy;
  for (;;) {
    if (*cursor == '/' || *cursor == '\0') {
      char saved = *cursor;
      *cursor = '\0';
      if (!valid_component(component)) {
        free(copy);
        close(current);
        errno = EINVAL;
        return -1;
      }
      next = openat(current, component,
        O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
      if (next < 0) { int error = errno; free(copy); close(current); errno = error; return -1; }
      if (close(current) != 0) { int error = errno; free(copy); close(next); errno = error; return -1; }
      current = next;
      if (saved == '\0') break;
      component = cursor + 1;
    }
    cursor += 1;
  }
  free(copy);
  return current;
}

static uint64_t effect_read_be64(const uint8_t *bytes) {
  uint64_t value = 0u;
  size_t index;
  for (index = 0u; index < 8u; index += 1u) value = (value << 8u) | bytes[index];
  return value;
}

static uint32_t effect_read_be32(const uint8_t *bytes) {
  return ((uint32_t)bytes[0] << 24) | ((uint32_t)bytes[1] << 16)
    | ((uint32_t)bytes[2] << 8) | (uint32_t)bytes[3];
}

static bool effect_copy_bytes(
  napi_env env,
  napi_value value,
  size_t maximum,
  uint8_t **copy,
  size_t *length
) {
  bool typed = false;
  bool array_buffer = false;
  napi_typedarray_type array_type;
  size_t element_count = 0u;
  void *data = NULL;
  napi_value backing;
  size_t byte_offset = 0u;
  uint8_t *snapshot;
  if (napi_is_typedarray(env, value, &typed) != napi_ok || !typed
      || napi_get_typedarray_info(env, value, &array_type, &element_count,
        &data, &backing, &byte_offset) != napi_ok
      || array_type != napi_uint8_array
      || napi_is_arraybuffer(env, backing, &array_buffer) != napi_ok || !array_buffer
      || element_count > maximum || (element_count > 0u && data == NULL)) {
    throw_typed(env, DECKENT_EFFECT_ERROR_ENVELOPE,
      "execution-effect byte input is invalid");
    return false;
  }
  snapshot = malloc(element_count == 0u ? 1u : element_count);
  if (snapshot == NULL) {
    throw_typed(env, "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "execution-effect byte snapshot allocation failed");
    return false;
  }
  if (element_count > 0u) {
    memcpy(snapshot, data, element_count);
    if (memcmp(snapshot, data, element_count) != 0) {
      free(snapshot);
      throw_typed(env, DECKENT_EFFECT_ERROR_ENVELOPE,
        "execution-effect byte input changed during native snapshot");
      return false;
    }
  }
  *copy = snapshot;
  *length = element_count;
  return true;
}

static bool effect_parse_limits(
  napi_env env,
  napi_value input,
  deckent_effect_limits *limits
) {
  napi_value value;
  uint8_t *bytes = NULL;
  size_t length = 0u;
  if (!get_named_value(env, input, "limits", &value)
      || !effect_copy_bytes(env, value, DECKENT_EFFECT_LIMITS_BYTES, &bytes, &length)) return false;
  if (length != DECKENT_EFFECT_LIMITS_BYTES || effect_read_be32(bytes) != 1u
      || effect_read_be32(bytes + 20u) != 0u) {
    free(bytes);
    throw_typed(env, DECKENT_EFFECT_ERROR_ENVELOPE,
      "execution-effect limits envelope is invalid");
    return false;
  }
  limits->max_entries = effect_read_be32(bytes + 4u);
  limits->max_depth = effect_read_be32(bytes + 8u);
  limits->max_path_bytes = effect_read_be32(bytes + 12u);
  limits->max_name_bytes = effect_read_be32(bytes + 16u);
  limits->max_file_bytes = effect_read_be64(bytes + 24u);
  limits->max_total_bytes = effect_read_be64(bytes + 32u);
  limits->max_manifest_bytes = effect_read_be64(bytes + 40u);
  limits->deadline_unix_ms = effect_read_be64(bytes + 48u);
  free(bytes);
  if (limits->max_entries == 0u || limits->max_entries > DECKENT_EFFECT_MAX_ENTRIES
      || limits->max_depth == 0u || limits->max_depth > DECKENT_EFFECT_MAX_DEPTH
      || limits->max_path_bytes == 0u || limits->max_path_bytes > DECKENT_EFFECT_MAX_PATH_BYTES
      || limits->max_name_bytes == 0u || limits->max_name_bytes > DECKENT_EFFECT_MAX_NAME_BYTES
      || limits->max_file_bytes == 0u || limits->max_file_bytes > DECKENT_EFFECT_MAX_FILE_BYTES
      || limits->max_total_bytes == 0u || limits->max_total_bytes > DECKENT_EFFECT_MAX_TOTAL_BYTES
      || limits->max_manifest_bytes == 0u
      || limits->max_manifest_bytes > DECKENT_EFFECT_MAX_AGGREGATE_PATH_BYTES
      || limits->max_file_bytes > limits->max_total_bytes
      || limits->max_name_bytes > limits->max_path_bytes
      || limits->deadline_unix_ms == 0u) {
    throw_typed(env, DECKENT_EFFECT_ERROR_BOUNDS,
      "execution-effect capture bounds exceed the ABI ceiling");
    return false;
  }
  return true;
}

static bool effect_deadline_ok(napi_env env, uint64_t deadline_unix_ms) {
  struct timespec now;
  uint64_t now_ms;
  if (clock_gettime(CLOCK_REALTIME, &now) != 0 || now.tv_sec < 0) {
    throw_typed(env, DECKENT_EFFECT_ERROR_DEADLINE,
      "execution-effect deadline clock is unavailable");
    return false;
  }
  now_ms = (uint64_t)now.tv_sec * 1000u + (uint64_t)now.tv_nsec / 1000000u;
  if (now_ms > deadline_unix_ms) {
    throw_typed(env, DECKENT_EFFECT_ERROR_DEADLINE,
      "execution-effect deadline expired");
    return false;
  }
  return true;
}

static void effect_identity_digest(
  const deckent_posix_identity_snapshot *identity,
  char output[72]
) {
  deckent_effect_sha256 hash;
  uint8_t digest[32];
  char canonical[256];
  int length = snprintf(canonical, sizeof(canonical),
    "v1|%ju|%ju|%ju|%ju",
    (uintmax_t)identity->status.st_dev, (uintmax_t)identity->mount_id,
    (uintmax_t)identity->status.st_ino, (uintmax_t)identity->status.st_uid);
  effect_sha256_init(&hash);
  if (length > 0) effect_sha256_update(&hash, (const uint8_t *)canonical, (size_t)length);
  effect_sha256_finish(&hash, digest);
  effect_digest_text(digest, output);
}

static napi_value effect_result_start(napi_env env, const char *kind, const char *state) {
  napi_value result = deckent_effect_create_result_record(env);
  if (result == NULL || !set_named_uint32(env, result, "schemaVersion", 1u)
      || !set_named_string(env, result, "kind", kind)
      || !set_named_string(env, result, "state", state)) return NULL;
  return result;
}

static bool effect_result_finish(
  napi_env env,
  napi_value result,
  deckent_effect_operation operation
) {
  return deckent_effect_finalize_result_record(env, result, operation);
}

static napi_value effect_open_root(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  char *kind_text = NULL;
  char *path = NULL;
  deckent_effect_handle_kind kind;
  int fd = -1;
  deckent_effect_resource *resource = NULL;
  napi_value handle;
  napi_value result;
  deckent_posix_identity_snapshot identity;
  char identity_digest[72];
  if (!effect_exact_input(env, state, DECKENT_EFFECT_OPERATION_OPEN_ROOT,
        argc, argv, &input)
      || !get_named_string_alloc(env, input, "rootKind", 16u, &kind_text)
      || !get_named_string_alloc(env, input, "path",
        DECKENT_POSIX_MAX_INGRESS_PATH_BYTES, &path)) goto failed;
  if (strcmp(kind_text, "PROJECT") == 0) kind = DECKENT_EFFECT_HANDLE_PROJECT_ROOT;
  else if (strcmp(kind_text, "WORKSPACE") == 0) kind = DECKENT_EFFECT_HANDLE_WORKSPACE_ROOT;
  else if (strcmp(kind_text, "STAGING") == 0) kind = DECKENT_EFFECT_HANDLE_STAGING_ROOT;
  else { throw_typed(env, "E_EXEC_AUTH_NATIVE_ARGUMENT", "effect root kind is invalid"); goto failed; }
  fd = effect_open_ingress_root(path);
  if (fd < 0) { throw_errno_typed(env, errno); goto failed; }
  if (!capture_identity(env, fd, DECKENT_NATIVE_EVIDENCE_COMPONENT_NOFOLLOW,
        DECKENT_POSIX_CAP_STABLE_OBJECT_ID, &identity)
      || !S_ISDIR(identity.status.st_mode)) goto failed;
  resource = create_effect_resource(env, kind, fd);
  if (resource == NULL) goto failed;
  fd = -1;
  handle = deckent_effect_create_handle(env, state, kind,
    kind == DECKENT_EFFECT_HANDLE_PROJECT_ROOT
      ? DECKENT_EFFECT_RIGHT_SCAN | DECKENT_EFFECT_RIGHT_INSPECT
        | DECKENT_EFFECT_RIGHT_APPLY | DECKENT_EFFECT_RIGHT_RECONCILE
        | DECKENT_EFFECT_RIGHT_VERIFY
      : (kind == DECKENT_EFFECT_HANDLE_WORKSPACE_ROOT
        ? DECKENT_EFFECT_RIGHT_SCAN | DECKENT_EFFECT_RIGHT_INSPECT
          | DECKENT_EFFECT_RIGHT_SOURCE_READ
        : DECKENT_EFFECT_RIGHT_STAGE | DECKENT_EFFECT_RIGHT_INSPECT),
    (uintptr_t)resource, close_effect_resource);
  if (handle == NULL) { resource = NULL; goto failed; }
  resource = NULL;
  effect_identity_digest(&identity, identity_digest);
  result = effect_result_start(env, "execution-effect-root", "OPENED");
  if (result == NULL || !set_named_value(env, result, "handle", handle)
      || !set_named_string(env, result, "identityDigest", identity_digest)
      || !set_named_string(env, result, "rootKind", kind_text)
      || !effect_result_finish(env, result, DECKENT_EFFECT_OPERATION_OPEN_ROOT)) goto failed;
  free(kind_text);
  free(path);
  return result;
failed:
  free(kind_text);
  free(path);
  if (fd >= 0) close(fd);
  if (resource != NULL) (void)close_effect_resource((uintptr_t)resource);
  return NULL;
}

static bool effect_same_root_mount(
  const deckent_effect_resource *root,
  const deckent_posix_identity_snapshot *identity
) {
  return root != NULL && root->root_device == identity->status.st_dev
    && root->root_mount_id == identity->mount_id;
}

static bool effect_open_relative(
  napi_env env,
  const deckent_effect_resource *root,
  const char *path,
  int *opened,
  deckent_posix_identity_snapshot *identity
) {
  int current = -1;
  int next = -1;
  char *copy = NULL;
  char *cursor;
  char *component;
  if (root == NULL || root->magic != DECKENT_EFFECT_RESOURCE_MAGIC
      || !effect_safe_relative_path(path)) {
    throw_typed(env, DECKENT_NATIVE_ERROR_INVALID_COMPONENT,
      "execution-effect relative path is invalid");
    return false;
  }
  current = dup(root->fd);
  if (current < 0) { throw_errno_typed(env, errno); return false; }
  if (strcmp(path, ".") == 0) {
    if (!capture_identity(env, current, DECKENT_NATIVE_EVIDENCE_COMPONENT_NOFOLLOW,
          DECKENT_POSIX_CAP_STABLE_OBJECT_ID, identity)) goto failed;
    if (!effect_same_root_mount(root, identity)) {
      throw_typed(env, DECKENT_NATIVE_ERROR_VOLUME_UNSUPPORTED,
        "execution-effect root mount identity changed");
      goto failed;
    }
    *opened = current;
    return true;
  }
  copy = strdup(path);
  if (copy == NULL) { throw_typed(env, "E_EXEC_AUTH_NATIVE_ALLOCATION",
    "execution-effect path allocation failed"); goto failed; }
  cursor = copy;
  component = copy;
  for (;;) {
    if (*cursor == '/' || *cursor == '\0') {
      char saved = *cursor;
      *cursor = '\0';
      if (!effect_open_child_relative(
            env, root, current, component, &next, identity)) goto failed;
      if (saved != '\0' && !S_ISDIR(identity->status.st_mode)) {
        throw_typed(env, DECKENT_NATIVE_ERROR_OBJECT_TYPE_MISMATCH,
          "execution-effect path component is not a directory");
        goto failed;
      }
      if (!close_owned_fd(&current)) {
        throw_typed(env, DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
          "execution-effect traversal descriptor cleanup was not confirmed");
        goto failed;
      }
      current = next;
      next = -1;
      if (saved == '\0') break;
      component = cursor + 1;
    }
    cursor += 1;
  }
  free(copy);
  *opened = current;
  return true;
failed:
  free(copy);
  (void)close_owned_fd(&next);
  (void)close_owned_fd(&current);
  return false;
}

static bool effect_hash_regular_file(
  napi_env env,
  int path_fd,
  uint64_t max_bytes,
  uint64_t deadline_unix_ms,
  const deckent_posix_identity_snapshot *before,
  char digest_text[72]
) {
  int fd;
  uint8_t buffer[DECKENT_EFFECT_IO_BUFFER_BYTES];
  uint64_t observed = 0u;
  ssize_t count;
  deckent_effect_sha256 hash;
  uint8_t digest[32];
  deckent_posix_identity_snapshot after;
  char proc_path[64];
  if (!S_ISREG(before->status.st_mode)) return false;
  if (before->status.st_nlink != 1) {
    throw_typed(env, DECKENT_NATIVE_ERROR_LINK_COUNT_UNSAFE,
      "execution-effect rejects hard-linked content before read");
    return false;
  }
  if (before->status.st_size < 0 || (uint64_t)before->status.st_size > max_bytes) {
    throw_typed(env, DECKENT_EFFECT_ERROR_BOUNDS,
      "execution-effect file exceeds its capture bound");
    return false;
  }
  if (snprintf(proc_path, sizeof(proc_path), "/proc/self/fd/%d", path_fd) <= 0) return false;
  fd = open(proc_path, O_RDONLY | O_CLOEXEC);
  if (fd < 0) { throw_errno_typed(env, errno); return false; }
  effect_sha256_init(&hash);
  for (;;) {
    if (deadline_unix_ms != 0u && !effect_deadline_ok(env, deadline_unix_ms)) {
      close(fd);
      return false;
    }
    count = read(fd, buffer, sizeof(buffer));
    if (count < 0) {
      if (errno == EINTR) continue;
      close(fd);
      throw_errno_typed(env, errno);
      return false;
    }
    if (count == 0) break;
    if ((uint64_t)count > max_bytes - observed) {
      close(fd);
      throw_typed(env, DECKENT_EFFECT_ERROR_BOUNDS,
        "execution-effect file exceeded its capture bound during read");
      return false;
    }
    observed += (uint64_t)count;
    effect_sha256_update(&hash, buffer, (size_t)count);
  }
  if (!capture_identity(env, fd, DECKENT_NATIVE_EVIDENCE_COMPONENT_NOFOLLOW,
        DECKENT_POSIX_CAP_STABLE_OBJECT_ID, &after)) { close(fd); return false; }
  if (close(fd) != 0) { throw_errno_typed(env, errno); return false; }
  if (!same_snapshot(before, &after) || observed != (uint64_t)before->status.st_size) {
    throw_typed(env, DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "execution-effect file changed during streaming digest");
    return false;
  }
  effect_sha256_finish(&hash, digest);
  effect_digest_text(digest, digest_text);
  return true;
}

static bool effect_create_entry_record(
  napi_env env,
  const char *path,
  int fd,
  const deckent_posix_identity_snapshot *identity,
  uint64_t max_file_bytes,
  uint64_t deadline_unix_ms,
  napi_value *entry
) {
  char object_digest[72];
  char content_digest[72];
  char mode[8];
  char size_text[32];
  const char *kind;
  if (S_ISLNK(identity->status.st_mode)) {
    throw_typed(env, DECKENT_NATIVE_ERROR_REPARSE_REJECTED,
      "execution-effect rejects symbolic links");
    return false;
  }
  if (!S_ISDIR(identity->status.st_mode) && !S_ISREG(identity->status.st_mode)) {
    throw_typed(env, DECKENT_NATIVE_ERROR_OBJECT_TYPE_MISMATCH,
      "execution-effect rejects special filesystem objects");
    return false;
  }
  if (S_ISREG(identity->status.st_mode) && identity->status.st_nlink != 1) {
    throw_typed(env, DECKENT_NATIVE_ERROR_LINK_COUNT_UNSAFE,
      "execution-effect requires a single-link entry");
    return false;
  }
  effect_identity_digest(identity, object_digest);
  kind = S_ISDIR(identity->status.st_mode) ? "DIRECTORY" : "REGULAR_FILE";
  if (snprintf(mode, sizeof(mode), "%04o", identity->status.st_mode & 0777) != 4) return false;
  if (S_ISREG(identity->status.st_mode)
      && (!effect_hash_regular_file(env, fd, max_file_bytes,
          deadline_unix_ms, identity, content_digest)
        || snprintf(size_text, sizeof(size_text), "%ju",
          (uintmax_t)identity->status.st_size) <= 0)) return false;
  if (napi_create_object(env, entry) != napi_ok
      || (S_ISREG(identity->status.st_mode)
        ? !set_named_string(env, *entry, "contentDigest", content_digest)
        : !set_named_null(env, *entry, "contentDigest"))
      || !set_named_string(env, *entry, "kind", kind)
      || !set_named_string(env, *entry, "mode", mode)
      || !set_named_string(env, *entry, "objectIdentityDigest", object_digest)
      || !set_named_string(env, *entry, "path", path)
      || !set_named_uint32(env, *entry, "schemaVersion", 1u)) return false;
  if (S_ISREG(identity->status.st_mode)) {
    if (!set_named_string(env, *entry, "size", size_text)) return false;
  } else if (!set_named_null(env, *entry, "size")) return false;
  return freeze_object(env, *entry);
}

static napi_value effect_inspect_entry(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value root_value;
  char *path = NULL;
  deckent_effect_borrow borrow = {0};
  deckent_effect_resource *root;
  int fd = -1;
  deckent_posix_identity_snapshot identity;
  napi_value entry;
  napi_value result;
  if (!effect_exact_input(env, state, DECKENT_EFFECT_OPERATION_INSPECT_ENTRY,
        argc, argv, &input)
      || !get_named_value(env, input, "root", &root_value)
      || !get_named_string_alloc(env, input, "path", DECKENT_EFFECT_MAX_PATH_BYTES, &path)
      || !deckent_effect_borrow_handle(env, state, root_value,
        DECKENT_EFFECT_HANDLE_ANY, DECKENT_EFFECT_RIGHT_INSPECT, &borrow)) goto failed;
  root = (deckent_effect_resource *)borrow.resource;
  if (!effect_open_relative(env, root, path, &fd, &identity)) {
    bool pending = false;
    napi_is_exception_pending(env, &pending);
    if (pending) goto failed;
    goto failed;
  }
  if (!effect_create_entry_record(env, path, fd, &identity,
        DECKENT_EFFECT_MAX_FILE_BYTES, 0u, &entry)) goto failed;
  if (close(fd) != 0) { fd = -1; throw_errno_typed(env, errno); goto failed; }
  fd = -1;
  result = effect_result_start(env, "execution-effect-inspection", "PRESENT");
  if (result == NULL || !set_named_value(env, result, "entry", entry)
      || !effect_result_finish(env, result, DECKENT_EFFECT_OPERATION_INSPECT_ENTRY)) goto failed;
  if (!deckent_effect_end_borrow(env, &borrow)) goto failed;
  free(path);
  return result;
failed:
  if (fd >= 0) close(fd);
  if (borrow.active) effect_end_borrow_or_fatal(env, &borrow,
    "execution-effect inspect borrow cleanup failed");
  free(path);
  return NULL;
}

static bool effect_get_nonnegative_safe_u64(
  napi_env env,
  napi_value input,
  const char *name,
  uint64_t maximum,
  uint64_t *output
) {
  napi_value field;
  napi_valuetype type;
  double number;
  if (!get_named_value(env, input, name, &field)
      || napi_typeof(env, field, &type) != napi_ok || type != napi_number
      || napi_get_value_double(env, field, &number) != napi_ok
      || !isfinite(number) || number < 0.0 || floor(number) != number
      || number > 9007199254740991.0 || number > (double)maximum) {
    throw_typed(env, DECKENT_EFFECT_ERROR_BOUNDS,
      "execution-effect size field is invalid");
    return false;
  }
  *output = (uint64_t)number;
  return true;
}

static bool effect_digest_is_canonical(const char *value) {
  size_t index;
  if (value == NULL || strlen(value) != 71u || memcmp(value, "sha256:", 7u) != 0) return false;
  for (index = 7u; index < 71u; index += 1u) {
    if (!((value[index] >= '0' && value[index] <= '9')
        || (value[index] >= 'a' && value[index] <= 'f'))) return false;
  }
  return true;
}

static bool effect_source_chunk_value(
  napi_env env,
  size_t length,
  napi_value *value,
  uint8_t **bytes
) {
  napi_value backing;
  void *data = NULL;
  if (napi_create_arraybuffer(env, length, &data, &backing) != napi_ok
      || (length > 0u && data == NULL)
      || napi_create_typedarray(env, napi_uint8_array, length, backing, 0u, value)
        != napi_ok) {
    throw_typed(env, "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "execution-effect source chunk allocation failed");
    return false;
  }
  *bytes = (uint8_t *)data;
  return true;
}

static bool effect_source_identity_unchanged(
  napi_env env,
  const deckent_effect_resource *source
) {
  deckent_posix_identity_snapshot observed;
  if (source == NULL || source->magic != DECKENT_EFFECT_RESOURCE_MAGIC
      || source->kind != DECKENT_EFFECT_HANDLE_SOURCE_READ
      || !capture_identity(env, source->fd,
        DECKENT_NATIVE_EVIDENCE_COMPONENT_NOFOLLOW,
        DECKENT_POSIX_CAP_STABLE_OBJECT_ID, &observed)) return false;
  if (!S_ISREG(observed.status.st_mode) || observed.status.st_nlink != 1
      || observed.status.st_dev != source->root_device
      || observed.mount_id != source->root_mount_id
      || !same_snapshot(&source->source_identity, &observed)) {
    throw_typed(env, DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "execution-effect source identity changed before content read");
    return false;
  }
  return true;
}

static napi_value effect_begin_source_read(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value root_value;
  char *path = NULL;
  char *expected_digest = NULL;
  uint64_t expected_mode_value;
  uint64_t expected_size;
  uint64_t deadline_unix_ms;
  uint64_t max_chunk_bytes;
  deckent_effect_borrow borrow = {0};
  deckent_effect_resource *root;
  deckent_effect_resource *source = NULL;
  int path_fd = -1;
  int source_fd = -1;
  char proc_path[64];
  deckent_posix_identity_snapshot path_identity;
  deckent_posix_identity_snapshot source_identity;
  char source_identity_digest[72];
  char mode[8];
  napi_value handle;
  napi_value result;
  if (!effect_exact_input(env, state, DECKENT_EFFECT_OPERATION_BEGIN_SOURCE_READ,
        argc, argv, &input)
      || !get_named_value(env, input, "workspaceRoot", &root_value)
      || !get_named_string_alloc(env, input, "path", DECKENT_EFFECT_MAX_PATH_BYTES, &path)
      || !effect_get_nonnegative_safe_u64(env, input, "expectedMode", 0777u,
        &expected_mode_value)
      || !effect_get_nonnegative_safe_u64(env, input, "expectedSize",
        DECKENT_EFFECT_MAX_FILE_BYTES, &expected_size)
      || !get_named_string_alloc(env, input, "expectedContentDigest", 71u,
        &expected_digest)
      || !effect_get_nonnegative_safe_u64(env, input, "deadlineUnixMs",
        UINT64_C(9007199254740991), &deadline_unix_ms)
      || !effect_get_nonnegative_safe_u64(env, input, "maxChunkBytes",
        UINT64_C(67108864), &max_chunk_bytes)) goto failed;
  if (!effect_digest_is_canonical(expected_digest)) {
    throw_typed(env, DECKENT_EFFECT_ERROR_ENVELOPE,
      "execution-effect source digest authority is invalid");
    goto failed;
  }
  if (deadline_unix_ms == 0u || max_chunk_bytes == 0u) {
    throw_typed(env, DECKENT_EFFECT_ERROR_BOUNDS,
      "execution-effect source read bounds are invalid");
    goto failed;
  }
  if (!effect_deadline_ok(env, deadline_unix_ms)
      || !deckent_effect_borrow_handle(env, state, root_value,
        DECKENT_EFFECT_HANDLE_WORKSPACE_ROOT, DECKENT_EFFECT_RIGHT_SOURCE_READ,
        &borrow)) goto failed;
  root = (deckent_effect_resource *)borrow.resource;
  if (!effect_open_relative(env, root, path, &path_fd, &path_identity)) goto failed;
  if (!S_ISREG(path_identity.status.st_mode)) {
    throw_typed(env, DECKENT_NATIVE_ERROR_OBJECT_TYPE_MISMATCH,
      "execution-effect source is not a regular file");
    goto failed;
  }
  if (path_identity.status.st_nlink != 1) {
    throw_typed(env, DECKENT_NATIVE_ERROR_LINK_COUNT_UNSAFE,
      "execution-effect rejects hard-linked source content before read");
    goto failed;
  }
  if (path_identity.status.st_size < 0
      || (uint64_t)path_identity.status.st_size != expected_size
      || (path_identity.status.st_mode & 0777) != (mode_t)expected_mode_value) {
    throw_typed(env, DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "execution-effect source preimage does not match prepared authority");
    goto failed;
  }
  if (snprintf(proc_path, sizeof(proc_path), "/proc/self/fd/%d", path_fd) <= 0) {
    throw_typed(env, DECKENT_NATIVE_ERROR_IO_UNCONFIRMED,
      "execution-effect source descriptor alias is unavailable");
    goto failed;
  }
  source_fd = open(proc_path, O_RDONLY | O_CLOEXEC);
  if (source_fd < 0) { throw_errno_typed(env, errno); goto failed; }
  if (!capture_identity(env, source_fd, DECKENT_NATIVE_EVIDENCE_COMPONENT_NOFOLLOW,
        DECKENT_POSIX_CAP_STABLE_OBJECT_ID, &source_identity)
      || !same_snapshot(&path_identity, &source_identity)
      || !effect_same_root_mount(root, &source_identity)
      || source_identity.status.st_nlink != 1) {
    throw_typed(env, DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "execution-effect source identity changed before streaming");
    goto failed;
  }
  if (close(path_fd) != 0) { path_fd = -1; throw_errno_typed(env, errno); goto failed; }
  path_fd = -1;
  source = create_effect_resource(env, DECKENT_EFFECT_HANDLE_SOURCE_READ, source_fd);
  if (source == NULL) goto failed;
  source_fd = -1;
  source->source_identity = source_identity;
  source->expected_mode = (mode_t)expected_mode_value;
  source->expected_bytes = expected_size;
  source->deadline_unix_ms = deadline_unix_ms;
  source->max_chunk_bytes = max_chunk_bytes;
  memcpy(source->expected_digest, expected_digest, 72u);
  effect_sha256_init(&source->content_hash);
  handle = deckent_effect_create_handle(env, state,
    DECKENT_EFFECT_HANDLE_SOURCE_READ,
    DECKENT_EFFECT_RIGHT_SOURCE_READ | DECKENT_EFFECT_RIGHT_SOURCE_FINISH,
    (uintptr_t)source, close_effect_resource);
  if (handle == NULL) { source = NULL; goto failed; }
  source = NULL;
  effect_identity_digest(&source_identity, source_identity_digest);
  if (snprintf(mode, sizeof(mode), "%04o", (unsigned int)expected_mode_value) != 4) goto failed;
  result = effect_result_start(env, "execution-effect-source-read", "OPEN");
  if (result == NULL
      || !set_named_string(env, result, "contentDigest", expected_digest)
      || !set_named_double(env, result, "deadlineUnixMs", (double)deadline_unix_ms)
      || !set_named_value(env, result, "handle", handle)
      || !set_named_double(env, result, "maxChunkBytes", (double)max_chunk_bytes)
      || !set_named_string(env, result, "mode", mode)
      || !set_named_string(env, result, "path", path)
      || !set_named_string(env, result, "sourceObjectIdentityDigest", source_identity_digest)
      || !set_named_double(env, result, "totalBytes", (double)expected_size)
      || !effect_result_finish(env, result,
        DECKENT_EFFECT_OPERATION_BEGIN_SOURCE_READ)) goto failed;
  effect_end_borrow_or_fatal(env, &borrow,
    "execution-effect source-root borrow cleanup failed");
  free(path);
  free(expected_digest);
  return result;
failed:
  if (source != NULL) (void)close_effect_resource((uintptr_t)source);
  if (source_fd >= 0) close(source_fd);
  if (path_fd >= 0) close(path_fd);
  if (borrow.active) effect_end_borrow_or_fatal(env, &borrow,
    "execution-effect failed source-root borrow cleanup");
  free(path);
  free(expected_digest);
  return NULL;
}

static napi_value effect_next_source_chunk(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value handle_value;
  char *cancel_state = NULL;
  deckent_effect_borrow borrow = {0};
  deckent_effect_resource *source = NULL;
  bool cursor_advanced = false;
  uint64_t remaining;
  size_t requested;
  size_t offset = 0u;
  ssize_t count;
  napi_value bytes_value;
  uint8_t *bytes = NULL;
  deckent_effect_sha256 chunk_hash;
  uint8_t chunk_digest[32];
  char chunk_digest_text[72];
  uint64_t chunk_index;
  uint64_t byte_offset;
  napi_value result;
  if (!effect_exact_input(env, state, DECKENT_EFFECT_OPERATION_NEXT_SOURCE_CHUNK,
        argc, argv, &input)
      || !get_named_value(env, input, "sourceRead", &handle_value)
      || !get_named_string_alloc(env, input, "cancelState", 16u, &cancel_state)) goto failed;
  if (strcmp(cancel_state, "CANCELLED") == 0) {
    throw_typed(env, DECKENT_EFFECT_ERROR_CANCELLED,
      "execution-effect source read was cancelled");
    goto failed;
  }
  if (strcmp(cancel_state, "ACTIVE") != 0) {
    throw_typed(env, DECKENT_EFFECT_ERROR_ENVELOPE,
      "execution-effect source cancel state is invalid");
    goto failed;
  }
  if (!deckent_effect_borrow_handle(env, state, handle_value,
        DECKENT_EFFECT_HANDLE_SOURCE_READ, DECKENT_EFFECT_RIGHT_SOURCE_READ,
        &borrow)) goto failed;
  source = (deckent_effect_resource *)borrow.resource;
  if (source->sealed || source->failed) {
    throw_typed(env, "E_EXEC_AUTH_NATIVE_HANDLE_STATE",
      "execution-effect source read is terminal");
    goto failed;
  }
  if (source->observed_bytes > source->expected_bytes
      || (source->observed_bytes == source->expected_bytes && source->chunk_count != 0u)) {
    throw_typed(env, DECKENT_EFFECT_ERROR_BOUNDS,
      "execution-effect source cursor is already complete");
    goto failed;
  }
  if (!effect_deadline_ok(env, source->deadline_unix_ms)) goto failed;
  remaining = source->expected_bytes - source->observed_bytes;
  requested = (size_t)(remaining < source->max_chunk_bytes
    ? remaining : source->max_chunk_bytes);
  if (!effect_source_chunk_value(env, requested, &bytes_value, &bytes)) goto failed;
  while (offset < requested) {
    if (strcmp(cancel_state, "ACTIVE") != 0) {
      throw_typed(env, DECKENT_EFFECT_ERROR_CANCELLED,
        "execution-effect source read was cancelled");
      goto failed;
    }
    if (!effect_deadline_ok(env, source->deadline_unix_ms)) goto failed;
    if (!effect_source_identity_unchanged(env, source)) goto failed;
    count = read(source->fd, bytes + offset, requested - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) {
      throw_typed(env, DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
        "execution-effect source ended before its prepared size");
      goto failed;
    }
    cursor_advanced = true;
    offset += (size_t)count;
  }
  byte_offset = source->observed_bytes;
  chunk_index = source->chunk_count;
  effect_sha256_init(&chunk_hash);
  effect_sha256_update(&chunk_hash, bytes, requested);
  effect_sha256_finish(&chunk_hash, chunk_digest);
  effect_digest_text(chunk_digest, chunk_digest_text);
  effect_sha256_update(&source->content_hash, bytes, requested);
  source->observed_bytes += (uint64_t)requested;
  source->chunk_count += 1u;
  cursor_advanced = true;
  result = effect_result_start(env, "execution-effect-source-chunk", "CHUNK");
  if (result == NULL
      || !set_named_double(env, result, "byteLength", (double)requested)
      || !set_named_double(env, result, "byteOffset", (double)byte_offset)
      || !set_named_value(env, result, "bytes", bytes_value)
      || !set_named_string(env, result, "contentDigest", chunk_digest_text)
      || !set_named_double(env, result, "index", (double)chunk_index)
      || !set_named_double(env, result, "observedBytes", (double)source->observed_bytes)
      || !effect_result_finish(env, result,
        DECKENT_EFFECT_OPERATION_NEXT_SOURCE_CHUNK)) goto failed;
  effect_end_borrow_or_fatal(env, &borrow,
    "execution-effect source chunk borrow cleanup failed");
  free(cancel_state);
  return result;
failed:
  if (source != NULL && cursor_advanced) source->failed = true;
  if (borrow.active) effect_end_borrow_or_fatal(env, &borrow,
    "execution-effect failed source chunk borrow cleanup");
  free(cancel_state);
  return NULL;
}

static napi_value effect_finish_source_read(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value handle_value;
  deckent_effect_borrow borrow = {0};
  deckent_effect_resource *source = NULL;
  uint8_t trailing;
  ssize_t count;
  deckent_posix_identity_snapshot after;
  deckent_effect_sha256 final_hash;
  uint8_t digest[32];
  char digest_text[72];
  char source_identity_digest[72];
  napi_value result;
  if (!effect_exact_input(env, state, DECKENT_EFFECT_OPERATION_FINISH_SOURCE_READ,
        argc, argv, &input)
      || !get_named_value(env, input, "sourceRead", &handle_value)
      || !deckent_effect_borrow_handle(env, state, handle_value,
        DECKENT_EFFECT_HANDLE_SOURCE_READ, DECKENT_EFFECT_RIGHT_SOURCE_FINISH,
        &borrow)) return NULL;
  source = (deckent_effect_resource *)borrow.resource;
  if (source->sealed || source->failed) {
    throw_typed(env, "E_EXEC_AUTH_NATIVE_HANDLE_STATE",
      "execution-effect source read is terminal");
    goto failed;
  }
  if (source->chunk_count == 0u
      || source->observed_bytes != source->expected_bytes) {
    throw_typed(env, DECKENT_EFFECT_ERROR_BOUNDS,
      "execution-effect source cursor is incomplete");
    goto failed;
  }
  if (!effect_deadline_ok(env, source->deadline_unix_ms)) goto failed;
  for (;;) {
    if (!effect_deadline_ok(env, source->deadline_unix_ms)) goto failed;
    if (!effect_source_identity_unchanged(env, source)) goto failed;
    count = read(source->fd, &trailing, 1u);
    if (count < 0 && errno == EINTR) continue;
    break;
  }
  if (count != 0) {
    if (count < 0) throw_errno_typed(env, errno);
    else throw_typed(env, DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "execution-effect source grew beyond its prepared size");
    goto failed;
  }
  if (!capture_identity(env, source->fd,
        DECKENT_NATIVE_EVIDENCE_COMPONENT_NOFOLLOW,
        DECKENT_POSIX_CAP_STABLE_OBJECT_ID, &after)
      || !same_snapshot(&source->source_identity, &after)
      || !S_ISREG(after.status.st_mode) || after.status.st_nlink != 1
      || after.status.st_size < 0
      || (uint64_t)after.status.st_size != source->expected_bytes
      || (after.status.st_mode & 0777) != source->expected_mode) {
    throw_typed(env, DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "execution-effect source identity changed during streaming");
    goto failed;
  }
  final_hash = source->content_hash;
  effect_sha256_finish(&final_hash, digest);
  effect_digest_text(digest, digest_text);
  if (strcmp(digest_text, source->expected_digest) != 0) {
    throw_typed(env, DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "execution-effect source digest does not match prepared authority");
    goto failed;
  }
  effect_identity_digest(&after, source_identity_digest);
  source->sealed = true;
  result = effect_result_start(env, "execution-effect-source-read", "VERIFIED");
  if (result == NULL
      || !set_named_double(env, result, "chunkCount", (double)source->chunk_count)
      || !set_named_string(env, result, "contentDigest", digest_text)
      || !set_named_double(env, result, "observedBytes", (double)source->observed_bytes)
      || !set_named_string(env, result, "sourceObjectIdentityDigest",
        source_identity_digest)
      || !effect_result_finish(env, result,
        DECKENT_EFFECT_OPERATION_FINISH_SOURCE_READ)) goto failed;
  effect_end_borrow_or_fatal(env, &borrow,
    "execution-effect source finish borrow cleanup failed");
  return result;
failed:
  if (source != NULL) source->failed = true;
  if (borrow.active) effect_end_borrow_or_fatal(env, &borrow,
    "execution-effect failed source finish borrow cleanup");
  return NULL;
}

static bool effect_random_name(char output[96]) {
  uint8_t random[24];
  static const char hex[] = "0123456789abcdef";
  ssize_t count;
  size_t index;
  do {
    count = syscall(SYS_getrandom, random, sizeof(random), 0u);
  } while (count < 0 && errno == EINTR);
  if (count != (ssize_t)sizeof(random)) return false;
  memcpy(output, ".deckent-effect-stage-", 22u);
  for (index = 0u; index < sizeof(random); index += 1u) {
    output[22u + index * 2u] = hex[random[index] >> 4];
    output[23u + index * 2u] = hex[random[index] & 0x0fu];
  }
  output[70] = '\0';
  return true;
}

static napi_value effect_begin_stage(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value root_value;
  char *digest = NULL;
  uint64_t total_bytes;
  deckent_effect_borrow borrow = {0};
  deckent_effect_resource *root;
  deckent_effect_resource *stage = NULL;
  char *private_name = NULL;
  char name[96];
  int fd = -1;
  int parent_fd = -1;
  struct stat status;
  deckent_posix_identity_snapshot identity;
  char identity_digest[72];
  napi_value handle;
  napi_value result;
  napi_value total_value;
  bool handle_created = false;
  bool private_file_created = false;
  if (!effect_exact_input(env, state, DECKENT_EFFECT_OPERATION_BEGIN_STAGE,
        argc, argv, &input)
      || !get_named_value(env, input, "stagingRoot", &root_value)
      || !effect_get_nonnegative_safe_u64(env, input, "totalBytes",
        DECKENT_EFFECT_MAX_FILE_BYTES, &total_bytes)
      || !get_named_string_alloc(env, input, "contentDigest", 71u, &digest)
      || !effect_digest_is_canonical(digest)
      || !deckent_effect_borrow_handle(env, state, root_value,
        DECKENT_EFFECT_HANDLE_STAGING_ROOT, DECKENT_EFFECT_RIGHT_STAGE, &borrow)) goto failed;
  root = (deckent_effect_resource *)borrow.resource;
  if (!effect_random_name(name)) { throw_typed(env, "E_EXEC_AUTH_NATIVE_IO_UNCONFIRMED",
    "execution-effect staging entropy is unavailable"); goto failed; }
  parent_fd = dup(root->fd);
  if (parent_fd < 0) { throw_errno_typed(env, errno); goto failed; }
  fd = openat(parent_fd, name, O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600);
  if (fd < 0) { throw_errno_typed(env, errno); goto failed; }
  private_file_created = true;
  if (fstat(fd, &status) != 0 || !S_ISREG(status.st_mode) || status.st_nlink != 1
      || status.st_dev != root->root_device
      || !capture_identity(env, fd, DECKENT_NATIVE_EVIDENCE_COMPONENT_NOFOLLOW,
        DECKENT_POSIX_CAP_STABLE_OBJECT_ID, &identity)
      || identity.mount_id != root->root_mount_id) {
    throw_typed(env, DECKENT_NATIVE_ERROR_VOLUME_UNSUPPORTED,
      "execution-effect staged content identity is unsupported");
    goto failed;
  }
  private_name = strdup(name);
  if (private_name == NULL) {
    throw_typed(env, "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "execution-effect staged name allocation failed");
    goto failed;
  }
  stage = create_effect_resource(env, DECKENT_EFFECT_HANDLE_STAGED_CONTENT, fd);
  if (stage == NULL) goto failed;
  fd = -1;
  stage->parent_fd = parent_fd;
  parent_fd = -1;
  stage->private_name = private_name;
  private_name = NULL;
  stage->expected_bytes = total_bytes;
  memcpy(stage->expected_digest, digest, 72u);
  effect_sha256_init(&stage->content_hash);
  handle = deckent_effect_create_handle(env, state,
    DECKENT_EFFECT_HANDLE_STAGED_CONTENT,
    DECKENT_EFFECT_RIGHT_APPEND | DECKENT_EFFECT_RIGHT_SEAL
      | DECKENT_EFFECT_RIGHT_INSPECT,
    (uintptr_t)stage, close_effect_resource);
  if (handle == NULL) { stage = NULL; goto failed; }
  stage = NULL;
  handle_created = true;
  effect_identity_digest(&identity, identity_digest);
  result = effect_result_start(env, "execution-effect-stage", "OPEN");
  if (result == NULL || napi_create_double(env, (double)total_bytes, &total_value) != napi_ok
      || !set_named_value(env, result, "handle", handle)
      || !set_named_string(env, result, "contentDigest", digest)
      || !set_named_string(env, result, "nativeStagingObjectIdentityDigest", identity_digest)
      || !set_named_value(env, result, "totalBytes", total_value)
      || !effect_result_finish(env, result, DECKENT_EFFECT_OPERATION_BEGIN_STAGE)) goto failed;
  effect_end_borrow_or_fatal(env, &borrow, "execution-effect stage-root borrow cleanup failed");
  free(digest);
  return result;
failed:
  {
    napi_value pending = take_pending_exception(env);
    bool cleanup_confirmed = true;
    if (handle_created) {
      deckent_native_retire_result retired = deckent_effect_retire_handle(
        env, state, handle, DECKENT_EFFECT_HANDLE_STAGED_CONTENT,
        DECKENT_EFFECT_RIGHT_APPEND | DECKENT_EFFECT_RIGHT_SEAL
          | DECKENT_EFFECT_RIGHT_INSPECT);
      handle_created = false;
      if (retired != DECKENT_NATIVE_RETIRE_CONFIRMED) cleanup_confirmed = false;
    } else if (stage != NULL) {
      if (close_effect_resource((uintptr_t)stage) != 0) cleanup_confirmed = false;
      stage = NULL;
    } else {
      if (fd >= 0 && close(fd) != 0) cleanup_confirmed = false;
      fd = -1;
      if (parent_fd >= 0) {
        if (private_file_created && unlinkat(parent_fd, name, 0) != 0 && errno != ENOENT) {
          cleanup_confirmed = false;
        }
        if (close(parent_fd) != 0) cleanup_confirmed = false;
        parent_fd = -1;
      } else if (private_file_created) {
        /* Ownership reached a handle factory which is required to report cleanup uncertainty. */
        private_file_created = false;
      }
    }
    if (!cleanup_confirmed) {
      throw_typed(env, DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "execution-effect staged resource cleanup was not confirmed");
    } else {
      restore_pending_or_throw(env, pending, "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
        "execution-effect staged operation failed without typed evidence");
    }
  }
  if (borrow.active) effect_end_borrow_or_fatal(env, &borrow,
    "execution-effect failed stage-root borrow cleanup");
  free(digest);
  free(private_name);
  return NULL;
}

static napi_value effect_append_stage(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value handle_value;
  napi_value bytes_value;
  uint8_t *bytes = NULL;
  size_t length = 0u;
  size_t offset = 0u;
  deckent_effect_borrow borrow = {0};
  deckent_effect_resource *stage;
  napi_value result;
  napi_value observed;
  if (!effect_exact_input(env, state, DECKENT_EFFECT_OPERATION_APPEND_STAGE,
        argc, argv, &input)
      || !get_named_value(env, input, "stagedContent", &handle_value)
      || !get_named_value(env, input, "bytes", &bytes_value)
      || !effect_copy_bytes(env, bytes_value, 67108864u, &bytes, &length)
      || !deckent_effect_borrow_handle(env, state, handle_value,
        DECKENT_EFFECT_HANDLE_STAGED_CONTENT, DECKENT_EFFECT_RIGHT_APPEND, &borrow)) goto failed;
  stage = (deckent_effect_resource *)borrow.resource;
  if (stage->sealed || (uint64_t)length > stage->expected_bytes - stage->observed_bytes) {
    throw_typed(env, DECKENT_EFFECT_ERROR_BOUNDS,
      "execution-effect staged chunk exceeds immutable source bounds");
    goto failed;
  }
  while (offset < length) {
    ssize_t written = write(stage->fd, bytes + offset, length - offset);
    if (written < 0 && errno == EINTR) continue;
    if (written <= 0) { throw_typed(env, "E_EXEC_AUTH_NATIVE_IO_UNCONFIRMED",
      "execution-effect staged chunk write was not confirmed"); goto failed; }
    effect_sha256_update(&stage->content_hash, bytes + offset, (size_t)written);
    offset += (size_t)written;
    stage->observed_bytes += (uint64_t)written;
  }
  result = effect_result_start(env, "execution-effect-stage-append", "APPENDED");
  if (result == NULL || napi_create_double(env, (double)stage->observed_bytes, &observed) != napi_ok
      || !set_named_value(env, result, "observedBytes", observed)
      || !effect_result_finish(env, result, DECKENT_EFFECT_OPERATION_APPEND_STAGE)) goto failed;
  effect_end_borrow_or_fatal(env, &borrow, "execution-effect append borrow cleanup failed");
  free(bytes);
  return result;
failed:
  if (borrow.active) effect_end_borrow_or_fatal(env, &borrow,
    "execution-effect failed append borrow cleanup");
  free(bytes);
  return NULL;
}

static napi_value effect_seal_stage(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value handle_value;
  deckent_effect_borrow borrow = {0};
  deckent_effect_resource *stage;
  deckent_effect_sha256 final_hash;
  uint8_t digest[32];
  char digest_text[72];
  deckent_posix_identity_snapshot identity;
  char identity_digest[72];
  napi_value result;
  if (!effect_exact_input(env, state, DECKENT_EFFECT_OPERATION_SEAL_STAGE,
        argc, argv, &input)
      || !get_named_value(env, input, "stagedContent", &handle_value)
      || !deckent_effect_borrow_handle(env, state, handle_value,
        DECKENT_EFFECT_HANDLE_STAGED_CONTENT, DECKENT_EFFECT_RIGHT_SEAL, &borrow)) return NULL;
  stage = (deckent_effect_resource *)borrow.resource;
  if (stage->sealed || stage->observed_bytes != stage->expected_bytes) {
    throw_typed(env, DECKENT_EFFECT_ERROR_BOUNDS,
      "execution-effect staged source length is incomplete");
    goto failed;
  }
  final_hash = stage->content_hash;
  effect_sha256_finish(&final_hash, digest);
  effect_digest_text(digest, digest_text);
  if (strcmp(digest_text, stage->expected_digest) != 0) {
    throw_typed(env, DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "execution-effect staged source digest does not match authority");
    goto failed;
  }
  if (fchmod(stage->fd, 0400) != 0 || fsync(stage->fd) != 0
      || fsync(stage->parent_fd) != 0
      || !capture_identity(env, stage->fd,
        DECKENT_NATIVE_EVIDENCE_COMPONENT_NOFOLLOW | DECKENT_NATIVE_EVIDENCE_FILE_DURABILITY,
        DECKENT_POSIX_CAP_STABLE_OBJECT_ID, &identity)
      || identity.status.st_nlink != 1 || identity.status.st_size < 0
      || (uint64_t)identity.status.st_size != stage->expected_bytes) {
    throw_typed(env, DECKENT_EFFECT_ERROR_DURABILITY,
      "execution-effect staged source durability was not confirmed");
    goto failed;
  }
  stage->sealed = true;
  effect_identity_digest(&identity, identity_digest);
  result = effect_result_start(env, "execution-effect-stage", "SEALED");
  if (result == NULL || !set_named_string(env, result, "contentDigest", digest_text)
      || !set_named_string(env, result, "nativeStagingObjectIdentityDigest", identity_digest)
      || !effect_result_finish(env, result, DECKENT_EFFECT_OPERATION_SEAL_STAGE)) goto failed;
  effect_end_borrow_or_fatal(env, &borrow, "execution-effect seal borrow cleanup failed");
  return result;
failed:
  if (borrow.active) effect_end_borrow_or_fatal(env, &borrow,
    "execution-effect failed seal borrow cleanup");
  return NULL;
}

typedef struct deckent_effect_scan_node {
  char *path;
  uint32_t depth;
  int directory_fd;
  deckent_posix_identity_snapshot identity;
  char **names;
  size_t name_count;
  size_t next_name_index;
  bool names_loaded;
} deckent_effect_scan_node;

typedef struct deckent_effect_capture_record {
  char *path;
  napi_value value;
} deckent_effect_capture_record;

static int effect_compare_names(const void *left, const void *right) {
  const char *const *left_name = (const char *const *)left;
  const char *const *right_name = (const char *const *)right;
  return strcmp(*left_name, *right_name);
}

static int effect_compare_capture_records(const void *left, const void *right) {
  const deckent_effect_capture_record *left_record =
    (const deckent_effect_capture_record *)left;
  const deckent_effect_capture_record *right_record =
    (const deckent_effect_capture_record *)right;
  return strcmp(left_record->path, right_record->path);
}

static bool effect_manifest_hash_update(
  napi_env env,
  deckent_effect_sha256 *hash,
  uint64_t *body_bytes,
  uint64_t max_body_bytes,
  const char *value,
  size_t length
) {
  if (*body_bytes > max_body_bytes || (uint64_t)length > max_body_bytes - *body_bytes) {
    throw_typed(env, DECKENT_EFFECT_ERROR_BOUNDS,
      "execution-effect canonical manifest body exceeds capture bounds");
    return false;
  }
  effect_sha256_update(hash, (const uint8_t *)value, length);
  *body_bytes += (uint64_t)length;
  return true;
}

static bool effect_manifest_hash_literal(
  napi_env env,
  deckent_effect_sha256 *hash,
  uint64_t *body_bytes,
  uint64_t max_body_bytes,
  const char *value
) {
  return effect_manifest_hash_update(
    env, hash, body_bytes, max_body_bytes, value, strlen(value));
}

static bool effect_manifest_hash_json_string(
  napi_env env,
  deckent_effect_sha256 *hash,
  uint64_t *body_bytes,
  uint64_t max_body_bytes,
  const char *value
) {
  static const char hex[] = "0123456789abcdef";
  const unsigned char *cursor = (const unsigned char *)value;
  if (!effect_manifest_hash_literal(env, hash, body_bytes, max_body_bytes, "\"")) return false;
  while (*cursor != '\0') {
    char escaped[7];
    size_t escaped_length = 0u;
    switch (*cursor) {
      case '"': escaped[0] = '\\'; escaped[1] = '"'; escaped_length = 2u; break;
      case '\\': escaped[0] = '\\'; escaped[1] = '\\'; escaped_length = 2u; break;
      case '\b': escaped[0] = '\\'; escaped[1] = 'b'; escaped_length = 2u; break;
      case '\f': escaped[0] = '\\'; escaped[1] = 'f'; escaped_length = 2u; break;
      case '\n': escaped[0] = '\\'; escaped[1] = 'n'; escaped_length = 2u; break;
      case '\r': escaped[0] = '\\'; escaped[1] = 'r'; escaped_length = 2u; break;
      case '\t': escaped[0] = '\\'; escaped[1] = 't'; escaped_length = 2u; break;
      default:
        if (*cursor < 0x20u) {
          escaped[0] = '\\'; escaped[1] = 'u'; escaped[2] = '0'; escaped[3] = '0';
          escaped[4] = hex[*cursor >> 4u]; escaped[5] = hex[*cursor & 0x0fu];
          escaped_length = 6u;
        } else {
          escaped[0] = (char)*cursor;
          escaped_length = 1u;
        }
        break;
    }
    if (!effect_manifest_hash_update(
          env, hash, body_bytes, max_body_bytes, escaped, escaped_length)) return false;
    cursor += 1u;
  }
  return effect_manifest_hash_literal(env, hash, body_bytes, max_body_bytes, "\"");
}

static bool effect_manifest_hash_entry(
  napi_env env,
  deckent_effect_sha256 *hash,
  uint64_t *body_bytes,
  uint64_t max_body_bytes,
  uint32_t max_path_bytes,
  napi_value entry
) {
  char *kind = NULL;
  char *mode = NULL;
  char *object_digest = NULL;
  char *path = NULL;
  char *content_digest = NULL;
  char *size = NULL;
  bool regular;
  bool ok = false;
  if (!get_named_string_alloc(env, entry, "kind", 32u, &kind)
      || !get_named_string_alloc(env, entry, "mode", 8u, &mode)
      || !get_named_string_alloc(env, entry, "objectIdentityDigest", 80u, &object_digest)
      || !get_named_string_alloc(env, entry, "path", max_path_bytes, &path)) goto done;
  regular = strcmp(kind, "REGULAR_FILE") == 0;
  if (!regular && strcmp(kind, "DIRECTORY") != 0) {
    throw_typed(env, "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "execution-effect capture produced an unsupported entry kind");
    goto done;
  }
  if (regular && (!get_named_string_alloc(env, entry, "contentDigest", 80u, &content_digest)
      || !get_named_string_alloc(env, entry, "size", 32u, &size))) goto done;
  if (!effect_manifest_hash_literal(env, hash, body_bytes, max_body_bytes,
        "{\"contentDigest\":")
      || (regular
        ? !effect_manifest_hash_json_string(env, hash, body_bytes, max_body_bytes, content_digest)
        : !effect_manifest_hash_literal(env, hash, body_bytes, max_body_bytes, "null"))
      || !effect_manifest_hash_literal(env, hash, body_bytes, max_body_bytes, ",\"kind\":")
      || !effect_manifest_hash_json_string(env, hash, body_bytes, max_body_bytes, kind)
      || !effect_manifest_hash_literal(env, hash, body_bytes, max_body_bytes, ",\"mode\":")
      || !effect_manifest_hash_json_string(env, hash, body_bytes, max_body_bytes, mode)
      || !effect_manifest_hash_literal(env, hash, body_bytes, max_body_bytes,
        ",\"objectIdentityDigest\":")
      || !effect_manifest_hash_json_string(env, hash, body_bytes, max_body_bytes, object_digest)
      || !effect_manifest_hash_literal(env, hash, body_bytes, max_body_bytes, ",\"path\":")
      || !effect_manifest_hash_json_string(env, hash, body_bytes, max_body_bytes, path)
      || !effect_manifest_hash_literal(env, hash, body_bytes, max_body_bytes,
        ",\"schemaVersion\":1,\"size\":")
      || (regular
        ? !effect_manifest_hash_json_string(env, hash, body_bytes, max_body_bytes, size)
        : !effect_manifest_hash_literal(env, hash, body_bytes, max_body_bytes, "null"))
      || !effect_manifest_hash_literal(env, hash, body_bytes, max_body_bytes, "}")) goto done;
  ok = true;
done:
  free(kind);
  free(mode);
  free(object_digest);
  free(path);
  free(content_digest);
  free(size);
  return ok;
}

static bool effect_capture_manifest_digest(
  napi_env env,
  napi_value entries,
  uint32_t entry_count,
  uint64_t total_bytes,
  uint32_t max_path_bytes,
  uint64_t max_manifest_bytes,
  uint8_t digest[32]
) {
  static const char domain[] = "execution-effect-native-capture-manifest-v1";
  deckent_effect_sha256 hash;
  uint64_t body_bytes = 0u;
  char number[32];
  int number_length;
  uint32_t index;
  napi_value entry;
  effect_sha256_init(&hash);
  effect_sha256_update(&hash, (const uint8_t *)domain, sizeof(domain) - 1u);
  effect_sha256_update(&hash, (const uint8_t *)"\0", 1u);
  if (!effect_manifest_hash_literal(
        env, &hash, &body_bytes, max_manifest_bytes, "{\"entries\":[")) return false;
  for (index = 0u; index < entry_count; index += 1u) {
    if ((index > 0u && !effect_manifest_hash_literal(
          env, &hash, &body_bytes, max_manifest_bytes, ","))
        || napi_get_element(env, entries, index, &entry) != napi_ok
        || !effect_manifest_hash_entry(
          env, &hash, &body_bytes, max_manifest_bytes, max_path_bytes, entry)) return false;
  }
  number_length = snprintf(number, sizeof(number), "%u", entry_count);
  if (number_length <= 0 || (size_t)number_length >= sizeof(number)
      || !effect_manifest_hash_literal(
        env, &hash, &body_bytes, max_manifest_bytes, "],\"entryCount\":")
      || !effect_manifest_hash_update(env, &hash, &body_bytes, max_manifest_bytes,
        number, (size_t)number_length)) return false;
  number_length = snprintf(number, sizeof(number), "%ju", (uintmax_t)total_bytes);
  if (number_length <= 0 || (size_t)number_length >= sizeof(number)
      || !effect_manifest_hash_literal(
        env, &hash, &body_bytes, max_manifest_bytes, ",\"totalBytes\":")
      || !effect_manifest_hash_update(env, &hash, &body_bytes, max_manifest_bytes,
        number, (size_t)number_length)
      || !effect_manifest_hash_literal(
        env, &hash, &body_bytes, max_manifest_bytes, "}")) return false;
  effect_sha256_finish(&hash, digest);
  return true;
}

static bool effect_read_directory_names(
  napi_env env,
  int fd,
  uint32_t max_name_bytes,
  size_t max_count,
  uint64_t deadline_unix_ms,
  char ***names,
  size_t *count
) {
  DIR *directory;
  struct dirent *entry;
  char **items = NULL;
  size_t used = 0u;
  size_t capacity = 0u;
  int duplicate = dup(fd);
  if (duplicate < 0) { throw_errno_typed(env, errno); return false; }
  directory = fdopendir(duplicate);
  if (directory == NULL) {
    int saved = errno;
    if (close(duplicate) != 0) {
      throw_typed(env, DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "execution-effect directory stream setup cleanup was not confirmed");
    } else {
      throw_errno_typed(env, saved);
    }
    return false;
  }
  for (;;) {
    size_t length;
    char **next;
    errno = 0;
    entry = readdir(directory);
    if (entry == NULL) {
      int read_error = errno;
      if (read_error != 0) {
        throw_errno_typed(env, read_error);
        goto failed;
      }
      break;
    }
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) continue;
    if (!effect_deadline_ok(env, deadline_unix_ms)) goto failed;
    length = strlen(entry->d_name);
    if (length == 0u || length > max_name_bytes || !valid_component(entry->d_name)
        || !effect_valid_utf8(entry->d_name, length)) {
      throw_typed(env, DECKENT_EFFECT_ERROR_ENVELOPE,
        "execution-effect directory entry name or encoding is invalid");
      goto failed;
    }
    if (used >= max_count) {
      throw_typed(env, DECKENT_EFFECT_ERROR_BOUNDS,
        "execution-effect directory fanout exceeds the request capture bound");
      goto failed;
    }
    if (used == capacity) {
      size_t next_capacity;
      if (capacity >= max_count) {
        throw_typed(env, DECKENT_EFFECT_ERROR_BOUNDS,
          "execution-effect directory fanout exceeds capture bounds");
        goto failed;
      }
      next_capacity = capacity == 0u ? (max_count < 32u ? max_count : 32u)
        : capacity > max_count / 2u ? max_count : capacity * 2u;
      if (next_capacity <= capacity
          || next_capacity > SIZE_MAX / sizeof(*next)) {
        throw_typed(env, DECKENT_EFFECT_ERROR_BOUNDS,
          "execution-effect directory fanout exceeds capture bounds");
        goto failed;
      }
      next = realloc(items, next_capacity * sizeof(*next));
      if (next == NULL) { throw_typed(env, "E_EXEC_AUTH_NATIVE_ALLOCATION",
        "execution-effect directory entry allocation failed"); goto failed; }
      items = next;
      capacity = next_capacity;
    }
    items[used] = strdup(entry->d_name);
    if (items[used] == NULL) { throw_typed(env, "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "execution-effect directory entry allocation failed"); goto failed; }
    used += 1u;
  }
  if (!effect_deadline_ok(env, deadline_unix_ms)) goto failed;
  qsort(items, used, sizeof(*items), effect_compare_names);
  if (!effect_deadline_ok(env, deadline_unix_ms)) goto failed;
  if (closedir(directory) != 0) {
    throw_typed(env, DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
      "execution-effect directory stream cleanup was not confirmed");
    while (used > 0u) free(items[--used]);
    free(items);
    return false;
  }
  *names = items;
  *count = used;
  return true;
failed:
  {
    napi_value pending = take_pending_exception(env);
    bool cleanup_confirmed = closedir(directory) == 0;
    while (used > 0u) free(items[--used]);
    free(items);
    if (!cleanup_confirmed) {
      throw_typed(env, DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "execution-effect failed directory stream cleanup was not confirmed");
    } else {
      restore_pending_or_throw(env, pending, "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
        "execution-effect directory scan failed without typed evidence");
    }
    return false;
  }
}

static void effect_free_names(char **names, size_t count) {
  while (count > 0u) free(names[--count]);
  free(names);
}

static bool effect_close_scan_node(deckent_effect_scan_node *node) {
  bool closed = close_owned_fd(&node->directory_fd);
  effect_free_names(node->names, node->name_count);
  node->names = NULL;
  node->name_count = 0u;
  node->next_name_index = 0u;
  node->names_loaded = false;
  free(node->path);
  node->path = NULL;
  return closed;
}

static napi_value effect_capture_tree(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value root_value;
  char *cancel_state = NULL;
  deckent_effect_limits limits;
  deckent_effect_borrow borrow = {0};
  deckent_effect_resource *root;
  deckent_effect_scan_node *stack = NULL;
  size_t stack_count = 0u;
  size_t stack_capacity = 0u;
  uint32_t entry_count = 0u;
  deckent_effect_capture_record *captured = NULL;
  size_t captured_capacity = 0u;
  uint64_t total_bytes = 0u;
  uint64_t aggregate_path_bytes = 0u;
  napi_value entries;
  uint8_t manifest_digest_raw[32];
  char manifest_digest[72];
  napi_value result;
  napi_value total_value;
  if (!effect_exact_input(env, state, DECKENT_EFFECT_OPERATION_CAPTURE_TREE,
        argc, argv, &input)
      || !get_named_value(env, input, "root", &root_value)
      || !effect_parse_limits(env, input, &limits)
      || !get_named_string_alloc(env, input, "cancelState", 16u, &cancel_state)) goto failed;
  if (strcmp(cancel_state, "CANCELLED") == 0) {
    throw_typed(env, DECKENT_EFFECT_ERROR_CANCELLED,
      "execution-effect capture was cancelled before admission");
    goto failed;
  }
  if (strcmp(cancel_state, "ACTIVE") != 0 || !effect_deadline_ok(env, limits.deadline_unix_ms)
      || !deckent_effect_borrow_handle(env, state, root_value,
        DECKENT_EFFECT_HANDLE_ANY, DECKENT_EFFECT_RIGHT_SCAN, &borrow)) goto failed;
  root = (deckent_effect_resource *)borrow.resource;
  if (napi_create_array_with_length(env, 0u, &entries) != napi_ok) goto failed;
  stack_capacity = (size_t)limits.max_depth + 1u < 32u
    ? (size_t)limits.max_depth + 1u : 32u;
  stack = calloc(stack_capacity, sizeof(*stack));
  if (stack == NULL) {
    throw_typed(env, "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "execution-effect scan stack allocation failed");
    goto failed;
  }
  stack[0].path = strdup(".");
  if (stack[0].path == NULL) {
    throw_typed(env, "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "execution-effect root path allocation failed");
    goto failed;
  }
  stack[0].depth = 0u;
  stack_count = 1u;
  /*
   * `dup(root->fd)` would share the directory stream offset with the durable
   * root handle. A completed capture could then make the next capture observe
   * an empty directory. Reopen `.` relative to the pinned root so every
   * invocation owns an independent open-file description while retaining the
   * descriptor-relative/no-follow boundary.
   */
  stack[0].directory_fd = openat(
    root->fd,
    ".",
    O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC
  );
  if (stack[0].directory_fd < 0) {
    throw_errno_typed(env, errno);
    goto failed;
  }
  if (!capture_identity(env, stack[0].directory_fd,
        DECKENT_NATIVE_EVIDENCE_COMPONENT_NOFOLLOW,
        DECKENT_POSIX_CAP_STABLE_OBJECT_ID, &stack[0].identity)) {
    goto failed;
  }
  if (!S_ISDIR(stack[0].identity.status.st_mode)
      || !effect_same_root_mount(root, &stack[0].identity)) {
    throw_typed(env, DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "execution-effect root identity is not a stable directory on the admitted mount");
    goto failed;
  }
  while (stack_count > 0u) {
    deckent_effect_scan_node *node = &stack[stack_count - 1u];
    deckent_posix_identity_snapshot directory_after;
    size_t remaining_entries;
    if (!effect_deadline_ok(env, limits.deadline_unix_ms)) {
      goto failed;
    }
    if (node->depth > limits.max_depth || entry_count >= limits.max_entries) {
      throw_typed(env, DECKENT_EFFECT_ERROR_BOUNDS,
        "execution-effect manifest bounds were exceeded");
      goto failed;
    }
    if (!S_ISDIR(node->identity.status.st_mode)) {
      throw_typed(env, DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
        "execution-effect directory identity changed before listing");
      goto failed;
    }
    if (!node->names_loaded) {
      remaining_entries = (size_t)limits.max_entries - entry_count - 1u;
      if (!effect_read_directory_names(env, node->directory_fd, limits.max_name_bytes,
            remaining_entries, limits.deadline_unix_ms, &node->names, &node->name_count)) {
        goto failed;
      }
      if (!capture_identity(env, node->directory_fd,
            DECKENT_NATIVE_EVIDENCE_COMPONENT_NOFOLLOW,
            DECKENT_POSIX_CAP_STABLE_OBJECT_ID, &directory_after)) {
        goto failed;
      }
      if (!same_snapshot(&node->identity, &directory_after)
          || !effect_same_root_mount(root, &directory_after)) {
        throw_typed(env, DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
          "execution-effect directory changed during listing");
        goto failed;
      }
      node->names_loaded = true;
    }
    if (node->next_name_index >= node->name_count) {
      if (!capture_identity(env, node->directory_fd,
            DECKENT_NATIVE_EVIDENCE_COMPONENT_NOFOLLOW,
            DECKENT_POSIX_CAP_STABLE_OBJECT_ID, &directory_after)) {
        goto failed;
      }
      if (!same_snapshot(&node->identity, &directory_after)
          || !effect_same_root_mount(root, &directory_after)) {
        throw_typed(env, DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
          "execution-effect directory changed during descendant capture");
        goto failed;
      }
      if (!effect_close_scan_node(node)) {
        throw_typed(env, DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
          "execution-effect directory cleanup was not confirmed");
        goto failed;
      }
      stack_count -= 1u;
      continue;
    }
    {
      const char *name = node->names[node->next_name_index];
      size_t parent_length = strcmp(node->path, ".") == 0 ? 0u : strlen(node->path) + 1u;
      size_t path_length = parent_length + strlen(name);
      char *path;
      int fd = -1;
      deckent_posix_identity_snapshot identity;
      napi_value entry;
      if (!effect_deadline_ok(env, limits.deadline_unix_ms)) {
        goto failed;
      }
      if (node->depth >= limits.max_depth
          || entry_count + 1u >= limits.max_entries || path_length > limits.max_path_bytes
          || path_length > limits.max_manifest_bytes
          || aggregate_path_bytes > limits.max_manifest_bytes - path_length) {
        throw_typed(env, DECKENT_EFFECT_ERROR_BOUNDS,
          "execution-effect manifest bounds were exceeded"); goto failed;
      }
      path = malloc(path_length + 1u);
      if (path == NULL) {
        throw_typed(env, "E_EXEC_AUTH_NATIVE_ALLOCATION",
          "execution-effect entry path allocation failed");
        goto failed;
      }
      if (parent_length == 0u) memcpy(path, name, strlen(name) + 1u);
      else snprintf(path, path_length + 1u, "%s/%s", node->path, name);
      if (!effect_open_child_relative(
            env, root, node->directory_fd, name, &fd, &identity)) {
        free(path); goto failed;
      }
      if (S_ISREG(identity.status.st_mode)
          && (uint64_t)identity.status.st_size > limits.max_file_bytes) {
        free(path); (void)close_owned_fd(&fd);
        throw_typed(env, DECKENT_EFFECT_ERROR_BOUNDS,
          "execution-effect file content bound was exceeded");
        goto failed;
      }
      if (S_ISREG(identity.status.st_mode)
          && (uint64_t)identity.status.st_size > limits.max_total_bytes - total_bytes) {
        free(path); (void)close_owned_fd(&fd);
        throw_typed(env, DECKENT_EFFECT_ERROR_BOUNDS,
          "execution-effect aggregate content bound was exceeded");
        goto failed;
      }
      if (!effect_create_entry_record(env, path, fd, &identity,
            limits.max_file_bytes, limits.deadline_unix_ms, &entry)) {
        free(path); (void)close_owned_fd(&fd);
        goto failed;
      }
      if (!S_ISDIR(identity.status.st_mode) && !close_owned_fd(&fd)) {
        free(path);
        throw_typed(env, DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
          "execution-effect entry descriptor cleanup was not confirmed");
        goto failed;
      }
      if (entry_count == captured_capacity) {
        size_t next_capacity = captured_capacity == 0u ? 32u : captured_capacity * 2u;
        deckent_effect_capture_record *next;
        if (next_capacity > limits.max_entries) next_capacity = limits.max_entries;
        if (next_capacity <= captured_capacity) {
          (void)close_owned_fd(&fd);
          free(path);
          throw_typed(env, DECKENT_EFFECT_ERROR_BOUNDS,
            "execution-effect captured entry bound was exceeded"); goto failed;
        }
        next = realloc(captured, next_capacity * sizeof(*next));
        if (next == NULL) {
          (void)close_owned_fd(&fd);
          free(path);
          throw_typed(env, "E_EXEC_AUTH_NATIVE_ALLOCATION",
            "execution-effect capture record allocation failed"); goto failed;
        }
        captured = next;
        captured_capacity = next_capacity;
      }
      captured[entry_count].path = path;
      captured[entry_count].value = entry;
      entry_count += 1u;
      aggregate_path_bytes += path_length;
      if (S_ISREG(identity.status.st_mode)) total_bytes += (uint64_t)identity.status.st_size;
      node->next_name_index += 1u;
      if (S_ISDIR(identity.status.st_mode)) {
        if (stack_count == stack_capacity) {
          size_t next_capacity = stack_capacity * 2u;
          size_t stack_limit = (size_t)limits.max_depth + 1u;
          deckent_effect_scan_node *next;
          if (next_capacity > stack_limit) next_capacity = stack_limit;
          if (next_capacity <= stack_capacity) {
            (void)close_owned_fd(&fd);
            throw_typed(env, DECKENT_EFFECT_ERROR_BOUNDS,
              "execution-effect scan stack exceeds capture bounds");
            goto failed; }
          next = realloc(stack, next_capacity * sizeof(*next));
          if (next == NULL) {
            (void)close_owned_fd(&fd);
            throw_typed(env, "E_EXEC_AUTH_NATIVE_ALLOCATION",
              "execution-effect scan stack growth failed");
            goto failed;
          }
          stack = next;
          stack_capacity = next_capacity;
        }
        stack[stack_count].path = strdup(path);
        if (stack[stack_count].path == NULL) {
          (void)close_owned_fd(&fd);
          throw_typed(env, "E_EXEC_AUTH_NATIVE_ALLOCATION",
          "execution-effect scan queue allocation failed"); goto failed;
        }
        stack[stack_count].depth = stack[stack_count - 1u].depth + 1u;
        stack[stack_count].directory_fd = fd;
        stack[stack_count].identity = identity;
        stack[stack_count].names = NULL;
        stack[stack_count].name_count = 0u;
        stack[stack_count].next_name_index = 0u;
        stack[stack_count].names_loaded = false;
        fd = -1;
        stack_count += 1u;
      }
    }
  }
  if (!effect_deadline_ok(env, limits.deadline_unix_ms)) goto failed;
  qsort(captured, entry_count, sizeof(*captured), effect_compare_capture_records);
  if (!effect_deadline_ok(env, limits.deadline_unix_ms)) goto failed;
  for (uint32_t capture_index = 0u; capture_index < entry_count; capture_index += 1u) {
    if ((capture_index & 1023u) == 0u
        && !effect_deadline_ok(env, limits.deadline_unix_ms)) goto failed;
    if (!deckent_native_define_own_index(env, entries, capture_index,
          captured[capture_index].value)) goto failed;
  }
  if (!effect_deadline_ok(env, limits.deadline_unix_ms)
      || !freeze_object(env, entries)
      || !effect_capture_manifest_digest(env, entries, entry_count, total_bytes,
        limits.max_path_bytes, limits.max_manifest_bytes, manifest_digest_raw)
      || !effect_deadline_ok(env, limits.deadline_unix_ms)) goto failed;
  effect_digest_text(manifest_digest_raw, manifest_digest);
  result = effect_result_start(env, "execution-effect-manifest", "CAPTURED");
  if (result == NULL || napi_create_double(env, (double)total_bytes, &total_value) != napi_ok
      || !set_named_uint32(env, result, "entryCount", entry_count)
      || !set_named_value(env, result, "entries", entries)
      || !set_named_string(env, result, "manifestDigest", manifest_digest)
      || !set_named_value(env, result, "totalBytes", total_value)
      || !effect_result_finish(env, result, DECKENT_EFFECT_OPERATION_CAPTURE_TREE)
      || !effect_deadline_ok(env, limits.deadline_unix_ms)) goto failed;
  effect_end_borrow_or_fatal(env, &borrow, "execution-effect capture borrow cleanup failed");
  free(cancel_state);
  free(stack);
  while (entry_count > 0u) free(captured[--entry_count].path);
  free(captured);
  return result;
failed:
  {
    napi_value pending = take_pending_exception(env);
    bool cleanup_confirmed = true;
    while (stack_count > 0u) {
      stack_count -= 1u;
      if (!effect_close_scan_node(&stack[stack_count])) cleanup_confirmed = false;
    }
    free(stack);
    while (entry_count > 0u) free(captured[--entry_count].path);
    free(captured);
    if (borrow.active) effect_end_borrow_or_fatal(env, &borrow,
      "execution-effect failed capture borrow cleanup");
    free(cancel_state);
    if (!cleanup_confirmed) {
      return throw_typed(env, DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "execution-effect capture descriptor cleanup was not confirmed");
    }
    return restore_pending_or_throw(env, pending, "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "execution-effect capture failed without typed evidence");
  }
}

#define DECKENT_EFFECT_OPERATION_HEADER_BYTES 200u

typedef enum deckent_effect_mutation_kind {
  DECKENT_EFFECT_MUTATION_ADD_DIRECTORY = 1,
  DECKENT_EFFECT_MUTATION_ADD = 2,
  DECKENT_EFFECT_MUTATION_REPLACE = 3,
  DECKENT_EFFECT_MUTATION_DELETE = 4,
  DECKENT_EFFECT_MUTATION_MODE = 5,
} deckent_effect_mutation_kind;

typedef enum deckent_effect_entry_kind {
  DECKENT_EFFECT_ENTRY_ABSENT = 0,
  DECKENT_EFFECT_ENTRY_DIRECTORY = 1,
  DECKENT_EFFECT_ENTRY_REGULAR_FILE = 2,
} deckent_effect_entry_kind;

typedef struct deckent_effect_operation_envelope {
  deckent_effect_mutation_kind kind;
  deckent_effect_entry_kind pre_kind;
  deckent_effect_entry_kind post_kind;
  mode_t pre_mode;
  mode_t post_mode;
  uint64_t pre_size;
  uint64_t post_size;
  uint8_t operation_digest[32];
  uint8_t parent_identity_digest[32];
  uint8_t pre_identity_digest[32];
  uint8_t pre_content_digest[32];
  uint8_t post_content_digest[32];
  char *path;
} deckent_effect_operation_envelope;

static bool effect_digest_raw_is_zero(const uint8_t digest[32]) {
  size_t index;
  for (index = 0u; index < 32u; index += 1u) if (digest[index] != 0u) return false;
  return true;
}

static void effect_raw_digest_text(const uint8_t digest[32], char text[72]) {
  effect_digest_text(digest, text);
}

static bool effect_parse_operation_envelope(
  napi_env env,
  const uint8_t *bytes,
  size_t length,
  deckent_effect_operation_envelope *operation
) {
  uint32_t path_length;
  if (bytes == NULL || operation == NULL || length < DECKENT_EFFECT_OPERATION_HEADER_BYTES
      || memcmp(bytes, "DEE2", 4u) != 0 || bytes[4] != 1u || bytes[5] < 1u
      || bytes[5] > 5u || bytes[6] > 2u || bytes[7] > 2u
      || (effect_read_be32(bytes + 8u) & ~0777u) != 0u
      || (effect_read_be32(bytes + 12u) & ~0777u) != 0u
      || effect_read_be32(bytes + 20u) != 0u) goto invalid;
  path_length = effect_read_be32(bytes + 16u);
  if (path_length == 0u || path_length > DECKENT_EFFECT_MAX_PATH_BYTES
      || length != DECKENT_EFFECT_OPERATION_HEADER_BYTES + path_length) goto invalid;
  memset(operation, 0, sizeof(*operation));
  operation->kind = (deckent_effect_mutation_kind)bytes[5];
  operation->pre_kind = (deckent_effect_entry_kind)bytes[6];
  operation->post_kind = (deckent_effect_entry_kind)bytes[7];
  operation->pre_mode = (mode_t)effect_read_be32(bytes + 8u);
  operation->post_mode = (mode_t)effect_read_be32(bytes + 12u);
  operation->pre_size = effect_read_be64(bytes + 24u);
  operation->post_size = effect_read_be64(bytes + 32u);
  memcpy(operation->operation_digest, bytes + 40u, 32u);
  memcpy(operation->parent_identity_digest, bytes + 72u, 32u);
  memcpy(operation->pre_identity_digest, bytes + 104u, 32u);
  memcpy(operation->pre_content_digest, bytes + 136u, 32u);
  memcpy(operation->post_content_digest, bytes + 168u, 32u);
  operation->path = malloc((size_t)path_length + 1u);
  if (operation->path == NULL) {
    throw_typed(env, "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "execution-effect operation path allocation failed");
    return false;
  }
  memcpy(operation->path, bytes + DECKENT_EFFECT_OPERATION_HEADER_BYTES, path_length);
  operation->path[path_length] = '\0';
  if (strlen(operation->path) != path_length || !effect_safe_relative_path(operation->path)
      || strcmp(operation->path, ".") == 0 || effect_digest_raw_is_zero(operation->operation_digest)
      || effect_digest_raw_is_zero(operation->parent_identity_digest)) goto invalid_owned;
  if ((operation->kind == DECKENT_EFFECT_MUTATION_ADD_DIRECTORY
        && (operation->pre_kind != DECKENT_EFFECT_ENTRY_ABSENT
          || operation->post_kind != DECKENT_EFFECT_ENTRY_DIRECTORY))
      || (operation->kind == DECKENT_EFFECT_MUTATION_ADD
        && (operation->pre_kind != DECKENT_EFFECT_ENTRY_ABSENT
          || operation->post_kind != DECKENT_EFFECT_ENTRY_REGULAR_FILE))
      || (operation->kind == DECKENT_EFFECT_MUTATION_REPLACE
        && (operation->pre_kind != DECKENT_EFFECT_ENTRY_REGULAR_FILE
          || operation->post_kind != DECKENT_EFFECT_ENTRY_REGULAR_FILE))
      || (operation->kind == DECKENT_EFFECT_MUTATION_DELETE
        && (operation->pre_kind == DECKENT_EFFECT_ENTRY_ABSENT
          || operation->post_kind != DECKENT_EFFECT_ENTRY_ABSENT))
      || (operation->kind == DECKENT_EFFECT_MUTATION_MODE
        && (operation->pre_kind == DECKENT_EFFECT_ENTRY_ABSENT
          || operation->pre_kind != operation->post_kind))) goto invalid_owned;
  if ((operation->pre_kind == DECKENT_EFFECT_ENTRY_ABSENT
        && (!effect_digest_raw_is_zero(operation->pre_identity_digest)
          || !effect_digest_raw_is_zero(operation->pre_content_digest)
          || operation->pre_size != 0u || operation->pre_mode != 0u))
      || (operation->pre_kind != DECKENT_EFFECT_ENTRY_ABSENT
        && effect_digest_raw_is_zero(operation->pre_identity_digest))
      || (operation->pre_kind == DECKENT_EFFECT_ENTRY_DIRECTORY
        && (!effect_digest_raw_is_zero(operation->pre_content_digest)
          || operation->pre_size != 0u))
      || (operation->post_kind == DECKENT_EFFECT_ENTRY_ABSENT
        && (!effect_digest_raw_is_zero(operation->post_content_digest)
          || operation->post_size != 0u || operation->post_mode != 0u))
      || (operation->post_kind == DECKENT_EFFECT_ENTRY_REGULAR_FILE
        && effect_digest_raw_is_zero(operation->post_content_digest))
      || (operation->post_kind == DECKENT_EFFECT_ENTRY_DIRECTORY
        && (!effect_digest_raw_is_zero(operation->post_content_digest)
          || operation->post_size != 0u))) goto invalid_owned;
  return true;
invalid_owned:
  free(operation->path);
  operation->path = NULL;
invalid:
  throw_typed(env, DECKENT_EFFECT_ERROR_ENVELOPE,
    "execution-effect operation envelope is invalid");
  return false;
}

static bool effect_split_parent(
  napi_env env,
  const char *path,
  char **parent,
  char **name
) {
  const char *slash = strrchr(path, '/');
  if (slash == NULL) {
    *parent = strdup(".");
    *name = strdup(path);
  } else {
    size_t parent_length = (size_t)(slash - path);
    *parent = malloc(parent_length + 1u);
    *name = strdup(slash + 1u);
    if (*parent != NULL) {
      memcpy(*parent, path, parent_length);
      (*parent)[parent_length] = '\0';
    }
  }
  if (*parent == NULL || *name == NULL || !valid_component(*name)) {
    free(*parent); free(*name); *parent = NULL; *name = NULL;
    throw_typed(env, DECKENT_EFFECT_ERROR_ENVELOPE,
      "execution-effect operation parent split failed");
    return false;
  }
  return true;
}

static bool effect_digest_matches_raw(const char text[72], const uint8_t raw[32]) {
  char expected[72];
  effect_raw_digest_text(raw, expected);
  return strcmp(text, expected) == 0;
}

static bool effect_inspect_child(
  napi_env env,
  const deckent_effect_resource *root,
  int parent_fd,
  const char *name,
  bool hash_content,
  uint64_t max_file_bytes,
  deckent_effect_entry_kind *kind,
  deckent_posix_identity_snapshot *identity,
  char identity_digest[72],
  char content_digest[72]
) {
  int fd;
  fd = openat(parent_fd, name, O_PATH | O_NOFOLLOW | O_CLOEXEC);
  if (fd < 0) {
    if (errno == ENOENT) { *kind = DECKENT_EFFECT_ENTRY_ABSENT; return true; }
    throw_errno_typed(env, errno);
    return false;
  }
  if (!capture_identity(env, fd, DECKENT_NATIVE_EVIDENCE_COMPONENT_NOFOLLOW,
        DECKENT_POSIX_CAP_STABLE_OBJECT_ID, identity)) { close(fd); return false; }
  if (!effect_same_root_mount(root, identity)) {
    close(fd); throw_typed(env, DECKENT_NATIVE_ERROR_VOLUME_UNSUPPORTED,
      "execution-effect entry crossed a filesystem or mount boundary"); return false;
  }
  if (S_ISDIR(identity->status.st_mode)) *kind = DECKENT_EFFECT_ENTRY_DIRECTORY;
  else if (S_ISREG(identity->status.st_mode)) *kind = DECKENT_EFFECT_ENTRY_REGULAR_FILE;
  else { close(fd); throw_typed(env, DECKENT_NATIVE_ERROR_OBJECT_TYPE_MISMATCH,
    "execution-effect special entry is unsupported"); return false; }
  if (*kind == DECKENT_EFFECT_ENTRY_REGULAR_FILE && identity->status.st_nlink != 1) {
    close(fd); throw_typed(env, DECKENT_NATIVE_ERROR_LINK_COUNT_UNSAFE,
      "execution-effect rejects hard-linked content before read"); return false;
  }
  effect_identity_digest(identity, identity_digest);
  if (hash_content && *kind == DECKENT_EFFECT_ENTRY_REGULAR_FILE
      && !effect_hash_regular_file(env, fd, max_file_bytes, 0u,
        identity, content_digest)) {
    close(fd); return false;
  }
  if (close(fd) != 0) { throw_errno_typed(env, errno); return false; }
  return true;
}

static bool effect_entry_matches(
  napi_env env,
  const deckent_effect_resource *root,
  int parent_fd,
  const char *name,
  deckent_effect_entry_kind expected_kind,
  mode_t expected_mode,
  uint64_t expected_size,
  const uint8_t expected_identity[32],
  const uint8_t expected_content[32],
  bool *matches
) {
  deckent_effect_entry_kind observed;
  deckent_posix_identity_snapshot identity;
  char identity_digest[72] = {0};
  char content_digest[72] = {0};
  *matches = false;
  if (!effect_inspect_child(env, root, parent_fd, name,
        expected_kind == DECKENT_EFFECT_ENTRY_REGULAR_FILE,
        DECKENT_EFFECT_MAX_FILE_BYTES, &observed, &identity,
        identity_digest, content_digest)) return false;
  if (observed != expected_kind) return true;
  if (observed == DECKENT_EFFECT_ENTRY_ABSENT) { *matches = true; return true; }
  if (!effect_digest_matches_raw(identity_digest, expected_identity)) return true;
  if ((identity.status.st_mode & 0777) != expected_mode) return true;
  if (observed == DECKENT_EFFECT_ENTRY_REGULAR_FILE) {
    if (identity.status.st_size < 0 || (uint64_t)identity.status.st_size != expected_size
        || !effect_digest_matches_raw(content_digest, expected_content)) return true;
  }
  *matches = true;
  return true;
}

static int effect_rename_at2(
  int old_parent,
  const char *old_name,
  int new_parent,
  const char *new_name,
  unsigned int flags
) {
#if defined(SYS_renameat2)
  return (int)syscall(SYS_renameat2, old_parent, old_name,
    new_parent, new_name, flags);
#else
  (void)old_parent; (void)old_name; (void)new_parent; (void)new_name; (void)flags;
  errno = ENOSYS;
  return -1;
#endif
}

static void effect_private_operation_name(
  const char *prefix,
  const uint8_t digest[32],
  char output[96]
) {
  static const char hex[] = "0123456789abcdef";
  size_t prefix_length = strlen(prefix);
  size_t index;
  memcpy(output, prefix, prefix_length);
  for (index = 0u; index < 16u; index += 1u) {
    output[prefix_length + index * 2u] = hex[digest[index] >> 4];
    output[prefix_length + index * 2u + 1u] = hex[digest[index] & 0x0fu];
  }
  output[prefix_length + 32u] = '\0';
}

static bool effect_copy_stage_to_private(
  napi_env env,
  deckent_effect_resource *stage,
  int parent_fd,
  const char *private_name,
  mode_t mode,
  uint64_t expected_size,
  const uint8_t expected_digest[32]
) {
  int fd = -1;
  uint8_t buffer[DECKENT_EFFECT_IO_BUFFER_BYTES];
  uint64_t offset = 0u;
  deckent_effect_sha256 hash;
  uint8_t digest[32];
  if (stage == NULL || stage->magic != DECKENT_EFFECT_RESOURCE_MAGIC || !stage->sealed
      || stage->observed_bytes != expected_size
      || !effect_digest_matches_raw(stage->expected_digest, expected_digest)) {
    throw_typed(env, DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "execution-effect staged source does not match the prepared operation");
    return false;
  }
  fd = openat(parent_fd, private_name,
    O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600);
  if (fd < 0) { throw_errno_typed(env, errno); return false; }
  effect_sha256_init(&hash);
  while (offset < expected_size) {
    size_t wanted = (size_t)((expected_size - offset) > sizeof(buffer)
      ? sizeof(buffer) : expected_size - offset);
    ssize_t read_count = pread(stage->fd, buffer, wanted, (off_t)offset);
    size_t written_offset = 0u;
    if (read_count < 0 && errno == EINTR) continue;
    if (read_count <= 0 || (size_t)read_count != wanted) goto io_failed;
    while (written_offset < (size_t)read_count) {
      ssize_t written = write(fd, buffer + written_offset,
        (size_t)read_count - written_offset);
      if (written < 0 && errno == EINTR) continue;
      if (written <= 0) goto io_failed;
      written_offset += (size_t)written;
    }
    effect_sha256_update(&hash, buffer, (size_t)read_count);
    offset += (uint64_t)read_count;
  }
  effect_sha256_finish(&hash, digest);
  if (memcmp(digest, expected_digest, 32u) != 0 || fchmod(fd, mode) != 0
      || fsync(fd) != 0 || close(fd) != 0) goto io_failed_closed;
  return true;
io_failed:
  {
    int saved = errno;
    close(fd);
    unlinkat(parent_fd, private_name, 0);
    errno = saved;
  }
io_failed_closed:
  (void)unlinkat(parent_fd, private_name, 0);
  throw_typed(env, DECKENT_EFFECT_ERROR_DURABILITY,
    "execution-effect private postimage staging was not durable");
  return false;
}

static bool effect_open_parent_authority(
  napi_env env,
  const deckent_effect_resource *root,
  const deckent_effect_operation_envelope *operation,
  char **parent_path,
  char **name,
  int *parent_fd,
  deckent_posix_identity_snapshot *parent_identity
) {
  char digest[72];
  if (!effect_split_parent(env, operation->path, parent_path, name)
      || !effect_open_relative(env, root, *parent_path, parent_fd, parent_identity)
      || !S_ISDIR(parent_identity->status.st_mode)) return false;
  effect_identity_digest(parent_identity, digest);
  if (!effect_digest_matches_raw(digest, operation->parent_identity_digest)) {
    throw_typed(env, DECKENT_EFFECT_ERROR_CAS_MISMATCH,
      "execution-effect parent preimage CAS did not match");
    return false;
  }
  return true;
}

static bool effect_revalidate_parent(
  napi_env env,
  const deckent_effect_resource *root,
  const char *parent_path,
  const deckent_posix_identity_snapshot *expected
) {
  int fd = -1;
  deckent_posix_identity_snapshot observed;
  bool matches;
  if (!effect_open_relative(env, root, parent_path, &fd, &observed)) return false;
  matches = expected->status.st_dev == observed.status.st_dev
    && expected->status.st_ino == observed.status.st_ino
    && expected->mount_id == observed.mount_id
    && expected->status.st_uid == observed.status.st_uid;
  if (close(fd) != 0) matches = false;
  if (!matches) throw_typed(env, DECKENT_EFFECT_ERROR_CAS_MISMATCH,
    "execution-effect parent authority changed across mutation");
  return matches;
}

static napi_value effect_mutation_result(
  napi_env env,
  deckent_effect_operation dispatch_operation,
  const deckent_effect_operation_envelope *operation,
  const char *state,
  const char *postimage_digest
) {
  napi_value result = effect_result_start(env, "execution-effect-mutation", state);
  char operation_digest[72];
  deckent_effect_sha256 hash;
  uint8_t durability[32];
  char durability_digest[72];
  effect_raw_digest_text(operation->operation_digest, operation_digest);
  effect_sha256_init(&hash);
  effect_sha256_update(&hash, operation->operation_digest, 32u);
  effect_sha256_update(&hash, (const uint8_t *)state, strlen(state));
  if (postimage_digest != NULL) effect_sha256_update(&hash,
    (const uint8_t *)postimage_digest, strlen(postimage_digest));
  effect_sha256_finish(&hash, durability);
  effect_digest_text(durability, durability_digest);
  if (result == NULL || !set_named_string(env, result, "durabilityEvidenceDigest", durability_digest)
      || !set_named_string(env, result, "operationDigest", operation_digest)
      || (postimage_digest == NULL
        ? !set_named_null(env, result, "postimageDigest")
        : !set_named_string(env, result, "postimageDigest", postimage_digest))
      || !effect_result_finish(env, result, dispatch_operation)) return NULL;
  return result;
}

static bool effect_apply_one(
  napi_env env,
  const deckent_effect_resource *root,
  deckent_effect_resource *stage,
  const deckent_effect_operation_envelope *operation,
  char postimage_digest[72]
) {
  char *parent_path = NULL;
  char *name = NULL;
  int parent_fd = -1;
  deckent_posix_identity_snapshot parent_identity;
  bool pre_matches = false;
  char private_name[96];
  bool success = false;
  deckent_effect_entry_kind observed_kind;
  deckent_posix_identity_snapshot observed_identity;
  char observed_identity_digest[72] = {0};
  char observed_content_digest[72] = {0};
  if (!effect_open_parent_authority(env, root, operation, &parent_path, &name,
        &parent_fd, &parent_identity)
      || !effect_entry_matches(env, root, parent_fd, name, operation->pre_kind,
        operation->pre_mode, operation->pre_size, operation->pre_identity_digest,
        operation->pre_content_digest, &pre_matches)
      || !pre_matches) {
    if (!pre_matches) throw_typed(env, DECKENT_EFFECT_ERROR_CAS_MISMATCH,
      "execution-effect entry preimage CAS did not match");
    goto done;
  }
  effect_private_operation_name(".deckent-effect-op-", operation->operation_digest,
    private_name);
  if (operation->kind == DECKENT_EFFECT_MUTATION_ADD_DIRECTORY) {
    if (mkdirat(parent_fd, name, operation->post_mode) != 0 || fsync(parent_fd) != 0) {
      throw_errno_typed(env, errno); goto done;
    }
  } else if (operation->kind == DECKENT_EFFECT_MUTATION_ADD
      || operation->kind == DECKENT_EFFECT_MUTATION_REPLACE) {
    if (!effect_copy_stage_to_private(env, stage, parent_fd, private_name,
          operation->post_mode, operation->post_size, operation->post_content_digest)) goto done;
    if (operation->kind == DECKENT_EFFECT_MUTATION_ADD) {
      if (effect_rename_at2(parent_fd, private_name, parent_fd, name,
            RENAME_NOREPLACE) != 0) goto namespace_failed;
    } else {
      if (effect_rename_at2(parent_fd, private_name, parent_fd, name,
            RENAME_EXCHANGE) != 0) goto namespace_failed;
      if (!effect_entry_matches(env, root, parent_fd, private_name,
            operation->pre_kind, operation->pre_mode, operation->pre_size,
            operation->pre_identity_digest, operation->pre_content_digest,
            &pre_matches) || !pre_matches) {
        bool rolled_back = effect_rename_at2(parent_fd, private_name,
          parent_fd, name, RENAME_EXCHANGE) == 0 && fsync(parent_fd) == 0;
        throw_typed(env, rolled_back ? DECKENT_EFFECT_ERROR_CAS_MISMATCH
          : DECKENT_EFFECT_ERROR_RECONCILE_AMBIGUOUS,
          "execution-effect replace exchange CAS was not confirmed");
        goto done;
      }
      if (unlinkat(parent_fd, private_name, 0) != 0) {
        throw_typed(env, DECKENT_EFFECT_ERROR_RECONCILE_AMBIGUOUS,
          "execution-effect replaced preimage cleanup is ambiguous"); goto done;
      }
    }
    if (fsync(parent_fd) != 0) {
      throw_typed(env, DECKENT_EFFECT_ERROR_DURABILITY,
        "execution-effect file parent durability was not confirmed"); goto done;
    }
  } else if (operation->kind == DECKENT_EFFECT_MUTATION_DELETE) {
    if (effect_rename_at2(parent_fd, name, parent_fd, private_name,
          RENAME_NOREPLACE) != 0) goto namespace_failed;
    if (!effect_entry_matches(env, root, parent_fd, private_name,
          operation->pre_kind, operation->pre_mode, operation->pre_size, operation->pre_identity_digest,
          operation->pre_content_digest, &pre_matches) || !pre_matches) {
      bool rolled_back = effect_rename_at2(parent_fd, private_name,
        parent_fd, name, RENAME_NOREPLACE) == 0 && fsync(parent_fd) == 0;
      throw_typed(env, rolled_back ? DECKENT_EFFECT_ERROR_CAS_MISMATCH
        : DECKENT_EFFECT_ERROR_RECONCILE_AMBIGUOUS,
        "execution-effect delete CAS was not confirmed"); goto done;
    }
    if (unlinkat(parent_fd, private_name,
          operation->pre_kind == DECKENT_EFFECT_ENTRY_DIRECTORY ? AT_REMOVEDIR : 0) != 0
        || fsync(parent_fd) != 0) {
      throw_typed(env, DECKENT_EFFECT_ERROR_RECONCILE_AMBIGUOUS,
        "execution-effect delete durability is ambiguous"); goto done;
    }
  } else {
    int target_fd = openat(parent_fd, name, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
    if (target_fd < 0 || fchmod(target_fd, operation->post_mode) != 0
        || fsync(target_fd) != 0 || close(target_fd) != 0 || fsync(parent_fd) != 0) {
      if (target_fd >= 0) close(target_fd);
      throw_typed(env, DECKENT_EFFECT_ERROR_DURABILITY,
        "execution-effect mode durability was not confirmed"); goto done;
    }
  }
  if (!effect_revalidate_parent(env, root, parent_path, &parent_identity)
      || !effect_inspect_child(env, root, parent_fd, name,
        operation->post_kind == DECKENT_EFFECT_ENTRY_REGULAR_FILE,
        DECKENT_EFFECT_MAX_FILE_BYTES, &observed_kind, &observed_identity,
        observed_identity_digest, observed_content_digest)
      || observed_kind != operation->post_kind
      || (observed_kind != DECKENT_EFFECT_ENTRY_ABSENT
        && (observed_identity.status.st_mode & 0777) != operation->post_mode)
      || (observed_kind == DECKENT_EFFECT_ENTRY_REGULAR_FILE
        && ((uint64_t)observed_identity.status.st_size != operation->post_size
          || !effect_digest_matches_raw(observed_content_digest,
            operation->post_content_digest)))) {
    throw_typed(env, DECKENT_EFFECT_ERROR_RECONCILE_AMBIGUOUS,
      "execution-effect postimage verification is ambiguous"); goto done;
  }
  if (observed_kind == DECKENT_EFFECT_ENTRY_ABSENT) strcpy(postimage_digest, "ABSENT");
  else strcpy(postimage_digest, observed_identity_digest);
  success = true;
  goto done;
namespace_failed:
  {
    int saved = errno;
    unlinkat(parent_fd, private_name, 0);
    errno = saved;
    throw_errno_typed(env, saved);
  }
done:
  if (parent_fd >= 0 && close(parent_fd) != 0 && success) {
    success = false;
    throw_typed(env, DECKENT_EFFECT_ERROR_DURABILITY,
      "execution-effect parent handle cleanup was not confirmed");
  }
  free(parent_path);
  free(name);
  return success;
}

static bool effect_value_is_null(napi_env env, napi_value value) {
  napi_value null_value;
  bool same = false;
  return napi_get_null(env, &null_value) == napi_ok
    && napi_strict_equals(env, value, null_value, &same) == napi_ok && same;
}

static napi_value effect_apply_operation(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value root_value;
  napi_value envelope_value;
  napi_value stage_value;
  uint8_t *bytes = NULL;
  size_t length = 0u;
  deckent_effect_operation_envelope operation = {0};
  deckent_effect_borrow root_borrow = {0};
  deckent_effect_borrow stage_borrow = {0};
  deckent_effect_resource *root;
  deckent_effect_resource *stage = NULL;
  char postimage_digest[72];
  napi_value result;
  if (!effect_exact_input(env, state, DECKENT_EFFECT_OPERATION_APPLY_OPERATION,
        argc, argv, &input)
      || !get_named_value(env, input, "projectRoot", &root_value)
      || !get_named_value(env, input, "operationEnvelope", &envelope_value)
      || !get_named_value(env, input, "stagedContent", &stage_value)
      || !effect_copy_bytes(env, envelope_value,
        DECKENT_EFFECT_OPERATION_HEADER_BYTES + DECKENT_EFFECT_MAX_PATH_BYTES,
        &bytes, &length)
      || !effect_parse_operation_envelope(env, bytes, length, &operation)
      || !deckent_effect_borrow_handle(env, state, root_value,
        DECKENT_EFFECT_HANDLE_PROJECT_ROOT, DECKENT_EFFECT_RIGHT_APPLY,
        &root_borrow)) goto failed;
  root = (deckent_effect_resource *)root_borrow.resource;
  if (operation.kind == DECKENT_EFFECT_MUTATION_ADD
      || operation.kind == DECKENT_EFFECT_MUTATION_REPLACE) {
    if (!deckent_effect_borrow_handle(env, state, stage_value,
          DECKENT_EFFECT_HANDLE_STAGED_CONTENT, DECKENT_EFFECT_RIGHT_INSPECT,
          &stage_borrow)) goto failed;
    stage = (deckent_effect_resource *)stage_borrow.resource;
  } else if (!effect_value_is_null(env, stage_value)) {
    throw_typed(env, DECKENT_EFFECT_ERROR_ENVELOPE,
      "execution-effect non-file mutation carried staged authority");
    goto failed;
  }
  if (!effect_apply_one(env, root, stage, &operation, postimage_digest)) goto failed;
  result = effect_mutation_result(env, DECKENT_EFFECT_OPERATION_APPLY_OPERATION,
    &operation, "APPLIED", postimage_digest);
  if (result == NULL) goto failed;
  if (stage_borrow.active) effect_end_borrow_or_fatal(env, &stage_borrow,
    "execution-effect apply stage borrow cleanup failed");
  effect_end_borrow_or_fatal(env, &root_borrow,
    "execution-effect apply root borrow cleanup failed");
  free(operation.path);
  free(bytes);
  return result;
failed:
  if (stage_borrow.active) effect_end_borrow_or_fatal(env, &stage_borrow,
    "execution-effect failed apply stage borrow cleanup");
  if (root_borrow.active) effect_end_borrow_or_fatal(env, &root_borrow,
    "execution-effect failed apply root borrow cleanup");
  free(operation.path);
  free(bytes);
  return NULL;
}

static bool effect_post_matches(
  napi_env env,
  const deckent_effect_resource *root,
  int parent_fd,
  const char *name,
  const deckent_effect_operation_envelope *operation,
  bool *matches,
  char postimage_digest[72]
) {
  deckent_effect_entry_kind kind;
  deckent_posix_identity_snapshot identity;
  char identity_digest[72] = {0};
  char content_digest[72] = {0};
  *matches = false;
  if (!effect_inspect_child(env, root, parent_fd, name,
        operation->post_kind == DECKENT_EFFECT_ENTRY_REGULAR_FILE,
        DECKENT_EFFECT_MAX_FILE_BYTES, &kind, &identity,
        identity_digest, content_digest)) return false;
  if (kind != operation->post_kind) return true;
  if (kind == DECKENT_EFFECT_ENTRY_ABSENT) {
    strcpy(postimage_digest, "ABSENT");
    *matches = true;
    return true;
  }
  if ((identity.status.st_mode & 0777) != operation->post_mode) return true;
  if (operation->kind == DECKENT_EFFECT_MUTATION_MODE
      && !effect_digest_matches_raw(identity_digest,
        operation->pre_identity_digest)) return true;
  if (kind == DECKENT_EFFECT_ENTRY_REGULAR_FILE
      && (identity.status.st_size < 0
        || (uint64_t)identity.status.st_size != operation->post_size
        || !effect_digest_matches_raw(content_digest,
          operation->post_content_digest))) return true;
  strcpy(postimage_digest, identity_digest);
  *matches = true;
  return true;
}

static napi_value effect_reconcile_operation(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value root_value;
  napi_value envelope_value;
  napi_value stage_value;
  uint8_t *bytes = NULL;
  size_t length = 0u;
  deckent_effect_operation_envelope operation = {0};
  deckent_effect_borrow root_borrow = {0};
  deckent_effect_borrow stage_borrow = {0};
  deckent_effect_resource *root;
  deckent_effect_resource *stage = NULL;
  char *parent_path = NULL;
  char *name = NULL;
  int parent_fd = -1;
  deckent_posix_identity_snapshot parent_identity;
  bool post_matches = false;
  bool pre_matches = false;
  char postimage_digest[72];
  char private_name[96];
  deckent_effect_entry_kind private_kind;
  deckent_posix_identity_snapshot private_identity;
  char private_identity_digest[72] = {0};
  char private_content_digest[72] = {0};
  napi_value result;
  if (!effect_exact_input(env, state, DECKENT_EFFECT_OPERATION_RECONCILE_OPERATION,
        argc, argv, &input)
      || !get_named_value(env, input, "projectRoot", &root_value)
      || !get_named_value(env, input, "operationEnvelope", &envelope_value)
      || !get_named_value(env, input, "stagedContent", &stage_value)
      || !effect_copy_bytes(env, envelope_value,
        DECKENT_EFFECT_OPERATION_HEADER_BYTES + DECKENT_EFFECT_MAX_PATH_BYTES,
        &bytes, &length)
      || !effect_parse_operation_envelope(env, bytes, length, &operation)
      || !deckent_effect_borrow_handle(env, state, root_value,
        DECKENT_EFFECT_HANDLE_PROJECT_ROOT, DECKENT_EFFECT_RIGHT_RECONCILE,
        &root_borrow)) goto failed;
  if (operation.kind == DECKENT_EFFECT_MUTATION_ADD
      || operation.kind == DECKENT_EFFECT_MUTATION_REPLACE) {
    if (!deckent_effect_borrow_handle(env, state, stage_value,
          DECKENT_EFFECT_HANDLE_STAGED_CONTENT, DECKENT_EFFECT_RIGHT_INSPECT,
          &stage_borrow)) goto failed;
    stage = (deckent_effect_resource *)stage_borrow.resource;
    if (stage == NULL || stage->magic != DECKENT_EFFECT_RESOURCE_MAGIC
        || !stage->sealed || stage->observed_bytes != operation.post_size
        || !effect_digest_matches_raw(stage->expected_digest,
          operation.post_content_digest)) {
      throw_typed(env, DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
        "execution-effect reconcile staged authority does not match the prepared operation");
      goto failed;
    }
  } else if (!effect_value_is_null(env, stage_value)) {
    throw_typed(env, DECKENT_EFFECT_ERROR_ENVELOPE,
      "execution-effect reconcile staged authority cardinality is invalid");
    goto failed;
  }
  root = (deckent_effect_resource *)root_borrow.resource;
  if (!effect_open_parent_authority(env, root, &operation, &parent_path, &name,
        &parent_fd, &parent_identity)
      || !effect_post_matches(env, root, parent_fd, name, &operation,
        &post_matches, postimage_digest)
      || !effect_entry_matches(env, root, parent_fd, name, operation.pre_kind,
        operation.pre_mode, operation.pre_size, operation.pre_identity_digest,
        operation.pre_content_digest, &pre_matches)) goto failed;
  effect_private_operation_name(".deckent-effect-op-", operation.operation_digest,
    private_name);
  if (!effect_inspect_child(env, root, parent_fd, private_name, true,
        DECKENT_EFFECT_MAX_FILE_BYTES, &private_kind, &private_identity,
        private_identity_digest, private_content_digest)) goto failed;
  if (post_matches) {
    if (private_kind != DECKENT_EFFECT_ENTRY_ABSENT) {
      bool private_is_pre = private_kind == operation.pre_kind
        && (private_identity.status.st_mode & 0777) == operation.pre_mode
        && effect_digest_matches_raw(private_identity_digest,
          operation.pre_identity_digest)
        && (private_kind != DECKENT_EFFECT_ENTRY_REGULAR_FILE
          || ((uint64_t)private_identity.status.st_size == operation.pre_size
            && effect_digest_matches_raw(private_content_digest,
              operation.pre_content_digest)));
      if (!private_is_pre || unlinkat(parent_fd, private_name,
            private_kind == DECKENT_EFFECT_ENTRY_DIRECTORY ? AT_REMOVEDIR : 0) != 0
          || fsync(parent_fd) != 0) goto ambiguous;
    }
    result = effect_mutation_result(env,
      DECKENT_EFFECT_OPERATION_RECONCILE_OPERATION, &operation,
      "APPLIED", postimage_digest);
  } else if (pre_matches) {
    if (private_kind != DECKENT_EFFECT_ENTRY_ABSENT) {
      bool private_is_post = private_kind == operation.post_kind
        && (private_identity.status.st_mode & 0777) == operation.post_mode
        && (private_kind != DECKENT_EFFECT_ENTRY_REGULAR_FILE
          || ((uint64_t)private_identity.status.st_size == operation.post_size
            && effect_digest_matches_raw(private_content_digest,
              operation.post_content_digest)));
      if (!private_is_post || unlinkat(parent_fd, private_name,
            private_kind == DECKENT_EFFECT_ENTRY_DIRECTORY ? AT_REMOVEDIR : 0) != 0
          || fsync(parent_fd) != 0) goto ambiguous;
    }
    result = effect_mutation_result(env,
      DECKENT_EFFECT_OPERATION_RECONCILE_OPERATION, &operation,
      "NOT_APPLIED", NULL);
  } else if (operation.kind == DECKENT_EFFECT_MUTATION_DELETE
      && private_kind == operation.pre_kind
      && effect_digest_matches_raw(private_identity_digest,
        operation.pre_identity_digest)) {
    if (unlinkat(parent_fd, private_name,
          private_kind == DECKENT_EFFECT_ENTRY_DIRECTORY ? AT_REMOVEDIR : 0) != 0
        || fsync(parent_fd) != 0) goto ambiguous;
    result = effect_mutation_result(env,
      DECKENT_EFFECT_OPERATION_RECONCILE_OPERATION, &operation,
      "APPLIED", "ABSENT");
  } else goto ambiguous;
  if (result == NULL || !effect_revalidate_parent(env, root, parent_path,
        &parent_identity)) goto failed;
  if (close(parent_fd) != 0) { parent_fd = -1; goto ambiguous; }
  parent_fd = -1;
  if (stage_borrow.active) effect_end_borrow_or_fatal(env, &stage_borrow,
    "execution-effect reconcile stage borrow cleanup failed");
  effect_end_borrow_or_fatal(env, &root_borrow,
    "execution-effect reconcile root borrow cleanup failed");
  free(parent_path); free(name); free(operation.path); free(bytes);
  return result;
ambiguous:
  throw_typed(env, DECKENT_EFFECT_ERROR_RECONCILE_AMBIGUOUS,
    "execution-effect crash prefix could not be reconciled exactly");
failed:
  if (parent_fd >= 0) close(parent_fd);
  if (stage_borrow.active) effect_end_borrow_or_fatal(env, &stage_borrow,
    "execution-effect failed reconcile stage borrow cleanup");
  if (root_borrow.active) effect_end_borrow_or_fatal(env, &root_borrow,
    "execution-effect failed reconcile root borrow cleanup");
  free(parent_path); free(name); free(operation.path); free(bytes);
  return NULL;
}

static napi_value effect_verify_postimages(
  napi_env env,
  deckent_native_state *state,
  size_t argc,
  napi_value *argv
) {
  napi_value input;
  napi_value root_value;
  napi_value envelope_value;
  uint8_t *bytes = NULL;
  size_t length = 0u;
  size_t offset = 12u;
  uint32_t count;
  uint32_t index;
  deckent_effect_borrow root_borrow = {0};
  deckent_effect_resource *root;
  deckent_effect_sha256 postimage_hash;
  uint8_t postimage_digest_raw[32];
  char postimage_digest[72];
  deckent_effect_sha256 plan_hash;
  uint8_t plan_digest_raw[32];
  char plan_digest[72];
  napi_value result;
  napi_value pending_error;
  if (!effect_exact_input(env, state, DECKENT_EFFECT_OPERATION_VERIFY_POSTIMAGES,
        argc, argv, &input)
      || !get_named_value(env, input, "projectRoot", &root_value)
      || !get_named_value(env, input, "planEnvelope", &envelope_value)
      || !effect_copy_bytes(env, envelope_value,
        DECKENT_EFFECT_MAX_AGGREGATE_PATH_BYTES, &bytes, &length)
      || length < 12u || memcmp(bytes, "DEP2", 4u) != 0
      || effect_read_be32(bytes + 4u) != 1u) goto invalid;
  count = effect_read_be32(bytes + 8u);
  if (count == 0u || count > DECKENT_EFFECT_MAX_ENTRIES
      || !deckent_effect_borrow_handle(env, state, root_value,
        DECKENT_EFFECT_HANDLE_PROJECT_ROOT, DECKENT_EFFECT_RIGHT_VERIFY,
        &root_borrow)) goto invalid;
  root = (deckent_effect_resource *)root_borrow.resource;
  effect_sha256_init(&postimage_hash);
  for (index = 0u; index < count; index += 1u) {
    uint32_t operation_length;
    deckent_effect_operation_envelope operation = {0};
    char *parent_path = NULL;
    char *name = NULL;
    int parent_fd = -1;
    deckent_posix_identity_snapshot parent_identity;
    bool matches = false;
    char observed[72];
    if (offset > length - 4u) goto invalid;
    operation_length = effect_read_be32(bytes + offset);
    offset += 4u;
    if (operation_length < DECKENT_EFFECT_OPERATION_HEADER_BYTES
        || operation_length > length - offset
        || !effect_parse_operation_envelope(env, bytes + offset,
          operation_length, &operation)
        || !effect_open_parent_authority(env, root, &operation,
          &parent_path, &name, &parent_fd, &parent_identity)
        || !effect_post_matches(env, root, parent_fd, name, &operation,
          &matches, observed) || !matches) {
      if (!matches) throw_typed(env, DECKENT_EFFECT_ERROR_CAS_MISMATCH,
        "execution-effect final postimage set does not match the plan");
      if (parent_fd >= 0) close(parent_fd);
      free(parent_path); free(name); free(operation.path);
      goto invalid;
    }
    effect_sha256_update(&postimage_hash, operation.operation_digest, 32u);
    effect_sha256_update(&postimage_hash, (const uint8_t *)observed, strlen(observed));
    if (close(parent_fd) != 0) {
      free(parent_path); free(name); free(operation.path); goto invalid;
    }
    free(parent_path); free(name); free(operation.path);
    offset += operation_length;
  }
  if (offset != length) goto invalid;
  effect_sha256_finish(&postimage_hash, postimage_digest_raw);
  effect_digest_text(postimage_digest_raw, postimage_digest);
  effect_sha256_init(&plan_hash);
  effect_sha256_update(&plan_hash, bytes, length);
  effect_sha256_finish(&plan_hash, plan_digest_raw);
  effect_digest_text(plan_digest_raw, plan_digest);
  result = effect_result_start(env, "execution-effect-final-verification", "VERIFIED");
  if (result == NULL || !set_named_string(env, result, "planDigest", plan_digest)
      || !set_named_string(env, result, "postimageSetDigest", postimage_digest)
      || !set_named_uint32(env, result, "verifiedCount", count)
      || !effect_result_finish(env, result,
        DECKENT_EFFECT_OPERATION_VERIFY_POSTIMAGES)) goto invalid;
  effect_end_borrow_or_fatal(env, &root_borrow,
    "execution-effect verify root borrow cleanup failed");
  free(bytes);
  return result;
invalid:
  if (root_borrow.active) effect_end_borrow_or_fatal(env, &root_borrow,
    "execution-effect failed verify root borrow cleanup");
  free(bytes);
  pending_error = take_pending_exception(env);
  return restore_pending_or_throw(env, pending_error,
    DECKENT_EFFECT_ERROR_ENVELOPE,
    "execution-effect plan envelope is invalid");
}

static napi_value execution_effect_linux_invoke(
  napi_env env,
  deckent_native_state *state,
  deckent_effect_operation operation,
  size_t argc,
  napi_value *argv
) {
  switch (operation) {
    case DECKENT_EFFECT_OPERATION_OPEN_ROOT:
      return effect_open_root(env, state, argc, argv);
    case DECKENT_EFFECT_OPERATION_CAPTURE_TREE:
      return effect_capture_tree(env, state, argc, argv);
    case DECKENT_EFFECT_OPERATION_INSPECT_ENTRY:
      return effect_inspect_entry(env, state, argc, argv);
    case DECKENT_EFFECT_OPERATION_BEGIN_STAGE:
      return effect_begin_stage(env, state, argc, argv);
    case DECKENT_EFFECT_OPERATION_APPEND_STAGE:
      return effect_append_stage(env, state, argc, argv);
    case DECKENT_EFFECT_OPERATION_SEAL_STAGE:
      return effect_seal_stage(env, state, argc, argv);
    case DECKENT_EFFECT_OPERATION_APPLY_OPERATION:
      return effect_apply_operation(env, state, argc, argv);
    case DECKENT_EFFECT_OPERATION_RECONCILE_OPERATION:
      return effect_reconcile_operation(env, state, argc, argv);
    case DECKENT_EFFECT_OPERATION_VERIFY_POSTIMAGES:
      return effect_verify_postimages(env, state, argc, argv);
    case DECKENT_EFFECT_OPERATION_BEGIN_SOURCE_READ:
      return effect_begin_source_read(env, state, argc, argv);
    case DECKENT_EFFECT_OPERATION_NEXT_SOURCE_CHUNK:
      return effect_next_source_chunk(env, state, argc, argv);
    case DECKENT_EFFECT_OPERATION_FINISH_SOURCE_READ:
      return effect_finish_source_read(env, state, argc, argv);
    default:
      return throw_typed(env, "E_EXEC_AUTH_NATIVE_OPERATION",
        "execution-effect operation is not part of backend ABI v2.1");
  }
}

const deckent_effect_backend_v2 *deckent_effect_linux_backend_v2(void) {
  static const deckent_effect_backend_v2 backend = {
    (uint32_t)sizeof(deckent_effect_backend_v2),
    DECKENT_EXECUTION_EFFECT_ABI_VERSION_NUMBER,
    DECKENT_NATIVE_PLATFORM_LINUX,
    DECKENT_EXECUTION_EFFECT_FEATURE_LINUX,
    execution_effect_linux_invoke,
  };
  return &backend;
}

#endif
