// tests/nervous/live-w1b-adaptive.test.ts
//
// LIVE-W1b: adaptive stale-HB threshold (per-scope) tests
// Sprint 306 Task 003
// ADR-003: vitest over Jest

import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeAdaptiveThreshold, StaleWorkerDetector } from '../../src/nervous/detectors/stale-worker.js';
import type { DetectorContext, SprintStateSnapshot, ObserverEvent } from '../../src/core/nervous-types.js';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

const BASE_NOW = new Date('2026-06-19T10:00:00.000Z');
const BASE_THRESHOLD_MS = 120_000; // 120s

function makeEvent(source: ObserverEvent['source'] = 'cron'): ObserverEvent {
  return {
    id: 'test-event-id',
    source,
    type: 'TICK',
    timestamp: BASE_NOW.toISOString(),
    payload: {},
  };
}

function makeSprintState(overrides: Partial<SprintStateSnapshot> = {}): SprintStateSnapshot {
  return {
    sprintId: 'sprint-306',
    currentPhase: 'EXECUTE',
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 5,
    completedTasks: 2,
    ...overrides,
  };
}

function makeCtx(projectRoot: string, overrides: Partial<DetectorContext> = {}): DetectorContext {
  return {
    event: makeEvent(),
    sprintState: makeSprintState(),
    projectRoot,
    now: BASE_NOW,
    ...overrides,
  };
}

// ─── computeAdaptiveThreshold pure function tests ─────────────────────────────

describe('computeAdaptiveThreshold', () => {
  it('10-file scope → threshold ~%20 artar (0 dirs)', () => {
    const result = computeAdaptiveThreshold(BASE_THRESHOLD_MS, 10, 0);
    // min(120000 * (1 + 0.02*10 + 0.03*0), 240000) = min(120000 * 1.2, 240000) = 144000
    expect(result).toBe(144_000);
    const increase = (result - BASE_THRESHOLD_MS) / BASE_THRESHOLD_MS;
    expect(increase).toBeCloseTo(0.2, 5); // exactly 20%
  });

  it('0-scope → base threshold (no change)', () => {
    const result = computeAdaptiveThreshold(BASE_THRESHOLD_MS, 0, 0);
    expect(result).toBe(BASE_THRESHOLD_MS);
  });

  it('cap 2×base when files+dirs would exceed', () => {
    // 100 files + 100 dirs: 120000 * (1 + 2.0 + 3.0) = 120000 * 6 = 720000 → capped at 240000
    const result = computeAdaptiveThreshold(BASE_THRESHOLD_MS, 100, 100);
    expect(result).toBe(BASE_THRESHOLD_MS * 2);
  });

  it('cap 2×base at exactly 50-file boundary (0 dirs)', () => {
    // 50 files, 0 dirs: 120000 * (1 + 1.0) = 240000 = 2×base
    const result = computeAdaptiveThreshold(BASE_THRESHOLD_MS, 50, 0);
    expect(result).toBe(BASE_THRESHOLD_MS * 2);
  });

  it('dirs contribute to threshold increase', () => {
    // 0 files, 10 dirs: 120000 * (1 + 0 + 0.3) = 156000
    const result = computeAdaptiveThreshold(BASE_THRESHOLD_MS, 0, 10);
    expect(result).toBe(156_000);
  });

  it('combined files and dirs scale correctly', () => {
    // 5 files, 2 dirs: 120000 * (1 + 0.1 + 0.06) = 120000 * 1.16 = 139200
    const result = computeAdaptiveThreshold(BASE_THRESHOLD_MS, 5, 2);
    expect(result).toBeCloseTo(139_200, 0);
  });
});

// ─── detect() integration tests (with tmpdir) ─────────────────────────────────

describe('StaleWorkerDetector — adaptive threshold integration', () => {
  const sandboxes: string[] = [];

  function makeSandbox(): string {
    const dir = join(tmpdir(), `deckent-test-stale-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(dir, '.tasks'), { recursive: true });
    sandboxes.push(dir);
    return dir;
  }

  function writeTaskFile(projectRoot: string, taskId: string, filesWrite: string[]): void {
    const taskFile = join(projectRoot, '.tasks', `task-${taskId}.json`);
    writeFileSync(taskFile, JSON.stringify({
      id: taskId,
      status: 'EXECUTING',
      scope: { filesWrite },
    }), 'utf-8');
  }

  afterEach(() => {
    for (const dir of sandboxes) {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    sandboxes.length = 0;
  });

  it('task with 10 files → adaptive threshold prevents false-stale-kill', () => {
    // Setup: worker elapsed 130s, base=120s (stale with base), adaptive=144s (not stale)
    const projectRoot = makeSandbox();
    const taskId = 'ada-001';
    const filesWrite = Array.from({ length: 10 }, (_, i) => `src/module/file${i}.ts`);
    writeTaskFile(projectRoot, taskId, filesWrite);

    const elapsedMs = 130_000; // 130s — beyond base 120s but within adaptive 144s
    const lastHeartbeat = new Date(BASE_NOW.getTime() - elapsedMs).toISOString();

    const detector = new StaleWorkerDetector(BASE_THRESHOLD_MS);
    const ctx = makeCtx(projectRoot, {
      sprintState: makeSprintState({
        activeWorkers: [{ id: 'w-ada-001', taskId, lastHeartbeat }],
      }),
    });

    const result = detector.detect(ctx);

    // With adaptive threshold (144s > 130s elapsed): NOT stale → null
    expect(result).toBeNull();
  });

  it('task with 10 files → still stale when elapsed exceeds adaptive threshold', () => {
    const projectRoot = makeSandbox();
    const taskId = 'ada-002';
    const filesWrite = Array.from({ length: 10 }, (_, i) => `src/module/file${i}.ts`);
    writeTaskFile(projectRoot, taskId, filesWrite);

    const elapsedMs = 150_000; // 150s — beyond adaptive 144s
    const lastHeartbeat = new Date(BASE_NOW.getTime() - elapsedMs).toISOString();

    const detector = new StaleWorkerDetector(BASE_THRESHOLD_MS);
    const ctx = makeCtx(projectRoot, {
      sprintState: makeSprintState({
        activeWorkers: [{ id: 'w-ada-002', taskId, lastHeartbeat }],
      }),
    });

    const result = detector.detect(ctx);

    // 150s > adaptive 144s → stale detected
    expect(result).not.toBeNull();
    expect(result!.suggestedActions[0]!.id).toBe('WORKER_RESPAWN');
  });

  it('0-scope (task file missing) → falls back to base threshold', () => {
    const projectRoot = makeSandbox();
    // No task file written → scope read returns { filesWrite: [] }

    const elapsedMs = 125_000; // 125s > base 120s
    const lastHeartbeat = new Date(BASE_NOW.getTime() - elapsedMs).toISOString();

    const detector = new StaleWorkerDetector(BASE_THRESHOLD_MS);
    const ctx = makeCtx(projectRoot, {
      sprintState: makeSprintState({
        activeWorkers: [{ id: 'w-ada-003', taskId: 'ada-003', lastHeartbeat }],
      }),
    });

    const result = detector.detect(ctx);

    // base threshold = 120s, elapsed = 125s → stale
    expect(result).not.toBeNull();
    expect(result!.suggestedActions[0]!.payload).toMatchObject({ workerId: 'w-ada-003' });
  });

  it('0-scope (empty filesWrite) → base threshold is used', () => {
    const projectRoot = makeSandbox();
    const taskId = 'ada-004';
    writeTaskFile(projectRoot, taskId, []); // empty scope

    const elapsedMs = 115_000; // 115s < base 120s → not stale
    const lastHeartbeat = new Date(BASE_NOW.getTime() - elapsedMs).toISOString();

    const detector = new StaleWorkerDetector(BASE_THRESHOLD_MS);
    const ctx = makeCtx(projectRoot, {
      sprintState: makeSprintState({
        activeWorkers: [{ id: 'w-ada-004', taskId, lastHeartbeat }],
      }),
    });

    const result = detector.detect(ctx);

    // 115s < base 120s → not stale
    expect(result).toBeNull();
  });
});
