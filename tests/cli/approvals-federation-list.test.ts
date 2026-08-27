import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: [
    { origin: 'confirmation', id: 'id-confirmation', summary: 'summary-confirmation' },
    { origin: 'checkpoint', id: 'id-checkpoint', summary: 'summary-checkpoint' },
    { origin: 'autonomous-trigger', id: 'id-autonomous', summary: 'summary-autonomous' },
    { origin: 'nervous', id: 'id-nervous', summary: 'summary-nervous' },
    { origin: 'panic-guard', id: 'id-panic', summary: 'summary-panic' },
    { origin: 'bot-action', id: 'id-bot', summary: 'summary-bot' },
    { origin: 'gateway-pairing', id: 'id-pairing', summary: 'summary-pairing' },
  ].map(row => ({ ...row, decideHintKey: 'approvals.federated.hint_confirmation' })),
  stdout: [] as string[],
  stderr: [] as string[],
}));

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(async () => ({
    language: 'en',
    approval: { authority: { enabled: true, tenant_id: 'tenant-a' } },
  })),
}));
vi.mock('../../src/core/approval-store.js', () => ({
  ApprovalStore: class {
    load() {
      return { pending: [], approved: [], denied: [], expired: [], quarantined: [] };
    }
  },
}));
vi.mock('../../src/core/approval-inbox-federation.js', () => ({
  listFederatedPendingItems: () => state.rows,
}));
vi.mock('../../src/core/approval-rules.js', () => ({
  loadApprovalRules: () => ({ rules: [], fault: null }),
  matchApprovalRule: () => null,
  promoteRuleFromDecision: vi.fn(),
  saveApprovalRules: vi.fn(),
}));
vi.mock('../../src/core/approval-rules-engine.js', () => ({ liveRuleFor: () => null }));
vi.mock('../../src/connectors/gateway/gateway-paths.js', () => ({ gatewayHome: () => '/gateway' }));
vi.mock('../../src/cli/helpers/process.js', () => ({ resolveProjectRoot: () => '/project' }));
vi.mock('../../src/cli/helpers/output.js', () => ({
  print: (line: string) => state.stdout.push(line),
  printError: (error: unknown) => state.stderr.push(
    error instanceof Error ? error.message : String(error),
  ),
}));

import { registerApprovalsCommand } from '../../src/cli/commands/approvals.js';

async function run(...args: string[]): Promise<void> {
  const program = new Command().exitOverride();
  registerApprovalsCommand(program);
  await program.parseAsync(['node', 'deckent', ...args]);
}

beforeEach(() => {
  state.stdout = [];
  state.stderr = [];
  process.exitCode = 0;
});

afterEach(() => { process.exitCode = 0; });

describe('approvals federated inbox listing', () => {
  it('enumerates every origin class returned by the federation module', async () => {
    await run('approvals', 'list');

    const output = state.stdout.join('\n');
    for (const row of state.rows) {
      expect(output).toContain(row.origin);
      expect(output).toContain(row.summary);
    }
    expect(state.stderr).toEqual([]);
  });

  it('restricts federated rows to the requested class', async () => {
    await run('approvals', 'list', '--class', 'panic-guard');

    const output = state.stdout.join('\n');
    expect(output).toContain('summary-panic');
    for (const row of state.rows.filter(row => row.origin !== 'panic-guard')) {
      expect(output).not.toContain(row.summary);
    }
    expect(process.exitCode).toBe(0);
  });

  it('rejects an unknown class through the localized typed-error path', async () => {
    await run('approvals', 'list', '--class', 'unknown-class');

    expect(state.stderr).toEqual([
      'Unknown approval class "unknown-class". Choose one of: '
        + state.rows.map(row => row.origin).join(', ') + '.',
    ]);
    expect(state.stdout).toEqual([]);
    expect(process.exitCode).toBe(1);
  });
});
