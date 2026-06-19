// Sprint 301 Task 301-024 — F9-003: external MCP-tool trust/approval gate + audit.
//
// Hermetic — NO real MCP subprocess, NO network, NO file I/O (audit injected
// as spy, not writeEvent). loadMcpServers NOT mocked (dispatch never calls it).
//
// Coverage:
//   Suite 1: classifyExternalTool — read-only prefixes → 'read', others → 'confirm', never 'always'
//   Suite 2: dispatch with read-only external tool → confirmFn NOT called, callTool called, audit='ok'
//   Suite 3: dispatch with risky tool + confirm=false → callTool NOT called, audit='cancelled', cancelled=true
//   Suite 4: dispatch with risky tool + confirm=true → callTool called, audit='ok'
//   Suite 5: external-tool tier is NEVER 'always'

import { describe, it, expect, vi } from 'vitest';

import {
  classifyExternalTool,
} from '../../src/cli/repl/tool-permissions.js';
import {
  buildMcpBridge,
  type BridgeBrokerLike,
  type McpAuditRecord,
  MCP_AUDIT_CHANNEL,
} from '../../src/cli/commands/chat-mcp-bridge.js';
import { McpToolRegistry } from '../../src/mcp-client/registry.js';
import type { McpToolDescriptor } from '../../src/mcp-client/types.js';

// ─── Fake broker factory ──────────────────────────────────────────────────────

const SRV = 'extserver';

interface SpyBroker extends BridgeBrokerLike {
  callToolSpy: ReturnType<typeof vi.fn>;
}

function makeSpyBroker(opts: { callResult?: unknown; callThrows?: string } = {}): SpyBroker {
  const callToolSpy = vi.fn(
    async (_s: string, _t: string, _a?: Record<string, unknown>): Promise<unknown> => {
      if (opts.callThrows) throw new Error(opts.callThrows);
      return opts.callResult ?? 'tool-result';
    },
  );
  const connected = new Set<string>();
  return {
    callToolSpy,
    async connect(name: string): Promise<void> { connected.add(name); },
    async listTools(_name: string): Promise<McpToolDescriptor[]> { return []; },
    async callTool(s: string, t: string, a?: Record<string, unknown>): Promise<unknown> {
      return callToolSpy(s, t, a);
    },
    isConnected(name: string): boolean { return connected.has(name); },
    list(): string[] { return Array.from(connected); },
  };
}

function makeBridge(broker: BridgeBrokerLike, registry: McpToolRegistry, auditSpy: ReturnType<typeof vi.fn>) {
  return buildMcpBridge({
    broker,
    registry,
    projectRoot: '/fake/root',
    audit: auditSpy,
  });
}

// ─── Suite 1: classifyExternalTool ────────────────────────────────────────────

describe('classifyExternalTool — read-only prefix heuristics', () => {
  it.each([
    ['list_users', 'read'],
    ['list_', 'read'],
    ['get_status', 'read'],
    ['get_config', 'read'],
    ['read_file', 'read'],
    ['fetch_data', 'read'],
    ['describe_table', 'read'],
    ['show_info', 'read'],
    ['search_records', 'read'],
    ['query_db', 'read'],
    ['inspect_node', 'read'],
    ['check_health', 'read'],
    ['find_users', 'read'],
    ['browse_dir', 'read'],
  ] as const)('"%s" → "%s"', (toolName, expected) => {
    expect(classifyExternalTool(toolName)).toBe(expected);
  });

  it.each([
    ['write_file'],
    ['execute_command'],
    ['create_record'],
    ['delete_entry'],
    ['update_config'],
    ['send_message'],
    ['greet'],
    ['compute'],
    ['run_script'],
    ['deploy'],
    ['echo'],
    ['calculate'],
  ])('"%s" → "confirm"', (toolName) => {
    expect(classifyExternalTool(toolName)).toBe('confirm');
  });

  it('never returns "always" for any tool name', () => {
    const tools = [
      'list_items', 'write_file', 'execute', 'deckent_kill',
      'get_user', 'destroy_all', 'rm_rf', 'drop_database',
    ];
    for (const t of tools) {
      expect(classifyExternalTool(t)).not.toBe('always');
    }
  });

  it('is case-insensitive — LIST_USERS → "read"', () => {
    expect(classifyExternalTool('LIST_USERS')).toBe('read');
    expect(classifyExternalTool('GET_Status')).toBe('read');
    expect(classifyExternalTool('WRITE_FILE')).toBe('confirm');
  });
});

// ─── Suite 2: dispatch — read-only tool auto-approves ─────────────────────────

describe('F9-003 dispatch — read-only external tool auto-approves', () => {
  it('list_items tool → confirmFn NOT called, callTool called, audit outcome=ok', async () => {
    const broker = makeSpyBroker({ callResult: ['a', 'b', 'c'] });
    const registry = new McpToolRegistry();
    const tools: McpToolDescriptor[] = [{ name: 'list_items', description: 'lists items' }];
    registry.register(SRV, tools);

    const auditSpy = vi.fn((_r: McpAuditRecord): void => undefined);
    const bridge = makeBridge(broker, registry, auditSpy);

    const confirmFn = vi.fn(async () => true);

    const result = await bridge.dispatch(`${SRV}__list_items`, {}, confirmFn);

    expect(confirmFn).not.toHaveBeenCalled();
    expect(broker.callToolSpy).toHaveBeenCalledWith(SRV, 'list_items', {});
    expect(result.ok).toBe(true);
    expect(result.cancelled).toBeUndefined();
    expect(result.tier).toBe('read');

    expect(auditSpy).toHaveBeenCalledOnce();
    const rec = auditSpy.mock.calls[0]?.[0] as McpAuditRecord;
    expect(rec.outcome).toBe('ok');
    expect(rec.server).toBe(SRV);
    expect(rec.tool).toBe('list_items');
    expect(rec.namespacedName).toBe(`${SRV}__list_items`);
  });

  it('get_config tool → confirmFn NOT called, result is stringified', async () => {
    const broker = makeSpyBroker({ callResult: { key: 'value' } });
    const registry = new McpToolRegistry();
    registry.register(SRV, [{ name: 'get_config' }]);

    const auditSpy = vi.fn();
    const bridge = makeBridge(broker, registry, auditSpy);

    const confirmFn = vi.fn(async () => false);

    const result = await bridge.dispatch(`${SRV}__get_config`, { key: 'theme' }, confirmFn);

    expect(confirmFn).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.output).toContain('value');
  });

  it('read-only tool throws → confirmFn NOT called, audit outcome=error, ok=false', async () => {
    const broker = makeSpyBroker({ callThrows: 'permission denied' });
    const registry = new McpToolRegistry();
    registry.register(SRV, [{ name: 'read_file' }]);

    const auditSpy = vi.fn((_r: McpAuditRecord): void => undefined);
    const bridge = makeBridge(broker, registry, auditSpy);

    const confirmFn = vi.fn(async () => true);

    const result = await bridge.dispatch(`${SRV}__read_file`, { path: '/etc/hosts' }, confirmFn);

    expect(confirmFn).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.output).toContain('[mcp-error]');
    expect(result.output).toContain('permission denied');

    const rec = auditSpy.mock.calls[0]?.[0] as McpAuditRecord;
    expect(rec.outcome).toBe('error');
  });
});

// ─── Suite 3: dispatch — risky tool + reject → cancelled ─────────────────────

describe('F9-003 dispatch — risky tool rejected → cancelled, no callTool, audit=cancelled', () => {
  it('write_file + confirm=false → cancelled output, callTool NOT called, audit outcome=cancelled', async () => {
    const broker = makeSpyBroker();
    const registry = new McpToolRegistry();
    registry.register(SRV, [{ name: 'write_file', description: 'writes a file' }]);

    const auditSpy = vi.fn((_r: McpAuditRecord): void => undefined);
    const bridge = makeBridge(broker, registry, auditSpy);

    const result = await bridge.dispatch(
      `${SRV}__write_file`,
      { path: '/tmp/test.txt', content: 'hello' },
      async () => false,
    );

    expect(broker.callToolSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(result.output).toContain('cancelled');

    expect(auditSpy).toHaveBeenCalledOnce();
    const rec = auditSpy.mock.calls[0]?.[0] as McpAuditRecord;
    expect(rec.outcome).toBe('cancelled');
    expect(rec.server).toBe(SRV);
    expect(rec.tool).toBe('write_file');
    expect(rec.namespacedName).toBe(`${SRV}__write_file`);
    expect(rec.args).toEqual({ path: '/tmp/test.txt', content: 'hello' });
  });

  it('execute_command + confirm=false → callTool NOT called', async () => {
    const broker = makeSpyBroker();
    const registry = new McpToolRegistry();
    registry.register(SRV, [{ name: 'execute_command' }]);

    const auditSpy = vi.fn();
    const bridge = makeBridge(broker, registry, auditSpy);

    const result = await bridge.dispatch(`${SRV}__execute_command`, { cmd: 'rm -rf /' }, async () => false);

    expect(broker.callToolSpy).not.toHaveBeenCalled();
    expect(result.cancelled).toBe(true);

    const rec = auditSpy.mock.calls[0]?.[0] as McpAuditRecord;
    expect(rec.outcome).toBe('cancelled');
  });

  it('confirmFn receives correct McpConfirmAction shape for risky tool', async () => {
    const broker = makeSpyBroker();
    const registry = new McpToolRegistry();
    registry.register(SRV, [{ name: 'send_message', description: 'sends a message' }]);

    const auditSpy = vi.fn();
    const bridge = makeBridge(broker, registry, auditSpy);

    const seen: unknown[] = [];
    await bridge.dispatch(`${SRV}__send_message`, { to: 'user', body: 'hi' }, async (action) => {
      seen.push(action);
      return false;
    });

    expect(seen).toHaveLength(1);
    const action = seen[0] as { name: string; server: string; tool: string; tier: string; args: unknown };
    expect(action.name).toBe(`${SRV}__send_message`);
    expect(action.server).toBe(SRV);
    expect(action.tool).toBe('send_message');
    expect(action.tier).toBe('confirm');
    expect(action.args).toEqual({ to: 'user', body: 'hi' });
  });
});

// ─── Suite 4: dispatch — risky tool approved → callTool + audit=ok ────────────

describe('F9-003 dispatch — risky tool approved → callTool + audit=ok', () => {
  it('create_record + confirm=true → callTool called, audit outcome=ok', async () => {
    const broker = makeSpyBroker({ callResult: { id: 42 } });
    const registry = new McpToolRegistry();
    registry.register(SRV, [{ name: 'create_record' }]);

    const auditSpy = vi.fn((_r: McpAuditRecord): void => undefined);
    const bridge = makeBridge(broker, registry, auditSpy);

    const result = await bridge.dispatch(`${SRV}__create_record`, { name: 'foo' }, async () => true);

    expect(broker.callToolSpy).toHaveBeenCalledWith(SRV, 'create_record', { name: 'foo' });
    expect(result.ok).toBe(true);
    expect(result.tier).toBe('confirm');
    expect(result.cancelled).toBeUndefined();

    const rec = auditSpy.mock.calls[0]?.[0] as McpAuditRecord;
    expect(rec.outcome).toBe('ok');
  });
});

// ─── Suite 5: external-tool tier is never 'always' ───────────────────────────

describe('F9-003 — external-tool tier is NEVER "always"', () => {
  it('classifyExternalTool never returns "always" for any external tool name', () => {
    const externalTools = [
      'write_file', 'delete_record', 'execute_cmd', 'deploy',
      'list_items', 'get_user', 'read_file', 'echo',
      // Even names that sound like deckent destructive tools
      'deckent_kill', 'deckent_cleanup', 'deckent_recover',
    ];
    for (const t of externalTools) {
      const tier = classifyExternalTool(t);
      expect(tier, `expected '${t}' NOT to be 'always'`).not.toBe('always');
      expect(['read', 'confirm']).toContain(tier);
    }
  });

  it('dispatch: even an "always"-named namespaced external tool is confirmed, not always', async () => {
    // A tool whose namespaced name collides with a deckent 'always'-tier tool name.
    // The bridge downgrades 'always' → 'confirm' for external tools.
    const broker = makeSpyBroker();
    const registry = new McpToolRegistry();
    // Register a tool with a namespaced name that looks like deckent_kill but via external server
    registry.register('myserver', [{ name: 'cleanup' }]);

    const auditSpy = vi.fn();
    const bridge = makeBridge(broker, registry, auditSpy);

    const seen: unknown[] = [];
    await bridge.dispatch('myserver__cleanup', {}, async (action) => {
      seen.push(action);
      return false;
    });

    // confirmFn was called (not skipped as 'read'), and tier is not 'always'
    expect(seen).toHaveLength(1);
    const action = seen[0] as { tier: string };
    expect(action.tier).not.toBe('always');
    expect(['read', 'confirm']).toContain(action.tier);
  });

  it('MCP_AUDIT_CHANNEL constant is defined and non-empty', () => {
    expect(MCP_AUDIT_CHANNEL).toBeTruthy();
    expect(typeof MCP_AUDIT_CHANNEL).toBe('string');
  });
});
