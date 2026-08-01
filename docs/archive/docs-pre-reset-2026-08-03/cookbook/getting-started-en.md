# Getting Started with Deckent

Deckent is an AI agent orchestration system. It reads your goals from `DIRECTIVES.md`, plans a sprint of tasks, spawns parallel AI workers to execute them, and then lets you review, track cost, and iterate. This guide walks a fresh user through the entire workflow end-to-end.

---

## Prerequisites

Before you begin, confirm these dependencies are present:

| Dependency | Required | Notes |
|------------|----------|-------|
| Node.js >= 18 | Yes | `node --version` |
| git | Yes | `git --version` |
| One AI provider | Yes | See [Provider setup](#provider-setup) below |
| tmux | Recommended | Required for Claude (subprocess/Docker backends skip it) |

Check everything at once after installation:

```bash
deckent doctor
```

---

## Installation

### Global install (recommended for most users)

```bash
npm install -g deckent@beta
```

Verify:

```bash
deckent --version
```

### Zero-install with npx

Run a single command without a global install:

```bash
npx deckent@beta init
```

You can continue using `npx deckent@beta <command>` throughout the session, or switch to a global install after trying it out.

---

## Provider Setup

Deckent routes tasks to an AI provider. Configure at least one before running `deckent init`.

### Claude (subscription or API key)

Claude is the default provider and the most capable option for code tasks.

**Option A — Claude subscription (recommended for individual developers)**

Install the Claude Code CLI and log in:

```bash
npm install -g @anthropic-ai/claude-code
claude login
```

Deckent detects the authenticated session automatically. The sprint cost estimate will reflect subscription billing (often $0 in the gate, since usage is covered by the subscription plan).

**Option B — Anthropic API key**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

With an API key, cost estimates reflect real metered charges. Set a sprint budget before your first run (see [Cost management](#cost-management)).

### OpenAI / Codex

```bash
export OPENAI_API_KEY=sk-...
```

### Google Gemini

```bash
export GOOGLE_API_KEY=...
```

You can combine providers: configure one as `brain_provider` (planning) and another as `worker_provider` (execution). The `init` wizard handles this interactively.

---

## Initialize a Project

Run from your project root:

```bash
deckent init
```

The interactive wizard:

1. Asks for your preferred language (English or Turkish)
2. Asks for a plan mode (see table below)
3. Auto-detects your stack (language, framework, test runner)
4. Detects available providers and guides authentication
5. Writes configuration files and a starter `DIRECTIVES.md`

**Plan modes**

| Mode | Workers | Brain model | Worker model | Best for |
|------|---------|-------------|--------------|----------|
| `performance` | 8 | premium | premium | Large, complex sprints |
| `balanced` | 5 | standard | premium | Most projects (default) |
| `economic` | 3 | standard | standard | Small changes, tight budget |
| `api` | 10 | premium | standard | High-throughput API key users |

**Non-interactive init** (CI / scripted setup):

```bash
deckent init --auto -y
```

`--auto` lets Deckent detect system profile, subscription, and project type automatically. `-y` installs any missing prerequisites without prompting.

**Re-run after changing your environment:**

```bash
deckent init --upgrade
```

`--upgrade` merges new configuration over existing files without overwriting your customizations.

After `init` completes, your project will contain:

```
.deckent/          # Deckent workspace (config, cache, locks)
.brain/            # Agent memory (gitignored — never delete)
.tasks/            # Sprint task files (generated each sprint)
DIRECTIVES.md      # Your sprint goals — edit this file
DECKENT.md         # Project context injected into agent prompts
```

---

## Write Your Sprint Goals

Open `DIRECTIVES.md` and describe what you want done. Each `## Task` block becomes a planned work item.

```markdown
# DIRECTIVES - Sprint 001: Initial setup

## Goal
Add input validation and a test for the `/api/users` endpoint.

---

## Task 1: Add request validation
- Agent: api-builder
- Skills: api-builder
- Model: claude-sonnet-5
- Effort: normal
- Files: src/api/users.ts, src/api/validators.ts
- Scope: src/api/

### Description
Add Zod validation for POST /api/users. Reject requests missing
required fields (name, email) with a 400 response.

**Acceptance:** POST with missing fields returns 400 with a JSON
error body; the existing 201 happy-path test still passes.

---

## Task 2: Write integration test
- Agent: ci-guardian
- Skills: testing-expert
- Model: claude-sonnet-5
- Effort: normal
- Files: tests/api/users.test.ts
- Scope: tests/

### Description
Add a vitest integration test covering:
- valid POST -> 201
- missing name -> 400
- missing email -> 400
```

**Tips for effective directives:**

- One task per logical change. Smaller tasks = faster workers, lower retry rate.
- Specify the files each task may touch under `Scope`. Workers are scoped to those directories; the auditor flags violations.
- Include a concrete acceptance criterion (`Kanit:` / `Acceptance:`). Workers use it to self-assess.
- Assign an `Agent` that matches the domain (api-builder, bug-fixer, frontend-designer, ci-guardian, doc-writer, etc.).

---

## Plan a Sprint

Once `DIRECTIVES.md` contains your goals:

```bash
deckent plan
```

Deckent reads `DIRECTIVES.md`, calls the Brain model to generate task files, and prints a plan table:

```
Sprint sprint-001 planned (3 tasks)

ID       Title                       Model    Priority
001-001  Add request validation      sonnet   high
001-002  Write integration test      sonnet   normal
001-003  Update changelog            haiku    low

Approve this plan? [y/N]
```

Press `y` to move tasks from DRAFT to PENDING. Workers will not start until the plan is approved.

**Useful options:**

```bash
# Preview the plan without writing task files
deckent plan --dry-run

# Skip the approval prompt (CI pipelines)
deckent plan -y

# Plan without an AI provider (structural parsing only)
deckent plan --structured
```

---

## Run the Sprint

```bash
deckent start
```

Before spawning workers, Deckent:

1. Runs a pre-flight doctor check (Node, git, tmux, Claude CLI, locked files)
2. Estimates the sprint cost and shows the total
3. Prompts for confirmation if the estimate exceeds your budget

If the cost gate triggers, either approve the run or reduce scope and re-plan.

Once workers start, the terminal shows a sprint summary as tasks complete:

```
Sprint sprint-001 complete (4m 12s)
3/3 tasks: 2 DONE, 0 TECH_DEBT, 1 NO_GO
Agent: api-builder(2), ci-guardian(1)
```

**Useful options:**

```bash
# Show worker logs as tasks run (tmux-less environments)
deckent start --watch

# Zero-config mode: pass a one-line description as the sprint goal
deckent start "add input validation to the users endpoint"

# Plan only, do not spawn workers
deckent start --dry-run

# Skip the pre-flight check (for repeating a known-good setup)
deckent start --force
```

---

## Review Results

After the sprint completes, review each task:

```bash
deckent review
```

Interactive mode shows you each task's outcome and asks for a decision:

```
Task 001-001: Add request validation
  Status: DONE
  Assessment: DONE
  Tests: PASSED
Decision: [Approve] [Reject] [Retry] [Skip]
```

**Non-interactive options:**

```bash
# Approve all DONE tasks, reject all NO_GO tasks automatically
deckent review --auto

# Approve everything without prompts
deckent review --approve-all

# See the current review state as JSON
deckent review --json
```

Tasks marked `retry` are reset to PENDING. Run `deckent start` again to re-execute them.

---

## Health Check

Run a full system health check at any time:

```bash
deckent doctor
```

Output includes:

- **Your System** — Node.js, git, tmux, Claude CLI version
- **Your Project** — workspace files, DIRECTIVES.md, brain memory usage
- **Provider Health** — per-provider auth state (logged-in vs. missing session)
- **Status** — READY, READY (with warnings), or NOT READY

Example output (abbreviated):

```
Deckent Health Check

Your System:
  OK Node.js -- v22.3.0 (>=18 required)
  OK git -- v2.45.2
  OK tmux -- tmux 3.4
  OK Claude CLI -- v1.0.45

Your Project:
  OK Workspace -- .deckent/ found
  OK Directives -- DIRECTIVES.md found
  OK Memory: 42/900 lines (5% -- healthy)
  OK Last sprint: sprint-001 (completed)

Provider Health:
  [PASS] Claude CLI v1.0.45 -- session auth active
  [WARN] Codex CLI -- not installed
  [WARN] Gemini CLI -- not installed

Status: READY
Recommendation:
  Everything looks good! You can start a new sprint with `deckent start`.
```

**Useful options:**

```bash
# Detailed provider diagnostics (binary, version, auth state for all providers)
deckent doctor --providers

# Host RAM detection and suggested max_workers
deckent doctor --memory

# RAM usage projection (is current worker count safe for your host?)
deckent doctor --ram-experiment

# Pre-flight gates (stricter checks run before sprint spawn)
deckent doctor --pre-flight

# JSON output for scripting
deckent doctor --json
```

If a required check fails, the `Recommendation` section explains the fix. Common issues:

| Problem | Fix |
|---------|-----|
| `Claude CLI not found` | `npm install -g @anthropic-ai/claude-code` |
| `CLI present but NOT logged in` | `claude login` |
| `DIRECTIVES.md missing` | Create `DIRECTIVES.md` with at least one `## Task` block |
| `stale lock(s)` | `deckent cleanup` |

---

## Visibility: KPI, Cost, and Usage

### KPI scorecard

After each sprint, Deckent computes a set of built-in KPIs (success rate, NO_GO rate, sprint duration, cost, and others):

```bash
deckent kpi
```

```
KPI Scorecard -- sprint-001

KPI                     Value     Target    Status
Success Rate            100.0%    >=90%     ok
NO_GO Rate              0.0%      <=5%      ok
Sprint Duration         252.0s    <=1800s   ok
Sprint Cost             $1.24     <=10.00   ok
```

**Useful options:**

```bash
# Scorecard for a specific sprint
deckent kpi --sprint sprint-042

# Trend series for a single KPI (last 10 sprints)
deckent kpi --trend success_rate

# Trend with a custom window
deckent kpi --trend sprint_cost -n 20

# Machine-readable JSON
deckent kpi --json
```

### Cost management

View what each model costs:

```bash
deckent cost show
deckent cost show --provider anthropic
deckent cost show --model claude-sonnet-4-6
```

View and set sprint budgets:

```bash
# Show current budgets
deckent cost budget

# Set a per-sprint cap
deckent cost budget --set 5

# Set a daily cap
deckent cost budget --daily 20

# Set a monthly cap
deckent cost budget --monthly 100
```

The cost gate runs automatically before every `deckent start`. If the estimated cost exceeds `sprint_max_usd`, Deckent prompts before spawning workers.

Refresh pricing data (bundled at install, updated periodically):

```bash
deckent cost update
```

### Real token consumption

Worker self-estimates in `.result` files can under-report by 3-5x. Use `deckent usage` to read the actual numbers from Claude Code transcript ledgers:

```bash
# Last 7 days, grouped by model
deckent usage

# Per-task breakdown for a specific sprint
deckent usage --sprint 001

# Custom date window
deckent usage --since 2026-06-01 --until 2026-06-14

# JSON for downstream tooling
deckent usage --json
```

---

## Multi-Provider Basics

Deckent uses a config-driven provider registry. Each project has three provider slots:

| Config key | Purpose |
|------------|---------|
| `brain_provider` | Which provider the Brain uses to plan tasks |
| `worker_provider` | Which provider workers use to execute tasks |
| `fallback_provider` | Provider used if the primary worker provider fails |

These are set during `deckent init` and stored in `.deckent/config.json`. To change them after init, edit the file directly or re-run:

```bash
deckent init --upgrade
```

**Subscription vs. API key auth**

| Auth mode | How to configure | Cost metering |
|-----------|-----------------|---------------|
| `subscription` (default for Claude) | `claude login` | Covered by subscription; gate shows $0 or lower |
| `api` | Set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_API_KEY` | Metered per token; gate shows real dollar estimate |

The `auth_mode` field in `.deckent/config.json` controls which mode is active.

**Mixed-provider example** — plan with Claude, execute with Codex:

```json
{
  "brain_provider": "claude",
  "worker_provider": "codex",
  "fallback_provider": "claude"
}
```

Deckent routes each task to the assigned provider. If a worker fails and no `fallback_provider` is set, the sprint continues with remaining tasks and marks the failed task as NO_GO.

See [docs/reference/multi-provider.md](../reference/multi-provider.md) for full routing options and provider capability tables.

---

## Quick Reference

```bash
# Initialize (first time)
deckent init

# Check system health
deckent doctor

# Plan a sprint
deckent plan

# Run the sprint
deckent start

# Review results
deckent review

# KPI scorecard
deckent kpi

# Cost budgets
deckent cost budget

# Real token usage
deckent usage

# Get help for any command
deckent help
deckent <command> --help
```

---

## What's Next

- [01-first-sprint.md](./01-first-sprint.md) — A minimal first sprint with a single documentation task
- [02-multi-provider-fleet.md](./02-multi-provider-fleet.md) — Configuring and routing across multiple providers
- [08-cost-and-budget.md](./08-cost-and-budget.md) — Deep dive into cost gates, budgets, and usage reporting
- [docs/reference/cli-commands.md](../reference/cli-commands.md) — Full command and flag reference
- [docs/reference/config-reference.md](../reference/config-reference.md) — All `.deckent/config.json` keys

**Out of scope for this guide** (covered by dedicated cookbook recipes):

- Per-connector setup (Telegram, Discord, WhatsApp notifications)
- ERP / enterprise integration patterns
- Autonomous mode and scheduled sprints
- Memory recall and brain query patterns
