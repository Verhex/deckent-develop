# Runtime contracts: Goal, Mission, Flow, Run, WorkItem, Attempt, Operation

## Product-user perspective

The product model is a lineage, not a synonym list:

`Goal → Mission → Flow → Run → WorkItem → Attempt → Operation`

- A **Goal** states the desired durable outcome and acceptance criteria.
- A **Mission** owns tenant-scoped progress and one or more durable work items.
- A **Flow** captures proposal, preview, approval/rejection, start, and terminal events for one requested execution.
- A **Run** is one admitted execution of an approved plan or work item.
- A **WorkItem** is a dependency-addressable unit scheduled within a mission.
- An **Attempt** is one fenced claim/execution of a work item; retries get distinct identities.
- An **Operation** is the lowest side-effecting provider/tool/capability action and must preserve authority and receipt lineage.

The first six meanings have concrete current contracts. A single canonical `Operation` type for the last link is not established; OQ-05 keeps that link `HOLD` rather than selecting a similarly named routing type by guess. [Evidence: `.deckent/workspace/IDENTITY.md:7`; `src/orchestra/autonomous/mission-store/mission-types.ts:12-188`; `src/core/run-flow-contract.ts:1-390`; OQ-05]

## Mission and WorkItem formats

| Contract | Required identity/state | Payload and authority | Evidence |
|---|---|---|---|
| `Mission` | `id`, `kind`, `status`, `tenant`, `title`, timestamps | `spec`, creator/delivery/render fields, progress, completion, last result | `src/orchestra/autonomous/mission-store/mission-types.ts:76-88` |
| `WorkItem` | `id`, `missionId`, `kind`, `status`, `revision` | `spec`, `policy`, render mode, progress, dependencies, trigger, claim fields, admission fence, registry digest, result | `src/orchestra/autonomous/mission-store/mission-types.ts:89-106` |
| Approval binding | work-item/mission/request IDs and publish/decision state | canonical request + decision and durable timestamps | `src/orchestra/autonomous/mission-store/mission-types.ts:111-128` |
| Dispatch claim | schema v1, work/mission/worker IDs, item revision, `attemptId` | private fence token plus persisted hash and registry revision/digest | `src/orchestra/autonomous/mission-store/mission-types.ts:129-148` |
| Recovery attempt | schema v1 plus tenant/work/mission/attempt identity | immutable pre-revocation claim and engine-observation evidence | `src/orchestra/autonomous/mission-store/mission-types.ts:160-187` |

Mission kinds are `list|goal`; states are `pending|active|completed|failed|cancelled`. WorkItem kinds are `task|sprint|capability|process`; states are `pending|running|done|failed|blocked|parked`; policies are `auto|approval-required|risk-tagged`. [Evidence: `src/orchestra/autonomous/mission-store/mission-types.ts:12-23`]

The store enforces atomic mission+DAG creation, lease-guarded recovery, first-writer-wins recovery acknowledgement, approval parking, claim fencing, and settlement operations. Callers must use store methods instead of editing DB rows or JSON projections. [Evidence: `src/orchestra/autonomous/mission-store/mission-types.ts:190-230`; `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts`]

## Flow and Run formats

`RunFlowContext` is the state-machine aggregate. It carries proposal/plan/approved snapshot, decision and start evidence, event history, state, and failure/terminal context; transitions go through the shared reducer and coordinator. REST, terminal, and other surfaces are consumers of those services rather than independent flow engines. [Evidence: `src/core/run-flow-contract.ts:1-390`; `src/api/run-flow-routes.ts:1-19,500-570`]

Current flow states and events are versioned in the core contract; invalid transitions are rejected rather than silently coerced. The API persists approved/exact-plan evidence and uses tenant-derived request principal instead of a client-supplied tenant. [Evidence: `src/core/run-flow-contract.ts`; `src/api/run-flow-routes.ts:88-120,500-570`]

The older `Sprint` contract remains the structured-run aggregate: ID/number, `SprintStatus`, `SprintPhase`, tasks, workers, timing, metrics, planner proof, execution mode, cleanup policy, rollback fields, and prompt-gate result. [Evidence: `src/core/sprint-types.ts:9-20,22-89`]

## Task format

The current task-file contract is `Task`:

| Group | Fields | Authority note |
|---|---|---|
| Identity | `id`, `title`, `description`, optional `sprintId` | Host/planner authored. |
| Routing | `model`, `effort`, `priority`, `reason`, provider/model/agent/skill overrides and exclusions | Effective routing may enrich `assignedAgent`, `assignedSkills`, and `routingMeta`. |
| Scope | `directories`, `filesRead`, `filesWrite` | Used for lock and disk-boundary checks; worker prose cannot widen it. |
| Dependencies | `dependencies` | Scheduler authority; cycles are rejected as E049. |
| Acceptance | `goNogo` plus stable criterion items/evidence requirements | Criterion IDs are host-derived SHA-256 identities. |
| Execution | `status`, optional backend/auth/model-effort/fix-mode/smoke/budget fields | Admission/policy decides whether execution can start. |

[Evidence: `src/core/task-types.ts:218-340,512-610`; `src/orchestra/task-builder.ts:903-1120`]

Task statuses include draft, pending, claimed, executing, testing, documenting, done, no-go, paused, and manual-review-required. Evaluation distinguishes DONE, GO_WITH_TECH_DEBT, NO_GO, DEFERRED, and NOT_DISPATCHED so saturation or missing dispatch is not blamed on a worker. [Evidence: `src/core/task-types.ts:221-279`]

## Result format

New result consumers should use versioned `TaskResultV1`, inferred from the Zod schema. It separates provenance/timing, git-authoritative work output, token/cost evidence, test/tsc verification, worker assessment, Brain evaluation, cross-verification, communication, and Auditor validation. [Evidence: `src/core/task-result-schema.ts:1-18,205-300`]

Required top-level evidence includes task/worker/provider/model identity, changed files and line totals, token usage, cost, tests, tsc, and self-assessment. Downstream Brain/Auditor fields are optional/defaulted because they are filled after worker collection. [Evidence: `src/core/task-result-schema.ts:205-300`]

Important invariants:

- file changes and boundary violations are orchestrator/git authoritative;
- token usage records provider-adapter versus tokenizer-fallback provenance;
- provider billing may carry reconciliation against local estimation;
- a worker may only report presence/incomplete/unsupported/contradictory production-wiring evidence, never structural completion;
- cross-verification can be `confirmed|refuted|unclear` or typed `unavailable`.

[Evidence: `src/core/task-result-schema.ts:44-203`]

The legacy `TaskResult` interface remains for existing consumers and has a different shape (`filesChanged: string[]`, line totals, boolean tests, numeric coverage). The barrel explicitly warns that aliasing it to V1 would break live consumers. [Evidence: `src/core/types.ts:25-48`; `src/core/task-types.ts:841-918`]

## Lock format

The simple lock projection is `{ filePath, ownerWorkerId, acquiredAt, taskId }`. Worker wrappers delegate acquire/release to the core file-lock implementation; serialized locks live under `.locks`, and spawn-specific locks use `.spawnlock`. Cleanup and recovery must use lock services because the current file-lock module also carries fencing/quarantine/database reconciliation logic beyond the four-field projection. [Evidence: `src/core/monitoring-types.ts:109-121`; `src/agents/worker.ts:170-207`; `src/core/file-lock.ts:64-105,4190-4978`; `src/orchestra/sprint-lifecycle.ts:487-501`]

## Canonical execution request and migration state

`ExecutionRequest` defines a provider-neutral envelope: description/kind, environment, requirement profile, scope or capability target, project root, acceptance, routing overrides, interaction mode, actor/origin/lineage, and finite budget. Risk is derived from capabilities and target verbs rather than stored as caller authority. [Evidence: `src/core/work-model.ts:13-186`]

⚠️ The same source header says the model was additive and “dead until a consumer migrates.” Current consumers exist around process/capability paths, but complete migration of all legacy task taxonomies is not proven; OQ-06 keeps normalized end-to-end closure `HOLD`. [Evidence: `src/core/work-model.ts:1-12,140-230`; OQ-06]

## Dogfood / repository reality

- ✅ Mission/WorkItem, flow, sprint/task, versioned result, and lock contracts all have production source owners.
- ⚠️ Legacy and versioned result shapes coexist by design; a reader must identify which contract it received. [Evidence: `src/core/types.ts:25-48`]
- ⚠️ The final Operation link and total adoption of the canonical work model are unresolved authority questions, not declared complete. [Evidence: OQ-05, OQ-06]
