# Configuration Reference

Complete reference for all Deckent configuration options.

---

## Table of Contents

1. [Config File Locations](#1-config-file-locations)
2. [Config Loading Order](#2-config-loading-order)
3. [Top-Level Config Options](#3-top-level-config-options)
4. [Plan Modes](#4-plan-modes)
5. [PlanModeConfig Fields](#5-planmodeconfig-fields)
6. [Brain Planning Modes](#6-brain-planning-modes)
7. [Usage Thresholds](#7-usage-thresholds)
8. [Global vs Project Config](#8-global-vs-project-config)
9. [Example Configs](#9-example-configs)
10. [CLI Config Commands](#10-cli-config-commands)
11. [Validation Rules](#11-validation-rules)

---

## 1. Config File Locations

Deckent uses a two-layer configuration system:

| Layer | Path | Scope |
|-------|------|-------|
| Global | `~/.deckent/config.json` | All projects on this machine |
| Project | `.deckent/config.json` | This project only |

Project config overrides global config using a deep merge. Fields not specified in the project config inherit from the global config. Fields not specified in either inherit from built-in defaults.

---

## 2. Config Loading Order

```
Built-in Defaults
     |  (deep merge)
~/.deckent/config.json  (global)
     |  (deep merge)
.deckent/config.json  (project)
     |
ResolvedConfig  (runtime)
```

The deep merge function recursively merges plain objects. Nested mode configs (for example, `modes.max_plan.max_workers`) can be overridden individually without replacing the entire mode block.

Source: `src/core/config.ts` -- `loadConfig()`

---

## 3. Top-Level Config Options

These fields sit at the root of `.deckent/config.json`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `PlanMode` | `"max_plan"` | Active plan mode. Determines model limits and worker count. |
| `modes` | `Record<PlanMode, PlanModeConfig>` | (see section 4) | Per-mode configuration blocks. |
| `language` | `"en"` or `"tr"` | `"en"` | CLI output language. |
| `projectName` | `string` | `"deckent-project"` | Project name shown in dashboard and logs. |
| `version` | `string` | (from package.json) | Deckent version. Usually not set manually. |
| `brain_planning` | `BrainPlanningMode` | `"auto"` | Planning mode. Can also be set per-mode. |
| `last_sprint_id` | `string` | -- | Last sprint ID. Managed by Brain. Do not edit manually. |

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

Deckent ships with four built-in plan modes, each tuned for a different Claude subscription tier.

### Comparison Table

| Field | `max_plan` | `max5x_plan` | `pro_plan` | `api` |
|-------|-----------|-------------|-----------|-------|
| **Subscription** | Max 20x ($200/mo) | Max 5x ($100/mo) | Pro ($20/mo) | API key (pay-as-you-go) |
| `max_workers` | 8 | 5 | 3 | 10 |
| `brain_model` | `opus` | `sonnet` | `sonnet` | `opus` |
| `default_model` | `opus` | `opus` | `sonnet` | `sonnet` |
| `haiku_allowed` | `true` | `true` | `false` | `true` |
| `5hr` threshold | 0.8 (80%) | 0.7 (70%) | 0.6 (60%) | 1.0 (100%) |
| `weekly` threshold | 0.6 (60%) | 0.5 (50%) | 0.4 (40%) | 1.0 (100%) |
| `budget_per_sprint` | -- | -- | -- | $5.00 |
| `requires` env var | -- | -- | -- | `ANTHROPIC_API_KEY` |
| `brain_planning` | `"auto"` | `"auto"` | `"auto"` | `"auto"` |

### max_plan -- Claude Max 20x

Full parallelism with up to 8 workers. Brain uses Opus for highest-quality planning. Workers default to Opus. Brain can downgrade individual tasks to Sonnet or Haiku.

Limits: Sprint planning pauses when 5-hour usage exceeds 80% or weekly usage exceeds 60%.

### max5x_plan -- Claude Max 5x

Good parallelism at 5 workers. Brain uses Sonnet to conserve budget. Workers can still use Opus for complex tasks.

Limits: Sprint planning pauses at 70% 5-hour usage or 50% weekly usage.

### pro_plan -- Claude Pro

Conservative mode with 3 workers maximum. Haiku is disabled because Pro plan usage limits are tight. Everything runs on Sonnet.

Limits: Sprint planning pauses at 60% 5-hour usage or 40% weekly usage.

### api -- API Key Mode

Highest parallelism at 10 workers. No usage percentage limits. Uses `budget_per_sprint` as a dollar cap instead. Requires `ANTHROPIC_API_KEY` environment variable.

---

## 5. PlanModeConfig Fields

Each mode block (`modes.<modeName>`) supports these fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `max_workers` | number (1-20) | Yes | Maximum parallel workers for this mode. |
| `brain_model` | `"opus"`, `"sonnet"`, or `"haiku"` | Yes | Model used by Brain for planning and evaluation. |
| `default_model` | `"opus"`, `"sonnet"`, or `"haiku"` | Yes | Default model assigned to workers. |
| `haiku_allowed` | boolean | Yes | Whether Brain can assign `haiku` to workers. |
| `usage_thresholds` | object | Yes | When to reduce or pause the sprint. |
| `usage_thresholds["5hr"]` | number (0-1) | Yes | 5-hour rolling window threshold. |
| `usage_thresholds.weekly` | number (0-1) | Yes | Weekly quota threshold. |
| `budget_per_sprint` | number > 0 | No (API mode only) | Maximum USD budget per sprint. |
| `requires` | string | No | Required environment variable name. |
| `brain_planning` | `BrainPlanningMode` | No | Planning mode override for this mode. |

### Field Details

**max_workers** -- Controls how many worker windows Brain can spawn in parallel. Brain may spawn fewer if there are fewer tasks or if dependencies constrain parallelism.

**brain_model** -- The model Brain uses for sprint planning, result evaluation, retrospectives, and memory updates.

**default_model** -- Fallback model for worker tasks when Brain's planner does not specify a different model. Brain can override per-task.

**haiku_allowed** -- When `false`, Brain will never assign `haiku` to any worker task. Set to `false` for Pro plan to conserve rate limits.

**budget_per_sprint** -- Only meaningful for `api` mode. Brain tracks estimated token cost and pauses execution if the budget would be exceeded. Value is in USD.

---

## 6. Brain Planning Modes

The `brain_planning` field controls how Brain generates task plans from DIRECTIVES.md.

### Mode Comparison

| Mode | Strategy | Fallback | Best For |
|------|----------|----------|----------|
| `"structured"` | Parse `## Task N:` blocks | None | Deterministic, predictable plans |
| `"ai"` | AI generates tasks (Zod-validated) | Fails if AI fails | Maximum flexibility |
| `"auto"` (default) | AI first, structured fallback | Always succeeds | Production use |

### structured -- Directive Block Parser

Brain calls `parseStructuredDirectives()` to extract tasks from DIRECTIVES.md. Tasks must use `## Task N:` section headers.

- Deterministic: same directives always produce the same tasks
- No AI call for planning: faster and uses zero tokens
- Requires well-formatted DIRECTIVES.md
- Fails if DIRECTIVES.md has no parseable task blocks

### ai -- AI Planner

Brain spawns `claude -p <prompt>` with the full context (directives, memory, retro, debt, patterns). The response is validated against a Zod schema.

- Flexible: AI can interpret ambiguous directives, infer scope, and select models
- Zod-validated: invalid AI responses are rejected
- Uses tokens for planning (typically around 2000 tokens with Opus)
- Fails hard if the AI response is invalid

### auto -- Hybrid (Recommended)

Brain tries AI first. If AI planning succeeds, the AI plan is used. If AI fails for any reason, Brain falls back to structured mode.

- Resilient: never fails due to AI issues alone
- Best of both worlds: prefers AI quality, guarantees a plan
- Default for all built-in plan modes

### Setting Per-Mode vs Global

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

This gives `max_plan` AI planning (higher quality) while `pro_plan` uses structured parsing (zero token cost).

---

## 7. Usage Thresholds

Usage thresholds control when Brain reduces sprint size or pauses execution.

```json
"usage_thresholds": {
  "5hr": 0.8,
  "weekly": 0.6
}
```

| Threshold | Key | Meaning |
|-----------|-----|---------|
| 5-hour rolling window | `"5hr"` | Fraction of 5-hour message quota used (0.0 to 1.0) |
| Weekly quota | `"weekly"` | Fraction of weekly message quota used (0.0 to 1.0) |

### Behavior When Thresholds Are Exceeded

Before sprint planning:
- `5hr` exceeded: sprint size is reduced (fewer workers, smaller tasks)
- `weekly` exceeded: minimal sprint (1-2 workers only)

During sprint execution:
- If a limit is hit mid-sprint, active tasks are paused
- The sprint waits for the limit to reset, then resumes
- Sprints are never abandoned

### Threshold Summary by Mode

| Mode | 5hr Pause Trigger | Weekly Pause Trigger |
|------|-------------------|---------------------|
| `max_plan` | > 80% | > 60% |
| `max5x_plan` | > 70% | > 50% |
| `pro_plan` | > 60% | > 40% |
| `api` | N/A (budget-based) | N/A (budget-based) |

---

## 8. Global vs Project Config

### Global Config

Located at `~/.deckent/config.json`. Applies to all projects on this machine. Use it for settings that rarely change, like your preferred plan mode and language.

```json
{
  "mode": "max_plan",
  "language": "en"
}
```

### Project Config

Located at `.deckent/config.json`. Applies to this project only. Use it for project-specific settings like worker count or planning mode.

```json
{
  "projectName": "my-api",
  "modes": {
    "max_plan": {
      "max_workers": 4,
      "brain_planning": "structured"
    }
  }
}
```

### Merge Behavior

Project config always takes priority. If the global config sets `language: "en"` and the project config sets `language: "tr"`, the resolved config uses `"tr"`.

Nested objects are merged recursively. Setting `modes.max_plan.max_workers: 4` in the project config only overrides that field; all other `max_plan` fields keep their global or default values.

---

## 9. Example Configs

### Minimal (Max 20x User)

```json
{
  "mode": "max_plan",
  "language": "en",
  "projectName": "my-app"
}
```

### Custom Worker Limits

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

### API Mode

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

### Pro Plan (Conservative)

```json
{
  "mode": "pro_plan",
  "language": "en",
  "projectName": "my-project",
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

### Multi-Mode (Switch Without Re-Editing)

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

Switch modes with: `deckent config set mode pro_plan`

---

## 10. CLI Config Commands

### Show Resolved Config

```bash
deckent config
```

Outputs the fully resolved config as JSON, including merged values from global + project config and runtime fields.

### Set a Value

```bash
deckent config set mode pro_plan
deckent config set language en
deckent config set projectName my-new-name
```

Values are written to `.deckent/config.json`. The value is parsed as JSON first (for booleans and numbers), then as a string.

### Switch Plan Mode

```bash
deckent config set mode max_plan
deckent config set mode max5x_plan
deckent config set mode pro_plan
deckent config set mode api
```

The mode switch takes effect on the next `deckent start` or `deckent plan`.

### Set Brain Planning Mode

```bash
deckent config set brain_planning auto
```

To set brain_planning per-mode, edit `.deckent/config.json` directly under `modes.<modeName>.brain_planning`.

### Global Config

```bash
deckent config --global           # Show global config
deckent config set --global mode max_plan   # Set a global value
deckent config export --global    # Export global config
```

---

## 11. Validation Rules

Deckent validates the config on every load. A `ConfigValidationError` is thrown with all validation failures listed.

| Field | Constraint |
|-------|-----------|
| `mode` | Must be one of: `max_plan`, `max5x_plan`, `pro_plan`, `api` |
| `language` | Must be one of: `en`, `tr` |
| `modes.<name>.max_workers` | Number between 1 and 20 (inclusive) |
| `modes.<name>.brain_model` | One of: `opus`, `sonnet`, `haiku` |
| `modes.<name>.default_model` | One of: `opus`, `sonnet`, `haiku` |
| `modes.<name>.haiku_allowed` | Must be a boolean |
| `modes.<name>.usage_thresholds["5hr"]` | Number between 0.0 and 1.0 |
| `modes.<name>.usage_thresholds.weekly` | Number between 0.0 and 1.0 |
| `modes.<name>.budget_per_sprint` | Positive number (API mode only) |
| `modes.<name>.brain_planning` | One of: `ai`, `structured`, `auto` |
| API mode + `ANTHROPIC_API_KEY` | Environment variable must be set when mode is `"api"` |

### Example Validation Error

```
ConfigValidationError: Config validation failed:
  - Invalid mode "turbo". Must be one of: max_plan, max5x_plan, pro_plan, api
  - modes.max_plan.max_workers must be a number between 1 and 20
  - modes.api.usage_thresholds.5hr must be a number between 0 and 1
```

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) -- System architecture overview
- [BRAIN-GUIDE.md](BRAIN-GUIDE.md) -- Brain planning internals
- [SPRINT-LIFECYCLE.md](SPRINT-LIFECYCLE.md) -- Sprint phases and flow
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) -- Common config issues
