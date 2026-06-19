// src/nervous/authority-matrix.ts
//
// Authority Matrix — 4 preset + safety floor + per-action override.
// Design spec Section 3.
//
// Sprint 147 Task 3.

import type {
  AuthorityMatrix,
  AuthorityMode,
  ApprovalPolicy,
  SafetyFloorAction,
  ActionDefinition,
} from '../core/nervous-types.js';
import type { ActorContext, Capability, ExecutionRequest } from '../core/work-model.js';
import { ACTION_BY_ID } from './action-registry.js';
import { writeAuditEvent } from '../core/audit-writer.js';

// ─── Safety Floor ────────────────────────────────────────────────────────────

/**
 * 5 kilitli eylem — full-auto dahil hiçbir modda autonomous yürütülemez.
 * Config veya user override ile bypass edilemez.
 */
export const SAFETY_FLOOR: ReadonlyArray<SafetyFloorAction> = Object.freeze([
  'KILL_LIVE_SPRINT',
  'MANUAL_FILE_DELETE',
  'COST_OVER_THRESHOLD',
  'DESTRUCTIVE_GIT',
  'ADR_DEPRECATE_ACCEPTED',
] as const);

// ─── Preset Matrices ─────────────────────────────────────────────────────────

/**
 * STRICT — Enterprise / yeni kullanıcı modu.
 * Düşük risk bile suggest-30m, orta ve yüksek approve gerektirir.
 */
export const STRICT_MATRIX: AuthorityMatrix = Object.freeze({
  mode: 'strict' as const,
  riskPolicyMap: Object.freeze({
    low: 'suggest-30m' as const,
    medium: 'approve' as const,
    high: 'approve' as const,
  }),
  actionOverrides: Object.freeze({}),
  safetyFloor: SAFETY_FLOOR,
});

/**
 * BALANCED — Varsayılan mod.
 * Düşük risk autonomous, orta suggest-30m, yüksek approve.
 */
export const BALANCED_MATRIX: AuthorityMatrix = Object.freeze({
  mode: 'balanced' as const,
  riskPolicyMap: Object.freeze({
    low: 'autonomous' as const,
    medium: 'suggest-30m' as const,
    high: 'approve' as const,
  }),
  actionOverrides: Object.freeze({}),
  safetyFloor: SAFETY_FLOOR,
});

/**
 * AUTOPILOT — Güvenilir kullanıcı modu.
 * Düşük ve orta risk autonomous, yüksek risk suggest-5m.
 */
export const AUTOPILOT_MATRIX: AuthorityMatrix = Object.freeze({
  mode: 'autopilot' as const,
  riskPolicyMap: Object.freeze({
    low: 'autonomous' as const,
    medium: 'autonomous' as const,
    high: 'suggest-5m' as const,
  }),
  actionOverrides: Object.freeze({}),
  safetyFloor: SAFETY_FLOOR,
});

/**
 * FULL_AUTO — CI/CD / hands-off modu.
 * Tüm risk seviyeleri autonomous (safety floor hariç).
 */
export const FULL_AUTO_MATRIX: AuthorityMatrix = Object.freeze({
  mode: 'full-auto' as const,
  riskPolicyMap: Object.freeze({
    low: 'autonomous' as const,
    medium: 'autonomous' as const,
    high: 'autonomous' as const,
  }),
  actionOverrides: Object.freeze({}),
  safetyFloor: SAFETY_FLOOR,
});

// ─── Mode → Matrix Map ──────────────────────────────────────────────────────

/**
 * 4 preset'in tümünü mode string ile erişilebilir yapan readonly Map.
 */
export const MATRIX_BY_MODE: ReadonlyMap<AuthorityMode, AuthorityMatrix> = new Map([
  ['strict', STRICT_MATRIX],
  ['balanced', BALANCED_MATRIX],
  ['autopilot', AUTOPILOT_MATRIX],
  ['full-auto', FULL_AUTO_MATRIX],
]);

// ─── Policy Resolution ──────────────────────────────────────────────────────

/**
 * Verilen matrix, actionId ve opsiyonel user override'lar ile final policy'yi çözümler.
 *
 * Resolution sırası (öncelik yüksekten düşüğe):
 * 1. Safety floor check — kilitli eylemler her zaman 'approve'
 * 2. User override — config.json'dan gelen per-action override
 * 3. Matrix action override — preset'e tanımlı per-action override
 * 4. Default risk→policy mapping — preset'in risk tablosundan
 *
 * @throws Error — actionId ACTION_BY_ID'de yoksa
 */
export function resolvePolicy(
  matrix: AuthorityMatrix,
  actionId: string,
  userOverrides?: Readonly<Record<string, ApprovalPolicy>>,
): { policy: ApprovalPolicy; isSafetyFloor: boolean; reason: string } {
  const action: ActionDefinition | undefined = ACTION_BY_ID.get(actionId);
  if (!action) {
    throw new Error(`Unknown action: ${actionId}`);
  }

  // 1. Safety floor check — locked even in full-auto
  const isSafetyFloor =
    action.requiredSafetyFloor.length > 0 ||
    (SAFETY_FLOOR as readonly string[]).includes(actionId);

  if (isSafetyFloor) {
    return {
      policy: 'approve',
      isSafetyFloor: true,
      reason: `Safety floor: ${actionId} requires explicit user approval`,
    };
  }

  // 2. User override (if any)
  const userOverride = userOverrides?.[actionId];
  if (userOverride) {
    return {
      policy: userOverride,
      isSafetyFloor: false,
      reason: `User override for ${actionId}: ${userOverride}`,
    };
  }

  // 3. Matrix action override
  const matrixOverride = matrix.actionOverrides[actionId];
  if (matrixOverride) {
    return {
      policy: matrixOverride,
      isSafetyFloor: false,
      reason: `Matrix override: ${matrixOverride}`,
    };
  }

  // 4. Default risk→policy mapping
  const defaultPolicy = matrix.riskPolicyMap[action.defaultRisk];
  return {
    policy: defaultPolicy,
    isSafetyFloor: false,
    reason: `Risk-based default (${action.defaultRisk}): ${defaultPolicy}`,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Mode string'den matrix döndürür. Bilinmeyen mod için undefined.
 */
export function getMatrixByMode(mode: AuthorityMode): AuthorityMatrix | undefined {
  return MATRIX_BY_MODE.get(mode);
}

/**
 * Bir action ID'nin safety floor kapsamında olup olmadığını kontrol eder.
 */
export function isSafetyFloorAction(actionId: string): boolean {
  return (SAFETY_FLOOR as readonly string[]).includes(actionId);
}

// ─── ENT-1: actor.role → worker authority (ADR-037 V2 step) ─────────────────
//
// ADR-037 RBAC V1.0 is advisory (allow-all, NO_OP). ENT-1 takes a real V2 step:
// a worker's allowed capabilities derive from its `ExecutionRequest.actor.role`.
// Enforcement stays SOFT (warn+emit) by default — backward-safe — and only HARD
// blocks when the caller passes the opt-in `enforce_rbac` config flag (default
// false). Permissive default: absent actor / unknown role → current allow-all.

/** Config key (in `.deckent/config.json`) gating HARD RBAC enforcement. Default false. */
export const ENFORCE_RBAC_CONFIG_KEY = 'enforce_rbac' as const;

/** Minimal RBAC role taxonomy for worker authority (ENT-1). */
export type WorkerRole = 'admin' | 'engineer' | 'operator' | 'viewer';

/**
 * Minimal role → allowed-{@link Capability} map. The required capabilities of a
 * request (`ExecutionRequest.requirements.capabilities`) are checked against the
 * actor role's allow-set:
 *  - `admin`    — every capability (full trust).
 *  - `engineer` — dev capabilities; excludes enterprise-admin caps (`erp-write`,
 *                 `tenant-scope`).
 *  - `operator` — execute/dispatch + read; excludes dev-admin caps (`db-write`,
 *                 `erp-write`, `approval`, `provider-pin`, `gpu`, `tenant-scope`).
 *  - `viewer`   — read-only (`fs-read`, `db-query`, `erp-read`).
 */
export const ROLE_CAPABILITY_MAP: Readonly<Record<WorkerRole, ReadonlySet<Capability>>> =
  Object.freeze({
    admin: new Set<Capability>([
      'fs-read', 'fs-write', 'network', 'db-query', 'db-write', 'erp-read',
      'erp-write', 'shell', 'approval', 'provider-pin', 'gpu', 'tenant-scope', 'mcp-tool',
    ]),
    engineer: new Set<Capability>([
      'fs-read', 'fs-write', 'network', 'db-query', 'db-write', 'erp-read',
      'shell', 'approval', 'provider-pin', 'gpu', 'mcp-tool',
    ]),
    operator: new Set<Capability>([
      'fs-read', 'fs-write', 'network', 'db-query', 'erp-read', 'shell', 'mcp-tool',
    ]),
    viewer: new Set<Capability>(['fs-read', 'db-query', 'erp-read']),
  });

/**
 * ENT-1 audit bridge context. When supplied to {@link checkWorkerAuthority}, a role
 * violation writes an `authority.denied` event to the sprint audit hash-chain
 * (ADR-037 audit-trail). Fires on both soft-warn and hard-deny.
 */
export interface AuthorityAuditContext {
  /** Project root — passed to writeAuditEvent for the event-stream path. */
  projectRoot: string;
  /** Sprint id label for the audit event. Defaults to 'autonomous'. */
  sprintId?: string;
  /** Tenant id for the audit record. Falls back to the actor tenant → 'local'. */
  tenantId?: string;
}

/** Options for {@link checkWorkerAuthority}. */
export interface AuthorityEnforcementOptions {
  /**
   * Mirror of the `enforce_rbac` config flag (default false). When `true`, a
   * role-denied capability HARD-blocks (`allowed: false`); when false/absent,
   * enforcement is SOFT — the violation is warned + emitted but still allowed.
   */
  enforceRbac?: boolean;
  /** Optional structured emit hook (e.g. event-stream wire) — fired on a violation. */
  emit?: (payload: WorkerAuthorityViolation) => void;
  /**
   * ENT-1 audit bridge. When set, a role violation also writes an `authority.denied`
   * event to the sprint audit hash-chain (ADR-037 audit-trail). Absent → no audit write
   * (backward-safe).
   */
  audit?: AuthorityAuditContext;
}

/** Structured payload describing a role-based authority violation (for emit). */
export interface WorkerAuthorityViolation {
  actorId?: string;
  role: WorkerRole;
  deniedCapabilities: Capability[];
  enforced: boolean;
  reason: string;
}

/** Result of a role-based worker authority check (ENT-1). */
export interface WorkerAuthorityResult {
  /** Whether the operation proceeds. SOFT mode always allows; only HARD denies. */
  allowed: boolean;
  /** Enforcement level — `permit` ok, `warn` soft-violation, `deny` hard-block. */
  level: 'permit' | 'warn' | 'deny';
  /** Resolved role, or null when no/unknown actor role (permissive path). */
  role: WorkerRole | null;
  /** Capabilities the role is NOT permitted (empty on permit/permissive). */
  deniedCapabilities: Capability[];
  /** Human-readable reason for the decision. */
  reason: string;
}

/**
 * Normalize a free-form actor role string into the {@link WorkerRole} taxonomy.
 * Unknown or absent → `null` (caller treats as permissive / backward-safe).
 */
export function normalizeWorkerRole(role: string | undefined | null): WorkerRole | null {
  switch ((role ?? '').toLowerCase().trim()) {
    case 'admin':
      return 'admin';
    case 'engineer':
      return 'engineer';
    case 'operator':
      return 'operator';
    case 'viewer':
      return 'viewer';
    default:
      return null;
  }
}

/**
 * ENT-1 — derive a worker's allowed operations from its `ExecutionRequest.actor.role`.
 *
 * Resolution:
 * 1. No actor / no role / unknown role → `permit` (allow-all; backward-compatible).
 * 2. Known role, every required capability in the role allow-map → `permit`.
 * 3. Known role, at least one capability NOT permitted:
 *    - `opts.enforceRbac === true` (the `enforce_rbac` flag) → `deny` (HARD block).
 *    - otherwise → `warn` (SOFT: still `allowed`, but warned via console + `opts.emit`).
 *
 * @param req  The contract slice carrying actor + required capabilities.
 * @param opts Enforcement flag + optional emit hook.
 */
export function checkWorkerAuthority(
  req: Pick<ExecutionRequest, 'actor' | 'requirements'>,
  opts: AuthorityEnforcementOptions = {},
): WorkerAuthorityResult {
  const actor: ActorContext | undefined = req.actor;
  const role = normalizeWorkerRole(actor?.role);

  // 1. Permissive default — absent actor or unknown role keeps V1.0 allow-all.
  if (!role) {
    return {
      allowed: true,
      level: 'permit',
      role: null,
      deniedCapabilities: [],
      reason: actor?.role
        ? `Unknown actor role '${actor.role}' — permissive default (allow-all, ADR-037 V1.0)`
        : 'No actor role on request — permissive default (allow-all, ADR-037 V1.0)',
    };
  }

  const allowed = ROLE_CAPABILITY_MAP[role];
  const required: Capability[] = req.requirements?.capabilities ?? [];
  const deniedCapabilities = required.filter((c) => !allowed.has(c));

  // 2. Every required capability permitted.
  if (deniedCapabilities.length === 0) {
    return {
      allowed: true,
      level: 'permit',
      role,
      deniedCapabilities: [],
      reason: `Role '${role}' permits all ${required.length} required capabilit${required.length === 1 ? 'y' : 'ies'}`,
    };
  }

  // 3. Role-denied capabilities — HARD block only under the enforce_rbac flag.
  const enforced = opts.enforceRbac === true;
  const reason = `Role '${role}' is NOT permitted: ${deniedCapabilities.join(', ')} (${enforced ? 'enforce_rbac ON → blocked' : 'soft warn — ADR-037, not blocked'})`;

  if (opts.emit) {
    opts.emit({ actorId: actor?.id, role, deniedCapabilities, enforced, reason });
  }

  // ENT-1 audit bridge — record the authority violation on the sprint audit
  // hash-chain (ADR-037 audit-trail). Fires on both soft-warn and hard-deny;
  // `metadata.enforced` distinguishes the two. writeAuditEvent is itself
  // fail-safe (validation/IO never throws) so this never breaks the gate.
  if (opts.audit) {
    writeAuditEvent(opts.audit.projectRoot, opts.audit.sprintId ?? 'autonomous', {
      tenantId: opts.audit.tenantId ?? actor?.tenantId ?? 'local',
      actor: actor?.id ?? 'system',
      action: 'authority.denied',
      target: role,
      metadata: { deniedCapabilities, enforced, reason },
    });
  }

  if (enforced) {
    return { allowed: false, level: 'deny', role, deniedCapabilities, reason };
  }

  console.warn(`[deckent] [ADR-037 soft] worker authority: ${reason}`);
  return { allowed: true, level: 'warn', role, deniedCapabilities, reason };
}

// ─── ENT-1 bridge: authorizeExecution (ADR-037 V2 consumable) ────────────────
//
// Bridges the ExecutionRequest contract to checkWorkerAuthority. Returns a
// simpler structured result suitable for direct consumption in spawn-path
// callers (Brain hand-wires post-verify per ADR-047). Delegates entirely to
// checkWorkerAuthority — no logic duplication.

/** Result of the ExecutionRequest-contract authorization bridge (ENT-1). */
export interface AuthorizeExecutionResult {
  /** Whether the operation proceeds. Soft mode always allows; only hard (enforceRbac=true) denies. */
  allowed: boolean;
  /** Capabilities the actor role is NOT permitted (empty when allowed with no violations). */
  violations: string[];
  /** Whether enforcement was in hard mode (mirrors the enforceRbac opt-in flag). */
  enforced: boolean;
}

/**
 * ENT-1 bridge — authorize an `ExecutionRequest` against the RBAC authority matrix.
 *
 * Extracts `req.actor?.role` and `req.requirements?.capabilities`, delegates to
 * the existing `checkWorkerAuthority` logic, and returns a simplified result.
 *
 * Permissive default: absent actor or unknown role → `{ allowed:true, violations:[], enforced:false }`.
 * Soft by default (warn+emit, allowed:true); only when `opts.enforceRbac === true` does a
 * role-denied capability set `allowed:false` (mirrors the `enforce_rbac` config flag).
 *
 * Does NOT edit any spawn-path file — Brain hand-wires the spawn call post-verify (ADR-047).
 *
 * @param req  The contract slice carrying actor + required capabilities.
 * @param opts `enforceRbac` opt-in flag (default false = soft).
 */
export function authorizeExecution(
  req: Pick<ExecutionRequest, 'actor' | 'requirements'>,
  opts?: { enforceRbac?: boolean },
): AuthorizeExecutionResult {
  const result = checkWorkerAuthority(req, { enforceRbac: opts?.enforceRbac });
  return {
    allowed: result.allowed,
    violations: result.deniedCapabilities as string[],
    enforced: opts?.enforceRbac === true,
  };
}
