// ─── WORKER-LIVE-LOG (#582) — status --follow tüketicisi ─────────────────────
// readLatestActivity: the renderer's tail-scan over the sprint event JSONL —
// latest ACTIVITY line per task, torn-line tolerant, cheap (last 64KB only).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLatestActivity } from '../../src/cli/helpers/status-renderer.js';

const SPRINT = 'sprint-582';

function eventLine(taskId: string, line: string, seq: number): string {
  return JSON.stringify({
    timestamp: new Date(0).toISOString(), sequence: seq, protocol_version: '1.0',
    source: 'worker', target: '*', channel: 'WORKER→*:ACTIVITY',
    payload: { taskId, line, kind: 'status' },
  }) + '\n';
}

describe('readLatestActivity (#582 status consumer)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sla-'));
    mkdirSync(join(root, '.deckent', 'recently-works'), { recursive: true });
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('returns the LATEST line per task, in event order', () => {
    const file = join(root, '.deckent', 'recently-works', `${SPRINT}-events.jsonl`);
    appendFileSync(file, eventLine('t-1', 'planning', 1));
    appendFileSync(file, eventLine('t-2', 'reading files', 2));
    appendFileSync(file, eventLine('t-1', 'working — writing verifier tests', 3));
    // non-activity noise must be ignored
    appendFileSync(file, JSON.stringify({ channel: 'WORKER→BRAIN:HEARTBEAT', payload: { taskId: 't-1' } }) + '\n');
    // torn tail line must not break the scan
    appendFileSync(file, '{"channel":"WORKER→*:ACTIVITY","payload":{"taskId":"t-3"');

    const rows = readLatestActivity(root, SPRINT);
    expect(rows.find((r) => r.taskId === 't-1')?.line).toBe('working — writing verifier tests');
    expect(rows.find((r) => r.taskId === 't-2')?.line).toBe('reading files');
    expect(rows.find((r) => r.taskId === 't-3')).toBeUndefined();
  });

  it('missing file / empty sprint → empty list (fail-soft)', () => {
    expect(readLatestActivity(root, 'sprint-nope')).toEqual([]);
  });

  it('caps at maxTasks (feed stays box-sized)', () => {
    const file = join(root, '.deckent', 'recently-works', `${SPRINT}-events.jsonl`);
    for (let i = 0; i < 9; i++) appendFileSync(file, eventLine(`t-${i}`, `line ${i}`, i));
    expect(readLatestActivity(root, SPRINT, 5)).toHaveLength(5);
  });
});
