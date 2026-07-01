// ═══ WLT-EMIT tests — WORKER-LIVE-TRACE progress-stream writer (355-001) ═══
//
// Covers ADR-G-025 §4 (WORKER-LIVE-TRACE): the agentic runner appends ordered
// step events to `.tasks/task-{id}.progress.jsonl` when `liveTrace.enabled`
// is set, and performs ZERO fs I/O (flag-off byte-identical) otherwise.
//
// Hermetic: tmpdir projectRoot, scripted fetchImpl, no real network/spawn.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runAgenticWorker,
  WLT_STEP,
  type AgenticRunnerOptions,
  type WltProgressEvent,
} from '../../src/agents/agentic-worker-runner.js';
import type { McpToolDispatcher } from '../../src/cli/commands/chat-native.js';

// ─── Test helpers (mirrors tests/agents/agentic-worker-runner.test.ts) ──────

function scriptFetch(bodies: unknown[]): typeof fetch {
  let i = 0;
  return (async () => {
    const next = bodies[Math.min(i, bodies.length - 1)];
    i++;
    return new Response(JSON.stringify(next), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

function chatResp(
  toolCalls: { name: string; args: Record<string, unknown>; id?: string }[],
  content = '',
): unknown {
  return {
    message: {
      role: 'assistant',
      content,
      tool_calls: toolCalls.map((c, idx) => ({
        id: c.id ?? `call-${idx}`,
        function: { name: c.name, arguments: c.args },
      })),
    },
  };
}

function buildOpts(
  projectRoot: string,
  overrides: Partial<AgenticRunnerOptions> = {},
): AgenticRunnerOptions {
  return {
    taskId: 'wlt-001',
    model: 'qwen3.6:27b',
    host: 'http://localhost:11434',
    prompt: 'Do the task.',
    scope: {
      directories: ['src/'],
      filesWrite: ['allowed.ts'],
      filesRead: [],
    },
    goNogo: {
      goCriteria: 'file written',
      noGoCriteria: 'nothing written',
      techDebtAcceptable: 'minor',
    },
    projectRoot,
    ...overrides,
  };
}

/** No-real-subprocess dispatcher — run_bash/write_file calls never touch disk
 * or spawn a real process; only used where the test cares about progress-event
 * ordering, not actual tool side-effects (those are covered by
 * tests/agents/agentic-worker-runner.test.ts). */
function fakeDispatcher(): McpToolDispatcher {
  return {
    async dispatch(name) {
      if (name === 'write_file' || name === 'edit_file') return 'ok';
      if (name === 'run_bash') return '[exit 0]';
      return `[mcp-error] unsupported in fake dispatcher: ${name}`;
    },
  };
}

function progressPath(projectRoot: string, taskId: string): string {
  return join(projectRoot, '.tasks', `task-${taskId}.progress.jsonl`);
}

function readProgressLines(projectRoot: string, taskId: string): WltProgressEvent[] {
  const raw = readFileSync(progressPath(projectRoot, taskId), 'utf-8');
  return raw
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line) as WltProgressEvent);
}

// ─── Suite setup ────────────────────────────────────────────────────────────

describe('WLT-EMIT — worker-runner progress-stream writer (ADR-G-025 §4, 355-001)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'wlt-emit-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  // ── flag-off: byte-identical, zero fs I/O ──
  it('flag-off (default, no liveTrace opt) never creates .progress.jsonl', async () => {
    const fetchImpl = scriptFetch([
      chatResp([{ name: 'write_file', args: { path: 'allowed.ts', content: 'x' } }]),
      chatResp([{ name: 'task_done', args: { selfAssessment: 'DONE', notes: 'ok' } }]),
    ]);

    const result = await runAgenticWorker(buildOpts(projectRoot, { fetchImpl }));

    expect(result.selfAssessment).toBe('DONE');
    expect(existsSync(progressPath(projectRoot, 'wlt-001'))).toBe(false);
    // Flag-off must not even create the .tasks dir as a side effect of live-trace.
    expect(existsSync(join(projectRoot, '.tasks'))).toBe(false);
  });

  it('flag-off explicit (liveTrace: { enabled: false }) also writes nothing', async () => {
    const fetchImpl = scriptFetch([
      chatResp([{ name: 'task_done', args: { selfAssessment: 'NO_GO', notes: 'nothing to do' } }]),
    ]);

    await runAgenticWorker(buildOpts(projectRoot, { fetchImpl, liveTrace: { enabled: false } }));

    expect(existsSync(progressPath(projectRoot, 'wlt-001'))).toBe(false);
  });

  // ── flag-on: ordered step events ──
  it('flag-on writes ordered start → edit-file → verify-running → result-writing events with strictly increasing seq', async () => {
    const fetchImpl = scriptFetch([
      chatResp([{ name: 'write_file', args: { path: 'allowed.ts', content: 'export const x = 1;\n' } }]),
      chatResp([{ name: 'run_bash', args: { cmd: 'npx vitest run tests/foo.test.ts' } }]),
      chatResp([{ name: 'task_done', args: { selfAssessment: 'DONE', notes: 'wrote + verified' } }]),
    ]);

    const result = await runAgenticWorker(
      buildOpts(projectRoot, { fetchImpl, dispatcher: fakeDispatcher(), liveTrace: { enabled: true } }),
    );

    expect(result.selfAssessment).toBe('DONE');
    expect(existsSync(progressPath(projectRoot, 'wlt-001'))).toBe(true);

    const events = readProgressLines(projectRoot, 'wlt-001');
    expect(events.map(e => e.step)).toEqual([
      WLT_STEP.START,
      WLT_STEP.EDIT_FILE,
      WLT_STEP.VERIFY_RUNNING,
      WLT_STEP.RESULT,
    ]);
    expect(events.map(e => e.seq)).toEqual([1, 2, 3, 4]);
    for (const e of events) {
      expect(typeof e.ts).toBe('string');
      expect(Number.isNaN(Date.parse(e.ts))).toBe(false);
      expect(typeof e.detail).toBe('string');
    }
    expect(events[1]?.detail).toContain('allowed.ts');
    expect(events[3]?.detail).toContain('DONE');
  });

  it('flag-on still emits start + result-writing even when the model never calls a tool', async () => {
    const fetchImpl = scriptFetch([chatResp([], 'I am done, no tool needed.')]);

    await runAgenticWorker(buildOpts(projectRoot, { fetchImpl, liveTrace: { enabled: true } }));

    const events = readProgressLines(projectRoot, 'wlt-001');
    expect(events.map(e => e.step)).toEqual([WLT_STEP.START, WLT_STEP.RESULT]);
    expect(events[1]?.detail).toContain('no_tool_calls');
  });

  it('flag-on emits result-writing on an api_error termination too', async () => {
    const throwingFetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const result = await runAgenticWorker(
      buildOpts(projectRoot, { fetchImpl: throwingFetch, liveTrace: { enabled: true } }),
    );

    expect(result.selfAssessment).toBe('NO_GO');
    expect(result.terminationReason).toBe('api_error');
    const events = readProgressLines(projectRoot, 'wlt-001');
    expect(events.map(e => e.step)).toEqual([WLT_STEP.START, WLT_STEP.RESULT]);
    expect(events[1]?.detail).toContain('api_error');
  });

  // ── fail-soft ──
  it('fail-soft: a write failure (progress path blocked by a same-named file) never throws or fails the run', async () => {
    // Pre-create `.tasks` as a FILE (not a dir) so mkdirSync inside the
    // emitter throws — the runner must swallow it and still complete.
    writeFileSync(join(projectRoot, '.tasks'), 'not-a-directory', 'utf-8');

    const fetchImpl = scriptFetch([
      chatResp([{ name: 'task_done', args: { selfAssessment: 'DONE', notes: 'fine' } }]),
    ]);

    await expect(
      runAgenticWorker(buildOpts(projectRoot, { fetchImpl, liveTrace: { enabled: true } })),
    ).resolves.toMatchObject({ selfAssessment: 'DONE' });
  });

  // ── no duplication with existing behavior ──
  it('does not change filesChanged/selfAssessment/terminationReason vs. flag-off for the same script', async () => {
    const script = () =>
      scriptFetch([
        chatResp([{ name: 'write_file', args: { path: 'allowed.ts', content: 'x' } }]),
        chatResp([{ name: 'task_done', args: { selfAssessment: 'DONE', notes: 'ok' } }]),
      ]);

    const off = await runAgenticWorker(buildOpts(projectRoot, { fetchImpl: script() }));

    const projectRoot2 = mkdtempSync(join(tmpdir(), 'wlt-emit-cmp-'));
    try {
      const on = await runAgenticWorker(
        buildOpts(projectRoot2, { fetchImpl: script(), liveTrace: { enabled: true } }),
      );
      expect(on.filesChanged).toEqual(off.filesChanged);
      expect(on.selfAssessment).toEqual(off.selfAssessment);
      expect(on.terminationReason).toEqual(off.terminationReason);
      expect(on.iterations).toEqual(off.iterations);
    } finally {
      rmSync(projectRoot2, { recursive: true, force: true });
    }
  });

  it('does not touch the .hb heartbeat file (that stays agentic-worker-entry.ts responsibility)', async () => {
    mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
    const hbPath = join(projectRoot, '.tasks', 'task-wlt-001.hb');
    writeFileSync(hbPath, JSON.stringify({ status: 'EXECUTING' }), 'utf-8');

    const fetchImpl = scriptFetch([
      chatResp([{ name: 'task_done', args: { selfAssessment: 'DONE', notes: 'ok' } }]),
    ]);

    await runAgenticWorker(buildOpts(projectRoot, { fetchImpl, liveTrace: { enabled: true } }));

    expect(readFileSync(hbPath, 'utf-8')).toBe(JSON.stringify({ status: 'EXECUTING' }));
  });
});
