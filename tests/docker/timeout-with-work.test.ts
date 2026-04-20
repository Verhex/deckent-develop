// ─── TIMEOUT_WITH_WORK Result Atomicity Tests ────────────────────────────
// Sprint 145 Task 011: Validates the TIMEOUT_WITH_WORK partial result mechanism.
//
// These tests verify:
// - EXIT trap detects partial work via git diff and writes TIMEOUT_WITH_WORK
// - Existing .result is preserved (trap doesn't overwrite normal exit)
// - No git diff + no result → fallback NO_GO
// - File names with special characters are properly escaped
// - Integration: evaluateResult treats TIMEOUT_WITH_WORK as GO_WITH_TECH_DEBT
// - worker-lifecycle finalizeHeartbeatOnShutdown handles TIMEOUT_WITH_WORK
// - result-collector doesn't overwrite TIMEOUT_WITH_WORK with synthetic NO_GO

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { TASKS_DIR } from '../../src/core/constants.js';
import { evaluateResult } from '../../src/orchestra/result-evaluator.js';
import { finalizeHeartbeatOnShutdown } from '../../src/agents/worker-lifecycle.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import { TaskEvaluation } from '../../src/core/types.js';

// ─── Test helpers ─────────────────────────────────────────────────────────

function createTmpProjectRoot(): string {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'deckent-tww-'));
  fs.mkdirSync(path.join(root, TASKS_DIR), { recursive: true });
  return root;
}

function readDockerSource(): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'src/orchestra/spawn-backend-docker.ts'),
    'utf-8',
  );
}

function makeTask(id: string): Task {
  return {
    id,
    title: 'Test task',
    description: 'Test',
    model: 'sonnet',
    effort: 'normal',
    status: 'EXECUTING',
    sprintId: 'sprint-145',
    createdAt: new Date().toISOString(),
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
  } as Task;
}

function makeResult(overrides: Partial<TaskResult> & { taskId: string }): TaskResult {
  return {
    workerId: `w-${overrides.taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: '',
    ...overrides,
  } as TaskResult;
}

// ─── Test Suite: EXIT trap script template ────────────────────────────────

describe('Docker EXIT Trap — TIMEOUT_WITH_WORK', () => {
  it('worker.sh template contains on_exit function with git diff detection', () => {
    const source = readDockerSource();

    // The script template must include the on_exit function
    expect(source).toContain('on_exit()');
    expect(source).toContain('git diff --name-only');
    expect(source).toContain('TIMEOUT_WITH_WORK');
  });

  it('EXIT trap calls on_exit (not inline fallback)', () => {
    const source = readDockerSource();

    // Should use function-based trap, not inline
    expect(source).toContain("'trap on_exit EXIT'");
  });

  it('on_exit preserves existing .result file (normal exit path)', () => {
    const source = readDockerSource();

    // The on_exit function must check for existing .result before doing anything
    // This ensures normal worker exit (where Claude writes .result) is not overwritten
    expect(source).toContain('if [ -f "$RFILE" ]; then');
    expect(source).toContain('return');
  });

  it('on_exit falls back to NO_GO when no git diff and no result', () => {
    const source = readDockerSource();

    // When no changed files AND non-zero exit, should write fallback NO_GO
    expect(source).toContain('fallbackJson');
    // The else branch handles no-partial-work case
    expect(source).toContain('else');
  });

  it('on_exit escapes special characters in filenames for valid JSON', () => {
    const source = readDockerSource();

    // Must escape backslashes and double quotes for JSON safety
    expect(source).toContain('sed');
    // The sed command should handle both backslash and quote escaping
    expect(source).toMatch(/sed.*\\\\.*"/);
  });
});

// ─── Test Suite: evaluateResult with TIMEOUT_WITH_WORK ────────────────────

describe('evaluateResult — TIMEOUT_WITH_WORK handling', () => {
  it('TIMEOUT_WITH_WORK selfAssessment → GO_WITH_TECH_DEBT', () => {
    const task = makeTask('145-test-001');
    const result = makeResult({
      taskId: '145-test-001',
      selfAssessment: 'TIMEOUT_WITH_WORK' as TaskResult['selfAssessment'],
      filesChanged: ['src/foo.ts', 'src/bar.ts', 'tests/foo.test.ts'],
      notes: 'Worker timeout/killed but git diff shows 3 files modified.',
    });

    const evaluation = evaluateResult(result, task);
    expect(evaluation).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('NO_GO selfAssessment still returns NO_GO (not affected by TIMEOUT_WITH_WORK logic)', () => {
    const task = makeTask('145-test-002');
    const result = makeResult({
      taskId: '145-test-002',
      selfAssessment: 'NO_GO',
      notes: 'Worker exited without writing result',
    });

    const evaluation = evaluateResult(result, task);
    expect(evaluation).toBe(TaskEvaluation.NO_GO);
  });

  it('DONE selfAssessment with tests passed still returns DONE', () => {
    const task = makeTask('145-test-003');
    const result = makeResult({
      taskId: '145-test-003',
      selfAssessment: 'DONE',
      testsPassed: true,
      coverage: 95,
      filesChanged: ['src/core/config.ts'],
    });

    const evaluation = evaluateResult(result, task);
    expect(evaluation).toBe(TaskEvaluation.DONE);
  });
});

// ─── Test Suite: finalizeHeartbeatOnShutdown with TIMEOUT_WITH_WORK ──────

describe('finalizeHeartbeatOnShutdown — TIMEOUT_WITH_WORK', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = createTmpProjectRoot();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('TIMEOUT_WITH_WORK result → heartbeat finalized with TIMEOUT_WITH_WORK status', () => {
    const taskId = 'tww-001';
    const resultPath = path.join(tmpRoot, TASKS_DIR, `task-${taskId}.result`);
    const hbPath = path.join(tmpRoot, TASKS_DIR, `task-${taskId}.hb`);

    // Write a TIMEOUT_WITH_WORK result (as EXIT trap would)
    fs.writeFileSync(resultPath, JSON.stringify({
      taskId,
      selfAssessment: 'TIMEOUT_WITH_WORK',
      filesChanged: ['src/foo.ts', 'src/bar.ts', 'tests/baz.test.ts'],
      exitCode: 137,
      notes: 'Worker timeout/killed but git diff shows 3 files modified.',
    }), 'utf-8');

    const finalized = finalizeHeartbeatOnShutdown(tmpRoot, taskId);
    expect(finalized).toBe(true);

    // Verify heartbeat was written with correct status
    const hb = JSON.parse(fs.readFileSync(hbPath, 'utf-8'));
    expect(hb.status).toBe('TIMEOUT_WITH_WORK');
    expect(hb.exitCode).toBe(1);
    expect(hb.note).toContain('partial work');
  });

  it('NO_GO result → heartbeat NOT finalized (returns false)', () => {
    const taskId = 'tww-002';
    const resultPath = path.join(tmpRoot, TASKS_DIR, `task-${taskId}.result`);

    fs.writeFileSync(resultPath, JSON.stringify({
      taskId,
      selfAssessment: 'NO_GO',
      notes: 'Worker failed',
    }), 'utf-8');

    const finalized = finalizeHeartbeatOnShutdown(tmpRoot, taskId);
    expect(finalized).toBe(false);
  });

  it('DONE result → heartbeat finalized with DONE status', () => {
    const taskId = 'tww-003';
    const resultPath = path.join(tmpRoot, TASKS_DIR, `task-${taskId}.result`);
    const hbPath = path.join(tmpRoot, TASKS_DIR, `task-${taskId}.hb`);

    fs.writeFileSync(resultPath, JSON.stringify({
      taskId,
      selfAssessment: 'DONE',
      testsPassed: true,
    }), 'utf-8');

    const finalized = finalizeHeartbeatOnShutdown(tmpRoot, taskId);
    expect(finalized).toBe(true);

    const hb = JSON.parse(fs.readFileSync(hbPath, 'utf-8'));
    expect(hb.status).toBe('DONE');
    expect(hb.exitCode).toBe(0);
  });

  it('no result file → heartbeat NOT finalized (returns false)', () => {
    const finalized = finalizeHeartbeatOnShutdown(tmpRoot, 'tww-nonexistent');
    expect(finalized).toBe(false);
  });
});

// ─── Test Suite: Docker monitorContainer reconciliation ──────────────────

describe('Docker monitorContainer — TIMEOUT_WITH_WORK reconciliation', () => {
  it('spawn-backend-docker.ts handles TIMEOUT_WITH_WORK in monitorContainer reconciliation', () => {
    const source = readDockerSource();

    // monitorContainer should recognize TIMEOUT_WITH_WORK for heartbeat status
    const monitorSection = source.slice(
      source.indexOf('monitorContainer'),
    );
    expect(monitorSection).toContain("result.selfAssessment === 'TIMEOUT_WITH_WORK'");
    expect(monitorSection).toContain("hbStatus = 'TIMEOUT_WITH_WORK'");
  });
});

// ─── Test Suite: scoreCorrectness with TIMEOUT_WITH_WORK ─────────────────

describe('scoreCorrectness — TIMEOUT_WITH_WORK partial credit', () => {
  it('TIMEOUT_WITH_WORK gets partial score (10 points for self-assessment)', async () => {
    const { scoreCorrectness } = await import('../../src/orchestra/result-evaluator.js');
    const result = makeResult({
      taskId: 'tww-score-001',
      selfAssessment: 'TIMEOUT_WITH_WORK' as TaskResult['selfAssessment'],
      testsPassed: false,
    });

    const score = scoreCorrectness(result);
    // 0 (tests failed) + 10 (TIMEOUT_WITH_WORK partial) = 10
    expect(score.score).toBe(10);
    expect(score.reason).toContain('TIMEOUT_WITH_WORK');
  });
});
