# Multi-Provider Guide

Deckent supports multiple AI providers: **Claude** (default), **OpenAI Codex**, **Google Gemini**, **Ollama** (local), and OpenAI-compatible HTTP providers (**DeepSeek**, **Qwen**, **GLM/Zhipu**). You can mix providers per role (Brain vs Worker) or let the fallback chain handle provider failures automatically.

---

## Table of Contents

1. [Supported Providers](#1-supported-providers)
2. [Provider Setup](#2-provider-setup)
3. [Configuration](#3-configuration)
4. [Model Equivalence](#4-model-equivalence)
5. [Fallback Chain](#5-fallback-chain)
6. [Per-Task Provider Override](#6-per-task-provider-override)
7. [Environment Variables](#7-environment-variables)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Supported Providers

| Provider | CLI / SDK | Auth | Worker Backend | Status |
|----------|-----------|------|----------------|--------|
| **Claude** | `claude` CLI (`@anthropic-ai/claude-code`) | OAuth session managed by CLI (subscription or `ANTHROPIC_API_KEY`) | tmux (default) or subprocess; Docker with `~/.claude` mount | Default, full feature support |
| **Codex** | `codex` CLI (`@openai/codex`) | `OPENAI_API_KEY` **or** ChatGPT subscription (`codex auth status`) | subprocess (host-adapter); Docker with `~/.codex` mount | Full sprint + worker support |
| **Gemini** | `gemini` CLI (`@google/gemini-cli`) | OAuth session (default) **or** `GOOGLE_API_KEY` | subprocess (host-adapter); Docker with `~/.gemini` mount | Full sprint + worker support (Sprint 248) |
| **Ollama** | HTTP server (`localhost:11434`) | None — local, zero-cost | Node subprocess via agentic-worker-entry.js (HTTP API) | Local/private; any pulled model |
| **DeepSeek** | HTTP (OpenAI-compat) | `DEEPSEEK_API_KEY` | HTTP-only (no spawn, no Docker) | Brain planner + HTTP tasks |
| **Qwen** | HTTP (OpenAI-compat) | `DASHSCOPE_API_KEY` | HTTP-only (no spawn, no Docker) | Brain planner + HTTP tasks |
| **GLM / Zhipu** | HTTP (OpenAI-compat) | `ZHIPU_API_KEY` | HTTP-only (no spawn, no Docker) | Brain planner + HTTP tasks |

> **Worker backend note:** Claude runs in Docker by default (container isolates the worker). Codex, Gemini, and Ollama are **host-adapter** providers — workers spawn on the host and reach the local CLI or HTTP server. All three host-adapter CLIs can also run in Docker when `- Backend: docker` is set in a task directive, provided the worker image contains their binaries and the host OAuth directory is mounted.

---

## 2. Provider Setup

### Claude (Default)

Claude works out of the box if you have the Claude Code CLI installed.

```bash
# Install
npm install -g @anthropic-ai/claude-code

# Verify
claude --version

# Requires an active subscription (Pro, Max 5x, Max 20x) or ANTHROPIC_API_KEY
# The CLI manages its own OAuth session — no separate login command needed
```

No additional configuration is needed — Claude is the default provider.

### OpenAI Codex

Codex requires the `codex` CLI plus either an API key or a ChatGPT subscription.

```bash
# 1. Install Codex CLI
npm install -g @openai/codex

# 2. Authenticate — choose one:

# Option A: API key
export OPENAI_API_KEY="sk-..."

# Option B: ChatGPT subscription login
codex login

# 3. Verify CLI is installed
codex --version

# 4. Check auth status (shows "logged in" for subscription auth)
codex auth status

# 5. Configure Deckent
deckent config set worker_provider codex
```

### Google Gemini

Gemini requires the `gemini` CLI binary. Authentication uses **either** an OAuth/subscription session **or** a `GOOGLE_API_KEY` — the API key is optional when the CLI already has an active OAuth session (Sprint 248 F1-G).

```bash
# 1. Install the Gemini CLI
npm install -g @google/gemini-cli

# 2. Authenticate — choose one:

# Option A: interactive OAuth/subscription login (no API key required)
gemini   # follow the login prompt on first run

# Option B: API key
export GOOGLE_API_KEY="AIza..."

# 3. Verify
gemini --version

# 4. Configure Deckent
deckent config set worker_provider gemini
```

> **Doctor behavior:** `deckent doctor` uses `GOOGLE_API_KEY` / `DECKENT_GOOGLE_API_KEY` to determine Gemini availability. Without a key, doctor reports **partial** availability even when an OAuth session is active. Workers can still be spawned in partial state (the CLI uses its OAuth session), but `deckent doctor` will show a warning. Set `GOOGLE_API_KEY` to eliminate the warning.

> **IDE session conflict:** When Deckent runs inside a Gemini CLI IDE integration, spawned workers strip `GEMINI_CLI_IDE_*` env vars to prevent attaching to the parent IDE session.

### Ollama (Local / Zero-Cost)

Ollama runs entirely on your machine — no API key, no third-party calls, no cost.

```bash
# 1. Install Ollama (https://ollama.com)
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull a model
ollama pull qwen3:latest
# or: ollama pull llama3.3, mistral, deepseek-r1, etc.

# 3. Ollama starts automatically; confirm the server is reachable
curl http://localhost:11434/api/tags

# 4. Configure Deckent
deckent config set worker_provider ollama
deckent config set worker_model qwen3:latest
```

To use a non-default host:

```bash
export OLLAMA_HOST="http://192.168.1.10:11434"
# or: export DECKENT_OLLAMA_HOST="http://192.168.1.10:11434"
```

Deckent resolves the endpoint in this priority order: `DECKENT_OLLAMA_HOST` → `OLLAMA_HOST` → `http://localhost:11434`.

Any model installed via `ollama pull` is automatically accepted at spawn time (Deckent probes `/api/tags` at startup to discover locally available models).

### OpenAI-Compatible Providers (DeepSeek / Qwen / GLM)

DeepSeek, Qwen, and GLM/Zhipu speak the OpenAI `/chat/completions` wire protocol. Deckent auto-registers each one when the corresponding API key environment variable is set at startup — no explicit config entry is required.

These are **HTTP-only** adapters: they do not spawn a local CLI process and cannot run as Docker workers. They are available for Brain planner calls and agentic HTTP tasks via Deckent's `send()` path.

#### DeepSeek

```bash
export DEEPSEEK_API_KEY="sk-..."
deckent config set worker_provider deepseek
```

Endpoint: `https://api.deepseek.com/v1` · Models: `deepseek-chat`, `deepseek-reasoner`

#### Qwen (DashScope)

```bash
export DASHSCOPE_API_KEY="sk-..."
deckent config set worker_provider qwen
```

Endpoint: `https://dashscope.aliyuncs.com/compatible-mode/v1` · Models: `qwen-plus`, `qwen-turbo`, `qwen-max`

#### GLM / Zhipu

```bash
export ZHIPU_API_KEY="..."
deckent config set worker_provider zhipu
```

Endpoint: `https://open.bigmodel.cn/api/paas/v4` · Models: `glm-4-plus`, `glm-4-flash`, `glm-4-air`

### Verify Provider Availability

```bash
deckent doctor
```

Doctor checks each configured provider's prerequisites and reports their status.

---

## 3. Configuration

Provider settings live in `.deckent/config.json`:

```json
{
  "mode": "max_plan",
  "brain_provider": "claude",
  "worker_provider": "codex",
  "fallback_provider": "gemini"
}
```

### Config Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `brain_provider` | `ProviderName` | `"claude"` | Provider for Brain (planning, evaluation, retrospective) |
| `worker_provider` | `ProviderName` | `"claude"` | Default provider for worker task execution |
| `fallback_provider` | `ProviderName` | — | Automatic fallback when primary provider fails |

### Per-Mode Provider Config

You can also set providers within specific mode blocks:

```json
{
  "mode": "max_plan",
  "modes": {
    "max_plan": {
      "brain_provider": "claude",
      "worker_provider": "claude"
    },
    "api": {
      "brain_provider": "codex",
      "worker_provider": "codex"
    }
  }
}
```

---

## 4. Model Equivalence

When a task requires a specific model tier but the target provider does not support that exact model, Deckent automatically maps to an equivalent model using tier-based equivalence.

### Tier Mapping

| Tier | Claude | Codex | Gemini |
|------|--------|-------|--------|
| **Premium+** | `fable` | `o3` | `gemini-3.1-pro-preview` |
| **Premium** | `opus` | `gpt-5` | `gemini-2.5-pro` |
| **Standard** | `sonnet` | `gpt-4.1` · `o4-mini` | `gemini-2.5-flash` |
| **Economy** | `haiku` | `gpt-5-mini` · `gpt-4.1-mini` | `gemini-2.0-flash` |

> **Wire model note:** The deckent-facing id `gpt-5` maps to wire model `gpt-5.5` (the current ChatGPT-subscription frontier). The CodexAdapter sends the registry `apiId` to avoid rejection. Similarly `opus` → `claude-opus-4-8`, `fable` → `claude-fable-5`.

### How It Works

If Brain plans a task with model `opus` but the worker provider is `codex`, the model is automatically mapped:

```
opus (Claude, premium tier) --> gpt-5 (Codex, premium tier)
```

Similarly:
```
sonnet (Claude, standard) --> gemini-2.5-flash (Gemini, standard)
haiku (Claude, economy)   --> gpt-5-mini (Codex, economy)
fable (Claude, premium+)  --> o3 (Codex, premium+)
```

This mapping is handled by `getEquivalentModel()` in `src/core/model-equivalence.ts`.

---

## 5. Fallback Chain

When a primary provider fails (unavailable, rate limited, auth error), Deckent attempts the fallback provider automatically.

### How Fallback Works

1. Brain or Worker attempts to use the primary provider
2. If the provider fails, Deckent checks if `fallback_provider` is configured
3. If available, the model is remapped via equivalence and the fallback provider is used
4. Only one retry is attempted — no infinite loops

### Example

```json
{
  "worker_provider": "codex",
  "fallback_provider": "claude"
}
```

If Codex is rate-limited during a sprint, workers automatically fall back to Claude with equivalent models.

### No Fallback

If `fallback_provider` is not set, provider failures result in a task `NO_GO`.

---

## 6. Per-Task Provider Override

In DIRECTIVES.md, you can hint at a provider for specific tasks. Brain respects provider fields in task definitions:

```json
{
  "id": "042-003",
  "title": "Generate embeddings",
  "model": "gpt-4.1",
  "provider": "codex"
}
```

Tasks with an explicit `provider` field bypass the global `worker_provider` setting.

### Backend and reasoning-effort (per task)

In a structured `DIRECTIVES.md` task block you can also set:

```markdown
## Task 1: Deep analysis
- Provider: codex
- Backend: docker          # docker | tmux | subprocess
- ModelEffort: high        # model reasoning DEPTH (not work size)
- Effort: normal           # task WORK SIZE (timeout/budget)
- Files: docs/analysis.md
```

- **`- Backend:`** forces the spawn backend. By default `codex`/`gemini`/`ollama` run via their host CLI and `claude` runs in a Docker container. Setting `- Backend: docker` routes a host-CLI provider into the container — it authenticates via the mounted host session directory (`~/.codex`, `~/.gemini`, `~/.claude`). The worker image must contain that provider's CLI and `ca-certificates`.
- **`- ModelEffort:`** sets the model's **reasoning depth** — claude `low|medium|high|xhigh|max` (→ `--effort`), codex `minimal|low|medium|high` (→ `-c model_reasoning_effort=<level>`). Opt-in; gemini/ollama have no reasoning-effort knob. **This is separate from `- Effort:`** (which is task *work size* and drives timeout/budget/token estimates). The two are independent: a small task can request deep reasoning, and vice versa.

---

## 7. Environment Variables

Provider selection can be overridden via environment variables (useful for CI/CD):

| Variable | Description |
|----------|-------------|
| `DECKENT_BRAIN_PROVIDER` | Override `brain_provider` |
| `DECKENT_WORKER_PROVIDER` | Override `worker_provider` |
| `DECKENT_FALLBACK_PROVIDER` | Override `fallback_provider` |
| `ANTHROPIC_API_KEY` | Required for API mode with Claude |
| `OPENAI_API_KEY` | API key auth for Codex |
| `DECKENT_OPENAI_API_KEY` | Deckent-specific Codex key (takes precedence over `OPENAI_API_KEY`) |
| `GOOGLE_API_KEY` | API key auth for Gemini (optional when OAuth session is active) |
| `DECKENT_GOOGLE_API_KEY` | Deckent-specific Gemini key (takes precedence over `GOOGLE_API_KEY`) |
| `DEEPSEEK_API_KEY` | Required for DeepSeek provider |
| `DASHSCOPE_API_KEY` | Required for Qwen provider (DashScope) |
| `ZHIPU_API_KEY` | Required for GLM / Zhipu provider |
| `OLLAMA_HOST` | Ollama server URL (default: `http://localhost:11434`) |
| `DECKENT_OLLAMA_HOST` | Deckent-specific Ollama host (takes precedence over `OLLAMA_HOST`) |

Environment variables take precedence over config file values.

---

## 8. Troubleshooting

### Provider Not Available

```
deckent doctor
```

Check that the provider's prerequisites are met:

- **Claude**: `claude --version` works (session managed internally by CLI)
- **Codex**: `codex --version` works AND (`OPENAI_API_KEY`/`DECKENT_OPENAI_API_KEY` is set OR `codex auth status` shows "logged in")
- **Gemini**: `gemini --version` works AND (`GOOGLE_API_KEY`/`DECKENT_GOOGLE_API_KEY` is set OR OAuth session is active via `gemini` login)
- **Ollama**: `curl http://localhost:11434/api/tags` returns HTTP 200 with at least one model installed
- **DeepSeek**: `DEEPSEEK_API_KEY` is set
- **Qwen**: `DASHSCOPE_API_KEY` is set
- **GLM**: `ZHIPU_API_KEY` is set

### Gemini: doctor reports partial availability

`deckent doctor` checks for `GOOGLE_API_KEY` / `DECKENT_GOOGLE_API_KEY` to determine Gemini availability. Without a key it reports **partial** even when an OAuth session is active. This is a doctor-probe limitation — workers can still be spawned using the OAuth session. To eliminate the warning, set `GOOGLE_API_KEY`.

If workers fail despite an active session, look for `gemini login` / `please authenticate` messages in the task log — the session may have expired. Re-run `gemini` interactively to refresh the OAuth token.

### Model Not Supported by Provider

If you specify a model that does not belong to the configured provider, Deckent will attempt equivalence mapping. If no equivalent exists, the task will fail with a clear error message.

### Fallback Not Working

Ensure `fallback_provider` is set and the fallback provider's prerequisites are met. Only one fallback attempt is made per failure.

### Codex: workers fail with "model is not supported"

Deckent sends the registry `apiId` (`gpt-5.5`) rather than the deckent-facing alias (`gpt-5`). If you see this error, your Codex CLI may be outdated. Update with `npm update -g @openai/codex`.

### Ollama: no models available

`deckent doctor` reports "partial" when the Ollama server is reachable but no models are pulled. Pull a model first:

```bash
ollama pull qwen3:latest
```

---

## Related Documentation

- [Config Reference](./config-reference.md) — Full configuration reference
- [Core Concepts](../guide/concepts.md) — System architecture overview
- [FAQ](../guide/faq.md) — Common questions and troubleshooting
