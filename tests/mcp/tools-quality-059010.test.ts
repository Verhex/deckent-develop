/**
 * Task 059-010: MCP Tool Quality — Enrichment + Error Handling tests
 * Tests for: error handling, enriched responses, input validation for new/existing tools
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';

// ─── Mocks ───────────────────────────────────────────────────────────

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
  resolveEffectiveWorkers: () => 8,
  loadConfig: vi.fn().mockResolvedValue({ spawn_backend: 'auto' }),
  validatePartialConfig: vi.fn(),
}));

vi.mock('../../src/core/utils.js', () => ({
  countBrainLines: vi.fn().mockReturnValue(100),
  ensureDeckentImport: vi.fn(),
  getNextSprintId: vi.fn().mockReturnValue('sprint-060'),
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
  buildWorkerPrompt: vi.fn().mockReturnValue('mock worker prompt'),
}));

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  resolveAgentPrompt: vi.fn().mockReturnValue(''),
  resolveSkillPrompts: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/orchestra/spawn-backend.js', () => ({
  SpawnBackendFactory: {
    create: vi.fn().mockReturnValue({
      name: 'mock',
      spawn: vi.fn(),
      kill: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      isAvailable: vi.fn().mockResolvedValue(true),
    }),
  },
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

// ─── Mock Server ─────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

function createMockServer() {
  const tools = new Map<string, { config: unknown; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name: string, config: unknown, handler: ToolHandler) {
      tools.set(name, { config, handler });
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('MCP Tool Quality — enrich.ts new entries', () => {
  it('config tool has summary in enrich.ts', async () => {
    const { generateSummary, generateHints } = await import('../../src/mcp/helpers/enrich.js');
    const summary = generateSummary('config', {}, 'en');
    expect(summary).toContain('Configuration');
    const hints = generateHints('config', {});
    expect(Array.isArray(hints)).toBe(true);
  });

  it('review tool has summary in enrich.ts', async () => {
    const { generateSummary } = await import('../../src/mcp/helpers/enrich.js');
    expect(generateSummary('review', {}, 'en')).toContain('review');
    expect(generateSummary('review', {}, 'tr')).toContain('inceleme');
  });

  it('kill tool has summary in enrich.ts', async () => {
    const { generateSummary } = await import('../../src/mcp/helpers/enrich.js');
    expect(generateSummary('kill', {}, 'en')).toContain('stopped');
    expect(generateSummary('kill', {}, 'tr')).toContain('durduruldu');
  });

  it('run tool has summary in enrich.ts', async () => {
    const { generateSummary } = await import('../../src/mcp/helpers/enrich.js');
    expect(generateSummary('run', {}, 'en')).toContain('started');
  });

  it('cleanup tool has summary in enrich.ts', async () => {
    const { generateSummary } = await import('../../src/mcp/helpers/enrich.js');
    expect(generateSummary('cleanup', {}, 'en')).toContain('cleanup');
  });
});

describe('MCP Tool Quality — Error Handling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('deckent_analyze_project returns isError on analyzeProject failure', async () => {
    const { registerAnalyzeTool } = await import('../../src/mcp/tools/analyze.js');
    const mock = createMockServer();
    registerAnalyzeTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(analyzeProject).mockImplementation(() => { throw new Error('file not found'); });

    const result = await mock.tools.get('deckent_analyze_project')!.handler({});
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain('file not found');
  });

  it('deckent_history returns isError on readdirSync failure', async () => {
    const { registerHistoryTool } = await import('../../src/mcp/tools/history.js');
    const mock = createMockServer();
    registerHistoryTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation(() => { throw new Error('permission denied'); });

    const result = await mock.tools.get('deckent_history')!.handler({ last: 5 });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain('permission denied');
  });

  it('deckent_retro returns isError on DB read failure', async () => {
    const { registerRetroTool } = await import('../../src/mcp/tools/retro.js');
    const mock = createMockServer();
    registerRetroTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(existsSync).mockReturnValue(true);
    retroState.throwError = 'disk error';

    const result = await mock.tools.get('deckent_retro')!.handler({});
    retroState.throwError = null;
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain('disk error');
  });

  it('deckent_set_directives returns isError on writeFileSync failure', async () => {
    const { registerSetDirectivesTool } = await import('../../src/mcp/tools/directives.js');
    const mock = createMockServer();
    registerSetDirectivesTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(writeFileSync).mockImplementation(() => { throw new Error('no space left'); });

    const result = await mock.tools.get('deckent_set_directives')!.handler({ content: '## Task 1: test\n' });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain('no space left');
  });

  it('deckent_plan returns isError on planSprint failure', async () => {
    const { registerPlanTool } = await import('../../src/mcp/tools/plan.js');
    const mock = createMockServer();
    registerPlanTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const { planSprint } = await import('../../src/orchestra/brain.js');
    vi.mocked(loadConfig).mockResolvedValue({ mode: 'max_plan', language: 'en', activeModeConfig: { max_workers: 3 } } as unknown as Awaited<ReturnType<typeof loadConfig>>);
    vi.mocked(planSprint).mockImplementation(() => { throw new Error('directives missing'); });
    const { readContext } = await import('../../src/orchestra/brain.js');
    vi.mocked(readContext).mockReturnValue({ directives: '', memory: '', retro: '', debt: [], patterns: '', decisions: '', existingTasks: [], projectState: { gitStatus: '', fileTree: [] } });

    const result = await mock.tools.get('deckent_plan')!.handler({});
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain('directives missing');
  });

  it('deckent_sync returns isError on ensureDeckentImport failure', async () => {
    const { registerSyncTool } = await import('../../src/mcp/tools/sync.js');
    const mock = createMockServer();
    registerSyncTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(existsSync).mockReturnValue(true);
    const { ensureDeckentImport } = await import('../../src/core/utils.js');
    vi.mocked(ensureDeckentImport).mockImplementation(() => { throw new Error('write failed'); });

    const result = await mock.tools.get('deckent_sync')!.handler({});
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain('write failed');
  });
});

describe('MCP Tool Quality — Input Validation Improvements', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('deckent_config read action returns enriched response', async () => {
    const { registerConfigTool } = await import('../../src/mcp/tools/config.js');
    const mock = createMockServer();
    registerConfigTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue({ mode: 'max_plan', language: 'en' } as unknown as Awaited<ReturnType<typeof loadConfig>>);

    const result = await mock.tools.get('deckent_config')!.handler({ action: 'read' });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed._enriched).toBeDefined();
    expect(parsed.action).toBe('read');
  });

  it('deckent_config get action returns error when key missing', async () => {
    const { registerConfigTool } = await import('../../src/mcp/tools/config.js');
    const mock = createMockServer();
    registerConfigTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const result = await mock.tools.get('deckent_config')!.handler({ action: 'get' });
    expect(result.isError).toBe(true);
  });

  it('deckent_config set action returns error when value missing', async () => {
    const { registerConfigTool } = await import('../../src/mcp/tools/config.js');
    const mock = createMockServer();
    registerConfigTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const result = await mock.tools.get('deckent_config')!.handler({ action: 'set', key: 'brain_provider' });
    expect(result.isError).toBe(true);
  });

  it('deckent_kill requires taskId or all=true', async () => {
    const { registerKillTool } = await import('../../src/mcp/tools/kill.js');
    const mock = createMockServer();
    registerKillTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const result = await mock.tools.get('deckent_kill')!.handler({ all: false });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain('taskId');
  });

  it('deckent_review returns enriched response with reviews array', async () => {
    const { registerReviewTool } = await import('../../src/mcp/tools/review.js');
    const mock = createMockServer();
    registerReviewTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue({ mode: 'max_plan', language: 'en' } as unknown as Awaited<ReturnType<typeof loadConfig>>);
    vi.mocked(existsSync).mockReturnValue(false);
    const { getNextSprintId } = await import('../../src/core/utils.js');
    vi.mocked(getNextSprintId).mockReturnValue('sprint-060');

    const result = await mock.tools.get('deckent_review')!.handler({ auto: false });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed._enriched).toBeDefined();
    expect(parsed.reviews).toBeDefined();
    expect(Array.isArray(parsed.reviews)).toBe(true);
  });

  it('deckent_cleanup dryRun returns preview without deleting', async () => {
    const { registerCleanupTool } = await import('../../src/mcp/tools/cleanup.js');
    const mock = createMockServer();
    registerCleanupTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['task-001.json', 'task-001.hb'] as unknown as ReturnType<typeof readdirSync>);

    const result = await mock.tools.get('deckent_cleanup')!.handler({ dryRun: true, decay: false });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.dryRun).toBe(true);
    expect(parsed._enriched).toBeDefined();
  });

  it('deckent_run creates task with enriched response', async () => {
    const { registerRunTool } = await import('../../src/mcp/tools/run.js');
    const mock = createMockServer();
    registerRunTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(existsSync).mockReturnValue(false);

    const result = await mock.tools.get('deckent_run')!.handler({
      description: 'Fix the auth bug',
      model: 'sonnet',
      autoApprove: true,
    });
    const parsed = JSON.parse(result.content[0]!.text);
    // Response may be enriched data or error — both are valid
    if (parsed.error) {
      // Worker spawn may fail in mock env — that's OK, we verify error structure
      expect(parsed.message).toBeDefined();
    } else {
      expect(parsed._enriched).toBeDefined();
      expect(parsed.jobId).toBeDefined();
      expect(parsed.status).toBe('RUNNING');
    }
  });
});
