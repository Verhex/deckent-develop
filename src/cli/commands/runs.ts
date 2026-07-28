// ═══ deckent runs — CLI run-flow inbox + operator stale-run sweep (F-3) ══════
//
// CLI-side parity for the REPL's `/runs` inbox (same collect + render, one
// source of truth: run-flow-inbox.ts). Plus the operator sweep the pure-reader
// inbox deliberately does not do: `--close-stale` classifies live-claiming
// flows (dead pid / unverifiable pre-pid record) and — only with an explicit
// `--yes` — writes the honest durable closure per class (FAILED for a proven
// death, CANCELLED for an operator-consented unverifiable record). Without
// `--yes` it is a dry-run: report only, zero writes.

import { join } from 'node:path';
import type { Command } from 'commander';
import {
  collectInboxRows, buildInboxLines, buildInboxLabels,
  resolveInboxSelection, collectRunDetail, buildRunDetailLines,
} from '../repl/run-flow-inbox.js';
import type { InboxLabels, InboxDecisionVerb, InboxRow } from '../repl/run-flow-inbox.js';
import { scanJobRecords } from '../repl/run-completion-watch.js';
import { sweepStaleRuns } from '../../orchestra/run-flow-death-sweep.js';
import type { StaleRunSweepReport } from '../../orchestra/run-flow-death-sweep.js';
import { decideRunFlow, startRunFlow } from '../../orchestra/run-flow-decision-service.js';
import { computeRunDiff } from '../../orchestra/run-diff-service.js';
import { buildRunCommitProposal, gitWorkflowAdd, gitWorkflowCommit } from '../../orchestra/git-workflow-service.js';
import { isRowTerminal } from '../repl/run-flow-inbox.js';
import { getRunFlowCoordinator } from '../../orchestra/run-flow-coordinator-registry.js';
import { buildFlowStartSpawn } from '../helpers/detached-start.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';
import { getLangFromConfig } from '../helpers/config-reader.js';

const SHORT_ID_LEN = 8;

/** Actor identity for decisions issued via `deckent runs` (parity with the
 *  REPL's `{id:'repl-user'}` and do's `{id:'cli-non-interactive'}`). */
const CLI_OPERATOR_ACTOR = { id: 'cli-operator' } as const;

/**
 * SURF-6 REPL-card glue: execute ONE in-card decision verb through the shared
 * decision service and return the honest one-line outcome (localized) — the
 * InboxCard renders it under the detail; refusals come back as lines too,
 * never as throws (the card must not crash the REPL).
 */
export function executeInboxDecision(
  root: string,
  flowId: string,
  verb: InboxDecisionVerb,
  lang: string,
  actor: { readonly id: string } = { id: 'repl-user' },
): string {
  try {
    if (verb === 'reject') {
      decideRunFlow(root, flowId, { decision: 'reject', actor });
      return getMessage('runs.decide.rejected', lang);
    }

    let approvedLine: string | undefined;
    if (verb === 'approve' || verb === 'full-ahead') {
      const context = decideRunFlow(root, flowId, { decision: 'approve', actor });
      approvedLine = getMessage('runs.decide.approved', lang, {
        revision: String(context.approvedSnapshot?.revision ?? context.preview?.revision ?? '?'),
        digest: (context.approvedSnapshot?.planDigest ?? context.preview?.planDigest ?? '').slice(0, 12),
      });
      // SURF-6 kuyruk-D — the in-card outcome line carries the gate warning too
      if (context.preview?.gateResult === 'fail') {
        approvedLine = `${getMessage('runs.decide.gate_warn', lang, { n: String(context.preview.gateFindings?.length ?? 0) })} · ${approvedLine}`;
      }
      if (verb === 'approve') return approvedLine;
    }

    // 'start' or the full-ahead tail — same spawn builder as the API route.
    const snapshot = getRunFlowCoordinator(root).getFlow(flowId).approvedSnapshot;
    const flow = getRunFlowCoordinator(root).getFlow(flowId);
    const result = startRunFlow(root, flowId, {
      lineage: {
        tenantId: flow.proposal?.tenant ?? 'local',
        actor,
        origin: 'cli',
        correlationId: flowId,
        idempotencyKey: `start:${flowId}:r${snapshot?.revision ?? 0}`,
        sourceId: 'terminal:run-flow-inbox',
        authorization: { kind: 'approved-actor' },
      },
      spawnStart: buildFlowStartSpawn(root, snapshot?.revision ?? 0, snapshot?.planDigest ?? ''),
    });
    const startLine = result.status === 'accepted'
      ? getMessage('runs.decide.started', lang, { jobId: result.attempt.attemptId })
      : getMessage('runs.decide.start_duplicate', lang);
    return approvedLine !== undefined ? `${approvedLine} · ${startLine}` : startLine;
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

interface DecideFlags {
  readonly approve?: boolean;
  readonly reject?: boolean;
  readonly reason?: string;
  readonly start?: boolean;
}

/**
 * Resolve a decide target by row NUMBER or by unique flowId PREFIX
 * (`deckent runs bbbb2222 --reject`). Row numbers shift whenever the list
 * re-sorts (a fresh decision reorders it — a real cross-invocation hazard the
 * SURF-6 smoke caught live), while the flowId is the stable handle the other
 * surface (Desktop) actually displays. An ambiguous prefix is an honest
 * not-found, never a guess.
 */
export function resolveDecideTarget(
  arg: string | undefined,
  rows: readonly InboxRow[],
): { kind: 'row'; row: InboxRow } | { kind: 'not-found'; arg: string } | { kind: 'missing' } {
  if (arg === undefined) return { kind: 'missing' };
  const selection = resolveInboxSelection(arg, rows);
  if (selection.kind === 'detail') return { kind: 'row', row: selection.row };
  const matches = rows.filter((r) => r.flowId.startsWith(arg));
  if (matches.length === 1) return { kind: 'row', row: matches[0]! };
  return { kind: 'not-found', arg };
}

/**
 * `deckent runs <n> --approve [--start] | --reject [--reason] | --start` —
 * the Desktop Telegraph's exact verbs from the terminal (SURF-6 Desktop→
 * Terminal handoff): reject=STOP, approve=SLOW AHEAD, approve+start=FULL
 * AHEAD. All writes go through the ONE shared decision service; deterministic
 * commandIds make a same-revision decision from another surface converge
 * idempotently instead of racing. Prints the refreshed detail afterwards so
 * the operator sees the daemon-truth, not the intent.
 */
function runDecide(root: string, flowId: string, flags: DecideFlags, lang: string, labels: InboxLabels): void {
  if (flags.approve) {
    const context = decideRunFlow(root, flowId, { decision: 'approve', actor: CLI_OPERATOR_ACTOR });
    // SURF-6 kuyruk-D — gate-fail visibility: an approve on a gate-FAIL plan
    // is legal (policy=needs-approval) but the run will refuse at start; the
    // operator hears it NOW, not from a post-mortem crash narrative.
    if (context.preview?.gateResult === 'fail') {
      print(getMessage('runs.decide.gate_warn', lang, { n: String(context.preview.gateFindings?.length ?? 0) }));
    }
    const snapshot = context.approvedSnapshot;
    print(getMessage('runs.decide.approved', lang, {
      revision: String(snapshot?.revision ?? context.preview?.revision ?? '?'),
      digest: (snapshot?.planDigest ?? context.preview?.planDigest ?? '').slice(0, 12),
    }));
  } else if (flags.reject) {
    decideRunFlow(root, flowId, {
      decision: 'reject',
      ...(flags.reason !== undefined ? { reason: flags.reason } : {}),
      actor: CLI_OPERATOR_ACTOR,
    });
    print(flags.reason !== undefined
      ? getMessage('runs.decide.rejected_reason', lang, { reason: flags.reason })
      : getMessage('runs.decide.rejected', lang));
  }

  if (flags.start && !flags.reject) {
    const snapshot = getRunFlowCoordinator(root).getFlow(flowId).approvedSnapshot;
    const flow = getRunFlowCoordinator(root).getFlow(flowId);
    // A missing snapshot falls through to the service, which refuses with the
    // honest `not APPROVED` message — same wording the API answers with.
    const result = startRunFlow(root, flowId, {
      lineage: {
        tenantId: flow.proposal?.tenant ?? 'local',
        actor: CLI_OPERATOR_ACTOR,
        origin: 'cli',
        correlationId: flowId,
        idempotencyKey: `start:${flowId}:r${snapshot?.revision ?? 0}`,
        sourceId: 'cli:runs',
        authorization: { kind: 'approved-actor' },
      },
      spawnStart: buildFlowStartSpawn(root, snapshot?.revision ?? 0, snapshot?.planDigest ?? ''),
    });
    print(result.status === 'accepted'
      ? getMessage('runs.decide.started', lang, { jobId: result.attempt.attemptId })
      : getMessage('runs.decide.start_duplicate', lang));
  }

  // Daemon-truth epilogue: re-collect and show the run as it now durably is.
  print('');
  const rows = collectInboxRows(root);
  const row = rows.find((r) => r.flowId === flowId);
  if (row) {
    for (const line of buildRunDetailLines(collectRunDetail(root, row), labels)) print(line);
  }
}

/** flowIds whose execution truth is already terminal in the jobs-dir — the
 *  SAME join collectInboxRows displays, handed to the sweep so a provably
 *  finished run is never "closed" as cancelled. */
function jobsTerminalFlowIds(root: string): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const job of scanJobRecords(join(root, '.deckent', 'runtime', 'jobs'))) {
    if (job.flowId) ids.add(job.flowId);
  }
  return ids;
}

/** Render the `--close-stale` report (dry-run or applied) as printable lines. */
export function buildCloseStaleLines(report: StaleRunSweepReport, lang: string): string[] {
  const staleCount = report.dead.length + report.unverifiable.length;
  if (staleCount === 0) return [getMessage('runs.close_stale.none', lang)];

  const header = report.applied
    ? getMessage('runs.close_stale.apply_header', lang, { count: String(staleCount) })
    : getMessage('runs.close_stale.dry_header', lang, { count: String(staleCount) });
  const lines = [header];
  for (const e of report.dead) {
    const key = e.closedAs === 'failed' ? 'runs.close_stale.entry_dead' : 'runs.close_stale.entry_dead_cancelled';
    lines.push(`  ${e.flowId.slice(0, SHORT_ID_LEN)} · ${getMessage(key, lang, { pid: String(e.pid ?? '?') })}`);
  }
  for (const e of report.unverifiable) {
    lines.push(`  ${e.flowId.slice(0, SHORT_ID_LEN)} · ${getMessage('runs.close_stale.entry_unverifiable', lang)}`);
  }
  if (!report.applied) lines.push(getMessage('runs.close_stale.dry_hint', lang));
  return lines;
}

export function registerRuns(program: Command): void {
  program
    .command('runs')
    .description('List run-flows (the multi-flow inbox) — plus per-run decide: --approve/--reject/--start')
    .argument('[n]', 'Run to target: the list number, or (for decide flags) a unique flowId prefix')
    .option('--close-stale', 'Classify stale runs (dead process / unverifiable record); dry-run unless --yes')
    .option('--yes', 'With --close-stale: durably close the stale runs (failed/cancelled)')
    .option('--approve', 'Approve run #n (SLOW AHEAD; add --start for FULL AHEAD)')
    .option('--reject', 'Reject run #n (STOP)')
    .option('--reason <text>', 'Reason recorded with --reject')
    .option('--start', 'Start the approved run #n as a detached background run')
    .option('--diff', "Show run #n's real footprint as a unified diff (583/N1)")
    .option('--commit', "Review-then-commit run #n's changes (583/N4; shows the proposal, prompts unless --yes)")
    .option('--message <text>', 'With --commit: use this commit message instead of the suggested one')
    .action(async (n: string | undefined, opts: { closeStale?: boolean; yes?: boolean; diff?: boolean; commit?: boolean; message?: string } & DecideFlags) => {
      const root = resolveProjectRoot();
      const lang = getLangFromConfig(root);
      try {
        const labels = buildInboxLabels((key) => getMessage(key, lang));

        // 583/N1 — `runs <n|prefix> --diff`: line-level footprint via the ONE
        // shared diff service (same output the Desktop diff panel renders).
        if (opts.diff === true) {
          const target = resolveDecideTarget(n, collectInboxRows(root));
          if (target.kind !== 'row') {
            printError(new Error(
              target.kind === 'not-found'
                ? labels.notFound.replace('{arg}', target.arg)
                : getMessage('runs.decide.needs_row', lang),
            ));
            process.exitCode = 1;
            return;
          }
          const diff = await computeRunDiff(root, target.row.flowId);
          if (diff.note === 'not-a-git-repo') { print(getMessage('runs.diff.not_git', lang)); return; }
          if (diff.note === 'no-base') print(getMessage('runs.diff.no_base', lang));
          if (diff.files.length === 0) { print(getMessage('runs.diff.empty', lang)); return; }
          print(getMessage('runs.diff.header', lang, {
            n: String(diff.files.length),
            base: diff.base?.slice(0, 12) ?? 'HEAD',
          }));
          for (const file of diff.files) {
            print('');
            print(file.text.endsWith('\n') ? file.text.slice(0, -1) : file.text);
            if (file.truncated) print(getMessage('runs.diff.truncated', lang));
          }
          if (diff.truncated) print(getMessage('runs.diff.truncated', lang));
          return;
        }

        // 583/N4 — `runs <n|prefix> --commit`: the post-run incele→commit flow
        // (KARAR-2). Shows the run-footprint proposal (same gitBase feet as
        // --diff), a deterministic suggested message, then asks for the human
        // seal (y/N; --yes skips, --message overrides). NEVER pushes.
        if (opts.commit === true) {
          const target = resolveDecideTarget(n, collectInboxRows(root));
          if (target.kind !== 'row') {
            printError(new Error(
              target.kind === 'not-found'
                ? labels.notFound.replace('{arg}', target.arg)
                : getMessage('runs.decide.needs_row', lang),
            ));
            process.exitCode = 1;
            return;
          }
          const row = target.row;
          // Post-run only: a mid-run commit would seal a moving target
          // (jobs-join-aware — see isRowTerminal).
          if (!isRowTerminal(row)) {
            printError(new Error(getMessage('runs.commit.not_terminal', lang, {
              id: row.flowId.slice(0, SHORT_ID_LEN),
              state: row.state,
            })));
            process.exitCode = 1;
            return;
          }
          const proposal = await buildRunCommitProposal(root, row.flowId, row.intentSummary);
          if (proposal.note === 'not-a-git-repo') { print(getMessage('runs.commit.not_git', lang)); return; }
          if (proposal.note === 'clean') { print(getMessage('runs.commit.clean', lang)); return; }
          print(getMessage('runs.commit.header', lang, {
            n: String(proposal.files.length),
            ins: String(proposal.insertions),
            del: String(proposal.deletions),
          }));
          for (const file of proposal.files) {
            print(`  ${file.path} (+${file.insertions} −${file.deletions})`);
          }
          const message = opts.message ?? proposal.suggestedMessage;
          print('');
          print(getMessage('runs.commit.suggested', lang));
          for (const line of message.split('\n')) print(`  ${line}`);
          if (opts.yes !== true) {
            if (!process.stdin.isTTY) {
              print(getMessage('runs.commit.noninteractive', lang));
              return;
            }
            const { createInterface } = await import('node:readline/promises');
            const rl = createInterface({ input: process.stdin, output: process.stdout });
            let confirmed = false;
            try {
              const answer = (await rl.question(getMessage('runs.commit.prompt', lang))).trim().toLowerCase();
              confirmed = answer === 'y' || answer === 'yes';
            } finally {
              rl.close();
            }
            if (!confirmed) { print(getMessage('runs.commit.aborted', lang)); return; }
          }
          const added = await gitWorkflowAdd(root);
          if (!added.ok) {
            printError(new Error(getMessage('runs.commit.add_failed', lang, { error: added.error ?? '?' })));
            process.exitCode = 1;
            return;
          }
          print(getMessage('runs.commit.staged', lang, { n: String(added.staged) }));
          const committed = await gitWorkflowCommit(root, message);
          if (!committed.ok) {
            printError(new Error(getMessage('runs.commit.commit_failed', lang, { error: committed.error ?? '?' })));
            process.exitCode = 1;
            return;
          }
          print(getMessage('runs.commit.done', lang, { sha: committed.sha ?? '?' }));
          return;
        }

        const wantsDecide = opts.approve === true || opts.reject === true || opts.start === true;
        if (wantsDecide || opts.reason !== undefined) {
          if (opts.approve && opts.reject) {
            printError(new Error(getMessage('runs.decide.flag_conflict', lang)));
            process.exitCode = 1;
            return;
          }
          if (opts.reason !== undefined && !opts.reject) {
            printError(new Error(getMessage('runs.decide.reason_without_reject', lang)));
            process.exitCode = 1;
            return;
          }
          const target = resolveDecideTarget(n, collectInboxRows(root));
          if (target.kind !== 'row') {
            printError(new Error(
              target.kind === 'not-found'
                ? labels.notFound.replace('{arg}', target.arg)
                : getMessage('runs.decide.needs_row', lang),
            ));
            process.exitCode = 1;
            return;
          }
          runDecide(root, target.row.flowId, opts, lang, labels);
          return;
        }

        if (opts.closeStale) {
          const report = sweepStaleRuns(root, {
            apply: opts.yes === true,
            jobsTerminalFlowIds: jobsTerminalFlowIds(root),
          });
          for (const line of buildCloseStaleLines(report, lang)) print(line);
          print('');
        }

        const rows = collectInboxRows(root);

        // `deckent runs <n>` — rich single-run detail, same numbering as the
        // list (parity with the REPL's `/runs <n>`); SURF-6: a unique flowId
        // PREFIX works too (the stable handle a cross-surface handoff carries).
        if (n !== undefined && !opts.closeStale) {
          const selection = resolveInboxSelection(n, rows);
          if (selection.kind === 'detail') {
            for (const line of buildRunDetailLines(collectRunDetail(root, selection.row), labels)) print(line);
            return;
          }
          if (selection.kind === 'not-found') {
            print(labels.notFound.replace('{arg}', selection.arg));
            return;
          }
          const target = resolveDecideTarget(n, rows);
          if (target.kind === 'row') {
            for (const line of buildRunDetailLines(collectRunDetail(root, target.row), labels)) print(line);
            return;
          }
          // unmatched non-numeric arg falls through to the list, mirroring the REPL
        }

        // Always end with the (post-sweep) inbox, so the user sees the honest
        // current list — the same rows the REPL's `/runs` renders.
        for (const line of buildInboxLines(rows, labels)) print(line);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
