/**
 * worker-logs render layer — Sprint 408 Task 408-003 (TRACE-QOL, born-639(3)).
 *
 * Since 402-002, `.tasks/task-<id>.log` for claude+docker workers is JSONL of
 * `LogEvent` (src/core/log-event.ts: `{ts, seq, type, content}`). The raw-tail
 * SSE panel (worker-logs.ts) used to stream that JSON verbatim — unreadable
 * for a human. This suite pins:
 *
 *   - RED-kanıt   — a fixture proving the raw JSONL shape is opaque JSON, and
 *                   (E2E) that a request WITHOUT the opt-in still gets it raw.
 *   - FIX         — `renderLogLineHuman` + `?render=human` rewrite a parseable
 *                   LogEvent line to a `[type] summary` human-readable string.
 *   - passthrough — a line that isn't JSON, or is JSON but not LogEvent-shaped
 *                   (legacy codex/gemini text, partial lines), is never
 *                   altered — the two-way (render + passthrough) contract.
 *   - geriye-uyum — an unparametrized request keeps today's raw behavior,
 *                   unchanged (backward-compat pin).
 *
 * `output-stream.ts` (the separate dashboard SSE consumer) is untouched by
 * this change and is not exercised here.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderLogLineHuman } from '../../src/api/worker-logs.js';
import { startTestServer, type TestServerHandle } from './test-server-helper.js';

const TOKEN = 'worker-logs-render-408003';

/**
 * Fixture matching exactly what `writeLogEvent` (src/core/log-event.ts)
 * appends to `.tasks/task-<id>.log` for a Claude tool-call turn.
 */
const FIXTURE_TOOL_USE_LINE = JSON.stringify({
  ts: '2026-07-11T00:00:00.000Z',
  seq: 1,
  type: 'tool_use',
  content: { name: 'Read', input: { file_path: '/workspace/foo.ts' } },
});

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

/** Parse every `data: {...}` SSE frame in a collected body into JS objects. */
function parseSseEvents(body: string): Array<{ type: string; line?: string; taskId?: string }> {
  const events: Array<{ type: string; line?: string; taskId?: string }> = [];
  for (const frame of body.split('\n\n')) {
    const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
    if (!dataLine) continue;
    try {
      events.push(JSON.parse(dataLine.slice('data: '.length)));
    } catch {
      // non-JSON frame (e.g. `retry: 3000`) — ignore
    }
  }
  return events;
}

// ─── RED evidence ────────────────────────────────────────────────

describe('RED evidence — pre-408-003 raw JSONL', () => {
  it('the .log line is opaque JSON, not human text', () => {
    expect(FIXTURE_TOOL_USE_LINE.startsWith('{"ts"')).toBe(true);
    expect(FIXTURE_TOOL_USE_LINE).not.toMatch(/^\[tool_use\]/);
  });
});

// ─── renderLogLineHuman — FIX + passthrough (two-way) ─────────────

describe('renderLogLineHuman', () => {
  it('renders tool_use as tool-name + short args snippet (direct shape)', () => {
    expect(renderLogLineHuman(FIXTURE_TOOL_USE_LINE)).toBe(
      '[tool_use] Read {"file_path":"/workspace/foo.ts"}',
    );
  });

  it('renders tool_use from the Claude SDK envelope shape', () => {
    const line = JSON.stringify({
      ts: 't',
      seq: 2,
      type: 'tool_use',
      content: { message: { content: [{ type: 'tool_use', name: 'Grep', input: { pattern: 'foo' } }] } },
    });
    expect(renderLogLineHuman(line)).toBe('[tool_use] Grep {"pattern":"foo"}');
  });

  it('renders text as its content', () => {
    const line = JSON.stringify({ ts: 't', seq: 3, type: 'text', content: 'merhaba dünya' });
    expect(renderLogLineHuman(line)).toBe('[text] merhaba dünya');
  });

  it('renders usage as a compact in/out token summary', () => {
    const line = JSON.stringify({
      ts: 't',
      seq: 4,
      type: 'usage',
      content: { usage: { input_tokens: 120, output_tokens: 45 } },
    });
    expect(renderLogLineHuman(line)).toBe('[usage] in:120 out:45');
  });

  it('renders lifecycle compactly using its subtype', () => {
    const line = JSON.stringify({ ts: 't', seq: 5, type: 'lifecycle', content: { type: 'system' } });
    expect(renderLogLineHuman(line)).toBe('[lifecycle] system');
  });

  it('renders tool_result, stderr and turn', () => {
    expect(
      renderLogLineHuman(JSON.stringify({ ts: 't', seq: 6, type: 'tool_result', content: 'ok' })),
    ).toBe('[tool_result] ok');
    expect(
      renderLogLineHuman(JSON.stringify({ ts: 't', seq: 7, type: 'stderr', content: 'boom' })),
    ).toBe('[stderr] boom');
    expect(
      renderLogLineHuman(JSON.stringify({ ts: 't', seq: 8, type: 'turn', content: {} })),
    ).toBe('[turn] started');
  });

  it('passes through a non-JSON line unchanged (legacy codex/gemini stdout)', () => {
    const line = 'plain codex/gemini stdout line, not JSON';
    expect(renderLogLineHuman(line)).toBe(line);
  });

  it('passes through valid JSON that is not LogEvent-shaped', () => {
    const line = JSON.stringify({ foo: 'bar' });
    expect(renderLogLineHuman(line)).toBe(line);
  });

  it('passes through JSON with an unrecognized type field', () => {
    const line = JSON.stringify({ ts: 't', seq: 1, type: 'not-a-real-type', content: {} });
    expect(renderLogLineHuman(line)).toBe(line);
  });

  it('passes through a truncated/partial JSON line unchanged (no data loss)', () => {
    const line = '{"ts":"t","seq":1,"type":"text","content":"incomple';
    expect(renderLogLineHuman(line)).toBe(line);
  });

  it('passes through an empty string unchanged', () => {
    expect(renderLogLineHuman('')).toBe('');
  });
});

// ─── E2E (real server) — ?render=human wiring + backward-compat pin ──

describe('worker-logs SSE — render=human (E2E real server)', () => {
  let handle: TestServerHandle | null = null;
  const ENV_KEYS = ['DECKENT_API_LOCALHOST_AUTO', 'DECKENT_API_AUTH_DISABLED'] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    handle = await startTestServer({ apiToken: TOKEN });
  });

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = null;
    }
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  function logPath(taskId: string): string {
    return join(handle!.projectRoot, '.tasks', `task-${taskId}.log`);
  }

  it('FIX: ?render=human rewrites a LogEvent line to a human-readable summary', async () => {
    writeFileSync(logPath('render-1'), FIXTURE_TOOL_USE_LINE + '\n', 'utf-8');
    const { status, body } = await collectSse(
      handle!.baseUrl,
      `/api/workers/render-1/logs/stream?render=human&token=${TOKEN}`,
      { until: (b) => b.includes('event: log_line') },
    );
    expect(status).toBe(200);
    const logLine = parseSseEvents(body).find((e) => e.type === 'log_line');
    expect(logLine?.line).toBe('[tool_use] Read {"file_path":"/workspace/foo.ts"}');
  });

  it('geriye-uyum: no render param keeps raw-JSONL passthrough (pin)', async () => {
    writeFileSync(logPath('render-2'), FIXTURE_TOOL_USE_LINE + '\n', 'utf-8');
    const { status, body } = await collectSse(
      handle!.baseUrl,
      `/api/workers/render-2/logs/stream?token=${TOKEN}`,
      { until: (b) => b.includes('event: log_line') },
    );
    expect(status).toBe(200);
    const logLine = parseSseEvents(body).find((e) => e.type === 'log_line');
    expect(logLine?.line).toBe(FIXTURE_TOOL_USE_LINE);
  });

  it('render=human still passes a non-JSON legacy line through unchanged', async () => {
    writeFileSync(logPath('render-3'), 'legacy plain stdout line\n', 'utf-8');
    const { status, body } = await collectSse(
      handle!.baseUrl,
      `/api/workers/render-3/logs/stream?render=human&token=${TOKEN}`,
      { until: (b) => b.includes('event: log_line') },
    );
    expect(status).toBe(200);
    const logLine = parseSseEvents(body).find((e) => e.type === 'log_line');
    expect(logLine?.line).toBe('legacy plain stdout line');
  });

  it('an irrelevant ?render= value (not "human") also keeps raw passthrough', async () => {
    writeFileSync(logPath('render-4'), FIXTURE_TOOL_USE_LINE + '\n', 'utf-8');
    const { status, body } = await collectSse(
      handle!.baseUrl,
      `/api/workers/render-4/logs/stream?render=raw&token=${TOKEN}`,
      { until: (b) => b.includes('event: log_line') },
    );
    expect(status).toBe(200);
    const logLine = parseSseEvents(body).find((e) => e.type === 'log_line');
    expect(logLine?.line).toBe(FIXTURE_TOOL_USE_LINE);
  });
});
