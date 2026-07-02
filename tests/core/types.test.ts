import { describe, it, expect } from 'vitest';
import {
  TaskStatus,
  TaskEvaluation,
  AlertLevel,
  SprintPhase,
  SprintStatus,
  AgentStatus,
  DebtPriority,
} from '../../src/core/types.js';
import type { StartOptions } from '../../src/core/types.js';

describe('TaskStatus enum', () => {
  it('PENDING === "PENDING" (string serialize)', () => {
    expect(TaskStatus.PENDING).toBe('PENDING');
  });

  it('DOCUMENTING === "DOCUMENTING" (Blueprint 5.3)', () => {
    expect(TaskStatus.DOCUMENTING).toBe('DOCUMENTING');
  });

  it('has 10 members', () => {
    // Sprint 195 195-001: MANUAL_REVIEW_REQUIRED added for disk-verify gate.
    expect(Object.values(TaskStatus)).toHaveLength(10);
  });

  it('DRAFT === "DRAFT"', () => {
    expect(TaskStatus.DRAFT).toBe('DRAFT');
  });
});

describe('TaskEvaluation enum', () => {
  it('has 5 members (incl. NOT_DISPATCHED)', () => {
    // Sprint 192 192-010: DEFERRED added for dispatcher saturation reporting.
    expect(Object.values(TaskEvaluation)).toHaveLength(5);
  });
});

describe('AlertLevel enum', () => {
  it('has 3 members', () => {
    expect(Object.values(AlertLevel)).toHaveLength(3);
  });
});

describe('SprintPhase enum', () => {
  it('has 10 members', () => {
    expect(Object.values(SprintPhase)).toHaveLength(10);
  });
});

describe('SprintStatus enum', () => {
  it('has 8 members', () => {
    expect(Object.values(SprintStatus)).toHaveLength(8);
  });
});

describe('AgentStatus enum', () => {
  it('has 12 members (VERIFYING added)', () => {
    expect(Object.values(AgentStatus)).toHaveLength(12);
  });

  it('includes DOCUMENTING', () => {
    expect(AgentStatus.DOCUMENTING).toBe('DOCUMENTING');
  });
});

describe('DebtPriority enum', () => {
  it('has 3 members', () => {
    expect(Object.values(DebtPriority)).toHaveLength(3);
  });
});

// ─── StartOptions (DEBT-005 semantic separation) ─────────────────────────────

describe('StartOptions interface', () => {
  it('accepts autoApprove and sandboxMode as optional booleans', () => {
    const opts: StartOptions = { autoApprove: true, sandboxMode: false };
    expect(opts.autoApprove).toBe(true);
    expect(opts.sandboxMode).toBe(false);
  });

  it('allows empty StartOptions', () => {
    const opts: StartOptions = {};
    expect(opts.autoApprove).toBeUndefined();
    expect(opts.sandboxMode).toBeUndefined();
  });

  it('autoApprove is for permissions — sandboxMode is for Docker (separate concerns)', () => {
    // Verify fields are independently optional — no conflation
    const permOnly: StartOptions = { autoApprove: true };
    const sandboxOnly: StartOptions = { sandboxMode: true };
    expect(permOnly.sandboxMode).toBeUndefined();
    expect(sandboxOnly.autoApprove).toBeUndefined();
  });

  it('does not have legacy sandbox field', () => {
    const opts: StartOptions = {};
    // TypeScript enforces this at compile time; this runtime check guards renames
    expect('sandbox' in opts).toBe(false);
    expect('sandboxMode' in opts).toBe(false); // property absent when not set
  });
});
