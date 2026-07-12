import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

const mockMcpMemStore = {
  getByType: vi.fn().mockReturnValue([]),
  getById: vi.fn().mockReturnValue(null),
  close: vi.fn(),
  totalCount: vi.fn().mockReturnValue(0),
};
vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => mockMcpMemStore),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(),
}));

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return {
    ...actual,
    ensureDeckentImport: vi.fn(),
  };
});

vi.mock('../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(),
  readContext: vi.fn(),
  planSprint: vi.fn(),
  BrainError: class BrainError extends Error {},
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  isSessionActive: vi.fn(),
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn(),
  startAuditor: vi.fn(),
  attach: vi.fn(),
  destroy: vi.fn(),
  sendKeys: vi.fn(),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(),
  detectDeadlocks: vi.fn(),
}));

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn(),
  releaseAllLocks: vi.fn(),
}));

// ─── Mock Server Pattern ────────────────────────────────────────────

type ResourceHandler = (uri: URL, vars?: unknown) => Promise<{ contents: Array<{ uri: string; text: string; mimeType?: string }> }>;

interface MockServer {
  resources: Map<string, { config: unknown; handler: ResourceHandler }>;
  registerTool: (name: string, config: unknown, handler: unknown) => void;
  registerResource: (name: string, uri: string, config: unknown, handler: ResourceHandler) => void;
}

function createMockServer(): MockServer {
  const resources = new Map<string, { config: unknown; handler: ResourceHandler }>();

  return {
    resources,
    registerTool() { /* no-op for resource tests */ },
    registerResource(name: string, _uri: string, config: unknown, handler: ResourceHandler) {
      resources.set(name, { config, handler });
    },
  };
}

// ─── Resource Tests ──────────────────────────────────────────────────

describe('MCP Resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deckent://dashboard', () => {
    it('returns dashboard state', async () => {
      const { registerDashboardResource } = await import('../../src/mcp/resources/dashboard.js');
      const mock = createMockServer();
      registerDashboardResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const dashState = { sprint: { id: 'sprint-007' }, progress: { done: 2, total: 4 } };
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(dashState));

      const handler = mock.resources.get('dashboard')!.handler;
      const result = await handler(new URL('deckent://dashboard'));

      expect(result.contents).toHaveLength(1);
      const parsed = JSON.parse(result.contents[0]!.text);
      expect(parsed.sprint.id).toBe('sprint-007');
    });

    it('returns inactive when no dashboard file', async () => {
      const { registerDashboardResource } = await import('../../src/mcp/resources/dashboard.js');
      const mock = createMockServer();
      registerDashboardResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const handler = mock.resources.get('dashboard')!.handler;
      const result = await handler(new URL('deckent://dashboard'));

      const parsed = JSON.parse(result.contents[0]!.text);
      expect(parsed.active).toBe(false);
    });
  });

  describe('deckent://directives', () => {
    it('returns directives content', async () => {
      const { registerDirectivesResource } = await import('../../src/mcp/resources/directives.js');
      const mock = createMockServer();
      registerDirectivesResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('## Task 1: Auth\nDetails here');

      const handler = mock.resources.get('directives')!.handler;
      const result = await handler(new URL('deckent://directives'));

      expect(result.contents[0]!.text).toContain('Task 1: Auth');
      expect(result.contents[0]!.mimeType).toBe('text/markdown');
    });

    it('returns empty string when no DIRECTIVES.md', async () => {
      const { registerDirectivesResource } = await import('../../src/mcp/resources/directives.js');
      const mock = createMockServer();
      registerDirectivesResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const handler = mock.resources.get('directives')!.handler;
      const result = await handler(new URL('deckent://directives'));

      expect(result.contents[0]!.text).toBe('');
    });
  });

  describe('deckent://memory', () => {
    it('returns memory content', async () => {
      const { registerMemoryResource } = await import('../../src/mcp/resources/memory.js');
      const mock = createMockServer();
      registerMemoryResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      // MemoryStore returns memory entries
      mockMcpMemStore.getByType.mockImplementation((type: string) => {
        if (type === 'memory') return [{ id: 'm1', type: 'memory', title: 'Learned Patterns', content: '- Pattern A', status: 'active', metadata: '{}', created_at: '', updated_at: '', deleted_at: null }];
        return [];
      });

      const handler = mock.resources.get('memory')!.handler;
      const result = await handler(new URL('deckent://memory'));

      expect(result.contents[0]!.text).toContain('Pattern A');
    });

    it('returns empty string when no MEMORY.md', async () => {
      const { registerMemoryResource } = await import('../../src/mcp/resources/memory.js');
      const mock = createMockServer();
      registerMemoryResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const handler = mock.resources.get('memory')!.handler;
      const result = await handler(new URL('deckent://memory'));

      expect(result.contents[0]!.text).toBe('');
    });
  });

  describe('deckent://debt', () => {
    it('parses debt from MemoryStore', async () => {
      const { registerDebtResource } = await import('../../src/mcp/resources/debt.js');
      const mock = createMockServer();
      registerDebtResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      mockMcpMemStore.getByType.mockImplementation((type: string) => {
        if (type === 'debt') return [
          { id: 'debt-001', type: 'debt', title: 'Missing tests', content: 'x', source: 'brain', status: 'active', priority: 'high', sprint_id: 'sprint-006', sprint_num: 6, metadata: JSON.stringify({ originTaskId: '6-001', originSprintId: 'sprint-006', sprintsOpen: 1 }), tag_text: 'debt', created_at: '2026-03-17', updated_at: '2026-03-17', deleted_at: null },
          { id: 'debt-002', type: 'debt', title: 'Unused import', content: 'x', source: 'brain', status: 'resolved', priority: 'normal', sprint_id: 'sprint-006', sprint_num: 6, metadata: JSON.stringify({ originTaskId: '6-002', originSprintId: 'sprint-006', sprintsOpen: 2, resolvedInSprintId: 'sprint-007' }), tag_text: 'debt', created_at: '2026-03-16', updated_at: '2026-03-16', deleted_at: null },
        ];
        return [];
      });

      const handler = mock.resources.get('debt')!.handler;
      const result = await handler(new URL('deckent://debt'));

      const items = JSON.parse(result.contents[0]!.text);
      expect(items).toHaveLength(2);
      expect(items[0].id).toBe('debt-001');
      expect(items[0].priority).toBe('HIGH');
      expect(items[1].resolved).toBe(true);
    });

    it('returns empty array when no DEBT.md', async () => {
      const { registerDebtResource } = await import('../../src/mcp/resources/debt.js');
      const mock = createMockServer();
      registerDebtResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const handler = mock.resources.get('debt')!.handler;
      const result = await handler(new URL('deckent://debt'));

      const items = JSON.parse(result.contents[0]!.text);
      expect(items).toHaveLength(0);
    });
  });

  describe('deckent://config', () => {
    it('returns config JSON when file exists', async () => {
      const { registerConfigResource } = await import('../../src/mcp/resources/config.js');
      const mock = createMockServer();
      registerConfigResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const configContent = JSON.stringify({ mode: 'max_plan', language: 'tr', projectName: 'test' });
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(configContent);

      const handler = mock.resources.get('config')!.handler;
      const result = await handler(new URL('deckent://config'));

      const parsed = JSON.parse(result.contents[0]!.text);
      expect(parsed.mode).toBe('max_plan');
      expect(parsed.projectName).toBe('test');
      expect(result.contents[0]!.mimeType).toBe('application/json');
    });

    it('returns error when config file is missing', async () => {
      const { registerConfigResource } = await import('../../src/mcp/resources/config.js');
      const mock = createMockServer();
      registerConfigResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const handler = mock.resources.get('config')!.handler;
      const result = await handler(new URL('deckent://config'));

      const parsed = JSON.parse(result.contents[0]!.text);
      expect(parsed.error).toContain('Config not found');
    });

    it('returns error when config is invalid JSON', async () => {
      const { registerConfigResource } = await import('../../src/mcp/resources/config.js');
      const mock = createMockServer();
      registerConfigResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('not valid json{{{');

      const handler = mock.resources.get('config')!.handler;
      const result = await handler(new URL('deckent://config'));

      const parsed = JSON.parse(result.contents[0]!.text);
      expect(parsed.error).toContain('Cannot parse config');
    });
  });
});
