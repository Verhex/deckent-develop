// ─── `deckent do "<goal>"` — golden-flow, dressed as a command (GOLDENFLOW-CMD,
// Sprint 355 Task 355-010) ───────────────────────────────────────────────────
//
// Wraps the READ-ONLY golden-flow orchestrator (orchestra/golden-flow.ts) —
// itself untouched by this task — in a real CLI command. Both the default
// (dry-run) and `--run` paths go through the SAME `runGoldenFlow` call; the
// only difference is what the `approvePlan` seam does after printing the plan
// preview. In dry-run mode it always returns `false`, so golden-flow's own
// cancel-on-reject contract guarantees `startSprint`/`evaluateSprint` are
// NEVER invoked — "does not start" is a structural guarantee, not a hand-rolled
// early return.
//
// `deriveIntent` reuses plan-nl.ts's `buildPlanNlIntent` (deterministic
// goal→single-task template, no LLM call) — the same boundary plan-nl.ts and
// golden-flow.ts already draw: real NL→multi-task understanding is an
// explicit follow-up ("LLM layer"), not this task's concern.
//
// `startSprint` (reachable only under `--run` after the user confirms)
// connects to the EXISTING, unmodified `runSprint` path by spawning
// `dist/cli/entry.js start` as a subprocess — the same self-spawn pattern
// used by gateway.ts / chat-tool-bridge.ts. Before spawning, DIRECTIVES.md is
// swapped (in-memory capture, no stray `.bak.*` file) to hold exactly the
// markdown the user approved, so the executed plan can never drift from the
// previewed one; the original content (or absence) is restored in a
// `finally` once the spawned sprint exits.

import type { Command } from 'commander';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runGoldenFlow,
  type GoldenFlowSeams,
  type GoldenFlowPlanPreview,
  type GoldenFlowResult,
  type GoldenFlowEvent,
} from '../../orchestra/golden-flow.js';
import { buildPlanNlIntent } from './plan-nl.js';
import { DIRECTIVES_FILE } from '../../core/constants.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';
import { promptConfirm } from '../helpers/prompt.js';

export interface DoCommandOptions {
  run?: boolean;
}

/** Outcome of spawning `deckent start` for real. */
export interface DoStartResult {
  exitCode: number;
}

export interface DoEvaluateResult {
  success: boolean;
  exitCode: number;
}

/** The only two real-world-effectful seams — injectable for hermetic tests; default to the real thing. */
export interface DoSeamDeps {
  confirm?: (question: string) => Promise<boolean>;
  spawnStart?: (root: string) => Promise<DoStartResult>;
  onEvent?: (event: GoldenFlowEvent) => void;
}

// ═══ Plan-preview formatting ═══════════════════════════════════════════════

/** Renders the plan preview + an explicit "what will happen" task list. Pure — no I/O. */
export function formatDoPlanPreview(preview: GoldenFlowPlanPreview, run: boolean): string {
  const lines: string[] = [];
  lines.push(
    run
      ? `Deckent Do — plan preview (${preview.taskCount} task(s)). Confirm below to start the run now.`
      : `Deckent Do — plan preview (dry-run; ${preview.taskCount} task(s)). Nothing was started. Re-run with --run to execute.`,
  );
  lines.push('');
  lines.push('What will happen:');
  preview.tasks.forEach((task, idx) => {
    lines.push(`  ${idx + 1}. ${task.title}`);
    lines.push(`     files: ${task.files.join(', ')}`);
    lines.push(`     scope: ${task.scope.join(', ')}`);
    lines.push(`     goCriteria: ${task.goCriteria.join('; ')}`);
  });
  lines.push('');
  lines.push(preview.directivesMarkdown);
  return lines.join('\n');
}

// ═══ DIRECTIVES.md transient swap (restored after the spawned sprint exits) ═

interface DirectivesSwapState {
  hadFile: boolean;
  originalContent: string | null;
}

function swapDirectives(root: string, markdown: string): DirectivesSwapState {
  const path = join(root, DIRECTIVES_FILE);
  const hadFile = existsSync(path);
  const originalContent = hadFile ? readFileSync(path, 'utf-8') : null;
  writeFileSync(path, markdown, 'utf-8');
  return { hadFile, originalContent };
}

function restoreDirectives(root: string, state: DirectivesSwapState): void {
  const path = join(root, DIRECTIVES_FILE);
  if (state.hadFile && state.originalContent !== null) {
    writeFileSync(path, state.originalContent, 'utf-8');
  } else if (!state.hadFile && existsSync(path)) {
    unlinkSync(path);
  }
}

// ═══ Real start-seam (spawns the existing `deckent start` → runSprint path) ═

function entryPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'entry.js');
}

/** Spawns `dist/cli/entry.js start` for real — no kill-timeout (a sprint can run long). */
export function defaultSpawnStart(root: string): Promise<DoStartResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entryPath(), 'start'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env },
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ exitCode: code ?? 0 }));
  });
}

// ═══ Seam assembly ═══════════════════════════════════════════════════════

/**
 * Builds the golden-flow seam bag for `deckent do`. `deriveIntent` and
 * `evaluateSprint` are pure/deterministic; `approvePlan`/`startSprint` are the
 * effectful seams — `deps` lets tests replace the two real-world-effectful
 * primitives (`confirm`, `spawnStart`) without touching golden-flow itself.
 */
export function createDoSeams(
  root: string,
  opts: { run: boolean },
  deps: DoSeamDeps = {},
): GoldenFlowSeams<DoStartResult, DoEvaluateResult> {
  const confirm = deps.confirm ?? ((question: string) => promptConfirm(question, false));
  const spawnStart = deps.spawnStart ?? defaultSpawnStart;

  return {
    deriveIntent: (goal: string) => buildPlanNlIntent(goal),
    approvePlan: async (preview: GoldenFlowPlanPreview) => {
      print(formatDoPlanPreview(preview, opts.run));
      if (!opts.run) return false; // dry-run: preview-only, never reaches startSprint
      return confirm('Proceed and start this run now?');
    },
    startSprint: async (preview: GoldenFlowPlanPreview) => {
      const state = swapDirectives(root, preview.directivesMarkdown);
      try {
        return await spawnStart(root);
      } finally {
        restoreDirectives(root, state);
      }
    },
    evaluateSprint: (start: DoStartResult) => ({ success: start.exitCode === 0, exitCode: start.exitCode }),
    onEvent: deps.onEvent,
  };
}

// ═══ Command registration ════════════════════════════════════════════════

export function registerDo(program: Command, deps: DoSeamDeps = {}): void {
  program
    .command('do <goal>')
    .description('Golden-flow: turn a goal into a sprint plan (dry-run preview by default; --run to actually start it)')
    .option('--run', 'Approve and start the sprint for real (default is a dry-run preview only)')
    .action(async (goal: string, opts: DoCommandOptions) => {
      const trimmedGoal = goal.trim();
      if (!trimmedGoal) {
        printError('do: goal must not be empty');
        process.exitCode = 1;
        return;
      }

      const run = !!opts.run;
      try {
        const root = resolveProjectRoot();
        const seams = createDoSeams(root, { run }, deps);
        const result: GoldenFlowResult<DoStartResult, DoEvaluateResult> = await runGoldenFlow(trimmedGoal, seams);

        if (result.status === 'cancelled') {
          if (!run) {
            print('Dry-run complete — nothing was started. Re-run with --run to execute this plan.');
          } else {
            print(`Cancelled at stage "${result.stage}" (${result.reason}). Nothing was started.`);
          }
          return;
        }

        print(`Sprint finished — exitCode ${result.evaluate.exitCode} (${result.evaluate.success ? 'success' : 'failure'}).`);
        if (!result.evaluate.success) process.exitCode = 1;
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });
}
