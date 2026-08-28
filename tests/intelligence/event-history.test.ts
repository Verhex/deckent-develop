import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { MemoryStore } from '../../src/core/memory-store.js';
import {
  deriveEventFingerprint,
  writeEventHistory,
  type CompetitorEventInput,
} from '../../src/intelligence/event-history.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const EVENT: CompetitorEventInput = {
  competitor: 'OpenAI Codex',
  eventType: 'Capability Release',
  source: 'https://example.test/original',
  publicationDate: '2026-08-28T09:30:00Z',
  detectionDate: '2026-08-28T10:00:00Z',
  reportedDate: '',
  affectedCapability: 'Agent Orchestration',
  previousClassification: 'PARITY',
  confidence: 0.9,
};

describe('competitor event history', () => {
  it('collapses mirror and rewrite copies to one custom MemoryStore entry', () => {
    const store = memoryStore();
    try {
      const original = writeEventHistory(store, EVENT);
      const rewrite = writeEventHistory(store, {
        ...EVENT,
        competitor: '  openai---CODEX ',
        eventType: 'capability   release',
        affectedCapability: 'agent_orchestration',
        source: 'https://mirror.test/rewritten-headline',
        detectionDate: '2026-08-28T12:00:00+00:00',
        confidence: 0.75,
      });

      expect(original).toMatchObject({ ok: true, state: 'written' });
      expect(rewrite).toMatchObject({
        ok: true,
        state: 'duplicate',
        event: { fingerprint: original.ok ? original.event.fingerprint : '' },
      });
      const rows = store.getByType('custom');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ type: 'custom', source: 'brain' });
      expect(JSON.parse(rows[0]!.metadata)).toEqual(
        original.ok ? original.event : undefined,
      );
    } finally {
      store.close();
    }
  });

  it('uses a new fingerprint for material classification or capability evolution', () => {
    const classification = {
      ...EVENT,
      previousClassification: 'BEHIND',
    };
    const capability = { ...EVENT, affectedCapability: 'Trust Controls' };

    expect(deriveEventFingerprint(classification)).not.toBe(
      deriveEventFingerprint(EVENT),
    );
    expect(deriveEventFingerprint(capability)).not.toBe(
      deriveEventFingerprint(EVENT),
    );

    const store = memoryStore();
    try {
      expect(writeEventHistory(store, EVENT)).toMatchObject({ state: 'written' });
      expect(writeEventHistory(store, classification)).toMatchObject({ state: 'written' });
      expect(writeEventHistory(store, capability)).toMatchObject({ state: 'written' });
      expect(store.getByType('custom')).toHaveLength(3);
    } finally {
      store.close();
    }
  });

  it('returns typed errors for missing fields, invalid dates, and confidence', () => {
    const store = memoryStore();
    try {
      const { competitor: _competitor, ...missingCompetitor } = EVENT;
      expect(writeEventHistory(store, missingCompetitor)).toEqual({
        ok: false,
        error: {
          code: 'MISSING_FIELD',
          field: 'competitor',
          message: 'competitor is required',
        },
      });
      expect(writeEventHistory(store, {
        ...EVENT,
        publicationDate: '2026-02-30',
      })).toMatchObject({
        ok: false,
        error: { code: 'INVALID_DATE', field: 'publicationDate' },
      });
      expect(writeEventHistory(store, {
        ...EVENT,
        reportedDate: '28/08/2026',
      })).toMatchObject({
        ok: false,
        error: { code: 'INVALID_DATE', field: 'reportedDate' },
      });
      expect(writeEventHistory(store, { ...EVENT, confidence: 2 })).toMatchObject({
        ok: false,
        error: { code: 'INVALID_FIELD', field: 'confidence' },
      });
      expect(store.getByType('custom')).toHaveLength(0);
    } finally {
      store.close();
    }
  });
});

function memoryStore(): MemoryStore {
  const directory = mkdtempSync(join(tmpdir(), 'deckent-event-history-'));
  directories.push(directory);
  return new MemoryStore(join(directory, 'memory.db'));
}
