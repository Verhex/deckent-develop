# Local-Model Autonomous Execution — Root-Cause Analysis & Enterprise Architecture

**Date:** 2026-06-08
**Trigger:** Live dogfood — `deckent autonomous start` with an `ollama` (qwen3.6:27b) entry fell back to docker→claude and failed (`model may not exist`). User requested a deep, enterprise-level RCA + correct-method investigation before acting.
**Method:** 4 parallel investigators — (A) spawn/routing+bootstrap RCA, (B) ollama worker harness depth, (C) autonomous execution lifecycle, (D) enterprise best-practices (web).
**Status:** Findings — kept aside for decision. No implementation in this document.

---

## 0. Verdict (executive summary)

**deckent's local-model architecture is CORRECT.** Running the inference server (Ollama) as a **host service** and the worker as a **lightweight host-side tool-loop agent** that drives the model over HTTP (`localhost:11434`) is the **industry-standard, recommended pattern** for agent orchestrators (confirmed across LangGraph / CrewAI / AutoGen / vLLM production setups). The failure was **NOT** RAM, **NOT** GPU-in-Docker, **NOT** a missing working model — your GPU + host Ollama are fine.

**The failure is a chain of WIRING gaps**, each with a precise fix. Local-model autonomous execution is **~3 small fixes away from working**, and a clear enterprise roadmap exists beyond that. The dogfood did exactly its job: it converted "merged/wired" into "proven-not-working" and pinpointed why.

---

## 1. Why it failed live — the exact chain

For `deckent autonomous start` with entry `{provider: ollama, model: qwen3.6:27b, policy: auto}`:

1. **Authority parked it** (despite `policy:auto`). `requestedBy=system`→role `brain`; `action='autonomous.execute'`→`resolveActionType` has no `execute` keyword → defaults to `event_emit` → `checkAuthority(brain, event_emit, 'autonomous.execute')` → channel not in brain's emit list → `needs_approval`. The 3-gate order runs authority **before** policy, so `policy:auto` is dead code. → parked. *(Gap C)*
2. After `approve`, the cycle re-drove it and **executed** — but spawn **fell back to docker→claude** because `getProviderAdapterForTask('ollama')` returned **null**: the `autonomous start` process **never called `bootstrapProviders()`**, so the `providerRegistry` was empty (the OllamaAdapter was never registered). *(Gap A — the host-adapter route exists but is unreachable without bootstrap.)*
3. The docker backend ran the **claude CLI** in a container with `--model qwen3.6:27b` → claude rejected the unknown model → `NO_GO` "worker exited without writing result".
4. **Even if routing had worked**, the worker would still have failed: `runTaskMode` (the `kind=task` path) **never writes `.tasks/task-{id}.json`**, but `agentic-worker-entry` **reads** that file to get its task spec → file-not-found → `NO_GO`. *(Gap E — the deepest root; the actual dogfood worker's NO_GO.)*
5. The backlog entry status stayed `pending` (nothing ever calls `updateStatus`) → it re-processed every cycle. *(Gap B)*

So three independent gaps (A routing-bootstrap, E task-JSON, B status) each alone would fail the run; C makes auto entries park; completion-tracking (F) means "executed"≠"done".

---

## 2. Root-cause gap table (file:line, verified)

| # | Gap | Root cause | File:line | Severity | Fix |
|---|-----|-----------|-----------|----------|-----|
| **A** | Provider registry empty in autonomous/run/MCP | `bootstrapProviders()` called only in `start.ts:201`, `plan.ts:41`, `sprint-runner-entry.ts:220` — NOT in autonomous/run/MCP. Two registries: `modelRegistry` (catalog, bootstrapped) vs `providerRegistry` (adapters, only via bootstrapProviders). | `autonomous.ts` ~234; `run.ts` ~276; `mcp/tools/run.ts` 75-84 | **P0** | Call `bootstrapProviders(config)` once in `handleStart` (+ run/MCP). |
| **E** | No task JSON in `runTaskMode` | `runTaskMode` builds task in-memory, never `writeFileSync`s `.tasks/task-{id}.json`; `agentic-worker-entry:358` reads it → ENOENT → NO_GO. (`deckent run` DOES write it at `run.ts:263`; sprint planner writes it.) | `task-mode-runner.ts` ~94 | **P0** | Write task JSON after `buildRunTask` (mirror `run.ts:261-263`). |
| **B** | Status never written back | `updateStatus` (`backlog.ts:62`) has **0 callers**. Dispatcher returns success without updating the entry → `queryDue` re-surfaces it forever. | `execute-dispatcher.ts:44`; `backlog.ts:62` | **P0** | Inject `backlogPath`; `updateStatus('running')` before, `('done'/'failed', result)` after. |
| **C** | Authority parks `policy:auto` | `resolveActionType('autonomous.execute')`→`event_emit` (no `execute` match); brain not permitted that channel → needs_approval; authority pre-empts policy gate. | `authority-adapter.ts:41/47`; `authority-enforcer.ts` ~146 | **P1** | Map orchestration verb to an allowed ActionType / add `autonomous.execute` to brain authority / trusted-internal path for `system`+AUTONOMOUS_EXECUTE_ACTION. Preserve default-deny. |
| **F** | Worker-completion not tracked | Dispatcher `await runTask` = LAUNCH only (fire-and-forget spawn). "executed"=launched, not done. `waitForRunResult` exists (`run.ts:114`, used by CLI) but autonomous doesn't call it. | `execute-dispatcher.ts:44-55` | **P1** | After launch, `await waitForRunResult(root, taskId, timeout)` → real done/failed. (Same call-site as B.) |
| **D-mcp** | MCP `deckent_run` bypasses routing | Direct `SpawnBackendFactory.create()`, hardcodes `provider:'claude'`, `z.enum(ALL_MODELS)` static snapshot excludes ollama tags. | `mcp/tools/run.ts:28,63,75-84` | **P1** | Route through `spawnWorkerMultiProvider`+bootstrap; derive provider; lazy/extended model enum. |
| **G** | `buildWorkerPrompt` arg bug | `runTaskMode:97` passes `projectRoot` (a path) as the `agentPrompt` argument. | `task-mode-runner.ts:97` | **P2** | Pass resolved `agentPrompt`, not `projectRoot`. |
| **H** | `kind=task` no observability | No task JSON → no `.hb` registration → `deckent status` blind, Auditor can't see stale workers. (Fixed by E.) | (E) | P2 | Covered by E. |

**Atomicity:** B + F share one call-site (`execute-dispatcher.ts:44-55`) — fix together (writing `done` on launch alone = false-done). C must be fixed first or B/E/F never run. E independent but ship with the set.

**Today's partial fix (`8f4a2bfd`+`2926deb5`, branch `feat/autonomous-ollama-exec`, unmerged):** correctly added the `isAdapterProvider`→host-adapter route in `spawnWorkerMultiProvider`, provider-threading (`BacklogEntry.provider`→ctx→`TaskModeContext.provider`→opts), `ensureOllamaModelRegistered`, and the dispatcher `await`. **Correct but insufficient** — the route is unreachable without Gap A (bootstrap), and the run still fails on Gap E (no task JSON). It's a valid building block, not a working fix on its own.

---

## 3. The correct method (enterprise) — confirmed by research

### deckent's architecture is the right one
- **Host inference service + lightweight HTTP tool-loop workers** is the dominant, intentional pattern across all major agent frameworks (LangGraph/CrewAI/AutoGen/Smolagents) and production vLLM/Ollama setups. deckent's `OllamaAdapter` (host) + `agentic-worker-entry` (host tool-loop over `/api/chat`) matches it exactly.
- **Do NOT run Ollama in Docker per worker** (anti-pattern: reloads model into VRAM per task, destroys throughput). The inference server is shared infrastructure; deckent's docker backend is for the **claude/codex CLI** workers only — local models go to the host adapter. (This is precisely the routing the gaps break.)

### Concurrency / GPU (the critical constraint)
- Ollama `OLLAMA_NUM_PARALLEL` default **1** (auto 4 if memory). Same-model concurrent requests are **serialized**. Practical ceiling ~**4-8 concurrent workers** with explicit tuning.
- **Orchestrator backpressure required:** Brain must not spawn more concurrent ollama workers than `OLLAMA_NUM_PARALLEL`; excess workers queue at the OS level wasting memory. Rule: `workers ≈ floor(VRAM / (model_VRAM × 1.25))`. For a single GPU running 27B, **`max_workers: 1-2`** is the safe setting (matches memory `project_ollama_worker_stub_gap` GPU note).
- Beyond ~8 concurrent or 32B+ at scale → **vLLM** (continuous batching + PagedAttention; ~6× throughput at 50 concurrent).
- **Tool-calling reliability:** <7B models unreliable for autonomous tool-use; **32B+ crosses the ~80% threshold** for unattended execution. qwen3.6:27b is in the viable band.

### Enterprise tiers (target roadmap)
- **Tier 1 (now, ≤8 workers):** Ollama host (systemd) + host tool-loop workers + `OLLAMA_NUM_PARALLEL`/`MAX_QUEUE` tuning + Brain backpressure + `/api/tags` health probe + per-model routing via `- Provider: ollama` / `- Model:`.
- **Tier 2 (8-50 workers / multi-model):** vLLM instances behind a **LiteLLM gateway** (routing, rate-limit, RBAC, audit-log) + **llama-swap** for tiered VRAM eviction.
- **Tier 3 (air-gapped):** local model registry (SHA-256, no public pull), pre-staged tokenizers, telemetry disabled, internal PKI/observability, per-request audit (identity, model version, tool calls, trace ids). This is deckent's **data-sovereignty / zero-cost / offline** enterprise pillar (`project_air_gapped_offline_pillar`).

### Reliability for unattended autonomous (5 layers)
inference-server health checks → request-level retry/backoff/timeout → agent-loop safeguards (max-iter, context-window mgmt) → observability (Prometheus + DCGM GPU + Grafana, alerts on VRAM>90% / queue>100 / p95>30s) → task-level fault tolerance (heartbeat staleness, atomic `.result` write, idempotent tools, FIX re-prompt). deckent already has several (heartbeat, scope-guard hard-reject, honest `.result`); the gap is wiring them into the autonomous path + adding completion/timeout.

---

## 4. Recommended fix roadmap

**Phase 1 — Correctness (make autonomous-ollama actually work). ~1 focused slice.**
Fix the P0/P1 set together (they interlock): A (bootstrap in autonomous/run) + E (write task JSON in runTaskMode) + B+F (status-writeback + waitForRunResult in dispatcher) + C (authority lets policy=auto run, default-deny preserved) + G (prompt-arg bug). Then **re-dogfood** on qwen3.6 host → prove a real zero-cost local autonomous task end-to-end. This is the precondition for the master-plan autonomous dogfood + the ollama-autonomous vision.

**Phase 2 — Enterprise hardening (Tier 1 production).**
Brain backpressure to `OLLAMA_NUM_PARALLEL`; `OLLAMA_NUM_PARALLEL`/`MAX_QUEUE`/`KEEP_ALIVE` config surface; per-worker timeout (currently 0/none for ollama); `/api/tags` health gate before spawn; concurrency ceiling = VRAM-aware (not CPU); MCP `deckent_run` routing parity (D-mcp).

**Phase 3 — Scale + air-gapped (Tier 2/3).**
LiteLLM gateway + vLLM option for >8 concurrent / multi-model routing + llama-swap VRAM tiers; air-gapped registry/PKI/telemetry-off/audit; observability stack. (Aligns with AS-2 multi-provider + AS-7 air-gapped pillars.)

---

## 5. Anti-patterns to avoid (from research)
1. Ollama-in-Docker **per worker** (model reload per task → throughput collapse).
2. Model-per-worker without VRAM budgeting (OOM on 2nd worker).
3. No orchestrator backpressure (excess workers queue, waste memory, 0 extra throughput).
4. Treating Ollama as a multi-tenant production API (it's a dev/single-orchestrator runtime; use vLLM for that).
5. Task timeout shorter than model cold-load (false NO_GO before the model loads).
6. New deployments on TGI (maintenance mode since Dec 2025 → vLLM/SGLang).
7. Air-gapped without telemetry-off / pre-staged tokenizers (startup hangs/crashes).

---

## 6. Decision points (for the user)
1. **Proceed to Phase-1 correctness fix now?** (A+E+B+F+C+G as one focused slice, then re-dogfood.) — recommended; it's the precondition for everything autonomous-local.
2. **Authority model for autonomous (Gap C):** option A (remap action verb), B (add `autonomous.execute` to brain authority), or C (trusted-internal path for `system` engine triggers)? Affects the default-deny posture.
3. **Concurrency default:** set deckent-dev `max_workers` low (1-2) for ollama safety + add Brain backpressure now, or defer to Phase 2?
4. **Enterprise tier target:** Tier 1 (Ollama) sufficient near-term, or invest in Tier 2 (vLLM+LiteLLM) for the enterprise story sooner?

---

## 7. References
- Branch (partial fix): `feat/autonomous-ollama-exec` (`8f4a2bfd`+`2926deb5`).
- Memory: `project_autonomous_ollama_execution_gap`, `project_autonomous_engine_direction`, `project_ollama_worker_stub_gap`, `project_air_gapped_offline_pillar`, `project_4cli_subscription_vision`.
- Code anchors: `src/orchestra/sprint-spawner.ts` (correct adapter routing), `src/cli/commands/spawn.ts` (`spawnWorkerMultiProvider`), `src/orchestra/task-mode-runner.ts`, `src/orchestra/autonomous/execute-dispatcher.ts`, `src/orchestra/autonomous/backlog.ts` (`updateStatus`), `src/providers/ollama.ts`, `src/agents/agentic-worker-entry.ts`, `src/cli/commands/run.ts` (`waitForRunResult`), `src/orchestra/authority-adapter.ts` / `authority-enforcer.ts`.
- Enterprise research sources (2025-2026): vLLM vs Ollama benchmarks, LangGraph/CrewAI/AutoGen local-LLM patterns, llama-swap+LiteLLM multi-model, air-gapped LLM (TrueFoundry), Ollama production monitoring. (Full URLs in the investigation transcript.)
