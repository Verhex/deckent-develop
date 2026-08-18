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
import { loadConfig } from '../../core/config.js';
import { bootstrapProviders } from '../../core/provider.js';
import type { ResolvedConfig } from '../../core/types.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import type { PlanPreview, RunFlowContext } from '../../core/run-flow-contract.js';
import {
  createRunFlowController as createRunFlowControllerImpl,
  type RunFlowController,
  type RunFlowControllerDeps,
} from '../repl/run-flow-controller.js';
import {
  formatTaskSummaryLine,
  formatDigestShort,
  buildPlanPreviewCardLabels,
  formatScopeGateLines,
  formatTopologyLines,
} from '../repl/plan-preview-card.js';
import { resolvePlanTimeoutMs } from '../../orchestra/planner.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../../core/provider-authority-composition.js';
import { preflightCliBrainProviderAuthority } from '../provider-authority-process-runtime.js';
import { RunFlowPlanServiceError } from '../../orchestra/run-flow-plan-service.js';

export interface DoCommandOptions {
  run?: boolean;
  /** TERM-6 (428-006) — non-interactive approval for the RunFlow path
   *  (terminal.run_flow_v2). Ignored on the flag-off golden-flow path. */
  yes?: boolean;
  /** Dogfood-449 B1 — forwarded to the detached child as `--force-scope` AND
   *  acknowledged in the front-door scope-gate mirror. RunFlow path only. */
  forceScope?: boolean;
  /** Explicit closed write allowlist. Natural-language scope is not authority. */
  writeAllowlist?: string[];
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
  /** Process-root provider authority injected by the CLI composition root. */
  providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
  confirm?: (question: string) => Promise<boolean>;
  spawnStart?: (root: string) => Promise<DoStartResult>;
  onEvent?: (event: GoldenFlowEvent) => void;
  /**
   * TERM-6 (428-006) — RunFlow compatibility-adapter seam, flag-on path only.
   * Mirrors run.tsx's `wireRunFlowMount(enabled, deps, controllerFactory)`
   * injectable-factory convention exactly. Defaults to the real
   * `createRunFlowController` (426/427 services this adapter delegates to —
   * never a second implementation). Tests inject a controller built from the
   * SAME real factory with a fake `spawnStart` baked in, so no detached
   * process ever spawns in a unit test.
   */
  createRunFlowController?: (deps: RunFlowControllerDeps) => RunFlowController;
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

// ═══ F-2 — planning heartbeat ═══════════════════════════════════════════════
//
// The propose/plan phase is a REAL LLM round-trip (run-proposal-compiler ->
// callZeroConfigPlanner) that can legitimately run for minutes. Before F-2 it
// produced ZERO output (and the spawnSync planner froze the event loop, so
// no ticker could even fire) — `deckent do` looked hung. The planner is async
// now; this heartbeat makes the wait visible and names the governing timeout.

/**
 * Elapsed-progress heartbeat for the planning phase. Writes to stderr (stdout
 * carries the preview/result). TTY: refreshes one line in place every 5s;
 * non-TTY (logs/CI): one full line every 30s. Returns a stop() that clears
 * the ticker and (on a TTY) erases the in-place line. `io` is injectable for
 * hermetic tests; defaults to the real stderr.
 */
export function startPlanningHeartbeat(
  lang: string,
  timeoutMs: number,
  io: { write: (s: string) => void; isTTY: boolean; now?: () => number } = {
    write: (s) => { process.stderr.write(s); },
    isTTY: process.stderr.isTTY === true,
  },
): () => void {
  const now = io.now ?? (() => Date.now());
  const startedAt = now();
  io.write(`${getMessage('do.planning_started', lang, { timeoutMin: String(Math.ceil(timeoutMs / 60_000)) })}\n`);
  const intervalMs = io.isTTY ? 5_000 : 30_000;
  const timer = setInterval(() => {
    const elapsed = Math.round((now() - startedAt) / 1000);
    const line = getMessage('do.planning_progress', lang, { elapsed: String(elapsed) });
    io.write(io.isTTY ? `\r\x1b[2K${line}` : `${line}\n`);
  }, intervalMs);
  timer.unref?.();
  return () => {
    clearInterval(timer);
    if (io.isTTY) io.write('\r\x1b[2K');
  };
}

// ═══ RunFlow compatibility-adapter (TERM-6, 428-006 — flag-on path only) ════
//
// terminal.run_flow_v2=true: `deckent do` delegates entirely to the 426/427
// RunFlow services (run-flow-controller.ts -> plan-preview-service.ts /
// run-proposal-compiler.ts -> run-job-service.ts / run-flow-store.ts) instead
// of golden-flow. The controller's own default `spawnStart` already builds a
// DETACHED `deckent start --flow-id ... --revision ... --plan-digest ...`
// invocation via spawnDetachedDeckent — so this path never swaps
// DIRECTIVES.md and never spawns a sync-stdio child (those organs die here,
// per the design doc's "Ölecek parçalar" table; they remain in the golden-flow
// branch below, byte-identical, for flag-off).
//
// All user-facing text below is composed from EXISTING messages.ts keys only
// (do.* + runFlow.*) — messages.ts is outside this task's write scope, so no
// new key can be added; i18n-FIRST is satisfied by reusing what already
// exists (several of these do.* keys were added by a prior task's docImpact
// but never wired to a real caller until now — see messages.ts's own
// 355-010 comment).

/** Plain-text rendering of a REAL RunFlow `PlanPreview` for the non-interactive
 *  CLI. Reuses plan-preview-card.tsx's PURE helpers/i18n labels (426/427
 *  services) — not a second implementation of the card's rendering rules. */
export function formatRunFlowDoPreview(preview: PlanPreview, run: boolean, lang: string): string {
  const labels = buildPlanPreviewCardLabels(lang);
  const lines: string[] = [
    getMessage(run ? 'do.preview_banner_run' : 'do.preview_banner_dry_run', lang, {
      count: String(preview.taskSummaries.length),
    }),
    '',
    labels.heading,
  ];
  if (preview.taskSummaries.length === 0) {
    lines.push(labels.noTasks);
  } else {
    preview.taskSummaries.forEach((task, index) => lines.push(formatTaskSummaryLine(index, task)));
  }
  lines.push('', labels.gateLabels[preview.gateResult], labels.policyLabels[preview.policyDecision]);
  // born-684: gate 'fail' ise NEDEN de basılır — onay-kararı kör verilmesin.
  if (preview.gateResult === 'fail' && preview.gateFindings?.length) {
    for (const finding of preview.gateFindings) lines.push(`  ! ${finding}`);
  }
  // Dogfood-449 B1 / 452-003: scope-gate aynası artık plan-preview-card.tsx'in
  // PAYLAŞILAN pure helper'ından geçer — CLI ve REPL kartı AYNI metni üretir
  // (CLI↔REPL parity; dry-run'da bile operatör --run'ın neden öleceğini görsün).
  lines.push(...formatScopeGateLines(preview, labels));
  lines.push(...formatTopologyLines(preview, labels));
  lines.push(`${labels.digestLabel} ${formatDigestShort(preview.planDigest)}`);
  return lines.join('\n');
}

/**
 * The flag-on trajectory: proposal-compile -> real preview -> non-interactive
 * approval (--yes required, else an honest reject — no interactive prompt
 * fallback) -> exact-snapshot start -> rich result. Every RunFlow call is
 * wrapped in one try/catch reporting via `runFlow.mount.error` — mirrors
 * app.tsx's `handleRunFlowApprove` catch-never-throw discipline (a CLI
 * command must not crash out of a controller error either).
 */
export async function runDoRunFlow(
  root: string,
  config: ResolvedConfig,
  goal: string,
  opts: { run: boolean; yes: boolean; forceScope?: boolean; writeAllowlist?: readonly string[] },
  deps: DoSeamDeps,
): Promise<void> {
  const lang = config.language;
  // born-680 (511-dogfood canlı-vakası): compiler'ın default planner'ı provider
  // ister — plan.ts/start.ts ile AYNI bootstrap-konvansiyonu, yoksa gerçek-binary
  // 'No providers registered' ile düşer (test-yolu planner'ı mock'lar, etkilenmez).
  await bootstrapProviders(config);
  const controllerFactory = deps.createRunFlowController ?? createRunFlowControllerImpl;
  const controller = controllerFactory({
    root, config, origin: 'cli',
    // Dogfood-449 B1: consent flows into the controller — gate-ayna acknowledge
    // + child'a `--force-scope` argv'si (bkz. RunFlowControllerDeps.forceScope).
    ...(opts.forceScope === true ? { forceScope: true } : {}),
    ...(opts.writeAllowlist !== undefined
      ? {
          writeScopePolicy: {
            mode: 'closed-allowlist' as const,
            filesWrite: opts.writeAllowlist,
          },
        }
      : {}),
  });

  let context: RunFlowContext;
  // F-2: the planning phase is a real LLM call — make the wait visible and
  // name the timeout that governs it (single source: resolvePlanTimeoutMs).
  const stopHeartbeat = startPlanningHeartbeat(
    lang,
    resolvePlanTimeoutMs(config as unknown as { brain_plan_timeout_ms?: number; ai_planner_timeout?: number }),
  );
  try {
    context = await controller.proposeRun(goal);
  } catch (error) {
    if (error instanceof RunFlowPlanServiceError && error.code === 'CLOSED_WRITE_SCOPE_HOLD') {
      const violations = Array.isArray(error.details.violations)
        ? error.details.violations
          .map(item => {
            if (!item || typeof item !== 'object') return String(item);
            const entry = item as { code?: unknown; path?: unknown; taskId?: unknown };
            return [entry.code, entry.path, entry.taskId].filter(Boolean).join(':');
          })
          .join(', ')
        : String(error.details.reason ?? error.code);
      printError(getMessage('do.closed_write_scope_blocked', lang, { violations }));
    } else {
      printError(getMessage('runFlow.mount.error', lang, {
        error: error instanceof Error ? error.message : String(error),
      }));
    }
    process.exitCode = 1;
    return;
  } finally {
    stopHeartbeat();
  }

  const preview = context.preview;
  if (!preview) {
    printError(getMessage('runFlow.mount.error', lang, {
      error: `unexpected RunFlow state after proposeRun: '${context.state}' (no preview)`,
    }));
    process.exitCode = 1;
    return;
  }

  print(formatRunFlowDoPreview(preview, opts.run, lang));

  if (!opts.run) {
    print(getMessage('do.dry_run_complete', lang));
    print(getMessage('do.dry_run_approve_hint', lang, {
      flowId: preview.flowId,
      command: `deckent runs ${preview.flowId} --approve --start`,
    }));
    return;
  }

  if (!opts.yes) {
    controller.reject('yes-required');
    print(getMessage('do.cancelled', lang, { stage: 'AWAITING_APPROVAL', reason: 'yes-required' }));
    return;
  }

  // born-698a: the detached child's PLAN phase is FAIL-CLOSED on prompt-gate
  // BLOCKs, so approving past a failed gate produced a "Run başlatıldı" message
  // followed by a silently-dead run (sprint-440/442 live cases — the death was
  // visible only in .deckent/recently-works/). The front door now makes the
  // SAME decision the child will make; --yes is consent, not a gate override.
  if (preview.topologyGateResult === 'fail') {
    controller.reject('topology-gate-block');
    printError(buildPlanPreviewCardLabels(lang).topologyBlockLabel);
    process.exitCode = 1;
    return;
  }

  // Dogfood-449 B1 — born-698a'nın scope-ikizi: child'ın PLAN fazı pre-spawn
  // scope-gate'inde de FAIL-CLOSED. Ön-kapı aynı kararı burada verir; çıkış
  // yolu artık var: `--force-scope` hem bu aynayı hem child'ı geçirir.
  if (preview.scopeGateResult === 'fail') {
    controller.reject('scope-gate-block');
    printError(getMessage('do.scope_gate_blocked', lang, {
      message: preview.scopeGateMessage ?? '',
    }));
    process.exitCode = 1;
    return;
  }

  if (preview.gateResult === 'fail') {
    controller.reject('prompt-gate-block');
    printError(getMessage('do.gate_blocked', lang, {
      count: String(preview.gateFindings?.length ?? 0),
    }));
    process.exitCode = 1;
    return;
  }

  try {
    controller.approve({ id: 'cli-non-interactive' });
    const finalCtx = controller.startApproved ? controller.startApproved() : controller.getContext();
    const jobId = finalCtx.handle?.jobId ?? preview.flowId;
    print(getMessage('runFlow.mount.started', lang, { jobId }));
  } catch (error) {
    printError(getMessage('runFlow.mount.error', lang, {
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exitCode = 1;
  }
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
    .description(getMessage('cli.do.desc', getLanguage(undefined)))
    .option('--run', 'Approve and start the sprint for real (default is a dry-run preview only)')
    .option('--yes', 'Non-interactive approval when RunFlow (terminal.run_flow_v2) is enabled — required together with --run to actually start; otherwise an honest reject (no interactive prompt)')
    .option('--force-scope', 'Bypass the pre-spawn scope gate (front-door mirror AND the detached child) — same consent as `deckent start --force-scope`')
    .option(
      '--write-allowlist <paths...>',
      getMessage('do.write_allowlist_option', 'en'),
    )
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
        const config = await loadConfig(root);
        if (opts.writeAllowlist !== undefined && config.terminal?.run_flow_v2 !== true) {
          printError(getMessage('do.write_allowlist_requires_run_flow', config.language));
          process.exitCode = 1;
          return;
        }

        // TERM-6 (428-006) — flag-on: delegate to the 426/427 RunFlow chain
        // instead of golden-flow. See runDoRunFlow's own doc comment for why
        // this is the ONLY flag check (mirrors start.ts's exact convention)
        // and structurally cannot fall through to the golden-flow branch below.
        if (config.terminal?.run_flow_v2 === true) {
          const admission = preflightCliBrainProviderAuthority(
            deps.providerAuthority,
            config,
            root,
            `cli-do:${process.pid}`,
          );
          if (admission.decision === 'hold') {
            printError(getMessage('run.provider_authority_hold', config.language, {
              reason: admission.reasonCode,
              evidence: admission.authorityEvidenceRefs.join(','),
            }));
            process.exitCode = 1;
            return;
          }
          await runDoRunFlow(root, config, trimmedGoal, {
            run,
            yes: !!opts.yes,
            forceScope: !!opts.forceScope,
            ...(opts.writeAllowlist !== undefined
              ? { writeAllowlist: opts.writeAllowlist }
              : {}),
          }, deps);
          return;
        }

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
