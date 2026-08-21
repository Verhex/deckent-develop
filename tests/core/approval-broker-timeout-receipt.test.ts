import { chmod, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ApprovalBroker,
  ApprovalBrokerError,
  isExpiredDecideResult,
} from '../../src/core/approval-broker.js';
import type { ApprovalRequestV2 } from '../../src/core/approval-contract.js';
import { approvalLifecycleProfileDigest, resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';
import { ApprovalStore } from '../../src/core/approval-store.js';

const roots: string[] = [];
const policy = resolveApprovalLifecyclePolicy({ enabled: true });

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'deckent-broker-lifecycle-'));
  roots.push(root);
  return root;
}

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function lifecycleRequest(id: string, overrides: Partial<ApprovalRequestV2> = {}): ApprovalRequestV2 {
  const profile = policy.profiles['broker-native'];
  return {
    id,
    version: '2.0',
    requester: { role: 'worker', instanceId: 'worker-lifecycle' },
    summary: 'governed broker request',
    details: { kind: 'unallowlisted-kind' },
    scopeId: 'scope-1',
    scope: 'shell-exec',
    risk: 'low',
    policy: 'require-approval',
    defaultAction: 'allow',
    tenantId: 'tenant-1',
    userId: 'user-1',
    createdAt: '2026-08-21T12:00:00.000Z',
    expiresAt: '2026-08-21T12:30:00.000Z',
    maskedArgs: {},
    rawArgsRef: null,
    origin: 'broker-native',
    riskTier: 'routine',
    blocking: profile.blocking,
    lifecycleProfile: profile,
    policySnapshotDigest: approvalLifecycleProfileDigest('broker-native', profile),
    source: { contractVersion: '1.0', requestDigest: 'a'.repeat(64), reference: `source:${id}` },
    lifecycleGeneration: 'generation-1',
    slaStage: 'initial',
    ...overrides,
  };
}

describe('ApprovalBroker lifecycle timeout authority', () => {
  it('publishes governed v2 bytes privately and blocks them when the gate is off', async () => {
    const root = await createRoot();
    const storeDir = join(root, 'approvals');
    const disabled = new ApprovalBroker(root, { storeDir });
    await expect(disabled.submitLifecycle(lifecycleRequest('broker-disabled')))
      .rejects.toMatchObject<Partial<ApprovalBrokerError>>({ code: 'APR_LIFECYCLE_DISABLED' });

    const enabled = new ApprovalBroker(root, { storeDir, lifecycle: policy });
    await expect(enabled.submitLifecycle(lifecycleRequest('broker-created')))
      .resolves.toMatchObject({ id: 'broker-created', version: '2.0' });
  });

  it('makes the central direct decide path expiry-aware and never grants critical default allow', async () => {
    const root = await createRoot();
    const storeDir = join(root, 'approvals');
    let now = new Date('2026-08-21T12:00:00.000Z');
    const broker = new ApprovalBroker(root, { storeDir, lifecycle: policy, clock: () => now });
    const profile = policy.profiles['broker-native'];
    await broker.submitLifecycle(lifecycleRequest('broker-critical', {
      risk: 'critical', riskTier: 'critical', lifecycleProfile: profile,
    }));

    now = new Date('2026-08-21T12:30:00.000Z');
    expect(() => broker.decide('broker-critical', {
      decision: 'allow', decidedBy: 'human-1', channel: 'terminal', decidedAt: now.toISOString(),
    })).toThrowError(expect.objectContaining<Partial<ApprovalBrokerError>>({ code: 'APR_EXPIRED' }));
    expect(broker.getDecision('broker-critical')).toMatchObject({
      decision: 'deny', decidedBy: 'system:expiry', channel: 'ttl-expire', closureReason: 'expired',
    });
    expect(broker.getTimeoutReceipt('broker-critical')).toMatchObject({
      action: 'deny', riskTier: 'critical', replayAllowed: false, accessGrantAllowed: false,
    });
  });

  it('returns an expired typed result from decideChecked after a fresh cross-process sweep', async () => {
    const root = await createRoot();
    const storeDir = join(root, 'approvals');
    let now = new Date('2026-08-21T12:00:00.000Z');
    const broker = new ApprovalBroker(root, { storeDir, lifecycle: policy, clock: () => now });
    await broker.submitLifecycle(lifecycleRequest('broker-checked'));
    now = new Date('2026-08-21T12:30:00.000Z');

    const result = broker.decideChecked('broker-checked', {
      decision: 'allow', decidedBy: 'human-1', channel: 'terminal', decidedAt: now.toISOString(),
    }, now);
    expect(isExpiredDecideResult(result)).toBe(true);
    expect(broker.getDecision('broker-checked')).toMatchObject({ channel: 'ttl-expire' });
  });

  it('produces byte-identical timeout receipts through broker and store sweep paths', async () => {
    const rootA = await createRoot();
    const rootB = await createRoot();
    const atExpiry = new Date('2026-08-21T12:30:00.000Z');
    const dirA = join(rootA, 'approvals');
    const dirB = join(rootB, 'approvals');
    const broker = new ApprovalBroker(rootA, { storeDir: dirA, lifecycle: policy, clock: () => atExpiry });
    const creator = new ApprovalStore(rootB, { storeDir: dirB, lifecycle: policy });
    await broker.submitLifecycle(lifecycleRequest('receipt-same'));
    await creator.createLifecycleRequest(lifecycleRequest('receipt-same'));

    expect(broker.expire(atExpiry)).toHaveLength(1);
    expect(new ApprovalStore(rootB, { storeDir: dirB, lifecycle: policy }).sweepExpired(atExpiry)).toEqual(['receipt-same']);
    expect(await readFile(join(dirA, 'receipt-same.timeout.json'), 'utf8'))
      .toBe(await readFile(join(dirB, 'receipt-same.timeout.json'), 'utf8'));
  });

  it('uses an existing valid receipt as read-only restart authority', async () => {
    if (process.platform === 'win32') return;
    const root = await createRoot();
    const storeDir = join(root, 'approvals');
    const atExpiry = new Date('2026-08-21T12:30:00.000Z');
    const broker = new ApprovalBroker(root, { storeDir, lifecycle: policy, clock: () => atExpiry });
    await broker.submitLifecycle(lifecycleRequest('receipt-restart-readonly'));
    expect(broker.expire(atExpiry)).toHaveLength(1);

    const receiptPath = join(storeDir, 'receipt-restart-readonly.timeout.json');
    const before = await readFile(receiptPath, 'utf8');
    await chmod(storeDir, 0o500);
    try {
      expect(new ApprovalStore(root, { storeDir, lifecycle: policy }).sweepExpired(atExpiry)).toEqual([]);
      expect(await readFile(receiptPath, 'utf8')).toBe(before);
    } finally {
      await chmod(storeDir, 0o700);
    }
  });

  it('has a single durable winner under a human-versus-timeout race', async () => {
    const root = await createRoot();
    const storeDir = join(root, 'approvals');
    let now = new Date('2026-08-21T12:00:00.000Z');
    const first = new ApprovalBroker(root, { storeDir, lifecycle: policy, clock: () => now });
    const second = new ApprovalBroker(root, { storeDir, lifecycle: policy, clock: () => now });
    await first.submitLifecycle(lifecycleRequest('broker-race'));
    now = new Date('2026-08-21T12:30:00.000Z');

    const outcomes = await Promise.allSettled([
      Promise.resolve().then(() => first.expire(now)),
      Promise.resolve().then(() => second.decide('broker-race', {
        decision: 'allow', decidedBy: 'human-1', channel: 'terminal', decidedAt: now.toISOString(),
      })),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const durable = JSON.parse(await readFile(join(storeDir, 'broker-race.decision.json'), 'utf8')) as { channel: string };
    expect(durable.channel).toBe('ttl-expire');
  });
});
