# Multi-Provider Guide

Deckent supports multiple AI providers: **Claude** (default), **OpenAI
Codex**, **Google Gemini**, **Ollama** (local), **OpenRouter**, and configured
OpenAI-compatible HTTP providers. Brain, Worker and Auditor may use independent
configured provider order, but configuration is not availability proof.

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
| **Claude** | `claude` CLI (`@anthropic-ai/claude-code`) | OAuth session managed by CLI (subscription or `ANTHROPIC_API_KEY`) | Docker by default; subprocess supported; explicit tmux deprecated | Default, full feature support |
| **Codex** | `codex` CLI (`@openai/codex`) | `OPENAI_API_KEY` **or** ChatGPT subscription (`codex auth status`) | subprocess (host-adapter); Docker with `~/.codex` mount | Full sprint + worker support |
| **Gemini** | `gemini` CLI (`@google/gemini-cli`) | OAuth session (default) **or** `GOOGLE_API_KEY` | subprocess (host-adapter); Docker with `~/.gemini` mount | Full sprint + worker support (Sprint 248) |
| **Ollama** | HTTP server (`localhost:11434`) | None — local, zero-cost | Node subprocess via agentic-worker-entry.js (HTTP API) | Local/private; any pulled model |
| **OpenRouter** | HTTP API | `OPENROUTER_API_KEY` or Deckent secret | Host HTTP adapter | Opt-in; exact `vendor/model` ID + pricing evidence |
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

Provider settings live in `.deckent/config.json`. The grouped `providers`
object is canonical; flat provider keys remain compatibility inputs.

```json
{
  "mode": "max_plan",
  "providers": {
    "brain": "claude",
    "worker": "codex"
  },
  "provider_fallback": {
    "brain": ["codex", "gemini"],
    "worker": ["claude", "openrouter"],
    "auditor_provider": "codex",
    "auditor": ["claude", "gemini"],
    "global": ["ollama"],
    "unattended": false
  }
}
```

### Config Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `providers.brain` | `ProviderName` | `"claude"` | Brain primary (planning/evaluation) |
| `providers.worker` | `ProviderName` | `"claude"` | Worker primary |
| `provider_fallback.auditor_provider` | `ProviderName` | Brain primary | Auditor primary |
| `provider_fallback.brain` | `ProviderName[]` | — | Ordered Brain fallback candidates |
| `provider_fallback.worker` | `ProviderName[]` | — | Ordered Worker fallback candidates |
| `provider_fallback.auditor` | `ProviderName[]` | — | Ordered Auditor fallback candidates |
| `provider_fallback.global` | `ProviderName[]` | — | Used only when the role has no non-empty chain |
| `provider_fallback.unattended` | `boolean` | `true` | Fail closed on unknown/stale/unavailable reachability or limits during unattended resolution |
| `brain_provider`, `worker_provider`, `fallback_provider` | `ProviderName` | varies | Deprecated flat compatibility fields, used when the corresponding grouped slot is absent; conflicting values fail loudly |

---

## 4. Model Equivalence

Provider-agnostic policy should select a tier, then resolve that tier to a
registered exact API ID owned by the chosen provider. An explicitly authored
provider/model pair is different: ownership mismatch fails loudly and is never
silently rewritten.

### Tier Mapping

| Tier | Claude | Codex | Gemini |
|------|--------|-------|--------|
| **Premium+** | `claude-fable-5` | `o3` | `gemini-3.1-pro-preview` |
| **Premium** | `claude-opus-4-8` | `gpt-5.6-sol` · `gpt-5.5` | `gemini-2.5-pro` |
| **Standard** | `claude-sonnet-5` | `gpt-5.6-terra` · `gpt-4.1` · `o4-mini` | `gemini-2.5-flash` |
| **Economy** | `claude-haiku-4-5-20251001` | `gpt-5.6-luna` · `gpt-5-mini` · `gpt-4.1-mini` | `gemini-2.0-flash` |

These are bundled examples, not a fixed allowlist. Use `deckent models list`
for the current live/cached catalog. Catalog presence does not prove auth,
backend/model reachability, limit evidence or execution-budget admission.

### How It Works

If policy selects the `premium` tier for a Codex worker, the registry may
resolve a registered Codex premium identity such as:

```
premium + codex --> gpt-5.6-sol
```

Other examples:

```
standard + gemini --> gemini-2.5-flash
economy + codex   --> gpt-5.6-luna
premium+ + claude --> claude-fable-5
```

The registry remains authoritative; a future exact API ID can join the catalog
without inventing a new Deckent alias.

---

## 5. Fallback Chain

Fallback configuration defines ordered candidates for Brain, Worker and
Auditor. It does not by itself authorize a provider call or prove that an
automatic retry happened.

### How Fallback Works

1. Resolve the role primary from `providers` (or flat compatibility keys).
2. Use the role-specific chain when non-empty; otherwise use `global`, then the
   legacy single `fallback_provider`.
3. Remove the primary and duplicates while preserving configured order.
4. For each candidate, require backend/auth, exact-model reachability, limit
   and execution-budget evidence.
5. Persist requested/resolved/called identity and fallback reason in the
   invocation receipt; exhaust the chain as a visible HOLD/NO_GO.

### Example

```json
{
  "providers": {
    "worker": "codex"
  },
  "provider_fallback": {
    "worker": ["claude", "gemini"],
    "unattended": true
  }
}
```

The example makes Claude the first Worker fallback candidate. It does not make
Claude reachable, admit an unknown-limit unattended call, or promise that
every legacy execution surface consumes the chain.

> **Current coverage:** role ordering, validation and admission contracts are
> present, and selected host/Goal-v2 consumers use them. Legacy sprint routing,
> every planner path and every cross-verify boundary do not yet share one
> complete live-authority + receipt chain. Treat fallback on an uncovered
> surface as unsupported; never infer success from provider registration order.

### No Fallback

With no configured chain, provider failure must become a visible HOLD/NO_GO;
selecting the first registered provider is not a supported fallback policy.

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

If an explicitly authored model does not belong to the configured provider,
Deckent fails loudly. Use a provider-agnostic tier policy when equivalence is
the desired behavior.

### Fallback Not Working

Inspect the configured role chain, then verify live auth/reachability, limits,
budget admission and the invocation receipt. A catalog entry or
`fallback_provider` field alone is insufficient evidence.

### Codex: workers fail with "model is not supported"

Use a registered exact API ID such as `gpt-5.6-sol` or `gpt-5.5`. Legacy
`gpt-5` is not an authored runtime identity. If a registered exact ID is still
rejected, verify that the Codex account/model is reachable and update the CLI
with `npm update -g @openai/codex`.

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
