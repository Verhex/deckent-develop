# Multi-Provider Fleet Guide

> Run tasks on different AI providers within one sprint — Ollama, Codex,
> Gemini, and OpenRouter through host adapters; Claude through the configured
> backend; dependency-ready work sharing the configured worker slots.

---

## Overview

Deckent's mixed-fleet capability lets you assign each task in a sprint to a
different AI provider. Tasks routed to `ollama`, `codex`, `gemini`, or
`openrouter` use their host adapters by default. Tasks routed to `claude` run
inside the configured backend (Docker by default, subprocess when selected, or
deprecated explicit tmux). Dependency-ready tasks may share a wave and run
concurrently, bounded by configured worker slots.

---

## How Routing Works

The sprint spawner (`src/orchestra/sprint-spawner.ts`) applies a two-path routing decision for each task, based on `isAdapterProvider()` (`src/orchestra/sprint-utils.ts`):

```
isAdapterProvider(task.provider)?
  YES → adapter.spawn()   — host adapter (spawns CLI or HTTP on the host)
  NO  → backend.spawn()   — configured backend (Docker / tmux / subprocess)
```

`isAdapterProvider` returns `true` for `ollama`, `codex`, `gemini`, and
`openrouter`; `false` for `claude`.

**Host-adapter path** (`ollama`, `codex`, `gemini`, `openrouter`):
- When selected, bypasses the configured spawn backend.
- `OllamaAdapter.spawn()` calls `localhost:11434` — the local Ollama service running on the host.
- `CodexAdapter.spawn()` and `GeminiAdapter.spawn()` exec the `codex` / `gemini` CLI binaries on the host machine.
- OpenRouter uses its host HTTP worker and host-resolved secret.
- Provider credentials come from the host environment, secret store, or CLI session.

**Backend path** (`claude`):
- Uses the configured backend: Docker by default, explicitly/persistently
  selected subprocess, or deprecated explicit tmux.
- The worker container gets Claude credentials via environment variable or `~/.claude/` mount.

> **Note:** Codex and Gemini can be explicitly routed to Docker with
> `- Backend: docker` when the worker image contains their binaries and the
> corresponding host session directory is mounted. Ollama and OpenRouter are
> host-only adapters and reject Docker routing rather than silently changing
> provider.

| Provider | Default Routing Path | Execution Environment |
|----------|---------------------|----------------------|
| `claude` | Backend | Docker container / tmux / subprocess |
| `codex` | Host-adapter | `codex` CLI spawned on host machine |
| `gemini` | Host-adapter | `gemini` CLI spawned on host machine |
| `ollama` | Host-adapter | HTTP to `localhost:11434` (host machine, no container) |
| `openrouter` | Host-adapter | Host HTTP worker using an OpenRouter secret |

---

## Per-Task Provider Selection

Add a `- Provider:` line to any task in `DIRECTIVES.md` to override
`providers.worker` for that task. Pair it with a `- Model:` line containing an
exact API ID owned by that provider.

For current live/cached model identities and bundled tier examples, run
`deckent models list` and see [Multi-Provider Guide — Model
Equivalence](multi-provider.md#4-model-equivalence).

```markdown
## Task 1: Local model task
- Provider: ollama
- Model: qwen3.6:27b
- Effort: normal
- Files: docs/guide/local-model-workers.md
- Scope: docs/guide/

## Task 2: Cloud model task
- Provider: claude
- Model: claude-sonnet-5
- Effort: low
- Files: docs/guide/multi-provider-fleet.md
- Scope: docs/guide/
```

First-class provider values: `claude`, `codex`, `gemini`, `ollama`,
`openrouter`. OpenRouter model IDs are catalog-driven `vendor/model`
identities.

---

## Mixed-Fleet DIRECTIVES Example

The following snippet shows a sprint where an ollama worker and a claude worker run in **parallel** — a real mixed-fleet sprint. Tasks share no file dependencies, so they are placed in the same wave and execute simultaneously.

```markdown
# DIRECTIVES — Sprint NNN: Mixed-Fleet Demo

## Goal: Demonstrate ollama + claude running concurrently.

---

## Task 1: [Ollama] Local documentation task
- Provider: ollama
- Model: qwen3.6:27b
- Effort: normal
- Files: docs/guide/local-notes.md
- Scope: docs/guide/

### Description
Write a short guide using the local model. The ollama worker runs on the
host (localhost:11434) — no Docker, no API key.

---

## Task 2: [Claude] Cloud documentation task
- Provider: claude
- Model: claude-sonnet-5
- Effort: low
- Files: docs/guide/cloud-notes.md
- Scope: docs/guide/

### Description
Write a complementary guide using the claude provider. Runs inside the
configured Docker backend and is eligible to run concurrently with Task 1 when
runtime admission and worker capacity allow.
```

When Brain plans this sprint, both tasks are eligible for Wave 1 because they
have no inter-task dependencies. The spawner may dispatch them concurrently
when at least two configured worker slots are available:

- Task 1 → `isAdapterProvider('ollama') = true` → `OllamaAdapter.spawn()` → host
- Task 2 → `isAdapterProvider('claude') = false` → `backend.spawn()` → Docker

Each worker writes its `.result` independently; the configured concurrency cap
and runtime admission gates still govern actual dispatch.

---

## Prerequisites

**Ollama (for local tasks):**
```bash
# Install Ollama: https://ollama.com
ollama serve                  # start the service (localhost:11434)
ollama pull qwen3.6:27b       # download the model
```

**Codex/Gemini/OpenRouter (for host tasks):**

Install and authenticate `codex` / `gemini` on the host machine. Configure an
OpenRouter secret for OpenRouter tasks. See [Multi-Provider
Guide](multi-provider.md) for setup. Configuration is candidate order only; it
does not prove auth, model reachability, limits, budget admission, dispatch, or
a persisted receipt.

**Claude (for Docker backend tasks):**

Follow the setup in [Multi-Provider Guide](multi-provider.md) — ensure the Claude CLI is installed inside the Docker worker image and authenticated (`~/.claude/` is mounted automatically).

**Config (optional — override the default worker provider globally):**
```bash
deckent config set providers.worker claude
# Per-task - Provider: in DIRECTIVES overrides this for individual tasks
```

---

## Summary

- Use `- Provider: <name>` in DIRECTIVES to select a provider per task.
- `claude` → configured backend (Docker / tmux / subprocess) by default.
- `codex` → host-adapter path (`codex` CLI on host), bypasses Docker by default.
- `gemini` → host-adapter path (`gemini` CLI on host), bypasses Docker by default.
- `ollama` → host-adapter path (HTTP to `localhost:11434`), bypasses Docker.
- `openrouter` → host HTTP-adapter path; dynamic exact `vendor/model` identity.
- Codex/Gemini may use explicit Docker when the image and credential mounts
  support it; Ollama/OpenRouter remain host-only.
- Dependency-ready tasks can share a wave and run concurrently up to configured
  worker capacity.
- Sprint 236 recorded an Ollama/Claude mixed-fleet run. Its historical
  artefacts—not this current catalog example—remain authoritative for the exact
  called Claude model.

---

## See Also

- [Local Model Workers Guide](local-model-workers.md) — ollama setup and agentic tool loop
- [Multi-Provider Guide](multi-provider.md) — claude/codex/gemini setup and auth
- [Docker Backend Guide](docker-backend.md) — Docker worker image configuration
