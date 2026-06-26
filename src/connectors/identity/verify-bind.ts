// src/connectors/identity/verify-bind.ts
import type { ConnectorId } from '../types.js';
import type { Role } from '../../core/rbac.js';
import type { IdentityStore } from './identity-store.js';
import type { ResolvedPrincipal } from './provider.js';
import { resolvePermissions, type RoleMap } from './role-map.js';

export interface VerifyDeps {
  store: IdentityStore;
  now: () => number;        // injected clock (ms) — never Date.now() directly (determinism)
  genCode: () => string;    // injected code generator — never Math.random() directly
  ttlSec: number;
  maxAttempts: number;
  roleMap?: RoleMap;
}

export type StartResult = { ok: true; code: string } | { ok: false; reason: 'invalid-email' };
export type ConfirmResult =
  | { ok: true; principal: ResolvedPrincipal }
  | { ok: false; reason: 'none-pending' | 'expired' | 'too-many' | 'wrong-code' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Begin an OTP verification: store a pending row with code + TTL. */
export function startVerify(
  deps: VerifyDeps,
  ref: { connector: ConnectorId; externalId: string },
  email: string,
  tenantId: string,
): StartResult {
  if (!EMAIL_RE.test(email)) return { ok: false, reason: 'invalid-email' };
  const code = deps.genCode();
  deps.store.putPendingVerify({ connector: ref.connector, externalId: ref.externalId, code, email, tenantId, expiresAt: deps.now() + deps.ttlSec * 1000 });
  return { ok: true, code };
}

/** Confirm an OTP: on match, upsert a verified identity and clear the pending row. */
export function confirmVerify(
  deps: VerifyDeps,
  ref: { connector: ConnectorId; externalId: string },
  code: string,
  binding: { principalId: string; role: Role; tenantId: string },
): ConfirmResult {
  const pending = deps.store.getPendingVerify(ref.connector, ref.externalId);
  if (!pending) return { ok: false, reason: 'none-pending' };
  if (deps.now() > pending.expiresAt) { deps.store.deletePendingVerify(ref.connector, ref.externalId); return { ok: false, reason: 'expired' }; }
  if (pending.attempts >= deps.maxAttempts) { deps.store.deletePendingVerify(ref.connector, ref.externalId); return { ok: false, reason: 'too-many' }; }
  if (pending.code !== code) {
    deps.store.bumpVerifyAttempts(ref.connector, ref.externalId);
    if (pending.attempts + 1 >= deps.maxAttempts) { deps.store.deletePendingVerify(ref.connector, ref.externalId); return { ok: false, reason: 'too-many' }; }
    return { ok: false, reason: 'wrong-code' };
  }
  deps.store.upsertIdentity({
    connector: ref.connector, externalId: ref.externalId, tenantId: binding.tenantId,
    principalId: binding.principalId, role: binding.role, verified: true, method: 'otp',
    updatedAt: new Date(deps.now()).toISOString(),
  });
  deps.store.deletePendingVerify(ref.connector, ref.externalId);
  return {
    ok: true,
    principal: { userId: binding.principalId, role: binding.role, permissions: resolvePermissions(binding.role, deps.roleMap), tenantId: binding.tenantId, verified: true, source: 'otp' },
  };
}
