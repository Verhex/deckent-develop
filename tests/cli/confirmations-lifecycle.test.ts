import { describe, expect, it, onTestFinished } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

import { registerConfirmationsCommand } from '../../src/cli/commands/confirmations.js';
import { loadConfig } from '../../src/core/config.js';
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
  it('rejects an expired human decision and leaves the UNDECIDABLE tombstone authoritative', async () => {
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

    const program = new Command().exitOverride();
    registerConfirmationsCommand(program, {
      resolveProjectRootFn: () => root,
      confirmInteractiveFn: async () => true,
      clock: () => at,
      loadConfigFn: (async () => ({ approval: { lifecycle } })) as unknown as typeof loadConfig,
    });
    process.exitCode = 0;
    await program.parseAsync([
      'node', 'deckent', 'confirmations', 'decide', created.id,
      '--confirm', '--reason', 'too late',
    ]);
    expect(process.exitCode).toBe(1);
    const found = readConfirmation(root, created.id, { lifecycle, clock: () => at });
    expect(found?.state).toBe('settled');
    if (!found || found.state !== 'settled') throw new Error('expected settled confirmation');
    expect(found.request.outcome).toMatchObject({ verdict: 'UNDECIDABLE', closureReason: 'expired' });
    process.exitCode = 0;
  });

  it('rejects an llm verdict that loses the race to expiry', async () => {
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
    registerConfirmationsCommand(program, {
      resolveProjectRootFn: () => root,
      clock: () => at,
      loadConfigFn: (async () => ({ approval: { lifecycle } })) as unknown as typeof loadConfig,
      runXverifyForResultFn: (async () => {
        at = new Date('2026-08-21T16:00:00.001Z');
        return { verdict: 'CONFIRMED' };
      }) as never,
    });
    process.exitCode = 0;
    await program.parseAsync(['node', 'deckent', 'confirmations', 'run', '--id', created.id]);
    expect(process.exitCode).toBe(1);
    const found = readConfirmation(root, created.id, { lifecycle, clock: () => at });
    expect(found?.state).toBe('settled');
    if (!found || found.state !== 'settled') throw new Error('expected settled confirmation');
    expect(found.request.outcome.verdict).toBe('UNDECIDABLE');
    process.exitCode = 0;
  });
});
