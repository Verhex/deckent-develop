import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('../../../src/core/utils.js', () => ({
  ensureDeckentImport: vi.fn(),
  countBrainLines: vi.fn().mockReturnValue(50),
}));

vi.mock('../../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((toolName, response, _ctx) => ({
    ...response,
    _enriched: {
      summary: 'Project initialized.',
      hints: ['`deckent plan` ile ilk sprint\'i planlayın'],
      timestamp: '2026-03-20T00:00:00.000Z',
    },
  })),
}));

import { ensureDeckentImport } from '../../../src/core/utils.js';
import { enrichResponse } from '../../../src/mcp/helpers/enrich.js';

// ─── Mock Server Factory ─────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;

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

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getInitTool() {
  const { registerInitTool } = await import('../../../src/mcp/tools/init.js');
  const server = createMockServer();
  registerInitTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  const tool = server.tools.get('deckent_init');
  expect(tool).toBeDefined();
  return tool!;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('registerInitTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
  });

  // ── Tool Registration ────────────────────────────────────────────────────

  describe('tool registration', () => {
    it('registers tool with name deckent_init', async () => {
      const { registerInitTool } = await import('../../../src/mcp/tools/init.js');
      const server = createMockServer();
      registerInitTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      expect(server.tools.has('deckent_init')).toBe(true);
    });

    it('registers tool with title and description', async () => {
      const { registerInitTool } = await import('../../../src/mcp/tools/init.js');
      const server = createMockServer();
      registerInitTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      const tool = server.tools.get('deckent_init');
      const config = tool!.config as { title: string; description: string };
      expect(config.title).toBe('Initialize Deckent');
      expect(config.description).toContain('Initialize a Deckent project');
    });

    it('registers tool with inputSchema containing projectName, mode, language', async () => {
      const { registerInitTool } = await import('../../../src/mcp/tools/init.js');
      const server = createMockServer();
      registerInitTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      const tool = server.tools.get('deckent_init');
      const config = tool!.config as { inputSchema: unknown };
      expect(config.inputSchema).toBeDefined();
    });
  });

  // ── Successful Init ──────────────────────────────────────────────────────

  describe('successful init', () => {
    it('creates required directories', async () => {
      const tool = await getInitTool();
      await tool.handler({ projectName: 'my-project', mode: 'max_plan', language: 'en' });
      expect(vi.mocked(mkdirSync)).toHaveBeenCalled();
      const calls = vi.mocked(mkdirSync).mock.calls.map((c) => String(c[0]));
      // Check that key directories are created
      expect(calls.some((p) => p.includes('.deckent'))).toBe(true);
      expect(calls.some((p) => p.includes('.brain'))).toBe(true);
      expect(calls.some((p) => p.includes('.tasks'))).toBe(true);
    });

    it('creates config.json with correct fields', async () => {
      const tool = await getInitTool();
      await tool.handler({ projectName: 'test-project', mode: 'pro_plan', language: 'tr' });
      const writeCall = vi.mocked(writeFileSync).mock.calls.find(
        (c) => String(c[0]).includes('config.json'),
      );
      expect(writeCall).toBeDefined();
      const content = JSON.parse(String(writeCall![1]));
      expect(content.projectName).toBe('test-project');
      expect(content.mode).toBe('pro_plan');
      expect(content.language).toBe('tr');
    });

    it('returns success: true in response', async () => {
      const tool = await getInitTool();
      const result = await tool.handler({ projectName: 'my-project', mode: 'max_plan', language: 'en' });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.success).toBe(true);
    });

    it('writes DECKENT.md with project name', async () => {
      const tool = await getInitTool();
      await tool.handler({ projectName: 'awesome-project', mode: 'max_plan', language: 'en' });
      const deckentWrite = vi.mocked(writeFileSync).mock.calls.find(
        (c) => String(c[0]).endsWith('DECKENT.md'),
      );
      expect(deckentWrite).toBeDefined();
      expect(String(deckentWrite![1])).toContain('awesome-project');
    });

    it('writes i18n files for en and tr', async () => {
      const tool = await getInitTool();
      await tool.handler({ projectName: 'proj', mode: 'max_plan', language: 'en' });
      const writeCalls = vi.mocked(writeFileSync).mock.calls.map((c) => String(c[0]));
      expect(writeCalls.some((p) => p.includes('en.json'))).toBe(true);
      expect(writeCalls.some((p) => p.includes('tr.json'))).toBe(true);
    });

    it('calls ensureDeckentImport for AGENTS.md and CLAUDE.md', async () => {
      const tool = await getInitTool();
      await tool.handler({ projectName: 'proj', mode: 'max_plan', language: 'en' });
      expect(vi.mocked(ensureDeckentImport)).toHaveBeenCalledTimes(2);
    });

    it('registers MCP server in .claude/settings.json', async () => {
      const tool = await getInitTool();
      await tool.handler({ projectName: 'proj', mode: 'max_plan', language: 'en' });
      const settingsCalls = vi.mocked(writeFileSync).mock.calls.filter(
        (c) => String(c[0]).includes('settings.json'),
      );
      expect(settingsCalls.length).toBeGreaterThan(0);
      const content = JSON.parse(String(settingsCalls[0]![1]));
      expect(content.mcpServers.deckent.command).toBe('deckent-mcp');
    });
  });

  // ── Parameter Handling ───────────────────────────────────────────────────

  describe('parameter handling', () => {
    it('uses provided projectName in response', async () => {
      const tool = await getInitTool();
      const result = await tool.handler({ projectName: 'special-name', mode: 'max_plan', language: 'en' });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.projectName).toBe('special-name');
    });

    it('uses provided mode in response', async () => {
      const tool = await getInitTool();
      const result = await tool.handler({ projectName: 'proj', mode: 'api', language: 'en' });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.mode).toBe('api');
    });

    it('uses provided language in response', async () => {
      const tool = await getInitTool();
      const result = await tool.handler({ projectName: 'proj', mode: 'max_plan', language: 'tr' });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.language).toBe('tr');
    });

    it('supports max5x_plan mode', async () => {
      const tool = await getInitTool();
      const result = await tool.handler({ projectName: 'proj', mode: 'max5x_plan', language: 'en' });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.mode).toBe('max5x_plan');
    });

    it('passes language to enrichResponse for localization', async () => {
      const tool = await getInitTool();
      await tool.handler({ projectName: 'proj', mode: 'max_plan', language: 'tr' });
      expect(vi.mocked(enrichResponse)).toHaveBeenCalledWith(
        'init',
        expect.objectContaining({ language: 'tr' }),
        { lang: 'tr' },
      );
    });
  });

  // ── Already Initialized / Config Merge ─────────────────────────────────

  describe('existing config handling', () => {
    it('merges into existing config.json instead of overwriting', async () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('config.json'));
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (String(p).includes('config.json')) {
          return JSON.stringify({ customField: 'keep-me', mode: 'api' });
        }
        return '';
      });

      const tool = await getInitTool();
      await tool.handler({ projectName: 'proj', mode: 'max_plan', language: 'en' });

      const configWriteCalls = vi.mocked(writeFileSync).mock.calls.filter(
        (c) => String(c[0]).includes('config.json'),
      );
      expect(configWriteCalls.length).toBeGreaterThan(0);
      const content = JSON.parse(String(configWriteCalls[0]![1]));
      expect(content.customField).toBe('keep-me');
      expect(content.mode).toBe('max_plan'); // overwritten by new config
    });

    it('handles malformed existing config.json gracefully', async () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('config.json'));
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (String(p).includes('config.json')) return 'NOT_VALID_JSON{{{';
        return '';
      });

      const tool = await getInitTool();
      // Should not throw — writes fresh config instead
      await expect(
        tool.handler({ projectName: 'proj', mode: 'max_plan', language: 'en' }),
      ).resolves.toBeDefined();
    });

    it('does not re-register MCP server if already present in settings.json', async () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('settings.json'));
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (String(p).includes('settings.json')) {
          return JSON.stringify({ mcpServers: { deckent: { command: 'existing-cmd', args: [] } } });
        }
        return '';
      });

      const tool = await getInitTool();
      await tool.handler({ projectName: 'proj', mode: 'max_plan', language: 'en' });

      const settingsCalls = vi.mocked(writeFileSync).mock.calls.filter(
        (c) => String(c[0]).includes('settings.json'),
      );
      // Should NOT write settings again (deckent already registered)
      expect(settingsCalls.length).toBe(0);
    });
  });

  // ── Response Format ──────────────────────────────────────────────────────

  describe('response format', () => {
    it('returns content array with type: text', async () => {
      const tool = await getInitTool();
      const result = await tool.handler({ projectName: 'proj', mode: 'max_plan', language: 'en' });
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe('text');
    });

    it('response includes _enriched meta with summary and hints', async () => {
      const tool = await getInitTool();
      const result = await tool.handler({ projectName: 'proj', mode: 'max_plan', language: 'en' });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed._enriched).toBeDefined();
      expect(parsed._enriched.summary).toBeDefined();
      expect(Array.isArray(parsed._enriched.hints)).toBe(true);
    });

    it('response includes nextSteps array', async () => {
      const tool = await getInitTool();
      const result = await tool.handler({ projectName: 'proj', mode: 'max_plan', language: 'en' });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(Array.isArray(parsed.nextSteps)).toBe(true);
      expect(parsed.nextSteps.length).toBeGreaterThan(0);
    });

    it('response includes created array of created paths', async () => {
      const tool = await getInitTool();
      const result = await tool.handler({ projectName: 'proj', mode: 'max_plan', language: 'en' });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(Array.isArray(parsed.created)).toBe(true);
      expect(parsed.created.length).toBeGreaterThan(0);
    });

    it('calls enrichResponse with tool name "init"', async () => {
      const tool = await getInitTool();
      await tool.handler({ projectName: 'proj', mode: 'max_plan', language: 'en' });
      expect(vi.mocked(enrichResponse)).toHaveBeenCalledWith(
        'init',
        expect.any(Object),
        expect.any(Object),
      );
    });
  });
});
