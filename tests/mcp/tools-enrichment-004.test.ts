import { describe, it, expect, vi, beforeEach } from 'vitest';
import { modelRegistry } from '../../src/core/model-registry.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import type { ResolvedConfig, Task } from '../../src/core/types.js';
import { SprintStatus, SprintPhase, TaskStatus } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────


// Authority-first status: the tool holds unless a live run authority AND the canonical
// persisted read model exist. Projection cases supply both. (Same note as status-history.)
vi.mock('../src/core/run-status-authority.js', () => ({
  readCanonicalRunStatus: vi.fn(() => ({
    schemaVersion: 1, lifecycle: 'ACTIVE', active: true, resumable: false,
    sprintId: 'sprint-001', phase: 'EXECUTE', status: 'RUNNING', reason: null,
    recoveryCommand: null, finalizeCommand: null, coordinator: 'alive', conflicts: [],
  })),
}));

vi.mock('../src/core/run-status-read-model.js', () => ({
  readCanonicalRunStatusReadModel: vi.fn(() => ({
    schemaVersion: 1, revision: 1, runGeneration: 1, modelDigest: 'digest-test',
    holds: [], providerConcurrency: [], terminalPublication: null, authority: {},
  })),
  runStatusReadModelMatchesAuthority: vi.fn(() => true),
  projectRunStatusReadModelSurface: vi.fn(() => ({ state: 'persisted' })),
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  rmSync: vi.fn(),
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

vi.mock('../../src/core/cost-config-loader.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/cost-config-loader.js')>()),
  initCostConfig: vi.fn(),
  loadCostConfig: vi.fn(() => ({
    _version: '1.0',
    providers: {
      anthropic: {
        enabled: true,
        billing_modes_supported: ['api'],
        default_billing_mode: 'api',
        models: {
          'claude-sonnet-5': {
            input_cost_per_token: 0.000003,
            output_cost_per_token: 0.000015,
            max_input_tokens: 1_000_000,
            enabled: true,
          },
        },
      },
    },
    cost_limits: {
      sprint_max_usd: 5,
      daily_max_usd: 50,
      monthly_max_usd: 500,
      auto_confirm_below_usd: 2,
    },
    update_config: { sources_priority: ['bundled'] },
  })),
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
}));

vi.mock('../../src/core/provider.js', () => ({
  ProviderError: class ProviderError extends Error {},
  bootstrapProviders: vi.fn(),
  providerRegistry: {
    hasProvider: vi.fn(() => false),
  },
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
import { readContext, planSprint, runSprint } from '../../src/orchestra/brain.js';
import { readLatestJobState } from '../../src/mcp/tools/job-runner.js';

// ─── Mock Server ─────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

function createMockServer() {
  const tools = new Map<string, { config: unknown; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name: string, config: unknown, handler: ToolHandler) {
      tools.set(name, { config, handler });
    },
    registerResource() {},
  };
}

// ─── Shared config ───────────────────────────────────────────────────

const baseConfig: ResolvedConfig = {
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
};

const baseContext = {
  directives: '', memory: '', retro: '', debt: [], patterns: '', decisions: '',
  existingTasks: [], projectState: { gitStatus: '', fileTree: [] },
};

// ─── set_directives enrichment tests ────────────────────────────────

describe('MCP Enrichment 004 — set_directives', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('enriched response has breakdown field', async () => {
    const { registerSetDirectivesTool } = await import('../../src/mcp/tools/directives.js');
    const mock = createMockServer();
    registerSetDirectivesTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const content = '## Task 1: Auth Fix\n## Task 2: Sprint History\n## Task 3: UI\n';
    const result = await mock.tools.get('deckent_set_directives')!.handler({ content });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.breakdown).toBeDefined();
    expect(typeof parsed.breakdown.code).toBe('number');
    expect(typeof parsed.breakdown.docs).toBe('number');
    expect(typeof parsed.breakdown.test).toBe('number');
    expect(typeof parsed.breakdown.analysis).toBe('number');
  });

  it('breakdown categorizes verification tasks as docs', async () => {
    const { registerSetDirectivesTool } = await import('../../src/mcp/tools/directives.js');
    const mock = createMockServer();
    registerSetDirectivesTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const content = '## Task 1: Auth Fix\n## Task 2: Planner Fix Verification\n## Task 3: UI\n';
    const result = await mock.tools.get('deckent_set_directives')!.handler({ content });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.breakdown.docs).toBe(1);
    expect(parsed.breakdown.code).toBe(2);
  });

  it('enriched response has estimatedModels field', async () => {
    const { registerSetDirectivesTool } = await import('../../src/mcp/tools/directives.js');
    const mock = createMockServer();
    registerSetDirectivesTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const content = '## Task 1: Fix auth\n## Task 2: Add UI\n';
    const result = await mock.tools.get('deckent_set_directives')!.handler({ content });
    const parsed = JSON.parse(result.content[0]!.text);

    // Keys are the registry's designated model per claude tier, so assert the
    // CONTRACT instead of three literals that go stale every catalog generation
    // (MASTER-PLAN 670 moved claude/premium from Opus 4.8 to Opus 5).
    expect(parsed.estimatedModels).toBeDefined();
    for (const tier of ['premium', 'standard', 'economy'] as const) {
      const designated = modelRegistry.getByProviderAndTier('claude', tier);
      expect(designated).toBeDefined();
      expect(typeof parsed.estimatedModels[designated!.id]).toBe('number');
    }
  });

  it('existing fields (success, taskCount) preserved after enrichment', async () => {
    const { registerSetDirectivesTool } = await import('../../src/mcp/tools/directives.js');
    const mock = createMockServer();
    registerSetDirectivesTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const content = '## Task 1: A\n## Task 2: B\n';
    const result = await mock.tools.get('deckent_set_directives')!.handler({ content });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(true);
    expect(parsed.taskCount).toBe(2);
  });

  it('response includes _enriched meta with summary/hints/timestamp', async () => {
    const { registerSetDirectivesTool } = await import('../../src/mcp/tools/directives.js');
    const mock = createMockServer();
    registerSetDirectivesTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const result = await mock.tools.get('deckent_set_directives')!.handler({ content: '## Task 1: Test\n' });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed._enriched).toBeDefined();
    expect(typeof parsed._enriched.summary).toBe('string');
    expect(Array.isArray(parsed._enriched.hints)).toBe(true);
    expect(new Date(parsed._enriched.timestamp).toISOString()).toBe(parsed._enriched.timestamp);
  });

  it('Görev headers counted in breakdown', async () => {
    const { registerSetDirectivesTool } = await import('../../src/mcp/tools/directives.js');
    const mock = createMockServer();
    registerSetDirectivesTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const content = '## Görev 1: Decay Fix\n## Görev 2: Sprint History\n## Görev 3: Setup Wizard\n';
    const result = await mock.tools.get('deckent_set_directives')!.handler({ content });
    const parsed = JSON.parse(result.content[0]!.text);

    const total = parsed.breakdown.code + parsed.breakdown.docs + parsed.breakdown.test + parsed.breakdown.analysis;
    expect(total).toBe(3);
    expect(parsed.breakdown.docs).toBeGreaterThanOrEqual(1); // Sprint History
  });
});

// ─── plan enrichment tests ────────────────────────────────────────────

describe('MCP Enrichment 004 — plan', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function makeTask(
    id: string,
    model: 'claude-opus-4-8' | 'claude-sonnet-5' | 'claude-haiku-4-5-20251001' = 'claude-sonnet-5',
  ): Task {
    return {
      id, title: `Task ${id}`, description: '', model, effort: 'normal', priority: 'NORMAL',
      reason: '', scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
      status: TaskStatus.PENDING,
    };
  }

  it('enriched response has waveBreakdown field', async () => {
    const { registerPlanTool } = await import('../../src/mcp/tools/plan.js');
    const mock = createMockServer();
    registerPlanTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(readContext).mockReturnValue(baseContext);

    vi.mocked(planSprint).mockReturnValue({
      id: 'sprint-022', number: 22, status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
      tasks: [makeTask('1'), makeTask('2')], workers: [],
    });

    const result = await mock.tools.get('deckent_plan')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    const data = parsed.data ?? parsed;

    expect(data.waveBreakdown).toBeDefined();
    expect(typeof data.waveBreakdown).toBe('object');
    expect(data.waveBreakdown.wave1).toBe(2);
  });

  it('12 tasks with maxWorkers=8 → wave1=8, wave2=4', async () => {
    const { registerPlanTool } = await import('../../src/mcp/tools/plan.js');
    const mock = createMockServer();
    registerPlanTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(readContext).mockReturnValue(baseContext);

    vi.mocked(planSprint).mockReturnValue({
      id: 'sprint-022', number: 22, status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
      tasks: Array.from({ length: 12 }, (_, i) => makeTask(String(i + 1))), workers: [],
    });

    const result = await mock.tools.get('deckent_plan')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    const data = parsed.data ?? parsed;

    expect(data.waveBreakdown.wave1).toBe(8);
    expect(data.waveBreakdown.wave2).toBe(4);
  });

  it('enriched response has modelDistribution field', async () => {
    const { registerPlanTool } = await import('../../src/mcp/tools/plan.js');
    const mock = createMockServer();
    registerPlanTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(readContext).mockReturnValue(baseContext);

    vi.mocked(planSprint).mockReturnValue({
      id: 'sprint-022', number: 22, status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
      tasks: [
        makeTask('1', 'claude-opus-4-8'),
        makeTask('2', 'claude-haiku-4-5-20251001'),
        makeTask('3', 'claude-opus-4-8'),
      ], workers: [],
    });

    const result = await mock.tools.get('deckent_plan')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    const data = parsed.data ?? parsed;

    expect(data.modelDistribution).toBeDefined();
    expect(data.modelDistribution['claude-opus-4-8']).toBe(2);
    expect(data.modelDistribution['claude-haiku-4-5-20251001']).toBe(1);
  });

  it('riskAssessment is low for 0-3 tasks', async () => {
    const { registerPlanTool } = await import('../../src/mcp/tools/plan.js');
    const mock = createMockServer();
    registerPlanTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(readContext).mockReturnValue(baseContext);

    vi.mocked(planSprint).mockReturnValue({
      id: 'sprint-022', number: 22, status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
      tasks: [makeTask('1'), makeTask('2')], workers: [],
    });

    const result = await mock.tools.get('deckent_plan')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    const data = parsed.data ?? parsed;

    expect(data.riskAssessment).toBe('low');
  });

  it('riskAssessment is high for 9+ tasks', async () => {
    const { registerPlanTool } = await import('../../src/mcp/tools/plan.js');
    const mock = createMockServer();
    registerPlanTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(readContext).mockReturnValue(baseContext);

    vi.mocked(planSprint).mockReturnValue({
      id: 'sprint-022', number: 22, status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
      tasks: Array.from({ length: 12 }, (_, i) => makeTask(String(i + 1))), workers: [],
    });

    const result = await mock.tools.get('deckent_plan')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    const data = parsed.data ?? parsed;

    expect(data.riskAssessment).toBe('high');
  });

  it('existing fields (sprintId, tasks, recommendation) preserved', async () => {
    const { registerPlanTool } = await import('../../src/mcp/tools/plan.js');
    const mock = createMockServer();
    registerPlanTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(readContext).mockReturnValue(baseContext);

    vi.mocked(planSprint).mockReturnValue({
      id: 'sprint-022', number: 22, status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
      tasks: [], workers: [], reasoning: 'Test', planningMode: 'ai',
    });

    const result = await mock.tools.get('deckent_plan')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    const data = parsed.data ?? parsed;

    expect(data.sprintId).toBe('sprint-022');
    expect(data.sprintNumber).toBe(22);
    expect(data.recommendation).toBeDefined();
    expect(data._enriched).toBeDefined();
    expect(data._enriched.summary).toBeTruthy();
  });
});

// ─── start enrichment tests ───────────────────────────────────────────

describe('MCP Enrichment 004 — start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readContext).mockReturnValue(baseContext);
    vi.mocked(planSprint).mockReturnValue({
      id: 'sprint-022',
      number: 22,
      status: SprintStatus.PLANNING,
      phase: SprintPhase.PLAN,
      tasks: [{
        id: '022-001',
        title: 'Start fixture',
        description: 'Exercise the enriched start response after real cost admission.',
        model: 'claude-sonnet-5',
        provider: 'claude',
        effort: 'normal',
        priority: 'NORMAL',
        reason: 'MCP enrichment regression',
        scope: { directories: [], filesRead: [], filesWrite: [] },
        dependencies: [],
        goNogo: {
          goCriteria: 'start response is enriched',
          noGoCriteria: 'cost admission is bypassed',
          techDebtAcceptable: 'none',
        },
        status: TaskStatus.PENDING,
      }],
      workers: [],
    });
  });

  it('enriched response has activeWorkers field', async () => {
    const { registerStartTool } = await import('../../src/mcp/tools/start.js');
    const mock = createMockServer();
    registerStartTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(runSprint).mockReturnValue(new Promise(() => {}));

    const result = await mock.tools.get('deckent_start')!.handler({ autoApprove: false });
    const parsed = JSON.parse(result.content[0]!.text);
    const data = parsed.data ?? parsed;

    expect(data.activeWorkers).toBeDefined();
    expect(typeof data.activeWorkers).toBe('number');
    expect(data.activeWorkers).toBe(0);
  });

  it('enriched response has queuedTasks field', async () => {
    const { registerStartTool } = await import('../../src/mcp/tools/start.js');
    const mock = createMockServer();
    registerStartTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(runSprint).mockReturnValue(new Promise(() => {}));

    const result = await mock.tools.get('deckent_start')!.handler({ autoApprove: false });
    const parsed = JSON.parse(result.content[0]!.text);
    const data = parsed.data ?? parsed;

    expect(data.queuedTasks).toBeDefined();
    expect(data.queuedTasks).toBe(0);
  });

  it('enriched response has estimatedDuration hint string', async () => {
    const { registerStartTool } = await import('../../src/mcp/tools/start.js');
    const mock = createMockServer();
    registerStartTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(runSprint).mockReturnValue(new Promise(() => {}));

    const result = await mock.tools.get('deckent_start')!.handler({ autoApprove: false });
    const parsed = JSON.parse(result.content[0]!.text);
    const data = parsed.data ?? parsed;

    expect(data.estimatedDuration).toBeDefined();
    expect(typeof data.estimatedDuration).toBe('string');
    expect(data.estimatedDuration.length).toBeGreaterThan(0);
  });

  it('existing fields (success, jobId, status, message) preserved', async () => {
    const { registerStartTool } = await import('../../src/mcp/tools/start.js');
    const mock = createMockServer();
    registerStartTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(runSprint).mockReturnValue(new Promise(() => {}));

    const result = await mock.tools.get('deckent_start')!.handler({ autoApprove: false });
    const parsed = JSON.parse(result.content[0]!.text);
    const data = parsed.data ?? parsed;

    expect(data.success).toBe(true);
    expect(data.jobId).toMatch(/^sprint-\d+$/);
    expect(data.status).toBe('RUNNING');
    expect(data.message).toContain('background');
    expect(data._enriched).toBeDefined();
  });
});

// ─── status enrichment tests ──────────────────────────────────────────

describe('MCP Enrichment 004 — status', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('enriched response has progressBar field (mixed)', async () => {
    const { registerStatusTool } = await import('../../src/mcp/tools/status.js');
    const mock = createMockServer();
    registerStatusTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const dashState = { sprint: { id: 'sprint-022' }, agents: [], progress: { done: 5, total: 10 }, alerts: [] };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(dashState));
    vi.mocked(readLatestJobState).mockReturnValue(null);

    const result = await mock.tools.get('deckent_status')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    const data = parsed.data ?? parsed;

    expect(data.progressBar).toBeDefined();
    expect(typeof data.progressBar).toBe('string');
    expect(data.progressBar).toContain('█');
    expect(data.progressBar).toContain('░');
    expect(data.progressBar.length).toBe(10);
  });

  it('progressBar is all-empty when done=0', async () => {
    const { registerStatusTool } = await import('../../src/mcp/tools/status.js');
    const mock = createMockServer();
    registerStatusTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const dashState = { sprint: { id: 's' }, agents: [], progress: { done: 0, total: 10 }, alerts: [] };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(dashState));
    vi.mocked(readLatestJobState).mockReturnValue(null);

    const result = await mock.tools.get('deckent_status')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    const data = parsed.data ?? parsed;

    expect(data.progressBar).toBe('░'.repeat(10));
  });

  it('progressBar is all-filled when done=total', async () => {
    const { registerStatusTool } = await import('../../src/mcp/tools/status.js');
    const mock = createMockServer();
    registerStatusTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const dashState = { sprint: { id: 's' }, agents: [], progress: { done: 10, total: 10 }, alerts: [] };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(dashState));
    vi.mocked(readLatestJobState).mockReturnValue(null);

    const result = await mock.tools.get('deckent_status')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    const data = parsed.data ?? parsed;

    expect(data.progressBar).toBe('█'.repeat(10));
  });

  it('enriched response has eta field', async () => {
    const { registerStatusTool } = await import('../../src/mcp/tools/status.js');
    const mock = createMockServer();
    registerStatusTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const dashState = { sprint: { id: 's' }, agents: [], progress: { done: 3, total: 10 }, alerts: [] };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(dashState));
    vi.mocked(readLatestJobState).mockReturnValue(null);

    const result = await mock.tools.get('deckent_status')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    const data = parsed.data ?? parsed;

    expect(data.eta).toBeDefined();
    expect(typeof data.eta).toBe('string');
  });

  it('workerSummary shows correct active count', async () => {
    const { registerStatusTool } = await import('../../src/mcp/tools/status.js');
    const mock = createMockServer();
    registerStatusTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const dashState = {
      sprint: { id: 's' },
      agents: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }],
      progress: { done: 2, total: 5 },
      alerts: [],
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(dashState));
    vi.mocked(readLatestJobState).mockReturnValue(null);

    const result = await mock.tools.get('deckent_status')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    const data = parsed.data ?? parsed;

    expect(data.workerSummary).toBe('3 active');
  });

  it('alertSummary shows correct alert count', async () => {
    const { registerStatusTool } = await import('../../src/mcp/tools/status.js');
    const mock = createMockServer();
    registerStatusTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const dashState = {
      sprint: { id: 's' },
      agents: [],
      progress: { done: 1, total: 3 },
      alerts: [{ msg: 'stale' }, { msg: 'boundary' }],
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(dashState));
    vi.mocked(readLatestJobState).mockReturnValue(null);

    const result = await mock.tools.get('deckent_status')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    const data = parsed.data ?? parsed;

    expect(data.alertSummary).toBe('2 alerts');
  });

  it('singular alert count shows "1 alert"', async () => {
    const { registerStatusTool } = await import('../../src/mcp/tools/status.js');
    const mock = createMockServer();
    registerStatusTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const dashState = { sprint: { id: 's' }, agents: [], progress: { done: 1, total: 3 }, alerts: [{ msg: 'x' }] };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(dashState));
    vi.mocked(readLatestJobState).mockReturnValue(null);

    const result = await mock.tools.get('deckent_status')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    const data = parsed.data ?? parsed;

    expect(data.alertSummary).toBe('1 alert');
  });

  it('existing sprint and job fields preserved after enrichment', async () => {
    const { registerStatusTool } = await import('../../src/mcp/tools/status.js');
    const mock = createMockServer();
    registerStatusTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const dashState = { sprint: { id: 'sprint-022' }, agents: [], progress: { done: 5, total: 10 }, alerts: [] };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(dashState));
    vi.mocked(readLatestJobState).mockReturnValue({ jobId: 'sprint-999', status: 'RUNNING', startedAt: '2026-01-01T00:00:00Z' });

    const result = await mock.tools.get('deckent_status')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    const data = parsed.data ?? parsed;

    expect(data.sprint.id).toBe('sprint-022');
    expect(data.job.jobId).toBe('sprint-999');
    expect(data._enriched).toBeDefined();
  });
});
