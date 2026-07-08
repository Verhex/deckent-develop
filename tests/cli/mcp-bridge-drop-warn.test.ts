// Task 387-024 (born-553) — MCP-BRIDGE-DROP-WARN.
//
// Regression coverage for a real bug found by code review
// (.analysis/deckent-repl-code-review-2026-07-08.md:197,793):
// `dispatch()` in chat-mcp-bridge.ts audited a successful `broker.callTool()`
// as 'ok', then — while building the return value — called
// `JSON.stringify(result)` INSIDE the same try block. A non-JSON-serializable
// result (e.g. a BigInt field) makes that stringify throw, which the
// surrounding catch treats as a tool failure: a SECOND 'error' audit fires
// for the same already-succeeded call, and the caller receives a misleading
// `[mcp-error]` even though the external tool genuinely succeeded — the real
// result is silently dropped with no indication of why.
//
// Fix under test: `serializeToolResult()` catches the stringify failure
// internally and returns a visible `[mcp-warn] ...` marker instead of
// throwing, so the single 'ok' audit already fired is the ONLY audit record
// and the caller sees an honest warning instead of a fabricated error.
//
// Hermetic: no filesystem event-stream — `audit` is injected directly via
// `McpBridgeOptions.audit`, so no tmpdir/cleanup is needed.

import { describe, it, expect, vi } from 'vitest';

import {
  buildMcpBridge,
  type BridgeBrokerLike,
  type McpAuditRecord,
} from '../../src/cli/commands/chat-mcp-bridge.js';
import { McpToolRegistry } from '../../src/mcp-client/registry.js';
import type { McpServerDef, McpToolDescriptor } from '../../src/mcp-client/types.js';

const SERVER_NAME = 'srv';

const TOOLS: McpToolDescriptor[] = [
  { name: 'get_thing', description: 'read-only tool' },
  { name: 'write_thing', description: 'confirm-tier tool' },
];

function makeBroker(
  callImpl: (server: string, tool: string, args?: Record<string, unknown>) => Promise<unknown>,
): BridgeBrokerLike {
  return {
    async connect(): Promise<void> {},
    async listTools(): Promise<McpToolDescriptor[]> {
      return TOOLS;
    },
    async callTool(
      server: string,
      tool: string,
      args?: Record<string, unknown>,
    ): Promise<unknown> {
      return callImpl(server, tool, args);
    },
    isConnected(): boolean {
      return true;
    },
    list(): string[] {
      return [SERVER_NAME];
    },
  };
}

function setupBridge(
  callImpl: (server: string, tool: string, args?: Record<string, unknown>) => Promise<unknown>,
): {
  bridge: ReturnType<typeof buildMcpBridge>;
  auditSpy: ReturnType<typeof vi.fn<(record: McpAuditRecord) => void>>;
} {
  const broker = makeBroker(callImpl);
  const registry = new McpToolRegistry();
  registry.register(SERVER_NAME, TOOLS);
  const auditSpy = vi.fn<(record: McpAuditRecord) => void>();
  const bridge = buildMcpBridge({
    broker,
    registry,
    projectRoot: '/unused-hermetic-placeholder',
    audit: auditSpy,
  });
  return { bridge, auditSpy };
}

const NON_SERIALIZABLE_RESULT = { big: BigInt(10) };
const AUTO_CONFIRM = async (): Promise<boolean> => true;

describe('chat-mcp-bridge — drop-warn + single-audit (387-024/born-553)', () => {
  it('read-tier: non-serializable result → single "ok" audit + visible [mcp-warn], not a fake error', async () => {
    const { bridge, auditSpy } = setupBridge(async () => NON_SERIALIZABLE_RESULT);

    const res = await bridge.dispatch(`${SERVER_NAME}__get_thing`, {}, AUTO_CONFIRM);

    expect(res.ok).toBe(true);
    expect(res.output).toContain('[mcp-warn]');
    expect(res.output).not.toContain('[mcp-error]');

    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy.mock.calls[0]?.[0]?.outcome).toBe('ok');
  });

  it('confirm-tier (approved): non-serializable result → single "ok" audit + visible [mcp-warn]', async () => {
    const { bridge, auditSpy } = setupBridge(async () => NON_SERIALIZABLE_RESULT);

    const res = await bridge.dispatch(`${SERVER_NAME}__write_thing`, {}, AUTO_CONFIRM);

    expect(res.ok).toBe(true);
    expect(res.output).toContain('[mcp-warn]');
    expect(res.output).not.toContain('[mcp-error]');

    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy.mock.calls[0]?.[0]?.outcome).toBe('ok');
  });

  it('regression: JSON-serializable result still audits once "ok" with the real output', async () => {
    const { bridge, auditSpy } = setupBridge(async () => ({ hello: 'world' }));

    const res = await bridge.dispatch(`${SERVER_NAME}__get_thing`, {}, AUTO_CONFIRM);

    expect(res.ok).toBe(true);
    expect(res.output).toBe(JSON.stringify({ hello: 'world' }));
    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy.mock.calls[0]?.[0]?.outcome).toBe('ok');
  });

  it('regression: a genuine callTool failure still audits once "error"', async () => {
    const { bridge, auditSpy } = setupBridge(async () => {
      throw new Error('boom');
    });

    const res = await bridge.dispatch(`${SERVER_NAME}__get_thing`, {}, AUTO_CONFIRM);

    expect(res.ok).toBe(false);
    expect(res.output).toContain('[mcp-error]');
    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy.mock.calls[0]?.[0]?.outcome).toBe('error');
  });
});
