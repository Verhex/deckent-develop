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
7. [Global vs Project Config](#7-global-vs-project-config)
8. [Example Configs](#8-example-configs)
9. [CLI Config Commands](#9-cli-config-commands)
10. [Validation Rules](#10-validation-rules)

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

The deep merge function recursively merges plain objects. Nested mode configs (for example, `modes.performance.max_workers`) can be overridden individually without replacing the entire mode block.

Source: `src/core/config.ts` -- `loadConfig()`

---

## 3. Top-Level Config Options

These fields sit at the root of `.deckent/config.json`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `PlanMode` | `"performance"` | Active plan mode. Determines model limits and worker count. Also accepts legacy aliases (see section 4.1). |
| `modes` | `Record<PlanMode, PlanModeConfig>` | (see section 4) | Per-mode configuration blocks. |
| `language` | `"en"` or `"tr"` | `"en"` | CLI output language. |
| `projectName` | `string` | `"deckent-project"` | Project name shown in dashboard and logs. |
| `version` | `string` | (from package.json) | Deckent version. Usually not set manually. |
| `brain_planning` | `BrainPlanningMode` | `"auto"` | Planning mode. Can also be set per-mode. |
| `brain_provider` | `ProviderName` | `"claude"` | Provider for Brain planning and evaluation. One of: `claude`, `codex`, `gemini`. |
| `worker_provider` | `ProviderName` | `"claude"` | Default provider for worker tasks. |
| `fallback_provider` | `ProviderName` | -- | Fallback provider when primary fails. |
| `last_sprint_id` | `string` | -- | Last sprint ID. Managed by Brain. Do not edit manually. |

### Minimal Valid Config

```json
{
  "mode": "performance",
  "language": "en",
  "projectName": "my-project"
}
```

When only top-level fields are specified, all `modes.*` values fall back to built-in defaults.

---

## 4. Plan Modes

Deckent ships with four built-in plan modes, each tuned for a different Claude subscription tier.

### Comparison Table

| Field | `performance` | `balanced` | `economic` | `api` |
|-------|-----------|-------------|-----------|-------|
| **Subscription** | Max 20x ($200/mo) | Max 5x ($100/mo) | Pro ($20/mo) | API key (pay-as-you-go) |
| `max_workers` | 8 | 5 | 3 | 10 |
| `brain_model` | `opus` | `sonnet` | `sonnet` | `opus` |
| `default_model` | `opus` | `opus` | `sonnet` | `sonnet` |
| `haiku_allowed` | `true` | `true` | `false` | `true` |
| `budget_per_sprint` | -- | -- | -- | $5.00 |
| `requires` env var | -- | -- | -- | `ANTHROPIC_API_KEY` |
| `brain_planning` | `"auto"` | `"auto"` | `"auto"` | `"auto"` |

### 4.1 Legacy Aliases

The following legacy aliases are still accepted for backward compatibility:

| Legacy Alias | Canonical Mode | Note |
|-------|---------------|------|
| `max_plan` | `performance` | legacy alias |
| `max5x_plan` | `balanced` | legacy alias |
| `pro_plan` | `economic` | legacy alias |
| `unlimited` | `api` | legacy alias |

Legacy aliases are resolved automatically in config files and CLI flags:

```bash
deckent config set mode performance   # Canonical name
deckent config set mode max_plan      # Legacy alias — also works, resolves to performance
```

### performance -- Claude Max 20x

Full parallelism with up to 8 workers. Brain uses Opus for highest-quality planning. Workers default to Opus. Brain can downgrade individual tasks to Sonnet or Haiku.

### balanced -- Claude Max 5x

Good parallelism at 5 workers. Brain uses Sonnet to conserve budget. Workers can still use Opus for complex tasks.

### economic -- Claude Pro

Conservative mode with 3 workers maximum. Haiku is disabled because Pro plan usage limits are tight. Everything runs on Sonnet.

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
| `budget_per_sprint` | number > 0 | No (API mode only) | Maximum USD budget per sprint. |
| `requires` | string | No | Required environment variable name. |
| `brain_planning` | `BrainPlanningMode` | No | Planning mode override for this mode. |

### Field Details

**max_workers** -- Controls how many worker windows Brain can spawn in parallel. Brain may spawn fewer if there are fewer tasks or if dependencies constrain parallelism.

**brain_model** -- The model Brain uses for sprint planning, result evaluation, retrospectives, and memory updates.

**default_model** -- Fallback model for worker tasks when Brain's planner does not specify a different model. Brain can override per-task.

**haiku_allowed** -- When `false`, Brain will never assign `haiku` to any worker task. Set to `false` for `economic` mode to conserve rate limits.

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
  "mode": "performance",
  "modes": {
    "performance": {
      "brain_planning": "ai"
    },
    "economic": {
      "brain_planning": "structured"
    }
  }
}
```

This gives `performance` AI planning (higher quality) while `economic` uses structured parsing (zero token cost).

---

## 7. Global vs Project Config

### Global Config

Located at `~/.deckent/config.json`. Applies to all projects on this machine. Use it for settings that rarely change, like your preferred plan mode and language.

```json
{
  "mode": "performance",
  "language": "en"
}
```

### Project Config

Located at `.deckent/config.json`. Applies to this project only. Use it for project-specific settings like worker count or planning mode.

```json
{
  "projectName": "my-api",
  "modes": {
    "performance": {
      "max_workers": 4,
      "brain_planning": "structured"
    }
  }
}
```

### Merge Behavior

Project config always takes priority. If the global config sets `language: "en"` and the project config sets `language: "tr"`, the resolved config uses `"tr"`.

Nested objects are merged recursively. Setting `modes.performance.max_workers: 4` in the project config only overrides that field; all other `performance` fields keep their global or default values.

---

## 8. Example Configs

### Minimal (Max 20x User)

```json
{
  "mode": "performance",
  "language": "en",
  "projectName": "my-app"
}
```

### Custom Worker Limits

```json
{
  "mode": "performance",
  "projectName": "my-app",
  "modes": {
    "performance": {
      "max_workers": 4,
      "brain_model": "opus",
      "default_model": "sonnet",
      "haiku_allowed": true,
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
      "budget_per_sprint": 3.00,
      "requires": "ANTHROPIC_API_KEY",
      "brain_planning": "ai"
    }
  }
}
```

### Economic (Conservative)

```json
{
  "mode": "economic",
  "language": "en",
  "projectName": "my-project",
  "modes": {
    "economic": {
      "max_workers": 3,
      "brain_model": "sonnet",
      "default_model": "sonnet",
      "haiku_allowed": false,
      "brain_planning": "structured"
    }
  }
}
```

### Multi-Mode (Switch Without Re-Editing)

```json
{
  "mode": "performance",
  "language": "en",
  "projectName": "my-project",
  "modes": {
    "performance": {
      "max_workers": 8,
      "brain_model": "opus",
      "default_model": "opus",
      "haiku_allowed": true,
      "brain_planning": "ai"
    },
    "balanced": {
      "max_workers": 5,
      "brain_model": "sonnet",
      "default_model": "sonnet",
      "haiku_allowed": true,
      "brain_planning": "auto"
    },
    "economic": {
      "max_workers": 2,
      "brain_model": "sonnet",
      "default_model": "sonnet",
      "haiku_allowed": false,
      "brain_planning": "structured"
    },
    "api": {
      "max_workers": 10,
      "brain_model": "opus",
      "default_model": "sonnet",
      "haiku_allowed": true,
      "budget_per_sprint": 5.0,
      "requires": "ANTHROPIC_API_KEY",
      "brain_planning": "ai"
    }
  }
}
```

Switch modes with: `deckent config set mode economic`

---

## 9. CLI Config Commands

### Show Resolved Config

```bash
deckent config
```

Outputs the fully resolved config as JSON, including merged values from global + project config and runtime fields.

### Set a Value

```bash
deckent config set mode economic
deckent config set language en
deckent config set projectName my-new-name
```

Values are written to `.deckent/config.json`. The value is parsed as JSON first (for booleans and numbers), then as a string.

### Switch Plan Mode

```bash
deckent config set mode performance
deckent config set mode balanced
deckent config set mode economic
deckent config set mode api
```

The mode switch takes effect on the next `deckent start` or `deckent plan`.

### Set Brain Planning Mode

```bash
deckent config set brain_planning auto
```

To set brain_planning per-mode, edit `.deckent/config.json` directly under `modes.<modeName>.brain_planning` (e.g. `modes.performance.brain_planning`).

### Global Config

```bash
deckent config --global           # Show global config
deckent config set --global mode performance   # Set a global value
deckent config export --global    # Export global config
```

---

## 10. Validation Rules

Deckent validates the config on every load. A `ConfigValidationError` is thrown with all validation failures listed.

| Field | Constraint |
|-------|-----------|
| `mode` | Must be one of: `performance`, `balanced`, `economic`, `api` (legacy aliases `max_plan`, `max5x_plan`, `pro_plan` also accepted) |
| `language` | Must be one of: `en`, `tr` |
| `modes.<name>.max_workers` | Number between 1 and 20 (inclusive) |
| `modes.<name>.brain_model` | One of: `opus`, `sonnet`, `haiku` |
| `modes.<name>.default_model` | One of: `opus`, `sonnet`, `haiku` |
| `modes.<name>.haiku_allowed` | Must be a boolean |
| `modes.<name>.budget_per_sprint` | Positive number (API mode only) |
| `modes.<name>.brain_planning` | One of: `ai`, `structured`, `auto` |
| `brain_provider` | One of: `claude`, `codex`, `gemini` (if set) |
| `worker_provider` | One of: `claude`, `codex`, `gemini` (if set) |
| `fallback_provider` | One of: `claude`, `codex`, `gemini` (if set) |
| API mode + `ANTHROPIC_API_KEY` | Environment variable must be set when mode is `"api"` |

### Example Validation Error

```
ConfigValidationError: Config validation failed:
  - Invalid mode "turbo". Must be one of: performance, balanced, economic, api
  - modes.performance.max_workers must be a number between 1 and 20
```

---

## 11. Multi-Provider Configuration

Deckent supports three AI providers. Configure them at the top level of your config:

### Provider Names

| Provider | Description | Prerequisite |
|----------|-------------|-------------|
| `claude` | Claude via Claude Code CLI (default) | `claude --version` |
| `codex` | OpenAI Codex via Codex CLI | `codex --version` + `OPENAI_API_KEY` |
| `gemini` | Google Gemini via API | `GOOGLE_API_KEY` env var |

### Provider Config Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `brain_provider` | `ProviderName` | `"claude"` | Provider used by Brain for planning and evaluation |
| `worker_provider` | `ProviderName` | `"claude"` | Default provider for worker tasks |
| `fallback_provider` | `ProviderName` | -- | Fallback when primary provider fails |

### Model Equivalence

When switching providers, models are mapped to equivalent tiers:

| Tier | Claude | Codex | Gemini |
|------|--------|-------|--------|
| Premium | `opus` | `gpt-5` | `gemini-2.5-pro` |
| Standard | `sonnet` | `gpt-4.1` | `gemini-2.5-flash` |
| Economy | `haiku` | `gpt-5-mini` | `gemini-2.0-flash` |

### Example: Mixed Provider Config

```json
{
  "mode": "performance",
  "brain_provider": "claude",
  "worker_provider": "codex",
  "fallback_provider": "gemini"
}
```

### Environment Variables

Provider selection can also be overridden via environment variables:

```bash
DECKENT_BRAIN_PROVIDER=claude
DECKENT_WORKER_PROVIDER=codex
DECKENT_FALLBACK_PROVIDER=gemini
```

See the [Multi-Provider Guide](./multi-provider.md) for the full multi-provider setup guide.

---

## Rollback & Safety Point

Deckent creates a git backup branch before each sprint starts. If all tasks fail (NO_GO), it can automatically roll back to the pre-sprint state.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `rollback_policy` | `'auto' \| 'ask' \| 'never'` | `'never'` | When to trigger rollback. `auto` = roll back if all tasks NO_GO. `ask` = prompt user. `never` = disable. |

### How It Works

1. **PLAN phase**: `createSafetyPoint()` creates a `deckent-backup-<sprintId>` git branch at current HEAD
2. If the working tree is dirty, changes are stashed first, then restored after branch creation
3. The safety point metadata is persisted to `.deckent/safety-point.json`
4. **After sprint**: `deleteSafetyPoint()` removes both the backup branch AND the JSON file

### Safety Guards

- **No git repo**: If the project is not a git repository, rollback is visibly disabled with a console warning. It does NOT silently fail.
- **Stash pop failure**: If stashing uncommitted changes succeeds but restoring them fails, the sprint is **aborted** with recovery instructions (`git stash list` + `git stash pop`). This prevents user data loss.
- **Orphan cleanup**: At the start of each sprint, stale safety-point files from previous incomplete sprints are automatically cleaned up.

### Error Codes

| Code | Description |
|------|-------------|
| `DECKENT_E050` | Failed to stash changes before creating safety point |
| `DECKENT_E051` | Failed to get current commit SHA (not a git repo or no commits) |
| `DECKENT_E052` | Failed to create safety backup branch |
| `DECKENT_E056` | Not a git repository — rollback disabled |
| `DECKENT_E057` | Stash pop failed — uncommitted changes trapped in stash |

### Disabling Rollback

```bash
deckent config set rollback_policy never
```

Source: `src/orchestra/rollback.ts`, `src/orchestra/sprint-phases.ts`

---

## Related Documentation

- [Core Concepts](../guide/concepts.md) — Sprint, Task, Agent, Brain, Auditor overview
- [Multi-Provider Guide](./multi-provider.md) — Multi-provider setup and usage
- [API Reference](./api.md) — Programmatic API and HTTP endpoints
- [MCP Guide](./mcp-guide.md) — MCP tools and resources
- [FAQ](../guide/faq.md) — Common questions and troubleshooting
