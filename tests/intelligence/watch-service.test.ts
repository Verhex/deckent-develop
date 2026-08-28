import { describe, expect, it, vi } from 'vitest';

import type { CompetitorEvent } from '../../src/intelligence/event-history.js';
import type { ConditionalFetchState } from '../../src/intelligence/source-retrieval.js';
import {
  runWatchService,
  type WatchHistoryStore,
  type WatchServiceDependencies,
  type WatchSignal,
} from '../../src/intelligence/watch-service.js';

const SOURCE = {
  sourceId: 'release',
  kind: 'official-release',
  url: 'https://example.test/releases',
  format: 'github-release-json',
} as const;

const SIGNAL: WatchSignal = {
  signalId: 'codex-protocol-v2',
  competitor: 'OpenAI Codex',
  eventType: 'Yeni protocol desteği yayınlandı',
  source: 'https://example.test/v2',
  publicationDate: '2026-08-27T09:00:00Z',
  affectedCapability: 'capability authority',
  competitorStatus: 'LIVE_PROVEN',
  evidenceRefs: ['https://example.test/v2'],
  dimensions: { 'protocol/interop': 'Yeni bir birlikte çalışabilir protokol.' },
  previousByDimension: { 'protocol/interop': 'PARITY' },
  confidence: 0.9,
  action: 'adapter spike aç ve canlı kanıt üret',
};

describe('watch service', () => {
  it('runs the complete chain and emits one alarm across repeated runs', async () => {
    const harness = createHarness();

    const first = await runWatchService({ sources: [SOURCE] }, harness.dependencies);
    const second = await runWatchService({ sources: [SOURCE] }, harness.dependencies);

    expect(first.alerts).toHaveLength(1);
    expect(first.alerts[0]).toMatchObject({ state: 'enqueued' });
    expect(first.alerts[0]?.text).toContain('Göreli sınıf: BEHIND');
    expect(second.alerts).toHaveLength(0);
    expect(second.suppressedSignalIds).toEqual([SIGNAL.signalId]);
    expect(harness.notifications).toHaveLength(1);
    expect(harness.events).toHaveLength(1);
    expect(harness.events[0]?.reportedDate).toBe('2026-08-28T12:00:00.000Z');
    expect(harness.cursors.get(SOURCE.sourceId)).toEqual({ etag: '"v2"' });
  });

  it('returns a preview without mutating history, outbox, or source cursor', async () => {
    const harness = createHarness();
    const writeEvent = vi.spyOn(harness.store, 'writeEvent');
    const markReported = vi.spyOn(harness.store, 'markReported');
    const saveCursor = vi.spyOn(harness.store, 'saveSourceCursor');

    const result = await runWatchService(
      { sources: [SOURCE], dryRun: true },
      harness.dependencies,
    );

    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toMatchObject({ state: 'would-enqueue' });
    expect(writeEvent).not.toHaveBeenCalled();
    expect(markReported).not.toHaveBeenCalled();
    expect(saveCursor).not.toHaveBeenCalled();
    expect(harness.events).toHaveLength(0);
    expect(harness.notifications).toHaveLength(0);
    expect(harness.cursors.size).toBe(0);
  });

  it('replays a crash after enqueue with the same stable id and no duplicate notification', async () => {
    const harness = createHarness();
    let crash = true;
    harness.store.markReported = (fingerprint, date) => {
      if (crash) throw new Error('simulated crash after durable enqueue');
      const event = harness.events.find((candidate) => candidate.fingerprint === fingerprint);
      if (event !== undefined) event.reportedDate = date;
    };

    const first = await runWatchService({ sources: [SOURCE] }, harness.dependencies);
    crash = false;
    const second = await runWatchService({ sources: [SOURCE] }, harness.dependencies);

    expect(first.issues).toEqual([
      expect.objectContaining({ message: 'simulated crash after durable enqueue' }),
    ]);
    expect(second.alerts).toHaveLength(1);
    expect(harness.enqueueAttempts).toHaveLength(2);
    expect(new Set(harness.enqueueAttempts)).toHaveLength(1);
    expect(harness.notifications).toHaveLength(1);
    expect(harness.events[0]?.reportedDate).toBe('2026-08-28T12:00:00.000Z');
  });

  it('keeps successful siblings when one source fails', async () => {
    const harness = createHarness();
    const bad = { ...SOURCE, sourceId: 'bad', url: 'https://example.test/bad' };
    harness.dependencies.fetch = async (input) => String(input).endsWith('/bad')
      ? new Response('broken', { status: 400 })
      : releaseResponse();

    const result = await runWatchService(
      { sources: [bad, SOURCE] },
      harness.dependencies,
    );

    expect(result.issues).toEqual([
      expect.objectContaining({ sourceId: 'bad', stage: 'source', message: 'HTTP 400.' }),
    ]);
    expect(result.alerts).toHaveLength(1);
    expect(harness.notifications).toHaveLength(1);
  });
});

function createHarness(): {
  dependencies: WatchServiceDependencies;
  store: WatchHistoryStore;
  events: CompetitorEvent[];
  cursors: Map<string, ConditionalFetchState>;
  notifications: string[];
  enqueueAttempts: string[];
} {
  const events: CompetitorEvent[] = [];
  const cursors = new Map<string, ConditionalFetchState>();
  const notifications: string[] = [];
  const enqueueAttempts: string[] = [];
  const store: WatchHistoryStore = {
    getEvent: (fingerprint) => events.find((event) => event.fingerprint === fingerprint),
    writeEvent: (event) => { events.push({ ...event }); },
    markReported: (fingerprint, date) => {
      const event = events.find((candidate) => candidate.fingerprint === fingerprint);
      if (event !== undefined) event.reportedDate = date;
    },
    getSourceCursor: (sourceId) => cursors.get(sourceId),
    saveSourceCursor: (sourceId, cursor) => { cursors.set(sourceId, cursor); },
  };
  const dependencies: WatchServiceDependencies = {
    readEvidence: async () => 'fixture evidence',
    fetch: async () => releaseResponse(),
    store,
    outbox: {
      enqueueOwnerNotification: (notification) => {
        enqueueAttempts.push(notification.id);
        if (!notifications.includes(notification.id)) notifications.push(notification.id);
      },
    },
    now: () => new Date('2026-08-28T12:00:00Z'),
    interpretSource: (result) => result.source.sourceId === SOURCE.sourceId
      ? [SIGNAL] : [],
  };
  return {
    dependencies,
    store,
    events,
    cursors,
    notifications,
    enqueueAttempts,
  };
}

function releaseResponse(): Response {
  return new Response(JSON.stringify({
    name: 'Version 2',
    published_at: '2026-08-27T09:00:00Z',
    html_url: 'https://example.test/v2',
  }), { status: 200, headers: { etag: '"v2"' } });
}
