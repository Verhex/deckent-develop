<!-- Language: EN | Technical terms remain as-is -->
# Deckent Beta Tracker

**Last updated:** 2026-04-10 | **Sprint:** 130+ | **Tests:** 12,194+ | **Version:** 0.4.0-beta.1

---

## Current Status
| Metric | Value |
|--------|-------|
| Version | 0.4.0-beta.1 |
| Sprint | sprint-130 |
| MCP Tools | 21 |
| MCP Resources | 8 |
| CLI Commands | 35+ |
| Dashboard Pages | 6 |
| Agents | 16 built-in |
| Skills | 21 built-in |
| Providers | 3 (Claude, Codex, Gemini) |

## Overview

130+ sprints, 12,194+ tests, 250+ TypeScript modules. Three spawn backends verified: tmux (fastest, 2m55s), subprocess (working, 6m53s), Docker (live verified — Sprint 119-129). Self-dogfooding active — Deckent fixes its own test regressions and documentation via sprints. Documentation consolidated: BETA-TRACKER (EN+TR), docs.json auto-updates 7 documents.

**Strategy:** npm package → dogfood on own projects → feedback → fix → public repo (VerhexIO/deckent)

**Current State:** v0.4.0-beta.1 — All three backends live-verified. Docker backend fully operational (Sprint 119-129): workers run tsc/vitest inside containers. Sprint 125-126 Rubric-Based Grading + Context-Aware Routing + Token Usage Tracker implemented. Sprint 127-128 quality reform: 7 critical fixes + litmus test. Sprint 129 enterprise tech debt cleanup: DEBT.md parse fix, evaluator consistency, all debt closed. Sprint 130 codebase accuracy reform: MCP instructions 21 tools fix, decision-engine V1 @deprecated archive + ADR-028, real coverage measurement (89.33%). 12,194+ tests passing, zero open debt.

---

## Phase Plan

### Phase 1: "Eat Your Own Dog Food" — COMPLETE ✅
### Phase 1.5: "Init UX + Onboarding" — COMPLETE ✅ (Sprint 070-071)

### Phase 2: "General Usability" — ACTIVE

**Sprint 072 — COMPLETE (2026-03-27):**
- [x] P1-7: Plan tiers → performance/balanced/economic + backward compat
- [x] P1-8: Init wizard → general provider selection, $ removed
- [x] P1-9: MODEL_API_IDS mapping + resolveApiModelId()
- [x] P2-13: README.md → 12,192+ tests, 86+ sprints, Windows full, 19 MCP tools
- [x] P5-31: sprint-controller.ts → 7 phase functions extracted to sprint-phases.ts

**Sprint 073 — COMPLETE (2026-03-30) — Self Dogfooding:**
- [x] 100 test regressions fixed (43+16+9+23+3 = 100 fail → 0 fail)
- [x] test-writer agent 5/5 tasks DONE, 17m 41s

**Sprint 074 — COMPLETE (2026-03-30) — Docs + Debt:**
- [x] P2-13: README.md numbers updated (12,176+ tests, 73+ sprints)
- [x] P2-16: CHANGELOG + SPRINT-LOG Sprint 072-073 entries
- [x] .brain/ consistency (PROJECT-IDENTITY, DECISIONS)
- [x] CLAUDE.md + DECKENT.md module counts fixed (orchestra 47, core 49, MCP 19)
- [x] debt-069-005 (TempAgent) + debt-069-006 (scope parser) closed
- [x] doc-writer agent 5/5 + bug-fixer 2/2, 7m 29s

**Sprint 075 — COMPLETE (2026-03-30) — Language Consistency + Vision:**
- [x] P2-14: docs/CHANGELOG.md localized to Turkish — 300+ EN → TR translations
- [x] P2-18: VISION.md created — 7 sections, competitive analysis (5 tables), roadmap
- [x] P2-19: docs/ link audit — 4 broken links detected and fixed
- [x] P4-29: .detect-secrets v1.5.0 installed — .pre-commit-config.yaml
- [x] P5-31: God object split Phase 2 — sprint-controller.ts → result-collector.ts extraction

**Sprint 076 — COMPLETE (2026-03-31):**
- [x] P3-20: Stale heartbeat root cause fix — finalizeHeartbeat + auditor DONE skip
- [x] P3-22: Dashboard API integration test — 10 new tests, 6 describe blocks
- [x] P6-40: Graceful shutdown — SIGINT → interruptActiveSprint + killAllSessions
- [x] P5-31: God object split Phase 3 — result-collector.ts extraction (233 lines)

**Sprint 077 — COMPLETE (2026-03-31) — Docs:**
- [x] CHANGELOG + SPRINT-LOG Sprint 076 entries
- [x] .brain/ update (PROJECT-IDENTITY, DECISIONS)
- [x] CLAUDE.md + DECKENT.md module counts updated

**Sprint 078 — COMPLETE (2026-04-01), 6m 57s:**
- [x] Blueprint sync, i18n infrastructure, TR/EN docs, /api/tasks
- [x] CHANGELOG + SPRINT-LOG catch-up, HistoryPage success rate trend

**Sprint 079 — COMPLETE (2026-04-01), ~15m:**
- [x] README-TR fix, dashboard control buttons, init language-first, /api/cleanup

**Sprint 080 — COMPLETE (2026-04-01), 9m 06s:**
- [x] Dashboard UX Overhaul: WorkerCard, SprintPhaseTimeline, ActivityFeed

**Sprint 081 — COMPLETE (2026-04-01), 12m 38s:**
- [x] Settings+Config merge, full i18n coverage (44 keys), terminal logs

**Sprint 082 — COMPLETE (2026-04-02):**
- [x] MCP/CLI parity: 19 tools, 33 CLI, ADR-022
- [x] Usage card removal, v0.3.0-beta.1, init test fix
- [x] Dashboard Phase B: skeleton loading, AgentDetail enrichment, EmptyState, polish

**Sprint 130 — COMPLETE (2026-04-10) — Codebase Accuracy Reform:**
- [x] MCP server.ts instructions string fixed: Tools (15) → Tools (21), 6 missing tools added
- [x] README.md, README-TR.md, CONTRIBUTING.md MCP tool counts corrected to 21
- [x] 4 new Key Features added to README.md + README-TR.md (Rubric Grading, Worker Questions, Context-Aware Routing, Token Tracker)
- [x] Decision-engine V1 modules @deprecated (4 files), ADR-028 written
- [x] Real coverage measured: 89.33% (was falsely claiming 96%+)
- [x] .contracts/api-surface.md rubricScores + evaluationDecision fields added

**Upcoming Plans:**
- [ ] Dashboard real sprint test (P3-22) — next sprint
- [ ] P1-10..12: Multi-provider test (BLOCKED — API key required)
- [ ] Windows Codex CLI dogfooding

### Phase 3: "Documentation"
TR+EN dual language, VISION, link audit, config dashboard

### Phase 4: "Public Repo"
.detect-secrets, migrate to VerhexIO/deckent, CI/CD, npm publish

---

## Priority Matrix (P0-P6)

## P0 — npm Packaging + Dogfooding — COMPLETE ✅

| # | Issue | Status | Note |
|---|-------|--------|------|
| 1 | npm publish test | **DONE** | 518KB, 479 files, local install works |
| 2 | `deckent init` real project test | **DONE** | Tested on Windows with Vizetron (Python/FastAPI) |
| 3 | `deckent doctor` external environment | **DONE** | WSL2 + Windows, SKIP/OK/FAIL, healthScore fix |
| 4 | Shebang + bin entry | **DONE** | `deckent` + `deckent-mcp` working |
| 5 | First sprint UX | **DONE** | Sprint-002 completed successfully on Vizetron |
| 6 | Windows native support | **DONE** | shell:true in 7 files, heartbeat periodic, log capture |

## P1 — Provider & Tier Generalization

| # | Issue | Status | Note |
|---|-------|--------|------|
| 7 | Plan tiers are Claude-specific | **DONE** | performance/balanced/economic + backward compat (Sprint 072) |
| 8 | Claude subscription dependency | **DONE** | Init wizard provider-agnostic, $ removed (Sprint 072) |
| 9 | Model name currency | **DONE** | MODEL_API_IDS + resolveApiModelId() (Sprint 072) |
| 10 | Multi-provider simultaneous test | **TODO** | Claude + Codex + Gemini never tested in the same sprint |
| 11 | API + Subscription together | **TODO** | Does API key work alongside subscription? |
| 12 | Codex/Gemini CLI binary check | **TODO** | Real CLI binary verification |

## P2 — Documentation

| # | Issue | Status | Note |
|---|-------|--------|------|
| 13 | README.md stale data | **DONE** | Badge + numbers updated (Sprint 074) |
| 14 | Language inconsistency | **DONE** | docs/CHANGELOG.md localized to Turkish (Sprint 075) |
| 15 | TR+EN dual language | **PARTIAL** | .deckent/docs/ TR/EN support added |
| 16 | CHANGELOG.md empty | **DONE** | docs/CHANGELOG.md 1159 lines, Sprint 1-073 (Sprint 074) |
| 17 | Config reference missing | **DONE** | .deckent/docs/config-reference.md |
| 18 | VISION.md missing | **DONE** | VISION.md created — vision, competitive analysis, roadmap (Sprint 075) |
| 19 | docs/ link check | **DONE** | 4 broken links detected and fixed (Sprint 075) |

## P3 — UX & Dashboard

| # | Issue | Status | Note |
|---|-------|--------|------|
| 20 | Dashboard data accuracy | **DONE** | Idle state with last sprint summary, no more 404 on /api/status |
| 21 | Dashboard config interface | **DONE** | 50+ fields across 13 categories, read/write via API, fully functional |
| 22 | Dashboard real test | **DONE** | 7+ real sprints recorded, 429 dashboard tests passing, API integration tested |
| 23 | Config.json complexity | **PARTIAL** | config-reference.md exists, dashboard selection missing |
| 24 | First-use experience | **DONE** | quick-start.md, directives-guide.md, workflow guide |

## P4 — Platform & Infrastructure

| # | Issue | Status | Note |
|---|-------|--------|------|
| 25 | Windows native | **DONE** | Full support: spawn, heartbeat, log, encoding, ps guard |
| 26 | Why Node >= 18? | **TODO** | OpenClaw requires Node 22+, ES2022+ feature check |
| 27 | Docker/Sandbox | **DONE** | Live verified Sprint 119-122: CLI+MCP, 10 e2e tests, CI skip guard |
| 28 | CI/CD billing | **TODO** | Will be resolved with public repo |
| 29 | .detect-secrets | **DONE** | .pre-commit-config.yaml installed, detect-secrets v1.5.0 (Sprint 075) |

## P5 — Code Quality

| # | Issue | Status | Note |
|---|-------|--------|------|
| 30 | .gitignore runtime state | **DONE** | |
| 31 | God objects | **DONE** | Phase 1 (Sprint 072), Phase 2 (Sprint 075), Phase 3 (Sprint 076) — result-collector.ts extraction complete |
| 32 | V2 routing test-writer bias | **PARTIAL** | Exclude rule written |

## P6 — User Experience Improvements

| # | Issue | Status | Note |
|---|-------|--------|------|
| 33 | Error messages not user-friendly | **DONE** | DeckentError + suggestion + howToFix (53 error codes) |
| 34 | `deckent explain` missing from MCP | **DONE** | MCP tool added (Sprint 125), 43 tests passing |
| 35 | Telemetry/analytics | **TODO** | Opt-in usage analytics |
| 36 | `deckent upgrade` test | **DONE** | `--local` flag added, beta workflow |
| 37 | Skill marketplace backend | **TODO** | CLI command exists but no backend |
| 38 | Plugin system e2e test | **TODO** | Never tested with a real plugin |
| 39 | Rate limiting production | **TODO** | Is 100 req/60s enough? |
| 40 | Graceful shutdown | **DONE** | SIGINT handler + interruptActiveSprint + killAllSessions (Sprint 076) |

---

## Competitive Analysis

### A. OpenClaw (Open-Source Personal AI Assistant)

**Overview:** Open-source (MIT) personal AI assistant created by Peter Steinberger. **343,000+ GitHub stars** (April 2026 — surpassed React in 60 days, most-starred software project on GitHub), **1,000+ contributors**, **2 million monthly active users**, **27 million monthly web visits** (925% growth). Previous names: Clawdbot → Moltbot → OpenClaw.

**Architecture (5 Layers):**

| Layer | Name | Function | Deckent Equivalent |
|-------|------|----------|--------------------|
| 1 | **Gateway** | Always-on daemon (port 18789), message routing, session management, Control UI + WebChat | api/server.ts + mcp/server.ts |
| 2 | **Brain** | LLM orchestration via ReAct reasoning loop | orchestra/sprint-controller.ts |
| 3 | **Memory** | Persistent context in Markdown files (local-first) | .brain/ directory |
| 4 | **Skills** | 13,729 ClawHub skills (65%+ MCP server wrappers): filesystem, shell, browser, email, 400+ apps | 21 built-in skills |
| 5 | **Heartbeat** | Autonomous task scanning daemon at 30-minute intervals | ✅ heartbeat-daemon.ts (Sprint 088) |

**OpenClaw Features Missing from Deckent:**

1. ~~**Heartbeat Daemon**~~ — ✅ Added in Sprint 088: `deckent heartbeat --daemon` for periodic task scanning, reads `.deckent/HEARTBEAT.md` and executes.
2. **50+ Channel Integrations** — WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Teams, Matrix. Deckent only has CLI + MCP + Dashboard.
3. **Browser Control** — Web browser automation, page navigation, form filling. Not in Deckent.
4. **Always-On Gateway** — Persistent running daemon. Deckent is sprint-based (start-finish model).
5. **Autonomous Scheduled Tasks** — Runs without user prompting via HEARTBEAT.md. Deckent always waits for human trigger.
6. **Local-First Memory** — Persistent memory in Markdown. Deckent has .brain/MEMORY.md which is similar but more limited (300-line cap).

**OpenClaw's Weaknesses Compared to Deckent:**

1. Single-agent — no parallel multi-worker support
2. No sprint planning — every request is one-shot
3. No scope enforcement — full filesystem access
4. No multi-provider orchestration — single LLM
5. No structured task decomposition
6. No quality evaluation (GO/NO_GO)

**Lessons for Deckent:**
- Heartbeat daemon model is important — a proactively running system
- Channel integrations (Slack, Telegram) expand user reach
- Always-on gateway model is more autonomous than sprint-based
- Skill marketplace (13,729 skills, ClawHub) ecosystem growth strategy — the SKILL.md markdown pattern is simple and effective
- 2M MAU, 27M web visits — open-source community growth strategy worth studying

---

### B. Microsoft Copilot Cowork (Enterprise AI Orchestrator)

**Overview:** Enterprise AI agent system developed by Microsoft in collaboration with Anthropic. Offered in the M365 Frontier product. Launched March 2026.

**Architecture:**

| Feature | Detail | Deckent Equivalent |
|---------|--------|--------------------|
| Multi-model | GPT + Claude "critique layer" — GPT writes, Claude verifies | Multi-provider (Claude + Codex + Gemini) |
| Enterprise Graph | Outlook, Teams, Calendar, SharePoint, Excel integration | Filesystem + git only |
| Autonomous Plan | User defines outcome, Cowork plans execution | DIRECTIVES.md → plan → execute |
| Checkpoints | Human approval points during plan execution | ✅ human_checkpoints config (Sprint 088) |
| Background Work | Tasks continue in the background | Sprint runs in background (tmux/subprocess) |

**Cowork Features Missing from Deckent:**

1. ~~**Human Checkpoints**~~ — ✅ Added in Sprint 088: approval points at plan/evaluate/fix phases, `waitForHumanApproval()` mechanism.
2. **Critique Layer** — Model A writes, Model B verifies. Deckent uses a single model per task.
3. **Enterprise Data Graph** — Email, calendar, file relationships. Deckent handles only code + files.
4. **Progressive Disclosure** — User can see as much detail as desired. Deckent is all-or-nothing (dashboard or terminal).

**Cowork's Weaknesses Compared to Deckent:**

1. Limited code-writing capability — focused on general work automation
2. No self-hosted option — Microsoft cloud required
3. Not open source — not extensible
4. Price: $30+/user/month mandatory M365 license

**Lessons for Deckent:**
- Critique layer (Model A writes + Model B verifies) improves quality
- Human checkpoints enable reliable yet autonomous workflows
- Enterprise data integration (Jira, Linear, GitHub) is an important expansion area

---

### C. Perplexity Computer (Multi-Model AI Agent System)

**Overview:** Launched February 25, 2026. $200/month (Max, 10,000 credits included), $325/seat/month (Enterprise Max). Orchestrates **19 specialized AI models**. Spending limit: default $200, max $2,000.

**Model Roles:**

| Model | Role | Deckent Equivalent |
|-------|------|--------------------|
| Claude Opus 4.6 | Central reasoning engine | brain_provider: claude |
| GPT-5.2 | Long-context recall, web search | worker_provider alternative |
| Gemini | Deep research | worker_provider alternative |
| Grok (xAI) | Lightweight, speed-priority operations | haiku tier equivalent |
| Nano Banana | Image generation | N/A |
| Veo 3.1 | Video generation | N/A |
| +13 others | Special-purpose tasks | N/A |

**Architecture:**

| Feature | Detail | Deckent Equivalent |
|---------|--------|--------------------|
| Multi-model | 19 models, automatic task-based selection | 3 providers, 13 models, ModelRegistry + routing engine |
| Task Decomposition | Goal → subtask → sub-agent → specialist model | DIRECTIVES → task JSON → worker |
| Parallel Execution | Multiple sub-agents running simultaneously | Max 4-5 workers in parallel |
| Cloud Sandbox | Isolated environment, real filesystem, browser | Local filesystem |
| 400+ Apps | Slack, Gmail, GitHub, Notion integration | Limited (git, files, tests) |
| Duration | Can run for hours, days, even months | Sprint-based (minutes-hours) |
| Credit System | 10K credits/month, consumption based on task complexity | N/A (flat usage) |

**Perplexity Computer Features Missing from Deckent:**

1. **19 Specialized Models** — Best model automatically selected per subtask. Deckent has 13 models + ModelRegistry + routing engine with similar logic, but fewer models.
2. **Tasks Lasting Days/Months** — Long-running autonomous operation. Deckent is sprint-based (short duration).
3. **400+ App Integrations** — Web, email, social media, database. Deckent only covers development tools.
4. **Cloud Sandbox** — Isolated environment, security. Deckent is local (both an advantage and disadvantage).
5. **Credit-Based Pricing** — Usage-scaled cost. Deckent is flat (free but resource-limited).

**Perplexity Computer's Weaknesses Compared to Deckent:**

1. $200-325/month price — Deckent is free + open source
2. No self-hosted option — data security concerns
3. Limited code expertise — general purpose
4. No sprint planning/retrospective
5. No scope enforcement

**Lessons for Deckent:**
- Increasing model count (Grok, Llama, Mistral) provides competitive advantage
- Long-running task support (multi-sprint chaining)
- ✅ Dynamic model selection strengthened with ModelRegistry (Sprint 097) — 13 models, tier-based routing

---

### D. Devin 2.0/3.0 (Autonomous Software Engineer)

**Overview:** Cognition Labs. $20/month (Core, $2.25/ACU), $500/month (Team, $2.00/ACU, 250 ACU included). 1 ACU ≈ 15 minutes of work. v2.0 March 2026, v3.0 added dynamic replanning.

**Compound AI Architecture (Not a Single Model, but a Model Swarm):**

| Component | Role | Deckent Equivalent |
|-----------|------|--------------------|
| **Planner** | High-reasoning model, strategy determination | planner.ts (AI mode) |
| **Coder** | Code-specialist model, trained on trillions of tokens | Worker (general purpose) |
| **Critic** | Adversarial model, security + logic review | N/A — single model per task |

**Architecture:**

| Feature | Detail | Deckent Equivalent |
|---------|--------|--------------------|
| Interactive Planning | Collaborative planning with user, back-and-forth | DIRECTIVES.md (one-directional) |
| Cloud IDE | Parallel Devin instances, in-browser editor | tmux/subprocess workers |
| Devin Wiki | Automatic repo indexing, architecture diagrams, source links | .brain/ memory system |
| Dynamic Replanning (v3.0) | Completely changes strategy when stuck | mid-sprint-adapter.ts (limited, max 1 reroute) |
| Legacy Refactoring | COBOL/Fortran → Rust/Go/Python | Stack detection exists, refactoring limited |
| UI Mockup → Code | Figma/visual → code generation | N/A |
| Code + Test + Deploy | Full software lifecycle | Code + test (no deploy) |

**Devin Features Missing from Deckent:**

1. **Interactive Planning** — Collaborative planning with the user. In Deckent, DIRECTIVES are written and planning is one-directional.
2. **Dynamic Replanning** — Completely different strategy when stuck. Deckent's mid-sprint reroute is limited (max 1 attempt).
3. **Devin Wiki** — Automatic repo indexing + architecture diagrams. Not in Deckent.
4. **Cloud IDE** — Live code editor in browser. Deckent is CLI-based.
5. **Deploy Capability** — Deploy to production. Not in Deckent.

**Devin's Weaknesses Compared to Deckent:**

1. Single-agent — no parallel multi-agent support
2. No sprint/retrospective system — limited learning
3. $20-500/month — Deckent is free
4. No self-hosted option
5. No multi-provider orchestration
6. No scope enforcement

**Lessons for Deckent:**
- Interactive planning (user collaboration) is an important UX improvement
- Codebase Wiki/indexing (semantic search) is a major advantage
- Dynamic replanning (mid-sprint plan changes) needs strengthening

---

### E. Claude Agent SDK + Computer Use (Anthropic Ecosystem)

**Overview:** Anthropic's official agent SDK. Built on the Claude Code infrastructure. Computer Use Agent launched March 2026.

**Architecture:**

| Feature | Detail | Deckent Equivalent |
|---------|--------|--------------------|
| Computer Use | Desktop control: click, type, launch apps | N/A |
| Agent SDK | Autonomous agent creation infrastructure | MCP integration |
| Worktree Isolation | Isolated work via git worktree | Scope enforcement |
| Background Agents | Parallel subtasks | Workers (similar) |
| Voice Mode | Voice control in 20 languages | N/A |
| Loop/Schedule | Cron-style scheduled tasks | ✅ heartbeat-daemon.ts (Sprint 088) |
| Dispatch | Autonomous operation when user is away | Sprint background execution (similar) |

**Lessons for Deckent:**
- Claude Agent SDK integration is a natural expansion path
- Computer Use capability (browser, desktop) is a differentiator
- Loop/schedule (scheduled tasks) is similar to heartbeat daemon
- Worktree isolation already exists in scope enforcement — can be strengthened

---

### F. Claude Managed Agents — CMA (Anthropic Cloud Agent Platform)

**Overview:** Anthropic's managed agent infrastructure. Beta launched April 1, 2026 (`managed-agents-2026-04-01` header). Fully managed cloud platform where agents run on Anthropic's infrastructure — distinct from the Claude Agent SDK (Section E), which is a local development toolkit. REST API + SDKs in 7 languages (Python, TypeScript, Java, Go, C#, Ruby, PHP). Agents run in provisioned cloud containers with pre-installed packages and configurable network rules. Pricing: pay-per-use API billing. CLI tool: `ant` (Go-based).

**Architecture:**

| Feature | Detail | Deckent Equivalent |
|---------|--------|--------------------|
| Versioned Agents | Every agent update creates immutable version, rollback possible | agent.json (static, no versioning) |
| Versioned Memory | API-managed memory stores with SHA-based optimistic concurrency, redact for compliance | .brain/MEMORY.md (flat file, no versioning) |
| Rubric-Based Grading | Define rubrics, auto-grade with separate context window grader, iterate up to 20x | result-evaluator.ts (simple GO/NO_GO) |
| Managed Environments | Cloud containers with pre-installed packages (pip/npm/apt/cargo/gem/go), network rules | Docker backend (Sprint 101+, less structured) |
| Multi-SDK | Python, TS, Java, Go, C#, Ruby, PHP SDKs | TypeScript CLI only |
| Session Threads | Multi-agent with isolated context windows per agent thread | Worker scope enforcement (file-level, not context-level) |
| Custom Tools API | JSON schema tool definitions, client-side execution | MCP tools (similar, but no custom tool definition API) |
| Progressive Skills | Anthropic pre-built (xlsx, pptx, pdf, docx) + custom skills, on-demand loading | skill-registry (similar, AST sandbox) |
| SSE Streaming | Server-Sent Events for real-time agent output, event-driven architecture | HTTP API + SSE (Sprint 10, less structured) |

**CMA Features Missing from Deckent:**

1. **Rubric-Based Grading** — Define evaluation rubrics, auto-grade with separate context window grader, iterate up to 20x until rubric passes. Deckent's result-evaluator.ts does simple GO/NO_GO without structured rubric definitions.
2. **Versioned Memory Stores** — API-managed memory with immutable version history, SHA-based optimistic concurrency, redact operations for compliance. Deckent's .brain/MEMORY.md is a flat file with no versioning or concurrency control.
3. **Agent Versioning** — Every agent update creates a new immutable version, rollback to any previous version. Deckent's agent.json is static — no version history.
4. **Multi-SDK Support** — SDKs in 7 languages enabling any tech stack to drive agents. Deckent is TypeScript-only CLI.
5. **Managed Cloud Containers** — Provisioned containers with pre-installed packages (6 package managers) and network access rules (unrestricted/limited). Deckent has Docker backend but less structured environment management.
6. **Session Thread Isolation** — Each agent in a multi-agent session has its own context window and conversation history. Deckent's scope enforcement is file-level, not context-level.

**CMA's Weaknesses Compared to Deckent:**

1. Single provider (Claude only) — Deckent supports 3 providers, 13 models via ModelRegistry
2. No sprint lifecycle — session-based, stateless between sessions
3. No learning loop / self-improvement — no routing evolution, no synergy tracking
4. No scope enforcement / boundary violation detection — agents have full container access
5. No auditor pattern — no independent runtime quality monitoring
6. No tech debt tracking — no DEBT.md equivalent
7. No retrospective system — no cross-session learning
8. Cloud-only, no self-hosting option — data leaves your infrastructure
9. Paid API service — Deckent is free + open source
10. Single-level delegation only (coordinator → agents, no deeper nesting)

**Lessons for Deckent:**
- Rubric-based grading would transform result-evaluator.ts from binary GO/NO_GO to structured, iterative quality assessment
- Versioned memory stores would add rollback + compliance capabilities to .brain/ system
- Agent versioning would enable safe A/B testing and rollback of agent configurations
- Multi-SDK approach (at minimum a REST API with OpenAPI spec) would expand Deckent beyond TypeScript users
- Managed environment templates could further structure the Docker backend

---

### G. Comparison Matrix

| Capability | OpenClaw | Cowork | Perplexity | Devin | Claude SDK | CMA | **Deckent** |
|------------|----------|--------|------------|-------|------------|-----|-------------|
| **Open Source** | MIT | No | No | No | SDK yes | No | **MIT** |
| **Self-Hosted** | Yes | No | No | No | Partial | No | **Yes** |
| **Price** | Free | M365 | $200/mo | $20/mo | API | API pay-per-use | **Free** |
| **Multi-Agent Parallel** | No | Limited | Yes | No | Partial | Yes (threads) | **Yes** |
| **Sprint Planning** | No | No | No | No | No | No | **Yes** |
| **Scope Enforcement** | No | No | Cloud | No | Worktree | No | **Yes** |
| **Multi-Provider** | No | 2 | 19 | No | 1 | 1 | **3 (13 models, ModelRegistry)** |
| **Retrospective/Learning** | Limited | No | No | Wiki | No | No | **Yes** |
| **MCP Native** | No | No | No | No | Yes | No | **Yes** |
| **Heartbeat Daemon** | 30min | No | Yes | No | Loop | No | **✅ Yes (Sprint 088)** |
| **Human Checkpoints** | No | Yes | No | Yes | No | No | **✅ Yes (Sprint 088)** |
| **Interactive Planning** | No | Yes | No | Yes | No | No | **No** |
| **Browser Control** | Yes | No | Yes | Yes | Yes | No | **No** |
| **Channel Integration** | 50+ | M365 | 400+ | Slack | No | API | **No** |
| **Codebase Indexing** | No | No | No | Wiki | No | No | **No** |
| **Always-On** | Yes | Yes | Yes | No | Dispatch | Yes (cloud) | **No** |
| **Long-Running Tasks** | Yes | Yes | Days | Hours | Hours | Hours | **Unlimited (Sprint 088)** |
| **Skill Ecosystem** | 13,729 | - | - | - | 5,700 | Custom tools | **21** |
| **Critique Layer** | No | GPT+Claude | No | Planner+Critic | No | Rubric grader | **No** |
| **Rubric Grading** | No | No | No | No | No | Yes (20x iterate) | **No** |
| **Agent Versioning** | No | No | No | No | No | Yes (immutable) | **No** |
| **Versioned Memory** | Limited | No | No | No | No | Yes (SHA-based) | **No** |
| **Multi-SDK** | No | No | No | No | Limited | 7 languages | **TS only** |
| **GitHub Stars** | 343K+ | - | - | - | - | - | **~0 (beta)** |
| **Community** | 1,000+ contrib | - | - | - | - | - | **1 (solo)** |

### H. Deckent's Unique Position

**Features found together in no other competitor:**
1. Multi-agent parallel execution + scope enforcement + sprint planning + retrospective learning + multi-provider + MCP native + open source + free + self-hosted

**Strategic position:** Deckent is the only open-source solution in the "developer team orchestrator" niche. Competitors are either single-agent (Devin, OpenClaw), closed/expensive (Cowork, Perplexity), or cloud-only API services (CMA).

**Growth comparison:**
- OpenClaw: 0 → 343K stars in 4 months. Stars/day: ~2,860
- Deckent: Not yet published as open source. Launch strategy will be decisive.

---

## Verified Blockers (Code-Verified)

Every blocker was directly verified in the codebase. False claims have been corrected.

### BLOCKER-1: LEARNING LOOP BROKEN — ✅ RESOLVED (Sprint 091)

**Original state:** 3/4 sub-claims were true

| Sub-Claim | Original | Sprint 091 Fix |
|-----------|----------|----------------|
| RuleEvolver generates rules but doesn't apply them | **TRUE** | ✅ Evolved rules now auto-applied; injected into agent/skill activation during planSprint() |
| Agent tiebreaker not working in V2 | **TRUE** | ✅ getLearningBonus() reads from learnings.json (instead of agent.json stats) |
| Promotion/demotion not executing | **TRUE** | ✅ pipeline.promote() and pipeline.demote() are now called |
| Quality score not used | **TRUE** | ✅ avgQualityScore integrated into routing bonus calculation |
| Skill stats not updating | **TRUE** | ✅ updateSkillStats() called in V1, skill table generated in RETRO |
| Hard-coded constants | **TRUE** | ✅ Read from LearningConfig (minSamplesForBonus, recentSprintWindow) |

**Result:** Learning loop fully closed. 8 broken points fixed in Sprint 091.

### BLOCKER-2: INTENT CLASSIFIER IS STATIC (VERIFIED)

**Status:** VERIFIED

- `intent-classifier.ts:10-44` — `INTENT_KEYWORDS`, `OPERATION_KEYWORDS`, `SCOPE_INTENT_SIGNALS` all defined as `const`
- No dynamic functions like `updateWeights()`, `learn()`, `feedback()`
- Keyword weights unchanged across 84 sprints
- No mechanism for misclassification feedback

### BLOCKER-3: SILENT ERROR SWALLOWING — ✅ RESOLVED (Sprint 085+086+087+088)

**Original:** 49 silent catch blocks
**Fix:** Converted to debugLog (Sprint 085: 15, Sprint 086: 14, Sprint 088: remaining ~20)
- Converted: cleanup(7), finalizeSprint(7), spawnWorkers(5), evaluateResults(5), planSprint(5), utility functions

### BLOCKER-4: COVERAGE THRESHOLD — ✅ RESOLVED (Sprint 086)

**Original:** 90% hardcoded, no config override
**Fix:** `config.coverage_threshold` (default 90) — 6 files updated:
- config-types.ts: field added to DeckentConfig + ResolvedConfig
- config.ts: added to defaults + loadConfig return
- result-evaluator.ts: received as evaluateResult() parameter
- sprint-phases.ts: passed by runEvaluatePhase() + runFixPhase()
- sprint-controller.ts: passes config.coverage_threshold

### Corrected False Claims

| Claim | Reality | Evidence |
|-------|---------|----------|
| "AI planner has no fallback" | **FALSE** — `auto` mode falls back to structured | sprint-controller.ts:601-643 |
| "Agent stats not persisted" | **FALSE** — `updateAgentStats()` called at sprint end, writes to agent.json | agent-pool.ts:344-371, sprint-controller.ts:1292 |
| "goNogo.goCriteria ignored" | **FALSE** — Limited checking is in place | result-evaluator.ts:68-76 |

---

## Self-Improvement Roadmap

### PHASE 0: Observability Foundation — ✅ COMPLETE (Sprint 085)

- ✅ debugLog() 3-param overload + .brain/ERRORS.md (max 200 lines, append)
- ✅ Decision trail: .deckent/routing/decisions/decision-{sprint}-{task}.json
- ✅ applyEvolvedRules(): confidence >= 0.85 → automatic manifest update + rollback
- ✅ getSynergyBonuses(): skill pair success rate → routing bonus/penalty (+2/-2)

### PHASE 1: Close the Learning Loop — ✅ COMPLETE (Sprint 086)

- ✅ sprintId/taskId/projectRoot added to routeTaskV2 call sites (decision trail active)
- ✅ 14 additional silent catches → debugLog (29/49 total converted)
- ✅ coverage_threshold: hardcoded 90 → config.coverage_threshold (DeckentConfig + ResolvedConfig)
- ✅ INTENT_WEIGHTS: dynamic weight system + updateIntentWeights() + loadIntentWeights()
- ✅ getWorstCombinations(5): PAST RESULTS block added to AI planner prompt
- ⚠️ Remaining tech debt: ~20 silent catches, task-router.ts call site, planner integration

### PHASE 2: Autonomous Adaptation — ✅ COMPLETE (Sprint 088+091)

**Goal:** System modifies its own structure

**2.1 Adaptive Thresholds** — ✅ COMPLETE (Sprint 088)
- ✅ applyAdaptiveThresholds() + getRecentSprintStats()
- ✅ NO_GO rate > 30% → automatically lower agent_min_score
- ✅ Consistently low coverage → adjust threshold to project average
- ✅ `adaptive_thresholds: true` + `adaptive_config` configurable

**2.2 Dynamic Model Selection Improvement** — ✅ COMPLETE (Sprint 097 — ModelRegistry)
- ✅ ModelRegistry class: 13 models, 3 providers, single source of truth (model-registry.ts)
- ✅ Tier-based routing: premium_plus/premium/standard/economy tiers
- ✅ Provider-agnostic config: brain_tier/worker_tier (instead of model names)
- ✅ MODE_PRESETS: performance/balanced/economic/api strategies (mode-presets.ts)
- ✅ BUILTIN_MODELS catalog: cost, speed, context information
- ✅ Init wizard tier selection: selectTiers() + tierToModel() refactor
- ⏳ Token usage tracking (historicalTokenUsage) — detailed work plan in Section X.I
- ⏳ Context-Aware Routing (context budget → model selection → task splitting) — Section X.I

**2.3 Mid-Sprint Reroute Strengthening** — ✅ COMPLETE (Sprint 088)
- ✅ Max reroute: config.max_reroutes (default 3)
- ✅ Reroute option on GO_WITH_TECH_DEBT (config.reroute_on_tech_debt)
- ✅ Confidence threshold: reroute only when confidence > 0.7

**2.4 Agent/Skill Evolution Pipeline** — ✅ COMPLETE (Sprint 091)
- ✅ Agent tiebreaker: reads from learnings.json via getLearningBonus()
- ✅ Promotion/demotion: pipeline.promote() and pipeline.demote() execute
- ✅ Evolved rules: auto-applied rules injected into activation
- ✅ Skill stats: updateSkillStats() called in V1, skill table in RETRO
- ✅ Quality score: avgQualityScore integrated into routing bonus
- ✅ Config-driven: minSamplesForBonus, recentSprintWindow read from LearningConfig
- ✅ Integration test: evolution-pipeline.test.ts end-to-end test

### PHASE 3: Proactive System — ✅ PARTIALLY COMPLETE (Sprint 088)

**Goal:** OpenClaw's heartbeat daemon model — system runs on its own

**3.1 Heartbeat Daemon** — ✅ COMPLETE (Sprint 088)
- ✅ `.deckent/HEARTBEAT.md` scan file
- ✅ `HeartbeatDaemon` class: periodic execution (configurable interval)
- ✅ `deckent heartbeat` CLI command (one-shot + daemon + stop)
- ✅ Results logged to `.brain/heartbeat-log.md`
- ⏳ Notify user of results (Slack/terminal/dashboard) — not yet implemented

**3.2 Always-On Gateway (Optional)** — ⏳ PENDING
- Run API server as daemon
- Continuous monitoring via SSE
- Remote control: start/stop sprint from phone/web

**3.3 Multi-Sprint Chaining** — ⏳ PENDING
- Automatically start Sprint B when Sprint A completes
- `## Next Sprint:` block in DIRECTIVES.md
- Long-running tasks: sprint chains running for days

### PHASE 4: Human-in-the-Loop — ✅ PARTIALLY COMPLETE (Sprint 088)

**Goal:** Cowork/Devin-level human collaboration

**4.1 Worker Question Mechanism** — ⏳ PENDING
- Worker: `askBrain(question)` → IPC message to Brain
- Brain → relay question to user (CLI prompt / dashboard dialog / Slack)
- Answer → return to worker
- Timeout: default action if no response in 5 minutes

**4.2 Human Checkpoints** — ✅ COMPLETE (Sprint 088)
- ✅ After plan phase: `waitForHumanApproval('plan', ...)` approval
- ✅ After evaluate phase: `waitForHumanApproval('evaluate', ...)` approval
- ✅ Before fix phase: `waitForHumanApproval('fix', ...)` approval
- ✅ Configurable: `human_checkpoints: ['plan', 'evaluate', 'fix']`
- ✅ File-based approve/reject: `.deckent/checkpoints/` directory
- ✅ `SprintStatus.ABORTED` — sprint halted if rejected

**4.3 Interactive Planning** — ⏳ PENDING
- Devin model: collaborative planning with the user
- DIRECTIVES draft → AI suggests → user edits → finalize
- Plan editor in dashboard

### PHASE 5: Ecosystem Expansion (4+ sprints)

**Goal:** Perplexity/OpenClaw-level integration breadth

**5.1 Channel Integrations**
- Slack bot: sprint status, notifications, commands
- GitHub Issues/PR integration: issue → automatic task
- Linear/Jira: ticket → DIRECTIVES

**5.2 Codebase Semantic Indexing**
- Devin Wiki-style: automatic repo indexing
- AST-based dependency graph
- "If you change this file, these files are affected" knowledge
- RAG for enriching worker context

**5.3 Critique Layer (Cowork Model)**
- Model A writes, Model B verifies
- AI-powered evaluation in result-evaluator.ts
- Worker's own code reviewed by a different provider

**5.4 Browser/Computer Use**
- Claude Computer Use SDK integration
- Web application test automation
- UI/UX review (screenshot analysis)

**5.5 Provider Expansion**
- Grok, Llama, Mistral, DeepSeek adapters
- 13 → 19+ model support (ModelRegistry infrastructure ready — Sprint 097)
- Approaching Perplexity's 19-model footprint

**5.6 Rubric-Based Grading (CMA Model)**
- Define evaluation rubrics per task type (code quality, test coverage, documentation completeness)
- Separate grader context window — evaluator does not share context with worker
- Iterative improvement: re-attempt up to N times until rubric passes
- Upgrade result-evaluator.ts from binary GO/NO_GO to rubric-scored evaluation

**5.7 Versioned Memory & Agent Versioning (CMA Model)**
- .brain/MEMORY.md → versioned memory store with SHA-based concurrency
- Agent version history: every agent.json change creates immutable version
- Rollback to any previous agent or memory version
- Redact operations for compliance (PII removal from memory history)

**5.8 Multi-SDK / REST API (CMA Model)**
- REST API layer on top of HTTP API for programmatic access
- Language-agnostic client: any HTTP client can drive Deckent sprints
- OpenAPI spec → SDK generators (Python/Go/Java clients)

---

## Sprint Metrics
| Metric | Value |
|--------|-------|
| Sprint | sprint-129 |
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 0 |
| No-Go | 0 |
| Duration | 14dk 43sn |
| Coverage | 29.8% |

## Sprint History
| Sprint | Status |
|--------|-------|
| sprint-124 | completed |
| sprint-125 | completed |
| sprint-126 | completed |
| sprint-127 | completed |
| sprint-128 | completed |
| sprint-129 | completed |

## Dogfooding Bug Tracker

### Sprint 070 — Init UX Overhaul (15 fixes)

| Bug | Description | Fix |
|-----|-------------|-----|
| BUG-3 | Claude CLI spawn ENOENT (Windows) | `shell: process.platform === 'win32'` — 7 files |
| BUG-4 | Worker rules hardcoded `tsc --noEmit` | Pass `detectFullStack()` result to worker rules |
| BUG-6 | Stack detection `Language: unknown` | Always run stack detection |
| BUG-7 | Doctor FAIL+OK contradiction | FAIL → SKIP label (optional providers) |
| BUG-8 | Framework `next` (should be fastapi) | Skip JS framework detection in Python/Go/Rust projects |
| BUG-9 | IDENTITY.md file missing | Create workspace IDENTITY.md during init |
| BUG-10 | DECKENT.md `Build: tsc` (in Python project) | `!== undefined` check + `echo "no build step"` |
| BUG-11 | DIRECTIVES.md empty placeholder | Stack-aware example task format + TR/EN template |
| BUG-12 | Worker rules hardcoded `npx vitest run` | Use `detectFullStack().commands.test` |
| BUG-13 | Brain rules wrong limits | 200→300, 600→900 |
| BUG-14 | TempAgent not created | Expanded matching with `detectedLanguages` |
| BUG-15 | BOOT.md no user hints | User-friendly explanation + tips (TR/EN) |
| BUG-16 | `ps: unknown option -- o` (Windows) | `process.platform !== 'win32'` guard |
| BUG-18 | MCP binary name inconsistent | Documentation: `deckent-mcp` separate binary |

### Sprint 071 — Dogfooding Bug Fixes (7 fixes + upgrade)

| Bug | Description | Fix |
|-----|-------------|-----|
| BUG-19 | UTF-8 encoding Windows | LANG + PYTHONIOENCODING env vars added to subprocess |
| BUG-21 | Doctor healthScore=0 all checks passed | `c.ok` → `c.passed` field mismatch fixed |
| BUG-22 | Review "No tasks found" after sprint | `loadTaskResults()` archive/ fallback added |
| BUG-23 | Heartbeat 28x stale, sequence=1 | setInterval 15s periodic heartbeat update |
| BUG-24 | Worker not writing .result file | Fallback .result on child exit |
| BUG-25 | Scope parser ignoring Files/Scope | Explicit `Files:` / `Scope:` label parsing |
| BUG-26 | Task log empty (Windows) | closeSync(logFd) moved to child exit handler |
| — | Version bump + upgrade --local | `deckent upgrade --local <path.tgz>` beta workflow |

### Sprint 070 — New Features

| Feature | Description |
|---------|-------------|
| `.deckent/workspace/IDENTITY.md` | Project identity populated with stack detection results |
| `.deckent/docs/quick-start.md` | First sprint guide in 5 steps (TR/EN) |
| `.deckent/docs/directives-guide.md` | DIRECTIVES format guide + field descriptions |
| `.deckent/docs/config-reference.md` | Full config.json settings reference |
| TempSkill at init | `project-conventions` skill auto-created |
| TempAgent at init | Temp agents created based on project stack |
| DECKENT.md Workflow | Workflow steps, DIRECTIVES format, Providers section |
| Worker prompt stack-aware | DECKENT.md reference instead of hardcoded `tsc`/`vitest` |
| allowedTools expansion | `Edit`, `Glob`, `Grep` added to worker tools |

### Known Open Bugs

| Bug | Description | Severity | Note |
|-----|-------------|----------|------|
| BUG-17 | Worker not writing .result (original) | Low | Partially resolved by BUG-24 fallback |
| BUG-20 | Permission dialog slowing down worker | Low | Can be bypassed with `--dangerously-skip-permissions` |

---

## Docker & Infrastructure

### A. Critical Issues Found and Fixed (3)

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Container auth fail | `~/.cache/claude/` mount → credentials at `~/.claude/.credentials.json` | `~/.claude/` mount |
| `--dangerously-skip-permissions` blocked | Container running as root, Claude CLI blocks root | `--user uid:gid` for non-root |
| Config warnings | `~/.claude.json` not mounted | Conditional `.claude.json` mount |

### B. E2E Test Results

- **Single worker**: `.result` file reached host from container ✅
- **2 parallel workers**: Both completed independently ✅
- **Container auto-cleanup**: `docker wait` + `docker rm -f` ✅
- **Heartbeat**: `exitCode: 0`, `status: DONE`, `backend: docker` ✅
- **Timeout marker**: Not created on successful job ✅

### C. Sprint 103 Results (7 Tasks)

| Result | Count | Detail |
|--------|-------|--------|
| DONE | 5 | ANALYSIS update, README badge, module counts, Docker test, Docker guide |
| NO_GO | 1 | don't-ask mode → Edit/Write permission denied (debt-098-001) |
| GO_WITH_TECH_DEBT | 1 | Already resolved debt, only DEBT.md marking remaining |

### D. New Features Added

1. **`checkDocker()`** — Docker daemon + worker image check added to Doctor (14 checks)
2. **Init Docker detection** — Automatic `spawn_backend: docker` set when Docker is available
3. **`tests/e2e/docker-backend.test.ts`** — 10 integration tests (spawn, heartbeat, cleanup, concurrent, log extraction)
4. **`docs/guide/docker-backend.md`** — 362-line comprehensive guide

### E. Container Exit Code Analysis (Sprint 103 Test Containers)

| Exit Code | Meaning | Count | Detail |
|-----------|---------|-------|--------|
| 0 | Successful | 1 | debug2 container |
| 137 | SIGKILL (timeout) | 8 | Kill after test timeout |

### F. Issues Detected and Resolved

| # | Issue | Status | Fix |
|---|-------|--------|-----|
| 1 | MCP server caching old dist/ | ⚠️ Known | MCP restart required after `tsc` (dynamic import does not bypass ESM cache) |
| 2 | Worker don't-ask mode | ✅ **RESOLVED** | MCP start `autoApprove: default(true)` — commit `574ef65` |
| 3 | autoApprove not passing | ✅ **RESOLVED** | MCP start default(false)→default(true) — commit `574ef65` |
| 4 | Worker exits without writing .result | ✅ **RESOLVED** | Shell EXIT trap added (tmux + docker) — commit `c5d2c89` |
| 5 | Config revert (spawn_backend deleted) | ✅ **RESOLVED** | `updateLastSprintId()` null guard — commit `574ef65` |
| 6 | MCP run not spawning worker | ✅ **RESOLVED** | `buildWorkerPrompt` + `SpawnBackendFactory` added — commit `574ef65` |
| 7 | Docker auth mount wrong | ✅ **RESOLVED** | `~/.cache/claude/`→`~/.claude/` + non-root — commit `e807891` |
| 8 | Doctor missing Docker check | ✅ **RESOLVED** | `checkDocker()` added — commit `e807891` |
| 9 | debt-098-001 duplicate ID | ✅ **RESOLVED** | `debtId` guard added — commit `5080d16` |

### G. `deckent run` Test Results

**Previous state (before fix):**

| Method | Model | Result | Detail |
|--------|-------|--------|--------|
| MCP `deckent_run` | sonnet | **TIMEOUT** | Worker not spawned (only wrote JSON) |
| CLI `deckent run --auto-approve` | haiku | **TIMEOUT** | No EXIT trap, not writing .result |

**Current state (after fix — verification pending):**
- MCP run: config-aware worker spawn via `SpawnBackendFactory`
- EXIT trap: fallback NO_GO result on worker crash/timeout
- autoApprove: `default(true)` — `--dangerously-skip-permissions` automatic

### H. Current Work Plan (Sprint 104+)

**Priority 1 — Docker Sprint Live Verification**
1. ✅ Docker sprint live test after MCP server restart (Sprint 120-122)
2. ✅ `deckent run` MCP + CLI live verification (Sprint 121 CLI exit 0, Sprint 122 MCP reconnect OK)
3. ✅ Docker container timeout reading from config (`docker_timeout` in config.json, default 1200s)

**Priority 2 — Beta Preparation**
4. ✅ README Docker backend section + Quick Start (README.md:387-405, docs/guide/docker-backend.md)
5. ✅ Version bump 0.4.0-beta.1 (already done)
6. ✅ CLI/MCP start parity (both read config.spawn_backend via SpawnBackendFactory, MCP doctor skip documented)

**Priority 3 — Feature Expansion**
7. ⏳ Hybrid backend (Docker worker + subprocess auditor) — ADR to be written
8. ⏳ Dashboard Docker container status display
9. ✅ spawnWorkerMultiProvider config-aware (reads config.spawn_backend + docker_image + docker_timeout)

### Session Wrap-Up (April 7, 2026 — 10 commits)

Docker backend brought to working state in live environment during this session. Summary:

| Category | Detail |
|----------|--------|
| Commits | 10 (3 feat, 6 fix, 1 docs) |
| New files | `tests/e2e/docker-backend.test.ts` (7 tests), `docs/guide/docker-backend.md` (362 lines) |
| CI | ❌ 3 fail → ✅ 19/19 GREEN |
| Debt | 2 open → 0 open |
| Tests | 12,062 pass, 0 fail |
| Coverage | 90% line, 89% branch, 95% function |

**Critical fixes:** Docker auth (3 fixes), Worker EXIT trap (.result guarantee), Config revert guard, MCP autoApprove default(true), MCP run worker spawn, MockSpawnBackend CI crash.

### Session Wrap-Up (April 8-9, 2026 — Docker Live Verification)

Docker backend live E2E sprint verification completed across Sprint 119-122. Summary:

| Category | Detail |
|----------|--------|
| Sprints | 119 (NO_GO), 120 (NO_GO), 121 (CLI GO), 122 (MCP GO) |
| Docker tests | 7 → 10 e2e tests (log extraction, monitor updates) |
| CI fix | Coverage job Docker e2e `skipIf(!dockerAvailable)` guard added |
| Live results | CLI exit 0 verified, MCP reconnect verified, smoke files created |
| Files created | `docs/docker-smoke/cli-test.md`, `docs/docker-smoke/mcp-ok.md` |

**Key insight:** Sprint 119-120 Docker worker exited without writing result file — identified as MCP cache issue. After MCP server restart + CLI fallback, Sprint 121 CLI and Sprint 122 MCP both succeeded.

### I. Token Usage Analysis + Context-Aware Routing Work Plan

#### Current State (April 7, 2026 — Real JSONL Data)

**Last 30 days real token usage** (Claude Code JSONL transcript parse):

| Metric | Value |
|--------|-------|
| Sessions | 1,189 (1,001 with usage data) |
| API calls | 56,713 |
| Input tokens | 1.6M |
| Output tokens | 13.0M |
| Cache write tokens | 176.2M |
| Cache read tokens | 5,084.9M |
| **Total (including cache)** | **5.28 Billion tokens** |

**Per-model breakdown:**

| Model | Input | Output | Cache Read | API Calls | API Cost |
|-------|-------|--------|------------|-----------|----------|
| Opus 4.6 | 1.18M | 6.92M | 3,677M | 32,253 | $9,527 |
| Sonnet 4.6 | 0.32M | 5.50M | 1,253M | 21,525 | $669 |
| Haiku 4.5 | 0.07M | 0.57M | 154M | 2,885 | $8 |

**Cache impact:**

| Scenario | Cost |
|----------|------|
| With cache (actual) | $10,212 |
| Without cache (hypothetical) | $61,468 |
| Cache savings | $51,256 (83% discount) |
| Claude Code Max Plan | $200 |
| **ROI** | **51x** |

**Key metrics:**
- Average per API call: 89,666 tokens from cache, 28 tokens new input, 229 tokens output
- 97% of context comes from cache
- Cache hit rate: 99.9%
- Max cache read: 553,047 tokens (single call)
- Weekly trend: +122% increase (Deckent sprint intensity growing)

#### Problem: Cache ≠ Context Savings

Cache only reduces cost — tokens still occupy the context window:
- Even if 90K tokens are read from cache, the model still "sees" those 90K
- Opus/Sonnet 4.6: 200K context limit
- In long conversations, context compression kicks in → information loss

#### Work Plan: Context-Aware Routing (Sprint 104+)

**Layer 1: Context Estimator**
- Estimate context budget per task
- Calculate system prompt size (CLAUDE.md + rules + skill prompts)
- Estimate total token count of task scope files
- Add expected tool call overhead
- Activate existing `token-counter.ts` (orphan, has tests)

**Layer 2: Context-Aware Router**
- Add context size as a factor in `task-router.ts`
- Add `contextLimit` field to ModelRegistry (per model)
- Routing decision: Budget < 75% model limit → this model OK, otherwise upgrade or split
- Decision logic:
  ```
  Budget < 150K → Sonnet 200K (cheap, sufficient)
  Budget 150K-180K → Opus 200K (smarter, tight fit)
  Budget > 180K → SPLIT task or route to 1M context model
  Budget > 800K → Definitely split
  ```

**Layer 3: Task Splitter**
- Automatic scope splitting when context budget exceeds model limit
- Create subtasks based on file grouping
- Each subtask must be independently executable (minimize shared context)

**Layer 4: Token Usage Tracker (Sprint Reporter Integration)**
- Add `tokenUsage` field to worker result file:
  ```json
  { "inputTokens": 15420, "outputTokens": 3200, "provider": "claude", "model": "opus" }
  ```
- Claude: post-hoc parse from JSONL transcript
- Gemini: save existing `parseGeminiOutput()` result (already parsing)
- Codex: capture API response usage field
- Add token summary table to sprint reporter (RETRO.md)

**Estimated effort:** 3-4 sprints (Layers 1-2 priority, Layers 3-4 in next phase)

---

## Success Metrics & Risk

### Self-Improvement Metrics

| Metric | Before Sprint 084 | After Sprint 086 | Target (10 sprints) | Measurement |
|--------|-------------------|-------------------|---------------------|-------------|
| Sprint NO_GO rate | ~15% | 0% (085+086) | <5% | Sprint retro |
| Agent selection accuracy | Unknown | Measurable (decision trail) | >85% | Decision JSON |
| Auto-applied rules | 0 | Infrastructure ready | 5+ per sprint | applied-rules.json |
| Intent classifier learning | None | updateIntentWeights() active | <10% misclassification | intent-weights.json |
| Silent errors | 49 | ~20 | 0 | grep count |
| Planner historical context | None | getWorstCombinations() | Every sprint | Planner prompt |
| Coverage threshold | Hardcoded 90% | Read from config | Per-project | config.json |

### Autonomy Metrics

| Metric | Current | Target (15 sprints) | Measurement |
|--------|---------|---------------------|-------------|
| Human intervention / sprint | ~3-5 | <1 | Sprint log |
| Proactive task count | ✅ Daemon active | 5+ / day | Heartbeat log |
| Self-heal rate | 0% | >50% | Auto-fix / total error |
| Cross-sprint learning | Minimal | Full | Memory recall accuracy |

### Competitive Convergence

| Metric | Current | Target | Reference Competitor |
|--------|---------|--------|----------------------|
| Skill/integration count | 21 | 50+ | OpenClaw (13,729) |
| Model count | 13 (ModelRegistry) | 15+ | Perplexity (19) |
| Channel integrations | 0 | 5+ | OpenClaw (50+) |
| Human checkpoints | ✅ 3 phases (Sprint 088) | 3+ phases | Cowork |
| Codebase indexing | None | AST+RAG | Devin Wiki |

### Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Auto-apply rules break the system | Low | High | Rule versioning + rollback + sandbox testing |
| Heartbeat daemon resource consumption | Medium | Medium | Configurable interval, idle detection |
| Human checkpoint UX friction | High | Medium | Progressive disclosure, smart defaults |
| Intent feedback wrong learning | Medium | High | Minimum sample (10+), slow decay |
| Multi-sprint chaining infinite loop | Low | High | Max chain depth, cost guard |
| Browser control security vulnerability | Medium | High | Sandbox, permission system |

---

## Strategic Positioning

### ✅ Short Term — COMPLETE (Sprint 085-086): "Learning Orchestrator"
- ✅ Learning loop closed (rule auto-apply + synergy + intent feedback + planner historical context)
- ✅ Rules evolve automatically (applyEvolvedRules, confidence >= 0.85)
- ✅ Decision logging + observability (decision trail + .brain/ERRORS.md)
- ✅ Intent classifier learns from outcomes (INTENT_WEIGHTS)
- **Differentiator:** No competitor (OpenClaw, Devin, Perplexity, Cowork) has closed a learning loop

### ✅ Medium Term — COMPLETE (Sprint 087-097): "Proactive Developer Assistant"
- ✅ Proactive operation via Heartbeat daemon (OpenClaw model) — Sprint 088
- ✅ Reliable autonomy via Human checkpoints (Cowork model) — Sprint 088
- ✅ Sprint timeout reform — unlimited duration support — Sprint 088
- ✅ Adaptive thresholds (automatic adjustment based on NO_GO rate) — Sprint 088
- ✅ Mid-sprint reroute strengthening (max 3 attempts) — Sprint 088
- ✅ Agent/Skill Evolution Pipeline (promotion/demotion, evolved rules) — Sprint 091
- ✅ ModelRegistry + tier-based routing (13 models, 3 providers, single source of truth) — Sprint 097
- ⏳ Slack/GitHub integrations
- **Differentiator:** Multi-agent + learning + proactive + checkpoints + open source

### Long Term (Sprint 103-115): "Autonomous Software Team"
- Codebase semantic understanding (Devin Wiki model)
- Critique layer with multi-model verification (Cowork model)
- Browser/desktop control (Claude Computer Use)
- Multi-sprint chaining (tasks running for days, Perplexity model)
- Provider expansion: Grok, Llama, Mistral, DeepSeek (ModelRegistry infrastructure ready)
- Rubric-based grading with iterative improvement (CMA model — structured evaluation beyond GO/NO_GO)
- Versioned memory + agent versioning with rollback (CMA model — compliance, A/B testing)
- REST API / Multi-SDK access (CMA model — beyond TypeScript CLI)
- **Differentiator:** Full team simulation — a whole team from a single person

---

## Conclusion

**Deckent's current state (post-Sprint 122, v0.4.0-beta.1):**
- 122+ sprints, 12,193+ tests (413 dashboard), 96% coverage
- 16 built-in agents (+2 temp), 21 built-in skills
- 13 models, 3 providers (Claude, Codex, Gemini), single source of truth via ModelRegistry
- 20 MCP tools + 8 resources, 35+ CLI commands
- Self-improving routing ACTIVE (rule evolution, synergy, intent learning, planner historical context)
- Decision trail with full observability
- ✅ Heartbeat Daemon ACTIVE (proactive task execution) — Sprint 088
- ✅ Human Checkpoints ACTIVE (plan/evaluate/fix approval points) — Sprint 088
- ✅ Sprint Timeout Reform (unlimited duration support) — Sprint 088
- ✅ Adaptive Thresholds (automatic adjustment based on NO_GO rate) — Sprint 088
- ✅ Mid-Sprint Reroute (max 3, configurable) — Sprint 088
- ✅ Agent/Skill Evolution Pipeline (promotion/demotion, evolved rules) — Sprint 091
- ✅ ModelRegistry + Tier-Based Routing (13 models, 3 providers) — Sprint 097
- ✅ Provider-Agnostic Config (brain_tier/worker_tier) — Sprint 097
- ✅ Docker Spawn Backend (container-based worker isolation) — Sprint 101
- ✅ Sprint Lock Mechanism (multi-process collision prevention) — Sprint 101

---

**Completed strategic goals (Sprint 085-103+):**
1. ✅ **Close the learning loop** — rule auto-apply + synergy → router + intent feedback + planner historical context (Sprint 085-086)
2. ✅ **Observability** — silent catch → debugLog + decision trail + .brain/ERRORS.md (Sprint 085-088)
3. ✅ **Coverage config** — hardcoded 90% → config.coverage_threshold (Sprint 086)
4. ✅ **Heartbeat daemon** — proactive operation inspired by OpenClaw model (Sprint 088)
5. ✅ **Human checkpoints** — human approval points at sprint phases (Sprint 088)
6. ✅ **Sprint timeout reform** — unlimited duration sprint support (Sprint 088)
7. ✅ **Adaptive thresholds** — automatic score adjustment based on NO_GO rate (Sprint 088)
8. ✅ **Mid-sprint reroute strengthening** — max 3 attempts, configurable (Sprint 088)
9. ✅ **Agent/Skill evolution pipeline** — promotion/demotion execute, evolved rules injection (Sprint 091)
10. ✅ **ModelRegistry** — 13 models, 3 providers, tier-based routing, single source of truth (Sprint 097)
11. ✅ **Sprint History Fix** — MCP history tool reads .brain/archive/, 85+ sprint logs accessible (Sprint 098)
12. ✅ **Job Output Reform** — finalizeSprint() enriched with detailed rationale/metrics/evidence (Sprint 099)
13. ✅ **Continuous Docs Updates** — ANALYSIS, README, VISION, architecture numbers consistent (Sprint 098-100)
14. ✅ **Docker Spawn Backend** — container-based worker isolation, MockSpawnBackend, E2E tests (Sprint 101)
15. ✅ **Sprint Lock Mechanism** — multi-process collision prevention, autoApprove standardized (Sprint 101)
16. ✅ **Docker Live E2E Verification** — CLI+MCP sprint tested, CI coverage skip guard, 10 e2e tests (Sprint 119-122)
17. ✅ **Context-Aware Routing** — context budget estimation → model selection, contextFit scoring (Sprint 124)
18. ✅ **Token Usage Tracker** — provider-native token counting + RETRO.md token summary table (Sprint 124)
19. ✅ **Rubric-Based Grading** — 4-criteria rubric (correctness, coverage, scope, docs), evaluateWithRubric() default evaluator (Sprint 125-129)
20. ✅ **Worker Question Mechanism** — askBrain IPC + file-based fallback for tmux/docker, 63 tests (Sprint 125-129)
21. ✅ **DEBT.md Parse Fix** — JSON.parse→parseDebtTable, markdown table format properly handled (Sprint 129)
22. ✅ **Evaluator Consistency** — evaluateWithRubric() single evaluator, evaluateResult() deprecated (Sprint 129)
23. ✅ **Enterprise Tech Debt Cleanup** — 8 CRITICAL/HIGH debts closed, zero open debt (Sprint 129)
24. ✅ **MCP Instructions Accuracy** — server.ts Tools (15)→(21) fix, 6 missing tools added to instructions string (Sprint 130)
25. ✅ **Decision-Engine V1 Archive** — 4 files @deprecated, ADR-028 written, V1 preserved as reference (Sprint 130)
26. ✅ **Coverage Truth** — real measurement 89.33%, false 96%+ claim corrected in IDENTITY.md (Sprint 130)

**Next 4 actions (P3):**
1. **Codebase semantic indexing** — AST + RAG for repo understanding
2. **Versioned Memory** — .brain/MEMORY.md with SHA-based version history, rollback, compliance redact (CMA model)
3. **Dynamic replanning** — mid-sprint plan changes based on partial results
4. **Stale heartbeat false positive fix** — Docker completed tasks still trigger stale alerts

**Estimated time to fully autonomous assistant:** 4-6 sprints
**Self-improving orchestrator: ✅ COMPLETE (Sprint 102+)**

---

## Sources

### OpenClaw
- [OpenClaw GitHub](https://github.com/openclaw/openclaw) — 343K+ stars (April 2026), MIT license
- [OpenClaw Architecture](https://docs.openclaw.ai/concepts/architecture) — Gateway, Brain, Memory, Skills, Heartbeat
- [OpenClaw 250K Milestone](https://openclaws.io/blog/openclaw-250k-stars-milestone) — Surpassed React in 60 days (March 3, 2026)
- [OpenClaw 335K Stats](https://openclawvps.io/blog/openclaw-statistics) — 2M MAU, 27M web visits, 1000+ contributors
- [OpenClaw Surpasses React](https://www.star-history.com/blog/openclaw-surpasses-react-most-starred-software) — Most-starred software project on GitHub
- [OpenClaw vs Claude Code](https://claudefa.st/blog/tools/extensions/openclaw-vs-claude-code) — Category difference analysis
- [ClawHub Skills](https://github.com/openclaw/clawhub) — 13,729 community skills, 65%+ MCP server wrappers
- [OpenClaw Security](https://thenewstack.io/openclaw-github-stars-security/) — Security concern analysis

### Microsoft Copilot Cowork
- [Cowork Launch](https://www.microsoft.com/en-us/microsoft-365/blog/2026/03/09/copilot-cowork-a-new-way-of-getting-work-done/) — Multi-model orchestrator (GPT + Claude critique)
- [Cowork Frontier](https://www.microsoft.com/en-us/microsoft-365/blog/2026/03/30/copilot-cowork-now-available-in-frontier/) — Anthropic collaboration, March 2026
- [Cowork Fortune](https://fortune.com/2026/03/09/microsoft-copilot-cowork-ai-agents-anthropic-e7-m365-saas/) — Enterprise details
- [Cowork SiliconANGLE](https://siliconangle.com/2026/03/30/microsoft-accelerates-agentic-automation-copilot-cowork-complex-workflows/) — Agentic automation

### Perplexity Computer
- [Perplexity Computer](https://www.perplexity.ai/hub/blog/introducing-perplexity-computer) — 19 models, $200/month
- [Perplexity VentureBeat](https://venturebeat.com/technology/perplexity-launches-computer-ai-agent-that-coordinates-19-models-priced-at/) — Launch details
- [Perplexity Enterprise](https://theaiinsider.tech/2026/02/28/perplexity-unveils-enterprise-focused-ai-agent-system-powered-by-multi-model-architecture/) — $325/seat/month
- [Perplexity vs OpenClaw](https://www.pymnts.com/artificial-intelligence-2/2026/perplexity-enters-autonomous-ai-race-with-launch-of-computer/) — Competition analysis
- [Perplexity Pricing](https://www.sentisight.ai/how-much-perplexity-computer-cost/) — 10K credits/month, spending limit

### Devin
- [Devin 2.0 VentureBeat](https://venturebeat.com/programming-development/devin-2-0-is-here-cognition-slashes-price-of-ai-software-engineer-to-20-per-month-from-500/) — $500 → $20 price drop
- [Devin Pricing](https://devin.ai/pricing) — Core $20/month, Team $500/month, ACU system
- [Devin Alternatives](https://www.augmentcode.com/tools/best-devin-alternatives) — Competitor analysis
- [Devin Review 2026](https://vibecoding.app/blog/devin-review) — v3.0 dynamic replanning, Compound AI

### Claude Ecosystem
- [Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk) — Official agent infrastructure
- [Claude Computer Use](https://www.cnbc.com/2026/03/24/anthropic-claude-ai-agent-use-computer-finish-tasks.html) — Desktop automation
- [Claude Dispatch](https://claude.com/blog/dispatch-and-computer-use) — Phone → computer task flow
- [Claude Code Features](https://help.apiyi.com/en/claude-code-2026-new-features-loop-computer-use-remote-control-guide-en.html) — Loop, Schedule, Computer Use
- [AI Agents Comparison 2026](https://blog.iskohm.com/en/posts/ai-agents-comparison-2026-cursor-copilot-kilo-code-claude-code/) — Full comparison

### Claude Managed Agents (CMA)
- [CMA Overview](https://platform.claude.com/docs/en/managed-agents/overview) — Managed agent infrastructure (beta April 2026)
- [CMA Quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart) — Agent creation, sessions, streaming guide
