// ═══ agentic-worker-entry tests — hermetic .result completeness (T-234-002) ═══
//
// CLAUDE.md hermetic rules:
//   • tmpdir for all I/O; cleanup in afterEach.
//   • mock runner — no fetch, no network.
//   • no spawnSync / execSync — async spawn for git setup AND production code.
//
// Coverage matrix for T-234-002:
//   1. tokenUsage propagation: runner-emitted {inputTokens, outputTokens,
//      provider='ollama'} surfaces in .result.tokenUsage with cacheReadTokens=0
//      and `model` taken from argv (provider/model mapping for Brain ingestion).
//   2. git diff --numstat on a modified-tracked file → linesAdded/Removed
//      reflect real disk diff vs HEAD (requires a baseline commit).
//   3. git unavailable (non-git tmpdir) → linesAdded/Removed = 0 AND a
//      `[diff]` note is folded into .result.notes (honest, no silent debt).
//   4. .result shape conforms to api-surface.md — exactly the 10 fields the
//      worker writes (taskId, filesChanged, linesAdded, linesRemoved,
//      testsPassed, coverage, selfAssessment, notes, tokenUsage,
//      evaluationDecision) with correct primitive types.
//   5. New untracked file fallback: numstat skips a file unknown to HEAD;
//      computeNumstat falls back to disk line-count so linesAdded reflects
//      the new file's content. This exercises the god-level branch.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import {
  runWorkerEntry,
  computeNumstat,
  type EntryResultFile,
} from '../../src/agents/agentic-worker-entry.js';
import type {
  AgenticRunnerOptions,
  AgenticRunnerResult,
} from '../../src/agents/agentic-worker-runner.js';

// ─── Test helpers ───────────────────────────────────────────────────────────

interface GitRunOutcome {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run a git command from `cwd` via async spawn (spawnSync FORBIDDEN). */
function gitRun(cwd: string, args: string[]): Promise<GitRunOutcome> {
  return new Promise(resolve => {
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    };
    let child;
    try {
      child = spawn('git', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      resolve({ code: -1, stdout: '', stderr: `spawn-error: ${msg}` });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer | string) => { stdout += String(d); });
    child.stderr?.on('data', (d: Buffer | string) => { stderr += String(d); });
    child.on('error', (err: Error) => {
      resolve({ code: -1, stdout, stderr: `spawn-error: ${err.message}` });
    });
    child.on('close', (code: number | null) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

/** Initialize a git repo with a baseline file committed at HEAD. */
async function initRepoWithBaseline(
  projectDir: string,
  baselineFile: string,
  baselineContent: string,
): Promise<void> {
  const init = await gitRun(projectDir, ['init', '--quiet']);
  expect(init.code).toBe(0);
  // Detach from any user-level core.hooksPath that could block commit.
  await gitRun(projectDir, ['config', '--local', 'core.hooksPath', '/dev/null']);
  writeFileSync(join(projectDir, baselineFile), baselineContent, 'utf-8');
  const add = await gitRun(projectDir, ['add', baselineFile]);
  expect(add.code).toBe(0);
  const commit = await gitRun(projectDir, [
    'commit',
    '--quiet',
    '--no-gpg-sign',
    '-m',
    'baseline',
  ]);
  expect(commit.code).toBe(0);
}

/** Write a valid task.json under .tasks/ for runWorkerEntry to consume. */
function seedTaskJson(
  projectDir: string,
  taskId: string,
  overrides: Record<string, unknown> = {},
): void {
  mkdirSync(join(projectDir, '.tasks'), { recursive: true });
  const task = {
    id: taskId,
    description: 'desc',
    scope: { directories: ['src/'], filesRead: [], filesWrite: ['out.ts'] },
    goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
    ...overrides,
  };
  writeFileSync(
    join(projectDir, '.tasks', `task-${taskId}.json`),
    JSON.stringify(task),
    'utf-8',
  );
}

/** Build a mock runner that emits a scripted AgenticRunnerResult. */
function mockRunner(
  result: AgenticRunnerResult,
): (opts: AgenticRunnerOptions) => Promise<AgenticRunnerResult> {
  return async (_opts: AgenticRunnerOptions) => result;
}

// ─── Suite setup ────────────────────────────────────────────────────────────

describe('runWorkerEntry / computeNumstat — T-234-002 .result completeness', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'agentic-entry-'));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  // ── Test 1: tokenUsage propagation runner → .result with model from argv ──
  it('propagates runner tokenUsage (eval_count/prompt_eval_count) into .result.tokenUsage with cacheReadTokens=0 and model from argv', async () => {
    const taskId = '234-002-t1';
    seedTaskJson(projectDir, taskId);
    const runResult: AgenticRunnerResult = {
      taskId,
      filesChanged: [],
      testsPassed: undefined,
      selfAssessment: 'DONE',
      notes: 'ok',
      iterations: 2,
      terminationReason: 'task_done',
      tokenUsage: { inputTokens: 1500, outputTokens: 320, provider: 'ollama', cost: 0 },
    };
    const { result } = await runWorkerEntry(
      [taskId, 'qwen3.6:27b', 'http://localhost:11434'],
      projectDir,
      { runner: mockRunner(runResult) },
    );
    expect(result.tokenUsage).toEqual({
      inputTokens: 1500,
      outputTokens: 320,
      cacheReadTokens: 0,
      provider: 'ollama',
      model: 'qwen3.6:27b',
    });
  });

  // ── Test 2: git diff --numstat on a modified-tracked file ──
  it('computes linesAdded/Removed from `git diff --numstat HEAD` against a baseline commit', async () => {
    const taskId = '234-002-t2';
    seedTaskJson(projectDir, taskId);
    // Baseline: 3 lines committed.
    await initRepoWithBaseline(projectDir, 'tracked.ts', 'a\nb\nc\n');
    // Worker modifies tracked file: keep "a", remove "b", add "B" and "d" → +2 / -1.
    writeFileSync(join(projectDir, 'tracked.ts'), 'a\nB\nc\nd\n', 'utf-8');

    const runResult: AgenticRunnerResult = {
      taskId,
      filesChanged: ['tracked.ts'],
      testsPassed: true,
      selfAssessment: 'DONE',
      notes: 'modified tracked',
      iterations: 1,
      terminationReason: 'task_done',
      tokenUsage: { inputTokens: 10, outputTokens: 20, provider: 'ollama', cost: 0 },
    };
    const { result } = await runWorkerEntry(
      [taskId, 'qwen3.6:27b', 'http://localhost:11434'],
      projectDir,
      { runner: mockRunner(runResult) },
    );

    expect(result.filesChanged).toEqual(['tracked.ts']);
    expect(result.linesAdded).toBe(2);
    expect(result.linesRemoved).toBe(1);
    expect(result.notes).toBe('modified tracked');
    expect(result.notes).not.toContain('[diff]');
  });

  // ── Test 3: git unavailable (non-git tmpdir) → 0/0 + honest [diff] note ──
  it('non-git tmpdir → linesAdded/Removed default to 0 with an honest [diff] note in result.notes', async () => {
    const taskId = '234-002-t3';
    seedTaskJson(projectDir, taskId);
    // Worker "wrote" a file but tmpdir is not a git repo.
    writeFileSync(join(projectDir, 'out.ts'), 'line1\nline2\n', 'utf-8');
    const runResult: AgenticRunnerResult = {
      taskId,
      filesChanged: ['out.ts'],
      testsPassed: true,
      selfAssessment: 'DONE',
      notes: 'wrote out.ts',
      iterations: 1,
      terminationReason: 'task_done',
      tokenUsage: { inputTokens: 5, outputTokens: 10, provider: 'ollama', cost: 0 },
    };
    const { result } = await runWorkerEntry(
      [taskId, 'qwen3.6:27b', 'http://localhost:11434'],
      projectDir,
      { runner: mockRunner(runResult) },
    );
    expect(result.linesAdded).toBe(0);
    expect(result.linesRemoved).toBe(0);
    expect(result.notes).toContain('[diff]');
    // Honest reason surfaces — must NOT be a silent debt-leaving sentinel.
    expect(result.notes.toLowerCase()).toMatch(/git|repo|head/);
  });

  // ── Test 4: .result shape contract (api-surface.md) ──
  it('.result has the exact 10 worker-written fields in api-surface.md shape with correct primitive types', async () => {
    const taskId = '234-002-t4';
    seedTaskJson(projectDir, taskId);
    const runResult: AgenticRunnerResult = {
      taskId,
      filesChanged: ['out.ts'],
      testsPassed: false,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      notes: 'partial',
      iterations: 3,
      terminationReason: 'max_iterations',
      tokenUsage: { inputTokens: 99, outputTokens: 77, provider: 'ollama', cost: 0 },
    };
    const { resultPath, result } = await runWorkerEntry(
      [taskId, 'qwen3.6:27b', 'http://localhost:11434'],
      projectDir,
      { runner: mockRunner(runResult) },
    );

    // Disk and return value agree.
    const onDisk = JSON.parse(readFileSync(resultPath, 'utf-8')) as EntryResultFile;
    expect(onDisk).toEqual(result);

    // Exact field set the worker writes (api-surface.md worker-side subset).
    expect(Object.keys(onDisk).sort()).toEqual(
      [
        'taskId',
        'filesChanged',
        'linesAdded',
        'linesRemoved',
        'testsPassed',
        'coverage',
        'selfAssessment',
        'notes',
        'tokenUsage',
        'evaluationDecision',
      ].sort(),
    );
    // Primitive type contract.
    expect(typeof onDisk.taskId).toBe('string');
    expect(Array.isArray(onDisk.filesChanged)).toBe(true);
    expect(typeof onDisk.linesAdded).toBe('number');
    expect(typeof onDisk.linesRemoved).toBe('number');
    // testsPassed/coverage are nullable (İŞ2): the runner returned a measured
    // `false` here, so it is preserved as a boolean; coverage is never instrumented
    // by the agentic loop → honest null. Contract: boolean|null and number|null.
    expect(onDisk.testsPassed === null || typeof onDisk.testsPassed === 'boolean').toBe(true);
    expect(onDisk.testsPassed).toBe(false); // measured false from runner, not coerced
    expect(onDisk.coverage === null || typeof onDisk.coverage === 'number').toBe(true);
    expect(onDisk.coverage).toBeNull(); // agentic worker has no coverage instrumentation
    expect(['DONE', 'GO_WITH_TECH_DEBT', 'NO_GO']).toContain(onDisk.selfAssessment);
    expect(typeof onDisk.notes).toBe('string');
    expect(onDisk.evaluationDecision).toBe(onDisk.selfAssessment);
    // tokenUsage sub-shape.
    expect(Object.keys(onDisk.tokenUsage).sort()).toEqual(
      ['inputTokens', 'outputTokens', 'cacheReadTokens', 'provider', 'model'].sort(),
    );
    expect(typeof onDisk.tokenUsage.inputTokens).toBe('number');
    expect(typeof onDisk.tokenUsage.outputTokens).toBe('number');
    expect(onDisk.tokenUsage.cacheReadTokens).toBe(0);
    expect(onDisk.tokenUsage.provider).toBe('ollama');
    expect(onDisk.tokenUsage.model).toBe('qwen3.6:27b');
  });

  // ── Test 5: new untracked file → disk line-count fallback ──
  it('new untracked file (not in HEAD) falls back to disk line-count for linesAdded', async () => {
    const taskId = '234-002-t5';
    seedTaskJson(projectDir, taskId);
    // Baseline repo with an unrelated tracked file.
    await initRepoWithBaseline(projectDir, 'README.md', '# baseline\n');
    // Worker writes a brand-new file numstat won't see (no HEAD entry yet).
    writeFileSync(
      join(projectDir, 'fresh.ts'),
      'line1\nline2\nline3\nline4\n',
      'utf-8',
    );

    // Direct helper exercise: 4 lines added, 0 removed.
    const direct = await computeNumstat(projectDir, ['fresh.ts']);
    expect(direct.linesAdded).toBe(4);
    expect(direct.linesRemoved).toBe(0);
    expect(direct.diffNote).toBeUndefined();

    // Full-path through runWorkerEntry confirms .result reflects the fallback.
    const runResult: AgenticRunnerResult = {
      taskId,
      filesChanged: ['fresh.ts'],
      testsPassed: true,
      selfAssessment: 'DONE',
      notes: 'wrote fresh',
      iterations: 1,
      terminationReason: 'task_done',
      tokenUsage: { inputTokens: 2, outputTokens: 3, provider: 'ollama', cost: 0 },
    };
    const { result } = await runWorkerEntry(
      [taskId, 'qwen3.6:27b', 'http://localhost:11434'],
      projectDir,
      { runner: mockRunner(runResult) },
    );
    expect(result.linesAdded).toBe(4);
    expect(result.linesRemoved).toBe(0);
    expect(result.notes).toBe('wrote fresh');
  });

  // ── Test 6 (İŞ2): no test ran → honest null testsPassed + null coverage ──
  // The runner leaves testsPassed undefined when no test command was sniffed
  // (e.g. a doc task). The worker must emit `null` ("not measured"), NOT a
  // fabricated `false`/`0` — so Brain's coverageOptional relaxation +
  // isCoverageStructurallyAbsent reweight treat ollama like a claude worker.
  it('emits testsPassed:null + coverage:null when the runner ran no tests (honest absence, not fabricated 0/false)', async () => {
    const taskId = '238-is2-t6';
    seedTaskJson(projectDir, taskId);
    const runResult: AgenticRunnerResult = {
      taskId,
      filesChanged: ['docs/guide/x.md'],
      testsPassed: undefined, // no test command ran
      selfAssessment: 'DONE',
      notes: 'doc written',
      iterations: 1,
      terminationReason: 'task_done',
      tokenUsage: { inputTokens: 10, outputTokens: 5, provider: 'ollama', cost: 0 },
    };
    const { result } = await runWorkerEntry(
      [taskId, 'qwen3.6:27b', 'http://localhost:11434'],
      projectDir,
      { runner: mockRunner(runResult) },
    );
    expect(result.testsPassed).toBeNull();
    expect(result.coverage).toBeNull();
  });

  // ── Test 7 (İŞ2): a sniffed testsPassed is preserved (not nulled) ──
  // When the runner DID observe a test run, that measured boolean is honest
  // signal and must survive to .result; only coverage stays null (uninstrumented).
  it('preserves a measured testsPassed:true from the runner while coverage stays null', async () => {
    const taskId = '238-is2-t7';
    seedTaskJson(projectDir, taskId);
    const runResult: AgenticRunnerResult = {
      taskId,
      filesChanged: ['src/x.ts', 'tests/x.test.ts'],
      testsPassed: true, // runner sniffed a passing test command
      selfAssessment: 'DONE',
      notes: 'code + test',
      iterations: 2,
      terminationReason: 'task_done',
      tokenUsage: { inputTokens: 10, outputTokens: 5, provider: 'ollama', cost: 0 },
    };
    const { result } = await runWorkerEntry(
      [taskId, 'qwen3.6:27b', 'http://localhost:11434'],
      projectDir,
      { runner: mockRunner(runResult) },
    );
    expect(result.testsPassed).toBe(true);
    expect(result.coverage).toBeNull();
  });
});
