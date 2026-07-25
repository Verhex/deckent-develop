import type {
  LiveApprovalAuthentication,
  LiveApprovalAuthenticator,
  LiveApprovalReauthenticationContext,
  LiveApprovalSessionProof,
} from './approval-decision-ingress.js';
import {
  verifyJwt,
  type OidcClaims,
  type VerifyOptions,
  type VerifyResult,
} from './auth-oidc.js';
import { ApprovalLiveSessionStore } from './approval-live-session.js';

export interface ApprovalOidcPolicy {
  readonly authorityRef: string;
  readonly issuer: string;
  readonly audience: string | readonly string[];
  readonly tenantClaim: string;
  readonly roleClaim?: string;
  readonly maxAuthAgeSeconds: number;
  readonly maxSessionSeconds: number;
  readonly requiredAcr?: readonly string[];
  readonly requiredAmr?: readonly string[];
}

export interface ApprovalOidcAssertionVerifier {
  readonly authorityRef: string;
  readonly issuer: string;
  readonly audience: string | readonly string[];
  verify(token: string, nowEpochSeconds: number): Promise<VerifyResult>;
}

export interface PinnedApprovalOidcVerifierOptions {
  readonly authorityRef: string;
  readonly verifyOptions: Omit<VerifyOptions, 'now'>;
}

export type ApprovalOidcAuthenticatorErrorCode =
  | 'APPROVAL_OIDC_POLICY_INVALID'
  | 'APPROVAL_OIDC_VERIFIER_MISMATCH';

export class ApprovalOidcAuthenticatorError extends Error {
  constructor(
    readonly code: ApprovalOidcAuthenticatorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApprovalOidcAuthenticatorError';
  }
}

function assertIdentity(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > 512
    || value !== value.trim()
    || /[\r\n\0]/u.test(value)) {
    throw new ApprovalOidcAuthenticatorError(
      'APPROVAL_OIDC_POLICY_INVALID',
      `${field} must be a non-empty bounded identity`,
    );
  }
}

function assertPositiveFinite(value: unknown, field: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ApprovalOidcAuthenticatorError(
      'APPROVAL_OIDC_POLICY_INVALID',
      `${field} must be a positive finite number`,
    );
  }
}

function assertIdentityList(value: readonly string[] | undefined, field: string): void {
  if (value === undefined) return;
  if (value.length === 0) {
    throw new ApprovalOidcAuthenticatorError(
      'APPROVAL_OIDC_POLICY_INVALID',
      `${field} cannot be empty when configured`,
    );
  }
  for (const item of value) assertIdentity(item, field);
}

function validatePolicy(policy: ApprovalOidcPolicy): void {
  assertIdentity(policy.authorityRef, 'authorityRef');
  assertIdentity(policy.issuer, 'issuer');
  const audiences = Array.isArray(policy.audience) ? policy.audience : [policy.audience];
  assertIdentityList(audiences, 'audience');
  assertIdentity(policy.tenantClaim, 'tenantClaim');
  if (policy.roleClaim !== undefined) assertIdentity(policy.roleClaim, 'roleClaim');
  assertPositiveFinite(policy.maxAuthAgeSeconds, 'maxAuthAgeSeconds');
  assertPositiveFinite(policy.maxSessionSeconds, 'maxSessionSeconds');
  assertIdentityList(policy.requiredAcr, 'requiredAcr');
  assertIdentityList(policy.requiredAmr, 'requiredAmr');
}

function claimString(claims: OidcClaims, name: string): string | null {
  const value = claims[name];
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function claimStringList(claims: OidcClaims, name: string): readonly string[] | null {
  const value = claims[name];
  if (!Array.isArray(value)
    || value.some(item => typeof item !== 'string' || item.length === 0)) {
    return null;
  }
  return value as readonly string[];
}

export function createPinnedApprovalOidcVerifier(
  options: PinnedApprovalOidcVerifierOptions,
): ApprovalOidcAssertionVerifier {
  assertIdentity(options.authorityRef, 'authorityRef');
  assertIdentity(options.verifyOptions.issuer, 'verifyOptions.issuer');
  const audience = options.verifyOptions.audience;
  const audiences = Array.isArray(audience) ? audience : [audience];
  assertIdentityList(
    audiences.filter((item): item is string => typeof item === 'string'),
    'verifyOptions.audience',
  );
  if (audience === undefined) {
    throw new ApprovalOidcAuthenticatorError(
      'APPROVAL_OIDC_POLICY_INVALID',
      'verifyOptions.audience is required',
    );
  }
  return {
    authorityRef: options.authorityRef,
    issuer: options.verifyOptions.issuer,
    audience,
    async verify(token: string, nowEpochSeconds: number): Promise<VerifyResult> {
      return verifyJwt(token, {
        ...options.verifyOptions,
        now: nowEpochSeconds,
      });
    },
  };
}

export interface OidcLiveApprovalAuthenticatorOptions {
  readonly token: string;
  readonly policy: ApprovalOidcPolicy;
  readonly verifier: ApprovalOidcAssertionVerifier;
  readonly sessions: ApprovalLiveSessionStore;
  readonly now?: () => Date;
}

/**
 * Per-request OIDC step-up adapter. The bearer is held only in memory and is
 * cryptographically verified again at the decision boundary. Only its opaque
 * session hash survives in the durable approval decision.
 */
export class OidcLiveApprovalAuthenticator implements LiveApprovalAuthenticator {
  private readonly now: () => Date;

  constructor(private readonly options: OidcLiveApprovalAuthenticatorOptions) {
    validatePolicy(options.policy);
    if (options.verifier.authorityRef !== options.policy.authorityRef) {
      throw new ApprovalOidcAuthenticatorError(
        'APPROVAL_OIDC_VERIFIER_MISMATCH',
        'OIDC verifier authority does not match the approval policy',
      );
    }
    const policyAudience = Array.isArray(options.policy.audience)
      ? [...options.policy.audience]
      : [options.policy.audience];
    const verifierAudience = Array.isArray(options.verifier.audience)
      ? [...options.verifier.audience]
      : [options.verifier.audience];
    if (options.verifier.issuer !== options.policy.issuer
      || JSON.stringify([...verifierAudience].sort()) !== JSON.stringify([...policyAudience].sort())) {
      throw new ApprovalOidcAuthenticatorError(
        'APPROVAL_OIDC_VERIFIER_MISMATCH',
        'OIDC verifier issuer/audience does not match the approval policy',
      );
    }
    if (!options.token) {
      throw new ApprovalOidcAuthenticatorError(
        'APPROVAL_OIDC_POLICY_INVALID',
        'OIDC step-up token is required',
      );
    }
    this.now = options.now ?? (() => new Date());
  }

  async reauthenticate(
    context: LiveApprovalReauthenticationContext,
  ): Promise<LiveApprovalAuthentication | null> {
    const now = this.now();
    const nowEpochSeconds = Math.floor(now.getTime() / 1000);
    const result = await this.options.verifier.verify(this.options.token, nowEpochSeconds);
    const claims = result.valid ? result.claims : undefined;
    if (!claims
      || claims.iss !== this.options.policy.issuer
      || typeof claims.sub !== 'string'
      || claims.sub.length === 0
      || typeof claims.exp !== 'number'
      || !Number.isFinite(claims.exp)
      || typeof claims['auth_time'] !== 'number'
      || !Number.isFinite(claims['auth_time'])) {
      return null;
    }
    const tenantId = claimString(claims, this.options.policy.tenantClaim);
    const role = this.options.policy.roleClaim
      ? claimString(claims, this.options.policy.roleClaim)
      : null;
    if (!tenantId
      || claims.sub !== context.request.userId
      || tenantId !== context.request.tenantId) {
      return null;
    }
    const authTimeSeconds = claims['auth_time'];
    if (authTimeSeconds > nowEpochSeconds
      || nowEpochSeconds - authTimeSeconds > this.options.policy.maxAuthAgeSeconds) {
      return null;
    }
    if (this.options.policy.requiredAcr) {
      const acr = claimString(claims, 'acr');
      if (!acr || !this.options.policy.requiredAcr.includes(acr)) return null;
    }
    if (this.options.policy.requiredAmr) {
      const amr = claimStringList(claims, 'amr');
      if (!amr || !this.options.policy.requiredAmr.every(item => amr.includes(item))) return null;
    }
    const expiresAtMs = Math.min(
      claims.exp * 1000,
      (authTimeSeconds + this.options.policy.maxAuthAgeSeconds) * 1000,
      now.getTime() + this.options.policy.maxSessionSeconds * 1000,
      Date.parse(context.request.expiresAt),
    );
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) return null;
    return this.options.sessions.issue({
      actorId: claims.sub,
      tenantId,
      role,
      authorityRef: this.options.policy.authorityRef,
      requestDigest: context.requestDigest,
      action: context.action,
      channel: context.channel,
      authenticatedAt: new Date(authTimeSeconds * 1000).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
    });
  }

  isSessionActive(
    proof: LiveApprovalSessionProof,
    context: LiveApprovalReauthenticationContext,
    now: Date,
  ): boolean {
    return this.options.sessions.isActive(proof, context, now);
  }
}
