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
| `brain_provider` | `ProviderName` | `"claude"` | Provider for Brain planning and evaluation. One of: `claude`, `codex`, `gemini`, `ollama`. Canonical form is the grouped `providers: { brain, worker }`; these flat keys are the deprecated alias. |
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
| `max_workers` | number (1-100) or `"auto"` | Yes | Maximum parallel workers for this mode. Values >= 20 emit a high-contention warning (not an error). `"auto"` resolves to `systemProfile.recommendedMaxWorkers`. |
| `brain_model` | any model in the registry | Yes | Model used by Brain for planning and evaluation. Validated against `ALL_MODELS` (13 models across Claude/Codex/Gemini), not just the three Claude names. |
| `default_model` | any model in the registry | Yes | Default model assigned to workers. Validated against `ALL_MODELS`. |
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
| `modes.<name>.max_workers` | Number between 1 and 100 (inclusive) or `"auto"`; >= 20 warns |
| `modes.<name>.brain_model` | Any model in `ALL_MODELS` (13-model registry) |
| `modes.<name>.default_model` | Any model in `ALL_MODELS` (13-model registry) |
| `modes.<name>.haiku_allowed` | Must be a boolean (deprecated; `false` maps to `min_tier: standard`) |
| `modes.<name>.budget_per_sprint` | Positive number (API mode only) |
| `modes.<name>.brain_planning` | One of: `ai`, `structured`, `auto` |
| `brain_provider` | One of: `claude`, `codex`, `gemini`, `ollama` (if set) |
| `worker_provider` | One of: `claude`, `codex`, `gemini`, `ollama` (if set) |
| `fallback_provider` | One of: `claude`, `codex`, `gemini`, `ollama` (if set) |
| API mode + `ANTHROPIC_API_KEY` | Environment variable must be set when mode is `"api"` |

### Example Validation Error

```
ConfigValidationError: Config validation failed:
  - Invalid mode "turbo". Must be one of: performance, balanced, economic, api
  - modes.performance.max_workers must be a number between 1 and 100 (or "auto")
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
| `ollama` | Local LLM via Ollama (Sprint 190) | local Ollama runtime |

> The grouped form `providers: { brain, worker }` is the canonical layout (Sprint 150). The flat `brain_provider` / `worker_provider` / `fallback_provider` keys are still accepted as a deprecated alias.

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
| `rollback_policy` | `'never' \| 'on_failure' \| 'always'` | `'never'` | When to trigger rollback. `never` = disable (default). `on_failure` = revert when a task evaluation fails. `always` = revert regardless of outcome. Validated against this enum in `validateConfig` (config.ts:548). |

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

## 12. Spawn Backend & Worker Resources

How workers are launched and their resource limits.

| Key | Default (code) | Values | Description |
|-----|----------------|--------|-------------|
| `spawn_backend` | `"docker"` (config.ts:769, ADR-027) | `docker \| tmux \| subprocess \| auto` | Worker spawn mechanism. Also selects the timeout min/max band (see section 17). `tmux` is deprecated (spawn-backend.ts:263). |
| `deckent_style` | `"sprint"` (config.ts:868) | `sprint \| task` | Runtime style. `sprint` = multi-task orchestration; `task` = one-shot assistant mode (task-mode-runner.ts:25). |
| `worker_memory_limit` | `"2g"` (raw — not on `DeckentConfig` type) | e.g. `"2g"`, `"512m"` | Docker `--memory` cgroup limit per worker (spawn-backend-docker.ts:490). |
| `worker_memory_swap` | `"3g"` (raw) | e.g. `"3g"` | Docker `--memory-swap` limit per worker (spawn-backend-docker.ts:491). |
| `worker_memory_limit_by_kind` | undefined (optional) | object with kind→memory mappings | Per-task-kind memory limit override (Sprint 272, F1-LIM). Keys are canonical `TaskKind` values (e.g., `"code"`, `"doc"`). Values are memory strings (e.g., `"1.5g"`, `"768m"`). When set, overrides global `worker_memory_limit` for matching kinds. Swap is derived as `memory × 1.5`. Falls back to global `worker_memory_limit` for unmatched kinds. Validation: memory strings must parse successfully (same as `worker_memory_limit`). |

> `worker_memory_limit` / `worker_memory_swap` / `worker_memory_limit_by_kind` are Docker-backend-only extensions read directly from raw config (and surfaced by `deckent doctor`); they are not part of the typed `DeckentConfig`.

---

## 12.1. Cache Warm Configuration

Optional configuration block for F1-TOK Faz 2 (Sprint 274): warmup strategy to optimize shared prompt-prefix caching when spawning a fleet of workers.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `cache_warm.enabled` | boolean | `false` | Master on/off switch. When `false`, no cache-warm behavior. |
| `cache_warm.warm_delay_ms` | number | `45000` | Delay (milliseconds) before spawning non-warmer workers in the first wave. Range: 5000–180000 (5s–3m). Allows the first worker to write the shared prompt-prefix to cache before the fleet starts. |

### Behavior

- **Disabled (default):** `cache_warm.enabled: false` — zero behavioral change, all workers spawn immediately.
- **Enabled:** First dispatch-eligible task in the sprint's first SPAWN wave launches immediately. Remaining tasks delay by `warm_delay_ms`, allowing the first worker's cache-write to finish before followers read.
- **Single-task sprints:** No delay (only one task).
- **Fail-safe:** If `warm_delay_ms` timer fails, normal spawn flow resumes without retrying.

### Example Config

```json
{
  "cache_warm": {
    "enabled": true,
    "warm_delay_ms": 45000
  }
}
```

---

## 13. Tier-Based Model Strategy (`model_strategy`)

Replaces hard-coded model names with provider-agnostic tiers. Starts from the mode preset (`mode-presets.ts`), then `config.model_strategy` overlays on top (config.ts:1051-1066). A custom mode falls back to the `balanced` preset.

| Field | Values | Description |
|-------|--------|-------------|
| `brain_tier` | `premium_plus \| premium \| standard \| economy` | Tier for the Brain orchestrator. |
| `worker_tier` | same | Default tier for worker tasks. |
| `min_tier` | same | Floor — tasks cannot resolve below this tier. |
| `max_tier` | same | Ceiling — tasks cannot resolve above this tier. |
| `auto_upgrade` | boolean | Upgrade tier for high-complexity tasks. |
| `auto_downgrade` | boolean | Downgrade tier for doc/test tasks. |

Tier equivalence (DECKENT.md model registry): `premium` = opus / gpt-5 / gemini-2.5-pro; `standard` = sonnet / gpt-4.1 / gemini-2.5-flash; `economy` = haiku / gpt-5-mini / gemini-2.0-flash; `premium_plus` = o3 / gemini-3.1-pro-preview.

---

## 14. Auth Mode

| Key | Default | Values | Description |
|-----|---------|--------|-------------|
| `auth_mode` | `"subscription"` (config.ts:770) | `subscription \| api \| hybrid` | `subscription` = Claude.ai session mount; `api` = uses `ANTHROPIC_API_KEY`; `hybrid` = both (`.deck` keys take precedence). Resolved by `readAuthMode()` (config.ts:1208), consumed in provider.ts:728. A per-task `- Auth:` directive overrides this. |

### 14.1 HTTP API OIDC Bearer (`api_oidc`)

Optional top-level block (config-types.ts:231) that extends the HTTP API bearer middleware with OIDC JWT verification (Sprint 267). **Default-off**: when the block is absent, behavior is unchanged — only the static token (`api_auth_token` or the `DECKENT_API_TOKEN` env var) is checked. There are no built-in defaults for this block.

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| `api_oidc.enabled` | boolean | yes | Master switch — the block is inert unless `true`. |
| `api_oidc.issuer` | string | when enabled | Expected `iss` claim; tokens from any other issuer are rejected. Must be non-empty when `enabled: true`. |
| `api_oidc.audience` | string | no | Expected `aud` claim. When set, tokens without a matching `aud` are rejected. |
| `api_oidc.algorithm` | `HS256 \| RS256` | when enabled | Pinned signature algorithm. Tokens signed with any other `alg` are rejected; key material is routed only to the slot matching this value (HS256 secret vs RS256 public key), so algorithm-confusion attacks cannot cross key material. |
| `api_oidc.key` | string | when enabled | HS256 shared secret or RS256 PEM public key. Must be non-empty when `enabled: true`. Supports `$DECK:KEY` references — the block passes through deck-interpolation on load (server.ts:1049). |

```json
{
  "api_oidc": {
    "enabled": true,
    "issuer": "https://idp.example.com",
    "audience": "deckent-api",
    "algorithm": "RS256",
    "key": "$DECK:OIDC_PUBLIC_KEY"
  }
}
```

**Validation** (config.ts:848-871, exact strings; the `key` value is never echoed into an error message — secret-leak guard):

- `api_oidc.enabled must be a boolean`
- `Invalid value '<value>' for field 'api_oidc.algorithm'. Valid: HS256, RS256`
- `api_oidc.audience must be a string`
- `api_oidc.issuer must be a non-empty string when api_oidc.enabled is true`
- `api_oidc.key must be a non-empty string when api_oidc.enabled is true`
- `api_oidc.algorithm is required when api_oidc.enabled is true. Valid: HS256, RS256`

**Behavior with the static token** (src/api/auth.ts — JWT verification delegates to `verifyJwt` in src/core/auth-oidc.ts):

- A Bearer value is checked against the static token **first** (constant-time SHA-256 compare, bit-identical to the pre-267 path); only on mismatch is it verified as a JWT. The static token keeps working in an OIDC-enabled config.
- **OIDC-only mode**: configuring `api_oidc` with **no** static token *activates* auth — a valid Bearer JWT becomes mandatory for non-exempt requests (missing/malformed header → 401, failed verification → 403). The "auth disabled" path applies only when *neither* mechanism is configured.
- If both checks fail → 403 Forbidden (unchanged). Responses stay generic — no claim or key material leaks into the body.
- Exempt-path (`/health`, `/api/health`), query-token (`/api/events` SSE) and localhost-auto-inject semantics are unchanged; the query-token fallback applies to the static token only.

**Server resolution** (server.ts:1035-1065): an explicit `oidc` option passed to `createHttpServer` wins; otherwise the project config's `api_oidc` block is consulted — and used only when `enabled: true` with a complete `issuer`/`algorithm`/`key`. A block that is missing, disabled, incomplete, or unparseable fails closed to the previous middleware behavior.

### 14.2 Terminal OIDC JWT (`terminal_oidc_jwks`)

Optional top-level block (config-types.ts) that enables async JWKS-backed RS256 JWT verification for the embedded terminal (Sprint 268). **Default-off**: when the block is absent, behavior is unchanged — the terminal uses a local random token. There are no built-in defaults for this block.

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| `terminal_oidc_jwks.issuer` | string | when present | Expected `iss` claim in the JWT. Must be non-empty when the block is present. |
| `terminal_oidc_jwks.jwksUrl` | string | when present | HTTPS URL of the IdP's JWKS document (RFC 7517 §5). Must be non-empty and HTTPS-only. When set, terminal bearer tokens are resolved via this endpoint. |
| `terminal_oidc_jwks.audience` | string | no | Expected `aud` claim. When set, tokens without a matching `aud` are rejected. |

**Validation (server.ts:1237-1249):**
- Both `issuer` and `jwksUrl` must be non-empty strings to activate OIDC verification
- If the block is present but incomplete (either field missing or empty), a warning is logged and the terminal falls back to local-token auth
- `jwksUrl` MUST use `https://` — key material is never fetched over plaintext (auth-jwks.ts enforces this)

**Behavior:**
- When OIDC is disabled (block absent or malformed): terminal mints a local random token and serves it to authenticated callers
- When OIDC is enabled: terminal mints a local token (for fallback) but uses JwksAuthProvider to verify incoming Bearer tokens against the JWKS endpoint — only IdP-issued tokens are accepted
- Verification fails closed: malformed tokens or JWKS resolution errors → 401 Unauthorized; no claim or key material leaks into the response

**Example:**
```json
{
  "terminal_oidc_jwks": {
    "issuer": "https://idp.example.com",
    "jwksUrl": "https://idp.example.com/.well-known/jwks.json",
    "audience": "deckent-terminal"
  }
}
```

**Difference from `api_oidc`:**
- `api_oidc` (section 14.1) guards the REST API (`/api/*`) and supports both HS256 (shared secret) and RS256 (public key)
- `terminal_oidc_jwks` (this section) guards the embedded terminal (`/api/terminal/*`) and uses RS256-only (JWKS endpoint); HS256 is not supported for terminal auth

---

## 15. Sprint Lifecycle & Evaluation

| Key | Default (code) | Values | Description |
|-----|----------------|--------|-------------|
| `fix_phase_enabled` | `true` (774) | boolean | Enables the FIX phase (retry failed tasks). |
| `max_fix_retries` | `2` (775) | 0–10 (validate 540) | Max retries per task in FIX. |
| `human_checkpoints` | `[]` (772) | array of `plan` / `evaluate` / `fix` | Pauses the sprint for manual approval at each listed gate (sprint-controller.ts ~595/680/885). Empty = fully autonomous. |
| `coverage_threshold` | `90` (777, **deprecated**) | number | Legacy single gate; now seeds `coverage_aspirational` via `resolveCoverageGates` (config.ts:707-719). |
| `coverage_hard_floor` | `50` (783) | 0–100 | Immutable EVALUATE floor. Clamped to `min(floor, aspirational)`. ADR-070. |
| `coverage_aspirational` | `90` (784) | 0–100 | Target coverage; tuned by the finalizer when `adaptive_thresholds: true`. |
| `max_reroutes` | `3` (785) | number | Max reroutes per task (mid-sprint-adapter.ts:46). |
| `reroute_on_tech_debt` | `false` (786) | boolean | `true` also reroutes GO_WITH_TECH_DEBT tasks (mid-sprint-adapter.ts:47). |
| `sprint_timeout_minutes` | `0` (787) | >= 0, **0 = unlimited** | Global sprint timeout (config.ts:1137). |
| `routing_engine` | `"v2"` (828) | `v1 \| v2` (validate 652) | Task routing engine. v1 = keyword (legacy/FIX fallback); v2 = intent-based (sprint-planner.ts:351). |
| `cleanup_delay_ms` | `180000` (830) | >= 0 ms | Delay before `.tasks/` files are deleted in CLEANUP. |
| `rubric_max_retries` | `0` (822) | >= 0 | Rubric evaluation retries; 0 = disabled. |
| `adaptive_thresholds` | `false` (824) | boolean | Auto-tunes `agent_min_score` + `coverage_aspirational` (sprint-finalizer.ts:1103). |
| `agent_min_score` | `5` (825) | 1–10 | Minimum agent routing score (sprint-planner.ts:480). |
| `adaptive_config` | `{min_samples:3, no_go_threshold:0.3, coverage_lookback:3}` (826) | object | Adaptive-tuning parameters (sprint-finalizer.ts:434). Inert while `adaptive_thresholds: false`. |
| `dependency_pipeline_enabled` | `true` (844, ADR-045) | boolean | Wave-based spawning + cascade-on-NO_GO + unblock-on-DONE (sprint-spawner.ts:322/410). |
| `sprint_checkpoint_interval` | `5` (846) | > 0 | Terminal tasks to complete before writing a resume checkpoint (sprint-spawner.ts:579). |
| `token_throttle_ms` | `500` (850) | >= 0 ms | Pre-spawn pacing floor to avoid token bursts (Sprint 202, sprint-spawner.ts:46). 0 = disabled. |

> **Coverage gate resolution:** `resolveCoverageGates` computes `aspirational = coverage_aspirational ?? coverage_threshold ?? 90`, `hard_floor = min(coverage_hard_floor ?? 50, aspirational)`, and mirrors `coverage_threshold = aspirational` for back-compat (config.ts:707-719).

---

## 16. Auditor, Locks & Memory

| Key | Default | Values | Description |
|-----|---------|--------|-------------|
| `scan_interval` | `30` (794) | 5–600 s (validate 513) | Auditor scan-loop interval. |
| `heartbeat_timeout` | `120` (795) | 30–600 s (validate 519) | Worker stale threshold (no heartbeat). |
| `boundary_enforcement` | `true` (796) | boolean (validate 531) | Scope boundary checks via git diff. ADR-037 — advisory/soft (warns/emits, does not block). |
| `lock_stale_threshold` | `300` (797) | 30–3600 s (validate 525) | Lock-file abandonment threshold. |
| `memory_budget` | `5000` (789) | 100–10000 (validate 492) | Max total lines across `.brain/` (sprint-finalizer.ts:305). |
| `decay_after_sprints` | `20` (790) | 1–100 (validate 498) | Decay memory entries older than N sprints. |
| `patterns_enabled` | `true` (791) | boolean (validate 504) | Record violation/quality patterns at sprint end. |
| `project_identity_enabled` | `true` (792) | boolean (validate 508) | Update IDENTITY (DB decay-exempt). |

---

## 17. Timeout Configuration (`timeout`)

Consumer: `timeout-estimator.ts:94-157`. Estimate chain:

```
base = effort_base[effort]
estimated = base × locMultiplier × scopeMultiplier × historyFactor × backendFactor
final = clamp(estimated, <backend>_min_timeout, <backend>_max_timeout)
```

The clamp always wins — scaling factors can never push the final value outside the backend-specific band.

| Key | Default | Constraint (validate) | Description |
|-----|---------|------------------------|-------------|
| `docker_min_timeout` / `docker_max_timeout` | `3600` / `14400` | min >= 300, max <= 86400, max > min (config.ts:567-591) | Docker task timeout band (seconds). |
| `tmux_min_timeout` / `tmux_max_timeout` | `900` / `5400` | same | Tmux band. |
| `subprocess_min_timeout` / `subprocess_max_timeout` | `1800` / `10800` | same | Subprocess band. |
| `effort_base.{low,normal,high}` | `1800` / `3600` / `7200` | high > normal > low (config.ts:562) | Base seconds per effort level. |
| `loc_scaling_enabled` | `true` | boolean | Scale by lines-of-code estimate. |
| `history_scaling_enabled` | `true` | boolean | Scale by historical sprint timing. |
| `runtime_extension_enabled` | `true` | boolean | Allow heartbeat-aware runtime extensions. |
| `adaptive_multiplier` (optional) | `1.5` (config.ts:88) | >= 1.0, finite (validate 597) | Base timeout multiplier (sprint-controller.ts:278). |
| `runtime_extension_max` (optional) | `5` (config.ts:89) | >= 1, integer (validate 605) | Max runtime extensions per task. |

---

## 18. Search, Notifications, Telemetry & Output

| Key | Default | Values | Description |
|-----|---------|--------|-------------|
| `search_enabled` | `true` (801) | boolean | Online documentation search. |
| `search_provider` | `"context7"` (802) | `context7 \| web \| none` (config-types:171) | Search backend. |
| `search_cache_ttl` | `3600` (803) | >= 0 s | Search result cache TTL. |
| `notify_on_complete` | `false` (805) | boolean | Emit a notification on sprint finalize (notify.ts:47). |
| `notify_channel` | `null` (806) | `slack \| discord \| email \| webhook \| null` (config-types:179) | Delivery channel. |
| `notify_url` | `null` (807) | URL or null | Webhook URL (required for `webhook` channel). |
| `telemetry_enabled` | `false` (809) | boolean | Opt-in telemetry collection (telemetry.ts:15). |
| `telemetry_anonymous` | `true` (810) | boolean | Strip PII from telemetry events. |
| `detected_env` | `null` (812) | `vscode \| codex \| gemini \| cursor \| tmux \| shell \| null` (config-types:191) | Auto-detected environment. |
| `multi_ide_mode` | `false` (813) | boolean | Support multiple simultaneous IDE instances. |
| `output_splash` | `true` (815) | boolean | Kraken ASCII splash on init/version. |
| `output_mode` | `"normal"` (816) | `quiet \| normal \| verbose` (config-types:147) | Output verbosity. |
| `output_theme` | `"default"` (817) | `default \| minimal \| rich` (config-types:149) | Visual theme. |

---

## 19. Nervous System (`nervous_system`)

Proactive meta-orchestrator (ADR-040).

> **Master switch:** when `enabled: false`, `initNervousSystemForSprint()` returns `null` (sprint-controller.ts:499) and **every sub-setting below is inert.**

| Key | Default (code) | Values | Description |
|-----|----------------|--------|-------------|
| `enabled` | `false` (875) | boolean | Master on/off switch. |
| `mode` | `"balanced"` (876) | `strict \| balanced \| autopilot \| full-auto` (validate 618) | Authority/autonomy mode. |
| `actionOverrides` | `{}` (877) | object | Per-action policy overrides. |
| `safety_floor.locked_actions` | 5 actions (879) | KILL_LIVE_SPRINT, MANUAL_FILE_DELETE, COST_OVER_THRESHOLD, DESTRUCTIVE_GIT, ADR_DEPRECATE_ACCEPTED | Actions that always require manual approval, even in full-auto. |
| `safety_floor.cost_threshold_usd` | `110` (886) | >= 0 | COST_OVER_THRESHOLD trigger ($). |
| `safety_floor.bypass_allowed` | `false` (887) | boolean | Safety-floor bypass (code-locked to false). |
| `notifications.channels.{mcp,cli,file,desktop}` | `true,true,true,false` (890) | boolean | Per-channel enable. |
| `notifications.throttle_ms` | `300000` (891) | >= 0 ms | Min interval between same-group notifications. |
| `notifications.group_info_window_ms` | `600000` (892) | >= 0 ms | Info-grouping window. |
| `notifications.severity_min` | `"info"` (893) | `info \| warning \| critical \| emergency` (config-types:371) | Minimum surfaced severity. |
| `notifications.quiet_hours.{start,end,timezone}` | `22:00` / `08:00` / `TRT` (894) | `"HH:MM"` / tz | Quiet hours. |
| `notifications.cross_channel_dedup` | `true` (895) | boolean | Deduplicate by ID across channels. |
| `history_retention_days` | `30` (918) | >= 1 (validate 639) | History JSONL retention (days). |

### Detector defaults (code)

| Detector | Default `enabled` | Threshold key | Note |
|----------|-------------------|---------------|------|
| `stale_worker` | `true` (898) | `threshold_ms` | StaleWorkerDetector. |
| `scope_collision` | `true` (899) | — | File scope overlap. |
| `debt_trend` | `true` (900) | `threshold_rate` (0–1) | Rising tech debt. |
| `agent_routing` | `true` (901) | `anomaly_threshold` (0–1) | Routing anomaly. |
| `directives_protection` | `true` (902) | `auto_restore` | DIRECTIVES.md protect + restore. |
| `dead_event_stream` | `false` (904) | `threshold_ms` | Event-stream death. |
| `cost_threshold`, `prompt_quality`, `worker_output_variance`, `self_modifying_warner` | `false` (905-908) | `reserve_for: sprint-148` | Reserved. |
| `task_mode_idle`, `build_failure_recurrence`, `token_spike`, `agent_routing_anomaly`, `scope_collision_rate`, `notification_delivery_health` | `false` (911-916) | — | Sprint 180 W0 reserve (Phase 2/3). |

> Detector enable flags only matter when `nervous_system.enabled: true`. A project config may set these opposite to the code defaults; the resolved file value wins.

---

## 20. Observability, Retention & Terminal

| Key | Default (code) | Values | Description |
|-----|----------------|--------|-------------|
| `observability.rotation.maxSizeMB` | `1` (856) | number | metrics.jsonl rotation threshold (observability-rotation.ts:111). |
| `observability.rotation.archiveFormat` | `"gzip"` (857) | `gzip` (config-types:325) | Archive format. |
| `observability.rotation.keepLastN` | `10` (858) | number | Archives to retain. |
| `sprint_file_retention.keep_last_n` | `10` (863) | number | Sprints kept in the project root (sprint-file-retention.ts:255). |
| `sprint_file_retention.size_cap_mb` | `500` (864) | number | Total sprint-file size cap. |
| `sprint_file_retention.archive_path` | `".deckent/archive/sprints/"` (865) | path | Archive directory. |
| `terminal.enabled` | `true` | boolean | Embedded web terminal (ADR-062). |
| `terminal.bind` | `"127.0.0.1"` | IP | WS bind address (localhost = safe default). |
| `terminal.maxSessions` | `10` | number | Max concurrent PTY sessions. |
| `terminal.idleTimeoutMs` | `1800000` | ms | Idle timeout for shell/ai kinds (deckent kind exempt). |
| `terminal.scrollbackBytes` | `262144` | bytes | Per-session scrollback ring buffer (256 KB). |
| `terminal.allowShellKind` | `true` | boolean | Allow plain `shell` sessions; if false, only `ai`/`deckent`. |

---

## 21. Prompt Tuning

| Key | Default | Values | Description |
|-----|---------|--------|-------------|
| `prompt.adr_min_relevance` | `0.3` | 0.0–1.0 (validate 658) | ADR relevance filter for worker prompts (Sprint 182); ADRs scoring below the threshold are dropped (prompt-god-template). |
| `prompt.adr_render` | `"full"` | `"full"` \| `"operative"` (Sprint 273, Task 273-012) | ADR rendering mode for worker prompts. `"full"` = include complete ADR text. `"operative"` = include only marked operative sections (bounded by `<!-- worker-operative-start -->` / `<!-- worker-operative-end -->` HTML comments). Default `"full"` for backward compatibility. |

---

## 22. Autonomous Engine (`autonomous`)

Autonomous execution engine (ADR-040). **Every flag below is default-off** — the engine and each sub-block are opt-in.

> **Master switch:** when `enabled: false`, the engine refuses to start (autonomous.ts:215) and every sub-block below is inert. The `reactive`, `work_generator` and `rbac_policy` sub-blocks additionally carry their own `enabled` flag.

| Key | Default (code) | Values | Description |
|-----|----------------|--------|-------------|
| `enabled` | `false` (1053) | boolean (validate 773) | Master on/off switch (flag-gated, ADR-040). |
| `interval_ms` | `5000` (1054) | >= 0 ms (validate 776) | Idle-tick interval of the runtime loop. |
| `backlog_path` | `".deckent/autonomous/backlog.json"` (1055) | path | Backlog file, relative to project root. |
| `pool_size` | `1` (1056) | integer >= 1 (validate 779) | Max concurrent autonomous executions (1 = serial). |
| `reactive.enabled` | `false` (1057) | boolean (validate 784) | Reactive trigger bridge. |
| `reactive.map_path` | `".deckent/autonomous/reactive-map.json"` (1057) | string (validate 787) | Reactive trigger map JSON, relative to project root. |
| `work_generator.enabled` | `false` (1058) | boolean (validate 793) | Self-generated work: active tech-debt records become backlog candidates (work-generator-source.ts). HIGH/CRITICAL debt is parked `risk-tagged` for approval; NORMAL dispatches `auto`. |
| `work_generator.interval_ms` | `600000` (1058) | >= 0 ms (validate 796) | Throttle: minimum ms between debt scans (default 10 min). The trigger source polls every idle tick, but a scan runs at most once per interval — ticks inside the window return no candidates (already-enqueued candidates live in the backlog; nothing is lost). |
| `rbac_policy.enabled` | `false` (1059) | boolean (validate 802) | RBAC gate on machine-initiated dispatch (runtime-loop.ts:288). When enabled, every entry-carrying trigger is first checked against `evaluatePolicy`'s RBAC layer before dispatch. |
| `rbac_policy.role` | `"viewer"` (1059) | `admin \| operator \| viewer` (validate 805) | Role the autonomous engine acts under. `viewer` lacks the `execute` permission, so machine-initiated dispatch is hard-denied (deny-by-default); raise to `operator` or `admin` to allow execution. |

Validation errors (config.ts:790-807, exact strings):

- `autonomous.work_generator.enabled must be a boolean`
- `autonomous.work_generator.interval_ms must be >= 0`
- `autonomous.rbac_policy.enabled must be a boolean`
- `autonomous.rbac_policy.role must be admin|operator|viewer`

---

## 23. Inert / Unverified Fields

These appear in config but have no active effect in the current code paths:

- **`cost_optimization`** — validated but **no working consumer was found** (future feature).
- **Top-level `max_workers`** — not effective; the active mode's `modes.<mode>.max_workers` shadows it (`resolveEffectiveWorkers`, config.ts:686). Set the per-mode value instead.
- **Top-level `brain_planning`** — not an effective field on `DeckentConfig`; the real read is `modes.<mode>.brain_planning`. The top-level key only appears in REGEN template defaults (config.ts:1283).
- **`rubric_max_retries`, `adaptive_config.*`** — inert while `adaptive_thresholds: false`.

### Reproducing this verification

```bash
sed -n '760,920p' src/core/config.ts                  # DEFAULT_CONFIG values
grep -n "VALID_\|includes(\|z.enum" src/core/config.ts # validation enums
grep -n "?:" src/core/config-types.ts                  # union types
grep -n "memory" src/orchestra/spawn-backend-docker.ts # docker memory flags
sed -n '94,157p' src/orchestra/timeout-estimator.ts    # timeout estimate chain
```

---

## 24. HTTP Server Configuration (serve command)

The `deckent serve` command runs an HTTP server with these rate-limiting defaults. These settings apply when running the dashboard server.

| Key | Default | Values | Description |
|-----|---------|--------|-------------|
| `rateLimit` | `100` (server.ts:1043) | number >= 0 | Maximum requests per minute per IP address. `0` disables rate limiting. Applies to all remote callers. |
| `rateLimitExemptLoopback` | `true` (server.ts:1043) | boolean | When `true` (default), loopback callers (127.0.0.1, ::1) entirely bypass the rate limiter. When `false`, loopback is rate-limited like any other IP. |

### Rationale for Loopback Exemption

The localhost dashboard legitimately exceeds the per-minute request budget due to:
- Page fetch fan-out: dashboard loads multiple modules, each requiring separate HTTP requests
- SSE reconnects: Server-Sent Events (for real-time updates) reconnect on network hiccup, which can cause rapid request sequences

When a 429 Too Many Requests response is sent to an SSE client, the browser's automatic retry-loop can prevent the rate-limit window from draining, leaving the dashboard unusable.

**Default behavior:** `rateLimitExemptLoopback: true` allows the owner's own dashboard to operate without 429 errors while still protecting against remote abuse.

**For tests:** Set `rateLimitExemptLoopback: false` to exercise the rate-limit rejection path (e.g. testing 429 responses).

### Example: Custom Rate Limit via Code

When calling `createHttpServer()` programmatically:

```typescript
const server = createHttpServer(projectRoot, {
  port: 3100,
  rateLimit: 50,                    // 50 req/min per IP
  rateLimitExemptLoopback: true,    // localhost bypasses
});
```

---

## Related Documentation

- [Core Concepts](../guide/concepts.md) — Sprint, Task, Agent, Brain, Auditor overview
- [Multi-Provider Guide](./multi-provider.md) — Multi-provider setup and usage
- [API Reference](./api.md) — Programmatic API and HTTP endpoints
- [MCP Guide](./mcp-guide.md) — MCP tools and resources
- [FAQ](../guide/faq.md) — Common questions and troubleshooting
