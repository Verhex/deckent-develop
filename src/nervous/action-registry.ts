// src/nervous/action-registry.ts
//
// Nervous System Action Registry — 30 eylem, 4 kategori (low/medium/high/safety-floor).
// Design spec Section 4. Sprint 147 Task 2.

import type { ActionDefinition, SafetyFloorAction } from '../core/nervous-types.js';

// ─── Safety Floor Action IDs ─────────────────────────────────────────────────
// Bu 5 eylem hiçbir AuthorityMode'da autonomous çalışamaz.

const SAFETY_FLOOR_IDS: ReadonlySet<string> = new Set<SafetyFloorAction>([
  'KILL_LIVE_SPRINT',
  'MANUAL_FILE_DELETE',
  'COST_OVER_THRESHOLD',
  'DESTRUCTIVE_GIT',
  'ADR_DEPRECATE_ACCEPTED',
]);

// ─── Action Registry ─────────────────────────────────────────────────────────

export const ACTION_REGISTRY: ReadonlyArray<ActionDefinition> = [
  // ────────────────────────────────────────────────────────────────────────────
  // 🟢 Low Risk (8 actions) — autonomous in balanced+
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'DEAD_EVENT_STREAM_CLEANUP',
    displayName: 'Dead Event Stream Cleanup',
    description: 'Bozuk event stream dosyası temizleme',
    category: 'low-risk',
    defaultRisk: 'low',
    requiredSafetyFloor: [],
    reversible: false,
  },
  {
    id: 'ORPHAN_TASK_ARCHIVE',
    displayName: 'Orphan Task Archive',
    description: 'Orphan .tasks/ dosyalarını arşivle',
    category: 'low-risk',
    defaultRisk: 'low',
    requiredSafetyFloor: [],
    reversible: true,
  },
  {
    id: 'LOG_ROTATION',
    displayName: 'Log Rotation',
    description: 'Sprint log dosyalarını rotate et (eski logları arşivle)',
    category: 'low-risk',
    defaultRisk: 'low',
    requiredSafetyFloor: [],
    reversible: false,
  },
  {
    id: 'CACHE_INVALIDATE',
    displayName: 'Cache Invalidate',
    description: 'Build veya routing cache temizle',
    category: 'low-risk',
    defaultRisk: 'low',
    requiredSafetyFloor: [],
    reversible: false,
  },
  {
    id: 'STALE_LOCK_RELEASE',
    displayName: 'Stale Lock Release',
    description: '5dk+ eski .locks/ dosyalarını serbest bırak',
    category: 'low-risk',
    defaultRisk: 'low',
    requiredSafetyFloor: [],
    reversible: false,
  },
  {
    id: 'IPC_DIR_CLEANUP',
    displayName: 'IPC Directory Cleanup',
    description: 'Orphan IPC dosyalarını temizle',
    category: 'low-risk',
    defaultRisk: 'low',
    requiredSafetyFloor: [],
    reversible: false,
  },
  {
    id: 'DEBT_TRENDING_REPORT',
    displayName: 'Debt Trending Report',
    description: 'Teknik borç trend raporu oluştur',
    category: 'low-risk',
    defaultRisk: 'low',
    requiredSafetyFloor: [],
    reversible: false,
  },
  {
    id: 'METRIC_EMIT',
    displayName: 'Metric Emit',
    description: 'Observability metrik noktası yayınla',
    category: 'low-risk',
    defaultRisk: 'low',
    requiredSafetyFloor: [],
    reversible: false,
  },

  // ────────────────────────────────────────────────────────────────────────────
  // 🟡 Medium Risk (11 actions) — suggest in balanced, autonomous in autopilot
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'DIRECTIVES_WRITE',
    displayName: 'Directives Write',
    description: 'DIRECTIVES.md içeriğini güncelle',
    category: 'medium-risk',
    defaultRisk: 'medium',
    requiredSafetyFloor: [],
    reversible: true,
  },
  {
    id: 'PROMPT_BUILDER_TWEAK',
    displayName: 'Prompt Builder Tweak',
    description: 'Worker prompt şablonunu ayarla',
    category: 'medium-risk',
    defaultRisk: 'medium',
    requiredSafetyFloor: [],
    reversible: true,
  },
  {
    id: 'SKILL_ROUTING_ADJUST',
    displayName: 'Skill Routing Adjust',
    description: 'Skill atama ağırlıklarını ayarla',
    category: 'medium-risk',
    defaultRisk: 'medium',
    requiredSafetyFloor: [],
    reversible: true,
  },
  {
    id: 'DEBT_REPRIORITIZE',
    displayName: 'Debt Reprioritize',
    description: 'Teknik borç önceliğini yeniden sırala',
    category: 'medium-risk',
    defaultRisk: 'medium',
    requiredSafetyFloor: [],
    reversible: true,
  },
  {
    id: 'WORKER_RESPAWN',
    displayName: 'Worker Respawn',
    description: 'Stale veya başarısız worker yeniden başlat',
    category: 'medium-risk',
    defaultRisk: 'medium',
    requiredSafetyFloor: [],
    reversible: false,
  },
  {
    id: 'SCOPE_COLLISION_REORDER',
    displayName: 'Scope Collision Reorder',
    description: 'Çakışan task sıralamasını yeniden düzenle',
    category: 'medium-risk',
    defaultRisk: 'medium',
    requiredSafetyFloor: [],
    reversible: true,
  },
  {
    id: 'ADR_DRAFT',
    displayName: 'ADR Draft',
    description: 'Yeni ADR taslağı oluştur (proposed status)',
    category: 'medium-risk',
    defaultRisk: 'medium',
    requiredSafetyFloor: [],
    reversible: true,
  },
  {
    id: 'RETRO_AUGMENT',
    displayName: 'Retro Augment',
    description: 'Retrospektif raporuna ek insight ekle',
    category: 'medium-risk',
    defaultRisk: 'medium',
    requiredSafetyFloor: [],
    reversible: true,
  },
  {
    id: 'AGENT_PERFORMANCE_FLAG',
    displayName: 'Agent Performance Flag',
    description: 'Düşük performanslı agent işaretle',
    category: 'medium-risk',
    defaultRisk: 'medium',
    requiredSafetyFloor: [],
    reversible: true,
  },
  {
    id: 'SPRINT_GATE_ADJUST',
    displayName: 'Sprint Gate Adjust',
    description: 'Sprint geçiş kapısı eşiklerini ayarla',
    category: 'medium-risk',
    defaultRisk: 'medium',
    requiredSafetyFloor: [],
    reversible: true,
  },
  {
    id: 'TASK_DEPENDENCY_REWIRE',
    displayName: 'Task Dependency Rewire',
    description: 'Task bağımlılık grafiğini yeniden bağla',
    category: 'medium-risk',
    defaultRisk: 'medium',
    requiredSafetyFloor: [],
    reversible: true,
  },

  // ────────────────────────────────────────────────────────────────────────────
  // 🔴 High Risk (6 actions) — approve in balanced, suggest in autopilot
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'SPRINT_START',
    displayName: 'Sprint Start',
    description: 'Yeni sprint başlat',
    category: 'high-risk',
    defaultRisk: 'high',
    requiredSafetyFloor: [],
    reversible: false,
  },
  {
    id: 'SPRINT_STOP',
    displayName: 'Sprint Stop',
    description: 'Aktif sprint durdur (graceful)',
    category: 'high-risk',
    defaultRisk: 'high',
    requiredSafetyFloor: [],
    reversible: false,
  },
  {
    id: 'SRC_MODIFICATION',
    displayName: 'Source Modification',
    description: 'Kaynak kodu değişikliği uygula',
    category: 'high-risk',
    defaultRisk: 'high',
    requiredSafetyFloor: [],
    reversible: true,
  },
  {
    id: 'COMMIT_CREATE',
    displayName: 'Commit Create',
    description: 'Git commit oluştur',
    category: 'high-risk',
    defaultRisk: 'high',
    requiredSafetyFloor: [],
    reversible: true,
  },
  {
    id: 'COMMIT_PUSH',
    displayName: 'Commit Push',
    description: 'Git commit push et (remote)',
    category: 'high-risk',
    defaultRisk: 'high',
    requiredSafetyFloor: [],
    reversible: false,
  },
  {
    id: 'AGENT_DISABLE',
    displayName: 'Agent Disable',
    description: 'Agent havuzundan agent devre dışı bırak',
    category: 'high-risk',
    defaultRisk: 'high',
    requiredSafetyFloor: [],
    reversible: true,
  },

  // ────────────────────────────────────────────────────────────────────────────
  // 🛑 Safety Floor (5 actions) — ALWAYS require approve, even in full-auto
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'KILL_LIVE_SPRINT',
    displayName: 'Kill Live Sprint',
    description: 'Canlı sprint zorla durdur (destructive)',
    category: 'safety-floor',
    defaultRisk: 'high',
    requiredSafetyFloor: ['KILL_LIVE_SPRINT'],
    reversible: false,
  },
  {
    id: 'MANUAL_FILE_DELETE',
    displayName: 'Manual File Delete',
    description: '.tasks/ veya src/ dosyası manuel sil',
    category: 'safety-floor',
    defaultRisk: 'high',
    requiredSafetyFloor: ['MANUAL_FILE_DELETE'],
    reversible: false,
  },
  {
    id: 'COST_OVER_THRESHOLD',
    displayName: 'Cost Over Threshold',
    description: 'Yapılandırılan maliyet eşiğini aşan işlem başlat',
    category: 'safety-floor',
    defaultRisk: 'high',
    requiredSafetyFloor: ['COST_OVER_THRESHOLD'],
    reversible: false,
  },
  {
    id: 'DESTRUCTIVE_GIT',
    displayName: 'Destructive Git',
    description: 'git reset --hard, force push, branch delete',
    category: 'safety-floor',
    defaultRisk: 'high',
    requiredSafetyFloor: ['DESTRUCTIVE_GIT'],
    reversible: false,
  },
  {
    id: 'ADR_DEPRECATE_ACCEPTED',
    displayName: 'ADR Deprecate Accepted',
    description: 'Accepted ADR deprecate et',
    category: 'safety-floor',
    defaultRisk: 'high',
    requiredSafetyFloor: ['ADR_DEPRECATE_ACCEPTED'],
    reversible: false,
  },
];

// ─── Lookup Map ──────────────────────────────────────────────────────────────

export const ACTION_BY_ID: ReadonlyMap<string, ActionDefinition> =
  new Map(ACTION_REGISTRY.map(a => [a.id, a]));

// ─── Public API ──────────────────────────────────────────────────────────────

export function getAction(id: string): ActionDefinition | undefined {
  return ACTION_BY_ID.get(id);
}

export function getActionsByCategory(
  category: ActionDefinition['category'],
): readonly ActionDefinition[] {
  return ACTION_REGISTRY.filter(a => a.category === category);
}

export function isSafetyFloorAction(id: string): boolean {
  return SAFETY_FLOOR_IDS.has(id);
}

// ─── Fenced Scheduler-Effect Action IDs ──────────────────────────────────────
// Actions whose ACCEPTED (or autonomous/timeout-auto-applied) decision must be
// turned into an identity-fenced scheduler effect — exact sprint/task/file
// identity re-validated at execution time — instead of a free-form payload
// pass-through to the action handler. See Executor.invokeAction /
// fenceSchedulerEffect (executor.ts).

const FENCED_SCHEDULER_IDS: ReadonlySet<string> = new Set<string>([
  'SCOPE_COLLISION_REORDER',
]);

export function isFencedSchedulerAction(id: string): boolean {
  return FENCED_SCHEDULER_IDS.has(id);
}
