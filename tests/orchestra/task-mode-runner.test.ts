// tests/orchestra/task-mode-runner.test.ts
//
// Hermetic tests for runTaskMode — phase-1a gap fixes (gaps E + G).
//
// Asserts:
//   - .tasks/task-{id}.json is written to disk BEFORE spawn (Gap E fix)
//   - Written task JSON contains the description and scope (Gap E)
//   - buildWorkerPrompt is called without projectRoot as agentPrompt (Gap G fix)
//   - spawnWorkerMultiProvider receives the prompt string (not a path)
//
// Hermetic: uses tmpdir as projectRoot; mocks spawn so no real worker launches;
// mocks buildWorkerPrompt to prevent ADR/memory DB reads in CI.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Mocks (hoisted before imports) ────────────────────────────────────────

vi.mock('../../src/cli/commands/spawn.js', () => ({
  spawnWorkerMultiProvider: vi.fn().mockResolvedValue({ backend: 'subprocess', provider: 'claude' }),
}));

vi.mock('../../src/orchestra/task-builder.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    // Intercept buildWorkerPrompt so CI does not need .brain/memory.db;
    // return a deterministic string so we can assert the prompt arg to spawn.
    buildWorkerPrompt: vi.fn((_task: unknown, _agentPrompt?: string, _skillPrompts?: unknown) =>
      'mock-worker-prompt',
    ),
  };
});

// ─── Import SUT after mocks ─────────────────────────────────────────────────

import { runTaskMode } from '../../src/orchestra/task-mode-runner.js';
import { spawnWorkerMultiProvider } from '../../src/cli/commands/spawn.js';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';
import type { ExecutionBudget } from '../../src/core/work-model.js';
import { ProviderExecutionIngressHoldError } from '../../src/core/provider-execution-ingress-authority.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTaskConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    deckent_style: 'task',
    execution_budget: {
      roles: {
        worker: { default: { maxTokens: 100_000, maxTurns: 10 } },
      },
      landing: { reserve_ratio: 0.25 },
    },
    ...overrides,
  } as unknown as ResolvedConfig;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('runTaskMode — phase-1a gap fixes (E + G)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'task-mode-runner-'));
    vi.clearAllMocks();
    (spawnWorkerMultiProvider as ReturnType<typeof vi.fn>).mockResolvedValue({
      backend: 'subprocess',
      provider: 'claude',
    });
    (buildWorkerPrompt as ReturnType<typeof vi.fn>).mockReturnValue('mock-worker-prompt');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('Gap E: writes .tasks/task-{id}.json before spawn', async () => {
    const config = makeTaskConfig();
    const result = await runTaskMode(
      { description: 'write a hello world function', projectRoot: root },
      config,
    );

    const taskFilePath = join(root, '.tasks', `task-${result.taskId}.json`);
    expect(existsSync(taskFilePath), 'task JSON must exist on disk').toBe(true);
  });

  it('Gap E: written task JSON contains description and scope', async () => {
    const config = makeTaskConfig();
    const desc = 'implement feature XYZ with full tests';

    const result = await runTaskMode(
      { description: desc, scope: { directories: ['src/feature'] }, projectRoot: root },
      config,
    );

    const taskFilePath = join(root, '.tasks', `task-${result.taskId}.json`);
    const content = JSON.parse(readFileSync(taskFilePath, 'utf-8')) as {
      description: string;
      scope: { directories: string[] };
      id: string;
    };

    expect(content.description).toBe(desc);
    expect(content.scope.directories).toContain('src/feature');
    expect(content.id).toBe(result.taskId);
  });

  it('Gap G: buildWorkerPrompt is called without projectRoot as agentPrompt', async () => {
    const config = makeTaskConfig();

    await runTaskMode(
      { description: 'fix the bug', projectRoot: root },
      config,
    );

    expect(buildWorkerPrompt).toHaveBeenCalledOnce();
    const [_task, agentPromptArg] = (buildWorkerPrompt as ReturnType<typeof vi.fn>).mock.calls[0]!;

    // agentPrompt must NOT be a filesystem path (the Gap G bug was passing projectRoot)
    expect(typeof agentPromptArg === 'string' && agentPromptArg.startsWith('/'),
      'agentPrompt must not be an absolute path (Gap G regression)',
    ).toBe(false);
  });

  it('spawn receives the prompt string from buildWorkerPrompt (not a path)', async () => {
    const config = makeTaskConfig();

    await runTaskMode(
      { description: 'do something', projectRoot: root },
      config,
    );

    expect(spawnWorkerMultiProvider).toHaveBeenCalledOnce();
    const [_taskId, _model, prompt] = (spawnWorkerMultiProvider as ReturnType<typeof vi.fn>).mock.calls[0]!;

    // prompt should be the return value of buildWorkerPrompt, not an absolute path
    expect(prompt).toBe('mock-worker-prompt');
  });

  it('returns taskId, backend, and provider from spawn', async () => {
    const config = makeTaskConfig();

    const result = await runTaskMode(
      { description: 'sample task', projectRoot: root },
      config,
    );

    expect(result.taskId).toBeTruthy();
    expect(result.backend).toBe('subprocess');
    expect(result.provider).toBe('claude');
  });

  it('holds a remote task before Task JSON and spawn when owner budget policy is missing', async () => {
    const config = makeTaskConfig({ execution_budget: undefined });

    await expect(runTaskMode(
      { description: 'must not spawn', projectRoot: root, model: 'claude-sonnet-5', provider: 'claude' },
      config,
    )).rejects.toThrow('EXECUTION_BUDGET_HOLD:budget-policy-missing:execution_budget.roles.worker');

    expect(existsSync(join(root, '.tasks'))).toBe(false);
    expect(spawnWorkerMultiProvider).not.toHaveBeenCalled();
  });

  it('consumes configured provider authority before routing, Task JSON, prompt, event, or spawn', async () => {
    const executionRunId = 'task-mode-authority-hold';
    const authorityEvidenceRef = `provider-authority:${'a'.repeat(64)}`;
    const caught = await runTaskMode({
      description: 'must stop at provider authority',
      projectRoot: root,
      model: 'claude-sonnet-5',
      provider: 'claude',
      executionRunId,
      providerAuthority: {
        state: 'hold',
        reasonCode: 'keyring_unavailable',
        authorityEvidenceRef,
        retryable: false,
        close: vi.fn(),
      },
    }, makeTaskConfig({
      spawn_backend: 'docker',
      provider_fallback: {
        worker: ['codex', 'gemini'],
        unattended: true,
      },
    })).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ProviderExecutionIngressHoldError);
    expect(caught).toMatchObject({
      reasonCode: 'keyring_unavailable',
      durableEvidenceWritten: true,
      request: {
        role: 'worker',
        purpose: 'worker-execution',
        runId: executionRunId,
        provider: 'claude',
        model: 'claude-sonnet-5',
        configuredBackend: 'docker',
        fallbackProviders: ['codex', 'gemini'],
        unattended: true,
      },
    });
    expect(existsSync(join(root, '.tasks'))).toBe(false);
    expect(buildWorkerPrompt).not.toHaveBeenCalled();
    expect(spawnWorkerMultiProvider).not.toHaveBeenCalled();

    const eventPath = join(
      root,
      '.deckent',
      'recently-works',
      `${executionRunId}-events.jsonl`,
    );
    const events = readFileSync(eventPath, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as {
        channel: string;
        payload: { taskId: string; authorityEvidenceRefs: string[] };
      });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      channel: 'BRAIN→AUDITOR:PROVIDER_AUTHORITY_HOLD',
      payload: {
        taskId: expect.stringMatching(/^run-/),
        authorityEvidenceRefs: expect.arrayContaining([authorityEvidenceRef]),
      },
    });
  });

  it('persists and spawns with the same owner budget while request ceilings only narrow it', async () => {
    const config = makeTaskConfig({
      execution_budget: {
        roles: {
          worker: { default: { maxTokens: 20_000, maxTurns: 8, maxOutputTokens: 4_000 } },
        },
        landing: { reserve_ratio: 0.25 },
      },
    });

    const result = await runTaskMode({
      description: 'bounded task',
      projectRoot: root,
      model: 'claude-sonnet-5',
      provider: 'claude',
      budget: { maxTokens: 50_000, maxTurns: 3, maxInputTokens: 9_000 },
    }, config);

    const persisted = JSON.parse(readFileSync(
      join(root, '.tasks', `task-${result.taskId}.json`),
      'utf-8',
    )) as { budget: Record<string, number> };
    expect(persisted.budget).toEqual({
      maxTokens: 20_000,
      maxTurns: 3,
      maxOutputTokens: 4_000,
      maxInputTokens: 9_000,
    });
    const spawnOptions = (spawnWorkerMultiProvider as ReturnType<typeof vi.fn>).mock.calls[0]![4];
    expect(spawnOptions.executionBudget).toEqual(persisted.budget);
  });

  it('forwards one runtime-wide attended authority and exact tenant/run identity', async () => {
    const authority = { verifyAndClaim: vi.fn() };
    await runTaskMode({
      description: 'authority forwarding',
      projectRoot: root,
      model: 'claude-sonnet-5',
      provider: 'claude',
      attendedExecutionApprovalAuthority: authority as never,
      executionTenantId: 'tenant-a',
      executionRunId: 'run-a',
    }, makeTaskConfig());

    const spawnOptions = (spawnWorkerMultiProvider as ReturnType<typeof vi.fn>).mock.calls[0]![4];
    expect(spawnOptions.attendedExecutionApprovalAuthority).toBe(authority);
    expect(spawnOptions.executionTenantId).toBe('tenant-a');
    expect(spawnOptions.executionRunId).toBe('run-a');
  });

  it.each([
    ['empty', {}],
    ['negative', { maxTurns: -1 }],
    ['unknown-field', { unlimited: 1 }],
  ])('rejects a malformed %s request budget before Task JSON and spawn', async (_label, budget) => {
    await expect(runTaskMode({
      description: 'invalid budget',
      projectRoot: root,
      model: 'claude-sonnet-5',
      provider: 'claude',
      budget: budget as unknown as ExecutionBudget,
    }, makeTaskConfig())).rejects.toThrow();

    expect(existsSync(join(root, '.tasks'))).toBe(false);
    expect(spawnWorkerMultiProvider).not.toHaveBeenCalled();
  });

  it('keeps a local Ollama executor policy-exempt without fabricating a ceiling', async () => {
    const result = await runTaskMode({
      description: 'local task',
      projectRoot: root,
      model: 'qwen-coder-32b',
      provider: 'ollama',
    }, makeTaskConfig({ execution_budget: undefined }));

    const persisted = JSON.parse(readFileSync(
      join(root, '.tasks', `task-${result.taskId}.json`),
      'utf-8',
    )) as Record<string, unknown>;
    expect(persisted).not.toHaveProperty('budget');
    const spawnOptions = (spawnWorkerMultiProvider as ReturnType<typeof vi.fn>).mock.calls[0]![4];
    expect(spawnOptions.executionBudget).toBeUndefined();
  });

  it('throws when deckent_style is not "task"', async () => {
    const config = makeTaskConfig({ deckent_style: 'sprint' as unknown as 'task' });

    await expect(
      runTaskMode({ description: 'should fail', projectRoot: root }, config),
    ).rejects.toThrow('deckent_style !== "task"');
  });
});
