// ═══ Live Log SSE Stream Tests (dead-stream fix) ═══════════════════════════
// Task 326-010 (spec §2.3): wire OutputCollector → /api/output-stream SSE so the
// dashboard tails the per-task JSONL log (`.tasks/task-<id>.log`) with backfill +
// live push. Faithful: pre-fix the wire (handleLogStream / readLogEvents) is
// absent → the import fails / stream is empty → RED. Post-fix → backfill + push.
//
// Hermetic: real OutputCollector + real writeLogEvent over a per-test tmpdir;
// no mocks, no HOME-leak, no spawn. Fake timers drive the live-push poll.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';
import { mkdirSync, rmSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  handleLogStream,
  type LogStreamEvent,
} from '../../src/api/output-stream.js';
import { OutputCollector } from '../../src/core/output-collector.js';
import { writeLogEvent, type StreamLogEvent } from '../../src/core/log-event.js';

// ─── Mock req/res (EventEmitter-backed, like output-stream.test.ts) ──────────

function makeMockReq(taskId = '326-x'): IncomingMessage {
  const req = new EventEmitter() as unknown as IncomingMessage;
  (req as { url: string }).url = `/api/output-stream?taskId=${taskId}`;
  (req as { method: string }).method = 'GET';
  return req;
}

function makeMockRes(): ServerResponse & {
  _written: string[];
  _status: number;
  _ended: boolean;
} {
  const written: string[] = [];
  const res = new EventEmitter() as unknown as ServerResponse & {
    _written: string[];
    _status: number;
    _ended: boolean;
  };
  res._written = written;
  res._status = 200;
  res._ended = false;
  res.writeHead = vi.fn((code: number) => {
    res._status = code;
    return res;
  }) as unknown as ServerResponse['writeHead'];
  res.write = vi.fn((chunk: string) => {
    written.push(chunk);
    return true;
  }) as unknown as ServerResponse['write'];
  res.end = vi.fn(() => {
    res._ended = true;
    res.writableEnded = true;
    return res;
  }) as unknown as ServerResponse['end'];
  res.writableEnded = false;
  res.destroyed = false;
  return res;
}

/** Extract every SSE event of a given type from the written chunks. */
function parseEvents(written: string[], type: string): LogStreamEvent[] {
  const out: LogStreamEvent[] = [];
  for (const chunk of written) {
    if (!chunk.startsWith(`event: ${type}\n`)) continue;
    const dataLine = chunk.split('data: ')[1]?.split('\n\n')[0];
    if (dataLine) out.push(JSON.parse(dataLine) as LogStreamEvent);
  }
  return out;
}

function hasEventType(written: string[], type: string): boolean {
  return written.some(w => w.startsWith(`event: ${type}\n`));
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('handleLogStream — live JSONL tail (dead-stream fix)', () => {
  let root: string;
  let collector: OutputCollector;
  const cleanups: Array<() => void> = [];

  beforeEach(() => {
    root = join(
      tmpdir(),
      `deckent-livestream-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(root, { recursive: true });
    collector = new OutputCollector(root);
  });

  afterEach(() => {
    cleanups.forEach(fn => fn());
    cleanups.length = 0;
    collector.dispose();
    vi.useRealTimers();
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  /** Append one structured event to `.tasks/task-<id>.log` via the real writer. */
  function append(taskId: string, ev: StreamLogEvent, seq: number): void {
    writeLogEvent(join(root, '.tasks', `task-${taskId}.log`), ev, seq);
  }

  it('backfills the full JSONL history on connect', () => {
    const taskId = '326-backfill';
    append(taskId, { type: 'turn', content: { n: 1 } }, 1);
    append(taskId, { type: 'tool_use', content: { name: 'Bash' } }, 2);
    append(taskId, { type: 'text', content: 'hello' }, 3);

    const res = makeMockRes();
    cleanups.push(handleLogStream(makeMockReq(taskId), res, collector, { pollIntervalMs: 100 }));

    const backfill = parseEvents(res._written, 'log-backfill');
    expect(backfill).toHaveLength(1);
    expect(backfill[0].taskId).toBe(taskId);
    expect(backfill[0].events).toHaveLength(3);
    expect(backfill[0].events.map(e => e.type)).toEqual(['turn', 'tool_use', 'text']);
    expect(backfill[0].events.map(e => e.seq)).toEqual([1, 2, 3]);
    expect(backfill[0].lastSeq).toBe(3);
    // each event carries the stamped ISO ts from writeLogEvent
    expect(typeof backfill[0].events[0].ts).toBe('string');
  });

  it('pushes newly appended events live after backfill (backfill + push)', () => {
    vi.useFakeTimers();
    const taskId = '326-live';
    append(taskId, { type: 'turn', content: { n: 1 } }, 1);

    const res = makeMockRes();
    cleanups.push(handleLogStream(makeMockReq(taskId), res, collector, { pollIntervalMs: 100 }));

    // backfill carries only the first event
    const backfill = parseEvents(res._written, 'log-backfill');
    expect(backfill[0].events).toHaveLength(1);
    expect(backfill[0].lastSeq).toBe(1);

    // a new event is appended while the stream is open
    append(taskId, { type: 'tool_use', content: { name: 'Edit' } }, 2);
    vi.advanceTimersByTime(150); // trigger one poll

    const pushed = parseEvents(res._written, 'log').flatMap(p => p.events);
    expect(pushed.some(e => e.seq === 2 && e.type === 'tool_use')).toBe(true);
    // the already-backfilled event #1 is NOT re-sent (seq cursor)
    expect(pushed.some(e => e.seq === 1)).toBe(false);

    // a pure file-tail (no collect() caller) stays open — not auto-"done"
    expect(hasEventType(res._written, 'done')).toBe(false);
  });

  it('keeps pushing across multiple appends without duplication', () => {
    vi.useFakeTimers();
    const taskId = '326-multi';

    const res = makeMockRes();
    cleanups.push(handleLogStream(makeMockReq(taskId), res, collector, { pollIntervalMs: 100 }));

    // empty backfill (no file yet)
    expect(parseEvents(res._written, 'log-backfill')[0].events).toHaveLength(0);

    append(taskId, { type: 'text', content: 'a' }, 1);
    vi.advanceTimersByTime(110);
    append(taskId, { type: 'text', content: 'b' }, 2);
    vi.advanceTimersByTime(110);

    const pushed = parseEvents(res._written, 'log').flatMap(p => p.events);
    const seqs = pushed.map(e => e.seq).sort((x, y) => x - y);
    expect(seqs).toEqual([1, 2]); // each delivered exactly once
  });

  it('returns an empty backfill (no throw) when the log file is absent', () => {
    const res = makeMockRes();
    cleanups.push(handleLogStream(makeMockReq('326-missing'), res, collector, { pollIntervalMs: 100 }));

    const backfill = parseEvents(res._written, 'log-backfill');
    expect(backfill).toHaveLength(1);
    expect(backfill[0].events).toHaveLength(0);
    expect(backfill[0].lastSeq).toBe(0);
  });

  it('tolerates malformed / non-LogEvent lines (never drops the valid ones)', () => {
    const taskId = '326-malformed';
    const logPath = join(root, '.tasks', `task-${taskId}.log`);
    append(taskId, { type: 'turn', content: { n: 1 } }, 1);
    appendFileSync(logPath, 'this-is-not-json{{{\n', 'utf-8'); // partial/garbage line
    appendFileSync(logPath, '{"foo":"bar"}\n', 'utf-8'); // valid JSON, not a LogEvent
    append(taskId, { type: 'usage', content: { usage: { input_tokens: 5 } } }, 2);

    const res = makeMockRes();
    cleanups.push(handleLogStream(makeMockReq(taskId), res, collector, { pollIntervalMs: 100 }));

    const events = parseEvents(res._written, 'log-backfill')[0].events;
    expect(events.map(e => e.seq)).toEqual([1, 2]);
    expect(events.map(e => e.type)).toEqual(['turn', 'usage']);
  });

  it('returns 400 when taskId query param is missing', () => {
    const req = new EventEmitter() as unknown as IncomingMessage;
    (req as { url: string }).url = '/api/output-stream';
    (req as { method: string }).method = 'GET';
    const res = makeMockRes();

    handleLogStream(req, res, collector);

    expect(res._status).toBe(400);
    expect(res.end).toHaveBeenCalled();
  });

  it('emits done and closes on max-connection-timeout', () => {
    vi.useFakeTimers();
    const res = makeMockRes();
    cleanups.push(
      handleLogStream(makeMockReq('326-timeout'), res, collector, {
        pollIntervalMs: 100,
        maxConnectionMs: 300,
      }),
    );

    vi.advanceTimersByTime(350);

    const done = parseEvents(res._written, 'done');
    expect(hasEventType(res._written, 'done')).toBe(true);
    const reason = (done[0] as unknown as { reason?: string }).reason;
    expect(reason).toBe('max-connection-timeout');
    expect(res._ended).toBe(true);
  });

  it('cleanup stops polling (no further writes after cleanup)', () => {
    vi.useFakeTimers();
    const taskId = '326-cleanup';
    const res = makeMockRes();
    const cleanup = handleLogStream(makeMockReq(taskId), res, collector, { pollIntervalMs: 100 });

    const before = res._written.length;
    cleanup();
    append(taskId, { type: 'text', content: 'after' }, 1);
    vi.advanceTimersByTime(500);

    expect(res._written.length).toBe(before);
  });
});
