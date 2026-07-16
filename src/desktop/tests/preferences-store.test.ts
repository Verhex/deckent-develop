// D4-1 — preferences-store pins (restart-persist done-criterion): atomic 0600
// writes, corrupt/invalid-content degrades to defaults (never throws on read),
// merge semantics of set(), version gating. Hermetic: tmpdir baseDir, no HOME.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPreferencesStore } from '../src/main/preferences-store.js';
import { DEFAULT_PREFERENCES } from '../src/shared/theme-tokens.js';

let baseDir: string;

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'prefs-store-'));
});

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

describe('preferences-store (D4-1)', () => {
  it('returns defaults when no file exists (not corrupted — just first run)', () => {
    const store = createPreferencesStore({ baseDir });
    expect(store.get()).toEqual({ preferences: DEFAULT_PREFERENCES, corrupted: false });
  });

  it('set() persists and get() reads it back — restart-persist (fresh store instance)', () => {
    createPreferencesStore({ baseDir }).set({ watch: 'night-watch' });
    // a NEW store over the same dir = the "after restart" read
    const reread = createPreferencesStore({ baseDir }).get();
    expect(reread.preferences.watch).toBe('night-watch');
    expect(reread.corrupted).toBe(false);
  });

  it('set() merges over current state (customTokens survive a watch-only change)', () => {
    const store = createPreferencesStore({ baseDir });
    store.set({ customTokens: { accent: '#112233' } });
    store.set({ watch: 'open-sea' });
    expect(store.get().preferences).toEqual({
      version: 1,
      watch: 'open-sea',
      customTokens: { accent: '#112233' },
    });
  });

  it('writes with mode 0600 (umask-proof chmod re-assert)', () => {
    const store = createPreferencesStore({ baseDir });
    store.set({ watch: 'day-watch' });
    const mode = statSync(store.filePath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('corrupt JSON degrades to defaults with corrupted=true — never throws', () => {
    const store = createPreferencesStore({ baseDir });
    writeFileSync(store.filePath, '{not json', 'utf-8');
    expect(store.get()).toEqual({ preferences: DEFAULT_PREFERENCES, corrupted: true });
  });

  it('schema-invalid content (unknown watch) degrades to defaults', () => {
    const store = createPreferencesStore({ baseDir });
    writeFileSync(store.filePath, JSON.stringify({ version: 1, watch: 'dog-watch', customTokens: {} }), 'utf-8');
    expect(store.get()).toEqual({ preferences: DEFAULT_PREFERENCES, corrupted: true });
  });

  it('an unknown future version is unusable-safe (defaults) until a real migration lands', () => {
    const store = createPreferencesStore({ baseDir });
    writeFileSync(store.filePath, JSON.stringify({ version: 99, watch: 'day-watch', customTokens: {} }), 'utf-8');
    expect(store.get()).toEqual({ preferences: DEFAULT_PREFERENCES, corrupted: true });
  });

  it('set() rejects invalid input loudly (fail fast, nothing persisted)', () => {
    const store = createPreferencesStore({ baseDir });
    expect(() => store.set({ watch: 'dog-watch' as never })).toThrow();
    expect(store.get().preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it('set() output is the exact persisted content (atomic single write)', () => {
    const store = createPreferencesStore({ baseDir });
    const returned = store.set({ watch: 'open-sea', customTokens: { bg: '#010203' } });
    expect(JSON.parse(readFileSync(store.filePath, 'utf-8'))).toEqual(returned);
  });
});
