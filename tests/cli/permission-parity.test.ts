import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderAdapter, ProviderEvent } from '../../src/agent/provider-tooluse/types.js';
import type { PermissionRule } from '../../src/agent/permission-store.js';

const sharedRules = vi.hoisted(() => ({
  grants: [] as Array<{ tool: string; pattern: string }>,
  denies: [] as Array<{ tool: string; pattern: string }>,
}));

vi.mock('../../src/agent/permission-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/agent/permission-store.js')>();
  return {
    ...actual,
    createRuleStore: () => ({
      activeRules: () => sharedRules.grants,
      activeDenies: () => sharedRules.denies,
      grant: (rule: { tool: string; pattern: string }) => { sharedRules.grants.push(rule); },
      revoke: () => undefined,
    }),
  };
});

import { createNativeEngine } from '../../src/cli/repl/native-agent-bridge.js';
import {
  buildNativeToolRegistry,
  type NativeMcpBridge,
  type ToolSurfaceOptions,
} from '../../src/cli/repl/native-tool-registry.js';

const MCP_TOOL = 'mcp_demo_confirm';

function scripted(rounds: ProviderEvent[][]): ProviderAdapter {
  let round = 0;
  return {
    name: 'permission-parity-test',
    async *send() {
      for (const event of rounds[round++] ?? [{ type: 'done' }]) yield event;
    },
  };
}

function call(id: string, name: string, args: Record<string, unknown> = {}): ProviderEvent[] {
  return [{ type: 'tool-call', id, name, args }, { type: 'done' }];
}

function bridge(executed: string[], bridgePrompts: string[]): NativeMcpBridge {
  return {
    listTools: () => [{
      namespacedName: MCP_TOOL,
      descriptor: { description: 'Hermetic confirm-tier MCP fixture', inputSchema: { type: 'object', properties: {} } },
    }],
    async dispatch(name, _args, confirm) {
      bridgePrompts.push(name);
      if (!await confirm({ tool: name })) return { ok: false, output: 'bridge denied' };
      executed.push(name);
      return { ok: true, output: 'mcp ok' };
    },
  };
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'deckent-permission-parity-'));
  sharedRules.grants.length = 0;
  sharedRules.denies.length = 0;
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function setup(rounds: ProviderEvent[][], answer: 'y' | 'a' | 'n' = 'y') {
  const asked: string[] = [];
  const executed: string[] = [];
  const bridgePrompts: string[] = [];
  const toolSurface: ToolSurfaceOptions = { enabled: true };
  const registry = buildNativeToolRegistry({
    cwd: () => dir,
    mcpBridge: bridge(executed, bridgePrompts),
    toolSurface,
  });
  const engine = createNativeEngine({
    adapter: scripted(rounds),
    registry,
    cwd: dir,
    model: 'fixture',
    lang: 'en',
    confirm: async (_summary, tool) => { asked.push(tool); return answer; },
    toolSink: () => undefined,
    toolSurface,
  });
  return { engine, asked, executed, bridgePrompts };
}

const callbacks = { output: () => undefined, onTurnEnd: () => undefined };

describe('AgentSession permission parity across direct, nested, CLI, and MCP dispatch', () => {
  it('a session grant recorded by a direct MCP call also skips the nested prompt', async () => {
    const fx = setup([
      call('direct', MCP_TOOL),
      [{ type: 'done' }],
      call('nested', 'deckent_call_tool', { name: MCP_TOOL, args: {} }),
      [{ type: 'done' }],
    ], 'a');

    await fx.engine('direct', callbacks);
    await fx.engine('nested', callbacks);

    expect(fx.asked).toEqual([MCP_TOOL]);
    expect(fx.executed).toEqual([MCP_TOOL, MCP_TOOL]);
    expect(fx.bridgePrompts).toEqual([MCP_TOOL, MCP_TOOL]);
  });

  it('full-auto runs confirm-tier MCP promptless but preserves deckent_kill always-floor', async () => {
    const fx = setup([
      call('mcp', MCP_TOOL),
      [{ type: 'done' }],
      call('kill', 'deckent_kill'),
      [{ type: 'done' }],
    ], 'n');
    fx.engine.setApprovalMode?.('full-auto');

    await fx.engine('mcp', callbacks);
    await fx.engine('kill', callbacks);

    expect(fx.executed).toEqual([MCP_TOOL]);
    expect(fx.asked).toEqual(['deckent_kill']);
  });

  it('a live explicit deny blocks both direct and nested MCP paths in full-auto', async () => {
    const fx = setup([
      call('direct-deny', MCP_TOOL),
      [{ type: 'done' }],
      call('nested-deny', 'deckent_call_tool', { name: MCP_TOOL, args: {} }),
      [{ type: 'done' }],
    ]);
    fx.engine.setApprovalMode?.('full-auto');
    sharedRules.denies.push({ tool: MCP_TOOL, pattern: '**' } as PermissionRule);

    await fx.engine('direct deny', callbacks);
    await fx.engine('nested deny', callbacks);

    expect(fx.asked).toEqual([]);
    expect(fx.executed).toEqual([]);
    expect(fx.bridgePrompts).toEqual([]);
  });
});
