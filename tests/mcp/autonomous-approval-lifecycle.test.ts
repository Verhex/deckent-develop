import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(async () => ({
    language: 'en',
    approval: {
      lifecycle: {
        enabled: true,
        profiles: {
          confirmation: { ttlMs: 8_000, slaMs: [1_000, 2_000, 4_000], riskTier: 'elevated', timeoutDisposition: 'park-undecidable', blocking: 'run' },
          'autonomous-trigger': { ttlMs: 1_000, slaMs: [100, 200, 500], riskTier: 'elevated', timeoutDisposition: 'park-alert', blocking: 'trigger' },
          'gateway-pairing': { ttlMs: 1_000, slaMs: [100, 200, 500], riskTier: 'critical', timeoutDisposition: 'deny-expire', blocking: 'security' },
          'broker-native': { ttlMs: 1_000, slaMs: [100, 200, 500], riskTier: 'routine', timeoutDisposition: 'request-default', blocking: 'request' },
        },
      },
    },
  })),
}));

import { registerAutonomousApproveTool } from '../../src/mcp/tools/autonomous-approval.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function handler(): ToolHandler {
  let registered: ToolHandler | undefined;
  const server = {
    registerTool: (_name: string, _config: unknown, fn: ToolHandler) => { registered = fn; },
  };
  registerAutonomousApproveTool(server as unknown as McpServer);
  return registered!;
}

let root = '';
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = '';
});

describe('focused autonomous MCP lifecycle guard', () => {
  it('returns a typed localized late-decision error and writes no human allow', async () => {
    root = mkdtempSync(join(tmpdir(), 'mcp-focused-autonomous-lifecycle-'));
    const dir = join(root, '.deckent', 'autonomous');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pending.json'), JSON.stringify([{
      triggerId: 'late-focused',
      action: 'autonomous.execute',
      requestedBy: 'legacy',
      enqueuedAt: '2020-01-01T00:00:00.000Z',
    }]));

    const result = await handler()({ triggerId: 'late-focused', root });
    const body = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(result.isError).toBe(true);
    expect(body).toMatchObject({
      code: 'APR_APPROVAL_CLOSED',
      reasonCode: 'expired',
      triggerId: 'late-focused',
    });
    expect(String(body.message)).toContain('expired');
  });
});
