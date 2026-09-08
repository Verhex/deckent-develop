import type { Command } from 'commander';

import { listPendingConfirmationsReadOnly } from '../../core/confirmation-store.js';
import { loadConfig } from '../../core/config.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../../core/provider-authority-composition.js';
import { InvocationReceiptStore } from '../../core/invocation-receipt-store.js';
import { resolveTenant } from '../../core/tenant-context.js';
import { fromCrossVerifyVerdict } from '../../core/verdict-types.js';
import {
  openAcceptanceConfirmationComposition,
  type AcceptanceConfirmationComposition,
  type AcceptanceConfirmationCompositionResult,
} from '../../orchestra/acceptance-confirmation-composition.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import type { XverifyCommandOpts, XverifyDeps, XverifyResult } from './xverify.js';

export interface AcceptanceConfirmationRunItem {
  readonly confirmationId: string;
  readonly adapter: 'human' | 'llm' | 'code' | 'deterministic';
  readonly statements: readonly string[];
  readonly authorProvider?: string;
  readonly evidenceRequirements: readonly string[];
}

export type AcceptanceConfirmationRunReadModel =
  | { readonly state: 'READY'; readonly pending: readonly AcceptanceConfirmationRunItem[] }
  | { readonly state: 'HOLD'; readonly reason: string };

export interface ApprovalConfirmationRunDeps {
  readonly providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
  readonly resolveProjectRootFn?: () => string;
  readonly readModelFn?: (root: string) => Promise<AcceptanceConfirmationRunReadModel>;
  readonly runXverifyForResultFn?: (
    claim: string,
    opts: XverifyCommandOpts,
    deps: Pick<XverifyDeps, 'providerAuthority'>,
  ) => Promise<XverifyResult>;
  readonly loadConfigFn?: typeof loadConfig;
  readonly resolveTenantFn?: typeof resolveTenant;
  readonly projectIdFn?: (root: string) => string;
  readonly openCompositionFn?: typeof openAcceptanceConfirmationComposition;
  readonly clock?: () => Date;
}

interface ApprovalConfirmationRunOpts {
  readonly id?: string;
  readonly author?: string;
  readonly timeout?: string;
}

type CompositionAdmission =
  | { readonly state: 'READY'; readonly composition: AcceptanceConfirmationComposition }
  | { readonly state: 'HOLD'; readonly reasonCode: string };

const DECISION_SURFACE = 'deckent approvals decide';
const RUN_SURFACE = 'deckent approvals run';
const SERVICE_UNAVAILABLE = 'acceptance-confirmation-service-unavailable';
const EVIDENCE_UNAVAILABLE = 'exact-xverify-evidence-unavailable';
const PROVIDER_NOT_SEPARATE = 'xverify-provider-separation-unproven';

async function defaultReadModel(
  root: string,
  deps: ApprovalConfirmationRunDeps,
): Promise<AcceptanceConfirmationRunReadModel> {
  const config = await (deps.loadConfigFn ?? loadConfig)(root);
  if (!config.approval?.lifecycle) {
    return { state: 'HOLD', reason: SERVICE_UNAVAILABLE };
  }
  const tenantId = (deps.resolveTenantFn ?? resolveTenant)(root, {
    ...(config.approval?.authority?.tenant_id
      ? { tenantId: config.approval.authority.tenant_id }
      : {}),
  }).tenantId;
  const pending = listPendingConfirmationsReadOnly(root, {
    lifecycle: config.approval.lifecycle,
    ...(deps.clock ? { clock: deps.clock } : {}),
  })
    .filter(request => request.approval.tenantId === tenantId)
    .map(request => ({
      confirmationId: request.id,
      adapter: request.adapter,
      statements: request.statements,
      ...(request.authorProvider ? { authorProvider: request.authorProvider } : {}),
      evidenceRequirements: request.evidenceRequirements,
    }));
  return { state: 'READY', pending };
}

async function openComposition(
  root: string,
  deps: ApprovalConfirmationRunDeps,
): Promise<CompositionAdmission> {
  try {
    const config = await (deps.loadConfigFn ?? loadConfig)(root);
    if (!config.approval?.lifecycle) {
      return { state: 'HOLD', reasonCode: SERVICE_UNAVAILABLE };
    }
    const tenantId = (deps.resolveTenantFn ?? resolveTenant)(root, {
      ...(config.approval.authority?.tenant_id
        ? { tenantId: config.approval.authority.tenant_id }
        : {}),
    }).tenantId;
    const projectId = deps.projectIdFn
      ? deps.projectIdFn(root)
      : (() => {
          const store = new InvocationReceiptStore(root);
          try { return store.projectId; } finally { store.close(); }
        })();
    return {
      state: 'READY',
      composition: (deps.openCompositionFn ?? openAcceptanceConfirmationComposition)({
        projectRoot: root,
        tenantId,
        projectId,
        lifecycle: config.approval.lifecycle,
        clock: deps.clock ?? (() => new Date()),
        decisionAuthority: { branch: 'llm', projectRoot: root },
      }),
    };
  } catch (error) {
    return {
      state: 'HOLD',
      reasonCode: error instanceof Error ? error.name : SERVICE_UNAVAILABLE,
    };
  }
}

function hold(id: string, reason: string, lang: string): void {
  printError(new Error(getMessage('acceptance.confirmation.reconciliation_hold', lang, {
    confirmationId: id,
    reason,
    surface: `${DECISION_SURFACE} ${id}`,
  })));
  process.exitCode = 1;
}

function report(
  id: string,
  result: AcceptanceConfirmationCompositionResult,
  lang: string,
): void {
  if (result.state !== 'DONE') {
    hold(id, result.reasonCode, lang);
    return;
  }
  print(getMessage('acceptance.confirmation.confirmed', lang, {
    confirmationId: id,
    surface: RUN_SURFACE,
  }));
}

/** Register the LLM adjudication dispatcher under the unified approvals surface. */
export function registerApprovalConfirmationRun(
  approvals: Command,
  deps: ApprovalConfirmationRunDeps = {},
): void {
  const lang = getLanguage(undefined);
  approvals.command('run')
    .description(getMessage('confirmations.run_desc', lang))
    .option('--id <id>', getMessage('confirmations.opt_run_id', lang))
    .option('--author <provider>', getMessage('confirmations.opt_run_author', lang))
    .option('--timeout <ms>', getMessage('confirmations.opt_run_timeout', lang))
    .action(async (opts: ApprovalConfirmationRunOpts) => {
      const root = (deps.resolveProjectRootFn ?? resolveProjectRoot)();
      const model = deps.readModelFn
        ? await deps.readModelFn(root)
        : await defaultReadModel(root, deps);
      if (model.state === 'HOLD') {
        hold(opts.id ?? '-', model.reason, lang);
        return;
      }
      const pending = model.pending
        .filter(request => request.adapter === 'llm')
        .filter(request => opts.id === undefined || request.confirmationId === opts.id);
      if (pending.length === 0) {
        print(getMessage('confirmations.run_none', lang));
        return;
      }

      const runXverify = deps.runXverifyForResultFn
        ?? (await import('./xverify.js')).runXverifyForResult;
      for (const request of pending) {
        const author = request.authorProvider ?? opts.author;
        if (!author) {
          print(getMessage('confirmations.run_skip_author', lang, { id: request.confirmationId }));
          continue;
        }
        const outcome = await runXverify(request.statements.join('\n'), {
          author,
          ...(request.evidenceRequirements.length > 0
            ? { files: request.evidenceRequirements.join(',') }
            : {}),
          ...(opts.timeout ? { timeout: opts.timeout } : {}),
        }, {
          ...(deps.providerAuthority ? { providerAuthority: deps.providerAuthority } : {}),
        });
        const verdict = outcome.verdict ? fromCrossVerifyVerdict(outcome.verdict) : null;
        if (verdict !== 'CONFIRMED' && verdict !== 'FAILED') {
          print(getMessage('confirmations.run_unclear', lang, {
            id: request.confirmationId,
            verdict: outcome.verdict ?? 'null',
          }));
          continue;
        }
        if (!outcome.adjudicationReceiptRef || !outcome.settlementRef
          || outcome.assurance !== 'typed-host-adjudicated' || !outcome.verifier) {
          hold(request.confirmationId, EVIDENCE_UNAVAILABLE, lang);
          continue;
        }
        if (outcome.author === outcome.verifier || outcome.author !== author) {
          hold(request.confirmationId, PROVIDER_NOT_SEPARATE, lang);
          continue;
        }

        const admission = await openComposition(root, deps);
        if (admission.state === 'HOLD') {
          hold(request.confirmationId, admission.reasonCode, lang);
          continue;
        }
        try {
          report(request.confirmationId, await admission.composition.decideAndSettle({
            confirmationId: request.confirmationId,
            verdict,
            decidedBy: 'llm',
            reason: `xverify:${outcome.verifier}`,
            authorityReceipt: outcome.adjudicationReceiptRef,
            settlementRef: outcome.settlementRef,
          }), lang);
        } finally {
          admission.composition.close();
        }
      }
    });
}
