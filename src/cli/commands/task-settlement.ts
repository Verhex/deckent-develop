import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';

import { loadConfig } from '../../core/config.js';
import { TASKS_DIR } from '../../core/constants.js';
import {
  openTaskSettlementAuthority,
  type OpenTaskSettlementAuthorityResult,
  type TaskSettlementEffectiveStatus,
  type TaskSettlementInspection,
  type TaskSettlementProjection,
} from '../../core/task-settlement-authority.js';
import type {
  InvocationExecutionBackend,
  InvocationPreDispatchReasonCode,
} from '../../core/invocation-receipt.js';
import { getProviderForModel, type Task } from '../../core/task-types.js';
import { resolveTenant } from '../../core/tenant-context.js';
import { validateTaskId } from '../../core/validators.js';
import { resolveWorkerExecutionRoute, withTaskExecutionFence } from './spawn.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { bindArgumentDescriptions } from '../helpers/message-catalog/cli-run.js';

const TASK_SETTLEMENT_DTO_VERSION = 1 as const;

export const TASK_SETTLEMENT_PRE_DISPATCH_REASON_CODES = Object.freeze([
  'no_provider',
  'budget_capability_unsupported',
  'provider_authority_rejected',
  'execution_admission_rejected',
  'command_build_failed',
  'fallback_unreachable',
  'fallback_limit_hold',
  'fallback_exhausted',
] as const satisfies readonly InvocationPreDispatchReasonCode[]);

interface TaskSettleOptions {
  readonly apply?: boolean;
  readonly attestationReason?: string;
  readonly operator?: string;
  readonly reasonCode?: string;
  readonly json?: boolean;
}

export interface TaskSettlementCommandDeps {
  readonly resolveProjectRootFn?: () => string;
  readonly openAuthority?: (projectRoot: string) => OpenTaskSettlementAuthorityResult;
  readonly now?: () => string;
}

export interface TaskSettlementTarget {
  readonly task: Task;
  readonly rawContent: string;
}

export interface TaskSettlementCommandDto {
  readonly schemaVersion: typeof TASK_SETTLEMENT_DTO_VERSION;
  readonly command: 'task.settle';
  readonly mode: 'dry-run' | 'apply';
  readonly taskId: string;
  readonly decision: TaskSettlementInspection['decision'];
  readonly reasonCode: TaskSettlementInspection['reasonCode'];
  /** Echo of validated operator input; never presented as receipt authority. */
  readonly requestedPreDispatchReasonCode: InvocationPreDispatchReasonCode | null;
  /** Non-null only when this invocation atomically persisted that exact cause. */
  readonly settledPreDispatchReasonCode: InvocationPreDispatchReasonCode | null;
  readonly rawStatus: string;
  readonly effectiveStatus: TaskSettlementEffectiveStatus;
  readonly applied: boolean;
  readonly receiptRef: TaskSettlementInspection['receiptRef'] | null;
  readonly evidenceRefs: readonly string[];
}

/** Exact-file read; the original bytes are retained for the immutable task digest. */
export function readTaskSettlementTarget(
  projectRoot: string,
  taskId: string,
): TaskSettlementTarget | null {
  try {
    validateTaskId(taskId);
  } catch {
    return null;
  }
  const path = join(projectRoot, TASKS_DIR, `task-${taskId}.json`);
  if (!existsSync(path)) return null;
  try {
    const rawContent = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(rawContent) as Partial<Task>;
    if (
      parsed.id !== taskId
      || typeof parsed.status !== 'string'
      || typeof parsed.createdAt !== 'string'
      || !Number.isFinite(Date.parse(parsed.createdAt))
    ) return null;
    return { task: parsed as Task, rawContent };
  } catch {
    return null;
  }
}

/** Map task/config routing vocabulary to the receipt's backend vocabulary. */
export function resolveTaskSettlementBackend(
  task: Pick<Task, 'model' | 'provider' | 'backend'>,
  configuredBackend?: string,
): InvocationExecutionBackend {
  let provider = task.provider;
  if (!provider) {
    try {
      provider = getProviderForModel(task.model);
    } catch {
      // Unknown identity cannot justify a guessed backend.
    }
  }
  if (!provider) return 'unknown';
  const requestedBackend = task.backend ?? configuredBackend;
  const route = resolveWorkerExecutionRoute(provider, {
    ...(requestedBackend ? { spawnBackend: requestedBackend } : {}),
  });
  if (route === 'docker' || route === 'tmux') return route;
  if (route === 'subprocess' || route === 'host-adapter') return 'host-subprocess';
  return 'unknown';
}

export function settlementProjectionDto(projection: TaskSettlementProjection): {
  rawStatus: string;
  effectiveStatus: TaskSettlementEffectiveStatus;
  receiptRef: TaskSettlementProjection['receiptRef'] | null;
  evidenceRefs: readonly string[];
  reasonCode: TaskSettlementProjection['reasonCode'];
} {
  return {
    rawStatus: projection.rawStatus,
    effectiveStatus: projection.effectiveStatus,
    receiptRef: projection.receiptRef ?? null,
    evidenceRefs: [...projection.evidenceRefs],
    reasonCode: projection.reasonCode,
  };
}

/** Shared human renderer for task/status/output; all visible labels are localized. */
export function formatTaskSettlementProjection(
  projection: TaskSettlementProjection,
  lang: string,
): string {
  const evidenceRefs = projection.evidenceRefs.length > 0
    ? projection.evidenceRefs.join(',')
    : getMessage('task.settlement.none', lang);
  const reasonCode = projection.reasonCode ?? getMessage('task.settlement.none', lang);
  if (!projection.receiptRef) {
    return getMessage('task.settlement.no_receipt_line', lang, {
      rawStatus: projection.rawStatus,
      effectiveStatus: projection.effectiveStatus,
      reasonCode,
      evidenceRefs,
    });
  }
  return getMessage('task.settlement.evidence_line', lang, {
    rawStatus: projection.rawStatus,
    effectiveStatus: projection.effectiveStatus,
    receiptId: projection.receiptRef.invocationId,
    reasonCode,
    evidenceRefs,
  });
}

function commandDto(
  taskId: string,
  mode: TaskSettlementCommandDto['mode'],
  inspection: TaskSettlementInspection,
  applied: boolean,
  requestedPreDispatchReasonCode: InvocationPreDispatchReasonCode | null,
): TaskSettlementCommandDto {
  return {
    schemaVersion: TASK_SETTLEMENT_DTO_VERSION,
    command: 'task.settle',
    mode,
    taskId,
    decision: inspection.decision,
    reasonCode: inspection.reasonCode,
    requestedPreDispatchReasonCode,
    settledPreDispatchReasonCode:
      applied ? requestedPreDispatchReasonCode : null,
    rawStatus: inspection.rawStatus,
    effectiveStatus: inspection.effectiveStatus,
    applied,
    receiptRef: inspection.receiptRef ?? null,
    evidenceRefs: [...inspection.evidenceRefs],
  };
}

export function taskSettlementDecisionLabel(
  decision: TaskSettlementInspection['decision'],
  lang: string,
): string {
  return getMessage(`task.settle.decision.${decision}`, lang);
}

export function taskSettlementReasonLabel(
  reasonCode: TaskSettlementInspection['reasonCode'],
  lang: string,
): string {
  return getMessage(`task.settle.reason.${reasonCode}`, lang);
}

function printHumanResult(
  dto: TaskSettlementCommandDto,
  lang: string,
): void {
  const receiptId = dto.receiptRef?.invocationId ?? getMessage('task.settlement.none', lang);
  const evidenceRef = dto.evidenceRefs.length > 0
    ? dto.evidenceRefs.join(',')
    : getMessage('task.settlement.none', lang);
  if (dto.mode === 'dry-run') {
    print(getMessage('task.settle.dry_run', lang, {
      taskId: dto.taskId,
      rawStatus: dto.rawStatus,
      effectiveStatus: dto.effectiveStatus,
      decision: taskSettlementDecisionLabel(dto.decision, lang),
      reason: taskSettlementReasonLabel(dto.reasonCode, lang),
    }));
  } else if (dto.applied) {
    print(getMessage('task.settle.applied', lang, {
      taskId: dto.taskId,
      rawStatus: dto.rawStatus,
      effectiveStatus: dto.effectiveStatus,
      receiptId,
      evidenceRef,
    }));
  } else if (dto.decision === 'already-settled') {
    print(getMessage('task.settle.already_settled', lang, {
      taskId: dto.taskId,
      rawStatus: dto.rawStatus,
      effectiveStatus: dto.effectiveStatus,
      receiptId,
    }));
  } else {
    print(getMessage('task.settle.ineligible', lang, {
      taskId: dto.taskId,
      reason: taskSettlementReasonLabel(dto.reasonCode, lang),
    }));
  }
  if (dto.settledPreDispatchReasonCode) {
    print(getMessage('task.settle.pre_dispatch_reason_line', lang, {
      reasonCode: dto.settledPreDispatchReasonCode,
    }));
  } else if (
    dto.requestedPreDispatchReasonCode
    && dto.decision !== 'already-settled'
  ) {
    print(getMessage('task.settle.requested_pre_dispatch_reason_line', lang, {
      reasonCode: dto.requestedPreDispatchReasonCode,
    }));
  }
  print(formatTaskSettlementProjection({
    rawStatus: dto.rawStatus,
    effectiveStatus: dto.effectiveStatus,
    evidenceRefs: dto.evidenceRefs,
    ...(dto.receiptRef ? { receiptRef: dto.receiptRef } : {}),
  }, lang));
}

export function registerTaskSettlement(
  program: Command,
  deps: TaskSettlementCommandDeps = {},
): void {
  const registerLang = getLanguage(undefined);
  const task = program
    .command('task')
    .description(getMessage('task.cmd_desc', registerLang));

  bindArgumentDescriptions(task.command('settle <taskId>'), registerLang, { taskId: 'cliContract.task.arg.taskId' })
    .description(getMessage('task.settle.desc', registerLang))
    .option('--apply', getMessage('task.settle.opt_apply', registerLang))
    .option(
      '--attestation-reason <text>',
      getMessage('task.settle.opt_attestation_reason', registerLang),
    )
    .option('--operator <id>', getMessage('task.settle.opt_operator', registerLang))
    .option(
      '--reason-code <code>',
      getMessage('task.settle.opt_reason_code', registerLang, {
        codes: TASK_SETTLEMENT_PRE_DISPATCH_REASON_CODES.join('|'),
      }),
    )
    .option('--json', getMessage('task.settle.opt_json', registerLang))
    .action(async (taskId: string, opts: TaskSettleOptions) => {
      const root = (deps.resolveProjectRootFn ?? resolveProjectRoot)();
      const lang = getLanguage(undefined);
      const requestedReasonCode = opts.reasonCode?.trim();
      const preDispatchReasonCode = requestedReasonCode
        && TASK_SETTLEMENT_PRE_DISPATCH_REASON_CODES.includes(
          requestedReasonCode as typeof TASK_SETTLEMENT_PRE_DISPATCH_REASON_CODES[number],
        )
        ? requestedReasonCode as InvocationPreDispatchReasonCode
        : null;
      if (requestedReasonCode && !preDispatchReasonCode) {
        printError(new Error(getMessage('task.settle.invalid_reason_code', lang, {
          reasonCode: requestedReasonCode,
          codes: TASK_SETTLEMENT_PRE_DISPATCH_REASON_CODES.join(', '),
        })));
        process.exitCode = 1;
        return;
      }
      try {
        validateTaskId(taskId);
      } catch {
        printError(new Error(getMessage('task.settle.invalid_task_id', lang, { taskId })));
        process.exitCode = 1;
        return;
      }
      if (
        opts.apply
        && (!opts.attestationReason?.trim() || !opts.operator?.trim())
      ) {
        printError(new Error(getMessage('task.settle.apply_guard', lang)));
        process.exitCode = 1;
        return;
      }
      const target = readTaskSettlementTarget(root, taskId);
      if (!target) {
        printError(new Error(getMessage('task.settle.not_found', lang, { taskId })));
        process.exitCode = 1;
        return;
      }

      const opened = (deps.openAuthority ?? ((projectRoot: string) =>
        openTaskSettlementAuthority(projectRoot, {})))(root);
      try {
        const config = await loadConfig(root).catch(() => undefined);
        const tenantId = resolveTenant(root, {
          ...(target.task.actor?.tenantId
            ? { tenantId: target.task.actor.tenantId }
            : {}),
        }).tenantId;
        const baseInput = {
          tenantId,
          projectId: opened.projectId,
          taskId,
          runId: target.task.sprintId ?? taskId,
          executionBackend: resolveTaskSettlementBackend(
            target.task,
            config?.spawn_backend,
          ),
          rawStatus: target.task.status,
          taskContent: target.rawContent,
          taskCreatedAt: target.task.createdAt!,
        };

        const initial = await opened.authority.plan(baseInput);
        const requiresPreDispatchReason =
          initial.reasonCode === 'pre-dispatch-reason-required';
        if (opts.apply && requiresPreDispatchReason && !preDispatchReasonCode) {
          printError(new Error(getMessage('task.settle.reason_code_required', lang, {
            codes: TASK_SETTLEMENT_PRE_DISPATCH_REASON_CODES.join(', '),
          })));
          process.exitCode = 1;
          return;
        }
        const acceptsTypedLegacyReason =
          initial.reasonCode === 'attestation-required';
        const acceptsReplayReason = initial.decision === 'already-settled';
        if (
          preDispatchReasonCode
          && !requiresPreDispatchReason
          && !acceptsTypedLegacyReason
          && !acceptsReplayReason
        ) {
          printError(new Error(getMessage('task.settle.reason_code_not_applicable', lang, {
            reasonCode: preDispatchReasonCode,
            authorityReason: initial.reasonCode,
          })));
          process.exitCode = 1;
          return;
        }
        const hasAttestation = !!opts.attestationReason?.trim() && !!opts.operator?.trim();
        const reasonBoundInput = {
          ...baseInput,
          ...(preDispatchReasonCode ? { reasonCode: preDispatchReasonCode } : {}),
        };
        const input = hasAttestation
          ? {
              ...reasonBoundInput,
              operatorAttestation: {
                operatorId: opts.operator!.trim(),
                reason: opts.attestationReason!.trim(),
                attestedAt: (deps.now ?? (() => new Date().toISOString()))(),
                evidenceRefs: initial.evidenceRefs,
              },
            }
          : reasonBoundInput;
        // Apply performs exactly two observations: one bounded snapshot to bind
        // the operator attestation, then one authoritative re-check inside the
        // atomic settlement call. A third pre-apply probe created a needless
        // TOCTOU window where process-count evidence could drift between checks.
        const inspection = opts.apply
          ? await withTaskExecutionFence(root, taskId, 'settlement', () =>
              opened.authority.settleNotDispatched({ ...input, apply: true }))
          : hasAttestation
            ? await opened.authority.plan(input)
            : initial;
        const initiallyEvidenceEligible = initial.decision === 'eligible'
          || initial.reasonCode === 'attestation-required'
          || initial.reasonCode === 'pre-dispatch-reason-required';
        const applied = opts.apply === true
          && initiallyEvidenceEligible
          && inspection.decision === 'already-settled';
        const dto = commandDto(
          taskId,
          opts.apply ? 'apply' : 'dry-run',
          inspection,
          applied,
          preDispatchReasonCode,
        );
        if (opts.json) print(JSON.stringify(dto, null, 2));
        else printHumanResult(dto, lang);
        if (opts.apply && inspection.decision === 'hold') process.exitCode = 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        printError(new Error(getMessage('task.settle.failed', lang, { message })));
        process.exitCode = 1;
      } finally {
        opened.close();
      }
    });
}
