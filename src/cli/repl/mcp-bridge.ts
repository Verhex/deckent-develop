// ═══ repl/mcp-bridge — REPL ↔ external-MCP-client dispatch core (F9-001) ═════
//
// Sprint 260 Task 260-015. Revisited 387-013 (MCP-CLIENT-GATE) — see below.
//
// THE GAP (F9-001): `buildMcpBridge` (src/cli/commands/chat-mcp-bridge.ts) and
// `McpClientBroker` (src/mcp-client/broker.ts) were both built in Sprint 229
// (AS-5·P1) but had **zero production callers** — the external-MCP-client was
// assembled and never connected to the live REPL. `buildMcpBridge` was only
// referenced by its 229-005 test; `McpClientBroker` was never instantiated
// outside its own definition.
//
// `dispatchMcpSlash` / `parseMcpCallArgs` (below) ARE that wire for the legacy
// loop: `chat-native.ts` builds a bridge inline (gated on MCP-server presence,
// not on `mcp_client_enabled`) and calls `dispatchMcpSlash` for every `/mcp`
// line — this dispatch core has a real production caller.
//
// `planMcpConnect()` IS now the live gate (387-013 recorded `isMcpClientEnabled`
// as unwired dead code; wired for real 2026-07-15, REPL-575 K1 — the review
// finding was "unconditional MCP auto-connect"). The gate is a SMART-SPLIT
// (K1-C, Alperen-chosen): the operator's OWN scopes (user `~/.deckent/mcp.json`
// + gitignored `.mcp.local.json`) always connect; a git-tracked project
// `.mcp.json` (travels with a cloned repo) is opt-in behind `mcp_client_enabled`.
// Both production entry points consult it:
//   * `run.tsx` (native-agent default path, ADR-G-034/376-003) calls
//     `planMcpConnect(cwd, isMcpClientEnabled(cfg))` before building the bridge;
//     `notice` prints the honest `chat.mcp_client_disabled` hint when a project
//     `.mcp.json` was skipped.
//   * `chat-native.ts` (legacy loop) uses the same plan before building the
//     `/mcp` bridge; a skipped project scope answers `/mcp` with that notice.
// `mcp_client_enabled` is declared in `DeckentConfig` + `ResolvedConfig`
// (core/config-types.ts) and passed through both resolved-literals in
// core/config.ts (born-464 flag-drop pattern honored).
// `initReplMcpBridge()` (the composition root below) remains caller-less —
// run.tsx keeps its inline construction because it must retain the broker
// reference for disposal; `planMcpConnect`/`isMcpClientEnabled` are the shared
// gate. `tests/cli/mcp-client-gate.test.ts` pins the WIRED state.
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
  type McpConfirmFn,
} from '../commands/chat-mcp-bridge.js';
import { loadMcpServers } from '../../mcp-client/config.js';
import { getMessage } from '../helpers/messages.js';

/** The live REPL-shaped MCP surface returned by `buildMcpBridge`. */
export type ReplMcpBridge = ReturnType<typeof buildMcpBridge>;

/**
 * Minimal config shape `initReplMcpBridge`/`isMcpClientEnabled` read.
 * `mcp_client_enabled` is declared on `DeckentConfig`/`ResolvedConfig`
 * (core/config-types.ts, wired 2026-07-15 REPL-575 K1); this stays structural
 * so the gate keeps working for any caller that hands it a partial config.
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
 * Truth-table for the `mcp_client_enabled` flag: only an explicit `true` opts
 * in — `undefined`/`false`/any other value is off. LIVE gate since 2026-07-15
 * (REPL-575 K1): consulted by `run.tsx` (native boot) and `chat-native.ts`
 * (legacy `/mcp`) — see module header.
 */
export function isMcpClientEnabled(config: ReplMcpConfigLike | undefined): boolean {
  return config?.mcp_client_enabled === true;
}

/** The MCP connect decision under the smart-split gate. */
export interface McpConnectPlan {
  /** Build the bridge and connect servers this launch. */
  connect: boolean;
  /** Pass to `buildMcpBridge` — include the git-tracked project `.mcp.json`. */
  includeProjectScope: boolean;
  /** Show the honest disabled-notice: git-tracked project servers exist but the
   *  flag is off, so they were skipped (the operator can opt in). */
  notice: boolean;
}

/**
 * Decide the MCP connect plan under the smart-split gate (REPL-575 K1-C).
 *
 * The operator's OWN scopes — user `~/.deckent/mcp.json` (global, you placed it)
 * and gitignored personal `.mcp.local.json` — are trusted and ALWAYS connect.
 * A git-tracked project `.mcp.json` travels with the repo (a clone you may not
 * have authored) and connects only when `mcp_client_enabled` is explicitly true.
 * When such project-scoped servers are skipped, `notice` is set so the REPL says
 * so honestly instead of silently dropping them.
 */
export function planMcpConnect(root: string, clientEnabled: boolean): McpConnectPlan {
  const trustedKeys = new Set(Object.keys(loadMcpServers(root, { includeProjectScope: false })));
  const allKeys = Object.keys(loadMcpServers(root));
  const hasTrusted = trustedKeys.size > 0;
  // A server reachable ONLY with the project scope (not shadowed by a trusted one).
  const hasProjectOnly = allKeys.some((k) => !trustedKeys.has(k));
  return {
    connect: hasTrusted || (clientEnabled && hasProjectOnly),
    includeProjectScope: clientEnabled,
    notice: hasProjectOnly && !clientEnabled,
  };
}

/**
 * Build a REPL MCP bridge gated on `mcp_client_enabled`, else `null`. This
 * composition root itself still has no production caller (`run.tsx` /
 * `chat-native.ts` build their bridges inline — run.tsx must keep the broker
 * reference for disposal) — but both consult `isMcpClientEnabled` above, so
 * the FLAG is live even though this convenience wrapper is not (REPL-575 K1).
 *
 * Returning `null` (rather than an inert bridge) lets a caller cleanly skip
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

// ─── `/mcp` slash dispatch (Sprint 280 Task 280-004 — G1 live wire) ──────────
//
// The REPL `/mcp [list|call <tool> [args]]` handler. Given a LIVE bridge
// (composed via `buildMcpBridge`), `list` connects the configured servers and
// renders the namespaced tool catalogue; `call` dispatches one tool through the
// bridge's confirm-gate + audit path. This is the pure dispatch core — the
// chat-native loop owns server-discovery + bridge construction and only calls
// in once it has a bridge. NEVER throws: every broker/connect failure is caught
// and surfaced as a `[mcp-error] …` string so the REPL stays alive (fail-safe).

/**
 * Parse the trailing words of `/mcp call <tool> [args…]` into a tool-arg
 * object. Accepts either one JSON object (`{"x":1}`) or a sequence of
 * `key=value` tokens. Anything unparseable degrades to `{}` (never throws).
 */
export function parseMcpCallArgs(parts: readonly string[]): Record<string, unknown> {
  if (parts.length === 0) return {};
  const joined = parts.join(' ').trim();
  if (joined.startsWith('{')) {
    try {
      const parsed = JSON.parse(joined) as unknown;
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Not valid JSON — fall through to key=value parsing.
    }
  }
  const out: Record<string, unknown> = {};
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq > 0) out[p.slice(0, eq)] = p.slice(eq + 1);
  }
  return out;
}

export interface DispatchMcpSlashOptions {
  /** Words AFTER `/mcp` — e.g. `['list']` or `['call','srv__tool','{...}']`. */
  args: readonly string[];
  /** A live bridge (`buildMcpBridge` return) — list/connect/dispatch surface. */
  bridge: ReplMcpBridge;
  /** UI language for the localized usage/unknown-subaction notices. */
  lang: string;
  /**
   * Confirm gate for `call` (external MCP tool = arbitrary side-effect). The
   * bridge invokes it before `callTool`. Defaults to auto-approve — an explicit
   * `/mcp call` is itself the user's consent; the REPL entry point may inject a
   * stricter prompt. Tests inject a rejecting stub to exercise the cancel path.
   */
  confirm?: McpConfirmFn;
}

/**
 * Handle a `/mcp [list|call <tool> [args]]` REPL line against a live bridge.
 *
 * Localized notices route through `getMessage` with EXISTING message keys
 * (`chat.slash_unknown_subaction`) so no hardcoded user-facing strings are
 * introduced (i18n-first). Dynamic output (tool catalogue, call results) comes
 * straight from the broker and is server-derived data, not localizable text.
 *
 * Fail-safe contract: this function NEVER throws. `loadAndConnectAll` already
 * skips misbehaving servers internally and `bridge.dispatch` encodes errors in
 * its result shape; the outer try/catch is a final backstop for an unexpected
 * throw so the REPL session is never torn down by a `/mcp` line.
 */
export async function dispatchMcpSlash(opts: DispatchMcpSlashOptions): Promise<string> {
  const { bridge, lang } = opts;
  const sub = (opts.args[0] ?? 'list').toLowerCase();
  try {
    if (sub === 'list') {
      await bridge.loadAndConnectAll();
      return bridge.listSlashLines().join('\n');
    }
    if (sub === 'call') {
      const tool = opts.args[1];
      if (!tool) {
        return getMessage('chat.slash_unknown_subaction', lang, {
          command: '/mcp call',
          sub: '',
        });
      }
      // Connect + register first so the namespaced name resolves before dispatch.
      await bridge.loadAndConnectAll();
      const callArgs = parseMcpCallArgs(opts.args.slice(2));
      const confirmFn: McpConfirmFn = opts.confirm ?? (async (): Promise<boolean> => true);
      const result = await bridge.dispatch(tool, callArgs, confirmFn);
      return result.output;
    }
    return getMessage('chat.slash_unknown_subaction', lang, { command: '/mcp', sub });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `[mcp-error] ${msg}`;
  }
}
