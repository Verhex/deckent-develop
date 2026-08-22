import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';

import {
  readSprintStatusRecoveryReconciliation,
  reconcileSprintStatusRecovery,
} from '../../src/core/sprint-status-authority.js';
import {
  readCanonicalRunStatus,
  type CanonicalRunStatus,
} from '../../src/core/run-status-authority.js';

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-sprint-status-recovery-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.deckent', 'recently-works'), { recursive: true });
  return root;
}

function writeJson(root: string, relative: string, value: unknown): void {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value), 'utf8');
}

function paused(sprintId = 'sprint-595'): Pick<CanonicalRunStatus, 'lifecycle' | 'sprintId'> {
  return { lifecycle: 'PAUSED', sprintId };
}

function receipt(sprintId = 'sprint-595') {
  return {
    version: 1 as const,
    sprintId,
    runId: 'run-595',
    coordinatorGeneration: 1,
    terminalOutcome: 'COMPLETE' as const,
    logicalSettlementDigest: 'a'.repeat(64),
    priorAuthorityVersion: 0,
    authorityVersion: 1,
  };
}

describe('sprint status recovery reconciliation', () => {
  it('does not present Sprint-595 residue as resumable when its terminal successor exists', () => {
    const result = reconcileSprintStatusRecovery({
      authority: paused(),
      evidence: {
        checkpointPresent: true,
        terminalReceipt: receipt(),
        terminalReceiptConflict: null,
      },
    });

    expect(result).toMatchObject({
      state: 'inconsistent',
      mismatch: 'successor-available',
      remediation: {
        kind: 'finalize',
        command: 'deckent finalize --sprint sprint-595 --force',
      },
    });
  });

  it('types a PAUSED projection with no checkpoint separately', () => {
    expect(reconcileSprintStatusRecovery({
      authority: paused(),
      evidence: {
        checkpointPresent: false,
        terminalReceipt: null,
        terminalReceiptConflict: null,
      },
    })).toMatchObject({
      state: 'inconsistent',
      mismatch: 'checkpoint-missing',
      remediation: { kind: 'recover', command: 'deckent recover sprint-595' },
    });
  });

  it('types a receipt-only PAUSED projection as stale rather than generic ORPHANED', () => {
    expect(reconcileSprintStatusRecovery({
      authority: paused(),
      evidence: {
        checkpointPresent: false,
        terminalReceipt: receipt(),
        terminalReceiptConflict: null,
      },
    })).toMatchObject({
      state: 'inconsistent',
      mismatch: 'projection-stale',
      remediation: { kind: 'finalize' },
    });
  });

  it('keeps a valid PAUSED checkpoint resumable with the canonical resume command', () => {
    expect(reconcileSprintStatusRecovery({
      authority: paused(),
      evidence: {
        checkpointPresent: true,
        terminalReceipt: null,
        terminalReceiptConflict: null,
      },
    })).toMatchObject({
      state: 'consistent',
      mismatch: null,
      remediation: {
        kind: 'resume',
        command: 'deckent recover sprint-595 --resume',
      },
    });
  });

  it('leaves every consulted file byte-identical on the read path', () => {
    const root = fixture();
    const checkpointPath = join(root, '.deckent', 'sprint-595-checkpoint.json');
    const receiptPath = join(root, '.deckent', 'recently-works', 'sprint-595-terminal-receipt.json');
    writeJson(root, '.deckent/sprint-595-checkpoint.json', { sprintId: 'sprint-595', marker: 'unchanged' });
    writeJson(root, '.deckent/recently-works/sprint-595-terminal-receipt.json', receipt());
    const checkpointBefore = readFileSync(checkpointPath);
    const receiptBefore = readFileSync(receiptPath);

    const result = readSprintStatusRecoveryReconciliation(root, paused());

    expect(result.mismatch).toBe('successor-available');
    expect(readFileSync(checkpointPath)).toEqual(checkpointBefore);
    expect(readFileSync(receiptPath)).toEqual(receiptBefore);
  });

  it('is wired into the canonical status entrypoint without mutating recovery bytes', () => {
    const root = fixture();
    writeJson(root, '.deckent/sprint-state.json', {
      sprintId: 'sprint-595', phase: 'EXECUTE', status: 'PAUSED',
    });
    writeJson(root, '.deckent/pause-state.json', {
      sprintId: 'sprint-595', phase: 'EXECUTE', status: 'PAUSED',
    });
    writeJson(root, '.deckent/sprint-595-checkpoint.json', {
      sprintId: 'sprint-595', marker: 'unchanged',
    });
    const checkpointPath = join(root, '.deckent', 'sprint-595-checkpoint.json');
    const before = readFileSync(checkpointPath);

    const status = readCanonicalRunStatus(root);

    expect(status.lifecycle).toBe('PAUSED');
    expect(status.recoveryReconciliation).toMatchObject({
      state: 'consistent', mismatch: null,
      remediation: { kind: 'resume', command: 'deckent recover sprint-595 --resume' },
    });
    expect(readFileSync(checkpointPath)).toEqual(before);
  });
});
