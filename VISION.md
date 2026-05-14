<!-- Language: EN | Technical terms remain as-is -->

# Deckent — Vision and Strategy

---

## Vision

Deckent is building toward a fully autonomous AI development assistant — in the same category as OpenClaw, Microsoft Copilot Cowork, and Devin. The current phase is **AI agent orchestration**: a multi-agent CLI that plans, executes, and evaluates development tasks in parallel sprints. This is not the destination — it is the foundation.

The long-term goal: Deckent becomes an always-on, self-improving development teammate. It understands your codebase, learns from every sprint, plans proactively, and operates with minimal human input. Open source, self-hosted, provider-agnostic — the anti-Devin.

---

## Mission

Solo AI assistants are inherently limited: one context window, one task, one perspective. Deckent breaks through this ceiling with its Brain-Worker-Auditor architecture. Brain sets the strategy, Workers execute in parallel, Auditor guarantees quality. After every sprint, learnings persist to memory — the system makes better decisions with each iteration.

**Where we are now:** AI orchestration CLI — sprint-based multi-agent execution with 3 spawn backends (tmux, subprocess, Docker), 3 AI providers, **15 agents**, 21 skills, 27 MCP tools, ADR governance (46 ADRs), Memory V2 (SQLite FTS5).

**Where we are going:** Autonomous AI assistant — heartbeat daemon, proactive task execution, channel integrations (Slack, GitHub), codebase semantic understanding, always-on gateway. Think OpenClaw's architecture + Deckent's multi-agent discipline.

---

## Target Users

| Segment | Profile | Deckent Value |
|---------|---------|---------------|
| **Individual developer** | Indie dev, freelancer, solo founder | Multi-agent power for a one-person team — parallel output through sprints |
| **Small team** | 2-10 person startup or squad | Use AI workers as team members — automate repetitive tasks |
| **Enterprise** | Large-scale organization (future) | Controlled autonomous development — audit trail, scope enforcement, memory/learning |

---

## Competitive Analysis

| Tool | Category | Strength | Weakness | Deckent Position |
|------|----------|----------|----------|-----------------|
| **OpenClaw** | Autonomous AI assistant (343K+ stars) | Always-on daemon, 13K+ skills, 50+ channels | Single agent, no sprint lifecycle, no scope enforcement | Multi-agent orchestration + sprint discipline + learning |
| **Copilot Cowork** | Enterprise AI orchestrator | Multi-model critique layer, M365 integration | Closed source, $30+/user/month, no self-hosted | Open source, self-hosted, free, provider-agnostic |
| **Devin** | Autonomous software engineer | End-to-end autonomous, interactive planning | Single agent, closed source, $20-500/month | Multi-agent parallel, open source, free |
| **Perplexity Computer** | Multi-model AI agent | 19 models, days-long tasks, 400+ apps | $200-325/month, no self-hosted, no sprint planning | Self-hosted, 13 models, sprint-based structure |
| **Claude Code (solo)** | Single AI assistant | Strong single-task performance | Single context, no parallelism | Uses Claude Code as a worker, adds orchestration |

**Deckent's unique position:** The only open-source tool that combines multi-agent parallel execution + sprint lifecycle + scope enforcement + memory/learning + multi-provider support + self-hosted. Current phase: orchestration CLI. Next phase: autonomous assistant (OpenClaw/Cowork class).

---

## Technology Decisions

### TypeScript + ESM

TypeScript delivers type safety that enables confident refactoring across large codebases. ESM (ES Modules) aligns with the modern Node.js ecosystem and unlocks optimizations like tree-shaking. For a system that manages AI agents, type safety is critical — a malformed config or task structure can crash an entire sprint.

### Multi-Provider (Claude + Codex + Gemini)

Depending on a single AI provider creates both cost and availability risk. Deckent's provider-agnostic architecture assigns different models to different tasks: opus for complex architectural decisions, haiku for simple documentation. A provider fallback chain ensures resilience against outages.

### Triple Spawn Backend (tmux + Subprocess + Docker)

Three backends for different contexts: **tmux** (fastest, live terminal, Linux/macOS default), **subprocess** (Windows fallback, file-based tracking), **Docker** (container isolation, resource limits, CI/CD ready). Each worker runs in its own isolated environment regardless of backend.

### MCP (Model Context Protocol) Integration

MCP integrates Deckent with any MCP-compatible IDE or tool. With 27 tools and 8 resources, the entire sprint lifecycle is programmatically accessible. This makes Deckent not just a CLI, but a platform.

### Docker Container Isolation

Workers run in isolated Docker containers with memory limits, non-root execution, and volume-mounted auth. Project filesystem access is controlled per-container. This is the foundation for enterprise deployment, CI/CD integration, and future Kubernetes scaling.

---

## Roadmap

### Phase 1: "Orchestration Foundation" — Complete (Sprint 1-82)

Core sprint lifecycle, multi-agent parallel execution, tmux/subprocess backends, MCP integration, multi-provider support (Claude + Codex + Gemini), ModelRegistry, agent/skill ecosystem, heartbeat daemon, human checkpoints, adaptive thresholds.

### Phase 2: "Beta Readiness" — Active (Sprint 83-166)

Docker container backend (live-verified Sprint 119-129, 10 e2e tests, configurable timeout), documentation consolidation (BETA-TRACKER, i18n generators, docs.json automation), ERRORS.md active logging, backend smoke testing (tmux + subprocess + Docker via MCP + CLI), dashboard backend badge, ADR-027 hybrid backend decision, version 1.0.0-beta.1. Sprint 130: MCP instructions accuracy fix (27 tools), decision-engine V1 @deprecated archive + ADR-028, real coverage measurement (89.33%). Sprint 138-145: ADR-035/036/037/038/039/040/041 governance + Nervous System meta-orchestrator + Authority Matrix RBAC. Sprint 162-163: Brain stability mührü (6/6 DONE, 0 NO_GO). Sprint 164: ADR-045 Wave-Based Execution Semantics, dep_pipeline wire code-complete (runtime feature-flagged, Sprint 167 activation hedefi). **Sprint 165: Brain Final Stability — Bug X+Y+Z+W fix, npm publish v1.0.0-beta.1 hazırlığı, Open Source GA prep.** **Sprint 166: Brain Self-Update + Data Integrity Closure — 11/11 task DONE, 4 architectural root-cause fix (Bug M adrInsert hook + Bug N onRuleRegen manual finalize wire + Bug S sprint-aware cache key + Bug Y2 ground-truth verification 3-layer defense), 12 data corrections, ADR-046 Brain Self-Update Hook Architecture (Step Ordering Contract), ~2735 LoC, 35+ new tests.**

### Phase 3: "Public Beta" — Next (Sprint 167-168)

**Sprint 167:** `dependency_pipeline_enabled` flip + Wave scheduling live + M1-M4 monitoring baseline + architectural refactor. **Sprint 168:** Open Source GA — VerhexIO/deckent public repo flip + npm publish v1.0.0-beta.2 + Show HN + CI/CD pipeline (GitHub Actions + Docker backend) + .detect-secrets + CONTRIBUTING guide + community onboarding.

### Phase 4: "Autonomous Assistant" — Future

The leap from orchestration CLI to autonomous AI assistant:
- **Always-on gateway** — daemon mode, SSE dashboard, remote control
- **Channel integrations** — Slack bot, GitHub Issues/PR automation, Linear/Jira sync
- **Codebase semantic understanding** — AST indexing, dependency graph, RAG-enhanced context
- **Multi-sprint chaining** — days-long autonomous task execution
- **Critique layer** — multi-model verification (writer + reviewer pattern)
- **Browser/Computer Use** — Claude Computer Use SDK integration
- **Provider expansion** — Grok, Llama, Mistral, DeepSeek (ModelRegistry ready)

This is where Deckent enters the OpenClaw/Cowork/Devin category — not as another single-agent tool, but as the only open-source multi-agent autonomous development platform.

---

## Values

- **Open source** — Deckent is free and open source. Community contributions are welcome.
- **Transparency** — Every sprint's plan, outcome, and learnings are on record. The `.brain/` directory preserves the full decision history.
- **Quality** — Auditor quality gates, GO/NO-GO evaluation, and mandatory testing ensure every sprint meets quality standards.
- **Autonomous yet controlled** — Deckent operates autonomously, but the user is always in control. Scope enforcement, audit trails, and memory budgets set clear boundaries.
- **Continuous learning** — MEMORY.md and PATTERNS.md are updated after every sprint. The system improves its decisions over time and avoids repeating the same mistakes.
- **Orchestration first, autonomy next** — Deckent starts as a sprint-based orchestrator and evolves toward full autonomy. Each phase builds on the previous — no shortcuts, no half measures.

---

## Deckent by the Numbers
| Metric | Value |
|--------|-------|
| Version | 1.0.0-beta.1 |
| Sprint | sprint-167 |
| MCP Tools | 27 |
| MCP Resources | 8 |
| CLI Commands | 55+ |
| Dashboard Pages | 7 |
| Agents | 15 built-in + 2 custom |
| Skills | 21 built-in |
| Providers | 3 (Claude, Codex, Gemini) |

## Sprint History
_No sprint history._

## Sprint Metrics
| Metric | Value |
|--------|-------|
| Sprint | sprint-167 |
| Total Tasks | 10 |
| Completed | 9 |
| Tech Debt | 2 |
| No-Go | 1 |
| Duration | -1dk -1sn |
| Coverage | NaN% |
