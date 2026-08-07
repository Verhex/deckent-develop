// ═══ Verified Principal (PRINCIPAL-001, Dalga-2 P1a) ═══════════════════════
// WHO is asking, with explicit provenance and assurance — the single identity
// shape every ingress must produce before work reaches authorization.
//
// Acceptance being implemented (MASTER 4010): no header-derived or synthetic
// identity reaches authorization without its provenance and assurance being
// explicit. P1a delivers the type, the real-local resolver, the ingress
// conversions and an ADVISORY detection seam; hard fail-closed enforcement is
// the P1b slice (never blind-default-on — quality bar).

import { userInfo, hostname } from 'node:os';
import type { ActorContext, RequestOrigin } from './work-model.js';
import { debugLog } from './utils.js';

/** How the identity was established. Ordering is strictly increasing trust. */
export type PrincipalAssurance =
  /** No verification at all — synthetic constants, unauthenticated API calls. */
  | 'unverified'
  /** Real operating-system user on the host that invoked the surface. */
  | 'os-user'
  /** Bearer/OIDC claims were parsed but NOT cryptographically verified. */
  | 'token-parsed'
  /** Claims passed the auth gate's verification (signature/issuer checked). */
  | 'token-verified';

/** What kind of identity this is. */
export type PrincipalIdentityClass =
  | 'local'      // host OS user (CLI, MCP stdio, REPL)
  | 'oidc'       // external human identity via OIDC/bearer claims
  | 'workload'   // machine identity (CI job, scheduled runner)
  | 'connector'  // messaging connector identity (Telegram/Discord/…)
  | 'service';   // internal service-to-service identity

/**
 * The verified identity shape. Unlike a bare ActorContext id string, every
 * field needed to AUDIT the identity decision travels with it.
 */
export interface VerifiedPrincipal {
  readonly id: string;
  readonly identityClass: PrincipalIdentityClass;
  readonly assurance: PrincipalAssurance;
  /** Which ingress produced this principal (audit + persona routing). */
  readonly provenance: RequestOrigin;
  /** Mechanism detail, e.g. `os.userInfo`, `oidc:sub`, `auth-gate`. */
  readonly verifiedBy: string;
  readonly tenantId?: string;
  readonly role?: string;
}

/**
 * Resolve the REAL local operating-system identity for host-invoked surfaces
 * (CLI, MCP stdio, REPL). This replaces the synthetic literals those ingresses
 * used to fabricate ('cli-operator', 'mcp-operator', 'repl-user'): a local
 * invocation genuinely IS this OS user — recording it is truth, not theater.
 */
export function resolveLocalOsPrincipal(provenance: RequestOrigin): VerifiedPrincipal {
  let username = '';
  try {
    username = userInfo().username;
  } catch {
    // Some containers have no passwd entry for the uid; fall through.
  }
  if (!username) {
    // Honest degradation: identity is still local+traceable via host, but the
    // assurance drops to unverified so the advisory seam surfaces it.
    return {
      id: `local-uid-${typeof process.getuid === 'function' ? process.getuid() : 'unknown'}@${hostname()}`,
      identityClass: 'local',
      assurance: 'unverified',
      provenance,
      verifiedBy: 'os-user-unavailable',
    };
  }
  return {
    id: `${username}@${hostname()}`,
    identityClass: 'local',
    assurance: 'os-user',
    provenance,
    verifiedBy: 'os.userInfo',
  };
}

/**
 * Convert a principal to the ActorContext consumed by the run-flow surfaces.
 * The provenance fields ride along (ActorContext gained them as optional,
 * backward-compatible fields) so downstream authorization can SEE what it is
 * trusting instead of receiving a bare string.
 */
export function principalToActor(principal: VerifiedPrincipal): ActorContext {
  return {
    id: principal.id,
    ...(principal.role ? { role: principal.role } : {}),
    ...(principal.tenantId ? { tenantId: principal.tenantId } : {}),
    identityClass: principal.identityClass,
    assurance: principal.assurance,
    provenance: principal.provenance,
  };
}

/** Typed advisory result for the authorization-ingress seam. */
export interface ActorAssuranceFinding {
  readonly ok: boolean;
  readonly code: 'ACTOR_ASSURANCE_OK' | 'ACTOR_ASSURANCE_MISSING' | 'ACTOR_UNVERIFIED';
  readonly detail: string;
}

/**
 * ADVISORY seam (P1a): inspect the actor about to reach authorization and
 * produce a typed finding. Callers log/audit the finding; they do NOT block on
 * it in this slice. P1b wires the config-gated enforce mode
 * (`principal_enforce`) that turns `ok: false` into a typed HOLD.
 */
export function assessActorAssurance(actor: ActorContext): ActorAssuranceFinding {
  if (actor.assurance === undefined) {
    return {
      ok: false,
      code: 'ACTOR_ASSURANCE_MISSING',
      detail: `actor '${actor.id}' reached authorization with no assurance/provenance fields (pre-PRINCIPAL-001 ingress)`,
    };
  }
  if (actor.assurance === 'unverified') {
    return {
      ok: false,
      code: 'ACTOR_UNVERIFIED',
      detail: `actor '${actor.id}' carries explicit unverified assurance (provenance=${actor.provenance ?? 'unknown'})`,
    };
  }
  return { ok: true, code: 'ACTOR_ASSURANCE_OK', detail: `assurance=${actor.assurance}` };
}

/**
 * Advisory logger wrapper used at authorization ingress: emits the finding to
 * the debug/audit channel exactly once per call, returns it for callers that
 * persist audit context. Never throws (P1a contract).
 */
export function recordActorAssurance(actor: ActorContext, site: string): ActorAssuranceFinding {
  const finding = assessActorAssurance(actor);
  if (!finding.ok) {
    debugLog(`principal:advisory:${site}`, `${finding.code}: ${finding.detail}`);
  }
  return finding;
}

/** Typed failure raised when enforcement is enabled and the actor cannot be trusted. */
export class PrincipalAssuranceError extends Error {
  readonly code: ActorAssuranceFinding['code'];
  constructor(finding: ActorAssuranceFinding, site: string) {
    super(`principal assurance denied at ${site}: ${finding.detail}`);
    this.name = 'PrincipalAssuranceError';
    this.code = finding.code;
  }
}

/**
 * P1b: the enforcement seam. Always records the advisory finding; throws only
 * when the owner-approved flag is on. Callers pass the resolved config value —
 * this module stays config-loader-free (no hidden policy read).
 */
export function assertActorAssurance(
  actor: ActorContext,
  site: string,
  enforce: boolean,
): ActorAssuranceFinding {
  const finding = recordActorAssurance(actor, site);
  if (enforce && !finding.ok) throw new PrincipalAssuranceError(finding, site);
  return finding;
}

// ═══ Tenant scope (TENANT-001 T1) ══════════════════════════════════════════

/** Typed refusal when a caller carries no tenant and strict isolation is on. */
export class TenantScopeError extends Error {
  readonly code = 'TENANT_SCOPE_UNRESOLVED' as const;
  constructor(principalId: string) {
    super(`tenant scope unresolved for principal '${principalId}': strict tenant isolation is enabled and the caller carries no tenant claim`);
    this.name = 'TenantScopeError';
  }
}

/**
 * Resolve the tenant a caller acts within.
 *
 * The permissive default (`'local'`) is what every surface has always used, and
 * it is exactly the NULL-tenant hole `strict_tenant_isolation` was introduced to
 * close — except that flag only ever reached the compliance REPORT, never a
 * decision, so the control reported itself as present while gating nothing.
 * With strict mode on, a tenant-less caller is refused instead of being silently
 * folded into `local`. Default-off keeps v1 behaviour byte-identical.
 */
export function resolveCallerTenant(
  principal: { readonly id: string; readonly tenantId?: string },
  strict: boolean,
): string {
  const tenant = principal.tenantId?.trim();
  if (tenant) return tenant;
  if (strict) throw new TenantScopeError(principal.id);
  return 'local';
}
