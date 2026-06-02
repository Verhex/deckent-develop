import { describe, it, expect } from 'vitest';
import { slashCompleter } from '../../src/cli/commands/chat-slash-registry.js';

// Sprint 224 T-224-017 — `/` command menu (readline completer).
describe('slashCompleter (T-224-017)', () => {
  it('non-slash line → no completions (normal chat)', () => {
    expect(slashCompleter('selam')).toEqual([[], 'selam']);
  });

  it('bare `/` → lists all commands (menu), /quit alias hidden', () => {
    const [hits, line] = slashCompleter('/');
    expect(line).toBe('/');
    expect(hits).toContain('/help');
    expect(hits).toContain('/status');
    expect(hits).not.toContain('/quit');
  });

  it('prefix → filters matching commands', () => {
    const [hits] = slashCompleter('/st');
    expect(hits).toContain('/status');
    expect(hits.every((h) => h.startsWith('/st'))).toBe(true);
  });

  it('no prefix match → falls back to full list (so the menu still shows)', () => {
    const [hits] = slashCompleter('/zzz');
    expect(hits.length).toBeGreaterThan(0);
  });
});
