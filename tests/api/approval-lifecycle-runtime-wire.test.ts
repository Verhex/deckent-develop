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
import { vi } from "vitest";
import { type AcceptanceConfirmationRuntimeAuditEvent } from "../../src/api/server.js";
import { ACCEPTANCE_CONFIRMATION_MAX_CANDIDATES } from "../../src/core/confirmation-store.js";
import { acceptanceConfirmationDigest, deriveAcceptanceConfirmationId, type AcceptanceConfirmationLineage, type AcceptanceConfirmationReceipt } from "../../src/core/acceptance-confirmation-contract.js";
import type { AcceptanceConfirmationServiceDeps, AcceptanceRouteRecord, VerifiedAcceptanceDecision } from "../../src/orchestra/acceptance-confirmation-service.js";

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

// WIRE-004: physically merged from tests/api/acceptance-confirmation-runtime-wire.test.ts.
{
const roots: string[] = [];

const apis: HttpApi[] = [];

afterEach(async () => {
    await Promise.all(apis.splice(0).map((api) => api.close()));
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe('acceptance-confirmation production lifecycle composition', () => {
    it('drains durable settlement with exact authority while creation policy is disabled', async () => {
        const root = mkdtempSync(join(tmpdir(), 'deckent-acceptance-runtime-'));
        roots.push(root);
        const digest = (value: string) => acceptanceConfirmationDigest(value);
        const lineage: AcceptanceConfirmationLineage = {
            tenantId: 'tenant-1', projectId: 'project-1', sprintId: 'sprint-610', taskId: '610-016',
            attemptId: 'attempt-1', generation: 1, evaluationDigest: digest('evaluation'),
            resultDigest: digest('result'), policyDigest: digest('policy'), sourceDigest: digest('source'),
        };
        const confirmationId = deriveAcceptanceConfirmationId(lineage);
        const route: AcceptanceRouteRecord = {
            confirmationId, lineage, sourceVerdict: 'UNDECIDABLE',
        };
        const decision: VerifiedAcceptanceDecision = {
            confirmationId, lineage, verdict: 'CONFIRMED', decidedAt: '2026-08-21T00:00:00.000Z',
            authorityReceipt: 'signed-authority-receipt',
        };
        const receipts = new Map<string, AcceptanceConfirmationReceipt>();
        const transitionExact = vi.fn(async () => 'applied' as const);
        const createPending = vi.fn(async () => ({ state: 'conflict' as const }));
        const service: AcceptanceConfirmationServiceDeps = {
            confirmations: {
                createFirstWriterWins: createPending,
                async readFresh() { return { route, decision }; },
            },
            debts: {
                createFirstWriterWins: createPending,
                transitionExact,
            },
            receipts: {
                async appendFirstWriterWins(receipt) {
                    const key = `${receipt.confirmationId}:${receipt.state}`;
                    const prior = receipts.get(key);
                    if (prior)
                        return { state: 'replayed' as const, receipt: prior };
                    receipts.set(key, receipt);
                    return { state: 'created' as const, receipt };
                },
                async read(id, state) { return receipts.get(`${id}:${state}`); },
            },
            verifyAuthority: async () => true,
        };
        const audits: AcceptanceConfirmationRuntimeAuditEvent[] = [];
        const api = createHttpServer(root, {
            port: 0,
            approvalExpirySweepMs: 10,
            // The default resolved lifecycle is disabled. Existing durable work must
            // still drain, without invoking either create-first-writer-wins port.
            acceptanceConfirmation: {
                authority: { tenantId: 'tenant-1', projectRoot: root },
                reconciler: {
                    confirmations: {
                        async scanTenantPartition(input) {
                            expect(input).toEqual({
                                tenantId: 'tenant-1',
                                after: null,
                                limit: ACCEPTANCE_CONFIRMATION_MAX_CANDIDATES,
                            });
                            return {
                                rows: [{
                                        tenantId: 'tenant-1', confirmationId,
                                        terminalState: 'TERMINAL',
                                    }],
                                nextCursor: null,
                            };
                        },
                    },
                    receiptStates: {
                        async readTenantPage() { return []; },
                    },
                    service,
                },
                clock: () => new Date('2026-08-21T01:02:03.000Z'),
                writeAudit: (event) => { audits.push(event); },
            },
        });
        apis.push(api);
        await new Promise((resolve) => setTimeout(resolve, 60));
        expect(transitionExact).toHaveBeenCalledWith(expect.objectContaining({
            route: expect.objectContaining({ confirmationId }),
            settlement: expect.objectContaining({ debtDisposition: 'resolved', receiptDisposition: 'APPLIED' }),
        }));
        expect(createPending).not.toHaveBeenCalled();
        expect(audits[0]).toMatchObject({
            kind: 'acceptance-confirmation-reconciliation', tenantId: 'tenant-1',
            projectRoot: root, observedAt: '2026-08-21T01:02:03.000Z',
            status: 'succeeded', correlationId: expect.any(String),
            result: { reconciled: 1, held: 0 },
        });
    });
    it('close waits for an in-flight reconciliation and restart safely replays it', async () => {
        const root = mkdtempSync(join(tmpdir(), 'deckent-acceptance-restart-'));
        roots.push(root);
        let release!: () => void;
        const blocked = new Promise<void>((resolve) => { release = resolve; });
        let scans = 0;
        const audit = vi.fn();
        const runtime = {
            authority: { tenantId: 'tenant-restart', projectRoot: root },
            reconciler: {
                confirmations: {
                    async scanTenantPartition() {
                        scans += 1;
                        if (scans === 1)
                            await blocked;
                        return { rows: [], nextCursor: null };
                    },
                },
                receiptStates: { async readTenantPage() { return []; } },
                service: {} as AcceptanceConfirmationServiceDeps,
            },
            clock: () => new Date('2026-08-21T00:00:00.000Z'),
            writeAudit: audit,
        };
        const first = createHttpServer(root, {
            port: 0, approvalExpirySweepMs: 10, acceptanceConfirmation: runtime,
        });
        apis.push(first);
        await new Promise((resolve) => setTimeout(resolve, 20));
        let closed = false;
        const closing = first.close().then(() => { closed = true; });
        apis.splice(apis.indexOf(first), 1);
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(closed).toBe(false);
        release();
        await closing;
        expect(audit).toHaveBeenCalledTimes(1);
        const restarted = createHttpServer(root, {
            port: 0, approvalExpirySweepMs: 10, acceptanceConfirmation: runtime,
        });
        apis.push(restarted);
        await new Promise((resolve) => setTimeout(resolve, 25));
        expect(scans).toBeGreaterThanOrEqual(2);
    });
    it('coalesces overlapping ticks and emits a correlated JSON failure audit', async () => {
        const root = mkdtempSync(join(tmpdir(), 'deckent-acceptance-overlap-'));
        roots.push(root);
        let release!: () => void;
        const blocked = new Promise<void>((resolve) => { release = resolve; });
        let active = 0;
        let maximumActive = 0;
        const audits: AcceptanceConfirmationRuntimeAuditEvent[] = [];
        const api = createHttpServer(root, {
            port: 0,
            approvalExpirySweepMs: 5,
            acceptanceConfirmation: {
                authority: { tenantId: 'tenant-overlap', projectRoot: root },
                pageSize: 7,
                reconciler: {
                    confirmations: {
                        async scanTenantPartition(input) {
                            expect(input.limit).toBe(7);
                            active += 1;
                            maximumActive = Math.max(maximumActive, active);
                            await blocked;
                            active -= 1;
                            throw new Error('durable scan unavailable');
                        },
                    },
                    receiptStates: { async readTenantPage() { return []; } },
                    service: {} as AcceptanceConfirmationServiceDeps,
                },
                clock: () => new Date('2026-08-21T03:04:05.000Z'),
                writeAudit(event) { audits.push(event); },
            },
        });
        apis.push(api);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(maximumActive).toBe(1);
        release();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(audits[0]).toMatchObject({
            kind: 'acceptance-confirmation-reconciliation',
            status: 'failed',
            tenantId: 'tenant-overlap',
            projectRoot: root,
            observedAt: '2026-08-21T03:04:05.000Z',
            correlationId: expect.any(String),
            error: 'durable scan unavailable',
        });
        expect(() => JSON.stringify(audits[0])).not.toThrow();
    });
});
}
