import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { EventEmitter } from 'node:events';

// ─── Hoisted Spies ──────────────────────────────────────────────────

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

// ─── Static Imports ──────────────────────────────────────────────────

import { registerChat } from '../../src/cli/commands/chat.js';

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

function allNotReady(): void {
  hoisted.claudeDetect.mockResolvedValue({ binary: false, auth: false, ready: false });
  hoisted.codexDetect.mockResolvedValue({ binary: false, auth: false, ready: false });
  hoisted.geminiDetect.mockResolvedValue({ binary: false, auth: false, ready: false });
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

describe('chat no-CLI fallback UX', () => {
  beforeEach(resetMocks);

  it('shows a clear error listing all searched providers when none are found', async () => {
    allNotReady();

    const program = new Command();
    program.exitOverride();
    registerChat(program);

    const origExitCode = process.exitCode;
    await program.parseAsync(['node', 'deckent', 'chat']);

    expect(hoisted.spawnMock).not.toHaveBeenCalled();
    expect(hoisted.printErrorMock).toHaveBeenCalled();
    const msg = (hoisted.printErrorMock.mock.calls[0][0] as Error).message;
    expect(msg).toContain('No AI CLI found');
    expect(msg).toContain('claude');
    expect(msg).toContain('codex');
    expect(msg).toContain('gemini');
    process.exitCode = origExitCode as number;
  });

  it('includes --native flag as an alternative in the error message', async () => {
    allNotReady();

    const program = new Command();
    program.exitOverride();
    registerChat(program);

    const origExitCode = process.exitCode;
    await program.parseAsync(['node', 'deckent', 'chat']);

    const msg = (hoisted.printErrorMock.mock.calls[0][0] as Error).message;
    expect(msg).toContain('--native');
    process.exitCode = origExitCode as number;
  });

  it('includes deckent serve / dashboard chat suggestion in the error message', async () => {
    allNotReady();

    const program = new Command();
    program.exitOverride();
    registerChat(program);

    const origExitCode = process.exitCode;
    await program.parseAsync(['node', 'deckent', 'chat']);

    const msg = (hoisted.printErrorMock.mock.calls[0][0] as Error).message;
    expect(msg).toContain('deckent serve');
    process.exitCode = origExitCode as number;
  });

  it('includes install instructions in the error message', async () => {
    allNotReady();

    const program = new Command();
    program.exitOverride();
    registerChat(program);

    const origExitCode = process.exitCode;
    await program.parseAsync(['node', 'deckent', 'chat']);

    const msg = (hoisted.printErrorMock.mock.calls[0][0] as Error).message;
    expect(msg.toLowerCase()).toContain('install');
    process.exitCode = origExitCode as number;
  });

  it('spawns normally when a CLI is available (no no-provider error)', async () => {
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
    // printErrorMock may be called by ensureMcpAttached (non-fatal warning) — that's OK.
    // Verify NO_PROVIDER_MESSAGE was NOT the error (i.e., spawn was not blocked by missing CLI).
    const noProviderCalls = (hoisted.printErrorMock.mock.calls as Array<[Error]>).filter(
      ([err]) => err instanceof Error && err.message.includes('No AI CLI found'),
    );
    expect(noProviderCalls).toHaveLength(0);
    process.exitCode = origExitCode as number;
  });
});
