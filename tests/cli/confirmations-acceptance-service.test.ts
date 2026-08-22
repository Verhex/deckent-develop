import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerConfirmationsCommand, type AcceptanceConfirmationListItem, type ConfirmationsDeps } from '../../src/cli/commands/confirmations.js';
import type { AcceptanceConfirmationServiceDeps } from '../../src/orchestra/acceptance-confirmation-service.js';
import { confirmationContentDigest, createConfirmationRequest } from '../../src/core/confirmation-store.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';

const composition = vi.hoisted(() => ({ open: vi.fn() }));
const canonicalService = vi.hoisted(() => ({ settle: vi.fn() }));
vi.mock('../../src/orchestra/acceptance-confirmation-composition.js', () => ({
  openAcceptanceConfirmationComposition: composition.open,
}));
vi.mock('../../src/orchestra/acceptance-confirmation-service.js', () => ({
  settleAcceptanceConfirmation: canonicalService.settle,
}));

const item: AcceptanceConfirmationListItem = {
  confirmationId: 'cnf-610', adapter: 'llm', kind: 'audit', sourceVerdict: 'UNDECIDABLE',
  taskId: '610-012', sprintId: '610', statement: 'claim', riskTier: 'critical', generation: 1,
  expiresAt: '2026-08-22T00:00:00.000Z', authorProvider: 'anthropic', evidenceRequirements: ['src/a.ts'],
};
const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
const settlementRef = { schemaVersion: 1 as const, taskId: '610-012', backend: 'docker' as const,
  projectRootSha256: 'a'.repeat(64), attemptId: 'attempt-1' };
const config = {
  language: 'en',
  approval: { lifecycle, authority: { enabled: true, tenant_id: 'tenant-a' } },
} as Awaited<ReturnType<NonNullable<ConfirmationsDeps['loadConfigFn']>>>;
const productionDeps = {
  loadConfigFn: vi.fn(async () => config),
  resolveTenantFn: vi.fn(() => ({ tenantId: 'tenant-a' })),
  projectIdFn: vi.fn(() => 'project-a'),
  clock: () => new Date('2026-08-22T01:02:03.000Z'),
} satisfies ConfirmationsDeps;
async function run(deps: ConfirmationsDeps, argv: string[]): Promise<void> {
  const program = new Command().exitOverride();
  registerConfirmationsCommand(program, { resolveProjectRootFn: () => '/project', ...deps });
  await program.parseAsync(['node', 'deckent', 'confirmations', ...argv]);
}

describe('confirmations acceptance-service CLI cutover', () => {
  it('uses the durable store by default and list remains byte-for-byte read-only', async () => {
    const root = mkdtempSync(join(tmpdir(), 'confirmations-default-list-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    const identity = { attemptId: 'a', generation: 1,
      sourceDigest: confirmationContentDigest('source'),
      evidenceDigest: confirmationContentDigest('evidence'),
      revisionDigest: confirmationContentDigest('revision') };
    const created = createConfirmationRequest(root, {
      sprintId: '610', taskId: '610-012', itemIds: [], kind: 'audit', verdict: 'UNDECIDABLE',
      adapter: 'llm', statements: ['claim'], evidenceRequirements: ['src/a.ts'],
      requestedAt: '2026-08-22T00:00:00.000Z', source: 'acceptance-matrix', identity,
      authorProvider: 'anthropic',
    }, { identity, lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }),
      clock: () => new Date('2026-08-22T00:00:00.000Z') });
    const relativeRequestPath = readdirSync(root, { recursive: true, encoding: 'utf8' })
      .find(path => path.includes(created.id));
    if (!relativeRequestPath) throw new Error('created confirmation request file is missing');
    const requestPath = join(root, relativeRequestPath);
    const before = readFileSync(requestPath, 'utf8');
    process.exitCode = 0;
    await run({ resolveProjectRootFn: () => root }, ['list']);
    expect(readFileSync(requestPath, 'utf8')).toBe(before);
    expect(process.exitCode).toBe(0);
  });
  it('routes human decide without any local mutation', async () => {
    const settleFn = vi.fn(); const serviceDepsFn = vi.fn();
    await run({ settleFn, serviceDepsFn }, ['decide', item.confirmationId, '--confirm']);
    expect(settleFn).not.toHaveBeenCalled(); expect(serviceDepsFn).not.toHaveBeenCalled();
  });
  it('keeps UNCLEAR pending', async () => {
    const serviceDepsFn = vi.fn();
    await run({ readModelFn: async () => ({ state: 'READY', pending: [item] }),
      runXverifyForResultFn: vi.fn(async () => ({ verdict: 'UNCLEAR' })) as never, serviceDepsFn }, ['run']);
    expect(serviceDepsFn).not.toHaveBeenCalled();
  });
  it('passes exact receipt and different-provider evidence into the service', async () => {
    const ports = {} as AcceptanceConfirmationServiceDeps;
    const serviceDepsFn = vi.fn(async () => ports);
    const settleFn = vi.fn(async () => ({ state: 'DONE' as const, replayed: false }));
    await run({ readModelFn: async () => ({ state: 'READY', pending: [item] }),
      runXverifyForResultFn: vi.fn(async () => ({ verdict: 'CONFIRMED', author: 'anthropic',
        verifier: 'openai', assurance: 'typed-host-adjudicated', adjudicationReceiptRef: 'receipt:exact', settlementRef })) as never,
      serviceDepsFn, settleFn }, ['run']);
    expect(serviceDepsFn).toHaveBeenCalledWith('/project', { confirmationId: 'cnf-610',
      authorProvider: 'anthropic', verifierProvider: 'openai', adjudicationReceiptRef: 'receipt:exact', verdict: 'CONFIRMED', settlementRef });
    expect(settleFn).toHaveBeenCalledWith(ports, 'cnf-610');
  });
  it('opens the production composition by default and reports success only from its service receipt', async () => {
    const close = vi.fn();
    const decideAndSettle = vi.fn(async () => ({ state: 'DONE' as const, replayed: false,
      receipt: { state: 'APPLIED' } }));
    composition.open.mockReturnValueOnce({ decideAndSettle, close });
    await run({ ...productionDeps, readModelFn: async () => ({ state: 'READY', pending: [item] }),
      runXverifyForResultFn: vi.fn(async () => ({ verdict: 'CONFIRMED', author: 'anthropic',
        verifier: 'openai', assurance: 'typed-host-adjudicated', adjudicationReceiptRef: 'receipt:exact', settlementRef })) as never }, ['run']);
    expect(composition.open).toHaveBeenCalledWith({
      projectRoot: '/project', tenantId: 'tenant-a', projectId: 'project-a', lifecycle,
      clock: productionDeps.clock,
      decisionAuthority: { branch: 'llm', projectRoot: '/project' },
    });
    expect(decideAndSettle).toHaveBeenCalledWith({ confirmationId: 'cnf-610', verdict: 'CONFIRMED',
      decidedBy: 'llm', reason: 'xverify:openai', authorityReceipt: 'receipt:exact', settlementRef });
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('closes the production composition exactly once when settlement throws', async () => {
    const close = vi.fn();
    const failure = new Error('settlement failed');
    composition.open.mockReturnValueOnce({ decideAndSettle: vi.fn(async () => { throw failure; }), close });
    await expect(run({ ...productionDeps,
      readModelFn: async () => ({ state: 'READY', pending: [item] }),
      runXverifyForResultFn: vi.fn(async () => ({ verdict: 'CONFIRMED', author: 'anthropic',
        verifier: 'openai', assurance: 'typed-host-adjudicated', adjudicationReceiptRef: 'receipt:exact', settlementRef })) as never,
    }, ['run'])).rejects.toThrow(failure);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('surfaces a typed production admission HOLD without calling settlement', async () => {
    composition.open.mockImplementationOnce(() => { throw new Error('tenant-mismatch'); });
    const settleFn = vi.fn(); process.exitCode = 0;
    await run({ ...productionDeps, readModelFn: async () => ({ state: 'READY', pending: [item] }),
      runXverifyForResultFn: vi.fn(async () => ({ verdict: 'CONFIRMED', author: 'anthropic',
        verifier: 'openai', assurance: 'typed-host-adjudicated', adjudicationReceiptRef: 'receipt:exact', settlementRef })) as never,
      settleFn }, ['run']);
    expect(settleFn).not.toHaveBeenCalled(); expect(process.exitCode).toBe(1); process.exitCode = 0;
  });
  it('HOLDs when exact receipt evidence is unavailable', async () => {
    const settleFn = vi.fn(); process.exitCode = 0;
    await run({ readModelFn: async () => ({ state: 'READY', pending: [item] }),
      runXverifyForResultFn: vi.fn(async () => ({ verdict: 'CONFIRMED', author: 'anthropic',
        verifier: 'openai', assurance: null, adjudicationReceiptRef: null })) as never, settleFn }, ['run']);
    expect(settleFn).not.toHaveBeenCalled(); expect(process.exitCode).toBe(1); process.exitCode = 0;
  });
});
