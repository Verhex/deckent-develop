import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerApprovalsCommand } from '../../src/cli/commands/approvals.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';

const item = {
  confirmationId: 'cnf-run', adapter: 'llm' as const, statements: ['bounded claim'],
  evidenceRequirements: [] as const,
};

afterEach(() => { process.exitCode = 0; });

describe('approvals run dispatcher', () => {
  it('uses --author only as the missing request author and carries provider authority unchanged', async () => {
    const providerAuthority = { state: 'ready', service: {} } as never;
    const runXverifyForResultFn = vi.fn(async () => ({ verdict: 'UNCLEAR' })) as never;
    const program = new Command().exitOverride();
    registerApprovalsCommand(program, { confirmationRun: {
      providerAuthority,
      readModelFn: async () => ({ state: 'READY', pending: [item] }),
      runXverifyForResultFn,
    } });
    await program.parseAsync(['node', 'deckent', 'approvals', 'run', '--author', 'claude']);
    expect(runXverifyForResultFn).toHaveBeenCalledWith(
      'bounded claim', { author: 'claude' }, { providerAuthority },
    );
  });

  it('fails closed when effective lifecycle policy is absent', async () => {
    const runXverifyForResultFn = vi.fn();
    const program = new Command().exitOverride();
    registerApprovalsCommand(program, { confirmationRun: {
      resolveProjectRootFn: () => '/project',
      loadConfigFn: (async () => ({ approval: { authority: { tenant_id: 'tenant-a' } } })) as never,
      resolveTenantFn: () => ({ tenantId: 'tenant-a' }),
      runXverifyForResultFn: runXverifyForResultFn as never,
      clock: () => new Date('2026-08-22T00:00:00.000Z'),
    } });
    process.exitCode = 0;
    await program.parseAsync(['node', 'deckent', 'approvals', 'run']);
    expect(runXverifyForResultFn).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('passes the effective lifecycle unchanged into the LLM composition', async () => {
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    const openCompositionFn = vi.fn(() => ({
      authority: {}, service: {}, reconciler: {}, createAndRoute: vi.fn(), settle: vi.fn(),
      decideAndSettle: vi.fn(async () => ({ state: 'DONE', replayed: false, receipt: { state: 'APPLIED' } })),
      close: vi.fn(),
    })) as never;
    const program = new Command().exitOverride();
    registerApprovalsCommand(program, { confirmationRun: {
      resolveProjectRootFn: () => '/project',
      readModelFn: async () => ({ state: 'READY', pending: [{ ...item, authorProvider: 'claude' }] }),
      runXverifyForResultFn: vi.fn(async () => ({ verdict: 'CONFIRMED', author: 'claude',
        verifier: 'codex', assurance: 'typed-host-adjudicated', adjudicationReceiptRef: 'receipt:exact',
        settlementRef: { schemaVersion: 1, taskId: 'task', backend: 'docker',
          projectRootSha256: 'a'.repeat(64), attemptId: 'attempt' } })) as never,
      loadConfigFn: (async () => ({ approval: { lifecycle, authority: { tenant_id: 'tenant-a' } } })) as never,
      resolveTenantFn: () => ({ tenantId: 'tenant-a' }), projectIdFn: () => 'project-a', openCompositionFn,
    } });
    await program.parseAsync(['node', 'deckent', 'approvals', 'run']);
    expect(openCompositionFn).toHaveBeenCalledWith(expect.objectContaining({ lifecycle }));
  });
});
