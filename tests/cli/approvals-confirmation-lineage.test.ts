import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shortCodeFor } from '../../src/core/approval-short-code.js';

const state = vi.hoisted(() => ({
  federated: [] as Array<Record<string, unknown>>,
  brokerRequest: null as Record<string, unknown> | null,
  stdout: [] as string[],
  stderr: [] as string[],
  sweepCalls: 0,
  decideCalls: 0,
  decideOutcomes: [] as Array<{ kind: 'decided' | 'idempotent' }>,
  mirror: vi.fn(),
  settle: vi.fn(),
  promote: vi.fn(),
  save: vi.fn(),
  lifecycle: { enabled: true },
}));

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(async () => ({
    language: 'en',
    approval: {
      lifecycle: state.lifecycle,
      authority: {
        enabled: true,
        tenant_id: 'tenant-a',
        terminal: { max_auth_age_seconds: 60 },
      },
    },
  })),
}));

vi.mock('../../src/core/approval-store.js', () => ({
  ApprovalStore: class {
    load() {
      return { pending: [], approved: [], denied: [], expired: [], quarantined: [] };
    }
    sweepExpired() { state.sweepCalls += 1; return []; }
  },
}));

vi.mock('../../src/core/approval-authority-runtime.js', () => ({
  openApprovalAuthorityRuntime: () => ({
    state: 'ready',
    service: {
      broker: {
        list: () => state.brokerRequest ? [state.brokerRequest] : [],
        getRequest: () => state.brokerRequest,
      },
      decideTerminal: async () => {
        state.decideCalls += 1;
        return state.decideOutcomes.shift() ?? { kind: 'decided' };
      },
      close: vi.fn(),
    },
  }),
}));

vi.mock('../../src/core/approval-inbox-federation.js', () => ({
  listFederatedPendingItems: () => state.federated,
}));

vi.mock('../../src/orchestra/approval-decision-federation.js', () => ({
  isDecisionFederatedOrigin: (origin: string) => origin === 'confirmation',
  mirrorFederatedItemToBroker: state.mirror,
  settleFederatedDecision: state.settle,
}));

vi.mock('../../src/core/approval-rules.js', () => ({
  loadApprovalRules: () => ({ rules: [], fault: null }),
  matchApprovalRule: () => null,
  promoteRuleFromDecision: state.promote,
  saveApprovalRules: state.save,
}));

vi.mock('../../src/core/approval-rules-engine.js', () => ({ liveRuleFor: () => null }));
vi.mock('../../src/connectors/gateway/gateway-paths.js', () => ({ gatewayHome: () => '/gateway' }));
vi.mock('../../src/cli/helpers/process.js', () => ({ resolveProjectRoot: () => '/project' }));
vi.mock('../../src/cli/helpers/output.js', () => ({
  print: (line: string) => state.stdout.push(line),
  printError: (error: unknown) => state.stderr.push(error instanceof Error ? error.message : String(error)),
}));

import { registerApprovalsCommand } from '../../src/cli/commands/approvals.js';

const requestId = 'confirmation-42';
const brokerRequest = {
  id: requestId,
  tenantId: 'tenant-a',
  summary: 'Approve confirmation',
  expiresAt: '2026-08-21T12:30:00.000Z',
  details: {},
};

function confirmation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    origin: 'confirmation',
    id: requestId,
    tenantId: 'tenant-a',
    summary: 'Approve confirmation',
    decideHintKey: 'approvals.federated.hint_confirmation',
    sourceReference: 'confirmation:source-42',
    ...overrides,
  };
}

async function run(...args: string[]): Promise<void> {
  const program = new Command().exitOverride();
  registerApprovalsCommand(program);
  await program.parseAsync(['node', 'deckent', ...args]);
}

beforeEach(() => {
  state.federated = [confirmation()];
  state.brokerRequest = brokerRequest;
  state.stdout = [];
  state.stderr = [];
  state.sweepCalls = 0;
  state.decideCalls = 0;
  state.decideOutcomes = [];
  state.mirror.mockReset().mockResolvedValue(undefined);
  state.settle.mockReset().mockResolvedValue({ state: 'settled', origin: 'confirmation', receipt: { state: 'APPLIED' } });
  state.promote.mockReset().mockReturnValue({
    id: 'rule-confirmation-42',
    decision: 'allow',
    match: { idPrefix: requestId },
  });
  state.save.mockReset();
  process.exitCode = 0;
});

afterEach(() => { process.exitCode = 0; });

describe('approvals decide authenticated confirmation lineage', () => {
  it('rejects a foreign-tenant target with zero lifecycle, mirror, or decision mutation', async () => {
    state.federated = [confirmation({ tenantId: 'tenant-b' })];

    await run('approvals', 'decide', requestId, '--allow');

    expect(state.sweepCalls).toBe(0);
    expect(state.mirror).not.toHaveBeenCalled();
    expect(state.decideCalls).toBe(0);
    expect(state.stderr.join('\n')).toContain('tenant-mismatch');
    expect(process.exitCode).toBe(1);
  });

  it('rejects a foreign-tenant target resolved by short code with zero mutation', async () => {
    state.federated = [confirmation({ tenantId: 'tenant-b' })];

    await run('approvals', 'decide', shortCodeFor(requestId), '--allow');

    expect(state.sweepCalls).toBe(0);
    expect(state.mirror).not.toHaveBeenCalled();
    expect(state.decideCalls).toBe(0);
    expect(state.stderr.join('\n')).toContain('tenant-mismatch');
    expect(process.exitCode).toBe(1);
  });

  it('revalidates an existing broker mirror against the exact source lineage before live auth', async () => {
    state.mirror.mockRejectedValueOnce(new Error('source-reference-mismatch'));

    await run('approvals', 'decide', requestId, '--allow');

    expect(state.mirror).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: requestId, sourceReference: 'confirmation:source-42' }),
      { tenantId: 'tenant-a' },
    );
    expect(state.decideCalls).toBe(0);
    expect(state.settle).not.toHaveBeenCalled();
    expect(state.stderr.join('\n')).toContain('source-reference-mismatch');
    expect(process.exitCode).toBe(1);
  });

  it('uses one live human decision surface and withholds success and rule grants without reconciliation', async () => {
    state.settle.mockResolvedValueOnce({ state: 'held', origin: 'confirmation', reason: 'receipt-not-applied' });

    await run('approvals', 'decide', requestId, '--allow', '--always');

    expect(state.decideCalls).toBe(1);
    expect(state.settle).toHaveBeenCalledTimes(1);
    expect(state.stdout.join('\n')).not.toContain(`Request ${requestId} decided`);
    expect(state.stdout.join('\n')).not.toContain('takes effect');
    expect(state.promote).not.toHaveBeenCalled();
    expect(state.stderr.join('\n')).toContain('receipt-not-applied');
    expect(process.exitCode).toBe(1);
  });

  it('requires the canonical receipt to reach APPLIED rather than accepting PREPARED', async () => {
    state.settle.mockResolvedValueOnce({ state: 'settled', origin: 'confirmation', receipt: { state: 'PREPARED' } });

    await run('approvals', 'decide', requestId, '--allow', '--always');

    expect(state.decideCalls).toBe(1);
    expect(state.stderr.join('\n')).toContain('receipt-not-applied');
    expect(state.stdout.join('\n')).not.toContain(`Request ${requestId} decided`);
    expect(state.promote).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('retries reconciliation after mutate-then-HOLD and promotes only after immutable winner APPLIED', async () => {
    const appliedReceipt = {
      state: 'APPLIED',
      receiptId: 'confirmation-reconciliation:42',
      preparedReceiptRef: 'confirmation-reconciliation:42:prepared',
    };
    state.decideOutcomes = [{ kind: 'decided' }, { kind: 'idempotent' }];
    state.settle
      .mockResolvedValueOnce({ state: 'held', origin: 'confirmation', reason: 'receipt-not-applied' })
      .mockResolvedValueOnce({ state: 'settled', origin: 'confirmation', receipt: appliedReceipt });

    await run('approvals', 'decide', requestId, '--allow', '--always');

    expect(process.exitCode).toBe(1);
    expect(state.promote).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();

    process.exitCode = 0;
    state.stdout = [];
    state.stderr = [];
    await run('approvals', 'decide', requestId, '--allow', '--always');

    expect(state.decideCalls).toBe(2);
    expect(state.settle).toHaveBeenCalledTimes(2);
    expect(state.settle.mock.calls[0]?.slice(0, 5)).toEqual(state.settle.mock.calls[1]?.slice(0, 5));
    expect(state.settle.mock.calls[0]?.[5]).toMatchObject({
      brokerRequest, item: expect.objectContaining({ sourceReference: 'confirmation:source-42' }),
      lifecycle: state.lifecycle,
    });
    expect(state.promote).toHaveBeenCalledTimes(1);
    expect(state.save).toHaveBeenCalledTimes(1);
    expect(state.stdout.join('\n')).toContain(`Request ${requestId} decided`);
    expect(state.stdout).toContain(JSON.stringify(appliedReceipt));
    expect(process.exitCode).toBe(0);
  });

  it('returns the exact canonical APPLIED receipt again on authenticated replay', async () => {
    const appliedReceipt = {
      state: 'APPLIED',
      receiptId: 'confirmation-reconciliation:immutable-winner',
      preparedReceiptRef: 'confirmation-reconciliation:prepared',
    };
    state.decideOutcomes = [{ kind: 'decided' }, { kind: 'idempotent' }];
    state.settle.mockResolvedValue({ state: 'settled', origin: 'confirmation', receipt: appliedReceipt });

    await run('approvals', 'decide', requestId, '--allow');
    const firstReceiptLine = state.stdout.find(line => line === JSON.stringify(appliedReceipt));

    state.stdout = [];
    await run('approvals', 'decide', requestId, '--allow');
    const replayReceiptLine = state.stdout.find(line => line === JSON.stringify(appliedReceipt));

    expect(state.decideCalls).toBe(2);
    expect(state.settle).toHaveBeenCalledTimes(2);
    expect(firstReceiptLine).toBe(JSON.stringify(appliedReceipt));
    expect(replayReceiptLine).toBe(firstReceiptLine);
    expect(process.exitCode).toBe(0);
  });

  it('reports success only after the exact federation reconciliation receipt is observed', async () => {
    await run('approvals', 'decide', requestId, '--allow');

    expect(state.mirror.mock.invocationCallOrder[0])
      .toBeLessThan(state.settle.mock.invocationCallOrder[0]!);
    expect(state.decideCalls).toBe(1);
    expect(state.settle).toHaveBeenCalledWith(
      '/project', 'confirmation', requestId, 'allow',
      'decided via unified approvals surface',
      expect.objectContaining({
        brokerRequest,
        item: expect.objectContaining({ sourceReference: 'confirmation:source-42' }),
        lifecycle: state.lifecycle,
        verifyBrokerDecision: expect.any(Function),
      }),
    );
    expect(state.stdout.join('\n')).toContain(`Request ${requestId} decided`);
    expect(process.exitCode).toBe(0);
  });
});
