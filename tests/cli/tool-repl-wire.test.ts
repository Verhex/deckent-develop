// tests/cli/tool-repl-wire.test.ts
// TOOL-REPL-WIRE (354-002) — bridges core TOOL-1/TOOL-2/TOOL-CORE/TOOL-3
// primitives into 3 native meta-tools (deckent_search_tools/describe_tool/
// call_tool), gated by `toolSurface.enabled` (default off).
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';
import type { DispatchResult } from '../../src/core/tool-dispatch.js';

function serializable(reg: ReturnType<typeof buildNativeToolRegistry>) {
  return reg
    .list()
    .map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, category: t.category, tier: t.tier, source: t.source }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

describe('tool_surface — flag-off byte-identical', () => {
  it('omitting toolSurface registers nothing new (no meta-tools)', () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir() });
    const names = reg.list().map((t) => t.name);
    expect(names).not.toContain('deckent_search_tools');
    expect(names).not.toContain('deckent_describe_tool');
    expect(names).not.toContain('deckent_call_tool');
  });

  it('toolSurface.enabled=false produces a byte-identical tool list to omitting it entirely', () => {
    const baseline = buildNativeToolRegistry({ cwd: () => tmpdir() });
    const off = buildNativeToolRegistry({ cwd: () => tmpdir(), toolSurface: { enabled: false } });
    expect(serializable(off)).toEqual(serializable(baseline));
  });
});

describe('tool_surface — flag-on registers exactly 3 meta-tools', () => {
  it('registers deckent_search_tools / deckent_describe_tool / deckent_call_tool', () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), toolSurface: { enabled: true } });
    expect(reg.get('deckent_search_tools')).toBeDefined();
    expect(reg.get('deckent_search_tools')!.tier).toBe('silent');
    expect(reg.get('deckent_describe_tool')).toBeDefined();
    expect(reg.get('deckent_describe_tool')!.tier).toBe('silent');
    expect(reg.get('deckent_call_tool')).toBeDefined();
    // born-607: 'confirm' → 'silent' — call_tool is a router; the single gate is
    // the bridge-injected engine-parity execImpl (an outer ask would double-prompt,
    // and an outer 'always' would persist a '**' grant silencing every nested call).
    expect(reg.get('deckent_call_tool')!.tier).toBe('silent');
  });

  it('does not remove or alter any pre-existing tool (superset of the flag-off list)', () => {
    const off = buildNativeToolRegistry({ cwd: () => tmpdir() });
    const on = buildNativeToolRegistry({ cwd: () => tmpdir(), toolSurface: { enabled: true } });
    const offNames = new Set(off.list().map((t) => t.name));
    const onNames = new Set(on.list().map((t) => t.name));
    for (const n of offNames) expect(onNames.has(n)).toBe(true);
    expect(onNames.size).toBe(offNames.size + 3);
  });
});

describe('deckent_search_tools', () => {
  it('finds a bridged tool by keyword and embeds the TOOL-CORE deferred-index pointer in its description', async () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), toolSurface: { enabled: true } });
    const searchDef = reg.get('deckent_search_tools')!;
    // deferredIndexLine lists every bridged tool NOT in tool-search.ts's core-7 —
    // with only deckent_status/deckent_review overlapping the core set, the vast
    // majority of the bridged catalog is deferred, so the pointer must be present.
    expect(searchDef.description).toMatch(/more tools/);

    const r = await searchDef.handler({ query: 'status' });
    expect(r.ok).toBe(true);
    // NT-06 (sprint-554): bounded envelope — hits ride under `results`.
    const { results: hits } = JSON.parse(r.output) as { results: Array<{ name: string; category: string; risk: string }> };
    expect(hits.some((h) => h.name === 'deckent_status')).toBe(true);
  });

  it('returns an empty array for a query with no matches', async () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), toolSurface: { enabled: true } });
    // Single opaque token — 'zzz_no_such_tool_zzz' used to token-collide with
    // deckent_review's description ("GO / NO_GO / GO_WITH_TECH_DEBT" normalizes
    // to a 'no' token via tool-search.ts's normalize(), same as the sentinel's
    // embedded '_no_'), producing a false-positive hit. 'zzzqxjv' has no
    // real-word substrings so it can never collide with a tool name/description.
    const r = await reg.get('deckent_search_tools')!.handler({ query: 'zzzqxjv' });
    expect(r.ok).toBe(true);
    // NT-06 (sprint-554): search results are now a bounded envelope with a
    // deterministic continuation cursor (null when nothing follows).
    expect(JSON.parse(r.output)).toEqual({ results: [], cursor: null });
  });
});

describe('deckent_describe_tool', () => {
  it('describes a known bridged tool with category/risk/params', async () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), toolSurface: { enabled: true } });
    const r = await reg.get('deckent_describe_tool')!.handler({ name: 'deckent_status' });
    expect(r.ok).toBe(true);
    const desc = JSON.parse(r.output) as { name: string; category: string; risk: string; params: unknown[] };
    expect(desc.name).toBe('deckent_status');
    expect(desc.category).toBe('monitoring');
    expect(desc.risk).toBe('safe'); // classifyTool('deckent_status') -> 'read' -> tier 'silent' -> bridged risk 'safe'
  });

  it('marks an unknown tool name as ok:false with an [mcp-error] tag', async () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), toolSurface: { enabled: true } });
    const r = await reg.get('deckent_describe_tool')!.handler({ name: 'does_not_exist' });
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/^\[mcp-error\]/);
  });
});

describe('deckent_call_tool — plan -> risk-gate -> confirm -> execImpl (fake-exec only, never real)', () => {
  it('unknown tool name short-circuits to unknown_tool, never reaching confirm/exec', async () => {
    const calls: string[] = [];
    const reg = buildNativeToolRegistry({
      cwd: () => tmpdir(),
      toolSurface: {
        enabled: true,
        confirm: () => { calls.push('confirm'); return 'allow'; },
        execImpl: () => { calls.push('exec'); return 'fake-result'; },
      },
    });
    const r = await reg.get('deckent_call_tool')!.handler({ name: 'nope_not_a_tool' });
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/^\[mcp-error\]/);
    const result = JSON.parse(r.output.replace(/^\[mcp-error\] /, '')) as DispatchResult;
    expect(result.status).toBe('unknown_tool');
    expect(calls).toEqual([]);
  });

  it('a safe-risk tool (silent tier) executes via the injected fake execImpl with no confirm required', async () => {
    const calls: string[] = [];
    const reg = buildNativeToolRegistry({
      cwd: () => tmpdir(),
      toolSurface: {
        enabled: true,
        confirm: () => { calls.push('confirm'); return 'allow'; },
        execImpl: (ctx) => { calls.push(`exec:${ctx.name}`); return 'fake-result'; },
      },
    });
    const r = await reg.get('deckent_call_tool')!.handler({ name: 'deckent_status', args: {} });
    expect(r.ok).toBe(true);
    const result = JSON.parse(r.output) as DispatchResult;
    expect(result.status).toBe('executed');
    expect(result.result).toBe('fake-result');
    expect(calls).toEqual(['exec:deckent_status']); // no confirm — risk 'safe' is below the 'moderate' threshold
  });

  it('a moderate+-risk tool (confirm/always tier) is denied when no confirm seam is injected — risk threshold gates it (fail-closed)', async () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), toolSurface: { enabled: true } }); // no confirm, no execImpl
    const r = await reg.get('deckent_call_tool')!.handler({ name: 'deckent_write_file', args: { path: 'x', content: 'y' } });
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/^\[deckent-denied\]/);
    const result = JSON.parse(r.output.replace(/^\[deckent-denied\] /, '')) as DispatchResult;
    expect(result.status).toBe('denied');
    expect(result.telemetry.confirmRequired).toBe(true); // risk-eşiği (moderate) required a confirm decision
  });

  it('a moderate+-risk tool runs the injected fake execImpl once the injected confirm seam allows it', async () => {
    const calls: string[] = [];
    const reg = buildNativeToolRegistry({
      cwd: () => tmpdir(),
      toolSurface: {
        enabled: true,
        confirm: (ctx) => { calls.push(`confirm:${ctx.toolName}:${ctx.risk}`); return 'allow'; },
        execImpl: (ctx) => { calls.push(`exec:${ctx.name}`); return 'fake-result'; },
      },
    });
    const r = await reg.get('deckent_call_tool')!.handler({ name: 'deckent_write_file', args: { path: 'x', content: 'y' } });
    expect(r.ok).toBe(true);
    const result = JSON.parse(r.output) as DispatchResult;
    expect(result.status).toBe('executed');
    expect(calls).toEqual(['confirm:deckent_write_file:moderate', 'exec:deckent_write_file']);
  });

  it('never performs real execution by default: an absent execImpl fails closed with a descriptive error, not a silent no-op success', async () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), toolSurface: { enabled: true } }); // no execImpl injected
    // deckent_status is 'safe' risk (below threshold) so it reaches execImpl directly.
    const r = await reg.get('deckent_call_tool')!.handler({ name: 'deckent_status', args: {} });
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/^\[mcp-error\]/);
    const result = JSON.parse(r.output.replace(/^\[mcp-error\] /, '')) as DispatchResult;
    expect(result.status).toBe('error');
    expect(result.error?.message).toMatch(/execution seam not wired/);
  });
});
