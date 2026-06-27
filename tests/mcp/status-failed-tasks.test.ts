/**
 * tests/mcp/status-failed-tasks.test.ts
 *
 * Verifies that deckent_status reports the real NO_GO count in `failedTasks`
 * instead of a hardcoded 0 (333-006 status honesty contract).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('../../src/mcp/tools/job-runner.js', () => ({
  readLatestJobState: vi.fn(() => null),
}));

vi.mock('../../src/mcp/helpers/format.js', () => ({
  formatStatusResponse: vi.fn(() => 'mocked summary'),
  wrapResponse: vi.fn(<T>(data: T, _summary: string) => data),
}));

vi.mock('../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((_toolName: string, response: Record<string, unknown>) => response),
}));

vi.mock('../../src/monitor/sprint-state.js', () => ({
  getCurrentSprintId: vi.fn(() => 'sprint-333'),
}));

vi.mock('../../src/monitor/dashboard-manager.js', () => ({
  readDashboardSafe: vi.fn(),
}));

vi.mock('../../src/core/output-formatter.js', () => ({
  formatStatus: vi.fn(() => 'mocked formatted'),
  resolveOutputMode: vi.fn(() => 'standart'),
}));

import { readDashboardSafe } from '../../src/monitor/dashboard-manager.js';

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

async function getStatusTool() {
  const { registerStatusTool } = await import('../../src/mcp/tools/status.js');
  const server = createMockServer();
  registerStatusTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  const tool = server.tools.get('deckent_status');
  expect(tool).toBeDefined();
  return tool!;
}

// ─── Sample Dashboard ────────────────────────────────────────────────────────

const sampleDashboard = {
  sprint: { id: 'sprint-333', startedAt: new Date(Date.now() - 300_000).toISOString() },
  progress: { done: 5, total: 8 },
  agents: [{ id: 'w-001', status: 'DONE' }],
  alerts: [],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTaskFile(id: string, status: string): Record<string, unknown> {
  return { id, status, assignedAgent: 'bug-fixer', assignedSkills: [] };
}

function setupDashboard() {
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readDashboardSafe).mockReturnValue({
    valid: true,
    state: sampleDashboard,
    repaired: false,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('deckent_status — failedTasks reflects live NO_GO count (333-006)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports failedTasks=2 when sprint has 2 NO_GO tasks', async () => {
    setupDashboard();
    vi.mocked(readdirSync).mockReturnValue(['task-001.json', 'task-002.json'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('task-001')) return JSON.stringify(makeTaskFile('001', 'NO_GO'));
      if (path.includes('task-002')) return JSON.stringify(makeTaskFile('002', 'NO_GO'));
      return JSON.stringify(sampleDashboard);
    });

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as { failedTasks?: number };

    expect(parsed.failedTasks).toBe(2);
  });

  it('reports failedTasks=0 when all tasks are DONE', async () => {
    setupDashboard();
    vi.mocked(readdirSync).mockReturnValue(['task-001.json', 'task-002.json', 'task-003.json'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('task-')) return JSON.stringify(makeTaskFile(path.slice(-9, -5), 'DONE'));
      return JSON.stringify(sampleDashboard);
    });

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as { failedTasks?: number };

    expect(parsed.failedTasks).toBe(0);
  });

  it('reports failedTasks=2 when sprint has mixed DONE and NO_GO tasks', async () => {
    setupDashboard();
    vi.mocked(readdirSync).mockReturnValue([
      'task-001.json',
      'task-002.json',
      'task-003.json',
      'task-004.json',
      'task-005.json',
    ] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('task-001') || path.includes('task-004')) {
        return JSON.stringify(makeTaskFile('x', 'NO_GO'));
      }
      if (path.includes('task-')) {
        return JSON.stringify(makeTaskFile('x', 'DONE'));
      }
      return JSON.stringify(sampleDashboard);
    });

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as { failedTasks?: number };

    expect(parsed.failedTasks).toBe(2);
  });

  it('status shape is otherwise unchanged (has sprint, progress, agents)', async () => {
    setupDashboard();
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      if (String(p).includes('task-')) return JSON.stringify(makeTaskFile('001', 'NO_GO'));
      return JSON.stringify(sampleDashboard);
    });

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    expect(parsed['failedTasks']).toBe(1);
    expect(parsed['sprint']).toBeDefined();
    expect(parsed['progress']).toBeDefined();
    expect(parsed['agents']).toBeDefined();
  });
});
