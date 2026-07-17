// ═══ run-flow-event-stream tests — TERM-FLOW-UNIFY Sprint-7 dilim (429-009) ═
//
// Coverage axes (task DoD): flowId-scoped SSE (never global-broadcast),
// versioned-event shape preserved verbatim, flag-off → honest 404, wired
// end-to-end into the real server.ts dispatch (mirrors worker-logs.test.ts's
// own "route helpers" + "E2E real server" split).
//
// Hermetic: the E2E section boots the real `createHttpServer` via
// `startTestServer` (tmpdir project root, `.deckent/config.json` seeds
// `terminal.run_flow_v2`), no gitignored state, no real provider spawn.

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  matchRunFlowEventStream,
  isValidRunFlowId,
  formatRunFlowEventFrame,
  resolveReplayCursor,
  publishRunFlowEvent,
  subscribeRunFlowEvents,
  _resetRunFlowEventStreamState,
} from '../../src/api/run-flow-event-stream.js';
import type { RunFlowEvent } from '../../src/core/run-flow-contract.js';
import { startTestServer, type TestServerHandle } from './test-server-helper.js';

function makeEvent(overrides: Partial<RunFlowEvent> & { flowId: string }): RunFlowEvent {
  return {
    schemaVersion: 1,
    timestamp: '2026-07-12T00:00:00.000Z',
    type: 'PREVIEW_STARTED',
    revision: 1,
    ...overrides,
  } as RunFlowEvent;
}

// ─── Pure route/format helpers ──────────────────────────────────────────

describe('run-flow-event-stream route helpers', () => {
  it('matchRunFlowEventStream extracts the flowId segment', () => {
    expect(matchRunFlowEventStream('/api/run-flow/flow-123/events')).toBe('flow-123');
    expect(matchRunFlowEventStream('/api/run-flow/flow-123/events?token=x')).toBe('flow-123');
  });

  it('matchRunFlowEventStream returns null for unrelated or sibling paths', () => {
    expect(matchRunFlowEventStream('/api/run-flow/flow-123')).toBeNull();
    expect(matchRunFlowEventStream('/api/run-flow/flow-123/preview')).toBeNull();
    expect(matchRunFlowEventStream('/api/run-flow/flow-123/decision')).toBeNull();
    expect(matchRunFlowEventStream('/api/run-flow/propose')).toBeNull();
    expect(matchRunFlowEventStream('/api/events')).toBeNull();
    // a slash inside the segment cannot match (the route is single-segment)
    expect(matchRunFlowEventStream('/api/run-flow/a/b/events')).toBeNull();
  });

  it('isValidRunFlowId allows the safe charset and rejects traversal', () => {
    expect(isValidRunFlowId('flow-123')).toBe(true);
    expect(isValidRunFlowId('a1b2_c3')).toBe(true);
    expect(isValidRunFlowId('../../etc/passwd')).toBe(false);
    expect(isValidRunFlowId('a.b')).toBe(false);
    expect(isValidRunFlowId('a/b')).toBe(false);
    expect(isValidRunFlowId('')).toBe(false);
  });

  it('resolveReplayCursor: Last-Event-ID header WINS over the frozen ?after= URL cursor (SURF-6 reconnect-dedupe)', () => {
    // reconnect: original URL still says after=0, but the browser reports the
    // newest received id — the header must win or the backfill replays as dupes
    expect(resolveReplayCursor('6', '/api/run-flow/f/events?after=0')).toBe(6);
    // first subscribe: no header → the URL cursor applies
    expect(resolveReplayCursor(undefined, '/api/run-flow/f/events?after=3')).toBe(3);
    // garbage header falls back to the URL; garbage everywhere → null (no backfill)
    expect(resolveReplayCursor('not-a-number', '/api/run-flow/f/events?after=2')).toBe(2);
    expect(resolveReplayCursor('', '/api/run-flow/f/events')).toBeNull();
  });

  it('formatRunFlowEventFrame emits a named SSE event field and preserves the versioned shape', () => {
    const event = makeEvent({ flowId: 'flow-abc', type: 'APPROVAL_GRANTED', revision: 2, planDigest: 'a'.repeat(64), approvedBy: { id: 'alice' } } as RunFlowEvent);
    const frame = formatRunFlowEventFrame(event);
    expect(frame).toMatch(/^event: APPROVAL_GRANTED\n/);
    expect(frame.endsWith('\n\n')).toBe(true);
    const dataLine = frame.split('\n').find((l) => l.startsWith('data: '))!;
    const parsed = JSON.parse(dataLine.slice('data: '.length)) as RunFlowEvent;
    expect(parsed).toEqual(event);
    expect(parsed.schemaVersion).toBe(1);
  });
});

// ─── flowId-scoped pub/sub (the task's explicit nogo: no global broadcast) ──

describe('publish/subscribe is flowId-scoped, never a global broadcast', () => {
  afterEach(() => {
    _resetRunFlowEventStreamState();
  });

  it('a published event reaches ONLY subscribers of that exact flowId', () => {
    const receivedA: RunFlowEvent[] = [];
    const receivedB: RunFlowEvent[] = [];
    subscribeRunFlowEvents('flow-a', (e) => receivedA.push(e));
    subscribeRunFlowEvents('flow-b', (e) => receivedB.push(e));

    publishRunFlowEvent(makeEvent({ flowId: 'flow-a' }));

    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(0);
  });

  it('unsubscribe stops further delivery to that listener only', () => {
    const received: RunFlowEvent[] = [];
    const unsubscribe = subscribeRunFlowEvents('flow-c', (e) => received.push(e));
    publishRunFlowEvent(makeEvent({ flowId: 'flow-c' }));
    unsubscribe();
    publishRunFlowEvent(makeEvent({ flowId: 'flow-c', type: 'RUN_COMPLETED' } as RunFlowEvent));
    expect(received).toHaveLength(1);
  });

  it('publishing to a flowId with no subscribers is a silent no-op (never throws)', () => {
    expect(() => publishRunFlowEvent(makeEvent({ flowId: 'nobody-listening' }))).not.toThrow();
  });

  it('a faulting subscriber does not break fan-out to other subscribers of the same flow', () => {
    const received: RunFlowEvent[] = [];
    subscribeRunFlowEvents('flow-d', () => {
      throw new Error('boom');
    });
    subscribeRunFlowEvents('flow-d', (e) => received.push(e));
    expect(() => publishRunFlowEvent(makeEvent({ flowId: 'flow-d' }))).not.toThrow();
    expect(received).toHaveLength(1);
  });
});

// ─── E2E (real server, wired via server.ts) ─────────────────────────────

async function collectSse(
  baseUrl: string,
  path: string,
  opts: { until: (body: string) => boolean; timeoutMs?: number },
): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 2500);
  let body = '';
  let status = 0;
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
    });
    status = res.status;
    if (!res.body || status !== 200) {
      try {
        body = await res.text();
      } catch {
        /* aborted / empty */
      }
      return { status, body };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
      if (opts.until(body)) break;
    }
  } catch {
    // abort on timeout — return what we collected
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  return { status, body };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('run-flow event-stream SSE (E2E real server)', () => {
  let handle: TestServerHandle | null = null;

  afterEach(async () => {
    _resetRunFlowEventStreamState();
    if (handle) {
      await handle.close();
      handle = null;
    }
  });

  it('flag-off (terminal.run_flow_v2 unset) → 404, honest disabled message', async () => {
    handle = await startTestServer({ disableAuth: true });
    const { status, body } = await collectSse(
      handle.baseUrl,
      '/api/run-flow/any-flow-id/events',
      { until: () => true },
    );
    expect(status).toBe(404);
    expect(body).toContain('terminal.run_flow_v2');
  });

  it('flag-on: streams a published event to its own flowId and preserves the versioned shape', async () => {
    handle = await startTestServer({ disableAuth: true, seed: { config: { terminal: { run_flow_v2: true } } } });

    const flowId = 'flow-e2e-1';
    const p = collectSse(
      handle.baseUrl,
      `/api/run-flow/${flowId}/events`,
      { until: (b) => b.includes('PREVIEW_READY') },
    );
    await sleep(200); // let the SSE connection + subscription settle
    const event = makeEvent({
      flowId,
      type: 'PREVIEW_READY',
      preview: {
        flowId,
        revision: 1,
        planDigest: 'b'.repeat(64),
        taskSummaries: [{ title: 'T', summary: 'S' }],
        policyDecision: 'allow',
        gateResult: 'pass',
      },
    } as RunFlowEvent);
    publishRunFlowEvent(event);

    const { status, body } = await p;
    expect(status).toBe(200);
    expect(body).toContain('event: PREVIEW_READY');
    const dataLine = body.split('\n').find((l) => l.startsWith('data: '))!;
    const parsed = JSON.parse(dataLine.slice('data: '.length)) as RunFlowEvent;
    expect(parsed).toEqual(event);
  });

  it('global-broadcast guard: a DIFFERENT flowId does not receive an event published to another flow', async () => {
    handle = await startTestServer({ disableAuth: true, seed: { config: { terminal: { run_flow_v2: true } } } });

    const listenerFlowId = 'flow-e2e-other';
    const p = collectSse(
      handle.baseUrl,
      `/api/run-flow/${listenerFlowId}/events`,
      { until: (b) => b.length > 0, timeoutMs: 800 },
    );
    await sleep(200);
    publishRunFlowEvent(makeEvent({ flowId: 'flow-e2e-target', type: 'RUN_COMPLETED' } as RunFlowEvent));
    const { status, body } = await p;
    expect(status).toBe(200);
    expect(body).not.toContain('RUN_COMPLETED');
  });

  it('rejects an invalid flowId (dot) with 400', async () => {
    handle = await startTestServer({ disableAuth: true, seed: { config: { terminal: { run_flow_v2: true } } } });
    const { status } = await collectSse(
      handle.baseUrl,
      '/api/run-flow/a.b/events',
      { until: () => true },
    );
    expect(status).toBe(400);
  });
});
