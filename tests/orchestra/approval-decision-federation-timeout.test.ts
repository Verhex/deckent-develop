import { describe, expect, it, onTestFinished } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ApprovalTimeoutReceipt } from '../../src/core/approval-store.js';
import { ApprovalBroker } from '../../src/core/approval-broker.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';
import {
  createConfirmationRequest,
  readConfirmation,
} from '../../src/core/confirmation-store.js';
import {
  loadGatewayAccess,
  parseGatewayPairingStore,
} from '../../src/connectors/gateway/gateway-access.js';
import { makeApprovalGate } from '../../src/orchestra/autonomous/approval-adapter.js';
import {
  settleFederatedTimeoutReceipt,
  settlePendingFederatedTimeoutReceipts,
  mirrorFederatedItemToBroker,
} from '../../src/orchestra/approval-decision-federation.js';

function rootFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'decision-federation-timeout-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function receipt(
  requestId: string,
  origin: ApprovalTimeoutReceipt['origin'],
  expiresAt: string,
  tenantId = 'tenant-a',
): ApprovalTimeoutReceipt {
  const parked = origin === 'confirmation' || origin === 'autonomous-trigger';
  return {
    schemaVersion: 1,
    requestId,
    tenantId,
    scopeId: origin,
    sourceReference: `${origin}:${requestId}`,
    origin,
    lifecycleGeneration: `${origin}:generation-1`,
    actor: 'system:expiry',
    kind: 'timeout-disposition',
    action: parked ? 'park' : 'deny',
    terminalState: origin === 'confirmation' ? 'UNDECIDABLE' : 'EXPIRED',
    riskTier: origin === 'gateway-pairing' ? 'critical' : 'elevated',
    expiresAt,
    decidedAt: expiresAt,
    authoredPolicyDigest: 'a'.repeat(64),
    appliedPolicyDigest: 'a'.repeat(64),
    replayAllowed: false,
    accessGrantAllowed: false,
  };
}

describe('timeout decision federation', () => {
  it('mirrors from the original source clock, preserves shorter expiry, and rejects tenant/id collisions', async () => {
    const root = rootFixture();
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    const broker = new ApprovalBroker(root, { lifecycle, clock: () => new Date('2026-08-21T17:00:00.000Z') });
    const item = {
      origin: 'confirmation' as const,
      id: 'cnf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      summary: 'source-clock mirror',
      decideHintKey: 'approvals.federated.hint_confirmation',
      requestedAt: '2026-08-21T10:00:00.000Z',
      expiresAt: '2026-08-21T12:00:00.000Z',
      tenantId: 'tenant-a',
      sourceReference: 'confirmation-source:abc',
      riskTier: 'critical' as const,
    };
    const first = await mirrorFederatedItemToBroker(broker, item, {
      tenantId: 'tenant-a', now: new Date('2026-08-21T17:00:00.000Z'),
    });
    expect(first).toMatchObject({
      createdAt: item.requestedAt,
      expiresAt: item.expiresAt,
      origin: 'confirmation',
      riskTier: 'critical',
    });
    await expect(mirrorFederatedItemToBroker(broker, item, { tenantId: 'tenant-a' })).resolves.toEqual(first);
    await expect(mirrorFederatedItemToBroker(broker, item, { tenantId: 'tenant-b' }))
      .rejects.toThrow(/identity collision/u);
  });

  it('parks a confirmation as system UNDECIDABLE and publishes a restart-idempotent ACK', async () => {
    const root = rootFixture();
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    const createdAt = '2026-08-21T10:00:00.000Z';
    const { id } = createConfirmationRequest(root, {
      sprintId: 's-timeout', taskId: 't-timeout', itemIds: [], kind: 'security',
      verdict: 'QUALIFIED', adapter: 'human', statements: ['owner decision'],
      evidenceRequirements: [], requestedAt: createdAt, source: 'acceptance-matrix',
    }, { lifecycle, clock: () => new Date(createdAt), tenantId: 'tenant-a' });
    const timeout = receipt(id, 'confirmation', '2026-08-21T18:00:00.000Z');

    await expect(settleFederatedTimeoutReceipt(root, timeout)).resolves.toMatchObject({
      state: 'settled', origin: 'confirmation',
    });
    const settled = readConfirmation(root, id, { clock: () => new Date(timeout.decidedAt) });
    expect(settled?.state).toBe('settled');
    if (settled?.state === 'settled') {
      expect(settled.request.outcome).toMatchObject({
        verdict: 'UNDECIDABLE', decidedBy: 'system:expiry', closureReason: 'expired', parked: true,
      });
    }
    await expect(settleFederatedTimeoutReceipt(root, timeout)).resolves.toMatchObject({
      state: 'already-settled', origin: 'confirmation',
    });
  });

  it('settles autonomous timeout without replay and preserves a prior human FWW winner', async () => {
    const root = rootFixture();
    const pendingPath = join(root, '.deckent', 'autonomous', 'pending.json');
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    const gate = makeApprovalGate({
      pendingPath,
      lifecycle,
      now: () => '2026-08-21T10:00:00.000Z',
      principal: { id: 'producer', tenantId: 'tenant-a' },
      strictTenantIsolation: true,
    });
    await gate.request({
      id: 'autonomous-timeout', source: 'test', action: 'run', requestedBy: 'policy',
    });
    const timeout = receipt('autonomous-timeout', 'autonomous-trigger', '2026-08-21T11:00:00.000Z');

    await expect(settleFederatedTimeoutReceipt(root, timeout)).resolves.toMatchObject({
      state: 'settled', origin: 'autonomous-trigger',
    });
    const restarted = makeApprovalGate({
      pendingPath,
      lifecycle,
      now: () => timeout.decidedAt,
      principal: { id: 'reader', tenantId: 'tenant-a' },
      strictTenantIsolation: true,
    });
    expect(restarted.readTerminal('autonomous-timeout')).toMatchObject({
      kind: 'timeout', closureReason: 'expired', replayAllowed: false,
    });
    expect(restarted.takeResolved()).toBeNull();

    const human = makeApprovalGate({
      pendingPath,
      lifecycle,
      now: () => '2026-08-21T10:00:00.000Z',
      principal: { id: 'producer', tenantId: 'tenant-a' },
      strictTenantIsolation: true,
    });
    await human.request({ id: 'autonomous-human', source: 'test', action: 'run', requestedBy: 'policy' });
    human.accept('autonomous-human', 'reviewed');
    const losingTimeout = receipt('autonomous-human', 'autonomous-trigger', '2026-08-21T11:00:00.000Z');
    await expect(settleFederatedTimeoutReceipt(root, losingTimeout)).resolves.toEqual({
      state: 'failed', reason: 'autonomous-timeout-not-settled',
    });
    expect(human.readTerminal('autonomous-human')).toMatchObject({ kind: 'human', outcome: 'approved' });
  });

  it('expires pairing authority without granting and retries unacked durable receipts after restart', async () => {
    const root = rootFixture();
    const paths = {
      pairingsPath: join(root, 'gateway', 'pairings.json'),
      allowlistPath: join(root, 'gateway', 'allowlist.json'),
      bindingsPath: join(root, 'gateway', 'bindings.json'),
    };
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    const access = await loadGatewayAccess({
      ...paths,
      clock: () => new Date('2026-08-21T10:00:00.000Z'),
      genCode: () => 'PAIR-TIMEOUT',
      genPairingId: () => 'gwp-timeout-settle',
    });
    const request = await access.requestPairing('telegram:timeout', {
      tenantId: 'tenant-a', projectPath: '/projects/tenant-a', lifecycle,
      lifecycleGeneration: 'gateway:1', sourceReference: 'registry:/projects/tenant-a',
    });
    if (request.state !== 'PENDING') throw new Error('pairing request did not enter pending');
    const timeout = receipt(request.pairingId, 'gateway-pairing', request.expiresAt);

    const approvalDir = join(root, '.deckent', 'approvals');
    mkdirSync(approvalDir, { recursive: true });
    writeFileSync(join(approvalDir, `${request.pairingId}.timeout.json`), `${JSON.stringify(timeout, null, 2)}\n`, 'utf8');
    await expect(settlePendingFederatedTimeoutReceipts(root, {
      gatewayPairingsPath: paths.pairingsPath,
      gatewayAllowlistPath: paths.allowlistPath,
      gatewayBindingsPath: paths.bindingsPath,
    })).resolves.toEqual([{ state: 'settled', origin: 'gateway-pairing' }]);
    const parsed = parseGatewayPairingStore(JSON.parse(await import('node:fs/promises').then(fs => fs.readFile(paths.pairingsPath, 'utf8'))));
    expect(parsed.records.find((row) => row.pairingId === request.pairingId)?.state).toBe('EXPIRED');
    expect(access.isAuthorized('telegram:timeout', '/projects/tenant-a')).toBe(false);

    const replayed = await settlePendingFederatedTimeoutReceipts(root, {
      gatewayPairingsPath: paths.pairingsPath,
      gatewayAllowlistPath: paths.allowlistPath,
      gatewayBindingsPath: paths.bindingsPath,
    });
    expect(replayed).toEqual([{ state: 'already-settled', origin: 'gateway-pairing' }]);
    expect(readdirSync(join(root, '.deckent', 'approvals', 'federation-settle'))).toHaveLength(1);
  });

  it('rejects a forged critical pairing receipt that asks for permissive timeout', async () => {
    const root = rootFixture();
    const forged = { ...receipt('gwp-forged', 'gateway-pairing', '2026-08-21T10:10:00.000Z'), action: 'proceed-warn' as const };
    await expect(settleFederatedTimeoutReceipt(root, forged)).resolves.toEqual({
      state: 'failed', reason: 'timeout-receipt-semantics-mismatch',
    });
  });
});
