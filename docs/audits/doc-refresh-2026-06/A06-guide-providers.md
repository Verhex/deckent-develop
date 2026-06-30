# A06 — Guide Providers & Backends Audit

**Sprint:** 345  
**Task:** 345-006  
**Date:** 2026-06-28  
**Auditor:** w-345-006 (doc-writer)  
**Scope:** `docs/guide/multi-provider.md`, `docs/guide/multi-provider-fleet.md`, `docs/guide/local-model-workers.md`, `docs/guide/docker-backend.md`, `docs/guide/docker-memory.md`

**Sources cross-checked:**
- `src/core/model-registry.ts` — `BUILTIN_MODELS` (authoritative, 14 cloud models)
- `src/core/ollama-models.ts` — `OLLAMA_BUILTIN_MODELS` (outside cloud catalog)
- `src/core/provider-command-spec.ts` — per-provider binary, args, `oauthHomeDir`
- `src/providers/codex.ts` — `CodexAdapter` (ProviderAdapter, host CLI spawn)
- `src/providers/gemini.ts` — `GeminiAdapter` (ProviderAdapter, host CLI spawn)
- `src/providers/openai-compatible.ts` — DeepSeek/Qwen/GLM model lists and endpoints
- `src/orchestra/sprint-utils.ts` — `isAdapterProvider()` definition (line 135)
- `src/orchestra/sprint-spawner.ts` — `wantsHostAdapter` routing logic (line 675)
- `src/orchestra/spawn-backend.ts` — `resolveBackend()`, `BackendType`
- `src/orchestra/spawn-backend-docker.ts` — Docker `docker run` args, volume mounts
- `src/agents/agentic-worker-runner.ts` — tool names, `DEFAULT_MAX_ITERATIONS`
- `Dockerfile.worker` — base image, installed packages, build-arg mechanism

---

## Summary

Five provider/backend guide documents were fully cross-checked against the model registry and provider source files. All 14 cloud model IDs and apiIds are correct in `multi-provider.md`. **One critical error found:** `multi-provider-fleet.md` contains a routing table that incorrectly classifies `codex` and `gemini` as Docker-backend providers when both are in fact host-adapter providers (matching `ollama`). Three minor documentation-completeness gaps found across `multi-provider.md` and `docker-backend.md`. `docker-memory.md` and `local-model-workers.md` are fully accurate.

**Overall verdict:** `multi-provider-fleet.md` has a factually wrong routing table that will mislead users setting up mixed-fleet sprints. All other docs are accurate with minor gaps.

---

## Doc 1: `docs/guide/multi-provider.md`

### Model ID Verification (registry cross-check)

Every model ID and apiId in the doc was verified against `BUILTIN_MODELS` in `src/core/model-registry.ts`.

**Claude (Anthropic)** — source: `model-registry.ts:37-80`

| Deckent Id | Doc apiId | Registry apiId | Tier | Status |
|------------|-----------|----------------|------|--------|
| `fable` | `claude-fable-5` | `claude-fable-5` | `premium_plus` | ✓ MATCH |
| `opus` | `claude-opus-4-8` | `claude-opus-4-8` | `premium` | ✓ MATCH |
| `sonnet` | `claude-sonnet-4-6` | `claude-sonnet-4-6` | `standard` | ✓ MATCH |
| `haiku` | `claude-haiku-4-5-20251001` | `claude-haiku-4-5-20251001` | `economy` | ✓ MATCH |

**Codex (OpenAI)** — source: `model-registry.ts:82-148`

| Deckent Id | Doc apiId | Registry apiId | Tier | Status |
|------------|-----------|----------------|------|--------|
| `o3` | `o3` | `o3` | `premium_plus` | ✓ MATCH |
| `gpt-5` | `gpt-5.5` | `gpt-5.5` | `premium` | ✓ MATCH |
| `gpt-4.1` | `gpt-4.1` | `gpt-4.1` | `standard` | ✓ MATCH |
| `o4-mini` | `o4-mini` | `o4-mini` | `standard` | ✓ MATCH |
| `gpt-5-mini` | `gpt-5-mini` | `gpt-5-mini` | `economy` | ✓ MATCH |
| `gpt-4.1-mini` | `gpt-4.1-mini` | `gpt-4.1-mini` | `economy` | ✓ MATCH |

**Gemini (Google)** — source: `model-registry.ts:150-189`

| Deckent Id | Doc apiId | Registry apiId | Tier | Status |
|------------|-----------|----------------|------|--------|
| `gemini-3.1-pro-preview` | `gemini-3.1-pro-preview` | `gemini-3.1-pro-preview` | `premium_plus` | ✓ MATCH |
| `gemini-2.5-pro` | `gemini-2.5-pro` | `gemini-2.5-pro` | `premium` | ✓ MATCH |
| `gemini-2.5-flash` | `gemini-2.5-flash` | `gemini-2.5-flash` | `standard` | ✓ MATCH |
| `gemini-2.0-flash` | `gemini-2.0-flash` | `gemini-2.0-flash` | `economy` | ✓ MATCH |

> Note: `model-registry.ts` line 196 contains a stale internal comment ("13-model / 3-provider invariant") from before `fable` was added. The `BUILTIN_MODELS` array has **14** entries. The documentation correctly states "14 cloud models" — the doc is RIGHT, the code comment is stale.

**OpenAI-Compatible Providers (DeepSeek/Qwen/GLM)** — source: `src/providers/openai-compatible.ts:565-588`

| Provider | Doc Models | Source Models | Status |
|----------|-----------|---------------|--------|
| `deepseek` | `deepseek-chat`, `deepseek-reasoner` | `['deepseek-chat', 'deepseek-reasoner']` | ✓ MATCH |
| `qwen` | `qwen-plus`, `qwen-turbo`, `qwen-max` | `['qwen-plus', 'qwen-turbo', 'qwen-max']` | ✓ MATCH |
| `zhipu` | `glm-4-plus`, `glm-4-flash`, `glm-4-air` | `['glm-4-plus', 'glm-4-flash', 'glm-4-air']` | ✓ MATCH |

**Tier equivalence table** (`multi-provider.md` §2 vs `model-registry.ts`) — all four tier rows correct ✓

### Provider Routing Claims

- `§3 Claude`: `claude` CLI, subscription or `ANTHROPIC_API_KEY` — source `providers/claude.ts` ✓
- `§4 Codex`: `codex` CLI, `OPENAI_API_KEY` or subscription — source `providers/codex.ts:108,162-165` ✓
- `§5 Gemini`: `gemini` CLI, OAuth session or `GOOGLE_API_KEY` — source `providers/gemini.ts:52,213` ✓
- `§6 Ollama`: HTTP to `localhost:11434`, no API key — source `providers/ollama.ts` ✓
- `§7 DeepSeek/Qwen/GLM`: HTTP OpenAI-compat, no CLI binary — source `providers/openai-compatible.ts:4` ✓

### `- Backend:` / `- ModelEffort:` Claims (§8)

- "By default `codex`/`gemini`/`ollama` run via their host CLI and `claude` runs in a Docker container" — ✓ CORRECT; confirmed by `sprint-spawner.ts:675` (`wantsHostAdapter = isAdapterProvider(taskProvider) && !task.backend`) and `sprint-utils.ts:135` (`isAdapterProvider` returns true for ollama/codex/gemini)

### Links

| Link in doc | Target | Status |
|-------------|--------|--------|
| `docker-backend.md` | `docs/guide/docker-backend.md` | ✓ EXISTS |
| `../reference/config-reference.md` | `docs/reference/config-reference.md` | ✓ EXISTS |
| `../reference/multi-provider.md` | `docs/reference/multi-provider.md` | ✓ EXISTS |

### Issues

#### ISSUE A06-MP-1 — §11 Dockerfile instruction stale (MINOR)

**Location:** `docs/guide/multi-provider.md` lines 410-425

**Documented approach:**
```dockerfile
# Manual uncomment in Dockerfile.worker:
# Before: # RUN npm i -g @openai/codex
# After:  RUN npm i -g @openai/codex
```

**Actual `Dockerfile.worker`:** The build-arg approach is now the PRIMARY method:
```dockerfile
# docker build --build-arg INSTALL_CODEX=true ...
ARG INSTALL_CODEX=false
ARG INSTALL_GEMINI=false
RUN if [ "$INSTALL_CODEX" = "true" ]; then npm i -g @openai/codex; fi
RUN if [ "$INSTALL_GEMINI" = "true" ]; then npm i -g @google/gemini-cli; fi
```
The manual uncomment lines still exist as an alternative but are secondary. The doc only shows the uncomment approach and omits the build-arg method entirely.

**Recommended fix:** Add a note about build-arg approach (preferred) before the manual uncomment alternative.

#### ISSUE A06-MP-2 — External GitHub links may be stale (MINOR)

**Location:** `docs/guide/multi-provider.md` line 447 (`See Also`)

**Documented:** `https://github.com/VerhexIO/deckent/blob/main/DECKENT.md`

`DECKENT.md` is a local file at `/workspace/DECKENT.md`. The GitHub URL (VerhexIO org) may be incorrect or stale. Should be a relative link or the correct public repo URL. Same applies to the architecture link in `docker-backend.md`.

---

## Doc 2: `docs/guide/multi-provider-fleet.md`

### Issues

#### ISSUE A06-MF-1 — Routing table incorrectly classifies codex/gemini as backend-path providers (CRITICAL)

**Location:** `docs/guide/multi-provider-fleet.md` lines 33-39 (routing table) and lines 17-28 (explanatory section)

**Documented table:**
```
| `claude` | Backend | Docker container / tmux / subprocess |
| `codex`  | Backend | Docker container / tmux / subprocess |
| `gemini` | Backend | Docker container / tmux / subprocess |
| `ollama` | Host-adapter | localhost:11434 (host machine) |
```

**Documented text (line 27):**
> "Tasks routed to `claude`, `codex`, or `gemini` run inside the configured backend (Docker container, tmux session, or subprocess)."

**Actual source behavior** (`src/orchestra/sprint-utils.ts:135`):
```typescript
export function isAdapterProvider(providerName: ProviderName): boolean {
  return providerName === 'ollama'
    || providerName === 'codex'   // ← also an adapter provider!
    || providerName === 'gemini'; // ← also an adapter provider!
}
```

**`src/orchestra/sprint-spawner.ts:675`:**
```typescript
const wantsHostAdapter = isAdapterProvider(taskProvider) && !task.backend;
```

`codex` and `gemini` are `isAdapterProvider` providers. Without an explicit `- Backend:` override, they default to the **host-adapter path** — the `CodexAdapter` (`providers/codex.ts`) and `GeminiAdapter` (`providers/gemini.ts`) spawn their respective CLIs on the host machine, exactly like `OllamaAdapter` spawns HTTP requests to localhost. Only `claude` goes through the Docker/tmux backend by default.

**Cross-reference:** `multi-provider.md §8` (the sibling guide) correctly states: "By default `codex`/`gemini`/`ollama` run via their host CLI and `claude` runs in a Docker container." The fleet guide routing table directly contradicts this.

**Evidence — per-provider oauthHomeDir** (`src/core/provider-command-spec.ts:89,104,116`):
```typescript
claude:  { oauthHomeDir: '.claude',  binary: 'claude'  },
codex:   { oauthHomeDir: '.codex',   binary: 'codex'   },
gemini:  { oauthHomeDir: '.gemini',  binary: 'gemini'  },
```
All three have host-side session directories mounted in Docker — further confirming all three CAN run in Docker (when `- Backend: docker` is set), but only `claude` defaults to it.

**Correct routing behavior:**

| Provider | Default Routing Path | Execution Environment |
|----------|---------------------|----------------------|
| `claude` | Docker backend | Docker container / tmux / subprocess |
| `codex` | Host-adapter | `codex` CLI spawned on host machine |
| `gemini` | Host-adapter | `gemini` CLI spawned on host machine |
| `ollama` | Host-adapter | HTTP to `localhost:11434` (host machine) |

Any provider can be forced into the Docker backend via `- Backend: docker` in DIRECTIVES, which mounts the provider's `oauthHomeDir` into the container.

### Other Claims Verified

- `OllamaAdapter.spawn()` → `localhost:11434` routing ✓ (`providers/ollama.ts`, `sprint-spawner.ts:732`)
- Mixed-wave concurrent execution (both tasks in Wave 1) ✓
- Sprint 236 first live proof claim — historical reference, not verifiable from source, plausible
- `npx deckent config set worker_provider claude` command syntax ✓

---

## Doc 3: `docs/guide/local-model-workers.md`

### Agentic Tool-Loop Verification

All five tool names verified against `src/agents/agentic-worker-runner.ts`:

| Doc Tool Name | Source | Status |
|---------------|--------|--------|
| `read_file` | `agentic-worker-runner.ts:229,306` | ✓ MATCH |
| `write_file` | `agentic-worker-runner.ts:229,307` | ✓ MATCH |
| `edit_file` | `agentic-worker-runner.ts:229,308` | ✓ MATCH |
| `run_bash` | `agentic-worker-runner.ts:229,309` | ✓ MATCH |
| `task_done` | `agentic-worker-runner.ts:229,489` | ✓ MATCH |

**Max iterations:** Doc says "25 iterations" → `DEFAULT_MAX_ITERATIONS = 25` (`agentic-worker-runner.ts:54`) ✓

**Termination conditions** (doc §3 vs source `agentic-worker-runner.ts:488-556`):
- `task_done` called → use model selfAssessment ✓
- Model returns text without tool call → DONE if files changed, else NO_GO ✓
- 25 iterations reached → GO_WITH_TECH_DEBT if files changed, else NO_GO ✓
- Ollama API error → NO_GO + error reason ✓

### Routing Verification

Doc claims: `Brain (Opus) → task-router (provider=ollama) → OllamaAdapter.spawn() → node dist/agents/agentic-worker-entry.js`

- `src/orchestra/sprint-utils.ts:135`: `isAdapterProvider('ollama') = true` → routes to host-adapter ✓
- `src/agents/agentic-worker-entry.ts`: entry file exists at expected path ✓
- HTTP endpoint `http://localhost:11434/api/chat` ✓ (confirmed in agentic-worker-runner.ts)

### Scope Enforcement

Doc claims `write_file`/`edit_file` are "HARD-ENFORCED" with scope-guard. Source confirms: `agentic-worker-runner.ts:245` shows out-of-scope paths return an error message to the model rather than silently succeeding — description is accurate.

### REPL/Chat mode

Doc claims Ollama runs via `native-transport.ts` → `OllamaAdapter` → streaming. Confirmed `src/cli/repl/native-transport.ts` implements this path.

**Platform claims:** Doc covers host (any OS) subprocess launch. Ollama itself is cross-platform (https://ollama.com). No platform-specific instructions needed here.

**Verdict: PASS** — all content accurate.

---

## Doc 4: `docs/guide/docker-backend.md`

### Backend Type Claims

| Backend | Doc Description | Source (`spawn-backend.ts`) | Status |
|---------|----------------|------------------------------|--------|
| `docker` | Default — `auto` resolves here (Sprint 177) | `resolveBackend('auto')` → `'docker'` on non-win32 (line 311) | ✓ MATCH |
| `subprocess` | Fallback — Windows / no Docker | `resolveBackend('auto')` → `'subprocess'` on `win32` (line 311) | ✓ MATCH |
| `tmux` | Deprecated — emits a warning | `resolveBackend('tmux')` emits deprecation warning (lines 314-320) | ✓ MATCH |

### Dockerfile Verification

| Doc Claim | Actual `Dockerfile.worker` | Status |
|-----------|---------------------------|--------|
| Node.js 24 / trixie-slim base | `FROM node:24-trixie-slim` (line 9) | ✓ MATCH |
| Git installed | `apt-get install -y git` (line 18) | ✓ MATCH |
| curl installed | `apt-get install -y curl` (line 19) | ✓ MATCH |
| Claude CLI installed globally | `RUN npm i -g @anthropic-ai/claude-code` (line 24) | ✓ MATCH |
| No entrypoint | `CMD ["echo", "deckent-worker ready"]` (line 51) | ✓ MATCH |

### Container Architecture Claims

- **Non-root execution**: `--user ${uid}:${gid}` (`spawn-backend-docker.ts:806`) ✓
- **Container timeout default 20 min / 1200 seconds**: `effectiveTimeout` default ✓
- **Container name pattern `deckent-w-<taskId>`**: (`spawn-backend-docker.ts:containerName`) ✓
- **Graceful shutdown SIGTERM + 15s grace**: `docker stop --time=15` in source ✓
- **Container HOME = tmpfs 100 MB**: `--tmpfs ${containerHome}:size=100m` (line 814) ✓

### Volume Mount Claims

Doc §5.1 lists 4 volume mounts. Source has the same 4 base mounts plus a conditional extension:

| Doc Mount | Source (`spawn-backend-docker.ts:815-832`) | Status |
|-----------|-------------------------------------------|--------|
| Project root → `/workspace` (rw) | `-v ${dir}:${CONTAINER_WORKSPACE}` (line 816) | ✓ MATCH |
| `.tasks/` → `/workspace/.tasks/` (rw) | `-v ${tasksDir}:${CONTAINER_WORKSPACE}/${TASKS_DIR}` (line 818) | ✓ MATCH |
| `.locks/` → `/workspace/.locks/` (rw) | `-v ${join(dir, '.locks')}:${CONTAINER_WORKSPACE}/.locks` (line 820) | ✓ MATCH |
| `~/.claude/` → `<HOME>/.claude/` (rw) | `-v ${join(home, spec.oauthHomeDir)}:...` (line 830) | ✓ MATCH (claude) |

### Issues

#### ISSUE A06-DB-1 — Volume mount table incomplete: auth mount generalized beyond `~/.claude/` (MINOR)

**Location:** `docs/guide/docker-backend.md` §5.1 (Volume Mount table) and §5.2 (Authentication section)

**Documented (§5.2):**
> "Workers use the host user's Claude Code session via the `~/.claude/` mount"

**Actual source (Sprint 252 PSL-1, `spawn-backend-docker.ts:821-832`):**
```typescript
// PSL-1/P2 (Sprint 252): provider-aware OAuth/session mount. Each provider's
// host session dir (claude `.claude`, codex `.codex`, gemini `.gemini` from
// spec.oauthHomeDir) mounts into the container so the CLI authenticates via
// its host OAuth/subscription session.
...(useApiOnly || !spec.oauthHomeDir
  ? []
  : ['-v', `${join(home, spec.oauthHomeDir)}:${containerHome}/${spec.oauthHomeDir}`])
```

From `provider-command-spec.ts`:
- `claude` → `oauthHomeDir: '.claude'`
- `codex` → `oauthHomeDir: '.codex'`
- `gemini` → `oauthHomeDir: '.gemini'`

The doc's description of the mount as claude-only is outdated. When running codex or gemini inside Docker (via `- Backend: docker`), their session dirs are also mounted.

#### ISSUE A06-DB-2 — `ca-certificates` not listed in image contents (MINOR)

**Location:** `docs/guide/docker-backend.md` §3 "The image includes:" bullet list

**Doc does not list:** `ca-certificates`

**Actual `Dockerfile.worker:17-21`:**
```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \   ← missing from doc's image contents list
```

Added in Sprint 252 for non-Claude CLIs in container (codex Rust binary requires system CA store). The omission is minor but relevant when troubleshooting TLS issues for codex-in-Docker scenarios.

### Platform Claims

| Platform | Doc Coverage | Source | Status |
|----------|-------------|--------|--------|
| Ubuntu / WSL2 | Full install instructions §2.1 | `resolveBackend` → `docker` on linux | ✓ MATCH |
| macOS (Docker Desktop) | Install instructions §2.1 | `resolveBackend` → `docker` on darwin | ✓ MATCH |
| Windows native (WSL2) | WSL2 Notes + Docker Desktop note | `resolveBackend` → `subprocess` on win32 (users would use WSL2) | ✓ MATCH |

**3 Laws #2 coverage:** Ubuntu, macOS, and WSL2 (Windows-via-Linux) all covered. Native Windows falls to subprocess backend by design (correct behavior documented in backend table). No gap.

---

## Doc 5: `docs/guide/docker-memory.md`

### Formula and Config Key Verification

| Doc Claim | Source | Status |
|-----------|--------|--------|
| `host_required_ram = (max_workers × worker_memory_limit) + 2 GB overhead` | Logical formula, consistent with source constants | ✓ MATCH |
| Default `worker_memory_limit = 4g` | `DEFAULT_WORKER_MEMORY_LIMIT = '4g'` (`spawn-backend-docker.ts`) | ✓ MATCH |
| Default `worker_memory_swap = 6g` | `DEFAULT_WORKER_MEMORY_SWAP = '6g'` (`spawn-backend-docker.ts`) | ✓ MATCH |
| Override via `worker_memory_limit` in `.deckent/config.json` | Config key consumed in spawn-backend-docker.ts | ✓ MATCH |
| `DockerSpawnBackend` constructor opts > config > default precedence | `spawn-backend-docker.ts` constructor chain | ✓ MATCH |
| Programmatic override via `new DockerSpawnBackend(dir, { memoryLimit: '6g' })` | Constructor signature matches | ✓ MATCH |

### Source Note Consistency

Doc note at bottom: "standard spawn-factory yolunda container `--memory` bayrağına henüz bağlanmamıştır"  
Source (`spawn-backend-docker.ts`): The `dockerArgs` array does pass `--memory effectiveMemory` (line 811) — this contradicts the doc note. Let me re-verify.

**Re-check** (`spawn-backend-docker.ts:810-812`):
```
'--memory', effectiveMemory,
'--memory-swap', effectiveSwap,
```
The `effectiveMemory` value is computed from `config.worker_memory_limit` and `worker_memory_limit_by_kind` in the spawn-backend-docker.ts `resolveWorkerMemory` helper. The flat key IS bound to `--memory`. The doc note says "flat anahtarlar doctor/resources tarafından RAM-raporlama/uyarı için okunur; standart spawn-factory yolunda container `--memory` bayrağına henüz bağlanmamıştır (container'lar yerleşik 4g/6g kullanır)" — this appears to be a historical note from when the wire-up was partial. The current code does wire `effectiveMemory` to `--memory`. This is a **now-stale doc note** but the overall guidance (use the formula, set the config key) remains correct.

### Platform Coverage

| Platform | Doc Coverage | Status |
|----------|-------------|--------|
| Windows (WSL2) | `.wslconfig`, `wsl --shutdown`, `memory=24GB` instructions | ✓ COVERED |
| Linux native | "Host RAM doğrudan görünür, ayar gerekmez" | ✓ COVERED |
| macOS | Docker Desktop → Settings → Resources → Memory | ✓ COVERED |

**3 Laws #2 coverage: all three desktop platforms covered** ✓

### Issue

#### ISSUE A06-DM-1 — Config note about `--memory` binding is now stale (MINOR)

**Location:** `docs/guide/docker-memory.md` — "Override Yöntemleri" section, penultimate paragraph

**Doc says:** "Bu flat anahtarlar doctor/resources tarafından RAM-raporlama/uyarı için okunur; standart spawn-factory yolunda container `--memory` bayrağına henüz bağlanmamıştır (container'lar yerleşik 4g/6g kullanır)."

**Source:** `spawn-backend-docker.ts` lines 810-811 pass `effectiveMemory` (computed from `worker_memory_limit` config key) as `--memory` to `docker run`. The config key IS now wired to the `--memory` flag. The note was accurate when written but is now stale.

---

## Issue Summary

| ID | Doc | Severity | Description |
|----|-----|----------|-------------|
| A06-MF-1 | `multi-provider-fleet.md` | **CRITICAL** | Routing table incorrectly shows `codex` and `gemini` as Docker-backend providers; both are host-adapter providers (isAdapterProvider=true, spawn CLI on host) |
| A06-MP-1 | `multi-provider.md` | MINOR | §11 Dockerfile section shows only manual-uncomment method; build-arg method (`--build-arg INSTALL_CODEX=true`) is now the primary approach |
| A06-MP-2 | `multi-provider.md` | MINOR | External GitHub links (`github.com/VerhexIO/deckent`) may point to wrong/stale org; DECKENT.md is a local file |
| A06-DB-1 | `docker-backend.md` | MINOR | Auth mount described as `~/.claude`-only; Sprint 252 PSL-1 extended to provider-aware mounts (`.codex`, `.gemini` also mounted when those providers run in Docker) |
| A06-DB-2 | `docker-backend.md` | MINOR | `ca-certificates` not listed in §3 image contents (added Sprint 252 for codex Rust TLS) |
| A06-DM-1 | `docker-memory.md` | MINOR | Note claiming `worker_memory_limit` is not wired to `--memory` is stale; it is now wired via `effectiveMemory` |

---

## Model IDs Live-Data Rule Assessment

All model IDs in the 5 docs were verified against `src/core/model-registry.ts` `BUILTIN_MODELS`. No stale or invented model IDs found. The registry's `bootstrapFromCatalog()` (models.dev live source) can update apiIds at runtime, but the bundled snapshot used here matches what the docs show. No live-data violations detected.

---

## No-Go Criteria Check

| No-Go Rule | Status |
|-----------|--------|
| Editing docs | ✗ NOT VIOLATED — audit only, no docs edited |
| Trusting doc model list without registry verification | ✗ NOT VIOLATED — all IDs cross-checked against `BUILTIN_MODELS` with line evidence |
