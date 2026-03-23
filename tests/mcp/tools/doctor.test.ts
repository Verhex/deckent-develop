import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

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

vi.mock('../../../src/core/utils.js', () => ({
  countBrainLines: vi.fn().mockReturnValue(50),
  ensureDeckentImport: vi.fn(),
}));

vi.mock('../../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({
    cpuCores: 8,
    totalMemMB: 16384,
    freeMemMB: 8192,
    recommendedMaxWorkers: 6,
  }),
}));

vi.mock('../../../src/core/subscription.js', () => ({
  detectSubscription: vi.fn().mockReturnValue({
    detected: 'max',
    method: 'config',
  }),
}));

// ─── Mock Server ────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
type ToolConfig = { title?: string; description?: string; inputSchema?: unknown };

function createMockServer() {
  const tools = new Map<string, { config: ToolConfig; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name: string, config: ToolConfig, handler: ToolHandler) {
      tools.set(name, { config, handler });
    },
  };
}

function makeSpawnResult(status: number, stdout: string) {
  return { status, stdout, stderr: '', pid: 1, output: [], signal: null };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('MCP Tool: deckent_doctor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Tool Registration ─────────────────────────────────────────

  describe('tool registration', () => {
    it('registers with name deckent_doctor', async () => {
      const { registerDoctorTool } = await import('../../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as McpServer);
      expect(mock.tools.has('deckent_doctor')).toBe(true);
    });

    it('has correct title and description', async () => {
      const { registerDoctorTool } = await import('../../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as McpServer);
      const tool = mock.tools.get('deckent_doctor')!;
      expect(tool.config.title).toBe('Health Check');
      expect(tool.config.description).toContain('health check');
    });

    it('schema accepts includeProfile boolean', async () => {
      const { registerDoctorTool } = await import('../../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as McpServer);
      const tool = mock.tools.get('deckent_doctor')!;
      expect(tool.config.inputSchema).toBeDefined();
    });
  });

  // ── 2. Health Checks ─────────────────────────────────────────────

  describe('health checks', () => {
    it('returns checks array in response', async () => {
      const { registerDoctorTool } = await import('../../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as McpServer);

      vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v20.0.0'));
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# content');
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: false });
      const wrapped = JSON.parse(result.content[0]!.text);
      const parsed = wrapped.data ?? wrapped;

      expect(Array.isArray(parsed.checks)).toBe(true);
      expect(parsed.checks.length).toBeGreaterThan(0);
    });

    it('reports node check passing when version >= 18', async () => {
      const { registerDoctorTool } = await import('../../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as McpServer);

      vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v20.0.0'));
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# content');
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: false });
      const wrapped = JSON.parse(result.content[0]!.text);
      const parsed = wrapped.data ?? wrapped;

      const nodeCheck = parsed.checks.find((c: { name: string }) => c.name === 'Node.js');
      expect(nodeCheck).toBeDefined();
      expect(nodeCheck.passed).toBe(true);
    });

    it('reports git check passing when git is found', async () => {
      const { registerDoctorTool } = await import('../../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as McpServer);

      vi.mocked(spawnSync).mockImplementation((cmd: string) => {
        if (cmd === 'git') return makeSpawnResult(0, 'git version 2.39.0');
        return makeSpawnResult(0, 'v20.0.0');
      });
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# content');
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: false });
      const wrapped = JSON.parse(result.content[0]!.text);
      const parsed = wrapped.data ?? wrapped;

      const gitCheck = parsed.checks.find((c: { name: string }) => c.name === 'git');
      expect(gitCheck).toBeDefined();
      expect(gitCheck.passed).toBe(true);
    });

    it('reports tmux check failing when tmux is not found', async () => {
      const { registerDoctorTool } = await import('../../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as McpServer);

      vi.mocked(spawnSync).mockImplementation((cmd: string) => {
        if (cmd === 'tmux') return makeSpawnResult(1, '');
        return makeSpawnResult(0, 'v20.0.0');
      });
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# content');
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: false });
      const wrapped = JSON.parse(result.content[0]!.text);
      const parsed = wrapped.data ?? wrapped;

      const tmuxCheck = parsed.checks.find((c: { name: string }) => c.name === 'tmux');
      expect(tmuxCheck).toBeDefined();
      expect(tmuxCheck.passed).toBe(false);
    });

    it('reports claude check failing when claude CLI is not found', async () => {
      const { registerDoctorTool } = await import('../../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as McpServer);

      vi.mocked(spawnSync).mockImplementation((cmd: string) => {
        if (cmd === 'claude') return makeSpawnResult(1, '');
        return makeSpawnResult(0, 'v20.0.0');
      });
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# content');
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: false });
      const wrapped = JSON.parse(result.content[0]!.text);
      const parsed = wrapped.data ?? wrapped;

      const claudeCheck = parsed.checks.find((c: { name: string }) => c.name === 'Claude CLI');
      expect(claudeCheck).toBeDefined();
      expect(claudeCheck.passed).toBe(false);
    });
  });

  // ── 3. Response Format ───────────────────────────────────────────

  describe('response format', () => {
    it('returns valid JSON in content text', async () => {
      const { registerDoctorTool } = await import('../../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as McpServer);

      vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v20.0.0'));
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# content');
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: false });
      expect(result.content[0]!.type).toBe('text');
      expect(() => JSON.parse(result.content[0]!.text)).not.toThrow();
    });

    it('includes healthScore as number', async () => {
      const { registerDoctorTool } = await import('../../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as McpServer);

      vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v20.0.0'));
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# content');
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: false });
      const wrapped = JSON.parse(result.content[0]!.text);
      const parsed = wrapped.data ?? wrapped;

      expect(typeof parsed.healthScore).toBe('number');
      expect(parsed.healthScore).toBeGreaterThanOrEqual(0);
      expect(parsed.healthScore).toBeLessThanOrEqual(100);
    });

    it('includes recommendations array', async () => {
      const { registerDoctorTool } = await import('../../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as McpServer);

      vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v20.0.0'));
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# content');
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: false });
      const wrapped = JSON.parse(result.content[0]!.text);
      const parsed = wrapped.data ?? wrapped;

      expect(Array.isArray(parsed.recommendations)).toBe(true);
    });

    it('includes _enriched metadata', async () => {
      const { registerDoctorTool } = await import('../../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as McpServer);

      vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v20.0.0'));
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# content');
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: false });
      const wrapped = JSON.parse(result.content[0]!.text);
      const parsed = wrapped.data ?? wrapped;

      expect(parsed._enriched).toBeDefined();
      expect(parsed._enriched.summary).toBeTruthy();
      expect(Array.isArray(parsed._enriched.hints)).toBe(true);
      expect(parsed._enriched.timestamp).toBeTruthy();
    });

    it('includes overall ok field', async () => {
      const { registerDoctorTool } = await import('../../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as McpServer);

      vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v20.0.0'));
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# content');
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: false });
      const wrapped = JSON.parse(result.content[0]!.text);
      const parsed = wrapped.data ?? wrapped;

      expect(typeof parsed.ok).toBe('boolean');
    });
  });

  // ── 4. Error Handling ────────────────────────────────────────────

  describe('error handling', () => {
    it('adds failed check names to recommendations', async () => {
      const { registerDoctorTool } = await import('../../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as McpServer);

      vi.mocked(spawnSync).mockImplementation((cmd: string) => {
        if (cmd === 'tmux') return makeSpawnResult(1, '');
        if (cmd === 'claude') return makeSpawnResult(1, '');
        return makeSpawnResult(0, 'v20.0.0');
      });
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# content');
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: false });
      const wrapped = JSON.parse(result.content[0]!.text);
      const parsed = wrapped.data ?? wrapped;

      expect(parsed.recommendations.length).toBeGreaterThan(0);
      expect(parsed.recommendations.some((r: string) => r.includes('tmux') || r.includes('Claude'))).toBe(true);
    });

    it('healthScore is 0 when all checks fail', async () => {
      const { registerDoctorTool } = await import('../../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as McpServer);

      vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(1, ''));
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readFileSync).mockImplementation(() => { throw new Error('not found'); });
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: false });
      const wrapped = JSON.parse(result.content[0]!.text);
      const parsed = wrapped.data ?? wrapped;

      expect(parsed.healthScore).toBe(0);
    });

    it('ok is false when required checks fail', async () => {
      const { registerDoctorTool } = await import('../../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as McpServer);

      vi.mocked(spawnSync).mockImplementation((cmd: string) => {
        if (cmd === 'tmux') return makeSpawnResult(1, '');
        return makeSpawnResult(0, 'v20.0.0');
      });
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# content');
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: false });
      const wrapped = JSON.parse(result.content[0]!.text);
      const parsed = wrapped.data ?? wrapped;

      expect(parsed.ok).toBe(false);
    });
  });

  // ── 5. includeProfile Flag ───────────────────────────────────────

  describe('includeProfile flag', () => {
    it('includes systemProfile when includeProfile is true', async () => {
      const { registerDoctorTool } = await import('../../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as McpServer);

      vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v20.0.0'));
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# content');
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: true });
      const wrapped = JSON.parse(result.content[0]!.text);
      const parsed = wrapped.data ?? wrapped;

      expect(parsed.systemProfile).toBeDefined();
      expect(parsed.systemProfile.cpuCores).toBe(8);
      expect(parsed.systemProfile.totalMemMB).toBe(16384);
      expect(parsed.systemProfile.recommendedMaxWorkers).toBe(6);
    });

    it('omits systemProfile when includeProfile is false', async () => {
      const { registerDoctorTool } = await import('../../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as McpServer);

      vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v20.0.0'));
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# content');
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: false });
      const wrapped = JSON.parse(result.content[0]!.text);
      const parsed = wrapped.data ?? wrapped;

      expect(parsed.systemProfile).toBeUndefined();
    });

    it('includes subscription info in systemProfile', async () => {
      const { registerDoctorTool } = await import('../../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as McpServer);

      vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v20.0.0'));
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# content');
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: true });
      const wrapped = JSON.parse(result.content[0]!.text);
      const parsed = wrapped.data ?? wrapped;

      expect(parsed.systemProfile.subscription).toBe('max');
      expect(parsed.systemProfile.subscriptionMethod).toBe('config');
    });
  });
});
