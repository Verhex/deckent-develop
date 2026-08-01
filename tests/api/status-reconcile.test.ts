/**
 * status-reconcile tests (Sprint 282 Task 005, DASH-UX-2).
 *
 * Verifies that reconcileStatusResponse correctly normalises the /api/status
 * response so the dashboard never shows a stale "active sprint" after the
 * sprint has completed.
 *
 * All tests are hermetic: tmpdir for all filesystem I/O, no gitignored state.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { reconcileStatusResponse } from '../../src/api/status-reconcile.js';
import { publishCanonicalRunStatusReadModel } from '../../src/core/run-status-read-model.js';

// ─── helpers ─────────────────────────────────────────────────────────

function makeTmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'deckent-reconcile-'));
}

function writeSprintState(root: string, state: Record<string, unknown>): void {
  const dir = join(root, '.deckent');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'sprint-state.json'), JSON.stringify(state), 'utf-8');
}

function writeLiveSprintState(root: string, state: Record<string, unknown>): void {
  writeSprintState(root, state);
  const sprintId = String(state['sprintId']);
  const pids = join(root, '.deckent', 'pids');
  mkdirSync(pids, { recursive: true });
  writeFileSync(join(pids, `${sprintId}.pid`), JSON.stringify({
    pid: process.pid,
    startedAt: '2026-08-01T00:00:00.000Z',
    leaseId: `lease-${sprintId}`,
  }));
}

function buildStaleDash(sprintId = 'sprint-281'): unknown {
  return {
    sprint: { id: sprintId, number: 281, phase: 'EXECUTE', status: 'ACTIVE' },
    agents: [{ id: 'w-001', taskId: 't-001', status: 'EXECUTING' }],
    progress: { done: 8, active: 2, blocked: 0, total: 10 },
    alerts: [],
    updatedAt: new Date().toISOString(),
  };
}

// ─── tests ──────────────────────────────────────────────────────────

describe('reconcileStatusResponse', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpRoot();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // ── test 1: stale dashboard + sprint-state COMPLETE → idle ──────

  it('returns idle when sprint-state is COMPLETE, even if dashboard shows EXECUTE', () => {
    writeSprintState(root, {
      sprintId: 'sprint-281',
      status: 'COMPLETE',
      phase: 'COMPLETE',
      startedAt: '2026-06-11T09:00:00.000Z',
      updatedAt: '2026-06-11T09:10:00.000Z',
      taskIds: ['281-001', '281-002'],
    });
    publishCanonicalRunStatusReadModel(root);

    const stale = buildStaleDash('sprint-281');
    const result = reconcileStatusResponse(root, stale) as Record<string, unknown>;
    const sprint = result['sprint'] as Record<string, unknown>;

    // No live-phase claim in the response
    expect(sprint['phase']).toBe('IDLE');
    expect(sprint['status']).toBe('IDLE');
    expect(sprint['id']).toBe('sprint-281');
    expect(result['idle']).toBe(true);
    // Agents/workers cleared (was 1 active worker in stale data)
    expect(result['agents']).toEqual([]);
  });

  it('overrides dashboard lifecycle/progress with the persisted read-model revision', () => {
    writeLiveSprintState(root, {
      sprintId: 'sprint-900',
      phase: 'EVALUATE',
      status: 'RUNNING',
      taskIds: [],
    });
    publishCanonicalRunStatusReadModel(root, {
      publishedAt: '2026-08-01T00:00:00.000Z',
    });
    const result = reconcileStatusResponse(root, buildStaleDash('sprint-wrong')) as Record<string, unknown>;
    expect(result['sprint']).toMatchObject({ id: 'sprint-900', phase: 'EVALUATE', status: 'RUNNING' });
    expect(result['statusReadModel']).toMatchObject({ state: 'persisted', revision: 1 });
    expect(result['progress']).toMatchObject({ total: 0, attemptCount: 0 });
  });

  // ── test 2: live sprint-state → dashboard data untouched ────────

  it('returns dashboard data unchanged when sprint-state is ACTIVE', () => {
    writeLiveSprintState(root, {
      sprintId: 'sprint-282',
      status: 'ACTIVE',
      phase: 'EXECUTE',
      startedAt: '2026-06-11T10:00:00.000Z',
      updatedAt: '2026-06-11T10:05:00.000Z',
      taskIds: ['282-001', '282-002'],
    });
    publishCanonicalRunStatusReadModel(root);

    const liveDash = buildStaleDash('sprint-282');
    const result = reconcileStatusResponse(root, liveDash) as Record<string, unknown>;
    const sprint = result['sprint'] as Record<string, unknown>;

    // Live data must be returned as-is
    expect(sprint['phase']).toBe('EXECUTE');
    expect(sprint['status']).toBe('ACTIVE');
    expect(sprint['id']).toBe('sprint-282');
    // idle flag must NOT be set on live response
    expect(result['idle']).toBeUndefined();
    // Agents preserved
    const agents = result['agents'] as unknown[];
    expect(agents).toHaveLength(1);
  });

  // ── test 3: no sprint-state file → idle ─────────────────────────

  it('returns idle when sprint-state file is missing (no active sprint)', () => {
    // No sprint-state file written — fresh/idle project
    const result = reconcileStatusResponse(root, null) as Record<string, unknown>;
    const sprint = result['sprint'] as Record<string, unknown>;

    expect(sprint['phase']).toBe('IDLE');
    expect(sprint['status']).toBe('IDLE');
    expect(result['idle']).toBe(true);
    expect(result['agents']).toEqual([]);
  });

  // ── test 4: dashboard shows COMPLETE phase → reconciled to idle ──

  it('does not let a display-only terminal dashboard override persisted run authority', () => {
    writeSprintState(root, {
      sprintId: 'sprint-280',
      status: 'ACTIVE',
      phase: 'EXECUTE',
      startedAt: '2026-06-10T09:00:00.000Z',
      updatedAt: '2026-06-10T09:15:00.000Z',
      taskIds: ['280-001'],
    });
    publishCanonicalRunStatusReadModel(root);

    // Dashboard already stamped as COMPLETE by writeTerminalDashboardSnapshot
    const terminalDash = {
      sprint: { id: 'sprint-280', number: 280, phase: 'COMPLETE', status: 'COMPLETE' },
      agents: [],
      progress: { done: 10, active: 0, blocked: 0, total: 10 },
      alerts: [],
      updatedAt: new Date().toISOString(),
      completedAt: '2026-06-10T09:15:00.000Z',
    };

    const result = reconcileStatusResponse(root, terminalDash) as Record<string, unknown>;
    const sprint = result['sprint'] as Record<string, unknown>;

    expect(sprint['phase']).toBe('EXECUTE');
    expect(sprint['status']).toBe('ACTIVE');
    expect(result['idle']).toBeUndefined();
    expect(result['statusReadModel']).toMatchObject({ state: 'persisted' });
  });

  // ── test 5: ABORTED sprint-state → idle ─────────────────────────

  it('returns idle when sprint-state is ABORTED', () => {
    writeSprintState(root, {
      sprintId: 'sprint-279',
      status: 'ABORTED',
      phase: 'COMPLETE',
      startedAt: '2026-06-09T08:00:00.000Z',
      updatedAt: '2026-06-09T08:05:00.000Z',
      taskIds: [],
    });
    publishCanonicalRunStatusReadModel(root);

    const result = reconcileStatusResponse(root, buildStaleDash('sprint-279')) as Record<string, unknown>;
    const sprint = result['sprint'] as Record<string, unknown>;

    expect(sprint['phase']).toBe('IDLE');
    expect(result['idle']).toBe(true);
  });
});
