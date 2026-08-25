import { describe, it, expect } from 'vitest';
import { buildTaskPrompt } from '../../src/orchestra/prompt-god-template.js';
import type { SprintContext } from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

// ─── Test Helpers ──────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '523-010-t',
    title: 'Test task',
    description: 'A test task for doc/code verify-scope isolation',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Testing',
    scope: {
      directories: ['src/core/'],
      filesRead: [],
      filesWrite: ['src/core/config.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'Pass', noGoCriteria: 'Fail', techDebtAcceptable: 'Minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-523',
    assignedAgent: 'generic',
    ...overrides,
  };
}

function makeCtx(overrides: Partial<SprintContext> = {}): SprintContext {
  return { effort: 'high', ...overrides };
}

// ─── 523-010: doc-task verification isolation ─────────────────────────

describe('523-010 — audit-class tasks are documentation-class (rubric-registry gap fix)', () => {
  it('task.type=audit (docs/audits/ report) gets doc-only VERIFY STEPS, never CRITICAL VERIFY STEPS/tsc/vitest', () => {
    const task = makeTask({
      type: 'audit',
      title: 'sprint-522 audit report',
      description: 'Produce docs/audits/sprint-522-findings.md',
      scope: { directories: ['docs/audits/'], filesRead: [], filesWrite: ['docs/audits/sprint-522-findings.md'] },
      assignedAgent: 'security-auditor',
    });
    const { prompt } = buildTaskPrompt(task, makeCtx());

    expect(prompt).toContain('doc-only task — DO NOT run the test suite');
    expect(prompt).not.toContain('CRITICAL VERIFY STEPS');
    expect(prompt).not.toMatch(/npx tsc/);
    expect(prompt).not.toMatch(/npx vitest run/);
    expect(prompt).not.toContain('Full test suite');
  });

  it('an unset-type task whose scope shape is audit (docs/audits/, single .md) is still doc-only (fallback reuses rubric-registry)', () => {
    const task = makeTask({
      scope: { directories: ['docs/audits/'], filesRead: [], filesWrite: ['docs/audits/rot-scan.md'] },
    });
    const { prompt } = buildTaskPrompt(task, makeCtx());

    expect(prompt).toContain('doc-only task — DO NOT run the test suite');
    expect(prompt).not.toContain('CRITICAL VERIFY STEPS');
  });
});

describe('523-010 — documentation-class guidance names ONLY task-declared checks', () => {
  it('a document-write task with a declared **Test:** command names that exact command, not repo-wide tsc/vitest', () => {
    const task = makeTask({
      type: 'documentation',
      title: 'Write migration cookbook page',
      description: [
        'Create docs/cookbook/migration.md',
        '',
        '**Test:** `node scripts/lint-docs.mjs docs/cookbook/migration.md`',
      ].join('\n'),
      verification: {
        version: 1,
        source: 'directive',
        commands: ['node scripts/lint-docs.mjs docs/cookbook/migration.md'],
      },
      scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/cookbook/migration.md'] },
      assignedAgent: 'doc-writer',
    });
    const { prompt } = buildTaskPrompt(task, makeCtx({ agentId: 'doc-writer' }));

    expect(prompt).toContain('doc-only task — DO NOT run the test suite');
    expect(prompt).toContain('Run your task-declared check(s) exactly as written');
    expect(prompt).toContain('node scripts/lint-docs.mjs docs/cookbook/migration.md');
    expect(prompt).not.toContain('CRITICAL VERIFY STEPS');
    expect(prompt).not.toMatch(/npx tsc/);
  });

  it('a document-write task with no declared command keeps the generic file-exists + optional-lint text', () => {
    const task = makeTask({
      type: 'documentation',
      scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/plain-note.md'] },
    });
    const { prompt } = buildTaskPrompt(task, makeCtx());

    expect(prompt).toContain('Read your file back from disk');
    expect(prompt).toContain('You MAY run a fast doc/markdown lint');
    expect(prompt).not.toContain('Run your task-declared check(s) exactly as written');
  });
});

describe('523-010 — source-writing task guidance stays byte-identical', () => {
  it('a code-development task keeps CRITICAL VERIFY STEPS (DO NOT SKIP) with type-check + targeted-test guidance', () => {
    const task = makeTask({
      type: 'code-development',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/config-validator.ts'] },
    });
    const { prompt } = buildTaskPrompt(task, makeCtx());

    expect(prompt).toContain('CRITICAL VERIFY STEPS (DO NOT SKIP)');
    expect(prompt).toContain('Type check / static analysis');
    expect(prompt).toContain('TARGETED test file(s) only');
    expect(prompt).toContain('Full test suite');
    expect(prompt).not.toContain('doc-only task — DO NOT run the test suite');
  });

  it('a code-development task with a declared **Test:** command keeps the TASK-DECLARED AUTHORITY block untouched', () => {
    const task = makeTask({
      type: 'code-development',
      description: [
        'Fix the config validator edge case.',
        '',
        '**Test:** `npx vitest run tests/core/config-validator.test.ts`',
      ].join('\n'),
      verification: {
        version: 1,
        source: 'directive',
        commands: ['npx vitest run tests/core/config-validator.test.ts'],
      },
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/config-validator.ts'] },
    });
    const { prompt } = buildTaskPrompt(task, makeCtx());

    expect(prompt).toContain('CRITICAL VERIFY STEPS (TASK-DECLARED AUTHORITY)');
    expect(prompt).toContain('npx vitest run tests/core/config-validator.test.ts');
    expect(prompt).not.toContain('doc-only task — DO NOT run the test suite');
  });

  it('a mixed scope (docs + src) task is NOT doc-only, even with no explicit type', () => {
    const task = makeTask({
      scope: { directories: ['src/core/', 'docs/'], filesRead: [], filesWrite: ['src/core/x.ts', 'docs/x.md'] },
    });
    const { prompt } = buildTaskPrompt(task, makeCtx());

    expect(prompt).toContain('CRITICAL VERIFY STEPS (DO NOT SKIP)');
    expect(prompt).not.toContain('doc-only task — DO NOT run the test suite');
  });
});
