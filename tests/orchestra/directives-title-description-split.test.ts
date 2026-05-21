/**
 * Sprint 182 PQ-4 (F6) — DIRECTIVES `## Task N: <title>` / `### Description`
 * parsing split + render-template paragraph separation.
 *
 * Coverage:
 *   1. parseStructuredDirectives: when `### Description` heading exists,
 *      description = content after the heading (title-line + metadata not duplicated).
 *   2. renderTemplate: rendered prompt places title on its own line, description
 *      in a separate paragraph — the legacy " — " (em-dash) separator is gone.
 *   3. Markdown structure in description (bold, lists) survives rendering.
 */

import { describe, it, expect } from 'vitest';
import { parseStructuredDirectives } from '../../src/orchestra/task-builder.js';
import { buildTaskPrompt, type SprintContext } from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '182-010',
    title: 'F6 fixture title',
    description: 'F6 fixture description',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: [] },
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

describe('F6 — DIRECTIVES title vs ### Description split', () => {
  it('extracts description from after `### Description` (skips title + metadata lines)', () => {
    const content = [
      '## Task 1: Real task title',
      '- Model: opus',
      '- Effort: normal',
      '- Files: src/foo/bar.ts',
      '- Scope: src/foo/',
      '',
      '### Description',
      'This is the actual description content.',
      'It spans multiple lines and explains the work.',
    ].join('\n');

    const tasks = parseStructuredDirectives(content);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toBe('Real task title');

    const desc = tasks[0]?.description ?? '';
    expect(desc).toContain('This is the actual description content.');
    expect(desc).toContain('It spans multiple lines and explains the work.');
    // Metadata + title line must NOT bleed into description.
    expect(desc).not.toContain('Real task title');
    expect(desc).not.toMatch(/^-\s*Model:/m);
    expect(desc).not.toMatch(/^-\s*Files:/m);
  });

  it('renders title and description on separate lines (no " — " concatenation)', () => {
    const task = makeTask({
      id: '182-010',
      title: 'Render F6 title',
      description: 'Render F6 description body',
    });

    const { prompt } = buildTaskPrompt(task, EMPTY_CTX);

    // Legacy form was `${id}: ${title} — ${description}`. The em-dash join
    // between title and description must NOT appear anywhere in the prompt.
    expect(prompt).not.toContain('Render F6 title — Render F6 description body');
    // Title line itself appears as `${id}: ${title}` standalone.
    expect(prompt).toMatch(/##\s+Your Task\s*\n182-010:\s*Render F6 title\s*\n/);
    // Description body sits in its own paragraph below the title (blank line first).
    expect(prompt).toMatch(/Render F6 title\s*\n\s*\n.*Render F6 description body/s);
  });

  it('preserves markdown structure (lists, bold) in description', () => {
    const markdownDesc = [
      'This task has **bold emphasis** and lists:',
      '',
      '- item one',
      '- item two',
      '',
      'Plus a closing paragraph.',
    ].join('\n');

    const task = makeTask({
      title: 'Markdown task',
      description: markdownDesc,
    });

    const { prompt } = buildTaskPrompt(task, EMPTY_CTX);

    // Bold marker preserved
    expect(prompt).toContain('**bold emphasis**');
    // Both list items preserved on their own lines
    expect(prompt).toMatch(/-\s+item one/);
    expect(prompt).toMatch(/-\s+item two/);
    // Trailing paragraph preserved
    expect(prompt).toContain('Plus a closing paragraph.');
    // List items survive on consecutive lines — the legacy " — " join would
    // have collapsed them with an em-dash between, so guard against that
    // specific collapse pattern.
    expect(prompt).toMatch(/- item one\n-\s+item two/);
    expect(prompt).not.toMatch(/- item one\s*—\s*-?\s*item two/);
  });
});
