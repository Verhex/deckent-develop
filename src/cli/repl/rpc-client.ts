// ═══ RPC-REPL-WIRE (362-009, dilim-2b-read) ═══════════════════════════════
//
// The REPL's in-process TERM-RPC "local transport" — the SECOND consumer of
// core/term-rpc.ts's dispatcher, alongside 362-008's HTTP consumer
// (src/api/server.ts POST /api/rpc). No fetch, no socket: createLocalRpcTransport
// calls dispatchRpcRequest() directly, in the same process, proving the same
// dispatcher genuinely serves two independent transports.
//
// buildReplRpcHandlers wires the v1 READ methods to whatever local data the
// REPL actually has. run.tsx cannot reach 362-008's PtySessionManager/
// ApprovalStore (both live under src/api/ — ADR-D-004 C3 forbids cli/
// importing api/), so this uses the REPL's own local equivalents instead:
// MemoryStore.listChatSessions (session.list) and ApprovalBroker.list
// (approval.list). The REPL has no run-tracking surface at all, so
// run.status is deliberately left unregistered -> dispatchRpcRequest's own
// METHOD_NOT_IMPLEMENTED path, which term-rpc.ts documents as "a valid,
// honest runtime state" for a partially-wired handler map — not a gap to
// paper over with a fabricated answer.

import { randomUUID } from 'node:crypto';
import {
  TERM_RPC_VERSION,
  TERM_RPC_METHODS,
  dispatchRpcRequest,
  isTermRpcMethod,
  serializeRpcRequest,
  parseRpcRequest,
  serializeRpcResponse,
  parseRpcResponse,
  type RpcHandlerMap,
  type RpcResponse,
} from '../../core/term-rpc.js';
import type { ChatSessionSummary } from '../../core/memory-types.js';
import type { SubscriptionLimitResult } from '../../core/limit-preflight.js';

// ─── Local transport ─────────────────────────────────────────────────────

export interface LocalRpcTransport {
  /**
   * Dispatches one RPC call in-process against the handlers this transport
   * was built with. Never throws — a malformed envelope (e.g. an empty
   * method string) surfaces as a wire-shaped `RpcResponse.error`, exactly
   * like the HTTP transport's failure modes.
   */
  call(method: string, params?: unknown, id?: string): Promise<RpcResponse>;
}

/**
 * Builds the REPL's in-process TERM-RPC transport over an injected
 * {@link RpcHandlerMap}. Every call is round-tripped through
 * serializeRpcRequest -> parseRpcRequest and the response through
 * serializeRpcResponse -> parseRpcResponse before returning — there is no
 * real socket involved, but the SAME wire contract the HTTP transport uses
 * is exercised end-to-end, which is the whole point of a second consumer
 * (proves the contract is genuinely shared, not HTTP-shaped by accident).
 */
export function createLocalRpcTransport(handlers: RpcHandlerMap): LocalRpcTransport {
  return {
    async call(method, params, id = randomUUID()) {
      const wireRequest = JSON.stringify({
        id,
        version: TERM_RPC_VERSION,
        method,
        ...(params !== undefined ? { params } : {}),
      });
      const parsedRequest = parseRpcRequest(wireRequest);
      if (!parsedRequest.ok) {
        return {
          id,
          version: TERM_RPC_VERSION,
          error: { code: 'INVALID_PARAMS', message: `malformed request: ${parsedRequest.errors.join('; ')}` },
        };
      }
      // Round-trip the validated request too, so both directions of the wire
      // contract are exercised, not just the response.
      const wireRequestRoundtrip = serializeRpcRequest(parsedRequest.value);
      const reparsedRequest = parseRpcRequest(wireRequestRoundtrip);
      const request = reparsedRequest.ok ? reparsedRequest.value : parsedRequest.value;

      const response = await dispatchRpcRequest(request, handlers);
      const wireResponse = serializeRpcResponse(response);
      const parsedResponse = parseRpcResponse(wireResponse);
      return parsedResponse.ok ? parsedResponse.value : response;
    },
  };
}

// ─── REPL-side read-method wiring ──────────────────────────────────────────

export interface ReplRpcHandlerDeps {
  /** MemoryStore.listChatSessions — omitted when the REPL has no memory.db
   *  attached (session.list is then left unregistered, not fabricated). */
  listChatSessions?: (limit?: number) => ChatSessionSummary[];
  /** The currently-attached chat session id, if any — marks that one row
   *  'active' in session.list; every other listed session is 'idle' (the
   *  REPL only ever has ONE session attached at a time, so 'detached'/
   *  'closed' don't apply here). */
  currentSessionId?: string;
  /** ApprovalBroker.list — present only when repl_surface.approvals is on
   *  (the same gate that constructs the broker in run.tsx). */
  listApprovals?: (status: 'pending' | 'decided' | 'all') => Array<{ scopeId: string }>;
  /** core/limit-preflight.ts probeSubscriptionLimits — injected so callers
   *  (and tests) control whether a real `claude` binary is spawned. */
  probeLimits?: () => Promise<SubscriptionLimitResult>;
}

/** session.list mapping — ChatSessionSummary has no separate createdAt, only
 *  a last-activity timestamp, so `createdAt` honestly mirrors
 *  `lastActivityAt` rather than fabricating a distinct value (same honesty
 *  call server.ts's own session.list mapping makes, mirrored the other way
 *  round since PtySessionManager's SessionMeta has createdAt but no
 *  last-activity field). */
function chatSessionToRpcSummary(
  summary: ChatSessionSummary,
  currentSessionId: string | undefined,
): {
  sessionId: string;
  label: string;
  status: 'active' | 'idle' | 'detached' | 'closed';
  createdAt: string;
  lastActivityAt: string;
} {
  return {
    sessionId: summary.sessionId,
    label: summary.preview,
    status: summary.sessionId === currentSessionId ? 'active' : 'idle',
    createdAt: summary.lastAt,
    lastActivityAt: summary.lastAt,
  };
}

/**
 * Builds the REPL's real TERM-RPC read-method handler map from whatever of
 * `deps` is supplied. Each dependency is independently optional — a missing
 * dep means that method is simply absent from the returned map (fail-soft,
 * matches the existing surface-wire pattern: a degraded REPL stays usable,
 * never fabricates data it doesn't have). `run.status` has no dep in this
 * slice (see module doc) and is therefore NEVER present in the returned map.
 */
export function buildReplRpcHandlers(deps: ReplRpcHandlerDeps): RpcHandlerMap {
  const handlers: RpcHandlerMap = {};

  if (deps.listChatSessions) {
    const listChatSessions = deps.listChatSessions;
    const currentSessionId = deps.currentSessionId;
    handlers['session.list'] = () => ({
      sessions: listChatSessions(50).map((s) => chatSessionToRpcSummary(s, currentSessionId)),
    });
  }

  if (deps.listApprovals) {
    const listApprovals = deps.listApprovals;
    handlers['approval.list'] = (params) => {
      const all = listApprovals('pending');
      const approvals = params.scopeId ? all.filter((a) => a.scopeId === params.scopeId) : all;
      return { approvals };
    };
  }

  if (deps.probeLimits) {
    const probeLimits = deps.probeLimits;
    handlers['limits.get'] = async () => {
      const probe = await probeLimits();
      if (probe.unavailable) {
        return { limits: { unavailable: true, reason: probe.reason } };
      }
      return {
        limits: {
          unavailable: false,
          sessionPct: probe.sessionPct,
          sessionResetAt: probe.sessionResetAt,
          weekAllPct: probe.weekAllPct,
          weekAllResetAt: probe.weekAllResetAt,
          ...(probe.weekFablePct !== undefined ? { weekFablePct: probe.weekFablePct } : {}),
        },
      };
    };
  }

  return handlers;
}

// ─── `/rpc` debug command (pure parse + execute) ───────────────────────────

export interface RpcDebugCommand {
  method: string;
  params?: unknown;
}

export interface RpcDebugParseError {
  error: string;
}

/**
 * Parses a raw line into an `/rpc <method> [json-params]` debug invocation.
 * Returns `null` when the line is not an `/rpc` command at all (so a future
 * caller can fall through to normal chat handling) — never throws.
 */
export function parseRpcDebugCommand(line: string): RpcDebugCommand | RpcDebugParseError | null {
  const trimmed = line.trim();
  if (trimmed !== '/rpc' && !trimmed.startsWith('/rpc ')) return null;
  const rest = trimmed.slice('/rpc'.length).trim();
  if (rest.length === 0) return { error: 'usage: /rpc <method> [json-params]' };
  const spaceIdx = rest.indexOf(' ');
  const method = spaceIdx === -1 ? rest : rest.slice(0, spaceIdx);
  const paramsRaw = spaceIdx === -1 ? '' : rest.slice(spaceIdx + 1).trim();
  if (paramsRaw.length === 0) return { method };
  try {
    return { method, params: JSON.parse(paramsRaw) as unknown };
  } catch (err: unknown) {
    return { error: `invalid JSON params: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Runs a parsed `/rpc` debug command against a {@link LocalRpcTransport} and
 * formats the result as REPL-printable text. Returns `null` only when `line`
 * is not an `/rpc` command at all — every actual invocation (including a
 * malformed one) resolves to some string, never throws.
 */
export async function runRpcDebugCommand(transport: LocalRpcTransport, line: string): Promise<string | null> {
  const parsed = parseRpcDebugCommand(line);
  if (parsed === null) return null;
  if ('error' in parsed) return `[rpc] ${parsed.error}`;
  if (!isTermRpcMethod(parsed.method)) {
    return `[rpc] unknown method "${parsed.method}" — known: ${TERM_RPC_METHODS.join(', ')}`;
  }
  const response = await transport.call(parsed.method, parsed.params);
  return JSON.stringify(response, null, 2);
}
