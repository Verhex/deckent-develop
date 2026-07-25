import { createHash } from 'node:crypto';

import {
  createDockerExecutionTerminationBindingInput,
  ExecutionTerminationLedger,
} from '../core/execution-termination-ledger.js';
import { providerLimitReservationEvidenceRef } from '../core/provider-limit-admission.js';
import type {
  ProviderLimitReservation,
  ProviderLimitReservationEvent,
} from '../core/provider-limit-truth.js';
import {
  readTaskProviderActualCallReceipt,
  readTaskProviderTerminalBillingReceipt,
  readTaskProviderTerminalUsageReceipt,
  readTaskResultSettlement,
  readTaskResultSettlementClosure,
  readTaskResultSettlementDispatch,
  readTaskResultSettlementLandedRetirement,
  taskProviderActualCallEvidenceRef,
  taskProviderTerminalBillingEvidenceRef,
  taskProviderTerminalUsageEvidenceRef,
  writeTaskProviderActualCallReceiptAtomic,
  type TaskResultSettlementRefV1,
} from '../core/task-result-settlement.js';
import { canonicalJson } from '../core/audit-writer.js';
import { createExecutionAuthorityError } from '../core/errors.js';
import type { SpawnBackendOptions } from './spawn-backend.js';
import {
  DockerSpawnBackend,
  type DockerExactCrossVerifyTerminationAuthority,
} from './spawn-backend-docker.js';
import type {
  CrossVerifyHostObservation,
  CrossVerifyHostObservationAuthority,
  CrossVerifyInvocationExecutionGrant,
  CrossVerifyProviderUsageAuthority,
  CrossVerifyProviderUsagePreflight,
  CrossVerifyProviderUsageProjection,
  CrossVerifyStrictExecutionRequest,
  CrossVerifyStrictLauncher,
  CrossVerifyTerminalEvidenceBundle,
} from './cross-verify-invocation-coordinator.js';

interface CrossVerifyDockerRuntimeOptions {
  readonly now?: () => Date;
  readonly pollIntervalMs?: number;
  readonly maxObservationMs?: number;
  readonly delay?: (milliseconds: number) => Promise<void>;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function evidenceRef(kind: string, value: unknown): string {
  return `${kind}:${sha256(canonicalJson(value))}`;
}

function sameRef(
  left: Readonly<TaskResultSettlementRefV1>,
  right: Readonly<TaskResultSettlementRefV1>,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.taskId === right.taskId
    && left.backend === right.backend
    && left.projectRootSha256 === right.projectRootSha256
    && left.attemptId === right.attemptId;
}

function sameReservation(
  left: Readonly<ProviderLimitReservation>,
  right: Readonly<ProviderLimitReservation>,
): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function reservationMatchesGrant(
  grant: Readonly<CrossVerifyInvocationExecutionGrant>,
): boolean {
  const reservation = grant.reservation;
  return reservation.reservationId === grant.reservationId
    && reservation.tenantId === grant.tenantId
    && reservation.projectId === grant.projectId
    && reservation.runId === grant.runId
    && reservation.taskId === grant.taskId
    && reservation.callId === grant.callId
    && reservation.attemptId === grant.attemptId
    && reservation.fenceTokenHash === grant.fenceTokenHash
    && reservation.provider === grant.provider
    && reservation.model === grant.model
    && reservation.authMode === grant.auth.mode
    && reservation.accountRefHash === grant.auth.accountRefHash
    && reservation.backend.transport === grant.backend.transport
    && reservation.backend.executionBackend === grant.backend.executionBackend
    && reservation.backend.endpointRefHash === grant.backend.endpointRefHash;
}

export function crossVerifyTerminationBindingId(
  grant: Pick<CrossVerifyInvocationExecutionGrant,
    'tenantId' | 'projectId' | 'runId' | 'taskId' | 'callId' | 'attemptId' | 'reservationId'>,
): string {
  return `xv-bind-${sha256(canonicalJson(grant)).slice(0, 48)}`;
}

function crossVerifyTerminationTerminalId(
  grant: Pick<CrossVerifyInvocationExecutionGrant,
    'tenantId' | 'projectId' | 'runId' | 'taskId' | 'callId' | 'attemptId' | 'reservationId'>,
): string {
  return `xv-term-${sha256(canonicalJson(grant)).slice(0, 48)}`;
}

export class CrossVerifyDockerTerminationAuthority
implements DockerExactCrossVerifyTerminationAuthority {
  constructor(
    private readonly ledger: ExecutionTerminationLedger,
    private readonly grant: Readonly<CrossVerifyInvocationExecutionGrant>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  bindPreparedAttempt(input: {
    readonly settlementRef: Readonly<TaskResultSettlementRefV1>;
    readonly executionContract: CrossVerifyInvocationExecutionGrant['executionContract'];
  }) {
    if (!sameRef(input.settlementRef, this.grant.executionContract.settlementAttemptRef)
      || input.executionContract.contractSha256
        !== this.grant.executionContract.contractSha256
      || !reservationMatchesGrant(this.grant)) {
      throw createExecutionAuthorityError(
        'Cross-verify termination authority differs from the exact execution grant',
      );
    }
    const bindingId = crossVerifyTerminationBindingId(this.grant);
    const write = this.ledger.putBinding(createDockerExecutionTerminationBindingInput({
      bindingId,
      reservation: this.grant.reservation,
      reservationEvidenceRef:
        providerLimitReservationEvidenceRef(this.grant.reservation.reservationId),
      settlementRef: input.settlementRef,
      createdAt: this.now().toISOString(),
    }));
    return Object.freeze({
      bindingId,
      evidenceRef: write.evidenceRef,
      authorityRef: write.authorityRef,
    });
  }
}

export function createCrossVerifyDockerStrictLauncher(input: {
  readonly backend: DockerSpawnBackend;
  readonly terminationLedger: ExecutionTerminationLedger;
  readonly optionsFor: (
    grant: Readonly<CrossVerifyInvocationExecutionGrant>,
    request: Readonly<CrossVerifyStrictExecutionRequest>,
  ) => SpawnBackendOptions;
  readonly now?: () => Date;
}): CrossVerifyStrictLauncher {
  return async (grant, request) => {
    if (grant.backend.executionBackend !== 'docker'
      || grant.executionContract.executionBackend !== 'docker'
      || !reservationMatchesGrant(grant)) {
      throw createExecutionAuthorityError(
        'Cross-verify Docker launcher received a non-Docker execution grant',
      );
    }
    return input.backend.spawnExactCrossVerify({
      taskId: grant.taskId,
      model: grant.model,
      prompt: request.dispatchedPrompt,
      executionContract: grant.executionContract,
      settlementRef: grant.executionContract.settlementAttemptRef,
      options: input.optionsFor(grant, request),
      terminationAuthority: new CrossVerifyDockerTerminationAuthority(
        input.terminationLedger,
        grant,
        input.now,
      ),
    });
  };
}

function hold(
  reasonCode: Extract<CrossVerifyHostObservation, { state: 'hold' }>['reasonCode'],
  detail: unknown,
): Extract<CrossVerifyHostObservation, { state: 'hold' }> {
  return {
    state: 'hold',
    reasonCode,
    authorityEvidenceRef: evidenceRef('xverify-docker-observation-hold', {
      reasonCode,
      detail,
    }),
  };
}

function terminalProtocolFromSettlement(
  settlement: NonNullable<ReturnType<typeof readTaskResultSettlement>>,
): string | null {
  const projection = settlement.result['hostTerminalProjection'];
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) return null;
  const host = projection as Record<string, unknown>;
  if (host['version'] !== 1
    || host['protocol'] !== 'xverify-v1'
    || host['observedBy'] !== 'host') return null;
  const notes = settlement.result['notes'];
  if (typeof notes !== 'string') return null;
  const lines = notes.trim().split(/\r?\n/u).map((line: string) => line.trim());
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/^VERDICT:\s*(?:REFUTED|CONFIRMED|UNCLEAR)\s+.+$/iu.test(lines[index]!)) {
      return lines[index]!;
    }
  }
  return null;
}

function transportDurationMs(
  closedAt: string,
  observedAt: string,
): number {
  return Math.max(0, Date.parse(closedAt) - Date.parse(observedAt));
}

export class CrossVerifyDockerHostObservationAuthority
implements CrossVerifyHostObservationAuthority {
  private readonly now: () => Date;
  private readonly pollIntervalMs: number;
  private readonly maxObservationMs: number;
  private readonly delay: (milliseconds: number) => Promise<void>;

  constructor(
    private readonly terminationLedger: ExecutionTerminationLedger,
    options: CrossVerifyDockerRuntimeOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.pollIntervalMs = options.pollIntervalMs ?? 250;
    this.maxObservationMs = options.maxObservationMs ?? 1_200_000;
    this.delay = options.delay
      ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  }

  async observe(input: {
    readonly grant: Readonly<CrossVerifyInvocationExecutionGrant>;
    readonly reservation: ProviderLimitReservation;
    readonly dispatch: {
      readonly settlementRef: Readonly<TaskResultSettlementRefV1>;
      readonly outputArtifactRef: string;
    };
  }): Promise<CrossVerifyHostObservation> {
    const { grant, reservation, dispatch } = input;
    if (!sameReservation(grant.reservation, reservation)
      || !reservationMatchesGrant(grant)
      || !sameRef(dispatch.settlementRef, grant.executionContract.settlementAttemptRef)) {
      return hold('authority_failure', 'grant-reservation-dispatch-mismatch');
    }
    const deadline = this.now().getTime() + Math.min(
      grant.executionContract.timeoutMs,
      this.maxObservationMs,
    );
    let closure: ReturnType<typeof readTaskResultSettlementClosure>;
    let landedRetirement: ReturnType<typeof readTaskResultSettlementLandedRetirement>;
    try {
      closure = readTaskResultSettlementClosure(dispatch.settlementRef);
      landedRetirement = readTaskResultSettlementLandedRetirement(dispatch.settlementRef);
      while (!closure && !landedRetirement && this.now().getTime() < deadline) {
        await this.delay(this.pollIntervalMs);
        closure = readTaskResultSettlementClosure(dispatch.settlementRef);
        landedRetirement = readTaskResultSettlementLandedRetirement(dispatch.settlementRef);
      }
    } catch (error) {
      return hold(
        'authority_failure',
        error instanceof Error ? error.message : String(error),
      );
    }
    if (!closure && !landedRetirement) {
      return hold('settlement_incomplete', dispatch.settlementRef);
    }
    if (closure && landedRetirement) {
      return hold('authority_failure', 'closure-and-landed-retirement-conflict');
    }
    const dockerDispatch = readTaskResultSettlementDispatch(dispatch.settlementRef);

    const bindingId = crossVerifyTerminationBindingId(grant);
    try {
      const terminal = this.terminationLedger.recordDockerTerminal({
        terminalId: crossVerifyTerminationTerminalId(grant),
        bindingId,
        settlementRef: dispatch.settlementRef,
        capacityDisposition:
          landedRetirement
            ? 'consumed'
            : dockerDispatch && closure!.containerDisposition !== 'not-dispatched'
            ? 'consumed'
            : 'released',
      });
      if (landedRetirement) {
        return {
          state: 'hold',
          reasonCode: 'execution_lineage_partial',
          authorityEvidenceRef: terminal.evidenceRef,
        };
      }
      const settlement = readTaskResultSettlement(dispatch.settlementRef);
      if (!settlement) return hold('settlement_incomplete', closure);
      if (!dockerDispatch || closure!.containerDisposition === 'not-dispatched') {
        const rejected = this.noCallTerminal(grant, settlement, closure!, terminal.evidenceRef);
        return {
          state: 'settled',
          terminal: rejected,
          authorityEvidenceRef: evidenceRef('xverify-docker-observation', rejected),
        };
      }
      let actualCall = readTaskProviderActualCallReceipt(dispatch.settlementRef);
      if (!actualCall && readTaskProviderTerminalBillingReceipt(dispatch.settlementRef)) {
        try {
          actualCall = writeTaskProviderActualCallReceiptAtomic(dispatch.settlementRef);
        } catch {
          actualCall = null;
        }
      }
      if (!actualCall) return hold('actual_call_unproven', dispatch.settlementRef);
      const terminalUsage = readTaskProviderTerminalUsageReceipt(dispatch.settlementRef);
      const billing = readTaskProviderTerminalBillingReceipt(dispatch.settlementRef);
      if (!terminalUsage || !billing) {
        return hold('provider_envelope_incomplete', dispatch.settlementRef);
      }
      const output = terminalProtocolFromSettlement(settlement);
      const accepted = settlement.exitCode === 0 && output !== null;
      const bundle: CrossVerifyTerminalEvidenceBundle = {
        output: output ?? '',
        actualCall: {
          provider: actualCall.provider,
          model: actualCall.model,
          backend: {
            transport: actualCall.transport,
            executionBackend: actualCall.executionBackend,
            endpointRefHash: actualCall.endpointRefHash,
            executionProfileRef: actualCall.executionProfileRef,
          },
          auth: {
            mode: actualCall.authMode,
            accountRefHash: actualCall.accountRefHash,
          },
          evidenceRef: taskProviderActualCallEvidenceRef(actualCall),
        },
        execution: {
          outcome: settlement.exitCode === 0 ? 'completed' : 'failed',
          initialAttemptId: grant.attemptId,
          terminalAttemptId: grant.attemptId,
          cumulativeUsage: { ...terminalUsage.counters },
        },
        lineage: {
          coverage: 'complete',
          attemptIds: [grant.attemptId],
          settlementEvidenceRefs: [
            evidenceRef('task-result-settlement', settlement),
            terminal.evidenceRef,
          ],
        },
        usageEvidenceRefs: [
          taskProviderTerminalUsageEvidenceRef(terminalUsage),
          taskProviderTerminalBillingEvidenceRef(billing),
        ],
        transportEvent: {
          eventId: `xv-transport-${sha256(grant.receiptRef.invocationId).slice(0, 40)}`,
          type: 'transport_settled',
          payload: {
            outcome: settlement.exitCode === 0 ? 'succeeded' : 'failed',
            exitCode: settlement.exitCode,
            signal: null,
            reasonCode: settlement.exitCode === 0 ? 'none' : 'nonzero_exit',
            durationMs: transportDurationMs(closure!.closedAt, actualCall.observedAt),
          },
        },
        consumerEvent: {
          eventId: `xv-consumer-${sha256(grant.receiptRef.invocationId).slice(0, 40)}`,
          type: 'consumer_settled',
          payload: {
            outcome: accepted ? 'accepted' : 'rejected',
            reasonCode: accepted ? 'none' : 'parse_failed',
          },
        },
      };
      return {
        state: 'settled',
        terminal: bundle,
        authorityEvidenceRef: evidenceRef('xverify-docker-observation', bundle),
      };
    } catch (error) {
      return hold(
        'authority_failure',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private noCallTerminal(
    grant: Readonly<CrossVerifyInvocationExecutionGrant>,
    settlement: NonNullable<ReturnType<typeof readTaskResultSettlement>>,
    closure: NonNullable<ReturnType<typeof readTaskResultSettlementClosure>>,
    terminationEvidenceRef: string,
  ): CrossVerifyTerminalEvidenceBundle {
    return {
      output: '',
      actualCall: null,
      execution: {
        outcome: 'failed',
        initialAttemptId: grant.attemptId,
        terminalAttemptId: grant.attemptId,
        cumulativeUsage: {
          turns: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          totalTokens: 0,
          maxContextTokens: 0,
        },
      },
      lineage: {
        coverage: 'complete',
        attemptIds: [grant.attemptId],
        settlementEvidenceRefs: [
          evidenceRef('task-result-settlement', settlement),
          terminationEvidenceRef,
        ],
      },
      usageEvidenceRefs: [],
      transportEvent: {
        eventId: `xv-transport-${sha256(grant.receiptRef.invocationId).slice(0, 40)}`,
        type: 'transport_settled',
        payload: {
          outcome: 'failed',
          exitCode: settlement.exitCode,
          signal: null,
          reasonCode: 'spawn_error',
          durationMs: transportDurationMs(closure.closedAt, settlement.settledAt),
        },
      },
      consumerEvent: {
        eventId: `xv-consumer-${sha256(grant.receiptRef.invocationId).slice(0, 40)}`,
        type: 'consumer_settled',
        payload: { outcome: 'rejected', reasonCode: 'validation_failed' },
      },
    };
  }
}

const SUPPORTED_UNITS = new Set(['tokens', 'usd', 'requests']);

export class CrossVerifyDockerProviderUsageAuthority
implements CrossVerifyProviderUsageAuthority {
  constructor(
    private readonly terminationLedger: ExecutionTerminationLedger,
    private readonly supportedProviders: ReadonlySet<string> = new Set(['claude']),
    private readonly now: () => Date = () => new Date(),
  ) {}

  preflight(input: {
    readonly reservation: ProviderLimitReservation;
    readonly executionProfileRef: string;
  }): CrossVerifyProviderUsagePreflight {
    const { reservation } = input;
    if (!this.supportedProviders.has(reservation.provider)
      || reservation.backend.executionBackend !== 'docker'
      || reservation.estimates.length === 0
      || reservation.estimates.some(estimate => !SUPPORTED_UNITS.has(estimate.unit))) {
      return {
        state: 'hold',
        reasonCode: 'window_mapper_unavailable',
        authorityEvidenceRef: evidenceRef('xverify-usage-preflight-hold', {
          provider: reservation.provider,
          backend: reservation.backend,
          estimates: reservation.estimates,
          executionProfileRef: input.executionProfileRef,
        }),
      };
    }
    return {
      state: 'ready',
      authorityEvidenceRef: evidenceRef('xverify-usage-preflight', {
        provider: reservation.provider,
        accountRefHash: reservation.accountRefHash,
        quotaScopeRefHash: reservation.quotaScopeRefHash,
        executionProfileRef: input.executionProfileRef,
        estimates: reservation.estimates,
      }),
    };
  }

  project(input: {
    readonly grant: Readonly<CrossVerifyInvocationExecutionGrant>;
    readonly reservation: ProviderLimitReservation;
    readonly terminal: Readonly<CrossVerifyTerminalEvidenceBundle>;
  }): CrossVerifyProviderUsageProjection {
    const { grant, reservation, terminal } = input;
    if (!sameReservation(grant.reservation, reservation)) {
      return this.usageHold('window_scope_mismatch', 'reservation-drift');
    }
    const bindingId = crossVerifyTerminationBindingId(grant);
    const binding = this.terminationLedger.getBinding(bindingId);
    if (!binding) return this.usageHold('termination_unverified', bindingId);
    const ref = grant.executionContract.settlementAttemptRef;
    const terminalUsage = readTaskProviderTerminalUsageReceipt(ref);
    const billing = readTaskProviderTerminalBillingReceipt(ref);
    const actualCall = readTaskProviderActualCallReceipt(ref);

    if (terminal.actualCall === null) {
      const terminalEvidence = terminal.lineage.settlementEvidenceRefs
        .find(refValue => refValue.startsWith('execution-termination:'));
      if (!terminalEvidence) {
        return this.usageHold('termination_unverified', 'release-evidence-missing');
      }
      const termination = this.terminationLedger.getTerminalByEvidenceRef(terminalEvidence);
      if (!termination || termination.value.capacityDisposition !== 'released') {
        return this.usageHold('termination_unverified', terminalEvidence);
      }
      const event: ProviderLimitReservationEvent & { readonly type: 'released' } = {
        eventId: `xv-release-${sha256(reservation.reservationId).slice(0, 40)}`,
        type: 'released',
        occurredAt: this.now().toISOString(),
        fenceTokenHash: grant.fenceTokenHash,
        evidenceRef: evidenceRef('xverify-usage-release', termination.value),
        terminationEvidenceRef: termination.evidenceRef,
        terminationAuthorityRef: termination.authorityRef,
      };
      return {
        state: 'settled',
        event,
        authorityEvidenceRef: event.evidenceRef,
      };
    }

    const terminalEvidence = terminal.lineage.settlementEvidenceRefs
      .find(refValue => refValue.startsWith('execution-termination:'));
    const termination = terminalEvidence
      ? this.terminationLedger.getTerminalByEvidenceRef(terminalEvidence)
      : null;
    if (!termination
      || termination.value.bindingId !== bindingId
      || termination.value.capacityDisposition !== 'consumed') {
      return this.usageHold('termination_unverified', terminalEvidence ?? bindingId);
    }
    if (!terminalUsage || !billing || !actualCall) {
      return this.usageHold('usage_evidence_missing', ref);
    }
    if (terminal.lineage.coverage !== 'complete'
      || terminal.lineage.attemptIds.length !== 1
      || terminal.lineage.attemptIds[0] !== grant.attemptId) {
      return this.usageHold('usage_lineage_partial', terminal.lineage);
    }
    if (terminal.actualCall.evidenceRef !== taskProviderActualCallEvidenceRef(actualCall)
      || actualCall.provider !== reservation.provider
      || actualCall.model !== reservation.model) {
      return this.usageHold('actual_call_mismatch', actualCall);
    }
    const actual = reservation.estimates.map(estimate => ({
      windowId: estimate.windowId,
      unit: estimate.unit,
      amount: estimate.unit === 'tokens'
        ? terminalUsage.counters.totalTokens
        : estimate.unit === 'usd'
          ? billing.billing.providerReportedUsd
          : 1,
    }));
    const event: ProviderLimitReservationEvent & { readonly type: 'consumed' } = {
      eventId: `xv-consumed-${sha256(reservation.reservationId).slice(0, 40)}`,
      type: 'consumed',
      occurredAt: this.now().toISOString(),
      fenceTokenHash: grant.fenceTokenHash,
      evidenceRef: evidenceRef('xverify-usage-consumed', {
        actual,
        actualCall: taskProviderActualCallEvidenceRef(actualCall),
        terminalUsage: taskProviderTerminalUsageEvidenceRef(terminalUsage),
        billing: taskProviderTerminalBillingEvidenceRef(billing),
      }),
      actual,
    };
    return {
      state: 'settled',
      event,
      authorityEvidenceRef: event.evidenceRef,
    };
  }

  private usageHold(
    reasonCode: Extract<CrossVerifyProviderUsageProjection, { state: 'hold' }>['reasonCode'],
    detail: unknown,
  ): Extract<CrossVerifyProviderUsageProjection, { state: 'hold' }> {
    return {
      state: 'hold',
      reasonCode,
      authorityEvidenceRef: evidenceRef('xverify-usage-hold', { reasonCode, detail }),
    };
  }
}
