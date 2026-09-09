import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerCheckpointTool } from '../../../src/mcp/tools/checkpoint.js';
import { createHash } from 'node:crypto';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}>;

interface CapturedTool {
  config: Record<string, unknown>;
  handler: ToolHandler;
}

function captureCheckpointTool(): CapturedTool {
  let captured: CapturedTool | undefined;
  const stub = {
    registerTool(_name: string, config: Record<string, unknown>, handler: ToolHandler) {
      captured = { config, handler };
      return {};
    },
  } as unknown as McpServer;
  registerCheckpointTool(stub);
  if (!captured) throw new Error('deckent_checkpoint was not registered');
  return captured;
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('deckent_checkpoint MCP tool', () => {
  let home: string;
  let checkpointFile: string;
  let beforeHash: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'mcp-checkpoint-'));
    const dir = join(home, '.deckent', 'checkpoints');
    mkdirSync(dir, { recursive: true });
    checkpointFile = join(dir, 'checkpoint-s1-plan.json');
    writeFileSync(checkpointFile, JSON.stringify({
      phase: 'plan',
      summary: 'pending gate',
      status: 'pending',
      createdAt: '2026-09-09T00:00:00.000Z',
    }, null, 2));
    beforeHash = sha256File(checkpointFile);
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('registers read-only annotations', () => {
    const { config } = captureCheckpointTool();
    expect(config.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    });
  });

  it('lists pending checkpoints without mutating files', async () => {
    const { handler } = captureCheckpointTool();
    const result = await handler({ action: 'list', root: home });
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.checkpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({ sprintId: 's1', phase: 'plan', status: 'pending' }),
    ]));
    expect(sha256File(checkpointFile)).toBe(beforeHash);
  });

  it('refuses approve with NOT_A_DECISION_SURFACE and preserves fixture bytes', async () => {
    const { handler } = captureCheckpointTool();
    const result = await handler({ action: 'approve', sprintId: 's1', phase: 'plan', root: home });
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.reasonCode).toBe('NOT_A_DECISION_SURFACE');
    expect(payload.decideCommand).toBe('deckent checkpoint approve|reject');
    expect(payload.message).toContain('deckent checkpoint approve s1 plan');
    expect(sha256File(checkpointFile)).toBe(beforeHash);
  });

  it('refuses reject with NOT_A_DECISION_SURFACE and preserves fixture bytes', async () => {
    const { handler } = captureCheckpointTool();
    const result = await handler({ action: 'reject', sprintId: 's1', phase: 'plan', root: home });
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.reasonCode).toBe('NOT_A_DECISION_SURFACE');
    expect(payload.message).toContain('deckent checkpoint reject s1 plan');
    expect(sha256File(checkpointFile)).toBe(beforeHash);
  });
});
