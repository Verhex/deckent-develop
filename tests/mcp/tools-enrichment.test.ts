import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../src/core/utils.js', () => ({
  countBrainLines: vi.fn().mockReturnValue(100),
  ensureDeckentImport: vi.fn(),
}));

vi.mock('../../src/core/analyzer.js', () => ({
  analyzeProject: vi.fn(),
}));

vi.mock('../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({
    cpuCores: 8,
    totalMemMB: 16384,
    freeMemMB: 8192,
    recommendedMaxWorkers: 6,
  }),
}));

vi.mock('../../src/core/subscription.js', () => ({
  detectSubscription: vi.fn().mockReturnValue({
    detected: 'max',
    method: 'config',
  }),
}));

import { analyzeProject } from '../../src/core/analyzer.js';

// ─── Mock Server ────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>, ctx?: unknown) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

function createMockServer() {
  const tools = new Map<string, { config: unknown; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name: string, config: unknown, handler: ToolHandler) {
      tools.set(name, { config, handler });
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('MCP Tools Enrichment (Task 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deckent_doctor enrichment', () => {
    it('includes recommendations array and healthScore', async () => {
      const { registerDoctorTool } = await import('../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(spawnSync).mockReturnValue({
        status: 0, stdout: 'v20.0.0', stderr: '', pid: 1, output: [], signal: null,
      });
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# Learned Patterns\n');
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed).toHaveProperty('recommendations');
      expect(Array.isArray(parsed.recommendations)).toBe(true);
      expect(parsed).toHaveProperty('healthScore');
      expect(typeof parsed.healthScore).toBe('number');
      expect(parsed).toHaveProperty('_enriched');
      expect(parsed._enriched.summary).toBeTruthy();
    });

    it('preserves original checks field', async () => {
      const { registerDoctorTool } = await import('../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(spawnSync).mockReturnValue({
        status: 0, stdout: 'v20.0.0', stderr: '', pid: 1, output: [], signal: null,
      });
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# Learned Patterns\n');
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed).toHaveProperty('ok');
      expect(parsed).toHaveProperty('checks');
    });
  });

  describe('deckent_init enrichment', () => {
    it('includes nextSteps array', async () => {
      const { registerInitTool } = await import('../../src/mcp/tools/init.js');
      const mock = createMockServer();
      registerInitTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const result = await mock.tools.get('deckent_init')!.handler({ projectName: 'test', mode: 'max_plan', language: 'en' });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed).toHaveProperty('nextSteps');
      expect(Array.isArray(parsed.nextSteps)).toBe(true);
      expect(parsed.nextSteps.length).toBeGreaterThan(0);
      expect(parsed).toHaveProperty('_enriched');
    });

    it('preserves original fields (success, projectName)', async () => {
      const { registerInitTool } = await import('../../src/mcp/tools/init.js');
      const mock = createMockServer();
      registerInitTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const result = await mock.tools.get('deckent_init')!.handler({ projectName: 'myapp', mode: 'pro_plan', language: 'tr' });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.success).toBe(true);
      expect(parsed.projectName).toBe('myapp');
      expect(parsed.mode).toBe('pro_plan');
    });
  });

  describe('deckent_retro enrichment', () => {
    it('includes highlights from retro content', async () => {
      const { registerRetroTool } = await import('../../src/mcp/tools/retro.js');
      const mock = createMockServer();
      registerRetroTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# Retrospective\n- Learned X\n- Improved Y\n');

      const result = await mock.tools.get('deckent_retro')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed).toHaveProperty('highlights');
      expect(Array.isArray(parsed.highlights)).toBe(true);
      expect(parsed.highlights).toContain('Learned X');
      expect(parsed.highlights).toContain('Improved Y');
      expect(parsed).toHaveProperty('_enriched');
    });

    it('preserves content field', async () => {
      const { registerRetroTool } = await import('../../src/mcp/tools/retro.js');
      const mock = createMockServer();
      registerRetroTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# Retro\n- Item');

      const result = await mock.tools.get('deckent_retro')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.content).toContain('# Retro');
    });

    it('returns empty highlights when no retro file', async () => {
      const { registerRetroTool } = await import('../../src/mcp/tools/retro.js');
      const mock = createMockServer();
      registerRetroTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const result = await mock.tools.get('deckent_retro')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.content).toBeNull();
      expect(parsed).toHaveProperty('_enriched');
    });
  });

  describe('deckent_history enrichment', () => {
    it('includes trend field', async () => {
      const { registerHistoryTool } = await import('../../src/mcp/tools/history.js');
      const mock = createMockServer();
      registerHistoryTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(
        ['sprint-005.md', 'sprint-006.md'] as unknown as ReturnType<typeof readdirSync>,
      );
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('sprint-005')) return '# Sprint 005\n5/10 tasks done';
        return '# Sprint 006\n8/10 tasks done';
      });

      const result = await mock.tools.get('deckent_history')!.handler({ last: 5 });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed).toHaveProperty('trend');
      expect(parsed.trend).toBe('improving');
      expect(parsed).toHaveProperty('_enriched');
    });

    it('returns insufficient_data trend when no sprints', async () => {
      const { registerHistoryTool } = await import('../../src/mcp/tools/history.js');
      const mock = createMockServer();
      registerHistoryTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const result = await mock.tools.get('deckent_history')!.handler({ last: 5 });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.trend).toBe('insufficient_data');
      expect(parsed.sprints).toHaveLength(0);
    });

    it('preserves sprints array', async () => {
      const { registerHistoryTool } = await import('../../src/mcp/tools/history.js');
      const mock = createMockServer();
      registerHistoryTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(
        ['sprint-007.md'] as unknown as ReturnType<typeof readdirSync>,
      );
      vi.mocked(readFileSync).mockReturnValue('# Sprint 007\nContent');

      const result = await mock.tools.get('deckent_history')!.handler({ last: 2 });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.sprints).toHaveLength(1);
      expect(parsed.sprints[0].id).toBe('sprint-007');
    });
  });

  describe('deckent_sync enrichment', () => {
    it('includes changeCount', async () => {
      const { registerSyncTool } = await import('../../src/mcp/tools/sync.js');
      const mock = createMockServer();
      registerSyncTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);

      const result = await mock.tools.get('deckent_sync')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed).toHaveProperty('changeCount');
      expect(parsed.changeCount).toBe(2);
      expect(parsed).toHaveProperty('_enriched');
    });

    it('preserves success and synced fields', async () => {
      const { registerSyncTool } = await import('../../src/mcp/tools/sync.js');
      const mock = createMockServer();
      registerSyncTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);

      const result = await mock.tools.get('deckent_sync')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.success).toBe(true);
      expect(parsed.synced).toContain('CLAUDE.md');
    });
  });

  describe('deckent_analyze_project enrichment', () => {
    it('includes configSuggestion', async () => {
      const { registerAnalyzeTool } = await import('../../src/mcp/tools/analyze.js');
      const mock = createMockServer();
      registerAnalyzeTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(analyzeProject).mockReturnValue({
        framework: 'next',
        language: 'typescript',
        testFramework: 'vitest',
        buildTool: 'tsc',
        ci: 'github-actions',
        fileCount: 120,
        authorCount: 3,
        size: 'small',
        methodology: 'sprint',
      });

      const result = await mock.tools.get('deckent_analyze_project')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed).toHaveProperty('configSuggestion');
      expect(Array.isArray(parsed.configSuggestion)).toBe(true);
      expect(parsed.configSuggestion.some((s: string) => s.includes('pro_plan'))).toBe(true);
      expect(parsed).toHaveProperty('_enriched');
    });

    it('preserves original analysis fields', async () => {
      const { registerAnalyzeTool } = await import('../../src/mcp/tools/analyze.js');
      const mock = createMockServer();
      registerAnalyzeTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(analyzeProject).mockReturnValue({
        framework: 'react',
        language: 'typescript',
        testFramework: 'unknown',
        buildTool: 'webpack',
        ci: 'none',
        fileCount: 50,
        authorCount: 1,
        size: 'medium',
        methodology: 'kanban',
      });

      const result = await mock.tools.get('deckent_analyze_project')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.framework).toBe('react');
      expect(parsed.language).toBe('typescript');
      expect(parsed.size).toBe('medium');
      expect(parsed.configSuggestion.some((s: string) => s.includes('test framework'))).toBe(true);
    });
  });

  describe('enrichment _enriched meta', () => {
    it('_enriched has correct structure across all tools', async () => {
      const { registerDoctorTool } = await import('../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(spawnSync).mockReturnValue({
        status: 0, stdout: 'v20.0.0', stderr: '', pid: 1, output: [], signal: null,
      });
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# Learned Patterns\n');
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed._enriched).toHaveProperty('summary');
      expect(parsed._enriched).toHaveProperty('hints');
      expect(parsed._enriched).toHaveProperty('timestamp');
      expect(typeof parsed._enriched.summary).toBe('string');
      expect(Array.isArray(parsed._enriched.hints)).toBe(true);
      // timestamp should be ISO format
      expect(new Date(parsed._enriched.timestamp).toISOString()).toBe(parsed._enriched.timestamp);
    });
  });
});
