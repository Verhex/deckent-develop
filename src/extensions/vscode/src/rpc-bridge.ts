// ─── TERM-RPC HTTP Bridge (VS Code extension, dilim-1) ────────────────────────
// Sıra-64 / Task 363-012: the extension's read-only panel talks to the
// deckent API server's TERM-RPC wire (`POST /api/rpc`, src/api/server.ts) over
// real HTTP — this is the 3rd consumer of core/term-rpc.ts's dispatcher,
// after src/api/server.ts's own POST route and src/cli/repl/rpc-client.ts's
// in-process local transport.
//
// Read-only by design: only the 4 non-mutating TERM_RPC_METHODS are exposed
// (run.status, session.list, limits.get, approval.list). The 3 mutating
// methods (session.resume, run.start-detached, approval.decide) are
// deliberately absent from this bridge's public API — this dilim's panel
// only displays state, it never changes it.
//
// No `vscode` module import — fetch is injectable (production defaults to
// globalThis.fetch), matching the DI convention in
// core/catalog/openrouter-source.ts, so this compiles and unit-tests without
// a real VS Code host or a real network call.

import { randomUUID } from 'node:crypto';
import {
  TERM_RPC_VERSION,
  serializeRpcRequest,
  parseRpcResponse,
  type RpcRequest,
  type RpcError,
  type TermRpcMethodTable,
} from '../../../core/term-rpc.js';

// ─── Injectable fetch seam ─────────────────────────────────────────────────────

export type FetchFn = typeof globalThis.fetch;

// ─── Result / error shapes ─────────────────────────────────────────────────────

/**
 * `transport` — the request never produced a well-formed `RpcResponse`
 * envelope (network failure, non-2xx HTTP, or a 200 body that fails
 * `parseRpcResponse`). `rpc` — the server answered with a valid envelope
 * whose `error` field is set (the dispatcher's own error taxonomy in
 * core/term-rpc.ts: UNKNOWN_METHOD, INVALID_PARAMS, etc.).
 */
export type RpcBridgeError =
  | { kind: 'transport'; message: string; status?: number }
  | { kind: 'rpc'; error: RpcError };

export type RpcBridgeResult<T> = { ok: true; value: T } | { ok: false; error: RpcBridgeError };

export interface RpcBridgeOptions {
  /** Base URL of the deckent API server, e.g. "http://127.0.0.1:3100". */
  baseUrl?: string;
  /** Bearer token for `/api/*` auth. Omit when the server has auth disabled. */
  token?: string;
  /** Injectable fetch — production defaults to globalThis.fetch, tests inject a fake. */
  fetchFn?: FetchFn;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:3100';
const RPC_PATH = '/api/rpc';

// ─── RpcBridge ──────────────────────────────────────────────────────────────────

/**
 * Read-only HTTP client for TERM-RPC. Owns transport only — no business
 * logic, no caching, no retry policy (the panel layer decides refresh
 * cadence and how to render a failed section).
 */
export class RpcBridge {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly fetchFn: FetchFn;

  constructor(options: RpcBridgeOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.token = options.token;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  /** `run.status` — status of a single tracked run. */
  async getRunStatus(runId: string): Promise<RpcBridgeResult<TermRpcMethodTable['run.status']['result']>> {
    return this.call('run.status', { runId });
  }

  /** `session.list` — all known terminal sessions. */
  async listSessions(): Promise<RpcBridgeResult<TermRpcMethodTable['session.list']['result']>> {
    return this.call('session.list', {});
  }

  /** `limits.get` — current subscription/usage limits snapshot. */
  async getLimits(): Promise<RpcBridgeResult<TermRpcMethodTable['limits.get']['result']>> {
    return this.call('limits.get', {});
  }

  /** `approval.list` — pending/known approval requests, optionally scoped. */
  async listApprovals(scopeId?: string): Promise<RpcBridgeResult<TermRpcMethodTable['approval.list']['result']>> {
    return this.call('approval.list', scopeId === undefined ? {} : { scopeId });
  }

  private async call<M extends keyof TermRpcMethodTable>(
    method: M,
    params: TermRpcMethodTable[M]['params'],
  ): Promise<RpcBridgeResult<TermRpcMethodTable[M]['result']>> {
    const request: RpcRequest = { id: randomUUID(), version: TERM_RPC_VERSION, method, params };

    try {
      const res = await this.fetchFn(`${this.baseUrl}${RPC_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: serializeRpcRequest(request),
      });
      const bodyText = await res.text();

      if (!res.ok) {
        return {
          ok: false,
          error: { kind: 'transport', message: `HTTP ${res.status} ${res.statusText}`, status: res.status },
        };
      }

      const parsed = parseRpcResponse(bodyText);
      if (!parsed.ok) {
        return {
          ok: false,
          error: {
            kind: 'transport',
            message: `malformed RPC response: ${parsed.errors.join('; ')}`,
            status: res.status,
          },
        };
      }

      if (parsed.value.error) {
        return { ok: false, error: { kind: 'rpc', error: parsed.value.error } };
      }

      // Safe: rpcResponseSchema.superRefine enforces exactly one of
      // result/error, and `parsed.value.error` was just checked falsy above.
      return { ok: true, value: parsed.value.result as TermRpcMethodTable[M]['result'] };
    } catch (err: unknown) {
      return { ok: false, error: { kind: 'transport', message: err instanceof Error ? err.message : String(err) } };
    }
  }
}
