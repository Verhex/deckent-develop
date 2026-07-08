// tests/mcp/autonomous-start-honest.test.ts
//
// 387-026 (born-577, AUTONOMOUS-START-HONEST) — `deckent_autonomous` action=start
// used to only clear the stop marker and print "run `deckent autonomous start`
// from a terminal" — false-success in all but name. This suite proves the fix:
// action=start now EITHER really spawns the loop as a detached background
// process (spawned=true + pid, when autonomous.enabled=true and no loop is
// already alive) OR returns an honest, explicit spawned=false status with a
// reason (disabled config, already-running, or spawn failure) — never a
// misleading "success" when nothing actually started.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: (_tool: string, data: Record<string, unknown>) => ({ ...data }),
}));

vi.mock('../../src/cli/commands/autonomous.js', () => ({
  backlogAdd: vi.fn(),
  backlogList: vi.fn().mockReturnValue([]),
  backlogRemove: vi.fn(),
}));

vi.mock('../../src/orchestra/autonomous/approval-adapter.js', () => ({
  makeApprovalGate: vi.fn().mockReturnValue({
    pending: vi.fn().mockReturnValue([]),
    accept: vi.fn(),
    reject: vi.fn(),
  }),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { registerAutonomousTool } from '../../src/mcp/tools/autonomous.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

interface MockServer {
  tools: Map<string, { config: Record<string, unknown>; handler: ToolHandler }>;
  registerTool(name: string, config: Record<string, unknown>, handler: ToolHandler): void;
}

function createMockServer(): MockServer {
  const tools = new Map<string, { config: Record<string, unknown>; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name, config, handler) { tools.set(name, { config, handler }); },
  };
}

function parseResult(result: { content: Array<{ type: string; text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0].text);
}

const ROOT = '/tmp/test-project';

/** Path predicates mirroring src/mcp/tools/autonomous.ts's own path helpers. */
const isConfigPath = (p: string): boolean => p.endsWith('.deckent/config.json');
const isPidPath = (p: string): boolean => p.endsWith('loop.pid');
const isStopPath = (p: string): boolean => p.endsWith('/stop');

function fakeChild(pid: number | undefined): { pid: number | undefined; on: ReturnType<typeof vi.fn>; unref: ReturnType<typeof vi.fn> } {
  return { pid, on: vi.fn(), unref: vi.fn() };
}

describe('deckent_autonomous — start action (honest spawn)', () => {
  let server: MockServer;
  let handler: ToolHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    registerAutonomousTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
    handler = server.tools.get('deckent_autonomous')!.handler;
  });

  it('disabled config (default) → does NOT spawn, reports spawned=false honestly', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = await handler({ action: 'start', root: ROOT });
    const parsed = parseResult(result);

    expect(parsed.action).toBe('start');
    expect(parsed.spawned).toBe(false);
    expect(typeof parsed.message).toBe('string');
    expect((parsed.message as string).toLowerCase()).toContain('disabled');
    expect(vi.mocked(spawn)).not.toHaveBeenCalled();
    expect(result.isError).toBeUndefined();
  });

  it('enabled config, no existing loop → spawns for real (spawned=true + pid recorded)', async () => {
    const child = fakeChild(4242);
    vi.mocked(spawn).mockReturnValue(child as never);
    vi.mocked(existsSync).mockImplementation((p) => {
      const path = typeof p === 'string' ? p : '';
      return isConfigPath(path); // config exists; stop marker + pid file absent
    });
    vi.mocked(readFileSync).mockImplementation((p) => {
      const path = typeof p === 'string' ? p : '';
      if (isConfigPath(path)) return JSON.stringify({ autonomous: { enabled: true } });
      return '';
    });

    const result = await handler({ action: 'start', root: ROOT });
    const parsed = parseResult(result);

    expect(parsed.action).toBe('start');
    expect(parsed.spawned).toBe(true);
    expect(parsed.pid).toBe(4242);
    expect(result.isError).toBeUndefined();

    expect(vi.mocked(spawn)).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = vi.mocked(spawn).mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(cmd).toBe(process.execPath);
    expect(args).toContain('autonomous');
    expect(args).toContain('start');
    expect(args).toContain('--root');
    expect(args).toContain(ROOT);
    expect(opts.detached).toBe(true);
    expect(opts.stdio).toBe('ignore');

    // pid.json recorded so a second start() can detect the live loop.
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
      expect.stringContaining('loop.pid'),
      expect.stringContaining('4242'),
      'utf-8',
    );
    // Detached + unref'd so this MCP server's stdio transport is never blocked.
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it('already-running loop (alive pid) → refuses to spawn a duplicate', async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const path = typeof p === 'string' ? p : '';
      return isConfigPath(path) || isPidPath(path);
    });
    vi.mocked(readFileSync).mockImplementation((p) => {
      const path = typeof p === 'string' ? p : '';
      if (isConfigPath(path)) return JSON.stringify({ autonomous: { enabled: true } });
      if (isPidPath(path)) return JSON.stringify({ pid: 9999, startedAt: '2026-07-01T00:00:00.000Z' });
      return '';
    });
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as never); // alive: no throw

    const result = await handler({ action: 'start', root: ROOT });
    const parsed = parseResult(result);

    expect(parsed.action).toBe('start');
    expect(parsed.spawned).toBe(false);
    expect(parsed.alreadyRunning).toBe(true);
    expect(parsed.pid).toBe(9999);
    expect(vi.mocked(spawn)).not.toHaveBeenCalled();
    expect(result.isError).toBeUndefined();

    killSpy.mockRestore();
  });

  it('stale pid record (dead process) → clears it and proceeds to a real spawn', async () => {
    const child = fakeChild(5150);
    vi.mocked(spawn).mockReturnValue(child as never);
    vi.mocked(existsSync).mockImplementation((p) => {
      const path = typeof p === 'string' ? p : '';
      return isConfigPath(path) || isPidPath(path);
    });
    vi.mocked(readFileSync).mockImplementation((p) => {
      const path = typeof p === 'string' ? p : '';
      if (isConfigPath(path)) return JSON.stringify({ autonomous: { enabled: true } });
      if (isPidPath(path)) return JSON.stringify({ pid: 1234, startedAt: '2026-01-01T00:00:00.000Z' });
      return '';
    });
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      const err = new Error('No such process') as NodeJS.ErrnoException;
      err.code = 'ESRCH';
      throw err;
    });

    const result = await handler({ action: 'start', root: ROOT });
    const parsed = parseResult(result);

    expect(parsed.spawned).toBe(true);
    expect(parsed.pid).toBe(5150);
    expect(vi.mocked(spawn)).toHaveBeenCalledTimes(1);

    killSpy.mockRestore();
  });

  it('spawn() throws synchronously → honest failure, no false success', async () => {
    vi.mocked(spawn).mockImplementation(() => { throw new Error('ENOENT: entry.js not found'); });
    vi.mocked(existsSync).mockImplementation((p) => {
      const path = typeof p === 'string' ? p : '';
      return isConfigPath(path);
    });
    vi.mocked(readFileSync).mockImplementation((p) => {
      const path = typeof p === 'string' ? p : '';
      if (isConfigPath(path)) return JSON.stringify({ autonomous: { enabled: true } });
      return '';
    });

    const result = await handler({ action: 'start', root: ROOT });
    const parsed = parseResult(result);

    expect(parsed.action).toBe('start');
    expect(parsed.spawned).toBe(false);
    expect(result.isError).toBe(true);
    expect((parsed.message as string)).toContain('Failed to spawn');
  });

  it('still clears a stale stop marker before evaluating spawn eligibility', async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const path = typeof p === 'string' ? p : '';
      return isStopPath(path); // only the stop marker exists — config absent
    });

    const result = await handler({ action: 'start', root: ROOT });
    const parsed = parseResult(result);

    expect(parsed.stopMarkerCleared).toBe(true);
    expect(parsed.spawned).toBe(false); // still honest: config disabled, no spawn
  });
});
