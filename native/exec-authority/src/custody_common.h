#ifndef DECKENT_EXEC_AUTHORITY_CUSTODY_COMMON_H
#define DECKENT_EXEC_AUTHORITY_CUSTODY_COMMON_H

#include <node_api.h>

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define DECKENT_EXEC_AUTHORITY_ABI_NAME "deckent.exec-authority"
#define DECKENT_EXEC_AUTHORITY_ABI_VERSION "1.0.0"
#define DECKENT_EXEC_AUTHORITY_ABI_VERSION_NUMBER 1u
#define DECKENT_EXEC_AUTHORITY_HANDLE_ABI \
  "deckent.exec-authority.opaque-generation.v1"
#define DECKENT_EXEC_AUTHORITY_NAPI_VERSION 8u

#define DECKENT_EXEC_AUTHORITY_FEATURE_LEGACY_POSIX \
  "legacy-posix-fd-v1"
#define DECKENT_EXEC_AUTHORITY_FEATURE_CUSTODY_POSIX \
  "custody-posix-v1"
#define DECKENT_EXEC_AUTHORITY_FEATURE_CUSTODY_WIN32 \
  "custody-win32-v1"

/*
 * Execution-effect landing is a separate trust domain.  It deliberately does
 * not reuse the custody handle ABI, slots, type tags or backend version.  A
 * custody handle can therefore never be replayed as a project/workspace/stage
 * authority even when both domains are hosted by the same addon instance.
 */
#define DECKENT_EXECUTION_EFFECT_FEATURE_LINUX "execution-effect-linux-v1"
#define DECKENT_EXECUTION_EFFECT_ABI_NAME "deckent.execution-effect"
#define DECKENT_EXECUTION_EFFECT_ABI_VERSION "2.1.0"
#define DECKENT_EXECUTION_EFFECT_ABI_VERSION_NUMBER 2u
#define DECKENT_EXECUTION_EFFECT_HANDLE_ABI \
  "deckent.execution-effect.opaque-generation.v2"

#define DECKENT_EFFECT_OPERATION_NAME_OPEN_ROOT "open-root"
#define DECKENT_EFFECT_OPERATION_NAME_CAPTURE_TREE "capture-tree"
#define DECKENT_EFFECT_OPERATION_NAME_INSPECT_ENTRY "inspect-entry"
#define DECKENT_EFFECT_OPERATION_NAME_BEGIN_STAGE "begin-stage"
#define DECKENT_EFFECT_OPERATION_NAME_APPEND_STAGE "append-stage"
#define DECKENT_EFFECT_OPERATION_NAME_SEAL_STAGE "seal-stage"
#define DECKENT_EFFECT_OPERATION_NAME_APPLY_OPERATION "apply-operation"
#define DECKENT_EFFECT_OPERATION_NAME_RECONCILE_OPERATION "reconcile-operation"
#define DECKENT_EFFECT_OPERATION_NAME_VERIFY_POSTIMAGES "verify-postimages"
#define DECKENT_EFFECT_OPERATION_NAME_BEGIN_SOURCE_READ "begin-source-read"
#define DECKENT_EFFECT_OPERATION_NAME_NEXT_SOURCE_CHUNK "next-source-chunk"
#define DECKENT_EFFECT_OPERATION_NAME_FINISH_SOURCE_READ "finish-source-read"

/*
 * Exact public positional custodyInvoke ABI:
 * probe(handle); prove-root-separation(custodyRoot, canonicalProjectRoot);
 * open-root(path, disposition, privacyPolicy);
 * open-directory-at/open-file-at(parent, name, disposition, privacyPolicy);
 * begin-publication(parent, name, maxBytes); append-publication(publication,
 * bytes); seal-publication/abort-publication(publication);
 * read-bounded(file, maxBytes); identity/apply-private/sync(handle).
 */
#define DECKENT_CUSTODY_OPERATION_NAME_PROBE "probe"
#define DECKENT_CUSTODY_OPERATION_NAME_PROVE_ROOT_SEPARATION \
  "prove-root-separation"
#define DECKENT_CUSTODY_OPERATION_NAME_OPEN_ROOT "open-root"
#define DECKENT_CUSTODY_OPERATION_NAME_OPEN_DIRECTORY_AT "open-directory-at"
#define DECKENT_CUSTODY_OPERATION_NAME_OPEN_FILE_AT "open-file-at"
#define DECKENT_CUSTODY_OPERATION_NAME_BEGIN_PUBLICATION "begin-publication"
#define DECKENT_CUSTODY_OPERATION_NAME_APPEND_PUBLICATION "append-publication"
#define DECKENT_CUSTODY_OPERATION_NAME_SEAL_PUBLICATION "seal-publication"
#define DECKENT_CUSTODY_OPERATION_NAME_ABORT_PUBLICATION "abort-publication"
#define DECKENT_CUSTODY_OPERATION_NAME_READ_BOUNDED "read-bounded"
#define DECKENT_CUSTODY_OPERATION_NAME_SCAN_DIRECTORY_BOUNDED \
  "scan-directory-bounded"
#define DECKENT_CUSTODY_OPERATION_NAME_IDENTITY "identity"
#define DECKENT_CUSTODY_OPERATION_NAME_APPLY_PRIVATE "apply-private"
#define DECKENT_CUSTODY_OPERATION_NAME_SYNC "sync"

/* Platform-neutral open/create and privacy policy values. */
#define DECKENT_CUSTODY_DISPOSITION_OPEN_EXISTING "OPEN_EXISTING"
#define DECKENT_CUSTODY_DISPOSITION_CREATE_NEW "CREATE_NEW"
#define DECKENT_CUSTODY_DISPOSITION_OPEN_OR_CREATE "OPEN_OR_CREATE"
#define DECKENT_CUSTODY_PRIVACY_OWNER_PRIVATE "OWNER_PRIVATE"

/* Finite sorted values admitted in identity.volumeCapabilities. */
#define DECKENT_CUSTODY_VOLUME_CAP_STABLE_OBJECT_ID "STABLE_OBJECT_ID"
#define DECKENT_CUSTODY_VOLUME_CAP_PERSISTENT_ACL "PERSISTENT_ACL"
#define DECKENT_CUSTODY_VOLUME_CAP_REPARSE_POINTS "REPARSE_POINTS"
#define DECKENT_CUSTODY_VOLUME_CAP_HARD_LINKS "HARD_LINKS"
#define DECKENT_CUSTODY_VOLUME_CAP_DIRECTORY_DURABILITY \
  "DIRECTORY_DURABILITY"
#define DECKENT_CUSTODY_VOLUME_CAP_ANONYMOUS_TEMPFILE "ANONYMOUS_TEMPFILE"
#define DECKENT_CUSTODY_VOLUME_CAP_NO_REPLACE_PUBLISH "NO_REPLACE_PUBLISH"
#define DECKENT_CUSTODY_VOLUME_CAP_REMOTE "REMOTE"

/* Stable backend error codes admitted by deckent_native_throw. */
#define DECKENT_NATIVE_ERROR_NOT_FOUND "E_EXEC_AUTH_NATIVE_NOT_FOUND"
#define DECKENT_NATIVE_ERROR_ALREADY_EXISTS "E_EXEC_AUTH_NATIVE_ALREADY_EXISTS"
#define DECKENT_NATIVE_ERROR_INVALID_COMPONENT \
  "E_EXEC_AUTH_NATIVE_INVALID_COMPONENT"
#define DECKENT_NATIVE_ERROR_REPARSE_REJECTED \
  "E_EXEC_AUTH_NATIVE_REPARSE_REJECTED"
#define DECKENT_NATIVE_ERROR_PRIVACY_UNCONFIRMED \
  "E_EXEC_AUTH_NATIVE_PRIVACY_UNCONFIRMED"
#define DECKENT_NATIVE_ERROR_OBJECT_TYPE_MISMATCH \
  "E_EXEC_AUTH_NATIVE_OBJECT_TYPE_MISMATCH"
#define DECKENT_NATIVE_ERROR_LINK_COUNT_UNSAFE \
  "E_EXEC_AUTH_NATIVE_LINK_COUNT_UNSAFE"
#define DECKENT_NATIVE_ERROR_SIZE_LIMIT "E_EXEC_AUTH_NATIVE_SIZE_LIMIT"
#define DECKENT_NATIVE_ERROR_IDENTITY_CHANGED \
  "E_EXEC_AUTH_NATIVE_IDENTITY_CHANGED"
#define DECKENT_NATIVE_ERROR_VOLUME_UNSUPPORTED \
  "E_EXEC_AUTH_NATIVE_VOLUME_UNSUPPORTED"
#define DECKENT_NATIVE_ERROR_REMOTE_VOLUME_UNSUPPORTED \
  "E_EXEC_AUTH_NATIVE_REMOTE_VOLUME_UNSUPPORTED"
#define DECKENT_NATIVE_ERROR_NAMESPACE_CONFLICT \
  "E_EXEC_AUTH_NATIVE_NAMESPACE_CONFLICT"
#define DECKENT_NATIVE_ERROR_DURABILITY_UNCONFIRMED \
  "E_EXEC_AUTH_NATIVE_DURABILITY_UNCONFIRMED"
#define DECKENT_NATIVE_ERROR_PUBLISH_UNCONFIRMED \
  "E_EXEC_AUTH_NATIVE_PUBLISH_UNCONFIRMED"
#define DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED \
  "E_EXEC_AUTH_NATIVE_CREATE_UNCONFIRMED"
#define DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED \
  "E_EXEC_AUTH_NATIVE_CLEANUP_UNCONFIRMED"
#define DECKENT_NATIVE_ERROR_IO_UNCONFIRMED \
  "E_EXEC_AUTH_NATIVE_IO_UNCONFIRMED"
#define DECKENT_NATIVE_ERROR_ROOT_OVERLAP \
  "E_EXEC_AUTH_NATIVE_ROOT_OVERLAP"
#define DECKENT_NATIVE_ERROR_ROOT_SEPARATION_UNCONFIRMED \
  "E_EXEC_AUTH_NATIVE_ROOT_SEPARATION_UNCONFIRMED"
#define DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_BOUNDS \
  "E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_BOUNDS"
#define DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_DEADLINE \
  "E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_DEADLINE"
#define DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_MUTATED \
  "E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_MUTATED"
#define DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_ENTRY_INVALID \
  "E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_ENTRY_INVALID"
#define DECKENT_EFFECT_ERROR_CANCELLED "E_EXEC_AUTH_EFFECT_CANCELLED"
#define DECKENT_EFFECT_ERROR_DEADLINE "E_EXEC_AUTH_EFFECT_DEADLINE"
#define DECKENT_EFFECT_ERROR_BOUNDS "E_EXEC_AUTH_EFFECT_BOUNDS"
#define DECKENT_EFFECT_ERROR_CAS_MISMATCH "E_EXEC_AUTH_EFFECT_CAS_MISMATCH"
#define DECKENT_EFFECT_ERROR_DURABILITY "E_EXEC_AUTH_EFFECT_DURABILITY"
#define DECKENT_EFFECT_ERROR_RECONCILE_AMBIGUOUS \
  "E_EXEC_AUTH_EFFECT_RECONCILE_AMBIGUOUS"
#define DECKENT_EFFECT_ERROR_ENVELOPE "E_EXEC_AUTH_EFFECT_ENVELOPE"

/* Finite public reason-code vocabulary; never substitute errno or a path. */
#define DECKENT_CUSTODY_REASON_PLATFORM_UNSUPPORTED "PLATFORM_UNSUPPORTED"
#define DECKENT_CUSTODY_REASON_MOUNT_UNSUPPORTED "MOUNT_UNSUPPORTED"
#define DECKENT_CUSTODY_REASON_PUBLISH_PRIMITIVE_UNAVAILABLE \
  "PUBLISH_PRIMITIVE_UNAVAILABLE"
#define DECKENT_CUSTODY_REASON_NAMESPACE_CONFLICT "NAMESPACE_CONFLICT"
#define DECKENT_CUSTODY_REASON_EXISTING_DIFFERENT "EXISTING_DIFFERENT"
#define DECKENT_CUSTODY_REASON_FILE_DURABILITY_UNCONFIRMED \
  "FILE_DURABILITY_UNCONFIRMED"
#define DECKENT_CUSTODY_REASON_DIRECTORY_DURABILITY_UNCONFIRMED \
  "DIRECTORY_DURABILITY_UNCONFIRMED"
#define DECKENT_CUSTODY_REASON_FINAL_IDENTITY_UNCONFIRMED \
  "FINAL_IDENTITY_UNCONFIRMED"
#define DECKENT_CUSTODY_REASON_CLEANUP_UNCONFIRMED "CLEANUP_UNCONFIRMED"
#define DECKENT_CUSTODY_REASON_IO_UNCONFIRMED "IO_UNCONFIRMED"

typedef enum deckent_native_platform {
  DECKENT_NATIVE_PLATFORM_UNSUPPORTED = 0,
  DECKENT_NATIVE_PLATFORM_LINUX = 1,
  DECKENT_NATIVE_PLATFORM_DARWIN = 2,
  DECKENT_NATIVE_PLATFORM_WIN32 = 3,
} deckent_native_platform;

typedef enum deckent_native_feature {
  DECKENT_NATIVE_FEATURE_NONE = 0,
  DECKENT_NATIVE_FEATURE_CUSTODY_POSIX = 1u << 0,
  DECKENT_NATIVE_FEATURE_CUSTODY_WIN32 = 1u << 1,
} deckent_native_feature;

typedef struct deckent_native_state deckent_native_state;

typedef enum deckent_effect_operation {
  DECKENT_EFFECT_OPERATION_OPEN_ROOT = 1,
  DECKENT_EFFECT_OPERATION_CAPTURE_TREE = 2,
  DECKENT_EFFECT_OPERATION_INSPECT_ENTRY = 3,
  DECKENT_EFFECT_OPERATION_BEGIN_STAGE = 4,
  DECKENT_EFFECT_OPERATION_APPEND_STAGE = 5,
  DECKENT_EFFECT_OPERATION_SEAL_STAGE = 6,
  DECKENT_EFFECT_OPERATION_APPLY_OPERATION = 7,
  DECKENT_EFFECT_OPERATION_RECONCILE_OPERATION = 8,
  DECKENT_EFFECT_OPERATION_VERIFY_POSTIMAGES = 9,
  DECKENT_EFFECT_OPERATION_BEGIN_SOURCE_READ = 10,
  DECKENT_EFFECT_OPERATION_NEXT_SOURCE_CHUNK = 11,
  DECKENT_EFFECT_OPERATION_FINISH_SOURCE_READ = 12,
} deckent_effect_operation;

typedef enum deckent_effect_handle_kind {
  DECKENT_EFFECT_HANDLE_ANY = 0,
  DECKENT_EFFECT_HANDLE_PROJECT_ROOT = 1,
  DECKENT_EFFECT_HANDLE_WORKSPACE_ROOT = 2,
  DECKENT_EFFECT_HANDLE_STAGING_ROOT = 3,
  DECKENT_EFFECT_HANDLE_STAGED_CONTENT = 4,
  DECKENT_EFFECT_HANDLE_SOURCE_READ = 5,
} deckent_effect_handle_kind;

typedef enum deckent_effect_handle_right {
  DECKENT_EFFECT_RIGHT_NONE = 0,
  DECKENT_EFFECT_RIGHT_SCAN = 1u << 0,
  DECKENT_EFFECT_RIGHT_INSPECT = 1u << 1,
  DECKENT_EFFECT_RIGHT_STAGE = 1u << 2,
  DECKENT_EFFECT_RIGHT_APPEND = 1u << 3,
  DECKENT_EFFECT_RIGHT_SEAL = 1u << 4,
  DECKENT_EFFECT_RIGHT_APPLY = 1u << 5,
  DECKENT_EFFECT_RIGHT_RECONCILE = 1u << 6,
  DECKENT_EFFECT_RIGHT_VERIFY = 1u << 7,
  DECKENT_EFFECT_RIGHT_SOURCE_READ = 1u << 8,
  DECKENT_EFFECT_RIGHT_SOURCE_FINISH = 1u << 9,
} deckent_effect_handle_right;

typedef enum deckent_effect_root_kind {
  DECKENT_EFFECT_ROOT_PROJECT = 1,
  DECKENT_EFFECT_ROOT_WORKSPACE = 2,
  DECKENT_EFFECT_ROOT_STAGING = 3,
} deckent_effect_root_kind;

typedef struct deckent_effect_borrow {
  deckent_native_state *owner;
  uint32_t slot_index;
  uint64_t generation;
  uintptr_t resource;
  bool active;
} deckent_effect_borrow;

typedef napi_value (*deckent_effect_backend_invoke)(
  napi_env env,
  deckent_native_state *state,
  deckent_effect_operation operation,
  size_t argc,
  napi_value *argv
);

typedef struct deckent_effect_backend_v2 {
  uint32_t struct_size;
  uint32_t abi_version;
  deckent_native_platform platform;
  const char *trust_domain;
  deckent_effect_backend_invoke invoke;
} deckent_effect_backend_v2;

typedef enum deckent_native_handle_kind {
  DECKENT_NATIVE_HANDLE_ANY = 0,
  DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY = 1,
  DECKENT_NATIVE_HANDLE_DIRECTORY = 2,
  DECKENT_NATIVE_HANDLE_READ_FILE = 3,
  DECKENT_NATIVE_HANDLE_PUBLICATION = 4,
} deckent_native_handle_kind;

typedef enum deckent_native_handle_right {
  DECKENT_NATIVE_RIGHT_NONE = 0,
  DECKENT_NATIVE_RIGHT_TRAVERSE = 1u << 0,
  DECKENT_NATIVE_RIGHT_READ = 1u << 1,
  DECKENT_NATIVE_RIGHT_APPEND = 1u << 2,
  DECKENT_NATIVE_RIGHT_IDENTITY = 1u << 3,
  DECKENT_NATIVE_RIGHT_APPLY_PRIVATE = 1u << 4,
  DECKENT_NATIVE_RIGHT_SYNC = 1u << 5,
  DECKENT_NATIVE_RIGHT_PUBLISH = 1u << 6,
  DECKENT_NATIVE_RIGHT_ABORT = 1u << 7,
} deckent_native_handle_right;

typedef enum deckent_native_handle_state {
  DECKENT_NATIVE_HANDLE_STATE_OPEN = 1u << 0,
  /*
   * The final name may now exist, but durability/final identity was not
   * confirmed. This state can be closed, inspected or reconciled, never
   * returned to OPEN and never "aborted" by unlinking the final name.
   */
  DECKENT_NATIVE_HANDLE_STATE_PUBLISHED_UNCONFIRMED = 1u << 1,
  /* A partial/uncertain append may only be aborted or explicitly closed. */
  DECKENT_NATIVE_HANDLE_STATE_APPEND_FAILED = 1u << 2,
  /*
   * An ancillary resource close was ambiguous before any durable effect. The
   * authority is terminal: it can never be borrowed, retried, published or
   * aborted, and only explicit close/finalizer safety cleanup may consume it.
   * This state never implies that a namespace effect occurred.
   */
  DECKENT_NATIVE_HANDLE_STATE_CLEANUP_UNCONFIRMED = 1u << 3,
} deckent_native_handle_state;

typedef enum deckent_native_retire_result {
  DECKENT_NATIVE_RETIRE_REJECTED = 0,
  DECKENT_NATIVE_RETIRE_CONFIRMED = 1,
  DECKENT_NATIVE_RETIRE_CLEANUP_UNCONFIRMED = 2,
} deckent_native_retire_result;

typedef enum deckent_native_feature_evidence {
  DECKENT_NATIVE_EVIDENCE_NONE = 0,
  DECKENT_NATIVE_EVIDENCE_COMPONENT_NOFOLLOW = 1u << 0,
  DECKENT_NATIVE_EVIDENCE_OWNER_PRIVATE = 1u << 1,
  DECKENT_NATIVE_EVIDENCE_ANONYMOUS_TEMPFILE = 1u << 2,
  DECKENT_NATIVE_EVIDENCE_ANONYMOUS_NO_REPLACE_PUBLISH = 1u << 3,
  DECKENT_NATIVE_EVIDENCE_FILE_DURABILITY = 1u << 4,
  DECKENT_NATIVE_EVIDENCE_DIRECTORY_DURABILITY = 1u << 5,
  DECKENT_NATIVE_EVIDENCE_HANDLE_BOUND_DELETE = 1u << 6,
  DECKENT_NATIVE_EVIDENCE_BOUNDED_READ = 1u << 7,
  DECKENT_NATIVE_EVIDENCE_PUBLISH_AT_EMPTY_PATH = 1u << 8,
  DECKENT_NATIVE_EVIDENCE_PUBLISH_PROC_FD_ALIAS = 1u << 9,
  DECKENT_NATIVE_EVIDENCE_OBJECT_TYPE = 1u << 10,
  DECKENT_NATIVE_EVIDENCE_LINK_COUNT = 1u << 11,
  DECKENT_NATIVE_EVIDENCE_SIZE = 1u << 12,
  DECKENT_NATIVE_EVIDENCE_OWNER_IDENTITY = 1u << 13,
  DECKENT_NATIVE_EVIDENCE_DACL_PRESENT = 1u << 14,
  DECKENT_NATIVE_EVIDENCE_DACL_PROTECTED = 1u << 15,
  DECKENT_NATIVE_EVIDENCE_DACL_EXACT_OWNER_ONLY = 1u << 16,
  DECKENT_NATIVE_EVIDENCE_LOCAL_VOLUME = 1u << 17,
  DECKENT_NATIVE_EVIDENCE_ROOT_SEPARATION = 1u << 18,
} deckent_native_feature_evidence;

typedef enum deckent_custody_operation {
  DECKENT_CUSTODY_OPERATION_PROBE = 1,
  DECKENT_CUSTODY_OPERATION_OPEN_ROOT = 2,
  DECKENT_CUSTODY_OPERATION_OPEN_DIRECTORY_AT = 3,
  DECKENT_CUSTODY_OPERATION_OPEN_FILE_AT = 4,
  DECKENT_CUSTODY_OPERATION_BEGIN_PUBLICATION = 5,
  DECKENT_CUSTODY_OPERATION_APPEND_PUBLICATION = 6,
  DECKENT_CUSTODY_OPERATION_SEAL_PUBLICATION = 7,
  DECKENT_CUSTODY_OPERATION_ABORT_PUBLICATION = 8,
  DECKENT_CUSTODY_OPERATION_READ_BOUNDED = 9,
  DECKENT_CUSTODY_OPERATION_IDENTITY = 10,
  DECKENT_CUSTODY_OPERATION_APPLY_PRIVATE = 11,
  DECKENT_CUSTODY_OPERATION_SYNC = 12,
  DECKENT_CUSTODY_OPERATION_PROVE_ROOT_SEPARATION = 13,
  DECKENT_CUSTODY_OPERATION_SCAN_DIRECTORY_BOUNDED = 14,
} deckent_custody_operation;

typedef struct deckent_native_borrow {
  deckent_native_state *owner;
  uint32_t slot_index;
  uint64_t generation;
  uint64_t invocation_id;
  uintptr_t resource;
  bool active;
} deckent_native_borrow;

/*
 * A platform resource is owned by exactly one native slot. The close callback
 * is invoked at most once, after the slot has already been terminalized. A
 * non-zero return means cleanup could not be confirmed; it never re-opens the
 * slot or permits a retry against a possibly reused OS resource.
 */
typedef int (*deckent_native_resource_close)(uintptr_t resource);

/*
 * A CREATED result owns a platform rollback guard until common dispatch has
 * accepted that exact finalized result. The resolver consumes `guard` exactly
 * once and must not call JavaScript or re-enter the addon.
 *
 * With `accept=true`, ACCEPTED means the guard was durably disarmed and all of
 * its private resources were released. ROLLED_BACK means acceptance could not
 * be completed but identity-bound removal, absence readback, parent durability
 * and guard cleanup were all confirmed. UNCONFIRMED means that exact rollback
 * truth could not be established. The resolver never owns or closes the opaque
 * created-object resource; common keeps that handle guard-bound during the
 * callback and revalidates its live slot/generation before exposing it.
 *
 * With `accept=false`, the only successful result is ROLLED_BACK. Returning
 * ACCEPTED is a contract breach because a rejected result may not leave its
 * named create behind. Every return value consumes the guard; common never
 * invokes the resolver twice. INVALID and every value outside the finite enum
 * are treated as UNCONFIRMED, never as an implicit zero-initialized success.
 */
typedef enum deckent_native_created_guard_result {
  DECKENT_NATIVE_CREATED_GUARD_INVALID = 0,
  DECKENT_NATIVE_CREATED_GUARD_ACCEPTED = 1,
  DECKENT_NATIVE_CREATED_GUARD_ROLLED_BACK = 2,
  DECKENT_NATIVE_CREATED_GUARD_UNCONFIRMED = 3,
} deckent_native_created_guard_result;

typedef deckent_native_created_guard_result
  (*deckent_native_created_guard_resolve)(uintptr_t guard, bool accept);

typedef napi_value (*deckent_custody_backend_invoke)(
  napi_env env,
  deckent_native_state *state,
  deckent_custody_operation operation,
  size_t argc,
  napi_value *argv
);

typedef struct deckent_custody_backend_v1 {
  uint32_t struct_size;
  uint32_t abi_version;
  deckent_native_platform platform;
  uint32_t feature_bits;
  deckent_custody_backend_invoke invoke;
} deckent_custody_backend_v1;

/*
 * Common owns the JavaScript authority boundary. `custodyInvoke` accepts an
 * operation followed by that operation's exact positional fields; it never
 * accepts a caller-created input record. Common creates an own-data snapshot
 * with native DefineProperty in the ABI-fixed field order,
 * type-tags, wraps and freezes it before a backend can observe it. The backend
 * vtable still receives exactly one snapshot record, so no caller object,
 * ambient global, Object/process/Proxy/util lookup, descriptor callback or
 * host path crosses the backend boundary.
 *
 * A backend must call `deckent_native_require_input_snapshot` before reading
 * fields and must not re-resolve ambient globals or accept a caller-created
 * lookalike. Referenced field values remain owned by
 * the frozen snapshot for the synchronous invocation. In particular, bytes
 * are still a JS reference at this seam and the backend must copy them into
 * native-owned memory before any effect.
 */
bool deckent_native_require_input_snapshot(
  napi_env env,
  deckent_native_state *state,
  napi_value input,
  deckent_custody_operation expected_operation
);

/*
 * Read one exact own-data value from a common-created snapshot or native
 * result record. This helper never consults an inherited property. Backends
 * may call it only after the input has passed
 * `deckent_native_require_input_snapshot` for the current operation.
 */
bool deckent_native_get_own_value(
  napi_env env,
  napi_value object,
  const char *name,
  napi_value *value
);

/*
 * Define immutable enumerable own-data fields without invoking [[Set]] or an
 * inherited setter. Backends use these helpers for every result/nested record
 * and array element, populate the complete shape, and only then freeze it.
 * Failure is a typed backend-ABI error. Array indices are canonical uint32
 * property names and therefore preserve Array length semantics.
 */
bool deckent_native_define_own_value(
  napi_env env,
  napi_value target,
  const char *name,
  napi_value value
);

bool deckent_native_define_own_index(
  napi_env env,
  napi_value target,
  uint32_t index,
  napi_value value
);

/*
 * Stable native error boundary. Only the finite common-core codes and
 * DECKENT_NATIVE_ERROR_* backend codes are retained; an unknown code becomes
 * E_EXEC_AUTH_NATIVE_OPERATION. The common implementation creates, native
 * type-tags and freezes the Error with a fixed path-free message before it is
 * thrown. The dispatcher clears any backend-pending exception and rethrows it
 * only when that exact common tag is present; a foreign/arbitrary exception is
 * replaced with E_EXEC_AUTH_NATIVE_OPERATION without reading code, message,
 * properties or getters. Failure to construct, tag, freeze or throw this safe
 * boundary is process-fatal rather than a silent NULL result.
 */
napi_value deckent_native_throw(
  napi_env env,
  const char *code,
  const char *message
);

/*
 * Backends must allocate every non-handle top-level result through
 * `deckent_native_create_result_record`, populate only exact own-data fields,
 * freeze all nested records/arrays, then call finalize exactly once. The
 * common dispatcher accepts and consumes only a successfully finalized native
 * result token bound to that exact operation; replay or cross-operation return
 * is rejected. It never turns an arbitrary mutable backend object into ABI
 * success.
 *
 * If finalization fails, the backend must synchronously retire every newly
 * created opaque handle/resource before returning. After a namespace effect,
 * it must first mark the input publication PUBLISHED_UNCONFIRMED. Before the
 * input is retired, it remains the reconciliation seam and a later failure
 * returns a finalized PUBLISHED_UNCONFIRMED record or the typed
 * DECKENT_NATIVE_ERROR_PUBLISH_UNCONFIRMED failure. Once exact final identity
 * and an owned READ_FILE handle exist, the backend pre-finalizes both the
 * success and cleanup-unconfirmed records before retiring the publication.
 * If that terminal cleanup is unconfirmed, the consumed input is never
 * revived or retried; the PUBLISHED_UNCONFIRMED record carrying the exact
 * READ_FILE handle and identity is the replacement reconciliation seam. It
 * must never return a partial record or report cleanup uncertainty as success.
 * A CREATED open-root/open-directory result has the separate named-effect
 * rollback duty described below; closing its object handle is not rollback.
 */
napi_value deckent_native_create_result_record(napi_env env);

/*
 * Bind one CREATED open-root/open-directory result to its exact opaque handle
 * and rollback guard. Ownership transfers to common only on true. The result
 * must still be mutable/unfinalized, the handle must be OPEN, unborrowed and of
 * the operation's exact kind, and the guard/callback must be non-null. Before
 * binding, the backend must completely populate the result as the exact five
 * enumerable own-data fields `{ schemaVersion: 1, kind: 'custody-open',
 * state: 'CREATED', handle, identity }`; no extra string/symbol field is
 * accepted and `handle` must be the same opaque object supplied here. Common
 * checks this through its captured trusted descriptor primitive without
 * invoking a getter. The exact plain-object shape and handle identity are
 * checked again after freezing at dispatcher acceptance. Fields may not be
 * added after binding; the only remaining backend action is exact result
 * finalization. Common rejects every open-root/open-directory result whose
 * exact own-data state is CREATED but has no armed guard with
 * DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED; OPENED and open-file results may not
 * carry a created guard.
 *
 * Finalize failure and synchronous dispatcher rejection resolve the guard with
 * `accept=false` and retire the created handle. Exact dispatcher acceptance
 * resolves it with `accept=true`; only ACCEPTED exposes the handle. Confirmed
 * rollback preserves the original typed rejection. Any rollback/handle cleanup
 * uncertainty becomes DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED. An unaccepted
 * GC/environment-finalization path performs the same rollback; uncertainty is
 * process-fatal rather than silently discarded. Guard ownership is also scoped
 * to one synchronous backend invocation: exactly one armed guard may exist and
 * it must belong to the exact returned result. A NULL, foreign or different
 * result, a second guard, or a pending backend exception synchronously resolves
 * every invocation guard with `accept=false` before any error crosses common.
 */
bool deckent_native_bind_created_result_guard(
  napi_env env,
  deckent_native_state *state,
  napi_value result,
  deckent_custody_operation operation,
  napi_value created_handle,
  uintptr_t guard,
  deckent_native_created_guard_resolve resolve_guard
);

bool deckent_native_finalize_result_record(
  napi_env env,
  napi_value result,
  deckent_custody_operation operation
);

/*
 * Arm one exact seal success with its pre-finalized cleanup-unconfirmed
 * fallback before the backend returns. Common records this as the environment's
 * single state-owned active transfer, bound to the exact primary result object,
 * input object, operation, slot generation and replacement handle. Both
 * records must carry the same owned READ_FILE handle, identity object and
 * evidence bits. CREATED is valid only while the input slot is exactly
 * PUBLISHED_UNCONFIRMED; EXISTING_IDENTICAL is valid only while it is exactly
 * OPEN. Common checks that invariant both here and at settlement.
 *
 * Exact primary return retires the publication once and exposes success only
 * after confirmed cleanup. A NULL, non-object, different result or pending
 * backend exception cannot orphan the transfer: CREATED synchronously settles
 * to the bound PUBLISHED_UNCONFIRMED fallback; EXISTING_IDENTICAL retires its
 * provisional READ_FILE authority and returns a typed ABI/cleanup failure while
 * leaving the input OPEN. No later invocation may run while this ledger is
 * unresolved, and GC finalization is only a process-fatal last resort. A
 * backend's only remaining action is to return the exact primary object; it
 * must never retire or otherwise mutate the publication after this function
 * succeeds.
 */
bool deckent_native_bind_seal_result_transfer(
  napi_env env,
  deckent_native_state *state,
  napi_value success_result,
  napi_value cleanup_unconfirmed_result,
  napi_value publication_handle,
  napi_value replacement_read_handle,
  bool force_cleanup_unconfirmed
);

/*
 * Arm the exact pre-finalized abort success and cleanup-unconfirmed records in
 * the same single state-owned transfer ledger. Common dispatch, not the
 * backend, retires the exact identity/generation-bound OPEN or APPEND_FAILED
 * publication once. Only exact primary return plus confirmed cleanup exposes
 * CLEANUP_CONFIRMED; malformed, NULL, different or exception-bearing return and
 * uncertain cleanup expose the frozen CLEANUP_UNCONFIRMED fallback. A later
 * invocation cannot run with this transfer unresolved. After binding, the
 * backend's only remaining action is to return the exact primary object.
 */
bool deckent_native_bind_abort_result_transfer(
  napi_env env,
  deckent_native_state *state,
  napi_value cleanup_confirmed_result,
  napi_value cleanup_unconfirmed_result,
  napi_value publication_handle
);

/*
 * Platform backends create and consume only opaque, generation-fenced handles.
 * A non-null close callback is a mandatory precondition; violating that
 * precondition is a process-fatal backend ABI breach because common code has
 * no authority capable of terminalizing the transferred resource. Once
 * `deckent_native_create_handle` is called with it, common code consumes sole
 * ownership of `resource` immediately: validation, capacity, allocation,
 * wrapping and freezing failures all close it exactly once, and an ambiguous
 * close becomes E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED. The backend must never
 * close or reuse the resource after calling this function.
 *
 * Rights are an exact kind matrix, not a subset chosen by a backend:
 * ROOT_DIRECTORY/DIRECTORY = TRAVERSE|IDENTITY|APPLY_PRIVATE|SYNC|PUBLISH;
 * READ_FILE = READ|IDENTITY; PUBLICATION = APPEND|IDENTITY|APPLY_PRIVATE|SYNC|
 * PUBLISH|ABORT. Extra and missing rights are both rejected before exposure.
 *
 * `deckent_native_borrow_handle` performs type-tag, environment, kind, closed,
 * rights, lifecycle-state, slot and generation checks before returning a
 * call-scoped platform resource. The output borrow must be zero-initialized.
 * The slot cannot be retired/finalized while a borrow is active. Backends must
 * end every borrow before returning from their synchronous `invoke`; common
 * assigns each borrow the active monotonic invocation id and rejects a stale
 * or cross-invocation end. Every dispatcher exit requires a zero outstanding
 * borrow ledger; a leak is a fail-closed backend ABI breach, never success. A
 * resource must be duplicated while borrowed before it can outlive the call.
 * No custody operation may return an fd/HANDLE or derive a public path.
 * `fdPath` remains a legacy-only compatibility operation.
 */
napi_value deckent_native_create_handle(
  napi_env env,
  deckent_native_state *state,
  deckent_native_handle_kind kind,
  uint32_t rights,
  uintptr_t resource,
  deckent_native_resource_close close_resource
);

bool deckent_native_borrow_handle(
  napi_env env,
  deckent_native_state *state,
  napi_value value,
  deckent_native_handle_kind expected_kind,
  uint32_t required_rights,
  uint32_t accepted_states,
  deckent_native_borrow *borrow
);

bool deckent_native_end_borrow(
  napi_env env,
  deckent_native_borrow *borrow
);

/* One-way OPEN -> PUBLISHED_UNCONFIRMED transition. */
bool deckent_native_mark_published_unconfirmed(
  napi_env env,
  deckent_native_state *state,
  napi_value value
);

/* One-way OPEN -> APPEND_FAILED transition after uncertain byte custody. */
bool deckent_native_mark_append_failed(
  napi_env env,
  deckent_native_state *state,
  napi_value value
);

/*
 * One-way OPEN -> CLEANUP_UNCONFIRMED transition after a pre-effect ancillary
 * close ambiguity. The handle becomes permanently non-borrowable and cannot be
 * consumed through a backend retire call. Only custodyCloseHandle or native
 * finalization performs its safety cleanup; explicit close still reports the
 * latched uncertainty as E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED and can never
 * turn it into success.
 */
bool deckent_native_mark_cleanup_unconfirmed(
  napi_env env,
  deckent_native_state *state,
  napi_value value
);

/*
 * Terminalize one exact handle and invoke its cleanup callback once. The slot
 * and generation are irreversibly retired before the platform close because a
 * close error can leave ownership ambiguous; CLEANUP_UNCONFIRMED never makes
 * the old token reusable. Publication backends therefore prepare the exact
 * replacement reconciliation authority described above before calling this
 * function. This is used by successful publication transfer and explicit
 * abort alike; a stale, closed, foreign or wrong-kind handle is rejected before
 * cleanup. Backend retirement never accepts CLEANUP_UNCONFIRMED; that terminal
 * state is mechanically reserved for custodyCloseHandle/finalizer cleanup.
 */
deckent_native_retire_result deckent_native_retire_handle(
  napi_env env,
  deckent_native_state *state,
  napi_value value,
  deckent_native_handle_kind expected_kind,
  uint32_t required_rights,
  uint32_t accepted_states
);

/* Separate execution-effect v2 handle/result/input authority. */
napi_value deckent_effect_create_handle(
  napi_env env,
  deckent_native_state *state,
  deckent_effect_handle_kind kind,
  uint32_t rights,
  uintptr_t resource,
  deckent_native_resource_close close_resource
);

bool deckent_effect_borrow_handle(
  napi_env env,
  deckent_native_state *state,
  napi_value value,
  deckent_effect_handle_kind expected_kind,
  uint32_t required_rights,
  deckent_effect_borrow *borrow
);

bool deckent_effect_end_borrow(napi_env env, deckent_effect_borrow *borrow);

deckent_native_retire_result deckent_effect_retire_handle(
  napi_env env,
  deckent_native_state *state,
  napi_value value,
  deckent_effect_handle_kind expected_kind,
  uint32_t required_rights
);

bool deckent_effect_require_input_snapshot(
  napi_env env,
  deckent_native_state *state,
  napi_value input,
  deckent_effect_operation expected_operation
);

napi_value deckent_effect_create_result_record(napi_env env);

bool deckent_effect_finalize_result_record(
  napi_env env,
  napi_value result,
  deckent_effect_operation operation
);

/*
 * Version-1 invoke contract implemented by each backend:
 *
 * The backend vtable always receives argc=1 and one common-created snapshot
 * that passes `deckent_native_require_input_snapshot` for the same operation;
 * it never receives the caller's raw record. Inputs are exact enumerable
 * own-data records (no accessors, proxies, symbols or extra keys):
 *
 * - open-root: `{ path, disposition, privacyPolicy }` where path is the one
 *   ingress path that becomes a pinned root authority. `disposition` is one
 *   exact DECKENT_CUSTODY_DISPOSITION_* value; `privacyPolicy` is
 *   OWNER_PRIVATE. CREATE_NEW must install owner-private mode/security at the
 *   creation syscall, never in a later privacy window. OPEN_EXISTING validates
 *   exact privacy before returning; OPEN_OR_CREATE atomically follows those
 *   same two branches. Missing OPEN_EXISTING throws NOT_FOUND, collision on
 *   CREATE_NEW throws ALREADY_EXISTS; null is never an authority result.
 * - probe/identity: `{ handle }`.
 * - prove-root-separation: `{ custodyRoot, canonicalProjectRoot }` where
 *   custodyRoot is an exact ROOT_DIRECTORY handle and canonicalProjectRoot is
 *   one canonical absolute ingress path. The platform backend opens every
 *   project component without following links, retains both exact directory
 *   objects, proves neither is the other nor an ancestor of the other through
 *   handle-relative parent walks, and revalidates both starting identities.
 *   Alias or mount-namespace uncertainty fails closed; no path-only fallback
 *   may produce success.
 * - open-directory-at: `{ parent, name, disposition, privacyPolicy }` with the
 *   same exact creation/open rules. open-file-at is `{ parent, name,
 *   disposition: 'OPEN_EXISTING', privacyPolicy: 'OWNER_PRIVATE' }`. `name` is
 *   one bounded component, never a path.
 * - begin-publication: `{ parent, name, maxBytes }`; it returns a PUBLICATION
 *   opaque handle whose resource is a heap-owned platform session (staging
 *   resource, an owned platform duplicate/reference plus slot generation for
 *   the exact parent, hard length bound and target component), never a raw
 *   fd/HANDLE. The parent is borrowed through kind+rights+generation validation
 *   until that duplicate/reference is safely owned by the session. Opening an
 *   anonymous temporary inode does not prove that it can be published there.
 *   The common dispatcher accepts this direct handle result only when it is an
 *   OPEN PUBLICATION with APPEND, IDENTITY, APPLY_PRIVATE, SYNC, PUBLISH and
 *   ABORT rights; all other operations return finalized result records.
 * - append-publication: `{ publication, bytes }`.
 * - seal-publication/abort-publication: `{ publication }`.
 * - read-bounded: `{ file, maxBytes }`.
 * - apply-private/sync: `{ handle }`.
 *
 * All record results and nested identity/evidence records are frozen, exact
 * own-data objects with `schemaVersion: 1`; top-level records carry the common
 * finalized-result token and opaque handles are independently type-tagged,
 * wrapped and frozen. The operation results are:
 *
 * - open-root/open-directory-at/open-file-at return `{ schemaVersion,
 *   kind: 'custody-open', state: 'OPENED'|'CREATED', handle, identity }`.
 *   Identity and owner-private policy are confirmed before the opaque handle
 *   is exposed. A child resource owns a platform duplicate/reference opened
 *   under one live parent borrow and records that exact parent slot generation;
 *   no later path re-walk or reused parent slot can change its authority.
 *   For CREATE_NEW and an OPEN_OR_CREATE branch that reports CREATED, the
 *   backend retains an owned parent/root cleanup authority and the created
 *   identity until the exact common result has finalized and been accepted by
 *   the dispatcher. If handle exposure, result construction or finalization
 *   fails, it performs an identity-bound handle/parent-relative removal,
 *   verifies absence and confirms parent durability. Only fully confirmed
 *   rollback may preserve the original typed failure; any uncertain removal,
 *   identity, absence or parent durability throws
 *   DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED. An OPENED branch never removes a
 *   pre-existing namespace object. `deckent_native_create_handle` owns only
 *   its platform resource and cannot launder a named create by closing it.
 * - probe returns `{ schemaVersion, kind: 'custody-probe', available,
 *   platform, featureEvidenceBits, identity }` where identity is null or the
 *   exact identity record below. Static manifest features mean only that the
 *   implementation was compiled; availability and evidence are per pinned
 *   root/mount. No sacrificial publication name may be created for probing.
 * - identity returns `{ schemaVersion, kind: 'custody-identity', platform,
 *   objectType, size, linkCount, mntId, dev, ino, fsMagic, mode, ownerUid,
 *   volumeId, fileId, reparseTag, ownerSid, daclPresent, daclProtected,
 *   daclEntryCount, daclOwnerAllowMask, daclCanonicalHash, volumeRemote,
 *   volumeCapabilities, featureEvidenceBits }`. Platform-inapplicable fields
 *   are null; booleans are boolean|null. `volumeCapabilities` is a frozen
 *   sorted array containing only DECKENT_CUSTODY_VOLUME_CAP_* values.
 *
 *   Every unsigned decimal string (size, linkCount, dev, ino, ownerUid,
 *   daclEntryCount and Linux mntId) is `0` or a non-zero digit followed by
 *   digits; leading zeroes and signs are forbidden. size, linkCount, dev, ino
 *   and Linux mntId are numerically bounded by UINT64_MAX; ownerUid and
 *   daclEntryCount are bounded by UINT32_MAX. A lexical 20-digit match above
 *   UINT64_MAX is invalid. Linux fsMagic is `0x` plus 1-16 lowercase hex
 *   digits with no leading zero except `0x0`. Darwin has no
 *   Linux mount ID or fs magic: its mntId is exactly
 *   `fsid:0xhhhhhhhh:0xhhhhhhhh` using two lowercase fixed-width uint32 values,
 *   and fsMagic is null. Linux and Darwin both bind dev/ino/mode/ownerUid;
 *   mode is exactly four octal digits.
 *
 *   Win32 volumeId is `0x` plus exactly 16 lowercase hex digits; fileId is
 *   `0x` plus exactly 32. reparseTag and daclOwnerAllowMask are `0x` plus
 *   exactly eight lowercase hex digits. ownerSid is canonical
 *   `S-1-<authority>-<subauthority...>`: authority is an unsigned decimal
 *   48-bit value and there are 1-15 unsigned decimal uint32 subauthorities,
 *   all using the same no-leading-zero grammar. Owner-private DACL admission
 *   requires daclEntryCount `1`: the one canonical non-inherited allow ACE is
 *   for that ownerSid, with the exact normalized owner mask and no other ACE.
 *   daclCanonicalHash is `sha256:` plus exactly 64 lowercase hex digits over
 *   canonical self-relative descriptor bytes.
 *   These fields bind remote-volume state and the exact protected DACL through
 *   presence/protection/count/owner-mask/canonical-hash readback.
 *
 *   objectType is DIRECTORY, REGULAR_FILE or OTHER; Store admission requires
 *   the expected type, linkCount '1', a bounded size and exact privacy evidence.
 * - append-publication returns `{ schemaVersion, kind: 'custody-append',
 *   state: 'APPENDED', byteLength }`, with byteLength a safe non-negative
 *   integer and the hard maxBytes bound already enforced. The backend creates,
 *   completely populates and finalizes this known result before the byte
 *   effect, then performs a bounded full-write and returns that same record
 *   only after exact completion. Partial or uncertain write marks the session
 *   APPEND_FAILED before throwing DECKENT_NATIVE_ERROR_IO_UNCONFIRMED; that
 *   state is abort/explicit-close only and can never append, seal or publish.
 * - read-bounded returns `{ schemaVersion, kind: 'custody-read', bytes,
 *   before, after, eof, requestedMaxBytes, observedBytes }`. `bytes` is a
 *   Uint8Array; `before` and `after` are exact full identity records and must
 *   match; `eof` is true only after an observed zero-byte read below the hard
 *   bound. Raw bytes alone are not a successful bounded-read result.
 * - apply-private/sync return `{ schemaVersion, kind: 'custody-evidence',
 *   operation: 'APPLY_PRIVATE'|'SYNC', state: 'CONFIRMED',
 *   featureEvidenceBits }` only after exact readback/durability confirmation.
 * - prove-root-separation returns `{ schemaVersion,
 *   kind: 'custody-root-separation', state: 'CONFIRMED', custodyIdentity,
 *   projectIdentity, featureEvidenceBits }`. Both identities are exact frozen
 *   custody identity records for the pinned starting objects. Success requires
 *   ROOT_SEPARATION, COMPONENT_NOFOLLOW and OBJECT_TYPE evidence. Physical
 *   equality or ancestor containment throws ROOT_OVERLAP; alias, mount,
 *   traversal, revalidation or cleanup ambiguity throws
 *   ROOT_SEPARATION_UNCONFIRMED.
 * - seal-publication returns `{ schemaVersion, kind: 'custody-publication',
 *   state, readHandle, identity, featureEvidenceBits, reasonCode }`. `state`
 *   is exactly CREATED, EXISTING_IDENTICAL or PUBLISHED_UNCONFIRMED. The first
 *   two consume the publication handle, return an owned READ_FILE handle and
 *   identity, and use null reasonCode. PUBLISHED_UNCONFIRMED is terminal
 *   reconciliation evidence; readHandle/identity may be null while the input
 *   publication remains owned. If publication retirement consumed the input
 *   but its cleanup was unconfirmed, readHandle and identity are mandatory and
 *   bind the final object while reasonCode is exactly CLEANUP_UNCONFIRMED.
 *   Every other reasonCode is one finite DECKENT_CUSTODY_REASON_* value. CREATED and
 *   EXISTING_IDENTICAL require FILE_DURABILITY and DIRECTORY_DURABILITY in
 *   featureEvidenceBits. A POSIX success additionally requires
 *   ANONYMOUS_NO_REPLACE_PUBLISH and exactly one publication provenance bit:
 *   PUBLISH_AT_EMPTY_PATH xor PUBLISH_PROC_FD_ALIAS. Win32 never fabricates a
 *   POSIX anonymous/proc-fd bit; its backend and Store admission enforce the
 *   corresponding Win32 no-replace, identity and owner-private evidence.
 * - abort-publication returns `{ schemaVersion, kind: 'custody-cleanup',
 *   state: 'CLEANUP_CONFIRMED'|'CLEANUP_UNCONFIRMED', reasonCode }`. It accepts
 *   OPEN or APPEND_FAILED only, consumes the publication handle and never
 *   names the staging object. PUBLISHED_UNCONFIRMED cannot be laundered
 *   through abort. If
 *   cleanup is unconfirmed and the exact cleanup record cannot be finalized
 *   or returned, the backend throws DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED;
 *   generic operation or descriptor-close errors must not erase that truth.
 * - custodyCloseHandle is outside invoke: confirmed cleanup returns undefined;
 *   rejected or unconfirmed cleanup throws one stable E_EXEC_AUTH_NATIVE_*
 *   code. Finalizers are safety cleanup and never success evidence.
 *
 * - seal-publication must mark PUBLISHED_UNCONFIRMED immediately after the
 *   no-replace namespace effect and before parent durability/final verification.
 *   A later failure remains terminal reconciliation evidence; abort must never
 *   unlink the final name or convert it back to OPEN. The actual final publish
 *   is the per-publication capability probe; anonymous temporary-file support
 *   and no-replace publication support have distinct evidence bits, and
 *   AT_EMPTY_PATH versus a verified internal proc-fd alias retain distinct
 *   provenance bits.
 *
 * Effect/result ordering is exact:
 *
 * - append prepares and finalizes its result before bytes are written; an
 *   uncertain write terminalizes the session as APPEND_FAILED/abort-only.
 * - apply-private and sync are idempotent readback-confirmed effects, so a
 *   result-construction failure may be retried but is never reported success.
 * - named CREATE retains cleanup authority and follows the confirmed rollback
 *   or CREATE_UNCONFIRMED rule above; closing the object handle is insufficient.
 * - seal marks PUBLISHED_UNCONFIRMED immediately after its namespace effect;
 *   later result/evidence failure retains that reconciliation truth. Final
 *   publication cleanup uncertainty consumes the input exactly once and
 *   returns the pre-finalized READ_FILE+identity reconciliation record.
 * - abort preserves CLEANUP_UNCONFIRMED if its cleanup/result path is uncertain.
 *
 * Common dispatch consumes a pre-finalized result token after backend return
 * using only native tag/wrap checks and one C-token state transition; it does
 * not allocate or mutate the JS result after an effect.
 *
 * The exported legacy number-shaped facade is compatibility-only. Its values
 * are monotonically issued per-environment virtual tokens, never OS fds and
 * never custody/receipt authority. A null parent may admit one absolute POSIX
 * ingress path; every token-relative name is exactly one non-empty component,
 * excluding `.`, `..`, `/` and embedded NUL. Legacy openDirAt uses O_NOFOLLOW
 * only for the final component, so intermediate symlink traversal in the root
 * ingress path remains an explicit legacy limitation. Custody backends must
 * not call, accept or derive authority from any legacy operation or token.
 */

#if defined(DECKENT_EXEC_AUTHORITY_HAS_POSIX_BACKEND)
const deckent_custody_backend_v1 *deckent_custody_posix_backend_v1(void);
const deckent_effect_backend_v2 *deckent_effect_linux_backend_v2(void);
#endif

#if defined(DECKENT_EXEC_AUTHORITY_HAS_WIN32_BACKEND)
const deckent_custody_backend_v1 *deckent_custody_win32_backend_v1(void);
#endif

#endif
