import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createRuntimeAdoptionPlan,
  parseRuntimeAdoptionPlan,
  RuntimeAdoptionHoldError,
  runtimeAdoptionPlanDigest,
  serializeRuntimeAdoptionPlan,
  validateRuntimeAdoptionPlan,
} from '../../src/core/runtime-adoption.js';

const digest = (value: string): string => `sha256:${createHash('sha256').update(value).digest('hex')}`;

function plan() {
  return createRuntimeAdoptionPlan({
    adoptionId: 'adoption-1',
    providerObservationReceipt: {
      projectRelativePath: 'evidence/provider-receipt.json',
      receiptId: digest('provider-id'),
      receiptDigest: digest('provider-bytes'),
    },
    targetDatabase: {
      projectRelativePath: 'state/provider.db',
      databaseDigest: digest('database'),
      lineageDigest: digest('lineage'),
    },
    deckentBuild: {
      buildIdentityDigest: digest('build'),
      sourceTreeIdentityDigest: digest('source-tree'),
    },
    entrypoint: { projectRelativePath: 'dist/cli.js', artifactDigest: digest('entrypoint') },
    liveRuntime: {
      runtimeId: 'runtime-1', processId: 123, processStartIdentity: 'boot-7:tick-42',
      ownerIdentityDigest: digest('owner-and-fence'),
    },
    plannedAt: '2026-08-24T10:00:00.000Z',
  });
}

describe('runtime adoption v1 contract', () => {
  it('canonically binds every adoption authority and is deterministic and deeply frozen', () => {
    const first = plan();
    const second = plan();
    expect(first).toEqual(second);
    expect(first.planDigest).toBe(runtimeAdoptionPlanDigest((({ planDigest: _, ...body }) => body)(first)));
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.liveRuntime)).toBe(true);
    expect(first).toMatchObject({
      version: 1, databaseMutation: 'none',
      providerObservationReceipt: { receiptId: digest('provider-id'), receiptDigest: digest('provider-bytes') },
      targetDatabase: { databaseDigest: digest('database'), lineageDigest: digest('lineage') },
      deckentBuild: { buildIdentityDigest: digest('build'), sourceTreeIdentityDigest: digest('source-tree') },
      entrypoint: { artifactDigest: digest('entrypoint') },
      liveRuntime: { runtimeId: 'runtime-1', processStartIdentity: 'boot-7:tick-42' },
    });
  });

  it('round-trips only exact canonical bytes', () => {
    const value = plan();
    const bytes = serializeRuntimeAdoptionPlan(value);
    expect(parseRuntimeAdoptionPlan(bytes)).toEqual(value);
    expect(() => parseRuntimeAdoptionPlan(Buffer.concat([bytes, Buffer.from('\n')]))).toThrowError(
      expect.objectContaining({ code: 'INVALID_PLAN', state: 'HOLD' }),
    );
  });

  it('returns typed HOLD codes for tampering, unknown fields, traversal, and unsupported versions', () => {
    const value = plan();
    expect(() => validateRuntimeAdoptionPlan({ ...value, planDigest: digest('forged') }))
      .toThrowError(expect.objectContaining({ code: 'PLAN_DIGEST_MISMATCH', state: 'HOLD' }));
    expect(() => validateRuntimeAdoptionPlan({ ...value, secret: true }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_PLAN' }));
    expect(() => createRuntimeAdoptionPlan({
      ...value,
      providerObservationReceipt: { ...value.providerObservationReceipt, projectRelativePath: '../foreign' },
    })).toThrowError(expect.objectContaining({ code: 'INVALID_PLAN' }));
    expect(() => validateRuntimeAdoptionPlan({ ...value, version: 2 }))
      .toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_VERSION' }));
    expect(new RuntimeAdoptionHoldError('BUILD_IDENTITY_MISMATCH').message)
      .toBe('RUNTIME_ADOPTION_HOLD:BUILD_IDENTITY_MISMATCH');
  });
});
