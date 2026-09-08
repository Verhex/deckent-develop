// ─── `deckent do "<goal>"` — canonical natural-language RunFlow ingress ─────
//
// Every posture uses the same canonical proposal -> exact plan -> durable
// approval chain. `terminal.run_flow_v2` selects interaction only: omitted/
// false preserves interactive foreground completion, while true preserves the
// non-interactive detached RunFlow surface.

import type { Command } from 'commander';
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
import { cliContractMessage, bindArgumentDescriptions } from '../helpers/message-catalog/cli-run.js';
import { principalToActor, resolveLocalOsPrincipal } from '../../core/principal.js';
import { bootstrapApprovalAuthority } from '../../core/approval-authority-bootstrap.js';
import { createLiveExactSprintExecutor } from '../helpers/exact-sprint-runtime.js';

export interface DoCommandOptions {
  run?: boolean;
  /** Non-interactive approval for the detached RunFlow posture. */
  yes?: boolean;
  /** Acknowledges intentional new write paths at the canonical scope gate. */
  forceScope?: boolean;
  /** Explicit closed write allowlist. Natural-language scope is not authority. */
  writeAllowlist?: string[];
}

export interface DoSeamDeps {
  /** Process-root provider authority injected by the CLI composition root. */
  providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
  confirm?: (question: string) => Promise<boolean>;
  /** Canonical RunFlow controller seam. */
  createRunFlowController?: (deps: RunFlowControllerDeps) => RunFlowController;
  /** Canonical live-runtime composition seam; tests inject a no-process executor. */
  createLiveExactSprintExecutor?: typeof createLiveExactSprintExecutor;
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

// ═══ Canonical RunFlow adapter ══════════════════════════════════════════════
//
// Every `deckent do` invocation delegates to the same RunFlow services
// (run-flow-controller.ts -> plan-preview-service.ts /
// run-proposal-compiler.ts -> run-job-service.ts / run-flow-store.ts).
// `terminal.run_flow_v2=true` preserves the non-interactive detached start;
// false/absent preserves interactive foreground completion through the shared
// canonical exact-sprint executor. Neither posture swaps DIRECTIVES.md or
// replans after approval.
//
// All user-facing text is resolved through messages.ts (`do.*` + `runFlow.*`).

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
 * Canonical trajectory for both interaction postures: proposal compilation,
 * exact preview, approval, and an exact-snapshot start. Detached mode requires
 * `--yes`; foreground mode obtains explicit interactive confirmation and
 * awaits durable terminal settlement. Controller/runtime failures become a
 * localized non-zero CLI result rather than escaping the command action.
 */
export async function runDoRunFlow(
  root: string,
  config: ResolvedConfig,
  goal: string,
  opts: { run: boolean; yes: boolean; forceScope?: boolean; writeAllowlist?: readonly string[] },
  deps: DoSeamDeps,
): Promise<void> {
  const lang = config.language;
  const detached = config.terminal?.run_flow_v2 === true;
  const actor = principalToActor(resolveLocalOsPrincipal('cli'));
  // born-680 (511-dogfood canlı-vakası): compiler'ın default planner'ı provider
  // ister — plan.ts/start.ts ile AYNI bootstrap-konvansiyonu, yoksa gerçek-binary
  // 'No providers registered' ile düşer (test-yolu planner'ı mock'lar, etkilenmez).
  await bootstrapProviders(config);
  const controllerFactory = deps.createRunFlowController ?? createRunFlowControllerImpl;
  const controller = controllerFactory({
    root, config, origin: 'cli', actor,
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

  if (detached && !opts.yes) {
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
    if (!detached) {
      const confirm = deps.confirm ?? ((question: string) => promptConfirm(question, false));
      if (!await confirm(getMessage('do.confirm_start', lang))) {
        controller.reject('operator-declined');
        print(getMessage('do.cancelled', lang, {
          stage: 'AWAITING_APPROVAL', reason: 'operator-declined',
        }));
        return;
      }
    }

    const approved = controller.approve(actor);
    if (detached) {
      const finalCtx = controller.startApproved ? controller.startApproved() : controller.getContext();
      const jobId = finalCtx.handle?.jobId ?? preview.flowId;
      print(getMessage('runFlow.mount.started', lang, { jobId }));
      return;
    }

    const snapshot = approved.approvedSnapshot;
    if (!snapshot) throw new Error('run-flow-controller: approval did not produce an exact snapshot');
    const approvalAuthority = bootstrapApprovalAuthority(root, config);
    try {
      const executorFactory = deps.createLiveExactSprintExecutor ?? createLiveExactSprintExecutor;
      const outcome = await executorFactory({
        ...(deps.providerAuthority ? { providerAuthority: deps.providerAuthority } : {}),
        approvalAuthority,
      }).execute({
        projectRoot: root,
        config,
        source: {
          kind: 'exact-ref',
          ref: {
            schemaVersion: 1,
            flowId: snapshot.flowId,
            revision: snapshot.revision,
            planDigest: snapshot.planDigest,
          },
          ingress: { kind: 'do', id: `cli:do:${snapshot.flowId}`, intent: goal },
        },
        lineage: {
          tenantId: approved.proposal?.tenant ?? 'local',
          actor,
          origin: 'cli',
          correlationId: snapshot.flowId,
          idempotencyKey: `do:${snapshot.flowId}:r${snapshot.revision}:foreground`,
          sourceId: 'cli:do',
          authorization: { kind: 'approved-actor' },
        },
        executionMode: 'in-process',
      });

      if (outcome.status === 'settled') {
        print(getMessage('do.exact_settled', lang, {
          state: outcome.settlement.state, reason: outcome.settlement.code,
        }));
        if (outcome.settlement.state !== 'COMPLETED') process.exitCode = 1;
        return;
      }
      if (outcome.status === 'duplicate' && outcome.attempt.settlement) {
        print(getMessage('do.exact_settled', lang, {
          state: outcome.attempt.settlement.state,
          reason: outcome.attempt.settlement.code,
        }));
        if (outcome.attempt.settlement.state !== 'COMPLETED') process.exitCode = 1;
        return;
      }
      const reason = outcome.status === 'duplicate'
        ? 'EXACT_SPRINT_DUPLICATE_RECONCILIATION_REQUIRED'
        : outcome.status === 'accepted'
          ? 'EXACT_SPRINT_NOT_TERMINAL'
          : outcome.reasonCode;
      printError(getMessage('do.exact_not_completed', lang, {
        status: outcome.status, reason,
      }));
      process.exitCode = 1;
    } finally {
      if (approvalAuthority.state === 'ready') approvalAuthority.runtime.close();
    }
  } catch (error) {
    printError(getMessage('runFlow.mount.error', lang, {
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exitCode = 1;
  }
}

// ═══ Command registration ════════════════════════════════════════════════

export function registerDo(program: Command, deps: DoSeamDeps = {}): void {
  const helpLang = getLanguage(undefined);
  bindArgumentDescriptions(program.command('do <goal>'), helpLang, { goal: 'cliContract.do.arg.goal' })
    .description(getMessage('cli.do.desc', getLanguage(undefined)))
    .option('--run', cliContractMessage('cliContract.do.opt.run', helpLang))
    .option('--yes', cliContractMessage('cliContract.do.opt.yes', helpLang))
    .option('--force-scope', cliContractMessage('cliContract.do.opt.force_scope', helpLang))
    .option(
      '--write-allowlist <paths...>',
      getMessage('do.write_allowlist_option', helpLang),
    )
    .action(async (goal: string, opts: DoCommandOptions) => {
      const trimmedGoal = goal.trim();
      if (!trimmedGoal) {
        printError(getMessage('do.empty_goal', helpLang));
        process.exitCode = 1;
        return;
      }

      const run = !!opts.run;
      try {
        const root = resolveProjectRoot();
        const config = await loadConfig(root);
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
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });
}
