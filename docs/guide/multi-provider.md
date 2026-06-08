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
| `gemini` | `gemini` CLI | CLI binary **+** `GOOGLE_API_KEY` (both required) | Opt-in |
| `ollama` | HTTP server | None — local, zero-cost | Opt-in |
| `deepseek` | HTTP (OpenAI-compat) | `DEEPSEEK_API_KEY` | Opt-in |
| `qwen` | HTTP (OpenAI-compat) | `DASHSCOPE_API_KEY` | Opt-in |
| `zhipu` (GLM) | HTTP (OpenAI-compat) | `ZHIPU_API_KEY` | Opt-in |

---

## 2. Default: Claude Provider

The default provider is `claude`. No configuration is needed.

```bash
# Verify Claude CLI is available and authenticated
claude --version
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

Gemini requires **both** the `gemini` CLI binary **and** a Google API key. The CLI is not optional — Deckent spawns workers via `gemini -p ...`. An API key alone is not sufficient.

### Install

```bash
npm i -g @google/gemini-cli

# Verify the binary is in PATH
gemini --version
```

### Set API Key

```bash
# Mandatory — no subscription-only mode for Gemini
export GOOGLE_API_KEY=AIza...
```

### Enable as default worker provider

```bash
npx deckent config set worker_provider gemini
```

> **Partial availability:** If only the CLI is installed without an API key (or vice versa), `deckent doctor` will report partial availability and Deckent will refuse to spawn Gemini workers. Both prerequisites must be met.

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

You can override the provider on a per-task basis in `DIRECTIVES.md`:

```markdown
## Task 2: Heavy reasoning task
- Model: opus
- Provider: claude
- Effort: high

## Task 3: Code generation with Codex
- Model: gpt-4.1
- Provider: codex
- Effort: normal

## Task 4: Gemini Flash for fast tasks
- Model: gemini-2.5-flash
- Provider: gemini
- Effort: low

## Task 5: Local model task (zero-cost)
- Model: qwen3:latest
- Provider: ollama
- Effort: normal

## Task 6: DeepSeek reasoning
- Model: deepseek-reasoner
- Provider: deepseek
- Effort: high
```

The `- Provider:` line in DIRECTIVES overrides `worker_provider` for that specific task.

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
