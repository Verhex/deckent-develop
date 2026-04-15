import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { SprintStatus, SprintPhase, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig } from '../../src/core/types.js';

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

vi.mock('../../src/core/utils.js', () => ({
  countBrainLines: vi.fn().mockReturnValue(100),
  ensureDeckentImport: vi.fn(),
  debugLog: vi.fn(),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(),
  readContext: vi.fn(),
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
  buildTaskSummaries: vi.fn(() => []),
}));

vi.mock('../../src/core/provider.js', () => ({
  bootstrapProviders: vi.fn(),
}));

vi.mock('../../src/mcp/helpers/format.js', () => ({
  formatStatusResponse: vi.fn(() => 'mocked summary'),
  formatPlanResponse: vi.fn(() => 'mocked summary'),
  formatStartResponse: vi.fn(() => 'mocked summary'),
  formatDoctorResponse: vi.fn(() => 'mocked doctor summary'),
  formatRetroResponse: vi.fn(() => 'mocked retro summary'),
  formatHistoryResponse: vi.fn(() => 'mocked history summary'),
  formatErrorResponse: vi.fn(() => 'mocked error summary'),
  wrapResponse: vi.fn(<T>(data: T, _summary: string) => data),
}));

import { loadConfig } from '../../src/core/config.js';
import {
  readContext, planSprint, runSprint,
} from '../../src/orchestra/brain.js';
import { analyzeProject } from '../../src/core/analyzer.js';
import { writeJobState, readLatestJobState } from '../../src/mcp/tools/job-runner.js';

// ─── Test via mock server pattern ────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>, ctx?: unknown) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

interface MockServer {
  tools: Map<string, { config: unknown; handler: ToolHandler }>;
  resources: Map<string, { config: unknown; handler: (uri: URL, vars?: unknown) => Promise<unknown> }>;
  registerTool: (name: string, config: unknown, handler: ToolHandler) => void;
  registerResource: (name: string, uri: string, config: unknown, handler: (uri: URL, vars?: unknown) => Promise<unknown>) => void;
}

function createMockServer(): MockServer {
  const tools = new Map<string, { config: unknown; handler: ToolHandler }>();
  const resources = new Map<string, { config: unknown; handler: (uri: URL, vars?: unknown) => Promise<unknown> }>();

  return {
    tools,
    resources,
    registerTool(name: string, config: unknown, handler: ToolHandler) {
      tools.set(name, { config, handler });
    },
    registerResource(name: string, _uri: string, config: unknown, handler: (uri: URL, vars?: unknown) => Promise<unknown>) {
      resources.set(name, { config, handler });
    },
  };
}

// ─── Tool Tests ──────────────────────────────────────────────────────

describe('MCP Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deckent_init', () => {
    it('creates project structure', async () => {
      const { registerInitTool } = await import('../../src/mcp/tools/init.js');
      const mock = createMockServer();
      registerInitTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const tool = mock.tools.get('deckent_init');
      expect(tool).toBeDefined();

      vi.mocked(existsSync).mockReturnValue(false);

      const result = await tool!.handler({ projectName: 'test-project', mode: 'max_plan', language: 'en' });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.success).toBe(true);
      expect(parsed.projectName).toBe('test-project');
      expect(parsed.mode).toBe('max_plan');
      expect(vi.mocked(mkdirSync)).toHaveBeenCalled();
      expect(vi.mocked(writeFileSync)).toHaveBeenCalled();
    });

    it('registers MCP in .claude/settings.json', async () => {
      const { registerInitTool } = await import('../../src/mcp/tools/init.js');
      const mock = createMockServer();
      registerInitTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      await mock.tools.get('deckent_init')!.handler({ projectName: 'test', mode: 'pro_plan', language: 'tr' });

      const settingsWriteCalls = vi.mocked(writeFileSync).mock.calls.filter(
        (c) => String(c[0]).includes('settings.json'),
      );
      expect(settingsWriteCalls.length).toBeGreaterThan(0);

      const settingsContent = JSON.parse(String(settingsWriteCalls[0]![1]));
      expect(settingsContent.mcpServers.deckent.command).toBe('deckent-mcp');
    });
  });

  describe('deckent_set_directives', () => {
    it('writes DIRECTIVES.md and counts tasks', async () => {
      const { registerSetDirectivesTool } = await import('../../src/mcp/tools/directives.js');
      const mock = createMockServer();
      registerSetDirectivesTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const content = '# Sprint 7\n\n## Görev 1: Auth API\nDetails\n\n## Görev 2: Frontend\nDetails\n';
      const result = await mock.tools.get('deckent_set_directives')!.handler({ content });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.success).toBe(true);
      expect(parsed.taskCount).toBe(2);
      expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
        expect.stringContaining('DIRECTIVES.md'),
        content,
        'utf-8',
      );
    });

    it('counts Task N: headers too', async () => {
      const { registerSetDirectivesTool } = await import('../../src/mcp/tools/directives.js');
      const mock = createMockServer();
      registerSetDirectivesTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const content = '## Task 1: A\n## Task 2: B\n## Task 3: C\n';
      const result = await mock.tools.get('deckent_set_directives')!.handler({ content });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.taskCount).toBe(3);
    });
  });

  describe('deckent_plan', () => {
    it('returns planned sprint with tasks', async () => {
      const { registerPlanTool } = await import('../../src/mcp/tools/plan.js');
      const mock = createMockServer();
      registerPlanTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const mockTask: Task = {
        id: '7-001',
        title: 'Auth API',
        description: 'Implement auth',
        model: 'sonnet',
        effort: 'normal',
        priority: 'HIGH',
        reason: 'directive',
        scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
        dependencies: [],
        goNogo: { testsPass: true, coverageMin: 90 },
        status: TaskStatus.PENDING,
      };

      const mockSprint: Sprint = {
        id: 'sprint-007',
        number: 7,
        status: SprintStatus.PLANNING,
        phase: SprintPhase.PLAN,
        tasks: [mockTask],
        workers: [],
      };

      vi.mocked(loadConfig).mockResolvedValue({
        mode: 'max_plan',
        activeModeConfig: {
          max_workers: 8,
          brain_model: 'opus',
          default_model: 'sonnet',
          haiku_allowed: true,

        },
        modes: {} as ResolvedConfig['modes'],
        language: 'en',
        projectName: 'test',
        projectRoot: '/tmp/test',
        version: '0.1.0',
      });

      vi.mocked(readContext).mockReturnValue({
        directives: '## Task 1: Auth',
        memory: '',
        retro: '',
        debt: [],
        patterns: '',
        decisions: '',
        existingTasks: [],
        projectState: { gitStatus: '', fileTree: [] },
      });


      vi.mocked(planSprint).mockReturnValue(mockSprint);

      const result = await mock.tools.get('deckent_plan')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.sprintId).toBe('sprint-007');
      expect(parsed.tasks).toHaveLength(1);
      expect(parsed.tasks[0].title).toBe('Auth API');
      expect(parsed.recommendation.size).toBe('full');
    });

    it('passes mode input to planSprint', async () => {
      const { registerPlanTool } = await import('../../src/mcp/tools/plan.js');
      const mock = createMockServer();
      registerPlanTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(loadConfig).mockResolvedValue({
        mode: 'max_plan',
        activeModeConfig: {
          max_workers: 8, brain_model: 'opus', default_model: 'sonnet',
          haiku_allowed: true,
        },
        modes: {} as ResolvedConfig['modes'],
        language: 'en', projectName: 'test', projectRoot: '/tmp/test', version: '0.1.0',
      });
      vi.mocked(readContext).mockReturnValue({
        directives: '', memory: '', retro: '', debt: [], patterns: '', decisions: '',
        existingTasks: [], projectState: { gitStatus: '', fileTree: [] },
      });

      vi.mocked(planSprint).mockReturnValue({
        id: 'sprint-001', number: 1, status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
        tasks: [], workers: [], reasoning: 'Test reasoning', planningMode: 'structured',
      });

      const result = await mock.tools.get('deckent_plan')!.handler({ mode: 'structured' });
      expect(vi.mocked(planSprint)).toHaveBeenCalledWith(
        expect.any(String), expect.anything(), expect.anything(), expect.anything(),
        expect.objectContaining({ mode: 'structured' }),
      );
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.reasoning).toBe('Test reasoning');
      expect(parsed.planningMode).toBe('structured');
    });
  });

  describe('deckent_start', () => {
    it('returns immediately with jobId and RUNNING status', async () => {
      const { registerStartTool } = await import('../../src/mcp/tools/start.js');
      const mock = createMockServer();
      registerStartTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(loadConfig).mockResolvedValue({
        mode: 'max_plan',
        activeModeConfig: {
          max_workers: 8,
          brain_model: 'opus',
          default_model: 'sonnet',
          haiku_allowed: true,

        },
        modes: {} as ResolvedConfig['modes'],
        language: 'en',
        projectName: 'test',
        projectRoot: '/tmp/test',
        version: '0.1.0',
      });

      // runSprint returns a promise that never resolves during the test
      vi.mocked(runSprint).mockReturnValue(new Promise(() => {}));

      const result = await mock.tools.get('deckent_start')!.handler({ autoApprove: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.success).toBe(true);
      expect(parsed.jobId).toMatch(/^sprint-\d+$/);
      expect(parsed.status).toBe('RUNNING');
      expect(parsed.message).toContain('background');
      expect(result.isError).toBeUndefined();

      // writeJobState should have been called with RUNNING
      expect(vi.mocked(writeJobState)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'RUNNING' }),
      );
    });

    it('writes COMPLETE job state when sprint finishes', async () => {
      const { registerStartTool } = await import('../../src/mcp/tools/start.js');
      const mock = createMockServer();
      registerStartTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const completedSprint: Sprint = {
        id: 'sprint-007',
        number: 7,
        status: SprintStatus.COMPLETE,
        phase: SprintPhase.COMPLETE,
        tasks: [],
        workers: [],
        startedAt: '2026-03-17T10:00:00Z',
        completedAt: '2026-03-17T10:05:00Z',
      };

      vi.mocked(loadConfig).mockResolvedValue({
        mode: 'max_plan',
        activeModeConfig: {
          max_workers: 8,
          brain_model: 'opus',
          default_model: 'sonnet',
          haiku_allowed: true,

        },
        modes: {} as ResolvedConfig['modes'],
        language: 'en',
        projectName: 'test',
        projectRoot: '/tmp/test',
        version: '0.1.0',
      });

      // Use a controllable promise
      let resolveRun!: (sprint: Sprint) => void;
      const runPromise = new Promise<Sprint>((resolve) => { resolveRun = resolve; });
      vi.mocked(runSprint).mockReturnValue(runPromise);

      await mock.tools.get('deckent_start')!.handler({ autoApprove: false });

      // Resolve the sprint in the background
      resolveRun(completedSprint);
      // Allow microtask to process
      await new Promise(r => setTimeout(r, 10));

      expect(vi.mocked(writeJobState)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'COMPLETE', sprintId: 'sprint-007' }),
      );
    });

    it('writes FAILED job state when sprint errors', async () => {
      const { registerStartTool } = await import('../../src/mcp/tools/start.js');
      const mock = createMockServer();
      registerStartTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(loadConfig).mockResolvedValue({
        mode: 'max_plan',
        activeModeConfig: {
          max_workers: 8,
          brain_model: 'opus',
          default_model: 'sonnet',
          haiku_allowed: true,

        },
        modes: {} as ResolvedConfig['modes'],
        language: 'en',
        projectName: 'test',
        projectRoot: '/tmp/test',
        version: '0.1.0',
      });

      let rejectRun!: (err: Error) => void;
      const runPromise = new Promise<Sprint>((_, reject) => { rejectRun = reject; });
      vi.mocked(runSprint).mockReturnValue(runPromise);

      await mock.tools.get('deckent_start')!.handler({ autoApprove: false });

      // Reject the sprint in the background
      rejectRun(new Error('plan failed'));
      await new Promise(r => setTimeout(r, 10));

      expect(vi.mocked(writeJobState)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'FAILED', error: 'plan failed' }),
      );
    });

    it('returns error when loadConfig fails', async () => {
      const { registerStartTool } = await import('../../src/mcp/tools/start.js');
      const mock = createMockServer();
      registerStartTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(loadConfig).mockRejectedValue(new Error('config not found'));

      const result = await mock.tools.get('deckent_start')!.handler({ autoApprove: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toContain('config not found');
      expect(result.isError).toBe(true);
    });
  });

  describe('deckent_status', () => {
    it('returns dashboard state when active', async () => {
      const { registerStatusTool } = await import('../../src/mcp/tools/status.js');
      const mock = createMockServer();
      registerStatusTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const dashState = { sprint: { id: 'sprint-007' }, agents: [], progress: { done: 1, total: 3 } };
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(dashState));
      vi.mocked(readLatestJobState).mockReturnValue(null);

      const result = await mock.tools.get('deckent_status')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.sprint.id).toBe('sprint-007');
      expect(parsed.job).toBeNull();
    });

    it('returns inactive when no dashboard', async () => {
      const { registerStatusTool } = await import('../../src/mcp/tools/status.js');
      const mock = createMockServer();
      registerStatusTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readLatestJobState).mockReturnValue(null);

      const result = await mock.tools.get('deckent_status')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.active).toBe(false);
      expect(parsed.job).toBeNull();
    });

    it('includes latest job state in response', async () => {
      const { registerStatusTool } = await import('../../src/mcp/tools/status.js');
      const mock = createMockServer();
      registerStatusTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readLatestJobState).mockReturnValue({
        jobId: 'sprint-1234567890',
        status: 'RUNNING',
        startedAt: '2026-03-18T10:00:00Z',
      });

      const result = await mock.tools.get('deckent_status')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.job).toBeDefined();
      expect(parsed.job.jobId).toBe('sprint-1234567890');
      expect(parsed.job.status).toBe('RUNNING');
    });
  });

  describe('deckent_doctor', () => {
    it('returns doctor checks', async () => {
      const { registerDoctorTool } = await import('../../src/mcp/tools/doctor.js');
      const mock = createMockServer();
      registerDoctorTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      // Mock spawnSync for doctor checks (Node, git, tmux, claude)
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: 'v20.0.0',
        stderr: '',
        pid: 1,
        output: [],
        signal: null,
      });
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# Learned Patterns\n');
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = await mock.tools.get('deckent_doctor')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed).toHaveProperty('ok');
      expect(parsed).toHaveProperty('checks');
      expect(Array.isArray(parsed.checks)).toBe(true);
    });
  });

  describe('deckent_retro', () => {
    it('returns retro content when file exists', async () => {
      const { registerRetroTool } = await import('../../src/mcp/tools/retro.js');
      const mock = createMockServer();
      registerRetroTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# Retrospective\n- Learned X');

      const result = await mock.tools.get('deckent_retro')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.content).toContain('Retrospective');
    });

    it('returns null when no retro file', async () => {
      const { registerRetroTool } = await import('../../src/mcp/tools/retro.js');
      const mock = createMockServer();
      registerRetroTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const result = await mock.tools.get('deckent_retro')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.content).toBeNull();
    });
  });

  describe('deckent_analyze_project', () => {
    it('returns project analysis JSON', async () => {
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
        size: 'medium',
        methodology: 'sprint',
      });

      const result = await mock.tools.get('deckent_analyze_project')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.framework).toBe('next');
      expect(parsed.language).toBe('typescript');
      expect(parsed.methodology).toBe('sprint');
      expect(parsed.fileCount).toBe(120);
    });

    it('has readOnlyHint annotation', async () => {
      const { registerAnalyzeTool } = await import('../../src/mcp/tools/analyze.js');
      const mock = createMockServer();
      registerAnalyzeTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      const tool = mock.tools.get('deckent_analyze_project');
      expect(tool).toBeDefined();
      const config = tool!.config as { annotations?: { readOnlyHint?: boolean } };
      expect(config.annotations?.readOnlyHint).toBe(true);
    });
  });

  describe('deckent_history', () => {
    it('returns sprint logs', async () => {
      const { registerHistoryTool } = await import('../../src/mcp/tools/history.js');
      const mock = createMockServer();
      registerHistoryTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(
        ['sprint-005.md', 'sprint-006.md', 'sprint-007.md'] as unknown as ReturnType<typeof readdirSync>,
      );
      vi.mocked(readFileSync).mockReturnValue('# Sprint 007\nTasks: 3/3');

      const result = await mock.tools.get('deckent_history')!.handler({ last: 2 });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.sprints).toHaveLength(2);
      expect(parsed.sprints[0].id).toBe('sprint-006');
      expect(parsed.sprints[1].id).toBe('sprint-007');
    });

    it('returns empty array when no sprints dir', async () => {
      const { registerHistoryTool } = await import('../../src/mcp/tools/history.js');
      const mock = createMockServer();
      registerHistoryTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const result = await mock.tools.get('deckent_history')!.handler({ last: 5 });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.sprints).toHaveLength(0);
    });
  });

  describe('deckent_sync', () => {
    it('syncs CLAUDE.md and AGENTS.md when DECKENT.md exists', async () => {
      const { registerSyncTool } = await import('../../src/mcp/tools/sync.js');
      const mock = createMockServer();
      registerSyncTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(true);

      const result = await mock.tools.get('deckent_sync')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.success).toBe(true);
      expect(parsed.synced).toContain('CLAUDE.md');
      expect(parsed.synced).toContain('AGENTS.md');
    });

    it('returns error when DECKENT.md is missing', async () => {
      const { registerSyncTool } = await import('../../src/mcp/tools/sync.js');
      const mock = createMockServer();
      registerSyncTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(existsSync).mockReturnValue(false);

      const result = await mock.tools.get('deckent_sync')!.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toContain('DECKENT.md not found');
      expect(result.isError).toBe(true);
    });
  });
});
