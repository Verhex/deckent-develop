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
// Sprint 280 Task 280-004 — REPL `/mcp` broker wire (G1: mcp-bridge → chat-native).
//
// Hermetic: NO real MCP subprocess/connect, NO network. The dispatch core is
// exercised against a duck-typed fake bridge; the loop wire is exercised by
// injecting that fake bridge via `opts.mcpBridge`. The no-server fall-through is
// covered both deterministically (inject `null`) and via real server-discovery
// against an empty tmpdir (loadMcpServers → {} when no .mcp.json is present;
// existence-guarded, so it is CI-safe on a fresh checkout).
//
// Coverage (≥7):
//   1) parseMcpCallArgs — json · key=value · empty
//   2) dispatchMcpSlash list           → loadAndConnectAll + tool catalogue   (server-var→list)
//   3) dispatchMcpSlash call <tool>    → bridge.dispatch w/ parsed args        (call→broker)
//   4) dispatchMcpSlash call (no tool) → i18n usage notice (en)
//   5) dispatchMcpSlash broker throw   → [mcp-error], no throw                 (REPL ayakta)
//   6) dispatchMcpSlash i18n tr vs en  → localized, differ
//   7) loop /mcp + injected bridge     → lists tools, no provider round-trip   (wire)
//   8) loop /mcp call + reject confirm → cancelled output, REPL alive
//   9) loop /mcp + null inject         → honest chat.mcp_not_wired             (server-yok→honest)
//  10) loop /mcp + empty tmpdir root   → honest chat.mcp_not_wired             (real discovery)
//  11) loop /mcp + trusted local scope → connects with NO flag                 (smart-split K1-C)
//  12) loop /mcp + project scope, OFF  → honest chat.mcp_client_disabled       (387-013 gate)
//  13) loop /mcp + project scope, ON   → gate opens (neither notice)           (opt-in path)
import { beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dispatchMcpSlash, parseMcpCallArgs } from "../../src/cli/repl/mcp-bridge.js";
import { getMessage } from "../../src/cli/helpers/messages.js";

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

// WIRE-011: physically merged from tests/cli/repl-mcp-wire.test.ts.
{
// ─── Fakes ──────────────────────────────────────────────────────────────────
const TOOL_LINES = ['everything__echo — echo the input', 'everything__ping — returns pong'];

interface FakeBridge extends ReplMcpBridge {
    loadSpy: ReturnType<typeof vi.fn>;
    listLinesSpy: ReturnType<typeof vi.fn>;
    dispatchSpy: ReturnType<typeof vi.fn>;
}

function makeFakeBridge(overrides: Partial<ReplMcpBridge> = {}): FakeBridge {
    const loadSpy = vi.fn(async (): Promise<string[]> => ['everything']);
    const listLinesSpy = vi.fn((): string[] => [...TOOL_LINES]);
    // Mirror the real bridge: run the confirm-gate, then either cancel or "call".
    const dispatchSpy = vi.fn(async (name: string, args: Record<string, unknown>, confirmFn: McpConfirmFn) => {
        const approved = await confirmFn({
            name,
            server: 'everything',
            tool: name.split('__')[1] ?? '',
            tier: 'confirm',
            args,
            description: `mcp → ${name}`,
        });
        if (!approved) {
            return { ok: false, cancelled: true, output: `[mcp] cancelled: ${name}`, tier: 'confirm' as const };
        }
        return { ok: true, output: `called ${name} ${JSON.stringify(args)}`, tier: 'confirm' as const };
    });
    return {
        listSlashLines: listLinesSpy,
        listTools: vi.fn(() => []),
        dispatch: dispatchSpy,
        connectAndRefresh: vi.fn(async () => []),
        loadAndConnectAll: loadSpy,
        ...overrides,
        loadSpy,
        listLinesSpy,
        dispatchSpy,
    } as FakeBridge;
}

async function* lines(...items: string[]): AsyncIterable<string> {
    for (const item of items)
        yield item;
}

function idleProvider(): {
    adapter: ChatProviderAdapter;
    sendSpy: ReturnType<typeof vi.fn>;
} {
    const sendSpy = vi.fn(async () => {
        throw new Error('provider should not be called for /mcp');
    });
    return { adapter: { send: sendSpy }, sendSpy };
}

function fakeDispatcher(): {
    dispatcher: McpToolDispatcher;
    dispatchSpy: ReturnType<typeof vi.fn>;
} {
    const dispatchSpy = vi.fn(async () => 'tool-ok');
    return { dispatcher: { dispatch: dispatchSpy }, dispatchSpy };
}

// ─── parseMcpCallArgs (pure) ──────────────────────────────────────────────────
describe('parseMcpCallArgs', () => {
    it('parses a JSON object argument', () => {
        expect(parseMcpCallArgs(['{"x":1,"y":"z"}'])).toEqual({ x: 1, y: 'z' });
    });
    it('parses key=value tokens', () => {
        expect(parseMcpCallArgs(['msg=hello', 'count=3'])).toEqual({ msg: 'hello', count: '3' });
    });
    it('returns {} for empty / unparseable input', () => {
        expect(parseMcpCallArgs([])).toEqual({});
        expect(parseMcpCallArgs(['novalue'])).toEqual({});
        // Malformed JSON degrades to key=value parsing (no `=` → {}), never throws.
        expect(parseMcpCallArgs(['{bad json'])).toEqual({});
    });
});

// ─── dispatchMcpSlash (dispatch core) ─────────────────────────────────────────
describe('dispatchMcpSlash', () => {
    it('list → connects then renders the namespaced tool catalogue', async () => {
        const bridge = makeFakeBridge();
        const out = await dispatchMcpSlash({ args: ['list'], bridge, lang: 'en' });
        expect(bridge.loadSpy).toHaveBeenCalledTimes(1);
        expect(out).toBe(TOOL_LINES.join('\n'));
    });
    it('bare /mcp (no subaction) defaults to list', async () => {
        const bridge = makeFakeBridge();
        const out = await dispatchMcpSlash({ args: [], bridge, lang: 'en' });
        expect(bridge.loadSpy).toHaveBeenCalledTimes(1);
        expect(out).toBe(TOOL_LINES.join('\n'));
    });
    it('call <tool> [args] → dispatches through the broker with parsed args', async () => {
        const bridge = makeFakeBridge();
        const confirm = vi.fn(async () => true);
        const out = await dispatchMcpSlash({
            args: ['call', 'everything__echo', 'msg=hi'],
            bridge,
            lang: 'en',
            confirm,
        });
        expect(bridge.dispatchSpy).toHaveBeenCalledTimes(1);
        expect(bridge.dispatchSpy).toHaveBeenCalledWith('everything__echo', { msg: 'hi' }, expect.any(Function));
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(out).toBe('called everything__echo {"msg":"hi"}');
    });
    it('call without a tool name → localized usage notice (en), no dispatch', async () => {
        const bridge = makeFakeBridge();
        const out = await dispatchMcpSlash({ args: ['call'], bridge, lang: 'en' });
        expect(bridge.dispatchSpy).not.toHaveBeenCalled();
        expect(out).toBe(getMessage('chat.slash_unknown_subaction', 'en', { command: '/mcp call', sub: '' }));
    });
    it('broker error is caught — returns [mcp-error] and never throws (fail-safe)', async () => {
        const bridge = makeFakeBridge({
            loadAndConnectAll: vi.fn(async () => {
                throw new Error('boom-connect');
            }),
        });
        const out = await dispatchMcpSlash({ args: ['list'], bridge, lang: 'en' });
        expect(out).toContain('[mcp-error]');
        expect(out).toContain('boom-connect');
    });
    it('unknown subaction → localized notice differs by language (i18n tr/en)', async () => {
        const bridge = makeFakeBridge();
        const en = await dispatchMcpSlash({ args: ['bogus'], bridge, lang: 'en' });
        const tr = await dispatchMcpSlash({ args: ['bogus'], bridge, lang: 'tr' });
        expect(en).toBe(getMessage('chat.slash_unknown_subaction', 'en', { command: '/mcp', sub: 'bogus' }));
        expect(tr).toBe(getMessage('chat.slash_unknown_subaction', 'tr', { command: '/mcp', sub: 'bogus' }));
        expect(en).not.toBe(tr);
        expect(bridge.dispatchSpy).not.toHaveBeenCalled();
    });
});

// ─── runChatNativeLoop /mcp wire (injected bridge) ────────────────────────────
describe('runChatNativeLoop — /mcp wire', () => {
    it('injected bridge: /mcp lists tools without a provider round-trip', async () => {
        const { adapter, sendSpy } = idleProvider();
        const { dispatcher, dispatchSpy } = fakeDispatcher();
        const bridge = makeFakeBridge();
        const output = vi.fn();
        await runChatNativeLoop({
            provider: adapter,
            dispatcher,
            input: lines('/mcp'),
            output,
            mcpBridge: bridge,
        });
        expect(bridge.loadSpy).toHaveBeenCalledTimes(1);
        expect(output).toHaveBeenCalledWith(TOOL_LINES.join('\n'));
        expect(sendSpy).not.toHaveBeenCalled();
        expect(dispatchSpy).not.toHaveBeenCalled();
    });
    it('injected bridge: /mcp call with a rejecting confirm → cancelled, REPL stays alive', async () => {
        const { adapter, sendSpy } = idleProvider();
        const { dispatcher } = fakeDispatcher();
        const bridge = makeFakeBridge();
        const output = vi.fn();
        await runChatNativeLoop({
            provider: adapter,
            dispatcher,
            input: lines('/mcp call everything__echo msg=hi', '/mcp list'),
            output,
            mcpBridge: bridge,
            mcpConfirm: async () => false,
        });
        // First line: dispatch attempted, confirm rejected → cancelled output.
        expect(bridge.dispatchSpy).toHaveBeenCalledTimes(1);
        expect(output).toHaveBeenCalledWith('[mcp] cancelled: everything__echo');
        // Second line still processed → the session did not crash on the call.
        expect(output).toHaveBeenCalledWith(TOOL_LINES.join('\n'));
        expect(sendSpy).not.toHaveBeenCalled();
    });
    it('mcpBridge:null injection → honest no-server notice (chat.mcp_not_wired)', async () => {
        const { adapter, sendSpy } = idleProvider();
        const { dispatcher } = fakeDispatcher();
        const output = vi.fn();
        await runChatNativeLoop({
            provider: adapter,
            dispatcher,
            input: lines('/mcp'),
            output,
            mcpBridge: null,
        });
        expect(output).toHaveBeenCalledWith(getMessage('chat.mcp_not_wired', 'en'));
        expect(sendSpy).not.toHaveBeenCalled();
    });
});

describe('runChatNativeLoop — /mcp server-discovery fall-through (tmpdir)', () => {
    let root: string;
    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'deckent-280-004-'));
    });
    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });
    it('no .mcp.json under projectRoot → honest no-server notice (real loadMcpServers)', async () => {
        const { adapter, sendSpy } = idleProvider();
        const { dispatcher } = fakeDispatcher();
        const output = vi.fn();
        await runChatNativeLoop({
            provider: adapter,
            dispatcher,
            input: lines('/mcp'),
            output,
            projectRoot: root,
            // no mcpBridge injection → loop probes loadMcpServers(root) → {} → fall through
        });
        expect(output).toHaveBeenCalledWith(getMessage('chat.mcp_not_wired', 'en'));
        expect(sendSpy).not.toHaveBeenCalled();
    });
    // ── 387-013 MCP-CLIENT-GATE wired — smart-split (REPL-575 K1-C) ───────────
    // The operator's OWN servers (gitignored .mcp.local.json here; ~/.deckent
    // /mcp.json in real use) always connect; a git-tracked project .mcp.json (a
    // cloned repo's) is opt-in behind `mcp_client_enabled`. A skipped project
    // scope gets the honest disabled-notice, not the misleading "not wired".
    it('trusted .mcp.local.json → connects with NO flag, no disabled-notice', async () => {
        const { adapter, sendSpy } = idleProvider();
        const { dispatcher } = fakeDispatcher();
        const output = vi.fn();
        writeFileSync(join(root, '.mcp.local.json'), JSON.stringify({ mcpServers: { mine: { command: '/nonexistent-deckent-test-binary' } } }));
        await runChatNativeLoop({
            provider: adapter,
            dispatcher,
            input: lines('/mcp'),
            output,
            projectRoot: root,
            // no flag → the operator's OWN server still connects (smart-split);
            // connect fails soft (nonexistent binary) but the gate opened.
        });
        expect(output).not.toHaveBeenCalledWith(getMessage('chat.mcp_client_disabled', 'en'));
        expect(output).not.toHaveBeenCalledWith(getMessage('chat.mcp_not_wired', 'en'));
        expect(sendSpy).not.toHaveBeenCalled();
    });
    it('git-tracked .mcp.json (project scope) but mcp_client_enabled absent → honest disabled-notice, no bridge', async () => {
        const { adapter, sendSpy } = idleProvider();
        const { dispatcher } = fakeDispatcher();
        const output = vi.fn();
        writeFileSync(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { fake: { command: '/nonexistent-deckent-test-binary' } } }));
        await runChatNativeLoop({
            provider: adapter,
            dispatcher,
            input: lines('/mcp'),
            output,
            projectRoot: root,
            // no mcpBridge injection → discovery finds the server, gate finds no flag
        });
        expect(output).toHaveBeenCalledWith(getMessage('chat.mcp_client_disabled', 'en'));
        expect(sendSpy).not.toHaveBeenCalled();
    });
    it('git-tracked .mcp.json and mcp_client_enabled true → gate opens (neither notice is shown)', async () => {
        const { adapter, sendSpy } = idleProvider();
        const { dispatcher } = fakeDispatcher();
        const output = vi.fn();
        writeFileSync(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { fake: { command: '/nonexistent-deckent-test-binary' } } }));
        mkdirSync(join(root, '.deckent'), { recursive: true });
        writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify({ mcp_client_enabled: true }));
        await runChatNativeLoop({
            provider: adapter,
            dispatcher,
            input: lines('/mcp'),
            output,
            projectRoot: root,
            // bridge is built for real; the fake server's connect fails soft inside
            // loadAndConnectAll (nonexistent binary), so this stays hermetic — the
            // assertion is only that the GATE opened (no notice short-circuit).
        });
        expect(output).not.toHaveBeenCalledWith(getMessage('chat.mcp_client_disabled', 'en'));
        expect(output).not.toHaveBeenCalledWith(getMessage('chat.mcp_not_wired', 'en'));
        expect(sendSpy).not.toHaveBeenCalled();
    });
});
}
