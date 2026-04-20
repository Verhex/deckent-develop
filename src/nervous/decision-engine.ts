// src/nervous/decision-engine.ts
//
// Decision Engine — Detector sonucu + Authority Matrix => DecisionOutput.
// Merkezi politika karar noktasi. Nervous System'in beyni.
//
// Sprint 147 Task 5.

import type {
  DecisionOutput,
  DetectorResult,
  NervousSystemConfig,
  Severity,
} from '../core/nervous-types.js';
import { MATRIX_BY_MODE, resolvePolicy } from './authority-matrix.js';
import { ACTION_BY_ID } from './action-registry.js';

// ─── Decision Engine ────────────────────────────────────────────────────────

export class DecisionEngine {
  constructor(private readonly config: NervousSystemConfig) {}

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
   * @throws Error — config.mode gecersizse (matrix bulunamazsa)
   */
  decide(detectorResult: DetectorResult): DecisionOutput[] {
    const matrix = MATRIX_BY_MODE.get(this.config.mode);
    if (!matrix) {
      throw new Error(`Invalid authority mode: ${this.config.mode}`);
    }

    const outputs: DecisionOutput[] = [];

    for (const suggested of detectorResult.suggestedActions) {
      const action = ACTION_BY_ID.get(suggested.id);
      if (!action) {
        // Unknown action — skip silently (detector might reference future actions)
        continue;
      }

      const resolution = resolvePolicy(
        matrix,
        suggested.id,
        this.config.actionOverrides,
      );

      outputs.push({
        action,
        policy: resolution.policy,
        risk: suggested.risk,
        isSafetyFloor: resolution.isSafetyFloor,
        reason: resolution.reason,
      });
    }

    return outputs;
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
