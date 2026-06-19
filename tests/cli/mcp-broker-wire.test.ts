// Sprint 301 Task 301-022 — McpClientBroker-wire: REPL /mcp live dispatch verify+complete.
//
// Hermetic — NO real MCP subprocess/connect, NO network, NO file I/O (audit injected
// as spy, not writeEvent). Covers scenarios the older repl-mcp-dispatch.test.ts and
// repl-mcp-wire.test.ts do NOT cover:
//
//   1) layoutEnabled:true + interactiveTty:true path — /mcp list works without breaking
//   2) opts.mcpConfirm exercised in runChatNativeLoop (the loop-level confirm option)
//   3) connectAndRefresh flow — tools registered with namespaced `server__tool` format
//   4) Audit injection via spy — gate→dispatch→audit chain (no real event-stream file)
//   5) mcpConfirm reject on TTY → '[mcp] cancelled' output, REPL stays alive
//
// buildMcpBridge and BridgeBrokerLike are the composition roots under test.
// McpToolRegistry is the real implementation (namespacing contract).

import { describe, it, expect, vi } from 'vitest';

import {
  buildMcpBridge,
  type BridgeBrokerLike,
  type McpConfirmAction,
  type McpAuditRecord,
} from '../../src/cli/commands/chat-mcp-bridge.js';
import { McpToolRegistry } from '../../src/mcp-client/registry.js';
import type { McpServerDef, McpToolDescriptor } from '../../src/mcp-client/types.js';
import {
  runChatNativeLoop,
  type ChatProviderAdapter,
  type McpToolDispatcher,
} from '../../src/cli/commands/chat-native.js';
import type { ReplMcpBridge } from '../../src/cli/repl/mcp-bridge.js';
import type { McpConfirmFn } from '../../src/cli/commands/chat-mcp-bridge.js';

// ─── Fake broker ─────────────────────────────────────────────────────────────

const SRV = 'myserver';
const TOOLS: McpToolDescriptor[] = [
  { name: 'greet', description: 'says hello' },
  { name: 'compute', description: 'does math' },
];

interface SpyBroker extends BridgeBrokerLike {
  connectSpy: ReturnType<typeof vi.fn>;
  listToolsSpy: ReturnType<typeof vi.fn>;
  callToolSpy: ReturnType<typeof vi.fn>;
}

function makeSpyBroker(opts: {
  alreadyConnected?: boolean;
  callResult?: unknown;
  callThrows?: string;
} = {}): SpyBroker {
  const connectSpy = vi.fn(async (): Promise<void> => undefined);
  const listToolsSpy = vi.fn(async (_name: string): Promise<McpToolDescriptor[]> => TOOLS);
  const callToolSpy = vi.fn(
    async (_server: string, _tool: string, _args?: Record<string, unknown>): Promise<unknown> => {
      if (opts.callThrows) throw new Error(opts.callThrows);
      return opts.callResult ?? 'ok-result';
    },
  );
  return {
    connectSpy,
    listToolsSpy,
    callToolSpy,
    async connect(name: string, def: McpServerDef): Promise<void> {
      return connectSpy(name, def);
    },
    async listTools(name: string): Promise<McpToolDescriptor[]> {
      return listToolsSpy(name);
    },
    async callTool(
      server: string,
      tool: string,
      args?: Record<string, unknown>,
    ): Promise<unknown> {
      return callToolSpy(server, tool, args);
    },
    isConnected(_name: string): boolean {
      return opts.alreadyConnected ?? false;
    },
    list(): string[] {
      return opts.alreadyConnected ? [SRV] : [];
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function* lines(...items: string[]): AsyncIterable<string> {
  for (const item of items) yield item;
}

function idleProvider(): { adapter: ChatProviderAdapter; sendSpy: ReturnType<typeof vi.fn> } {
  const sendSpy = vi.fn(async () => {
    throw new Error('provider should not be called for /mcp commands');
  });
  return { adapter: { send: sendSpy }, sendSpy };
}

function fakeDispatcher(): McpToolDispatcher {
  return { dispatch: vi.fn(async () => 'dispatch-ok') };
}

// ─── 1) connectAndRefresh → namespaced server__tool registration ─────────────

describe('buildMcpBridge — connectAndRefresh registers namespaced tools', () => {
  it('connects and lists tools under server__tool format', async () => {
    const broker = makeSpyBroker();
    const registry = new McpToolRegistry();
    const auditSpy = vi.fn();

    const bridge = buildMcpBridge({
      broker,
      registry,
      projectRoot: '/fake/root',
      audit: auditSpy,
    });

    const connected = await bridge.connectAndRefresh(SRV, {
      transport: 'stdio',
      command: 'fake-cmd',
    });

    expect(broker.connectSpy).toHaveBeenCalledWith(SRV, expect.any(Object));
    expect(broker.listToolsSpy).toHaveBeenCalledWith(SRV);

    // Registry must contain namespaced names.
    expect(connected).toHaveLength(TOOLS.length);
    expect(connected[0]?.namespacedName).toBe(`${SRV}__greet`);
    expect(connected[1]?.namespacedName).toBe(`${SRV}__compute`);

    // listSlashLines should reflect the registered tools.
    const slashLines = bridge.listSlashLines();
    expect(slashLines.some((l) => l.includes(`${SRV}__greet`))).toBe(true);
    expect(slashLines.some((l) => l.includes('says hello'))).toBe(true);
  });

  it('skips connect when already connected (isConnected:true)', async () => {
    const broker = makeSpyBroker({ alreadyConnected: true });
    const registry = new McpToolRegistry();
    const bridge = buildMcpBridge({ broker, registry, projectRoot: '/r', audit: vi.fn() });

    await bridge.connectAndRefresh(SRV, { transport: 'stdio', command: 'x' });

    expect(broker.connectSpy).not.toHaveBeenCalled();
    expect(broker.listToolsSpy).toHaveBeenCalledOnce();
  });
});

// ─── 2) dispatch approved → callTool + audit outcome:'ok' ────────────────────

describe('buildMcpBridge — dispatch gate → callTool → audit (spy)', () => {
  it('approved confirm → callTool called + audit outcome ok', async () => {
    const broker = makeSpyBroker({ callResult: { text: 'hello' } });
    const registry = new McpToolRegistry();
    registry.register(SRV, TOOLS);

    const auditSpy = vi.fn((_r: McpAuditRecord): void => undefined);
    const bridge = buildMcpBridge({ broker, registry, projectRoot: '/r', audit: auditSpy });

    const result = await bridge.dispatch(
      `${SRV}__greet`,
      { name: 'world' },
      async () => true,
    );

    expect(result.ok).toBe(true);
    expect(result.cancelled).toBeUndefined();
    expect(broker.callToolSpy).toHaveBeenCalledWith(SRV, 'greet', { name: 'world' });

    expect(auditSpy).toHaveBeenCalledOnce();
    const rec = auditSpy.mock.calls[0]?.[0] as McpAuditRecord;
    expect(rec.outcome).toBe('ok');
    expect(rec.server).toBe(SRV);
    expect(rec.tool).toBe('greet');
    expect(rec.namespacedName).toBe(`${SRV}__greet`);
  });

  it('rejected confirm → callTool NOT called + audit outcome cancelled', async () => {
    const broker = makeSpyBroker();
    const registry = new McpToolRegistry();
    registry.register(SRV, TOOLS);

    const auditSpy = vi.fn((_r: McpAuditRecord): void => undefined);
    const bridge = buildMcpBridge({ broker, registry, projectRoot: '/r', audit: auditSpy });

    const result = await bridge.dispatch(
      `${SRV}__compute`,
      { x: 2 },
      async () => false,
    );

    expect(result.ok).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(result.output).toContain('[mcp] cancelled');
    expect(broker.callToolSpy).not.toHaveBeenCalled();

    expect(auditSpy).toHaveBeenCalledOnce();
    const rec = auditSpy.mock.calls[0]?.[0] as McpAuditRecord;
    expect(rec.outcome).toBe('cancelled');
    expect(rec.namespacedName).toBe(`${SRV}__compute`);
  });

  it('broker throws → result [mcp-error] + audit outcome error', async () => {
    const broker = makeSpyBroker({ callThrows: 'boom' });
    const registry = new McpToolRegistry();
    registry.register(SRV, TOOLS);

    const auditSpy = vi.fn((_r: McpAuditRecord): void => undefined);
    const bridge = buildMcpBridge({ broker, registry, projectRoot: '/r', audit: auditSpy });

    const result = await bridge.dispatch(`${SRV}__greet`, {}, async () => true);

    expect(result.ok).toBe(false);
    expect(result.output).toContain('[mcp-error]');
    expect(result.output).toContain('boom');
    expect(broker.callToolSpy).toHaveBeenCalledOnce();

    const rec = auditSpy.mock.calls[0]?.[0] as McpAuditRecord;
    expect(rec.outcome).toBe('error');
    expect(rec.tool).toBe('greet');
  });

  it('unknown namespaced name → no confirm, no callTool, unknown-tool audit', async () => {
    const broker = makeSpyBroker();
    const registry = new McpToolRegistry();
    registry.register(SRV, TOOLS);

    const auditSpy = vi.fn((_r: McpAuditRecord): void => undefined);
    const bridge = buildMcpBridge({ broker, registry, projectRoot: '/r', audit: auditSpy });
    const confirmSpy = vi.fn(async () => true);

    const result = await bridge.dispatch('unknown__tool', {}, confirmSpy);

    expect(result.ok).toBe(false);
    expect(result.output).toContain('unknown tool');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(broker.callToolSpy).not.toHaveBeenCalled();

    const rec = auditSpy.mock.calls[0]?.[0] as McpAuditRecord;
    expect(rec.outcome).toBe('unknown-tool');
  });
});

// ─── 3) confirm action shape — tier is always ≥ 'confirm' ───────────────────

describe('buildMcpBridge — confirm action shape', () => {
  it('confirm receives McpConfirmAction with correct shape and tier ≥ confirm', async () => {
    const broker = makeSpyBroker();
    const registry = new McpToolRegistry();
    registry.register(SRV, TOOLS);
    const auditSpy = vi.fn();

    const bridge = buildMcpBridge({ broker, registry, projectRoot: '/r', audit: auditSpy });
    const seen: McpConfirmAction[] = [];

    await bridge.dispatch(
      `${SRV}__greet`,
      { msg: 'hi' },
      async (action) => { seen.push(action); return false; },
    );

    expect(seen).toHaveLength(1);
    const action = seen[0]!;
    expect(action.name).toBe(`${SRV}__greet`);
    expect(action.server).toBe(SRV);
    expect(action.tool).toBe('greet');
    // External MCP tools must be at least 'confirm' tier (never 'read' auto-approve).
    expect(['confirm', 'risky']).toContain(action.tier);
    expect(action.args).toEqual({ msg: 'hi' });
  });
});

// ─── 4) runChatNativeLoop — layoutEnabled:true + interactiveTty:true ─────────

describe('runChatNativeLoop — /mcp with layoutEnabled:true + interactiveTty:true', () => {
  it('/mcp list with TTY opts → namespaced tools output, no provider call', async () => {
    const { adapter, sendSpy } = idleProvider();

    // Pre-build bridge with spy audit and pre-registered tools.
    const broker = makeSpyBroker();
    const registry = new McpToolRegistry();
    registry.register(SRV, TOOLS);
    const auditSpy = vi.fn();
    const bridge = buildMcpBridge({ broker, registry, projectRoot: '/r', audit: auditSpy });

    // Cast: the loop accepts `ReplMcpBridge` duck-type (same shape).
    const mcpBridge = bridge as unknown as ReplMcpBridge;

    const output = vi.fn();

    await runChatNativeLoop({
      provider: adapter,
      dispatcher: fakeDispatcher(),
      input: lines('/mcp'),
      output,
      mcpBridge,
      layoutEnabled: true,
      interactiveTty: true,
      gracefulErrors: false,
    });

    // Provider must NOT have been called.
    expect(sendSpy).not.toHaveBeenCalled();

    // loadAndConnectAll is called by dispatchMcpSlash 'list'.
    expect(broker.connectSpy).not.toHaveBeenCalled(); // already registered via registry.register

    // Output should contain namespaced tool names.
    const allOutput = output.mock.calls.map((c) => c[0] as string).join('\n');
    expect(allOutput).toContain(`${SRV}__greet`);
    expect(allOutput).toContain(`${SRV}__compute`);
  });

  it('layoutEnabled:true does not interfere with /mcp output delivery', async () => {
    const { adapter } = idleProvider();
    const registry = new McpToolRegistry();
    registry.register(SRV, TOOLS);
    const bridge = buildMcpBridge({
      broker: makeSpyBroker(),
      registry,
      projectRoot: '/r',
      audit: vi.fn(),
    });
    const output = vi.fn();

    await runChatNativeLoop({
      provider: adapter,
      dispatcher: fakeDispatcher(),
      input: lines('/mcp list'),
      output,
      mcpBridge: bridge as unknown as ReplMcpBridge,
      layoutEnabled: true,
      interactiveTty: false,
    });

    const allOutput = output.mock.calls.map((c) => c[0] as string).join('\n');
    expect(allOutput).toContain(`${SRV}__greet`);
  });
});

// ─── 5) runChatNativeLoop — opts.mcpConfirm gate ─────────────────────────────

describe('runChatNativeLoop — opts.mcpConfirm exercised on /mcp call', () => {
  it('mcpConfirm returns false → [mcp] cancelled output, REPL continues', async () => {
    const { adapter, sendSpy } = idleProvider();

    // FakeBridge mirrors the real bridge confirm-gate contract (same as repl-mcp-wire.test.ts).
    const dispatchSpy = vi.fn(
      async (
        _name: string,
        _args: Record<string, unknown>,
        confirmFn: McpConfirmFn,
      ) => {
        const approved = await confirmFn({
          name: `${SRV}__greet`,
          server: SRV,
          tool: 'greet',
          tier: 'confirm',
          args: {},
          description: `mcp → ${SRV}::greet`,
        });
        if (!approved) {
          return { ok: false, cancelled: true, output: `[mcp] cancelled: ${SRV}__greet` };
        }
        return { ok: true, output: 'called' };
      },
    );

    const fakeBridge: ReplMcpBridge = {
      listSlashLines: () => [`${SRV}__greet — says hello`],
      listTools: () => [],
      dispatch: dispatchSpy,
      connectAndRefresh: vi.fn(async () => []),
      loadAndConnectAll: vi.fn(async () => [SRV]),
    };

    const mcpConfirmSpy = vi.fn(async (): Promise<boolean> => false);
    const output = vi.fn();

    await runChatNativeLoop({
      provider: adapter,
      dispatcher: fakeDispatcher(),
      input: lines(`/mcp call ${SRV}__greet`, '/mcp list'),
      output,
      mcpBridge: fakeBridge,
      mcpConfirm: mcpConfirmSpy,
    });

    // The /mcp call triggered the bridge dispatch which called mcpConfirm.
    expect(dispatchSpy).toHaveBeenCalledOnce();
    expect(mcpConfirmSpy).toHaveBeenCalledOnce();

    const allOutput = output.mock.calls.map((c) => c[0] as string).join('\n');
    // First line: cancelled.
    expect(allOutput).toContain('[mcp] cancelled');
    // Second line (/mcp list) still processed — REPL alive.
    expect(allOutput).toContain(`${SRV}__greet`);

    // Provider never called.
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('mcpConfirm returns true → bridge.dispatch proceeds (call dispatched)', async () => {
    const { adapter, sendSpy } = idleProvider();

    const dispatchSpy = vi.fn(
      async (
        _name: string,
        _args: Record<string, unknown>,
        confirmFn: McpConfirmFn,
      ) => {
        const approved = await confirmFn({
          name: `${SRV}__greet`,
          server: SRV,
          tool: 'greet',
          tier: 'confirm',
          args: {},
          description: '',
        });
        return approved
          ? { ok: true, output: 'greet-result' }
          : { ok: false, cancelled: true, output: `[mcp] cancelled: ${SRV}__greet` };
      },
    );

    const fakeBridge: ReplMcpBridge = {
      listSlashLines: () => [],
      listTools: () => [],
      dispatch: dispatchSpy,
      connectAndRefresh: vi.fn(async () => []),
      loadAndConnectAll: vi.fn(async () => []),
    };

    const mcpConfirmSpy = vi.fn(async (): Promise<boolean> => true);
    const output = vi.fn();

    await runChatNativeLoop({
      provider: adapter,
      dispatcher: fakeDispatcher(),
      input: lines(`/mcp call ${SRV}__greet`),
      output,
      mcpBridge: fakeBridge,
      mcpConfirm: mcpConfirmSpy,
    });

    expect(mcpConfirmSpy).toHaveBeenCalledOnce();
    const allOutput = output.mock.calls.map((c) => c[0] as string).join('\n');
    expect(allOutput).toContain('greet-result');
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
