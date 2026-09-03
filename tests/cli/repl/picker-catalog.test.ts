// tests/cli/repl/picker-catalog.test.ts
// ═══ TERMINAL-PICKER-001 (P15a) — `cli-terminal-picker` catalog family ═══════
//
// Every picker string lives in one lane-owned family; both languages are
// mandatory and distinct, keys are namespaced, and the family is registered
// so getMessage resolves it. Hermetic.

import { describe, it, expect } from 'vitest';
import { CLI_TERMINAL_PICKER_MESSAGES } from '../../../src/cli/helpers/message-catalog/cli-terminal-picker.js';
import { MESSAGE_CATALOG_FAMILIES, getMessage, getMessageLanguages } from '../../../src/cli/helpers/messages.js';

describe('cli-terminal-picker family', () => {
  it('is registered and every key is tui.picker.* with non-empty, distinct en and tr', () => {
    expect(MESSAGE_CATALOG_FAMILIES['cli-terminal-picker']).toBe(CLI_TERMINAL_PICKER_MESSAGES);
    const keys = Object.keys(CLI_TERMINAL_PICKER_MESSAGES);
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      expect(key.startsWith('tui.picker.'), key).toBe(true);
      const row = CLI_TERMINAL_PICKER_MESSAGES[key]!;
      expect(row.en.length, key).toBeGreaterThan(0);
      expect(row.tr.length, key).toBeGreaterThan(0);
      expect(getMessageLanguages(key)).toEqual(expect.arrayContaining(['en', 'tr']));
      expect(getMessage(key, 'en')).toBe(row.en);
    }
    // Placeholders must survive translation.
    expect(getMessage('tui.picker.more', 'tr')).toContain('{n}');
    expect(getMessage('tui.picker.hint_filter', 'tr')).toContain('{query}');
    expect(getMessage('tui.picker.typed_hint', 'tr')).toContain('{command}');
  });
});
