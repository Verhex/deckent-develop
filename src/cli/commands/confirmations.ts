// Thin CLI projection over the acceptance-confirmation service. It owns no store/debt mutation.
import { Command } from 'commander';
import { resolveProjectRoot } from '../helpers/process.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { print, printError } from '../helpers/output.js';
import { listPendingConfirmations } from '../../core/confirmation-store.js';
import { loadConfig } from '../../core/config.js';
import { resolveTenant } from '../../core/tenant-context.js';
import { InvocationReceiptStore } from '../../core/invocation-receipt-store.js';
import { fromCrossVerifyVerdict } from '../../core/verdict-types.js';
import type { TaskResultSettlementRefV1 } from '../../core/task-result-settlement.js';
import { settleAcceptanceConfirmation, type AcceptanceConfirmationServiceDeps } from '../../orchestra/acceptance-confirmation-service.js';
import { openAcceptanceConfirmationComposition, type AcceptanceConfirmationComposition,
  type AcceptanceConfirmationCompositionResult } from '../../orchestra/acceptance-confirmation-composition.js';

export interface AcceptanceConfirmationListItem {
  readonly confirmationId: string; readonly adapter: 'human' | 'llm' | 'code' | 'deterministic';
  readonly kind: string; readonly sourceVerdict: string; readonly taskId: string;
  readonly sprintId: string; readonly statement: string; readonly riskTier: string;
  readonly generation: number; readonly expiresAt: string; readonly authorProvider?: string;
  readonly evidenceRequirements: readonly string[];
}
export type AcceptanceConfirmationReadModel =
  | { readonly state: 'READY'; readonly pending: readonly AcceptanceConfirmationListItem[] }
  | { readonly state: 'HOLD'; readonly reason: string };
export interface LlmSettlementEvidence {
  readonly confirmationId: string; readonly authorProvider: string; readonly verifierProvider: string;
  readonly adjudicationReceiptRef: string; readonly verdict: 'CONFIRMED' | 'FAILED';
  readonly settlementRef: TaskResultSettlementRefV1;
}
export interface ConfirmationsDeps {
  readModelFn?: (root: string) => Promise<AcceptanceConfirmationReadModel>;
  serviceDepsFn?: (root: string, evidence: LlmSettlementEvidence) => Promise<AcceptanceConfirmationServiceDeps | undefined>;
  runXverifyForResultFn?: typeof import('./xverify.js')['runXverifyForResult'];
  settleFn?: typeof settleAcceptanceConfirmation;
  resolveProjectRootFn?: typeof resolveProjectRoot;
  // Retained source-compatible seams; neither grants decision authority.
  confirmInteractiveFn?: (prompt: string) => Promise<boolean>;
  loadConfigFn?: typeof loadConfig;
  resolveTenantFn?: typeof resolveTenant;
  projectIdFn?: (root: string) => string;
  clock?: () => Date;
}

type CompositionAdmission =
  | { readonly state: 'READY'; readonly composition: AcceptanceConfirmationComposition }
  | { readonly state: 'HOLD'; readonly reasonCode: string };

const SURFACE = 'deckent approvals decide';
const SERVICE_UNAVAILABLE = 'acceptance-confirmation-service-unavailable';
const EVIDENCE_UNAVAILABLE = 'exact-xverify-evidence-unavailable';
const PROVIDER_NOT_SEPARATE = 'xverify-provider-separation-unproven';

async function defaultReadModel(root: string): Promise<AcceptanceConfirmationReadModel> {
  const pending = listPendingConfirmations(root).map(request => ({
    confirmationId: request.id,
    adapter: request.adapter,
    kind: request.kind,
    sourceVerdict: request.verdict,
    taskId: request.taskId,
    sprintId: request.sprintId,
    statement: request.statements[0] ?? '-',
    riskTier: request.approval.riskTier,
    generation: request.identity.generation,
    expiresAt: request.expiresAt,
    ...(request.authorProvider ? { authorProvider: request.authorProvider } : {}),
    evidenceRequirements: request.evidenceRequirements,
  }));
  return { state: 'READY', pending };
}

async function defaultServiceAdmission(
  root: string,
  deps: ConfirmationsDeps,
): Promise<CompositionAdmission> {
  const config = await (deps.loadConfigFn ?? loadConfig)(root);
  const tenantId = (deps.resolveTenantFn ?? resolveTenant)(root, {
    ...(config.approval?.authority?.tenant_id
      ? { tenantId: config.approval.authority.tenant_id }
      : {}),
  }).tenantId;
  const projectId = deps.projectIdFn
    ? deps.projectIdFn(root)
    : (() => {
        const store = new InvocationReceiptStore(root);
        try { return store.projectId; } finally { store.close(); }
      })();
  try {
    const composition = openAcceptanceConfirmationComposition({
      projectRoot: root,
      tenantId,
      projectId,
      lifecycle: config.approval!.lifecycle,
      clock: deps.clock ?? (() => new Date()),
      decisionAuthority: { branch: 'llm', projectRoot: root },
    });
    return { state: 'READY', composition };
  } catch (error) {
    return { state: 'HOLD', reasonCode: error instanceof Error ? error.name : SERVICE_UNAVAILABLE };
  }
}

function describe(r: AcceptanceConfirmationListItem, lang: string): string {
  return getMessage('confirmations.list_row', lang, { id: r.confirmationId, adapter: r.adapter,
    kind: r.kind, verdict: r.sourceVerdict, taskId: r.taskId, sprintId: r.sprintId,
    statement: r.statement, riskTier: r.riskTier, generation: String(r.generation), expiresAt: r.expiresAt });
}
function hold(id: string, reason: string, lang: string): void {
  printError(new Error(getMessage('acceptance.confirmation.reconciliation_hold', lang, {
    confirmationId: id, reason, surface: `${SURFACE} ${id}`,
  })));
  process.exitCode = 1;
}
function report(id: string, result: AcceptanceConfirmationCompositionResult, lang: string): void {
  if (result.state !== 'DONE') { hold(id, result.reasonCode, lang); return; }
  print(getMessage('acceptance.confirmation.confirmed', lang, { confirmationId: id, surface: SURFACE }));
}

export function registerConfirmationsCommand(program: Command, deps: ConfirmationsDeps = {}): void {
  const lang = getLanguage(undefined);
  const rootOf = deps.resolveProjectRootFn ?? resolveProjectRoot;
  const confirmations = program.command('confirmations').description(getMessage('confirmations.cmd_desc', lang));
  confirmations.command('list').description(getMessage('confirmations.list_desc', lang)).action(async () => {
    const model = await (deps.readModelFn ?? defaultReadModel)(rootOf());
    if (model.state === 'HOLD') { hold('-', model.reason, lang); return; }
    if (model.pending.length === 0) { print(getMessage('confirmations.list_empty', lang)); return; }
    for (const request of model.pending) print(describe(request, lang));
  });
  // A TTY is not authentication. Human decisions route to the unified authenticated surface.
  confirmations.command('decide <id>').description(getMessage('confirmations.decide_desc', lang))
    // Parse the legacy flags only so callers receive the migration route rather
    // than Commander's syntax error. They are never interpreted as authority.
    .option('--confirm', getMessage('confirmations.opt_confirm', lang))
    .option('--reject', getMessage('confirmations.opt_reject', lang))
    .option('--reason <text>', getMessage('confirmations.opt_reason', lang))
    .action((id: string) => {
      print(getMessage('acceptance.confirmation.authenticated_surface_route', lang, {
        confirmationId: id, surface: `${SURFACE} ${id}`,
      }));
    });
  confirmations.command('run').description(getMessage('confirmations.run_desc', lang))
    .option('--id <id>', getMessage('confirmations.opt_run_id', lang))
    .option('--author <provider>', getMessage('confirmations.opt_run_author', lang))
    .option('--timeout <ms>', getMessage('confirmations.opt_run_timeout', lang))
    .action(async (opts: { id?: string; author?: string; timeout?: string }) => {
      const root = rootOf();
      const model = await (deps.readModelFn ?? defaultReadModel)(root);
      if (model.state === 'HOLD') { hold(opts.id ?? '-', model.reason, lang); return; }
      const pending = model.pending.filter(r => r.adapter === 'llm').filter(r => opts.id === undefined || r.confirmationId === opts.id);
      if (pending.length === 0) { print(getMessage('confirmations.run_none', lang)); return; }
      const runXverify = deps.runXverifyForResultFn ?? (await import('./xverify.js')).runXverifyForResult;
      for (const request of pending) {
        const author = request.authorProvider ?? opts.author;
        if (!author) { print(getMessage('confirmations.run_skip_author', lang, { id: request.confirmationId })); continue; }
        const outcome = await runXverify(request.statement, { author,
          ...(request.evidenceRequirements.length ? { files: request.evidenceRequirements.join(',') } : {}),
          ...(opts.timeout ? { timeout: opts.timeout } : {}) });
        const normalizedVerdict = outcome.verdict ? fromCrossVerifyVerdict(outcome.verdict) : null;
        if (normalizedVerdict !== 'CONFIRMED' && normalizedVerdict !== 'FAILED') {
          print(getMessage('confirmations.run_unclear', lang, { id: request.confirmationId, verdict: outcome.verdict ?? 'null' }));
          continue;
        }
        if (!outcome.adjudicationReceiptRef || !outcome.settlementRef
          || outcome.assurance !== 'typed-host-adjudicated' || !outcome.verifier) {
          hold(request.confirmationId, EVIDENCE_UNAVAILABLE, lang); continue;
        }
        if (outcome.author === outcome.verifier || outcome.author !== author) {
          hold(request.confirmationId, PROVIDER_NOT_SEPARATE, lang); continue;
        }
        const evidence: LlmSettlementEvidence = { confirmationId: request.confirmationId,
          authorProvider: outcome.author, verifierProvider: outcome.verifier,
          adjudicationReceiptRef: outcome.adjudicationReceiptRef, verdict: normalizedVerdict,
          settlementRef: outcome.settlementRef };
        let serviceDeps: AcceptanceConfirmationServiceDeps | undefined;
        if (deps.serviceDepsFn) {
          serviceDeps = await deps.serviceDepsFn(root, evidence);
        } else {
          const admission = await defaultServiceAdmission(root, deps);
          if (admission.state === 'HOLD') {
            hold(request.confirmationId, admission.reasonCode, lang);
            continue;
          }
          try {
            report(request.confirmationId, await admission.composition.decideAndSettle({
              confirmationId: request.confirmationId,
              verdict: evidence.verdict,
              decidedBy: 'llm',
              reason: `xverify:${evidence.verifierProvider}`,
              authorityReceipt: evidence.adjudicationReceiptRef,
              settlementRef: evidence.settlementRef,
            }), lang);
          } finally {
            admission.composition.close();
          }
          continue;
        }
        if (!serviceDeps) { hold(request.confirmationId, SERVICE_UNAVAILABLE, lang); continue; }
        report(request.confirmationId, await (deps.settleFn ?? settleAcceptanceConfirmation)(serviceDeps, request.confirmationId), lang);
      }
    });
}
