import { describe, expect, it, onTestFinished } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ApprovalBroker } from '../../src/core/approval-broker.js';
import type { ApprovalRequest, ApprovalRequestV2 } from '../../src/core/approval-contract.js';
import type { ApprovalTimeoutReceipt } from '../../src/core/approval-store.js';
import {
  approvalLifecycleProfileDigest,
  resolveApprovalLifecyclePolicy,
} from '../../src/core/approval-lifecycle-policy.js';
import {
  confirmationContentDigest,
  createConfirmationRequest,
  readConfirmation,
  sweepExpiredConfirmations,
  type ConfirmationIdentity,
} from '../../src/core/confirmation-store.js';
import { advanceApprovalSla, approvalSlaEventId } from '../../src/core/approval-sla.js';
import {
  _resetChainHead,
  writeApprovalLifecycleAuditEvent,
} from '../../src/core/audit-writer.js';
import { queryAudit } from '../../src/core/audit-query.js';
import {
  listFederatedPendingItems,
  type FederatedPendingItem,
} from '../../src/core/approval-inbox-federation.js';
import {
  loadGatewayAccess,
  parseGatewayPairingStore,
} from '../../src/connectors/gateway/gateway-access.js';
import { makeApprovalGate } from '../../src/orchestra/autonomous/approval-adapter.js';
import {
  mirrorFederatedItemToBroker,
  settleFederatedTimeoutReceipt,
} from '../../src/orchestra/approval-decision-federation.js';

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function federationProjectionDigest(item: FederatedPendingItem): string {
  return sha256({
    origin: item.origin,
    id: item.id,
    requestedAt: item.requestedAt ?? null,
    expiresAt: item.expiresAt ?? null,
    tenantId: item.tenantId ?? null,
    projectPath: item.projectPath ?? null,
    lifecycleGeneration: item.lifecycleGeneration ?? null,
    policySnapshotDigest: item.policySnapshotDigest ?? null,
    sourceRequestDigest: item.sourceRequestDigest ?? null,
    sourceContractVersion: item.sourceContractVersion ?? null,
    sourceSchema: item.sourceSchema ?? null,
    sourceReference: item.sourceReference ?? null,
  });
}

function requireV2(request: ApprovalRequest): ApprovalRequestV2 {
  if (request.version !== '2.0') throw new Error('expected lifecycle ApprovalRequest v2');
  return request;
}

function requireTimeoutReceipt(
  broker: ApprovalBroker,
  requestId: string,
): ApprovalTimeoutReceipt {
  const receipt = broker.getTimeoutReceipt(requestId);
  if (!receipt) throw new Error(`expected timeout receipt for ${requestId}`);
  return receipt;
}

function writeAndAssertExpiryAudit(
  root: string,
  sprintId: string,
  request: ApprovalRequestV2,
  receipt: ApprovalTimeoutReceipt,
): void {
  expect(receipt).toMatchObject({
    requestId: request.id,
    tenantId: request.tenantId,
    sourceReference: request.source.reference,
    origin: request.origin,
    lifecycleGeneration: request.lifecycleGeneration,
    expiresAt: request.expiresAt,
    authoredPolicyDigest: request.policySnapshotDigest,
    replayAllowed: false,
    accessGrantAllowed: false,
  });
  expect(receipt.appliedPolicyDigest).toBe(request.policySnapshotDigest);

  const advanced = advanceApprovalSla({
    requestId: request.id,
    lifecycleGeneration: request.lifecycleGeneration,
    createdAt: request.createdAt,
    expiresAt: receipt.expiresAt,
    policy: {
      slaMs: request.lifecycleProfile.slaMs,
      authoredPolicyDigest: receipt.authoredPolicyDigest,
      appliedPolicyDigest: receipt.appliedPolicyDigest,
    },
    clock: { now: () => new Date(receipt.decidedAt) },
  });
  const evidence = advanced.audit.find(event => event.kind === 'expired');
  if (!evidence) throw new Error(`expiry evidence missing for ${request.id}`);
  expect(evidence.eventId).toBe(
    approvalSlaEventId(request.id, request.lifecycleGeneration, 'expired'),
  );
  expect(writeApprovalLifecycleAuditEvent(root, sprintId, {
    tenantId: request.tenantId,
    requestId: request.id,
    origin: request.origin,
    sourceReference: request.source.reference,
    evidence,
  })).toBe(true);

  const audit = queryAudit(root, sprintId, { tenantId: request.tenantId }).matched;
  expect(audit).toHaveLength(1);
  expect(audit[0]?.payload).toMatchObject({
    actor: 'system:expiry',
    action: 'approval.timeout-disposition',
    target: request.id,
    correlationId: request.id,
    causationId: evidence.eventId,
    metadata: {
      origin: request.origin,
      sourceReference: request.source.reference,
      lifecycleGeneration: request.lifecycleGeneration,
      stage: 'expired',
      authoredPolicyDigest: receipt.authoredPolicyDigest,
      appliedPolicyDigest: receipt.appliedPolicyDigest,
    },
  });
}

describe('approval lifecycle closure correlation — confirmation origin', () => {
  it('preserves source/evidence/revision and policy lineage through SLA, audit, and expiry', () => {
    const root = mkdtempSync(join(tmpdir(), 'approval-closure-confirmation-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    _resetChainHead();
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    const identity: ConfirmationIdentity = {
      attemptId: 'attempt-closure-44',
      generation: 3,
      sourceDigest: confirmationContentDigest({ producer: 'evaluate', task: '609-044' }),
      evidenceDigest: confirmationContentDigest({ report: 'review.json', digest: 'evidence-44' }),
      revisionDigest: confirmationContentDigest({ revision: 'git:abc123', scope: ['src/core'] }),
    };
    let at = new Date('2026-08-21T08:00:00.000Z');
    const created = createConfirmationRequest(root, {
      sprintId: 'sprint-609', taskId: '609-044', itemIds: ['closure'],
      kind: 'security', verdict: 'UNDECIDABLE', adapter: 'human',
      statements: ['Close the approval lifecycle with full lineage'],
      evidenceRequirements: ['review.json'], requestedAt: at.toISOString(),
      source: 'acceptance-matrix', identity,
    }, { lifecycle, identity, tenantId: 'tenant-44', userId: 'owner-44', clock: () => at });
    const pending = readConfirmation(root, created.id, { lifecycle, clock: () => at });
    if (!pending || pending.state !== 'pending') throw new Error('expected pending confirmation');
    const approval = pending.request.approval;
    expect(approval.source.requestDigest).toBe(identity.sourceDigest);
    expect(approval.details).toMatchObject({
      sourceDigest: identity.sourceDigest,
      evidenceDigest: identity.evidenceDigest,
      revisionDigest: identity.revisionDigest,
    });
    expect(approval.policySnapshotDigest).toBe(
      approvalLifecycleProfileDigest('confirmation', approval.lifecycleProfile),
    );

    at = new Date('2026-08-21T08:05:00.000Z');
    const reminder = advanceApprovalSla({
      requestId: approval.id,
      lifecycleGeneration: approval.lifecycleGeneration,
      createdAt: approval.createdAt,
      expiresAt: approval.expiresAt,
      policy: {
        slaMs: approval.lifecycleProfile.slaMs,
        authoredPolicyDigest: approval.policySnapshotDigest,
        appliedPolicyDigest: approval.policySnapshotDigest,
      },
      clock: { now: () => at },
    });
    const renotify = reminder.audit.find(event => event.stage === 'renotify');
    if (!renotify) throw new Error('renotify evidence missing');
    expect(renotify.eventId).toBe(
      approvalSlaEventId(approval.id, approval.lifecycleGeneration, 'renotify'),
    );
    expect(writeApprovalLifecycleAuditEvent(root, 'approval-lifecycle', {
      tenantId: approval.tenantId,
      requestId: approval.id,
      origin: approval.origin,
      sourceReference: approval.source.reference,
      evidence: renotify,
    })).toBe(true);

    at = new Date(approval.expiresAt);
    const expiry = advanceApprovalSla({
      requestId: approval.id,
      lifecycleGeneration: approval.lifecycleGeneration,
      createdAt: approval.createdAt,
      expiresAt: approval.expiresAt,
      policy: {
        slaMs: approval.lifecycleProfile.slaMs,
        authoredPolicyDigest: approval.policySnapshotDigest,
        appliedPolicyDigest: approval.policySnapshotDigest,
      },
      clock: { now: () => at },
      state: reminder.state,
    });
    const expiredEvidence = expiry.audit.find(event => event.kind === 'expired');
    if (!expiredEvidence) throw new Error('expiry evidence missing');
    expect(writeApprovalLifecycleAuditEvent(root, 'approval-lifecycle', {
      tenantId: approval.tenantId,
      requestId: approval.id,
      origin: approval.origin,
      sourceReference: approval.source.reference,
      evidence: expiredEvidence,
    })).toBe(true);
    expect(sweepExpiredConfirmations(root, { lifecycle, clock: () => at })).toEqual([approval.id]);

    const closed = readConfirmation(root, approval.id, { lifecycle, clock: () => at });
    if (!closed || closed.state !== 'settled') throw new Error('expected settled confirmation');
    expect(closed.request.identity).toEqual(identity);
    expect(closed.request.approval.source).toEqual(approval.source);
    expect(closed.request.approval.policySnapshotDigest).toBe(approval.policySnapshotDigest);
    expect(closed.request.outcome).toMatchObject({
      verdict: 'UNDECIDABLE', decidedBy: 'system:expiry', closureReason: 'expired', parked: true,
    });

    const audit = queryAudit(root, 'approval-lifecycle', { tenantId: approval.tenantId }).matched;
    expect(audit).toHaveLength(2);
    expect(audit.map(row => row.payload)).toEqual([
      expect.objectContaining({
        correlationId: approval.id,
        causationId: renotify.eventId,
        metadata: expect.objectContaining({
          origin: 'confirmation',
          sourceReference: approval.source.reference,
          lifecycleGeneration: approval.lifecycleGeneration,
          authoredPolicyDigest: approval.policySnapshotDigest,
          appliedPolicyDigest: approval.policySnapshotDigest,
        }),
      }),
      expect.objectContaining({
        actor: 'system:expiry',
        action: 'approval.timeout-disposition',
        correlationId: approval.id,
        causationId: expiredEvidence.eventId,
        metadata: expect.objectContaining({
          sourceReference: approval.source.reference,
          stage: 'expired',
        }),
      }),
    ]);
  });
});

describe('approval lifecycle closure correlation — broker and federated origins', () => {
  it('correlates a broker-native producer through its durable receipt and expiry audit', async () => {
    const root = mkdtempSync(join(tmpdir(), 'approval-closure-broker-native-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    _resetChainHead();
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    const profile = lifecycle.profiles['broker-native'];
    let at = new Date('2026-08-21T10:00:00.000Z');
    const broker = new ApprovalBroker(root, { lifecycle, clock: () => at });
    const policySnapshotDigest = approvalLifecycleProfileDigest('broker-native', profile);
    const sourceReference = 'broker-producer:task-609-044';
    const submitted = await broker.submitLifecycle({
      id: 'broker-closure-44',
      version: '2.0',
      requester: { role: 'worker', instanceId: 'worker-closure-44' },
      summary: 'Broker-native closure correlation',
      details: { schemaVersion: 1, kind: 'approval-lifecycle-closure' },
      scopeId: 'task-609-044',
      scope: 'shell-exec',
      risk: 'low',
      policy: 'require-approval',
      defaultAction: 'deny',
      tenantId: 'tenant-broker-44',
      userId: 'user-broker-44',
      createdAt: at.toISOString(),
      expiresAt: new Date(at.getTime() + profile.ttlMs).toISOString(),
      maskedArgs: null,
      rawArgsRef: null,
      origin: 'broker-native',
      riskTier: profile.riskTier,
      blocking: profile.blocking,
      lifecycleProfile: profile,
      policySnapshotDigest,
      source: {
        contractVersion: '2.0',
        requestDigest: sha256({ producer: 'broker', task: '609-044' }),
        reference: sourceReference,
      },
      lifecycleGeneration: 'broker-native-generation-44',
      slaStage: 'initial',
    });
    if ('state' in submitted) throw new Error(`broker submission held: ${submitted.reasonCode}`);

    at = new Date(submitted.expiresAt);
    expect(broker.expire(at)).toEqual([
      expect.objectContaining({
        requestId: submitted.id,
        decision: 'deny',
        decidedBy: 'system:expiry',
        channel: 'ttl-expire',
        closureReason: 'expired',
      }),
    ]);
    const receipt = requireTimeoutReceipt(broker, submitted.id);
    expect(receipt).toMatchObject({ action: 'deny', terminalState: 'EXPIRED' });
    await expect(settleFederatedTimeoutReceipt(root, receipt)).resolves.toEqual({
      state: 'ignored', origin: 'broker-native',
    });
    writeAndAssertExpiryAudit(root, 'approval-lifecycle-broker-native', submitted, receipt);
  });

  it('correlates an autonomous producer through broker mirror, timeout settle-back, and audit', async () => {
    const root = mkdtempSync(join(tmpdir(), 'approval-closure-autonomous-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    _resetChainHead();
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    const pendingPath = join(root, '.deckent', 'autonomous', 'pending.json');
    let at = new Date(Date.now() + 60_000);
    const producer = makeApprovalGate({
      pendingPath,
      lifecycle,
      now: () => at.toISOString(),
      principal: { id: 'autonomous-producer-44', tenantId: 'tenant-autonomous-44' },
      strictTenantIsolation: true,
    });
    await expect(producer.request({
      id: 'autonomous-closure-44',
      source: 'approval-lifecycle-closure',
      action: 'run',
      requestedBy: 'policy',
    })).resolves.toMatchObject({ outcome: 'pending' });
    const produced = producer.pending()[0];
    if (!produced || produced.lifecycle?.state !== 'migrated') {
      throw new Error('expected lifecycle-authored autonomous producer row');
    }
    const originLifecycle = produced.lifecycle;
    expect(originLifecycle).toMatchObject({
      origin: 'autonomous-trigger',
      tenantId: 'tenant-autonomous-44',
      sourceReference: 'autonomous-pending:tenant-autonomous-44:autonomous-closure-44',
      policySnapshotDigest: approvalLifecycleProfileDigest(
        'autonomous-trigger',
        originLifecycle.lifecycleProfile,
      ),
    });

    const item = listFederatedPendingItems(root)
      .find(row => row.origin === 'autonomous-trigger' && row.id === produced.triggerId);
    if (!item) throw new Error('expected autonomous producer in federated inbox');
    expect(item).toMatchObject({
      expiresAt: originLifecycle.expiresAt,
      tenantId: originLifecycle.tenantId,
      riskTier: originLifecycle.riskTier,
      lifecycleStage: originLifecycle.slaStage,
      lifecycleGeneration: originLifecycle.lifecycleGeneration,
      policySnapshotDigest: originLifecycle.policySnapshotDigest,
      sourceRequestDigest: originLifecycle.sourceDigest,
      sourceContractVersion: '1.0',
      sourceSchema: 'autonomous-pending/1',
      sourceReference: originLifecycle.sourceReference,
    });
    const broker = new ApprovalBroker(root, { lifecycle, clock: () => at });
    const mirrored = requireV2(await mirrorFederatedItemToBroker(broker, item, {
      tenantId: originLifecycle.tenantId,
      now: at,
    }));
    expect(mirrored).toMatchObject({
      id: produced.triggerId,
      origin: 'autonomous-trigger',
      createdAt: originLifecycle.createdAt,
      expiresAt: originLifecycle.expiresAt,
      riskTier: originLifecycle.riskTier,
      policySnapshotDigest: originLifecycle.policySnapshotDigest,
      lifecycleGeneration: originLifecycle.lifecycleGeneration,
      source: {
        contractVersion: item.sourceContractVersion,
        requestDigest: originLifecycle.sourceDigest,
        reference: originLifecycle.sourceReference,
      },
      details: {
        origin: 'autonomous-trigger',
        legacyId: produced.triggerId,
        federationProjectionDigest: federationProjectionDigest(item),
        sourceLifecycleGeneration: originLifecycle.lifecycleGeneration,
        sourcePolicySnapshotDigest: originLifecycle.policySnapshotDigest,
        sourceRequestDigest: originLifecycle.sourceDigest,
        sourceSchema: item.sourceSchema,
      },
    });

    at = new Date(mirrored.expiresAt);
    expect(broker.expire(at)).toHaveLength(1);
    const receipt = requireTimeoutReceipt(broker, mirrored.id);
    expect(receipt).toMatchObject({ action: 'park', terminalState: 'EXPIRED' });
    await expect(settleFederatedTimeoutReceipt(root, receipt)).resolves.toEqual({
      state: 'settled', origin: 'autonomous-trigger',
    });

    const restarted = makeApprovalGate({
      pendingPath,
      lifecycle,
      now: () => receipt.decidedAt,
      principal: { id: 'autonomous-reader-44', tenantId: receipt.tenantId },
      strictTenantIsolation: true,
    });
    expect(restarted.readTerminal(mirrored.id)).toMatchObject({
      kind: 'timeout', closureReason: 'expired', replayAllowed: false,
      expiresAt: originLifecycle.expiresAt,
    });
    expect(restarted.takeResolved()).toBeNull();
    writeAndAssertExpiryAudit(root, 'approval-lifecycle-autonomous', mirrored, receipt);
  });

  it('correlates a gateway producer through broker mirror, timeout settle-back, and no-grant audit', async () => {
    const root = mkdtempSync(join(tmpdir(), 'approval-closure-gateway-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    _resetChainHead();
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    const paths = {
      pairingsPath: join(root, 'gateway', 'pairings.json'),
      allowlistPath: join(root, 'gateway', 'allowlist.json'),
      bindingsPath: join(root, 'gateway', 'bindings.json'),
    };
    let at = new Date(Date.now() + 60_000);
    const access = await loadGatewayAccess({
      ...paths,
      clock: () => at,
      genCode: () => 'CLOSE44',
      genPairingId: () => 'gwp-closure-44',
    });
    const sourceReference = 'gateway-project-registry:/projects/tenant-gateway-44';
    const nativeGeneration = 'gateway-origin-generation-44';
    const created = await access.requestPairing('telegram:closure-44', {
      tenantId: 'tenant-gateway-44',
      projectPath: '/projects/tenant-gateway-44',
      lifecycle,
      lifecycleGeneration: nativeGeneration,
      sourceReference,
    });
    if (created.state !== 'PENDING') throw new Error(`pairing creation held: ${created.reasonCode}`);
    const produced = access.listPairings().find(row => row.pairingId === created.pairingId);
    if (!produced) throw new Error('expected pending gateway producer row');
    expect(produced).toMatchObject({
      origin: 'gateway-pairing',
      lifecycleGeneration: nativeGeneration,
      source: { reference: sourceReference },
      policySnapshotDigest: approvalLifecycleProfileDigest(
        'gateway-pairing',
        produced.lifecycleProfile,
      ),
    });

    const item = listFederatedPendingItems(root, { gatewayHomeDir: join(root, 'gateway') })
      .find(row => row.origin === 'gateway-pairing' && row.id === produced.pairingId);
    if (!item) throw new Error('expected gateway producer in federated inbox');
    expect(item).toMatchObject({
      requestedAt: produced.createdAt,
      expiresAt: produced.expiresAt,
      tenantId: produced.tenantId,
      projectPath: produced.projectPath,
      riskTier: produced.riskTier,
      lifecycleStage: produced.slaStage,
      lifecycleGeneration: produced.lifecycleGeneration,
      policySnapshotDigest: produced.policySnapshotDigest,
      sourceRequestDigest: produced.source.requestDigest,
      sourceContractVersion: '1.0',
      sourceSchema: produced.source.contractVersion,
      sourceReference: produced.source.reference,
    });
    const broker = new ApprovalBroker(root, { lifecycle, clock: () => at });
    const mirrored = requireV2(await mirrorFederatedItemToBroker(broker, item, {
      tenantId: produced.tenantId,
      now: at,
    }));
    expect(mirrored).toMatchObject({
      id: produced.pairingId,
      origin: 'gateway-pairing',
      createdAt: produced.createdAt,
      expiresAt: produced.expiresAt,
      riskTier: 'critical',
      policySnapshotDigest: produced.policySnapshotDigest,
      lifecycleGeneration: nativeGeneration,
      source: {
        contractVersion: item.sourceContractVersion,
        requestDigest: produced.source.requestDigest,
        reference: produced.source.reference,
      },
      details: {
        origin: 'gateway-pairing',
        legacyId: produced.pairingId,
        federationProjectionDigest: federationProjectionDigest(item),
        sourceLifecycleGeneration: nativeGeneration,
        sourcePolicySnapshotDigest: produced.policySnapshotDigest,
        sourceRequestDigest: produced.source.requestDigest,
        sourceSchema: produced.source.contractVersion,
      },
    });

    at = new Date(mirrored.expiresAt);
    expect(broker.expire(at)).toHaveLength(1);
    const receipt = requireTimeoutReceipt(broker, mirrored.id);
    expect(receipt).toMatchObject({
      action: 'deny', terminalState: 'EXPIRED', riskTier: 'critical',
    });
    await expect(settleFederatedTimeoutReceipt(root, receipt, {
      gatewayPairingsPath: paths.pairingsPath,
      gatewayAllowlistPath: paths.allowlistPath,
      gatewayBindingsPath: paths.bindingsPath,
    })).resolves.toEqual({ state: 'settled', origin: 'gateway-pairing' });

    const parsed = parseGatewayPairingStore(JSON.parse(readFileSync(paths.pairingsPath, 'utf8')));
    expect(parsed.records.find(row => row.pairingId === produced.pairingId)).toMatchObject({
      state: 'EXPIRED',
      decidedAt: receipt.decidedAt,
      lifecycleGeneration: nativeGeneration,
      policySnapshotDigest: receipt.authoredPolicyDigest,
      source: { reference: receipt.sourceReference },
    });
    expect(access.getPairingTimeoutReceipt(produced.pairingId)).toMatchObject({
      requestId: produced.pairingId,
      lifecycleGeneration: nativeGeneration,
      sourceReference: receipt.sourceReference,
      authoredPolicyDigest: receipt.authoredPolicyDigest,
      appliedPolicyDigest: receipt.appliedPolicyDigest,
      replayAllowed: false,
      accessGrantAllowed: false,
    });
    expect(access.isAuthorized(produced.chatKey, produced.projectPath)).toBe(false);
    writeAndAssertExpiryAudit(root, 'approval-lifecycle-gateway', mirrored, receipt);
  });
});
