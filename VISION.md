<!-- Language: EN | Technical terms remain as-is -->

# Deckent — Vision and Strategy

---

## Vision

Deckent is an open-source orchestration CLI that transforms software development from a single AI assistant into a multi-agent team. The human defines the goal — Deckent plans, assigns parallel workers, monitors quality, and evaluates results. The ultimate objective: write a DIRECTIVES.md and let Deckent handle the rest.

---

## Mission

Using a solo AI assistant is inherently limited: one context window, one task, one perspective. Deckent breaks through this ceiling with its Brain-Worker-Auditor architecture. Brain sets the strategy, Workers execute in parallel, and Auditor guarantees quality. After every sprint, learnings are persisted to memory — the system makes better decisions with each iteration.

---

## Target Users

| Segment | Profile | Deckent Value |
|---------|---------|---------------|
| **Individual developer** | Indie dev, freelancer, solo founder | Multi-agent power for a one-person team — parallel output through sprints |
| **Small team** | 2-10 person startup or squad | Use AI workers as team members — automate repetitive tasks |
| **Enterprise** | Large-scale organization (future) | Controlled autonomous development — audit trail, scope enforcement, memory/learning |

---

## Competitive Analysis

| Tool | Approach | Strength | Weakness | Deckent Differentiator |
|------|----------|----------|----------|------------------------|
| **Devin** | Fully autonomous AI developer | End-to-end autonomous execution | Closed source, expensive, limited control | Open source, orchestration-focused, user-controlled |
| **OpenHands** | Open-source AI developer | Community-driven, extensible | Single agent, no sprint lifecycle | Multi-agent, memory/learning, quality gates |
| **Aider** | Git-integrated AI pair programming | Lightweight, fast, git-native | Single agent, no orchestration | Parallel workers, planning, evaluation loop |
| **Cursor** | AI-powered IDE | Rich IDE experience | IDE-locked, no orchestration | IDE-agnostic CLI, multi-provider, sprint lifecycle |
| **Claude Code (solo)** | Single AI assistant | Strong single-task performance | Single context, no parallelism | Uses Claude Code as a worker, adds an orchestration layer |

**Deckent's core differentiator:** Orchestration. Rather than supercharging a single AI assistant, it coordinates multiple AI workers within a sprint discipline. Planning, execution, evaluation, and learning converge in a single loop.

---

## Technology Decisions

### TypeScript + ESM

TypeScript delivers type safety that enables confident refactoring across large codebases. ESM (ES Modules) aligns with the modern Node.js ecosystem and unlocks optimizations like tree-shaking. For a system that manages AI agents, type safety is critical — a malformed config or task structure can crash an entire sprint.

### Multi-Provider (Claude + Codex + Gemini)

Depending on a single AI provider creates both cost and availability risk. Deckent's provider-agnostic architecture assigns different models to different tasks: opus for complex architectural decisions, haiku for simple documentation. A provider fallback chain ensures resilience against outages.

### tmux + Subprocess Backend

tmux runs multiple AI workers in parallel terminal sessions — each worker writes code, runs tests, and reports in its own isolated environment. For platforms without tmux (such as Windows), a subprocess backend provides an alternative. This dual-backend approach ensures platform independence.

### MCP (Model Context Protocol) Integration

MCP integrates Deckent with any MCP-compatible IDE or tool. With 20 tools and 8 resources, the entire sprint lifecycle is programmatically accessible. This makes Deckent not just a CLI, but a platform.

---

## Roadmap

### Phase 1: "Eat Your Own Dog Food" — Complete

npm packaging, dogfooding, Windows support, core sprint cycle. Real sprints successfully completed on the Vizetron (Python/FastAPI) project.

### Phase 1.5: "Init UX + Onboarding" — Complete

Init wizard, stack detection, quick-start guide, worker prompt improvements. 22 of 26 dogfooding bugs resolved.

### Phase 2: "General Usability" — Active

Provider and tier generalization, documentation consistency, god object split, security infrastructure. Multi-provider testing and dashboard improvements in progress.

### Phase 3: "Documentation"

TR+EN bilingual support, VISION document, link audit, config dashboard. Shortening onboarding time through user-friendly documentation.

### Phase 4: "Public Repo"

Secret leak protection (.detect-secrets), migration to the VerhexIO/deckent open-source repository, CI/CD pipeline, npm publish. Opening up to community contributions.

---

## Values

- **Open source** — Deckent is free and open source. Community contributions are welcome.
- **Transparency** — Every sprint's plan, outcome, and learnings are on record. The `.brain/` directory preserves the full decision history.
- **Quality** — Auditor quality gates, GO/NO-GO evaluation, and mandatory testing ensure every sprint meets quality standards.
- **Autonomous yet controlled** — Deckent operates autonomously, but the user is always in control. Scope enforcement, audit trails, and memory budgets set clear boundaries.
- **Continuous learning** — MEMORY.md and PATTERNS.md are updated after every sprint. The system improves its decisions over time and avoids repeating the same mistakes.

---

## Deckent by the Numbers

| Metric | Value |
|--------|-------|
| Tests | 12,193+ |
| Coverage | 96%+ |
| Completed sprints | 103+ |
| CLI commands | 35+ |
| MCP tools | 20 |
| MCP resources | 8 |
| Built-in agents | 16 |
| Built-in skills | 21 |
| Providers | 3 (Claude, Codex, Gemini) |
| Platforms | macOS, Linux, WSL2, Windows |
