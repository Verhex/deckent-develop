import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerIntelligence } from '../../src/cli/commands/intelligence.js';
import { CapabilityRegistry } from '../../src/core/capability-broker.js';
import { FlowRegistry } from '../../src/core/flow-registry.js';
import { FlowScheduler } from '../../src/core/flow-scheduler.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import { SqliteMissionStore } from '../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import {
  registerWatchCapability,
  type WatchCapabilityBinding,
} from '../../src/intelligence/watch-capability.js';
import { registerWatchFlow, runWatchFlow } from '../../src/intelligence/watch-flow.js';
import type { WatchSignal } from '../../src/intelligence/watch-service.js';

const SOURCE = {
  sourceId: 'official-release',
  kind: 'official-release',
  url: 'https://official.example.test/releases',
  format: 'github-release-json',
} as const;

const SIGNAL: WatchSignal = {
  signalId: 'closure-signal',
  competitor: 'OpenAI Codex',
  eventType: 'Capability release',
  source: 'https://official.example.test/releases/v2',
  publicationDate: '2026-08-25T06:00:00.000Z',
  affectedCapability: 'capability-authority',
  competitorStatus: 'LIVE_PROVEN',
  evidenceRefs: ['https://official.example.test/releases/v2'],
  dimensions: { 'protocol/interop': 'Adds an interoperable protocol.' },
  previousByDimension: { 'protocol/interop': 'PARITY' },
  confidence: 0.9,
  action: 'Open an adapter spike.',
};

const directories: string[] = [];
const memories: MemoryStore[] = [];
const missions: SqliteMissionStore[] = [];

afterEach(() => {
  for (const memory of memories.splice(0)) memory.close();
  for (const mission of missions.splice(0)) mission.close();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('competitive intelligence watch closure path', () => {
  it('uses the CLI, capability, watch service, and dry-run flow path with injected dependencies', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'deckent-watch-closure-'));
    directories.push(directory);
    const memory = new MemoryStore(join(directory, 'memory.db'));
    memories.push(memory);
    const missionStore = new SqliteMissionStore(join(directory, 'missions'));
    missionStore.migrate();
    missions.push(missionStore);
    const capabilityRegistry = new CapabilityRegistry();
    const flowRegistry = new FlowRegistry(join(directory, 'flows'));
    const clock = () => new Date('2026-08-25T06:00:00.000Z');
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      name: 'Version 2',
      published_at: '2026-08-25T06:00:00.000Z',
      html_url: 'https://official.example.test/releases/v2',
    }), { headers: { etag: '"v2"' } }));
    const notifications: string[] = [];
    const binding: WatchCapabilityBinding = {
      memoryStore: memory,
      fetch,
      now: clock,
      readEvidence: async () => 'closure fixture evidence',
      interpretSource: () => [SIGNAL],
      outbox: {
        enqueueOwnerNotification: ({ id }) => { notifications.push(id); },
      },
    };
    expect(registerWatchCapability(capabilityRegistry, binding).kind).toBe('admitted');
    registerWatchFlow(flowRegistry, { createdAt: new Date('2026-08-24T06:00:00.000Z') });

    const output: string[] = [];
    const program = new Command().exitOverride();
    registerIntelligence(program, {
      capabilityRegistry,
      flowRegistry,
      loadSources: async (fixture) => {
        expect(fixture).toBe('sources.json');
        return [SOURCE];
      },
      readStatus: () => ({ events: [], lastRun: undefined }),
      write: (message) => output.push(message),
      language: () => 'en',
    });

    await program.parseAsync(['intelligence', 'schedule'], { from: 'user' });
    await program.parseAsync(
      ['intelligence', 'watch', 'run', '--dry-run', '--input', 'sources.json'],
      { from: 'user' },
    );
    const cursorStore = new Map<string, Date>();
    const results = await runWatchFlow({
      registry: flowRegistry,
      scheduler: new FlowScheduler(),
      capabilityRegistry,
      missionStore,
      cursorStore: {
        get: (flowId) => cursorStore.get(flowId),
        set: (flowId, occurrence) => cursorStore.set(flowId, occurrence),
      },
      sources: [SOURCE],
      now: clock(),
      dryRun: true,
    });

    expect(output[0]).toContain('already registered');
    expect(output[1]).toContain('Watch completed: 1 alerts, 0 issues (dry-run: true).');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(1);
    expect(results[0]?.outcome).toMatchObject({ kind: 'completed', dryRun: true });
    expect(missionStore.listMissions()).toEqual([]);
    expect(memory.getByType('custom')).toEqual([]);
    expect(notifications).toEqual([]);
    expect(cursorStore.size).toBe(0);
  });
});
