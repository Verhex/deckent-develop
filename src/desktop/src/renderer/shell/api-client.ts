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

/**
 * SURF-kuyruk-E fix: the server serializes each approval as
 * `{category, request: {id, summary, createdAt, …}, decision}` (NESTED) while
 * the shell renders flat `{id, title}` — with an always-empty pending list
 * this mismatch stayed invisible until the first REAL pending request hit the
 * view (the deferred decide-UI smoke caught it live). Normalize at the client
 * boundary; tolerant of an already-flat shape so the contract can converge.
 * Exported pure — pinned by shell-transport.test.ts.
 */
export function normalizeApprovalEntry(raw: unknown): ApprovalEntry {
  const outer = (raw ?? {}) as Record<string, unknown>;
  const req = (outer['request'] ?? {}) as Record<string, unknown>;
  const id = typeof req['id'] === 'string' ? req['id'] : typeof outer['id'] === 'string' ? outer['id'] : '';
  const title = typeof req['summary'] === 'string' ? req['summary']
    : typeof outer['title'] === 'string' ? outer['title'] : undefined;
  const createdAt = typeof req['createdAt'] === 'string' ? req['createdAt']
    : typeof outer['createdAt'] === 'string' ? outer['createdAt'] : undefined;
  return {
    ...outer,
    id,
    ...(title !== undefined ? { title } : {}),
    ...(createdAt !== undefined ? { createdAt } : {}),
  };
}

function normalizeApprovalsResponse(raw: unknown): ApprovalsResponse {
  const body = (raw ?? {}) as Record<string, unknown>;
  const list = (key: string): ApprovalEntry[] =>
    Array.isArray(body[key]) ? (body[key] as unknown[]).map(normalizeApprovalEntry) : [];
  return { pending: list('pending'), approved: list('approved'), denied: list('denied') };
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

/** 588/F1 «Köprü» — /api/sprint/* payload shapes (sprint-live-service). */
export interface SprintLiveWorkerPayload {
  taskId: string;
  title: string;
  status: string;
  agent?: string;
  model?: string;
  filesWrite: string[];
  hb?: {
    status: string;
    currentAction?: string;
    currentFile?: string;
    filesChangedCount?: number;
    sequence?: number;
    ageMs: number;
  };
}
export interface SprintLiveSnapshotPayload {
  sprintId: string | null;
  phase: string | null;
  workers: SprintLiveWorkerPayload[];
  locks: Array<{ name: string; ageMs: number }>;
  active: boolean;
  generatedAt: string;
}
export interface SprintTaskDetailPayload {
  taskId: string;
  task: Record<string, unknown> | null;
  plan: { text: string; truncated: boolean } | null;
  result: Record<string, unknown> | null;
  hb: SprintLiveWorkerPayload['hb'] | null;
}

/** F1 — the worker live-log SSE URL (`/api/workers/` prefix is on the
 *  query-token allowlist; `render=human` = the readable `[type] summary`
 *  projection). Exported pure — unit-pinned. */
export function buildWorkerLogUrl(session: DaemonSession, taskId: string): string {
  const url = new URL(`/api/workers/${encodeURIComponent(taskId)}/logs/stream`, session.url);
  url.searchParams.set('render', 'human');
  if (session.apiToken) url.searchParams.set('token', session.apiToken);
  return url.toString();
}

export interface WorkerLogHandlers {
  onLine(line: string): void;
  /** The task has no .log yet — an honest state, not an error. */
  onUnavailable(): void;
  /** P12: transport failure (CSP/CORS/network) — surfaced, never silent-empty. */
  onError?(): void;
}

/** A1 «Changes» — /api/git/* payload shapes (git-workflow-service contract). */
export interface GitStatusPayload {
  note?: 'not-a-git-repo';
  branch?: string;
  ahead?: number;
  behind?: number;
  entries: Array<{ path: string; code: string }>;
  clean: boolean;
}
export interface GitDiffPayload {
  note?: 'not-a-git-repo';
  text: string;
  truncated: boolean;
}
export interface GitProposalPayload {
  note?: 'not-a-git-repo' | 'clean';
  files: Array<{ path: string; insertions: number; deletions: number }>;
  insertions: number;
  deletions: number;
  suggestedMessage: string;
}

/** DT-1 «Telsiz» — the chat-stream SSE URL (`/api/chat/stream` is on the
 *  server's query-token allowlist, same EventSource-cannot-set-headers
 *  rationale as buildEventsUrl). Exported pure — unit-pinned. */
export function buildChatStreamUrl(session: DaemonSession, message: string): string {
  const url = new URL('/api/chat/stream', session.url);
  url.searchParams.set('message', message);
  if (session.apiToken) url.searchParams.set('token', session.apiToken);
  return url.toString();
}

/** DT-1 — one frame of the chat stream (server's ChatStreamEvent contract:
 *  `chunk`* then exactly one terminal `done`/`error`). */
export type ChatStreamFrame =
  | { type: 'chunk'; text: string }
  | { type: 'done'; reply: string }
  | { type: 'error'; message: string };

export interface ChatStreamHandlers {
  onChunk(text: string): void;
  onDone(reply: string): void;
  /** Terminal error — includes the server's honest `no adapter configured`. */
  onError(message: string): void;
}

/** 583/N1 — the run's unified-diff footprint (shared run-diff-service shape). */
export interface RunDiffFilePayload {
  path: string;
  status: string;
  text: string;
  truncated: boolean;
}
export interface RunDiffPayload {
  base: string | null;
  files: RunDiffFilePayload[];
  truncated: boolean;
  note?: 'no-base' | 'not-a-git-repo';
}

/** 583/N3 — daemon capability read the «Makine Dairesi» precondition uses.
 *  `/api/status` includes `terminalEnabled` for loopback callers only. */
export interface DaemonStatusPayload {
  terminalEnabled?: boolean;
  [key: string]: unknown;
}

/** 583/N3 — one PTY session as the daemon lists it (terminal/types.ts SessionMeta). */
export interface TerminalSessionMeta {
  id: string;
  kind: 'ai' | 'deckent' | 'shell';
  tenantId: string;
  createdAt: string;
  status: 'running' | 'exited';
  exitCode?: number;
}

export interface CreateTerminalSessionInput {
  kind: 'ai' | 'deckent' | 'shell';
  /** AI tool for kind==='ai' (server allowlist: claude/gemini/codex). */
  tool?: 'claude' | 'gemini' | 'codex';
  args?: string[];
}

export interface DaemonApiClient {
  readonly session: DaemonSession;
  // ── RunFlow contract ──
  listFlows(): Promise<FlowListResponse>;
  getFlow(flowId: string): Promise<Record<string, unknown>>;
  getPreview(flowId: string): Promise<Record<string, unknown>>;
  /** 583/N1 — the run's real footprint as a unified diff (GAP-4). */
  getRunDiff(flowId: string): Promise<RunDiffPayload>;
  propose(intentSummary: string): Promise<Record<string, unknown>>;
  decide(flowId: string, decision: 'approve' | 'reject', reason?: string): Promise<Record<string, unknown>>;
  start(flowId: string, revision: number, planDigest: string): Promise<Record<string, unknown>>;
  cancel(flowId: string, reason?: string): Promise<Record<string, unknown>>;
  /** Subscribe to a flow's durable event stream. Returns close(). */
  openEvents(flowId: string, onEvent: (event: RunFlowEventPayload) => void, opts?: OpenEventsOptions): () => void;
  // ── ApprovalBroker contract (separate, poll-based) ──
  getApprovals(): Promise<ApprovalsResponse>;
  /** SURF-5 — decide a pending approval. Flag-gated server-side
   *  (`approval.api_decide`): a 403 means the flag is off (surface it). */
  decideApproval(id: string, decision: 'allow' | 'deny', reason?: string): Promise<Record<string, unknown>>;
  // ── Sprint-live contract (588/F1 «Köprü» — /api/sprint/*) ──
  getSprintLive(): Promise<SprintLiveSnapshotPayload>;
  getSprintTask(taskId: string): Promise<SprintTaskDetailPayload>;
  /** Worker canlı-log SSE (named events log_line/log_unavailable). Returns close(). */
  openWorkerLog(taskId: string, handlers: WorkerLogHandlers, opts?: { EventSourceImpl?: typeof EventSource }): () => void;
  // ── Git contract (A1 «Changes» — /api/git/*, N4-servisin HTTP-yüzü) ──
  getGitStatus(): Promise<GitStatusPayload>;
  getGitDiff(opts?: { staged?: boolean }): Promise<GitDiffPayload>;
  getGitProposal(opts?: { flowId?: string; intent?: string }): Promise<GitProposalPayload>;
  /** Control-mutation (403 = gate off — surface it honestly). Stage-all+commit. */
  commitGit(message: string): Promise<{ ok: boolean; sha: string | null; staged: number }>;
  // ── Chat contract (DT-1 «Telsiz» — /api/chat + /api/chat/stream SSE) ──
  /** Single-reply chat (non-streaming fallback). Gate-off daemons answer 403. */
  sendChat(message: string): Promise<string>;
  /** Streaming chat: `chunk`* then one `done`/`error`; returns close(). The
   *  stream self-closes on either terminal frame. */
  openChatStream(message: string, handlers: ChatStreamHandlers, opts?: { EventSourceImpl?: typeof EventSource }): () => void;
  // ── Terminal contract (583/N3 «Makine Dairesi», ADR-G-029) ──
  /** Daemon capability read (`terminalEnabled` — loopback callers only). */
  getStatus(): Promise<DaemonStatusPayload>;
  /** inv#2b bootstrap: exchange the API bearer for the TERMINAL token
   *  (loopback-only endpoint; 404 = terminal disabled, surface it). */
  getTerminalToken(): Promise<string>;
  /** Session CRUD — gated by the TERMINAL bearer, so each call takes the
   *  token obtained above (explicit — the two secrets never blur). */
  listTerminalSessions(terminalToken: string): Promise<TerminalSessionMeta[]>;
  createTerminalSession(terminalToken: string, input: CreateTerminalSessionInput): Promise<TerminalSessionMeta>;
  killTerminalSession(terminalToken: string, sessionId: string): Promise<void>;
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

  /** 583/N3 — same shape as `request`, but authenticated with the TERMINAL
   *  bearer (ADR-G-029: the session routes deliberately refuse the API token;
   *  the two secrets never share a code path here either). */
  async function terminalRequest<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    terminalToken: string,
    body?: unknown,
  ): Promise<T> {
    const h: Record<string, string> = { Authorization: `Bearer ${terminalToken}` };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const response = await doFetch(new URL(path, session.url).toString(), {
      method,
      headers: h,
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

    // 583/N1 — the run's unified-diff footprint (same shared service the CLI prints)
    getRunDiff: (flowId: string) => request<RunDiffPayload>('GET', `/api/run-flow/${encodeURIComponent(flowId)}/diff`),
    getApprovals: () => request<unknown>('GET', '/api/approvals').then(normalizeApprovalsResponse),
    decideApproval: (id, decision, reason) =>
      request('POST', `/api/approvals/${encodeURIComponent(id)}/decision`, {
        decision,
        ...(reason !== undefined ? { reason } : {}),
      }),

    // ── Sprint-live contract (588/F1 «Köprü») ──
    getSprintLive: () => request<SprintLiveSnapshotPayload>('GET', '/api/sprint/live'),
    getSprintTask: (taskId) =>
      request<SprintTaskDetailPayload>('GET', `/api/sprint/task/${encodeURIComponent(taskId)}`),
    openWorkerLog: (taskId, handlers, opts = {}) => {
      const Impl = opts.EventSourceImpl ?? EventSource;
      const source = new Impl(buildWorkerLogUrl(session, taskId));
      const onLine = (raw: MessageEvent): void => {
        try {
          const event = JSON.parse(String(raw.data)) as { line?: unknown };
          if (typeof event.line === 'string') handlers.onLine(event.line);
        } catch { /* torn frame — skipped, never fatal */ }
      };
      source.addEventListener('log_line', onLine);
      source.addEventListener('log_unavailable', () => handlers.onUnavailable());
      // P12: sessiz-boş yasak — taşıma-hatası görünür duruma düşer.
      source.onerror = () => handlers.onError?.();
      return () => {
        source.close();
      };
    },

    // ── Git contract (A1 «Changes») ──
    getGitStatus: () => request<GitStatusPayload>('GET', '/api/git/status'),
    getGitDiff: (opts = {}) =>
      request<GitDiffPayload>('GET', opts.staged === true ? '/api/git/diff?staged=1' : '/api/git/diff'),
    getGitProposal: (opts = {}) => {
      const params = new URLSearchParams();
      if (opts.flowId !== undefined) params.set('flowId', opts.flowId);
      if (opts.intent !== undefined) params.set('intent', opts.intent);
      const qs = params.toString();
      return request<GitProposalPayload>('GET', qs.length > 0 ? `/api/git/proposal?${qs}` : '/api/git/proposal');
    },
    commitGit: (message) =>
      request<{ ok: boolean; sha: string | null; staged: number }>('POST', '/api/git/commit', { message }),

    // ── Chat contract (DT-1 «Telsiz») ──
    sendChat: (message) =>
      request<{ reply: string }>('POST', '/api/chat', { message }).then((r) => r.reply),
    openChatStream: (message, handlers, opts = {}) => {
      const Impl = opts.EventSourceImpl ?? EventSource;
      const source = new Impl(buildChatStreamUrl(session, message));
      let closed = false;
      const close = (): void => {
        if (!closed) { closed = true; source.close(); }
      };
      // Chat frames are UNNAMED SSE events (`data:` only) — plain onmessage,
      // unlike the run-flow stream's named-event listeners.
      source.onmessage = (raw: MessageEvent) => {
        let frame: ChatStreamFrame;
        try {
          frame = JSON.parse(String(raw.data)) as ChatStreamFrame;
        } catch {
          return; // torn frame — never fatal to the stream
        }
        if (frame.type === 'chunk' && typeof frame.text === 'string') handlers.onChunk(frame.text);
        else if (frame.type === 'done') { close(); handlers.onDone(typeof frame.reply === 'string' ? frame.reply : ''); }
        else if (frame.type === 'error') { close(); handlers.onError(typeof frame.message === 'string' ? frame.message : 'error'); }
      };
      source.onerror = () => {
        // The server ends the stream after the terminal frame — a post-close
        // transport error is expected noise; a PRE-terminal drop is honest-failed.
        if (!closed) { close(); handlers.onError('stream disconnected'); }
      };
      return close;
    },
    // ── Terminal contract (583/N3 «Makine Dairesi», ADR-G-029) ──
    getStatus: () => request<DaemonStatusPayload>('GET', '/api/status'),
    getTerminalToken: () =>
      request<{ token: string }>('GET', '/api/terminal/token').then((r) => r.token),
    listTerminalSessions: (terminalToken) =>
      terminalRequest<TerminalSessionMeta[]>('GET', '/api/terminal/sessions', terminalToken),
    createTerminalSession: (terminalToken, input) =>
      terminalRequest<TerminalSessionMeta>('POST', '/api/terminal/sessions', terminalToken, input),
    killTerminalSession: async (terminalToken, sessionId) => {
      await terminalRequest<unknown>(
        'DELETE',
        `/api/terminal/sessions/${encodeURIComponent(sessionId)}`,
        terminalToken,
      );
    },
  };
}
