// D4-2 — renderer-i18n SSOT unification gates (done-criteria: "her
// view-string en+tr çözülür; renderer-yerel literal sıfır"):
//   1. every served desktop.* key resolves in BOTH en and tr from the repo
//      catalog (no raw-key leak, no missing pair);
//   2. every renderer MSG entry references a SERVED key (a new renderer
//      string cannot bypass the bridge — the pre-D4-2 silent drift class);
//   3. the renderer English fallback IS the SSOT's en (derived, not written);
//   4. main-process errorKey pushes (daemon-lifecycle) are served keys too.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getMessage } from '../../cli/helpers/messages.js';
import { DESKTOP_MESSAGE_KEYS } from '../src/shared/desktop-messages.js';
import { buildFallbackStrings } from '../src/renderer/i18n-fallback.js';
import { MSG } from '../src/renderer/app.js';
import { getDesktopStrings } from '../src/main/i18n.js';

describe('D4-2 — every served key resolves en+tr (done-criterion 1)', () => {
  it('no key falls back to itself in en or tr (both pairs present in messages.ts)', () => {
    const missing: string[] = [];
    for (const key of DESKTOP_MESSAGE_KEYS) {
      for (const lang of ['en', 'tr'] as const) {
        const resolved = getMessage(key, lang);
        if (resolved === key || resolved.trim().length === 0) missing.push(`${key} (${lang})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('getDesktopStrings("tr") actually serves Turkish (sample spot-checks)', () => {
    const tr = getDesktopStrings('tr');
    expect(tr['desktop.connection.list_title']).toBe('Bağlantılar');
    expect(tr['desktop.theme.watch.night-watch']).toBe('Gece seyri');
    expect(tr['desktop.connection.submit_button']).toBe('Bağlantıyı kaydet');
  });
});

describe('D4-2 — the renderer cannot bypass the bridge (done-criterion 2)', () => {
  it('every MSG value is a served DESKTOP_MESSAGE_KEYS entry (full desktop.* form)', () => {
    const served = new Set<string>(DESKTOP_MESSAGE_KEYS);
    const rogue = Object.entries(MSG).filter(([, key]) => !served.has(key));
    expect(rogue).toEqual([]);
  });

  it('daemon-lifecycle errorKey pushes are served keys (the orphan-key class stays closed)', () => {
    const source = readFileSync(new URL('../src/main/daemon-lifecycle.ts', import.meta.url), 'utf-8');
    const served = new Set<string>(DESKTOP_MESSAGE_KEYS);
    const keys = [...source.matchAll(/errorKey:\s*'([^']+)'/g)].map((m) => m[1]!);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((k) => !served.has(k))).toEqual([]);
  });
});

describe('D4-2 — zero renderer-local literals (done-criterion 3)', () => {
  it('the fallback map is EXACTLY getMessage(key, "en") over the served list — derived, never hand-written', () => {
    const fallback = buildFallbackStrings();
    expect(Object.keys(fallback).sort()).toEqual([...DESKTOP_MESSAGE_KEYS].sort());
    for (const key of DESKTOP_MESSAGE_KEYS) {
      expect(fallback[key], key).toBe(getMessage(key, 'en'));
    }
  });

  it('app.ts contains no hand-written fallback literal map (source gate)', () => {
    const source = readFileSync(new URL('../src/renderer/app.ts', import.meta.url), 'utf-8');
    expect(source).toContain('buildFallbackStrings()');
    // the old literal-map shape ("[MSG.x]: 'English text'") must be extinct
    expect(source).not.toMatch(/\[MSG\.\w+\]:\s*'/);
  });
});
