import { describe, it, expect } from 'vitest';
import { evaluateCacheGate } from '../../src/core/limit-ledger-report.js';
import type { UsageRecord } from '../../src/core/limit-ledger.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRecord(
  sessionFile: string,
  ts: string,
  cacheRead: number,
  cacheWrite: number,
): UsageRecord {
  return {
    ts,
    model: 'claude-sonnet-4-6',
    sessionFile,
    projectDir: 'test-project',
    in: 1000,
    out: 200,
    cacheRead,
    cacheWrite,
  };
}

// ─── evaluateCacheGate ────────────────────────────────────────────────────────

describe('evaluateCacheGate', () => {
  it('returns N/A (applicable=false) for a single-session sprint', () => {
    const records = [
      makeRecord('session-A.jsonl', '2026-06-10T10:00:00.000Z', 0, 50000),
      makeRecord('session-A.jsonl', '2026-06-10T10:01:00.000Z', 45000, 100),
    ];
    const taskMap: Record<string, string> = { 'session-A.jsonl': '274-001' };

    const result = evaluateCacheGate(records, taskMap);

    expect(result.applicable).toBe(false);
    expect(result.pass).toBe(false);
    expect(result.warmTaskId).toBeNull();
    expect(result.sessions).toHaveLength(0);
    expect(result.warmShare).toBe(0);
  });

  it('returns N/A when no sessions have a taskMap entry', () => {
    const records = [
      makeRecord('session-A.jsonl', '2026-06-10T10:00:00.000Z', 0, 50000),
      makeRecord('session-B.jsonl', '2026-06-10T10:05:00.000Z', 45000, 100),
    ];
    // taskMap is empty — nothing maps
    const result = evaluateCacheGate(records, {});

    expect(result.applicable).toBe(false);
  });

  it('PASS when all follower sessions read from cache (warm-share=1.0)', () => {
    // Warmer: session-A (earliest), followers: B, C, D all read warm
    const records = [
      makeRecord('session-A.jsonl', '2026-06-10T10:00:00.000Z', 0, 80000),
      makeRecord('session-B.jsonl', '2026-06-10T10:05:00.000Z', 80000, 200),
      makeRecord('session-C.jsonl', '2026-06-10T10:06:00.000Z', 80000, 200),
      makeRecord('session-D.jsonl', '2026-06-10T10:07:00.000Z', 80000, 200),
    ];
    const taskMap: Record<string, string> = {
      'session-A.jsonl': '274-001',
      'session-B.jsonl': '274-002',
      'session-C.jsonl': '274-003',
      'session-D.jsonl': '274-004',
    };

    const result = evaluateCacheGate(records, taskMap);

    expect(result.applicable).toBe(true);
    expect(result.pass).toBe(true);
    expect(result.warmTaskId).toBe('274-001');
    expect(result.warmShare).toBe(1);
    expect(result.sessions).toHaveLength(4);
    // Warmer readsWarm is always false
    expect(result.sessions[0]!.readsWarm).toBe(false);
    // All followers read warm
    expect(result.sessions[1]!.readsWarm).toBe(true);
    expect(result.sessions[2]!.readsWarm).toBe(true);
    expect(result.sessions[3]!.readsWarm).toBe(true);
  });

  it('FAIL when no follower sessions read from cache (warm-share=0.0)', () => {
    const records = [
      makeRecord('session-A.jsonl', '2026-06-10T10:00:00.000Z', 0, 80000),
      makeRecord('session-B.jsonl', '2026-06-10T10:05:00.000Z', 0, 80000),
      makeRecord('session-C.jsonl', '2026-06-10T10:06:00.000Z', 100, 80000),
    ];
    const taskMap: Record<string, string> = {
      'session-A.jsonl': '274-001',
      'session-B.jsonl': '274-002',
      'session-C.jsonl': '274-003',
    };

    const result = evaluateCacheGate(records, taskMap);

    expect(result.applicable).toBe(true);
    expect(result.pass).toBe(false);
    expect(result.warmShare).toBe(0);
  });

  it('FAIL when warm-share is 0.75 (below 0.8 threshold)', () => {
    // 3 of 4 followers read warm → 0.75
    const records = [
      makeRecord('session-A.jsonl', '2026-06-10T10:00:00.000Z', 0, 80000),
      makeRecord('session-B.jsonl', '2026-06-10T10:01:00.000Z', 80000, 200),
      makeRecord('session-C.jsonl', '2026-06-10T10:02:00.000Z', 80000, 200),
      makeRecord('session-D.jsonl', '2026-06-10T10:03:00.000Z', 80000, 200),
      makeRecord('session-E.jsonl', '2026-06-10T10:04:00.000Z', 0, 80000), // cold
    ];
    const taskMap: Record<string, string> = {
      'session-A.jsonl': '274-001',
      'session-B.jsonl': '274-002',
      'session-C.jsonl': '274-003',
      'session-D.jsonl': '274-004',
      'session-E.jsonl': '274-005',
    };

    const result = evaluateCacheGate(records, taskMap);

    expect(result.applicable).toBe(true);
    expect(result.pass).toBe(false);
    expect(result.warmShare).toBe(0.75);
  });

  it('PASS when warm-share is exactly 0.8 (4 of 5 followers)', () => {
    // 4 of 5 followers read warm → 0.80 → PASS
    const records = [
      makeRecord('session-W.jsonl', '2026-06-10T10:00:00.000Z', 0, 80000), // warmer
      makeRecord('session-A.jsonl', '2026-06-10T10:01:00.000Z', 80000, 200),
      makeRecord('session-B.jsonl', '2026-06-10T10:02:00.000Z', 80000, 200),
      makeRecord('session-C.jsonl', '2026-06-10T10:03:00.000Z', 80000, 200),
      makeRecord('session-D.jsonl', '2026-06-10T10:04:00.000Z', 80000, 200),
      makeRecord('session-E.jsonl', '2026-06-10T10:05:00.000Z', 0, 80000), // cold
    ];
    const taskMap: Record<string, string> = {
      'session-W.jsonl': '274-001',
      'session-A.jsonl': '274-002',
      'session-B.jsonl': '274-003',
      'session-C.jsonl': '274-004',
      'session-D.jsonl': '274-005',
      'session-E.jsonl': '274-006',
    };

    const result = evaluateCacheGate(records, taskMap);

    expect(result.applicable).toBe(true);
    expect(result.pass).toBe(true);
    expect(result.warmShare).toBe(0.8);
  });

  it('selects the chronologically earliest session as the warmer', () => {
    // session-B has an earlier ts than session-A despite appearing later in array
    const records = [
      makeRecord('session-A.jsonl', '2026-06-10T11:00:00.000Z', 0, 80000),
      makeRecord('session-B.jsonl', '2026-06-10T09:00:00.000Z', 0, 80000), // earlier
    ];
    const taskMap: Record<string, string> = {
      'session-A.jsonl': '274-002',
      'session-B.jsonl': '274-001',
    };

    const result = evaluateCacheGate(records, taskMap);

    expect(result.applicable).toBe(true);
    // session-B (earlier ts) should be the warmer
    expect(result.warmTaskId).toBe('274-001');
    expect(result.sessions[0]!.taskId).toBe('274-001');
  });

  it('correctly uses only first call of each session for the gate check', () => {
    // session-B first call is cold (cr < cw), second call is warm — gate should see COLD
    const records = [
      makeRecord('session-A.jsonl', '2026-06-10T10:00:00.000Z', 0, 80000),
      // session-B first call (cold), second call (warm) — only first matters
      makeRecord('session-B.jsonl', '2026-06-10T10:05:00.000Z', 100, 80000), // cold first
      makeRecord('session-B.jsonl', '2026-06-10T10:10:00.000Z', 80000, 100), // warm second
    ];
    const taskMap: Record<string, string> = {
      'session-A.jsonl': '274-001',
      'session-B.jsonl': '274-002',
    };

    const result = evaluateCacheGate(records, taskMap);

    expect(result.applicable).toBe(true);
    expect(result.pass).toBe(false); // first call was cold
    expect(result.sessions[1]!.firstCallCr).toBe(100);
    expect(result.sessions[1]!.firstCallCw).toBe(80000);
    expect(result.sessions[1]!.readsWarm).toBe(false);
  });

  it('skips sessions not present in taskMap', () => {
    // session-C has no taskId mapping — should be ignored
    const records = [
      makeRecord('session-A.jsonl', '2026-06-10T10:00:00.000Z', 0, 80000),
      makeRecord('session-B.jsonl', '2026-06-10T10:05:00.000Z', 80000, 200),
      makeRecord('session-C.jsonl', '2026-06-10T10:06:00.000Z', 0, 80000), // unmapped
    ];
    const taskMap: Record<string, string> = {
      'session-A.jsonl': '274-001',
      'session-B.jsonl': '274-002',
      // session-C.jsonl deliberately absent
    };

    const result = evaluateCacheGate(records, taskMap);

    expect(result.applicable).toBe(true);
    expect(result.sessions).toHaveLength(2); // only A and B
    expect(result.sessions.some((s) => s.taskId === '274-001')).toBe(true);
    expect(result.sessions.some((s) => s.taskId === '274-002')).toBe(true);
  });
});
