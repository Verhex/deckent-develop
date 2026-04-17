// ═══ Task Restoration on Crash Tests (Sprint 143 Task 15) ════════
// Tests for phase-transition auto-checkpoint, stale heartbeat detection,
// resume skip-DONE, respawn stale workers, and idempotent checkpoint writes.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  writeCheckpoint,
  readCheckpoint,
  writePhaseCheckpoint,
  getResumableTasks,
  getTasksForResume,
  hasCheckpoint,
  isStaleHeartbeat,
  readHeartbeat,
  detectStaleWorkers,
  STALE_HEARTBEAT_THRESHOLD_MS,
} from '../../src/orchestra/sprint-checkpoint.js';
import type { SprintCheckpoint, WorkerState } from '../../src/orchestra/sprint-checkpoint.js';
import { SprintPhase, TaskStatus, SprintStatus } from '../../src/core/types.js';
import type { Sprint, Task } from '../../src/core/types.js';
import type { Heartbeat } from '../../src/core/types.js';
import { AgentStatus } from '../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `task-restoration-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeMinimalSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-143',
    number: 143,
    phase: SprintPhase.EXECUTE,
    status: SprintStatus.RUNNING,
    tasks: [],
    startedAt: new Date().toISOString(),
    ...overrides,
  } as Sprint;
}

function makeTask(id: string, status: TaskStatus = TaskStatus.PENDING): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Test task ${id}`,
    status,
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
  } as Task;
}

function writeHbFile(root: string, taskId: string, timestamp: string, extra: Partial<Heartbeat> = {}): void {
  const hb: Heartbeat = {
    workerId: `w-${taskId}`,
    taskId,
    status: AgentStatus.EXECUTING,
    currentAction: 'testing',
    timestamp,
    filesChangedCount: 0,
    sequence: 1,
    progress: 50,
    ...extra,
  };
  writeFileSync(join(root, '.tasks', `task-${taskId}.hb`), JSON.stringify(hb));
}

function writeResultFile(root: string, taskId: string): void {
  writeFileSync(
    join(root, '.tasks', `task-${taskId}.result`),
    JSON.stringify({ taskId, selfAssessment: 'DONE', filesChanged: [], testsPassed: true }),
  );
}

// ═══ writeCheckpoint ═════════════════════════════════════════════════

describe('writeCheckpoint', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('writes a checkpoint file with correct structure', () => {
    const sprint = makeMinimalSprint({
      tasks: [
        makeTask('001', TaskStatus.DONE),
        makeTask('002', TaskStatus.PENDING),
        makeTask('003', TaskStatus.EXECUTING),
      ],
    });

    const result = writeCheckpoint(root, sprint, 42);

    expect(result).not.toBeNull();
    expect(result!.sprintId).toBe('sprint-143');
    expect(result!.checkpointNumber).toBe(1);
    expect(result!.completedTasks).toEqual(['001']);
    expect(result!.pendingTasks).toEqual(['002']);
    expect(result!.activeWorkers).toHaveLength(1);
    expect(result!.activeWorkers[0].taskId).toBe('003');
    expect(result!.eventStreamOffset).toBe(42);
    expect(result!.brainPhase).toBe(SprintPhase.EXECUTE);
  });

  it('increments checkpoint number monotonically', () => {
    const sprint = makeMinimalSprint({ tasks: [makeTask('001', TaskStatus.DONE)] });

    writeCheckpoint(root, sprint, 0);
    const second = writeCheckpoint(root, sprint, 10);
    const third = writeCheckpoint(root, sprint, 20);

    expect(second!.checkpointNumber).toBe(2);
    expect(third!.checkpointNumber).toBe(3);
  });

  it('persists to disk and is readable', () => {
    const sprint = makeMinimalSprint({ tasks: [makeTask('001', TaskStatus.PENDING)] });

    writeCheckpoint(root, sprint, 5);

    const read = readCheckpoint(root, 'sprint-143');
    expect(read).not.toBeNull();
    expect(read!.sprintId).toBe('sprint-143');
    expect(read!.eventStreamOffset).toBe(5);
  });
});

// ═══ readCheckpoint ═════════════════════════════════════════════════

describe('readCheckpoint', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
    mkdirSync(join(root, '.deckent'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns null for non-existent checkpoint', () => {
    expect(readCheckpoint(root, 'sprint-999')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    writeFileSync(join(root, '.deckent', 'sprint-143-checkpoint.json'), 'NOT JSON');
    expect(readCheckpoint(root, 'sprint-143')).toBeNull();
  });

  it('returns null for checkpoint missing required fields', () => {
    writeFileSync(
      join(root, '.deckent', 'sprint-143-checkpoint.json'),
      JSON.stringify({ sprintId: 'sprint-143' }), // missing checkpointNumber, brainPhase
    );
    expect(readCheckpoint(root, 'sprint-143')).toBeNull();
  });
});

// ═══ writePhaseCheckpoint ═══════════════════════════════════════════

describe('writePhaseCheckpoint', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
    mkdirSync(join(root, '.deckent'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('writes checkpoint at phase transition with correct phase', () => {
    const sprint = makeMinimalSprint({
      phase: SprintPhase.SPAWN,
      tasks: [makeTask('001', TaskStatus.PENDING)],
    });

    const result = writePhaseCheckpoint(root, sprint, SprintPhase.SPAWN);

    expect(result).not.toBeNull();
    expect(result!.brainPhase).toBe(SprintPhase.SPAWN);
  });

  it('is idempotent — writing twice produces valid checkpoints', () => {
    const sprint = makeMinimalSprint({
      phase: SprintPhase.EVALUATE,
      tasks: [makeTask('001', TaskStatus.DONE)],
    });

    const first = writePhaseCheckpoint(root, sprint, SprintPhase.EVALUATE);
    const second = writePhaseCheckpoint(root, sprint, SprintPhase.EVALUATE);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.checkpointNumber).toBe(first!.checkpointNumber + 1);
  });
});

// ═══ isStaleHeartbeat ═══════════════════════════════════════════════

describe('isStaleHeartbeat', () => {
  it('returns true for null heartbeat', () => {
    expect(isStaleHeartbeat(null)).toBe(true);
  });

  it('returns true for heartbeat with invalid timestamp', () => {
    const hb = { timestamp: 'NOT-A-DATE' } as Heartbeat;
    expect(isStaleHeartbeat(hb)).toBe(true);
  });

  it('returns false for fresh heartbeat (within threshold)', () => {
    const now = Date.now();
    const hb = { timestamp: new Date(now - 60_000).toISOString() } as Heartbeat; // 1 min ago
    expect(isStaleHeartbeat(hb, STALE_HEARTBEAT_THRESHOLD_MS, now)).toBe(false);
  });

  it('returns true for stale heartbeat (beyond threshold)', () => {
    const now = Date.now();
    const hb = { timestamp: new Date(now - 10 * 60_000).toISOString() } as Heartbeat; // 10 min ago
    expect(isStaleHeartbeat(hb, STALE_HEARTBEAT_THRESHOLD_MS, now)).toBe(true);
  });

  it('respects custom threshold', () => {
    const now = Date.now();
    const hb = { timestamp: new Date(now - 2 * 60_000).toISOString() } as Heartbeat; // 2 min ago
    // 1 minute threshold — should be stale
    expect(isStaleHeartbeat(hb, 60_000, now)).toBe(true);
    // 5 minute threshold — should be fresh
    expect(isStaleHeartbeat(hb, 5 * 60_000, now)).toBe(false);
  });
});

// ═══ readHeartbeat ══════════════════════════════════════════════════

describe('readHeartbeat', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
    mkdirSync(join(root, '.tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns null when heartbeat file does not exist', () => {
    expect(readHeartbeat(root, '999-999')).toBeNull();
  });

  it('returns null for malformed heartbeat file', () => {
    writeFileSync(join(root, '.tasks', 'task-001.hb'), 'NOT JSON');
    expect(readHeartbeat(root, '001')).toBeNull();
  });

  it('returns parsed heartbeat for valid file', () => {
    writeHbFile(root, '001', '2026-04-17T10:00:00.000Z');
    const hb = readHeartbeat(root, '001');
    expect(hb).not.toBeNull();
    expect(hb!.taskId).toBe('001');
    expect(hb!.timestamp).toBe('2026-04-17T10:00:00.000Z');
  });
});

// ═══ detectStaleWorkers ═════════════════════════════════════════════

describe('detectStaleWorkers', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.deckent'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns empty array when no active workers', () => {
    const checkpoint: SprintCheckpoint = {
      sprintId: 'sprint-143',
      checkpointNumber: 1,
      timestamp: new Date().toISOString(),
      completedTasks: ['001'],
      pendingTasks: [],
      activeWorkers: [],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 0,
    };

    expect(detectStaleWorkers(root, checkpoint)).toEqual([]);
  });

  it('detects workers with missing heartbeat files', () => {
    const checkpoint: SprintCheckpoint = {
      sprintId: 'sprint-143',
      checkpointNumber: 1,
      timestamp: new Date().toISOString(),
      completedTasks: [],
      pendingTasks: [],
      activeWorkers: [
        { workerId: 'w-002', taskId: '002', status: 'EXECUTING', spawnedAt: new Date().toISOString() },
      ],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 0,
    };

    const stale = detectStaleWorkers(root, checkpoint);
    expect(stale).toHaveLength(1);
    expect(stale[0].taskId).toBe('002');
    expect(stale[0].reason).toBe('missing_file');
  });

  it('detects workers with stale heartbeat timestamps', () => {
    const now = Date.now();
    const tenMinAgo = new Date(now - 10 * 60_000).toISOString();

    writeHbFile(root, '003', tenMinAgo);

    const checkpoint: SprintCheckpoint = {
      sprintId: 'sprint-143',
      checkpointNumber: 1,
      timestamp: new Date().toISOString(),
      completedTasks: [],
      pendingTasks: [],
      activeWorkers: [
        { workerId: 'w-003', taskId: '003', status: 'EXECUTING', spawnedAt: tenMinAgo },
      ],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 0,
    };

    const stale = detectStaleWorkers(root, checkpoint, STALE_HEARTBEAT_THRESHOLD_MS, now);
    expect(stale).toHaveLength(1);
    expect(stale[0].taskId).toBe('003');
    expect(stale[0].reason).toBe('stale');
  });

  it('does not flag fresh workers as stale', () => {
    const now = Date.now();
    const oneMinAgo = new Date(now - 60_000).toISOString();

    writeHbFile(root, '004', oneMinAgo);

    const checkpoint: SprintCheckpoint = {
      sprintId: 'sprint-143',
      checkpointNumber: 1,
      timestamp: new Date().toISOString(),
      completedTasks: [],
      pendingTasks: [],
      activeWorkers: [
        { workerId: 'w-004', taskId: '004', status: 'EXECUTING', spawnedAt: oneMinAgo },
      ],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 0,
    };

    const stale = detectStaleWorkers(root, checkpoint, STALE_HEARTBEAT_THRESHOLD_MS, now);
    expect(stale).toHaveLength(0);
  });

  it('handles mixed fresh and stale workers', () => {
    const now = Date.now();
    writeHbFile(root, '005', new Date(now - 60_000).toISOString()); // fresh
    writeHbFile(root, '006', new Date(now - 10 * 60_000).toISOString()); // stale

    const checkpoint: SprintCheckpoint = {
      sprintId: 'sprint-143',
      checkpointNumber: 1,
      timestamp: new Date().toISOString(),
      completedTasks: [],
      pendingTasks: [],
      activeWorkers: [
        { workerId: 'w-005', taskId: '005', status: 'EXECUTING', spawnedAt: new Date(now - 60_000).toISOString() },
        { workerId: 'w-006', taskId: '006', status: 'EXECUTING', spawnedAt: new Date(now - 10 * 60_000).toISOString() },
      ],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 0,
    };

    const stale = detectStaleWorkers(root, checkpoint, STALE_HEARTBEAT_THRESHOLD_MS, now);
    expect(stale).toHaveLength(1);
    expect(stale[0].taskId).toBe('006');
  });
});

// ═══ getResumableTasks ══════════════════════════════════════════════

describe('getResumableTasks', () => {
  it('filters out completed tasks', () => {
    const checkpoint: SprintCheckpoint = {
      sprintId: 'sprint-143',
      checkpointNumber: 1,
      timestamp: new Date().toISOString(),
      completedTasks: ['001', '002'],
      pendingTasks: ['003'],
      activeWorkers: [],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 0,
    };

    const allTasks = [makeTask('001'), makeTask('002'), makeTask('003')];
    const resumable = getResumableTasks(checkpoint, allTasks);

    expect(resumable).toHaveLength(1);
    expect(resumable[0].id).toBe('003');
  });

  it('returns empty array when all tasks completed', () => {
    const checkpoint: SprintCheckpoint = {
      sprintId: 'sprint-143',
      checkpointNumber: 1,
      timestamp: new Date().toISOString(),
      completedTasks: ['001', '002'],
      pendingTasks: [],
      activeWorkers: [],
      brainPhase: SprintPhase.COMPLETE,
      eventStreamOffset: 0,
    };

    const allTasks = [makeTask('001'), makeTask('002')];
    expect(getResumableTasks(checkpoint, allTasks)).toHaveLength(0);
  });
});

// ═══ getTasksForResume ══════════════════════════════════════════════

describe('getTasksForResume', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.deckent'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('separates pending tasks from stale executing tasks', () => {
    const now = Date.now();
    // Worker for task 002 has stale heartbeat
    writeHbFile(root, '002', new Date(now - 10 * 60_000).toISOString());

    const checkpoint: SprintCheckpoint = {
      sprintId: 'sprint-143',
      checkpointNumber: 1,
      timestamp: new Date().toISOString(),
      completedTasks: ['001'],
      pendingTasks: ['003'],
      activeWorkers: [
        { workerId: 'w-002', taskId: '002', status: 'EXECUTING', spawnedAt: new Date(now - 10 * 60_000).toISOString() },
      ],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 0,
    };

    const allTasks = [
      makeTask('001', TaskStatus.DONE),
      makeTask('002', TaskStatus.EXECUTING),
      makeTask('003', TaskStatus.PENDING),
    ];

    const result = getTasksForResume(checkpoint, allTasks, root, STALE_HEARTBEAT_THRESHOLD_MS);

    expect(result.pendingTasks).toHaveLength(1);
    expect(result.pendingTasks[0].id).toBe('003');
    expect(result.staleExecutingTasks).toHaveLength(1);
    expect(result.staleExecutingTasks[0].id).toBe('002');
  });

  it('excludes tasks that completed during crash (.result file exists)', () => {
    const now = Date.now();
    // Worker crashed but wrote .result before dying
    writeHbFile(root, '002', new Date(now - 10 * 60_000).toISOString());
    writeResultFile(root, '002');

    const checkpoint: SprintCheckpoint = {
      sprintId: 'sprint-143',
      checkpointNumber: 1,
      timestamp: new Date().toISOString(),
      completedTasks: ['001'],
      pendingTasks: ['003'],
      activeWorkers: [
        { workerId: 'w-002', taskId: '002', status: 'EXECUTING', spawnedAt: new Date(now - 10 * 60_000).toISOString() },
      ],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 0,
    };

    const allTasks = [
      makeTask('001', TaskStatus.DONE),
      makeTask('002', TaskStatus.EXECUTING),
      makeTask('003', TaskStatus.PENDING),
    ];

    const result = getTasksForResume(checkpoint, allTasks, root, STALE_HEARTBEAT_THRESHOLD_MS);

    // 002 has .result → should NOT appear in stale
    expect(result.staleExecutingTasks).toHaveLength(0);
    expect(result.pendingTasks).toHaveLength(1);
    expect(result.pendingTasks[0].id).toBe('003');
  });

  it('returns all tasks as pending when no checkpoint data', () => {
    const checkpoint: SprintCheckpoint = {
      sprintId: 'sprint-143',
      checkpointNumber: 1,
      timestamp: new Date().toISOString(),
      completedTasks: [],
      pendingTasks: ['001', '002', '003'],
      activeWorkers: [],
      brainPhase: SprintPhase.PLAN,
      eventStreamOffset: 0,
    };

    const allTasks = [
      makeTask('001', TaskStatus.PENDING),
      makeTask('002', TaskStatus.PENDING),
      makeTask('003', TaskStatus.PENDING),
    ];

    const result = getTasksForResume(checkpoint, allTasks, root);

    expect(result.pendingTasks).toHaveLength(3);
    expect(result.staleExecutingTasks).toHaveLength(0);
  });
});

// ═══ hasCheckpoint ══════════════════════════════════════════════════

describe('hasCheckpoint', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
    mkdirSync(join(root, '.deckent'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns false when no checkpoint exists', () => {
    expect(hasCheckpoint(root, 'sprint-999')).toBe(false);
  });

  it('returns true when checkpoint file exists', () => {
    const sprint = makeMinimalSprint({ tasks: [] });
    writeCheckpoint(root, sprint, 0);
    expect(hasCheckpoint(root, 'sprint-143')).toBe(true);
  });
});

// ═══ STALE_HEARTBEAT_THRESHOLD_MS ═══════════════════════════════════

describe('STALE_HEARTBEAT_THRESHOLD_MS', () => {
  it('is 5 minutes (300000ms)', () => {
    expect(STALE_HEARTBEAT_THRESHOLD_MS).toBe(300_000);
  });
});
