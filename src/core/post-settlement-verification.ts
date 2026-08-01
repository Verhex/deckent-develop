/**
 * Provider-neutral contract for binary verification after source settlement.
 *
 * The stage is coordinator-owned operational work, never a logical task. It is
 * advanced only by explicit evidence events: reducers do not inspect clocks,
 * spawn commands, or infer completion from process exit alone.
 */

export const POST_SETTLEMENT_VERIFICATION_VERSION = 1 as const;
export const POST_SETTLEMENT_MAX_COMMAND_ARGS = 32 as const;
export const POST_SETTLEMENT_MAX_ARG_BYTES = 4_096 as const;

export type PostSettlementIngress =
  | 'sprint'
  | 'run-flow'
  | 'do'
  | 'autonomous'
  | 'process';

export interface TerminalSettlementReceiptIdentity {
  readonly receiptId: string;
  readonly sourceAttemptId: string;
  readonly sourceGeneration: number;
  readonly sourceDigest: string;
}

export interface VerificationBuildIdentity {
  readonly buildId: string;
  readonly sourceDigest: string;
  readonly artifactDigest: string;
}

export interface PostSettlementBuildPermission {
  readonly permissionId: string;
  readonly authority: 'coordinator';
  readonly phase: 'post-settlement';
  readonly receiptId: string;
  readonly sourceAttemptId: string;
  readonly sourceGeneration: number;
  readonly sourceDigest: string;
  readonly buildId: string;
}

/** An argv-only command description. Adapters must never evaluate it as shell text. */
export interface BoundedVerificationCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwdRef: string;
}

export interface PromotionResult {
  readonly status: 'promoted' | 'rejected';
  readonly promotionProofRef: string;
  readonly receiptId: string;
  readonly buildId: string;
  readonly artifactDigest: string;
}

export type PostSettlementHoldReason =
  | 'coordinator-containment-required'
  | 'terminal-receipt-required'
  | 'receipt-fence-mismatch'
  | 'build-permission-required'
  | 'build-permission-mismatch'
  | 'command-out-of-bounds'
  | 'command-failed'
  | 'promotion-result-required'
  | 'promotion-result-mismatch'
  | 'stage-already-terminal';

export interface PostSettlementHold {
  readonly kind: 'hold';
  readonly reason: PostSettlementHoldReason;
  readonly evidenceRefs: readonly string[];
  readonly retryable: boolean;
}

interface StageBase {
  readonly version: typeof POST_SETTLEMENT_VERIFICATION_VERSION;
  readonly stageId: string;
  readonly ingress: PostSettlementIngress;
}

export type PostSettlementVerificationStage =
  | (StageBase & { readonly state: 'awaiting-containment' })
  | (StageBase & { readonly state: 'awaiting-receipt'; readonly containmentRef: string })
  | (StageBase & {
      readonly state: 'awaiting-build-permission';
      readonly containmentRef: string;
      readonly receipt: TerminalSettlementReceiptIdentity;
    })
  | (StageBase & {
      readonly state: 'ready';
      readonly containmentRef: string;
      readonly receipt: TerminalSettlementReceiptIdentity;
      readonly build: VerificationBuildIdentity;
      readonly permission: PostSettlementBuildPermission;
      readonly command: BoundedVerificationCommand;
    })
  | (StageBase & {
      readonly state: 'awaiting-promotion';
      readonly containmentRef: string;
      readonly receipt: TerminalSettlementReceiptIdentity;
      readonly build: VerificationBuildIdentity;
      readonly permission: PostSettlementBuildPermission;
      readonly command: BoundedVerificationCommand;
      readonly commandEvidenceRef: string;
    })
  | (StageBase & {
      readonly state: 'completed';
      readonly containmentRef: string;
      readonly receipt: TerminalSettlementReceiptIdentity;
      readonly build: VerificationBuildIdentity;
      readonly promotion: PromotionResult;
    })
  | (StageBase & { readonly state: 'hold'; readonly hold: PostSettlementHold });

export type PostSettlementVerificationEvent =
  | { readonly type: 'COORDINATOR_CONTAINED'; readonly containmentRef: string }
  | { readonly type: 'TERMINAL_RECEIPT_OBSERVED'; readonly receipt: TerminalSettlementReceiptIdentity }
  | {
      readonly type: 'BUILD_AUTHORIZED';
      readonly build: VerificationBuildIdentity;
      readonly permission: PostSettlementBuildPermission;
      readonly command: BoundedVerificationCommand;
    }
  | { readonly type: 'COMMAND_FINISHED'; readonly exitCode: number; readonly evidenceRef: string }
  | { readonly type: 'PROMOTION_RECORDED'; readonly result: PromotionResult };

export function createPostSettlementVerificationStage(
  stageId: string,
  ingress: PostSettlementIngress,
): PostSettlementVerificationStage {
  return { version: POST_SETTLEMENT_VERIFICATION_VERSION, stageId, ingress, state: 'awaiting-containment' };
}

function isPresent(value: string): boolean {
  return value.trim().length > 0;
}

function hold(
  stage: StageBase,
  reason: PostSettlementHoldReason,
  evidenceRefs: readonly string[] = [],
  retryable = false,
): PostSettlementVerificationStage {
  return {
    ...stage,
    state: 'hold',
    hold: { kind: 'hold', reason, evidenceRefs: [...evidenceRefs], retryable },
  };
}

function validReceipt(receipt: TerminalSettlementReceiptIdentity): boolean {
  return isPresent(receipt.receiptId)
    && isPresent(receipt.sourceAttemptId)
    && Number.isSafeInteger(receipt.sourceGeneration)
    && receipt.sourceGeneration >= 0
    && isPresent(receipt.sourceDigest);
}

function validCommand(command: BoundedVerificationCommand): boolean {
  const values = [command.executable, command.cwdRef, ...command.args];
  return isPresent(command.executable)
    && isPresent(command.cwdRef)
    && command.args.length <= POST_SETTLEMENT_MAX_COMMAND_ARGS
    && values.every(value => Buffer.byteLength(value, 'utf8') <= POST_SETTLEMENT_MAX_ARG_BYTES)
    && values.every(value => !value.includes('\0'));
}

function permissionMatches(
  receipt: TerminalSettlementReceiptIdentity,
  build: VerificationBuildIdentity,
  permission: PostSettlementBuildPermission,
): boolean {
  return permission.authority === 'coordinator'
    && permission.phase === 'post-settlement'
    && isPresent(permission.permissionId)
    && isPresent(build.buildId)
    && isPresent(build.artifactDigest)
    && build.sourceDigest === receipt.sourceDigest
    && permission.receiptId === receipt.receiptId
    && permission.sourceAttemptId === receipt.sourceAttemptId
    && permission.sourceGeneration === receipt.sourceGeneration
    && permission.sourceDigest === receipt.sourceDigest
    && permission.buildId === build.buildId;
}

/** Pure reducer: the caller persists every returned transition and supplies all evidence. */
export function reducePostSettlementVerification(
  stage: PostSettlementVerificationStage,
  event: PostSettlementVerificationEvent,
): PostSettlementVerificationStage {
  const base: StageBase = { version: stage.version, stageId: stage.stageId, ingress: stage.ingress };

  if (stage.state === 'completed' || stage.state === 'hold') {
    return hold(base, 'stage-already-terminal');
  }

  if (stage.state === 'awaiting-containment') {
    if (event.type !== 'COORDINATOR_CONTAINED' || !isPresent(event.containmentRef)) {
      return hold(base, 'coordinator-containment-required');
    }
    return { ...base, state: 'awaiting-receipt', containmentRef: event.containmentRef };
  }

  if (stage.state === 'awaiting-receipt') {
    if (event.type !== 'TERMINAL_RECEIPT_OBSERVED') {
      return hold(base, 'terminal-receipt-required', [stage.containmentRef]);
    }
    if (!validReceipt(event.receipt)) {
      return hold(base, 'receipt-fence-mismatch', [stage.containmentRef]);
    }
    return { ...base, state: 'awaiting-build-permission', containmentRef: stage.containmentRef, receipt: event.receipt };
  }

  if (stage.state === 'awaiting-build-permission') {
    if (event.type !== 'BUILD_AUTHORIZED') {
      return hold(base, 'build-permission-required', [stage.receipt.receiptId]);
    }
    if (!permissionMatches(stage.receipt, event.build, event.permission)) {
      return hold(base, 'build-permission-mismatch', [stage.receipt.receiptId, event.permission.permissionId]);
    }
    if (!validCommand(event.command)) {
      return hold(base, 'command-out-of-bounds', [event.permission.permissionId]);
    }
    return {
      ...base,
      state: 'ready',
      containmentRef: stage.containmentRef,
      receipt: stage.receipt,
      build: event.build,
      permission: event.permission,
      command: event.command,
    };
  }

  if (stage.state === 'ready') {
    if (event.type !== 'COMMAND_FINISHED') {
      return hold(base, 'promotion-result-required', [stage.permission.permissionId]);
    }
    if (event.exitCode !== 0 || !isPresent(event.evidenceRef)) {
      return hold(base, 'command-failed', isPresent(event.evidenceRef) ? [event.evidenceRef] : []);
    }
    return { ...stage, state: 'awaiting-promotion', commandEvidenceRef: event.evidenceRef };
  }

  if (event.type !== 'PROMOTION_RECORDED') {
    return hold(base, 'promotion-result-required', [stage.commandEvidenceRef]);
  }
  const result = event.result;
  if (
    result.status !== 'promoted'
    || !isPresent(result.promotionProofRef)
    || result.receiptId !== stage.receipt.receiptId
    || result.buildId !== stage.build.buildId
    || result.artifactDigest !== stage.build.artifactDigest
  ) {
    return hold(base, 'promotion-result-mismatch', [stage.commandEvidenceRef]);
  }
  return {
    ...base,
    state: 'completed',
    containmentRef: stage.containmentRef,
    receipt: stage.receipt,
    build: stage.build,
    promotion: result,
  };
}
