# Multi-Provider Guide

> Use Claude, Codex (OpenAI), Gemini (Google), Ollama (local), OpenRouter, or configured OpenAI-compatible providers as Deckent execution providers.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Model Registry & Tier Equivalence](#2-model-registry--tier-equivalence)
3. [Default: Claude Provider](#3-default-claude-provider)
4. [Opt-In: Codex Provider (OpenAI)](#4-opt-in-codex-provider-openai)
5. [Opt-In: Gemini Provider (Google)](#5-opt-in-gemini-provider-google)
6. [Opt-In: Ollama Provider (Local / Zero-Cost)](#6-opt-in-ollama-provider-local--zero-cost)
7. [Opt-In: OpenAI-Compatible Providers (DeepSeek / Qwen / GLM)](#7-opt-in-openai-compatible-providers-deepseek--qwen--glm)
8. [Per-Task Provider Override in DIRECTIVES](#8-per-task-provider-override-in-directives)
9. [Auth Credentials Passthrough](#9-auth-credentials-passthrough)
10. [Container vs Host CLI Presence](#10-container-vs-host-cli-presence)
11. [Enabling Codex/Gemini in the Docker Worker Image](#11-enabling-codexgemini-in-the-docker-worker-image)

---

## 1. Overview

Deckent supports multiple providers for worker execution:

| Provider | Mechanism | Auth | Status |
|----------|-----------|------|--------|
| `claude` | `claude` CLI | Subscription or `ANTHROPIC_API_KEY` | **Default** |
| `codex` | `codex` CLI | `OPENAI_API_KEY` or ChatGPT subscription | Opt-in |
| `gemini` | `gemini` CLI | OAuth session (default) **or** `GOOGLE_API_KEY` | Opt-in |
| `ollama` | HTTP server | None — local, zero-cost | Opt-in |
| `openrouter` | HTTP API | `OPENROUTER_API_KEY` or Deckent secret | Opt-in; exact `vendor/model` ID |
| `deepseek` | HTTP (OpenAI-compat) | `DEEPSEEK_API_KEY` | Opt-in |
| `qwen` | HTTP (OpenAI-compat) | `DASHSCOPE_API_KEY` | Opt-in |
| `zhipu` (GLM) | HTTP (OpenAI-compat) | `ZHIPU_API_KEY` | Opt-in |

---

## 2. Model Registry & Tier Equivalence

Deckent loads a live/cached model catalog and keeps a bundled offline snapshot in
`src/core/model-registry.ts`. The catalog is extensible: Ollama tags are
discovered locally, OpenRouter uses exact `vendor/model` IDs with pricing
evidence, and future cloud models are admitted without adding aliases. Do not
pin application logic to a catalog count.

### Tiers

| Tier | Description | Typical Use |
|------|-------------|-------------|
| `premium_plus` | Highest capability, advanced reasoning | Complex architecture, frontier tasks |
| `premium` | High capability, balanced cost | Deep reasoning, multi-file refactors |
| `standard` | General-purpose, cost-efficient | Most development, bug fixes, tests |
| `economy` | Lowest cost, fastest | Docs, simple edits, formatting |

### Bundled Cloud Model Examples

The authored Deckent identity is the provider API ID itself (`id === apiId`).
DIRECTIVES, config, receipts and provider calls therefore carry the same value.
Legacy aliases such as `fable`, `opus`, `sonnet`, `haiku`, `gpt-5` and
`gpt-5.6` are compatibility-migration inputs only; new authored tasks must not
use them.

**Claude (Anthropic)**

| Exact API ID | Tier |
|--------------|------|
| `claude-fable-5` | `premium_plus` |
| `claude-opus-4-8` | `premium` |
| `claude-sonnet-5` | `standard` |
| `claude-haiku-4-5-20251001` | `economy` |

**Codex (OpenAI)**

| Exact API ID | Tier |
|--------------|------|
| `o3` | `premium_plus` |
| `gpt-5.6-sol` | `premium` |
| `gpt-5.6-terra` | `standard` |
| `gpt-5.6-luna` | `economy` |
| `gpt-5.5` | `premium` |
| `gpt-4.1` | `standard` |
| `o4-mini` | `standard` |
| `gpt-5-mini` | `economy` |
| `gpt-4.1-mini` | `economy` |

**Gemini (Google)**

| Exact API ID | Tier | Status |
|--------------|------|--------|
| `gemini-3.1-pro-preview` | `premium_plus` | preview |
| `gemini-2.5-pro` | `premium` | ga |
| `gemini-2.5-flash` | `standard` | ga |
| `gemini-2.0-flash` | `economy` | ga |

> **Note:** `gemini-3.1-pro-preview` is in preview status — behavior may change without notice.

### Tier Equivalence Across Providers

When you switch a task from one provider to another, Deckent maps models by tier:

| Tier | Claude | Codex | Gemini |
|------|--------|-------|--------|
| `premium_plus` | `claude-fable-5` | `o3` | `gemini-3.1-pro-preview` |
| `premium` | `claude-opus-4-8` | `gpt-5.6-sol` / `gpt-5.5` | `gemini-2.5-pro` |
| `standard` | `claude-sonnet-5` | `gpt-5.6-terra` / `gpt-4.1` / `o4-mini` | `gemini-2.5-flash` |
| `economy` | `claude-haiku-4-5-20251001` | `gpt-5.6-luna` / `gpt-5-mini` / `gpt-4.1-mini` | `gemini-2.0-flash` |

Use `deckent models list` (CLI) or `deckent_models` (MCP) to inspect the
current catalog. Catalog presence is not proof of authentication, exact-model
reachability, subscription limits or execution-budget admission.

### Role-Aware Provider Order

Brain, Worker and Auditor can have independent configured primaries and
fallback order:

```json
{
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

A per-role chain replaces `global`; the primary and duplicates are removed
while preserving configured order. The legacy single `fallback_provider`
remains a compatibility input when no role/global chain is configured.

This policy defines candidate order only. Every attempted candidate still
needs backend/auth, exact-model reachability, limit and budget evidence. A
catalog entry or configured fallback must never be reported as a successful
fallback without an invocation receipt. Some legacy execution surfaces do not
yet consume the full role-admission/receipt chain; on those surfaces,
automatic fallback is unsupported rather than implied.

---

## 3. Default: Claude Provider

Claude is the default provider. Install the CLI and it works immediately.

```bash
# 1. Install the Claude Code CLI
npm install -g @anthropic-ai/claude-code

# 2. Verify it is available
claude --version

# Requires an active subscription (Pro, Max 5x, Max 20x) or ANTHROPIC_API_KEY
# The CLI manages its own OAuth session — no separate login command needed
```

To explicitly set Claude as the worker provider:

```bash
npx deckent config set worker_provider claude
```

---

## 4. Opt-In: Codex Provider (OpenAI)

To use OpenAI Codex as a worker provider, you need the Codex CLI installed and authenticated.

### Install

```bash
npm i -g @openai/codex
```

### Authenticate

Codex supports OpenAI subscription (Pro/Team) or API key:

```bash
# Option A: API key
export OPENAI_API_KEY=sk-...

# Option B: ChatGPT subscription login
codex login

# Verify auth status
codex auth status
```

### Enable as default worker provider

```bash
npx deckent config set worker_provider codex
```

Or in `.deckent/config.json`:

```json
{
  "worker_provider": "codex"
}
```

---

## 5. Opt-In: Gemini Provider (Google)

Gemini requires the `gemini` CLI binary. Authentication uses **either** an OAuth/subscription session **or** a `GOOGLE_API_KEY` — the API key is optional when the CLI already has an active OAuth session (Sprint 248 F1-G). Deckent spawns workers via the `gemini` CLI.

### Install

```bash
npm i -g @google/gemini-cli

# Verify the binary is in PATH
gemini --version
```

### Authenticate

```bash
# Option A: interactive OAuth/subscription login (no API key required)
gemini   # follow the login prompt on first run

# Option B: API key
export GOOGLE_API_KEY=AIza...
```

### Enable as default worker provider

```bash
npx deckent config set worker_provider gemini
```

> **Doctor behavior:** `deckent doctor` uses `GOOGLE_API_KEY` / `DECKENT_GOOGLE_API_KEY` to determine Gemini availability. Without a key, doctor reports **partial** availability even when an OAuth session is active. Workers can still be spawned using the OAuth session — to eliminate the warning, set `GOOGLE_API_KEY`.

> **IDE session conflict:** When Deckent runs inside a Gemini CLI IDE integration, spawned workers strip `GEMINI_CLI_IDE_*` env vars to prevent attaching to the parent IDE session.

---

## 6. Opt-In: Ollama Provider (Local / Zero-Cost)

Ollama runs entirely on your machine — no API key, no third-party calls, zero cost. It is the ideal choice for privacy-sensitive workloads or offline development.

### Install and Start

```bash
# Install Ollama from https://ollama.com
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model (examples)
ollama pull qwen3:latest
ollama pull llama3.3
ollama pull deepseek-r1

# Confirm server is running
curl http://localhost:11434/api/tags
```

### Configure Deckent

```bash
npx deckent config set worker_provider ollama
export DECKENT_OLLAMA_MODEL=qwen3:latest   # Ollama model via env (there is no worker_model config key)
```

Or in `.deckent/config.json`:

```json
{
  "worker_provider": "ollama"
}
```

### Custom Ollama Host

```bash
# Use a remote Ollama server or non-default port
export OLLAMA_HOST=http://192.168.1.10:11434
# or deckent-specific override (takes precedence):
export DECKENT_OLLAMA_HOST=http://192.168.1.10:11434
```

Deckent resolves the endpoint in priority order: `DECKENT_OLLAMA_HOST` → `OLLAMA_HOST` → `http://localhost:11434`.

---

## 7. Opt-In: OpenAI-Compatible Providers (DeepSeek / Qwen / GLM)

DeepSeek, Qwen, and GLM/Zhipu speak the OpenAI `/chat/completions` wire protocol. Deckent auto-registers each one when its API key environment variable is present at startup — no explicit `registerProvider` call is required.

### DeepSeek

```bash
export DEEPSEEK_API_KEY=sk-...
npx deckent config set worker_provider deepseek
```

Available models: `deepseek-chat`, `deepseek-reasoner`

### Qwen (DashScope)

```bash
export DASHSCOPE_API_KEY=sk-...
npx deckent config set worker_provider qwen
```

Available models: `qwen-plus`, `qwen-turbo`, `qwen-max`

### GLM / Zhipu

```bash
export ZHIPU_API_KEY=...
npx deckent config set worker_provider zhipu
```

Available models: `glm-4-plus`, `glm-4-flash`, `glm-4-air`

> **HTTP-only:** These three providers are HTTP adapters — they do not spawn a local CLI binary. They communicate directly with the vendor API via `POST /chat/completions`.

---

## 8. Per-Task Provider Override in DIRECTIVES

You can override the provider on a per-task basis in `DIRECTIVES.md` using `- Provider:` and `- Model:` together. This enables mixed-fleet sprints where different tasks use different providers concurrently.

### Mixed-fleet example

```markdown
## Task 1: Architecture planning (Claude — deep reasoning)
- Provider: claude
- Model: claude-opus-4-8
- Effort: high
- Skills: system-architect
- Files: docs/architecture.md
- Scope: docs/

## Task 2: Code generation (Codex — OpenAI)
- Provider: codex
- Model: gpt-4.1
- Effort: normal
- Skills: typescript-expert
- Files: src/api/routes.ts
- Scope: src/api/

## Task 3: Fast documentation (Gemini Flash)
- Provider: gemini
- Model: gemini-2.5-flash
- Effort: low
- Skills: documentation-writer
- Files: docs/guide/api.md
- Scope: docs/guide/

## Task 4: Local model (Ollama — zero-cost, private)
- Provider: ollama
- Model: qwen3:latest
- Effort: normal
- Skills: typescript-expert
- Files: src/utils/helpers.ts
- Scope: src/utils/

## Task 5: High-priority reasoning (DeepSeek)
- Provider: deepseek
- Model: deepseek-reasoner
- Effort: high
- Files: docs/analysis.md
- Scope: docs/
```

The `- Provider:` line overrides `worker_provider` for that task. The
`- Model:` line is the exact provider API ID. Mixed-provider sprints are
supported, but provider ownership is not arbitrary: a model owned by another
provider fails loudly instead of being silently remapped.

### Backend and reasoning-effort (per task)

In a DIRECTIVES task block you can also set:

```markdown
## Task 1: Deep analysis
- Provider: codex
- Backend: docker          # docker | tmux | subprocess
- ModelEffort: high        # model reasoning DEPTH (not work size)
- Effort: normal           # task WORK SIZE (timeout/budget)
- Files: docs/analysis.md
```

- **`- Backend:`** forces the spawn backend. By default `codex`/`gemini`/`ollama` run via their host CLI and `claude` runs in a Docker container. Setting `- Backend: docker` routes a host-CLI provider into the container — it authenticates via the mounted host session directory (`~/.codex`, `~/.gemini`, `~/.claude`). The worker image must contain that provider's CLI and `ca-certificates`.
- **`- ModelEffort:`** sets the model's **reasoning depth** — claude `low|medium|high|xhigh|max` (→ `--effort`), codex `minimal|low|medium|high` (→ `-c model_reasoning_effort=<level>`). Opt-in; gemini/ollama have no reasoning-effort knob. **This is separate from `- Effort:`** (task *work size* for timeout/budget). The two are independent: a small task can request deep reasoning, and vice versa.

---

## 9. Auth Credentials Passthrough

### Subprocess / tmux backends

Environment variables are inherited from the shell that runs `deckent start`. Set them before launching:

```bash
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=AIza...
export DEEPSEEK_API_KEY=sk-...
npx deckent start
```

### Docker backend

The Docker backend passes credentials as environment variables to each container:

```bash
# The backend reads these from the host environment and injects them into containers
OPENAI_API_KEY=sk-... npx deckent start
GOOGLE_API_KEY=AIza-... npx deckent start
```

For Claude, the `~/.claude/` directory is mounted read-write into each container — no explicit API key is needed for subscription auth.

For API key mode (Claude):
```bash
export ANTHROPIC_API_KEY=sk-ant-...
npx deckent start
```

---

## 10. Container vs Host CLI Presence

When using the **Docker backend**, CLIs must be installed **inside the worker image** (`Dockerfile.worker`), not just on the host.

| Scenario | Claude | Codex | Gemini | Ollama | DeepSeek/Qwen/GLM |
|----------|--------|-------|--------|--------|-------------------|
| Subprocess/tmux backend | Host CLI | Host CLI | Host CLI | HTTP probe | HTTP adapter |
| Docker backend | Image CLI ✓ | Image CLI (opt-in) | Image CLI (opt-in) | HTTP probe | HTTP adapter |

The default `Dockerfile.worker` ships with Claude CLI pre-installed. Codex and Gemini CLIs are commented-out and must be explicitly enabled — see §10.

Ollama and the OpenAI-compatible providers (DeepSeek/Qwen/GLM) do not require CLI installation inside the image — they communicate over HTTP.

### Why Docker requires in-image CLIs

Workers run inside containers that have no access to the host filesystem outside of the mounted volumes. The host `$PATH` is not available inside the container, so any CLI invoked by the worker must be installed in the image itself.

---

## 11. Enabling Codex/Gemini in the Docker Worker Image

The `Dockerfile.worker` has Codex and Gemini install lines commented out by default to keep the base image smaller (~200 MB without them).

To enable them:

1. Open `Dockerfile.worker` and uncomment the commented `RUN npm i -g @openai/codex` and `@google/gemini-cli` lines:

   ```dockerfile
   # Before (default — Claude only):
   # RUN npm i -g @openai/codex
   # RUN npm i -g @google/gemini-cli

   # After (all three CLI providers):
   RUN npm i -g @openai/codex
   RUN npm i -g @google/gemini-cli
   ```

2. Rebuild the worker image:

   ```bash
   docker build -f Dockerfile.worker -t deckent-worker:latest .
   ```

3. Verify all three CLIs are available:

   ```bash
   docker run --rm deckent-worker:latest sh -c \
     "claude --version && codex --version && gemini --version"
   ```

> **Image size note:** Adding Codex and Gemini CLIs increases the image size. Record the delta with:
> ```bash
> docker image inspect deckent-worker:latest --format '{{.Size}}'
> ```

---

## See Also

- [Docker Backend Guide](docker-backend.md) — Docker setup and configuration
- [Configuration Reference](../reference/config-reference.md) — All config options
- [Multi-Provider Reference](../reference/multi-provider.md) — Full provider reference with env vars
- [DIRECTIVES Format Guide](https://github.com/VerhexIO/deckent/blob/main/DECKENT.md) — Full task directive syntax
