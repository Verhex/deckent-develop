import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildStatusJsonSnapshot } from '../../src/cli/commands/status.js';
import { reconcileStatusResponse } from '../../src/api/status-reconcile.js';
import { registerStatusTool } from '../../src/mcp/tools/status.js';

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};
type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

function writeJson(root: string, relativePath: string, value: unknown): void {
  const path = join(root, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(value), 'utf8');
}

function readinessOf(payload: Record<string, unknown>): string {
  if (typeof payload['readiness'] === 'string') return payload['readiness'];
  const error = payload['error'] as { disposition?: string } | undefined;
  if (error?.disposition) return error.disposition;
  const authority = payload['authority'] as { lifecycle?: string } | undefined;
  return authority?.lifecycle === 'PAUSED'
    || authority?.lifecycle === 'ABORTED'
    || authority?.lifecycle === 'COMPLETE'
    || authority?.lifecycle === 'IDLE'
    ? 'SELF_SUFFICIENT'
    : 'READY';
}

async function mcpStatus(root: string): Promise<Record<string, unknown>> {
  let handler: ToolHandler | undefined;
  const server = {
    registerTool: (_name: string, _config: unknown, registered: ToolHandler) => {
      handler = registered;
    },
  };
  registerStatusTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  const previous = process.cwd();
  try {
    process.chdir(root);
    const result = await handler!({ json: true });
    return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
  } finally {
    process.chdir(previous);
  }
}

async function expectParity(root: string, expected: { lifecycle: string; readiness: string }): Promise<void> {
  const cli = buildStatusJsonSnapshot(root, join(root, '.dashboard'), {});
  const mcp = await mcpStatus(root);
  const api = reconcileStatusResponse(root, null) as Record<string, unknown>;
  const projection = (value: Record<string, unknown>) => ({
    lifecycle: value['lifecycle'],
    readiness: readinessOf(value),
  });

  expect(projection(cli)).toEqual(expected);
  expect(projection(mcp)).toEqual(expected);
  expect(projection(api)).toEqual(expected);
}

describe.sequential('CLI, MCP, and API status readiness parity', () => {
  const roots: string[] = [];
  const root = (): string => {
    const created = mkdtempSync(join(tmpdir(), 'deckent-status-parity-'));
    roots.push(created);
    return created;
  };

  afterEach(() => {
    for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
  });

  it('keeps a resumable PAUSED run self-sufficient on all three surfaces', async () => {
    const projectRoot = root();
    writeJson(projectRoot, '.deckent/sprint-state.json', {
      sprintId: 'sprint-675-paused', phase: 'EXECUTE', status: 'PAUSED',
    });
    writeJson(projectRoot, '.deckent/sprint-675-paused-checkpoint.json', { sprintId: 'sprint-675-paused' });

    await expectParity(projectRoot, { lifecycle: 'PAUSED', readiness: 'SELF_SUFFICIENT' });
  });

  it('holds an ACTIVE claim without coordinator liveness evidence on all three surfaces', async () => {
    const projectRoot = root();
    writeJson(projectRoot, '.deckent/sprint-state.json', {
      sprintId: 'sprint-675-unproven', phase: 'EXECUTE', status: 'ACTIVE',
    });
    writeJson(projectRoot, '.deckent/sprint-active.json', { sprintId: 'sprint-675-unproven' });

    await expectParity(projectRoot, { lifecycle: 'ORPHANED', readiness: 'HOLD' });
  });

  it('keeps a proven terminal failed flow ABORTED and self-sufficient on all three surfaces', async () => {
    const projectRoot = root();
    writeJson(projectRoot, '.deckent/sprint-state.json', {
      sprintId: 'sprint-675-aborted', phase: 'COMPLETE', status: 'FAILED',
    });

    await expectParity(projectRoot, { lifecycle: 'ABORTED', readiness: 'SELF_SUFFICIENT' });
  });
});
