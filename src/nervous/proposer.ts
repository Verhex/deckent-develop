// src/nervous/proposer.ts
//
// Proposer — Nervous System Notification Builder + Throttle + Grouping
// Sprint 147 Task 6
//
// DetectorResult + DecisionOutput[] → NervousNotification | null
// Throttle: aynı groupKey 5dk içinde tekrar üretilmez
// Severity filter: config.severityMin altındaki severity'ler filtrelenir
// Critical/emergency severity throttle ve severity filter'ı bypass eder

import type {
  NervousNotification,
  NotificationAction,
  DetectorResult,
  DecisionOutput,
  Severity,
  NervousSystemConfigV1,
  ApprovalPolicy,
} from '../core/nervous-types.js';
import { randomUUID, createHash } from 'node:crypto';

/**
 * Kısa, insan-yazılabilir onay kodu — bulgunun FINGERPRINT'inden DETERMINISTIK
 * türetilir. APPROVAL-LOOP fix (sprint-443): eskiden per-instance UUID'den
 * türüyordu → aynı bulgu her yeniden-üretimde YENİ kod alıyordu ve operatörün
 * accept/reject'i yalnız o instance'ı kapatıyordu. Artık aynı bulgu = HEP aynı
 * kod (5 base36 hane) — `approve <code>` bulguyu kapatır, pending-dedup aynı
 * anda tek instance garantiler (kod-çakışması pending içinde imkânsızlaşır).
 */
function shortApprovalCode(fingerprint: string): string {
  const h = createHash('sha256').update(fingerprint).digest('hex');
  return parseInt(h.slice(0, 12), 16).toString(36).slice(0, 5).padStart(5, '0');
}

/**
 * İçerik-parmakizi — sprintId + detectorId + groupKey (yoksa type+title) +
 * sıralı action-id listesinden sha256. AYNI bulgu kaç kez yeniden-üretilirse
 * üretilsin sabittir; decision-memory + pending-dedup bu anahtar üzerinden çalışır.
 *
 * Sprint-KAPSAMLI (yutma-analizi bulgusu): groupKey'ler çoğu dedektörde task-id
 * içermez (scope-collision = dosya-listesi) — sprintId olmasa YENİ sprint'in yeni
 * çakışması, önceki sprint'te verilmiş bir reject'in susturma-penceresine takılırdı.
 * sprintId'siz bulgular (sprint-bağımsız dedektörler) global kapsamda kalır.
 */
export function findingFingerprint(
  detectorId: string,
  detectorResult: DetectorResult,
  actionIds: readonly string[],
  sprintId?: string,
): string {
  const identity = detectorResult.groupKey
    ?? `${String(detectorResult.metadata?.type ?? 'generic')}|${detectorResult.title}`;
  const actions = [...actionIds].sort().join(',');
  return createHash('sha256').update(`${sprintId ?? ''}|${detectorId}|${identity}|${actions}`).digest('hex');
}

// ─── Severity Rank ───────────────────────────────────────────────────────────

const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  info: 0,
  warning: 1,
  critical: 2,
  emergency: 3,
};

// ─── Timeout Map ─────────────────────────────────────────────────────────────

const POLICY_TIMEOUT_MS: Readonly<Partial<Record<ApprovalPolicy, number>>> = {
  'suggest-5m': 300_000,
  'suggest-30m': 1_800_000,
};

// ─── Proposer Class ──────────────────────────────────────────────────────────

export interface ProposerContext {
  readonly detectorId: string;
  readonly sprintId?: string;
  readonly taskId?: string;
  readonly title: string;
  readonly message: string;
  readonly now?: Date;
}

export class Proposer {
  private readonly recentGroups: Map<string, number> = new Map(); // groupKey → lastEmittedMs

  constructor(private readonly config: NervousSystemConfigV1) {}

  /**
   * DetectorResult + DecisionOutput[] → NervousNotification | null
   *
   * Returns null if:
   * - detectorResult.shouldNotify is false
   * - severity is below config severityMin (unless critical/emergency)
   * - groupKey is throttled (unless critical/emergency)
   */
  propose(
    detectorResult: DetectorResult,
    decisions: DecisionOutput[],
    context: ProposerContext,
  ): NervousNotification | null {
    // Gate 1: shouldNotify check
    if (!detectorResult.shouldNotify) return null;

    const severity: Severity = detectorResult.severity ?? 'info';
    const isCriticalOrAbove = severity === 'critical' || severity === 'emergency';

    // Gate 2: severity filter (critical/emergency bypass)
    if (!isCriticalOrAbove && !this.passesSeverityFilter(severity)) return null;

    // Gate 3: throttle check (critical/emergency bypass)
    const groupKey = detectorResult.groupKey;
    if (!isCriticalOrAbove && groupKey && this.isThrottled(groupKey, context.now)) return null;

    // Build actions from decisions
    const actions: NotificationAction[] = decisions.map(d => ({
      id: d.action.id,
      label: d.action.displayName,
      policy: d.policy,
      risk: d.risk,
      isSafetyFloor: d.isSafetyFloor,
      payload: detectorResult.suggestedActions.find(s => s.id === d.action.id)?.payload,
    }));

    // Build notification
    const now = context.now ?? new Date();
    const id = randomUUID();
    const fingerprint = findingFingerprint(context.detectorId, detectorResult, actions.map(a => a.id), context.sprintId);
    const notification: NervousNotification = {
      id,
      fingerprint,
      shortCode: shortApprovalCode(fingerprint),
      type: (detectorResult.metadata?.type as string) ?? 'generic',
      title: context.title,
      message: context.message,
      severity,
      createdAt: now.toISOString(),
      detectorId: context.detectorId,
      actions,
      timeoutMs: computeTimeoutMs(decisions),
      sprintId: context.sprintId,
      taskId: context.taskId,
      groupKey,
    };

    // Update throttle map
    if (groupKey) {
      this.recentGroups.set(groupKey, now.getTime());
    }

    return notification;
  }

  /**
   * Clear throttle state — useful for testing or config change
   */
  clearThrottleState(): void {
    this.recentGroups.clear();
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private isThrottled(groupKey: string, now?: Date): boolean {
    const lastMs = this.recentGroups.get(groupKey);
    if (lastMs === undefined) return false;
    const throttleWindow = this.config.throttleWindowMs ?? 300_000; // 5 min default
    return (now ?? new Date()).getTime() - lastMs < throttleWindow;
  }

  private passesSeverityFilter(severity: Severity): boolean {
    const minSeverity = (this.config as unknown as Record<string, unknown>).severityMin as Severity | undefined;
    const minRank = SEVERITY_RANK[minSeverity ?? 'info'];
    return SEVERITY_RANK[severity] >= minRank;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute the smallest suggest-* timeout from decisions.
 * Returns null if no suggest policy is present (all autonomous or approve).
 */
export function computeTimeoutMs(decisions: DecisionOutput[]): number | null {
  let smallest: number | null = null;

  for (const d of decisions) {
    const ms = POLICY_TIMEOUT_MS[d.policy];
    if (ms !== undefined) {
      if (smallest === null || ms < smallest) {
        smallest = ms;
      }
    }
  }

  return smallest;
}
