import { describe, expect, it } from 'vitest';

import { cleanupAuthorityHoldReason } from '../../src/cli/commands/cleanup.js';
import type { CanonicalRunStatus } from '../../src/core/run-status-authority.js';

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

describe('cleanup authority gate', () => {
  it('allows IDLE and terminal quiescent runs', () => {
    expect(cleanupAuthorityHoldReason(authority())).toBeNull();
    expect(cleanupAuthorityHoldReason(authority({
      lifecycle: 'COMPLETE',
      sprintId: 'sprint-1',
      status: 'COMPLETE',
    }))).toBeNull();
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
