# Multi-Provider Fleet and Cost Visibility

This recipe walks through configuring Deckent's provider registry, running a sprint across multiple AI providers, and using the cost and KPI surfaces to understand and control spending. It is written for a user who has already completed `deckent init` (see [getting-started-en.md](./getting-started-en.md)) and wants to go beyond the single-provider default.

---

## Prerequisites

| Requirement | How to verify |
|-------------|---------------|
| Deckent initialized project (`.deckent/config.json` exists) | `ls .deckent/config.json` |
| At least one provider authenticated | `deckent doctor --providers` |
| `deckent doctor` returns READY or READY (with warnings) | `deckent doctor` |

For the mixed-fleet examples in this recipe you will need credentials for at least two providers. The following sections explain how to authenticate each one.

---

## 1. Provider Registry

### How Deckent routes tasks

Every sprint uses three provider slots configured in `.deckent/config.json`:

| Config key | Role |
|------------|------|
| `brain_provider` | Plans the sprint (Brain model) |
| `worker_provider` | Executes tasks (worker model, default for all tasks) |
| `fallback_provider` | Used if the primary worker provider fails or is unavailable |

Supporting keys narrow the model tier within each slot:

| Config key | Accepted values | Effect |
|------------|-----------------|--------|
| `brain_tier` | `premium`, `standard`, `economy` | Minimum tier for the Brain model |
| `worker_tier` | `premium`, `standard`, `economy` | Minimum tier for worker models |
| `auth_mode` | `subscription`, `api` | Controls how the cost gate interprets estimates |

A minimal mixed-provider configuration that plans with Claude and executes with Codex:

```json
// .deckent/config.json
{
  "brain_provider": "claude",
  "brain_tier": "premium",
  "worker_provider": "codex",
  "worker_tier": "standard",
  "fallback_provider": "claude",
  "auth_mode": "api"
}
```

Set these during `deckent init` (interactive) or edit the file directly. To re-run the wizard over an existing config without losing customizations:

```bash
deckent init --upgrade
```

### Supported providers

| Provider | Short key | Auth | Worker backend |
|----------|-----------|------|----------------|
| Claude | `claude` | Subscription (`claude login`) or `ANTHROPIC_API_KEY` | tmux (default) or subprocess; Docker with `~/.claude` mount |
| OpenAI Codex | `codex` | ChatGPT subscription (`codex auth status`) or `OPENAI_API_KEY` | subprocess (host-adapter); Docker with `~/.codex` mount |
| Google Gemini | `gemini` | OAuth session (`gemini login`) or `GOOGLE_API_KEY` | subprocess (host-adapter); Docker with `~/.gemini` mount |
| Ollama | `ollama` | None (local HTTP server on `localhost:11434`) | HTTP subprocess |
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` | HTTP-only (no spawn) |
| Qwen | `qwen` | `DASHSCOPE_API_KEY` | HTTP-only (no spawn) |
| GLM / Zhipu | `glm` | `ZHIPU_API_KEY` | HTTP-only (no spawn) |

For full setup instructions for each provider, see [../reference/multi-provider.md](../reference/multi-provider.md).

### Subscription vs. API key

Each provider supports one or both authentication modes:

**Subscription mode** — The user is authenticated through an active paid plan (Claude Pro/Max, ChatGPT Plus/Team, or Gemini Advanced). The provider CLI manages its own OAuth session in the user's home directory. No token-level metering occurs on the Deckent side.

```bash
# Claude subscription — log in via the Claude Code CLI
npm install -g @anthropic-ai/claude-code
claude login

# Codex / ChatGPT subscription
npm install -g @openai/codex
codex login

# Gemini subscription
npm install -g @google/gemini-cli
gemini login
```

Set `"auth_mode": "subscription"` in `.deckent/config.json`. The pre-sprint cost gate shows `$0` (or a lower estimate) because the subscription covers execution costs on that provider's side.

**API key mode** — The provider meters usage by token. Each call generates a billable charge. Set the relevant environment variable and set `"auth_mode": "api"`:

```bash
# Claude API key
export ANTHROPIC_API_KEY=sk-ant-...

# OpenAI API key (Codex)
export OPENAI_API_KEY=sk-...

# Google API key (Gemini)
export GOOGLE_API_KEY=AIza...

# DeepSeek
export DEEPSEEK_API_KEY=...

# Qwen (Alibaba Cloud DashScope)
export DASHSCOPE_API_KEY=...

# GLM / Zhipu
export ZHIPU_API_KEY=...
```

With `auth_mode: api`, the pre-sprint cost gate compares the estimated sprint cost against `sprint_max_usd` and blocks execution if the estimate exceeds it.

### Auth isolation: no cross-provider key leak

Each provider uses a separate, dedicated environment variable and session directory. Deckent reads each variable independently:

- Claude workers read `ANTHROPIC_API_KEY` (or use `~/.claude`)
- Codex workers read `OPENAI_API_KEY` (or use `~/.codex`)
- Gemini workers read `GOOGLE_API_KEY` (or use `~/.gemini`)

Setting `OPENAI_API_KEY` has no effect on Claude workers, and vice versa. A worker that authenticates via subscription on one provider never passes that credential to a task routed to a different provider. This isolation is structural — it is enforced by the provider adapter layer, not a policy you configure.

When using per-task `- Auth: api` overrides (see section 2), only the task that carries that override uses the API key path. Other tasks in the same sprint continue using their own provider's auth mode.

---

## 2. Running a Mixed-Provider Fleet

### Per-task provider fields

Any task in `DIRECTIVES.md` can override the workspace defaults with inline fields:

| Field | Values | Effect |
|-------|--------|--------|
| `- Provider:` | `claude`, `codex`, `gemini`, `ollama`, `deepseek`, `qwen`, `glm` | Routes the task to this provider |
| `- Model:` | Short registry ID (see table below) | Selects the model within the provider |
| `- Auth:` | `subscription`, `api` | Overrides the workspace `auth_mode` for this task only |
| `- Backend:` | `docker`, `tmux`, `subprocess` | Selects the worker execution backend |
| `- ModelEffort:` | `low`/`medium`/`high`/`xhigh`/`max` (Claude), `minimal`/`low`/`medium`/`high` (Codex) | Reasoning depth, independent of task `Effort` |

`- Effort:` (task work size, controls timeout and budget) and `- ModelEffort:` (reasoning depth) are independent. A quick task (`Effort: low`) can still run with `ModelEffort: high`.

### Short model registry IDs

Use these in `- Model:` directives:

| Provider | Model ID | Tier | Notes |
|----------|----------|------|-------|
| `claude` | `claude-opus-4-8` | premium | Most capable Claude |
| `claude` | `claude-sonnet-5` | standard | Balanced, default |
| `claude` | `claude-haiku-4-5-20251001` | economy | Fastest Claude |
| `codex` | `o3` | premium_plus | Advanced reasoning |
| `codex` | `gpt-5.5` | premium | Frontier OpenAI |
| `codex` | `gpt-4.1` | standard | Balanced OpenAI |
| `codex` | `o4-mini` | standard | Reasoning, efficient |
| `codex` | `gpt-5-mini` | economy | Economy OpenAI |
| `gemini` | `gemini-2.5-pro` | premium | Full Gemini 2.5 |
| `gemini` | `gemini-2.5-flash` | standard | Fast Gemini 2.5 |
| `gemini` | `gemini-2.0-flash` | economy | Economy Gemini |

Tasks that omit `- Provider:` or `- Model:` use the workspace defaults (`worker_provider` and `worker_tier`).

### Mixed-fleet example

This example plans with Claude, runs documentation tasks on Claude, code tasks on Codex, and review tasks on Gemini:

```markdown
# DIRECTIVES — Sprint: Mixed Fleet Demo

## Goal
Demonstrate a three-provider sprint: Claude for planning and docs,
Codex for implementation, Gemini for review.

---

## Task 1: Update onboarding guide
- Agent: doc-writer
- Provider: claude
- Model: claude-sonnet-5
- Effort: low
- Files: docs/onboarding.md
- Scope: docs/

### Description
Rewrite the onboarding guide to reflect the current CLI commands.

**Acceptance:** `test -f docs/onboarding.md` and the file references
`deckent init`, `deckent start`, `deckent review`.

---

## Task 2: Add request validation
- Agent: api-builder
- Provider: codex
- Model: gpt-4.1
- Effort: normal
- Files: src/api/validate.ts
- Scope: src/api/

### Description
Add Zod schema validation to the POST /api/users handler.

**Acceptance:** `npx tsc --noEmit` passes; POST with missing fields
returns 400.

---

## Task 3: Review sprint output
- Agent: code-reviewer
- Provider: gemini
- Model: gemini-2.5-flash
- Effort: low
- Files: docs/onboarding.md, src/api/validate.ts
- Scope: docs/, src/api/

### Description
Review both changed files for correctness, coverage gaps, and style.

**Acceptance:** Review findings written to the task result file.
```

Plan and start the sprint:

```bash
deckent plan
deckent start
```

The `deckent start` output identifies each worker's provider:

```
Sprint sprint-001 complete (6m 03s)
3/3 tasks: 3 DONE, 0 TECH_DEBT, 0 NO_GO
Providers: claude(2), codex(1), gemini(1)
```

### Container-isolated workers

By default, Claude workers run inside a Docker container. Codex, Gemini, and Ollama workers run on the host via their CLI or HTTP adapter. To run a host-CLI provider (Codex, Gemini) inside the container instead, add `- Backend: docker`. The container image must include the provider binary and the provider's host credential directory is mounted automatically (`~/.codex` or `~/.gemini`).

```markdown
## Task 2: Containerized Codex analysis
- Provider: codex
- Backend: docker
- ModelEffort: high
- Effort: normal
- Files: docs/analysis.md
- Scope: docs/

### Description
Run a high-reasoning Codex analysis inside the container.

**Acceptance:** `test -f docs/analysis.md`
```

### Checking provider health before a sprint

```bash
deckent doctor --providers
```

The output shows the auth state of every detected provider:

```
Provider Health:
  [PASS] Claude CLI v1.0.45 -- session auth active
  [PASS] Codex CLI v0.1.2452 -- session auth active
  [WARN] Gemini CLI -- GOOGLE_API_KEY not set, OAuth session missing
  [SKIP] Ollama -- not installed
```

A `WARN` on a provider a task uses will cause those tasks to be routed to `fallback_provider`. Fix the warning before starting if you need that specific provider.

### Fallback behavior

If a worker provider fails during a sprint, Deckent retries the task once on `fallback_provider`. If `fallback_provider` is not configured or also fails, the task is marked NO_GO. Tasks routed to fallback appear in the sprint summary:

```
Task 001-002: Add request validation
  Status: NO_GO (provider: codex -- auth failure, fallback: claude -- OK)
```

Review the failed task with `deckent review` and either fix the provider auth and retry, or let the fallback-routed result stand.

---

## 3. Cost Configuration

### Pre-sprint cost gate

Before spawning workers, `deckent start` estimates the sprint cost and compares it to `sprint_max_usd` in `.deckent/cost-config.json`. If the estimate exceeds the limit, execution is paused:

```
Estimated cost: $7.42
Sprint budget:  $5.00 (sprint_max_usd)
Cost gate triggered. Approve to continue? [y/N]
```

The estimate is a forecast derived from task count, assigned models, and historical token patterns. Actual cost may differ depending on retry count, context size, and provider billing rules.

**Subscription note:** If `auth_mode` is `subscription` for a provider, the gate estimate for that provider's tasks may show `$0` because the local session is not token-metered. The tokens still count against subscription plan limits.

### Budget configuration

Cost limits live in `.deckent/cost-config.json`. Manage them through the CLI:

```bash
# View all current limits
deckent cost budget

# Set a per-sprint cap (USD)
deckent cost budget --set 5

# Set a daily cap
deckent cost budget --daily 20

# Set a monthly cap
deckent cost budget --monthly 100
```

Example output of `deckent cost budget`:

```
Cost Budgets
  Sprint:  $5.00
  Daily:   $20.00
  Monthly: $100.00
```

Edit `.deckent/cost-config.json` directly for multi-key changes or to set `auto_confirm_below_usd` (estimates below this value proceed without a prompt):

```json
{
  "cost_limits": {
    "sprint_max_usd": 5,
    "daily_max_usd": 20,
    "monthly_max_usd": 100,
    "auto_confirm_below_usd": 1.00
  }
}
```

### View model pricing

The bundled pricing table lists input, output, and cache costs per provider:

```bash
# All enabled models
deckent cost show

# Filter to one provider
deckent cost show --provider anthropic

# Single model detail (input, output, cache read/write, tier, features)
deckent cost show --model claude-sonnet-4-6
```

Example output of `deckent cost show`:

```
Pricing (12 models, source: bundled)
Last updated: 2026-06-01T00:00:00.000Z

-- anthropic (billing: subscription/api) --
  claude-sonnet-4-6              in=$3.00/MTok  out=$15.00/MTok  cache=$0.30/MTok  ctx=200K
  claude-opus-4-8                in=$15.00/MTok out=$75.00/MTok  cache=$1.50/MTok  ctx=200K
  claude-haiku-4-5               in=$0.80/MTok  out=$4.00/MTok   cache=$0.08/MTok  ctx=200K

-- openai (billing: subscription/api) --
  gpt-5                          in=$2.00/MTok  out=$8.00/MTok   cache=N/A         ctx=128K
  gpt-4.1                        in=$2.00/MTok  out=$8.00/MTok   cache=N/A         ctx=128K
```

Refresh pricing from LiteLLM and OpenRouter when a model is missing or prices are stale:

```bash
deckent cost update

# Preview changes without writing
deckent cost update --dry-run

# Update a single provider
deckent cost update --provider anthropic
```

---

## 4. Real Token Consumption

### Why estimates differ from actuals

Worker agents write self-reported token estimates to their `.result` files. These self-estimates are systematically low — typically 3 to 5 times lower than the tokens actually consumed — because the worker cannot observe its own prompt context size at runtime.

Deckent captures real usage from a different source: the session transcripts that the Claude Code CLI writes to disk. The `deckent usage` command reads these transcript ledger files and reports actual input, output, cache-read, and cache-write token counts for every model call. This is the authoritative token record.

### View actual consumption

```bash
# Last 7 days, grouped by model
deckent usage

# Per-task breakdown for a specific sprint
deckent usage --sprint 285

# Custom date window
deckent usage --since 2026-06-01 --until 2026-06-14

# Machine-readable JSON
deckent usage --json
```

Example output of `deckent usage`:

```
Usage -- last 7 days

Model                           Calls  Input    Output   CW       Cost    Hit%
claude-sonnet-4-6               47     12.4M    1.2M     8.3M     $14.20  40%
claude-opus-4-8                 12     3.1M     0.4M     2.1M     $18.50  41%
TOTAL                           59     15.5M    1.6M     10.4M    $32.70  40%
```

Columns:

| Column | Meaning |
|--------|---------|
| Calls | Number of API calls to this model |
| Input | Input tokens (not counting cache reads) |
| Output | Output tokens |
| CW | Cache-write tokens (first write to prompt cache) |
| Cost | Estimated cost in USD using current pricing |
| Hit% | Cache hit rate: `cache_read / (cache_read + input)` |

The `--sprint N` flag filters to sessions associated with sprint N tasks and shows a per-task breakdown:

```bash
deckent usage --sprint 285
```

```
Usage -- sprint-285

Task     Model               Calls  Output   CW       Boot CW  Cost
285-001  claude-sonnet-4-6   3      42.1K    210.3K   198.0K   $0.72
285-002  claude-opus-4-8     2      28.4K    185.2K   185.2K   $2.41
285-003  claude-sonnet-4-6   5      61.2K    220.1K   198.0K   $1.02
TOTAL                        10     131.7K   615.6K   --       $4.15

Cache gate: PASS -- 78% warm share (task 285-001)
```

The cache gate line reports how effectively prompt caching was used across the sprint. A low warm share (under 30%) means workers are paying full input cost on each call — consider consolidating task context or enabling cache-primed workers.

### Weekly budget reference

To see consumption relative to a weekly budget target, set `usage.weekly_budget_equiv` in `.deckent/config.json`:

```json
{
  "usage": {
    "weekly_budget_equiv": 50
  }
}
```

`deckent usage` will then append a reference line:

```
Weekly budget reference: $50.00
```

---

## 5. KPI Scorecard

### What KPIs are available

After each sprint, Deckent computes eight built-in KPIs from the sprint result data:

| KPI ID | Display name | Direction | Format | Notes |
|--------|-------------|-----------|--------|-------|
| `cost_per_sprint` | Cost / Sprint | down | currency | Total USD cost for the sprint |
| `token_per_task` | Tokens / Task | down | number | Average tokens consumed per task |
| `cache_hit_rate` | Cache Hit Rate | up | percent | Fraction of input tokens served from cache |
| `cost_per_kloc` | Cost / KLoC | down | currency | USD per thousand lines of code added |
| `avg_retry` | Avg Retries / Task | down | number | Average retry count per task |
| `no_go_rate` | No-Go Rate | down | percent | Fraction of tasks marked NO_GO |
| `completion_rate` | Completion Rate | up | percent | Fraction of tasks marked DONE |
| `boundary_violation_rate` | Boundary Violation Rate | down | percent | Fraction of tasks that wrote outside their declared scope |

Direction `down` means a lower value is better; `up` means higher is better. Each KPI displays a direction arrow in the scorecard.

### View the scorecard

```bash
# Scorecard for the current or most recently finalized sprint
deckent kpi

# Scorecard for a specific sprint
deckent kpi --sprint sprint-042

# Machine-readable JSON
deckent kpi --json
```

Example output:

```
KPI Scorecard -- sprint-285

KPI                          Value       Target      Status
Cost / Sprint                $4.15 v     <=5.00      ok
Tokens / Task                43,700 v    --          --
Cache Hit Rate               38.2% ^     --          --
Cost / KLoC                  $2.07 v     --          --
Avg Retries / Task           0.3 v       --          --
No-Go Rate                   0.0% v      <=5%        ok
Completion Rate              100.0% ^    >=90%       ok
Boundary Violation Rate      0.0% v      --          ok
```

The `v` arrow next to a value means lower is better (direction `down`); `^` means higher is better (direction `up`). The Status column shows `ok`, `warn`, or `critical` based on the thresholds defined for that KPI.

### Breach advisory

A `critical` status in the scorecard is a breach advisory: the KPI has crossed its critical threshold. The thresholds with built-in advisory levels are:

| KPI ID | Warn threshold | Critical threshold |
|--------|---------------|-------------------|
| `cost_per_sprint` | $3.00 | $3.50 |
| `no_go_rate` | 15% | 30% |

When the scorecard shows `critical` on `cost_per_sprint`, the sprint is above the cost-per-sprint warning level. Cross-reference with `deckent usage` to identify which tasks drove the excess.

When `no_go_rate` is `critical` (30% or more of tasks failed), review which tasks produced NO_GO results and whether they share a common root cause:

```bash
deckent review
```

### Trend series

The `--trend` flag shows how a KPI has moved across recent sprints, which is more useful than a single-sprint snapshot for detecting regressions or improvements:

```bash
# Last 10 sprints for cost_per_sprint (default window)
deckent kpi --trend cost_per_sprint

# Last 20 sprints
deckent kpi --trend cost_per_sprint -n 20

# Cache hit rate trend
deckent kpi --trend cache_hit_rate -n 15

# JSON output for charting
deckent kpi --trend no_go_rate --json
```

Example output of `deckent kpi --trend cost_per_sprint`:

```
KPI Trend -- Cost / Sprint

Sprint       Value       Target      Status
sprint-276   $5.20 v     <=5.00      critical
sprint-277   $4.88 v     <=5.00      warn
sprint-278   $3.95 v     <=5.00      ok
sprint-279   $4.15 v     <=5.00      ok
sprint-280   $4.15 v     <=5.00      ok
```

The trend series reveals whether a breach is improving, stable, or worsening. Sprint 276 crossed the critical threshold; sprints 277 through 280 show recovery. Use this pattern to decide whether a breach needs immediate action or is already self-correcting.

For `--json`, the output is a `{ kpiId, series: [{ periodKey, value, status }] }` object suitable for piping into a dashboard or alerting script.

---

## 6. End-to-End Walkthrough

This walkthrough starts from scratch and covers all surfaces in order.

### Step 1: Configure providers and budgets

Edit `.deckent/config.json` to set your provider slots and auth mode. For a mixed API-key fleet:

```json
{
  "brain_provider": "claude",
  "brain_tier": "premium",
  "worker_provider": "codex",
  "worker_tier": "standard",
  "fallback_provider": "claude",
  "auth_mode": "api"
}
```

Set API keys in your environment:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
```

Set a sprint budget:

```bash
deckent cost budget --set 10
deckent cost budget --daily 40
```

### Step 2: Verify provider health

```bash
deckent doctor --providers
```

All providers your tasks will use should show `[PASS]`. Fix any `[WARN]` before continuing.

### Step 3: Check pricing

```bash
deckent cost show
```

Confirm the models you plan to use appear in the table with pricing. If a model is missing or prices look stale:

```bash
deckent cost update --dry-run   # preview what would change
deckent cost update             # apply the update
```

### Step 4: Write DIRECTIVES.md with per-task provider assignments

Assign each task to the provider that fits its work. See section 2 for the full field reference.

### Step 5: Plan and review the sprint

```bash
deckent plan
```

Review the plan table to confirm provider assignments are correct. Approve with `y`.

### Step 6: Start the sprint

```bash
deckent start
```

The pre-sprint cost gate displays the estimated cost. If it exceeds `sprint_max_usd`, either approve it explicitly or adjust the budget:

```bash
deckent cost budget --set 15
deckent start
```

### Step 7: Review results

```bash
deckent review
```

For any NO_GO tasks, decide whether to retry, fix the directive, or accept the result.

### Step 8: Check actual consumption

```bash
# Real token and cost data from transcript ledgers
deckent usage --sprint <N>
```

Compare the totals against the pre-sprint estimate. A large discrepancy (estimate was 3x lower than actual) means the sprint used more retries or larger context than the planner expected.

### Step 9: Check KPI scorecard

```bash
deckent kpi
```

Review every KPI's status. If `cost_per_sprint` is `warn` or `critical`, look at the `token_per_task` and `avg_retry` values to find the driver.

### Step 10: Check cost trends over time

```bash
deckent kpi --trend cost_per_sprint -n 10
deckent kpi --trend no_go_rate -n 10
```

If trends are worsening, consider:

- Reducing task scope or splitting large tasks
- Switching expensive tasks from `opus` to `sonnet`
- Setting a lower `sprint_max_usd` to force earlier review
- Increasing the cache hit rate by reducing context churn between tasks

---

## See Also

- [02-multi-provider-fleet.md](./02-multi-provider-fleet.md) — Per-task provider and backend field reference with quick-start examples
- [08-cost-and-budget.md](./08-cost-and-budget.md) — Deep dive into the cost gate, subscription vs. API billing, and usage reporting
- [../reference/multi-provider.md](../reference/multi-provider.md) — Full provider setup instructions, capability tables, and troubleshooting
- [../reference/cli-commands.md](../reference/cli-commands.md) — Complete command and flag reference
- [../reference/config-reference.md](../reference/config-reference.md) — All `.deckent/config.json` keys and their defaults
