# FO01 execution-ingress wiring inventory

**Evidence date:** 2026-08-23
**Boundary:** source inventory plus post-terminal acceptance; no formal XVerify or full authorization-lifecycle claim.

## Canonical producer and shared decision

`resolveExecutionBudgetPolicy()` derives the role-scoped owner grant from
`execution_budget.final_only_usage`. `applyWorkerExecutionBudgetPolicy()` stamps
that exact grant on `Task.budgetPolicy.finalOnlyUsage`; `Task` has no second
top-level final-only grant field. The shared consumer is
`requireFinalOnlyUsageContainment()` in
`src/core/final-only-usage-containment.ts`. It returns `not-required` only for an
incremental provider or no live token/turn/cache/context ceiling, returns the
exact nested grant only for final-only + Docker + matching role/provider/digest,
and otherwise raises typed `FINAL_ONLY_USAGE_CONTAINMENT_HOLD`.

## Production ingress table

| Ingress | Producer → consumer → dispatch | Acceptance result |
| --- | --- | --- |
| Manual `deckent spawn [--force]` | `registerSpawn()` reads the canonical task, passes `task.budget` and `task.budgetPolicy` to `spawnWorkerMultiProvider()`. That function resolves configured `auto` before adapter routing, calls the shared required resolver, and forwards the exact nested grant to `SpawnBackend.spawn()` only when the resolved executor is Docker (`src/cli/commands/spawn.ts`). | Valid task-stamped grant reaches Docker. Missing snapshot/grant, provider mismatch, and non-Docker resolution fail before provider work. No unknown task field or surface-local grant is read. |
| Initial sprint wave | Planner stamps each task through `applyWorkerExecutionBudgetPolicy()` (`src/orchestra/sprint-planner.ts`); `spawnWorkers()` calls the shared required resolver with that task's own snapshot before `TASK_ASSIGN`/backend dispatch (`src/orchestra/sprint-spawner.ts`). | Multi-task waves consume task-local grants; there is no wave-global injected grant. Resolver HOLD is authoritative even when the Docker backend declares measured-stream support. |
| Retry / FIX / continuation | FIX production applies the same worker policy in `src/orchestra/sprint-phases.ts`; continuation routes through `executeSpawnTask()`, which calls the same required resolver before assignment/dispatch (`src/orchestra/scheduler-effects.ts`). | Valid continuation grant reaches Docker; missing grant is a typed pre-dispatch HOLD. Retry/FIX cannot obtain a different surface-local grant. |
| Task mode / `deckent run` | These paths call `spawnWorkerMultiProvider()` but do not mark the manual task-snapshot parity ingress in this slice (`src/cli/commands/run.ts`, `src/orchestra/task-mode-runner.ts`). Docker retains its final enforcement. | `RELATED_BUT_NONBLOCKING`: full task/run/autonomous convergence belongs to the broader execution-surface authority outcome; this slice does not claim it. |
| XVerify | XVerify resolves its own auditor execution policy and passes the existing runtime `finalOnlyUsageContainment` option through `spawnWorkerMultiProvider()` to the immutable-settlement Docker path (`src/orchestra/cross-verify-runner.ts`). | The task-snapshot parity change preserves this separate authority seam; it does not reinterpret an XVerify grant as a worker-task grant. |

## Remaining structural divergence

Initial `spawnWorkers()` still owns an inline dispatch branch while continuation
uses `executeSpawnTask()`. Both now consume one shared final-only decision, but
the duplicate dispatch surface remains admitted under `SURFACE-CUTOVER-001`,
`APP-SERVICE-001`, and `SURFACE-PARITY-001`; it was not expanded into this
single outcome.
