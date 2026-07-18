// D4-3 — transport-client + CSP pins (node-env, hermetic):
//   * api-client: Bearer header on REST, ?token= + ?after= on the SSE URL,
//     404 → ApiError(status) so views can surface the run_flow_v2 flag
//     precondition honestly, named-SSE-event subscription set.
//   * security.ts buildLocalRendererCsp: connect-src extends to exactly the
//     active daemon origins while everything else stays 'self'.

import { describe, it, expect, vi } from 'vitest';
import { ApiError, buildChatStreamUrl, buildEventsUrl, buildWorkerLogUrl, createApiClient, normalizeApprovalEntry } from '../src/renderer/shell/api-client.js';
import { buildLocalRendererCsp } from '../src/main/security.js';
import type { DaemonSession } from '../src/shared/desktop-api.js';

const SESSION: DaemonSession = { profileId: 'p-1', url: 'http://127.0.0.1:4317', apiToken: 'tok-123' };

function makeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
  return { fetchFn, calls };
}

describe('api-client (D4-3)', () => {
  it('sends the Bearer token on REST calls and hits the documented endpoints', async () => {
    const { fetchFn, calls } = makeFetch(200, { flows: [] });
    const client = createApiClient(SESSION, fetchFn);
    await client.listFlows();
    expect(calls[0]!.url).toBe('http://127.0.0.1:4317/api/run-flow/list');
    expect((calls[0]!.init?.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-123');
  });

  it('POSTs propose/decision with JSON bodies', async () => {
    const { fetchFn, calls } = makeFetch(200, {});
    const client = createApiClient(SESSION, fetchFn);
    await client.propose('add auth');
    await client.decide('flow-1', 'approve');
    expect(calls[0]!.url).toContain('/api/run-flow/propose');
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ intentSummary: 'add auth' });
    expect(calls[1]!.url).toContain('/api/run-flow/flow-1/decision');
    expect(JSON.parse(String(calls[1]!.init?.body))).toEqual({ decision: 'approve' });
  });

  it('a 404 surfaces as ApiError(404) — the run_flow_v2 flag-off signal', async () => {
    const { fetchFn } = makeFetch(404, { error: 'Not found' });
    const client = createApiClient(SESSION, fetchFn);
    await expect(client.listFlows()).rejects.toMatchObject({ name: 'ApiError', status: 404 });
  });

  it('the approvals contract stays separate (poll endpoint, same auth)', async () => {
    const { fetchFn, calls } = makeFetch(200, { pending: [], approved: [], denied: [] });
    const client = createApiClient(SESSION, fetchFn);
    await client.getApprovals();
    expect(calls[0]!.url).toBe('http://127.0.0.1:4317/api/approvals');
  });

  it('decideApproval POSTs the broker decision endpoint with the server schema body (SURF-5)', async () => {
    const { fetchFn, calls } = makeFetch(200, { ok: true });
    const client = createApiClient(SESSION, fetchFn);
    await client.decideApproval('appr-1', 'allow');
    await client.decideApproval('appr-2', 'deny', 'not in scope');
    expect(calls[0]!.url).toBe('http://127.0.0.1:4317/api/approvals/appr-1/decision');
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ decision: 'allow' });
    expect(JSON.parse(String(calls[1]!.init?.body))).toEqual({ decision: 'deny', reason: 'not in scope' });
  });

  it('decideApproval 403 surfaces as ApiError(403) — the approval.api_decide flag-off signal (SURF-5)', async () => {
    const { fetchFn } = makeFetch(403, { error: 'approval.api_decide is disabled' });
    const client = createApiClient(SESSION, fetchFn);
    await expect(client.decideApproval('appr-1', 'allow')).rejects.toMatchObject({ name: 'ApiError', status: 403 });
  });

  it('buildEventsUrl carries ?token= (EventSource cannot set headers) and ?after= (replay cursor)', () => {
    const url = new URL(buildEventsUrl(SESSION, 'flow-9', 42));
    expect(url.pathname).toBe('/api/run-flow/flow-9/events');
    expect(url.searchParams.get('token')).toBe('tok-123');
    expect(url.searchParams.get('after')).toBe('42');
    // token omitted when the session has none — never an empty param
    const bare = new URL(buildEventsUrl({ ...SESSION, apiToken: undefined }, 'flow-9'));
    expect(bare.searchParams.has('token')).toBe(false);
    expect(bare.searchParams.has('after')).toBe(false);
  });

  it('openEvents subscribes to the NAMED RunFlow event types and parses frames into the callback', () => {
    const listeners = new Map<string, (e: { data: string }) => void>();
    class FakeEventSource {
      static last: FakeEventSource | undefined;
      url: string;
      closed = false;
      constructor(url: string) {
        this.url = url;
        FakeEventSource.last = this;
      }
      addEventListener(type: string, cb: (e: { data: string }) => void) {
        listeners.set(type, cb);
      }
      close() {
        this.closed = true;
      }
    }
    const client = createApiClient(SESSION, makeFetch(200, {}).fetchFn);
    const received: string[] = [];
    const close = client.openEvents('flow-1', (e) => received.push(e.type), {
      afterSequence: 0,
      EventSourceImpl: FakeEventSource as unknown as typeof EventSource,
    });

    expect(listeners.has('RUN_STARTED')).toBe(true);
    expect(listeners.has('RUN_COMPLETED')).toBe(true);
    listeners.get('RUN_STARTED')!({ data: JSON.stringify({ type: 'RUN_STARTED', flowId: 'flow-1', timestamp: 't', sequence: 3 }) });
    expect(received).toEqual(['RUN_STARTED']);

    close();
    expect(FakeEventSource.last!.closed).toBe(true);
  });

  it('ApiError carries the status + a truncated server detail', async () => {
    const { fetchFn } = makeFetch(502, { error: 'preview generation failed' });
    const client = createApiClient(SESSION, fetchFn);
    const error = await client.propose('x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toContain('502');
  });
});

describe('normalizeApprovalEntry — nested-server → flat-shell (SURF-kuyruk-E)', () => {
  it('flattens the server\'s {category, request:{id, summary, createdAt}} shape (the latent view-crash class)', () => {
    const entry = normalizeApprovalEntry({
      category: 'pending',
      request: { id: 'apr-1', summary: 'Worker asks: run X', createdAt: '2026-07-17T10:00:00.000Z', risk: 'high' },
      decision: null,
    });
    expect(entry.id).toBe('apr-1');
    expect(entry.title).toBe('Worker asks: run X');
    expect(entry.createdAt).toBe('2026-07-17T10:00:00.000Z');
  });

  it('tolerates an already-flat entry and garbage (honest empty id, never a throw)', () => {
    expect(normalizeApprovalEntry({ id: 'flat-1', title: 'T' })).toMatchObject({ id: 'flat-1', title: 'T' });
    expect(normalizeApprovalEntry(null).id).toBe('');
    expect(normalizeApprovalEntry({ request: 42 }).id).toBe('');
  });
});

describe('api-client sprint-live contract (588/F1 «Köprü»)', () => {
  it('getSprintLive/getSprintTask hit the monitoring reads with the bearer', async () => {
    const { fetchFn, calls } = makeFetch(200, { workers: [], locks: [], active: false, sprintId: null, phase: null, generatedAt: 't' });
    const client = createApiClient(SESSION, fetchFn);
    await client.getSprintLive();
    await client.getSprintTask('001 a').catch(() => {});
    expect(calls[0]!.url).toBe('http://127.0.0.1:4317/api/sprint/live');
    expect(calls[1]!.url).toBe('http://127.0.0.1:4317/api/sprint/task/001%20a');
    expect((calls[0]!.init?.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-123');
  });

  it('buildWorkerLogUrl → /logs/stream with render=human + query-token (the /api/workers/ allowlist prefix)', () => {
    const url = new URL(buildWorkerLogUrl(SESSION, 'task-9'));
    expect(url.pathname).toBe('/api/workers/task-9/logs/stream');
    expect(url.searchParams.get('render')).toBe('human');
    expect(url.searchParams.get('token')).toBe('tok-123');
  });

  it('openWorkerLog routes NAMED log_line frames to onLine and log_unavailable honestly', () => {
    const listeners = new Map<string, (e: { data: string }) => void>();
    class FakeES {
      static last: FakeES | null = null;
      closed = false;
      constructor(public url: string) { FakeES.last = this; }
      addEventListener(type: string, cb: (e: { data: string }) => void) { listeners.set(type, cb); }
      close() { this.closed = true; }
    }
    const client = createApiClient(SESSION, makeFetch(200, {}).fetchFn);
    const seen: string[] = [];
    const close = client.openWorkerLog('t1', {
      onLine: (line) => seen.push(line),
      onUnavailable: () => seen.push('<unavailable>'),
    }, { EventSourceImpl: FakeES as unknown as typeof EventSource });
    listeners.get('log_line')!({ data: JSON.stringify({ type: 'log_line', taskId: 't1', ts: 'x', line: '[tool] Read a.ts' }) });
    listeners.get('log_line')!({ data: 'torn{' }); // skipped
    listeners.get('log_unavailable')!({ data: JSON.stringify({ type: 'log_unavailable', taskId: 't1', ts: 'x' }) });
    expect(seen).toEqual(['[tool] Read a.ts', '<unavailable>']);
    close();
    expect(FakeES.last!.closed).toBe(true);
  });
});

describe('api-client chat contract (DT-1 «Telsiz» — /api/chat + SSE stream)', () => {
  /** Minimal fake EventSource capturing the constructed URL + handler seams. */
  class FakeEventSource {
    static last: FakeEventSource | null = null;
    url: string;
    closed = false;
    onmessage: ((e: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(url: string) {
      this.url = url;
      FakeEventSource.last = this;
    }
    close(): void { this.closed = true; }
    emit(frame: unknown): void { this.onmessage?.({ data: JSON.stringify(frame) }); }
  }

  it('buildChatStreamUrl carries message + query-token (EventSource cannot set headers)', () => {
    const url = new URL(buildChatStreamUrl(SESSION, 'hello watch'));
    expect(url.pathname).toBe('/api/chat/stream');
    expect(url.searchParams.get('message')).toBe('hello watch');
    expect(url.searchParams.get('token')).toBe('tok-123');
  });

  it('sendChat POSTs {message} with the bearer and unwraps {reply}', async () => {
    const { fetchFn, calls } = makeFetch(200, { reply: 'aye' });
    const client = createApiClient(SESSION, fetchFn);
    expect(await client.sendChat('status?')).toBe('aye');
    expect(calls[0]!.url).toBe('http://127.0.0.1:4317/api/chat');
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ message: 'status?' });
    expect((calls[0]!.init?.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-123');
  });

  it('openChatStream routes chunk* → done and SELF-CLOSES on the terminal frame', () => {
    const client = createApiClient(SESSION, makeFetch(200, {}).fetchFn);
    const seen: string[] = [];
    client.openChatStream('q', {
      onChunk: (t) => seen.push(`chunk:${t}`),
      onDone: (r) => seen.push(`done:${r}`),
      onError: (m) => seen.push(`error:${m}`),
    }, { EventSourceImpl: FakeEventSource as unknown as typeof EventSource });
    const source = FakeEventSource.last!;
    source.emit({ type: 'chunk', text: 'He' });
    source.emit({ type: 'chunk', text: 'llo' });
    source.emit({ type: 'done', reply: 'Hello' });
    expect(seen).toEqual(['chunk:He', 'chunk:llo', 'done:Hello']);
    expect(source.closed).toBe(true);
  });

  it('a server error frame (e.g. no adapter configured) terminates honestly; torn frames are skipped', () => {
    const client = createApiClient(SESSION, makeFetch(200, {}).fetchFn);
    const seen: string[] = [];
    client.openChatStream('q', {
      onChunk: () => seen.push('chunk'),
      onDone: () => seen.push('done'),
      onError: (m) => seen.push(`error:${m}`),
    }, { EventSourceImpl: FakeEventSource as unknown as typeof EventSource });
    const source = FakeEventSource.last!;
    source.onmessage?.({ data: 'not-json{' }); // torn — skipped
    source.emit({ type: 'error', message: 'chat-stream: no adapter configured' });
    expect(seen).toEqual(['error:chat-stream: no adapter configured']);
    expect(source.closed).toBe(true);
  });

  it('a transport drop BEFORE any terminal frame surfaces as `stream disconnected`; after close it is silent', () => {
    const client = createApiClient(SESSION, makeFetch(200, {}).fetchFn);
    const seen: string[] = [];
    client.openChatStream('q', {
      onChunk: () => {},
      onDone: () => seen.push('done'),
      onError: (m) => seen.push(`error:${m}`),
    }, { EventSourceImpl: FakeEventSource as unknown as typeof EventSource });
    const source = FakeEventSource.last!;
    source.onerror?.();
    expect(seen).toEqual(['error:stream disconnected']);
    source.onerror?.(); // post-close transport noise — no second callback
    expect(seen).toEqual(['error:stream disconnected']);
  });
});

describe('api-client terminal contract (583/N3 «Makine Dairesi», ADR-G-029)', () => {
  it('getTerminalToken exchanges the API bearer at /api/terminal/token and unwraps { token }', async () => {
    const { fetchFn, calls } = makeFetch(200, { token: 'term-secret' });
    const client = createApiClient(SESSION, fetchFn);
    const token = await client.getTerminalToken();
    expect(token).toBe('term-secret');
    expect(calls[0]!.url).toBe('http://127.0.0.1:4317/api/terminal/token');
    expect((calls[0]!.init?.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-123');
  });

  it('session CRUD authenticates with the TERMINAL bearer, never the API token (the two secrets stay disjoint)', async () => {
    const { fetchFn, calls } = makeFetch(200, []);
    const client = createApiClient(SESSION, fetchFn);
    await client.listTerminalSessions('term-secret');
    expect(calls[0]!.url).toBe('http://127.0.0.1:4317/api/terminal/sessions');
    expect((calls[0]!.init?.headers as Record<string, string>)['Authorization']).toBe('Bearer term-secret');
  });

  it('createTerminalSession POSTs the kind/tool body; killTerminalSession DELETEs by id', async () => {
    const { fetchFn, calls } = makeFetch(200, { id: 's-1', kind: 'ai', tenantId: 'local', createdAt: '', status: 'running' });
    const client = createApiClient(SESSION, fetchFn);
    await client.createTerminalSession('term-secret', { kind: 'ai', tool: 'claude' });
    await client.killTerminalSession('term-secret', 's 1');
    expect(calls[0]!.init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ kind: 'ai', tool: 'claude' });
    expect(calls[1]!.init?.method).toBe('DELETE');
    expect(calls[1]!.url).toBe('http://127.0.0.1:4317/api/terminal/sessions/s%201');
  });

  it('getStatus reads the daemon capability payload (terminalEnabled precondition)', async () => {
    const { fetchFn, calls } = makeFetch(200, { terminalEnabled: false });
    const client = createApiClient(SESSION, fetchFn);
    const status = await client.getStatus();
    expect(status.terminalEnabled).toBe(false);
    expect(calls[0]!.url).toBe('http://127.0.0.1:4317/api/status');
  });
});

describe('buildLocalRendererCsp (D4-3 — approved transport decision)', () => {
  it('always allows the loopback port-wildcards, http AND ws (583/N3 — the terminal WebSocket)', () => {
    // NOT [::1]: Chromium rejects a bracketed-IPv6 wildcard source — an ::1
    // daemon joins via its exact dynamic origin instead (see builder note).
    // ws sources are EXPLICIT — CSP3's http→ws scheme matching is not relied on.
    expect(buildLocalRendererCsp([])).toBe(
      "default-src 'self'; connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; style-src 'self' 'unsafe-inline'",
    );
  });

  it('a loopback daemon origin is already covered (no duplicate entry added)', () => {
    const csp = buildLocalRendererCsp(['http://127.0.0.1:4317']);
    expect(csp).not.toContain('http://127.0.0.1:4317');
    // everything else inherits default-src 'self' — no script/style loosening
    expect(csp).not.toContain('script-src');
  });

  it('a future non-loopback (https/tunnel) origin joins dynamically WITH its wss twin (583/N3)', () => {
    const csp = buildLocalRendererCsp(['https://daemon.example:8443']);
    expect(csp).toContain('https://daemon.example:8443');
    expect(csp).toContain('wss://daemon.example:8443');
  });

  // ── KABUL Gün-1 pürüz-1: dev-preamble CSP fix (blank-window root cause) ──

  it('DEV (allowDevInlineScript): script-src gains unsafe-inline so the vite react-preamble can run', () => {
    const csp = buildLocalRendererCsp([], { allowDevInlineScript: true });
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    // everything else stays exactly as the default-mode string
    expect(csp.startsWith("default-src 'self'; connect-src 'self' http://127.0.0.1:*")).toBe(true);
  });

  it("PACKAGED (default): scripts stay fully locked (no script-src loosening); style-src alone carries unsafe-inline (pürüz-3 — react-aria's runtime inline styles)", () => {
    const csp = buildLocalRendererCsp([]);
    expect(csp).not.toContain('script-src');
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('the index.html META twin stays in sync (KABUL Gün-1: the comment alone drifted — ws + style were silently re-blocked)', async () => {
    const { readFileSync } = await import('node:fs');
    const html = readFileSync(new URL('../src/renderer/index.html', import.meta.url), 'utf-8');
    const meta = /content="([^"]+)"/.exec(html.split('Content-Security-Policy')[1] ?? '')?.[1] ?? '';
    // The header's capabilities the meta must never intersect away:
    expect(meta).toContain('ws://127.0.0.1:*');
    expect(meta).toContain('ws://localhost:*');
    expect(meta).toContain("style-src 'self' 'unsafe-inline'");
    // …and the locks the meta must keep:
    expect(meta).toContain("script-src 'self'");
    expect(meta).not.toContain("script-src 'self' 'unsafe-inline'");
  });
});
