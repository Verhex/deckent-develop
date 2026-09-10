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
  formatContextSnapshot, resolveContextSlash, resolveCompactSlash, withContextSlashes,
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

  it('renders REPL selection vs last admitted measurement (not inference proof)', async () => {
    const engine = fakeEngine({ contextSnapshot: async () => snapshot });
    const aligned = await resolveContextSlash('/context', engine, labels, {
      activeSelection: { provider: 'openai', model: 'model-a' },
    });
    expect(aligned).toContain('REPL selection');
    expect(aligned).toContain('last measured request');
    expect(aligned).toContain('not dispatch/response proof');

    const mismatch = await resolveContextSlash('/context', engine, labels, {
      activeSelection: { provider: 'anthropic', model: 'claude-opus' },
    });
    expect(mismatch).toContain('provider mismatch');

    const denied = await resolveContextSlash('/context', engine, labels, {
      activeSelection: { provider: 'openai', model: 'model-a' },
    });
    expect(denied).toBeDefined();
  });

  it('renders native work budget lines when the snapshot includes them', () => {
    const labels = buildContextSlashLabels(tFor('en'));
    const text = formatContextSnapshot({
      ...snapshot,
      sessionLifecycle: {
        conversation: 'open',
        operation: 'idle',
        turnSequence: 3,
        userIdleMs: 120_000,
        userIdleTracked: true,
        permissionPending: false,
        budgetBlocked: false,
        workBudget: {
          budgetEpoch: 1,
          elapsedWorkMs: 90_000,
          maxWallTimeMs: 2_700_000,
          rounds: 2,
          maxModelRounds: 120,
          toolCalls: 5,
          maxToolCalls: 400,
          cumulativeTokens: 10_000,
          maxCumulativeTokens: 2_000_000,
        },
      },
    }, labels);
    expect(text).toContain('not user idle TTL');
    expect(text).toContain('90');
    expect(text).toContain('2 / 120');
  });

  it('does not claim alignment for denied last measurement', async () => {
    const deniedSnapshot: ContextSnapshot = {
      ...snapshot,
      lastRequestMeasurement: {
        ...snapshot.lastRequestMeasurement!,
        decision: { ...snapshot.lastRequestMeasurement!.decision, admitted: false },
      },
    };
    const engine = fakeEngine({ contextSnapshot: async () => deniedSnapshot });
    const text = await resolveContextSlash('/context', engine, labels, {
      activeSelection: { provider: 'openai', model: 'model-a' },
    });
    expect(text).toContain('not performed');
    expect(text).not.toContain('not dispatch/response proof');
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

  it('renders retained tool-result pressure when the snapshot carries it', async () => {
    const engine = fakeEngine({ contextSnapshot: async () => ({
      ...snapshot,
      lastCheckpointPressure: {
        retainedTokens: 4500, capTokens: 19_660, windowTokens: 131_072,
        quality: 'exact', scope: 'tool-results',
      },
    }) });
    const text = await resolveContextSlash('/context', engine, labels);
    expect(text).toContain('4500');
    expect(text).toContain('19660');
    expect(text).toContain('131072');
    expect(text).toContain('retained tool results');
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
  it.each(['en', 'tr'] as const)('reports failed-compaction usage once without a normal engine turn in %s', async (lang) => {
    const compactContext = vi.fn(async (callbacks: Parameters<NonNullable<ReplEngine['compactContext']>>[0]) => {
      callbacks?.onRequestMeasurement?.(snapshot.lastRequestMeasurement!);
      return {
        outcome: 'degraded' as const,
        epoch: 2,
        reasonCode: 'CHECKPOINT_RESPONSE_INVALID_JSON',
        usage: { inputTokens: 13, outputTokens: 5 },
      };
    });
    const inner = fakeEngine({ compactContext });
    const labels = buildContextSlashLabels(tFor(lang));
    const engine = withContextSlashes(inner, labels);
    const output: string[] = [];
    const ended: Array<{ inputTokens: number; outputTokens: number }> = [];
    const measurements: unknown[] = [];

    await engine('/compact', {
      output: (text) => output.push(text),
      onTurnEnd: (stats) => ended.push(stats),
      onRequestMeasurement: (event) => measurements.push(event),
    });

    expect(compactContext).toHaveBeenCalledOnce();
    expect(inner.sends).toEqual([]);
    expect(ended).toEqual([{ inputTokens: 13, outputTokens: 5 }]);
    expect(measurements).toEqual([snapshot.lastRequestMeasurement]);
    expect(output).toEqual([labels.compactDegraded.replace('{epoch}', '2')]);
    // Generic checkpoint failures intentionally expose the degraded state but
    // not the raw internal reason on this surface. The durable checkpoint/audit
    // projection retains CHECKPOINT_RESPONSE_INVALID_JSON.
    expect(output.join('\n')).not.toContain('CHECKPOINT_RESPONSE_INVALID_JSON');
  });

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


describe('/context trigger and cached request provenance', () => {
  const triggerCases = [
    ['token-pressure', 'measured context pressure', 'ölçülmüş bağlam baskısı'],
    ['overflow', 'input overflow recovery', 'girdi taşması kurtarması'],
    ['manual', 'explicit compaction', 'doğrudan sıkıştırma'],
    ['planned', 'planned context refresh', 'planlanmış bağlam yenileme'],
    ['cadence', 'execution budget checkpoint', 'yürütme bütçesi checkpoint’i'],
  ] as const;

  it.each(triggerCases)('localizes the %s trigger in EN and TR without a provider turn', async (trigger, en, tr) => {
    for (const [lang, expected] of [['en', en], ['tr', tr]] as const) {
      const engine = fakeEngine({ contextSnapshot: async () => ({ ...snapshot, lastContextTrigger: trigger }) });
      const text = await resolveContextSlash('/context', engine, buildContextSlashLabels(tFor(lang)));
      expect(text).toContain(expected);
      expect(text).not.toContain(lang === 'en' ? tr : en);
      expect(text).not.toContain('native-context.trigger.');
      expect(engine.sends).toEqual([]);
    }
  });

  it.each(['en', 'tr'] as const)('retains the actual cached request provenance across changed live snapshot fields in %s', async (lang) => {
    const labels = buildContextSlashLabels(tFor(lang));
    const engine = fakeEngine({ contextSnapshot: async () => ({
      ...snapshot,
      window: 800_000,
      measuredInputTokens: 799_999,
      epoch: 9,
      lastContextTrigger: 'manual',
    }) });
    const text = await resolveContextSlash('/context', engine, labels);
    expect(text).toContain(labels.provenance.replace('{provenance}', 'provider-counter'));
    expect(text).toContain(labels.digest.replace('{digest}', 'safe-digest'));
    expect(text).toContain(labels.providerModel.replace('{provider}', 'openai').replace('{model}', 'model-a'));
    expect(text).toContain(labels.measurement.replace('{tokens}', '50000').replace('{quality}', labels.qualityExact));
    expect(text).toContain(labels.capacity.replace('{available}', '150000').replace('{window}', '200000'));
    expect(text).toContain(labels.window.replace('{window}', '800000'));
    expect(text).not.toContain('799999');
    expect(text).not.toContain('100%');
    expect(engine.sends).toEqual([]);
  });

  it.each(['en', 'tr'] as const)('shows boot measurement authority on /context in %s', async (lang) => {
    const labels = buildContextSlashLabels(tFor(lang));
    const engine = fakeEngine({
      contextSnapshot: async () => ({
        ...snapshot,
        measurementAuthority: { state: 'exact-available', provenance: 'llama.cpp-apply-template-tokenize' },
      }),
    });
    const text = await resolveContextSlash('/context', engine, labels);
    expect(text).toContain(labels.measurementStateExact!);
    expect(engine.sends).toEqual([]);
  });

  it.each(['en', 'tr'] as const)('does not invent a trigger or provenance before any actual request in %s', async (lang) => {
    const labels = buildContextSlashLabels(tFor(lang));
    const engine = fakeEngine({ contextSnapshot: async () => ({
      ...snapshot, lastContextTrigger: undefined, lastRequestMeasurement: undefined,
    }) });
    const text = await resolveContextSlash('/context', engine, labels);
    expect(text).toContain(labels.requestUnavailable);
    expect(text).not.toContain('provider-counter');
    expect(text).not.toContain('safe-digest');
    for (const value of Object.values(labels.contextTriggers!)) expect(text).not.toContain(value);
    expect(engine.sends).toEqual([]);
  });
});

it.each(['en', 'tr'])('shows measured preamble budget in %s', lang => {
  const rendered = formatContextSnapshot({...snapshot, preambleBudget: {hardLimit: 90000, status: 'within-target',
    tokens: 10000, limit: 19660, window: 131072, quality: 'conservative-upper-bound',
    provenance: 'utf8-wire-bytes-plus-framing', toolCount: 3, reduced: true,
  }}, buildContextSlashLabels(tFor(lang)));
  expect(rendered).toContain('10000/19660');
  expect(rendered).toContain(lang === 'en' ? '3 tool schemas' : '3 araç şeması');
});

it.each(['en','tr'])('shows the admitted preamble floor warning in %s',lang=>{
 const rendered=formatContextSnapshot({...snapshot,preambleBudget:{tokens:3500,limit:2457,window:16384,hardLimit:8601,quality:'conservative-upper-bound',provenance:'utf8-wire-bytes-plus-framing',toolCount:3,reduced:true,status:'floor-admitted'}},buildContextSlashLabels(tFor(lang)));
 expect(rendered).toContain(tFor(lang)('native-context.slash.preamble_floor_admitted'));
});
