import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRunRecoveryOperation,
  MockSprintRecoveryOperationError,
} = vi.hoisted(() => ({
  mockRunRecoveryOperation: vi.fn(),
  MockSprintRecoveryOperationError: class MockSprintRecoveryOperationError extends Error {
    constructor(
      public readonly code: string,
      public readonly details: Readonly<Record<string, string>>,
    ) {
      super(code);
    }
  },
}));

vi.mock('../../../src/orchestra/sprint-recovery-operation.js', () => ({
  runSprintRecoveryOperation: mockRunRecoveryOperation,
  SprintRecoveryOperationError: MockSprintRecoveryOperationError,
}));
vi.mock('../../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: (_tool: string, data: Record<string, unknown>) => data,
}));

import { registerRecoverTool } from '../../../src/mcp/tools/recover.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function createServer() {
  const tools = new Map<string, {
    config: Record<string, unknown>;
    handler: ToolHandler;
  }>();
  return {
    tools,
    registerTool(
      name: string,
      config: Record<string, unknown>,
      handler: ToolHandler,
    ) {
      tools.set(name, { config, handler });
    },
  };
}

function parse(response: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(response.content[0]!.text) as Record<string, unknown>;
}

const identity = {
  executionId: 'sprint-150',
  generation: 2,
  taskId: 'sprint-150',
  attemptId: 'sprint-150:recovery:2',
  fenceToken: 'mcp-fence',
};

describe('deckent_recover MCP application adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunRecoveryOperation.mockResolvedValue({
      identity,
      audit: { overallGate: 'PASS' },
      orphanIpcDirs: [],
      staleLocksCleaned: 0,
      staleSpawnLocksCleaned: 0,
      taskFilesArchived: 3,
      taskFilesPreserved: 1,
    });
  });

  it('registers a destructive, non-idempotent mutation surface', () => {
    const server = createServer();
    registerRecoverTool(server as never);

    expect(server.tools.get('deckent_recover')?.config.annotations).toEqual(
      expect.objectContaining({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      }),
    );
  });

  it('keeps dry-run read-only and delegates exactly once', async () => {
    const server = createServer();
    registerRecoverTool(server as never);
    const response = await server.tools.get('deckent_recover')!.handler({
      sprintId: 'sprint-150',
      dryRun: true,
      skipAudit: false,
    });

    expect(mockRunRecoveryOperation).toHaveBeenCalledTimes(1);
    expect(mockRunRecoveryOperation).toHaveBeenCalledWith(
      process.cwd(),
      'sprint-150',
      { dryRun: true, skipAudit: false },
    );
    expect(parse(response)).toMatchObject({
      success: true,
      dryRun: true,
      identity: { generation: 2, fenceToken: 'mcp-fence' },
      taskFilesArchived: 3,
    });
  });

  it('passes an exact approval through without MCP-owned lifecycle logic', async () => {
    const server = createServer();
    registerRecoverTool(server as never);
    const approval = {
      approvalRef: 'approval:mcp',
      idempotencyKey: 'mcp-once',
      identity,
    };

    await server.tools.get('deckent_recover')!.handler({
      sprintId: 'sprint-150',
      dryRun: false,
      skipAudit: true,
      approval,
    });

    expect(mockRunRecoveryOperation).toHaveBeenCalledWith(
      process.cwd(),
      'sprint-150',
      { dryRun: false, skipAudit: true, approval },
    );
  });

  it('returns the same typed HOLD code and details to MCP readers', async () => {
    mockRunRecoveryOperation.mockRejectedValueOnce(
      new MockSprintRecoveryOperationError('SETTLEMENT_FAILED', {
        sprintId: 'sprint-150',
        disposition: 'HOLD',
        reason: 'ownership-unverified',
      }),
    );
    const server = createServer();
    registerRecoverTool(server as never);
    const response = await server.tools.get('deckent_recover')!.handler({
      sprintId: 'sprint-150',
      dryRun: false,
      skipAudit: true,
      approval: {
        approvalRef: 'approval:mcp',
        idempotencyKey: 'mcp-once',
        identity,
      },
    });

    expect(response.isError).toBe(true);
    expect(parse(response)).toEqual({
      error: true,
      errorCode: 'SETTLEMENT_FAILED',
      details: {
        sprintId: 'sprint-150',
        disposition: 'HOLD',
        reason: 'ownership-unverified',
      },
    });
  });

  it('does not translate unknown implementation failures into success', async () => {
    mockRunRecoveryOperation.mockRejectedValueOnce(new TypeError('adapter bug'));
    const server = createServer();
    registerRecoverTool(server as never);
    const response = await server.tools.get('deckent_recover')!.handler({
      sprintId: 'sprint-150',
      dryRun: true,
      skipAudit: true,
    });

    expect(response.isError).toBe(true);
    expect(parse(response)).toEqual({
      error: true,
      errorCode: 'RECOVERY_INTERNAL_ERROR',
      details: {},
    });
  });
});
