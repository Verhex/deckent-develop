# Runtime hygiene operator reference

Runtime hygiene reconciles a completed sprint's live artifacts with its canonical archive. It is an allow-list operation, not a recursive cleanup. **Preview is the CLI default. Apply is fail-closed. An unknown, live, foreign, malformed, protected, or unverifiable artifact is held and left in place.**

Use this reference to predict the disposition of every recognized family:

- **Keep**: leave the source unchanged.
- **Archive-copy**: publish and verify a copy; keep the source.
- **Retire**: remove an explicitly eligible source only after its destination independently matches its byte count and SHA-256 digest.
- **Hold**: make no source mutation and record why the operation cannot safely proceed.

There is no generic delete fallback.

## Lifecycle and authority gates

The canonical run-status reader owns the live/resumable/terminal/idle decision. A matching terminal receipt proves that a `COMPLETE` or `ABORTED` outcome was durably published. Archive manifests, family producers, and validated retention settings provide the remaining authority, in that order.

Apply is held when any of the following is true:

- canonical authority is active, resumable, `PAUSED`, or `ORPHANED`;
- the coordinator is alive or its ownership is unknown;
- a terminal lifecycle has no matching terminal receipt, or the receipt outcome disagrees with the lifecycle;
- the requested sprint differs from the non-idle authority-owned sprint;
- sprint or run ownership of an artifact is not exact;
- a task has `CLAIMED` or `EXECUTING` evidence;
- archive publication or verification fails; or
- the platform adapter cannot guarantee required containment, regular-file, exclusivity, hashing, durability, or atomicity semantics.

`IDLE` does not grant blanket ownership. A selected sprint must match `^sprint-\d+$`. Legacy job IDs such as `sprint-<epoch-ms>` are not converted to ordinal sprint ownership.

## Family disposition

### `.deckent/runtime/`

| Family | Normal terminal disposition | What remains protected |
|---|---|---|
| `run-status-read-model.json` | Keep. Only the run-status publisher may retire this mutable projection during owned lifecycle cleanup. | Generic hygiene never deletes it and creates no raw archive target. |
| `jobs/*.json` | Archive-then-retire only an inactive, terminal record selected by the resolved age/count/size bounds. Both `job-*` and legacy/current `sprint-*` namespaces are supported. | Keep every active/non-terminal record, unknown owner, unreadable record, unknown namespace, and the newest readable continuity anchor. |
| `decisions/` | Hold and keep. | No sprint classifier or target currently exists. |
| `evaluations/<sprint-id>/` | Reconcile exact-owned attempts into the canonical sprint manifest, verify it, then retire only the matching source bytes. | Keep the current window, malformed/foreign attempts, changed bytes, and byte-conflicting attempts at both locations. |
| `run-flow-store/*.events.jsonl` | Archive-then-retire a terminal journal projection, or a stale running projection with exact dead-liveness lineage. Canonical SQLite history remains. | Keep proposed, approved, fresh-running, resumable, malformed, ambiguous, or unproven-dead flows. |
| Recognized old start/bot/prompt-lint/resource logs and temporary residue | Empty expired files receive a retirement receipt; non-empty recognized logs are content-addressed before retirement; expired temporary files retire directly. | Keep current writers, fresh files, non-regular paths, databases, tokens, and unrecognized names. |
| `scheduler-shadow/<sprint-id>.jsonl` | Archive-copy to `scheduler/<sprint-id>.jsonl`; keep the live source. | A legacy `.deckent/archive/scheduler-shadow/` copy may retire only after verified publication. |
| `worker-heartbeat-authority/<attempt>/` | Archive-copy to `heartbeat/in-process/<attempt>/` only when `identity.json.identity.taskId` begins with the selected ordinal followed by `-`. | Keep the source. Missing or malformed identity holds that attempt directory. |
| Any other entry | Hold and keep. | Unknown owners are never deleted. |

`.deckent/nervous/` and `.deckent/autonomous/` are sibling authority families, not runtime children. Generic hygiene preserves their approvals, IPC, and history. Only the separate targeted expiry operation may prune an approval whose own deadline is proven expired.

### `.deckent/recently-works/`

| Family | Disposition |
|---|---|
| Verified `sprint-N-phase5*` canonical duplicate | Retire only when the canonical sprint manifest already proves the exact digest. |
| Exact `sprint-479-recovery-not-dispatched.json` | Reconcile into the canonical sprint archive, preserve every byte-distinct conflict variant, verify the manifest, then retire the live source. |
| Another sprint, other regular file, directory, nested content, symlink, or malformed entry | Hold and keep. No prefix-wide or directory-wide retirement exists. |

Only the two named compatibility families above are retirement-capable. Every other recent-work item is preserved.

### Related families and preserved authorities

| Family or authority | Operator-visible rule |
|---|---|
| `.tasks/` exact sprint artifacts | Archive exact owned artifacts under `tasks/` before retirement. Non-terminal artifacts go to `tasks/preserved/` with a preservation marker. Hidden or unclassified residue stays in place unless the exact-sprint plan classifies it. |
| `.tasks/archive/` and legacy sprint-task roots | Consolidate exact owned artifacts into canonical `tasks/`. Retire a legacy source only after digest verification. Compatibility cleanup never retention-deletes immutable evidence. |
| `.locks/` | Execution-authority locks are never candidates. Other locks require selected-run ownership and quiescence; otherwise hold. |
| `.brain/memory.db`, databases, journals, WAL, and SHM files | Never delete, move, truncate, or copy as unclassified residue. Memory decay uses the database API; a manifest may contain only references and digests. |
| Credentials, secret stores, tokens, keys, certificates, and auth files | Always hold and preserve. Receipts never persist their values or contents. |
| Checkpoints, supervisor logs, archived metrics, directives, sprint docs, and audits | Use only the archive collector's exact source/target mappings. Archive-copy live sources; retire only sources explicitly classified as legacy and verified. |
| Unknown family anywhere | Hold, report, and preserve. |

Immutable receipts, jobs, evaluations, manifests, conflicts, audits, and preserved task evidence are retained. Mutable projections may retire only through their owner.

## Defaults and retention order

CLI `cleanup --history` is a **preview by default**. Apply is never inferred from omission of a flag. Finalizer-triggered runtime hygiene is **off by default**; when enabled, it runs only after the terminal receipt is published and the canonical archive verifies successfully.

Recognized configuration defaults are:

| Setting | Safe default | Effect |
|---|---:|---|
| `runtime_artifact_retention.enabled` | `false` | Enables policy evaluation; it does not itself authorize finalizer apply. |
| `runtime_artifact_retention.apply_on_finalize` | `false` | Requires a second explicit opt-in before terminal finalization may apply hygiene. |
| `runtime_artifact_retention.archive_path` | `.deckent/archive/runtime-artifacts/` | Project-relative base for maintenance objects and receipts. |
| `families.runtime.max_age_days / max_count / max_size_mb` | `30 / 1000 / 1024` | Bounds inactive terminal runtime records after stronger authority gates. |
| `families.recent.max_age_days / max_count / max_size_mb` | `14 / 500 / 512` | Resolved recent-family policy; it never broadens the two named compatibility families. |

Prompt-archive retention applies only to classified prompt archives, never arbitrary `.tasks` files. Invalid, absent, or unreadable retention configuration uses validated safe defaults for recognized dimensions and never enlarges the deletion set.

Retention filters run in this order: authority/liveness, terminal proof, family classification, exact ownership, evidence class, count, size, memory age/decay, prompt-history policy, artifact kind, conflict state, then platform capability. A later filter cannot override an earlier hold. Explicitly classified `-seq` and `-checkpoint-seq` counters may be disposable; forensic artifacts move to their declared audit targets; other kinds archive or hold. Byte-distinct conflicts are all retained.

## Preview and apply

### Preview (dry-run)

Run history cleanup without opting into apply:

```text
deckent cleanup --history
```

Preview performs the same authority, ownership, classification, target, conflict, and retention planning as apply but makes no filesystem or runtime mutation. It does not create directories; copy, link, rename, unlink, or truncate; kill sessions; change configuration or timestamps; update memory; or publish read models.

The path-free machine projection reports one deterministic digest plus per-family inventory and candidate counts/bytes. Detailed family plans remain internal mutation authority and are bound into that digest; the public JSON projection deliberately does not disclose artifact paths or secrets.

### Apply

Use the CLI's apply option only with the freshly reproduced exact plan digest requested by that CLI surface. Apply re-reads authority immediately before mutation; a stale or different digest is rejected. It then:

1. validates sprint identity and ownership;
2. requires quiescence and a matching terminal receipt;
3. classifies observed entries and emits holds;
4. publishes exclusive, digest-verified archive copies;
5. publishes and verifies the manifest and terminal outcome;
6. retires only verified, explicitly eligible legacy sources;
7. applies retention to the remaining allow-listed candidates;
8. asks owning subsystems to retire owned mutable projections;
9. publishes the canonical idle read model; and
10. emits an apply receipt.

Any failure stops later destructive actions. Successfully verified partial publications remain immutable evidence for an idempotent retry; recovery never rolls them back by deleting them.

## Archive, receipts, and conflicts

The canonical root is `<archive-base>/<sprint-id>/`. `manifest.json` accounts for canonical artifacts under `tasks/`, `evaluations/`, `scheduler/`, `heartbeat/`, `metrics/`, `docs/`, and `audits/`, plus run evidence at the root. Absolute, empty, and traversal targets are rejected.

Publication never clobbers:

- identical size and SHA-256 at the target is recorded as `deduplicated`;
- different bytes publish under `conflicts/<basename>.<sha256-prefix>`;
- different bytes already occupying that conflict path hold apply;
- retirement requires an independent source/destination identity match; and
- a failure prevents manifest publication and prevents the source being treated as settled.

Preview emits no durable receipt and performs no write. Apply publishes one immutable first-writer-wins receipt keyed by the exact plan digest. It contains bounded per-family counters and outcomes, including attempted/retired bytes and typed failures; family-specific archive manifests and receipts retain artifact-level source/digest lineage. Fresh-process replay validates and returns the existing receipt without rebuilding a plan from the already-mutated tree.

## Recovery runbook

1. **Stop and inspect the receipt.** Do not manually delete held sources or edit the manifest.
2. **Restore quiescence.** Resolve active/resumable state, coordinator uncertainty, executing tasks, or receipt/lifecycle disagreement through their owning subsystem.
3. **Correct classification or configuration.** Fix malformed identities or an out-of-project archive path; do not rename foreign evidence to make it appear owned.
4. **Preserve conflicts.** Investigate every byte-distinct variant. Never choose a winner by applying a retention cap.
5. **Re-run preview.** Confirm the plan now classifies every observed top-level entry and contains no unclassified deletion candidate.
6. **Apply with the new exact plan digest.** Retries reconcile identical verified bytes as deduplicated and continue safely.
7. **Verify the receipt and manifest.** Missing, mismatched, untracked, or invalid-digest artifacts mean recovery remains held.

## Windows, macOS, and Linux semantics

The safety outcomes are the same on Windows, macOS, and Linux; the implementation primitive may differ. Every adapter must provide project/archive containment, `lstat`-equivalent refusal of symlinks and non-regular sources, exclusive non-overwriting publication, streaming SHA-256 and byte verification, atomic same-directory replacement, file and parent-directory durability before retirement, race-safe deduplication, conflict preservation, and idempotent interruption recovery.

Case folding, path separators, reserved names, and Unicode normalization must not turn distinct logical targets into a clobber. Cross-device movement must not degrade to unchecked copy-then-delete. Hard links, reflinks, and renames are optional implementation details: the adapter uses a verified copy instead, or holds with an explicit unsupported-capability error. Therefore platform support means equivalent safety semantics, not that every filesystem exposes the same syscall.

## Operator acceptance check

An operation is safe to apply only when every observed top-level runtime and recent-work entry maps to one documented family, owner, and disposition, and the receipt contains no unclassified deletion candidate. If an unknown, credential, database, foreign-run, live-authority, malformed, unverified, or unresolved-conflict artifact could reach deletion, do not apply.
