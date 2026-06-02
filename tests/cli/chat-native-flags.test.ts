import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Hoisted Spies ──────────────────────────────────────────────────

const hoisted = vi.hoisted(() => ({
  runNativeLoopMock: vi.fn(),
  createAdapterMock: vi.fn(),
  printMock: vi.fn(),
  printErrorMock: vi.fn(),
  claudeDetect: vi.fn(),
  codexDetect: vi.fn(),
  geminiDetect: vi.fn(),
  ensureMcpAttachedMock: vi.fn(),
  spawnMock: vi.fn(),
}));

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('../../src/cli/commands/chat-native.js', () => ({
  runChatNativeLoop: hoisted.runNativeLoopMock,
  createSubscriptionChatAdapter: hoisted.createAdapterMock,
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

// ─── Static Imports (after mocks) ────────────────────────────────────

import { registerChat, type ChatOptions } from '../../src/cli/commands/chat.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function resetMocks(): void {
  hoisted.runNativeLoopMock.mockReset();
  hoisted.createAdapterMock.mockReset();
  hoisted.printMock.mockReset();
  hoisted.printErrorMock.mockReset();
  hoisted.claudeDetect.mockReset();
  hoisted.codexDetect.mockReset();
  hoisted.geminiDetect.mockReset();
  hoisted.ensureMcpAttachedMock.mockReset();
  hoisted.spawnMock.mockReset();
  hoisted.ensureMcpAttachedMock.mockResolvedValue({ attached: true, supported: true, toolCount: 32 });
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('chat --once / --message flags', () => {
  beforeEach(resetMocks);

  it('ChatOptions interface accepts once and message fields', () => {
    const opts: ChatOptions = { native: true, once: true, message: 'hello' };
    expect(opts.once).toBe(true);
    expect(opts.message).toBe('hello');
  });

  it('--once and --message options are registered on the chat command', () => {
    const program = new Command();
    registerChat(program);
    const chatCmd = program.commands.find(c => c.name() === 'chat');
    expect(chatCmd).toBeDefined();
    const onceOpt = chatCmd!.options.find(o => o.long === '--once');
    const messageOpt = chatCmd!.options.find(o => o.long === '--message');
    expect(onceOpt).toBeDefined();
    expect(messageOpt).toBeDefined();
  });

  it('--message <text> uses provided text as single-turn input and calls runChatNativeLoop', async () => {
    const fakeAdapter = { async send() { return { text: 'hello from LLM', stopReason: 'end_turn' as const }; } };
    hoisted.createAdapterMock.mockReturnValue(fakeAdapter);
    hoisted.runNativeLoopMock.mockResolvedValue([]);

    const program = new Command();
    program.exitOverride();
    registerChat(program);

    await program.parseAsync(['node', 'deckent', 'chat', '--native', '--message', 'test message']);

    expect(hoisted.runNativeLoopMock).toHaveBeenCalledTimes(1);
    const callArg = hoisted.runNativeLoopMock.mock.calls[0][0] as {
      provider: unknown;
      maxTurns: number;
      gracefulErrors: boolean;
      input: AsyncIterable<string>;
    };
    expect(callArg.maxTurns).toBe(1);
    expect(callArg.gracefulErrors).toBe(true);

    // Drain the single-turn generator to confirm it yields the message text
    const collected: string[] = [];
    for await (const line of callArg.input) {
      collected.push(line);
    }
    expect(collected).toEqual(['test message']);
  });

  it('--native --once calls runChatNativeLoop with maxTurns=1 and gracefulErrors=true', async () => {
    const fakeAdapter = { async send() { return { text: 'answer', stopReason: 'end_turn' as const }; } };
    hoisted.createAdapterMock.mockReturnValue(fakeAdapter);
    hoisted.runNativeLoopMock.mockResolvedValue([]);

    const program = new Command();
    program.exitOverride();
    registerChat(program);

    await program.parseAsync(['node', 'deckent', 'chat', '--native', '--once', '--message', 'hi']);

    expect(hoisted.runNativeLoopMock).toHaveBeenCalledTimes(1);
    const callArg = hoisted.runNativeLoopMock.mock.calls[0][0] as { maxTurns: number; gracefulErrors: boolean };
    expect(callArg.maxTurns).toBe(1);
    expect(callArg.gracefulErrors).toBe(true);
  });

  it('without --once/--message, --native routes to interactive REPL (no maxTurns limit)', async () => {
    const fakeAdapter = { async send() { return { text: 'response', stopReason: 'end_turn' as const }; } };
    hoisted.createAdapterMock.mockReturnValue(fakeAdapter);
    hoisted.runNativeLoopMock.mockResolvedValue([]);

    const program = new Command();
    program.exitOverride();
    registerChat(program);

    await program.parseAsync(['node', 'deckent', 'chat', '--native']);

    expect(hoisted.runNativeLoopMock).toHaveBeenCalledTimes(1);
    const callArg = hoisted.runNativeLoopMock.mock.calls[0][0] as { maxTurns?: number };
    // Interactive REPL mode does not set maxTurns:1
    expect(callArg.maxTurns).toBeUndefined();
  });

  it('when createSubscriptionChatAdapter throws, falls back to stub provider and still calls runChatNativeLoop', async () => {
    hoisted.createAdapterMock.mockImplementation(() => {
      throw new Error('No providers registered');
    });
    hoisted.runNativeLoopMock.mockResolvedValue([]);

    const program = new Command();
    program.exitOverride();
    registerChat(program);

    await program.parseAsync(['node', 'deckent', 'chat', '--native', '--message', 'fallback test']);

    expect(hoisted.runNativeLoopMock).toHaveBeenCalledTimes(1);
    const callArg = hoisted.runNativeLoopMock.mock.calls[0][0] as { provider: { send: unknown } };
    // Stub provider should have a send method
    expect(typeof callArg.provider.send).toBe('function');
    // Stub send should return the not-connected message
    const result = await (callArg.provider as { send: () => Promise<{ text: string }> }).send();
    expect(result.text).toContain('provider not yet connected');
  });
});
