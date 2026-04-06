# PERFORMANCE — Deckent Performance Tuning Guide

> Reference: CONFIG-REFERENCE.md, ARCHITECTURE.md, SPRINT-LIFECYCLE.md
> Last updated: Sprint 065 (2026-03-26)

---

## Table of Contents

1. [Worker Count Tuning](#1-worker-count-tuning)
2. [Model Selection Strategy](#2-model-selection-strategy)
3. [Sprint Size Optimization](#3-sprint-size-optimization)
4. [Memory Budget Management](#4-memory-budget-management)
5. [Usage Limit Management](#5-usage-limit-management)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Worker Count Tuning

Workers are tmux windows running Claude agents in parallel. More workers = faster sprint execution, but higher resource and token usage.

### 1.1 How Worker Count Is Determined

Worker count is controlled by `max_workers` in the active plan mode:

```json
{
  "mode": "max_plan",
  "modes": {
    "max_plan": {
      "max_workers": 8
    }
  }
}
```

Brain spawns **at most** `max_workers` workers, but may spawn fewer if:
- Fewer tasks were planned than the limit
- Dependencies between tasks constrain parallelism
- Usage thresholds reduce the sprint size

### 1.2 System Resource Formula

Deckent calculates a recommended worker count based on available CPU and RAM:

```
recommendedMaxWorkers = max(1, min(floor(freeMemMB / 400), cpuCores - 1, 30))
```

| System | Formula | Recommendation |
|--------|---------|----------------|
| 4 cores, 2 GB free | min(5, 3, 30) = 3 | 3 workers |
| 8 cores, 6 GB free | min(15, 7, 30) = 7 | 7 workers |
| 16 cores, 16 GB free | min(40, 15, 30) = 15 | 15 workers |
| 2 cores, 512 MB free | min(1, 1, 30) = 1 | 1 worker |

Run `deckent doctor --profile` to see your system profile and its recommendation.

### 1.3 Per-Plan-Mode Defaults

| Mode | Default `max_workers` | Target subscription |
|------|-----------------------|---------------------|
| `max_plan` | 8 | Claude Max $200/mo |
| `max5x_plan` | 5 | Claude Max $100/mo |
| `pro_plan` | 3 | Claude Pro $20/mo |
| `api` | 10 | API key (pay-as-you-go) |

### 1.4 Tuning Recommendations

**Increase workers when:**
- Sprints have many independent tasks (no cross-task dependencies)
- Your machine has ≥ 8 GB free RAM and ≥ 8 CPU cores
- You have a Claude Max subscription with generous usage limits

**Decrease workers when:**
- You're hitting usage thresholds mid-sprint (tasks pause/resume)
- RAM is under pressure (< 400 MB free per intended worker)
- Many tasks depend on each other (dependencies limit parallelism anyway)
- Sprint quality is poor — fewer workers means more focused attention

**Optimal range by subscription:**

```json
// Claude Max 20x — aggressive parallelism
"max_workers": 6

// Claude Max 5x — balanced
"max_workers": 4

// Claude Pro — conservative
"max_workers": 2

// API key — budget-limited, not rate-limited
"max_workers": 8
```

### 1.5 Parallelism Efficiency

Adding more workers has diminishing returns. Deckent's sprint estimator uses:

```
parallelismFactor = 1 / sqrt(workers), clamped to [0.2, 1.0]
```

| Workers | Factor | Effective speed gain |
|---------|--------|---------------------|
| 1 | 1.00 | Baseline |
| 2 | 0.71 | 1.4× faster |
| 4 | 0.50 | 2× faster |
| 8 | 0.35 | 2.8× faster |
| 16 | 0.25 | 4× faster |

Beyond 8 workers the gains flatten significantly. Unless you have highly independent tasks and ample resources, **4–6 workers is the sweet spot** for most projects.

---

## 2. Model Selection Strategy

Deckent uses three model tiers. Choosing the right model per task is the most impactful performance lever.

### 2.1 Model Comparison

| Model | Speed | Cost | Best For |
|-------|-------|------|----------|
| `haiku` | Fastest | Cheapest | Simple docs, boilerplate, config files |
| `sonnet` | Balanced | Medium | Most feature work, tests, refactoring |
| `opus` | Slowest | Most expensive | Architecture decisions, complex logic, AI planning |

### 2.2 Model Assignment Flow

```
Brain plans sprint (brain_model)
  └─ Assigns model per task (default_model or per-task override)
       ├─ opus: complex algorithm, security-sensitive, multi-module
       ├─ sonnet: typical feature work, bug fixes, tests
       └─ haiku: docs, configs, i18n strings, simple utilities
```

Brain respects `haiku_allowed` — when `false`, haiku is never assigned even for trivial tasks.

### 2.3 Task-Level Model Hints

When using AI planning mode (`brain_planning: "ai"`), Brain infers the model from task characteristics:

- Title/description contains: *architecture, security, refactor, algorithm* → `opus`
- Title/description contains: *test, fix, update, feature* → `sonnet`
- Title/description contains: *docs, config, i18n, translation* → `haiku`

When using structured mode, model is inferred from directive task content using `inferModelFromDirective()`.

### 2.4 Recommended Model Configuration

**Max throughput (Claude Max 20x):**
```json
{
  "brain_model": "opus",
  "default_model": "sonnet",
  "haiku_allowed": true
}
```
Brain uses Opus for high-quality planning; workers default to Sonnet (fast, capable). Haiku handles trivial tasks.

**Budget-conscious (Claude Max 5x):**
```json
{
  "brain_model": "sonnet",
  "default_model": "sonnet",
  "haiku_allowed": true
}
```
Sonnet for everything. Brain still plans well; workers execute efficiently.

**Token-conservative (Claude Pro):**
```json
{
  "brain_model": "sonnet",
  "default_model": "sonnet",
  "haiku_allowed": false
}
```
Haiku disabled — Pro plan rate limits are tight. Sonnet is a good single-model choice.

**API key (cost-first):**
```json
{
  "brain_model": "opus",
  "default_model": "haiku",
  "haiku_allowed": true
}
```
Opus for Brain (quality planning), Haiku for workers by default (low cost). Override individual tasks to Sonnet/Opus as needed.

### 2.5 Brain Planning Mode Performance

`brain_planning` controls how Brain generates the task list:

| Mode | Speed | Token Cost | Quality |
|------|-------|-----------|---------|
| `"structured"` | Instant | 0 tokens | Determined by DIRECTIVES format |
| `"ai"` | ~30s | ~2000 tokens | Highest — AI infers scope/model/priority |
| `"auto"` (default) | ~30s (or instant on fallback) | ~2000 tokens | Best of both |

**When to use `structured` mode:**
- DIRECTIVES.md has explicit `## Task N:` blocks with full details
- You want zero planning tokens — critical under Pro usage limits
- Sprint planning speed matters (CI environments, rapid iteration)

**When to use `ai` mode:**
- DIRECTIVES.md has high-level goals without explicit task breakdown
- You want AI to infer model selection, scope, and priority automatically
- Quality of task decomposition matters more than planning speed

**When to use `auto` mode (recommended):**
- Always — combines AI quality with structured reliability as fallback

---

## 3. Sprint Size Optimization

Sprint size is the number of tasks in a single sprint. Larger sprints require more workers, more context, and more tokens.

### 3.1 Sprint Size vs. Quality Trade-off

| Sprint Size | Workers Needed | Token Cost | Risk |
|-------------|---------------|-----------|------|
| 1–3 tasks | 1–2 | Low | Low |
| 4–8 tasks | 3–5 | Medium | Medium |
| 9–12 tasks | 6–8 | High | Higher — more coordination overhead |
| 12+ tasks | 8+ | Very high | Task queue wave system activates |

### 3.2 Task Queue Wave System

When a sprint has more tasks than `max_workers`, Deckent uses a wave approach:
- Wave 1: First `max_workers` tasks spawn immediately
- Queued tasks wait in `.tasks/task-*.json` with `status: PENDING`
- As workers complete, queued tasks are picked up automatically

For example, with `max_workers: 8` and 12 tasks:
- Wave 1: 8 workers spawned
- Queue: 4 tasks waiting (released as wave 1 finishes)

**Optimization:** Keep sprint size at or below `max_workers` to avoid queueing overhead. A focused sprint of 6–8 well-scoped tasks typically outperforms a bloated sprint of 12+ tasks.

### 3.3 Effort Levels and Their Cost

Each task has an `effort` field that scales model time:

| Effort | Multiplier | Typical Duration (Sonnet) |
|--------|-----------|--------------------------|
| `low` | 0.6× | ~12 minutes |
| `normal` | 1.0× | ~20 minutes |
| `high` | 1.6× | ~32 minutes |

Additional scope time: +2 minutes per directory or file in scope, up to 10 scope items.

**Optimization:** Prefer `low` effort for documentation tasks, `normal` for feature work, `high` only for complex algorithmic changes. Overusing `high` inflates sprint duration estimates.

### 3.4 Task Dependencies

Tasks with dependencies force sequential execution within a worker:

```
task-001 → task-002 → task-003   (sequential — 3 slots wasted)
task-001                          (parallel if independent)
task-002
task-003
```

**Optimization:** Minimize dependencies. If task B only reads task A's output (not writes to the same files), it may not need a dependency. Scope isolation (`filesWrite`) is enforced by the Auditor regardless.

### 3.5 DIRECTIVES.md Structuring for Performance

For maximum sprint efficiency, write DIRECTIVES.md tasks with:

1. **Narrow scope** — small `directories` array, explicit `filesWrite` list
2. **Clear model hints** — title should indicate complexity level
3. **Minimal dependencies** — only add when file-level conflicts exist
4. **Homogeneous effort** — mixing `low` and `high` effort tasks in the same sprint leads to worker idle time

Example of a well-structured sprint for 4 workers:

```markdown
## Task 1: Add JWT middleware (normal, sonnet, src/middleware/)
## Task 2: Write auth tests (normal, sonnet, tests/auth/)
## Task 3: Update API docs (low, haiku, docs/)
## Task 4: Add i18n strings (low, haiku, .deckent/i18n/)
```

Tasks 1+2 run in parallel; tasks 3+4 run in parallel. Zero idle time, zero queueing.

---

## 4. Memory Budget Management

The `.brain/` directory is a 3-tier memory system with a 600-line budget. Exceeding this budget degrades sprint planning quality and triggers automatic decay.

### 4.1 Memory Architecture

| Tier | File | Max Lines | Loaded When |
|------|------|-----------|-------------|
| 1 | `.brain/MEMORY.md` | 200 | Always (every sprint) |
| 2 | `.brain/sprints/sprint-NNN.md` | 80 each | Brain reads last 2 |
| 3 | `.brain/archive/` | No limit | On-demand only |

**Total budget: 600 lines** (excluding archive). Each sprint adds ~50 lines (retro + memory update). After ~8–12 sprints, decay is needed.

### 4.2 Monitoring Memory Usage

```bash
# Check current brain budget
deckent doctor

# Output example:
# ✓ Brain Budget  247/600 lines
# ○ Brain Budget  612/600 lines — OVER BUDGET, run cleanup --decay
```

Or check directly:
```bash
wc -l .brain/MEMORY.md .brain/RETRO.md .brain/DEBT.md .brain/PATTERNS.md .brain/DECISIONS.md .brain/sprints/*.md
```

### 4.3 Decay and Compression

When `.brain/` exceeds 600 lines, Brain automatically triggers decay at the end of the sprint (DECAY phase). You can also trigger it manually:

```bash
# Automatic decay (only runs if over 600 lines)
deckent cleanup --decay

# Force decay even if under budget
deckent cleanup --force
```

Decay removes:
- **Old sprint logs** — logs older than 5 sprints are archived to `.brain/archive/`
- **Resolved debt** — `DEBT.md` entries resolved 3+ sprints ago are removed
- **Stale patterns** — `PATTERNS.md` entries not seen in 8+ sprints are pruned

### 4.4 Memory Budget Best Practices

**Keep MEMORY.md focused:**
- Maximum 200 lines enforced
- Each entry should be a unique, actionable learning
- Remove duplicates and outdated facts after major refactors

**Keep RETRO.md concise:**
- Maximum 100 lines per retro
- Focus on decisions and surprises, not task summaries
- Brain overwrites RETRO.md each sprint — it doesn't accumulate

**Keep DEBT.md clean:**
- Resolve items promptly — items resolved 3+ sprints ago are auto-removed by decay
- Mark items as `resolved` using `deckent archive-debt` after fixing
- Never add items that are already in the source code (they'll conflict with decay)

**Archive aggressively:**
```bash
# Manually archive old sprint logs
mkdir -p .brain/archive
mv .brain/sprints/sprint-001.md .brain/archive/
mv .brain/sprints/sprint-002.md .brain/archive/
```

### 4.5 Memory Overflow Symptoms

| Symptom | Cause | Fix |
|---------|-------|-----|
| Brain plans duplicate tasks | MEMORY.md context is stale/contradictory | Run decay, clean MEMORY.md manually |
| Planning quality decreases | Too much noise in context window | Compress MEMORY.md to key facts only |
| `doctor` warns over budget | .brain/ > 600 lines | `deckent cleanup --decay` |
| Slow sprint planning | Large MEMORY/PATTERNS context | Prune irrelevant entries |

---

### 5.4 API Mode Budget Management

API mode uses dollar-based limits instead of usage percentages:

```json
{
  "mode": "api",
  "modes": {
    "api": {
      "budget_per_sprint": 5.0,
      "max_workers": 10
    }
  }
}
```

**Estimating cost per sprint:**

| Model | Tokens (avg task) | Cost per task |
|-------|------------------|---------------|
| `haiku` | ~5,000 | ~$0.001 |
| `sonnet` | ~10,000 | ~$0.03 |
| `opus` | ~15,000 | ~$0.15 |

A sprint of 8 Sonnet tasks ≈ $0.24. A sprint of 8 Opus tasks ≈ $1.20.

**Set `budget_per_sprint` conservatively** — an interrupted sprint is worse than a smaller one.

### 5.5 Checking Current Usage

```bash
# See usage in doctor output
deckent doctor

# See usage in status dashboard
deckent status

# JSON output for scripting
deckent status --json | jq '.usage'
```

### 5.6 Scheduling Sprints Around Limits

- **5-hour window** resets every 5 hours from first message
- **Weekly quota** resets every 7 days from account creation
- Run large sprints (8+ tasks) at the **start of a fresh 5-hour window**
- Run small sprints (1–3 tasks) when usage is already at 50–70%
- Use `structured` planning mode when usage is high — it costs 0 planning tokens

---

## 6. Troubleshooting

### 6.1 Slow Sprint Execution

**Symptom:** Sprint takes much longer than expected.

**Diagnosis:**
```bash
# Check sprint estimate before running
deckent plan --dry-run

# Check current worker status
deckent status

# Check individual worker logs
cat .tasks/task-XXX.log
```

**Common causes and fixes:**

| Cause | Fix |
|-------|-----|
| All tasks assigned `opus` | Switch complex tasks to `sonnet` where possible |
| All tasks have `high` effort | Review scope — is effort realistic? |
| Many `high` dependency chains | Restructure tasks to reduce sequential blocking |
| Only 1–2 workers spawned | Check `max_workers` config and usage thresholds |
| Workers paused by usage limit | Wait for limit reset, or lower thresholds for next sprint |
| Large scope per task | Split tasks with narrow scope per worker |

**Quick fix — reduce model costs for the next sprint:**
```json
{
  "modes": {
    "max_plan": {
      "default_model": "sonnet",
      "haiku_allowed": true
    }
  }
}
```

### 6.2 Memory Overflow

**Symptom:** `deckent doctor` warns `Brain Budget over 600 lines`.

```bash
# Step 1: Check what's taking space
wc -l .brain/*.md .brain/sprints/*.md 2>/dev/null | sort -rn | head -20

# Step 2: Run decay
deckent cleanup --decay

# Step 3: If still over budget, manually trim MEMORY.md
# Remove duplicate or outdated entries
# Keep total under 200 lines

# Step 4: Archive old sprint logs manually
mkdir -p .brain/archive
mv .brain/sprints/sprint-00{1..5}.md .brain/archive/ 2>/dev/null

# Step 5: Verify
deckent doctor
```

**Prevention:**
- Run `deckent cleanup --decay` after every 3–4 sprints
- Keep MEMORY.md under 80 lines (leave headroom for the next sprint's learnings)
- Don't add verbose summaries to MEMORY.md — only unique, actionable insights

### 6.3 tmux Issues Affecting Performance

**Symptom:** Workers spawn slowly or not at all; `deckent status` shows no active workers.

```bash
# Check tmux session exists
tmux list-sessions

# List worker windows
tmux list-windows -t deckent

# Attach to see a worker's live output
deckent attach
# or
tmux attach -t deckent

# Kill stale session and restart
tmux kill-session -t deckent
deckent cleanup
deckent start
```

**WSL2 specific — if workers don't appear:**
```bash
# Start tmux session manually first
tmux new-session -d -s deckent

# Then start deckent
deckent start
```

**Stale locks blocking workers:**
```bash
# List locks
ls .locks/

# Remove all (safe when no sprint is running)
rm -f .locks/*.lock

# Verify no stale locks in doctor
deckent doctor
```

**Worker heartbeat stale (>2 min) — worker crashed:**
```bash
# Check heartbeat timestamps
cat .tasks/task-XXX.hb

# Check worker log
cat .tasks/task-XXX.log

# Re-spawn the worker
deckent kill task-XXX
deckent spawn task-XXX
```

### 6.4 High No-Go Rate

**Symptom:** Many tasks completing with `NO_GO` or `GO_WITH_TECH_DEBT` status.

This is usually a planning quality issue, not a performance issue. But it does waste tokens and time.

**Diagnosis:**
```bash
# View last retro
cat .brain/RETRO.md

# View current debt
cat .brain/DEBT.md

# Check sprint log
cat .brain/sprints/sprint-NNN.md
```

**Fixes:**
- Switch to `brain_planning: "ai"` for better task scoping
- Reduce sprint size — fewer, better-scoped tasks have lower NO-GO rates
- Add explicit GO criteria in DIRECTIVES.md task blocks
- Clear CRITICAL debt before starting a new sprint

### 6.5 Performance Benchmark Checklist

Before starting a large sprint, run this checklist:

```bash
# 1. System health
deckent doctor

# 2. Check usage level
deckent status --json | jq '.usage'

# 3. Check memory budget
wc -l .brain/*.md | tail -1

# 4. Preview the plan (0 tokens with structured mode)
deckent plan --dry-run

# 5. Verify config
deckent config | jq '{mode, max_workers: .activeModeConfig.max_workers, brain_planning: .activeModeConfig.brain_planning}'
```

All required checks in step 1 must pass. Usage should be below your configured thresholds. Memory should be under 250 lines. The plan should have ≤ `max_workers` tasks for best parallelism.

---

## Quick Reference

### Worker Count Decision Tree

```
Is free RAM < 400 MB?
  YES → max_workers: 1
  NO  → Is free RAM < 2 GB?
    YES → max_workers: 2-3
    NO  → Is CPU cores < 4?
      YES → max_workers: 2-3
      NO  → Use plan mode default (3-8)
```

### Model Selection Quick Reference

| Task Type | Recommended Model |
|-----------|-----------------|
| Architecture, security design | `opus` |
| Feature implementation, complex tests | `sonnet` |
| Documentation, config, i18n | `haiku` |
| Bug fix (trivial) | `haiku` or `sonnet` |
| Bug fix (complex, multi-file) | `sonnet` or `opus` |
| AI planning (brain_model) | `opus` (Max) or `sonnet` (Pro) |

### Sprint Size Quick Reference

| Situation | Recommended Sprint Size |
|-----------|------------------------|
| Rapid iteration, simple changes | 2–4 tasks |
| Standard feature sprint | 4–8 tasks |
| Large feature, heavy refactor | 6–10 tasks (split into 2 sprints if possible) |
| Documentation sprint | 4–12 tasks (haiku workers are fast) |
| End-of-week, low usage budget | 1–3 tasks |

### Configuration Templates

**Maximum performance (Claude Max 20x):**
```json
{
  "mode": "max_plan",
  "modes": {
    "max_plan": {
      "max_workers": 8,
      "brain_model": "opus",
      "default_model": "sonnet",
      "haiku_allowed": true,
      "brain_planning": "auto"
    }
  }
}
```

**Budget-conscious (Claude Pro):**
```json
{
  "mode": "pro_plan",
  "modes": {
    "pro_plan": {
      "max_workers": 2,
      "brain_model": "sonnet",
      "default_model": "sonnet",
      "haiku_allowed": false,
      "brain_planning": "structured"
    }
  }
}
```

**API key, cost-optimized:**
```json
{
  "mode": "api",
  "modes": {
    "api": {
      "max_workers": 6,
      "brain_model": "sonnet",
      "default_model": "haiku",
      "haiku_allowed": true,
      "budget_per_sprint": 2.00,
      "requires": "ANTHROPIC_API_KEY",
      "brain_planning": "ai"
    }
  }
}
```

---

## Related Documentation

- [CONFIG-REFERENCE.md](CONFIG-REFERENCE.md) — Full configuration reference
- [ARCHITECTURE.md](ARCHITECTURE.md) — System components and data flow
- [SPRINT-LIFECYCLE.md](SPRINT-LIFECYCLE.md) — Sprint phases in detail
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — Common error fixes
- [MEMORY-SYSTEM.md](MEMORY-SYSTEM.md) — Memory tiers and decay
- [BRAIN-GUIDE.md](BRAIN-GUIDE.md) — Brain planning internals
