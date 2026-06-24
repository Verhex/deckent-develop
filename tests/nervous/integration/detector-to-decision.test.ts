// tests/nervous/integration/detector-to-decision.test.ts
//
// Integration: DetectorResult → DecisionEngine → DecisionOutput(s)
// Sprint 147 Task 19

import { describe, it, expect, beforeEach } from 'vitest';
import type { DetectorResult, NervousSystemConfigV1 } from '../../../src/core/nervous-types.js';
import { DecisionEngine } from '../../../src/nervous/decision-engine.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<NervousSystemConfigV1> = {}): NervousSystemConfigV1 {
  return {
    mode: 'balanced',
    enabled: true,
    ...overrides,
  };
}

function makeDetectorResult(overrides: Partial<DetectorResult> = {}): DetectorResult {
  return {
    risk: 'medium',
    shouldNotify: true,
    severity: 'warning',
    // bug-2: title/message are now required on DetectorResult.
    title: 'Stale worker w-001',
    message: 'Test detector result for detector→decision integration',
    groupKey: 'test-group',
    suggestedActions: [{
      id: 'WORKER_RESPAWN',
      label: 'Respawn stale worker',
      risk: 'medium',
      payload: { workerId: 'w-001' },
    }],
    metadata: { type: 'test' },
    ...overrides,
  };
}

describe('Detector → Decision Engine Integration', () => {
  describe('balanced mode decisions', () => {
    it('should resolve low-risk action to autonomous in balanced mode', () => {
      const engine = new DecisionEngine(makeConfig({ mode: 'balanced' }));
      const result = makeDetectorResult({
        suggestedActions: [{
          id: 'ORPHAN_TASK_ARCHIVE',
          label: 'Archive orphan tasks',
          risk: 'low',
          payload: {},
        }],
      });

      const decisions = engine.decide(result);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].policy).toBe('autonomous');
      expect(decisions[0].isSafetyFloor).toBe(false);
    });

    it('should resolve medium-risk action to suggest-30m in balanced mode', () => {
      const engine = new DecisionEngine(makeConfig({ mode: 'balanced' }));
      const result = makeDetectorResult({
        suggestedActions: [{
          id: 'WORKER_RESPAWN',
          label: 'Respawn worker',
          risk: 'medium',
          payload: {},
        }],
      });

      const decisions = engine.decide(result);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].policy).toBe('suggest-30m');
    });

    it('should resolve high-risk action to approve in balanced mode', () => {
      const engine = new DecisionEngine(makeConfig({ mode: 'balanced' }));
      const result = makeDetectorResult({
        suggestedActions: [{
          id: 'COMMIT_PUSH',
          label: 'Push commit',
          risk: 'high',
          payload: {},
        }],
      });

      const decisions = engine.decide(result);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].policy).toBe('approve');
    });
  });

  describe('safety floor enforcement', () => {
    it('should enforce approve for safety floor action even in full-auto mode', () => {
      const engine = new DecisionEngine(makeConfig({ mode: 'full-auto' }));
      const result = makeDetectorResult({
        suggestedActions: [{
          id: 'KILL_LIVE_SPRINT',
          label: 'Kill sprint',
          risk: 'high',
          payload: {},
        }],
      });

      const decisions = engine.decide(result);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].policy).toBe('approve');
      expect(decisions[0].isSafetyFloor).toBe(true);
      expect(decisions[0].reason).toContain('Safety floor');
    });

    it('should enforce approve for DESTRUCTIVE_GIT in autopilot mode', () => {
      const engine = new DecisionEngine(makeConfig({ mode: 'autopilot' }));
      const result = makeDetectorResult({
        suggestedActions: [{
          id: 'DESTRUCTIVE_GIT',
          label: 'Force push',
          risk: 'high',
          payload: {},
        }],
      });

      const decisions = engine.decide(result);
      expect(decisions[0].policy).toBe('approve');
      expect(decisions[0].isSafetyFloor).toBe(true);
    });
  });

  describe('user overrides', () => {
    it('should apply user override over default risk policy', () => {
      const engine = new DecisionEngine(makeConfig({
        mode: 'balanced',
        actionOverrides: { COMMIT_PUSH: 'autonomous' },
      }));
      const result = makeDetectorResult({
        suggestedActions: [{
          id: 'COMMIT_PUSH',
          label: 'Push commit',
          risk: 'high',
          payload: {},
        }],
      });

      const decisions = engine.decide(result);
      expect(decisions[0].policy).toBe('autonomous');
      expect(decisions[0].reason).toContain('User override');
    });

    it('should not allow user override to bypass safety floor', () => {
      const engine = new DecisionEngine(makeConfig({
        mode: 'full-auto',
        actionOverrides: { KILL_LIVE_SPRINT: 'autonomous' },
      }));
      const result = makeDetectorResult({
        suggestedActions: [{
          id: 'KILL_LIVE_SPRINT',
          label: 'Kill sprint',
          risk: 'high',
          payload: {},
        }],
      });

      const decisions = engine.decide(result);
      expect(decisions[0].policy).toBe('approve');
      expect(decisions[0].isSafetyFloor).toBe(true);
    });
  });

  describe('multi-action decisions', () => {
    it('should produce multiple DecisionOutputs for multiple suggested actions', () => {
      const engine = new DecisionEngine(makeConfig({ mode: 'balanced' }));
      const result = makeDetectorResult({
        suggestedActions: [
          { id: 'WORKER_RESPAWN', label: 'Respawn w-001', risk: 'medium', payload: {} },
          { id: 'ORPHAN_TASK_ARCHIVE', label: 'Archive orphans', risk: 'low', payload: {} },
        ],
      });

      const decisions = engine.decide(result);
      expect(decisions).toHaveLength(2);
      expect(decisions[0].policy).toBe('suggest-30m'); // medium
      expect(decisions[1].policy).toBe('autonomous');  // low
    });

    it('should skip unknown action IDs without throwing', () => {
      const engine = new DecisionEngine(makeConfig({ mode: 'balanced' }));
      const result = makeDetectorResult({
        suggestedActions: [
          { id: 'FUTURE_ACTION_UNKNOWN', label: 'Unknown', risk: 'medium', payload: {} },
          { id: 'WORKER_RESPAWN', label: 'Respawn', risk: 'medium', payload: {} },
        ],
      });

      const decisions = engine.decide(result);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].action.id).toBe('WORKER_RESPAWN');
    });
  });

  describe('invalid mode', () => {
    it('should throw for invalid authority mode', () => {
      const engine = new DecisionEngine(makeConfig({ mode: 'invalid' as any }));
      const result = makeDetectorResult();

      expect(() => engine.decide(result)).toThrow('Invalid authority mode');
    });
  });
});
