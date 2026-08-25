# Runtime hygiene policy contract

**Contract date:** 2026-08-23
**Audience:** Cleanup, archive, retention, and platform-adapter implementers
**Authority inputs:** `src/core/constants.ts`, `src/core/sprint-archive.ts`, `src/cli/commands/cleanup.ts`, and the sprint identity inventory

## Safety invariant

Runtime hygiene is an allow-list operation. A path is eligible for mutation only when its family, owner, sprint or run identity, lifecycle state, retention rule, and destination are all known.

The default disposition is **HOLD and preserve in place**. Unknown files, unknown directories, malformed identities, credentials, secrets, keys, tokens, and database files never fall through to archive, move, truncate, or deletion. Classification failure is a reportable hold, not permission to infer ownership.

A cleanup implementation MUST NOT recursively sweep `.deckent/runtime/` or `.deckent/recently-works/`. It may act only on the exact families and predicates in this contract.

## Authorities and precedence

1. **Canonical run authority:** `readCanonicalRunStatus()` decides whether a run is live, resumable, terminal, or idle and identifies its sprint.
2. **Terminal publication authority:** a matching terminal receipt proves a `COMPLETE` or `ABORTED` outcome was durably published.
3. **Family owner:** the producer named below defines whether an artifact is a mutable projection, immutable evidence, or foreign state.
4. **Archive authority:** the sprint archive manifest records published bytes, SHA-256 digests, sources, family counts, conflicts, terminal outcome, and memory references.
5. **Retention authority:** validated dimensions decide when already-classified material may be retained, archived, or retired. Retention never overrides a live-authority hold or fail-closed family rule.

A requested `--sprint` must match `^sprint-\d+$`. While canonical authority is not `IDLE`, it must also match the authority-owned sprint. Job and run identifiers, including legacy `sprint-<epoch-ms>` job history, are not converted to ordinal sprint ownership.

## Live-authority guard

No apply operation may start when any of these conditions holds:

- canonical authority reports `active`;
- the coordinator is `alive` or its ownership is `unknown`;
- the run is resumable, `PAUSED`, or `ORPHANED`;
- a terminal lifecycle lacks a terminal receipt;
- receipt outcome differs from canonical lifecycle;
- requested sprint differs from a non-idle authority-owned sprint;
- an artifact cannot be proven to belong to the selected sprint or run; or
- archive publication or verification has any failure.

`IDLE` is not blanket ownership. Without a selected sprint, family-specific exact ownership still must be established. Foreign-run artifacts remain untouched. `CLAIMED` or `EXECUTING` task evidence is an additional hold for destructive runtime hygiene; warning and releasing locks is not sufficient proof of quiescence under this contract.

## Family disposition matrix

“Preserve” means no source mutation. “Archive-copy” means publish verified bytes while leaving the live source. “Retire” means remove a source only after the destination independently matches its byte count and SHA-256 digest.

### `.deckent/runtime/`

| Observed top-level family | Owner and authority | Disposition after guards | Canonical archive target |
|---|---|---|---|
| `run-status-read-model.json` | Run-status publisher; canonical run authority | Mutable projection. Preserve while live or held. Retire only through the run-status publisher after owned lifecycle cleanup; never generic-delete. | No raw target; terminal receipt and manifest carry terminal truth. |
| `jobs/` | Detached job runner; job identity plus independent ownership evidence in each record | Archive-then-retire only inactive terminal records selected by resolved age/count/size bounds. Preserve the newest readable continuity anchor and every live/unknown owner. Both current `job-*` and legacy/current `sprint-*` namespaces remain readable. | Content-addressed maintenance archive |
| `decisions/` | Evaluation/decision audit producer | Preserve in place. The current archive collector has no sprint-ownership rule for this family, so hygiene must hold rather than infer it. | None until an explicit classifier and target exist. |
| `evaluations/` | Evaluation audit trail; exact child `<sprint-id>/` | Reconcile exact-owned attempts into the canonical sprint manifest and retire only verified matching source bytes. Current, malformed, foreign, changed, or conflicting attempts remain. | `<archive-base>/<sprint-id>/evaluations/**` |
| `run-flow-store/*.events.jsonl` | RunFlow SQLite authority plus compatibility journal projection | Archive-then-retire terminal projections or stale-running projections with exact dead-liveness lineage. Canonical SQLite history survives. | Content-addressed maintenance archive |
| Recognized runtime logs/residue | Log producer plus age and current-writer evidence | Archive non-empty recognized expired logs before retirement; retire proven-empty or temporary residue with typed receipts. Preserve current writers, fresh, non-regular, unknown, database, and token paths. | Content-addressed maintenance archive plus retirement receipt |
| `scheduler-shadow/` | Scheduler shadow producer; exact `<sprint-id>.jsonl` | Archive-copy the exact selected file; preserve live source. A legacy copy under `.deckent/archive/scheduler-shadow/` may retire only after verified publication. | `<archive-base>/<sprint-id>/scheduler/<sprint-id>.jsonl` |
| `worker-heartbeat-authority/` | In-process heartbeat producer; `identity.json.identity.taskId` | Archive-copy only attempt directories whose parsed task ID starts with the selected ordinal plus `-`. Preserve source. Missing or malformed identity holds the directory. | `<archive-base>/<sprint-id>/heartbeat/in-process/<attempt>/**` |
| Any other runtime entry | Unknown owner | **HOLD; preserve in place. Never delete.** | None |

The constants also name `.deckent/nervous/` and `.deckent/autonomous/` as sibling purpose families, not runtime children. They own pending approvals, IPC, and history and are outside this cleanup allow-list. The targeted expiry operation may prune only approvals whose own deadline is proven expired; generic hygiene preserves all other nervous and autonomous artifacts.

### `.deckent/recently-works/`

This directory is recent terminal/run evidence. Reconciliation never marks sources from this root as legacy-retirable.

| Observed top-level name family | Owner and authority | Disposition after guards | Canonical archive target |
|---|---|---|---|
| Verified `sprint-N-phase5*` canonical duplicate | Exact selected sprint plus verified canonical manifest digest | Duplicate-retire only after manifest proof. | Existing canonical sprint artifact |
| Exact `sprint-479-recovery-not-dispatched.json` | Named compatibility producer | Reconcile, preserve every byte-distinct conflict, verify the manifest, then retire the live source. | `<archive-base>/sprint-479/<same-name or conflict variant>` |
| File for another sprint, any other file, directory, nested content, symlink, or malformed entry | Foreign or unknown owner | **HOLD; preserve in place. Never delete.** | None |

A prefix match grants archive-copy only; it never grants retirement of recent evidence.

### Related live and legacy families

| Family | Explicit disposition |
|---|---|
| `.tasks/` exact sprint task artifacts | Classify and prove exact sprint ownership. Archive to `tasks/` before retirement. Non-terminal artifacts go to `tasks/preserved/` with a preservation marker. Hidden or unclassified residue is preserved unless an explicit exact-sprint plan classifies it. |
| `.tasks/archive/` and legacy sprint-task archive roots | Consolidate only exact owned artifacts into canonical `tasks/`; retire a legacy source only after digest verification. Immutable evidence is never retention-deleted by compatibility cleanup. |
| `.locks/` | Execution-authority lock artifacts are never cleanup candidates. Other locks require selected-run ownership and quiescence; otherwise hold. |
| `.brain/memory.db` and every `*.db`, `*.sqlite`, `*.sqlite3`, journal, WAL, or SHM file | Database authority. Read-only references may enter a manifest. **Never delete, move, truncate, or copy as an unclassified artifact.** Memory decay must use the database API and its own policy. |
| Global or project credentials, secret stores, tokens, keys, certificates, and auth files | Credential owner only. **Never classify as runtime residue; always preserve and hold.** |
| Sprint checkpoint, supervisor log, archived metrics, directives, sprint docs, and audits | Use only exact source/target mappings implemented by the archive collector. Live sources are archive-copy; only explicitly flagged legacy sources are eligible for verified retirement. |
| Unknown family anywhere | **HOLD and report. No deletion fallthrough.** |

## Retention dimensions

Retention decisions are ordered filters, not a single age check:

1. **Authority/liveness:** active, owned, resumable, paused, orphaned, or uncertain material is retained regardless of every other dimension.
2. **Terminal proof:** retirement requires a matching terminal receipt and valid selected sprint.
3. **Family/classification:** only allow-listed families proceed; credentials, databases, and unknowns are excluded from generic deletion.
4. **Ownership:** exact sprint/run identity is required. Prefixes may select archive-copy candidates but do not authorize deletion.
5. **Evidence class:** immutable receipts, jobs, evaluations, manifests, conflicts, audit records, and preserved task evidence are retained. Mutable projections may retire only through their owner.
6. **Count:** `keep_last_n` may bound eligible canonical sprint files after all preceding gates.
7. **Size:** `size_cap` may select additional eligible canonical sprint files, oldest eligible first; it cannot evict protected evidence.
8. **Age/decay:** `decay_after_sprints` and memory budget apply only through memory-decay authority, never through database-file removal.
9. **Prompt history:** `prompt_archive_retention` applies to classified prompt archives, not arbitrary `.tasks` files.
10. **Artifact kind:** explicitly classified `-seq` and `-checkpoint-seq` counters may delete; forensic files move to their declared audit target; every other kind archives or holds.
11. **Conflict state:** every byte-distinct variant is retained. A cap cannot resolve a conflict by choosing a winner.
12. **Platform capability:** if safe containment, regular-file checks, exclusive publication, hashing, durable sync, or atomic replacement cannot be guaranteed, apply holds.

Invalid, absent, or unreadable retention configuration uses validated safe defaults for recognized dimensions and never expands the deletion set. A configured archive path must resolve inside the project; otherwise the fallback is `.deckent/archive/sprints/`.

## Archive and conflict semantics

The canonical target is `<archive-base>/<sprint-id>/`, with `manifest.json` and the `tasks/`, `evaluations/`, `scheduler/`, `heartbeat/`, `metrics/`, `docs/`, and `audits/` families. Run evidence may live at the sprint archive root. Targets must be relative descendants of that root; absolute, empty, and traversal targets are rejected.

Publication is non-clobbering:

- identical byte count and SHA-256 at the requested target is `deduplicated`;
- different bytes for the same logical target publish to `conflicts/<basename>.<sha256-prefix>`;
- a different payload already occupying that conflict path is a hard collision and holds apply;
- source retirement occurs only after independently matching destination and source identities; and
- any failure prevents manifest publication and prevents cleanup from treating the source as settled.

The manifest is atomically written only after a failure-free apply. It includes all canonical artifacts, not only new candidates. Verification fails for a missing artifact, digest mismatch, untracked artifact, or invalid manifest digest. Memory entries are references and digests, not archived database bytes.

## Dry-run and apply behavior

### Dry-run

Dry-run executes the same validation, authority, ownership, family classification, target resolution, conflict planning, and retention selection as apply. It must not create directories, copy, link, rename, unlink, truncate, kill sessions, modify configuration, update memory, publish read models, or alter timestamps.

Its public projection is path-free and lists a deterministic plan digest plus per-family inventory/candidate counts and bytes. The detailed family plans, digests, holds, targets, conflicts, and retention inputs remain internal mutation authority bound into that digest. A public projection must never disclose credentials, host-absolute paths, or artifact contents.

### Apply

Apply re-reads authority and revalidates immediately before mutation, then:

1. validates sprint identity and canonical ownership;
2. requires quiescence and a matching terminal receipt;
3. classifies all observed entries and emits holds for unknown/protected families;
4. publishes archive copies with exclusive, digest-verified semantics;
5. publishes and verifies the manifest and terminal outcome;
6. retires only explicitly eligible, verified legacy sources;
7. applies retention only to remaining allow-listed candidates;
8. retires owned mutable projections through their subsystem;
9. publishes the canonical idle read model; and
10. emits an apply receipt.

A failure stops subsequent destructive actions. Partial verified publications remain immutable evidence for idempotent reconciliation; they are not rolled back by deletion.

## Receipts

Preview produces no durable receipt. Apply publishes one immutable first-writer-wins machine-readable receipt keyed by the exact plan digest. It records:

- schema version, operation ID, mode, timestamps, and project-relative root identity;
- requested and resolved sprint, lifecycle/coordinator state, receipt identity, and terminal outcome;
- normalized retention inputs and archive base;
- bounded per-family inventory/candidate counters;
- per-family attempted, retired, retired-byte, and typed-failure outcomes; and
- complete or partial status.

Family-specific maintenance manifests, sprint manifests, and retirement receipts retain artifact-level source/digest lineage. Fresh-process replay validates the existing receipt without rebuilding a plan from the already-mutated live tree. Receipts are redacted: no credential values, contents, environment secrets, or auth headers.

## Platform adapter guarantees

All filesystem adapters, including non-POSIX implementations, provide equivalent semantics:

- lexical and resolved-path containment beneath project and selected archive roots;
- `lstat`-equivalent refusal of non-regular sources and no symlink following;
- exclusive destination creation without overwrite;
- streaming SHA-256 and byte-count verification before publication;
- atomic same-directory replacement for manifests and receipts;
- file durability followed by parent-directory durability before source retirement;
- race-safe success when another writer wins with identical bytes;
- hash-addressed preservation when another writer publishes different bytes;
- idempotent retry after interruption;
- explicit errors for unsupported durability or atomicity; and
- redacted error reporting.

Hard links, reflinks, and rename primitives are implementation details. If they cannot meet these outcomes, the adapter falls back to verified copy or returns a hold. Cross-device moves never degrade into copy-then-delete without the same verification and durability barrier. Case folding, separators, reserved names, and Unicode normalization must not allow logical targets to clobber each other.

## Acceptance rules

The policy is GO only when an inventory maps every observed top-level runtime and recent-work entry to exactly one row above, with one owner and disposition, and the receipt has no unclassified deletion candidate.

It is NO_GO when any unknown, credential, database, foreign-run, live-authority, malformed-identity, unverified archive, or unresolved conflict artifact can reach deletion.
