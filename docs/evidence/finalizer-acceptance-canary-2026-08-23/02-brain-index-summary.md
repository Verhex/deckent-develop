# FAC02-BRAIN — Archive index, guarded summary, and replay acceptance

## Scope and evidence boundary

This is a bounded source-truth acceptance contract for the post-terminal Brain
projection. It does **not** record a formal DONE or Closure claim. Raw sprint
evidence remains authoritative under `.deckent/archive/sprints/<sprint-id>/`;
the Brain row is a compact, searchable manifest reference only.

Source basis: `docs/evidence/STATE-ARCHIVE-RESTORE-001-canonical-sprint-archive-2026-08-22.md`
(Production chain; Next normal sprint checklist items 5–7),
`src/core/sprint-archive.ts` (`readMemoryReferences`, `upsertMemoryArchiveIndex`,
`reconcileSprintArchive`), `src/orchestra/sprint-finalizer.ts` (Steps 14,
14b, and guarded-export block), and `src/core/memory-store.ts` (`upsert`).

## Fresh archive index producer

1. `reconcileSprintArchive()` builds a manifest from current canonical archive
   files, sorts the artifact/conflict collections, reads non-index Memory
   references, and derives `contentDigest` from that payload
   (`src/core/sprint-archive.ts`, `reconcileSprintArchive`, lines 1068–1096).
2. With `apply: true` and no reconciliation failures, it atomically writes
   `manifest.json` before invoking `upsertMemoryArchiveIndex()` unless
   `indexMemory` is explicitly false (same function, lines 1093–1097;
   `writeJsonAtomic`, lines 851–870).
3. The producer identity is exactly `archive-<sprint-id>` and the row type is
   `sprint-archive` (`upsertMemoryArchiveIndex`, lines 885 and 922–935). Its
   content contains only canonical archive path, outcome, artifact count,
   byte count, family totals, and manifest digest; metadata contains manifest
   path/digest plus aggregate counts (lines 886–910). It neither copies task
   payloads nor log payloads into the row.
4. The source explicitly labels the raw-payload boundary: reconciliation writes
   a “small, searchable manifest reference” and never duplicates raw evidence
   into Brain (`src/core/sprint-archive.ts`, module header lines 1–10). The
   canonical archive evidence independently requires that no raw task or log
   payload be copied into `archive-<sprint-id>` (canonical archive checklist,
   item 5).

## Upsert and replay identity contract

Before writing, `upsertMemoryArchiveIndex()` reads the fixed row id and compares
all projected identity fields: type, source, title, content, summary, tags,
status, priority, sprint identity/number, language, decay exemption, serialized
metadata, tenant nullability, and non-deleted state. Exact equality returns
without calling `MemoryStore.upsert()` (`src/core/sprint-archive.ts`, lines
911–935). Therefore an unchanged manifest projection does not refresh
`updated_at` or create history churn.

If any projected field differs, it calls `MemoryStore.upsert()` with that same
fixed id and `sprint-archive-reconciler` as the changer (lines 922–935).
`MemoryStore.upsert()` selects by `entries.id`, inserts when absent, and otherwise
updates the existing identity rather than allocating a new row
(`src/core/memory-store.ts`, lines 487–500). This is the Memory DB upsert
identity for a single searchable row per sprint.

Second-reconcile acceptance is bounded as follows:

- perform an initial successful applied reconcile and retain the resulting
  Memory DB byte digest;
- repeat reconcile with equivalent canonical inputs;
- require zero newly published bytes and no retirement/failure from the second
  report; and
- require the Memory DB byte digest to remain unchanged, demonstrating that the
  equality guard skipped the DB write.

The canonical archive evidence records this required shape: an idempotent
reapply has zero publish/retire/failure, and an identical reapply preserved the
Memory DB byte digest `d05f2c401064ebfa2bc4ce250b92e0aba273cbae30c51cd3e3cc76f9050bdd55`
(canonical archive evidence, “Final all-history reconciliation cut,” and lines
118–120). That historical measurement is supporting evidence, not a substitute
for the bounded host proof above.

## Finalizer ordering and guarded summary refresh

The finalizer invokes `runPostFinalizeHooks()` at Step 14 with unsafe internal
memory export disabled; the hook receives rule regeneration after ADR insertion
(`src/orchestra/sprint-finalizer.ts`, Step 14, lines 4213–4265). It then performs
Step 14b: applied reconcile with `indexMemory: true`, fails terminal evidence on
reconcile failure, and verifies the manifest before proceeding (lines 4280–4311).
Only after that committed index and verification does it call
`writeGuardedExports()` when memory export is not skipped (lines 4320–4350).
The adjacent source comment establishes the intended observation: `summary.md`
sees the same searchable manifest reference, while raw evidence remains in
`.deckent`.

Acceptance must therefore observe this order, not infer it from timestamps:

1. post-finalize ADR/rule work settles;
2. applied archive reconcile commits the compact index;
3. archive verification succeeds; and
4. guarded summary export refreshes from the committed Memory DB.

A host proof is acceptable only when the searchable `archive-<sprint-id>` row,
its canonical manifest path/digest, and the refreshed summary projection agree.
It must reject any row containing raw task payload, any claimed summary refresh
that precedes index commit, any non-zero second-pass publish, and any changed
Memory DB digest for unchanged inputs.

## Explicit non-claims

- No build, XVerify, authentication mutation, or source mutation is performed
  by this evidence document.
- This document does not assert terminal completion, formal DONE, or Closure.
- The source’s guarded-export catch is logged rather than promoted here into a
  success claim; host evidence must establish the observed refresh separately.
