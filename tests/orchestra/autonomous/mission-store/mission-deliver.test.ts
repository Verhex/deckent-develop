import { describe, it, expect, vi } from 'vitest';
import { makeMissionDeliver, type MissionDeliverDeps, type MissionNotifyPayload } from '../../../../src/orchestra/autonomous/mission-store/mission-deliver.js';
import type { Mission } from '../../../../src/orchestra/autonomous/mission-store/mission-types.js';

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'test-mission',
    kind: 'list',
    status: 'completed',
    tenant: 'default',
    title: 'Test Mission',
    spec: null,
    createdBy: null,
    deliverTo: 'user@example.com',
    renderAs: 'checklist',
    progress: { done: 3, total: 3 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z',
    completedAt: '2026-01-01T00:01:00.000Z',
    lastResult: { ok: true },
    ...overrides,
  };
}

describe('makeMissionDeliver', () => {
  it('calls notify with correct payload when mission has deliverTo', () => {
    const calls: MissionNotifyPayload[] = [];
    const deps: MissionDeliverDeps = {
      notify: (payload) => { calls.push(payload); },
    };
    const handler = makeMissionDeliver(deps);
    const mission = makeMission({ deliverTo: 'alice@example.com', status: 'completed' });

    handler(mission);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.to).toBe('alice@example.com');
    expect(calls[0]!.status).toBe('completed');
    expect(typeof calls[0]!.title).toBe('string');
    expect(calls[0]!.title.length).toBeGreaterThan(0);
    expect(typeof calls[0]!.summary).toBe('string');
    expect(calls[0]!.summary.length).toBeGreaterThan(0);
  });

  it('calls notify with to=null when deliverTo is null (default channel)', () => {
    const calls: MissionNotifyPayload[] = [];
    const deps: MissionDeliverDeps = {
      notify: (payload) => { calls.push(payload); },
    };
    const handler = makeMissionDeliver(deps);
    const mission = makeMission({ deliverTo: null });

    handler(mission);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.to).toBeNull();
  });

  it('swallows (does not propagate) a synchronous throw from notify', () => {
    const deps: MissionDeliverDeps = {
      notify: () => { throw new Error('sync notify failure'); },
    };
    // makeMissionDeliver wraps synchronous throws inside the Promise path;
    // for sync throws we verify the handler itself does not throw.
    // (Real-world notify is typically async; sync throw is edge-case.)
    const handler = makeMissionDeliver(deps);
    const mission = makeMission();

    // Should not throw — handler must be fail-safe
    expect(() => handler(mission)).not.toThrow();
  });

  it('swallows a rejected Promise from notify (async fail-safe)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps: MissionDeliverDeps = {
      notify: async () => { throw new Error('async notify failure'); },
    };
    const handler = makeMissionDeliver(deps);
    const mission = makeMission();

    handler(mission);

    // Give the microtask queue time to process the rejection
    await new Promise((r) => setTimeout(r, 10));

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[mission-deliver]'),
      expect.stringContaining('async notify failure'),
    );
    consoleSpy.mockRestore();
  });

  it('passes the mission status (failed) correctly into the notify payload', () => {
    const calls: MissionNotifyPayload[] = [];
    const deps: MissionDeliverDeps = {
      notify: (payload) => { calls.push(payload); },
    };
    const handler = makeMissionDeliver(deps);
    const mission = makeMission({ status: 'failed', deliverTo: null });

    handler(mission);

    expect(calls[0]!.status).toBe('failed');
  });
});
