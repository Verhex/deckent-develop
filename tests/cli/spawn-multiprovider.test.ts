/**
 * tests/cli/spawn-multiprovider.test.ts
 *
 * TDD — autonomous↔ollama execution gap fix.
 * Verifies that spawnWorkerMultiProvider routes adapter-providers (ollama) to the
 * host adapter's spawn(), NOT to the docker/tmux/subprocess backend — even when
 * opts.spawnBackend='docker' is set. Mirrors sprint-spawner.ts's adapterRouted logic.
 *
 * Also verifies the dynamic-tag pre-registration path: opts.provider='ollama' triggers
 * ensureOllamaModelRegistered before getProviderForModel so tags like qwen3.6:27b
 * (not in static catalog) resolve correctly in autonomous kind=task and deckent run.
 *
 * Hermetic: all mocks prevent real subprocess/network calls.
 * Fix: 2026-06-08 — ADR-066/077/027
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Mocks (hoisted — no top-level variable refs inside factories) ─────────────

vi.mock('../../src/orchestra/sprint-utils.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    isAdapterProvider: vi.fn((p: string) => p === 'ollama'),
    getProviderAdapterForTask: vi.fn(),
  };
});

// Spy on ensureOllamaModelRegistered without removing its real behavior.
// This lets us assert it was called for dynamic tag pre-registration.
vi.mock('../../src/core/model-registry.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    ensureOllamaModelRegistered: vi.fn((tag: string, registry?: unknown) => {
      // Call the real implementation to keep registry side-effects intact
      (actual.ensureOllamaModelRegistered as (t: string, r?: unknown) => void)(tag, registry);
    }),
  };
});

vi.mock('../../src/core/task-types.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  const realGetProvider = actual.getProviderForModel as (m: string) => string;
  return {
    ...actual,
    getProviderForModel: vi.fn((model: string) => {
      // Treat qwen-coder-32b and qwen3.6:27b as ollama for test purposes
      if (model === 'qwen-coder-32b' || model === 'qwen3.6:27b') return 'ollama';
      return realGetProvider(model);
    }),
  };
});

vi.mock('../../src/orchestra/spawn-backend.js', () => ({
  SpawnBackendFactory: {
    create: vi.fn().mockReturnValue({
      name: 'docker',
      liveUsageBudgetSupport: 'measured-stream',
      executionLandingCapability: 'cooperative-landing',
      spawn: vi.fn(),
    }),
  },
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
}));

// ─── Imports after mocks ────────────────────────────────────────────────────────

import { spawnWorkerMultiProvider } from '../../src/cli/commands/spawn.js';
import { SpawnBackendFactory } from '../../src/orchestra/spawn-backend.js';
import { getProviderAdapterForTask } from '../../src/orchestra/sprint-utils.js';
import { ensureOllamaModelRegistered } from '../../src/core/model-registry.js';
import {
  TEST_DOCKER_EXECUTION_OPTIONS,
  TEST_MEASURED_LANDING_CAPABILITIES,
} from '../helpers/budgeted-docker-execution-fixture.js';

// ─── Tests ─────────────────────────────────────────────────────────────────────

let fixtureBase = '';
let projectRoot = '';
const originalDeckentHome = process.env.DECKENT_HOME;

beforeEach(() => {
  fixtureBase = mkdtempSync(join(tmpdir(), 'spawn-multiprovider-'));
  projectRoot = join(fixtureBase, 'project');
  mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
  process.env.DECKENT_HOME = join(fixtureBase, 'host-state');
});

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  rmSync(fixtureBase, { recursive: true, force: true });
});

describe('spawnWorkerMultiProvider — adapter-provider (ollama) routing', () => {
  let adapterSpawnSpy: ReturnType<typeof vi.fn>;
  let adapterRefreshSpy: ReturnType<typeof vi.fn>;
  let dockerSpawnSpy: ReturnType<typeof vi.fn>;
  let mockAdapter: { spawn: ReturnType<typeof vi.fn>; refreshSupportedModels: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    // Build a fresh stable adapter per test
    adapterSpawnSpy = vi.fn();
    adapterRefreshSpy = vi.fn().mockResolvedValue(undefined);
    mockAdapter = { spawn: adapterSpawnSpy, refreshSupportedModels: adapterRefreshSpy };
    // getProviderAdapterForTask returns the stable adapter for 'ollama'
    vi.mocked(getProviderAdapterForTask).mockImplementation((p: string) =>
      p === 'ollama' ? (mockAdapter as any) : null,
    );
    // SpawnBackendFactory control: docker backend. `dockerSpawnSpy` is captured
    // so tests can prove the docker backend never EXECUTES a worker on the
    // adapter route — `SpawnBackendFactory.create` itself IS legitimately called
    // exactly once per spawnWorkerMultiProvider call: the leadership-free
    // ingress recovery (`reconcilePendingAttempts({ mode: 'terminal-only' })`)
    // always resolves a docker recovery backend BEFORE any routing decision.
    dockerSpawnSpy = vi.fn();
    vi.mocked(SpawnBackendFactory.create).mockReturnValue({
      name: 'docker',
      ...TEST_MEASURED_LANDING_CAPABILITIES,
      spawn: dockerSpawnSpy,
    } as any);
  });

  /**
   * Shared assertion for the adapter route: the only SpawnBackendFactory.create
   * call is the pre-routing terminal-only recovery reconciliation; the docker
   * backend's spawn() is never reached.
   */
  function expectDockerBackendUsedOnlyForIngressRecovery(): void {
    expect(SpawnBackendFactory.create).toHaveBeenCalledTimes(1);
    expect(SpawnBackendFactory.create).toHaveBeenCalledWith(
      expect.objectContaining({ backend: 'docker', projectDir: projectRoot }),
    );
    expect(dockerSpawnSpy).not.toHaveBeenCalled();
  }

  // ── Core fix: ollama bypasses spawnBackend='docker' ────────────────────────

  it('routes ollama to host adapter even when spawnBackend=docker is set', async () => {
    const result = await spawnWorkerMultiProvider(
      't-ollama-001',
      'qwen-coder-32b',
      'solve the task',
      projectRoot,
      { spawnBackend: 'docker', autoApprove: false },
    );

    // Adapter spawn called once with correct args
    expect(adapterSpawnSpy).toHaveBeenCalledOnce();
    expect(adapterSpawnSpy).toHaveBeenCalledWith(
      't-ollama-001',
      'qwen-coder-32b',
      'solve the task',
      expect.objectContaining({
        autoApprove: false,
        projectDir: projectRoot,
      }),
    );

    // Docker backend created only for ingress recovery — never executes the worker
    expectDockerBackendUsedOnlyForIngressRecovery();

    // Return value labels the backend as host-adapter
    expect(result.backend).toBe('host-adapter');
    expect(result.provider).toBe('ollama');
  });

  // ── refreshSupportedModels is awaited before spawn ─────────────────────────

  it('awaits refreshSupportedModels before calling adapter.spawn', async () => {
    const callOrder: string[] = [];
    adapterRefreshSpy.mockImplementation(async () => { callOrder.push('refresh'); });
    adapterSpawnSpy.mockImplementation(() => { callOrder.push('spawn'); });

    await spawnWorkerMultiProvider(
      't-ollama-002',
      'qwen-coder-32b',
      'prompt',
      projectRoot,
      { spawnBackend: 'docker' },
    );

    expect(callOrder).toEqual(['refresh', 'spawn']);
  });

  // ── adapter route works without spawnBackend set ───────────────────────────

  it('routes ollama to host adapter even without spawnBackend option', async () => {
    const result = await spawnWorkerMultiProvider(
      't-ollama-003',
      'qwen-coder-32b',
      'prompt',
      projectRoot,
      {},
    );

    expect(adapterSpawnSpy).toHaveBeenCalledOnce();
    expectDockerBackendUsedOnlyForIngressRecovery();
    expect(result.backend).toBe('host-adapter');
    expect(result.provider).toBe('ollama');
  });

  it('rejects a live budget before adapter refresh or provider work when evidence is unsupported', async () => {
    await expect(spawnWorkerMultiProvider(
      't-ollama-budgeted',
      'qwen-coder-32b',
      'prompt',
      projectRoot,
      { executionBudget: { maxTokens: 100 } },
    )).rejects.toThrow('Spawn blocked before provider work');

    expect(adapterRefreshSpy).not.toHaveBeenCalled();
    expect(adapterSpawnSpy).not.toHaveBeenCalled();
    // Only the pre-routing ingress-recovery backend exists; no provider work ran.
    expectDockerBackendUsedOnlyForIngressRecovery();
  });

  it('rejects an unregistered OpenRouter model before provider work', async () => {
    await expect(spawnWorkerMultiProvider(
      't-openrouter-unpriced',
      'vendor/paid-model-v1',
      'prompt',
      projectRoot,
      { provider: 'openrouter', spawnBackend: 'docker' },
    )).rejects.toThrow('Unknown model: vendor/paid-model-v1');

    expect(adapterRefreshSpy).not.toHaveBeenCalled();
    expect(adapterSpawnSpy).not.toHaveBeenCalled();
    // Only the pre-routing ingress-recovery backend exists; no provider work ran.
    expectDockerBackendUsedOnlyForIngressRecovery();
  });

  // ── allowedTools forwarded correctly to adapter ────────────────────────────

  it('forwards allowedTools to adapter.spawn', async () => {
    await spawnWorkerMultiProvider(
      't-ollama-004',
      'qwen-coder-32b',
      'prompt',
      projectRoot,
      { allowedTools: 'Read,Write,Edit,Bash', spawnBackend: 'docker' },
    );

    expect(adapterSpawnSpy).toHaveBeenCalledWith(
      't-ollama-004',
      'qwen-coder-32b',
      'prompt',
      expect.objectContaining({ allowedTools: 'Read,Write,Edit,Bash' }),
    );
  });

  // ── autoApprove=true forwarded correctly ───────────────────────────────────

  it('forwards autoApprove=true to adapter.spawn', async () => {
    await spawnWorkerMultiProvider(
      't-ollama-005',
      'qwen-coder-32b',
      'prompt',
      projectRoot,
      { autoApprove: true, spawnBackend: 'docker' },
    );

    expect(adapterSpawnSpy).toHaveBeenCalledWith(
      't-ollama-005',
      'qwen-coder-32b',
      'prompt',
      expect.objectContaining({ autoApprove: true }),
    );
  });

  // ── opts.provider='ollama' triggers ensureOllamaModelRegistered for dynamic tags ─
  // Regression guard for the autonomous kind=task path: the dispatcher forwards
  // entry.provider='ollama' so dynamic tags (qwen3.6:27b) are pre-registered before
  // getProviderForModel is called — which would otherwise throw UnknownModelError for
  // tags not in the static catalog.

  it('calls ensureOllamaModelRegistered when opts.provider=ollama (dynamic tag pre-registration)', async () => {
    await spawnWorkerMultiProvider(
      't-ollama-006',
      'qwen-coder-32b',
      'prompt',
      projectRoot,
      { provider: 'ollama', spawnBackend: 'docker' },
    );

    expect(ensureOllamaModelRegistered).toHaveBeenCalledWith('qwen-coder-32b');
    expect(adapterSpawnSpy).toHaveBeenCalledOnce();
  });

  it('does NOT call ensureOllamaModelRegistered when opts.provider is absent', async () => {
    await spawnWorkerMultiProvider(
      't-ollama-007',
      'qwen-coder-32b',
      'prompt',
      projectRoot,
      { spawnBackend: 'docker' },
    );

    expect(ensureOllamaModelRegistered).not.toHaveBeenCalled();
    expect(adapterSpawnSpy).toHaveBeenCalledOnce();
  });
});

describe('spawnWorkerMultiProvider — control: non-adapter providers still use configured backend', () => {
  let mockDockerSpawn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // getProviderAdapterForTask returns null for non-ollama providers
    vi.mocked(getProviderAdapterForTask).mockReturnValue(null as any);
    mockDockerSpawn = vi.fn();
    vi.mocked(SpawnBackendFactory.create).mockReturnValue({
      name: 'docker',
      ...TEST_MEASURED_LANDING_CAPABILITIES,
      spawn: mockDockerSpawn,
    } as any);
  });

  it('claude model with spawnBackend=docker still uses docker backend (not adapter)', async () => {
    const result = await spawnWorkerMultiProvider(
      't-claude-001',
      'claude-sonnet-5',
      'prompt',
      projectRoot,
      {
        spawnBackend: 'docker',
        ...TEST_DOCKER_EXECUTION_OPTIONS,
      },
    );

    // Docker backend IS used for claude
    expect(SpawnBackendFactory.create).toHaveBeenCalledWith(
      expect.objectContaining({ backend: 'docker' }),
    );
    expect(mockDockerSpawn).toHaveBeenCalled();
    expect(result.backend).toBe('docker');
    expect(result.provider).toBe('claude');
  });
});
