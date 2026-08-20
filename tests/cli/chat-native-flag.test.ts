import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { EventEmitter } from 'node:events';

// ─── Hoisted Spies (referenced inside vi.mock factories) ────────────

const hoisted = vi.hoisted(() => ({
  runNativeLoopMock: vi.fn(),
  spawnMock: vi.fn(),
  // ddc523bf0 cursor adapter: probeProviders constructs a REAL CursorAdapter
  // whose constructor captures `spawnSync` from node:child_process. Default
  // impl reports cursor-agent as absent (status 1) so the cursor probe is
  // deterministically not-ready regardless of the host PATH. Never reset.
  spawnSyncMock: vi.fn(() => ({ status: 1, stdout: '', stderr: '' })),
  claudeDetect: vi.fn(),
  codexDetect: vi.fn(),
  geminiDetect: vi.fn(),
  printMock: vi.fn(),
  printErrorMock: vi.fn(),
  ensureMcpAttachedMock: vi.fn(),
}));

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('../../src/cli/commands/chat-native.js', () => ({
  runChatNativeLoop: hoisted.runNativeLoopMock,
}));

vi.mock('node:child_process', () => ({
  spawn: hoisted.spawnMock,
  // ddc523bf0 cursor adapter: the real CursorAdapter imports spawnSync too.
  spawnSync: hoisted.spawnSyncMock,
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

vi.mock('../../src/cli/helpers/mcp-attach.js', () => ({
  ensureMcpAttached: hoisted.ensureMcpAttachedMock,
}));

// ─── Static Imports (after mocks) ────────────────────────────────────

import { registerChat, type ChatOptions } from '../../src/cli/commands/chat.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function fakeChildProcess(): EventEmitter & { kill: ReturnType<typeof vi.fn>; killed: boolean } {
  const emitter = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>;
    killed: boolean;
  };
  emitter.kill = vi.fn();
  emitter.killed = false;
  queueMicrotask(() => emitter.emit('exit', 0, null));
  return emitter;
}

function resetMocks(): void {
  hoisted.runNativeLoopMock.mockReset();
  hoisted.spawnMock.mockReset();
  hoisted.claudeDetect.mockReset();
  hoisted.codexDetect.mockReset();
  hoisted.geminiDetect.mockReset();
  hoisted.printMock.mockReset();
  hoisted.printErrorMock.mockReset();
  hoisted.ensureMcpAttachedMock.mockReset();
  hoisted.ensureMcpAttachedMock.mockResolvedValue({ attached: true, supported: true, toolCount: 32 });
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('chat --native flag', () => {
  beforeEach(resetMocks);

  it('ChatOptions interface accepts native boolean and command exposes --native option (flag parse)', () => {
    const opts: ChatOptions = { native: true };
    expect(opts.native).toBe(true);

    const program = new Command();
    registerChat(program);
    const chatCmd = program.commands.find(c => c.name() === 'chat');
    expect(chatCmd).toBeDefined();
    const nativeOpt = chatCmd!.options.find(o => o.long === '--native');
    expect(nativeOpt).toBeDefined();
  });

  it('default-B preserved: without --native, spawn is used and runChatNativeLoop is not called', async () => {
    hoisted.claudeDetect.mockResolvedValue({ binary: true, auth: true, ready: true });
    hoisted.codexDetect.mockResolvedValue({ binary: false, auth: false, ready: false });
    hoisted.geminiDetect.mockResolvedValue({ binary: false, auth: false, ready: false });
    hoisted.spawnMock.mockImplementation(() => fakeChildProcess());

    const program = new Command();
    program.exitOverride();
    registerChat(program);

    const origExitCode = process.exitCode;
    await program.parseAsync(['node', 'deckent', 'chat']);

    expect(hoisted.runNativeLoopMock).not.toHaveBeenCalled();
    expect(hoisted.spawnMock).toHaveBeenCalledTimes(1);
    process.exitCode = origExitCode as number;
  });

  it('native-route: with --native, runChatNativeLoop is called and spawn is not', async () => {
    hoisted.runNativeLoopMock.mockResolvedValue([]);

    const program = new Command();
    program.exitOverride();
    registerChat(program);

    await program.parseAsync(['node', 'deckent', 'chat', '--native']);

    expect(hoisted.runNativeLoopMock).toHaveBeenCalledTimes(1);
    expect(hoisted.spawnMock).not.toHaveBeenCalled();

    const callArg = hoisted.runNativeLoopMock.mock.calls[0][0] as {
      provider: unknown;
      dispatcher: unknown;
      input: unknown;
      output: unknown;
    };
    expect(typeof callArg.provider).toBe('object');
    expect(typeof callArg.dispatcher).toBe('object');
    expect(typeof callArg.output).toBe('function');
  });
});
