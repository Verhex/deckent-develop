import { describe, it, expect } from 'vitest';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Task } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-001',
    title: 'Test',
    description: 'Test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Verify loop smoke test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: {
      goCriteria: 'All tests pass',
      noGoCriteria: 'Tests fail',
      techDebtAcceptable: 'None',
    },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-test',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Worker Verify Loop Smoke Tests ─────────────────────────────────────────

describe('Worker Verify Loop — buildWorkerPrompt smoke tests', () => {
  const task = makeTask();
  const prompt = buildWorkerPrompt(task);

  it('prompt contains tsc --noEmit command', () => {
    expect(prompt).toContain('tsc --noEmit');
  });

  it('prompt contains npx vitest run command', () => {
    expect(prompt).toContain('npx vitest run');
  });

  it('prompt contains CRITICAL VERIFY STEPS section', () => {
    expect(prompt).toContain('CRITICAL VERIFY STEPS');
  });

  it('prompt does NOT contain old "run the project lint command" text', () => {
    expect(prompt).not.toContain('run the project lint command');
  });
});
