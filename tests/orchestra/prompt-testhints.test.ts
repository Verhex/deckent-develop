import { describe, it, expect } from 'vitest';
import { buildTaskPrompt, buildExitPathTestHint } from '../../src/orchestra/prompt-god-template.js';
import type { SprintContext } from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

// ─── Test Helpers ──────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '349-005',
    title: 'Test task',
    description: 'A test task for prompt generation',
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
    sprintId: 'sprint-349',
    assignedAgent: 'architect',
    assignedSkills: ['typescript-expert'],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<SprintContext> = {}): SprintContext {
  return {
    agentId: 'architect',
    agentPrompt: '# Architect Agent\nYou are a system architect.',
    skillPrompts: [
      { name: 'typescript-expert', content: '# TypeScript Expert\nUse strict mode.' },
    ],
    allAdrs: [],
    effort: 'high',
    ...overrides,
  };
}

// ─── buildExitPathTestHint — pure unit tests ───────────────────────────

describe('buildExitPathTestHint', () => {
  it('returns empty string when no exit-path signal is present', () => {
    expect(buildExitPathTestHint(makeTask())).toBe('');
  });

  it.each([
    ['process.exit', 'Fix process.exit(1) call site'],
    ['process.kill', 'Guard process.kill(pid, signal)'],
    ['SIGTERM', 'Handle SIGTERM gracefully'],
    ['SIGKILL', 'Escalate to SIGKILL after timeout'],
    ['SIGINT', 'Trap SIGINT for cleanup'],
    ['formatFatalAndExit', 'Refactor formatFatalAndExit helper'],
    ['fatal handler', 'Add a fatal handler for uncaught errors'],
    ['exit code', 'Assert the exit code is 1'],
  ])('matches trigger %s in the title', (_label, title) => {
    const hint = buildExitPathTestHint(makeTask({ title }));
    expect(hint).not.toBe('');
    expect(hint).toContain('process.exit');
    expect(hint).toContain("vi.spyOn(process, 'exit')");
  });

  it('matches when the signal is only in the description', () => {
    const hint = buildExitPathTestHint(
      makeTask({ title: 'Refactor exit path', description: 'Uses process.exit under the hood.' }),
    );
    expect(hint).not.toBe('');
  });

  it('matches when the signal is only in goCriteria', () => {
    const hint = buildExitPathTestHint(
      makeTask({ goNogo: { goCriteria: 'process.exit is called with code 1', noGoCriteria: 'Fail', techDebtAcceptable: 'x' } }),
    );
    expect(hint).not.toBe('');
  });

  it('is case-insensitive', () => {
    const hint = buildExitPathTestHint(makeTask({ title: 'Handle PROCESS.EXIT correctly' }));
    expect(hint).not.toBe('');
  });

  it('returns exactly one line (no embedded newline in the hint body)', () => {
    const hint = buildExitPathTestHint(makeTask({ title: 'process.exit cleanup' }));
    // The hint is prefixed with its own leading newline (splice contract); strip
    // it and confirm the remaining hint body itself is a single line.
    expect(hint.startsWith('\n')).toBe(true);
    expect(hint.slice(1)).not.toContain('\n');
  });

  it('does not mutate byte-identity for a non-matching task across repeated calls', () => {
    const task = makeTask();
    expect(buildExitPathTestHint(task)).toBe(buildExitPathTestHint(task));
    expect(buildExitPathTestHint(task)).toBe('');
  });
});

// ─── PCOMP-W8 — end-to-end prompt wiring ───────────────────────────────

describe('PCOMP-W8: exit-path hint wiring into buildTaskPrompt', () => {
  it('an exit-path task prompt contains the hint line exactly once', () => {
    const task = makeTask({
      title: 'Fix formatFatalAndExit',
      description: 'process.exit(1) is called without flushing stdout first; add SIGTERM handling too.',
    });
    const { prompt } = buildTaskPrompt(task, makeCtx());

    const occurrences = prompt.split('Exit-path test hint:').length - 1;
    expect(occurrences).toBe(1);
    expect(prompt).toContain("vi.spyOn(process, 'exit').mockImplementation(...)");
  });

  it('a non-matching task prompt is byte-identical to the pre-hint baseline shape (no hint text present)', () => {
    const task = makeTask();
    const { prompt } = buildTaskPrompt(task, makeCtx());
    expect(prompt).not.toContain('Exit-path test hint');
  });

  it('two renders of the same non-matching task are byte-for-byte identical (determinism preserved)', () => {
    const task = makeTask();
    const ctx = makeCtx();
    const r1 = buildTaskPrompt(task, ctx);
    const r2 = buildTaskPrompt(task, ctx);
    expect(r1.prompt).toBe(r2.prompt);
  });

  it('a doc-only task with exit-path wording does NOT get the hint (no test-mocking guidance on the doc verify path)', () => {
    const task = makeTask({
      title: 'Document process.exit behavior',
      description: 'Create docs/cookbook/exit-codes.md explaining process.exit usage.',
      scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/cookbook/exit-codes.md'] },
      assignedAgent: 'doc-writer',
    });
    const { prompt } = buildTaskPrompt(task, makeCtx({ agentId: 'doc-writer' }));

    expect(prompt).toContain('doc-only task — DO NOT run the test suite');
    expect(prompt).not.toContain('Exit-path test hint');
  });
});
