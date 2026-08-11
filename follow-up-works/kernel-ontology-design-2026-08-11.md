# Kernel ontology — canonical entities, ownership, transitions (2026-08-11)

**Work ID:** MASTER row 3010 — *Kernel ontology: canonical entities, ownership, transitions*. Task `520-004`.
**Decision owner:** Alperen.
**Status:** proposal only. This document changes no production code, no config, no schema, no ADR and no MASTER row. It proposes; it does not migrate.
**Companions:** `follow-up-works/agent-catalog-authority-design-2026-08-11.md` (row 7011) and `follow-up-works/skill-catalog-authority-design-2026-08-11.md` (row 7012). This document deliberately reuses their vocabulary — *layer*, *authority*, *effective record*, *determinism contract*, *owner decision point* — so the kernel ontology and the catalog authorities stay one design family rather than two dialects.

---

## 0. Decision boundary

`HOLD` below means: no implementation may treat the item as settled until the owner records a decision. It is never a product verdict.

Four things this document is not allowed to do, and does not do:

1. **It does not rename anything.** Every collision in §2 gets a *route* in §4 — canonical name, compatibility mechanism, retirement gate. A rename without a route is the task's own declared NO-GO condition.
2. **It does not edit production or persisted schema.** Every observation in §2 is a read.
3. **It makes no claim without a file anchor.** Every `path:line` below was observed on 2026-08-11 in this working tree, inside this task's read scope (`src/core/`, `src/orchestra/`, `follow-up-works/`). Where a number comes from row 3010's own 2026-07-27 code-truth column rather than from this document's own observation, it is labelled as such.
4. **It does not decide the Sprint/Task-vs-WorkItem reconciliation.** That is the single largest owner decision in §7 (D7), and it is stated as options, not as a verdict.

---

## 1. Problem — one sentence

The Brain contract names `Goal → Mission → Flow → Run → WorkItem → Attempt → Operation` as the canonical causal chain, but in code only **one** of those six edges is a typed field, `Flow` names four unrelated things, `Attempt` names at least nine, `Goal` is not an entity at all but an untyped JSON blob, and `Operation` — the one entity with a real versioned catalog — is referenced by no entity whatsoever, so no reader can answer "what caused this attempt, under whose authority, toward which goal" without guessing.

---

## 2. Noun inventory — file-level evidence (2026-08-11)

### 2.1 `Flow` — four senses, not three

Row 3010's 2026-07-27 measurement named three unrelated senses. Reading the tree today confirms those three and surfaces a **fourth**, labelled as a new observation rather than a restatement of the row.

| # | Sense | Canonical anchor | What it actually is | Has identity? | Has a store? | Has transitions? |
|---|---|---|---|---|---|---|
| F-A | **Schedule** | `src/core/scheduled-flow.ts:11` (`ScheduledFlow`) | A cron *definition* — `{id, cronExpr, action, tenantId, enabled, createdAt}`, described in its own docstring as "a scheduled flow definition for F3 process mode" | yes (`id`, tenant-scoped) | yes — `src/core/flow-registry.ts:9` in-memory `Map` + `_persist` at `:76`, reload at `:92`/`:108` | no — `enabled` is a flag, not a lifecycle |
| F-B | **RunFlow lifecycle** | `src/core/run-flow-contract.ts:46` (`RunFlowState`) | An 11-state host-owned front-door state machine: `COLLECTING → PROPOSAL_READY → PREVIEWING → AWAITING_APPROVAL → APPROVED → STARTING → DETACHED_RUNNING → COMPLETED \| FAILED \| CANCELLED \| BLOCKED` | yes (`flowId` + `revision` + `generation`) | yes — `src/core/run-flow-store.ts`, SQLite at `.deckent/runtime/run-flow-store/run-flow-authority.sqlite` (`:258`, `:262`), schema v3 (`:51`) | yes — the reducer rejects every event on a terminal context |
| F-C | **Trace vocabulary** | `src/orchestra/autonomous/flow-reporter.ts:9` (`FlowStep`) | Nine *log-event* names — `picked · jit_detail · spawned · brain_verdict · audit_verdict · cross_verify · done · failed · parked` — emitted per autonomous backlog `entryId` on two channels (`:15` `FlowStepRecord`, `:22` `FlowReporterDeps`) | no — it borrows `entryId` | no — it is a sink, not a store | no — the steps are unordered by type; nothing rejects an illegal sequence |
| F-D | **Choreography** *(new observation)* | `src/orchestra/golden-flow.ts:1` | A pure orchestrator over `NL goal → intent → plan-preview → approve → start → evaluate-summary`, with every effect injected as a seam | no | no | implicitly, in control flow only |

These four share a word and nothing else. F-A is a *rule*, F-B is an *entity*, F-C is a *vocabulary*, F-D is a *procedure*. The cost is not aesthetic: `src/orchestra/autonomous/runtime-loop.ts:81` and `:149` both carry a field literally named `flows: ScheduledFlow[]` inside the autonomous runtime that also drives the F-C reporter, so one module holds two `flow` meanings at once, and `src/orchestra/autonomous/scheduled-flow.ts:13` re-exports the core F-A type into the same namespace where F-C lives.

**A fifth, weaker signal:** `FlowNotFoundError` at `src/orchestra/run-flow-coordinator.ts:152` extends `RunFlowCoordinatorError` (`:96`) — the error name drops the `Run` prefix, so an F-B failure surfaces under the bare `Flow` word that F-A also owns.

### 2.2 `Attempt` — nine senses, one undeclared identity space

| # | Type | Anchor | Scope of one instance |
|---|---|---|---|
| A-1 | `StartAttemptRecord` | `src/core/run-flow-contract.ts:268` | One try at *starting* a Run for one Flow generation. States at `:197`: `PREPARED · PROCESS_SPAWNED · ADMITTED · COMPLETED · FAILED · CANCELLED · BLOCKED · UNKNOWN`; active set `:207`, terminal set `:215`. `attemptId` is documented as globally unique, `generation` monotonic per flow |
| A-2 | `MissionDispatchClaim` | `src/orchestra/autonomous/mission-store/mission-types.ts:135` | One try at *dispatching* one WorkItem — `attemptId` + `fenceToken`/`fenceTokenHash` + `itemRevision`. Crash-takeover evidence is a separate immutable record, `MissionRecoveredDispatchAttemptV1` at `:160` |
| A-3 | `TaskResultSettlementAttemptV1` | `src/core/task-result-settlement.ts:59` (pending twin at `:2074`) | One try at *settling* a task result |
| A-4 | `ExecutionAttemptRetirementV1` | `src/core/execution-landing-checkpoint.ts:139` (disposition union at `:134`) | The *retirement record* of an attempt, not an attempt |
| A-5 | `LineageUsageAttempt` | `src/core/lineage-usage-authority.ts:18` (aggregate at `:44`) | The *token-usage view* of an attempt |
| A-6 | `ProviderLimitAdmissionAttempt` | `src/core/provider-limit-admission.ts:49` | One *admission decision* against a provider limit |
| A-7 | `RoleInvocationAttempt` | `src/core/role-invocation-resolver.ts:166` | One *role-resolution* try |
| A-8 | `ExecutionAdmissionFallbackAttempt` | `src/core/execution-admission.ts:29` | One *fallback hop* inside a single admission |
| A-9 | `LogicalProgressAttempt` | `src/core/logical-progress-projection.ts:4` | A *progress projection* of an attempt |

Three structurally different things wear one word here: **real attempts** (A-1, A-2), **records about an attempt** (A-3, A-4, A-5, A-9), and **sub-decisions inside an attempt** (A-6, A-7, A-8).

**The load-bearing gap is not the word — it is the identity space.** A-1 and A-2 both mint a field named `attemptId`; nothing in either module states whether those two spaces are disjoint, whether one may reference the other, or whether a collision between them is possible. A tenth site, `TaskResult.workAttribution.attemptId` (`src/core/task-types.ts:841` onward), carries a third `attemptId` whose provenance is a host claim-time authority. A reader joining usage (A-5) to a settlement (A-3) to a dispatch (A-2) today must assume, not verify, that the identifiers refer to the same act.

### 2.3 The rest of the chain, as it actually exists

| Canonical name | Does an entity exist? | Anchor | Actual shape |
|---|---|---|---|
| **Goal** | **No** | `src/orchestra/autonomous/mission-store/goal-mission.ts:20` (`GoalMissionSpec`) | A *spec shape* — `{id, title, goal, acceptance?, acceptanceAuthoredBy?, tenant?, deliverTo?}` — carried inside `Mission.spec`, whose declared type is `Record<string, unknown> \| null` (`mission-types.ts:76`). Goal has no row, no status, no lifetime independent of the Mission, and no typed query path. Its loop outcome vocabulary lives at `goal-mission.ts:42` (`authored · accepted · exhausted · waiting · held`) and its acceptance contract at `mission-acceptance.ts:18` |
| **Mission** | Yes | `mission-types.ts:76` | `{id, kind, status, tenant, title, spec, createdBy, deliverTo, renderAs, progress, timestamps, lastResult}`. Vocabularies: `MissionKind` `:12` (`list \| goal`), `MissionStatus` `:13` (`pending · active · completed · failed · cancelled`). **No `goalId` field** |
| **Flow** | Yes, as F-B only | `run-flow-contract.ts:46` | See §2.1. **No `missionId` field** |
| **Run** | **Half** | `run-flow-contract.ts:188` (`RunHandle{flowId, jobId, logRef}`) | Not an entity — a *correlator*, published only at the `ADMITTED` transition. Its durable truth is a directory of JSON files, `.deckent/runtime/jobs/*.json` (`src/core/constants.ts:26`), read tolerantly at `src/core/run-jobs-read.ts` into `TerminalJobClosure`, whose own header states a do-origin flow "has no durable event log". A second, deliberately duplicated `RunHandle` is re-declared at `src/orchestra/run-job-service.ts:53` specifically to avoid an import allowlist |
| **WorkItem** | Yes — the healthiest entity in the chain | `mission-types.ts:89` | `{id, missionId, kind, status, spec, policy, renderAs, progress, dependsOn, trigger, claimedAt, claimedBy, revision, admissionFence, claimRegistry*, timestamps, lastResult}`. Vocabularies at `:16`–`:21`. `revision` gives it optimistic concurrency; `dependsOn` gives it a DAG |
| **Attempt** | Yes, nine times | §2.2 | — |
| **Operation** | Yes, and it is the best-specified entity in the repo | `src/core/operation-catalog/index.ts:37` | Eight-field versioned definition — `{id, version, title{en,tr}, effect, gate, risk, capabilities, idempotency, auditEvent}`; `OperationEffect` `:19`, `OperationGate` `:30`, `OperationRisk` `:32`, `OperationIdempotency` `:35`; unknown id fails closed (`:98`, `UnknownOperationError`); `EFFECT_MIN_GATE` forbids a silent authority downgrade. JSON is the single source of truth |

### 2.4 The four gaps this inventory proves

**G1 — One typed ownership edge exists, out of six.**
`WorkItem.missionId` (`mission-types.ts:89`) is the only field in the entire chain that names its parent. There is no `Mission.goalId`, no `Flow.missionId`, no `Run.flowId` on a durable row (only on the transient `RunHandle`), no `Attempt.workItemId` reaching outside its own store, and no `*.operationId` anywhere. A `grep` for `operationId` across `mission-types.ts`, `task-types.ts`, `run-flow-contract.ts` and `sprint-types.ts` returns nothing.

**G2 — The one bridge between the two halves of the chain is a field on a *result*, not an edge on an *entity*.**
`ResultLike.exactPlanRef?: ExactPlanReferenceV1` (`mission-types.ts:70`) is optional, lives on the settlement payload, and is adopted into a sprint item's spec "only in the exact claim settlement transaction". So the Mission world reaches the Sprint world *after the fact*, through an optional field on an outcome. Before settlement, the edge does not exist.

**G3 — The legacy Sprint/Task chain is a parallel, tenant-blind universe.**
`Sprint` (`src/core/sprint-types.ts:62`) carries `{id, number, status, phase, tasks: Task[], workers, …}` with vocabularies `SprintPhase` (`:9`, ten phases) and `SprintStatus` (`:22`, eight states). `Task` (`src/core/task-types.ts:512`) carries `sprintId?` — **optional**. Neither `sprint-types.ts` nor `task-types.ts` contains the string `tenant`, while `Mission.tenant` is required. Ownership inside this chain is by **containment** (`Sprint.tasks: Task[]`, an embedded array), and the Flow→Sprint edge is by **embedding** too: `ApprovedRunSnapshotInput.sprint: Sprint` (`src/orchestra/run-job-service.ts` input block) puts a whole Sprint inside a run snapshot rather than referencing one.

**G4 — Recovery logic is duplicated because the entities are not unified.**
`src/orchestra/recovery-adapters/run-flow-recovery-adapter.ts:8` and `run-job-recovery-adapter.ts:8` declare two near-identical state unions (`DETACHED_RUNNING · RUNNING · COMPLETED · FAILED · CANCELLED · BLOCKED`), each with its own `*ProcessState`, `*ProcessEvidence`, `*TerminalReceipt`, `*RecoveryRead` and `*ReconciliationProposal` family. Two adapters exist because Flow and Run were never separated as entities, so each surface re-derives the same recovery question.

---

## 3. The canonical entity table (proposal)

### 3.1 The seven entities

One rule decides membership: **an entity is a thing that has durable identity, exactly one owner, and a transition set that something enforces.** A rule is not an entity. A vocabulary is not an entity. A projection is not an entity.

| Entity | One-sentence definition | Owner (parent) | Cardinality | Lifetime relative to owner |
|---|---|---|---|---|
| **Goal** | A durable, tenant-scoped intent with acceptance criteria, which outlives every attempt to reach it | Tenant | 1 tenant → N goals | Independent; survives all children |
| **Mission** | A bounded commitment to advance one Goal, carrying a work-item DAG | Goal (**optional** — a `list` mission has none) | 1 goal → N missions | Terminates independently of the Goal |
| **Flow** | The approval envelope for one execution proposal: collect → propose → approve → start → settle | Mission | 1 mission → N flows | Terminal states are absorbing |
| **Run** | One durable detached execution of one approved Flow revision | Flow | 1 flow → N runs (one per `generation`) | Cannot outlive its Flow's terminal state |
| **WorkItem** | One unit of work in a Mission's DAG | Mission | 1 mission → N work items | Bounded by the Mission |
| **Attempt** | One bounded, fenced try at making a WorkItem or a Run real | WorkItem **or** Run (never both) | 1 parent → N attempts, ≤1 active | Strictly inside the parent |
| **Operation** | The versioned catalog entry naming *what* an Attempt is trying to do, with its gate, risk, capabilities and idempotency class | Catalog (global, versioned) | Referenced, never owned | Independent of every instance |

**What is explicitly demoted, and to what:**

| Currently modelled as | Demoted to | Why |
|---|---|---|
| `ScheduledFlow` (F-A) | **Schedule** — a *trigger rule*, not an entity in the chain | It has no lifecycle; `enabled` is a flag. It *produces* Missions; it is not one |
| `FlowStep` (F-C) | **TraceStep** — a *vocabulary* | No identity, no store, no enforced order |
| `golden-flow` (F-D) | **Choreography** — a *procedure* | Pure control flow over injected seams |
| `Sprint` | **A WorkItem kind** (`kind: 'sprint'` already exists at `mission-types.ts:16`) — see D7 | It is a unit of work with a DAG, which is what a WorkItem is |
| `Task` | **A WorkItem** (`kind: 'task'`) — see D7 | Same |
| `RunHandle` | A **projection** of Run, not Run itself | It is three correlator fields published at one transition |

### 3.2 Identity scheme

**One form, everywhere:**

```
dk:<tenantId>:<kind>:<ulid>
kind ∈ goal | mission | flow | run | workitem | attempt
```

- **ULID, not UUIDv4** — lexicographically sortable by creation time, so a store can page and a recovery reader can order without a clock column it cannot trust.
- **Tenant is inside the identifier**, not merely beside it. Law 2 (every environment, multi-tenant from the start) is enforced by construction: an identifier that crosses tenants is malformed, not merely wrong. This closes G3's tenant-blindness for every new row without touching a legacy one.
- **`Operation` keeps its own scheme**, because it already has one that works: `{id, version}` from `catalog.v1.json`, a governance artifact that is diffable, lintable and receipt-pinnable. A reference to it is the pair, never the bare id.
- **Legacy identifiers are never rewritten.** `520-004`, `sprint-519`, an existing `flowId` — all stay. They become the `legacyId` field of the canonical row. The mapping is a table, not a rename. See §6 P1.

**Three orthogonal counters, with distinct jobs — the code already uses all three, inconsistently:**

| Counter | Job | Existing precedent |
|---|---|---|
| `revision` | Optimistic concurrency — a compare-and-set token | `WorkItem.revision` (`mission-types.ts:89`), `StartAttemptRecord.revision` (`run-flow-contract.ts:268`) |
| `generation` | Supersession — "this attempt replaces that terminal predecessor" | `StartAttemptRecord.generation`, fenced by `RunFlowRecoveryManifest` |
| `epoch` | Singleton-owner fencing — "which engine process holds authority" | `MissionEngineLease.epoch` (`mission-types.ts:149`) |

Proposal: these three names are reserved words in the ontology and may never be used for anything else.

### 3.3 Ownership edges — the required fields

Every canonical row carries a **lineage envelope**, not scattered optional pointers:

```
LineageV1 {
  schemaVersion: 1
  tenantId:     string          // redundant with the ULID prefix, and deliberately so — indexable
  goalId:       GoalId  | null  // null is honest for a list-mission
  missionId:    MissionId | null
  flowId:       FlowId  | null
  runId:        RunId   | null
  workItemId:   WorkItemId | null
  attemptId:    AttemptId  | null
  operationRef: { id: string; version: number }   // NEVER null on an Attempt
  correlationId: string
  causationId:   string | null
}
```

Precedent, not invention: `StartAttemptLineage` (`run-flow-contract.ts:241`) already carries `{tenantId, projectId, actor, origin, correlationId, idempotencyKey, parentPlanLineageHash, parentCorrelationId, authorizationAuthority, causationId?, sourceId?}`. The proposal generalises that one good shape to every entity instead of letting each store invent its own subset.

**Rule — the edge is set at birth and is immutable.** A Flow that was created without a `missionId` may never acquire one later; it is a different Flow. This is what makes G2's after-the-fact bridge impossible to recreate.

### 3.4 Allowed transitions

**Goal** — new machine, no existing implementation to preserve:

```
DRAFT → ACTIVE → { ACHIEVED | ABANDONED | SUPERSEDED }
ACTIVE ⇄ PAUSED
```
`SUPERSEDED` carries `supersededBy: GoalId` — the only way a Goal ends without a verdict.

**Mission** — the existing five states (`mission-types.ts:13`) are kept verbatim; only the *edges* are declared, since today nothing enforces them:

```
pending → active → { completed | failed | cancelled }
pending → cancelled
active  → cancelled
```
Terminal: `completed`, `failed`, `cancelled`. No edge leaves a terminal state.

**Flow** — the existing eleven states (`run-flow-contract.ts:46`) are kept verbatim, and the existing terminal-absorption rule is the model for all other entities.

**Run** — new machine, derived from what the two recovery adapters (G4) already agree on:

```
ADMITTED → RUNNING → { COMPLETED | FAILED | CANCELLED | BLOCKED }
RUNNING  → DETACHED_RUNNING → { COMPLETED | FAILED | CANCELLED | BLOCKED }
any      → UNKNOWN            (recovery-only, never a writer's choice)
```
`UNKNOWN` is honest, not terminal-by-fiat: it means *no evidence*, and it is the only state a recovery reader may write. Precedent: `StartAttemptState.UNKNOWN` is already listed among the terminal set at `run-flow-contract.ts:215`.

**WorkItem** — existing six states (`mission-types.ts:17`), edges declared:

```
pending → running → { done | failed }
pending → { blocked | parked }
blocked → pending          (dependency satisfied)
parked  → pending          (approval allowed / hold released)
running → parked           (host HOLD mid-flight — precedent: dispatchDisposition, mission-types.ts:71)
```
Terminal: `done`, `failed`. `blocked` and `parked` are explicitly **not** terminal — that distinction is load-bearing for the approval path (`WorkItemApprovalState`, `:21`).

**Attempt** — the A-1 machine, generalised to both sub-kinds:

```
PREPARED → PROCESS_SPAWNED → ADMITTED → { COMPLETED | FAILED | CANCELLED | BLOCKED }
PREPARED → { FAILED | CANCELLED | BLOCKED }
any      → UNKNOWN         (recovery-only)
```
A dispatch attempt (A-2) maps onto the same states: `claimed` = `ADMITTED`, fence-revoked = `CANCELLED`, crash-takeover = `UNKNOWN`.

**Operation** — no instance machine. A catalog entry is created or its `version` increments; entries are never mutated in place.

### 3.5 Invariants

| # | Invariant | Enforced where (proposed) |
|---|---|---|
| I1 | Every canonical row carries `tenantId`, and no edge in its lineage envelope points to a different tenant | Store-level check at write; identifier form makes violation visible |
| I2 | An ownership edge is set at insert and is immutable thereafter | Column-level: no `UPDATE` path touches lineage columns |
| I3 | No transition leaves a terminal state | One shared reducer guard, modelled on the existing RunFlow reducer |
| I4 | A parent may not reach a terminal state while a child attempt is active | Settlement-time check; today only the fence approximates this |
| I5 | At most one `Attempt` per parent is in an active state | Fence token + `revision` CAS — already true for A-2, not for A-1 across stores |
| I6 | Every `Attempt` carries a resolvable `operationRef`; an unknown operation fails closed | `UnknownOperationError` already exists (`operation-catalog/index.ts:98`) — this invariant just makes it reachable |
| I7 | An `Attempt`'s effective gate is at least the operation's `EFFECT_MIN_GATE`; no silent downgrade | Already structurally enforced inside the catalog; extend to the attempt |
| I8 | `attemptId` is unique across **both** sub-kinds and both stores | Single mint function; §7 D3 |
| I9 | A reader that meets a `schemaVersion` newer than it supports refuses, and never degrades silently | Precedent verbatim: `run-flow-store.ts:342` |
| I10 | Absence of evidence is a typed `UNKNOWN`/`HOLD`, never an inferred success or failure | Already the house rule (`TerminalJobClosure` skips incomplete records rather than guessing) |
| I11 | Entity kind names and state names are stable English keys, never localized; user-facing labels resolve through `getMessage` | Precedent verbatim: `FlowStepRecord`'s channel-2 contract (`flow-reporter.ts:15`) |
| I12 | The ontology module lives in `src/core/` and imports nothing from `src/orchestra/`, `cli/`, `api/`, `mcp/` | ADR-D-004 C1; the `core/ → orchestra/` edge is the one already scanned |

### 3.6 Versioning

Three independent version axes, and conflating them is how a migration breaks a running lifecycle:

1. **`ontologyVersion`** — the entity set and their edges. Changes when an entity is added, demoted or re-parented. A single integer, pinned in one `core/` module.
2. **`schemaVersion`** — per persisted envelope, per entity kind. Precedent: `RUN_FLOW_STORE_SCHEMA_VERSION = 3` (`run-flow-store.ts:51`), `MissionDependencyAuthorityV1.schemaVersion` (`mission-types.ts:25`).
3. **`version`** — per Operation catalog entry, already implemented.

**Reader rule (from I9):** *older* is upgraded on read; *newer* is refused with a typed error. **Writer rule:** a writer emits exactly one schema version per envelope and never mixes shapes within a transaction.

---

## 4. Collision resolution — a route for every name

The task's NO-GO condition is "an ontology that renames without a migration route". Every row below therefore carries a route. Three route kinds are used, and no fourth:

- **ALIAS-THEN-RETIRE** (type-level, zero runtime cost): the canonical name becomes the primary export; the old name remains in the same module as a deprecated type alias; call sites flip package by package; a lint gate then forbids the alias; the alias is deleted. Nothing observable changes at any point.
- **EXPAND-CONTRACT** (persisted data): add the new column/field → dual-write both → backfill → flip readers → stop writing the old → drop. Five deploys, and a running lifecycle is readable at every one.
- **KEEP-AND-NARROW**: the name stays, its *meaning* is narrowed by documentation plus a type-level guard, and the meanings it loses go to new names.

| # | Today | Canonical | Route | Compatibility mechanism | Retirement gate |
|---|---|---|---|---|---|
| C1 | `ScheduledFlow` (F-A) | `Schedule` | ALIAS-THEN-RETIRE | `export type ScheduledFlow = Schedule` in `src/core/scheduled-flow.ts`; the orchestra re-export at `autonomous/scheduled-flow.ts:13` re-exports both | Zero remaining imports of the alias, asserted by a lint script |
| C2 | `FlowRegistry` / `FlowScheduler` / `FlowRuntime` / `DueFlow` | `ScheduleRegistry` / `ScheduleScheduler` → **`ScheduleTicker`** / `ScheduleRuntime` / `DueSchedule` | ALIAS-THEN-RETIRE | Class aliases; `flows:` parameter names renamed only at the same commit as the type | Same as C1 |
| C3 | `RunFlowState` and the `RunFlow*` family (F-B) | **Unchanged** — this is the canonical `Flow` | KEEP-AND-NARROW | None needed | — |
| C4 | `FlowNotFoundError` (`run-flow-coordinator.ts:152`) | `RunFlowNotFoundError` | ALIAS-THEN-RETIRE | Subclass alias preserving `instanceof` for existing catch sites | No remaining references to the bare name |
| C5 | `FlowStep` / `FlowStepRecord` / `FlowReporter` (F-C) | `TraceStep` / `TraceStepRecord` / `TraceReporter` | ALIAS-THEN-RETIRE | Type aliases. **The nine string values are not touched** — they are persisted in audit records, and renaming a persisted value is an EXPAND-CONTRACT, not a rename | i18n keys `autonomous.flow_*` migrate on a separate, later slice — see D5 |
| C6 | `golden-flow.ts` (F-D) | `golden-choreography` | ALIAS-THEN-RETIRE, file-level | Module keeps its path; exported symbols gain the `Choreography` prefix with aliases | No remaining alias imports |
| C7 | `RunHandle` declared twice (`run-flow-contract.ts:188`, `run-job-service.ts:53`) | One `RunRef` in `core/` | KEEP-AND-NARROW then converge | The duplicate exists solely to stay off a test allowlist, per its own comment — so the route is: add the allowlist entry first, then delete the duplicate. **The allowlist file is outside this task's write scope**; this is recorded as a `docImpact`, not performed | Duplicate deleted |
| C8 | A-1 `StartAttemptRecord` | `Attempt` with `kind: 'start'` | EXPAND-CONTRACT | Add `kind` column defaulting to `'start'`; existing rows are already correct | Readers filter on `kind` |
| C9 | A-2 `MissionDispatchClaim` | `Attempt` with `kind: 'dispatch'` | EXPAND-CONTRACT | Claim columns on `work_items` stay; a lineage row is dual-written | Lineage table is authoritative for joins |
| C10 | A-3, A-4, A-5, A-9 (records *about* attempts) | `…AttemptObservation` / `…AttemptRef` — suffix, not `Attempt` | ALIAS-THEN-RETIRE | Type aliases; **each gains a mandatory `attemptId` foreign key** it can be joined on | Every observation resolves to exactly one attempt |
| C11 | A-6, A-7, A-8 (sub-decisions *inside* an attempt) | `…Decision` / `…Hop` | ALIAS-THEN-RETIRE | Type aliases | — |
| C12 | `GoalMissionSpec` blob | `Goal` entity + `Mission.goalId` | EXPAND-CONTRACT | `Mission.spec.goal` keeps being written and read for the whole window; the new `goals` table is populated *from* it; readers flip last | Blob read path deleted only after every reader is on `goalId` |
| C13 | `Sprint` / `Task` | See D7 — **no route is proposed without the owner decision** | — | — | — |

**The one rename this document refuses to propose.** `WorkItemKind` already contains `'sprint'` and `'task'` (`mission-types.ts:16`). Making `Sprint` *be* a WorkItem is the largest structural change available and it is the one with the least evidence in this task's read scope — the sprint controller, the planner and the task files were not read. It is D7, an owner decision, not a route.

---

## 5. Mapping the canonical chain onto the existing stores

| Canonical entity | Store today | Anchor | Transaction domain | Gap |
|---|---|---|---|---|
| Goal | **none** — JSON inside `missions.spec` | `mission-types.ts:76` (`spec: Record<string, unknown> \| null`) | autonomous.db | No row, no status, no index, no query |
| Mission | `missions` table | `sqlite-mission-store.ts:369-371` → `.deckent/autonomous/autonomous.db`, WAL, `foreign_keys = ON` | autonomous.db | No `goal_id` column |
| Flow | `run-flow-authority.sqlite` | `run-flow-store.ts:258`, `:262`; schema v3 at `:51` | **run-flow db** | No `mission_id` column |
| Run | `.deckent/runtime/jobs/*.json` | `constants.ts:26`; reader `run-jobs-read.ts` | **filesystem, no transaction** | Not a journal; tolerant-read by design; a do-origin flow has no durable event log at all |
| WorkItem | `work_items` table | `mission-types.ts:89`; columns added defensively at `sqlite-mission-store.ts:377-382` | autonomous.db | No `flow_id`/`run_id` |
| Attempt (start) | start-attempt journal | `run-flow-store.ts` (`PrepareStartAttempt*` `:144`–`:215`) | run-flow db | Disjoint id space from dispatch |
| Attempt (dispatch) | `work_items` claim columns + `mission_dispatch_recoveries` | `sqlite-mission-store.ts:381-382`, `:410` | autonomous.db | Disjoint id space from start |
| Operation | `catalog.v1.json` | `operation-catalog/index.ts` | none — memoized read | **One consumer** inside `src/core` + `src/orchestra`: `src/core/capability-runtime.ts`. No entity references it |
| Sprint / Task | `.tasks/*` + sprint state | `constants.ts:14` (`TASKS_DIR`), `SPRINTS_DIR` `:99` | filesystem | Tenant-blind (G3) |

### 5.1 The structural consequence: the chain spans four transaction domains

`autonomous.db` · `run-flow-authority.sqlite` · `.deckent/runtime/jobs/` · `.tasks/`. **There is no distributed transaction, and this document does not propose inventing one.**

The repo already contains the right answer to this and it should be generalised rather than replaced: a **durable saga inbox**. `MissionStore.listPendingDispatchRecoveries()` plus `acknowledgeDispatchRecovery()` (`mission-types.ts:190` onward) implements exactly this — the acknowledgement is written "only after receipt truth reaches a terminal head", it is first-writer-wins, and it is explicitly documented as a "durable cross-database saga inbox".

**Proposal:** the canonical chain is joined by a **lineage table**, not by foreign keys.

- One append-only `lineage` table in `autonomous.db`, one row per `(entityKind, entityId)`, carrying the `LineageV1` envelope of §3.3.
- Cross-domain edges are **claims plus evidence**, never enforced constraints: a Flow row asserts its `missionId`; the lineage table records the assertion and the evidence reference; a reconciler proves or refutes it.
- `foreign_keys = ON` stays within a single domain, where it is real.

This respects the existing engineering rather than overruling it, and it is the only shape in which G1 can be closed without a two-phase commit across a SQLite file and a directory of JSON.

---

## 6. Migration — admission-sized packages

**The binding rule.** A package may not require any running lifecycle to stop. Concretely, each package must satisfy all five:

1. **Expand-only at deploy.** No column drop, no value rewrite, no state-name change in the same deploy that introduces a reader.
2. **Readers before writers.** Every reader understands the new shape before any writer stops emitting the old one.
3. **Terminal-safe.** A row that is already terminal is never rewritten by a migration — it is the audit record.
4. **Lease-aware.** A migration step that mutates `autonomous.db` runs only while holding the engine lease (`MissionEngineLease`, `mission-types.ts:149`), or not at all. It never races the singleton engine.
5. **Reversible for one release.** Until the contract step, the previous release can still read the tree.

A package that cannot satisfy all five is not admission-sized and must be split.

| P | Package | Type | Depends on | Touches a running lifecycle? |
|---|---|---|---|---|
| **P0** | **Ontology registry** — one `src/core/` module declaring entity kinds, states, edges, reserved counter names, `ontologyVersion`. Pure data + type guards. No consumer. | Additive, zero-risk | — | No |
| **P1** | **Lineage envelope, dual-write** — `lineage` table + `LineageV1`; every new row also writes a lineage row; `legacyId` mapping populated. Nothing reads it yet. | Expand | P0 | No — writes only |
| **P2** | **Operation binding** — every Attempt write carries `operationRef`; unknown id fails closed via the existing `UnknownOperationError`. Backfill existing attempts to a typed `operation: 'unknown-legacy'` entry rather than guessing. | Expand | P0, P1 | No — the fail-closed path is new-writes-only in this package |
| **P3** | **Flow-noun disambiguation, alias stage** — C1, C2, C4, C5 (types only), C6. Type-level; zero runtime behaviour change. | Alias | P0 | No |
| **P4** | **Attempt identity-space unification** — one mint function, `kind: 'start' \| 'dispatch'`, I8 asserted by a store-level uniqueness check across both domains via the lineage table. | Expand | P1 | **Yes, carefully** — new attempts only; in-flight attempts keep their existing ids, which the lineage table adopts |
| **P5** | **Goal promotion** — C12. `goals` table; `Mission.goalId` added; spec blob still written and read. | Expand | P1 | No |
| **P6** | **Run promotion** — the jobs-dir gains a journalled twin; `run-jobs-read` keeps its tolerant read as the compatibility projection, exactly as `run-flow-store` already treats its JSONL files ("compatibility projections only… never consulted by public reads after migration"). | Expand | P1 | **Yes** — a detached run is by definition in flight; the journal is written alongside, never instead |
| **P7** | **Sprint/Task reconciliation** — **BLOCKED on D7.** No design is proposed here. | — | D7 | Would be the largest |
| **P8** | **Reader flip + contract** — readers move to lineage; old paths stop being written; aliases retired behind a lint gate; C10/C11 suffixes land. | Contract | P1–P6 | No, if 1–5 held |

**Ordering constraint that is easy to get wrong:** P4 must precede P8 but must *follow* P1, because unifying the identity space without a lineage table to record the adoption would leave in-flight attempts unjoinable — exactly the failure the migration exists to prevent.

**What is deliberately not in any package:** renaming persisted state *values* (`picked`, `spawned`, `pending`, `running`). Those appear in audit records and receipts. They are a separate EXPAND-CONTRACT with its own owner decision (D5), and folding them into P3 would turn a zero-risk type alias into a data migration.

---

## 7. Owner decision points

Each is stated with options and a recommendation. None is decided here.

**D1 — Is `Goal` an entity, or does it stay a spec blob?**
Options: (a) promote to a table (P5); (b) keep the blob and add only a typed accessor; (c) promote but keep it in `autonomous.db` rather than a new store.
*Recommendation: (a) via (c) — same database, so P5 needs no cross-domain saga.*
Cost of (b): `Mission.goalId` stays impossible, and G1 cannot close.

**D2 — Does `Flow` reference `Mission`, or does `Mission` reference `Flow`?**
The chain says Mission owns Flow. The stores say otherwise: Flow lives in its own database and embeds a whole `Sprint`.
Options: (a) `Flow.missionId` claim + lineage evidence; (b) `Mission` holds a flow list; (c) neither — the lineage table alone carries the edge.
*Recommendation: (a). It matches the "edge set at birth, immutable" rule (I2); (b) makes the Mission row mutable per flow.*

**D3 — Is `attemptId` one identity space or two? (I8)**
This is the single highest-value decision in the document, because every usage, cost, settlement and recovery join depends on the answer, and **no code currently states it either way**.
Options: (a) one global space, one mint function; (b) two spaces with a mandatory `attemptKind` discriminator on every reference; (c) status quo — undeclared.
*Recommendation: (a). (b) doubles every join key; (c) is the current cost.*

**D4 — May a `Run` outlive its `Flow`'s terminal state?**
Today a detached run can be alive while nothing observes it, and `run-jobs-read` reconstructs closure after the fact.
Options: (a) no — a Flow may not settle while a Run is active (I4 strictly); (b) yes, with a mandatory `UNKNOWN` reconciliation; (c) yes, unconstrained.
*Recommendation: (b). (a) is correct in theory and would block settlement on an unreachable process; (b) keeps honesty without a deadlock.*

**D5 — When do persisted state *values* get renamed, if ever?**
Options: (a) never — the strings are audit truth; (b) EXPAND-CONTRACT in a dedicated later package; (c) with P3.
*Recommendation: (a) for the nine `FlowStep` values and (b) only if a real reader needs it. (c) is a NO-GO — it converts a type alias into a data migration.*

**D6 — Does the `Operation` catalog become mandatory on every Attempt (I6/I7), and what happens to the backfill?**
Options: (a) mandatory for new writes, legacy backfilled to a typed `unknown-legacy` entry; (b) mandatory everywhere, backfill by inference; (c) advisory.
*Recommendation: (a). (b) manufactures authority the evidence does not support — inferring an operation's gate is exactly the silent downgrade `EFFECT_MIN_GATE` exists to prevent.*

**D7 — Do `Sprint` and `Task` become `WorkItem` kinds?**
`WorkItemKind` already lists `'sprint'` and `'task'`.
Options: (a) yes — one work model, one store, tenant-scoped (closes G3); (b) no — they stay a parallel chain joined only by lineage; (c) defer until the ontology registry (P0–P2) has shipped and proved itself.
*Recommendation: (c). This task's read scope did not include the sprint controller, the planner or the task-file protocol, and a recommendation without that evidence would be an unanchored claim.*

**D8 — Where does the ontology registry live, and what enforces I12?**
Options: (a) `src/core/ontology/`, ADR-D-004 C1 enforced by the existing `core/ → orchestra/` scan; (b) a new top-level directory; (c) inside an existing module.
*Recommendation: (a). It reuses the one import edge that is already mechanically scanned.*

**D9 — Does this ontology get its own ADR?**
The entity set, the identity form and the reserved counter names are exactly the class of thing the ADR family exists to freeze.
Options: (a) a new ADR-D that binds §3.1–§3.6; (b) an amendment to an existing ADR; (c) documentation only.
*Recommendation: (a). Under (c), the next module invents a tenth `Attempt`.*

---

## 8. What this document does not decide

- The Sprint/Task reconciliation (D7) — deliberately unresolved, for lack of in-scope evidence.
- Any persisted-value rename (D5).
- The test allowlist entry that C7 requires: the allowlist lives in a test file outside this task's write scope, so C7 names the prerequisite instead of performing it.
- Whether the `Run` journal is a new store or a table in an existing one (P6 states the shape, not the placement).
- i18n key migration for `autonomous.flow_*` — named in C5, sequenced behind D5.

---

## 9. How to falsify this document

Every claim above is a read, and every read is reproducible inside this task's scope:

| Claim | Falsify by |
|---|---|
| Four `Flow` senses | Open `src/core/scheduled-flow.ts:11`, `src/core/run-flow-contract.ts:46`, `src/orchestra/autonomous/flow-reporter.ts:9`, `src/orchestra/golden-flow.ts:1` |
| Nine `Attempt` senses | The nine anchors in §2.2 |
| `WorkItem.missionId` is the only typed chain edge | Search `goalId`, `missionId`, `flowId`, `runId` as *field declarations* across `mission-types.ts`, `run-flow-contract.ts`, `sprint-types.ts`, `task-types.ts` |
| No entity carries `operationId` | Search `operationId` in those same four files — it returns nothing |
| Sprint/Task are tenant-blind | Search `tenant` in `src/core/sprint-types.ts` and `src/core/task-types.ts` — it returns nothing |
| Operation has one in-scope consumer | Search `operation-catalog` under `src/core` and `src/orchestra` — `src/core/capability-runtime.ts` is the only importer besides the module itself |
| Two duplicate recovery adapters | `src/orchestra/recovery-adapters/run-flow-recovery-adapter.ts:8` vs `run-job-recovery-adapter.ts:8` |

**Scope honesty.** This inventory covers `src/core/` and `src/orchestra/`, which is this task's read scope. `src/cli/`, `src/api/`, `src/mcp/`, `src/agents/` and `src/dashboard/` were **not** inventoried, so the collision counts in §2 are **lower bounds**, not totals. Any claim in §3–§7 that depends on a surface outside that scope is marked as a decision point rather than asserted — this is why C7 and D7 name their prerequisites instead of proposing routes.
