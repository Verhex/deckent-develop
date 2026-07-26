import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../../src/core/utils.js', () => ({
  ensureDeckentImport: vi.fn(),
  countBrainLines: vi.fn().mockReturnValue(50),
}));

vi.mock('../../../src/core/analyzer.js', () => ({
  analyzeProject: vi.fn(),
}));

vi.mock('../../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((toolName, response, _ctx) => ({
    ...response,
    _enriched: {
      summary: `${toolName} operation completed.`,
      hints: [],
      timestamp: '2026-03-20T00:00:00.000Z',
    },
  })),
}));

// B8: deckent_retro reads memory.db `retro` entries (no .brain/RETRO.md file).
const retroState = vi.hoisted(() => ({
  entries: [] as Array<{ content: string; sprint_num: number; sprint_id: string }>,
}));
vi.mock('../../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn(() => ({
    getByType: (t: string) => (t === 'retro' ? retroState.entries : []),
    getById: (id: string) => retroState.entries.find(e => `retro-${e.sprint_id}` === id) ?? null,
    close: () => {},
  })),
}));

import { ensureDeckentImport } from '../../../src/core/utils.js';
import { analyzeProject } from '../../../src/core/analyzer.js';
import { enrichResponse } from '../../../src/mcp/helpers/enrich.js';
import { modelRegistry } from '../../../src/core/model-registry.js';

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

// ─── retro tool ─────────────────────────────────────────────────────────────

describe('registerRetroTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function getRetroTool() {
    const { registerRetroTool } = await import('../../../src/mcp/tools/retro.js');
    const server = createMockServer();
    registerRetroTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
    const tool = server.tools.get('deckent_retro');
    expect(tool).toBeDefined();
    return tool!;
  }

  describe('tool registration', () => {
    it('registers tool with name deckent_retro', async () => {
      const { registerRetroTool } = await import('../../../src/mcp/tools/retro.js');
      const server = createMockServer();
      registerRetroTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      expect(server.tools.has('deckent_retro')).toBe(true);
    });

    it('registers tool with title and description', async () => {
      const { registerRetroTool } = await import('../../../src/mcp/tools/retro.js');
      const server = createMockServer();
      registerRetroTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      const tool = server.tools.get('deckent_retro');
      expect((tool?.config as Record<string, unknown>)?.title).toBe('Sprint Retrospective');
      expect((tool?.config as Record<string, unknown>)?.description).toContain('retrospective');
    });
  });

  describe('retro entry read', () => {
    it('returns content when a retro entry exists and has data', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      retroState.entries = [{ content: '# Retro\n- Good teamwork\n- Tests passed\n- Coverage improved', sprint_num: 1, sprint_id: 'sprint-001' }];

      const tool = await getRetroTool();
      const result = await tool.handler({});
      const wrapped = parseToolResult(result);
      const parsed = wrapped.data ?? wrapped;

      expect(parsed.content).toContain('# Retro');
      expect(parsed._enriched).toBeDefined();
    });

    it('extracts highlights from bullet points', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      retroState.entries = [{ content: '- First highlight\n- Second highlight\n- Third highlight', sprint_num: 1, sprint_id: 'sprint-001' }];

      const tool = await getRetroTool();
      const result = await tool.handler({});
      const wrapped = parseToolResult(result);
      const parsed = wrapped.data ?? wrapped;

      expect(parsed.highlights).toBeInstanceOf(Array);
      expect(parsed.highlights.length).toBeGreaterThan(0);
    });

    it('limits highlights to at most 5 items', async () => {
      const manyBullets = Array.from({ length: 10 }, (_, i) => `- Item ${i + 1}`).join('\n');
      vi.mocked(existsSync).mockReturnValue(true);
      retroState.entries = [{ content: manyBullets, sprint_num: 1, sprint_id: 'sprint-001' }];

      const tool = await getRetroTool();
      const result = await tool.handler({});
      const wrapped = parseToolResult(result);
      const parsed = wrapped.data ?? wrapped;

      expect(parsed.highlights.length).toBeLessThanOrEqual(5);
    });
  });

  describe('missing file', () => {
    it('returns null content when RETRO.md does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const tool = await getRetroTool();
      const result = await tool.handler({});
      const wrapped = parseToolResult(result);
      const parsed = wrapped.data ?? wrapped;

      expect(parsed.content).toBeNull();
    });

    it('still calls enrichResponse when file missing', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const tool = await getRetroTool();
      await tool.handler({});

      expect(enrichResponse).toHaveBeenCalledWith('retro', expect.objectContaining({ content: null }));
    });
  });

  describe('empty entry', () => {
    it('returns empty content and empty highlights for an empty retro entry', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      retroState.entries = [{ content: '', sprint_num: 1, sprint_id: 'sprint-001' }];

      const tool = await getRetroTool();
      const result = await tool.handler({});
      const wrapped = parseToolResult(result);
      const parsed = wrapped.data ?? wrapped;

      expect(parsed.content).toBeFalsy();
      // An empty retro entry yields no highlights (field absent or empty).
      expect(parsed.highlights ?? []).toEqual([]);
    });
  });

  describe('enriched response', () => {
    it('includes _enriched metadata in response', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('- Good sprint');

      const tool = await getRetroTool();
      const result = await tool.handler({});
      const wrapped = parseToolResult(result);
      const parsed = wrapped.data ?? wrapped;

      expect(parsed._enriched).toBeDefined();
      expect(parsed._enriched.summary).toBeDefined();
      expect(parsed._enriched.hints).toBeInstanceOf(Array);
      expect(parsed._enriched.timestamp).toBeDefined();
    });
  });
});

// ─── sync tool ──────────────────────────────────────────────────────────────

describe('registerSyncTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function getSyncTool() {
    const { registerSyncTool } = await import('../../../src/mcp/tools/sync.js');
    const server = createMockServer();
    registerSyncTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
    const tool = server.tools.get('deckent_sync');
    expect(tool).toBeDefined();
    return tool!;
  }

  describe('tool registration', () => {
    it('registers tool with name deckent_sync', async () => {
      const { registerSyncTool } = await import('../../../src/mcp/tools/sync.js');
      const server = createMockServer();
      registerSyncTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      expect(server.tools.has('deckent_sync')).toBe(true);
    });

    it('registers tool with title and description', async () => {
      const { registerSyncTool } = await import('../../../src/mcp/tools/sync.js');
      const server = createMockServer();
      registerSyncTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      const tool = server.tools.get('deckent_sync');
      expect((tool?.config as Record<string, unknown>)?.title).toBe('Sync Deckent');
    });
  });

  describe('ensureDeckentImport delegation', () => {
    it('calls ensureDeckentImport for CLAUDE.md when DECKENT.md exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const tool = await getSyncTool();
      await tool.handler({});

      expect(ensureDeckentImport).toHaveBeenCalledWith(expect.stringContaining('CLAUDE.md'));
    });

    it('calls ensureDeckentImport for AGENTS.md when DECKENT.md exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const tool = await getSyncTool();
      await tool.handler({});

      expect(ensureDeckentImport).toHaveBeenCalledWith(expect.stringContaining('AGENTS.md'));
    });

    it('calls ensureDeckentImport twice (CLAUDE.md and AGENTS.md)', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const tool = await getSyncTool();
      await tool.handler({});

      expect(ensureDeckentImport).toHaveBeenCalledTimes(2);
    });
  });

  describe('success response', () => {
    it('returns success: true when sync completes', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const tool = await getSyncTool();
      const result = await tool.handler({});
      const parsed = parseToolResult(result);

      expect(parsed.success).toBe(true);
    });

    it('returns synced file list in response', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const tool = await getSyncTool();
      const result = await tool.handler({});
      const parsed = parseToolResult(result);

      expect(parsed.synced).toBeInstanceOf(Array);
      expect(parsed.synced.length).toBe(2);
    });

    it('returns changeCount in response', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const tool = await getSyncTool();
      const result = await tool.handler({});
      const parsed = parseToolResult(result);

      expect(parsed.changeCount).toBe(2);
    });
  });

  describe('error when DECKENT.md missing', () => {
    it('returns error response when DECKENT.md not found', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const tool = await getSyncTool();
      const result = await tool.handler({});
      const parsed = parseToolResult(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toContain('DECKENT.md not found');
    });

    it('sets isError flag when DECKENT.md not found', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const tool = await getSyncTool();
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
    });

    it('does not call ensureDeckentImport when DECKENT.md missing', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const tool = await getSyncTool();
      await tool.handler({});

      expect(ensureDeckentImport).not.toHaveBeenCalled();
    });
  });

  describe('enriched response', () => {
    it('includes _enriched metadata in sync response', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const tool = await getSyncTool();
      const result = await tool.handler({});
      const parsed = parseToolResult(result);

      expect(parsed._enriched).toBeDefined();
      expect(parsed._enriched.summary).toBeDefined();
    });
  });
});

// ─── analyze tool ───────────────────────────────────────────────────────────

describe('registerAnalyzeTool', () => {
  const mockAnalysis = {
    language: 'typescript',
    framework: 'express',
    testFramework: 'vitest',
    buildTool: 'tsc',
    ci: 'github-actions',
    size: 'medium',
    methodology: 'agile',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(analyzeProject).mockReturnValue(mockAnalysis as unknown as ReturnType<typeof analyzeProject>);
  });

  async function getAnalyzeTool() {
    const { registerAnalyzeTool } = await import('../../../src/mcp/tools/analyze.js');
    const server = createMockServer();
    registerAnalyzeTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
    const tool = server.tools.get('deckent_analyze_project');
    expect(tool).toBeDefined();
    return tool!;
  }

  describe('tool registration', () => {
    it('registers tool with name deckent_analyze_project', async () => {
      const { registerAnalyzeTool } = await import('../../../src/mcp/tools/analyze.js');
      const server = createMockServer();
      registerAnalyzeTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      expect(server.tools.has('deckent_analyze_project')).toBe(true);
    });

    it('registers tool with title Analyze Project', async () => {
      const { registerAnalyzeTool } = await import('../../../src/mcp/tools/analyze.js');
      const server = createMockServer();
      registerAnalyzeTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      const tool = server.tools.get('deckent_analyze_project');
      expect((tool?.config as Record<string, unknown>)?.title).toBe('Analyze Project');
    });
  });

  describe('analyzeProject delegation', () => {
    it('calls analyzeProject with cwd', async () => {
      const tool = await getAnalyzeTool();
      await tool.handler({});

      expect(analyzeProject).toHaveBeenCalledWith(process.cwd());
    });

    it('includes language from analysis result', async () => {
      const tool = await getAnalyzeTool();
      const result = await tool.handler({});
      const parsed = parseToolResult(result);

      expect(parsed.language).toBe('typescript');
    });

    it('includes framework from analysis result', async () => {
      const tool = await getAnalyzeTool();
      const result = await tool.handler({});
      const parsed = parseToolResult(result);

      expect(parsed.framework).toBe('express');
    });
  });

  describe('response format', () => {
    it('includes configSuggestion array in response', async () => {
      const tool = await getAnalyzeTool();
      const result = await tool.handler({});
      const parsed = parseToolResult(result);

      expect(parsed.configSuggestion).toBeInstanceOf(Array);
    });

    it('suggests test framework setup when testFramework is unknown', async () => {
      vi.mocked(analyzeProject).mockReturnValue({
        ...mockAnalysis,
        testFramework: 'unknown',
      } as unknown as ReturnType<typeof analyzeProject>);

      const tool = await getAnalyzeTool();
      const result = await tool.handler({});
      const parsed = parseToolResult(result);

      expect(parsed.configSuggestion.some((s: string) => s.includes('test framework'))).toBe(true);
    });

    it('suggests pro_plan mode for small projects', async () => {
      vi.mocked(analyzeProject).mockReturnValue({
        ...mockAnalysis,
        size: 'small',
      } as unknown as ReturnType<typeof analyzeProject>);

      const tool = await getAnalyzeTool();
      const result = await tool.handler({});
      const parsed = parseToolResult(result);

      expect(parsed.configSuggestion.some((s: string) => s.includes('pro_plan'))).toBe(true);
    });

    it('suggests max_plan mode for large projects', async () => {
      vi.mocked(analyzeProject).mockReturnValue({
        ...mockAnalysis,
        size: 'large',
      } as unknown as ReturnType<typeof analyzeProject>);

      const tool = await getAnalyzeTool();
      const result = await tool.handler({});
      const parsed = parseToolResult(result);

      expect(parsed.configSuggestion.some((s: string) => s.includes('max_plan'))).toBe(true);
    });
  });

  describe('enriched response', () => {
    it('includes _enriched metadata', async () => {
      const tool = await getAnalyzeTool();
      const result = await tool.handler({});
      const parsed = parseToolResult(result);

      expect(parsed._enriched).toBeDefined();
      expect(parsed._enriched.summary).toBeDefined();
      expect(parsed._enriched.timestamp).toBeDefined();
    });

    it('calls enrichResponse with "analyze" toolName', async () => {
      const tool = await getAnalyzeTool();
      await tool.handler({});

      expect(enrichResponse).toHaveBeenCalledWith('analyze', expect.any(Object));
    });
  });
});

// ─── directives (set_directives) tool ───────────────────────────────────────

describe('registerSetDirectivesTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function getDirectivesTool() {
    const { registerSetDirectivesTool } = await import('../../../src/mcp/tools/directives.js');
    const server = createMockServer();
    registerSetDirectivesTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
    const tool = server.tools.get('deckent_set_directives');
    expect(tool).toBeDefined();
    return tool!;
  }

  describe('tool registration', () => {
    it('registers tool with name deckent_set_directives', async () => {
      const { registerSetDirectivesTool } = await import('../../../src/mcp/tools/directives.js');
      const server = createMockServer();
      registerSetDirectivesTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      expect(server.tools.has('deckent_set_directives')).toBe(true);
    });

    it('registers tool with title Set Directives', async () => {
      const { registerSetDirectivesTool } = await import('../../../src/mcp/tools/directives.js');
      const server = createMockServer();
      registerSetDirectivesTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      const tool = server.tools.get('deckent_set_directives');
      expect((tool?.config as Record<string, unknown>)?.title).toBe('Set Directives');
    });
  });

  describe('content write', () => {
    it('writes content to DIRECTIVES.md', async () => {
      const tool = await getDirectivesTool();
      const content = '## Görev 1: Test task\nDo something';

      await tool.handler({ content });

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('DIRECTIVES.md'),
        content,
        'utf-8',
      );
    });

    it('returns success: true after writing', async () => {
      const tool = await getDirectivesTool();
      const result = await tool.handler({ content: '## Task 1: Something' });
      const parsed = parseToolResult(result);

      expect(parsed.success).toBe(true);
    });

    it('counts task blocks correctly for Görev format', async () => {
      const tool = await getDirectivesTool();
      const content = '## Görev 1: First\n## Görev 2: Second\n## Görev 3: Third';
      const result = await tool.handler({ content });
      const parsed = parseToolResult(result);

      expect(parsed.taskCount).toBe(3);
    });

    it('counts task blocks correctly for Task format', async () => {
      const tool = await getDirectivesTool();
      const content = '## Task 1: First\n## Task 2: Second';
      const result = await tool.handler({ content });
      const parsed = parseToolResult(result);

      expect(parsed.taskCount).toBe(2);
    });
  });

  describe('existing overwrite', () => {
    it('overwrites existing DIRECTIVES.md without error', async () => {
      const tool = await getDirectivesTool();
      const newContent = '## Görev 1: New task';

      // First write
      await tool.handler({ content: '## Görev 1: Old task' });
      // Second write (overwrite)
      const result = await tool.handler({ content: newContent });
      const parsed = parseToolResult(result);

      expect(parsed.success).toBe(true);
      expect(writeFileSync).toHaveBeenLastCalledWith(
        expect.stringContaining('DIRECTIVES.md'),
        newContent,
        'utf-8',
      );
    });
  });

  describe('empty content', () => {
    it('handles empty content string', async () => {
      const tool = await getDirectivesTool();
      const result = await tool.handler({ content: '' });
      const parsed = parseToolResult(result);

      expect(parsed.success).toBe(true);
      expect(parsed.taskCount).toBe(0);
    });

    it('writes empty string to file', async () => {
      const tool = await getDirectivesTool();
      await tool.handler({ content: '' });

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('DIRECTIVES.md'),
        '',
        'utf-8',
      );
    });
  });

  describe('breakdown and model estimation', () => {
    it('includes breakdown in response', async () => {
      const tool = await getDirectivesTool();
      const content = '## Görev 1: Write code\n## Görev 2: Write tests\n## Görev 3: Write docs';
      const result = await tool.handler({ content });
      const parsed = parseToolResult(result);

      expect(parsed.breakdown).toBeDefined();
      expect(typeof parsed.breakdown.code).toBe('number');
      expect(typeof parsed.breakdown.docs).toBe('number');
      expect(typeof parsed.breakdown.test).toBe('number');
    });

    it('includes estimatedModels in response', async () => {
      const tool = await getDirectivesTool();
      const content = '## Görev 1: Implement feature';
      const result = await tool.handler({ content });
      const parsed = parseToolResult(result);

      // Keys come from the registry's designated model per claude tier, so this
      // asserts the CONTRACT rather than pinning three literals that go stale on
      // every catalog generation (MASTER-PLAN 670 moved claude/premium from
      // Opus 4.8 to Opus 5 and broke exactly such a literal).
      expect(parsed.estimatedModels).toBeDefined();
      for (const tier of ['premium', 'standard', 'economy'] as const) {
        const designated = modelRegistry.getByProviderAndTier('claude', tier);
        expect(designated).toBeDefined();
        expect(typeof parsed.estimatedModels[designated!.id]).toBe('number');
      }
    });
  });

  describe('enriched response', () => {
    it('includes _enriched metadata in response', async () => {
      const tool = await getDirectivesTool();
      const result = await tool.handler({ content: '## Görev 1: Something' });
      const parsed = parseToolResult(result);

      expect(parsed._enriched).toBeDefined();
      expect(parsed._enriched.summary).toBeDefined();
      expect(parsed._enriched.hints).toBeInstanceOf(Array);
    });

    it('calls enrichResponse with "set_directives" toolName', async () => {
      const tool = await getDirectivesTool();
      await tool.handler({ content: '## Task 1: Do it' });

      expect(enrichResponse).toHaveBeenCalledWith('set_directives', expect.any(Object));
    });
  });
});
