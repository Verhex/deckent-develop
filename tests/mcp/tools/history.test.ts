import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

vi.mock('../../../src/orchestra/sprint-reporter.js', () => ({
  collectSprintFiles: vi.fn(),
}));

vi.mock('../../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((toolName: string, response: Record<string, unknown>) => ({
    ...response,
    _enriched: {
      summary: 'Run history retrieved.',
      hints: [],
      timestamp: '2026-07-18T00:00:00.000Z',
    },
  })),
}));

vi.mock('../../../src/mcp/helpers/format.js', () => ({
  formatHistoryResponse: vi.fn(() => 'mocked summary'),
  wrapResponse: vi.fn(<T>(data: T, _summary: string) => data),
}));

import { readFileSync } from 'node:fs';
import { collectSprintFiles } from '../../../src/orchestra/sprint-reporter.js';
import { formatHistoryResponse, wrapResponse } from '../../../src/mcp/helpers/format.js';
import { enrichResponse } from '../../../src/mcp/helpers/enrich.js';

// ─── Mock Server ──────────────────────────────────────────────────────────────

type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

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

async function getHistoryTool() {
  const { registerHistoryTool } = await import('../../../src/mcp/tools/history.js');
  const server = createMockServer();
  registerHistoryTool(server as unknown as McpServer);
  const tool = server.tools.get('deckent_history');
  expect(tool).toBeDefined();
  return tool!;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerHistoryTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tool registration', () => {
    it('registers tool with name deckent_history', async () => {
      const tool = await getHistoryTool();
      expect(tool).toBeDefined();
    });

    it('registers tool with schema accepting last and json parameters', async () => {
      const tool = await getHistoryTool();
      expect(tool.config).toHaveProperty('inputSchema');
    });
  });

  describe('empty history', () => {
    it('returns insufficient_data trend and empty runs list when no run logs exist', async () => {
      vi.mocked(collectSprintFiles).mockReturnValue([]);

      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 5, json: true });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.sprints).toEqual([]);
      expect(parsed.trend).toBe('insufficient_data');
    });

    it('calls enrichResponse with history tool name on the summary path', async () => {
      vi.mocked(collectSprintFiles).mockReturnValue([]);

      const tool = await getHistoryTool();
      await tool.handler({ last: 5, json: false });

      expect(vi.mocked(enrichResponse)).toHaveBeenCalledWith('history', expect.any(Object));
    });
  });

  describe('populated history', () => {
    beforeEach(() => {
      vi.mocked(collectSprintFiles).mockReturnValue([
        { file: 'sprint-001.md', dir: '/root/.brain/sprints' },
        { file: 'sprint-002.md', dir: '/root/.brain/sprints' },
        { file: 'sprint-003.md', dir: '/root/.brain/sprints' },
      ]);
      vi.mocked(readFileSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.includes('sprint-001')) return '3/10 tasks done';
        if (path.includes('sprint-002')) return '5/10 tasks done';
        if (path.includes('sprint-003')) return '9/10 tasks done';
        return '';
      });
    });

    it('reads run logs and returns one entry per file', async () => {
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 5, json: true });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.sprints).toHaveLength(3);
      expect(parsed.sprints[0].id).toBe('sprint-001');
    });

    it('limits results to the last N entries', async () => {
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 2, json: true });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.sprints).toHaveLength(2);
      expect(parsed.sprints[0].id).toBe('sprint-002');
      expect(parsed.sprints[1].id).toBe('sprint-003');
    });

    it('detects an improving trend across increasing completion rates', async () => {
      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 5, json: true });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.trend).toBe('improving');
    });

    it('calls formatHistoryResponse on the non-json summary path', async () => {
      const tool = await getHistoryTool();
      await tool.handler({ last: 5, json: false });

      expect(vi.mocked(formatHistoryResponse)).toHaveBeenCalled();
      expect(vi.mocked(wrapResponse)).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('returns an error response when reading run logs throws', async () => {
      vi.mocked(collectSprintFiles).mockReturnValue([
        { file: 'sprint-001.md', dir: '/root/.brain/sprints' },
      ]);
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('ENOENT: no such file');
      });

      const tool = await getHistoryTool();
      const result = await tool.handler({ last: 5, json: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toContain('Failed to read run history');
      expect(parsed.message).toContain('ENOENT');
    });
  });
});
