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

describe('TaskStatus enum', () => {
  it('PENDING === "PENDING" (string serialize)', () => {
    expect(TaskStatus.PENDING).toBe('PENDING');
  });

  it('DOCUMENTING === "DOCUMENTING" (Blueprint 5.3)', () => {
    expect(TaskStatus.DOCUMENTING).toBe('DOCUMENTING');
  });

  it('has 8 members', () => {
    expect(Object.values(TaskStatus)).toHaveLength(8);
  });
});

describe('TaskEvaluation enum', () => {
  it('has 3 members', () => {
    expect(Object.values(TaskEvaluation)).toHaveLength(3);
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
  it('has 7 members', () => {
    expect(Object.values(SprintStatus)).toHaveLength(7);
  });
});

describe('AgentStatus enum', () => {
  it('has 11 members (DOCUMENTING included)', () => {
    expect(Object.values(AgentStatus)).toHaveLength(11);
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
