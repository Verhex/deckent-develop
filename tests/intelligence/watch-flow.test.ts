import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CapabilityRegistry } from '../../src/core/capability-broker.js';
import { FlowRegistry } from '../../src/core/flow-registry.js';
import { FlowScheduler } from '../../src/core/flow-scheduler.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import {
  deterministicOccurrenceIds,
  registerWatchFlow,
  runWatchFlow,
  WATCH_FLOW_CRON,
  WATCH_FLOW_ID,
  WATCH_FLOW_TIMEZONE,
  type WatchFlowCursorStore,
} from '../../src/intelligence/watch-flow.js';
import {
  registerWatchCapability,
  WATCH_CAPABILITY_ID,
  type WatchCapabilityBinding,
} from '../../src/intelligence/watch-capability.js';
import type { WatchSignal } from '../../src/intelligence/watch-service.js';
import { SqliteMissionStore } from '../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';

const SOURCE = {
  sourceId: 'release',
  kind: 'official-release',
  url: 'https://official.example.test/releases',
  format: 'github-release-json',
} as const;

const SIGNAL: WatchSignal = {
  signalId: 'watch-flow-signal',
  competitor: 'OpenAI Codex',
  eventType: 'Capability release',
  source: 'https://official.example.test/v2',
  publicationDate: '2026-08-25T06:00:00Z',
  affectedCapability: 'capability-authority',
  competitorStatus: 'LIVE_PROVEN',
  evidenceRefs: ['https://official.example.test/v2'],
  dimensions: { 'protocol/interop': 'Adds an interoperable protocol.' },
  previousByDimension: { 'protocol/interop': 'PARITY' },
  confidence: 0.9,
  action: 'Open an adapter spike.',
};

const directories: string[] = [];
const memoryStores: MemoryStore[] = [];
const missionStores: SqliteMissionStore[] = [];

afterEach(() => {
  for (const store of memoryStores.splice(0)) store.close();
  for (const store of missionStores.splice(0)) store.close();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('daily intelligence watch flow', () => {
  it('registers the canonical Istanbul schedule and routes through the capability', async () => {
    const fixture = createFixture();
    const capabilityInvoke = vi.spyOn(fixture.capabilities, 'invoke');

    const flow = registerWatchFlow(fixture.flows, {
      createdAt: new Date('2026-08-24T06:00:00.000Z'),
    });
    expect(flow).toMatchObject({
      id: WATCH_FLOW_ID,
      cronExpr: WATCH_FLOW_CRON,
      timezone: WATCH_FLOW_TIMEZONE,
      action: WATCH_CAPABILITY_ID,
    });

    const results = await runWatchFlow({
      ...fixture.runOptions,
      now: new Date('2026-08-25T06:00:00.000Z'),
    });
    expect(results).toHaveLength(1);
    expect(capabilityInvoke).toHaveBeenCalledWith({
      capability: WATCH_CAPABILITY_ID,
      args: { sources: [SOURCE], dryRun: false },
    });
  });

  it('replays a crash after mission ingest to identical ids without duplicate effects', async () => {
    const fixture = createFixture();
    registerWatchFlow(fixture.flows, {
      createdAt: new Date('2026-08-24T06:00:00.000Z'),
    });
    const occurrence = new Date('2026-08-25T06:00:00.000Z');
    const expected = deterministicOccurrenceIds(WATCH_FLOW_ID, occurrence);
    const crash = vi.fn(() => { throw new Error('injected crash'); });

    await expect(runWatchFlow({
      ...fixture.runOptions,
      now: occurrence,
      afterMissionInsert: crash,
    })).rejects.toThrow('injected crash');
    expect(fixture.cursors.get(WATCH_FLOW_ID)).toBeUndefined();
    expect(fixture.missions.listMissions()).toHaveLength(1);
    expect(fixture.notifications).toEqual([]);

    const replay = await runWatchFlow({ ...fixture.runOptions, now: occurrence });
    expect(replay).toHaveLength(1);
    expect(replay[0]).toMatchObject(expected);
    expect(fixture.missions.listMissions().map(({ id }) => id)).toEqual([
      expected.missionId,
    ]);
    expect(fixture.missions.listItems(expected.missionId).map(({ id }) => id))
      .toEqual([expected.workItemId]);
    expect(fixture.notifications).toHaveLength(1);
    expect(fixture.cursors.get(WATCH_FLOW_ID)?.toISOString())
      .toBe(occurrence.toISOString());

    expect(await runWatchFlow({ ...fixture.runOptions, now: occurrence })).toEqual([]);
    expect(fixture.notifications).toHaveLength(1);
  });

  it('catches up exactly once per missed slot across a simulated restart', async () => {
    const fixture = createFixture();
    registerWatchFlow(fixture.flows, {
      createdAt: new Date('2026-08-24T06:00:00.000Z'),
    });
    const now = new Date('2026-08-27T06:00:00.000Z');

    const first = await runWatchFlow({ ...fixture.runOptions, now });
    expect(first.map(({ occurrence }) => occurrence.toISOString())).toEqual([
      '2026-08-25T06:00:00.000Z',
      '2026-08-26T06:00:00.000Z',
      '2026-08-27T06:00:00.000Z',
    ]);
    expect(new Set(first.map(({ missionId }) => missionId)).size).toBe(3);
    expect(fixture.missions.listMissions()).toHaveLength(3);

    const restartedScheduler = new FlowScheduler();
    expect(await runWatchFlow({
      ...fixture.runOptions,
      scheduler: restartedScheduler,
      now,
    })).toEqual([]);
    expect(fixture.missions.listMissions()).toHaveLength(3);
  });

  it('dry-run writes no mission, watch event, notification, or flow cursor', async () => {
    const fixture = createFixture();
    registerWatchFlow(fixture.flows, {
      createdAt: new Date('2026-08-24T06:00:00.000Z'),
    });

    const result = await runWatchFlow({
      ...fixture.runOptions,
      now: new Date('2026-08-25T06:00:00.000Z'),
      dryRun: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.outcome).toMatchObject({ kind: 'completed', dryRun: true });
    expect(fixture.missions.listMissions()).toEqual([]);
    expect(fixture.notifications).toEqual([]);
    expect(fixture.cursors.get(WATCH_FLOW_ID)).toBeUndefined();
    expect(fixture.memory.getByType('custom')).toEqual([]);
  });
});

function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'deckent-watch-flow-'));
  directories.push(directory);
  const memory = new MemoryStore(join(directory, 'memory.db'));
  memoryStores.push(memory);
  const missions = new SqliteMissionStore(join(directory, 'missions'));
  missions.migrate();
  missionStores.push(missions);
  const notifications: string[] = [];
  const capabilities = new CapabilityRegistry();
  const binding: WatchCapabilityBinding = {
    memoryStore: memory,
    fetch: vi.fn(async () => new Response(JSON.stringify({
      name: 'Version 2',
      published_at: '2026-08-25T06:00:00Z',
      html_url: 'https://official.example.test/v2',
      body: 'bounded fixture',
    }), { headers: { etag: '"v2"' } })),
    now: () => new Date('2026-08-28T12:00:00.000Z'),
    readEvidence: async () => 'fixture evidence',
    interpretSource: () => [SIGNAL],
    outbox: {
      enqueueOwnerNotification: ({ id }) => {
        if (!notifications.includes(id)) notifications.push(id);
      },
    },
  };
  expect(registerWatchCapability(capabilities, binding).kind).toBe('admitted');

  const cursors = new MemoryCursorStore();
  const flows = new FlowRegistry(join(directory, 'flows'));
  return {
    memory,
    missions,
    notifications,
    capabilities,
    cursors,
    flows,
    runOptions: {
      registry: flows,
      scheduler: new FlowScheduler(),
      capabilityRegistry: capabilities,
      missionStore: missions,
      cursorStore: cursors,
      sources: [SOURCE],
    },
  };
}

class MemoryCursorStore implements WatchFlowCursorStore {
  private readonly cursors = new Map<string, Date>();

  get(flowId: string): Date | undefined {
    const value = this.cursors.get(flowId);
    return value === undefined ? undefined : new Date(value);
  }

  set(flowId: string, occurrence: Date): void {
    this.cursors.set(flowId, new Date(occurrence));
  }
}
