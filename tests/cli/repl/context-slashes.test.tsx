// tests/cli/repl/context-slashes.test.tsx
// ═══ TERMINAL-TOOLS-010 — /context, /compact and the `?` shortcuts panel ═════
//
// Parity P1: Claude Code (/context grid, /compact, `?` shortcut help), Codex
// CLI (/status token usage, /compact, `?`), Hermes (/compress). REPL layer:
// the native engine exposes contextSnapshot / compactContext, run.tsx answers
// both slashes locally (zero provider turns for /context; /compact makes one
// checkpoint call through the session), the slash catalog lists them with
// en/tr descriptions, and the composer shows a caller-injected shortcuts
// panel when `?` is typed on an empty draft. Hermetic.

import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveContextSlash, resolveCompactSlash, withContextSlashes,
  buildContextSlashLabels, buildShortcutsPanel, buildReplLabels,
} from '../../../src/cli/repl/run.js';
import type { ReplEngine, ContextSnapshot } from '../../../src/cli/repl/native-agent-bridge.js';
import { buildSlashRegistry } from '../../../src/cli/commands/chat-slash-registry.js';
import { InputBar } from '../../../src/cli/repl/input-bar.js';
import { getMessage, getMessageLanguages } from '../../../src/cli/helpers/messages.js';

const tFor = (lang: string) => (key: string): string => getMessage(key, lang);
const snapshot: ContextSnapshot = {
  window: 200_000, measuredInputTokens: 50_000, epoch: 2, messages: 14, preambleMessages: 3,
  checkpoint: 'ok', refreshPlanned: false, highWaterRatio: 0.75,
  lastRequestMeasurement: {
    type: 'request-measurement', purpose: 'turn', decision: {
      admitted: true, availableTokens: 150_000,
      measurement: {
        inputTokens: 50_000, quality: 'exact', provenance: 'provider-counter', requestDigest: 'safe-digest',
        identity: { provider: 'openai', model: 'model-a', contextWindowTokens: 200_000, contextProvenance: 'model-registry' },
      },
    },
  },
  providerReportedUsage: { inputTokens: 50_000, outputTokens: 500, reports: 1 },
};
function fakeEngine(extra: Partial<ReplEngine> = {}): ReplEngine & { sends: string[] } {
  const sends: string[] = [];
  const engine = (async (input: string, cbs: { output: (t: string) => void; onTurnEnd: (s: { inputTokens: number; outputTokens: number }) => void }) => {
    sends.push(input); cbs.output(`ok:${input}`); cbs.onTurnEnd({ inputTokens: 1, outputTokens: 1 });
  }) as unknown as ReplEngine & { sends: string[] };
  engine.sends = sends;
  Object.assign(engine, extra);
  return engine;
}

describe('slash catalog — /context and /compact are discoverable in en and tr', () => {
  it('both commands are listed with localized descriptions', () => {
    for (const lang of ['en', 'tr'] as const) {
      const names = buildSlashRegistry(lang).map((c) => c.name);
      expect(names).toContain('/context');
      expect(names).toContain('/compact');
    }
    for (const key of ['tui.slash.desc.context', 'tui.slash.desc.compact']) {
      expect(getMessageLanguages(key)).toEqual(expect.arrayContaining(['en', 'tr']));
    }
  });
});

describe('resolveContextSlash — read-only snapshot lines', () => {
  const labels = buildContextSlashLabels(tFor('en'));

  it('ignores other input; reports unavailable on an engine without the seam', async () => {
    expect(await resolveContextSlash('hello', fakeEngine(), labels)).toBeUndefined();
    expect(await resolveContextSlash('/context', fakeEngine(), labels)).toBe(labels.unavailable);
  });

  it('renders the cached last actual request, not a synthetic current-occupancy percentage', async () => {
    const engine = fakeEngine({ contextSnapshot: async () => snapshot });
    const text = await resolveContextSlash('  /CONTEXT ', engine, labels);
    expect(text).toContain('50000');
    expect(text).toContain('200000');
    expect(text).toContain('last actual request');
    expect(text).toContain('openai');
    expect(text).toContain('model-a');
    expect(text).toContain('provider reports');
    expect(text).toContain('25% of that request window');
    expect(text).not.toContain('in use:');
    expect(text).toContain('2'); // epoch
    expect(text).toContain('14');
    expect(engine.sends).toEqual([]); // zero provider turns
  });

  it('says "unknown" (catalog) when no actual request exists instead of guessing', async () => {
    const engine = fakeEngine({ contextSnapshot: async () => ({
      ...snapshot, window: undefined, measuredInputTokens: undefined,
      lastRequestMeasurement: undefined, providerReportedUsage: undefined,
    }) });
    const text = await resolveContextSlash('/context', engine, labels);
    expect(text).toContain(labels.unknown);
    expect(text).not.toMatch(/\(\d+%\)/); // no occupancy percentage is invented
  });
});

describe('resolveCompactSlash — explicit compaction outcome lines', () => {
  const labels = buildContextSlashLabels(tFor('tr'));

  it('reports each outcome from the engine seam and unavailable without it', async () => {
    expect(await resolveCompactSlash('/compact', fakeEngine(), labels)).toBe(labels.compactUnavailable);
    const compacted = fakeEngine({ compactContext: async () => ({ outcome: 'compacted', epoch: 3 }) });
    expect(await resolveCompactSlash('/compact', compacted, labels)).toBe(labels.compacted.replace('{epoch}', '3'));
    const degraded = fakeEngine({ compactContext: async () => ({ outcome: 'degraded', epoch: 2 }) });
    expect(await resolveCompactSlash('/compact', degraded, labels)).toBe(labels.compactDegraded.replace('{epoch}', '2'));
    const noStore = fakeEngine({ compactContext: async () => ({ outcome: 'unavailable', epoch: 1 }) });
    expect(await resolveCompactSlash('/compact', noStore, labels)).toBe(labels.compactUnavailable);
  });

  it.each(['en', 'tr'] as const)('keeps the raw typed compact cause and its localized safe action in %s', async (lang) => {
    const labels = buildContextSlashLabels(tFor(lang));
    const overflow = fakeEngine({ compactContext: async () => ({ outcome: 'degraded', epoch: 2, reasonCode: 'INPUT_CONTEXT_OVERFLOW' }) });
    const authority = fakeEngine({ compactContext: async () => ({ outcome: 'degraded', epoch: 2, reasonCode: 'INPUT_CONTEXT_AUTHORITY_UNAVAILABLE' }) });
    expect(await resolveCompactSlash('/compact', overflow, labels)).toBe(labels.errorOverflow);
    expect(await resolveCompactSlash('/compact', authority, labels)).toBe(labels.errorAuthorityUnavailable);
    expect(labels.errorOverflow).toContain('INPUT_CONTEXT_OVERFLOW');
    expect(labels.errorAuthorityUnavailable).toContain('INPUT_CONTEXT_AUTHORITY_UNAVAILABLE');
  });
});

describe('withContextSlashes — local answers, everything else passes through, members forwarded', () => {
  it.each([[5, 2], [0, 0]] as const)('answers /context and /compact with aggregate usage %i/%i and forwards the live measurement callback', async (inputTokens, outputTokens) => {
    const measurements: unknown[] = [];
    const inner = fakeEngine({
      contextSnapshot: async () => snapshot,
      compactContext: async (callbacks: Parameters<NonNullable<ReplEngine['compactContext']>>[0]) => {
        callbacks?.onRequestMeasurement?.(snapshot.lastRequestMeasurement!);
        return { outcome: 'compacted', epoch: 3, usage: { inputTokens, outputTokens } };
      },
      cancelTurn: () => true,
    });
    const engine = withContextSlashes(inner, buildContextSlashLabels(tFor('en')));
    const out: string[] = []; const ended: Array<{ inputTokens: number; outputTokens: number }> = [];
    const cbs = {
      output: (t: string) => out.push(t),
      onTurnEnd: (stats: { inputTokens: number; outputTokens: number }) => { ended.push(stats); },
      onRequestMeasurement: (event: unknown) => measurements.push(event),
    };
    await engine('/context', cbs);
    await engine('/compact', cbs);
    expect(inner.sends).toEqual([]);
    expect(ended).toEqual([{ inputTokens: 0, outputTokens: 0 }, { inputTokens, outputTokens }]);
    expect(measurements).toEqual([snapshot.lastRequestMeasurement]);
    expect(out.join('\n')).toContain('last actual request');
    expect(out.join('\n')).toContain('3');
    await engine('hello', cbs);
    expect(inner.sends).toEqual(['hello']);
    expect(engine.cancelTurn?.()).toBe(true);
  });
});

describe('shortcuts panel — catalog-built, shown on `?` from an empty composer', () => {
  const roots: string[] = [];
  afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });
  const tick = (ms = 25): Promise<void> => new Promise((r) => setTimeout(r, ms));

  it('buildShortcutsPanel resolves a title and ≥ 10 rows for en and tr, with distinct languages', () => {
    const en = buildShortcutsPanel(tFor('en'));
    const tr = buildShortcutsPanel(tFor('tr'));
    expect(en.rows.length).toBeGreaterThanOrEqual(10);
    expect(tr.rows.length).toBe(en.rows.length);
    expect(en.title).not.toBe(tr.title);
    for (const row of en.rows) { expect(row.keys.length).toBeGreaterThan(0); expect(row.action.length).toBeGreaterThan(0); }
  });

  it('`?` on an empty composer toggles the panel and never enters the buffer; `?` inside text is a normal character', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-shortcuts-'));
    roots.push(root);
    const en = buildReplLabels(tFor('en'));
    const panel = buildShortcutsPanel(tFor('en'));
    const onSubmit = vi.fn();
    const { stdin, lastFrame, unmount } = render(
      <InputBar
        active onSubmit={onSubmit} onInterrupt={() => {}}
        menuMoreAbove={en.menuMoreAbove} menuMoreBelow={en.menuMoreBelow} reverseSearchLabel={en.reverseSearch}
        shortcutsPanel={panel} historyProjectRoot={root} caretStyle="marker"
      />,
    );
    await tick();
    stdin.write('?');
    await tick();
    expect(lastFrame() ?? '').toContain(panel.title);
    expect(lastFrame() ?? '').toContain('› |'); // buffer stayed empty
    stdin.write('?');
    await tick();
    expect(lastFrame() ?? '').not.toContain(panel.title);
    stdin.write('a?');
    await tick();
    expect(lastFrame() ?? '').toContain('› a?|');
    expect(lastFrame() ?? '').not.toContain(panel.title);
    unmount();
  });
});
