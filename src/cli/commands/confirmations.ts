// ─── `deckent confirmations` — custom-confirmation adapter surface ──────────
//
// ADR-G-040 adapter runtime. Pending ConfirmationRequests (acceptance-matrix
// ROUTE outcomes) are resolved here, per adapter family:
//   list   — read-only inbox (any adapter).
//   decide — HUMAN adapter only: single-shot verdict behind the same
//            interactive-TTY confirmation contract as `deckent approvals
//            decide` (no TTY or wrong phrase → refused, fail-closed).
//   run    — LLM adapter only: each request becomes a claim adjudicated by a
//            DIFFERENT provider through the existing xverify runtime
//            (XVERIFY-PROVIDER-SEPARATION); CONFIRMED/REFUTED settle the
//            request, UNCLEAR keeps it honestly pending.
// The code adapter is declared but not runnable yet — its requests simply
// stay pending (list shows them; nothing fabricates a verdict).

import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';

import { resolveProjectRoot } from '../helpers/process.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { print, printError } from '../helpers/output.js';
import {
  listPendingConfirmations,
  readConfirmation,
  settleConfirmation,
  type ConfirmationRequest,
} from '../../core/confirmation-store.js';
import { fromCrossVerifyVerdict } from '../../core/verdict-types.js';

interface ConfirmationsDeps {
  /** Deferred import seam for the heavy xverify runner (llm adapter). */
  runXverifyForResultFn?: typeof import('./xverify.js')['runXverifyForResult'];
  /** Test seam for the interactive confirmation (defaults to real TTY read). */
  confirmInteractiveFn?: (prompt: string) => Promise<boolean>;
  resolveProjectRootFn?: typeof resolveProjectRoot;
}

async function confirmViaTty(prompt: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(prompt)).trim() === 'yes';
  } finally {
    rl.close();
  }
}

function describe(request: ConfirmationRequest, lang: string): string {
  return getMessage('confirmations.list_row', lang, {
    id: request.id,
    adapter: request.adapter,
    kind: request.kind,
    verdict: request.verdict,
    taskId: request.taskId,
    sprintId: request.sprintId,
    statement: request.statements[0] ?? '-',
  });
}

export function registerConfirmationsCommand(
  program: Command,
  deps: ConfirmationsDeps = {},
): void {
  const lang = getLanguage(undefined);
  const resolveRoot = deps.resolveProjectRootFn ?? resolveProjectRoot;
  const confirmations = program
    .command('confirmations')
    .description(getMessage('confirmations.cmd_desc', lang));

  confirmations
    .command('list')
    .description(getMessage('confirmations.list_desc', lang))
    .action(() => {
      const pending = listPendingConfirmations(resolveRoot());
      if (pending.length === 0) {
        print(getMessage('confirmations.list_empty', lang));
        return;
      }
      for (const request of pending) print(describe(request, lang));
    });

  confirmations
    .command('decide <id>')
    .description(getMessage('confirmations.decide_desc', lang))
    .option('--confirm', getMessage('confirmations.opt_confirm', lang))
    .option('--reject', getMessage('confirmations.opt_reject', lang))
    .option('--reason <text>', getMessage('confirmations.opt_reason', lang))
    .action(async (id: string, opts: { confirm?: boolean; reject?: boolean; reason?: string }) => {
      const root = resolveRoot();
      if (Boolean(opts.confirm) === Boolean(opts.reject) || !opts.reason?.trim()) {
        printError(new Error(getMessage('confirmations.err_flag_required', lang)));
        process.exitCode = 1;
        return;
      }
      const found = readConfirmation(root, id);
      if (!found || found.state !== 'pending') {
        printError(new Error(getMessage('confirmations.err_not_pending', lang, { id })));
        process.exitCode = 1;
        return;
      }
      if (found.request.adapter !== 'human') {
        printError(new Error(getMessage('confirmations.err_wrong_adapter', lang, {
          id, adapter: found.request.adapter, expected: 'human',
        })));
        process.exitCode = 1;
        return;
      }
      const confirmed = await (deps.confirmInteractiveFn ?? confirmViaTty)(
        getMessage('confirmations.confirm_prompt', lang));
      if (!confirmed) {
        printError(new Error(getMessage('confirmations.err_no_tty', lang)));
        process.exitCode = 1;
        return;
      }
      const settled = settleConfirmation(root, id, {
        verdict: opts.confirm ? 'CONFIRMED' : 'FAILED',
        decidedBy: 'human',
        reason: opts.reason.trim(),
        decidedAt: new Date().toISOString(),
      });
      print(getMessage('confirmations.decided', lang, {
        id, verdict: settled.outcome.verdict, decidedBy: 'human', reason: settled.outcome.reason,
      }));
    });

  confirmations
    .command('run')
    .description(getMessage('confirmations.run_desc', lang))
    .option('--id <id>', getMessage('confirmations.opt_run_id', lang))
    .option('--author <provider>', getMessage('confirmations.opt_run_author', lang))
    .option('--timeout <ms>', getMessage('confirmations.opt_run_timeout', lang))
    .action(async (opts: { id?: string; author?: string; timeout?: string }) => {
      const root = resolveRoot();
      const pending = listPendingConfirmations(root)
        .filter(request => request.adapter === 'llm')
        .filter(request => (opts.id ? request.id === opts.id : true));
      if (pending.length === 0) {
        print(getMessage('confirmations.run_none', lang));
        return;
      }
      const runXverifyForResult = deps.runXverifyForResultFn
        ?? (await import('./xverify.js')).runXverifyForResult;
      for (const request of pending) {
        const author = request.authorProvider ?? opts.author;
        if (!author) {
          print(getMessage('confirmations.run_skip_author', lang, { id: request.id }));
          continue;
        }
        const claim = request.statements.join('\n');
        const outcome = await runXverifyForResult(claim, {
          author,
          ...(request.evidenceRequirements.length > 0
            ? { files: request.evidenceRequirements.join(',') }
            : {}),
          ...(opts.timeout ? { timeout: opts.timeout } : {}),
        });
        const normative = outcome.verdict ? fromCrossVerifyVerdict(outcome.verdict) : null;
        if (normative === 'CONFIRMED' || normative === 'FAILED') {
          const settled = settleConfirmation(root, request.id, {
            verdict: normative,
            decidedBy: 'llm',
            reason: getMessage('confirmations.llm_reason', lang, { verdict: outcome.verdict ?? 'null' }),
            ...(outcome.adjudicationReceiptRef ? { receipt: outcome.adjudicationReceiptRef } : {}),
            decidedAt: new Date().toISOString(),
          });
          print(getMessage('confirmations.decided', lang, {
            id: request.id, verdict: settled.outcome.verdict, decidedBy: 'llm',
            reason: settled.outcome.reason,
          }));
        } else {
          print(getMessage('confirmations.run_unclear', lang, {
            id: request.id, verdict: outcome.verdict ?? 'null',
          }));
        }
      }
    });
}
