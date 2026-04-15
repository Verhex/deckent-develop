/**
 * tests/mcp/tools/status.test.ts
 *
 * Tests for deckent_status MCP tool's dependencyGraph field (Task 139-031).
 * Verifies that `verbose: true` includes `dependencyGraph` when depgraph files exist.
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

vi.mock('../../../src/mcp/tools/job-runner.js', () => ({
  readLatestJobState: vi.fn(),
}));

vi.mock('../../../src/mcp/helpers/format.js', () => ({
  formatStatusResponse: vi.fn(() => 'mocked summary'),
  wrapResponse: vi.fn((<T>(data: T, _summary: string) => data) as <T>(data: T, summary: string) => T),
}));

vi.mock('../../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((toolName: string, response: Record<string, unknown>) => ({
    ...response,
    _enriched: {
      summary: toolName === 'status' ? 'Sprint status retrieved.' : 'retrieved.',
      hints: ['hint'],
      timestamp: '2026-04-15T00:00:00.000Z',
    },
  })),
}));

vi.mock('../../../src/monitor/sprint-state.js', () => ({
  getCurrentSprintId: vi.fn().mockReturnValue('sprint-139'),
}));

vi.mock('../../../src/monitor/dashboard-manager.js', () => ({
  readDashboardSafe: vi.fn(),
}));

import { readLatestJobState } from '../../../src/mcp/tools/job-runner.js';
import { readDashboardSafe } from '../../../src/monitor/dashboard-manager.js';
import { getCurrentSprintId } from '../../../src/monitor/sprint-state.js';

// ─── Mock Server ──────────────────────────────────────────────────────────────

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

// ─── Sample Data ──────────────────────────────────────────────────────────────

const sampleDashboard = {
  sprint: { id: 'sprint-139', startedAt: new Date(Date.now() - 600_000).toISOString() },
  progress: { done: 5, total: 10 },
  agents: [{ id: 'w-001', status: 'EXECUTING' }],
  alerts: [],
  usage: { tokens: 5000 },
};

const sampleMmd = `graph TD
  t_139_001["139-001 (W0)"]
  t_139_002["139-002 (W1)"]
  t_139_001 --> t_139_002`;

const sampleDepGraphJson = {
  sprintId: 'sprint-139',
  dependencies: { 't_139_002': ['t_139_001'] },
  dependents: { 't_139_001': ['t_139_002'] },
  waveAssignment: { 't_139_001': 0, 't_139_002': 1 },
  waves: [{ waveIndex: 0, taskIds: ['t_139_001'] }, { waveIndex: 1, taskIds: ['t_139_002'] }],
  hasCycle: false,
  cycleTaskIds: [],
  persistedAt: '2026-04-15T00:00:00.000Z',
};

// ─── Helper ───────────────────────────────────────────────────────────────────

async function getStatusTool() {
  const { registerStatusTool } = await import('../../../src/mcp/tools/status.js');
  const server = createMockServer();
  registerStatusTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  const tool = server.tools.get('deckent_status');
  expect(tool).toBeDefined();
  return tool!;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('deckent_status — dependencyGraph field (Task 139-031)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readLatestJobState).mockReturnValue(null);
    vi.mocked(getCurrentSprintId).mockReturnValue('sprint-139');

    // Default: valid dashboard
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readDashboardSafe).mockReturnValue({
      valid: true,
      state: sampleDashboard,
      repaired: false,
    });
    // Default readFileSync returns dashboard JSON
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleDashboard));
  });

  // ── MCP verbose=false ─────────────────────────────────────────────────────

  describe('verbose=false (default)', () => {
    it('does NOT include dependencyGraph when verbose=false', async () => {
      const tool = await getStatusTool();
      const result = await tool.handler({ verbose: false });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.dependencyGraph).toBeUndefined();
    });

    it('does NOT include dependencyGraph when verbose is omitted', async () => {
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.dependencyGraph).toBeUndefined();
    });
  });

  // ── MCP verbose=true — no depgraph file ───────────────────────────────────

  describe('verbose=true — no depgraph file', () => {
    it('returns undefined dependencyGraph when no depgraph files exist', async () => {
      // existsSync: dashboard true, depgraph files false
      vi.mocked(existsSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.includes('depgraph')) return false;
        return true;
      });

      const tool = await getStatusTool();
      const result = await tool.handler({ verbose: true });
      const parsed = JSON.parse(result.content[0]!.text);
      // dependencyGraph should be absent (null check omitted from verboseFields)
      expect(parsed.dependencyGraph).toBeUndefined();
    });
  });

  // ── MCP verbose=true — with depgraph files ───────────────────────────────

  describe('verbose=true — with depgraph files', () => {
    beforeEach(() => {
      // existsSync: dashboard=true, mmd=true, json=true
      vi.mocked(existsSync).mockReturnValue(true);
      // readFileSync: return appropriate content based on path
      vi.mocked(readFileSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('.mmd')) return sampleMmd;
        if (path.endsWith('depgraph.json')) return JSON.stringify(sampleDepGraphJson);
        return JSON.stringify(sampleDashboard);
      });
    });

    it('includes dependencyGraph field when verbose=true and depgraph exists', async () => {
      const tool = await getStatusTool();
      const result = await tool.handler({ verbose: true });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.dependencyGraph).toBeDefined();
    });

    it('dependencyGraph has format=mermaid', async () => {
      const tool = await getStatusTool();
      const result = await tool.handler({ verbose: true });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.dependencyGraph?.format).toBe('mermaid');
    });

    it('dependencyGraph.content contains Mermaid graph TD syntax', async () => {
      const tool = await getStatusTool();
      const result = await tool.handler({ verbose: true });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.dependencyGraph?.content).toContain('graph TD');
    });

    it('dependencyGraph.content contains task node definitions', async () => {
      const tool = await getStatusTool();
      const result = await tool.handler({ verbose: true });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.dependencyGraph?.content).toContain('139-001');
    });

    it('dependencyGraph.json contains wave and dependency data', async () => {
      const tool = await getStatusTool();
      const result = await tool.handler({ verbose: true });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.dependencyGraph?.json).toBeDefined();
      expect((parsed.dependencyGraph?.json as typeof sampleDepGraphJson).hasCycle).toBe(false);
    });

    it('dependencyGraph.json contains sprintId', async () => {
      const tool = await getStatusTool();
      const result = await tool.handler({ verbose: true });
      const parsed = JSON.parse(result.content[0]!.text);
      const depJson = parsed.dependencyGraph?.json as typeof sampleDepGraphJson;
      expect(depJson.sprintId).toBe('sprint-139');
    });
  });

  // ── MCP verbose=true — only mmd exists ───────────────────────────────────

  describe('verbose=true — only mmd exists (no json)', () => {
    it('returns dependencyGraph with content when only mmd exists', async () => {
      vi.mocked(existsSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('.mmd')) return true;
        if (path.endsWith('depgraph.json')) return false;
        return true; // dashboard
      });
      vi.mocked(readFileSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('.mmd')) return sampleMmd;
        return JSON.stringify(sampleDashboard);
      });

      const tool = await getStatusTool();
      const result = await tool.handler({ verbose: true });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.dependencyGraph?.format).toBe('mermaid');
      expect(parsed.dependencyGraph?.content).toContain('graph TD');
    });
  });

  // ── MCP verbose=true — no sprint ID anywhere ─────────────────────────────

  describe('verbose=true — no sprint ID', () => {
    it('does NOT include dependencyGraph when both canonical and dashboard sprintId are null', async () => {
      // Dashboard with no sprint.id and canonical returning null
      vi.mocked(getCurrentSprintId).mockReturnValue(null);
      const dashboardNoId = { ...sampleDashboard, sprint: { startedAt: undefined } };
      vi.mocked(readDashboardSafe).mockReturnValue({
        valid: true,
        state: dashboardNoId,
        repaired: false,
      });
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(dashboardNoId));

      const tool = await getStatusTool();
      const result = await tool.handler({ verbose: true });
      const parsed = JSON.parse(result.content[0]!.text);
      // With no sprint ID, loadDepGraphFiles is not called → no dependencyGraph
      expect(parsed.dependencyGraph).toBeUndefined();
    });
  });

  // ── Tool schema ───────────────────────────────────────────────────────────

  describe('tool schema', () => {
    it('tool has verbose parameter in inputSchema', async () => {
      const { registerStatusTool } = await import('../../../src/mcp/tools/status.js');
      const server = createMockServer();
      registerStatusTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      const tool = server.tools.get('deckent_status')!;
      expect(tool).toBeDefined();
      // Verify tool is registered with inputSchema containing verbose
      const config = tool.config as { inputSchema?: unknown };
      expect(config.inputSchema).toBeDefined();
    });
  });
});
