/**
 * Task 061-006: Open Debt Cleanup (debt-059-008-fix)
 * Tests for: standardized error format { error: true, message: "..." } across all MCP tools
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(),
  validatePartialConfig: vi.fn(),
}));

vi.mock('../../src/core/utils.js', () => ({
  countBrainLines: vi.fn().mockReturnValue(100),
  ensureDeckentImport: vi.fn(),
  getNextSprintId: vi.fn().mockReturnValue('sprint-061'),
}));

vi.mock('../../src/core/analyzer.js', () => ({
  analyzeProject: vi.fn(),
}));

vi.mock('../../src/core/config-migration.js', () => ({
  setNestedValue: vi.fn(),
  getNestedValue: vi.fn().mockReturnValue('testValue'),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  runDecay: vi.fn().mockReturnValue({ decayed: 5 }),
  readContext: vi.fn(),
  planSprint: vi.fn(),
}));

vi.mock('../../src/mcp/tools/job-runner.js', () => ({
  writeJobState: vi.fn(),
  readJobState: vi.fn(),
  readLatestJobState: vi.fn().mockReturnValue(null),
}));

// B8: deckent_retro reads memory.db `retro` entries (no .brain/RETRO.md file).
const retroState = vi.hoisted(() => ({ throwError: null as string | null }));
vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn(() => {
    if (retroState.throwError) throw new Error(retroState.throwError);
    return { getByType: () => [], getById: () => null, close: () => {} };
  }),
}));

import { analyzeProject } from '../../src/core/analyzer.js';
import { loadConfig } from '../../src/core/config.js';
import { ensureDeckentImport } from '../../src/core/utils.js';

// ─── Mock Server ─────────────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function createMockServer() {
  const tools = new Map<string, { config: unknown; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name: string, config: unknown, handler: ToolHandler) {
      tools.set(name, { config, handler });
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MCP Tool Error Format — debt-059-008-fix (sprint-061)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('Error format: { error: true, message: "..." }', () => {
    it('deckent_analyze_project uses error:true format on failure', async () => {
      const { registerAnalyzeTool } = await import('../../src/mcp/tools/analyze.js');
      const mock = createMockServer();
      registerAnalyzeTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(analyzeProject).mockImplementation(() => { throw new Error('analysis failed'); });

      const result = await mock.tools.get('deckent_analyze_project')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.error).toBe(true);
      expect(typeof parsed.message).toBe('string');
      expect(parsed.message).toContain('analysis failed');
    });

    it('deckent_history uses error:true format on failure', async () => {
      const { registerHistoryTool } = await import('../../src/mcp/tools/history.js');
      const mock = createMockServer();
      registerHistoryTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockImplementation(() => { throw new Error('io error'); });

      const result = await mock.tools.get('deckent_history')!.handler({ last: 5 });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toContain('io error');
    });

    it('deckent_retro uses error:true format on failure', async () => {
      const { registerRetroTool } = await import('../../src/mcp/tools/retro.js');
      const mock = createMockServer();
      registerRetroTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      retroState.throwError = 'read failure';

      const result = await mock.tools.get('deckent_retro')!.handler({});
      retroState.throwError = null;
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toContain('read failure');
    });

    it('deckent_set_directives uses error:true format on failure', async () => {
      const { registerSetDirectivesTool } = await import('../../src/mcp/tools/directives.js');
      const mock = createMockServer();
      registerSetDirectivesTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(writeFileSync).mockImplementation(() => { throw new Error('disk full'); });

      const result = await mock.tools.get('deckent_set_directives')!.handler({ content: '## Task 1\n' });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toContain('disk full');
    });

    it('deckent_config catch uses error:true format', async () => {
      const { registerConfigTool } = await import('../../src/mcp/tools/config.js');
      const mock = createMockServer();
      registerConfigTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(loadConfig).mockRejectedValue(new Error('config load failed'));

      const result = await mock.tools.get('deckent_config')!.handler({ action: 'read' });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toContain('config load failed');
    });

    it('deckent_config validation errors use error:true format', async () => {
      const { registerConfigTool } = await import('../../src/mcp/tools/config.js');
      const mock = createMockServer();
      registerConfigTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      // get without key
      const result = await mock.tools.get('deckent_config')!.handler({ action: 'get' });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.error).toBe(true);
      expect(typeof parsed.message).toBe('string');
      expect(parsed.message).toContain('key is required');
    });

    it('deckent_kill validation error uses error:true format', async () => {
      const { registerKillTool } = await import('../../src/mcp/tools/kill.js');
      const mock = createMockServer();
      registerKillTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const result = await mock.tools.get('deckent_kill')!.handler({ all: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toContain('taskId');
    });

    it('deckent_sync validation error uses error:true format and keeps success:false', async () => {
      const { registerSyncTool } = await import('../../src/mcp/tools/sync.js');
      const mock = createMockServer();
      registerSyncTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const result = await mock.tools.get('deckent_sync')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.error).toBe(true);
      expect(parsed.success).toBe(false);
      expect(parsed.message).toContain('DECKENT.md not found');
    });

    it('deckent_sync catch error uses error:true format', async () => {
      const { registerSyncTool } = await import('../../src/mcp/tools/sync.js');
      const mock = createMockServer();
      registerSyncTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(ensureDeckentImport).mockImplementation(() => { throw new Error('permission error'); });

      const result = await mock.tools.get('deckent_sync')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toContain('permission error');
    });

    it('deckent_review catch error uses error:true format', async () => {
      const { registerReviewTool } = await import('../../src/mcp/tools/review.js');
      const mock = createMockServer();
      registerReviewTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(loadConfig).mockRejectedValue(new Error('review failed'));

      const result = await mock.tools.get('deckent_review')!.handler({ auto: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toContain('review failed');
    });

    it('deckent_run catch error uses error:true format', async () => {
      const { registerRunTool } = await import('../../src/mcp/tools/run.js');
      const mock = createMockServer();
      registerRunTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(mkdirSync).mockImplementation(() => { throw new Error('mkdir failed'); });

      const result = await mock.tools.get('deckent_run')!.handler({
        description: 'some task',
        model: 'sonnet',
      });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toContain('mkdir failed');
    });

    it('deckent_cleanup catch error uses error:true format', async () => {
      const { registerCleanupTool } = await import('../../src/mcp/tools/cleanup.js');
      const mock = createMockServer();
      registerCleanupTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockImplementation(() => { throw new Error('fs error'); });

      const result = await mock.tools.get('deckent_cleanup')!.handler({ decay: false, dryRun: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toContain('fs error');
    });
  });

  describe('Successful responses still include _enriched meta', () => {
    it('deckent_config read returns enriched response without error field', async () => {
      const { registerConfigTool } = await import('../../src/mcp/tools/config.js');
      const mock = createMockServer();
      registerConfigTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(loadConfig).mockResolvedValue({ mode: 'max_plan', language: 'en' } as unknown as Awaited<ReturnType<typeof loadConfig>>);

      const result = await mock.tools.get('deckent_config')!.handler({ action: 'read' });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBeUndefined();
      expect(parsed._enriched).toBeDefined();
      expect(parsed._enriched.summary).toBeTruthy();
      expect(parsed._enriched.hints).toBeDefined();
      expect(parsed._enriched.timestamp).toBeTruthy();
      // No error field on success
      expect(parsed.error).toBeUndefined();
    });

    it('deckent_kill success returns enriched response', async () => {
      const { registerKillTool } = await import('../../src/mcp/tools/kill.js');
      const mock = createMockServer();
      registerKillTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_kill')!.handler({ all: true });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBeUndefined();
      expect(parsed._enriched).toBeDefined();
      expect(parsed._enriched.summary).toBeTruthy();
    });
  });

  describe('New 6 tools have Zod input schemas', () => {
    it('deckent_config has Zod schema with action enum', async () => {
      const { registerConfigTool } = await import('../../src/mcp/tools/config.js');
      const mock = createMockServer();
      registerConfigTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const toolConfig = mock.tools.get('deckent_config')!.config as { inputSchema?: unknown };
      expect(toolConfig).toBeDefined();
      expect(toolConfig.inputSchema).toBeDefined();
    });

    it('deckent_review has Zod schema with auto boolean', async () => {
      const { registerReviewTool } = await import('../../src/mcp/tools/review.js');
      const mock = createMockServer();
      registerReviewTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const toolConfig = mock.tools.get('deckent_review')!.config as { inputSchema?: unknown };
      expect(toolConfig).toBeDefined();
      expect(toolConfig.inputSchema).toBeDefined();
    });

    it('deckent_run has Zod schema with model enum', async () => {
      const { registerRunTool } = await import('../../src/mcp/tools/run.js');
      const mock = createMockServer();
      registerRunTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const toolConfig = mock.tools.get('deckent_run')!.config as { inputSchema?: unknown };
      expect(toolConfig).toBeDefined();
      expect(toolConfig.inputSchema).toBeDefined();
    });

    it('deckent_kill has Zod schema with taskId and all', async () => {
      const { registerKillTool } = await import('../../src/mcp/tools/kill.js');
      const mock = createMockServer();
      registerKillTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const toolConfig = mock.tools.get('deckent_kill')!.config as { inputSchema?: unknown };
      expect(toolConfig).toBeDefined();
      expect(toolConfig.inputSchema).toBeDefined();
    });

    it('deckent_cleanup has Zod schema with decay and dryRun', async () => {
      const { registerCleanupTool } = await import('../../src/mcp/tools/cleanup.js');
      const mock = createMockServer();
      registerCleanupTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const toolConfig = mock.tools.get('deckent_cleanup')!.config as { inputSchema?: unknown };
      expect(toolConfig).toBeDefined();
      expect(toolConfig.inputSchema).toBeDefined();
    });
  });
});
