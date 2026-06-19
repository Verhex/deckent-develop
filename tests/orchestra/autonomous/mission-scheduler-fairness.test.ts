import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import { runMissionScheduler, type DispatchFn } from '../../../src/orchestra/autonomous/mission-store/mission-scheduler.js';

// ── tmpdir lifecycle (hermetic — no project/HOME state) ──────────────────
const dirs: string[] = [];
function freshStore(): SqliteMissionStore {
  const d = mkdtempSync(join(tmpdir(), 'sched-fair-')); dirs.push(d);
  const s = new SqliteMissionStore(d); s.migrate();
  return s;
}
/** Seed a tenant mission with N task items (ids `${tenant}-w{i}`). */
function seedTenant(s: SqliteMissionStore, tenant: string, n: number): void {
  s.createMission({ id: `${tenant}-m`, kind: 'list', tenant, title: tenant, renderAs: 'checklist' });
  for (let i = 0; i < n; i++) s.enqueueItem({ id: `${tenant}-w${i}`, missionId: `${tenant}-m`, kind: 'task' });
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/**
 * Concurrency probe: a dispatch barrier that records, per tenant and globally,
 * the PEAK number of items in flight at the same time, plus a per-item dispatch
 * counter (race-freedom). Items are held with a small delay so the scheduler
 * fills every available slot before any settles.
 */
function makeProbe(store: SqliteMissionStore, holdMs = 12) {
  const active = new Map<string, number>();
  const peak = new Map<string, number>();
  const calls = new Map<string, number>();
  let concurrent = 0, peakConcurrent = 0;
  const dispatch: DispatchFn = async (item) => {
    calls.set(item.id, (calls.get(item.id) ?? 0) + 1);
    const tenant = store.getMission(item.missionId)!.tenant;
    concurrent++; peakConcurrent = Math.max(peakConcurrent, concurrent);
    const a = (active.get(tenant) ?? 0) + 1;
    active.set(tenant, a);
    peak.set(tenant, Math.max(peak.get(tenant) ?? 0, a));
    await new Promise((r) => setTimeout(r, holdMs)); // hold to force overlap
    active.set(tenant, (active.get(tenant) ?? 1) - 1);
    concurrent--;
    return { ok: true };
  };
  return {
    dispatch,
    peakOf: (t: string) => peak.get(t) ?? 0,
    get peakConcurrent() { return peakConcurrent; },
    dispatchedExactlyOnce: () => [...calls.values()].every((c) => c === 1),
    callCount: () => calls.size,
  };
}

describe('runMissionScheduler — per-tenant fairness cap', () => {
  it('(a) caps each tenant at perTenantPoolSize and lets tenants progress in parallel', async () => {
    const s = freshStore();
    seedTenant(s, 'acme', 4);
    seedTenant(s, 'globex', 4);
    const probe = makeProbe(s);

    const summary = await runMissionScheduler(s, probe.dispatch, {
      poolSize: 4, perTenantPoolSize: 2, intervalMs: 1, maxIterations: 500,
    });

    // Per-tenant concurrency never exceeded the cap.
    expect(probe.peakOf('acme')).toBeLessThanOrEqual(2);
    expect(probe.peakOf('globex')).toBeLessThanOrEqual(2);
    // Both tenants ran simultaneously: reaching 4 concurrent with a per-tenant
    // ceiling of 2 is ONLY possible as 2 acme + 2 globex (no starvation).
    expect(probe.peakConcurrent).toBe(4);
    // Every item settled done, each dispatched exactly once (race-free).
    expect(s.listItems('acme-m').every((i) => i.status === 'done')).toBe(true);
    expect(s.listItems('globex-m').every((i) => i.status === 'done')).toBe(true);
    expect(probe.callCount()).toBe(8);
    expect(probe.dispatchedExactlyOnce()).toBe(true);
    expect(summary.dispatched).toBe(8);
    s.close();
  });

  it('(a2) a flooding tenant cannot starve another (more items than poolSize)', async () => {
    // acme floods 10 items; globex has 1. With cap=1 + poolSize=4 acme may hold
    // at most 1 slot, so globex's single item must still get served promptly and
    // both missions complete — the real no-starvation guarantee.
    const s = freshStore();
    seedTenant(s, 'acme', 10);
    seedTenant(s, 'globex', 1);
    const probe = makeProbe(s);

    await runMissionScheduler(s, probe.dispatch, {
      poolSize: 4, perTenantPoolSize: 1, intervalMs: 1, maxIterations: 1000,
    });

    expect(probe.peakOf('acme')).toBeLessThanOrEqual(1);
    expect(probe.peakOf('globex')).toBeLessThanOrEqual(1);
    expect(s.getMission('acme-m')!.status).toBe('completed');
    expect(s.getMission('globex-m')!.status).toBe('completed');
    expect(probe.dispatchedExactlyOnce()).toBe(true);
    expect(probe.callCount()).toBe(11);
    s.close();
  });

  it('(b) perTenantPoolSize undefined → global-only behaviour unchanged (regression-guard)', async () => {
    // No cap: one tenant is free to fill the entire global pool — the exact
    // pre-cap (v1-default) behaviour the fairness cap is opt-in over.
    const s = freshStore();
    seedTenant(s, 'acme', 4);
    const probe = makeProbe(s);

    const summary = await runMissionScheduler(s, probe.dispatch, {
      poolSize: 4, intervalMs: 1, maxIterations: 500, // perTenantPoolSize omitted
    });

    expect(probe.peakOf('acme')).toBe(4);            // single tenant used ALL slots
    expect(probe.peakConcurrent).toBe(4);
    expect(s.listItems('acme-m').every((i) => i.status === 'done')).toBe(true);
    expect(probe.dispatchedExactlyOnce()).toBe(true);
    expect(summary.dispatched).toBe(4);
    s.close();
  });

  it('(c) single tenant + cap → concurrency bounded to the cap', async () => {
    const s = freshStore();
    seedTenant(s, 'acme', 4);
    const probe = makeProbe(s);

    await runMissionScheduler(s, probe.dispatch, {
      poolSize: 4, perTenantPoolSize: 2, intervalMs: 1, maxIterations: 500,
    });

    expect(probe.peakOf('acme')).toBe(2);            // cap < poolSize wins
    expect(probe.peakConcurrent).toBe(2);
    expect(s.listItems('acme-m').every((i) => i.status === 'done')).toBe(true);
    expect(probe.dispatchedExactlyOnce()).toBe(true);
    s.close();
  });
});
