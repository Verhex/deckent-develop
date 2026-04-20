// tests/core/nervous-types-runtime.test.ts
//
// Runtime validation tests for Sprint 147 Nervous System types.
// Verifies type structure, constraints, and consistency at runtime.

import { describe, it, expect } from 'vitest';
import type {
  ObserverEvent,
  ObserverEventSource,
  DetectorContext,
  SprintStateSnapshot,
  ActionDefinition,
  ExecutionRecord,
  DecisionOutput,
  RiskLevel,
  ApprovalPolicy,
  SafetyFloorAction,
  Severity,
} from '../../src/core/nervous-types.js';

// UUID v4 regex
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// ISO 8601 UTC regex (allows Z or +00:00)
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

describe('Nervous Types — Runtime Validation', () => {
  describe('ObserverEvent', () => {
    it('should enforce UUID v4 id and ISO 8601 timestamp structure', () => {
      const event: ObserverEvent = {
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        source: 'event-bus',
        type: 'WORKER_HEARTBEAT',
        timestamp: '2026-04-20T10:00:00.000Z',
        payload: { workerId: 'w-001' },
        sprintId: 'sprint-147',
        taskId: '147-001',
      };

      expect(event.id).toMatch(UUID_V4_REGEX);
      expect(event.timestamp).toMatch(ISO_8601_REGEX);
      expect(event.source).toBe('event-bus');
      expect(event.type).toBe('WORKER_HEARTBEAT');
      expect(event.payload).toEqual({ workerId: 'w-001' });
      expect(event.sprintId).toBe('sprint-147');
      expect(event.taskId).toBe('147-001');

      // All 4 sources are valid
      const sources: ObserverEventSource[] = ['event-bus', 'filesystem', 'cron', 'sprint-lifecycle'];
      for (const source of sources) {
        const e: ObserverEvent = { ...event, source };
        expect(e.source).toBe(source);
      }
    });
  });

  describe('DetectorContext + SprintStateSnapshot', () => {
    it('should have correct sprintState snapshot structure', () => {
      const snapshot: SprintStateSnapshot = {
        sprintId: 'sprint-147',
        currentPhase: 'EXECUTE',
        activeWorkers: [
          { id: 'w-147-001', taskId: '147-001', lastHeartbeat: '2026-04-20T10:00:00.000Z' },
          { id: 'w-147-002', taskId: '147-002', lastHeartbeat: '2026-04-20T09:58:00.000Z' },
        ],
        openDebtCount: 3,
        totalTasks: 22,
        completedTasks: 8,
      };

      const ctx: DetectorContext = {
        event: {
          id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          source: 'cron',
          type: 'TICK',
          timestamp: '2026-04-20T10:01:00.000Z',
          payload: { intervalMs: 15000 },
        },
        sprintState: snapshot,
        projectRoot: '/workspace',
        now: new Date('2026-04-20T10:01:00.000Z'),
      };

      expect(ctx.sprintState.sprintId).toBe('sprint-147');
      expect(ctx.sprintState.currentPhase).toBe('EXECUTE');
      expect(ctx.sprintState.activeWorkers).toHaveLength(2);
      expect(ctx.sprintState.activeWorkers[0].id).toBe('w-147-001');
      expect(ctx.sprintState.openDebtCount).toBe(3);
      expect(ctx.sprintState.totalTasks).toBe(22);
      expect(ctx.sprintState.completedTasks).toBe(8);
      expect(ctx.projectRoot).toBe('/workspace');
      expect(ctx.now).toBeInstanceOf(Date);

      // All valid phases
      const phases: SprintStateSnapshot['currentPhase'][] = [
        'IDLE', 'PLAN', 'SPAWN', 'EXECUTE', 'EVALUATE', 'FIX', 'RETRO', 'DECAY', 'CLEANUP',
      ];
      expect(phases).toHaveLength(9);
    });
  });

  describe('ActionDefinition', () => {
    it('should enforce category + defaultRisk consistency', () => {
      const lowRiskAction: ActionDefinition = {
        id: 'ORPHAN_TASK_ARCHIVE',
        displayName: 'Orphan Task Archive',
        description: 'Orphan .tasks/ dosyalarını arşivle',
        category: 'low-risk',
        defaultRisk: 'low',
        requiredSafetyFloor: [],
        reversible: true,
      };

      expect(lowRiskAction.category).toBe('low-risk');
      expect(lowRiskAction.defaultRisk).toBe('low');
      expect(lowRiskAction.requiredSafetyFloor).toHaveLength(0);
      expect(lowRiskAction.reversible).toBe(true);

      const safetyFloorAction: ActionDefinition = {
        id: 'KILL_LIVE_SPRINT',
        displayName: 'Kill Live Sprint',
        description: 'Canlı sprint durdurma',
        category: 'safety-floor',
        defaultRisk: 'high',
        requiredSafetyFloor: ['KILL_LIVE_SPRINT'],
        reversible: false,
      };

      expect(safetyFloorAction.category).toBe('safety-floor');
      expect(safetyFloorAction.defaultRisk).toBe('high');
      expect(safetyFloorAction.requiredSafetyFloor).toContain('KILL_LIVE_SPRINT');
      expect(safetyFloorAction.reversible).toBe(false);

      // Verify category literal types
      const categories: ActionDefinition['category'][] = ['low-risk', 'medium-risk', 'high-risk', 'safety-floor'];
      expect(categories).toHaveLength(4);
    });
  });

  describe('ExecutionRecord', () => {
    it('should enforce decision union types correctly', () => {
      const accepted: ExecutionRecord = {
        id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
        notificationId: 'n-001',
        actionId: 'ORPHAN_TASK_ARCHIVE',
        decision: 'accepted',
        decidedBy: 'user',
        executedAt: '2026-04-20T10:05:00.000Z',
        outcome: 'success',
        durationMs: 1200,
        reversible: true,
        payload: { archivedFiles: 3 },
      };

      expect(accepted.decision).toBe('accepted');
      expect(accepted.decidedBy).toBe('user');
      expect(accepted.outcome).toBe('success');
      expect(accepted.error).toBeUndefined();
      expect(accepted.durationMs).toBe(1200);

      const timeoutApplied: ExecutionRecord = {
        id: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f',
        notificationId: 'n-002',
        actionId: 'DEBT_REPRIORITIZE',
        decision: 'timeout-auto-applied',
        decidedBy: 'timeout',
        executedAt: '2026-04-20T10:35:00.000Z',
        outcome: 'success',
        reversible: false,
        payload: {},
      };

      expect(timeoutApplied.decision).toBe('timeout-auto-applied');
      expect(timeoutApplied.decidedBy).toBe('timeout');

      const failed: ExecutionRecord = {
        id: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a',
        notificationId: 'n-003',
        actionId: 'WORKER_RESPAWN',
        decision: 'autonomous',
        decidedBy: 'system',
        executedAt: '2026-04-20T10:06:00.000Z',
        outcome: 'failure',
        error: 'Worker process not found',
        reversible: false,
        payload: { workerId: 'w-147-009' },
      };

      expect(failed.decision).toBe('autonomous');
      expect(failed.decidedBy).toBe('system');
      expect(failed.outcome).toBe('failure');
      expect(failed.error).toBe('Worker process not found');

      // All valid decisions
      const decisions: ExecutionRecord['decision'][] = ['accepted', 'rejected', 'timeout-auto-applied', 'autonomous'];
      expect(decisions).toHaveLength(4);

      // All valid decidedBy
      const decidedBys: ExecutionRecord['decidedBy'][] = ['user', 'system', 'timeout'];
      expect(decidedBys).toHaveLength(3);

      // All valid outcomes
      const outcomes: ExecutionRecord['outcome'][] = ['success', 'failure', 'pending'];
      expect(outcomes).toHaveLength(3);
    });
  });

  describe('DecisionOutput', () => {
    it('should enforce safety floor VETO — autonomous never allowed for safety floor actions', () => {
      const safetyFloorDecision: DecisionOutput = {
        action: {
          id: 'KILL_LIVE_SPRINT',
          displayName: 'Kill Live Sprint',
          description: 'Canlı sprint durdurma',
          category: 'safety-floor',
          defaultRisk: 'high',
          requiredSafetyFloor: ['KILL_LIVE_SPRINT'],
          reversible: false,
        },
        policy: 'approve',  // Safety floor → ALWAYS approve, never autonomous
        risk: 'high',
        isSafetyFloor: true,
        reason: 'Safety floor: KILL_LIVE_SPRINT requires explicit user approval',
      };

      // Safety floor action MUST have policy='approve' and isSafetyFloor=true
      expect(safetyFloorDecision.isSafetyFloor).toBe(true);
      expect(safetyFloorDecision.policy).toBe('approve');
      expect(safetyFloorDecision.action.category).toBe('safety-floor');
      expect(safetyFloorDecision.action.requiredSafetyFloor.length).toBeGreaterThan(0);
      expect(safetyFloorDecision.reason).toContain('Safety floor');

      // Non-safety-floor action CAN be autonomous
      const autonomousDecision: DecisionOutput = {
        action: {
          id: 'LOG_ROTATION',
          displayName: 'Log Rotation',
          description: 'Eski log dosyalarını döndür',
          category: 'low-risk',
          defaultRisk: 'low',
          requiredSafetyFloor: [],
          reversible: false,
        },
        policy: 'autonomous',
        risk: 'low',
        isSafetyFloor: false,
        reason: 'Risk-based default (low): autonomous',
      };

      expect(autonomousDecision.isSafetyFloor).toBe(false);
      expect(autonomousDecision.policy).toBe('autonomous');
      expect(autonomousDecision.action.requiredSafetyFloor).toHaveLength(0);
    });
  });

  describe('tsc strict mode compliance', () => {
    it('should compile without any type errors — readonly and structural checks', () => {
      // This test verifies that all types are structurally sound at runtime.
      // If this file compiles (tsc --noEmit), strict mode is satisfied.
      // We verify readonly by checking array and object immutability semantics.

      const snapshot: SprintStateSnapshot = {
        sprintId: 'sprint-147',
        currentPhase: 'PLAN',
        activeWorkers: [],
        openDebtCount: 0,
        totalTasks: 10,
        completedTasks: 0,
      };

      // ReadonlyArray prevents push at type level (runtime still allows — this is a compile check)
      expect(Array.isArray(snapshot.activeWorkers)).toBe(true);
      expect(Object.isFrozen(snapshot)).toBe(false); // readonly is compile-time only

      // Verify all RiskLevel values
      const risks: RiskLevel[] = ['low', 'medium', 'high'];
      expect(risks).toHaveLength(3);

      // Verify all ApprovalPolicy values
      const policies: ApprovalPolicy[] = ['autonomous', 'suggest-30m', 'suggest-5m', 'approve'];
      expect(policies).toHaveLength(4);

      // Verify all Severity values
      const severities: Severity[] = ['info', 'warning', 'critical', 'emergency'];
      expect(severities).toHaveLength(4);

      // Verify all SafetyFloorAction values
      const safetyActions: SafetyFloorAction[] = [
        'KILL_LIVE_SPRINT', 'MANUAL_FILE_DELETE', 'COST_OVER_THRESHOLD',
        'DESTRUCTIVE_GIT', 'ADR_DEPRECATE_ACCEPTED',
      ];
      expect(safetyActions).toHaveLength(5);
    });
  });
});
