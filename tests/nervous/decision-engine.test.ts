// tests/nervous/decision-engine.test.ts
//
// Decision Engine — 10 test.
// Sprint 147 Task 5.

import { describe, it, expect, beforeEach } from 'vitest';
import type {
  DetectorResult,
  NervousSystemConfigV1,
  Severity,
} from '../../src/core/nervous-types.js';
import type { Capability } from '../../src/core/work-model.js';
import {
  DecisionEngine,
  isInQuietHours,
  type RiskGateRequest,
} from '../../src/nervous/decision-engine.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<NervousSystemConfigV1> = {}): NervousSystemConfigV1 {
  return {
    mode: 'balanced',
    enabled: true,
    ...overrides,
  };
}

function makeDetectorResult(
  overrides: Partial<DetectorResult> & { suggestedActions: DetectorResult['suggestedActions'] },
): DetectorResult {
  return {
    risk: 'low',
    shouldNotify: true,
    // bug-2: title/message are now required on DetectorResult.
    title: 'Test detection',
    message: 'Test detector result for decision-engine',
    ...overrides,
  };
}

/** Config extended with the opt-in risk-gate flag (declared on NervousSystemConfigV1 in a follow-up). */
type RiskGateConfig = NervousSystemConfigV1 & { risk_gate_enabled?: boolean };

function makeRiskGateConfig(
  riskGateEnabled: boolean,
  overrides: Partial<NervousSystemConfigV1> = {},
): RiskGateConfig {
  return { ...makeConfig(overrides), risk_gate_enabled: riskGateEnabled };
}

/** Build the minimal request shape `resolveRiskClass` consumes (caps + capabilityTarget). */
function makeRequest(
  capabilities: Capability[],
  capabilityTarget?: RiskGateRequest['capabilityTarget'],
): RiskGateRequest {
  return { requirements: { capabilities, resources: [] }, capabilityTarget };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DecisionEngine', () => {
  describe('decide()', () => {
    it('Balanced mode + low risk action -> policy=autonomous', () => {
      // Arrange
      const engine = new DecisionEngine(makeConfig({ mode: 'balanced' }));
      const result = makeDetectorResult({
        suggestedActions: [
          { id: 'ORPHAN_TASK_ARCHIVE', label: 'Archive orphans', risk: 'low' },
        ],
      });

      // Act
      const outputs = engine.decide(result);

      // Assert
      expect(outputs).toHaveLength(1);
      expect(outputs[0].policy).toBe('autonomous');
      expect(outputs[0].risk).toBe('low');
      expect(outputs[0].isSafetyFloor).toBe(false);
    });

    it('Strict mode + medium risk -> approve', () => {
      // Arrange
      const engine = new DecisionEngine(makeConfig({ mode: 'strict' }));
      const result = makeDetectorResult({
        suggestedActions: [
          { id: 'WORKER_RESPAWN', label: 'Respawn worker', risk: 'medium' },
        ],
      });

      // Act
      const outputs = engine.decide(result);

      // Assert
      expect(outputs).toHaveLength(1);
      expect(outputs[0].policy).toBe('approve');
    });

    it('Full-auto + safety floor -> approve (VETO)', () => {
      // Arrange — full-auto normally means everything is autonomous
      const engine = new DecisionEngine(makeConfig({ mode: 'full-auto' }));
      const result = makeDetectorResult({
        suggestedActions: [
          { id: 'KILL_LIVE_SPRINT', label: 'Kill sprint', risk: 'high' },
        ],
      });

      // Act
      const outputs = engine.decide(result);

      // Assert — safety floor overrides full-auto
      expect(outputs).toHaveLength(1);
      expect(outputs[0].policy).toBe('approve');
      expect(outputs[0].isSafetyFloor).toBe(true);
      expect(outputs[0].reason).toContain('Safety floor');
    });

    it('User override application (config.actionOverrides)', () => {
      // Arrange — balanced: COMMIT_PUSH is high-risk -> 'approve' by default
      // User overrides it to 'suggest-5m'
      const engine = new DecisionEngine(
        makeConfig({
          mode: 'balanced',
          actionOverrides: { COMMIT_PUSH: 'suggest-5m' },
        }),
      );
      const result = makeDetectorResult({
        suggestedActions: [
          { id: 'COMMIT_PUSH', label: 'Push commits', risk: 'high' },
        ],
      });

      // Act
      const outputs = engine.decide(result);

      // Assert
      expect(outputs).toHaveLength(1);
      expect(outputs[0].policy).toBe('suggest-5m');
      expect(outputs[0].reason).toContain('User override');
    });

    it('Multiple suggestedActions -> multiple DecisionOutputs', () => {
      // Arrange
      const engine = new DecisionEngine(makeConfig({ mode: 'balanced' }));
      const result = makeDetectorResult({
        suggestedActions: [
          { id: 'ORPHAN_TASK_ARCHIVE', label: 'Archive', risk: 'low' },
          { id: 'WORKER_RESPAWN', label: 'Respawn', risk: 'medium' },
          { id: 'COMMIT_PUSH', label: 'Push', risk: 'high' },
        ],
      });

      // Act
      const outputs = engine.decide(result);

      // Assert
      expect(outputs).toHaveLength(3);
      expect(outputs[0].policy).toBe('autonomous');   // low -> autonomous
      expect(outputs[1].policy).toBe('suggest-30m');   // medium -> suggest-30m
      expect(outputs[2].policy).toBe('approve');       // high -> approve
    });

    it('Unknown action ID -> skipped (not thrown)', () => {
      // Arrange
      const engine = new DecisionEngine(makeConfig({ mode: 'balanced' }));
      const result = makeDetectorResult({
        suggestedActions: [
          { id: 'NONEXISTENT_ACTION_XYZ', label: 'Ghost', risk: 'low' },
          { id: 'ORPHAN_TASK_ARCHIVE', label: 'Archive', risk: 'low' },
        ],
      });

      // Act
      const outputs = engine.decide(result);

      // Assert — unknown action silently skipped, valid one processed
      expect(outputs).toHaveLength(1);
      expect(outputs[0].action.id).toBe('ORPHAN_TASK_ARCHIVE');
    });

    it('Invalid authorityMode -> throws', () => {
      // Arrange
      const engine = new DecisionEngine(
        makeConfig({ mode: 'nonexistent-mode' as NervousSystemConfigV1['mode'] }),
      );
      const result = makeDetectorResult({
        suggestedActions: [
          { id: 'ORPHAN_TASK_ARCHIVE', label: 'Archive', risk: 'low' },
        ],
      });

      // Act + Assert
      expect(() => engine.decide(result)).toThrow('Invalid authority mode');
    });

    it('DecisionOutput.reason contains human-readable context', () => {
      // Arrange
      const engine = new DecisionEngine(makeConfig({ mode: 'balanced' }));
      const result = makeDetectorResult({
        suggestedActions: [
          { id: 'ORPHAN_TASK_ARCHIVE', label: 'Archive', risk: 'low' },
        ],
      });

      // Act
      const outputs = engine.decide(result);

      // Assert — reason should be descriptive, not empty
      expect(outputs[0].reason).toBeTruthy();
      expect(outputs[0].reason.length).toBeGreaterThan(10);
      expect(outputs[0].reason).toContain('low');
    });
  });

  describe('decide() risk-gate (F10-002 / WM-6)', () => {
    it('risk-gate OFF (default) + HIGH-risk request -> no gating (backward-safe)', () => {
      // Arrange — flag off; a normally-autonomous low action
      const engine = new DecisionEngine(makeRiskGateConfig(false));
      const result = makeDetectorResult({
        suggestedActions: [{ id: 'ORPHAN_TASK_ARCHIVE', label: 'Archive', risk: 'low' }],
      });

      // Act — even a HIGH-risk request must not gate while the flag is off
      const outputs = engine.decide(result, makeRequest(['shell']));

      // Assert
      expect(outputs).toHaveLength(1);
      expect(outputs[0].policy).toBe('autonomous');
    });

    it('risk-gate ON + HIGH-risk request (shell) -> decision parked (approve)', () => {
      // Arrange
      const engine = new DecisionEngine(makeRiskGateConfig(true));
      const result = makeDetectorResult({
        suggestedActions: [{ id: 'ORPHAN_TASK_ARCHIVE', label: 'Archive', risk: 'low' }],
      });

      // Act
      const outputs = engine.decide(result, makeRequest(['shell']));

      // Assert — low action that would auto-execute is parked for approval
      expect(outputs).toHaveLength(1);
      expect(outputs[0].policy).toBe('approve');
      expect(outputs[0].reason).toContain('Risk-gate');
      expect(outputs[0].reason).toContain('approval');
    });

    it('risk-gate ON + HIGH-risk via capabilityTarget verb (mail.send) -> parked', () => {
      // Arrange — no high-risk capability, but the verb is a write/send
      const engine = new DecisionEngine(makeRiskGateConfig(true));
      const result = makeDetectorResult({
        suggestedActions: [{ id: 'ORPHAN_TASK_ARCHIVE', label: 'Archive', risk: 'low' }],
      });

      // Act
      const outputs = engine.decide(result, makeRequest([], { capability: 'mail.send' }));

      // Assert
      expect(outputs[0].policy).toBe('approve');
    });

    it('risk-gate ON + LOW-risk request (fs-read) -> unchanged (autonomous)', () => {
      // Arrange
      const engine = new DecisionEngine(makeRiskGateConfig(true));
      const result = makeDetectorResult({
        suggestedActions: [{ id: 'ORPHAN_TASK_ARCHIVE', label: 'Archive', risk: 'low' }],
      });

      // Act — low-risk operation is not gated even with the flag on
      const outputs = engine.decide(result, makeRequest(['fs-read']));

      // Assert
      expect(outputs[0].policy).toBe('autonomous');
    });

    it('risk-gate ON but no request passed -> no gating (backward-safe)', () => {
      // Arrange
      const engine = new DecisionEngine(makeRiskGateConfig(true));
      const result = makeDetectorResult({
        suggestedActions: [{ id: 'ORPHAN_TASK_ARCHIVE', label: 'Archive', risk: 'low' }],
      });

      // Act — single-arg call (existing callers) is unaffected
      const outputs = engine.decide(result);

      // Assert
      expect(outputs[0].policy).toBe('autonomous');
    });

    it('risk-gate ON + HIGH-risk: parks normal decisions, preserves safety-floor', () => {
      // Arrange — autopilot would auto-run everything; one normal + one safety-floor
      const engine = new DecisionEngine(makeRiskGateConfig(true, { mode: 'autopilot' }));
      const result = makeDetectorResult({
        suggestedActions: [
          { id: 'ORPHAN_TASK_ARCHIVE', label: 'Archive', risk: 'low' },
          { id: 'KILL_LIVE_SPRINT', label: 'Kill', risk: 'high' },
        ],
      });

      // Act
      const outputs = engine.decide(result, makeRequest(['db-write']));

      // Assert — normal decision parked; safety-floor untouched (already approve)
      expect(outputs).toHaveLength(2);
      const archive = outputs.find((o) => o.action.id === 'ORPHAN_TASK_ARCHIVE');
      const kill = outputs.find((o) => o.action.id === 'KILL_LIVE_SPRINT');
      expect(archive?.policy).toBe('approve');
      expect(archive?.reason).toContain('Risk-gate');
      expect(kill?.policy).toBe('approve');
      expect(kill?.isSafetyFloor).toBe(true);
      expect(kill?.reason).toContain('Safety floor');
    });
  });

  describe('shouldDelay()', () => {
    it('Quiet hours 23:00 (config 22:00-08:00) -> shouldDelay true for info', () => {
      // Arrange
      const engine = new DecisionEngine(
        makeConfig({
          quietHours: { start: '22:00', end: '08:00' },
        }),
      );
      // 23:00 is within 22:00-08:00 quiet window
      const now = new Date('2026-04-20T23:00:00');

      // Act
      const delayed = engine.shouldDelay('info', now);

      // Assert
      expect(delayed).toBe(true);
    });

    it('Quiet hours 23:00 + critical severity -> shouldDelay false (bypass)', () => {
      // Arrange
      const engine = new DecisionEngine(
        makeConfig({
          quietHours: { start: '22:00', end: '08:00' },
        }),
      );
      const now = new Date('2026-04-20T23:00:00');

      // Act
      const delayed = engine.shouldDelay('critical', now);

      // Assert — critical bypasses quiet hours
      expect(delayed).toBe(false);
    });
  });

  describe('isInQuietHours()', () => {
    it('same-day range: 09:00-17:00, now=12:00 -> true', () => {
      const now = new Date('2026-04-20T12:00:00');
      expect(isInQuietHours(now, { start: '09:00', end: '17:00' })).toBe(true);
    });

    it('same-day range: 09:00-17:00, now=18:00 -> false', () => {
      const now = new Date('2026-04-20T18:00:00');
      expect(isInQuietHours(now, { start: '09:00', end: '17:00' })).toBe(false);
    });

    it('wrap-around: 22:00-08:00, now=03:00 -> true (after midnight)', () => {
      const now = new Date('2026-04-20T03:00:00');
      expect(isInQuietHours(now, { start: '22:00', end: '08:00' })).toBe(true);
    });

    it('wrap-around: 22:00-08:00, now=10:00 -> false (after end)', () => {
      const now = new Date('2026-04-20T10:00:00');
      expect(isInQuietHours(now, { start: '22:00', end: '08:00' })).toBe(false);
    });

    it('no quietHours config -> shouldDelay returns false', () => {
      const engine = new DecisionEngine(makeConfig({ quietHours: undefined }));
      expect(engine.shouldDelay('info')).toBe(false);
    });

    it('emergency severity -> shouldDelay false even in quiet hours', () => {
      const engine = new DecisionEngine(
        makeConfig({ quietHours: { start: '00:00', end: '23:59' } }),
      );
      expect(engine.shouldDelay('emergency', new Date('2026-04-20T12:00:00'))).toBe(false);
    });

    it('warning severity in quiet hours -> shouldDelay true', () => {
      const engine = new DecisionEngine(
        makeConfig({ quietHours: { start: '22:00', end: '08:00' } }),
      );
      expect(engine.shouldDelay('warning', new Date('2026-04-20T23:30:00'))).toBe(true);
    });
  });
});
