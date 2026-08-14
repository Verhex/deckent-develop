import type { ResolvedConfig } from './config-types.js';
import {
  openApprovalAuthorityRuntime,
  type ApprovalAuthorityRuntimeOpenOptions,
  type ApprovalAuthorityRuntimeHold,
  type ApprovalAuthorityRuntimeService,
} from './approval-authority-runtime.js';
import {
  createPinnedApprovalOidcVerifier,
  type ApprovalOidcAssertionVerifier,
  type ApprovalOidcPolicy,
} from './approval-oidc-authenticator.js';

export type ApprovalAuthorityBootstrapResult =
  | { readonly state: 'disabled' }
  | ApprovalAuthorityRuntimeHold
  | {
      readonly state: 'ready';
      readonly runtime: ApprovalAuthorityRuntimeService;
      readonly policy: ApprovalOidcPolicy;
      readonly verifier: ApprovalOidcAssertionVerifier;
      readonly authorityEvidenceRef: string;
    };

export type ApprovalAuthorityBootstrapOptions = Pick<
  ApprovalAuthorityRuntimeOpenOptions,
  'platform' | 'env' | 'custodyAdapter' | 'broker' | 'store' | 'now'
>;

/**
 * Single production composition root. It reuses the API's already
 * interpolated, algorithm-pinned OIDC verification material but opens a
 * distinct approval-decision integrity keyring. It never provisions either.
 */
export function bootstrapApprovalAuthority(
  projectRoot: string,
  config: ResolvedConfig,
  options: ApprovalAuthorityBootstrapOptions = {},
): ApprovalAuthorityBootstrapResult {
  const authority = config.approval?.authority;
  if (authority?.enabled !== true) return { state: 'disabled' };
  const oidc = config.api_oidc;
  if (oidc?.enabled !== true || !oidc.audience || !authority.oidc) {
    return {
      state: 'hold',
      reasonCode: 'approval_authority_composition_failed',
      detailCode: 'APPROVAL_AUTHORITY_OIDC_NOT_CONFIGURED',
      authorityEvidenceRef: null,
    };
  }
  const opened = openApprovalAuthorityRuntime({
    projectRoot,
    tenantId: authority.tenant_id,
    ...options,
  });
  if (opened.state !== 'ready') return opened;
  const policy: ApprovalOidcPolicy = Object.freeze({
    authorityRef: authority.oidc.authority_ref,
    issuer: oidc.issuer,
    audience: oidc.audience,
    tenantClaim: authority.oidc.tenant_claim,
    ...(authority.oidc.role_claim ? { roleClaim: authority.oidc.role_claim } : {}),
    maxAuthAgeSeconds: authority.oidc.max_auth_age_seconds,
    maxSessionSeconds: authority.oidc.max_session_seconds,
    ...(authority.oidc.required_acr
      ? { requiredAcr: Object.freeze([...authority.oidc.required_acr]) }
      : {}),
    ...(authority.oidc.required_amr
      ? { requiredAmr: Object.freeze([...authority.oidc.required_amr]) }
      : {}),
  });
  const verifier = createPinnedApprovalOidcVerifier({
    authorityRef: policy.authorityRef,
    verifyOptions: {
      issuer: oidc.issuer,
      audience: oidc.audience,
      algorithms: [oidc.algorithm],
      ...(oidc.algorithm === 'HS256'
        ? { hs256Secret: oidc.key }
        : { rs256PublicKey: oidc.key }),
    },
  });
  return {
    state: 'ready',
    runtime: opened.service,
    policy,
    verifier,
    authorityEvidenceRef: opened.authorityEvidenceRef,
  };
}
