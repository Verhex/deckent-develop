/**
 * tests/cli/run-language-surface.test.ts — sprint-378 task 378-002 (RUN-SURFACE-TEXT)
 *
 * Curated (not mechanical) bridge-language pass: user-visible "Sprint N" / plain
 * "sprint" text in status/plan/retro human output moves to a "Run N (sprint)"
 * transitional format (bracketed old-name bridge — full rename is a later slice).
 *
 * This file asserts on the SAMPLE of keys actually bridged in this slice, plus a
 * curated (not exhaustive-grep) list of surfaces intentionally left untouched
 * because existing tests outside this task's write scope hard-assert the exact
 * legacy "Sprint <N>" substring and cannot be edited here. Each "left alone"
 * assertion below documents *why*, so a slice-2 pass has a concrete follow-up
 * list instead of a silent gap.
 */
import { describe, it, expect } from 'vitest';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { formatHumanStatus } from '../../src/cli/helpers/output.js';
import { en } from '../../src/dashboard/src/i18n/en.js';
import { tr } from '../../src/dashboard/src/i18n/tr.js';
import type { DashboardState } from '../../src/core/types.js';

function makeCompleteDashboard(): DashboardState {
  return {
    sprint: { id: 'sprint-375', number: 375, phase: 'COMPLETE', status: 'COMPLETE' },
    agents: [],
    progress: { done: 0, active: 2, blocked: 0, total: 8 },
    alerts: [],
    updatedAt: '2026-07-06T12:25:12.779Z',
  } as unknown as DashboardState;
}

function makeActiveDashboard(): DashboardState {
  return {
    sprint: { id: 'sprint-999', number: 999, phase: 'EXECUTE', status: 'ACTIVE' },
    agents: [],
    progress: { done: 1, active: 1, blocked: 0, total: 2 },
    alerts: [],
    updatedAt: new Date('2026-07-06T12:00:00.000Z').toISOString(),
  } as unknown as DashboardState;
}

describe('RUN-SURFACE-TEXT (378-002) — messages.ts bridged keys', () => {
  it('plan.sprint_planned bridges while keeping id/count interpolation intact', () => {
    const enMsg = getMessage('plan.sprint_planned', 'en', { number: '3', id: 'sprint-003', count: '7' });
    expect(enMsg).toContain('Run 3 (sprint)');
    expect(enMsg).toContain('sprint-003');
    expect(enMsg).toContain('7 tasks');
    const trMsg = getMessage('plan.sprint_planned', 'tr', { number: '3', id: 'sprint-003', count: '7' });
    expect(trMsg).toContain('Run 3 (sprint)');
    expect(trMsg).not.toBe(enMsg);
  });

  it('plan.note_sprint_size bridges', () => {
    const enMsg = getMessage('plan.note_sprint_size', 'en', { size: 'reduced', reason: 'High usage' });
    expect(enMsg).toBe('Note: Run (sprint) size reduced — High usage');
    const trMsg = getMessage('plan.note_sprint_size', 'tr', { size: 'reduced', reason: 'Yüksek kullanım' });
    expect(trMsg).toBe('Not: Run (sprint) boyutu reduced — Yüksek kullanım');
  });

  it('start.sprint_planned bridges while leaving unfilled placeholders intact', () => {
    const msg = getMessage('start.sprint_planned', 'en', { number: '1' });
    expect(msg).toContain('Run 1 (sprint)');
    expect(msg).toContain('{id}');
    expect(msg).toContain('{count}');
  });

  it('finalize.complete bridges', () => {
    const msg = getMessage('finalize.complete', 'en', {
      sprintId: 'sprint-050', total: '5', done: '4', debt: '1', noGo: '0',
    });
    expect(msg).toContain('Run sprint-050 (sprint) finalized');
    const trMsg = getMessage('finalize.complete', 'tr', {
      sprintId: 'sprint-050', total: '5', done: '4', debt: '1', noGo: '0',
    });
    expect(trMsg).toContain('Run sprint-050 (sprint) sonlandırıldı');
  });

  it('every bridged key has a distinct, non-empty en+tr pair', () => {
    const vars = { sprintId: 'x', number: '1', id: 'y', count: '1', size: 's', reason: 'r', total: '1', done: '1', debt: '0', noGo: '0' };
    for (const key of ['plan.sprint_planned', 'plan.note_sprint_size', 'start.sprint_planned', 'finalize.complete']) {
      const enMsg = getMessage(key, 'en', vars);
      const trMsg = getMessage(key, 'tr', vars);
      expect(enMsg.length).toBeGreaterThan(0);
      expect(trMsg.length).toBeGreaterThan(0);
      expect(trMsg).not.toBe(enMsg);
      expect(enMsg).toContain('(sprint)');
      expect(trMsg).toContain('(sprint)');
    }
  });
});

describe('RUN-SURFACE-TEXT (378-002) — output.ts COMPLETE-gate bridge', () => {
  it('renders "Run N (sprint) — completed" and preserves the W0-TRUTH retro-hint contract', () => {
    const out = formatHumanStatus({
      dashboard: makeCompleteDashboard(),
      tasks: [],
      projectRoot: '/tmp/nonexistent-run-surface-378-002',
      nowMs: Date.parse('2026-07-06T15:55:00.000Z'),
    });
    expect(out).toContain('Run 375 (sprint) — completed');
    expect(out).toContain('deckent retro');
    expect(out.toLowerCase()).toContain('completed');
    // W0-TRUTH regression guard (#491) — must still never leak live progress lines
    expect(out).not.toContain('Active: 2 workers');
    expect(out).not.toMatch(/Progress: 0\/8/);
  });
});

describe('RUN-SURFACE-TEXT (378-002) — dashboard i18n bridged keys (en+tr, key parity preserved)', () => {
  const bridgedKeys: Array<keyof typeof en> = [
    'dashboard.title',
    'dashboard.sprint_status',
    'dashboard.sprint_id',
    'status.title',
    // SURF-7 kuyruk: 'modal.plan_sprint' pruned with the NewSprintModal
    // (authority cutover) — the dashboard no longer plans sprints.
  ];
  // 'dashboard.sprint_id' used the English loanword "Sprint ID" verbatim in the
  // Turkish UI pre-change (an ID label, not a sentence) — its bridge is
  // identically "Run ID (sprint)" in both locales, so it's excluded from the
  // en!==tr check below (that assumption held for every OTHER bridged key).
  const identicalAcrossLocales = new Set<keyof typeof en>(['dashboard.sprint_id']);

  for (const key of bridgedKeys) {
    it(`${key} contains "Run" + "(sprint)" bridge in both en and tr`, () => {
      expect(en[key]).toContain('Run');
      expect(en[key]).toContain('(sprint)');
      expect(tr[key]).toContain('Run');
      expect(tr[key]).toContain('(sprint)');
      if (!identicalAcrossLocales.has(key)) {
        expect(tr[key]).not.toBe(en[key]);
      }
    });
  }
});

describe('RUN-SURFACE-TEXT (378-002) — curated scope-note: intentionally NOT bridged this slice', () => {
  // Each case below names the exact out-of-write-scope test file that hard-asserts
  // the legacy "Sprint" substring, so changing it here would regress a suite this
  // task cannot fix. This is the "curated list" the task spec calls for — a
  // deliberate slice-1 boundary expressed as code, not a full grep.

  it('hint.COMPLETE stays "Sprint complete" verbatim — tests/cli/messages.test.ts hard-asserts this (out of write scope)', () => {
    expect(getMessage('hint.COMPLETE', 'en')).toContain('Sprint complete');
  });

  it('status.sprint_active stays "Sprint {sprintId} active" verbatim — tests/cli/helpers/messages.test.ts hard-asserts an EXACT match on this template (both interpolated and raw-placeholder forms), out of write scope', () => {
    expect(getMessage('status.sprint_active', 'en', { sprintId: 'sprint-042' })).toBe('Sprint sprint-042 active');
    expect(getMessage('status.sprint_active', 'en', {})).toBe('Sprint {sprintId} active');
  });

  it('status.no_active_sprint stays "No active sprint" verbatim — tests/cli/commands/i18n-integration.test.ts hard-asserts this via a real (unmocked) status-command run (out of write scope)', () => {
    expect(getMessage('status.no_active_sprint', 'en')).toContain('No active sprint');
  });

  it('formatHumanStatus non-COMPLETE header stays "Sprint <N>" verbatim — tests/cli/helpers/human-status.test.ts hard-asserts this (out of write scope)', () => {
    const out = formatHumanStatus({ dashboard: makeActiveDashboard(), tasks: [], nowMs: Date.now() });
    expect(out).toContain('Sprint 999');
  });
});
