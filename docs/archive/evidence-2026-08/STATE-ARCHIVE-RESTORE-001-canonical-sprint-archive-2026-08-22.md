# STATE-ARCHIVE-RESTORE-001 — Canonical Sprint Archive Evidence

Date: 2026-08-22

Scope: canonical raw sprint evidence authority, legacy dual-read, lossless
reconciliation, manifest integrity, Brain semantic index and finalizer wiring.
This is a verified slice of `STATE-ARCHIVE-RESTORE-001`; restore, legal-hold,
permission/ACL and native-platform closure remain open on the parent outcome.

## Root causes closed

- Raw sprint evidence had multiple physical write authorities under `.tasks`,
  `.brain/archive`, `.deckent/archive` and runtime directories.
- Direct archive writers could overwrite an existing logical target with
  different bytes.
- Legacy staging directories could contain foreign sprint files; directory
  name alone was incorrectly treated as ownership evidence.
- Dry-run did not include already-canonical files and initially did not predict
  collisions among two legacy candidates in the same reconcile batch.
- Normal finalization could log an archive failure and still continue toward a
  terminal completion projection.
- Reapplying an identical archive index rewrote only the Memory DB timestamp,
  causing needless projection churn.
- Earlier migration preserved terminal receipts physically but 116 manifests
  had not indexed those files; verification therefore reported untracked data
  despite byte integrity.

## Production chain

- Canonical raw authority:
  `.deckent/archive/sprints/<sprint-id>/`.
- `src/core/sprint-archive.ts` owns path resolution, exact sprint ownership,
  canonical-first dual-read, copy/hash/fsync publication, conflict retention,
  manifest creation, verification and semantic Brain indexing.
- `publishSprintArchiveArtifact()` is the non-clobber boundary for direct
  writers. Different bytes are retained below a hash-addressed `conflicts/`
  path; source retirement is allowed only after independent digest equality.
- Finalize, force-abort, cleanup, recovery, task readers, usage/lineage, SDK,
  MCP read sides, scheduler-shadow, metrics, PID/snapshot, auditor and Docker
  artifact paths now consume the canonical resolver or dual-read authority.
- Normal and forced finalization fail closed when task settlement, reconcile or
  verify cannot establish durable terminal evidence.
- Operator CLI exposes i18n-backed `archive inspect`, `archive reconcile` and
  `archive verify`. MCP intentionally has no reconcile mutation surface.
- `.brain/memory.db` stores only one compact searchable manifest reference per
  sprint. Identical reapply skips the write and preserves DB bytes.

## Live reconciliation measurements

Targeted first slice:

- Sprint 611: COMPLETE, 82 artifacts, 5,094,530 bytes, 0 conflicts.
- Sprint 619: ABORTED, 71 artifacts, 2,452,267 bytes, 4 conflict groups.
- Sprint 620: ABORTED, 22 artifacts, 140,484 bytes, 0 conflicts.
- Sprint 621: ABORTED, 221 artifacts, 10,551,322 bytes, 0 conflicts.
- Sprint 622: COMPLETE, 102 artifacts, 3,121,575 bytes, 0 conflicts.

Initial repository-wide copy-only reconciliation cut:

- 653 sprint manifests; 27,169 artifacts; 664,365,957 payload bytes.
- Families: run 3,611; tasks 18,348; evaluations 2,364; metrics 10;
  scheduler 186; heartbeat 1,887; docs 706; audits 57; unknown 0.
- Outcomes remain evidence-honest: COMPLETE 52, ABORTED 71, UNKNOWN 530.
- First apply: 23,761 published, 488 deduplicated, 4 conflicts, 0 retired,
  0 failures.
- Second apply: 0 published, 24,249 deduplicated, 4 existing conflict
  variants, 0 retired, 0 failures.
- `archive verify --all`: 653/653 manifests and 27,169/27,169 artifacts valid;
  missing 0, mismatched 0, untracked 0, invalid manifest digest 0.

The next ordinary dogfood sprint and its terminal receipts advanced the final
repository cut to:

- 654 sprint manifests; 27,649 artifacts; 685,244,302 payload bytes.
- Families: run 3,747; tasks 18,596; evaluations 2,386; metrics 11;
  scheduler 188; heartbeat 1,955; docs 708; audits 58; unknown 0.
- Outcomes: COMPLETE 53, ABORTED 71, UNKNOWN 530.
- Final all-apply: 24,167 candidates, 0 published, 24,160 deduplicated,
  7 preserved conflict variants, 0 retired, 0 failures.
- `archive verify --all`: 654/654 manifests and 27,649/27,649 artifacts valid;
  missing 0, mismatched 0, untracked 0, invalid manifest digest 0.
- The 116 terminal-receipt index drifts and sprint-613's six additional
  untracked raw files were incorporated by manifest-only reconciliation; no
  payload was deleted or replaced.

That cut contained seven conflict groups. The final all-history reconciliation below retains 15
manifest conflict records and 17 physical hash-addressed conflict artifacts across sprint 619 and
compiled sprints 1539/1542/1544/1545/1546. Sprint 1539 has two pre-existing physical variants in
addition to the three current manifest conflict records; all 17 files remain on disk. Every byte
variant remains manifest-visible or physically preserved; no winner was invented.

Sprint-611 legacy staging contained 48 sprint-610 files. Their aggregate
source digest stayed
`sha256:d58afed6fcaac4dc25c619685a1a9d768730b45bda549b5c5e9e3ae5d95bb858`;
the sprint-611 canonical manifest owns zero of them.

The initial copy-only cut retired no legacy source. After all manifests and canonical digests were
verified, the final owner-authorized pass retired 18,364 digest-equal legacy duplicate sources.
Canonical payloads and conflict variants remained present; retirement never selected a conflicting
version or removed the only copy.

## Final all-history reconciliation cut

- 664 sprint manifests; 28,458 artifacts; 720,054,696 payload bytes.
- Families: run 3,873; tasks 19,047; evaluations 2,447; metrics 17; scheduler 195;
  heartbeat 2,095; docs 720; audits 64; unknown 0.
- First final apply: 24,405 candidates, 0 new publications, 24,392 deduplications,
  18,364 verified legacy retirements, 13 observed conflict variants and 0 failures.
- The apply incorporated 53 late-written root artifacts that had left ten otherwise valid
  manifests stale. No artifact had a hash mismatch; the stale-manifest cases were sprints 614–622
  and sprint 1780659451539.
- Idempotent reapply: 0 published, 0 retired, 0 failures. Existing differing sources were reported
  as conflict evidence without producing another physical variant.
- Repository-wide verification: 664/664 manifests and 28,458/28,458 artifacts valid; missing 0,
  mismatched 0, untracked 0, invalid manifest digest 0.
- Sprint 611 remains free of every sprint-610 path/task identity. Current exact manifests:
  sprint 611 = 82 artifacts; 619 = 76; 620 = 24; 621 = 226; 622 = 109.
- Memory DB read-only `PRAGMA integrity_check` is `ok`; 664 compact `sprint-archive` rows exist.
  An identical reapply preserved the Memory DB byte digest exactly at
  `d05f2c401064ebfa2bc4ce250b92e0aba273cbae30c51cd3e3cc76f9050bdd55`.

## Post-retention manifest-drift closure

The first six-task repair run exposed one later writer-order defect rather than
losing evidence. Finalizer Step 12d retained old `recently-works` files for
sprints `1780659451540`–`1780659451546` after those sprint manifests had already
been published; Step 14b then reconciled only the sprint currently finalizing.
The seven historical archives therefore contained digest-valid bytes that were
correctly reported as untracked by repository-wide verification.

The production correction makes retention preserve the canonical
sprint-prefixed filename, refresh and verify every historical manifest it
touches, and update the compact Brain index in the same bounded call. Retention
reconciliation failure is no longer swallowed by normal finalization or the
cleanup command; it becomes a typed terminal-evidence failure. A regression
test starts with a valid historical manifest, publishes later retained
evidence, and requires zero missing, mismatched or untracked artifacts after
the pass.

The compiled CLI then ran an owner-authorized repository-wide
`archive reconcile --all --apply --retire-legacy` followed by
`archive verify --all`:

- 671 manifests were applied; 6,276 candidates were inspected, 12 new
  publications and 6,255 deduplications completed, 0 retirement remained and
  0 failure occurred.
- Current canonical inventory is 29,538 artifacts and 763,019,677 payload
  bytes. Verification is 671/671 manifests and 29,538/29,538 artifacts valid;
  missing 0, mismatched 0, untracked 0 and invalid manifest digest 0.
- 23 logical conflict groups and 25 physical hash-addressed conflict variants
  remain preserved across history. Reconciliation selected no synthetic
  winner and deleted no conflicting bytes.
- Exact current manifests are sprint 611 = 82 artifacts / 5,094,530 bytes;
  619 = 76 / 2,485,496; 620 = 24 / 178,955; 621 = 226 / 12,436,424; and
  622 = 109 / 3,650,066. Sprint 611 still owns zero sprint-610 paths.
- The seven defect-revealing timestamp-backed archives now verify with 0
  untracked files. Their differing legacy bytes remain manifest-listed as
  conflict variants where applicable.
- Post-correction scoped verification is 6 files / 89 tests, `npx tsc
  --noEmit`, `git diff --check` and `npm run build:all`, all passing. The bot
  was restarted on the new dist and is live as PID 2431240.

## Verification

- `npx tsc --noEmit`: pass.
- Archive/finalizer scoped battery: 430 pass, 10 skip. Two additional old
  force-finalize tests remain incompatible with the already-landed 7092
  fail-closed rule that forbids reconstructing terminal task authority from a
  missing task projection; they are not archive regressions.
- Focused post-fix battery: 23/23 pass; canonical archive unit suite: 8/8 pass.
- `npm run lint:gates`: pass after generated projection synchronization.
- `npm run build:all`: pass; final source change followed by `npm run build`:
  pass.
- Real compiled binary: inspect, targeted reconcile, targeted verify,
  repository-wide reconcile, repository-wide verify and idempotent reapply all
  passed.
- Bot daemon was stopped before each build and restarted; final PID health was
  confirmed.
- The first normal post-migration dogfood sprint, `sprint-1780659451539`,
  completed 20/20 logical tasks across 24 attempts, automatically cleaned its
  live task files and initially wrote a 359-artifact canonical archive. The final all-history
  reconciliation incorporated eight later root artifacts, so its current 367-artifact manifest
  passes with zero missing/mismatched/untracked data.
- Compiled follow-up sprints 1547, 1548 and 1549 all exited naturally, retained their
  `sprint-finalized` notifications, left zero sprint-owned live task artifacts and verified their
  27, 39 and 27 artifact manifests respectively.
- Final root verification passed `npx tsc --noEmit`, 11 provider files/110 tests, 7 notification
  files/57 tests, `git diff --check`, landing gates and `npm run build:all`; final managed bot PID
  2125816 passed ownership-bound status and `kill -0` health after the compiled archive/provider
  smokes.

## Next normal sprint checklist

For the next ordinary dogfood sprint, closure is accepted only if all of the
following are observed from the real finalizer:

1. No active task/result/log/prompt/worker file remains for the settled sprint
   in the live `.tasks` root.
2. Every sprint-owned raw artifact exists below
   `.deckent/archive/sprints/<sprint-id>/`; foreign sprint bytes are excluded.
3. `manifest.json` has the correct terminal outcome, artifact count, family
   counts, source references and content digest.
4. `deckent archive verify --sprint <sprint-id> --json` returns `ok=true` with
   zero missing, mismatched and untracked artifacts.
5. A compact `archive-<sprint-id>` row exists in `.brain/memory.db`; no raw task
   or log payload is copied into the row.
6. Brain summary/index projections reference the canonical archive and remain
   searchable after restart.
7. Reapplying reconcile publishes zero new bytes and does not change the
   Memory DB byte digest.
8. No new raw evidence is written below legacy `.brain/archive/*-tasks` or
   `.tasks/archive`; those paths remain read-only migration inputs.
9. Same logical path with different bytes produces a manifest-listed conflict
   variant and never overwrites either version.
10. Finalizer archive failure produces typed HOLD/terminal-evidence failure and
    cannot publish a false COMPLETE result.

## Final all-history supplement — sprint 1558

The next ordinary dogfood recovery sprint exercised the finalizer after the archive correction.
`sprint-1780659451558` reached durable `COMPLETE`, exited naturally, removed its sprint-owned live
task artifacts and published a 294-artifact / 13,046,491-byte manifest with family counts
`run=10, tasks=183, evaluations=26, metrics=1, scheduler=1, heartbeat=70, docs=2, audits=1`.
Its content digest is `f2794adfe78dd80184181d441fd80d4f47092af42a670b858563f63e46e4af5a`.
Targeted verify reports 294 checked, zero missing/mismatch/untracked and a valid manifest digest;
second-pass reconcile is read-only with zero publish/retire/failure.

The final repository-wide read-only cut contains 673 manifests, 29,982 manifest artifact records,
782,197,590 payload bytes, 25 manifest conflict records and 27 physical hash-addressed conflict
artifacts. Integrity verification checked 29,980 files and reported zero missing, mismatched,
untracked or invalid manifest digest. Dry-run reconciliation inspected 6,420 current candidates,
wrote nothing and reported no failure. The difference between manifest artifact records and
checked files is reported explicitly rather than forced into a false equal-count claim.

The final scoped archive/provider/finalizer battery is 24 files, 315 pass and 4 intentional skip;
TypeScript, `git diff --check` and `build:all` pass. The managed compiled bot is live on PID 2600909.
