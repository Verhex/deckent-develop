import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  projectProviderConcurrencyRuntime,
} from '../../src/core/provider-limit-admission.js';
import { buildStatusJsonSnapshot } from '../../src/cli/commands/status.js';
import type { ProviderConcurrencyCapabilityEvidence } from '../../src/core/provider-concurrency-capability.js';
import type { StoredProviderExecutionInterval } from '../../src/core/provider-execution-observation-store.js';
import { ProviderExecutionObservationStore } from '../../src/core/provider-execution-observation-store.js';
import { readProviderConcurrencyRuntime } from '../../src/core/provider-concurrency-runtime-reader.js';
import {
  buildCanonicalRunStatusReadModel,
  resolveCanonicalRunStatusReadModelPath,
} from '../../src/core/run-status-read-model.js';
import { readCanonicalRunStatus } from '../../src/core/run-status-authority.js';

const PRINCIPAL = 'principal-digest-017';
const RUN_ID = 'run-provider-concurrency';

function capability(
  overrides: Partial<ProviderConcurrencyCapabilityEvidence> = {},
): ProviderConcurrencyCapabilityEvidence {
  return {
    decision: 'ADMITTED',
    reasonCodes: ['admitted'],
    scope: { tenantRef: 'tenant-017', principalRef: PRINCIPAL, authModeClass: 'subscription' },
    configuredCeiling: 8,
    providerAuthoritativeCapacity: 6,
    hostCeiling: 10,
    effectiveAdmittedCeiling: 6,
    freshness: { observedAt: '2026-07-31T12:00:00.000Z', expiresAt: '2026-07-31T12:05:00.000Z' },
    evidenceRefs: ['provider-capacity:017'],
    ...overrides,
  };
}

function interval(
  executionId: string,
  start: string,
  end: string | null,
): StoredProviderExecutionInterval {
  // v2 binds observations to an owning run. These cases scope by task/attempt, not by
  // run, so every fixture interval belongs to the SAME run — introducing per-interval
  // runs here would silently change what the assertions mean.
  return {
    executionId,
    runId: RUN_ID,
    ownership: 'run-owned',
    retired: false,
    taskId: `task-${executionId}`,
    attemptId: `attempt-${executionId}`,
    providerPrincipalDigest: PRINCIPAL,
    fence: `fence-${executionId}`,
    start: {
      type: 'start', executionId, runId: RUN_ID, taskId: `task-${executionId}`, attemptId: `attempt-${executionId}`,
      providerPrincipalDigest: PRINCIPAL, fence: `fence-${executionId}`, sequence: 1, observedAt: start,
    },
    end: end === null ? null : {
      type: 'end', executionId, runId: RUN_ID, taskId: `task-${executionId}`, attemptId: `attempt-${executionId}`,
      providerPrincipalDigest: PRINCIPAL, fence: `fence-${executionId}`, sequence: 2, observedAt: end,
      outcome: 'completed',
    },
  };
}

describe('provider concurrency runtime projection', () => {
  it('joins admitted capacity with direct execution intervals and exposes it through CLI JSON', () => {
    const runtime = projectProviderConcurrencyRuntime({
      providerPrincipalDigest: PRINCIPAL,
      capability: capability(),
      intervals: [
        interval('one', '2026-07-31T12:00:00.000Z', '2026-07-31T12:03:00.000Z'),
        interval('two', '2026-07-31T12:01:00.000Z', null),
      ],
    });

    expect(runtime).toMatchObject({
      admission: 'ADMITTED', admittedCeiling: 6, currentAttained: 1, peakAttained: 2,
    });
    const root = mkdtempSync(join(tmpdir(), 'deckent-provider-status-model-'));
    try {
      const authority = readCanonicalRunStatus(root);
      const model = buildCanonicalRunStatusReadModel({
        authority,
        tasks: [],
        providerConcurrency: [runtime],
        terminalPublication: { version: 1, state: 'open', receipt: null },
        runGeneration: null,
        publishedAt: '2026-08-01T00:00:00.000Z',
      });
      const modelPath = resolveCanonicalRunStatusReadModelPath(root);
      mkdirSync(join(root, '.deckent', 'runtime'), { recursive: true });
      writeFileSync(modelPath, `${JSON.stringify(model, null, 2)}\n`);
      const snapshot = buildStatusJsonSnapshot(root, join(root, '.dashboard'), {});
      expect(snapshot.providerConcurrency).toEqual([runtime]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps missing capability as HOLD and unknown rather than rendering capacity as zero', () => {
    const runtime = projectProviderConcurrencyRuntime({
      providerPrincipalDigest: PRINCIPAL,
      capability: capability({
        decision: 'HOLD',
        reasonCodes: ['provider_capacity_unknown'],
        providerAuthoritativeCapacity: 'unknown',
        effectiveAdmittedCeiling: 'unknown',
      }),
      intervals: [],
    });

    expect(runtime).toMatchObject({ admission: 'HOLD', admittedCeiling: 'unknown' });
    expect(runtime.admittedCeiling).not.toBe(0);
  });

  it('rejects intervals attributed to another principal instead of blending attained concurrency', () => {
    expect(() => projectProviderConcurrencyRuntime({
      providerPrincipalDigest: PRINCIPAL,
      capability: capability(),
      intervals: [{ ...interval('foreign', '2026-07-31T12:00:00.000Z', null), providerPrincipalDigest: 'other' }],
    })).toThrow(/projected principal/u);
  });

  it('reads bounded attained truth without creating capacity authority or a missing database', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-provider-concurrency-status-'));
    try {
      expect(readProviderConcurrencyRuntime(root)).toEqual([]);

      const store = new ProviderExecutionObservationStore(root);
      store.put({
        source: 'provider-runtime',
        observation: interval('live', '2026-07-31T12:00:00.000Z', null).start,
      });
      store.close();

      expect(readProviderConcurrencyRuntime(root)).toEqual([
        expect.objectContaining({
          providerPrincipalDigest: PRINCIPAL,
          admission: 'HOLD',
          admittedCeiling: 'unknown',
          currentAttained: 1,
          peakAttained: 1,
        }),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('requires exact task and attempt attribution when the caller supplies a run scope', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-provider-concurrency-status-'));
    try {
      const store = new ProviderExecutionObservationStore(root);
      store.put({
        source: 'provider-runtime',
        observation: interval('current', '2026-07-31T12:00:00.000Z', null).start,
      });
      store.put({
        source: 'provider-runtime',
        observation: {
          ...interval('stale', '2026-07-31T12:01:00.000Z', null).start,
          taskId: 'task-stale',
          attemptId: 'attempt-stale',
        },
      });
      store.close();

      expect(readProviderConcurrencyRuntime(root, {
        currentTaskIds: new Set(['task-current', 'task-stale']),
        currentAttemptIdsByTaskId: new Map([
          ['task-current', new Set(['attempt-current'])],
          ['task-stale', new Set<string>()],
        ]),
      })).toEqual([
        expect.objectContaining({
          currentAttained: 1,
          peakAttained: 1,
          unresolvedOpenIntervals: 1,
          observationScope: 'exact-task-set',
        }),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps retired open rows as forensic history without projecting them as active concurrency', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-provider-concurrency-retired-'));
    try {
      const store = new ProviderExecutionObservationStore(root);
      const retired = interval('retired', '2026-07-31T12:00:00.000Z', null);
      const live = interval('live', '2026-07-31T12:01:00.000Z', null);
      store.put({ source: 'provider-runtime', observation: retired.start });
      store.put({ source: 'provider-runtime', observation: live.start });
      expect(store.retireExactOpenIntervals([{
        executionId: retired.executionId,
        runId: retired.runId!,
        taskId: retired.taskId,
        attemptId: retired.attemptId,
        providerPrincipalDigest: retired.providerPrincipalDigest,
        fence: retired.fence,
      }])).toBe(1);
      store.close();

      expect(readProviderConcurrencyRuntime(root, {
        currentTaskIds: new Set<string>(),
        currentAttemptIdsByTaskId: new Map(),
      })).toEqual([
        expect.objectContaining({
          currentAttained: 0,
          peakAttained: 0,
          unresolvedOpenIntervals: 1,
          observationScope: 'exact-task-set',
        }),
      ]);

      const forensic = new ProviderExecutionObservationStore(root, { readOnly: true });
      expect(forensic.listIntervals(PRINCIPAL)).toEqual(expect.arrayContaining([
        expect.objectContaining({ executionId: 'retired', retired: true, end: null }),
      ]));
      forensic.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
