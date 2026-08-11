# Canonical Core-Memory Authority Contract

- **Date:** 2026-08-11
- **Status:** proposal only; no implementation or configuration change is authorized by this document
- **Audience:** owner, architecture reviewers, implementers, and verifiers of rows 190 and 230
- **Canonical authority:** `.deckent/docs/core-memory/`

## Executive contract

Deckent has exactly one dogfood core-memory authority: the repository-local
`.deckent/docs/core-memory/` directory, including its `MEMORY.md` index and referenced topic files.
Claude, Codex, Gemini, and any later host surface receive projections only. A projection never wins a
conflict, never writes back, and never changes authority because its timestamp is newer.

The current `scripts/sync-core-memory.mjs` establishes that direction, rejects backup, restore, and
bidirectional modes, and copies authority content to one configured absolute target. It does **not**
yet satisfy the complete authority contract. In particular, it has no revision/hash conflict journal,
deletes every projection-side Markdown file absent from authority, and has no explicit
Claude/Codex/Gemini surface adapters or parity proof.

This document reconciles that code truth with the earlier rev-2 design and rev-3 analysis. Those prior
documents are no longer present in the 2026-08-11 worktree; the exact historical artifacts reviewed
for this contract were:

- `docs/superpowers/specs/2026-07-30-provider-agnostic-memory-projection-design.md`
- `docs/alperen-analysis/2026-07-30-memory-projection-rev3-yuzey-analizi.md`

They are provenance, not current runtime evidence. The current script is runtime evidence. Where the
two disagree, this contract reports the disagreement and leaves the decision with the owner.

## Scope and non-goals

This contract covers dogfood core-memory projection and its Claude, Codex, and Gemini consumers. It
does not merge or replace product-user memory in `.brain/memory.db`. It proposes no production edits,
config changes, hook changes, or migration. Cursor and Copilot remain part of the broader rev-2 design,
but are outside row 190's first-slice parity gate; the registry must remain extensible to them without
giving them weaker safety semantics.

## Invariants

1. **Single authority.** Only `.deckent/docs/core-memory/` may originate canonical content.
2. **One-way flow.** Projection content never writes back. Timestamp-based “newer wins,” restore, and
   bidirectional modes are forbidden.
3. **Content-addressed decisions.** Every planned write or deletion is derived from authority hashes,
   the prior ownership manifest, and the journal head—not timestamps.
4. **No silent delete.** No file is deleted unless the previous valid manifest proves projector
   ownership and the deletion is journaled before commit. Foreign or ambiguous files are preserved.
5. **Surface parity.** Claude, Codex, and Gemini consume the same canonical revision and semantic
   index, through surface-specific adapters with equivalent drift and failure evidence.
6. **Fail closed.** Missing authority, missing `MEMORY.md`, invalid journal/manifest, path escape,
   lock ambiguity, unsupported platform behavior, or partial multi-file commit produces a typed hold.
7. **Atomic and idempotent.** A completed projection exposes one revision; a second run with unchanged
   inputs performs zero content writes.
8. **Native content boundaries.** Projector-owned mirrors are distinct from host-owned writable memory.
   Any exception requires an explicit owner decision and cannot weaken ownership-based deletion.

## Today's implementation truth

`scripts/sync-core-memory.mjs` currently:

- resolves authority from `DECKENT_CORE_MEMORY_PATH` or the repo-local default;
- accepts one target from `--target`, `DECKENT_MEMORY_PROJECTION_PATH`, or the compatibility
  `DECKENT_USER_MEMORY_PATH` input;
- requires an absolute target different from the authority directory;
- rejects `--backup`, `--restore`, and `--bidirectional`;
- requires authority `MEMORY.md`, sorts the authority and target Markdown filenames, compares content,
  and supports write, `--dry-run`, and `--check` behavior;
- copies divergent authority files and unlinks target Markdown files whose names are absent from
  authority; and
- reports aggregate copied, removed, unchanged, and drifted counts.

It uses direct `writeFileSync` and `unlinkSync`. It has no lock, temp-file rename, transaction marker,
ownership manifest, digest journal, quarantine, adapter registry, structured per-surface receipt, or
multi-surface convergence operation. Therefore “the script completed” proves only a single-target
copy attempt; it does not prove safe deletion, revision continuity, or provider parity.

## Revision/hash conflict journal

### What exists

Content equality is checked in memory, and `--check` returns a non-zero status when target content
differs. The console identifies files that would be projected or removed. No durable revision,
authority digest, per-file digest, previous projection digest, operation ID, or conflict record exists.
A projection edit is therefore overwritten on the next write without durable evidence of the drift.

### What the prior design demanded

The rev-2 design required an ownership manifest containing `schemaVersion`, `authorityDigest`, and
hashes for owned files, plus atomic writes, a project-scoped lock, structured results, and check-mode
drift evidence. Row 230 additionally calls for a revision/hash conflict journal. The rev-3 analysis
retained the manifest, atomicity, locking, and one-way authority decisions while changing how host
instruction files should be adapted.

### Gap

A manifest records the last projected snapshot but is not, by itself, an append-only conflict journal.
The current script has neither. It cannot distinguish an interrupted projection from a locally edited
projection, prove which authority revision was applied, or retain evidence after overwriting drift.

### Proposed journal contract

Each projection transaction receives an opaque operation ID and immutable authority revision computed
from a versioned, path-normalized list of `{relativePath, sha256}` entries. Before mutation, the service
records a prepared journal entry containing:

- journal schema version and operation ID;
- target identity and assistant-surface ID, without secrets or home-directory content;
- prior manifest digest and proposed authority revision;
- for every planned path: prior observed digest, authority digest or tombstone, ownership disposition,
  and planned operation;
- typed conflicts, preservation/quarantine decisions, and initiating trigger; and
- transaction state: `prepared`, `committed`, `held`, or `recovered`.

The entry becomes `committed` only after every staged file and the new manifest are durably promoted.
Recovery treats a `prepared` entry as ambiguous and holds or rolls forward from staged content; it never
infers success from timestamps. Journal retention, compaction, and redaction are policy-controlled, but
compaction must preserve the latest committed revision and every unresolved conflict.

### Admission-sized implementation slices and proof obligations

1. **J1 — Canonical digest model and journal schema.** Add pure path normalization, digest, schema
   validation, and state-transition primitives without wiring writes.
   **Proof:** identical trees produce identical revisions across macOS, Linux, Windows native, and WSL;
   path order and separator variants do not change the digest; malformed entries fail typed.
2. **J2 — Read-only conflict planning.** Compute the operation plan from authority, target, manifest,
   and journal head for `--check`/dry-run only.
   **Proof:** clean, authority-changed, locally-edited, foreign, missing, corrupt-manifest, and interrupted
   cases yield deterministic typed plans and do not write.
3. **J3 — Transactional journal and atomic promotion.** Persist `prepared`, stage content, atomically
   promote, then persist `committed`, under a project/target lock.
   **Proof:** injected failure at every boundary leaves either the old committed revision or a typed
   recoverable prepared transaction; concurrent invocations cannot interleave generations.
4. **J4 — Recovery and bounded retention.** Recover prepared operations and compact settled history.
   **Proof:** crash fixtures converge without target-to-authority writes, unresolved conflicts survive
   compaction, and retention remains bounded at million-project scale.

### Owner decision points

- Choose journal custody: projector-owned target-local metadata, repo-local operational state, or both
  with one declared authority. Target-local state improves portability; repo-local state improves audit
  centrality. Dual copies require a declared reconciliation rule.
- Set retention and redaction policy, including whether target paths are stored as opaque IDs or
  normalized paths.
- Decide whether any projection-side edit is always overwritten after journaling or requires explicit
  acknowledgement. It can never become canonical automatically.
- Approve hash algorithm agility and schema migration authority; SHA-256 is the initial interoperable
  digest, not an eternal hardcoded policy.

## No-silent-delete guarantee

### What exists

The current script deletes every `*.md` in the projection directory whose filename is absent from the
authority set. It does not prove that the projector created that file. It logs immediately before the
unlink, but the log is not an ownership proof, quarantine, or durable deletion receipt.

### What the prior design demanded

The rev-2 design made the previous ownership manifest the only deletion authority: only previously
manifest-owned files may be removed; foreign files are preserved and reported. It also required atomic
writes, symlink-escape rejection, explicit deprovisioning, and preservation of native writable memory.
The rev-3 analysis retained manifest ownership and proposed additive pointers for host instruction files.
It also identified an unresolved choice for projecting into Claude's native writable memory directory.

### Gap

Current stale cleanup can silently destroy a host- or user-created Markdown file. There is no safe
bootstrap rule for an existing target, no quarantine period, no tombstone, no recovery receipt, and no
manifest-authenticated deprovision path. Logging a deletion does not satisfy the guarantee.

### Proposed deletion contract

- A file absent from a valid previous manifest is foreign and must be preserved.
- A missing, corrupt, future-version, or digest-divergent manifest removes deletion authority and yields
  a typed hold for destructive operations.
- Initial adoption may claim ownership only for files whose bytes match authority and whose target
  passes path and native-memory policy. Ambiguous files remain foreign.
- A stale owned file first receives a journaled tombstone and is moved atomically to a projector-owned
  quarantine on the same filesystem. Permanent removal occurs only after the configured retention and
  a later successful committed projection. If same-filesystem quarantine is unavailable, deletion holds.
- Deprovision removes only manifest-owned artifacts. Additive host pointers and all owner-authored
  instruction content remain unless a separately approved contract authorizes exact-line removal.
- Symlinks, junctions, case-fold collisions, Unicode-normalization collisions, and paths escaping the
  declared target fail closed before any mutation.

### Admission-sized implementation slices and proof obligations

1. **D1 — Ownership manifest reader and bootstrap classifier.** Read and validate manifests; classify
   owned, adoptable, foreign, ambiguous, and unsafe paths.
   **Proof:** tmpdir matrices cover empty/existing targets, matching and divergent files, corrupt/future
   manifests, case sensitivity, symlinks, junction adapters, and Unicode collisions with zero deletion.
2. **D2 — Preservation-first planner.** Replace broad stale enumeration in the new service with
   manifest-scoped tombstones and `foreignFilesPreserved` evidence; keep the compatibility script
   behavior unchanged until migration admission.
   **Proof:** arbitrary foreign Markdown survives; only prior-owned stale files become candidates; check
   mode distinguishes drift from operational error.
3. **D3 — Quarantine and recovery.** Add same-filesystem quarantine, retention, restore, and journal
   linkage. “Restore” here restores a quarantined projection artifact to the projection only; it never
   means projection-to-authority restore, which remains forbidden.
   **Proof:** crash and permission fault injection never loses the only recoverable bytes; expired owned
   artifacts are removed only after a later clean commit.
4. **D4 — Explicit deprovision.** Add a separate, owner-admitted deprovision command and receipt.
   **Proof:** foreign files and owner-authored instruction text remain byte-identical; repeated
   deprovision is idempotent; partial failure is recoverable and visible.

### Owner decision points

- Choose quarantine retention by tenant/project policy and define storage-pressure behavior. Pressure
  may hold projection; it must not bypass quarantine silently.
- Resolve Claude native-memory policy: keep a default HOLD with an explicit acknowledged exception, or
  move projections to an isolated projector-owned directory. The live overwrite hazard argues against
  implicit use of a host-writable directory.
- Approve the bootstrap ownership rule and whether matching pre-existing files may be adopted
  automatically or only with explicit operator acknowledgement.
- Decide whether deprovision removes projector-created additive pointers. The rev-3 recommendation is
  to preserve them under the never-overwrite adapter contract.

## Claude, Codex, and Gemini projection parity

### What exists

The current script is surface-agnostic only in the narrow sense that it accepts one absolute directory.
It does not know which host consumes the target, update or preserve host instruction adapters, run all
three projections as a generation, or emit per-surface state. Parity therefore is not implemented.

Known host contracts from the prior evidence are:

| Surface | Existing host surface | Current core-memory behavior | Current parity verdict |
|---|---|---|---|
| Claude | `CLAUDE.md`; historically a Stop hook called the single-target script against native auto-memory | A configured hook can overwrite one target from authority; no journal or ownership boundary | Partial transport, unsafe and not parity proof |
| Codex | `AGENTS.md` and `.codex/rules/`; no guaranteed `@file` expansion | No current adapter-owned multi-surface projection in the script | Missing |
| Gemini | `GEMINI.md` and `.gemini/rules/` | No current adapter-owned multi-surface projection in the script | Missing |

### What the prior design demanded

Rev 2 specified an assistant-surface registry distinct from execution providers, projector-owned mirror
directories, native instruction adaptation, a shared workspace-sync service, CLI/MCP parity, finalizer
wiring, and live host proofs. Rev 3 found that volatile managed blocks in `CLAUDE.md`, `AGENTS.md`, and
`GEMINI.md` conflict with the pure-adapter rule. It recommended stable, additive pointers based on the
existing never-overwrite pattern, while retaining a generated Cursor rule as a separate future surface.

### Gap

There is no canonical surface registry, resolved three-surface generation, additive pointer contract,
per-surface journal/manifest, shared service, or parity receipt. A successful Claude projection says
nothing about Codex or Gemini. Conversely, requiring byte-identical instruction files would be wrong:
parity means the same authority revision and semantics through each native contract, not identical host
adapter bytes.

### Proposed parity contract

One resolved `runWorkspaceSync(scope: 'memory')` generation targets the enabled assistant surfaces.
Every target result binds `surfaceId`, canonical authority revision, mirror digest, adapter digest,
manifest digest, and state. The overall generation is `converged` only when every required surface is
at the same canonical revision. A failed or unavailable surface is reported as typed `held` or
`unavailable`; successful siblings are not misrepresented as global parity.

| Surface | Proposed projector-owned mirror | Adapter obligation | Host proof obligation |
|---|---|---|---|
| Claude | `.claude/memory/` by default | Add one stable pointer without rewriting owner content; native auto-memory requires an owner-approved exception | Fresh session resolves the canonical index and a sampled topic at the receipt revision |
| Codex | `.codex/memory/` | Preserve `AGENTS.md`; add a stable discoverability pointer. Because import expansion is not guaranteed, the adapter text must instruct direct file reading within its instruction budget | Fresh Codex session demonstrates the index is discoverable and reads the sampled topic |
| Gemini | `.gemini/memory/` | Add one stable native pointer without rewriting owner content | `GEMINI.md`/host memory inspection resolves the same revision and sampled topic |

The registry is a host-surface registry, not a model/provider-routing registry. Paths are resolved by
platform adapters and project/tenant policy; no provider HOME path is hardcoded into the product.

### Admission-sized implementation slices and proof obligations

1. **P1 — Registry and typed result contracts.** Introduce Claude/Codex/Gemini capabilities, path
   resolution interfaces, and generation/result types, default-off.
   **Proof:** registry completeness is exhaustive at compile time; platform fixtures resolve contained
   paths for macOS, Linux, Windows native, and WSL; unsupported hosts fail typed.
2. **P2 — Mirror projector.** Implement manifest/journal-backed mirror projection for one explicit
   test target, then parameterize through the registry.
   **Proof:** all three adapters pass the same conformance suite; second run is zero-write; target-to-
   authority mutation is impossible through the public API.
3. **P3 — Pure additive instruction adapters.** Reuse the existing additive/never-overwrite pattern
   for stable pointers; do not add volatile managed blocks to host instruction files.
   **Proof:** arbitrary owner content remains byte-identical; missing, duplicate, malformed, and
   pre-existing pointer cases are deterministic; Codex instruction budget is enforced.
4. **P4 — Shared service and trigger parity.** Make CLI, MCP, finalizer, and compatibility hook thin
   consumers of one service and one resolved config.
   **Proof:** equivalent inputs yield equivalent structured receipts; check/dry-run/write modes share a
   plan; concurrent triggers serialize; no trigger reconstructs surface policy independently.
5. **P5 — Dogfood migration and live proof.** After owner approval, migrate the existing single-target
   hook and enable project config behind the safety gates.
   **Proof:** real-binary run projects all required surfaces, rerun writes nothing, check is clean, and
   fresh Claude/Codex/Gemini sessions each demonstrate the same journaled revision. An unreachable host
   remains typed `unavailable/HOLD`, never silently waived.

### Owner decision points

- Approve rev-3's additive-pointer path or initiate an ADR amendment for volatile managed blocks. This
  contract recommends additive pointers because they preserve the current pure-adapter boundary.
- Decide whether parity admission is all-required atomic visibility or allows per-surface commit with an
  overall non-converged receipt. The latter is operationally resilient but must never be labeled parity.
- Approve the default enabled surface set and tenant overrides through effective config. No surface
  should become default-on solely because it exists in the registry.
- Approve Claude native-memory custody policy before migrating the Stop hook.
- Decide whether Cursor and Copilot enter the same rollout or a later admission. Their eventual safety
  contract must be no weaker than Claude/Codex/Gemini.

## Proposed delivery DAG

The safe order is `J1 → J2 → D1 → D2 → J3 → D3`, while `P1` may proceed after `J1`. `P2` depends on
`D2 + J3`; `P3` depends on the owner adapter decision; `P4` depends on `P2 + P3`; `D4` depends on
`D3`; and `P5` depends on all prior slices plus owner approval. Each admitted slice must name its exact
producer, consumer, entrypoint, config gate, and receipt evidence. Foundation-only work may settle only
when dependency-bound to its closure slice in the same approved DAG.

## Acceptance gate for the implemented contract

Implementation is not complete until evidence shows all of the following:

- repo-local authority remains byte-identical during every projection and recovery test;
- journal revisions are deterministic across supported platforms and unresolved conflicts survive;
- foreign and ambiguous files are never deleted, and owned deletion is quarantined and recoverable;
- Claude, Codex, and Gemini converge on one canonical revision through native adapters;
- CLI, MCP, finalizer, and hook use one production service with structured receipts;
- check mode distinguishes clean, drift, unavailable, conflict, and operational error states;
- concurrent and crash-injected runs expose no mixed committed generation;
- a repeated clean run performs zero writes; and
- real-host proofs complement, rather than replace, hermetic conformance tests.

Until those gates pass, the honest state is: **repo-local authority is established; safe multi-surface
projection parity is proposed but not implemented.**
