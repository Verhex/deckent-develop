/**
 * D4-3 (SURF-4) — the renderer's OWN typed daemon transport (approved
 * decision #2): plain fetch/EventSource against the daemon's tokened HTTP
 * API. IPC stays UI-grade; nothing here touches window.deckentDesktop.
 *
 * Two contracts, deliberately separate (approved decision #3):
 *  - RunFlow API  — /api/run-flow/* (list/get/preview/propose/decision/
 *    start/cancel) + per-flow SSE /:flowId/events (id: line carries the
 *    durable sequence; `?after=` / Last-Event-ID replay — SURF-2).
 *  - ApprovalBroker — /api/approvals* (poll-based; NO SSE endpoint exists).
 *
 * Auth: mutations/reads send `Authorization: Bearer <apiToken>`; EventSource
 * cannot set headers, so the SSE URL carries `?token=` (the server's
 * documented query-token fallback, allowlisted in SURF-2).
 *
 * Flag honesty: /api/run-flow/* answers 404 while the daemon's
 * `terminal.run_flow_v2` is off — surfaced as ApiError(status=404) so views
 * can show the real precondition instead of a generic failure.
 *
 * Framework-free + injectable (fetchFn/EventSourceImpl) → unit-testable from
 * the node-env desktop suite.
 */
import type { DaemonSession } from '../../shared/desktop-api.js';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface FlowSummary {
  flowId: string;
  state: string;
  intentSummary?: string;
  revision?: number;
}

export interface FlowListResponse {
  flows: FlowSummary[];
}

/** Loose-but-honest approval entry: the broker serializes maskedArgs-only
 *  records; the shell reads the identity/summary fields it renders. */
export interface ApprovalEntry {
  id: string;
  title?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface ApprovalsResponse {
  pending: ApprovalEntry[];
  approved: ApprovalEntry[];
  denied: ApprovalEntry[];
}

/** One durable RunFlow event as the SSE `data:` payload carries it. */
export interface RunFlowEventPayload {
  type: string;
  flowId: string;
  timestamp: string;
  sequence?: number;
  [key: string]: unknown;
}

export interface OpenEventsOptions {
  /** Durable replay cursor — becomes `?after=` (SURF-2). */
  afterSequence?: number;
  /** Injectable for tests; defaults to the platform EventSource. */
  EventSourceImpl?: typeof EventSource;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Build the SSE URL (exported pure — unit-pinned: token + after params). */
export function buildEventsUrl(session: DaemonSession, flowId: string, afterSequence?: number): string {
  const url = new URL(`/api/run-flow/${encodeURIComponent(flowId)}/events`, session.url);
  if (session.apiToken) url.searchParams.set('token', session.apiToken);
  if (afterSequence !== undefined) url.searchParams.set('after', String(afterSequence));
  return url.toString();
}

export interface DaemonApiClient {
  readonly session: DaemonSession;
  // ── RunFlow contract ──
  listFlows(): Promise<FlowListResponse>;
  getFlow(flowId: string): Promise<Record<string, unknown>>;
  getPreview(flowId: string): Promise<Record<string, unknown>>;
  propose(intentSummary: string): Promise<Record<string, unknown>>;
  decide(flowId: string, decision: 'approve' | 'reject', reason?: string): Promise<Record<string, unknown>>;
  start(flowId: string, revision: number, planDigest: string): Promise<Record<string, unknown>>;
  cancel(flowId: string, reason?: string): Promise<Record<string, unknown>>;
  /** Subscribe to a flow's durable event stream. Returns close(). */
  openEvents(flowId: string, onEvent: (event: RunFlowEventPayload) => void, opts?: OpenEventsOptions): () => void;
  // ── ApprovalBroker contract (separate, poll-based) ──
  getApprovals(): Promise<ApprovalsResponse>;
}

export function createApiClient(session: DaemonSession, fetchFn?: FetchLike): DaemonApiClient {
  const doFetch: FetchLike = fetchFn ?? ((input, init) => fetch(input, init));

  function headers(json: boolean): Record<string, string> {
    const h: Record<string, string> = {};
    if (session.apiToken) h['Authorization'] = `Bearer ${session.apiToken}`;
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const response = await doFetch(new URL(path, session.url).toString(), {
      method,
      headers: headers(body !== undefined),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      let detail = '';
      try {
        detail = (await response.text()).slice(0, 300);
      } catch {
        // body unavailable — status alone is the honest signal
      }
      throw new ApiError(response.status, `${method} ${path} → ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    return (await response.json()) as T;
  }

  return {
    session,

    listFlows: () => request<FlowListResponse>('GET', '/api/run-flow/list'),
    getFlow: (flowId) => request('GET', `/api/run-flow/${encodeURIComponent(flowId)}`),
    getPreview: (flowId) => request('GET', `/api/run-flow/${encodeURIComponent(flowId)}/preview`),
    propose: (intentSummary) => request('POST', '/api/run-flow/propose', { intentSummary }),
    decide: (flowId, decision, reason) =>
      request('POST', `/api/run-flow/${encodeURIComponent(flowId)}/decision`, {
        decision,
        ...(reason !== undefined ? { reason } : {}),
      }),
    start: (flowId, revision, planDigest) =>
      request('POST', `/api/run-flow/${encodeURIComponent(flowId)}/start`, { revision, planDigest }),
    cancel: (flowId, reason) =>
      request('POST', `/api/run-flow/${encodeURIComponent(flowId)}/cancel`, {
        ...(reason !== undefined ? { reason } : {}),
      }),

    openEvents: (flowId, onEvent, opts = {}) => {
      const Impl = opts.EventSourceImpl ?? EventSource;
      const source = new Impl(buildEventsUrl(session, flowId, opts.afterSequence));
      const handler = (raw: MessageEvent) => {
        try {
          onEvent(JSON.parse(String(raw.data)) as RunFlowEventPayload);
        } catch {
          // a torn frame is skipped, never fatal to the stream
        }
      };
      // The server names every frame with `event: <TYPE>` — the default
      // 'message' listener never fires for named events, so listen on the
      // known RunFlow event types explicitly (run-flow-contract.ts union).
      const RUN_FLOW_EVENT_TYPES = [
        'PROPOSAL_SUBMITTED', 'PREVIEW_STARTED', 'PREVIEW_READY',
        'APPROVAL_GRANTED', 'APPROVAL_REJECTED', 'START_REQUESTED',
        'RUN_STARTED', 'RUN_COMPLETED', 'RUN_FAILED', 'FLOW_ABORTED',
      ];
      for (const type of RUN_FLOW_EVENT_TYPES) source.addEventListener(type, handler);
      return () => {
        source.close();
      };
    },

    getApprovals: () => request<ApprovalsResponse>('GET', '/api/approvals'),
  };
}
