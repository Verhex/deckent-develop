/**
 * Sprint 182 PQ-4 (F5) — DIRECTIVES `Files:` field → `task.scope.filesWrite`
 *
 * Coverage:
 *   1. Explicit `Files:` list parses into `scope.filesWrite`.
 *   2. Missing/empty `Files:` falls through to `Scope:` directories only
 *      (filesWrite stays empty; no synthetic basenames invented).
 *   3. Rendered prompt's "## Scope Rules" block surfaces an explicit
 *      open-formulation fallback when filesWrite is empty but
 *      directories are provided — no more vague "(determined by your task scope)".
 */

import { describe, it, expect } from 'vitest';
import { parseStructuredDirectives } from '../../src/orchestra/task-builder.js';
import { buildTaskPrompt, type SprintContext } from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '182-010',
    title: 'F5 fixture',
    description: 'fixture description',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-182',
    assignedAgent: 'generic',
    assignedSkills: [],
    ...overrides,
  };
}

const EMPTY_CTX: SprintContext = { effort: 'medium' };

describe('F5 — DIRECTIVES Files: → task.scope.filesWrite', () => {
  it('parses an explicit `Files:` list into filesWrite', () => {
    const content = [
      '## Task 1: F5 explicit files',
      '- Files: src/orchestra/task-builder.ts, src/orchestra/prompt-god-template.ts',
      '- Scope: src/orchestra/',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    expect(tasks).toHaveLength(1);
    const filesWrite = tasks[0]?.scope.filesWrite ?? [];
    expect(filesWrite).toContain('src/orchestra/task-builder.ts');
    expect(filesWrite).toContain('src/orchestra/prompt-god-template.ts');
  });

  it('leaves filesWrite empty when only `Scope:` directories are provided (no synthetic filenames)', () => {
    const content = [
      '## Task 1: F5 scope-only',
      '- Scope: src/orchestra/, tests/orchestra/',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    expect(tasks).toHaveLength(1);
    const scope = tasks[0]?.scope;
    expect(scope?.directories).toContain('src/orchestra/');
    expect(scope?.directories).toContain('tests/orchestra/');
    // The parser must NOT invent file entries — filesWrite stays empty so the
    // open-formulation fallback in buildScopeBlock kicks in at render time.
    expect(scope?.filesWrite).toEqual([]);
  });

  it('renders an open-formulation fallback when filesWrite is empty but directories are set', () => {
    const task = makeTask({
      scope: { directories: ['src/orchestra/', 'tests/orchestra/'], filesRead: [], filesWrite: [] },
    });
    const { prompt } = buildTaskPrompt(task, EMPTY_CTX);

    // Open formulation (Sprint 182 PQ-4): scope rules must explicitly state the
    // worker may write to ANY file inside the assigned directories — the bare
    // "(determined by your task scope)" sentinel is no longer acceptable when
    // directories ARE available.
    expect(prompt).toContain('no explicit Files list');
    expect(prompt).toContain('src/orchestra/');
    expect(prompt).toContain('tests/orchestra/');
    expect(prompt).not.toMatch(/^\s*- \(determined by your task scope\)\s*$/m);
  });
});
