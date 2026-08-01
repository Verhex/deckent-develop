import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
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

const PRINCIPAL = 'principal-digest-017';

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
  return {
    executionId,
    taskId: `task-${executionId}`,
    attemptId: `attempt-${executionId}`,
    providerPrincipalDigest: PRINCIPAL,
    fence: `fence-${executionId}`,
    start: {
      type: 'start', executionId, taskId: `task-${executionId}`, attemptId: `attempt-${executionId}`,
      providerPrincipalDigest: PRINCIPAL, fence: `fence-${executionId}`, sequence: 1, observedAt: start,
    },
    end: end === null ? null : {
      type: 'end', executionId, taskId: `task-${executionId}`, attemptId: `attempt-${executionId}`,
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
    const snapshot = buildStatusJsonSnapshot('/path/without/dashboard', '/path/without/dashboard', {
      providerConcurrencyRuntime: () => [runtime],
    });
    expect(snapshot.providerConcurrency).toEqual([runtime]);
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
});
