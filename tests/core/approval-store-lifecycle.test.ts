import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ApprovalRequestV2 } from '../../src/core/approval-contract.js';
import {
  ApprovalStore,
  ApprovalStoreError,
} from '../../src/core/approval-store.js';
import {
  approvalLifecycleProfileDigest,
  resolveApprovalLifecyclePolicy,
} from '../../src/core/approval-lifecycle-policy.js';

const roots: string[] = [];

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), 'deckent-approval-store-lifecycle-'));
  roots.push(value);
  return value;
}

afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

const enabledPolicy = resolveApprovalLifecyclePolicy({ enabled: true });

function request(id: string, riskTier: ApprovalRequestV2['riskTier'] = 'routine'): ApprovalRequestV2 {
  const profile = enabledPolicy.profiles['broker-native'];
  return {
    id, version: '2.0', requester: { role: 'worker', instanceId: 'worker-1' },
    summary: 'approval request', details: { kind: 'unallowlisted-kind' },
    scopeId: 'scope-1', scope: 'shell-exec', risk: riskTier === 'critical' ? 'critical' : 'low',
    policy: 'require-approval', defaultAction: 'allow', tenantId: 'tenant-1', userId: 'user-1',
    createdAt: '2026-08-21T12:00:00.000Z', expiresAt: '2026-08-21T12:30:00.000Z',
    maskedArgs: {}, rawArgsRef: null, origin: 'broker-native', riskTier,
    blocking: profile.blocking, lifecycleProfile: profile,
    policySnapshotDigest: approvalLifecycleProfileDigest('broker-native', profile),
    source: { contractVersion: '1.0', requestDigest: 'a'.repeat(64), reference: `source:${id}` },
    lifecycleGeneration: 'generation-1', slaStage: 'initial',
  };
}

describe('ApprovalStore governed lifecycle', () => {
  it('does not create an empty store from a read-only constructor', async () => {
    const projectRoot = await root();
    const storeDir = join(projectRoot, 'approvals');
    const store = new ApprovalStore(projectRoot, { storeDir });
    expect(store.load()).toEqual({ pending: [], approved: [], denied: [], expired: [], quarantined: [] });
    expect(existsSync(storeDir)).toBe(false);
  });

  it('blocks new governed writes while lifecycle is disabled', async () => {
    const projectRoot = await root();
    const store = new ApprovalStore(projectRoot, { storeDir: join(projectRoot, 'approvals') });
    await expect(store.createLifecycleRequest(request('disabled-1')))
      .rejects.toMatchObject<Partial<ApprovalStoreError>>({ code: 'APR_STORE_LIFECYCLE_DISABLED' });
  });

  it('creates private v2 bytes and rejects duplicate ids first-writer-wins', async () => {
    const projectRoot = await root();
    const storeDir = join(projectRoot, 'approvals');
    const store = new ApprovalStore(projectRoot, { storeDir, lifecycle: enabledPolicy });
    const value = request('created-1');
    await expect(store.createLifecycleRequest(value)).resolves.toEqual(value);
    await expect(store.createLifecycleRequest(value))
      .rejects.toMatchObject<Partial<ApprovalStoreError>>({ code: 'APR_STORE_ALREADY_TERMINAL' });
    expect((await stat(join(storeDir, 'created-1.request.json'))).mode & 0o077).toBe(0);
  });

  it('applies a later per-field tightening and lets expiry win a late human decision', async () => {
    const projectRoot = await root();
    const storeDir = join(projectRoot, 'approvals');
    let now = new Date('2026-08-21T12:00:00.000Z');
    const tightened = resolveApprovalLifecyclePolicy({
      enabled: true,
      profiles: {
        'broker-native': {
          ttlMs: 60_000, slaMs: [10_000, 20_000, 30_000], riskTier: 'critical',
          timeoutDisposition: 'deny-expire', blocking: 'security',
        },
      },
    });
    const store = new ApprovalStore(projectRoot, { storeDir, lifecycle: tightened, clock: () => now });
    await store.createLifecycleRequest(request('tightened-1', 'routine'));
    expect(store.load().pending[0]?.lifecycle).toMatchObject({
      effectiveExpiresAt: '2026-08-21T12:01:00.000Z', riskTier: 'critical', policyTransitionChanged: true,
    });
    expect(store.persistPolicyTransitions(now)).toEqual([
      expect.objectContaining({
        requestId: 'tightened-1', kind: 'policy-transition', transitionChanged: true,
        authoredPolicyDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
        appliedPolicyDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      }),
    ]);
    expect(store.persistPolicyTransitions(now)).toEqual([]);

    now = new Date('2026-08-21T12:01:00.000Z');
    expect(() => store.transition('tightened-1', 'approved', {
      decision: 'allow', decidedBy: 'user-1', channel: 'terminal', decidedAt: now.toISOString(),
    })).toThrowError(expect.objectContaining<Partial<ApprovalStoreError>>({ code: 'APR_STORE_EXPIRED' }));

    const receipt = store.getTimeoutReceipt('tightened-1');
    expect(receipt).toMatchObject({
      actor: 'system:expiry', kind: 'timeout-disposition', action: 'deny',
      terminalState: 'EXPIRED', riskTier: 'critical', replayAllowed: false, accessGrantAllowed: false,
    });
    const decision = JSON.parse(await readFile(join(storeDir, 'tightened-1.decision.json'), 'utf8'));
    expect(decision).toMatchObject({ decision: 'deny', decidedBy: 'system:expiry', closureReason: 'expired' });
  });

  it('continues draining a durable request after gate-off and writes one idempotent receipt', async () => {
    const projectRoot = await root();
    const storeDir = join(projectRoot, 'approvals');
    const creator = new ApprovalStore(projectRoot, { storeDir, lifecycle: enabledPolicy });
    await creator.createLifecycleRequest(request('drain-1'));

    const disabled = resolveApprovalLifecyclePolicy({ enabled: false });
    const draining = new ApprovalStore(projectRoot, {
      storeDir, lifecycle: disabled, clock: () => new Date('2026-08-21T12:30:00.000Z'),
    });
    expect(draining.sweepExpired()).toEqual(['drain-1']);
    const firstReceipt = await readFile(join(storeDir, 'drain-1.timeout.json'), 'utf8');
    expect(draining.sweepExpired()).toEqual([]);
    expect(await readFile(join(storeDir, 'drain-1.timeout.json'), 'utf8')).toBe(firstReceipt);
  });

  it('surfaces corrupt request bytes as quarantine instead of hiding the origin', async () => {
    const projectRoot = await root();
    const storeDir = join(projectRoot, 'approvals');
    await mkdir(storeDir, { recursive: true });
    await writeFile(join(storeDir, 'broken.request.json'), '{not-json', 'utf8');
    const store = new ApprovalStore(projectRoot, { storeDir, lifecycle: enabledPolicy });
    expect(store.load().quarantined).toEqual([{
      file: 'broken.request.json', sourceReference: 'approval-file:broken.request.json', reasonCode: 'unreadable-json',
    }]);
  });
});
