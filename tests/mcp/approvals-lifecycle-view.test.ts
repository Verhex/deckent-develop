import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

const state = vi.hoisted(() => ({
  snapshot: {
    pending: [] as Array<Record<string, any>>,
    approved: [] as Array<Record<string, any>>,
    denied: [] as Array<Record<string, any>>,
    expired: [] as Array<Record<string, any>>,
    quarantined: [] as Array<Record<string, any>>,
  },
  federated: [] as Array<Record<string, any>>,
  timeoutReceipts: new Map<string, Record<string, unknown>>(),
  sweepCalls: 0,
  actualFederationRoot: null as string | null,
}));

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(async () => ({
    language: 'en',
    approval: {
      lifecycle: { enabled: true },
      authority: { enabled: true, tenant_id: 'tenant-mcp' },
    },
  })),
}));

vi.mock('../../src/core/approval-store.js', () => ({
  ApprovalStore: class {
    load() { return state.snapshot; }
    sweepExpired() { state.sweepCalls += 1; return []; }
    getTimeoutReceipt(id: string) { return state.timeoutReceipts.get(id) ?? null; }
  },
}));

vi.mock('../../src/core/approval-inbox-federation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/approval-inbox-federation.js')>();
  return {
    ...actual,
    listFederatedPendingItems: (root: string, options: unknown) => state.actualFederationRoot
      ? actual.listFederatedPendingItems(state.actualFederationRoot, options as never)
      : state.federated,
  };
});

vi.mock('../../src/connectors/gateway/gateway-paths.js', () => ({
  gatewayHome: () => '/isolated/gateway',
}));

import { registerApprovalsTool } from '../../src/mcp/tools/approvals.js';
import {
  confirmationContentDigest,
  createConfirmationRequest,
} from '../../src/core/confirmation-store.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';

type ToolResult = { content: Array<{ type: string; text: string }> };
type ToolHandler = () => Promise<ToolResult>;

function server() {
  const tools = new Map<string, { config: Record<string, any>; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name: string, config: Record<string, any>, handler: ToolHandler) {
      tools.set(name, { config, handler });
    },
  };
}

beforeEach(() => {
  state.snapshot = { pending: [], approved: [], denied: [], expired: [], quarantined: [] };
  state.federated = [];
  state.timeoutReceipts.clear();
  state.sweepCalls = 0;
  state.actualFederationRoot = null;
});

function treeBytes(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (dir: string, prefix = ''): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const relative = join(prefix, name);
      if (statSync(path).isDirectory()) visit(path, relative);
      else out[relative] = readFileSync(path).toString('base64');
    }
  };
  visit(root);
  return out;
}

describe('deckent_approvals lifecycle read model', () => {
  it('projects effective lifecycle, lineage, quarantine and timeout audit without any write ingress', async () => {
    const request = {
      version: '2.0',
      id: 'mcp-pending-1',
      summary: 'Rotate production credential',
      expiresAt: '2026-08-21T12:30:00.000Z',
      origin: 'broker-native',
      riskTier: 'routine',
      slaStage: 'alternate-channel',
      lifecycleGeneration: 'generation-mcp-9',
      policySnapshotDigest: 'c'.repeat(64),
      source: { reference: 'request-source:mcp-pending-1' },
      tenantId: 'tenant-mcp',
    };
    state.snapshot = {
      pending: [{
        request,
        decision: null,
        lifecycle: {
          origin: 'broker-native',
          riskTier: 'critical',
          effectiveExpiresAt: '2026-08-21T12:04:00.000Z',
          appliedPolicyDigest: 'd'.repeat(64),
          policyTransitionChanged: true,
          weakeningIgnored: false,
        },
      }],
      approved: [],
      denied: [],
      expired: [{ request: { ...request, id: 'mcp-expired-1' }, decision: {} }],
      quarantined: [{
        file: 'mcp-corrupt-1.request.json',
        sourceReference: 'approval-file:mcp-corrupt-1.request.json',
        reasonCode: 'filename-id-mismatch',
      }],
    };
    state.timeoutReceipts.set('mcp-expired-1', {
      actor: 'system:expiry',
      kind: 'timeout-disposition',
      accessGrantAllowed: false,
      replayAllowed: false,
    });
    state.federated = [{
      origin: 'gateway-pairing',
      id: 'mcp-pairing-quarantine-1',
      summary: 'legacy pairing',
      decideHintKey: 'approvals.federated.hint_pairing',
      quarantined: true,
      lifecycleReasonCode: 'legacy-record',
      sourceReference: 'gateway-pairings:legacy:mcp-1',
    }];
    const mockServer = server();
    registerApprovalsTool(mockServer as unknown as McpServer);

    const tool = mockServer.tools.get('deckent_approvals')!;
    const result = await tool.handler();
    const response = JSON.parse(result.content[0]!.text) as {
      data: Record<string, any>;
      summary: string;
    };

    expect(tool.config.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    });
    expect(Object.keys(tool.config.inputSchema.shape)).toEqual([]);
    expect(response.data.pending).toEqual([expect.objectContaining({
      id: 'mcp-pending-1',
      expiresAt: '2026-08-21T12:04:00.000Z',
      riskTier: 'critical',
      lifecycleStage: 'alternate-channel',
      lifecycleGeneration: 'generation-mcp-9',
      policySnapshotDigest: 'c'.repeat(64),
      appliedPolicyDigest: 'd'.repeat(64),
      sourceReference: 'request-source:mcp-pending-1',
      policyTransitionChanged: true,
    })]);
    expect(response.data.quarantined).toEqual([expect.objectContaining({
      id: 'mcp-corrupt-1',
      sourceReference: 'approval-file:mcp-corrupt-1.request.json',
      lifecycleReasonCode: 'filename-id-mismatch',
      quarantined: true,
    })]);
    expect(response.data.federated).toEqual([expect.objectContaining({
      id: 'mcp-pairing-quarantine-1',
      sourceReference: 'gateway-pairings:legacy:mcp-1',
      lifecycleReasonCode: 'legacy-record',
      quarantined: true,
    })]);
    expect(response.data.expired).toEqual([expect.objectContaining({
      id: 'mcp-expired-1',
      lifecycleStage: 'expired',
      timeoutReceipt: expect.objectContaining({ actor: 'system:expiry', accessGrantAllowed: false }),
    })]);
    expect(response.summary).toContain('risk=critical');
    expect(response.summary).toContain('stage=alternate-channel');
    expect(state.sweepCalls).toBe(0);
  });

  it('reads a real overdue confirmation without settling, quarantining or changing any byte', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mcp-confirmation-read-only-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    const requestedAt = new Date(Date.now() - 9 * 60 * 60 * 1_000).toISOString();
    const identity = {
      attemptId: 'mcp-read-only-attempt',
      generation: 1,
      sourceDigest: confirmationContentDigest('mcp-source'),
      evidenceDigest: confirmationContentDigest('mcp-evidence'),
      revisionDigest: confirmationContentDigest('mcp-revision'),
    };
    createConfirmationRequest(root, {
      sprintId: 'sprint-mcp',
      taskId: 'mcp-overdue',
      itemIds: [],
      kind: 'audit',
      verdict: 'QUALIFIED',
      adapter: 'human',
      statements: ['read-only projection'],
      evidenceRequirements: [],
      requestedAt,
      source: 'acceptance-matrix',
      identity,
    }, {
      lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }),
      identity,
      clock: () => new Date(requestedAt),
    });
    const before = treeBytes(root);
    state.actualFederationRoot = root;
    const mockServer = server();
    registerApprovalsTool(mockServer as unknown as McpServer);

    const result = await mockServer.tools.get('deckent_approvals')!.handler();
    const response = JSON.parse(result.content[0]!.text) as { data: Record<string, any> };

    expect(response.data.federated).toEqual([]);
    expect(treeBytes(root)).toEqual(before);
    expect(Object.keys(before).some(path => path.includes('/settled/'))).toBe(false);
    expect(Object.keys(before).some(path => path.includes('/quarantine/'))).toBe(false);
    expect(state.sweepCalls).toBe(0);
  });
});
