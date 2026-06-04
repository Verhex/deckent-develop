// tests/orchestra/brain-integrity-regression.test.ts — Sprint 227 task 227-004.
//
// Integration regression suite that exercises all three Wave-1 fixes together:
//   (1) 227-002: export-wipe guard — writeGuardedExports must produce non-empty
//       decisions.md even when finalize's render temporarily returns empty.
//   (2) 227-003: decay safety — entries within the decay window AND undated
//       entries (sprint_num=0) survive store.decay(); collapse does not happen.
//   (3) 227-001: rubric renorm — evaluateWithRubric with coverage:null must NOT
//       pin every score at 78.75; quality signals still differentiate tasks.
//
// Hermetic: tmpdir DB + tmpdir exports; no project-root or HOME I/O.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import { writeGuardedExports } from '../../src/core/memory-export.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';
import type { CreateEntryInput } from '../../src/core/memory-types.js';
import type { Task, TaskResult } from '../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeAdr(overrides: Partial<CreateEntryInput> = {}): CreateEntryInput {
  return {
    id: overrides.id ?? 'adr-001',
    type: 'adr',
    title: overrides.title ?? 'Test ADR',
    content: overrides.content ?? '# ADR\n\n**Status:** accepted\n\nDecision: do the thing.',
    source: 'brain',
    status: overrides.status ?? 'accepted',
    priority: 'normal',
    sprint_id: overrides.sprint_id ?? 'sprint-227',
    sprint_num: overrides.sprint_num ?? 227,
    lang: 'en',
    decay_exempt: overrides.decay_exempt ?? true,
    tags: overrides.tags ?? ['adr'],
    relations: [],
  };
}

function makeMemory(overrides: Partial<CreateEntryInput> = {}): CreateEntryInput {
  return {
    id: overrides.id ?? 'mem-001',
    type: overrides.type ?? 'memory',
    title: overrides.title ?? 'Sprint Learning',
    content: overrides.content ?? 'We learned something important.',
    source: 'brain',
    status: 'active',
    priority: 'normal',
    sprint_id: overrides.sprint_id ?? 'sprint-227',
    sprint_num: overrides.sprint_num ?? 227,
    lang: 'en',
    decay_exempt: overrides.decay_exempt ?? false,
    tags: overrides.tags ?? ['learning'],
    relations: [],
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '227-reg',
    title: 'Regression test task',
    description: 'Testing rubric renormalization',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'regression test',
    assignedAgent: 'refactorer',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/result-evaluator.ts'],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'tests pass',
      noGoCriteria: 'tests fail',
      techDebtAcceptable: '',
    },
    status: 'DONE',
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '227-reg',
    workerId: 'w-227-reg',
    filesChanged: ['src/orchestra/result-evaluator.ts'],
    linesAdded: 20,
    linesRemoved: 5,
    testsPassed: true,
    coverage: null as unknown as number,
    selfAssessment: 'DONE',
    notes: 'Detailed notes explaining what changed and why the fix works as expected in this regression scenario.',
    ...overrides,
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────

let store: MemoryStore;
let tmpDir: string;
let exportsDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'brain-integrity-regression-'));
  store = new MemoryStore(join(tmpDir, 'memory.db'));
  exportsDir = join(tmpDir, 'exports');
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ═══ Tests ════════════════════════════════════════════════════════════

describe('brain-integrity-regression — Sprint 227 (all three fixes together)', () => {

  // ── (1) export-non-empty-after-finalize ──────────────────────────────
  it('export-non-empty: decisions.md contains ADR IDs after writeGuardedExports', () => {
    // Seed 5 ADRs + 3 memory entries (mirrors a realistic sprint-end DB state).
    for (let i = 1; i <= 5; i++) {
      store.insert(makeAdr({ id: `adr-00${i}`, title: `Architecture Decision ${i}` }));
    }
    for (let i = 1; i <= 3; i++) {
      store.insert(makeMemory({ id: `mem-00${i}`, title: `Sprint learning ${i}` }));
    }

    expect(store.getByType('adr').length).toBe(5);

    const result = writeGuardedExports(store, exportsDir);

    // Guard must NOT have fired — DB has ADRs and the render is non-empty.
    expect(result.skipped).not.toContain('decisions.md');
    expect(result.written).toContain('decisions.md');
    expect(result.warnings.length).toBe(0);

    const decisionsPath = join(exportsDir, 'decisions.md');
    expect(existsSync(decisionsPath)).toBe(true);

    const content = readFileSync(decisionsPath, 'utf-8');

    // decisions.md must contain real ADR data, not the empty-state marker.
    expect(content).not.toContain('_No architecture decisions recorded._');
    // Spot-check: each ADR ID appears in the file.
    for (let i = 1; i <= 5; i++) {
      expect(content).toContain(`adr-00${i}`);
    }

    // memory.md also written and non-empty.
    const memoryPath = join(exportsDir, 'memory.md');
    expect(existsSync(memoryPath)).toBe(true);
    const memContent = readFileSync(memoryPath, 'utf-8');
    expect(memContent).not.toContain('_No learnings recorded._');
    expect(memContent).toContain('Sprint learning 1');
  });

  // ── (2) decay-keeps-window ───────────────────────────────────────────
  it('decay-keeps-window: entries within the window and undated entries survive store.decay()', () => {
    // currentSprintNum=227, decayAfterSprints=20 → threshold = 207.
    // Entries with sprint_num >= 207 are inside the window and MUST survive.
    // Entries with sprint_num < 207 and sprint_num > 0 should decay.
    // Entries with sprint_num == 0 (undated) MUST be preserved (skipDelete guard).

    // Inside window: sprint_num 220, 215, 210 (>= 207).
    store.insert(makeMemory({ id: 'inside-220', sprint_num: 220 }));
    store.insert(makeMemory({ id: 'inside-215', sprint_num: 215 }));
    store.insert(makeMemory({ id: 'inside-210', sprint_num: 210 }));

    // On boundary (207 == threshold): must survive.
    store.insert(makeMemory({ id: 'boundary-207', sprint_num: 207 }));

    // Outside window: sprint_num 200 (< 207) — eligible for decay.
    // Keep count < 50% of non-exempt total to avoid catastrophic guard.
    store.insert(makeMemory({ id: 'old-200', sprint_num: 200 }));

    // Undated (sprint_num=0): must survive regardless.
    store.insert(makeMemory({ id: 'undated-A', sprint_num: 0 }));
    store.insert(makeMemory({ id: 'undated-B', sprint_num: 0 }));

    const decayResult = store.decay(227, 20);

    // Window entries survive.
    expect(store.getById('inside-220')).not.toBeNull();
    expect(store.getById('inside-215')).not.toBeNull();
    expect(store.getById('inside-210')).not.toBeNull();
    expect(store.getById('boundary-207')).not.toBeNull();

    // Undated entries survive (skipDelete guard).
    expect(store.getById('undated-A')).not.toBeNull();
    expect(store.getById('undated-B')).not.toBeNull();

    // Only the genuinely old dated entry is removed.
    expect(store.getById('old-200')).toBeNull();
    expect(decayResult.deletedCount).toBe(1);
    expect(decayResult.aborted).toBeUndefined();
  });

  // ── (3) rubric-varies-not-78.75 ─────────────────────────────────────
  it('rubric-varies-not-78.75: coverage:null tasks score differently based on quality signals', () => {
    const task = makeTask();

    // (a) Perfect task: testsPassed=true, selfAssessment=DONE, good notes.
    const perfectResult = makeResult({
      testsPassed: true,
      selfAssessment: 'DONE',
    });

    // (b) Partial task: testsPassed=true but selfAssessment=GO_WITH_TECH_DEBT.
    const partialResult = makeResult({
      testsPassed: true,
      selfAssessment: 'GO_WITH_TECH_DEBT',
    });

    // (c) Failing task: testsPassed=false, selfAssessment=NO_GO.
    const failingResult = makeResult({
      testsPassed: false,
      selfAssessment: 'NO_GO',
    });

    const evalPerfect = evaluateWithRubric(perfectResult, task);
    const evalPartial = evaluateWithRubric(partialResult, task);
    const evalFailing = evaluateWithRubric(failingResult, task);

    // Renormalized perfect task must score well above 78.75.
    expect(evalPerfect.totalScore).toBeGreaterThanOrEqual(90);
    expect(Math.abs(evalPerfect.totalScore - 78.75)).toBeGreaterThan(1);

    // Scores must not all be identical (there must be variance).
    expect(evalPerfect.totalScore).toBeGreaterThan(evalPartial.totalScore);
    expect(evalPartial.totalScore).toBeGreaterThan(evalFailing.totalScore);

    // The historical pinned value must not appear in any of the three.
    expect(Math.abs(evalPartial.totalScore - 78.75)).toBeGreaterThan(1);
    expect(Math.abs(evalFailing.totalScore - 78.75)).toBeGreaterThan(1);

    // Decision ordering: perfect=DONE, failing should be NO_GO or TECH_DEBT.
    expect(evalPerfect.decision).toBe('DONE');
    expect(['NO_GO', 'GO_WITH_TECH_DEBT']).toContain(evalFailing.decision);
  });

  // ── (bonus) combined chain — seed → export → decay → rub ─────────────
  it('combined: seed DB, export non-empty, decay safely, rubric varies — all three fixes', () => {
    // Seed a realistic Brain DB: 5 ADRs (decay_exempt) + 4 memory entries.
    for (let i = 1; i <= 5; i++) {
      store.insert(makeAdr({ id: `adr-c${i}`, title: `Combined ADR ${i}`, sprint_num: 180 }));
    }
    // Window entries (sprint_num=215, within 227-20=207 threshold).
    store.insert(makeMemory({ id: 'mem-c1', sprint_num: 215 }));
    store.insert(makeMemory({ id: 'mem-c2', sprint_num: 220 }));
    // Old entry (sprint_num=190 < 207).
    store.insert(makeMemory({ id: 'mem-old', sprint_num: 190 }));
    // Undated.
    store.insert(makeMemory({ id: 'mem-undated', sprint_num: 0 }));

    // Step 1: export — decisions.md must be non-empty.
    const exportResult = writeGuardedExports(store, exportsDir);
    expect(exportResult.written).toContain('decisions.md');
    expect(exportResult.skipped).not.toContain('decisions.md');
    const decisionsContent = readFileSync(join(exportsDir, 'decisions.md'), 'utf-8');
    expect(decisionsContent).toContain('adr-c1');
    expect(decisionsContent).not.toContain('_No architecture decisions recorded._');

    // Step 2: decay — window and undated entries survive, old entry decays.
    const decayResult = store.decay(227, 20);
    expect(store.getById('mem-c1')).not.toBeNull();
    expect(store.getById('mem-c2')).not.toBeNull();
    expect(store.getById('mem-undated')).not.toBeNull();
    expect(store.getById('mem-old')).toBeNull();
    // ADRs are decay_exempt — untouched.
    for (let i = 1; i <= 5; i++) {
      expect(store.getById(`adr-c${i}`)).not.toBeNull();
    }
    expect(decayResult.deletedCount).toBe(1);

    // Step 3: rubric — coverage:null perfect task must score ≥ 90, not 78.75.
    const task = makeTask({ id: '227-combined' });
    const evalResult = evaluateWithRubric(makeResult(), task);
    expect(evalResult.totalScore).toBeGreaterThanOrEqual(90);
    expect(Math.abs(evalResult.totalScore - 78.75)).toBeGreaterThan(1);
    expect(evalResult.decision).toBe('DONE');
  });
});
