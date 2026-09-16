# Vision

This document states what Deckent is becoming and why. It is direction, not status.

For what exists today, with evidence and status labels, read [Overview](./overview.md). For the plan of record, read [Master Plan](../MASTER-PLAN.md). For the identity contract this document derives from, read `.deckent/workspace/IDENTITY.md`.

## What Deckent is

Deckent is a **provider-neutral, local-first Agent OS / AI runtime ecosystem**. [Evidence: `.deckent/workspace/IDENTITY.md:3`]

It is software you install into a workspace, connect to your tools, and run as an orchestrated execution layer. The point is not a better chat box. The point is a complete operating loop for agentic work: accept intent, understand the environment, admit or reject the work, route it to the right agent and model, execute inside declared scope, exchange data with real systems, verify the outcome against criteria, record evidence and memory, and improve the next run.

Everything else in this document follows from that sentence.

## Why Deckent exists

Three ceilings define the problem.

**A single assistant has a single context.** One window, one task, one perspective, one provider's blind spots. Work that needs parallelism, independent verification, or more knowledge than fits in one turn does not simply get slower — it gets unreliable in ways the user cannot see.

**Agent output is asserted, not proven.** Most agentic tooling ends at "the model said it finished." A green test run is not proof, a self-report is not evidence, and a plausible diff is not a working system. Without an evidence chain, autonomy is a liability that grows with scale.

**The industry is consolidating around vendors.** Model choice, execution environment, memory, and audit are increasingly bundled into one provider's cloud. That is convenient until the day it is not — outage, price change, policy change, or a workload that must never leave the host. The consolidation now reaches past models: hyperscalers are bundling the control plane itself — governance, registry, evaluation, and audit — inside their own cloud boundary. An independent execution plane that works across those boundaries is the one part no vendor will build.

Deckent's answer to all three is the same: make execution a governed, inspectable, provider-neutral system rather than a conversation.

## Trinity: Assistant · Worker · Platform

Deckent's product surface has three faces and one engine. [Evidence: `.deckent/workspace/IDENTITY.md:5`]

| Face | What the user experiences | Engine responsibility |
|---|---|---|
| **Assistant** | Conversational help, planning, personal context, approvals | Turns intent into governed, inspectable, structured work |
| **Worker** | Background and scheduled execution for engineering, operations, data, and internal systems | Executes admitted work under scope, provider, budget, and evidence constraints |
| **Platform** | Extensible agents, skills, providers, MCP tools, connectors, and project-local orchestration | Supplies durable orchestration, memory, approvals, routing, recovery, audit, and adapters |

These are not three products and not three runtimes. They are required to share one kernel, one policy system, one evidence chain, and one learning loop. That single normalized graph is the target model rather than a finished one — the current source keeps several role vocabularies and has not fully adopted one end-to-end type graph, as [Overview](./overview.md) and [Authority and RBAC](./governance/authority-rbac.md) record. A request from chat, CLI, MCP, an autonomous schedule, or a webhook becomes the same kind of structured execution object before it reaches admission, routing, and spawn.

The moment they diverge into three engines, the product is dead — so the shared kernel is the vision, not an implementation detail.

## Who it is for

The audience spans **from a solo user to the largest enterprises on earth: millions of users, projects, tenants, and environments**. [Evidence: `.deckent/workspace/IDENTITY.md:6`]

That is a design constraint, not a marketing range. Both ends share one versioned Core kernel, runtime, application contract, and evidence lineage without a fork or rewrite. Distribution may differ additively: the MIT Community product is complete and standalone, while separately licensed Verhex Enterprise modules add organization-scale governance, operations, and assurance. Enterprise does not create the governance or security that Core lacks; it deepens controls already structural to Core. [Decision: ADR-G-041]

| Face / Audience | Individual | Team and developer | Enterprise |
|---|---|---|---|
| **Assistant** | Personal planning, memory, low-risk automation | Repo-aware planning, design review, debugging, one-shot runs | Policy-aware operational triage, audit lookup, approval routing |
| **Worker** | Recurring personal tasks, document and inbox-shaped work | Orchestrated runs, reviews, migrations, test and doc work, autonomous backlog | Tenant-scoped scheduled flows, business-system actions, approvals, recovery, audit chain |
| **Platform** | Installable skills, personal agents, local model use | Custom agents, skills, providers, MCP extensions, stack conventions | Multi-tenant deployment, RBAC, SSO/SIEM hooks, policy packs, signed extensions, capability brokering |

## The execution authority chain

Deckent models work as one chain, not as a pile of loosely related concepts: [Evidence: `.deckent/workspace/IDENTITY.md:7`]

```
Goal → Mission → Flow → Run → WorkItem → Attempt → Operation
```

Each link is defined, with its source and its open questions, in the [Glossary](./glossary.md). This document does not redefine them.

The chain exists so every effect in the system is traceable upward to an intent and downward to an action. It is what makes audit, recovery, cost attribution, and learning possible at the same time, from the same records. An agentic system without this chain can report what it did; it cannot prove why, under whose authority, at what cost, or whether it may do it again.

The chain also composes recursively: a delegated team or an external runtime receives an authority ceiling and a budget ceiling from its parent link, never a fresh grant — delegation narrows authority; it never widens it.

## Execution mediation: one product, resolved ways of working

Deckent is neither only an agent runtime that runs on the host nor only an isolation product placed between AI and the host. **Execution mediation** is a cross-cutting layer inside the one kernel used by Assistant · Worker · Platform. Depending on where Deckent is installed and the effective policy, it can connect AI directly to the canonical workspace or govern host and real-system effects through a staged, isolated, brokered, or remote boundary. These are not separate products, editions, or authorities. [Evidence: `.deckent/workspace/IDENTITY.md:32`]

Each `Attempt` receives authority from an exact, durable **Execution Posture** contract rather than from a user-facing preset name:

| Axis | Question answered by the contract | Example target values |
|---|---|---|
| **Execution realm** | Where does code or the agent run? | host process, container, microVM, remote executor |
| **Workspace projection** | How is the real workspace exposed? | shared read-write, read-only, snapshot/COW, artifact-only, none |
| **Effect model** | When does an effect become real? | immediate, staged, approval-gated |
| **Capabilities** | Which filesystem, network, tool, and external-system operations are possible? | explicit read/write scopes, allowlist, brokered operations |
| **Secrets** | Within which custody and exposure boundary is a credential used? | none, scoped reference, broker injection |
| **Landing** | How does produced work reach the canonical system? | direct, verified apply, approval-gated apply, external reconciliation |

The resolved posture is the result of this composition:

```text
installation topology
  + tenant / organization policy
  + workspace / project / environment policy
  + task requirements and derived risk
  + platform capability and live availability evidence
  = resolved Execution Posture
```

Policy inheritance only narrows authority, deny precedence is preserved, and unknown is never treated as allowed. User-facing names such as `Direct` or `Protected` may be UX presets, but audit, admission, and settlement carry the exact resolved contract. When a stronger realm is unavailable, Deckent emits an explicit `HOLD` or selects only a pre-authorized equivalent or narrower adapter; it never silently downgrades isolated execution to direct host mutation.

The model is composable. The same attempt may see source read-only, produce output inside snapshot/COW, run tests in a microVM, read GitHub through a capability broker, and leave deployment effects to host authority after approval. Firecracker is a strong `microVM` realm adapter in this model, not a new Deckent identity or a separate enterprise product.

A solo user may select a low-friction direct posture. A team may use staged work and verified landing. A regulated enterprise may require tenant-bound policy, brokered secrets and network access, microVM or remote realms, data residency, and approval-gated external effects. All of them use the same Goal → Mission → Flow → Run → WorkItem → Attempt → Operation chain, policy system, evidence lineage, and control surfaces.

## Six execution contexts

"Everywhere" is concrete. It means six contexts, each with a different user shape and the same loop — request, admit, route, execute, verify, remember.

| Context | Typical request | What it demands of the engine |
|---|---|---|
| **Greenfield project** | "Create the first version of this system and its docs." | Project analysis, planning, parallel workers, stack-aware commands, tests, docs, retrospectives |
| **Active development** | "Implement this feature without breaking the branch." | Scope-bounded edits, agent/skill routing, provider selection, outcome criteria, verifiable results |
| **Maintained codebase** | "Fix this and update the stale documentation." | Memory recall, decision-record awareness, narrow scope, work-kind-appropriate criteria |
| **Daily work** | "Summarize this, draft the reply, update the checklist." | Interactive surfaces, personal memory, low-risk capabilities, approval before outward action |
| **Business systems** | "Check the orders, compare inventory, prepare the action." | Capability targets, connector identity, actor and tenant context, derived risk, approval gates |
| **Enterprise runtime** | "Run this process for a department, with policy and audit." | RBAC, tenant isolation, scheduled origin, correlation lineage, budget, audit and SIEM integration |

The same engine must cover all six. A system that only handles the code-shaped ones is a coding tool, not an Agent OS.

## What makes Deckent different

Three properties, held together. [Evidence: `.deckent/workspace/IDENTITY.md:17`]

**Deterministic, eval-backed orchestration.** The lifecycle is a fixed, inspectable execution sequence, not a model improvising its own control flow. (The executed order is settled; the public phase *vocabulary* is not — see OQ-04 in [Architecture](./architecture.md).) Outcomes are judged against declared criteria appropriate to the kind of work — documentation is judged by content, an audit by findings, code by the stack's own commands. Determinism is what makes a run reproducible; evaluation is what makes its result trustworthy.

**Governance by construction.** Authority, scope, approval, budget, and tenancy belong in the execution model as structural properties, not as options bolted on for enterprise buyers. That is the required design; today's defaults still leave several of these controls opt-in and several enforcement paths advisory, and the honest per-control status lives in [Authority and RBAC](./governance/authority-rbac.md). A worker receives the minimum scope and capability the job requires. Risk is derived from what the work declares it needs, so there is one source of truth rather than a mutable field someone can set to "low." The individual user and the regulated enterprise run the same governed engine; they differ in policy, not in kind.

**A closed learning loop.** `outcome → evidence → routing → promotion → training trace`. What actually happened must feed what happens next: results shape routing, routing shapes agent and skill promotion, and the whole history stays queryable at planning time. Learning that does not change execution is a log. The organs of this loop are implemented and its memory layer is live; end-to-end production closure is not yet certified, and [Memory and learning](./guide/memory-learning.md) states which links are proven.

No one of these is unique. Held together, in one installable, provider-neutral engine, they are the moat.

## Surface doctrine

The **Terminal** is the primary control surface: tool-driven, progressively disclosed, full-control, and deliberately low in cognitive load. **Desktop** is the same authority in a native operator surface. The **Dashboard** is an observability projection only — never an execution engine and never a state authority. API, CLI, MCP, autonomous and process entry points, and connectors are adapters over one application-service authority. [Evidence: `.deckent/workspace/IDENTITY.md:8-9,16`]

This is a durable commitment, not a phase. Surfaces multiply over a product's life; the moment two of them own state, the system loses the single truth that audit, recovery, and learning depend on.

## Provider and runtime neutrality and local-first

**No provider is part of Deckent's identity.** Provider and model selection resolves from effective configuration, the runtime model registry, and live authority evidence. [Evidence: `.deckent/workspace/IDENTITY.md:10`]

Neutrality is a correctness property before it is a cost property: deep planning can take a stronger tier while routine work takes a cheaper one, local models can handle work that must not leave the host, independent verification can require a different provider than the one that produced the output, and an outage or quota wall becomes a routing decision instead of a stoppage.

Neutrality extends one level up, to agent runtimes themselves. External agent runtimes are execution resources, not competitors for the control plane: a local worker, a cloud model, and a third-party agent runtime are admitted, scoped, budgeted, and evidenced under the same contract. Runtimes execute; Deckent decides, constrains, budgets, and proves.

Local-first means the same thing for data. Project state, memory, evidence, and task artifacts live with the project. Deckent does not require a Deckent cloud to exist in order to run.

## Governing principles

Three laws bind every decision, in every session, under every prompt:

1. **Dual Lens + Scale** — every decision serves both Deckent's own orchestration quality and the end-user experience, across the full range from one person to millions of users, projects, tenants, and environments.
2. **Every Environment** — designs are cross-platform, cross-language, multi-tenant, and built for scale from the start; an unsupported platform fails honestly rather than silently.
3. **Never MVP** — work is expert-grade and enterprise-grade; deliberately temporary or knowingly incomplete design is not accepted as completion.

Full text and enforcement: [Immutable Laws](./governance/immutable-laws.md).

## Non-goals

Naming what Deckent is not protects the vision from erosion.

- **Not a chat wrapper.** Chat is one entry point into the run engine, not the product.
- **Not a vendor-controlled SaaS.** It is installed software with local project state, not a hosted platform whose vendor owns your execution.
- **Not a TypeScript-only tool in disguise.** Work is evaluated against the stack it is actually in. A Go project is not judged by a TypeScript build; documentation is not judged by test coverage.
- **Not single-provider by default.** Correct model use means explicit provider, model, tier, and reasoning-depth decisions — resolved from configuration and registry, never from hardcoded names.
- **Not autonomy without control.** Wherever the system acts on its own, the user stays in authority. Unattended end-to-end execution is not certified today; [Current frictions](./operations/current-frictions.md) carries the standing HOLD and the certification ladder. Scope, approval gates, budgets, and audit trails are the price of that autonomy, not an obstacle to it.
- **Not an identity provider.** Enterprise identity, PAM, and non-human-identity systems remain the authority on who an agent is. Deckent integrates with them and converts identity into task-scoped, expiring execution authority bound to evidence.
- **Not another agent runtime.** Deckent does not race agent runtimes on sessions, UI tricks, or execution features. Its own surfaces — Terminal, Desktop, dashboard, API — exist to control, connect, and observe governed execution, and connecting a new runtime or surface must stay easy. Running someone's agent better than they do is not the goal; governing every agent is.
- **Not an isolation-only product.** Direct host/main, staged, isolated, brokered, and remote ways of working are resolved postures of the same product; none is Deckent's identity by itself.
- **Not one mandatory execution topology.** A container, microVM, host process, or remote executor is an adapter. Installation and policy differences do not create a second kernel or evidence chain.
- **Not a metrics showcase.** Counts of agents, tools, and commands are generated status, not identity. They do not appear in this document.

## What would falsify this vision

A vision that cannot be wrong is decoration. These signals would mean Deckent is not achieving what it claims:

- The three faces need three engines — Assistant, Worker, and Platform diverge into separate kernels, policies, or state authorities.
- Autonomous runs cannot complete end to end without human intervention at a rate that makes the automation net-negative.
- Evidence becomes ceremony — settlement passes while the artifacts do not prove the outcome, and completion turns into self-report again.
- Neutrality erodes — the product only really works on one provider, and the others are demo-grade.
- Core governance ceases to be structural, or Enterprise modules introduce a second kernel, policy authority, or evidence chain and thereby fork the solo and enterprise products.
- Execution posture collapses into a profile label, losing exact realm/effect/capability/landing authority, or an unavailable isolation backend silently downgrades to direct host mutation.
- Learning stops changing execution — memory accumulates, but planning and routing do not improve because of it.
- Scale is achieved by narrowing — the engine works only on code-shaped work, and the other execution contexts quietly fall out of the roadmap.

## What this document is not

- It is not a status report. Verified current state, with evidence and ⚠️/✅ labels, lives in [Overview](./overview.md).
- It is not a roadmap or a work ledger. The single source of truth for planned work is the [Master Plan](../MASTER-PLAN.md).
- It is not the identity contract. `.deckent/workspace/IDENTITY.md` is the authority; this document explains and extends it into direction and rationale. Where the two disagree, the identity contract wins and this document is amended.
