import { describe, it, expect } from 'vitest';
import {
  isAuditTask,
  isDocumentWriteTask,
  detectTaskType,
  getRubric,
  coverageOptional,
  AUDIT_RUBRIC,
  DOC_WRITE_RUBRIC,
  CODE_RUBRIC,
} from '../../src/orchestra/rubric-registry.js';
import { TaskStatus, type Task } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '154-test',
    title: 'Test task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

// ─── isAuditTask ────────────────────────────────────────────────────

describe('isAuditTask', () => {
  it('returns true for a single docs/audits/sprint-N/T-N.md write with audits-only scope dir', () => {
    // Arrange
    const task = makeTask({
      scope: {
        directories: ['docs/audits/sprint-153/'],
        filesRead: [],
        filesWrite: ['docs/audits/sprint-153/T-001.md'],
      },
    });

    // Act
    const result = isAuditTask(task);

    // Assert
    expect(result).toBe(true);
  });

  it('returns false when filesWrite has more than one entry', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/audits/sprint-153/'],
        filesRead: [],
        filesWrite: [
          'docs/audits/sprint-153/T-001.md',
          'docs/audits/sprint-153/T-002.md',
        ],
      },
    });

    expect(isAuditTask(task)).toBe(false);
  });

  it('returns false when scope.directories includes src/ alongside an audits write', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/audits/sprint-153/', 'src/orchestra/'],
        filesRead: [],
        filesWrite: ['docs/audits/sprint-153/T-001.md'],
      },
    });

    expect(isAuditTask(task)).toBe(false);
  });

  it('returns false for a non-audits docs path (docs/non-audit.md)', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/'],
        filesRead: [],
        filesWrite: ['docs/non-audit.md'],
      },
    });

    expect(isAuditTask(task)).toBe(false);
  });

  it('returns false for empty filesWrite', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/audits/sprint-153/'],
        filesRead: [],
        filesWrite: [],
      },
    });

    expect(isAuditTask(task)).toBe(false);
  });

  it('returns false when scope.directories contains tests/ alongside an audits write', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/audits/sprint-153/', 'tests/orchestra/'],
        filesRead: [],
        filesWrite: ['docs/audits/sprint-153/T-001.md'],
      },
    });

    expect(isAuditTask(task)).toBe(false);
  });

  it('returns false when the single filesWrite is not a .md file', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/audits/sprint-153/'],
        filesRead: [],
        filesWrite: ['docs/audits/sprint-153/data.json'],
      },
    });

    expect(isAuditTask(task)).toBe(false);
  });
});

// ─── isDocumentWriteTask ────────────────────────────────────────────

describe('isDocumentWriteTask', () => {
  it('returns true for a single docs/smoke/T.md write with docs-only scope dir', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/smoke/'],
        filesRead: [],
        filesWrite: ['docs/smoke/T.md'],
      },
    });

    expect(isDocumentWriteTask(task)).toBe(true);
  });

  it('returns false for an audits write (excluded from doc-write)', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/audits/'],
        filesRead: [],
        filesWrite: ['docs/audits/X.md'],
      },
    });

    expect(isDocumentWriteTask(task)).toBe(false);
  });

  it('returns true for multiple docs/*.md writes with docs-only scope dir', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/'],
        filesRead: [],
        filesWrite: ['docs/X.md', 'docs/Y.md'],
      },
    });

    expect(isDocumentWriteTask(task)).toBe(true);
  });

  it('returns false when scope.directories includes src/orchestra/ alongside doc writes', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/', 'src/orchestra/'],
        filesRead: [],
        filesWrite: ['docs/X.md'],
      },
    });

    expect(isDocumentWriteTask(task)).toBe(false);
  });

  it('returns false for empty filesWrite', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/'],
        filesRead: [],
        filesWrite: [],
      },
    });

    expect(isDocumentWriteTask(task)).toBe(false);
  });

  it('returns false when at least one filesWrite entry is outside docs/', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/'],
        filesRead: [],
        filesWrite: ['docs/X.md', 'src/orchestra/foo.ts'],
      },
    });

    expect(isDocumentWriteTask(task)).toBe(false);
  });

  it('returns false when any filesWrite entry is under docs/audits/', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/'],
        filesRead: [],
        filesWrite: ['docs/X.md', 'docs/audits/X.md'],
      },
    });

    expect(isDocumentWriteTask(task)).toBe(false);
  });

  it('returns false when scope.directories contains tests/ alongside docs writes', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/', 'tests/orchestra/'],
        filesRead: [],
        filesWrite: ['docs/X.md'],
      },
    });

    expect(isDocumentWriteTask(task)).toBe(false);
  });

  // LP-1 (single-source classification): a doc file OUTSIDE docs/ with a non-source
  // scope is documentation, not code — this is what fixes the 3-layer split where a
  // non-docs/ .md task inherited the code DoD + core-dev ADR presets + code verify.
  it('returns true for a top-level CHANGELOG.md with a non-source scope (LP-1)', () => {
    const task = makeTask({
      scope: { directories: ['./'], filesRead: [], filesWrite: ['CHANGELOG.md'] },
    });
    expect(isDocumentWriteTask(task)).toBe(true);
  });

  it('returns true for a .md in an arbitrary non-source directory (LP-1)', () => {
    const task = makeTask({
      scope: { directories: ['scratch-notes/'], filesRead: [], filesWrite: ['scratch-notes/note.md'] },
    });
    expect(isDocumentWriteTask(task)).toBe(true);
  });

  it('returns true for .txt / .rst doc files (LP-1 doc extensions)', () => {
    expect(isDocumentWriteTask(makeTask({
      scope: { directories: ['notes/'], filesRead: [], filesWrite: ['notes/a.txt', 'notes/b.rst'] },
    }))).toBe(true);
  });

  it('keeps a .md ADJACENT to source classified as code, not doc (LP-1 hasSourceDirectories guard)', () => {
    const task = makeTask({
      scope: { directories: ['src/dashboard/'], filesRead: [], filesWrite: ['src/dashboard/README.md'] },
    });
    expect(isDocumentWriteTask(task)).toBe(false);
  });
});

// ─── detectTaskType ─────────────────────────────────────────────────

describe('detectTaskType', () => {
  it('returns "audit" with priority over doc-write when filesWrite is under docs/audits/', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/audits/sprint-153/'],
        filesRead: [],
        filesWrite: ['docs/audits/sprint-153/X.md'],
      },
    });

    expect(detectTaskType(task)).toBe('audit');
  });

  it('returns "document-write" when filesWrite is under docs/smoke/', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/smoke/'],
        filesRead: [],
        filesWrite: ['docs/smoke/X.md'],
      },
    });

    expect(detectTaskType(task)).toBe('document-write');
  });

  it('returns "code-development" when filesWrite is under src/', () => {
    const task = makeTask({
      scope: {
        directories: ['src/'],
        filesRead: [],
        filesWrite: ['src/X.ts'],
      },
    });

    expect(detectTaskType(task)).toBe('code-development');
  });

  it('returns "code-development" when scope is empty (default fallback)', () => {
    const task = makeTask({
      scope: { directories: [], filesRead: [], filesWrite: [] },
    });

    expect(detectTaskType(task)).toBe('code-development');
  });

  it('returns "code-development" for a mixed src/+docs/ scope (not pure doc-write)', () => {
    const task = makeTask({
      scope: {
        directories: ['src/orchestra/', 'docs/'],
        filesRead: [],
        filesWrite: ['src/orchestra/foo.ts', 'docs/foo.md'],
      },
    });

    expect(detectTaskType(task)).toBe('code-development');
  });
});

// ─── getRubric ──────────────────────────────────────────────────────

describe('getRubric', () => {
  it('returns AUDIT_RUBRIC reference for an audit task', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/audits/sprint-153/'],
        filesRead: [],
        filesWrite: ['docs/audits/sprint-153/X.md'],
      },
    });

    expect(getRubric(task)).toBe(AUDIT_RUBRIC);
  });

  it('returns DOC_WRITE_RUBRIC reference for a doc-write task', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/smoke/'],
        filesRead: [],
        filesWrite: ['docs/smoke/X.md'],
      },
    });

    expect(getRubric(task)).toBe(DOC_WRITE_RUBRIC);
  });

  it('returns CODE_RUBRIC reference for a code-development task', () => {
    const task = makeTask({
      scope: {
        directories: ['src/'],
        filesRead: [],
        filesWrite: ['src/X.ts'],
      },
    });

    expect(getRubric(task)).toBe(CODE_RUBRIC);
  });
});

// ─── coverageOptional ───────────────────────────────────────────────

describe('coverageOptional', () => {
  it('returns true for an audit task', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/audits/sprint-153/'],
        filesRead: [],
        filesWrite: ['docs/audits/sprint-153/X.md'],
      },
    });

    expect(coverageOptional(task)).toBe(true);
  });

  it('returns true for a doc-write task', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/smoke/'],
        filesRead: [],
        filesWrite: ['docs/smoke/X.md'],
      },
    });

    expect(coverageOptional(task)).toBe(true);
  });

  it('returns false for a code-development task', () => {
    const task = makeTask({
      scope: {
        directories: ['src/'],
        filesRead: [],
        filesWrite: ['src/X.ts'],
      },
    });

    expect(coverageOptional(task)).toBe(false);
  });
});
