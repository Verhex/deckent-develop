// src/core/nervous-types.ts
//
// Nervous System placeholder types — Sprint 147 implementation zemin.
// Bu dosya Sprint 146 preflight'ta oluşturuldu; gerçek implementasyon Sprint 147'de.
//
// Design spec: docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md
// ADR-040: proposed (Sprint 147 sonunda accept edilecek)

// The canonical (V2) Nervous System config schema is the SINGLE source of truth and lives in
// `core/config-types.ts`. `NervousSystemConfigV1` (below) is now a backward-compat runtime VIEW
// derived from it. Type-only import → erased at compile time, so no runtime ESM cycle (ADR-001).
import type { NervousSystemConfig } from './config-types.js';

// ─── Authority Modes ─────────────────────────────────────────────────────────

/**
 * Yetki öncesi belirler hangi eylemlerin kullanıcı onayı gerektirdiğini.
 *
 * - strict:    Düşük risk → suggest-30m, Orta/Yüksek → approve  (Enterprise, yeni user)
 * - balanced:  Düşük → autonomous, Orta → suggest-30m, Yüksek → approve  (default)
 * - autopilot: Düşük/Orta → autonomous, Yüksek → suggest-5m  (güvenilir user)
 * - full-auto: Tümü → autonomous (safety floor hariç)  (CI/CD, hands-off)
 */
export type AuthorityMode = 'strict' | 'balanced' | 'autopilot' | 'full-auto';

// ─── Risk Levels ──────────────────────────────────────────────────────────────

/**
 * Bir eylemin veya olayın risk seviyesi.
 * Decision Engine bu değeri kullanarak ApprovalPolicy'yi belirler.
 */
export type RiskLevel = 'low' | 'medium' | 'high';

// ─── Approval Policies ────────────────────────────────────────────────────────

/**
 * Bir eylemin onay politikası.
 *
 * - autonomous:  Kullanıcı onayı olmadan otomatik yürütülür, history'ye loglanır
 * - suggest-30m: 30 dakika timeout ile öneri — kabul edilmezse auto-apply
 * - suggest-5m:  5 dakika timeout ile öneri — kabul edilmezse auto-apply
 * - approve:     Kullanıcı /accept veya /reject verinceye kadar bekler
 */
export type ApprovalPolicy = 'autonomous' | 'suggest-30m' | 'suggest-5m' | 'approve';

// ─── Severity ─────────────────────────────────────────────────────────────────

/**
 * Bir NervousNotification'ın görünürlük önceliği.
 *
 * - info:      Bilgilendirme amaçlı, kullanıcı müdahalesi gerekmez
 * - warning:   Dikkat edilmesi gereken durum, yakında eylem gerekebilir
 * - critical:  Hemen müdahale gerekebilir
 * - emergency: Sprint'i veya sistemi etkileyecek kritik durum
 */
export type Severity = 'info' | 'warning' | 'critical' | 'emergency';

// ─── Safety Floor Actions ─────────────────────────────────────────────────────

/**
 * Full-auto mod dahil hiçbir AuthorityMode'un otomatik yürütemeyeceği eylemler.
 * Bu 5 eylem kod seviyesinde kilitlidir — config override edilemez.
 *
 * Design spec Section 3: "Safety floor: full-auto bile bu 5 eylemi bypass edemez"
 */
export type SafetyFloorAction =
  | 'KILL_LIVE_SPRINT'         // Canlı sprint durdurma
  | 'MANUAL_FILE_DELETE'       // .tasks/* gibi manuel dosya silme
  | 'COST_OVER_THRESHOLD'      // Yapılandırılan eşiği aşan sprint başlatma
  | 'DESTRUCTIVE_GIT'          // git reset --hard, force push main
  | 'ADR_DEPRECATE_ACCEPTED';  // Accepted ADR'ı deprecate etme

// ─── Notification Action ──────────────────────────────────────────────────────

/**
 * Kullanıcıya sunulan öneri eylemi.
 * Sprint 147'de Proposer bileşeni bu yapıyı üretecek.
 */
export interface NotificationAction {
  /** Eylem tanımlayıcısı — unique per notification */
  readonly id: string;
  /** İnsan-okunabilir eylem etiketi (CLI/MCP'de gösterilir) */
  readonly label: string;
  /** Eylemin onay politikası */
  readonly policy: ApprovalPolicy;
  /** Eylemin risk seviyesi */
  readonly risk: RiskLevel;
  /** Safety floor kontrolü — true ise hiçbir mod otomatik yürütemez */
  readonly isSafetyFloor: boolean;
  /** Eylem parametreleri (tip-safe payload Sprint 147'de genişletilecek) */
  readonly payload?: Record<string, unknown>;
}

// ─── Nervous Notification ─────────────────────────────────────────────────────

/**
 * Nervous System'in ürettiği notification yapısı.
 * Proposer bileşeni bu yapıyı üretir, Dispatcher kanalları üzerinden iletir.
 *
 * Sprint 147 implementasyon notu:
 * - MCP push adapter: deckent_notification_push tool üzerinden
 * - CLI stderr adapter: ANSI formatlamalı tty output
 * - File log adapter: .deckent/nervous-history.jsonl append
 */
export interface NervousNotification {
  /** UUID v4 — bu ÜRETİMİN (instance) kimliği; her yeniden-üretimde değişir */
  readonly id: string;
  /** İçerik-parmakizi (sha256 hex) — detectorId + groupKey + action-id'lerinden
   *  DETERMINISTIK türetilir: AYNI bulgu kaç kez yeniden-üretilirse üretilsin aynı
   *  kalır. Karar-hafızası (decision-memory) + pending-dedup bu anahtar üzerinden
   *  çalışır — APPROVAL-LOOP fix (sprint-443): karar instance'a değil BULGUYA bağlanır. */
  readonly fingerprint?: string;
  /** Kısa, insan-yazılabilir onay kodu (fingerprint'ten deterministik türetilir —
   *  aynı bulgu = HEP aynı kod; operatör Telegram'da UUID yerine `approve <shortCode>`
   *  yazabilsin diye, proposer mint eder). */
  readonly shortCode?: string;
  /** Notification tipi — Detector tarafından belirlenir */
  readonly type: string;
  /** İnsan-okunabilir başlık */
  readonly title: string;
  /** Detaylı açıklama */
  readonly message: string;
  /** Görünürlük önceliği */
  readonly severity: Severity;
  /** ISO 8601 UTC timestamp */
  readonly createdAt: string;
  /** Tetikleyen Detector id'si */
  readonly detectorId: string;
  /** Kullanıcıya sunulan eylemler (boş → sadece bilgilendirme) */
  readonly actions: ReadonlyArray<NotificationAction>;
  /** Öneri zaman aşımı (ms) — null ise approve bekler */
  readonly timeoutMs: number | null;
  /** Sprint ID — sprint context varsa */
  readonly sprintId?: string;
  /** Task ID — task context varsa */
  readonly taskId?: string;
  /** Grouping key — aynı key'li notification'lar throttle edilir */
  readonly groupKey?: string;
}

// ─── Authority Matrix ─────────────────────────────────────────────────────────

/**
 * Bir AuthorityMode için eylem → onay politikası mapping'i.
 * Decision Engine bu yapıyı kullanarak her eylem için policy üretir.
 *
 * Sprint 147'de built-in preset'ler bu interface'i uygulayacak:
 * const BALANCED_MATRIX: AuthorityMatrix = { ... }
 */
export interface AuthorityMatrix {
  /** Bu matrix'in ait olduğu preset modu */
  readonly mode: AuthorityMode;
  /** Risk seviyesine göre default politika */
  readonly riskPolicyMap: Readonly<Record<RiskLevel, ApprovalPolicy>>;
  /**
   * Eylem bazlı override — preset'ten farklı politika gerektiren eylemler.
   * Kullanıcı .deckent/config.json'da action_overrides ile özelleştirebilir.
   */
  readonly actionOverrides: Readonly<Record<string, ApprovalPolicy>>;
  /**
   * Safety floor listesi — bu eylemler hiçbir zaman autonomous çalışmaz.
   * Preset tarafından değiştirilemez, sadece extend edilebilir.
   */
  readonly safetyFloor: ReadonlyArray<SafetyFloorAction>;
}

// ─── Nervous System Config ────────────────────────────────────────────────────

/**
 * **Backward-compat runtime VIEW** of the canonical {@link NervousSystemConfig} (V2) — the narrow
 * config shape Decision Engine / Proposer / Dispatcher / bootstrap operate on.
 *
 * ## V1→V2 migration (Sprint 323, task 323-010)
 * There is now ONE source of truth for the nervous-system config: the full V2
 * {@link NervousSystemConfig} in `core/config-types.ts` (safety_floor + notifications + detectors).
 * This type is no longer an independent, divergent definition — it is **derived from V2** via
 * indexed-access/`Pick`/`Partial`, so its shared fields (`mode`, `enabled`, `actionOverrides`,
 * `approve_timeout_ms`, `worker_respawn`) can never drift from the canonical schema. At runtime
 * `config.nervous_system` is always the V2 object; the runtime modules read this narrow view of it.
 *
 * Two fields below — `quietHours` and `throttleWindowMs` — are **legacy camelCase aliases** that do
 * NOT exist on the V2 schema (V2 nests them as `notifications.quiet_hours` / `notifications.throttle_ms`).
 * They are retained ONLY as optional view fields so the existing readers keep type-checking and
 * behave byte-for-byte identically: against a real (V2 snake_case) config they resolve to `undefined`
 * → the modules fall back to their built-in defaults, exactly as today. Re-pointing those reads at the
 * nested V2 fields would change behavior and is intentionally OUT of this task's scope.
 *
 * @see NervousSystemConfig — the canonical V2 schema (single source of truth).
 * @deprecated Prefer the canonical {@link NervousSystemConfig}. This view is kept for the runtime
 * modules that consume the narrow shape; new code should read the full V2 config directly.
 */
export type NervousSystemConfigV1 =
  // Shared fields — derived from the V2 SSOT so they can never diverge from the canonical schema.
  & Readonly<Pick<NervousSystemConfig, 'mode' | 'enabled'>>
  & Readonly<Partial<Pick<NervousSystemConfig, 'actionOverrides' | 'approve_timeout_ms' | 'worker_respawn' | 'reject_suppress_ms' | 'accept_cooldown_ms'>>>
  // Legacy camelCase runtime-view aliases — absent from V2; retained for behavior-preserving reads.
  & {
      /** Quiet hours: {start: "23:00", end: "07:00"}. Legacy alias — V2 nests this as
       *  `notifications.quiet_hours`; absent on a real V2 config (→ undefined → no delay). */
      readonly quietHours?: Readonly<{ start: string; end: string }>;
      /** Throttle window (ms) — same-groupKey notifications suppressed within it. Legacy alias —
       *  V2 nests this as `notifications.throttle_ms`; absent on a real V2 config (→ 5min default). */
      readonly throttleWindowMs?: number;
    };

// ─── Detector Result ──────────────────────────────────────────────────────────

/**
 * Observer Layer'dan gelen event'i işleyen Detector'ın ürettiği sonuç.
 * Sprint 147'de DetectorRegistry bu interface'i kullanan Detector'ları yönetecek.
 */
export interface DetectorResult {
  /** Bu detector tarafından belirlenen risk seviyesi */
  readonly risk: RiskLevel;
  /** Öneri eylemler (boş → sadece log) */
  readonly suggestedActions: ReadonlyArray<Pick<NotificationAction, 'id' | 'label' | 'risk' | 'payload'>>;
  /** Notification üretilmeli mi */
  readonly shouldNotify: boolean;
  /** Human-readable headline (REQUIRED — e.g. "Stale worker w-290-001"). */
  readonly title: string;
  /** Human-readable description (REQUIRED — what was detected + why it matters). */
  readonly message: string;
  /** Authoritative detector id — stamped by the registry, not the detector body. */
  readonly detectorId?: string;
  /** Notification severity — shouldNotify true ise kullanılır */
  readonly severity?: Severity;
  /** Gruplama anahtarı — throttle için */
  readonly groupKey?: string;
  /** Detector'a özgü ham veri */
  readonly metadata?: Record<string, unknown>;
}

// ─── Observer Event ──────────────────────────────────────────────────────────

/**
 * Observer Layer event source tipi.
 * Her kaynak farklı frekans ve tetikleyiciye sahiptir.
 */
export type ObserverEventSource = 'event-bus' | 'filesystem' | 'cron' | 'sprint-lifecycle';

/**
 * Observer Layer'ın algıladığı her olay.
 * Detector'lara iletilmek üzere NervousObserver tarafından üretilir.
 */
export interface ObserverEvent {
  /** UUID v4 — event dedup ve tracing için */
  readonly id: string;
  /** Bu event'in kaynağı */
  readonly source: ObserverEventSource;
  /** Event tipi — e.g. "WORKER_HEARTBEAT", "FILE_WRITE", "SPRINT_PHASE_CHANGE" */
  readonly type: string;
  /** ISO 8601 UTC timestamp */
  readonly timestamp: string;
  /** Event payload — kaynak tipine göre değişir */
  readonly payload: Record<string, unknown>;
  /** Sprint context varsa */
  readonly sprintId?: string;
  /** Task context varsa */
  readonly taskId?: string;
}

// ─── Sprint State Snapshot ───────────────────────────────────────────────────

/**
 * Detector'a aktarılan anlık sprint durumu.
 * Detector'lar bu snapshot üzerinden karar verir.
 */
export interface SprintStateSnapshot {
  /** Aktif sprint ID (null = idle) */
  readonly sprintId: string | null;
  /** Mevcut sprint fazı */
  readonly currentPhase: 'IDLE' | 'PLAN' | 'SPAWN' | 'EXECUTE' | 'EVALUATE' | 'FIX' | 'RETRO' | 'DECAY' | 'CLEANUP';
  /** Aktif worker listesi — heartbeat bilgisi ile */
  readonly activeWorkers: ReadonlyArray<{ id: string; taskId: string; lastHeartbeat: string }>;
  /** Açık teknik borç sayısı */
  readonly openDebtCount: number;
  /** Sprint'teki toplam task sayısı */
  readonly totalTasks: number;
  /** Tamamlanan task sayısı */
  readonly completedTasks: number;
}

// ─── Detector Context ────────────────────────────────────────────────────────

/**
 * Detector.detect() fonksiyonuna aktarılan tam bağlam.
 * Observer event + sprint state + zaman bilgisi içerir.
 */
export interface DetectorContext {
  /** Tetikleyen observer event */
  readonly event: ObserverEvent;
  /** Anlık sprint durumu */
  readonly sprintState: SprintStateSnapshot;
  /** Proje kök dizini */
  readonly projectRoot: string;
  /** Test edilebilirlik için enjekte edilebilir zaman */
  readonly now: Date;
}

// ─── Action Definition ───────────────────────────────────────────────────────

/**
 * Nervous System'in yürütebileceği bir eylem tanımı.
 * ActionRegistry'de 30 eylem bu interface ile tanımlıdır.
 */
export interface ActionDefinition {
  /** Eylem tanımlayıcısı — e.g. "ORPHAN_TASK_ARCHIVE" */
  readonly id: string;
  /** İnsan-okunabilir görünen ad */
  readonly displayName: string;
  /** Kısa açıklama */
  readonly description: string;
  /** Risk kategorisi */
  readonly category: 'low-risk' | 'medium-risk' | 'high-risk' | 'safety-floor';
  /** Varsayılan risk seviyesi */
  readonly defaultRisk: RiskLevel;
  /** Safety floor kontrolü — boş değilse approve zorunlu */
  readonly requiredSafetyFloor: ReadonlyArray<SafetyFloorAction>;
  /** Undo desteği var mı */
  readonly reversible: boolean;
}

// ─── Execution Record ────────────────────────────────────────────────────────

/**
 * Bir eylemin yürütülme kaydı.
 * NervousHistory JSONL dosyasına append edilir.
 */
export interface ExecutionRecord {
  /** UUID — kayıt tanımlayıcısı */
  readonly id: string;
  /** İlgili notification ID */
  readonly notificationId: string;
  /** Yürütülen eylem ID */
  readonly actionId: string;
  /** Karar sonucu */
  readonly decision: 'accepted' | 'rejected' | 'timeout-auto-applied' | 'autonomous';
  /** Kararı veren */
  readonly decidedBy: 'user' | 'system' | 'timeout';
  /** ISO 8601 UTC — yürütülme zamanı */
  readonly executedAt: string;
  /** Yürütme sonucu */
  readonly outcome: 'success' | 'failure' | 'pending';
  /** Hata mesajı (outcome='failure' ise) */
  readonly error?: string;
  /** Yürütme süresi (ms) */
  readonly durationMs?: number;
  /** Geri alınabilir mi */
  readonly reversible: boolean;
  /** Eylem payload'u */
  readonly payload: Record<string, unknown>;
}

// ─── Decision Output ─────────────────────────────────────────────────────────

/**
 * Decision Engine'in bir detector sonucu için ürettiği karar çıktısı.
 * Her suggested action için bir DecisionOutput üretilir.
 */
export interface DecisionOutput {
  /** Eylem tanımı */
  readonly action: ActionDefinition;
  /** Çözümlenmiş onay politikası (authority matrix + override + safety floor) */
  readonly policy: ApprovalPolicy;
  /** Eylemin risk seviyesi */
  readonly risk: RiskLevel;
  /** Safety floor kapsamında mı */
  readonly isSafetyFloor: boolean;
  /** İnsan-okunabilir karar gerekçesi (transparency) */
  readonly reason: string;
}
