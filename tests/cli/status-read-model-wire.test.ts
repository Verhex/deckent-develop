import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  buildNoActiveStatusJson,
  buildStatusJsonSnapshot,
} from '../../src/cli/commands/status.js';
import { ProviderExecutionObservationStore } from '../../src/core/provider-execution-observation-store.js';
import { publishCanonicalRunStatusReadModel } from '../../src/core/run-status-read-model.js';

describe('CLI canonical status read-model wire', () => {
  it('uses the persisted IDLE revision and never re-counts unresolved historical observations', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-status-read-model-wire-'));
    try {
      const store = new ProviderExecutionObservationStore(root);
      store.put({
        source: 'provider-runtime',
        observation: {
          type: 'start',
          executionId: 'historical-execution',
          runId: 'run-488',
          taskId: '488-002',
          attemptId: 'attempt-488-002',
          providerPrincipalDigest: 'principal-488',
          fence: 'fence-488',
          sequence: 1,
          observedAt: '2026-08-01T00:00:00.000Z',
        },
      });
      store.close();
      publishCanonicalRunStatusReadModel(root, { publishedAt: '2026-08-01T01:00:00.000Z' });

      const fallback = vi.fn(() => { throw new Error('fallback must not execute'); });
      const status = buildNoActiveStatusJson(root, { providerConcurrencyRuntime: fallback });
      expect(status.statusReadModel).toMatchObject({ state: 'persisted', revision: 1 });
      expect(status.providerConcurrency).toEqual([
        expect.objectContaining({ currentAttained: 0, unresolvedOpenIntervals: 1 }),
      ]);
      expect(fallback).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not promote ambient task artifacts when IDLE read-model evidence is stale', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-status-idle-artifact-'));
    try {
      mkdirSync(join(root, '.tasks'), { recursive: true });
      writeFileSync(join(root, '.tasks', 'task-489-001.json'), JSON.stringify({
        id: '489-001',
        title: 'orphan plan artifact',
        status: 'PENDING',
        sprintId: 'sprint-489',
      }));

      const status = buildStatusJsonSnapshot(root, join(root, '.dashboard'), {});
      expect(status).toMatchObject({
        active: false,
        lifecycle: 'IDLE',
        statusReadModel: { state: 'unavailable-or-stale' },
      });
      expect(status).not.toHaveProperty('tasks');
      expect(status).not.toHaveProperty('progress');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
