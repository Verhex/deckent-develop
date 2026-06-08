# F1-013 — Local-Model Agentic Worker Harness (Design Spec)

**Date:** 2026-06-06
**Status:** Approved (design) — pending implementation
**Owner:** Alperen
**MASTER-PLAN:** §4A AS-2 Faz 1 (component 2, F1-013 "Agentic HTTP-worker")
**Related memory:** [[project_ollama_worker_stub_gap]] · [[project_4cli_subscription_vision]] · [[feedback_proof_of_function_dod]] · [[feedback_wiring_pct_vs_user_working]]
**Related ADR:** ADR-037 (RBAC scope) · ADR-076 (auth-precedence) · ADR-010 (no new dep) · ADR-027 (spawn backend)

---

## 1. Goal

Make a local Ollama model (validated: `qwen3.6:27b`, RTX 5090, native tool-calling, 74 tok/s) function as a **real deckent worker** — read scope files, edit/write files, run tests/bash, and write a structured `.result` — orchestrated by Brain (Claude Opus), scope-enforced. This is the enabler for the Agentic Multi-Provider Mixed-Fleet (AS-2): once local models are real workers, the same headless harness generalizes to any HTTP/OpenAI-compatible provider.

**v1 success criterion (proof-of-function):** Brain plans one real task → routed to `provider=ollama` → harness executes it (edits files in scope, runs verification) → writes a `.result` Brain evaluates as GO/NO_GO. Verified against the **real** qwen3.6 model, not a mock.

## 2. Scope

**In scope (v1):**
- Single task, end-to-end, real local model.
- Native Ollama tool-calling loop (`/api/chat` + `tools`).
- Tools: `read_file`, `write_file`, `edit_file`, `run_bash`, `task_done`.
- Scope enforcement on writes/edits (ADR-037).
- Structured `.result` + `.hb` heartbeat + `.log`.
- Wire into `OllamaAdapter.spawn` (replace one-shot curl), preserving kill/timeout lifecycle.
- Dynamic model acceptance (any model in `/api/tags`, not the hardcoded 4).

**Non-goals (deferred):**
- Multi-task parallelism / mixed-fleet concurrency → **AS-2 Faz 2** (existing spawn infra already routes per-task; verified separately).
- OpenAI-compatible providers (GLM/Groq/…) → same runner, later phase (the runner is built provider-agnostic to enable this, but only ollama is wired+tested in v1).
- Gemini subscription-CLI → separate (F1-014/F6).
- Brain provider-level auto-distribution intelligence → later (routing-engine enhance).

## 3. Architecture

Two new modules + targeted edits. The **loop logic is isolated and unit-testable**; the **subprocess entry is a thin wrapper** so the worker lifecycle (kill via signal, heartbeat, log file) matches the other adapters (ADR-027 pattern).

### 3.1 Components

1. **`src/agents/agentic-worker-runner.ts`** (new) — the core agentic loop. Pure-ish, dependency-injected (fetch impl, fs root, tool executors, logger) for hermetic testing.
   - Input: `{ taskId, model, host, prompt, scope, goNogo, maxIterations }`.
   - Builds initial message array (system prompt advertising tools + task + scope + goNogo).
   - Loop: POST `${host}/api/chat` `{ model, messages, tools, stream:false }` → read `message.tool_calls` → execute each via tool executors → append each result as a `{ role:'tool', content }` message → repeat.
   - Terminates on: model calls `task_done` (→ use its `selfAssessment`/`notes`), OR no `tool_calls` returned (model emitted only content → treat as done with inferred assessment), OR `maxIterations` reached (→ GO_WITH_TECH_DEBT/NO_GO).
   - Returns a structured result object (filesChanged tracked from write/edit tool calls, testsPassed inferred from run_bash exit if a test command was run, selfAssessment, notes).

2. **`src/agents/agentic-worker-entry.ts`** (new) — thin subprocess entrypoint. Reads `.tasks/task-{id}.json`, constructs the runner with real deps, writes heartbeat transitions, calls runner, writes `.tasks/task-{id}.result`. This is what `OllamaAdapter.spawn` launches (`node dist/agents/agentic-worker-entry.js <taskId> <model> <host>`), so SIGTERM/kill/timeout work uniformly.

3. **Tool executors** — reuse `src/cli/commands/chat-tool-exec.ts` implementations (read/write/edit/bash). Wrap them with a **scope guard** (new small helper, or extend the executor with an allowed-paths param). The guard validates `write_file`/`edit_file` target paths against `scope.filesWrite` + `scope.directories`; out-of-scope → return an error string to the model (loop continues, model self-corrects), never a silent skip.

4. **Tool schemas** — JSON-schema definitions for the native tools API. Co-located with the runner (or a `agentic-worker-tools.ts`).

### 3.2 Edits to existing files

- **`src/providers/ollama.ts`**:
  - `spawn()`: replace the one-shot `curl /api/generate` with `spawn('node', [entryPath, taskId, apiId, host], …)`. Keep heartbeat write, log fd, worker map, timeout, kill.
  - `isSupportedModel()`: accept any model present in the live `/api/tags` list (cache the probe), falling back to the static catalog. So `qwen3.6:27b` (not in the hardcoded 4) is accepted. (Keeps the 4 built-ins for tier-based routing defaults.)

## 4. Tool Definitions (native Ollama `tools`)

| Tool | Args | Behavior |
|------|------|----------|
| `read_file` | `{ path }` | Return file contents (any path under project root; reads allowed broadly). |
| `write_file` | `{ path, content }` | Write file. **Scope-guarded** → reject if outside `scope.filesWrite`. |
| `edit_file` | `{ path, old, new }` | Replace `old`→`new`. **Scope-guarded**. |
| `run_bash` | `{ cmd }` | Run a shell command in project root, return stdout+stderr+exit. **Free but logged** (scope already limits file writes). Async spawn (no event-loop block). |
| `task_done` | `{ selfAssessment: 'DONE'\|'GO_WITH_TECH_DEBT'\|'NO_GO', notes }` | Terminate the loop; carries the worker's honest assessment. |

## 5. Data Flow

```
Brain (Opus) plans task → task-router routes provider=ollama
  → OllamaAdapter.spawn → node agentic-worker-entry.js
    → agentic-worker-runner loop:
        /api/chat {model, messages, tools}
          ↻ tool_calls → execute (scope-guarded) → tool results → next turn
        until task_done / no-tools / max-iter
    → write .result {filesChanged, testsPassed, selfAssessment, notes}
  → Brain evaluates GO / NO_GO / GO_WITH_TECH_DEBT
```

## 6. Decisions (Alperen-approved)

1. **bash policy:** free + logged (scope guard limits file writes; deckent's other workers also use bash freely).
2. **scope violation:** hard-reject — out-of-scope write/edit returns an error to the model (not advisory-warn). Local worker hard-enforces even though ADR-037 runtime is advisory for CLI workers.
3. **max-iterations:** 25, config-surfaced (`.deckent/config.json`).

## 7. Error Handling

- Tool error (file not found, bad edit, bash non-zero) → returned to the model as the tool result (self-heal; the loop continues).
- `maxIterations` reached without `task_done` → write `GO_WITH_TECH_DEBT` (if files changed) or `NO_GO` (if nothing changed), notes explain.
- Ollama API error / unreachable / timeout → `NO_GO` with reason; existing `defaultTimeoutMs` SIGKILL preserved.
- Malformed `tool_calls` args → error result to model (one retry per tool), then skip.

## 8. Testing

- **Hermetic unit (Tier-0):** inject a stub `fetchImpl` returning scripted `tool_calls` sequences; run the runner against a tmpdir sandbox; assert: (a) tools execute & files change correctly, (b) out-of-scope write is rejected + error fed back, (c) `.result` shape correct, (d) max-iter cap fires, (e) `task_done` assessment honored. `fetchImpl` injection already supported by `OllamaAdapter`.
- **Live smoke (proof-of-function):** spawn a real worker against `qwen3.6:27b` for a trivial real task (e.g., add a comment to a scoped file + confirm) → assert `.result.selfAssessment` and the file actually changed. Gated on Ollama availability (skip-if-absent for CI hermeticity, [[project_ci_green_root_causes]]).
- No `spawnSync` in tests; async spawn only (CLAUDE.md hermeticity; cf. the onTaskUpdate lesson).

## 9. Reuse vs New

- **Reuse:** `chat-tool-exec.ts` executors, scope/RBAC helpers, `.result`/`.hb` format (api-surface.md), subprocess spawn lifecycle (ollama adapter / spawn-backend), `fetchImpl` injection.
- **New:** `agentic-worker-runner.ts` (loop), `agentic-worker-entry.ts` (subprocess entry), tool schemas, scope-guard wrapper, the two `ollama.ts` edits.

## 10. Forward Path (after v1)

- **AS-2 Faz 2:** verify mixed-fleet — one sprint with `ollama` + `claude` tasks running concurrently (routing already supports per-task provider). Generalize the runner to `OpenAICompatibleAdapter.spawn` (GLM/Groq/OpenRouter).
- **Gemini subs (F1-014/F6):** drop the hard `GOOGLE_API_KEY` requirement; support `gemini` CLI OAuth (codex pattern).
- **Brain auto-distribution:** routing-engine enhancement for provider-level "right-model-right-work".

## 11. Build Method (open — Alperen decides after spec review)

- **(a) Hand-code** directly (god-level bar, CLAUDE.md Quality Bar).
- **(b) Dogfood**: this spec → DIRECTIVES → deckent sprint with **Claude** workers builds the harness → product gains **local** workers (bootstrap).
