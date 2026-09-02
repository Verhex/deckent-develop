// tests/cli/repl/string-free-closure.test.ts
// ═══ TERMINAL-TOOLS-002 — string-free mechanism closure ═════════════════════
//
// Closes the last English/Turkish literals owned by Terminal MECHANISM modules
// (app.tsx pure helpers, input-bar.tsx, helpers/live-footer.ts, the legacy
// thinking ticker and the non-TTY spinner label). Every user-visible label is
// injected from the catalog by run.tsx / entry.ts; a missing injection is a
// typed InjectedLabelMissingError (code-only message, structured `label`),
// never a silent fallback string. Hermetic: pure helpers + committed source
// text only — no Ink mount, no disk state outside the repo checkout.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { getMessage, getMessageLanguages } from '../../../src/cli/helpers/messages.js';
import { InjectedLabelMissingError, INJECTED_LABEL_MISSING_CODE } from '../../../src/cli/helpers/injected-label.js';
import { buildLiveFooter, type LiveFooterLabels } from '../../../src/cli/helpers/live-footer.js';
import {
  resolveModeLabel, buildResumePickerLines, resolveResumeCommand, renderBusyDecision,
  formatApprovalClosure, resolveSwitchGate, formatTurnErrorLine, type ReplLabels,
} from '../../../src/cli/repl/app.js';
import { buildReplLabels, buildLiveFooterLabels } from '../../../src/cli/repl/run.js';
import { buildThinkingVerbs, buildToolActivityVerbs, THINKING_VERBS_KEY, TOOL_ACTIVITY_TOOLS } from '../../../src/cli/commands/chat-thinking-verbs.js';
import { createThinkingTicker, renderToolActivity } from '../../../src/cli/commands/chat-render-region.js';

const ROOT = join(__dirname, '..', '..', '..');
const tFor = (lang: string) => (key: string): string => getMessage(key, lang);

function expectMissing(fn: () => unknown, label: string): void {
  let caught: unknown;
  try { fn(); } catch (err) { caught = err; }
  expect(caught).toBeInstanceOf(InjectedLabelMissingError);
  const typed = caught as InjectedLabelMissingError;
  expect(typed.code).toBe(INJECTED_LABEL_MISSING_CODE);
  expect(typed.message).toBe(INJECTED_LABEL_MISSING_CODE);
  expect(typed.label).toBe(label);
}

// ─── 1. run.tsx injects a COMPLETE, catalog-resolved label set ───────────────

describe('buildReplLabels — every field resolves from the catalog for en and tr', () => {
  for (const lang of ['en', 'tr'] as const) {
    it(`${lang}: no field is empty, undefined or a key echo`, () => {
      const labels = buildReplLabels(tFor(lang)) as unknown as Record<string, string>;
      for (const [field, value] of Object.entries(labels)) {
        expect(typeof value, field).toBe('string');
        expect(value.length, field).toBeGreaterThan(0);
        expect(value.startsWith('tui.') || value.startsWith('approval.'), field).toBe(false);
      }
    });
  }

  it('the reverse-search prompt is a catalog row (en+tr) carried by ReplLabels', () => {
    expect(getMessageLanguages('tui.reverse_search')).toEqual(expect.arrayContaining(['en', 'tr']));
    expect(buildReplLabels(tFor('tr')).reverseSearch).toBe(getMessage('tui.reverse_search', 'tr'));
    expect(buildReplLabels(tFor('tr')).reverseSearch).not.toBe(getMessage('tui.reverse_search', 'en'));
  });
});

// ─── 2. app.tsx pure helpers — no English fallback, typed error instead ──────

describe('app.tsx helpers fail closed on a missing label', () => {
  const en = buildReplLabels(tFor('en'));
  const none = {} as ReplLabels;

  it('resolveModeLabel', () => {
    expectMissing(() => resolveModeLabel('ask', none), 'modeAsk');
    expectMissing(() => resolveModeLabel('run', none), 'modeRun');
    expectMissing(() => resolveModeLabel('control', none), 'modeControl');
    expect(resolveModeLabel('ask', en)).toBe(getMessage('tui.mode_ask', 'en'));
  });

  it('buildResumePickerLines / resolveResumeCommand', () => {
    const disk = [{ id: 's1', title: 't', date: '2026-07-01T10:00:00.000Z', status: 'completed' }];
    expectMissing(() => buildResumePickerLines(disk, [], none), 'resumeHeader');
    expectMissing(() => resolveResumeCommand('1', disk, [], none), 'resumeSwitched');
    expectMissing(() => resolveResumeCommand('9', disk, [], none), 'resumeNotFound');
    expect(buildResumePickerLines([], [], none)).toEqual([]); // nothing to render → nothing required
  });

  it('renderBusyDecision', () => {
    expectMissing(() => renderBusyDecision({ kind: 'interrupted', aborted: true }, none), 'busyInterrupted');
    expectMissing(() => renderBusyDecision({ kind: 'interrupted', aborted: false }, none), 'busyInterruptUnavailable');
    expectMissing(() => renderBusyDecision({ kind: 'queue-status', busy: true, pendingBackgroundBuckets: 1 }, none), 'busyStateBusy');
    expectMissing(() => renderBusyDecision({ kind: 'steer-noop', reason: 'idle' }, none), 'busySteerIdle');
  });

  it('formatApprovalClosure / resolveSwitchGate / formatTurnErrorLine', () => {
    expectMissing(() => formatApprovalClosure('allow', 'x', none), 'approvalApproved');
    expectMissing(() => formatApprovalClosure('deny', 'x', none), 'approvalRejected');
    expectMissing(() => resolveSwitchGate(true, 'model', none), 'switchBusy');
    expect(resolveSwitchGate(false, 'model', none)).toEqual({ kind: 'apply' }); // idle path needs no label
    expectMissing(() => formatTurnErrorLine('boom', undefined as unknown as string), 'turnError');
    expectMissing(() => formatTurnErrorLine('boom', ''), 'turnError');
    expect(formatTurnErrorLine('boom', en.turnError)).toBe(`⚠ ${getMessage('tui.turn_error', 'en', { error: 'boom' })}`);
  });
});

// ─── 3. live-footer — labels are a required, complete injection ──────────────

describe('buildLiveFooter — required labels', () => {
  it('throws the typed error naming the first missing field', () => {
    expectMissing(() => buildLiveFooter({}, { labels: {} as LiveFooterLabels }), 'liveFooter.idle');
    const partial = { ...buildLiveFooterLabels(tFor('en')), degraded: '' };
    expectMissing(() => buildLiveFooter({ provider: { name: 'x', healthy: false } }, { labels: partial }), 'liveFooter.degraded');
  });

  it('renders with the injected set (tr) and never the English mechanism words', () => {
    const tr = buildLiveFooterLabels(tFor('tr'));
    expect(buildLiveFooter({}, { labels: tr, width: 80 })).toEqual([tr.idle]);
    expect(buildLiveFooter({ auth: 'logged-out' }, { labels: tr, width: 80 })[0]).toBe(`${tr.auth}: ${tr.loggedOut}`);
  });
});

// ─── 4. thinking verbs (legacy ticker) — catalog-owned, per language ─────────

describe('buildThinkingVerbs — legacy ticker verbs come from the catalog', () => {
  it('resolves ≥ 4 distinct verbs for en and tr, and the two languages differ', () => {
    const en = buildThinkingVerbs('en');
    const tr = buildThinkingVerbs('tr');
    expect(en.length).toBeGreaterThanOrEqual(4);
    expect(tr.length).toBeGreaterThanOrEqual(4);
    expect(new Set(en).size).toBe(en.length);
    expect(en).not.toEqual(tr);
    expect(getMessageLanguages(THINKING_VERBS_KEY)).toEqual(expect.arrayContaining(['en', 'tr']));
  });

  it('createThinkingTicker requires a non-empty verb list (typed error, no built-in Turkish list)', () => {
    const out = { isTTY: true, write: () => true } as unknown as NodeJS.WriteStream;
    expectMissing(() => createThinkingTicker(out, { isTty: true, verbs: [] }), 'thinkingVerbs');
  });

  it('buildToolActivityVerbs resolves a verb for every built-in tool in en and tr, and renderToolActivity uses it', () => {
    const en = buildToolActivityVerbs('en');
    const tr = buildToolActivityVerbs('tr');
    for (const tool of TOOL_ACTIVITY_TOOLS) {
      expect(en[tool], tool).toBeTruthy();
      expect(tr[tool], tool).toBeTruthy();
      expect(en[tool], tool).not.toBe(tr[tool]);
    }
    expect(renderToolActivity('deckent_bash', { cmd: 'ls' }, false, en)).toBe(`🔧 ${en['deckent_bash']}: ls…`);
    expect(renderToolActivity('deckent_bash', { cmd: 'ls' }, false, tr)).toBe(`🔧 ${tr['deckent_bash']}: ls…`);
    expect(renderToolActivity('deckent_mystery', {}, false, tr)).toBe('🔧 deckent_mystery…'); // technical token
  });
});

// ─── 5. source scan — mechanism modules own no default label objects ─────────

describe('mechanism modules carry no English default label objects', () => {
  const FILES = [
    'src/cli/repl/app.tsx',
    'src/cli/repl/input-bar.tsx',
    'src/cli/repl/inbox-card.tsx',
    'src/cli/repl/run-flow-inbox.ts',
    'src/cli/helpers/live-footer.ts',
    'src/cli/commands/chat-render-region.ts',
  ];
  for (const file of FILES) {
    it(`${file}: no DEFAULT_*_LABELS export, no \`labels.x ?? '…'\` fallback, no THINKING_VERBS list`, () => {
      const src = readFileSync(join(ROOT, file), 'utf-8');
      expect(src).not.toMatch(/export const DEFAULT_[A-Z_]*LABELS\b/);
      expect(src).not.toMatch(/labels\.[A-Za-z]+\s*\?\?\s*['"`]/);
      expect(src).not.toMatch(/export const THINKING_VERBS\b/);
      expect(src).not.toMatch(/const TOOL_VERBS\b/);
      expect(src).not.toMatch(/\(reverse-i-search\)/);
    });
  }

  it('entry.ts resolves the non-TTY spinner label and the ticker verbs from the catalog', () => {
    const src = readFileSync(join(ROOT, 'src/cli/entry.ts'), 'utf-8');
    expect(src).not.toMatch(/createSpinner\(['"`]/);
    expect(src).toMatch(/buildThinkingVerbs\(/);
  });
});
