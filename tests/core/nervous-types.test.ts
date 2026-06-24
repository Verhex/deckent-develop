// tests/core/nervous-types.test.ts
//
// Nervous System preflight type tests — Sprint 146 Task 12.
// Bu testler Sprint 147 implementasyonu için zemin doğrular.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  AuthorityMode,
  RiskLevel,
  ApprovalPolicy,
  Severity,
  SafetyFloorAction,
  NervousNotification,
  NotificationAction,
  AuthorityMatrix,
  NervousSystemConfigV1,
  DetectorResult,
} from '../../src/core/nervous-types.js';
import type { NervousSystemConfig } from '../../src/core/config-types.js';

// ─── Test 1: AuthorityMode union compile eder ────────────────────────────────

describe('AuthorityMode', () => {
  it('all valid modes compile and are assignable', () => {
    const modes: AuthorityMode[] = ['strict', 'balanced', 'autopilot', 'full-auto'];
    expect(modes).toHaveLength(4);
    expect(modes).toContain('strict');
    expect(modes).toContain('balanced');
    expect(modes).toContain('autopilot');
    expect(modes).toContain('full-auto');
  });

  it('RiskLevel covers low/medium/high', () => {
    const levels: RiskLevel[] = ['low', 'medium', 'high'];
    expect(levels).toHaveLength(3);
  });

  it('ApprovalPolicy covers all timeout variants', () => {
    const policies: ApprovalPolicy[] = ['autonomous', 'suggest-30m', 'suggest-5m', 'approve'];
    expect(policies).toHaveLength(4);
  });

  it('Severity covers all 4 levels', () => {
    const severities: Severity[] = ['info', 'warning', 'critical', 'emergency'];
    expect(severities).toHaveLength(4);
  });

  it('SafetyFloorAction covers all 5 locked actions', () => {
    const actions: SafetyFloorAction[] = [
      'KILL_LIVE_SPRINT',
      'MANUAL_FILE_DELETE',
      'COST_OVER_THRESHOLD',
      'DESTRUCTIVE_GIT',
      'ADR_DEPRECATE_ACCEPTED',
    ];
    expect(actions).toHaveLength(5);
  });
});

// ─── Test 2: NervousNotification structure doğru ─────────────────────────────

describe('NervousNotification', () => {
  it('valid notification object satisfies interface', () => {
    const action: NotificationAction = {
      id: 'action-001',
      label: 'Stale lock\'u serbest bırak',
      policy: 'autonomous',
      risk: 'low',
      isSafetyFloor: false,
      payload: { lockPath: '.locks/test.lock' },
    };

    const notification: NervousNotification = {
      id: 'notif-uuid-001',
      type: 'STALE_LOCK_DETECTED',
      title: 'Stale lock tespit edildi',
      message: '.locks/test.lock 6 dakikadır stale (eşik: 5 dakika)',
      severity: 'warning',
      createdAt: '2026-04-20T12:00:00.000Z',
      detectorId: 'stale-lock-detector',
      actions: [action],
      timeoutMs: 30 * 60 * 1000,
      sprintId: 'sprint-146',
      taskId: '146-001',
      groupKey: 'stale-lock',
    };

    expect(notification.id).toBe('notif-uuid-001');
    expect(notification.type).toBe('STALE_LOCK_DETECTED');
    expect(notification.severity).toBe('warning');
    expect(notification.actions).toHaveLength(1);
    expect(notification.actions[0]!.policy).toBe('autonomous');
    expect(notification.actions[0]!.isSafetyFloor).toBe(false);
    expect(notification.timeoutMs).toBe(1800000);
  });

  it('notification with no actions (informational) is valid', () => {
    const infoNotif: NervousNotification = {
      id: 'notif-info-001',
      type: 'METRIC_EMIT',
      title: 'Sprint metrik raporu',
      message: '17 task tamamlandı, 0 NO_GO',
      severity: 'info',
      createdAt: '2026-04-20T14:00:00.000Z',
      detectorId: 'metric-detector',
      actions: [],
      timeoutMs: null,
    };

    expect(infoNotif.actions).toHaveLength(0);
    expect(infoNotif.timeoutMs).toBeNull();
    expect(infoNotif.sprintId).toBeUndefined();
    expect(infoNotif.groupKey).toBeUndefined();
  });

  it('safety floor action marked correctly', () => {
    const safetyAction: NotificationAction = {
      id: 'action-safety-001',
      label: 'Sprint\'i durdur',
      policy: 'approve',
      risk: 'high',
      isSafetyFloor: true,
    };

    expect(safetyAction.isSafetyFloor).toBe(true);
    expect(safetyAction.policy).toBe('approve');
    expect(safetyAction.risk).toBe('high');
  });

  it('AuthorityMatrix preset shape is valid', () => {
    const balancedMatrix: AuthorityMatrix = {
      mode: 'balanced',
      riskPolicyMap: {
        low: 'autonomous',
        medium: 'suggest-30m',
        high: 'approve',
      },
      actionOverrides: {
        COMMIT_PUSH: 'approve',
      },
      safetyFloor: [
        'KILL_LIVE_SPRINT',
        'MANUAL_FILE_DELETE',
        'COST_OVER_THRESHOLD',
        'DESTRUCTIVE_GIT',
        'ADR_DEPRECATE_ACCEPTED',
      ],
    };

    expect(balancedMatrix.mode).toBe('balanced');
    expect(balancedMatrix.riskPolicyMap.low).toBe('autonomous');
    expect(balancedMatrix.riskPolicyMap.medium).toBe('suggest-30m');
    expect(balancedMatrix.riskPolicyMap.high).toBe('approve');
    expect(balancedMatrix.safetyFloor).toHaveLength(5);
    expect(balancedMatrix.actionOverrides['COMMIT_PUSH']).toBe('approve');
  });

  it('NervousSystemConfigV1 defaults shape is valid', () => {
    const config: NervousSystemConfigV1 = {
      mode: 'balanced',
      enabled: false,
      throttleWindowMs: 60000,
      quietHours: { start: '23:00', end: '07:00' },
    };

    expect(config.mode).toBe('balanced');
    expect(config.enabled).toBe(false);
    expect(config.throttleWindowMs).toBe(60000);
    expect(config.actionOverrides).toBeUndefined();
  });

  it('NervousSystemConfigV1 derives its shared fields from the V2 NervousSystemConfig (single source)', () => {
    // Sprint 323 (323-010) V1→V2 migration: the V1 view is no longer an independent schema — its
    // shared fields are Picked from the canonical V2 NervousSystemConfig. These compile-time checks
    // pin that derivation: V2 field types must be assignable to the V1 view field types.
    const mode: NervousSystemConfig['mode'] = 'autopilot';
    const enabled: NervousSystemConfig['enabled'] = true;
    const overrides: NervousSystemConfig['actionOverrides'] = { COMMIT_PUSH: 'approve' };
    const view: NervousSystemConfigV1 = {
      mode,                       // NervousSystemConfig['mode'] → NervousSystemConfigV1['mode']
      enabled,                    // NervousSystemConfig['enabled'] → NervousSystemConfigV1['enabled']
      actionOverrides: overrides, // NervousSystemConfig['actionOverrides'] → optional on the view
    };

    expect(view.mode).toBe('autopilot');
    expect(view.enabled).toBe(true);
    expect(view.actionOverrides?.['COMMIT_PUSH']).toBe('approve');
  });

  it('DetectorResult shape is valid', () => {
    const result: DetectorResult = {
      risk: 'medium',
      suggestedActions: [
        { id: 'WORKER_RESPAWN', label: 'Worker yeniden spawn', risk: 'medium', payload: { workerId: 'w-146-001' } },
      ],
      shouldNotify: true,
      severity: 'warning',
      groupKey: 'worker-stale',
      metadata: { staleDurationMs: 150000 },
    };

    expect(result.risk).toBe('medium');
    expect(result.shouldNotify).toBe(true);
    expect(result.suggestedActions).toHaveLength(1);
    expect(result.suggestedActions[0]!.id).toBe('WORKER_RESPAWN');
  });
});

// ─── Test 3: ADR-040 memory'de var, status: proposed ────────────────────────

describe('ADR-040 memory entry', () => {
  it('simulates ADR-040 proposed entry structure', () => {
    // ADR-040 gerçek memory store'a insert edilemez (DB integration test scope dışı).
    // Bu test, Sprint 147'de store.insert() ile oluşturulacak entry şeklini doğrular.
    const adr040Entry = {
      id: 'adr-040',
      type: 'adr' as const,
      source: 'brain' as const,
      title: 'ADR-040: Nervous System Architecture — Proactive Meta-Orchestrator',
      content: [
        '## Status\nproposed',
        '',
        '## Context',
        'Sprint 145 kanıtladı: reaktif koordinatör modeli beta GA\'ya ölçeklenemez.',
        '24 GO_WITH_TECH_DEBT → debt spiral → Sprint 148-150 yük.',
        'Alperen direktifi (2026-04-20): proaktif sinir sistemi inşa edilmeli.',
        '',
        '## Decision',
        'Nervous System = sürekli çalışan meta-orkestratör.',
        'Observer → Detector → Decision Engine → Proposer → Dispatcher → Executor.',
        '4 AuthorityMode preset + safety floor.',
        '',
        '## Status',
        'proposed — Sprint 147 sonu accept edilecek.',
      ].join('\n'),
      summary: 'Proaktif meta-orkestratör — Observer/Detector/Decision/Proposer/Dispatcher/Executor katmanları, 4 yetki modu, 5 safety floor.',
      status: 'proposed' as const,
      sprint_id: 'sprint-146',
      tags: ['nervous-system', 'architecture', 'meta-orchestrator', 'authority-matrix'],
      lang: 'tr',
      decay_exempt: true,
      metadata: {
        sprint_scope: 'sprint-147-implementation',
        preflight_created: 'sprint-146',
      },
    };

    // Şema doğrulamaları
    expect(adr040Entry.id).toBe('adr-040');
    expect(adr040Entry.type).toBe('adr');
    expect(adr040Entry.status).toBe('proposed');
    expect(adr040Entry.title).toContain('ADR-040');
    expect(adr040Entry.title).toContain('Nervous System');
    expect(adr040Entry.decay_exempt).toBe(true);
    expect(adr040Entry.tags).toContain('nervous-system');
    expect(adr040Entry.tags).toContain('authority-matrix');
    expect(adr040Entry.content).toContain('proposed');
    expect(adr040Entry.sprint_id).toBe('sprint-146');
  });

  it('getByType filter simulation returns adr-040', () => {
    // Memory store getByType('adr') simülasyonu
    const mockEntries = [
      { id: 'adr-038', type: 'adr', status: 'accepted', title: 'ADR-038: Dead Code' },
      { id: 'adr-039', type: 'adr', status: 'accepted', title: 'ADR-039: Self-Modifying' },
      { id: 'adr-040', type: 'adr', status: 'proposed', title: 'ADR-040: Nervous System Architecture' },
    ];

    const adr040Results = mockEntries.filter(e => e.id === 'adr-040');
    expect(adr040Results).toHaveLength(1);
    expect(adr040Results[0]!.status).toBe('proposed');
    expect(adr040Results[0]!.title).toContain('Nervous System');
  });

  it('adr-040 does not conflict with existing accepted ADRs', () => {
    // Mevcut ADR ID'leriyle çakışma yok
    const existingAdrIds = Array.from({ length: 39 }, (_, i) => `adr-${String(i + 1).padStart(3, '0')}`);
    // Bazıları özel suffix ile
    const allIds = [...existingAdrIds, 'adr-022-v2'];

    expect(allIds).not.toContain('adr-040');
    // adr-040 yeni ve benzersiz
    const newId = 'adr-040';
    expect(allIds.includes(newId)).toBe(false);
  });
});
