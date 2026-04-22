---
title: I Built an AI Orchestrator Over 150 Sprints — Here's What I Learned
subtitle: Six months, one solo developer, and a hard-won framework for making multi-agent AI systems reliable.
tags:
  - opensource
  - ai
  - typescript
  - softwareengineering
  - devtools
coverImage: https://github.com/VerhexIO/deckent/raw/main/docs/assets/deckent-cover.png
canonical_url: https://dev.to/alperensartacoglu/i-built-an-ai-orchestrator-over-150-sprints
series: Building Deckent
publishedAt: 2026-04-22
---

# I Built an AI Orchestrator Over 150 Sprints — Here's What I Learned

There's a gap in the AI tooling ecosystem that nobody talks about: multi-agent orchestration without discipline.

You can spin up five AI agents on a task today. But do they stay within scope? Do you know which ones actually completed their work versus which ones just *said* they did? When one fails, do you know *why*, and does the system learn from it for next time?

I built **Deckent** to answer those questions. Six months, 150+ sprints of self-dogfooding, and one open-source launch later — here's what I learned.

---

## Why Another Orchestrator?

I started building Deckent after hitting the same wall repeatedly. Existing orchestrators are great at the happy path: give an agent a task, get a result. But production-grade workflows need more than that.

**The problems I kept running into:**

1. **No scope enforcement.** Agents would modify files they weren't supposed to touch, causing conflicts with other agents running in parallel.

2. **Binary evaluation.** "Did it succeed?" isn't enough. You need "did it succeed *well enough*?" and "what specifically went wrong if not?"

3. **Stateless execution.** Every session started from scratch. The system had no memory of which architectural decisions were made and why, which patterns had failed before, or what technical debt was accumulating.

4. **No anomaly detection.** You'd find out something was wrong at the end of a sprint — after hours of wasted compute.

5. **Trust gap in community skills.** Community-published extensions had no validation gate. Research on similar ecosystems found ~20% of published skills contained dangerous or malicious patterns.

I wanted an orchestrator that treated multi-agent execution like a proper engineering process.

---

## The Architecture

Deckent uses a **Brain → Worker → Auditor** model with a strict authority hierarchy.

```
Brain (orchestrator)
  ├── Planner         — reads DIRECTIVES.md, creates task JSON
  ├── Task Router     — assigns agent + skill + provider per task
  ├── Result Evaluator— GO / NO_GO / GO_WITH_TECH_DEBT
  └── Sprint Reporter — retro, learnings, debt tracking

Worker (executor)
  ├── Claims task via file lock
  ├── Writes heartbeat every ~30s
  ├── Executes within declared scope
  └── Writes structured result file

Auditor (monitor, read-only)
  ├── Scans every 30s
  ├── Checks git diff --stat for scope violations
  ├── Detects stale heartbeats (>2min = alert)
  └── Monitors lock contention and collision rates
```

**ADR-037** (Brain-Auditor-Worker Authority Matrix) makes these roles enforceable at runtime:
- Brain is the **only** module that can spawn workers
- Auditor can **never** write source code
- Workers **cannot** read or modify each other's task files

This isn't just documentation — the runtime enforces these boundaries.

---

## The Sprint Lifecycle

Every Deckent execution follows 8 phases:

```
PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP
```

**PLAN**: Brain reads `DIRECTIVES.md`, creates task JSON files in `.tasks/`. Each task has a model tier, scope declaration, GO/NO-GO criteria, and agent assignment.

**SPAWN**: Workers start via configured backend (tmux, subprocess, or Docker). The Auditor scan loop starts in-process.

**EXECUTE**: Workers run, writing heartbeat files (`.tasks/task-NNN.hb`) on every significant action.

**EVALUATE**: Brain reads result files and evaluates each against a rubric:

```json
{
  "rubricScores": {
    "correctness": 90,
    "test_coverage": 85,
    "scope_compliance": 100,
    "documentation": 70
  },
  "evaluationDecision": "DONE"
}
```

**FIX**: Failed tasks are retried with enriched context — the specific rubric failure reason, not a generic "try again."

**RETRO**: Learnings are written to the memory DB. Sprint patterns are updated.

**DECAY**: Old memory entries fade unless marked `decay_exempt`. This keeps the brain's context window from accumulating noise.

**CLEANUP**: Task files archived, locks released, sprint closed.

---

## Memory V2: SQLite FTS5

The memory system went through a complete redesign in the second half of development.

**The problem with flat files:**

The original approach stored all brain knowledge in Markdown files. By Sprint 100, `DECISIONS.md` was 96KB. Context windows were saturating, search was a `grep` hack, and there was no structured decay.

**The SQLite FTS5 solution:**

```sql
-- Core tables
entries (id, type, title, body, status, sprint_id, created_at, ...)
tags (entry_id, tag)
relations (from_id, to_id, relation_type)  -- references, supersedes, depends_on
entry_history (entry_id, field, old_value, new_value, changed_at)

-- FTS5 virtual table (dual-layer normalization)
entries_fts (title, body, title_normalized, body_normalized, ...)
```

The dual-layer normalization handles both Turkish and English queries:

```typescript
// turkishNormalize() maps Turkish characters to ASCII equivalents
// FTS5 indexes both original and normalized form
// Query "bellek" matches entries containing "memory" and vice versa
```

**Result:** 96% context reduction vs flat files. Brain auto-queries relevant ADRs, sprint learnings, and debt at plan time — no manual lookup required.

---

## The Nervous System

**ADR-040** documents the Nervous System Architecture, born directly from a $42 incident in Sprint 140 where a runaway task ran undetected for hours.

The nervous system is a proactive meta-orchestrator that runs background detectors and pushes real-time alerts to your terminal via the `DECKENT→USER:NOTIFY` channel:

```
sprint-started         — Sprint execution began
task-done              — Task completed (GO evaluation)
task-no-go             — Task failed evaluation, entering FIX phase
sprint-finalized       — Sprint closed with full retro
human-checkpoint-required — Brain needs human input before proceeding
```

**Active detectors (v1.0.0-beta.1):**

| Detector | Triggers when |
|----------|---------------|
| IdleAgentDetector | Worker heartbeat >2min stale |
| TokenSpikeDetector | Sprint cost >2x rolling average |
| AgentRoutingAnomaly | Single agent >80% of tasks (ADR-041 violation) |
| BuildFailureRecurrence | Same files failing `tsc` across 3+ sprints |
| ScopeCollisionRate | Auditor detects >10 file conflicts per sprint |
| NotificationDeliveryHealth | Alert adapter.send() failures |

---

## AST Sandbox for Skills

Every third-party skill goes through static analysis before it can run:

1. **Parse** — skill source is parsed to AST (no execution)
2. **Node inspection** — check for `eval`, `Function()`, dynamic `require`, `process.exit`
3. **Import whitelist** — only approved modules can be imported
4. **Side-effect scan** — top-level mutations are flagged
5. **Validation result** — skill is blocked or approved

This runs in a sandboxed worker process, not the main runtime. A malicious skill cannot escape the sandbox by exploiting the validator itself.

---

## Provider-Agnostic Tier Routing

One decision I'm particularly happy with (ADR-023): model names never appear in task definitions. Instead, you configure *tiers*:

```json
{
  "brain_tier": "standard",
  "worker_tier": "economy"
}
```

The model registry maps tiers to the best available model per configured provider:

| Tier | Claude | Codex | Gemini |
|------|--------|-------|--------|
| premium_plus | — | o3 | gemini-3.1-pro-preview |
| premium | opus | gpt-5 | gemini-2.5-pro |
| standard | sonnet | gpt-4.1 | gemini-2.5-flash |
| economy | haiku | gpt-5-mini | gemini-2.0-flash |

Switching from Claude to Gemini is a single config key change. Zero task redefinition.

---

## Hard Lessons from 150 Sprints

**Lesson 1: Heartbeat atomicity is critical.**

It took 5 sprints to correctly handle the Docker SIGKILL path. When a container is OOM-killed, `EXIT` traps don't run. The fix: write an intermediate `.partial-result` on every significant change, rename to `.result` on clean exit. Brain treats a `.partial-result` as NO_GO, not as a missing result.

**Lesson 2: God objects in orchestrators are deadly.**

`sprint-controller.ts` grew to 1,890 lines. The refactor to split it (ADR-024 + ADR-026) took a full sprint, revealed 3 hidden bugs, and improved maintainability dramatically. The split: brain.ts (re-export), sprint-controller.ts (lifecycle), planner.ts (planning), task-router.ts (routing), result-evaluator.ts (evaluation).

**Lesson 3: Verification-blind evaluation causes cascading failures.**

Sprint 150 surfaced a pattern: tasks that *verified* previous work were being evaluated as NO_GO because they had `filesChanged: []`. The fix (Sprint 151) adds a heuristic: if the description contains "verify", "already implemented", or "Sprint N did this", and `filesChanged` is empty, it's a verification task — not a failure.

**Lesson 4: Scope enforcement via `git diff` is the right abstraction.**

Language-agnostic, impossible to fake, always accurate. The auditor doesn't need to understand what the worker is doing — it just checks what changed. Every boundary violation is detected regardless of what language or tool the worker uses.

**Lesson 5: Memory architecture is infrastructure, not a feature.**

I deferred the Memory V2 rewrite for too long. The flat-file approach seemed "good enough" until it wasn't. SQLite FTS5 should have been the starting point, not a Sprint 100 migration. Treat your memory system like your database: design it for scale from day one.

---

## Getting Started

```bash
# Install globally
npm install -g deckent

# Initialize in your project directory
cd your-project
deckent init

# Define your tasks (DIRECTIVES.md is created by init)
# Edit DIRECTIVES.md with your sprint goals

# Plan and start
deckent plan --mode structured   # deterministic, no AI API needed
# or
deckent plan --mode ai           # AI-driven task decomposition

deckent start
deckent status --watch           # live monitoring
```

**DIRECTIVES.md format:**

```markdown
## Task 1: Add user authentication
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/auth/auth.ts, src/auth/session.ts
- Scope: src/auth/

### Description
Implement JWT-based authentication...

**Evidence:** `grep "verifyToken" src/auth/auth.ts` → implemented
**Test:** 5+ tests (token generation, validation, expiry, refresh, revocation)
```

---

## What's Open for Contribution

Deckent is MIT licensed and actively looking for:

- **New detectors** — the nervous system detector interface is extensible
- **Provider adapters** — new model providers via the `ProviderAdapter` interface
- **Skill library** — sandboxed skills for common dev tasks (linting, formatting, API testing)
- **Bug reports** — especially around the Docker backend and heartbeat edge cases
- **Architecture feedback** — the ADR governance system means all major decisions are documented and open for discussion

---

## Links

- **GitHub:** [github.com/VerhexIO/deckent](https://github.com/VerhexIO/deckent)
- **npm:** `npm install -g deckent`
- **Architecture decisions:** `.brain/exports/decisions.md` in the repo
- **Discord:** [Deckent Community](#) (link available at launch)

---

*Alperen Sartaçoğlu — solo dev, Deckent author*  
*Building in public from Istanbul.*

---

## Publish Notes

- **Platform:** Hashnode
- **Target date:** Wednesday 22 Apr TRT (launch day T+2 hours after npm publish)
- **Canonical URL:** Set to Dev.to post URL to avoid duplicate content penalty
- **Series:** "Building Deckent" (create series first in Hashnode dashboard)
- **Alperen action:** Set `canonical_url` to actual Dev.to URL after Dev.to publishes, then publish on Hashnode
- **Tags:** opensource, ai, typescript, softwareengineering, devtools
- **Cover image:** Upload deckent-cover.png to Hashnode CDN and update `coverImage` field
