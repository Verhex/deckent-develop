import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SprintStatus, SprintPhase } from '../../../src/core/types.js';
import type { Sprint, ResolvedConfig } from '../../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../../src/core/config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(),
  BrainError: class BrainError extends Error {
    phase?: string;
    constructor(msg: string, phase?: string) {
      super(msg);
      this.name = 'BrainError';
      this.phase = phase;
    }
  },
}));

vi.mock('../../../src/mcp/tools/job-runner.js', () => ({
  writeJobState: vi.fn(),
  buildTaskSummaries: vi.fn(() => []),
}));

vi.mock('../../../src/core/provider.js', () => ({
  bootstrapProviders: vi.fn(),
}));

vi.mock('../../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((toolName, response, _ctx) => ({
    ...response,
    _enriched: {
      summary: 'Sprint started.',
      hints: ['`deckent status --watch` ile izleyin'],
      timestamp: '2026-03-20T00:00:00.000Z',
    },
  })),
}));

vi.mock('../../../src/mcp/helpers/format.js', () => ({
  formatStartResponse: vi.fn(() => 'mocked summary'),
  formatErrorResponse: vi.fn(() => 'mocked error summary'),
  wrapResponse: vi.fn(<T>(data: T, _summary: string) => data),
}));

import { loadConfig } from '../../../src/core/config.js';
import { runSprint } from '../../../src/orchestra/brain.js';
import { writeJobState } from '../../../src/mcp/tools/job-runner.js';
import { enrichResponse } from '../../../src/mcp/helpers/enrich.js';

// ─── Mock Server Factory ─────────────────────────────────────────────────────

type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

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

const MOCK_CONFIG: ResolvedConfig = {
  mode: 'max_plan',
  activeModeConfig: {
    max_workers: 8,
    brain_model: 'opus',
    default_model: 'sonnet',
    haiku_allowed: false,
  },
  modes: {} as ResolvedConfig['modes'],
  language: 'en',
  projectName: 'test',
  projectRoot: '/tmp/test',
  version: '0.1.0',
};

const MOCK_SPRINT: Sprint = {
  id: 'sprint-007',
  number: 7,
  status: SprintStatus.COMPLETE,
  phase: SprintPhase.COMPLETE,
  tasks: [],
  workers: [],
  startedAt: '2026-03-20T10:00:00.000Z',
  completedAt: '2026-03-20T10:30:00.000Z',
};

async function getStartTool() {
  const { registerStartTool } = await import('../../../src/mcp/tools/start.js');
  const server = createMockServer();
  registerStartTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  const tool = server.tools.get('deckent_start');
  expect(tool).toBeDefined();
  return tool!;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('registerStartTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(runSprint).mockReturnValue(new Promise(() => {})); // never resolves by default
  });

  // ── Tool Registration ────────────────────────────────────────────────────

  describe('tool registration', () => {
    it('registers tool with name deckent_start', async () => {
      const { registerStartTool } = await import('../../../src/mcp/tools/start.js');
      const server = createMockServer();
      registerStartTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      expect(server.tools.has('deckent_start')).toBe(true);
    });

    it('registers tool with schema accepting autoApprove parameter', async () => {
      const { registerStartTool } = await import('../../../src/mcp/tools/start.js');
      const server = createMockServer();
      registerStartTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      const tool = server.tools.get('deckent_start');
      expect(tool).toBeDefined();
      expect(tool!.config).toHaveProperty('inputSchema');
    });
  });

  // ── Background Job Creation ──────────────────────────────────────────────

  describe('background job creation', () => {
    it('returns immediately with jobId matching sprint-<timestamp> format', async () => {
      const tool = await getStartTool();
      const result = await tool.handler({ autoApprove: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.jobId).toMatch(/^sprint-\d+$/);
    });

    it('returns status RUNNING immediately without waiting for sprint', async () => {
      const tool = await getStartTool();
      const result = await tool.handler({ autoApprove: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.status).toBe('RUNNING');
      expect(parsed.success).toBe(true);
    });

    it('writes RUNNING job state via writeJobState immediately', async () => {
      const tool = await getStartTool();
      await tool.handler({ autoApprove: false });

      expect(vi.mocked(writeJobState)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'RUNNING' }),
      );
    });

    it('includes message about background execution', async () => {
      const tool = await getStartTool();
      const result = await tool.handler({ autoApprove: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.message).toContain('background');
    });

    it('does not set isError on successful start', async () => {
      const tool = await getStartTool();
      const result = await tool.handler({ autoApprove: false });

      expect(result.isError).toBeUndefined();
    });
  });

  // ── Job State Tracking ───────────────────────────────────────────────────

  describe('job state tracking', () => {
    it('writes COMPLETE state with sprintId when runSprint resolves', async () => {
      let resolveRun!: (sprint: Sprint) => void;
      vi.mocked(runSprint).mockReturnValue(
        new Promise<Sprint>((resolve) => { resolveRun = resolve; }),
      );

      const tool = await getStartTool();
      await tool.handler({ autoApprove: false });

      resolveRun(MOCK_SPRINT);
      await new Promise((r) => setTimeout(r, 20));

      expect(vi.mocked(writeJobState)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'COMPLETE', sprintId: 'sprint-007' }),
      );
    });

    it('writes COMPLETE state with completedAt timestamp', async () => {
      let resolveRun!: (sprint: Sprint) => void;
      vi.mocked(runSprint).mockReturnValue(
        new Promise<Sprint>((resolve) => { resolveRun = resolve; }),
      );

      const tool = await getStartTool();
      await tool.handler({ autoApprove: false });

      resolveRun(MOCK_SPRINT);
      await new Promise((r) => setTimeout(r, 20));

      expect(vi.mocked(writeJobState)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: 'COMPLETE',
          completedAt: expect.any(String),
        }),
      );
    });

    it('writes FAILED state with error message when runSprint rejects', async () => {
      let rejectRun!: (err: Error) => void;
      vi.mocked(runSprint).mockReturnValue(
        new Promise<Sprint>((_, reject) => { rejectRun = reject; }),
      );

      const tool = await getStartTool();
      await tool.handler({ autoApprove: false });

      rejectRun(new Error('plan phase failed'));
      await new Promise((r) => setTimeout(r, 20));

      expect(vi.mocked(writeJobState)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'FAILED', error: 'plan phase failed' }),
      );
    });

    it('captures BrainError phase info in FAILED state', async () => {
      const { BrainError } = await import('../../../src/orchestra/brain.js');
      let rejectRun!: (err: Error) => void;
      vi.mocked(runSprint).mockReturnValue(
        new Promise<Sprint>((_, reject) => { rejectRun = reject; }),
      );

      const tool = await getStartTool();
      await tool.handler({ autoApprove: false });

      rejectRun(new BrainError('quota exceeded', 'SPAWN'));
      await new Promise((r) => setTimeout(r, 20));

      expect(vi.mocked(writeJobState)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: 'FAILED',
          error: expect.stringContaining('SPAWN'),
        }),
      );
    });
  });

  // ── autoApprove Parameter ────────────────────────────────────────────────

  describe('autoApprove parameter', () => {
    it('passes autoApprove: true to runSprint when set', async () => {
      const tool = await getStartTool();
      await tool.handler({ autoApprove: true });

      expect(vi.mocked(runSprint)).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        expect.objectContaining({ autoApprove: true }),
      );
    });

    it('always passes autoApprove: true to runSprint (IMMUTABLE)', async () => {
      const tool = await getStartTool();
      await tool.handler({ autoApprove: false });

      // autoApprove is hardcoded true — schema param ignored at runtime
      expect(vi.mocked(runSprint)).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        expect.objectContaining({ autoApprove: true }),
      );
    });
  });

  // ── Error Handling ───────────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns error response when loadConfig throws', async () => {
      vi.mocked(loadConfig).mockRejectedValue(new Error('config not found'));

      const tool = await getStartTool();
      const result = await tool.handler({ autoApprove: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toContain('config not found');
      expect(result.isError).toBe(true);
    });

    it('formats BrainError with phase info in error response', async () => {
      const { BrainError } = await import('../../../src/orchestra/brain.js');
      vi.mocked(loadConfig).mockRejectedValue(new BrainError('tmux not found', 'SPAWN'));

      const tool = await getStartTool();
      const result = await tool.handler({ autoApprove: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toContain('SPAWN');
      expect(result.isError).toBe(true);
    });

    it('does not call runSprint when loadConfig fails', async () => {
      vi.mocked(loadConfig).mockRejectedValue(new Error('no config'));

      const tool = await getStartTool();
      await tool.handler({ autoApprove: false });

      expect(vi.mocked(runSprint)).not.toHaveBeenCalled();
    });
  });

  // ── Enriched Response ────────────────────────────────────────────────────

  describe('enriched response', () => {
    it('calls enrichResponse with start tool name', async () => {
      const tool = await getStartTool();
      await tool.handler({ autoApprove: false });

      expect(vi.mocked(enrichResponse)).toHaveBeenCalledWith(
        'start',
        expect.any(Object),
      );
    });

    it('response includes _enriched metadata', async () => {
      const tool = await getStartTool();
      const result = await tool.handler({ autoApprove: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed._enriched).toBeDefined();
      expect(parsed._enriched.summary).toBeDefined();
      expect(parsed._enriched.hints).toBeDefined();
    });
  });
});
