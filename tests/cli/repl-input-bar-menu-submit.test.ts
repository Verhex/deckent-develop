// ═══ resolveMenuSubmit — slash-menu Enter regression (kök-fix) ═══════════════
//
// Root cause of the "/run yazınca mod değişmiyor" bug: filterSlashCommands
// falls back to the FULL catalog when nothing prefix-matches (menu stays
// open), and Enter used to submit the menu SELECTION (`matches[sel]`) — the
// selection resets to 0 on every keystroke, so typing an uncatalogued command
// (e.g. `/run` before the /term refactor) and pressing Enter actually
// submitted `/help`, the first catalog entry. resolveMenuSubmit
// (src/cli/repl/input-bar.tsx) closes this for EVERY registry-less slash
// command, not just /term: fallback list → submit the typed buffer; real
// prefix-match → submit the selection, as before.
//
// Pure-logic suite (no Ink mount) — same pattern as repl-surface-wire.test.tsx.

import { describe, it, expect } from 'vitest';
import { resolveMenuSubmit } from '../../src/cli/repl/input-bar.js';
import { filterSlashCommands } from '../../src/cli/commands/chat-slash-menu.js';
import { buildSlashRegistry, type SlashRegistry } from '../../src/cli/commands/chat-slash-registry.js';

/** Small fixture registry — deliberately WITHOUT /term, to model the exact
 * pre-fix trap of a handleSubmit-only command missing from the catalog. */
const FIXTURE: SlashRegistry = [
  { name: '/help', desc: 'help' },
  { name: '/status', desc: 'status' },
  { name: '/recall', desc: 'recall' },
  { name: '/retro', desc: 'retro' },
];

describe('resolveMenuSubmit — fallback full-list mode submits the typed buffer', () => {
  it('uncatalogued command + Enter → the buffer, never the menu selection (the /help bug)', () => {
    const matches = filterSlashCommands(FIXTURE, '/run');
    expect(matches.length).toBe(FIXTURE.length); // fallback: full list, menu open
    expect(resolveMenuSubmit('/run', matches, 0)).toBe('/run');
  });

  it('fallback mode ignores whatever row is selected', () => {
    const matches = filterSlashCommands(FIXTURE, '/xyz');
    expect(resolveMenuSubmit('/xyz', matches, 2)).toBe('/xyz');
  });
});

describe('resolveMenuSubmit — real prefix-match keeps selection semantics', () => {
  it('prefix-matching buffer + Enter → the selected command name', () => {
    const matches = filterSlashCommands(FIXTURE, '/re');
    expect(matches.map((c) => c.name)).toEqual(['/recall', '/retro']);
    expect(resolveMenuSubmit('/re', matches, 0)).toBe('/recall');
    expect(resolveMenuSubmit('/re', matches, 1)).toBe('/retro');
  });

  it('bare `/` prefix-matches everything → selection wins (browse-and-pick flow)', () => {
    const matches = filterSlashCommands(FIXTURE, '/');
    expect(resolveMenuSubmit('/', matches, 1)).toBe('/status');
  });

  it('matching is case-insensitive, mirroring filterSlashCommands', () => {
    const matches = filterSlashCommands(FIXTURE, '/RE');
    expect(resolveMenuSubmit('/RE', matches, 0)).toBe('/recall');
  });

  it('out-of-range selection degrades to the buffer (never a crash)', () => {
    expect(resolveMenuSubmit('/re', [], 0)).toBe('/re');
  });
});

describe('resolveMenuSubmit — live catalog (buildSlashRegistry) integration', () => {
  const live = buildSlashRegistry();

  it('/term IS catalogued now → real match, Enter submits /term itself', () => {
    const matches = filterSlashCommands(live, '/term');
    expect(matches[0]?.name).toBe('/term');
    expect(resolveMenuSubmit('/term', matches, 0)).toBe('/term');
  });

  it('/run stays uncatalogued (reserved for a future first-class command) → buffer submits', () => {
    const matches = filterSlashCommands(live, '/run');
    expect(matches.some((c) => c.name === '/run')).toBe(false);
    expect(resolveMenuSubmit('/run', matches, 0)).toBe('/run');
  });
});
