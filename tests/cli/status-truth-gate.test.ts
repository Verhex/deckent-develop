/**
 * tests/cli/status-truth-gate.test.ts — W0-TRUTH (#491, user-truth-audit §2)
 *
 * Live lie (2026-07-06): sprint-375 closed hours earlier, yet `deckent status`
 * rendered "Sprint 375 / Progress: 0/8 / Active: 2 workers running" — because
 * formatHumanStatus renders the LIVE view for a `.dashboard` whose own
 * `sprint.status/phase` is COMPLETE, and the auditor's final scan had written
 * garbage progress (active:2, done:0). The product lied about itself.
 *
 * Contract under test:
 *   1. COMPLETE-gate — a COMPLETE dashboard renders an honest "completed"
 *      block (i18n) with the retro hint, and NEVER the live Progress/Active lines.
 *   2. isDashboardOrphaned — pure staleness oracle for the crash-case (dashboard
 *      still ACTIVE-shaped but stale AND no live sprint/tasks on disk).
 */

import { describe, it, expect } from 'vitest';
import { formatHumanStatus, isDashboardOrphaned } from '../../src/cli/helpers/output.js';
import { SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { DashboardState } from '../../src/core/types.js';

function makeDashboard(overrides: Partial<DashboardState['sprint']> = {}, progress = { done: 0, active: 2, blocked: 0, total: 8 }): DashboardState {
  return {
    sprint: { id: 'sprint-375', number: 375, phase: 'COMPLETE', status: 'COMPLETE', ...overrides },
    agents: [],
    progress,
    alerts: [],
    updatedAt: '2026-07-06T12:25:12.779Z',
    auditorLastScan: '2026-07-06T12:25:12.779Z',
    violations: 0,
  } as unknown as DashboardState;
}

describe('W0 status truth-gate — COMPLETE dashboard never renders as live', () => {
  it('renders the honest completed block, not live progress (the 2026-07-06 live lie)', () => {
    const out = formatHumanStatus({
      dashboard: makeDashboard(),
      tasks: [],
      projectRoot: '/tmp/nonexistent-w0',
      nowMs: Date.parse('2026-07-06T15:55:00.000Z'),
    });
    expect(out).not.toContain('Active: 2 workers');
    expect(out).not.toMatch(/Progress: 0\/8/);
    // honest completed line (en default) + retro hint
    expect(out.toLowerCase()).toContain('completed');
    expect(out).toContain('deckent retro');
  });

  it('a genuinely ACTIVE dashboard still renders the live view (zero regression)', () => {
    const out = formatHumanStatus({
      dashboard: makeDashboard({ phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE }, { done: 3, active: 2, blocked: 0, total: 8 }),
      tasks: [],
      projectRoot: '/tmp/nonexistent-w0',
      nowMs: Date.parse('2026-07-06T12:30:00.000Z'),
    });
    expect(out).toContain('Progress: 3/8');
    expect(out).toContain('Active: 2 workers');
  });
});

describe('455-003 terminal-lifecycle truth — parked/FIXING never renders as completed', () => {
  it('a PAUSED (parked after a FIX spawn failure) dashboard does NOT print "completed"', () => {
    // sprint-controller parks the sprint at status=PAUSED / phase=FIX after a FIX
    // spawn/preflight failure. The human surface must show it is NOT complete.
    const out = formatHumanStatus({
      dashboard: makeDashboard(
        { phase: SprintPhase.FIX, status: SprintStatus.PAUSED },
        { done: 1, active: 0, blocked: 0, total: 8 },
      ),
      tasks: [],
      projectRoot: '/tmp/nonexistent-w0',
      nowMs: Date.parse('2026-07-06T12:30:00.000Z'),
    });
    expect(out.toLowerCase()).not.toContain('completed');
    // Honest non-complete view — real progress, zero live workers claimed.
    expect(out).toContain('Progress: 1/8');
    expect(out).toContain('Active: 0 workers');
  });

  it('a FIXING dashboard is not rendered as completed either (no false Complete mid-FIX)', () => {
    const out = formatHumanStatus({
      dashboard: makeDashboard(
        { phase: SprintPhase.FIX, status: SprintStatus.FIXING },
        { done: 2, active: 0, blocked: 0, total: 8 },
      ),
      tasks: [],
      projectRoot: '/tmp/nonexistent-w0',
      nowMs: Date.parse('2026-07-06T12:30:00.000Z'),
    });
    expect(out.toLowerCase()).not.toContain('completed');
  });
});

describe('W0 isDashboardOrphaned — crash-case staleness oracle', () => {
  const base = makeDashboard({ phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE });
  const updated = Date.parse('2026-07-06T12:25:12.779Z');

  it('stale + no live sprint + no task files → orphaned (honest no-sprint view)', () => {
    expect(isDashboardOrphaned(base, { hasLiveSprint: false, hasTasks: false, nowMs: updated + 31 * 60_000 })).toBe(true);
  });

  it('fresh dashboard is never orphaned', () => {
    expect(isDashboardOrphaned(base, { hasLiveSprint: false, hasTasks: false, nowMs: updated + 60_000 })).toBe(false);
  });

  it('a live sprint keeps the dashboard authoritative even when stale', () => {
    expect(isDashboardOrphaned(base, { hasLiveSprint: true, hasTasks: true, nowMs: updated + 31 * 60_000 })).toBe(false);
  });
});
