/**
 * Tests for complete worker-stream → structured-JSONL capture.
 * Sprint 326 — Task 326-008 (Phase 4.2, spec §2.1).
 *
 * Faithful-regression intent: the PRE-FIX behavior captured only the final
 * summary (one opaque blob — see spawn-backend-docker.ts:1371-1381 / a 3-line
 * archived log). These tests feed a fake multi-event provider stream and assert
 * that EVERY event lands in the `.log` as its own JSONL line — so a "final
 * summary only" implementation (1 line, intermediate turns/tool_uses dropped)
 * is RED, and the complete-capture implementation is GREEN.
 *
 * Hermetic: all I/O under os.tmpdir(); async stream (Readable.from), no
 * spawnSync, no HOME leak.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  captureStreamToLog,
  type StreamCaptureResult,
} from '../../src/orchestra/spawn-backend-subprocess.js';
import type { LogEvent } from '../../src/core/log-event.js';

// ─── Fixtures ─────────────────────────────────────────────────────────

/**
 * A fake claude `--output-format stream-json` (NDJSON) worker stream:
 * 3 turns (message_start) + 2 tool_use (content_block_start) + 1 usage
 * (result), interleaved as a real run would emit them, usage last.
 * Per log-event.ts: message_start→turn, content_block_start[tool_use]→tool_use,
 * result→usage.
 */
const SIX_EVENT_CLAUDE_STREAM: string[] = [
  '{"type":"message_start","message":{"id":"msg_1","role":"assistant"}}',
  '{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tu_1","name":"Read"}}',
  '{"type":"message_start","message":{"id":"msg_2","role":"assistant"}}',
  '{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tu_2","name":"Edit"}}',
  '{"type":"message_start","message":{"id":"msg_3","role":"assistant"}}',
  '{"type":"result","subtype":"success","usage":{"input_tokens":100,"output_tokens":50}}',
];

/** Read a JSONL `.log` into parsed LogEvent rows (drops blank trailing line). */
function readLog(logPath: string): LogEvent[] {
  return readFileSync(logPath, 'utf-8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as LogEvent);
}

// ─── Suite ────────────────────────────────────────────────────────────

describe('captureStreamToLog — complete-stream capture (Phase 4.2)', () => {
  let dir: string;
  let logPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deckent-log-capture-'));
    logPath = join(dir, 'task-TEST.log');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes ALL 6 stream events as JSONL (not just the final summary)', async () => {
    const stream = Readable.from(SIX_EVENT_CLAUDE_STREAM.join('\n') + '\n');

    const res: StreamCaptureResult = await captureStreamToLog(stream, {
      logPath,
      provider: 'claude',
    });

    expect(existsSync(logPath)).toBe(true);
    const rows = readLog(logPath);

    // FAITHFUL: a final-only capture would have 1 line — assert all 6.
    expect(rows).toHaveLength(6);
    expect(res.eventsWritten).toBe(6);
  });

  it('captures the intermediate turn + tool_use events (faithful: not dropped)', async () => {
    const stream = Readable.from(SIX_EVENT_CLAUDE_STREAM.join('\n') + '\n');
    await captureStreamToLog(stream, { logPath, provider: 'claude' });

    const rows = readLog(logPath);
    const byType = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.type] = (acc[r.type] ?? 0) + 1;
      return acc;
    }, {});

    // Intermediate events a "final summary only" impl would lose:
    expect(byType.turn).toBe(3);
    expect(byType.tool_use).toBe(2);
    expect(byType.usage).toBe(1);
  });

  it('includes the final usage event (single source for token capture)', async () => {
    const stream = Readable.from(SIX_EVENT_CLAUDE_STREAM.join('\n') + '\n');
    const res = await captureStreamToLog(stream, { logPath, provider: 'claude' });

    const rows = readLog(logPath);
    // Last written event is the usage event.
    expect(rows[rows.length - 1].type).toBe('usage');

    // And it is surfaced on the result for Phase-2 token capture.
    expect(res.finalUsage).not.toBeNull();
    expect(res.finalUsage?.type).toBe('usage');
    const usageContent = res.finalUsage?.content as { usage?: { input_tokens?: number } };
    expect(usageContent.usage?.input_tokens).toBe(100);
  });

  it('stamps a monotonic seq + ISO ts on every JSONL line', async () => {
    const stream = Readable.from(SIX_EVENT_CLAUDE_STREAM.join('\n') + '\n');
    const res = await captureStreamToLog(stream, { logPath, provider: 'claude' });

    const rows = readLog(logPath);
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const r of rows) {
      expect(Number.isNaN(Date.parse(r.ts))).toBe(false);
    }
    // nextSeq continues past the last written event.
    expect(res.nextSeq).toBe(7);
  });

  it('honors startSeq for multi-stream (stdout+stderr) continuation', async () => {
    const stream = Readable.from(SIX_EVENT_CLAUDE_STREAM.join('\n') + '\n');
    const res = await captureStreamToLog(stream, {
      logPath,
      provider: 'claude',
      startSeq: 10,
    });

    const rows = readLog(logPath);
    expect(rows.map((r) => r.seq)).toEqual([10, 11, 12, 13, 14, 15]);
    expect(res.nextSeq).toBe(16);
  });

  it('never drops non-JSON / plain stderr lines (degrade to text)', async () => {
    const mixed = [
      '{"type":"message_start","message":{"id":"m","role":"assistant"}}',
      'plain stderr noise from the worker subprocess',
      '{"type":"result","subtype":"success","usage":{"input_tokens":1,"output_tokens":1}}',
    ];
    const stream = Readable.from(mixed.join('\n') + '\n');
    const res = await captureStreamToLog(stream, { logPath, provider: 'claude' });

    const rows = readLog(logPath);
    expect(rows).toHaveLength(3);
    expect(res.eventsWritten).toBe(3);
    // The non-JSON line is preserved as a text event, content intact.
    const textRow = rows.find((r) => r.type === 'text');
    expect(textRow).toBeDefined();
    expect(textRow?.content).toContain('plain stderr noise');
  });

  it('is robust to arbitrary chunk boundaries (lines split across chunks)', async () => {
    // Feed the same 6 events but split mid-line across chunks; readline must
    // reassemble by newline → still exactly 6 events.
    const blob = SIX_EVENT_CLAUDE_STREAM.join('\n') + '\n';
    const mid = Math.floor(blob.length / 2);
    const stream = Readable.from([blob.slice(0, mid), blob.slice(mid)]);

    const res = await captureStreamToLog(stream, { logPath, provider: 'claude' });
    expect(readLog(logPath)).toHaveLength(6);
    expect(res.eventsWritten).toBe(6);
  });

  it('fires the optional onEvent hook once per event (Phase-5 live tap)', async () => {
    const stream = Readable.from(SIX_EVENT_CLAUDE_STREAM.join('\n') + '\n');
    const seen: Array<{ type: string; seq: number }> = [];

    await captureStreamToLog(stream, {
      logPath,
      provider: 'claude',
      onEvent: (ev, seq) => seen.push({ type: ev.type, seq }),
    });

    expect(seen).toHaveLength(6);
    expect(seen.map((s) => s.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(seen[seen.length - 1].type).toBe('usage');
  });

  it('handles an empty stream without creating spurious events', async () => {
    const stream = Readable.from('');
    const res = await captureStreamToLog(stream, { logPath, provider: 'claude' });

    expect(res.eventsWritten).toBe(0);
    expect(res.finalUsage).toBeNull();
    expect(res.nextSeq).toBe(1);
  });
});
