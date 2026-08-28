import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CapabilityRegistry } from '../../src/core/capability-broker.js';
import type { CapabilityAuditRecord } from '../../src/core/capability-audit-bridge.js';
import { createAuditedCapabilityRegistry } from '../../src/core/capability-runtime.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import {
  WATCH_CAPABILITY_ID,
  registerWatchCapability,
  type WatchCapabilityBinding,
  type WatchCapabilityOutcome,
} from '../../src/intelligence/watch-capability.js';
import type { WatchSignal } from '../../src/intelligence/watch-service.js';

const SOURCE = {
  sourceId: 'release',
  kind: 'official-release',
  url: 'https://official.example.test/releases',
  format: 'github-release-json',
} as const;

const SIGNAL: WatchSignal = {
  signalId: 'watch-capability-signal',
  competitor: 'OpenAI Codex',
  eventType: 'Capability release',
  source: 'https://official.example.test/v2',
  publicationDate: '2026-08-28T09:00:00Z',
  affectedCapability: 'capability-authority',
  competitorStatus: 'LIVE_PROVEN',
  evidenceRefs: ['https://official.example.test/v2'],
  dimensions: { 'protocol/interop': 'Adds an interoperable protocol.' },
  previousByDimension: { 'protocol/interop': 'PARITY' },
  confidence: 0.9,
  action: 'Open an adapter spike.',
};

const directories: string[] = [];
const stores: MemoryStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('intelligence watch capability', () => {
  it('rejects name-only admission with a typed outcome', () => {
    const registry = new CapabilityRegistry();
    const admission = registerWatchCapability(
      registry,
      WATCH_CAPABILITY_ID as unknown as WatchCapabilityBinding,
    );

    expect(admission).toEqual({
      kind: 'rejected',
      code: 'LIVE_BROKER_BINDING_REQUIRED',
      capabilityId: WATCH_CAPABILITY_ID,
    });
    expect(registry.has(WATCH_CAPABILITY_ID)).toBe(false);
  });

  it('routes dry and real runs through one network-declaring audited handler', async () => {
    const notifications: string[] = [];
    const auditRecords: CapabilityAuditRecord[] = [];
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      name: 'Version 2',
      published_at: '2026-08-28T09:00:00Z',
      html_url: 'https://official.example.test/v2',
      body: 'raw-body-must-not-survive',
    }), { headers: { etag: '"v2"' } }));
    const binding = createBinding(fetch, notifications);
    const registry = createAuditedCapabilityRegistry(
      (record) => auditRecords.push(record),
      { intelligenceWatch: binding },
    );

    expect(registry.listBackends(WATCH_CAPABILITY_ID)).toHaveLength(1);
    expect(registry.get(WATCH_CAPABILITY_ID)?.requiredCapability).toBe('network');

    const dry = await invoke(registry, true);
    const real = await invoke(registry, false);

    expect(dry).toMatchObject({ kind: 'completed', dryRun: true, alertCount: 1 });
    expect(real).toMatchObject({ kind: 'completed', dryRun: false, alertCount: 1 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(notifications).toHaveLength(1);
    expect(auditRecords).toHaveLength(2);
    expect(auditRecords.every((record) =>
      record.capability === 'network' && record.outcome === 'success')).toBe(true);
    for (const outcome of [dry, real]) {
      expect(outcome.receipts).toEqual([{
        sourceId: SOURCE.sourceId,
        outcome: 'ok',
        byteCount: expect.any(Number),
        framedOutputDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      }]);
      expect(JSON.stringify(outcome)).not.toContain('raw-body-must-not-survive');
      expect(outcome.receipts[0]).toHaveProperty('byteCount');
      expect(outcome.receipts[0]).toHaveProperty('framedOutputDigest');
      expect(Object.keys(outcome.receipts[0]!).sort()).toEqual([
        'byteCount', 'framedOutputDigest', 'outcome', 'sourceId',
      ]);
    }
  });

  it('returns typed rejected and hold outcomes with bounded receipts', async () => {
    const registry = new CapabilityRegistry();
    const binding = createBinding(
      vi.fn(async () => new Response('', { status: 400 })),
      [],
    );
    registerWatchCapability(registry, binding);

    const invalid = await registry.invoke({
      capability: WATCH_CAPABILITY_ID,
      args: { sources: 'not-an-array' },
    });
    expect(invalid).toMatchObject({
      ok: true,
      value: { kind: 'rejected', code: 'INVALID_ARGUMENTS', receipts: [] },
    });

    const held = await invoke(registry, false);
    expect(held).toMatchObject({
      kind: 'completed',
      issueCount: 1,
      receipts: [{ sourceId: SOURCE.sourceId, outcome: 'hold', byteCount: 0 }],
    });
  });
});

function createBinding(
  fetch: WatchCapabilityBinding['fetch'],
  notifications: string[],
): WatchCapabilityBinding {
  const directory = mkdtempSync(join(tmpdir(), 'deckent-watch-capability-'));
  directories.push(directory);
  const memoryStore = new MemoryStore(join(directory, 'memory.db'));
  stores.push(memoryStore);
  return {
    memoryStore,
    fetch,
    now: () => new Date('2026-08-28T12:00:00Z'),
    readEvidence: async () => 'fixture evidence',
    interpretSource: () => [SIGNAL],
    outbox: {
      enqueueOwnerNotification: ({ id }) => {
        if (!notifications.includes(id)) notifications.push(id);
      },
    },
  };
}

async function invoke(
  registry: CapabilityRegistry,
  dryRun: boolean,
): Promise<WatchCapabilityOutcome> {
  const result = await registry.invoke({
    capability: WATCH_CAPABILITY_ID,
    args: { sources: [SOURCE], dryRun },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value as WatchCapabilityOutcome;
}
