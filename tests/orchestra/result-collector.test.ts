import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

import type { Task, Sprint, TaskResult } from '../../src/core/types.js';
import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';

// We test the timeout-detection logic in collectResults by calling waitForResults
// with a minimal sprint containing one task that has a .timeout file.

// Mock tmux and result-watcher to avoid real fs.watch and tmux calls
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

import {
  waitForResults,
  handleWorkerQuestion,
  checkWorkerQuestions,
  estimateTokenUsage,
  enrichResultTokenUsage,
} from '../../src/orchestra/result-collector.js';
import {
  writeQuestionFile,
  getQuestionPath,
  getAnswerPath,
} from '../../src/agents/worker-ipc.js';
import type { WorkerQuestion } from '../../src/core/task-types.js';

function makeTmpDir(): string {
  const dir = join(tmpdir(), `deckent-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  return dir;
}

function makeTask(id: string): Task {
  return {
    id,
    title: `Test task ${id}`,
    description: 'test',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'tests pass', noGoCriteria: 'tests fail', techDebtAcceptable: 'partial' },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-test',
    createdAt: new Date().toISOString(),
    assignedAgent: 'generic',
    assignedSkills: [],
  } as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-test',
    number: 1,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    phase: SprintPhase.EXECUTE,
    status: SprintStatus.ACTIVE,
    startedAt: new Date().toISOString(),
  } as Sprint;
}

describe('result-collector timeout detection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
  });

  it('detects .timeout file and writes synthetic NO_GO result', async () => {
    const task = makeTask('test-001');
    const sprint = makeSprint([task]);

    // Write a .timeout marker (simulates worker killed by timeout)
    writeFileSync(join(tmpDir, '.tasks', 'task-test-001.timeout'), 'WORKER_TIMEOUT', 'utf-8');

    const results = await waitForResults(tmpDir, sprint, 5000);

    expect(results).toHaveLength(1);
    expect(results[0]!.taskId).toBe('test-001');
    expect(results[0]!.selfAssessment).toBe('NO_GO');
    expect(results[0]!.notes).toContain('timeout');

    // Verify the synthetic .result was also written to disk
    const resultPath = join(tmpDir, '.tasks', 'task-test-001.result');
    expect(existsSync(resultPath)).toBe(true);
  });

  it('prefers real .result over .timeout when both exist', async () => {
    const task = makeTask('test-002');
    const sprint = makeSprint([task]);

    // Write both .result and .timeout — .result should take precedence
    const realResult: TaskResult = {
      taskId: 'test-002',
      workerId: 'w-test-002',
      filesChanged: ['src/foo.ts'],
      linesAdded: 10,
      linesRemoved: 2,
      testsPassed: true,
      coverage: 95,
      selfAssessment: 'DONE',
      notes: 'All good',
    };
    writeFileSync(join(tmpDir, '.tasks', 'task-test-002.result'), JSON.stringify(realResult), 'utf-8');
    writeFileSync(join(tmpDir, '.tasks', 'task-test-002.timeout'), 'WORKER_TIMEOUT', 'utf-8');

    const results = await waitForResults(tmpDir, sprint, 5000);

    expect(results).toHaveLength(1);
    expect(results[0]!.selfAssessment).toBe('DONE');
    expect(results[0]!.notes).toBe('All good');
  });

  it('collects normal results without timeout marker', async () => {
    const task = makeTask('test-003');
    const sprint = makeSprint([task]);

    const result: TaskResult = {
      taskId: 'test-003',
      workerId: 'w-test-003',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE',
      notes: 'Done',
    };
    writeFileSync(join(tmpDir, '.tasks', 'task-test-003.result'), JSON.stringify(result), 'utf-8');

    const results = await waitForResults(tmpDir, sprint, 5000);

    expect(results).toHaveLength(1);
    expect(results[0]!.selfAssessment).toBe('DONE');
  });

  it('handles multiple tasks with mixed results and timeouts', async () => {
    const task1 = makeTask('test-004');
    const task2 = makeTask('test-005');
    const sprint = makeSprint([task1, task2]);

    // task1 has normal result, task2 timed out
    const result1: TaskResult = {
      taskId: 'test-004',
      workerId: 'w-test-004',
      filesChanged: ['a.ts'],
      linesAdded: 5,
      linesRemoved: 1,
      testsPassed: true,
      coverage: 90,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      notes: 'Partial',
    };
    writeFileSync(join(tmpDir, '.tasks', 'task-test-004.result'), JSON.stringify(result1), 'utf-8');
    writeFileSync(join(tmpDir, '.tasks', 'task-test-005.timeout'), 'WORKER_TIMEOUT', 'utf-8');

    const results = await waitForResults(tmpDir, sprint, 5000);

    expect(results).toHaveLength(2);
    const r1 = results.find(r => r.taskId === 'test-004');
    const r2 = results.find(r => r.taskId === 'test-005');
    expect(r1!.selfAssessment).toBe('GO_WITH_TECH_DEBT');
    expect(r2!.selfAssessment).toBe('NO_GO');
    expect(r2!.notes).toContain('timeout');
  });
});

// ═══ Worker Question Handling ════════════════════════════════════════

describe('handleWorkerQuestion', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
  });

  it('returns undefined when no question file exists', () => {
    const result = handleWorkerQuestion(tmpDir, 'no-question');
    expect(result).toBeUndefined();
  });

  it('auto-answers with continue when question file exists', () => {
    const question: WorkerQuestion = {
      taskId: 'hq-001',
      workerId: 'w-hq-001',
      question: 'Should I continue with this approach?',
      timestamp: new Date().toISOString(),
    };
    writeQuestionFile(tmpDir, question);

    const answer = handleWorkerQuestion(tmpDir, 'hq-001');

    expect(answer).toBeDefined();
    expect(answer!.action).toBe('continue');
    expect(answer!.taskId).toBe('hq-001');

    // Verify answer file was written
    expect(existsSync(getAnswerPath(tmpDir, 'hq-001'))).toBe(true);
  });
});

describe('checkWorkerQuestions', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
  });

  it('answers questions for active (uncollected) tasks', () => {
    const question: WorkerQuestion = {
      taskId: 'cq-001',
      workerId: 'w-cq-001',
      question: 'Is this right?',
      timestamp: new Date().toISOString(),
    };
    writeQuestionFile(tmpDir, question);

    const taskIds = new Set(['cq-001', 'cq-002']);
    const collectedIds = new Set<string>();

    const answered = checkWorkerQuestions(tmpDir, taskIds, collectedIds);

    expect(answered).toContain('cq-001');
    expect(answered).not.toContain('cq-002');
  });

  it('skips collected tasks', () => {
    const question: WorkerQuestion = {
      taskId: 'cq-003',
      workerId: 'w-cq-003',
      question: 'Late question',
      timestamp: new Date().toISOString(),
    };
    writeQuestionFile(tmpDir, question);

    const taskIds = new Set(['cq-003']);
    const collectedIds = new Set(['cq-003']); // already collected

    const answered = checkWorkerQuestions(tmpDir, taskIds, collectedIds);

    expect(answered).toHaveLength(0);
  });

  it('handles multiple tasks with questions', () => {
    const q1: WorkerQuestion = {
      taskId: 'cq-004',
      workerId: 'w-cq-004',
      question: 'Question A',
      timestamp: new Date().toISOString(),
    };
    const q2: WorkerQuestion = {
      taskId: 'cq-005',
      workerId: 'w-cq-005',
      question: 'Question B',
      timestamp: new Date().toISOString(),
    };
    writeQuestionFile(tmpDir, q1);
    writeQuestionFile(tmpDir, q2);

    const taskIds = new Set(['cq-004', 'cq-005', 'cq-006']);
    const collectedIds = new Set<string>();

    const answered = checkWorkerQuestions(tmpDir, taskIds, collectedIds);

    expect(answered).toHaveLength(2);
    expect(answered).toContain('cq-004');
    expect(answered).toContain('cq-005');
  });

  it('returns empty array when no questions exist', () => {
    const taskIds = new Set(['cq-007']);
    const collectedIds = new Set<string>();

    const answered = checkWorkerQuestions(tmpDir, taskIds, collectedIds);

    expect(answered).toHaveLength(0);
  });
});

// ═══ Token Usage Pipeline ════════════════════════════════════════════

function makeResult(overrides: Partial<TaskResult> & { taskId: string }): TaskResult {
  return {
    workerId: `w-${overrides.taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 80,
    selfAssessment: 'DONE',
    notes: '',
    ...overrides,
  };
}

describe('estimateTokenUsage', () => {
  it('estimates token usage from task estimatedTokens and result linesAdded', () => {
    const task = makeTask('tok-001');
    task.estimatedTokens = 5000;
    task.provider = 'claude';
    task.model = 'opus';
    const result = makeResult({ taskId: 'tok-001', linesAdded: 100, linesRemoved: 20 });

    const usage = estimateTokenUsage(task, result);

    expect(usage.inputTokens).toBe(5000);
    expect(usage.outputTokens).toBe(1500); // 100 * 15
    expect(usage.cacheReadTokens).toBe(20000); // 5000 * 4
    expect(usage.provider).toBe('claude');
    expect(usage.model).toBe('opus');
  });

  it('falls back when task has no estimatedTokens', () => {
    const task = makeTask('tok-002');
    task.provider = 'codex';
    task.model = 'gpt-5';
    const result = makeResult({ taskId: 'tok-002', linesAdded: 50, linesRemoved: 10 });

    const usage = estimateTokenUsage(task, result);

    // inputTokens = max((50+10)*10, 1000) = max(600, 1000) = 1000
    expect(usage.inputTokens).toBe(1000);
    expect(usage.outputTokens).toBe(750); // 50 * 15
    expect(usage.provider).toBe('codex');
    expect(usage.model).toBe('gpt-5');
  });

  it('uses forceModel over model when both present', () => {
    const task = makeTask('tok-003');
    task.model = 'sonnet';
    task.forceModel = 'opus';
    const result = makeResult({ taskId: 'tok-003', linesAdded: 10, linesRemoved: 0 });

    const usage = estimateTokenUsage(task, result);

    expect(usage.model).toBe('opus');
  });

  it('ensures minimum outputTokens of 500', () => {
    const task = makeTask('tok-004');
    task.estimatedTokens = 2000;
    const result = makeResult({ taskId: 'tok-004', linesAdded: 0, linesRemoved: 0 });

    const usage = estimateTokenUsage(task, result);

    expect(usage.outputTokens).toBe(500);
  });
});

describe('enrichResultTokenUsage', () => {
  it('enriches result that has no tokenUsage', () => {
    const task = makeTask('enr-001');
    task.estimatedTokens = 8000;
    task.provider = 'claude';
    task.model = 'sonnet';
    const result = makeResult({ taskId: 'enr-001', linesAdded: 200, linesRemoved: 50 });

    expect(result.tokenUsage).toBeUndefined();
    enrichResultTokenUsage(result, task);

    expect(result.tokenUsage).toBeDefined();
    expect(result.tokenUsage!.inputTokens).toBe(8000);
    expect(result.tokenUsage!.outputTokens).toBe(3000); // 200 * 15
    expect(result.tokenUsage!.provider).toBe('claude');
    expect(result.tokenUsage!.model).toBe('sonnet');
  });

  it('does not overwrite existing tokenUsage', () => {
    const task = makeTask('enr-002');
    task.estimatedTokens = 8000;
    const existing = { inputTokens: 999, outputTokens: 111, cacheReadTokens: 555, provider: 'gemini' as const, model: 'gemini-2.5-pro' as const };
    const result = makeResult({ taskId: 'enr-002', tokenUsage: existing });

    enrichResultTokenUsage(result, task);

    expect(result.tokenUsage).toBe(existing); // reference equality — untouched
    expect(result.tokenUsage!.inputTokens).toBe(999);
  });

  // WP-4: the worker now reports a zero-count stub (counts are the orchestrator's
  // job — an LLM cannot count its own tokens). A zero stub must be FILLED with the
  // orchestrator estimate, not kept at 0 (which would undercount cost/metrics).
  it('WP-4: replaces a zero-count worker stub with the orchestrator estimate', () => {
    const task = makeTask('enr-wp4');
    task.estimatedTokens = 8000;
    task.provider = 'claude';
    task.model = 'sonnet';
    const stub = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, provider: 'claude' as const, model: 'sonnet' as const };
    const result = makeResult({ taskId: 'enr-wp4', linesAdded: 200, linesRemoved: 50, tokenUsage: stub });

    enrichResultTokenUsage(result, task);

    expect(result.tokenUsage!.inputTokens).toBe(8000);
    expect(result.tokenUsage!.outputTokens).toBe(3000); // 200 * 15
    expect(result.tokenUsage!.provider).toBe('claude');
  });

  // WP-4 back-compat: a legacy worker that DID report real non-zero counts is kept.
  it('WP-4: keeps a legacy non-zero worker claim verbatim', () => {
    const task = makeTask('enr-wp4b');
    task.estimatedTokens = 8000;
    const claim = { inputTokens: 1234, outputTokens: 56, cacheReadTokens: 0, provider: 'claude' as const, model: 'sonnet' as const };
    const result = makeResult({ taskId: 'enr-wp4b', linesAdded: 200, tokenUsage: claim });

    enrichResultTokenUsage(result, task);

    expect(result.tokenUsage!.inputTokens).toBe(1234);
    expect(result.tokenUsage!.outputTokens).toBe(56);
  });

  it('does nothing when task is undefined', () => {
    const result = makeResult({ taskId: 'enr-003' });

    enrichResultTokenUsage(result, undefined);

    expect(result.tokenUsage).toBeUndefined();
  });

  it('preserves provider field for multi-provider sprints', () => {
    const task1 = makeTask('enr-004');
    task1.provider = 'claude';
    task1.model = 'opus';
    task1.estimatedTokens = 5000;

    const task2 = makeTask('enr-005');
    task2.provider = 'codex';
    task2.model = 'gpt-5';
    task2.estimatedTokens = 3000;

    const task3 = makeTask('enr-006');
    task3.provider = 'gemini';
    task3.model = 'gemini-2.5-pro';
    task3.estimatedTokens = 4000;

    const r1 = makeResult({ taskId: 'enr-004', linesAdded: 100, linesRemoved: 10 });
    const r2 = makeResult({ taskId: 'enr-005', linesAdded: 80, linesRemoved: 5 });
    const r3 = makeResult({ taskId: 'enr-006', linesAdded: 60, linesRemoved: 20 });

    enrichResultTokenUsage(r1, task1);
    enrichResultTokenUsage(r2, task2);
    enrichResultTokenUsage(r3, task3);

    expect(r1.tokenUsage!.provider).toBe('claude');
    expect(r2.tokenUsage!.provider).toBe('codex');
    expect(r3.tokenUsage!.provider).toBe('gemini');
  });
});

describe('waitForResults — token enrichment integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
  });

  it('enriches collected results with estimated tokenUsage', async () => {
    const task = makeTask('int-001');
    task.estimatedTokens = 10000;
    task.provider = 'claude';
    task.model = 'opus';
    const sprint = makeSprint([task]);

    const result: TaskResult = {
      taskId: 'int-001',
      workerId: 'w-int-001',
      filesChanged: ['src/foo.ts'],
      linesAdded: 150,
      linesRemoved: 30,
      testsPassed: true,
      coverage: 90,
      selfAssessment: 'DONE',
      notes: 'Completed',
    };
    writeFileSync(join(tmpDir, '.tasks', 'task-int-001.result'), JSON.stringify(result), 'utf-8');

    const results = await waitForResults(tmpDir, sprint, 5000);

    expect(results).toHaveLength(1);
    expect(results[0]!.tokenUsage).toBeDefined();
    expect(results[0]!.tokenUsage!.inputTokens).toBe(10000);
    expect(results[0]!.tokenUsage!.outputTokens).toBe(2250); // 150 * 15
    expect(results[0]!.tokenUsage!.model).toBe('opus');
    expect(results[0]!.tokenUsage!.provider).toBe('claude');
  });

  it('does not overwrite worker-reported tokenUsage during collection', async () => {
    const task = makeTask('int-002');
    task.estimatedTokens = 10000;
    const sprint = makeSprint([task]);

    const workerReported = { inputTokens: 15420, outputTokens: 3200, cacheReadTokens: 89000, provider: 'claude' as const, model: 'opus' as const };
    const result: TaskResult = {
      taskId: 'int-002',
      workerId: 'w-int-002',
      filesChanged: ['src/bar.ts'],
      linesAdded: 100,
      linesRemoved: 20,
      testsPassed: true,
      coverage: 95,
      selfAssessment: 'DONE',
      notes: 'With token data',
      tokenUsage: workerReported,
    };
    writeFileSync(join(tmpDir, '.tasks', 'task-int-002.result'), JSON.stringify(result), 'utf-8');

    const results = await waitForResults(tmpDir, sprint, 5000);

    expect(results).toHaveLength(1);
    expect(results[0]!.tokenUsage!.inputTokens).toBe(15420); // original, not estimated
    expect(results[0]!.tokenUsage!.outputTokens).toBe(3200);
    expect(results[0]!.tokenUsage!.cacheReadTokens).toBe(89000);
  });

  it('enriches 12 tasks and total tokens > 0', async () => {
    const tasks: Task[] = [];
    for (let i = 1; i <= 12; i++) {
      const t = makeTask(`bulk-${String(i).padStart(3, '0')}`);
      t.estimatedTokens = 3000 + i * 500;
      t.provider = 'claude';
      t.model = 'sonnet';
      tasks.push(t);
    }
    const sprint = makeSprint(tasks);

    for (const t of tasks) {
      const r: TaskResult = {
        taskId: t.id,
        workerId: `w-${t.id}`,
        filesChanged: [],
        linesAdded: 50 + Math.floor(Math.random() * 100),
        linesRemoved: 10,
        testsPassed: true,
        coverage: 80,
        selfAssessment: 'DONE',
        notes: '',
      };
      writeFileSync(join(tmpDir, '.tasks', `task-${t.id}.result`), JSON.stringify(r), 'utf-8');
    }

    const results = await waitForResults(tmpDir, sprint, 5000);

    expect(results).toHaveLength(12);
    const totalInput = results.reduce((sum, r) => sum + (r.tokenUsage?.inputTokens ?? 0), 0);
    const totalOutput = results.reduce((sum, r) => sum + (r.tokenUsage?.outputTokens ?? 0), 0);
    expect(totalInput).toBeGreaterThan(0);
    expect(totalOutput).toBeGreaterThan(0);
    // All should have provider preserved
    for (const r of results) {
      expect(r.tokenUsage?.provider).toBe('claude');
      expect(r.tokenUsage?.model).toBe('sonnet');
    }
  });
});
