/**
 * Task 355-015 (MESSAGES-KEYS-4) — hermetic guard for the round-8
 * sole-authority key-addition task.
 *
 * Round-8 (sprint-355) dependency tasks' .result notes were mined for
 * reported i18n key needs (see .tasks/task-355-015.plan for the full source
 * citations):
 *   - 355-011 (APP-APPROVAL-WIRE / app.tsx)         -> approval_card.* (9 keys)
 *   - 355-010 (GOLDENFLOW-CMD / do.ts)               -> do.* (13 keys)
 * 355-003 (APR-TG-CHANNEL / approval-telegram.ts) reported no new key need —
 * its docImpact says it reused existing accepted keys
 * (cap.approval.header/cap.btn.approve/cap.btn.reject) and is intentionally
 * NOT represented here — inventing keys for an unreported need would be a
 * nogo per this task's own goNogo.
 *
 * This is key-only addition: no structural change to MessageMap/getMessage,
 * and no wiring into app.tsx/do.ts (both out of write scope — this task adds
 * translations only).
 *
 * Hermetic: reads committed source + imports getMessage/
 * formatDoPlanPreview only (all pure, no gitignored state, no Ink render).
 */

import { describe, it, expect } from 'vitest';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { formatDoPlanPreview } from '../../src/cli/commands/do.js';
import type { GoldenFlowPlanPreview } from '../../src/orchestra/golden-flow.js';

// ─── approval_card.* (355-011 APP-APPROVAL-WIRE) ───────────────────────────

const APPROVAL_CARD_TEXT_KEYS = [
  'approval_card.hint',
  'approval_card.details_heading',
  'approval_card.no_args',
] as const;

const APPROVAL_CARD_RISK_KEYS = [
  ['approval_card.risk_none', 'none'],
  ['approval_card.risk_low', 'low'],
  ['approval_card.risk_medium', 'medium'],
  ['approval_card.risk_high', 'high'],
  ['approval_card.risk_critical', 'critical'],
] as const;

describe('approval_card.* keys (355-011 docImpact — the only source since TERMINAL-TOOLS-002)', () => {
  it.each(APPROVAL_CARD_TEXT_KEYS)('%s resolves to a non-empty, non-key-echo string in en', (key) => {
    const resolved = getMessage(key, 'en');
    expect(resolved).not.toBe(key);
    expect(resolved.length).toBeGreaterThan(0);
  });

  it.each(APPROVAL_CARD_TEXT_KEYS)('%s resolves to a non-empty, non-key-echo string in tr', (key) => {
    const resolved = getMessage(key, 'tr');
    expect(resolved).not.toBe(key);
    expect(resolved.length).toBeGreaterThan(0);
  });

  it('every approval_card.* text key genuinely differs between en and tr', () => {
    for (const key of APPROVAL_CARD_TEXT_KEYS) {
      expect(getMessage(key, 'en'), key).not.toBe(getMessage(key, 'tr'));
    }
  });

  it.each(APPROVAL_CARD_RISK_KEYS)('%s resolves to a non-empty, non-key-echo string in en and tr', (key) => {
    expect(getMessage(key, 'en')).not.toBe(key);
    expect(getMessage(key, 'tr')).not.toBe(key);
  });

  it('every approval_card.risk_* key genuinely differs between en and tr', () => {
    for (const [key] of APPROVAL_CARD_RISK_KEYS) {
      expect(getMessage(key, 'en'), key).not.toBe(getMessage(key, 'tr'));
    }
  });

  it('approval_card.progress is the identical numeric-notation template in en and tr (same precedent as tui.confirm_progress)', () => {
    expect(getMessage('approval_card.progress', 'en')).toBe('[{index}/{total}]');
    expect(getMessage('approval_card.progress', 'tr')).toBe('[{index}/{total}]');
  });

});

// ─── do.* (355-010 GOLDENFLOW-CMD) ──────────────────────────────────────────

function fakePreview(taskCount: number): GoldenFlowPlanPreview {
  return {
    directivesMarkdown: '',
    taskCount,
    tasks: [
      { title: 'Example task', files: ['a.ts', 'b.ts'], scope: ['src/'], goCriteria: ['tsc clean'] },
    ],
  };
}

const DO_INTERP_KEYS = [
  ['do.preview_banner_run', { count: '2' }],
  ['do.preview_banner_dry_run', { count: '2' }],
  ['do.task_files', { files: 'a.ts, b.ts' }],
  ['do.task_scope', { scope: 'src/' }],
  ['do.task_go_criteria', { goCriteria: 'tsc clean' }],
  ['do.cancelled', { stage: 'PLAN', reason: 'rejected' }],
  ['do.finished', { exitCode: '0', outcome: 'success' }],
] as const;

const DO_PLAIN_KEYS = [
  'do.what_will_happen',
  'do.empty_goal',
  'do.confirm_start',
  'do.dry_run_complete',
  'do.outcome_success',
  'do.outcome_failure',
] as const;

describe('do.* keys (355-010 docImpact — "A follow-up task should add do.* keys to messages.ts")', () => {
  it.each(DO_PLAIN_KEYS)('%s resolves to a non-empty, non-key-echo string in en and tr', (key) => {
    expect(getMessage(key, 'en')).not.toBe(key);
    expect(getMessage(key, 'tr')).not.toBe(key);
  });

  it('every do.* plain key genuinely differs between en and tr', () => {
    for (const key of DO_PLAIN_KEYS) {
      expect(getMessage(key, 'en'), key).not.toBe(getMessage(key, 'tr'));
    }
  });

  it.each(DO_INTERP_KEYS)('%s interpolates its variable(s) in en and tr', (key, vars) => {
    const en = getMessage(key, 'en', vars as Record<string, string>);
    for (const value of Object.values(vars)) expect(en).toContain(value);
    const tr = getMessage(key, 'tr', vars as Record<string, string>);
    for (const value of Object.values(vars)) expect(tr).toContain(value);
  });

  it('do.preview_banner_run/dry_run genuinely differ between en and tr', () => {
    const vars = { count: '2' };
    expect(getMessage('do.preview_banner_run', 'en', vars)).not.toBe(getMessage('do.preview_banner_run', 'tr', vars));
    expect(getMessage('do.preview_banner_dry_run', 'en', vars)).not.toBe(getMessage('do.preview_banner_dry_run', 'tr', vars));
  });

  it('do.cancelled / do.finished genuinely differ between en and tr', () => {
    expect(getMessage('do.cancelled', 'en', { stage: 'PLAN', reason: 'x' })).not.toBe(
      getMessage('do.cancelled', 'tr', { stage: 'PLAN', reason: 'x' }),
    );
    expect(getMessage('do.finished', 'en', { exitCode: '0', outcome: 'success' })).not.toBe(
      getMessage('do.finished', 'tr', { exitCode: '0', outcome: 'success' }),
    );
  });

  it('do.task_go_criteria keeps the "goCriteria" schema-field name identical in en/tr by convention (technical term, not translated — same category as tui.confirm_progress)', () => {
    expect(getMessage('do.task_go_criteria', 'en')).toBe('goCriteria: {goCriteria}');
    expect(getMessage('do.task_go_criteria', 'tr')).toBe('goCriteria: {goCriteria}');
  });

  it('en preview banner (run) is byte-identical to formatDoPlanPreview\'s real first line', () => {
    const rendered = formatDoPlanPreview(fakePreview(2), true);
    const bannerLine = rendered.split('\n')[0];
    expect(getMessage('do.preview_banner_run', 'en', { count: '2' })).toBe(bannerLine);
  });

  it('en preview banner (dry-run) is byte-identical to formatDoPlanPreview\'s real first line', () => {
    const rendered = formatDoPlanPreview(fakePreview(2), false);
    const bannerLine = rendered.split('\n')[0];
    expect(getMessage('do.preview_banner_dry_run', 'en', { count: '2' })).toBe(bannerLine);
  });

  it('en "What will happen:" heading is byte-identical to formatDoPlanPreview\'s real heading line', () => {
    const rendered = formatDoPlanPreview(fakePreview(1), true);
    const lines = rendered.split('\n');
    expect(getMessage('do.what_will_happen', 'en')).toBe(lines[2]);
  });

  it('en files/scope/goCriteria labels are byte-identical (modulo indent) to formatDoPlanPreview\'s real task lines', () => {
    const rendered = formatDoPlanPreview(fakePreview(1), true);
    expect(rendered).toContain(getMessage('do.task_files', 'en', { files: 'a.ts, b.ts' }));
    expect(rendered).toContain(getMessage('do.task_scope', 'en', { scope: 'src/' }));
    expect(rendered).toContain(getMessage('do.task_go_criteria', 'en', { goCriteria: 'tsc clean' }));
  });
});

// ─── no-collision + fallback-contract regression ──────────────────────────

describe('getMessage fallback behavior: unaffected by the new round-8 keys (no collision)', () => {
  it('a pre-existing, unrelated key still resolves exactly as before', () => {
    expect(getMessage('health.unknown', 'en')).toBe('unknown');
    expect(getMessage('health.unknown', 'tr')).toBe('bilinmiyor');
  });

  it('round-8\'s telegram dependency (355-003) reused pre-existing keys, unaffected by this task\'s additions', () => {
    expect(getMessage('cap.approval.header', 'en')).not.toBe('cap.approval.header');
    expect(getMessage('cap.btn.approve', 'en')).not.toBe('cap.btn.approve');
    expect(getMessage('cap.btn.reject', 'en')).not.toBe('cap.btn.reject');
  });

  it('round-7\'s own keys still resolve exactly as before (no cross-round collision)', () => {
    expect(getMessage('tui.mode_ask', 'en')).toBe('Ask');
    expect(getMessage('plan_nl.preview_banner', 'en')).not.toBe('plan_nl.preview_banner');
  });

  it('a genuinely unknown key still echoes the key itself (fallback contract intact)', () => {
    const unknownKey = 'do.this_key_does_not_exist_xyz';
    expect(getMessage(unknownKey, 'en')).toBe(unknownKey);
    expect(getMessage(unknownKey, 'tr')).toBe(unknownKey);
  });

  it('an unsupported lang falls back to the en template, not a crash', () => {
    expect(getMessage('do.what_will_happen', 'fr')).toBe(getMessage('do.what_will_happen', 'en'));
    expect(getMessage('approval_card.hint', 'fr')).toBe(getMessage('approval_card.hint', 'en'));
  });
});
