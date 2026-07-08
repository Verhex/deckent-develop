// src/nervous/decision-engine.ts
//
// Decision Engine — Detector sonucu + Authority Matrix => DecisionOutput.
// Merkezi politika karar noktasi. Nervous System'in beyni.
//
// Sprint 147 Task 5.

import type {
  ActionDefinition,
  ApprovalPolicy,
  AuthorityMatrix,
  DecisionOutput,
  DetectorResult,
  NervousSystemConfigV1,
  Severity,
} from '../core/nervous-types.js';
import { MATRIX_BY_MODE, resolvePolicy } from './authority-matrix.js';
import { ACTION_BY_ID } from './action-registry.js';
import { resolveRiskClass, type ExecutionRequest } from '../core/work-model.js';

// ─── Detector-Action Reach-Fix (born-569 / 382-005) ──────────────────────────
//
// Audit finding: build-failure-recurrence, dead-event-stream and
// notification-delivery-health emit suggestedActions.id values that were
// never added to ACTION_REGISTRY (src/nervous/action-registry.ts). decide()
// looked them up via ACTION_BY_ID, found nothing, and `continue`d — dropping
// every suggested action for these 3 detectors. When ALL of a result's
// suggestedActions are dropped, decide() returns [] and bootstrap.ts's
// runPipeline short-circuits (`if (decisions.length === 0) return;`) before
// proposer/dispatcher ever run, so the detection never reaches a channel.
//
// Registering these ids in the canonical ACTION_REGISTRY is out of this
// task's write-scope, so this local fallback table synthesizes an
// ActionDefinition for exactly these known-mismatched ids (never for a
// genuinely unknown id — those still skip silently, preserving existing
// behavior for future/removed actions a detector might reference).
const DETECTOR_ACTION_FALLBACK: ReadonlyMap<string, Omit<ActionDefinition, 'id' | 'defaultRisk'>> =
  new Map([
    ['BUILD_FAILURE_INVESTIGATE', {
      displayName: 'Build Failure Investigate',
      description: 'Same file(s) failed tsc/build across consecutive sprints — needs root-cause investigation',
      category: 'medium-risk',
      requiredSafetyFloor: [],
      reversible: true,
    }],
    ['INVESTIGATE_STALL', {
      displayName: 'Investigate Sprint Stall',
      description: 'Sprint event stream silent with active worker(s) — possible stall',
      category: 'medium-risk',
      requiredSafetyFloor: [],
      reversible: true,
    }],
    ['FORCE_EVALUATE', {
      displayName: 'Force Sprint Evaluation',
      description: 'Force sprint evaluation now to unstick a possibly-stalled sprint',
      category: 'medium-risk',
      requiredSafetyFloor: [],
      reversible: true,
    }],
    ['KILL_WORKERS', {
      displayName: 'Kill Stalled Workers',
      description: 'Kill worker(s) detected stalled by a dead event stream',
      category: 'high-risk',
      requiredSafetyFloor: [],
      reversible: false,
    }],
    ['NOTIFICATION_BRIDGE_REPAIR', {
      displayName: 'Notification Bridge Repair',
      description: 'Nervous notification delivery is degraded — bridge needs repair',
      category: 'high-risk',
      requiredSafetyFloor: [],
      reversible: true,
    }],
  ]);

/**
 * resolvePolicy() equivalent for {@link DETECTOR_ACTION_FALLBACK} actions —
 * mirrors its override-precedence (safety-floor id check, user override,
 * matrix override, risk-based default) but operates on an already-synthesized
 * {@link ActionDefinition} instead of an ACTION_BY_ID lookup, since
 * resolvePolicy() itself throws for an id it cannot find in the registry.
 */
function resolveFallbackPolicy(
  matrix: AuthorityMatrix,
  action: ActionDefinition,
  userOverrides?: Readonly<Record<string, ApprovalPolicy>>,
): { policy: ApprovalPolicy; isSafetyFloor: boolean; reason: string } {
  const isSafetyFloor =
    action.requiredSafetyFloor.length > 0 ||
    (matrix.safetyFloor as readonly string[]).includes(action.id);

  if (isSafetyFloor) {
    return {
      policy: 'approve',
      isSafetyFloor: true,
      reason: `Safety floor: ${action.id} requires explicit user approval`,
    };
  }

  const userOverride = userOverrides?.[action.id];
  if (userOverride) {
    return {
      policy: userOverride,
      isSafetyFloor: false,
      reason: `User override for ${action.id}: ${userOverride}`,
    };
  }

  const matrixOverride = matrix.actionOverrides[action.id];
  if (matrixOverride) {
    return {
      policy: matrixOverride,
      isSafetyFloor: false,
      reason: `Matrix override: ${matrixOverride}`,
    };
  }

  const defaultPolicy = matrix.riskPolicyMap[action.defaultRisk];
  return {
    policy: defaultPolicy,
    isSafetyFloor: false,
    reason: `Risk-based default (${action.defaultRisk}): ${defaultPolicy} [reach-fix: unregistered action]`,
  };
}

// ─── Risk-Gate Types ────────────────────────────────────────────────────────

/**
 * Minimal request shape the risk-gate consumes (F10-002 / WM-6). `resolveRiskClass`
 * derives low/medium/high from these two fields only, so callers need not pass a
 * full {@link ExecutionRequest}.
 */
export type RiskGateRequest = Pick<ExecutionRequest, 'requirements' | 'capabilityTarget'>;

// ─── Decision Engine ────────────────────────────────────────────────────────

export class DecisionEngine {
  constructor(private readonly config: NervousSystemConfigV1) {}

  /**
   * Ana karar fonksiyonu — her detector sonucu icin cagrilir.
   *
   * Her suggestedAction icin:
   * 1. ActionRegistry'den ActionDefinition bulunur
   * 2. Authority Matrix + override + safety floor ile policy cozumlenir
   * 3. DecisionOutput uretilir
   *
   * Bilinmeyen action ID'ler sessizce atlanir (log + skip).
   *
   * Risk-gate (F10-002 / WM-6): when an optional `request` is supplied AND the
   * opt-in `risk_gate_enabled` flag is set AND the operation resolves to HIGH
   * risk (shell / erp-write / db-write / send·write·delete verbs), every
   * non-safety-floor decision is parked on the mandatory-approval path instead
   * of auto-executing. Default OFF + absent request → fully backward-safe.
   *
   * @throws Error — config.mode gecersizse (matrix bulunamazsa)
   */
  decide(detectorResult: DetectorResult, request?: RiskGateRequest): DecisionOutput[] {
    const matrix = MATRIX_BY_MODE.get(this.config.mode);
    if (!matrix) {
      throw new Error(`Invalid authority mode: ${this.config.mode}`);
    }

    const outputs: DecisionOutput[] = [];

    for (const suggested of detectorResult.suggestedActions) {
      const registered = ACTION_BY_ID.get(suggested.id);

      if (registered) {
        const resolution = resolvePolicy(
          matrix,
          suggested.id,
          this.config.actionOverrides,
        );

        outputs.push({
          action: registered,
          policy: resolution.policy,
          risk: suggested.risk,
          isSafetyFloor: resolution.isSafetyFloor,
          reason: resolution.reason,
        });
        continue;
      }

      const fallback = DETECTOR_ACTION_FALLBACK.get(suggested.id);
      if (!fallback) {
        // Genuinely unknown action — skip silently (detector might reference future actions)
        continue;
      }

      const action: ActionDefinition = { id: suggested.id, defaultRisk: suggested.risk, ...fallback };
      const resolution = resolveFallbackPolicy(matrix, action, this.config.actionOverrides);

      outputs.push({
        action,
        policy: resolution.policy,
        risk: suggested.risk,
        isSafetyFloor: resolution.isSafetyFloor,
        reason: resolution.reason,
      });
    }

    // Risk-gate — opt-in governance over a HIGH-risk operation (reuse SSOT
    // resolveRiskClass). Safety-floor outputs are already 'approve'; leave them
    // (and their reason/flag) untouched so the gate only widens, never narrows.
    if (request && this.isRiskGateEnabled()) {
      const riskClass = resolveRiskClass(request);
      if (riskClass === 'high') {
        return outputs.map((output): DecisionOutput =>
          output.isSafetyFloor
            ? output
            : {
                ...output,
                policy: 'approve',
                reason: `Risk-gate (high-risk operation): parked for approval — ${output.reason}`,
              },
        );
      }
    }

    return outputs;
  }

  /**
   * Risk-gate flag (F10-002 / WM-6) — opt-in governance, default OFF.
   *
   * Read defensively off the resolved config: `risk_gate_enabled` lives in the
   * `.deckent/config.json` `nervous_system` section, which bootstrap passes
   * through verbatim to this engine. Declaring it on {@link NervousSystemConfigV1}
   * (core/) is a typed follow-up — out of this task's scope. Absent → false →
   * backward-safe (no gating).
   */
  private isRiskGateEnabled(): boolean {
    return (
      (this.config as NervousSystemConfigV1 & { risk_gate_enabled?: boolean })
        .risk_gate_enabled === true
    );
  }

  /**
   * Quiet hours kontrolu — bildirim geciktirilmeli mi?
   *
   * - critical ve emergency severity her zaman gecer (bypass)
   * - config.quietHours tanimli degilse false
   * - Sessiz saat icerisindeyse info/warning geciktirilir
   */
  shouldDelay(severity: Severity, now: Date = new Date()): boolean {
    if (!this.config.quietHours) return false;
    if (severity === 'critical' || severity === 'emergency') return false;
    return isInQuietHours(now, this.config.quietHours);
  }
}

// ─── Quiet Hours Helper ─────────────────────────────────────────────────────

/**
 * Verilen zamanin sessiz saat araliginda olup olmadigini kontrol eder.
 *
 * Format: "HH:MM" (24 saat, TRT timezone varsayimi — UTC+3 offset caller tarafindan handle edilir).
 * Gece yarisi gecisi desteklenir: start=22:00, end=08:00 → 22:00-23:59 ve 00:00-07:59 sessiz.
 *
 * @param now - Kontrol edilecek zaman (Date objesi)
 * @param quiet - { start: "HH:MM", end: "HH:MM" }
 * @returns true ise bildirim geciktirilmeli
 */
export function isInQuietHours(
  now: Date,
  quiet: Readonly<{ start: string; end: string }>,
): boolean {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTimeToMinutes(quiet.start);
  const endMinutes = parseTimeToMinutes(quiet.end);

  // Same-day range: e.g. 08:00 - 17:00
  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  // Wrap-around range: e.g. 22:00 - 08:00 (crosses midnight)
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

/**
 * "HH:MM" formatini gun icerisindeki dakika sayisina cevirir.
 */
function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}
