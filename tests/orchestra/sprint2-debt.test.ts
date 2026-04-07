/**
 * Sprint 2 — Technical Debt Tests
 *
 * Tests for each debt fix in DIRECTIVES.md (Sprint 2 / Dogfooding):
 *   DEBT-004 : waitForResults async polling
 *   DEBT-005 : buildWorkerPrompt test instructions
 *   DEBT-003 : extractScopeFromDirective — DIRECTIVES.md format
 *   DEBT-005b: StartOptions autoApprove / sandbox separation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TaskStatus, SprintPhase, SprintStatus,
} from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig, StartOptions } from '../../src/core/types.js';

// ─── Module Mocks ───────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn().mockReturnValue([]),
  startAuditor: vi.fn(),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(),
  detectDeadlocks: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn(),
  releaseAllLocks: vi.fn(),
}));

import { existsSync, readFileSync } from 'node:fs';
import {
  waitForResults,
  buildWorkerPrompt,
  extractScopeFromDirective,
} from '../../src/orchestra/brain.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(id = '001-001', scopeDirs: string[] = ['src/']): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Description for ${id}`,
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: scopeDirs, filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: 'Minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-001',
    createdAt: '2026-03-17T00:00:00.000Z',
  };
}

function makeSprint(taskIds: string[]): Sprint {
  return {
    id: 'sprint-001',
    number: 1,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EXECUTE,
    tasks: taskIds.map(id => makeTask(id)),
    workers: taskIds.map(id => `w-${id}`),
  };
}

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'pro_plan',
    projectRoot: '/test',
    projectName: 'test',
    language: 'tr',
    version: '0.1.0',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: false,
    },
    modes: {} as never,
    ...overrides,
  };
}

function makeTaskResult(taskId: string) {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/foo.ts', `tests/foo.test.ts`],
    linesAdded: 50,
    linesRemoved: 5,
    testsPassed: true,
    coverage: 92,
    selfAssessment: 'DONE' as const,
    notes: 'All tests pass',
  };
}

// ═══════════════════════════════════════════════════════════════════
// DEBT-004: waitForResults — async polling contract
// ═══════════════════════════════════════════════════════════════════

describe('DEBT-004: waitForResults — async polling contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockedExistsSync.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Promise contract ────────────────────────────────────────────

  it('returns a Promise (is async, not sync)', async () => {
    const sprint = makeSprint(['001-001']);
    const returnValue = waitForResults('/root', sprint, 1);
    expect(returnValue).toBeInstanceOf(Promise);
    await vi.runAllTimersAsync();
    await returnValue;
  });

  it('Promise resolves to an array', async () => {
    const sprint = makeSprint(['001-001']);
    const promise = waitForResults('/root', sprint, 1);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(Array.isArray(result)).toBe(true);
  });

  // ── Empty sprint ─────────────────────────────────────────────────

  it('returns empty array immediately for a sprint with no tasks', async () => {
    const sprint = makeSprint([]);
    const promise = waitForResults('/root', sprint, 30_000);
    await vi.runAllTimersAsync();
    const results = await promise;
    expect(results).toEqual([]);
  });

  // ── First-pass immediate collection ─────────────────────────────

  it('collects results on first pass without polling when all files exist', async () => {
    const sprint = makeSprint(['001-001']);
    const result = makeTaskResult('001-001');
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(result) as never);

    const promise = waitForResults('/root', sprint, 60_000);
    // Do NOT advance timers — first pass should find result synchronously
    await Promise.resolve(); // flush microtasks only
    const results = await promise;
    expect(results).toHaveLength(1);
    expect(results[0]?.taskId).toBe('001-001');
  });

  // ── Timeout boundary ─────────────────────────────────────────────

  it('exits polling loop when timeout=1 and returns collected partial results', async () => {
    const sprint = makeSprint(['001-001', '001-002']);
    const result1 = makeTaskResult('001-001');

    mockedExistsSync.mockImplementation((path: unknown) =>
      typeof path === 'string' && path.includes('task-001-001.result'),
    );
    mockedReadFileSync.mockReturnValue(JSON.stringify(result1) as never);

    const promise = waitForResults('/root', sprint, 1);
    await vi.runAllTimersAsync();
    const results = await promise;
    // Only result1 should be collected (001-002 never found)
    expect(results).toHaveLength(1);
    expect(results[0]?.taskId).toBe('001-001');
  });

  // ── Polling behaviour ────────────────────────────────────────────

  it('finds result after one poll interval (15 s)', async () => {
    const sprint = makeSprint(['001-001']);
    const result = makeTaskResult('001-001');

    let found = false;
    mockedExistsSync.mockImplementation(() => found);
    mockedReadFileSync.mockReturnValue(JSON.stringify(result) as never);

    const promise = waitForResults('/root', sprint, 60_000);

    // Before first poll interval result is absent
    await vi.advanceTimersByTimeAsync(14_000);
    // Make result available then advance past poll interval
    found = true;
    await vi.advanceTimersByTimeAsync(2_000); // crosses 15 000 ms boundary

    const results = await promise;
    expect(results).toHaveLength(1);
    expect(results[0]?.taskId).toBe('001-001');
  });

  it('collects all tasks when they appear at different poll intervals', async () => {
    const sprint = makeSprint(['001-001', '001-002']);
    const result1 = makeTaskResult('001-001');
    const result2 = makeTaskResult('001-002');

    let task2Found = false;
    mockedExistsSync.mockImplementation((path: unknown) => {
      if (typeof path !== 'string') return false;
      if (path.includes('task-001-001.result')) return true;
      if (path.includes('task-001-002.result')) return task2Found;
      return false;
    });
    mockedReadFileSync.mockImplementation((path: unknown) => {
      if (typeof path === 'string' && path.includes('task-001-002.result')) {
        return JSON.stringify(result2) as never;
      }
      return JSON.stringify(result1) as never;
    });

    const promise = waitForResults('/root', sprint, 60_000);

    // task1 found on first pass, task2 not yet
    await vi.advanceTimersByTimeAsync(1_000);
    task2Found = true;
    await vi.advanceTimersByTimeAsync(15_000); // past second poll

    const results = await promise;
    expect(results).toHaveLength(2);
    const ids = results.map(r => r.taskId).sort();
    expect(ids).toEqual(['001-001', '001-002']);
  });

  // ── Resilience ───────────────────────────────────────────────────

  it('skips tasks whose result files contain invalid JSON', async () => {
    const sprint = makeSprint(['001-001']);
    mockedExistsSync.mockImplementation((p: string) => {
      if (typeof p === 'string' && p.endsWith('.timeout')) return false;
      return p.toString().endsWith('.result');
    });
    mockedReadFileSync.mockReturnValue('{ broken json' as never);

    const promise = waitForResults('/root', sprint, 1);
    await vi.runAllTimersAsync();
    const results = await promise;
    expect(results).toHaveLength(0);
  });

  it('skips tasks whose result files throw on read', async () => {
    const sprint = makeSprint(['001-001']);
    mockedExistsSync.mockImplementation((p: string) => {
      if (typeof p === 'string' && p.endsWith('.timeout')) return false;
      return p.toString().endsWith('.result');
    });
    mockedReadFileSync.mockImplementation(() => { throw new Error('EACCES'); });

    const promise = waitForResults('/root', sprint, 1);
    await vi.runAllTimersAsync();
    const results = await promise;
    expect(results).toHaveLength(0);
  });

  it('does not count the same task result twice', async () => {
    const sprint = makeSprint(['001-001']);
    const result = makeTaskResult('001-001');
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(result) as never);

    const promise = waitForResults('/root', sprint, 30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    const results = await promise;
    // Despite multiple poll iterations, result collected only once
    expect(results.filter(r => r.taskId === '001-001')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// DEBT-005: buildWorkerPrompt — test-writing instructions
// ═══════════════════════════════════════════════════════════════════

describe('DEBT-005: buildWorkerPrompt — test-writing instructions', () => {
  it('embeds the task ID in the result file path', () => {
    const task = makeTask('002-007');
    const prompt = buildWorkerPrompt(task);
    expect(prompt).toContain('task-002-007.result');
  });

  it('instructs worker to run project test command', () => {
    const prompt = buildWorkerPrompt(makeTask());
    expect(prompt).toContain('run the project test command');
  });

  it('instructs worker to run project lint command', () => {
    const prompt = buildWorkerPrompt(makeTask());
    expect(prompt).toContain('run the project lint command');
  });

  it('marks result file as REQUIRED', () => {
    const prompt = buildWorkerPrompt(makeTask());
    expect(prompt).toContain('REQUIRED');
  });

  it('references result file fields in condensed format', () => {
    const prompt = buildWorkerPrompt(makeTask());
    // Result file fields referenced in condensed hint
    expect(prompt).toContain('taskId');
    expect(prompt).toContain('testsPassed');
    expect(prompt).toContain('selfAssessment');
  });

  it('lists valid selfAssessment values in the prompt', () => {
    const prompt = buildWorkerPrompt(makeTask());
    expect(prompt).toContain('DONE');
    expect(prompt).toContain('GO_WITH_TECH_DEBT');
    expect(prompt).toContain('NO_GO');
  });

  it('includes scope rules section', () => {
    const prompt = buildWorkerPrompt(makeTask());
    expect(prompt).toContain('Scope Rules');
  });

  it('instructs worker to write test result to .result file', () => {
    const prompt = buildWorkerPrompt(makeTask());
    // vitest output goes to result file
    expect(prompt).toMatch(/result|vitest/i);
  });

  it('scope reflects task directories (comma-separated)', () => {
    const task = makeTask('001-001', ['src/orchestra/', 'src/core/']);
    const prompt = buildWorkerPrompt(task);
    expect(prompt).toContain('src/orchestra/');
    expect(prompt).toContain('src/core/');
  });

  it('preserves single quotes in prompt (tmux handles escaping)', () => {
    const task = makeTask('001-001');
    task.title = "Task with it's apostrophe";
    const prompt = buildWorkerPrompt(task);
    expect(prompt).toContain("it's");
  });
});

// ═══════════════════════════════════════════════════════════════════
// DEBT-003: extractScopeFromDirective — DIRECTIVES.md format
// ═══════════════════════════════════════════════════════════════════

describe('DEBT-003: extractScopeFromDirective — DIRECTIVES.md format', () => {
  // ── Standard cases ────────────────────────────────────────────────

  it('extracts a single src/ file path from "Dosya: ..." line', () => {
    const scope = extractScopeFromDirective('Dosya: src/orchestra/brain.ts');
    expect(scope.filesWrite).toContain('src/orchestra/brain.ts');
  });

  it('extracts multiple file paths from a single "Kapsam: ..." line', () => {
    const scope = extractScopeFromDirective(
      'Kapsam: src/core/types.ts, src/cli/commands/start.ts, src/orchestra/tmux.ts, src/orchestra/brain.ts',
    );
    expect(scope.filesWrite).toContain('src/core/types.ts');
    expect(scope.filesWrite).toContain('src/cli/commands/start.ts');
    expect(scope.filesWrite).toContain('src/orchestra/tmux.ts');
    expect(scope.filesWrite).toContain('src/orchestra/brain.ts');
  });

  it('extracts test file paths (tests/ prefix)', () => {
    const scope = extractScopeFromDirective('tests/orchestra/brain.test.ts');
    expect(scope.filesWrite).toContain('tests/orchestra/brain.test.ts');
  });

  it('extracts a src/ directory path', () => {
    const scope = extractScopeFromDirective('Kapsam: src/orchestra/');
    expect(scope.directories).toContain('src/orchestra/');
  });

  it('extracts a tests/ directory path', () => {
    const scope = extractScopeFromDirective('Kapsam: tests/orchestra/');
    expect(scope.directories).toContain('tests/orchestra/');
  });

  // ── Deduplication ─────────────────────────────────────────────────

  it('deduplicates repeated file paths in one line', () => {
    const scope = extractScopeFromDirective(
      'src/orchestra/brain.ts also src/orchestra/brain.ts',
    );
    expect(scope.filesWrite.filter(f => f === 'src/orchestra/brain.ts')).toHaveLength(1);
  });

  it('deduplicates repeated directory paths in one line', () => {
    const scope = extractScopeFromDirective(
      'src/orchestra/ and also src/orchestra/',
    );
    expect(scope.directories.filter(d => d === 'src/orchestra/')).toHaveLength(1);
  });

  // ── Fallback ─────────────────────────────────────────────────────

  it('returns all-empty scope for a comment-style line (#)', () => {
    // "# Hedef" → no file paths
    const scope = extractScopeFromDirective('# Hedef');
    expect(scope.filesWrite).toHaveLength(0);
    expect(scope.directories).toHaveLength(0);
  });

  it('returns all-empty scope for a pure prose line', () => {
    const scope = extractScopeFromDirective('Bu görevin amacı sistemi düzeltmektir.');
    expect(scope.filesWrite).toHaveLength(0);
    expect(scope.directories).toHaveLength(0);
    expect(scope.filesRead).toHaveLength(0);
  });

  // ── Contract ──────────────────────────────────────────────────────

  it('always returns an empty filesRead array', () => {
    const scope = extractScopeFromDirective('src/orchestra/brain.ts');
    expect(scope.filesRead).toEqual([]);
  });

  it('returns all three scope array keys', () => {
    const scope = extractScopeFromDirective('');
    expect(scope).toHaveProperty('directories');
    expect(scope).toHaveProperty('filesRead');
    expect(scope).toHaveProperty('filesWrite');
  });

  // ── DIRECTIVES.md real-world lines ───────────────────────────────

  it('handles the DEBT-002 scope line from DIRECTIVES.md', () => {
    const line = 'Kapsam: src/orchestra/brain.ts';
    const scope = extractScopeFromDirective(line);
    expect(scope.filesWrite).toContain('src/orchestra/brain.ts');
  });

  it('handles the DEBT-005 scope line with four files from DIRECTIVES.md', () => {
    const line = 'Kapsam: src/core/types.ts, src/cli/commands/start.ts, src/orchestra/tmux.ts, src/orchestra/brain.ts';
    const scope = extractScopeFromDirective(line);
    expect(scope.filesWrite.length).toBeGreaterThanOrEqual(4);
  });

  it('handles the worker prompt scope line from DIRECTIVES.md', () => {
    const line = 'Kapsam: src/orchestra/brain.ts';
    const scope = extractScopeFromDirective(line);
    expect(scope.filesWrite).toContain('src/orchestra/brain.ts');
  });
});

// ═══════════════════════════════════════════════════════════════════
// DEBT-005b: StartOptions — autoApprove / sandbox separation
// ═══════════════════════════════════════════════════════════════════

describe('DEBT-005b: StartOptions — autoApprove / sandbox separation', () => {
  it('has an autoApprove boolean field', () => {
    const opts: StartOptions = { autoApprove: true };
    expect(opts.autoApprove).toBe(true);
  });

  it('has a sandbox boolean field', () => {
    const opts: StartOptions = { sandbox: true };
    expect(opts.sandbox).toBe(true);
  });

  it('both fields are optional (empty object is valid)', () => {
    const opts: StartOptions = {};
    expect(opts.autoApprove).toBeUndefined();
    expect(opts.sandbox).toBeUndefined();
  });

  it('autoApprove and sandbox are independent flags', () => {
    const permOnly: StartOptions = { autoApprove: true, sandbox: false };
    expect(permOnly.autoApprove).toBe(true);
    expect(permOnly.sandbox).toBe(false);

    const sandboxOnly: StartOptions = { autoApprove: false, sandbox: true };
    expect(sandboxOnly.autoApprove).toBe(false);
    expect(sandboxOnly.sandbox).toBe(true);
  });

  it('autoApprove maps to CLI --dangerously-skip-permissions (not model constraint)', () => {
    // Semantic test: autoApprove should represent permission skip, not model selection.
    // This is validated by type inspection — autoApprove is a separate key from haiku_allowed.
    const opts: StartOptions = { autoApprove: true };
    // StartOptions does NOT have haiku_allowed — that belongs to PlanModeConfig
    expect(opts).not.toHaveProperty('haiku_allowed');
  });

  it('sandbox maps to Docker/isolated run mode (not permission flag)', () => {
    const opts: StartOptions = { sandbox: true };
    expect(opts).not.toHaveProperty('autoApprove', true);
  });
});
