# sprint-627 live finalizer acceptance result

**Observed:** 2026-08-23 19:09–19:28 Europe/Istanbul
**Run:** `sprint-627`
**RunFlow:** `dcb977fc-07ec-41a2-b81f-d37bf4f58dd3`
**Terminal truth:** `ABORTED`, active=false, resumable=false, coordinator absent

## Honest run result

The normal dogfood run admitted five independent tasks in one wave and five Docker workers were
observed live. Four original tasks completed. `627-001` returned `NO_GO`; its generated
`627-001-fix` was born `PAUSED` and was never dispatched. Owner-authorized force-finalization kept
that lineage unresolved and published terminal `ABORTED`; it did not promote the run or the task to
`COMPLETE`.

After terminal settlement, the missing compiled-consumer check was completed through the typed
ADR-D-007 recovery seam. The exact real-binary command
`node dist/cli/entry.js provider-observations inspect --json` exited `0` with schema v2 current,
`databaseBytes=2138112`, `rowCount=1017`, row-lineage digest
`9847e5dbc46e4ebf14ae407ff9ce1bd832463e38fd1d472a6e7476615c8bc4dc`, and schema digest
`9a63aa956cb566ab9ba3340092258ee7ee8744ba956d94ea75598743b494a273`.
The evidence document was refreshed and debts `debt-1780659451558-013` and
`debt-1780659451558-018` now both carry canonical `status=resolved` with
`resolvedInSprintId=sprint-627`. This successor recovery does not rewrite the archived `NO_GO` or
make the aborted run complete.

## Canonical archive and integrity

- Canonical root: `.deckent/archive/sprints/sprint-627/`.
- Manifest: terminal outcome `ABORTED`, 68 artifacts, 1,548,816 bytes.
- Families: run=7, tasks=41, evaluations=5, scheduler=1, heartbeat=14; conflicts=0.
- Content digest:
  `sha256:b0e5819e9c65d4ca01e877c0b43dfd7a3d46b08618c4fb2eafc01377b672636e`.
- `deckent archive verify --sprint sprint-627 --json`: `ok=true`, checked=68,
  `missing=[]`, `mismatched=[]`, `untracked=[]`, `manifestDigestValid=true`.
- Sprint-owned files remaining in live `.tasks/`: 0.

## Brain index, summary, and idempotence

The compact Memory row `archive-sprint-627` exists with type `sprint-archive`, title
`sprint-627 archive evidence`, summary `68 artifacts; ABORTED`, and a 257-byte content projection.
It references only the canonical path, aggregate counts, outcome and manifest digest; it contains no
raw task or log payload. A guarded `deckent memory export` refreshed the summary projection.

A second targeted applied reconcile reported `published=0`, `deduplicated=26`, `retired=0`,
`conflicts=0`, and `failures=[]`. Across that unchanged reapply, the Memory DB main-file digest
remained
`sha256:359d26a1de306c0f45e45773d307d8868b8fe5548e85cba283ce82875ce6f298`.
Targeted archive verification remained green afterwards.

## Legacy negative space

- `.brain/archive/sprints/sprint-*-tasks/`: 245 files; aggregate digest unchanged at
  `sha256:f248dfebe6c5253e3e707624f21d1300c9708d251ed798b1ea8a05b9a22b2b96`.
- `.tasks/archive`: 0 files; empty-content digest unchanged at
  `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- Canonical sprint roots increased from 701 to 702, exactly the allocated canary root.
- `.deckent/recently-works` increased from 22 to 28 files only by the six sprint-627 live-runtime
  sources named in the manifest (`events`, `metrics`, pre-archive digest/tar, sequence and terminal
  receipt). This is the configured hot runtime journal, not a legacy archive publication; no file
  appeared in either legacy raw archive path.

## FIX non-dispatch root cause

This was not a `do` versus `start` behavior difference. The actual run used
`runs <flow> --start`; the current RunFlow-enabled `do --run` path and `runs --start` both call the
same canonical `startRunFlow` exact-start service.

The failure occurred downstream:

1. `injectCriticalDebtTasks()` mirrored the debt's origin directory into `filesRead`.
2. `resolveFixRepairAuthority()` accepts exact file paths for inherited read authority and classified
   that directory-shaped value as `invalid_inherited_path`.
3. `handleEvaluation()` persisted the fix with repair-authority state `hold` and task status
   `PAUSED`.
4. `selectPendingFixTasks()` admits only `PENDING` fixes, so no fix worker was spawned.
5. The checkpoint retained the paused fix with an empty remaining queue; resume terminalization then
   failed closed on `TERMINALIZATION_RESULT_AUTHORITY_MISSING:627-001-fix:absent`.

This finding is admitted to `RUNFLOW-001`; it was not implemented inside the finalizer acceptance
outcome.

## Boundary

The canonical archive acceptance slice is locally evidenced. The run itself remains truthfully
`ABORTED`. This document is not the deferred runtime-hygiene formal XVerify, D4 closure, or a
formal Closure-OS receipt. Runtime-hygiene formal verification remains time-gated until
2026-08-24 20:00 Europe/Istanbul and must use a provider different from the output producer.
