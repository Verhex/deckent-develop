# Design — half-wired feature disposition + comprehensive dogfood sprint

> **Date:** 2026-06-26 · **Source:** brainstorm over the overnight loop's proof-backed findings
> (`OVERNIGHT-DOGFOOD-LOOP.md`). **Goal:** for each built-but-unwired capability, decide WIRE vs KES
> through a "don't abandon features that could make deckent magnificent" lens, then deliver all of it
> in ONE comprehensive deckent dogfood sprint (parallel agents; core work → opus workers).
> **No ADR references** — the ADR set is being overhauled separately; decisions stand on capability merit.

## Decisions (9 capabilities)

| # | Capability | Today | Decision | Notes |
|---|-----------|-------|----------|-------|
| 1 | **sandbox** (`SandboxSpawnBackend`) | soft isolation (mem-cap + path-jail + proxy net-block), unwired; comment claims a non-existent `--sandbox` flag | **WIRE-as-is** | wire `--sandbox` on start; "no-Docker lightweight isolation tier" (air-gapped/restricted hosts). The strong isolation already lives in the Docker backend. |
| 2 | **agent-cache** (`AgentSelectionCache`) | clean LRU (100/5min) keyed by task-signature, unwired | **WIRE flag-gated default-off** | memoize `selectBestAgent`; clear on pool/config change. Bundled with #9 (cache key must include skills once affinity is on). |
| 3 | **result-merger** | `mergeResults` (sprint-summary agg) + `detectOverlaps` (post-exec file overlap) | **split: detectOverlaps WIRE, mergeResults KES** | aggregation is superseded by the inline sprint-reporter; `detectOverlaps` is a NEW capability — POST-execution actual-overlap (vs the existing PRE-spawn scope-collision), wired as a small EVALUATE-phase check + audit event (parallel-conflict quality under soft scope-enforcement). |
| 4 | **task-retry** | `createRetryTask` (re-queue `-rN` PENDING + backoff), unwired | **WIRE + exponential backoff** | NOT superseded — it is the missing RE-QUEUE half. The cascade decision computes `shouldRetry` for RUNTIME/transient failures but nothing re-runs the task today. Connect: RUNTIME/AMBIGUOUS failure + retryCount<MAX → re-queue with backoff. Distinct from FIX-phase (CODE → fix-worker) and runtime-extension (wait for late results). Flag-gated default-off; exponential backoff (replace the flat 2-level table). |
| 5 | **rate-limiter** | `api/rate-limiter.ts ApiRateLimiter` (per-IP) + `core/rate-limiter.ts TenantRateLimiter` (per-tenant) | **split: api per-IP KES, core per-tenant KEEP→enterprise-epic** | the live per-IP limiter is `server.ts SlidingWindowRateLimiter`; `ApiRateLimiter` is a true duplicate → KES. `TenantRateLimiter` is the unwired multi-tenancy quota guard → keep for the enterprise/MOD-SPLIT layer (per-tenant quotas at million-tenant scale). |
| 6 | **lazy-loader** | generic `lazyLoad`/`LazyMap`, zero consumer | **KES** | a generic technique, not a specific capability; YAGNI. When scale demands lazy agent/skill-pool loading, build that concrete feature then. |
| 7 | **whatsapp** (`connectors/whatsapp.ts`) | connector built+tested, not in bootstrap SUPPORTED | **WIRE** | add to `connector-bootstrap` SUPPORTED + dynamic-load; WhatsApp = massive reach channel. Connector domain — coordinated (that work is now complete). |
| 8 | **connector-pool** (`ConnectorPool.broadcast`) | unused (live path = per-channel notify) | **WIRE** | broadcast-to-all-channels capability. |
| 9 | **routing-affinity** (skill→agent) | bonus logic exists (flag-gated) but routing never passes the context — order is agent-first→skill-second | **WIRE (routing-v2 epic with #2)** | reorder `routeTaskV2` to skill-first (safe — skills don't depend on agent), thread the affinity context, flag-gated default-off. Fixes the "everything collapses to refactorer" imbalance. Bundle with agent-cache (shared cache key includes skills). Routing-balance validation is a follow-up BEFORE any default-on. |

**Deferred epics (explicitly OUT of this sprint):** per-tenant `TenantRateLimiter` (enterprise/MOD-SPLIT) · sandbox elevation to seccomp/cgroups/namespace + unified isolation-policy (enterprise-isolation epic) · routing-affinity default-ON (needs balance validation first).

## Comprehensive sprint plan

ONE sprint, AI-planner decomposes into **distinct-file parallel tasks** (collision-hang lesson — no two tasks write the same file; same-file work is one task, e.g. result-merger). The planner-deps normalization + cascade-skip hang-fix are now live, so dependency pipelines are safe.

**Binding constraints (embedded in DIRECTIVES):**
- **Distinct-file per task** — partition by file; shared core files (`sprint-phases.ts`, `sprint-spawner.ts`, `routing-engine.ts`, `start.ts`) each touched by at most ONE task.
- **Behaviour-changing capabilities flag-gated default-off** (task-retry, agent-cache, routing-affinity) → byte-identical until enabled; dogfood-enable + measure after.
- **Core/behaviour-changing tasks → opus workers** (sandbox-wire, task-retry+cascade, routing-v2, detectOverlaps-EVALUATE). Mechanical KES/cleanup → sonnet.
- **Every task: faithful-regression test + tsc=0 + affected-suite green.** Deletions: proven zero-caller, update `architecture.md`.
- Connectors included (whatsapp + connector-pool); their prior work is complete.

**Work buckets the planner will decompose (distinct-file):**
- KES: lazy-loader · api/rate-limiter (per-IP dup) · result-merger.mergeResults (folded into the detectOverlaps task since same file).
- WIRE: sandbox `--sandbox` flag · result-merger.detectOverlaps → EVALUATE check · task-retry + exp-backoff (cascade wire) · routing-v2 (agent-cache + affinity, skill-first reorder) · whatsapp + connector-pool.

Execution is a **deckent dogfood**: deckent plans (AI) → spawns parallel workers → executes → evaluates → FIX → retro. This exercises the full lifecycle including the just-shipped planner-deps + cascade-skip hang-fixes on a real comprehensive workload.
