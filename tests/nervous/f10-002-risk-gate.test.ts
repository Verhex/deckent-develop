// tests/nervous/f10-002-risk-gate.test.ts
//
// F10-002: risk-tagged operation gating wire — hermetic tests.
// Validates resolveRiskClass(verb) classification + DecisionEngine.decide()
// risk-gate flag behaviour (flag-gated default-off).

import { describe, it, expect } from 'vitest';
import { resolveRiskClass } from '../../src/core/work-model.js';
import type { NervousSystemConfigV1 } from '../../src/core/nervous-types.js';
import type { RiskGateRequest } from '../../src/nervous/decision-engine.js';
import { DecisionEngine } from '../../src/nervous/decision-engine.js';
import type { DetectorResult } from '../../src/core/nervous-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type RiskGateConfig = NervousSystemConfigV1 & { risk_gate_enabled?: boolean };

function makeConfig(riskGateEnabled: boolean, mode: NervousSystemConfigV1['mode'] = 'balanced'): RiskGateConfig {
  return { enabled: true, mode, risk_gate_enabled: riskGateEnabled };
}

function makeDetector(actionId = 'ORPHAN_TASK_ARCHIVE'): DetectorResult {
  return {
    risk: 'low',
    shouldNotify: true,
    title: 'Test',
    message: 'f10-002 risk-gate test',
    suggestedActions: [{ id: actionId, label: 'Test action', risk: 'low' }],
  };
}

function makeRequest(capabilityVerb: string): RiskGateRequest {
  return {
    requirements: { capabilities: [], resources: [] },
    capabilityTarget: { capability: capabilityVerb },
  };
}

function makeCapRequest(...caps: Array<import('../../src/core/work-model.js').Capability>): RiskGateRequest {
  return { requirements: { capabilities: caps, resources: [] } };
}

// ─── resolveRiskClass — verb classification ───────────────────────────────────

describe('resolveRiskClass — HIGH-risk verb list', () => {
  it('shell.exec → high (exec verb)', () => {
    expect(resolveRiskClass(makeRequest('shell.exec'))).toBe('high');
  });

  it('erp.write → high (write verb)', () => {
    expect(resolveRiskClass(makeRequest('erp.write'))).toBe('high');
  });

  it('db.write → high (write verb)', () => {
    expect(resolveRiskClass(makeRequest('db.write'))).toBe('high');
  });

  it('mail.send → high (send verb)', () => {
    expect(resolveRiskClass(makeRequest('mail.send'))).toBe('high');
  });

  it('fs.delete → high (delete verb)', () => {
    expect(resolveRiskClass(makeRequest('fs.delete'))).toBe('high');
  });

  it('shell capability → high', () => {
    expect(resolveRiskClass(makeCapRequest('shell'))).toBe('high');
  });

  it('erp-write capability → high', () => {
    expect(resolveRiskClass(makeCapRequest('erp-write'))).toBe('high');
  });

  it('db-write capability → high', () => {
    expect(resolveRiskClass(makeCapRequest('db-write'))).toBe('high');
  });

  it('fs-read capability → low (safe read)', () => {
    expect(resolveRiskClass(makeCapRequest('fs-read'))).toBe('low');
  });

  it('calendar.list → low (list is not a write/send/delete/exec verb)', () => {
    expect(resolveRiskClass(makeRequest('calendar.list'))).toBe('low');
  });
});

// ─── DecisionEngine risk-gate — flag-gated behaviour ─────────────────────────

describe('DecisionEngine.decide() — risk_gate_enabled flag', () => {
  it('flag ON + shell.exec HIGH-risk verb → decision parked (policy=approve)', () => {
    const engine = new DecisionEngine(makeConfig(true));
    const outputs = engine.decide(makeDetector(), makeRequest('shell.exec'));

    expect(outputs).toHaveLength(1);
    // parked = policy escalated to 'approve' (waiting for human acceptance)
    expect(outputs[0].policy).toBe('approve');
    expect(outputs[0].reason).toContain('Risk-gate');
    expect(outputs[0].reason).toContain('approval');
  });

  it('flag ON + db.write HIGH-risk verb → parked', () => {
    const engine = new DecisionEngine(makeConfig(true));
    const outputs = engine.decide(makeDetector(), makeRequest('db.write'));

    expect(outputs[0].policy).toBe('approve');
    expect(outputs[0].reason).toContain('Risk-gate');
  });

  it('flag ON + mail.send HIGH-risk verb → parked', () => {
    const engine = new DecisionEngine(makeConfig(true));
    const outputs = engine.decide(makeDetector(), makeRequest('mail.send'));

    expect(outputs[0].policy).toBe('approve');
  });

  it('flag ON + shell capability HIGH-risk → parked', () => {
    const engine = new DecisionEngine(makeConfig(true));
    const outputs = engine.decide(makeDetector(), makeCapRequest('shell'));

    expect(outputs[0].policy).toBe('approve');
    expect(outputs[0].reason).toContain('Risk-gate');
  });

  it('flag OFF (default) + HIGH-risk shell.exec → mevcut davranış (no gating)', () => {
    const engine = new DecisionEngine(makeConfig(false));
    // ORPHAN_TASK_ARCHIVE is 'autonomous' in balanced mode
    const outputs = engine.decide(makeDetector(), makeRequest('shell.exec'));

    expect(outputs[0].policy).toBe('autonomous');
  });

  it('flag ON + LOW-risk fs-read → no gating (unchanged)', () => {
    const engine = new DecisionEngine(makeConfig(true));
    const outputs = engine.decide(makeDetector(), makeCapRequest('fs-read'));

    // fs-read is low-risk, no gating applied
    expect(outputs[0].policy).toBe('autonomous');
  });

  it('flag ON + no request passed → mevcut davranış (backward-safe)', () => {
    const engine = new DecisionEngine(makeConfig(true));
    // single-arg call — existing callers unaffected
    const outputs = engine.decide(makeDetector());

    expect(outputs[0].policy).toBe('autonomous');
  });

  it('flag ON + HIGH-risk: preserves safety-floor untouched', () => {
    const engine = new DecisionEngine(makeConfig(true, 'autopilot'));
    const detector: DetectorResult = {
      risk: 'high',
      shouldNotify: true,
      title: 'Sprint kill',
      message: 'Safety floor test',
      suggestedActions: [
        { id: 'ORPHAN_TASK_ARCHIVE', label: 'Archive', risk: 'low' },
        { id: 'KILL_LIVE_SPRINT', label: 'Kill sprint', risk: 'high' },
      ],
    };

    const outputs = engine.decide(detector, makeCapRequest('shell'));

    expect(outputs).toHaveLength(2);
    const archive = outputs.find((o) => o.action.id === 'ORPHAN_TASK_ARCHIVE');
    const kill = outputs.find((o) => o.action.id === 'KILL_LIVE_SPRINT');
    // normal action gets parked
    expect(archive?.policy).toBe('approve');
    expect(archive?.reason).toContain('Risk-gate');
    // safety-floor action preserved as-is
    expect(kill?.isSafetyFloor).toBe(true);
    expect(kill?.reason).toContain('Safety floor');
  });
});
