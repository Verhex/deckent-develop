# Autonomous v2 — MissionScheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: this plan is executed by a **deckent sprint** (one worker builds `mission-scheduler.ts` following all tasks below in order), then CC disk-verifies. Steps use checkbox (`- [ ]`) syntax. Build the file incrementally task-by-task; all tasks target the SAME file + test file.

**Goal:** Build `runMissionScheduler` — the additive, concurrent, race-free runtime that drives `MissionStore`: serial atomic-claim + concurrent execute via an injected `dispatch`, mission settlement, abort-drain.

**Architecture:** One module `src/orchestra/autonomous/mission-store/mission-scheduler.ts`. A single loop claims due items one at a time (`store.claimItem`, atomic), submits each to an injected `dispatch` without awaiting, bounds concurrency by an `inFlight` set vs `poolSize`, writes item results back on settle, and settles missions when all their items are terminal. Execution-agnostic (tests inject a fake `dispatch`). NOT wired into the live autonomous loop.

**Tech Stack:** TypeScript (ESM, Node16 — `.js` import suffixes), vitest. No new dependency. Injectable clock/sleep/signal (ADR-079 Tier-0).

## Global Constraints

- **ESM/Node16:** relative imports end in `.js`.
- **Additive only:** create `mission-scheduler.ts` + its test. Do NOT modify `runtime-loop.ts`, `execute-dispatcher.ts`, `autonomous.ts`, `backlog.ts`, or any live path. Existing autonomous suite stays green untouched.
- **Consumes the MissionStore built in sprint-293** — `import type { MissionStore, WorkItem, Mission, ResultLike } from './mission-types.js';`. Store methods used: `queryDue({limit})`, `claimItem(id, by)`, `updateItemStatus(id, status, result?)`, `listItems(missionId)`, `updateMissionStatus(id, status, result?)`, `setMissionProgress(id, progress)`, `getMission(id)`.
- **Race-freedom:** rely on `store.claimItem` (atomic). A `false` return = claim lost → re-query (never error).
- **No busy-spin:** when items are in flight, wait via `await Promise.race(inFlight)` (an item settling frees a slot) — NOT `sleep(0)`.
- **Fail-safe:** `dispatch` errors → item `failed` (loop never crashes); `checkMissionComplete` wrapped in try/catch.
- **Hermetic tests:** tmpdir `SqliteMissionStore`, injected `dispatch`/`signal`; cleanup in `afterEach`; no `spawnSync`, no real external state. Short real timers (`setTimeout` ≤5ms) are fine for forcing dispatch overlap.
- `tsc --noEmit` clean.

---

### Task 1: Types + core loop (serial-claim + concurrent-execute)

**Files:**
- Create: `src/orchestra/autonomous/mission-store/mission-scheduler.ts`
- Test: `tests/orchestra/autonomous/mission-store/mission-scheduler.test.ts`

**Interfaces:**
- Consumes: `MissionStore`, `WorkItem`, `Mission`, `ResultLike` from `./mission-types.js`; `SqliteMissionStore` from `./sqlite-mission-store.js` (tests only).
- Produces: `DispatchFn`, `MissionSchedulerOptions`, `MissionSchedulerSummary`, `runMissionScheduler(store, dispatch, opts)`.

- [ ] **Step 1: Write the failing test (concurrency bound + race-free)**

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import { runMissionScheduler, type DispatchFn } from '../../../../src/orchestra/autonomous/mission-store/mission-scheduler.js';

const dirs: string[] = [];
function storeWith(missionId: string, n: number): SqliteMissionStore {
  const d = mkdtempSync(join(tmpdir(), 'sched-')); dirs.push(d);
  const s = new SqliteMissionStore(d); s.migrate();
  s.createMission({ id: missionId, kind: 'list', title: missionId, renderAs: 'checklist' });
  for (let i = 0; i < n; i++) s.enqueueItem({ id: `${missionId}-w${i}`, missionId, kind: 'task' });
  return s;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('runMissionScheduler — concurrency', () => {
  it('runs at most poolSize items concurrently and settles all done', async () => {
    const s = storeWith('m', 4);
    let active = 0, peak = 0;
    const dispatch: DispatchFn = async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));   // hold to force overlap
      active--; return { ok: true };
    };
    const summary = await runMissionScheduler(s, dispatch, { poolSize: 2, intervalMs: 1, maxIterations: 100 });
    expect(peak).toBe(2);                            // exactly poolSize concurrent (4 items / pool 2)
    expect(s.listItems('m').every((i) => i.status === 'done')).toBe(true);
    expect(summary.dispatched).toBe(4);
    expect(summary.reason).toBe('drained');
    s.close();
  });

  it('dispatches each item exactly once (race-free claim)', async () => {
    const s = storeWith('m', 6);
    const calls = new Map<string, number>();
    const dispatch: DispatchFn = async (item) => { calls.set(item.id, (calls.get(item.id) ?? 0) + 1); return { ok: true }; };
    await runMissionScheduler(s, dispatch, { poolSize: 3, intervalMs: 1, maxIterations: 100 });
    expect([...calls.values()].every((c) => c === 1)).toBe(true);
    expect(calls.size).toBe(6);
    s.close();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/mission-store/mission-scheduler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `mission-scheduler.ts`**

```typescript
import type { MissionStore, WorkItem, Mission, ResultLike } from './mission-types.js';

/** Executes one claimed work item. Injected — composition root wires the real
 *  runTask/runSprint/broker; tests inject a fake. Resolve on completion; a thrown
 *  error is caught by the scheduler and recorded as failed. */
export type DispatchFn = (item: WorkItem) => Promise<ResultLike>;

export interface MissionSchedulerOptions {
  poolSize: number;
  intervalMs: number;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  now?: () => string;
  maxIterations?: number;
  onMissionSettled?: (mission: Mission) => void;
}

export interface MissionSchedulerSummary {
  iterations: number;
  dispatched: number;
  reason: 'aborted' | 'max_iterations' | 'drained';
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Settle a mission when all its items are terminal. Fail-safe (caller wraps in try/catch). */
function checkMissionComplete(store: MissionStore, missionId: string, opts: MissionSchedulerOptions): void {
  const items = store.listItems(missionId);
  if (items.length === 0) return;
  if (items.some((i) => i.status !== 'done' && i.status !== 'failed')) return; // still active
  const failed = items.some((i) => i.status === 'failed');
  store.updateMissionStatus(missionId, failed ? 'failed' : 'completed',
    { ok: !failed, reason: failed ? 'one or more items failed' : 'all items done' });
  store.setMissionProgress(missionId, { done: items.filter((i) => i.status === 'done').length, total: items.length });
  if (opts.onMissionSettled) {
    const m = store.getMission(missionId);
    if (m) opts.onMissionSettled(m);
  }
}

/** Concurrent, race-free runtime over a MissionStore. Serial atomic-claim + concurrent execute. */
export async function runMissionScheduler(
  store: MissionStore,
  dispatch: DispatchFn,
  opts: MissionSchedulerOptions,
): Promise<MissionSchedulerSummary> {
  const sleep = opts.sleep ?? defaultSleep;
  const inFlight = new Set<Promise<void>>();
  let iterations = 0;
  let dispatched = 0;

  for (;;) {
    if (opts.signal?.aborted) { await Promise.allSettled(inFlight); return { iterations, dispatched, reason: 'aborted' }; }
    if (opts.maxIterations !== undefined && iterations >= opts.maxIterations) {
      await Promise.allSettled(inFlight); return { iterations, dispatched, reason: 'max_iterations' };
    }
    iterations++;

    // serial claim up to free slots — atomic, race-free
    let claimedThisTick = 0;
    while (inFlight.size < opts.poolSize) {
      const due = store.queryDue({ limit: 1 });
      if (due.length === 0) break;
      const item = due[0]!;
      if (!store.claimItem(item.id, 'scheduler')) continue; // someone else won → re-query
      dispatched++; claimedThisTick++;
      const p: Promise<void> = Promise.resolve()
        .then(() => dispatch(item))
        .then((r) => store.updateItemStatus(item.id, r.ok ? 'done' : 'failed', r))
        .catch((e) => store.updateItemStatus(item.id, 'failed', { ok: false, reason: String((e as Error)?.message ?? e) }))
        .finally(() => { inFlight.delete(p); try { checkMissionComplete(store, item.missionId, opts); } catch { /* fail-safe */ } });
      inFlight.add(p);
    }

    if (inFlight.size > 0) {
      await Promise.race(inFlight);            // an item settles → a slot frees
    } else if (claimedThisTick === 0) {
      if (opts.maxIterations !== undefined) return { iterations, dispatched, reason: 'drained' };
      await sleep(opts.intervalMs);            // idle (live)
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/orchestra/autonomous/mission-store/mission-scheduler.test.ts`
Expected: PASS (2 tests). `peak===2`, all done, each dispatched once.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run lint`.
```bash
git add src/orchestra/autonomous/mission-store/mission-scheduler.ts tests/orchestra/autonomous/mission-store/mission-scheduler.test.ts
git commit -m "feat(autonomous-v2): MissionScheduler core loop — serial-claim + concurrent-execute"
```

---

### Task 2: Mission settlement

**Files:**
- Modify: `src/orchestra/autonomous/mission-store/mission-scheduler.ts` (no new code — `checkMissionComplete` already added in Task 1; this task adds its tests)
- Test: `tests/orchestra/autonomous/mission-store/mission-scheduler.test.ts`

**Interfaces:**
- Consumes: `runMissionScheduler`, `DispatchFn` (Task 1).
- Produces: (none new) — verifies `checkMissionComplete` behavior + `onMissionSettled`.

- [ ] **Step 1: Write the failing test**

```typescript
describe('runMissionScheduler — mission settlement', () => {
  it('marks mission completed when all items done; fires onMissionSettled once', async () => {
    const s = storeWith('m', 3);
    const settled: string[] = [];
    const dispatch: DispatchFn = async () => ({ ok: true });
    await runMissionScheduler(s, dispatch, {
      poolSize: 2, intervalMs: 1, maxIterations: 100,
      onMissionSettled: (m) => settled.push(`${m.id}:${m.status}`),
    });
    expect(s.getMission('m')!.status).toBe('completed');
    expect(s.getMission('m')!.progress).toEqual({ done: 3, total: 3 });
    expect(settled).toEqual(['m:completed']);     // fired exactly once
    s.close();
  });

  it('marks mission failed when any item fails', async () => {
    const s = storeWith('m', 2);
    const dispatch: DispatchFn = async (item) => (item.id.endsWith('w1') ? { ok: false, reason: 'boom' } : { ok: true });
    await runMissionScheduler(s, dispatch, { poolSize: 2, intervalMs: 1, maxIterations: 100 });
    expect(s.getMission('m')!.status).toBe('failed');
    expect(s.listItems('m').find((i) => i.id === 'm-w1')!.status).toBe('failed');
    s.close();
  });
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `npx vitest run tests/orchestra/autonomous/mission-store/mission-scheduler.test.ts`
Expected: PASS — `checkMissionComplete` (from Task 1) already implements this; the tests confirm it. If `onMissionSettled` fires more than once, that is a bug in Task 1's `checkMissionComplete` — it must early-return while any item is non-terminal, so it fires only on the final settle.

- [ ] **Step 3: Commit**

```bash
git add tests/orchestra/autonomous/mission-store/mission-scheduler.test.ts
git commit -m "test(autonomous-v2): MissionScheduler mission settlement (completed/failed + onMissionSettled)"
```

---

### Task 3: Error handling, abort-drain, idle, Type-1/Type-2 concurrency

**Files:**
- Modify: `src/orchestra/autonomous/mission-store/mission-scheduler.ts` (only if a test reveals a gap — the Task 1 code already handles these; this task is its verification)
- Test: `tests/orchestra/autonomous/mission-store/mission-scheduler.test.ts`

**Interfaces:**
- Consumes: `runMissionScheduler`, `DispatchFn` (Task 1).
- Produces: (none new) — verifies error/abort/idle/multi-mission behavior.

- [ ] **Step 1: Write the failing test**

```typescript
describe('runMissionScheduler — robustness', () => {
  it('a throwing dispatch marks the item failed; loop continues', async () => {
    const s = storeWith('m', 2);
    const dispatch: DispatchFn = async (item) => { if (item.id.endsWith('w0')) throw new Error('kaboom'); return { ok: true }; };
    await runMissionScheduler(s, dispatch, { poolSize: 2, intervalMs: 1, maxIterations: 100 });
    const items = s.listItems('m');
    expect(items.find((i) => i.id === 'm-w0')!.status).toBe('failed');
    expect(items.find((i) => i.id === 'm-w1')!.status).toBe('done');
    s.close();
  });

  it('abort drains in-flight and leaves no item running', async () => {
    const s = storeWith('m', 4);
    const controller = new AbortController();
    const dispatch: DispatchFn = async () => { controller.abort(); await new Promise((r) => setTimeout(r, 2)); return { ok: true }; };
    const summary = await runMissionScheduler(s, dispatch, { poolSize: 2, intervalMs: 1, signal: controller.signal, maxIterations: 100 });
    expect(summary.reason).toBe('aborted');
    expect(s.listItems('m').every((i) => i.status !== 'running')).toBe(true); // drained: done or still pending, never stuck running
    s.close();
  });

  it('empty store returns drained without hanging', async () => {
    const d = mkdtempSync(join(tmpdir(), 'sched-')); dirs.push(d);
    const s = new SqliteMissionStore(d); s.migrate();
    const summary = await runMissionScheduler(s, async () => ({ ok: true }), { poolSize: 2, intervalMs: 1, maxIterations: 100 });
    expect(summary.reason).toBe('drained');
    expect(summary.dispatched).toBe(0);
    s.close();
  });

  it('runs Type-1 (list) and Type-2 (goal) missions concurrently; both settle', async () => {
    const d = mkdtempSync(join(tmpdir(), 'sched-')); dirs.push(d);
    const s = new SqliteMissionStore(d); s.migrate();
    s.createMission({ id: 'list1', kind: 'list', title: 'L', renderAs: 'checklist' });
    s.createMission({ id: 'goal1', kind: 'goal', title: 'G', renderAs: 'goal' });
    s.enqueueItem({ id: 'list1-a', missionId: 'list1', kind: 'task' });
    s.enqueueItem({ id: 'goal1-a', missionId: 'goal1', kind: 'sprint' });
    await runMissionScheduler(s, async () => ({ ok: true }), { poolSize: 4, intervalMs: 1, maxIterations: 100 });
    expect(s.getMission('list1')!.status).toBe('completed');
    expect(s.getMission('goal1')!.status).toBe('completed');
    s.close();
  });
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `npx vitest run tests/orchestra/autonomous/mission-store/mission-scheduler.test.ts`
Expected: PASS (all groups). Task 1's `.catch` → failed, signal-check → aborted-drain, `maxIterations`+empty → drained, multi-mission `queryDue` → both settle.

> If the abort test leaves an item `running` (drain incomplete), the bug is in Task 1: the `signal.aborted` check must `await Promise.allSettled(inFlight)` BEFORE returning, so every dispatched item finishes its `updateItemStatus` writeback.

- [ ] **Step 3: Final verification + commit**

Run: `npm run lint` (tsc clean). Confirm the full module + existing suite:
`npx vitest run tests/orchestra/autonomous/` → all green (scheduler tests + sprint-293 mission-store tests + the existing autonomous suite, untouched).
```bash
git add tests/orchestra/autonomous/mission-store/mission-scheduler.test.ts src/orchestra/autonomous/mission-store/mission-scheduler.ts
git commit -m "test(autonomous-v2): MissionScheduler robustness — throw/abort-drain/idle/Type-1+Type-2"
```

---

## Self-Review (plan vs spec)

- **Spec coverage:** core loop (serial-claim + concurrent-execute, inFlight/poolSize bound) → Task 1; `DispatchFn`/options/summary types → Task 1; mission settlement (`checkMissionComplete` + `onMissionSettled`) → Task 1 code + Task 2 tests; concurrent Type-1/Type-2 → Task 3; error handling (throw→failed) + abort-drain + idle/drained → Task 1 code + Task 3 tests. The injectable `sleep`/`signal`/`now`/`maxIterations` (ADR-079 Tier-0) are in `MissionSchedulerOptions`.
- **Spec deviation (noted + intended):** the spec pseudocode's wait used `Promise.race([...inFlight, sleep(0)])`; the plan uses `Promise.race(inFlight)` when in-flight is non-empty (no busy-spin) — same behavior, more efficient. Documented in Global Constraints + the loop.
- **Additive guarantee:** only `mission-scheduler.ts` + its test are created; no live file touched → existing autonomous suite green (Task 3 final step verifies `tests/orchestra/autonomous/`).
- **Placeholder scan:** none — complete code in Task 1; Tasks 2-3 are tests against Task 1's code with concrete assertions.
- **Type consistency:** `DispatchFn = (item: WorkItem) => Promise<ResultLike>`, `MissionSchedulerOptions`, `MissionSchedulerSummary`, `runMissionScheduler(store, dispatch, opts)` are used identically across all tasks; store methods (`queryDue`/`claimItem`/`updateItemStatus`/`listItems`/`updateMissionStatus`/`setMissionProgress`/`getMission`) match the sprint-293 `MissionStore` interface exactly.
- **Out of scope (per spec):** cutover/real-dispatch wiring, Type-2 goal-authoring semantics, deliver-channel consumer of `onMissionSettled`, enterprise fairness.
