// ═══ chat-mcp-bridge — REPL ↔ outgoing MCP-client composition ════════════════
//
// Sprint 229 Task 229-005 (AS-5·P1).
//
// This module is the CALLER that wires three already-existing pieces together
// so the REPL can talk to harici (external) MCP servers via the broker built
// in Task 229-001:
//
//   1) `McpClientBroker`   — JSON-RPC over stdio/HTTP (src/mcp-client/broker.ts)
//   2) `McpToolRegistry`   — `<server>__<tool>` namespacing (src/mcp-client/registry.ts)
//   3) `classifyTool`      — REPL confirm-gate tiers (src/cli/repl/tool-permissions.ts)
//   4) `writeEvent`        — sprint event-stream audit sink (src/orchestra/event-stream.ts)
//
// External MCP calls are arbitrary-side-effect (DIRECTIVES Sprint 229 §4C
// omurga). Every dispatch goes through `classifyTool` + a confirm callback +
// `writeEvent`. The broker also has its own `onCall` audit hook (Task 229-001);
// `createMcpAuditSink` here builds that hook so the broker construction site
// can wire it in — keeping the dependency direction one-way (broker does NOT
// import event-stream, ADR-008).

import type {
  McpServerDef,
  McpToolCallRecord,
  McpToolDescriptor,
} from '../../mcp-client/types.js';
import {
  McpToolRegistry,
  type NamespacedTool,
} from '../../mcp-client/registry.js';
import { loadMcpServers } from '../../mcp-client/config.js';
import { classifyTool, classifyExternalTool, type ToolPermission } from '../repl/tool-permissions.js';
import { writeEvent } from '../../orchestra/event-stream.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Duck-typed broker shape — the production class `McpClientBroker` (229-001)
 * already satisfies it. Lets tests pass a tiny fake without rebuilding the
 * SDK transport stack.
 */
export interface BridgeBrokerLike {
  connect(name: string, def: McpServerDef): Promise<void>;
  listTools(name: string): Promise<McpToolDescriptor[]>;
  callTool(
    name: string,
    tool: string,
    args?: Record<string, unknown>,
  ): Promise<unknown>;
  isConnected(name: string): boolean;
  list(): string[];
}

/** Shape passed to the REPL confirm callback when a dispatch needs approval. */
export interface McpConfirmAction {
  /** Namespaced tool name (e.g. `everything__echo`). */
  name: string;
  /** Resolved server. */
  server: string;
  /** Resolved tool. */
  tool: string;
  /** Permission tier from `classifyTool` (always 'confirm' or stricter for MCP). */
  tier: ToolPermission;
  args: Record<string, unknown>;
  description: string;
}

/** Async confirm callback — true approves, false rejects. */
export type McpConfirmFn = (action: McpConfirmAction) => Promise<boolean>;

/** Result of `dispatch()`. Never throws — error info is encoded in the shape. */
export interface McpDispatchResult {
  ok: boolean;
  /** Raw stringified tool output, error tag, or cancellation notice. */
  output: string;
  /** True if the user rejected the confirm prompt. */
  cancelled?: boolean;
  /** Tier the classifier returned (for caller logging). */
  tier?: ToolPermission;
}

export interface McpBridgeOptions {
  broker: BridgeBrokerLike;
  registry: McpToolRegistry;
  /** Project root for event-stream audit writes. */
  projectRoot: string;
  /** Sprint id for audit; defaults to `'repl'` when no sprint is active. */
  sprintId?: string;
  /**
   * Override the audit sink (tests). Defaults to one that calls `writeEvent`
   * directly. Always invoked — both broker.onCall success/error records AND
   * the bridge's own cancellation records flow through it.
   */
  audit?: (record: McpAuditRecord) => void;
}

/**
 * Wider audit record than `McpToolCallRecord` — adds `'cancelled'` and
 * `'unknown-tool'` outcomes that originate INSIDE the bridge (the broker only
 * emits on actual `callTool` invocations).
 */
export interface McpAuditRecord extends Omit<McpToolCallRecord, 'outcome'> {
  outcome: 'ok' | 'error' | 'cancelled' | 'unknown-tool';
  namespacedName?: string;
}

// ─── Audit sink — feeds the broker's `onCall` hook into event-stream ────────

/** Channel codes emitted to the sprint event stream. */
export const MCP_AUDIT_CHANNEL = 'DECKENT→USER:MCP_TOOL_CALL';

/**
 * Build a closure that mirrors a `McpToolCallRecord` into the sprint event
 * stream via `writeEvent`. Intended for a broker constructed standalone
 * (without `buildMcpBridge`) that still needs an audit trail — pass the
 * return value as `new McpClientBroker({ onCall: createMcpAuditSink(root) })`.
 *
 * Do NOT wire this onto a broker that is also passed into `buildMcpBridge`
 * with its default (non-overridden) `audit` sink — `dispatch()` already
 * mirrors every `broker.callTool()` outcome to the event stream itself, so
 * pairing both double-logs every call. Single audit path per broker instance.
 *
 * For the REPL (no active sprint) the channel still writes under a synthetic
 * sprint id (default `'repl'`) so a session always has a tracable JSONL log
 * under `.deckent/<sprintId>-events.jsonl`.
 */
export function createMcpAuditSink(
  projectRoot: string,
  sprintId?: string,
): (record: McpToolCallRecord) => void {
  const sid = sprintId ?? 'repl';
  return (record) => {
    writeEvent(projectRoot, sid, 'deckent', 'user', MCP_AUDIT_CHANNEL, record);
  };
}

// ─── Listing helpers ─────────────────────────────────────────────────────────

/**
 * Render the namespaced tool list as human-readable lines for the `/mcp`
 * slash command. One entry per tool, formatted `server__tool — description`.
 * When `servers` is empty the first line names that fact explicitly so the
 * REPL doesn't show a blank block.
 */
export function renderMcpSlashLines(registry: McpToolRegistry): string[] {
  const tools = registry.list();
  if (tools.length === 0) {
    return ['MCP server yok'];
  }
  return tools.map((t) => formatTool(t));
}

function formatTool(t: NamespacedTool): string {
  const desc = t.descriptor.description ? ` — ${t.descriptor.description}` : '';
  return `${t.namespacedName}${desc}`;
}

// ─── Result serialization ────────────────────────────────────────────────────

/**
 * Safely convert a tool result to its wire string. A non-JSON-serializable
 * result (e.g. a BigInt or circular field) must NOT throw here — a throw
 * inside `dispatch()`'s success path would land in the surrounding catch and
 * double-audit an already-succeeded call as an error (born-553). Instead this
 * returns a visible `[mcp-warn]` marker so the caller sees the call succeeded
 * but its result could not be serialized, rather than a misleading generic
 * `[mcp-error]`.
 */
function serializeToolResult(namespacedName: string, result: unknown): string {
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `[mcp-warn] ${namespacedName}: result not serializable, dropped — ${msg}`;
  }
}

// ─── Namespaced registration helper ─────────────────────────────────────────

/**
 * Register tools from a single server into the registry under namespaced keys
 * (`<server>__<tool>`) and return the resulting entries. Called on every
 * connect and reconnect so the registry always reflects current server state.
 */
function registerNamespaced(
  reg: McpToolRegistry,
  server: string,
  tools: McpToolDescriptor[],
): NamespacedTool[] {
  reg.register(server, tools);
  return reg.listForServer(server);
}

// ─── Bridge factory ──────────────────────────────────────────────────────────

const MCP_NS_SEP = '__';

/**
 * Compose broker + registry + classifyTool + writeEvent into one REPL-shaped
 * surface. The returned object is intentionally tiny — connecting/refreshing
 * is split from dispatch so a single round of `loadAndConnectAll()` at REPL
 * startup populates the registry, then `/mcp` listing and dispatch are O(1).
 */
export function buildMcpBridge(opts: McpBridgeOptions): {
  listSlashLines(): string[];
  listTools(): NamespacedTool[];
  dispatch(
    namespacedName: string,
    args: Record<string, unknown>,
    confirmFn: McpConfirmFn,
  ): Promise<McpDispatchResult>;
  connectAndRefresh(name: string, def: McpServerDef): Promise<NamespacedTool[]>;
  loadAndConnectAll(): Promise<string[]>;
} {
  const { broker, registry, projectRoot, sprintId } = opts;
  const audit =
    opts.audit ??
    ((record: McpAuditRecord): void => {
      writeEvent(
        projectRoot,
        sprintId ?? 'repl',
        'deckent',
        'user',
        MCP_AUDIT_CHANNEL,
        record,
      );
    });

  return {
    listSlashLines(): string[] {
      return renderMcpSlashLines(registry);
    },

    listTools(): NamespacedTool[] {
      return registry.list();
    },

    async connectAndRefresh(
      name: string,
      def: McpServerDef,
    ): Promise<NamespacedTool[]> {
      if (!broker.isConnected(name)) {
        await broker.connect(name, def);
      }
      const tools = await broker.listTools(name);
      return registerNamespaced(registry, name, tools);
    },

    async loadAndConnectAll(): Promise<string[]> {
      const servers = loadMcpServers(projectRoot);
      const connected: string[] = [];
      for (const [name, def] of Object.entries(servers)) {
        try {
          if (!broker.isConnected(name)) {
            await broker.connect(name, def);
          }
          const tools = await broker.listTools(name);
          registerNamespaced(registry, name, tools);
          connected.push(name);
        } catch {
          // Skip a misbehaving server — the REPL stays usable.
        }
      }
      return connected;
    },

    async dispatch(
      namespacedName: string,
      args: Record<string, unknown>,
      confirmFn: McpConfirmFn,
    ): Promise<McpDispatchResult> {
      const resolved = registry.resolve(namespacedName);
      if (!resolved) {
        const startedAt = new Date().toISOString();
        audit({
          server: namespacedName.split(MCP_NS_SEP)[0] ?? '',
          tool: '',
          args,
          startedAt,
          durationMs: 0,
          outcome: 'unknown-tool',
          namespacedName,
        });
        return {
          ok: false,
          output: `[mcp-error] unknown tool: ${namespacedName}`,
        };
      }

      // Permission tier — classifyTool is consulted to catch any accidental
      // collision between a namespaced external name and an 'always'-tier
      // deckent tool; external tools are NEVER 'always' (no permanent
      // auto-approve). Read-only external tools (name-prefix heuristic via
      // classifyExternalTool) auto-approve without a confirm prompt; all
      // other external tools require confirmation.
      const deckentTier = classifyTool(namespacedName, args);
      const tier: ToolPermission =
        deckentTier === 'always' ? 'confirm' : classifyExternalTool(resolved.tool);

      // Read-only external tools — skip confirm prompt, dispatch directly.
      if (tier === 'read') {
        const startedAt = new Date().toISOString();
        const t0 = Date.now();
        try {
          const result = await broker.callTool(resolved.server, resolved.tool, args);
          const output = serializeToolResult(namespacedName, result);
          audit({
            server: resolved.server,
            tool: resolved.tool,
            args,
            startedAt,
            durationMs: Date.now() - t0,
            outcome: 'ok',
            namespacedName,
          });
          return {
            ok: true,
            output,
            tier,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          audit({
            server: resolved.server,
            tool: resolved.tool,
            args,
            startedAt,
            durationMs: Date.now() - t0,
            outcome: 'error',
            error: msg,
            namespacedName,
          });
          return {
            ok: false,
            output: `[mcp-error] ${namespacedName}: ${msg}`,
            tier,
          };
        }
      }

      // Non-read-only (confirm tier) — ask user before dispatching.
      const action: McpConfirmAction = {
        name: namespacedName,
        server: resolved.server,
        tool: resolved.tool,
        tier,
        args,
        description: `mcp → ${resolved.server} :: ${resolved.tool}`,
      };

      const approved = await confirmFn(action);
      const startedAt = new Date().toISOString();
      if (!approved) {
        audit({
          server: resolved.server,
          tool: resolved.tool,
          args,
          startedAt,
          durationMs: 0,
          outcome: 'cancelled',
          namespacedName,
        });
        return {
          ok: false,
          cancelled: true,
          output: `[mcp] cancelled: ${namespacedName}`,
          tier,
        };
      }

      const t0 = Date.now();
      try {
        const result = await broker.callTool(resolved.server, resolved.tool, args);
        const output = serializeToolResult(namespacedName, result);
        audit({
          server: resolved.server,
          tool: resolved.tool,
          args,
          startedAt,
          durationMs: Date.now() - t0,
          outcome: 'ok',
          namespacedName,
        });
        return {
          ok: true,
          output,
          tier,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        audit({
          server: resolved.server,
          tool: resolved.tool,
          args,
          startedAt,
          durationMs: Date.now() - t0,
          outcome: 'error',
          error: msg,
          namespacedName,
        });
        return {
          ok: false,
          output: `[mcp-error] ${namespacedName}: ${msg}`,
          tier,
        };
      }
    },
  };
}
