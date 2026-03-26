import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

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

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return {
    ...actual,
    countBrainLines: vi.fn().mockReturnValue(100),
    ensureDeckentImport: vi.fn(),
  };
});

vi.mock('../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(),
  readContext: vi.fn(),
  checkUsage: vi.fn(),
  adjustSprintSize: vi.fn(),
  planSprint: vi.fn(),
  BrainError: class BrainError extends Error {
    phase?: string;
    constructor(msg: string, phase?: string) {
      super(msg);
      this.name = 'BrainError';
      this.phase = phase;
    }
  },
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

vi.mock('../../src/core/analyzer.js', () => ({
  analyzeProject: vi.fn(),
}));

vi.mock('../../src/mcp/tools/job-runner.js', () => ({
  writeJobState: vi.fn(),
  readJobState: vi.fn(),
  readLatestJobState: vi.fn(),
}));

vi.mock('../../src/core/provider.js', () => ({
  bootstrapProviders: vi.fn(),
}));

vi.mock('../../src/mcp/helpers/format.js', () => ({
  formatStatusResponse: vi.fn(() => 'mocked summary'),
  formatStartResponse: vi.fn(() => 'mocked summary'),
  formatDoctorResponse: vi.fn(() => 'mocked doctor summary'),
  formatRetroResponse: vi.fn(() => 'mocked retro summary'),
  formatHistoryResponse: vi.fn(() => 'mocked history summary'),
  formatErrorResponse: vi.fn(() => 'mocked error summary'),
  wrapResponse: vi.fn(<T>(data: T, _summary: string) => data),
}));

import { loadConfig } from '../../src/core/config.js';
import { runSprint, BrainError } from '../../src/orchestra/brain.js';
import { writeJobState } from '../../src/mcp/tools/job-runner.js';

// ─── Mock Server Pattern ────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>, ctx?: unknown) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
type ResourceHandler = (uri: URL, vars?: unknown) => Promise<{ contents: Array<{ uri: string; text: string; mimeType?: string }> }>;

interface MockServer {
  tools: Map<string, { config: unknown; handler: ToolHandler }>;
  resources: Map<string, { config: unknown; handler: ResourceHandler }>;
  registerTool: (name: string, config: unknown, handler: ToolHandler) => void;
  registerResource: (name: string, uri: string, config: unknown, handler: ResourceHandler) => void;
}

function createMockServer(): MockServer {
  const tools = new Map<string, { config: unknown; handler: ToolHandler }>();
  const resources = new Map<string, { config: unknown; handler: ResourceHandler }>();

  return {
    tools,
    resources,
    registerTool(name: string, config: unknown, handler: ToolHandler) {
      tools.set(name, { config, handler });
    },
    registerResource(name: string, _uri: string, config: unknown, handler: ResourceHandler) {
      resources.set(name, { config, handler });
    },
  };
}

// ─── Branch Coverage Tests ──────────────────────────────────────────

describe('MCP Branch Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── status.ts: JSON parse error path (catch block lines 32-40) ───
  describe('deckent_status — JSON parse error', () => {
    it('returns error when dashboard file contains invalid JSON', async () => {
      const { registerStatusTool } = await import('../../src/mcp/tools/status.js');
      const mock = createMockServer();
      registerStatusTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('not valid json {{{');

      const result = await mock.tools.get('deckent_status')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      const data = parsed.data ?? parsed;

      expect(result.isError).toBe(true);
      expect(data.active).toBe(false);
      expect(data.message).toBe('Cannot parse dashboard file.');
    });
  });

  // ─── debt.ts: parseDebtTable edge cases ───────────────────────────
  describe('deckent://debt — parseDebtTable edge cases', () => {
    it('skips rows with fewer than 9 columns', async () => {
      const { registerDebtResource } = await import('../../src/mcp/resources/debt.js');
      const mock = createMockServer();
      registerDebtResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      // Row with fewer columns than expected — shared parseDebtTable skips it
      const debtMd = `# Tech Debt
| ID | Description | Task | Sprint | Priority | Open | Resolved | Fixed In | Created |
|---|---|---|---|---|---|---|---|---|
| debt-001 | Missing tests |
`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(debtMd);

      const handler = mock.resources.get('debt')!.handler;
      const result = await handler(new URL('deckent://debt'));
      const items = JSON.parse(result.contents[0]!.text);

      expect(items).toHaveLength(0);
    });

    it('handles dash resolvedInSprintId (cols[7] is "-")', async () => {
      const { registerDebtResource } = await import('../../src/mcp/resources/debt.js');
      const mock = createMockServer();
      registerDebtResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const debtMd = `# Tech Debt
| ID | Description | Task | Sprint | Priority | Open | Resolved | Fixed In | Created |
|---|---|---|---|---|---|---|---|---|
| debt-001 | Some issue | 7-001 | sprint-007 | NORMAL | 1 | false | - | 2026-03-17 |
`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(debtMd);

      const handler = mock.resources.get('debt')!.handler;
      const result = await handler(new URL('deckent://debt'));
      const items = JSON.parse(result.contents[0]!.text);

      expect(items[0].resolvedInSprintId).toBeUndefined();
    });

    it('handles readFileSync error (catch block line 44)', async () => {
      const { registerDebtResource } = await import('../../src/mcp/resources/debt.js');
      const mock = createMockServer();
      registerDebtResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation(() => { throw new Error('read error'); });

      const handler = mock.resources.get('debt')!.handler;
      const result = await handler(new URL('deckent://debt'));
      const items = JSON.parse(result.contents[0]!.text);

      expect(items).toHaveLength(0);
    });

    it('includes rows with empty IDs (shared parseDebtTable does not filter)', async () => {
      const { registerDebtResource } = await import('../../src/mcp/resources/debt.js');
      const mock = createMockServer();
      registerDebtResource(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const debtMd = `# Tech Debt
| ID | Description | Task | Sprint | Priority | Open | Resolved | Fixed In | Created |
|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |  |
| debt-001 | Real item | 7-001 | sprint-007 | HIGH | 1 | false | - | 2026-03-17 |
`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(debtMd);

      const handler = mock.resources.get('debt')!.handler;
      const result = await handler(new URL('deckent://debt'));
      const items = JSON.parse(result.contents[0]!.text);

      // Shared parseDebtTable includes all rows with 9+ columns
      expect(items).toHaveLength(2);
      expect(items[1].id).toBe('debt-001');
    });
  });

  // ─── init.ts: existing file detection paths ──────────────────────
  describe('deckent_init — existing file paths', () => {
    it('reads existing .gitignore and appends new entries', async () => {
      const { registerInitTool } = await import('../../src/mcp/tools/init.js');
      const mock = createMockServer();
      registerInitTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      // .gitignore exists with some content, settings.json does not
      vi.mocked(existsSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('.gitignore')) return true;
        if (path.endsWith('settings.json')) return false;
        return false;
      });
      vi.mocked(readFileSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('.gitignore')) return 'node_modules/\n';
        return '';
      });

      const result = await mock.tools.get('deckent_init')!.handler({ projectName: 'test', mode: 'max_plan', language: 'en' });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.success).toBe(true);
    });

    it('handles corrupted settings.json (catch block line 109-112)', async () => {
      const { registerInitTool } = await import('../../src/mcp/tools/init.js');
      const mock = createMockServer();
      registerInitTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('settings.json')) return true;
        return false;
      });
      vi.mocked(readFileSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('settings.json')) return 'not valid json';
        return '';
      });

      const result = await mock.tools.get('deckent_init')!.handler({ projectName: 'test', mode: 'max_plan', language: 'en' });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.success).toBe(true);
    });

    it('skips MCP registration when deckent already in settings', async () => {
      const { registerInitTool } = await import('../../src/mcp/tools/init.js');
      const mock = createMockServer();
      registerInitTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('settings.json')) return true;
        return false;
      });
      vi.mocked(readFileSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('settings.json')) return JSON.stringify({ mcpServers: { deckent: { command: 'deckent-mcp' } } });
        return '';
      });

      const result = await mock.tools.get('deckent_init')!.handler({ projectName: 'test', mode: 'max_plan', language: 'en' });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.success).toBe(true);
      // settings.json should NOT be in created list since deckent is already registered
      expect(parsed.created).not.toContain('.claude/settings.json');
    });
  });

  // ─── start.ts: background job error handling ───────────────────────
  describe('deckent_start — background job error handling', () => {
    it('writes FAILED job state with BrainError phase info', async () => {
      const { registerStartTool } = await import('../../src/mcp/tools/start.js');
      const mock = createMockServer();
      registerStartTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(loadConfig).mockResolvedValue({
        mode: 'max_plan',
        activeModeConfig: {
          max_workers: 8, brain_model: 'opus', default_model: 'sonnet',
          haiku_allowed: true, usage_thresholds: { '5hr': 0.8, weekly: 0.6 },
        },
        modes: {} as import('../../src/core/types.js').ResolvedConfig['modes'],
        language: 'en', projectName: 'test', projectRoot: '/tmp/test', version: '0.1.0',
      });

      const brainError = new (BrainError as unknown as new (msg: string, phase?: string) => Error & { phase?: string })('spawn failed', 'SPAWN');
      let rejectRun!: (err: Error) => void;
      const runPromise = new Promise<never>((_, reject) => { rejectRun = reject; });
      vi.mocked(runSprint).mockReturnValue(runPromise);

      const result = await mock.tools.get('deckent_start')!.handler({ autoApprove: false });
      const parsed = JSON.parse(result.content[0]!.text);
      const data = parsed.data ?? parsed;

      // Returns immediately with RUNNING
      expect(data.success).toBe(true);
      expect(data.status).toBe('RUNNING');

      // Reject in background
      rejectRun(brainError);
      await new Promise(r => setTimeout(r, 10));

      // writeJobState should have been called with FAILED and phase info
      expect(vi.mocked(writeJobState)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: 'FAILED',
          error: expect.stringContaining('Sprint failed at phase SPAWN'),
        }),
      );
    });

    it('handles non-Error thrown values in loadConfig', async () => {
      const { registerStartTool } = await import('../../src/mcp/tools/start.js');
      const mock = createMockServer();
      registerStartTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(loadConfig).mockRejectedValue('string error');

      const result = await mock.tools.get('deckent_start')!.handler({ autoApprove: false });
      const parsed = JSON.parse(result.content[0]!.text);
      const data = parsed.data ?? parsed;

      expect(data.success).toBe(false);
      expect(data.error).toBe(true);
      expect(data.message).toBe('string error');
      expect(result.isError).toBe(true);
    });
  });

  // ─── directives.ts: empty content edge case ───────────────────────
  describe('deckent_set_directives — empty content', () => {
    it('returns taskCount 0 when content has no task headers', async () => {
      const { registerSetDirectivesTool } = await import('../../src/mcp/tools/directives.js');
      const mock = createMockServer();
      registerSetDirectivesTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const result = await mock.tools.get('deckent_set_directives')!.handler({ content: '' });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.success).toBe(true);
      expect(parsed.taskCount).toBe(0);
    });

    it('returns taskCount 0 for content without matching headers', async () => {
      const { registerSetDirectivesTool } = await import('../../src/mcp/tools/directives.js');
      const mock = createMockServer();
      registerSetDirectivesTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const result = await mock.tools.get('deckent_set_directives')!.handler({ content: '# Just a title\nSome description without tasks.' });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.success).toBe(true);
      expect(parsed.taskCount).toBe(0);
    });
  });

  // ─── retro.ts: empty retro content ────────────────────────────────
  describe('deckent_retro — empty content', () => {
    it('returns null when retro file exists but is empty', async () => {
      const { registerRetroTool } = await import('../../src/mcp/tools/retro.js');
      const mock = createMockServer();
      registerRetroTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('');

      const result = await mock.tools.get('deckent_retro')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.content).toBeNull();
    });
  });
});
