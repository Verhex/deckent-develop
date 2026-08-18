// tests/cli/atref-tool-mediated-battery.test.ts
// ═══ 562-003 — typed descriptor-fallback info line + incident battery ═══════
//
// Task 1 (562-001) taught `expandAtRefs` (at-ref.ts) to fall back to a single-line
// `[@ref-descriptor]` block instead of inlining a `@ref`'s full content when it
// doesn't fit the measured budget. This bridge (native-agent-bridge.ts) is the
// downstream consumer: it must (a) recognize that descriptor lineage instead of
// silently losing it, (b) prove the resulting provider request actually stays
// under budget (the whole point of the fallback), (c) never regress the small-ref
// inline path, and (d) tell the user ONE typed en/tr line when it happens.
//
// Every ring below is the REAL module — expandAtRefs, createNativeEngine,
// buildNativeToolRegistry, measureProviderRequest, decideProviderAdmission — no
// fixture-local reimplementation of any of them. Hermetic: tmpdir only, async
// fs, no spawnSync, no network.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expandAtRefs } from '../../src/cli/repl/at-ref.js';
import { createNativeEngine, parseAtRefLineage } from '../../src/cli/repl/native-agent-bridge.js';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { measureProviderRequest, decideProviderAdmission } from '../../src/agent/context-budget.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'atref-battery-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

const readerFor = (files: Readonly<Record<string, string>>) => (path: string): string | null =>
  Object.prototype.hasOwnProperty.call(files, path) ? (files[path] as string) : null;

/** Records every ProviderRequest the session dispatches; replies with a trivial
 *  scripted turn so `createNativeEngine` resolves without a real provider. */
function capturingAdapter(): { adapter: ProviderAdapter; requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = [];
  return {
    requests,
    adapter: {
      name: 'scripted',
      async *send(req) {
        requests.push(req);
        yield { type: 'text-delta', text: 'ok' } satisfies ProviderEvent;
        yield { type: 'done' } satisfies ProviderEvent;
      },
    },
  };
}

function baseDeps() {
  return {
    registry: buildNativeToolRegistry({ cwd: () => root }),
    cwd: root,
    model: 'm',
    confirm: async () => 'y' as const,
    toolSink: () => {},
  };
}

const THREE_LARGE_FILES = {
  'a.md': 'a'.repeat(50_000),
  'b.md': 'b'.repeat(50_000),
  'c.md': 'c'.repeat(50_000),
};

describe('562-003(a) — incident shape: 3x50KB refs + narrow budget stay descriptors, admission holds', () => {
  it('expandAtRefs produces no inline body and 3 descriptor lines under a narrow budget', () => {
    const { prompt, refs } = expandAtRefs('@a.md @b.md @c.md', readerFor(THREE_LARGE_FILES), {
      expansionBudgetChars: 500,
    });
    expect(refs.map((r) => r.mode)).toEqual(['descriptor', 'descriptor', 'descriptor']);
    expect(prompt).not.toMatch(/a{100,}|b{100,}|c{100,}/);
    expect((prompt.match(/\[@ref-descriptor\]/g) ?? []).length).toBe(3);
  });

  it('measured request under the descriptor path admits where the equivalent inline path would not', async () => {
    const narrow = expandAtRefs('@a.md @b.md @c.md', readerFor(THREE_LARGE_FILES), { expansionBudgetChars: 500 }).prompt;
    const wide = expandAtRefs('@a.md @b.md @c.md', readerFor(THREE_LARGE_FILES), { expansionBudgetChars: 200_000 }).prompt;
    expect(narrow).not.toEqual(wide);

    const narrowCapture = capturingAdapter();
    const narrowEngine = createNativeEngine({ adapter: narrowCapture.adapter, lang: 'en', ...baseDeps() });
    await narrowEngine(narrow, { output: () => {}, onTurnEnd: () => {} });

    const wideCapture = capturingAdapter();
    const wideEngine = createNativeEngine({ adapter: wideCapture.adapter, lang: 'en', ...baseDeps() });
    await wideEngine(wide, { output: () => {}, onTurnEnd: () => {} });

    const identity = (contextWindowTokens: number) =>
      ({ provider: 'test', model: 'm', contextWindowTokens, contextProvenance: 'model-registry' as const });

    // Calibrate the window against the descriptor-path request itself: comfortably
    // above its own measured size, but nowhere near enough for the ~150,000 raw
    // chars (~37,500+ tokens at a conservative 4 chars/token) the inline path adds.
    const narrowMeasurement = await measureProviderRequest({ request: narrowCapture.requests[0]!, identity: identity(10_000_000) });
    const window = narrowMeasurement.inputTokens + 5_000;

    const narrowDecision = decideProviderAdmission(
      await measureProviderRequest({ request: narrowCapture.requests[0]!, identity: identity(window) }),
      0,
      0,
    );
    expect(narrowDecision.admitted).toBe(true);

    const wideDecision = decideProviderAdmission(
      await measureProviderRequest({ request: wideCapture.requests[0]!, identity: identity(window) }),
      0,
      0,
    );
    expect(wideDecision.admitted).toBe(false);
  });
});

describe('562-003(b) — the descriptor-directed tool actually dispatches a real ranged read', () => {
  it('deckent_read_file (registry dispatch) returns a real numbered slice of the descriptored file', async () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line-${i + 1}`);
    writeFileSync(join(root, 'big.md'), `${lines.join('\n')}\n`, 'utf-8');
    const content = `${lines.join('\n')}\n`;

    const { prompt, refs } = expandAtRefs('@big.md', readerFor({ 'big.md': content }), {
      expansionBudgetChars: 10,
    });
    expect(refs[0]!.mode).toBe('descriptor');
    expect(prompt).toContain('read it in slices with deckent_read_file (offset/limit)');
    const descriptorLine = prompt.split('\n').find((l) => l.startsWith('[@ref-descriptor]'));
    expect(descriptorLine).toBeDefined();
    const path = /^\[@ref-descriptor\] (\S+) —/.exec(descriptorLine!)?.[1];
    expect(path).toBe('big.md');

    const registry = buildNativeToolRegistry({ cwd: () => root });
    const slice = await registry.get('deckent_read_file')!.handler({ path, offset: 2, limit: 3 });
    expect(slice.ok).toBe(true);
    expect((slice.output as string).split('\n')).toEqual([
      '[deckent] read_file: totalLines=200 range=2-4 returned=3 hasMore=true nextOffset=5',
      '     2\tline-2',
      '     3\tline-3',
      '     4\tline-4',
    ]);
  });
});

describe('562-003(c) — small-ref path stays inline, regression-free', () => {
  it('parseAtRefLineage still recovers rawIntent/expandedPayload/references for an inline ref', () => {
    const content = 'first\nsecond';
    const { prompt } = expandAtRefs('read @small.txt', readerFor({ 'small.txt': content }), {
      expansionBudgetChars: content.length,
    });
    const lineage = parseAtRefLineage(prompt);
    expect(lineage.rawIntent).toBe('read @small.txt');
    expect(lineage.expandedPayload).toBe(prompt);
    expect(lineage.references).toHaveLength(1);
    expect(lineage.references[0]).toMatchObject({ path: 'small.txt', ok: true, truncated: false });
  });

  it('no descriptor info line renders for an all-inline turn', async () => {
    const content = 'first\nsecond';
    const { prompt } = expandAtRefs('read @small.txt', readerFor({ 'small.txt': content }), {
      expansionBudgetChars: content.length,
    });
    const capture = capturingAdapter();
    const engine = createNativeEngine({ adapter: capture.adapter, lang: 'en', ...baseDeps() });
    const outputs: string[] = [];
    await engine(prompt, { output: (t) => outputs.push(t), onTurnEnd: () => {} });
    expect(outputs.join('')).not.toContain('reference(s) exceeded the measured budget');
  });
});

describe('562-003(d) — typed descriptor-fallback info line renders in en + tr, count-correct', () => {
  it.each(['en', 'tr'] as const)('renders exactly once with the right count in %s, framed as information not a rejection', async (lang) => {
    const narrow = expandAtRefs('@a.md @b.md @c.md', readerFor(THREE_LARGE_FILES), { expansionBudgetChars: 500 }).prompt;
    const capture = capturingAdapter();
    const engine = createNativeEngine({
      adapter: capture.adapter,
      lang,
      t: (key: string) => getMessage(key, lang),
      ...baseDeps(),
    });
    const outputs: string[] = [];
    await engine(narrow, { output: (t) => outputs.push(t), onTurnEnd: () => {} });
    const rendered = outputs.join('');

    const expectedLine = getMessage('native.reference-descriptor-fallback', lang).replace('{n}', '3');
    expect(rendered).toContain(expectedLine);
    // Exactly one info line for the whole turn (not one per reference).
    expect(rendered.split(expectedLine).length - 1).toBe(1);
    // Never phrased as a refusal/denial.
    expect(rendered.toLowerCase()).not.toMatch(/denied|reject|reddedildi/);
  });
});
