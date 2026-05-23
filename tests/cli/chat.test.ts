import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { EventEmitter } from 'node:events';

// ─── Hoisted Spies (referenced inside vi.mock factories) ────────────

const hoisted = vi.hoisted(() => ({
  claudeDetect: vi.fn(),
  codexDetect: vi.fn(),
  geminiDetect: vi.fn(),
  spawnMock: vi.fn(),
  printMock: vi.fn(),
  printErrorMock: vi.fn(),
}));

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawn: hoisted.spawnMock,
}));

vi.mock('../../src/providers/claude.js', () => ({
  ClaudeAdapter: class {
    constructor(_root: string) {}
    detect = hoisted.claudeDetect;
  },
}));

vi.mock('../../src/providers/codex.js', () => ({
  CodexAdapter: class {
    constructor(_root: string) {}
    detect = hoisted.codexDetect;
  },
}));

vi.mock('../../src/providers/gemini.js', () => ({
  GeminiAdapter: class {
    constructor(_root: string) {}
    detect = hoisted.geminiDetect;
  },
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: hoisted.printMock,
  printError: hoisted.printErrorMock,
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/project'),
}));

// ─── Static Imports (after mocks) ────────────────────────────────────

import {
  probeProviders,
  selectProvider,
  spawnChatProcess,
  registerChat,
} from '../../src/cli/commands/chat.js';

// ─── Helpers ─────────────────────────────────────────────────────────

/** Build a child-process mock that immediately emits `exit` with code 0. */
function fakeChildProcess(): EventEmitter & { kill: ReturnType<typeof vi.fn>; killed: boolean } {
  const emitter = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>;
    killed: boolean;
  };
  emitter.kill = vi.fn();
  emitter.killed = false;
  // Emit exit on next tick so the listener in registerChat() is attached first.
  queueMicrotask(() => emitter.emit('exit', 0, null));
  return emitter;
}

function resetMocks(): void {
  hoisted.claudeDetect.mockReset();
  hoisted.codexDetect.mockReset();
  hoisted.geminiDetect.mockReset();
  hoisted.spawnMock.mockReset();
  hoisted.printMock.mockReset();
  hoisted.printErrorMock.mockReset();
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('probeProviders', () => {
  beforeEach(resetMocks);

  it('returns detect results in claude → codex → gemini order', async () => {
    hoisted.claudeDetect.mockResolvedValue({ binary: true, auth: true, ready: true });
    hoisted.codexDetect.mockResolvedValue({ binary: false, auth: false, ready: false });
    hoisted.geminiDetect.mockResolvedValue({ binary: true, auth: false, ready: 'partial' });

    const probes = await probeProviders('/project');
    expect(probes.map(p => p.tool)).toEqual(['claude', 'codex', 'gemini']);
    expect(probes[0].detect.ready).toBe(true);
    expect(probes[2].detect.ready).toBe('partial');
  });

  it('swallows adapter detect() errors and reports as not-ready', async () => {
    hoisted.claudeDetect.mockRejectedValue(new Error('boom'));
    hoisted.codexDetect.mockResolvedValue({ binary: true, auth: true, ready: true });
    hoisted.geminiDetect.mockResolvedValue({ binary: false, auth: false, ready: false });

    const probes = await probeProviders('/project');
    expect(probes[0].detect.ready).toBe(false);
    expect(probes[0].detect.binary).toBe(false);
    expect(probes[1].detect.ready).toBe(true);
  });
});

describe('selectProvider', () => {
  it('prefers ready: true over partial', () => {
    const chosen = selectProvider([
      { tool: 'claude', detect: { binary: true, auth: false, ready: 'partial' } },
      { tool: 'codex', detect: { binary: true, auth: true, ready: true } },
      { tool: 'gemini', detect: { binary: false, auth: false, ready: false } },
    ]);
    expect(chosen?.tool).toBe('codex');
  });

  it('falls back to partial when nothing is fully ready', () => {
    const chosen = selectProvider([
      { tool: 'claude', detect: { binary: false, auth: false, ready: false } },
      { tool: 'codex', detect: { binary: true, auth: false, ready: 'partial' } },
      { tool: 'gemini', detect: { binary: false, auth: false, ready: false } },
    ]);
    expect(chosen?.tool).toBe('codex');
  });

  it('returns null when no provider has any binary', () => {
    const chosen = selectProvider([
      { tool: 'claude', detect: { binary: false, auth: false, ready: false } },
      { tool: 'codex', detect: { binary: false, auth: false, ready: false } },
      { tool: 'gemini', detect: { binary: false, auth: false, ready: false } },
    ]);
    expect(chosen).toBeNull();
  });
});

describe('spawnChatProcess', () => {
  beforeEach(resetMocks);

  it('spawns the chosen tool with DECKENT_MCP_AUTO_ATTACH=1 and stdio inherit', () => {
    hoisted.spawnMock.mockImplementation(() => fakeChildProcess());

    const { detach } = spawnChatProcess('claude');
    detach();

    expect(hoisted.spawnMock).toHaveBeenCalledTimes(1);
    const [bin, args, opts] = hoisted.spawnMock.mock.calls[0];
    expect(bin).toBe('claude');
    expect(args).toEqual([]);
    expect(opts.stdio).toBe('inherit');
    expect(opts.env.DECKENT_MCP_AUTO_ATTACH).toBe('1');
  });

  it('forwards SIGINT to the child process and detaches cleanly', () => {
    let captured: ReturnType<typeof fakeChildProcess> | null = null;
    hoisted.spawnMock.mockImplementation(() => {
      captured = fakeChildProcess();
      return captured;
    });

    const beforeCount = process.listenerCount('SIGINT');
    const { detach } = spawnChatProcess('codex');
    const duringCount = process.listenerCount('SIGINT');
    expect(duringCount).toBe(beforeCount + 1);

    process.emit('SIGINT');
    expect(captured!.kill).toHaveBeenCalledWith('SIGINT');

    detach();
    expect(process.listenerCount('SIGINT')).toBe(beforeCount);
  });
});

describe('registerChat', () => {
  beforeEach(resetMocks);

  it('registers a chat command with --tool, --local, --check-mcp options', () => {
    const program = new Command();
    program.exitOverride();
    registerChat(program);

    const cmd = program.commands.find(c => c.name() === 'chat');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('conversational session');

    const longs = cmd?.options.map(o => o.long) ?? [];
    expect(longs).toContain('--tool');
    expect(longs).toContain('--local');
    expect(longs).toContain('--check-mcp');
  });

  it('auto-detects the first ready provider and spawns it', async () => {
    hoisted.claudeDetect.mockResolvedValue({ binary: true, auth: true, ready: true });
    hoisted.codexDetect.mockResolvedValue({ binary: false, auth: false, ready: false });
    hoisted.geminiDetect.mockResolvedValue({ binary: false, auth: false, ready: false });
    hoisted.spawnMock.mockImplementation(() => fakeChildProcess());

    const program = new Command();
    program.exitOverride();
    registerChat(program);

    const origExitCode = process.exitCode;
    await program.parseAsync(['node', 'deckent', 'chat']);

    expect(hoisted.spawnMock).toHaveBeenCalledTimes(1);
    expect(hoisted.spawnMock.mock.calls[0][0]).toBe('claude');
    expect(process.exitCode === 0 || process.exitCode === undefined).toBe(true);
    process.exitCode = origExitCode as number;
  });

  it('honors --tool override even when other providers are ready', async () => {
    hoisted.claudeDetect.mockResolvedValue({ binary: true, auth: true, ready: true });
    hoisted.codexDetect.mockResolvedValue({ binary: true, auth: true, ready: true });
    hoisted.geminiDetect.mockResolvedValue({ binary: true, auth: true, ready: true });
    hoisted.spawnMock.mockImplementation(() => fakeChildProcess());

    const program = new Command();
    program.exitOverride();
    registerChat(program);

    await program.parseAsync(['node', 'deckent', 'chat', '--tool', 'gemini']);

    expect(hoisted.spawnMock).toHaveBeenCalledTimes(1);
    expect(hoisted.spawnMock.mock.calls[0][0]).toBe('gemini');
  });

  it('errors with install hint when no provider is available', async () => {
    hoisted.claudeDetect.mockResolvedValue({ binary: false, auth: false, ready: false });
    hoisted.codexDetect.mockResolvedValue({ binary: false, auth: false, ready: false });
    hoisted.geminiDetect.mockResolvedValue({ binary: false, auth: false, ready: false });

    const program = new Command();
    program.exitOverride();
    registerChat(program);

    const origExitCode = process.exitCode;
    await program.parseAsync(['node', 'deckent', 'chat']);

    expect(hoisted.spawnMock).not.toHaveBeenCalled();
    expect(hoisted.printErrorMock).toHaveBeenCalled();
    const errArg = hoisted.printErrorMock.mock.calls[0][0] as Error;
    expect(errArg.message).toContain('No AI CLI found');
    expect(errArg.message).toContain('claude');
    expect(errArg.message).toContain('codex');
    expect(errArg.message).toContain('gemini');
    expect(process.exitCode).toBe(1);
    process.exitCode = origExitCode as number;
  });

  it('errors when --tool names a provider whose binary is missing', async () => {
    hoisted.claudeDetect.mockResolvedValue({ binary: true, auth: true, ready: true });
    hoisted.codexDetect.mockResolvedValue({ binary: false, auth: false, ready: false });
    hoisted.geminiDetect.mockResolvedValue({ binary: false, auth: false, ready: false });

    const program = new Command();
    program.exitOverride();
    registerChat(program);

    const origExitCode = process.exitCode;
    await program.parseAsync(['node', 'deckent', 'chat', '--tool', 'codex']);

    expect(hoisted.spawnMock).not.toHaveBeenCalled();
    expect(hoisted.printErrorMock).toHaveBeenCalled();
    const errArg = hoisted.printErrorMock.mock.calls[0][0] as Error;
    expect(errArg.message).toContain('"codex"');
    expect(process.exitCode).toBe(1);
    process.exitCode = origExitCode as number;
  });
});
