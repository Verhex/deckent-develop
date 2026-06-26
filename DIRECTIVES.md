# DIRECTIVES — Sprint: HALF-WIRED FEATURE DISPOSITION (comprehensive dogfood)

## Goal
Deliver every decision from the half-wired-feature brainstorm in ONE sprint:
WIRE the valuable built-but-unwired capabilities, KES the genuinely-dead ones, all in parallel.
Spec of record: `docs/superpowers/specs/2026-06-26-halfwired-feature-disposition-design.md` (no ADR
references — the ADR set is being overhauled; decisions stand on capability merit). The planner-deps
normalization + cascade-skip hang-fixes are live, so dependency pipelines and parallel waves are safe.

## Binding rules (apply to EVERY task)
- **Distinct-file partition.** No two tasks may write the same file. Shared core files
  (`src/orchestra/sprint-phases.ts`, `src/orchestra/sprint-spawner.ts`, `src/core/routing-engine.ts`,
  `src/cli/commands/start.ts`) are each owned by AT MOST ONE task. Same-file work = one task.
- **Behaviour-changing capabilities are flag-gated, default-OFF** (task-retry, agent-cache,
  routing-affinity) → product byte-identical until enabled. Config flags validated in `config.ts`.
- **Core / behaviour-changing tasks → opus model**; mechanical KES/cleanup → sonnet.
- **Every task: faithful-regression test (pre-fix RED / post-fix GREEN) + `tsc --noEmit` clean +
  the affected test suite green.** Deletions: prove zero production caller by grep first; update
  `docs/architecture/architecture.md` if it references the removed module. ESM `.js` imports. Hermetic
  tests (tmpdir, async spawn, no spawnSync, no HOME-leak).
- No `process.cwd()` path construction; use `join(root, …)`.

## Work items (planner: decompose into distinct-file parallel tasks + dependencies)

### KES (mechanical — sonnet; verify zero-caller by repo-wide grep before deleting)
1. **KES `src/core/lazy-loader.ts`** + its test — generic util, zero consumer (proven). Remove both.
2. **KES `src/api/rate-limiter.ts` `ApiRateLimiter`** (per-IP) + its test — true duplicate of the live
   `SlidingWindowRateLimiter` in `src/api/server.ts`. Confirm nothing imports it (it is self-contained;
   `server.ts` uses its own inline limiter). Remove the dead module.

### WIRE (core / behaviour-changing — opus; flag-gated default-off where noted)
3. **result-merger split** (`src/orchestra/result-merger.ts` + EVALUATE wire) — KES `mergeResults`
   (superseded by the inline sprint-reporter aggregation) and WIRE `detectOverlaps` as a small
   POST-execution check in the EVALUATE phase (`src/orchestra/sprint-phases.ts`): after workers
   complete, detect files modified by >1 worker (actual overlap, distinct from the pre-spawn
   `detectScopeCollisions`) and emit a `BRAIN→AUDITOR:WORKER_OVERLAP` audit event. Keep the
   `detectOverlaps` logic; drop `mergeResults`. (One task owns both result-merger.ts and the
   sprint-phases.ts EVALUATE wire to keep it single-file-owner per shared file.)
4. **sandbox `--sandbox` flag** (`src/cli/commands/start.ts` + backend selection) — wire the
   already-built `SandboxSpawnBackend`/`createSandboxBackend` so `deckent start --sandbox` selects it
   (memory-cap + path-jail + optional net-block). "No-Docker lightweight isolation tier." Default off.
5. **task-retry WIRE + exponential backoff** (`src/orchestra/task-retry.ts` + cascade wire in
   `src/orchestra/sprint-spawner.ts`) — connect the cascade transient-retry decision
   (RUNTIME/AMBIGUOUS → shouldRetry) to `createRetryTask`: on a transient failure with
   retryCount < MAX, re-queue the task (`-rN`, PENDING, backoff) instead of leaving it failed.
   Replace the flat 2-level backoff with exponential (e.g. 5s → 30s → 120s). Flag-gated default-off
   (`retry_transient_failures`). Distinct from FIX-phase (CODE → fix-worker) and runtime-extension.
6. **routing-v2 (agent-cache + skill→agent affinity)** (`src/core/routing-engine.ts` +
   `src/core/activation-engine.ts` + `src/core/agent-cache.ts` + `src/core/config-types.ts` +
   `src/core/config.ts`) — reorder `routeTaskV2` to select skills BEFORE the agent (skills do not
   depend on the agent), then thread the affinity context `{agentId, assignedSkills, enabled}` into
   the `evaluateActivation` calls so a task's skill can boost its specialist agent. Wire
   `AgentSelectionCache` to memoize `selectBestAgent` (cache key INCLUDES the selected skills, so it
   stays correct when affinity is on; clear on pool/config change). Two flags, both default-off
   (`routing.skill_agent_affinity`, `routing.agent_cache`). Routing-balance validation is a follow-up;
   ship default-off (byte-identical). This is one task (shared routing files).

### WIRE (connectors — coordinated work complete)
7. **whatsapp connector** (`src/connectors/connector-bootstrap.ts` + `src/connectors/whatsapp.ts`) —
   add `'whatsapp'` to the bootstrap SUPPORTED list + dynamic-load path so it is selectable.
8. **connector-pool** (`src/connectors/connector-pool.ts` + its consumer) — wire `ConnectorPool`
   so broadcast-to-all-channels is reachable (a notify path that fans out to every active connector).

## Out of scope (deferred epics — do NOT touch)
- `src/core/rate-limiter.ts` `TenantRateLimiter` (per-tenant) — enterprise/MOD-SPLIT epic.
- sandbox elevation (seccomp/cgroups/namespace) — enterprise-isolation epic.
- routing-affinity default-ON — needs balance validation first.

**Expected:** parallel distinct-file tasks across KES + WIRE; core tasks on opus, cleanup on sonnet;
each faithful-tested; `tsc` clean; affected suites green. Sprint exercises the full lifecycle
(AI-plan → parallel spawn → execute → evaluate → FIX → retro) as a real dogfood.
