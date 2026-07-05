// Sprint 370 Task 370-007 — GET /api/evaluate-health (born-484 EVAL-OBS-DASH).
//
// `aggregateEvaluateHealth` is exercised with a fake in-memory event stream
// (no disk). `registerEvaluateHealthRoute` is exercised with a hermetic
// tmpdir fixture (mkdtempSync) holding hand-written sprint-N-events.jsonl
// files — mirrors tests/api/docs-health-endpoint.test.ts's tmpdir pattern.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ServerResponse } from 'node:http';
import {
  aggregateEvaluateHealth,
  listRecentSprintIds,
  parseSprintWindow,
  registerEvaluateHealthRoute,
  EVALUATE_HEALTH_CHANNELS,
  type EvaluateHealthResponse,
} from '../../src/api/evaluate-health-endpoint.js';

let dir: string;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function fakeRes(): { res: ServerResponse; status: () => number; json: () => unknown } {
  let statusCode = 0;
  let payload = '';
  const res = {
    writeHead: (s: number) => { statusCode = s; },
    end: (b: string) => { payload += b; },
  } as unknown as ServerResponse;
  return { res, status: () => statusCode, json: () => JSON.parse(payload) as unknown };
}

function eventLine(channel: string, timestamp: string, sequence: number): string {
  return JSON.stringify({
    timestamp,
    sequence,
    protocol_version: '1.0',
    source: 'brain',
    target: 'auditor',
    channel,
    payload: { timestamp },
  });
}

function writeSprintEvents(root: string, sprintId: string, lines: string[]): void {
  const dirPath = join(root, '.deckent', 'recently-works');
  mkdirSync(dirPath, { recursive: true });
  writeFileSync(join(dirPath, `${sprintId}-events.jsonl`), lines.join('\n') + '\n', 'utf-8');
}

// ─── aggregateEvaluateHealth (pure, fake event stream) ─────────────────────

describe('aggregateEvaluateHealth', () => {
  it('counts all 4 tracked channels and ignores unrelated ones', () => {
    const events = [
      { channel: EVALUATE_HEALTH_CHANNELS.EVALUATION_FAULT, timestamp: '2026-07-01T00:00:00.000Z' },
      { channel: EVALUATE_HEALTH_CHANNELS.EVALUATION_FAULT, timestamp: '2026-07-02T00:00:00.000Z' },
      { channel: EVALUATE_HEALTH_CHANNELS.EVALUATE_ABORTED, timestamp: '2026-07-03T00:00:00.000Z' },
      { channel: EVALUATE_HEALTH_CHANNELS.EVALUATE_PREMATURE, timestamp: '2026-07-04T00:00:00.000Z' },
      { channel: EVALUATE_HEALTH_CHANNELS.RESULT_CONTRACT_DRIFT, timestamp: '2026-07-05T00:00:00.000Z' },
      { channel: 'WORKER→BRAIN:RESULT', timestamp: '2026-07-06T00:00:00.000Z' },
    ];
    const summary = aggregateEvaluateHealth(events, 3);
    expect(summary.counts).toEqual({
      EVALUATION_FAULT: 2,
      EVALUATE_ABORTED: 1,
      EVALUATE_PREMATURE: 1,
      RESULT_CONTRACT_DRIFT: 1,
    });
    expect(summary.clean).toBe(false);
    expect(summary.sprintsScanned).toBe(3);
  });

  it('lastEventAt is the max timestamp among tracked-channel events only', () => {
    const events = [
      { channel: EVALUATE_HEALTH_CHANNELS.EVALUATION_FAULT, timestamp: '2026-07-01T00:00:00.000Z' },
      { channel: 'WORKER→BRAIN:RESULT', timestamp: '2026-07-09T00:00:00.000Z' },
      { channel: EVALUATE_HEALTH_CHANNELS.EVALUATE_ABORTED, timestamp: '2026-07-03T00:00:00.000Z' },
    ];
    const summary = aggregateEvaluateHealth(events, 1);
    expect(summary.lastEventAt).toBe('2026-07-03T00:00:00.000Z');
  });

  it('honest clean state when no tracked events are present', () => {
    const summary = aggregateEvaluateHealth([], 5);
    expect(summary.clean).toBe(true);
    expect(summary.lastEventAt).toBeNull();
    expect(summary.counts).toEqual({
      EVALUATION_FAULT: 0,
      EVALUATE_ABORTED: 0,
      EVALUATE_PREMATURE: 0,
      RESULT_CONTRACT_DRIFT: 0,
    });
  });
});

// ─── parseSprintWindow ──────────────────────────────────────────────────────

describe('parseSprintWindow', () => {
  it('defaults to 20 when absent, invalid, or non-positive', () => {
    expect(parseSprintWindow(null)).toBe(20);
    expect(parseSprintWindow('abc')).toBe(20);
    expect(parseSprintWindow('0')).toBe(20);
    expect(parseSprintWindow('-5')).toBe(20);
  });

  it('clamps to the 200 max', () => {
    expect(parseSprintWindow('99999')).toBe(200);
  });

  it('honors a valid in-range value', () => {
    expect(parseSprintWindow('5')).toBe(5);
  });
});

// ─── listRecentSprintIds (hermetic tmpdir) ─────────────────────────────────

describe('listRecentSprintIds', () => {
  it('returns [] when recently-works dir is absent', () => {
    dir = mkdtempSync(join(tmpdir(), 'eh-api-'));
    expect(listRecentSprintIds(dir, 20)).toEqual([]);
  });

  it('sorts by numeric sprint id descending and slices to N', () => {
    dir = mkdtempSync(join(tmpdir(), 'eh-api-'));
    for (const n of [360, 361, 362, 359]) {
      writeSprintEvents(dir, `sprint-${n}`, [eventLine('WORKER→BRAIN:RESULT', '2026-07-01T00:00:00.000Z', 1)]);
    }
    expect(listRecentSprintIds(dir, 2)).toEqual(['sprint-362', 'sprint-361']);
  });

  it('ignores the long-lived autonomous-events.jsonl stream', () => {
    dir = mkdtempSync(join(tmpdir(), 'eh-api-'));
    const dirPath = join(dir, '.deckent', 'recently-works');
    mkdirSync(dirPath, { recursive: true });
    writeFileSync(join(dirPath, 'autonomous-events.jsonl'), '', 'utf-8');
    writeSprintEvents(dir, 'sprint-370', [eventLine('WORKER→BRAIN:RESULT', '2026-07-01T00:00:00.000Z', 1)]);
    expect(listRecentSprintIds(dir, 20)).toEqual(['sprint-370']);
  });
});

// ─── registerEvaluateHealthRoute (hermetic tmpdir, fake req/res) ───────────

describe('registerEvaluateHealthRoute', () => {
  it('returns false for an unrelated URL', () => {
    dir = mkdtempSync(join(tmpdir(), 'eh-api-'));
    const { res } = fakeRes();
    expect(registerEvaluateHealthRoute('/api/other', res, dir)).toBe(false);
  });

  it('returns an honest clean 200 when no recently-works dir exists', () => {
    dir = mkdtempSync(join(tmpdir(), 'eh-api-'));
    const { res, status, json } = fakeRes();
    const handled = registerEvaluateHealthRoute('/api/evaluate-health', res, dir);
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const body = json() as EvaluateHealthResponse;
    expect(body.clean).toBe(true);
    expect(body.sprintsScanned).toBe(0);
    expect(body.lastEventAt).toBeNull();
  });

  it('aggregates counts across multiple sprint event streams on disk', () => {
    dir = mkdtempSync(join(tmpdir(), 'eh-api-'));
    writeSprintEvents(dir, 'sprint-368', [
      eventLine(EVALUATE_HEALTH_CHANNELS.EVALUATION_FAULT, '2026-07-01T00:00:00.000Z', 1),
      eventLine('WORKER→BRAIN:RESULT', '2026-07-01T00:01:00.000Z', 2),
    ]);
    writeSprintEvents(dir, 'sprint-369', [
      eventLine(EVALUATE_HEALTH_CHANNELS.RESULT_CONTRACT_DRIFT, '2026-07-02T00:00:00.000Z', 1),
    ]);
    const { res, status, json } = fakeRes();
    const handled = registerEvaluateHealthRoute('/api/evaluate-health', res, dir);
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const body = json() as EvaluateHealthResponse;
    expect(body.clean).toBe(false);
    expect(body.counts.EVALUATION_FAULT).toBe(1);
    expect(body.counts.RESULT_CONTRACT_DRIFT).toBe(1);
    expect(body.sprintsScanned).toBe(2);
    expect(body.lastEventAt).toBe('2026-07-02T00:00:00.000Z');
    expect(typeof body.generatedAt).toBe('string');
  });

  it('respects the ?n= window — only scans the N most recent sprint ids', () => {
    dir = mkdtempSync(join(tmpdir(), 'eh-api-'));
    writeSprintEvents(dir, 'sprint-100', [
      eventLine(EVALUATE_HEALTH_CHANNELS.EVALUATE_PREMATURE, '2026-06-01T00:00:00.000Z', 1),
    ]);
    writeSprintEvents(dir, 'sprint-101', [
      eventLine(EVALUATE_HEALTH_CHANNELS.EVALUATE_ABORTED, '2026-06-02T00:00:00.000Z', 1),
    ]);
    const { res, json } = fakeRes();
    registerEvaluateHealthRoute('/api/evaluate-health?n=1', res, dir);
    const body = json() as EvaluateHealthResponse;
    expect(body.sprintsScanned).toBe(1);
    expect(body.counts.EVALUATE_ABORTED).toBe(1);
    expect(body.counts.EVALUATE_PREMATURE).toBe(0);
  });
});
