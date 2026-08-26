import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  stdout: [] as string[],
  stderr: [] as string[],
  sweepCalls: 0,
  runtimeOpenCalls: 0,
  decisionCalls: 0,
  decisionOutcome: {
    kind: 'expired',
    requestId: 'late-request',
    expiresAt: '2026-08-21T12:01:00.000Z',
  } as Record<string, unknown>,
  brokerRequest: null as Record<string, any> | null,
}));

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(async () => ({
    language: 'en',
    approval: {
      lifecycle: { enabled: true },
      authority: { enabled: true, tenant_id: 'tenant-test', terminal: { max_auth_age_seconds: 60 } },
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

vi.mock('../../src/core/approval-authority-runtime.js', () => ({
  openApprovalAuthorityRuntime: () => {
    state.runtimeOpenCalls += 1;
    return {
      state: 'ready',
      service: {
        broker: {
          list: () => state.brokerRequest ? [state.brokerRequest] : [],
          getRequest: () => state.brokerRequest,
        },
        decideTerminal: async () => {
          state.decisionCalls += 1;
          return state.decisionOutcome;
        },
        close: vi.fn(),
      },
    };
  },
}));

vi.mock('../../src/core/approval-inbox-federation.js', () => ({
  listFederatedPendingItems: () => state.federated,
}));

vi.mock('../../src/core/approval-rules.js', () => ({
  loadApprovalRules: () => ({ rules: [], fault: null }),
  matchApprovalRule: () => null,
  promoteRuleFromDecision: vi.fn(),
  saveApprovalRules: vi.fn(),
}));

vi.mock('../../src/core/approval-rules-engine.js', () => ({ liveRuleFor: () => null }));

vi.mock('../../src/orchestra/approval-decision-federation.js', () => ({
  isDecisionFederatedOrigin: () => false,
  mirrorFederatedItemToBroker: vi.fn(),
  settleFederatedDecision: vi.fn(),
}));

vi.mock('../../src/connectors/gateway/gateway-paths.js', () => ({
  gatewayHome: () => '/isolated/gateway',
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => '/isolated/project',
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: (line: string) => state.stdout.push(line),
  printError: (error: unknown) => state.stderr.push(error instanceof Error ? error.message : String(error)),
}));

import { registerApprovalsCommand } from '../../src/cli/commands/approvals.js';

const request = {
  version: '2.0',
  id: 'approval-live-1',
  summary: 'Deploy production image',
  expiresAt: '2026-08-21T12:30:00.000Z',
  origin: 'broker-native',
  riskTier: 'routine',
  slaStage: 'initial',
  lifecycleGeneration: 'generation-7',
  policySnapshotDigest: 'a'.repeat(64),
  source: { reference: 'request-source:approval-live-1' },
  tenantId: 'tenant-test',
  details: {},
};

function pendingEntry() {
  return {
    request,
    decision: null,
    lifecycle: {
      origin: 'broker-native',
      riskTier: 'critical',
      effectiveExpiresAt: '2026-08-21T12:05:00.000Z',
      appliedPolicyDigest: 'b'.repeat(64),
      policyTransitionChanged: true,
      weakeningIgnored: false,
    },
  };
}

async function run(...args: string[]): Promise<void> {
  const program = new Command().exitOverride();
  registerApprovalsCommand(program);
  await program.parseAsync(['node', 'deckent', ...args]);
}

beforeEach(() => {
  state.snapshot = { pending: [], approved: [], denied: [], expired: [], quarantined: [] };
  state.federated = [];
  state.timeoutReceipts.clear();
  state.stdout = [];
  state.stderr = [];
  state.sweepCalls = 0;
  state.runtimeOpenCalls = 0;
  state.decisionCalls = 0;
  state.brokerRequest = null;
  state.decisionOutcome = {
    kind: 'expired', requestId: 'late-request', expiresAt: '2026-08-21T12:01:00.000Z',
  };
  process.exitCode = 0;
});

afterEach(() => { process.exitCode = 0; });

describe('approvals CLI lifecycle view', () => {
  it('renders the effective durable lifecycle, audit lineage, receipts and quarantine without writes', async () => {
    const receipt = {
      schemaVersion: 1,
      requestId: 'expired-1',
      expiresAt: '2026-08-21T11:00:00.000Z',
      actor: 'system:expiry',
      kind: 'timeout-disposition',
      accessGrantAllowed: false,
      replayAllowed: false,
    };
    state.snapshot = {
      pending: [pendingEntry()],
      approved: [],
      denied: [],
      expired: [{ request: { ...request, id: 'expired-1' }, decision: {} }],
      quarantined: [{
        file: 'corrupt-1.request.json',
        sourceReference: 'approval-file:corrupt-1.request.json',
        reasonCode: 'unreadable-json',
      }],
    };
    state.timeoutReceipts.set('expired-1', receipt);
    state.federated = [{
      origin: 'gateway-pairing',
      id: 'pairing-quarantine-1',
      summary: 'legacy pairing',
      decideHintKey: 'approvals.federated.hint_pairing',
      quarantined: true,
      lifecycleReasonCode: 'legacy-record',
      sourceReference: 'gateway-pairings:legacy:1',
    }];

    await run('approvals', 'list');

    const output = state.stdout.join('\n');
    expect(output).toContain('2026-08-21T12:05:00.000Z');
    expect(output).toContain('risk=critical');
    expect(output).toContain('stage=initial');
    expect(output).toContain('generation-7');
    expect(output).toContain('b'.repeat(64));
    expect(output).toContain('approval-file:corrupt-1.request.json');
    expect(output).toContain('gateway-pairings:legacy:1');
    expect(output).toContain('"actor":"system:expiry"');
    expect(state.sweepCalls).toBe(0);
    expect(state.runtimeOpenCalls).toBe(0);
    expect(state.decisionCalls).toBe(0);
  });

  it('uses the authenticated ingress and renders its typed expired result without a late grant', async () => {
    state.brokerRequest = { ...request, id: 'late-request' };

    await run('approvals', 'decide', 'late-request', '--allow');

    expect(state.sweepCalls).toBe(1);
    expect(state.runtimeOpenCalls).toBe(1);
    expect(state.decisionCalls).toBe(1);
    expect(state.stderr.join('\n')).toContain('2026-08-21T12:01:00.000Z');
    expect(state.stdout.join('\n')).not.toContain('Request late-request decided');
    expect(process.exitCode).toBe(1);
  });

  it('rejects a policy-tightened effective expiry before live auth can grant it', async () => {
    state.snapshot.expired = [{
      request: { ...request, id: 'effective-expired-1' },
      decision: { channel: 'ttl-expire' },
      lifecycle: {
        effectiveExpiresAt: '2026-08-21T12:02:00.000Z',
        riskTier: 'critical',
      },
    }];
    state.brokerRequest = { ...request, id: 'effective-expired-1' };

    await run('approvals', 'decide', 'effective-expired-1', '--allow');

    expect(state.sweepCalls).toBe(1);
    expect(state.decisionCalls).toBe(0);
    expect(state.stderr.join('\n')).toContain('2026-08-21T12:02:00.000Z');
    expect(process.exitCode).toBe(1);
  });

  it('keeps a quarantined durable row visible but never sends it to the decision ingress', async () => {
    state.snapshot.quarantined = [{
      file: 'quarantined-1.request.json',
      sourceReference: 'approval-file:quarantined-1.request.json',
      reasonCode: 'invalid-request-contract',
    }];

    await run('approvals', 'decide', 'quarantined-1', '--deny');

    expect(state.stderr.join('\n')).toContain('approval-file:quarantined-1.request.json');
    expect(state.decisionCalls).toBe(0);
    expect(process.exitCode).toBe(1);
  });
});
