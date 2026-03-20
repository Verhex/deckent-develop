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

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../../src/core/config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/core/utils.js')>();
  return {
    ...actual,
    countBrainLines: vi.fn().mockReturnValue(100),
    ensureDeckentImport: vi.fn(),
  };
});

vi.mock('../../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(),
  readContext: vi.fn(),
  checkUsage: vi.fn(),
  adjustSprintSize: vi.fn(),
  planSprint: vi.fn(),
  BrainError: class BrainError extends Error {},
}));

vi.mock('../../../src/orchestra/tmux.js', () => ({
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

vi.mock('../../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(),
  detectDeadlocks: vi.fn(),
}));

vi.mock('../../../src/agents/worker.js', () => ({
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
    registerTool() { /* no-op */ },
    registerResource(name: string, _uri: string, config: unknown, handler: ResourceHandler) {
      resources.set(name, { config, handler });
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('MCP Resources — Comprehensive Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── config resource ────────────────────────────────────────────────

  describe('deckent://config', () => {
    it('registers config resource with correct name and mimeType', async () => {
      const { registerConfigResource } = await import('../../../src/mcp/resources/config.js');
      const mock = createMockServer();
      registerConfigResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      expect(mock.resources.has('config')).toBe(true);
      const cfg = mock.resources.get('config')!.config as { mimeType?: string };
      expect(cfg.mimeType).toBe('application/json');
    });

    it('returns valid JSON when config file exists', async () => {
      const { registerConfigResource } = await import('../../../src/mcp/resources/config.js');
      const mock = createMockServer();
      registerConfigResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const config = { mode: 'max_plan', language: 'en', projectName: 'my-project', brain_planning: 'ai' };
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(config));

      const handler = mock.resources.get('config')!.handler;
      const result = await handler(new URL('deckent://config'));

      expect(result.contents).toHaveLength(1);
      const parsed = JSON.parse(result.contents[0]!.text);
      expect(parsed.mode).toBe('max_plan');
      expect(parsed.language).toBe('en');
      expect(parsed.projectName).toBe('my-project');
    });

    it('returns error object when config file does not exist', async () => {
      const { registerConfigResource } = await import('../../../src/mcp/resources/config.js');
      const mock = createMockServer();
      registerConfigResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const handler = mock.resources.get('config')!.handler;
      const result = await handler(new URL('deckent://config'));

      const parsed = JSON.parse(result.contents[0]!.text);
      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain('Config not found');
    });

    it('returns error object when config file has invalid JSON', async () => {
      const { registerConfigResource } = await import('../../../src/mcp/resources/config.js');
      const mock = createMockServer();
      registerConfigResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('{ invalid json <<<');

      const handler = mock.resources.get('config')!.handler;
      const result = await handler(new URL('deckent://config'));

      const parsed = JSON.parse(result.contents[0]!.text);
      expect(parsed.error).toContain('Cannot parse config');
    });

    it('includes uri in content', async () => {
      const { registerConfigResource } = await import('../../../src/mcp/resources/config.js');
      const mock = createMockServer();
      registerConfigResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const handler = mock.resources.get('config')!.handler;
      const result = await handler(new URL('deckent://config'));

      expect(result.contents[0]!.uri).toContain('deckent://config');
    });
  });

  // ── dashboard resource ─────────────────────────────────────────────

  describe('deckent://dashboard', () => {
    it('registers dashboard resource with correct name and mimeType', async () => {
      const { registerDashboardResource } = await import('../../../src/mcp/resources/dashboard.js');
      const mock = createMockServer();
      registerDashboardResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      expect(mock.resources.has('dashboard')).toBe(true);
      const cfg = mock.resources.get('dashboard')!.config as { mimeType?: string };
      expect(cfg.mimeType).toBe('application/json');
    });

    it('returns dashboard state when file exists', async () => {
      const { registerDashboardResource } = await import('../../../src/mcp/resources/dashboard.js');
      const mock = createMockServer();
      registerDashboardResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const dashState = {
        active: true,
        sprint: { id: 'sprint-024', phase: 'EXECUTE' },
        progress: { done: 3, total: 5 },
        agents: [],
        alerts: [],
      };
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(dashState));

      const handler = mock.resources.get('dashboard')!.handler;
      const result = await handler(new URL('deckent://dashboard'));

      const parsed = JSON.parse(result.contents[0]!.text);
      expect(parsed.active).toBe(true);
      expect(parsed.sprint.id).toBe('sprint-024');
      expect(parsed.progress.done).toBe(3);
    });

    it('returns { active: false } when dashboard file does not exist', async () => {
      const { registerDashboardResource } = await import('../../../src/mcp/resources/dashboard.js');
      const mock = createMockServer();
      registerDashboardResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const handler = mock.resources.get('dashboard')!.handler;
      const result = await handler(new URL('deckent://dashboard'));

      const parsed = JSON.parse(result.contents[0]!.text);
      expect(parsed.active).toBe(false);
    });

    it('returns { active: false, error } when dashboard JSON is malformed', async () => {
      const { registerDashboardResource } = await import('../../../src/mcp/resources/dashboard.js');
      const mock = createMockServer();
      registerDashboardResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('not valid json!!!');

      const handler = mock.resources.get('dashboard')!.handler;
      const result = await handler(new URL('deckent://dashboard'));

      const parsed = JSON.parse(result.contents[0]!.text);
      expect(parsed.active).toBe(false);
      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain('Cannot parse dashboard');
    });

    it('returns correct mimeType in contents', async () => {
      const { registerDashboardResource } = await import('../../../src/mcp/resources/dashboard.js');
      const mock = createMockServer();
      registerDashboardResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const handler = mock.resources.get('dashboard')!.handler;
      const result = await handler(new URL('deckent://dashboard'));

      expect(result.contents[0]!.mimeType).toBe('application/json');
    });
  });

  // ── debt resource ──────────────────────────────────────────────────

  describe('deckent://debt', () => {
    it('registers debt resource with correct name and mimeType', async () => {
      const { registerDebtResource } = await import('../../../src/mcp/resources/debt.js');
      const mock = createMockServer();
      registerDebtResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      expect(mock.resources.has('debt')).toBe(true);
      const cfg = mock.resources.get('debt')!.config as { mimeType?: string };
      expect(cfg.mimeType).toBe('application/json');
    });

    it('parses debt table and returns JSON array', async () => {
      const { registerDebtResource } = await import('../../../src/mcp/resources/debt.js');
      const mock = createMockServer();
      registerDebtResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const debtMd = `# Tech Debt
| ID | Description | Task | Sprint | Priority | Open | Resolved | Fixed In | Created |
|---|---|---|---|---|---|---|---|---|
| debt-001 | Missing tests | 6-001 | sprint-006 | HIGH | 1 | false |  | 2026-03-17 |
| debt-002 | Unused import | 6-002 | sprint-006 | NORMAL | 2 | true | sprint-007 | 2026-03-16 |
`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(debtMd);

      const handler = mock.resources.get('debt')!.handler;
      const result = await handler(new URL('deckent://debt'));

      const items = JSON.parse(result.contents[0]!.text);
      expect(Array.isArray(items)).toBe(true);
      expect(items).toHaveLength(2);
      expect(items[0].id).toBe('debt-001');
      expect(items[0].priority).toBe('HIGH');
      expect(items[0].resolved).toBe(false);
      expect(items[1].id).toBe('debt-002');
      expect(items[1].resolved).toBe(true);
      expect(items[1].resolvedInSprintId).toBe('sprint-007');
    });

    it('returns empty array when DEBT.md does not exist', async () => {
      const { registerDebtResource } = await import('../../../src/mcp/resources/debt.js');
      const mock = createMockServer();
      registerDebtResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const handler = mock.resources.get('debt')!.handler;
      const result = await handler(new URL('deckent://debt'));

      const items = JSON.parse(result.contents[0]!.text);
      expect(items).toHaveLength(0);
    });

    it('returns empty array when DEBT.md has no table rows', async () => {
      const { registerDebtResource } = await import('../../../src/mcp/resources/debt.js');
      const mock = createMockServer();
      registerDebtResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const emptyDebt = `# Tech Debt\nNo items yet.\n`;
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(emptyDebt);

      const handler = mock.resources.get('debt')!.handler;
      const result = await handler(new URL('deckent://debt'));

      const items = JSON.parse(result.contents[0]!.text);
      expect(items).toHaveLength(0);
    });

    it('handles CRITICAL priority debt item', async () => {
      const { registerDebtResource } = await import('../../../src/mcp/resources/debt.js');
      const mock = createMockServer();
      registerDebtResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const debtMd = `# Tech Debt
| ID | Description | Task | Sprint | Priority | Open | Resolved | Fixed In | Created |
|---|---|---|---|---|---|---|---|---|
| debt-003 | Security hole | 9-001 | sprint-009 | CRITICAL | 5 | false |  | 2026-03-20 |
`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(debtMd);

      const handler = mock.resources.get('debt')!.handler;
      const result = await handler(new URL('deckent://debt'));

      const items = JSON.parse(result.contents[0]!.text);
      expect(items[0].priority).toBe('CRITICAL');
      expect(items[0].sprintsOpen).toBe(5);
    });
  });

  // ── directives resource ────────────────────────────────────────────

  describe('deckent://directives', () => {
    it('registers directives resource with correct name and mimeType', async () => {
      const { registerDirectivesResource } = await import('../../../src/mcp/resources/directives.js');
      const mock = createMockServer();
      registerDirectivesResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      expect(mock.resources.has('directives')).toBe(true);
      const cfg = mock.resources.get('directives')!.config as { mimeType?: string };
      expect(cfg.mimeType).toBe('text/markdown');
    });

    it('returns DIRECTIVES.md content as markdown', async () => {
      const { registerDirectivesResource } = await import('../../../src/mcp/resources/directives.js');
      const mock = createMockServer();
      registerDirectivesResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const content = '# Sprint Goals\n\n## Task 1: Auth\nImplement login flow\n';
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(content);

      const handler = mock.resources.get('directives')!.handler;
      const result = await handler(new URL('deckent://directives'));

      expect(result.contents[0]!.text).toBe(content);
      expect(result.contents[0]!.mimeType).toBe('text/markdown');
    });

    it('returns empty string when DIRECTIVES.md does not exist', async () => {
      const { registerDirectivesResource } = await import('../../../src/mcp/resources/directives.js');
      const mock = createMockServer();
      registerDirectivesResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const handler = mock.resources.get('directives')!.handler;
      const result = await handler(new URL('deckent://directives'));

      expect(result.contents[0]!.text).toBe('');
    });

    it('preserves full markdown content including headers and code blocks', async () => {
      const { registerDirectivesResource } = await import('../../../src/mcp/resources/directives.js');
      const mock = createMockServer();
      registerDirectivesResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const content = '# Directives\n\n```ts\nconst x = 1;\n```\n\n- item 1\n- item 2\n';
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(content);

      const handler = mock.resources.get('directives')!.handler;
      const result = await handler(new URL('deckent://directives'));

      expect(result.contents[0]!.text).toContain('```ts');
      expect(result.contents[0]!.text).toContain('item 1');
    });
  });

  // ── memory resource ────────────────────────────────────────────────

  describe('deckent://memory', () => {
    it('registers memory resource with correct name and mimeType', async () => {
      const { registerMemoryResource } = await import('../../../src/mcp/resources/memory.js');
      const mock = createMockServer();
      registerMemoryResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      expect(mock.resources.has('memory')).toBe(true);
      const cfg = mock.resources.get('memory')!.config as { mimeType?: string };
      expect(cfg.mimeType).toBe('text/markdown');
    });

    it('returns MEMORY.md content', async () => {
      const { registerMemoryResource } = await import('../../../src/mcp/resources/memory.js');
      const mock = createMockServer();
      registerMemoryResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const content = '# Learned Patterns\n\n- spawnSync is safe from injection\n- readJsonSafe returns null on error\n';
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(content);

      const handler = mock.resources.get('memory')!.handler;
      const result = await handler(new URL('deckent://memory'));

      expect(result.contents[0]!.text).toContain('spawnSync');
      expect(result.contents[0]!.mimeType).toBe('text/markdown');
    });

    it('returns empty string when MEMORY.md does not exist', async () => {
      const { registerMemoryResource } = await import('../../../src/mcp/resources/memory.js');
      const mock = createMockServer();
      registerMemoryResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const handler = mock.resources.get('memory')!.handler;
      const result = await handler(new URL('deckent://memory'));

      expect(result.contents[0]!.text).toBe('');
    });

    it('returns correct uri in content', async () => {
      const { registerMemoryResource } = await import('../../../src/mcp/resources/memory.js');
      const mock = createMockServer();
      registerMemoryResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const handler = mock.resources.get('memory')!.handler;
      const result = await handler(new URL('deckent://memory'));

      expect(result.contents[0]!.uri).toContain('deckent://memory');
    });
  });

  // ── registerResources index ────────────────────────────────────────

  describe('registerResources (index)', () => {
    it('registers all 5 resources on the server', async () => {
      const { registerResources } = await import('../../../src/mcp/resources/index.js');
      const mock = createMockServer();
      registerResources(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      expect(mock.resources.has('config')).toBe(true);
      expect(mock.resources.has('dashboard')).toBe(true);
      expect(mock.resources.has('directives')).toBe(true);
      expect(mock.resources.has('memory')).toBe(true);
      expect(mock.resources.has('debt')).toBe(true);
    });
  });

  // ── Error handling edge cases ──────────────────────────────────────

  describe('Error handling', () => {
    it('config: readFileSync throwing non-JSON error returns error object', async () => {
      const { registerConfigResource } = await import('../../../src/mcp/resources/config.js');
      const mock = createMockServer();
      registerConfigResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation(() => { throw new Error('EACCES: permission denied'); });

      const handler = mock.resources.get('config')!.handler;
      const result = await handler(new URL('deckent://config'));

      const parsed = JSON.parse(result.contents[0]!.text);
      expect(parsed.error).toBeDefined();
    });

    it('dashboard: readFileSync throwing returns error fallback', async () => {
      const { registerDashboardResource } = await import('../../../src/mcp/resources/dashboard.js');
      const mock = createMockServer();
      registerDashboardResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation(() => { throw new Error('EACCES: permission denied'); });

      const handler = mock.resources.get('dashboard')!.handler;
      const result = await handler(new URL('deckent://dashboard'));

      const parsed = JSON.parse(result.contents[0]!.text);
      expect(parsed.active).toBe(false);
    });

    it('debt: readFileSync throwing returns empty array', async () => {
      const { registerDebtResource } = await import('../../../src/mcp/resources/debt.js');
      const mock = createMockServer();
      registerDebtResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation(() => { throw new Error('EACCES: permission denied'); });

      const handler = mock.resources.get('debt')!.handler;
      const result = await handler(new URL('deckent://debt'));

      const items = JSON.parse(result.contents[0]!.text);
      expect(items).toHaveLength(0);
    });
  });
});
