# Provider Fleet Notes

Deckent's multi-provider fleet is routed by provider topology, not by a single shared runtime. These notes are qualitative and describe routing behavior only. They are not latency, cost, throughput, or quality benchmarks.

## Routing Model

| Provider | Worker route | Cloud or local target | Notes |
| --- | --- | --- | --- |
| Claude | Docker worker backend | Anthropic cloud through Claude CLI/auth | The default Docker path builds Claude CLI worker commands and mounts Claude auth when subscription mode is used. |
| Codex | Host `CodexAdapter` | OpenAI cloud through the host `codex` CLI | Runs as a host child process so the CLI can use the host OpenAI API key or logged-in subscription/OAuth state. |
| Gemini | Host `GeminiAdapter` | Google cloud through the host `gemini` CLI | Runs as a host child process so the CLI can use host Google auth state or configured API key. |
| Ollama | Host `OllamaAdapter` | Local on-device Ollama server | Talks to the host Ollama endpoint, normally `localhost:11434`; no cloud provider is required. |

## Host Adapter Rule

`isAdapterProvider()` marks `codex`, `gemini`, and `ollama` as host-routed adapter providers. The sprint spawner uses that predicate before falling back to the configured backend. When a host adapter is registered, the task is spawned through the provider adapter instead of Docker.

This matters because non-Claude providers do not use the Claude-oriented Docker command path. Codex and Gemini need the host CLI and its host auth files/session. Ollama needs access to the host-local daemon. Routing them through Docker would either lose that host context or use the wrong CLI shape.

If a host-routed provider has no available adapter at spawn time, Deckent writes an honest `NO_GO` result instead of silently degrading the work to Claude through Docker.

## Provider Boundary

Treat the provider boundary as part of the benchmark context:

- `claude` enters the Docker worker path, then the Claude CLI talks to Anthropic cloud from inside that containerized worker flow.
- `codex` bypasses Docker and enters the host `codex` CLI, which uses host OpenAI credentials or OAuth/subscription state.
- `gemini` bypasses Docker and enters the host `gemini` CLI, which uses host Google credentials or OAuth/API key state.
- `ollama` bypasses Docker and talks to the host-local Ollama service for on-device inference.

The benchmark harness should label these as different execution topologies. A provider result is not comparable unless the note records whether it used Docker, a host cloud CLI, or a local host daemon.

## Interpretation

Use this document as a topology note when comparing provider runs:

- Claude run evidence usually reflects containerized worker execution plus Anthropic cloud inference.
- Codex and Gemini run evidence reflects host CLI execution plus OpenAI or Google cloud inference.
- Ollama run evidence reflects host execution plus local model inference on the user's machine.

Do not infer performance differences from this note. Any benchmark table should collect fresh measurements and label the runtime, provider, auth mode, machine, and model explicitly.
