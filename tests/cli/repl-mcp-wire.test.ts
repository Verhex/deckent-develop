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
//  11) loop /mcp + server, flag OFF    → honest chat.mcp_client_disabled       (387-013 gate, REPL-575 K1)
//  12) loop /mcp + server, flag ON     → gate opens (neither notice)           (opt-in path)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  dispatchMcpSlash,
  parseMcpCallArgs,
  type ReplMcpBridge,
} from '../../src/cli/repl/mcp-bridge.js';
import {
  runChatNativeLoop,
  type ChatProviderAdapter,
  type McpToolDispatcher,
} from '../../src/cli/commands/chat-native.js';
import type { McpConfirmFn } from '../../src/cli/commands/chat-mcp-bridge.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

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
  const dispatchSpy = vi.fn(
    async (
      name: string,
      args: Record<string, unknown>,
      confirmFn: McpConfirmFn,
    ) => {
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
    },
  );
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
  for (const item of items) yield item;
}

function idleProvider(): { adapter: ChatProviderAdapter; sendSpy: ReturnType<typeof vi.fn> } {
  const sendSpy = vi.fn(async () => {
    throw new Error('provider should not be called for /mcp');
  });
  return { adapter: { send: sendSpy }, sendSpy };
}

function fakeDispatcher(): { dispatcher: McpToolDispatcher; dispatchSpy: ReturnType<typeof vi.fn> } {
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
    expect(bridge.dispatchSpy).toHaveBeenCalledWith(
      'everything__echo',
      { msg: 'hi' },
      expect.any(Function),
    );
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

  // ── 387-013 MCP-CLIENT-GATE wired (REPL-575 K1) ──────────────────────────
  // Server presence alone must no longer build the external client: the
  // opt-in `mcp_client_enabled` flag gates it, and servers-but-off gets the
  // honest disabled-notice (not the misleading "not wired" fall-through).

  it('server configured but mcp_client_enabled absent → honest disabled-notice, no bridge', async () => {
    const { adapter, sendSpy } = idleProvider();
    const { dispatcher } = fakeDispatcher();
    const output = vi.fn();
    writeFileSync(
      join(root, '.mcp.json'),
      JSON.stringify({ mcpServers: { fake: { command: '/nonexistent-deckent-test-binary' } } }),
    );

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

  it('server configured and mcp_client_enabled true → gate opens (neither notice is shown)', async () => {
    const { adapter, sendSpy } = idleProvider();
    const { dispatcher } = fakeDispatcher();
    const output = vi.fn();
    writeFileSync(
      join(root, '.mcp.json'),
      JSON.stringify({ mcpServers: { fake: { command: '/nonexistent-deckent-test-binary' } } }),
    );
    mkdirSync(join(root, '.deckent'), { recursive: true });
    writeFileSync(
      join(root, '.deckent', 'config.json'),
      JSON.stringify({ mcp_client_enabled: true }),
    );

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
