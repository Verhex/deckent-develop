import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import { runMissionScheduler, type DispatchFn } from '../../../../src/orchestra/autonomous/mission-store/mission-scheduler.js';
import {
  PRODUCTION_V2_RUNNER_REGISTRY,
  admitWorkItemBatch,
  bindMissionRunnerRegistry,
} from '../../../../src/orchestra/autonomous/mission-store/mission-kind-admission.js';
import type {
  MissionClaimFence,
  MissionDispatchClaim,
} from '../../../../src/orchestra/autonomous/mission-store/mission-types.js';

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

  it('passes the exact claim authority to dispatch and settles through that authority', async () => {
    const s = storeWith('authority', 1);
    let seen: MissionDispatchClaim | undefined;
    await runMissionScheduler(s, async (_item, claim) => {
      seen = claim;
      return { ok: true, reason: 'settled' };
    }, { poolSize: 1, intervalMs: 1, maxIterations: 10 });

    expect(seen).toMatchObject({
      schemaVersion: 1,
      workItemId: 'authority-w0',
      missionId: 'authority',
      claimedBy: 'scheduler',
    });
    expect(s.__rawGet(`SELECT status,claim_attempt_id,claim_fence_token_hash
      FROM work_items WHERE id='authority-w0'`)).toEqual({
      status: 'done',
      claim_attempt_id: null,
      claim_fence_token_hash: null,
    });
    s.close();
  });
});

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

describe('runMissionScheduler — robustness', () => {
  it('does not let a stale dispatch settlement overwrite a concurrent transition', async () => {
    const s = storeWith('stale-settle', 1);
    const summary = await runMissionScheduler(s, async (item) => {
      s.updateItemStatus(item.id, 'pending', { ok: false, reason: 'new authority required' });
      return { ok: true, reason: 'stale success' };
    }, { poolSize: 1, intervalMs: 1, maxIterations: 1 });

    expect(summary.dispatched).toBe(1);
    expect(s.listItems('stale-settle')[0]).toMatchObject({
      status: 'pending',
      lastResult: { ok: false, reason: 'new authority required' },
    });
    s.close();
  });

  it('does not dispatch or increment dispatched when the query-to-claim row revision turns stale', async () => {
    class RacingStore extends SqliteMissionStore {
      private raced = false;
      override claimItemWithAuthority(
        id: string,
        by: string,
        fence?: MissionClaimFence,
      ): MissionDispatchClaim | null {
        if (fence && !this.raced) {
          this.raced = true;
          this.updateItemStatus(id, 'pending', { ok: false, reason: 'concurrent transition' });
        }
        return super.claimItemWithAuthority(id, by, fence);
      }
    }
    const d = mkdtempSync(join(tmpdir(), 'sched-race-')); dirs.push(d);
    const s = new RacingStore(d); s.migrate();
    s.createMission({ id: 'race', kind: 'list', title: 'race', renderAs: 'checklist' });
    s.enqueueItem(admitWorkItemBatch([{
      id: 'race-task', missionId: 'race', kind: 'task', spec: { description: 'race' },
    }], PRODUCTION_V2_RUNNER_REGISTRY)[0]!);
    const calls: string[] = [];
    const runtimeRegistry = bindMissionRunnerRegistry(PRODUCTION_V2_RUNNER_REGISTRY, {
      task: async (item) => { calls.push(item.id); return { ok: true }; },
    });

    const summary = await runMissionScheduler(s, async () => ({ ok: false }), {
      poolSize: 1,
      intervalMs: 1,
      maxIterations: 1,
      runtimeRegistry,
    });

    expect(summary.dispatched).toBe(0);
    expect(calls).toEqual([]);
    expect(s.listItems('race')[0]!.status).toBe('pending');
    s.close();
  });

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

describe('runMissionScheduler — dependency safety', () => {
  it('never dispatches a dependent before its prerequisite is done, even with poolSize > 1', async () => {
    const s = storeWith('dep-order', 0);
    s.enqueueItem({ id: 'a', missionId: 'dep-order', kind: 'task' });
    s.enqueueItem({ id: 'b', missionId: 'dep-order', kind: 'task', dependsOn: ['a'] });
    const events: string[] = [];
    const dispatch: DispatchFn = async (item) => {
      events.push(`start:${item.id}`);
      if (item.id === 'a') await new Promise((resolve) => setTimeout(resolve, 5));
      events.push(`done:${item.id}`);
      return { ok: true };
    };

    const summary = await runMissionScheduler(s, dispatch, { poolSize: 4, intervalMs: 1, maxIterations: 100 });

    expect(events).toEqual(['start:a', 'done:a', 'start:b', 'done:b']);
    expect(summary.dispatched).toBe(2);
    expect(s.getMission('dep-order')!.status).toBe('completed');
    s.close();
  });

  it('propagates upstream failure transitively without dispatching downstream items', async () => {
    const s = storeWith('dep-fail', 0);
    s.enqueueItem({ id: 'a', missionId: 'dep-fail', kind: 'task' });
    s.enqueueItem({ id: 'b', missionId: 'dep-fail', kind: 'task', dependsOn: ['a'] });
    s.enqueueItem({ id: 'c', missionId: 'dep-fail', kind: 'task', dependsOn: ['b'] });
    const calls: string[] = [];

    await runMissionScheduler(s, async (item) => {
      calls.push(item.id);
      return { ok: false, reason: 'upstream failed' };
    }, { poolSize: 3, intervalMs: 1, maxIterations: 100 });

    expect(calls).toEqual(['a']);
    const byId = new Map(s.listItems('dep-fail').map((item) => [item.id, item]));
    expect(byId.get('b')!.status).toBe('blocked');
    expect(byId.get('b')!.lastResult?.reason).toBe('DEPENDENCY_FAILED: a');
    expect(byId.get('c')!.status).toBe('blocked');
    expect(byId.get('c')!.lastResult?.reason).toBe('DEPENDENCY_FAILED: b');
    expect(s.getMission('dep-fail')!.status).toBe('failed');
    s.close();
  });

  it('fails a cycle and settles the mission without invoking dispatch', async () => {
    const s = storeWith('dep-cycle', 0);
    s.enqueueItem({ id: 'a', missionId: 'dep-cycle', kind: 'task', dependsOn: ['b'] });
    s.enqueueItem({ id: 'b', missionId: 'dep-cycle', kind: 'task', dependsOn: ['a'] });
    let calls = 0;

    const summary = await runMissionScheduler(s, async () => {
      calls++;
      return { ok: true };
    }, { poolSize: 2, intervalMs: 1, maxIterations: 100 });

    expect(calls).toBe(0);
    expect(summary.dispatched).toBe(0);
    expect(s.listItems('dep-cycle').every((item) => item.status === 'failed')).toBe(true);
    expect(s.getMission('dep-cycle')!.status).toBe('failed');
    s.close();
  });

  it('never dispatches an approval-required item when no coordinator is composed', async () => {
    const s = storeWith('approval-hold', 0);
    s.enqueueItem({
      id: 'guarded', missionId: 'approval-hold', kind: 'task',
      policy: 'approval-required', spec: { description: 'must wait' },
    });
    const calls: string[] = [];

    const summary = await runMissionScheduler(s, async (item) => {
      calls.push(item.id);
      return { ok: true };
    }, { poolSize: 2, intervalMs: 1, maxIterations: 2 });

    expect(calls).toEqual([]);
    expect(summary.dispatched).toBe(0);
    expect(s.listItems('approval-hold')[0]!.status).toBe('pending');
    s.close();
  });
});
