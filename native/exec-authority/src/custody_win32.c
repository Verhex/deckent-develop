/*
 * Windows-native task-attempt custody backend.
 *
 * The only path ingress is OPEN_ROOT. Every descendant authority is opened
 * relative to a pinned directory HANDLE and every namespace effect remains
 * bound to the handle that caused it. No raw HANDLE, host path or Win32 error
 * text crosses the common N-API boundary.
 */

#if !defined(_WIN32)
#error "custody_win32.c may only be compiled for Win32"
#endif

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <winternl.h>
#include <aclapi.h>
#include <bcrypt.h>

#include <stdbool.h>
#include <math.h>
#include <limits.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <uchar.h>
#include <wchar.h>

#include "custody_common.h"

#if !defined(LOAD_LIBRARY_SEARCH_SYSTEM32)
#define LOAD_LIBRARY_SEARCH_SYSTEM32 0x00000800u
#endif
#if !defined(OBJ_DONT_REPARSE)
#define OBJ_DONT_REPARSE 0x00001000L
#endif
#if !defined(FILE_OPEN_REPARSE_POINT)
#define FILE_OPEN_REPARSE_POINT 0x00200000u
#endif
#if !defined(FILE_SUPPORTS_HARD_LINKS)
#define FILE_SUPPORTS_HARD_LINKS 0x00400000u
#endif
#if !defined(FILE_SUPPORTS_REPARSE_POINTS)
#define FILE_SUPPORTS_REPARSE_POINTS 0x00000080u
#endif
#if !defined(FILE_PERSISTENT_ACLS)
#define FILE_PERSISTENT_ACLS 0x00000008u
#endif
#if !defined(STATUS_OBJECT_NAME_INVALID)
#define STATUS_OBJECT_NAME_INVALID ((NTSTATUS)0xC0000033L)
#endif
#if !defined(STATUS_UNSUCCESSFUL)
#define STATUS_UNSUCCESSFUL ((NTSTATUS)0xC0000001L)
#endif

#define DECKENT_STATUS_REPARSE_POINT_ENCOUNTERED ((NTSTATUS)0xC000050BL)
#define DECKENT_STATUS_STOPPED_ON_SYMLINK ((NTSTATUS)0x8000002DL)
#define DECKENT_FILE_REMOTE_DEVICE 0x00000010u
#define DECKENT_FILE_FS_DEVICE_INFORMATION_CLASS 4
#define DECKENT_FILE_DISPOSITION_INFO_EX_CLASS ((FILE_INFO_BY_HANDLE_CLASS)21)
#define DECKENT_FILE_DISPOSITION_FLAG_DELETE 0x00000001u
#define DECKENT_OWNER_ALLOW_MASK 0x001f01ffu
#define DECKENT_COMPONENT_MAX_UNITS 255u
#define DECKENT_INGRESS_MAX_UNITS 32767u
#define DECKENT_RANDOM_BYTES 16u
#define DECKENT_STAGING_ATTEMPTS 16u
#define DECKENT_IO_CHUNK 1048576u
#define DECKENT_SAFE_INTEGER_MAX 9007199254740991ULL
#define DECKENT_RESOURCE_MAGIC 0x44574e52u
#define DECKENT_PUBLICATION_MAGIC 0x44575042u
#define DECKENT_FILE_OPENED_INFORMATION ((ULONG_PTR)1u)
#define DECKENT_FILE_CREATED_INFORMATION ((ULONG_PTR)2u)

#define DECKENT_TRAVERSE_ACCESS \
  (FILE_LIST_DIRECTORY | FILE_TRAVERSE | FILE_READ_ATTRIBUTES \
    | READ_CONTROL | SYNCHRONIZE)
#define DECKENT_DIRECTORY_ACCESS \
  (FILE_LIST_DIRECTORY | FILE_ADD_FILE | FILE_ADD_SUBDIRECTORY \
    | FILE_TRAVERSE | FILE_READ_ATTRIBUTES | FILE_WRITE_ATTRIBUTES \
    | READ_CONTROL | WRITE_DAC | WRITE_OWNER | DELETE \
    | FILE_DELETE_CHILD | SYNCHRONIZE)
#define DECKENT_READ_FILE_ACCESS \
  (FILE_READ_DATA | FILE_READ_ATTRIBUTES | READ_CONTROL | SYNCHRONIZE)
#define DECKENT_PUBLICATION_FILE_ACCESS \
  (FILE_READ_DATA | FILE_WRITE_DATA | FILE_APPEND_DATA \
    | FILE_READ_ATTRIBUTES | FILE_WRITE_ATTRIBUTES | READ_CONTROL \
    | WRITE_DAC | WRITE_OWNER | DELETE | SYNCHRONIZE)
#define DECKENT_COLLISION_FILE_ACCESS \
  (FILE_READ_DATA | FILE_WRITE_DATA | FILE_READ_ATTRIBUTES \
    | READ_CONTROL | SYNCHRONIZE)

#define DECKENT_DIRECTORY_RIGHTS \
  (DECKENT_NATIVE_RIGHT_TRAVERSE \
    | DECKENT_NATIVE_RIGHT_IDENTITY \
    | DECKENT_NATIVE_RIGHT_APPLY_PRIVATE \
    | DECKENT_NATIVE_RIGHT_SYNC \
    | DECKENT_NATIVE_RIGHT_PUBLISH)
#define DECKENT_READ_RIGHTS \
  (DECKENT_NATIVE_RIGHT_READ | DECKENT_NATIVE_RIGHT_IDENTITY)
#define DECKENT_PUBLICATION_RIGHTS \
  (DECKENT_NATIVE_RIGHT_APPEND \
    | DECKENT_NATIVE_RIGHT_IDENTITY \
    | DECKENT_NATIVE_RIGHT_APPLY_PRIVATE \
    | DECKENT_NATIVE_RIGHT_SYNC \
    | DECKENT_NATIVE_RIGHT_PUBLISH \
    | DECKENT_NATIVE_RIGHT_ABORT)

#define DECKENT_WIN32_BASE_EVIDENCE \
  (DECKENT_NATIVE_EVIDENCE_COMPONENT_NOFOLLOW \
    | DECKENT_NATIVE_EVIDENCE_OWNER_PRIVATE \
    | DECKENT_NATIVE_EVIDENCE_OBJECT_TYPE \
    | DECKENT_NATIVE_EVIDENCE_LINK_COUNT \
    | DECKENT_NATIVE_EVIDENCE_SIZE \
    | DECKENT_NATIVE_EVIDENCE_OWNER_IDENTITY \
    | DECKENT_NATIVE_EVIDENCE_DACL_PRESENT \
    | DECKENT_NATIVE_EVIDENCE_DACL_PROTECTED \
    | DECKENT_NATIVE_EVIDENCE_DACL_EXACT_OWNER_ONLY \
    | DECKENT_NATIVE_EVIDENCE_LOCAL_VOLUME)

_Static_assert(sizeof(HANDLE) == sizeof(uintptr_t), "HANDLE must be pointer-sized");
_Static_assert(sizeof(WCHAR) == 2u, "Win32 custody requires UTF-16 WCHAR");
_Static_assert(sizeof(ULONG_PTR) == sizeof(void *), "ULONG_PTR width mismatch");
_Static_assert(sizeof(SIZE_T) == sizeof(void *), "SIZE_T width mismatch");
_Static_assert(FILE_ALL_ACCESS == DECKENT_OWNER_ALLOW_MASK,
  "FILE_ALL_ACCESS normalization changed");

typedef NTSTATUS (NTAPI *deckent_nt_create_file_fn)(
  PHANDLE,
  ACCESS_MASK,
  POBJECT_ATTRIBUTES,
  PIO_STATUS_BLOCK,
  PLARGE_INTEGER,
  ULONG,
  ULONG,
  ULONG,
  ULONG,
  PVOID,
  ULONG
);

typedef NTSTATUS (NTAPI *deckent_nt_query_volume_information_file_fn)(
  HANDLE,
  PIO_STATUS_BLOCK,
  PVOID,
  ULONG,
  int
);

typedef ULONG (NTAPI *deckent_rtl_nt_status_to_dos_error_fn)(NTSTATUS);

typedef BOOL (WINAPI *deckent_open_thread_token_fn)(HANDLE, DWORD, BOOL, PHANDLE);
typedef BOOL (WINAPI *deckent_open_process_token_fn)(HANDLE, DWORD, PHANDLE);
typedef BOOL (WINAPI *deckent_get_token_information_fn)(
  HANDLE,
  TOKEN_INFORMATION_CLASS,
  LPVOID,
  DWORD,
  PDWORD
);
typedef BOOL (WINAPI *deckent_initialize_acl_fn)(PACL, DWORD, DWORD);
typedef BOOL (WINAPI *deckent_add_access_allowed_ace_ex_fn)(
  PACL,
  DWORD,
  DWORD,
  DWORD,
  PSID
);
typedef BOOL (WINAPI *deckent_initialize_security_descriptor_fn)(
  PSECURITY_DESCRIPTOR,
  DWORD
);
typedef BOOL (WINAPI *deckent_set_security_descriptor_owner_fn)(
  PSECURITY_DESCRIPTOR,
  PSID,
  BOOL
);
typedef BOOL (WINAPI *deckent_set_security_descriptor_dacl_fn)(
  PSECURITY_DESCRIPTOR,
  BOOL,
  PACL,
  BOOL
);
typedef BOOL (WINAPI *deckent_set_security_descriptor_control_fn)(
  PSECURITY_DESCRIPTOR,
  SECURITY_DESCRIPTOR_CONTROL,
  SECURITY_DESCRIPTOR_CONTROL
);
typedef DWORD (WINAPI *deckent_get_security_info_fn)(
  HANDLE,
  SE_OBJECT_TYPE,
  SECURITY_INFORMATION,
  PSID *,
  PSID *,
  PACL *,
  PACL *,
  PSECURITY_DESCRIPTOR *
);
typedef DWORD (WINAPI *deckent_set_security_info_fn)(
  HANDLE,
  SE_OBJECT_TYPE,
  SECURITY_INFORMATION,
  PSID,
  PSID,
  PACL,
  PACL
);
typedef BOOL (WINAPI *deckent_get_security_descriptor_dacl_fn)(
  PSECURITY_DESCRIPTOR,
  LPBOOL,
  PACL *,
  LPBOOL
);
typedef BOOL (WINAPI *deckent_get_security_descriptor_control_fn)(
  PSECURITY_DESCRIPTOR,
  PSECURITY_DESCRIPTOR_CONTROL,
  LPDWORD
);
typedef BOOL (WINAPI *deckent_get_acl_information_fn)(
  PACL,
  LPVOID,
  DWORD,
  ACL_INFORMATION_CLASS
);
typedef BOOL (WINAPI *deckent_get_ace_fn)(PACL, DWORD, LPVOID *);
typedef BOOL (WINAPI *deckent_make_self_relative_sd_fn)(
  PSECURITY_DESCRIPTOR,
  PSECURITY_DESCRIPTOR,
  LPDWORD
);
typedef NTSTATUS (WINAPI *deckent_bcrypt_gen_random_fn)(
  BCRYPT_ALG_HANDLE,
  PUCHAR,
  ULONG,
  ULONG
);

typedef struct deckent_file_fs_device_information {
  ULONG device_type;
  ULONG characteristics;
} deckent_file_fs_device_information;

typedef struct deckent_file_disposition_info_ex {
  DWORD flags;
} deckent_file_disposition_info_ex;

typedef struct deckent_file_id_128 {
  BYTE identifier[16];
} deckent_file_id_128;

typedef struct deckent_file_id_information {
  ULONGLONG volume_serial_number;
  deckent_file_id_128 file_id;
} deckent_file_id_information;

typedef struct deckent_file_attribute_tag_information {
  DWORD file_attributes;
  DWORD reparse_tag;
} deckent_file_attribute_tag_information;

typedef struct deckent_file_rename_information {
  BOOL replace_if_exists;
  HANDLE root_directory;
  DWORD file_name_length;
  WCHAR file_name[1];
} deckent_file_rename_information;

typedef struct deckent_win32_api {
  HMODULE ntdll;
  HMODULE advapi32;
  HMODULE bcrypt;
  deckent_nt_create_file_fn nt_create_file;
  deckent_nt_query_volume_information_file_fn nt_query_volume_information_file;
  deckent_rtl_nt_status_to_dos_error_fn rtl_nt_status_to_dos_error;
  deckent_open_thread_token_fn open_thread_token;
  deckent_open_process_token_fn open_process_token;
  deckent_get_token_information_fn get_token_information;
  deckent_initialize_acl_fn initialize_acl;
  deckent_add_access_allowed_ace_ex_fn add_access_allowed_ace_ex;
  deckent_initialize_security_descriptor_fn initialize_security_descriptor;
  deckent_set_security_descriptor_owner_fn set_security_descriptor_owner;
  deckent_set_security_descriptor_dacl_fn set_security_descriptor_dacl;
  deckent_set_security_descriptor_control_fn set_security_descriptor_control;
  deckent_get_security_info_fn get_security_info;
  deckent_set_security_info_fn set_security_info;
  deckent_get_security_descriptor_dacl_fn get_security_descriptor_dacl;
  deckent_get_security_descriptor_control_fn get_security_descriptor_control;
  deckent_get_acl_information_fn get_acl_information;
  deckent_get_ace_fn get_ace;
  deckent_make_self_relative_sd_fn make_self_relative_sd;
  deckent_bcrypt_gen_random_fn bcrypt_gen_random;
  bool ready;
} deckent_win32_api;

typedef struct deckent_security_material {
  BYTE *owner_sid;
  DWORD owner_sid_length;
  PACL dacl;
  DWORD dacl_length;
  SECURITY_DESCRIPTOR descriptor;
} deckent_security_material;

typedef struct deckent_win32_identity {
  ULONGLONG volume_serial;
  BYTE file_id[16];
  ULONGLONG size;
  DWORD link_count;
  DWORD reparse_tag;
  bool directory;
  BYTE owner_sid[SECURITY_MAX_SID_SIZE];
  DWORD owner_sid_length;
  BYTE dacl_hash[32];
  DWORD volume_flags;
  uint32_t evidence_bits;
} deckent_win32_identity;

typedef struct deckent_win32_resource {
  uint32_t magic;
  HANDLE handle;
  HANDLE parent;
  WCHAR *component;
  uint64_t parent_generation;
  bool directory;
  BYTE owner_sid[SECURITY_MAX_SID_SIZE];
  DWORD owner_sid_length;
  deckent_win32_identity identity;
} deckent_win32_resource;

typedef struct deckent_win32_publication {
  uint32_t magic;
  HANDLE staging;
  HANDLE parent;
  WCHAR *staging_name;
  WCHAR *target_name;
  uint64_t parent_generation;
  uint64_t max_bytes;
  uint64_t byte_length;
  bool published;
  bool state_transition_unconfirmed;
  bool append_failed;
  bool cleanup_unconfirmed;
  BYTE owner_sid[SECURITY_MAX_SID_SIZE];
  DWORD owner_sid_length;
  deckent_win32_identity parent_identity;
  deckent_win32_identity staging_identity;
} deckent_win32_publication;

typedef struct deckent_sha256_context {
  uint32_t state[8];
  uint64_t bit_count;
  BYTE block[64];
  size_t block_length;
} deckent_sha256_context;

static INIT_ONCE deckent_api_once = INIT_ONCE_STATIC_INIT;
static deckent_win32_api deckent_api;

static uint32_t rotate_right_32(uint32_t value, uint32_t count) {
  return (value >> count) | (value << (32u - count));
}

static void sha256_transform(deckent_sha256_context *context, const BYTE block[64]) {
  static const uint32_t constants[64] = {
    0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u,
    0x3956c25bu, 0x59f111f1u, 0x923f82a4u, 0xab1c5ed5u,
    0xd807aa98u, 0x12835b01u, 0x243185beu, 0x550c7dc3u,
    0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u, 0xc19bf174u,
    0xe49b69c1u, 0xefbe4786u, 0x0fc19dc6u, 0x240ca1ccu,
    0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau,
    0x983e5152u, 0xa831c66du, 0xb00327c8u, 0xbf597fc7u,
    0xc6e00bf3u, 0xd5a79147u, 0x06ca6351u, 0x14292967u,
    0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu, 0x53380d13u,
    0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u,
    0xa2bfe8a1u, 0xa81a664bu, 0xc24b8b70u, 0xc76c51a3u,
    0xd192e819u, 0xd6990624u, 0xf40e3585u, 0x106aa070u,
    0x19a4c116u, 0x1e376c08u, 0x2748774cu, 0x34b0bcb5u,
    0x391c0cb3u, 0x4ed8aa4au, 0x5b9cca4fu, 0x682e6ff3u,
    0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u,
    0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u,
  };
  uint32_t words[64];
  uint32_t a;
  uint32_t b;
  uint32_t c;
  uint32_t d;
  uint32_t e;
  uint32_t f;
  uint32_t g;
  uint32_t h;
  uint32_t index;
  for (index = 0u; index < 16u; index += 1u) {
    words[index] = ((uint32_t)block[index * 4u] << 24u)
      | ((uint32_t)block[index * 4u + 1u] << 16u)
      | ((uint32_t)block[index * 4u + 2u] << 8u)
      | (uint32_t)block[index * 4u + 3u];
  }
  for (index = 16u; index < 64u; index += 1u) {
    uint32_t s0 = rotate_right_32(words[index - 15u], 7u)
      ^ rotate_right_32(words[index - 15u], 18u)
      ^ (words[index - 15u] >> 3u);
    uint32_t s1 = rotate_right_32(words[index - 2u], 17u)
      ^ rotate_right_32(words[index - 2u], 19u)
      ^ (words[index - 2u] >> 10u);
    words[index] = words[index - 16u] + s0 + words[index - 7u] + s1;
  }
  a = context->state[0];
  b = context->state[1];
  c = context->state[2];
  d = context->state[3];
  e = context->state[4];
  f = context->state[5];
  g = context->state[6];
  h = context->state[7];
  for (index = 0u; index < 64u; index += 1u) {
    uint32_t sum1 = rotate_right_32(e, 6u)
      ^ rotate_right_32(e, 11u)
      ^ rotate_right_32(e, 25u);
    uint32_t choice = (e & f) ^ ((~e) & g);
    uint32_t temporary1 = h + sum1 + choice + constants[index] + words[index];
    uint32_t sum0 = rotate_right_32(a, 2u)
      ^ rotate_right_32(a, 13u)
      ^ rotate_right_32(a, 22u);
    uint32_t majority = (a & b) ^ (a & c) ^ (b & c);
    uint32_t temporary2 = sum0 + majority;
    h = g;
    g = f;
    f = e;
    e = d + temporary1;
    d = c;
    c = b;
    b = a;
    a = temporary1 + temporary2;
  }
  context->state[0] += a;
  context->state[1] += b;
  context->state[2] += c;
  context->state[3] += d;
  context->state[4] += e;
  context->state[5] += f;
  context->state[6] += g;
  context->state[7] += h;
}

static void sha256_init(deckent_sha256_context *context) {
  static const uint32_t initial[8] = {
    0x6a09e667u, 0xbb67ae85u, 0x3c6ef372u, 0xa54ff53au,
    0x510e527fu, 0x9b05688cu, 0x1f83d9abu, 0x5be0cd19u,
  };
  memcpy(context->state, initial, sizeof(initial));
  context->bit_count = 0u;
  context->block_length = 0u;
  memset(context->block, 0, sizeof(context->block));
}

static void sha256_update(
  deckent_sha256_context *context,
  const BYTE *bytes,
  size_t length
) {
  size_t index;
  for (index = 0u; index < length; index += 1u) {
    context->block[context->block_length++] = bytes[index];
    if (context->block_length == sizeof(context->block)) {
      sha256_transform(context, context->block);
      context->bit_count += 512u;
      context->block_length = 0u;
    }
  }
}

static void sha256_finish(deckent_sha256_context *context, BYTE output[32]) {
  uint64_t total_bits = context->bit_count + (uint64_t)context->block_length * 8u;
  uint32_t index;
  context->block[context->block_length++] = 0x80u;
  if (context->block_length > 56u) {
    while (context->block_length < 64u) context->block[context->block_length++] = 0u;
    sha256_transform(context, context->block);
    context->block_length = 0u;
  }
  while (context->block_length < 56u) context->block[context->block_length++] = 0u;
  for (index = 0u; index < 8u; index += 1u) {
    context->block[63u - index] = (BYTE)(total_bits >> (index * 8u));
  }
  sha256_transform(context, context->block);
  for (index = 0u; index < 8u; index += 1u) {
    output[index * 4u] = (BYTE)(context->state[index] >> 24u);
    output[index * 4u + 1u] = (BYTE)(context->state[index] >> 16u);
    output[index * 4u + 2u] = (BYTE)(context->state[index] >> 8u);
    output[index * 4u + 3u] = (BYTE)context->state[index];
  }
}

static bool assign_system32_procedure(
  void *destination,
  size_t destination_size,
  FARPROC procedure
) {
  if (procedure == NULL || destination_size != sizeof(procedure)) return false;
  memcpy(destination, &procedure, sizeof(procedure));
  return true;
}

#define DECKENT_RESOLVE(module_value, field, type_name, symbol_name) \
  do { \
    _Static_assert(sizeof(type_name) == sizeof(FARPROC), \
      "Win32 procedure pointer width mismatch"); \
    if (!assign_system32_procedure( \
          &deckent_api.field, \
          sizeof(deckent_api.field), \
          GetProcAddress((module_value), (symbol_name)) \
        )) return FALSE; \
  } while (0)

static BOOL CALLBACK initialize_win32_api(
  PINIT_ONCE once,
  PVOID parameter,
  PVOID *context
) {
  (void)once;
  (void)parameter;
  (void)context;
  memset(&deckent_api, 0, sizeof(deckent_api));
  deckent_api.ntdll = GetModuleHandleW(L"ntdll.dll");
  deckent_api.advapi32 = LoadLibraryExW(
    L"advapi32.dll",
    NULL,
    LOAD_LIBRARY_SEARCH_SYSTEM32
  );
  deckent_api.bcrypt = LoadLibraryExW(
    L"bcrypt.dll",
    NULL,
    LOAD_LIBRARY_SEARCH_SYSTEM32
  );
  if (deckent_api.ntdll == NULL
      || deckent_api.advapi32 == NULL
      || deckent_api.bcrypt == NULL) return FALSE;
  DECKENT_RESOLVE(
    deckent_api.ntdll,
    nt_create_file,
    deckent_nt_create_file_fn,
    "NtCreateFile"
  );
  DECKENT_RESOLVE(
    deckent_api.ntdll,
    nt_query_volume_information_file,
    deckent_nt_query_volume_information_file_fn,
    "NtQueryVolumeInformationFile"
  );
  DECKENT_RESOLVE(
    deckent_api.ntdll,
    rtl_nt_status_to_dos_error,
    deckent_rtl_nt_status_to_dos_error_fn,
    "RtlNtStatusToDosError"
  );
  DECKENT_RESOLVE(deckent_api.advapi32, open_thread_token,
    deckent_open_thread_token_fn, "OpenThreadToken");
  DECKENT_RESOLVE(deckent_api.advapi32, open_process_token,
    deckent_open_process_token_fn, "OpenProcessToken");
  DECKENT_RESOLVE(deckent_api.advapi32, get_token_information,
    deckent_get_token_information_fn, "GetTokenInformation");
  DECKENT_RESOLVE(deckent_api.advapi32, initialize_acl,
    deckent_initialize_acl_fn, "InitializeAcl");
  DECKENT_RESOLVE(deckent_api.advapi32, add_access_allowed_ace_ex,
    deckent_add_access_allowed_ace_ex_fn, "AddAccessAllowedAceEx");
  DECKENT_RESOLVE(deckent_api.advapi32, initialize_security_descriptor,
    deckent_initialize_security_descriptor_fn, "InitializeSecurityDescriptor");
  DECKENT_RESOLVE(deckent_api.advapi32, set_security_descriptor_owner,
    deckent_set_security_descriptor_owner_fn, "SetSecurityDescriptorOwner");
  DECKENT_RESOLVE(deckent_api.advapi32, set_security_descriptor_dacl,
    deckent_set_security_descriptor_dacl_fn, "SetSecurityDescriptorDacl");
  DECKENT_RESOLVE(deckent_api.advapi32, set_security_descriptor_control,
    deckent_set_security_descriptor_control_fn, "SetSecurityDescriptorControl");
  DECKENT_RESOLVE(deckent_api.advapi32, get_security_info,
    deckent_get_security_info_fn, "GetSecurityInfo");
  DECKENT_RESOLVE(deckent_api.advapi32, set_security_info,
    deckent_set_security_info_fn, "SetSecurityInfo");
  DECKENT_RESOLVE(deckent_api.advapi32, get_security_descriptor_dacl,
    deckent_get_security_descriptor_dacl_fn, "GetSecurityDescriptorDacl");
  DECKENT_RESOLVE(deckent_api.advapi32, get_security_descriptor_control,
    deckent_get_security_descriptor_control_fn, "GetSecurityDescriptorControl");
  DECKENT_RESOLVE(deckent_api.advapi32, get_acl_information,
    deckent_get_acl_information_fn, "GetAclInformation");
  DECKENT_RESOLVE(deckent_api.advapi32, get_ace,
    deckent_get_ace_fn, "GetAce");
  DECKENT_RESOLVE(deckent_api.advapi32, make_self_relative_sd,
    deckent_make_self_relative_sd_fn, "MakeSelfRelativeSD");
  DECKENT_RESOLVE(deckent_api.bcrypt, bcrypt_gen_random,
    deckent_bcrypt_gen_random_fn, "BCryptGenRandom");
  deckent_api.ready = true;
  return TRUE;
}

#undef DECKENT_RESOLVE

static bool require_win32_api(napi_env env) {
  if (!InitOnceExecuteOnce(&deckent_api_once, initialize_win32_api, NULL, NULL)
      || !deckent_api.ready) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_FEATURE_UNAVAILABLE",
      "required Win32 custody APIs are unavailable"
    );
    return false;
  }
  return true;
}

static bool throw_failure(napi_env env, const char *code, const char *message) {
  deckent_native_throw(env, code, message);
  return false;
}

static void ensure_pending_failure(
  napi_env env,
  const char *code,
  const char *message
) {
  bool pending = false;
  if (napi_is_exception_pending(env, &pending) == napi_ok && pending) return;
  deckent_native_throw(env, code, message);
}

static void clear_pending_exception(napi_env env);
static void end_borrow_or_fatal(
  napi_env env,
  deckent_native_borrow *borrow,
  const char *message
);

static bool napi_set_string(
  napi_env env,
  napi_value object,
  const char *name,
  const char *text
) {
  napi_value value;
  return napi_create_string_utf8(env, text, NAPI_AUTO_LENGTH, &value) == napi_ok
    && deckent_native_define_own_value(env, object, name, value);
}

static bool napi_set_uint32_value(
  napi_env env,
  napi_value object,
  const char *name,
  uint32_t number
) {
  napi_value value;
  return napi_create_uint32(env, number, &value) == napi_ok
    && deckent_native_define_own_value(env, object, name, value);
}

static bool napi_set_double_value(
  napi_env env,
  napi_value object,
  const char *name,
  double number
) {
  napi_value value;
  return napi_create_double(env, number, &value) == napi_ok
    && deckent_native_define_own_value(env, object, name, value);
}

static bool napi_set_boolean_value(
  napi_env env,
  napi_value object,
  const char *name,
  bool boolean
) {
  napi_value value;
  return napi_get_boolean(env, boolean, &value) == napi_ok
    && deckent_native_define_own_value(env, object, name, value);
}

static bool napi_set_null_value(
  napi_env env,
  napi_value object,
  const char *name
) {
  napi_value value;
  return napi_get_null(env, &value) == napi_ok
    && deckent_native_define_own_value(env, object, name, value);
}

static bool napi_set_value(
  napi_env env,
  napi_value object,
  const char *name,
  napi_value value
) {
  return deckent_native_define_own_value(env, object, name, value);
}

static bool freeze_object(napi_env env, napi_value value) {
  return napi_object_freeze(env, value) == napi_ok;
}

static bool get_named_value(
  napi_env env,
  napi_value record,
  const char *name,
  napi_value *value
) {
  if (!deckent_native_get_own_value(env, record, name, value)) {
    return throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "custody input value is unavailable"
    );
  }
  return true;
}

static bool exact_input_record(
  napi_env env,
  deckent_native_state *state,
  deckent_custody_operation operation,
  size_t argc,
  napi_value *argv,
  napi_value *record
) {
  if (argc != 1u || argv == NULL
      || !deckent_native_require_input_snapshot(
        env,
        state,
        argv[0],
        operation
      )) {
    return throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "Win32 custody input snapshot provenance is invalid"
    );
  }
  *record = argv[0];
  return true;
}

static bool get_named_exact_utf8(
  napi_env env,
  napi_value record,
  const char *name,
  const char *expected
) {
  napi_value value;
  napi_valuetype type;
  size_t length = 0u;
  char buffer[32];
  if (!get_named_value(env, record, name, &value)
      || napi_typeof(env, value, &type) != napi_ok
      || type != napi_string
      || napi_get_value_string_utf8(env, value, NULL, 0u, &length) != napi_ok
      || length >= sizeof(buffer)
      || napi_get_value_string_utf8(
        env,
        value,
        buffer,
        sizeof(buffer),
        &length
      ) != napi_ok
      || strcmp(buffer, expected) != 0) {
    return throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "custody input enum value is invalid"
    );
  }
  return true;
}

static bool get_named_utf16(
  napi_env env,
  napi_value record,
  const char *name,
  size_t maximum_units,
  WCHAR **output,
  size_t *output_length
) {
  napi_value value;
  napi_valuetype type;
  size_t length = 0u;
  WCHAR *text;
  if (!get_named_value(env, record, name, &value)
      || napi_typeof(env, value, &type) != napi_ok
      || type != napi_string
      || napi_get_value_string_utf16(env, value, NULL, 0u, &length) != napi_ok
      || length == 0u
      || length > maximum_units
      || length > (SIZE_MAX / sizeof(WCHAR)) - 1u) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_INVALID_COMPONENT,
      "custody UTF-16 input is invalid"
    );
  }
  text = (WCHAR *)calloc(length + 1u, sizeof(WCHAR));
  if (text == NULL) {
    return throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "custody UTF-16 allocation failed"
    );
  }
  if (napi_get_value_string_utf16(
        env,
        value,
        (char16_t *)text,
        length + 1u,
        output_length
      ) != napi_ok
      || *output_length != length
      || wcslen(text) != length) {
    free(text);
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_INVALID_COMPONENT,
      "custody UTF-16 input is invalid"
    );
  }
  *output = text;
  return true;
}

static bool get_named_safe_u64(
  napi_env env,
  napi_value record,
  const char *name,
  bool require_positive,
  uint64_t *output
) {
  napi_value value;
  napi_valuetype type;
  double number;
  if (!get_named_value(env, record, name, &value)
      || napi_typeof(env, value, &type) != napi_ok
      || type != napi_number
      || napi_get_value_double(env, value, &number) != napi_ok
      || !isfinite(number)
      || floor(number) != number
      || number < (require_positive ? 1.0 : 0.0)
      || number > (double)DECKENT_SAFE_INTEGER_MAX) {
    return throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "custody numeric input is invalid"
    );
  }
  *output = (uint64_t)number;
  return true;
}

static void secure_free_bytes(BYTE **data, size_t length) {
  if (data == NULL || *data == NULL) return;
  if (length > 0u) SecureZeroMemory(*data, length);
  free(*data);
  *data = NULL;
}

static bool get_named_uint8_array_copy(
  napi_env env,
  napi_value record,
  const char *name,
  BYTE **owned_data,
  size_t *length
) {
  napi_value value;
  napi_value array_buffer;
  napi_value confirmed_array_buffer;
  napi_typedarray_type type;
  napi_typedarray_type confirmed_type;
  void *source = NULL;
  void *confirmed_source = NULL;
  void *backing = NULL;
  size_t observed_length = 0u;
  size_t confirmed_length = 0u;
  size_t backing_length = 0u;
  size_t byte_offset = 0u;
  size_t confirmed_offset = 0u;
  bool typed = false;
  bool array_buffer_is_exact = false;
  bool detached = true;
  bool confirmed_detached = true;
  bool same_array_buffer = false;
  BYTE *copy = NULL;
  if (owned_data == NULL || length == NULL) {
    return throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "custody byte output contract is invalid"
    );
  }
  *owned_data = NULL;
  *length = 0u;
  if (!get_named_value(env, record, name, &value)
      || napi_is_typedarray(env, value, &typed) != napi_ok
      || !typed
      || napi_get_typedarray_info(
        env,
        value,
        &type,
        &observed_length,
        &source,
        &array_buffer,
        &byte_offset
      ) != napi_ok
      || type != napi_uint8_array
      || observed_length > DECKENT_IO_CHUNK
      || napi_is_arraybuffer(
        env,
        array_buffer,
        &array_buffer_is_exact
      ) != napi_ok
      || !array_buffer_is_exact
      || napi_is_detached_arraybuffer(env, array_buffer, &detached) != napi_ok
      || detached
      || napi_get_arraybuffer_info(
        env,
        array_buffer,
        &backing,
        &backing_length
      ) != napi_ok
      || byte_offset > backing_length
      || observed_length > backing_length - byte_offset
      || (observed_length > 0u
        && (source == NULL
          || backing == NULL
          || (BYTE *)source != (BYTE *)backing + byte_offset))) {
    return throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "custody byte input is invalid"
    );
  }
  if (observed_length > 0u) {
    copy = (BYTE *)malloc(observed_length);
    if (copy == NULL) {
      return throw_failure(
        env,
        "E_EXEC_AUTH_NATIVE_ALLOCATION",
        "custody byte input copy allocation failed"
      );
    }
    memcpy(copy, source, observed_length);
  }
  if (napi_get_typedarray_info(
        env,
        value,
        &confirmed_type,
        &confirmed_length,
        &confirmed_source,
        &confirmed_array_buffer,
        &confirmed_offset
      ) != napi_ok
      || napi_strict_equals(
        env,
        array_buffer,
        confirmed_array_buffer,
        &same_array_buffer
      ) != napi_ok
      || !same_array_buffer
      || confirmed_type != napi_uint8_array
      || confirmed_length != observed_length
      || confirmed_offset != byte_offset
      || confirmed_source != source
      || napi_is_detached_arraybuffer(
        env,
        confirmed_array_buffer,
        &confirmed_detached
      ) != napi_ok
      || confirmed_detached) {
    secure_free_bytes(&copy, observed_length);
    return throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "custody byte input changed during native snapshot"
    );
  }
  *owned_data = copy;
  *length = observed_length;
  return true;
}

static bool parse_disposition(
  napi_env env,
  napi_value record,
  ULONG *disposition
) {
  napi_value value;
  napi_valuetype type;
  char buffer[32];
  size_t length;
  if (!get_named_value(env, record, "disposition", &value)
      || napi_typeof(env, value, &type) != napi_ok
      || type != napi_string
      || napi_get_value_string_utf8(
        env,
        value,
        buffer,
        sizeof(buffer),
        &length
      ) != napi_ok) {
    return throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "custody disposition is invalid"
    );
  }
  if (strcmp(buffer, DECKENT_CUSTODY_DISPOSITION_OPEN_EXISTING) == 0) {
    *disposition = FILE_OPEN;
  } else if (strcmp(buffer, DECKENT_CUSTODY_DISPOSITION_CREATE_NEW) == 0) {
    *disposition = FILE_CREATE;
  } else if (strcmp(buffer, DECKENT_CUSTODY_DISPOSITION_OPEN_OR_CREATE) == 0) {
    *disposition = FILE_OPEN_IF;
  } else {
    return throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "custody disposition is invalid"
    );
  }
  return true;
}

static bool valid_sid_bytes(const BYTE *sid_bytes, DWORD sid_length) {
  const SID *sid = (const SID *)sid_bytes;
  size_t required;
  if (sid_bytes == NULL || sid_length < 12u || sid->Revision != SID_REVISION
      || sid->SubAuthorityCount == 0u
      || sid->SubAuthorityCount > SID_MAX_SUB_AUTHORITIES) return false;
  required = 8u + (size_t)sid->SubAuthorityCount * sizeof(DWORD);
  return required == sid_length && required <= SECURITY_MAX_SID_SIZE;
}

static DWORD sid_byte_length(const SID *sid) {
  if (sid == NULL || sid->Revision != SID_REVISION
      || sid->SubAuthorityCount == 0u
      || sid->SubAuthorityCount > SID_MAX_SUB_AUTHORITIES) return 0u;
  return (DWORD)(8u + (size_t)sid->SubAuthorityCount * sizeof(DWORD));
}

static bool same_sid(
  const BYTE *left,
  DWORD left_length,
  const BYTE *right,
  DWORD right_length
) {
  return left_length == right_length
    && valid_sid_bytes(left, left_length)
    && valid_sid_bytes(right, right_length)
    && memcmp(left, right, left_length) == 0;
}

static bool format_sid(
  const BYTE *sid_bytes,
  DWORD sid_length,
  char output[185]
) {
  const SID *sid = (const SID *)sid_bytes;
  uint64_t authority = 0u;
  size_t used;
  DWORD index;
  int written;
  if (!valid_sid_bytes(sid_bytes, sid_length)) return false;
  for (index = 0u; index < 6u; index += 1u) {
    authority = (authority << 8u) | sid->IdentifierAuthority.Value[index];
  }
  written = snprintf(output, 185u, "S-1-%llu", (unsigned long long)authority);
  if (written < 0 || written >= 185) return false;
  used = (size_t)written;
  for (index = 0u; index < sid->SubAuthorityCount; index += 1u) {
    DWORD subauthority;
    memcpy(
      &subauthority,
      sid_bytes + 8u + (size_t)index * sizeof(DWORD),
      sizeof(subauthority)
    );
    written = snprintf(
      output + used,
      185u - used,
      "-%lu",
      (unsigned long)subauthority
    );
    if (written < 0 || (size_t)written >= 185u - used) return false;
    used += (size_t)written;
  }
  return true;
}

static bool copy_effective_owner_sid(
  napi_env env,
  BYTE output[SECURITY_MAX_SID_SIZE],
  DWORD *output_length
) {
  HANDLE token = NULL;
  DWORD needed = 0u;
  BYTE *buffer = NULL;
  TOKEN_USER *token_user;
  DWORD length;
  bool ok = false;
  bool token_close_confirmed = true;
  if (!deckent_api.open_thread_token(
        GetCurrentThread(),
        TOKEN_QUERY,
        TRUE,
        &token
      )) {
    if (GetLastError() != ERROR_NO_TOKEN
        || !deckent_api.open_process_token(
          GetCurrentProcess(),
          TOKEN_QUERY,
          &token
        )) {
      return throw_failure(
        env,
        DECKENT_NATIVE_ERROR_PRIVACY_UNCONFIRMED,
        "effective Win32 owner identity is unavailable"
      );
    }
  }
  if (deckent_api.get_token_information(
        token,
        TokenUser,
        NULL,
        0u,
        &needed
      ) || GetLastError() != ERROR_INSUFFICIENT_BUFFER
      || needed < sizeof(TOKEN_USER)) goto done;
  buffer = (BYTE *)calloc(1u, needed);
  if (buffer == NULL) {
    if (!CloseHandle(token)) {
      return throw_failure(
        env,
        DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "effective Win32 owner token cleanup was not confirmed"
      );
    }
    return throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "effective Win32 owner allocation failed"
    );
  }
  if (!deckent_api.get_token_information(
        token,
        TokenUser,
        buffer,
        needed,
        &needed
      )) goto done;
  token_user = (TOKEN_USER *)buffer;
  length = sid_byte_length((const SID *)token_user->User.Sid);
  if (length == 0u || length > SECURITY_MAX_SID_SIZE) goto done;
  memcpy(output, token_user->User.Sid, length);
  *output_length = length;
  ok = true;
done:
  free(buffer);
  if (token != NULL) token_close_confirmed = CloseHandle(token) != FALSE;
  if (!token_close_confirmed) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
      "effective Win32 owner token cleanup was not confirmed"
    );
  }
  if (!ok) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_PRIVACY_UNCONFIRMED,
      "effective Win32 owner identity is unavailable"
    );
  }
  return true;
}

static void free_security_material(deckent_security_material *material) {
  if (material == NULL) return;
  free(material->dacl);
  free(material->owner_sid);
  memset(material, 0, sizeof(*material));
}

static bool build_security_material(
  napi_env env,
  const BYTE *owner_sid,
  DWORD owner_sid_length,
  deckent_security_material *material
) {
  DWORD ace_size;
  memset(material, 0, sizeof(*material));
  if (!valid_sid_bytes(owner_sid, owner_sid_length)) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_PRIVACY_UNCONFIRMED,
      "Win32 owner identity is invalid"
    );
  }
  material->owner_sid = (BYTE *)malloc(owner_sid_length);
  if (material->owner_sid == NULL) goto allocation_failed;
  memcpy(material->owner_sid, owner_sid, owner_sid_length);
  material->owner_sid_length = owner_sid_length;
  ace_size = (DWORD)(sizeof(ACCESS_ALLOWED_ACE) - sizeof(DWORD))
    + owner_sid_length;
  if (ace_size > UINT32_MAX - sizeof(ACL)) goto allocation_failed;
  material->dacl_length = (DWORD)sizeof(ACL) + ace_size;
  material->dacl = (PACL)calloc(1u, material->dacl_length);
  if (material->dacl == NULL) goto allocation_failed;
  if (!deckent_api.initialize_acl(
        material->dacl,
        material->dacl_length,
        ACL_REVISION
      )
      || !deckent_api.add_access_allowed_ace_ex(
        material->dacl,
        ACL_REVISION,
        0u,
        DECKENT_OWNER_ALLOW_MASK,
        (PSID)material->owner_sid
      )
      || !deckent_api.initialize_security_descriptor(
        &material->descriptor,
        SECURITY_DESCRIPTOR_REVISION
      )
      || !deckent_api.set_security_descriptor_owner(
        &material->descriptor,
        (PSID)material->owner_sid,
        FALSE
      )
      || !deckent_api.set_security_descriptor_dacl(
        &material->descriptor,
        TRUE,
        material->dacl,
        FALSE
      )
      || !deckent_api.set_security_descriptor_control(
        &material->descriptor,
        SE_DACL_PROTECTED,
        SE_DACL_PROTECTED
      )) {
    free_security_material(material);
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_PRIVACY_UNCONFIRMED,
      "owner-private Win32 security could not be constructed"
    );
  }
  return true;
allocation_failed:
  free_security_material(material);
  return throw_failure(
    env,
    "E_EXEC_AUTH_NATIVE_ALLOCATION",
    "owner-private Win32 security allocation failed"
  );
}

static bool canonical_dacl_hash(
  napi_env env,
  const BYTE *owner_sid,
  DWORD owner_sid_length,
  BYTE output[32]
) {
  deckent_security_material material;
  DWORD required = 0u;
  BYTE *relative = NULL;
  bool ok = false;
  if (!build_security_material(
        env,
        owner_sid,
        owner_sid_length,
        &material
      )) return false;
  SetLastError(ERROR_SUCCESS);
  if (deckent_api.make_self_relative_sd(
        &material.descriptor,
        NULL,
        &required
      ) || GetLastError() != ERROR_INSUFFICIENT_BUFFER || required == 0u) {
    goto done;
  }
  relative = (BYTE *)calloc(1u, required);
  if (relative == NULL) {
    free_security_material(&material);
    return throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "canonical Win32 DACL allocation failed"
    );
  }
  if (!deckent_api.make_self_relative_sd(
        &material.descriptor,
        (PSECURITY_DESCRIPTOR)relative,
        &required
      )) goto done;
  {
    deckent_sha256_context hash;
    sha256_init(&hash);
    sha256_update(&hash, relative, required);
    sha256_finish(&hash, output);
  }
  ok = true;
done:
  free(relative);
  free_security_material(&material);
  if (!ok) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_PRIVACY_UNCONFIRMED,
      "canonical Win32 DACL could not be confirmed"
    );
  }
  return true;
}

static bool read_owner_private_security(
  napi_env env,
  HANDLE handle,
  const BYTE *expected_owner,
  DWORD expected_owner_length,
  BYTE owner_output[SECURITY_MAX_SID_SIZE],
  DWORD *owner_output_length,
  BYTE dacl_hash[32]
) {
  PSID owner = NULL;
  PACL dacl = NULL;
  PSECURITY_DESCRIPTOR descriptor = NULL;
  BOOL dacl_present = FALSE;
  BOOL dacl_defaulted = FALSE;
  SECURITY_DESCRIPTOR_CONTROL control = 0u;
  DWORD revision = 0u;
  ACL_SIZE_INFORMATION acl_info;
  ACCESS_ALLOWED_ACE *ace = NULL;
  DWORD ace_sid_length;
  DWORD owner_length;
  DWORD result;
  bool valid = false;
  memset(&acl_info, 0, sizeof(acl_info));
  result = deckent_api.get_security_info(
    handle,
    SE_FILE_OBJECT,
    OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
    &owner,
    NULL,
    &dacl,
    NULL,
    &descriptor
  );
  if (result != ERROR_SUCCESS || descriptor == NULL || owner == NULL
      || dacl == NULL
      || !deckent_api.get_security_descriptor_dacl(
        descriptor,
        &dacl_present,
        &dacl,
        &dacl_defaulted
      )
      || !dacl_present || dacl == NULL
      || !deckent_api.get_security_descriptor_control(
        descriptor,
        &control,
        &revision
      )
      || (control & SE_DACL_PROTECTED) == 0u
      || !deckent_api.get_acl_information(
        dacl,
        &acl_info,
        sizeof(acl_info),
        AclSizeInformation
      )
      || acl_info.AceCount != 1u
      || !deckent_api.get_ace(dacl, 0u, (LPVOID *)&ace)
      || ace == NULL
      || ace->Header.AceType != ACCESS_ALLOWED_ACE_TYPE
      || ace->Header.AceFlags != 0u
      || ace->Mask != DECKENT_OWNER_ALLOW_MASK
      || ace->Header.AceSize
        < offsetof(ACCESS_ALLOWED_ACE, SidStart) + 12u) goto done;
  ace_sid_length = sid_byte_length((const SID *)&ace->SidStart);
  if (ace_sid_length == 0u
      || offsetof(ACCESS_ALLOWED_ACE, SidStart) + ace_sid_length
        != ace->Header.AceSize) goto done;
  owner_length = sid_byte_length((const SID *)owner);
  if (owner_length == 0u || owner_length > SECURITY_MAX_SID_SIZE
      || !same_sid(
        (const BYTE *)owner,
        owner_length,
        (const BYTE *)&ace->SidStart,
        ace_sid_length
      )
      || (expected_owner != NULL
        && !same_sid(
          (const BYTE *)owner,
          owner_length,
          expected_owner,
          expected_owner_length
        ))) goto done;
  memcpy(owner_output, owner, owner_length);
  *owner_output_length = owner_length;
  if (!canonical_dacl_hash(
        env,
        owner_output,
        owner_length,
        dacl_hash
      )) goto done;
  valid = true;
done:
  if (descriptor != NULL) LocalFree(descriptor);
  if (!valid) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_PRIVACY_UNCONFIRMED,
      "owner-private Win32 DACL readback failed"
    );
  }
  return true;
}

static bool ascii_equal_folded(
  const WCHAR *text,
  size_t length,
  const char *ascii
) {
  size_t index;
  if (strlen(ascii) != length) return false;
  for (index = 0u; index < length; index += 1u) {
    WCHAR value = text[index];
    char expected = ascii[index];
    if (value >= L'a' && value <= L'z') value -= (WCHAR)(L'a' - L'A');
    if (expected >= 'a' && expected <= 'z') expected -= (char)('a' - 'A');
    if (value != (WCHAR)(unsigned char)expected) return false;
  }
  return true;
}

static bool valid_component_text(const WCHAR *text, size_t length) {
  static const char *const reserved[] = { "CON", "PRN", "AUX", "NUL" };
  size_t base_length = length;
  size_t index;
  if (text == NULL || length == 0u || length > DECKENT_COMPONENT_MAX_UNITS
      || (length == 1u && text[0] == L'.')
      || (length == 2u && text[0] == L'.' && text[1] == L'.')
      || text[length - 1u] == L'.' || text[length - 1u] == L' ') return false;
  for (index = 0u; index < length; index += 1u) {
    WCHAR value = text[index];
    if (value == L'.' && base_length == length) base_length = index;
    if (value < 0x20u || value == L'/' || value == L'\\'
        || value == L'<' || value == L'>' || value == L':'
        || value == L'"' || value == L'|' || value == L'?'
        || value == L'*') return false;
    if (value >= 0xd800u && value <= 0xdbffu) {
      if (index + 1u >= length
          || text[index + 1u] < 0xdc00u
          || text[index + 1u] > 0xdfffu) return false;
      index += 1u;
    } else if (value >= 0xdc00u && value <= 0xdfffu) {
      return false;
    }
  }
  for (index = 0u; index < sizeof(reserved) / sizeof(reserved[0]); index += 1u) {
    if (ascii_equal_folded(text, base_length, reserved[index])) return false;
  }
  if (base_length == 4u
      && ((ascii_equal_folded(text, 3u, "COM")
          || ascii_equal_folded(text, 3u, "LPT"))
        && text[3] >= L'1' && text[3] <= L'9')) return false;
  return true;
}

static WCHAR *duplicate_component(const WCHAR *component, size_t length) {
  WCHAR *copy;
  if (!valid_component_text(component, length)
      || length > (SIZE_MAX / sizeof(WCHAR)) - 1u) return NULL;
  copy = (WCHAR *)calloc(length + 1u, sizeof(WCHAR));
  if (copy != NULL) memcpy(copy, component, length * sizeof(WCHAR));
  return copy;
}

static void initialize_object_attributes_exact(
  OBJECT_ATTRIBUTES *attributes,
  UNICODE_STRING *name,
  HANDLE root,
  PSECURITY_DESCRIPTOR security_descriptor
) {
  memset(attributes, 0, sizeof(*attributes));
  attributes->Length = sizeof(*attributes);
  attributes->RootDirectory = root;
  attributes->Attributes = OBJ_CASE_INSENSITIVE | OBJ_DONT_REPARSE;
  attributes->ObjectName = name;
  attributes->SecurityDescriptor = security_descriptor;
  attributes->SecurityQualityOfService = NULL;
}

static NTSTATUS nt_open_exact_with_share(
  HANDLE parent,
  const WCHAR *name,
  size_t name_length,
  ACCESS_MASK desired_access,
  ULONG disposition,
  bool directory,
  PSECURITY_DESCRIPTOR creation_security,
  ULONG share_access,
  HANDLE *handle,
  ULONG_PTR *information
) {
  UNICODE_STRING unicode_name;
  OBJECT_ATTRIBUTES attributes;
  IO_STATUS_BLOCK io_status;
  ULONG options = FILE_OPEN_REPARSE_POINT | FILE_SYNCHRONOUS_IO_NONALERT
    | (directory ? FILE_DIRECTORY_FILE : FILE_NON_DIRECTORY_FILE);
  NTSTATUS status;
  if (name == NULL || name_length == 0u
      || name_length > USHRT_MAX / sizeof(WCHAR)) {
    return STATUS_OBJECT_NAME_INVALID;
  }
  unicode_name.Buffer = (PWSTR)name;
  unicode_name.Length = (USHORT)(name_length * sizeof(WCHAR));
  unicode_name.MaximumLength = unicode_name.Length;
  initialize_object_attributes_exact(
    &attributes,
    &unicode_name,
    parent,
    creation_security
  );
  memset(&io_status, 0, sizeof(io_status));
  *handle = INVALID_HANDLE_VALUE;
  status = deckent_api.nt_create_file(
    handle,
    desired_access,
    &attributes,
    &io_status,
    NULL,
    FILE_ATTRIBUTE_NORMAL,
    share_access,
    disposition,
    options,
    NULL,
    0u
  );
  if (status >= 0 && information != NULL) *information = io_status.Information;
  return status;
}

static NTSTATUS nt_open_exact(
  HANDLE parent,
  const WCHAR *name,
  size_t name_length,
  ACCESS_MASK desired_access,
  ULONG disposition,
  bool directory,
  PSECURITY_DESCRIPTOR creation_security,
  HANDLE *handle,
  ULONG_PTR *information
) {
  return nt_open_exact_with_share(
    parent,
    name,
    name_length,
    desired_access,
    disposition,
    directory,
    creation_security,
    FILE_SHARE_READ | FILE_SHARE_DELETE
      | (directory ? FILE_SHARE_WRITE : 0u),
    handle,
    information
  );
}

static bool throw_nt_open_failure(napi_env env, NTSTATUS status) {
  ULONG error;
  if (status == DECKENT_STATUS_REPARSE_POINT_ENCOUNTERED
      || status == DECKENT_STATUS_STOPPED_ON_SYMLINK) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_REPARSE_REJECTED,
      "Win32 reparse traversal was rejected"
    );
  }
  error = deckent_api.rtl_nt_status_to_dos_error(status);
  if (error == ERROR_FILE_NOT_FOUND || error == ERROR_PATH_NOT_FOUND
      || error == ERROR_INVALID_NAME) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_NOT_FOUND,
      "Win32 custody object was not found"
    );
  }
  if (error == ERROR_FILE_EXISTS || error == ERROR_ALREADY_EXISTS) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_ALREADY_EXISTS,
      "Win32 custody object already exists"
    );
  }
  if (error == ERROR_ACCESS_DENIED || error == ERROR_PRIVILEGE_NOT_HELD) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_PRIVACY_UNCONFIRMED,
      "Win32 custody access could not be confirmed"
    );
  }
  if (error == ERROR_NOT_SUPPORTED || error == ERROR_INVALID_FUNCTION) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_VOLUME_UNSUPPORTED,
      "Win32 custody primitive is unsupported on this volume"
    );
  }
  return throw_failure(
    env,
    "E_EXEC_AUTH_NATIVE_OPERATION",
    "Win32 custody open failed"
  );
}

static bool duplicate_handle_owned(HANDLE source, HANDLE *duplicate) {
  *duplicate = INVALID_HANDLE_VALUE;
  return source != NULL && source != INVALID_HANDLE_VALUE
    && DuplicateHandle(
      GetCurrentProcess(),
      source,
      GetCurrentProcess(),
      duplicate,
      0u,
      FALSE,
      DUPLICATE_SAME_ACCESS
    );
}

static bool flush_exact_handle(HANDLE handle) {
  return handle != NULL && handle != INVALID_HANDLE_VALUE
    && FlushFileBuffers(handle) != FALSE;
}

static bool query_identity(
  napi_env env,
  HANDLE handle,
  const BYTE *expected_owner,
  DWORD expected_owner_length,
  int expected_type,
  deckent_win32_identity *identity
) {
  deckent_file_id_information file_id;
  FILE_STANDARD_INFO standard;
  deckent_file_attribute_tag_information tag;
  deckent_file_fs_device_information device;
  IO_STATUS_BLOCK io_status;
  DWORD volume_flags = 0u;
  DWORD maximum_component = 0u;
  bool directory;
  memset(identity, 0, sizeof(*identity));
  memset(&file_id, 0, sizeof(file_id));
  memset(&standard, 0, sizeof(standard));
  memset(&tag, 0, sizeof(tag));
  memset(&device, 0, sizeof(device));
  memset(&io_status, 0, sizeof(io_status));
  if (!GetFileInformationByHandleEx(
        handle,
        (FILE_INFO_BY_HANDLE_CLASS)18,
        &file_id,
        sizeof(file_id)
      )
      || !GetFileInformationByHandleEx(
        handle,
        FileStandardInfo,
        &standard,
        sizeof(standard)
      )
      || !GetFileInformationByHandleEx(
        handle,
        (FILE_INFO_BY_HANDLE_CLASS)9,
        &tag,
        sizeof(tag)
      )) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_VOLUME_UNSUPPORTED,
      "stable Win32 file identity is unavailable"
    );
  }
  if ((tag.file_attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0u
      || tag.reparse_tag != 0u) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_REPARSE_REJECTED,
      "Win32 reparse object was rejected"
    );
  }
  if (deckent_api.nt_query_volume_information_file(
        handle,
        &io_status,
        &device,
        sizeof(device),
        DECKENT_FILE_FS_DEVICE_INFORMATION_CLASS
      ) < 0) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_VOLUME_UNSUPPORTED,
      "Win32 volume identity is unavailable"
    );
  }
  if ((device.characteristics & DECKENT_FILE_REMOTE_DEVICE) != 0u) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_REMOTE_VOLUME_UNSUPPORTED,
      "remote Win32 volumes are unsupported for custody"
    );
  }
  if (!GetVolumeInformationByHandleW(
        handle,
        NULL,
        0u,
        NULL,
        &maximum_component,
        &volume_flags,
        NULL,
        0u
      )
      || (volume_flags & FILE_PERSISTENT_ACLS) == 0u) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_VOLUME_UNSUPPORTED,
      "persistent Win32 ACL support is unavailable"
    );
  }
  (void)maximum_component;
  directory = standard.Directory != FALSE;
  if ((expected_type == 1 && !directory)
      || (expected_type == 0 && directory)) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_OBJECT_TYPE_MISMATCH,
      "Win32 custody object type is invalid"
    );
  }
  if (standard.EndOfFile.QuadPart < 0) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_SIZE_LIMIT,
      "Win32 custody size is invalid"
    );
  }
  if (!directory && standard.NumberOfLinks != 1u) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_LINK_COUNT_UNSAFE,
      "Win32 custody file has an unsafe link count"
    );
  }
  identity->volume_serial = file_id.volume_serial_number;
  memcpy(identity->file_id, file_id.file_id.identifier, sizeof(identity->file_id));
  identity->size = (ULONGLONG)standard.EndOfFile.QuadPart;
  identity->link_count = standard.NumberOfLinks;
  identity->reparse_tag = tag.reparse_tag;
  identity->directory = directory;
  identity->volume_flags = volume_flags;
  if (!read_owner_private_security(
        env,
        handle,
        expected_owner,
        expected_owner_length,
        identity->owner_sid,
        &identity->owner_sid_length,
        identity->dacl_hash
      )) return false;
  identity->evidence_bits = DECKENT_WIN32_BASE_EVIDENCE;
  return true;
}

static bool same_identity_value(
  const deckent_win32_identity *left,
  const deckent_win32_identity *right
) {
  return left->volume_serial == right->volume_serial
    && memcmp(left->file_id, right->file_id, sizeof(left->file_id)) == 0
    && left->size == right->size
    && left->link_count == right->link_count
    && left->reparse_tag == right->reparse_tag
    && left->directory == right->directory
    && same_sid(
      left->owner_sid,
      left->owner_sid_length,
      right->owner_sid,
      right->owner_sid_length
    )
    && memcmp(left->dacl_hash, right->dacl_hash, sizeof(left->dacl_hash)) == 0
    && left->volume_flags == right->volume_flags;
}

static bool same_directory_authority(
  const deckent_win32_identity *left,
  const deckent_win32_identity *right
) {
  return left != NULL
    && right != NULL
    && left->directory
    && right->directory
    && left->volume_serial == right->volume_serial
    && memcmp(left->file_id, right->file_id, sizeof(left->file_id)) == 0
    && left->link_count == right->link_count
    && left->reparse_tag == right->reparse_tag
    && same_sid(
      left->owner_sid,
      left->owner_sid_length,
      right->owner_sid,
      right->owner_sid_length
    )
    && memcmp(left->dacl_hash, right->dacl_hash, sizeof(left->dacl_hash)) == 0
    && left->volume_flags == right->volume_flags;
}

static bool revalidate_directory_authority(
  napi_env env,
  HANDLE handle,
  const BYTE *owner_sid,
  DWORD owner_sid_length,
  const deckent_win32_identity *expected,
  deckent_win32_identity *current
) {
  if (!query_identity(
        env,
        handle,
        owner_sid,
        owner_sid_length,
        1,
        current
      )) return false;
  if (!same_directory_authority(expected, current)) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "Win32 parent directory authority changed"
    );
  }
  return true;
}

static bool copy_bound_current_owner(
  napi_env env,
  const BYTE *expected_owner,
  DWORD expected_owner_length,
  BYTE output[SECURITY_MAX_SID_SIZE],
  DWORD *output_length
) {
  if (!copy_effective_owner_sid(env, output, output_length)) return false;
  if (!same_sid(
        output,
        *output_length,
        expected_owner,
        expected_owner_length
      )) {
    SecureZeroMemory(output, SECURITY_MAX_SID_SIZE);
    *output_length = 0u;
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_PRIVACY_UNCONFIRMED,
      "current Win32 principal does not own the retained parent authority"
    );
  }
  return true;
}

static bool validate_bound_current_owner(
  napi_env env,
  const BYTE *expected_owner,
  DWORD expected_owner_length
) {
  /*
   * Custody is bounded to one effective SID. A thread impersonation change is
   * never allowed to reuse an authority retained under another principal.
   */
  BYTE current_owner[SECURITY_MAX_SID_SIZE];
  DWORD current_owner_length = 0u;
  bool confirmed;
  memset(current_owner, 0, sizeof(current_owner));
  confirmed = copy_bound_current_owner(
    env,
    expected_owner,
    expected_owner_length,
    current_owner,
    &current_owner_length
  );
  SecureZeroMemory(current_owner, sizeof(current_owner));
  return confirmed;
}

static bool capture_rollback_identity(
  HANDLE handle,
  deckent_win32_identity *identity
) {
  deckent_file_id_information file_id;
  FILE_STANDARD_INFO standard;
  deckent_file_attribute_tag_information tag;
  memset(identity, 0, sizeof(*identity));
  if (!GetFileInformationByHandleEx(
        handle,
        (FILE_INFO_BY_HANDLE_CLASS)18,
        &file_id,
        sizeof(file_id)
      )
      || !GetFileInformationByHandleEx(
        handle,
        FileStandardInfo,
        &standard,
        sizeof(standard)
      )
      || !GetFileInformationByHandleEx(
        handle,
        (FILE_INFO_BY_HANDLE_CLASS)9,
        &tag,
        sizeof(tag)
      )
      || (tag.file_attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0u
      || tag.reparse_tag != 0u) return false;
  identity->volume_serial = file_id.volume_serial_number;
  memcpy(identity->file_id, file_id.file_id.identifier, sizeof(identity->file_id));
  identity->directory = standard.Directory != FALSE;
  identity->reparse_tag = tag.reparse_tag;
  return true;
}

static bool same_rollback_identity(
  const deckent_win32_identity *left,
  const deckent_win32_identity *right
) {
  return left->volume_serial == right->volume_serial
    && memcmp(left->file_id, right->file_id, sizeof(left->file_id)) == 0
    && left->directory == right->directory
    && left->reparse_tag == right->reparse_tag;
}

static bool format_fixed_hex(
  char *output,
  size_t output_size,
  const BYTE *bytes,
  size_t byte_count
) {
  static const char digits[] = "0123456789abcdef";
  size_t index;
  if (output_size != 2u + byte_count * 2u + 1u) return false;
  output[0] = '0';
  output[1] = 'x';
  for (index = 0u; index < byte_count; index += 1u) {
    output[2u + index * 2u] = digits[bytes[index] >> 4u];
    output[3u + index * 2u] = digits[bytes[index] & 0x0fu];
  }
  output[output_size - 1u] = '\0';
  return true;
}

static bool format_u32_hex(DWORD value, char output[11]) {
  int written = snprintf(output, 11u, "0x%08lx", (unsigned long)value);
  return written == 10;
}

static bool format_u64_hex(ULONGLONG value, char output[19]) {
  int written = snprintf(
    output,
    19u,
    "0x%016llx",
    (unsigned long long)value
  );
  return written == 18;
}

static bool format_decimal_u64(ULONGLONG value, char output[21]) {
  int written = snprintf(output, 21u, "%llu", (unsigned long long)value);
  return written > 0 && written < 21;
}

static bool format_decimal_u32(DWORD value, char output[11]) {
  int written = snprintf(output, 11u, "%lu", (unsigned long)value);
  return written > 0 && written < 11;
}

static bool create_volume_capabilities(
  napi_env env,
  DWORD volume_flags,
  napi_value *output
) {
  const char *values[5];
  size_t count = 0u;
  size_t index;
  napi_value array;
  if ((volume_flags & FILE_SUPPORTS_HARD_LINKS) != 0u) {
    values[count++] = DECKENT_CUSTODY_VOLUME_CAP_HARD_LINKS;
  }
  values[count++] = DECKENT_CUSTODY_VOLUME_CAP_NO_REPLACE_PUBLISH;
  values[count++] = DECKENT_CUSTODY_VOLUME_CAP_PERSISTENT_ACL;
  if ((volume_flags & FILE_SUPPORTS_REPARSE_POINTS) != 0u) {
    values[count++] = DECKENT_CUSTODY_VOLUME_CAP_REPARSE_POINTS;
  }
  values[count++] = DECKENT_CUSTODY_VOLUME_CAP_STABLE_OBJECT_ID;
  if (napi_create_array_with_length(env, count, &array) != napi_ok) return false;
  for (index = 0u; index < count; index += 1u) {
    napi_value entry;
    if (napi_create_string_utf8(
          env,
          values[index],
          NAPI_AUTO_LENGTH,
          &entry
        ) != napi_ok
        || !deckent_native_define_own_index(
          env,
          array,
          (uint32_t)index,
          entry
        )) {
      ensure_pending_failure(
        env,
        "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
        "Win32 custody capability entry could not be created"
      );
      return false;
    }
  }
  if (!freeze_object(env, array)) return false;
  *output = array;
  return true;
}

static bool populate_identity_record(
  napi_env env,
  napi_value record,
  const deckent_win32_identity *identity
) {
  char size[21];
  char link_count[11];
  char volume_id[19];
  char file_id[35];
  char reparse_tag[11];
  char owner_sid[185];
  char entry_count[11];
  char owner_mask[11];
  char hash[72];
  napi_value capabilities;
  size_t index;
  if (!format_decimal_u64(identity->size, size)
      || !format_decimal_u32(identity->link_count, link_count)
      || !format_u64_hex(identity->volume_serial, volume_id)
      || !format_fixed_hex(
        file_id,
        sizeof(file_id),
        identity->file_id,
        sizeof(identity->file_id)
      )
      || !format_u32_hex(identity->reparse_tag, reparse_tag)
      || !format_sid(identity->owner_sid, identity->owner_sid_length, owner_sid)
      || !format_decimal_u32(1u, entry_count)
      || !format_u32_hex(DECKENT_OWNER_ALLOW_MASK, owner_mask)
      || !create_volume_capabilities(env, identity->volume_flags, &capabilities)) {
    return false;
  }
  memcpy(hash, "sha256:", 7u);
  for (index = 0u; index < sizeof(identity->dacl_hash); index += 1u) {
    static const char digits[] = "0123456789abcdef";
    hash[7u + index * 2u] = digits[identity->dacl_hash[index] >> 4u];
    hash[8u + index * 2u] = digits[identity->dacl_hash[index] & 0x0fu];
  }
  hash[71] = '\0';
  return napi_set_uint32_value(env, record, "schemaVersion", 1u)
    && napi_set_string(env, record, "kind", "custody-identity")
    && napi_set_string(env, record, "platform", "win32")
    && napi_set_string(
      env,
      record,
      "objectType",
      identity->directory ? "DIRECTORY" : "REGULAR_FILE"
    )
    && napi_set_string(env, record, "size", size)
    && napi_set_string(env, record, "linkCount", link_count)
    && napi_set_null_value(env, record, "mntId")
    && napi_set_null_value(env, record, "dev")
    && napi_set_null_value(env, record, "ino")
    && napi_set_null_value(env, record, "fsMagic")
    && napi_set_null_value(env, record, "mode")
    && napi_set_null_value(env, record, "ownerUid")
    && napi_set_string(env, record, "volumeId", volume_id)
    && napi_set_string(env, record, "fileId", file_id)
    && napi_set_string(env, record, "reparseTag", reparse_tag)
    && napi_set_string(env, record, "ownerSid", owner_sid)
    && napi_set_boolean_value(env, record, "daclPresent", true)
    && napi_set_boolean_value(env, record, "daclProtected", true)
    && napi_set_string(env, record, "daclEntryCount", entry_count)
    && napi_set_string(env, record, "daclOwnerAllowMask", owner_mask)
    && napi_set_string(env, record, "daclCanonicalHash", hash)
    && napi_set_boolean_value(env, record, "volumeRemote", false)
    && napi_set_value(env, record, "volumeCapabilities", capabilities)
    && napi_set_uint32_value(
      env,
      record,
      "featureEvidenceBits",
      identity->evidence_bits
    );
}

static bool create_nested_identity(
  napi_env env,
  const deckent_win32_identity *identity,
  napi_value *output
) {
  napi_value record;
  if (napi_create_object(env, &record) != napi_ok
      || !populate_identity_record(env, record, identity)
      || !freeze_object(env, record)) {
    return throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "Win32 identity result could not be constructed"
    );
  }
  *output = record;
  return true;
}

static int close_win32_resource(uintptr_t raw_resource) {
  deckent_win32_resource *resource = (deckent_win32_resource *)raw_resource;
  int uncertain = 0;
  if (resource == NULL || resource->magic != DECKENT_RESOURCE_MAGIC) return 1;
  resource->magic = 0u;
  if (resource->handle != NULL && resource->handle != INVALID_HANDLE_VALUE
      && !CloseHandle(resource->handle)) uncertain = 1;
  if (resource->parent != NULL && resource->parent != INVALID_HANDLE_VALUE
      && !CloseHandle(resource->parent)) uncertain = 1;
  free(resource->component);
  SecureZeroMemory(resource->owner_sid, sizeof(resource->owner_sid));
  free(resource);
  return uncertain;
}

static int close_win32_publication(uintptr_t raw_resource);

static deckent_win32_resource *borrow_directory_resource(
  napi_env env,
  deckent_native_borrow *borrow
) {
  deckent_win32_resource *resource =
    (deckent_win32_resource *)borrow->resource;
  if (resource == NULL || resource->magic != DECKENT_RESOURCE_MAGIC
      || !resource->directory || resource->handle == INVALID_HANDLE_VALUE) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_CONTRACT",
      "Win32 directory resource contract is invalid"
    );
    return NULL;
  }
  if (!validate_bound_current_owner(
        env,
        resource->owner_sid,
        resource->owner_sid_length
      )) return NULL;
  return resource;
}

static deckent_win32_resource *borrow_file_resource(
  napi_env env,
  deckent_native_borrow *borrow
) {
  deckent_win32_resource *resource =
    (deckent_win32_resource *)borrow->resource;
  if (resource == NULL || resource->magic != DECKENT_RESOURCE_MAGIC
      || resource->directory || resource->handle == INVALID_HANDLE_VALUE) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_CONTRACT",
      "Win32 file resource contract is invalid"
    );
    return NULL;
  }
  if (!validate_bound_current_owner(
        env,
        resource->owner_sid,
        resource->owner_sid_length
      )) return NULL;
  return resource;
}

static deckent_win32_publication *borrow_publication_resource(
  napi_env env,
  deckent_native_borrow *borrow
) {
  deckent_win32_publication *resource =
    (deckent_win32_publication *)borrow->resource;
  if (resource == NULL || resource->magic != DECKENT_PUBLICATION_MAGIC
      || resource->staging == INVALID_HANDLE_VALUE
      || resource->parent == INVALID_HANDLE_VALUE) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_CONTRACT",
      "Win32 publication resource contract is invalid"
    );
    return NULL;
  }
  if (!validate_bound_current_owner(
        env,
        resource->owner_sid,
        resource->owner_sid_length
      )) return NULL;
  return resource;
}

static bool close_owned_handle(HANDLE *handle) {
  bool confirmed = true;
  if (handle != NULL && *handle != NULL && *handle != INVALID_HANDLE_VALUE) {
    confirmed = CloseHandle(*handle) != FALSE;
    *handle = INVALID_HANDLE_VALUE;
  }
  return confirmed;
}

static bool nt_status_is_not_found(NTSTATUS status) {
  ULONG error;
  if (status >= 0) return false;
  error = deckent_api.rtl_nt_status_to_dos_error(status);
  return error == ERROR_FILE_NOT_FOUND || error == ERROR_PATH_NOT_FOUND
    || error == ERROR_INVALID_NAME;
}

static bool rollback_named_create(
  HANDLE *target,
  HANDLE parent,
  const WCHAR *component,
  bool directory,
  const deckent_win32_identity *created_identity
) {
  deckent_win32_identity current_identity;
  deckent_file_disposition_info_ex disposition;
  HANDLE verification = INVALID_HANDLE_VALUE;
  ULONG_PTR information = 0u;
  NTSTATUS status;
  bool confirmed = true;
  if (target == NULL || *target == INVALID_HANDLE_VALUE
      || parent == INVALID_HANDLE_VALUE || component == NULL
      || !capture_rollback_identity(*target, &current_identity)
      || !same_rollback_identity(&current_identity, created_identity)
      || current_identity.directory != directory) {
    confirmed = false;
  }
  if (confirmed) {
    disposition.flags = DECKENT_FILE_DISPOSITION_FLAG_DELETE;
    if (!SetFileInformationByHandle(
          *target,
          DECKENT_FILE_DISPOSITION_INFO_EX_CLASS,
          &disposition,
          sizeof(disposition)
        )) confirmed = false;
  }
  if (!close_owned_handle(target)) confirmed = false;
  if (confirmed) {
    status = nt_open_exact(
      parent,
      component,
      wcslen(component),
      directory ? DECKENT_TRAVERSE_ACCESS : DECKENT_READ_FILE_ACCESS,
      FILE_OPEN,
      directory,
      NULL,
      &verification,
      &information
    );
    if (status >= 0) {
      if (!close_owned_handle(&verification)) confirmed = false;
      confirmed = false;
    } else if (!nt_status_is_not_found(status)) {
      confirmed = false;
    }
  }
  if (!flush_exact_handle(parent)) confirmed = false;
  return confirmed;
}

static deckent_win32_resource *create_resource(
  HANDLE target,
  HANDLE parent,
  WCHAR *component,
  uint64_t parent_generation,
  bool directory,
  const BYTE *owner_sid,
  DWORD owner_sid_length,
  const deckent_win32_identity *identity
) {
  deckent_win32_resource *resource;
  if (!valid_sid_bytes(owner_sid, owner_sid_length)
      || identity == NULL
      || identity->directory != directory
      || !same_sid(
        owner_sid,
        owner_sid_length,
        identity->owner_sid,
        identity->owner_sid_length
      )) return NULL;
  resource = (deckent_win32_resource *)calloc(1u, sizeof(*resource));
  if (resource == NULL) return NULL;
  resource->magic = DECKENT_RESOURCE_MAGIC;
  resource->handle = target;
  resource->parent = parent;
  resource->component = component;
  resource->parent_generation = parent_generation;
  resource->directory = directory;
  memcpy(resource->owner_sid, owner_sid, owner_sid_length);
  resource->owner_sid_length = owner_sid_length;
  resource->identity = *identity;
  return resource;
}

static napi_value finish_open_result(
  napi_env env,
  deckent_native_state *state,
  deckent_custody_operation operation,
  deckent_native_handle_kind kind,
  HANDLE target,
  HANDLE parent,
  WCHAR *component,
  uint64_t parent_generation,
  bool directory,
  bool created,
  const BYTE *owner_sid,
  DWORD owner_sid_length,
  const deckent_win32_identity *identity
) {
  napi_value result = NULL;
  napi_value identity_value = NULL;
  napi_value opaque_handle = NULL;
  deckent_win32_resource *resource = NULL;
  HANDLE cleanup_target = INVALID_HANDLE_VALUE;
  HANDLE cleanup_parent = INVALID_HANDLE_VALUE;
  bool construction_ok = false;
  bool rollback_confirmed = true;
  bool cleanup_confirmed = true;
  WCHAR *resource_component = NULL;
  if (created
      && (!duplicate_handle_owned(target, &cleanup_target)
        || !duplicate_handle_owned(parent, &cleanup_parent))) {
    if (!close_owned_handle(&cleanup_target)) cleanup_confirmed = false;
    if (!close_owned_handle(&cleanup_parent)) cleanup_confirmed = false;
    rollback_confirmed = rollback_named_create(
      &target,
      parent,
      component,
      directory,
      identity
    );
    if (!close_owned_handle(&parent)) cleanup_confirmed = false;
    free(component);
    if (!rollback_confirmed || !cleanup_confirmed) {
      return deckent_native_throw(
        env,
        DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
        "Win32 named create rollback could not be confirmed"
      );
    }
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "Win32 create cleanup authority could not be retained"
    );
  }
  result = deckent_native_create_result_record(env);
  if (result != NULL
      && create_nested_identity(env, identity, &identity_value)
      && napi_set_uint32_value(env, result, "schemaVersion", 1u)
      && napi_set_string(env, result, "kind", "custody-open")
      && napi_set_string(env, result, "state", created ? "CREATED" : "OPENED")
      && napi_set_value(env, result, "identity", identity_value)) {
    resource_component = duplicate_component(component, wcslen(component));
    resource = create_resource(
      target,
      parent,
      resource_component,
      parent_generation,
      directory,
      owner_sid,
      owner_sid_length,
      identity
    );
    if (resource != NULL) {
      resource_component = NULL;
      target = INVALID_HANDLE_VALUE;
      parent = INVALID_HANDLE_VALUE;
      opaque_handle = deckent_native_create_handle(
        env,
        state,
        kind,
        directory ? DECKENT_DIRECTORY_RIGHTS : DECKENT_READ_RIGHTS,
        (uintptr_t)resource,
        close_win32_resource
      );
      resource = NULL;
      if (opaque_handle != NULL
          && napi_set_value(env, result, "handle", opaque_handle)
          && deckent_native_finalize_result_record(env, result, operation)) {
        construction_ok = true;
      }
    }
  }
  if (construction_ok) {
    bool cleanup_closed = close_owned_handle(&cleanup_target);
    if (!close_owned_handle(&cleanup_parent)) cleanup_closed = false;
    if (cleanup_closed) {
      free(component);
      return result;
    }
    cleanup_confirmed = false;
  }
  if (opaque_handle != NULL) {
    deckent_native_retire_result retired = deckent_native_retire_handle(
      env,
      state,
      opaque_handle,
      kind,
      directory ? DECKENT_DIRECTORY_RIGHTS : DECKENT_READ_RIGHTS,
      DECKENT_NATIVE_HANDLE_STATE_OPEN
    );
    if (retired != DECKENT_NATIVE_RETIRE_CONFIRMED) {
      cleanup_confirmed = false;
      rollback_confirmed = false;
    }
  }
  if (created) {
    if (!close_owned_handle(&target)) rollback_confirmed = false;
    if (cleanup_target != INVALID_HANDLE_VALUE
        && cleanup_parent != INVALID_HANDLE_VALUE) {
      if (!rollback_named_create(
            &cleanup_target,
            cleanup_parent,
            component,
            directory,
            identity
          )) rollback_confirmed = false;
    } else {
      rollback_confirmed = false;
    }
  }
  if (!close_owned_handle(&cleanup_target)) cleanup_confirmed = false;
  if (!close_owned_handle(&cleanup_parent)) cleanup_confirmed = false;
  if (!close_owned_handle(&target)) cleanup_confirmed = false;
  if (!close_owned_handle(&parent)) cleanup_confirmed = false;
  free(resource_component);
  free(component);
  ensure_pending_failure(
    env,
    "E_EXEC_AUTH_NATIVE_ALLOCATION",
    "Win32 custody open result could not be constructed"
  );
  if (created && (!rollback_confirmed || !cleanup_confirmed)) {
    clear_pending_exception(env);
    return deckent_native_throw(
      env,
      DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
      "Win32 named create rollback could not be confirmed"
    );
  }
  if (!created && !cleanup_confirmed) {
    clear_pending_exception(env);
    return deckent_native_throw(
      env,
      DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
      "Win32 rejected open cleanup could not be confirmed"
    );
  }
  return NULL;
}

static napi_value open_child_operation(
  napi_env env,
  deckent_native_state *state,
  deckent_custody_operation operation,
  napi_value record,
  bool directory
) {
  napi_value parent_value;
  WCHAR *component = NULL;
  size_t component_length = 0u;
  ULONG disposition;
  deckent_native_borrow borrow;
  deckent_win32_resource *parent_resource;
  deckent_security_material security;
  BYTE owner_sid[SECURITY_MAX_SID_SIZE];
  DWORD owner_sid_length = 0u;
  HANDLE target = INVALID_HANDLE_VALUE;
  HANDLE owned_parent = INVALID_HANDLE_VALUE;
  ULONG_PTR information = 0u;
  NTSTATUS status;
  bool created = false;
  bool borrow_ended = false;
  uint64_t parent_generation = 0u;
  deckent_win32_identity parent_source_identity;
  deckent_win32_identity parent_duplicate_identity;
  deckent_win32_identity identity;
  deckent_win32_identity rollback_identity;
  bool rollback_captured = false;
  bool cleanup_confirmed = true;
  memset(&borrow, 0, sizeof(borrow));
  memset(&security, 0, sizeof(security));
  memset(&parent_source_identity, 0, sizeof(parent_source_identity));
  memset(&parent_duplicate_identity, 0, sizeof(parent_duplicate_identity));
  memset(&identity, 0, sizeof(identity));
  memset(&rollback_identity, 0, sizeof(rollback_identity));
  if (!get_named_value(env, record, "parent", &parent_value)
      || !get_named_utf16(
        env,
        record,
        "name",
        DECKENT_COMPONENT_MAX_UNITS,
        &component,
        &component_length
      )
      || !valid_component_text(component, component_length)
      || !parse_disposition(env, record, &disposition)
      || !get_named_exact_utf8(
        env,
        record,
        "privacyPolicy",
        DECKENT_CUSTODY_PRIVACY_OWNER_PRIVATE
      )) goto failed;
  if (!directory && disposition != FILE_OPEN) {
    throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "custody read-file disposition must be OPEN_EXISTING"
    );
    goto failed;
  }
  if (!deckent_native_borrow_handle(
        env,
        state,
        parent_value,
        DECKENT_NATIVE_HANDLE_ANY,
        DECKENT_NATIVE_RIGHT_TRAVERSE,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &borrow
      )) goto failed;
  parent_resource = borrow_directory_resource(env, &borrow);
  if (parent_resource == NULL) goto failed;
  parent_generation = borrow.generation;
  if (!revalidate_directory_authority(
        env,
        parent_resource->handle,
        parent_resource->owner_sid,
        parent_resource->owner_sid_length,
        &parent_resource->identity,
        &parent_source_identity
      )
      || !copy_bound_current_owner(
        env,
        parent_resource->owner_sid,
        parent_resource->owner_sid_length,
        owner_sid,
        &owner_sid_length
      )) goto failed;
  if (!duplicate_handle_owned(parent_resource->handle, &owned_parent)) {
    throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_OPERATION",
      "Win32 parent authority could not be retained"
    );
    goto failed;
  }
  if (!revalidate_directory_authority(
        env,
        owned_parent,
        parent_resource->owner_sid,
        parent_resource->owner_sid_length,
        &parent_source_identity,
        &parent_duplicate_identity
      )) goto failed;
  if (disposition != FILE_OPEN
      && !build_security_material(
        env,
        owner_sid,
        owner_sid_length,
        &security
      )) goto failed;
  status = nt_open_exact(
    parent_resource->handle,
    component,
    component_length,
    directory ? DECKENT_DIRECTORY_ACCESS : DECKENT_READ_FILE_ACCESS,
    disposition,
    directory,
    disposition == FILE_OPEN ? NULL : &security.descriptor,
    &target,
    &information
  );
  free_security_material(&security);
  if (status < 0) {
    throw_nt_open_failure(env, status);
    goto failed;
  }
  created = information == DECKENT_FILE_CREATED_INFORMATION;
  if ((!created && information != DECKENT_FILE_OPENED_INFORMATION)
      || (disposition == FILE_CREATE && !created)
      || (disposition == FILE_OPEN && created)) {
    throw_failure(
      env,
      DECKENT_NATIVE_ERROR_NAMESPACE_CONFLICT,
      "Win32 create disposition result was ambiguous"
    );
    goto failed;
  }
  if (created) {
    rollback_captured = capture_rollback_identity(target, &rollback_identity);
    if (!rollback_captured) {
      throw_failure(
        env,
        DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
        "Win32 created-object identity is unavailable"
      );
      goto failed;
    }
  }
  if (!query_identity(
        env,
        target,
        owner_sid,
        owner_sid_length,
        directory ? 1 : 0,
        &identity
      )
      || !revalidate_directory_authority(
        env,
        owned_parent,
        parent_resource->owner_sid,
        parent_resource->owner_sid_length,
        &parent_duplicate_identity,
        &parent_source_identity
      )) goto failed;
  if (created && !same_rollback_identity(&identity, &rollback_identity)) {
    throw_failure(
      env,
      DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
      "Win32 created-object identity changed"
    );
    goto failed;
  }
  if (directory
      && (!flush_exact_handle(target) || !flush_exact_handle(owned_parent))) {
    throw_failure(
      env,
      DECKENT_NATIVE_ERROR_DURABILITY_UNCONFIRMED,
      "Win32 directory durability could not be confirmed"
    );
    goto failed;
  }
  end_borrow_or_fatal(
    env,
    &borrow,
    "Win32 child-open borrow could not be released"
  );
  borrow_ended = true;
  return finish_open_result(
    env,
    state,
    operation,
    directory
      ? DECKENT_NATIVE_HANDLE_DIRECTORY
      : DECKENT_NATIVE_HANDLE_READ_FILE,
    target,
    owned_parent,
    component,
    parent_generation,
    directory,
    created,
    owner_sid,
    owner_sid_length,
    &identity
  );
failed:
  ensure_pending_failure(
    env,
    "E_EXEC_AUTH_NATIVE_OPERATION",
    "Win32 child open could not be confirmed"
  );
  free_security_material(&security);
  if (!borrow_ended && borrow.active) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "Win32 rejected child-open borrow could not be released"
    );
  }
  if (created && rollback_captured) {
    if (!rollback_named_create(
          &target,
          owned_parent,
          component,
          directory,
          &rollback_identity
        )) {
      cleanup_confirmed = false;
    }
  } else {
    if (!close_owned_handle(&target)) cleanup_confirmed = false;
  }
  if (!close_owned_handle(&owned_parent)) cleanup_confirmed = false;
  free(component);
  SecureZeroMemory(owner_sid, sizeof(owner_sid));
  if (created && !cleanup_confirmed) {
    clear_pending_exception(env);
    return deckent_native_throw(
      env,
      DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
      "Win32 named create rollback could not be confirmed"
    );
  }
  if (!created && !cleanup_confirmed) {
    clear_pending_exception(env);
    return deckent_native_throw(
      env,
      DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
      "Win32 rejected child-open cleanup could not be confirmed"
    );
  }
  return NULL;
}

static bool verify_traversal_directory(napi_env env, HANDLE handle) {
  FILE_STANDARD_INFO standard;
  deckent_file_attribute_tag_information tag;
  deckent_file_fs_device_information device;
  IO_STATUS_BLOCK io_status;
  memset(&standard, 0, sizeof(standard));
  memset(&tag, 0, sizeof(tag));
  memset(&device, 0, sizeof(device));
  memset(&io_status, 0, sizeof(io_status));
  if (!GetFileInformationByHandleEx(
        handle,
        FileStandardInfo,
        &standard,
        sizeof(standard)
      ) || standard.Directory == FALSE) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_OBJECT_TYPE_MISMATCH,
      "Win32 traversal component is not a directory"
    );
  }
  if (!GetFileInformationByHandleEx(
        handle,
        (FILE_INFO_BY_HANDLE_CLASS)9,
        &tag,
        sizeof(tag)
      )
      || (tag.file_attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0u
      || tag.reparse_tag != 0u) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_REPARSE_REJECTED,
      "Win32 traversal reparse component was rejected"
    );
  }
  if (deckent_api.nt_query_volume_information_file(
        handle,
        &io_status,
        &device,
        sizeof(device),
        DECKENT_FILE_FS_DEVICE_INFORMATION_CLASS
      ) < 0) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_VOLUME_UNSUPPORTED,
      "Win32 traversal volume is unsupported"
    );
  }
  if ((device.characteristics & DECKENT_FILE_REMOTE_DEVICE) != 0u) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_REMOTE_VOLUME_UNSUPPORTED,
      "remote Win32 traversal is unsupported"
    );
  }
  return true;
}

static bool split_drive_root_path(
  napi_env env,
  WCHAR *path,
  size_t path_length,
  WCHAR drive_root[8],
  WCHAR ***components,
  size_t **component_lengths,
  size_t *component_count
) {
  size_t offset;
  size_t count = 0u;
  size_t index;
  size_t start;
  WCHAR **parts = NULL;
  size_t *lengths = NULL;
  WCHAR drive;
  if (path_length >= 3u
      && ((path[0] >= L'A' && path[0] <= L'Z')
        || (path[0] >= L'a' && path[0] <= L'z'))
      && path[1] == L':' && (path[2] == L'\\' || path[2] == L'/')) {
    drive = path[0];
    offset = 3u;
  } else if (path_length >= 7u
      && path[0] == L'\\' && path[1] == L'\\'
      && path[2] == L'?' && path[3] == L'\\'
      && ((path[4] >= L'A' && path[4] <= L'Z')
        || (path[4] >= L'a' && path[4] <= L'z'))
      && path[5] == L':' && (path[6] == L'\\' || path[6] == L'/')) {
    drive = path[4];
    offset = 7u;
  } else {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_REMOTE_VOLUME_UNSUPPORTED,
      "only local drive-root Win32 ingress is admitted"
    );
  }
  if (drive >= L'a' && drive <= L'z') drive -= (WCHAR)(L'a' - L'A');
  while (path_length > offset
      && (path[path_length - 1u] == L'\\'
        || path[path_length - 1u] == L'/')) path_length -= 1u;
  if (path_length == offset) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_DURABILITY_UNCONFIRMED,
      "a bare Win32 volume root has no durable parent edge"
    );
  }
  start = offset;
  for (index = offset; index <= path_length; index += 1u) {
    bool boundary = index == path_length || path[index] == L'\\' || path[index] == L'/';
    if (!boundary) continue;
    if (index == start || !valid_component_text(path + start, index - start)) {
      return throw_failure(
        env,
        DECKENT_NATIVE_ERROR_INVALID_COMPONENT,
        "Win32 root ingress contains an invalid component"
      );
    }
    count += 1u;
    start = index + 1u;
  }
  if (count == 0u || count > SIZE_MAX / sizeof(*parts)
      || count > SIZE_MAX / sizeof(*lengths)) {
    return throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "Win32 root ingress component count is invalid"
    );
  }
  parts = (WCHAR **)calloc(count, sizeof(*parts));
  lengths = (size_t *)calloc(count, sizeof(*lengths));
  if (parts == NULL || lengths == NULL) {
    free(parts);
    free(lengths);
    return throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "Win32 root traversal allocation failed"
    );
  }
  count = 0u;
  start = offset;
  for (index = offset; index <= path_length; index += 1u) {
    bool boundary = index == path_length || path[index] == L'\\' || path[index] == L'/';
    if (!boundary) continue;
    parts[count] = path + start;
    lengths[count] = index - start;
    count += 1u;
    start = index + 1u;
  }
  memcpy(drive_root, L"\\??\\C:\\", 8u * sizeof(WCHAR));
  drive_root[4] = drive;
  *components = parts;
  *component_lengths = lengths;
  *component_count = count;
  return true;
}

static napi_value open_root_operation(
  napi_env env,
  deckent_native_state *state,
  napi_value record
) {
  WCHAR *path = NULL;
  size_t path_length = 0u;
  WCHAR drive_root[8];
  WCHAR **components = NULL;
  size_t *component_lengths = NULL;
  size_t component_count = 0u;
  ULONG disposition;
  BYTE owner_sid[SECURITY_MAX_SID_SIZE];
  DWORD owner_sid_length = 0u;
  deckent_security_material security;
  HANDLE current = INVALID_HANDLE_VALUE;
  HANDLE target = INVALID_HANDLE_VALUE;
  HANDLE parent = INVALID_HANDLE_VALUE;
  ULONG_PTR information = 0u;
  NTSTATUS status;
  size_t index;
  bool created = false;
  bool rollback_captured = false;
  bool cleanup_confirmed = true;
  deckent_win32_identity identity;
  deckent_win32_identity rollback_identity;
  WCHAR *final_component = NULL;
  memset(&security, 0, sizeof(security));
  memset(&identity, 0, sizeof(identity));
  memset(&rollback_identity, 0, sizeof(rollback_identity));
  if (!get_named_utf16(
        env,
        record,
        "path",
        DECKENT_INGRESS_MAX_UNITS,
        &path,
        &path_length
      )
      || !parse_disposition(env, record, &disposition)
      || !get_named_exact_utf8(
        env,
        record,
        "privacyPolicy",
        DECKENT_CUSTODY_PRIVACY_OWNER_PRIVATE
      )
      || !split_drive_root_path(
        env,
        path,
        path_length,
        drive_root,
        &components,
        &component_lengths,
        &component_count
      )
      || !copy_effective_owner_sid(env, owner_sid, &owner_sid_length)) goto failed;
  final_component = duplicate_component(
    components[component_count - 1u],
    component_lengths[component_count - 1u]
  );
  if (final_component == NULL) {
    throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "Win32 root component allocation failed"
    );
    goto failed;
  }
  status = nt_open_exact(
    NULL,
    drive_root,
    7u,
    component_count == 1u ? DECKENT_DIRECTORY_ACCESS : DECKENT_TRAVERSE_ACCESS,
    FILE_OPEN,
    true,
    NULL,
    &current,
    &information
  );
  if (status < 0) {
    throw_nt_open_failure(env, status);
    goto failed;
  }
  if (!verify_traversal_directory(env, current)) goto failed;
  if (disposition != FILE_OPEN
      && !build_security_material(
        env,
        owner_sid,
        owner_sid_length,
        &security
      )) goto failed;
  for (index = 0u; index < component_count; index += 1u) {
    bool final = index + 1u == component_count;
    ACCESS_MASK access = final || index + 2u == component_count
      ? DECKENT_DIRECTORY_ACCESS
      : DECKENT_TRAVERSE_ACCESS;
    HANDLE next = INVALID_HANDLE_VALUE;
    status = nt_open_exact(
      current,
      components[index],
      component_lengths[index],
      access,
      final ? disposition : FILE_OPEN,
      true,
      final && disposition != FILE_OPEN ? &security.descriptor : NULL,
      &next,
      &information
    );
    if (status < 0) {
      throw_nt_open_failure(env, status);
      goto failed;
    }
    if (final) {
      parent = current;
      current = INVALID_HANDLE_VALUE;
      target = next;
    } else {
      if (!verify_traversal_directory(env, next)) {
        if (!close_owned_handle(&next)) {
          clear_pending_exception(env);
          throw_failure(
            env,
            DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
            "Win32 rejected traversal cleanup was not confirmed"
          );
        }
        goto failed;
      }
      if (!close_owned_handle(&current)) {
        if (!close_owned_handle(&next)) cleanup_confirmed = false;
        clear_pending_exception(env);
        throw_failure(
          env,
          DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
          "Win32 traversal handle cleanup was not confirmed"
        );
        goto failed;
      }
      current = next;
    }
  }
  free_security_material(&security);
  created = information == DECKENT_FILE_CREATED_INFORMATION;
  if ((!created && information != DECKENT_FILE_OPENED_INFORMATION)
      || (disposition == FILE_CREATE && !created)
      || (disposition == FILE_OPEN && created)) {
    throw_failure(
      env,
      DECKENT_NATIVE_ERROR_NAMESPACE_CONFLICT,
      "Win32 root create disposition result was ambiguous"
    );
    goto failed;
  }
  if (created) {
    rollback_captured = capture_rollback_identity(target, &rollback_identity);
    if (!rollback_captured) {
      throw_failure(
        env,
        DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
        "Win32 created root identity is unavailable"
      );
      goto failed;
    }
  }
  if (!query_identity(
        env,
        target,
        owner_sid,
        owner_sid_length,
        1,
        &identity
      )) goto failed;
  if (created && !same_rollback_identity(&identity, &rollback_identity)) {
    throw_failure(
      env,
      DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
      "Win32 created root identity changed"
    );
    goto failed;
  }
  if (!flush_exact_handle(target) || !flush_exact_handle(parent)) {
    throw_failure(
      env,
      DECKENT_NATIVE_ERROR_DURABILITY_UNCONFIRMED,
      "Win32 root durability could not be confirmed"
    );
    goto failed;
  }
  free(components);
  free(component_lengths);
  free(path);
  SecureZeroMemory(owner_sid, sizeof(owner_sid));
  return finish_open_result(
    env,
    state,
    DECKENT_CUSTODY_OPERATION_OPEN_ROOT,
    DECKENT_NATIVE_HANDLE_ROOT_DIRECTORY,
    target,
    parent,
    final_component,
    0u,
    true,
    created,
    identity.owner_sid,
    identity.owner_sid_length,
    &identity
  );
failed:
  ensure_pending_failure(
    env,
    "E_EXEC_AUTH_NATIVE_OPERATION",
    "Win32 root open could not be confirmed"
  );
  free_security_material(&security);
  if (!close_owned_handle(&current)) cleanup_confirmed = false;
  if (created && rollback_captured && final_component != NULL) {
    if (!rollback_named_create(
          &target,
          parent,
          final_component,
          true,
          &rollback_identity
        )) {
      cleanup_confirmed = false;
    }
  } else {
    if (!close_owned_handle(&target)) cleanup_confirmed = false;
  }
  if (!close_owned_handle(&parent)) cleanup_confirmed = false;
  free(final_component);
  free(components);
  free(component_lengths);
  free(path);
  SecureZeroMemory(owner_sid, sizeof(owner_sid));
  if (created && !cleanup_confirmed) {
    clear_pending_exception(env);
    return deckent_native_throw(
      env,
      DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
      "Win32 root create rollback could not be confirmed"
    );
  }
  if (!created && !cleanup_confirmed) {
    clear_pending_exception(env);
    return deckent_native_throw(
      env,
      DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
      "Win32 rejected root-open cleanup could not be confirmed"
    );
  }
  return NULL;
}

static int cleanup_publication_resource(deckent_win32_publication *publication) {
  deckent_win32_identity current;
  deckent_file_disposition_info_ex disposition;
  HANDLE verification = INVALID_HANDLE_VALUE;
  ULONG_PTR information = 0u;
  NTSTATUS status;
  int uncertain;
  if (publication == NULL || publication->magic != DECKENT_PUBLICATION_MAGIC) return 1;
  uncertain = publication->cleanup_unconfirmed ? 1 : 0;
  if (publication->published) {
    if (publication->state_transition_unconfirmed) uncertain = 1;
    if (!close_owned_handle(&publication->staging)) uncertain = 1;
    if (!close_owned_handle(&publication->parent)) uncertain = 1;
    return uncertain;
  }
  if (publication->staging == NULL
      || publication->staging == INVALID_HANDLE_VALUE) {
    if (!close_owned_handle(&publication->parent)) uncertain = 1;
    return uncertain;
  }
  if (publication->staging == INVALID_HANDLE_VALUE
      || publication->parent == INVALID_HANDLE_VALUE
      || publication->staging_name == NULL
      || !capture_rollback_identity(publication->staging, &current)
      || !same_rollback_identity(&current, &publication->staging_identity)) {
    uncertain = 1;
  }
  if (!uncertain) {
    disposition.flags = DECKENT_FILE_DISPOSITION_FLAG_DELETE;
    if (!SetFileInformationByHandle(
          publication->staging,
          DECKENT_FILE_DISPOSITION_INFO_EX_CLASS,
          &disposition,
          sizeof(disposition)
        )) uncertain = 1;
  }
  if (!close_owned_handle(&publication->staging)) uncertain = 1;
  if (!uncertain) {
    status = nt_open_exact(
      publication->parent,
      publication->staging_name,
      wcslen(publication->staging_name),
      DECKENT_READ_FILE_ACCESS,
      FILE_OPEN,
      false,
      NULL,
      &verification,
      &information
    );
    if (status >= 0) {
      if (!close_owned_handle(&verification)) uncertain = 1;
      uncertain = 1;
    } else if (!nt_status_is_not_found(status)) {
      uncertain = 1;
    }
  }
  if (!flush_exact_handle(publication->parent)) uncertain = 1;
  if (!close_owned_handle(&publication->parent)) uncertain = 1;
  return uncertain;
}

static int close_win32_publication(uintptr_t raw_resource) {
  deckent_win32_publication *publication =
    (deckent_win32_publication *)raw_resource;
  int uncertain;
  if (publication == NULL || publication->magic != DECKENT_PUBLICATION_MAGIC) return 1;
  uncertain = cleanup_publication_resource(publication);
  publication->magic = 0u;
  free(publication->staging_name);
  free(publication->target_name);
  SecureZeroMemory(publication->owner_sid, sizeof(publication->owner_sid));
  free(publication);
  return uncertain;
}

static bool format_staging_name(
  const BYTE random_bytes[DECKENT_RANDOM_BYTES],
  WCHAR output[64]
) {
  static const WCHAR prefix[] = L".deckent-custody-";
  static const WCHAR digits[] = L"0123456789abcdef";
  size_t prefix_length = (sizeof(prefix) / sizeof(prefix[0])) - 1u;
  size_t index;
  if (prefix_length + DECKENT_RANDOM_BYTES * 2u + 4u + 1u > 64u) return false;
  memcpy(output, prefix, prefix_length * sizeof(WCHAR));
  for (index = 0u; index < DECKENT_RANDOM_BYTES; index += 1u) {
    output[prefix_length + index * 2u] = digits[random_bytes[index] >> 4u];
    output[prefix_length + index * 2u + 1u] =
      digits[random_bytes[index] & 0x0fu];
  }
  memcpy(
    output + prefix_length + DECKENT_RANDOM_BYTES * 2u,
    L".tmp",
    5u * sizeof(WCHAR)
  );
  return true;
}

static napi_value begin_publication_operation(
  napi_env env,
  deckent_native_state *state,
  napi_value record
) {
  napi_value parent_value;
  WCHAR *target_name = NULL;
  size_t target_length = 0u;
  uint64_t max_bytes = 0u;
  deckent_native_borrow borrow;
  deckent_win32_resource *parent_resource;
  deckent_win32_publication *publication = NULL;
  deckent_security_material security;
  BYTE random_bytes[DECKENT_RANDOM_BYTES];
  ULONG_PTR information = 0u;
  NTSTATUS status = STATUS_UNSUCCESSFUL;
  size_t attempt;
  bool borrow_ended = false;
  napi_value opaque_handle;
  deckent_win32_identity parent_source_identity;
  deckent_win32_identity parent_duplicate_identity;
  memset(&borrow, 0, sizeof(borrow));
  memset(&security, 0, sizeof(security));
  memset(random_bytes, 0, sizeof(random_bytes));
  memset(&parent_source_identity, 0, sizeof(parent_source_identity));
  memset(&parent_duplicate_identity, 0, sizeof(parent_duplicate_identity));
  if (!get_named_value(env, record, "parent", &parent_value)
      || !get_named_utf16(
        env,
        record,
        "name",
        DECKENT_COMPONENT_MAX_UNITS,
        &target_name,
        &target_length
      )
      || !valid_component_text(target_name, target_length)
      || !get_named_safe_u64(env, record, "maxBytes", true, &max_bytes)
      || !deckent_native_borrow_handle(
        env,
        state,
        parent_value,
        DECKENT_NATIVE_HANDLE_ANY,
        DECKENT_NATIVE_RIGHT_PUBLISH,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &borrow
      )) goto failed;
  parent_resource = borrow_directory_resource(env, &borrow);
  if (parent_resource == NULL) goto failed;
  publication = (deckent_win32_publication *)calloc(1u, sizeof(*publication));
  if (publication == NULL) {
    throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "Win32 publication session allocation failed"
    );
    goto failed;
  }
  publication->magic = DECKENT_PUBLICATION_MAGIC;
  publication->staging = INVALID_HANDLE_VALUE;
  publication->parent = INVALID_HANDLE_VALUE;
  publication->staging_name = (WCHAR *)calloc(64u, sizeof(WCHAR));
  publication->target_name = target_name;
  target_name = NULL;
  publication->parent_generation = borrow.generation;
  publication->max_bytes = max_bytes;
  if (publication->staging_name == NULL
      || !revalidate_directory_authority(
        env,
        parent_resource->handle,
        parent_resource->owner_sid,
        parent_resource->owner_sid_length,
        &parent_resource->identity,
        &parent_source_identity
      )
      || !copy_bound_current_owner(
        env,
        parent_resource->owner_sid,
        parent_resource->owner_sid_length,
        publication->owner_sid,
        &publication->owner_sid_length
      )
      || !duplicate_handle_owned(parent_resource->handle, &publication->parent)
      || !revalidate_directory_authority(
        env,
        publication->parent,
        publication->owner_sid,
        publication->owner_sid_length,
        &parent_source_identity,
        &parent_duplicate_identity
      )
      || !build_security_material(
        env,
        publication->owner_sid,
        publication->owner_sid_length,
        &security
      )) goto failed;
  for (attempt = 0u; attempt < DECKENT_STAGING_ATTEMPTS; attempt += 1u) {
    if (deckent_api.bcrypt_gen_random(
          NULL,
          random_bytes,
          (ULONG)sizeof(random_bytes),
          BCRYPT_USE_SYSTEM_PREFERRED_RNG
        ) < 0
        || !format_staging_name(random_bytes, publication->staging_name)) {
      throw_failure(
        env,
        "E_EXEC_AUTH_NATIVE_OPERATION",
        "Win32 cryptographic staging name generation failed"
      );
      goto failed;
    }
    status = nt_open_exact_with_share(
      parent_resource->handle,
      publication->staging_name,
      wcslen(publication->staging_name),
      DECKENT_PUBLICATION_FILE_ACCESS,
      FILE_CREATE,
      false,
      &security.descriptor,
      0u,
      &publication->staging,
      &information
    );
    if (status >= 0) break;
    if (deckent_api.rtl_nt_status_to_dos_error(status) != ERROR_FILE_EXISTS
        && deckent_api.rtl_nt_status_to_dos_error(status) != ERROR_ALREADY_EXISTS) {
      throw_nt_open_failure(env, status);
      goto failed;
    }
  }
  free_security_material(&security);
  SecureZeroMemory(random_bytes, sizeof(random_bytes));
  if (status < 0 || publication->staging == INVALID_HANDLE_VALUE
      || information != DECKENT_FILE_CREATED_INFORMATION) {
    throw_failure(
      env,
      DECKENT_NATIVE_ERROR_NAMESPACE_CONFLICT,
      "Win32 private staging namespace is exhausted"
    );
    goto failed;
  }
  if (!capture_rollback_identity(
        publication->staging,
        &publication->staging_identity
      )) {
    throw_failure(
      env,
      DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
      "Win32 staging identity is unavailable"
    );
    goto failed;
  }
  {
    deckent_win32_identity full_identity;
    if (!query_identity(
          env,
          publication->staging,
          publication->owner_sid,
          publication->owner_sid_length,
          0,
          &full_identity
        )
        || !same_rollback_identity(
          &full_identity,
          &publication->staging_identity
        )
        || !revalidate_directory_authority(
          env,
          publication->parent,
          publication->owner_sid,
          publication->owner_sid_length,
          &parent_duplicate_identity,
          &publication->parent_identity
        )) goto failed;
    publication->staging_identity = full_identity;
  }
  end_borrow_or_fatal(
    env,
    &borrow,
    "Win32 publication-begin borrow could not be released"
  );
  borrow_ended = true;
  opaque_handle = deckent_native_create_handle(
    env,
    state,
    DECKENT_NATIVE_HANDLE_PUBLICATION,
    DECKENT_PUBLICATION_RIGHTS,
    (uintptr_t)publication,
    close_win32_publication
  );
  publication = NULL;
  return opaque_handle;
failed:
  ensure_pending_failure(
    env,
    "E_EXEC_AUTH_NATIVE_OPERATION",
    "Win32 publication begin could not be confirmed"
  );
  free_security_material(&security);
  SecureZeroMemory(random_bytes, sizeof(random_bytes));
  if (!borrow_ended && borrow.active) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "Win32 rejected publication-begin borrow could not be released"
    );
  }
  if (publication != NULL) {
    int cleanup = close_win32_publication((uintptr_t)publication);
    if (cleanup != 0) {
      free(target_name);
      clear_pending_exception(env);
      return deckent_native_throw(
        env,
        DECKENT_NATIVE_ERROR_CREATE_UNCONFIRMED,
        "Win32 staging create cleanup could not be confirmed"
      );
    }
  }
  free(target_name);
  return NULL;
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

static void mark_append_failed_or_fatal(
  napi_env env,
  deckent_native_state *state,
  napi_value publication
) {
  if (deckent_native_mark_append_failed(env, state, publication)) return;
  napi_fatal_error(
    "deckent.exec-authority",
    NAPI_AUTO_LENGTH,
    "uncertain Win32 append could not be bound to APPEND_FAILED state",
    NAPI_AUTO_LENGTH
  );
}

static void mark_published_unconfirmed_or_fatal(
  napi_env env,
  deckent_native_state *state,
  napi_value publication
) {
  if (deckent_native_mark_published_unconfirmed(env, state, publication)) return;
  napi_fatal_error(
    "deckent.exec-authority",
    NAPI_AUTO_LENGTH,
    "Win32 namespace effect could not be bound to PUBLISHED_UNCONFIRMED state",
    NAPI_AUTO_LENGTH
  );
}

static napi_value append_publication_operation(
  napi_env env,
  deckent_native_state *state,
  napi_value record
) {
  napi_value publication_value;
  BYTE *bytes = NULL;
  size_t byte_count = 0u;
  deckent_native_borrow borrow;
  deckent_win32_publication *publication;
  napi_value result = NULL;
  LARGE_INTEGER zero;
  LARGE_INTEGER end;
  size_t offset = 0u;
  bool uncertain = false;
  BYTE current_owner[SECURITY_MAX_SID_SIZE];
  DWORD current_owner_length = 0u;
  memset(&borrow, 0, sizeof(borrow));
  memset(current_owner, 0, sizeof(current_owner));
  zero.QuadPart = 0;
  end.QuadPart = 0;
  if (!get_named_value(env, record, "publication", &publication_value)) {
    return NULL;
  }
  if (!get_named_uint8_array_copy(
        env,
        record,
        "bytes",
        &bytes,
        &byte_count
      )) {
    return NULL;
  }
  if (!deckent_native_borrow_handle(
        env,
        state,
        publication_value,
        DECKENT_NATIVE_HANDLE_PUBLICATION,
        DECKENT_NATIVE_RIGHT_APPEND,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &borrow
      )) {
    secure_free_bytes(&bytes, byte_count);
    return NULL;
  }
  publication = borrow_publication_resource(env, &borrow);
  if (publication == NULL) goto failed_before_effect;
  if (publication->append_failed
      || publication->published
      || publication->state_transition_unconfirmed) {
    throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_STATE",
      "Win32 publication append state is terminal"
    );
    goto failed_before_effect;
  }
  if (!copy_bound_current_owner(
        env,
        publication->owner_sid,
        publication->owner_sid_length,
        current_owner,
        &current_owner_length
      )) goto failed_before_effect;
  if ((uint64_t)byte_count > publication->max_bytes
      || publication->byte_length > publication->max_bytes - (uint64_t)byte_count) {
    throw_failure(
      env,
      DECKENT_NATIVE_ERROR_SIZE_LIMIT,
      "Win32 publication append exceeds its hard bound"
    );
    goto failed_before_effect;
  }
  result = deckent_native_create_result_record(env);
  if (result == NULL
      || !napi_set_uint32_value(env, result, "schemaVersion", 1u)
      || !napi_set_string(env, result, "kind", "custody-append")
      || !napi_set_string(env, result, "state", "APPENDED")
      || !napi_set_double_value(env, result, "byteLength", (double)byte_count)
      || !deckent_native_finalize_result_record(
        env,
        result,
        DECKENT_CUSTODY_OPERATION_APPEND_PUBLICATION
      )) goto failed_before_effect;
  if (!SetFilePointerEx(publication->staging, zero, &end, FILE_END)
      || end.QuadPart < 0
      || (uint64_t)end.QuadPart != publication->byte_length) {
    uncertain = true;
    goto failed_after_effect;
  }
  while (offset < byte_count) {
    DWORD request = (DWORD)((byte_count - offset) > DECKENT_IO_CHUNK
      ? DECKENT_IO_CHUNK
      : (byte_count - offset));
    DWORD written = 0u;
    if (!WriteFile(
          publication->staging,
          bytes + offset,
          request,
          &written,
          NULL
        ) || written == 0u || written > request) {
      publication->byte_length += written;
      uncertain = true;
      goto failed_after_effect;
    }
    offset += written;
    publication->byte_length += written;
  }
  publication->staging_identity.size = publication->byte_length;
  if (!deckent_native_end_borrow(env, &borrow)) {
    clear_pending_exception(env);
    publication->append_failed = true;
    mark_append_failed_or_fatal(env, state, publication_value);
    secure_free_bytes(&bytes, byte_count);
    SecureZeroMemory(current_owner, sizeof(current_owner));
    napi_fatal_error(
      "deckent.exec-authority",
      NAPI_AUTO_LENGTH,
      "completed Win32 append borrow could not be released",
      NAPI_AUTO_LENGTH
    );
    return NULL;
  }
  secure_free_bytes(&bytes, byte_count);
  SecureZeroMemory(current_owner, sizeof(current_owner));
  return result;
failed_before_effect:
  secure_free_bytes(&bytes, byte_count);
  SecureZeroMemory(current_owner, sizeof(current_owner));
  if (borrow.active) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "Win32 rejected append borrow could not be released"
    );
  }
  return NULL;
failed_after_effect:
  if (uncertain) {
    publication->append_failed = true;
    mark_append_failed_or_fatal(env, state, publication_value);
  }
  secure_free_bytes(&bytes, byte_count);
  SecureZeroMemory(current_owner, sizeof(current_owner));
  if (borrow.active) {
    clear_pending_exception(env);
    end_borrow_or_fatal(
      env,
      &borrow,
      "Win32 APPEND_FAILED borrow could not be released"
    );
  }
  return deckent_native_throw(
    env,
    DECKENT_NATIVE_ERROR_IO_UNCONFIRMED,
    "Win32 publication append could not be confirmed"
  );
}

static bool resolve_borrow_identity_source(
  napi_env env,
  deckent_native_borrow *borrow,
  HANDLE *handle,
  const BYTE **owner_sid,
  DWORD *owner_sid_length,
  int *expected_type
) {
  deckent_win32_resource *resource =
    (deckent_win32_resource *)borrow->resource;
  deckent_win32_publication *publication =
    (deckent_win32_publication *)borrow->resource;
  if (resource != NULL && resource->magic == DECKENT_RESOURCE_MAGIC) {
    if (!validate_bound_current_owner(
          env,
          resource->owner_sid,
          resource->owner_sid_length
        )) return false;
    *handle = resource->handle;
    *owner_sid = resource->owner_sid;
    *owner_sid_length = resource->owner_sid_length;
    *expected_type = resource->directory ? 1 : 0;
    return true;
  }
  if (publication != NULL
      && publication->magic == DECKENT_PUBLICATION_MAGIC) {
    if (!validate_bound_current_owner(
          env,
          publication->owner_sid,
          publication->owner_sid_length
        )) return false;
    *handle = publication->staging;
    *owner_sid = publication->owner_sid;
    *owner_sid_length = publication->owner_sid_length;
    *expected_type = 0;
    return true;
  }
  return throw_failure(
    env,
    "E_EXEC_AUTH_NATIVE_HANDLE_CONTRACT",
    "Win32 custody resource identity contract is invalid"
  );
}

static napi_value identity_operation(
  napi_env env,
  deckent_native_state *state,
  napi_value record
) {
  napi_value handle_value;
  deckent_native_borrow borrow;
  HANDLE handle;
  const BYTE *owner_sid;
  DWORD owner_sid_length;
  int expected_type;
  deckent_win32_identity identity;
  napi_value result;
  memset(&borrow, 0, sizeof(borrow));
  if (!get_named_value(env, record, "handle", &handle_value)
      || !deckent_native_borrow_handle(
        env,
        state,
        handle_value,
        DECKENT_NATIVE_HANDLE_ANY,
        DECKENT_NATIVE_RIGHT_IDENTITY,
        DECKENT_NATIVE_HANDLE_STATE_OPEN
          | DECKENT_NATIVE_HANDLE_STATE_PUBLISHED_UNCONFIRMED,
        &borrow
      )
      || !resolve_borrow_identity_source(
        env,
        &borrow,
        &handle,
        &owner_sid,
        &owner_sid_length,
        &expected_type
      )
      || !query_identity(
        env,
        handle,
        owner_sid,
        owner_sid_length,
        expected_type,
        &identity
      )) {
    if (borrow.active) {
      end_borrow_or_fatal(
        env,
        &borrow,
        "Win32 rejected identity borrow could not be released"
      );
    }
    return NULL;
  }
  end_borrow_or_fatal(
    env,
    &borrow,
    "Win32 identity borrow could not be released"
  );
  result = deckent_native_create_result_record(env);
  if (result == NULL || !populate_identity_record(env, result, &identity)
      || !deckent_native_finalize_result_record(
        env,
        result,
        DECKENT_CUSTODY_OPERATION_IDENTITY
      )) {
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "Win32 identity result could not be finalized"
    );
  }
  return result;
}

static napi_value probe_operation(
  napi_env env,
  deckent_native_state *state,
  napi_value record
) {
  napi_value handle_value;
  deckent_native_borrow borrow;
  HANDLE handle;
  const BYTE *owner_sid;
  DWORD owner_sid_length;
  int expected_type;
  deckent_win32_identity identity;
  napi_value result;
  napi_value identity_value;
  memset(&borrow, 0, sizeof(borrow));
  if (!get_named_value(env, record, "handle", &handle_value)
      || !deckent_native_borrow_handle(
        env,
        state,
        handle_value,
        DECKENT_NATIVE_HANDLE_ANY,
        DECKENT_NATIVE_RIGHT_IDENTITY,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &borrow
      )
      || !resolve_borrow_identity_source(
        env,
        &borrow,
        &handle,
        &owner_sid,
        &owner_sid_length,
        &expected_type
      )
      || !query_identity(
        env,
        handle,
        owner_sid,
        owner_sid_length,
        expected_type,
        &identity
      )) {
    if (borrow.active) {
      end_borrow_or_fatal(
        env,
        &borrow,
        "Win32 rejected probe borrow could not be released"
      );
    }
    return NULL;
  }
  end_borrow_or_fatal(
    env,
    &borrow,
    "Win32 probe borrow could not be released"
  );
  result = deckent_native_create_result_record(env);
  if (result == NULL
      || !create_nested_identity(env, &identity, &identity_value)
      || !napi_set_uint32_value(env, result, "schemaVersion", 1u)
      || !napi_set_string(env, result, "kind", "custody-probe")
      || !napi_set_boolean_value(env, result, "available", true)
      || !napi_set_string(env, result, "platform", "win32")
      || !napi_set_uint32_value(
        env,
        result,
        "featureEvidenceBits",
        identity.evidence_bits
      )
      || !napi_set_value(env, result, "identity", identity_value)
      || !deckent_native_finalize_result_record(
        env,
        result,
        DECKENT_CUSTODY_OPERATION_PROBE
      )) {
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "Win32 probe result could not be finalized"
    );
  }
  return result;
}

static bool apply_owner_private(
  napi_env env,
  HANDLE handle,
  const BYTE *owner_sid,
  DWORD owner_sid_length,
  int expected_type,
  deckent_win32_identity *identity
) {
  deckent_security_material security;
  DWORD result;
  if (!build_security_material(
        env,
        owner_sid,
        owner_sid_length,
        &security
      )) return false;
  result = deckent_api.set_security_info(
    handle,
    SE_FILE_OBJECT,
    OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION
      | PROTECTED_DACL_SECURITY_INFORMATION,
    (PSID)security.owner_sid,
    NULL,
    security.dacl,
    NULL
  );
  free_security_material(&security);
  if (result != ERROR_SUCCESS) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_PRIVACY_UNCONFIRMED,
      "owner-private Win32 DACL application failed"
    );
  }
  return query_identity(
    env,
    handle,
    owner_sid,
    owner_sid_length,
    expected_type,
    identity
  );
}

static napi_value create_evidence_result(
  napi_env env,
  deckent_custody_operation operation,
  const char *operation_name,
  uint32_t evidence_bits
) {
  napi_value result = deckent_native_create_result_record(env);
  if (result == NULL
      || !napi_set_uint32_value(env, result, "schemaVersion", 1u)
      || !napi_set_string(env, result, "kind", "custody-evidence")
      || !napi_set_string(env, result, "operation", operation_name)
      || !napi_set_string(env, result, "state", "CONFIRMED")
      || !napi_set_uint32_value(
        env,
        result,
        "featureEvidenceBits",
        evidence_bits
      )
      || !deckent_native_finalize_result_record(env, result, operation)) {
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "Win32 evidence result could not be finalized"
    );
  }
  return result;
}

static napi_value apply_private_operation(
  napi_env env,
  deckent_native_state *state,
  napi_value record
) {
  napi_value handle_value;
  deckent_native_borrow borrow;
  HANDLE handle;
  const BYTE *owner_sid;
  DWORD owner_sid_length;
  int expected_type;
  deckent_win32_identity identity;
  memset(&borrow, 0, sizeof(borrow));
  if (!get_named_value(env, record, "handle", &handle_value)
      || !deckent_native_borrow_handle(
        env,
        state,
        handle_value,
        DECKENT_NATIVE_HANDLE_ANY,
        DECKENT_NATIVE_RIGHT_APPLY_PRIVATE,
        DECKENT_NATIVE_HANDLE_STATE_OPEN
          | DECKENT_NATIVE_HANDLE_STATE_PUBLISHED_UNCONFIRMED,
        &borrow
      )
      || !resolve_borrow_identity_source(
        env,
        &borrow,
        &handle,
        &owner_sid,
        &owner_sid_length,
        &expected_type
      )
      || !apply_owner_private(
        env,
        handle,
        owner_sid,
        owner_sid_length,
        expected_type,
        &identity
      )) {
    if (borrow.active) {
      end_borrow_or_fatal(
        env,
        &borrow,
        "Win32 rejected private-apply borrow could not be released"
      );
    }
    return NULL;
  }
  end_borrow_or_fatal(
    env,
    &borrow,
    "Win32 private-apply borrow could not be released"
  );
  return create_evidence_result(
    env,
    DECKENT_CUSTODY_OPERATION_APPLY_PRIVATE,
    "APPLY_PRIVATE",
    identity.evidence_bits
  );
}

static napi_value sync_operation(
  napi_env env,
  deckent_native_state *state,
  napi_value record
) {
  napi_value handle_value;
  deckent_native_borrow borrow;
  deckent_win32_resource *resource;
  deckent_win32_publication *publication;
  uint32_t evidence = 0u;
  bool confirmed = false;
  bool operation_valid = true;
  memset(&borrow, 0, sizeof(borrow));
  if (!get_named_value(env, record, "handle", &handle_value)
      || !deckent_native_borrow_handle(
        env,
        state,
        handle_value,
        DECKENT_NATIVE_HANDLE_ANY,
        DECKENT_NATIVE_RIGHT_SYNC,
        DECKENT_NATIVE_HANDLE_STATE_OPEN
          | DECKENT_NATIVE_HANDLE_STATE_PUBLISHED_UNCONFIRMED,
        &borrow
      )) return NULL;
  resource = (deckent_win32_resource *)borrow.resource;
  publication = (deckent_win32_publication *)borrow.resource;
  if (resource != NULL && resource->magic == DECKENT_RESOURCE_MAGIC
      && resource->directory) {
    if (!validate_bound_current_owner(
          env,
          resource->owner_sid,
          resource->owner_sid_length
        )) {
      operation_valid = false;
      goto finished;
    }
    confirmed = flush_exact_handle(resource->handle)
      && flush_exact_handle(resource->parent);
    evidence = DECKENT_NATIVE_EVIDENCE_DIRECTORY_DURABILITY;
  } else if (publication != NULL
      && publication->magic == DECKENT_PUBLICATION_MAGIC) {
    if (!validate_bound_current_owner(
          env,
          publication->owner_sid,
          publication->owner_sid_length
        )) {
      operation_valid = false;
      goto finished;
    }
    confirmed = flush_exact_handle(publication->staging);
    evidence = DECKENT_NATIVE_EVIDENCE_FILE_DURABILITY;
    if (publication->published) {
      confirmed = confirmed && flush_exact_handle(publication->parent);
      evidence |= DECKENT_NATIVE_EVIDENCE_DIRECTORY_DURABILITY;
    }
  } else {
    throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_CONTRACT",
      "Win32 sync resource contract is invalid"
    );
    operation_valid = false;
  }
finished:
  end_borrow_or_fatal(
    env,
    &borrow,
    "Win32 sync borrow could not be released"
  );
  if (!operation_valid) return NULL;
  if (!confirmed) {
    return deckent_native_throw(
      env,
      DECKENT_NATIVE_ERROR_DURABILITY_UNCONFIRMED,
      "Win32 custody durability could not be confirmed"
    );
  }
  return create_evidence_result(
    env,
    DECKENT_CUSTODY_OPERATION_SYNC,
    "SYNC",
    evidence
  );
}

static napi_value read_bounded_operation(
  napi_env env,
  deckent_native_state *state,
  napi_value record
) {
  napi_value file_value;
  uint64_t max_bytes;
  deckent_native_borrow borrow;
  deckent_win32_resource *resource;
  deckent_win32_identity before;
  deckent_win32_identity after;
  napi_value array_buffer;
  napi_value bytes_value;
  void *array_data = NULL;
  size_t observed = 0u;
  size_t allocation_size;
  LARGE_INTEGER zero;
  bool eof = false;
  napi_value result;
  napi_value before_value;
  napi_value after_value;
  memset(&borrow, 0, sizeof(borrow));
  zero.QuadPart = 0;
  if (!get_named_value(env, record, "file", &file_value)
      || !get_named_safe_u64(env, record, "maxBytes", true, &max_bytes)
      || !deckent_native_borrow_handle(
        env,
        state,
        file_value,
        DECKENT_NATIVE_HANDLE_READ_FILE,
        DECKENT_NATIVE_RIGHT_READ,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &borrow
      )) return NULL;
  resource = borrow_file_resource(env, &borrow);
  if (resource == NULL
      || !query_identity(
        env,
        resource->handle,
        resource->owner_sid,
        resource->owner_sid_length,
        0,
        &before
      )) goto failed;
  if (before.size > max_bytes || before.size > SIZE_MAX) {
    throw_failure(
      env,
      DECKENT_NATIVE_ERROR_SIZE_LIMIT,
      "Win32 custody read exceeds its hard bound"
    );
    goto failed;
  }
  allocation_size = (size_t)before.size;
  if (napi_create_arraybuffer(
        env,
        allocation_size,
        &array_data,
        &array_buffer
      ) != napi_ok
      || (allocation_size > 0u && array_data == NULL)) {
    throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "Win32 bounded-read allocation failed"
    );
    goto failed;
  }
  if (!SetFilePointerEx(resource->handle, zero, NULL, FILE_BEGIN)) {
    throw_failure(
      env,
      DECKENT_NATIVE_ERROR_IO_UNCONFIRMED,
      "Win32 bounded-read positioning failed"
    );
    goto failed;
  }
  while (observed < allocation_size) {
    DWORD request = (DWORD)((allocation_size - observed) > DECKENT_IO_CHUNK
      ? DECKENT_IO_CHUNK
      : (allocation_size - observed));
    DWORD read_count = 0u;
    if (!ReadFile(
          resource->handle,
          (BYTE *)array_data + observed,
          request,
          &read_count,
          NULL
        ) || read_count == 0u || read_count > request) {
      throw_failure(
        env,
        DECKENT_NATIVE_ERROR_IO_UNCONFIRMED,
        "Win32 bounded read could not be confirmed"
      );
      goto failed;
    }
    observed += read_count;
  }
  if ((uint64_t)observed < max_bytes) {
    BYTE probe = 0u;
    DWORD read_count = 0u;
    if (!ReadFile(resource->handle, &probe, 1u, &read_count, NULL)) {
      throw_failure(
        env,
        DECKENT_NATIVE_ERROR_IO_UNCONFIRMED,
        "Win32 bounded-read EOF proof failed"
      );
      goto failed;
    }
    if (read_count != 0u) {
      throw_failure(
        env,
        DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
        "Win32 custody file changed during bounded read"
      );
      goto failed;
    }
    eof = true;
  }
  if (!query_identity(
        env,
        resource->handle,
        resource->owner_sid,
        resource->owner_sid_length,
        0,
        &after
      )) goto failed;
  if (!same_identity_value(&before, &after)) {
    throw_failure(
      env,
      DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "Win32 custody file changed during bounded read"
    );
    goto failed;
  }
  before.evidence_bits |= DECKENT_NATIVE_EVIDENCE_BOUNDED_READ;
  after.evidence_bits |= DECKENT_NATIVE_EVIDENCE_BOUNDED_READ;
  end_borrow_or_fatal(
    env,
    &borrow,
    "Win32 bounded-read borrow could not be released"
  );
  if (napi_create_typedarray(
        env,
        napi_uint8_array,
        observed,
        array_buffer,
        0u,
        &bytes_value
      ) != napi_ok
      || !create_nested_identity(env, &before, &before_value)
      || !create_nested_identity(env, &after, &after_value)) {
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "Win32 bounded-read result could not be constructed"
    );
  }
  result = deckent_native_create_result_record(env);
  if (result == NULL
      || !napi_set_uint32_value(env, result, "schemaVersion", 1u)
      || !napi_set_string(env, result, "kind", "custody-read")
      || !napi_set_value(env, result, "bytes", bytes_value)
      || !napi_set_value(env, result, "before", before_value)
      || !napi_set_value(env, result, "after", after_value)
      || !napi_set_boolean_value(env, result, "eof", eof)
      || !napi_set_double_value(
        env,
        result,
        "requestedMaxBytes",
        (double)max_bytes
      )
      || !napi_set_double_value(env, result, "observedBytes", (double)observed)
      || !deckent_native_finalize_result_record(
        env,
        result,
        DECKENT_CUSTODY_OPERATION_READ_BOUNDED
      )) {
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "Win32 bounded-read result could not be finalized"
    );
  }
  return result;
failed:
  if (borrow.active) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "Win32 rejected bounded-read borrow could not be released"
    );
  }
  return NULL;
}

static bool win32_scan_deadline_ok(napi_env env, uint64_t deadline_unix_ms) {
  const ULONGLONG windows_to_unix_ticks = UINT64_C(116444736000000000);
  FILETIME now;
  ULARGE_INTEGER ticks;
  uint64_t now_ms;
  GetSystemTimeAsFileTime(&now);
  ticks.LowPart = now.dwLowDateTime;
  ticks.HighPart = now.dwHighDateTime;
  if (ticks.QuadPart < windows_to_unix_ticks) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_DEADLINE,
      "Win32 custody directory scan clock is unavailable"
    );
  }
  now_ms = (ticks.QuadPart - windows_to_unix_ticks) / UINT64_C(10000);
  if (now_ms > deadline_unix_ms) {
    return throw_failure(
      env,
      DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_DEADLINE,
      "Win32 custody directory scan deadline expired"
    );
  }
  return true;
}

static bool win32_safe_scan_name(
  const WCHAR *name,
  size_t units,
  uint64_t max_name_bytes,
  char **output
) {
  char *text;
  size_t index;
  if (name == NULL || output == NULL || units == 0u || units > 128u
      || units > (size_t)max_name_bytes
      || !((name[0] >= L'a' && name[0] <= L'z')
        || (name[0] >= L'0' && name[0] <= L'9'))) return false;
  text = (char *)malloc(units + 1u);
  if (text == NULL) return false;
  for (index = 0u; index < units; index += 1u) {
    const WCHAR value = name[index];
    if (!((value >= L'a' && value <= L'z')
        || (value >= L'0' && value <= L'9')
        || value == L'.' || value == L'_' || value == L'-')) {
      free(text);
      return false;
    }
    text[index] = (char)value;
  }
  text[units] = '\0';
  *output = text;
  return true;
}

static int win32_scan_name_compare(const void *left, const void *right) {
  const char *const *left_name = (const char *const *)left;
  const char *const *right_name = (const char *const *)right;
  return strcmp(*left_name, *right_name);
}

static void win32_scan_names_free(char ***names, size_t count) {
  size_t index;
  if (names == NULL || *names == NULL) return;
  for (index = 0u; index < count; index += 1u) free((*names)[index]);
  free(*names);
  *names = NULL;
}

static bool same_win32_directory_mutation_snapshot(
  const deckent_win32_identity *before_identity,
  const FILE_BASIC_INFO *before_basic,
  const deckent_win32_identity *after_identity,
  const FILE_BASIC_INFO *after_basic
) {
  return same_identity_value(before_identity, after_identity)
    && before_basic->CreationTime.QuadPart == after_basic->CreationTime.QuadPart
    && before_basic->LastWriteTime.QuadPart == after_basic->LastWriteTime.QuadPart
    && before_basic->ChangeTime.QuadPart == after_basic->ChangeTime.QuadPart
    && before_basic->FileAttributes == after_basic->FileAttributes;
}

static napi_value scan_directory_bounded_operation(
  napi_env env,
  deckent_native_state *state,
  napi_value record
) {
  const DWORD buffer_size = 65536u;
  napi_value directory_value;
  uint64_t max_entries;
  uint64_t max_name_bytes;
  uint64_t deadline_unix_ms;
  deckent_native_borrow borrow;
  deckent_win32_resource *resource;
  deckent_win32_identity before;
  deckent_win32_identity after;
  FILE_BASIC_INFO before_basic;
  FILE_BASIC_INFO after_basic;
  BYTE *buffer = NULL;
  char **names = NULL;
  size_t count = 0u;
  size_t capacity = 0u;
  bool restart = true;
  napi_value names_value;
  napi_value before_value;
  napi_value after_value;
  napi_value result;
  memset(&borrow, 0, sizeof(borrow));
  memset(&before_basic, 0, sizeof(before_basic));
  memset(&after_basic, 0, sizeof(after_basic));
  if (!get_named_value(env, record, "directory", &directory_value)
      || !get_named_safe_u64(env, record, "maxEntries", true, &max_entries)
      || !get_named_safe_u64(env, record, "maxNameBytes", true, &max_name_bytes)
      || !get_named_safe_u64(env, record, "deadlineUnixMs", true, &deadline_unix_ms)) {
    return NULL;
  }
  if (max_entries > 100000u || max_name_bytes > 128u) {
    throw_failure(
      env,
      DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_BOUNDS,
      "Win32 custody directory scan bounds are invalid"
    );
    return NULL;
  }
  if (!win32_scan_deadline_ok(env, deadline_unix_ms)
      || !deckent_native_borrow_handle(
        env,
        state,
        directory_value,
        DECKENT_NATIVE_HANDLE_ANY,
        DECKENT_NATIVE_RIGHT_TRAVERSE | DECKENT_NATIVE_RIGHT_IDENTITY,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &borrow
      )) return NULL;
  resource = (deckent_win32_resource *)borrow.resource;
  if (resource == NULL || resource->magic != DECKENT_RESOURCE_MAGIC
      || !resource->directory
      || !query_identity(
        env,
        resource->handle,
        resource->owner_sid,
        resource->owner_sid_length,
        1,
        &before)
      || !GetFileInformationByHandleEx(
        resource->handle,
        FileBasicInfo,
        &before_basic,
        sizeof(before_basic))) goto failed;
  buffer = (BYTE *)malloc(buffer_size);
  if (buffer == NULL) {
    throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "Win32 custody directory scan buffer allocation failed"
    );
    goto failed;
  }
  for (;;) {
    FILE_INFO_BY_HANDLE_CLASS info_class = restart
      ? FileIdBothDirectoryRestartInfo : FileIdBothDirectoryInfo;
    DWORD offset = 0u;
    if (!win32_scan_deadline_ok(env, deadline_unix_ms)) goto failed;
    memset(buffer, 0, buffer_size);
    if (!GetFileInformationByHandleEx(
          resource->handle,
          info_class,
          buffer,
          buffer_size
        )) {
      DWORD error = GetLastError();
      if (error == ERROR_NO_MORE_FILES) break;
      throw_failure(
        env,
        DECKENT_NATIVE_ERROR_IO_UNCONFIRMED,
        "Win32 custody directory enumeration failed"
      );
      goto failed;
    }
    restart = false;
    for (;;) {
      FILE_ID_BOTH_DIR_INFO *entry;
      size_t units;
      char *name = NULL;
      char **expanded;
      if (offset > buffer_size - offsetof(FILE_ID_BOTH_DIR_INFO, FileName)) {
        throw_failure(
          env,
          DECKENT_NATIVE_ERROR_IO_UNCONFIRMED,
          "Win32 custody directory scan record exceeded its buffer"
        );
        goto failed;
      }
      entry = (FILE_ID_BOTH_DIR_INFO *)(buffer + offset);
      if ((entry->FileNameLength % sizeof(WCHAR)) != 0u
          || entry->FileNameLength
            > buffer_size - offset - offsetof(FILE_ID_BOTH_DIR_INFO, FileName)) {
        throw_failure(
          env,
          DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_ENTRY_INVALID,
          "Win32 custody directory scan name length is invalid"
        );
        goto failed;
      }
      units = entry->FileNameLength / sizeof(WCHAR);
      if ((units == 1u && entry->FileName[0] == L'.')
          || (units == 2u && entry->FileName[0] == L'.'
            && entry->FileName[1] == L'.')) {
        name = NULL;
      } else if (!win32_safe_scan_name(
            entry->FileName, units, max_name_bytes, &name)) {
        throw_failure(
          env,
          DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_ENTRY_INVALID,
          "Win32 custody directory scan found an unsafe child name"
        );
        goto failed;
      }
      if (name != NULL) {
        if (!win32_scan_deadline_ok(env, deadline_unix_ms)) {
          free(name);
          goto failed;
        }
        if (count >= (size_t)max_entries) {
          free(name);
          throw_failure(
            env,
            DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_BOUNDS,
            "Win32 custody directory scan exceeded its entry bound"
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
            free(name);
            throw_failure(
              env,
              DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_BOUNDS,
              "Win32 custody directory scan allocation bound overflowed"
            );
            goto failed;
          }
          expanded = (char **)realloc(names, next_capacity * sizeof(*expanded));
          if (expanded == NULL) {
            free(name);
            throw_failure(
              env,
              "E_EXEC_AUTH_NATIVE_ALLOCATION",
              "Win32 custody directory scan entry allocation failed"
            );
            goto failed;
          }
          names = expanded;
          capacity = next_capacity;
        }
        names[count++] = name;
      }
      if (entry->NextEntryOffset == 0u) break;
      if (entry->NextEntryOffset < offsetof(FILE_ID_BOTH_DIR_INFO, FileName)
          || entry->NextEntryOffset > buffer_size - offset) {
        throw_failure(
          env,
          DECKENT_NATIVE_ERROR_IO_UNCONFIRMED,
          "Win32 custody directory scan record chain is invalid"
        );
        goto failed;
      }
      offset += entry->NextEntryOffset;
    }
  }
  if (!win32_scan_deadline_ok(env, deadline_unix_ms)) goto failed;
  if (count > 1u) qsort(names, count, sizeof(*names), win32_scan_name_compare);
  for (size_t index = 1u; index < count; index += 1u) {
    if (strcmp(names[index - 1u], names[index]) == 0) {
      throw_failure(
        env,
        DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_ENTRY_INVALID,
        "Win32 custody directory scan contained duplicate child names"
      );
      goto failed;
    }
  }
  if (!win32_scan_deadline_ok(env, deadline_unix_ms)
      || !query_identity(
        env,
        resource->handle,
        resource->owner_sid,
        resource->owner_sid_length,
        1,
        &after)
      || !GetFileInformationByHandleEx(
        resource->handle,
        FileBasicInfo,
        &after_basic,
        sizeof(after_basic))) goto failed;
  if (!same_win32_directory_mutation_snapshot(
        &before, &before_basic, &after, &after_basic)) {
    clear_pending_exception(env);
    throw_failure(
      env,
      DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_MUTATED,
      "Win32 custody directory changed during bounded scan"
    );
    goto failed;
  }
  if (napi_create_array_with_length(env, count, &names_value) != napi_ok) goto failed;
  for (size_t index = 0u; index < count; index += 1u) {
    napi_value name_value;
    if (!win32_scan_deadline_ok(env, deadline_unix_ms)
        || napi_create_string_utf8(env, names[index], NAPI_AUTO_LENGTH, &name_value)
          != napi_ok
        || !deckent_native_define_own_index(env, names_value, (uint32_t)index, name_value)) {
      goto failed;
    }
  }
  if (!win32_scan_deadline_ok(env, deadline_unix_ms)
      || !freeze_object(env, names_value)
      || !create_nested_identity(env, &before, &before_value)
      || !create_nested_identity(env, &after, &after_value)) goto failed;
  result = deckent_native_create_result_record(env);
  if (result == NULL
      || !napi_set_value(env, result, "after", after_value)
      || !napi_set_value(env, result, "before", before_value)
      || !napi_set_double_value(env, result, "deadlineUnixMs", (double)deadline_unix_ms)
      || !napi_set_double_value(env, result, "entryCount", (double)count)
      || !napi_set_string(env, result, "kind", "custody-directory-scan")
      || !napi_set_string(
        env, result, "mutationEvidence", "DIRECTORY_IDENTITY_STABLE")
      || !napi_set_value(env, result, "names", names_value)
      || !napi_set_double_value(env, result, "requestedMaxEntries", (double)max_entries)
      || !napi_set_double_value(env, result, "requestedMaxNameBytes", (double)max_name_bytes)
      || !napi_set_uint32_value(env, result, "schemaVersion", 1u)
      || !napi_set_string(env, result, "state", "SCANNED")
      || !deckent_native_finalize_result_record(
        env, result, DECKENT_CUSTODY_OPERATION_SCAN_DIRECTORY_BOUNDED)) goto failed;
  end_borrow_or_fatal(
    env, &borrow, "Win32 directory scan borrow could not be released");
  free(buffer);
  win32_scan_names_free(&names, count);
  return result;
failed:
  free(buffer);
  win32_scan_names_free(&names, count);
  if (borrow.active) {
    end_borrow_or_fatal(
      env, &borrow, "Win32 rejected directory scan borrow could not be released");
  }
  return NULL;
}

static bool create_cleanup_record(
  napi_env env,
  const char *state,
  const char *reason,
  napi_value *output
) {
  napi_value result = deckent_native_create_result_record(env);
  if (result == NULL
      || !napi_set_uint32_value(env, result, "schemaVersion", 1u)
      || !napi_set_string(env, result, "kind", "custody-cleanup")
      || !napi_set_string(env, result, "state", state)
      || (reason == NULL
        ? !napi_set_null_value(env, result, "reasonCode")
        : !napi_set_string(env, result, "reasonCode", reason))
      || !deckent_native_finalize_result_record(
        env,
        result,
        DECKENT_CUSTODY_OPERATION_ABORT_PUBLICATION
      )) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "Win32 cleanup result could not be finalized"
    );
    return false;
  }
  *output = result;
  return true;
}

static napi_value abort_publication_operation(
  napi_env env,
  deckent_native_state *state,
  napi_value record
) {
  napi_value publication_value;
  napi_value confirmed;
  napi_value unconfirmed;
  if (!get_named_value(env, record, "publication", &publication_value)
      || !create_cleanup_record(
        env,
        "CLEANUP_CONFIRMED",
        NULL,
        &confirmed
      )
      || !create_cleanup_record(
        env,
        "CLEANUP_UNCONFIRMED",
        DECKENT_CUSTODY_REASON_CLEANUP_UNCONFIRMED,
        &unconfirmed
      )) return NULL;
  if (!deckent_native_bind_abort_result_transfer(
        env,
        state,
        confirmed,
        unconfirmed,
        publication_value
      )) return NULL;
  return confirmed;
}

static void clear_pending_exception(napi_env env) {
  bool pending = false;
  napi_value discarded;
  if (napi_is_exception_pending(env, &pending) == napi_ok && pending) {
    (void)napi_get_and_clear_last_exception(env, &discarded);
  }
}

static bool create_unconfirmed_publication_record(
  napi_env env,
  const char *reason,
  uint32_t evidence_bits,
  napi_value read_handle,
  napi_value identity,
  napi_value *output
) {
  napi_value result = deckent_native_create_result_record(env);
  if (result == NULL
      || !napi_set_uint32_value(env, result, "schemaVersion", 1u)
      || !napi_set_string(env, result, "kind", "custody-publication")
      || !napi_set_string(env, result, "state", "PUBLISHED_UNCONFIRMED")
      || (read_handle == NULL
        ? !napi_set_null_value(env, result, "readHandle")
        : !napi_set_value(env, result, "readHandle", read_handle))
      || (identity == NULL
        ? !napi_set_null_value(env, result, "identity")
        : !napi_set_value(env, result, "identity", identity))
      || !napi_set_uint32_value(
        env,
        result,
        "featureEvidenceBits",
        evidence_bits
      )
      || !napi_set_string(env, result, "reasonCode", reason)
      || !deckent_native_finalize_result_record(
        env,
        result,
        DECKENT_CUSTODY_OPERATION_SEAL_PUBLICATION
      )) {
    deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_BACKEND_ABI",
      "Win32 unconfirmed publication result could not be finalized"
    );
    return false;
  }
  *output = result;
  return true;
}

static bool compare_open_files(
  HANDLE left,
  HANDLE right,
  uint64_t length,
  bool *different
) {
  BYTE *left_buffer = NULL;
  BYTE *right_buffer = NULL;
  LARGE_INTEGER zero;
  uint64_t offset = 0u;
  bool ok = false;
  zero.QuadPart = 0;
  *different = false;
  left_buffer = (BYTE *)malloc(DECKENT_IO_CHUNK);
  right_buffer = (BYTE *)malloc(DECKENT_IO_CHUNK);
  if (left_buffer == NULL || right_buffer == NULL
      || !SetFilePointerEx(left, zero, NULL, FILE_BEGIN)
      || !SetFilePointerEx(right, zero, NULL, FILE_BEGIN)) goto done;
  while (offset < length) {
    DWORD request = (DWORD)((length - offset) > DECKENT_IO_CHUNK
      ? DECKENT_IO_CHUNK
      : (length - offset));
    DWORD left_count = 0u;
    DWORD right_count = 0u;
    if (!ReadFile(left, left_buffer, request, &left_count, NULL)
        || !ReadFile(right, right_buffer, request, &right_count, NULL)
        || left_count != request || right_count != request) goto done;
    if (memcmp(left_buffer, right_buffer, request) != 0) {
      *different = true;
      ok = true;
      goto done;
    }
    offset += request;
  }
  {
    BYTE left_probe = 0u;
    BYTE right_probe = 0u;
    DWORD left_count = 0u;
    DWORD right_count = 0u;
    if (!ReadFile(left, &left_probe, 1u, &left_count, NULL)
        || !ReadFile(right, &right_probe, 1u, &right_count, NULL)) goto done;
    if (left_count != 0u || right_count != 0u) *different = true;
  }
  ok = true;
done:
  free(left_buffer);
  free(right_buffer);
  return ok;
}

static bool build_success_publication_result(
  napi_env env,
  deckent_native_state *state,
  const char *publication_state,
  HANDLE source_handle,
  HANDLE parent,
  const WCHAR *target_name,
  uint64_t parent_generation,
  const BYTE *owner_sid,
  DWORD owner_sid_length,
  const deckent_win32_identity *identity,
  napi_value *result_output,
  napi_value *handle_output,
  napi_value *identity_output,
  deckent_native_retire_result *cleanup_output
) {
  HANDLE read_handle = INVALID_HANDLE_VALUE;
  HANDLE read_parent = INVALID_HANDLE_VALUE;
  WCHAR *read_component = NULL;
  deckent_win32_resource *resource = NULL;
  napi_value result = NULL;
  napi_value identity_value = NULL;
  napi_value opaque_handle = NULL;
  int resource_cleanup;
  bool handle_cleanup_confirmed;
  *result_output = NULL;
  *handle_output = NULL;
  *identity_output = NULL;
  *cleanup_output = DECKENT_NATIVE_RETIRE_CONFIRMED;
  if (!duplicate_handle_owned(source_handle, &read_handle)
      || !duplicate_handle_owned(parent, &read_parent)) goto failed;
  read_component = duplicate_component(target_name, wcslen(target_name));
  if (read_component == NULL) goto failed;
  resource = create_resource(
    read_handle,
    read_parent,
    read_component,
    parent_generation,
    false,
    owner_sid,
    owner_sid_length,
    identity
  );
  if (resource == NULL) goto failed;
  read_handle = INVALID_HANDLE_VALUE;
  read_parent = INVALID_HANDLE_VALUE;
  read_component = NULL;
  result = deckent_native_create_result_record(env);
  if (result == NULL || !create_nested_identity(env, identity, &identity_value)) {
    resource_cleanup = close_win32_resource((uintptr_t)resource);
    resource = NULL;
    if (resource_cleanup != 0) {
      *cleanup_output = DECKENT_NATIVE_RETIRE_CLEANUP_UNCONFIRMED;
      clear_pending_exception(env);
      throw_failure(
        env,
        DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
        "Win32 rejected read resource cleanup was not confirmed"
      );
    }
    return false;
  }
  opaque_handle = deckent_native_create_handle(
    env,
    state,
    DECKENT_NATIVE_HANDLE_READ_FILE,
    DECKENT_READ_RIGHTS,
    (uintptr_t)resource,
    close_win32_resource
  );
  resource = NULL;
  if (opaque_handle == NULL) {
    *cleanup_output = DECKENT_NATIVE_RETIRE_CLEANUP_UNCONFIRMED;
    return false;
  }
  if (!napi_set_uint32_value(env, result, "schemaVersion", 1u)
      || !napi_set_string(env, result, "kind", "custody-publication")
      || !napi_set_string(env, result, "state", publication_state)
      || !napi_set_value(env, result, "readHandle", opaque_handle)
      || !napi_set_value(env, result, "identity", identity_value)
      || !napi_set_uint32_value(
        env,
        result,
        "featureEvidenceBits",
        identity->evidence_bits
          | DECKENT_NATIVE_EVIDENCE_FILE_DURABILITY
          | DECKENT_NATIVE_EVIDENCE_DIRECTORY_DURABILITY
      )
      || !napi_set_null_value(env, result, "reasonCode")
      || !deckent_native_finalize_result_record(
        env,
        result,
        DECKENT_CUSTODY_OPERATION_SEAL_PUBLICATION
      )) {
    *cleanup_output = deckent_native_retire_handle(
      env,
      state,
      opaque_handle,
      DECKENT_NATIVE_HANDLE_READ_FILE,
      DECKENT_READ_RIGHTS,
      DECKENT_NATIVE_HANDLE_STATE_OPEN
    );
    return false;
  }
  *result_output = result;
  *handle_output = opaque_handle;
  *identity_output = identity_value;
  return true;
failed:
  handle_cleanup_confirmed = close_owned_handle(&read_handle);
  if (!close_owned_handle(&read_parent)) handle_cleanup_confirmed = false;
  free(read_component);
  if (!handle_cleanup_confirmed) {
    *cleanup_output = DECKENT_NATIVE_RETIRE_CLEANUP_UNCONFIRMED;
    throw_failure(
      env,
      DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
      "Win32 final read authority cleanup was not confirmed"
    );
    return false;
  }
  throw_failure(
    env,
    "E_EXEC_AUTH_NATIVE_ALLOCATION",
    "Win32 final read authority allocation failed"
  );
  return false;
}

static napi_value return_published_unconfirmed(
  napi_env env,
  deckent_native_borrow *borrow,
  napi_value result
) {
  clear_pending_exception(env);
  if (borrow->active) {
    end_borrow_or_fatal(
      env,
      borrow,
      "Win32 published-state borrow could not be released"
    );
  }
  return result;
}

static napi_value return_published_cleanup_failure(
  napi_env env,
  deckent_native_borrow *borrow,
  const char *message
) {
  clear_pending_exception(env);
  if (borrow->active) {
    end_borrow_or_fatal(
      env,
      borrow,
      "Win32 cleanup-failed publication borrow could not be released"
    );
  }
  return deckent_native_throw(
    env,
    DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
    message
  );
}

static napi_value seal_publication_operation(
  napi_env env,
  deckent_native_state *state,
  napi_value record
) {
  napi_value publication_value;
  deckent_native_borrow borrow;
  deckent_win32_publication *publication;
  deckent_win32_identity parent_before;
  deckent_win32_identity parent_after;
  deckent_win32_identity staging_before;
  deckent_win32_identity final_identity;
  deckent_win32_identity final_after_result;
  deckent_win32_identity existing_after;
  napi_value directory_unconfirmed;
  napi_value identity_unconfirmed;
  napi_value success_result = NULL;
  napi_value success_handle = NULL;
  napi_value success_identity = NULL;
  napi_value reconciliation_result = NULL;
  deckent_file_rename_information *rename_info = NULL;
  size_t target_length;
  size_t rename_size;
  HANDLE existing = INVALID_HANDLE_VALUE;
  ULONG_PTR information = 0u;
  NTSTATUS open_status;
  DWORD rename_error;
  bool different = false;
  bool collision_inspection_confirmed = false;
  bool collision_result_confirmed = false;
  bool created_result_confirmed = false;
  bool existing_cleanup_confirmed = true;
  BYTE current_owner[SECURITY_MAX_SID_SIZE];
  DWORD current_owner_length = 0u;
  deckent_native_retire_result result_cleanup = DECKENT_NATIVE_RETIRE_CONFIRMED;
  memset(&borrow, 0, sizeof(borrow));
  memset(&parent_before, 0, sizeof(parent_before));
  memset(&parent_after, 0, sizeof(parent_after));
  memset(current_owner, 0, sizeof(current_owner));
  if (!get_named_value(env, record, "publication", &publication_value)
      || !deckent_native_borrow_handle(
        env,
        state,
        publication_value,
        DECKENT_NATIVE_HANDLE_PUBLICATION,
        DECKENT_NATIVE_RIGHT_PUBLISH,
        DECKENT_NATIVE_HANDLE_STATE_OPEN,
        &borrow
      )) return NULL;
  publication = borrow_publication_resource(env, &borrow);
  if (publication == NULL) goto failed_before_effect;
  if (publication->append_failed
      || publication->published
      || publication->state_transition_unconfirmed) {
    throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_HANDLE_STATE",
      "Win32 failed append cannot be published"
    );
    goto failed_before_effect;
  }
  if (!copy_bound_current_owner(
        env,
        publication->owner_sid,
        publication->owner_sid_length,
        current_owner,
        &current_owner_length
      )
      || !revalidate_directory_authority(
        env,
        publication->parent,
        publication->owner_sid,
        publication->owner_sid_length,
        &publication->parent_identity,
        &parent_before
      )
      || !query_identity(
        env,
        publication->staging,
        publication->owner_sid,
        publication->owner_sid_length,
        0,
        &staging_before
      )) goto failed_before_effect;
  if (!same_identity_value(&staging_before, &publication->staging_identity)
      || staging_before.size != publication->byte_length
      || staging_before.size > publication->max_bytes) {
    throw_failure(
      env,
      DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "Win32 staging identity changed before publication"
    );
    goto failed_before_effect;
  }
  if (!flush_exact_handle(publication->staging)) {
    throw_failure(
      env,
      DECKENT_NATIVE_ERROR_DURABILITY_UNCONFIRMED,
      "Win32 staging file durability could not be confirmed"
    );
    goto failed_before_effect;
  }
  if (!create_unconfirmed_publication_record(
        env,
        DECKENT_CUSTODY_REASON_DIRECTORY_DURABILITY_UNCONFIRMED,
        staging_before.evidence_bits | DECKENT_NATIVE_EVIDENCE_FILE_DURABILITY,
        NULL,
        NULL,
        &directory_unconfirmed
      )
      || !create_unconfirmed_publication_record(
        env,
        DECKENT_CUSTODY_REASON_FINAL_IDENTITY_UNCONFIRMED,
        staging_before.evidence_bits | DECKENT_NATIVE_EVIDENCE_FILE_DURABILITY,
        NULL,
        NULL,
        &identity_unconfirmed
      )) goto failed_before_effect;
  target_length = wcslen(publication->target_name);
  if (target_length > (SIZE_MAX - offsetof(deckent_file_rename_information, file_name))
      / sizeof(WCHAR)
      || target_length * sizeof(WCHAR) > UINT32_MAX) {
    throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ARGUMENT",
      "Win32 publication target length is invalid"
    );
    goto failed_before_effect;
  }
  rename_size = offsetof(deckent_file_rename_information, file_name)
    + target_length * sizeof(WCHAR);
  rename_info = (deckent_file_rename_information *)calloc(1u, rename_size);
  if (rename_info == NULL) {
    throw_failure(
      env,
      "E_EXEC_AUTH_NATIVE_ALLOCATION",
      "Win32 no-replace rename allocation failed"
    );
    goto failed_before_effect;
  }
  rename_info->replace_if_exists = FALSE;
  rename_info->root_directory = publication->parent;
  rename_info->file_name_length = (DWORD)(target_length * sizeof(WCHAR));
  memcpy(
    rename_info->file_name,
    publication->target_name,
    rename_info->file_name_length
  );
  if (!SetFileInformationByHandle(
        publication->staging,
        FileRenameInfo,
        rename_info,
        (DWORD)rename_size
      )) {
    rename_error = GetLastError();
    free(rename_info);
    rename_info = NULL;
    if (rename_error != ERROR_FILE_EXISTS && rename_error != ERROR_ALREADY_EXISTS) {
      publication->published = true;
      publication->state_transition_unconfirmed = true;
      mark_published_unconfirmed_or_fatal(env, state, publication_value);
      publication->state_transition_unconfirmed = false;
      SecureZeroMemory(current_owner, sizeof(current_owner));
      return return_published_unconfirmed(env, &borrow, identity_unconfirmed);
    }
    open_status = nt_open_exact_with_share(
      publication->parent,
      publication->target_name,
      target_length,
      DECKENT_COLLISION_FILE_ACCESS,
      FILE_OPEN,
      false,
      NULL,
      FILE_SHARE_READ,
      &existing,
      &information
    );
    if (open_status < 0) {
      throw_nt_open_failure(env, open_status);
    } else if (information != DECKENT_FILE_OPENED_INFORMATION) {
      throw_failure(
        env,
        DECKENT_NATIVE_ERROR_NAMESPACE_CONFLICT,
        "Win32 collision namespace open result was ambiguous"
      );
    } else if (!query_identity(
          env,
          existing,
          publication->owner_sid,
          publication->owner_sid_length,
          0,
          &final_identity
        )) {
      /* query_identity installed the exact typed failure. */
    } else if (final_identity.size != staging_before.size) {
      throw_failure(
        env,
        DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
        "Win32 collision size changed during inspection"
      );
    } else if (!compare_open_files(
          publication->staging,
          existing,
          staging_before.size,
          &different
        )) {
      throw_failure(
        env,
        DECKENT_NATIVE_ERROR_IO_UNCONFIRMED,
        "Win32 collision byte comparison could not be confirmed"
      );
    } else if (!query_identity(
          env,
          existing,
          publication->owner_sid,
          publication->owner_sid_length,
          0,
          &existing_after
        )) {
      /* query_identity installed the exact typed failure. */
    } else if (!same_identity_value(&final_identity, &existing_after)) {
      throw_failure(
        env,
        DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
        "Win32 collision target changed during inspection"
      );
    } else if (!query_identity(
          env,
          publication->staging,
          publication->owner_sid,
          publication->owner_sid_length,
          0,
          &staging_before
        )) {
      /* query_identity installed the exact typed failure. */
    } else if (!same_identity_value(
          &staging_before,
          &publication->staging_identity
        )) {
      throw_failure(
        env,
        DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
        "Win32 staging changed during collision inspection"
      );
    } else if (revalidate_directory_authority(
          env,
          publication->parent,
          publication->owner_sid,
          publication->owner_sid_length,
          &parent_before,
          &parent_after
        )) {
      collision_inspection_confirmed = true;
    }
    if (!collision_inspection_confirmed) {
      if (!close_owned_handle(&existing)) {
        clear_pending_exception(env);
        throw_failure(
          env,
          DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
          "Win32 collision inspection cleanup was not confirmed"
        );
      }
      goto failed_before_effect;
    }
    if (different) {
      if (!close_owned_handle(&existing)) {
        clear_pending_exception(env);
        throw_failure(
          env,
          DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
          "Win32 differing collision cleanup was not confirmed"
        );
        goto failed_before_effect;
      }
      throw_failure(
        env,
        DECKENT_NATIVE_ERROR_NAMESPACE_CONFLICT,
        "Win32 publication target contains different bytes"
      );
      goto failed_before_effect;
    }
    if (!flush_exact_handle(existing)) {
      throw_failure(
        env,
        DECKENT_NATIVE_ERROR_DURABILITY_UNCONFIRMED,
        "Win32 collision file durability could not be confirmed"
      );
      existing_cleanup_confirmed = close_owned_handle(&existing);
      if (!existing_cleanup_confirmed) {
        clear_pending_exception(env);
        throw_failure(
          env,
          DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
          "Win32 rejected collision cleanup was not confirmed"
        );
      }
      goto failed_before_effect;
    }
    if (!build_success_publication_result(
          env,
          state,
          "EXISTING_IDENTICAL",
          existing,
          publication->parent,
          publication->target_name,
          publication->parent_generation,
          publication->owner_sid,
          publication->owner_sid_length,
          &final_identity,
          &success_result,
          &success_handle,
          &success_identity,
          &result_cleanup
        )) {
      existing_cleanup_confirmed = close_owned_handle(&existing);
      if (!existing_cleanup_confirmed
          || result_cleanup != DECKENT_NATIVE_RETIRE_CONFIRMED) {
        clear_pending_exception(env);
        throw_failure(
          env,
          DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
          "Win32 rejected collision result cleanup was not confirmed"
        );
      }
      goto failed_before_effect;
    }
    if (!query_identity(
          env,
          existing,
          publication->owner_sid,
          publication->owner_sid_length,
          0,
          &final_after_result
        )) {
      /* query_identity installed the exact typed failure. */
    } else if (!same_identity_value(&final_identity, &final_after_result)) {
      throw_failure(
        env,
        DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
        "Win32 collision target changed during result construction"
      );
    } else if (revalidate_directory_authority(
          env,
          publication->parent,
          publication->owner_sid,
          publication->owner_sid_length,
          &parent_after,
          &parent_before
        )) {
      collision_result_confirmed = true;
    }
    if (!collision_result_confirmed) {
      clear_pending_exception(env);
      result_cleanup = deckent_native_retire_handle(
        env,
        state,
        success_handle,
        DECKENT_NATIVE_HANDLE_READ_FILE,
        DECKENT_READ_RIGHTS,
        DECKENT_NATIVE_HANDLE_STATE_OPEN
      );
      existing_cleanup_confirmed = close_owned_handle(&existing);
      if (!existing_cleanup_confirmed
          || result_cleanup != DECKENT_NATIVE_RETIRE_CONFIRMED) {
        clear_pending_exception(env);
        throw_failure(
          env,
          DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
          "Win32 rejected collision result cleanup was not confirmed"
        );
      } else {
        throw_failure(
          env,
          DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
          "Win32 collision result authority changed before return"
        );
      }
      goto failed_before_effect;
    }
    if (!create_unconfirmed_publication_record(
          env,
          DECKENT_CUSTODY_REASON_CLEANUP_UNCONFIRMED,
          final_identity.evidence_bits
            | DECKENT_NATIVE_EVIDENCE_FILE_DURABILITY
            | DECKENT_NATIVE_EVIDENCE_DIRECTORY_DURABILITY,
          success_handle,
          success_identity,
          &reconciliation_result
        )) {
      result_cleanup = deckent_native_retire_handle(
        env,
        state,
        success_handle,
        DECKENT_NATIVE_HANDLE_READ_FILE,
        DECKENT_READ_RIGHTS,
        DECKENT_NATIVE_HANDLE_STATE_OPEN
      );
      existing_cleanup_confirmed = close_owned_handle(&existing);
      if (!existing_cleanup_confirmed
          || result_cleanup != DECKENT_NATIVE_RETIRE_CONFIRMED) {
        clear_pending_exception(env);
        throw_failure(
          env,
          DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
          "Win32 collision reconciliation cleanup was not confirmed"
        );
      }
      goto failed_before_effect;
    }
    existing_cleanup_confirmed = close_owned_handle(&existing);
    SecureZeroMemory(current_owner, sizeof(current_owner));
    end_borrow_or_fatal(
      env,
      &borrow,
      "Win32 collision publication borrow could not be released"
    );
    if (!deckent_native_bind_seal_result_transfer(
          env,
          state,
          success_result,
          reconciliation_result,
          publication_value,
          success_handle,
          !existing_cleanup_confirmed
        )) return NULL;
    return success_result;
  }
  free(rename_info);
  rename_info = NULL;
  publication->published = true;
  publication->state_transition_unconfirmed = true;
  mark_published_unconfirmed_or_fatal(env, state, publication_value);
  publication->state_transition_unconfirmed = false;
  if (!flush_exact_handle(publication->parent)) {
    SecureZeroMemory(current_owner, sizeof(current_owner));
    return return_published_unconfirmed(env, &borrow, directory_unconfirmed);
  }
  if (!close_owned_handle(&publication->staging)) {
    publication->cleanup_unconfirmed = true;
    SecureZeroMemory(current_owner, sizeof(current_owner));
    return return_published_cleanup_failure(
      env,
      &borrow,
      "Win32 published staging-handle cleanup was not confirmed"
    );
  }
  open_status = nt_open_exact_with_share(
    publication->parent,
    publication->target_name,
    target_length,
    DECKENT_READ_FILE_ACCESS,
    FILE_OPEN,
    false,
    NULL,
    FILE_SHARE_READ,
    &publication->staging,
    &information
  );
  if (open_status < 0
      || information != DECKENT_FILE_OPENED_INFORMATION
      || !query_identity(
        env,
        publication->staging,
        publication->owner_sid,
        publication->owner_sid_length,
        0,
        &final_identity
      )
      || !same_identity_value(&final_identity, &staging_before)
      || !revalidate_directory_authority(
        env,
        publication->parent,
        publication->owner_sid,
        publication->owner_sid_length,
        &parent_before,
        &parent_after
      )
      || !build_success_publication_result(
        env,
        state,
        "CREATED",
        publication->staging,
        publication->parent,
        publication->target_name,
        publication->parent_generation,
        publication->owner_sid,
        publication->owner_sid_length,
        &final_identity,
        &success_result,
        &success_handle,
        &success_identity,
        &result_cleanup
      )) {
    SecureZeroMemory(current_owner, sizeof(current_owner));
    if (result_cleanup != DECKENT_NATIVE_RETIRE_CONFIRMED) {
      return return_published_cleanup_failure(
        env,
        &borrow,
        "Win32 rejected final read authority cleanup was not confirmed"
      );
    }
    return return_published_unconfirmed(env, &borrow, identity_unconfirmed);
  }
  if (!query_identity(
        env,
        publication->staging,
        publication->owner_sid,
        publication->owner_sid_length,
        0,
        &final_after_result
      )) {
    /* query_identity installed the exact typed failure. */
  } else if (!same_identity_value(&final_identity, &final_after_result)) {
    throw_failure(
      env,
      DECKENT_NATIVE_ERROR_IDENTITY_CHANGED,
      "Win32 created target changed during result construction"
    );
  } else if (revalidate_directory_authority(
        env,
        publication->parent,
        publication->owner_sid,
        publication->owner_sid_length,
        &parent_after,
        &parent_before
      )) {
    created_result_confirmed = true;
  }
  if (!created_result_confirmed) {
    clear_pending_exception(env);
    result_cleanup = deckent_native_retire_handle(
      env,
      state,
      success_handle,
      DECKENT_NATIVE_HANDLE_READ_FILE,
      DECKENT_READ_RIGHTS,
      DECKENT_NATIVE_HANDLE_STATE_OPEN
    );
    SecureZeroMemory(current_owner, sizeof(current_owner));
    if (result_cleanup != DECKENT_NATIVE_RETIRE_CONFIRMED) {
      return return_published_cleanup_failure(
        env,
        &borrow,
        "Win32 rejected created-result cleanup was not confirmed"
      );
    }
    return return_published_unconfirmed(env, &borrow, identity_unconfirmed);
  }
  if (!create_unconfirmed_publication_record(
        env,
        DECKENT_CUSTODY_REASON_CLEANUP_UNCONFIRMED,
        final_identity.evidence_bits
          | DECKENT_NATIVE_EVIDENCE_FILE_DURABILITY
          | DECKENT_NATIVE_EVIDENCE_DIRECTORY_DURABILITY,
        success_handle,
        success_identity,
        &reconciliation_result
      )) {
    clear_pending_exception(env);
    result_cleanup = deckent_native_retire_handle(
      env,
      state,
      success_handle,
      DECKENT_NATIVE_HANDLE_READ_FILE,
      DECKENT_READ_RIGHTS,
      DECKENT_NATIVE_HANDLE_STATE_OPEN
    );
    SecureZeroMemory(current_owner, sizeof(current_owner));
    if (result_cleanup != DECKENT_NATIVE_RETIRE_CONFIRMED) {
      return return_published_cleanup_failure(
        env,
        &borrow,
        "Win32 reconciliation read authority cleanup was not confirmed"
      );
    }
    return return_published_unconfirmed(env, &borrow, identity_unconfirmed);
  }
  SecureZeroMemory(current_owner, sizeof(current_owner));
  end_borrow_or_fatal(
    env,
    &borrow,
    "Win32 created publication borrow could not be released"
  );
  if (!deckent_native_bind_seal_result_transfer(
        env,
        state,
        success_result,
        reconciliation_result,
        publication_value,
        success_handle,
        false
      )) return NULL;
  return success_result;
failed_before_effect:
  free(rename_info);
  if (!close_owned_handle(&existing)) {
    clear_pending_exception(env);
    throw_failure(
      env,
      DECKENT_NATIVE_ERROR_CLEANUP_UNCONFIRMED,
      "Win32 rejected publication cleanup was not confirmed"
    );
  }
  SecureZeroMemory(current_owner, sizeof(current_owner));
  if (borrow.active) {
    end_borrow_or_fatal(
      env,
      &borrow,
      "Win32 rejected publication borrow could not be released"
    );
  }
  return NULL;
}

static napi_value invoke_win32_custody(
  napi_env env,
  deckent_native_state *state,
  deckent_custody_operation operation,
  size_t argc,
  napi_value *argv
) {
  napi_value record;
  if (state == NULL) {
    return deckent_native_throw(
      env,
      "E_EXEC_AUTH_NATIVE_STATE",
      "Win32 custody environment state is unavailable"
    );
  }
  if (!require_win32_api(env)) return NULL;
  switch (operation) {
    case DECKENT_CUSTODY_OPERATION_PROBE:
      if (!exact_input_record(
            env,
            state,
            operation,
            argc,
            argv,
            &record
          )) return NULL;
      return probe_operation(env, state, record);
    case DECKENT_CUSTODY_OPERATION_OPEN_ROOT:
      if (!exact_input_record(
            env,
            state,
            operation,
            argc,
            argv,
            &record
          )) return NULL;
      return open_root_operation(env, state, record);
    case DECKENT_CUSTODY_OPERATION_OPEN_DIRECTORY_AT:
      if (!exact_input_record(
            env,
            state,
            operation,
            argc,
            argv,
            &record
          )) return NULL;
      return open_child_operation(
        env,
        state,
        operation,
        record,
        true
      );
    case DECKENT_CUSTODY_OPERATION_OPEN_FILE_AT:
      if (!exact_input_record(
            env,
            state,
            operation,
            argc,
            argv,
            &record
          )) return NULL;
      return open_child_operation(
        env,
        state,
        operation,
        record,
        false
      );
    case DECKENT_CUSTODY_OPERATION_BEGIN_PUBLICATION:
      if (!exact_input_record(
            env,
            state,
            operation,
            argc,
            argv,
            &record
          )) return NULL;
      return begin_publication_operation(env, state, record);
    case DECKENT_CUSTODY_OPERATION_APPEND_PUBLICATION:
      if (!exact_input_record(
            env,
            state,
            operation,
            argc,
            argv,
            &record
          )) return NULL;
      return append_publication_operation(env, state, record);
    case DECKENT_CUSTODY_OPERATION_SEAL_PUBLICATION:
      if (!exact_input_record(
            env,
            state,
            operation,
            argc,
            argv,
            &record
          )) return NULL;
      return seal_publication_operation(env, state, record);
    case DECKENT_CUSTODY_OPERATION_ABORT_PUBLICATION:
      if (!exact_input_record(
            env,
            state,
            operation,
            argc,
            argv,
            &record
          )) return NULL;
      return abort_publication_operation(env, state, record);
    case DECKENT_CUSTODY_OPERATION_READ_BOUNDED:
      if (!exact_input_record(
            env,
            state,
            operation,
            argc,
            argv,
            &record
          )) return NULL;
      return read_bounded_operation(env, state, record);
    case DECKENT_CUSTODY_OPERATION_SCAN_DIRECTORY_BOUNDED:
      if (!exact_input_record(
            env,
            state,
            operation,
            argc,
            argv,
            &record
          )) return NULL;
      return scan_directory_bounded_operation(env, state, record);
    case DECKENT_CUSTODY_OPERATION_IDENTITY:
      if (!exact_input_record(
            env,
            state,
            operation,
            argc,
            argv,
            &record
          )) return NULL;
      return identity_operation(env, state, record);
    case DECKENT_CUSTODY_OPERATION_APPLY_PRIVATE:
      if (!exact_input_record(
            env,
            state,
            operation,
            argc,
            argv,
            &record
          )) return NULL;
      return apply_private_operation(env, state, record);
    case DECKENT_CUSTODY_OPERATION_SYNC:
      if (!exact_input_record(
            env,
            state,
            operation,
            argc,
            argv,
            &record
          )) return NULL;
      return sync_operation(env, state, record);
    default:
      return deckent_native_throw(
        env,
        "E_EXEC_AUTH_NATIVE_OPERATION",
        "Win32 custody operation is unsupported"
      );
  }
}

const deckent_custody_backend_v1 *deckent_custody_win32_backend_v1(void) {
  static const deckent_custody_backend_v1 backend = {
    (uint32_t)sizeof(deckent_custody_backend_v1),
    DECKENT_EXEC_AUTHORITY_ABI_VERSION_NUMBER,
    DECKENT_NATIVE_PLATFORM_WIN32,
    DECKENT_NATIVE_FEATURE_CUSTODY_WIN32,
    invoke_win32_custody,
  };
  return &backend;
}
