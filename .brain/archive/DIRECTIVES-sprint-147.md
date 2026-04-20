# DIRECTIVES — Sprint 147: Pure Nervous System — Proactive Meta-Orchestrator Implementation

> **Sprint tipi:** Beta-kritik, mimari foundation (Sprint 150 GA'ya 3 gün)
> **Önceki sprint:** sprint-146 (16/17 done, 6 TD, 1 NO_GO T-146-011, gate FAILURE vitestFail 2)
> **Tema:** "Deckent hata olmadan önce görür, kullanıcıya söyler, onay alır, düzeltir"
> **Toplam task:** 22
> **Hard cap:** 6h (21600000 ms)
> **Cost cap:** $110 (soft alert, Max subscription modu)
> **Wave sayısı:** 6
> **Planning mode:** structured (AI mode provider error Sprint 145-146 lesson)

## Referanslar
- Design spec: `docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md` (583 satır, 14 section)
- Sprint 146 retro: `.brain/archive/retro-sprint-146.md` (16/17 done, avg rubric 94)
- Sprint 146 DIRECTIVES: `.brain/archive/DIRECTIVES-sprint-146.md`
- ADR-040 draft: `.brain/memory.db` status: proposed (Sprint 146 T-146-012 ile yazıldı)
- Types preflight: `src/core/nervous-types.ts` (Sprint 146 T-146-012 ile yazıldı, ~190 LoC)
- Sprint 145 NotifyDispatcher foundation: `src/notify/` (T-145-006)
- Sprint 145 EventBus: `src/orchestra/event-bus.ts` (T-145-003)

## Goal

Deckent'e Brain/Auditor/Worker üzerinde proactive meta-layer eklenir: sürekli çalışan Nervous System 22 task ile canlıya alınır. Observer (event + filesystem + cron) → DetectorRegistry (5 MVP detector) → DecisionEngine (authority matrix + safety floor) → Proposer (4 severity notification + throttle) → Dispatcher (3 adapter: MCP/CLI/File) → Executor (autonomous/suggest/approve 3 mod). 4 authority preset (strict/balanced/autopilot/full-auto) + per-action override + 5 locked safety floor. CLI `deckent nervous` + 5 MCP tool + config schema extension. ADR-040 accept edilir.

**Sprint 146 "prompt kalitesi" temasından Sprint 147 "sürekli bilinç" temasına geçiş.** Sprint 148 dogfood, Sprint 149 doc, Sprint 150 beta GA (`deckent nervous` user-facing v1.0).

## Sprint 147 Sprint 146 Debt Carry-Over

| Sprint 146 Debt | Sprint 147 Kapsanan Task | Nasıl |
|---|---|---|
| T-146-011 vitest regression (118+ fail) | T-147-019 integration tests | Yeni test yazılırken regression toplu fix |
| `string;` agent corruption (T-146-005) | T-147-012 AgentRoutingHealth detector | İlk canlı test case — agent pool'da corrupt entry detection |
| FIX phase scope reconstruction bug | T-147-013 DirectivesMidSprintProtection | Emergency restore genişletilir |
| T-146-001/003/004/005/008/010 TD (6) | T-147-007/018 executor + dispatcher | Prompt god template wire + NotifyDispatcher entegrasyonu |

## Sprint 147 Mimari Kararı — Modüler Layout

Alperen onayı: **Hepsi `src/nervous/` altında modüler.**

```
src/
├── core/
│   ├── nervous-types.ts          # Sprint 146 genişletilir (T-01)
│   └── config.ts                 # Sprint 147 extend (T-17)
├── nervous/                       # YENİ — tüm nervous system modülü
│   ├── action-registry.ts        # T-02 — 30 eylem
│   ├── authority-matrix.ts       # T-03 — 4 preset + safety floor
│   ├── observer.ts               # T-04 — event + fs + cron
│   ├── decision-engine.ts        # T-05 — detector→policy
│   ├── proposer.ts               # T-06 — notification + throttle
│   ├── executor.ts               # T-07 — 3 mod handler
│   ├── history.ts                # T-08 — .jsonl append + undo
│   ├── dispatcher.ts             # T-18 — 3 adapter routing
│   └── detectors/
│       ├── stale-worker.ts       # T-09
│       ├── scope-collision.ts    # T-10
│       ├── debt-trend.ts         # T-11
│       ├── agent-routing.ts      # T-12
│       └── directives-protection.ts # T-13
├── cli/commands/
│   ├── nervous.ts                # T-14 — deckent nervous
│   └── config-nervous.ts         # T-15 — deckent config nervous
└── mcp/tools/
    └── nervous.ts                # T-16 — 5 MCP tool

tests/
├── nervous/                       # T-19 — 40+ test
└── e2e/nervous-flow.test.ts      # T-20 — canlı sprint sim
```

---

## Task 1: Nervous Types Genişletme — Runtime Types

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/core/nervous-types.ts, tests/core/nervous-types-runtime.test.ts
- Scope: src/core/, tests/core/

### Description
Sprint 146 T-12'de placeholder types yazıldı (~190 LoC). Sprint 147 runtime logic için genişletme.

Mevcut types (KORU): `AuthorityMode`, `RiskLevel`, `ApprovalPolicy`, `Severity`, `SafetyFloorAction`, `NotificationAction`, `NervousNotification`, `AuthorityMatrix`, `NervousSystemConfig`, `DetectorResult`.

Eklenecek (YENİ):

```typescript
// ─── Observer Event ──────────────────────────────────────────────
export type ObserverEventSource = 'event-bus' | 'filesystem' | 'cron' | 'sprint-lifecycle';

export interface ObserverEvent {
  readonly id: string;                 // UUID v4
  readonly source: ObserverEventSource;
  readonly type: string;               // e.g. "WORKER_HEARTBEAT", "FILE_WRITE", "SPRINT_PHASE_CHANGE"
  readonly timestamp: string;          // ISO 8601 UTC
  readonly payload: Record<string, unknown>;
  readonly sprintId?: string;
  readonly taskId?: string;
}

// ─── Detector Context ─────────────────────────────────────────────
export interface DetectorContext {
  readonly event: ObserverEvent;
  readonly sprintState: SprintStateSnapshot;  // currentPhase, activeWorkers, debtCount
  readonly projectRoot: string;
  readonly now: Date;                         // for testability
}

export interface SprintStateSnapshot {
  readonly sprintId: string | null;
  readonly currentPhase: 'IDLE' | 'PLAN' | 'SPAWN' | 'EXECUTE' | 'EVALUATE' | 'FIX' | 'RETRO' | 'DECAY' | 'CLEANUP';
  readonly activeWorkers: ReadonlyArray<{ id: string; taskId: string; lastHeartbeat: string }>;
  readonly openDebtCount: number;
  readonly totalTasks: number;
  readonly completedTasks: number;
}

// ─── Action Definition ────────────────────────────────────────────
export interface ActionDefinition {
  readonly id: string;                // e.g. "ORPHAN_TASK_ARCHIVE"
  readonly displayName: string;
  readonly description: string;
  readonly category: 'low-risk' | 'medium-risk' | 'high-risk' | 'safety-floor';
  readonly defaultRisk: RiskLevel;
  readonly requiredSafetyFloor: SafetyFloorAction[];  // max 1, empty if not locked
  readonly reversible: boolean;       // Undo command destekler mi
}

// ─── Execution Record ─────────────────────────────────────────────
export interface ExecutionRecord {
  readonly id: string;                // UUID
  readonly notificationId: string;
  readonly actionId: string;
  readonly decision: 'accepted' | 'rejected' | 'timeout-auto-applied' | 'autonomous';
  readonly decidedBy: 'user' | 'system' | 'timeout';
  readonly executedAt: string;        // ISO 8601 UTC
  readonly outcome: 'success' | 'failure' | 'pending';
  readonly error?: string;
  readonly durationMs?: number;
  readonly reversible: boolean;
  readonly payload: Record<string, unknown>;
}

// ─── Decision Output ──────────────────────────────────────────────
export interface DecisionOutput {
  readonly action: ActionDefinition;
  readonly policy: ApprovalPolicy;    // resolved from authority matrix
  readonly risk: RiskLevel;
  readonly isSafetyFloor: boolean;
  readonly reason: string;            // insan-okunabilir (for transparency)
}
```

### Test (6 test)
1. `ObserverEvent` UUID v4 validation, ISO 8601 timestamp
2. `DetectorContext` sprintState snapshot yapısı doğru
3. `ActionDefinition` category + defaultRisk consistency (low-risk → 'low')
4. `ExecutionRecord` decision union types correct
5. `DecisionOutput` safety floor task'da autonomous VETO edilir (type-level test)
6. tsc strict mode PASS (no implicit any, readonly violations)

**Kanıt:** `npx vitest run tests/core/nervous-types-runtime.test.ts` 6/6 PASS. `tsc --noEmit` PASS.

---

## Task 2: Action Registry — 30 Eylem + Risk Matrix

- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/nervous/action-registry.ts, tests/nervous/action-registry.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
Design spec Section 4 — 30 eylem, 4 kategori. Tek ActionDefinition array, id → lookup Map, category filter.

`src/nervous/action-registry.ts` (~250 LoC):

```typescript
import type { ActionDefinition, RiskLevel } from '../core/nervous-types.js';

export const ACTION_REGISTRY: ReadonlyArray<ActionDefinition> = [
  // 🟢 Low Risk (8 actions)
  { id: 'DEAD_EVENT_STREAM_CLEANUP', displayName: 'Dead Event Stream Cleanup',
    description: 'Bozuk event stream dosyası temizleme', category: 'low-risk',
    defaultRisk: 'low', requiredSafetyFloor: [], reversible: false },
  { id: 'ORPHAN_TASK_ARCHIVE', displayName: 'Orphan Task Archive',
    description: 'Orphan .tasks/ dosyalarını arşivle', category: 'low-risk',
    defaultRisk: 'low', requiredSafetyFloor: [], reversible: true },
  { id: 'LOG_ROTATION', /* ... */ },
  { id: 'CACHE_INVALIDATE', /* ... */ },
  { id: 'STALE_LOCK_RELEASE', /* ... */ },
  { id: 'IPC_DIR_CLEANUP', /* ... */ },
  { id: 'DEBT_TRENDING_REPORT', /* ... */ },
  { id: 'METRIC_EMIT', /* ... */ },

  // 🟡 Medium Risk (11 actions)
  { id: 'DIRECTIVES_WRITE', /* ... */, reversible: true },
  { id: 'PROMPT_BUILDER_TWEAK', /* ... */ },
  { id: 'SKILL_ROUTING_ADJUST', /* ... */ },
  { id: 'DEBT_REPRIORITIZE', /* ... */ },
  { id: 'WORKER_RESPAWN', /* ... */ },
  { id: 'SCOPE_COLLISION_REORDER', /* ... */ },
  { id: 'ADR_DRAFT', /* ... */ },
  { id: 'RETRO_AUGMENT', /* ... */ },
  { id: 'AGENT_PERFORMANCE_FLAG', /* ... */ },
  { id: 'SPRINT_GATE_ADJUST', /* ... */ },
  { id: 'TASK_DEPENDENCY_REWIRE', /* ... */ },

  // 🔴 High Risk (11 actions)
  { id: 'SPRINT_START', /* ... */, requiredSafetyFloor: [] },
  { id: 'SPRINT_STOP', /* ... */ },
  { id: 'SRC_MODIFICATION', /* ... */ },
  { id: 'COMMIT_CREATE', /* ... */ },
  { id: 'COMMIT_PUSH', /* ... */ },
  { id: 'AGENT_DISABLE', /* ... */ },
  { id: 'COST_THRESHOLD_RAISE', /* ... */ },
  { id: 'ADR_ACCEPT', /* ... */ },
  { id: 'PROVIDER_SWITCH', /* ... */ },
  { id: 'CONFIG_MIGRATE', /* ... */ },
  { id: 'NPM_PUBLISH', /* ... */ },
];

export const ACTION_BY_ID: ReadonlyMap<string, ActionDefinition> =
  new Map(ACTION_REGISTRY.map(a => [a.id, a]));

export function getAction(id: string): ActionDefinition | undefined;
export function getActionsByCategory(cat: ActionDefinition['category']): readonly ActionDefinition[];
export function isSafetyFloorAction(id: string): boolean;
```

### Test (10 test)
1. `ACTION_REGISTRY.length === 30` (8+11+11)
2. Her category count: low=8, medium=11, high=11
3. `ACTION_BY_ID.get('ORPHAN_TASK_ARCHIVE')` returns definition
4. Safety floor IDs (KILL_LIVE_SPRINT, MANUAL_FILE_DELETE, COST_OVER_THRESHOLD, DESTRUCTIVE_GIT, ADR_DEPRECATE_ACCEPTED) safety-floor category
5. Tüm `defaultRisk` değerleri `category` ile consistent
6. `getAction('UNKNOWN')` returns undefined
7. `getActionsByCategory('medium-risk').length === 11`
8. `isSafetyFloorAction('KILL_LIVE_SPRINT') === true`
9. `isSafetyFloorAction('ORPHAN_TASK_ARCHIVE') === false`
10. No duplicate IDs (Set size check)

**Kanıt:** `npx vitest run tests/nervous/action-registry.test.ts` 10/10 PASS. tsc PASS.

---

## Task 3: Authority Matrix — 4 Preset + Safety Floor + Override

- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/nervous/authority-matrix.ts, tests/nervous/authority-matrix.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
Design spec Section 3. 4 preset: strict/balanced/autopilot/full-auto. Her preset risk → policy mapping'i içerir, safety floor override edilemez.

`src/nervous/authority-matrix.ts` (~300 LoC):

```typescript
import type { AuthorityMatrix, AuthorityMode, RiskLevel, ApprovalPolicy, SafetyFloorAction } from '../core/nervous-types.js';
import { ACTION_BY_ID } from './action-registry.js';

export const SAFETY_FLOOR: ReadonlyArray<SafetyFloorAction> = [
  'KILL_LIVE_SPRINT',
  'MANUAL_FILE_DELETE',
  'COST_OVER_THRESHOLD',
  'DESTRUCTIVE_GIT',
  'ADR_DEPRECATE_ACCEPTED',
];

export const STRICT_MATRIX: AuthorityMatrix = {
  mode: 'strict',
  riskPolicyMap: { low: 'suggest-30m', medium: 'approve', high: 'approve' },
  actionOverrides: {},
  safetyFloor: SAFETY_FLOOR,
};

export const BALANCED_MATRIX: AuthorityMatrix = {
  mode: 'balanced',
  riskPolicyMap: { low: 'autonomous', medium: 'suggest-30m', high: 'approve' },
  actionOverrides: {},
  safetyFloor: SAFETY_FLOOR,
};

export const AUTOPILOT_MATRIX: AuthorityMatrix = {
  mode: 'autopilot',
  riskPolicyMap: { low: 'autonomous', medium: 'autonomous', high: 'suggest-5m' },
  actionOverrides: {},
  safetyFloor: SAFETY_FLOOR,
};

export const FULL_AUTO_MATRIX: AuthorityMatrix = {
  mode: 'full-auto',
  riskPolicyMap: { low: 'autonomous', medium: 'autonomous', high: 'autonomous' },
  actionOverrides: {},
  safetyFloor: SAFETY_FLOOR,
};

export const MATRIX_BY_MODE: ReadonlyMap<AuthorityMode, AuthorityMatrix> =
  new Map([['strict', STRICT_MATRIX], ['balanced', BALANCED_MATRIX],
           ['autopilot', AUTOPILOT_MATRIX], ['full-auto', FULL_AUTO_MATRIX]]);

/** Resolve final policy from matrix + overrides + safety floor check */
export function resolvePolicy(
  matrix: AuthorityMatrix,
  actionId: string,
  userOverrides?: Readonly<Record<string, ApprovalPolicy>>
): { policy: ApprovalPolicy; isSafetyFloor: boolean; reason: string } {
  const action = ACTION_BY_ID.get(actionId);
  if (!action) throw new Error(`Unknown action: ${actionId}`);

  // 1. Safety floor check — locked even in full-auto
  const isSafetyFloor = action.requiredSafetyFloor.length > 0 ||
                        (SAFETY_FLOOR as readonly string[]).includes(actionId);
  if (isSafetyFloor) {
    return { policy: 'approve', isSafetyFloor: true,
             reason: `Safety floor: ${actionId} requires explicit user approval` };
  }

  // 2. User override (if any)
  const userOverride = userOverrides?.[actionId];
  if (userOverride) {
    return { policy: userOverride, isSafetyFloor: false,
             reason: `User override for ${actionId}: ${userOverride}` };
  }

  // 3. Matrix action override
  const matrixOverride = matrix.actionOverrides[actionId];
  if (matrixOverride) {
    return { policy: matrixOverride, isSafetyFloor: false,
             reason: `Matrix override: ${matrixOverride}` };
  }

  // 4. Default risk→policy mapping
  return { policy: matrix.riskPolicyMap[action.defaultRisk], isSafetyFloor: false,
           reason: `Risk-based default (${action.defaultRisk}): ${matrix.riskPolicyMap[action.defaultRisk]}` };
}
```

### Test (12 test)
1. STRICT: low-risk action → 'suggest-30m'
2. BALANCED: low → 'autonomous', medium → 'suggest-30m', high → 'approve'
3. AUTOPILOT: high-risk → 'suggest-5m' (not approve)
4. FULL_AUTO: normal high-risk → 'autonomous'
5. FULL_AUTO: KILL_LIVE_SPRINT → 'approve' (safety floor VETO)
6. User override `{ COMMIT_PUSH: 'approve' }` + AUTOPILOT → 'approve'
7. Safety floor override edilemez (user override KILL_LIVE_SPRINT='autonomous' → yine 'approve')
8. `resolvePolicy(balanced, 'UNKNOWN')` throws
9. Reason string her 4 yoldan (safety/user/matrix/default) farklı format
10. All 4 matrices have identical SAFETY_FLOOR reference
11. `MATRIX_BY_MODE.size === 4`
12. Frozen immutability: `STRICT_MATRIX.riskPolicyMap.low = 'autonomous'` throws (readonly)

**Kanıt:** `npx vitest run tests/nervous/authority-matrix.test.ts` 12/12 PASS. tsc PASS. Safety floor test 5+7 **kritik**.

---

## Task 4: Observer — Event Bus + Filesystem Watcher + Cron

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Files: src/nervous/observer.ts, tests/nervous/observer.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
Nervous System'in girişi: 4 event source (event-bus, filesystem, cron, sprint-lifecycle). Sprint 145 T-003 EventBus + T-145-005 CHANNELS foundation üzerine kurulur.

`src/nervous/observer.ts` (~400 LoC):

```typescript
import { EventEmitter } from 'node:events';
import { watch, FSWatcher } from 'node:fs';
import { eventBus } from '../orchestra/event-bus.js';
import type { ObserverEvent, ObserverEventSource } from '../core/nervous-types.js';
import { randomUUID } from 'node:crypto';

export class NervousObserver extends EventEmitter {
  private readonly fsWatchers: Map<string, FSWatcher> = new Map();
  private cronTimer: NodeJS.Timeout | null = null;
  private isStarted = false;

  constructor(
    private readonly projectRoot: string,
    private readonly cronIntervalMs = 15000,  // 15s tick
  ) { super(); }

  start(): void {
    if (this.isStarted) return;
    this.subscribeEventBus();
    this.startFilesystemWatchers();
    this.startCronTick();
    this.isStarted = true;
  }

  stop(): void {
    if (!this.isStarted) return;
    eventBus.off('deckent-event', this.onEventBusMessage);
    for (const w of this.fsWatchers.values()) w.close();
    this.fsWatchers.clear();
    if (this.cronTimer) { clearInterval(this.cronTimer); this.cronTimer = null; }
    this.isStarted = false;
  }

  private subscribeEventBus = (): void => {
    eventBus.on('deckent-event', this.onEventBusMessage);
  };

  private onEventBusMessage = (payload: Record<string, unknown>): void => {
    const event = this.buildEvent('event-bus', String(payload.type ?? 'UNKNOWN'), payload);
    this.emit('observe', event);
  };

  private startFilesystemWatchers(): void {
    // Sprint 145+146 dizinleri: .tasks/, .brain/, DIRECTIVES.md
    const targets = ['.tasks', '.brain', 'DIRECTIVES.md', '.deckent'];
    for (const t of targets) {
      try {
        const w = watch(`${this.projectRoot}/${t}`, { recursive: true }, (eventType, filename) => {
          const event = this.buildEvent('filesystem', 'FILE_CHANGE',
            { eventType, filename, path: `${t}/${filename ?? ''}` });
          this.emit('observe', event);
        });
        this.fsWatchers.set(t, w);
      } catch (e) { /* path may not exist */ }
    }
  }

  private startCronTick(): void {
    this.cronTimer = setInterval(() => {
      const event = this.buildEvent('cron', 'TICK', { intervalMs: this.cronIntervalMs });
      this.emit('observe', event);
    }, this.cronIntervalMs);
  }

  private buildEvent(source: ObserverEventSource, type: string, payload: Record<string, unknown>): ObserverEvent {
    return {
      id: randomUUID(),
      source,
      type,
      timestamp: new Date().toISOString(),
      payload,
      sprintId: typeof payload.sprintId === 'string' ? payload.sprintId : undefined,
      taskId: typeof payload.taskId === 'string' ? payload.taskId : undefined,
    };
  }
}
```

### Test (10 test)
1. `start()` → `isStarted=true`, 2nd call no-op
2. `stop()` → watchers cleared, timer null
3. EventBus emit → observer emits 'observe' with source='event-bus'
4. Filesystem change (write to `.tasks/test.json`) → emits 'observe' source='filesystem'
5. Cron tick (50ms interval) → emits 'observe' source='cron' within 100ms
6. 3 sources all emit valid ObserverEvent (UUID, ISO timestamp)
7. sprintId/taskId payload'tan extract edilir
8. Multiple start() calls idempotent
9. FS watcher hata (missing dir) → continue (other watchers active)
10. `stop()` sonrası event bus subscription off (emit → no callback)

**Kanıt:** `npx vitest run tests/nervous/observer.test.ts` 10/10 PASS. tsc PASS.

---

## Task 5: Decision Engine — Detector → Policy → Decision

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Files: src/nervous/decision-engine.ts, tests/nervous/decision-engine.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
Observer + DetectorResult → AuthorityMatrix lookup → DecisionOutput. Decision Engine merkezi politika karar noktası.

`src/nervous/decision-engine.ts` (~350 LoC):

```typescript
import type { DecisionOutput, DetectorResult, NervousSystemConfig } from '../core/nervous-types.js';
import { MATRIX_BY_MODE, resolvePolicy } from './authority-matrix.js';
import { ACTION_BY_ID } from './action-registry.js';

export class DecisionEngine {
  constructor(private readonly config: NervousSystemConfig) {}

  /** Ana karar fonksiyonu — her detector sonucu için çağrılır */
  decide(detectorResult: DetectorResult): DecisionOutput[] {
    const matrix = MATRIX_BY_MODE.get(this.config.mode);
    if (!matrix) throw new Error(`Invalid authority mode: ${this.config.mode}`);

    const outputs: DecisionOutput[] = [];

    for (const suggested of detectorResult.suggestedActions) {
      const action = ACTION_BY_ID.get(suggested.id);
      if (!action) continue;  // log and skip

      const resolution = resolvePolicy(matrix, suggested.id, this.config.actionOverrides);
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

  /** Quiet hours check — critical severity bypass eder */
  shouldDelay(severity: Severity, now: Date = new Date()): boolean {
    if (!this.config.quietHours) return false;
    if (severity === 'critical' || severity === 'emergency') return false;
    return isInQuietHours(now, this.config.quietHours);
  }
}

// Helper: "22:00" / "08:00" format, TRT timezone
export function isInQuietHours(now: Date, quiet: { start: string; end: string }): boolean;
```

### Test (10 test)
1. Balanced mode + low risk action → policy='autonomous'
2. Strict mode + medium risk → 'approve'
3. Full-auto + safety floor → 'approve' (VETO)
4. User override application (config.actionOverrides)
5. Multiple suggestedActions → multiple DecisionOutputs
6. Unknown action ID → skipped (not thrown)
7. Invalid authorityMode → throws
8. Quiet hours 23:00 (config 22:00-08:00) → shouldDelay true for info
9. Quiet hours 23:00 + critical severity → shouldDelay false (bypass)
10. DecisionOutput.reason contains human-readable context

**Kanıt:** `npx vitest run tests/nervous/decision-engine.test.ts` 10/10 PASS. tsc PASS.

---

## Task 6: Proposer — Notification Builder + Throttle + Grouping

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/nervous/proposer.ts, tests/nervous/proposer.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
DetectorResult + DecisionOutput → NervousNotification. Throttle (aynı groupKey 5dk), severity filter (severity_min config), cross-channel dedup preparation.

`src/nervous/proposer.ts` (~250 LoC):

```typescript
import type { NervousNotification, NotificationAction, DetectorResult, DecisionOutput, Severity, NervousSystemConfig } from '../core/nervous-types.js';
import { randomUUID } from 'node:crypto';

export class Proposer {
  private readonly recentGroups: Map<string, number> = new Map();  // groupKey → lastEmittedMs
  constructor(private readonly config: NervousSystemConfig) {}

  propose(
    detectorResult: DetectorResult,
    decisions: DecisionOutput[],
    context: { detectorId: string; sprintId?: string; taskId?: string; title: string; message: string; now?: Date },
  ): NervousNotification | null {
    if (!detectorResult.shouldNotify) return null;

    const severity = detectorResult.severity ?? 'info';
    if (!this.passesSeverityFilter(severity)) return null;

    const groupKey = detectorResult.groupKey;
    if (groupKey && this.isThrottled(groupKey, context.now)) return null;

    const actions: NotificationAction[] = decisions.map(d => ({
      id: d.action.id,
      label: d.action.displayName,
      policy: d.policy,
      risk: d.risk,
      isSafetyFloor: d.isSafetyFloor,
      payload: detectorResult.suggestedActions.find(s => s.id === d.action.id)?.payload,
    }));

    const notification: NervousNotification = {
      id: randomUUID(),
      type: detectorResult.metadata?.type as string ?? 'generic',
      title: context.title,
      message: context.message,
      severity,
      createdAt: (context.now ?? new Date()).toISOString(),
      detectorId: context.detectorId,
      actions,
      timeoutMs: computeTimeoutMs(decisions),  // smallest suggest-*m or null
      sprintId: context.sprintId,
      taskId: context.taskId,
      groupKey,
    };

    if (groupKey) this.recentGroups.set(groupKey, (context.now ?? new Date()).getTime());
    return notification;
  }

  private isThrottled(groupKey: string, now?: Date): boolean {
    const lastMs = this.recentGroups.get(groupKey);
    if (!lastMs) return false;
    const throttleWindow = this.config.throttleWindowMs ?? 300000;  // 5dk default
    return (now ?? new Date()).getTime() - lastMs < throttleWindow;
  }

  private passesSeverityFilter(severity: Severity): boolean {
    const severityRank = { info: 0, warning: 1, critical: 2, emergency: 3 };
    const minRank = severityRank[this.config.severityMin ?? 'info'];
    return severityRank[severity] >= minRank;
  }
}

function computeTimeoutMs(decisions: DecisionOutput[]): number | null;  // suggest-5m → 300000, suggest-30m → 1800000
```

### Test (8 test)
1. `shouldNotify=false` → returns null
2. Severity filter: severityMin='warning' + info → null
3. Groupkey throttle: 2nd propose within 5dk → null, after 5dk → notification
4. Critical severity bypasses filter + throttle
5. Multiple decisions → multiple actions in notification
6. timeoutMs: smallest of suggest-5m (300000) and suggest-30m (1800000) → 300000
7. approve-only policy → timeoutMs null
8. payload propagation (detectorResult.suggestedActions.payload → notification.actions.payload)

**Kanıt:** `npx vitest run tests/nervous/proposer.test.ts` 8/8 PASS.

---

## Task 7: Executor — 3 Mod Handler (Autonomous / Suggest / Approve)

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Files: src/nervous/executor.ts, tests/nervous/executor.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
Notification onaylandıktan sonra eylemi fiilen yürütür. 3 mod: autonomous (hemen), suggest-timeout (timer + auto-apply), approve (user decision bekler). History append.

`src/nervous/executor.ts` (~400 LoC):

```typescript
import type { NervousNotification, ExecutionRecord, ApprovalPolicy } from '../core/nervous-types.js';
import type { NervousHistory } from './history.js';
import { randomUUID } from 'node:crypto';

export interface ActionHandler {
  (actionId: string, payload: Record<string, unknown>): Promise<{ outcome: 'success' | 'failure'; error?: string }>;
}

export class Executor {
  private readonly pendingTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly pendingApprovals: Map<string, {
    notification: NervousNotification;
    resolve: (decision: 'accepted' | 'rejected') => void;
  }> = new Map();

  constructor(
    private readonly history: NervousHistory,
    private readonly actionHandler: ActionHandler,
  ) {}

  async handle(notification: NervousNotification): Promise<ExecutionRecord[]> {
    const records: ExecutionRecord[] = [];
    for (const action of notification.actions) {
      const record = await this.handleAction(notification, action);
      records.push(record);
      await this.history.append(record);
    }
    return records;
  }

  private async handleAction(notification: NervousNotification, action: NotificationAction): Promise<ExecutionRecord> {
    const base = {
      id: randomUUID(),
      notificationId: notification.id,
      actionId: action.id,
      executedAt: new Date().toISOString(),
      reversible: /* lookup action-registry */,
      payload: action.payload ?? {},
    };

    if (action.policy === 'autonomous') {
      const r = await this.actionHandler(action.id, action.payload ?? {});
      return { ...base, decision: 'autonomous', decidedBy: 'system', outcome: r.outcome, error: r.error };
    }

    if (action.policy === 'suggest-5m' || action.policy === 'suggest-30m') {
      return this.handleSuggestTimeout(notification, action, base);
    }

    if (action.policy === 'approve') {
      return this.handleApprove(notification, action, base);
    }

    throw new Error(`Unknown policy: ${action.policy}`);
  }

  /** User-driven: deckent nervous accept <id> / reject <id> calls this */
  resolveApproval(notificationId: string, decision: 'accepted' | 'rejected'): void {
    const pending = this.pendingApprovals.get(notificationId);
    if (pending) { pending.resolve(decision); this.pendingApprovals.delete(notificationId); }
  }

  shutdown(): void {
    for (const t of this.pendingTimers.values()) clearTimeout(t);
    this.pendingTimers.clear();
    for (const p of this.pendingApprovals.values()) p.resolve('rejected');
    this.pendingApprovals.clear();
  }
}
```

### Test (12 test)
1. Autonomous policy → immediate handler call + outcome='success' record
2. Autonomous handler throw → outcome='failure', error captured
3. suggest-5m → timer 300s, user accept mid-way → 'accepted' decision
4. suggest-30m + no action → timeout → 'timeout-auto-applied'
5. suggest-5m + reject mid-way → 'rejected' decision
6. approve → awaits indefinitely until resolveApproval
7. approve + rejected → record decidedBy='user', outcome no handler call
8. Multiple actions in single notification → multiple records
9. shutdown() clears all timers, pending approvals resolve 'rejected'
10. History.append called for every record
11. Reversibility flag propagated from ActionDefinition
12. Payload propagation handler → payload doğru

**Kanıt:** `npx vitest run tests/nervous/executor.test.ts` 12/12 PASS. Fake timers kullan (vitest vi.useFakeTimers).

---

## Task 8: History — JSONL Append + Undo + Retention

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/nervous/history.ts, tests/nervous/history.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
`.deckent/nervous-history.jsonl` audit trail. Append-only, N+1 line per record, undo support (reversible actions için son N record geri alınabilir).

`src/nervous/history.ts` (~250 LoC):

```typescript
import type { ExecutionRecord, ActionDefinition } from '../core/nervous-types.js';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export class NervousHistory {
  private readonly filePath: string;

  constructor(projectRoot: string) {
    this.filePath = join(projectRoot, '.deckent', 'nervous-history.jsonl');
  }

  /** Atomic append — each record is one JSONL line */
  async append(record: ExecutionRecord): Promise<void> {
    const line = JSON.stringify(record) + '\n';
    await appendFile(this.filePath, line, 'utf-8');
  }

  async readAll(): Promise<ExecutionRecord[]> {
    if (!existsSync(this.filePath)) return [];
    const content = await readFile(this.filePath, 'utf-8');
    return content.split('\n').filter(Boolean).map(line => JSON.parse(line) as ExecutionRecord);
  }

  async findById(id: string): Promise<ExecutionRecord | null> {
    const all = await this.readAll();
    return all.find(r => r.id === id) ?? null;
  }

  async findRecentReversible(limit = 10): Promise<ExecutionRecord[]> {
    const all = await this.readAll();
    return all.filter(r => r.reversible && r.outcome === 'success').slice(-limit).reverse();
  }

  /** Mark as undone — append compensation record (does NOT delete) */
  async markUndone(originalId: string, compensationDetail: Record<string, unknown>): Promise<void>;

  /** Retention: drop records older than N days */
  async prune(retentionDays: number = 30): Promise<number>;  // returns pruned count
}
```

### Test (8 test)
1. Append single record → file contains 1 JSONL line
2. Append 3 records → readAll returns all 3 in order
3. findById existing → returns record
4. findById nonexistent → null
5. findRecentReversible → only reversible+success, limit 10, newest first
6. markUndone → appends new record with `originalId` ref (no delete)
7. prune(retentionDays=7) → drops records older than 7 days, returns count
8. Concurrent append (2 parallel) → both present (atomic append)

**Kanıt:** `npx vitest run tests/nervous/history.test.ts` 8/8 PASS. Temp dir for isolation.

---

## Task 9: StaleWorkerDetector

- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/nervous/detectors/stale-worker.ts, tests/nervous/detectors/stale-worker.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
Sprint 145 T-011 ile yakalanan Docker worker exit pattern'i + genel HB staleness. 3dk+ update yok → WORKER_RESPAWN suggest (medium risk).

`src/nervous/detectors/stale-worker.ts` (~150 LoC):

```typescript
import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_STALE_MS = 180000;  // 3dk

export class StaleWorkerDetector {
  constructor(private readonly staleThresholdMs = DEFAULT_STALE_MS) {}

  readonly detectorId = 'stale-worker';

  detect(ctx: DetectorContext): DetectorResult | null {
    // Only trigger on cron or fs event, not event-bus
    if (ctx.event.source !== 'cron' && ctx.event.source !== 'filesystem') return null;
    if (ctx.sprintState.currentPhase === 'IDLE' || ctx.sprintState.currentPhase === 'CLEANUP') return null;

    const staleWorkers = ctx.sprintState.activeWorkers.filter(w => {
      const lastHbMs = new Date(w.lastHeartbeat).getTime();
      return ctx.now.getTime() - lastHbMs > this.staleThresholdMs;
    });

    if (staleWorkers.length === 0) return null;

    return {
      risk: 'medium',
      shouldNotify: true,
      severity: 'warning',
      groupKey: `stale-worker:${staleWorkers.map(w => w.id).join(',')}`,
      suggestedActions: staleWorkers.map(w => ({
        id: 'WORKER_RESPAWN',
        label: `Re-spawn ${w.id} (task ${w.taskId})`,
        risk: 'medium' as const,
        payload: { workerId: w.id, taskId: w.taskId, lastHeartbeat: w.lastHeartbeat },
      })),
      metadata: { type: 'stale-worker', count: staleWorkers.length },
    };
  }
}
```

### Test (6 test)
1. No active workers → returns null
2. All workers fresh HB → returns null
3. 1 stale worker → DetectorResult with 1 action
4. 2 stale workers → 2 actions, groupKey includes both IDs
5. event-bus event → returns null (only cron/fs trigger)
6. IDLE/CLEANUP phase → returns null

**Kanıt:** `npx vitest run tests/nervous/detectors/stale-worker.test.ts` 6/6 PASS.

---

## Task 10: ScopeCollisionMonitor

- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/nervous/detectors/scope-collision.ts, tests/nervous/detectors/scope-collision.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
2 task plan-time veya runtime aynı dosyaya yazacaksa → SCOPE_COLLISION_REORDER. Sprint 138 T-004 detectScopeCollisions + file-lock collision üzerine kurulur.

`src/nervous/detectors/scope-collision.ts` (~180 LoC):

```typescript
import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export class ScopeCollisionMonitor {
  readonly detectorId = 'scope-collision';

  detect(ctx: DetectorContext): DetectorResult | null {
    if (ctx.sprintState.currentPhase !== 'PLAN' && ctx.sprintState.currentPhase !== 'EXECUTE') return null;

    const tasksDir = join(ctx.projectRoot, '.tasks');
    if (!existsSync(tasksDir)) return null;

    const tasks = readdirSync(tasksDir)
      .filter(f => f.startsWith('task-') && f.endsWith('.json'))
      .map(f => JSON.parse(readFileSync(join(tasksDir, f), 'utf-8')));

    // Plan-time: check overlapping filesWrite
    const writeMap = new Map<string, string[]>();  // file → taskIds
    for (const t of tasks) {
      if (t.status !== 'PENDING' && t.status !== 'CLAIMED' && t.status !== 'EXECUTING') continue;
      for (const f of t.scope?.filesWrite ?? []) {
        const normalized = f.replace(/\/+/g, '/').toLowerCase();
        writeMap.set(normalized, [...(writeMap.get(normalized) ?? []), t.id]);
      }
    }

    const collisions = [...writeMap.entries()].filter(([, ids]) => ids.length > 1);
    if (collisions.length === 0) return null;

    return {
      risk: 'medium',
      shouldNotify: true,
      severity: 'warning',
      groupKey: `scope-collision:${collisions.map(([f]) => f).join(',')}`,
      suggestedActions: [{
        id: 'SCOPE_COLLISION_REORDER',
        label: `Reorder ${collisions.length} colliding task(s)`,
        risk: 'medium' as const,
        payload: { collisions: collisions.map(([file, taskIds]) => ({ file, taskIds })) },
      }],
      metadata: { type: 'scope-collision', collisions: collisions.length },
    };
  }
}
```

### Test (5 test)
1. No tasks → null
2. 1 task 1 file → null (no collision)
3. 2 tasks same file → DetectorResult with collision payload
4. 3 tasks overlapping (A+B same file, A+C another file) → 2 collisions
5. RETRO/CLEANUP phase → null (only PLAN/EXECUTE)

**Kanıt:** `npx vitest run tests/nervous/detectors/scope-collision.test.ts` 5/5 PASS.

---

## Task 11: DebtTrendAnalyzer

- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/nervous/detectors/debt-trend.ts, tests/nervous/detectors/debt-trend.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
Son 3 sprint ortalaması > %15 debt rate → DEBT_REPRIORITIZE suggest. MemoryStore.getByType('memory') ile son sprint learnings + .brain/memory.db debt count.

`src/nervous/detectors/debt-trend.ts` (~200 LoC):

```typescript
import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';
import { MemoryStore } from '../../core/memory-store.js';

export class DebtTrendAnalyzer {
  readonly detectorId = 'debt-trend';

  constructor(private readonly thresholdRate = 0.15, private readonly windowSize = 3) {}

  detect(ctx: DetectorContext): DetectorResult | null {
    // Only triggers on sprint-lifecycle RETRO phase
    if (ctx.event.source !== 'sprint-lifecycle' || ctx.event.type !== 'SPRINT_RETRO_COMPLETE') return null;

    const store = new MemoryStore(ctx.projectRoot);
    const recentSprints = store.search({ type: ['memory'], sprint_range: { min: parseInt(ctx.sprintState.sprintId?.replace('sprint-', '') ?? '0') - this.windowSize }, limit: this.windowSize });

    if (recentSprints.length < this.windowSize) return null;  // not enough data

    const avgDebtRate = recentSprints.reduce((sum, s) => {
      const totals = (s.metadata?.totalTasks as number) ?? 1;
      const debt = (s.metadata?.debtCount as number) ?? 0;
      return sum + (debt / totals);
    }, 0) / this.windowSize;

    if (avgDebtRate < this.thresholdRate) return null;

    return {
      risk: 'medium',
      shouldNotify: true,
      severity: 'warning',
      groupKey: `debt-trend:${ctx.sprintState.sprintId}`,
      suggestedActions: [{
        id: 'DEBT_REPRIORITIZE',
        label: `Debt trending up (${(avgDebtRate * 100).toFixed(1)}%), re-prioritize next sprint`,
        risk: 'medium' as const,
        payload: { avgDebtRate, windowSize: this.windowSize, sprints: recentSprints.map(s => s.sprint_id) },
      }],
      metadata: { type: 'debt-trend', avgDebtRate, threshold: this.thresholdRate },
    };
  }
}
```

### Test (5 test)
1. Not SPRINT_RETRO_COMPLETE event → null
2. < windowSize sprints → null (not enough data)
3. avg < threshold → null
4. avg >= threshold → DetectorResult with DEBT_REPRIORITIZE
5. payload.sprints contains recent sprint IDs

**Kanıt:** `npx vitest run tests/nervous/detectors/debt-trend.test.ts` 5/5 PASS.

---

## Task 12: AgentRoutingHealth — `string;` Corruption + %40 Anomaly

- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/nervous/detectors/agent-routing.ts, tests/nervous/detectors/agent-routing.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
**İlk canlı test case (Alperen onaylı):** Sprint 146 T-146-005'te agent `string;` corrupted değer aldı — sprint-146.md tablosunda "Agent: string;" satırı gerçek kanıt. Bu detector'ın ilk görevi: agent pool'daki corrupt entry + runtime %40+ anomaly tespiti.

`src/nervous/detectors/agent-routing.ts` (~250 LoC):

```typescript
import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const AGENT_ID_REGEX = /^[a-z][a-z0-9-]*[a-z0-9]$/;  // valid agent IDs only
const ANOMALY_THRESHOLD_RATE = 0.40;

export class AgentRoutingHealth {
  readonly detectorId = 'agent-routing';

  constructor(private readonly anomalyThreshold = ANOMALY_THRESHOLD_RATE) {}

  detect(ctx: DetectorContext): DetectorResult | null {
    if (ctx.event.source !== 'sprint-lifecycle') return null;
    if (ctx.event.type !== 'SPRINT_PHASE_CHANGE' || ctx.event.payload.newPhase !== 'EVALUATE') return null;

    const tasksDir = join(ctx.projectRoot, '.tasks');
    if (!existsSync(tasksDir)) return null;

    const tasks = readdirSync(tasksDir)
      .filter(f => f.startsWith('task-') && f.endsWith('.json'))
      .map(f => JSON.parse(readFileSync(join(tasksDir, f), 'utf-8')));

    const issues: Array<{ type: 'corrupt-agent' | 'anomaly'; detail: string; taskIds: string[] }> = [];

    // 1. Corrupt agent detection (Sprint 146 string; lesson)
    for (const t of tasks) {
      if (t.assignedAgent && !AGENT_ID_REGEX.test(t.assignedAgent)) {
        issues.push({ type: 'corrupt-agent', detail: `Invalid agent ID "${t.assignedAgent}" on task ${t.id}`, taskIds: [t.id] });
      }
    }

    // 2. %40 anomaly detection
    const agentCounts = new Map<string, string[]>();
    for (const t of tasks) {
      if (t.assignedAgent && AGENT_ID_REGEX.test(t.assignedAgent)) {
        agentCounts.set(t.assignedAgent, [...(agentCounts.get(t.assignedAgent) ?? []), t.id]);
      }
    }
    const total = tasks.length;
    for (const [agent, taskIds] of agentCounts) {
      if (taskIds.length / total >= this.anomalyThreshold) {
        issues.push({ type: 'anomaly', detail: `${agent} assigned to ${taskIds.length}/${total} tasks (${((taskIds.length / total) * 100).toFixed(1)}%)`, taskIds });
      }
    }

    if (issues.length === 0) return null;

    return {
      risk: 'medium',
      shouldNotify: true,
      severity: issues.some(i => i.type === 'corrupt-agent') ? 'critical' : 'warning',
      groupKey: `agent-routing:${ctx.sprintState.sprintId}`,
      suggestedActions: issues.map(i => ({
        id: i.type === 'corrupt-agent' ? 'AGENT_PERFORMANCE_FLAG' : 'SKILL_ROUTING_ADJUST',
        label: i.detail,
        risk: 'medium' as const,
        payload: i,
      })),
      metadata: { type: 'agent-routing', issueCount: issues.length },
    };
  }
}
```

### Test (8 test)
1. No tasks → null
2. Valid agents only (no anomaly) → null
3. 1 task agent='string;' → corrupt-agent issue, severity='critical' (İlk canlı test case)
4. 1 task agent='a' (too short) → corrupt-agent
5. 14/17 tasks test-writer (%82) → anomaly issue (Sprint 145 replay)
6. Sprint 146 replay: 9/17 test-writer + 1 string; → 2 issues (1 critical + 1 warning)
7. EVALUATE phase değil → null
8. Corrupt + anomaly mix → severity='critical' (worst case)

**Kanıt:** `npx vitest run tests/nervous/detectors/agent-routing.test.ts` 8/8 PASS. Test #3 **Sprint 146 canlı bug'ın detector tarafından yakalanması**.

---

## Task 13: DirectivesMidSprintProtection

- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/nervous/detectors/directives-protection.ts, tests/nervous/detectors/directives-protection.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
Sprint 145 08:14 TRT canlı bug: DIRECTIVES.md EXECUTE phase'de template'e dönüştü. Sprint 146 T-146-008 phase guard ekledi (archiveDirectives reject). Sprint 147 bu detector **pro-active izlem + otomatik restore** ekler.

`src/nervous/detectors/directives-protection.ts` (~300 LoC):

```typescript
import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export class DirectivesMidSprintProtection {
  readonly detectorId = 'directives-protection';

  detect(ctx: DetectorContext): DetectorResult | null {
    if (ctx.event.source !== 'filesystem') return null;
    if (!ctx.event.payload.path?.toString().endsWith('DIRECTIVES.md')) return null;

    // Protection only active during EXECUTE/FIX phases
    const protectedPhases = ['EXECUTE', 'FIX'];
    if (!protectedPhases.includes(ctx.sprintState.currentPhase)) return null;

    const directivesPath = join(ctx.projectRoot, 'DIRECTIVES.md');
    if (!existsSync(directivesPath)) {
      return this.buildCriticalAlert(ctx, 'DIRECTIVES.md DELETED mid-sprint');
    }

    const content = readFileSync(directivesPath, 'utf-8');
    const size = statSync(directivesPath).size;

    // Sprint 144/145 pattern: 463 byte = template
    const TEMPLATE_SIZE_THRESHOLD = 2000;
    const suspiciousPatterns = [
      /^# DIRECTIVES — \(Sprint \d+ için hazırlanıyor\)/,  // Template pattern
      /\(Task başlığı\)/,                                   // Placeholder pattern
    ];

    const isTemplate = size < TEMPLATE_SIZE_THRESHOLD ||
                       suspiciousPatterns.some(p => p.test(content));

    if (!isTemplate) return null;

    return this.buildCriticalAlert(ctx, `DIRECTIVES.md reverted to template mid-sprint (size=${size})`);
  }

  private buildCriticalAlert(ctx: DetectorContext, reason: string): DetectorResult {
    return {
      risk: 'high',
      shouldNotify: true,
      severity: 'emergency',
      groupKey: `directives-protection:${ctx.sprintState.sprintId}`,
      suggestedActions: [{
        id: 'DIRECTIVES_WRITE',
        label: `🚨 EMERGENCY: Restore DIRECTIVES.md from task JSON files`,
        risk: 'high' as const,
        payload: { reason, sprintId: ctx.sprintState.sprintId, phase: ctx.sprintState.currentPhase, autoRestore: true },
      }],
      metadata: { type: 'directives-protection', reason },
    };
  }
}
```

### Test (8 test)
1. PLAN phase + DIRECTIVES change → null (not protected phase)
2. EXECUTE phase + normal DIRECTIVES (full content) → null
3. EXECUTE phase + DIRECTIVES 463 byte → emergency alert
4. EXECUTE phase + template pattern match → emergency alert
5. EXECUTE phase + DIRECTIVES deleted → emergency alert
6. FIX phase + template → emergency alert (FIX also protected)
7. RETRO phase + template → null (not protected, expected transition)
8. suggestedActions[0].payload.autoRestore === true (nervous system balanced mode → autonomous)

**Kanıt:** `npx vitest run tests/nervous/detectors/directives-protection.test.ts` 8/8 PASS. Test #3 **Sprint 145 08:14 TRT senaryo replay**.

---

## Task 14: CLI Dashboard — `deckent nervous`

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Files: src/cli/commands/nervous.ts, src/cli/entry.ts, tests/cli/nervous-command.test.ts
- Scope: src/cli/, tests/cli/

### Description
`deckent nervous` ana komut + subcommands. Sprint 145 T-145-018 UI Polish pattern'i (renk/emoji) takip eder.

Subcommands:
- `deckent nervous` → Dashboard: pending notifications + recent history + config özet
- `deckent nervous accept <id>` → Öneri kabul
- `deckent nervous reject <id> [--reason <text>]` → Ret
- `deckent nervous edit <id>` → Modify + accept (modifier payload)
- `deckent nervous undo <action-id>` → Son N reversible eylemi geri al
- `deckent nervous history [--limit 20] [--since 1d]` → Audit trail
- `deckent nervous log [--follow]` → Live tail

`src/cli/commands/nervous.ts` (~500 LoC) — commander.js register pattern (ADR-012).

Output örnekleri:
```
$ deckent nervous
  🧠 Deckent Nervous System

  Pending:
    [1] ⚠ WARNING — stale-worker  (ns-147-0042)
        Worker w-147-009 3dk HB atmadı
        Actions: accept, reject, edit, ignore

  Recent (last 5):
    🟢 ✓ ORPHAN_TASK_ARCHIVE (autonomous) — 3dk önce
    🟡 ✓ DEBT_REPRIORITIZE (accepted) — 18dk önce
    🔴 ✗ COMMIT_PUSH (rejected by user) — 32dk önce

  Config: mode=balanced · overrides=0 · quiet=22:00-08:00 TRT
```

### Test (10 test)
1. `deckent nervous` no pending → "No pending" message
2. `deckent nervous` 3 pending → table format
3. `deckent nervous accept ns-147-0042` → executor.resolveApproval called
4. `deckent nervous reject ns-147-0042 --reason "later"` → rejection recorded
5. `deckent nervous history --limit 5` → 5 lines
6. `deckent nervous history --since 1d` → last 24h filter
7. `deckent nervous log --follow` → stream mode (SIGINT exits cleanly)
8. Unknown subcommand → usage printed + exit 1
9. Pending ID not found → friendly error
10. Colors use ANSI escape (Sprint 145 T-018 pattern)

**Kanıt:** `npx vitest run tests/cli/nervous-command.test.ts` 10/10 PASS. `deckent nervous` manuel akış doğrulanmış.

---

## Task 15: CLI Config — `deckent config nervous` TUI

- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/config-nervous.ts, tests/cli/config-nervous.test.ts
- Scope: src/cli/, tests/cli/

### Description
Interactive TUI + script-friendly flags. node:readline/promises (ADR-011) kullanılır.

Komutlar:
- `deckent config nervous` → Interactive (4 preset seçim + override review)
- `deckent config nervous set mode autopilot` → preset değiştir
- `deckent config nervous override COMMIT_PUSH approve` → per-action override
- `deckent config nervous list` → Mevcut matrix (tablo)
- `deckent config nervous reset` → preset'e dön

`src/cli/commands/config-nervous.ts` (~300 LoC).

### Test (7 test)
1. `config nervous set mode strict` → config.nervous_system.mode = 'strict'
2. `config nervous override COMMIT_PUSH approve` → action_overrides updated
3. `config nervous list` → 4 line matrix table
4. `config nervous reset` → action_overrides = {}
5. Invalid preset → error + exit 1
6. Invalid action ID → error
7. Safety floor override attempt (KILL_LIVE_SPRINT=autonomous) → rejected + warning

**Kanıt:** `npx vitest run tests/cli/config-nervous.test.ts` 7/7 PASS.

---

## Task 16: MCP Tools — 5 Nervous System Tools

- Model: opus
- Effort: high
- Skills: typescript-expert, anthropic-sdk
- Files: src/mcp/tools/nervous.ts, src/mcp/server.ts, tests/mcp/nervous-tools.test.ts
- Scope: src/mcp/, tests/mcp/

### Description
5 MCP tool (ADR-022-v2 CLI/MCP parity):

```typescript
deckent_nervous_subscribe({ sprintId?: string })  // SSE-like pub (registers client)
deckent_nervous_accept({ id: string })
deckent_nervous_reject({ id: string, reason?: string })
deckent_nervous_status()  // Dashboard snapshot
deckent_nervous_config({ action: 'read'|'set_preset'|'set_override'|'list_actions'|'reset', preset?, overrides? })
```

MCP server.ts'e register, tools list'e ekle.

### Test (10 test)
1-5. Her tool tanımlı ve response schema validation
6. `deckent_nervous_status` returns pending + recent + config snapshot
7. `deckent_nervous_accept` invalid ID → MCP error response
8. `deckent_nervous_config({action:'list_actions'})` → 30 actions
9. `deckent_nervous_config({action:'set_preset', preset:'autopilot'})` → persisted
10. Total MCP tool count: 22 + 5 = 27 (sprint 147 sonunda)

**Kanıt:** `npx vitest run tests/mcp/nervous-tools.test.ts` 10/10 PASS. MCP restart sonrası 27 tool visible.

---

## Task 17: Config Schema Extension — nervous_system

- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/config.ts, src/core/config-defaults.ts, tests/core/config-nervous-schema.test.ts
- Scope: src/core/, tests/core/

### Description
3-layer config merge'e nervous_system section ekle. Default: `enabled: false` (Sprint 147 sonunda Sprint 148 için true).

```typescript
// src/core/config-defaults.ts extend
nervous_system: {
  enabled: false,
  mode: 'balanced',
  actionOverrides: {},
  safety_floor: {
    locked_actions: ['KILL_LIVE_SPRINT', 'MANUAL_FILE_DELETE', 'COST_OVER_THRESHOLD', 'DESTRUCTIVE_GIT', 'ADR_DEPRECATE_ACCEPTED'],
    cost_threshold_usd: 110,
    bypass_allowed: false,
  },
  notifications: {
    channels: { mcp: true, cli: true, file: true, desktop: false },
    throttle_ms: 300000,
    group_info_window_ms: 600000,
    severity_min: 'info',
    quiet_hours: { start: '22:00', end: '08:00', timezone: 'TRT' },
    cross_channel_dedup: true,
  },
  detectors: {
    stale_worker: { enabled: true, threshold_ms: 180000 },
    scope_collision: { enabled: true },
    debt_trend: { enabled: true, threshold_rate: 0.15 },
    agent_routing: { enabled: true, anomaly_threshold: 0.40 },
    directives_protection: { enabled: true, auto_restore: true },
    // 5 reserve (Sprint 148 activate)
    dead_event_stream: { enabled: false, reserve_for: 'sprint-148' },
    cost_threshold: { enabled: false, reserve_for: 'sprint-148' },
    prompt_quality: { enabled: false, reserve_for: 'sprint-148' },
    worker_output_variance: { enabled: false, reserve_for: 'sprint-148' },
    self_modifying_warner: { enabled: false, reserve_for: 'sprint-148' },
  },
  history_retention_days: 30,
}
```

### Test (6 test)
1. Default config has nervous_system.enabled=false
2. Project config mode override applied (3-layer merge)
3. Global config overrides defaults, project overrides global
4. Invalid mode → validation error
5. Invalid threshold_ms (negative) → validation error
6. nervous_system.detectors has exactly 10 entries (5 active + 5 reserve)

**Kanıt:** `npx vitest run tests/core/config-nervous-schema.test.ts` 6/6 PASS.

---

## Task 18: Dispatcher — Context Detection + 3 Adapter Routing

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Files: src/nervous/dispatcher.ts, tests/nervous/dispatcher.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
Sprint 145 T-006 NotifyDispatcher foundation üzerine nervous-specific dispatcher. Context detection otomatik kanal seç, cross-channel dedup garantisi.

`src/nervous/dispatcher.ts` (~300 LoC):

```typescript
import type { NervousNotification } from '../core/nervous-types.js';
import { getNotifyDispatcher } from '../notify/dispatcher.js';  // Sprint 145 T-006

export type Channel = 'mcp' | 'cli' | 'file';

export class NervousDispatcher {
  private readonly emittedIds = new Set<string>();  // cross-channel dedup

  constructor(private readonly config: NervousSystemConfig) {}

  async dispatch(notification: NervousNotification): Promise<{ channels: Channel[]; success: boolean }> {
    if (this.emittedIds.has(notification.id)) return { channels: [], success: true };
    this.emittedIds.add(notification.id);

    const channels = this.selectChannels(notification);
    const results = await Promise.all(channels.map(c => this.pushToChannel(c, notification)));

    return { channels, success: results.every(r => r) };
  }

  private selectChannels(n: NervousNotification): Channel[] {
    const channels: Channel[] = ['file'];  // her zaman log
    const cfg = this.config.notifications?.channels;
    if (!cfg) return channels;

    // Critical/emergency broadcast
    if (n.severity === 'critical' || n.severity === 'emergency') {
      if (cfg.mcp) channels.push('mcp');
      if (cfg.cli) channels.push('cli');
      return channels;
    }

    // Context detection
    if (process.env.DECKENT_MCP_ACTIVE === '1' && cfg.mcp) {
      channels.push('mcp');
    } else if (process.stdout.isTTY && cfg.cli) {
      channels.push('cli');
    }
    return channels;
  }

  private async pushToChannel(channel: Channel, n: NervousNotification): Promise<boolean>;
}
```

### Test (8 test)
1. Dispatch to file always
2. MCP env var set → channels include 'mcp'
3. TTY present + MCP off → channels include 'cli'
4. Critical severity → broadcasts to all enabled
5. Duplicate notification ID → no re-dispatch
6. All channels disabled → only 'file'
7. MCP dispatch failure → 'cli' fallback triggered
8. Integration: NotifyDispatcher.push called (Sprint 145 T-006 wire)

**Kanıt:** `npx vitest run tests/nervous/dispatcher.test.ts` 8/8 PASS.

---

## Task 19: Integration Tests — 40+ Tests Suite

- Model: opus
- Effort: high
- Skills: testing-expert, typescript-expert
- Files: tests/nervous/integration/*.test.ts (5 file)
- Scope: tests/nervous/

### Description
40+ integration test: Observer+Detector+DecisionEngine+Proposer+Executor+Dispatcher tam pipeline. Sprint 146 T-146-011 vitest regression fix de bu waveda toplanır (mocks bozulan 2 fail tamir).

5 test dosyası:
1. `observer-to-detector.test.ts` (10 test) — Observer event → Detector dispatch
2. `detector-to-decision.test.ts` (10 test) — DetectorResult → DecisionOutput(s)
3. `proposer-to-executor.test.ts` (10 test) — Notification → ExecutionRecord
4. `dispatcher-end-to-end.test.ts` (6 test) — Full pipeline simulation
5. `regression-sprint-146.test.ts` (5 test) — Sprint 146 T-011 vitest regression fix

Min toplam: 41 test.

### Test
Şart: `npx vitest run tests/nervous/integration/` 41/41 PASS.
Ek: `npx vitest run` total fail < 3 (Sprint 146'dan gelen 118 baseline'ı da iyileştirme).

**Kanıt:** Vitest full run: Sprint 146 baseline fail 118 → Sprint 147 fail < 30.

---

## Task 20: E2E — Canlı Sprint Simulation

- Model: opus
- Effort: high
- Skills: testing-expert, system-architect
- Files: tests/e2e/nervous-flow.test.ts
- Scope: tests/e2e/

### Description
Tam sprint simulation: PLAN→SPAWN→EXECUTE→EVALUATE. Her phase'te nervous system nasıl davranır kontrol.

Senaryo:
1. PLAN'de ScopeCollisionMonitor — 2 task aynı dosyaya yazacak, medium-risk suggest
2. EXECUTE mid-sprint → DIRECTIVES.md template'e dönüşür → DirectivesMidSprintProtection emergency
3. EXECUTE worker w-009 3dk HB yok → StaleWorkerDetector medium-risk suggest
4. EVALUATE phase → AgentRoutingHealth yakalar `string;` corrupt agent critical
5. RETRO sonrası DebtTrendAnalyzer 3 sprint ortalaması %17 → DEBT_REPRIORITIZE suggest

Her detection için:
- Notification üretilir mi
- Doğru policy (authority matrix)
- Executor doğru mod (autonomous/suggest/approve)
- History record doğru
- Dispatcher doğru kanal

### Test (5 senaryo × complex)
- Test 1: Scope collision happy path
- Test 2: DIRECTIVES emergency restore
- Test 3: Stale worker respawn suggestion
- Test 4: Agent routing critical alert
- Test 5: Debt trend suggestion

**Kanıt:** `npx vitest run tests/e2e/nervous-flow.test.ts` 5/5 PASS.

---

## Task 21: Sprint Controller Hook — Lifecycle Event Emit

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/orchestra/event-bus.ts, tests/orchestra/sprint-controller-nervous-hook.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint lifecycle'a SPRINT_PHASE_CHANGE event emit ekle. NervousObserver bu event'leri sprint-lifecycle source olarak alacak.

Sprint controller her phase geçişinde:
```typescript
eventBus.emit('deckent-event', {
  type: 'SPRINT_PHASE_CHANGE',
  oldPhase, newPhase, sprintId,
  timestamp: new Date().toISOString(),
});
```

Additional events:
- `SPRINT_RETRO_COMPLETE` (DebtTrendAnalyzer için)
- `SPRINT_STARTED`
- `SPRINT_COMPLETED`

### Test (5 test)
1. Phase IDLE→PLAN → event emit with correct payload
2. Each phase transition emits 1 event
3. SPRINT_RETRO_COMPLETE emitted after retro.write
4. 9 phases total → 9 events for a full sprint
5. sprint-controller.ts backward compat (nervous disabled → events still emit but no subscribers)

**Kanıt:** `npx vitest run tests/orchestra/sprint-controller-nervous-hook.test.ts` 5/5 PASS.

---

## Task 22: ADR-040 Accept — Nervous System Architecture

- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: .brain/memory.db (ADR update), .brain/exports/decisions.md (regenerated)
- Scope: .brain/

### Description
Sprint 146 T-146-012 ADR-040 draft status:`proposed` yazmıştı. Sprint 147 sonunda accept edilir.

MemoryStore ile:
```typescript
store.updateById('adr-040', {
  status: 'accepted',
  accepted_at: new Date().toISOString(),
  sprint_id: 'sprint-147',
  body: /* tam ADR içeriği — design spec Section 11 MADR v3 format */,
});
```

MADR v3 hibrit format: Context/Decision/Consequences (+/-)/References.

**References:** Sprint 145 canlı kanıt (DIRECTIVES mid-sprint bug, test-writer %53 anomaly, `string;` agent corruption, SDL dead write), Sprint 146 T-146-012 placeholder types, Sprint 147 tüm 21 task.

### Test (3 test)
1. `store.getById('adr-040').status === 'accepted'`
2. `.brain/exports/decisions.md` regenerated with ADR-040 entry
3. ADR-040 body contains "References" section with Sprint 147 tasks

**Kanıt:** `store.getByType('adr').filter(a => a.id === 'adr-040')[0].status === 'accepted'`. Export rerun sonrası summary.md içinde ADR-040 satırı.

---

## Bağımlılık Zinciri

```
Wave 1 (paralel, foundation):  T1 + T2 + T3 + T4
Wave 2 (paralel, core):        T5 ← {T2,T3} | T6 ← {T1} | T7 ← {T6,T8} | T8 ← {T1}
Wave 3 (paralel, detectors):   T9 + T10 + T11 + T12 + T13 (all ← T1)
Wave 4 (paralel, UI+config):   T14 ← {T7,T8} | T15 ← {T3,T17} | T16 ← {T7,T8} | T17
Wave 5 (paralel, dispatch):    T18 ← {T1,T6} | T19 ← ALL PRIOR | T20 ← ALL PRIOR
Wave 6 (integration):          T21 ← {T4} | T22 ← {T1..T21 tümü}
```

## Sprint Gate (Chain Safety)
1. tsc PASS
2. vitest ≥ %99.3 pass (fail < 30 / 12485)
3. doctor ≥ 90/100
4. NO_GO ≤ 2
5. prompt_linter avg ≥ 75/100
6. cost < $110 (soft alert, subs modu)
7. ADR-040 status=accepted

## Sprint 147 Self-Modifying Uyarısı
Deckent kendi `src/nervous/` modülünü yazıyor. ADR-038 Self-Modifying Detection canlı. Koordinatör disiplin:
- Sprint canlı iken `src/` müdahale YASAK (Sprint 144/145/146 lesson, Sprint 146'da `src/` hiç elllenmedi — muhafaza edelim)
- Monitor 15-30s
- Task 13 canlı olunca DIRECTIVES.md mid-sprint korunacak (reflexive)

## Sprint 148 Yolu (Beta GA - 2 gün kaldı)
Sprint 147 başarılı kapanış kriterleri:
- 22/22 veya 21/22 tamamlanmış (NO_GO ≤ 1)
- ADR-040 accepted
- Nervous CLI + MCP tools visible
- `deckent config nervous set mode balanced` works
- 5 detector aktif (Sprint 148'de canlı dogfood için hazır)
- vitest ≥ %99.3

**Beta GA yolu:** Sprint 146 ✅ → Sprint 147 (bugün) → Sprint 148 (Çar dogfood + 5 detector activation) → Sprint 149 (Çar-Per doc consolidation) → Sprint 150 (Per 🚀 GA v1.0.0-beta.1 cutover)

---

**Oluşturan:** Koordinatör (writing-plans skill + spec 2026-04-20 + Alperen onayları 5/5)
**Baseline:** Sprint 146 16/17, avg rubric 94, 1h 2m (hedef Sprint 147 ≤ 6h, rubric ≥ 90)
**İlk komut:** `deckent_plan mode: 'structured'` — Alperen onayı bekliyor
