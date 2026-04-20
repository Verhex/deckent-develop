// tests/nervous/detectors/scope-collision.test.ts
//
// ScopeCollisionMonitor unit testleri — 5 test
// AAA pattern, vi.mock ile fs izolasyonu

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DetectorContext, SprintStateSnapshot, ObserverEvent } from '../../../src/core/nervous-types.js';

// ─── fs mock ─────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { ScopeCollisionMonitor } from '../../../src/nervous/detectors/scope-collision.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal ObserverEvent — yalnızca source önemli bu testlerde */
function makeEvent(source: ObserverEvent['source'] = 'cron'): ObserverEvent {
  return {
    id: 'evt-001',
    source,
    type: 'TICK',
    timestamp: new Date().toISOString(),
    payload: {},
  };
}

/** Sprint state snapshot üretici */
function makeSprintState(
  phase: SprintStateSnapshot['currentPhase'],
): SprintStateSnapshot {
  return {
    sprintId: 'sprint-147',
    currentPhase: phase,
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 0,
    completedTasks: 0,
  };
}

/** DetectorContext üretici */
function makeCtx(
  phase: SprintStateSnapshot['currentPhase'] = 'EXECUTE',
): DetectorContext {
  return {
    event: makeEvent(),
    sprintState: makeSprintState(phase),
    projectRoot: '/fake/project',
    now: new Date('2026-04-20T10:00:00.000Z'),
  };
}

/** Task JSON stub üretici */
function makeTaskJson(
  id: string,
  filesWrite: string[],
  status = 'PENDING',
): object {
  return { id, status, scope: { filesWrite } };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('ScopeCollisionMonitor', () => {
  const monitor = new ScopeCollisionMonitor();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Test 1: .tasks/ dizini boş ─────────────────────────────────────────────

  it('should return null when .tasks/ directory has no task files', () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);

    const ctx = makeCtx('EXECUTE');

    // Act
    const result = monitor.detect(ctx);

    // Assert
    expect(result).toBeNull();
  });

  // ── Test 2: 1 task, 1 dosya — çakışma yok ─────────────────────────────────

  it('should return null when 1 task writes to 1 file (no collision possible)', () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(
      ['task-001.json'] as unknown as ReturnType<typeof readdirSync>,
    );
    vi.mocked(readFileSync).mockImplementation((path: unknown) => {
      if (String(path).endsWith('task-001.json')) {
        return JSON.stringify(makeTaskJson('001', ['src/foo.ts']));
      }
      return '{}';
    });

    const ctx = makeCtx('EXECUTE');

    // Act
    const result = monitor.detect(ctx);

    // Assert
    expect(result).toBeNull();
  });

  // ── Test 3: 2 task aynı dosyaya yazıyor → collision ──────────────────────

  it('should detect collision when 2 tasks write to the same file', () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(
      ['task-001.json', 'task-002.json'] as unknown as ReturnType<typeof readdirSync>,
    );
    vi.mocked(readFileSync).mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.endsWith('task-001.json')) {
        return JSON.stringify(makeTaskJson('001', ['src/core/config.ts']));
      }
      if (p.endsWith('task-002.json')) {
        return JSON.stringify(makeTaskJson('002', ['src/core/config.ts']));
      }
      return '{}';
    });

    const ctx = makeCtx('EXECUTE');

    // Act
    const result = monitor.detect(ctx);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.shouldNotify).toBe(true);
    expect(result!.severity).toBe('warning');
    expect(result!.risk).toBe('medium');

    const action = result!.suggestedActions[0];
    expect(action.id).toBe('SCOPE_COLLISION_REORDER');
    expect(action.label).toContain('1 colliding task');

    const payload = action.payload as { collisions: Array<{ file: string; taskIds: string[] }> };
    expect(payload.collisions).toHaveLength(1);
    expect(payload.collisions[0]!.file).toBe('src/core/config.ts');
    expect(payload.collisions[0]!.taskIds).toContain('001');
    expect(payload.collisions[0]!.taskIds).toContain('002');
  });

  // ── Test 4: 3 task, 2 farklı collision ───────────────────────────────────

  it('should detect 2 collisions when 3 tasks have overlapping filesWrite (A+B share file1, A+C share file2)', () => {
    // Arrange — A writes [file1, file2], B writes [file1], C writes [file2]
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(
      ['task-A.json', 'task-B.json', 'task-C.json'] as unknown as ReturnType<typeof readdirSync>,
    );
    vi.mocked(readFileSync).mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.endsWith('task-A.json')) {
        return JSON.stringify(makeTaskJson('A', ['src/shared.ts', 'src/other.ts']));
      }
      if (p.endsWith('task-B.json')) {
        return JSON.stringify(makeTaskJson('B', ['src/shared.ts']));
      }
      if (p.endsWith('task-C.json')) {
        return JSON.stringify(makeTaskJson('C', ['src/other.ts']));
      }
      return '{}';
    });

    const ctx = makeCtx('PLAN');

    // Act
    const result = monitor.detect(ctx);

    // Assert
    expect(result).not.toBeNull();
    const payload = result!.suggestedActions[0]!.payload as {
      collisions: Array<{ file: string; taskIds: string[] }>;
    };
    expect(payload.collisions).toHaveLength(2);

    // Her iki çakışma dosyası bulunmalı
    const files = payload.collisions.map(c => c.file);
    expect(files).toContain('src/shared.ts');
    expect(files).toContain('src/other.ts');

    // Label 2 collision belirtmeli
    expect(result!.suggestedActions[0]!.label).toContain('2 colliding task');

    // metadata
    expect((result!.metadata as { collisions: number }).collisions).toBe(2);
  });

  // ── Test 5: RETRO ve CLEANUP fazlarında null döner ────────────────────────

  it('should return null for phases other than PLAN and EXECUTE (RETRO, CLEANUP, etc.)', () => {
    // Arrange — tasks exist but phase is wrong
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(
      ['task-001.json', 'task-002.json'] as unknown as ReturnType<typeof readdirSync>,
    );
    vi.mocked(readFileSync).mockImplementation(() =>
      JSON.stringify(makeTaskJson('001', ['src/same.ts'])),
    );

    const phases: SprintStateSnapshot['currentPhase'][] = [
      'IDLE',
      'SPAWN',
      'EVALUATE',
      'FIX',
      'RETRO',
      'DECAY',
      'CLEANUP',
    ];

    for (const phase of phases) {
      // Act
      const result = monitor.detect(makeCtx(phase));

      // Assert
      expect(result, `phase ${phase} should return null`).toBeNull();
    }
  });
});
