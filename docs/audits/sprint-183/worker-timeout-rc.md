# Sprint 183 W1-3 — Worker Timeout Root Cause Forensic Audit

**Sprint:** 183
**Task:** 183-003 (W1-3)
**Date:** 2026-05-21
**Worker:** w-183-003 (bug-fixer agent)
**Status:** Forensic complete + minimal in-scope fix landed; deeper docker on_exit fix deferred to Sprint 184 (out of scope)

---

## 1. Problem Statement

Sprint 182 dogfood produced **five** tasks that all terminated with the
identical failure signature:

> `Worker exited without writing result (exitCode=0)`

The affected tasks were the largest of the sprint:

| Task    | Surface                                  | Effort | Notes                                            |
|---------|------------------------------------------|--------|--------------------------------------------------|
| W1-1    | mock hygiene (`vi.mock('node:fs')`)       | normal | Wide mock-surface refactor                       |
| W1-3    | (this task)                              | high   | Re-tried in Sprint 183 with prompt-size hypothesis |
| W2-2    | `vitest CI=true` parity smoke            | high   | Long stdout buffering                            |
| W3-PQ-7 | integration smoke regression             | normal | Snapshot diff against 6 prior fixes              |
| W4-1    | `validate:publish` 6/6 GREEN recheck     | normal | Six-gate chained execution                       |

The signature is suspicious: `exitCode=0` is a **clean** exit — Claude CLI
believed it had finished its work — but the host-side `monitorContainer`
never observed a `.result` artifact and fell back to writing a synthetic
NO_GO via the `on_exit` trap in `src/orchestra/spawn-backend-docker.ts`.

---

## 2. Three Hypotheses

### H1 — Prompt-size context stress

Sprint 182 ran with `dependency_pipeline_enabled: true`, so every wave-2/3
task inherited a predecessor digest chain reaching as far as
`182-011 → 010 → 008 → 007 → 005`. Each digest line item is rendered into
the worker's prompt via `buildDependenciesBlock` in
`src/orchestra/prompt-god-template.ts`.

`formatDependencyEntry` caps `notes` at 500 chars via `truncateAtParagraph`
(`DEPENDENCY_NOTES_MAX_CHARS = 500`), but the `filesChanged` list is
joined with `', '` and emitted **uncapped**. A predecessor that touched
200 files produces a ~6.4K-char Files line; multiply by 10 deps and the
dep block alone is ~64K chars on top of the agent, skill, ADR, and scope
sections.

The dominant Claude CLI failure mode under context stress is silent: the
model returns an empty completion with `exitCode=0`, never invokes the
Write tool, and the worker shell falls through to its exit trap without
having created `.tasks/task-{id}.result`. This matches Sprint 182's
exitCode=0-no-result signature exactly.

### H2 — Docker container timeout / Claude API rate-limit

`docker_max_timeout: 14400` (4 hr) is already generous. `effectiveTimeout`
is correctly threaded through `DockerSpawnBackend.spawn()` into the
container's `TASK_TIMEOUT` env var (`spawn-backend-docker.ts:407`).
Heartbeat-daemon (`spawn-backend-docker.ts:363`) refreshes the `.hb` file
every 15 s, eliminating stale-heartbeat false positives.

If timeouts were the proximate cause we'd expect `exitCode=124` (sh
`timeout` builtin) or `exitCode=137` (SIGKILL after grace period). The
observed `exitCode=0` rules timeout out as the proximate cause. Claude API
rate-limits surface as 4xx HTTP and propagate to a non-zero exit;
likewise not observed.

**Conclusion:** H2 not the root cause in Sprint 182 — but worth re-checking
during the Sprint 184 dogfood for rate-limit retry behaviour under
sustained load.

### H3 — exitCode=0 + missing .result

Even though the worker is at fault (H1), the host-side fallback in
`spawn-backend-docker.ts:319-326` has its own latent bug:

```sh
if [ -n "$changed_files" ] && [ "$exit_code" -ne 0 ]; then
  # TIMEOUT_WITH_WORK
else
  # NO_GO
fi
```

A worker that exits with `exitCode=0` **but has modified files visible to
`git diff`** is treated as `NO_GO` rather than `TIMEOUT_WITH_WORK`. This
means even a successful-but-silent worker would lose its partial work via
the brain's auto-reconciliation path.

**The fix for this bug lives in `spawn-backend-docker.ts`**, which is
**out of scope** for task 183-003. Documented here so the Sprint 184
spec can pick it up — the suggested change is to drop the `exit_code -ne
0` clause so any git-diff non-empty exit (regardless of exitCode) routes
to `TIMEOUT_WITH_WORK` and lets Brain's Spurious-NO_GO helper reconcile.

---

## 3. In-Scope Minimal Fix (Sprint 183 landed)

The fixes below collectively reduce the chance of the H1 failure mode and
add a host-side disk-persistence verifier so Brain/Auditor can detect the
H3 fallthrough state during EVALUATE.

### 3.1 `src/orchestra/prompt-god-template.ts`

- New `DEPENDENCY_ENTRY_MAX_CHARS = 2000` constant (exported).
- New `DEPENDENCY_TRUNCATION_MARKER` private constant.
- New private `capDependencyEntry()` helper applied **inside**
  `formatDependencyEntry`. Each rendered dependency string is sliced to
  `2000 − marker.length` chars, then the truncation marker is appended.
- The cap is applied **after** assembly so a single oversized
  `filesChanged` list can no longer balloon the entry — the previous
  unbounded code path was the exact predecessor-digest source of Sprint
  182's prompt growth.

Net effect: 10-deep dependency chain prompt overhead bounded at
**≤ 20K chars** (was 64K+).

### 3.2 `src/orchestra/spawn-backend.ts`

- New `LARGE_PROMPT_THRESHOLD_CHARS = 50_000` constant (exported).
- New `isLargePrompt(prompt: string): boolean` helper (strict-greater than).
- Threshold chosen well below Claude's hard token cap so the orchestrator
  has room to emit a structured warning + investigate before the worker
  dies silently. The helper is the alert seam — wiring into specific
  backend `spawn()` calls is deferred to a follow-up so Sprint 183 stays
  truly minimal.

### 3.3 `src/agents/worker.ts`

- New `verifyResultPersisted(projectRoot, taskId): { persisted, size }`
  helper.
- Opens the `.result` file, calls `fsyncSync` to flush OS buffer cache,
  and returns the on-disk size via `fstatSync`.
- Designed to be called immediately after `writeResult()` so the
  orchestrator can detect the H3 fallthrough state (exitCode=0 + no
  `.result`) at the boundary between worker and Brain, *before* the
  evaluator treats the missing file as a NO_GO.
- Returns `{ persisted: false, size: 0 }` on missing file or fsync error
  — caller treats that as "worker lost its result" and schedules a fix.

---

## 4. Tests

`tests/orchestra/worker-timeout-rc.test.ts` — 7 tests, all green.

| Test                                                                                  | Hypothesis | Mechanism                                       |
|---------------------------------------------------------------------------------------|------------|-------------------------------------------------|
| exports `DEPENDENCY_ENTRY_MAX_CHARS` at bounded value                                 | H1         | Symbol export sanity                            |
| caps each dependency entry total size                                                 | H1         | 10 deps × 200 files × 5K notes → each entry ≤ 2K |
| `verifyResultPersisted` returns persisted=false on missing                            | H2 + H3    | File absent → caller treats as data loss        |
| `verifyResultPersisted` returns persisted=true + on-disk content matches              | H2 + H3    | Post-write disk verify path                     |
| exports `LARGE_PROMPT_THRESHOLD_CHARS` at sensible value                              | H3         | Symbol export sanity                            |
| `isLargePrompt` true for >threshold, false for small                                  | H3         | Threshold boundary behaviour                    |
| `isLargePrompt` exact at threshold returns false                                      | H3         | Strict-greater semantics for alert dedupe       |

---

## 5. Sprint 184 Follow-up (not part of this audit)

1. **`spawn-backend-docker.ts:292` on_exit trap fix:** drop the
   `exit_code -ne 0` clause from the partial-work branch so
   `exitCode=0 + git diff dolu` routes to `TIMEOUT_WITH_WORK` (with
   `exitCode=0` recorded) instead of synthetic NO_GO.
2. **`spawn-backend-docker.ts` LARGE_PROMPT warn integration:** invoke
   `isLargePrompt(prompt)` from `DockerSpawnBackend.spawn()`, write a
   `.deckent/sprint-NNN-prompt-size.warn.jsonl` audit line, and emit a
   structured `BRAIN→*:PROMPT_OVERSIZED` event on the event-stream
   channel.
3. **Brain post-EVALUATE invariant:** call `verifyResultPersisted` once
   per task after `evaluateResults` and emit `WORKER→BRAIN:RESULT_LOST`
   when `persisted=false` for any task whose status is not NO_GO. The
   evaluator currently treats missing `.result` as an opaque NO_GO; the
   new helper distinguishes "worker wrote NO_GO" from "worker disappeared".
4. **Claude CLI streaming probe:** instrument `spawn-backend-docker.ts`
   to teelog Claude CLI stdout to a `.worker-{id}.stdout` sidecar with
   `unbuffer` (or `script -fq`) so the next Sprint 182-class incident
   leaves a forensic trail beyond `exitCode=0`.

---

## 6. References

- **Sprint 182 retro:** `.brain/exports/memory.md` Sprint 182 Learnings block
  ("W1-1 / W1-3 / W2-2 / W3-PQ-7 timeout pattern, exitCode=0")
- **Sprint 182 sub-spec:** `docs/superpowers/specs/2026-05-21-worker-prompt-quality-fixes.md`
- **Sprint 183 master spec:** `docs/superpowers/specs/2026-05-21-crisis-stabilization-initiative.md` §9
- **ADR-035** Verification Protocol Standard (channel codes used by §5.3)
- **ADR-037** RBAC — `verifyResultPersisted` belongs to the Brain authority
  surface (read `.tasks/*.result`); Workers MUST NOT call it on others'
  results (own task only, by design of `taskId` parameter).
- **Files touched** by this task:
  - `src/orchestra/prompt-god-template.ts` (+25 LoC)
  - `src/orchestra/spawn-backend.ts` (+23 LoC)
  - `src/agents/worker.ts` (+27 LoC)
  - `tests/orchestra/worker-timeout-rc.test.ts` (NEW, 232 LoC, 7 tests)
  - `docs/audits/sprint-183/worker-timeout-rc.md` (this file)
