// ═══ repl/mcp-bridge — REPL ↔ external-MCP-client live wire (F9-001) ═════════
//
// Sprint 260 Task 260-015.
//
// THE GAP (F9-001): `buildMcpBridge` (src/cli/commands/chat-mcp-bridge.ts) and
// `McpClientBroker` (src/mcp-client/broker.ts) were both built in Sprint 229
// (AS-5·P1) but had **zero production callers** — the external-MCP-client was
// assembled and never connected to the live REPL. `buildMcpBridge` was only
// referenced by its 229-005 test; `McpClientBroker` was never instantiated
// outside its own definition.
//
// THIS MODULE is that wire. `initReplMcpBridge()` is the composition root that
// the REPL's tool-set build site calls to obtain a live MCP bridge: it
// constructs the broker + namespaced registry, composes them via
// `buildMcpBridge`, and returns the REPL-shaped surface (listSlashLines /
// listTools / dispatch / connectAndRefresh / loadAndConnectAll).
//
// GATING — opt-in, backward-safe:
//   * Gated behind a default-OFF `mcp_client_enabled` flag. Flag absent/false
//     → `initReplMcpBridge` returns `null` and the REPL behaves exactly as
//     before (no broker, no external surface).
//   * NO auto-connect: composing the bridge does not open any connection.
//     The caller decides when to `loadAndConnectAll()` / `connectAndRefresh()`.
//
// SCOPE — every dispatch still flows through `buildMcpBridge`'s inherited
// `classifyTool` + confirm-callback + event-stream audit path (229-005). The
// richer trust/approval gate is a separate follow-up (F9-003); this task only
// establishes the live wire. Single audit path: the broker is constructed
// WITHOUT an `onCall` hook because the bridge already mirrors every outcome to
// the event stream via `writeEvent` — wiring `onCall` too would double-log.

import { McpClientBroker } from '../../mcp-client/broker.js';
import { McpToolRegistry } from '../../mcp-client/registry.js';
import {
  buildMcpBridge,
  type BridgeBrokerLike,
} from '../commands/chat-mcp-bridge.js';

/** The live REPL-shaped MCP surface returned by `buildMcpBridge`. */
export type ReplMcpBridge = ReturnType<typeof buildMcpBridge>;

/**
 * Minimal config shape this wire reads. The full `DeckentConfig` does not
 * declare `mcp_client_enabled` yet (it is an opt-in flag whose type
 * declaration is the F9 follow-up); we read it structurally so the wire stays
 * decoupled and backward-safe regardless of where the config is loaded.
 */
export interface ReplMcpConfigLike {
  mcp_client_enabled?: boolean;
}

/** Optional test-injectable dependencies — mirrors the 229-005 fake-broker pattern. */
export interface ReplMcpBridgeDeps {
  /** Inject a duck-typed broker (tests) instead of the real `McpClientBroker`. */
  broker?: BridgeBrokerLike;
  /** Inject a pre-seeded registry (tests); defaults to a fresh `McpToolRegistry`. */
  registry?: McpToolRegistry;
}

export interface InitReplMcpBridgeOptions {
  /** Loaded project config — only `mcp_client_enabled` is consulted. */
  config: ReplMcpConfigLike | undefined;
  /** Project root for event-stream audit writes + `.mcp.json` server discovery. */
  projectRoot: string;
  /** Sprint id for audit; the bridge defaults to `'repl'` when absent. */
  sprintId?: string;
  /** Test-only dependency injection. */
  deps?: ReplMcpBridgeDeps;
}

/**
 * Whether the external-MCP-client wire is enabled. Default: OFF.
 * Only an explicit `true` opts in — `undefined`/`false`/any other value is off,
 * so existing REPL sessions are unaffected (backward-safe).
 */
export function isMcpClientEnabled(config: ReplMcpConfigLike | undefined): boolean {
  return config?.mcp_client_enabled === true;
}

/**
 * Build the live REPL MCP bridge when `mcp_client_enabled` is on, else `null`.
 *
 * Returning `null` (rather than an inert bridge) lets the caller cleanly skip
 * all external-MCP surfaces (the `/mcp` slash, tool listing, dispatch) when the
 * flag is off. When on, the returned bridge is composed but NOT connected —
 * `loadAndConnectAll()` is an explicit, separate step (no auto-connect).
 */
export function initReplMcpBridge(opts: InitReplMcpBridgeOptions): ReplMcpBridge | null {
  if (!isMcpClientEnabled(opts.config)) {
    return null;
  }

  const { projectRoot, sprintId } = opts;
  const registry = opts.deps?.registry ?? new McpToolRegistry();
  const broker: BridgeBrokerLike = opts.deps?.broker ?? new McpClientBroker();

  return buildMcpBridge({
    broker,
    registry,
    projectRoot,
    ...(sprintId !== undefined ? { sprintId } : {}),
  });
}
