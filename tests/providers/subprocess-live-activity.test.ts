// SURF-3 S2 — subprocess backend live tool-by-tool activity (flag-gated).
//
// Hermetic: an injected `spawnImpl` returns a mock child whose stdout is a
// Readable of Claude-CLI stream-json lines — no real subprocess. Asserts the
// flag-gated fork:
//   · OFF → byte-stable single-envelope path (usageEmitArgs, stdout→logFd), no activity.
//   · ON  → stream-json args, piped stdout, per-tool ACTIVITY + raw .log preserved.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SubprocessSpawnBackend, CLAUDE_SUBPROCESS_CONFIG } from '../../src/providers/subprocess.js';
import { CHANNELS } from '../../src/core/event-stream.js';
import { LocalSubprocessTestBackend } from '../helpers/local-subprocess-backend-fixture.js';

const TOOL_USE = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x', name: 'Edit', input: { file_path: 'a.ts' } }] } });
const RESULT = JSON.stringify({ type: 'result', usage: { input_tokens: 3, output_tokens: 2 } });

function mockChild(stdoutLines: string[]) {
  let stdout: (Readable & { unref: ReturnType<typeof vi.fn> }) | null = null;
  if (stdoutLines.length) {
    stdout = Readable.from(stdoutLines.map((l) => `${l}\n`)) as Readable & { unref: ReturnType<typeof vi.fn> };
    // Real child.stdout is a Socket (has unref); a Readable does not — add a spy
    // so the MOAT-2 stream-unref assertion can verify it is called (ADR-G-013).
    stdout.unref = vi.fn();
  }
  const child = {
    stdin: { write: vi.fn(), end: vi.fn() },
    stdout,
    once: vi.fn(),
    on: vi.fn(),
    kill: vi.fn(),
    unref: vi.fn(),
    pid: 4242,
  };
  child.once.mockReturnValue(child);
  return child;
}

function readActivity(root: string): Array<Record<string, unknown>> {
  const dir = join(root, '.deckent', 'recently-works');
  if (!existsSync(dir)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue;
    for (const line of readFileSync(join(dir, name), 'utf-8').split('\n')) {
      if (line.trim()) out.push(JSON.parse(line) as Record<string, unknown>);
    }
  }
  return out.filter((e) => e['channel'] === CHANNELS.ACTIVITY);
}

const drain = (): Promise<void> => new Promise((r) => setTimeout(r, 20));

describe('SubprocessSpawnBackend — live activity (SURF-3 S2)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'subproc-live-'));
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  function backend(spawnImpl: unknown): SubprocessSpawnBackend {
    return new LocalSubprocessTestBackend(root, {
      providerConfig: CLAUDE_SUBPROCESS_CONFIG,
      platform: 'linux',
      spawnImpl: spawnImpl as typeof import('node:child_process').spawn,
    });
  }

  it('flag OFF → single-envelope args + stdout FD-redirect, NO activity (byte-stable)', () => {
    const spawnImpl = vi.fn().mockReturnValue(mockChild([]));
    backend(spawnImpl).spawn('t1', 'opus' as never, 'prompt', { projectDir: root });

    const [, args, opts] = spawnImpl.mock.calls[0]!;
    expect(args).toContain('json');
    expect(args).not.toContain('stream-json');
    // stdout FD-redirected (a number FD), not 'pipe'.
    expect((opts as { stdio: unknown[] }).stdio[1]).not.toBe('pipe');
    expect(readActivity(root)).toHaveLength(0);
  });

  it('flag ON → stream-json args, piped stdout, per-tool ACTIVITY + raw .log preserved', async () => {
    const spawnImpl = vi.fn().mockReturnValue(mockChild([TOOL_USE, RESULT, TOOL_USE]));
    backend(spawnImpl).spawn('t2', 'opus' as never, 'prompt', {
      projectDir: root, liveTraceEnabled: true, sprintId: 'sprint-s2',
    });

    const [, args, opts] = spawnImpl.mock.calls[0]!;
    expect(args).toContain('stream-json');
    expect(args).toContain('--verbose');
    expect((opts as { stdio: unknown[] }).stdio[1]).toBe('pipe'); // stdout piped for the tee

    await drain();

    // Two tool_use lines → two 🔧 activity lines; the result/usage line emits nothing.
    const activity = readActivity(root);
    expect(activity).toHaveLength(2);
    expect((activity[0]!['payload'] as Record<string, unknown>)['line']).toBe('🔧 Edit(a.ts)');
    expect((activity[0]!['payload'] as Record<string, unknown>)['taskId']).toBe('t2');

    // Raw .log preserved (stream-json lines written verbatim — extractUsage scans them).
    const logPath = join(root, '.tasks', 'task-t2.log');
    expect(existsSync(logPath)).toBe(true);
    const log = readFileSync(logPath, 'utf-8');
    expect(log).toContain('"tool_use"');
    expect(log).toContain('"type":"result"'); // usage line still present for extractUsage
  });

  it('flag ON with no stdout still spawns cleanly (defensive: null stdout)', () => {
    const spawnImpl = vi.fn().mockReturnValue(mockChild([]));
    expect(() => backend(spawnImpl).spawn('t3', 'opus' as never, 'p', { projectDir: root, liveTraceEnabled: true }))
      .not.toThrow();
  });

  it('flag ON: the piped stdout is UNREF\'d so it never re-pins the coordinator loop (MOAT-2, ADR-G-013)', () => {
    // A flowing Readable holds its own loop-ref until EOF; without unref, a
    // worker lingering after .result would re-anchor the coordinator loop —
    // exactly the linger the child.unref() fixes for the child handle.
    const child = mockChild([TOOL_USE]);
    const spawnImpl = vi.fn().mockReturnValue(child);
    backend(spawnImpl).spawn('t4', 'opus' as never, 'p', { projectDir: root, liveTraceEnabled: true });
    expect(child.stdout!.unref).toHaveBeenCalledTimes(1);
  });
});
