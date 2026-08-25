# T11 — Cleanup and retention dependency order

Date: 2026-08-22
Mode: read-only audit

## Verdict

**GO for ordering; all three destructive applies remain blocked.** Cleanup may
begin only after its exact archive/retention or disposition authority is
verified and a fresh owner approval is issued against the unchanged destructive
manifest. This audit performed no apply, deletion, retirement, move, or task
state change.

Canonical archive completion is a prerequisite, not reusable destructive
authority. The archive evidence establishes a verified, lossless raw sprint
archive cut, but explicitly leaves restore, legal-hold, ACL/permission, and
native-platform closure open on `STATE-ARCHIVE-RESTORE-001`. Therefore it does
not unblock state pruning or authorize deletion by itself.

## Required dependency chain

| Destructive work | Must settle first | Post-dependency admission | Recoverability gate |
| --- | --- | --- | --- |
| `STATE-PRUNE-001` | `STATE-RETENTION-001`, plus the recorded cold-archive authority closure | Recompute the exact dry-run target manifest after dependencies settle; require no active sprint and a fresh `G3` owner receipt for the unchanged manifest | Verified backup and receipt; only approved targets; recovery must remain possible |
| `DOCS-ARCHIVE-001` | `DOCS-TOPOLOGY-001` | Produce the approved exact archive/`git mv` manifest only after the consumer topology is settled; require a stable manifest hash and a fresh `G3` owner receipt | Recoverable moves, updated links/writers, lint/link proof, and clean-clone proof |
| `REPO-CLEANUP-APPLY-001` | `REPO-CLEANUP-001` | Complete the per-path retain/archive/delete disposition and consumer graph; require the exact unchanged path manifest and a fresh filesystem-only `G3` owner receipt | Recoverable moves, link/test proof, and clean-clone proof |

The blocker register confirms the same rule for all three rows:
`FRESH_DESTRUCTIVE_APPROVAL_REQUIRED` is discharged only by the row's exact
`DependsOn` set **and** a `gate:G3` receipt. Settling a dependency or receipt
does not automatically promote a row to `READY`; the MASTER invariants must be
revalidated on the current state.

## Fresh approval and drift rules

`G3` includes the `G1` requirements. Before any destructive write, the owner
must receive:

- the exact file/path manifest and current baseline hashes;
- the exact destructive targets;
- the recovery plan; and
- a fresh owner approval bound to that evidence.

Any hash, scope, target, consumer-graph, active-sprint, archive, or retention
drift invalidates the approval. Historical cleanup approvals and archive
retirement receipts cannot be carried forward to a new disk shape. The
operator must remeasure, regenerate the dry-run manifest, re-establish
recoverability, and obtain a new receipt.

## Archive boundary

The canonical archive record supplies useful prerequisite evidence:

- 664/664 manifests and 28,458/28,458 artifacts verified;
- zero missing, mismatched, untracked, or invalid-manifest-digest findings;
- conflicts preserved rather than overwritten; and
- legacy duplicate retirement occurred only after digest equality and separate
  owner authorization.

Those facts demonstrate the required lossless pattern. They do not grant
blanket retention or deletion authority. Until the remaining archive/restore
and retention obligations are settled, `STATE-PRUNE-001` stays `BLOCKED`.
`DOCS-ARCHIVE-001` and `REPO-CLEANUP-APPLY-001` likewise stay `BLOCKED` until
their own dependencies, manifests, recoverability proofs, and fresh receipts
are independently complete.

## Fail-closed decision

If any dependency, exact-manifest equality check, backup/restore proof,
active-sprint exclusion, link/test or clean-clone proof, or fresh approval is
absent, the applicable apply remains blocked. No task deletion, dependency
bypass, or destructive execution is permitted by this note.
