// Sprint 301 Task 301-023 — F9-002: namespaced external-tool discovery + registration.
//
// Hermetic — NO real MCP subprocess, NO network, NO real filesystem.
// loadMcpServers is mocked via vi.hoisted so loadAndConnectAll never touches disk.
// audit is injected as a spy so writeEvent / event-stream are never invoked.
//
// Coverage:
//   1) loadAndConnectAll with mocked server returning 3 tools → 3 `server__tool` entries
//   2) listSlashLines renders all 3 namespaced tool names
//   3) connectAndRefresh registers under `server__tool` format (registerNamespaced path)
//   4) Reconnect refresh — connectAndRefresh twice does NOT duplicate entries
//   5) Registry state persists across multiple listSlashLines / listTools calls
//   6) loadAndConnectAll skips a server that throws (REPL stays usable)
//   7) loadAndConnectAll with 0 servers returns empty list

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  buildMcpBridge,
  type BridgeBrokerLike,
  type McpAuditRecord,
} from '../../src/cli/commands/chat-mcp-bridge.js';
import { McpToolRegistry } from '../../src/mcp-client/registry.js';
import type { McpToolDescriptor, McpServerDef } from '../../src/mcp-client/types.js';

// ─── Hoist loadMcpServers spy so vi.mock factory can reference it ─────────────

const hoisted = vi.hoisted(() => ({
  loadMcpServers: vi.fn<[string], Record<string, McpServerDef>>(),
}));

vi.mock('../../src/mcp-client/config.js', () => ({
  loadMcpServers: hoisted.loadMcpServers,
}));

// ─── Constants ────────────────────────────────────────────────────────────────

const SRV = 'testserver';
const THREE_TOOLS: McpToolDescriptor[] = [
  { name: 'alpha', description: 'first tool' },
  { name: 'beta', description: 'second tool' },
  { name: 'gamma', description: 'third tool' },
];
const FAKE_DEF: McpServerDef = { transport: 'stdio', command: 'fake-cmd' };

// ─── Fake broker factory ──────────────────────────────────────────────────────

interface SpyBroker extends BridgeBrokerLike {
  connectSpy: ReturnType<typeof vi.fn>;
  listToolsSpy: ReturnType<typeof vi.fn>;
  callToolSpy: ReturnType<typeof vi.fn>;
}

function makeSpyBroker(opts: {
  tools?: McpToolDescriptor[];
  alreadyConnected?: boolean;
  connectThrows?: string;
} = {}): SpyBroker {
  const tools = opts.tools ?? THREE_TOOLS;
  const connectSpy = vi.fn(async (): Promise<void> => {
    if (opts.connectThrows) throw new Error(opts.connectThrows);
  });
  const listToolsSpy = vi.fn(async (_name: string): Promise<McpToolDescriptor[]> => tools);
  const callToolSpy = vi.fn(async (): Promise<unknown> => 'ok');
  const connected = new Set<string>();

  return {
    connectSpy,
    listToolsSpy,
    callToolSpy,
    async connect(name: string, def: McpServerDef): Promise<void> {
      await connectSpy(name, def);
      connected.add(name);
    },
    async listTools(name: string): Promise<McpToolDescriptor[]> {
      return listToolsSpy(name);
    },
    async callTool(server: string, tool: string, args?: Record<string, unknown>): Promise<unknown> {
      return callToolSpy(server, tool, args);
    },
    isConnected(name: string): boolean {
      return opts.alreadyConnected === true || connected.has(name);
    },
    list(): string[] {
      return opts.alreadyConnected ? [SRV] : Array.from(connected);
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBridge(broker: BridgeBrokerLike, registry: McpToolRegistry) {
  return buildMcpBridge({
    broker,
    registry,
    projectRoot: '/fake/root',
    audit: vi.fn((_r: McpAuditRecord): void => undefined),
  });
}

// ─── Suite 1: loadAndConnectAll discovery ─────────────────────────────────────

describe('F9-002 — loadAndConnectAll namespaced discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fake-server returning 3 tools → registry has 3 `server__tool` keys', async () => {
    const broker = makeSpyBroker({ tools: THREE_TOOLS });
    const registry = new McpToolRegistry();
    const bridge = makeBridge(broker, registry);

    hoisted.loadMcpServers.mockReturnValue({ [SRV]: FAKE_DEF });

    const connected = await bridge.loadAndConnectAll();

    expect(connected).toEqual([SRV]);
    expect(registry.size).toBe(3);

    const keys = registry.list().map((t) => t.namespacedName);
    expect(keys).toContain(`${SRV}__alpha`);
    expect(keys).toContain(`${SRV}__beta`);
    expect(keys).toContain(`${SRV}__gamma`);
  });

  it('listSlashLines renders all 3 namespaced tool names after loadAndConnectAll', async () => {
    const broker = makeSpyBroker({ tools: THREE_TOOLS });
    const registry = new McpToolRegistry();
    const bridge = makeBridge(broker, registry);

    hoisted.loadMcpServers.mockReturnValue({ [SRV]: FAKE_DEF });
    await bridge.loadAndConnectAll();

    const lines = bridge.listSlashLines();
    expect(lines).toHaveLength(3);
    expect(lines.some((l) => l.startsWith(`${SRV}__alpha`))).toBe(true);
    expect(lines.some((l) => l.startsWith(`${SRV}__beta`))).toBe(true);
    expect(lines.some((l) => l.startsWith(`${SRV}__gamma`))).toBe(true);
  });

  it('listTools() returns 3 NamespacedTool entries after loadAndConnectAll', async () => {
    const broker = makeSpyBroker({ tools: THREE_TOOLS });
    const registry = new McpToolRegistry();
    const bridge = makeBridge(broker, registry);

    hoisted.loadMcpServers.mockReturnValue({ [SRV]: FAKE_DEF });
    await bridge.loadAndConnectAll();

    const tools = bridge.listTools();
    expect(tools).toHaveLength(3);
    expect(tools[0]?.server).toBe(SRV);
    expect(tools[0]?.namespacedName).toMatch(/^testserver__/);
  });

  it('skips a server that throws during connect — REPL stays usable', async () => {
    const badBroker = makeSpyBroker({ connectThrows: 'connection refused' });
    const registry = new McpToolRegistry();
    const bridge = makeBridge(badBroker, registry);

    hoisted.loadMcpServers.mockReturnValue({ [SRV]: FAKE_DEF });
    const connected = await bridge.loadAndConnectAll();

    expect(connected).toHaveLength(0);
    expect(registry.size).toBe(0);
  });

  it('returns empty list and empty registry when no servers configured', async () => {
    const broker = makeSpyBroker();
    const registry = new McpToolRegistry();
    const bridge = makeBridge(broker, registry);

    hoisted.loadMcpServers.mockReturnValue({});
    const connected = await bridge.loadAndConnectAll();

    expect(connected).toHaveLength(0);
    expect(registry.size).toBe(0);
    const lines = bridge.listSlashLines();
    expect(lines).toEqual(['MCP server yok']);
  });

  it('multiple servers → all tools namespaced independently', async () => {
    const SRV_B = 'otherserver';
    const tools_a: McpToolDescriptor[] = [{ name: 'foo' }];
    const tools_b: McpToolDescriptor[] = [{ name: 'bar' }, { name: 'baz' }];

    const listToolsSpy = vi.fn((name: string) =>
      Promise.resolve(name === SRV ? tools_a : tools_b),
    );
    const connectSpy = vi.fn(async () => undefined);
    const connected = new Set<string>();

    const broker: BridgeBrokerLike = {
      async connect(n) { connectSpy(n); connected.add(n); },
      listTools: listToolsSpy,
      async callTool() { return 'ok'; },
      isConnected(n) { return connected.has(n); },
      list() { return Array.from(connected); },
    };

    const registry = new McpToolRegistry();
    const bridge = makeBridge(broker, registry);

    hoisted.loadMcpServers.mockReturnValue({
      [SRV]: FAKE_DEF,
      [SRV_B]: FAKE_DEF,
    });

    await bridge.loadAndConnectAll();

    expect(registry.size).toBe(3);
    expect(registry.list().map((t) => t.namespacedName)).toContain(`${SRV}__foo`);
    expect(registry.list().map((t) => t.namespacedName)).toContain(`${SRV_B}__bar`);
    expect(registry.list().map((t) => t.namespacedName)).toContain(`${SRV_B}__baz`);
  });
});

// ─── Suite 2: connectAndRefresh — registerNamespaced path ────────────────────

describe('F9-002 — connectAndRefresh uses registerNamespaced', () => {
  it('registers tools under server__tool format and returns NamespacedTool[]', async () => {
    const broker = makeSpyBroker({ tools: THREE_TOOLS });
    const registry = new McpToolRegistry();
    const bridge = makeBridge(broker, registry);

    const result = await bridge.connectAndRefresh(SRV, FAKE_DEF);

    expect(result).toHaveLength(3);
    expect(result.map((t) => t.namespacedName)).toContain(`${SRV}__alpha`);
    expect(result.map((t) => t.namespacedName)).toContain(`${SRV}__beta`);
    expect(result.map((t) => t.namespacedName)).toContain(`${SRV}__gamma`);
    expect(registry.size).toBe(3);
  });

  it('reconnect (second connectAndRefresh) refreshes without duplicating entries', async () => {
    const broker = makeSpyBroker({ alreadyConnected: true, tools: THREE_TOOLS });
    const registry = new McpToolRegistry();
    const bridge = makeBridge(broker, registry);

    await bridge.connectAndRefresh(SRV, FAKE_DEF);
    await bridge.connectAndRefresh(SRV, FAKE_DEF);

    // Still exactly 3 — no duplicate entries.
    expect(registry.size).toBe(3);
  });

  it('skips connect when already connected', async () => {
    const broker = makeSpyBroker({ alreadyConnected: true });
    const registry = new McpToolRegistry();
    const bridge = makeBridge(broker, registry);

    await bridge.connectAndRefresh(SRV, FAKE_DEF);

    expect(broker.connectSpy).not.toHaveBeenCalled();
    expect(broker.listToolsSpy).toHaveBeenCalledWith(SRV);
  });
});

// ─── Suite 3: registry persistence across REPL turns ────────────────────────

describe('F9-002 — registry state persists across multiple operations', () => {
  it('registry is shared: loadAndConnectAll fills it, listSlashLines reads same state', async () => {
    const broker = makeSpyBroker({ tools: THREE_TOOLS });
    const registry = new McpToolRegistry();
    const bridge = makeBridge(broker, registry);

    hoisted.loadMcpServers.mockReturnValue({ [SRV]: FAKE_DEF });
    await bridge.loadAndConnectAll();

    // Simulate multiple REPL turns reading the same registry state.
    const turn1 = bridge.listSlashLines();
    const turn2 = bridge.listSlashLines();
    const turn3 = bridge.listTools();

    expect(turn1).toHaveLength(3);
    expect(turn2).toHaveLength(3);
    expect(turn3).toHaveLength(3);

    // State is stable — no extra fetches happened.
    expect(broker.listToolsSpy).toHaveBeenCalledTimes(1);
  });

  it('/mcp list output contains all 3 tool descriptions', async () => {
    const broker = makeSpyBroker({ tools: THREE_TOOLS });
    const registry = new McpToolRegistry();
    const bridge = makeBridge(broker, registry);

    hoisted.loadMcpServers.mockReturnValue({ [SRV]: FAKE_DEF });
    await bridge.loadAndConnectAll();

    const lines = bridge.listSlashLines();
    const joined = lines.join('\n');
    expect(joined).toContain('first tool');
    expect(joined).toContain('second tool');
    expect(joined).toContain('third tool');
  });
});
