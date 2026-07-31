import { describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const { runSprintRecoveryOperation } = vi.hoisted(() => ({
  runSprintRecoveryOperation: vi.fn(),
}));

vi.mock('../../src/orchestra/sprint-recovery-operation.js', () => ({
  runSprintRecoveryOperation,
  SprintRecoveryOperationError: class SprintRecoveryOperationError extends Error {},
}));

import { registerRecoverTool } from '../../src/mcp/tools/recover.js';

describe('deckent_recover shared application operation', () => {
  it('projects the same recovery report without MCP-owned lifecycle logic', async () => {
    runSprintRecoveryOperation.mockResolvedValue({
      identity: {
        executionId: 'sprint-480',
        generation: 0,
        taskId: 'sprint-480',
        attemptId: 'sprint-480:recovery:0',
        fenceToken: 'fence',
      },
      audit: { overallGate: 'SKIPPED' },
      orphanIpcDirs: [],
      staleLocksCleaned: 0,
      staleSpawnLocksCleaned: 0,
      taskFilesArchived: 3,
      taskFilesPreserved: 2,
    });
    let handler: ((input: {
      sprintId: string;
      dryRun: boolean;
      skipAudit: boolean;
    }) => Promise<{ content: Array<{ text: string }> }>) | undefined;
    const server = {
      registerTool: vi.fn((_name, _config, value) => { handler = value; }),
    } as unknown as McpServer;
    registerRecoverTool(server);

    const response = await handler!({
      sprintId: 'sprint-480',
      dryRun: true,
      skipAudit: true,
    });
    const body = JSON.parse(response.content[0]!.text) as Record<string, unknown>;

    expect(runSprintRecoveryOperation).toHaveBeenCalledWith(
      process.cwd(),
      'sprint-480',
      { dryRun: true, skipAudit: true },
    );
    expect(body).toMatchObject({
      sprintId: 'sprint-480',
      dryRun: true,
      identity: expect.objectContaining({
        executionId: 'sprint-480',
        generation: 0,
      }),
      taskFilesArchived: 3,
      taskFilesPreserved: 2,
    });
  });
});
