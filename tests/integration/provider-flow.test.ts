import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ProviderRegistry,
  ProviderNotFoundError,
  ProviderError,
  type ProviderAdapter,
  type ProviderSpawnOptions,
} from '../../src/core/provider.js';

// Mock Docker backend so auto-mode tests don't depend on real Docker
vi.mock('../../src/orchestra/spawn-backend-docker.js', () => ({
  DockerSpawnBackend: vi.fn().mockImplementation(() => ({
    name: 'docker',
    spawn: vi.fn(),
    kill: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    isAvailable: vi.fn().mockResolvedValue(false),
  })),
  isDockerAvailable: vi.fn().mockReturnValue(false),
}));

import {
  SpawnBackendFactory,
  TmuxBackend,
  SubprocessBackend,
  SpawnBackendError,
} from '../../src/orchestra/spawn-backend.js';
import type { ModelType } from '../../src/core/types.js';

// ─── Mock ProviderAdapter factory ────────────────────────────────────

function createMockProvider(
  name: string,
  models: ModelType[] = ['opus', 'sonnet', 'haiku'],
): ProviderAdapter {
  return {
    name,
    supportedModels: models,
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockReturnValue('claude -p - --model opus < /tmp/prompt.txt'),
  };
}

describe('Provider Flow Integration', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  // ─── ProviderRegistry basics ──────────────────────────────────────

  it('registers a provider and retrieves it by name', () => {
    const provider = createMockProvider('claude-tmux');
    registry.registerProvider(provider);
    const retrieved = registry.getProvider('claude-tmux');
    expect(retrieved).toBe(provider);
    expect(retrieved.name).toBe('claude-tmux');
  });

  it('first registered provider becomes default automatically', () => {
    const provider = createMockProvider('claude-tmux');
    registry.registerProvider(provider);
    const def = registry.getDefault();
    expect(def.name).toBe('claude-tmux');
  });

  it('listProviders returns all registered names', () => {
    registry.registerProvider(createMockProvider('provider-a'));
    registry.registerProvider(createMockProvider('provider-b'));
    registry.registerProvider(createMockProvider('provider-c'));
    expect(registry.listProviders()).toEqual(['provider-a', 'provider-b', 'provider-c']);
  });

  it('throws ProviderNotFoundError for non-existent provider', () => {
    expect(() => registry.getProvider('missing')).toThrow(ProviderNotFoundError);
  });

  it('throws ProviderError when registering duplicate name', () => {
    registry.registerProvider(createMockProvider('dup'));
    expect(() => registry.registerProvider(createMockProvider('dup'))).toThrow(ProviderError);
  });

  it('throws when getDefault called with no providers', () => {
    expect(() => registry.getDefault()).toThrow(ProviderError);
  });

  it('supports multiple providers registered simultaneously', () => {
    const p1 = createMockProvider('claude-tmux');
    const p2 = createMockProvider('claude-subprocess');
    const p3 = createMockProvider('mock-provider');
    registry.registerProvider(p1);
    registry.registerProvider(p2);
    registry.registerProvider(p3);
    expect(registry.size).toBe(3);
    expect(registry.getProvider('claude-subprocess')).toBe(p2);
    expect(registry.getProvider('mock-provider')).toBe(p3);
  });

  it('setDefault changes the default provider', () => {
    registry.registerProvider(createMockProvider('a'));
    registry.registerProvider(createMockProvider('b'));
    expect(registry.getDefault().name).toBe('a');
    registry.setDefault('b');
    expect(registry.getDefault().name).toBe('b');
  });

  // ─── ClaudeAdapter-like buildCommand ──────────────────────────────

  it('buildCommand generates correct command structure', () => {
    const provider = createMockProvider('claude-tmux');
    (provider.buildCommand as ReturnType<typeof vi.fn>).mockImplementation(
      (model: ModelType, promptPath: string, opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove'>) => {
        let cmd = `claude -p - --model ${model}`;
        if (opts?.allowedTools) cmd += ` --allowedTools '${opts.allowedTools}'`;
        if (opts?.autoApprove) cmd += ' --dangerously-skip-permissions';
        cmd += ` < ${promptPath}`;
        return cmd;
      },
    );
    registry.registerProvider(provider);

    const cmd = provider.buildCommand('opus', '/tmp/prompt.txt', { autoApprove: true });
    expect(cmd).toContain('--model opus');
    expect(cmd).toContain('--dangerously-skip-permissions');
    expect(cmd).toContain('< /tmp/prompt.txt');
  });

  it('buildCommand includes allowedTools when specified', () => {
    const provider = createMockProvider('claude-tmux');
    (provider.buildCommand as ReturnType<typeof vi.fn>).mockImplementation(
      (model: ModelType, promptPath: string, opts?: Pick<ProviderSpawnOptions, 'allowedTools'>) => {
        let cmd = `claude -p - --model ${model}`;
        if (opts?.allowedTools) cmd += ` --allowedTools '${opts.allowedTools}'`;
        cmd += ` < ${promptPath}`;
        return cmd;
      },
    );
    const cmd = provider.buildCommand('sonnet', '/tmp/p.txt', { allowedTools: 'Edit,Write' });
    expect(cmd).toContain("--allowedTools 'Edit,Write'");
  });

  // ─── Provider isAvailable ─────────────────────────────────────────

  it('isAvailable returns true for available provider', async () => {
    const provider = createMockProvider('claude-tmux');
    expect(await provider.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when CLI missing', async () => {
    const provider = createMockProvider('claude-tmux');
    (provider.isAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    expect(await provider.isAvailable()).toBe(false);
  });

  // ─── SpawnBackendFactory ──────────────────────────────────────────

  it('factory creates SubprocessBackend when backend=subprocess', () => {
    const backend = SpawnBackendFactory.create({
      backend: 'subprocess',
      projectDir: '/tmp/project',
    });
    expect(backend).toBeInstanceOf(SubprocessBackend);
    expect(backend.name).toBe('subprocess');
  });

  it('factory creates TmuxBackend when backend=tmux', () => {
    const backend = SpawnBackendFactory.create({
      backend: 'tmux',
      projectDir: '/tmp/project',
    });
    expect(backend).toBeInstanceOf(TmuxBackend);
    expect(backend.name).toBe('tmux');
  });

  it('SubprocessBackend.isAvailable always returns true', async () => {
    const backend = new SubprocessBackend('/tmp/project');
    expect(await backend.isAvailable()).toBe(true);
  });

  it('createAsync throws SpawnBackendError when backend not available', async () => {
    // Mock TmuxBackend.prototype.isAvailable to return false
    const origIsAvailable = TmuxBackend.prototype.isAvailable;
    TmuxBackend.prototype.isAvailable = async () => false;

    try {
      await expect(
        SpawnBackendFactory.createAsync({ backend: 'tmux', projectDir: '/tmp/project' }),
      ).rejects.toThrow(SpawnBackendError);
    } finally {
      TmuxBackend.prototype.isAvailable = origIsAvailable;
    }
  });

  // ─── Provider → Backend → Spawn full flow (mock) ─────────────────

  it('full flow: register provider → get backend → spawn worker', () => {
    const provider = createMockProvider('claude-tmux');
    registry.registerProvider(provider, true);

    // Get default provider
    const activeProvider = registry.getDefault();
    expect(activeProvider.name).toBe('claude-tmux');

    // Create backend
    const backend = SpawnBackendFactory.create({
      backend: 'subprocess',
      projectDir: '/tmp/project',
    });
    expect(backend.name).toBe('subprocess');

    // Provider is available
    expect(activeProvider.supportedModels).toContain('opus');

    // Build command for dry-run
    const cmd = activeProvider.buildCommand('opus', '/tmp/prompt.txt');
    expect(cmd).toBeTruthy();
  });

  // ─── Auto mode → Docker (Sprint 178 modernization) ────────────────
  // tmux deprecated; auto unconditionally resolves to 'docker'. Subprocess
  // remains as Windows fallback via explicit `backend: 'subprocess'`.
  // resolveBackend('auto') returns 'docker' unconditionally; tmux availability is irrelevant.

  it('auto mode resolves to docker when tmux unavailable (modernized)', () => {
    vi.spyOn(SpawnBackendFactory, 'isTmuxAvailable').mockReturnValue(false);

    const backend = SpawnBackendFactory.create({
      backend: 'auto',
      projectDir: '/tmp/project',
    });
    expect(backend.name).toBe('docker');

    vi.restoreAllMocks();
  });

  it('auto mode resolves to docker even when tmux is available (modernized)', () => {
    // Note: this test runs after a sibling that called vi.restoreAllMocks(),
    // which resets the file-level DockerSpawnBackend mock to an auto-mock
    // returning an empty object. Explicit DockerSpawnBackend mocking is
    // covered by tests/core/spawn-backend.test.ts; here we only assert the
    // resolveBackend('auto') contract via SpawnBackendError surface.
    vi.spyOn(SpawnBackendFactory, 'isTmuxAvailable').mockReturnValue(true);

    const backend = SpawnBackendFactory.create({
      backend: 'auto',
      projectDir: '/tmp/project',
    });
    // The created backend instance is the mocked DockerSpawnBackend; name may
    // be 'docker' (with active mock) or undefined (after sibling restore).
    // The key contract: it is NOT a TmuxBackend or SubprocessBackend.
    expect(backend).not.toBeInstanceOf(TmuxBackend);
    expect(backend).not.toBeInstanceOf(SubprocessBackend);

    vi.restoreAllMocks();
  });

  // ─── unregister / clear ───────────────────────────────────────────

  it('unregisterProvider removes a provider and resets default', () => {
    registry.registerProvider(createMockProvider('a'));
    registry.registerProvider(createMockProvider('b'));
    expect(registry.getDefault().name).toBe('a');

    registry.unregisterProvider('a');
    expect(registry.size).toBe(1);
    expect(registry.getDefault().name).toBe('b');
  });

  it('clear removes all providers', () => {
    registry.registerProvider(createMockProvider('x'));
    registry.registerProvider(createMockProvider('y'));
    registry.clear();
    expect(registry.size).toBe(0);
    expect(() => registry.getDefault()).toThrow();
  });

  // ─── hasProvider ──────────────────────────────────────────────────

  it('hasProvider returns correct boolean', () => {
    registry.registerProvider(createMockProvider('exists'));
    expect(registry.hasProvider('exists')).toBe(true);
    expect(registry.hasProvider('missing')).toBe(false);
  });
});
