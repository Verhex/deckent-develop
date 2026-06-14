# Multi-Provider Fleet Guide

> Run tasks on different AI providers **simultaneously** within a single sprint — ollama on the host, claude/codex/gemini in the configured backend, all in parallel.

---

## Overview

Deckent's mixed-fleet capability lets you assign each task in a sprint to a different AI provider. Tasks routed to `ollama` run directly on the host machine (via `OllamaAdapter` at `localhost:11434`, zero API key required). Tasks routed to `claude`, `codex`, or `gemini` run inside the configured backend (Docker container, tmux session, or subprocess). Both groups execute concurrently within the same wave, so a sprint can have an ollama worker and a claude worker running at the exact same time.

---

## How Routing Works

The sprint spawner (`src/orchestra/sprint-spawner.ts`) applies a two-path routing decision for each task:

```
isAdapterProvider(task.provider)?
  YES → adapter.spawn()   — host-HTTP adapter (e.g. OllamaAdapter → localhost:11434)
  NO  → backend.spawn()   — configured backend (Docker / tmux / subprocess)
```

**Host-adapter path** (`ollama`):
- Bypasses the Docker backend entirely.
- `OllamaAdapter.spawn()` calls `localhost:11434` — the local Ollama service running on the host.
- No API key. No container. No network egress.

**Backend path** (`claude`, `codex`, `gemini`):
- Runs inside the Docker worker image (or tmux/subprocess if Docker is not configured).
- The worker container gets the provider's credential injected via environment variable.
- For Claude subscription auth, `~/.claude/` is mounted into the container.

| Provider | Routing Path | Execution Environment |
|----------|-------------|----------------------|
| `claude` | Backend | Docker container / tmux / subprocess |
| `codex` | Backend | Docker container / tmux / subprocess |
| `gemini` | Backend | Docker container / tmux / subprocess |
| `ollama` | Host-adapter | `localhost:11434` (host machine, no container) |

---

## Per-Task Provider Selection

Add a `- Provider:` line to any task in `DIRECTIVES.md` to override the default `worker_provider` for that specific task. Pair it with a `- Model:` line that names a model supported by that provider.

For the full list of deckent model ids, apiIds, and tier equivalences across providers, see [Multi-Provider Guide — Model Registry & Tier Equivalence](multi-provider.md#2-model-registry--tier-equivalence).

```markdown
## Task 1: Local model task
- Provider: ollama
- Model: qwen3.6:27b
- Effort: normal
- Files: docs/guide/local-model-workers.md
- Scope: docs/guide/

## Task 2: Cloud model task
- Provider: claude
- Model: sonnet
- Effort: low
- Files: docs/guide/multi-provider-fleet.md
- Scope: docs/guide/
```

Valid provider values: `claude`, `codex`, `gemini`, `ollama`.

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
- Model: sonnet
- Effort: low
- Files: docs/guide/cloud-notes.md
- Scope: docs/guide/

### Description
Write a complementary guide using the claude provider. Runs inside the
configured Docker backend concurrently with Task 1.
```

When Brain plans this sprint, both tasks land in Wave 1 (no inter-task dependencies). The spawner dispatches them in the same wave:

- Task 1 → `isAdapterProvider('ollama') = true` → `OllamaAdapter.spawn()` → host
- Task 2 → `isAdapterProvider('claude') = false` → `backend.spawn()` → Docker

Both workers execute at the same time — **paralel, eş-zamanlı** — and write their `.result` files independently. Brain evaluates them together.

---

## Prerequisites

**Ollama (for local tasks):**
```bash
# Install Ollama: https://ollama.com
ollama serve                  # start the service (localhost:11434)
ollama pull qwen3.6:27b       # download the model
```

**Claude/Codex/Gemini (for backend tasks):**

Follow the setup in [Multi-Provider Guide](multi-provider.md) — ensure the relevant CLI is installed inside the Docker worker image and authenticated.

**Config (optional — override the default worker provider globally):**
```bash
npx deckent config set worker_provider claude    # default backend provider
# Per-task - Provider: in DIRECTIVES overrides this for individual tasks
```

---

## Summary

- Use `- Provider: <name>` in DIRECTIVES to select a provider per task.
- `claude`, `codex`, `gemini` → configured backend (Docker / tmux / subprocess).
- `ollama` → host-adapter path (`localhost:11434`), bypasses Docker.
- Tasks with different providers and no shared file dependencies run in the **same wave, simultaneously** — a true mixed-fleet sprint.
- Sprint 236 is the first live proof: `ollama/qwen3.6:27b` (Task 1) and `claude/sonnet` (Task 2) ran in parallel in a single sprint, each routed through its respective path.

---

## See Also

- [Local Model Workers Guide](local-model-workers.md) — ollama setup and agentic tool loop
- [Multi-Provider Guide](multi-provider.md) — claude/codex/gemini setup and auth
- [Docker Backend Guide](docker-backend.md) — Docker worker image configuration
