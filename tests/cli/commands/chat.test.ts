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
import { EventEmitter } from "node:events";
// ─── Static Imports (after mocks) ────────────────────────────────────
import { probeProviders, selectProvider, spawnChatProcess, registerChat as registerChat__tsm_001 } from "../../../src/cli/commands/chat.js";

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

// TSM-001: physically merged from tests/cli/chat.test.ts.
{
// ─── Hoisted Spies (referenced inside vi.mock factories) ────────────
const legacyHoisted = vi.hoisted(() => {
    const registeredHooks: Array<() => Promise<void>> = [];
    const unregisterMocks: Array<ReturnType<typeof vi.fn>> = [];
    return {
        claudeDetect: vi.fn(),
        codexDetect: vi.fn(),
        geminiDetect: vi.fn(),
        spawnMock: vi.fn(),
        // ddc523bf0 cursor adapter: probeProviders constructs a REAL CursorAdapter
        // (unlike claude/codex/gemini, which are class-mocked below) and its
        // constructor captures `spawnSync` from node:child_process. The default
        // impl reports the cursor-agent binary as absent (status 1), so cursor
        // probes deterministically not-ready and the mocked providers keep
        // driving selection — independent of any cursor-agent on the host PATH.
        // Never reset in resetMocks(): the impl IS the deterministic environment.
        spawnSyncMock: vi.fn(() => ({ status: 1, stdout: '', stderr: '' })),
        printMock: vi.fn(),
        printErrorMock: vi.fn(),
        registeredHooks,
        unregisterMocks,
        // Mock-registry mirroring src/cli/helpers/shutdown-hooks.ts's real
        // registerShutdownHook — captures hooks + their unregister fns so tests
        // can invoke/unregister them directly (no real OS signal is ever sent).
        registerShutdownHookMock: vi.fn((hook: () => Promise<void>) => {
            registeredHooks.push(hook);
            const unregister = vi.fn();
            unregisterMocks.push(unregister);
            return unregister;
        }),
    };
});

// ─── Mocks ──────────────────────────────────────────────────────────
vi.mock("node:child_process", () => ({
    spawn: legacyHoisted.spawnMock,
    // ddc523bf0 cursor adapter: the real CursorAdapter imports spawnSync too.
    spawnSync: legacyHoisted.spawnSyncMock,
}));

vi.mock("../../../src/providers/claude.js", () => ({
    ClaudeAdapter: class {
        constructor(_root: string) { }
        detect = legacyHoisted.claudeDetect;
    },
}));

vi.mock("../../../src/providers/codex.js", () => ({
    CodexAdapter: class {
        constructor(_root: string) { }
        detect = legacyHoisted.codexDetect;
    },
}));

vi.mock("../../../src/providers/gemini.js", () => ({
    GeminiAdapter: class {
        constructor(_root: string) { }
        detect = legacyHoisted.geminiDetect;
    },
}));

vi.mock("../../../src/cli/helpers/output.js", () => ({
    print: (...args: unknown[]) => {
        hoisted.printMock(...args);
        legacyHoisted.printMock(...args);
    },
    printError: (...args: unknown[]) => {
        hoisted.printErrorMock(...args);
        legacyHoisted.printErrorMock(...args);
    },
}));

vi.mock("../../../src/cli/helpers/process.js", () => ({
    resolveProjectRoot: vi.fn().mockReturnValue('/project'),
}));

vi.mock("../../../src/cli/helpers/shutdown-hooks.js", () => ({
    registerShutdownHook: legacyHoisted.registerShutdownHookMock,
}));

// ─── Helpers ─────────────────────────────────────────────────────────
/** Build a child-process mock that immediately emits `exit` with code 0. */
function fakeChildProcess(): EventEmitter & {
    kill: ReturnType<typeof vi.fn>;
    killed: boolean;
} {
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
    legacyHoisted.claudeDetect.mockReset();
    legacyHoisted.codexDetect.mockReset();
    legacyHoisted.geminiDetect.mockReset();
    legacyHoisted.spawnMock.mockReset();
    legacyHoisted.printMock.mockReset();
    legacyHoisted.printErrorMock.mockReset();
    legacyHoisted.registerShutdownHookMock.mockClear();
    legacyHoisted.registeredHooks.length = 0;
    legacyHoisted.unregisterMocks.length = 0;
}

// ─── Tests ──────────────────────────────────────────────────────────
describe('probeProviders', () => {
    beforeEach(resetMocks);
    it('returns detect results in claude → codex → cursor → gemini order', async () => {
        legacyHoisted.claudeDetect.mockResolvedValue({ binary: true, auth: true, ready: true });
        legacyHoisted.codexDetect.mockResolvedValue({ binary: false, auth: false, ready: false });
        legacyHoisted.geminiDetect.mockResolvedValue({ binary: true, auth: false, ready: 'partial' });
        const probes = await probeProviders('/project');
        // ddc523bf0 cursor adapter: cursor joined PROVIDER_PRIORITY between codex
        // and gemini — the real adapter's detect() runs against the spawnSync mock
        // (binary absent), so its probe is deterministically not-ready.
        expect(probes.map(p => p.tool)).toEqual(['claude', 'codex', 'cursor', 'gemini']);
        expect(probes[0].detect.ready).toBe(true);
        expect(probes[2].detect.ready).toBe(false);
        expect(probes[3].detect.ready).toBe('partial');
    });
    it('swallows adapter detect() errors and reports as not-ready', async () => {
        legacyHoisted.claudeDetect.mockRejectedValue(new Error('boom'));
        legacyHoisted.codexDetect.mockResolvedValue({ binary: true, auth: true, ready: true });
        legacyHoisted.geminiDetect.mockResolvedValue({ binary: false, auth: false, ready: false });
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
        legacyHoisted.spawnMock.mockImplementation(() => fakeChildProcess());
        const { detach } = spawnChatProcess('claude');
        detach();
        expect(legacyHoisted.spawnMock).toHaveBeenCalledTimes(1);
        const [bin, args, opts] = legacyHoisted.spawnMock.mock.calls[0];
        expect(bin).toBe('claude');
        expect(args).toEqual([]);
        expect(opts.stdio).toBe('inherit');
        expect(opts.env.DECKENT_MCP_AUTO_ATTACH).toBe('1');
    });
    it('registers a shutdown hook (not a raw SIGINT listener); the hook kills the child via default SIGTERM and detach() unregisters it', async () => {
        let captured: ReturnType<typeof fakeChildProcess> | null = null;
        legacyHoisted.spawnMock.mockImplementation(() => {
            captured = fakeChildProcess();
            return captured;
        });
        const beforeCount = process.listenerCount('SIGINT');
        const { detach } = spawnChatProcess('codex');
        // born-587 (DEAD-LISTENER-MIGRATION): entry.ts's bootstrap-time onSignal
        // always wins SIGINT/SIGTERM registration order, so a command-level
        // process.on() listener here would be dead code. spawnChatProcess routes
        // cleanup through the shared shutdown-hooks registry instead — no raw
        // listener is ever added.
        expect(process.listenerCount('SIGINT')).toBe(beforeCount);
        expect(legacyHoisted.registerShutdownHookMock).toHaveBeenCalledTimes(1);
        const hook = legacyHoisted.registeredHooks[legacyHoisted.registeredHooks.length - 1];
        const unregister = legacyHoisted.unregisterMocks[legacyHoisted.unregisterMocks.length - 1];
        await hook();
        // Hooks are signal-agnostic (shutdown-hooks.ts contract) — the exact
        // received signal (SIGINT vs SIGTERM) can no longer be forwarded
        // verbatim. child.kill() called with NO explicit signal defaults to
        // SIGTERM (Node child_process contract) — pinning that nuance here.
        expect(captured!.kill).toHaveBeenCalledTimes(1);
        expect(captured!.kill).toHaveBeenCalledWith();
        expect(unregister).not.toHaveBeenCalled();
        detach();
        expect(unregister).toHaveBeenCalledTimes(1);
    });
});

describe('registerChat', () => {
    beforeEach(resetMocks);
    it('registers a chat command with --tool, --local, --check-mcp options', () => {
        const program = new Command();
        program.exitOverride();
        registerChat__tsm_001(program);
        const cmd = program.commands.find(c => c.name() === 'chat');
        expect(cmd).toBeDefined();
        expect(cmd?.description()).toContain('conversational session');
        const longs = cmd?.options.map(o => o.long) ?? [];
        expect(longs).toContain('--tool');
        expect(longs).toContain('--local');
        expect(longs).toContain('--check-mcp');
    });
    it('auto-detects the first ready provider and spawns it', async () => {
        legacyHoisted.claudeDetect.mockResolvedValue({ binary: true, auth: true, ready: true });
        legacyHoisted.codexDetect.mockResolvedValue({ binary: false, auth: false, ready: false });
        legacyHoisted.geminiDetect.mockResolvedValue({ binary: false, auth: false, ready: false });
        legacyHoisted.spawnMock.mockImplementation(() => fakeChildProcess());
        const program = new Command();
        program.exitOverride();
        registerChat__tsm_001(program);
        const origExitCode = process.exitCode;
        await program.parseAsync(['node', 'deckent', 'chat']);
        expect(legacyHoisted.spawnMock).toHaveBeenCalledTimes(1);
        expect(legacyHoisted.spawnMock.mock.calls[0][0]).toBe('claude');
        expect(process.exitCode === 0 || process.exitCode === undefined).toBe(true);
        process.exitCode = origExitCode as number;
    });
    it('honors --tool override even when other providers are ready', async () => {
        legacyHoisted.claudeDetect.mockResolvedValue({ binary: true, auth: true, ready: true });
        legacyHoisted.codexDetect.mockResolvedValue({ binary: true, auth: true, ready: true });
        legacyHoisted.geminiDetect.mockResolvedValue({ binary: true, auth: true, ready: true });
        legacyHoisted.spawnMock.mockImplementation(() => fakeChildProcess());
        const program = new Command();
        program.exitOverride();
        registerChat__tsm_001(program);
        await program.parseAsync(['node', 'deckent', 'chat', '--tool', 'gemini']);
        expect(legacyHoisted.spawnMock).toHaveBeenCalledTimes(1);
        expect(legacyHoisted.spawnMock.mock.calls[0][0]).toBe('gemini');
    });
    it('errors with install hint when no provider is available', async () => {
        legacyHoisted.claudeDetect.mockResolvedValue({ binary: false, auth: false, ready: false });
        legacyHoisted.codexDetect.mockResolvedValue({ binary: false, auth: false, ready: false });
        legacyHoisted.geminiDetect.mockResolvedValue({ binary: false, auth: false, ready: false });
        const program = new Command();
        program.exitOverride();
        registerChat__tsm_001(program);
        const origExitCode = process.exitCode;
        await program.parseAsync(['node', 'deckent', 'chat']);
        expect(legacyHoisted.spawnMock).not.toHaveBeenCalled();
        expect(legacyHoisted.printErrorMock).toHaveBeenCalled();
        const errArg = legacyHoisted.printErrorMock.mock.calls[0][0] as Error;
        expect(errArg.message).toContain('No AI CLI found');
        expect(errArg.message).toContain('claude');
        expect(errArg.message).toContain('codex');
        expect(errArg.message).toContain('gemini');
        expect(process.exitCode).toBe(1);
        process.exitCode = origExitCode as number;
    });
    it('errors when --tool names a provider whose binary is missing', async () => {
        legacyHoisted.claudeDetect.mockResolvedValue({ binary: true, auth: true, ready: true });
        legacyHoisted.codexDetect.mockResolvedValue({ binary: false, auth: false, ready: false });
        legacyHoisted.geminiDetect.mockResolvedValue({ binary: false, auth: false, ready: false });
        const program = new Command();
        program.exitOverride();
        registerChat__tsm_001(program);
        const origExitCode = process.exitCode;
        await program.parseAsync(['node', 'deckent', 'chat', '--tool', 'codex']);
        expect(legacyHoisted.spawnMock).not.toHaveBeenCalled();
        expect(legacyHoisted.printErrorMock).toHaveBeenCalled();
        const errArg = legacyHoisted.printErrorMock.mock.calls[0][0] as Error;
        expect(errArg.message).toContain('"codex"');
        expect(process.exitCode).toBe(1);
        process.exitCode = origExitCode as number;
    });
});
}
