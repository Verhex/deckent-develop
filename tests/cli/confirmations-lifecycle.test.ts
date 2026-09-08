import { describe, expect, it, onTestFinished } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

import { registerApprovalsCommand } from '../../src/cli/commands/approvals.js';
import { registerConfirmationsCommand } from '../../src/cli/commands/confirmations.js';
import {
  confirmationContentDigest,
  createConfirmationRequest,
  readConfirmation,
  type ConfirmationIdentity,
} from '../../src/core/confirmation-store.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';

function identity(attemptId: string): ConfirmationIdentity {
  return {
    attemptId, generation: 1,
    sourceDigest: confirmationContentDigest('source'),
    evidenceDigest: confirmationContentDigest('evidence'),
    revisionDigest: confirmationContentDigest('revision'),
  };
}

function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), 'confirmation-cli-lifecycle-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

describe('confirmations CLI lifecycle', () => {
  it('routes the legacy human command and leaves the expired UNDECIDABLE tombstone authoritative', async () => {
    const root = sandbox();
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    let at = new Date('2026-08-21T08:00:00.000Z');
    const idn = identity('human-attempt');
    const created = createConfirmationRequest(root, {
      sprintId: 's', taskId: 'human', itemIds: [], kind: 'audit', verdict: 'QUALIFIED',
      adapter: 'human', statements: ['approve?'], evidenceRequirements: [],
      requestedAt: at.toISOString(), source: 'acceptance-matrix', identity: idn,
    }, { lifecycle, identity: idn, clock: () => at });
    at = new Date('2026-08-21T16:00:00.001Z');

    const program = new Command();
    registerApprovalsCommand(program);
    registerConfirmationsCommand(program);
    const legacy = program.commands.find(command => command.name() === 'confirmations');
    expect(legacy?.commands).toEqual([]);
    expect(program.commands.find(command => command.name() === 'approvals')
      ?.commands.find(command => command.name() === 'decide')).toBeDefined();
    const found = readConfirmation(root, created.id, { lifecycle, clock: () => at });
    expect(found?.state).toBe('settled');
    if (!found || found.state !== 'settled') throw new Error('expected settled confirmation');
    expect(found.request.outcome).toMatchObject({ verdict: 'UNDECIDABLE', closureReason: 'expired' });
    process.exitCode = 0;
  });

  it('does not invoke an llm after expiry has already won the read-side race', async () => {
    const root = sandbox();
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    let at = new Date('2026-08-21T08:00:00.000Z');
    const idn = identity('llm-attempt');
    const created = createConfirmationRequest(root, {
      sprintId: 's', taskId: 'llm', itemIds: [], kind: 'audit', verdict: 'UNDECIDABLE',
      adapter: 'llm', statements: ['verify'], evidenceRequirements: [],
      requestedAt: at.toISOString(), source: 'acceptance-matrix', identity: idn,
      authorProvider: 'claude',
    }, { lifecycle, identity: idn, clock: () => at });

    const program = new Command().exitOverride();
    let xverifyCalls = 0;
    at = new Date('2026-08-21T16:00:00.001Z');
    registerApprovalsCommand(program, { confirmationRun: {
      resolveProjectRootFn: () => root,
      clock: () => at,
      loadConfigFn: (async () => ({
        approval: { lifecycle, authority: { tenant_id: 'local' } },
      })) as never,
      resolveTenantFn: () => ({ tenantId: 'local' }),
      runXverifyForResultFn: (async () => { xverifyCalls += 1; return { verdict: 'CONFIRMED' }; }) as never,
    } });
    registerConfirmationsCommand(program);
    process.exitCode = 0;
    await program.parseAsync(['node', 'deckent', 'confirmations', 'run', '--id', created.id]);
    expect(process.exitCode).toBe(0);
    expect(xverifyCalls).toBe(0);
    const found = readConfirmation(root, created.id, { lifecycle, clock: () => at });
    expect(found?.state).toBe('settled');
    if (!found || found.state !== 'settled') throw new Error('expected settled confirmation');
    expect(found.request.outcome.verdict).toBe('UNDECIDABLE');
    process.exitCode = 0;
  });
});
