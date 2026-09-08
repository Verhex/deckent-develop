import { describe, expect, it } from 'vitest';
import { resolvePlannerEvidenceRefusal } from '../../src/core/planner-evidence-refusal.js';

describe('resolvePlannerEvidenceRefusal', () => {
  it.each([
    ['PLANNER_EVIDENCE_HOLD', 'hold', 'inspect-evidence'],
    ['EXACT_START_PLANNER_EVIDENCE_HOLD', 'hold', 'inspect-evidence'],
    ['PLANNER_EVIDENCE_REPLAN_REQUIRED', 'replan-required', 'replan'],
    ['EXACT_START_PLANNER_EVIDENCE_REPLAN_REQUIRED', 'replan-required', 'replan'],
  ] as const)('classifies %s without exposing diagnostics', (code, kind, nextAction) => {
    const error = Object.assign(new Error('hostile raw message /secret/path'), {
      code,
      cause: new Error('raw cause'),
      stack: 'raw stack',
    });

    expect(resolvePlannerEvidenceRefusal(error)).toEqual({ code, kind, nextAction });
  });

  it.each([
    null,
    undefined,
    'PLANNER_EVIDENCE_HOLD',
    1,
    {},
    { code: 'UNKNOWN' },
    { code: 'constructor' },
    { code: 'toString' },
    { code: '__proto__' },
    { code: 'PLANNER_EVIDENCE_HOLD\nFORGED' },
    Object.defineProperty({}, 'code', { get: () => 'PLANNER_EVIDENCE_HOLD' }),
  ])('rejects an unknown or malformed value without reading accessors', (value) => {
    expect(resolvePlannerEvidenceRefusal(value)).toBeNull();
  });
});
