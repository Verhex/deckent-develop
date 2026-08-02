# Lifecycle internals

## Product-user perspective

Deckent turns an intent into controlled execution through two related models. The product model is `Goal → Mission → Flow → Run → WorkItem → Attempt → Operation`; the sprint engine is the current repository implementation used to plan, dispatch, evaluate, repair, and settle work. The normalized work model exists, but its header explicitly says it is not fully adopted by consumers, so this document does not claim that every sprint object is already a native `Run`/`WorkItem` projection. [Evidence: `.deckent/workspace/IDENTITY.md:7`; `src/core/work-model.ts:1-12,140-186`; OQ-06]

### Before execution

1. `plan` reads `DIRECTIVES.md` or an explicit prompt, constructs tasks, applies prompt/scope gates, and can stop at `--dry-run`. [Evidence: `src/cli/commands/plan.ts:121-205,253-254,367-461`]
2. `start` resolves config and provider authority, adopts the approved plan, checks doctor/scope/prompt gates, then delegates to the sprint controller. [Evidence: `src/cli/commands/start.ts:246-403,518-778`]
3. An exact-plan run requires the preplanned sprint, materialization hook, and execution-admission hook; partial exact-plan wiring is rejected. [Evidence: `src/orchestra/sprint-controller.ts:1594-1621`]

`deckent plan --help` and `deckent start --help` were run successfully against the built binary. Execution was not started because this documentation task explicitly forbids sprint/run/autonomous commands. [Evidence: recursive real-binary help audit, 2026-08-01; OQ-20]

### Archived lifecycle plans, rechecked

The 38 archived `superpowers/` sprint/recovery plans and design specs are dated implementation provenance, not current operating authority. Their assumptions about MCP-started sprints, provider choice in instruction text, tmux-first execution, or manual workflow steps are superseded by the repository contract: lifecycle execution is CLI-led, provider/backend/concurrency are effective-config decisions, and completion requires settlement plus disk evidence. The target lifecycle below is therefore source-derived and `⚠️ partial` wherever current code, vocabulary, or certification remains incomplete; an archived plan's “done” marker is not proof of live wiring. [Evidence: read-only archive filename inventory, 2026-08-02; `AGENTS.md:42-69`; `src/cli/commands/start.ts:246-403,518-778`; `src/orchestra/sprint-controller.ts:1594-2951`]

### The eight implementation phases

| Phase | Product meaning | Current implementation boundary |
|---|---|---|
| PLAN | Convert directives or a description into bounded tasks. | Plan creation, prompt gate, scope gate, baseline capture, routing. [Evidence: `src/orchestra/sprint-controller.ts:1889-2115`] |
| SPAWN | Admit attempts and start workers under resolved provider/backend authority. | Initial worker spawning and transition to active execution. [Evidence: `src/orchestra/sprint-controller.ts:2115-2205`; `src/orchestra/sprint-phases.ts:1164-1248`] |
| EXECUTE | Observe workers, collect result artifacts, refill capacity, and handle timeouts. | Controller delegates result collection and tracks exact attempt state. [Evidence: `src/orchestra/sprint-controller.ts:1057-1378,2203-2486`] |
| EVALUATE | Compare work with criteria and evidence; produce GO/NO_GO. | Evaluation is idempotency-guarded and writes task state. [Evidence: `src/orchestra/sprint-phases.ts:1248-1728`] |
| FIX | Create eligible repair attempts without treating a failed claim as completion. | FIX sets `SprintPhase.FIX`, routes repairs, and can pause on incomplete authority. [Evidence: `src/orchestra/sprint-controller.ts:2665-2859`; `src/orchestra/sprint-phases.ts:2723-3140`] |
| RETRO | Aggregate outcomes and durable learning. | `finalizeSprint` computes metrics, events, retrospective data, and managed projections. [Evidence: `src/orchestra/sprint-finalizer.ts:2185-2355`] |
| DECAY | Apply retention and memory-budget policy. | A standalone decay function exists and is also part of finalization. [Evidence: `src/orchestra/sprint-phases.ts:3949-4168`] |
| CLEANUP | Remove or retain owned runtime artifacts only after terminal receipt publication. | `runCleanupPhase` runs after a published terminal receipt; publication is claimed before final COMPLETE. [Evidence: `src/orchestra/sprint-controller.ts:2900-2940`; `src/orchestra/sprint-phases.ts:4170-4207`] |

The public enum does not contain `CLEANUP`; it contains `DIRECTIVE`, `TRANSITION`, and `COMPLETE`. Source comments describe phase eight both as CLEANUP and as a lifecycle ending in COMPLETE. This naming authority is unresolved and is tracked as OQ-04. [Evidence: `src/core/sprint-types.ts:9-20`; `src/orchestra/sprint-controller.ts:1594-1596,2912-2934`]

### Attempts, dependencies, and capacity

A task is not equivalent to an attempt. Invocation receipts carry role, purpose, selected/called provider and model, transport/backend, attempt identity, timing, evidence state, disposition, and reason codes. [Evidence: `src/core/invocation-receipt.ts:3-148`]

Dependencies constrain scheduling. The dependency scheduler and scheduler driver calculate runnable work, while scope-collision and system-capacity policy constrain safe parallelism; configured concurrency is only one input to admission. [Evidence: `src/orchestra/dependency-scheduler.ts`; `src/orchestra/scheduler-driver.ts`; `src/orchestra/scope-collision.ts`; `src/core/system-capacity.ts`]

`continuous_workers` is enabled in default config, but PAZARTESI records continuous slot refill as an unclosed stabilization item. Treat configured capability and certified end-to-end behavior as different facts. [Evidence: `src/core/config.ts:1640-1660`; `PAZARTESI.md:39-45`]

### Observation surfaces

Use `status`, `watch`, and `tasks` to inspect an active run; use `history`, `review`, and `retro` for persisted outcomes. `checkpoint`, `resume`, `recover`, `finalize`, and `cleanup` can mutate lifecycle state and are recovery/settlement operations, not passive viewers. [Evidence: `src/cli/index.ts:119-175`; real binary help for all named paths, 2026-08-01]

## Dogfood / repository reality

| Area | State | Repository truth |
|---|---|---|
| Controller and phase modules | ✅ live | Production entry points call the controller and phase implementations. [Evidence: `src/cli/commands/start.ts:518-778`; `src/orchestra/sprint-controller.ts:1598-2951`] |
| Exact-plan admission | ✅ live | Missing or mismatched exact-plan hooks raise typed Brain errors before execution. [Evidence: `src/orchestra/sprint-controller.ts:1604-1621`] |
| Canonical phase vocabulary | ⚠️ partial | Enum and source comments disagree; OQ-04 remains `HOLD`. |
| Normalized Goal→Operation adoption | ⚠️ partial | Types exist, but the module itself says consumer migration is incomplete; OQ-05/OQ-06 remain `HOLD`. |
| Continuous refill | ⚠️ partial | Config and code surface exist; live audit lists the end-to-end behavior as unclosed. [Evidence: `PAZARTESI.md:39-45`] |
| Autonomous certification | ⚠️ partial | The accepted audit records 0/31 intervention-free end-to-end successes and a seven-step certification ladder still outstanding. [Evidence: `PAZARTESI.md:36-58`] |

The operational acceptance condition is stronger than “process exited zero”: terminal status, per-task result, gate, summary, receipt, and disk evidence must agree. [Evidence: `AGENTS.md:42-55`; `PAZARTESI.md:54-60`]
