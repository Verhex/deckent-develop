import { createHash } from 'node:crypto';

import type { ApprovalRisk } from './approval-contract.js';
import type { ApprovalRiskTier } from './config-types.js';
import type {
  LiveApprovalAuthentication,
  LiveApprovalAuthenticator,
  LiveApprovalReauthenticationContext,
  LiveApprovalSessionProof,
} from './approval-decision-ingress.js';
import {
  isApprovalRiskTierAtLeast,
  mapLegacyApprovalRisk,
} from './approval-lifecycle-policy.js';

export const APPROVAL_CHANNEL_AUTHORITY_REF = 'approval-channel:v1';

export type ChannelApprovalTier = ApprovalRiskTier;

/** Legacy compatibility delegates to the lifecycle resolver's single mapping authority. */
export function channelTierFor(risk: ApprovalRisk): ChannelApprovalTier {
  return mapLegacyApprovalRisk(risk);
}

/** Structural input shared by consumers without widening ApprovalRequest's exact v1 source shape. */
export interface ApprovalRiskTierInput {
  readonly risk: ApprovalRisk;
  readonly riskTier?: unknown;
}

/**
 * Resolve the authoritative envelope tier. Legacy v1 sources derive it through
 * the lifecycle resolver without mutating the signed source object. An invalid
 * explicit tier, including a producer downgrade below the canonical legacy
 * floor, is not treated as legacy absence: it fails closed as `null`.
 */
export function approvalRiskTierFor(input: ApprovalRiskTierInput): ApprovalRiskTier | null {
  const legacyFloor = mapLegacyApprovalRisk(input.risk);
  if (input.riskTier === undefined) return legacyFloor;
  if (input.riskTier === 'routine' || input.riskTier === 'elevated' || input.riskTier === 'critical') {
    return isApprovalRiskTierAtLeast(input.riskTier, legacyFloor) ? input.riskTier : null;
  }
  return null;
}

/** Channel buttons/live identities never carry critical or malformed tier authority. */
export function approvalMayUseChannel(input: ApprovalRiskTierInput): boolean {
  const tier = approvalRiskTierFor(input);
  return tier !== null && tier !== 'critical';
}

export interface ChannelApprovalPrincipal {
  readonly userId: string;
  readonly role?: string;
}

export type ApprovalChannelAuthorizationVerifier = (chatKey: string) => boolean;
export type ApprovalChannelNonceVerifier = (nonce: string) => boolean;

/** Small reference verifier; production persistence is supplied by the channel store. */
export class InMemoryApprovalChannelNonceVerifier {
  private readonly available = new Set<string>();

  constructor(nonces: Iterable<string> = []) {
    for (const nonce of nonces) this.available.add(nonce);
  }

  add(nonce: string): void {
    this.available.add(nonce);
  }

  consume = (nonce: string): boolean => this.available.delete(nonce);
}

export interface ChannelLiveApprovalAuthenticatorOptions {
  readonly connector: string;
  readonly principal: ChannelApprovalPrincipal;
  readonly chatKey: string;
  /** Digest of the connector/chat/principal binding, calculated outside core. */
  readonly bindingDigest: string;
  readonly nonce: string;
  readonly isAuthorized: ApprovalChannelAuthorizationVerifier;
  readonly consumeNonce: ApprovalChannelNonceVerifier;
  readonly now?: () => Date;
}

const SHA256_HEX = /^[a-f0-9]{64}$/u;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf-8').digest('hex');
}

/**
 * Live approval identity supplied by a connector without importing connector
 * types into core. Room authorization is deliberately rechecked at both mint
 * and validation time, so allowlist removal kills an in-flight decision.
 */
export class ChannelLiveApprovalAuthenticator implements LiveApprovalAuthenticator {
  private readonly now: () => Date;

  constructor(private readonly options: ChannelLiveApprovalAuthenticatorOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async reauthenticate(
    context: LiveApprovalReauthenticationContext,
  ): Promise<LiveApprovalAuthentication | null> {
    if (!approvalMayUseChannel(context.request)) return null;
    if (!this.hasValidBinding(context) || !this.options.isAuthorized(this.options.chatKey)) return null;

    const now = this.now();
    const expiresAt = Date.parse(context.request.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return null;
    if (!this.options.consumeNonce(this.options.nonce)) return null;
    return {
      actorId: `channel:${this.options.connector}:${this.options.principal.userId}`,
      tenantId: context.request.tenantId,
      role: this.options.principal.role,
      sessionRef: this.options.bindingDigest,
      authorityRef: APPROVAL_CHANNEL_AUTHORITY_REF,
      authenticatedAt: now.toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  isSessionActive(
    proof: LiveApprovalSessionProof,
    context: LiveApprovalReauthenticationContext,
    now: Date,
  ): boolean {
    return approvalMayUseChannel(context.request)
      && proof.authorityRef === APPROVAL_CHANNEL_AUTHORITY_REF
      && proof.actorId === `channel:${this.options.connector}:${this.options.principal.userId}`
      && proof.tenantId === context.request.tenantId
      && proof.sessionRefHash === sha256(this.options.bindingDigest)
      && now.getTime() < Date.parse(proof.expiresAt)
      && this.hasValidBinding(context)
      && this.options.isAuthorized(this.options.chatKey);
  }

  private hasValidBinding(_context: LiveApprovalReauthenticationContext): boolean {
    // Deliberately NO principal.userId === request.userId equality here: the
    // request's userId is the host account that OPENED it, while the channel
    // principal is the chat identity that DECIDES it — different universes by
    // design (live defect 2026-08-21: the owner's real Telegram tap was
    // rejected by this equality). Channel authority is carried by the chat-key
    // allowlist + binding digest + one-shot nonce + the tier gate instead, and
    // the decided envelope keeps the channel actor visible as
    // `channel:<connector>:<user>` — the ingress waives only the self-approval
    // equality for this authorityRef, never tenant/MAC/expiry.
    return this.options.connector.length > 0
      && this.options.principal.userId.length > 0
      && this.options.chatKey.length > 0
      && SHA256_HEX.test(this.options.bindingDigest)
      && this.options.nonce.length > 0;
  }
}
