// tests/orchestra/subproc-provider-cli.test.ts
//
// Task 364-002 SUBPROC-PROVIDER-CLI (born-481, log-evidenced): the subprocess
// spawn backend always defaulted to CLAUDE_SUBPROCESS_CONFIG regardless of the
// spawned task's actual provider — a provider:codex task's model apiId
// (gpt-5.5) was fed to the claude CLI's --model flag, which the Claude API
// rejects (404 -> worker exit 1).
//
// REPRO (verified before the fix via `git stash` on src/orchestra/spawn-backend.ts,
// 363-002-shaped fixture): with the pre-364-002 SubprocessBackend, spawning a
// codex-provider model through this backend constructed a SINGLE
// SubprocessSpawnBackend with NO providerConfig override, so every codex-task
// assertion below (`config.cliCommand === 'codex'`, `command` containing
// `'codex exec'`) FAILED — the captured providerConfig read 'claude' for
// every provider. This file hermetically pins the fix red-to-green.
//
// Hermetic: SubprocessSpawnBackend is fully mocked (constructor + spawn/kill/
// listWorkers spies) — no real process is ever spawned. Every assertion reads
// the `providerConfig` handed to the constructor and its own
// buildArgs()/buildCommandString() output.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { subprocessCtorSpy } = vi.hoisted(() => ({ subprocessCtorSpy: vi.fn() }));
const TEST_CLAUDE_AUTH_BYPASS = {
  env: {
    DECKENT_AUTH_SKIP: '1',
    NODE_ENV: 'test',
    VITEST: 'true',
  },
} as const;

vi.mock('../../src/providers/subprocess.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/providers/subprocess.js')>();
  class MockSubprocessSpawnBackend {
    private readonly workers: string[] = [];
    readonly kill = vi.fn((taskId: string) => {
      const idx = this.workers.indexOf(taskId);
      if (idx >= 0) this.workers.splice(idx, 1);
    });
    readonly isAvailable = vi.fn().mockResolvedValue(true);

    constructor(projectDir: string, opts?: Record<string, unknown>) {
      subprocessCtorSpy(projectDir, opts, this);
    }

    spawn(taskId: string): void {
      this.workers.push(taskId);
    }

    listWorkers(): string[] {
      return this.workers;
    }
  }
  return {
    ...actual,
    SubprocessSpawnBackend: MockSubprocessSpawnBackend,
  };
});

import { SubprocessBackend, SpawnBackendError } from '../../src/orchestra/spawn-backend.js';
import { CLAUDE_SUBPROCESS_CONFIG } from '../../src/providers/subprocess.js';
import type { SubprocessProviderConfig } from '../../src/providers/subprocess.js';
import type { ModelType } from '../../src/core/types.js';
import { registerOllamaModels } from '../../src/core/model-registry.js';

// Ollama models are opt-in (registered by providers/ollama.js at module-load
// time in production) — register them explicitly so 'qwen-coder-32b' below
// resolves to provider 'ollama' instead of falling through to the
// unregistered-id default (claude).
registerOllamaModels();

interface MockInstance {
  kill: ReturnType<typeof vi.fn>;
  listWorkers: () => string[];
}

/** Read the `providerConfig` passed to the Nth SubprocessSpawnBackend construction. */
function providerConfigFromCall(callIndex: number): SubprocessProviderConfig {
  const call = subprocessCtorSpy.mock.calls[callIndex];
  const opts = call?.[1] as { providerConfig?: SubprocessProviderConfig } | undefined;
  const config = opts?.providerConfig;
  if (!config) throw new Error(`No providerConfig captured for constructor call ${callIndex}`);
  return config;
}

/** Read the mock SubprocessSpawnBackend instance created on the Nth construction. */
function instanceFromCall(callIndex: number): MockInstance {
  const call = subprocessCtorSpy.mock.calls[callIndex];
  return call?.[2] as MockInstance;
}

beforeEach(() => {
  subprocessCtorSpy.mockClear();
});

describe('SUBPROC-PROVIDER-CLI (364-002, born-481)', () => {
  // ─── codex task → codex CLI, never claude ──────────────────────────────

  describe('codex-provider task', () => {
    it('constructs SubprocessSpawnBackend with a codex providerConfig (not claude)', () => {
      const backend = new SubprocessBackend('/proj');
      backend.spawn('t-codex-1', 'gpt-5.5' as ModelType, 'prompt', {});

      expect(subprocessCtorSpy).toHaveBeenCalledTimes(1);
      const config = providerConfigFromCall(0);
      expect(config.cliCommand).toBe('codex');
      expect(config.cliCommand).not.toBe('claude');
    });

    it('produces a `codex exec` command (string-assert) — the born-481 fix', () => {
      const backend = new SubprocessBackend('/proj');
      backend.spawn('t-codex-2', 'gpt-5.5' as ModelType, 'prompt', { autoApprove: true });

      const config = providerConfigFromCall(0);
      const args = config.buildArgs('gpt-5.5' as ModelType, { autoApprove: true });
      const command = `${config.cliCommand} ${args.join(' ')}`;

      expect(command).toContain('codex exec');
      // The wire model id must be the registry apiId (gpt-5.5), never the
      // deckent-facing alias (gpt-5) — this exact mismatch is what made the
      // pre-fix claude-CLI spawn 404 (a claude CLI fed --model gpt-5.5).
      expect(args).toContain('--model');
      expect(args).toContain('gpt-5.5');
      expect(args).not.toContain('gpt-5');
    });

    it('autoApprove appends the codex sandbox-bypass flag only when set', () => {
      const backend = new SubprocessBackend('/proj');
      backend.spawn('t-codex-3', 'gpt-5.5' as ModelType, 'prompt', {});
      const config = providerConfigFromCall(0);

      const withoutApprove = config.buildArgs('gpt-5.5' as ModelType, {});
      expect(withoutApprove).not.toContain('--dangerously-bypass-approvals-and-sandbox');

      const withApprove = config.buildArgs('gpt-5.5' as ModelType, { autoApprove: true });
      expect(withApprove).toContain('--dangerously-bypass-approvals-and-sandbox');
    });

    it('applies codex reasoning-effort via -c model_reasoning_effort=<level>', () => {
      const backend = new SubprocessBackend('/proj');
      backend.spawn('t-codex-4', 'gpt-5.5' as ModelType, 'prompt', {});
      const config = providerConfigFromCall(0);

      const args = config.buildArgs('gpt-5.5' as ModelType, { reasoningEffort: 'high' });
      expect(args).toContain('-c');
      expect(args).toContain('model_reasoning_effort=high');
    });

    it('carries the usage-emit flag ONLY via usageEmitArgs, never inline in buildArgs (dry-run stability)', () => {
      const backend = new SubprocessBackend('/proj');
      backend.spawn('t-codex-5', 'gpt-5.5' as ModelType, 'prompt', {});
      const config = providerConfigFromCall(0);

      const args = config.buildArgs('gpt-5.5' as ModelType, {});
      expect(args).not.toContain('--json');
      expect(config.usageEmitArgs).toEqual(['--json']);
    });

    it('buildCommandString() also reads `codex exec ... < <promptPath>`', () => {
      const backend = new SubprocessBackend('/proj');
      backend.spawn('t-codex-6', 'gpt-5.5' as ModelType, 'prompt', {});
      const config = providerConfigFromCall(0);

      const cmd = config.buildCommandString('gpt-5.5' as ModelType, '/tmp/.tasks/.prompt-t-codex-6.txt', {});
      expect(cmd).toContain('codex exec');
      expect(cmd).toContain('< /tmp/.tasks/.prompt-t-codex-6.txt');
    });
  });

  // ─── claude task → byte-identical to pre-364-002 ───────────────────────

  describe('claude-provider task', () => {
    it('constructs SubprocessSpawnBackend with the exact CLAUDE_SUBPROCESS_CONFIG singleton', () => {
      const backend = new SubprocessBackend('/proj');
      backend.spawn(
        't-claude-1',
        'claude-sonnet-5' as ModelType,
        'prompt',
        TEST_CLAUDE_AUTH_BYPASS,
      );

      const config = providerConfigFromCall(0);
      expect(config).toBe(CLAUDE_SUBPROCESS_CONFIG);
      expect(config.cliCommand).toBe('claude');
    });

    it('buildArgs output is unchanged from CLAUDE_SUBPROCESS_CONFIG directly (byte-identical)', () => {
      const backend = new SubprocessBackend('/proj');
      const opts = {
        autoApprove: true,
        allowedTools: 'Read,Edit',
        ...TEST_CLAUDE_AUTH_BYPASS,
      };
      backend.spawn('t-claude-2', 'claude-sonnet-5' as ModelType, 'prompt', opts);

      const config = providerConfigFromCall(0);
      const viaBackend = config.buildArgs('claude-sonnet-5' as ModelType, opts);
      const viaDirect = CLAUDE_SUBPROCESS_CONFIG.buildArgs('claude-sonnet-5' as ModelType, opts);
      expect(viaBackend).toEqual(viaDirect);
    });
  });

  // ─── unknown / backend-incompatible provider → honest error, never claude ──

  describe('unsupported provider — honest failure (Yasa #2: no silent claude fallback)', () => {
    it('gemini (inline promptFeed, incompatible with this backend) throws SpawnBackendError', () => {
      const backend = new SubprocessBackend('/proj');
      expect(() =>
        backend.spawn('t-gemini-1', 'gemini-2.5-flash' as ModelType, 'prompt', {}),
      ).toThrow(SpawnBackendError);
      // No SubprocessSpawnBackend (claude or otherwise) was ever constructed —
      // the born-481 bug was exactly this: a wrong-provider spawn going ahead.
      expect(subprocessCtorSpy).not.toHaveBeenCalled();
    });

    it('gemini error names the reason (inline-arg CLI, stdin-only backend)', () => {
      const backend = new SubprocessBackend('/proj');
      try {
        backend.spawn('t-gemini-2', 'gemini-2.5-flash' as ModelType, 'prompt', {});
        expect.fail('expected SpawnBackendError');
      } catch (e) {
        expect(e).toBeInstanceOf(SpawnBackendError);
        const err = e as InstanceType<typeof SpawnBackendError>;
        expect(err.backendName).toBe('subprocess');
        expect(err.message).toContain('gemini');
      }
    });

    it('ollama (host-only, no ProviderCommandSpec) throws SpawnBackendError', () => {
      const backend = new SubprocessBackend('/proj');
      expect(() =>
        backend.spawn('t-ollama-1', 'qwen2.5-coder:32b' as ModelType, 'prompt', {}),
      ).toThrow(SpawnBackendError);
      expect(subprocessCtorSpy).not.toHaveBeenCalled();
    });

    it('a fully unregistered model id fails before any provider backend is constructed', () => {
      const backend = new SubprocessBackend('/proj');
      expect(() =>
        backend.spawn('t-unknown-1', 'totally-unregistered-model-id' as ModelType, 'prompt', {}),
      ).toThrow(SpawnBackendError);
      expect(subprocessCtorSpy).not.toHaveBeenCalled();
    });
  });

  // ─── mixed-provider sprint on ONE SubprocessBackend instance ───────────

  describe('mixed-provider sprint (spawn_backend=subprocess for both claude + codex tasks)', () => {
    it('distinguishes restart-unknown inventory from observed-and-absent workers', () => {
      const backend = new SubprocessBackend('/proj');
      expect(backend.workerInventoryState('born-before-restart')).toBe('unknown');

      backend.spawn('observed-worker', 'gpt-5.5' as ModelType, 'prompt', {});
      expect(backend.workerInventoryState('observed-worker')).toBe('active');

      backend.kill('observed-worker');
      expect(backend.workerInventoryState('observed-worker')).toBe('absent');
    });

    it('keeps a per-task-timeout backend visible to list and kill authority', () => {
      const backend = new SubprocessBackend('/proj');
      backend.spawn('timed-worker', 'gpt-5.5' as ModelType, 'prompt', {
        taskTimeoutSeconds: 30,
      });

      expect(backend.list()).toContain('timed-worker');
      expect(backend.workerInventoryState('timed-worker')).toBe('active');
      backend.kill('timed-worker');
      expect(backend.workerInventoryState('timed-worker')).toBe('absent');
    });

    it('each provider gets its OWN SubprocessSpawnBackend instance with the right CLI', () => {
      const backend = new SubprocessBackend('/proj');
      backend.spawn('t-mix-codex', 'gpt-5.5' as ModelType, 'prompt', {});
      backend.spawn(
        't-mix-claude',
        'claude-sonnet-5' as ModelType,
        'prompt',
        TEST_CLAUDE_AUTH_BYPASS,
      );

      expect(subprocessCtorSpy).toHaveBeenCalledTimes(2);
      const codexConfig = providerConfigFromCall(0);
      const claudeConfig = providerConfigFromCall(1);
      expect(codexConfig.cliCommand).toBe('codex');
      expect(claudeConfig.cliCommand).toBe('claude');
    });

    it('spawning a SECOND codex task reuses the cached codex backend (no new construction)', () => {
      const backend = new SubprocessBackend('/proj');
      backend.spawn('t-mix-codex-a', 'gpt-5.5' as ModelType, 'prompt', {});
      backend.spawn('t-mix-codex-b', 'o4-mini' as ModelType, 'prompt', {});

      // Both codex tasks share ONE constructed backend instance.
      expect(subprocessCtorSpy).toHaveBeenCalledTimes(1);
    });

    it('list() aggregates workers across every provider backend', () => {
      const backend = new SubprocessBackend('/proj');
      backend.spawn('t-list-codex', 'gpt-5.5' as ModelType, 'prompt', {});
      backend.spawn(
        't-list-claude',
        'claude-sonnet-5' as ModelType,
        'prompt',
        TEST_CLAUDE_AUTH_BYPASS,
      );

      expect(backend.list().sort()).toEqual(['t-list-claude', 't-list-codex'].sort());
    });

    it('kill() routes to the backend instance that actually holds the taskId', () => {
      const backend = new SubprocessBackend('/proj');
      backend.spawn('t-kill-codex', 'gpt-5.5' as ModelType, 'prompt', {});
      backend.spawn(
        't-kill-claude',
        'claude-sonnet-5' as ModelType,
        'prompt',
        TEST_CLAUDE_AUTH_BYPASS,
      );

      const codexInstance = instanceFromCall(0);
      const claudeInstance = instanceFromCall(1);

      backend.kill('t-kill-codex');

      expect(codexInstance.kill).toHaveBeenCalledWith('t-kill-codex');
      expect(claudeInstance.kill).not.toHaveBeenCalled();
      expect(backend.list()).toEqual(['t-kill-claude']);
    });
  });
});
