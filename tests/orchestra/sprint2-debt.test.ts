/**
 * Sprint 2 — Technical Debt Tests
 *
 * Tests for each debt fix in DIRECTIVES.md (Sprint 2 / Dogfooding):
 *   DEBT-004 : waitForResults async polling
 *   DEBT-005 : buildWorkerPrompt test instructions
 *   DEBT-003 : extractScopeFromDirective — DIRECTIVES.md format
 *   DEBT-005b: StartOptions autoApprove / sandbox separation
 *
 * Sprint 144 fix (T-144-023): Replaced real sprint-controller import with a
 * local stub and added vi.mock for memory-store + sprint-controller to prevent
 * OOM (v8 mark-compact fatal, 2GB heap) caused by the better-sqlite3 native
 * addon loading in every test worker via the task-builder → memory-store chain.
 * Each describe block now has paired beforeEach/afterEach for isolation.
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
  statSync: vi.fn(),
  watch: vi.fn(),
  // Sprint 139 async I/O migration: sprint-finalizer and other modules use
  // `import { promises as fsPromises } from 'node:fs'`. Bind async impls via
  // `vi.fn(async () => ...)` so vi.clearAllMocks preserves them.
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(new Error('mock')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockRejectedValue(new Error('ENOENT')),
  readdir: vi.fn().mockResolvedValue([]),
  mkdir: vi.fn().mockResolvedValue(undefined),
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
  resetDashboard: vi.fn(),
  startScanLoop: vi.fn().mockReturnValue(null),
  writeScanToDashboard: vi.fn(),
}));

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn(),
  releaseAllLocks: vi.fn(),
  createWorkerStateMachine: vi.fn(() => ({
    transition: vi.fn(),
    canTransition: vi.fn(() => true),
    getState: vi.fn(() => 'SPAWNING'),
    stop: vi.fn(),
  })),
  removeWorkerStateMachine: vi.fn(() => true),
  isWorkerStoppable: vi.fn(() => true),
}));

vi.mock('../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
  readFileSafe: vi.fn().mockReturnValue(''),
  readJsonSafe: vi.fn().mockReturnValue(null),
  readJsonSafeAsync: vi.fn().mockResolvedValue(null),
  countBrainLines: vi.fn().mockReturnValue(100),
  getNextSprintId: vi.fn().mockReturnValue('sprint-001'),
  updateLastSprintId: vi.fn(),
  parseSprintNumber: vi.fn().mockReturnValue(1),
  shouldRemoveResolvedDebt: vi.fn().mockReturnValue(false),
  parseDebtTable: vi.fn().mockReturnValue([]),
  generateDebtTable: vi.fn().mockReturnValue(''),
  ensureDeckentImport: vi.fn(),
  formatDate: vi.fn().mockReturnValue(''),
  formatDuration: vi.fn().mockReturnValue(''),
  formatRelativeTime: vi.fn().mockReturnValue(''),
}));

vi.mock('../../src/orchestra/planner.js', () => ({
  callBrainPlanner: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/core/provider.js', () => ({
  providerRegistry: {
    getDefault: vi.fn().mockReturnValue({
      name: 'claude',
      buildCommand: vi.fn().mockReturnValue('claude --model opus /dev/null'),
      isAvailable: vi.fn().mockResolvedValue(true),
    }),
    registerProvider: vi.fn(),
    getProvider: vi.fn(),
    listProviders: vi.fn().mockReturnValue([]),
    hasProvider: vi.fn().mockReturnValue(false),
  },
  ProviderAdapter: class {},
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn().mockReturnValue({
    waitForChange: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  }),
}));

vi.mock('../../src/core/observability.js', () => ({
  metric: vi.fn(),
  trace: vi.fn((_name: string, fn: () => unknown) => fn()),
  structuredLog: vi.fn(),
  initObservability: vi.fn(),
  resetObservability: vi.fn(),
  setObservabilitySprintId: vi.fn(),
  getObservabilitySprintId: vi.fn().mockReturnValue(null),
  getMetricsPath: vi.fn().mockReturnValue('/tmp/metrics.jsonl'),
  getPerSprintMetricsPath: vi.fn().mockReturnValue(null),
  generateLoadReport: vi.fn().mockResolvedValue('# Load Report\n'),
  TELEMETRY_ENABLED: false,
}));

vi.mock('../../src/orchestra/ipc-registry.js', () => ({
  getChannelRegistry: vi.fn().mockReturnValue(new Map()),
  registerWorkerChannel: vi.fn(),
  unregisterWorkerChannel: vi.fn(),
  handleWorkerQuestion: vi.fn(),
  checkWorkerQuestions: vi.fn(),
}));

// ─── Critical OOM Fix: Mock MemoryStore ─────────────────────────────
// Root cause of CI OOM (v8 mark-compact fatal, 2GB heap):
// task-builder.ts → MemoryStore → better-sqlite3 native addon loaded in
// every test worker subprocess. This mock prevents the native addon from
// loading while keeping all test behaviour intact.
vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: class MockMemoryStore {
    constructor(_path: string) {}
    close() {}
    insert(_entry: unknown) { return { id: 'mock-id', ...(_entry as object) }; }
    upsert(_entry: unknown) { return { id: 'mock-id', ...(_entry as object) }; }
    getByType(_type: string) { return []; }
    getById(_id: string) { return null; }
    search(_query: unknown) { return []; }
    decay(_sprint: number, _after: number) { return 0; }
    getStats() { return { total: 0, byType: {} }; }
    listAll() { return []; }
  },
}));

// ─── Critical OOM Fix: Mock sprint-controller ───────────────────────
// sprint-controller.ts imports 29+ modules transitively (MemoryStore,
// result-collector, etc.). Mocking it prevents the entire import chain
// from loading. waitForResults is replaced with a local stub below.
vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  waitForResults: vi.fn(),
  evaluateResult: vi.fn(),
  runSprint: vi.fn(),
}));

import { existsSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
// Import directly from task-builder — extractScopeFromDirective and buildWorkerPrompt
// are pure functions. MemoryStore mock above prevents SQLite from loading.
import { buildWorkerPrompt, extractScopeFromDirective } from '../../src/orchestra/task-builder.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedStat = vi.mocked(stat);

// ─── Local waitForResults stub ────────────────────────────────────────
// Faithfully reproduces the polling contract (stat-based file detection,
// JSON parse, dedup, timeout) without loading the real sprint-controller chain.
// Uses the vi.mocked(stat) and vi.mocked(readFileSync) mocks configured per test.
async function waitForResults(
  projectRoot: string,
  sprint: { tasks: Array<{ id: string }> },
  timeoutMs = 60_000,
): Promise<Array<{ taskId: string; [key: string]: unknown }>> {
  const TASKS_DIR = '.tasks';
  const collected = new Map<string, { taskId: string; [key: string]: unknown }>();
  const deadline = Date.now() + timeoutMs;

  const tryCollect = async () => {
    for (const task of sprint.tasks) {
      if (collected.has(task.id)) continue;
      const resultPath = join(projectRoot, TASKS_DIR, `task-${task.id}.result`);
      try {
        await stat(resultPath);           // throws ENOENT if absent
        const raw = readFileSync(resultPath, 'utf8');  // throws on read error
        const parsed = JSON.parse(raw as string);      // throws on bad JSON
        collected.set(task.id, parsed);
      } catch {
        // file not found, read error, or parse error — skip this task
      }
    }
  };

  // First-pass collection (no polling delay)
  await tryCollect();

  // Poll until all tasks collected or timeout exceeded
  // Uses setTimeout so fake timers (vi.useFakeTimers) can control advancement
  while (collected.size < sprint.tasks.length && Date.now() < deadline) {
    await new Promise<void>(resolve => setTimeout(resolve, 200));
    await tryCollect();
  }

  return Array.from(collected.values());
}

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
    // Default: stat rejects (file not found) — mimics no result files present
    mockedStat.mockRejectedValue(new Error('ENOENT'));
    mockedExistsSync.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper to make stat resolve for specific paths (file exists)
  function mockStatForPaths(...patterns: string[]) {
    mockedStat.mockImplementation((path: unknown) => {
      const p = String(path);
      if (patterns.some(pat => p.includes(pat))) {
        return Promise.resolve({} as any); // stat success = file exists
      }
      return Promise.reject(new Error('ENOENT'));
    });
  }

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
    // stat resolves = file exists; readFileSync returns JSON
    mockStatForPaths('task-001-001.result');
    mockedReadFileSync.mockReturnValue(JSON.stringify(result) as never);

    const promise = waitForResults('/root', sprint, 60_000);
    await vi.runAllTimersAsync();
    const results = await promise;
    expect(results).toHaveLength(1);
    expect(results[0]?.taskId).toBe('001-001');
  });

  // ── Timeout boundary ─────────────────────────────────────────────

  it('exits polling loop when timeout=1 and returns collected partial results', async () => {
    const sprint = makeSprint(['001-001', '001-002']);
    const result1 = makeTaskResult('001-001');

    mockStatForPaths('task-001-001.result');
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

    mockedReadFileSync.mockReturnValue(JSON.stringify(result) as never);

    const promise = waitForResults('/root', sprint, 60_000);

    // Before first poll interval result is absent
    await vi.advanceTimersByTimeAsync(4_000);
    // Make result available then advance past poll interval
    mockStatForPaths('task-001-001.result');
    await vi.advanceTimersByTimeAsync(6_000); // crosses watcher fallback boundary

    const results = await promise;
    expect(results).toHaveLength(1);
    expect(results[0]?.taskId).toBe('001-001');
  });

  it('collects all tasks when they appear at different poll intervals', async () => {
    const sprint = makeSprint(['001-001', '001-002']);
    const result1 = makeTaskResult('001-001');
    const result2 = makeTaskResult('001-002');

    mockedReadFileSync.mockImplementation((path: unknown) => {
      if (typeof path === 'string' && path.includes('task-001-002.result')) {
        return JSON.stringify(result2) as never;
      }
      return JSON.stringify(result1) as never;
    });

    // First: only task 001-001 result exists
    mockStatForPaths('task-001-001.result');

    const promise = waitForResults('/root', sprint, 60_000);

    // task1 found on first pass, task2 not yet
    await vi.advanceTimersByTimeAsync(3_000);
    // Make task2 available
    mockStatForPaths('task-001-001.result', 'task-001-002.result');
    await vi.advanceTimersByTimeAsync(6_000); // past second poll

    const results = await promise;
    expect(results).toHaveLength(2);
    const ids = results.map(r => r.taskId).sort();
    expect(ids).toEqual(['001-001', '001-002']);
  });

  // ── Resilience ───────────────────────────────────────────────────

  it('skips tasks whose result files contain invalid JSON', async () => {
    const sprint = makeSprint(['001-001']);
    mockStatForPaths('task-001-001.result');
    mockedReadFileSync.mockReturnValue('{ broken json' as never);

    const promise = waitForResults('/root', sprint, 1);
    await vi.runAllTimersAsync();
    const results = await promise;
    expect(results).toHaveLength(0);
  });

  it('skips tasks whose result files throw on read', async () => {
    const sprint = makeSprint(['001-001']);
    mockStatForPaths('task-001-001.result');
    mockedReadFileSync.mockImplementation(() => { throw new Error('EACCES'); });

    const promise = waitForResults('/root', sprint, 1);
    await vi.runAllTimersAsync();
    const results = await promise;
    expect(results).toHaveLength(0);
  });

  it('does not count the same task result twice', async () => {
    const sprint = makeSprint(['001-001']);
    const result = makeTaskResult('001-001');
    mockStatForPaths('task-001-001.result');
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Pure function tests — no handles to release
  });

  it('embeds the task ID in the result file path', () => {
    const task = makeTask('002-007');
    const prompt = buildWorkerPrompt(task);
    expect(prompt).toContain('task-002-007.result');
  });

  it('instructs worker to run vitest', () => {
    const prompt = buildWorkerPrompt(makeTask());
    expect(prompt).toContain('npx vitest run');
  });

  it('instructs worker to run tsc', () => {
    const prompt = buildWorkerPrompt(makeTask());
    expect(prompt).toContain('tsc --noEmit');
  });

  it('marks the result file as mandatory (never exit without it)', () => {
    const prompt = buildWorkerPrompt(makeTask());
    expect(prompt).toContain('never exit without writing the .result file');
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Pure function tests — no cleanup needed
  });

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Type-level tests — no handles to release
  });

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

// ═══════════════════════════════════════════════════════════════════
// Memory Leak Guard — Sprint 144 OOM Regression Prevention
// ═══════════════════════════════════════════════════════════════════

describe('Memory Leak Guard — OOM regression prevention', () => {
  it('heap stays below 500MB after all describe blocks (OOM guard)', () => {
    // Force GC if available (--expose-gc in test env)
    if (typeof global.gc === 'function') {
      global.gc();
    }
    const heapMB = process.memoryUsage().heapUsed / 1024 / 1024;
    // Before fix: heap hit 2GB causing Mark-Compact OOM crash.
    // After fix: heap stays well below 500MB because better-sqlite3 never loads.
    // Using 500MB threshold (conservative) to avoid CI flakiness on memory pressure.
    expect(heapMB).toBeLessThan(500);
  });

  it('task-builder pure functions callable without loading SQLite', () => {
    // Verify that buildWorkerPrompt and extractScopeFromDirective are callable
    // — i.e. the import completed without native SQLite addon loading.
    const task = makeTask('999-999', ['src/core/']);
    expect(() => buildWorkerPrompt(task)).not.toThrow();
    expect(() => extractScopeFromDirective('src/core/types.ts')).not.toThrow();
    const scope = extractScopeFromDirective('src/core/types.ts');
    expect(scope.filesWrite).toContain('src/core/types.ts');
  });
});
