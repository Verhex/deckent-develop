// born-562 — mid-sprint cost-guard dispatch-gate loader (result-collector wire).
// Verifies loadCostGuardMonitor's DORMANT contract: disabled (the default) → no
// monitor at all (undefined → the wait-loop dispatch gate stays permanently
// open, zero behaviour change); enabled → a real monitor whose shouldStopDispatch
// starts false (nothing tripped yet) and can be stopped. The trip→stop machinery
// itself is covered by mid-sprint-cost-abort.test.ts; this covers the wire entry.
import { describe, it, expect, afterEach } from 'vitest';
import { loadCostGuardMonitor, costGuardShouldComplete } from '../../src/orchestra/result-collector.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';
import type { CostGuardMonitor } from '../../src/orchestra/sprint-phases.js';

function cfg(cost_guard?: { enabled: boolean; max_limit_cost_usd?: number }): ResolvedConfig {
  return { cost_guard } as unknown as ResolvedConfig;
}

describe('born-562 — cost-guard dispatch-gate loader (loadCostGuardMonitor)', () => {
  let started: CostGuardMonitor | undefined;
  afterEach(() => { started?.stop(); started = undefined; });

  it('DORMANT default (no cost_guard): returns undefined (gate stays open)', async () => {
    expect(await loadCostGuardMonitor('/tmp/x', 'sprint-a', cfg(undefined))).toBeUndefined();
  });

  it('DISABLED (cost_guard.enabled=false): returns undefined (inert)', async () => {
    expect(await loadCostGuardMonitor('/tmp/x', 'sprint-a', cfg({ enabled: false }))).toBeUndefined();
  });

  it('ENABLED but no threshold set: returns a monitor that never trips (max absent)', async () => {
    started = await loadCostGuardMonitor('/tmp/x', 'sprint-a', cfg({ enabled: true }));
    expect(started).toBeDefined();
    expect(started!.shouldStopDispatch()).toBe(false);
  });

  it('ENABLED with threshold: returns a started monitor, dispatch NOT stopped before any tick', async () => {
    started = await loadCostGuardMonitor('/tmp/x', 'sprint-a', cfg({ enabled: true, max_limit_cost_usd: 5 }));
    expect(started).toBeDefined();
    // No interval tick has fired (60s default) → guard has not tripped yet.
    expect(started!.shouldStopDispatch()).toBe(false);
    // stop() is idempotent + safe to call.
    started!.stop();
    started!.stop();
  });
});

describe('born-562 — cost-guard completion condition (costGuardShouldComplete)', () => {
  it('guard NOT stopped → always false (normal loop untouched, break never fires)', () => {
    expect(costGuardShouldComplete(false, 0, 5, 5)).toBe(false);
    expect(costGuardShouldComplete(false, 5, 5, 0)).toBe(false);
  });

  it('stopped BEFORE any dispatch (all still PENDING) → complete immediately', () => {
    // pending == total, collected == 0 → 0 >= 5 - 5 → true (all finalize NOT_DISPATCHED)
    expect(costGuardShouldComplete(true, 0, 5, 5)).toBe(true);
  });

  it('stopped with in-flight tasks still running → wait (false)', () => {
    // total=5, pending=2 (never dispatched), 3 in-flight, only 1 reported → 1 >= 5-2(=3)? no
    expect(costGuardShouldComplete(true, 1, 5, 2)).toBe(false);
    expect(costGuardShouldComplete(true, 2, 5, 2)).toBe(false);
  });

  it('stopped and every in-flight task has reported → complete (true)', () => {
    // total=5, pending=2, in-flight=3 all reported → collected 3 >= 5-2(=3) → true
    expect(costGuardShouldComplete(true, 3, 5, 2)).toBe(true);
    // more collected than the floor stays true (defensive >=)
    expect(costGuardShouldComplete(true, 4, 5, 2)).toBe(true);
  });

  it('stopped with no PENDING left (all dispatched) mirrors the normal all-collected break', () => {
    expect(costGuardShouldComplete(true, 5, 5, 0)).toBe(true);
    expect(costGuardShouldComplete(true, 4, 5, 0)).toBe(false);
  });
});
