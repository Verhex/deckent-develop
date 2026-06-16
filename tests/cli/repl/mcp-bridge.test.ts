// Sprint 260 Task 260-015 — F9-001: REPL ↔ external-MCP-client live wire.
//
// Verifies `initReplMcpBridge` — the composition root that gives `buildMcpBridge`
// / `McpClientBroker` their first production caller, gated behind a default-off
// `mcp_client_enabled` flag.
//
// Hermetic: per-test tmpdir for the event-stream audit file; a duck-typed fake
// broker (no MCP subprocess, no network) injected via `deps`; the REAL
// `McpToolRegistry` + REAL `buildMcpBridge` participate so the live dispatch
// path (confirm-gate + audit) is exercised end-to-end.
//
// Coverage:
//   1) isMcpClientEnabled truth table (undefined / false / true).
//   2) flag off → initReplMcpBridge returns null (backward-safe; no surface).
//   3) flag on, default deps → real McpClientBroker + real registry composed;
//      bridge non-null, listTools() empty (NO auto-connect proof).
//   4) flag on, injected fake broker → no broker.connect during init (no auto-connect).
//   5) flag on → dispatch flows through buildMcpBridge: confirm asked, callTool
//      fires on approve, audit JSONL written (the live wire reaches external tools).
//   6) flag on → reject path: callTool NOT invoked + cancelled audit event.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  initReplMcpBridge,
  isMcpClientEnabled,
} from '../../../src/cli/repl/mcp-bridge.js';
import {
  MCP_AUDIT_CHANNEL,
  type BridgeBrokerLike,
  type McpConfirmAction,
} from '../../../src/cli/commands/chat-mcp-bridge.js';
import type {
  McpServerDef,
  McpToolDescriptor,
} from '../../../src/mcp-client/types.js';

// ─── Test fixtures ──────────────────────────────────────────────────────────

const SERVER_NAME = 'everything';
const FAKE_TOOLS: McpToolDescriptor[] = [
  { name: 'echo', description: 'echo the input back' },
  { name: 'ping', description: 'returns pong' },
];

function makeBroker(opts: {
  callImpl?: (server: string, tool: string, args?: Record<string, unknown>) => Promise<unknown>;
} = {}): BridgeBrokerLike & {
  callSpy: ReturnType<typeof vi.fn>;
  connectSpy: ReturnType<typeof vi.fn>;
} {
  const callSpy = vi.fn(
    opts.callImpl ?? (async () => ({ content: [{ type: 'text', text: 'pong' }] })),
  );
  const connectSpy = vi.fn(async () => {});
  return {
    callSpy,
    connectSpy,
    async connect(name: string, def: McpServerDef): Promise<void> {
      await connectSpy(name, def);
    },
    async listTools(_name: string): Promise<McpToolDescriptor[]> {
      return FAKE_TOOLS;
    },
    async callTool(
      server: string,
      tool: string,
      args?: Record<string, unknown>,
    ): Promise<unknown> {
      return callSpy(server, tool, args);
    },
    isConnected(_name: string): boolean {
      return true;
    },
    list(): string[] {
      return [SERVER_NAME];
    },
  };
}

function readEventsFile(root: string, sprintId: string): unknown[] {
  const p = join(root, '.deckent', 'recently-works', `${sprintId}-events.jsonl`);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf-8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}

let projectRoot: string;
const SPRINT_ID = 'sprint-test-260-015';

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'deckent-repl-mcp-'));
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('repl/mcp-bridge — initReplMcpBridge (260-015)', () => {
  it('isMcpClientEnabled: only an explicit true opts in (default off)', () => {
    expect(isMcpClientEnabled(undefined)).toBe(false);
    expect(isMcpClientEnabled({})).toBe(false);
    expect(isMcpClientEnabled({ mcp_client_enabled: false })).toBe(false);
    expect(isMcpClientEnabled({ mcp_client_enabled: true })).toBe(true);
  });

  it('flag off → returns null (no broker, backward-safe)', () => {
    const broker = makeBroker();

    expect(
      initReplMcpBridge({ config: undefined, projectRoot, deps: { broker } }),
    ).toBeNull();
    expect(
      initReplMcpBridge({ config: {}, projectRoot, deps: { broker } }),
    ).toBeNull();
    expect(
      initReplMcpBridge({
        config: { mcp_client_enabled: false },
        projectRoot,
        deps: { broker },
      }),
    ).toBeNull();

    // No connection attempted on the off path.
    expect(broker.connectSpy).not.toHaveBeenCalled();
  });

  it('flag on, default deps → real McpClientBroker composed; bridge non-null, NOT connected', async () => {
    // No injected broker → exercises the real `new McpClientBroker()` default.
    const bridge = initReplMcpBridge({
      config: { mcp_client_enabled: true },
      projectRoot,
      sprintId: SPRINT_ID,
    });

    expect(bridge).not.toBeNull();
    // No auto-connect: nothing registered because nothing was connected.
    expect(bridge?.listTools()).toEqual([]);
    expect(bridge?.listSlashLines()).toEqual(['MCP server yok']);
  });

  it('flag on → composing the bridge does NOT auto-connect the broker', () => {
    const broker = makeBroker();

    const bridge = initReplMcpBridge({
      config: { mcp_client_enabled: true },
      projectRoot,
      sprintId: SPRINT_ID,
      deps: { broker },
    });

    expect(bridge).not.toBeNull();
    // Init must be side-effect-free w.r.t. connections.
    expect(broker.connectSpy).not.toHaveBeenCalled();
  });

  it('flag on → dispatch flows through buildMcpBridge (confirm + callTool + audit)', async () => {
    const broker = makeBroker();
    const bridge = initReplMcpBridge({
      config: { mcp_client_enabled: true },
      projectRoot,
      sprintId: SPRINT_ID,
      deps: { broker },
    });
    expect(bridge).not.toBeNull();

    // Connect explicitly (no auto-connect) so the registry is populated.
    await bridge!.connectAndRefresh(SERVER_NAME, {
      transport: 'stdio',
      command: 'noop',
    });

    const seen: McpConfirmAction[] = [];
    const res = await bridge!.dispatch(
      'everything__ping',
      { x: 1 },
      async (a) => {
        seen.push(a);
        return true;
      },
    );

    // Confirm callback received the resolved action at >= 'confirm' tier.
    expect(seen).toHaveLength(1);
    expect(seen[0]?.server).toBe('everything');
    expect(seen[0]?.tool).toBe('ping');
    expect(seen[0]?.tier).toBe('confirm');

    expect(res.ok).toBe(true);
    expect(res.output).toContain('pong');
    expect(broker.callSpy).toHaveBeenCalledWith('everything', 'ping', { x: 1 });

    // Audit event written to the event stream (single audit path via writeEvent).
    const events = readEventsFile(projectRoot, SPRINT_ID);
    const last = events[events.length - 1] as {
      channel: string;
      payload: { outcome: string; namespacedName: string };
    };
    expect(last.channel).toBe(MCP_AUDIT_CHANNEL);
    expect(last.payload.outcome).toBe('ok');
    expect(last.payload.namespacedName).toBe('everything__ping');
  });

  it('flag on → reject path: callTool NOT invoked + cancelled audit event', async () => {
    const broker = makeBroker();
    const bridge = initReplMcpBridge({
      config: { mcp_client_enabled: true },
      projectRoot,
      sprintId: SPRINT_ID,
      deps: { broker },
    });

    await bridge!.connectAndRefresh(SERVER_NAME, {
      transport: 'stdio',
      command: 'noop',
    });

    const res = await bridge!.dispatch('everything__echo', { msg: 'hi' }, async () => false);

    expect(res.ok).toBe(false);
    expect(res.cancelled).toBe(true);
    expect(broker.callSpy).not.toHaveBeenCalled();

    const events = readEventsFile(projectRoot, SPRINT_ID);
    const last = events[events.length - 1] as { payload: { outcome: string } };
    expect(last.payload.outcome).toBe('cancelled');
  });
});
