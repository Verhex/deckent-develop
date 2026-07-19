// ─── Worker Output Contract — Result spine tests (Sprint 326 326-001) ────────
// Faithful behavior tests for the versioned, Zod-validated result contract
// (spec §1.2): the schema's required/defaulted shape, the non-throwing
// validateTaskResult() discriminated result, and reachability via ./types.js.
import { describe, it, expect } from 'vitest';
import {
  taskResultSchema,
  validateTaskResult,
  TASK_RESULT_SCHEMA_VERSION,
  type TaskResultV1,
} from '../../src/core/task-result-schema.js';
// Reachability of the single-source re-export (the wipe that prompted this xfix
// removed exactly this surface from types.ts — guard it with a real import).
import {
  validateTaskResult as validateViaTypes,
  TASK_RESULT_SCHEMA_VERSION as VERSION_VIA_TYPES,
} from '../../src/core/types.js';

/** A minimal result carrying every REQUIRED field (defaulted fields omitted). */
function validResult(): Record<string, unknown> {
  return {
    taskId: '326-001',
    workerId: 'w-326-001',
    provider: 'claude',
    model: 'opus',
    filesChanged: [
      { path: 'src/core/task-result-schema.ts', status: 'added', linesAdded: 212, linesRemoved: 0 },
    ],
    totalLinesAdded: 212,
    totalLinesRemoved: 0,
    tokenUsage: {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      source: 'provider-adapter',
    },
    cost: { usd: 0.42, pricingSource: 'model-registry' },
    tests: { passed: 7, failed: 0, total: 7 },
    tsc: { clean: true, errors: 0 },
    selfAssessment: 'DONE',
  };
}

describe('task-result-schema (Worker Output Contract spine)', () => {
  it('rejects an empty object and lists every required field as missing', () => {
    const res = validateTaskResult({});
    expect(res.ok).toBe(false);
    if (res.ok) return; // narrow for TS
    for (const field of [
      'taskId',
      'workerId',
      'provider',
      'model',
      'filesChanged',
      'totalLinesAdded',
      'totalLinesRemoved',
      'tokenUsage',
      'cost',
      'tests',
      'tsc',
      'selfAssessment',
    ]) {
      expect(res.missingFields).toContain(field);
    }
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('accepts a full valid result and stamps schemaVersion + downstream defaults', () => {
    const res = validateTaskResult(validResult());
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.errors.join('; '));
    const value: TaskResultV1 = res.value;
    expect(value.schemaVersion).toBe('1.0');
    // defaulted-downstream fields are populated so a fresh result validates pre-evaluation
    expect(value.goCriteria).toEqual([]);
    expect(value.skills).toEqual([]);
    expect(value.honestGate).toEqual({ flagged: false, violation: null });
    expect(value.brainEvaluation).toBeNull();
    expect(value.auditorValidation).toBeNull();
    expect(value.diskVerified).toBe(false);
    expect(value.boundaryViolations).toEqual([]);
    // tokenUsage cache fields default to 0
    expect(value.tokenUsage.cacheReadTokens).toBe(0);
    expect(value.tokenUsage.cacheCreationTokens).toBe(0);
    // cost currency/isLocal defaults
    expect(value.cost.currency).toBe('USD');
    expect(value.cost.isLocal).toBe(false);
  });

  it('defaults schemaVersion to 1.0 when omitted', () => {
    const res = taskResultSchema.safeParse(validResult());
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.schemaVersion).toBe(TASK_RESULT_SCHEMA_VERSION);
    expect(TASK_RESULT_SCHEMA_VERSION).toBe('1.0');
  });

  it('preserves provider-native cross-verify evidence through canonical validation', () => {
    const crossVerify = {
      outcome: 'confirmed',
      verifier: 'codex',
      verifierModel: 'gpt-4.1',
      verdict: 'confirmed',
      reason: 'independent checks passed',
    };
    const res = validateTaskResult({ ...validResult(), crossVerify });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.crossVerify).toEqual(crossVerify);
  });

  it('preserves unavailable cross-verify evidence without fabricating a verifier', () => {
    const crossVerify = {
      outcome: 'unavailable',
      reason: 'no-second-provider',
    };
    const res = validateTaskResult({ ...validResult(), crossVerify });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.crossVerify).toEqual(crossVerify);
  });

  it('rejects an unknown selfAssessment verdict (enum-guarded)', () => {
    const res = validateTaskResult({ ...validResult(), selfAssessment: 'MAYBE' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    // a bad enum value is an INVALID value, not a MISSING field
    expect(res.missingFields).not.toContain('selfAssessment');
    expect(res.errors.some((e) => e.startsWith('selfAssessment:'))).toBe(true);
  });

  it('treats a malformed nested value as an error, never as a missing field', () => {
    const bad = validResult();
    (bad.tokenUsage as Record<string, unknown>).inputTokens = -5; // nonnegative violated
    const res = validateTaskResult(bad);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.missingFields).not.toContain('tokenUsage.inputTokens');
    expect(res.errors.some((e) => e.startsWith('tokenUsage.inputTokens:'))).toBe(true);
  });

  it('flags a missing required sub-field with its dotted path', () => {
    const bad = validResult();
    delete (bad.tokenUsage as Record<string, unknown>).source;
    const res = validateTaskResult(bad);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.missingFields).toContain('tokenUsage.source');
  });

  it('is reachable as the single-source re-export from ./types.js', () => {
    expect(VERSION_VIA_TYPES).toBe('1.0');
    const res = validateViaTypes(validResult());
    expect(res.ok).toBe(true);
  });
});
