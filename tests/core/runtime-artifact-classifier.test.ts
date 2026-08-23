import { describe, expect, it } from 'vitest';

import {
  RUNTIME_ARTIFACT_CLASSIFIER_VERSION,
  RUNTIME_ARTIFACT_FAMILIES,
  classifyRuntimeArtifact,
  type RuntimeArtifactClassificationInput,
} from '../../src/core/runtime-artifact-classifier.js';

const digest = 'a'.repeat(64);

function artifact(
  family: string,
  overrides: Partial<RuntimeArtifactClassificationInput> = {},
): RuntimeArtifactClassificationInput {
  return {
    classifierVersion: RUNTIME_ARTIFACT_CLASSIFIER_VERSION,
    root: 'runtime',
    family,
    boundary: { tenantId: 'tenant-a', projectId: 'project-a' },
    owner: { tenantId: 'tenant-a', projectId: 'project-a', ownerId: 'runtime-controller' },
    expectedOwnerId: 'runtime-controller',
    contentEvidence: { digest, validated: true },
    liveness: { state: 'inactive', observedAt: '2026-08-23T00:00:00Z' },
    ...overrides,
  };
}

describe('runtime artifact classifier', () => {
  it('preserves databases, sidecars, tokens, and current status without content inspection', () => {
    for (const family of ['database', 'database-wal', 'database-shm', 'token', 'current-status']) {
      expect(classifyRuntimeArtifact(artifact(family, {
        owner: null,
        contentEvidence: null,
        liveness: null,
      }))).toEqual({ disposition: 'preserve', reason: 'durable-family' });
    }
  });

  it.each([
    'event-stream', 'metrics', 'evaluation', 'decision-log', 'job-record',
    'terminal-receipt', 'forensic-record',
  ])('requires archive-before-retire for inactive owned %s', family => {
    expect(classifyRuntimeArtifact(artifact(family))).toEqual({
      disposition: 'archive-then-retire',
      reason: 'archive-required',
    });
  });

  it('retires a duplicate only when its validated digest identifies the duplicate', () => {
    expect(classifyRuntimeArtifact(artifact('duplicate', { duplicateOfDigest: digest }))).toEqual({
      disposition: 'duplicate-retire', reason: 'verified-duplicate',
    });
    expect(classifyRuntimeArtifact(artifact('duplicate', { duplicateOfDigest: 'b'.repeat(64) })))
      .toEqual({ disposition: 'HOLD', reason: 'content-unverified' });
  });

  it.each(['gate', 'pid-lease', 'heartbeat', 'lock', 'temporary'])(
    'retires verified inactive ephemeral family %s',
    family => {
      expect(classifyRuntimeArtifact(artifact(family))).toEqual({
        disposition: 'ephemeral-retire', reason: 'verified-ephemeral',
      });
    },
  );

  it('holds unknown families rather than providing a catch-all retirement path', () => {
    expect(classifyRuntimeArtifact(artifact('future-uninventoried-family'))).toEqual({
      disposition: 'HOLD', reason: 'unknown-family',
    });
    expect(RUNTIME_ARTIFACT_FAMILIES).not.toContain('future-uninventoried-family');
  });

  it.each([
    ['empty boundary', { boundary: { tenantId: '', projectId: 'project-a' } }, 'invalid-boundary'],
    ['cross-tenant owner', { owner: { tenantId: 'tenant-b', projectId: 'project-a', ownerId: 'runtime-controller' } }, 'owner-boundary-mismatch'],
    ['cross-project owner', { owner: { tenantId: 'tenant-a', projectId: 'project-b', ownerId: 'runtime-controller' } }, 'owner-boundary-mismatch'],
    ['wrong owner', { expectedOwnerId: 'other-controller' }, 'owner-unverified'],
    ['missing content evidence', { contentEvidence: null }, 'content-unverified'],
    ['live artifact', { liveness: { state: 'live', observedAt: '2026-08-23T00:00:00Z' } }, 'live-or-unknown'],
    ['unknown liveness', { liveness: { state: 'unknown', observedAt: '2026-08-23T00:00:00Z' } }, 'live-or-unknown'],
  ] as const)('holds retirement when evidence fails: %s', (_label, overrides, reason) => {
    expect(classifyRuntimeArtifact(artifact('temporary', overrides))).toEqual({
      disposition: 'HOLD', reason,
    });
  });

  it('does not expose a content or filename field in its input contract', () => {
    const input = artifact('temporary');
    expect(input).not.toHaveProperty('content');
    expect(input).not.toHaveProperty('filename');
  });
});
