# DIRECTIVES — Retire an approved flow, and sweep artifacts by identity

## Goal

Two measured residuals from the 2026-08-09/10 dogfood campaign. Both are about
reachability: state a flow can never leave, and files a sweep can never see.

Provider, model, effort and effective concurrency are resolved exclusively from effective config,
registry, role policy, auth/reachability evidence, usage/limit authority and host admission. No
instruction-level provider or model override exists.

## Execution Contract

- Behaviour outside these two defects stays byte-identical. Every test passing today must still
  pass, unchanged.
- Do not weaken or delete an existing assertion to make new behaviour pass. If an existing test
  encodes the old contract, say so in the result notes instead of rewriting it.
- Read the existing mechanism before designing. Both tasks EXTEND something already present; a
  second parallel mechanism is a NO-GO in either.
- Fail closed on ambiguity. Neither task may make a destructive action easier to trigger by
  accident.
- Workers must not run `npm run build`, `npm test`, a full suite, provider login or auth mutation,
  sprint lifecycle commands, git commit or cleanup.
- CLI option and command DESCRIPTIONS in this codebase are plain strings; match the surrounding
  file. Other new user-facing text goes through the i18n message authority.
- Zero hardcode (ADR-G-036): no model name or flow value literal on a code path.

---

## Task 1: Let an approved-but-unstarted flow be retired from the inbox

- Files: src/cli/commands/runs.ts, tests/cli/run-flow-inbox.test.ts
- Scope: src/cli/commands/runs.ts, tests/cli/run-flow-inbox.test.ts, src/orchestra/run-flow-coordinator.ts, src/orchestra/run-flow-reducer.ts
- Dependencies: none

Measured: the store held 17 flows stuck in `APPROVED` — approved, never started, and impossible to
retire. `runs --reject` maps to `APPROVAL_REJECTED`, which the reducer accepts only from
`AWAITING_APPROVAL`, so those flows are permanent. Every `deckent start` then has to be forced past
them.

The capability already exists and MUST be reused rather than duplicated: read
`src/orchestra/run-flow-reducer.ts` and `src/orchestra/run-flow-coordinator.ts` first. The reducer
already routes an abort from any non-terminal state to `CANCELLED`, and the coordinator already
exposes that as a command. Nothing in the state machine needs to change — the gap is only that the
inbox never offers it.

Expose that existing capability from `deckent runs`, following the file's current option and
refusal style, and reusing the target-resolution the decide flags already share. Retiring a flow is
destructive, so it must be explicit and never a silent fallback of `--reject`: a flow that CAN be
rejected keeps being rejected exactly as today.

**Test:** `npx vitest run tests/cli/run-flow-inbox.test.ts`

**NO-GO:** The reducer or coordinator state machine is modified, `--reject` silently changes
meaning for a flow it can already handle, a terminal flow can be retired, retiring happens without
an explicit operator instruction, or an existing assertion is weakened.

---

## Task 2: Sweep task artifacts by task identity, not by filename prefix

- Files: src/core/orphan-cleaner.ts, tests/core/orphan-cleaner.test.ts
- Scope: src/core/orphan-cleaner.ts, tests/core/orphan-cleaner.test.ts
- Dependencies: none

Measured on 2026-08-10: three artifacts for task `500-003-fix-fix-fix` — a heartbeat, a plan and a
landing proposal — were written WITHOUT the `task-` filename prefix, all in the same second. The
sweep in `src/core/orphan-cleaner.ts` selects files by `task-<sprintNum>-`, so it never saw them.
They survived cleanup, the stale heartbeat read as a live worker, and Nervous fired repeated
respawn actions against a sprint that had settled hours earlier.

The producer that dropped the prefix has NOT been identified, and this task does not need to find
it. Make the sweep robust to artifact naming instead: an artifact belonging to a task of this
sprint must be swept whether or not its filename carries the prefix, while files belonging to
another sprint, or to no task at all, must still be left untouched.

Preserve the existing grouping contract exactly: task IDs may carry one or more `-fix` suffixes,
the first `.` separates the task id from the extension, and a PENDING fix must never be archived
merely because its base task is DONE. That logic is already correct — widen only which files enter
it.

**Test:** `npx vitest run tests/core/orphan-cleaner.test.ts`

**NO-GO:** A file belonging to another sprint or to no task is swept, the `-fix` grouping contract
changes, a PENDING fix is archived because its base task finished, the prefix-carrying path stops
working, or an existing assertion is weakened.
