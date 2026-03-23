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
  formatHistoryResponse: vi.fn(() => 'mocked history summary'),
  wrapResponse: vi.fn((<T>(data: T, _summary: string) => data) as <T>(data: T, summary: string) => T),
}));

vi.mock('../../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((toolName: string, response: Record<string, unknown>) => ({
    ...response,
    _enriched: {
      summary: toolName === 'status' ? 'Sprint status retrieved.' : 'Sprint history retrieved.',
      hints: toolName === 'status' ? ['`deckent retro` ile retrospektif okuyun'] : ['Trendi takip edin'],
      timestamp: '2026-03-20T00:00:00.000Z',
    },
  })),
}));

import { readLatestJobState } from '../../../src/mcp/tools/job-runner.js';
import { enrichResponse } from '../../../src/mcp/helpers/enrich.js';

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getStatusTool() {
  const { registerStatusTool } = await import('../../../src/mcp/tools/status.js');
  const server = createMockServer();
  registerStatusTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  const tool = server.tools.get('deckent_status');
  expect(tool).toBeDefined();
  return tool!;
}

async function getHistoryTool() {
  const { registerHistoryTool } = await import('../../../src/mcp/tools/history.js');
  const server = createMockServer();
  registerHistoryTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  const tool = server.tools.get('deckent_history');
  expect(tool).toBeDefined();
  return tool!;
}

// ─── Sample Data ──────────────────────────────────────────────────────────────

const sampleDashboard = {
  sprint: { id: 'sprint-024', startedAt: new Date(Date.now() - 600_000).toISOString() },
  progress: { done: 3, total: 10 },
  agents: [{ id: 'w-001', status: 'EXECUTING' }, { id: 'w-002', status: 'TESTING' }],
  alerts: [{ level: 'WARNING', message: 'Worker stale' }],
  usage: { tokens: 5000 },
};

const sampleJobState = {
  jobId: 'job-001',
  status: 'RUNNING' as const,
  startedAt: '2026-03-20T09:00:00.000Z',
  sprintId: 'sprint-024',
};

// ─── registerStatusTool Tests ────────────────────────────────────────────────

describe('registerStatusTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readLatestJobState).mockReturnValue(null);
  });

  // ── Tool Registration ──────────────────────────────────────────────────────

  describe('tool registration', () => {
    it('registers tool with name deckent_status', async () => {
      const { registerStatusTool } = await import('../../../src/mcp/tools/status.js');
      const server = createMockServer();
      registerStatusTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      expect(server.tools.has('deckent_status')).toBe(true);
    });

    it('registers tool with title Sprint Status', async () => {
      const { registerStatusTool } = await import('../../../src/mcp/tools/status.js');
      const server = createMockServer();
      registerStatusTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      const config = server.tools.get('deckent_status')!.config as { title: string };
      expect(config.title).toBe('Sprint Status');
    });

    it('registers tool with description mentioning dashboard', async () => {
      const { registerStatusTool } = await import('../../../src/mcp/tools/status.js');
      const server = createMockServer();
      registerStatusTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      const config = server.tools.get('deckent_status')!.config as { description: string };
      expect(config.description).toMatch(/dashboard|sprint/i);
    });
  });

  // ── Dashboard Read ─────────────────────────────────────────────────────────

  describe('dashboard read', () => {
    it('returns active: false when dashboard file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.active).toBe(false);
      expect(parsed.message).toMatch(/no active sprint/i);
    });

    it('reads and parses dashboard file when it exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleDashboard));
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.sprint).toBeDefined();
      expect(parsed.progress).toBeDefined();
    });

    it('includes progressBar field in response', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleDashboard));
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(typeof parsed.progressBar).toBe('string');
      expect(parsed.progressBar).toMatch(/[█░]/);
    });

    it('includes eta field in response', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleDashboard));
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(typeof parsed.eta).toBe('string');
    });

    it('includes workerSummary with agent count', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleDashboard));
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.workerSummary).toBe('2 active');
    });

    it('includes alertSummary with alert count', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleDashboard));
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.alertSummary).toBe('1 alert');
    });

    it('handles zero total tasks with empty progress bar', async () => {
      const dashboardNoProgress = { ...sampleDashboard, progress: { done: 0, total: 0 } };
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(dashboardNoProgress));
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.progressBar).toMatch(/^░+$/);
    });

    it('shows plural alerts for multiple alerts', async () => {
      const multiAlert = {
        ...sampleDashboard,
        alerts: [{ level: 'WARNING' }, { level: 'CRITICAL' }],
      };
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(multiAlert));
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.alertSummary).toBe('2 alerts');
    });
  });

  // ── Job State Inclusion ────────────────────────────────────────────────────

  describe('job state inclusion', () => {
    it('includes latest job state in no-dashboard response', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readLatestJobState).mockReturnValue(sampleJobState);
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.job).toEqual(sampleJobState);
    });

    it('includes latest job state in active dashboard response', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleDashboard));
      vi.mocked(readLatestJobState).mockReturnValue(sampleJobState);
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.job).toEqual(sampleJobState);
    });

    it('includes job: null when no job state exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleDashboard));
      vi.mocked(readLatestJobState).mockReturnValue(null);
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.job).toBeNull();
    });

    it('shows RUNNING job state in response', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readLatestJobState).mockReturnValue({ ...sampleJobState, status: 'RUNNING' });
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.job?.status).toBe('RUNNING');
    });

    it('shows COMPLETE job state in response', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readLatestJobState).mockReturnValue({
        ...sampleJobState,
        status: 'COMPLETE',
        completedAt: '2026-03-20T10:00:00.000Z',
      });
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.job?.status).toBe('COMPLETE');
    });
  });

  // ── Error Handling ─────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns active: false and isError when dashboard is malformed JSON', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('NOT_VALID_JSON{{{{');
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.active).toBe(false);
      expect(result.isError).toBe(true);
    });

    it('returns error message mentioning parse failure', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('{invalid}');
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.message).toMatch(/cannot parse/i);
    });

    it('includes job state in parse error response', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('BROKEN');
      vi.mocked(readLatestJobState).mockReturnValue(sampleJobState);
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.job).toEqual(sampleJobState);
    });
  });

  // ── Response Enrichment ────────────────────────────────────────────────────

  describe('response enrichment', () => {
    it('calls enrichResponse with tool name status', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleDashboard));
      const tool = await getStatusTool();
      await tool.handler({});
      expect(vi.mocked(enrichResponse)).toHaveBeenCalledWith('status', expect.any(Object));
    });

    it('response includes _enriched meta with summary and hints', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleDashboard));
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed._enriched).toBeDefined();
      expect(typeof parsed._enriched.summary).toBe('string');
      expect(Array.isArray(parsed._enriched.hints)).toBe(true);
    });

    it('_enriched summary contains status information', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleDashboard));
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed._enriched.summary).toMatch(/sprint status retrieved/i);
    });

    it('response content array has exactly one text item', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleDashboard));
      const tool = await getStatusTool();
      const result = await tool.handler({});
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe('text');
    });

    it('eta returns unknown when no startedAt or no progress', async () => {
      const noStartDashboard = {
        ...sampleDashboard,
        sprint: { id: 'sprint-024' },
        progress: { done: 0, total: 10 },
      };
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(noStartDashboard));
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.eta).toBe('unknown');
    });
  });
});

// ─── registerHistoryTool Tests ────────────────────────────────────────────────

describe('registerHistoryTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Tool Registration ──────────────────────────────────────────────────────

  describe('tool registration', () => {
    it('registers tool with name deckent_history', async () => {
      const { registerHistoryTool } = await import('../../../src/mcp/tools/history.js');
      const server = createMockServer();
      registerHistoryTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      expect(server.tools.has('deckent_history')).toBe(true);
    });

    it('registers tool with title Sprint History', async () => {
      const { registerHistoryTool } = await import('../../../src/mcp/tools/history.js');
      const server = createMockServer();
      registerHistoryTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      const config = server.tools.get('deckent_history')!.config as { title: string };
      expect(config.title).toBe('Sprint History');
    });

    it('registers tool with inputSchema containing last parameter', async () => {
      const { registerHistoryTool } = await import('../../../src/mcp/tools/history.js');
      const server = createMockServer();
      registerHistoryTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      const config = server.tools.get('deckent_history')!.config as { inputSchema: unknown };
      expect(config.inputSchema).toBeDefined();
    });

    it('registers tool with description mentioning sprint logs', async () => {
      const { registerHistoryTool } = await import('../../../src/mcp/tools/history.js');
      const server = createMockServer();
      registerHistoryTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      const config = server.tools.get('deckent_history')!.config as { description: string };
      expect(config.description).toMatch(/sprint/i);
    });
  });

  // ── Sprint Log Read ────────────────────────────────────────────────────────

  describe('sprint log read', () => {
    it('returns empty sprints array when sprints dir does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 5 });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(Array.isArray(parsed.sprints)).toBe(true);
      expect(parsed.sprints).toHaveLength(0);
    });

    it('reads sprint files from sprints directory', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([
        'sprint-001.md', 'sprint-002.md', 'sprint-003.md',
      ] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockReturnValue('# Sprint Log\n- 2/3 tasks done');
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 5 });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.sprints).toHaveLength(3);
    });

    it('returns sprint id and content for each sprint', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([
        'sprint-010.md',
      ] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockReturnValue('# Sprint 10 Log');
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 5 });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.sprints[0].id).toBe('sprint-010');
      expect(parsed.sprints[0].content).toBe('# Sprint 10 Log');
    });

    it('filters only sprint-*.md files', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([
        'sprint-001.md', 'README.md', 'other.txt', 'sprint-002.md',
      ] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockReturnValue('content');
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 5 });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.sprints).toHaveLength(2);
    });
  });

  // ── Last Parameter ────────────────────────────────────────────────────────

  describe('last parameter', () => {
    it('returns only the last N sprints', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([
        'sprint-001.md', 'sprint-002.md', 'sprint-003.md',
        'sprint-004.md', 'sprint-005.md', 'sprint-006.md',
      ] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockReturnValue('content');
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 3 });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.sprints).toHaveLength(3);
    });

    it('returns sprints in sorted order (most recent last)', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([
        'sprint-003.md', 'sprint-001.md', 'sprint-002.md',
      ] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockReturnValue('content');
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 3 });
      const parsed = JSON.parse(result.content[0]!.text);
      const ids = parsed.sprints.map((s: { id: string }) => s.id);
      expect(ids).toEqual(['sprint-001', 'sprint-002', 'sprint-003']);
    });

    it('handles last=1 returning only most recent sprint', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([
        'sprint-001.md', 'sprint-002.md', 'sprint-003.md',
      ] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockReturnValue('content');
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 1 });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.sprints).toHaveLength(1);
      expect(parsed.sprints[0].id).toBe('sprint-003');
    });

    it('returns all sprints when last exceeds available count', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([
        'sprint-001.md', 'sprint-002.md',
      ] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockReturnValue('content');
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 10 });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.sprints).toHaveLength(2);
    });
  });

  // ── Trend Detection ───────────────────────────────────────────────────────

  describe('trend detection', () => {
    it('returns insufficient_data when only one sprint', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([
        'sprint-001.md',
      ] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockReturnValue('# Sprint\n- 5/10 tasks done');
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 5 });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.trend).toBe('insufficient_data');
    });

    it('returns insufficient_data when sprints dir is missing', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 5 });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.trend).toBe('insufficient_data');
    });

    it('detects improving trend when success rate increases', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([
        'sprint-001.md', 'sprint-002.md',
      ] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('sprint-001')) return '# Sprint\n- 3/10 tasks done';
        return '# Sprint\n- 9/10 tasks done';
      });
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 5 });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.trend).toBe('improving');
    });

    it('detects declining trend when success rate decreases', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([
        'sprint-001.md', 'sprint-002.md',
      ] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('sprint-001')) return '# Sprint\n- 9/10 tasks done';
        return '# Sprint\n- 2/10 tasks done';
      });
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 5 });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.trend).toBe('declining');
    });

    it('detects stable trend when success rate stays same', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([
        'sprint-001.md', 'sprint-002.md',
      ] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockReturnValue('# Sprint\n- 5/10 tasks done');
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 5 });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.trend).toBe('stable');
    });
  });

  // ── Error Handling ─────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns empty sprints when sprints directory is missing', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 5 });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.sprints).toHaveLength(0);
    });

    it('does not set isError when sprints dir is missing (graceful)', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 5 });
      expect(result.isError).toBeUndefined();
    });

    it('handles empty sprints directory gracefully', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 5 });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.sprints).toHaveLength(0);
      expect(parsed.trend).toBe('insufficient_data');
    });
  });

  // ── Response Enrichment ────────────────────────────────────────────────────

  describe('response enrichment', () => {
    it('calls enrichResponse with tool name history', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const tool = await getHistoryTool();
      await tool.handler({ last: 5 });
      expect(vi.mocked(enrichResponse)).toHaveBeenCalledWith('history', expect.any(Object));
    });

    it('response includes _enriched meta with summary and hints', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 5 });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed._enriched).toBeDefined();
      expect(typeof parsed._enriched.summary).toBe('string');
      expect(Array.isArray(parsed._enriched.hints)).toBe(true);
    });

    it('_enriched summary mentions sprint history', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 5 });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed._enriched.summary).toMatch(/sprint history retrieved/i);
    });

    it('response content array has exactly one text item', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 5 });
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe('text');
    });

    it('_enriched hints are non-empty for history tool', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 5 });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed._enriched.hints.length).toBeGreaterThan(0);
    });
  });
});
