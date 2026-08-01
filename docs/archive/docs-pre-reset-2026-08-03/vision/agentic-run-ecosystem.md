# Agentic-Run Ecosystem

Deckent is an agentic-OS plus agentic-run ecosystem: software you install into a workspace, connect to your tools, and run as an orchestrated execution layer.

The point is not a nicer chat box. The point is a ready operating loop for agentic work: accept intent, understand the environment, route work to the right agent and model, execute within scope, exchange data with systems, verify outcomes, record memory, and improve the next run.

## Position

Deckent's product surface has three faces, but one engine.

| Face | What the user experiences | Engine responsibility |
|------|---------------------------|-----------------------|
| AI Assistant | Conversational help, planning, reminders, and personal context | Turns natural language into structured requests, keeps memory, and asks for approval when needed |
| AI System Worker | Background process automation for operations, IT, finance, support, data, and internal tools | Runs long-lived or scheduled work through policy, audit, capability, and recovery boundaries |
| Developer Platform | Extensible agents, skills, providers, MCP tools, and project-local orchestration | Lets builders add capabilities without forking the engine |

These are not separate products. They share the same work model, provider fleet, memory, policy boundaries, and run lifecycle.

## Operating Loop

The agentic-run ecosystem is concrete because each positioning phrase maps to a system capability.

| Claim | Concrete capability |
|-------|---------------------|
| Install it | `deckent init` creates local project state, config, memory exports, task space, and adapter files. Deckent does not require a Deckent cloud service to exist. |
| Run it | `deckent run`, `deckent start`, MCP `deckent_run`, chat entry points, and autonomous entries all create executable work. |
| Ready and orchestrated | Brain plans, Workers execute, Auditor evaluates, GO/NO-GO criteria decide the result, and `.tasks/*.result` gives a disk-verifiable outcome. |
| Integrates everywhere | MCP tools/resources, provider adapters, CLI entry points, chat adapters, and future capability connectors expose the same execution engine to IDEs, terminals, dashboards, and external systems. |
| Takes and gives data | File scope, task artifacts, event streams, memory exports, capability arguments, and connector results carry input and output through the run. |
| Understands structure | Scope rules, task kind, project stack, agent/skill routing, `.deckent/config.json`, ADR memory, and detected commands make execution environment-aware. |
| Learns | Memory V2, sprint retrospectives, ADRs, task results, agent performance, and managed docs feed the next plan instead of treating each run as stateless. |
| Uses models correctly | Provider, model, tier, task effort, model reasoning effort, stack-aware routing, and fallback are explicit. Deckent does not assume one provider or one build command. |

## Trinity x Audience Matrix

The same engine must serve end users, developers, and enterprises without changing its core contract.

| Face / Audience | End user | Developer | Enterprise |
|-----------------|----------|-----------|------------|
| AI Assistant | Chat brainstorms, personal memory, reminders, lightweight task automation | Chat-assisted debugging, design review, repo-aware planning, quick one-shot runs | Chat-driven ops triage, audit lookup, policy-aware internal assistance |
| AI System Worker | Personal recurring tasks, document updates, inbox/calendar-style actions once connectors exist | Sprint orchestration, code review, migration waves, test/doc tasks, autonomous backlog execution | Scheduled flows, tenant-scoped jobs, ERP/data actions, approvals, audit chain, recovery |
| Developer Platform | Installable skills, personal agents, local model use | Custom agents, skills, providers, MCP extensions, stack conventions | Multi-tenant deployment, RBAC, SSO/SIEM hooks, policy packs, signed skills, capability broker |

The matrix is useful only if it remains one engine. A work request from chat, MCP, CLI, or an autonomous schedule should become the same kind of structured execution object before it reaches routing and spawn.

## Six Everyone-Everywhere Scenarios

Deckent's "everyone everywhere" scope is six execution contexts. Each context has a different user shape, but the same loop: request, route, execute, verify, remember.

| Scenario | Typical request | Deckent role | Required capabilities |
|----------|-----------------|--------------|-----------------------|
| Greenfield project | "Create the first version of this app and docs." | Developer Platform plus AI System Worker | Project analysis, task planning, parallel workers, stack-aware commands, docs, tests, retros |
| Active development | "Implement this feature without breaking the current branch." | AI System Worker | Scope-bounded edits, agent/skill routing, provider selection, GO/NO-GO criteria, result files |
| Maintained codebase | "Fix this bug and update stale docs." | AI Assistant plus Developer Platform | Memory recall, ADR awareness, narrow file scope, doc-only vs code-kind criteria |
| Daily tasks | "Summarize this, draft a reply, update my checklist." | AI Assistant | Interactive mode, personal memory, low-risk capabilities, approval for send/write actions |
| ERP and business systems | "Check orders, compare inventory, prepare an MRP action." | AI System Worker | `capabilityTarget`, connector identity, actor/tenant context, derived risk, approval gates |
| Enterprise runtime | "Run this process for a department with audit and policy." | AI System Worker plus Developer Platform | RBAC, tenant isolation, scheduled origin, correlation/causation ids, budget, SIEM/audit integration |

## WM-1: One Execution Contract

WM-1 makes the ecosystem possible by moving single-task execution onto one canonical `ExecutionRequest` contract.

The core fields describe the work:

| Field group | Purpose |
|-------------|---------|
| `description`, `kind` | What the user wants and what kind of work it is |
| `environment` | Where it runs, such as code repo plus local-dev or Docker context |
| `requirements` | Capabilities and resources needed, such as `fs-read`, `fs-write`, network, secrets, or long-running work |
| `scope` | File and directory boundaries for repo-scoped tasks |
| `provider`, `model`, `modelEffort` | Which model family and reasoning depth should handle the work |
| `goNogo` | The outcome contract used by Brain/Auditor evaluation |

The envelope fields make the same contract usable outside code:

| Field | Ecosystem role |
|-------|----------------|
| `capabilityTarget` | Names non-code actions such as `mail.send`, `erp.read`, `db.query`, or future connector-backed work |
| `mode` | Distinguishes batch, interactive, and streaming interaction |
| `actor` | Carries user, role, and tenant context for team and enterprise policy |
| `origin` | Records whether work came from CLI, MCP, chat, autonomous, webhook, scheduled flow, API, or IDE |
| `correlationId`, `causationId` | Preserve audit lineage across related requests |
| `budget` | Caps cost and token use when enterprise cost-control is enabled |

Today, `buildExecutionRequest()` and `resolveToTask()` unify the three single-task paths: CLI `deckent run`, MCP `deckent_run`, and autonomous `runTaskMode`. That closes the old gap where each path built a task differently. It also means single-task runs now carry canonical task kind and provider resolution instead of defaulting implicitly to one provider.

`resolveRiskClass()` derives risk from requirements and capability target. A filesystem read can remain low risk; an ERP write, database write, shell action, or send/create/delete verb becomes high risk and can be parked behind approval or policy gates. Risk is derived, not stored, so governance has one source of truth.

## WM-7: Stack-Aware Execution

WM-7 prevents the ecosystem from becoming TypeScript-only in disguise.

Task kind and detected stack now shape evaluation and routing:

| Work shape | What changes |
|------------|--------------|
| Documentation and design | Judged by target files and required content, not by a build. |
| Audit | Judged by findings, evidence, and scoped output, not by test coverage. |
| Data | Judged by produced outputs and schema or row checks. |
| Code, tests, refactors, devops, config | Judged by detected stack commands. Go uses Go commands, Python uses Python commands, C/C++ does not inherit `tsc`. |

Coverage is also honest. Deckent can natively measure JS/TS coverage through the Vitest/V8 path. For other stacks, missing coverage percentage is a measurement gap, not a quality failure. The system can still detect whether stack-conventional test files were written, such as `_test.go`, `test_*.py`, `tests/*.rs`, or `*Test.java`.

Routing follows the same rule. A detected Go project should not get `typescript-expert` by accident. WM-7 adds a language-mismatch penalty, a parametric `code-expert` skill with stack-correct commands and idioms, and stack-specialized temporary agents such as Go, Python, React/TypeScript, or other prime agents when the project analysis supports them. Explicit `- Skills:` and `- Agent:` pins still bypass automatic routing.

This is what "understands structure" means in practice: the engine evaluates and routes against the project it is actually in.

## Multi-Provider Fleet

The ecosystem does not depend on one model vendor.

Deckent's provider layer separates planning and execution from the concrete model runner. Claude, Codex, Gemini, Ollama/local, and OpenAI-compatible providers can be selected through config or per-task overrides where supported. The same sprint can route independent tasks to different providers, and each worker writes its own heartbeat and result for Brain to evaluate together.

The fleet matters for correctness, not only cost:

| Need | Fleet behavior |
|------|----------------|
| Deep planning | Brain can use a stronger planning provider or tier. |
| Fast doc work | A documentation worker can run on a cheaper or subscription-backed model. |
| Local privacy or zero API cost | Ollama/local workers can handle suitable scoped work on the host. |
| Provider outage or quota pressure | Fallback provider config gives the orchestrator another route. |
| Model-specific reasoning depth | `modelEffort` keeps reasoning depth separate from task work-size effort. |
| Mixed expertise | Different providers can run different tasks in the same wave when file scope and dependencies allow it. |

This Sprint 255 document set is itself a dogfood case: separate doc tasks were assigned across Claude, Codex, and Gemini providers with doc-only criteria. The point is not that every provider is identical. The point is that the work model lets Deckent pick and verify the right tool for each job.

## Data Boundaries

An agentic OS must exchange data without losing control of it.

Deckent uses several boundary types:

| Boundary | Purpose |
|----------|---------|
| `scope.filesRead`, `scope.filesWrite`, `scope.directories` | Defines what repo content a worker may read or write. |
| `capabilityTarget` | Defines non-file actions through capability verbs and connector names. |
| `actor.tenantId` and `actor.role` | Defines who is requesting work and which policy applies. |
| `origin`, `correlationId`, `causationId` | Defines traceability for audit and recovery. |
| `.tasks/*.result` | Defines what the worker claims it completed and how it assessed the outcome. |
| Memory exports and ADRs | Define what the system can reuse in later planning. |

The design direction is capability-based execution: a worker should receive the minimum scope and capability needed for the job, then return a verifiable artifact or action result.

## Learning Loop

Deckent learns through the same artifacts it uses to run:

- Sprint plans and task breakdowns show how work was decomposed.
- Heartbeats and result files show what actually happened.
- GO/NO-GO decisions separate complete work from partial work.
- Retrospectives capture recurring failures and improvements.
- Memory V2 stores searchable project knowledge.
- Managed docs can refresh selected sections without overwriting protected human-written sections.
- Agent and skill performance feeds future routing.

Learning is useful only when it changes execution. In Deckent, memory affects planning, routing, docs, and future task context instead of remaining a passive log.

## Non-Goals

This positioning does not mean Deckent should hide risk or pretend every connector is already complete.

- Deckent is not a single chat wrapper. Chat is one entry point into the run engine.
- Deckent is not a generic SaaS automation platform controlled by a vendor cloud. It is installed software with local project state.
- Deckent should not judge every task by TypeScript build output. WM-7 exists because that fails outside JS/TS and fails for doc, audit, and business-process work.
- Deckent should not store risk as another mutable field. Risk is derived from declared requirements and capability target.
- Deckent should not force one model everywhere. Correct model use means explicit provider, model, tier, and reasoning-depth choices.

The ecosystem claim is earned when a user can install Deckent, express work in natural language or structured directives, let the engine create a scoped execution request, run the right agents on the right providers, verify the result with task-appropriate criteria, and carry the learning into the next run.
