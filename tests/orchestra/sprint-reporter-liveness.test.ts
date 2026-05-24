// ═══ Sprint Reporter — Liveness Stats Tests ═════════════════════════
// Sprint 192 Task 192-008 (W-INTEGRITY I-1) — retro telemetry coverage
// for the Sprint 191 hotfix (07f07c9a) 5-layer worker-liveness gate.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  collectLivenessStats,
  buildLivenessStatsSection,
  type LivenessStats,
} from '../../src/orchestra/sprint-reporter.js';
import { writeEvent, CHANNELS } from '../../src/orchestra/event-stream.js';

function makeTempRoot(): string {
  const root = join(
    tmpdir(),
    `sprint-reporter-liveness-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(join(root, '.deckent'), { recursive: true });
  return root;
}

describe('sprint-reporter — liveness stats', () => {
  let testRoot: string;
  const sprintId = 'sprint-192';

  beforeEach(() => {
    testRoot = makeTempRoot();
  });

  afterEach(() => {
    try {
      rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  // ─── collectLivenessStats ───────────────────────────────────────

  it('counts NEVER_DISPATCHED and TIMEOUT_EXTEND events from the stream', () => {
    // 3 never-dispatched
    writeEvent(testRoot, sprintId, 'brain', 'worker', CHANNELS.NEVER_DISPATCHED, {
      taskId: '192-009',
      reason: 'L1-no-assignedWorker',
    });
    writeEvent(testRoot, sprintId, 'brain', 'worker', CHANNELS.NEVER_DISPATCHED, {
      taskId: '192-010',
      reason: 'L1-no-assignedWorker',
    });
    writeEvent(testRoot, sprintId, 'brain', 'worker', CHANNELS.NEVER_DISPATCHED, {
      taskId: '192-011',
      reason: 'L1-no-assignedWorker',
    });
    // 2 timeout extensions
    writeEvent(testRoot, sprintId, 'brain', 'worker', CHANNELS.TIMEOUT_EXTEND, {
      taskId: '192-013',
      extensionCount: 1,
    });
    writeEvent(testRoot, sprintId, 'brain', 'worker', CHANNELS.TIMEOUT_EXTEND, {
      taskId: '192-013',
      extensionCount: 2,
    });

    const stats = collectLivenessStats(testRoot, sprintId);
    expect(stats.neverDispatched).toBe(3);
    expect(stats.extensionsGranted).toBe(2);
  });

  it('returns zero counts when the event stream file is missing', () => {
    const stats = collectLivenessStats(testRoot, sprintId);
    expect(stats).toEqual({ neverDispatched: 0, extensionsGranted: 0 });
  });

  it('ignores unrelated channels when aggregating liveness counts', () => {
    writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, {
      phase: 'EVALUATE',
    });
    writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.HEARTBEAT, {
      taskId: '192-001',
    });
    writeEvent(testRoot, sprintId, 'brain', 'worker', CHANNELS.NEVER_DISPATCHED, {
      taskId: '192-099',
    });

    const stats = collectLivenessStats(testRoot, sprintId);
    expect(stats.neverDispatched).toBe(1);
    expect(stats.extensionsGranted).toBe(0);
  });

  // ─── buildLivenessStatsSection ──────────────────────────────────

  it('formats markdown with the "Liveness Stats" heading and pluralised counts', () => {
    const stats: LivenessStats = { neverDispatched: 3, extensionsGranted: 2 };
    const md = buildLivenessStatsSection(stats);
    expect(md).toContain('## Liveness Stats');
    expect(md).toContain('Never dispatched: 3 tasks');
    expect(md).toContain('Extensions granted: 2 tasks');
    expect(md.endsWith('\n')).toBe(true);
  });

  it('renders the section with singular noun when a count is exactly 1', () => {
    const md = buildLivenessStatsSection({ neverDispatched: 1, extensionsGranted: 1 });
    expect(md).toContain('Never dispatched: 1 task\n');
    expect(md).toContain('Extensions granted: 1 task\n');
  });

  it('still renders the heading when both counts are zero', () => {
    const md = buildLivenessStatsSection({ neverDispatched: 0, extensionsGranted: 0 });
    expect(md).toContain('## Liveness Stats');
    expect(md).toContain('Never dispatched: 0 tasks');
    expect(md).toContain('Extensions granted: 0 tasks');
  });
});
