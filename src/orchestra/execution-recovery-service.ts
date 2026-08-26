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
import { DeckentError } from '../core/errors.js';

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

/**
 * Fresh, exact-identity evidence used to decide whether an evaluate-lock owner
 * is making progress. A PID/state-file observation is deliberately not part of
 * this contract: `ALIVE` means the authority verified both the coordinator
 * identity and its platform liveness primitive (kill-0 on POSIX).
 */
export interface ExecutionRecoveryCoordinatorObservationAuthority {
  observe(
    identity: ExecutionRecoveryServiceIdentity,
  ): Promise<ExecutionRecoveryIdentityObservation>;
}

export interface ExecutionRecoveryProcessObservationAuthority {
  observe(
    identity: ExecutionRecoveryServiceIdentity,
  ): Promise<ExecutionRecoveryIdentityObservation>;
}

export interface ExecutionRecoveryEvaluateLockAuthority {
  observe(
    identity: ExecutionRecoveryServiceIdentity,
  ): Promise<ExecutionRecoveryEvaluateLockObservation>;
}

export type ExecutionRecoveryIdentityObservation =
  | { readonly state: 'ALIVE'; readonly evidenceRef: string }
  | { readonly state: 'ABSENT'; readonly evidenceRef: string }
  | { readonly state: 'UNKNOWN'; readonly reason: string };

export type ExecutionRecoveryEvaluateLockObservation =
  | {
      readonly state: 'OBSERVED';
      readonly identity: ExecutionRecoveryServiceIdentity;
      readonly previousProgressSequence: number;
      readonly observedProgressSequence: number;
      readonly evidenceRef: string;
    }
  | { readonly state: 'UNKNOWN'; readonly reason: string };

export type ExecutionRecoveryEvaluateLockClassification =
  | {
      readonly state: 'HEALTHY' | 'STALLED' | 'ORPHANED';
      readonly identity: ExecutionRecoveryServiceIdentity;
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly state: 'HOLD';
      readonly resumable: true;
      readonly identity: ExecutionRecoveryServiceIdentity;
      readonly reason: string;
      readonly evidenceRefs: readonly string[];
    };

export interface ExecutionRecoveryNoGoResolutionReceipt {
  readonly version: 1;
  readonly resolutionId: string;
  readonly recordedAt: string;
  readonly identity: ExecutionRecoveryServiceIdentity;
  readonly classification: ExecutionRecoveryEvaluateLockClassification['state'];
  readonly disposition: 'REPAIR_REQUIRED' | 'HOLD';
  readonly resumable: boolean;
  readonly repairOperation?: 'CREATE_EXACT_FIX_ATTEMPT';
  readonly reason: string;
  readonly evidenceRefs: readonly string[];
}

export interface ExecutionRecoveryNoGoPersistence {
  commitNoGoResolution(
    receipt: ExecutionRecoveryNoGoResolutionReceipt,
  ): Promise<boolean>;
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
  readonly coordinatorObservation?: ExecutionRecoveryCoordinatorObservationAuthority;
  readonly processObservation?: ExecutionRecoveryProcessObservationAuthority;
  readonly evaluateLock?: ExecutionRecoveryEvaluateLockAuthority;
  readonly noGoPersistence?: ExecutionRecoveryNoGoPersistence;
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
  readonly #coordinatorObservation?: ExecutionRecoveryCoordinatorObservationAuthority;
  readonly #processObservation?: ExecutionRecoveryProcessObservationAuthority;
  readonly #evaluateLock?: ExecutionRecoveryEvaluateLockAuthority;
  readonly #noGoPersistence?: ExecutionRecoveryNoGoPersistence;
  readonly #persistence: ExecutionRecoveryPersistence;
  readonly #adapters: ReadonlyMap<string, ExecutionRecoveryModeAdapter<unknown>>;

  constructor(dependencies: ExecutionRecoveryServiceDependencies) {
    this.#clock = dependencies.clock;
    this.#processIdentity = dependencies.processIdentity;
    this.#coordinatorDeath = dependencies.coordinatorDeath;
    this.#coordinatorObservation = dependencies.coordinatorObservation;
    this.#processObservation = dependencies.processObservation;
    this.#evaluateLock = dependencies.evaluateLock;
    this.#noGoPersistence = dependencies.noGoPersistence;
    this.#persistence = dependencies.persistence;
    const adapters = new Map<string, ExecutionRecoveryModeAdapter<unknown>>();
    for (const registration of dependencies.adapters) {
      const adapter = registration.adapter as ExecutionRecoveryModeAdapter<unknown>;
      const key = this.#adapterKey(adapter.mode, adapter.platform);
      if (adapters.has(key)) {
        throw new DeckentError('E_DUPLICATE_EXECUTION_RECOVERY_ADAPTER_REGISTRATION', `Duplicate execution recovery adapter registration: ${key}`);
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

  /**
   * Classify an evaluate-lock from fresh exact-identity evidence. HEALTHY and
   * STALLED both require two positive liveness proofs; ORPHANED requires two
   * positive absence proofs. Every other combination fails closed as a
   * resumable HOLD, so stale PID/state files can never manufacture activity.
   */
  async classifyEvaluateLock(
    identity: ExecutionRecoveryServiceIdentity,
  ): Promise<ExecutionRecoveryEvaluateLockClassification> {
    if (!this.#coordinatorObservation || !this.#processObservation || !this.#evaluateLock) {
      return this.#evaluationHold(identity, 'authoritative-evaluate-lock-probe-unavailable', []);
    }

    const [coordinator, process, lock] = await Promise.all([
      this.#coordinatorObservation.observe(identity),
      this.#processObservation.observe(identity),
      this.#evaluateLock.observe(identity),
    ]);
    const evidenceRefs = [coordinator, process]
      .filter((item): item is Exclude<ExecutionRecoveryIdentityObservation, { state: 'UNKNOWN' }> => item.state !== 'UNKNOWN')
      .map(item => item.evidenceRef);
    if (lock.state === 'UNKNOWN') {
      return this.#evaluationHold(identity, lock.reason, evidenceRefs);
    }
    if (!sameIdentity(lock.identity, identity)) {
      return this.#evaluationHold(identity, 'evaluate-lock-identity-mismatch', evidenceRefs);
    }
    const refs = [...evidenceRefs, lock.evidenceRef];
    if (!Number.isSafeInteger(lock.previousProgressSequence)
      || lock.previousProgressSequence < 0
      || !Number.isSafeInteger(lock.observedProgressSequence)
      || lock.observedProgressSequence < lock.previousProgressSequence) {
      return this.#evaluationHold(identity, 'evaluate-lock-progress-invalid', refs);
    }
    if (coordinator.state === 'ALIVE' && process.state === 'ALIVE') {
      return {
        state: lock.observedProgressSequence > lock.previousProgressSequence
          ? 'HEALTHY'
          : 'STALLED',
        identity,
        evidenceRefs: refs,
      };
    }
    if (coordinator.state === 'ABSENT'
      && process.state === 'ABSENT'
      && lock.observedProgressSequence === lock.previousProgressSequence) {
      return { state: 'ORPHANED', identity, evidenceRefs: refs };
    }
    return this.#evaluationHold(
      identity,
      'coordinator-process-liveness-inconclusive',
      refs,
    );
  }

  /** Persist a complete NO_GO repair choice, or a durable resumable HOLD. */
  async resolveNoGo(
    identity: ExecutionRecoveryServiceIdentity,
  ): Promise<ExecutionRecoveryNoGoResolutionReceipt | { readonly code: 'DURABILITY_FAILURE' }> {
    const classification = await this.classifyEvaluateLock(identity);
    const repairable = classification.state === 'ORPHANED';
    const receipt: ExecutionRecoveryNoGoResolutionReceipt = Object.freeze({
      version: 1,
      resolutionId: `${identity.executionId}:${identity.generation}:${identity.attemptId}:no-go`,
      recordedAt: this.#clock.now(),
      identity: Object.freeze({ ...identity }),
      classification: classification.state,
      disposition: repairable ? 'REPAIR_REQUIRED' : 'HOLD',
      resumable: !repairable,
      ...(repairable ? { repairOperation: 'CREATE_EXACT_FIX_ATTEMPT' as const } : {}),
      reason: repairable
        ? 'evaluate-lock-owner-is-authoritatively-orphaned'
        : classification.state === 'HOLD'
          ? classification.reason
          : `evaluate-lock-owner-${classification.state.toLowerCase()}`,
      evidenceRefs: Object.freeze([...classification.evidenceRefs]),
    });
    if (!this.#noGoPersistence || !await this.#noGoPersistence.commitNoGoResolution(receipt)) {
      return { code: 'DURABILITY_FAILURE' };
    }
    return receipt;
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

  #evaluationHold(
    identity: ExecutionRecoveryServiceIdentity,
    reason: string,
    evidenceRefs: readonly string[],
  ): ExecutionRecoveryEvaluateLockClassification {
    return { state: 'HOLD', resumable: true, identity, reason, evidenceRefs };
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
