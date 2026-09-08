import { Command } from 'commander';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import {
  type AcceptanceConfirmationRunItem,
  type ApprovalConfirmationRunDeps,
} from '../../src/cli/commands/approval-confirmation-run.js';
import { registerApprovalsCommand } from '../../src/cli/commands/approvals.js';
import { registerConfirmationsCommand } from '../../src/cli/commands/confirmations.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';
import { getContract } from '../../src/core/cli-command-contract.js';
import { confirmationContentDigest, createConfirmationRequest } from '../../src/core/confirmation-store.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

const composition = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('../../src/orchestra/acceptance-confirmation-composition.js', () => ({
  openAcceptanceConfirmationComposition: composition.open,
}));

const item: AcceptanceConfirmationRunItem = {
  confirmationId: 'cnf-610', adapter: 'llm', statements: ['claim one', 'claim two'],
  authorProvider: 'anthropic', evidenceRequirements: ['src/a.ts'],
};
const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
const settlementRef = { schemaVersion: 1 as const, taskId: '610-012', backend: 'docker' as const,
  projectRootSha256: 'a'.repeat(64), attemptId: 'attempt-1' };
const config = { language: 'en', approval: {
  lifecycle, authority: { enabled: true, tenant_id: 'tenant-a' },
} } as Awaited<ReturnType<NonNullable<ApprovalConfirmationRunDeps['loadConfigFn']>>>;
const productionDeps = {
  loadConfigFn: vi.fn(async () => config),
  resolveTenantFn: vi.fn(() => ({ tenantId: 'tenant-a' })),
  projectIdFn: vi.fn(() => 'project-a'),
  clock: () => new Date('2026-08-22T01:02:03.000Z'),
} satisfies ApprovalConfirmationRunDeps;

function successfulXverify() {
  return { verdict: 'CONFIRMED', author: 'anthropic', verifier: 'openai',
    assurance: 'typed-host-adjudicated', adjudicationReceiptRef: 'receipt:exact', settlementRef };
}

async function run(deps: ApprovalConfirmationRunDeps, argv: string[],
  surface: 'approvals' | 'confirmations' = 'approvals'): Promise<void> {
  const program = new Command().exitOverride();
  registerApprovalsCommand(program, { confirmationRun: { resolveProjectRootFn: () => '/project', ...deps } });
  registerConfirmationsCommand(program);
  await program.parseAsync(['node', 'deckent', surface, ...argv]);
}

beforeEach(() => {
  vi.stubEnv('DECKENT_LANGUAGE', 'en');
  vi.stubEnv('DECKENT_LANG', 'en');
  composition.open.mockReset();
  process.exitCode = 0;
});

afterEach(() => vi.unstubAllEnvs());

describe('approvals confirmation-run production binding', () => {
  it('registers canonical flags and preserves process-risk metadata on the legacy route', () => {
    const program = new Command();
    registerApprovalsCommand(program);
    registerConfirmationsCommand(program);
    const approvals = program.commands.find(command => command.name() === 'approvals');
    const canonical = approvals?.commands.find(command => command.name() === 'run');
    expect(canonical?.options.map(option => option.flags)).toEqual([
      '--id <id>', '--author <provider>', '--timeout <ms>',
    ]);
    expect(canonical?.description()).toBe(getMessage('confirmations.run_desc', 'en'));
    expect(getContract('approvals run')).toMatchObject({ effect: 'process', defaultExecution: 'apply', authority: 'owner' });
    expect(getContract('confirmations run')).toMatchObject({ effect: 'process', defaultExecution: 'apply', authority: 'owner' });
  });

  it('rejects the legacy unauthenticated human flag before any mutation or provider call', async () => {
    const runXverifyForResultFn = vi.fn();
    const program = new Command().exitOverride();
    registerApprovalsCommand(program, { confirmationRun: {
      runXverifyForResultFn: runXverifyForResultFn as never,
    } });
    registerConfirmationsCommand(program);
    const legacy = program.commands.find(command => command.name() === 'confirmations');
    const approvals = program.commands.find(command => command.name() === 'approvals');
    expect(legacy?.commands).toEqual([]);
    expect(approvals?.commands.find(command => command.name() === 'decide')?.options.map(option => option.flags))
      .toEqual(expect.arrayContaining(['--allow', '--deny']));
    await expect(program.parseAsync([
      'node', 'deckent', 'confirmations', 'decide', item.confirmationId, '--confirm',
    ])).rejects.toMatchObject({ code: 'commander.unknownOption' });
    expect(runXverifyForResultFn).not.toHaveBeenCalled();
    expect(composition.open).not.toHaveBeenCalled();
  });

  it.each(['approvals', 'confirmations'] as const)('dispatches %s run through the canonical composition', async surface => {
    let stdout = '';
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
    onTestFinished(() => stdoutWrite.mockRestore());
    const close = vi.fn();
    const decideAndSettle = vi.fn(async () => ({ state: 'DONE' as const, replayed: false,
      receipt: { state: 'APPLIED' } }));
    composition.open.mockReturnValueOnce({ decideAndSettle, close });
    await run({ ...productionDeps, readModelFn: async () => ({ state: 'READY', pending: [item] }),
      runXverifyForResultFn: vi.fn(async () => successfulXverify()) as never }, ['run'], surface);
    expect(decideAndSettle).toHaveBeenCalledWith({ confirmationId: 'cnf-610', verdict: 'CONFIRMED',
      decidedBy: 'llm', reason: 'xverify:openai', authorityReceipt: 'receipt:exact', settlementRef });
    expect(close).toHaveBeenCalledTimes(1);
    expect(stdout).toContain(getMessage('acceptance.confirmation.confirmed', 'en', {
      confirmationId: 'cnf-610', surface: 'deckent approvals run',
    }));
    expect(stdout).not.toContain('authenticated deckent approvals decide surface');
  });

  it('passes all statements, flags, and exact provider authority into XVerify', async () => {
    const providerAuthority = { state: 'ready', service: {} } as never;
    const runXverifyForResultFn = vi.fn(async () => ({ verdict: 'UNCLEAR' })) as never;
    await run({ providerAuthority, readModelFn: async () => ({ state: 'READY', pending: [item] }),
      runXverifyForResultFn }, ['run', '--id', item.confirmationId, '--timeout', '1200']);
    expect(runXverifyForResultFn).toHaveBeenCalledWith('claim one\nclaim two',
      { author: 'anthropic', files: 'src/a.ts', timeout: '1200' }, { providerAuthority });
  });

  it('keeps UNCLEAR pending without opening settlement', async () => {
    await run({ readModelFn: async () => ({ state: 'READY', pending: [item] }),
      runXverifyForResultFn: vi.fn(async () => ({ verdict: 'UNCLEAR' })) as never }, ['run']);
    expect(composition.open).not.toHaveBeenCalled();
  });

  it.each([
    ['missing receipt', { ...successfulXverify(), adjudicationReceiptRef: null }],
    ['same provider', { ...successfulXverify(), verifier: 'anthropic' }],
  ])('HOLDs on %s without opening settlement', async (_label, outcome) => {
    process.exitCode = 0;
    await run({ readModelFn: async () => ({ state: 'READY', pending: [item] }),
      runXverifyForResultFn: vi.fn(async () => outcome) as never }, ['run']);
    expect(composition.open).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('closes the production composition exactly once when settlement throws', async () => {
    const close = vi.fn();
    const failure = new Error('settlement failed');
    composition.open.mockReturnValueOnce({ decideAndSettle: vi.fn(async () => { throw failure; }), close });
    await expect(run({ ...productionDeps, readModelFn: async () => ({ state: 'READY', pending: [item] }),
      runXverifyForResultFn: vi.fn(async () => successfulXverify()) as never }, ['run'])).rejects.toThrow(failure);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('uses a byte-preserving read-only projection for expired input', async () => {
    const root = mkdtempSync(join(tmpdir(), 'approvals-run-expired-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    const identity = { attemptId: 'a', generation: 1, sourceDigest: confirmationContentDigest('source'),
      evidenceDigest: confirmationContentDigest('evidence'), revisionDigest: confirmationContentDigest('revision') };
    const created = createConfirmationRequest(root, { sprintId: '610', taskId: '610-012', itemIds: [],
      kind: 'audit', verdict: 'UNDECIDABLE', adapter: 'llm', statements: ['claim'],
      evidenceRequirements: [], requestedAt: '2026-08-22T00:00:00.000Z', source: 'acceptance-matrix',
      identity, authorProvider: 'anthropic' }, { identity, lifecycle, tenantId: 'tenant-a',
      clock: () => new Date('2026-08-22T00:00:00.000Z') });
    const relative = readdirSync(root, { recursive: true, encoding: 'utf8' }).find(path => path.includes(created.id));
    if (!relative) throw new Error('confirmation request file missing');
    const path = join(root, relative);
    const before = readFileSync(path, 'utf8');
    const runXverifyForResultFn = vi.fn();
    const program = new Command().exitOverride();
    registerApprovalsCommand(program, { confirmationRun: { resolveProjectRootFn: () => root,
      loadConfigFn: vi.fn(async () => config), resolveTenantFn: vi.fn(() => ({ tenantId: 'tenant-a' })),
      clock: () => new Date('2026-08-23T00:00:00.000Z'), runXverifyForResultFn: runXverifyForResultFn as never } });
    await program.parseAsync(['node', 'deckent', 'approvals', 'run', '--id', created.id]);
    expect(readFileSync(path, 'utf8')).toBe(before);
    expect(runXverifyForResultFn).not.toHaveBeenCalled();
  });

  it('filters foreign-tenant rows before a provider call', async () => {
    const root = mkdtempSync(join(tmpdir(), 'approvals-run-foreign-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    const identity = { attemptId: 'foreign', generation: 1, sourceDigest: confirmationContentDigest('source'),
      evidenceDigest: confirmationContentDigest('evidence'), revisionDigest: confirmationContentDigest('revision') };
    createConfirmationRequest(root, { sprintId: '610', taskId: 'foreign', itemIds: [], kind: 'audit',
      verdict: 'UNDECIDABLE', adapter: 'llm', statements: ['private claim'], evidenceRequirements: ['private.txt'],
      requestedAt: '2026-08-22T00:00:00.000Z', source: 'acceptance-matrix', identity,
      authorProvider: 'anthropic' }, { identity, lifecycle, tenantId: 'tenant-b',
      clock: () => new Date('2026-08-22T00:00:00.000Z') });
    const runXverifyForResultFn = vi.fn();
    const program = new Command().exitOverride();
    registerApprovalsCommand(program, { confirmationRun: { resolveProjectRootFn: () => root,
      loadConfigFn: vi.fn(async () => config), resolveTenantFn: vi.fn(() => ({ tenantId: 'tenant-a' })),
      clock: () => new Date('2026-08-22T01:00:00.000Z'), runXverifyForResultFn: runXverifyForResultFn as never } });
    await program.parseAsync(['node', 'deckent', 'approvals', 'run']);
    expect(runXverifyForResultFn).not.toHaveBeenCalled();
  });
});
