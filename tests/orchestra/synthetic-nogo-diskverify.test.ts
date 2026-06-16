// ═══ Synthetic NO_GO Uniform Disk-Verify Gate (Sprint 231 Task 231-001) ══
// Pins the result-collector's .result-exists branch to the same disk-verify
// semantics already wired into the .timeout marker branch.
//
// Background — Docker EXIT trap (spawn-backend-docker.ts) writes a synthetic
// NO_GO `.result` when the worker exits without producing one ("exit-0-no-
// result"). Shape: selfAssessment="NO_GO" + filesChanged=[] + notes
// "Worker exited without writing result (exitCode=...)". Before this fix,
// collectResults skipped disk-verify on the `.result`-exists path, masking
// real on-disk work — non-uniform with the .timeout path. This suite locks
// the uniform behavior: when disk evidence exists, the gate reclassifies the
// task status to MANUAL_REVIEW_REQUIRED, enriches filesChanged/linesAdded,
// and emits BRAIN→AUDITOR:DISK_VS_CLAIM_MISMATCH.
//
// Hermetic: tmpdir-only fixtures, disk-verify module mocked (no spawnSync),
// no git in test setup. Mirrors tests/orchestra/result-collector.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

import type { Task, Sprint, TaskResult } from '../../src/core/types.js';
import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';

// ─── Module mocks (hermetic — no spawnSync, no real fs.watch) ─────────────

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

// Controllable disk-verify result — each test re-assigns the stub return.
// Setting this here lets `vi.mock` capture the factory closure cleanly.
const diskVerifyState: {
  result: { hasDiskEvidence: boolean; linesAdded: number; untrackedFiles: string[] };
} = {
  result: { hasDiskEvidence: false, linesAdded: 0, untrackedFiles: [] },
};

vi.mock('../../src/orchestra/disk-verify.js', () => ({
  verifyDiskAgainstClaim: vi.fn(() => diskVerifyState.result),
  DISK_VS_CLAIM_MISMATCH_CHANNEL: 'BRAIN→AUDITOR:DISK_VS_CLAIM_MISMATCH',
}));

import { waitForResults } from '../../src/orchestra/result-collector.js';

// ─── Test helpers ─────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join(tmpdir(), `synthetic-nogo-diskverify-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  mkdirSync(join(dir, '.deckent'), { recursive: true });
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
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/foo.ts'],
    },
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

/** Synthetic .result that the Docker EXIT trap writes for exit-0-no-result. */
function writeSyntheticExitNoResult(tmpDir: string, taskId: string, exitCode = 0): void {
  const synthetic: TaskResult & { exitCode?: number } = {
    taskId,
    workerId: `docker-${taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    exitCode,
    notes: `Worker exited without writing result (exitCode=${exitCode})`,
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      provider: 'claude',
      model: 'sonnet',
    },
  };
  writeFileSync(
    join(tmpDir, '.tasks', `task-${taskId}.result`),
    JSON.stringify(synthetic),
    'utf-8',
  );
}

function readEventStream(tmpDir: string, sprintId: string): Array<{ channel: string; payload: Record<string, unknown> }> {
  const eventsPath = join(tmpDir, '.deckent', 'recently-works', `${sprintId}-events.jsonl`);
  if (!existsSync(eventsPath)) return [];
  const raw = readFileSync(eventsPath, 'utf-8');
  return raw
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => JSON.parse(l) as { channel: string; payload: Record<string, unknown> });
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('collectResults — synthetic exit-0-no-result uniform disk-verify gate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    diskVerifyState.result = { hasDiskEvidence: false, linesAdded: 0, untrackedFiles: [] };
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
  });

  it('(1) synthetic NO_GO + disk evidence → MANUAL_REVIEW_REQUIRED + filesChanged/linesAdded enriched + DISK_VS_CLAIM_MISMATCH emit', async () => {
    const taskId = 'syn-001';
    const task = makeTask(taskId);
    const sprint = makeSprint([task]);

    writeSyntheticExitNoResult(tmpDir, taskId);
    diskVerifyState.result = {
      hasDiskEvidence: true,
      linesAdded: 73,
      untrackedFiles: ['src/orchestra/new-helper.ts', 'src/orchestra/extra.ts'],
    };

    const results = await waitForResults(tmpDir, sprint, 5000);

    expect(results).toHaveLength(1);
    const r = results[0]!;
    // selfAssessment stays NO_GO (mirrors timeout-path contract — only taskRef.status flips).
    expect(r.selfAssessment).toBe('NO_GO');
    // filesChanged/linesAdded enriched from disk-verify.
    expect(r.filesChanged).toEqual(['src/orchestra/new-helper.ts', 'src/orchestra/extra.ts']);
    expect(r.linesAdded).toBe(73);
    // Notes annotated with reclassification breadcrumb.
    expect(r.notes).toContain('disk-verify found evidence');
    expect(r.notes).toContain('MANUAL_REVIEW_REQUIRED');

    // Task status mutated to MANUAL_REVIEW_REQUIRED on the in-memory ref.
    expect(task.status).toBe(TaskStatus.MANUAL_REVIEW_REQUIRED);

    // Audit event emitted with the canonical channel + cause='exit-0-no-result'.
    const events = readEventStream(tmpDir, 'sprint-test');
    const match = events.find(e => e.channel === 'BRAIN→AUDITOR:DISK_VS_CLAIM_MISMATCH');
    expect(match).toBeDefined();
    expect(match!.payload.taskId).toBe(taskId);
    expect(match!.payload.cause).toBe('exit-0-no-result');
    expect(match!.payload.linesAdded).toBe(73);
    expect(match!.payload.untrackedFiles).toEqual(['src/orchestra/new-helper.ts', 'src/orchestra/extra.ts']);
  });

  it('(2) synthetic NO_GO + NO disk evidence → NO_GO stays, no reclassification, no audit emit', async () => {
    const taskId = 'syn-002';
    const task = makeTask(taskId);
    const sprint = makeSprint([task]);

    writeSyntheticExitNoResult(tmpDir, taskId);
    diskVerifyState.result = { hasDiskEvidence: false, linesAdded: 0, untrackedFiles: [] };

    const results = await waitForResults(tmpDir, sprint, 5000);

    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.selfAssessment).toBe('NO_GO');
    // filesChanged/linesAdded untouched (still empty as synthetic wrote them).
    expect(r.filesChanged).toEqual([]);
    expect(r.linesAdded).toBe(0);
    // Notes NOT annotated.
    expect(r.notes).not.toContain('disk-verify found evidence');
    expect(r.notes).not.toContain('MANUAL_REVIEW_REQUIRED');

    // Task status stays NO_GO (legacy behavior).
    expect(task.status).toBe(TaskStatus.NO_GO);

    // No audit event emitted.
    const events = readEventStream(tmpDir, 'sprint-test');
    const match = events.find(e => e.channel === 'BRAIN→AUDITOR:DISK_VS_CLAIM_MISMATCH');
    expect(match).toBeUndefined();
  });

  it('(3) normal DONE result (filesChanged populated) → disk-verify NOT invoked, untouched (regression guard)', async () => {
    const taskId = 'syn-003';
    const task = makeTask(taskId);
    const sprint = makeSprint([task]);

    const realResult: TaskResult = {
      taskId,
      workerId: `w-${taskId}`,
      filesChanged: ['src/orchestra/real.ts'],
      linesAdded: 10,
      linesRemoved: 2,
      testsPassed: true,
      coverage: 95,
      selfAssessment: 'DONE',
      notes: 'All good',
    };
    writeFileSync(
      join(tmpDir, '.tasks', `task-${taskId}.result`),
      JSON.stringify(realResult),
      'utf-8',
    );
    // Even if disk-verify would report evidence, it must NOT be invoked
    // on a normal DONE result (gate only fires on synthetic-exit-no-result shape).
    diskVerifyState.result = {
      hasDiskEvidence: true,
      linesAdded: 999,
      untrackedFiles: ['poison.ts'],
    };

    const results = await waitForResults(tmpDir, sprint, 5000);

    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.selfAssessment).toBe('DONE');
    expect(r.filesChanged).toEqual(['src/orchestra/real.ts']);
    expect(r.linesAdded).toBe(10);
    expect(r.notes).toBe('All good');
    // Task status follows applyStatusMutation: DONE → DONE.
    expect(task.status).toBe(TaskStatus.DONE);

    // No DISK_VS_CLAIM_MISMATCH event.
    const events = readEventStream(tmpDir, 'sprint-test');
    expect(events.find(e => e.channel === 'BRAIN→AUDITOR:DISK_VS_CLAIM_MISMATCH')).toBeUndefined();
  });

  it('(4) genuine NO_GO with non-synthetic notes (e.g. worker self-flag) → gate skips, NO_GO stays', async () => {
    const taskId = 'syn-004';
    const task = makeTask(taskId);
    const sprint = makeSprint([task]);

    // Worker wrote a real NO_GO with a custom note — not the synthetic shape.
    const genuineNoGo: TaskResult = {
      taskId,
      workerId: `w-${taskId}`,
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      notes: 'BOUNDARY_VIOLATION: worker self-flagged — out-of-scope write attempted',
    };
    writeFileSync(
      join(tmpDir, '.tasks', `task-${taskId}.result`),
      JSON.stringify(genuineNoGo),
      'utf-8',
    );
    // Even with disk evidence available, gate must NOT fire on non-synthetic notes.
    diskVerifyState.result = {
      hasDiskEvidence: true,
      linesAdded: 50,
      untrackedFiles: ['leaked.ts'],
    };

    const results = await waitForResults(tmpDir, sprint, 5000);

    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.selfAssessment).toBe('NO_GO');
    // Notes untouched — gate did not annotate.
    expect(r.notes).toBe('BOUNDARY_VIOLATION: worker self-flagged — out-of-scope write attempted');
    expect(r.filesChanged).toEqual([]);
    expect(task.status).toBe(TaskStatus.NO_GO);

    // No audit emit (gate filter rejected non-synthetic notes).
    const events = readEventStream(tmpDir, 'sprint-test');
    expect(events.find(e => e.channel === 'BRAIN→AUDITOR:DISK_VS_CLAIM_MISMATCH')).toBeUndefined();
  });

  it('(5) .timeout-path regression guard — empty disk + .timeout marker (no .result) → synthetic NO_GO with no reclassification', async () => {
    // The legacy timeout-path (lines 543-613 in result-collector.ts) must
    // continue to function exactly as before. This test exercises that branch
    // (no .result on disk, only a .timeout marker) and verifies the legacy
    // synthetic NO_GO + no MANUAL_REVIEW_REQUIRED when disk is empty.
    const taskId = 'syn-005';
    const task = makeTask(taskId);
    const sprint = makeSprint([task]);

    writeFileSync(join(tmpDir, '.tasks', `task-${taskId}.timeout`), 'WORKER_TIMEOUT', 'utf-8');
    diskVerifyState.result = { hasDiskEvidence: false, linesAdded: 0, untrackedFiles: [] };

    const results = await waitForResults(tmpDir, sprint, 5000);

    expect(results).toHaveLength(1);
    expect(results[0]!.selfAssessment).toBe('NO_GO');
    expect(results[0]!.notes).toContain('timeout');
    expect(task.status).toBe(TaskStatus.NO_GO);
    // No event when disk empty (gate would emit only if hasDiskEvidence=true).
    const events = readEventStream(tmpDir, 'sprint-test');
    expect(events.find(e => e.channel === 'BRAIN→AUDITOR:DISK_VS_CLAIM_MISMATCH')).toBeUndefined();
  });
});
