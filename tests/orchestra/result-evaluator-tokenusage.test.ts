/**
 * Sprint 273 — Task 5
 * Tests that tokenUsage is an optional self-estimate and never causes NO_GO.
 * Ground-truth token accounting comes from the transcript ledger (limit-ledger).
 */
import { describe, it, expect } from 'vitest';
import { validateTokenUsage } from '../../src/orchestra/result-evaluator.js';
import type { TaskResult } from '../../src/core/types.js';

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '273-005',
    filesChanged: ['src/orchestra/result-evaluator.ts'],
    linesAdded: 10,
    linesRemoved: 5,
    testsPassed: true,
    selfAssessment: 'DONE',
    notes: 'test',
    ...overrides,
  } as TaskResult;
}

describe('validateTokenUsage — Sprint 273 optional self-estimate contract', () => {
  it('missing tokenUsage: warning does NOT contain "will reject as NO_GO"', () => {
    const result = makeResult({ tokenUsage: undefined });
    const validation = validateTokenUsage(result);
    expect(validation.tokenUsageMissing).toBe(true);
    // The old phrase "will reject as NO_GO" must be gone — it was a false contract
    for (const w of validation.warnings) {
      expect(w).not.toMatch(/will reject as NO_GO/i);
    }
  });

  it('missing tokenUsage: warning mentions "self-estimate" and "limit-ledger"', () => {
    const result = makeResult({ tokenUsage: undefined });
    const { warnings } = validateTokenUsage(result);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    const combined = warnings.join(' ');
    expect(combined).toMatch(/self-estimate/i);
    expect(combined).toMatch(/limit-ledger/i);
  });

  it('complete tokenUsage: isComplete=true, no warnings', () => {
    const result = makeResult({
      tokenUsage: {
        inputTokens: 1000,
        outputTokens: 200,
        cacheReadTokens: 5000,
        provider: 'claude',
        model: 'sonnet',
      },
    });
    const { isComplete, warnings, tokenUsageMissing } = validateTokenUsage(result);
    expect(isComplete).toBe(true);
    expect(warnings).toHaveLength(0);
    expect(tokenUsageMissing).toBe(false);
  });

  it('legacy .result with tokenUsage is still accepted (backward compat)', () => {
    // Old results that DO include tokenUsage must still validate correctly
    const result = makeResult({
      tokenUsage: {
        inputTokens: 15420,
        outputTokens: 3200,
        cacheReadTokens: 89000,
        provider: 'claude',
        model: 'opus',
      },
    });
    const validation = validateTokenUsage(result);
    expect(validation.isComplete).toBe(true);
    expect(validation.warnings).toHaveLength(0);
    expect(validation.tokenUsageMissing).toBe(false);
  });

  it('partial tokenUsage (missing provider/model): isComplete=false with field-specific warnings', () => {
    const result = makeResult({
      tokenUsage: { inputTokens: 500, outputTokens: 100 } as unknown as TaskResult['tokenUsage'],
    });
    const { isComplete, warnings, tokenUsageMissing } = validateTokenUsage(result);
    expect(isComplete).toBe(false);
    expect(tokenUsageMissing).toBe(false);
    const combined = warnings.join(' ');
    expect(combined).toMatch(/provider/i);
    expect(combined).toMatch(/model/i);
  });
});
