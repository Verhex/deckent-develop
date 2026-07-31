import {
  decideExecutionRecovery,
  type ExecutionRecoveryIdentity,
  type ExecutionRecoveryOutcome,
} from '../core/execution-recovery.js';
import {
  applyFencedEffect,
  deriveFencedEffects,
  inspectWithIntegrityGuard,
  type ExecutionRecoveryAdapterCapability,
  type ExecutionRecoveryAdapterFailureCode,
  type ExecutionRecoveryFencedEffect,
  type ExecutionRecoveryMode,
  type ExecutionRecoveryModeAdapter,
  type ExecutionRecoveryPlatform,
} from './execution-recovery-adapter.js';

export type ExecutionRecoveryMutation = 'resume' | 'settle' | 'abort' | 'terminate';

export interface ExecutionRecoveryServiceIdentity extends ExecutionRecoveryIdentity {
  readonly executionId: string;
  readonly generation: number;
}

export interface ExecutionRecoveryApproval {
  readonly approvalRef: string;
  readonly operation: ExecutionRecoveryMutation;
  readonly identity: ExecutionRecoveryServiceIdentity;
  readonly idempotencyKey: string;
  readonly leaseFence: string;
}

export interface ExecutionRecoveryClock {
  now(): string;
}

export interface ExecutionRecoveryProcessIdentityAuthority {
  verify(
    identity: ExecutionRecoveryServiceIdentity,
  ): Promise<
    | { readonly ok: true; readonly evidenceRef: string }
    | { readonly ok: false; readonly reason: string }
  >;
}

export interface ExecutionRecoveryCoordinatorDeathAuthority {
  verifyDead(
    identity: ExecutionRecoveryServiceIdentity,
  ): Promise<
    | { readonly ok: true; readonly evidenceRef: string }
    | { readonly ok: false; readonly reason: string }
  >;
}

export interface ExecutionRecoveryCommand {
  readonly identity: ExecutionRecoveryServiceIdentity;
  readonly operation: ExecutionRecoveryMutation;
  readonly idempotencyKey: string;
  readonly expectedSequence: number;
}

export type ExecutionRecoveryReservation =
  | { readonly status: 'accepted'; readonly sequence: number }
  | { readonly status: 'duplicate'; readonly receipt: ExecutionRecoveryReceipt }
  | { readonly status: 'out-of-order'; readonly currentSequence: number };

export interface ExecutionRecoveryPersistence {
  reserve(command: ExecutionRecoveryCommand): Promise<ExecutionRecoveryReservation>;
  commit(receipt: ExecutionRecoveryReceipt): Promise<boolean>;
}

export interface ExecutionRecoveryReceipt {
  readonly version: 1;
  readonly receiptId: string;
  readonly sequence: number;
  readonly recordedAt: string;
  readonly identity: ExecutionRecoveryServiceIdentity;
  readonly mode: ExecutionRecoveryMode;
  readonly platform: ExecutionRecoveryPlatform;
  readonly operation: ExecutionRecoveryMutation;
  readonly idempotencyKey: string;
  readonly approvalRef: string;
  readonly processIdentityEvidenceRef: string;
  readonly decision: ExecutionRecoveryOutcome['decision'];
  readonly evidenceRefs: readonly string[];
  readonly status: 'APPLIED' | 'EFFECT_FAILED';
  readonly failureCode?: ExecutionRecoveryAdapterFailureCode;
}

export type ExecutionRecoveryInspectionResult =
  | {
      readonly ok: true;
      readonly identity: ExecutionRecoveryServiceIdentity;
      readonly outcome: ExecutionRecoveryOutcome;
    }
  | {
      readonly ok: false;
      readonly code: ExecutionRecoveryAdapterFailureCode | 'ADAPTER_NOT_REGISTERED';
    };

export type ExecutionRecoveryMutationResult =
  | { readonly ok: true; readonly receipt: ExecutionRecoveryReceipt }
  | {
      readonly ok: false;
      readonly disposition: 'HOLD';
      readonly code: 'COORDINATOR_DEATH_UNVERIFIED';
      readonly reason: string;
    }
  | {
      readonly ok: false;
      readonly code:
        | ExecutionRecoveryAdapterFailureCode
        | 'ADAPTER_NOT_REGISTERED'
        | 'APPROVAL_MISMATCH'
        | 'PROCESS_IDENTITY_MISMATCH'
        | 'OPERATION_NOT_ALLOWED'
        | 'DUPLICATE'
        | 'OUT_OF_ORDER'
        | 'DURABILITY_FAILURE';
      readonly receipt?: ExecutionRecoveryReceipt;
    };

export interface ExecutionRecoveryAdapterRegistration<TNativeEvidence = unknown> {
  readonly adapter: ExecutionRecoveryModeAdapter<TNativeEvidence>;
}

export interface ExecutionRecoveryServiceDependencies {
  readonly clock: ExecutionRecoveryClock;
  readonly processIdentity: ExecutionRecoveryProcessIdentityAuthority;
  readonly coordinatorDeath?: ExecutionRecoveryCoordinatorDeathAuthority;
  readonly persistence: ExecutionRecoveryPersistence;
  readonly adapters: readonly ExecutionRecoveryAdapterRegistration<never>[];
}

export interface ExecutionRecoveryTarget<TNativeEvidence> {
  readonly mode: ExecutionRecoveryMode;
  readonly platform: ExecutionRecoveryPlatform;
  readonly identity: ExecutionRecoveryServiceIdentity;
  readonly nativeEvidence: TNativeEvidence;
}

function sameIdentity(
  left: ExecutionRecoveryServiceIdentity,
  right: ExecutionRecoveryServiceIdentity,
): boolean {
  return left.executionId === right.executionId
    && left.generation === right.generation
    && left.taskId === right.taskId
    && left.attemptId === right.attemptId
    && left.fenceToken === right.fenceToken;
}

function freezeReceipt(receipt: ExecutionRecoveryReceipt): ExecutionRecoveryReceipt {
  Object.freeze(receipt.identity);
  Object.freeze(receipt.evidenceRefs);
  return Object.freeze(receipt);
}

function capabilityFor(operation: ExecutionRecoveryMutation): ExecutionRecoveryAdapterCapability {
  return operation;
}

export class ExecutionRecoveryService {
  readonly #clock: ExecutionRecoveryClock;
  readonly #processIdentity: ExecutionRecoveryProcessIdentityAuthority;
  readonly #coordinatorDeath?: ExecutionRecoveryCoordinatorDeathAuthority;
  readonly #persistence: ExecutionRecoveryPersistence;
  readonly #adapters: ReadonlyMap<string, ExecutionRecoveryModeAdapter<unknown>>;

  constructor(dependencies: ExecutionRecoveryServiceDependencies) {
    this.#clock = dependencies.clock;
    this.#processIdentity = dependencies.processIdentity;
    this.#coordinatorDeath = dependencies.coordinatorDeath;
    this.#persistence = dependencies.persistence;
    const adapters = new Map<string, ExecutionRecoveryModeAdapter<unknown>>();
    for (const registration of dependencies.adapters) {
      const adapter = registration.adapter as ExecutionRecoveryModeAdapter<unknown>;
      const key = this.#adapterKey(adapter.mode, adapter.platform);
      if (adapters.has(key)) {
        throw new Error(`Duplicate execution recovery adapter registration: ${key}`);
      }
      adapters.set(key, adapter);
    }
    this.#adapters = adapters;
  }

  inspect<TNativeEvidence>(
    target: ExecutionRecoveryTarget<TNativeEvidence>,
  ): ExecutionRecoveryInspectionResult {
    const adapter = this.#adapter(target.mode, target.platform);
    if (!adapter) {
      return { ok: false, code: 'ADAPTER_NOT_REGISTERED' };
    }
    const inspected = inspectWithIntegrityGuard(
      adapter,
      target.identity,
      target.nativeEvidence,
    );
    if (!inspected.ok) {
      return { ok: false, code: inspected.code };
    }
    return {
      ok: true,
      identity: target.identity,
      outcome: decideExecutionRecovery(inspected.value),
    };
  }

  async mutate<TNativeEvidence>(
    target: ExecutionRecoveryTarget<TNativeEvidence>,
    operation: ExecutionRecoveryMutation,
    approval: ExecutionRecoveryApproval,
    expectedSequence: number,
  ): Promise<ExecutionRecoveryMutationResult> {
    if (
      approval.operation !== operation
      || approval.idempotencyKey.length === 0
      || approval.approvalRef.length === 0
      || approval.leaseFence !== target.identity.fenceToken
      || !sameIdentity(approval.identity, target.identity)
    ) {
      return { ok: false, code: 'APPROVAL_MISMATCH' };
    }

    const inspected = this.inspect(target);
    if (!inspected.ok) {
      return inspected;
    }
    const adapter = this.#adapter(target.mode, target.platform);
    if (!adapter) {
      return { ok: false, code: 'ADAPTER_NOT_REGISTERED' };
    }
    const effect = this.#effectFor(operation, target.identity, inspected.outcome);
    if (!effect) {
      return { ok: false, code: 'OPERATION_NOT_ALLOWED' };
    }

    let coordinatorDeathEvidenceRef: string | undefined;
    if (operation === 'settle') {
      const coordinatorDeath = this.#coordinatorDeath
        ? await this.#coordinatorDeath.verifyDead(target.identity)
        : { ok: false as const, reason: 'coordinator-death-authority-unavailable' };
      if (!coordinatorDeath.ok) {
        return {
          ok: false,
          disposition: 'HOLD',
          code: 'COORDINATOR_DEATH_UNVERIFIED',
          reason: coordinatorDeath.reason,
        };
      }
      coordinatorDeathEvidenceRef = coordinatorDeath.evidenceRef;
    }

    const processIdentity = await this.#processIdentity.verify(target.identity);
    if (!processIdentity.ok) {
      return { ok: false, code: 'PROCESS_IDENTITY_MISMATCH' };
    }

    const command: ExecutionRecoveryCommand = {
      identity: target.identity,
      operation,
      idempotencyKey: approval.idempotencyKey,
      expectedSequence,
    };
    const reservation = await this.#persistence.reserve(command);
    if (reservation.status === 'duplicate') {
      return { ok: false, code: 'DUPLICATE', receipt: reservation.receipt };
    }
    if (reservation.status === 'out-of-order') {
      return { ok: false, code: 'OUT_OF_ORDER' };
    }

    const applied = await applyFencedEffect(adapter, target.identity, effect);
    const receipt = freezeReceipt({
      version: 1,
      receiptId: `${target.identity.executionId}:${target.identity.generation}:${target.identity.attemptId}:${reservation.sequence}:${approval.idempotencyKey}`,
      sequence: reservation.sequence,
      recordedAt: this.#clock.now(),
      identity: { ...target.identity },
      mode: target.mode,
      platform: target.platform,
      operation,
      idempotencyKey: approval.idempotencyKey,
      approvalRef: approval.approvalRef,
      processIdentityEvidenceRef: processIdentity.evidenceRef,
      decision: inspected.outcome.decision,
      evidenceRefs: [
        ...effect.evidenceRefs,
        ...(coordinatorDeathEvidenceRef ? [coordinatorDeathEvidenceRef] : []),
      ],
      status: applied.ok ? 'APPLIED' : 'EFFECT_FAILED',
      ...(!applied.ok ? { failureCode: applied.code } : {}),
    });
    if (!await this.#persistence.commit(receipt)) {
      return { ok: false, code: 'DURABILITY_FAILURE' };
    }
    return applied.ok
      ? { ok: true, receipt }
      : { ok: false, code: applied.code, receipt };
  }

  #effectFor(
    operation: ExecutionRecoveryMutation,
    identity: ExecutionRecoveryServiceIdentity,
    outcome: ExecutionRecoveryOutcome,
  ): ExecutionRecoveryFencedEffect | undefined {
    return deriveFencedEffects(identity, outcome)
      .find(effect => effect.capability === capabilityFor(operation));
  }

  #adapter(
    mode: ExecutionRecoveryMode,
    platform: ExecutionRecoveryPlatform,
  ): ExecutionRecoveryModeAdapter<unknown> | undefined {
    return this.#adapters.get(this.#adapterKey(mode, platform));
  }

  #adapterKey(mode: ExecutionRecoveryMode, platform: ExecutionRecoveryPlatform): string {
    return `${mode}:${platform}`;
  }
}
