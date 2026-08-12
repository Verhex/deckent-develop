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
  rmSync: vi.fn(),
  realpathSync: Object.assign(vi.fn((path: string) => path), {
    native: vi.fn((path: string) => path),
  }),
  lstatSync: vi.fn((path: string) => ({
    isSymbolicLink: () => false,
    isDirectory: () => !/\.(?:md|json)$/i.test(path),
    isFile: () => /\.(?:md|json)$/i.test(path),
  })),
}));

// fork() must be stubbed to prevent registerStartTool from spawning real
// detached children + leaking .deckent/sprint-<timestamp>-ipc/ orphan dirs.
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  fork: vi.fn(() => ({
    on: vi.fn(),
    unref: vi.fn(),
  })),
}));

vi.mock('../../src/core/config.js', () => ({
  readAuthMode: vi.fn().mockResolvedValue('subscription'),
  resolveBrainModel: () => 'claude-sonnet-5',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  resolveEffectiveWorkers: () => 8,
  loadConfig: vi.fn(),
}));

// deckent_retro reads from Memory V2 DB (MemoryStore), NOT a flat file — the
// node:fs mock above does NOT intercept better-sqlite3's native reads, so
// without this the test depended on the dev machine's real .brain/memory.db
// (green local, red CI where the gitignored DB is absent). Mock MemoryStore so
// the retro test is hermetic. getByType/getById return a retro entry; the
// "no retro" test bypasses this via existsSync→false (returns before MemoryStore).
vi.mock('../../src/core/memory-store.js', () => {
  const RETRO = { content: '# Retrospective\n- Learned X', sprint_id: 'sprint-1' };
  return {
    MemoryStore: vi.fn().mockImplementation(() => ({
      getById: vi.fn(() => RETRO),
      getByType: vi.fn(() => [RETRO]),
      search: vi.fn(() => []),
      searchMemory: vi.fn(() => []),
      insert: vi.fn(),
      upsert: vi.fn(),
      getStats: vi.fn(() => ({})),
      close: vi.fn(),
    })),
  };
});

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

vi.mock('../../src/core/provider.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/provider.js')>()),
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

// Authority-first status: status.ts consults the canonical run-status authority +
// persisted read model before trusting .dashboard. Default is "no live run";
// the active-dashboard test overrides readCanonicalRunStatus per-test.
vi.mock('../../src/core/run-status-authority.js', () => ({
  readCanonicalRunStatus: vi.fn(() => ({
    schemaVersion: 1, lifecycle: 'IDLE', active: false, resumable: false,
    sprintId: null, phase: null, status: null, reason: null,
    recoveryCommand: null, finalizeCommand: null, coordinator: 'none', conflicts: [],
  })),
}));

vi.mock('../../src/core/run-status-read-model.js', () => ({
  readCanonicalRunStatusReadModel: vi.fn(() => ({
    schemaVersion: 1, revision: 1, runGeneration: 1, modelDigest: 'digest-test',
    holds: [], providerConcurrency: [], terminalPublication: null, authority: {},
  })),
  runStatusReadModelMatchesAuthority: vi.fn(() => true),
}));

// deckent_plan now delegates to the exact-plan flow service (planRunFlow) instead of
// calling planSprint directly. Mirror its surface: forward to the mocked planSprint
// (same arg order as the real generatePlanPreview call) and derive the topology
// waves + a real sha256 planDigest from the returned sprint.
vi.mock('../../src/orchestra/run-flow-plan-service.js', () => ({
  planRunFlow: vi.fn(async (input: {
    projectRoot: string;
    config: unknown;
    recommendation?: { maxWorkers?: number };
    proposal?: { flowId?: string; revision?: number };
    source?: { brainContext?: unknown };
    previewOptions?: { mode?: string };
  }) => {
    const { planSprint: planSprintMock } = await import('../../src/orchestra/brain.js');
    const sprint = await planSprintMock(
      input.projectRoot,
      input.config as never,
      input.source?.brainContext as never,
      input.recommendation as never,
      { mode: input.previewOptions?.mode } as never,
    );
    const maxWorkers = input.recommendation?.maxWorkers ?? 4;
    const tasks: Array<{ id: string }> = (sprint as { tasks?: Array<{ id: string }> })?.tasks ?? [];
    const waves: Array<{ wave: number; slots: Array<{ taskId: string }> }> = [];
    for (let i = 0; i < tasks.length; i += maxWorkers) {
      waves.push({
        wave: waves.length + 1,
        slots: tasks.slice(i, i + maxWorkers).map(t => ({ taskId: t.id })),
      });
    }
    const { createHash } = await import('node:crypto');
    return {
      flowId: input.proposal?.flowId ?? 'flow-test',
      revision: input.proposal?.revision ?? 1,
      approval: null,
      sprint,
      preview: {
        topology: { waves, configuredMaxWorkers: maxWorkers },
        scopeGateResult: 'skipped',
        topologyGateResult: 'pass',
        planDigestVersion: 2,
      },
      planDigest: createHash('sha256')
        .update(JSON.stringify(tasks.map(t => t.id)))
        .digest('hex'),
    };
  }),
}));

import { loadConfig } from '../../src/core/config.js';
import { readCanonicalRunStatus } from '../../src/core/run-status-authority.js';
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
        model: 'claude-sonnet-5',
        effort: 'normal',
        priority: 'HIGH',
        reason: 'directive',
        scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
        dependencies: [],
        goNogo: {
          goCriteria: 'Auth API targeted tests pass',
          noGoCriteria: 'Auth API targeted tests fail',
          techDebtAcceptable: 'none',
        },
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
          brain_model: 'claude-opus-4-8',
          default_model: 'claude-sonnet-5',
          haiku_allowed: true,

        },
        modes: {} as ResolvedConfig['modes'],
        language: 'en',
        projectName: 'test',
        projectRoot: '/tmp/test',
        version: '0.1.0',
        worker_provider: 'claude',
        spawn_backend: 'docker',
        execution_budget: {
          roles: { worker: { default: { maxTurns: 1 } } },
          landing: { reserve_ratio: 0.25 },
        },
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

      expect(result.isError).not.toBe(true);
      expect(parsed.sprintId).toBe('sprint-007');
      expect(parsed.tasks).toHaveLength(1);
      expect(parsed.tasks[0].title).toBe('Auth API');
      expect(parsed.tasks[0].model).toBe('claude-sonnet-5');
      expect(parsed.recommendation.size).toBe('full');
      expect(parsed.planDigest).toMatch(/^[0-9a-f]{64}$/);
    });

    it('passes mode input to planSprint', async () => {
      const { registerPlanTool } = await import('../../src/mcp/tools/plan.js');
      const mock = createMockServer();
      registerPlanTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

      vi.mocked(loadConfig).mockResolvedValue({
        mode: 'max_plan',
        activeModeConfig: {
          max_workers: 8, brain_model: 'claude-opus-4-8', default_model: 'claude-sonnet-5',
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
    // NOTE: 3 tests removed (2026-04-17, T-143-012 MCP Disconnect Fix).
    // runSprint() is no longer called in the handler's process — the handler
    // now fork()s a detached sprint-runner-entry.js child, so in-process
    // runSprint/writeJobState mocks are invisible and the forked child also
    // fails to spawn under the mock environment. Removed tests covered:
    // "returns immediately with jobId and RUNNING status", "writes COMPLETE
    // job state when sprint finishes", "writes FAILED job state when sprint
    // errors". Equivalent coverage lives in tests/mcp/tools/start.test.ts
    // (background job creation describe) + the error path below. Sprint 144
    // debt: integration test that forks sprint-runner-entry and inspects the
    // IPC config file.

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
      // Live-run authority required for the dashboard projection; sprintId stays
      // null so the .dashboard sprint.id fixture is what status.ts surfaces.
      vi.mocked(readCanonicalRunStatus).mockReturnValue({
        schemaVersion: 1, lifecycle: 'ACTIVE', active: true, resumable: false,
        sprintId: null, phase: 'EXECUTE', status: 'RUNNING', reason: null,
        recoveryCommand: null, finalizeCommand: null, coordinator: 'alive', conflicts: [],
      } as never);

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
      // Explicit no-live-run authority (mockReturnValue from the previous test persists).
      vi.mocked(readCanonicalRunStatus).mockReturnValue({
        schemaVersion: 1, lifecycle: 'IDLE', active: false, resumable: false,
        sprintId: null, phase: null, status: null, reason: null,
        recoveryCommand: null, finalizeCommand: null, coordinator: 'none', conflicts: [],
      } as never);

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
      // Explicit no-live-run authority (independent of sibling-test mock state).
      vi.mocked(readCanonicalRunStatus).mockReturnValue({
        schemaVersion: 1, lifecycle: 'IDLE', active: false, resumable: false,
        sprintId: null, phase: null, status: null, reason: null,
        recoveryCommand: null, finalizeCommand: null, coordinator: 'none', conflicts: [],
      } as never);

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
