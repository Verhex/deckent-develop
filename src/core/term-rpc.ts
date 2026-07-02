// ─── Terminal RPC Core — RpcRequest / RpcResponse contract (TERM-RPC-CORE) ────
// Foundation contract module for Sıra-54 (REPL + dashboard + desktop + gateway
// share one session/action RPC protocol). This is slice-1: the versioned
// envelope, the v1 method catalog, and a transport-agnostic dispatcher skeleton
// with an injectable handler map. No wiring to any existing surface (api/, cli
// repl, mcp) happens here — that is slice-2. This module imports nothing but
// `zod` so it stays a clean, dependency-free foundation, mirroring
// approval-contract.ts.

import { z } from 'zod';

/** Contract version stamped on every RpcRequest/RpcResponse. Bump on a breaking shape change. */
export const TERM_RPC_VERSION = '1.0';

// ─── Envelope ─────────────────────────────────────────────────────────────────

export const rpcRequestSchema = z
  .object({
    id: z.string().min(1),
    // Deliberately a plain (non-literal) required string, NOT `z.literal(TERM_RPC_VERSION)`:
    // envelope shape validation must stay independent of protocol version negotiation, so a
    // request from a mismatched client is a well-formed RpcRequest that dispatchRpcRequest
    // rejects with a structured VERSION_MISMATCH error — not a schema-parse throw.
    version: z.string().min(1),
    method: z.string().min(1),
    params: z.unknown().optional(),
  })
  .strict();

/** The canonical RPC request type — inferred from {@link rpcRequestSchema}. */
export type RpcRequest = z.infer<typeof rpcRequestSchema>;

/** The 5 error codes a dispatch can produce. */
export const rpcErrorCodeSchema = z.enum([
  'VERSION_MISMATCH',
  'UNKNOWN_METHOD',
  'METHOD_NOT_IMPLEMENTED',
  'INVALID_PARAMS',
  'INTERNAL_ERROR',
]);
export type RpcErrorCode = z.infer<typeof rpcErrorCodeSchema>;
export const ALL_RPC_ERROR_CODES = rpcErrorCodeSchema.options;

export const rpcErrorSchema = z
  .object({
    code: rpcErrorCodeSchema,
    message: z.string().min(1),
    /** Optional structured detail (e.g. validation issues, known-method list). */
    data: z.unknown().optional(),
  })
  .strict();
export type RpcError = z.infer<typeof rpcErrorSchema>;

export const rpcResponseSchema = z
  .object({
    id: z.string().min(1),
    // Every response is authored by this module (see buildResponse), so version is
    // always stamped to TERM_RPC_VERSION exactly — a plain required string, same
    // reasoning as rpcRequestSchema.version (see comment there).
    version: z.string().min(1),
    result: z.unknown().optional(),
    error: rpcErrorSchema.optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const hasResult = val.result !== undefined;
    const hasError = val.error !== undefined;
    if (hasResult === hasError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'exactly one of result/error must be present, never both or neither',
      });
    }
  });

/** The canonical RPC response type — inferred from {@link rpcResponseSchema}. */
export type RpcResponse = z.infer<typeof rpcResponseSchema>;

// ─── Method catalog v1 ──────────────────────────────────────────────────────
// Slice-1 placeholder shapes: enough structure for contract-level round-trip
// and dispatch testing. Real business types are reconciled with existing
// modules (session-interface.ts, approval-contract.ts, run/sprint tracking)
// in slice-2 when handlers are actually wired to a surface.

const emptyParamsSchema = z.object({}).strict();

const sessionSummarySchema = z
  .object({
    sessionId: z.string().min(1),
    label: z.string().min(1),
    status: z.enum(['active', 'idle', 'detached', 'closed']),
    createdAt: z.string().datetime(),
    lastActivityAt: z.string().datetime(),
  })
  .strict();
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

const sessionListParamsSchema = emptyParamsSchema;
const sessionListResultSchema = z.object({ sessions: z.array(sessionSummarySchema) }).strict();

const sessionResumeParamsSchema = z.object({ sessionId: z.string().min(1) }).strict();
const sessionResumeResultSchema = z.object({ session: sessionSummarySchema }).strict();

const runStatusParamsSchema = z.object({ runId: z.string().min(1) }).strict();
const runStatusResultSchema = z
  .object({
    runId: z.string().min(1),
    state: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
    startedAt: z.string().datetime().nullable(),
    finishedAt: z.string().datetime().nullable(),
    exitCode: z.number().int().nullable(),
  })
  .strict();

const runStartDetachedParamsSchema = z
  .object({
    command: z.string().min(1),
    cwd: z.string().min(1).optional(),
    env: z.record(z.string(), z.string()).optional(),
  })
  .strict();
const runStartDetachedResultSchema = z.object({ runId: z.string().min(1) }).strict();

const approvalListParamsSchema = z.object({ scopeId: z.string().min(1).optional() }).strict();
/** Opaque — the full ApprovalRequest shape is owned by approval-contract.ts; no cross-import here. */
const approvalListResultSchema = z.object({ approvals: z.array(z.unknown()) }).strict();

const approvalDecideParamsSchema = z
  .object({
    requestId: z.string().min(1),
    decision: z.enum(['allow', 'deny', 'defer', 'escalate']),
    decidedBy: z.string().min(1),
    reason: z.string().optional(),
  })
  .strict();
const approvalDecideResultSchema = z.object({ ok: z.literal(true) }).strict();

const limitsGetParamsSchema = emptyParamsSchema;
const limitsGetResultSchema = z.object({ limits: z.record(z.string(), z.unknown()) }).strict();

/** The v1 method catalog — source of truth for the {@link TermRpcMethod} union. */
export const TERM_RPC_METHODS = [
  'session.list',
  'session.resume',
  'run.status',
  'run.start-detached',
  'approval.list',
  'approval.decide',
  'limits.get',
] as const;

export type TermRpcMethod = (typeof TERM_RPC_METHODS)[number];

interface MethodSchemaPair {
  params: z.ZodTypeAny;
  result: z.ZodTypeAny;
}

/**
 * `Record<TermRpcMethod, ...>` forces a compile error if a method is added to
 * (or removed from) {@link TERM_RPC_METHODS} without updating its schema pair.
 */
export const TERM_RPC_METHOD_SCHEMAS: Record<TermRpcMethod, MethodSchemaPair> = {
  'session.list': { params: sessionListParamsSchema, result: sessionListResultSchema },
  'session.resume': { params: sessionResumeParamsSchema, result: sessionResumeResultSchema },
  'run.status': { params: runStatusParamsSchema, result: runStatusResultSchema },
  'run.start-detached': { params: runStartDetachedParamsSchema, result: runStartDetachedResultSchema },
  'approval.list': { params: approvalListParamsSchema, result: approvalListResultSchema },
  'approval.decide': { params: approvalDecideParamsSchema, result: approvalDecideResultSchema },
  'limits.get': { params: limitsGetParamsSchema, result: limitsGetResultSchema },
};

/** TS-only per-method params/result type table, derived from the runtime schemas above. */
export interface TermRpcMethodTable {
  'session.list': { params: z.infer<typeof sessionListParamsSchema>; result: z.infer<typeof sessionListResultSchema> };
  'session.resume': { params: z.infer<typeof sessionResumeParamsSchema>; result: z.infer<typeof sessionResumeResultSchema> };
  'run.status': { params: z.infer<typeof runStatusParamsSchema>; result: z.infer<typeof runStatusResultSchema> };
  'run.start-detached': {
    params: z.infer<typeof runStartDetachedParamsSchema>;
    result: z.infer<typeof runStartDetachedResultSchema>;
  };
  'approval.list': { params: z.infer<typeof approvalListParamsSchema>; result: z.infer<typeof approvalListResultSchema> };
  'approval.decide': {
    params: z.infer<typeof approvalDecideParamsSchema>;
    result: z.infer<typeof approvalDecideResultSchema>;
  };
  'limits.get': { params: z.infer<typeof limitsGetParamsSchema>; result: z.infer<typeof limitsGetResultSchema> };
}

/** Type guard — true iff `value` is one of the {@link TERM_RPC_METHODS} v1 catalog entries. */
export function isTermRpcMethod(value: string): value is TermRpcMethod {
  return (TERM_RPC_METHODS as readonly string[]).includes(value);
}

// ─── Dispatcher skeleton (handler-map injectable) ────────────────────────────

type MaybePromise<T> = T | Promise<T>;

/** A single method's handler — typed by {@link TermRpcMethodTable} for that method. */
export type RpcHandler<M extends TermRpcMethod> = (
  params: TermRpcMethodTable[M]['params'],
) => MaybePromise<TermRpcMethodTable[M]['result']>;

/**
 * Injectable handler map. Slice-1 tests inject fakes; slice-2 wires real
 * handlers to existing surfaces (session manager, run tracker, ApprovalBroker,
 * limits/cost-gate). A method absent from the map yields `METHOD_NOT_IMPLEMENTED`,
 * not a throw — a partially-wired map is a valid, honest runtime state.
 */
export type RpcHandlerMap = { [M in TermRpcMethod]?: RpcHandler<M> };

function buildResponse(raw: unknown): RpcResponse {
  // Internal invariant check — every response this module returns must satisfy
  // rpcResponseSchema (exactly one of result/error). A failure here means a
  // programming error in this module, not a caller/transport error.
  return rpcResponseSchema.parse(raw);
}

function errorResponse(id: string, code: RpcErrorCode, message: string, data?: unknown): RpcResponse {
  return buildResponse({
    id,
    version: TERM_RPC_VERSION,
    error: data === undefined ? { code, message } : { code, message, data },
  });
}

function zodIssuesToStrings(issues: z.ZodIssue[]): string[] {
  return issues.map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`);
}

/**
 * Dispatch a validated {@link RpcRequest} against an injected {@link RpcHandlerMap}.
 * Transport-agnostic and pure aside from awaiting the handler: never throws —
 * every failure mode (bad version, unknown method, bad params, missing handler,
 * handler exception) becomes an `RpcResponse.error`.
 */
export async function dispatchRpcRequest(request: RpcRequest, handlers: RpcHandlerMap): Promise<RpcResponse> {
  if (request.version !== TERM_RPC_VERSION) {
    return errorResponse(
      request.id,
      'VERSION_MISMATCH',
      `unsupported RPC version "${request.version}" (expected "${TERM_RPC_VERSION}")`,
      { requestVersion: request.version, expectedVersion: TERM_RPC_VERSION },
    );
  }

  if (!isTermRpcMethod(request.method)) {
    return errorResponse(request.id, 'UNKNOWN_METHOD', `unknown RPC method "${request.method}"`, {
      method: request.method,
      knownMethods: TERM_RPC_METHODS,
    });
  }

  const method = request.method;
  const schemaPair = TERM_RPC_METHOD_SCHEMAS[method];
  const parsedParams = schemaPair.params.safeParse(request.params ?? {});
  if (!parsedParams.success) {
    return errorResponse(request.id, 'INVALID_PARAMS', `invalid params for method "${method}"`, {
      errors: zodIssuesToStrings(parsedParams.error.issues),
    });
  }

  const handler = handlers[method];
  if (!handler) {
    return errorResponse(request.id, 'METHOD_NOT_IMPLEMENTED', `no handler registered for method "${method}"`, {
      method,
    });
  }

  try {
    // TS cannot correlate a mapped handler-union against a runtime-narrowed
    // string key (known limitation for dynamic dispatch over a discriminated
    // union) — safe here because parsedParams.data was just validated against
    // this exact method's params schema immediately above.
    const result = await (handler as (params: unknown) => MaybePromise<unknown>)(parsedParams.data);
    return buildResponse({ id: request.id, version: TERM_RPC_VERSION, result });
  } catch (err: unknown) {
    return errorResponse(
      request.id,
      'INTERNAL_ERROR',
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ─── Serialize / parse (pure, transport-agnostic) ────────────────────────────

export interface RpcParseOk<T> {
  ok: true;
  value: T;
}
export interface RpcParseErr {
  ok: false;
  errors: string[];
}
export type RpcParseResult<T> = RpcParseOk<T> | RpcParseErr;

function parseJsonWithSchema<T>(raw: string, schema: z.ZodType<T>): RpcParseResult<T> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err: unknown) {
    return { ok: false, errors: [`invalid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, errors: zodIssuesToStrings(parsed.error.issues) };
}

/** Serialize an {@link RpcRequest} for any transport (WS/HTTP/stdio/IPC). Pure. */
export function serializeRpcRequest(request: RpcRequest): string {
  return JSON.stringify(request);
}

/** Parse+validate a raw RPC request string. Never throws. */
export function parseRpcRequest(raw: string): RpcParseResult<RpcRequest> {
  return parseJsonWithSchema(raw, rpcRequestSchema);
}

/** Serialize an {@link RpcResponse} for any transport (WS/HTTP/stdio/IPC). Pure. */
export function serializeRpcResponse(response: RpcResponse): string {
  return JSON.stringify(response);
}

/** Parse+validate a raw RPC response string. Never throws. */
export function parseRpcResponse(raw: string): RpcParseResult<RpcResponse> {
  return parseJsonWithSchema(raw, rpcResponseSchema);
}
