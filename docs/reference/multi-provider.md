# Multi-Provider Guide

Deckent supports three AI providers: **Claude** (default), **OpenAI Codex**, and **Google Gemini**. You can mix providers per role (Brain vs Worker) or let the fallback chain handle provider failures automatically.

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

| Provider | CLI / SDK | Models | Best For |
|----------|-----------|--------|----------|
| **Claude** | Claude Code CLI (`claude`) | `opus`, `sonnet`, `haiku` | Default provider. Full feature support including tmux workers |
| **Codex** | OpenAI Codex CLI (`codex`) | `gpt-5`, `gpt-5-mini`, `gpt-4.1`, `gpt-4.1-mini`, `o3`, `o4-mini` | Teams already using OpenAI infrastructure |
| **Gemini** | Google Generative AI API | `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.0-flash` | Cost-effective alternative, large context windows |

---

## 2. Provider Setup

### Claude (Default)

Claude works out of the box if you have the Claude Code CLI installed.

```bash
# Verify
claude --version

# Requires an active subscription (Pro, Max 5x, Max 20x) or API key
```

No additional configuration is needed -- Claude is the default provider.

### OpenAI Codex

```bash
# 1. Install Codex CLI
npm install -g @openai/codex

# 2. Set API key
export OPENAI_API_KEY="sk-..."

# 3. Verify
codex --version

# 4. Configure Deckent
deckent config set worker_provider codex
```

### Google Gemini

```bash
# 1. Set API key
export GOOGLE_API_KEY="AIza..."

# 2. Configure Deckent
deckent config set worker_provider gemini
```

Gemini does not require a separate CLI -- Deckent calls the API directly via `node`.

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
| `fallback_provider` | `ProviderName` | -- | Automatic fallback when primary provider fails |

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
| **Premium** | `opus` | `gpt-5` | `gemini-2.5-pro` |
| **Standard** | `sonnet` | `gpt-4.1` | `gemini-2.5-flash` |
| **Economy** | `haiku` | `gpt-5-mini` | `gemini-2.0-flash` |

### How It Works

If Brain plans a task with model `opus` but the worker provider is `codex`, the model is automatically mapped:

```
opus (Claude, premium tier) --> gpt-5 (Codex, premium tier)
```

Similarly:
```
sonnet (Claude, standard) --> gemini-2.5-flash (Gemini, standard)
haiku (Claude, economy) --> gpt-5-mini (Codex, economy)
```

This mapping is handled by `getEquivalentModel()` in `src/core/model-equivalence.ts`.

---

## 5. Fallback Chain

When a primary provider fails (unavailable, rate limited, auth error), Deckent attempts the fallback provider automatically.

### How Fallback Works

1. Brain or Worker attempts to use the primary provider
2. If the provider fails, Deckent checks if `fallback_provider` is configured
3. If available, the model is remapped via equivalence and the fallback provider is used
4. Only one retry is attempted -- no infinite loops

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

---

## 7. Environment Variables

Provider selection can be overridden via environment variables (useful for CI/CD):

| Variable | Description |
|----------|-------------|
| `DECKENT_BRAIN_PROVIDER` | Override `brain_provider` |
| `DECKENT_WORKER_PROVIDER` | Override `worker_provider` |
| `DECKENT_FALLBACK_PROVIDER` | Override `fallback_provider` |
| `OPENAI_API_KEY` | Required for Codex provider |
| `GOOGLE_API_KEY` | Required for Gemini provider |
| `ANTHROPIC_API_KEY` | Required for API mode with Claude |

Environment variables take precedence over config file values.

---

## 8. Troubleshooting

### Provider Not Available

```
deckent doctor
```

Check that the provider's prerequisites are met:
- **Claude**: `claude --version` works
- **Codex**: `codex --version` works and `OPENAI_API_KEY` is set
- **Gemini**: `GOOGLE_API_KEY` is set

### Model Not Supported by Provider

If you specify a model that does not belong to the configured provider, Deckent will attempt equivalence mapping. If no equivalent exists, the task will fail with a clear error message.

### Fallback Not Working

Ensure `fallback_provider` is set and the fallback provider's prerequisites are met. Only one fallback attempt is made per failure.

---

## Related Documentation

- [CONFIG-REFERENCE.md](CONFIG-REFERENCE.md) -- Full configuration reference
- [ARCHITECTURE.md](ARCHITECTURE.md) -- System architecture
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) -- General troubleshooting
