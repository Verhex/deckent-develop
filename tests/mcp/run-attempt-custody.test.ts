import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  execute: vi.fn(),
  writeJobState: vi.fn(),
  write: vi.fn(),
}));

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: harness.write,
}));

vi.mock('../../src/core/config.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    loadConfig: vi.fn().mockResolvedValue({
      spawn_backend: 'docker',
      execution_budget: {
        roles: { worker: { default: { maxTurns: 2 } } },
        landing: { reserve_ratio: 0.25 },
      },
    }),
    resolveDefaultModel: () => 'claude-sonnet-5',
  };
});

vi.mock('../../src/mcp/tools/job-runner.js', () => ({
  createJobId: vi.fn(() => 'job-1780659451558-11111111-1111-4111-8111-111111111111'),
  writeJobState: harness.writeJobState,
}));

vi.mock('../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((_kind: string, value: unknown) => value),
}));

vi.mock('../../src/orchestra/task-mode-runner.js', () => ({
  executeTaskIngress: harness.execute,
  readTaskIngressErrorAuthority: (error: any) => error?.taskIngressAuthority,
}));

interface MockServer {
  tools: Map<string, (input: Record<string, unknown>) => Promise<any>>;
  registerTool(
    name: string,
    _config: unknown,
    handler: (input: Record<string, unknown>) => Promise<any>,
  ): void;
}

function serverFixture(): MockServer {
  const tools = new Map<string, (input: Record<string, unknown>) => Promise<any>>();
  return {
    tools,
    registerTool(name, _config, handler) {
      tools.set(name, handler);
    },
  };
}

describe('deckent_run MCP — exact attempt custody surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.execute.mockImplementation(async (input: any) => {
      const invocation = {
        receiptRef: {
          schemaVersion: 1,
          invocationId: `test:${input.task.id}`,
          tenantId: 'local',
          projectId: 'test-project',
        },
        executionBackend: 'docker',
        transport: 'mcp',
        state: 'dispatch-started',
        executionMode: 'normal-docker-exact',
        executionEvidenceRef: 'sha256:exact-provider-start',
        dispatchStartedAt: '2026-09-01T20:00:00.000Z',
      };
      await input.onDispatchBoundary?.({
        taskId: input.task.id,
        provider: input.task.provider,
        model: input.task.model,
        backend: 'docker',
        executionEvidenceRef: invocation.executionEvidenceRef,
      }, invocation);
      return {
      disposition: {
        kind: 'spawned',
        taskId: input.task.id,
        executionMode: 'normal-docker-exact',
        executionBackend: 'docker',
        exactDispatchOutcome: { kind: 'released' },
      },
      executionMode: 'normal-docker-exact',
      backend: 'docker',
      provider: input.task.provider,
      resultAuthority: {
        state: 'exact-accepted',
        result: { taskId: input.task.id, selfAssessment: 'DONE' },
      },
      invocation,
    };
    });
  });

  it('projects accepted-awaiting-evaluation without writing its own task/result authority', async () => {
    const { registerRunTool } = await import('../../src/mcp/tools/run.js');
    const server = serverFixture();
    registerRunTool(server as never);

    const response = await server.tools.get('deckent_run')!({
      description: 'change one file',
      model: 'claude-sonnet-5',
      autoApprove: true,
    });
    const body = JSON.parse(response.content[0]!.text) as Record<string, unknown>;

    expect(response.isError).not.toBe(true);
    expect(harness.execute).toHaveBeenCalledOnce();
    expect(harness.execute.mock.calls[0]![0]).toMatchObject({
      transport: 'mcp',
      task: { status: 'PENDING', model: 'claude-sonnet-5' },
    });
    expect(harness.write).not.toHaveBeenCalled();
    expect(harness.writeJobState).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        status: 'ACCEPTED_AWAITING_EVALUATION',
        taskId: expect.stringMatching(/^run-/),
        invocation: expect.objectContaining({
          invocationId: expect.stringMatching(/^test:/),
          state: 'dispatch-started',
          executionMode: 'normal-docker-exact',
        }),
      }),
    );
    expect(harness.writeJobState.mock.calls[0]?.[1]).toMatchObject({
      status: 'RUNNING',
      invocation: { executionMode: 'normal-docker-exact' },
    });
    expect(harness.writeJobState.mock.calls.at(-1)?.[1]).toMatchObject({
      status: 'ACCEPTED_AWAITING_EVALUATION',
    });
    expect(harness.writeJobState.mock.calls[0]?.[1].startedAt)
      .toBe(harness.writeJobState.mock.calls.at(-1)?.[1].startedAt);
    expect(body.status).toBe('ACCEPTED_AWAITING_EVALUATION');
    expect(body.invocation).toMatchObject({
      state: 'dispatch-started',
      executionMode: 'normal-docker-exact',
    });
  });

  it('returns exact zero-work identity instead of collapsing it into a generic error', async () => {
    harness.execute.mockImplementationOnce(async (input: any) => ({
      disposition: {
        kind: 'not-dispatched',
        taskId: input.task.id,
        reasonCode: 'EXACT_PROVIDER_START_NOT_PROVEN',
        executionMode: 'normal-docker-exact',
        executionBackend: 'docker',
      },
      executionMode: 'normal-docker-exact',
      backend: 'docker',
      provider: input.task.provider,
      invocation: {
        receiptRef: {
          schemaVersion: 1,
          invocationId: `zero:${input.task.id}`,
          tenantId: 'local',
          projectId: 'test-project',
        },
        executionBackend: 'docker',
        transport: 'mcp',
        state: 'not-dispatched',
        executionMode: 'normal-docker-exact',
        reasonCode: 'EXACT_PROVIDER_START_NOT_PROVEN',
        executionEvidenceRef: `sha256:${'a'.repeat(64)}`,
        authorityEvidenceRefs: [
          `sha256:${'a'.repeat(64)}`,
          `sha256:${'b'.repeat(64)}`,
        ],
      },
    }));
    const { registerRunTool } = await import('../../src/mcp/tools/run.js');
    const server = serverFixture();
    registerRunTool(server as never);

    const response = await server.tools.get('deckent_run')!({
      description: 'must stay zero work',
      model: 'claude-sonnet-5',
      autoApprove: true,
    });
    const body = JSON.parse(response.content[0]!.text) as Record<string, any>;

    expect(response.isError).toBe(true);
    expect(body).toMatchObject({
      code: 'TASK_INGRESS_NOT_DISPATCHED',
      disposition: 'not-dispatched',
      executionMode: 'normal-docker-exact',
      invocation: {
        state: 'not-dispatched',
        reasonCode: 'EXACT_PROVIDER_START_NOT_PROVEN',
        authorityEvidenceRefs: [expect.any(String), expect.any(String)],
      },
    });
    expect(harness.writeJobState).not.toHaveBeenCalled();
  });

  it('returns reconciliation-required with its exact receipt instead of calling it zero work', async () => {
    harness.execute.mockImplementationOnce(async (input: any) => ({
      disposition: {
        kind: 'ambiguous',
        taskId: input.task.id,
        reasonCode: 'EXACT_DISPATCH_OUTCOME_AMBIGUOUS',
        executionMode: 'normal-docker-exact',
        executionBackend: 'docker',
      },
      executionMode: 'normal-docker-exact',
      backend: 'docker',
      provider: input.task.provider,
      invocation: {
        receiptRef: {
          schemaVersion: 1,
          invocationId: `reconcile:${input.task.id}`,
          tenantId: 'local',
          projectId: 'test-project',
        },
        executionBackend: 'docker',
        transport: 'mcp',
        state: 'reconciliation-required',
        executionMode: 'normal-docker-exact',
        reasonCode: 'EXACT_DISPATCH_OUTCOME_AMBIGUOUS',
        authorityEvidenceRefs: [
          'reconciliation-receipt:mcp-fixture',
          `sha256:${'c'.repeat(64)}`,
        ],
      },
    }));
    const { registerRunTool } = await import('../../src/mcp/tools/run.js');
    const server = serverFixture();
    registerRunTool(server as never);

    const response = await server.tools.get('deckent_run')!({
      description: 'must reconcile',
      model: 'claude-sonnet-5',
      autoApprove: true,
    });
    const body = JSON.parse(response.content[0]!.text) as Record<string, any>;

    expect(response.isError).toBe(true);
    expect(body).toMatchObject({
      code: 'TASK_INGRESS_RECONCILIATION_REQUIRED',
      disposition: 'ambiguous',
      executionMode: 'normal-docker-exact',
      invocation: {
        state: 'reconciliation-required',
        receiptRef: { invocationId: expect.stringMatching(/^reconcile:/) },
        authorityEvidenceRefs: [expect.any(String), expect.any(String)],
      },
    });
    expect(harness.writeJobState).not.toHaveBeenCalled();
  });

  it('serializes receipt authority when admission throws before dispatch', async () => {
    const error = new Error('provider authority unavailable') as Error & Record<string, unknown>;
    error.taskIngressAuthority = {
      schemaVersion: 1,
      reasonCode: 'PROVIDER_EXECUTION_AUTHORITY_HOLD',
      invocation: {
        receiptRef: {
          schemaVersion: 1,
          invocationId: 'zero:mcp-admission-hold',
          tenantId: 'local',
          projectId: 'test-project',
        },
        executionBackend: 'docker',
        transport: 'mcp',
        state: 'not-dispatched',
        executionMode: 'normal-docker-exact',
        reasonCode: 'PROVIDER_EXECUTION_AUTHORITY_HOLD',
      },
    };
    harness.execute.mockRejectedValueOnce(error);
    const { registerRunTool } = await import('../../src/mcp/tools/run.js');
    const server = serverFixture();
    registerRunTool(server as never);

    const response = await server.tools.get('deckent_run')!({
      description: 'must retain receipt',
      model: 'claude-sonnet-5',
    });
    const body = JSON.parse(response.content[0]!.text) as Record<string, any>;

    expect(response.isError).toBe(true);
    expect(body).toMatchObject({
      code: 'TASK_INGRESS_AUTHORITY_HOLD',
      reasonCode: 'PROVIDER_EXECUTION_AUTHORITY_HOLD',
      invocation: {
        state: 'not-dispatched',
        receiptRef: { invocationId: 'zero:mcp-admission-hold' },
      },
    });
    expect(harness.writeJobState).not.toHaveBeenCalled();
  });
});
