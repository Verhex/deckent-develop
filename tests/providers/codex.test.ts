import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';

// ─── Mock node:child_process ─────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

// ─── Mock node:fs ────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  openSync: vi.fn().mockReturnValue(42),
  closeSync: vi.fn(),
}));

import { CodexAdapter, createCodexAdapter, CODEX_TIER_MODELS } from '../../src/providers/codex.js';
import type { CodexAuthMode, CodexCliVariant } from '../../src/providers/codex.js';
import { ProviderError } from '../../src/core/provider.js';
import type { ProviderSpawnOptions } from '../../src/core/provider.js';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolveCrossProviderCredentialKeys } from '../../src/providers/cross-provider-keys.js';

const mockSpawn = spawn as unknown as MockInstance;
const mockSpawnSync = spawnSync as unknown as MockInstance;

const mockExistsSync = existsSync as unknown as MockInstance;
const mockMkdirSync = mkdirSync as unknown as MockInstance;
const mockWriteFileSync = writeFileSync as unknown as MockInstance;

function createMockChildProcess() {
  return {
    once: vi.fn().mockReturnThis(),
    kill: vi.fn(),
    pid: 12345,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('CodexAdapter', () => {
  const projectDir = '/tmp/test-codex-project';
  let adapter: CodexAdapter;
  let mockChildProcess: ReturnType<typeof createMockChildProcess>;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env['OPENAI_API_KEY'] = 'sk-test-key-123';
    mockChildProcess = createMockChildProcess();
    mockSpawn.mockReturnValue(mockChildProcess);
    adapter = new CodexAdapter(projectDir);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ─── Identity ──────────────────────────────────────────────────────

  describe('identity', () => {
    it('should have name "codex"', () => {
      expect(adapter.name).toBe('codex');
    });

    it('should support gpt-4.1, o3, o4-mini models', () => {
      expect(adapter.supportedModels).toContain('gpt-4.1');
      expect(adapter.supportedModels).toContain('o3');
      expect(adapter.supportedModels).toContain('o4-mini');
    });

    it('should support exactly 9 canonical models (6 builtin + 3 pinned parity)', () => {
      // 2026-07-11 (MASTER-PLAN 538): providers/codex.ts registers
      // CODEX_PARITY_MODELS (gpt-5.6-sol/-terra/-luna) into the
      // singleton registry at module-load, so the adapter's registry-derived
      // model list grows 6 → 9 with pinned IDs only.
      expect(adapter.supportedModels).toHaveLength(9);
      for (const id of ['gpt-5.5', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']) {
        expect(adapter.supportedModels).toContain(id);
      }
      expect(adapter.supportedModels).not.toContain('gpt-5.6');
    });

    it('should support gpt-5.5, gpt-5-mini, gpt-4.1-mini models', () => {
      expect(adapter.supportedModels).toContain('gpt-5.5');
      expect(adapter.supportedModels).not.toContain('gpt-5');
      expect(adapter.supportedModels).toContain('gpt-5-mini');
      expect(adapter.supportedModels).toContain('gpt-4.1-mini');
    });

    it('should implement ProviderAdapter interface', () => {
      expect(typeof adapter.name).toBe('string');
      expect(Array.isArray(adapter.supportedModels)).toBe(true);
      expect(typeof adapter.spawn).toBe('function');
      expect(typeof adapter.kill).toBe('function');
      expect(typeof adapter.listWorkers).toBe('function');
      expect(typeof adapter.isAvailable).toBe('function');
      expect(typeof adapter.buildCommand).toBe('function');
    });
  });

  // ─── spawn() ───────────────────────────────────────────────────────

  describe('spawn()', () => {
    it('should spawn codex process with exec --full-auto and correct model', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'test prompt');
      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        // CODEX_USAGE_EMIT_ARGS (`--json`) is appended so codex prints token_count
        // events to stdout (provider-agnostic usage capture, Sprint 328 Class-A).
        ['exec', '--full-auto', 'test prompt', '--model', 'gpt-4.1', '--json'],
        expect.any(Object),
      );
    });

    it('should have exec as the first arg and --full-auto as second', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'test prompt');
      const args = mockSpawn.mock.calls[0][1] as string[];
      expect(args[0]).toBe('exec');
      expect(args[1]).toBe('--full-auto');
    });

    it('should pass o3 model correctly', () => {
      adapter.spawn('task-002', 'o3', 'test prompt');
      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining(['--model', 'o3']),
        expect.any(Object),
      );
    });

    it('should pass o4-mini model correctly', () => {
      adapter.spawn('task-003', 'o4-mini', 'test prompt');
      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining(['--model', 'o4-mini']),
        expect.any(Object),
      );
    });

    it('should reject unsupported model', () => {
      expect(() => adapter.spawn('task-001', 'opus', 'prompt')).toThrow(ProviderError);
      expect(() => adapter.spawn('task-001', 'opus', 'prompt')).toThrow(/Unsupported model/);
    });

    it('should reject sonnet model', () => {
      expect(() => adapter.spawn('task-001', 'sonnet', 'prompt')).toThrow(ProviderError);
    });

    it('should reject haiku model', () => {
      expect(() => adapter.spawn('task-001', 'haiku', 'prompt')).toThrow(ProviderError);
    });

    it('should throw when spawning duplicate taskId', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      expect(() => adapter.spawn('task-001', 'gpt-4.1', 'prompt')).toThrow(
        /already running/,
      );
    });

    it('should pass prompt as positional arg (not stdin)', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'hello codex');
      const args = mockSpawn.mock.calls[0][1] as string[];
      expect(args).toContain('hello codex');
      expect(args[2]).toBe('hello codex');
    });

    it('should use opts.projectDir if provided', () => {
      const opts: ProviderSpawnOptions = { projectDir: '/custom/dir' };
      adapter.spawn('task-001', 'gpt-4.1', 'prompt', opts);
      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        expect.any(Array),
        expect.objectContaining({ cwd: '/custom/dir' }),
      );
    });

    it('should use constructor projectDir when opts.projectDir is absent', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        expect.any(Array),
        expect.objectContaining({ cwd: projectDir }),
      );
    });

    it('should create tasks directory if it does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.tasks'),
        { recursive: true },
      );
    });

    it('should write heartbeat file on spawn', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('task-task-001.hb'),
        expect.stringContaining('codex-task-001'),
        'utf-8',
      );
    });

    it('should always use --full-auto (autoApprove has no separate effect)', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt', { autoApprove: true });
      const args = mockSpawn.mock.calls[0][1] as string[];
      expect(args).toContain('--full-auto');
      // --approval-mode is not used — --full-auto is the Codex CLI equivalent
      expect(args).not.toContain('--approval-mode');
    });

    it('should not include --allowed-tools (not an official Codex CLI flag)', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt', { allowedTools: 'Read,Write' });
      const args = mockSpawn.mock.calls[0][1] as string[];
      expect(args).not.toContain('--allowed-tools');
    });

    it('should register exit handler on child process', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      expect(mockChildProcess.once).toHaveBeenCalledWith('exit', expect.any(Function));
    });

    it('should inject DECKENT_OPENAI_API_KEY as OPENAI_API_KEY when OPENAI_API_KEY is missing', () => {
      delete process.env['OPENAI_API_KEY'];
      process.env['DECKENT_OPENAI_API_KEY'] = 'sk-deck-key-456';
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      const spawnOpts = mockSpawn.mock.calls[0][2] as { env: Record<string, string> };
      expect(spawnOpts.env['OPENAI_API_KEY']).toBe('sk-deck-key-456');
      expect(spawnOpts.env['DECKENT_OPENAI_API_KEY']).toBeUndefined();
    });

    it('should not overwrite OPENAI_API_KEY with DECKENT_OPENAI_API_KEY when both present', () => {
      process.env['OPENAI_API_KEY'] = 'sk-original';
      process.env['DECKENT_OPENAI_API_KEY'] = 'sk-deck-key-456';
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      const spawnOpts = mockSpawn.mock.calls[0][2] as { env: Record<string, string> };
      expect(spawnOpts.env['OPENAI_API_KEY']).toBe('sk-original');
      expect(spawnOpts.env['DECKENT_OPENAI_API_KEY']).toBeUndefined();
    });

    it('should prefer an explicit owned OPENAI_API_KEY over host credentials', () => {
      process.env['OPENAI_API_KEY'] = 'sk-host';
      process.env['DECKENT_OPENAI_API_KEY'] = 'sk-deck';
      adapter.spawn('task-001', 'gpt-4.1', 'prompt', {
        env: { OPENAI_API_KEY: 'sk-explicit' },
      });

      const spawnOpts = mockSpawn.mock.calls[0][2] as { env: Record<string, string> };
      expect(spawnOpts.env['OPENAI_API_KEY']).toBe('sk-explicit');
      expect(spawnOpts.env['DECKENT_OPENAI_API_KEY']).toBeUndefined();
    });

    it('should scrub canonical, custom and raw deck credentials without mutating the host env', () => {
      const registry = [{
        name: 'my-llm',
        type: 'openai-compatible' as const,
        apiKeyEnv: 'MY_LLM_KEY',
      }];
      const credentialEnvKeys = resolveCrossProviderCredentialKeys({ registry });
      for (const key of credentialEnvKeys) process.env[key] = `${key}-HOST`;
      process.env['PATH'] = '/usr/bin:/bin';
      const hostSnapshot = Object.fromEntries(credentialEnvKeys.map((key) => [key, process.env[key]]));
      const scoped = new CodexAdapter(projectDir, { credentialEnvKeys });

      scoped.spawn('task-secret-scrub', 'gpt-4.1', 'prompt', {
        env: { OPENAI_API_KEY: 'sk-codex-OWN' },
      });

      const spawnOpts = mockSpawn.mock.calls[0][2] as { env: Record<string, string> };
      expect(spawnOpts.env['OPENAI_API_KEY']).toBe('sk-codex-OWN');
      for (const key of credentialEnvKeys) {
        if (key === 'OPENAI_API_KEY') continue;
        expect(spawnOpts.env[key], `Codex child must not see ${key}`).toBeUndefined();
        expect(process.env[key]).toBe(hostSnapshot[key]);
      }
      expect(spawnOpts.env['PATH']).toBe('/usr/bin:/bin');
      expect(process.env['OPENAI_API_KEY']).toBe(hostSnapshot['OPENAI_API_KEY']);
    });

    it('should keep subscription/session spawn free of every provider credential', () => {
      const credentialEnvKeys = resolveCrossProviderCredentialKeys();
      for (const key of credentialEnvKeys) process.env[key] = `${key}-HOST`;
      delete process.env['OPENAI_API_KEY'];
      delete process.env['DECKENT_OPENAI_API_KEY'];
      const scoped = new CodexAdapter(projectDir, { credentialEnvKeys });

      scoped.spawn('task-subscription-scrub', 'gpt-4.1', 'prompt');

      const spawnOpts = mockSpawn.mock.calls[0][2] as { env: Record<string, string> };
      for (const key of credentialEnvKeys) {
        expect(spawnOpts.env[key], `subscription Codex child must not see ${key}`).toBeUndefined();
      }
    });
  });

  // ─── kill() ────────────────────────────────────────────────────────

  describe('kill()', () => {
    it('should kill a running worker', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      adapter.kill('task-001');
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should remove worker from tracking after kill', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      adapter.kill('task-001');
      expect(adapter.listWorkers()).toEqual([]);
    });

    it('should throw when killing non-existent worker', () => {
      expect(() => adapter.kill('nonexistent')).toThrow(ProviderError);
      expect(() => adapter.kill('nonexistent')).toThrow(/No running worker/);
    });
  });

  // ─── listWorkers() ─────────────────────────────────────────────────

  describe('listWorkers()', () => {
    it('should return empty array initially', () => {
      expect(adapter.listWorkers()).toEqual([]);
    });

    it('should return spawned worker taskIds', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      mockSpawn.mockReturnValueOnce(createMockChildProcess());
      adapter.spawn('task-002', 'o3', 'prompt');
      expect(adapter.listWorkers()).toEqual(['task-001', 'task-002']);
    });

    it('should not include killed workers', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      adapter.kill('task-001');
      expect(adapter.listWorkers()).toEqual([]);
    });
  });

  // ─── isAvailable() ─────────────────────────────────────────────────

  describe('isAvailable()', () => {
    it('should return true when codex --version succeeds and API key set', async () => {
      mockSpawnSync.mockReturnValue({ status: 0, stdout: 'codex 1.0.0', stderr: '' });
      expect(await adapter.isAvailable()).toBe(true);
    });

    it('should return false when both OPENAI_API_KEY and DECKENT_OPENAI_API_KEY are missing and no subscription', async () => {
      delete process.env['OPENAI_API_KEY'];
      delete process.env['DECKENT_OPENAI_API_KEY'];
      // codex --version succeeds but codex login status reports logged out
      mockSpawnSync
        .mockReturnValueOnce({ status: 0, stdout: 'codex 1.0.0', stderr: '' })
        .mockReturnValueOnce({ status: 0, stdout: 'Not logged in', stderr: '' });
      expect(await adapter.isAvailable()).toBe(false);
    });

    it('should return true when only DECKENT_OPENAI_API_KEY is set', async () => {
      delete process.env['OPENAI_API_KEY'];
      process.env['DECKENT_OPENAI_API_KEY'] = 'sk-deck-test-123';
      mockSpawnSync.mockReturnValue({ status: 0, stdout: 'codex 1.0.0', stderr: '' });
      expect(await adapter.isAvailable()).toBe(true);
    });

    it('should return false when codex --version fails', async () => {
      mockSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'not found' });
      expect(await adapter.isAvailable()).toBe(false);
    });

    it('should return false when spawnSync throws', async () => {
      mockSpawnSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      expect(await adapter.isAvailable()).toBe(false);
    });

    it('should call codex --version', async () => {
      mockSpawnSync.mockReturnValue({ status: 0, stdout: 'codex 1.0.0', stderr: '' });
      await adapter.isAvailable();
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'codex',
        ['--version'],
        expect.objectContaining({ encoding: 'utf-8' }),
      );
    });

    it('should return true with subscription auth when no API key', async () => {
      delete process.env['OPENAI_API_KEY'];
      delete process.env['DECKENT_OPENAI_API_KEY'];
      mockSpawnSync
        .mockReturnValueOnce({ status: 0, stdout: 'codex 1.0.0', stderr: '' }) // --version
        .mockReturnValueOnce({ status: 0, stdout: 'Logged in using ChatGPT', stderr: '' }); // login status
      expect(await adapter.isAvailable()).toBe(true);
    });
  });

  // ─── detectAuthMode() ─────────────────────────────────────────────

  describe('detectAuthMode()', () => {
    it('should return api_key when OPENAI_API_KEY is set', () => {
      expect(adapter.detectAuthMode()).toBe('api_key');
    });

    it('should return api_key when only DECKENT_OPENAI_API_KEY is set', () => {
      delete process.env['OPENAI_API_KEY'];
      process.env['DECKENT_OPENAI_API_KEY'] = 'sk-deck-key';
      expect(adapter.detectAuthMode()).toBe('api_key');
    });

    it('should return subscription when codex login status reports logged in', () => {
      delete process.env['OPENAI_API_KEY'];
      delete process.env['DECKENT_OPENAI_API_KEY'];
      process.env['ANTHROPIC_API_KEY'] = 'foreign-anthropic';
      process.env['GOOGLE_API_KEY'] = 'foreign-google';
      process.env['OPENROUTER_API_KEY'] = 'foreign-openrouter';
      mockSpawnSync.mockReturnValue({ status: 0, stdout: 'Logged in using ChatGPT', stderr: '' });
      expect(adapter.detectAuthMode()).toBe('subscription');
      const options = mockSpawnSync.mock.calls.at(-1)?.[2] as { env?: NodeJS.ProcessEnv };
      expect(options.env).not.toHaveProperty('ANTHROPIC_API_KEY');
      expect(options.env).not.toHaveProperty('GOOGLE_API_KEY');
      expect(options.env).not.toHaveProperty('OPENROUTER_API_KEY');
      expect(options.env).not.toHaveProperty('OPENAI_API_KEY');
    });

    it('should return none when no API key and login status reports logged out', () => {
      delete process.env['OPENAI_API_KEY'];
      delete process.env['DECKENT_OPENAI_API_KEY'];
      mockSpawnSync.mockReturnValue({ status: 0, stdout: 'Not logged in', stderr: '' });
      expect(adapter.detectAuthMode()).toBe('none');
    });

    it('should return none when no API key and spawnSync throws', () => {
      delete process.env['OPENAI_API_KEY'];
      delete process.env['DECKENT_OPENAI_API_KEY'];
      mockSpawnSync.mockImplementation(() => { throw new Error('ENOENT'); });
      expect(adapter.detectAuthMode()).toBe('none');
    });

    it('should prefer API key over subscription check', () => {
      // API key set — should not call spawnSync for login status
      process.env['OPENAI_API_KEY'] = 'sk-test';
      const result = adapter.detectAuthMode();
      expect(result).toBe('api_key');
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });
  });

  // ─── detectCliVariant() ────────────────────────────────────────────

  describe('detectCliVariant()', () => {
    it('should return rust when output contains "codex" without "codex-cli"', () => {
      mockSpawnSync.mockReturnValue({ status: 0, stdout: 'codex 1.0.5', stderr: '' });
      expect(adapter.detectCliVariant()).toBe('rust');
    });

    it('should return node when output contains "codex-cli"', () => {
      mockSpawnSync.mockReturnValue({ status: 0, stdout: 'codex-cli 1.2.3', stderr: '' });
      expect(adapter.detectCliVariant()).toBe('node');
    });

    it('should return unknown when codex --version fails', () => {
      mockSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'not found' });
      expect(adapter.detectCliVariant()).toBe('unknown');
    });

    it('should return unknown when spawnSync throws', () => {
      mockSpawnSync.mockImplementation(() => { throw new Error('ENOENT'); });
      expect(adapter.detectCliVariant()).toBe('unknown');
    });

    it('should return unknown when output is empty', () => {
      mockSpawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '' });
      expect(adapter.detectCliVariant()).toBe('unknown');
    });
  });

  // ─── buildCommand() ────────────────────────────────────────────────

  describe('buildCommand()', () => {
    it('should build command with exec --full-auto and $(cat promptPath)', () => {
      const cmd = adapter.buildCommand('gpt-4.1', '/tmp/prompt.txt');
      expect(cmd).toBe('codex exec --full-auto "$(cat /tmp/prompt.txt)" --model gpt-4.1');
    });

    it('should include correct model in command', () => {
      expect(adapter.buildCommand('gpt-4.1', '/p')).toContain('--model gpt-4.1');
      expect(adapter.buildCommand('o3', '/p')).toContain('--model o3');
      expect(adapter.buildCommand('o4-mini', '/p')).toContain('--model o4-mini');
    });

    it('should not include --allowed-tools (not an official Codex CLI flag)', () => {
      const cmd = adapter.buildCommand('o3', '/tmp/p.txt', { allowedTools: 'Read,Write' });
      expect(cmd).not.toContain('--allowed-tools');
    });

    it('should always use --full-auto regardless of autoApprove option', () => {
      const cmd = adapter.buildCommand('o3', '/tmp/p.txt', { autoApprove: true });
      expect(cmd).toContain('--full-auto');
      // --approval-mode is not used in the new format
      expect(cmd).not.toContain('--approval-mode');
    });

    it('should use --full-auto even when autoApprove is false', () => {
      const cmd = adapter.buildCommand('o3', '/tmp/p.txt', { autoApprove: false });
      expect(cmd).toContain('--full-auto');
    });

    it('should use $(cat promptPath) for file-based prompt', () => {
      const cmd = adapter.buildCommand('gpt-4.1', '/path/to/prompt.txt');
      expect(cmd).toContain('$(cat /path/to/prompt.txt)');
    });

    it('should start with codex exec', () => {
      const cmd = adapter.buildCommand('gpt-4.1', '/tmp/p.txt');
      expect(cmd.startsWith('codex exec ')).toBe(true);
    });

    it('should not include --quiet (removed in exec format)', () => {
      const cmd = adapter.buildCommand('gpt-4.1', '/tmp/p.txt');
      expect(cmd).not.toContain('--quiet');
    });

    it('should not include stdin redirection (prompt is inline arg)', () => {
      const cmd = adapter.buildCommand('gpt-4.1', '/tmp/p.txt');
      expect(cmd).not.toMatch(/ < /);
    });
  });

  // ─── buildPlannerCommand() ─────────────────────────────────────────

  describe('buildPlannerCommand()', () => {
    it('should return command "codex" with exec --full-auto args', () => {
      const result = adapter.buildPlannerCommand('plan this', 'gpt-4.1');
      expect(result.command).toBe('codex');
      expect(result.args).toEqual(['exec', '--full-auto', 'plan this', '--model', 'gpt-4.1']);
    });

    it('should include the prompt as positional arg', () => {
      const result = adapter.buildPlannerCommand('my prompt here', 'o3');
      expect(result.args[2]).toBe('my prompt here');
    });

    it('should include the model', () => {
      const result = adapter.buildPlannerCommand('prompt', 'o4-mini');
      expect(result.args).toContain('o4-mini');
      expect(result.calledProvider).toBe('codex');
      expect(result.calledModel).toBe('o4-mini');
    });

    it('should expose the registry apiId as both wire and receipt model', () => {
      const result = adapter.buildPlannerCommand('prompt', 'gpt-5.5');
      expect(result.args).toContain('gpt-5.5');
      expect(result.calledModel).toBe('gpt-5.5');
    });
  });

  // ─── spawn stdio ─────────────────────────────────────────────────

  describe('spawn stdio', () => {
    it('should use ignore for stdin (prompt passed as arg, not piped)', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      const spawnOpts = mockSpawn.mock.calls[0][2] as NodeJS.ProcessEnv;
      expect((spawnOpts as any).stdio[0]).toBe('ignore');
    });
  });

  // ─── CODEX_TIER_MODELS ─────────────────────────────────────────────

  describe('CODEX_TIER_MODELS', () => {
    it('should map premium to gpt-5.5', () => {
      expect(CODEX_TIER_MODELS.premium).toBe('gpt-5.6-sol');
    });

    it('should map standard to gpt-4.1', () => {
      expect(CODEX_TIER_MODELS.standard).toBe('gpt-5.6-terra');
    });

    it('should map economy to gpt-5-mini', () => {
      expect(CODEX_TIER_MODELS.economy).toBe('gpt-5.6-luna');
    });
  });

  // ─── getModelForTier() ────────────────────────────────────────────

  describe('getModelForTier()', () => {
    it('should return correct model for each tier', () => {
      expect(adapter.getModelForTier('premium')).toBe('gpt-5.6-sol');
      expect(adapter.getModelForTier('standard')).toBe('gpt-5.6-terra');
      expect(adapter.getModelForTier('economy')).toBe('gpt-5.6-luna');
    });
  });

  // ─── detect() — 3-state availability (Sprint 190 Task 190-002) ────

  describe('detect()', () => {
    it('returns ready=true when binary present + OPENAI_API_KEY set', async () => {
      process.env['OPENAI_API_KEY'] = 'sk-test-key';
      mockSpawnSync.mockImplementation((cmd: string) => {
        if (cmd === 'which' || cmd === 'where') {
          return { status: 0, stdout: '/usr/local/bin/codex\n', stderr: '' };
        }
        return { status: 0, stdout: 'codex 0.18.2\n', stderr: '' };
      });
      const result = await adapter.detect();
      expect(result.binary).toBe(true);
      expect(result.auth).toBe(true);
      expect(result.ready).toBe(true);
      expect(result.version).toBe('0.18.2');
    });

    it("returns ready='partial' when binary present but no API key nor subscription", async () => {
      delete process.env['OPENAI_API_KEY'];
      delete process.env['DECKENT_OPENAI_API_KEY'];
      mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' || cmd === 'where') {
          return { status: 0, stdout: '/usr/local/bin/codex\n', stderr: '' };
        }
        if (cmd === 'codex' && args[0] === '--version') {
          return { status: 0, stdout: 'codex 0.18.2\n', stderr: '' };
        }
        // codex login status — not logged in
        return { status: 0, stdout: 'Not logged in', stderr: '' };
      });
      const result = await adapter.detect();
      expect(result.binary).toBe(true);
      expect(result.auth).toBe(false);
      expect(result.ready).toBe('partial');
    });

    it('returns ready=false when binary not found', async () => {
      process.env['OPENAI_API_KEY'] = 'sk-test-key';
      mockSpawnSync.mockImplementation(() => { throw new Error('ENOENT'); });
      const result = await adapter.detect();
      expect(result.binary).toBe(false);
      expect(result.ready).toBe(false);
    });

    it('returns ready=true via subscription auth (codex login status logged in)', async () => {
      delete process.env['OPENAI_API_KEY'];
      delete process.env['DECKENT_OPENAI_API_KEY'];
      mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' || cmd === 'where') {
          return { status: 0, stdout: '/usr/local/bin/codex\n', stderr: '' };
        }
        if (cmd === 'codex' && args[0] === '--version') {
          return { status: 0, stdout: 'codex 0.18.2\n', stderr: '' };
        }
        // codex login status — logged in
        return { status: 0, stdout: 'Logged in using ChatGPT\n', stderr: '' };
      });
      const result = await adapter.detect();
      expect(result.binary).toBe(true);
      expect(result.auth).toBe(true);
      expect(result.ready).toBe(true);
    });

    it('detects DECKENT_OPENAI_API_KEY as valid auth source', async () => {
      delete process.env['OPENAI_API_KEY'];
      process.env['DECKENT_OPENAI_API_KEY'] = 'sk-deck-test';
      mockSpawnSync.mockImplementation((cmd: string) => {
        if (cmd === 'which' || cmd === 'where') {
          return { status: 0, stdout: '/usr/local/bin/codex\n', stderr: '' };
        }
        return { status: 0, stdout: 'codex 0.18.2\n', stderr: '' };
      });
      const result = await adapter.detect();
      expect(result.auth).toBe(true);
      expect(result.ready).toBe(true);
    });
  });

  // ─── Accessors ─────────────────────────────────────────────────────

  describe('accessors', () => {
    it('getProjectDir should return constructor projectDir', () => {
      expect(adapter.getProjectDir()).toBe(projectDir);
    });

    it('getLogPath should return correct log path', () => {
      expect(adapter.getLogPath('task-001')).toContain('task-task-001.log');
      expect(adapter.getLogPath('task-001')).toContain('.tasks');
    });

    it('getWorkerEntry should return undefined for unknown task', () => {
      expect(adapter.getWorkerEntry('unknown')).toBeUndefined();
    });

    it('getWorkerEntry should return entry for spawned worker', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      const entry = adapter.getWorkerEntry('task-001');
      expect(entry).toBeDefined();
      expect(entry?.taskId).toBe('task-001');
    });
  });
});

// ─── createCodexAdapter factory ──────────────────────────────────────

describe('createCodexAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['OPENAI_API_KEY'] = 'sk-test-key-123';
  });

  it('should create a CodexAdapter instance', () => {
    const adapter = createCodexAdapter('/some/dir');
    expect(adapter).toBeInstanceOf(CodexAdapter);
  });

  it('should create adapter with given project directory', () => {
    const adapter = createCodexAdapter('/my/project');
    expect(adapter.getProjectDir()).toBe('/my/project');
  });

  it('should pass options to constructor', () => {
    const adapter = createCodexAdapter('/dir', { defaultTimeoutMs: 5000 });
    expect(adapter).toBeInstanceOf(CodexAdapter);
  });
});
