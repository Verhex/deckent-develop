// TT555 (task 421-002) — TURN-ECONOMY-2: pipe-exit-mask + verify_task + env-probe
//
// Pins the four data-proven turn-waste fixes (trace-audit 555; 413-001/002/003):
//   (a) EXIT-CODE masking — a failing check piped to a pager reports the pager's
//       0. RED proves the masking with REAL shell semantics (`exit 7 | cat` → 0,
//       `exit 7` → 7); GREEN proves verify_task returns each step's honest,
//       SEPARATE exit code. (advisor: a self-authored 0-returning mock would be a
//       tautology, so the RED uses the real default runner.)
//   (b) verify-loop — resolveVerifyCommands maps the stack's own lint/test commands
//       so the worker never hand-types a stack-wrong command.
//   (c) artifact reuse — the prompt rule is present.
//   (d) env-probe — probeToolInventory + the opt-in prompt block.
//
// Prompt-pin discipline (nogo: "prompt-pin aşılırsa NO_GO"): PIPE_EXIT is ≤400
// chars; the env-probe block is OPT-IN (absent by default → the default prompt is
// byte-identical, so every existing prompt pin holds — verified by the sibling
// prompt-determinism / prompt-segmentation / prompt-turn-economy suites).

import { describe, it, expect } from 'vitest';
import {
  buildTaskPrompt,
  buildTaskPromptSegmented,
  buildEnvProbeBlock,
} from '../../src/orchestra/prompt-god-template.js';
import type { SprintContext } from '../../src/orchestra/prompt-god-template.js';
import { classifyTier } from '../../src/orchestra/prompt-segmentation.js';
import {
  verifyTask,
  runVerifyTask,
  resolveVerifyCommands,
  spawnCommandRunner,
  probeToolInventory,
  formatToolInventory,
  PROBED_TOOLS,
} from '../../src/orchestra/worker-verify-tool.js';
import type { CommandRunner } from '../../src/orchestra/worker-verify-tool.js';
import * as workerModule from '../../src/agents/worker.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

// ─── Test Helpers (mirror prompt-turn-economy.test.ts so the guards agree) ──

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '421-002',
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
    sprintId: 'sprint-421',
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
    effort: 'high',
    ...overrides,
  };
}

// Byte-exact mirrors of the module-private constants (same precedent as
// prompt-turn-economy.test.ts's TURN_ECONOMY_TEXT) — proves the COMPILED prompt
// carries the exact, unshortened text, and lets us pin PIPE_EXIT's size.
const PIPE_EXIT_TEXT = `## Pipe-Exit Honesty
A failing command piped to a pager (\`cmd | tail\`) reports the PIPE's exit code — the pager's 0 — so a real failure reads back as \`is_error:false\` and you burn a turn. NEVER pipe a check to \`tail\`/\`head\`. Read the TRUE code: bash \`\${PIPESTATUS[0]}\`, or run the command unpiped and read \`$?\` on the NEXT line, or call verify_task (separate check/test exit codes).`;

const ARTIFACT_REUSE_TEXT = `## Artifact Reuse
If a pack/build artifact already exists under \`.tasks/artifacts/<sprint>/\`, REUSE it — do not re-run \`npm pack\`/build to regenerate an artifact an earlier task in this sprint already produced.`;

// ─── (1) Pipe-Exit directive — composition, ordering, ≤400 size pin ─────────

describe('TT555 (a): Pipe-Exit Honesty directive', () => {
  it('renders the exact block verbatim in a code task prompt', () => {
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

  it('appears AFTER the Turn Economy directive (folded into the karpathy T0 segment)', () => {
    const { prompt } = buildTaskPrompt(makeTask(), makeCtx());
    const turnIdx = prompt.indexOf('## Turn Economy');
    const pipeIdx = prompt.indexOf('## Pipe-Exit Honesty');
    expect(turnIdx).toBeGreaterThan(-1);
    expect(pipeIdx).toBeGreaterThan(turnIdx);
  });

  it('stays ≤ 400 chars (anti-bloat pin — the K1 pipe-exit clamp)', () => {
    expect(PIPE_EXIT_TEXT.length).toBeLessThanOrEqual(400);
  });

  it('teaches the un-masked read patterns (PIPESTATUS / separate-line $? / verify_task)', () => {
    const { prompt } = buildTaskPrompt(makeTask(), makeCtx());
    expect(prompt).toMatch(/\$\{PIPESTATUS\[0\]\}/);
    expect(prompt).toMatch(/NEVER pipe a check to `tail`\/`head`/);
    expect(prompt).toMatch(/call verify_task/);
  });
});

// ─── (2) Artifact-reuse directive ───────────────────────────────────────────

describe('TT555 (c): Artifact Reuse directive', () => {
  it('renders verbatim in a code task prompt', () => {
    const { prompt } = buildTaskPrompt(makeTask({ type: 'code-development' }), makeCtx());
    expect(prompt).toContain(ARTIFACT_REUSE_TEXT);
  });

  it('renders verbatim in a doc-only task prompt (unconditional)', () => {
    const { prompt } = buildTaskPrompt(
      makeTask({ type: 'documentation', scope: { directories: ['scratch/'], filesRead: [], filesWrite: ['scratch/n.md'] } }),
      makeCtx(),
    );
    expect(prompt).toContain(ARTIFACT_REUSE_TEXT);
  });
});

// ─── (3) verify_task — honest, SEPARATE exit codes (RED → GREEN) ─────────────

describe('TT555 (a): verify_task exit-code honesty', () => {
  // RED — the waste-class, proven with REAL shell semantics (not a self-authored
  // mock). A trivial 2-command micro-probe: fast, hermetic (no project/gitignored
  // state, shell guaranteed on POSIX), skipped on win32 where `exit N | cat`
  // pipeline semantics differ. Cross-platform coverage is the injected-runner
  // GREEN cases below.
  it.skipIf(process.platform === 'win32')(
    'RED: a command piped to a pager MASKS the real exit code (is_error:false)',
    async () => {
      const masked = await spawnCommandRunner('exit 7 | cat', process.cwd());
      // The pipeline reports the pager's status (cat = 0) — the failure vanished.
      expect(masked.exitCode).toBe(0);

      const honest = await spawnCommandRunner('exit 7', process.cwd());
      // Unpiped, the SAME command surfaces its TRUE non-zero code.
      expect(honest.exitCode).toBe(7);
    },
  );

  it('GREEN: reports each step\'s TRUE, separately-captured exit code', async () => {
    const codes: Record<string, number> = { CHECK_CMD: 2, TEST_CMD: 1 };
    const runner: CommandRunner = (cmd) => ({ exitCode: codes[cmd] ?? 0, stdout: `ran ${cmd}`, stderr: '' });

    const r = await verifyTask({ commands: { check: 'CHECK_CMD', test: 'TEST_CMD' }, cwd: '/proj', runner });

    expect(r.ok).toBe(false);
    expect(r.steps).toHaveLength(2);
    expect(r.steps[0]).toMatchObject({ step: 'check', command: 'CHECK_CMD', exitCode: 2, ok: false, skipped: false });
    expect(r.steps[1]).toMatchObject({ step: 'test', command: 'TEST_CMD', exitCode: 1, ok: false, skipped: false });
  });

  it('a passing check never masks a failing test (separate codes, no short-circuit)', async () => {
    const runner: CommandRunner = (cmd) => ({ exitCode: cmd === 'T' ? 1 : 0, stdout: '', stderr: '' });
    const r = await verifyTask({ commands: { check: 'C', test: 'T' }, cwd: '/proj', runner });
    expect(r.steps[0]).toMatchObject({ step: 'check', exitCode: 0, ok: true });
    expect(r.steps[1]).toMatchObject({ step: 'test', exitCode: 1, ok: false });
    expect(r.ok).toBe(false);
  });

  it('all-pass → ok:true', async () => {
    const runner: CommandRunner = () => ({ exitCode: 0, stdout: '', stderr: '' });
    const r = await verifyTask({ commands: { check: 'C', test: 'T' }, cwd: '/proj', runner });
    expect(r.ok).toBe(true);
    expect(r.steps.every((s) => s.ok && !s.skipped)).toBe(true);
  });

  it('an empty command is reported as skipped (never guessed), not run', async () => {
    let called = 0;
    const runner: CommandRunner = () => { called++; return { exitCode: 5, stdout: '', stderr: '' }; };
    const r = await verifyTask({ commands: { check: '', test: 'T' }, cwd: '/proj', runner });
    expect(r.steps[0]).toMatchObject({ step: 'check', skipped: true, ok: true, exitCode: 0, command: '' });
    expect(r.steps[1]).toMatchObject({ step: 'test', skipped: false, exitCode: 5, ok: false });
    expect(called).toBe(1); // only the non-empty test command ran (the empty check was skipped)
    expect(r.ok).toBe(false); // the test command failed (skipped check did not mask it)
  });

  it('demonstrates the harm of masking: a pager-masked (always-0) runner false-greens', async () => {
    // This is exactly what `cmd | tail` does to the shell's exit status. verify_task
    // faithfully surfaces whatever the runner returns; its honesty therefore depends
    // on the runner NOT masking — which the DEFAULT (spawnCommandRunner) guarantees
    // by never piping (proven by the RED above).
    const maskingRunner: CommandRunner = () => ({ exitCode: 0, stdout: '', stderr: '' });
    const masked = await verifyTask({ commands: { check: 'FAILING', test: 'FAILING' }, cwd: '/proj', runner: maskingRunner });
    expect(masked.ok).toBe(true); // false-green — the bug when a pager swallows the code
  });
});

// ─── (4) resolveVerifyCommands — stack-config resolution (waste-class b) ─────

describe('TT555 (b): resolveVerifyCommands', () => {
  it('prefers typecheck, then lint, then build for the check step', () => {
    expect(resolveVerifyCommands('/p', () => ({ build: 'b', test: 't', lint: 'l', typecheck: 'tc' })))
      .toEqual({ check: 'tc', test: 't' });
    expect(resolveVerifyCommands('/p', () => ({ build: 'b', test: 't', lint: 'l', typecheck: '' })))
      .toEqual({ check: 'l', test: 't' });
    expect(resolveVerifyCommands('/p', () => ({ build: 'b', test: 't', lint: '', typecheck: '' })))
      .toEqual({ check: 'b', test: 't' });
  });

  it('honest-empty when the stack defines no commands (never guessed)', () => {
    expect(resolveVerifyCommands('/p', () => ({ build: '', test: '', lint: '', typecheck: '' })))
      .toEqual({ check: '', test: '' });
  });

  it('runVerifyTask composes resolve → run with both seams injected (hermetic)', async () => {
    const resolver = () => ({ build: '', test: 'RUN_TESTS', lint: 'LINT', typecheck: '' });
    const runner: CommandRunner = (cmd) => ({ exitCode: cmd === 'RUN_TESTS' ? 3 : 0, stdout: '', stderr: '' });
    const r = await runVerifyTask('/p', { resolver, runner });
    expect(r.steps[0]).toMatchObject({ step: 'check', command: 'LINT', exitCode: 0, ok: true });
    expect(r.steps[1]).toMatchObject({ step: 'test', command: 'RUN_TESTS', exitCode: 3, ok: false });
    expect(r.ok).toBe(false);
  });
});

// ─── (5) env-probe — inventory + opt-in prompt injection (waste-class d) ─────

describe('TT555 (d): env-probe inventory', () => {
  it('probeToolInventory reports each probed tool via the injected existence check', async () => {
    const inv = await probeToolInventory((t) => t === 'python3' || t === 'rg'); // docker absent
    expect(inv).toEqual({ python3: true, docker: false, rg: true });
  });

  it('formatToolInventory renders the stable one-line form', () => {
    expect(formatToolInventory({ python3: true, docker: false, rg: true }))
      .toBe('python3=yes docker=no rg=yes');
    expect(PROBED_TOOLS).toEqual(['python3', 'docker', 'rg']);
  });

  it('buildEnvProbeBlock is empty for a blank/absent inventory (default → no block)', () => {
    expect(buildEnvProbeBlock()).toBe('');
    expect(buildEnvProbeBlock('')).toBe('');
    expect(buildEnvProbeBlock('   ')).toBe('');
  });

  it('buildEnvProbeBlock renders the inventory line when present', () => {
    const block = buildEnvProbeBlock('python3=no docker=yes rg=yes');
    expect(block).toContain('Environment Tool Inventory');
    expect(block).toContain('python3=no docker=yes rg=yes');
  });
});

describe('TT555 (d): env-probe prompt injection', () => {
  it('is ABSENT by default (no toolInventory) → default prompt unchanged', () => {
    const { prompt } = buildTaskPrompt(makeTask(), makeCtx());
    expect(prompt).not.toContain('Environment Tool Inventory');
  });

  it('is injected after "## What To Do" when the caller supplies an inventory', () => {
    const { prompt } = buildTaskPrompt(makeTask(), makeCtx({ toolInventory: 'python3=no docker=yes rg=yes' }));
    expect(prompt).toContain('Environment Tool Inventory');
    expect(prompt).toContain('python3=no docker=yes rg=yes');
    expect(prompt.indexOf('Environment Tool Inventory')).toBeGreaterThan(prompt.indexOf('## What To Do'));
  });

  it('is a VOLATILE T2 segment — never poisons the shared T0/T1 cache prefix', () => {
    const { segments } = buildTaskPromptSegmented(
      makeTask(),
      makeCtx({ toolInventory: 'python3=yes docker=yes rg=yes' }),
    );
    const seg = segments.find((s) => s.kind === 'env-probe');
    expect(seg).toBeDefined();
    expect(seg!.tier).toBe('T2');
    // Tier tag agrees with the classifyTier SSOT (unregistered kind → T2 fallback),
    // so the segment-tier consistency guard (prompt-segmentation.test.ts) holds.
    expect(seg!.tier).toBe(classifyTier(seg!.kind));
  });
});

// ─── (6) worker.ts tool-surface re-export parity ────────────────────────────

describe('TT555: verify_task surface is re-exported from the worker module', () => {
  it('exposes the same verify_task / env-probe symbols through worker.ts', () => {
    expect(workerModule.verifyTask).toBe(verifyTask);
    expect(workerModule.resolveVerifyCommands).toBe(resolveVerifyCommands);
    expect(workerModule.runVerifyTask).toBe(runVerifyTask);
    expect(workerModule.probeToolInventory).toBe(probeToolInventory);
    expect(workerModule.formatToolInventory).toBe(formatToolInventory);
    expect(workerModule.spawnCommandRunner).toBe(spawnCommandRunner);
  });
});
