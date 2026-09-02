// tests/cli/chat-slash-registry-i18n.test.ts
// TERMINAL-TOOLS-001 — slash catalog i18n (design contract
// docs/design/DECKENT-TERMINAL-SINGLE-SURFACE.md §10 blocker #3).
//
// Real-binary evidence that motivated this suite (2026-09-02, PTY capture):
// a `language: en` session rendered the `/` menu and `/help` with the Turkish
// catalog literals ("/help  Kullanılabilir komutları listele") because
// SLASH_CATALOG carried hardcoded `desc:` strings and buildSlashRegistry()
// took no language. Every user whose language is not Turkish saw an
// unreadable command-discovery surface.
//
// Contract under test:
//   - every catalog entry carries a `descKey` (tui.slash.desc.<name>) that
//     resolves in BOTH en and tr;
//   - buildSlashRegistry(lang) resolves `desc` for that language;
//   - names / dispatch metadata are language-invariant;
//   - renderHelp / getVisibleCommands / buildHelpOutput hand the language
//     through, and the help catalog tier headers localize.
// Hermetic: pure in-memory catalog, no disk, no spawn.

import { describe, it, expect } from 'vitest';
import { buildSlashRegistry, renderHelp } from '../../src/cli/commands/chat-slash-registry.js';
import { getVisibleCommands } from '../../src/cli/commands/chat-mode.js';
import { buildHelpOutput, buildHelpCatalogLabels, UnknownHelpTierError } from '../../src/cli/commands/chat-native.js';
import { getMessage, getMessageLanguages, getLanguage } from '../../src/cli/helpers/messages.js';

const TURKISH_ONLY_GLYPHS = /[çğıöşüÇĞİÖŞÜ]/;

describe('slash catalog i18n — buildSlashRegistry(lang)', () => {
  const en = buildSlashRegistry('en');
  const tr = buildSlashRegistry('tr');

  it('every catalog entry carries a tui.slash.desc.* key that resolves in en AND tr', () => {
    expect(en.length).toBeGreaterThan(30);
    for (const cmd of en) {
      expect(cmd.descKey, `${cmd.name} has no descKey`).toMatch(/^tui\.slash\.desc\.[a-z]+$/);
      expect(getMessageLanguages(cmd.descKey as string), cmd.name).toEqual(expect.arrayContaining(['en', 'tr']));
    }
  });

  it('desc is the catalog message resolved for the requested language', () => {
    for (const cmd of en) expect(cmd.desc, cmd.name).toBe(getMessage(cmd.descKey as string, 'en'));
    for (const cmd of tr) expect(cmd.desc, cmd.name).toBe(getMessage(cmd.descKey as string, 'tr'));
  });

  it('English descriptions carry no Turkish-only glyphs and differ from the Turkish text', () => {
    for (const cmd of en) expect(cmd.desc, cmd.name).not.toMatch(TURKISH_ONLY_GLYPHS);
    const enHelp = en.find((c) => c.name === '/help');
    const trHelp = tr.find((c) => c.name === '/help');
    expect(enHelp?.desc).not.toBe(trHelp?.desc);
  });

  it('Turkish descriptions are preserved byte-for-byte for existing users', () => {
    expect(tr.find((c) => c.name === '/help')?.desc).toBe('Kullanılabilir komutları listele');
    expect(tr.find((c) => c.name === '/clear')?.desc).toBe('Ekranı temizle');
  });

  it('danger rows keep their textual carrier but drop the ⚠️ emoji icon (SINGLE-SURFACE §7, PLATFORM-MATRIX §6)', () => {
    // Danger tier derives from classifyTool → 'always' (chat-native.ts), never
    // from the glyph; "(her seferinde onay)" / "(confirmation every time)" is
    // the textual carrier and the Actions catalog adds the `!` badge.
    expect(tr.find((c) => c.name === '/kill')?.desc).toBe('Aktif sprint/worker durdur (her seferinde onay)');
    expect(en.find((c) => c.name === '/kill')?.desc).toContain('(confirmation every time)');
  });

  it('no description in either language carries emoji, variation selectors or ZWJ (ambiguous-width glyphs)', () => {
    const ambiguous = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/u;
    for (const cmd of [...en, ...tr]) expect(cmd.desc, `${cmd.name}: ${cmd.desc}`).not.toMatch(ambiguous);
  });

  it('English copy carries no internal capability ids or vendor repo paths and points /model at /models', () => {
    for (const cmd of en) {
      expect(cmd.desc, cmd.name).not.toContain('terminal.run_flow_v2');
      expect(cmd.desc, cmd.name).not.toContain('~/deckent-dev');
    }
    expect(en.find((c) => c.name === '/model')?.desc).toContain('/models');
  });

  it('command names and dispatch metadata are language-invariant', () => {
    expect(en.map((c) => c.name)).toEqual(tr.map((c) => c.name));
    expect(en.map((c) => c.agenticTool)).toEqual(tr.map((c) => c.agenticTool));
    expect(en.map((c) => c.category)).toEqual(tr.map((c) => c.category));
    expect(en.map((c) => c.risk)).toEqual(tr.map((c) => c.risk));
  });

  it('buildSlashRegistry() without a language resolves through getLanguage()', () => {
    const resolved = getLanguage();
    expect(buildSlashRegistry().map((c) => c.desc)).toEqual(buildSlashRegistry(resolved).map((c) => c.desc));
  });
});

describe('slash catalog i18n — /help rendering hands the language through', () => {
  it('renderHelp localizes the "Commands:" header', () => {
    const enLines = renderHelp(buildSlashRegistry('en'), 'en').split('\n');
    const trLines = renderHelp(buildSlashRegistry('tr'), 'tr').split('\n');
    expect(enLines[0]).toBe(getMessage('tui.help.commands_header', 'en'));
    expect(trLines[0]).toBe('Komutlar:');
    expect(enLines[0]).not.toBe(trLines[0]);
  });

  it('renderHelp lists the resolved-language description', () => {
    const en = buildSlashRegistry('en');
    const out = renderHelp(en, 'en');
    expect(out).toContain(en.find((c) => c.name === '/help')?.desc);
    expect(out).not.toContain('Kullanılabilir komutları listele');
  });

  it('getVisibleCommands(mode, simpleMode, lang) builds the catalog for that language', () => {
    const visible = getVisibleCommands('user', false, 'en');
    expect(visible.find((c) => c.name === '/help')?.desc).toBe(getMessage('tui.slash.desc.help', 'en'));
    const simple = getVisibleCommands('user', true, 'tr');
    expect(simple.find((c) => c.name === '/help')?.desc).toBe('Kullanılabilir komutları listele');
  });

  it('buildHelpOutput(mode, "en") renders the English catalog end-to-end', () => {
    const out = buildHelpOutput('user', 'en');
    expect(out.split('\n')[0]).toBe(getMessage('tui.help.commands_header', 'en'));
    expect(out).toContain(getMessage('tui.slash.desc.help', 'en'));
    expect(out).not.toContain('Kullanılabilir komutları listele');
  });

  it('help catalog tier headers localize (Danger → Tehlike in tr, unchanged in en)', () => {
    expect(buildHelpCatalogLabels('en').categoryName('Danger')).toBe('Danger');
    expect(buildHelpCatalogLabels('tr').categoryName('Danger')).toBe(getMessage('tui.help.tier.danger', 'tr'));
    expect(getMessage('tui.help.tier.danger', 'tr')).not.toBe('Danger');
    for (const tier of ['Core', 'Project', 'MCP', 'Enterprise', 'Danger']) {
      expect(buildHelpCatalogLabels('en').categoryName(tier)).toBe(getMessage(`tui.help.tier.${tier.toLowerCase()}`, 'en'));
      expect(buildHelpCatalogLabels('tr').categoryName(tier)).toBe(getMessage(`tui.help.tier.${tier.toLowerCase()}`, 'tr'));
    }
  });

  it('an unknown tier fails closed with a typed UnknownHelpTierError — the raw token is never rendered as user text', () => {
    // Main-session REVISE (2026-09-02): `key === undefined ? category : …` was a
    // silent English fallback. The five-tier map is exhaustive by type; a
    // runtime string outside it is a defect, not a heading.
    for (const lang of ['en', 'tr']) {
      let caught: unknown;
      try { buildHelpCatalogLabels(lang).categoryName('Bogus'); } catch (err) { caught = err; }
      expect(caught, lang).toBeInstanceOf(UnknownHelpTierError);
      const typed = caught as UnknownHelpTierError;
      expect(typed.tier).toBe('Bogus');
      expect(typed.code).toBe('E_HELP_TIER_UNKNOWN');
      expect(typed.message).toBe('E_HELP_TIER_UNKNOWN'); // code only — no prose
    }
    // Prototype-chain names are not tiers either (fail-closed lookup).
    expect(() => buildHelpCatalogLabels('en').categoryName('toString')).toThrow(UnknownHelpTierError);
  });
});
