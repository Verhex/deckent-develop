<!-- Language: EN | Technical terms remain as-is -->

# Deckent — Vision and Strategy

---

## Vision

Deckent is building toward a fully autonomous AI development platform. The current phase is **AI agent orchestration**: a multi-agent CLI that plans, executes, and evaluates development tasks in parallel sprints. This is not the destination — it is the foundation.

The long-term goal: Deckent becomes an always-on, self-improving development teammate. It understands your codebase, learns from every sprint, plans proactively, and operates with minimal human input. Open source, self-hosted, provider-agnostic — **"open source for open world"**. The same MIT product scales from a solo developer's laptop to a large enterprise without forking.

---

## Mission

Solo AI assistants are inherently limited: one context window, one task, one perspective. Deckent breaks through this ceiling with its Brain-Worker-Auditor architecture. Brain sets the strategy, Workers execute in parallel, Auditor guarantees quality. After every sprint, learnings persist to memory — the system makes better decisions with each iteration.

**Where we are now:** AI orchestration CLI — sprint-based multi-agent execution with 3 spawn backends (tmux, subprocess, Docker), 4 AI providers, **15 agents**, 21 skills, 34 MCP tools, ADR governance (89 ADRs through ADR-089), Memory V2 (SQLite FTS5, dual-layer i18n recall), and an **embedded web terminal** that lets users drive `claude` / `gemini` / `codex` / `deckent` / shell sessions from a VSCode-style dockable panel inside the dashboard (ADR-062). The **Nervous System** (ADR-040) proactively monitors sprint health and proposes interventions without human polling. The **Autonomous engine** runs recurring, one-off, and reactive backlog items with 3-gate governance (RBAC → policy → risk).

**Where we are going:** Autonomous AI assistant — heartbeat daemon, proactive task execution, channel integrations (Slack, GitHub), codebase semantic understanding, always-on gateway. The embedded terminal is the first concrete step: it dissolves the boundary between "orchestrator" and "where you actually work". The seams for multi-tenant Kubernetes isolation and enterprise external integrations are already in the architecture — `AuthProvider`, `SessionBackend`, and `tenantId` are in place from day one.

---

## What Makes Deckent Distinctive

Deckent's value rests on a set of capabilities that compound together. None of them are present in combination anywhere else in the open-source ecosystem.

| Capability | What it means |
|------------|--------------|
| **Brain-Worker-Auditor architecture** | Three-role separation: Brain orchestrates and learns, Workers execute in parallel within scope, Auditor enforces quality gates and boundary compliance. |
| **Dependency-pipeline waves** | Kahn topological scheduling — tasks with dependencies run in waves; each wave unlocks the next after all blockers reach DONE. No manual sequencing needed. |
| **Memory V2 — DB-first** | SQLite FTS5 store with dual-layer Turkish/English normalization. Sprint learnings, ADRs, patterns, and debt persist across sprints and surface at planning time. 96% context reduction vs. raw markdown. |
| **89 ADRs + ADR governance** | Every accepted architectural decision is a mandatory constraint. Workers reject implementations that violate an accepted ADR; Brain requires ADR amendment proposals for any conflict. |
| **Nervous System** | Proactive meta-orchestrator (ADR-040) with 12 detectors. Observes sprint health, fires proposals, and dispatches interventions — without polling or manual monitoring. |
| **Autonomous engine** | Recurring (cron), one-off, and reactive backlog. 3-gate governance (RBAC → policy → risk). Parked entries await approval before execution. |
| **Evolution pipeline** | Agents and skills promote from temporary to permanent based on outcome data. The routing engine improves with every sprint through learned affinity scores. |
| **Multi-provider fleet** | Claude, Codex, Gemini, Ollama, and OpenAI-compatible providers. Per-task provider and model-tier override. Same sprint can mix providers across workers. |
| **Native REPL** | Ink-based `deckent` REPL with agentic tool-use protocol, in-turn queue with approval, and slash commands. Native-agent mode (experimental, opt-in) enables full LLM-driven interactions. |
| **Open source, MIT, self-hosted** | No vendor lock-in. Install on any machine, connect any provider, extend with custom agents and skills. Community contributions welcome. |

---

## Target Users

| Segment | Profile | Deckent Value |
|---------|---------|---------------|
| **Individual developer** | Indie dev, freelancer, solo founder | Multi-agent power for a one-person team — parallel output through sprints |
| **Small team** | 2-10 person startup or squad | Use AI workers as team members — automate repetitive tasks |
| **Enterprise** | Large-scale organization | Controlled autonomous development — audit trail, RBAC, scope enforcement, memory/learning |

---

## Technology Decisions

### TypeScript + ESM

TypeScript delivers type safety that enables confident refactoring across large codebases. ESM (ES Modules) aligns with the modern Node.js ecosystem and unlocks optimizations like tree-shaking. For a system that manages AI agents, type safety is critical — a malformed config or task structure can crash an entire sprint.

### Multi-Provider (Claude + Codex + Gemini + Ollama)

Depending on a single AI provider creates both cost and availability risk. Deckent's provider-agnostic architecture assigns different models to different tasks: opus for complex architectural decisions, haiku for simple documentation. A provider fallback chain ensures resilience against outages. Local Ollama workers can handle suitable scoped work with zero API cost.

### Triple Spawn Backend (tmux + Subprocess + Docker)

Three backends for different contexts: **tmux** (fastest, live terminal, Linux/macOS default), **subprocess** (Windows fallback, file-based tracking), **Docker** (container isolation, resource limits, CI/CD ready). Each worker runs in its own isolated environment regardless of backend.

### MCP (Model Context Protocol) Integration

MCP integrates Deckent with any MCP-compatible IDE or tool. With 34 tools and 8 resources, the entire sprint lifecycle is programmatically accessible. This makes Deckent not just a CLI, but a platform.

### Docker Container Isolation

Workers run in isolated Docker containers with memory limits, non-root execution, and volume-mounted auth. Project filesystem access is controlled per-container. This is the foundation for enterprise deployment, CI/CD integration, and future Kubernetes scaling.

---

## Roadmap

### Phase 1: "Orchestration Foundation" — Complete (Sprint 1-82)

Core sprint lifecycle, multi-agent parallel execution, tmux/subprocess backends, MCP integration, multi-provider support (Claude + Codex + Gemini), ModelRegistry, agent/skill ecosystem, heartbeat daemon, human checkpoints, adaptive thresholds.

### Phase 2: "Beta Readiness" — Complete (Sprint 83-166)

Docker container backend (live-verified, 10 e2e tests, configurable timeout), documentation consolidation (BETA-TRACKER, i18n generators, docs.json automation), ERRORS.md active logging, backend smoke testing (tmux + subprocess + Docker via MCP + CLI), ADR-027 hybrid backend decision, version 1.0.0-beta.1. Sprint 138-145: ADR-035/036/037/038/039/040/041 governance + Nervous System meta-orchestrator + Authority Matrix RBAC. Sprint 162-163: Brain stability (6/6 DONE, 0 NO_GO). Sprint 166: Brain Self-Update + Data Integrity Closure — 11/11 task DONE, ~2735 LoC, ADR-046 Brain Self-Update Hook Architecture.

### Phase 3: "Public Beta" — Shipped (Sprint 167-285)

`dependency_pipeline_enabled` flip + Wave scheduling live (Sprint 167); F1 provider-independence (4 providers + OpenAI-compatible HTTP adapter), F2 native chat (Ink REPL + agentic tool-use), F3 process mode (autonomous engine + scheduled flows), F4 enterprise (RBAC, multi-tenant, audit-query, webhook triggers), F5 evolutionary wire (agent/skill promote/demote pipeline), F7 dashboard (16 pages, serve, auth). Memory V2 DB-first (SQLite FTS5, 96% context reduction). Nervous System proactive meta-orchestrator (ADR-040, 12 detectors). Sprint 255+: agentic-run ecosystem single `ExecutionRequest` contract. Current: `v1.0.0-beta.1` at Sprint 285.

> **Live roadmap:** the authoritative, reconciled plan lives in [`docs/MASTER-PLAN.md`](../MASTER-PLAN.md). This Roadmap section is a high-level narrative only.

### Phase 4: "Autonomous Assistant" — Future

The leap from orchestration CLI to autonomous AI platform:
- **Always-on gateway** — daemon mode, SSE dashboard, remote control
- **Channel integrations** — Slack bot, GitHub Issues/PR automation, Linear/Jira sync
- **Codebase semantic understanding** — AST indexing, dependency graph, RAG-enhanced context
- **Multi-sprint chaining** — days-long autonomous task execution
- **Critique layer** — multi-model verification (writer + reviewer pattern)
- **Browser/Computer Use** — computer-use integration for GUI task execution
- **Provider expansion** — Grok, Llama, Mistral, DeepSeek (ModelRegistry ready)

This is where Deckent becomes a fully autonomous multi-agent development platform — open source, self-hosted, and built to run at scale.

---

## Values

- **Open source** — Deckent is free and open source. Community contributions are welcome.
- **Transparency** — Every sprint's plan, outcome, and learnings are on record. The `.brain/` directory preserves the full decision history.
- **Quality** — Auditor quality gates, GO/NO-GO evaluation, and mandatory testing ensure every sprint meets quality standards.
- **Autonomous yet controlled** — Deckent operates autonomously, but the user is always in control. Scope enforcement, audit trails, and memory budgets set clear boundaries.
- **Continuous learning** — Memory V2 and PATTERNS are updated after every sprint. The system improves its decisions over time and avoids repeating the same mistakes.
- **Orchestration first, autonomy next** — Deckent starts as a sprint-based orchestrator and evolves toward full autonomy. Each phase builds on the previous — no shortcuts, no half measures.

---

## Deckent by the Numbers
| Metrik | Değer |
|--------|-------|
| Version | 1.0.0-beta.1 |
| Sprint | sprint-287 |
| MCP Tools | 34 |
| MCP Resources | 8 |
| CLI Commands | 57+ |
| Dashboard Pages | 16 |
| Agents | 15 built-in + 2 custom |
| Skills | 21 built-in |
| Providers | 4 (Claude, Codex, Gemini, Ollama) |

## Sprint Metrics
| Metrik | Değer |
|--------|-------|
| Sprint | sprint-287 |
| Toplam Task | 3 |
| Tamamlanan | 3 |
| Tech Debt | 0 |
| No-Go | 0 |
| Süre | 14dk 39sn |
| Coverage | N/A |

## Sprint History
_Sprint geçmişi yok._
