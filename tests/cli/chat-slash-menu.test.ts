import { describe, it, expect } from 'vitest';
import {
  filterSlashCommands,
  renderSlashMenu,
  reduceSlashMenu,
  CLOSED_MENU,
} from '../../src/cli/commands/chat-slash-menu.js';
import { buildSlashRegistry } from '../../src/cli/commands/chat-slash-registry.js';

// Sprint 224 T-224-020 — interactive `/` command menu (pure logic core).
const reg = buildSlashRegistry();

describe('filterSlashCommands (T-224-020)', () => {
  it('non-slash → no matches (menu closed)', () => {
    expect(filterSlashCommands(reg, 'selam')).toEqual([]);
  });
  it('bare / → all commands, /quit hidden', () => {
    const m = filterSlashCommands(reg, '/').map((c) => c.name);
    expect(m).toContain('/help');
    expect(m).toContain('/status');
    expect(m).not.toContain('/quit');
  });
  it('prefix filters', () => {
    const m = filterSlashCommands(reg, '/st').map((c) => c.name);
    expect(m).toContain('/status');
    expect(m.every((n) => n.startsWith('/st'))).toBe(true);
  });
});

describe('renderSlashMenu (T-224-020)', () => {
  it('empty matches → empty string', () => {
    expect(renderSlashMenu([], 0, true)).toBe('');
  });
  it('non-TTY → plain lines, selected marked ❯', () => {
    const m = filterSlashCommands(reg, '/');
    const out = renderSlashMenu(m, 0, false);
    expect(out).toContain('❯');
    expect(out).toContain('/help');
    expect(out).not.toContain('\x1b['); // no ANSI off-TTY
  });
  it('TTY → ANSI styling on the selected row', () => {
    const m = filterSlashCommands(reg, '/');
    expect(renderSlashMenu(m, 0, true)).toContain('\x1b[');
  });
});

describe('reduceSlashMenu (T-224-020)', () => {
  it('char "/" opens the menu', () => {
    const r = reduceSlashMenu(CLOSED_MENU, reg, { type: 'char', ch: '/' });
    expect(r.state.open).toBe(true);
    expect(r.state.query).toBe('');
  });
  it('typing after / builds the filter query', () => {
    let s = reduceSlashMenu(CLOSED_MENU, reg, { type: 'char', ch: '/' }).state;
    s = reduceSlashMenu(s, reg, { type: 'char', ch: 's' }).state;
    s = reduceSlashMenu(s, reg, { type: 'char', ch: 't' }).state;
    expect(s.query).toBe('st');
  });
  it('backspace on bare / closes the menu', () => {
    const open = reduceSlashMenu(CLOSED_MENU, reg, { type: 'char', ch: '/' }).state;
    const r = reduceSlashMenu(open, reg, { type: 'backspace' });
    expect(r.state.open).toBe(false);
  });
  it('down/up wrap the selection', () => {
    const open = reduceSlashMenu(CLOSED_MENU, reg, { type: 'char', ch: '/' }).state;
    const down = reduceSlashMenu(open, reg, { type: 'down' }).state;
    expect(down.selected).toBe(1);
    const up = reduceSlashMenu(open, reg, { type: 'up' }).state;
    expect(up.selected).toBeGreaterThanOrEqual(0); // wraps to last
  });
  it('select → returns the chosen command name + closes', () => {
    const open = reduceSlashMenu(CLOSED_MENU, reg, { type: 'char', ch: '/' }).state;
    const r = reduceSlashMenu(open, reg, { type: 'select' });
    expect(r.chosen).toBe('/help'); // first match
    expect(r.state.open).toBe(false);
  });
  it('escape closes the menu', () => {
    const open = reduceSlashMenu(CLOSED_MENU, reg, { type: 'char', ch: '/' }).state;
    expect(reduceSlashMenu(open, reg, { type: 'escape' }).state.open).toBe(false);
  });
});
