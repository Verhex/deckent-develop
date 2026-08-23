# FAC01 archive wiring and integrity contract

**Evidence status:** source-backed acceptance notes only. This record does **not**
claim formal DONE, Closure, a live archive verification, or a terminal sprint
outcome.

## Canonical producer → consumer chain

1. `resolveSprintArchiveDir(projectRoot, sprintId)` is the archive-root resolver.
   It validates the `sprint-<digits>` identifier and returns the configured
   in-project archive base plus the sprint id (`src/core/sprint-archive.ts:202-228`).
   `resolveTaskArtifactArchiveDir()` places task evidence below that root
   (`src/core/sprint-archive.ts:230-232`).
2. `archiveTaskArtifacts()` is invoked by normal finalization after task-file
   classification; a non-empty `settlement.failures` list becomes
   `FinalizerTerminalEvidenceError` (`src/orchestra/sprint-finalizer.ts:3986-4033`).
   The abort path applies the same settlement check before reconciliation
   (`src/orchestra/sprint-finalizer.ts:2530-2545`).
3. `reconcileSprintArchive()` collects candidates, publishes each applied
   candidate through verified copy logic, records individual failures, and only
   writes the manifest/index when `apply` is true **and** no failures exist
   (`src/core/sprint-archive.ts:941-1008, 1080-1097`).
4. Normal finalization deliberately waits for post-finalize writers and the
   final lifecycle event, then calls `reconcileSprintArchive(..., { apply:
   true, retireLegacySources: true, indexMemory: true })`, rejects reported
   failures, and calls `verifySprintArchive()` (`src/orchestra/sprint-finalizer.ts:4279-4304`).
   The abort path uses the same reconcile/verify options and rejects both error
   states before publishing aborted authority (`src/orchestra/sprint-finalizer.ts:2546-2563`).
5. The operator consumer is `deckent archive verify`: its CLI selects either
   `--sprint <id>` or `--all`, calls `verifySprintArchive()`, supports `--json`,
   and returns exit code 1 when any report is not `ok` (`src/cli/commands/archive.ts:17-25, 122-151`).

## Manifest family and digest invariants

- The manifest schema includes `kind`, `schemaVersion`, `sprintId`,
  `terminalOutcome`, artifact and byte totals, `familyCounts`, per-artifact
  path/family/bytes/SHA-256/source references, conflict variants, compact
  memory references, and `contentDigest` (`src/core/sprint-archive.ts:104-134`).
- Artifact families are exactly `run`, `tasks`, `evaluations`, `metrics`,
  `scheduler`, `heartbeat`, `docs`, `audits`, or `unknown`
  (`src/core/sprint-archive.ts:56-66`).
- Publication is non-clobbering: equal bytes deduplicate; different bytes go
  to a hash-addressed `conflicts/` destination; copying re-hashes the temporary
  file and fsyncs it before publication (`src/core/sprint-archive.ts:297-346`).
  Legacy-source retirement rechecks destination bytes and SHA-256 before unlink
  (`src/core/sprint-archive.ts:996-1004`).
- Reconciliation computes the manifest digest from the full payload and writes
  atomically only on a failure-free applied pass (`src/core/sprint-archive.ts:1081-1097`).
  Verification requires: every tracked file exists within the archive root,
  its byte count and SHA-256 match, no physical artifact is untracked, and the
  recomputed payload digest equals `contentDigest` (`src/core/sprint-archive.ts:1129-1173`).

## Targeted acceptance procedure (live operator check)

For the actual sprint under review, run only after the finalizer returns its
terminal result:

```sh
deckent archive verify --sprint <sprint-id> --json
```

Accept the archive only when the selected report has `ok: true`, a valid
manifest digest, and empty `missing`, `mismatched`, and `untracked` arrays.
The report's `checked` value is the manifest artifact count
(`src/core/sprint-archive.ts:1158-1173`; CLI wiring at
`src/cli/commands/archive.ts:122-151`). This document records no execution of
that command.

## Post-terminal live checks and honesty boundary

- Confirm a cleanup-eligible fenced terminal receipt exists before archive work.
  Receipt publication rejects stale, partial, deferred, or held evidence, and
  failure throws before archive, job summary, or terminal authority publication
  (`src/orchestra/sprint-finalizer.ts:3903-3940`).
- Inspect the terminal finalizer outcome for no
  `SPRINT_ARCHIVE_TASK_SETTLEMENT_FAILED`, `SPRINT_ARCHIVE_RECONCILE_FAILED`,
  or `SPRINT_ARCHIVE_VERIFY_FAILED` error. Both normal and abort paths throw
  typed terminal-evidence errors on these conditions
  (`src/orchestra/sprint-finalizer.ts:4018-4033, 4284-4300, 2540-2561`).
- Execute the targeted CLI verification above and retain its JSON output as
  live evidence; do not infer success from manifest presence alone.
- Confirm manifest `terminalOutcome`, family counts, conflict records, and
  compact memory references agree with the report and the actual fenced receipt.
- If any check fails, report the archive as failed/held and do not assert
  formal DONE or Closure. In particular, the normal code writes a job summary
  before its final Step 14b archive verification (`src/orchestra/sprint-finalizer.ts:4107-4209, 4279-4300`);
  this source review therefore does not claim that a later archive failure rolls
  back an already-written `COMPLETE` job projection. The guard evidenced here
  is typed failure propagation and the required post-terminal live verification.
