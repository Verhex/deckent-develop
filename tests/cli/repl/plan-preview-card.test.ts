// ═══ plan-preview-card — pure-helper tests (452-003 slice) ═════════════════
//
// ink-testing-library is not a project devDependency (confirmed by
// approval-card.test.tsx / run.tsx's own precedent) — every behavior
// plan-preview-card.tsx exposes is implemented as a pure, Ink-free function
// exactly so it can be exercised here directly, without mounting the
// component. What legitimately stays untested by design: the actual Ink
// <Box>/<Text> tree, `useInput` wiring, and stdin-mutex behavior — those need
// a real PTY smoke (see tests/cli/run-flow-mount.test.ts for the mount-level
// coverage of the surrounding wiring).

import { describe, it, expect } from 'vitest';
import {
  mapPlanPreviewKey,
  formatTaskSummaryLine,
  formatDigestShort,
  buildPlanPreviewCardLabels,
  formatScopeGateLines,
  type PlanPreviewCardLabels,
} from '../../../src/cli/repl/plan-preview-card.js';
import type { PlanPreview } from '../../../src/core/run-flow-contract.js';

// ─── mapPlanPreviewKey ──────────────────────────────────────────────────────

describe('mapPlanPreviewKey', () => {
  it('maps y/n/d (case-insensitive) to approve/reject/details', () => {
    expect(mapPlanPreviewKey('y')).toBe('approve');
    expect(mapPlanPreviewKey('Y')).toBe('approve');
    expect(mapPlanPreviewKey('n')).toBe('reject');
    expect(mapPlanPreviewKey('N')).toBe('reject');
    expect(mapPlanPreviewKey('d')).toBe('details');
    expect(mapPlanPreviewKey('D')).toBe('details');
  });

  it('any other key is a no-op', () => {
    expect(mapPlanPreviewKey('x')).toBeNull();
    expect(mapPlanPreviewKey('')).toBeNull();
    expect(mapPlanPreviewKey('1')).toBeNull();
  });
});

// ─── formatTaskSummaryLine / formatDigestShort ─────────────────────────────

describe('formatTaskSummaryLine', () => {
  it('is 1-indexed and joins title/summary with an em dash', () => {
    expect(formatTaskSummaryLine(0, { title: 'Ship it', summary: 'Ship it well.' }))
      .toBe('1. Ship it — Ship it well.');
    expect(formatTaskSummaryLine(3, { title: 'Fourth', summary: 'task' }))
      .toBe('4. Fourth — task');
  });
});

describe('formatDigestShort', () => {
  it('truncates past 12 chars with an ellipsis', () => {
    expect(formatDigestShort('abcdef0123456789')).toBe('abcdef012345…');
  });

  it('leaves a short digest untouched', () => {
    expect(formatDigestShort('abc123')).toBe('abc123');
  });
});

// ─── buildPlanPreviewCardLabels ─────────────────────────────────────────────

describe('buildPlanPreviewCardLabels', () => {
  it('sources all fields (including the 452-003 scope-gate labels) from real messages.ts keys, en and tr', () => {
    for (const lang of ['en', 'tr'] as const) {
      const labels = buildPlanPreviewCardLabels(lang);
      expect(labels.heading.length).toBeGreaterThan(0);
      expect(labels.scopeGateFailLabel).toBeTruthy();
      expect(labels.scopeGateOverriddenLabel).toBeTruthy();
    }
  });

  it('en and tr scope-gate labels genuinely differ', () => {
    const en = buildPlanPreviewCardLabels('en');
    const tr = buildPlanPreviewCardLabels('tr');
    expect(en.scopeGateFailLabel).not.toBe(tr.scopeGateFailLabel);
    expect(en.scopeGateOverriddenLabel).not.toBe(tr.scopeGateOverriddenLabel);
  });
});

// ─── formatScopeGateLines ────────────────────────────────────────────────────

const BASE_PREVIEW: Omit<PlanPreview, 'scopeGateResult' | 'scopeGateMessage' | 'scopeGateOverridden'> = {
  flowId: 'flow-1',
  revision: 1,
  planDigest: 'digest0123456789',
  taskSummaries: [],
  policyDecision: 'allow',
  gateResult: 'pass',
};

describe('formatScopeGateLines', () => {
  it("'fail': verdict label + every scopeGateMessage line, each '  ! '-prefixed, in order", () => {
    const labels = buildPlanPreviewCardLabels('en');
    const preview: PlanPreview = {
      ...BASE_PREVIEW,
      scopeGateResult: 'fail',
      scopeGateMessage: 'line one\nline two\nline three',
    };
    expect(formatScopeGateLines(preview, labels)).toEqual([
      labels.scopeGateFailLabel,
      '  ! line one',
      '  ! line two',
      '  ! line three',
    ]);
  });

  it("'fail' with no scopeGateMessage: just the verdict label, no crash on missing message", () => {
    const labels = buildPlanPreviewCardLabels('en');
    const preview: PlanPreview = { ...BASE_PREVIEW, scopeGateResult: 'fail' };
    expect(formatScopeGateLines(preview, labels)).toEqual([labels.scopeGateFailLabel]);
  });

  it('scopeGateOverridden=true (and result not fail): a single notice line', () => {
    const labels = buildPlanPreviewCardLabels('en');
    const preview: PlanPreview = { ...BASE_PREVIEW, scopeGateResult: 'pass', scopeGateOverridden: true };
    expect(formatScopeGateLines(preview, labels)).toEqual([labels.scopeGateOverriddenLabel]);
  });

  it("'fail' takes precedence over scopeGateOverridden if both were somehow set", () => {
    const labels = buildPlanPreviewCardLabels('en');
    const preview: PlanPreview = {
      ...BASE_PREVIEW,
      scopeGateResult: 'fail',
      scopeGateMessage: 'blocked',
      scopeGateOverridden: true,
    };
    const lines = formatScopeGateLines(preview, labels);
    expect(lines[0]).toBe(labels.scopeGateFailLabel);
    expect(lines).not.toContain(labels.scopeGateOverriddenLabel);
  });

  it('pass/skipped, not overridden: no lines — nothing is invented when there is nothing to report', () => {
    const labels = buildPlanPreviewCardLabels('en');
    expect(formatScopeGateLines({ ...BASE_PREVIEW, scopeGateResult: 'pass' }, labels)).toEqual([]);
    expect(formatScopeGateLines({ ...BASE_PREVIEW, scopeGateResult: 'skipped' }, labels)).toEqual([]);
    expect(formatScopeGateLines({ ...BASE_PREVIEW }, labels)).toEqual([]);
  });

  it('degrades gracefully (never throws) when labels omit the optional scope-gate fields entirely', () => {
    const emptyLabels: Pick<PlanPreviewCardLabels, 'scopeGateFailLabel' | 'scopeGateOverriddenLabel'> = {};
    const failPreview: PlanPreview = { ...BASE_PREVIEW, scopeGateResult: 'fail', scopeGateMessage: 'msg' };
    const overriddenPreview: PlanPreview = { ...BASE_PREVIEW, scopeGateResult: 'pass', scopeGateOverridden: true };
    expect(() => formatScopeGateLines(failPreview, emptyLabels)).not.toThrow();
    expect(formatScopeGateLines(failPreview, emptyLabels)).toEqual(['  ! msg']);
    expect(formatScopeGateLines(overriddenPreview, emptyLabels)).toEqual([]);
  });
});
