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
import { ACTION_BY_ID } from './action-registry.js';

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
