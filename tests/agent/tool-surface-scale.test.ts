// tests/agent/tool-surface-scale.test.ts
// ═══ 1000-tool bounded-surface regression (554-003, NT-06) ══════════════════
// Drives the REAL runAgentTurn (src/agent/loop.ts) with a scripted
// ProviderAdapter against a deterministic synthetic 1000-tool catalog, proving
// that progressive tool-exposure (Task 1: src/agent/tools/exposure.ts, Task 2:
// LoopDeps.getProviderToolSchemas) keeps round-1 provider requests an order of
// magnitude smaller than the full catalog, that a search→describe→call chain
// reveals a deep-catalog tool's schema on the following round, and that legacy
// (non-progressive) mode ships the full catalog every round — an honest
// contrast against the progressive baseline. No wall-clock, no randomness:
// every tool name/description is derived from its index.
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { runAgentTurn, type LoopDeps } from '../../src/agent/loop.js';
import { Transcript } from '../../src/agent/transcript.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { createToolExposure } from '../../src/agent/tools/exposure.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';
import type { RuleStore } from '../../src/agent/permission-store.js';

// ─── deterministic synthetic catalog ────────────────────────────────────────
const SEARCH_TOOL_NAME = 'search_tools';
const DESCRIBE_TOOL_NAME = 'describe_tool';
const DEEP_TOOL_COUNT = 998;
const CATALOG_SIZE = DEEP_TOOL_COUNT + 2; // + search_tools, describe_tool

// Round-1 (progressive, core-only) must stay well under this ceiling, and the
// full catalog must serialize to at least 10x it — a ceiling/ratio pair, never
// an exact-byte assertion (unrelated description edits must not break this).
const BASELINE_MAX_EAGER_SCHEMA_BYTES = 4096;

function deepToolName(i: number): string {
  return `deep_tool_${String(i).padStart(4, '0')}`;
}
function deepToolDescription(i: number): string {
  return `Synthetic deep-catalog regression tool number ${String(i).padStart(4, '0')} — bounded tool-surface scale fixture, no side effects.`;
}
const DEEP_TOOL_INPUT_SCHEMA = { type: 'object', properties: { arg: { type: 'string' } }, required: ['arg'] };

type Exposure = ReturnType<typeof createToolExposure>;

/** Registers the full 1000-tool synthetic catalog on a real ToolRegistry, then
 *  wraps it in a real `createToolExposure(opts, registry)` view.
 *  `search_tools`/`describe_tool` are declared `exposure: 'core'` at
 *  registration (mirroring Task 1's native-tool-registry.ts pattern); every
 *  deep tool defaults to 'discoverable'. `describe_tool`'s handler calls
 *  `exposure.reveal(name)` before returning — the same reveal contract Task 1
 *  wires into the real deckent_describe_tool/deckent_call_tool handlers.
 *  `exposure` is assigned after registration (registered handlers only read
 *  it once actually invoked, well after construction completes). */
function buildCatalog(progressive: boolean): { registry: ToolRegistry; exposure: Exposure } {
  const registry = new ToolRegistry();
  let exposure: Exposure;
  registry.register({
    name: SEARCH_TOOL_NAME,
    description: 'Search the synthetic 1000-tool catalog by keyword; returns matching tool names.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    category: 'catalog',
    tier: 'silent',
    source: 'builtin',
    exposure: 'core',
    handler: async (args) => ({ ok: true, output: JSON.stringify([{ name: args['query'] ?? '' }]) }),
  });
  registry.register({
    name: DESCRIBE_TOOL_NAME,
    description: 'Describe one catalog tool by exact name and reveal it for direct calling.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    category: 'catalog',
    tier: 'silent',
    source: 'builtin',
    exposure: 'core',
    handler: async (args) => {
      const name = typeof args['name'] === 'string' ? args['name'] : '';
      exposure.reveal(name);
      return { ok: true, output: `described:${name}` };
    },
  });
  for (let i = 0; i < DEEP_TOOL_COUNT; i++) {
    const name = deepToolName(i);
    registry.register({
      name,
      description: deepToolDescription(i),
      inputSchema: DEEP_TOOL_INPUT_SCHEMA,
      category: 'coding',
      tier: 'silent',
      source: 'builtin',
      handler: async (args) => ({ ok: true, output: `called:${args['arg'] ?? ''}` }),
    });
  }
  exposure = createToolExposure({ progressive }, registry);
  return { registry, exposure };
}

// ─── loop-driving fixtures (mirrors tests/agent/loop.test.ts) ──────────────
function scriptedAdapter(scripts: ProviderEvent[][]): { adapter: ProviderAdapter; requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = [];
  let turn = 0;
  const adapter: ProviderAdapter = {
    name: 'scripted',
    async *send(req: ProviderRequest): AsyncIterable<ProviderEvent> {
      requests.push(req);
      const script = scripts[turn++] ?? [{ type: 'done' }];
      for (const e of script) yield e;
    },
  };
  return { adapter, requests };
}
function memRuleStore(): RuleStore {
  return { grant: () => {}, revoke: () => {}, activeRules: () => [], activeDenies: () => [] };
}
async function drain(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of stream) out.push(e);
  return out;
}
function baseDeps(registry: ToolRegistry, over: Partial<LoopDeps>): LoopDeps {
  return {
    adapter: scriptedAdapter([[{ type: 'done' }]]).adapter,
    registry,
    policy: SAFE_DEFAULT_POLICY,
    ruleStore: memRuleStore(),
    cwd: tmpdir(),
    model: 'm',
    getMode: () => 'suggest',
    requestPermission: async () => ({ decision: 'once' }),
    maxIterations: 10,
    ...over,
  };
}
function toolResultFor(evs: AgentEvent[], id: string): Extract<AgentEvent, { type: 'tool-result' }> | undefined {
  return evs.find((e): e is Extract<AgentEvent, { type: 'tool-result' }> => e.type === 'tool-result' && e.id === id);
}
function toolNames(req: ProviderRequest | undefined): string[] {
  return (req?.tools ?? []).map((t) => t.name);
}

describe('progressive tool-surface — 1000-tool bounded regression (554-003)', () => {
  it('(a) round-1 progressive schema bytes stay under BASELINE_MAX_EAGER_SCHEMA_BYTES, an order of magnitude below the full catalog', async () => {
    const { registry, exposure } = buildCatalog(true);
    const getProviderToolSchemas = () => registry.toNativeSchemas((def) => exposure.isExposed(def.name));

    const { adapter, requests } = scriptedAdapter([[{ type: 'done' }]]);
    await drain(runAgentTurn(baseDeps(registry, { adapter, getProviderToolSchemas }), new Transcript(), 'go'));

    expect(requests.length).toBe(1);
    const round1Bytes = JSON.stringify(requests[0]!.tools).length;
    const fullCatalogBytes = JSON.stringify(registry.toNativeSchemas()).length;

    // Both numbers asserted explicitly — ceiling on round-1, ratio floor on the full catalog.
    expect(round1Bytes).toBeLessThanOrEqual(BASELINE_MAX_EAGER_SCHEMA_BYTES);
    expect(fullCatalogBytes).toBeGreaterThanOrEqual(BASELINE_MAX_EAGER_SCHEMA_BYTES * 10);

    // Round-1 only carries the 2 core-declared tools, never a deep tool.
    expect(toolNames(requests[0]).sort()).toEqual([DESCRIBE_TOOL_NAME, SEARCH_TOOL_NAME].sort());
  });

  it('(b) a scripted search→describe→call chain reveals a deep tool schema on the following round and completes', async () => {
    const { registry, exposure } = buildCatalog(true);
    const getProviderToolSchemas = () => registry.toNativeSchemas((def) => exposure.isExposed(def.name));
    const target = deepToolName(500);

    const { adapter, requests } = scriptedAdapter([
      [{ type: 'tool-call', id: 's1', name: SEARCH_TOOL_NAME, args: { query: target } }, { type: 'done' }],
      [{ type: 'tool-call', id: 'd1', name: DESCRIBE_TOOL_NAME, args: { name: target } }, { type: 'done' }],
      [{ type: 'tool-call', id: 'c1', name: target, args: { arg: 'x' } }, { type: 'done' }],
      [{ type: 'done' }],
    ]);
    const evs = await drain(runAgentTurn(baseDeps(registry, { adapter, getProviderToolSchemas }), new Transcript(), 'go'));

    expect(requests.length).toBe(4);
    // Rounds 1-2 (before the describe reveal fires): the deep tool is never visible.
    expect(toolNames(requests[0])).not.toContain(target);
    expect(toolNames(requests[1])).not.toContain(target);
    // Round 3 — immediately following the describe→reveal — carries the revealed schema.
    expect(toolNames(requests[2])).toContain(target);
    const revealedSchema = requests[2]!.tools.find((t) => t.name === target);
    expect(revealedSchema?.description).toBe(deepToolDescription(500));

    // The chain actually completed: search, describe, and the direct call all succeeded.
    expect(toolResultFor(evs, 's1')).toEqual({ type: 'tool-result', id: 's1', tool: SEARCH_TOOL_NAME, ok: true, output: JSON.stringify([{ name: target }]) });
    expect(toolResultFor(evs, 'd1')).toEqual({ type: 'tool-result', id: 'd1', tool: DESCRIBE_TOOL_NAME, ok: true, output: `described:${target}` });
    expect(toolResultFor(evs, 'c1')).toEqual({ type: 'tool-result', id: 'c1', tool: target, ok: true, output: 'called:x' });
    expect(exposure.revealedNames()).toContain(target);
  });

  it('(c) legacy (non-progressive) mode ships the full 1000-tool catalog every round — honest contrast against (a)', async () => {
    const { registry, exposure } = buildCatalog(false);
    // No getProviderToolSchemas injected: the loop falls back to registry.toNativeSchemas().
    const { adapter, requests } = scriptedAdapter([[{ type: 'done' }]]);
    await drain(runAgentTurn(baseDeps(registry, { adapter }), new Transcript(), 'go'));

    expect(requests.length).toBe(1);
    expect(requests[0]!.tools.length).toBe(CATALOG_SIZE);
    expect(toolNames(requests[0])).toContain(deepToolName(500));

    // Non-progressive exposure also reports everything exposed (byte-identical legacy semantics).
    expect(exposure.isExposed(deepToolName(500))).toBe(true);
  });
});
