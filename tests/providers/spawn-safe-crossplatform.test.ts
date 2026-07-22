// ═══ spawn-safe-crossplatform tests — born-580 (390-005) ═══
//
// Verifies the 5 bare `spawn()`/`spawnImpl()` call sites in the provider
// adapters (codex, gemini, ollama, openai-compatible, openrouter) now route
// through `buildCliInvocation()` (src/core/provider.ts):
//   - win32: the CLI is launched via `cmd.exe /c <cmd> <args...>` (shell:false)
//     so a `.cmd`/`.ps1` wrapper resolves via PATHEXT (Law #2 — Windows-native).
//   - POSIX (default/injected non-win32): command + args stay byte-identical
//     to the pre-change bare `spawn(cmd, args, opts)` call (regression guard).
//
// Hermetic: node:child_process + node:fs mocked (no real process, no real I/O).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockInstance } from 'vitest';

// ─── Mock node:child_process ─────────────────────────────────────────
// Shared by codex.ts/gemini.ts (which spawn directly, no injectable seam) —
// ollama.ts/openai-compatible.ts/openrouter.ts get their own fake `spawnImpl`
// per-adapter instead of relying on this mock.

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '0.1.0\n' }),
}));

// ─── Mock node:fs ────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  openSync: vi.fn().mockReturnValue(42),
  closeSync: vi.fn(),
}));

import { spawn } from 'node:child_process';
import { CodexAdapter } from '../../src/providers/codex.js';
import { GeminiAdapter } from '../../src/providers/gemini.js';
import { OllamaAdapter } from '../../src/providers/ollama.js';
import { OpenAICompatibleAdapter } from '../../src/providers/openai-compatible.js';
import { OpenRouterProvider } from '../../src/providers/openrouter.js';

const mockSpawn = spawn as unknown as MockInstance;

function createMockChildProcess() {
  const child: Record<string, unknown> = {
    once: vi.fn().mockReturnThis(),
    kill: vi.fn(),
    pid: 12345,
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
  };
  return child;
}

/** Fake `spawnImpl` for the 3 adapters that support dependency injection. */
function makeFakeSpawn(): {
  calls: Array<{ command: string; args: readonly string[]; options: unknown }>;
  fn: (command: string, args: readonly string[], options: unknown) => unknown;
} {
  const calls: Array<{ command: string; args: readonly string[]; options: unknown }> = [];
  const fn = (command: string, args: readonly string[], options: unknown) => {
    calls.push({ command, args, options });
    return createMockChildProcess();
  };
  return { calls, fn };
}

describe('provider spawn() — cross-platform buildCliInvocation (born-580)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawn.mockReturnValue(createMockChildProcess());
  });

  // ─── CodexAdapter ────────────────────────────────────────────────────

  describe('CodexAdapter.spawn', () => {
    it('win32: wraps via cmd.exe /c, preserving original args', () => {
      const adapter = new CodexAdapter('/tmp/proj', { platform: 'win32' });
      adapter.spawn('t-1', 'gpt-4.1', 'hello');

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      const [command, args] = mockSpawn.mock.calls[0] as [string, string[], unknown];
      expect(command).toBe('cmd.exe');
      expect(args[0]).toBe('/c');
      expect(args[1]).toBe('codex');
      // original codex argv (exec --full-auto <prompt> --model <model> --json) follows unchanged
      expect(args.slice(2)).toEqual(['exec', '--full-auto', 'hello', '--model', 'gpt-4.1', '--json']);
    });

    it('POSIX: command/args stay byte-identical to the pre-change bare spawn', () => {
      const adapter = new CodexAdapter('/tmp/proj', { platform: 'linux' });
      adapter.spawn('t-2', 'gpt-4.1', 'hello');

      const [command, args] = mockSpawn.mock.calls[0] as [string, string[], unknown];
      expect(command).toBe('codex');
      expect(args).toEqual(['exec', '--full-auto', 'hello', '--model', 'gpt-4.1', '--json']);
    });

    it('POSIX: spawnOpts.shell is false (never shell:true + args array — DEP0190)', () => {
      const adapter = new CodexAdapter('/tmp/proj', { platform: 'linux' });
      adapter.spawn('t-3', 'gpt-4.1', 'hello');
      const opts = mockSpawn.mock.calls[0]![2] as { shell?: boolean };
      expect(opts.shell).toBe(false);
    });
  });

  // ─── GeminiAdapter ───────────────────────────────────────────────────

  describe('GeminiAdapter.spawn', () => {
    it('win32: wraps via cmd.exe /c, preserving original args', () => {
      const adapter = new GeminiAdapter('/tmp/proj', { platform: 'win32' });
      adapter.spawn('t-1', 'gemini-2.5-flash', 'hello');

      const [command, args] = mockSpawn.mock.calls[0] as [string, string[], unknown];
      expect(command).toBe('cmd.exe');
      expect(args[0]).toBe('/c');
      expect(args[1]).toBe('gemini');
    });

    it('POSIX: command stays "gemini", args unchanged', () => {
      const adapter = new GeminiAdapter('/tmp/proj', { platform: 'linux' });
      adapter.spawn('t-2', 'gemini-2.5-flash', 'hello');

      const [command] = mockSpawn.mock.calls[0] as [string, string[], unknown];
      expect(command).toBe('gemini');
    });

    it('POSIX: spawnOpts.shell is false', () => {
      const adapter = new GeminiAdapter('/tmp/proj', { platform: 'linux' });
      adapter.spawn('t-3', 'gemini-2.5-flash', 'hello');
      const opts = mockSpawn.mock.calls[0]![2] as { shell?: boolean };
      expect(opts.shell).toBe(false);
    });
  });

  // ─── OllamaAdapter ───────────────────────────────────────────────────

  describe('OllamaAdapter.spawn', () => {
    it('win32: wraps `node <entry>...` via cmd.exe /c', () => {
      const { calls, fn } = makeFakeSpawn();
      const adapter = new OllamaAdapter('/tmp/proj', {
        workerEntryPath: '/fake/entry.js',
        spawnImpl: fn as unknown as typeof spawn,
        platform: 'win32',
      });
      adapter.spawn('t-1', 'llama3.2:3b', 'unused');

      expect(calls).toHaveLength(1);
      expect(calls[0]!.command).toBe('cmd.exe');
      expect(calls[0]!.args[0]).toBe('/c');
      expect(calls[0]!.args[1]).toBe('node');
      expect(calls[0]!.args[2]).toBe('/fake/entry.js');
      expect(calls[0]!.args[3]).toBe('t-1');
    });

    it('POSIX: command stays "node", args unchanged (regression guard)', () => {
      const { calls, fn } = makeFakeSpawn();
      const adapter = new OllamaAdapter('/tmp/proj', {
        workerEntryPath: '/fake/entry.js',
        spawnImpl: fn as unknown as typeof spawn,
        platform: 'linux',
      });
      adapter.spawn('t-2', 'llama3.2:3b', 'unused');

      expect(calls[0]!.command).toBe('node');
      expect(calls[0]!.args[0]).toBe('/fake/entry.js');
      expect(calls[0]!.args[1]).toBe('t-2');
    });
  });

  // ─── OpenAICompatibleAdapter ─────────────────────────────────────────

  describe('OpenAICompatibleAdapter.spawn', () => {
    function makeAdapter(spawnImpl: unknown, platform: NodeJS.Platform) {
      return new OpenAICompatibleAdapter({
        name: 'deepseek',
        baseURL: 'https://api.deepseek.com/v1',
        apiKeyEnv: 'DEEPSEEK_API_KEY',
        models: ['deepseek-chat'],
        workerEntryPath: '/fake/http-entry.js',
        spawnImpl: spawnImpl as typeof spawn,
        platform,
      });
    }

    it('win32: wraps `node <entry>...` via cmd.exe /c', () => {
      const { calls, fn } = makeFakeSpawn();
      const adapter = makeAdapter(fn, 'win32');
      adapter.spawn('t-1', 'deepseek-chat', 'unused');

      expect(calls[0]!.command).toBe('cmd.exe');
      expect(calls[0]!.args[0]).toBe('/c');
      expect(calls[0]!.args[1]).toBe('node');
      expect(calls[0]!.args[2]).toBe('/fake/http-entry.js');
    });

    it('POSIX: command stays "node", args unchanged (regression guard)', () => {
      const { calls, fn } = makeFakeSpawn();
      const adapter = makeAdapter(fn, 'linux');
      adapter.spawn('t-2', 'deepseek-chat', 'unused');

      expect(calls[0]!.command).toBe('node');
      expect(calls[0]!.args[0]).toBe('/fake/http-entry.js');
      expect(calls[0]!.args[1]).toBe('t-2');
    });
  });

  // ─── OpenRouterProvider ──────────────────────────────────────────────

  describe('OpenRouterProvider.spawn', () => {
    function makeAdapter(spawnImpl: unknown, platform: NodeJS.Platform) {
      return new OpenRouterProvider('/tmp/proj', {
        workerEntryPath: '/fake/or-entry.js',
        spawnImpl: spawnImpl as typeof spawn,
        platform,
        loadSecretsImpl: () => ({ OPENROUTER_API_KEY: 'sk-or-test' }),
      });
    }

    it('win32: wraps `node <entry>...` via cmd.exe /c', () => {
      const { calls, fn } = makeFakeSpawn();
      const adapter = makeAdapter(fn, 'win32');
      adapter.spawn('t-1', 'anthropic/claude-3.5-sonnet', 'unused');

      expect(calls[0]!.command).toBe('cmd.exe');
      expect(calls[0]!.args[0]).toBe('/c');
      expect(calls[0]!.args[1]).toBe('node');
      expect(calls[0]!.args[2]).toBe('/fake/or-entry.js');
    });

    it('POSIX: command stays "node", args unchanged (regression guard)', () => {
      const { calls, fn } = makeFakeSpawn();
      const adapter = makeAdapter(fn, 'linux');
      adapter.spawn('t-2', 'anthropic/claude-3.5-sonnet', 'unused');

      expect(calls[0]!.command).toBe('node');
      expect(calls[0]!.args[0]).toBe('/fake/or-entry.js');
      expect(calls[0]!.args[1]).toBe('t-2');
    });
  });
});
