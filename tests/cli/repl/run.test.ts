// ═══ run.tsx — buildDoSlashLabels (`/do` i18n pin) tests (452-002) ══════════
//
// REPL-DO-SLASH-WIRE. run.tsx resolves the `/do` slash's two NON-run edges
// (flag-off notice + bare-usage hint) from messages.ts via buildDoSlashLabels
// and injects them into the string-free <ReplApp>. This pins that the real
// en/tr messages are wired (genuinely translated, key-resolving) — same
// "pull labels out of the render call" pin as buildRunFlowMountLabels in
// run-flow-mount.test.ts.

import { describe, it, expect } from 'vitest';
import { buildDoSlashLabels } from '../../../src/cli/repl/run.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';

describe('buildDoSlashLabels', () => {
  it('every label is a non-empty, genuinely-translated string (en !== tr)', () => {
    const en = buildDoSlashLabels((k) => getMessage(k, 'en'));
    const tr = buildDoSlashLabels((k) => getMessage(k, 'tr'));

    for (const key of ['flagOff', 'usage'] as const) {
      expect(en[key].length).toBeGreaterThan(0);
      expect(tr[key].length).toBeGreaterThan(0);
      expect(en[key]).not.toBe(tr[key]);
    }
  });

  it('resolves the do.slash_* message keys (not the raw key back)', () => {
    const en = buildDoSlashLabels((k) => getMessage(k, 'en'));
    expect(en.flagOff).toBe(getMessage('do.slash_flag_off', 'en'));
    expect(en.usage).toBe(getMessage('do.slash_usage', 'en'));
    expect(en.flagOff).not.toBe('do.slash_flag_off');
    expect(en.usage).not.toBe('do.slash_usage');
  });
});
