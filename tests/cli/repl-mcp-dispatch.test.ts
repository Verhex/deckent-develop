// Sprint 229 Task 229-005 — REPL `/mcp` dispatch + confirm-gate + audit tests.
//
// Hermetic — uses a per-test tmpdir for the event-stream audit file and a
// duck-typed fake broker (no MCP subprocess, no network). The bridge is
// composed against the REAL `McpToolRegistry` so the namespacing contract
// (229-003) participates in every test.
//
// Coverage:
//   1) `/mcp` listele                          → renderMcpSlashLines
//   2) namespaced çağrı → confirm sorar        → dispatch passes action to confirmFn
//   3) confirm-onay → callTool + audit yazılır → broker.callTool fires + JSONL event
//   4) reddet → çağrı yok                       → callTool NOT invoked + cancelled JSONL

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildMcpBridge,
  renderMcpSlashLines,
  MCP_AUDIT_CHANNEL,
  type BridgeBrokerLike,
  type McpConfirmAction,
} from '../../src/cli/commands/chat-mcp-bridge.js';
import { McpToolRegistry } from '../../src/mcp-client/registry.js';
import type {
  McpServerDef,
  McpToolDescriptor,
} from '../../src/mcp-client/types.js';

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
  listSpy: ReturnType<typeof vi.fn>;
} {
  const callSpy = vi.fn(opts.callImpl ?? (async () => ({ content: [{ type: 'text', text: 'pong' }] })));
  const listSpy = vi.fn(async () => FAKE_TOOLS);
  return {
    callSpy,
    listSpy,
    async connect(_name: string, _def: McpServerDef): Promise<void> {
      // no-op for tests
    },
    async listTools(name: string): Promise<McpToolDescriptor[]> {
      return listSpy(name);
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
  const p = join(root, '.deckent', `${sprintId}-events.jsonl`);
  if (!existsSync(p)) return [];
  const raw = readFileSync(p, 'utf-8');
  return raw
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}

let projectRoot: string;
const SPRINT_ID = 'sprint-test-229-005';

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'deckent-mcp-bridge-'));
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('chat-mcp-bridge (229-005)', () => {
  it('/mcp listele → renderMcpSlashLines returns one entry per namespaced tool', () => {
    const registry = new McpToolRegistry();
    registry.register(SERVER_NAME, FAKE_TOOLS);

    const lines = renderMcpSlashLines(registry);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('everything__echo');
    expect(lines[0]).toContain('echo the input back');
    expect(lines[1]).toContain('everything__ping');

    // Empty registry path also works.
    const empty = renderMcpSlashLines(new McpToolRegistry());
    expect(empty).toEqual(['MCP server yok']);
  });

  it('namespaced çağrı → confirm callback is invoked with the resolved action', async () => {
    const registry = new McpToolRegistry();
    registry.register(SERVER_NAME, FAKE_TOOLS);
    const broker = makeBroker();

    const seen: McpConfirmAction[] = [];
    const confirmFn = async (a: McpConfirmAction): Promise<boolean> => {
      seen.push(a);
      // Reject so the second test independently verifies the approval-path call.
      return false;
    };

    const bridge = buildMcpBridge({
      broker,
      registry,
      projectRoot,
      sprintId: SPRINT_ID,
    });

    const res = await bridge.dispatch(
      'everything__ping',
      { foo: 'bar' },
      confirmFn,
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]?.server).toBe('everything');
    expect(seen[0]?.tool).toBe('ping');
    expect(seen[0]?.name).toBe('everything__ping');
    expect(seen[0]?.args).toEqual({ foo: 'bar' });
    // MCP calls are always at least 'confirm' tier (external = arbitrary side-effect).
    expect(seen[0]?.tier).toBe('confirm');
    expect(res.cancelled).toBe(true);
    expect(res.ok).toBe(false);
    expect(broker.callSpy).not.toHaveBeenCalled();
  });

  it('confirm-onay → broker.callTool fires and an audit event is written', async () => {
    const registry = new McpToolRegistry();
    registry.register(SERVER_NAME, FAKE_TOOLS);
    const broker = makeBroker({
      callImpl: async () => ({ content: [{ type: 'text', text: 'pong' }] }),
    });

    const bridge = buildMcpBridge({
      broker,
      registry,
      projectRoot,
      sprintId: SPRINT_ID,
    });

    const res = await bridge.dispatch('everything__ping', { x: 1 }, async () => true);

    expect(res.ok).toBe(true);
    expect(res.cancelled).toBeUndefined();
    expect(res.output).toContain('pong');

    expect(broker.callSpy).toHaveBeenCalledTimes(1);
    expect(broker.callSpy).toHaveBeenCalledWith('everything', 'ping', { x: 1 });

    const events = readEventsFile(projectRoot, SPRINT_ID);
    expect(events.length).toBeGreaterThanOrEqual(1);
    const last = events[events.length - 1] as {
      channel: string;
      payload: { server: string; tool: string; outcome: string; namespacedName: string };
    };
    expect(last.channel).toBe(MCP_AUDIT_CHANNEL);
    expect(last.payload.outcome).toBe('ok');
    expect(last.payload.server).toBe('everything');
    expect(last.payload.tool).toBe('ping');
    expect(last.payload.namespacedName).toBe('everything__ping');
  });

  it('reddet → broker.callTool NOT invoked + cancelled audit event written', async () => {
    const registry = new McpToolRegistry();
    registry.register(SERVER_NAME, FAKE_TOOLS);
    const broker = makeBroker();

    const bridge = buildMcpBridge({
      broker,
      registry,
      projectRoot,
      sprintId: SPRINT_ID,
    });

    const res = await bridge.dispatch('everything__echo', { msg: 'hi' }, async () => false);

    expect(res.ok).toBe(false);
    expect(res.cancelled).toBe(true);
    expect(broker.callSpy).not.toHaveBeenCalled();

    const events = readEventsFile(projectRoot, SPRINT_ID);
    expect(events.length).toBeGreaterThanOrEqual(1);
    const last = events[events.length - 1] as {
      channel: string;
      payload: { outcome: string; namespacedName: string };
    };
    expect(last.channel).toBe(MCP_AUDIT_CHANNEL);
    expect(last.payload.outcome).toBe('cancelled');
    expect(last.payload.namespacedName).toBe('everything__echo');
  });

  it('unknown namespaced name → no callTool, no confirm, error output + unknown-tool audit', async () => {
    const registry = new McpToolRegistry();
    registry.register(SERVER_NAME, FAKE_TOOLS);
    const broker = makeBroker();
    const confirmFn = vi.fn(async () => true);

    const bridge = buildMcpBridge({
      broker,
      registry,
      projectRoot,
      sprintId: SPRINT_ID,
    });

    const res = await bridge.dispatch('nosuch__tool', {}, confirmFn);
    expect(res.ok).toBe(false);
    expect(res.output).toContain('unknown tool');
    expect(confirmFn).not.toHaveBeenCalled();
    expect(broker.callSpy).not.toHaveBeenCalled();

    const events = readEventsFile(projectRoot, SPRINT_ID);
    const last = events[events.length - 1] as { payload: { outcome: string } };
    expect(last.payload.outcome).toBe('unknown-tool');
  });
});
