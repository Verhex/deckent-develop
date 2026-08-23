import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
}));

vi.mock('../../../src/core/constants.js', async () => {
  const actual = await vi.importActual('../../../src/core/constants.js') as Record<string, unknown>;
  return {
    ...actual,
    DECKENT_VERSION: '0.68.0',
  };
});

// ─── Mock Server ─────────────────────────────────────────────────────────────

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

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0].text);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupUninitializedProject() {
  vi.mocked(existsSync).mockReturnValue(false);
  vi.mocked(readdirSync).mockReturnValue([]);
}

function setupInitializedNoDirectives() {
  vi.mocked(existsSync).mockImplementation((p: unknown) => {
    const path = String(p);
    if (path.endsWith('config.json')) return true;
    return false;
  });
  vi.mocked(readFileSync).mockImplementation((p: unknown) => {
    const path = String(p);
    if (path.endsWith('config.json')) return JSON.stringify({ routing_engine: 'v2' });
    return '';
  });
  vi.mocked(readdirSync).mockReturnValue([]);
}

function setupInitializedWithDirectives() {
  vi.mocked(existsSync).mockImplementation((p: unknown) => {
    const path = String(p);
    if (path.endsWith('config.json')) return true;
    if (path.endsWith('DIRECTIVES.md')) return true;
    return false;
  });
  vi.mocked(readFileSync).mockImplementation((p: unknown) => {
    const path = String(p);
    if (path.endsWith('config.json')) return JSON.stringify({ routing_engine: 'v2' });
    if (path.endsWith('DIRECTIVES.md')) return '# DIRECTIVES — Sprint 068\n\n## Task 1: Do something\n';
    return '';
  });
  vi.mocked(readdirSync).mockReturnValue([]);
}

function setupActiveSprintProject() {
  vi.mocked(existsSync).mockImplementation((p: unknown) => {
    const path = String(p);
    if (path.endsWith('config.json')) return true;
    if (path.endsWith('DIRECTIVES.md')) return true;
    if (path.endsWith('.dashboard')) return true;
    return false;
  });
  vi.mocked(readFileSync).mockImplementation((p: unknown) => {
    const path = String(p);
    if (path.endsWith('config.json')) return JSON.stringify({ routing_engine: 'v2' });
    if (path.endsWith('DIRECTIVES.md')) return '# DIRECTIVES — Sprint 068\n\n## Task 1: Do something\n';
    if (path.endsWith('.dashboard')) return JSON.stringify({ active: true });
    return '';
  });
  vi.mocked(readdirSync).mockReturnValue([]);
}

function setupCompletedSprintProject() {
  vi.mocked(existsSync).mockImplementation((p: unknown) => {
    const path = String(p);
    if (path.endsWith('config.json')) return true;
    if (path.endsWith('DIRECTIVES.md')) return true;
    if (path.includes('jobs')) return true;
    return false;
  });
  vi.mocked(readFileSync).mockImplementation((p: unknown) => {
    const path = String(p);
    if (path.endsWith('config.json')) return JSON.stringify({ routing_engine: 'v2' });
    if (path.endsWith('DIRECTIVES.md')) return '# DIRECTIVES — Sprint 068\n\n## Task 1: Do something\n';
    if (path.endsWith('.json') && path.includes('jobs')) {
      return JSON.stringify({ jobId: 'job-001', sprintId: 'sprint-067', status: 'COMPLETE' });
    }
    return '';
  });
  vi.mocked(readdirSync).mockImplementation((p: unknown) => {
    const path = String(p);
    if (path.includes('jobs')) return ['job-001.json'] as unknown as ReturnType<typeof readdirSync>;
    return [] as unknown as ReturnType<typeof readdirSync>;
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('registerHelpTool', () => {
  let server: MockServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = createMockServer();
    const { registerHelpTool } = await import('../../../src/mcp/tools/help.js');
    registerHelpTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  });

  it('registers deckent_help tool on the server', () => {
    expect(server.tools.has('deckent_help')).toBe(true);
  });

  it('tool config has readOnlyHint annotation', () => {
    const toolConfig = server.tools.get('deckent_help')?.config as Record<string, unknown>;
    const annotations = toolConfig?.['annotations'] as Record<string, unknown>;
    expect(annotations?.['readOnlyHint']).toBe(true);
    expect(annotations?.['destructiveHint']).toBe(false);
  });

  describe('state detection', () => {
    it('returns initialized=false when config.json does not exist', async () => {
      setupUninitializedProject();
      const handler = server.tools.get('deckent_help')!.handler;
      const result = await handler({});
      const data = parseResult(result);
      expect(data.state.initialized).toBe(false);
    });

    it('returns initialized=true when config.json exists', async () => {
      setupInitializedNoDirectives();
      const handler = server.tools.get('deckent_help')!.handler;
      const result = await handler({});
      const data = parseResult(result);
      expect(data.state.initialized).toBe(true);
    });

    it('returns hasDirectives=false when DIRECTIVES.md is absent', async () => {
      setupInitializedNoDirectives();
      const handler = server.tools.get('deckent_help')!.handler;
      const result = await handler({});
      const data = parseResult(result);
      expect(data.state.hasDirectives).toBe(false);
    });

    it('returns hasDirectives=true when DIRECTIVES.md has real content', async () => {
      setupInitializedWithDirectives();
      const handler = server.tools.get('deckent_help')!.handler;
      const result = await handler({});
      const data = parseResult(result);
      expect(data.state.hasDirectives).toBe(true);
    });

    it('returns sprintActive=true when .dashboard active=true', async () => {
      setupActiveSprintProject();
      const handler = server.tools.get('deckent_help')!.handler;
      const result = await handler({});
      const data = parseResult(result);
      expect(data.state.sprintActive).toBe(true);
    });

    it('returns sprintActive=false when .dashboard is absent', async () => {
      setupInitializedWithDirectives();
      const handler = server.tools.get('deckent_help')!.handler;
      const result = await handler({});
      const data = parseResult(result);
      expect(data.state.sprintActive).toBe(false);
    });

    it('returns lastSprint from job state when jobs dir exists', async () => {
      setupCompletedSprintProject();
      const handler = server.tools.get('deckent_help')!.handler;
      const result = await handler({});
      const data = parseResult(result);
      expect(data.state.lastSprint).toBe('sprint-067');
    });

    it('returns lastSprint=null when no jobs exist', async () => {
      setupInitializedWithDirectives();
      const handler = server.tools.get('deckent_help')!.handler;
      const result = await handler({});
      const data = parseResult(result);
      expect(data.state.lastSprint).toBeNull();
    });

    it('returns routingEngine from config when config exists', async () => {
      setupInitializedWithDirectives();
      const handler = server.tools.get('deckent_help')!.handler;
      const result = await handler({});
      const data = parseResult(result);
      expect(data.state.routingEngine).toBe('v2');
    });

    it('returns agentCount from .deckent/agents/ directory count', async () => {
      vi.mocked(existsSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('config.json')) return true;
        if (path.includes('agents')) return true;
        return false;
      });
      vi.mocked(readFileSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('config.json')) return JSON.stringify({});
        return '';
      });
      vi.mocked(readdirSync).mockImplementation((p: unknown, opts?: unknown) => {
        const path = String(p);
        if (path.includes('agents') && opts && typeof opts === 'object') {
          return [
            { name: 'bug-fixer', isDirectory: () => true },
            { name: 'test-writer', isDirectory: () => true },
            { name: 'doc-writer', isDirectory: () => true },
          ] as unknown as ReturnType<typeof readdirSync>;
        }
        return [] as unknown as ReturnType<typeof readdirSync>;
      });

      const handler = server.tools.get('deckent_help')!.handler;
      const result = await handler({});
      const data = parseResult(result);
      expect(data.state.agentCount).toBe(3);
    });
  });

  describe('nextAction logic', () => {
    it('recommends init when project is not initialized', async () => {
      setupUninitializedProject();
      const handler = server.tools.get('deckent_help')!.handler;
      const result = await handler({});
      const data = parseResult(result);
      expect(data.nextAction).toContain('deckent_init');
    });

    it('recommends set_directives when initialized but no directives', async () => {
      setupInitializedNoDirectives();
      const handler = server.tools.get('deckent_help')!.handler;
      const result = await handler({});
      const data = parseResult(result);
      expect(data.nextAction).toContain('deckent_set_directives');
    });

    it('recommends status when sprint is active', async () => {
      setupActiveSprintProject();
      const handler = server.tools.get('deckent_help')!.handler;
      const result = await handler({});
      const data = parseResult(result);
      expect(data.nextAction).toContain('deckent_status');
    });

    it('recommends retro when sprint completed and lastSprint is set', async () => {
      setupCompletedSprintProject();
      const handler = server.tools.get('deckent_help')!.handler;
      const result = await handler({});
      const data = parseResult(result);
      expect(data.nextAction).toContain('deckent_retro');
    });
  });

  describe('response structure', () => {
    it('includes version field', async () => {
      setupUninitializedProject();
      const handler = server.tools.get('deckent_help')!.handler;
      const result = await handler({});
      const data = parseResult(result);
      expect(typeof data.version).toBe('string');
      expect(data.version.length).toBeGreaterThan(0);
    });

    it('includes all three workflow categories', async () => {
      setupUninitializedProject();
      const handler = server.tools.get('deckent_help')!.handler;
      const result = await handler({});
      const data = parseResult(result);
      expect(data.workflows.sprint).toBeInstanceOf(Array);
      expect(data.workflows.debug).toBeInstanceOf(Array);
      expect(data.workflows.config).toBeInstanceOf(Array);
      expect(data.workflows.sprint).toContain('init');
      expect(data.workflows.debug).toContain('doctor');
    });

    it('includes tools array with readOnly field', async () => {
      setupUninitializedProject();
      const handler = server.tools.get('deckent_help')!.handler;
      const result = await handler({});
      const data = parseResult(result);
      expect(data.tools).toBeInstanceOf(Array);
      expect(data.tools.length).toBeGreaterThanOrEqual(16);
      const helpTool = data.tools.find((t: { name: string }) => t.name === 'deckent_help');
      expect(helpTool).toBeDefined();
      expect(helpTool.readOnly).toBe(true);
    });

    it('includes resources array with uri field', async () => {
      setupUninitializedProject();
      const handler = server.tools.get('deckent_help')!.handler;
      const result = await handler({});
      const data = parseResult(result);
      expect(data.resources).toBeInstanceOf(Array);
      expect(data.resources.length).toBe(8);
      const dashRes = data.resources.find((r: { name: string }) => r.name === 'dashboard');
      expect(dashRes).toBeDefined();
      expect(dashRes.uri).toBe('deckent://dashboard');
    });

    it('marks destructive tools correctly', async () => {
      setupUninitializedProject();
      const handler = server.tools.get('deckent_help')!.handler;
      const result = await handler({});
      const data = parseResult(result);
      const killTool = data.tools.find((t: { name: string }) => t.name === 'deckent_kill');
      expect(killTool.readOnly).toBe(false);
      const statusTool = data.tools.find((t: { name: string }) => t.name === 'deckent_status');
      expect(statusTool.readOnly).toBe(true);
    });
  });
});
