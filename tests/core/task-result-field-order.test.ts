// Owner decision 2026-08-25: `.result` files must be human-readable — identity
// → verdict → narrative → evidence → change → plumbing → cost. These pins keep
// every flat task-result disk write behind the single canonical serializer.
import { describe, expect, it } from 'vitest';
import {
  TASK_RESULT_FIELD_ORDER,
  canonicalizeTaskResultFieldOrder,
  serializeTaskResultForDisk,
} from '../../src/core/task-result-schema.js';

describe('task-result canonical field order', () => {
  it('puts the verdict cluster before assignment plumbing and cost', () => {
    const messy = {
      tokenUsage: { total: 1 },
      workerId: 'w-1',
      provider: 'p',
      model: 'm',
      notes: 'n',
      selfAssessment: 'DONE',
      taskId: '674-001',
      brainEvaluation: 'DONE',
      schemaVersion: '1.0',
    };
    const keys = Object.keys(canonicalizeTaskResultFieldOrder(messy));
    const at = (k: string) => keys.indexOf(k);
    expect(at('schemaVersion')).toBe(0);
    expect(at('taskId')).toBeLessThan(at('selfAssessment'));
    expect(at('selfAssessment')).toBeLessThan(at('notes'));
    expect(at('notes')).toBeLessThan(at('workerId'));
    expect(at('workerId')).toBeLessThan(at('tokenUsage'));
  });

  it('preserves unknown fields at the end in original relative order, losslessly', () => {
    const input = {
      zzFutureField: 1,
      taskId: 't',
      aaAnotherFuture: 2,
      selfAssessment: 'NO_GO',
    };
    const ordered = canonicalizeTaskResultFieldOrder(input);
    const keys = Object.keys(ordered);
    expect(keys.slice(-2)).toEqual(['zzFutureField', 'aaAnotherFuture']);
    expect(ordered).toEqual(input);
  });

  it('serializes to 2-space JSON whose parse round-trips data-equal', () => {
    const input = { notes: 'x', taskId: 't', selfAssessment: 'DONE', custom: { a: 1 } };
    const text = serializeTaskResultForDisk(input);
    expect(text.startsWith('{\n  "')).toBe(true);
    expect(JSON.parse(text)).toEqual(input);
    expect(text.indexOf('"taskId"')).toBeLessThan(text.indexOf('"selfAssessment"'));
    expect(text.indexOf('"selfAssessment"')).toBeLessThan(text.indexOf('"notes"'));
  });

  it('order list has no duplicates', () => {
    expect(new Set(TASK_RESULT_FIELD_ORDER).size).toBe(TASK_RESULT_FIELD_ORDER.length);
  });
});
