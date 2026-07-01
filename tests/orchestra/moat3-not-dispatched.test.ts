// ─── MOAT-3 NOT_DISPATCHED Honest-State Tests (Sprint 351 Task 351-008) ──
//
// MOAT-3: the synthetic-NO_GO trust problem, live in sprint-347/348 — when
// spawn/dispatch never happened for a task (spawn-fail, container never
// started), it still ended up looking like a worker "NO_GO", a lie, since
// no worker ever ran to actually fail. This suite covers the disk-evidence
// classifier that distinguishes "dispatch never happened" (NOT_DISPATCHED)
// from a real worker crash/timeout (existing synthetic NO_GO, unchanged)
// from a normal worker-produced NO_GO (unaffected), plus the FIX-phase
// re-dispatch-candidate classification and the summary counter.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  classifyMissingResultDispatch,
  gatherDispatchTraceEvidence,
  classifyFixPhaseTasks,
  collectNotDispatchedStats,
  type DispatchTraceEvidence,
} from '../../src/orchestra/result-evaluator.js';
import { TaskEvaluation } from '../../src/core/types.js';

// ─── Scenario 0 — enum surface ────────────────────────────────────────────

describe('TaskEvaluation.NOT_DISPATCHED — enum surface', () => {
  it('exposes NOT_DISPATCHED alongside legacy members', () => {
    expect(TaskEvaluation.NOT_DISPATCHED).toBe('NOT_DISPATCHED');
  });

  it('is distinct from every other evaluation value', () => {
    expect(TaskEvaluation.NOT_DISPATCHED).not.toBe(TaskEvaluation.NO_GO);
    expect(TaskEvaluation.NOT_DISPATCHED).not.toBe(TaskEvaluation.DONE);
    expect(TaskEvaluation.NOT_DISPATCHED).not.toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
    expect(TaskEvaluation.NOT_DISPATCHED).not.toBe(TaskEvaluation.DEFERRED);
  });
});

// ─── Scenario 1 — dispatch-yok (never dispatched) → NOT_DISPATCHED ───────

describe('classifyMissingResultDispatch — Scenario 1: dispatch-yok', () => {
  it('classifies NOT_DISPATCHED when .result, .hb and .log are all absent', () => {
    const evidence: DispatchTraceEvidence = {
      hasResultFile: false,
      hasHeartbeatFile: false,
      hasLogFile: false,
    };
    expect(classifyMissingResultDispatch(evidence)).toBe('NOT_DISPATCHED');
  });
});

// ─── Scenario 2 — worker-öldü-izli (worker died, trace present) → synthetic NO_GO ──

describe('classifyMissingResultDispatch — Scenario 2: worker-died-with-trace', () => {
  it('classifies SYNTHETIC_NO_GO when a stale .hb exists (worker started, then died)', () => {
    const evidence: DispatchTraceEvidence = {
      hasResultFile: false,
      hasHeartbeatFile: true,
      hasLogFile: false,
    };
    expect(classifyMissingResultDispatch(evidence)).toBe('SYNTHETIC_NO_GO');
  });

  it('classifies SYNTHETIC_NO_GO when a .log exists but no .hb (log-only trace)', () => {
    const evidence: DispatchTraceEvidence = {
      hasResultFile: false,
      hasHeartbeatFile: false,
      hasLogFile: true,
    };
    expect(classifyMissingResultDispatch(evidence)).toBe('SYNTHETIC_NO_GO');
  });

  it('classifies SYNTHETIC_NO_GO when both .hb and .log exist', () => {
    const evidence: DispatchTraceEvidence = {
      hasResultFile: false,
      hasHeartbeatFile: true,
      hasLogFile: true,
    };
    expect(classifyMissingResultDispatch(evidence)).toBe('SYNTHETIC_NO_GO');
  });
});

// ─── Scenario 3 — normal-NO_GO (a real .result exists) → classifier is a no-op ──

describe('classifyMissingResultDispatch — Scenario 3: normal-NO_GO guard', () => {
  it('defers to SYNTHETIC_NO_GO (guard) when a .result file is present', () => {
    // A task with a real .result (worker ran, self-reported NO_GO) never
    // reaches this classifier in production — the guard exists so a
    // misuse never mislabels a genuine worker-reported failure.
    const evidence: DispatchTraceEvidence = {
      hasResultFile: true,
      hasHeartbeatFile: false,
      hasLogFile: false,
    };
    expect(classifyMissingResultDispatch(evidence)).toBe('SYNTHETIC_NO_GO');
  });
});

// ─── gatherDispatchTraceEvidence — disk I/O wrapper ──────────────────────

describe('gatherDispatchTraceEvidence', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-moat3-'));
    mkdirSync(join(tmpRoot, '.tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('reports all-false when no trace files exist on disk', () => {
    const evidence = gatherDispatchTraceEvidence(tmpRoot, '351-999');
    expect(evidence).toEqual({
      hasResultFile: false,
      hasHeartbeatFile: false,
      hasLogFile: false,
    });
    expect(classifyMissingResultDispatch(evidence)).toBe('NOT_DISPATCHED');
  });

  it('detects an existing .hb file as worker-start trace', () => {
    writeFileSync(join(tmpRoot, '.tasks', 'task-351-999.hb'), '{}', 'utf-8');
    const evidence = gatherDispatchTraceEvidence(tmpRoot, '351-999');
    expect(evidence.hasHeartbeatFile).toBe(true);
    expect(evidence.hasResultFile).toBe(false);
    expect(evidence.hasLogFile).toBe(false);
    expect(classifyMissingResultDispatch(evidence)).toBe('SYNTHETIC_NO_GO');
  });

  it('detects an existing .log file as worker-start trace', () => {
    writeFileSync(join(tmpRoot, '.tasks', 'task-351-999.log'), 'starting up...', 'utf-8');
    const evidence = gatherDispatchTraceEvidence(tmpRoot, '351-999');
    expect(evidence.hasLogFile).toBe(true);
    expect(classifyMissingResultDispatch(evidence)).toBe('SYNTHETIC_NO_GO');
  });

  it('detects an existing .result file', () => {
    writeFileSync(join(tmpRoot, '.tasks', 'task-351-999.result'), '{}', 'utf-8');
    const evidence = gatherDispatchTraceEvidence(tmpRoot, '351-999');
    expect(evidence.hasResultFile).toBe(true);
  });
});

// ─── FIX-phase classification (re-dispatch candidates, not worker-blame) ──

describe('classifyFixPhaseTasks — FIX-phase re-dispatch-candidate split', () => {
  it('routes NO_GO into fixCandidateTaskIds and NOT_DISPATCHED into reDispatchCandidateTaskIds', () => {
    const evaluations = new Map<string, TaskEvaluation>([
      ['t1', TaskEvaluation.DONE],
      ['t2', TaskEvaluation.GO_WITH_TECH_DEBT],
      ['t3', TaskEvaluation.NO_GO],
      ['t4', TaskEvaluation.NOT_DISPATCHED],
      ['t5', TaskEvaluation.NOT_DISPATCHED],
      ['t6', TaskEvaluation.DEFERRED],
    ]);

    const { fixCandidateTaskIds, reDispatchCandidateTaskIds } = classifyFixPhaseTasks(evaluations);

    expect(fixCandidateTaskIds).toEqual(['t3']);
    expect(reDispatchCandidateTaskIds).toEqual(['t4', 't5']);
  });

  it('never places a NOT_DISPATCHED task id in fixCandidateTaskIds (not worker-blamed)', () => {
    const evaluations = new Map<string, TaskEvaluation>([
      ['nd-1', TaskEvaluation.NOT_DISPATCHED],
    ]);
    const { fixCandidateTaskIds, reDispatchCandidateTaskIds } = classifyFixPhaseTasks(evaluations);
    expect(fixCandidateTaskIds).toEqual([]);
    expect(reDispatchCandidateTaskIds).toEqual(['nd-1']);
  });

  it('returns empty buckets for an evaluations map with no NO_GO/NOT_DISPATCHED entries', () => {
    const evaluations = new Map<string, TaskEvaluation>([
      ['t1', TaskEvaluation.DONE],
      ['t2', TaskEvaluation.GO_WITH_TECH_DEBT],
    ]);
    const { fixCandidateTaskIds, reDispatchCandidateTaskIds } = classifyFixPhaseTasks(evaluations);
    expect(fixCandidateTaskIds).toEqual([]);
    expect(reDispatchCandidateTaskIds).toEqual([]);
  });
});

// ─── Summary counter ──────────────────────────────────────────────────────

describe('collectNotDispatchedStats — summary counter', () => {
  it('counts only NOT_DISPATCHED entries', () => {
    const evaluations = new Map<string, TaskEvaluation>([
      ['t1', TaskEvaluation.DONE],
      ['t2', TaskEvaluation.NO_GO],
      ['t3', TaskEvaluation.NOT_DISPATCHED],
      ['t4', TaskEvaluation.NOT_DISPATCHED],
      ['t5', TaskEvaluation.NOT_DISPATCHED],
      ['t6', TaskEvaluation.DEFERRED],
    ]);
    expect(collectNotDispatchedStats(evaluations)).toEqual({ notDispatched: 3 });
  });

  it('returns zero for an empty or NOT_DISPATCHED-free map', () => {
    expect(collectNotDispatchedStats(new Map())).toEqual({ notDispatched: 0 });
    const evaluations = new Map<string, TaskEvaluation>([
      ['t1', TaskEvaluation.DONE],
      ['t2', TaskEvaluation.NO_GO],
    ]);
    expect(collectNotDispatchedStats(evaluations)).toEqual({ notDispatched: 0 });
  });
});
