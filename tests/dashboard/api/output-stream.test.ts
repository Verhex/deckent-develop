// ═══ Output Stream SSE Endpoint Tests ══════════════════════════════════════
// Sprint 139 — Task 049: Web Dashboard Hook Point
// Tests for src/dashboard/api/output-stream.ts
//
// Coverage:
//   - writeSseEvent: writes correct format, handles closed response
//   - writeSseHeaders: sets correct headers
//   - parseStreamQuery: parses taskId/sprintId, handles missing params
//   - handleOutputStream: snapshot on connect, output events, done on worker stop
//   - isOutputStreamRequest: URL matching

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';

import {
  writeSseEvent,
  writeSseHeaders,
  parseStreamQuery,
  handleOutputStream,
  isOutputStreamRequest,
  type OutputStreamEvent,
  type SnapshotEvent,
  type ErrorEvent,
} from '../../../src/dashboard/api/output-stream.js';
import { OutputCollector } from '../../../src/core/output-collector.js';

// ─── Mock output-collector ───────────────────────────────────────────────────

vi.mock('../../../src/core/output-collector.js', () => {
  const MockOutputCollector = vi.fn().mockImplementation(() => ({
    getSnapshot: vi.fn().mockReturnValue(null),
    getActiveWorkers: vi.fn().mockReturnValue([]),
    collect: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
    getBuffer: vi.fn(),
    flushToDisk: vi.fn(),
  }));
  return {
    OutputCollector: MockOutputCollector,
    createOutputCollector: vi.fn((root: string) => new MockOutputCollector(root)),
  };
});

// ─── Mock Factories ──────────────────────────────────────────────────────────

/** Create a minimal mock IncomingMessage */
function makeMockReq(url = '/api/output-stream?taskId=task-001'): IncomingMessage {
  const req = new EventEmitter() as unknown as IncomingMessage;
  (req as { url: string }).url = url;
  (req as { method: string }).method = 'GET';
  return req;
}

/** Create a minimal mock ServerResponse with write/writeHead/end tracking */
function makeMockRes(): ServerResponse & {
  _written: string[];
  _headers: Record<string, string | number>;
  _statusCode: number;
  _ended: boolean;
} {
  const written: string[] = [];
  const headers: Record<string, string | number> = {};
  let statusCode = 200;
  let ended = false;

  const res = new EventEmitter() as unknown as ServerResponse & {
    _written: string[];
    _headers: Record<string, string | number>;
    _statusCode: number;
    _ended: boolean;
  };

  res._written = written;
  res._headers = headers;
  res._statusCode = statusCode;
  res._ended = ended;

  res.writeHead = vi.fn((code: number, hdrs?: Record<string, string>) => {
    res._statusCode = code;
    if (hdrs) Object.assign(res._headers, hdrs);
    return res;
  }) as unknown as ServerResponse['writeHead'];

  res.write = vi.fn((chunk: string) => {
    written.push(chunk);
    return true;
  }) as unknown as ServerResponse['write'];

  res.end = vi.fn(() => {
    ended = true;
    res._ended = true;
    res.writableEnded = true;
    return res;
  }) as unknown as ServerResponse['end'];

  res.writableEnded = false;
  res.destroyed = false;

  return res;
}

/** Make a mock OutputCollector with controllable snapshot/active workers */
function makeMockCollector(overrides: {
  snapshot?: ReturnType<OutputCollector['getSnapshot']>;
  activeWorkers?: string[];
} = {}): OutputCollector {
  const collector = new OutputCollector('/fake-root');
  (collector.getSnapshot as ReturnType<typeof vi.fn>).mockReturnValue(
    overrides.snapshot ?? null,
  );
  (collector.getActiveWorkers as ReturnType<typeof vi.fn>).mockReturnValue(
    overrides.activeWorkers ?? [],
  );
  return collector;
}

// ─── writeSseEvent ────────────────────────────────────────────────────────────

describe('writeSseEvent', () => {
  it('writes correctly formatted SSE event', () => {
    const res = makeMockRes();
    const data = { taskId: 'task-001', lines: [] };

    const ok = writeSseEvent(res, 'output', data);

    expect(ok).toBe(true);
    expect(res._written).toHaveLength(1);
    const raw = res._written[0];
    expect(raw).toContain('event: output\n');
    expect(raw).toContain(`data: ${JSON.stringify(data)}\n\n`);
  });

  it('returns false when response is already ended', () => {
    const res = makeMockRes();
    res.writableEnded = true;

    const ok = writeSseEvent(res, 'output', { taskId: 'x' });

    expect(ok).toBe(false);
    expect(res._written).toHaveLength(0);
  });

  it('returns false when response is destroyed', () => {
    const res = makeMockRes();
    res.destroyed = true;

    const ok = writeSseEvent(res, 'error', { message: 'oops' });

    expect(ok).toBe(false);
  });

  it('serializes complex payload as JSON', () => {
    const res = makeMockRes();
    const data: SnapshotEvent = {
      taskId: 'task-001',
      snapshot: {
        workerId: 'w-001',
        taskId: 'task-001',
        lines: [{ timestamp: '2026-01-01T00:00:00Z', line: 'hello', stream: 'stdout' }],
        totalLinesReceived: 1,
        droppedLines: 0,
      },
    };

    writeSseEvent(res, 'snapshot', data);

    const raw = res._written[0];
    const parsed = JSON.parse(raw.split('data: ')[1].split('\n\n')[0]) as SnapshotEvent;
    expect(parsed.snapshot.lines).toHaveLength(1);
    expect(parsed.snapshot.lines[0].line).toBe('hello');
  });
});

// ─── writeSseHeaders ─────────────────────────────────────────────────────────

describe('writeSseHeaders', () => {
  it('sets Content-Type to text/event-stream', () => {
    const res = makeMockRes();
    writeSseHeaders(res);

    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Content-Type': 'text/event-stream' }),
    );
  });

  it('sets Cache-Control to no-cache', () => {
    const res = makeMockRes();
    writeSseHeaders(res);

    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Cache-Control': 'no-cache' }),
    );
  });

  it('sets Connection to keep-alive', () => {
    const res = makeMockRes();
    writeSseHeaders(res);

    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ Connection: 'keep-alive' }),
    );
  });
});

// ─── parseStreamQuery ─────────────────────────────────────────────────────────

describe('parseStreamQuery', () => {
  it('parses taskId from query string', () => {
    const req = makeMockReq('/api/output-stream?taskId=task-001');
    const result = parseStreamQuery(req);

    expect(result).not.toBeNull();
    expect(result?.taskId).toBe('task-001');
  });

  it('parses taskId and sprintId together', () => {
    const req = makeMockReq('/api/output-stream?taskId=task-042&sprintId=sprint-139');
    const result = parseStreamQuery(req);

    expect(result?.taskId).toBe('task-042');
    expect(result?.sprintId).toBe('sprint-139');
  });

  it('returns null when taskId is missing', () => {
    const req = makeMockReq('/api/output-stream?sprintId=sprint-139');
    const result = parseStreamQuery(req);

    expect(result).toBeNull();
  });

  it('returns null when there is no query string', () => {
    const req = makeMockReq('/api/output-stream');
    const result = parseStreamQuery(req);

    expect(result).toBeNull();
  });

  it('returns null when taskId is empty string', () => {
    const req = makeMockReq('/api/output-stream?taskId=');
    const result = parseStreamQuery(req);

    expect(result).toBeNull();
  });

  it('trims whitespace from taskId', () => {
    const req = makeMockReq('/api/output-stream?taskId=%20task-001%20');
    const result = parseStreamQuery(req);

    expect(result?.taskId).toBe('task-001');
  });

  it('leaves sprintId undefined when not provided', () => {
    const req = makeMockReq('/api/output-stream?taskId=task-001');
    const result = parseStreamQuery(req);

    expect(result?.sprintId).toBeUndefined();
  });

  it('handles req.url being undefined', () => {
    const req = makeMockReq('');
    (req as { url: undefined }).url = undefined;
    const result = parseStreamQuery(req);

    expect(result).toBeNull();
  });
});

// ─── isOutputStreamRequest ────────────────────────────────────────────────────

describe('isOutputStreamRequest', () => {
  it('returns true for GET /api/output-stream', () => {
    const req = makeMockReq('/api/output-stream?taskId=task-001');
    expect(isOutputStreamRequest(req)).toBe(true);
  });

  it('returns true without query string', () => {
    const req = makeMockReq('/api/output-stream');
    expect(isOutputStreamRequest(req)).toBe(true);
  });

  it('returns false for other paths', () => {
    const req = makeMockReq('/api/status');
    expect(isOutputStreamRequest(req)).toBe(false);
  });

  it('returns false for POST method', () => {
    const req = makeMockReq('/api/output-stream?taskId=task-001');
    (req as { method: string }).method = 'POST';
    expect(isOutputStreamRequest(req)).toBe(false);
  });

  it('returns false for partial path match', () => {
    const req = makeMockReq('/api/output-stream-extra');
    expect(isOutputStreamRequest(req)).toBe(false);
  });
});

// ─── handleOutputStream ──────────────────────────────────────────────────────

describe('handleOutputStream', () => {
  let req: IncomingMessage;
  let res: ReturnType<typeof makeMockRes>;
  let cleanupFns: Array<() => void>;

  beforeEach(() => {
    req = makeMockReq('/api/output-stream?taskId=task-001');
    res = makeMockRes();
    cleanupFns = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupFns.forEach(fn => fn());
    vi.useRealTimers();
  });

  it('returns 400 when taskId is missing', () => {
    const req400 = makeMockReq('/api/output-stream');
    const res400 = makeMockRes();
    const collector = makeMockCollector();

    handleOutputStream(req400, res400, collector);

    expect(res400.writeHead).toHaveBeenCalledWith(400, expect.objectContaining({
      'Content-Type': 'application/json',
    }));
    expect(res400.end).toHaveBeenCalled();
  });

  it('sends snapshot event on connect when collector has data', () => {
    const collector = makeMockCollector({
      snapshot: {
        workerId: 'task-001',
        taskId: 'task-001',
        lines: [{ timestamp: '2026-01-01T00:00:00Z', line: 'first line', stream: 'stdout' }],
        totalLinesReceived: 1,
        droppedLines: 0,
      },
      activeWorkers: ['task-001'],
    });

    const cleanup = handleOutputStream(req, res, collector, { pollIntervalMs: 100 });
    cleanupFns.push(cleanup);

    // Should have written SSE headers + snapshot event
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'Content-Type': 'text/event-stream',
    }));
    expect(res._written.some(w => w.includes('event: snapshot'))).toBe(true);
    expect(res._written.some(w => w.includes('first line'))).toBe(true);
    cleanup();
  });

  it('sends empty snapshot when worker not registered', () => {
    const collector = makeMockCollector({
      snapshot: null,
      activeWorkers: [],
    });

    const cleanup = handleOutputStream(req, res, collector, { pollIntervalMs: 100 });
    cleanupFns.push(cleanup);

    // Should still send snapshot event with empty lines
    expect(res._written.some(w => w.includes('event: snapshot'))).toBe(true);
    const snapshotEvent = res._written.find(w => w.includes('event: snapshot'));
    const dataLine = snapshotEvent?.split('data: ')[1]?.split('\n\n')[0];
    const parsed = JSON.parse(dataLine ?? '{}') as SnapshotEvent;
    expect(parsed.snapshot.lines).toHaveLength(0);
    cleanup();
  });

  it('sends output event when new lines arrive during polling', () => {
    let callCount = 0;
    const collector = makeMockCollector({ activeWorkers: ['task-001'] });

    // First call (snapshot): 1 line. Second call (poll): 3 lines.
    (collector.getSnapshot as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          workerId: 'task-001', taskId: 'task-001',
          lines: [{ timestamp: 'ts', line: 'line1', stream: 'stdout' as const }],
          totalLinesReceived: 1, droppedLines: 0,
        };
      }
      return {
        workerId: 'task-001', taskId: 'task-001',
        lines: [
          { timestamp: 'ts', line: 'line1', stream: 'stdout' as const },
          { timestamp: 'ts', line: 'line2', stream: 'stdout' as const },
          { timestamp: 'ts', line: 'line3', stream: 'stdout' as const },
        ],
        totalLinesReceived: 3, droppedLines: 0,
      };
    });

    const cleanup = handleOutputStream(req, res, collector, { pollIntervalMs: 100 });
    cleanupFns.push(cleanup);

    // Advance timer to trigger one poll
    vi.advanceTimersByTime(150);

    expect(res._written.some(w => w.includes('event: output'))).toBe(true);
    const outputEvent = res._written.find(w => w.includes('event: output'));
    const dataLine = outputEvent?.split('data: ')[1]?.split('\n\n')[0];
    const parsed = JSON.parse(dataLine ?? '{}') as OutputStreamEvent;
    expect(parsed.taskId).toBe('task-001');
    expect(parsed.totalReceived).toBe(3);
    cleanup();
  });

  it('sends done event when worker leaves active workers list', () => {
    const collector = makeMockCollector({ activeWorkers: [] });
    (collector.getSnapshot as ReturnType<typeof vi.fn>).mockReturnValue({
      workerId: 'task-001', taskId: 'task-001',
      lines: [],
      totalLinesReceived: 0, droppedLines: 0,
    });

    const cleanup = handleOutputStream(req, res, collector, { pollIntervalMs: 100 });
    cleanupFns.push(cleanup);

    // Advance timer to trigger poll
    vi.advanceTimersByTime(150);

    expect(res._written.some(w => w.includes('event: done'))).toBe(true);
    cleanup();
  });

  it('closes connection when client disconnects (req close event)', () => {
    const collector = makeMockCollector({ activeWorkers: ['task-001'] });
    (collector.getSnapshot as ReturnType<typeof vi.fn>).mockReturnValue({
      workerId: 'task-001', taskId: 'task-001',
      lines: [], totalLinesReceived: 0, droppedLines: 0,
    });

    const cleanup = handleOutputStream(req, res, collector, { pollIntervalMs: 100 });
    cleanupFns.push(cleanup);

    // Simulate client disconnect
    (req as EventEmitter).emit('close');

    expect(res.end).toHaveBeenCalled();
  });

  it('closes connection after maxConnectionMs', () => {
    const collector = makeMockCollector({ activeWorkers: ['task-001'] });
    (collector.getSnapshot as ReturnType<typeof vi.fn>).mockReturnValue({
      workerId: 'task-001', taskId: 'task-001',
      lines: [], totalLinesReceived: 0, droppedLines: 0,
    });

    const cleanup = handleOutputStream(req, res, collector, {
      pollIntervalMs: 100,
      maxConnectionMs: 300,
    });
    cleanupFns.push(cleanup);

    vi.advanceTimersByTime(350);

    // Should have received a "done" event with timeout reason
    const doneEvent = res._written.find(w => w.includes('event: done'));
    expect(doneEvent).toBeDefined();
    const dataLine = doneEvent?.split('data: ')[1]?.split('\n\n')[0];
    const parsed = JSON.parse(dataLine ?? '{}') as { taskId: string; reason?: string };
    expect(parsed.reason).toBe('max-connection-timeout');
  });

  it('returned cleanup function stops polling', () => {
    const collector = makeMockCollector({ activeWorkers: ['task-001'] });
    (collector.getSnapshot as ReturnType<typeof vi.fn>).mockReturnValue({
      workerId: 'task-001', taskId: 'task-001',
      lines: [], totalLinesReceived: 0, droppedLines: 0,
    });

    const cleanup = handleOutputStream(req, res, collector, { pollIntervalMs: 100 });

    const writeCount = res._written.length;
    cleanup();

    // Advance timer — should not write more after cleanup
    vi.advanceTimersByTime(500);
    expect(res._written.length).toBe(writeCount);
  });
});
