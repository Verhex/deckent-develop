import { describe, it, expect } from 'vitest';
import { calculateProgress, createHeartbeat } from '../../src/agents/worker.js';
import { AgentStatus } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeHeartbeat(status: AgentStatus, filesChangedCount = 0) {
  return {
    workerId: 'w-test',
    taskId: 'task-001',
    status,
    currentAction: 'test',
    timestamp: new Date().toISOString(),
    filesChangedCount,
    sequence: 0,
  };
}

// ─── calculateProgress ───────────────────────────────────────────────

describe('calculateProgress', () => {
  it('returns 10 for EXECUTING status', () => {
    expect(calculateProgress(makeHeartbeat(AgentStatus.EXECUTING))).toBe(10);
  });

  it('returns 70 for TESTING status', () => {
    expect(calculateProgress(makeHeartbeat(AgentStatus.TESTING))).toBe(70);
  });

  it('returns 85 for DOCUMENTING status', () => {
    expect(calculateProgress(makeHeartbeat(AgentStatus.DOCUMENTING))).toBe(85);
  });

  it('returns 100 for DONE status', () => {
    expect(calculateProgress(makeHeartbeat(AgentStatus.DONE))).toBe(100);
  });

  it('returns 0 for IDLE status', () => {
    expect(calculateProgress(makeHeartbeat(AgentStatus.IDLE))).toBe(0);
  });

  it('returns 0 for PLANNING status', () => {
    expect(calculateProgress(makeHeartbeat(AgentStatus.PLANNING))).toBe(0);
  });

  it('returns 0 for ERROR status', () => {
    expect(calculateProgress(makeHeartbeat(AgentStatus.ERROR))).toBe(0);
  });

  it('returns 0 for PAUSED status', () => {
    expect(calculateProgress(makeHeartbeat(AgentStatus.PAUSED))).toBe(0);
  });

  describe('CODING status (30–60% range)', () => {
    it('returns 30 when filesChangedCount is 0', () => {
      expect(calculateProgress(makeHeartbeat(AgentStatus.CODING, 0))).toBe(30);
    });

    it('returns 36 when filesChangedCount is 1', () => {
      expect(calculateProgress(makeHeartbeat(AgentStatus.CODING, 1))).toBe(36);
    });

    it('returns 42 when filesChangedCount is 2', () => {
      expect(calculateProgress(makeHeartbeat(AgentStatus.CODING, 2))).toBe(42);
    });

    it('returns 48 when filesChangedCount is 3', () => {
      expect(calculateProgress(makeHeartbeat(AgentStatus.CODING, 3))).toBe(48);
    });

    it('returns 54 when filesChangedCount is 4', () => {
      expect(calculateProgress(makeHeartbeat(AgentStatus.CODING, 4))).toBe(54);
    });

    it('returns 60 when filesChangedCount is 5 (max)', () => {
      expect(calculateProgress(makeHeartbeat(AgentStatus.CODING, 5))).toBe(60);
    });

    it('caps at 60 when filesChangedCount exceeds 5', () => {
      expect(calculateProgress(makeHeartbeat(AgentStatus.CODING, 10))).toBe(60);
      expect(calculateProgress(makeHeartbeat(AgentStatus.CODING, 100))).toBe(60);
    });
  });
});

// ─── createHeartbeat includes progress ──────────────────────────────

describe('createHeartbeat progress field', () => {
  it('sets progress=10 when status is EXECUTING', () => {
    const hb = createHeartbeat('w-1', 'task-001', AgentStatus.EXECUTING, 'Running');
    expect(hb.progress).toBe(10);
  });

  it('sets progress=70 when status is TESTING', () => {
    const hb = createHeartbeat('w-1', 'task-001', AgentStatus.TESTING, 'Running tests');
    expect(hb.progress).toBe(70);
  });

  it('sets progress=85 when status is DOCUMENTING', () => {
    const hb = createHeartbeat('w-1', 'task-001', AgentStatus.DOCUMENTING, 'Writing docs');
    expect(hb.progress).toBe(85);
  });

  it('sets progress=100 when status is DONE', () => {
    const hb = createHeartbeat('w-1', 'task-001', AgentStatus.DONE, 'Complete');
    expect(hb.progress).toBe(100);
  });

  it('sets CODING progress based on filesChangedCount parameter', () => {
    const hb = createHeartbeat('w-1', 'task-001', AgentStatus.CODING, 'Coding', undefined, 0, 5);
    expect(hb.progress).toBe(60);
  });

  it('sets CODING progress=30 when filesChangedCount is 0 (default)', () => {
    const hb = createHeartbeat('w-1', 'task-001', AgentStatus.CODING, 'Coding');
    expect(hb.progress).toBe(30);
  });

  it('always sets the progress field (never undefined)', () => {
    const statuses = [
      AgentStatus.IDLE,
      AgentStatus.PLANNING,
      AgentStatus.EXECUTING,
      AgentStatus.CODING,
      AgentStatus.TESTING,
      AgentStatus.DOCUMENTING,
      AgentStatus.DONE,
      AgentStatus.ERROR,
    ];
    for (const status of statuses) {
      const hb = createHeartbeat('w-1', 'task-001', status, 'action');
      expect(hb.progress).toBeDefined();
      expect(typeof hb.progress).toBe('number');
    }
  });
});
