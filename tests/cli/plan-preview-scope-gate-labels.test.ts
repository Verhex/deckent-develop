// ═══ plan-preview-scope-gate-labels — CLI↔REPL parity (452-003) ════════════
//
// Dogfood-449 B1 / born-698a precedent: a silently-dead run was invisible
// because the front door's scope-gate mirror lived ONLY in the CLI's ad-hoc
// text, never in the REPL card. This file pins the fix from the OTHER side —
// `formatScopeGateLines` (src/cli/repl/plan-preview-card.tsx) is now the
// SINGLE function both `formatRunFlowDoPreview` (CLI, src/cli/commands/do.ts)
// and `<PlanPreviewCard>` (REPL) call, so the two surfaces cannot diverge on
// this verdict again. Everything here is pure — no fs, no Ink mount.

import { describe, it, expect } from 'vitest';
import {
  formatScopeGateLines,
  buildPlanPreviewCardLabels,
  type PlanPreviewCardLabels,
} from '../../src/cli/repl/plan-preview-card.js';
import { formatRunFlowDoPreview } from '../../src/cli/commands/do.js';
import type { PlanPreview } from '../../src/core/run-flow-contract.js';

// ─── Shared fixture — one base PlanPreview, three scope-gate variants ──────

const BASE: Omit<PlanPreview, 'scopeGateResult' | 'scopeGateMessage' | 'scopeGateOverridden'> = {
  flowId: 'flow-452-003',
  revision: 1,
  planDigest: 'abcdef0123456789fixture',
  taskSummaries: [{ title: 'Rename the worker module', summary: 'Rename worker.ts to agent-worker.ts.' }],
  policyDecision: 'allow',
  gateResult: 'pass',
};

const SCOPE_GATE_MESSAGE =
  "Scope gate: 1 write path(s) do not exist and look like a typo or wrong directory:\n" +
  "  • [001-001] src/orchestra/worker.ts (no such file and its directory 'src/orchestra' is not in the repo)\n" +
  "If these are intentional new files, override with acknowledgeScopePaths=true (MCP) / --force-scope (CLI). " +
  "If a path should be an existing file, fix the DIRECTIVES scope before spawning.";

function failFixture(): PlanPreview {
  return { ...BASE, scopeGateResult: 'fail', scopeGateMessage: SCOPE_GATE_MESSAGE };
}

function overriddenFixture(): PlanPreview {
  return { ...BASE, scopeGateResult: 'pass', scopeGateOverridden: true };
}

function cleanFixture(): PlanPreview {
  return { ...BASE, scopeGateResult: 'pass' };
}

// ─── formatScopeGateLines — en/tr rendering ────────────────────────────────

describe('formatScopeGateLines — fail/override/clean rendering, en + tr', () => {
  for (const lang of ['en', 'tr'] as const) {
    describe(`lang=${lang}`, () => {
      it("'fail': verdict header line first, then the gate message verbatim (line-split, '  ! ' prefixed)", () => {
        const labels = buildPlanPreviewCardLabels(lang);
        const lines = formatScopeGateLines(failFixture(), labels);
        expect(lines[0]).toBe(labels.scopeGateFailLabel);
        const expectedMessageLines = SCOPE_GATE_MESSAGE.split('\n').map((l) => `  ! ${l}`);
        expect(lines.slice(1)).toEqual(expectedMessageLines);
      });

      it("'fail': the message body is never re-worded — every source line survives byte-for-byte modulo the '  ! ' prefix", () => {
        const labels = buildPlanPreviewCardLabels(lang);
        const lines = formatScopeGateLines(failFixture(), labels);
        for (const [i, sourceLine] of SCOPE_GATE_MESSAGE.split('\n').entries()) {
          expect(lines[i + 1]).toBe(`  ! ${sourceLine}`);
        }
      });

      it('overridden: a single notice line, no message lines', () => {
        const labels = buildPlanPreviewCardLabels(lang);
        const lines = formatScopeGateLines(overriddenFixture(), labels);
        expect(lines).toEqual([labels.scopeGateOverriddenLabel]);
      });

      it('clean (pass, not overridden): no lines at all — nothing invented', () => {
        const labels = buildPlanPreviewCardLabels(lang);
        expect(formatScopeGateLines(cleanFixture(), labels)).toEqual([]);
      });
    });
  }

  it('en and tr verdict/notice labels genuinely differ (real localization, not passthrough)', () => {
    const en = buildPlanPreviewCardLabels('en');
    const tr = buildPlanPreviewCardLabels('tr');
    expect(en.scopeGateFailLabel).not.toBe(tr.scopeGateFailLabel);
    expect(en.scopeGateOverriddenLabel).not.toBe(tr.scopeGateOverriddenLabel);
  });
});

// ─── CLI ↔ REPL parity — same fixture, same helper, same output ───────────

describe('CLI (formatRunFlowDoPreview) ↔ REPL (formatScopeGateLines) parity — identical verdict text on the same PlanPreview fixture', () => {
  for (const lang of ['en', 'tr'] as const) {
    it(`lang=${lang}: 'fail' fixture — the CLI preview contains every line formatScopeGateLines produces, verbatim`, () => {
      const preview = failFixture();
      const labels = buildPlanPreviewCardLabels(lang);
      const replLines = formatScopeGateLines(preview, labels);
      const cliText = formatRunFlowDoPreview(preview, false, lang);
      for (const line of replLines) expect(cliText).toContain(line);
    });

    it(`lang=${lang}: 'overridden' fixture — the CLI preview contains the REPL's override notice verbatim`, () => {
      const preview = overriddenFixture();
      const labels = buildPlanPreviewCardLabels(lang);
      const replLines = formatScopeGateLines(preview, labels);
      const cliText = formatRunFlowDoPreview(preview, false, lang);
      for (const line of replLines) expect(cliText).toContain(line);
    });

    it(`lang=${lang}: clean fixture — neither surface renders any scope-gate text`, () => {
      const preview = cleanFixture();
      const labels = buildPlanPreviewCardLabels(lang);
      expect(formatScopeGateLines(preview, labels)).toEqual([]);
      const cliText = formatRunFlowDoPreview(preview, false, lang);
      expect(cliText).not.toContain(labels.scopeGateFailLabel);
      expect(cliText).not.toContain(labels.scopeGateOverriddenLabel);
    });
  }

  it('sanity: fail and overridden fixtures produce genuinely different CLI output (the verdict is not a static no-op)', () => {
    const failText = formatRunFlowDoPreview(failFixture(), false, 'en');
    const overriddenText = formatRunFlowDoPreview(overriddenFixture(), false, 'en');
    const cleanText = formatRunFlowDoPreview(cleanFixture(), false, 'en');
    expect(failText).not.toBe(cleanText);
    expect(overriddenText).not.toBe(cleanText);
    expect(failText).not.toBe(overriddenText);
  });
});

// ─── Backward-compat pin: tests/cli/run-flow-scope-mirror.test.ts (out of ───
// this task's write scope) asserts these two literal substrings in the CLI
// dry-run preview output — verified here too so a future edit to the shared
// labels/helper cannot silently break that other test file.

describe('backward-compat substring pins (tests/cli/run-flow-scope-mirror.test.ts)', () => {
  it('CLI dry-run preview of a scope-gate fail contains "Scope gate: FAIL" and "--force-scope"', () => {
    const text = formatRunFlowDoPreview(failFixture(), false, 'en');
    expect(text).toContain('Scope gate: FAIL');
    expect(text).toContain('--force-scope');
  });
});

// ─── PlanPreviewCardLabels shape — optional scope-gate fields ─────────────

describe('PlanPreviewCardLabels — scope-gate fields are optional (app.tsx DEFAULT_PLAN_PREVIEW_CARD_LABELS compat)', () => {
  it('formatScopeGateLines degrades gracefully when scopeGateFailLabel is omitted: still renders the real message, no header', () => {
    const labelsWithoutScopeGate: Pick<PlanPreviewCardLabels, 'scopeGateFailLabel' | 'scopeGateOverriddenLabel'> = {};
    const lines = formatScopeGateLines(failFixture(), labelsWithoutScopeGate);
    expect(lines).toEqual(SCOPE_GATE_MESSAGE.split('\n').map((l) => `  ! ${l}`));
  });

  it('formatScopeGateLines drops the overridden notice (not invented) when scopeGateOverriddenLabel is omitted', () => {
    const labelsWithoutScopeGate: Pick<PlanPreviewCardLabels, 'scopeGateFailLabel' | 'scopeGateOverriddenLabel'> = {};
    expect(formatScopeGateLines(overriddenFixture(), labelsWithoutScopeGate)).toEqual([]);
  });
});
