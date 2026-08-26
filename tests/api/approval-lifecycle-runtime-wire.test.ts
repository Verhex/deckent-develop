import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createHttpServer, type HttpApi } from '../../src/api/server.js';
import type { TelegramApprovalTransport } from '../../src/connectors/approval-telegram.js';
import type { OutgoingMessage } from '../../src/connectors/types.js';
import type { ApprovalRequestV2 } from '../../src/core/approval-contract.js';
import { approvalLifecycleProfileDigest, resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';
import { createConfirmationRequest, readConfirmation } from '../../src/core/confirmation-store.js';
import { makeApprovalGate } from '../../src/orchestra/autonomous/approval-adapter.js';
import { loadGatewayAccess, parseGatewayPairingStore } from '../../src/connectors/gateway/gateway-access.js';
import { listFederatedPendingItems } from '../../src/core/approval-inbox-federation.js';
import { mirrorFederatedItemToBroker } from '../../src/orchestra/approval-decision-federation.js';

const roots: string[] = [];
const apis: HttpApi[] = [];

afterEach(async () => {
  await Promise.all(apis.splice(0).map((api) => api.close()));
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

function request(id: string, createdAt: Date, expiresAt: Date): ApprovalRequestV2 {
  const policy = resolveApprovalLifecyclePolicy({ enabled: true });
  const profile = policy.profiles['broker-native'];
  return {
    id, version: '2.0', requester: { role: 'worker', instanceId: 'worker-api-wire' },
    summary: 'runtime lifecycle wire', details: { kind: 'unallowlisted-kind' },
    scopeId: 'sprint-api-wire', scope: 'shell-exec', risk: 'low', policy: 'require-approval',
    defaultAction: 'deny', tenantId: 'tenant-1', userId: 'user-1',
    createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString(),
    maskedArgs: {}, rawArgsRef: null, origin: 'broker-native', riskTier: 'routine',
    blocking: profile.blocking, lifecycleProfile: profile,
    policySnapshotDigest: approvalLifecycleProfileDigest('broker-native', profile),
    source: { contractVersion: '1.0', requestDigest: 'a'.repeat(64), reference: `source:${id}` },
    lifecycleGeneration: 'generation-api-wire', slaStage: 'initial',
  };
}

describe('API approval lifecycle production composition', () => {
  it('wires config, startup/scheduled SLA relay, durable ACK and timeout receipt end to end', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-api-lifecycle-wire-'));
    roots.push(root);
    const sent: OutgoingMessage[] = [];
    const telegram: TelegramApprovalTransport = {
      async sendMessage(message) { sent.push(message); },
      onCallback() {},
    };
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    const api = createHttpServer(root, {
      port: 0,
      approvalExpirySweepMs: 20,
      approvalLifecycle: lifecycle,
      approvalChannelsConfig: {
        approval_channels: { telegram: { enabled: true, chat_id: 'ops', lang: 'en' } },
      },
      approvalTransports: { telegram },
    });
    apis.push(api);

    const createdAt = new Date();
    await api.approvalBroker!.submitLifecycle(request(
      'api-lifecycle-wire', createdAt, new Date(createdAt.getTime() + 180),
    ));
    await new Promise((resolve) => setTimeout(resolve, 320));

    expect(sent.length).toBeGreaterThanOrEqual(3); // pending + initial + expired
    expect(sent.some((message) => message.text.includes('Approval requested'))).toBe(true);
    expect(sent.some((message) => message.text.includes('Approval expired'))).toBe(true);
    const storeDir = join(root, '.deckent', 'approvals');
    expect(JSON.parse(readFileSync(join(storeDir, 'api-lifecycle-wire.decision.json'), 'utf8')))
      .toMatchObject({ channel: 'ttl-expire', decidedBy: 'system:expiry', closureReason: 'expired' });
    expect(JSON.parse(readFileSync(join(storeDir, 'api-lifecycle-wire.timeout.json'), 'utf8')))
      .toMatchObject({ requestId: 'api-lifecycle-wire', replayAllowed: false, accessGrantAllowed: false });
  });

  it('keeps lifecycle gate-off fail-closed for new governed requests', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-api-lifecycle-disabled-'));
    roots.push(root);
    const api = createHttpServer(root, { port: 0 });
    apis.push(api);
    const createdAt = new Date();
    await expect(api.approvalBroker!.submitLifecycle(request(
      'api-lifecycle-disabled', createdAt, new Date(createdAt.getTime() + 1_000),
    ))).rejects.toMatchObject({ code: 'APR_LIFECYCLE_DISABLED' });
  });

  it('sweeps unattended confirmation, autonomous and pairing stores on startup', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-api-legacy-lifecycle-wire-'));
    roots.push(root);
    const gatewayRoot = join(root, 'gateway');
    const previousGatewayHome = process.env['DECKENT_GATEWAY_HOME'];
    process.env['DECKENT_GATEWAY_HOME'] = gatewayRoot;
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    const current = new Date();
    const confirmationAt = new Date(current.getTime() - lifecycle.profiles.confirmation.ttlMs - 1_000);
    const autonomousAt = new Date(current.getTime() - lifecycle.profiles['autonomous-trigger'].ttlMs - 1_000);
    const pairingAt = new Date(current.getTime() - lifecycle.profiles['gateway-pairing'].ttlMs - 1_000);
    let api: HttpApi | undefined;
    try {
      const confirmation = createConfirmationRequest(root, {
        sprintId: 'runtime-wire', taskId: 'confirmation', itemIds: [], kind: 'security',
        verdict: 'QUALIFIED', adapter: 'human', statements: ['unattended'],
        evidenceRequirements: [], requestedAt: confirmationAt.toISOString(), source: 'acceptance-matrix',
      }, { lifecycle, clock: () => confirmationAt });
      const pendingPath = join(root, '.deckent', 'autonomous', 'pending.json');
      const autonomous = makeApprovalGate({
        pendingPath, projectRoot: root, lifecycle, now: () => autonomousAt.toISOString(),
      });
      await autonomous.request({ id: 'unattended-autonomous', source: 'test', action: 'run', requestedBy: 'policy' });
      const gateway = await loadGatewayAccess({
        pairingsPath: join(gatewayRoot, 'pairings.json'),
        allowlistPath: join(gatewayRoot, 'allowlist.json'),
        bindingsPath: join(gatewayRoot, 'bindings.json'),
        clock: () => pairingAt,
        genCode: () => 'UNATTENDED',
        genPairingId: () => 'gwp-unattended',
      });
      await gateway.requestPairing('telegram:unattended', {
        tenantId: 'local', projectPath: root, lifecycle,
        lifecycleGeneration: 'runtime-wire:1', sourceReference: `project:${root}`,
      });

      api = createHttpServer(root, {
        port: 0,
        approvalExpirySweepMs: 20,
        approvalLifecycle: lifecycle,
      });
      apis.push(api);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(readConfirmation(root, confirmation.id)?.state).toBe('settled');
      const autonomousRestart = makeApprovalGate({ pendingPath, projectRoot: root, lifecycle });
      expect(autonomousRestart.readTerminal('unattended-autonomous')).toMatchObject({
        kind: 'timeout', closureReason: 'expired', replayAllowed: false,
      });
      expect(autonomousRestart.takeResolved()).toBeNull();
      const pairings = parseGatewayPairingStore(JSON.parse(readFileSync(join(gatewayRoot, 'pairings.json'), 'utf8')));
      expect(pairings.records.find((record) => record.pairingId === 'gwp-unattended')).toMatchObject({
        state: 'EXPIRED',
      });
      expect(gateway.isAuthorized('telegram:unattended', root)).toBe(false);

      await api.close();
      apis.splice(apis.indexOf(api), 1);
      api = undefined;
    } finally {
      if (api) {
        await api.close();
        apis.splice(apis.indexOf(api), 1);
      }
      if (previousGatewayHome === undefined) delete process.env['DECKENT_GATEWAY_HOME'];
      else process.env['DECKENT_GATEWAY_HOME'] = previousGatewayHome;
    }
  });

  it('runs broker timeout settle-back and durable federation ACK in the scheduled composition', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-api-timeout-settleback-wire-'));
    roots.push(root);
    const lifecycle = resolveApprovalLifecyclePolicy({
      enabled: true,
      profiles: { confirmation: { ttlMs: 200, slaMs: [30, 60, 100] } },
    });
    const createdAt = new Date();
    const confirmation = createConfirmationRequest(root, {
      sprintId: 'runtime-wire', taskId: 'settleback', itemIds: [], kind: 'security',
      verdict: 'QUALIFIED', adapter: 'human', statements: ['scheduled settleback'],
      evidenceRequirements: [], requestedAt: createdAt.toISOString(), source: 'acceptance-matrix',
    }, { lifecycle, clock: () => createdAt, tenantId: 'tenant-settleback' });
    const api = createHttpServer(root, {
      port: 0,
      approvalExpirySweepMs: 20,
      approvalLifecycle: lifecycle,
    });
    apis.push(api);
    const item = listFederatedPendingItems(root).find((row) => row.id === confirmation.id);
    if (!item) throw new Error('confirmation was not visible in federated inbox');
    await mirrorFederatedItemToBroker(api.approvalBroker!, item, {
      tenantId: 'tenant-settleback', now: createdAt,
    });

    await new Promise((resolve) => setTimeout(resolve, 350));
    const settled = readConfirmation(root, confirmation.id);
    expect(settled?.state).toBe('settled');
    if (settled?.state === 'settled') {
      expect(settled.request.outcome).toMatchObject({
        decidedBy: 'system:expiry', verdict: 'UNDECIDABLE', closureReason: 'expired',
      });
    }
    expect(readdirSync(join(root, '.deckent', 'approvals', 'federation-settle'))).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(root, '.deckent', 'approvals', `${confirmation.id}.timeout.json`), 'utf8')))
      .toMatchObject({ requestId: confirmation.id, origin: 'confirmation', replayAllowed: false });
  });
});
