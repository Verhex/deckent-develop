import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';

const ingressHarness = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../src/core/constants.js', () => ({
  RUNTIME_DIR: '.deckent/runtime',
  SETTINGS_DIR: '.deckent/settings',
  TASKS_DIR: '.tasks',
}));

vi.mock('../../src/mcp/tools/job-runner.js', () => ({
  createJobId: vi.fn(() => 'job-1780659451558-11111111-1111-4111-8111-111111111111'),
  writeJobState: vi.fn(),
}));

vi.mock('../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((_type: string, data: unknown) => data),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  buildWorkerPrompt: vi.fn().mockReturnValue('worker-prompt'),
}));

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  resolveAgentPrompt: vi.fn().mockResolvedValue(undefined),
  resolveSkillPrompts: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveDefaultModel: () => 'claude-sonnet-5',
  resolveBrainModel: () => 'claude-opus-4-8',
  resolveBrainPlanningMode: () => 'structured',
  loadConfig: vi.fn(),
}));

vi.mock('../../src/cli/commands/spawn.js', () => ({
  spawnWorkerMultiProvider: vi.fn().mockResolvedValue({ backend: 'subprocess' }),
}));

vi.mock('../../src/orchestra/task-mode-runner.js', () => ({
  executeTaskIngress: ingressHarness.execute,
  readTaskIngressErrorAuthority: (error: any) => error?.taskIngressAuthority,
}));

vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({
    loadAgents: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({
    loadSkills: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn().mockReturnValue({ primaryLanguage: 'typescript' }),
}));

vi.mock('../../src/orchestra/routing-plan-adapter.js', () => ({
  routeSingleTaskV3: vi.fn().mockResolvedValue({
    agentId: 'generic',
    skillIds: [],
    confidence: 0.8,
    workType: 'build',
    escalation: null,
    storySummary: '',
  }),
}));

vi.mock('../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

import { loadConfig } from '../../src/core/config.js';
import { spawnWorkerMultiProvider } from '../../src/cli/commands/spawn.js';
import { writeJobState } from '../../src/mcp/tools/job-runner.js';
import { buildWorkerPrompt } from '../../src/orchestra/brain.js';
import { routeSingleTaskV3 } from '../../src/orchestra/routing-plan-adapter.js';
import { applyWorkerExecutionBudgetPolicy } from '../../src/core/execution-plan-digest.js';

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

interface MockServer {
  tools: Map<string, { handler: ToolHandler }>;
  registerTool(name: string, config: unknown, handler: ToolHandler): void;
}

function createMockServer(): MockServer {
  const tools = new Map<string, { handler: ToolHandler }>();
  return {
    tools,
    registerTool(name, _config, handler) {
      tools.set(name, { handler });
    },
  };
}

async function getHandler(runtime: Record<string, unknown> = {}): Promise<ToolHandler> {
  const { registerRunTool } = await import('../../src/mcp/tools/run.ts');
  const server = createMockServer();
  registerRunTool(server as never, runtime as never);
  return server.tools.get('deckent_run')!.handler;
}

function writtenTask(): Record<string, unknown> {
  expect(ingressHarness.execute).toHaveBeenCalledOnce();
  return ingressHarness.execute.mock.calls[0]![0].task as Record<string, unknown>;
}

function spawnOptions(): Record<string, unknown> {
  expect(vi.mocked(spawnWorkerMultiProvider)).toHaveBeenCalledOnce();
  return vi.mocked(spawnWorkerMultiProvider).mock.calls[0]![4] as Record<string, unknown>;
}

function expectNoExecutionSideEffects(): void {
  expect(vi.mocked(routeSingleTaskV3)).not.toHaveBeenCalled();
  expect(vi.mocked(mkdirSync)).not.toHaveBeenCalled();
  expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  expect(vi.mocked(buildWorkerPrompt)).not.toHaveBeenCalled();
  expect(vi.mocked(spawnWorkerMultiProvider)).not.toHaveBeenCalled();
  expect(vi.mocked(writeJobState)).not.toHaveBeenCalled();
}

describe('deckent_run MCP — owner budget authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawnWorkerMultiProvider).mockResolvedValue({ backend: 'subprocess' } as never);
    ingressHarness.execute.mockImplementation(async (input: any) => {
      if (input.providerAuthority?.state === 'hold') {
        throw new Error(
          `provider execution authority is not ready: ${input.providerAuthority.reasonCode}`,
        );
      }
      const [policy] = applyWorkerExecutionBudgetPolicy(
        [input.task],
        input.config.execution_budget,
        input.task.provider,
      );
      if (policy?.state === 'hold') throw new Error(`execution budget policy: ${policy.reasonCode}`);
      const routed = await routeSingleTaskV3(input.task, input.projectRoot);
      input.task.assignedAgent = routed.agentId;
      input.task.assignedSkills = routed.skillIds;
      mkdirSync(`${input.projectRoot}/.tasks`, { recursive: true });
      writeFileSync(`${input.projectRoot}/.tasks/task-${input.task.id}.json`, JSON.stringify(input.task));
      const prompt = buildWorkerPrompt(input.task, undefined, [], input.projectRoot);
      const spawned = await spawnWorkerMultiProvider(
        input.task.id,
        input.task.model,
        prompt,
        input.projectRoot,
        {
          autoApprove: input.autoApprove,
          provider: input.task.provider,
          modelEffort: input.task.modelEffort,
          executionBudget: input.task.budget,
          attendedExecutionApprovalAuthority: input.attendedExecutionApprovalAuthority,
          executionTenantId: input.executionTenantId ?? input.task.actor?.tenantId ?? 'local',
          executionRunId: input.executionRunId ?? input.task.sprintId ?? input.task.id,
        },
      );
      return {
        disposition: { kind: 'spawned', taskId: input.task.id },
        executionMode: 'legacy-non-docker',
        backend: spawned.backend,
        provider: input.task.provider,
        invocation: {
          receiptRef: { schemaVersion: 1, invocationId: `test:${input.task.id}`, tenantId: 'local', projectId: 'test' },
          executionBackend: 'host-subprocess',
          transport: 'mcp',
          state: 'dispatch-started',
          executionEvidenceRef: `test:${input.task.id}`,
        },
      };
    });
  });

  it('persists and dispatches the same owner-authored remote ceiling', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      spawn_backend: 'subprocess',
      execution_budget: {
        roles: { worker: { default: { maxTurns: 4, maxTokens: 20_000 } } },
        landing: { reserve_ratio: 0.25 },
        // ADR-G-037: codex reports usage final-only — a live ceiling needs an
        // owner-authored wall-clock containment grant or the policy holds.
        final_only_usage: {
          action: 'allow-wall-clock-containment',
          roles: ['worker'],
          max_wall_clock_seconds: 3600,
        },
      },
    } as never);

    const handler = await getHandler();
    const result = await handler({
      description: 'fix a bug',
      model: 'gpt-5.6-sol',
      autoApprove: true,
    });

    expect(result.isError).not.toBe(true);
    const task = writtenTask();
    expect(task).toMatchObject({
      model: 'gpt-5.6-sol',
      provider: 'codex',
      budget: { maxTurns: 4, maxTokens: 20_000 },
      budgetPolicy: {
        state: 'allow',
        role: 'worker',
        resolvedProvider: 'codex',
        executionCostClass: 'remote',
        profileRef: 'execution_budget.roles.worker.default',
      },
    });
    expect((task['budgetPolicy'] as Record<string, unknown>)['policyDigest']).toMatch(/^[a-f0-9]{64}$/);
    expect(spawnOptions()['executionBudget']).toEqual(task['budget']);
  });

  it('forwards the runtime-wide attended authority to the shared final dispatch seam', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      spawn_backend: 'subprocess',
      execution_budget: {
        roles: { worker: { default: { maxTurns: 4 } } },
        landing: { reserve_ratio: 0.25 },
        // ADR-G-037: codex final-only usage — owner containment grant required.
        final_only_usage: {
          action: 'allow-wall-clock-containment',
          roles: ['worker'],
          max_wall_clock_seconds: 3600,
        },
      },
    } as never);
    const authority = { verifyAndClaim: vi.fn() };

    const handler = await getHandler({ attendedExecutionApprovalAuthority: authority });
    const result = await handler({
      description: 'bounded attended-capable request',
      model: 'gpt-5.6-sol',
    });

    expect(result.isError).not.toBe(true);
    expect(spawnOptions()['attendedExecutionApprovalAuthority']).toBe(authority);
    expect(spawnOptions()['executionTenantId']).toBe('local');
    expect(spawnOptions()['executionRunId']).toMatch(/^run-job-/);
  });

  it.each([
    ['missing policy', { spawn_backend: 'subprocess' }],
    ['missing worker role', {
      spawn_backend: 'subprocess',
      execution_budget: { roles: { auditor: { default: { maxTurns: 2 } } } },
    }],
  ])('holds remote execution before disk/routing/prompt/spawn: %s', async (_label, config) => {
    vi.mocked(loadConfig).mockResolvedValue(config as never);

    const handler = await getHandler();
    const result = await handler({
      description: 'fix a bug',
      model: 'claude-sonnet-5',
      autoApprove: true,
    });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0]!.text).message).toContain('execution budget policy');
    expectNoExecutionSideEffects();
  });

  it('consumes the injected process authority HOLD before every execution side effect', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      spawn_backend: 'docker',
      execution_budget: {
        roles: { worker: { default: { maxTurns: 4 } } },
        landing: { reserve_ratio: 0.25 },
      },
    } as never);
    const providerAuthority = {
      state: 'hold',
      reasonCode: 'termination_authority_unavailable',
      authorityEvidenceRef: `provider-authority:${'a'.repeat(64)}`,
      retryable: false,
      close: vi.fn(),
    };

    const handler = await getHandler({ providerAuthority });
    const result = await handler({
      description: 'bounded provider-authority request',
      model: 'claude-sonnet-5',
      autoApprove: true,
    });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0]!.text).message).toContain(
      'provider execution authority is not ready',
    );
    expect(JSON.parse(result.content[0]!.text).message).toContain(
      'termination_authority_unavailable',
    );
    expectNoExecutionSideEffects();
    expect(providerAuthority.close).not.toHaveBeenCalled();
  });

  it('keeps adapter-declared local execution exempt without inventing a numeric budget', async () => {
    vi.mocked(loadConfig).mockResolvedValue({ spawn_backend: 'subprocess' } as never);

    const handler = await getHandler();
    const result = await handler({
      description: 'inspect local code',
      model: 'qwen2.5-coder:7b',
      provider: 'ollama',
      autoApprove: true,
    });

    expect(result.isError).not.toBe(true);
    const task = writtenTask();
    expect(task['budget']).toBeUndefined();
    expect(task['budgetPolicy']).toMatchObject({
      state: 'allow',
      role: 'worker',
      resolvedProvider: 'ollama',
      executionCostClass: 'local',
      profileRef: 'local-exempt',
    });
    expect(spawnOptions()['executionBudget']).toBeUndefined();
  });
});
