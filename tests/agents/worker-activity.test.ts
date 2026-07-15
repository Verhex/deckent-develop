// ─── WORKER-LIVE-LOG (#582) — activity channel foundation pins ───────────────
// Contract: ≤80-char short-form line + detail payload on the EXISTING sprint
// event stream (WORKER→*:ACTIVITY), flag-gated on live_trace.enabled,
// fail-soft, and emitted from the heartbeat path so "what is the worker doing
// right now" is live — not end-of-task.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { emitWorkerActivity, clipActivityLine, ACTIVITY_LINE_MAX } from '../../src/agents/worker-activity.js';
import { writeHeartbeat, __resetLiveTraceCacheForTests } from '../../src/agents/worker.js';
import { CHANNELS } from '../../src/core/event-stream.js';

function readSprintEvents(root: string, sprintId: string): Array<Record<string, unknown>> {
  // event-stream writes JSONL under the recently-works dir — locate whichever
  // file carries this sprint id (path convention is the stream module's own).
  const candidates = [
    join(root, '.deckent', 'recently-works', `${sprintId}-events.jsonl`),
    join(root, '.deckent', 'runtime', 'events', `${sprintId}.jsonl`),
  ];
  for (const file of candidates) {
    if (existsSync(file)) {
      return readFileSync(file, 'utf-8')
        .split('\n')
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l) as Record<string, unknown>);
    }
  }
  // fallback: scan recently-works for any jsonl mentioning the sprint
  const dir = join(root, '.deckent', 'recently-works');
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.jsonl')) continue;
      const lines = readFileSync(join(dir, name), 'utf-8').split('\n').filter((l) => l.trim());
      const parsed = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
      if (parsed.some((e) => e['sprintId'] === sprintId || name.includes(sprintId))) return parsed;
    }
  }
  return [];
}

describe('worker-activity (#582 foundation)', () => {
  let root: string;
  const sprintId = 'sprint-582';

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wal-582-'));
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    __resetLiveTraceCacheForTests();
  });

  afterEach(() => {
    __resetLiveTraceCacheForTests();
    rmSync(root, { recursive: true, force: true });
  });

  it('clipActivityLine: ≤80 chars, whitespace-flattened, ellipsis on overflow', () => {
    expect(clipActivityLine('short  line\n with   gaps')).toBe('short line with gaps');
    const long = 'x'.repeat(200);
    const clipped = clipActivityLine(long);
    expect(clipped.length).toBe(ACTIVITY_LINE_MAX);
    expect(clipped.endsWith('…')).toBe(true);
  });

  it('disabled flag → zero events (cheap no-op)', () => {
    emitWorkerActivity(root, false, { taskId: 't-1', line: 'doing things', kind: 'status' }, sprintId);
    const events = readSprintEvents(root, sprintId);
    expect(events.filter((e) => e['channel'] === CHANNELS.ACTIVITY)).toHaveLength(0);
  });

  it('enabled → ACTIVITY event with clipped line + detail on the sprint stream', () => {
    emitWorkerActivity(root, true, {
      taskId: 't-1',
      workerId: 'w-1',
      line: `editing src/core/routing/verifier.ts ${'y'.repeat(100)}`,
      kind: 'file',
      detail: { currentFile: 'src/core/routing/verifier.ts' },
    }, sprintId);

    const events = readSprintEvents(root, sprintId).filter((e) => e['channel'] === CHANNELS.ACTIVITY);
    expect(events).toHaveLength(1);
    const payload = events[0]!['payload'] as Record<string, unknown>;
    expect((payload['line'] as string).length).toBeLessThanOrEqual(ACTIVITY_LINE_MAX);
    expect(payload['kind']).toBe('file');
    expect((payload['detail'] as Record<string, unknown>)['currentFile']).toBe('src/core/routing/verifier.ts');
  });

  it('heartbeat path emits a live status row when live_trace is enabled (the #582 core ask)', () => {
    writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify({ live_trace: { enabled: true } }), 'utf-8');

    writeHeartbeat(root, {
      taskId: 't-hb',
      workerId: 'w-hb',
      sequence: 3,
      status: 'working',
      currentAction: 'writing tests for verifier',
      filesChangedCount: 2,
      timestamp: new Date().toISOString(),
    } as never, sprintId);

    const events = readSprintEvents(root, sprintId).filter((e) => e['channel'] === CHANNELS.ACTIVITY);
    expect(events).toHaveLength(1);
    const payload = events[0]!['payload'] as Record<string, unknown>;
    expect(payload['line']).toContain('working');
    expect(payload['line']).toContain('writing tests');
    expect((payload['detail'] as Record<string, unknown>)['filesChangedCount']).toBe(2);
  });

  it('heartbeat path stays silent when live_trace is absent/false (flag-gated)', () => {
    writeHeartbeat(root, {
      taskId: 't-hb2', workerId: 'w', sequence: 1, status: 'working',
      currentAction: 'x', timestamp: new Date().toISOString(),
    } as never, sprintId);

    const events = readSprintEvents(root, sprintId).filter((e) => e['channel'] === CHANNELS.ACTIVITY);
    expect(events).toHaveLength(0);
    // the heartbeat itself still flows (existing behavior untouched)
    const heartbeats = readSprintEvents(root, sprintId).filter((e) => e['channel'] === CHANNELS.HEARTBEAT);
    expect(heartbeats).toHaveLength(1);
  });
});
