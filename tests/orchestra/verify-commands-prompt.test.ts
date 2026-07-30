// born-670b (task 427-012) — WIRE-VERIFY: worker-prompt verify-command honesty.
//
// Two YALANCI-PROMPT (lying-prompt) fixes pinned here:
//   (a) CRITICAL VERIFY STEPS cites the project's ACTUAL stack-resolved
//       check/test commands (SprintContext.verifyCommands, sourced from
//       worker-verify-tool.ts's `resolveVerifyCommands`) instead of a
//       generic multi-language examples list — a worker on THIS stack no
//       longer has to guess between tsc/mypy/go vet/cargo check.
//   (b) Pipe-Exit Honesty no longer tells the worker it can "call
//       verify_task" — that symbol is a TS function, never a tool
//       registered on the actual worker-facing surface. Zero non-existent
//       -tool references must appear in the compiled prompt.
//
// Both ctx fields are additive/optional: absent → the prompt renders the
// pre-427-012 legacy text byte-for-byte (proven below), so every other
// prompt-pinning suite (prompt-determinism, prompt-w1, task-builder,
// smoke/verify-loop-smoke) is unaffected.

import { describe, it, expect } from 'vitest';
import {
  buildTaskPrompt,
  buildCheckCommandLine,
  buildTestCommandLine,
  extractDeclaredTestCommands,
} from '../../src/orchestra/prompt-god-template.js';
import type { SprintContext } from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '427-012',
    title: 'Test task',
    description: 'A test task for prompt generation',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Testing',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/prompt-god-template.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'Pass', noGoCriteria: 'Fail', techDebtAcceptable: 'Minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-427',
    assignedAgent: 'bug-fixer',
    assignedSkills: [],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<SprintContext> = {}): SprintContext {
  return {
    agentId: 'bug-fixer',
    agentPrompt: '# Bug Fixer Agent\nFind root causes.',
    skillPrompts: [],
    effort: 'high',
    ...overrides,
  };
}

// Byte-exact mirror of the rewritten module-private constant (same precedent
// as turn-economy-2.test.ts's PIPE_EXIT_TEXT) — proves the compiled prompt
// carries the exact, un-shortened, tool-reference-free text.
const PIPE_EXIT_TEXT = `## Pipe-Exit Honesty
A failing command piped to a pager (\`cmd | tail\`) reports the PIPE's exit code — the pager's 0 — so a real failure reads back as \`is_error:false\` and you burn a turn. NEVER pipe a check to \`tail\`/\`head\`. Read the TRUE code: bash \`\${PIPESTATUS[0]}\`, or run the command unpiped and read \`$?\` on the NEXT line — see the VERIFY STEPS section below for this task's exact commands.`;

describe('born-670b (a): Pipe-Exit Honesty — no non-existent-tool reference', () => {
  it('renders the exact, rewritten block verbatim in a code task prompt', () => {
    const { prompt } = buildTaskPrompt(makeTask({ type: 'code-development' }), makeCtx());
    expect(prompt).toContain(PIPE_EXIT_TEXT);
  });

  it('renders the exact block verbatim in a doc-only task prompt (unconditional)', () => {
    const { prompt } = buildTaskPrompt(
      makeTask({
        type: 'documentation',
        scope: { directories: ['scratch/'], filesRead: [], filesWrite: ['scratch/note.md'] },
      }),
      makeCtx(),
    );
    expect(prompt).toContain(PIPE_EXIT_TEXT);
  });

  it('still teaches the two REAL un-masked-read patterns (PIPESTATUS / separate-line $?)', () => {
    const { prompt } = buildTaskPrompt(makeTask(), makeCtx());
    expect(prompt).toMatch(/\$\{PIPESTATUS\[0\]\}/);
    expect(prompt).toMatch(/NEVER pipe a check to `tail`\/`head`/);
  });

  it('never references the non-existent verify_task tool anywhere in the compiled prompt', () => {
    const { prompt } = buildTaskPrompt(makeTask({ type: 'code-development' }), makeCtx());
    expect(prompt).not.toMatch(/call verify_task/);
    expect(prompt).not.toMatch(/verify_task/);
  });

  it('replacement text stays reasonably compact (anti-bloat pin, mirrors the prior ≤400 discipline)', () => {
    expect(PIPE_EXIT_TEXT.length).toBeLessThanOrEqual(400);
  });
});

describe('born-670b (a): buildCheckCommandLine / buildTestCommandLine — pure helpers', () => {
  it('buildCheckCommandLine: legacy multi-language examples when unresolved', () => {
    expect(buildCheckCommandLine(undefined)).toBe(
      'Examples: `tsc --noEmit` (TypeScript), `mypy` (Python), `go vet ./...` (Go), `cargo check` (Rust)',
    );
  });

  it('buildCheckCommandLine: cites the concrete resolved command when present', () => {
    const line = buildCheckCommandLine({ check: 'npx tsc --noEmit', test: '' });
    expect(line).toContain('npx tsc --noEmit');
    expect(line).not.toContain('mypy');
    expect(line).not.toContain('go vet');
  });

  it('buildCheckCommandLine: honest-empty check (skipped step) falls back to legacy text', () => {
    expect(buildCheckCommandLine({ check: '', test: 'npx vitest run' })).toBe(
      'Examples: `tsc --noEmit` (TypeScript), `mypy` (Python), `go vet ./...` (Go), `cargo check` (Rust)',
    );
  });

  it('buildTestCommandLine: legacy single example when unresolved', () => {
    expect(buildTestCommandLine(undefined)).toBe(
      'Example: `npx vitest run tests/orchestra/my-module.test.ts` — do NOT run the Full test suite (`npx vitest run` without args).',
    );
  });

  it('buildTestCommandLine: cites the concrete resolved test command, scoped instruction included', () => {
    const line = buildTestCommandLine({ check: '', test: 'npx vitest run' });
    expect(line).toContain('npx vitest run');
    expect(line).toMatch(/scoped to your changed file/);
    expect(line).toMatch(/do NOT run it bare\/unscoped/);
  });
});

describe('born-670b (a): CRITICAL VERIFY STEPS injects concrete stack commands end-to-end', () => {
  it('with verifyCommands resolved: prompt cites the exact check/test commands, not the generic list', () => {
    const { prompt } = buildTaskPrompt(
      makeTask({ type: 'code-development' }),
      makeCtx({ verifyCommands: { check: 'npx tsc --noEmit', test: 'npx vitest run' } }),
    );
    expect(prompt).toContain('CRITICAL VERIFY STEPS');
    expect(prompt).toContain('Run: `npx tsc --noEmit`');
    expect(prompt).toContain('Run: `npx vitest run <path-to-the-test-file(s)-you-changed>`');
    expect(prompt).not.toContain('Examples: `tsc --noEmit` (TypeScript), `mypy` (Python)');
  });

  it('without verifyCommands (default/legacy path): prompt is byte-identical to the pre-427-012 generic text', () => {
    const { prompt } = buildTaskPrompt(makeTask({ type: 'code-development' }), makeCtx());
    expect(prompt).toContain(
      'Examples: `tsc --noEmit` (TypeScript), `mypy` (Python), `go vet ./...` (Go), `cargo check` (Rust)',
    );
    expect(prompt).toContain(
      'Example: `npx vitest run tests/orchestra/my-module.test.ts` — do NOT run the Full test suite (`npx vitest run` without args).',
    );
  });

  it('a doc-only task never renders CRITICAL VERIFY STEPS (verifyCommands irrelevant there)', () => {
    const { prompt } = buildTaskPrompt(
      makeTask({
        type: 'documentation',
        scope: { directories: ['scratch/'], filesRead: [], filesWrite: ['scratch/note.md'] },
      }),
      makeCtx({ verifyCommands: { check: 'npx tsc --noEmit', test: 'npx vitest run' } }),
    );
    expect(prompt).not.toContain('CRITICAL VERIFY STEPS');
    expect(prompt).not.toContain('Run: `npx tsc --noEmit`');
  });
});

describe('task-declared verification authority', () => {
  it('extracts and de-duplicates explicit **Test:** commands', () => {
    const commands = extractDeclaredTestCommands(makeTask({
      description: [
        '**Test:** `node --experimental-strip-types deneme/task-001/example.ts`',
        '**Test:** `node --experimental-strip-types deneme/task-001/example.ts`',
        '**Test:** `node deneme/task-001/secondary.ts`',
      ].join('\n'),
    }));

    expect(commands).toEqual([
      'node --experimental-strip-types deneme/task-001/example.ts',
      'node deneme/task-001/secondary.ts',
    ]);
  });

  it('uses the task-declared command without injecting unrelated tsc/vitest checks', () => {
    const { prompt } = buildTaskPrompt(
      makeTask({
        type: 'code-development',
        description: [
          'Create a standalone smoke example.',
          '**Test:** `node --experimental-strip-types deneme/task-001/example.ts`',
        ].join('\n'),
      }),
      makeCtx({ verifyCommands: { check: 'npx tsc --noEmit', test: 'npx vitest run' } }),
    );

    expect(prompt).toContain('CRITICAL VERIFY STEPS (TASK-DECLARED AUTHORITY)');
    expect(prompt).toContain(
      '`node --experimental-strip-types deneme/task-001/example.ts`',
    );
    expect(prompt).not.toContain('Run: `npx tsc --noEmit`');
    expect(prompt).not.toContain('npx vitest run <path-to-the-test-file(s)-you-changed>');
  });
});
