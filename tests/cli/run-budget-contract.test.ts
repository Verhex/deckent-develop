import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const h = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  writes: [] as Array<[string, string]>,
  spawn: vi.fn().mockResolvedValue({ backend: 'docker', provider: 'claude' }),
  printError: vi.fn(),
  buildPrompt: vi.fn(() => 'bounded worker prompt'),
  route: vi.fn(async () => ({ agentId: 'generic', skillIds: [] })),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn((path: unknown) => String(path).endsWith('.result')),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn((path: unknown, value: unknown) => {
    h.writes.push([String(path), String(value)]);
  }),
  unlinkSync: vi.fn(),
  createReadStream: vi.fn(),
  watch: vi.fn(),
  renameSync: vi.fn(),
}));

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return {
    ...actual,
    readJsonSafe: vi.fn(() => ({
      taskId: 'run-contract',
      selfAssessment: 'DONE',
      testsPassed: true,
      filesChanged: [],
      notes: 'ok',
    })),
  };
});

vi.mock('../../src/core/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/config.js')>();
  return {
    ...actual,
    loadConfig: vi.fn(async () => h.config),
    resolveDefaultModel: vi.fn(() => 'claude-sonnet-5'),
  };
});

vi.mock('../../src/orchestra/brain.js', () => ({
  buildWorkerPrompt: h.buildPrompt,
}));

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  resolveAgentPrompt: vi.fn(async () => ''),
  resolveSkillPrompts: vi.fn(async () => []),
}));

vi.mock('../../src/orchestra/routing-plan-adapter.js', () => ({
  routeSingleTaskV3: h.route,
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: h.printError,
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(() => '/isolated-project'),
}));

vi.mock('../../src/cli/commands/spawn.js', () => ({
  spawnWorkerMultiProvider: h.spawn,
}));

import { registerRun } from '../../src/cli/commands/run.js';

function taskWrites(): Array<Record<string, unknown>> {
  return h.writes
    .filter(([path]) => path.endsWith('.json'))
    .map(([, value]) => JSON.parse(value) as Record<string, unknown>);
}

async function run(
  args: string[],
  runtime: Record<string, unknown> = {},
): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerRun(program, runtime as never);
  await program.parseAsync(['node', 'deckent', 'run', 'inspect bounded contract', ...args]);
}

describe('deckent run execution-budget producer', () => {
  beforeEach(() => {
    h.config = {
      language: 'en',
      worker_provider: 'claude',
      spawn_backend: 'docker',
      execution_budget: {
        roles: {
          worker: { default: { maxTurns: 3, maxTokens: 1_200 } },
        },
        landing: { reserve_ratio: 0.25 },
      },
    };
    h.writes.length = 0;
    h.spawn.mockClear();
    h.printError.mockClear();
    h.buildPrompt.mockClear();
    h.route.mockClear();
    process.exitCode = undefined;
  });

  it('persists the owner-policy snapshot and passes the exact ceiling to spawn', async () => {
    await run(['--model', 'claude-sonnet-5', '--keep']);

    expect(taskWrites()).toHaveLength(1);
    expect(taskWrites()[0]).toMatchObject({
      model: 'claude-sonnet-5',
      provider: 'claude',
      budget: { maxTurns: 3, maxTokens: 1_200 },
      budgetPolicy: {
        state: 'allow',
        role: 'worker',
        resolvedProvider: 'claude',
        executionCostClass: 'remote',
        profileRef: 'execution_budget.roles.worker.default',
        landingPolicy: {
          reserve_ratio: 0.25,
          attended_unsupported: 'hold',
        },
      },
    });
    expect(h.spawn).toHaveBeenCalledOnce();
    expect(h.spawn.mock.calls[0]?.[4]).toMatchObject({
      provider: 'claude',
      executionBudget: { maxTurns: 3, maxTokens: 1_200 },
      executionLandingPolicy: {
        reserve_ratio: 0.25,
        attended_unsupported: 'hold',
      },
    });
  });

  it('forwards the runtime-wide attended authority to the shared final dispatch seam', async () => {
    const authority = { verifyAndClaim: vi.fn() };
    await run(
      ['--model', 'claude-sonnet-5', '--keep'],
      { attendedExecutionApprovalAuthority: authority },
    );

    expect(h.spawn.mock.calls[0]?.[4]).toMatchObject({
      attendedExecutionApprovalAuthority: authority,
      executionTenantId: 'local',
    });
    expect(String(h.spawn.mock.calls[0]?.[4]?.executionRunId)).toMatch(/^run-/);
  });

  it('holds a remote run before Task JSON and spawn when policy is missing', async () => {
    h.config = { language: 'en', worker_provider: 'claude', spawn_backend: 'docker' };

    await run(['--model', 'claude-sonnet-5']);

    expect(taskWrites()).toHaveLength(0);
    expect(h.spawn).not.toHaveBeenCalled();
    expect(h.printError).toHaveBeenCalledOnce();
    expect(String(h.printError.mock.calls[0]?.[0])).toContain('execution budget policy is not ready');
    expect(process.exitCode).toBe(1);
  });

  it('consumes an injected process authority HOLD before routing, Task JSON, prompt or spawn', async () => {
    const providerAuthority = {
      state: 'hold',
      reasonCode: 'source_resolver_unavailable',
      authorityEvidenceRef: `provider-authority:${'a'.repeat(64)}`,
      retryable: false,
      close: vi.fn(),
    };

    await run(
      ['--model', 'claude-sonnet-5', '--keep'],
      { providerAuthority },
    );

    expect(h.route).not.toHaveBeenCalled();
    expect(taskWrites()).toHaveLength(0);
    expect(h.buildPrompt).not.toHaveBeenCalled();
    expect(h.spawn).not.toHaveBeenCalled();
    expect(h.printError).toHaveBeenCalledOnce();
    expect(String(h.printError.mock.calls[0]?.[0])).toContain(
      'provider execution authority is not ready',
    );
    expect(String(h.printError.mock.calls[0]?.[0])).toContain(
      'source_resolver_unavailable',
    );
    expect(providerAuthority.close).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('keeps a local Ollama run exempt without inventing a numeric ceiling', async () => {
    h.config = { language: 'en', worker_provider: 'ollama' };

    await run(['--model', 'qwen2.5-coder:7b', '--provider', 'ollama', '--keep']);

    expect(taskWrites()).toHaveLength(1);
    expect(taskWrites()[0]).toMatchObject({
      provider: 'ollama',
      budgetPolicy: {
        state: 'allow',
        resolvedProvider: 'ollama',
        executionCostClass: 'local',
        profileRef: 'local-exempt',
      },
    });
    expect(taskWrites()[0]).not.toHaveProperty('budget');
    expect(h.spawn.mock.calls[0]?.[4]).toMatchObject({ provider: 'ollama' });
    expect(h.spawn.mock.calls[0]?.[4]).toHaveProperty('executionBudget', undefined);
  });
});
