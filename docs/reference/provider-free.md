# Provider-Free Architecture

Deckent is designed to run with any supported AI provider without requiring changes to sprint definitions or task configuration. "Provider-free" means your DIRECTIVES, tasks, and sprint workflow are identical regardless of whether workers run on Claude, Codex, Gemini, or Ollama.

---

## Table of Contents

1. [What Provider-Free Means](#1-what-provider-free-means)
2. [Provider Selection](#2-provider-selection)
3. [subprocess / tmux Backend](#3-subprocess--tmux-backend)
4. [Docker Backend](#4-docker-backend)
5. [Ollama (Local) Backend](#5-ollama-local-backend)
6. [Remaining Constraints](#6-remaining-constraints)

---

## 1. What Provider-Free Means

A "provider-free" sprint means:

- Task definitions in DIRECTIVES.md use tier names (`opus`, `sonnet`, `haiku`) — not provider-specific model names.
- The routing engine resolves tier → provider → model automatically based on your `worker_provider` config.
- Switching from Claude to Codex requires only a config change — no DIRECTIVES rewrite.

The canonical tier-to-provider mapping lives in `src/core/model-registry.ts`. `getProviderForModel(model)` is the single resolver used across all backends.

---

## 2. Provider Selection

Configure providers in `.deckent/config.json`:

```json
{
  "brain_provider": "claude",
  "worker_provider": "codex",
  "fallback_provider": "claude"
}
```

Or use tier-based config for full provider-agnostic operation:

```json
{
  "brain_tier": "premium",
  "worker_tier": "standard"
}
```

With tier-based config, Deckent selects the best available model for the configured tier across all installed providers.

---

## 3. subprocess / tmux Backend

The subprocess and tmux backends have full multi-provider support:

| Provider | Requirement |
|----------|------------|
| `claude` | `claude` CLI installed + subscription or API key |
| `codex` | `codex` CLI installed + `OPENAI_API_KEY` |
| `gemini` | `GOOGLE_API_KEY` |
| `ollama` | Ollama running locally (`http://localhost:11434`) |

Worker processes are spawned using the binary for the resolved provider. Model equivalence is applied automatically if the task model does not match the worker provider.

---

## 4. Docker Backend

The Docker backend is fully provider-aware as of Sprint 203 (ADR-066).

### Provider Binary Selection

When a task is dispatched to a Docker worker, `getProviderForModel(model)` resolves the provider. The container command is built around the appropriate binary:

| Provider | Binary in Container | Auth |
|----------|-------------------|------|
| `claude` | `claude` | `~/.claude` directory mounted read-only |
| `codex` | `codex` | `OPENAI_API_KEY` passed via `--env` |
| `gemini` | `gemini` | `GOOGLE_API_KEY` passed via `--env` |
| `ollama` | HTTP (curl) | `host.docker.internal:11434` — no binary needed |

### Building the Worker Image with Multi-CLI Support

The default `Dockerfile.worker` installs only the Claude CLI (lean default). To enable Codex or Gemini inside Docker workers, pass build args at image build time:

```bash
# Claude only (default — lean)
docker build -f Dockerfile.worker -t deckent-worker .

# Claude + Codex
docker build -f Dockerfile.worker \
  --build-arg INSTALL_CODEX=true \
  -t deckent-worker .

# Claude + Gemini
docker build -f Dockerfile.worker \
  --build-arg INSTALL_GEMINI=true \
  -t deckent-worker .

# All providers
docker build -f Dockerfile.worker \
  --build-arg INSTALL_CODEX=true \
  --build-arg INSTALL_GEMINI=true \
  -t deckent-worker .
```

The build args are:

| Arg | Default | Effect |
|-----|---------|--------|
| `INSTALL_CODEX` | `false` | Installs `@openai/codex` CLI |
| `INSTALL_GEMINI` | `false` | Installs Gemini CLI |

### Ollama in Docker

Ollama uses HTTP transport rather than a CLI binary. The container reaches the host Ollama service at `host.docker.internal:11434`.

On Linux, Docker may not resolve `host.docker.internal` by default. Add the host mapping:

```bash
docker run --add-host=host.docker.internal:host-gateway ...
```

Or configure Deckent with `ollama_host` pointing to the Docker bridge IP directly.

---

## 5. Ollama (Local) Backend

Ollama is a first-class provider for local/offline operation (added Sprint 202, ADR-066).

```bash
# 1. Install and start Ollama
ollama serve

# 2. Pull a model
ollama pull llama3

# 3. Configure Deckent
deckent config set worker_provider ollama
deckent config set ollama_model llama3
```

Ollama tasks bypass subscription auth and API key requirements entirely. No `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is needed.

---

## 6. Remaining Constraints

Provider-free is complete across all backends with the following known constraints:

- **Brain** defaults to Claude (`brain_provider: "claude"` default). Brain can be configured to use Codex or Gemini, but Claude is recommended for complex multi-step planning.
- **Three `?? 'claude'` defaults** remain in the codebase as legitimate final fallbacks (config layer, CLI entry point, recovery). These are justified with inline comments and must not increase.
- **Codex/Gemini CLI package names** in `Dockerfile.worker` are conditional; verify the published package names before enabling `INSTALL_CODEX` or `INSTALL_GEMINI` in production.

---

## Related Documentation

- [ADR-066: Provider Independence](../adr/066-provider-independence.md) — architectural decision record
- [Multi-Provider Guide](./multi-provider.md) — per-provider setup and configuration
- [Config Reference](./config-reference.md) — full configuration options
- [Model Registry](../../src/core/model-registry.ts) — canonical model→provider resolver
