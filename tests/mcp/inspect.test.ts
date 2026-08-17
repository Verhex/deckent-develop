/**
 * tests/mcp/inspect.test.ts
 *
 * RUN-INSPECTOR-001 package 3 — the `deckent_inspect` MCP twin serves the EXACT
 * core read-model projections (CLI `--json` parity by construction) against a
 * hermetic tmpdir project; lifecycle is never re-inferred on this surface.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerInspectTool } from '../../src/mcp/tools/inspect.js';
import {
  listRunInspectorRuns,
  readRunInspectorTaskDetail,
} from '../../src/core/run-inspector-read-model.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}>;

function getInspectTool(): { handler: ToolHandler } {
  const tools = new Map<string, { handler: ToolHandler }>();
  const server = {
    registerTool(name: string, _config: unknown, handler: ToolHandler) {
      tools.set(name, { handler });
    },
  };
  registerInspectTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  const tool = tools.get('deckent_inspect');
  expect(tool).toBeDefined();
  return tool!;
}

const roots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'mcp-inspect-'));
  roots.push(root);
  mkdirSync(join(root, '.tasks'), { recursive: true });
  writeFileSync(join(root, '.tasks', 'task-543-001.json'), JSON.stringify({
    id: '543-001', description: 'Fixture task', status: 'DONE',
  }));
  writeFileSync(join(root, '.tasks', 'task-543-001.result'), JSON.stringify({
    selfAssessment: 'DONE', filesChanged: ['a.ts'], notes: 'ok',
  }));
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function parsed(handler: ToolHandler, args: Record<string, unknown>) {
  const out = await handler(args);
  return { out, body: JSON.parse(out.content[0]!.text) as Record<string, unknown> };
}

describe('deckent_inspect MCP twin', () => {
  it('no-arg call returns the run listing deep-equal to the core projection', async () => {
    const root = fixtureRoot();
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    const { handler } = getInspectTool();
    const { out, body } = await parsed(handler, {});
    expect(out.isError).toBeUndefined();
    // Surface parity: shape equality with the core module for the SAME root —
    // generatedAt is wall-clock volatile between the two calls, so it is
    // asserted by type and stripped before the deep-equal.
    const reference = JSON.parse(JSON.stringify(listRunInspectorRuns(root))) as Record<string, unknown>;
    expect(typeof body['generatedAt']).toBe('string');
    const { generatedAt: _a, ...bodyStable } = body;
    const { generatedAt: _b, ...referenceStable } = reference;
    expect(bodyStable).toEqual(referenceStable);
    expect(body['schemaVersion']).toBe(1);
  });

  it('taskId call returns the drill-down deep-equal to the core projection', async () => {
    const root = fixtureRoot();
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    const { handler } = getInspectTool();
    const { out, body } = await parsed(handler, { taskId: '543-001' });
    expect(out.isError).toBeUndefined();
    const referenceDetail = JSON.parse(JSON.stringify({
      taskId: '543-001',
      ...readRunInspectorTaskDetail(root, '543-001'),
    })) as Record<string, unknown>;
    expect(body).toEqual(referenceDetail);
  });

  it('invalid task id is a typed error result, never a throw', async () => {
    const root = fixtureRoot();
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    const { handler } = getInspectTool();
    const { out, body } = await parsed(handler, { taskId: '../escape' });
    expect(out.isError).toBe(true);
    expect(body['code']).toBe('INSPECT_INVALID_TASK_ID');
  });

  it('unknown valid task id is a typed not-found error result', async () => {
    const root = fixtureRoot();
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    const { handler } = getInspectTool();
    const { out, body } = await parsed(handler, { taskId: '999-404' });
    expect(out.isError).toBe(true);
    expect(body['code']).toBe('INSPECT_TASK_NOT_FOUND');
  });
});
