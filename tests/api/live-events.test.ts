import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  startLiveEventBridge,
  formatLiveEventFrame,
  type LiveEvent,
  type LiveEventBridge,
} from '../../src/api/live-events.js';

// ─── Hermetic tmpdir harness ────────────────────────────────────
// Real fs.watch (no mocks) over a throwaway project dir — the bridge is an
// fs-watching component, so the test exercises the real watch→debounce→emit
// path. A low debounce keeps each assertion fast; waitFor polls so we never
// race the inotify callback.

const DEBOUNCE = 20;

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await sleep(15);
  }
}

describe('live-events bridge', () => {
  let root: string;
  let bridge: LiveEventBridge | null = null;
  let events: LiveEvent[];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-live-'));
    events = [];
  });

  afterEach(() => {
    bridge?.close();
    bridge = null;
    rmSync(root, { recursive: true, force: true });
  });

  function start(onEvent?: (e: LiveEvent) => void): void {
    bridge = startLiveEventBridge({
      projectRoot: root,
      debounceMs: DEBOUNCE,
      onEvent: onEvent ?? ((e) => events.push(e)),
    });
  }

  // ── 1. hb change → worker_heartbeat ──────────────────────────
  it('pushes a worker_heartbeat when a .hb file changes', async () => {
    mkdirSync(join(root, '.tasks'), { recursive: true });
    start();
    await sleep(40); // let the watcher attach

    writeFileSync(
      join(root, '.tasks', 'task-284-001.hb'),
      JSON.stringify({ taskId: '284-001', status: 'EXECUTING', currentAction: 'Coding live-events' }),
      'utf-8',
    );

    await waitFor(() => events.some((e) => e.type === 'worker_heartbeat'));
    const hb = events.find((e) => e.type === 'worker_heartbeat')!;
    expect(hb.taskId).toBe('284-001');
    expect(hb.status).toBe('EXECUTING');
    expect(hb.currentAction).toBe('Coding live-events');
    expect(typeof hb.ts).toBe('string');
  });

  // ── 2. result → worker_done ──────────────────────────────────
  it('pushes a worker_done when a .result file appears', async () => {
    mkdirSync(join(root, '.tasks'), { recursive: true });
    start();
    await sleep(40);

    writeFileSync(
      join(root, '.tasks', 'task-284-001.result'),
      JSON.stringify({ taskId: '284-001', selfAssessment: 'DONE' }),
      'utf-8',
    );

    await waitFor(() => events.some((e) => e.type === 'worker_done'));
    const done = events.find((e) => e.type === 'worker_done')!;
    expect(done.taskId).toBe('284-001');
  });

  // ── 3. jsonl tail → deckent_event ────────────────────────────
  it('tails the active sprint event-stream JSONL into deckent_event', async () => {
    mkdirSync(join(root, '.deckent', 'recently-works'), { recursive: true });
    writeFileSync(
      join(root, '.deckent', 'sprint-state.json'),
      JSON.stringify({ sprintId: 'sprint-test' }),
      'utf-8',
    );
    // Pre-existing file with one line — primed offset means it is NOT replayed.
    const jsonl = join(root, '.deckent', 'recently-works', 'sprint-test-events.jsonl');
    writeFileSync(jsonl, JSON.stringify({ sequence: 1, channel: 'OLD' }) + '\n', 'utf-8');

    start();
    await sleep(40);

    appendFileSync(
      jsonl,
      JSON.stringify({ sequence: 2, channel: 'WORKER→BRAIN:HEARTBEAT', payload: { taskId: '284-001' } }) + '\n',
      'utf-8',
    );

    await waitFor(() => events.some((e) => e.type === 'deckent_event'));
    const de = events.filter((e) => e.type === 'deckent_event');
    // History (sequence 1) was primed out; only the freshly-appended line flows.
    expect(de).toHaveLength(1);
    expect(de[0]!.event?.sequence).toBe(2);
    expect(de[0]!.event?.channel).toBe('WORKER→BRAIN:HEARTBEAT');
  });

  // ── 4a. missing dirs → no throw, returns a closeable handle ───
  it('starts without throwing when .tasks/ and .deckent/ do not exist', () => {
    expect(() => start()).not.toThrow();
    expect(bridge).not.toBeNull();
    expect(typeof bridge!.close).toBe('function');
    expect(() => bridge!.close()).not.toThrow();
  });

  // ── 4b. a throwing sink does not kill the bridge (serve stays up) ──
  it('survives a throwing onEvent sink — later events still flow', async () => {
    mkdirSync(join(root, '.tasks'), { recursive: true });
    let calls = 0;
    start(() => {
      calls += 1;
      throw new Error('simulated dead SSE client');
    });
    await sleep(40);

    writeFileSync(join(root, '.tasks', 'task-a.hb'), JSON.stringify({ taskId: 'a', status: 'EXECUTING' }), 'utf-8');
    await waitFor(() => calls >= 1);
    writeFileSync(join(root, '.tasks', 'task-b.hb'), JSON.stringify({ taskId: 'b', status: 'EXECUTING' }), 'utf-8');
    await waitFor(() => calls >= 2);

    // The first throw did not tear the bridge down — the second write reached the sink.
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  // ── 5. smoke-style bare filename (test-smoke.hb) still surfaces a heartbeat ──
  it('handles a non-task-prefixed hb fixture (smoke path)', async () => {
    mkdirSync(join(root, '.tasks'), { recursive: true });
    start();
    await sleep(40);

    // Matches the DIRECTIVES smoke: `.tasks/test-smoke.hb` (bare, may be non-JSON).
    writeFileSync(join(root, '.tasks', 'test-smoke.hb'), 'not-json-yet', 'utf-8');

    await waitFor(() => events.some((e) => e.type === 'worker_heartbeat'));
    const hb = events.find((e) => e.type === 'worker_heartbeat')!;
    expect(hb.taskId).toBe('test-smoke');
  });
});

// ─── Frame formatter (synchronous unit) ─────────────────────────
describe('formatLiveEventFrame', () => {
  it('emits a named SSE event field so typed pushes do not collide with the snapshot', () => {
    const frame = formatLiveEventFrame({
      type: 'worker_heartbeat',
      taskId: '284-001',
      status: 'EXECUTING',
      ts: '2026-06-12T00:00:00.000Z',
    });
    expect(frame).toMatch(/^event: worker_heartbeat\n/);
    expect(frame).toContain('data: {');
    expect(frame.endsWith('\n\n')).toBe(true);
    const dataLine = frame.split('\n').find((l) => l.startsWith('data: '))!;
    const parsed = JSON.parse(dataLine.slice('data: '.length)) as LiveEvent;
    expect(parsed.type).toBe('worker_heartbeat');
    expect(parsed.taskId).toBe('284-001');
  });

  it('formats a deckent_event frame with the embedded event', () => {
    const frame = formatLiveEventFrame({
      type: 'deckent_event',
      ts: '2026-06-12T00:00:00.000Z',
      event: {
        timestamp: '2026-06-12T00:00:00.000Z',
        sequence: 7,
        protocol_version: '1.0',
        source: 'worker',
        target: 'brain',
        channel: 'WORKER→BRAIN:HEARTBEAT',
        payload: { taskId: '284-001' },
      },
    });
    expect(frame).toMatch(/^event: deckent_event\n/);
    const dataLine = frame.split('\n').find((l) => l.startsWith('data: '))!;
    const parsed = JSON.parse(dataLine.slice('data: '.length)) as LiveEvent;
    expect(parsed.event?.sequence).toBe(7);
  });
});
