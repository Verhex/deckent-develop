# Multi-Provider Guide

> Use Claude, Codex (OpenAI), or Gemini (Google) as your Deckent worker provider — subscription-based CLI auth, no API key required for default operation.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Default: Claude Provider](#2-default-claude-provider)
3. [Opt-In: Codex Provider (OpenAI)](#3-opt-in-codex-provider-openai)
4. [Opt-In: Gemini Provider (Google)](#4-opt-in-gemini-provider-google)
5. [Per-Task Provider Override in DIRECTIVES](#5-per-task-provider-override-in-directives)
6. [Auth Credentials Passthrough](#6-auth-credentials-passthrough)
7. [Container vs Host CLI Presence](#7-container-vs-host-cli-presence)
8. [Enabling Codex/Gemini in the Docker Worker Image](#8-enabling-codexxgemini-in-the-docker-worker-image)

---

## 1. Overview

Deckent supports three CLI-based providers for worker execution:

| Provider | CLI Package | Auth Model | Status |
|----------|-------------|-----------|--------|
| `claude` | `@anthropic-ai/claude-code` | Subscription or API key | **Default** |
| `codex` | `@openai/codex` | Subscription or `OPENAI_API_KEY` | Opt-in |
| `gemini` | `@google/gemini-cli` | Subscription or `GOOGLE_API_KEY` | Opt-in |

All three providers use **subscription auth by default** — no API key is required if you are logged in with the respective CLI. API key mode is an opt-in override.

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
# Subscription auth — login via the CLI
codex auth login

# Or set API key in environment
export OPENAI_API_KEY=sk-...
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

To use Google Gemini as a worker provider, you need the Gemini CLI installed and authenticated.

### Install

```bash
npm i -g @google/gemini-cli
```

### Authenticate

Gemini supports Google account subscription or API key:

```bash
# Subscription auth — login via the CLI
gemini auth login

# Or set API key in environment
export GOOGLE_API_KEY=AIza...
```

### Enable as default worker provider

```bash
npx deckent config set worker_provider gemini
```

---

## 5. Per-Task Provider Override in DIRECTIVES

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
```

The `- Provider:` line in DIRECTIVES overrides `worker_provider` for that specific task. Valid values: `claude`, `codex`, `gemini`.

---

## 6. Auth Credentials Passthrough

### Subprocess / tmux backends

Environment variables are inherited from the shell that runs `deckent start`. Set them before launching:

```bash
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=AIza...
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

## 7. Container vs Host CLI Presence

When using the **Docker backend**, CLIs must be installed **inside the worker image** (`Dockerfile.worker`), not just on the host.

| Scenario | Claude | Codex | Gemini |
|----------|--------|-------|--------|
| Subprocess/tmux backend | Host CLI | Host CLI | Host CLI |
| Docker backend | Image CLI ✓ | Image CLI (opt-in) | Image CLI (opt-in) |

The default `Dockerfile.worker` ships with Claude CLI pre-installed. Codex and Gemini CLIs are commented-out and must be explicitly enabled — see §8.

### Why Docker requires in-image CLIs

Workers run inside containers that have no access to the host filesystem outside of the mounted volumes. The host `$PATH` is not available inside the container, so any CLI invoked by the worker must be installed in the image itself.

---

## 8. Enabling Codex/Gemini in the Docker Worker Image

The `Dockerfile.worker` has Codex and Gemini install lines commented out by default to keep the base image smaller (~200 MB without them).

To enable them:

1. Open `Dockerfile.worker` and uncomment lines 21–22:

   ```dockerfile
   # Before (default — Claude only):
   # RUN npm i -g @openai/codex
   # RUN npm i -g @google/gemini-cli

   # After (all three providers):
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
- [DIRECTIVES Format Guide](../../DECKENT.md) — Full task directive syntax
