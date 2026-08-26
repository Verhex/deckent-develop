import { createHash, timingSafeEqual } from 'node:crypto';

import {
  ApprovalBroker,
  ApprovalBrokerError,
  isExpiredDecideResult,
} from './approval-broker.js';
import {
  APPROVAL_CONTRACT_V2_VERSION,
  type ApprovalAction,
  type ApprovalDecision,
  type ApprovalDecisionAuthorization,
  type ApprovalRequest,
} from './approval-contract.js';
import type { ProviderEvidenceProbeSubject } from './provider-evidence-probe-contract.js';

/** Closed operation-subject vocabulary carried through the existing approval protocol. */
export type ApprovalOperationSubject = ProviderEvidenceProbeSubject;
export const PROVIDER_EVIDENCE_PROBE_APPROVAL_SUBJECT_KIND = 'provider-evidence-probe' as const;

const SHA256_HEX = /^[a-f0-9]{64}$/u;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value ?? null;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeDigestEqual(left: string, right: string): boolean {
  if (!SHA256_HEX.test(left) || !SHA256_HEX.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export type ApprovalRequestDigestSource = ApprovalRequest;

/** Exact v1 source projection: additive reader metadata can never perturb an existing MAC. */
function v1DigestSource(request: ApprovalRequest): Record<string, unknown> {
  return {
    version: request.version,
    id: request.id,
    requester: request.requester,
    summary: request.summary,
    details: request.details,
    scopeId: request.scopeId,
    scope: request.scope,
    risk: request.risk,
    policy: request.policy,
    defaultAction: request.defaultAction,
    tenantId: request.tenantId,
    userId: request.userId,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    maskedArgs: request.maskedArgs,
    rawArgsRef: request.rawArgsRef,
  };
}

/** v1 signs only its exact source shape; v2 signs the complete lineage envelope. */
export function approvalRequestDigest(source: ApprovalRequestDigestSource): string {
  return sha256(canonicalJson(
    source.version === APPROVAL_CONTRACT_V2_VERSION ? source : v1DigestSource(source),
  ));
}

export interface ApprovalIntegrityStamp {
  readonly keyId: string;
  readonly mac: string;
}

/** Host-private MAC authority; secret/key material never crosses this interface. */
export interface ApprovalDecisionIntegrityAuthority {
  sign(payload: string): ApprovalIntegrityStamp;
  verify(keyId: string, payload: string, mac: string): boolean;
}

export interface LiveApprovalAuthentication {
  readonly actorId: string;
  readonly tenantId: string;
  readonly role?: string;
  /** Opaque adapter-owned session reference. It is hashed immediately and never persisted raw. */
  readonly sessionRef: string;
  readonly authorityRef: string;
  readonly authenticatedAt: string;
  readonly expiresAt: string;
}

export interface LiveApprovalReauthenticationContext {
  readonly request: ApprovalRequest;
  readonly requestDigest: string;
  readonly action: ApprovalAction;
  readonly channel: string;
}

export interface LiveApprovalSessionProof {
  readonly actorId: string;
  readonly tenantId: string;
  readonly role: string | null;
  readonly sessionRefHash: string;
  readonly authorityRef: string;
  readonly authenticatedAt: string;
  readonly expiresAt: string;
}

/** Platform adapter: API/OIDC, local terminal, connector, and enterprise SSO each implement this boundary. */
export interface LiveApprovalAuthenticator {
  reauthenticate(
    context: LiveApprovalReauthenticationContext,
  ): Promise<LiveApprovalAuthentication | null>;
  isSessionActive(
    proof: LiveApprovalSessionProof,
    context: LiveApprovalReauthenticationContext,
    now: Date,
  ): boolean;
}

export interface ApprovalDecisionCommand {
  readonly requestId: string;
  readonly action: ApprovalAction;
  readonly idempotencyKey: string;
  readonly reason?: string;
}

export type ApprovalDecisionIngressOutcome =
  | { readonly kind: 'decided'; readonly decision: ApprovalDecision }
  | { readonly kind: 'idempotent'; readonly decision: ApprovalDecision }
  | { readonly kind: 'expired'; readonly requestId: string; readonly expiresAt: string }
  | {
    readonly kind: 'rejected';
    readonly reason: 'invalid-command' | 'unknown-request' | 'unauthorized' | 'unavailable' | 'conflict';
  };

export type ApprovalDecisionValidation =
  | { readonly ok: true; readonly authorization: ApprovalDecisionAuthorization }
  | {
    readonly ok: false;
    readonly reason:
      | 'missing-authorization'
      | 'request-digest-mismatch'
      | 'command-digest-mismatch'
      | 'identity-mismatch'
      | 'request-expired'
      | 'session-expired'
      | 'integrity-failure'
      | 'session-inactive';
  };

interface UnsignedAuthorization {
  readonly schemaVersion: 1;
  readonly kind: 'live-session';
  readonly requestDigest: string;
  readonly commandDigest: string;
  readonly idempotencyKeyHash: string;
  readonly actorId: string;
  readonly tenantId: string;
  readonly role: string | null;
  readonly sessionRefHash: string;
  readonly authorityRef: string;
  readonly authenticatedAt: string;
  readonly authExpiresAt: string;
}

interface DecisionEnvelope {
  readonly requestId: string;
  readonly decision: ApprovalAction;
  readonly decidedBy: string;
  readonly channel: string;
  readonly decidedAt: string;
  readonly reason: string;
  readonly authorization: UnsignedAuthorization;
}

function commandDigest(input: {
  requestId: string;
  decision: ApprovalAction;
  channel: string;
  reason: string;
  idempotencyKeyHash: string;
}): string {
  return sha256(canonicalJson(input));
}

function unsignedAuthorization(
  authorization: ApprovalDecisionAuthorization,
): UnsignedAuthorization {
  const { integrityKeyId: _keyId, integrityMac: _mac, ...unsigned } = authorization;
  return unsigned;
}

function integrityPayload(decision: ApprovalDecision): string {
  if (!decision.authorization) return '';
  const envelope: DecisionEnvelope = {
    requestId: decision.requestId,
    decision: decision.decision,
    decidedBy: decision.decidedBy,
    channel: decision.channel,
    decidedAt: decision.decidedAt,
    reason: decision.reason,
    authorization: unsignedAuthorization(decision.authorization),
  };
  return canonicalJson(envelope);
}

function proofFromAuthorization(
  authorization: ApprovalDecisionAuthorization,
): LiveApprovalSessionProof {
  return {
    actorId: authorization.actorId,
    tenantId: authorization.tenantId,
    role: authorization.role,
    sessionRefHash: authorization.sessionRefHash,
    authorityRef: authorization.authorityRef,
    authenticatedAt: authorization.authenticatedAt,
    expiresAt: authorization.authExpiresAt,
  };
}

function sameDurableCommand(left: ApprovalDecision, right: ApprovalDecision): boolean {
  const leftAuth = left.authorization;
  const rightAuth = right.authorization;
  if (!leftAuth || !rightAuth) return false;
  return safeDigestEqual(leftAuth.idempotencyKeyHash, rightAuth.idempotencyKeyHash)
    && safeDigestEqual(leftAuth.commandDigest, rightAuth.commandDigest);
}

/** Reusable verifier for Goal-v2 hydration and the immediate pre-claim boundary. */
export class ApprovalDecisionAuthority {
  constructor(
    private readonly integrity: ApprovalDecisionIntegrityAuthority,
    private readonly sessions: LiveApprovalAuthenticator,
    /** D2b-2a: verifier for `approval-rules-engine:v1` envelopes. When absent,
     * rule envelopes fall through to `sessions` and fail closed — a consumer
     * that has not been wired for rule decisions never trusts one. */
    private readonly ruleSessions?: LiveApprovalAuthenticator,
    /** Verifier for `approval-channel:v1` envelopes. Like rule decisions,
     * channel decisions fail closed through `sessions` until a consumer
     * explicitly wires the channel authenticator. */
    private readonly channelSessions?: LiveApprovalAuthenticator,
  ) {}

  validate(
    request: ApprovalRequest,
    decision: ApprovalDecision,
    now: Date = new Date(),
  ): ApprovalDecisionValidation {
    const authorization = decision.authorization;
    if (!authorization) return { ok: false, reason: 'missing-authorization' };
    if (!safeDigestEqual(authorization.requestDigest, approvalRequestDigest(request))) {
      return { ok: false, reason: 'request-digest-mismatch' };
    }
    const expectedCommandDigest = commandDigest({
      requestId: decision.requestId,
      decision: decision.decision,
      channel: decision.channel,
      reason: decision.reason,
      idempotencyKeyHash: authorization.idempotencyKeyHash,
    });
    if (!safeDigestEqual(authorization.commandDigest, expectedCommandDigest)) {
      return { ok: false, reason: 'command-digest-mismatch' };
    }
    // Non-terminal actors are explicit, paired discriminators: rule actors
    // and channel actors each waive only the request-user equality. Tenant,
    // freshness, integrity, and their separately routed live proofs remain
    // mandatory; every other actor keeps the human contract.
    const isRuleDecision = authorization.actorId.startsWith('rule:')
      && authorization.authorityRef === 'approval-rules-engine:v1';
    const isChannelDecision = authorization.actorId.startsWith('channel:')
      && authorization.authorityRef === 'approval-channel:v1';
    if (decision.decidedBy !== authorization.actorId
      || (!isRuleDecision && !isChannelDecision && request.userId !== authorization.actorId)
      || request.tenantId !== authorization.tenantId) {
      return { ok: false, reason: 'identity-mismatch' };
    }
    if (now.getTime() >= Date.parse(request.expiresAt)) {
      return { ok: false, reason: 'request-expired' };
    }
    if (now.getTime() >= Date.parse(authorization.authExpiresAt)
      || Date.parse(authorization.authenticatedAt) > Date.parse(decision.decidedAt)) {
      return { ok: false, reason: 'session-expired' };
    }
    if (!this.integrity.verify(
      authorization.integrityKeyId,
      integrityPayload(decision),
      authorization.integrityMac,
    )) {
      return { ok: false, reason: 'integrity-failure' };
    }
    const context: LiveApprovalReauthenticationContext = {
      request,
      requestDigest: authorization.requestDigest,
      action: decision.decision,
      channel: decision.channel,
    };
    const sessionAuthority = authorization.authorityRef === 'approval-rules-engine:v1'
      && this.ruleSessions
      ? this.ruleSessions
      : authorization.authorityRef === 'approval-channel:v1' && this.channelSessions
        ? this.channelSessions
        : this.sessions;
    if (!sessionAuthority.isSessionActive(proofFromAuthorization(authorization), context, now)) {
      return { ok: false, reason: 'session-inactive' };
    }
    return { ok: true, authorization };
  }
}

export interface ApprovalDecisionIngressOptions {
  readonly broker: ApprovalBroker;
  readonly authenticator: LiveApprovalAuthenticator;
  readonly integrity: ApprovalDecisionIntegrityAuthority;
  /** Trusted adapter identity, not a client command field. */
  readonly channel: string;
  readonly now?: () => Date;
}

/** The only human-decision ingress allowed to mint Goal-v2 claim authority. */
export class ApprovalDecisionIngress {
  private readonly now: () => Date;
  private readonly authority: ApprovalDecisionAuthority;

  constructor(private readonly options: ApprovalDecisionIngressOptions) {
    this.now = options.now ?? (() => new Date());
    this.authority = new ApprovalDecisionAuthority(options.integrity, options.authenticator);
  }

  async decide(command: ApprovalDecisionCommand): Promise<ApprovalDecisionIngressOutcome> {
    if (!command.requestId || command.requestId !== command.requestId.trim()
      || !command.idempotencyKey || command.idempotencyKey !== command.idempotencyKey.trim()
      || !this.options.channel || this.options.channel !== this.options.channel.trim()) {
      return { kind: 'rejected', reason: 'invalid-command' };
    }
    const request = this.options.broker.getRequest(command.requestId);
    if (!request) return { kind: 'rejected', reason: 'unknown-request' };

    if (this.now().getTime() >= Date.parse(request.expiresAt)) {
      return { kind: 'expired', requestId: request.id, expiresAt: request.expiresAt };
    }
    const requestDigest = approvalRequestDigest(request);
    let live: LiveApprovalAuthentication | null;
    try {
      live = await this.options.authenticator.reauthenticate({
        request,
        requestDigest,
        action: command.action,
        channel: this.options.channel,
      });
    } catch {
      return { kind: 'rejected', reason: 'unavailable' };
    }
    // Re-snapshot AFTER the (possibly interactive, seconds-long) live re-auth:
    // an authenticatedAt minted while the operator was typing must not read as
    // "in the future" against a pre-prompt clock, and a request that expired
    // DURING the prompt must still fail closed as expired, never mint.
    const now = this.now();
    if (now.getTime() >= Date.parse(request.expiresAt)) {
      return { kind: 'expired', requestId: request.id, expiresAt: request.expiresAt };
    }
    // Rule and channel decisions mint namespaced actors under their exact
    // authorityRefs. Only self-approval userId equality is waived; tenant,
    // freshness, MAC and digest-bound session proof still apply.
    const isRuleActor = live !== null
      && live.actorId.startsWith('rule:')
      && live.authorityRef === 'approval-rules-engine:v1';
    const isChannelActor = live !== null
      && live.actorId.startsWith('channel:')
      && live.authorityRef === 'approval-channel:v1';
    if (!live
      || (!isRuleActor && !isChannelActor && live.actorId !== request.userId)
      || live.tenantId !== request.tenantId
      || !live.sessionRef
      || !live.authorityRef
      || !Number.isFinite(Date.parse(live.authenticatedAt))
      || !Number.isFinite(Date.parse(live.expiresAt))
      || Date.parse(live.authenticatedAt) > now.getTime()
      || Date.parse(live.expiresAt) <= now.getTime()) {
      return { kind: 'rejected', reason: 'unauthorized' };
    }

    const decidedAt = now.toISOString();
    const reason = command.reason ?? '';
    const idempotencyKeyHash = sha256(command.idempotencyKey);
    const unsigned: UnsignedAuthorization = {
      schemaVersion: 1,
      kind: 'live-session',
      requestDigest,
      commandDigest: commandDigest({
        requestId: request.id,
        decision: command.action,
        channel: this.options.channel,
        reason,
        idempotencyKeyHash,
      }),
      idempotencyKeyHash,
      actorId: live.actorId,
      tenantId: live.tenantId,
      role: live.role ?? null,
      sessionRefHash: sha256(live.sessionRef),
      authorityRef: live.authorityRef,
      authenticatedAt: live.authenticatedAt,
      authExpiresAt: live.expiresAt,
    };
    const unsignedDecision: ApprovalDecision = {
      requestId: request.id,
      decision: command.action,
      decidedBy: live.actorId,
      channel: this.options.channel,
      decidedAt,
      reason,
      authorization: {
        ...unsigned,
        integrityKeyId: 'pending',
        integrityMac: '0'.repeat(64),
      },
    };
    const stamp = this.options.integrity.sign(canonicalJson({
      ...unsignedDecision,
      authorization: unsigned,
    }));
    const candidate: ApprovalDecision = {
      ...unsignedDecision,
      authorization: {
        ...unsigned,
        integrityKeyId: stamp.keyId,
        integrityMac: stamp.mac,
      },
    };
    if (!this.authority.validate(request, candidate, now).ok) {
      return { kind: 'rejected', reason: 'unavailable' };
    }

    const existing = this.options.broker.getDecision(request.id);
    if (existing) {
      return sameDurableCommand(existing, candidate)
        ? { kind: 'idempotent', decision: existing }
        : { kind: 'rejected', reason: 'conflict' };
    }
    try {
      const decided = this.options.broker.decideChecked(request.id, {
        decision: candidate.decision,
        decidedBy: candidate.decidedBy,
        channel: candidate.channel,
        decidedAt: candidate.decidedAt,
        reason: candidate.reason,
        authorization: candidate.authorization,
      }, now);
      if (isExpiredDecideResult(decided)) {
        return { kind: 'expired', requestId: decided.requestId, expiresAt: decided.expiresAt };
      }
      return { kind: 'decided', decision: decided };
    } catch (error) {
      if (!(error instanceof ApprovalBrokerError) || error.code !== 'APR_ALREADY_DECIDED') throw error;
      const winner = this.options.broker.getDecision(request.id);
      if (winner && sameDurableCommand(winner, candidate)) {
        return { kind: 'idempotent', decision: winner };
      }
      return { kind: 'rejected', reason: 'conflict' };
    }
  }
}
