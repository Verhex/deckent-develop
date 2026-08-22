import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createHttpServer,
  type AcceptanceConfirmationRuntimeAuditEvent,
  type HttpApi,
} from '../../src/api/server.js';
import { ACCEPTANCE_CONFIRMATION_MAX_CANDIDATES } from '../../src/core/confirmation-store.js';
import {
  acceptanceConfirmationDigest,
  deriveAcceptanceConfirmationId,
  type AcceptanceConfirmationLineage,
  type AcceptanceConfirmationReceipt,
} from '../../src/core/acceptance-confirmation-contract.js';
import type {
  AcceptanceConfirmationServiceDeps,
  AcceptanceRouteRecord,
  VerifiedAcceptanceDecision,
} from '../../src/orchestra/acceptance-confirmation-service.js';

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
          if (prior) return { state: 'replayed' as const, receipt: prior };
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
            if (scans === 1) await blocked;
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
