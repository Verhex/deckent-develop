import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('../../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((toolName, response, _ctx) => ({
    ...response,
    _enriched: {
      summary: `${toolName} operation completed.`,
      hints: [],
      timestamp: '2026-04-09T00:00:00.000Z',
    },
  })),
}));

// B8: deckent_explain reads the retro from memory.db `retro` entries.
vi.mock('../../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn(() => ({
    getById: (id: string) =>
      id.startsWith('retro-') ? { id, content: SAMPLE_RETRO, sprint_num: 124, sprint_id: 'sprint-124' } : null,
    getByType: (t: string) =>
      t === 'retro' ? [{ content: SAMPLE_RETRO, sprint_num: 124, sprint_id: 'sprint-124' }] : [],
    close: () => {},
  })),
}));

vi.mock('../../../src/mcp/helpers/format.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/mcp/helpers/format.js')>();
  return {
    ...actual,
    formatExplainResponse: actual.formatExplainResponse,
    wrapResponse: actual.wrapResponse,
  };
});

// ─── Mock Server Factory ─────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

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

function parseToolResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0].text);
}

// ─── Sample Data ─────────────────────────────────────────────────────────────

const SAMPLE_SPRINT_LOG = `# Sprint 124

| Total Tasks | 4 |
| Completed | 3 |
| Tech Debt | 1 |
| No-Go | 0 |
| Duration | 545000 ms |

- Context Estimator implemented
- Context-Aware Router added
- Token Usage tracking added
- Sprint Reporter Token Summary
`;

const SAMPLE_RETRO = vi.hoisted(() => `# Retrospective — Sprint 124

## Learnings
- Context-aware routing improves model selection
- Token usage tracking helps cost analysis
- Sprint reporter token table provides visibility
- Rubric evaluation is the next priority
`);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('registerExplainTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function getExplainTool() {
    const { registerExplainTool } = await import('../../../src/mcp/tools/explain.js');
    const server = createMockServer();
    registerExplainTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
    const tool = server.tools.get('deckent_explain');
    expect(tool).toBeDefined();
    return tool!;
  }

  describe('tool registration', () => {
    it('registers tool with name deckent_explain', async () => {
      const { registerExplainTool } = await import('../../../src/mcp/tools/explain.js');
      const server = createMockServer();
      registerExplainTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      expect(server.tools.has('deckent_explain')).toBe(true);
    });
  });

  describe('default explain (latest sprint)', () => {
    it('returns sprint summary with learnings for latest sprint', async () => {
      const tool = await getExplainTool();

      // Mock: sprints dir exists, has one sprint file
      vi.mocked(existsSync).mockImplementation((p) => {
        const path = String(p);
        if (path.includes('sprints')) return true;
        if (path.includes('RETRO.md')) return true;
        if (path.includes('DIRECTIVES.md')) return false;
        return false;
      });
      vi.mocked(readdirSync).mockReturnValue(['sprint-124.md'] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockImplementation((p) => {
        const path = String(p);
        if (path.includes('sprint-124')) return SAMPLE_SPRINT_LOG;
        if (path.includes('RETRO')) return SAMPLE_RETRO;
        return '';
      });

      const result = await tool.handler({});
      const parsed = parseToolResult(result);

      // Should have data with sprint info
      expect(parsed.data).toBeDefined();
      expect(parsed.data.found).toBe(true);
      expect(parsed.data.sprintNumber).toBe(124);
      expect(parsed.data.completed).toBe(3);
      expect(parsed.data.techDebt).toBe(1);
      expect(parsed.data.noGo).toBe(0);
      expect(parsed.data.learnings).toBeDefined();
      expect(parsed.data.learnings.length).toBeLessThanOrEqual(3); // default max 3
      expect(parsed.summary).toContain('Sprint #124');
    });
  });

  describe('specific sprint', () => {
    it('returns specific sprint when sprintId is provided', async () => {
      const tool = await getExplainTool();

      vi.mocked(existsSync).mockImplementation((p) => {
        const path = String(p);
        if (path.includes('sprint-124.md')) return true;
        if (path.includes('RETRO.md')) return true;
        if (path.includes('DIRECTIVES.md')) return false;
        return false;
      });
      vi.mocked(readFileSync).mockImplementation((p) => {
        const path = String(p);
        if (path.includes('sprint-124')) return SAMPLE_SPRINT_LOG;
        if (path.includes('RETRO')) return SAMPLE_RETRO;
        return '';
      });

      const result = await tool.handler({ sprintId: '124' });
      const parsed = parseToolResult(result);

      expect(parsed.data.found).toBe(true);
      expect(parsed.data.sprintNumber).toBe(124);
    });

    it('returns not found for missing sprint', async () => {
      const tool = await getExplainTool();

      vi.mocked(existsSync).mockReturnValue(false);

      const result = await tool.handler({ sprintId: '999' });
      const parsed = parseToolResult(result);

      expect(parsed.data.found).toBe(false);
      expect(parsed.summary).toContain('999');
      expect(parsed.summary).toContain('not found');
    });
  });

  describe('verbose mode', () => {
    it('includes all learnings and task details when verbose is true', async () => {
      const tool = await getExplainTool();

      vi.mocked(existsSync).mockImplementation((p) => {
        const path = String(p);
        if (path.includes('sprints')) return true;
        if (path.includes('memory.db')) return true;
        if (path.includes('DIRECTIVES.md')) return false;
        return false;
      });
      vi.mocked(readdirSync).mockReturnValue(['sprint-124.md'] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockImplementation((p) => {
        const path = String(p);
        if (path.includes('sprint-124')) return SAMPLE_SPRINT_LOG;
        return '';
      });

      const result = await tool.handler({ verbose: true });
      const parsed = parseToolResult(result);

      // Verbose should return ALL learnings (4 in our sample), not just 3
      expect(parsed.data.learnings.length).toBe(4);
      // Verbose should include tasks array
      expect(parsed.data.tasks).toBeDefined();
      expect(parsed.data.tasks.length).toBeGreaterThan(0);
    });
  });

  describe('json mode', () => {
    it('returns raw JSON without wrapper when json is true', async () => {
      const tool = await getExplainTool();

      vi.mocked(existsSync).mockImplementation((p) => {
        const path = String(p);
        if (path.includes('sprints')) return true;
        if (path.includes('RETRO.md')) return true;
        if (path.includes('DIRECTIVES.md')) return false;
        return false;
      });
      vi.mocked(readdirSync).mockReturnValue(['sprint-124.md'] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockImplementation((p) => {
        const path = String(p);
        if (path.includes('sprint-124')) return SAMPLE_SPRINT_LOG;
        if (path.includes('RETRO')) return SAMPLE_RETRO;
        return '';
      });

      const result = await tool.handler({ json: true });
      const parsed = parseToolResult(result);

      // JSON mode returns raw data, not wrapped
      expect(parsed.sprintId).toBe(124);
      expect(parsed.goal).toBeDefined();
      expect(parsed.metrics).toBeDefined();
      expect(parsed.metrics.totalTasks).toBe(4);
      expect(parsed.metrics.completed).toBe(3);
      expect(parsed.learnings).toBeDefined();
      // No wrapper properties
      expect(parsed.data).toBeUndefined();
      expect(parsed.summary).toBeUndefined();
    });
  });

  describe('no sprints found', () => {
    it('returns helpful message when no sprints exist', async () => {
      const tool = await getExplainTool();

      vi.mocked(existsSync).mockReturnValue(false);

      const result = await tool.handler({});
      const parsed = parseToolResult(result);

      expect(parsed.data.found).toBe(false);
      expect(parsed.summary).toContain('No sprints found');
    });
  });
});
