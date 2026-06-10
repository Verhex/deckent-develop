# Multi-Provider Guide

> Use Claude, Codex (OpenAI), Gemini (Google), Ollama (local), or OpenAI-compatible providers (DeepSeek, Qwen, GLM) as your Deckent worker provider.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Default: Claude Provider](#2-default-claude-provider)
3. [Opt-In: Codex Provider (OpenAI)](#3-opt-in-codex-provider-openai)
4. [Opt-In: Gemini Provider (Google)](#4-opt-in-gemini-provider-google)
5. [Opt-In: Ollama Provider (Local / Zero-Cost)](#5-opt-in-ollama-provider-local--zero-cost)
6. [Opt-In: OpenAI-Compatible Providers (DeepSeek / Qwen / GLM)](#6-opt-in-openai-compatible-providers-deepseek--qwen--glm)
7. [Per-Task Provider Override in DIRECTIVES](#7-per-task-provider-override-in-directives)
8. [Auth Credentials Passthrough](#8-auth-credentials-passthrough)
9. [Container vs Host CLI Presence](#9-container-vs-host-cli-presence)
10. [Enabling Codex/Gemini in the Docker Worker Image](#10-enabling-codexgemini-in-the-docker-worker-image)

---

## 1. Overview

Deckent supports multiple providers for worker execution:

| Provider | Mechanism | Auth | Status |
|----------|-----------|------|--------|
| `claude` | `claude` CLI | Subscription or `ANTHROPIC_API_KEY` | **Default** |
| `codex` | `codex` CLI | `OPENAI_API_KEY` or ChatGPT subscription | Opt-in |
| `gemini` | `gemini` CLI | OAuth session (default) **or** `GOOGLE_API_KEY` | Opt-in |
| `ollama` | HTTP server | None — local, zero-cost | Opt-in |
| `deepseek` | HTTP (OpenAI-compat) | `DEEPSEEK_API_KEY` | Opt-in |
| `qwen` | HTTP (OpenAI-compat) | `DASHSCOPE_API_KEY` | Opt-in |
| `zhipu` (GLM) | HTTP (OpenAI-compat) | `ZHIPU_API_KEY` | Opt-in |

---

## 2. Default: Claude Provider

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

## 3. Opt-In: Codex Provider (OpenAI)

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

## 4. Opt-In: Gemini Provider (Google)

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

## 5. Opt-In: Ollama Provider (Local / Zero-Cost)

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
npx deckent config set worker_model qwen3:latest
```

Or in `.deckent/config.json`:

```json
{
  "worker_provider": "ollama",
  "worker_model": "qwen3:latest"
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

## 6. Opt-In: OpenAI-Compatible Providers (DeepSeek / Qwen / GLM)

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

## 7. Per-Task Provider Override in DIRECTIVES

You can override the provider on a per-task basis in `DIRECTIVES.md` using `- Provider:` and `- Model:` together. This enables mixed-fleet sprints where different tasks use different providers concurrently.

### Mixed-fleet example

```markdown
## Task 1: Architecture planning (Claude opus — deep reasoning)
- Provider: claude
- Model: opus
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

The `- Provider:` line overrides `worker_provider` for that specific task. The `- Model:` line sets the exact model within that provider. Both are independent — you can mix any combination of providers and models across tasks in the same sprint.

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

## 8. Auth Credentials Passthrough

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

## 9. Container vs Host CLI Presence

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

## 10. Enabling Codex/Gemini in the Docker Worker Image

The `Dockerfile.worker` has Codex and Gemini install lines commented out by default to keep the base image smaller (~200 MB without them).

To enable them:

1. Open `Dockerfile.worker` and uncomment lines 21–22:

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
