import { describe, expect, it } from 'vitest';

import { cleanupAuthorityHoldReason } from '../../src/cli/commands/cleanup.js';
import type { CanonicalRunStatus } from '../../src/core/run-status-authority.js';
import type { TerminalPublicationStatus } from '../../src/core/sprint-terminal-publication-status.js';

function authority(
  overrides: Partial<CanonicalRunStatus> = {},
): CanonicalRunStatus {
  return {
    schemaVersion: 1,
    lifecycle: 'IDLE',
    active: false,
    resumable: false,
    sprintId: null,
    phase: null,
    status: null,
    reason: null,
    recoveryCommand: null,
    finalizeCommand: null,
    coordinator: 'absent',
    conflicts: [],
    ...overrides,
  };
}

function receipt(outcome: 'COMPLETE' | 'ABORTED'): TerminalPublicationStatus {
  return {
    version: 1,
    state: 'receipt-observed',
    receipt: {
      version: 1,
      sprintId: 'sprint-1',
      runId: 'sprint-1',
      coordinatorGeneration: 1,
      terminalOutcome: outcome,
      logicalSettlementDigest: 'a'.repeat(64),
      priorAuthorityVersion: 0,
      authorityVersion: 1,
    },
  };
}

describe('cleanup authority gate', () => {
  it('allows IDLE and terminal quiescent runs', () => {
    expect(cleanupAuthorityHoldReason(authority())).toBeNull();
    expect(cleanupAuthorityHoldReason(authority({
      lifecycle: 'COMPLETE',
      sprintId: 'sprint-1',
      status: 'COMPLETE',
    }), receipt('COMPLETE'))).toBeNull();
    expect(cleanupAuthorityHoldReason(authority({
      lifecycle: 'ABORTED',
      sprintId: 'sprint-1',
      status: 'ABORTED',
    }), receipt('ABORTED'))).toBeNull();
  });

  it('holds terminal cleanup without a matching fenced receipt', () => {
    const complete = authority({
      lifecycle: 'COMPLETE',
      sprintId: 'sprint-1',
      status: 'COMPLETE',
    });
    expect(cleanupAuthorityHoldReason(complete)).toBe('terminal-receipt-required');
    expect(cleanupAuthorityHoldReason(complete, receipt('ABORTED')))
      .toBe('terminal-outcome-mismatch');
  });

  it('holds a live coordinator without touching its projections', () => {
    expect(cleanupAuthorityHoldReason(authority({
      lifecycle: 'ACTIVE',
      active: true,
      sprintId: 'sprint-2',
      coordinator: 'alive',
    }))).toBe('coordinator-active');
  });

  it('holds resumable PAUSED and ORPHANED states', () => {
    expect(cleanupAuthorityHoldReason(authority({
      lifecycle: 'PAUSED',
      resumable: true,
      sprintId: 'sprint-3',
    }))).toBe('run-paused');
    expect(cleanupAuthorityHoldReason(authority({
      lifecycle: 'ORPHANED',
      resumable: true,
      sprintId: 'sprint-4',
      coordinator: 'dead',
    }))).toBe('run-orphaned');
  });

  it('holds unknown coordinator ownership', () => {
    expect(cleanupAuthorityHoldReason(authority({
      lifecycle: 'COMPLETE',
      sprintId: 'sprint-5',
      coordinator: 'unknown',
    }))).toBe('coordinator-ownership-unknown');
  });
});
