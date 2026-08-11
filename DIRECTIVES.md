# DIRECTIVES — Sprint-B5: codex canary pair plus two kernel truths

## Goal

Four MASTER-PLAN rows advance: status liveness truth (3313), error registry (460),
archive path authority (3314), runner silent death (3311). Rows 3313 and 460 are the
codex canary pair — the first codex-provider workers since the row-3308 continuation
fix went live in the running build; if either dies at a landing continuation again,
that is X-evidence against 3308 and goes back to its ledger row. Every slice is
scope-disjoint; none touches provider auth or runs build tooling.

Provider, model, effort and effective concurrency are resolved from effective config,
registry, role policy, auth/reachability evidence, usage/limit authority and host admission.

## Execution Contract

- Behaviour outside each task's stated defect stays byte-identical; every test passing
  today still passes, unchanged.
- Do not weaken or delete an existing assertion to make new behaviour pass; report the
  conflict in result notes instead.
- Read the existing mechanism before designing; every task EXTENDS something present.
  A second parallel mechanism is a NO-GO in all four.
- Fail closed on ambiguity; nothing may make a destructive action easier to trigger.
- Workers must not run `npm run build`, full `npm test`, provider login/auth mutation,
  sprint lifecycle commands, git commit, or cleanup. Scoped vitest runs only.
- Tests are hermetic: tmpdir-based, no network, no live `.tasks`/`.deckent` writes,
  async spawn only (ADR-D-002).
- New user-facing text goes through the i18n message authority (`getMessage`, en+tr);
  CLI descriptions are plain strings matching the surrounding file.
- Zero hardcode (ADR-G-036): no model name or flow value literal on a code path.

---

## Task 1: Status cannot show a liveness-unproven worker as active (row 3313)

- Files: src/cli/commands/status.ts, tests/cli/status-liveness-truth.test.ts
- Scope: src/cli/commands/status.ts, src/core/run-status-read-model.ts, src/cli/helpers/, tests/cli/status-liveness-truth.test.ts
- Model: gpt-5.6-sol
- Dependencies: none

Measured (row 3313, sprint-507 disk evidence): at 00:44 the status surface showed two
workers as "Writing code" while their last heartbeats were from 00:41 and every worker
process plus the runner (PID 55905) was dead. The projection was fiction and reached
the owner's report; the disk truth contradicted it on four axes (heartbeat age, pid
liveness, log tail, missing results).

Required: the status renderer marks a worker row as active ONLY with fresh liveness
evidence — a heartbeat younger than a config-resolved threshold (the existing
heartbeat_timeout family, never a new literal) or a verifiable process check; stale
evidence renders the row as a typed stale/unproven state with an actionable hint
(inspect/recover) through the i18n authority. The persisted read model itself stays
untouched as authority — this is projection honesty at render time. Regression test
pins the exact scenario: fresh heartbeat renders active, stale heartbeat renders
stale-labeled, and the dead-workers-shown-as-writing case can never render as active.

**Test:** `npx vitest run tests/cli/status-liveness-truth.test.ts`

**NO-GO:** changing the persisted read-model write path, a hardcoded staleness
threshold, hiding stale rows entirely (they must be VISIBLE as stale), or breaking the
existing status output contract for genuinely-live runs.

---

## Task 2: Every emitted error code lives in one registry with message and remediation (row 460)

- Files: src/core/error-registry.ts, tests/core/error-registry-integrity.test.ts
- Scope: src/core/error-registry.ts, src/core/, tests/core/error-registry-integrity.test.ts
- Model: gpt-5.6-terra
- Dependencies: none

Measured (row 460): 46 raw throws were already converted to typed DeckentError with
`lint:errors` green (0 new violations over a 321-occurrence baseline), but the row's
remaining acceptance is unproven: registry-backed message/remediation integrity. Today
nothing guarantees a registered code carries a human message and a remediation hint —
`ErrorRegistry.get` consumers (the doctor checks are one live example) defensively
optional-chain around missing entries.

Required: the registry contract gains integrity — every registered code carries a
non-empty message and remediation (or an explicit typed none-with-reason), and a new
integrity test walks the ACTUAL registry at runtime and fails closed on any entry
violating the contract, plus pins that every code the registry exports is unique and
well-formed. Do NOT rename codes or change any emission site in this slice — registry
contract and its proof only. If real entries violate the contract today, FIX the
entries (write the honest message/remediation), listing each in the result notes.

**Test:** `npx vitest run tests/core/error-registry-integrity.test.ts`

**NO-GO:** renaming or deleting error codes, touching emission sites, weakening
lint:errors, or filling entries with placeholder text instead of real remediation.

---

## Task 3: One canonical archive authority for task artifacts (row 3314)

- Files: src/orchestra/sprint-finalizer.ts, src/cli/commands/recover-helpers.ts, tests/orchestra/archive-path-authority.test.ts
- Scope: src/orchestra/sprint-finalizer.ts, src/cli/commands/, src/orchestra/, tests/orchestra/archive-path-authority.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured (row 3314, three manual moves in one night): normal settlement archives task
artifacts under the brain archive (sprint-NNN-tasks), the recover path archives under a
DIFFERENT tasks-local archive directory and preserves non-terminal files in the tasks
root, and hidden worker shell scripts were left behind by both. The owner manually
consolidated sprints 507, 509, 510 and 511 into the brain archive.

Required: root-cause first — locate every code path that archives or preserves task
artifacts (normal finalize, force-abort, recover, cleanup) and record the inventory in
the result notes. Then one archive authority: a single resolver provides the canonical
archive destination, every path consumes it, no path leaves residue (including
dot-prefixed worker scripts) in the tasks root after its operation completes, and
non-terminal preservation still works but INSIDE the canonical location with a typed
marker. The destination resolves from effective config where a key exists (the
sprint_file_retention family) — never a new literal. Hermetic test drives a tmpdir
fixture through settle/recover paths and asserts zero-residue plus single-destination.

**Test:** `npx vitest run tests/orchestra/archive-path-authority.test.ts`

**NO-GO:** deleting any artifact (archive means move, never remove), changing what
counts as non-terminal, or a second resolver anywhere.

---

## Task 4: The sprint runner cannot die without a typed record (row 3311)

- Files: src/orchestra/sprint-runner-entry.ts, tests/orchestra/runner-death-record.test.ts
- Scope: src/orchestra/sprint-runner-entry.ts, src/orchestra/, tests/orchestra/runner-death-record.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured (row 3311, sprint-507): the detached runner (PID 55905) died mid
scheduler-shadow journal line at 00:43:21 with NOTHING written to the crashes
directory; the status read model went HOLD, cleanup went run-orphaned HOLD, and the
whole chain needed manual recovery. Sprint-508's runner also exited leaving its pid
file behind while 510 and 511 exited cleanly — exit hygiene is path-dependent.

Required: root-cause first — inventory the runner's exit paths (normal terminal,
thrown error, unhandled rejection, signals, and the possibility of SIGKILL/OOM which
CANNOT be caught) and record which paths today write what. Then: every catchable exit
path writes a typed exit record (reusing the existing crashes-directory format) and
removes the pid file it owns; for the uncatchable-kill case, add a startup-time
detection — a runner finding a stale pid file plus no matching live process publishes
a typed posthumous death record before proceeding. No new daemon, no watchdog process
— detection rides existing entry points. Hermetic tests pin the catchable paths and
the posthumous detection with fixture pid files.

**Test:** `npx vitest run tests/orchestra/runner-death-record.test.ts`

**NO-GO:** a watchdog process or new daemon, swallowing the original error while
recording it, deleting a pid file the process does not own, or changing normal
COMPLETE settlement behaviour.
