# Glossary

## Product-user perspective

This glossary defines Deckent terms against current code and repository contracts. It deliberately keeps distinct concepts distinct—for example, a `Task` is not an `Attempt`, a dashboard is not state authority, and a provider is not product identity. [Evidence: `.deckent/workspace/IDENTITY.md:3-18`; `src/core/task-result-schema.ts:238-291`]

| Term | Current definition | Evidence |
|---|---|---|
| ADR | Architecture Decision Record stored as an ADR entry in DB-first memory; Markdown decisions output is generated. | `src/core/memory-types.ts:110-155`; `src/core/memory-export.ts:478-506` |
| Admission | A policy/capability/authority decision that permits an exact invocation or run to proceed. | `src/core/execution-admission.ts`; `src/core/provider-execution-ingress-authority.ts` |
| Agent | A persona selected for the kind of output a task needs; it is orthogonal to provider/model. | `src/core/agent-pool.ts:200-240`; `src/core/agent-role-contract.ts:6-31` |
| Approval | A typed decision over requester, scope, risk, tenant, expiry, and evidence—not a generic yes/no prompt. | `src/core/approval-contract.ts`; `src/core/approval-policy.ts:22-126` |
| Attempt | One exact execution of a work item, with identity, provider/model/backend, timing, disposition, and receipt. | `src/core/invocation-receipt.ts:3-148`; `src/core/task-result-schema.ts:238-259` |
| Auditor | The orchestration role that observes, verifies, gates, and emits audit findings without owning source implementation. | `src/orchestra/authority-enforcer.ts:174-213`; `src/monitor/auditor.ts` |
| Autonomous | The authority-bounded continuous goal loop exposed by the autonomous command namespace. | `src/cli/commands/autonomous.ts:1713`; `src/orchestra/autonomous-runtime.ts` |
| Backend | The execution mechanism selected for an invocation, such as host subprocess, Docker, tmux, API, or in-process. | `src/core/invocation-receipt.ts:21-29`; `src/orchestra/spawn-backend.ts` |
| Brain | The orchestration role responsible for planning, assignment, evaluation coordination, lifecycle, and managed learning—not a source-code worker. | `src/orchestra/authority-enforcer.ts:127-171`; `src/orchestra/brain.ts` |
| Capability | A typed non-code operation such as filesystem, database, ERP, network, approval, or MCP access. | `src/core/work-model.ts`; `src/core/capability-broker.ts:1-50` |
| Checkpoint | A durable lifecycle snapshot used to preview or resume interrupted work. | `src/orchestra/sprint-checkpoint.ts`; `src/cli/commands/checkpoint.ts`; `src/cli/commands/resume.ts` |
| Claim fence | Attempt/ownership evidence that prevents stale or duplicate workers from settling another attempt's work. | `src/orchestra/autonomous/mission-store/mission-types.ts:260-280`; `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts:2364-2650`; `src/core/task-settlement-authority.ts` |
| CLI parity | The measured relationship between CLI command paths and MCP tools; parity is not assumed from similar names. | `scripts/lint-cli-mcp-parity.mjs`; `docs/en/mcp.md` |
| COMPLETE | A terminal sprint/run status that should be published only after outcome-shaping gates and receipt authority settle. | `src/core/sprint-types.ts:22-31`; `src/orchestra/sprint-controller.ts:2900-2938` |
| Config layer | One input to effective config: built-in defaults, global user config, or project config; merge/validation produces the runtime view. | `src/core/config.ts`; `docs/en/configuration.md` |
| Connector | A messaging or integration adapter such as Telegram, Discord, WhatsApp, or gateway; it is not a separate orchestration authority. | `.deckent/workspace/IDENTITY.md:8`; `src/connectors/` |
| Context | Data visible to an execution. It does not automatically grant write, approval, tenant, or provider authority. | `src/core/work-model.ts`; `src/core/approval-contract.ts` |
| Cross-verify / XVerify | Verification by a fresh provider different from the producer, resolved from live authority evidence. | `AGENTS.md:66-80`; `src/core/cross-verify-execution-contract.ts` |
| Dashboard | A read/observability projection; never the execution engine or state authority. | `.deckent/workspace/IDENTITY.md:8-9`; `src/dashboard/` |
| DECAY | The lifecycle phase/policy that applies memory and retention limits after retrospective work. | `src/orchestra/sprint-phases.ts:3949-4168` |
| DIRECTIVES.md | The active-run structured execution contract after higher-priority authorities. | `AGENTS.md:112-128`; `src/orchestra/task-builder.ts:1353` |
| Disk evidence | Host-computed, write-scope-limited tracked and untracked changes used to check worker claims. | `src/orchestra/disk-verify.ts:135-207` |
| Do / task mode | A direct user task surface that can construct bounded work without requiring the full manual sprint workflow. | `src/cli/commands/do.ts`; `src/orchestra/task-mode-runner.ts` |
| Dogfood | Using Deckent's own Goal/Mission/Flow/Run/Autonomous/Do surfaces to implement Deckent, with manual work restricted to typed recovery seams. | `AGENTS.md:75-79` |
| Effective config | The validated runtime result after layering config and resolving policy/provider facts; it is more authoritative than one config file. | `src/core/config.ts:1829-2230`; `docs/en/reference/configuration-schema.md` |
| Execution Posture | The exact resolved contract defining where an Attempt runs, how it sees the workspace, which effect/capability/secrets authority it has, and how its result lands. Direct, staged, isolated, brokered, and remote names may be presets; the exact contract is authority. | `.deckent/workspace/IDENTITY.md:32`; `docs/en/vision.md` |
| Execution realm | The host process, container, microVM, or remote-executor boundary inside an Execution Posture. Docker or Firecracker is a realm adapter, not product identity. | `src/orchestra/spawn-backend.ts`; `docs/en/vision.md` |
| Evidence reference | A durable identifier pointing to proof without embedding or reinterpreting the proof as authority. | `src/core/invocation-receipt.ts`; `src/core/task-settlement-authority.ts` |
| FIX | The repair phase/attempt path for eligible NO_GO work. | `src/orchestra/sprint-controller.ts:2665-2859` |
| Flow | A governed progression from proposal/preview/approval through run start and terminal states. | `src/core/run-flow-contract.ts:23-121,313-380` |
| GO / NO_GO | Evaluation verdicts indicating criteria accepted or rejected; neither is equivalent to process exit alone. | `src/core/task-types.ts`; `src/orchestra/result-evaluator.ts` |
| Goal | The top-level desired outcome in Deckent's execution-authority chain. | `.deckent/workspace/IDENTITY.md:7`; `src/orchestra/autonomous/mission-store/goal-mission.ts` |
| Heartbeat | A liveness signal tied to worker/run ownership and observed for stale or orphan state. | `src/core/worker-heartbeat-authority.ts`; `src/monitor/auditor.ts` |
| HOLD | A typed stop because authority, evidence, compatibility, or a required decision is unavailable; not a silent fallback. | `AGENTS.md:89-99,124-128`; `docs/analysis/OPEN-QUESTIONS-2026-08.md` |
| Immutable Law | One of the three constitutional constraints: DUAL LENS + SCALE, EVERY ENVIRONMENT, NEVER MVP. | `AGENTS.md:12-38` |
| Invocation receipt | Versioned proof of who/what was called, how it was resolved, and how the attempt ended. | `src/core/invocation-receipt.ts:3-148` |
| Learning loop | Outcome→evidence→routing→promotion→training-trace feedback named as Deckent's product moat. | `.deckent/workspace/IDENTITY.md:17` |
| MCP resource | A read-oriented URI projection registered by the MCP server; eight are currently registered. | `.deckent/workspace/IDENTITY.md:25-29`; `src/mcp/resources/index.ts` |
| MCP tool | A typed MCP action registration with input schema, handler, annotations, and an intended CLI relationship; 49 are canonical. | `src/mcp/tools/index.ts:54-177`; `docs/en/mcp.md` |
| Memory V2 | DB-first knowledge subsystem backed by `.brain/memory.db`, FTS/query, taxonomy, history, and generated exports. | `src/core/memory-store.ts`; `src/core/memory-query.ts`; `src/core/memory-export.ts` |
| Mission | The governed decomposition/context between a Goal and a Flow in the identity chain. | `.deckent/workspace/IDENTITY.md:7`; `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts` |
| Mode | A named configuration preset. It is distinct from output style and model effort. | `src/core/config.ts:1613-1784`; `src/cli/commands/mode.ts` |
| Model | A provider-served reasoning/execution model resolved through config, registry, capability, reachability, and authority evidence. | `.deckent/workspace/IDENTITY.md:10`; `src/core/model-registry.ts` |
| Model effort | Provider/model reasoning-effort setting recorded separately from task workload estimates. | `src/core/task-result-schema.ts:238-259`; `src/core/config.ts` |
| Nervous | Proactive observer/detector/decision/proposal layer; action remains policy and authority constrained. | `src/nervous/`; `src/core/nervous-types.ts` |
| Operation | The lowest authority-chain unit. A routing `OperationType` also exists; whether it is the canonical normalized Operation remains OQ-05. | `.deckent/workspace/IDENTITY.md:7`; `src/core/routing-types.ts:47-67`; OQ-05 |
| Outcome | The settled result used by evaluation, history, learning, routing, and promotion—not merely stdout. | `.deckent/workspace/IDENTITY.md:17`; `src/core/task-result-schema.ts` |
| Precedence | The ordered conflict rule from system/owner through laws, run rules, role procedures, and generated evidence. | `AGENTS.md:124-128` |
| Provider | A runtime adapter/backend; no provider is Deckent's product identity. | `.deckent/workspace/IDENTITY.md:3,10`; `src/providers/` |
| Provider authority | Live evidence that a provider/model/account may be called for a role/purpose under policy and budget. | `src/core/provider-authority-composition.ts`; `src/core/provider-execution-ingress-authority.ts` |
| Receipt | A general durable settlement/evidence record; invocation and terminal receipts have different scopes. | `src/core/invocation-receipt.ts`; `src/core/sprint-terminal-publication.ts` |
| REPL | Interactive terminal conversation/tool surface; local mode is now implemented despite a stale help description. | `src/cli/commands/chat.ts:277-471`; `docs/analysis/CODE-DOC-DIFF-2026-08.md` |
| RETRO | Lifecycle/read surface for outcomes, metrics, learning, and debt after execution. | `src/orchestra/sprint-finalizer.ts`; `src/cli/commands/retro.ts` |
| Route | Provider/model/agent/skill/backend selection constrained by policy and evidence. | `src/core/routing/route-task-v3.ts`; `src/orchestra/routing-plan-adapter.ts`; `src/orchestra/task-router.ts` |
| Run | A governed execution instance; current code also retains sprint terminology and a RunFlow state machine. | `.deckent/workspace/IDENTITY.md:7`; `src/core/run-flow-contract.ts`; OQ-14 |
| Scope | Declared read/write authority plus containment and collision constraints; context visibility is not write permission. | `src/core/task-types.ts`; `src/core/scope-gate.ts`; `src/core/tool-scope-gate.ts` |
| Settlement | The transition from claims/evidence/gates to an authoritative task or run outcome. | `src/core/task-settlement-authority.ts`; `src/orchestra/sprint-finalizer.ts` |
| Skill | A reusable instruction/capability package selected independently of the agent persona and provider. | `src/core/skill-pool.ts`; `docs/en/reference/skills.md` |
| Sprint | The current eight-phase orchestration implementation and compatibility vocabulary underlying parts of the Run surface. | `src/core/sprint-types.ts`; `src/orchestra/sprint-controller.ts` |
| SSOT | Single source of truth. Here, `docs/MASTER-PLAN.md` is work tracking SSOT; `.brain/memory.db` is product memory/ADR authority. | `AGENTS.md:112-114`; owner Tur-2 contract |
| Status projection | A read model derived from runtime state; it must not silently override canonical run/receipt authority. | `src/core/run-status-authority.ts`; `src/core/run-status-read-model.ts` |
| Task | Current sprint-engine unit carrying dependencies, scope, criteria, routing metadata, and status. | `src/core/task-types.ts` |
| TaskDNA | Derived routing description of intent, domain, operation and complexity signals. | `src/core/routing-types.ts:58-126`; `src/core/routing/route-task-v3.ts` |
| Terminal | Primary tool-driven management/use surface, distinct from the web dashboard projection. | `.deckent/workspace/IDENTITY.md:8-16`; `src/cli/commands/chat.ts`; `src/api/terminal/session-manager.ts` |
| Tenant | Validated isolation identity and async context rooted under `.deckent/tenants/<tenantId>`. | `src/core/tenant-context.ts:5-55,57-94` |
| Tier | Provider-neutral capability/cost class used as routing input; exact model selection remains config/registry-resolved. | `src/core/routing-types.ts`; `AGENTS.md:109-111` |
| Training trace | Durable evidence extracted from executions for the closed learning loop; its production wiring is a named direction item. | `.deckent/workspace/IDENTITY.md:17,30`; `src/orchestra/sprint-phases.ts:2536-2566`; `src/training/pipeline.ts` |
| Trinity | Assistant · Worker · Platform sharing one kernel, policy, evidence, and learning system. | `.deckent/workspace/IDENTITY.md:5` |
| WorkItem | Normalized unit under a Run and above an Attempt; adoption across current sprint consumers is incomplete. | `.deckent/workspace/IDENTITY.md:7`; `src/core/work-model.ts:1-12`; OQ-06 |
| Worker | Execution role that performs exact assigned work under scope, claim, provider, and evidence contracts. | `src/agents/worker.ts`; `src/orchestra/authority-enforcer.ts:215-247` |
| Worker pool | The effective admitted set of workers; capacity comes from config, DAG, collision, host/tenant policy, and provider capacity. | `AGENTS.md:80-88`; `src/core/agent-pool.ts` |

## Dogfood / repository reality

The pre-reset glossary was used as a topic baseline, not as current authority. Claims that were no longer supported—fixed heartbeat durations, a single runtime dependency, automatic cleanup of all task files, fixed ADR totals, provider-specific identity, and a settled CLEANUP/COMPLETE name—were not copied. [Evidence: archived `glossary.md` and `reference/glossary.md`; current sources cited above; OQ-04]

Status: ✅ current terms are source-backed; ⚠️ `Operation`, normalized `WorkItem` adoption, Run/Sprint naming, and phase-eight naming retain explicit HOLD references rather than invented definitions.
