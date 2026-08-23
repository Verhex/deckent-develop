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
  | 'ATTRIBUTION_BASELINE_CAPTURE_FAILED'
  | 'COORDINATOR_CRASHED_BEFORE_DOCKER_PREPARE'
  | 'LEGACY_HOST_PRE_DISPATCH_REJECTION';

export interface DockerRecoveryAttemptAuthority {
  readonly schemaVersion: 1;
  readonly taskId: string;
  readonly backend: 'docker';
  readonly projectRootSha256: string;
  readonly attemptId: string;
}

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

/**
 * Project a host-settled Docker attempt that never reached PREPARED into the
 * canonical zero-work pre-dispatch contract. The caller must first establish
 * the durable settlement/closure authority; this helper only validates the
 * exact recovery payload and binds it to that immutable attempt identity.
 *
 * Generic return shape preserves legacy recovery payloads without pretending
 * they were worker-authored TaskResultV1 records.
 */
export function projectDockerRecoveryPreDispatchSettlement<T>(
  value: T,
  authority: DockerRecoveryAttemptAuthority,
): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const result = value as Record<string, unknown>;
  const isExactZeroWorkRecovery = result.taskId === authority.taskId
    && result.workerId === `docker-recovery-${authority.taskId}`
    && Array.isArray(result.filesChanged)
    && result.filesChanged.length === 0
    && result.linesAdded === 0
    && result.linesRemoved === 0
    && result.testsPassed === false
    && result.selfAssessment === 'NO_GO'
    && result.notes === `DECKENT_E091:coordinator-crashed-before-docker-prepare:${authority.attemptId}`;
  if (!isExactZeroWorkRecovery) return value;

  const detail = canonicalJson({
    domain: 'deckent.docker-recovery-pre-dispatch.v1',
    authority,
  });
  const digest = sha256(detail);
  return {
    ...result,
    preDispatchSettlement: {
      version: HOST_PRE_DISPATCH_SETTLEMENT_VERSION,
      state: 'NOT_DISPATCHED',
      attemptId: `host-pre-dispatch:${authority.taskId}:${digest.slice(0, 32)}`,
      reasonCode: 'COORDINATOR_CRASHED_BEFORE_DOCKER_PREPARE',
      evidenceRef: `host-pre-dispatch-settlement:sha256:${digest}`,
    },
  } as T;
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
