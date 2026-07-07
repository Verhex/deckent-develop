<p align="center">
  <img src="https://raw.githubusercontent.com/VerhexIO/deckent/main/docs/assets/logo.png" width="140" alt="deckent — circuit kraken emblem" />
</p>

<h1 align="center">deckent</h1>

<p align="center"><strong>Describe what you want. Watch a team of AI agents build it — in parallel, with quality gates, on a budget you approve, remembering everything for next time.</strong></p>

<!-- AUTOGEN:START id="badges" -->
[![npm version](https://img.shields.io/npm/v/deckent.svg)](https://www.npmjs.com/package/deckent) [![tests](https://img.shields.io/badge/tests-28587%2B-brightgreen)](https://github.com/VerhexIO/deckent) [![coverage](https://img.shields.io/badge/coverage-88.58%25-brightgreen)](https://github.com/VerhexIO/deckent) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![sprints](https://img.shields.io/badge/sprints-380%2B-teal)](https://github.com/VerhexIO/deckent) [![version](https://img.shields.io/badge/version-v1.0.0--beta.1-orange)](https://github.com/VerhexIO/deckent) [![CI](https://img.shields.io/github/actions/workflow/status/VerhexIO/deckent/ci.yml?label=ci)](https://github.com/VerhexIO/deckent/actions)
<!-- AUTOGEN:END id="badges" -->

---

## The 90-second tour

Install it, point it at a project, and ask for something:

```bash
npm install -g deckent
deckent init
deckent start "Add JWT authentication to the Express API"
```

deckent reads your goal, plans the work, and — before spending a single token — shows you the bill:

```
🛡  Sprint Cost Estimate
──────────────────────────────────────────────
Tasks:        5        Retry buffer: 1.5×       Cache: 65%
Tokens:       ~13.5k in · 7.5k out
Cost (USD):   realistic $0.09   ·   worst case $0.13
Budget:       $0.09 / $10.00  ✅ within budget

Proceed with this sprint? (y/N)
```

Say yes, and you watch a **team** go to work — not one assistant editing one file, but several agents in parallel, each locked to its own scope:

```
Sprint 286 · 5 tasks · 2 waves

  ▸ 286-001  Add JWT middleware            opus    EXECUTING
  ▸ 286-002  POST /auth/login endpoint     opus    EXECUTING
  ▸ 286-003  bcrypt password hashing       sonnet  EXECUTING
    286-004  auth tests                    sonnet  (waits on 001–003)
    286-005  document the auth flow        haiku   (waits on 002)

  Auditor: watching scopes · 0 violations
```

When it finishes, every task has a verdict, and deckent tells you the truth — including what needed a retry:

```
✅ Sprint 286 complete  ·  2m 45s
   5/5 tasks: 5 DONE · 0 TECH_DEBT · 0 NO_GO
   +287 / −8 lines · coverage 94%
   4 first-try · 1 self-healed (its own test fix) · 0 boundary violations
```

And the part that compounds — it **remembered**. Next sprint that touches auth, the Brain recalls this one automatically:

```bash
$ deckent recall "jwt auth"
[adr]     JWT auth strategy — HS256, 1-hour expiry (sprint 286)
[pattern] Express auth middleware injects req.user, reused across routes
[learning] Pre-written test fixtures cut iteration time ~40%
```

That's deckent. One sentence in, a planned-and-verified feature out, the cost known up front, the lessons kept for next time.

---

## What deckent actually is

Think of yourself as a **tech lead**, and deckent as your team:

- **The Brain** plans. It reads your goals *and* the project's memory, breaks the work into scoped tasks, orders them by dependency, and assigns each one a model, an agent, and a skill set.
- **The Workers** build — up to **10 in parallel**, each confined to its own files, each running a plan → code → test → report loop. They can run in Docker, tmux, or as subprocesses, and a single sprint can even mix providers (Claude planning, Codex/Gemini executing).
- **The Auditor** watches the boundaries in real time — stale workers, scope violations, deadlocks — and never writes code itself.
- **Memory** makes it compound. Decisions, patterns, learnings, and debt live in a searchable SQLite database. Architecture Decision Records are injected into every worker's prompt as binding rules. The next sprint is smarter than the last.

Any model powers it — a `claude` / `codex` / `gemini` subscription you already pay for, any OpenAI-compatible API, or a fully-local **Ollama** model with **zero API key**. No vendor lock-in, no per-token surprises.

---

## Install

```bash
# Recommended
npm install -g deckent      # or run ad-hoc with: npx deckent@latest

deckent --version           # 1.0.0-beta.1
deckent doctor              # pre-flight health check
```

**Requirements:** Node.js ≥ 24, git, and **at least one provider** — a subscription CLI (`claude` / `codex` / `gemini`), an OpenAI-compatible API key, or local `ollama`. Optional: tmux and Docker for isolated workers. Runs on Linux, macOS, and Windows (WSL2).

```bash
cd my-project
deckent init
```

`deckent init` detects your language, tech stack, and which provider CLIs you have — then scaffolds `.deckent/` (state + config), `.brain/` (memory database), `DIRECTIVES.md` (your goals), and a `CLAUDE.md` adapter so MCP clients can drive deckent too.

---

## Two ways to work

### 1 — Conversational

Run `deckent` with no arguments and just talk to it. Responses stream in real time and render as markdown; slash commands give you the full toolbox without leaving the chat:

```
deckent   claude   ~/my-project
/help for commands · or just type

› what does the auth module do?
› /recall "rate limiting"
› /status
› /plan
› /model sonnet        switch model mid-session
› /provider ollama     switch provider mid-session
```

Side-effecting actions (write a file, run a command) ask before they run — once, or "always for this tool", your choice.

### 2 — Structured sprints (run, formerly "sprint")

For real work, you write goals in `DIRECTIVES.md` and let a full sprint run. The simplest possible directive is just a goal and a task or two — deckent's router fills in the model, agent, and skills for you:

```markdown
# DIRECTIVES — Sprint 1: Add login

## Goal: Add a JWT login endpoint to the Express API and document it.

---

## Task 1: Add the login endpoint
- Scope: src/auth/

### Description
Add `POST /auth/login` that validates email + password and returns a JWT.
Hash passwords with bcrypt. Add tests for valid and invalid credentials.

---

## Task 2: Document the auth flow
- Model: haiku
- Scope: docs/

### Description
Create docs/auth.md explaining the login flow and the JWT lifetime.
```

```bash
deckent start            # plan → spawn → execute → evaluate
deckent start --dry-run  # see the plan without running it
deckent status --watch   # live progress, refreshed continuously
```

Want more control? Every task accepts optional directives:

| Directive | What it does | Example |
|-----------|--------------|---------|
| `- Model:` | Force the model | `- Model: opus` |
| `- Effort:` | Work size (timeout/budget) | `- Effort: high` |
| `- Agent:` | Force the specialist agent | `- Agent: security-auditor` |
| `- Skills:` | Force / exclude skills (`-` excludes) | `- Skills: typescript-expert, -ci-testing` |
| `- Provider:` | Run this task on a specific provider | `- Provider: codex` |
| `- Priority:` | `CRITICAL` / `HIGH` / `NORMAL` / `LOW` | `- Priority: HIGH` |
| `- Scope:` | Directories the worker may write | `- Scope: src/core/, tests/` |
| `- Dependencies:` | Run after another task (waves) | `- Dependencies: W1-1` |

Leave them out and the **Routing Engine** chooses for you, based on the task's scope, intent, and your project stack.

---

## What you'll see

deckent is built to be watched, not to be a black box.

**Live status** (`deckent status --watch`) shows every worker, its phase, and the Auditor's alerts as they happen — tasks moving through `EXECUTING → TESTING → DONE`, agent and skill assignments, worker hand-offs, and the next phase countdown.

**Retrospective** (`deckent retro`) is written automatically at the end of every sprint — what went well, what needs attention, agent performance, learnings, and a trend across the last five sprints:

```
=== Sprint Retrospective: 286 ===
  Tasks 5/5 · No-Go 0 · Tech Debt 0 · Coverage 94% · 2m 45s

  Agent performance
    claude   5 tasks · 5 DONE · 0 debt · avg coverage 94%

  Learnings
    • JWT middleware integrates cleanly with Express error handlers
    • Pre-written test fixtures cut iteration time ~40%

  Trend (last 5 sprints)
    286  tsc OK · +5 tests · 0 regressions
    285  tsc OK · +8 tests · 1 regression
    284  tsc OK · +2 tests · 2 regressions
```

**Memory** (`deckent recall "<query>"` / `deckent remember "<note>"`) searches and writes across architecture decisions, sprint learnings, patterns, and tech debt — full-text, Turkish/English/German-aware. **Review** (`deckent review`) gives a `GO` / `NO-GO` verdict per task before you merge.

---

## Features

### Orchestration
- **8-phase sprint lifecycle** — `PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP`
- **Parallel workers** — up to 10 at once, each in an isolated scope
- **Dependency pipeline** — Kahn's topological sort schedules tasks into waves; dependents unblock only when their inputs reach DONE, and a failed task cascades a `BLOCKED` to its dependents
- **Three backends, per-worker** — Docker (default, container-isolated + memory-limited + graceful shutdown), tmux, or subprocess — and each worker can run an independent backend *and provider*
- **GO / NO-GO / TECH_DEBT** — every result is judged with rubric scoring; failures retry in the FIX phase with the failure as context
- **Crash recovery** — checkpoint/resume restores a stalled sprint; orphan tasks are re-evaluated
- **A cost gate that actually stops you** — the pre-sprint estimate blocks an over-budget run until you acknowledge it (or pass `--force`)

### Memory & intelligence
- **Memory V2 (DB-first)** — SQLite + FTS5 full-text search with dual-layer TR/EN/DE normalization; the database is the source of truth, `.md` files are generated exports
- **Brain auto-query** — a task's "DNA" pulls in the relevant ADRs, patterns, and learnings automatically at PLAN, SPAWN, and EVALUATE
- **ADR governance** — Architecture Decision Records are injected into every worker's prompt as binding constraints; a worker that would violate one stops and proposes an amendment
- **Routing Engine V2** — multi-signal scoring assigns the right agent + skills + provider per task; outcomes feed a learning loop that rebalances over time
- **Evolution pipeline** — temporary agents/skills are promoted to the permanent pool on performance, demoted on failure
- **Nervous System** — a proactive meta-orchestrator that watches for idle workers, routing anomalies, scope collisions, agent-health drops, and debt trends, and proposes action

### Agents & skills
- **20 built-in agents** — e.g. security-auditor, doc-writer, bug-fixer, code-reviewer, refactorer, api-builder, performance-analyzer, ci-guardian, architect, architecture-planner (full list: `docs/reference/agents.md`)
- **31 built-in skills** — typescript-expert, testing-expert, react-specialist, security-specialist, docker-expert, python-expert, anthropic-sdk, and more
- **Plugins** — drop a `manifest.json` + `SKILL.md` into `.deckent/plugins/` to add your own reusable capabilities

### Safety & quality
- **Scope enforcement** — the Auditor diffs the working tree (`git diff --stat`) and flags any write outside a worker's assigned scope; local/agentic workers reject out-of-scope writes outright
- **RBAC authority matrix (ADR-037)** — Brain / Auditor / Worker have distinct roles with a tamper-evident, HMAC-chained audit trail. In V1.0 these are **advisory role boundaries**: violations are detected, logged to the audit trail, and surfaced as warnings (compile-time lint + Auditor `git diff` monitoring) but do not hard-block at runtime. Hard runtime enforcement lands as a V2 post-GA flip.
- **Spawn safety** — workers spawn with array args against a binary whitelist; no shell-string injection
- **`.deck` secrets** — reference tokens as `$DECK:MY_TOKEN`, resolved at runtime, kept out of git
- **Proof-of-function (ADR-079)** — user-facing changes must pass a real-binary run, not just a unit test

### Surfaces
- **Interactive REPL** — `deckent` with markdown streaming, slash commands, and mid-session model/provider switching
- **Web dashboard** — 20 pages (React + Vite + Tailwind): live status, workers, directives, memory explorer, debt, history, config, chat, nervous system, evolution, enterprise — plus an embedded web terminal (PTY over WebSocket, token-auth + audited)
- **MCP server** — 46 tools + 8 resources over stdio, so any MCP client (Claude Code, Claude Desktop, …) can drive deckent
- **Autonomous engine** — a durable backlog with recurring (cron), one-off, and reactive triggers; deckent works a queue on its own
- **Connectors** — Discord, Telegram, and WhatsApp for notifications and remote triggering
- **Enterprise foundation** — multi-tenant isolation, audit query, OIDC/SSO dashboard login (RS256-pinned JWT, PKCE), role-based access, scheduled flows, and webhooks — all in the same MIT codebase, no gated edition

> **Experimental:** a from-scratch **native agentic REPL** (`deckent --native`, flag-gated, off by default) runs its own agent loop with real native tool-use over an API or local Ollama — the foundation for a self-hostable, fine-tunable deckent core.

---

## Bring your own model

deckent is provider-agnostic to the core. Configure providers in `.deckent/config.json`; no provider is privileged.

```jsonc
{
  "providers": { "brain": "claude", "worker": "claude" },  // who plans / who builds
  "auth_mode": "subscription"                              // "subscription" ($0, uses your CLI login) or "api"
}
```

| Provider | Set up with | Notes |
|----------|-------------|-------|
| **Claude** | the `claude` CLI (signed in) | Subscription = $0 per token. Or `ANTHROPIC_API_KEY` for API mode. |
| **Codex (OpenAI)** | the `codex` CLI, or `OPENAI_API_KEY` | |
| **Gemini** | the `gemini` CLI, or `GOOGLE_API_KEY` | |
| **OpenAI-compatible** | `openai_base_url` + `OPENAI_API_KEY` | DeepSeek, Qwen, GLM, OpenRouter, vLLM, … |
| **Ollama** | `ollama_host` + `native_model` | Fully local, **zero API key**, zero cloud calls. |

**Subscriptions are first-class.** If you have a provider's CLI installed and signed in, deckent drives its workers on your existing subscription — no API key, no per-token bill. Have all three and you can run a **mixed fleet** in one sprint:

```markdown
## Task 1: Security audit
- Provider: codex
- Model: gpt-5

## Task 2: UI polish
- Provider: gemini

## Task 3: Core refactor       # uses the config default (Claude)
- Model: opus
```

Or skip model names entirely and let the **model registry** (14 models across 4 tiers — `premium_plus` / `premium` / `standard` / `economy`) pick the equivalent model for whatever provider you chose, via `model_strategy.brain_tier` / `worker_tier`. Pricing is fetched live (with a bundled fallback), so cost estimates stay honest.

→ Full guide: [docs/reference/multi-provider.md](https://github.com/VerhexIO/deckent/blob/main/docs/reference/multi-provider.md)

---

## Architecture

```
                 DIRECTIVES.md  (your goals, in plain language)
                         │
                  ┌──────▼──────┐   reads goals + memory, plans scoped tasks,
                  │    BRAIN     │   assigns model · agent · skills · provider,
                  │  (plan)      │   orders by dependency into waves
                  └──────┬──────┘
            wave 1   ┌───┼───┐   wave 2 (unblocks when wave 1 = DONE)
                 ┌───▼─┐ ┌─▼───┐ ┌─────┐   parallel, each in an isolated scope
                 │ W1  │ │ W2  │ │ W3  │   (Docker / tmux / subprocess; any provider)
                 └───┬─┘ └─┬───┘ └──┬──┘   plan → code → test → report
                     └──────┼───────┘
        ┌──────────────────┐│┌──────────────────┐
        │ AUDITOR (scan)    ││ BRAIN (evaluate)  │  GO / NO-GO / TECH_DEBT
        │ scopes, heartbeats│││ rubric + proof    │  NO-GO ─► FIX (retry w/ context)
        └──────────────────┘│└─────────┬─────────┘  DONE  ─► RETRO ─► MEMORY (compounds)
        ┌───────────────────▼──────────────────────┐
        │   Nervous System — proactive meta-orchestrator   │
        └──────────────────────────────────────────────────┘
```

The codebase is layered: `orchestra/` (the sprint engine), `core/` (config, memory, model registry, routing), `agents/` (worker lifecycle), `monitor/` (Auditor), `nervous/` (proactive detectors), `providers/` + `mcp-client/` (model backends), `api/` + `dashboard/` (web surfaces), `mcp/` (the MCP server), and `cli/` (Commander + the REPL).

→ [Architecture](https://github.com/VerhexIO/deckent/blob/main/docs/architecture/architecture.md) · [Sprint Lifecycle](https://github.com/VerhexIO/deckent/blob/main/docs/architecture/sprint-lifecycle.md) · [Memory System](https://github.com/VerhexIO/deckent/blob/main/docs/architecture/memory-system.md)

---

## MCP integration

deckent ships an MCP server, so any MCP-compatible tool can drive it:

```bash
claude mcp add deckent -- npx deckent-mcp     # any MCP client works the same way
```

**46 tools + 8 resources** over stdio. → [docs/reference/mcp-guide.md](https://github.com/VerhexIO/deckent/blob/main/docs/reference/mcp-guide.md)

---

## Our principles

**"Open source for open world."** One MIT product — from a solo developer on a laptop to a 10,000-person enterprise. The full power of multi-agent orchestration, given to everyone; **no separate Enterprise Edition, no gated features** (ADR-033).

1. **Open Source First** — MIT, public, community-driven. Nothing behind a paywall, ever.
2. **Discipline Over Convenience** — quality gates, scope enforcement, and audit trails exist for a reason; deckent won't skip them.
3. **Provider-Agnostic, Not Locked In** — any model, any backend; no provider is privileged.
4. **Memory Compounds** — every sprint makes the system smarter.

---

## Documentation

- [Getting Started](https://github.com/VerhexIO/deckent/blob/main/docs/guide/getting-started.md) · [First Sprint](https://github.com/VerhexIO/deckent/blob/main/docs/guide/first-sprint.md) · [Chat Mode](https://github.com/VerhexIO/deckent/blob/main/docs/guide/chat-mode.md)
- [Multi-Provider Guide](https://github.com/VerhexIO/deckent/blob/main/docs/reference/multi-provider.md) · [Docker Backend](https://github.com/VerhexIO/deckent/blob/main/docs/guide/docker-backend.md) · [Configuration Reference](https://github.com/VerhexIO/deckent/blob/main/docs/reference/config-reference.md)
- [Architecture](https://github.com/VerhexIO/deckent/blob/main/docs/architecture/architecture.md) · [Sprint Lifecycle](https://github.com/VerhexIO/deckent/blob/main/docs/architecture/sprint-lifecycle.md) · [Memory System](https://github.com/VerhexIO/deckent/blob/main/docs/architecture/memory-system.md) · [MCP Guide](https://github.com/VerhexIO/deckent/blob/main/docs/reference/mcp-guide.md)
- [Cookbook: Add a REST API](https://github.com/VerhexIO/deckent/blob/main/docs/cookbook/add-rest-api.md) · [Cookbook: Fix a Bug](https://github.com/VerhexIO/deckent/blob/main/docs/cookbook/fix-bug.md) · [Troubleshooting](https://github.com/VerhexIO/deckent/blob/main/docs/development/troubleshooting.md)

---

## Contributing & security

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) (deckent is built *with* deckent, so the contributor flow is the product). By participating you agree to our [Code of Conduct](CODE_OF_CONDUCT.md). Found a vulnerability? See [SECURITY.md](SECURITY.md).

---

## License

MIT — [Alperen @ Verhex](https://deckent.ai)

**GitHub:** [github.com/VerhexIO/deckent](https://github.com/VerhexIO/deckent) · **Website:** [deckent.ai](https://deckent.ai) · **Türkçe:** [README-TR.md](README-TR.md)

<!-- AUTOGEN:START id="stat-counts" -->
- **46 MCP tools** + **8 MCP resources**
- **17 built-in agents** (+2 custom)
- **29 built-in skills**
- **20 dashboard pages**
<!-- AUTOGEN:END id="stat-counts" -->
