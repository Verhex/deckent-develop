import { createHash } from 'node:crypto';

import type {
  HostPreDispatchSettlement,
  Task,
  TaskResult,
} from './task-types.js';

export const HOST_PRE_DISPATCH_SETTLEMENT_VERSION = 1 as const;

export type HostPreDispatchReasonCode =
  | 'PROVIDER_ADAPTER_UNAVAILABLE'
  | 'FORCED_SKILL_UNAVAILABLE'
  | 'LEGACY_HOST_PRE_DISPATCH_REJECTION';

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function buildSettlement(
  taskId: string,
  sprintId: string | undefined,
  provider: string | undefined,
  model: string | undefined,
  reasonCode: HostPreDispatchReasonCode,
  detail: string,
): HostPreDispatchSettlement {
  const material = {
    domain: 'deckent.host-pre-dispatch-settlement.v1',
    taskId,
    sprintId: sprintId ?? null,
    provider: provider ?? null,
    model: model ?? null,
    reasonCode,
    detail,
  };
  const digest = sha256(material);
  return Object.freeze({
    version: HOST_PRE_DISPATCH_SETTLEMENT_VERSION,
    state: 'NOT_DISPATCHED',
    attemptId: `host-pre-dispatch:${taskId}:${digest.slice(0, 32)}`,
    reasonCode,
    evidenceRef: `host-pre-dispatch-settlement:sha256:${digest}`,
  });
}

/**
 * Build a host-authored zero-work result for a rejection that happens before
 * any worker/backend invocation. This is terminal attempt evidence, not a
 * worker claim and not synthetic work attribution.
 */
export function createHostPreDispatchNoGoResult(
  task: Task,
  reasonCode: Exclude<HostPreDispatchReasonCode, 'LEGACY_HOST_PRE_DISPATCH_REJECTION'>,
  detail: string,
): TaskResult {
  return {
    taskId: task.id,
    workerId: `honestfail-${task.id}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: detail,
    preDispatchSettlement: buildSettlement(
      task.id,
      task.sprintId,
      task.provider,
      task.model,
      reasonCode,
      detail,
    ),
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      ...(task.provider ? { provider: task.provider } : {}),
      model: task.model,
    },
  };
}

function explicitSettlementIsValid(
  result: TaskResult,
  settlement: HostPreDispatchSettlement,
): boolean {
  return settlement.version === HOST_PRE_DISPATCH_SETTLEMENT_VERSION
    && settlement.state === 'NOT_DISPATCHED'
    && settlement.attemptId.startsWith(`host-pre-dispatch:${result.taskId}:`)
    && settlement.attemptId.trim() === settlement.attemptId
    && settlement.reasonCode.trim().length > 0
    && settlement.evidenceRef.startsWith('host-pre-dispatch-settlement:sha256:')
    && /^[a-f0-9]{64}$/u.test(settlement.evidenceRef.slice(settlement.evidenceRef.lastIndexOf(':') + 1));
}

/**
 * Resolve explicit v1 settlement evidence. The strict legacy branch exists so
 * paused runs created before v1 can be finalized without rewriting their raw
 * result: only Deckent's reserved honestfail identity plus an exact zero-work
 * NO_GO shape is eligible. Worker prose is deliberately not consulted.
 */
export function resolveHostPreDispatchSettlement(
  result: TaskResult | undefined,
): HostPreDispatchSettlement | null {
  if (!result) return null;
  if (
    result.preDispatchSettlement
    && explicitSettlementIsValid(result, result.preDispatchSettlement)
  ) return result.preDispatchSettlement;

  const legacyZeroWork = result.workerId === `honestfail-${result.taskId}`
    && result.selfAssessment === 'NO_GO'
    && result.workAttribution === undefined
    && (result.filesChanged?.length ?? 0) === 0
    && (result.linesAdded ?? 0) === 0
    && (result.linesRemoved ?? 0) === 0
    && result.testsPassed === false;
  if (!legacyZeroWork) return null;

  return buildSettlement(
    result.taskId,
    undefined,
    result.tokenUsage?.provider,
    result.tokenUsage?.model,
    'LEGACY_HOST_PRE_DISPATCH_REJECTION',
    'reserved honestfail identity with exact zero-work NO_GO result',
  );
}
