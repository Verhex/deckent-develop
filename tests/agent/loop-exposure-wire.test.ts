// tests/agent/loop-exposure-wire.test.ts
// ═══ NT-06 — the loop consumes the exposure VIEW, never exposure semantics ═══
// These tests drive the REAL runAgentTurn with a scripted adapter and assert on
// the tool schema list of the ACTUAL ProviderRequest each round carries. The
// point of the wire is round-over-round growth: a tool revealed while round N
// runs must ride round N+1's request, with no exposure state inside loop.ts.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAgentTurn, type LoopDeps } from '../../src/agent/loop.js';
import { Transcript } from '../../src/agent/transcript.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { createToolExposure, type ToolExposure } from '../../src/agent/tools/exposure.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';
import type { RuleStore } from '../../src/agent/permission-store.js';

/** Scripted adapter — records every ProviderRequest the loop actually ships. */
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
  const rules: { tool: string; pattern: string }[] = [];
  return { grant: (r) => rules.push(r), revoke: () => {}, activeRules: () => [...rules], activeDenies: () => [] };
}

async function drain(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of stream) out.push(e);
  return out;
}

const CORE_TOOLS = ['core_alpha', 'core_beta'] as const;
const DEEP_TOOLS = ['deep_one', 'deep_two', 'deep_three'] as const;
/** The meta tool the model uses to discover a deep tool — itself always core. */
const META_TOOL = 'meta_describe_tool';
const ALL_SIX = [...CORE_TOOLS, ...DEEP_TOOLS, META_TOOL].sort();
const CORE_PLUS_META = [...CORE_TOOLS, META_TOOL].sort();

/**
 * The 5-tool catalog (2 declared `exposure: 'core'`) plus the meta describe tool.
 * When an exposure view is supplied, `meta_describe_tool`'s handler calls
 * `exposure.reveal(name)` — the SAME shape native-tool-registry.ts's real
 * `deckent_describe_tool` handler uses — so the reveal happens mid-round-1 and
 * the loop must surface it on round 2 with no loop-side change.
 */
function populate(reg: ToolRegistry, exposure?: ToolExposure): ToolRegistry {
  for (const name of CORE_TOOLS) {
    reg.register({
      name, description: `${name} description`, inputSchema: { type: 'object' }, category: 'coding',
      tier: 'silent', source: 'builtin', exposure: 'core',
      handler: async () => ({ ok: true, output: `${name}:ran` }),
    });
  }
  for (const name of DEEP_TOOLS) {
    reg.register({
      name, description: `${name} description`, inputSchema: { type: 'object' }, category: 'coding',
      tier: 'silent', source: 'builtin',
      handler: async () => ({ ok: true, output: `${name}:ran` }),
    });
  }
  reg.register({
    name: META_TOOL, description: 'describe a catalog tool', inputSchema: { type: 'object' },
    category: 'catalog', tier: 'silent', source: 'builtin', exposure: 'core',
    handler: async (args) => {
      const name = typeof args['name'] === 'string' ? args['name'] : '';
      const outcome = exposure?.reveal(name) ?? 'unknown';
      return { ok: true, output: `described:${name}:${outcome}` };
    },
  });
  return reg;
}

/** Registry + its session exposure view, wired the way the bridge wires them. */
function progressiveCatalog(progressive: boolean, revealFromHandler = true): {
  registry: ToolRegistry;
  exposure: ToolExposure;
  getProviderToolSchemas: () => ReturnType<ToolRegistry['toNativeSchemas']>;
} {
  const registry = new ToolRegistry();
  const exposure = createToolExposure({ progressive }, registry);
  populate(registry, revealFromHandler ? exposure : undefined);
  return {
    registry,
    exposure,
    getProviderToolSchemas: () => registry.toNativeSchemas((def) => exposure.isExposed(def.name)),
  };
}

let cwd: string;
beforeAll(() => { cwd = mkdtempSync(join(tmpdir(), 'nt06-loop-')); });
afterAll(() => { rmSync(cwd, { recursive: true, force: true }); });

function baseDeps(over: Partial<LoopDeps> & { registry: ToolRegistry; adapter: ProviderAdapter }): LoopDeps {
  return {
    policy: SAFE_DEFAULT_POLICY,
    ruleStore: memRuleStore(),
    cwd,
    model: 'm',
    getMode: () => 'suggest',
    requestPermission: async () => ({ decision: 'once' }),
    ...over,
  };
}

/** Tool names, sorted — the assertion surface for "what the provider may see". */
function toolNames(req: ProviderRequest): string[] {
  return [...(req.tools ?? [])].map((t) => t.name).sort();
}

/** Round 1 describes `deep_two`; round 2 answers with plain text and ends. */
function revealScript(): ProviderEvent[][] {
  return [
    [{ type: 'tool-call', id: 'c1', name: META_TOOL, args: { name: 'deep_two' } }, { type: 'done' }],
    [{ type: 'text-delta', text: 'ok' }, { type: 'done' }],
  ];
}

describe('NT-06 — loop consumes the provider tool-schema getter per round', () => {
  it('progressive ON: round 1 carries only core+meta, round 2 carries the revealed tool', async () => {
    const { adapter, requests } = scriptedAdapter(revealScript());
    const catalog = progressiveCatalog(true);

    const events = await drain(runAgentTurn(
      baseDeps({ registry: catalog.registry, adapter, getProviderToolSchemas: catalog.getProviderToolSchemas }),
      new Transcript(),
      'find me a deep tool',
    ));

    expect(requests).toHaveLength(2);
    // Round 1: the 3 discoverable tools are invisible to the provider.
    expect(toolNames(requests[0]!)).toEqual(CORE_PLUS_META);
    // Round 2: describe() revealed deep_two mid-round-1 → it rides the next request.
    expect(toolNames(requests[1]!)).toEqual([...CORE_TOOLS, 'deep_two', META_TOOL].sort());
    // Growth is strictly additive — nothing exposed in round 1 disappeared.
    expect(toolNames(requests[1]!)).toEqual(expect.arrayContaining(toolNames(requests[0]!)));
    expect(toolNames(requests[1]!)).toHaveLength(toolNames(requests[0]!).length + 1);
    // The still-unrevealed siblings stay hidden (reveal is per-name, not per-batch).
    expect(toolNames(requests[1]!)).not.toContain('deep_one');
    expect(toolNames(requests[1]!)).not.toContain('deep_three');
    expect(catalog.exposure.revealedNames()).toEqual(['deep_two']);
    expect(events.at(-1)).toEqual({ type: 'turn-end' });
    expect(events).toContainEqual({
      type: 'tool-result', id: 'c1', tool: META_TOOL, ok: true, output: 'described:deep_two:revealed',
    });
    // A hidden round-1 tool is ABSENT, not stubbed — its description bytes never
    // reach the wire, which is the whole point of the eager-surface reduction.
    expect(JSON.stringify(requests[0]!.tools)).not.toContain('deep_two description');
    expect(JSON.stringify(requests[1]!.tools)).toContain('deep_two description');
  });

  it('progressive OFF (getter present, flag false): all 5 tools + meta on BOTH rounds', async () => {
    const { adapter, requests } = scriptedAdapter(revealScript());
    const catalog = progressiveCatalog(false);

    await drain(runAgentTurn(
      baseDeps({ registry: catalog.registry, adapter, getProviderToolSchemas: catalog.getProviderToolSchemas }),
      new Transcript(),
      'go',
    ));

    expect(requests).toHaveLength(2);
    expect(toolNames(requests[0]!)).toEqual(ALL_SIX);
    expect(toolNames(requests[1]!)).toEqual(ALL_SIX);
  });

  it('regression pin: no getter → byte-identical requests and events vs. the pre-NT-06 loop', async () => {
    const script = (): ProviderEvent[][] => [
      [{ type: 'tool-call', id: 'c1', name: 'deep_two', args: {} }, { type: 'done' }],
      [{ type: 'text-delta', text: 'done' }, { type: 'done' }],
    ];

    // Legacy shape: LoopDeps WITHOUT the new optional dep at all.
    const legacy = scriptedAdapter(script());
    const legacyRegistry = populate(new ToolRegistry());
    const legacyEvents = await drain(runAgentTurn(
      baseDeps({ registry: legacyRegistry, adapter: legacy.adapter }),
      new Transcript(),
      'go',
    ));

    // Same run, but the getter is explicitly the registry's own eager dump — the
    // `??` fallback and an identity getter must produce the SAME request bytes.
    const wired = scriptedAdapter(script());
    const wiredRegistry = populate(new ToolRegistry());
    const wiredEvents = await drain(runAgentTurn(
      baseDeps({
        registry: wiredRegistry,
        adapter: wired.adapter,
        getProviderToolSchemas: () => wiredRegistry.toNativeSchemas(),
      }),
      new Transcript(),
      'go',
    ));

    expect(JSON.stringify(wired.requests)).toEqual(JSON.stringify(legacy.requests));
    expect(wiredEvents).toEqual(legacyEvents);
    expect(toolNames(legacy.requests[0]!)).toEqual(ALL_SIX);
    expect(toolNames(legacy.requests[1]!)).toEqual(ALL_SIX);
  });

  it('the loop holds NO exposure state: a view nothing reveals into stays flat', async () => {
    const { adapter, requests } = scriptedAdapter(revealScript());
    // revealFromHandler=false → the meta tool runs but cannot reveal anything.
    const catalog = progressiveCatalog(true, false);

    await drain(runAgentTurn(
      baseDeps({ registry: catalog.registry, adapter, getProviderToolSchemas: catalog.getProviderToolSchemas }),
      new Transcript(),
      'go',
    ));

    expect(toolNames(requests[0]!)).toEqual(CORE_PLUS_META);
    // Round 2 is identical: running a tool does not, by itself, teach the loop to
    // widen the surface — only the injected view can.
    expect(toolNames(requests[1]!)).toEqual(CORE_PLUS_META);
    expect(catalog.exposure.revealedNames()).toEqual([]);
  });
});
