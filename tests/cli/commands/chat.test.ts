import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ═══ chat --native real dispatcher + chat --local wiring (Sprint 323 — 323-015) ═══
//
// Pins two behaviours added in 323-015:
//   1. `chat --native` dispatches tool calls through the REAL in-process MCP
//      tool dispatcher (createCliToolDispatcher) — NOT the prior placeholder
//      stub that returned "tool … not yet wired" for every call.
//   2. `chat --local` wires onto the local Ollama provider, or honest-fails
//      (exit 1 + actionable message) when no local runtime is reachable —
//      never a silent fallback to a cloud provider.

// ─── Hoisted Spies (referenced inside vi.mock factories) ────────────

const hoisted = vi.hoisted(() => ({
  runNativeLoopMock: vi.fn(),
  createAdapterMock: vi.fn(),
  createDispatcherMock: vi.fn(),
  resolveChatAdapterMock: vi.fn(),
  ollamaDetectMock: vi.fn(),
  printMock: vi.fn(),
  printErrorMock: vi.fn(),
  claudeDetect: vi.fn(),
  codexDetect: vi.fn(),
  geminiDetect: vi.fn(),
}));

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('../../../src/cli/commands/chat-native.js', () => ({
  runChatNativeLoop: hoisted.runNativeLoopMock,
  createSubscriptionChatAdapter: hoisted.createAdapterMock,
}));

vi.mock('../../../src/cli/commands/chat-tool-bridge.js', () => ({
  createCliToolDispatcher: hoisted.createDispatcherMock,
}));

vi.mock('../../../src/cli/commands/chat-provider-parity.js', () => ({
  resolveChatAdapter: hoisted.resolveChatAdapterMock,
}));

vi.mock('../../../src/providers/ollama.js', () => ({
  OllamaAdapter: class {
    constructor(_root: string) {}
    detect = hoisted.ollamaDetectMock;
  },
}));

vi.mock('../../../src/providers/claude.js', () => ({
  ClaudeAdapter: class {
    constructor(_root: string) {}
    detect = hoisted.claudeDetect;
  },
}));

vi.mock('../../../src/providers/codex.js', () => ({
  CodexAdapter: class {
    constructor(_root: string) {}
    detect = hoisted.codexDetect;
  },
}));

vi.mock('../../../src/providers/gemini.js', () => ({
  GeminiAdapter: class {
    constructor(_root: string) {}
    detect = hoisted.geminiDetect;
  },
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: hoisted.printMock,
  printError: hoisted.printErrorMock,
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/project'),
}));

// ─── Static Imports (after mocks) ────────────────────────────────────

import { registerChat, detectLocalProvider } from '../../../src/cli/commands/chat.js';

// ─── Helpers ─────────────────────────────────────────────────────────

/** A sentinel dispatcher object; identity-checked to prove the real wire. */
const SENTINEL_DISPATCHER = { dispatch: vi.fn(async () => 'real-dispatch-result') };

function resetMocks(): void {
  hoisted.runNativeLoopMock.mockReset();
  hoisted.createAdapterMock.mockReset();
  hoisted.createDispatcherMock.mockReset();
  hoisted.resolveChatAdapterMock.mockReset();
  hoisted.ollamaDetectMock.mockReset();
  hoisted.printMock.mockReset();
  hoisted.printErrorMock.mockReset();
  hoisted.claudeDetect.mockReset();
  hoisted.codexDetect.mockReset();
  hoisted.geminiDetect.mockReset();

  hoisted.createDispatcherMock.mockReturnValue(SENTINEL_DISPATCHER);
  hoisted.runNativeLoopMock.mockResolvedValue([]);
  hoisted.createAdapterMock.mockReturnValue({
    async send() { return { text: 'ok', stopReason: 'end_turn' as const }; },
  });
  // Keep model selection deterministic regardless of the host env.
  delete process.env['DECKENT_OLLAMA_MODEL'];
  delete process.env['DECKENT_OLLAMA_HOST'];
}

function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerChat(program);
  return program;
}

// ─── detectLocalProvider ─────────────────────────────────────────────

describe('detectLocalProvider', () => {
  beforeEach(resetMocks);

  it('maps a reachable+model server to ready=true', async () => {
    hoisted.ollamaDetectMock.mockResolvedValue({
      available: true,
      endpoint: 'http://localhost:11434',
      models: ['llama3', 'qwen2.5-coder:7b'],
      auth: 'none',
      ready: true,
      reason: 'Ollama server reachable (2 models)',
    });

    const status = await detectLocalProvider('/project');
    expect(status.ready).toBe(true);
    expect(status.host).toBe('http://localhost:11434');
    expect(status.models).toEqual(['llama3', 'qwen2.5-coder:7b']);
  });

  it('maps an unreachable server to ready=false with the honest reason', async () => {
    hoisted.ollamaDetectMock.mockResolvedValue({
      available: false,
      endpoint: 'http://localhost:11434',
      models: [],
      auth: 'none',
      ready: false,
      reason: 'Ollama server not reachable',
    });

    const status = await detectLocalProvider('/project');
    expect(status.ready).toBe(false);
    expect(status.reason).toContain('not reachable');
  });

  it('treats a reachable-but-model-less server (partial) as NOT ready', async () => {
    hoisted.ollamaDetectMock.mockResolvedValue({
      available: false,
      endpoint: 'http://localhost:11434',
      models: [],
      auth: 'none',
      ready: 'partial',
      reason: 'Ollama server reachable but no models installed — pull a model to use it',
    });

    const status = await detectLocalProvider('/project');
    expect(status.ready).toBe(false);
  });
});

// ─── chat --native real dispatcher ───────────────────────────────────

describe('chat --native real tool dispatcher', () => {
  beforeEach(resetMocks);

  it('passes the real createCliToolDispatcher() to runChatNativeLoop (no placeholder stub)', async () => {
    await buildProgram().parseAsync(['node', 'deckent', 'chat', '--native', '--message', 'hi']);

    expect(hoisted.createDispatcherMock).toHaveBeenCalledTimes(1);
    expect(hoisted.runNativeLoopMock).toHaveBeenCalledTimes(1);
    const callArg = hoisted.runNativeLoopMock.mock.calls[0][0] as { dispatcher: typeof SENTINEL_DISPATCHER };
    // Identity: the dispatcher is the real bridge, not an inline stub.
    expect(callArg.dispatcher).toBe(SENTINEL_DISPATCHER);

    // And the dispatcher does NOT return the old placeholder text.
    const out = await callArg.dispatcher.dispatch('deckent_status', {});
    expect(out).not.toContain('not yet wired');
  });

  it('interactive --native REPL also receives the real dispatcher', async () => {
    // No --once/--message → REPL path. runChatNativeLoop is mocked so stdin is
    // never actually read.
    await buildProgram().parseAsync(['node', 'deckent', 'chat', '--native']);

    expect(hoisted.runNativeLoopMock).toHaveBeenCalledTimes(1);
    const callArg = hoisted.runNativeLoopMock.mock.calls[0][0] as { dispatcher: unknown; maxTurns?: number };
    expect(callArg.dispatcher).toBe(SENTINEL_DISPATCHER);
    expect(callArg.maxTurns).toBeUndefined();
  });
});

// ─── chat --local wiring ─────────────────────────────────────────────

describe('chat --local local-provider wiring', () => {
  beforeEach(resetMocks);

  it('honest-fails (exit 1, no silent fallback) when no local runtime is reachable', async () => {
    hoisted.ollamaDetectMock.mockResolvedValue({
      available: false,
      endpoint: 'http://localhost:11434',
      models: [],
      auth: 'none',
      ready: false,
      reason: 'Ollama server not reachable',
    });

    const origExitCode = process.exitCode;
    await buildProgram().parseAsync(['node', 'deckent', 'chat', '--local']);

    expect(hoisted.printErrorMock).toHaveBeenCalledTimes(1);
    const err = hoisted.printErrorMock.mock.calls[0][0] as Error;
    expect(err.message).toContain('http://localhost:11434');
    expect(err.message).toContain('not reachable');
    // No silent fallback: neither the cloud subscription adapter nor the loop ran.
    expect(hoisted.createAdapterMock).not.toHaveBeenCalled();
    expect(hoisted.resolveChatAdapterMock).not.toHaveBeenCalled();
    expect(hoisted.runNativeLoopMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = origExitCode as number;
  });

  it('wires the Ollama adapter + real dispatcher into the native loop when ready', async () => {
    hoisted.ollamaDetectMock.mockResolvedValue({
      available: true,
      endpoint: 'http://localhost:11434',
      models: ['llama3'],
      auth: 'none',
      ready: true,
      reason: 'Ollama server reachable (1 model)',
    });
    const fakeOllamaAdapter = {
      async send() { return { text: 'local-reply', stopReason: 'end_turn' as const }; },
    };
    hoisted.resolveChatAdapterMock.mockReturnValue(fakeOllamaAdapter);

    await buildProgram().parseAsync(['node', 'deckent', 'chat', '--local', '--message', 'hi']);

    expect(hoisted.resolveChatAdapterMock).toHaveBeenCalledTimes(1);
    const [providerName, opts] = hoisted.resolveChatAdapterMock.mock.calls[0] as [string, { ollamaHost: string; ollamaModel: string }];
    expect(providerName).toBe('ollama');
    expect(opts.ollamaHost).toBe('http://localhost:11434');
    expect(opts.ollamaModel).toBe('llama3');

    // The cloud subscription adapter is NEVER built for --local.
    expect(hoisted.createAdapterMock).not.toHaveBeenCalled();

    expect(hoisted.runNativeLoopMock).toHaveBeenCalledTimes(1);
    const callArg = hoisted.runNativeLoopMock.mock.calls[0][0] as { provider: unknown; dispatcher: unknown };
    expect(callArg.provider).toBe(fakeOllamaAdapter);
    expect(callArg.dispatcher).toBe(SENTINEL_DISPATCHER);
  });
});
