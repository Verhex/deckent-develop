/*
 * @deckent/exec-authority-native
 *
 * One versioned N-API boundary for the legacy execution-lock adapter and the
 * task-attempt custody backends. This common translation unit owns the exact
 * ABI manifest, per-environment handle state and generation/borrow fencing.
 * Platform custody syscalls live only in custody_posix.c / custody_win32.c.
 */

#define NAPI_VERSION 8
#include <node_api.h>

#include "custody_common.h"

#include <inttypes.h>
#include <limits.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#if !defined(_WIN32)
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

#ifdef __APPLE__
#include <sys/mount.h>
#include <sys/param.h>
#include <sys/sysctl.h>
#include <sys/time.h>
#include <uuid/uuid.h>
#endif
#endif

#ifndef DECKENT_EXEC_AUTHORITY_PACKAGE_NAME
#error "DECKENT_EXEC_AUTHORITY_PACKAGE_NAME must be derived from package.json"
#endif

#ifndef DECKENT_EXEC_AUTHORITY_PACKAGE_VERSION
#error "DECKENT_EXEC_AUTHORITY_PACKAGE_VERSION must be derived from package.json"
#endif

#if defined(DECKENT_EXEC_AUTHORITY_HAS_POSIX_BACKEND) \
    && defined(DECKENT_EXEC_AUTHORITY_HAS_WIN32_BACKEND)
#error "exactly one custody backend may be compiled into an addon"
#endif

#if defined(_WIN32) && defined(DECKENT_EXEC_AUTHORITY_HAS_POSIX_BACKEND)
#error "the POSIX custody backend cannot be compiled for Win32"
#endif

#if !defined(_WIN32) && defined(DECKENT_EXEC_AUTHORITY_HAS_WIN32_BACKEND)
#error "the Win32 custody backend cannot be compiled for POSIX"
#endif

#if defined(_WIN32)
#define DECKENT_COMPILED_PLATFORM DECKENT_NATIVE_PLATFORM_WIN32
#define DECKENT_COMPILED_PLATFORM_NAME "win32"
#define DECKENT_HAS_LEGACY_POSIX 0
#elif defined(__APPLE__)
#define DECKENT_COMPILED_PLATFORM DECKENT_NATIVE_PLATFORM_DARWIN
#define DECKENT_COMPILED_PLATFORM_NAME "darwin"
#define DECKENT_HAS_LEGACY_POSIX 1
#elif defined(__linux__)
#define DECKENT_COMPILED_PLATFORM DECKENT_NATIVE_PLATFORM_LINUX
#define DECKENT_COMPILED_PLATFORM_NAME "linux"
#define DECKENT_HAS_LEGACY_POSIX 1
#else
#define DECKENT_COMPILED_PLATFORM DECKENT_NATIVE_PLATFORM_UNSUPPORTED
#define DECKENT_COMPILED_PLATFORM_NAME "unsupported"
#define DECKENT_HAS_LEGACY_POSIX 0
#endif

#if defined(_M_X64) || defined(__x86_64__)
#define DECKENT_COMPILED_ARCH "x64"
#elif defined(_M_ARM64) || defined(__aarch64__)
#define DECKENT_COMPILED_ARCH "arm64"
#elif defined(_M_IX86) || defined(__i386__)
#define DECKENT_COMPILED_ARCH "ia32"
#elif defined(_M_ARM) || defined(__arm__)
#define DECKENT_COMPILED_ARCH "arm"
#else
#define DECKENT_COMPILED_ARCH "unknown"
#endif

#ifndef DECKENT_EXEC_AUTHORITY_BUILD_TYPE
#error "DECKENT_EXEC_AUTHORITY_BUILD_TYPE must come from the node-gyp configuration"
#endif
#define DECKENT_COMPILED_BUILD_TYPE DECKENT_EXEC_AUTHORITY_BUILD_TYPE

#define MAX_NAME_BYTES 4096
#define DECKENT_INITIAL_HANDLE_CAPACITY 16u
#define DECKENT_MAX_HANDLE_CAPACITY 65536u
#define DECKENT_INITIAL_LEGACY_CAPACITY 16u
#define DECKENT_OPERATION_NAME_CAPACITY 64u

static bool check_napi(
  napi_env env,
  napi_status status,
  const char *code,
  const char *message
);

static napi_status define_own_value_status(
  napi_env env,
  napi_value target,
  const char *name,
  napi_value value
);

static napi_status define_own_index_status(
  napi_env env,
  napi_value target,
  uint32_t index,
  napi_value value
);

static bool created_result_shape_is_exact(
  napi_env env,
  deckent_native_state *state,
  napi_value result,
  napi_value created_handle
);

typedef struct deckent_native_result_token deckent_native_result_token;

typedef enum deckent_native_active_transfer_kind {
  DECKENT_NATIVE_ACTIVE_TRANSFER_NONE = 0,
  DECKENT_NATIVE_ACTIVE_TRANSFER_SEAL = 1,
  DECKENT_NATIVE_ACTIVE_TRANSFER_ABORT = 2,
} deckent_native_active_transfer_kind;

typedef struct deckent_native_active_transfer {
  deckent_native_active_transfer_kind kind;
  deckent_native_result_token *primary_token;
  deckent_native_result_token *fallback_token;
  napi_ref primary_result_ref;
  napi_ref input_ref;
  napi_ref replacement_ref;
  napi_ref fallback_result_ref;
  uint32_t input_slot_index;
  uint64_t input_generation;
  deckent_native_handle_kind input_kind;
  uint32_t input_rights;
  uint32_t expected_input_state;
  bool force_cleanup_unconfirmed;
} deckent_native_active_transfer;

static bool native_exact_key_set(
  napi_env env,
  napi_value object,
  const char *const *expected,
  uint32_t expected_count
);

static bool resolve_seal_result_transfer(
  napi_env env,
  deckent_native_state *state,
  deckent_native_result_token *token,
  napi_value result,
  napi_value input_snapshot,
  napi_value *accepted_result
);

static bool resolve_abort_result_transfer(
  napi_env env,
  deckent_native_state *state,
  deckent_native_result_token *token,
  napi_value result,
  napi_value input_snapshot,
  napi_value *accepted_result
);

static bool active_result_transfer_is_armed(
  const deckent_native_state *state
);

static bool get_native_state(napi_env env, deckent_native_state **state);

typedef struct deckent_native_handle_slot {
  uint64_t generation;
  uintptr_t resource;
  deckent_native_resource_close close_resource;
  deckent_native_handle_kind kind;
  uint32_t rights;
  uint32_t state;
  uint32_t borrow_count;
  bool active;
  bool retired;
} deckent_native_handle_slot;

typedef struct deckent_native_handle_token {
  struct deckent_native_state *owner;
  uint32_t slot_index;
  uint64_t generation;
  deckent_native_handle_kind kind;
  uint32_t rights;
  uint32_t state;
  bool created_result_guard_bound;
  bool closed;
} deckent_native_handle_token;

typedef struct deckent_legacy_fd_slot {
  uint32_t token;
  int32_t fd;
  bool active;
} deckent_legacy_fd_slot;

typedef struct deckent_effect_handle_slot {
  uint64_t generation;
  uintptr_t resource;
  deckent_native_resource_close close_resource;
  deckent_effect_handle_kind kind;
  uint32_t rights;
  uint32_t borrow_count;
  bool active;
  bool retired;
} deckent_effect_handle_slot;

typedef struct deckent_effect_state {
  deckent_effect_handle_slot *slots;
  uint32_t slot_capacity;
  uint32_t token_count;
  uint32_t input_token_count;
  uint32_t result_token_count;
  uint32_t outstanding_borrow_count;
  uint64_t active_invocation_id;
  uint64_t next_invocation_id;
  bool backend_invocation_active;
  const deckent_effect_backend_v2 *backend;
} deckent_effect_state;

struct deckent_native_state {
  napi_env env;
  deckent_native_handle_slot *slots;
  uint32_t slot_capacity;
  uint32_t token_count;
  deckent_legacy_fd_slot *legacy_slots;
  uint32_t legacy_slot_count;
  uint32_t legacy_slot_capacity;
  uint32_t next_legacy_token;
  uint32_t input_token_count;
  uint64_t active_invocation_id;
  uint64_t next_invocation_id;
  uint32_t outstanding_borrow_count;
  uint32_t active_input_slot_index;
  uint64_t active_input_generation;
  deckent_native_handle_kind active_input_kind;
  uint32_t active_input_rights;
  uint32_t active_input_states;
  bool active_input_attested;
  bool backend_invocation_active;
  bool legacy_token_exhausted;
  bool instance_finalized;
  deckent_native_result_token *created_result_guards;
  deckent_native_active_transfer active_transfer;
  const deckent_custody_backend_v1 *backend;
  deckent_effect_state effect;
};

static const napi_type_tag DECKENT_CUSTODY_HANDLE_TAG = {
  0x8a157fda32764cc1ULL,
  0xb6c5d97e4e118af3ULL,
};

static const napi_type_tag DECKENT_CUSTODY_RESULT_TAG = {
  0x95e95db2e7264f51ULL,
  0xa27664bc813e2d29ULL,
};

static const napi_type_tag DECKENT_CUSTODY_INPUT_TAG = {
  0x9d35cd728c114296ULL,
  0x86be03fa472872acULL,
};

static const napi_type_tag DECKENT_NATIVE_ERROR_TAG = {
  0xc66336ef1ca14e81ULL,
  0x889a3ff37f41e2b6ULL,
};

static const napi_type_tag DECKENT_EFFECT_HANDLE_TAG = {
  0xf63d8895a9154781ULL,
  0x9debb9ff28d390b2ULL,
};

static const napi_type_tag DECKENT_EFFECT_INPUT_TAG = {
  0x81a10daf05514998ULL,
  0xa755e6645c55d3a7ULL,
};

static const napi_type_tag DECKENT_EFFECT_RESULT_TAG = {
  0xb3e551f0307f4f4bULL,
  0x9d73b8f688cca856ULL,
};

typedef struct deckent_effect_handle_token {
  deckent_native_state *owner;
  uint32_t slot_index;
  uint64_t generation;
  deckent_effect_handle_kind kind;
  uint32_t rights;
  bool closed;
} deckent_effect_handle_token;

typedef struct deckent_effect_input_token {
  deckent_native_state *owner;
  deckent_effect_operation operation;
} deckent_effect_input_token;

typedef struct deckent_effect_result_token {
  deckent_native_state *owner;
  deckent_effect_operation operation;
  bool finalized;
  bool consumed;
} deckent_effect_result_token;

struct deckent_native_result_token {
  deckent_custody_operation operation;
  deckent_custody_operation created_guard_operation;
  deckent_native_state *created_guard_owner;
  deckent_native_result_token *created_guard_previous;
  deckent_native_result_token *created_guard_next;
  deckent_native_handle_token *created_handle_token;
  napi_ref created_handle_ref;
  uintptr_t created_guard;
  deckent_native_created_guard_resolve resolve_created_guard;
  uint32_t input_slot_index;
  uint64_t input_generation;
  deckent_native_handle_kind input_kind;
  uint32_t input_rights;
  uint32_t input_states;
  bool input_attested;
  bool finalized;
  bool consumed;
  bool created_guard_armed;
  bool active_transfer_primary;
  bool active_transfer_fallback;
};

typedef struct deckent_native_input_token {
  deckent_native_state *owner;
  deckent_custody_operation operation;
} deckent_native_input_token;

typedef enum deckent_common_created_guard_outcome {
  DECKENT_COMMON_CREATED_GUARD_NONE = 0,
  DECKENT_COMMON_CREATED_GUARD_ACCEPTED = 1,
  DECKENT_COMMON_CREATED_GUARD_ROLLED_BACK = 2,
  DECKENT_COMMON_CREATED_GUARD_UNCONFIRMED = 3,
} deckent_common_created_guard_outcome;

typedef enum deckent_common_open_result_state {
  DECKENT_COMMON_OPEN_RESULT_INVALID = 0,
  DECKENT_COMMON_OPEN_RESULT_OPENED = 1,
  DECKENT_COMMON_OPEN_RESULT_CREATED = 2,
} deckent_common_open_result_state;

static deckent_common_open_result_state inspect_open_result_state(
  napi_env env,
  deckent_native_state *state,
  napi_value result
);

static deckent_common_created_guard_outcome resolve_created_result_guard(
  napi_env env,
  deckent_native_result_token *token,
  bool accept
);

static bool reject_created_result_guard(
  napi_env env,
  deckent_native_result_token *token
);

static bool reject_all_created_result_guards(
  napi_env env,
  deckent_native_state *state
);

static void reject_created_result_guard_or_fatal(
  napi_env env,
  deckent_native_result_token *token,
  const char *message
);

static bool is_admitted_native_error_code(const char *code) {
  static const char *const codes[] = {
    "E_EXEC_AUTH_NATIVE_STATE",
    "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
    "E_EXEC_AUTH_NATIVE_INIT",
    "E_EXEC_AUTH_NATIVE_ARGUMENT",
    "E_EXEC_AUTH_NATIVE_OPERATION",
    "E_EXEC_AUTH_NATIVE_FEATURE_UNAVAILABLE",
    "E_EXEC_AUTH_NATIVE_HANDLE_LIMIT",
    "E_EXEC_AUTH_NATIVE_ALLOCATION",
    "E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED",
    "E_EXEC_AUTH_NATIVE_HANDLE_CONTRACT",
    "E_EXEC_AUTH_NATIVE_HANDLE_CREATE",
    "E_EXEC_AUTH_NATIVE_HANDLE_FORGED",
    "E_EXEC_AUTH_NATIVE_HANDLE_FOREIGN",
    "E_EXEC_AUTH_NATIVE_HANDLE_CLOSED",
    "E_EXEC_AUTH_NATIVE_HANDLE_STALE",
    "E_EXEC_AUTH_NATIVE_HANDLE_KIND",
    "E_EXEC_AUTH_NATIVE_HANDLE_RIGHTS",
    "E_EXEC_AUTH_NATIVE_HANDLE_STATE",
    "E_EXEC_AUTH_NATIVE_HANDLE_BORROWED",
    "E_EXEC_AUTH_NATIVE_BORROW_CONTRACT",
    "E_EXEC_AUTH_NATIVE_BORROW_LIMIT",
    "E_EXEC_AUTH_NATIVE_BORROW_STALE",
    "E_EXEC_AUTH_NATIVE_LEGACY_TOKEN_LIMIT",
    "E_EXEC_AUTH_NATIVE_LEGACY_TOKEN_EXHAUSTED",
    DECKENT_NATIVE_ERROR_NOT_FOUND,
    DECKENT_NATIVE_ERROR_ALREADY_EXISTS,
    DECKENT_NATIVE_ERROR_INVALID_COMPONENT,
    DECKENT_NATIVE_ERROR_REPARSE_REJECTED,
    DECKENT_NATIVE_ERROR_PRIVACY_UNCONFIRMED,
    DECKENT_NATIVE_ERROR_OBJECT_TYPE_MISMATCH,
    DECKENT_NATIVE_ERROR_LINK_COUNT_UNSAFE,
    DECKENT_NATIVE_ERROR_SIZE_LIMIT,
    DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
    DECKENT_NATIVE_ERROR_VOLUME_UNSUPPORTED,
    DECKENT_NATIVE_ERROR_REMOTE_VOLUME_UNSUPPORTED,
    DECKENT_NATIVE_ERROR_NAMESPACE_CONFLICT,
    DECKENT_NATIVE_ERROR_DURABILITY_UNCONFIRMED,
    DECKENT_NATIVE_ERROR_PUBLISH_UNCONFIRMED,
    DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
    DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
    DECKENT_NATIVE_ERROR_IO_UNCONFIRMED,
    DECKENT_NATIVE_ERROR_ROOT_OVERLAP,
    DECKENT_NATIVE_ERROR_ROOT_SEPARATION_UNCONFIRMED,
    DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_BOUNDS,
    DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_DEADLINE,
    DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_MUTATED,
    DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_ENTRY_INVALID,
    DECKENT_EFFECT_ERROR_CANCELLED,
    DECKENT_EFFECT_ERROR_DEADLINE,
    DECKENT_EFFECT_ERROR_BOUNDS,
    DECKENT_EFFECT_ERROR_CAS_MISMATCH,
    DECKENT_EFFECT_ERROR_DURABILITY,
    DECKENT_EFFECT_ERROR_RECONCILE_AMBIGUOUS,
    DECKENT_EFFECT_ERROR_ENVELOPE,
    "ENOENT",
    "ENOTDIR",
    "EISDIR",
    "ELOOP",
    "EACCES",
    "EPERM",
    "EEXIST",
    "ENOTEMPTY",
    "EBADF",
    "EINVAL",
    "EXDEV",
    "EUNKNOWN",
  };
  size_t index;
  if (code == NULL) return false;
  for (index = 0u; index < sizeof(codes) / sizeof(codes[0]); index += 1u) {
    if (strcmp(code, codes[index]) == 0) return true;
  }
  return false;
}

napi_value deckent_native_throw(
  napi_env env,
  const char *code,
  const char *message
) {
  const char *safe_code = is_admitted_native_error_code(code)
    ? code
    : "E_EXEC_AUTH_NATIVE_OPERATION";
  bool pending = false;
  napi_value discarded;
  napi_value code_value;
  napi_value message_value;
  napi_value error;
  napi_status status;
  (void)message;
  status = napi_is_exception_pending(env, &pending);
  if (status != napi_ok) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "native exception state is unavailable",
      NAPI_AUTO_LENGTH
    );
  }
  if (pending
      && napi_get_and_clear_last_exception(env, &discarded) != napi_ok) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "native pending exception could not be sanitized",
      NAPI_AUTO_LENGTH
    );
  }
  status = napi_create_string_utf8(
    env,
    safe_code,
    NAPI_AUTO_LENGTH,
    &code_value
  );
  if (status == napi_ok) {
    status = napi_create_string_utf8(
      env,
      "execution authority native operation failed",
      NAPI_AUTO_LENGTH,
      &message_value
    );
  }
  if (status == napi_ok) {
    status = napi_create_error(env, code_value, message_value, &error);
  }
  if (status == napi_ok) {
    status = napi_type_tag_object(env, error, &DECKENT_NATIVE_ERROR_TAG);
  }
  if (status == napi_ok) status = napi_object_freeze(env, error);
  if (status == napi_ok) status = napi_throw(env, error);
  if (status != napi_ok) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "typed native exception could not be created",
      NAPI_AUTO_LENGTH
    );
  }
  return NULL;
}

static napi_status define_own_value_status(
  napi_env env,
  napi_value target,
  const char *name,
  napi_value value
) {
  napi_property_descriptor descriptor = {
    .utf8name = name,
    .value = value,
    .attributes = napi_enumerable,
  };
  if (target == NULL || name == NULL || name[0] == '\0' || value == NULL) {
    return napi_invalid_arg;
  }
  return napi_define_properties(env, target, 1u, &descriptor);
}

static napi_status define_own_index_status(
  napi_env env,
  napi_value target,
  uint32_t index,
  napi_value value
) {
  char name[16];
  int length;
  napi_value key;
  napi_property_descriptor descriptor = {
    .attributes = napi_enumerable,
  };
  if (target == NULL || value == NULL) return napi_invalid_arg;
  length = snprintf(name, sizeof(name), "%" PRIu32, index);
  if (length <= 0 || (size_t)length >= sizeof(name)) return napi_invalid_arg;
  if (napi_create_string_utf8(env, name, (size_t)length, &key) != napi_ok) {
    return napi_generic_failure;
  }
  descriptor.name = key;
  descriptor.value = value;
  return napi_define_properties(env, target, 1u, &descriptor);
}

bool deckent_native_define_own_value(
  napi_env env,
  napi_value target,
  const char *name,
  napi_value value
) {
  if (define_own_value_status(env, target, name, value) == napi_ok) return true;
  deckent_native_throw(
    env,
    "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
    "custody backend own-data field definition failed"
  );
  return false;
}

bool deckent_native_define_own_index(
  napi_env env,
  napi_value target,
  uint32_t index,
  napi_value value
) {
  if (define_own_index_status(env, target, index, value) == napi_ok) return true;
  deckent_native_throw(
    env,
    "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
    "custody backend own-data array definition failed"
  );
  return false;
}

static void throw_sanitized_backend_exception(
  napi_env env,
  napi_value exception
) {
  napi_valuetype type;
  bool tagged = false;
  if (napi_typeof(env, exception, &type) == napi_ok
      && type == napi_object
      && napi_check_object_type_tag(
           env,
           exception,
           &DECKENT_NATIVE_ERROR_TAG,
           &tagged
         ) == napi_ok
      && tagged) {
    if (napi_throw(env, exception) != napi_ok) {
      napi_fatal_error(
        "deckent.exec-authority",
        NAPI_AUTO_LENGTH,
        "typed backend exception could not be rethrown",
        NAPI_AUTO_LENGTH
      );
    }
    return;
  }
  deckent_native_throw(
    env,
    "E_EXEC_AUTH_NATIVE_OPERATION",
    "custody backend raised an untrusted exception"
  );
}

/*
 * Backend code may return NULL with a pending exception. Only an immutable
 * error produced and tagged by deckent_native_throw may cross this boundary;
 * foreign exceptions are cleared without reading properties/getters and
 * replaced with the finite generic operation error.
 */
static bool sanitize_backend_pending_exception(
  napi_env env,
  deckent_native_state *state
) {
  bool pending = false;
  napi_value exception;
  if (napi_is_exception_pending(env, &pending) != napi_ok) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "backend exception state is unavailable",
      NAPI_AUTO_LENGTH
    );
  }
  if (!pending) return false;
  if (napi_get_and_clear_last_exception(env, &exception) != napi_ok) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "backend exception could not be sanitized",
      NAPI_AUTO_LENGTH
    );
  }
  if (!reject_all_created_result_guards(env, state)) return true;
  throw_sanitized_backend_exception(env, exception);
  return true;
}

static void native_result_finalize(napi_env env, void *data, void *hint) {
  deckent_native_result_token *token = (deckent_native_result_token *)data;
  (void)hint;
  if (token == NULL) return;
  if (token->active_transfer_primary
      || token->active_transfer_fallback) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "unsettled result transfer reached finalization",
      NAPI_AUTO_LENGTH
    );
  }
  reject_created_result_guard_or_fatal(
    env,
    token,
    "unaccepted created result rollback was not confirmed"
  );
  free(token);
}

napi_value deckent_native_create_result_record(napi_env env) {
  deckent_native_result_token *token;
  deckent_native_state *state = NULL;
  napi_value result;
  napi_status status;
  token = (deckent_native_result_token *)calloc(1u, sizeof(*token));
  if (token == NULL) {
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "custody result token allocation failed"
    );
  }
  if (napi_get_instance_data(env, (void **)&state) == napi_ok
      && state != NULL
      && state->backend_invocation_active
      && state->active_input_attested) {
    token->input_slot_index = state->active_input_slot_index;
    token->input_generation = state->active_input_generation;
    token->input_kind = state->active_input_kind;
    token->input_rights = state->active_input_rights;
    token->input_states = state->active_input_states;
    token->input_attested = true;
  }
  status = napi_create_object(env, &result);
  if (status == napi_ok) {
    status = napi_type_tag_object(env, result, &DECKENT_CUSTODY_RESULT_TAG);
  }
  if (status == napi_ok) {
    status = napi_wrap(env, result, token, native_result_finalize, NULL, NULL);
  }
  if (status != napi_ok) {
    free(token);
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "custody result record could not be created"
    );
  }
  return result;
}

bool deckent_native_finalize_result_record(
  napi_env env,
  napi_value result,
  deckent_custody_operation operation
) {
  napi_valuetype type;
  bool tagged = false;
  deckent_native_result_token *token = NULL;
  deckent_native_state *state = NULL;
  deckent_common_open_result_state open_state;
  if (napi_typeof(env, result, &type) != napi_ok || type != napi_object) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "custody result record must be an object"
    );
    return false;
  }
  if (napi_check_object_type_tag(
        env,
        result,
        &DECKENT_CUSTODY_RESULT_TAG,
        &tagged
      ) != napi_ok
      || !tagged
      || napi_unwrap(env, result, (void **)&token) != napi_ok
      || token == NULL
      || token->finalized
      || token->consumed
      || operation < DECKENT_CUSTODY_OPERATION_PROBE
      || operation > DECKENT_CUSTODY_OPERATION_SCAN_DIRECTORY_BOUNDED
      || operation == DECKENT_CUSTODY_OPERATION_BEGIN_PUBLICATION) {
    if (!reject_created_result_guard(env, token)) return false;
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "custody result record provenance is invalid"
    );
    return false;
  }
  if (token->created_guard_armed
      && token->created_guard_operation != operation) {
    if (!reject_created_result_guard(env, token)) return false;
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "custody created-result operation provenance is invalid"
    );
    return false;
  }
  if (operation == DECKENT_CUSTODY_OPERATION_OPEN_ROOT
      || operation == DECKENT_CUSTODY_OPERATION_OPEN_DIRECTORY_AT
      || operation == DECKENT_CUSTODY_OPERATION_OPEN_FILE_AT) {
    if (!get_native_state(env, &state)) {
      if (!reject_created_result_guard(env, token)) return false;
      return false;
    }
    open_state = inspect_open_result_state(env, state, result);
    if (open_state == DECKENT_COMMON_OPEN_RESULT_INVALID
        || (operation == DECKENT_CUSTODY_OPERATION_OPEN_FILE_AT
          && open_state != DECKENT_COMMON_OPEN_RESULT_OPENED)
        || (open_state == DECKENT_COMMON_OPEN_RESULT_OPENED
          && token->created_guard_armed)) {
      if (!reject_created_result_guard(env, token)) return false;
      deckent_native_throw(
        env,
        "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
        "custody open-result lifecycle provenance is invalid"
      );
      return false;
    }
    if (open_state == DECKENT_COMMON_OPEN_RESULT_CREATED
        && !token->created_guard_armed) {
      token->consumed = true;
      deckent_native_throw(
        env,
        DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
        "custody created result has no rollback authority"
      );
      return false;
    }
  } else if (token->created_guard_armed) {
    if (!reject_created_result_guard(env, token)) return false;
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "custody created-result operation cannot carry a rollback guard"
    );
    return false;
  }
  if (napi_object_freeze(env, result) != napi_ok) {
    if (!reject_created_result_guard(env, token)) return false;
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "custody result record could not be frozen"
    );
    return false;
  }
  token->operation = operation;
  token->finalized = true;
  return true;
}

static bool consume_finalized_result_record(
  napi_env env,
  napi_value result,
  deckent_custody_operation operation,
  napi_value input_snapshot,
  napi_value *accepted_result
) {
  bool tagged = false;
  deckent_native_result_token *token = NULL;
  deckent_native_state *state = NULL;
  bool valid = napi_check_object_type_tag(
      env,
      result,
      &DECKENT_CUSTODY_RESULT_TAG,
      &tagged
    ) == napi_ok
    && tagged
    && napi_unwrap(env, result, (void **)&token) == napi_ok
    && token != NULL
    && token->finalized
    && !token->consumed
    && token->operation == operation;
  if (!valid) {
    if (!reject_created_result_guard(env, token)) return false;
    return false;
  }
  if (!get_native_state(env, &state)) return false;
  if (operation == DECKENT_CUSTODY_OPERATION_SEAL_PUBLICATION) {
    return resolve_seal_result_transfer(
      env,
      state,
      token,
      result,
      input_snapshot,
      accepted_result
    );
  }
  if (operation == DECKENT_CUSTODY_OPERATION_ABORT_PUBLICATION) {
    return resolve_abort_result_transfer(
      env,
      state,
      token,
      result,
      input_snapshot,
      accepted_result
    );
  }
  if (token->input_attested
      && operation != DECKENT_CUSTODY_OPERATION_SEAL_PUBLICATION
      && operation != DECKENT_CUSTODY_OPERATION_ABORT_PUBLICATION) {
    deckent_native_handle_slot *input_slot;
    if (token->input_slot_index >= state->slot_capacity) {
      deckent_native_throw(
        env,
        "E_EXEC_AUTH_NATIVE_HANDLE_STALE",
        "custody result input attestation is stale"
      );
      return false;
    }
    input_slot = &state->slots[token->input_slot_index];
    if (!input_slot->active
        || input_slot->generation != token->input_generation
        || input_slot->kind != token->input_kind
        || input_slot->rights != token->input_rights
        || (input_slot->state & token->input_states) == 0u) {
      deckent_native_throw(
        env,
        "E_EXEC_AUTH_NATIVE_HANDLE_STALE",
        "custody result input attestation no longer resolves"
      );
      return false;
    }
  }
  if (token->created_guard_armed) {
    deckent_common_created_guard_outcome outcome;
    napi_value created_handle;
    if (token->created_guard_operation != operation) {
      if (!reject_created_result_guard(env, token)) return false;
      deckent_native_throw(
        env,
        "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
        "custody created-result dispatch provenance is invalid"
      );
      return false;
    }
    if (token->created_guard_owner == NULL
        || token->created_handle_ref == NULL
        || napi_get_reference_value(
          env,
          token->created_handle_ref,
          &created_handle
        ) != napi_ok
        || created_handle == NULL
        || !created_result_shape_is_exact(
          env,
          token->created_guard_owner,
          result,
          created_handle
        )) {
      if (!reject_created_result_guard(env, token)) return false;
      deckent_native_throw(
        env,
        "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
        "custody created-result acceptance shape is invalid"
      );
      return false;
    }
    outcome = resolve_created_result_guard(env, token, true);
    if (outcome == DECKENT_COMMON_CREATED_GUARD_ACCEPTED) {
      token->consumed = true;
      *accepted_result = result;
      return true;
    }
    token->consumed = true;
    if (outcome == DECKENT_COMMON_CREATED_GUARD_ROLLED_BACK) {
      deckent_native_throw(
        env,
        "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
        "custody created result was rolled back during acceptance"
      );
    } else {
      deckent_native_throw(
        env,
        DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
        "custody created-result acceptance was not confirmed"
      );
    }
    return false;
  }
  token->consumed = true;
  *accepted_result = result;
  return valid;
}

static bool reject_created_result_guard_if_present(
  napi_env env,
  napi_value result,
  bool *guard_was_present
) {
  napi_valuetype type;
  bool tagged = false;
  deckent_native_result_token *token = NULL;
  *guard_was_present = false;
  if (result == NULL
      || napi_typeof(env, result, &type) != napi_ok
      || type != napi_object
      || napi_check_object_type_tag(
           env,
           result,
           &DECKENT_CUSTODY_RESULT_TAG,
           &tagged
         ) != napi_ok
      || !tagged
      || napi_unwrap(env, result, (void **)&token) != napi_ok
      || token == NULL
      || !token->created_guard_armed) {
    return true;
  }
  *guard_was_present = true;
  return reject_created_result_guard(env, token);
}

static bool get_native_state(napi_env env, deckent_native_state **state) {
  void *value = NULL;
  if (napi_get_instance_data(env, &value) != napi_ok || value == NULL) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_STATE",
      "execution authority native environment state is unavailable"
    );
    return false;
  }
  *state = (deckent_native_state *)value;
  return true;
}

static int close_platform_fd(int32_t fd) {
#if !defined(_WIN32)
  return close(fd);
#else
  (void)fd;
  return -1;
#endif
}

static void maybe_free_native_state(deckent_native_state *state) {
  if (state == NULL
      || !state->instance_finalized
      || state->token_count != 0u
      || state->input_token_count != 0u
      || state->effect.token_count != 0u
      || state->effect.input_token_count != 0u
      || state->effect.result_token_count != 0u
      || state->created_result_guards != NULL) {
    return;
  }
  free(state->slots);
  free(state->legacy_slots);
  free(state->effect.slots);
  state->slots = NULL;
  state->legacy_slots = NULL;
  state->effect.slots = NULL;
  free(state);
}

static deckent_native_retire_result retire_effect_slot(
  deckent_effect_handle_slot *slot,
  deckent_effect_handle_token *token
) {
  deckent_native_resource_close close_resource;
  uintptr_t resource;
  int close_result;
  if (slot == NULL || token == NULL || token->closed || !slot->active
      || slot->generation != token->generation || slot->kind != token->kind
      || slot->rights != token->rights || slot->borrow_count != 0u) {
    return DECKENT_NATIVE_RETIRE_REJECTED;
  }
  close_resource = slot->close_resource;
  resource = slot->resource;
  slot->active = false;
  slot->resource = (uintptr_t)0;
  slot->close_resource = NULL;
  slot->rights = DECKENT_EFFECT_RIGHT_NONE;
  token->closed = true;
  if (slot->generation == UINT64_MAX) slot->retired = true;
  else slot->generation += 1u;
  close_result = close_resource == NULL ? -1 : close_resource(resource);
  return close_result == 0
    ? DECKENT_NATIVE_RETIRE_CONFIRMED
    : DECKENT_NATIVE_RETIRE_CLEANUP_UNCONFIRMED;
}

static void effect_handle_finalize(napi_env env, void *data, void *hint) {
  deckent_effect_handle_token *token = (deckent_effect_handle_token *)data;
  deckent_native_state *state;
  (void)env;
  (void)hint;
  if (token == NULL) return;
  state = token->owner;
  if (state != NULL && !token->closed
      && token->slot_index < state->effect.slot_capacity) {
    deckent_effect_handle_slot *slot = &state->effect.slots[token->slot_index];
    if (slot->active && slot->borrow_count == 0u) {
      (void)retire_effect_slot(slot, token);
    }
  }
  if (state != NULL && state->effect.token_count > 0u) {
    state->effect.token_count -= 1u;
  }
  free(token);
  maybe_free_native_state(state);
}

static void effect_input_finalize(napi_env env, void *data, void *hint) {
  deckent_effect_input_token *token = (deckent_effect_input_token *)data;
  deckent_native_state *state;
  (void)env;
  (void)hint;
  if (token == NULL) return;
  state = token->owner;
  if (state == NULL || state->effect.input_token_count == 0u) {
    napi_fatal_error(
      "deckent.execution-effect",
      NAPI_AUTO_LENGTH,
      "effect input token lifecycle is corrupt",
      NAPI_AUTO_LENGTH
    );
  }
  state->effect.input_token_count -= 1u;
  free(token);
  maybe_free_native_state(state);
}

static void effect_result_finalize(napi_env env, void *data, void *hint) {
  deckent_effect_result_token *token = (deckent_effect_result_token *)data;
  deckent_native_state *state;
  (void)env;
  (void)hint;
  if (token == NULL) return;
  state = token->owner;
  if (state != NULL && state->effect.result_token_count > 0u) {
    state->effect.result_token_count -= 1u;
  }
  free(token);
  maybe_free_native_state(state);
}

static void native_input_finalize(napi_env env, void *data, void *hint) {
  deckent_native_input_token *token = (deckent_native_input_token *)data;
  deckent_native_state *state;
  (void)env;
  (void)hint;
  if (token == NULL) return;
  state = token->owner;
  if (state == NULL || state->input_token_count == 0u) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "custody input token lifecycle is corrupt",
      NAPI_AUTO_LENGTH
    );
  }
  state->input_token_count -= 1u;
  free(token);
  maybe_free_native_state(state);
}

static deckent_native_retire_result retire_native_slot(
  deckent_native_handle_slot *slot,
  deckent_native_handle_token *token
) {
  deckent_native_resource_close close_resource;
  uintptr_t resource;
  int close_result;
  if (slot == NULL
      || token == NULL
      || !slot->active
      || token->closed
      || slot->borrow_count != 0u) {
    return DECKENT_NATIVE_RETIRE_REJECTED;
  }
  close_resource = slot->close_resource;
  resource = slot->resource;

  /*
   * Terminalize before an OS close whose error may have ambiguous semantics.
   * The old token is never retry authority. Publication backends must prepare
   * an owned READ_FILE+identity PUBLISHED_UNCONFIRMED reconciliation record
   * before this point when cleanup can follow a confirmed namespace effect.
   */
  slot->active = false;
  slot->resource = (uintptr_t)0;
  slot->close_resource = NULL;
  slot->rights = DECKENT_NATIVE_RIGHT_NONE;
  slot->state = 0u;
  token->closed = true;
  if (slot->generation == UINT64_MAX) slot->retired = true;
  else slot->generation += 1u;

  close_result = close_resource == NULL ? -1 : close_resource(resource);
  return close_result == 0
    ? DECKENT_NATIVE_RETIRE_CONFIRMED
    : DECKENT_NATIVE_RETIRE_CLEANUP_UNCONFIRMED;
}

static void unlink_created_result_guard_or_fatal(
  deckent_native_result_token *token
) {
  deckent_native_state *state;
  if (token == NULL || !token->created_guard_armed) return;
  state = token->created_guard_owner;
  if (state == NULL
      || (token->created_guard_previous == NULL
        && state->created_result_guards != token)
      || (token->created_guard_previous != NULL
        && token->created_guard_previous->created_guard_next != token)
      || (token->created_guard_next != NULL
        && token->created_guard_next->created_guard_previous != token)) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "created-result guard registry is corrupt",
      NAPI_AUTO_LENGTH
    );
  }
  if (token->created_guard_previous == NULL) {
    state->created_result_guards = token->created_guard_next;
  } else {
    token->created_guard_previous->created_guard_next = token->created_guard_next;
  }
  if (token->created_guard_next != NULL) {
    token->created_guard_next->created_guard_previous =
      token->created_guard_previous;
  }
  token->created_guard_previous = NULL;
  token->created_guard_next = NULL;
}

static bool bound_created_handle_is_live(
  deckent_native_state *state,
  deckent_native_handle_token *handle_token
) {
  deckent_native_handle_slot *slot;
  if (state == NULL
      || handle_token == NULL
      || handle_token->owner != state
      || handle_token->closed
      || !handle_token->created_result_guard_bound
      || handle_token->slot_index >= state->slot_capacity) {
    return false;
  }
  slot = &state->slots[handle_token->slot_index];
  return slot->active
    && !slot->retired
    && slot->generation == handle_token->generation
    && slot->kind == handle_token->kind
    && slot->rights == handle_token->rights
    && slot->state == DECKENT_NATIVE_HANDLE_STATE_OPEN
    && handle_token->state == DECKENT_NATIVE_HANDLE_STATE_OPEN
    && slot->borrow_count == 0u;
}

static deckent_native_retire_result retire_bound_created_handle(
  deckent_native_state *state,
  deckent_native_handle_token *handle_token
) {
  deckent_native_handle_slot *slot;
  if (!bound_created_handle_is_live(state, handle_token)) {
    return DECKENT_NATIVE_RETIRE_REJECTED;
  }
  slot = &state->slots[handle_token->slot_index];
  handle_token->created_result_guard_bound = false;
  return retire_native_slot(slot, handle_token);
}

static deckent_common_created_guard_outcome resolve_created_result_guard(
  napi_env env,
  deckent_native_result_token *token,
  bool accept
) {
  deckent_native_state *state;
  deckent_native_handle_token *handle_token;
  deckent_native_created_guard_resolve resolver;
  deckent_native_created_guard_result platform_result;
  deckent_native_retire_result handle_cleanup = DECKENT_NATIVE_RETIRE_REJECTED;
  uintptr_t guard;
  napi_ref handle_ref;
  bool accept_request;
  bool handle_live_after_resolver;
  if (token == NULL || !token->created_guard_armed) {
    return DECKENT_COMMON_CREATED_GUARD_NONE;
  }
  state = token->created_guard_owner;
  handle_token = token->created_handle_token;
  resolver = token->resolve_created_guard;
  guard = token->created_guard;
  handle_ref = token->created_handle_ref;
  accept_request = accept && bound_created_handle_is_live(state, handle_token);

  unlink_created_result_guard_or_fatal(token);
  token->created_guard_armed = false;
  token->created_guard_owner = NULL;
  token->created_handle_ref = NULL;
  token->created_handle_token = NULL;
  token->created_guard = (uintptr_t)0;
  token->resolve_created_guard = NULL;

  platform_result = resolver == NULL || guard == (uintptr_t)0
    ? DECKENT_NATIVE_CREATED_GUARD_UNCONFIRMED
    : resolver(guard, accept_request);
  handle_live_after_resolver = bound_created_handle_is_live(state, handle_token);
  if (accept_request
      && platform_result == DECKENT_NATIVE_CREATED_GUARD_ACCEPTED
      && handle_live_after_resolver) {
    handle_token->created_result_guard_bound = false;
    handle_cleanup = DECKENT_NATIVE_RETIRE_CONFIRMED;
  } else if (handle_live_after_resolver) {
    handle_cleanup = retire_bound_created_handle(state, handle_token);
    if (handle_cleanup == DECKENT_NATIVE_RETIRE_REJECTED) {
      handle_token->created_result_guard_bound = false;
    }
  } else if (handle_token != NULL && handle_token->closed) {
    handle_cleanup = DECKENT_NATIVE_RETIRE_CONFIRMED;
  }
  if (handle_token != NULL) handle_token->created_result_guard_bound = false;

  if (handle_ref == NULL || napi_delete_reference(env, handle_ref) != napi_ok) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "created-result handle reference could not be released",
      NAPI_AUTO_LENGTH
    );
  }

  if (accept_request
      && platform_result == DECKENT_NATIVE_CREATED_GUARD_ACCEPTED
      && handle_cleanup == DECKENT_NATIVE_RETIRE_CONFIRMED) {
    return DECKENT_COMMON_CREATED_GUARD_ACCEPTED;
  }
  if (platform_result == DECKENT_NATIVE_CREATED_GUARD_ROLLED_BACK
      && handle_cleanup == DECKENT_NATIVE_RETIRE_CONFIRMED) {
    return DECKENT_COMMON_CREATED_GUARD_ROLLED_BACK;
  }
  return DECKENT_COMMON_CREATED_GUARD_UNCONFIRMED;
}

static bool reject_created_result_guard(
  napi_env env,
  deckent_native_result_token *token
) {
  deckent_common_created_guard_outcome outcome;
  if (token == NULL || !token->created_guard_armed) return true;
  outcome = resolve_created_result_guard(env, token, false);
  token->consumed = true;
  if (outcome == DECKENT_COMMON_CREATED_GUARD_ROLLED_BACK) return true;
  deckent_native_throw(
    env,
    DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
    "custody created-result rollback was not confirmed"
  );
  return false;
}

static bool reject_all_created_result_guards(
  napi_env env,
  deckent_native_state *state
) {
  bool all_confirmed = true;
  if (state == NULL || state->env != env) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_STATE",
      "created-result guard registry state is unavailable"
    );
    return false;
  }
  while (state->created_result_guards != NULL) {
    deckent_native_result_token *token = state->created_result_guards;
    if (!token->created_guard_armed || token->created_guard_owner != state) {
      napi_fatal_error(
        "deckent.exec-authority",
        NAPI_AUTO_LENGTH,
        "created-result guard registry entry is corrupt",
        NAPI_AUTO_LENGTH
      );
    }
    deckent_common_created_guard_outcome outcome =
      resolve_created_result_guard(env, token, false);
    token->consumed = true;
    if (outcome != DECKENT_COMMON_CREATED_GUARD_ROLLED_BACK) {
      all_confirmed = false;
    }
  }
  if (all_confirmed) return true;
  deckent_native_throw(
    env,
    DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
    "one or more custody created-result rollbacks were not confirmed"
  );
  return false;
}

static bool returned_result_owns_only_created_guard(
  napi_env env,
  deckent_native_state *state,
  napi_value result
) {
  napi_valuetype type;
  bool tagged = false;
  deckent_native_result_token *token = NULL;
  if (state == NULL || state->created_result_guards == NULL) return true;
  return result != NULL
    && napi_typeof(env, result, &type) == napi_ok
    && type == napi_object
    && napi_check_object_type_tag(
      env,
      result,
      &DECKENT_CUSTODY_RESULT_TAG,
      &tagged
    ) == napi_ok
    && tagged
    && napi_unwrap(env, result, (void **)&token) == napi_ok
    && token != NULL
    && token == state->created_result_guards
    && token->created_guard_owner == state
    && token->created_guard_previous == NULL
    && token->created_guard_next == NULL
    && token->created_guard_armed;
}

static void reject_created_result_guard_or_fatal(
  napi_env env,
  deckent_native_result_token *token,
  const char *message
) {
  deckent_common_created_guard_outcome outcome;
  if (token == NULL || !token->created_guard_armed) return;
  outcome = resolve_created_result_guard(env, token, false);
  token->consumed = true;
  if (outcome == DECKENT_COMMON_CREATED_GUARD_ROLLED_BACK) return;
  napi_fatal_error(
    "deckent.exec-authority",
    NAPI_AUTO_LENGTH,
    message,
    NAPI_AUTO_LENGTH
  );
}

static deckent_native_retire_result retire_created_slot_or_fatal(
  deckent_native_handle_slot *slot,
  deckent_native_handle_token *token
) {
  deckent_native_retire_result result = retire_native_slot(slot, token);
  if (result == DECKENT_NATIVE_RETIRE_REJECTED) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "new native handle resource could not be terminalized",
      NAPI_AUTO_LENGTH
    );
  }
  return result;
}

static void native_handle_finalize(napi_env env, void *data, void *hint) {
  deckent_native_handle_token *token = (deckent_native_handle_token *)data;
  deckent_native_state *state;
  deckent_native_handle_slot *slot;
  (void)env;
  (void)hint;
  if (token == NULL) return;
  state = token->owner;
  if (state != NULL
      && !token->closed
      && token->slot_index < state->slot_capacity) {
    slot = &state->slots[token->slot_index];
    if (slot->active
        && slot->generation == token->generation
        && slot->kind == token->kind
        && slot->borrow_count == 0u) {
      /* Finalization is safety cleanup, never durable success evidence. */
      (void)retire_native_slot(slot, token);
    }
  }
  if (state != NULL && state->token_count > 0u) state->token_count -= 1u;
  free(token);
  maybe_free_native_state(state);
}

static void native_state_finalize(napi_env env, void *data, void *hint) {
  deckent_native_state *state = (deckent_native_state *)data;
  uint32_t index;
  (void)env;
  (void)hint;
  if (state == NULL) return;
  if (active_result_transfer_is_armed(state)) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "environment finalized with an unsettled result transfer",
      NAPI_AUTO_LENGTH
    );
  }
  while (state->created_result_guards != NULL) {
    if (!state->created_result_guards->created_guard_armed
        || state->created_result_guards->created_guard_owner != state) {
      napi_fatal_error(
        "deckent.exec-authority",
        NAPI_AUTO_LENGTH,
        "environment-finalized created-result guard registry is corrupt",
        NAPI_AUTO_LENGTH
      );
    }
    reject_created_result_guard_or_fatal(
      env,
      state->created_result_guards,
      "environment-finalized created result rollback was not confirmed"
    );
  }
  state->instance_finalized = true;
  for (index = 0u; index < state->slot_capacity; index += 1u) {
    deckent_native_handle_slot *slot = &state->slots[index];
    if (slot->active) {
      deckent_native_resource_close close_resource = slot->close_resource;
      uintptr_t resource = slot->resource;
      slot->active = false;
      slot->resource = (uintptr_t)0;
      slot->close_resource = NULL;
      slot->rights = DECKENT_NATIVE_RIGHT_NONE;
      slot->state = 0u;
      slot->borrow_count = 0u;
      if (slot->generation == UINT64_MAX) slot->retired = true;
      else slot->generation += 1u;
      if (close_resource != NULL) (void)close_resource(resource);
    }
  }
  for (index = 0u; index < state->effect.slot_capacity; index += 1u) {
    deckent_effect_handle_slot *slot = &state->effect.slots[index];
    if (slot->active) {
      deckent_native_resource_close close_resource = slot->close_resource;
      uintptr_t resource = slot->resource;
      slot->active = false;
      slot->resource = (uintptr_t)0;
      slot->close_resource = NULL;
      slot->rights = DECKENT_EFFECT_RIGHT_NONE;
      slot->borrow_count = 0u;
      if (slot->generation == UINT64_MAX) slot->retired = true;
      else slot->generation += 1u;
      if (close_resource != NULL) (void)close_resource(resource);
    }
  }
  for (index = 0u; index < state->legacy_slot_count; index += 1u) {
    deckent_legacy_fd_slot *legacy = &state->legacy_slots[index];
    if (legacy->active) {
      int32_t fd = legacy->fd;
      legacy->active = false;
      legacy->fd = -1;
      (void)close_platform_fd(fd);
    }
  }
  maybe_free_native_state(state);
}

static bool grow_native_slots(napi_env env, deckent_native_state *state) {
  uint32_t old_capacity = state->slot_capacity;
  uint32_t next_capacity;
  deckent_native_handle_slot *next;
  if (old_capacity >= DECKENT_MAX_HANDLE_CAPACITY) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_LIMIT",
      "execution authority native handle capacity is exhausted"
    );
    return false;
  }
  next_capacity = old_capacity == 0u
    ? DECKENT_INITIAL_HANDLE_CAPACITY
    : old_capacity * 2u;
  if (next_capacity > DECKENT_MAX_HANDLE_CAPACITY) {
    next_capacity = DECKENT_MAX_HANDLE_CAPACITY;
  }
  next = (deckent_native_handle_slot *)realloc(
    state->slots,
    (size_t)next_capacity * sizeof(*next)
  );
  if (next == NULL) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "execution authority native handle allocation failed"
    );
    return false;
  }
  memset(
    next + old_capacity,
    0,
    (size_t)(next_capacity - old_capacity) * sizeof(*next)
  );
  state->slots = next;
  state->slot_capacity = next_capacity;
  return true;
}

static bool reserve_native_slot(
  napi_env env,
  deckent_native_state *state,
  uint32_t *slot_index
) {
  uint32_t index;
  for (;;) {
    for (index = 0u; index < state->slot_capacity; index += 1u) {
      deckent_native_handle_slot *slot = &state->slots[index];
      if (!slot->active && !slot->retired) {
        if (slot->generation == 0u) slot->generation = 1u;
        *slot_index = index;
        return true;
      }
    }
    if (!grow_native_slots(env, state)) return false;
  }
}

static bool has_exact_rights_for_kind(
  deckent_native_handle_kind kind,
  uint32_t rights
) {
  uint32_t expected;
  switch (kind) {
    case DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY:
    case DECKENT_NATIVE_HANDLE_DIRECTORY:
      expected = DECKENT_NATIVE_RIGHT_TRAVERSE
        | DECKENT_NATIVE_RIGHT_IDENTITY
        | DECKENT_NATIVE_RIGHT_APPLY_PRIVATE
        | DECKENT_NATIVE_RIGHT_SYNC
        | DECKENT_NATIVE_RIGHT_PUBLISH;
      break;
    case DECKENT_NATIVE_HANDLE_READ_FILE:
      expected = DECKENT_NATIVE_RIGHT_READ
        | DECKENT_NATIVE_RIGHT_IDENTITY;
      break;
    case DECKENT_NATIVE_HANDLE_PUBLICATION:
      expected = DECKENT_NATIVE_RIGHT_APPEND
        | DECKENT_NATIVE_RIGHT_IDENTITY
        | DECKENT_NATIVE_RIGHT_APPLY_PRIVATE
        | DECKENT_NATIVE_RIGHT_SYNC
        | DECKENT_NATIVE_RIGHT_PUBLISH
        | DECKENT_NATIVE_RIGHT_ABORT;
      break;
    default:
      return false;
  }
  return rights == expected;
}

static napi_value close_consumed_resource_after_failure(
  napi_env env,
  uintptr_t resource,
  deckent_native_resource_close close_resource,
  const char *fallback_code,
  const char *fallback_message,
  bool preserve_pending
) {
  bool pending = false;
  if (close_resource(resource) != 0) {
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED",
      "consumed native resource cleanup could not be confirmed"
    );
  }
  if (preserve_pending
      && napi_is_exception_pending(env, &pending) == napi_ok
      && pending) return NULL;
  return deckent_native_throw(env, fallback_code, fallback_message);
}

napi_value deckent_native_create_handle(
  napi_env env,
  deckent_native_state *state,
  deckent_native_handle_kind kind,
  uint32_t rights,
  uintptr_t resource,
  deckent_native_resource_close close_resource
) {
  uint32_t slot_index;
  deckent_native_handle_slot *slot;
  deckent_native_handle_token *token;
  napi_value handle;
  napi_status status;
  if (close_resource == NULL) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "native resource ownership has no close authority",
      NAPI_AUTO_LENGTH
    );
  }
  if (state == NULL
      || state->env != env
      || state->instance_finalized
      || !has_exact_rights_for_kind(kind, rights)) {
    return close_consumed_resource_after_failure(
      env,
      resource,
      close_resource,
      "E_EXEC_AUTH_NATIVE_HANDLE_CONTRACT",
      "execution authority native handle contract is invalid",
      false
    );
  }
  if (state->token_count == UINT32_MAX) {
    return close_consumed_resource_after_failure(
      env,
      resource,
      close_resource,
      "E_EXEC_AUTH_NATIVE_HANDLE_LIMIT",
      "execution authority native handle token capacity is exhausted",
      false
    );
  }
  if (!reserve_native_slot(env, state, &slot_index)) {
    return close_consumed_resource_after_failure(
      env,
      resource,
      close_resource,
      "E_EXEC_AUTH_NATIVE_HANDLE_LIMIT",
      "execution authority native handle capacity is exhausted",
      true
    );
  }
  slot = &state->slots[slot_index];
  slot->resource = resource;
  slot->close_resource = close_resource;
  slot->kind = kind;
  slot->rights = rights;
  slot->state = DECKENT_NATIVE_HANDLE_STATE_OPEN;
  slot->borrow_count = 0u;
  slot->active = true;

  token = (deckent_native_handle_token *)calloc(1u, sizeof(*token));
  if (token == NULL) {
    deckent_native_handle_token temporary;
    memset(&temporary, 0, sizeof(temporary));
    temporary.owner = state;
    temporary.slot_index = slot_index;
    temporary.generation = slot->generation;
    temporary.kind = kind;
    temporary.rights = rights;
    temporary.state = DECKENT_NATIVE_HANDLE_STATE_OPEN;
    deckent_native_retire_result retired = retire_created_slot_or_fatal(
      slot,
      &temporary
    );
    return deckent_native_throw(
      env,
      retired == DECKENT_NATIVE_RETIRE_CLEANUP_UNCONFIRMED
        ? "E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED"
        : "E_EXEC_AUTH_NATIVE_ALLOCATION",
      retired == DECKENT_NATIVE_RETIRE_CLEANUP_UNCONFIRMED
        ? "execution authority native cleanup could not be confirmed"
        : "execution authority native handle allocation failed"
    );
  }
  token->owner = state;
  token->slot_index = slot_index;
  token->generation = slot->generation;
  token->kind = kind;
  token->rights = rights;
  token->state = DECKENT_NATIVE_HANDLE_STATE_OPEN;

  status = napi_create_object(env, &handle);
  if (status == napi_ok) {
    status = napi_type_tag_object(env, handle, &DECKENT_CUSTODY_HANDLE_TAG);
  }
  if (status == napi_ok) {
    status = napi_wrap(
      env,
      handle,
      token,
      native_handle_finalize,
      NULL,
      NULL
    );
  }
  if (status != napi_ok) {
    deckent_native_retire_result retired = retire_created_slot_or_fatal(
      slot,
      token
    );
    free(token);
    return deckent_native_throw(
      env,
      retired == DECKENT_NATIVE_RETIRE_CLEANUP_UNCONFIRMED
        ? "E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED"
        : "E_EXEC_AUTH_NATIVE_HANDLE_CREATE",
      retired == DECKENT_NATIVE_RETIRE_CLEANUP_UNCONFIRMED
        ? "execution authority native cleanup could not be confirmed"
        : "execution authority opaque handle creation failed"
    );
  }
  state->token_count += 1u;
  if (napi_object_freeze(env, handle) != napi_ok) {
    deckent_native_retire_result retired = retire_created_slot_or_fatal(
      slot,
      token
    );
    return deckent_native_throw(
      env,
      retired == DECKENT_NATIVE_RETIRE_CLEANUP_UNCONFIRMED
        ? "E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED"
        : "E_EXEC_AUTH_NATIVE_HANDLE_CREATE",
      retired == DECKENT_NATIVE_RETIRE_CLEANUP_UNCONFIRMED
        ? "execution authority native cleanup could not be confirmed"
        : "execution authority opaque handle could not be frozen"
    );
  }
  return handle;
}

static bool resolve_native_handle(
  napi_env env,
  deckent_native_state *state,
  napi_value value,
  deckent_native_handle_kind expected_kind,
  uint32_t required_rights,
  uint32_t accepted_states,
  deckent_native_handle_token **resolved_token,
  deckent_native_handle_slot **resolved_slot
) {
  napi_valuetype value_type;
  bool tagged = false;
  deckent_native_handle_token *token = NULL;
  deckent_native_handle_slot *slot;
  if (state == NULL || state->env != env || state->instance_finalized) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_STATE",
      "execution authority native environment state is unavailable"
    );
    return false;
  }
  if (napi_typeof(env, value, &value_type) != napi_ok
      || value_type != napi_object) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_FORGED",
      "execution authority custody handle must be an opaque native object"
    );
    return false;
  }
  if (napi_check_object_type_tag(
        env,
        value,
        &DECKENT_CUSTODY_HANDLE_TAG,
        &tagged
      ) != napi_ok || !tagged) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_FOREIGN",
      "execution authority custody handle belongs to another authority"
    );
    return false;
  }
  if (napi_unwrap(env, value, (void **)&token) != napi_ok || token == NULL) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_FORGED",
      "execution authority custody handle payload is unavailable"
    );
    return false;
  }
  if (token->owner != state) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_FOREIGN",
      "execution authority custody handle belongs to another environment"
    );
    return false;
  }
  if (token->closed) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_CLOSED",
      "execution authority custody handle is closed"
    );
    return false;
  }
  if (token->slot_index >= state->slot_capacity) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_STALE",
      "execution authority custody handle generation is stale"
    );
    return false;
  }
  slot = &state->slots[token->slot_index];
  if (!slot->active
      || slot->retired
      || slot->generation != token->generation
      || slot->kind != token->kind
      || slot->rights != token->rights
      || slot->state != token->state) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_STALE",
      "execution authority custody handle generation is stale"
    );
    return false;
  }
  if (expected_kind != DECKENT_NATIVE_HANDLE_ANY
      && slot->kind != expected_kind) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_KIND",
      "execution authority custody handle kind is invalid"
    );
    return false;
  }
  if ((slot->rights & required_rights) != required_rights) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_RIGHTS",
      "execution authority custody handle rights are insufficient"
    );
    return false;
  }
  if (accepted_states == 0u || (slot->state & accepted_states) == 0u) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_STATE",
      "execution authority custody handle lifecycle state is invalid"
    );
    return false;
  }
  *resolved_token = token;
  *resolved_slot = slot;
  return true;
}

bool deckent_native_bind_created_result_guard(
  napi_env env,
  deckent_native_state *state,
  napi_value result,
  deckent_custody_operation operation,
  napi_value created_handle,
  uintptr_t guard,
  deckent_native_created_guard_resolve resolve_guard
) {
  napi_valuetype type;
  bool tagged = false;
  deckent_native_result_token *result_token = NULL;
  deckent_native_handle_token *handle_token = NULL;
  deckent_native_handle_slot *slot = NULL;
  deckent_native_handle_kind expected_kind;
  napi_ref handle_ref = NULL;
  if (operation == DECKENT_CUSTODY_OPERATION_OPEN_ROOT) {
    expected_kind = DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY;
  } else if (operation == DECKENT_CUSTODY_OPERATION_OPEN_DIRECTORY_AT) {
    expected_kind = DECKENT_NATIVE_HANDLE_DIRECTORY;
  } else {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "created-result guard operation is invalid"
    );
    return false;
  }
  if (state == NULL
      || state->env != env
      || state->instance_finalized
      || guard == (uintptr_t)0
      || resolve_guard == NULL
      || napi_typeof(env, result, &type) != napi_ok
      || type != napi_object
      || napi_check_object_type_tag(
           env,
           result,
           &DECKENT_CUSTODY_RESULT_TAG,
           &tagged
         ) != napi_ok
      || !tagged
      || napi_unwrap(env, result, (void **)&result_token) != napi_ok
      || result_token == NULL
      || result_token->finalized
      || result_token->consumed
      || result_token->created_guard_armed
      || !created_result_shape_is_exact(
           env,
           state,
           result,
           created_handle
         )) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "created-result guard binding is invalid"
    );
    return false;
  }
  if (!resolve_native_handle(
        env,
        state,
        created_handle,
        expected_kind,
        DECKENT_NATIVE_RIGHT_TRAVERSE,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &handle_token,
        &slot
      )) return false;
  if (slot->borrow_count != 0u || handle_token->created_result_guard_bound) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "created-result handle is not exclusively bindable"
    );
    return false;
  }
  if (napi_create_reference(env, created_handle, 1u, &handle_ref) != napi_ok) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "created-result handle reference could not be retained"
    );
    return false;
  }

  result_token->created_guard_operation = operation;
  result_token->created_guard_owner = state;
  result_token->created_handle_token = handle_token;
  result_token->created_handle_ref = handle_ref;
  result_token->created_guard = guard;
  result_token->resolve_created_guard = resolve_guard;
  result_token->created_guard_previous = NULL;
  result_token->created_guard_next = state->created_result_guards;
  if (state->created_result_guards != NULL) {
    state->created_result_guards->created_guard_previous = result_token;
  }
  state->created_result_guards = result_token;
  result_token->created_guard_armed = true;
  handle_token->created_result_guard_bound = true;
  return true;
}

bool deckent_native_borrow_handle(
  napi_env env,
  deckent_native_state *state,
  napi_value value,
  deckent_native_handle_kind expected_kind,
  uint32_t required_rights,
  uint32_t accepted_states,
  deckent_native_borrow *borrow
) {
  deckent_native_handle_token *token;
  deckent_native_handle_slot *slot;
  if (borrow == NULL || borrow->active
      || state == NULL
      || !state->backend_invocation_active
      || state->active_invocation_id == 0u) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BORROW_CONTRACT",
      "execution authority native borrow contract is invalid"
    );
    return false;
  }
  if (!resolve_native_handle(
        env,
        state,
        value,
        expected_kind,
        required_rights,
        accepted_states,
        &token,
        &slot
      )) return false;
  if (slot->state == DECKENT_NATIVE_HANDLE_STATE_CLEANUP_UNCONFIRMED
      || token->created_result_guard_bound) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_STATE",
      "execution authority custody handle is terminally non-borrowable"
    );
    return false;
  }
  if (slot->borrow_count == UINT32_MAX) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BORROW_LIMIT",
      "execution authority native handle borrow capacity is exhausted"
    );
    return false;
  }
  if (state->outstanding_borrow_count == UINT32_MAX) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BORROW_LIMIT",
      "execution authority invocation borrow capacity is exhausted"
    );
    return false;
  }
  slot->borrow_count += 1u;
  state->outstanding_borrow_count += 1u;
  borrow->owner = state;
  borrow->slot_index = token->slot_index;
  borrow->generation = token->generation;
  borrow->invocation_id = state->active_invocation_id;
  borrow->resource = slot->resource;
  borrow->active = true;
  return true;
}

bool deckent_native_end_borrow(napi_env env, deckent_native_borrow *borrow) {
  deckent_native_handle_slot *slot;
  if (borrow == NULL
      || !borrow->active
      || borrow->owner == NULL
      || !borrow->owner->backend_invocation_active
      || borrow->invocation_id == 0u
      || borrow->invocation_id != borrow->owner->active_invocation_id
      || borrow->slot_index >= borrow->owner->slot_capacity) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BORROW_STALE",
      "execution authority native handle borrow is stale"
    );
    return false;
  }
  slot = &borrow->owner->slots[borrow->slot_index];
  if (!slot->active
      || slot->generation != borrow->generation
      || slot->borrow_count == 0u
      || borrow->owner->outstanding_borrow_count == 0u
      || slot->resource != borrow->resource) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BORROW_STALE",
      "execution authority native handle borrow is stale"
    );
    return false;
  }
  slot->borrow_count -= 1u;
  borrow->owner->outstanding_borrow_count -= 1u;
  borrow->owner = NULL;
  borrow->slot_index = 0u;
  borrow->generation = 0u;
  borrow->invocation_id = 0u;
  borrow->resource = (uintptr_t)0;
  borrow->active = false;
  return true;
}

bool deckent_native_mark_published_unconfirmed(
  napi_env env,
  deckent_native_state *state,
  napi_value value
) {
  deckent_native_handle_token *token;
  deckent_native_handle_slot *slot;
  if (!resolve_native_handle(
        env,
        state,
        value,
        DECKENT_NATIVE_HANDLE_PUBLICATION,
        DECKENT_NATIVE_RIGHT_PUBLISH,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &token,
        &slot
      )) return false;
  slot->state = DECKENT_NATIVE_HANDLE_STATE_PUBLISHED_UNCONFIRMED;
  token->state = DECKENT_NATIVE_HANDLE_STATE_PUBLISHED_UNCONFIRMED;
  return true;
}

bool deckent_native_mark_append_failed(
  napi_env env,
  deckent_native_state *state,
  napi_value value
) {
  deckent_native_handle_token *token;
  deckent_native_handle_slot *slot;
  if (!resolve_native_handle(
        env,
        state,
        value,
        DECKENT_NATIVE_HANDLE_PUBLICATION,
        DECKENT_NATIVE_RIGHT_APPEND | DECKENT_NATIVE_RIGHT_ABORT,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &token,
        &slot
      )) return false;
  slot->state = DECKENT_NATIVE_HANDLE_STATE_APPEND_FAILED;
  token->state = DECKENT_NATIVE_HANDLE_STATE_APPEND_FAILED;
  return true;
}

bool deckent_native_mark_cleanup_unconfirmed(
  napi_env env,
  deckent_native_state *state,
  napi_value value
) {
  deckent_native_handle_token *token;
  deckent_native_handle_slot *slot;
  if (!resolve_native_handle(
        env,
        state,
        value,
        DECKENT_NATIVE_HANDLE_ANY,
        DECKENT_NATIVE_RIGHT_NONE,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &token,
        &slot
      )) return false;
  if (slot->borrow_count == 0u || token->created_result_guard_bound) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BORROW_CONTRACT",
      "cleanup uncertainty requires one live operation borrow"
    );
    return false;
  }
  slot->state = DECKENT_NATIVE_HANDLE_STATE_CLEANUP_UNCONFIRMED;
  token->state = DECKENT_NATIVE_HANDLE_STATE_CLEANUP_UNCONFIRMED;
  return true;
}

static deckent_native_retire_result retire_native_handle_internal(
  napi_env env,
  deckent_native_state *state,
  napi_value value,
  deckent_native_handle_kind expected_kind,
  uint32_t required_rights,
  uint32_t accepted_states,
  bool allow_cleanup_unconfirmed,
  uint32_t *retired_state
) {
  deckent_native_handle_token *token;
  deckent_native_handle_slot *slot;
  uint32_t state_before_retire;
  if (!allow_cleanup_unconfirmed
      && (accepted_states & DECKENT_NATIVE_HANDLE_STATE_CLEANUP_UNCONFIRMED)
        != 0u) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_STATE",
      "backend retirement cannot consume cleanup-unconfirmed authority"
    );
    return DECKENT_NATIVE_RETIRE_REJECTED;
  }
  if (!resolve_native_handle(
        env,
        state,
        value,
        expected_kind,
        required_rights,
        accepted_states,
        &token,
        &slot
      )) return DECKENT_NATIVE_RETIRE_REJECTED;
  if ((!allow_cleanup_unconfirmed
        && slot->state == DECKENT_NATIVE_HANDLE_STATE_CLEANUP_UNCONFIRMED)
      || token->created_result_guard_bound) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_STATE",
      "execution authority custody handle is terminally reserved"
    );
    return DECKENT_NATIVE_RETIRE_REJECTED;
  }
  if (slot->borrow_count != 0u) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_BORROWED",
      "execution authority custody handle is borrowed"
    );
    return DECKENT_NATIVE_RETIRE_REJECTED;
  }
  state_before_retire = slot->state;
  if (retired_state != NULL) *retired_state = state_before_retire;
  return retire_native_slot(slot, token);
}

deckent_native_retire_result deckent_native_retire_handle(
  napi_env env,
  deckent_native_state *state,
  napi_value value,
  deckent_native_handle_kind expected_kind,
  uint32_t required_rights,
  uint32_t accepted_states
) {
  return retire_native_handle_internal(
    env,
    state,
    value,
    expected_kind,
    required_rights,
    accepted_states,
    false,
    NULL
  );
}

static uint32_t exact_effect_rights(deckent_effect_handle_kind kind) {
  switch (kind) {
    case DECKENT_EFFECT_HANDLE_PROJECT_ROOT:
      return DECKENT_EFFECT_RIGHT_SCAN | DECKENT_EFFECT_RIGHT_INSPECT
        | DECKENT_EFFECT_RIGHT_APPLY | DECKENT_EFFECT_RIGHT_RECONCILE
        | DECKENT_EFFECT_RIGHT_VERIFY;
    case DECKENT_EFFECT_HANDLE_WORKSPACE_ROOT:
      return DECKENT_EFFECT_RIGHT_SCAN | DECKENT_EFFECT_RIGHT_INSPECT
        | DECKENT_EFFECT_RIGHT_SOURCE_READ;
    case DECKENT_EFFECT_HANDLE_STAGING_ROOT:
      return DECKENT_EFFECT_RIGHT_STAGE | DECKENT_EFFECT_RIGHT_INSPECT;
    case DECKENT_EFFECT_HANDLE_STAGED_CONTENT:
      return DECKENT_EFFECT_RIGHT_APPEND | DECKENT_EFFECT_RIGHT_SEAL
        | DECKENT_EFFECT_RIGHT_INSPECT;
    case DECKENT_EFFECT_HANDLE_SOURCE_READ:
      return DECKENT_EFFECT_RIGHT_SOURCE_READ | DECKENT_EFFECT_RIGHT_SOURCE_FINISH;
    default:
      return DECKENT_EFFECT_RIGHT_NONE;
  }
}

static bool grow_effect_slots(napi_env env, deckent_native_state *state) {
  uint32_t old_capacity = state->effect.slot_capacity;
  uint32_t next_capacity;
  deckent_effect_handle_slot *next;
  if (old_capacity >= DECKENT_MAX_HANDLE_CAPACITY) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_HANDLE_LIMIT",
      "execution-effect handle capacity is exhausted");
    return false;
  }
  next_capacity = old_capacity == 0u
    ? DECKENT_INITIAL_HANDLE_CAPACITY : old_capacity * 2u;
  if (next_capacity > DECKENT_MAX_HANDLE_CAPACITY) {
    next_capacity = DECKENT_MAX_HANDLE_CAPACITY;
  }
  next = (deckent_effect_handle_slot *)realloc(
    state->effect.slots, (size_t)next_capacity * sizeof(*next)
  );
  if (next == NULL) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "execution-effect handle allocation failed");
    return false;
  }
  memset(next + old_capacity, 0,
    (size_t)(next_capacity - old_capacity) * sizeof(*next));
  state->effect.slots = next;
  state->effect.slot_capacity = next_capacity;
  return true;
}

static bool reserve_effect_slot(
  napi_env env,
  deckent_native_state *state,
  uint32_t *slot_index
) {
  uint32_t index;
  for (;;) {
    for (index = 0u; index < state->effect.slot_capacity; index += 1u) {
      deckent_effect_handle_slot *slot = &state->effect.slots[index];
      if (!slot->active && !slot->retired) {
        if (slot->generation == 0u) slot->generation = 1u;
        *slot_index = index;
        return true;
      }
    }
    if (!grow_effect_slots(env, state)) return false;
  }
}

napi_value deckent_effect_create_handle(
  napi_env env,
  deckent_native_state *state,
  deckent_effect_handle_kind kind,
  uint32_t rights,
  uintptr_t resource,
  deckent_native_resource_close close_resource
) {
  uint32_t slot_index;
  deckent_effect_handle_slot *slot;
  deckent_effect_handle_token *token;
  napi_value handle;
  napi_status status;
  if (close_resource == NULL) {
    napi_fatal_error("deckent.execution-effect", NAPI_AUTO_LENGTH,
      "execution-effect resource has no close authority", NAPI_AUTO_LENGTH);
  }
  if (state == NULL || state->env != env || state->instance_finalized
      || rights == 0u || rights != exact_effect_rights(kind)) {
    if (close_resource(resource) != 0) {
      return deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_CLEANUP_UNCONFIRMED",
        "execution-effect rejected handle resource cleanup was not confirmed");
    }
    return deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_HANDLE_CONTRACT",
      "execution-effect handle contract is invalid");
  }
  if (state->effect.token_count == UINT32_MAX
      || !reserve_effect_slot(env, state, &slot_index)) {
    if (close_resource(resource) != 0) {
      return deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_CLEANUP_UNCONFIRMED",
        "execution-effect exhausted handle resource cleanup was not confirmed");
    }
    return deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_HANDLE_LIMIT",
      "execution-effect handle capacity is exhausted");
  }
  slot = &state->effect.slots[slot_index];
  slot->resource = resource;
  slot->close_resource = close_resource;
  slot->kind = kind;
  slot->rights = rights;
  slot->borrow_count = 0u;
  slot->active = true;
  token = (deckent_effect_handle_token *)calloc(1u, sizeof(*token));
  if (token == NULL) {
    deckent_effect_handle_token temporary;
    memset(&temporary, 0, sizeof(temporary));
    temporary.owner = state;
    temporary.slot_index = slot_index;
    temporary.generation = slot->generation;
    temporary.kind = kind;
    temporary.rights = rights;
    if (retire_effect_slot(slot, &temporary) != DECKENT_NATIVE_RETIRE_CONFIRMED) {
      return deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_CLEANUP_UNCONFIRMED",
        "execution-effect allocated handle resource cleanup was not confirmed");
    }
    return deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "execution-effect handle token allocation failed");
  }
  token->owner = state;
  token->slot_index = slot_index;
  token->generation = slot->generation;
  token->kind = kind;
  token->rights = rights;
  status = napi_create_object(env, &handle);
  if (status == napi_ok) {
    status = napi_type_tag_object(env, handle, &DECKENT_EFFECT_HANDLE_TAG);
  }
  if (status == napi_ok) {
    status = napi_object_freeze(env, handle);
  }
  if (status == napi_ok) {
    status = napi_wrap(env, handle, token, effect_handle_finalize, NULL, NULL);
  }
  if (status != napi_ok) {
    deckent_native_retire_result retired = retire_effect_slot(slot, token);
    free(token);
    if (retired != DECKENT_NATIVE_RETIRE_CONFIRMED) {
      return deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_CLEANUP_UNCONFIRMED",
        "execution-effect failed handle resource cleanup was not confirmed");
    }
    return deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_HANDLE_CREATE",
      "execution-effect opaque handle creation failed");
  }
  state->effect.token_count += 1u;
  return handle;
}

static bool resolve_effect_handle(
  napi_env env,
  deckent_native_state *state,
  napi_value value,
  deckent_effect_handle_kind expected_kind,
  uint32_t required_rights,
  deckent_effect_handle_token **token_out,
  deckent_effect_handle_slot **slot_out
) {
  napi_valuetype type;
  bool tagged = false;
  deckent_effect_handle_token *token = NULL;
  deckent_effect_handle_slot *slot;
  if (state == NULL || state->env != env || state->instance_finalized
      || napi_typeof(env, value, &type) != napi_ok || type != napi_object) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_HANDLE_FORGED",
      "execution-effect handle is not an opaque native object");
    return false;
  }
  if (napi_check_object_type_tag(env, value, &DECKENT_EFFECT_HANDLE_TAG,
        &tagged) != napi_ok || !tagged) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_HANDLE_FOREIGN",
      "execution-effect handle belongs to another trust domain");
    return false;
  }
  if (napi_unwrap(env, value, (void **)&token) != napi_ok || token == NULL
      || token->owner != state) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_HANDLE_FORGED",
      "execution-effect handle payload is invalid");
    return false;
  }
  if (token->closed || token->slot_index >= state->effect.slot_capacity) {
    deckent_native_throw(env, token->closed
      ? "E_EXEC_AUTH_NATIVE_HANDLE_CLOSED" : "E_EXEC_AUTH_NATIVE_HANDLE_STALE",
      "execution-effect handle is closed or stale");
    return false;
  }
  slot = &state->effect.slots[token->slot_index];
  if (!slot->active || slot->retired || slot->generation != token->generation
      || slot->kind != token->kind || slot->rights != token->rights) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_HANDLE_STALE",
      "execution-effect handle generation is stale");
    return false;
  }
  if (expected_kind != DECKENT_EFFECT_HANDLE_ANY && slot->kind != expected_kind) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_HANDLE_KIND",
      "execution-effect handle kind is invalid");
    return false;
  }
  if ((slot->rights & required_rights) != required_rights) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_HANDLE_RIGHTS",
      "execution-effect handle rights are insufficient");
    return false;
  }
  *token_out = token;
  *slot_out = slot;
  return true;
}

bool deckent_effect_borrow_handle(
  napi_env env,
  deckent_native_state *state,
  napi_value value,
  deckent_effect_handle_kind expected_kind,
  uint32_t required_rights,
  deckent_effect_borrow *borrow
) {
  deckent_effect_handle_token *token;
  deckent_effect_handle_slot *slot;
  if (borrow == NULL || borrow->active || !state->effect.backend_invocation_active
      || !resolve_effect_handle(env, state, value, expected_kind, required_rights,
        &token, &slot)) return false;
  if (slot->borrow_count == UINT32_MAX
      || state->effect.outstanding_borrow_count == UINT32_MAX) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_BORROW_LIMIT",
      "execution-effect borrow capacity is exhausted");
    return false;
  }
  slot->borrow_count += 1u;
  state->effect.outstanding_borrow_count += 1u;
  borrow->owner = state;
  borrow->slot_index = token->slot_index;
  borrow->generation = token->generation;
  borrow->resource = slot->resource;
  borrow->active = true;
  return true;
}

bool deckent_effect_end_borrow(napi_env env, deckent_effect_borrow *borrow) {
  deckent_effect_handle_slot *slot;
  if (borrow == NULL || !borrow->active || borrow->owner == NULL
      || !borrow->owner->effect.backend_invocation_active
      || borrow->slot_index >= borrow->owner->effect.slot_capacity) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_BORROW_STALE",
      "execution-effect borrow is stale");
    return false;
  }
  slot = &borrow->owner->effect.slots[borrow->slot_index];
  if (!slot->active || slot->generation != borrow->generation
      || slot->borrow_count == 0u
      || borrow->owner->effect.outstanding_borrow_count == 0u
      || slot->resource != borrow->resource) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_BORROW_STALE",
      "execution-effect borrow identity is stale");
    return false;
  }
  slot->borrow_count -= 1u;
  borrow->owner->effect.outstanding_borrow_count -= 1u;
  memset(borrow, 0, sizeof(*borrow));
  return true;
}

deckent_native_retire_result deckent_effect_retire_handle(
  napi_env env,
  deckent_native_state *state,
  napi_value value,
  deckent_effect_handle_kind expected_kind,
  uint32_t required_rights
) {
  deckent_effect_handle_token *token;
  deckent_effect_handle_slot *slot;
  if (!resolve_effect_handle(env, state, value, expected_kind, required_rights,
        &token, &slot)) return DECKENT_NATIVE_RETIRE_REJECTED;
  if (slot->borrow_count != 0u) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_HANDLE_BORROWED",
      "execution-effect handle is borrowed");
    return DECKENT_NATIVE_RETIRE_REJECTED;
  }
  return retire_effect_slot(slot, token);
}

napi_value deckent_effect_create_result_record(napi_env env) {
  deckent_native_state *state;
  deckent_effect_result_token *token;
  napi_value result;
  napi_status status;
  if (!get_native_state(env, &state) || state->effect.result_token_count == UINT32_MAX) {
    return deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_HANDLE_LIMIT",
      "execution-effect result capacity is exhausted");
  }
  token = (deckent_effect_result_token *)calloc(1u, sizeof(*token));
  if (token == NULL) return deckent_native_throw(env,
    "E_EXEC_AUTH_NATIVE_ALLOCATION", "execution-effect result allocation failed");
  token->owner = state;
  status = napi_create_object(env, &result);
  if (status == napi_ok) status = napi_type_tag_object(env, result, &DECKENT_EFFECT_RESULT_TAG);
  if (status == napi_ok) status = napi_wrap(env, result, token,
    effect_result_finalize, NULL, NULL);
  if (status != napi_ok) {
    free(token);
    return deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "execution-effect result provenance could not be installed");
  }
  state->effect.result_token_count += 1u;
  return result;
}

bool deckent_effect_finalize_result_record(
  napi_env env,
  napi_value result,
  deckent_effect_operation operation
) {
  deckent_effect_result_token *token = NULL;
  bool tagged = false;
  if (napi_check_object_type_tag(env, result, &DECKENT_EFFECT_RESULT_TAG,
        &tagged) != napi_ok || !tagged
      || napi_unwrap(env, result, (void **)&token) != napi_ok || token == NULL
      || token->owner == NULL || token->owner->env != env || token->finalized
      || token->consumed || operation < DECKENT_EFFECT_OPERATION_OPEN_ROOT
      || operation > DECKENT_EFFECT_OPERATION_FINISH_SOURCE_READ) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "execution-effect result provenance is invalid");
    return false;
  }
  token->operation = operation;
  token->finalized = true;
  if (napi_object_freeze(env, result) != napi_ok) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "execution-effect result could not be frozen");
    return false;
  }
  return true;
}

typedef enum deckent_common_seal_result_state {
  DECKENT_COMMON_SEAL_RESULT_INVALID = 0,
  DECKENT_COMMON_SEAL_RESULT_CREATED = 1,
  DECKENT_COMMON_SEAL_RESULT_EXISTING_IDENTICAL = 2,
  DECKENT_COMMON_SEAL_RESULT_UNCONFIRMED_RETAINED = 3,
  DECKENT_COMMON_SEAL_RESULT_UNCONFIRMED_REPLACED = 4,
} deckent_common_seal_result_state;

typedef struct deckent_common_seal_result_view {
  deckent_common_seal_result_state state;
  napi_value read_handle;
  napi_value identity;
  napi_value reason_code;
  uint32_t evidence_bits;
} deckent_common_seal_result_view;

static bool native_exact_string(
  napi_env env,
  napi_value value,
  const char *expected
) {
  napi_valuetype type;
  size_t expected_length = strlen(expected);
  size_t length = 0u;
  size_t copied = 0u;
  char text[64];
  return expected_length > 0u
    && expected_length < sizeof(text)
    && napi_typeof(env, value, &type) == napi_ok
    && type == napi_string
    && napi_get_value_string_utf8(env, value, NULL, 0u, &length) == napi_ok
    && length == expected_length
    && napi_get_value_string_utf8(
      env,
      value,
      text,
      sizeof(text),
      &copied
    ) == napi_ok
    && copied == expected_length
    && memcmp(text, expected, expected_length + 1u) == 0;
}

static bool native_exact_uint32(
  napi_env env,
  napi_value value,
  uint32_t *number
) {
  napi_valuetype type;
  double raw;
  if (napi_typeof(env, value, &type) != napi_ok
      || type != napi_number
      || napi_get_value_double(env, value, &raw) != napi_ok
      || !isfinite(raw)
      || raw < 0.0
      || raw > (double)UINT32_MAX
      || floor(raw) != raw) return false;
  *number = (uint32_t)raw;
  return true;
}

static bool native_is_null(napi_env env, napi_value value) {
  napi_valuetype type;
  return napi_typeof(env, value, &type) == napi_ok && type == napi_null;
}

static bool native_is_object(napi_env env, napi_value value) {
  napi_valuetype type;
  return napi_typeof(env, value, &type) == napi_ok && type == napi_object;
}

static bool admitted_publication_reason(napi_env env, napi_value value) {
  static const char *const reasons[] = {
    DECKENT_CUSTODY_REASON_PLATFORM_UNSUPPORTED,
    DECKENT_CUSTODY_REASON_MOUNT_UNSUPPORTED,
    DECKENT_CUSTODY_REASON_PUBLISH_PRIMITIVE_UNAVAILABLE,
    DECKENT_CUSTODY_REASON_NAMESPACE_CONFLICT,
    DECKENT_CUSTODY_REASON_EXISTING_DIFFERENT,
    DECKENT_CUSTODY_REASON_FILE_DURABILITY_UNCONFIRMED,
    DECKENT_CUSTODY_REASON_DIRECTORY_DURABILITY_UNCONFIRMED,
    DECKENT_CUSTODY_REASON_FINAL_IDENTITY_UNCONFIRMED,
    DECKENT_CUSTODY_REASON_CLEANUP_UNCONFIRMED,
    DECKENT_CUSTODY_REASON_IO_UNCONFIRMED,
  };
  size_t index;
  for (index = 0u; index < sizeof(reasons) / sizeof(reasons[0]); index += 1u) {
    if (native_exact_string(env, value, reasons[index])) return true;
  }
  return false;
}

static bool inspect_seal_result(
  napi_env env,
  napi_value result,
  deckent_common_seal_result_view *view
) {
  static const char *const keys[] = {
    "featureEvidenceBits",
    "identity",
    "kind",
    "readHandle",
    "reasonCode",
    "schemaVersion",
    "state",
  };
  napi_value schema_version;
  napi_value kind;
  napi_value lifecycle;
  napi_value evidence;
  uint32_t schema = 0u;
  bool is_success;
  bool is_cleanup_unconfirmed;
  if (view == NULL
      || !native_exact_key_set(env, result, keys, 7u)
      || !deckent_native_get_own_value(
        env, result, "schemaVersion", &schema_version
      )
      || !native_exact_uint32(env, schema_version, &schema)
      || schema != 1u
      || !deckent_native_get_own_value(env, result, "kind", &kind)
      || !native_exact_string(env, kind, "custody-publication")
      || !deckent_native_get_own_value(env, result, "state", &lifecycle)
      || !deckent_native_get_own_value(
        env, result, "readHandle", &view->read_handle
      )
      || !deckent_native_get_own_value(
        env, result, "identity", &view->identity
      )
      || !deckent_native_get_own_value(
        env, result, "reasonCode", &view->reason_code
      )
      || !deckent_native_get_own_value(
        env, result, "featureEvidenceBits", &evidence
      )
      || !native_exact_uint32(env, evidence, &view->evidence_bits)) {
    return false;
  }
  if (native_exact_string(env, lifecycle, "CREATED")) {
    view->state = DECKENT_COMMON_SEAL_RESULT_CREATED;
  } else if (native_exact_string(env, lifecycle, "EXISTING_IDENTICAL")) {
    view->state = DECKENT_COMMON_SEAL_RESULT_EXISTING_IDENTICAL;
  } else if (native_exact_string(env, lifecycle, "PUBLISHED_UNCONFIRMED")) {
    view->state = native_exact_string(
      env,
      view->reason_code,
      DECKENT_CUSTODY_REASON_CLEANUP_UNCONFIRMED
    )
      ? DECKENT_COMMON_SEAL_RESULT_UNCONFIRMED_REPLACED
      : DECKENT_COMMON_SEAL_RESULT_UNCONFIRMED_RETAINED;
  } else {
    return false;
  }
  is_success = view->state == DECKENT_COMMON_SEAL_RESULT_CREATED
    || view->state == DECKENT_COMMON_SEAL_RESULT_EXISTING_IDENTICAL;
  is_cleanup_unconfirmed =
    view->state == DECKENT_COMMON_SEAL_RESULT_UNCONFIRMED_REPLACED;
  if (is_success || is_cleanup_unconfirmed) {
    return native_is_object(env, view->read_handle)
      && native_is_object(env, view->identity)
      && (is_success
        ? native_is_null(env, view->reason_code)
        : native_exact_string(
          env,
          view->reason_code,
          DECKENT_CUSTODY_REASON_CLEANUP_UNCONFIRMED
        ));
  }
  return native_is_null(env, view->read_handle)
    && native_is_null(env, view->identity)
    && admitted_publication_reason(env, view->reason_code)
    && !native_exact_string(
      env,
      view->reason_code,
      DECKENT_CUSTODY_REASON_CLEANUP_UNCONFIRMED
    );
}

static bool get_finalized_result_token(
  napi_env env,
  napi_value result,
  deckent_custody_operation operation,
  deckent_native_result_token **token
) {
  napi_valuetype type;
  bool tagged = false;
  return token != NULL
    && napi_typeof(env, result, &type) == napi_ok
    && type == napi_object
    && napi_check_object_type_tag(
      env,
      result,
      &DECKENT_CUSTODY_RESULT_TAG,
      &tagged
    ) == napi_ok
    && tagged
    && napi_unwrap(env, result, (void **)token) == napi_ok
    && *token != NULL
    && (*token)->finalized
    && !(*token)->consumed
    && (*token)->operation == operation;
}

static bool seal_success_evidence_is_admitted(
  const deckent_native_state *state,
  uint32_t evidence_bits
) {
  const uint32_t durability = DECKENT_NATIVE_EVIDENCE_FILE_DURABILITY
    | DECKENT_NATIVE_EVIDENCE_DIRECTORY_DURABILITY;
  const uint32_t posix_provenance =
    evidence_bits & (DECKENT_NATIVE_EVIDENCE_PUBLISH_AT_EMPTY_PATH
      | DECKENT_NATIVE_EVIDENCE_PUBLISH_PROC_FD_ALIAS);
  if ((evidence_bits & durability) != durability
      || state == NULL
      || state->backend == NULL) return false;
  if (state->backend->platform == DECKENT_NATIVE_PLATFORM_WIN32) {
    return (evidence_bits & (DECKENT_NATIVE_EVIDENCE_ANONYMOUS_NO_REPLACE_PUBLISH
      | DECKENT_NATIVE_EVIDENCE_PUBLISH_AT_EMPTY_PATH
      | DECKENT_NATIVE_EVIDENCE_PUBLISH_PROC_FD_ALIAS)) == 0u;
  }
  if (state->backend->platform != DECKENT_NATIVE_PLATFORM_LINUX
      && state->backend->platform != DECKENT_NATIVE_PLATFORM_DARWIN) return false;
  return (evidence_bits
      & DECKENT_NATIVE_EVIDENCE_ANONYMOUS_NO_REPLACE_PUBLISH) != 0u
    && (posix_provenance == DECKENT_NATIVE_EVIDENCE_PUBLISH_AT_EMPTY_PATH
      || posix_provenance == DECKENT_NATIVE_EVIDENCE_PUBLISH_PROC_FD_ALIAS);
}

static void delete_transfer_reference_or_fatal(
  napi_env env,
  napi_ref *reference,
  const char *message
) {
  napi_ref held;
  if (reference == NULL || *reference == NULL) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      message,
      NAPI_AUTO_LENGTH
    );
  }
  held = *reference;
  *reference = NULL;
  if (napi_delete_reference(env, held) != napi_ok) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      message,
      NAPI_AUTO_LENGTH
    );
  }
}

static bool active_result_transfer_is_armed(
  const deckent_native_state *state
) {
  return state != NULL
    && state->active_transfer.kind != DECKENT_NATIVE_ACTIVE_TRANSFER_NONE;
}

static void clear_active_result_transfer_or_fatal(
  napi_env env,
  deckent_native_state *state
) {
  deckent_native_active_transfer transfer;
  if (!active_result_transfer_is_armed(state)) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "result transfer ledger was cleared without active authority",
      NAPI_AUTO_LENGTH
    );
  }
  transfer = state->active_transfer;
  if (transfer.primary_token == NULL
      || transfer.fallback_token == NULL
      || !transfer.primary_token->active_transfer_primary
      || !transfer.fallback_token->active_transfer_fallback
      || transfer.primary_result_ref == NULL
      || transfer.input_ref == NULL
      || transfer.fallback_result_ref == NULL
      || (transfer.kind == DECKENT_NATIVE_ACTIVE_TRANSFER_SEAL
        && transfer.replacement_ref == NULL)
      || (transfer.kind == DECKENT_NATIVE_ACTIVE_TRANSFER_ABORT
        && transfer.replacement_ref != NULL)) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "result transfer ledger is corrupt",
      NAPI_AUTO_LENGTH
    );
  }
  transfer.primary_token->consumed = true;
  transfer.primary_token->active_transfer_primary = false;
  transfer.fallback_token->consumed = true;
  transfer.fallback_token->active_transfer_fallback = false;
  memset(&state->active_transfer, 0, sizeof(state->active_transfer));
  delete_transfer_reference_or_fatal(
    env,
    &transfer.primary_result_ref,
    "transfer primary result reference could not be released"
  );
  delete_transfer_reference_or_fatal(
    env,
    &transfer.input_ref,
    "transfer input reference could not be released"
  );
  if (transfer.replacement_ref != NULL) {
    delete_transfer_reference_or_fatal(
      env,
      &transfer.replacement_ref,
      "transfer replacement reference could not be released"
    );
  }
  delete_transfer_reference_or_fatal(
    env,
    &transfer.fallback_result_ref,
    "transfer fallback result reference could not be released"
  );
}

static uint32_t seal_result_expected_input_state(
  deckent_common_seal_result_state result_state
) {
  if (result_state == DECKENT_COMMON_SEAL_RESULT_CREATED) {
    return DECKENT_NATIVE_HANDLE_STATE_PUBLISHED_UNCONFIRMED;
  }
  if (result_state == DECKENT_COMMON_SEAL_RESULT_EXISTING_IDENTICAL) {
    return DECKENT_NATIVE_HANDLE_STATE_OPEN;
  }
  return 0u;
}

bool deckent_native_bind_seal_result_transfer(
  napi_env env,
  deckent_native_state *state,
  napi_value success_result,
  napi_value cleanup_unconfirmed_result,
  napi_value publication_handle,
  napi_value replacement_read_handle,
  bool force_cleanup_unconfirmed
) {
  deckent_native_result_token *success_token = NULL;
  deckent_native_result_token *fallback_token = NULL;
  deckent_common_seal_result_view success_view;
  deckent_common_seal_result_view fallback_view;
  deckent_native_handle_token *publication_token;
  deckent_native_handle_token *replacement_token;
  deckent_native_handle_slot *publication_slot;
  deckent_native_handle_slot *replacement_slot;
  bool same_read = false;
  bool same_identity = false;
  napi_ref primary_ref = NULL;
  napi_ref input_ref = NULL;
  napi_ref replacement_ref = NULL;
  napi_ref fallback_ref = NULL;
  uint32_t expected_input_state = 0u;
  const uint32_t publication_rights = DECKENT_NATIVE_RIGHT_APPEND
    | DECKENT_NATIVE_RIGHT_IDENTITY
    | DECKENT_NATIVE_RIGHT_APPLY_PRIVATE
    | DECKENT_NATIVE_RIGHT_SYNC
    | DECKENT_NATIVE_RIGHT_PUBLISH
    | DECKENT_NATIVE_RIGHT_ABORT;
  if (state == NULL
      || state->env != env
      || !state->backend_invocation_active
      || active_result_transfer_is_armed(state)
      || !get_finalized_result_token(
        env,
        success_result,
        DECKENT_CUSTODY_OPERATION_SEAL_PUBLICATION,
        &success_token
      )
      || !get_finalized_result_token(
        env,
        cleanup_unconfirmed_result,
        DECKENT_CUSTODY_OPERATION_SEAL_PUBLICATION,
        &fallback_token
      )
      || success_token == fallback_token
      || success_token->active_transfer_primary
      || success_token->active_transfer_fallback
      || fallback_token->active_transfer_primary
      || fallback_token->active_transfer_fallback
      || !success_token->input_attested
      || !fallback_token->input_attested
      || success_token->input_states != DECKENT_NATIVE_HANDLE_STATE_OPEN
      || fallback_token->input_states != DECKENT_NATIVE_HANDLE_STATE_OPEN
      || !inspect_seal_result(env, success_result, &success_view)
      || (success_view.state != DECKENT_COMMON_SEAL_RESULT_CREATED
        && success_view.state != DECKENT_COMMON_SEAL_RESULT_EXISTING_IDENTICAL)
      || (expected_input_state = seal_result_expected_input_state(
        success_view.state
      )) == 0u
      || !seal_success_evidence_is_admitted(state, success_view.evidence_bits)
      || !inspect_seal_result(
        env,
        cleanup_unconfirmed_result,
        &fallback_view
      )
      || fallback_view.state
        != DECKENT_COMMON_SEAL_RESULT_UNCONFIRMED_REPLACED
      || fallback_view.evidence_bits != success_view.evidence_bits
      || napi_strict_equals(
        env,
        success_view.read_handle,
        fallback_view.read_handle,
        &same_read
      ) != napi_ok
      || !same_read
      || napi_strict_equals(
        env,
        success_view.identity,
        fallback_view.identity,
        &same_identity
      ) != napi_ok
      || !same_identity
      || napi_strict_equals(
        env,
        success_view.read_handle,
        replacement_read_handle,
        &same_read
      ) != napi_ok
      || !same_read
      || !resolve_native_handle(
        env,
        state,
        publication_handle,
        DECKENT_NATIVE_HANDLE_PUBLICATION,
        publication_rights,
        DECKENT_NATIVE_HANDLE_STATE_OPEN
          | DECKENT_NATIVE_HANDLE_STATE_PUBLISHED_UNCONFIRMED,
        &publication_token,
        &publication_slot
      )
      || !resolve_native_handle(
        env,
        state,
        replacement_read_handle,
        DECKENT_NATIVE_HANDLE_READ_FILE,
        DECKENT_NATIVE_RIGHT_READ | DECKENT_NATIVE_RIGHT_IDENTITY,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &replacement_token,
        &replacement_slot
      )
      || publication_slot->borrow_count != 0u
      || replacement_slot->borrow_count != 0u
      || publication_slot->state != expected_input_state
      || success_token->input_slot_index != publication_token->slot_index
      || success_token->input_generation != publication_token->generation
      || success_token->input_kind != publication_token->kind
      || success_token->input_rights != publication_token->rights
      || fallback_token->input_slot_index != publication_token->slot_index
      || fallback_token->input_generation != publication_token->generation
      || fallback_token->input_kind != publication_token->kind
      || fallback_token->input_rights != publication_token->rights
      || success_token->input_states != DECKENT_NATIVE_HANDLE_STATE_OPEN
      || fallback_token->input_states != DECKENT_NATIVE_HANDLE_STATE_OPEN) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "seal-result accepted-transfer binding is invalid",
      NAPI_AUTO_LENGTH
    );
  }
  if (napi_create_reference(env, success_result, 1u, &primary_ref) != napi_ok
      || napi_create_reference(env, publication_handle, 1u, &input_ref) != napi_ok
      || napi_create_reference(
        env,
        replacement_read_handle,
        1u,
        &replacement_ref
      ) != napi_ok
      || napi_create_reference(
        env,
        cleanup_unconfirmed_result,
        1u,
        &fallback_ref
      ) != napi_ok) {
    if (primary_ref != NULL) (void)napi_delete_reference(env, primary_ref);
    if (input_ref != NULL) (void)napi_delete_reference(env, input_ref);
    if (replacement_ref != NULL) {
      (void)napi_delete_reference(env, replacement_ref);
    }
    if (fallback_ref != NULL) (void)napi_delete_reference(env, fallback_ref);
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "seal-result accepted-transfer references could not be retained",
      NAPI_AUTO_LENGTH
    );
  }
  state->active_transfer.kind = DECKENT_NATIVE_ACTIVE_TRANSFER_SEAL;
  state->active_transfer.primary_token = success_token;
  state->active_transfer.fallback_token = fallback_token;
  state->active_transfer.primary_result_ref = primary_ref;
  state->active_transfer.input_ref = input_ref;
  state->active_transfer.replacement_ref = replacement_ref;
  state->active_transfer.fallback_result_ref = fallback_ref;
  state->active_transfer.input_slot_index = publication_token->slot_index;
  state->active_transfer.input_generation = publication_token->generation;
  state->active_transfer.input_kind = publication_token->kind;
  state->active_transfer.input_rights = publication_token->rights;
  state->active_transfer.expected_input_state = expected_input_state;
  state->active_transfer.force_cleanup_unconfirmed =
    force_cleanup_unconfirmed;
  success_token->active_transfer_primary = true;
  fallback_token->active_transfer_fallback = true;
  return true;
}

static bool settle_seal_result_transfer(
  napi_env env,
  deckent_native_state *state,
  bool accept_primary,
  napi_value *settled_result
) {
  deckent_native_active_transfer *transfer = &state->active_transfer;
  deckent_common_seal_result_view primary_view;
  deckent_common_seal_result_view fallback_view;
  napi_value primary;
  napi_value publication;
  napi_value replacement;
  napi_value fallback;
  deckent_native_handle_token *publication_token;
  deckent_native_handle_token *replacement_token;
  deckent_native_handle_slot *publication_slot;
  deckent_native_handle_slot *replacement_slot;
  deckent_native_retire_result retired;
  bool same = false;
  const uint32_t publication_rights = DECKENT_NATIVE_RIGHT_APPEND
    | DECKENT_NATIVE_RIGHT_IDENTITY
    | DECKENT_NATIVE_RIGHT_APPLY_PRIVATE
    | DECKENT_NATIVE_RIGHT_SYNC
    | DECKENT_NATIVE_RIGHT_PUBLISH
    | DECKENT_NATIVE_RIGHT_ABORT;
  if (settled_result == NULL
      || transfer->kind != DECKENT_NATIVE_ACTIVE_TRANSFER_SEAL
      || transfer->primary_token == NULL
      || transfer->fallback_token == NULL
      || !transfer->primary_token->active_transfer_primary
      || !transfer->fallback_token->active_transfer_fallback
      || transfer->primary_token->consumed
      || transfer->fallback_token->consumed
      || !transfer->primary_token->finalized
      || !transfer->fallback_token->finalized
      || transfer->primary_token->operation
        != DECKENT_CUSTODY_OPERATION_SEAL_PUBLICATION
      || transfer->fallback_token->operation
        != DECKENT_CUSTODY_OPERATION_SEAL_PUBLICATION
      || !transfer->primary_token->input_attested
      || !transfer->fallback_token->input_attested
      || transfer->primary_token->input_states
        != DECKENT_NATIVE_HANDLE_STATE_OPEN
      || transfer->fallback_token->input_states
        != DECKENT_NATIVE_HANDLE_STATE_OPEN
      || transfer->primary_token->input_slot_index
        != transfer->input_slot_index
      || transfer->primary_token->input_generation
        != transfer->input_generation
      || transfer->fallback_token->input_slot_index
        != transfer->input_slot_index
      || transfer->fallback_token->input_generation
        != transfer->input_generation
      || transfer->primary_token->input_kind != transfer->input_kind
      || transfer->fallback_token->input_kind != transfer->input_kind
      || transfer->primary_token->input_rights != transfer->input_rights
      || transfer->fallback_token->input_rights != transfer->input_rights
      || napi_get_reference_value(
        env, transfer->primary_result_ref, &primary
      ) != napi_ok
      || napi_get_reference_value(env, transfer->input_ref, &publication)
        != napi_ok
      || napi_get_reference_value(
        env, transfer->replacement_ref, &replacement
      ) != napi_ok
      || napi_get_reference_value(
        env, transfer->fallback_result_ref, &fallback
      ) != napi_ok
      || !inspect_seal_result(env, primary, &primary_view)
      || !inspect_seal_result(env, fallback, &fallback_view)
      || seal_result_expected_input_state(primary_view.state)
        != transfer->expected_input_state
      || !seal_success_evidence_is_admitted(
        state,
        primary_view.evidence_bits
      )
      || fallback_view.state
        != DECKENT_COMMON_SEAL_RESULT_UNCONFIRMED_REPLACED
      || fallback_view.evidence_bits != primary_view.evidence_bits
      || napi_strict_equals(
        env, primary_view.read_handle, fallback_view.read_handle, &same
      ) != napi_ok
      || !same
      || napi_strict_equals(
        env, primary_view.identity, fallback_view.identity, &same
      ) != napi_ok
      || !same
      || napi_strict_equals(
        env, primary_view.read_handle, replacement, &same
      ) != napi_ok
      || !same
      || !resolve_native_handle(
        env,
        state,
        publication,
        DECKENT_NATIVE_HANDLE_PUBLICATION,
        publication_rights,
        transfer->expected_input_state,
        &publication_token,
        &publication_slot
      )
      || !resolve_native_handle(
        env,
        state,
        replacement,
        DECKENT_NATIVE_HANDLE_READ_FILE,
        DECKENT_NATIVE_RIGHT_READ | DECKENT_NATIVE_RIGHT_IDENTITY,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &replacement_token,
        &replacement_slot
      )
      || publication_slot->state != transfer->expected_input_state
      || publication_slot->borrow_count != 0u
      || replacement_slot->borrow_count != 0u
      || publication_token->slot_index != transfer->input_slot_index
      || publication_token->generation != transfer->input_generation
      || publication_token->kind != transfer->input_kind
      || publication_token->rights != transfer->input_rights) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "seal result transfer ledger could not be resolved",
      NAPI_AUTO_LENGTH
    );
  }

  if (!accept_primary
      && primary_view.state
        == DECKENT_COMMON_SEAL_RESULT_EXISTING_IDENTICAL) {
    retired = retire_native_handle_internal(
      env,
      state,
      replacement,
      DECKENT_NATIVE_HANDLE_READ_FILE,
      DECKENT_NATIVE_RIGHT_READ | DECKENT_NATIVE_RIGHT_IDENTITY,
      DECKENT_NATIVE_HANDLE_STATE_OPEN,
      false,
      NULL
    );
    if (retired == DECKENT_NATIVE_RETIRE_REJECTED) {
      napi_fatal_error(
        "deckent.exec-authority",
        NAPI_AUTO_LENGTH,
        "rejected existing-identical replacement could not be terminalized",
        NAPI_AUTO_LENGTH
      );
    }
    clear_active_result_transfer_or_fatal(env, state);
    if (retired == DECKENT_NATIVE_RETIRE_CLEANUP_UNCONFIRMED) {
      deckent_native_throw(
        env,
        DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "rejected existing-identical replacement cleanup was not confirmed"
      );
    } else {
      deckent_native_throw(
        env,
        "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
        "custody backend did not return its bound seal result"
      );
    }
    return false;
  }

  retired = retire_native_handle_internal(
    env,
    state,
    publication,
    DECKENT_NATIVE_HANDLE_PUBLICATION,
    publication_rights,
    transfer->expected_input_state,
    false,
    NULL
  );
  if (retired == DECKENT_NATIVE_RETIRE_REJECTED) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "seal publication transfer could not be terminalized",
      NAPI_AUTO_LENGTH
    );
  }
  *settled_result = accept_primary
      && retired == DECKENT_NATIVE_RETIRE_CONFIRMED
      && !transfer->force_cleanup_unconfirmed
    ? primary
    : fallback;
  clear_active_result_transfer_or_fatal(env, state);
  return true;
}

static bool resolve_seal_result_transfer(
  napi_env env,
  deckent_native_state *state,
  deckent_native_result_token *token,
  napi_value result,
  napi_value input_snapshot,
  napi_value *accepted_result
) {
  deckent_common_seal_result_view result_view;
  napi_value publication_handle;
  napi_value held_primary;
  napi_value held_input;
  deckent_native_handle_token *publication_token;
  deckent_native_handle_slot *publication_slot;
  bool same = false;
  const uint32_t publication_rights = DECKENT_NATIVE_RIGHT_APPEND
    | DECKENT_NATIVE_RIGHT_IDENTITY
    | DECKENT_NATIVE_RIGHT_APPLY_PRIVATE
    | DECKENT_NATIVE_RIGHT_SYNC
    | DECKENT_NATIVE_RIGHT_PUBLISH
    | DECKENT_NATIVE_RIGHT_ABORT;
  if (accepted_result == NULL
      || !deckent_native_get_own_value(
        env,
        input_snapshot,
        "publication",
        &publication_handle
      )
      || !inspect_seal_result(env, result, &result_view)
      || !token->input_attested
      || !resolve_native_handle(
        env,
        state,
        publication_handle,
        DECKENT_NATIVE_HANDLE_PUBLICATION,
        publication_rights,
        DECKENT_NATIVE_HANDLE_STATE_OPEN
          | DECKENT_NATIVE_HANDLE_STATE_PUBLISHED_UNCONFIRMED,
        &publication_token,
        &publication_slot
      )
      || token->input_slot_index != publication_token->slot_index
      || token->input_generation != publication_token->generation
      || token->input_kind != publication_token->kind
      || token->input_rights != publication_token->rights
      || token->input_states != DECKENT_NATIVE_HANDLE_STATE_OPEN) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "seal-result input or result attestation is invalid"
    );
    return false;
  }
  if (!token->active_transfer_primary) {
    if (result_view.state
          != DECKENT_COMMON_SEAL_RESULT_UNCONFIRMED_RETAINED
        || publication_slot->state
          != DECKENT_NATIVE_HANDLE_STATE_PUBLISHED_UNCONFIRMED) {
      deckent_native_throw(
        env,
        "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
        "seal success has no accepted-transfer authority"
      );
      return false;
    }
    token->consumed = true;
    *accepted_result = result;
    return true;
  }
  if (state->active_transfer.kind != DECKENT_NATIVE_ACTIVE_TRANSFER_SEAL
      || state->active_transfer.primary_token != token
      || state->active_transfer.expected_input_state
        != seal_result_expected_input_state(result_view.state)
      || publication_slot->state
        != state->active_transfer.expected_input_state
      || napi_get_reference_value(
        env, state->active_transfer.primary_result_ref, &held_primary
      ) != napi_ok
      || napi_get_reference_value(
        env, state->active_transfer.input_ref, &held_input
      ) != napi_ok
      || napi_strict_equals(env, result, held_primary, &same) != napi_ok
      || !same
      || napi_strict_equals(
        env, publication_handle, held_input, &same
      ) != napi_ok
      || !same) {
    return settle_seal_result_transfer(env, state, false, accepted_result);
  }
  return settle_seal_result_transfer(env, state, true, accepted_result);
}

static bool inspect_cleanup_result(
  napi_env env,
  napi_value result,
  bool expect_confirmed
) {
  static const char *const keys[] = {
    "kind", "reasonCode", "schemaVersion", "state"
  };
  napi_value schema_version;
  napi_value kind;
  napi_value reason;
  napi_value lifecycle;
  uint32_t schema = 0u;
  return native_exact_key_set(env, result, keys, 4u)
    && deckent_native_get_own_value(
      env, result, "schemaVersion", &schema_version
    )
    && native_exact_uint32(env, schema_version, &schema)
    && schema == 1u
    && deckent_native_get_own_value(env, result, "kind", &kind)
    && native_exact_string(env, kind, "custody-cleanup")
    && deckent_native_get_own_value(env, result, "reasonCode", &reason)
    && deckent_native_get_own_value(env, result, "state", &lifecycle)
    && (expect_confirmed
      ? native_is_null(env, reason)
        && native_exact_string(env, lifecycle, "CLEANUP_CONFIRMED")
      : native_exact_string(
          env,
          reason,
          DECKENT_CUSTODY_REASON_CLEANUP_UNCONFIRMED
        )
        && native_exact_string(env, lifecycle, "CLEANUP_UNCONFIRMED"));
}

bool deckent_native_bind_abort_result_transfer(
  napi_env env,
  deckent_native_state *state,
  napi_value cleanup_confirmed_result,
  napi_value cleanup_unconfirmed_result,
  napi_value publication_handle
) {
  deckent_native_result_token *confirmed_token = NULL;
  deckent_native_result_token *fallback_token = NULL;
  deckent_native_handle_token *publication_token;
  deckent_native_handle_slot *publication_slot;
  napi_ref primary_ref = NULL;
  napi_ref input_ref = NULL;
  napi_ref fallback_ref = NULL;
  if (state == NULL
      || state->env != env
      || !state->backend_invocation_active
      || active_result_transfer_is_armed(state)
      || !get_finalized_result_token(
        env,
        cleanup_confirmed_result,
        DECKENT_CUSTODY_OPERATION_ABORT_PUBLICATION,
        &confirmed_token
      )
      || !get_finalized_result_token(
        env,
        cleanup_unconfirmed_result,
        DECKENT_CUSTODY_OPERATION_ABORT_PUBLICATION,
        &fallback_token
      )
      || confirmed_token == fallback_token
      || confirmed_token->active_transfer_primary
      || confirmed_token->active_transfer_fallback
      || fallback_token->active_transfer_primary
      || fallback_token->active_transfer_fallback
      || !confirmed_token->input_attested
      || !fallback_token->input_attested
      || !inspect_cleanup_result(env, cleanup_confirmed_result, true)
      || !inspect_cleanup_result(env, cleanup_unconfirmed_result, false)
      || !resolve_native_handle(
        env,
        state,
        publication_handle,
        DECKENT_NATIVE_HANDLE_PUBLICATION,
        DECKENT_NATIVE_RIGHT_ABORT,
        DECKENT_NATIVE_HANDLE_STATE_OPEN
          | DECKENT_NATIVE_HANDLE_STATE_APPEND_FAILED,
        &publication_token,
        &publication_slot
      )
      || publication_slot->borrow_count != 0u
      || confirmed_token->input_states != publication_slot->state
      || fallback_token->input_states != publication_slot->state
      || confirmed_token->input_slot_index != publication_token->slot_index
      || confirmed_token->input_generation != publication_token->generation
      || confirmed_token->input_kind != publication_token->kind
      || confirmed_token->input_rights != publication_token->rights
      || fallback_token->input_slot_index != publication_token->slot_index
      || fallback_token->input_generation != publication_token->generation
      || fallback_token->input_kind != publication_token->kind
      || fallback_token->input_rights != publication_token->rights) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "abort-result accepted-transfer binding is invalid",
      NAPI_AUTO_LENGTH
    );
  }
  if (napi_create_reference(
        env,
        cleanup_confirmed_result,
        1u,
        &primary_ref
      ) != napi_ok
      || napi_create_reference(env, publication_handle, 1u, &input_ref) != napi_ok
      || napi_create_reference(
        env,
        cleanup_unconfirmed_result,
        1u,
        &fallback_ref
      ) != napi_ok) {
    if (primary_ref != NULL) (void)napi_delete_reference(env, primary_ref);
    if (input_ref != NULL) (void)napi_delete_reference(env, input_ref);
    if (fallback_ref != NULL) (void)napi_delete_reference(env, fallback_ref);
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "abort-result accepted-transfer references could not be retained",
      NAPI_AUTO_LENGTH
    );
  }
  state->active_transfer.kind = DECKENT_NATIVE_ACTIVE_TRANSFER_ABORT;
  state->active_transfer.primary_token = confirmed_token;
  state->active_transfer.fallback_token = fallback_token;
  state->active_transfer.primary_result_ref = primary_ref;
  state->active_transfer.input_ref = input_ref;
  state->active_transfer.fallback_result_ref = fallback_ref;
  state->active_transfer.input_slot_index = publication_token->slot_index;
  state->active_transfer.input_generation = publication_token->generation;
  state->active_transfer.input_kind = publication_token->kind;
  state->active_transfer.input_rights = publication_token->rights;
  state->active_transfer.expected_input_state = publication_slot->state;
  confirmed_token->active_transfer_primary = true;
  fallback_token->active_transfer_fallback = true;
  return true;
}

static bool settle_abort_result_transfer(
  napi_env env,
  deckent_native_state *state,
  bool accept_primary,
  napi_value *settled_result
) {
  deckent_native_active_transfer *transfer = &state->active_transfer;
  napi_value primary;
  napi_value publication;
  napi_value fallback;
  deckent_native_handle_token *publication_token;
  deckent_native_handle_slot *publication_slot;
  deckent_native_retire_result retired;
  if (settled_result == NULL
      || transfer->kind != DECKENT_NATIVE_ACTIVE_TRANSFER_ABORT
      || transfer->primary_token == NULL
      || transfer->fallback_token == NULL
      || !transfer->primary_token->active_transfer_primary
      || !transfer->fallback_token->active_transfer_fallback
      || transfer->primary_token->consumed
      || transfer->fallback_token->consumed
      || !transfer->primary_token->finalized
      || !transfer->fallback_token->finalized
      || transfer->primary_token->operation
        != DECKENT_CUSTODY_OPERATION_ABORT_PUBLICATION
      || transfer->fallback_token->operation
        != DECKENT_CUSTODY_OPERATION_ABORT_PUBLICATION
      || !transfer->primary_token->input_attested
      || !transfer->fallback_token->input_attested
      || transfer->primary_token->input_states
        != transfer->expected_input_state
      || transfer->fallback_token->input_states
        != transfer->expected_input_state
      || transfer->primary_token->input_slot_index
        != transfer->input_slot_index
      || transfer->primary_token->input_generation
        != transfer->input_generation
      || transfer->fallback_token->input_slot_index
        != transfer->input_slot_index
      || transfer->fallback_token->input_generation
        != transfer->input_generation
      || transfer->primary_token->input_kind != transfer->input_kind
      || transfer->fallback_token->input_kind != transfer->input_kind
      || transfer->primary_token->input_rights != transfer->input_rights
      || transfer->fallback_token->input_rights != transfer->input_rights
      || transfer->replacement_ref != NULL
      || (transfer->expected_input_state != DECKENT_NATIVE_HANDLE_STATE_OPEN
        && transfer->expected_input_state
          != DECKENT_NATIVE_HANDLE_STATE_APPEND_FAILED)
      || napi_get_reference_value(
        env, transfer->primary_result_ref, &primary
      ) != napi_ok
      || napi_get_reference_value(env, transfer->input_ref, &publication)
        != napi_ok
      || napi_get_reference_value(
        env, transfer->fallback_result_ref, &fallback
      ) != napi_ok
      || !inspect_cleanup_result(env, primary, true)
      || !inspect_cleanup_result(env, fallback, false)
      || !resolve_native_handle(
        env,
        state,
        publication,
        DECKENT_NATIVE_HANDLE_PUBLICATION,
        DECKENT_NATIVE_RIGHT_ABORT,
        transfer->expected_input_state,
        &publication_token,
        &publication_slot
      )
      || publication_slot->state != transfer->expected_input_state
      || publication_slot->borrow_count != 0u
      || publication_token->slot_index != transfer->input_slot_index
      || publication_token->generation != transfer->input_generation
      || publication_token->kind != transfer->input_kind
      || publication_token->rights != transfer->input_rights) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "abort result transfer ledger could not be resolved",
      NAPI_AUTO_LENGTH
    );
  }
  retired = retire_native_handle_internal(
    env,
    state,
    publication,
    DECKENT_NATIVE_HANDLE_PUBLICATION,
    DECKENT_NATIVE_RIGHT_ABORT,
    transfer->expected_input_state,
    false,
    NULL
  );
  if (retired == DECKENT_NATIVE_RETIRE_REJECTED) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "abort publication transfer could not be terminalized",
      NAPI_AUTO_LENGTH
    );
  }
  *settled_result = accept_primary
      && retired == DECKENT_NATIVE_RETIRE_CONFIRMED
    ? primary
    : fallback;
  clear_active_result_transfer_or_fatal(env, state);
  return true;
}

static bool resolve_abort_result_transfer(
  napi_env env,
  deckent_native_state *state,
  deckent_native_result_token *token,
  napi_value result,
  napi_value input_snapshot,
  napi_value *accepted_result
) {
  napi_value publication_handle;
  napi_value held_primary;
  napi_value held_input;
  deckent_native_handle_token *publication_token;
  deckent_native_handle_slot *publication_slot;
  bool same = false;
  if (accepted_result == NULL
      || !inspect_cleanup_result(env, result, true)
      || !deckent_native_get_own_value(
        env,
        input_snapshot,
        "publication",
        &publication_handle
      )
      || !resolve_native_handle(
        env,
        state,
        publication_handle,
        DECKENT_NATIVE_HANDLE_PUBLICATION,
        DECKENT_NATIVE_RIGHT_ABORT,
        DECKENT_NATIVE_HANDLE_STATE_OPEN
          | DECKENT_NATIVE_HANDLE_STATE_APPEND_FAILED,
        &publication_token,
        &publication_slot
      )
      || publication_slot->borrow_count != 0u
      || token->input_slot_index != publication_token->slot_index
      || token->input_generation != publication_token->generation
      || token->input_kind != publication_token->kind
      || token->input_rights != publication_token->rights
      || token->input_states != publication_slot->state) {
    if (active_result_transfer_is_armed(state)) {
      return settle_abort_result_transfer(env, state, false, accepted_result);
    }
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "abort-result input or result attestation is invalid"
    );
    return false;
  }
  if (state->active_transfer.kind != DECKENT_NATIVE_ACTIVE_TRANSFER_ABORT
      || state->active_transfer.primary_token != token
      || state->active_transfer.expected_input_state != publication_slot->state
      || napi_get_reference_value(
        env, state->active_transfer.primary_result_ref, &held_primary
      ) != napi_ok
      || napi_get_reference_value(
        env, state->active_transfer.input_ref, &held_input
      ) != napi_ok
      || napi_strict_equals(env, result, held_primary, &same) != napi_ok
      || !same
      || napi_strict_equals(
        env, publication_handle, held_input, &same
      ) != napi_ok
      || !same) {
    return settle_abort_result_transfer(env, state, false, accepted_result);
  }
  return settle_abort_result_transfer(env, state, true, accepted_result);
}

static bool settle_active_result_transfer(
  napi_env env,
  deckent_native_state *state,
  bool accept_primary,
  napi_value *settled_result
) {
  if (state == NULL || settled_result == NULL) return false;
  if (state->active_transfer.kind == DECKENT_NATIVE_ACTIVE_TRANSFER_SEAL) {
    return settle_seal_result_transfer(
      env, state, accept_primary, settled_result
    );
  }
  if (state->active_transfer.kind == DECKENT_NATIVE_ACTIVE_TRANSFER_ABORT) {
    return settle_abort_result_transfer(
      env, state, accept_primary, settled_result
    );
  }
  return false;
}

static bool result_is_active_transfer_primary(
  napi_env env,
  deckent_native_state *state,
  napi_value result
) {
  napi_value expected;
  bool same = false;
  return active_result_transfer_is_armed(state)
    && result != NULL
    && state->active_transfer.primary_result_ref != NULL
    && napi_get_reference_value(
      env,
      state->active_transfer.primary_result_ref,
      &expected
    ) == napi_ok
    && napi_strict_equals(env, result, expected, &same) == napi_ok
    && same;
}

static bool active_transfer_input_matches_snapshot(
  napi_env env,
  deckent_native_state *state,
  napi_value input_snapshot
) {
  napi_value snapshot_input;
  napi_value bound_input;
  bool same = false;
  return active_result_transfer_is_armed(state)
    && deckent_native_get_own_value(
      env,
      input_snapshot,
      "publication",
      &snapshot_input
    )
    && napi_get_reference_value(
      env,
      state->active_transfer.input_ref,
      &bound_input
    ) == napi_ok
    && napi_strict_equals(env, snapshot_input, bound_input, &same) == napi_ok
    && same;
}

#if DECKENT_HAS_LEGACY_POSIX

static bool grow_legacy_slots(napi_env env, deckent_native_state *state) {
  uint32_t old_capacity = state->legacy_slot_capacity;
  uint32_t next_capacity;
  deckent_legacy_fd_slot *next;
  if (old_capacity >= DECKENT_MAX_HANDLE_CAPACITY) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_LEGACY_TOKEN_LIMIT",
      "legacy execution authority token capacity is exhausted"
    );
    return false;
  }
  next_capacity = old_capacity == 0u
    ? DECKENT_INITIAL_LEGACY_CAPACITY
    : old_capacity * 2u;
  if (next_capacity > DECKENT_MAX_HANDLE_CAPACITY) {
    next_capacity = DECKENT_MAX_HANDLE_CAPACITY;
  }
  next = (deckent_legacy_fd_slot *)realloc(
    state->legacy_slots,
    (size_t)next_capacity * sizeof(*next)
  );
  if (next == NULL) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "legacy execution authority token allocation failed"
    );
    return false;
  }
  memset(
    next + old_capacity,
    0,
    (size_t)(next_capacity - old_capacity) * sizeof(*next)
  );
  state->legacy_slots = next;
  state->legacy_slot_capacity = next_capacity;
  return true;
}

static bool issue_legacy_token(
  napi_env env,
  deckent_native_state *state,
  int32_t fd,
  int32_t *issued_token
) {
  uint32_t index;
  uint32_t token;
  if (state->legacy_token_exhausted
      || state->next_legacy_token == 0u
      || state->next_legacy_token > (uint32_t)INT32_MAX) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_LEGACY_TOKEN_EXHAUSTED",
      "legacy execution authority token sequence is exhausted"
    );
    return false;
  }
  for (;;) {
    for (index = 0u; index < state->legacy_slot_capacity; index += 1u) {
      if (!state->legacy_slots[index].active) goto found_slot;
    }
    if (!grow_legacy_slots(env, state)) return false;
  }

found_slot:
  token = state->next_legacy_token;
  if (token == (uint32_t)INT32_MAX) state->legacy_token_exhausted = true;
  else state->next_legacy_token += 1u;
  state->legacy_slots[index].token = token;
  state->legacy_slots[index].fd = fd;
  state->legacy_slots[index].active = true;
  if (index >= state->legacy_slot_count) state->legacy_slot_count = index + 1u;
  *issued_token = (int32_t)token;
  return true;
}

static bool resolve_legacy_token(
  napi_env env,
  deckent_native_state *state,
  int32_t token,
  int32_t *fd
) {
  uint32_t index;
  if (token <= 0) {
    deckent_native_throw(env, "EBADF", "legacy execution authority token is invalid");
    return false;
  }
  for (index = 0u; index < state->legacy_slot_count; index += 1u) {
    const deckent_legacy_fd_slot *slot = &state->legacy_slots[index];
    if (slot->active && slot->token == (uint32_t)token) {
      *fd = slot->fd;
      return true;
    }
  }
  deckent_native_throw(env, "EBADF", "legacy execution authority token is stale");
  return false;
}

static bool retire_legacy_token(
  napi_env env,
  deckent_native_state *state,
  int32_t token,
  int32_t *fd
) {
  uint32_t index;
  if (token <= 0) {
    deckent_native_throw(env, "EBADF", "legacy execution authority token is invalid");
    return false;
  }
  for (index = 0u; index < state->legacy_slot_count; index += 1u) {
    deckent_legacy_fd_slot *slot = &state->legacy_slots[index];
    if (slot->active && slot->token == (uint32_t)token) {
      *fd = slot->fd;
      slot->active = false;
      slot->fd = -1;
      return true;
    }
  }
  deckent_native_throw(env, "EBADF", "legacy execution authority token is stale");
  return false;
}

static napi_value throw_errno(napi_env env, const char *syscall, int err) {
  const char *code;
  (void)syscall;
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
  return deckent_native_throw(env, code, "legacy POSIX operation failed");
}

static bool get_exact_legacy_args(
  napi_env env,
  napi_callback_info info,
  size_t expected,
  size_t capacity,
  napi_value *argv
) {
  size_t argc = capacity;
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok
      || argc != expected) {
    deckent_native_throw(env, "EINVAL", "legacy argument contract failed");
    return false;
  }
  return true;
}

/* One bounded, NUL-clean path/name argument. Rejects empty and embedded NUL. */
static bool get_name_arg(napi_env env, napi_value value, char *out, size_t cap) {
  napi_valuetype type;
  size_t full_length = 0u;
  size_t copied = 0u;
  if (napi_typeof(env, value, &type) != napi_ok
      || type != napi_string
      || napi_get_value_string_utf8(
           env,
           value,
           NULL,
           0u,
           &full_length
         ) != napi_ok) {
    deckent_native_throw(env, "EINVAL", "string argument required");
    return false;
  }
  if (full_length == 0u || full_length >= cap) {
    deckent_native_throw(env, "EINVAL", "name argument length out of bounds");
    return false;
  }
  if (napi_get_value_string_utf8(
        env,
        value,
        out,
        cap,
        &copied
      ) != napi_ok
      || copied != full_length
      || strlen(out) != full_length) {
    deckent_native_throw(env, "EINVAL", "name argument encoding is invalid");
    return false;
  }
  return true;
}

static bool get_component_arg(
  napi_env env,
  napi_value value,
  char *out,
  size_t cap
) {
  if (!get_name_arg(env, value, out, cap)) return false;
  if (strcmp(out, ".") == 0
      || strcmp(out, "..") == 0
      || strchr(out, '/') != NULL) {
    deckent_native_throw(env, "EINVAL", "single POSIX component required");
    return false;
  }
  return true;
}

static bool get_absolute_path_arg(
  napi_env env,
  napi_value value,
  char *out,
  size_t cap
) {
  if (!get_name_arg(env, value, out, cap)) return false;
  if (out[0] != '/') {
    deckent_native_throw(env, "EINVAL", "absolute POSIX path required");
    return false;
  }
  return true;
}

static bool get_fd_arg(napi_env env, napi_value value, int32_t *out) {
  napi_valuetype type;
  double number;
  int32_t token;
  if (napi_typeof(env, value, &type) != napi_ok
      || type != napi_number
      || napi_get_value_double(env, value, &number) != napi_ok
      || !(number >= 1.0 && number <= (double)INT32_MAX)) {
    deckent_native_throw(env, "EINVAL", "positive legacy handle token required");
    return false;
  }
  token = (int32_t)number;
  if (number != (double)token) {
    deckent_native_throw(env, "EINVAL", "integer legacy handle token required");
    return false;
  }
  *out = token;
  return true;
}

/* openDirAt(parentToken | null, name) -> virtualToken
 * O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC through the parent handle —
 * the OS descriptor never leaves the per-environment legacy registry. */
static napi_value OpenDirAt(napi_env env, napi_callback_info info) {
  napi_value argv[3];
  napi_valuetype t;
  int32_t parent_token = 0;
  int32_t parent_fd = AT_FDCWD;
  int32_t issued_token;
  int32_t rollback_fd;
  int fd;
  deckent_native_state *state;
  char name[MAX_NAME_BYTES];
  napi_value result;
  napi_status status;
  if (!get_exact_legacy_args(env, info, 2u, 3u, argv)) return NULL;
  if (napi_typeof(env, argv[0], &t) != napi_ok) {
    return deckent_native_throw(env, "EINVAL", "legacy parent token type failed");
  }
  if (!get_native_state(env, &state)) return NULL;
  if (t != napi_null) {
    if (!get_fd_arg(env, argv[0], &parent_token)
        || !resolve_legacy_token(env, state, parent_token, &parent_fd)) return NULL;
  }
  if (t == napi_null) {
    if (!get_absolute_path_arg(env, argv[1], name, sizeof(name))) return NULL;
  } else if (!get_component_arg(env, argv[1], name, sizeof(name))) return NULL;
  fd = openat(parent_fd, name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (fd < 0) return throw_errno(env, "openat", errno);
  if (!issue_legacy_token(env, state, fd, &issued_token)) {
    if (close(fd) != 0) {
      return deckent_native_throw(
        env,
        "E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED",
        "legacy descriptor cleanup could not be confirmed"
      );
    }
    return NULL;
  }
  status = napi_create_int32(env, issued_token, &result);
  if (status != napi_ok) {
    if (!retire_legacy_token(env, state, issued_token, &rollback_fd)) {
      napi_fatal_error(
        "deckent.exec-authority",
        NAPI_AUTO_LENGTH,
        "issued legacy token could not be retired",
        NAPI_AUTO_LENGTH
      );
    }
    if (close(rollback_fd) != 0) {
      return deckent_native_throw(
        env,
        "E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED",
        "legacy descriptor cleanup could not be confirmed"
      );
    }
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_INIT",
      "legacy token result could not be created"
    );
  }
  return result;
}

/* closeFd(virtualToken) — retires the token before exact-once OS cleanup. */
static napi_value CloseFd(napi_env env, napi_callback_info info) {
  napi_value argv[2];
  int32_t token;
  int32_t fd;
  deckent_native_state *state;
  napi_value result;
  if (!get_exact_legacy_args(env, info, 1u, 2u, argv)
      || !get_fd_arg(env, argv[0], &token)
      || !get_native_state(env, &state)) return NULL;
  if (!check_napi(
        env,
        napi_get_undefined(env, &result),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy close result could not be created"
      )) return NULL;
  if (!retire_legacy_token(env, state, token, &fd)) return NULL;
  if (close(fd) != 0) {
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED",
      "legacy descriptor cleanup could not be confirmed"
    );
  }
  return result;
}

/* fstatIdentity(fd) → { dev, ino, isDirectory } (dev/ino as decimal strings —
 * bigint-exact, matching ExecutionLockDirectoryIdentity's string contract). */
static napi_value FstatIdentity(napi_env env, napi_callback_info info) {
  napi_value argv[2];
  int32_t token;
  int32_t fd;
  deckent_native_state *state;
  struct stat st;
  char dev[32];
  char ino[32];
  napi_value result;
  napi_value value;
  if (!get_exact_legacy_args(env, info, 1u, 2u, argv)
      || !get_fd_arg(env, argv[0], &token)
      || !get_native_state(env, &state)
      || !resolve_legacy_token(env, state, token, &fd)) return NULL;
  if (fstat(fd, &st) != 0) return throw_errno(env, "fstat", errno);
  snprintf(dev, sizeof(dev), "%llu", (unsigned long long)st.st_dev);
  snprintf(ino, sizeof(ino), "%llu", (unsigned long long)st.st_ino);
  if (!check_napi(
        env,
        napi_create_object(env, &result),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy identity result could not be created"
      ) || !check_napi(
        env,
        napi_create_string_utf8(env, dev, NAPI_AUTO_LENGTH, &value),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy device identity could not be created"
      ) || !check_napi(
        env,
        define_own_value_status(env, result, "dev", value),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy device identity could not be installed"
      ) || !check_napi(
        env,
        napi_create_string_utf8(env, ino, NAPI_AUTO_LENGTH, &value),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy inode identity could not be created"
      ) || !check_napi(
        env,
        define_own_value_status(env, result, "ino", value),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy inode identity could not be installed"
      ) || !check_napi(
        env,
        napi_get_boolean(env, S_ISDIR(st.st_mode), &value),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy object type could not be created"
      ) || !check_napi(
        env,
        define_own_value_status(env, result, "isDirectory", value),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy object type could not be installed"
      ) || !check_napi(
        env,
        napi_object_freeze(env, result),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy identity result could not be frozen"
      )) return NULL;
  return result;
}

/* readdirFd(fd) → sorted names[] (".", ".." excluded). Uses a dup so the
 * caller's descriptor position/lifetime is never consumed by fdopendir. */
static int compare_legacy_names(const void *left, const void *right) {
  const char *const *left_name = (const char *const *)left;
  const char *const *right_name = (const char *const *)right;
  return strcmp(*left_name, *right_name);
}

static void free_legacy_names(char **names, size_t count) {
  size_t index;
  for (index = 0u; index < count; index += 1u) free(names[index]);
  free(names);
}

static napi_value ReaddirFd(napi_env env, napi_callback_info info) {
  napi_value argv[2];
  int32_t token;
  int32_t fd;
  int dupfd;
  int read_error = 0;
  int close_result;
  deckent_native_state *state;
  DIR *dir;
  struct dirent *entry;
  char **names = NULL;
  size_t count = 0u;
  size_t capacity = 0u;
  const size_t max_names = (size_t)UINT32_MAX < SIZE_MAX / sizeof(*names)
    ? (size_t)UINT32_MAX
    : SIZE_MAX / sizeof(*names);
  const char *failure_code = NULL;
  const char *failure_message = NULL;
  napi_value result;
  size_t index;
  if (!get_exact_legacy_args(env, info, 1u, 2u, argv)
      || !get_fd_arg(env, argv[0], &token)
      || !get_native_state(env, &state)
      || !resolve_legacy_token(env, state, token, &fd)) return NULL;
  dupfd = fcntl(fd, F_DUPFD_CLOEXEC, 0);
  if (dupfd < 0) return throw_errno(env, "fcntl(F_DUPFD_CLOEXEC)", errno);
  dir = fdopendir(dupfd);
  if (dir == NULL) {
    int err = errno;
    if (close(dupfd) != 0) {
      return deckent_native_throw(
        env,
        "E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED",
        "legacy directory duplicate cleanup could not be confirmed"
      );
    }
    return throw_errno(env, "fdopendir", err);
  }
  rewinddir(dir);
  for (;;) {
    size_t length;
    char *copy;
    errno = 0;
    entry = readdir(dir);
    if (entry == NULL) {
      read_error = errno;
      break;
    }
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) continue;
    if (count == max_names) {
      failure_code = "E_EXEC_AUTH_NATIVE_HANDLE_LIMIT";
      failure_message = "legacy directory entry count exceeds the ABI bound";
      break;
    }
    if (count == capacity) {
      size_t next_capacity;
      char **next;
      if (capacity == 0u) next_capacity = max_names < 16u ? max_names : 16u;
      else if (capacity > max_names / 2u) next_capacity = max_names;
      else next_capacity = capacity * 2u;
      if (next_capacity <= capacity
          || next_capacity > max_names
          || next_capacity > SIZE_MAX / sizeof(*next)) {
        failure_code = "E_EXEC_AUTH_NATIVE_HANDLE_LIMIT";
        failure_message = "legacy directory entry capacity exceeds the ABI bound";
        break;
      }
      next = (char **)realloc(names, next_capacity * sizeof(*next));
      if (next == NULL) {
        failure_code = "E_EXEC_AUTH_NATIVE_ALLOCATION";
        failure_message = "legacy directory entry allocation failed";
        break;
      }
      names = next;
      capacity = next_capacity;
    }
    length = strlen(entry->d_name);
    copy = (char *)malloc(length + 1u);
    if (copy == NULL) {
      failure_code = "E_EXEC_AUTH_NATIVE_ALLOCATION";
      failure_message = "legacy directory name allocation failed";
      break;
    }
    memcpy(copy, entry->d_name, length + 1u);
    names[count++] = copy;
  }
  close_result = closedir(dir);
  if (close_result != 0) {
    free_legacy_names(names, count);
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED",
      "legacy directory duplicate cleanup could not be confirmed"
    );
  }
  if (failure_code != NULL) {
    free_legacy_names(names, count);
    return deckent_native_throw(env, failure_code, failure_message);
  }
  if (read_error != 0) {
    free_legacy_names(names, count);
    return throw_errno(env, "readdir", read_error);
  }
  if (count > 1u) qsort(names, count, sizeof(*names), compare_legacy_names);
  if (!check_napi(
        env,
        napi_create_array_with_length(env, count, &result),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy directory result could not be created"
      )) {
    free_legacy_names(names, count);
    return NULL;
  }
  for (index = 0u; index < count; index += 1u) {
    napi_value name;
    if (!check_napi(
          env,
          napi_create_string_utf8(env, names[index], NAPI_AUTO_LENGTH, &name),
          "E_EXEC_AUTH_NATIVE_INIT",
          "legacy directory name could not be created"
        ) || !check_napi(
          env,
          define_own_index_status(env, result, (uint32_t)index, name),
          "E_EXEC_AUTH_NATIVE_INIT",
          "legacy directory name could not be installed"
        )) {
      free_legacy_names(names, count);
      return NULL;
    }
  }
  free_legacy_names(names, count);
  if (!check_napi(
        env,
        napi_object_freeze(env, result),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy directory result could not be frozen"
      )) return NULL;
  return result;
}

/* unlinkAt(dirFd, name, removeDir) — file unlink or AT_REMOVEDIR rmdir,
 * always relative to the pinned directory handle. */
static napi_value UnlinkAt(napi_env env, napi_callback_info info) {
  napi_value argv[4];
  int32_t token;
  int32_t fd;
  deckent_native_state *state;
  char name[MAX_NAME_BYTES];
  bool remove_dir;
  napi_valuetype remove_type;
  napi_value result;
  if (!get_exact_legacy_args(env, info, 3u, 4u, argv)
      || !get_fd_arg(env, argv[0], &token)
      || !get_native_state(env, &state)
      || !resolve_legacy_token(env, state, token, &fd)) return NULL;
  if (!get_component_arg(env, argv[1], name, sizeof(name))) return NULL;
  if (napi_typeof(env, argv[2], &remove_type) != napi_ok
      || remove_type != napi_boolean
      || napi_get_value_bool(env, argv[2], &remove_dir) != napi_ok) {
    return deckent_native_throw(env, "EINVAL", "removeDir must be a boolean");
  }
  if (!check_napi(
        env,
        napi_get_undefined(env, &result),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy unlink result could not be created"
      )) return NULL;
  if (unlinkat(fd, name, remove_dir ? AT_REMOVEDIR : 0) != 0) {
    return throw_errno(env, "unlinkat", errno);
  }
  return result;
}

/* renameAt(fromDirFd, fromName, toDirFd, toName) */
static napi_value RenameAt(napi_env env, napi_callback_info info) {
  napi_value argv[5];
  int32_t from_token, to_token;
  int32_t from_fd, to_fd;
  deckent_native_state *state;
  char from_name[MAX_NAME_BYTES];
  char to_name[MAX_NAME_BYTES];
  napi_value result;
  if (!get_exact_legacy_args(env, info, 4u, 5u, argv)
      || !get_fd_arg(env, argv[0], &from_token)
      || !get_native_state(env, &state)
      || !resolve_legacy_token(env, state, from_token, &from_fd)) return NULL;
  if (!get_component_arg(env, argv[1], from_name, sizeof(from_name))) return NULL;
  if (!get_fd_arg(env, argv[2], &to_token)
      || !resolve_legacy_token(env, state, to_token, &to_fd)) return NULL;
  if (!get_component_arg(env, argv[3], to_name, sizeof(to_name))) return NULL;
  if (!check_napi(
        env,
        napi_get_undefined(env, &result),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy rename result could not be created"
      )) return NULL;
  if (renameat(from_fd, from_name, to_fd, to_name) != 0) {
    return throw_errno(env, "renameat", errno);
  }
  return result;
}

/* mountIdentity(fd) → { available, fsid? } — Darwin f_fsid via fstatfs;
 * typed absence elsewhere (Linux consumers keep /proc mnt_id). */
static napi_value MountIdentity(napi_env env, napi_callback_info info) {
  napi_value argv[2];
  int32_t token;
  int32_t fd;
  deckent_native_state *state;
  napi_value result;
  napi_value value;
  if (!get_exact_legacy_args(env, info, 1u, 2u, argv)
      || !get_fd_arg(env, argv[0], &token)
      || !get_native_state(env, &state)
      || !resolve_legacy_token(env, state, token, &fd)) return NULL;
  if (!check_napi(
        env,
        napi_create_object(env, &result),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy mount result could not be created"
      )) return NULL;
#ifdef __APPLE__
  struct statfs sfs;
  if (fstatfs(fd, &sfs) != 0) return throw_errno(env, "fstatfs", errno);
  char fsid[64];
  snprintf(fsid, sizeof(fsid), "%d:%d", sfs.f_fsid.val[0], sfs.f_fsid.val[1]);
  if (!check_napi(
        env,
        napi_get_boolean(env, true, &value),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy mount availability could not be created"
      ) || !check_napi(
        env,
        define_own_value_status(env, result, "available", value),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy mount availability could not be installed"
      ) || !check_napi(
        env,
        napi_create_string_utf8(env, fsid, NAPI_AUTO_LENGTH, &value),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy mount identity could not be created"
      ) || !check_napi(
        env,
        define_own_value_status(env, result, "fsid", value),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy mount identity could not be installed"
      )) return NULL;
#else
  (void)fd;
  if (!check_napi(
        env,
        napi_get_boolean(env, false, &value),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy mount availability could not be created"
      ) || !check_napi(
        env,
        define_own_value_status(env, result, "available", value),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy mount availability could not be installed"
      )) return NULL;
#endif
  if (!check_napi(
        env,
        napi_object_freeze(env, result),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy mount result could not be frozen"
      )) return NULL;
  return result;
}

/* fdPath(fd) → kernel-verified CURRENT path of an open handle (W3-PR-B slice-2,
 * design §10 step-3: the one primitive consumers need when a path-only API such
 * as SQLite must be handed a path derived from a pinned handle). Darwin:
 * fcntl(F_GETPATH) — the only kernel facility resolving a handle to its live
 * path. Other POSIX: readlink(/proc/self/fd/N), so Linux CI exercises the same
 * op surface the Darwin adapter ships. Never a cached or caller-supplied path. */
static napi_value FdPath(napi_env env, napi_callback_info info) {
  napi_value argv[2];
  int32_t token;
  int32_t fd;
  deckent_native_state *state;
  napi_value result;
  if (!get_exact_legacy_args(env, info, 1u, 2u, argv)
      || !get_fd_arg(env, argv[0], &token)
      || !get_native_state(env, &state)
      || !resolve_legacy_token(env, state, token, &fd)) return NULL;

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
  if ((size_t)len >= sizeof(path) - 1u) {
    return deckent_native_throw(env, "EINVAL", "legacy current path is too long");
  }
  path[len] = '\0';
#endif
  if (!check_napi(
        env,
        napi_create_string_utf8(env, path, NAPI_AUTO_LENGTH, &result),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy current path result could not be created"
      )) return NULL;
  return result;
}

/* hostBootIdentity() → { available, hostUuid?, bootTime? } (Darwin only). */
static napi_value HostBootIdentity(napi_env env, napi_callback_info info) {
  napi_value argv[1];
  napi_value result;
  napi_value value;
  if (!get_exact_legacy_args(env, info, 0u, 1u, argv)) return NULL;
  if (!check_napi(
        env,
        napi_create_object(env, &result),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy boot identity result could not be created"
      )) return NULL;
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

  if (!check_napi(
        env,
        napi_get_boolean(env, true, &value),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy boot availability could not be created"
      ) || !check_napi(
        env,
        define_own_value_status(env, result, "available", value),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy boot availability could not be installed"
      ) || !check_napi(
        env,
        napi_create_string_utf8(env, uuid_str, NAPI_AUTO_LENGTH, &value),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy host UUID could not be created"
      ) || !check_napi(
        env,
        define_own_value_status(env, result, "hostUuid", value),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy host UUID could not be installed"
      ) || !check_napi(
        env,
        napi_create_string_utf8(env, boot, NAPI_AUTO_LENGTH, &value),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy boot time could not be created"
      ) || !check_napi(
        env,
        define_own_value_status(env, result, "bootTime", value),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy boot time could not be installed"
      )) return NULL;
#else
  if (!check_napi(
        env,
        napi_get_boolean(env, false, &value),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy boot availability could not be created"
      ) || !check_napi(
        env,
        define_own_value_status(env, result, "available", value),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy boot availability could not be installed"
      )) return NULL;
#endif
  if (!check_napi(
        env,
        napi_object_freeze(env, result),
        "E_EXEC_AUTH_NATIVE_INIT",
        "legacy boot identity result could not be frozen"
      )) return NULL;
  return result;
}

#else

static napi_value LegacyUnavailable(napi_env env, napi_callback_info info) {
  (void)info;
  return deckent_native_throw(
    env,
    "E_EXEC_AUTH_NATIVE_FEATURE_UNAVAILABLE",
    "legacy POSIX execution authority is unavailable on this platform"
  );
}

#endif

static bool check_napi(
  napi_env env,
  napi_status status,
  const char *code,
  const char *message
) {
  if (status == napi_ok) return true;
  deckent_native_throw(env, code, message);
  return false;
}

typedef struct deckent_custody_input_contract {
  deckent_custody_operation operation;
  const char *const *keys;
  size_t key_count;
} deckent_custody_input_contract;

static const deckent_custody_input_contract *custody_input_contract(
  deckent_custody_operation operation
) {
  static const char *const probe_keys[] = { "handle" };
  static const char *const root_separation_keys[] = {
    "custodyRoot", "canonicalProjectRoot"
  };
  static const char *const open_root_keys[] = {
    "path", "disposition", "privacyPolicy"
  };
  static const char *const open_at_keys[] = {
    "parent", "name", "disposition", "privacyPolicy"
  };
  static const char *const begin_publication_keys[] = {
    "parent", "name", "maxBytes"
  };
  static const char *const append_publication_keys[] = {
    "publication", "bytes"
  };
  static const char *const publication_keys[] = { "publication" };
  static const char *const read_bounded_keys[] = { "file", "maxBytes" };
  static const char *const scan_directory_keys[] = {
    "directory", "maxEntries", "maxNameBytes", "deadlineUnixMs"
  };
  static const char *const handle_keys[] = { "handle" };
  static const deckent_custody_input_contract contracts[] = {
    { DECKENT_CUSTODY_OPERATION_PROBE, probe_keys, 1u },
    { DECKENT_CUSTODY_OPERATION_OPEN_ROOT, open_root_keys, 3u },
    { DECKENT_CUSTODY_OPERATION_OPEN_DIRECTORY_AT, open_at_keys, 4u },
    { DECKENT_CUSTODY_OPERATION_OPEN_FILE_AT, open_at_keys, 4u },
    { DECKENT_CUSTODY_OPERATION_BEGIN_PUBLICATION,
      begin_publication_keys, 3u },
    { DECKENT_CUSTODY_OPERATION_APPEND_PUBLICATION,
      append_publication_keys, 2u },
    { DECKENT_CUSTODY_OPERATION_SEAL_PUBLICATION, publication_keys, 1u },
    { DECKENT_CUSTODY_OPERATION_ABORT_PUBLICATION, publication_keys, 1u },
    { DECKENT_CUSTODY_OPERATION_READ_BOUNDED, read_bounded_keys, 2u },
    { DECKENT_CUSTODY_OPERATION_SCAN_DIRECTORY_BOUNDED,
      scan_directory_keys, 4u },
    { DECKENT_CUSTODY_OPERATION_IDENTITY, handle_keys, 1u },
    { DECKENT_CUSTODY_OPERATION_APPLY_PRIVATE, handle_keys, 1u },
    { DECKENT_CUSTODY_OPERATION_SYNC, handle_keys, 1u },
    { DECKENT_CUSTODY_OPERATION_PROVE_ROOT_SEPARATION,
      root_separation_keys, 2u },
  };
  size_t index;
  for (index = 0u; index < sizeof(contracts) / sizeof(contracts[0]); index += 1u) {
    if (contracts[index].operation == operation) return &contracts[index];
  }
  return NULL;
}


static bool native_exact_key_set(
  napi_env env,
  napi_value object,
  const char *const *expected,
  uint32_t expected_count
) {
  napi_value names;
  uint32_t count = 0u;
  uint32_t index;
  if (napi_get_all_property_names(
        env,
        object,
        napi_key_own_only,
        napi_key_all_properties,
        napi_key_numbers_to_strings,
        &names
      ) != napi_ok
      || napi_get_array_length(env, names, &count) != napi_ok
      || count != expected_count) return false;
  for (index = 0u; index < count; index += 1u) {
    napi_value key;
    napi_valuetype type;
    size_t length = 0u;
    size_t copied = 0u;
    char name[DECKENT_OPERATION_NAME_CAPACITY];
    uint32_t expected_index;
    bool matched = false;
    if (napi_get_element(env, names, index, &key) != napi_ok
        || napi_typeof(env, key, &type) != napi_ok
        || type != napi_string
        || napi_get_value_string_utf8(env, key, NULL, 0u, &length) != napi_ok
        || length == 0u || length >= sizeof(name)
        || napi_get_value_string_utf8(
          env, key, name, sizeof(name), &copied
        ) != napi_ok
        || copied != length || strlen(name) != length) return false;
    for (expected_index = 0u;
         expected_index < expected_count;
         expected_index += 1u) {
      if (strcmp(name, expected[expected_index]) == 0) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}

bool deckent_native_get_own_value(
  napi_env env,
  napi_value object,
  const char *name,
  napi_value *value
) {
  napi_value key;
  bool has = false;
  return napi_create_string_utf8(env, name, NAPI_AUTO_LENGTH, &key) == napi_ok
    && napi_has_own_property(env, object, key, &has) == napi_ok
    && has
    && napi_get_named_property(env, object, name, value) == napi_ok;
}

static bool attest_dispatch_input_handle(
  napi_env env,
  deckent_native_state *state,
  napi_value snapshot,
  const char *field,
  deckent_native_handle_kind expected_kind,
  uint32_t required_rights,
  uint32_t accepted_states,
  bool allow_directory_parent
) {
  napi_value value;
  deckent_native_handle_token *token;
  deckent_native_handle_slot *slot;
  if (!deckent_native_get_own_value(env, snapshot, field, &value)
      || !resolve_native_handle(
        env, state, value, expected_kind, required_rights, accepted_states,
        &token, &slot
      )) return false;
  if (!has_exact_rights_for_kind(token->kind, token->rights)
      || slot->rights != token->rights) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_RIGHTS",
      "custody input handle rights are not exact for its kind"
    );
    return false;
  }
  if (allow_directory_parent
      && token->kind != DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY
      && token->kind != DECKENT_NATIVE_HANDLE_DIRECTORY) {
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_KIND",
      "custody parent must be an exact directory authority"
    ) == NULL;
  }
  state->active_input_slot_index = token->slot_index;
  state->active_input_generation = token->generation;
  state->active_input_kind = token->kind;
  state->active_input_rights = token->rights;
  state->active_input_states = slot->state;
  state->active_input_attested = true;
  return true;
}

static bool attest_dispatch_input(
  napi_env env,
  deckent_native_state *state,
  deckent_custody_operation operation,
  napi_value snapshot
) {
  state->active_input_attested = false;
  switch (operation) {
    case DECKENT_CUSTODY_OPERATION_OPEN_ROOT:
      return true;
    case DECKENT_CUSTODY_OPERATION_PROVE_ROOT_SEPARATION:
      return attest_dispatch_input_handle(
        env, state, snapshot, "custodyRoot",
        DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY,
        DECKENT_NATIVE_RIGHT_TRAVERSE | DECKENT_NATIVE_RIGHT_IDENTITY,
        DECKENT_NATIVE_HANDLE_STATE_OPEN, false
      );
    case DECKENT_CUSTODY_OPERATION_OPEN_DIRECTORY_AT:
    case DECKENT_CUSTODY_OPERATION_OPEN_FILE_AT:
      return attest_dispatch_input_handle(
        env, state, snapshot, "parent", DECKENT_NATIVE_HANDLE_ANY,
        DECKENT_NATIVE_RIGHT_TRAVERSE, DECKENT_NATIVE_HANDLE_STATE_OPEN,
        true
      );
    case DECKENT_CUSTODY_OPERATION_BEGIN_PUBLICATION:
      return attest_dispatch_input_handle(
        env, state, snapshot, "parent", DECKENT_NATIVE_HANDLE_ANY,
        DECKENT_NATIVE_RIGHT_PUBLISH, DECKENT_NATIVE_HANDLE_STATE_OPEN,
        true
      );
    case DECKENT_CUSTODY_OPERATION_APPEND_PUBLICATION:
      return attest_dispatch_input_handle(
        env, state, snapshot, "publication",
        DECKENT_NATIVE_HANDLE_PUBLICATION, DECKENT_NATIVE_RIGHT_APPEND,
        DECKENT_NATIVE_HANDLE_STATE_OPEN, false
      );
    case DECKENT_CUSTODY_OPERATION_SEAL_PUBLICATION:
      return attest_dispatch_input_handle(
        env, state, snapshot, "publication",
        DECKENT_NATIVE_HANDLE_PUBLICATION, DECKENT_NATIVE_RIGHT_PUBLISH,
        DECKENT_NATIVE_HANDLE_STATE_OPEN, false
      );
    case DECKENT_CUSTODY_OPERATION_ABORT_PUBLICATION:
      return attest_dispatch_input_handle(
        env, state, snapshot, "publication",
        DECKENT_NATIVE_HANDLE_PUBLICATION, DECKENT_NATIVE_RIGHT_ABORT,
        DECKENT_NATIVE_HANDLE_STATE_OPEN
          | DECKENT_NATIVE_HANDLE_STATE_APPEND_FAILED, false
      );
    case DECKENT_CUSTODY_OPERATION_READ_BOUNDED:
      return attest_dispatch_input_handle(
        env, state, snapshot, "file", DECKENT_NATIVE_HANDLE_READ_FILE,
        DECKENT_NATIVE_RIGHT_READ | DECKENT_NATIVE_RIGHT_IDENTITY,
        DECKENT_NATIVE_HANDLE_STATE_OPEN, false
      );
    case DECKENT_CUSTODY_OPERATION_SCAN_DIRECTORY_BOUNDED:
      return attest_dispatch_input_handle(
        env, state, snapshot, "directory", DECKENT_NATIVE_HANDLE_ANY,
        DECKENT_NATIVE_RIGHT_TRAVERSE | DECKENT_NATIVE_RIGHT_IDENTITY,
        DECKENT_NATIVE_HANDLE_STATE_OPEN, true
      );
    case DECKENT_CUSTODY_OPERATION_PROBE:
    case DECKENT_CUSTODY_OPERATION_IDENTITY:
      return attest_dispatch_input_handle(
        env, state, snapshot, "handle", DECKENT_NATIVE_HANDLE_ANY,
        DECKENT_NATIVE_RIGHT_IDENTITY, DECKENT_NATIVE_HANDLE_STATE_OPEN
          | DECKENT_NATIVE_HANDLE_STATE_PUBLISHED_UNCONFIRMED
          | DECKENT_NATIVE_HANDLE_STATE_APPEND_FAILED, false
      );
    case DECKENT_CUSTODY_OPERATION_APPLY_PRIVATE:
      return attest_dispatch_input_handle(
        env, state, snapshot, "handle", DECKENT_NATIVE_HANDLE_ANY,
        DECKENT_NATIVE_RIGHT_APPLY_PRIVATE, DECKENT_NATIVE_HANDLE_STATE_OPEN,
        false
      );
    case DECKENT_CUSTODY_OPERATION_SYNC:
      return attest_dispatch_input_handle(
        env, state, snapshot, "handle", DECKENT_NATIVE_HANDLE_ANY,
        DECKENT_NATIVE_RIGHT_SYNC, DECKENT_NATIVE_HANDLE_STATE_OPEN,
        false
      );
    default:
      return false;
  }
}

static deckent_common_open_result_state inspect_open_result_state(
  napi_env env,
  deckent_native_state *state,
  napi_value result
) {
  napi_value lifecycle_state;
  napi_value expected;
  bool same = false;
  if (state == NULL || state->env != env || state->instance_finalized
      || !deckent_native_get_own_value(env, result, "state", &lifecycle_state)
      || napi_create_string_utf8(env, "CREATED", NAPI_AUTO_LENGTH, &expected)
        != napi_ok
      || napi_strict_equals(env, lifecycle_state, expected, &same) != napi_ok) {
    return DECKENT_COMMON_OPEN_RESULT_INVALID;
  }
  if (same) return DECKENT_COMMON_OPEN_RESULT_CREATED;
  if (napi_create_string_utf8(env, "OPENED", NAPI_AUTO_LENGTH, &expected)
        != napi_ok
      || napi_strict_equals(env, lifecycle_state, expected, &same) != napi_ok) {
    return DECKENT_COMMON_OPEN_RESULT_INVALID;
  }
  return same
    ? DECKENT_COMMON_OPEN_RESULT_OPENED
    : DECKENT_COMMON_OPEN_RESULT_INVALID;
}

static bool created_result_shape_is_exact(
  napi_env env,
  deckent_native_state *state,
  napi_value result,
  napi_value created_handle
) {
  static const char *const keys[] = {
    "schemaVersion", "kind", "state", "handle", "identity",
  };
  napi_value schema_version;
  napi_value expected_schema_version;
  napi_value kind;
  napi_value expected_kind;
  napi_value lifecycle_state;
  napi_value expected_lifecycle_state;
  napi_value exposed_handle;
  napi_value identity;
  napi_valuetype result_type;
  napi_valuetype identity_type;
  bool same = false;
  bool result_is_array = false;
  bool identity_is_array = false;
  if (state == NULL || state->env != env || state->instance_finalized
      || napi_typeof(env, result, &result_type) != napi_ok
      || result_type != napi_object
      || napi_is_array(env, result, &result_is_array) != napi_ok || result_is_array
      || !native_exact_key_set(env, result, keys, 5u)
      || !deckent_native_get_own_value(env, result, "schemaVersion", &schema_version)
      || napi_create_uint32(env, 1u, &expected_schema_version) != napi_ok
      || napi_strict_equals(env, schema_version, expected_schema_version, &same) != napi_ok
      || !same
      || !deckent_native_get_own_value(env, result, "kind", &kind)
      || napi_create_string_utf8(env, "custody-open", NAPI_AUTO_LENGTH, &expected_kind)
        != napi_ok
      || napi_strict_equals(env, kind, expected_kind, &same) != napi_ok || !same
      || !deckent_native_get_own_value(env, result, "state", &lifecycle_state)
      || napi_create_string_utf8(env, "CREATED", NAPI_AUTO_LENGTH,
        &expected_lifecycle_state) != napi_ok
      || napi_strict_equals(env, lifecycle_state, expected_lifecycle_state, &same)
        != napi_ok || !same
      || !deckent_native_get_own_value(env, result, "handle", &exposed_handle)
      || napi_strict_equals(env, exposed_handle, created_handle, &same) != napi_ok
      || !same
      || !deckent_native_get_own_value(env, result, "identity", &identity)
      || napi_typeof(env, identity, &identity_type) != napi_ok
      || identity_type != napi_object
      || napi_is_array(env, identity, &identity_is_array) != napi_ok
      || identity_is_array) return false;
  return true;
}

static void discard_input_snapshot_token_or_fatal(
  napi_env env,
  deckent_native_state *state,
  napi_value snapshot,
  deckent_native_input_token *token
) {
  void *removed = NULL;
  bool pending = false;
  napi_value discarded;
  if (napi_is_exception_pending(env, &pending) != napi_ok
      || (pending
        && napi_get_and_clear_last_exception(env, &discarded) != napi_ok)
      || napi_remove_wrap(env, snapshot, &removed) != napi_ok
      || removed != token
      || state == NULL
      || state->input_token_count == 0u) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "custody input token rollback failed",
      NAPI_AUTO_LENGTH
    );
  }
  state->input_token_count -= 1u;
  free(token);
}

static bool create_custody_input_snapshot(
  napi_env env,
  deckent_native_state *state,
  deckent_custody_operation operation,
  size_t field_count,
  napi_value *fields,
  napi_value *snapshot
) {
  const deckent_custody_input_contract *contract = custody_input_contract(operation);
  uint32_t index;
  deckent_native_input_token *token;
  napi_status status;
  if (contract == NULL
      || state == NULL
      || state->env != env
      || state->instance_finalized
      || snapshot == NULL
      || fields == NULL
      || field_count != contract->key_count) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "custody operation positional arity is invalid"
    );
    return false;
  }
  if (napi_create_object(env, snapshot) != napi_ok) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "custody input snapshot allocation failed"
    );
    return false;
  }
  for (index = 0u; index < contract->key_count; index += 1u) {
    if (define_own_value_status(
          env,
          *snapshot,
          contract->keys[index],
          fields[index]
        ) != napi_ok) {
      deckent_native_throw(
        env,
        "E_EXEC_AUTH_NATIVE_ARGUMENT",
        "custody positional snapshot field could not be defined"
      );
      return false;
    }
  }
  if (state->input_token_count == UINT32_MAX) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_LIMIT",
      "custody input token capacity is exhausted"
    );
    return false;
  }
  token = (deckent_native_input_token *)calloc(1u, sizeof(*token));
  if (token == NULL) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "custody input token allocation failed"
    );
    return false;
  }
  token->owner = state;
  token->operation = operation;
  status = napi_type_tag_object(env, *snapshot, &DECKENT_CUSTODY_INPUT_TAG);
  if (status == napi_ok) {
    status = napi_wrap(
      env,
      *snapshot,
      token,
      native_input_finalize,
      NULL,
      NULL
    );
  }
  if (status != napi_ok) {
    free(token);
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "custody input snapshot provenance could not be installed"
    );
    return false;
  }
  state->input_token_count += 1u;
  if (napi_object_freeze(env, *snapshot) != napi_ok) {
    discard_input_snapshot_token_or_fatal(env, state, *snapshot, token);
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "custody input snapshot could not be frozen"
    );
    return false;
  }
  return true;
}

bool deckent_native_require_input_snapshot(
  napi_env env,
  deckent_native_state *state,
  napi_value input,
  deckent_custody_operation expected_operation
) {
  napi_valuetype type;
  bool tagged = false;
  deckent_native_input_token *token = NULL;
  if (state == NULL
      || state->env != env
      || state->instance_finalized
      || state->input_token_count == 0u
      || expected_operation < DECKENT_CUSTODY_OPERATION_PROBE
      || expected_operation > DECKENT_CUSTODY_OPERATION_SCAN_DIRECTORY_BOUNDED
      || napi_typeof(env, input, &type) != napi_ok
      || type != napi_object
      || napi_check_object_type_tag(
        env,
        input,
        &DECKENT_CUSTODY_INPUT_TAG,
        &tagged
      ) != napi_ok
      || !tagged
      || napi_unwrap(env, input, (void **)&token) != napi_ok
      || token == NULL
      || token->owner != state
      || token->operation != expected_operation) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "custody backend input snapshot provenance is invalid"
    );
    return false;
  }
  return true;
}

typedef struct deckent_effect_input_contract {
  deckent_effect_operation operation;
  const char *const *keys;
  size_t key_count;
} deckent_effect_input_contract;

static const deckent_effect_input_contract *effect_input_contract(
  deckent_effect_operation operation
) {
  static const char *const open_root[] = { "rootKind", "path" };
  static const char *const capture_tree[] = { "root", "limits", "cancelState" };
  static const char *const inspect_entry[] = { "root", "path" };
  static const char *const begin_stage[] = {
    "stagingRoot", "totalBytes", "contentDigest"
  };
  static const char *const append_stage[] = { "stagedContent", "bytes" };
  static const char *const seal_stage[] = { "stagedContent" };
  static const char *const apply[] = {
    "projectRoot", "operationEnvelope", "stagedContent"
  };
  static const char *const verify[] = { "projectRoot", "planEnvelope" };
  static const char *const begin_source_read[] = {
    "workspaceRoot", "path", "expectedMode", "expectedSize",
    "expectedContentDigest", "deadlineUnixMs", "maxChunkBytes"
  };
  static const char *const next_source_chunk[] = { "sourceRead", "cancelState" };
  static const char *const finish_source_read[] = { "sourceRead" };
  static const deckent_effect_input_contract contracts[] = {
    { DECKENT_EFFECT_OPERATION_OPEN_ROOT, open_root, 2u },
    { DECKENT_EFFECT_OPERATION_CAPTURE_TREE, capture_tree, 3u },
    { DECKENT_EFFECT_OPERATION_INSPECT_ENTRY, inspect_entry, 2u },
    { DECKENT_EFFECT_OPERATION_BEGIN_STAGE, begin_stage, 3u },
    { DECKENT_EFFECT_OPERATION_APPEND_STAGE, append_stage, 2u },
    { DECKENT_EFFECT_OPERATION_SEAL_STAGE, seal_stage, 1u },
    { DECKENT_EFFECT_OPERATION_APPLY_OPERATION, apply, 3u },
    { DECKENT_EFFECT_OPERATION_RECONCILE_OPERATION, apply, 3u },
    { DECKENT_EFFECT_OPERATION_VERIFY_POSTIMAGES, verify, 2u },
    { DECKENT_EFFECT_OPERATION_BEGIN_SOURCE_READ, begin_source_read, 7u },
    { DECKENT_EFFECT_OPERATION_NEXT_SOURCE_CHUNK, next_source_chunk, 2u },
    { DECKENT_EFFECT_OPERATION_FINISH_SOURCE_READ, finish_source_read, 1u },
  };
  size_t index;
  for (index = 0u; index < sizeof(contracts) / sizeof(contracts[0]); index += 1u) {
    if (contracts[index].operation == operation) return &contracts[index];
  }
  return NULL;
}

static bool create_effect_input_snapshot(
  napi_env env,
  deckent_native_state *state,
  deckent_effect_operation operation,
  size_t field_count,
  napi_value *fields,
  napi_value *snapshot
) {
  const deckent_effect_input_contract *contract = effect_input_contract(operation);
  deckent_effect_input_token *token;
  napi_status status;
  uint32_t index;
  if (contract == NULL || state == NULL || state->env != env
      || state->instance_finalized || fields == NULL || snapshot == NULL
      || field_count != contract->key_count) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "execution-effect positional arity is invalid");
    return false;
  }
  if (napi_create_object(env, snapshot) != napi_ok) return false;
  for (index = 0u; index < contract->key_count; index += 1u) {
    if (define_own_value_status(env, *snapshot, contract->keys[index],
          fields[index]) != napi_ok) {
      deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_ARGUMENT",
        "execution-effect positional snapshot could not be created");
      return false;
    }
  }
  if (state->effect.input_token_count == UINT32_MAX) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_HANDLE_LIMIT",
      "execution-effect input token capacity is exhausted");
    return false;
  }
  token = (deckent_effect_input_token *)calloc(1u, sizeof(*token));
  if (token == NULL) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "execution-effect input token allocation failed");
    return false;
  }
  token->owner = state;
  token->operation = operation;
  status = napi_type_tag_object(env, *snapshot, &DECKENT_EFFECT_INPUT_TAG);
  if (status == napi_ok) status = napi_wrap(env, *snapshot, token,
    effect_input_finalize, NULL, NULL);
  if (status != napi_ok) {
    free(token);
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "execution-effect input provenance could not be installed");
    return false;
  }
  state->effect.input_token_count += 1u;
  if (napi_object_freeze(env, *snapshot) != napi_ok) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "execution-effect input snapshot could not be frozen");
    return false;
  }
  return true;
}

bool deckent_effect_require_input_snapshot(
  napi_env env,
  deckent_native_state *state,
  napi_value input,
  deckent_effect_operation expected_operation
) {
  napi_valuetype type;
  bool tagged = false;
  deckent_effect_input_token *token = NULL;
  if (state == NULL || state->env != env || state->instance_finalized
      || state->effect.input_token_count == 0u
      || napi_typeof(env, input, &type) != napi_ok || type != napi_object
      || napi_check_object_type_tag(env, input, &DECKENT_EFFECT_INPUT_TAG,
        &tagged) != napi_ok || !tagged
      || napi_unwrap(env, input, (void **)&token) != napi_ok || token == NULL
      || token->owner != state || token->operation != expected_operation) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "execution-effect input snapshot provenance is invalid");
    return false;
  }
  return true;
}

static const deckent_effect_backend_v2 *compiled_effect_backend(void) {
#if defined(DECKENT_EXEC_AUTHORITY_HAS_POSIX_BACKEND) && defined(__linux__)
  return deckent_effect_linux_backend_v2();
#else
  return NULL;
#endif
}

static bool validate_effect_backend(
  napi_env env,
  const deckent_effect_backend_v2 *backend
) {
#if defined(__linux__)
  if (backend == NULL || backend->struct_size != (uint32_t)sizeof(*backend)
      || backend->abi_version != DECKENT_EXECUTION_EFFECT_ABI_VERSION_NUMBER
      || backend->platform != DECKENT_NATIVE_PLATFORM_LINUX
      || backend->trust_domain == NULL
      || strcmp(backend->trust_domain, DECKENT_EXECUTION_EFFECT_FEATURE_LINUX) != 0
      || backend->invoke == NULL) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "Linux execution-effect backend ABI is invalid");
    return false;
  }
#else
  if (backend != NULL) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "execution-effect backend is forbidden on this platform");
    return false;
  }
#endif
  return true;
}

static const deckent_custody_backend_v1 *compiled_backend(void) {
#if defined(DECKENT_EXEC_AUTHORITY_HAS_POSIX_BACKEND)
  return deckent_custody_posix_backend_v1();
#elif defined(DECKENT_EXEC_AUTHORITY_HAS_WIN32_BACKEND)
  return deckent_custody_win32_backend_v1();
#else
  return NULL;
#endif
}

static bool validate_backend(
  napi_env env,
  const deckent_custody_backend_v1 *backend
) {
  uint32_t expected_feature;
  const bool backend_required =
    DECKENT_COMPILED_PLATFORM != DECKENT_NATIVE_PLATFORM_UNSUPPORTED;
  if (backend == NULL) {
    if (!backend_required) return true;
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "compiled custody backend registration is unavailable"
    );
    return false;
  }
  if (backend->platform == DECKENT_NATIVE_PLATFORM_LINUX
      || backend->platform == DECKENT_NATIVE_PLATFORM_DARWIN) {
    expected_feature = DECKENT_NATIVE_FEATURE_CUSTODY_POSIX;
  } else if (backend->platform == DECKENT_NATIVE_PLATFORM_WIN32) {
    expected_feature = DECKENT_NATIVE_FEATURE_CUSTODY_WIN32;
  } else {
    expected_feature = DECKENT_NATIVE_FEATURE_NONE;
  }
  if (backend->struct_size != (uint32_t)sizeof(*backend)
      || backend->abi_version != DECKENT_EXEC_AUTHORITY_ABI_VERSION_NUMBER
      || backend->platform != DECKENT_COMPILED_PLATFORM
      || expected_feature == DECKENT_NATIVE_FEATURE_NONE
      || backend->feature_bits != expected_feature
      || backend->invoke == NULL) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "custody backend does not match the compiled execution authority ABI"
    );
    return false;
  }
  return true;
}

static bool parse_custody_operation(
  napi_env env,
  napi_value value,
  deckent_custody_operation *operation
) {
  static const struct {
    const char *name;
    deckent_custody_operation operation;
  } operations[] = {
    { DECKENT_CUSTODY_OPERATION_NAME_PROBE, DECKENT_CUSTODY_OPERATION_PROBE },
    { DECKENT_CUSTODY_OPERATION_NAME_OPEN_ROOT, DECKENT_CUSTODY_OPERATION_OPEN_ROOT },
    { DECKENT_CUSTODY_OPERATION_NAME_OPEN_DIRECTORY_AT,
      DECKENT_CUSTODY_OPERATION_OPEN_DIRECTORY_AT },
    { DECKENT_CUSTODY_OPERATION_NAME_OPEN_FILE_AT,
      DECKENT_CUSTODY_OPERATION_OPEN_FILE_AT },
    { DECKENT_CUSTODY_OPERATION_NAME_BEGIN_PUBLICATION,
      DECKENT_CUSTODY_OPERATION_BEGIN_PUBLICATION },
    { DECKENT_CUSTODY_OPERATION_NAME_APPEND_PUBLICATION,
      DECKENT_CUSTODY_OPERATION_APPEND_PUBLICATION },
    { DECKENT_CUSTODY_OPERATION_NAME_SEAL_PUBLICATION,
      DECKENT_CUSTODY_OPERATION_SEAL_PUBLICATION },
    { DECKENT_CUSTODY_OPERATION_NAME_ABORT_PUBLICATION,
      DECKENT_CUSTODY_OPERATION_ABORT_PUBLICATION },
    { DECKENT_CUSTODY_OPERATION_NAME_READ_BOUNDED,
      DECKENT_CUSTODY_OPERATION_READ_BOUNDED },
    { DECKENT_CUSTODY_OPERATION_NAME_SCAN_DIRECTORY_BOUNDED,
      DECKENT_CUSTODY_OPERATION_SCAN_DIRECTORY_BOUNDED },
    { DECKENT_CUSTODY_OPERATION_NAME_IDENTITY,
      DECKENT_CUSTODY_OPERATION_IDENTITY },
    { DECKENT_CUSTODY_OPERATION_NAME_APPLY_PRIVATE,
      DECKENT_CUSTODY_OPERATION_APPLY_PRIVATE },
    { DECKENT_CUSTODY_OPERATION_NAME_SYNC, DECKENT_CUSTODY_OPERATION_SYNC },
    { DECKENT_CUSTODY_OPERATION_NAME_PROVE_ROOT_SEPARATION,
      DECKENT_CUSTODY_OPERATION_PROVE_ROOT_SEPARATION },
  };
  napi_valuetype type;
  char name[DECKENT_OPERATION_NAME_CAPACITY];
  size_t length = 0u;
  size_t copied = 0u;
  size_t index;
  if (napi_typeof(env, value, &type) != napi_ok || type != napi_string) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "custody operation must be a string"
    );
    return false;
  }
  if (napi_get_value_string_utf8(env, value, NULL, 0u, &length) != napi_ok
      || length == 0u
      || length >= sizeof(name)
      || napi_get_value_string_utf8(
           env,
           value,
           name,
           sizeof(name),
           &copied
         ) != napi_ok
      || copied != length
      || strlen(name) != length) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "custody operation string is invalid"
    );
    return false;
  }
  for (index = 0u; index < sizeof(operations) / sizeof(operations[0]); index += 1u) {
    if (strcmp(name, operations[index].name) == 0) {
      *operation = operations[index].operation;
      return true;
    }
  }
  deckent_native_throw(
    env,
    "E_EXEC_AUTH_NATIVE_OPERATION",
    "custody operation is not part of this ABI"
  );
  return false;
}

static napi_value CustodyInvoke(napi_env env, napi_callback_info info) {
  size_t argc = 5u;
  napi_value argv[5];
  deckent_native_state *state;
  deckent_custody_operation operation;
  const deckent_custody_input_contract *contract;
  napi_value input_snapshot;
  napi_value result;
  napi_value accepted_result;
  napi_value discarded_exception;
  napi_valuetype result_type;
  bool pending = false;
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok
      || argc < 1u) {
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "custodyInvoke requires an operation and its exact positional fields"
    );
  }
  if (!get_native_state(env, &state)) return NULL;
  if (active_result_transfer_is_armed(state)) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "a new custody invocation reached an unresolved result transfer",
      NAPI_AUTO_LENGTH
    );
  }
  if (!parse_custody_operation(env, argv[0], &operation)) return NULL;
  contract = custody_input_contract(operation);
  if (contract == NULL || argc - 1u != contract->key_count) {
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "custodyInvoke positional field order or arity is invalid"
    );
  }
  if (state->backend_invocation_active
      || state->outstanding_borrow_count != 0u
      || state->created_result_guards != NULL) {
    if (!reject_all_created_result_guards(env, state)) return NULL;
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "a prior custody invocation left an unaccepted created-result guard"
    );
  }
  if (state->backend == NULL) {
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_FEATURE_UNAVAILABLE",
      "custody backend is unavailable on this build"
    );
  }
  if (operation == DECKENT_CUSTODY_OPERATION_PROVE_ROOT_SEPARATION
      && state->backend->platform == DECKENT_NATIVE_PLATFORM_WIN32) {
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_FEATURE_UNAVAILABLE",
      "root-separation proof is unsupported by this custody backend"
    );
  }
  if (!create_custody_input_snapshot(
        env,
        state,
        operation,
        argc - 1u,
        &argv[1],
        &input_snapshot
      ) || !deckent_native_require_input_snapshot(
        env,
        state,
        input_snapshot,
        operation
      )
      || !attest_dispatch_input(env, state, operation, input_snapshot)) {
    return NULL;
  }
  if (state->next_invocation_id == UINT64_MAX) {
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_LIMIT",
      "custody invocation ledger capacity is exhausted"
    );
  }
  state->active_invocation_id = state->next_invocation_id + 1u;
  state->next_invocation_id = state->active_invocation_id;
  state->backend_invocation_active = true;
  result = state->backend->invoke(
    env,
    state,
    operation,
    1u,
    &input_snapshot
  );
  state->backend_invocation_active = false;
  if (state->outstanding_borrow_count != 0u) {
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "custody backend returned with an outstanding handle borrow",
      NAPI_AUTO_LENGTH
    );
  }
  if (active_result_transfer_is_armed(state)) {
    if (napi_is_exception_pending(env, &pending) != napi_ok) {
      napi_fatal_error(
        "deckent.exec-authority",
        NAPI_AUTO_LENGTH,
        "bound result transfer exception state is unavailable",
        NAPI_AUTO_LENGTH
      );
    }
    if (pending
        && napi_get_and_clear_last_exception(env, &discarded_exception)
          != napi_ok) {
      napi_fatal_error(
        "deckent.exec-authority",
        NAPI_AUTO_LENGTH,
        "bound result transfer exception could not be cleared",
        NAPI_AUTO_LENGTH
      );
    }
    if (!settle_active_result_transfer(
          env,
          state,
          !pending
            && result_is_active_transfer_primary(env, state, result)
            && active_transfer_input_matches_snapshot(
              env,
              state,
              input_snapshot
            ),
          &accepted_result
        )) return NULL;
    return accepted_result;
  }
  if (sanitize_backend_pending_exception(env, state)) return NULL;
  if (!returned_result_owns_only_created_guard(env, state, result)) {
    if (!reject_all_created_result_guards(env, state)) return NULL;
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "custody invocation did not return its exact guarded created result"
    );
  }
  if (result == NULL) {
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "custody backend returned no result and no typed failure"
    );
  }
  if (napi_typeof(env, result, &result_type) != napi_ok
      || result_type != napi_object) {
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "custody backend returned a non-object result"
    );
  }
  if (operation == DECKENT_CUSTODY_OPERATION_BEGIN_PUBLICATION) {
    deckent_native_handle_token *token;
    deckent_native_handle_slot *slot;
    bool created_guard_present = false;
    const uint32_t required_rights = DECKENT_NATIVE_RIGHT_APPEND
      | DECKENT_NATIVE_RIGHT_IDENTITY
      | DECKENT_NATIVE_RIGHT_APPLY_PRIVATE
      | DECKENT_NATIVE_RIGHT_SYNC
      | DECKENT_NATIVE_RIGHT_PUBLISH
      | DECKENT_NATIVE_RIGHT_ABORT;
    if (!reject_created_result_guard_if_present(
          env,
          result,
          &created_guard_present
        )) return NULL;
    if (created_guard_present) {
      return deckent_native_throw(
        env,
        "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
        "begin-publication returned a created-result record"
      );
    }
    if (!resolve_native_handle(
          env,
          state,
          result,
          DECKENT_NATIVE_HANDLE_PUBLICATION,
          required_rights,
          DECKENT_NATIVE_HANDLE_STATE_OPEN,
          &token,
          &slot
        )) return NULL;
    return result;
  }
  if (!consume_finalized_result_record(
        env,
        result,
        operation,
        input_snapshot,
        &accepted_result
      )) {
    bool pending = false;
    if (napi_is_exception_pending(env, &pending) != napi_ok) {
      napi_fatal_error(
        "deckent.exec-authority",
        NAPI_AUTO_LENGTH,
        "created-result rejection exception state is unavailable",
        NAPI_AUTO_LENGTH
      );
    }
    if (pending) return NULL;
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "custody backend returned an unfinalized result record"
    );
  }
  return accepted_result;
}

static bool parse_effect_operation(
  napi_env env,
  napi_value value,
  deckent_effect_operation *operation
) {
  static const struct {
    const char *name;
    deckent_effect_operation operation;
  } operations[] = {
    { DECKENT_EFFECT_OPERATION_NAME_OPEN_ROOT, DECKENT_EFFECT_OPERATION_OPEN_ROOT },
    { DECKENT_EFFECT_OPERATION_NAME_CAPTURE_TREE, DECKENT_EFFECT_OPERATION_CAPTURE_TREE },
    { DECKENT_EFFECT_OPERATION_NAME_INSPECT_ENTRY, DECKENT_EFFECT_OPERATION_INSPECT_ENTRY },
    { DECKENT_EFFECT_OPERATION_NAME_BEGIN_STAGE, DECKENT_EFFECT_OPERATION_BEGIN_STAGE },
    { DECKENT_EFFECT_OPERATION_NAME_APPEND_STAGE, DECKENT_EFFECT_OPERATION_APPEND_STAGE },
    { DECKENT_EFFECT_OPERATION_NAME_SEAL_STAGE, DECKENT_EFFECT_OPERATION_SEAL_STAGE },
    { DECKENT_EFFECT_OPERATION_NAME_APPLY_OPERATION, DECKENT_EFFECT_OPERATION_APPLY_OPERATION },
    { DECKENT_EFFECT_OPERATION_NAME_RECONCILE_OPERATION,
      DECKENT_EFFECT_OPERATION_RECONCILE_OPERATION },
    { DECKENT_EFFECT_OPERATION_NAME_VERIFY_POSTIMAGES,
      DECKENT_EFFECT_OPERATION_VERIFY_POSTIMAGES },
    { DECKENT_EFFECT_OPERATION_NAME_BEGIN_SOURCE_READ,
      DECKENT_EFFECT_OPERATION_BEGIN_SOURCE_READ },
    { DECKENT_EFFECT_OPERATION_NAME_NEXT_SOURCE_CHUNK,
      DECKENT_EFFECT_OPERATION_NEXT_SOURCE_CHUNK },
    { DECKENT_EFFECT_OPERATION_NAME_FINISH_SOURCE_READ,
      DECKENT_EFFECT_OPERATION_FINISH_SOURCE_READ },
  };
  napi_valuetype type;
  char name[DECKENT_OPERATION_NAME_CAPACITY];
  size_t length = 0u;
  size_t copied = 0u;
  size_t index;
  if (napi_typeof(env, value, &type) != napi_ok || type != napi_string
      || napi_get_value_string_utf8(env, value, NULL, 0u, &length) != napi_ok
      || length == 0u || length >= sizeof(name)
      || napi_get_value_string_utf8(env, value, name, sizeof(name), &copied) != napi_ok
      || copied != length || strlen(name) != length) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "execution-effect operation is invalid");
    return false;
  }
  for (index = 0u; index < sizeof(operations) / sizeof(operations[0]); index += 1u) {
    if (strcmp(name, operations[index].name) == 0) {
      *operation = operations[index].operation;
      return true;
    }
  }
  deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_OPERATION",
    "execution-effect operation is not part of ABI v2");
  return false;
}

static napi_value EffectInvoke(napi_env env, napi_callback_info info) {
  size_t argc = 4u;
  napi_value argv[4];
  deckent_native_state *state;
  deckent_effect_operation operation;
  const deckent_effect_input_contract *contract;
  napi_value snapshot;
  napi_value result;
  deckent_effect_result_token *token = NULL;
  napi_valuetype result_type;
  bool tagged = false;
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 1u) {
    return deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "effectInvoke requires an operation and exact positional fields");
  }
  if (!get_native_state(env, &state) || !parse_effect_operation(env, argv[0], &operation)) {
    return NULL;
  }
  contract = effect_input_contract(operation);
  if (contract == NULL || argc - 1u != contract->key_count) {
    return deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "effectInvoke positional field order or arity is invalid");
  }
  if (state->effect.backend == NULL) {
    return deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_FEATURE_UNAVAILABLE",
      "execution-effect landing is unsupported on this platform");
  }
  if (state->effect.backend_invocation_active
      || state->effect.outstanding_borrow_count != 0u) {
    return deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "execution-effect invocation ledger is not quiescent");
  }
  if (!create_effect_input_snapshot(env, state, operation, argc - 1u,
        &argv[1], &snapshot)
      || !deckent_effect_require_input_snapshot(env, state, snapshot, operation)) {
    return NULL;
  }
  if (state->effect.next_invocation_id == UINT64_MAX) {
    return deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_HANDLE_LIMIT",
      "execution-effect invocation ledger is exhausted");
  }
  state->effect.active_invocation_id = ++state->effect.next_invocation_id;
  state->effect.backend_invocation_active = true;
  result = state->effect.backend->invoke(env, state, operation, 1u, &snapshot);
  state->effect.backend_invocation_active = false;
  if (state->effect.outstanding_borrow_count != 0u) {
    napi_fatal_error("deckent.execution-effect", NAPI_AUTO_LENGTH,
      "execution-effect backend leaked a handle borrow", NAPI_AUTO_LENGTH);
  }
  if (result == NULL) return NULL;
  if (napi_typeof(env, result, &result_type) != napi_ok || result_type != napi_object
      || napi_check_object_type_tag(env, result, &DECKENT_EFFECT_RESULT_TAG,
        &tagged) != napi_ok || !tagged
      || napi_unwrap(env, result, (void **)&token) != napi_ok || token == NULL
      || token->owner != state || !token->finalized || token->consumed
      || token->operation != operation) {
    return deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "execution-effect backend returned an unauthoritative result");
  }
  token->consumed = true;
  return result;
}

static napi_value EffectCloseHandle(napi_env env, napi_callback_info info) {
  size_t argc = 2u;
  napi_value argv[2];
  napi_value result;
  deckent_native_state *state;
  deckent_native_retire_result retired;
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc != 1u) {
    return deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "effectCloseHandle requires exactly one effect-v2 handle");
  }
  if (!get_native_state(env, &state)
      || napi_get_undefined(env, &result) != napi_ok) return NULL;
  retired = deckent_effect_retire_handle(env, state, argv[0],
    DECKENT_EFFECT_HANDLE_ANY, DECKENT_EFFECT_RIGHT_NONE);
  if (retired == DECKENT_NATIVE_RETIRE_CONFIRMED) return result;
  if (retired == DECKENT_NATIVE_RETIRE_CLEANUP_UNCONFIRMED) {
    return deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED",
      "execution-effect resource cleanup could not be confirmed");
  }
  return NULL;
}

static napi_value CustodyCloseHandle(napi_env env, napi_callback_info info) {
  size_t argc = 2u;
  napi_value argv[2];
  deckent_native_state *state;
  deckent_native_retire_result retired;
  uint32_t retired_state = 0u;
  napi_value result;
  bool pending = false;
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok
      || argc != 1u) {
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "custodyCloseHandle requires exactly one opaque handle"
    );
  }
  if (!get_native_state(env, &state)) return NULL;
  if (!check_napi(
        env,
        napi_get_undefined(env, &result),
        "E_EXEC_AUTH_NATIVE_HANDLE_CONTRACT",
        "custody close result could not be created"
      )) return NULL;
  retired = retire_native_handle_internal(
    env,
    state,
    argv[0],
    DECKENT_NATIVE_HANDLE_ANY,
    DECKENT_NATIVE_RIGHT_NONE,
    DECKENT_NATIVE_HANDLE_STATE_OPEN
      | DECKENT_NATIVE_HANDLE_STATE_PUBLISHED_UNCONFIRMED
      | DECKENT_NATIVE_HANDLE_STATE_APPEND_FAILED
      | DECKENT_NATIVE_HANDLE_STATE_CLEANUP_UNCONFIRMED,
    true,
    &retired_state
  );
  if (retired == DECKENT_NATIVE_RETIRE_CONFIRMED
      && retired_state != DECKENT_NATIVE_HANDLE_STATE_CLEANUP_UNCONFIRMED) {
    return result;
  }
  if (retired == DECKENT_NATIVE_RETIRE_CLEANUP_UNCONFIRMED
      || retired_state == DECKENT_NATIVE_HANDLE_STATE_CLEANUP_UNCONFIRMED) {
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED",
      "custody resource cleanup could not be confirmed"
    );
  }
  if (napi_is_exception_pending(env, &pending) == napi_ok && pending) return NULL;
  return deckent_native_throw(
    env,
    "E_EXEC_AUTH_NATIVE_HANDLE_CONTRACT",
    "custody handle could not be closed"
  );
}

static bool set_manifest_string(
  napi_env env,
  napi_value target,
  const char *name,
  const char *value
) {
  napi_value property;
  return check_napi(
      env,
      napi_create_string_utf8(env, value, NAPI_AUTO_LENGTH, &property),
      "E_EXEC_AUTH_NATIVE_INIT",
      "native manifest string could not be created"
    ) && check_napi(
      env,
      define_own_value_status(env, target, name, property),
      "E_EXEC_AUTH_NATIVE_INIT",
      "native manifest string could not be installed"
    );
}

static bool set_manifest_uint32(
  napi_env env,
  napi_value target,
  const char *name,
  uint32_t value
) {
  napi_value property;
  return check_napi(
      env,
      napi_create_uint32(env, value, &property),
      "E_EXEC_AUTH_NATIVE_INIT",
      "native manifest number could not be created"
    ) && check_napi(
      env,
      define_own_value_status(env, target, name, property),
      "E_EXEC_AUTH_NATIVE_INIT",
      "native manifest number could not be installed"
    );
}

static bool create_frozen_string_array(
  napi_env env,
  const char *const *values,
  size_t count,
  napi_value *result
) {
  size_t index;
  if (!check_napi(
        env,
        napi_create_array_with_length(env, count, result),
        "E_EXEC_AUTH_NATIVE_INIT",
        "native manifest array could not be created"
      )) return false;
  for (index = 0u; index < count; index += 1u) {
    napi_value value;
    if (!check_napi(
          env,
          napi_create_string_utf8(env, values[index], NAPI_AUTO_LENGTH, &value),
          "E_EXEC_AUTH_NATIVE_INIT",
          "native manifest array value could not be created"
        ) || !check_napi(
          env,
          define_own_index_status(env, *result, (uint32_t)index, value),
          "E_EXEC_AUTH_NATIVE_INIT",
          "native manifest array value could not be installed"
        )) return false;
  }
  return check_napi(
    env,
    napi_object_freeze(env, *result),
    "E_EXEC_AUTH_NATIVE_INIT",
    "native manifest array could not be frozen"
  );
}

static bool create_effect_contract(napi_env env, napi_value *contract) {
  static const char *const operations[] = {
    DECKENT_EFFECT_OPERATION_NAME_APPEND_STAGE,
    DECKENT_EFFECT_OPERATION_NAME_APPLY_OPERATION,
    DECKENT_EFFECT_OPERATION_NAME_BEGIN_SOURCE_READ,
    DECKENT_EFFECT_OPERATION_NAME_BEGIN_STAGE,
    DECKENT_EFFECT_OPERATION_NAME_CAPTURE_TREE,
    DECKENT_EFFECT_OPERATION_NAME_FINISH_SOURCE_READ,
    DECKENT_EFFECT_OPERATION_NAME_INSPECT_ENTRY,
    DECKENT_EFFECT_OPERATION_NAME_NEXT_SOURCE_CHUNK,
    DECKENT_EFFECT_OPERATION_NAME_OPEN_ROOT,
    DECKENT_EFFECT_OPERATION_NAME_RECONCILE_OPERATION,
    DECKENT_EFFECT_OPERATION_NAME_SEAL_STAGE,
    DECKENT_EFFECT_OPERATION_NAME_VERIFY_POSTIMAGES,
  };
  napi_value available;
  napi_value operation_set;
  if (napi_create_object(env, contract) != napi_ok
      || !set_manifest_uint32(env, *contract, "schemaVersion", 1u)
      || !set_manifest_string(env, *contract, "abiName",
        DECKENT_EXECUTION_EFFECT_ABI_NAME)
      || !set_manifest_string(env, *contract, "abiVersion",
        DECKENT_EXECUTION_EFFECT_ABI_VERSION)
      || !set_manifest_string(env, *contract, "handleAbi",
        DECKENT_EXECUTION_EFFECT_HANDLE_ABI)
      || !set_manifest_string(env, *contract, "trustDomain",
        DECKENT_EXECUTION_EFFECT_FEATURE_LINUX)
      || napi_get_boolean(env,
#if defined(__linux__)
        true,
#else
        false,
#endif
        &available) != napi_ok
      || define_own_value_status(env, *contract, "available", available) != napi_ok
      || !create_frozen_string_array(env, operations,
        sizeof(operations) / sizeof(operations[0]), &operation_set)
      || define_own_value_status(env, *contract, "operations", operation_set) != napi_ok
      || napi_object_freeze(env, *contract) != napi_ok) {
    deckent_native_throw(env, "E_EXEC_AUTH_NATIVE_INIT",
      "execution-effect capability contract could not be created");
    return false;
  }
  return true;
}

static bool create_capability_manifest(
  napi_env env,
  const deckent_custody_backend_v1 *backend,
  napi_value *manifest
) {
  static const char *const export_names[] = {
    "capabilityManifest",
    "closeFd",
    "custodyCloseHandle",
    "custodyInvoke",
    "effectCloseHandle",
    "effectInvoke",
    "fdPath",
    "fstatIdentity",
    "hostBootIdentity",
    "mountIdentity",
    "openDirAt",
    "readdirFd",
    "renameAt",
    "unlinkAt",
  };
  const char *feature_names[4];
  size_t feature_count = 0u;
  napi_value features;
  napi_value export_set;
  napi_value effect_contract;
  if (backend != NULL
      && backend->feature_bits == DECKENT_NATIVE_FEATURE_CUSTODY_POSIX) {
    feature_names[feature_count++] = DECKENT_EXEC_AUTHORITY_FEATURE_CUSTODY_POSIX;
  }
  if (backend != NULL
      && backend->feature_bits == DECKENT_NATIVE_FEATURE_CUSTODY_WIN32) {
    feature_names[feature_count++] = DECKENT_EXEC_AUTHORITY_FEATURE_CUSTODY_WIN32;
  }
#if defined(__linux__)
  feature_names[feature_count++] = DECKENT_EXECUTION_EFFECT_FEATURE_LINUX;
#endif
  if (DECKENT_HAS_LEGACY_POSIX) {
    feature_names[feature_count++] = DECKENT_EXEC_AUTHORITY_FEATURE_LEGACY_POSIX;
  }
  if (!check_napi(
        env,
        napi_create_object(env, manifest),
        "E_EXEC_AUTH_NATIVE_INIT",
        "native capability manifest could not be created"
      )
      || !set_manifest_uint32(env, *manifest, "schemaVersion", 1u)
      || !set_manifest_string(
        env,
        *manifest,
        "abiName",
        DECKENT_EXEC_AUTHORITY_ABI_NAME
      )
      || !set_manifest_string(
        env,
        *manifest,
        "abiVersion",
        DECKENT_EXEC_AUTHORITY_ABI_VERSION
      )
      || !set_manifest_uint32(
        env,
        *manifest,
        "napiVersion",
        DECKENT_EXEC_AUTHORITY_NAPI_VERSION
      )
      || !set_manifest_string(
        env,
        *manifest,
        "packageName",
        DECKENT_EXEC_AUTHORITY_PACKAGE_NAME
      )
      || !set_manifest_string(
        env,
        *manifest,
        "packageVersion",
        DECKENT_EXEC_AUTHORITY_PACKAGE_VERSION
      )
      || !set_manifest_string(
        env,
        *manifest,
        "platform",
        DECKENT_COMPILED_PLATFORM_NAME
      )
      || !set_manifest_string(env, *manifest, "arch", DECKENT_COMPILED_ARCH)
      || !set_manifest_string(
        env,
        *manifest,
        "handleAbi",
        DECKENT_EXEC_AUTHORITY_HANDLE_ABI
      )
      || !set_manifest_string(
        env,
        *manifest,
        "buildType",
        DECKENT_COMPILED_BUILD_TYPE
      )
      || !create_effect_contract(env, &effect_contract)
      || !check_napi(
        env,
        define_own_value_status(env, *manifest, "effectContract", effect_contract),
        "E_EXEC_AUTH_NATIVE_INIT",
        "native effect contract could not be installed"
      )
      || !create_frozen_string_array(
        env,
        feature_names,
        feature_count,
        &features
      )
      || !check_napi(
        env,
        define_own_value_status(env, *manifest, "features", features),
        "E_EXEC_AUTH_NATIVE_INIT",
        "native manifest features could not be installed"
      )
      || !create_frozen_string_array(
        env,
        export_names,
        sizeof(export_names) / sizeof(export_names[0]),
        &export_set
      )
      || !check_napi(
        env,
        define_own_value_status(env, *manifest, "exportSet", export_set),
        "E_EXEC_AUTH_NATIVE_INIT",
        "native manifest export set could not be installed"
      )
      || !check_napi(
        env,
        napi_object_freeze(env, *manifest),
        "E_EXEC_AUTH_NATIVE_INIT",
        "native capability manifest could not be frozen"
      )) return false;
  return true;
}

static bool install_function(
  napi_env env,
  napi_value exports,
  const char *name,
  napi_callback callback
) {
  napi_value function;
  return check_napi(
      env,
      napi_create_function(
        env,
        name,
        NAPI_AUTO_LENGTH,
        callback,
        NULL,
        &function
      ),
      "E_EXEC_AUTH_NATIVE_INIT",
      "native export function could not be created"
    ) && check_napi(
      env,
      define_own_value_status(env, exports, name, function),
      "E_EXEC_AUTH_NATIVE_INIT",
      "native export function could not be installed"
    );
}

static napi_value Init(napi_env env, napi_value exports) {
  const struct {
    const char *name;
    napi_callback callback;
  } functions[] = {
#if DECKENT_HAS_LEGACY_POSIX
    { "closeFd", CloseFd },
    { "fdPath", FdPath },
    { "fstatIdentity", FstatIdentity },
    { "hostBootIdentity", HostBootIdentity },
    { "mountIdentity", MountIdentity },
    { "openDirAt", OpenDirAt },
    { "readdirFd", ReaddirFd },
    { "renameAt", RenameAt },
    { "unlinkAt", UnlinkAt },
#else
    { "closeFd", LegacyUnavailable },
    { "fdPath", LegacyUnavailable },
    { "fstatIdentity", LegacyUnavailable },
    { "hostBootIdentity", LegacyUnavailable },
    { "mountIdentity", LegacyUnavailable },
    { "openDirAt", LegacyUnavailable },
    { "readdirFd", LegacyUnavailable },
    { "renameAt", LegacyUnavailable },
    { "unlinkAt", LegacyUnavailable },
#endif
    { "custodyCloseHandle", CustodyCloseHandle },
    { "custodyInvoke", CustodyInvoke },
    { "effectCloseHandle", EffectCloseHandle },
    { "effectInvoke", EffectInvoke },
  };
  deckent_native_state *state;
  napi_value manifest;
  size_t index;

  state = (deckent_native_state *)calloc(1u, sizeof(*state));
  if (state == NULL) {
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "execution authority environment allocation failed"
    );
  }
  state->env = env;
  state->next_legacy_token = 1u;
  state->backend = compiled_backend();
  state->effect.backend = compiled_effect_backend();
  if (!validate_backend(env, state->backend)
      || !validate_effect_backend(env, state->effect.backend)) {
    free(state);
    return NULL;
  }
  for (index = 0u; index < sizeof(functions) / sizeof(functions[0]); index += 1u) {
    if (!install_function(
          env,
          exports,
          functions[index].name,
          functions[index].callback
        )) goto init_failed;
  }
  if (!create_capability_manifest(env, state->backend, &manifest)
      || !check_napi(
        env,
        define_own_value_status(env, exports, "capabilityManifest", manifest),
        "E_EXEC_AUTH_NATIVE_INIT",
        "native capability manifest could not be installed"
      )
      || !check_napi(
        env,
        napi_object_freeze(env, exports),
        "E_EXEC_AUTH_NATIVE_INIT",
        "native exports could not be frozen"
      )) goto init_failed;
  /*
   * Instance data is the final fallible initialization step. Until every
   * export and manifest field is defined and frozen, common retains direct
   * ownership of state and can synchronously release its native allocations.
   */
  if (napi_set_instance_data(env, state, native_state_finalize, NULL) != napi_ok) {
    free(state);
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_INIT",
      "execution authority environment state could not be installed"
    );
  }
  return exports;

init_failed:
  free(state);
  return NULL;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
