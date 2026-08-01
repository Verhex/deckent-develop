# Autonomous v2 — MissionScheduler (Design Spec)

- **Date:** 2026-06-19
- **Status:** approved (brainstorm → spec)
- **Owner:** Alperen
- **Scope:** The **concurrent runtime** that drives the `MissionStore` — a `runMissionScheduler` loop that claims due work items (atomically), dispatches them concurrently through a bounded pool, writes results back, and settles missions. **Additive-standalone:** built + tested in isolation with an injected `dispatch`; NOT wired into the live `deckent autonomous start` (that cutover is a later sub-project). The live `runtime-loop.ts` keeps running on `backlog.json` unchanged.
- **Builds on:** `docs/superpowers/specs/2026-06-19-autonomous-v2-store-design.md` (MissionStore, atomic `claimItem`, `MissionView`).
- **Cross-ref:** ADR-079 (Tier-0 unit-testable, injectable clock/sleep/signal), AUT-7 (the pool concurrency this subsumes), `execution-pool.ts` (`makeBoundedPool`).

## Problem

The `MissionStore` (built in sprint-293) is durable state with a race-free atomic `claimItem`, but nothing drives it. The live autonomous loop (`runtime-loop.ts` → `runAutonomousCycle`) processes one trigger per cycle and **awaits each fully** — inherently serial (AUT-7 incomplete: the bounded pool is unwired, and even wired the per-cycle await serializes). We need a runtime that:

- runs **concurrent** work (up to `pool_size` items at once),
- runs **Type-1 (list)** and **Type-2 (goal)** missions **simultaneously**, isolated by mission,
- is **race-free** under concurrency (and even under multiple scheduler instances),
- **settles missions** (mark completed/failed when all items terminal) so results can be delivered,
- is **execution-agnostic** (testable with a fake dispatch; the real task/sprint/capability/process execution is injected).

This subsumes AUT-7: the bounded-pool concurrency lands here, made race-free by the store's atomic claim — no `runAutonomousCycle` contract refactor is needed.

## Decision

A single new module `src/orchestra/autonomous/mission-store/mission-scheduler.ts` exposing `runMissionScheduler(store, dispatch, opts)`. **Serial-claim + concurrent-execute:** one loop claims due items one at a time (atomic, so a lost claim just re-queries — multi-instance safe), and submits each claimed item's execution to a bounded pool **without awaiting completion**. The pool bounds concurrency to `poolSize`. Item results are written back on settle; a mission is settled when all its items are terminal.

`dispatch` is injected — the scheduler never imports `runTask`/`runSprint`. The composition root (a later cutover step) wires the real execution; tests inject a fake. This keeps the scheduler small, hermetic, and decoupled.

**Additive-standalone:** this sub-project delivers the scheduler module + tests only. It does NOT touch `runtime-loop.ts`, `execute-dispatcher.ts`, `autonomous.ts`, or any live path. The existing autonomous suite stays green untouched. Wiring the scheduler into `deckent autonomous start` (real dispatch + backlog migration + replacing the live loop) is the **cutover sub-project**.

## Interfaces

```ts
import type { MissionStore, WorkItem, Mission, ResultLike } from './mission-types.js';

/** Executes one claimed work item. Injected — composition root wires the real
 *  runTask/runSprint/broker; tests inject a fake. Must resolve (never reject) on
 *  normal completion; a thrown error is caught by the scheduler and recorded as failed. */
export type DispatchFn = (item: WorkItem) => Promise<ResultLike>;

export interface MissionSchedulerOptions {
  poolSize: number;                       // max concurrent in-flight items
  intervalMs: number;                     // idle sleep when no due work + nothing in flight
  signal?: AbortSignal;                   // cooperative cancellation (drains in-flight, then returns)
  sleep?: (ms: number) => Promise<void>;  // injectable for hermetic tests
  now?: () => string;                     // injectable ISO clock
  maxIterations?: number;                 // test bound; undefined = run until signal/idle-drain
  onMissionSettled?: (mission: Mission) => void;  // hook for the future deliver-channel
}

export interface MissionSchedulerSummary {
  iterations: number;
  dispatched: number;                     // total items dispatched this run
  reason: 'aborted' | 'max_iterations' | 'drained';
}

export function runMissionScheduler(
  store: MissionStore,
  dispatch: DispatchFn,
  opts: MissionSchedulerOptions,
): Promise<MissionSchedulerSummary>;
```

## Loop semantics

```
inFlight = Set<Promise>            // concurrency bound IS this set vs poolSize (no separate pool)
iterations = 0, dispatched = 0

for (;;):
  if signal?.aborted:        await settleAll(inFlight); return { reason:'aborted', ... }
  if maxIterations reached:  await settleAll(inFlight); return { reason:'max_iterations', ... }
  iterations++

  // serial claim up to available slots (atomic — race-free, multi-instance safe)
  claimedThisTick = 0
  while inFlight.size < poolSize:
    due = store.queryDue({ limit: 1 })
    if due.length === 0: break
    const item = due[0]
    if (!store.claimItem(item.id, 'scheduler')) continue   // someone else won → re-query
    dispatched++; claimedThisTick++
    const p = Promise.resolve()
      .then(() => dispatch(item))
      .then(r  => store.updateItemStatus(item.id, r.ok ? 'done' : 'failed', r))
      .catch(e => store.updateItemStatus(item.id, 'failed', { ok:false, reason:String(e?.message ?? e) }))
      .finally(() => { inFlight.delete(p); checkMissionComplete(store, item.missionId, opts); })
    inFlight.add(p)

  // wait for progress
  if (inFlight.size === 0 && claimedThisTick === 0):
    if maxIterations !== undefined: return { reason:'drained', ... }  // tests: no work → stop
    await sleep(intervalMs)                                            // live: idle
  else:
    await Promise.race([...inFlight, sleep(0)])                        // a slot frees or yield
```

- **Race-freedom:** `claimItem` is the store's atomic `UPDATE ... WHERE status='pending'`. A single loop claims serially (no intra-loop race); the atomicity additionally protects against a second scheduler instance or external claimer. A lost claim (`false`) simply re-queries.
- **Concurrency bound:** the `while inFlight.size < poolSize` claim gate IS the bound — no separate `makeBoundedPool` is needed (it would double-bound). The loop stops claiming when the in-flight set is full and resumes when a slot frees; `dispatch` results are tracked via `inFlight` and never block the claim loop. (`execution-pool.ts` is left for the live cutover if a shared cross-loop pool is ever wanted; YAGNI here.)
- **`maxIterations`/`drained`:** in tests, when there is no due work and nothing in flight, the loop returns `drained` instead of sleeping forever — deterministic, hermetic. In live use (`maxIterations` undefined) it idles via `sleep(intervalMs)`.

## Mission settlement

```
function checkMissionComplete(store, missionId, opts):
  items = store.listItems(missionId)
  if items.length === 0: return
  if items.some(i => i.status !== 'done' && i.status !== 'failed'): return   // still active
  const failed = items.some(i => i.status === 'failed')
  const m = store.updateMissionStatus(missionId, failed ? 'failed' : 'completed',
                                      { ok: !failed, reason: failed ? 'one or more items failed' : 'all items done' })
  store.setMissionProgress(missionId, { done: items.filter(i=>i.status==='done').length, total: items.length })
  if (opts.onMissionSettled) opts.onMissionSettled(store.getMission(missionId)!)
```

A mission settles **completed** when every item is `done`, **failed** when any item is `failed`. The `onMissionSettled` hook is where the future deliver-channel (notify user/authority via `deliverTo`/`MissionView`) attaches — out of scope here; the scheduler only marks state + fires the hook.

## Concurrent Type-1 / Type-2

`queryDue` surfaces pending items across **all** missions (FIFO by creation, optional tenant filter). The scheduler is mission-agnostic when claiming — items from a Type-1 `list` mission and a Type-2 `goal` mission run **concurrently in the same pool**, isolated only by their `missionId` writeback. No mission starves another beyond `poolSize` fairness (FIFO). This is the "two capabilities run simultaneously" requirement, delivered by a single scheduler over the shared store.

> Type-2's *"work until the goal is done"* semantics (regenerating new work items toward a goal, acceptance evaluation) is a **separate sub-project**. This scheduler runs whatever items exist; it does not itself author new goal items.

## Error handling

- `dispatch` that **throws** → caught → item `failed` with the error message (never crashes the loop).
- `dispatch` that resolves `{ok:false}` → item `failed` with its reason.
- A `claimItem` returning `false` (race lost) → skip + re-query (no error).
- `signal` abort → stop claiming, **drain** in-flight (`await settleAll`), return `aborted` — no item is abandoned mid-flight.
- Store write errors inside `checkMissionComplete`/writeback propagate from `better-sqlite3` synchronously; wrap the settlement writeback in a try/catch that logs and continues (a single mission's settlement failure must not kill the loop) — fail-safe, mirroring the live loop's observer-tick guard.

## Testing (hermetic — tmpdir store, injected dispatch/sleep/signal)

- **Concurrency** — seed a mission with 5 items, `poolSize=3`, a `dispatch` that blocks on a barrier and records concurrent entries; assert **at most 3** run concurrently and all 5 eventually `done`.
- **Race-free with the real store** — same, asserting each item dispatched **exactly once** (no double-dispatch) via a per-item call counter.
- **Mission settlement** — all items `done` → mission `completed` + `onMissionSettled` fired once; one item `dispatch` returns `{ok:false}` → mission `failed`.
- **Dispatch throws** → item `failed` with the message; loop continues to the next item.
- **Abort drains** — abort mid-run with items in flight → returns `aborted` after in-flight settle; no item left `running`.
- **Idle/drained** — empty store + `maxIterations` set → returns `drained` without hanging.
- **Type-1 + Type-2 concurrency** — two missions' items interleave in one run; both settle.
- `tsc --noEmit` clean; existing autonomous suite untouched (additive — no live file modified).

## Out of scope (subsequent sub-projects)

- **Cutover** — wiring `runMissionScheduler` into `deckent autonomous start` (real `dispatch` = runTask/runSprint/broker, backlog→store migration at boot, replacing `runtime-loop.ts`).
- **Type-2 goal semantics** — authoring new work items toward a goal + acceptance ("done?") evaluation.
- **Deliver-channel** — the `onMissionSettled` consumer that notifies user/authority (`deliverTo`, `MissionView` stream).
- **Enterprise** — multi-tenant fairness/quotas beyond FIFO + `poolSize`.
