import { describe, it, expect } from 'vitest';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import type { DiskVerifyResult } from '../../src/orchestra/disk-verify.js';
import {
  enforceHonestResultGate,
  findBoundaryViolations,
} from '../../src/orchestra/result-evaluator.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '325-002',
    title: 'Deletion task',
    description: 'desc',
    model: 'sonnet',
    effort: 'high',
    priority: 'NORMAL',
    reason: 'test',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/old-module.ts', 'tests/orchestra/old-module.test.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '325-002',
    workerId: 'w-325-002',
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

const noDiskEvidence: DiskVerifyResult = {
  hasDiskEvidence: false,
  linesAdded: 0,
  untrackedFiles: [],
};

// ─── EMPTY_WRITE false-positive — deletion task ───────────────────────

describe('enforceHonestResultGate — deletion task EMPTY_WRITE FP (sprint-324 evidence)', () => {
  it('honest when linesRemoved>0 even with linesAdded=0 (module+test deletion)', () => {
    // Deletion: removed 120 lines, added 0, files listed in filesChanged but gone from disk
    const result = makeResult({
      filesChanged: ['src/orchestra/old-module.ts', 'tests/orchestra/old-module.test.ts'],
      linesAdded: 0,
      linesRemoved: 120,
      testsPassed: true,
      selfAssessment: 'DONE',
    });
    const gateResult = enforceHonestResultGate(result, makeTask(), noDiskEvidence);
    expect(gateResult.honest).toBe(true);
    expect(gateResult.violation).toBeUndefined();
  });

  it('honest when only linesRemoved=1 (minimal deletion still skips empty-write flag)', () => {
    const result = makeResult({
      filesChanged: ['src/orchestra/old-module.ts'],
      linesAdded: 0,
      linesRemoved: 1,
      testsPassed: true,
      selfAssessment: 'DONE',
    });
    const gateResult = enforceHonestResultGate(result, makeTask(), noDiskEvidence);
    expect(gateResult.honest).toBe(true);
  });

  it('still flags genuine stub — linesAdded=0 linesRemoved=0 no disk evidence', () => {
    const result = makeResult({
      filesChanged: ['src/orchestra/old-module.ts'],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      selfAssessment: 'DONE',
    });
    const gateResult = enforceHonestResultGate(result, makeTask(), noDiskEvidence);
    expect(gateResult.honest).toBe(false);
    expect(gateResult.violation).toBe('SCOPE_VIOLATION_OR_EMPTY_WRITE');
  });

  it('disk evidence bypasses empty-write check regardless of linesRemoved', () => {
    // Docker worker: new file untracked — hasDiskEvidence=true — must always pass
    const diskWithEvidence: DiskVerifyResult = {
      hasDiskEvidence: true,
      linesAdded: 0,
      untrackedFiles: ['src/orchestra/new-module.ts'],
    };
    const result = makeResult({
      filesChanged: ['src/orchestra/new-module.ts'],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      selfAssessment: 'DONE',
    });
    const gateResult = enforceHonestResultGate(result, makeTask(), diskWithEvidence);
    expect(gateResult.honest).toBe(true);
  });
});

// ─── BOUNDARY false-positive — *.md doc files ─────────────────────────

describe('findBoundaryViolations — *.md doc files are non-violations (sprint-324 evidence)', () => {
  it('*.md file outside scope.filesWrite is NOT a boundary violation', () => {
    const result = makeResult({
      filesChanged: [
        'src/orchestra/old-module.ts',         // in-scope
        'docs/architecture.md',                 // out-of-scope doc — must be exempt
      ],
    });
    const violations = findBoundaryViolations(result, makeTask());
    // architecture.md must not appear in violations
    expect(violations).not.toContain('docs/architecture.md');
  });

  it('*.md file inside scope is still clean (no regression on in-scope docs)', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/'],
        filesRead: [],
        filesWrite: ['docs/CHANGELOG.md'],
      },
    });
    const result = makeResult({ filesChanged: ['docs/CHANGELOG.md'] });
    const violations = findBoundaryViolations(result, task);
    expect(violations).toHaveLength(0);
  });

  it('out-of-scope .ts source file IS still flagged as a boundary violation', () => {
    const result = makeResult({
      filesChanged: [
        'src/orchestra/old-module.ts',     // in scope
        'src/core/config.ts',              // out-of-scope SOURCE — must be flagged
      ],
    });
    const violations = findBoundaryViolations(result, makeTask());
    expect(violations).toContain('src/core/config.ts');
  });

  it('mixed: out-of-scope .md skipped, out-of-scope .ts flagged', () => {
    const result = makeResult({
      filesChanged: [
        'docs/reference/api-surface.md',   // out-of-scope doc — exempt
        'src/core/types.ts',               // out-of-scope source — violation
      ],
    });
    const violations = findBoundaryViolations(result, makeTask());
    expect(violations).not.toContain('docs/reference/api-surface.md');
    expect(violations).toContain('src/core/types.ts');
  });
});

// ─── enforceHonestResultGate — boundary FP integration ───────────────

describe('enforceHonestResultGate — out-of-scope *.md does not downgrade to NO_GO', () => {
  it('deletion + out-of-scope *.md doc update → honest (both FPs absent)', () => {
    const result = makeResult({
      filesChanged: [
        'src/orchestra/old-module.ts',
        'tests/orchestra/old-module.test.ts',
        'docs/architecture.md',   // out-of-scope doc update, expected from task description
      ],
      linesAdded: 0,
      linesRemoved: 80,
      testsPassed: true,
      selfAssessment: 'DONE',
    });
    const gateResult = enforceHonestResultGate(result, makeTask(), noDiskEvidence);
    expect(gateResult.honest).toBe(true);
    expect(gateResult.result.selfAssessment).toBe('DONE');
  });

  it('out-of-scope *.ts source file STILL downgrades to NO_GO (regression guard)', () => {
    const result = makeResult({
      filesChanged: [
        'src/orchestra/old-module.ts',
        'src/core/types.ts',     // out-of-scope source — must remain a BOUNDARY_VIOLATION
      ],
      linesAdded: 10,
      linesRemoved: 5,
      testsPassed: true,
      selfAssessment: 'DONE',
    });
    const gateResult = enforceHonestResultGate(result, makeTask(), noDiskEvidence);
    expect(gateResult.honest).toBe(false);
    expect(gateResult.violation).toBe('BOUNDARY_VIOLATION');
  });
});
