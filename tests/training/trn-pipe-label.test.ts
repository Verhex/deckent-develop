// tests/training/trn-pipe-label.test.ts
//
// Sprint 358, Task 358-009 TRN-PIPE-WIRE — wires src/training/pipeline.ts's
// `labels.outcome` through the RunOutcomeLabel taxonomy (src/core/trace-labels.ts,
// Task 357-012 TRN-LABEL) instead of passing the raw selfAssessment string
// through unchanged. Covers: the 5 known TaskEvaluation values map to their 5
// correct labels, and an unknown/legacy value passes through unchanged (never
// dishonestly folded into 'failed'). Field name `outcome` is unchanged
// (ShareGPT consumers) — only the value is normalized.

import { describe, it, expect } from 'vitest';
import { convertToShareGpt, type TraceLike } from '../../src/training/pipeline.js';
import { RunOutcomeLabelSchema, type RunOutcomeLabel } from '../../src/core/trace-labels.js';
import type { OpenAiMessage, TraceMeta } from '../../src/agent/trace-recorder.js';

function makeTrace(selfAssessment: string): TraceLike {
  const messages: OpenAiMessage[] = [
    { role: 'system', content: 'S' },
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'yo' },
  ];
  const meta: Partial<TraceMeta> = {
    source: 'sprint-worker',
    model: 'claude-sonnet-5',
    ts: '2026-07-02T00:00:00.000Z',
    selfAssessment,
  };
  return { messages, meta };
}

describe('convertToShareGpt — outcome label taxonomy wiring (TRN-PIPE-WIRE)', () => {
  const knownCases: Array<[string, RunOutcomeLabel]> = [
    ['DONE', 'success'],
    ['GO_WITH_TECH_DEBT', 'partial'],
    ['NO_GO', 'failed'],
    ['DEFERRED', 'cancelled'],
    ['NOT_DISPATCHED', 'not_dispatched'],
  ];

  it.each(knownCases)('selfAssessment %s -> labels.outcome %s', (selfAssessment, expected) => {
    const example = convertToShareGpt(makeTrace(selfAssessment));
    expect(example.labels?.outcome).toBe(expected);
  });

  it('every known-case output is a valid RunOutcomeLabel per the taxonomy schema', () => {
    for (const [selfAssessment] of knownCases) {
      const example = convertToShareGpt(makeTrace(selfAssessment));
      expect(() => RunOutcomeLabelSchema.parse(example.labels?.outcome)).not.toThrow();
    }
  });

  it('field name stays `outcome` (ShareGPT consumers) — never renamed', () => {
    const example = convertToShareGpt(makeTrace('DONE'));
    expect(example.labels).toHaveProperty('outcome');
    expect(Object.keys(example.labels ?? {})).toContain('outcome');
  });

  // ─── unknown / legacy selfAssessment — mapper's closed union doesn't accept it ──

  it('unknown/legacy selfAssessment value passes through unchanged (not mapped)', () => {
    const example = convertToShareGpt(makeTrace('LEGACY_STATUS_V0'));
    expect(example.labels?.outcome).toBe('LEGACY_STATUS_V0');
  });

  it('unknown/legacy selfAssessment value is never dishonestly folded into "failed"', () => {
    const legacyValues = ['LEGACY_STATUS_V0', 'unknown', 'PENDING', ''];
    for (const value of legacyValues) {
      const example = convertToShareGpt(makeTrace(value));
      expect(example.labels?.outcome).not.toBe('failed');
      expect(example.labels?.outcome).toBe(value);
    }
  });

  it('a real NO_GO still maps honestly to "failed" (unlike passthrough unknowns)', () => {
    const example = convertToShareGpt(makeTrace('NO_GO'));
    expect(example.labels?.outcome).toBe('failed');
  });
});
