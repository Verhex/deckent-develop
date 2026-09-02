/**
 * Task 354-015 (MESSAGES-KEYS-3) — hermetic guard for the round-7
 * sole-authority key-addition task.
 *
 * Round-7 (sprint-354) tasks' .result notes were mined for reported i18n key
 * needs (see .tasks/task-354-015.plan for the full source citations):
 *   - 354-001 (REPL-SURFACE-WIRE / app.tsx) -> tui.mode_* (3 keys)
 *   - 354-008 (DIR-1-CMD / plan-nl.ts)      -> plan_nl.* (2 keys)
 * 354-002/003/004/005/006/007/009/011/012/013 reported no specific,
 * explicitly-cited key need (docImpact: none, no docImpact line at all, or
 * structurally cannot import cli/helpers/messages.ts per ADR-D-004/ADR-008)
 * and are intentionally NOT represented here — inventing keys for an
 * unreported need would be a nogo per this task's own goNogo.
 *
 * This is key-only addition: no structural change to MessageMap/getMessage,
 * and no wiring into app.tsx/plan-nl.ts (both out of write scope — this task
 * adds translations only).
 *
 * Hermetic: reads committed source + imports getMessage/resolveModeLabel/
 * formatPlanNlPreview only (all pure, no gitignored state, no Ink render).
 */

import { describe, it, expect } from 'vitest';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { resolveModeLabel, type ReplLabels } from '../../src/cli/repl/app.js';
import { formatPlanNlPreview } from '../../src/cli/commands/plan-nl.js';

// ─── tui.mode_* (354-001 REPL-SURFACE-WIRE) ────────────────────────────────

const MODE_KEYS = ['tui.mode_ask', 'tui.mode_run', 'tui.mode_control'] as const;

describe('tui.mode_* keys (354-001 docImpact — cited by source task)', () => {
  it.each(MODE_KEYS)('%s resolves to a non-empty, non-key-echo string in en', (key) => {
    const resolved = getMessage(key, 'en');
    expect(resolved).not.toBe(key);
    expect(resolved.length).toBeGreaterThan(0);
  });

  it.each(MODE_KEYS)('%s resolves to a non-empty, non-key-echo string in tr', (key) => {
    const resolved = getMessage(key, 'tr');
    expect(resolved).not.toBe(key);
    expect(resolved.length).toBeGreaterThan(0);
  });

  it('every tui.mode_* key genuinely differs between en and tr', () => {
    for (const key of MODE_KEYS) {
      expect(getMessage(key, 'en'), key).not.toBe(getMessage(key, 'tr'));
    }
  });

  it('resolveModeLabel renders the en rows from an injected set (the mechanism owns no fallback since TERMINAL-TOOLS-002)', () => {
    const labels: Pick<ReplLabels, 'modeAsk' | 'modeRun' | 'modeControl'> = {
      modeAsk: getMessage('tui.mode_ask', 'en'), modeRun: getMessage('tui.mode_run', 'en'), modeControl: getMessage('tui.mode_control', 'en'),
    };
    expect(resolveModeLabel('ask', labels)).toBe(getMessage('tui.mode_ask', 'en'));
    expect(resolveModeLabel('run', labels)).toBe(getMessage('tui.mode_run', 'en'));
    expect(resolveModeLabel('control', labels)).toBe(getMessage('tui.mode_control', 'en'));
  });

  it('resolveModeLabel prefers an injected label over the fallback (real caller path, unaffected by these keys)', () => {
    expect(resolveModeLabel('ask', { modeAsk: getMessage('tui.mode_ask', 'tr') })).toBe(
      getMessage('tui.mode_ask', 'tr'),
    );
  });
});

// ─── plan_nl.* (354-008 DIR-1-CMD) ──────────────────────────────────────────

describe('plan_nl.* keys (354-008 docImpact — "yenisi gerekirse notes→Task 15")', () => {
  it('plan_nl.preview_banner resolves to a non-empty, non-key-echo string in en and tr', () => {
    for (const lang of ['en', 'tr']) {
      const resolved = getMessage('plan_nl.preview_banner', lang);
      expect(resolved).not.toBe('plan_nl.preview_banner');
      expect(resolved.length).toBeGreaterThan(0);
    }
  });

  it('plan_nl.preview_banner en text is byte-identical to formatPlanNlPreview\'s real banner line', () => {
    const rendered = formatPlanNlPreview('');
    const bannerLine = rendered.split('\n')[0];
    expect(getMessage('plan_nl.preview_banner', 'en')).toBe(bannerLine);
  });

  it('plan_nl.preview_banner genuinely differs between en and tr', () => {
    expect(getMessage('plan_nl.preview_banner', 'en')).not.toBe(
      getMessage('plan_nl.preview_banner', 'tr'),
    );
  });

  it('plan_nl.backup_created interpolates {path} in en and tr', () => {
    const en = getMessage('plan_nl.backup_created', 'en', { path: '/tmp/DIRECTIVES.md.bak.2026-07-01' });
    expect(en).toContain('/tmp/DIRECTIVES.md.bak.2026-07-01');
    const tr = getMessage('plan_nl.backup_created', 'tr', { path: '/tmp/DIRECTIVES.md.bak.2026-07-01' });
    expect(tr).toContain('/tmp/DIRECTIVES.md.bak.2026-07-01');
  });

  it('plan_nl.backup_created genuinely differs between en and tr', () => {
    const params = { path: '/tmp/x' };
    expect(getMessage('plan_nl.backup_created', 'en', params)).not.toBe(
      getMessage('plan_nl.backup_created', 'tr', params),
    );
  });
});

// ─── no-collision + fallback-contract regression ──────────────────────────

describe('getMessage fallback behavior: unaffected by the new round-7 keys (no collision)', () => {
  it('a pre-existing, unrelated key still resolves exactly as before', () => {
    expect(getMessage('health.unknown', 'en')).toBe('unknown');
    expect(getMessage('health.unknown', 'tr')).toBe('bilinmiyor');
  });

  it('round-6\'s own keys still resolve exactly as before (no cross-round collision)', () => {
    expect(getMessage('live_footer.idle', 'en')).not.toBe('live_footer.idle');
    expect(getMessage('connect.step.login', 'en', { provider: 'codex' })).toContain('codex');
  });

  it('a genuinely unknown key still echoes the key itself (fallback contract intact)', () => {
    const unknownKey = 'tui.mode_this_key_does_not_exist_xyz';
    expect(getMessage(unknownKey, 'en')).toBe(unknownKey);
    expect(getMessage(unknownKey, 'tr')).toBe(unknownKey);
  });

  it('an unsupported lang falls back to the en template, not a crash', () => {
    expect(getMessage('plan_nl.preview_banner', 'fr')).toBe(getMessage('plan_nl.preview_banner', 'en'));
  });
});
