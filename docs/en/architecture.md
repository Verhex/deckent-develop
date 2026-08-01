# Architecture

## Product-user perspective

### Authority chain

Deckent's product authority is ordered as follows. Higher-level objects explain **why** work exists; lower-level objects make **how it ran** reproducible and auditable. [Evidence: `.deckent/workspace/IDENTITY.md:7`; `docs/MASTER-PLAN.md:25-31`]

| Level | Contract | Current code evidence |
|---|---|---|
| Goal | Desired outcome and acceptance boundary. | A durable mission may have `kind: 'goal'`; goal planning is implemented in the autonomous mission modules. `src/orchestra/autonomous/mission-store/mission-types.ts:12-19,76-88` |
| Mission | Durable container for an outcome, ownership, progress, and terminal result. | `Mission` and `NewMission`. `src/orchestra/autonomous/mission-store/mission-types.ts:76-88` |
| Flow | Revisioned proposal/approval/start state machine, bound by digests. | `RunFlowState`, `RunProposal`, `PlanPreview`, and `ApprovedPlanSnapshot`. `src/core/run-flow-contract.ts:37-69,73-149` |
| Run | One admitted lifecycle execution of a plan. | The established runtime object is still named `Sprint`; it carries status, phase, tasks, workers, timestamps, and proof. `src/core/sprint-types.ts:62-90` |
| WorkItem | Durable schedulable unit with kind, policy, dependencies, claim, and result. | `WorkItem` and `NewWorkItem`. `src/orchestra/autonomous/mission-store/mission-types.ts:89-104` |
| Attempt | One exact claim/execution try for a WorkItem or logical task. | Mission claims carry `attemptId` and fence identity; task lineage folds repair attempts. `src/orchestra/autonomous/mission-store/mission-types.ts:134-147`; `src/core/task-lineage.ts:218-254` |
| Operation | Lowest auditable provider/tool/side-effect unit under an Attempt. | The source contains several operation-shaped contracts but no single canonical execution-operation authority type. This is a documented `HOLD`, not an inferred implementation. `src/core/routing-types.ts`; `src/core/invocation-receipt.ts`; `docs/analysis/OPEN-QUESTIONS-2026-08.md` |

The chain above is the target semantic model. Current implementation names and ownership boundaries are fragmented, so adapters must not manufacture missing identity links. [Evidence: `src/core/work-model.ts:1-12`; `src/core/sprint-types.ts:62-90`; `src/orchestra/autonomous/mission-store/mission-types.ts:76-147`]

### Eight-phase lifecycle

The controller's executable path is:

`PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP`

| Phase | Responsibility | Source |
|---|---|---|
| PLAN | Materialize and gate the plan; establish exact plan authority when requested. | `src/orchestra/sprint-controller.ts:1889-2131` |
| SPAWN | Admit routes and start eligible workers. | `src/orchestra/sprint-controller.ts:2132-2202` |
| EXECUTE | Collect worker execution and result evidence. | `src/orchestra/sprint-controller.ts:2203-2488`; `src/orchestra/result-collector.ts` |
| EVALUATE | Judge results with Brain/evidence contracts. | `src/orchestra/sprint-controller.ts:2489-2666` |
| FIX | Create and execute bounded repair attempts for failed work. | `src/orchestra/sprint-controller.ts:2667-2861`; `src/core/task-lineage.ts:218-330` |
| RETRO | Produce retrospective and settlement evidence. | `src/orchestra/sprint-controller.ts:2862-2911`; `src/orchestra/sprint-phases.ts:3949-4155` |
| DECAY | Apply memory/debt decay in the terminalization path. | `src/orchestra/sprint-phases.ts:3949-4169` |
| CLEANUP | Clean runtime artifacts only after a published terminal receipt. | `src/orchestra/sprint-controller.ts:2912-2934`; `src/orchestra/sprint-phases.ts:4170-4207` |

`SprintPhase` also contains `DIRECTIVE`, `TRANSITION`, and terminal `COMPLETE`, but no `CLEANUP` member. In addition, the `runSprint` doc comment calls `COMPLETE` the eighth phase and says cleanup is separate, while the executable path labels and invokes cleanup as Phase 8. Documentation therefore follows the executed controller path and records the naming contradiction for resolution. [Evidence: `src/core/sprint-types.ts:9-20`; `src/orchestra/sprint-controller.ts:1594-1596,2912-2934`; `src/orchestra/sprint-phases.ts:4170-4207`]

### Source map

This map was derived from the present `src/` tree, not from the previous documentation. [Evidence: command `find src -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort`, 2026-08-01]

| Directory | Responsibility and load-bearing evidence |
|---|---|
| `agent/` | Native/host agent loop and tool-use policy. `src/agent/loop.ts`, `src/agent/tools/registry.ts`, `src/agent/permission-policy.ts` |
| `agents/` | Worker execution, scope enforcement, heartbeat, logs, and agent evolution. `src/agents/worker.ts`, `src/agents/permission-guard.ts`, `src/agents/worker-lifecycle.ts` |
| `api/` | HTTP API, routes, SSE, middleware, and rate limiting. `src/api/server.ts`, `src/api/run-flow-routes.ts`, `src/api/middleware/token.ts` |
| `cli/` | Commander entry point, commands, output, i18n helpers, and interactive surfaces. `src/cli/index.ts`, `src/cli/entry.ts`, `src/cli/helpers/messages.ts` |
| `connectors/` | Messaging adapters, identity, and project-scoped gateway/session integration. `src/connectors/connector-bootstrap.ts`, `src/connectors/gateway/`, `src/connectors/identity/` |
| `core/` | Shared contracts and services: config, work types, registry, routing, memory, approvals, receipts, and durable stores. `src/core/config.ts`, `src/core/work-model.ts`, `src/core/model-registry.ts`, `src/core/memory-store.ts` |
| `dashboard/` | React/Vite observability projection. `src/dashboard/src/` |
| `desktop/` | Native Desktop host and adapters over runtime authority. `src/desktop/` |
| `extensions/` | Editor integrations, currently including VS Code. `src/extensions/vscode/` |
| `mcp/` | MCP stdio server, 49 tool registrations, and resources. `src/mcp/server.ts`, `src/mcp/tools/index.ts`, `src/mcp/resources/` |
| `mcp-client/` | Client-side MCP transport/integration. `src/mcp-client/` |
| `monitor/` | Auditor scans, sprint-state tracking, and dashboard projection management. `src/monitor/auditor.ts`, `src/monitor/sprint-state.ts` |
| `nervous/` | Proactive detection, recommendation, and governed action proposal. `src/nervous/bootstrap.ts`, `src/nervous/detector-registry.ts`, `src/nervous/detectors/` |
| `orchestra/` | Planning, lifecycle control, routing, evaluation, repair, retrospective, and autonomous mission execution. `src/orchestra/sprint-controller.ts`, `src/orchestra/planner.ts`, `src/orchestra/result-evaluator.ts` |
| `providers/` | Provider-neutral runtime contracts and provider adapters. `src/providers/provider.ts`, `src/providers/claude.ts`, `src/providers/codex.ts`, `src/providers/gemini.ts` |
| `sdk/` | Programmatic SDK surface. `src/sdk/` |
| `training/` | Training-trace capture and projection. `src/training/` |

`src/index.ts` is the package-level export surface. [Evidence: `src/index.ts`]

### Cross-cutting authority rules

- Surfaces are adapters; they must converge on shared application-service behavior rather than reimplement it. [Evidence: `.deckent/workspace/IDENTITY.md:8`; archived ADR authority `docs/archive/docs-pre-reset-2026-08-03/adr/adr-g-011-surface-parity-thin-wrapper.md`]
- Configuration resolves before provider/model/worker admission. [Evidence: `.deckent/workspace/IDENTITY.md:10`; `src/core/config.ts:1864-2021`]
- Durable state is split by responsibility across memory, mission, identity, invocation receipt, provider observation, and run-flow stores. [Evidence: actual read-only `PRAGMA table_info` inventory, 2026-08-01; `docs/en/db.md`]
- Dashboard state is a projection and cannot become execution authority. [Evidence: `.deckent/workspace/IDENTITY.md:9`]

## Dogfood / repository reality

| Architecture boundary | State | Current constraint |
|---|---|---|
| Source ownership map | ✅ live | Current top-level source directories and load-bearing modules were inventoried from disk. |
| Sprint lifecycle implementation | ✅ live | Controller wires PLAN through terminal cleanup/publication. |
| Phase vocabulary | ⚠️ HOLD | Enum and executed/comment vocabularies disagree (OQ-04). |
| Goal→Operation normalization | ⚠️ partial | Mission, RunFlow, Sprint/Task and receipt contracts exist, but one canonical graph is not fully adopted (OQ-05/OQ-06). |
| Surface thin wrappers | ⚠️ partial | CLI/MCP behavioral gaps are confirmed in the difference report. [Evidence: `docs/analysis/CODE-DOC-DIFF-2026-08.md`] |
| Dashboard authority | ✅ bounded | Identity explicitly limits it to observability projection. |
