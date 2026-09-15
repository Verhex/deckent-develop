# Task 766-003 — Inventory result and effect boundaries

## Evidence basis and dependency gate

This inventory is limited to the four declared TypeScript inputs. The predecessor directory
`docs/execution/active/dogfood-comparison/twenty/task-03` was empty at inspection time; no
accepted predecessor document or content digest was available. Therefore, predecessor-derived
claims are **unknown**, not inferred, and this document does not claim product completion.

| Input | SHA256 (measured) | Boundary evidence |
| --- | --- | --- |
| `src/core/run-status-read-model.ts` | `088feb014d05d83b3f08d241d347e208ca42518e703ec3149fa793eb8e31844e` | `RunStatusReadiness` and coordinator-owned publication, lines 432–466, 503–640 |
| `src/orchestra/scheduler-effects.ts` | `f8af9b62c27263186e96d0fda7ddf9cee532093382033cc16485f21b1eeb24d0` | dispatch boundary types and executor, lines 260–335, 1,410–1,445, 1,832–1,935 |
| `src/orchestra/spawn-backend-docker.ts` | `3ed921457730e26c60c9e435f8bea7ff565ad22cf64ded03790dd3d8606e8abd` | exact Docker/effect preparation and accepted-result reread, lines 13,100–13,540, 15,620–15,980 |
| `src/orchestra/sprint-controller.ts` | `62c93ba54cdf720c8a5d330e7ae5df6acd8a45a02eb1d4f28381fc67bb2f4601` | result collection, authority reads, evaluation, and status publication, lines 1,280–1,345, 1,350–1,475, 1,916–1,937 |

## Measured facts

1. **Published status is a projection, not raw worker ingress.** `CoordinatorRunStatusSnapshot`
   is explicitly coordinator-owned, and `coordinatorTasks` validates sprint identity, run
   generation, task identity/status, and held-task membership before projecting held tasks as
   `PAUSED` (`src/core/run-status-read-model.ts:503–539`, digest above). The publisher derives
   current attempt IDs from settlement authority and combines task holds, provider concurrency,
   terminal publication, and prior model before atomic write/readback (`src/core/run-status-read-model.ts:543–640`).

2. **Status delivery has an explicit fail-closed readiness boundary.** A model matching canonical
   authority is `READY`; reconciled pause, proven active liveness, and quiescent lifecycle are
   `SELF_SUFFICIENT`; all other cases are `HOLD/RUN_STATUS_READ_MODEL_UNAVAILABLE`
   (`src/core/run-status-read-model.ts:432–466`).

3. **Spawn effects have a typed dispatch landing boundary.** `CanonicalTaskDispatchBoundaryV2`
   carries task, provider, model, backend, and execution-evidence reference. The executor's
   durable-start hook is defined to occur immediately before legacy spawn or after exact
   `RELEASED` plus provider-start acceptance; zero-work exact outcomes do not call it
   (`src/orchestra/scheduler-effects.ts:260–335`, `:1,410–1,445`).

4. **Admission precedes mutation and provider execution.** `executeSpawnTask` checks repair
   eligibility and collisions, applies fix routing lineage, asserts provider authority, captures
   the pre-mutation task projection digest, then resolves prompt/provider/backend/write targets
   (`src/orchestra/scheduler-effects.ts:1,832–1,935`). This separates admission evidence from
   later execution effects.

5. **Scheduler persistence is ordered and replay-aware.** A `CascadeSkip` persists the synthetic
   `.result` before committing task status and collected state; a failed persist leaves the task
   pending for retry. Duplicate durable results are not rewritten (`src/orchestra/scheduler-effects.ts:2,890–3,045`).

6. **Exact Docker effect custody is bounded by durable preparation and rereads.** The backend
   verifies daemon/image/native capability, constructs identity-labeled workspace/dependency
   plans, allocates and rereads lifecycle authority, prepares the effect workspace, and publishes
   and rereads the prepared workspace authority (`src/orchestra/spawn-backend-docker.ts:13,100–13,540`).
   Failures settle a typed no-effect outcome or an ambiguity/reconciliation hold rather than
   silently continuing (same source range).

7. **Accepted results remain tied to effect and provider evidence.** Cold recovery reads the
   accepted artifact/chain and validates effect binding, provider-exit timing, provider stream,
   usage, billing, and result token-usage normalization before reconstructing an accepted reader
   (`src/orchestra/spawn-backend-docker.ts:15,620–15,980`). The code raises
   `EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED` on binding, parsing, timing, or evidence mismatch.

8. **Controller consumption is authority-aware.** `waitForResults` passes exact-registry
   authority readers/settlers into the collector; recovery paths reject authority holds and seed
   exact not-dispatched tasks as `NOT_DISPATCHED`/`PAUSED` rather than treating them as worker
   success (`src/orchestra/sprint-controller.ts:1,280–1,345`, `:1,350–1,475`). Synchronous
   evaluation maps explicit `NO_GO`, `GO_WITH_TECH_DEBT`, failed tests, documentation, and
   coverage cases to distinct evaluations (`src/orchestra/sprint-controller.ts:1,916–1,937`).

## Boundary synthesis for recovery decisions

### Dogfood operators

- **Fact:** A raw `.result` or stale task view is not sufficient to establish current status;
  readiness requires canonical-authority matching or one of the explicitly self-sufficient
  lifecycle states (facts 1–2).
- **Fact:** An exact task can be `pending-settlement`, `authority-hold`, `not-dispatched`, or
  exact-accepted at the scheduler registry boundary; the exact terminal path rereads backend
  authority and holds on mismatch (source: `src/orchestra/scheduler-effects.ts:691–830`, digest above).
- **Operational inference:** Dogfood recovery should display and act on the typed HOLD reason
  (including reconciliation/terminal reread holds), not retry or promote from a worker claim alone.
  This is an inference from the fail-closed branches; no runtime observation was performed.

### Product operators and tenant/platform scope

- **Fact:** The exact Docker identity includes project, task, attempt, generation, admission, and
  effect-related resource labels (`src/orchestra/spawn-backend-docker.ts:13,100–13,540`).
- **Fact:** The read-only exact authority composition does not expose the private Store and does
  not convert unreadable exact authority into a legacy fallback (`src/orchestra/spawn-backend-docker.ts:10,770–10,870`).
- **Operational inference:** Product surfaces can safely join evidence by tenant/project and
  attempt identity only when they consume the canonical authority/read-model projections. The
  same rule should hold across Linux/WSL2 and mixed backend runs; the source explicitly selects
  platform labels/paths and task-scoped lifecycle ownership, but this task performed no matrix
  execution, so platform parity remains unverified.
- **Unknown:** Whether every dashboard, CLI, and MCP surface currently consumes this shared
  readiness predicate is not provable from the declared inputs alone. Do not mark that wiring
  as complete from this inventory.

## MASTER3178 recovery decision impact

1. **Decision gate:** classify each task/run as `READY`, `SELF_SUFFICIENT`, or `HOLD` before
   presenting recovery as successful.
2. **Effect gate:** distinguish `not-dispatched`/no-effect from provider execution and preserve
   reconciliation holds when effect or accepted-result evidence cannot be reread.
3. **Tenant/platform gate:** keep project/attempt/generation identity in operator views; never
   collapse a cross-tenant or mixed-backend observation into the run default.
4. **Dependency gate:** this task cannot close the predecessor-linked recovery decision because
   the required accepted predecessor output was absent. The coordinator must settle/provide that
   dependency before this analysis is treated as a complete chain.

## Verification boundary

No runtime/provider calls, source/config changes, build, cleanup, or project test suite were
performed. No test result is asserted. The predecessor absence is a measured filesystem fact at
inspection time, not a claim about historical settlement.
