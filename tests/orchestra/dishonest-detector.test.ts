// ═══ Dishonest-Result Detector Tests (Sprint 194 Task 194-002) ════════
// W-INTEGRITY I-8 — Sprint 192 192-012 carry-over.
//
// Covers the three orthogonal detection rules + the audit-event emit
// path. Anchors against the Sprint 191 191-003 forensic incident:
// worker `.result` notes claimed "+220 LoC outcome-tracker.ts" but the
// on-disk delta touched only a test file.

import { describe, it, expect, vi } from 'vitest';
import {
  detectDishonestResult,
  emitDishonestResultEvent,
  parseNotesClaims,
  makeStaticGitNumstatProvider,
  DISHONEST_RESULT_DETECTED_CHANNEL,
  type DishonestyFinding,
  type GitNumstatProvider,
} from '../../src/orchestra/honest-gate.js';
import {
  runDishonestyCheck,
  type DishonestyCheckOptions,
} from '../../src/orchestra/result-evaluator.js';
import type { Task, TaskResult } from '../../src/core/types.js';

// ─── Test Helpers ─────────────────────────────────────────────────────

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 'test-001',
    workerId: 'w-test',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    notes: '',
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-001',
    title: 'Test task',
    description: '',
    model: 'sonnet',
    effort: 'normal',
    reason: '',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: [],
    },
    dependencies: [],
    goNogo: {
      goCriteria: '',
      noGoCriteria: '',
      techDebtAcceptable: '',
    },
    status: 'EXECUTING',
    sprintId: 'sprint-194',
    createdAt: '2026-05-26T00:00:00Z',
    ...overrides,
  } as Task;
}

// ─── 1. Honest result — pass through ──────────────────────────────────

describe('detectDishonestResult — honest pass', () => {
  it('returns dishonest=false when claimed LoC matches git numstat', () => {
    const git = makeStaticGitNumstatProvider({
      'src/orchestra/foo.ts': { added: 100, removed: 10 },
    });
    const result = makeResult({
      filesChanged: ['src/orchestra/foo.ts'],
      linesAdded: 100,
      notes: 'Added 100 lines to foo.ts',
    });
    const finding = detectDishonestResult(result, git);
    expect(finding.dishonest).toBe(false);
    expect(finding.reason).toBeUndefined();
  });

  it('returns dishonest=false when result has no filesChanged', () => {
    const git = makeStaticGitNumstatProvider({});
    const finding = detectDishonestResult(makeResult(), git);
    expect(finding.dishonest).toBe(false);
  });

  it('returns dishonest=false within tolerance band', () => {
    // claimed 100, actual 70 → 30% deviation, default tolerance 50% → honest
    const git = makeStaticGitNumstatProvider({
      'src/a.ts': { added: 70, removed: 0 },
    });
    const result = makeResult({ filesChanged: ['src/a.ts'], linesAdded: 100 });
    const finding = detectDishonestResult(result, git);
    expect(finding.dishonest).toBe(false);
  });

  it('returns dishonest=false when claimed LoC < minLocThreshold', () => {
    // Below the 20-line threshold, mismatch is ignored as noise
    const git = makeStaticGitNumstatProvider({
      'src/a.ts': { added: 0, removed: 0 },
    });
    const result = makeResult({ filesChanged: ['src/a.ts'], linesAdded: 10 });
    const finding = detectDishonestResult(result, git);
    expect(finding.dishonest).toBe(false);
  });
});

// ─── 2. LOC_DELTA_MISMATCH ────────────────────────────────────────────

describe('detectDishonestResult — LOC_DELTA_MISMATCH', () => {
  it('flags claimed +200 vs actual +50 (75% deviation > 50%)', () => {
    const git = makeStaticGitNumstatProvider({
      'src/orchestra/big.ts': { added: 50, removed: 5 },
    });
    const result = makeResult({
      filesChanged: ['src/orchestra/big.ts'],
      linesAdded: 200,
    });
    const finding = detectDishonestResult(result, git);
    expect(finding.dishonest).toBe(true);
    expect(finding.reason).toBe('LOC_DELTA_MISMATCH');
    expect(finding.claimedLines).toBe(200);
    expect(finding.actualLines).toBe(50);
    expect(finding.detail).toMatch(/claimed linesAdded=200/);
  });

  it('respects custom tolerance', () => {
    // claimed 100, actual 70 → 30% deviation
    // default tolerance 50% → honest, custom tolerance 20% → dishonest
    const git = makeStaticGitNumstatProvider({
      'src/a.ts': { added: 70, removed: 0 },
    });
    const result = makeResult({ filesChanged: ['src/a.ts'], linesAdded: 100 });
    const tight = detectDishonestResult(result, git, { tolerance: 0.2 });
    expect(tight.dishonest).toBe(true);
    expect(tight.reason).toBe('LOC_DELTA_MISMATCH');
  });

  it('sums git additions across multiple files', () => {
    const git = makeStaticGitNumstatProvider({
      'src/a.ts': { added: 20, removed: 0 },
      'src/b.ts': { added: 30, removed: 0 },
    });
    const result = makeResult({
      filesChanged: ['src/a.ts', 'src/b.ts'],
      linesAdded: 200, // claim grossly inflated
    });
    const finding = detectDishonestResult(result, git);
    expect(finding.dishonest).toBe(true);
    expect(finding.actualLines).toBe(50);
  });
});

// ─── 3. FILES_NOT_TOUCHED ─────────────────────────────────────────────

describe('detectDishonestResult — FILES_NOT_TOUCHED', () => {
  it('flags when ALL claimed files have zero git delta', () => {
    const git = makeStaticGitNumstatProvider({
      'src/orchestra/outcome-tracker.ts': { added: 0, removed: 0 },
    });
    const result = makeResult({
      filesChanged: ['src/orchestra/outcome-tracker.ts'],
      linesAdded: 220, // worker lied about scale too
    });
    const finding = detectDishonestResult(result, git);
    expect(finding.dishonest).toBe(true);
    expect(finding.reason).toBe('FILES_NOT_TOUCHED');
    expect(finding.untouchedFiles).toEqual(['src/orchestra/outcome-tracker.ts']);
  });

  it('does NOT flag when at least one file has real changes (partial-touch)', () => {
    const git = makeStaticGitNumstatProvider({
      'src/a.ts': { added: 0, removed: 0 },
      'src/b.ts': { added: 100, removed: 5 },
    });
    const result = makeResult({
      filesChanged: ['src/a.ts', 'src/b.ts'],
      linesAdded: 100,
    });
    const finding = detectDishonestResult(result, git);
    // Mixed list: some touched, some not — covered by other rules,
    // but not by FILES_NOT_TOUCHED (which requires ALL untouched)
    expect(finding.reason).not.toBe('FILES_NOT_TOUCHED');
  });
});

// ─── 4. NOTES_CLAIM_MISMATCH ──────────────────────────────────────────

describe('detectDishonestResult — NOTES_CLAIM_MISMATCH', () => {
  it('flags when notes claim +N LoC disagrees with both result and git', () => {
    const git = makeStaticGitNumstatProvider({
      'src/orchestra/x.ts': { added: 30, removed: 0 },
    });
    // Note: result.linesAdded matches git (honest on that axis),
    // but notes claim is grossly inflated → dishonest by notes rule
    const result = makeResult({
      filesChanged: ['src/orchestra/x.ts'],
      linesAdded: 30,
      notes: 'Refactor: +500 LoC across orchestra module',
    });
    const finding = detectDishonestResult(result, git);
    expect(finding.dishonest).toBe(true);
    expect(finding.reason).toBe('NOTES_CLAIM_MISMATCH');
    expect(finding.claimedLines).toBe(500);
  });

  it('does NOT flag when notes claim agrees with one of result/git', () => {
    const git = makeStaticGitNumstatProvider({
      'src/a.ts': { added: 100, removed: 0 },
    });
    const result = makeResult({
      filesChanged: ['src/a.ts'],
      linesAdded: 100,
      notes: 'Added 100 LoC to a.ts',
    });
    const finding = detectDishonestResult(result, git);
    expect(finding.dishonest).toBe(false);
  });

  it('parseNotesClaims extracts +N LoC and "added N lines" forms', () => {
    expect(parseNotesClaims('Refactored module — +220 LoC across files').locAdded).toBe(220);
    expect(parseNotesClaims('added 75 lines to honest-gate').locAdded).toBe(75);
    expect(parseNotesClaims('').files).toEqual([]);
    expect(
      parseNotesClaims('Files changed: src/a.ts, src/b.ts').files,
    ).toEqual(['src/a.ts', 'src/b.ts']);
  });
});

// ─── 5. Sprint 191 191-003 fixture replay ─────────────────────────────

describe('detectDishonestResult — Sprint 191 191-003 forensic fixture', () => {
  it('detects the canonical "+220 LoC outcome-tracker" lie as NO_GO trigger', () => {
    // Reproduce the Sprint 191 forensic: worker .result claimed
    //   - filesChanged: outcome-tracker.ts (+ test)
    //   - linesAdded: 220
    //   - notes: "+220 LoC outcome-tracker"
    // Reality (from git numstat): only the test file changed.
    const git = makeStaticGitNumstatProvider({
      'src/orchestra/outcome-tracker.ts': { added: 0, removed: 0 },
      'tests/orchestra/outcome-tracker.test.ts': { added: 80, removed: 0 },
    });
    const result = makeResult({
      taskId: '191-003',
      filesChanged: [
        'src/orchestra/outcome-tracker.ts',
        'tests/orchestra/outcome-tracker.test.ts',
      ],
      linesAdded: 220,
      notes: '+220 LoC outcome-tracker — added learning bonus + synergy matrix',
    });
    const finding = detectDishonestResult(result, git);
    expect(finding.dishonest).toBe(true);
    // Either LOC_DELTA_MISMATCH (220 vs 80) or NOTES_CLAIM_MISMATCH fires;
    // priority order returns LOC_DELTA_MISMATCH first.
    expect(['LOC_DELTA_MISMATCH', 'NOTES_CLAIM_MISMATCH', 'FILES_NOT_TOUCHED'])
      .toContain(finding.reason);
  });
});

// ─── 6. Audit-event emit ─────────────────────────────────────────────

describe('emitDishonestResultEvent', () => {
  it('invokes the sink with channel + payload when dishonest', () => {
    const sink = vi.fn();
    const finding: DishonestyFinding = {
      dishonest: true,
      reason: 'LOC_DELTA_MISMATCH',
      detail: 'claimed 200 actual 50',
      claimedLines: 200,
      actualLines: 50,
    };
    emitDishonestResultEvent('/tmp/proj', 'sprint-194', '194-002', finding, sink);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(
      DISHONEST_RESULT_DETECTED_CHANNEL,
      expect.objectContaining({
        taskId: '194-002',
        reason: 'LOC_DELTA_MISMATCH',
        claimedLines: 200,
        actualLines: 50,
      }),
    );
  });

  it('is a no-op when the finding is honest', () => {
    const sink = vi.fn();
    emitDishonestResultEvent(
      '/tmp/proj',
      'sprint-194',
      '194-002',
      { dishonest: false },
      sink,
    );
    expect(sink).not.toHaveBeenCalled();
  });

  it('uses the channel constant BRAIN→AUDITOR:DISHONEST_RESULT_DETECTED', () => {
    expect(DISHONEST_RESULT_DETECTED_CHANNEL).toBe(
      'BRAIN→AUDITOR:DISHONEST_RESULT_DETECTED',
    );
  });
});

// ─── 7. runDishonestyCheck (result-evaluator wire-in) ─────────────────

describe('runDishonestyCheck — gate wire-in', () => {
  it('returns honest=true when result matches git', () => {
    const git = makeStaticGitNumstatProvider({
      'src/a.ts': { added: 100, removed: 0 },
    });
    const result = makeResult({ filesChanged: ['src/a.ts'], linesAdded: 100 });
    const out = runDishonestyCheck(
      result,
      makeTask(),
      git,
      { projectRoot: '/tmp', sprintId: 'sprint-194' },
      { suppressEmit: true },
    );
    expect(out.honest).toBe(true);
    expect(out.result).toBe(result);
  });

  it('downgrades to NO_GO and emits audit event when dishonest', () => {
    const sink = vi.fn();
    const git = makeStaticGitNumstatProvider({
      'src/a.ts': { added: 10, removed: 0 },
    });
    const result = makeResult({
      filesChanged: ['src/a.ts'],
      linesAdded: 500,
      selfAssessment: 'DONE',
    });
    const opts: DishonestyCheckOptions = { emit: sink };
    const out = runDishonestyCheck(
      result,
      makeTask({ id: '194-002' }),
      git,
      { projectRoot: '/tmp', sprintId: 'sprint-194' },
      opts,
    );
    expect(out.honest).toBe(false);
    expect(out.violation).toBe('LOC_DELTA_MISMATCH');
    expect(out.result.selfAssessment).toBe('NO_GO');
    expect(sink).toHaveBeenCalledOnce();
    expect(sink).toHaveBeenCalledWith(
      DISHONEST_RESULT_DETECTED_CHANNEL,
      expect.objectContaining({ taskId: '194-002', reason: 'LOC_DELTA_MISMATCH' }),
    );
  });

  it('does not emit when suppressEmit=true even on dishonest', () => {
    const sink = vi.fn();
    const git: GitNumstatProvider = makeStaticGitNumstatProvider({
      'src/a.ts': { added: 0, removed: 0 },
    });
    const result = makeResult({ filesChanged: ['src/a.ts'], linesAdded: 300 });
    const out = runDishonestyCheck(
      result,
      makeTask(),
      git,
      { projectRoot: '/tmp', sprintId: 'sprint-194' },
      { emit: sink, suppressEmit: true },
    );
    expect(out.honest).toBe(false);
    expect(sink).not.toHaveBeenCalled();
  });
});
