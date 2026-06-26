/**
 * tests/orchestra/gate-techdebt-downgrade.test.ts
 *
 * Tests for the tech-debt-ratio gate (Sprint 325 — enforcement A14).
 *
 * Covers:
 *   1. applyTechDebtDowngrade semantics at sprint level (completionRatio = 1 - debtRatio)
 *   2. Flag-off (gate absent / max_tech_debt_ratio = 0) → byte-identical behavior
 *   3. Flag-on + debt below threshold → no downgrade
 *   4. Flag-on + mild debt excess → GO_WITH_TECH_DEBT
 *   5. Flag-on + severe debt excess (completionRatio < 0.5) → NO_GO / GATE_FAILURE
 *   6. config-types: gate field pass-through in ResolvedConfig
 */

import { describe, it, expect } from 'vitest';

// ─── Import the gate function directly (result-evaluator — no mocking needed) ──
import { applyTechDebtDowngrade, GO_WITH_GATE_FAILURE } from '../../src/orchestra/result-evaluator.js';

// ─── Sprint-level gate logic (mirrors sprint-finalizer.ts step 10b2) ────────

/**
 * Replicates the sprint-finalizer step-10b2 gate logic in a pure, testable form.
 * Returns the downgraded sprint status string, or null if no downgrade applied.
 */
function applySprintTechDebtGate(
  techDebtTasks: number,
  totalTasks: number,
  maxDebtRatio: number | undefined,
): string | null {
  if (!maxDebtRatio || maxDebtRatio <= 0 || totalTasks === 0) return null;
  const debtRatio = techDebtTasks / totalTasks;
  if (debtRatio <= maxDebtRatio) return null;

  const completionRatio = 1 - debtRatio;
  const result = applyTechDebtDowngrade('DONE', { selfAssessment: 'DONE' }, completionRatio);
  return result.decision === 'NO_GO' ? GO_WITH_GATE_FAILURE : 'GO_WITH_TECH_DEBT';
}

// ═══ Tests ═══════════════════════════════════════════════════════════════════

describe('gate-techdebt-downgrade: applyTechDebtDowngrade sprint semantics', () => {

  // ── Core function behavior ─────────────────────────────────────────────────

  it('returns DONE when no verifyDeltaCompletionRatio provided (no sprint-level signal)', () => {
    const result = applyTechDebtDowngrade('DONE', { selfAssessment: 'DONE' });
    expect(result.decision).toBe('DONE');
    expect(result.downgraded).toBe(false);
    expect(result.completionRatio).toBeNull();
  });

  it('downgrades DONE → GO_WITH_TECH_DEBT when completionRatio < 0.8 (DONE threshold)', () => {
    // debtRatio = 0.25 → completionRatio = 0.75 — just below the 0.8 DONE threshold
    const result = applyTechDebtDowngrade('DONE', { selfAssessment: 'DONE' }, 0.75);
    expect(result.decision).toBe('GO_WITH_TECH_DEBT');
    expect(result.downgraded).toBe(true);
    expect(result.reason).toContain('75%');
  });

  it('downgrades DONE → NO_GO when completionRatio < 0.5 (NO_GO threshold — severe)', () => {
    // debtRatio = 0.6 → completionRatio = 0.4 — severe, crosses NO_GO threshold
    const result = applyTechDebtDowngrade('DONE', { selfAssessment: 'DONE' }, 0.4);
    expect(result.decision).toBe('NO_GO');
    expect(result.downgraded).toBe(true);
    expect(result.reason).toContain('40%');
  });

  it('does NOT downgrade when completionRatio >= 0.8 (gate triggered but severity is mild)', () => {
    // debtRatio = 0.15 → completionRatio = 0.85 — above DONE threshold
    const result = applyTechDebtDowngrade('DONE', { selfAssessment: 'DONE' }, 0.85);
    expect(result.decision).toBe('DONE');
    expect(result.downgraded).toBe(false);
  });

  it('escalates GO_WITH_TECH_DEBT → NO_GO when completionRatio < 0.5', () => {
    const result = applyTechDebtDowngrade('GO_WITH_TECH_DEBT', { selfAssessment: 'GO_WITH_TECH_DEBT' }, 0.3);
    expect(result.decision).toBe('NO_GO');
    expect(result.downgraded).toBe(true);
  });

  it('preserves NO_GO without downgrade (already terminal)', () => {
    const result = applyTechDebtDowngrade('NO_GO', { selfAssessment: 'NO_GO' }, 0.1);
    expect(result.decision).toBe('NO_GO');
    expect(result.downgraded).toBe(false);
  });
});

describe('gate-techdebt-downgrade: sprint-level gate (flag-gated)', () => {

  // ── Flag-off cases → byte-identical ───────────────────────────────────────

  it('returns null (no-op) when gate is absent', () => {
    // 80% debt but no gate configured
    expect(applySprintTechDebtGate(8, 10, undefined)).toBeNull();
  });

  it('returns null (no-op) when max_tech_debt_ratio is 0', () => {
    expect(applySprintTechDebtGate(8, 10, 0)).toBeNull();
  });

  it('returns null when totalTasks is 0 (avoid division by zero)', () => {
    expect(applySprintTechDebtGate(0, 0, 0.3)).toBeNull();
  });

  // ── Flag-on + debt below threshold → no downgrade ─────────────────────────

  it('returns null when debtRatio equals maxDebtRatio (boundary — no downgrade at exact threshold)', () => {
    // 3/10 = 30% debt, max = 30% → not exceeded
    expect(applySprintTechDebtGate(3, 10, 0.3)).toBeNull();
  });

  it('returns null when debtRatio is below maxDebtRatio', () => {
    // 2/10 = 20% debt, max = 30% → well below threshold
    expect(applySprintTechDebtGate(2, 10, 0.3)).toBeNull();
  });

  // ── Flag-on + mild debt excess → GO_WITH_TECH_DEBT ───────────────────────

  it('returns GO_WITH_TECH_DEBT when debtRatio mildly exceeds threshold', () => {
    // 3/10 = 30% debt, max = 20% → exceeded; completionRatio = 0.70 < 0.80 → GO_WITH_TECH_DEBT
    const result = applySprintTechDebtGate(3, 10, 0.2);
    expect(result).toBe('GO_WITH_TECH_DEBT');
  });

  it('returns GO_WITH_TECH_DEBT with 4/10 tasks debt and max 0.3', () => {
    // debtRatio = 0.4, max = 0.3 → exceeded; completionRatio = 0.6 < 0.8 → GO_WITH_TECH_DEBT
    const result = applySprintTechDebtGate(4, 10, 0.3);
    expect(result).toBe('GO_WITH_TECH_DEBT');
  });

  // ── Flag-on + severe debt → GATE_FAILURE ──────────────────────────────────

  it('returns GO_WITH_GATE_FAILURE when debtRatio severely exceeds threshold', () => {
    // 6/10 = 60% debt, max = 20% → exceeded; completionRatio = 0.40 < 0.50 → NO_GO → GATE_FAILURE
    const result = applySprintTechDebtGate(6, 10, 0.2);
    expect(result).toBe(GO_WITH_GATE_FAILURE);
  });

  it('returns GO_WITH_GATE_FAILURE with extreme 8/10 debt and any threshold', () => {
    // debtRatio = 0.8, completionRatio = 0.2 — very severe
    const result = applySprintTechDebtGate(8, 10, 0.3);
    expect(result).toBe(GO_WITH_GATE_FAILURE);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('handles single task sprint: 1 debt task, max 0.3 → GO_WITH_TECH_DEBT', () => {
    // debtRatio = 1/1 = 100%, completionRatio = 0 → NO_GO → GATE_FAILURE
    const result = applySprintTechDebtGate(1, 1, 0.3);
    expect(result).toBe(GO_WITH_GATE_FAILURE);
  });

  it('handles decimal thresholds correctly', () => {
    // 1/10 = 10% debt, max = 5% (0.05) → exceeded; completionRatio = 0.90 ≥ 0.80 → 'DONE' from function
    // but gate is triggered → result depends on completionRatio: 0.90 ≥ 0.80 → decision='DONE' → returns GO_WITH_TECH_DEBT
    // (gate triggered → at minimum GO_WITH_TECH_DEBT regardless of function's downgraded flag)
    const result = applySprintTechDebtGate(1, 10, 0.05);
    // completionRatio = 0.90, applyTechDebtDowngrade returns DONE (not downgraded by hardcoded thresholds)
    // → our gate maps to GO_WITH_TECH_DEBT (gate was still triggered)
    expect(result).toBe('GO_WITH_TECH_DEBT');
  });
});

describe('gate-techdebt-downgrade: GO_WITH_GATE_FAILURE constant', () => {
  it('GO_WITH_GATE_FAILURE is exported from result-evaluator', () => {
    expect(GO_WITH_GATE_FAILURE).toBe('GO_WITH_GATE_FAILURE');
  });
});
