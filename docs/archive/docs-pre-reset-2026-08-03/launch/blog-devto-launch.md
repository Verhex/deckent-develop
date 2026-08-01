---
title: I Built an AI Orchestrator Over 150 Sprints — Here's What I Learned
published: false
description: "Six months of solo development, 150+ sprints of self-dogfooding, and one hard-won insight: multi-agent AI systems need sprint discipline, not just fire-and-forget execution."
tags: opensource, ai, typescript, productivity
cover_image: https://github.com/VerhexIO/deckent/raw/main/docs/assets/deckent-cover.png
canonical_url: https://dev.to/alperensartacoglu/i-built-an-ai-orchestrator-over-150-sprints
series: Building Deckent
---

# I Built an AI Orchestrator Over 150 Sprints — Here's What I Learned

Six months ago I started a side project that I thought would take two weeks. It took 150+ sprints. I call it **Deckent**, and today I'm releasing it as open source.

This is the story of what I built, why I built it, and the hard lessons I learned along the way.

---

## The Problem I Kept Hitting

I was using AI coding assistants heavily — Claude, GPT, Gemini. For single tasks, they're fantastic. But the moment I needed *multiple agents working in parallel* on a real project, things fell apart fast.

Existing orchestrators had a common pattern: spawn agents, wait for results, hope for the best.

There was no:
- **Scope enforcement** — agents would wander into files they weren't supposed to touch
- **Structured evaluation** — did the agent *actually* complete the task, or just generate confident-sounding output?
- **Memory across sessions** — every sprint started from zero, re-discovering the same architectural decisions
- **Anomaly detection** — you'd find out something went wrong *after* the sprint, not during

The OpenClaw ecosystem had another problem: a study found ~20% of community-published skills had malicious or dangerous patterns. There was no AST sandbox, no static analysis gate — just blind execution.

I wanted an orchestrator I could actually *trust*.

---

## The Journey: 150 Sprints in 6 Months

I built Deckent to orchestrate its own development — a practice I call dogfooding. Every feature was built and tested on the live system.

Here's what that journey looked like in phases:

### Phase 1: Core Lifecycle (Sprints 1–50)

The first thing I built was the sprint lifecycle: `PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP`.

The key insight was **structured evaluation**. Instead of "did it finish?", every task result is evaluated as one of three outcomes:

- `DONE` — functional outcome matches spec fully
- `GO_WITH_TECH_DEBT` — done but with documented caveats
- `NO_GO` — must be retried or escalated

This single decision forced me to define *what done actually means* for every task. That discipline alone eliminated a huge class of silent failures.

### Phase 2: Memory That Persists (Sprints 50–100)

Early versions stored brain knowledge in flat Markdown files. By Sprint 100, those files were 96KB. Context windows were getting saturated, and FTS search was a `grep` hack.

**Memory V2** replaced everything with SQLite + FTS5:

- 5 tables: `entries`, `tags`, `relations`, `entry_history`, `schema_version`
- FTS5 virtual table with dual-layer normalization (Turkish + English — I'm based in Turkey, the system needed to handle both)
- Automatic decay: old entries fade over time unless marked `decay_exempt`
- Brain auto-queries relevant ADRs, past learnings, and debt at plan time — no manual lookup

The result: 96% context reduction compared to the flat-file approach. The brain walks into every sprint already knowing the relevant history.

### Phase 3: The Nervous System (Sprints 100–140)

Sprint 140 was humbling. A runaway task racked up $42 in API costs before I noticed. That incident directly caused **ADR-040: Nervous System Architecture**.

The nervous system is a proactive meta-orchestrator — a background layer that runs detectors and pushes real-time alerts to your terminal:

- **Idle agent detection** — worker hasn't sent a heartbeat in 2+ minutes
- **Token spike alerts** — cost exceeds 2x sprint average
- **Scope collision detection** — two workers trying to write the same file
- **Build failure recurrence** — same files failing `tsc` across multiple sprints
- **Notification delivery health** — the alert channel itself is monitored

The notification dispatcher (DECKENT→USER:NOTIFY) fires lifecycle events to your terminal: `sprint-started`, `task-done`, `task-no-go`, `human-checkpoint-required`.

You know something's wrong *during* the sprint. Not after.

### Phase 4: Security and Trust (Sprints 130–151)

The AST sandbox came from a simple question: "Should I trust a skill someone published on the internet?"

Every third-party skill now goes through static analysis before execution:
- AST node-level inspection for dangerous imports
- No `eval`, no dynamic `require`
- Side-effect detection at parse time
- Validation runs in a sandboxed process, not the main runtime

**ADR-037** established the Brain-Auditor-Worker Authority Matrix — an RBAC model for the orchestrator itself. Brain is the only orchestrator. Workers stay within their assigned scope. Auditor never writes source code. The system enforces these roles at runtime.

---

## Technical Highlights

### 3-Layer Config Merge

Configuration flows through three layers: defaults → global (`~/.deckent/config.json`) → project (`.deckent/config.json`). Project config wins. This means you can set global preferences (preferred provider, model tiers) and override per-project without touching source code.

```json
{
  "brain_tier": "standard",
  "worker_tier": "economy",
  "brain_planning": "ai",
  "memory": {
    "backend": "sqlite",
    "decay_after_sprints": 10
  }
}
```

### Provider-Agnostic Tier Routing

One of my favorite architectural decisions (ADR-023): instead of hardcoding model names, you configure *tiers*. The model registry maps tiers to the best available model per provider:

```
premium_plus → o3, gemini-3.1-pro-preview
premium      → opus, gpt-5, gemini-2.5-pro
standard     → sonnet, gpt-4.1, o4-mini, gemini-2.5-flash
economy      → haiku, gpt-5-mini, gemini-2.0-flash
```

Switch from Claude to Gemini? Change one config key. No task definitions change.

### Scope Enforcement via Git Diff

The auditor runs every 30 seconds and checks `git diff --stat`. Workers declare their `scope.directories` and `scope.filesWrite` in the task JSON. Any modification outside that scope triggers an immediate alert. It's simple, language-agnostic, and impossible to fake.

### Event Stream + Verification Protocol

ADR-035 defined the Brain ↔ Worker ↔ Auditor verification protocol — 15 channel codes for structured communication. Workers write structured result files, Brain validates them against a rubric schema before evaluating. Missing `rubricScores`? Schema violation → automatic NO_GO.

---

## What I Ship Today

**Deckent v1.0.0-beta.1** is available on npm and GitHub.

Stats after 150+ sprints of dogfooding:
- **89.33% test coverage**, 12,485+ passing tests
- **49+ CLI commands**, 40+ MCP tools/resources
- **16 built-in agents**, 21 built-in skills
- **3 providers**: Claude, Codex, Gemini
- **MIT licensed**

```bash
# Install
npm install -g deckent

# Initialize in your project
deckent init

# Define tasks in DIRECTIVES.md, then:
deckent plan --mode ai        # AI-driven task planning
deckent start                 # Spawn workers
deckent status --watch        # Live monitoring
deckent retro                 # Sprint retrospective
```

---

## What I Learned

**1. Discipline beats cleverness.** The most impactful thing I added wasn't a smarter model or a better prompt — it was the structured `DONE / GO_WITH_TECH_DEBT / NO_GO` evaluation. Forcing explicit quality gates changed everything.

**2. God objects are orchestrator killers.** `sprint-controller.ts` grew to 1890 lines before I split it. The refactor took a full sprint and revealed three hidden bugs. Keep orchestrator modules small and single-purpose.

**3. Heartbeat atomicity is harder than it looks.** It took 5 sprints to correctly handle the Docker SIGKILL path. Partial writes and OOM kills are real. Use `fsync` and intermediate `.partial-result` files.

**4. Memory is infrastructure, not a feature.** The shift from flat files to SQLite FTS5 wasn't a feature addition — it was infrastructure that made everything else possible. Don't defer the memory architecture.

**5. Dogfooding finds bugs that tests don't.** The most embarrassing bugs (verification-blind evaluation, the $42 token spike, the 5-sprint Docker heartbeat saga) were all found through real sprint execution, not unit tests.

---

## What's Next

Sprint 152 focuses on the skill publishing hub — a registry where the community can publish and discover sandboxed skills. The AST validation gate is already in place; the hub layer is the next step.

If you're building something where AI agents need to work together reliably — whether that's a coding assistant, a research pipeline, or a data processing system — I'd love your feedback on the architecture.

**Try it, break it, and open an issue. That's how it got this far.**

- GitHub: [github.com/VerhexIO/deckent](https://github.com/VerhexIO/deckent)
- npm: `npm install -g deckent`
- Discussions: GitHub Discussions (questions welcome)

---

*Alperen — solo dev, Deckent author*

---

## Publish Notes

- **Platform:** Dev.to
- **Target date:** Wednesday 22 Apr TRT (launch day T+2 hours after npm publish)
- **Tags:** opensource, ai, typescript, productivity
- **Alperen action:** Set `published: true`, add actual cover image URL, then publish
- **First comment:** Pin a "quick start" comment with the 4-command sequence within 10 minutes of publishing
