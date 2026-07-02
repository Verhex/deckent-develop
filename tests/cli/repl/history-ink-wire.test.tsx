// tests/cli/repl/history-ink-wire.test.tsx
// Sprint 360 Task 360-017 (HISTORY-INK-WIRE): wires the persistent,
// prefix-filtered input-history core (input-history.ts, sprint 359-010) into
// input-bar.tsx's ↑/↓ + Enter handling.
//
// `ink-testing-library` is NOT a project dependency (confirmed repeatedly —
// see tests/cli/repl/term-compat-matrix.test.ts header, tests/cli/repl-tool-
// multi-tag-repro.test.ts, tests/cli/repl-surface-wire.test.tsx). Following
// that established pattern: the actual wiring logic added to input-bar.tsx
// (createHistoryController / resolveHistoryNav / recordHistoryEntry) is pure
// and exported for exactly this reason — exercised directly here instead of
// mounting <InputBar> in a fake terminal.
//
// Covered (via the exported seams):
//   - empty-input ↑ → most recent entry ("boş-input up→son-giriş")
//   - prefix-typed ↑ → filtered to that prefix ("prefix-yazıp-up→filtreli")
//   - ↓ back to the live/draft line after navigating up
//   - Enter → recordHistoryEntry persists to disk AND grows in-session nav
//     ("Enter'da append"), verified via a fresh loadHistory() read
//     (simulates history surviving a REPL restart)
//   - createHistoryController loads pre-seeded on-disk history at construction
//
// NOT covered by a seam (documented, not silently dropped — matches the
// term-compat-matrix.test.ts convention):
//   - the real useInput key-dispatch inside <InputBar> (arrow-key routing,
//     slash-menu precedence, Ctrl-R precedence over history nav) — needs a
//     real PTY/ink-testing-library, not available in this suite
//   - left/right/home/end cursor movement — untouched by this task, already
//     covered by editInput's own tests (term-compat-matrix.test.ts)
//
// Hermetic: every test uses its own mkdtemp tmpdir project root, cleaned up
// in afterEach. No project-root or HOME files are read or written.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import {
  createHistoryController,
  resolveHistoryNav,
  recordHistoryEntry,
} from '../../../src/cli/repl/input-bar.js';
import { loadHistory, appendHistory } from '../../../src/cli/repl/input-history.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'deckent-history-ink-wire-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('createHistoryController', () => {
  it('starts empty when no history file exists yet', () => {
    const controller = createHistoryController(dir);
    expect(controller.entries).toEqual([]);
  });

  it('loads pre-seeded on-disk history at construction', () => {
    appendHistory(dir, 'deckent status');
    appendHistory(dir, 'deckent history');
    const controller = createHistoryController(dir);
    expect(controller.entries).toEqual(['deckent status', 'deckent history']);
  });
});

describe('resolveHistoryNav — empty-input up → most recent entry', () => {
  it('returns the newest entry on the first ↑ with an empty buffer', () => {
    const controller = createHistoryController(dir);
    controller.entries.push('alpha', 'beta', 'gamma');
    const next = resolveHistoryNav(controller.navigator, -1, '');
    expect(next).toEqual({ buffer: 'gamma', cursor: 5 });
  });

  it('keeps walking older entries on repeated ↑', () => {
    const controller = createHistoryController(dir);
    controller.entries.push('alpha', 'beta', 'gamma');
    resolveHistoryNav(controller.navigator, -1, ''); // gamma
    const next = resolveHistoryNav(controller.navigator, -1, '');
    expect(next.buffer).toBe('beta');
  });
});

describe('resolveHistoryNav — prefix-typed up → filtered', () => {
  it('only cycles through entries matching the typed prefix', () => {
    const controller = createHistoryController(dir);
    controller.entries.push('deckent status', 'git log', 'deckent history', 'ls');
    const first = resolveHistoryNav(controller.navigator, -1, 'de');
    expect(first.buffer).toBe('deckent history');
    const second = resolveHistoryNav(controller.navigator, -1, 'de');
    expect(second.buffer).toBe('deckent status');
  });

  it('returns the buffer unchanged when nothing matches the prefix', () => {
    const controller = createHistoryController(dir);
    controller.entries.push('git log', 'ls');
    const next = resolveHistoryNav(controller.navigator, -1, 'zz');
    expect(next).toEqual({ buffer: 'zz', cursor: 2 });
  });
});

describe('resolveHistoryNav — down navigates back to the live line', () => {
  it('restores the empty live buffer after navigating up then down-through', () => {
    const controller = createHistoryController(dir);
    controller.entries.push('alpha', 'beta');
    resolveHistoryNav(controller.navigator, -1, ''); // beta
    resolveHistoryNav(controller.navigator, -1, ''); // alpha
    const backOne = resolveHistoryNav(controller.navigator, 1, '');
    expect(backOne.buffer).toBe('beta');
    const backToLive = resolveHistoryNav(controller.navigator, 1, '');
    expect(backToLive.buffer).toBe('');
  });

  it('restores the originally-typed prefix buffer after down-navigating past the newest match', () => {
    const controller = createHistoryController(dir);
    controller.entries.push('deckent status', 'deckent history');
    resolveHistoryNav(controller.navigator, -1, 'de'); // deckent history
    const backToOldest = resolveHistoryNav(controller.navigator, -1, 'de');
    expect(backToOldest.buffer).toBe('deckent status');
    const backOne = resolveHistoryNav(controller.navigator, 1, 'de');
    expect(backOne.buffer).toBe('deckent history');
    const backToLive = resolveHistoryNav(controller.navigator, 1, 'de');
    expect(backToLive.buffer).toBe('de');
  });

  it('is a no-op while already at the live line', () => {
    const controller = createHistoryController(dir);
    controller.entries.push('alpha');
    const next = resolveHistoryNav(controller.navigator, 1, 'draft');
    expect(next).toEqual({ buffer: 'draft', cursor: 5 });
  });
});

describe('recordHistoryEntry — Enter appends to disk + in-session history', () => {
  it('grows the in-session entries array', () => {
    const controller = createHistoryController(dir);
    recordHistoryEntry(dir, controller, 'deckent status');
    expect(controller.entries).toEqual(['deckent status']);
  });

  it('persists to disk — a fresh loadHistory() read sees it (simulated restart)', () => {
    const controller = createHistoryController(dir);
    recordHistoryEntry(dir, controller, 'deckent status');
    recordHistoryEntry(dir, controller, 'deckent history');
    expect(loadHistory(dir)).toEqual(['deckent status', 'deckent history']);
  });

  it('resets navigation back to the live line so the next ↑ re-enters fresh', () => {
    const controller = createHistoryController(dir);
    controller.entries.push('alpha', 'beta');
    resolveHistoryNav(controller.navigator, -1, ''); // navigating: beta
    recordHistoryEntry(dir, controller, 'gamma'); // submit — should reset()
    const next = resolveHistoryNav(controller.navigator, -1, '');
    expect(next.buffer).toBe('gamma'); // newest entry, not stuck mid-navigation
  });

  it('a newly recorded line is immediately reachable via prefix-filtered ↑', () => {
    const controller = createHistoryController(dir);
    recordHistoryEntry(dir, controller, 'deckent status --follow');
    const next = resolveHistoryNav(controller.navigator, -1, 'deckent');
    expect(next.buffer).toBe('deckent status --follow');
  });
});
