# CONFIG-REFERENCE — Deckent Configuration Reference

> Blueprint Reference: §13 Multi-Plan Compatibility, §9 Usage-Aware Planning, §5.1 Brain+Planner

---

## Table of Contents

1. [Config File Locations](#1-config-file-locations)
2. [Config Loading Order](#2-config-loading-order)
3. [Top-Level Config Options](#3-top-level-config-options)
4. [Plan Modes](#4-plan-modes)
5. [PlanModeConfig Fields](#5-planmodeconfig-fields)
6. [Brain Planning Modes](#6-brain-planning-modes)
7. [Usage Thresholds](#7-usage-thresholds)
8. [Complete Example Configs](#8-complete-example-configs)
9. [CLI Config Commands](#9-cli-config-commands)
10. [Validation Rules](#10-validation-rules)

---

## 1. Config File Locations

Deckent uses a **two-layer configuration system**:

| Layer | Path | Scope |
|-------|------|-------|
| Global | `~/.deckent/config.json` | All projects on this machine |
| Project | `.deckent/config.json` | This project only |

Project config **overrides** global config using a deep merge. Fields not specified in project config inherit from global config. Fields not specified in either inherit from built-in defaults.

```
Built-in Defaults
     ↓ deepMerge
~/.deckent/config.json (global)
     ↓ deepMerge
.deckent/config.json (project)
     ↓
ResolvedConfig (runtime)
```

> Source: `src/core/config.ts` — `loadConfig()`

---

## 2. Config Loading Order

```typescript
// Pseudo-code of loadConfig()
let config = createDefaultConfig();           // Built-in defaults

const globalConfig = readJson('~/.deckent/config.json');
if (globalConfig) config = deepMerge(config, globalConfig);

const projectConfig = readJson('.deckent/config.json');
if (projectConfig) config = deepMerge(config, projectConfig);

validateConfig(config);   // Throws ConfigValidationError if invalid
return resolvedConfig;    // Ready for runtime use
```

The `deepMerge` function recursively merges plain objects — nested mode configs (e.g., `modes.max_plan.max_workers`) can be overridden individually without replacing the entire mode block.

---

## 3. Top-Level Config Options

These fields sit at the root of `.deckent/config.json`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `PlanMode` | `"max_plan"` | Active plan mode — determines model limits and worker count |
| `modes` | `Record<PlanMode, PlanModeConfig>` | (see §4) | Per-mode configuration blocks |
| `language` | `"en" \| "tr"` | `"en"` | CLI output language |
| `projectName` | `string` | `"deckent-project"` | Project name shown in dashboard and logs |
| `version` | `string` | (from `package.json`) | Deckent version — usually not set manually |
| `brain_planning` | `BrainPlanningMode` | `"auto"` | **Deprecated top-level position** — use `modes.<mode>.brain_planning` instead |
| `last_sprint_id` | `string` | — | Last sprint ID, managed by Brain — do not edit manually |

### Minimal Valid Config

```json
{
  "mode": "max_plan",
  "language": "en",
  "projectName": "my-project"
}
```

When only top-level fields are specified, all `modes.*` values fall back to built-in defaults.

---

## 4. Plan Modes

Deckent ships with **4 built-in plan modes**, each tuned for a different Claude subscription tier. Blueprint §13.

### 4.1 Comparison Table

| Field | `max_plan` | `max5x_plan` | `pro_plan` | `api` |
|-------|-----------|-------------|-----------|-------|
| **Subscription** | Claude Max 20x ($200/mo) | Claude Max 5x ($100/mo) | Claude Pro ($20/mo) | API key (pay-as-you-go) |
| `max_workers` | **8** | **5** | **3** | **10** |
| `brain_model` | `opus` | `sonnet` | `sonnet` | `opus` |
| `default_model` | `opus` | `opus` | `sonnet` | `sonnet` |
| `haiku_allowed` | `true` | `true` | `false` | `true` |
| `5hr` threshold | `0.8` (80%) | `0.7` (70%) | `0.6` (60%) | `1.0` (100%) |
| `weekly` threshold | `0.6` (60%) | `0.5` (50%) | `0.4` (40%) | `1.0` (100%) |
| `budget_per_sprint` | — | — | — | `$5.00` |
| `requires` env var | — | — | — | `ANTHROPIC_API_KEY` |
| `brain_planning` | `"auto"` | `"auto"` | `"auto"` | `"auto"` |

### 4.2 `max_plan` — Claude Max 20x

```json
"max_plan": {
  "max_workers": 8,
  "brain_model": "opus",
  "default_model": "opus",
  "haiku_allowed": true,
  "usage_thresholds": { "5hr": 0.8, "weekly": 0.6 },
  "brain_planning": "auto"
}
```

**When to use:** You have the Claude Max $200/month plan. Full parallelism with up to 8 workers. Brain uses Opus for highest-quality planning. Workers default to Opus — Brain can downgrade individual tasks to Sonnet or Haiku.

**Limits:** Sprint planning pauses when 5-hour usage exceeds 80% or weekly usage exceeds 60%.

### 4.3 `max5x_plan` — Claude Max 5x

```json
"max5x_plan": {
  "max_workers": 5,
  "brain_model": "sonnet",
  "default_model": "opus",
  "haiku_allowed": true,
  "usage_thresholds": { "5hr": 0.7, "weekly": 0.5 },
  "brain_planning": "auto"
}
```

**When to use:** You have the Claude Max $100/month plan. Good parallelism at 5 workers. Brain uses Sonnet to conserve budget; workers can still use Opus for complex tasks.

**Limits:** Sprint planning pauses at 70% 5-hour usage or 50% weekly usage.

### 4.4 `pro_plan` — Claude Pro

```json
"pro_plan": {
  "max_workers": 3,
  "brain_model": "sonnet",
  "default_model": "sonnet",
  "haiku_allowed": false,
  "usage_thresholds": { "5hr": 0.6, "weekly": 0.4 },
  "brain_planning": "auto"
}
```

**When to use:** You have the Claude Pro $20/month plan. Conservative mode — 3 workers maximum. Haiku is disabled because Pro plan usage limits are tight. Everything runs on Sonnet.

**Limits:** Sprint planning pauses at 60% 5-hour usage or 40% weekly usage. Most conservative thresholds.

### 4.5 `api` — API Key Mode

```json
"api": {
  "max_workers": 10,
  "brain_model": "opus",
  "default_model": "sonnet",
  "haiku_allowed": true,
  "usage_thresholds": { "5hr": 1.0, "weekly": 1.0 },
  "budget_per_sprint": 5.0,
  "requires": "ANTHROPIC_API_KEY",
  "brain_planning": "auto"
}
```

**When to use:** You use the Anthropic API with a key. Highest parallelism (10 workers). No usage percentage limits — instead uses `budget_per_sprint` as a dollar cap per sprint. Requires `ANTHROPIC_API_KEY` environment variable.

**Limits:** Budget-based, not usage-percentage-based. `budget_per_sprint: 5.0` means $5.00 maximum per sprint. Thresholds are `1.0` (100%) because percentage limits don't apply.

**Requirement:** `ANTHROPIC_API_KEY` must be set in the environment. Deckent will throw a `ConfigValidationError` at startup if the key is missing.

---

## 5. PlanModeConfig Fields

Each mode block (`modes.<modeName>`) supports these fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `max_workers` | `number` (1–20) | Yes | Maximum parallel workers for this mode |
| `brain_model` | `"opus" \| "sonnet" \| "haiku"` | Yes | Model used by Brain for planning and evaluation |
| `default_model` | `"opus" \| "sonnet" \| "haiku"` | Yes | Default model assigned to workers when Brain doesn't specify |
| `haiku_allowed` | `boolean` | Yes | Whether Brain can assign `haiku` model to workers |
| `usage_thresholds` | `UsageThresholds` | Yes | When to reduce/pause sprint due to usage |
| `usage_thresholds["5hr"]` | `number` (0–1) | Yes | 5-hour rolling window threshold (fraction, e.g. `0.8` = 80%) |
| `usage_thresholds.weekly` | `number` (0–1) | Yes | Weekly quota threshold (fraction, e.g. `0.6` = 60%) |
| `budget_per_sprint` | `number > 0` | No (API mode only) | Max USD budget per sprint |
| `requires` | `string` | No | Required environment variable name (e.g. `"ANTHROPIC_API_KEY"`) |
| `brain_planning` | `BrainPlanningMode` | No | Planning mode override for this specific plan mode |

### Field Details

**`max_workers`**
Controls how many tmux worker windows Brain can spawn in parallel. Brain may spawn fewer if there are fewer tasks or if dependencies constrain parallelism. Valid range: 1–20.

**`brain_model`**
The model Brain uses for:
- Sprint planning (calling `callBrainPlanner()`)
- Evaluating task results (GO/NO-GO decisions)
- Writing retrospectives and memory updates

**`default_model`**
Fallback model for worker tasks when Brain's planner doesn't specify a different model. Brain can override per-task in the task JSON's `model` field.

**`haiku_allowed`**
When `false`, Brain's planner will never assign `haiku` to any worker task, even for trivial work. Use `false` for Pro plan to avoid burning rate limits on haiku calls.

**`budget_per_sprint`**
Only meaningful for `api` mode. Brain tracks estimated token cost and pauses sprint execution if the budget would be exceeded. Value is in USD.

---

## 6. Brain Planning Modes

`brain_planning` controls **how Brain generates task plans** from DIRECTIVES.md. Blueprint §9, §5.1.

> Note: The DIRECTIVES may reference "hybrid" as a mode — this maps to `"auto"` in the codebase. The three implemented modes are `ai`, `structured`, and `auto`.

### 6.1 Mode Comparison

| Mode | Strategy | Fallback | Best For |
|------|----------|----------|----------|
| `"structured"` | Parse `## Task N:` blocks in DIRECTIVES.md | None | Deterministic, predictable plans |
| `"ai"` | AI generates tasks (Zod-validated JSON) | Fails if AI fails | Maximum flexibility |
| `"auto"` **(default)** | AI first → structured fallback on failure | Always succeeds | Production use |

### 6.2 `"structured"` — Directive Block Parser

```
brain_planning: "structured"
```

Brain calls `parseStructuredDirectives()` to extract tasks from DIRECTIVES.md. Tasks are defined with `## Task N:` or `## Görev N:` section headers.

- **Deterministic** — same DIRECTIVES always produces same tasks
- **No AI call** for planning — faster and uses zero tokens
- **Requires** well-formatted DIRECTIVES.md with structured task blocks
- Fails if DIRECTIVES.md has no parseable task blocks

### 6.3 `"ai"` — AI Planner

```
brain_planning: "ai"
```

Brain calls `callBrainPlanner()`, which spawns `claude -p <prompt>` with the full context (DIRECTIVES, MEMORY, RETRO, DEBT, PATTERNS). The response is validated against a Zod schema — tasks must match the `PlannerTask` structure.

- **Flexible** — AI can interpret ambiguous directives, infer scope, select models
- **Zod-validated** — invalid AI responses are rejected (returns `null`)
- **Uses tokens** for planning (typically ~2000 tokens with Opus)
- Fails hard if AI response is invalid or the `claude` CLI is unavailable

### 6.4 `"auto"` — Hybrid (Recommended)

```
brain_planning: "auto"
```

Brain tries AI first. If AI planning succeeds (valid Zod response), the AI plan is used. If AI fails for any reason (timeout, invalid JSON, CLI error), Brain falls back to `structured` mode.

- **Resilient** — never fails due to AI issues alone
- **Best of both worlds** — prefers AI quality, guarantees a plan
- **Default** for all built-in plan modes

### 6.5 Setting Per-Mode vs. Global

You can set `brain_planning` per mode or override it globally:

```json
{
  "mode": "max_plan",
  "modes": {
    "max_plan": {
      "brain_planning": "ai"
    },
    "pro_plan": {
      "brain_planning": "structured"
    }
  }
}
```

This means `max_plan` uses AI planning (more tokens, higher quality), while `pro_plan` uses structured parsing (zero tokens, conserves budget).

---

## 7. Usage Thresholds

Usage thresholds control when Brain reduces sprint size or pauses execution. Blueprint §9.

```json
"usage_thresholds": {
  "5hr": 0.8,
  "weekly": 0.6
}
```

| Threshold | Key | Meaning |
|-----------|-----|---------|
| 5-hour rolling window | `"5hr"` | Fraction of 5-hour message quota used (0.0–1.0) |
| Weekly quota | `"weekly"` | Fraction of weekly message quota used (0.0–1.0) |

### Behavior When Thresholds Are Exceeded

```
Before sprint planning:
  5hr > threshold → reduce sprint size (fewer workers, smaller tasks)
  weekly > threshold → minimal sprint (1-2 workers only)

During sprint execution:
  Limit hit mid-sprint:
    1. Pause active tasks (status → PAUSED, .tasks/*.paused created)
    2. Wait for limit reset
    3. Resume from saved state
    4. Sprint is NEVER abandoned — always runs to completion
```

### Usage Check Per Mode

| Mode | 5hr pause trigger | Weekly pause trigger |
|------|------------------|---------------------|
| `max_plan` | > 80% | > 60% |
| `max5x_plan` | > 70% | > 50% |
| `pro_plan` | > 60% | > 40% |
| `api` | N/A (budget-based) | N/A (budget-based) |

---

## 8. Complete Example Configs

### 8.1 Minimal Project Config (Max 20x user)

```json
{
  "mode": "max_plan",
  "language": "en",
  "projectName": "my-app"
}
```

All `modes.*` values fall back to built-in defaults.

### 8.2 Custom Worker Limits

```json
{
  "mode": "max_plan",
  "projectName": "my-app",
  "modes": {
    "max_plan": {
      "max_workers": 4,
      "brain_model": "opus",
      "default_model": "sonnet",
      "haiku_allowed": true,
      "usage_thresholds": { "5hr": 0.75, "weekly": 0.55 },
      "brain_planning": "auto"
    }
  }
}
```

Reduces workers to 4 (from default 8) and lowers thresholds slightly for a more conservative sprint.

### 8.3 API Mode Config

```json
{
  "mode": "api",
  "language": "en",
  "projectName": "my-api-project",
  "modes": {
    "api": {
      "max_workers": 6,
      "brain_model": "opus",
      "default_model": "sonnet",
      "haiku_allowed": true,
      "usage_thresholds": { "5hr": 1.0, "weekly": 1.0 },
      "budget_per_sprint": 3.00,
      "requires": "ANTHROPIC_API_KEY",
      "brain_planning": "ai"
    }
  }
}
```

API mode with reduced budget ($3/sprint instead of $5) and 6 workers instead of 10.

### 8.4 Pro Plan with Turkish Language

```json
{
  "mode": "pro_plan",
  "language": "tr",
  "projectName": "benim-projem",
  "modes": {
    "pro_plan": {
      "max_workers": 3,
      "brain_model": "sonnet",
      "default_model": "sonnet",
      "haiku_allowed": false,
      "usage_thresholds": { "5hr": 0.5, "weekly": 0.35 },
      "brain_planning": "structured"
    }
  }
}
```

Pro plan with Turkish UI, conservative thresholds (50%/35%), and structured planning to save tokens.

### 8.5 Multi-Mode Config (switch between modes without re-editing)

```json
{
  "mode": "max_plan",
  "language": "en",
  "projectName": "my-project",
  "modes": {
    "max_plan": {
      "max_workers": 8,
      "brain_model": "opus",
      "default_model": "opus",
      "haiku_allowed": true,
      "usage_thresholds": { "5hr": 0.8, "weekly": 0.6 },
      "brain_planning": "ai"
    },
    "max5x_plan": {
      "max_workers": 5,
      "brain_model": "sonnet",
      "default_model": "sonnet",
      "haiku_allowed": true,
      "usage_thresholds": { "5hr": 0.7, "weekly": 0.5 },
      "brain_planning": "auto"
    },
    "pro_plan": {
      "max_workers": 2,
      "brain_model": "sonnet",
      "default_model": "sonnet",
      "haiku_allowed": false,
      "usage_thresholds": { "5hr": 0.5, "weekly": 0.35 },
      "brain_planning": "structured"
    },
    "api": {
      "max_workers": 10,
      "brain_model": "opus",
      "default_model": "sonnet",
      "haiku_allowed": true,
      "usage_thresholds": { "5hr": 1.0, "weekly": 1.0 },
      "budget_per_sprint": 5.0,
      "requires": "ANTHROPIC_API_KEY",
      "brain_planning": "ai"
    }
  }
}
```

All 4 modes pre-configured — switch the active mode with `deckent config set mode pro_plan`.

---

## 9. CLI Config Commands

### Show current resolved config

```bash
deckent config
```

Outputs the fully resolved `ResolvedConfig` as JSON — includes merged values from global + project config plus runtime fields (`projectRoot`, `version`, `activeModeConfig`).

### Set a top-level config value

```bash
deckent config set mode pro_plan
deckent config set language tr
deckent config set projectName my-new-name
```

Values are written to `.deckent/config.json`. The value is parsed as JSON first (for booleans/numbers), then as a string.

### Switch plan mode

```bash
deckent config set mode max_plan      # Claude Max 20x
deckent config set mode max5x_plan    # Claude Max 5x
deckent config set mode pro_plan      # Claude Pro
deckent config set mode api           # API key mode
```

The mode switch takes effect on the next `deckent start` or `deckent plan`.

### Set brain planning mode

```bash
deckent config set brain_planning auto
```

> Note: this sets `brain_planning` at the top level. To set it per-mode, edit `.deckent/config.json` directly under `modes.<modeName>.brain_planning`.

---

## 10. Validation Rules

Deckent validates the config on every load. A `ConfigValidationError` is thrown with all validation failures listed.

| Field | Constraint |
|-------|-----------|
| `mode` | Must be one of: `max_plan`, `max5x_plan`, `pro_plan`, `api` |
| `language` | Must be one of: `en`, `tr` (if specified) |
| `modes.<name>.max_workers` | Number between 1 and 20 (inclusive) |
| `modes.<name>.brain_model` | One of: `opus`, `sonnet`, `haiku` |
| `modes.<name>.default_model` | One of: `opus`, `sonnet`, `haiku` |
| `modes.<name>.haiku_allowed` | Must be a boolean |
| `modes.<name>.usage_thresholds["5hr"]` | Number between 0.0 and 1.0 |
| `modes.<name>.usage_thresholds.weekly` | Number between 0.0 and 1.0 |
| `modes.<name>.budget_per_sprint` | Positive number (API mode only) |
| `modes.<name>.brain_planning` | One of: `ai`, `structured`, `auto` |
| API mode + `ANTHROPIC_API_KEY` | Environment variable must be set when `mode` is `"api"` |

### Example validation error output

```
ConfigValidationError: Config validation failed:
  - Invalid mode "turbo". Must be one of: max_plan, max5x_plan, pro_plan, api
  - modes.max_plan.max_workers must be a number between 1 and 20
  - modes.api.usage_thresholds.5hr must be a number between 0 and 1
```

> Source: `src/core/config.ts` — `validateConfig()`, `ConfigValidationError`

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — System architecture overview
- [BRAIN-GUIDE.md](BRAIN-GUIDE.md) — Brain planning internals
- [SPRINT-LIFECYCLE.md](SPRINT-LIFECYCLE.md) — Sprint phases and flow
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — Common config issues
- Blueprint §9: Usage-Aware Planning
- Blueprint §13: Multi-Plan Compatibility
- Blueprint §15: Security & Permissions
