import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  appendFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('../../src/nervous/action-registry.js', () => ({
  ACTION_REGISTRY: [
    {
      id: 'REROUTE_TASK',
      displayName: 'Re-route Task',
      category: 'low-risk',
      defaultRisk: 'low',
      reversible: true,
    },
    {
      id: 'KILL_LIVE_SPRINT',
      displayName: 'Kill Live Sprint',
      category: 'safety-floor',
      defaultRisk: 'high',
      reversible: false,
    },
  ],
}));

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

// ─── Mock Server ─────────────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

interface MockServer {
  tools: Map<string, { config: unknown; handler: ToolHandler }>;
  registerTool: (name: string, config: unknown, handler: ToolHandler) => void;
}

function createMockServer(): MockServer {
  const tools = new Map<string, { config: unknown; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
  };
}

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0].text);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupValidConfig() {
  vi.mocked(existsSync).mockImplementation((p: unknown) => {
    const path = String(p);
    if (path.includes('config.json')) return true;
    if (path.includes('nervous-history.jsonl')) return false;
    return false;
  });
  vi.mocked(readFileSync).mockImplementation((p: unknown) => {
    const path = String(p);
    if (path.includes('config.json')) {
      return JSON.stringify({
        nervous_system: {
          mode: 'balanced',
          enabled: true,
          action_overrides: {},
        },
      });
    }
    return '';
  });
  vi.mocked(readFile).mockResolvedValue('');
}

function setupNoConfig() {
  vi.mocked(existsSync).mockReturnValue(false);
  vi.mocked(readFile).mockResolvedValue('');
}

async function getTools() {
  const { registerNervousTools } = await import('../../src/mcp/tools/nervous.js');
  const server = createMockServer();
  registerNervousTools(
    server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
  );
  return server.tools;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MCP Nervous Tools E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  // ── 1. status: valid JSON structure ──────────────────────────────────────

  it('status returns valid JSON structure with config, pending, recent, totalRecords, subscribers', async () => {
    setupValidConfig();
    const tools = await getTools();
    const handler = tools.get('deckent_nervous_status')!.handler;

    const result = await handler({ root: '/tmp/test-project' });
    const data = parseResult(result);

    expect(data).toHaveProperty('config');
    expect(data.config).toHaveProperty('mode', 'balanced');
    expect(data.config).toHaveProperty('enabled', true);
    expect(data).toHaveProperty('pending');
    expect(Array.isArray(data.pending)).toBe(true);
    expect(data).toHaveProperty('recent');
    expect(Array.isArray(data.recent)).toBe(true);
    expect(data).toHaveProperty('totalRecords');
    expect(typeof data.totalRecords).toBe('number');
    expect(data).toHaveProperty('subscribers');
    expect(typeof data.subscribers).toBe('number');
  });

  // ── 2. status: error on invalid root ─────────────────────────────────────

  it('status returns defaults when config does not exist (invalid root fallback)', async () => {
    setupNoConfig();
    const tools = await getTools();
    const handler = tools.get('deckent_nervous_status')!.handler;

    const result = await handler({ root: '/nonexistent/invalid/path' });
    const data = parseResult(result);

    // loadNervousConfig returns defaults when path doesn't exist
    expect(data.config.mode).toBe('balanced');
    expect(data.config.enabled).toBe(false);
    expect(data.totalRecords).toBe(0);
  });

  // ── 3. subscribe: registers client ───────────────────────────────────────

  it('subscribe registers client and returns subscribed=true', async () => {
    const tools = await getTools();
    const handler = tools.get('deckent_nervous_subscribe')!.handler;

    const result = await handler({ sprintId: 'sprint-148' });
    const data = parseResult(result);

    expect(data.subscribed).toBe(true);
    expect(data.sprintId).toBe('sprint-148');
    expect(data.message).toContain('sprint-148');
  });

  // ── 4. subscribe: duplicate is idempotent ────────────────────────────────

  it('subscribe duplicate sprintId is idempotent', async () => {
    const tools = await getTools();
    const handler = tools.get('deckent_nervous_subscribe')!.handler;

    const result1 = await handler({ sprintId: 'sprint-148' });
    const data1 = parseResult(result1);
    expect(data1.subscribed).toBe(true);

    // Second call with same sprintId — idempotent
    const result2 = await handler({ sprintId: 'sprint-148' });
    const data2 = parseResult(result2);
    expect(data2.subscribed).toBe(true);
    expect(data2.sprintId).toBe('sprint-148');
  });

  // ── 5. accept: invalid ID → MCP error ───────────────────────────────────

  it('accept with invalid ID format returns MCP error', async () => {
    setupValidConfig();
    const tools = await getTools();
    const handler = tools.get('deckent_nervous_accept')!.handler;

    const result = await handler({ id: 'INVALID_FORMAT!!!' });
    const data = parseResult(result);

    expect(result.isError).toBe(true);
    expect(data.error).toBe(true);
    expect(data.message).toContain('Invalid notification ID');
  });

  // ── 6. accept: valid ID → resolveApproval ────────────────────────────────

  it('accept with valid ns-prefixed ID returns accepted response', async () => {
    setupValidConfig();
    const tools = await getTools();
    const handler = tools.get('deckent_nervous_accept')!.handler;

    const result = await handler({ id: 'ns-test-001' });
    const data = parseResult(result);

    expect(result.isError).toBeUndefined();
    expect(data.accepted).toBe(true);
    expect(data.notificationId).toBe('ns-test-001');
    expect(data.message).toContain('accepted');
    expect(data).toHaveProperty('existsInHistory');
  });

  // ── 7. reject: with reason → recorded ───────────────────────────────────

  it('reject with reason returns rejected response with reason recorded', async () => {
    const tools = await getTools();
    const handler = tools.get('deckent_nervous_reject')!.handler;

    const result = await handler({ id: 'ns-reject-001', reason: 'Not needed right now' });
    const data = parseResult(result);

    expect(result.isError).toBeUndefined();
    expect(data.rejected).toBe(true);
    expect(data.notificationId).toBe('ns-reject-001');
    expect(data.reason).toBe('Not needed right now');
    expect(data.message).toContain('rejected');
    expect(data.message).toContain('Not needed right now');
  });

  // ── 8. reject: without ID → MCP error ───────────────────────────────────

  it('reject without ID (empty string) returns MCP error', async () => {
    const tools = await getTools();
    const handler = tools.get('deckent_nervous_reject')!.handler;

    const result = await handler({ id: '' });
    const data = parseResult(result);

    expect(result.isError).toBe(true);
    expect(data.error).toBe(true);
    expect(data.message).toContain('id is required');
  });

  // ── 9. config set_preset valid → persisted ───────────────────────────────

  it('config set_preset with valid preset persists and returns confirmation', async () => {
    setupValidConfig();
    const tools = await getTools();
    const handler = tools.get('deckent_nervous_config')!.handler;

    const result = await handler({ action: 'set_preset', preset: 'autopilot', root: '/tmp/test-project' });
    const data = parseResult(result);

    expect(result.isError).toBeUndefined();
    expect(data.action).toBe('set_preset');
    expect(data.preset).toBe('autopilot');
    expect(data.message).toContain('autopilot');
    expect(vi.mocked(writeFileSync)).toHaveBeenCalled();
  });

  // ── 10. config set_preset invalid → error ────────────────────────────────

  it('config set_preset without preset parameter returns error', async () => {
    setupValidConfig();
    const tools = await getTools();
    const handler = tools.get('deckent_nervous_config')!.handler;

    const result = await handler({ action: 'set_preset', root: '/tmp/test-project' });
    const data = parseResult(result);

    expect(result.isError).toBe(true);
    expect(data.error).toBe(true);
    expect(data.message).toContain('preset is required');
  });
});
