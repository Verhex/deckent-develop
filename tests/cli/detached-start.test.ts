import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  spawnDetachedDeckent,
  buildFlowStartSpawn,
  type DetachedSpawnFn,
  type DetachedChildHandle,
} from '../../src/cli/helpers/detached-start.js';
import { LIVE_TRACE_ENV } from '../../src/core/config.js';
import {
  createCliToolDispatcher,
  isDetachedCommandClass,
  type CliToolSpawnFn,
} from '../../src/cli/commands/chat-tool-bridge.js';

// All tests inject a fake spawn — no real subprocess is ever launched, so the
// suite is hermetic. spawnDetachedDeckent itself still does real fs I/O
// (mkdir + open the log file), so every test runs inside a tmpdir project
// root and cleans up afterward (no writes to the real repo's .deckent/).

describe('spawnDetachedDeckent — detached-start.ts', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-detached-start-test-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function fakeChild(pid: number | undefined): { handle: DetachedChildHandle; unref: ReturnType<typeof vi.fn> } {
    const unref = vi.fn();
    return { handle: { pid, unref }, unref };
  }

  it('spawns node with the resolved entry.js + argv, detached + windowsHide, stdio piped to the log fd', () => {
    const { handle, unref } = fakeChild(4242);
    const spawnFn = vi.fn().mockReturnValue(handle) as unknown as DetachedSpawnFn;

    const result = spawnDetachedDeckent(['start', '--force'], { projectRoot, spawnFn });

    expect(spawnFn).toHaveBeenCalledTimes(1);
    const [command, args, options] = (spawnFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(command).toBe(process.execPath);
    expect(args[0]).toMatch(/entry\.js$/);
    expect(args.slice(1)).toEqual(['start', '--force']);
    expect(options.detached).toBe(true);
    expect(options.windowsHide).toBe(true);
    expect(options.cwd).toBe(projectRoot);
    expect(options.stdio[0]).toBe('ignore');
    expect(typeof options.stdio[1]).toBe('number');
    // stdout and stderr share the same fd — both redirect to one log file.
    expect(options.stdio[2]).toBe(options.stdio[1]);

    expect(unref).toHaveBeenCalledTimes(1);
    expect(result.pid).toBe(4242);
  });

  it('returns a log path under <projectRoot>/.deckent/recently-works/<cmd>-<timestamp>.log, and the file exists on disk', () => {
    const { handle } = fakeChild(99);
    const spawnFn = vi.fn().mockReturnValue(handle) as unknown as DetachedSpawnFn;

    const result = spawnDetachedDeckent(['start'], { projectRoot, spawnFn });

    expect(result.logPath).toMatch(/[/\\]\.deckent[/\\]recently-works[/\\]start-\d+\.log$/);
    expect(result.logPath.startsWith(projectRoot)).toBe(true);
    expect(existsSync(result.logPath)).toBe(true);
  });

  it('sanitizes an unsafe argv[0] into the log filename', () => {
    const { handle } = fakeChild(1);
    const spawnFn = vi.fn().mockReturnValue(handle) as unknown as DetachedSpawnFn;

    const result = spawnDetachedDeckent(['weird cmd/../name'], { projectRoot, spawnFn });

    expect(result.logPath).toMatch(/recently-works[/\\]weird_cmd_+name-\d+\.log$/);
  });

  it('returns pid: null when the child handle reports no pid', () => {
    const { handle } = fakeChild(undefined);
    const spawnFn = vi.fn().mockReturnValue(handle) as unknown as DetachedSpawnFn;

    const result = spawnDetachedDeckent(['run', 'do a thing'], { projectRoot, spawnFn });

    expect(result.pid).toBeNull();
  });

  it('defaults projectRoot to process.cwd() when omitted', () => {
    const { handle } = fakeChild(1);
    const spawnFn = vi.fn().mockReturnValue(handle) as unknown as DetachedSpawnFn;
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);
    try {
      const result = spawnDetachedDeckent(['start'], { spawnFn });
      expect(result.logPath.startsWith(projectRoot)).toBe(true);
    } finally {
      cwdSpy.mockRestore();
    }
  });

  // ── 583/N5 TRACE-FLIP: interactive-origin env twin ────────────────────────

  it('liveTrace: true → child env carries DECKENT_LIVE_TRACE=1 (interactive-origin marker)', () => {
    const { handle } = fakeChild(7);
    const spawnFn = vi.fn().mockReturnValue(handle) as unknown as DetachedSpawnFn;

    spawnDetachedDeckent(['start'], { projectRoot, spawnFn, liveTrace: true });

    const [, , options] = (spawnFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.env[LIVE_TRACE_ENV]).toBe('1');
  });

  it('liveTrace omitted → env twin ABSENT (programmatic default pinned: SDK/MCP spawns stay off)', () => {
    const { handle } = fakeChild(7);
    const spawnFn = vi.fn().mockReturnValue(handle) as unknown as DetachedSpawnFn;
    // Hygiene: the parent process itself must not leak the twin into this pin.
    const saved = process.env[LIVE_TRACE_ENV];
    delete process.env[LIVE_TRACE_ENV];
    try {
      spawnDetachedDeckent(['start'], { projectRoot, spawnFn });
      const [, , options] = (spawnFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(LIVE_TRACE_ENV in options.env).toBe(false);
    } finally {
      if (saved !== undefined) process.env[LIVE_TRACE_ENV] = saved;
    }
  });
});

// ─── buildFlowStartSpawn — the ONE flow-start authoring point ───────────────

describe('buildFlowStartSpawn — argv contract + interactive live-trace (583/N5)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-flow-start-test-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('spawns the canonical exact-start argv, carries the live-trace twin, and returns the child pid', () => {
    const unref = vi.fn();
    const spawnFn = vi.fn().mockReturnValue({ pid: 11, unref }) as unknown as DetachedSpawnFn;

    const spawnStart = buildFlowStartSpawn(projectRoot, 3, 'digest-abc', spawnFn);
    const result = spawnStart({
      capability: {
        flowId: 'flow-xyz',
        attemptId: 'attempt-1',
        ownerNonce: 'owner-1',
      },
    });

    const [command, args, options] = (spawnFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(command).toBe(process.execPath);
    expect(args.slice(1)).toEqual([
      'start', '--flow-id', 'flow-xyz', '--revision', '3', '--plan-digest', 'digest-abc',
      '--exact-attempt-id', 'attempt-1',
      '--exact-owner-nonce', 'owner-1',
      '--exact-log-ref', expect.stringMatching(/recently-works[/\\]start-flow-xyz-\d+\.log$/),
    ]);
    // Flow-start IS the human seal — every spawn built here streams live.
    expect(options.env[LIVE_TRACE_ENV]).toBe('1');
    expect(result).toEqual({ pid: 11 });
  });
});

// ─── chat-tool-bridge routing: detached vs synchronous ─────────────────────

describe('isDetachedCommandClass — chat-tool-bridge.ts', () => {
  it('is true for start / run / process submit', () => {
    expect(isDetachedCommandClass(['start'])).toBe(true);
    expect(isDetachedCommandClass(['start', '--force'])).toBe(true);
    expect(isDetachedCommandClass(['run', 'fix the bug'])).toBe(true);
    expect(isDetachedCommandClass(['process', 'submit', 'do a thing'])).toBe(true);
  });

  it('is false for status, config, kill, and process status/result', () => {
    expect(isDetachedCommandClass(['status'])).toBe(false);
    expect(isDetachedCommandClass(['config'])).toBe(false);
    expect(isDetachedCommandClass(['kill'])).toBe(false);
    expect(isDetachedCommandClass(['process', 'status', 'exec-1'])).toBe(false);
    expect(isDetachedCommandClass(['process', 'result', 'exec-1'])).toBe(false);
  });
});

describe('createCliToolDispatcher — detached routing (358-003)', () => {
  it('deckent_start → routes through spawnDetachedFn, never touches the synchronous spawnFn', async () => {
    const spawnFn = vi.fn() as unknown as CliToolSpawnFn;
    const spawnDetachedFn = vi.fn().mockReturnValue({ pid: 555, logPath: '/tmp/x/.deckent/recently-works/start-1.log' });
    const d = createCliToolDispatcher({ spawnFn, spawnDetachedFn });

    const out = await d.dispatch('deckent_start', {});

    expect(spawnDetachedFn).toHaveBeenCalledWith(['start'], expect.objectContaining({}));
    expect(spawnFn).not.toHaveBeenCalled();
    expect(out).toContain('555');
    expect(out).toContain('/tmp/x/.deckent/recently-works/start-1.log');
  });

  it('deckent_run → routes through spawnDetachedFn with the resolved run argv', async () => {
    const spawnFn = vi.fn() as unknown as CliToolSpawnFn;
    const spawnDetachedFn = vi.fn().mockReturnValue({ pid: 556, logPath: '/tmp/x/.deckent/recently-works/run-1.log' });
    const d = createCliToolDispatcher({ spawnFn, spawnDetachedFn });

    const out = await d.dispatch('deckent_run', { description: 'fix the bug', model: 'sonnet' });

    expect(spawnDetachedFn).toHaveBeenCalledWith(['run', 'fix the bug', '--model', 'sonnet'], expect.objectContaining({}));
    expect(spawnFn).not.toHaveBeenCalled();
    expect(out).toContain('556');
  });

  it('deckent_process submit → routes through spawnDetachedFn', async () => {
    const spawnFn = vi.fn() as unknown as CliToolSpawnFn;
    const spawnDetachedFn = vi.fn().mockReturnValue({ pid: 557, logPath: '/tmp/x/.deckent/recently-works/process-1.log' });
    const d = createCliToolDispatcher({ spawnFn, spawnDetachedFn });

    const out = await d.dispatch('deckent_process', { action: 'submit', description: 'submit this' });

    expect(spawnDetachedFn).toHaveBeenCalledWith(['process', 'submit', 'submit this'], expect.objectContaining({}));
    expect(spawnFn).not.toHaveBeenCalled();
    expect(out).toContain('557');
  });

  it('deckent_process status → stays on the synchronous spawnFn path (read-only poll)', async () => {
    const spawnFn = vi.fn().mockResolvedValue('{"status":"done"}') as unknown as CliToolSpawnFn;
    const spawnDetachedFn = vi.fn();
    const d = createCliToolDispatcher({ spawnFn, spawnDetachedFn });

    const out = await d.dispatch('deckent_process', { action: 'status', executionId: 'exec-1' });

    expect(spawnFn).toHaveBeenCalledWith(['process', 'status', 'exec-1']);
    expect(spawnDetachedFn).not.toHaveBeenCalled();
    expect(out).toBe('{"status":"done"}');
  });

  it('deckent_status → unaffected, still routes through the synchronous spawnFn (goCriteria: sync path unchanged)', async () => {
    const spawnFn = vi.fn().mockResolvedValue('Sprint sprint-358 — running') as unknown as CliToolSpawnFn;
    const spawnDetachedFn = vi.fn();
    const d = createCliToolDispatcher({ spawnFn, spawnDetachedFn });

    const out = await d.dispatch('deckent_status', {});

    expect(spawnFn).toHaveBeenCalledWith(['status']);
    expect(spawnDetachedFn).not.toHaveBeenCalled();
    expect(out).toBe('Sprint sprint-358 — running');
  });

  it('deckent_run without a description → tool-not-allowed, no spawn at all', async () => {
    const spawnFn = vi.fn() as unknown as CliToolSpawnFn;
    const spawnDetachedFn = vi.fn();
    const d = createCliToolDispatcher({ spawnFn, spawnDetachedFn });

    const out = await d.dispatch('deckent_run', {});

    expect(out).toBe('[mcp-error] tool not allowed: deckent_run');
    expect(spawnFn).not.toHaveBeenCalled();
    expect(spawnDetachedFn).not.toHaveBeenCalled();
  });

  it('detachedLabels override replaces the English defaults', async () => {
    const spawnFn = vi.fn() as unknown as CliToolSpawnFn;
    const spawnDetachedFn = vi.fn().mockReturnValue({ pid: 1, logPath: '/tmp/x.log' });
    const d = createCliToolDispatcher({
      spawnFn,
      spawnDetachedFn,
      detachedLabels: { started: 'Başlatıldı', trackHint: '/status ya da live-footer ile izleyin' },
    });

    const out = await d.dispatch('deckent_start', {});

    expect(out).toContain('Başlatıldı');
    expect(out).toContain('/status ya da live-footer ile izleyin');
  });

  it('spawnDetachedFn throw → tagged mcp-error, never throws out of dispatch', async () => {
    const spawnFn = vi.fn() as unknown as CliToolSpawnFn;
    const spawnDetachedFn = vi.fn().mockImplementation(() => { throw new Error('ENOSPC'); });
    const d = createCliToolDispatcher({ spawnFn, spawnDetachedFn });

    const out = await d.dispatch('deckent_start', {});

    expect(out).toBe('[mcp-error] deckent_start: ENOSPC');
  });
});
