# Deckent — Product Roadmap

> **Active development sequencing lives in [`docs/MASTER-PLAN.md`](../MASTER-PLAN.md)** — the single source of truth for *how* the next sprints are built. This file is the **product roadmap**: what Deckent is, where it stands today, and where it is going. It is intentionally durable — direction over dates.

**Current state:** `v1.0.0-beta.1`, Sprint 285+. Native REPL in production, autonomous engine live, web dashboard, Memory V2 (DB-first SQLite FTS5), 34 MCP tools + 8 resources, 89 ADRs, 15 built-in agents, 21 built-in skills, and a tier-based model registry spanning 4 providers (Claude, Codex, Gemini, Ollama). Learn more at **deckent.ai**.

> **"Install it. Run it. Own it."**
>
> Deckent is an AI agent orchestration tool that lives on your machine, runs your sprints, and never calls home.

## What Deckent Is

Deckent is a **local-first, open-source CLI tool** for AI-powered sprint orchestration. You install it once and it works — on your laptop, in your CI pipeline, inside Docker, on WSL2, on a friend's Linux server with no internet access beyond your AI provider.

There is no account to create. There is no monthly subscription. There is no cloud that knows your tasks. There is no oncall team that pages when "the service is down", because there is no service.

**Two commands to start your first sprint:**

```bash
npx deckent init
deckent start
```

That's it. No signup. No API key for Deckent itself. No credit card. If you have your AI provider CLI authenticated, you're already running.

---

## Three Faces, One Engine — The Trinity

> **"Deckent will be an AI Assistant, an AI System Worker, and an AI Developer. Companies, developers, and everyday people will all be able to use it. This has always been the goal."** — Alperen, 2026-05-20

Deckent is **three things in one**, served by the **same engine** (Brain + MCP tools + Memory + Agent pool + Nervous System + Hybrid Mode).

| Face | Audience | What it does | Mode |
|------|----------|---------------|------|
| **AI Assistant** | Everyday people — students, freelancers, household users, anyone with a goal and a question | Conversational planning, reminders, personal memory, day-to-day workflow help | Chat Mode |
| **AI System Worker** | Companies — operations, IT, finance, customer experience, any vertical department | Business automation, system integration, scheduled flows, audited execution, long-running background tasks | Process Mode |
| **AI Developer** | Builders — solo developers, teams, agencies | Sprint orchestration, multi-agent execution, quality gates, retrospective learning, refactor and review | Sprint Mode |

These are **not three products**. They are **three modes of the same product**. The same MCP tools that orchestrate a developer's sprint also automate a company's reporting job and answer an everyday user's question. The Hybrid Mode architecture (ADR-042) anticipated this from the start.

**Today's maturity is uneven, and that is honest:**

- **AI Developer** is the most mature face — hundreds of sprints of dogfooding, with `v1.0.0-beta.1` validated and publish-ready. This is the engine that built everything else.
- **AI System Worker** is progressing — the embedded web terminal (PTY sessions, WS gateway, token auth, append-only HMAC audit chain), enterprise RBAC, multi-tenant scoping, audit query, scheduled flows, and webhook triggers have all shipped (ADR-062, ADR-068, ADR-069, ADR-071). Deep multi-tenant isolation and enterprise SSO/SIEM/compliance continue to harden.
- **AI Assistant** is maturing — Memory V2 (SQLite + FTS5, dual-layer Turkish/English/German normalize) is production, the Nervous System runs proactive detectors, and the native conversational REPL is live (ADR-081/082/083).

The maturity gap is expected. Building the Developer face first forced the engine to become real — the same engine that runs the other two faces. **The goal has always been all three.**

---

## Three Faces, One Engine — The Trinity

> **"Deckent will be an AI Assistant, an AI System Worker, and an AI Developer. Companies, developers, and everyday people will all be able to use it. This has always been the goal."** — Alperen, 2026-05-20

Deckent is **three things in one**, served by the **same engine** (Brain + MCP tools + Memory + Agent pool + Nervous System + Hybrid Mode).

| Face | Audience | What it does | Mode |
|------|----------|---------------|------|
| **AI Assistant** | Everyday people — students, freelancers, household users, anyone with a goal and a question | Conversational planning, reminders, personal memory, day-to-day workflow help | Chat Mode |
| **AI System Worker** | Companies — operations, IT, finance, customer experience, any vertical department | Business automation, system integration, scheduled flows, audited execution, long-running background tasks | Process Mode |
| **AI Developer** | Builders — solo developers, teams, agencies | Sprint orchestration, multi-agent execution, quality gates, retrospective learning, refactor and review | Sprint Mode |

These are **not three products**. They are **three modes of the same product**. The same MCP tools that orchestrate a developer's sprint also automate a company's reporting job and answer an everyday user's question. The Hybrid Mode architecture (ADR-042) anticipated this from the start: Sprint Mode and Task Mode are shipping today; Chat Mode and Process Mode complete the trinity.

**Today's maturity is uneven, and that is honest:**

- **AI Developer** is ~95% — 170+ sprints of dogfooding, beta-ready for 1 June 2026.
- **AI System Worker** is ~50% — MCP server and multi-tenant isolation in flight (Sub-project #3), enterprise integrations and scheduled-flow dashboards on the horizon.
- **AI Assistant** is ~25% — memory and nervous system are ready, the conversational shell decision is pending (see *Conversational Shell — Direction Under Consideration* below).

The maturity gap is expected. Building the Developer face first forced the engine to become real — the same engine that will run the other two faces. **The goal has always been all three.**

---

## The Four Immovable Principles

These principles define what Deckent is. They are not slogans — they are architectural constraints that shape every feature decision. See ADR-033 for the formal record.

### 1. Product, Not Service

Deckent is software you install, not a service you subscribe to. Every feature must work without a Deckent server, Deckent cloud, or Deckent API. If a feature requires calling a Deckent-controlled endpoint to function, it does not ship.

### 2. Install-and-Run Easy

The first experience must be excellent. A developer who has never heard of Deckent should be able to run their first sprint in under five minutes, starting from zero. Wizard-first onboarding, interactive setup, sensible defaults — no configuration required to get started.

### 3. Open Source, Free Forever

Every feature is available to every user. No "pro" tier. No "team" plan. No enterprise edition with extra agents. The codebase is MIT-licensed. Contributions welcome. Forks encouraged.

### 4. For Everyone, Everywhere

macOS, Linux, WSL2, Docker, CI runners. Turkish and English interfaces. Works on slow connections (local AI model support is built in). Works offline when your AI provider is local. No platform assumptions.

---

## Why Deckent

Deckent's position is its own: **open-source, local-first AI sprint orchestration with structured quality gates and a self-improving engine.** These are the capabilities that define it — each one shipped and dogfooded, not aspirational:

- **Sprint discipline with GO / NO-GO / TECH_DEBT gates.** Every task is planned, scoped, executed, and evaluated against task-specific criteria. Work is never silently "done" — it is judged, and honest NO_GO beats a false DONE.
- **Multi-agent parallelism.** Brain plans a sprint, spawns workers across tmux, subprocess, or Docker backends, and coordinates dependency-aware execution waves (Kahn topological scheduling, ADR-045/064).
- **An evolutionary architecture.** Memory V2 (DB-first SQLite with FTS5 full-text search and dual-layer i18n normalize) gives the engine persistent, queryable knowledge. Outcome tracking, rule evolution, and an agent/skill promotion pipeline let routing improve from real results.
- **The Nervous System.** A proactive meta-orchestrator (ADR-040) observes the running system, detects problems, and proposes corrective action — before you have to ask.
- **Provider independence.** Claude, Codex, Gemini, and Ollama, addressed through a tier-based model registry (4 tiers). Choose by tier, not vendor; run fully local with Ollama. No lock-in.
- **An autonomous engine.** A durable backlog with cron, one-off, and reactive triggers lets Deckent dispatch its own work under explicit policy gates (auto / approval-required / risk-tagged).
- **ADR governance.** 89 accepted Architecture Decision Records are mandatory constraints, injected into every worker's context. Decisions are recorded, not re-litigated.
- **Local-first security.** AST-sandboxed skills, scoped worker boundaries, `.deck` secret files that never commit, and an append-only HMAC audit chain. Your code and tasks stay on your machine.
- **MIT, open, forever.** Every capability above — including the enterprise-grade ones — ships under the same license to every user.

This is the value proposition, stated on its own terms.

---

## Current State — What Has Shipped

Deckent is feature-rich and production-validated for the Developer face. Shipped and live today:

- **CLI** — 55+ commands covering the full sprint lifecycle (`init`, `plan`, `start`, `status`, `review`, `retro`, `cleanup`, `recall`, `remember`, and more).
- **Native REPL** — `deckent` with no arguments opens an agentic tool-use shell with streaming and in-turn tool queueing + approval (ADR-081/082/083).
- **MCP server** — 34 tools and 8 resources over stdio transport. Register with any MCP-compatible host (`claude mcp add deckent -- npx deckent-mcp`) to drive Deckent from Claude Code, VS Code, JetBrains, or other editors.
- **Sprint engine** — PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP, with dependency-pipeline waves and continuous dispatch (ADR-045/064).
- **Memory V2** — DB-first SQLite with FTS5 dual-layer i18n search; `.md` exports are generated snapshots (ADR-088).
- **Web dashboard** — React + Vite + Tailwind, served locally with token auth and an embedded web terminal.
- **Autonomous engine** — durable backlog with cron / one-off / reactive triggers and policy gates.
- **Nervous System** — proactive detectors with subscribe/accept/reject controls.
- **Enterprise foundation** — RBAC (admin / operator / viewer), tenant-scoped audit, audit query, scheduled flows, and webhook triggers (ADR-068/069/071).
- **Multi-provider** — Claude, Codex, Gemini, Ollama, plus an OpenAI-compatible HTTP adapter.
- **Agent & skill ecosystem** — 15 built-in agents, 21 built-in skills, AST-sandboxed, with a promotion pipeline for evolution.

---

## Roadmap — Near-Term

The next horizon hardens what has shipped and deepens the three faces. Direction is confirmed; details evolve sprint to sprint (see [`docs/MASTER-PLAN.md`](../MASTER-PLAN.md) for live sequencing).

- **Native-agent program polish** — continue maturing the native REPL: richer tool-use UX, streaming refinements, and parity with host-CLI capabilities so a fresh machine needs nothing but Deckent.
- **Autonomous engine hardening** — concurrency backpressure, reactive-trigger depth, and safer self-dispatch guards for unattended operation.
- **Enterprise depth** — strengthen multi-tenant isolation, SSO/OIDC, and audit/compliance surfaces toward production enterprise readiness.
- **Local-model first-class** — deepen Ollama and local-model support so offline, fully-private operation is a first-class path, not a fallback.
- **Documentation reality** — keep every user-facing document code-verified and current (the documentation reality audit is ongoing).
- **Skill & agent growth** — expand the built-in ecosystem and the path for sharing community skills and agents.

---

## Roadmap — Long-Term Vision

The destination is an **agentic operating layer** for software and work: one engine you install, three faces you choose between, all of it yours.

- **Complete the Trinity.** Bring the Assistant (Chat Mode) and System Worker (Process Mode) faces to the same maturity the Developer face has today — same engine, same MCP tools, same audit guarantees.
- **Agentic-OS direction.** Deckent as a persistent, conversational, self-improving layer that orchestrates not just code sprints but business processes and personal workflows — observing, planning, executing, and learning across all three.
- **Process Mode verticals.** Audited, compensable execution for real business operations (reporting, integration, scheduled flows) with effect-class-aware safety and saga-style reversibility.
- **Broader reach.** Voice and mobile access layers as the ecosystem matures — always as access layers over the same local-first engine, never as a replacement for it.
- **v1.0.0 stable.** A God-Level GA release once all stability, coverage, and quality gates pass — the canonical milestone for the Developer face fully shipped and the other two faces production-ready.

Whatever ships, it ships under the four immovable principles: a product you own, easy to run, free and open, for everyone, everywhere.

---

## From Commands to Conversation

Deckent works through imperative CLI commands and an MCP server (34 tools). A developer types `deckent init && deckent plan && deckent start`, and orchestration runs. For users who already speak fluent CLI, this is fast. For users who want to *chat* — to describe what they want and let Deckent figure out which commands to invoke — Deckent ships a native conversational shell.

The MCP server already makes every command callable from any MCP-compatible host. On top of that, Deckent provides its own native REPL so that a user with nothing but Deckent installed can have the same experience without depending on an external LLM CLI. The first conversational path shipped early — `deckent chat` (`chat.ts`) landed in Sprint 190 — and the native REPL has since become the default surface. The provider abstraction reaches Claude, Codex, Gemini, and local Ollama models through the same tool-use loop.

Whatever surface you use, the conversational shell does not change Deckent's identity:

- **Still a product, not a service.** The chat runs locally; no Deckent-controlled endpoint is involved (ADR-033).
- **Still free, forever.** Conversational mode is not a "pro" tier — it ships in the same MIT package as everything else.
- **Still terminal-first.** `deckent` in any terminal must produce the same result as the dashboard surface.
- **Still verifiable.** Every tool call the model makes is the same MCP tool a human would call from the CLI — auditable, reproducible, no hidden orchestration.

---

## Conversational Shell — Direction Under Consideration

> **Status:** Pending architecture decision (recorded 2026-05-20). Three viable paths are documented in `docs/ROADMAP-GOD-LEVEL.md` ⚡ 2026-05-20 (Discussion) with verified code-level inventory. This section captures the product-vision framing; the decision itself is open.

Today Deckent works through imperative CLI commands and an MCP server (27+ tools). A developer types `deckent init && deckent plan && deckent start`, and orchestration runs. For users who already speak fluent CLI, this is fast. For users who want to *chat* — to describe what they want and let Deckent figure out which commands to invoke — there is a missing layer.

**The question is not whether Deckent should support conversational interaction.** The MCP server already makes every command callable from Claude Code, Cursor, and VS Code. **The question is whether Deckent should ship its own native conversational shell** — `deckent chat` — so that a user with nothing but Deckent installed can have the same experience without depending on a host LLM CLI.

### Three architectural paths, captured for later decision

**Path A — Build on the embedded terminal (Sprint 175).** Add a `DeckentChatBackend` that reuses the PTY/WS gateway/auth/audit infrastructure shipped in Sprint 175. A "Deckent" tab in the dashboard becomes a native chat surface; the CLI variant of `deckent chat` calls the same backend without the embedded shell. ~600 LoC, no new dependencies, multi-tenant compatible by inheritance from the terminal stack.

**Path B — Host the user's existing AI CLI.** `deckent chat` spawns the user's installed `claude`, `codex`, or `gemini` CLI as a subprocess, auto-attaching the Deckent MCP server. The host CLI runs the tool-use loop; Deckent provides MCP and pty forwarding. ~150 LoC, ships fastest, but requires at least one external AI CLI on the user's machine.

**Path C — Native SDK with its own REPL.** Deckent uses the Anthropic, OpenAI, and Google SDKs directly to run a tool-use loop in a custom REPL. The provider abstraction migrates from CLI shell-out to native SDK. ~1500 LoC plus migration, and an amendment to ADR-010 (single-runtime-dependency), but the only path that lets `npx deckent` chat from a fresh machine with zero external CLI prerequisites.

### Why this is a real strategic choice, not a technical detail

Each path makes a different bet about who the user is. **Path B trusts** that any user serious enough to install Deckent already has `claude` or `codex` locally — a reasonable assumption today, increasingly safe over time. **Path A bets** on the dashboard becoming the primary surface where conversational interaction lives — a continuation of the Sprint 175 web-terminal investment. **Path C** is the only path that survives the install-and-run principle (ADR-033) with no caveats: a fresh machine, one `npx deckent`, and conversation starts immediately, regardless of what AI CLIs are installed.

The three paths do not conflict. A natural sequence is **B → A → C**: ship the lightest path so the public beta has a working `deckent chat`, layer the dashboard-native experience as Sprint 175 sub-projects close out, and migrate to native SDK chat in Q3 2026 when the provider abstraction is mature enough to absorb the SDK transition.

### What stays decided

Whichever path is chosen, the conversational shell does not change Deckent's identity:

- **Still a product, not a service.** The chat runs locally; no Deckent-controlled endpoint is involved (ADR-033).
- **Still free, forever.** Conversational mode is not a "pro" tier — it ships in the same MIT package as everything else.
- **Still terminal-first.** A `deckent chat` in any terminal must produce the same result as the dashboard tab.
- **Still verifiable.** Every tool call the LLM makes is the same MCP tool a human would call from the CLI — auditable, reproducible, no hidden orchestration.

The decision is documented but not made. See `docs/ROADMAP-GOD-LEVEL.md` ⚡ 2026-05-20 (Discussion) for the full architectural comparison and verified inventory of existing building blocks.

---

## The "Install and Run" Experience Goal

The north star for every release is this scenario:

```
A developer finds Deckent on GitHub. They read the README for 3 minutes. They run:

  npx deckent init

An interactive wizard asks them 4 questions:
  1. Project name? (auto-detected from package.json)
  2. AI provider? [Claude / Codex / Gemini / Ollama] (Claude if authenticated)
  3. Default model tier? [economy / standard / premium] (standard)
  4. Language? [EN / TR] (EN)

Then they write their DIRECTIVES:

  deckent set-directives "Fix the auth bug and add tests"

Then they start:

  deckent start

Workers spawn. Agents execute. Results evaluate. Retro writes.
Total time from discovery to first sprint complete: under 10 minutes.
```

Every feature decision is measured against this scenario. Does it make the path shorter? Does it reduce friction? Does it work without an account, a server, or a credit card?

If not, it waits.

---

## What Deckent Will Never Be

To be clear about the product boundaries:

- **Not a SaaS platform.** There is no hosted site where you log in and run sprints. There never will be. (ADR-033)
- **Not cloud-hosted.** Deckent does not offer a "run in our cloud" option. Your tasks run on your machine. (ADR-033)
- **Not behind a paywall.** Every feature available in the repo is available to every user, forever. (ADR-033)
- **Not an enterprise edition.** There is no "Deckent Enterprise" with extra features. Open source is the only edition — the same code that ran the dogfood loop runs in a 10,000-employee corporation. Enterprise-grade means default-deny security, scoped tenants, and operator-grade audit, available to anyone who installs. (ADR-033)
- **Not multi-tenant SaaS.** Multi-tenant isolation means "scoped, audited boundaries on infrastructure you control" — not "thousands of users sharing one server we run." (ADR-034)
- **Not an IDE plugin** (primarily). The MCP server and IDE extensions are access layers, not the core. The core is the CLI.

---

## Contributing

Deckent is open for contributions. The best way to contribute:

1. **Run Deckent on a real project** and file issues for friction you encounter.
2. **Write a skill or agent** for your domain and share it (PR or community post).
3. **Improve the first-run experience** — wizard, docs, error messages, onboarding.
4. **Add a language** — `patternsByLang` in `content-generators.ts` + `I18nStrings` entries.
5. **Improve cross-platform support** — Windows native, Docker, unusual CI environments.

See `CONTRIBUTING.md` for code style, test requirements, and PR process.

---

## References

- Project home: **deckent.ai**
- Active development sequencing: [`docs/MASTER-PLAN.md`](../MASTER-PLAN.md)
- ADR-033: Product Vision — Product Not Service — `.brain/exports/decisions.md`
- ADR-034: Multi-Project Isolation — `.brain/exports/decisions.md`
- ADR-042: Hybrid Mode Architecture — Sprint + Task Dual Modes
- ADR-081/082/083: Native Agentic Deckent — REPL, LLM wire, provider parity
- API Surface Contract: `docs/reference/api-surface.md`
- MCP Tool Reference: `docs/reference/mcp-tools.md`
- Project Identity: `.deckent/workspace/IDENTITY.md`
