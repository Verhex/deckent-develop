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
