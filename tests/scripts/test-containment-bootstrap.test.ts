import { describe, expect, it, vi } from 'vitest';

import {
  bootstrapClaimedProcess,
  createCandidateBootstrapAuthority,
  runExternalCandidateBootstrap,
} from '../../scripts/hermeticity/process-bootstrap.mjs';

const IDENTITY_DIGEST = 'a'.repeat(64);

function durableClaim() {
  return {
    schemaVersion: 1,
    runNonce: 'run-001',
    identityDigest: IDENTITY_DIGEST,
    identity: {
      adapterId: 'linux-process-group-v1',
      resourceType: 'process-group',
      resourceId: 'resource-001',
      birthToken: 'host-private-birth-token',
      claimNonce: 'b'.repeat(64),
      preparedAt: '2026-07-27T00:00:00.000Z',
    },
    claimedAt: '2026-07-27T00:00:01.000Z',
  };
}

function releasedManifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 3,
    state: 'gate-released',
    containment: {
      mode: 'enforce',
      candidateBirthAuthorized: true,
      resourceClaimDigest: IDENTITY_DIGEST,
      adapterId: 'linux-process-group-v1',
      finality: { status: 'UNPROVEN' },
      ...overrides,
    },
  };
}

describe('containment process bootstrap', () => {
  it('never creates a candidate without a durable resource claim', async () => {
    const authorizeCandidateBirth = vi.fn();
    const spawnCandidate = vi.fn();

    const result = await bootstrapClaimedProcess({
      durableClaim: null,
      authorizeCandidateBirth,
      spawnCandidate,
    });

    expect(result).toMatchObject({
      state: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_DURABLE_CLAIM_REQUIRED',
      candidateBirth: 'NOT_BORN',
      retain: true,
    });
    expect(authorizeCandidateBirth).not.toHaveBeenCalled();
    expect(spawnCandidate).not.toHaveBeenCalled();
  });

  it('awaits the exact durable release before invoking the one-shot birth callback', async () => {
    const order: string[] = [];
    const authorizeCandidateBirth = vi.fn(async (identityDigest: string) => {
      order.push(`authorize:${identityDigest}`);
      return releasedManifest();
    });
    const spawnCandidate = vi.fn(async (binding: Record<string, unknown>) => {
      order.push('spawn');
      return { state: 'SETTLED', binding };
    });

    const result = await bootstrapClaimedProcess({
      durableClaim: durableClaim(),
      authorizeCandidateBirth,
      spawnCandidate,
    });

    expect(order).toEqual([`authorize:${IDENTITY_DIGEST}`, 'spawn']);
    expect(spawnCandidate).toHaveBeenCalledTimes(1);
    expect(spawnCandidate.mock.calls[0][0]).toEqual({
      runNonce: 'run-001',
      identityDigest: IDENTITY_DIGEST,
      adapterId: 'linux-process-group-v1',
      resourceType: 'process-group',
      resourceId: 'resource-001',
    });
    expect(JSON.stringify(spawnCandidate.mock.calls[0][0])).not.toContain('birth-token');
    expect(result).toMatchObject({
      state: 'STARTED',
      candidateBirth: 'BORN',
      nonIpcGo: true,
    });
  });

  it('keeps candidate birth at zero for forged or mismatched release state', async () => {
    const spawnCandidate = vi.fn();
    for (const authorization of [
      releasedManifest({ candidateBirthAuthorized: false }),
      releasedManifest({ resourceClaimDigest: 'c'.repeat(64) }),
      releasedManifest({ adapterId: 'other-adapter' }),
      { schemaVersion: 3, state: 'resource-claimed' },
    ]) {
      const result = await bootstrapClaimedProcess({
        durableClaim: durableClaim(),
        authorizeCandidateBirth: async () => authorization,
        spawnCandidate,
      });
      expect(result).toMatchObject({
        state: 'HOLD',
        code: 'E_CONTAINMENT_HOLD_BIRTH_AUTHORIZATION_INVALID',
        candidateBirth: 'NOT_BORN',
      });
    }
    expect(spawnCandidate).not.toHaveBeenCalled();
  });

  it('maps durable authority failure to HOLD without attempting spawn', async () => {
    const spawnCandidate = vi.fn();
    const result = await bootstrapClaimedProcess({
      durableClaim: durableClaim(),
      authorizeCandidateBirth: async () => {
        throw new Error('E_CI_SIM_CONTAINMENT_CLAIM_CONFLICT');
      },
      spawnCandidate,
    });

    expect(result).toMatchObject({
      state: 'HOLD',
      code: 'E_CI_SIM_CONTAINMENT_CLAIM_CONFLICT',
      candidateBirth: 'NOT_BORN',
    });
    expect(spawnCandidate).not.toHaveBeenCalled();
  });

  it('treats a throwing spawn boundary as unknown birth and retains authority state', async () => {
    const result = await bootstrapClaimedProcess({
      durableClaim: durableClaim(),
      authorizeCandidateBirth: async () => releasedManifest(),
      spawnCandidate: async () => {
        throw new Error('ambiguous platform failure');
      },
    });

    expect(result).toMatchObject({
      state: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_EXECUTION_START_UNKNOWN',
      candidateBirth: 'UNKNOWN',
      retain: true,
    });
  });

  it('runs pristine bootstrap checks before the deferred candidate loader', () => {
    const order: string[] = [];
    const authority = createCandidateBootstrapAuthority();
    const originalArrayIsArray = Array.isArray;
    const originalReflectApply = Reflect.apply;
    let result: ReturnType<typeof authority.run>;
    Array.isArray = (() => false) as typeof Array.isArray;
    Reflect.apply = ((target, thisArgument, argumentsList) => (
      originalReflectApply(target, thisArgument, argumentsList)
    )) as typeof Reflect.apply;
    try {
      result = authority.run({
        checks: [
          {
            id: 'descriptor-allowlist-verified',
            evaluate: () => {
              order.push('descriptor');
              return { state: 'PROVEN', evidenceRef: 'sha256:descriptor' };
            },
          },
          {
            id: 'node-permission-active',
            evaluate: () => {
              order.push('permission');
              return { state: 'PROVEN', evidenceRef: 'sha256:permission' };
            },
          },
          {
            id: 'startup-sanitized',
            evaluate: () => {
              order.push('startup');
              return { state: 'PROVEN', evidenceRef: 'sha256:startup' };
            },
          },
        ],
        loadCandidate: () => {
          order.push('candidate');
          return { loaded: true };
        },
      });

    } finally {
      Array.isArray = originalArrayIsArray;
      Reflect.apply = originalReflectApply;
    }
    expect(result).toMatchObject({
      state: 'STARTED',
      candidate: { loaded: true },
    });
    expect(order).toEqual(['descriptor', 'permission', 'startup', 'candidate']);
  });

  it('never calls the candidate loader when a bootstrap assertion is unproven', () => {
    const loadCandidate = vi.fn();
    const authority = createCandidateBootstrapAuthority();
    const result = authority.run({
      checks: [
        {
          id: 'descriptor-allowlist-verified',
          evaluate: () => ({ state: 'PROVEN', evidenceRef: 'sha256:descriptor' }),
        },
        {
          id: 'node-permission-active',
          evaluate: () => ({ state: 'UNPROVEN' }),
        },
        {
          id: 'startup-sanitized',
          evaluate: () => ({ state: 'PROVEN', evidenceRef: 'sha256:startup' }),
        },
      ],
      loadCandidate,
    });

    expect(result).toMatchObject({
      state: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_BOOTSTRAP_CHECK_UNPROVEN',
      candidateBirth: 'NOT_BORN',
    });
    expect(loadCandidate).not.toHaveBeenCalled();
    expect(authority.run({ checks: [], loadCandidate })).toMatchObject({
      state: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_BOOTSTRAP_REPLAY',
    });
  });

  it('rejects startup injection before the external candidate module is loaded', async () => {
    const loadCandidate = vi.fn();
    const result = await runExternalCandidateBootstrap({
      argv: [
        process.execPath,
        '/fixture/process-bootstrap.mjs',
        '--entry',
        '/fixture/candidate.mjs',
        '--',
        'run',
      ],
      environment: {
        node_options: '--require=/fixture/malicious-preload.cjs',
      },
      descriptorEvidence: {
        state: 'PROVEN',
        evidenceRef: `sha256:${'d'.repeat(64)}`,
      },
      permissionEvidence: {
        state: 'PROVEN',
        evidenceRef: `sha256:${'e'.repeat(64)}`,
      },
      loadCandidate,
    });

    expect(result).toMatchObject({
      state: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_BOOTSTRAP_CHECK_UNPROVEN',
      candidateBirth: 'NOT_BORN',
    });
    expect(loadCandidate).not.toHaveBeenCalled();
  });
});
