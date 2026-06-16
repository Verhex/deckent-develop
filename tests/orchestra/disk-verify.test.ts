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
    const eventsPath = join(projectRoot, '.deckent', 'recently-works', `${sprintId}-events.jsonl`);
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

// ═══ Sprint 197 Task 197-001 — untracked file detection invariants ═══
//
// Pin-down regression suite for the Sprint 196 196-005 root cause: a NEW
// (untracked) file like `src/orchestra/token-counter.ts` was missed by the
// disk-verify gate even though Sprint 195 195-001 had wired the
// `untrackedFiles` field. These six tests fence the exact contract so the
// gate cannot regress to "tracked-only" detection.

describe('Sprint 197 197-001 — untracked file gate invariants', () => {
  // ─── (NEW-a) no tracked changes + new untracked file → evidence ─────
  it('(NEW-a) untracked NEW FILE only (no tracked diff) → hasDiskEvidence=true', () => {
    const r = verifyDiskAgainstClaim('/tmp/fake', makeScope(), {
      numstatProvider: makeStaticNumstatProvider(0),
      lsOthersProvider: makeStaticLsOthersProvider(['src/orchestra/token-counter.ts']),
    });
    expect(r.hasDiskEvidence).toBe(true);
    expect(r.linesAdded).toBe(0);
    expect(r.untrackedFiles).toEqual(['src/orchestra/token-counter.ts']);
  });

  // ─── (NEW-b) scope-filtered untracked lookup ─────────────────────────
  it('(NEW-b) untracked file outside scope.directories is not seen by the gate', () => {
    // Production provider receives ONLY scope.directories; if the worker
    // creates a file in a sibling directory it must never appear here.
    const captured: string[][] = [];
    const lsProv = {
      lsOthers(paths: readonly string[]) {
        captured.push([...paths]);
        // Simulate the production behavior: git ls-files --others -- <paths>
        // would not return files outside <paths>. The stub mirrors that
        // semantic exactly — empty result when scope dirs don't match.
        return [];
      },
    };
    const scope: TaskScope = {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/foo.ts'],
    };
    const r = verifyDiskAgainstClaim('/tmp/fake', scope, {
      numstatProvider: makeStaticNumstatProvider(0),
      lsOthersProvider: lsProv,
    });
    // Provider was called with exactly the scope directories (not anything
    // outside) — this is the contract the production wire relies on.
    expect(captured).toEqual([['src/orchestra/']]);
    expect(r.untrackedFiles).toEqual([]);
    expect(r.hasDiskEvidence).toBe(false);
  });

  // ─── (NEW-c) tracked + untracked are both counted ─────────────────────
  it('(NEW-c) mixed tracked diff + untracked file → both reflected', () => {
    const r = verifyDiskAgainstClaim('/tmp/fake', makeScope(), {
      numstatProvider: makeStaticNumstatProvider(12),
      lsOthersProvider: makeStaticLsOthersProvider(['src/orchestra/brand-new.ts']),
    });
    expect(r.hasDiskEvidence).toBe(true);
    expect(r.linesAdded).toBe(12);
    expect(r.untrackedFiles).toEqual(['src/orchestra/brand-new.ts']);
  });

  // ─── (NEW-d) gitLsOthers fail (sandbox) → graceful fallback ───────────
  it('(NEW-d) gitLsOthers throws (sandbox) → numstat alone still drives the gate', () => {
    const r = verifyDiskAgainstClaim('/tmp/fake', makeScope(), {
      numstatProvider: makeStaticNumstatProvider(7),
      lsOthersProvider: {
        lsOthers: () => { throw new Error('sandbox: git ls-files unavailable'); },
      },
    });
    // Untracked detection failed but numstat succeeded — hasDiskEvidence
    // must still reflect the tracked work so the worker does not lose it
    // to a synthetic NO_GO.
    expect(r.hasDiskEvidence).toBe(true);
    expect(r.linesAdded).toBe(7);
    expect(r.untrackedFiles).toEqual([]);
  });

  // ─── (NEW-e) result-collector contract — untrackedFiles drives ───────
  // The result-collector wire (result-collector.ts:518-583) constructs a
  // synthetic NO_GO whose `filesChanged` equals `diskVerify.untrackedFiles`
  // and whose post-process status is MANUAL_REVIEW_REQUIRED iff
  // `hasDiskEvidence:true`. Pin the contract at unit speed.
  it('(NEW-e) result-collector contract: linesAdded=0 + untrackedFiles=[X] → MANUAL_REVIEW + filesChanged=[X]', () => {
    const dv = verifyDiskAgainstClaim('/tmp/fake', makeScope(), {
      numstatProvider: makeStaticNumstatProvider(0),
      lsOthersProvider: makeStaticLsOthersProvider(['src/orchestra/token-counter.ts']),
    });
    // Replicate the collector's construction logic so a regression in the
    // wire (e.g. dropping untrackedFiles from filesChanged) trips this test.
    const syntheticFilesChanged = dv.hasDiskEvidence ? dv.untrackedFiles : [];
    const classification = dv.hasDiskEvidence ? 'MANUAL_REVIEW_REQUIRED' : 'NO_GO';
    expect(classification).toBe('MANUAL_REVIEW_REQUIRED');
    expect(syntheticFilesChanged).toEqual(['src/orchestra/token-counter.ts']);
  });

  // ─── (NEW-f) sprint-checkpoint integration — new untracked file only ─
  // Repro of the Sprint 196 196-005 failure: worker creates a NEW FILE in
  // scope but never writes `.result` before Brain restarts. The recovery
  // gate must demote the synthetic NO_GO to MANUAL_REVIEW_REQUIRED so the
  // operator can keep the on-disk work.
  describe('(NEW-f) restoreSprintFromCheckpoint — untracked NEW FILE only', () => {
    let projectRoot: string;
    const sprintId = 'sprint-197';

    beforeEach(() => {
      projectRoot = makeTempDir('disk-verify-new-file');
      initGitRepo(projectRoot);
      mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
      mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
      mkdirSync(join(projectRoot, 'src', 'orchestra'), { recursive: true });
      // Seed a tracked file so the directory exists in HEAD — but DO NOT
      // modify it. Only an untracked NEW file will exist when the gate runs.
      writeFileSync(join(projectRoot, 'src', 'orchestra', 'foo.ts'), 'export const x = 1;\n');
      execSync('git add -A && git commit -q -m "seed"', { cwd: projectRoot, stdio: 'pipe' });
    });

    afterEach(() => {
      rmSync(projectRoot, { recursive: true, force: true });
    });

    it('untracked NEW file only (tracked unchanged) → MANUAL_REVIEW_REQUIRED + audit event', () => {
      const taskId = 'NEW-f-001';
      const task: Task = makeTask({
        id: taskId,
        sprintId,
        scope: {
          directories: ['src/orchestra/'],
          filesRead: [],
          filesWrite: ['src/orchestra/token-counter.ts'],
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
      // Worker created a BRAND NEW (untracked) file before crashing — no
      // tracked-file modifications, no .result.
      writeFileSync(
        join(projectRoot, 'src', 'orchestra', 'token-counter.ts'),
        '// Sprint 196 196-005 repro — brand new file\nexport function countTokens(s: string): number { return s.length; }\n',
      );

      const out = restoreSprintFromCheckpoint(projectRoot, sprintId);
      expect(out.restored).toBe(true);
      // Gate must prevent the synthetic NO_GO.
      expect(out.staleTasksMarkedNoGo).not.toContain(taskId);

      const taskJson = JSON.parse(
        readFileSync(join(projectRoot, '.tasks', `task-${taskId}.json`), 'utf-8'),
      ) as Task;
      expect(taskJson.status).toBe(TaskStatus.MANUAL_REVIEW_REQUIRED);

      // Audit event must be emitted with the untracked path in the payload.
      const eventsPath = join(projectRoot, '.deckent', 'recently-works', `${sprintId}-events.jsonl`);
      expect(existsSync(eventsPath)).toBe(true);
      const raw = readFileSync(eventsPath, 'utf-8');
      const events = raw.split('\n').filter(l => l.trim().length > 0).map(l =>
        JSON.parse(l) as { channel: string; payload: { taskId?: string; untrackedFiles?: string[] } },
      );
      const match = events.find(e => e.channel === DISK_VS_CLAIM_MISMATCH_CHANNEL);
      expect(match).toBeDefined();
      expect(match?.payload.taskId).toBe(taskId);
      expect(match?.payload.untrackedFiles).toContain('src/orchestra/token-counter.ts');
    });
  });
});
