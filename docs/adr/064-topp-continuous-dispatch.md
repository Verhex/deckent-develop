# ADR-064: TOPP — Continuous Dispatch (Wave-Barrier Removal)

**Status:** accepted

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-20

**Sprint:** Sprint 178 (Task 5 / fix-007 — TOPP B+C implementation)

**Supersedes (in part):** ADR-045 §3 "Wave-Based Execution Semantics" —
the wave-barrier between Wave N completion and Wave N+1 spawn is replaced
by continuous, per-tick re-evaluation.

---

## Status

accepted — contract written before the unified dispatch wire, per
ADR-036 ADR Governance discipline.

---

## Context

ADR-045 §3 codified "wave-based execution": when
`dependency_pipeline_enabled: true`, Brain spawns tasks in topological
waves and only re-evaluates eligible PENDING tasks after Wave N completes.
The runtime wire (`respawnEligibleTasks`) lands one wave at a time, so
Wave N+1 cannot start until at least one Wave N task completes AND the
main loop reaches the next `await maybeRespawn()` call.

`waitForResults` currently maintains two parallel spawn paths:

```ts
const newlyCollected = await collectResults();
await processQueue(newlyCollected);  // legacy FIFO drain
await maybeRespawn();                // dep-pipeline re-eval
```

These paths are mutually exclusive at the data level (the FIFO queue only
has entries when `dependency_pipeline_enabled === false`; otherwise the
queue is empty and only `maybeRespawn` does work). The dual-call sequence
is a vestigial structure from before the wave-pipeline existed and creates
three concrete problems:

1. **Sprint 179 fan-out blocked.** Sprint 179 plans 12 parallel tasks
   with shallow dep chains. Under wave-barrier semantics, the throughput
   collapses to ⌈12/maxWorkers⌉ ticks — for `maxWorkers=2` that is 6
   serial wave boundaries before all 12 finish. Continuous dispatch
   collapses that to a single ladder fill + reactive spawn loop.

2. **Code duplication.** `processQueue` and `maybeRespawn` re-derive
   roughly the same predicate ("which PENDING task is eligible given the
   current set of DONE deps?") in two different forms. Bugs (Sprint
   161/164/165 hayalet-task family) repeatedly arose because the two
   paths diverged on edge cases (deps in the queue tail, force-rescan
   races, the `assignedTaskIds` idempotency guard).

3. **No documented rollback.** When a wave-barrier removal lands in
   production and breaks an unforeseen edge case, there is no flag-flip
   to restore prior behavior. The operator's only escape is a hot revert.

---

## Decision

We introduce a single, flag-agnostic dispatch entry — `planDispatch(state)`
(pure planner) plus `dispatchTick(newlyCollected)` (closure-scoped async
wrapper inside `waitForResults`). The two existing internal helpers
(`processQueue` + `maybeRespawn`) are no longer invoked directly from
the main loop; `dispatchTick` calls them in sequence and supplements them
with the `DECKENT_LEGACY_FIFO=1` rollback escape.

### `planDispatch(state) → DispatchPlan`

Pure function. Inputs: sprint state, config, maxWorkers, assigned/
collected sets, FIFO queue, newly-completed task IDs. Outputs:
`{ toSpawn: Task[]; toKill: string[]; mode: 'continuous' | 'legacy-fifo' }`.

Two modes:

- **continuous** (default — applies whether `dependency_pipeline_enabled`
  is true or false): every tick re-evaluates eligible PENDING tasks.
  Drains the FIFO queue first (respecting deps when the pipeline flag is
  on), then fills remaining slots from PENDING tasks via the standard
  dep-aware filter. The result: as soon as ANY task completes, the next
  eligible task spawns within the same tick. There is no implicit
  barrier between waves.

- **legacy-fifo** (active when `DECKENT_LEGACY_FIFO=1`): drains exactly
  one queue entry per completed task ID and emits a `toKill` for the
  freed slot. This is the pre-Sprint-178 contract preserved verbatim as
  an escape hatch.

### `dispatchTick(newlyCollected)` — internal closure

Wraps `planDispatch` plus the actual spawn/kill calls. Lives inside
`waitForResults` because it depends on closure state
(`spawnIfNotAssigned`, `queueBackend`, etc.). When
`DECKENT_LEGACY_FIFO=1`, `dispatchTick` short-circuits to the legacy
`processQueue` path and skips `maybeRespawn`, preserving exact pre-Sprint
178 semantics.

### TOPP C — Predecessor digest in `buildDependenciesBlock`

Already shipped in `prompt-god-template.ts` via `formatDependencyEntry()`
(Sprint 146 Task 005). When a Wave N+1 task spawns, its prompt's
"## Dependencies" section embeds a per-predecessor digest:

```
## Dependency pred-1 (DONE)
- Files: src/foo.ts, src/bar.ts (+42/-7)
- Notes: <truncated 500 chars from predecessor result>
```

ADR-064 adopts this format as the official TOPP C contract and the
`tests/orchestra/topp-continuous-dispatch.test.ts` G7 test pins it.

---

## Consequences

### Easier
- Sprint 179 12-task fan-out runs with continuous spawn — no per-wave
  barrier. Throughput approaches `maxWorkers` regardless of wave depth.
- `processQueue` and `maybeRespawn` remain as internal back-compat
  shims but the call site is now a single function call, simplifying
  future refactors.
- Operators can pin pre-Sprint-178 behavior without a source revert:
  `DECKENT_LEGACY_FIFO=1` flips the mode.

### Harder
- The dispatch state surface (`DispatchState`) is larger than either of
  the two functions it replaces. Tests now have to construct sprint +
  config + assigned/collected sets rather than mock a single closure.
- The continuous mode does more work per tick (PENDING re-scan even when
  no completion happened). Mitigation: the inner loop is O(n) over
  `sprint.tasks` and breaks early once `slotsAvailable` is hit — the
  dominant cost is FS polling, not scheduling.

### Risks
- Wave-barrier regressions on user projects with very large sprints
  (>50 tasks). Mitigation: `DECKENT_LEGACY_FIFO=1` escape hatch is the
  documented rollback. Telemetry: the `mode` field on `DispatchPlan` is
  logged via debugLog so post-mortems can confirm which path ran.

---

## Alternatives Considered

1. **Inline both helpers into the main loop** — rejected. The two
   helpers are public exports referenced by existing tests
   (`task-queue.test.ts`, `result-collector.test.ts`) and removing them
   would break those suites. Keeping them as internal shims preserves
   the public API surface.

2. **Drop the FIFO queue entirely** — rejected. The
   `dependency_pipeline_enabled: false` mode is the documented contract
   for user projects that opt out of wave scheduling (ADR-045 §2). The
   queue is part of that contract.

3. **Replace `respawnEligibleTasks` with a new function** — rejected.
   `respawnEligibleTasks` does more than spawn — it writes events, emits
   metrics, writes sprint checkpoints. Replacing it would require
   re-implementing five orthogonal concerns. Wrapping it inside
   `dispatchTick` preserves all of those side-effects.

---

## Rollout

- Land in Sprint 178 as Task 005 (continued as 178-007-fix).
- `DECKENT_LEGACY_FIFO=1` ships disabled by default.
- Sprint 179 12-task fan-out is the first dogfood of continuous mode.
- If Sprint 179 surfaces a regression, the rollback is `export
  DECKENT_LEGACY_FIFO=1` in the environment — no source revert needed.

---

## References

- ADR-045 §3 (wave-barrier semantics — superseded in part)
- ADR-035 (verification protocol)
- ADR-036 (ADR Governance)
- Sprint 178 plan: `docs/superpowers/plans/2026-05-22-sprint-178-modernization-topp.md`
- Tests: `tests/orchestra/topp-continuous-dispatch.test.ts` (G1-G10 matrix)

---

## Amendment — Sprint 281 (2026-06-11, ADR-review, full code-verification)

**Classification: BOTH** (continuous throughput user-projelerinde aynı; `DECKENT_LEGACY_FIFO` operatör-escape'i ürün özelliği).

**✅ Davranışsal sözleşme CANLI (re-verified + canlı-kanıt):** `dispatchTick` ana-loop'un tek dispatch-girişi (`result-collector.ts:938` initial-pass + `:1005` per-tick); continuous=default; `DECKENT_LEGACY_FIFO=1` escape gerçek (`:757` maybeRespawn short-circuit → legacy-FIFO korunur). Sprint 279/280 canlı-kanıt: bağımlılıklar temizlendikçe anında spawn, wave-barrier yok (ADR-045 Sprint-281 amendment'le tutarlı).

**🔴 Mimari sapma — planner-bypass (tested-but-unwired):** ADR'nin "dispatchTick, `planDispatch`'e (pure) delege eder" iddiası ve `result-collector.ts:180` yorumu **koda uymuyor**: `dispatchTick` gövdesi yalnız `await processQueue(...); await maybeRespawn();` — `planDispatch(...)` (:227, `DispatchPlan`/`mode` döndüren saf planlayıcı) **runtime'da 0-caller**. G1-G10 testleri saf-modeli pinler; canlı yol kararları `processQueue`/`maybeRespawn` içinde imperatif verir → **test-vs-runtime sapma riski** (testler yeşilken canlı semantik sessizce farklılaşabilir). Bu, W-K AS-1'in "planDispatch wire" maddesinin hâlâ inmediği anlamına gelir. Fix: MASTER-PLAN "ADR-Analizi Türetilen İşler → **ADR-064-W**" — dispatchTick'i `planDispatch` üzerinden geçir (pinlenen model = canlı yol), `:180` yorumunu o zamana dek düzelt-veya-işaretle. md+db senkron (Alperen ADR-review).
