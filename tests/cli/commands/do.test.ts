// ═══ do.ts — formatRunFlowDoPreview scope-gate rendering (452-003) ═════════
//
// Focused unit coverage for do.ts's own scope-gate rendering after 452-003
// routed it through plan-preview-card.tsx's shared `formatScopeGateLines`
// (see tests/cli/plan-preview-scope-gate-labels.test.ts for the CLI↔REPL
// parity assertions, and tests/cli/do-runflow-adapter.test.ts /
// tests/cli/run-flow-scope-mirror.test.ts for the wider command-level and
// controller-integration coverage). Pure — no fs, no subprocess.

import { describe, it, expect } from 'vitest';
import { formatRunFlowDoPreview } from '../../../src/cli/commands/do.js';
import { buildPlanPreviewCardLabels } from '../../../src/cli/repl/plan-preview-card.js';
import type { PlanPreview } from '../../../src/core/run-flow-contract.js';

function makePreview(overrides?: Partial<PlanPreview>): PlanPreview {
  return {
    flowId: 'flow-1',
    revision: 1,
    planDigest: 'abcdef0123456789',
    taskSummaries: [{ title: 'Ship the thing', summary: 'Ship the thing well.' }],
    policyDecision: 'allow',
    gateResult: 'pass',
    ...overrides,
  };
}

describe('formatRunFlowDoPreview — scope-gate rendering (452-003)', () => {
  for (const lang of ['en', 'tr'] as const) {
    it(`lang=${lang}: scopeGateResult='fail' renders the verdict label and every scopeGateMessage line`, () => {
      const labels = buildPlanPreviewCardLabels(lang);
      const preview = makePreview({
        scopeGateResult: 'fail',
        scopeGateMessage: 'reason one\nreason two',
      });
      const text = formatRunFlowDoPreview(preview, true, lang);
      expect(text).toContain(labels.scopeGateFailLabel);
      expect(text).toContain('  ! reason one');
      expect(text).toContain('  ! reason two');
    });

    it(`lang=${lang}: scopeGateOverridden=true renders the override notice`, () => {
      const labels = buildPlanPreviewCardLabels(lang);
      const preview = makePreview({ scopeGateResult: 'pass', scopeGateOverridden: true });
      const text = formatRunFlowDoPreview(preview, true, lang);
      expect(text).toContain(labels.scopeGateOverriddenLabel);
    });

    it(`lang=${lang}: clean scope (pass, not overridden) renders neither`, () => {
      const labels = buildPlanPreviewCardLabels(lang);
      const preview = makePreview({ scopeGateResult: 'pass' });
      const text = formatRunFlowDoPreview(preview, true, lang);
      expect(text).not.toContain(labels.scopeGateFailLabel);
      expect(text).not.toContain(labels.scopeGateOverriddenLabel);
    });

    it(`lang=${lang}: scopeGateResult absent entirely (undefined) — same as clean, no crash`, () => {
      const labels = buildPlanPreviewCardLabels(lang);
      const preview = makePreview();
      const text = formatRunFlowDoPreview(preview, true, lang);
      expect(text).not.toContain(labels.scopeGateFailLabel);
      expect(text).not.toContain(labels.scopeGateOverriddenLabel);
    });
  }

  it('en and tr renderings genuinely differ for a scope-gate fail preview', () => {
    const preview = makePreview({ scopeGateResult: 'fail', scopeGateMessage: 'boom' });
    const en = formatRunFlowDoPreview(preview, true, 'en');
    const tr = formatRunFlowDoPreview(preview, true, 'tr');
    expect(en).not.toBe(tr);
  });

  it('the digest line still renders after the scope-gate block (ordering did not get lost in the refactor)', () => {
    const labels = buildPlanPreviewCardLabels('en');
    const preview = makePreview({ scopeGateResult: 'fail', scopeGateMessage: 'boom' });
    const text = formatRunFlowDoPreview(preview, true, 'en');
    const scopeGateIdx = text.indexOf(labels.scopeGateFailLabel);
    const digestIdx = text.indexOf(labels.digestLabel);
    expect(scopeGateIdx).toBeGreaterThan(-1);
    expect(digestIdx).toBeGreaterThan(scopeGateIdx);
  });

  it('renders the shared structural topology before the digest', () => {
    const labels = buildPlanPreviewCardLabels('en');
    const preview = makePreview({
      topologyGateResult: 'fail',
      topology: {
        schemaVersion: 1,
        configuredMaxWorkers: 8,
        effectiveConcurrency: 1,
        taskSlots: [1, 2],
        collisions: [{ path: 'src/shared.ts', key: 'src/shared.ts', writerSlots: [1, 2], declared: false }],
        authoredEdges: [],
        syntheticEdges: [{ from: 1, to: 2, source: 'collision', paths: ['src/shared.ts'] }],
        effectiveEdges: [{ from: 1, to: 2, source: 'collision', paths: ['src/shared.ts'] }],
        waves: [{ wave: 1, slots: [1] }, { wave: 2, slots: [2] }],
        findings: [{
          code: 'undeclared-writer-collision',
          severity: 'block',
          slots: [1, 2],
          path: 'src/shared.ts',
        }],
        verdict: 'block',
      },
    });
    const text = formatRunFlowDoPreview(preview, true, 'en');

    expect(text).toContain(labels.topologyBlockLabel);
    expect(text).toContain('src/shared.ts [1,2]');
    expect(text.indexOf(labels.digestLabel)).toBeGreaterThan(text.indexOf(labels.topologyBlockLabel));
  });
});
