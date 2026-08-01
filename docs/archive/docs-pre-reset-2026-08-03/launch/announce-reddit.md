# Reddit Launch Posts — Deckent v1.0.0-beta.1

---

## r/LocalLLaMA

### Title
**Deckent v1.0.0-beta.1 — open source AI orchestrator with sprint discipline, nervous system alerting, and AST-sandboxed skills (TypeScript, Claude/Codex/Gemini)**

### Body

Hey r/LocalLLaMA,

Six months ago I started building an orchestrator because I couldn't find one that treated multi-agent execution like a proper engineering process. Today I'm launching **Deckent** as open source beta.

**The architecture in brief:**

Deckent uses a Brain → Worker → Auditor model. The Brain runs a sprint lifecycle (PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → CLEANUP). Each worker gets a scoped task, a heartbeat file, and a result contract. The Auditor scans every 30 seconds for boundary violations via `git diff --stat`.

**Memory V2 (the interesting part):**

- SQLite with FTS5 full-text search
- Dual-layer normalization for Turkish + English queries (96% context reduction vs the previous flat-file approach)
- Brain auto-queries relevant ADRs, sprint learnings, and debt entries at plan time
- Schema: 5 tables + FTS5 virtual table, decay support, entry history tracking

**Skill sandboxing:**

Third-party skills go through AST validation before they can run. No `eval`, no dynamic `require`. The sandbox checks for dangerous imports and side-effects at the AST node level.

**Nervous system (ADR-040):**

A proactive meta-orchestrator that runs detectors in the background:
- Idle agent detection
- Token spike alerts (we had a $42 incident in Sprint 140 — this prevents that)
- Scope collision rate tracking
- Build failure recurrence
- Notification delivery health

**Multi-model routing:**

```
premium_plus: o3, gemini-3.1-pro-preview
premium:      opus, gpt-5, gemini-2.5-pro
standard:     sonnet, gpt-4.1, o4-mini, gemini-2.5-flash
economy:      haiku, gpt-5-mini, gemini-2.0-flash
```

Brain assigns model tier per task based on effort/complexity. You configure `brain_tier` and `worker_tier` in `.deckent/config.json` — no model names hardcoded anywhere.

**Stats after 150+ sprints of dogfooding:**

- 89.33% test coverage
- 12,485+ passing tests
- 49+ CLI commands
- 22 MCP tools, 8 resources
- 16 built-in agents, 21 built-in skills

```bash
npm install -g deckent
deckent init
deckent plan --mode ai   # or --mode structured for deterministic
deckent start
```

Repo: https://github.com/VerhexIO/deckent

The architecture decision records (.brain/DECISIONS.md) are all open — you can see every major design decision with the reasoning behind it. Would love technical feedback on the routing engine and memory schema.

---

## r/programming

### Title
**I built an open source AI orchestrator over 150 sprints — here's what I learned about multi-agent discipline**

### Body

Hi r/programming,

I've been building **Deckent** — an AI agent orchestrator — as a solo side project for six months. It's now v1.0.0-beta.1 and I'm open-sourcing it.

The core insight: most orchestrators are fire-and-forget. You give agents tasks and wait for results. When something goes wrong you have no structured way to detect it during execution, evaluate quality, or learn from failures.

Deckent adds a sprint lifecycle that mirrors how engineering teams actually work:

**1. Structured evaluation:** Every task result is evaluated as `DONE`, `GO_WITH_TECH_DEBT`, or `NO_GO`. The brain reads rubric scores (`correctness`, `test_coverage`, `scope_compliance`, `documentation`) and makes a structured decision — not just "did it finish?".

**2. Scope enforcement:** Workers get a `scope.directories` + `scope.filesWrite` contract. The auditor runs `git diff --stat` every 30 seconds and flags boundary violations. Agents cannot write outside their lane.

**3. Memory that actually works:** SQLite FTS5 with decay. Past sprint learnings, architecture decisions, and tech debt are queryable by the brain at plan time. The brain learns from failure patterns across sprints.

**4. Real-time nervous system:** Background detectors push alerts to your terminal — idle agents, token spikes, scope collision rates, build failure recurrence. You know something's wrong during the sprint, not after.

**Lessons from 150+ sprints:**

- God objects in orchestrators are deadly (we split sprint-controller.ts from 1890 → 209 LoC)
- Docker heartbeat atomicity is critical (5 sprints to get the SIGKILL path right)
- Verification-blind evaluation causes cascading NO_GOs (fixed in Sprint 151)
- Agent taxonomy matters: horizontal skills vs vertical agents (ADR-041)

```bash
npm install -g deckent
deckent init
# Define tasks in DIRECTIVES.md
deckent plan --mode structured
deckent start
deckent status --watch
```

Repo: https://github.com/VerhexIO/deckent  
npm: `npm install -g deckent`

Happy to discuss the architecture or the lessons from building this.

---

## r/opensource

### Title
**Deckent — open source AI orchestrator for structured multi-agent workflows (v1.0.0-beta.1)**

### Body

Hi r/opensource!

Excited to share **Deckent**, a project I've been building solo for six months. It's an open-source AI agent orchestrator that brings sprint discipline to multi-agent workflows.

**What it is:**

A CLI + MCP server that lets you run multiple AI agents on a structured sprint — with scope enforcement, quality evaluation, real-time monitoring, and memory that persists across sprints.

**Why open source:**

I built this because I wanted an orchestrator I could actually trust. Closed orchestrators are black boxes — you can't inspect how skills are sandboxed, how routing decisions are made, or what happens when an agent fails. Deckent puts all of that in the open, including the architecture decision records.

**Key features:**

- **Sprint lifecycle** with 8 phases (PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP)
- **AST-sandboxed skills** — third-party skill validation before execution
- **Multi-provider** — Claude, Codex, Gemini with tier-based routing
- **MCP integration** — 22 tools, 8 resources for IDE/editor integration
- **Memory V2** — SQLite FTS5 with decay, cross-sprint learning
- **Nervous system** — proactive alerting (idle agents, cost spikes, build failures)
- **Dashboard** — React + Vite web UI for sprint monitoring

**Stats:**

- 89.33% test coverage, 12,485+ tests
- 49+ CLI commands
- 150+ sprints dogfooded on itself
- MIT licensed

**Get started:**

```bash
npm install -g deckent
deckent init
deckent --help
```

Repo: https://github.com/VerhexIO/deckent

Contributions welcome! The project has a full CONTRIBUTING.md and the ADR governance system means architectural decisions are documented and reviewable. Looking forward to building this community.

---

## Publish Notes

| Subreddit | Best time | Tone | Focus |
|-----------|-----------|------|-------|
| r/LocalLLaMA | Weekday 10–12 AM ET | Technical deep-dive | Memory V2, routing, AST sandbox |
| r/programming | Weekday 9–11 AM ET | Dev-experience lessons | Sprint discipline, learnings |
| r/opensource | Weekday 12–2 PM ET | Community + contribution | MIT, transparency, contribution |

- **Alperen action:** Post r/LocalLLaMA first (highest technical engagement), then r/programming 2 hours later, then r/opensource end of day
- **Cross-post rule:** Each post is unique content, not a cross-post — Reddit penalizes identical cross-posts
- **First comment:** Pin a comment with the architecture diagram link and key commands within 5 minutes of posting
