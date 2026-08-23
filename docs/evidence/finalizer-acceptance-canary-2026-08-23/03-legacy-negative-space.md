# FAC03 — Legacy Raw-Write and Residue Negative-Space Contract

**Scope.** This bounded acceptance record covers canonical-only publication,
settled-sprint task retirement, byte-conflict preservation, and the absence of
new legacy raw writes. It is not a terminal completion record.

## Source-backed authority

| Concern | Source evidence | Acceptance implication |
| --- | --- | --- |
| Canonical raw namespace | `src/core/sprint-archive.ts` declares `.deckent/archive/sprints/<sprint-id>/` as the physical evidence namespace and resolves archive paths through that authority. | New raw sprint evidence belongs only below the allocated canonical sprint root. |
| Legacy paths are migration inputs | `collectSprintArchiveCandidates()` reads legacy `.brain/archive/...-tasks` and `.tasks/archive` candidates; live `.tasks` and `.deckent/recently-works` candidates have `retireLegacy: false`. | Reconciliation may read legacy locations, but this flow must not create a new raw artifact there. |
| Non-clobber publication | `publishVerifiedCopy()` deduplicates equal bytes and sends different bytes for a logical target to `conflicts/<name>.<digest-prefix>`; `publishSprintArchiveArtifact()` independently rechecks source and destination identity before retirement. | A collision cannot overwrite the existing canonical byte stream. Both variants remain inspectable, and retirement is conditional on digest equality. |
| Manifest integrity | `verifySprintArchive()` returns `ok` only when `missing`, `mismatched`, and `untracked` are empty and the manifest digest is valid. | Targeted verification must show `ok=true`, empty discrepancy sets, and `manifestDigestValid=true`. |
| Finalizer ordering and failure boundary | `finalizeSprint()` settles task artifacts before final reconciliation; Step 14b reconciles and verifies before guarded summary export and terminal authority publication. Reconcile or verify failures throw `FinalizerTerminalEvidenceError`. | Archive failure is typed terminal-evidence failure, not a false COMPLETE projection. |
| Compact Brain projection | Archive reconciliation writes a small searchable manifest reference to `.brain/memory.db`; raw evidence is explicitly not duplicated there. | The archive row/index may refresh, but raw task or log payload is not copied to Brain. |

## Negative-space acceptance observations

The following observations are required for the allocated sprint and compare
against a baseline captured before its finalizer runs. The comparison is
bounded to the named locations; it is not a repository-wide cleanup request.

| Location or signal | Required comparison | Passing observation |
| --- | --- | --- |
| Live `.tasks/` root | Enumerate only artifacts owned by the settled sprint: task, result, log, prompt, worker, and equivalent hidden residue. | Count is `0` after task settlement; non-terminal or foreign artifacts are preserved rather than treated as this sprint's residue. |
| Legacy `.brain/archive/*-tasks` paths | Compare the pre-finalize count and aggregate digest of matching task-path inputs. | Count and digest are unchanged. The path is read-only migration input for this acceptance. |
| Legacy `.tasks/archive` | Compare the pre-finalize count and aggregate digest. | No new raw artifact is written there. Any source retirement is permitted only after independently verified digest equality at the canonical destination. |
| `.deckent/recently-works` | Compare the pre-finalize count and aggregate digest for the bounded sprint-file set. | Baseline values do not change except for the finalizer's explicitly owned, canonicalized retention behavior; no legacy raw-write is introduced. |
| `.deckent/archive/sprints/<allocated-id>/` | Read `manifest.json`, family counts, outcome, content digest, and verification report. | Manifest describes the actual terminal outcome and family counts; all raw publication is canonical. |
| Brain manifest reference and searchable projection | Read the compact `archive-<allocated-id>` reference and refreshed summary/index without reading raw payload into Brain. | A compact reference is searchable; raw task/log content is absent from the Brain row. |
| Reconcile idempotence | Run the same targeted reconcile a second time and compare the Memory DB digest. | `published=0`; the Memory DB digest is unchanged. |

## Conflict and retirement safety

1. Equal source and destination bytes are deduplicated, not copied again.
2. Different bytes at the same logical destination remain as hash-addressed
   conflict variants; no synthetic winner is selected.
3. A source becomes eligible for retirement only after an independent
   destination digest and byte-size comparison succeeds.
4. Live or hot runtime sources are excluded from legacy retirement by the
   candidate policy. This preserves active or foreign evidence.
5. Failure to settle, reconcile, or verify produces typed terminal-evidence
   failure before a completion projection is published.

## Historical baseline anchors

`STATE-ARCHIVE-RESTORE-001-canonical-sprint-archive-2026-08-22.md` records
that the final all-history reconciliation retained conflict variants, selected
no synthetic winner, and retired legacy duplicates only after canonical digest
verification. Its next-sprint checklist requires zero settled-sprint live task
artifacts, canonical manifest verification with zero missing/mismatched/
untracked entries, compact Brain-only indexing, idempotent zero-publication
reconciliation, unchanged legacy-path baselines, and failure that remains
terminal-evidence typed.

Those historical measurements are supporting precedent, not a substitute for
the allocated sprint's bounded before/after observations above.

## Evidence to retain with the acceptance run

- Allocated sprint ID and terminal outcome copied from the canonical manifest.
- Baseline and post-finalize count plus aggregate digest for each named
  legacy/location row.
- Targeted `deckent archive verify --sprint <allocated-id> --json` report with
  empty `missing`, `mismatched`, and `untracked` arrays and a valid manifest
  digest.
- First and second targeted reconcile reports, including the second report's
  zero publication count and unchanged Memory DB digest.
- Manifest conflict list, when present, demonstrating that all observed byte
  variants remain represented.

No destructive cleanup instruction is part of this contract. Ambiguous,
foreign, active, or conflicting evidence is retained for inspection.
