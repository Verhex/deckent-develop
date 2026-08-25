# Provider-observation adoption: durable receipt contract

**Specified:** 2026-08-22 UTC
**Status:** normative v1 contract with implementation synchronization
**Implementation evidence:** receipt store and focused tests as of 2026-08-22 UTC
**Audience:** implementers and operators of provider-observation adoption

## Decision

Adoption verification may publish an immutable, versioned receipt only after a fresh, successful
comparison of the source preimage and target database. Publication is atomic and create-only.
Receipts are scoped by environment and tenant, bind project-relative file references to content
and lineage digests, and never authorize migration. Any ambiguity, mismatch, collision, partial
artifact, unsupported version, or unsafe filesystem condition fails closed.

The receipt is evidence that two identified inputs matched at one verification instant. It is not
a database-mutation instruction, a mutable “current receipt,” or authority to infer that a later
disk state still matches. A consumer MUST revalidate all bindings before relying on it.

Normative terms **MUST**, **MUST NOT**, **SHOULD**, and **MAY** have their RFC 2119 meanings.
The requirements below are preserved even where the current implementation is still pending.

## Current implementation truth

Production code now provides a receipt store; this document is no longer future-only. The scoped
evidence is
`src/core/provider-execution-observation-adoption-receipt-store.ts` and
`tests/core/provider-execution-observation-adoption-receipt-store.test.ts`.

### Implemented

- The v1 envelope below is the production shape. Serialization emits one UTF-8 JSON object with
  no BOM, whitespace, newline, or trailing bytes. Object keys are recursively sorted
  lexicographically. Parsing rejects input over 64 KiB, invalid UTF-8, non-canonical bytes,
  duplicate or unknown fields, missing fields, invalid types and invariants, and unsupported
  versions. `receiptId` uses the specified domain-separated preimage and the final filename uses
  its lowercase 64-hex suffix.
- Scope keys are derived from non-empty NFC environment and tenant identifiers with the specified
  SHA-256/base32 domain separation. Raw identifiers are not persisted. Reads address only the
  derived scope and exact receipt ID; diagnostic discovery is non-recursive, final-name-only, and
  bounded to at most 10,000 directory entries.
- Source and target bindings use validated project-relative paths, exact main-file byte lengths
  and SHA-256 digests, schema versions, lineage digests, and row counts. Publication invokes the
  existing adoption verifier, proves that the two inputs are different inodes, re-reads both
  files, and fails if their identity or bytes changed. The receipt records
  `databaseMutation: "none"`.
- On the exercised POSIX path, publication creates a random `.receipt-<32 lowercase hex>.tmp`
  regular file exclusively at mode `0600`, fully writes and `fsync`s it, and publishes by
  create-only hard link. It then flushes the containing directory, reopens the final file,
  verifies permissions, identity, canonical content, receipt ID, and exact intended bytes, and
  removes only the temporary pathname whose inode it created.
- Identical bytes return `existing-identical`. A conflicting final artifact returns
  `RECEIPT_COLLISION` without overwriting it. Focused tests prove strict parsing, scope isolation,
  exact-byte retry across a fresh store instance, stale main-file rejection, collision
  preservation, owner-only file mode, bounded discovery, and unchanged source and target bytes.
- Exact-ID reads validate scope, canonical bytes, filename/receipt identity, and optionally an
  expected plan digest. With `fresh: true`, they recheck file identity, main-file byte digests,
  row counts, and lineage through the adoption inspector.

### Still pending or unproven

These gaps do not weaken the normative requirements in the remainder of this contract:

- **Production integration:** the scoped evidence does not prove that publish/read is wired into
  every production caller or that a receipt authorizes any separately defined replay operation.
- **WAL:** stable SQLite snapshot/backup materialization and sidecar monitoring are not
  implemented here. The store hashes the live main database file and calls the existing
  verifier/inspector by pathname. WAL correctness, sidecar-change rejection, and deterministic
  snapshot bytes therefore remain pending.
- **Path traversal hardening:** validation, `realpath`, component `lstat`, and final
  `O_NOFOLLOW` checks exist, but descriptor-relative traversal from an opened trusted-root handle
  and race-free component identity checks are not implemented. Reparse-point defense is unproven.
- **Permissions:** POSIX owner UID and group/other mode checks are implemented where
  `process.getuid` exists. Configured service-principal matching, ACL and inherited-ACL
  inspection, elevated-execution rejection, secure snapshot directories, and log-redaction
  evidence are absent.
- **Durability and crash safety:** file and POSIX directory `fsync` calls exist, but crash-point
  testing and filesystem capability probing are absent. Windows directory flush is explicitly
  skipped. Atomicity and durability on network, object-backed, synchronized, overlay, or
  Unicode/case-normalizing filesystems are unproven.
- **Scale:** envelope counts are bounded at 1,000,000 and discovery at 10,000, but the focused
  tests do not prove the `1000000`/`1000001` boundary, bounded-memory inspection, or large-store
  behavior.
- **Replay freshness:** `fresh: true` is implemented, but it does not require
  `expectedPlanDigest`; stable snapshots, ACL revalidation, and evidence for an idempotent replay
  operation remain pending.
- **Platform support:** no scoped conformance evidence proves the full contract on Linux, macOS,
  Windows, or WSL. The POSIX hard-link path is exercised by the focused tests only on their host;
  no portability claim follows from that result.

## Storage and trust boundaries

The project supplies an explicit, already-trusted project root. Neither a receipt nor an absolute
path discovered on disk may select or replace that root. Under it, receipts live at:

```text
.deckent/provider-observation-adoption/receipts/v1/
  <environment-key>/<tenant-key>/<receipt-id>.json
```

- `environment-key` and `tenant-key` MUST be lowercase, unpadded base32 SHA-256 digests of
  canonical, domain-separated environment and tenant identifiers. They MUST NOT expose the raw
  identifiers. The canonical identifier rules are deployment inputs and MUST be identical for
  writer and reader; missing identifiers are errors, not a shared default.
- The writer MUST independently derive both keys from authenticated execution context. Values in
  a plan, receipt, command argument, source database, or target database MUST NOT override that
  context. A reader MUST derive them again and MUST search only that exact directory.
- Every component below the trusted root MUST be opened without following symlinks or reparse
  points and then verified as a descendant of the opened root. `..`, empty components, alternate
  data streams, device paths, and path separators inside a component are forbidden.
- Implementations MUST NOT fall back to another environment, tenant, project, home directory, or
  system-wide store. Receipt discovery by recursive scan is forbidden.

This layout is append-only. There is no singleton `receipt.json`, “latest” pointer, overwrite,
rename-over-existing, or last-write-wins behavior.

## Canonical v1 envelope

The persisted file MUST be UTF-8 JSON in RFC 8785 JSON Canonicalization Scheme form, with no BOM
or trailing bytes. It MUST be a JSON object containing exactly these fields; unknown, missing,
duplicate, non-canonical, or incorrectly typed fields invalidate the receipt.

```json
{
  "schema": "deckent.provider-observation-adoption-receipt",
  "version": 1,
  "receiptId": "sha256:<64 lowercase hex>",
  "scope": {
    "environmentKey": "<52 lowercase base32 characters>",
    "tenantKey": "<52 lowercase base32 characters>"
  },
  "source": {
    "projectRelativePath": "<normalized relative path>",
    "schemaVersion": 1,
    "byteLength": 0,
    "contentDigest": "sha256:<64 lowercase hex>",
    "lineageDigest": "sha256:<64 lowercase hex>",
    "rowCount": 0
  },
  "target": {
    "projectRelativePath": "<normalized relative path>",
    "schemaVersion": 2,
    "byteLength": 0,
    "contentDigest": "sha256:<64 lowercase hex>",
    "legacyLineageDigest": "sha256:<64 lowercase hex>",
    "legacyRowCount": 0,
    "runOwnedRowCount": 0,
    "totalRowCount": 0
  },
  "planDigest": "sha256:<64 lowercase hex>",
  "verifiedAt": "<RFC 3339 UTC timestamp with Z>",
  "databaseMutation": "none"
}
```

All integers MUST be safe non-negative JSON integers. Each individual row count and their sum
MUST be at most `1000000`; `target.legacyRowCount + target.runOwnedRowCount` MUST equal
`target.totalRowCount`, and `source.rowCount` MUST equal `target.legacyRowCount`. The implementation
MUST enforce the bound while streaming/counting and abort before retaining more than bounded
state. It MUST NOT deserialize a million rows into memory merely to calculate the receipt.

`verifiedAt` is diagnostic and does not provide freshness or ordering authority. Clock rollback or
equal timestamps MUST NOT select a winner.

### Paths and content binding

`projectRelativePath` is a display-and-resolution reference, never independent authority. It MUST:

1. use `/` separators and Unicode NFC;
2. be relative, non-empty, and already lexically normalized;
3. contain no `.`, `..`, empty, NUL, control-character, drive-letter, UNC, URI, device, or
   platform-reserved component; and
4. resolve, through handle-based checks, to a regular file within the trusted project root.

Absolute paths MUST NOT be persisted, accepted, or reconstructed from receipt data. The source
and target paths MUST be distinct after platform-aware identity checks. Case folding is used only
to detect aliasing on case-insensitive filesystems; the stored spelling must exactly match the
opened project-relative entry.

`contentDigest` is SHA-256 over the exact file bytes and `byteLength` is the count of those bytes.
The verifier MUST open each file read-only, capture stable file identity and metadata, stream the
digest and semantic inspection from that handle, then confirm identity, length, and relevant
metadata did not change. Mutation during inspection is `INPUT_CHANGED` and produces no receipt.
For SQLite, digesting a live main file alone is forbidden: use a read-only transaction plus the
stable snapshot procedure below.

Lineage and plan digests MUST use separately specified, domain-separated canonical encodings.
They are not interchangeable with byte digests. In v1, the source lineage digest MUST exactly
equal the target legacy-lineage digest. Digest algorithms or canonical encodings cannot be
silently upgraded; a new algorithm requires a new envelope version.

### Receipt identity

Compute `receiptId` as SHA-256 of the canonical envelope with `receiptId` omitted, prefixed by the
ASCII domain `deckent:provider-observation-adoption-receipt:v1\0`. The filename MUST be the 64-hex
portion of that value plus `.json`. On read, recompute and require equality between content,
`receiptId`, and filename. This makes retries deterministic without treating a timestamp as an
idempotency key; a retry of the same verified inputs and timestamp uses the identical envelope.

## Verification and publication algorithm

The conforming writer MUST perform these steps in order:

1. Derive environment and tenant scope from authenticated context and open the trusted project
   root. Validate or create only the fixed receipt directory chain using descriptor-relative,
   no-follow operations.
2. Open source and target read-only by validated project-relative references. Obtain stable
   SQLite snapshots, validate schemas, compare every legacy row and contradiction row, reject
   changed/retired/owned legacy rows and every unowned extra row, and enforce the million-row
   limit. Verification MUST have no database mutation path.
3. Recompute the caller-supplied plan digest from the canonical plan and require an exact match.
   A missing or stale plan is an error. Verification MUST NOT generate, repair, or apply a
   migration implicitly.
4. Build the strict envelope from the opened snapshots, canonicalize it, calculate `receiptId`,
   and add that identifier. Recanonicalize and self-validate before writing.
5. In the destination directory, create a cryptographically random temporary regular file with
   exclusive creation, mode `0600`, and no-follow protections. Write all bytes, require a complete
   write, flush file data and metadata, then publish to the final name with an atomic
   **no-replace** primitive. A normal rename that can replace a destination is forbidden.
6. Flush the containing directory where supported. Reopen the final entry without following
   links, require a regular file with acceptable ownership/permissions, and byte-compare it with
   the intended canonical bytes. Only then return success. Clean up an unpublished temporary file
   on failure; never delete or alter a published receipt.

If the final name already exists, the writer MUST open it safely and validate its canonical bytes.
Byte-identical, fully valid content is an idempotent success (`existing-identical`). Any difference,
including valid JSON with the same name, is `RECEIPT_COLLISION`; it MUST preserve both the existing
file and databases and return failure. It MUST NOT overwrite, suffix, quarantine, or choose the
newer receipt automatically.

Concurrent writers therefore converge only when their complete bytes are identical. Otherwise
one create-only publication succeeds and every conflicting writer fails closed. Locks MAY reduce
work but MUST NOT supply correctness; stale, missing, advisory, or unsupported locks do not permit
replacement. Readers ignore temporary files and accept only a final filename that validates.

## SQLite WAL and sidecars

For a target or source in WAL mode, the logical snapshot includes committed pages visible through
the read-only SQLite transaction, not merely bytes currently in the main database file. The
implementation MUST use SQLite's supported snapshot/backup mechanism to materialize a stable,
read-only snapshot in a private `0700` temporary directory on the same trusted filesystem, then
hash and inspect that snapshot. It MUST NOT copy the main file while ignoring `-wal`, trigger a
checkpoint, truncate/delete a WAL, recover hot state, or mutate `-wal`/`-shm` sidecars.

The recorded `contentDigest` and `byteLength` bind the deterministic materialized snapshot bytes;
the lineage digest binds canonical logical rows. Snapshot creation details are not receipt paths.
Any unexpected database sidecar (`-journal`, `-wal`, `-shm`, or platform equivalent), failure to
obtain a consistent snapshot, busy timeout, corruption, or sidecar change during acquisition is a
hard failure. Receipt-store temporary files are recognizable by a fixed implementation prefix,
are never valid receipts, and may be removed only after proving they are unlinked, regular files
owned by the current principal in the exact destination directory. Unknown sidecars are never
deleted automatically.

## Permissions and privacy

- Newly created receipt directories MUST be owner-only (`0700`) and files owner-readable/writable
  only (`0600`), subject to an equally or more restrictive platform ACL. Existing directories or
  files that grant access to group, everyone, or an untrusted principal cause failure; the writer
  MUST NOT silently chmod or rewrite them.
- The owner/security principal MUST match the configured service principal. Elevated execution,
  ownership mismatch, inherited permissive ACLs, and inability to inspect ACLs fail closed.
- Receipts MUST contain no raw environment, tenant, project-root, user, provider principal,
  execution, run, task, attempt, database row, prompt, token, credential, hostname, or absolute
  path. The opaque scope keys and cryptographic digests are still sensitive metadata and MUST be
  redacted from default logs. Errors expose an error code and safe relative role (`source` or
  `target`), not raw identities or receipt bodies.
- Temporary snapshot and receipt bytes receive the same protections. They MUST be removed on
  normal completion and best-effort on failure without crossing the opened directory boundary.

## Replay and reader contract

A replay request MUST name an exact `receiptId`; “latest,” directory order, modification time, and
first match are forbidden. Before replay, the reader MUST:

1. derive the current environment and tenant keys from authenticated context;
2. safely open the exact final file beneath that scoped directory;
3. enforce permissions, strict v1 parsing/canonicalization, filename identity, and receipt digest;
4. require `databaseMutation` to be exactly `none` and reject unsupported versions;
5. resolve and reopen both project-relative files beneath the same trusted project root;
6. acquire fresh stable snapshots and require exact byte lengths, content digests, schema versions,
   row counts, lineage digests, plan digest, and all cross-field invariants; and
7. rerun the semantic adoption checks, including contradiction and ownership checks.

Only an exact match may authorize the separately defined replay operation. Replay MUST itself be
idempotent under its own durable operation key; this receipt does not turn a non-idempotent
operation into an idempotent one. Missing receipts, stale inputs, missing sidecars, changed ACLs,
or validation uncertainty return failure without migration or repair.

## Platform semantics

This section remains the required portability contract, not a statement of current support.
No complete Linux, macOS, Windows, or WSL conformance claim is proven by the scoped implementation
or tests. Lack of a required primitive is `UNSUPPORTED_FILESYSTEM`, not permission to weaken the
contract.

- **Linux (unproven):** use descriptor-relative no-follow opens and `renameat2(RENAME_NOREPLACE)` or an
  equivalent atomic create-only publication. Require a local filesystem that preserves atomicity,
  durable flushes, ownership, and modes.
- **macOS (unproven):** use no-follow descriptor-relative opens and an atomic exclusive publication primitive
  such as `renamex_np(RENAME_EXCL)`. Validate POSIX mode plus applicable ACLs.
- **Windows (unproven):** reject drive-relative, UNC-from-receipt, device, reserved-name, trailing-dot/space,
  and alternate-data-stream syntax. Use handles opened against the trusted root with reparse-point
  traversal disabled, exclusive `CREATE_NEW`-equivalent publication, write-through/flush, and
  inspect the DACL and owner. A replace-capable move is forbidden.
- **WSL (unproven):** determine the backing filesystem. Native Linux filesystems use Linux rules. Mounted
  Windows/DrvFS paths MUST satisfy Windows identity, reparse, ACL, durability, case-alias, and
  exclusive-create guarantees as observed through WSL. If those guarantees cannot be proven,
  the receipt store is unsupported.

Network shares, object-backed mounts, case/Unicode-normalizing filesystems, overlay filesystems,
and synchronized folders are supported only after an implementation-specific capability probe
proves no-replace atomicity, stable identities, ACL enforcement, and durable file/directory flush.
The probe MUST fail closed and MUST NOT publish a production receipt as its test artifact.

## Required failure surface

Implementations SHOULD expose stable machine-readable codes at least for:

`INVALID_SCOPE`, `INVALID_PATH`, `PATH_ESCAPE`, `UNSAFE_LINK`, `PERMISSION_DENIED`,
`UNSUPPORTED_FILESYSTEM`, `INPUT_CHANGED`, `SNAPSHOT_UNAVAILABLE`, `SCHEMA_MISMATCH`,
`ROW_LIMIT_EXCEEDED`, `LINEAGE_MISMATCH`, `PLAN_MISMATCH`, `INVALID_RECEIPT`,
`UNSUPPORTED_RECEIPT_VERSION`, `RECEIPT_COLLISION`, and `DURABILITY_UNCONFIRMED`.

Every code is non-success and leaves source and target databases unchanged. Except for safely
removing an unpublished owned temporary file, failure MUST leave existing receipt-store entries
unchanged. No error handler may “helpfully” migrate, repair, adopt, overwrite, or broaden scope.

## Acceptance checklist

A conforming implementation must demonstrate, on Windows, macOS, Linux, and WSL where it claims
support:

- strict v1 round-trip and rejection of unknown, duplicate, malformed, or non-canonical fields;
- project-root containment, link/reparse defense, path-alias detection, and environment/tenant
  isolation;
- byte and lineage mismatch rejection, live-WAL snapshot correctness, sidecar-change rejection,
  and the one-million-row boundary at `1000000` accepted / `1000001` rejected;
- crash tests before write, during write, before publication, after publication, and before
  directory flush, with no partial final receipt accepted;
- identical retry success, conflicting concurrent publisher failure, and unchanged existing bytes;
- owner-only permission/ACL enforcement and log/privacy redaction; and
- exact-ID replay that rejects stale files and performs no implicit migration.

The store implementation now persists and reads receipts with the implemented guarantees listed
above, so the historical “no persisted adoption receipt” statement is superseded. All unchecked
acceptance items remain requirements, not inferred support. Until they pass and caller-chain
wiring is evidenced, the store has no proven cross-platform conformance and a receipt has no
proven replay authority.
