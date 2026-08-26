import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerAutonomousTool } from '../../src/mcp/tools/autonomous.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function getHandler(): ToolHandler {
  let registered: ToolHandler | undefined;
  registerAutonomousTool({
    registerTool: (_name: string, _config: unknown, handler: ToolHandler) => { registered = handler; },
  } as unknown as McpServer);
  return registered!;
}

let root = '';
let previousDeckentHome: string | undefined;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  if (previousDeckentHome === undefined) delete process.env['DECKENT_HOME'];
  else process.env['DECKENT_HOME'] = previousDeckentHome;
  root = '';
});

describe('broad autonomous MCP lifecycle guard', () => {
  it('rejects an expired legacy row with structured closure evidence', async () => {
    root = mkdtempSync(join(tmpdir(), 'mcp-broad-autonomous-lifecycle-'));
    previousDeckentHome = process.env['DECKENT_HOME'];
    const globalRoot = join(root, 'global');
    mkdirSync(globalRoot, { recursive: true });
    writeFileSync(join(globalRoot, 'config.json'), '{}\n');
    process.env['DECKENT_HOME'] = globalRoot;
    const dir = join(root, '.deckent', 'autonomous');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pending.json'), JSON.stringify([{
      triggerId: 'late-broad',
      action: 'autonomous.execute',
      requestedBy: 'legacy',
      enqueuedAt: '2020-01-01T00:00:00.000Z',
    }]));

    const result = await getHandler()({ action: 'approve', triggerId: 'late-broad', root });
    const body = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(result.isError).toBe(true);
    expect(body).toMatchObject({
      code: 'APR_APPROVAL_CLOSED',
      reasonCode: 'expired',
      triggerId: 'late-broad',
    });
  });
});
