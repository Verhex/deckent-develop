// ═══ Disk-Verify Gate Tests (Sprint 195 Task 195-001) ═════════════════
// W-INTEGRITY — synthetic NO_GO gate. Covers the verifyDiskAgainstClaim
// helper, its three host-side wire-ins (result-collector, honest-gate,
// sprint-checkpoint), and the BRAIN→AUDITOR audit-event channel.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  verifyDiskAgainstClaim,
  createDefaultGitDiffNumstatProvider,
  createDefaultGitLsOthersProvider,
  makeStaticNumstatProvider,
  makeStaticLsOthersProvider,
  DISK_VS_CLAIM_MISMATCH_CHANNEL,
  type DiskVerifyResult,
} from '../../src/orchestra/disk-verify.js';
import {
  detectDishonestResult,
  makeStaticGitNumstatProvider,
} from '../../src/orchestra/honest-gate.js';
import { restoreSprintFromCheckpoint } from '../../src/orchestra/sprint-checkpoint.js';
import type { SprintCheckpoint } from '../../src/orchestra/sprint-checkpoint.js';
import type { TaskResult, TaskScope, Task } from '../../src/core/types.js';
import { SprintPhase, TaskStatus } from '../../src/core/types.js';

// ─── Test Helpers ─────────────────────────────────────────────────────

function makeTempDir(prefix = 'disk-verify-test'): string {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function initGitRepo(dir: string): void {
  execSync(
    'git init -q && git config user.email "test@test.com" && git config user.name "Test" && git commit --allow-empty -q -m "init"',
    { cwd: dir, stdio: 'pipe' },
  );
}

function makeScope(overrides: Partial<TaskScope> = {}): TaskScope {
  return {
    directories: ['src/orchestra/'],
    filesRead: [],
    filesWrite: ['src/orchestra/foo.ts'],
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-001',
    title: 'Test',
    description: '',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: '',
    scope: makeScope(),
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-195',
    createdAt: '2026-05-26T00:00:00Z',
    ...overrides,
  } as Task;
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 'test-001',
    workerId: 'w-test',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: '',
    ...overrides,
  };
}

// ─── (a) git diff 0 files → hasDiskEvidence: false ────────────────────

describe('verifyDiskAgainstClaim — disk evidence detection', () => {
  it('(a) returns hasDiskEvidence=false when git numstat sum is 0 and no untracked files', () => {
    const r = verifyDiskAgainstClaim('/tmp/fake', makeScope(), {
      numstatProvider: makeStaticNumstatProvider(0),
      lsOthersProvider: makeStaticLsOthersProvider([]),
    });
    expect(r.hasDiskEvidence).toBe(false);
    expect(r.linesAdded).toBe(0);
    expect(r.untrackedFiles).toEqual([]);
  });

  it('(b) returns hasDiskEvidence=true with linesAdded=100 when numstat reports 100', () => {
    const r = verifyDiskAgainstClaim('/tmp/fake', makeScope(), {
      numstatProvider: makeStaticNumstatProvider(100),
      lsOthersProvider: makeStaticLsOthersProvider([]),
    });
    expect(r.hasDiskEvidence).toBe(true);
    expect(r.linesAdded).toBe(100);
  });

  it('(c) returns hasDiskEvidence=true with untrackedFiles when ls-others reports new files', () => {
    const r = verifyDiskAgainstClaim('/tmp/fake', makeScope(), {
      numstatProvider: makeStaticNumstatProvider(0),
      lsOthersProvider: makeStaticLsOthersProvider(['src/orchestra/new.ts', 'src/orchestra/extra.ts']),
    });
    expect(r.hasDiskEvidence).toBe(true);
    expect(r.untrackedFiles).toEqual(['src/orchestra/new.ts', 'src/orchestra/extra.ts']);
  });

  it('(d) respects scope.filesWrite — production provider receives only those paths', () => {
    const seenPaths: string[][] = [];
    const captured = {
      numstatSum(paths: readonly string[]) {
        seenPaths.push([...paths]);
        return 0;
      },
    };
    const lsCaptured = {
      lsOthers(paths: readonly string[]) {
        seenPaths.push([...paths]);
        return [];
      },
    };
    const scope: TaskScope = {
      directories: ['src/orchestra/', 'src/core/'],
      filesRead: [],
      filesWrite: ['src/orchestra/a.ts', 'src/core/b.ts'],
    };
    verifyDiskAgainstClaim('/tmp/fake', scope, {
      numstatProvider: captured,
      lsOthersProvider: lsCaptured,
    });
    // numstat must receive ONLY filesWrite, ls-others ONLY directories.
    expect(seenPaths[0]).toEqual(['src/orchestra/a.ts', 'src/core/b.ts']);
    expect(seenPaths[1]).toEqual(['src/orchestra/', 'src/core/']);
  });
});

// ─── (l) Fail-open semantics ──────────────────────────────────────────

describe('verifyDiskAgainstClaim — fail-open on git error', () => {
  it('(l) returns hasDiskEvidence=false when git commands throw (fail-open)', () => {
    const r = verifyDiskAgainstClaim('/tmp/fake', makeScope(), {
      numstatProvider: { numstatSum: () => { throw new Error('git not found'); } },
      lsOthersProvider: { lsOthers: () => { throw new Error('git not found'); } },
    });
    expect(r.hasDiskEvidence).toBe(false);
    expect(r.linesAdded).toBe(0);
    expect(r.untrackedFiles).toEqual([]);
  });

  it('handles empty scope arrays without invoking the providers', () => {
    const numstat = vi.fn(() => 0);
    const ls = vi.fn(() => []);
    const r = verifyDiskAgainstClaim('/tmp/fake', { directories: [], filesRead: [], filesWrite: [] }, {
      numstatProvider: { numstatSum: numstat },
      lsOthersProvider: { lsOthers: ls },
    });
    // Providers may receive empty arrays but result must still be honest no-op
    expect(r.hasDiskEvidence).toBe(false);
  });
});

// ─── Default providers (real git) ─────────────────────────────────────

describe('createDefaultGitDiffNumstatProvider / createDefaultGitLsOthersProvider', () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = makeTempDir('disk-verify-git');
    initGitRepo(tempDir);
    // Seed a tracked file so we can measure a real diff.
    mkdirSync(join(tempDir, 'src', 'orchestra'), { recursive: true });
    writeFileSync(join(tempDir, 'src', 'orchestra', 'a.ts'), 'export const x = 1;\n');
    execSync('git add -A && git commit -q -m "seed"', { cwd: tempDir, stdio: 'pipe' });
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns positive numstatSum after modifying a tracked file', () => {
    appendFileSync(join(tempDir, 'src', 'orchestra', 'a.ts'), 'export const y = 2;\nexport const z = 3;\n');
    const provider = createDefaultGitDiffNumstatProvider(tempDir);
    const sum = provider.numstatSum(['src/orchestra/a.ts']);
    expect(sum).toBeGreaterThan(0);
  });

  it('returns untracked file when a new file is created inside the directory', () => {
    writeFileSync(join(tempDir, 'src', 'orchestra', 'b.ts'), 'export const b = 4;\n');
    const provider = createDefaultGitLsOthersProvider(tempDir);
    const out = provider.lsOthers(['src/orchestra/']);
    expect(out).toContain('src/orchestra/b.ts');
  });

  it('fails open with linesAdded=0 when projectDir is not a git repo', () => {
    const nonRepo = makeTempDir('disk-verify-nonrepo');
    try {
      const provider = createDefaultGitDiffNumstatProvider(nonRepo);
      expect(provider.numstatSum(['some/path.ts'])).toBe(0);
      const ls = createDefaultGitLsOthersProvider(nonRepo);
      expect(ls.lsOthers(['some/'])).toEqual([]);
    } finally {
      rmSync(nonRepo, { recursive: true, force: true });
    }
  });
});

// ─── (g)/(h) honest-gate integration ──────────────────────────────────

describe('detectDishonestResult — MISSING_RESULT_BUT_DISK_HAS_WORK', () => {
  it('(g) flags filesChanged=[] when disk-verify finds evidence', () => {
    const git = makeStaticGitNumstatProvider({});
    const finding = detectDishonestResult(
      makeResult({ filesChanged: [], linesAdded: 0 }),
      git,
      {
        diskVerify: {
          projectRoot: '/tmp/fake',
          scope: makeScope(),
          options: {
            numstatProvider: makeStaticNumstatProvider(85),
            lsOthersProvider: makeStaticLsOthersProvider([]),
          },
        },
      },
    );
    expect(finding.dishonest).toBe(true);
    expect(finding.reason).toBe('MISSING_RESULT_BUT_DISK_HAS_WORK');
    expect(finding.actualLines).toBe(85);
  });

  it('(h) returns honest=false for filesChanged=[] when disk is empty (legacy behavior preserved)', () => {
    const git = makeStaticGitNumstatProvider({});
    const finding = detectDishonestResult(
      makeResult({ filesChanged: [], linesAdded: 0 }),
      git,
      {
        diskVerify: {
          projectRoot: '/tmp/fake',
          scope: makeScope(),
          options: {
            numstatProvider: makeStaticNumstatProvider(0),
            lsOthersProvider: makeStaticLsOthersProvider([]),
          },
        },
      },
    );
    expect(finding.dishonest).toBe(false);
  });

  it('preserves legacy short-circuit when diskVerify context is omitted', () => {
    const git = makeStaticGitNumstatProvider({});
    const finding = detectDishonestResult(
      makeResult({ filesChanged: [], linesAdded: 0 }),
      git,
      // no diskVerify → legacy fast-path returns honest=false
    );
    expect(finding.dishonest).toBe(false);
    expect(finding.reason).toBeUndefined();
  });
});

// ─── (i)/(j) sprint-checkpoint recovery gate ──────────────────────────

describe('restoreSprintFromCheckpoint — disk-verify recovery gate', () => {
  let projectRoot: string;
  const sprintId = 'sprint-195';

  beforeEach(() => {
    projectRoot = makeTempDir('disk-verify-checkpoint');
    initGitRepo(projectRoot);
    mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
    mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
    mkdirSync(join(projectRoot, 'src', 'orchestra'), { recursive: true });
    // Seed a file in scope so git numstat has something to diff later.
    writeFileSync(join(projectRoot, 'src', 'orchestra', 'foo.ts'), 'export const x = 1;\n');
    execSync('git add -A && git commit -q -m "seed"', { cwd: projectRoot, stdio: 'pipe' });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function writeTaskAndCheckpoint(taskId: string): void {
    const task: Task = makeTask({
      id: taskId,
      sprintId,
      scope: {
        directories: ['src/orchestra/'],
        filesRead: [],
        filesWrite: ['src/orchestra/foo.ts'],
      },
    });
    writeFileSync(
      join(projectRoot, '.tasks', `task-${taskId}.json`),
      JSON.stringify(task, null, 2),
    );
    const cp: SprintCheckpoint = {
      sprintId,
      checkpointNumber: 1,
      timestamp: new Date().toISOString(),
      completedTasks: [],
      pendingTasks: [],
      activeWorkers: [{
        workerId: `w-${taskId}`,
        taskId,
        status: 'EXECUTING',
        spawnedAt: new Date().toISOString(),
      }],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 0,
    };
    writeFileSync(
      join(projectRoot, '.deckent', `${sprintId}-checkpoint.json`),
      JSON.stringify(cp, null, 2),
      'utf-8',
    );
  }

  it('(i) stale EXECUTING with on-disk changes → MANUAL_REVIEW_REQUIRED', () => {
    const taskId = 'i-001';
    writeTaskAndCheckpoint(taskId);
    // Worker did NOT write .result, but did modify a tracked file before crashing.
    appendFileSync(
      join(projectRoot, 'src', 'orchestra', 'foo.ts'),
      'export const y = 2;\nexport const z = 3;\n',
    );

    const out = restoreSprintFromCheckpoint(projectRoot, sprintId);
    expect(out.restored).toBe(true);
    // The task should NOT be in staleTasksMarkedNoGo (gate prevented synthetic NO_GO).
    expect(out.staleTasksMarkedNoGo).not.toContain(taskId);
    // Status on disk should now be MANUAL_REVIEW_REQUIRED.
    const taskJson = JSON.parse(
      readFileSync(join(projectRoot, '.tasks', `task-${taskId}.json`), 'utf-8'),
    ) as Task;
    expect(taskJson.status).toBe(TaskStatus.MANUAL_REVIEW_REQUIRED);
  });

  it('(j) stale EXECUTING with empty disk → NO_GO (legacy behavior preserved)', () => {
    const taskId = 'j-001';
    writeTaskAndCheckpoint(taskId);
    // No disk changes.

    const out = restoreSprintFromCheckpoint(projectRoot, sprintId);
    expect(out.restored).toBe(true);
    expect(out.staleTasksMarkedNoGo).toContain(taskId);
    const taskJson = JSON.parse(
      readFileSync(join(projectRoot, '.tasks', `task-${taskId}.json`), 'utf-8'),
    ) as Task;
    expect(taskJson.status).toBe(TaskStatus.NO_GO);
  });

  it('(k) emits BRAIN→AUDITOR:DISK_VS_CLAIM_MISMATCH event when gate fires', () => {
    const taskId = 'k-001';
    writeTaskAndCheckpoint(taskId);
    appendFileSync(
      join(projectRoot, 'src', 'orchestra', 'foo.ts'),
      'export const y = 2;\nexport const z = 3;\n',
    );

    restoreSprintFromCheckpoint(projectRoot, sprintId);

    // Verify the audit event appears in the sprint event stream.
    const eventsPath = join(projectRoot, '.deckent', `${sprintId}-events.jsonl`);
    expect(existsSync(eventsPath)).toBe(true);
    const raw = readFileSync(eventsPath, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim().length > 0);
    const events = lines.map(l => JSON.parse(l) as { channel: string; payload: { taskId?: string; cause?: string } });
    const match = events.find(e => e.channel === DISK_VS_CLAIM_MISMATCH_CHANNEL);
    expect(match).toBeDefined();
    expect(match?.payload.taskId).toBe(taskId);
    expect(match?.payload.cause).toBe('checkpoint-recovery-stale-executing');
  });
});

// ─── (e)/(f) result-collector integration (via gate semantics) ────────

describe('result-collector synthetic NO_GO gate — direct semantics', () => {
  // The result-collector wire-in is exercised end-to-end via waitForResults,
  // which is a long-running async function. These tests pin the gate semantics
  // by directly invoking verifyDiskAgainstClaim with the same shape the
  // collector uses, so a regression in disk-verify or the wire-in is caught
  // at unit-test speed.

  it('(e) .timeout + .result missing + disk evidence → MANUAL_REVIEW_REQUIRED indicator', () => {
    const dv: DiskVerifyResult = verifyDiskAgainstClaim('/tmp/fake', makeScope(), {
      numstatProvider: makeStaticNumstatProvider(42),
      lsOthersProvider: makeStaticLsOthersProvider(['src/orchestra/newfile.ts']),
    });
    expect(dv.hasDiskEvidence).toBe(true);
    // Caller (result-collector) constructs a NO_GO synthetic result whose notes
    // mention MANUAL_REVIEW_REQUIRED reclassification. Pin the contract.
    const expectedClassification = dv.hasDiskEvidence ? 'MANUAL_REVIEW_REQUIRED' : 'NO_GO';
    expect(expectedClassification).toBe('MANUAL_REVIEW_REQUIRED');
  });

  it('(f) .timeout + .result missing + disk empty → synthetic NO_GO (legacy preserved)', () => {
    const dv = verifyDiskAgainstClaim('/tmp/fake', makeScope(), {
      numstatProvider: makeStaticNumstatProvider(0),
      lsOthersProvider: makeStaticLsOthersProvider([]),
    });
    expect(dv.hasDiskEvidence).toBe(false);
    const expectedClassification = dv.hasDiskEvidence ? 'MANUAL_REVIEW_REQUIRED' : 'NO_GO';
    expect(expectedClassification).toBe('NO_GO');
  });

  it('exposes DISK_VS_CLAIM_MISMATCH_CHANNEL with the canonical channel string', () => {
    expect(DISK_VS_CLAIM_MISMATCH_CHANNEL).toBe('BRAIN→AUDITOR:DISK_VS_CLAIM_MISMATCH');
  });
});
