import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { shortCodeFor } from '../../../src/core/approval-short-code.js';
import { registerApprovalsCommand } from '../../../src/cli/commands/approvals.js';
import { resolveLocalOsActorId } from '../../../src/core/principal.js';

const state = vi.hoisted(() => ({
  brokerRequest: null as Record<string, unknown> | null,
  brokerDecision: null as Record<string, unknown> | null,
  federated: [] as Array<Record<string, unknown>>,
  stdout: [] as string[],
  stderr: [] as string[],
  sweepCalls: 0,
  decideCalls: 0,
  closeCalls: 0,
}));

vi.mock('../../../src/core/config.js', () => ({
  loadConfig: vi.fn(async () => ({
    language: 'en',
    approval: {
      lifecycle: { enabled: true },
      authority: {
        enabled: true,
        tenant_id: 'tenant-a',
        terminal: { max_auth_age_seconds: 60 },
      },
    },
  })),
}));

vi.mock('../../../src/core/approval-store.js', () => ({
  ApprovalStore: class {
    load() {
      return { pending: [], approved: [], denied: [], expired: [], quarantined: [] };
    }
    sweepExpired() { state.sweepCalls += 1; return []; }
  },
}));

vi.mock('../../../src/core/approval-authority-runtime.js', () => ({
  openApprovalAuthorityRuntime: () => ({
    state: 'ready',
    service: {
      broker: {
        list: () => state.brokerRequest ? [state.brokerRequest] : [],
        getRequest: (id: string) => state.brokerRequest?.id === id ? state.brokerRequest : undefined,
        getDecision: () => state.brokerDecision,
      },
      decideTerminal: async () => {
        state.decideCalls += 1;
        state.brokerDecision = { action: 'allow' };
        return { kind: 'rejected', reason: 'test-refusal' };
      },
      close: () => { state.closeCalls += 1; },
    },
  }),
}));

vi.mock('../../../src/core/approval-inbox-federation.js', () => ({
  listFederatedPendingItems: () => state.federated,
}));

vi.mock('../../../src/orchestra/approval-decision-federation.js', () => ({
  isDecisionFederatedOrigin: (origin: string) => origin === 'confirmation',
  mirrorFederatedItemToBroker: vi.fn(),
  settleFederatedDecision: vi.fn(),
}));

vi.mock('../../../src/core/approval-rules.js', () => ({
  loadApprovalRules: () => ({ rules: [], fault: null }),
  matchApprovalRule: () => null,
  promoteRuleFromDecision: vi.fn(),
  saveApprovalRules: vi.fn(),
}));

vi.mock('../../../src/core/approval-rules-engine.js', () => ({ liveRuleFor: () => null }));
vi.mock('../../../src/connectors/gateway/gateway-paths.js', () => ({ gatewayHome: () => '/gateway' }));
vi.mock('../../../src/cli/helpers/process.js', () => ({ resolveProjectRoot: () => '/project' }));
vi.mock('../../../src/cli/helpers/shutdown-hooks.js', () => ({
  withCommandLocalShutdown: async <T>(action: () => Promise<T>) => action(),
}));
vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: (line: string) => state.stdout.push(line),
  printError: (error: unknown) => state.stderr.push(error instanceof Error ? error.message : String(error)),
}));

const foreignRequestId = 'native-private-request';
const privateSummary = 'Rotate private production signing material';

function nativeRequest(tenantId: string): Record<string, unknown> {
  return {
    id: foreignRequestId,
    tenantId,
    summary: privateSummary,
    requester: { role: 'security-operator', instanceId: 'private-instance' },
    scope: 'credential-rotation',
    scopeId: 'private-vault',
    risk: 'critical',
    maskedArgs: { target: 'private-signing-key' },
    expiresAt: '2099-01-01T00:00:00.000Z',
    details: {},
  };
}

async function run(...args: string[]): Promise<void> {
  const program = new Command().exitOverride();
  registerApprovalsCommand(program);
  await program.parseAsync(['node', 'deckent', ...args]);
}

beforeEach(() => {
  state.brokerRequest = null;
  state.brokerDecision = null;
  state.federated = [];
  state.stdout = [];
  state.stderr = [];
  state.sweepCalls = 0;
  state.decideCalls = 0;
  state.closeCalls = 0;
  process.exitCode = 0;
});

afterEach(() => { process.exitCode = 0; });

describe('approvals command registration', () => {
  it('uses the shared fail-closed OS actor projection required by terminal reauth', () => {
    expect(resolveLocalOsActorId(() => ({ username: 'terminal-operator' }))).toBe('terminal-operator');
    expect(resolveLocalOsActorId(() => { throw new Error('identity unavailable'); })).toBeNull();
  });
  it('advertises the catalog-backed class filter on list only', () => {
    const program = new Command();
    registerApprovalsCommand(program);

    const approvals = program.commands.find(command => command.name() === 'approvals');
    const list = approvals?.commands.find(command => command.name() === 'list');
    const decide = approvals?.commands.find(command => command.name() === 'decide');

    expect(list?.options.map(option => option.flags)).toContain('--class <name>');
    expect(list?.options.find(option => option.flags === '--class <name>')?.description)
      .toBe('Filter the federated inbox by class');
    expect(decide?.options.map(option => option.flags)).not.toContain('--class <name>');
  });

  it.each([
    ['exact id', foreignRequestId],
    ['short code', shortCodeFor(foreignRequestId)],
  ])('refuses a foreign native broker target by %s before revealing or mutating it', async (_label, target) => {
    state.brokerRequest = nativeRequest('tenant-b');

    await run('approvals', 'decide', target, '--allow');

    expect(state.sweepCalls).toBe(0);
    expect(state.decideCalls).toBe(0);
    expect(state.brokerDecision).toBeNull();
    expect(state.stdout.join('\n')).not.toContain(privateSummary);
    expect(state.stdout.join('\n')).not.toContain('private-instance');
    expect(state.stdout.join('\n')).not.toContain('private-vault');
    expect(state.stdout.join('\n')).not.toContain('private-signing-key');
    expect(state.stderr.join('\n')).toContain('tenant-mismatch');
    expect(state.closeCalls).toBe(1);
    expect(process.exitCode).toBe(1);
  });

  it('keeps the foreign federated source guard when a same-id native mirror is local', async () => {
    state.brokerRequest = nativeRequest('tenant-a');
    state.federated = [{
      origin: 'confirmation',
      id: foreignRequestId,
      tenantId: 'tenant-b',
      summary: privateSummary,
      decideHintKey: 'approvals.federated.hint_confirmation',
      sourceReference: 'confirmation:foreign-private-request',
    }];

    await run('approvals', 'decide', foreignRequestId, '--allow');

    expect(state.sweepCalls).toBe(0);
    expect(state.decideCalls).toBe(0);
    expect(state.brokerDecision).toBeNull();
    expect(state.stdout.join('\n')).not.toContain(privateSummary);
    expect(state.stderr.join('\n')).toContain('tenant-mismatch');
    expect(process.exitCode).toBe(1);
  });

  it('does not reject a same-tenant native target at the containment gate', async () => {
    state.brokerRequest = nativeRequest('tenant-a');

    await run('approvals', 'decide', foreignRequestId, '--deny');

    expect(state.sweepCalls).toBe(1);
    expect(state.decideCalls).toBe(1);
    expect(state.stdout.join('\n')).toContain(privateSummary);
    expect(state.stderr.join('\n')).toContain('test-refusal');
    expect(process.exitCode).toBe(1);
  });
});
