// tests/cli/repl/live-footer-labels.test.ts
// TERMINAL-TOOLS-001 — live-footer label wire (i18n-first).
//
// Real-binary evidence (2026-09-02 PTY capture): the Ink REPL rendered a bare
// English `idle` line under the `[Sor]` mode badge in a Turkish session
// because run.tsx never injected labels into buildLiveFooter(); the
// mechanism module's DEFAULT_LIVE_FOOTER_LABELS leaked to the screen.
//
// Contract: run.tsx exposes buildLiveFooterLabels(t) mirroring
// buildReplLabels(t); every LiveFooterLabels field maps to the pre-existing
// `live_footer.*` key (messages.ts, Task 16 MESSAGES-KEYS-2 — present in
// en+tr since then but never consumed), and the English catalog equals the
// mechanism defaults so the two can never drift.

import { describe, it, expect } from 'vitest';
import { buildLiveFooterLabels } from '../../../src/cli/repl/run.js';
import { buildLiveFooter, DEFAULT_LIVE_FOOTER_LABELS, type LiveFooterLabels } from '../../../src/cli/helpers/live-footer.js';
import { getMessage, getMessageLanguages } from '../../../src/cli/helpers/messages.js';

const KEY_BY_FIELD: Record<keyof LiveFooterLabels, string> = {
  idle: 'live_footer.idle',
  running: 'live_footer.running',
  elapsed: 'live_footer.elapsed',
  provider: 'live_footer.provider',
  auth: 'live_footer.auth',
  next: 'live_footer.next',
  healthy: 'live_footer.healthy',
  degraded: 'live_footer.degraded',
  unknown: 'live_footer.unknown',
  loggedIn: 'live_footer.logged_in',
  loggedOut: 'live_footer.logged_out',
};

describe('buildLiveFooterLabels — live_footer.* catalog wire', () => {
  it('maps every LiveFooterLabels field to a key that resolves in en AND tr', () => {
    const fields = Object.keys(DEFAULT_LIVE_FOOTER_LABELS) as (keyof LiveFooterLabels)[];
    expect(Object.keys(KEY_BY_FIELD).sort()).toEqual(fields.slice().sort());
    for (const field of fields) {
      expect(getMessageLanguages(KEY_BY_FIELD[field]), field).toEqual(expect.arrayContaining(['en', 'tr']));
    }
    const tr = buildLiveFooterLabels((k) => getMessage(k, 'tr'));
    for (const field of fields) expect(tr[field], field).toBe(getMessage(KEY_BY_FIELD[field], 'tr'));
  });

  it('English catalog values equal the mechanism defaults (no drift between catalog and DEFAULT_LIVE_FOOTER_LABELS)', () => {
    const en = buildLiveFooterLabels((k) => getMessage(k, 'en'));
    expect(en).toEqual(DEFAULT_LIVE_FOOTER_LABELS);
  });

  it('Turkish idle line is no longer the English default', () => {
    const tr = buildLiveFooterLabels((k) => getMessage(k, 'tr'));
    expect(tr.idle).not.toBe('idle');
    expect(buildLiveFooter({}, { labels: tr, width: 80 })).toEqual([tr.idle]);
  });

  it('Turkish running/elapsed lines use the injected labels', () => {
    const tr = buildLiveFooterLabels((k) => getMessage(k, 'tr'));
    const now = new Date('2026-09-02T00:01:00Z');
    const lines = buildLiveFooter({ running: 'task-1', startedAt: '2026-09-02T00:00:00Z' }, { labels: tr, width: 120, now });
    expect(lines[0]).toBe(`${tr.running}: task-1`);
    expect(lines[1]).toBe(`${tr.elapsed}: 1m`);
  });
});
