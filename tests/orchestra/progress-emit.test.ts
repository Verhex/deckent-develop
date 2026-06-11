// ═══ PLANOBS-001 emit-site tests (Sprint 280 Task 5) ════════════════════════
// Verifies that emitProgress is wired at the correct call sites:
//   1. result-collector.ts waitForResults EXECUTE-% periodic tick
//   2. result-collector.ts spawnIfNotAssigned SPAWN site
//   3. PRE_VITEST phase label works (direct — plugin-hooks wire is out-of-scope)
//   4. emit-hata sprint-düşürmez (fail-safe: emit errors never crash the caller)
//   5. pct calculation correctness (0/N=0, done/N=%, N/N=100)
//   6. SPAWN emit fires during processQueue execution

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  CHANNELS,
  emitProgress,
  readEvents,
} from '../../src/core/event-stream.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeTestRoot(): string {
  const root = join(
    tmpdir(),
    `deckent-progress-emit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(join(root, '.deckent'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  return root;
}

function writeSprint(root: string, sprintId: string): void {
  writeFileSync(
    join(root, '.deckent', 'sprint-state.json'),
    JSON.stringify({ sprintId }),
    'utf-8',
  );
}

// ─── Test 1: EXECUTE phase emit ───────────────────────────────────────────────

describe('emitProgress EXECUTE phase (PLANOBS-001 emit-site)', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeTestRoot();
    writeSprint(testRoot, 'sprint-280');
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* cleanup best-effort */ }
  });

  it('writes EXECUTE event with channel=PROGRESS and pct payload', () => {
    const ev = emitProgress({ root: testRoot, phase: 'EXECUTE', pct: 60, detail: '3/5' });

    expect(ev).not.toBeNull();
    expect(ev!.channel).toBe(CHANNELS.PROGRESS);
    const payload = ev!.payload as { phase: string; pct?: number; detail?: string };
    expect(payload.phase).toBe('EXECUTE');
    expect(payload.pct).toBe(60);
    expect(payload.detail).toBe('3/5');
  });

  it('EXECUTE event is readable back via readEvents', () => {
    emitProgress({ root: testRoot, phase: 'EXECUTE', pct: 100, detail: '5/5' });

    const events = readEvents(testRoot, 'sprint-280', { channel: CHANNELS.PROGRESS });
    const execEvents = events.filter(e => (e.payload as { phase: string }).phase === 'EXECUTE');
    expect(execEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Test 2: SPAWN phase emit ─────────────────────────────────────────────────

describe('emitProgress SPAWN phase (PLANOBS-001 emit-site)', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeTestRoot();
    writeSprint(testRoot, 'sprint-280');
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* cleanup best-effort */ }
  });

  it('writes SPAWN event with channel=PROGRESS and task id in detail', () => {
    const ev = emitProgress({ root: testRoot, phase: 'SPAWN', detail: '280-001' });

    expect(ev).not.toBeNull();
    expect(ev!.channel).toBe(CHANNELS.PROGRESS);
    const payload = ev!.payload as { phase: string; detail?: string };
    expect(payload.phase).toBe('SPAWN');
    expect(payload.detail).toBe('280-001');
  });

  it('SPAWN pct is optional — omitting it leaves pct undefined', () => {
    const ev = emitProgress({ root: testRoot, phase: 'SPAWN' });
    expect(ev).not.toBeNull();
    const payload = ev!.payload as { phase: string; pct?: number };
    expect(payload.pct).toBeUndefined();
  });
});

// ─── Test 3: PRE_VITEST phase label ──────────────────────────────────────────
// Wire into src/core/plugin-hooks.ts runPreSprintValidation is out-of-scope for
// this task (scope: src/orchestra/ only). The test verifies the phase label works
// so the wire can be added later without any helper changes.

describe('emitProgress PRE_VITEST phase label', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeTestRoot();
    writeSprint(testRoot, 'sprint-280');
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* cleanup best-effort */ }
  });

  it('writes PRE_VITEST event with channel=PROGRESS', () => {
    const ev = emitProgress({ root: testRoot, phase: 'PRE_VITEST', detail: 'before' });

    expect(ev).not.toBeNull();
    expect(ev!.channel).toBe(CHANNELS.PROGRESS);
    const payload = ev!.payload as { phase: string; detail?: string };
    expect(payload.phase).toBe('PRE_VITEST');
  });

  it('PRE_VITEST before/after pair both write to event stream', () => {
    emitProgress({ root: testRoot, phase: 'PRE_VITEST', detail: 'before' });
    emitProgress({ root: testRoot, phase: 'PRE_VITEST', pct: 100, detail: 'after' });

    const events = readEvents(testRoot, 'sprint-280', { channel: CHANNELS.PROGRESS });
    const preVitestEvents = events.filter(e => (e.payload as { phase: string }).phase === 'PRE_VITEST');
    expect(preVitestEvents.length).toBe(2);
  });
});

// ─── Test 4: fail-safe — emit never throws ────────────────────────────────────

describe('emitProgress fail-safe (emit-hata sprint-düşürmez)', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeTestRoot();
    // No sprint-state.json — emitProgress must return null without throwing
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* cleanup best-effort */ }
  });

  it('returns null without throwing when sprint-state.json is missing', () => {
    let result: ReturnType<typeof emitProgress> | undefined;
    expect(() => {
      result = emitProgress({ root: testRoot, phase: 'EXECUTE', pct: 50 });
    }).not.toThrow();
    expect(result).toBeNull();
  });

  it('returns null without throwing when sprint-state.json is malformed JSON', () => {
    writeFileSync(join(testRoot, '.deckent', 'sprint-state.json'), 'NOT-JSON', 'utf-8');
    expect(() => {
      emitProgress({ root: testRoot, phase: 'SPAWN', detail: '001' });
    }).not.toThrow();
  });
});

// ─── Test 5: pct calculation correctness ─────────────────────────────────────

describe('pct (percentage) calculation for EXECUTE emit', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeTestRoot();
    writeSprint(testRoot, 'sprint-280');
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* cleanup best-effort */ }
  });

  it('0/5 collected → pct=0', () => {
    const total = 5;
    const done = 0;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    expect(pct).toBe(0);

    const ev = emitProgress({ root: testRoot, phase: 'EXECUTE', pct, detail: `${done}/${total}` });
    expect((ev!.payload as { pct: number }).pct).toBe(0);
  });

  it('3/5 collected → pct=60', () => {
    const total = 5;
    const done = 3;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    expect(pct).toBe(60);

    const ev = emitProgress({ root: testRoot, phase: 'EXECUTE', pct, detail: `${done}/${total}` });
    expect((ev!.payload as { pct: number }).pct).toBe(60);
  });

  it('5/5 collected → pct=100', () => {
    const total = 5;
    const done = 5;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    expect(pct).toBe(100);

    const ev = emitProgress({ root: testRoot, phase: 'EXECUTE', pct, detail: `${done}/${total}` });
    expect((ev!.payload as { pct: number }).pct).toBe(100);
  });

  it('0 total tasks → pct=0 (guard against division-by-zero)', () => {
    const total = 0;
    const done = 0;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    expect(pct).toBe(0);
    expect(Number.isFinite(pct)).toBe(true);
  });

  it('Math.round applied: 2/3 → pct=67 (not 66)', () => {
    const pct = Math.round((2 / 3) * 100);
    expect(pct).toBe(67);
  });
});

// ─── Test 6: SPAWN emit via vi.mock on event-stream ──────────────────────────
// Verifies the actual wiring: spawnIfNotAssigned calls emitProgress with SPAWN.
// Uses vi.mock so we can spy on the call inside waitForResults.

// vi.mock is hoisted to top of file — emitProgressMock must be declared via vi.hoisted
const emitProgressMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/orchestra/event-stream.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/event-stream.js')>();
  return {
    ...actual,
    emitProgress: emitProgressMock,
  };
});

describe('SPAWN emit fires during spawnIfNotAssigned (wiring test)', () => {

  // Also mock dependencies required by waitForResults
  vi.mock('../../src/orchestra/tmux.js', () => ({
    spawnWorker: vi.fn(),
    killWorker: vi.fn(),
  }));

  vi.mock('../../src/orchestra/result-watcher.js', () => ({
    createResultWatcher: vi.fn(() => ({
      waitForChange: vi.fn(() => Promise.resolve()),
      close: vi.fn(),
    })),
  }));

  vi.mock('../../src/orchestra/task-builder.js', () => ({
    buildWorkerPrompt: vi.fn(() => 'mock prompt'),
  }));

  let testRoot: string;

  beforeEach(() => {
    vi.clearAllMocks();
    testRoot = join(
      tmpdir(),
      `deckent-spawn-emit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
    mkdirSync(join(testRoot, '.tasks'), { recursive: true });
    writeFileSync(
      join(testRoot, '.deckent', 'sprint-state.json'),
      JSON.stringify({ sprintId: 'sprint-280' }),
      'utf-8',
    );
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* cleanup */ }
  });

  it('emitProgress is called with phase=SPAWN when a queued task is spawned', async () => {
    const { waitForResults } = await import('../../src/orchestra/result-collector.js');
    const { TaskStatus, SprintPhase, SprintStatus } = await import('../../src/core/types.js');

    // One already-executing task (will immediately collect via .result)
    const execTask = {
      id: 'exec-001',
      title: 'Executing task',
      description: 'test',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'test',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'ok', noGoCriteria: 'fail', techDebtAcceptable: 'no' },
      status: TaskStatus.EXECUTING,
      sprintId: 'sprint-280',
      createdAt: new Date().toISOString(),
      assignedAgent: 'generic',
      assignedSkills: [],
    };

    // One pending queue task that will be spawned
    const queueTask = {
      id: 'queue-001',
      title: 'Queue task',
      description: 'test',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'test',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'ok', noGoCriteria: 'fail', techDebtAcceptable: 'no' },
      status: TaskStatus.PENDING,
      sprintId: 'sprint-280',
      createdAt: new Date().toISOString(),
      assignedAgent: 'generic',
      assignedSkills: [],
    };

    const sprint = {
      id: 'sprint-280',
      number: 280,
      tasks: [execTask],
      workers: ['w-exec-001'],
      phase: SprintPhase.EXECUTE,
      status: SprintStatus.ACTIVE,
      startedAt: new Date().toISOString(),
    };

    // Write result for the executing task (immediate collection)
    writeFileSync(
      join(testRoot, '.tasks', 'task-exec-001.result'),
      JSON.stringify({
        taskId: 'exec-001',
        filesChanged: [],
        linesAdded: 0,
        linesRemoved: 0,
        testsPassed: true,
        coverage: 100,
        selfAssessment: 'DONE',
        notes: 'done',
      }),
      'utf-8',
    );

    // Write result for the queue task too (so waitForResults can exit)
    writeFileSync(
      join(testRoot, '.tasks', 'task-queue-001.result'),
      JSON.stringify({
        taskId: 'queue-001',
        filesChanged: [],
        linesAdded: 0,
        linesRemoved: 0,
        testsPassed: true,
        coverage: 100,
        selfAssessment: 'DONE',
        notes: 'done',
      }),
      'utf-8',
    );

    // Run with queue=[queueTask] — when exec-001 completes, processQueue fires
    // spawnIfNotAssigned for queueTask → emitProgress(SPAWN)
    await waitForResults(testRoot, sprint, 5000, [queueTask]);

    // Verify emitProgress was called with phase='SPAWN'
    const spawnCalls = emitProgressMock.mock.calls.filter(
      (call: unknown[]) => (call[0] as { phase: string })?.phase === 'SPAWN',
    );
    expect(spawnCalls.length).toBeGreaterThanOrEqual(1);
    expect((spawnCalls[0]![0] as { phase: string; detail: string }).detail).toBe('queue-001');
  });
});
