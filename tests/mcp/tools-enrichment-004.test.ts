import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import type { ResolvedConfig, Task } from '../../src/core/types.js';
import { SprintStatus, SprintPhase, TaskStatus } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../src/core/utils.js', () => ({
  countBrainLines: vi.fn().mockReturnValue(100),
  ensureDeckentImport: vi.fn(),
}));

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

import { loadConfig } from '../../src/core/config.js';
import { readContext, checkUsage, adjustSprintSize, planSprint, runSprint } from '../../src/orchestra/brain.js';
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
    brain_model: 'opus',
    default_model: 'sonnet',
    haiku_allowed: true,
    usage_thresholds: { '5hr': 0.8, weekly: 0.6 },
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

    expect(parsed.estimatedModels).toBeDefined();
    expect(typeof parsed.estimatedModels.opus).toBe('number');
    expect(typeof parsed.estimatedModels.sonnet).toBe('number');
    expect(typeof parsed.estimatedModels.haiku).toBe('number');
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

  function makeTask(id: string, model: 'opus' | 'sonnet' | 'haiku' = 'sonnet'): Task {
    return {
      id, title: `Task ${id}`, description: '', model, effort: 'normal', priority: 'NORMAL',
      reason: '', scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [], goNogo: { testsPass: true, coverageMin: 80 }, status: TaskStatus.PENDING,
    };
  }

  it('enriched response has waveBreakdown field', async () => {
    const { registerPlanTool } = await import('../../src/mcp/tools/plan.js');
    const mock = createMockServer();
    registerPlanTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(readContext).mockReturnValue(baseContext);
    vi.mocked(checkUsage).mockReturnValue({ fiveHr: 0.3, weekly: 0.2 });
    vi.mocked(adjustSprintSize).mockReturnValue({ size: 'full', maxWorkers: 8, modelConstraint: null, reason: 'OK' });
    vi.mocked(planSprint).mockReturnValue({
      id: 'sprint-022', number: 22, status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
      tasks: [makeTask('1'), makeTask('2')], workers: [],
    });

    const result = await mock.tools.get('deckent_plan')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.waveBreakdown).toBeDefined();
    expect(typeof parsed.waveBreakdown).toBe('object');
    expect(parsed.waveBreakdown.wave1).toBe(2);
  });

  it('12 tasks with maxWorkers=8 → wave1=8, wave2=4', async () => {
    const { registerPlanTool } = await import('../../src/mcp/tools/plan.js');
    const mock = createMockServer();
    registerPlanTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(readContext).mockReturnValue(baseContext);
    vi.mocked(checkUsage).mockReturnValue({ fiveHr: 0.3, weekly: 0.2 });
    vi.mocked(adjustSprintSize).mockReturnValue({ size: 'full', maxWorkers: 8, modelConstraint: null, reason: 'OK' });
    vi.mocked(planSprint).mockReturnValue({
      id: 'sprint-022', number: 22, status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
      tasks: Array.from({ length: 12 }, (_, i) => makeTask(String(i + 1))), workers: [],
    });

    const result = await mock.tools.get('deckent_plan')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.waveBreakdown.wave1).toBe(8);
    expect(parsed.waveBreakdown.wave2).toBe(4);
  });

  it('enriched response has modelDistribution field', async () => {
    const { registerPlanTool } = await import('../../src/mcp/tools/plan.js');
    const mock = createMockServer();
    registerPlanTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(readContext).mockReturnValue(baseContext);
    vi.mocked(checkUsage).mockReturnValue({ fiveHr: 0.3, weekly: 0.2 });
    vi.mocked(adjustSprintSize).mockReturnValue({ size: 'full', maxWorkers: 8, modelConstraint: null, reason: 'OK' });
    vi.mocked(planSprint).mockReturnValue({
      id: 'sprint-022', number: 22, status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
      tasks: [makeTask('1', 'opus'), makeTask('2', 'haiku'), makeTask('3', 'opus')], workers: [],
    });

    const result = await mock.tools.get('deckent_plan')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.modelDistribution).toBeDefined();
    expect(parsed.modelDistribution.opus).toBe(2);
    expect(parsed.modelDistribution.haiku).toBe(1);
  });

  it('riskAssessment is low for 0-3 tasks', async () => {
    const { registerPlanTool } = await import('../../src/mcp/tools/plan.js');
    const mock = createMockServer();
    registerPlanTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(readContext).mockReturnValue(baseContext);
    vi.mocked(checkUsage).mockReturnValue({ fiveHr: 0.3, weekly: 0.2 });
    vi.mocked(adjustSprintSize).mockReturnValue({ size: 'full', maxWorkers: 8, modelConstraint: null, reason: 'OK' });
    vi.mocked(planSprint).mockReturnValue({
      id: 'sprint-022', number: 22, status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
      tasks: [makeTask('1'), makeTask('2')], workers: [],
    });

    const result = await mock.tools.get('deckent_plan')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.riskAssessment).toBe('low');
  });

  it('riskAssessment is high for 9+ tasks', async () => {
    const { registerPlanTool } = await import('../../src/mcp/tools/plan.js');
    const mock = createMockServer();
    registerPlanTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(readContext).mockReturnValue(baseContext);
    vi.mocked(checkUsage).mockReturnValue({ fiveHr: 0.3, weekly: 0.2 });
    vi.mocked(adjustSprintSize).mockReturnValue({ size: 'full', maxWorkers: 8, modelConstraint: null, reason: 'OK' });
    vi.mocked(planSprint).mockReturnValue({
      id: 'sprint-022', number: 22, status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
      tasks: Array.from({ length: 12 }, (_, i) => makeTask(String(i + 1))), workers: [],
    });

    const result = await mock.tools.get('deckent_plan')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.riskAssessment).toBe('high');
  });

  it('existing fields (sprintId, tasks, recommendation) preserved', async () => {
    const { registerPlanTool } = await import('../../src/mcp/tools/plan.js');
    const mock = createMockServer();
    registerPlanTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(readContext).mockReturnValue(baseContext);
    vi.mocked(checkUsage).mockReturnValue({ fiveHr: 0.3, weekly: 0.2 });
    vi.mocked(adjustSprintSize).mockReturnValue({ size: 'full', maxWorkers: 8, modelConstraint: null, reason: 'OK' });
    vi.mocked(planSprint).mockReturnValue({
      id: 'sprint-022', number: 22, status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
      tasks: [], workers: [], reasoning: 'Test', planningMode: 'ai',
    });

    const result = await mock.tools.get('deckent_plan')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.sprintId).toBe('sprint-022');
    expect(parsed.sprintNumber).toBe(22);
    expect(parsed.recommendation).toBeDefined();
    expect(parsed._enriched).toBeDefined();
    expect(parsed._enriched.summary).toBeTruthy();
  });
});

// ─── start enrichment tests ───────────────────────────────────────────

describe('MCP Enrichment 004 — start', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('enriched response has activeWorkers field', async () => {
    const { registerStartTool } = await import('../../src/mcp/tools/start.js');
    const mock = createMockServer();
    registerStartTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(runSprint).mockReturnValue(new Promise(() => {}));

    const result = await mock.tools.get('deckent_start')!.handler({ autoApprove: false });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.activeWorkers).toBeDefined();
    expect(typeof parsed.activeWorkers).toBe('number');
    expect(parsed.activeWorkers).toBe(0);
  });

  it('enriched response has queuedTasks field', async () => {
    const { registerStartTool } = await import('../../src/mcp/tools/start.js');
    const mock = createMockServer();
    registerStartTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(runSprint).mockReturnValue(new Promise(() => {}));

    const result = await mock.tools.get('deckent_start')!.handler({ autoApprove: false });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.queuedTasks).toBeDefined();
    expect(parsed.queuedTasks).toBe(0);
  });

  it('enriched response has estimatedDuration hint string', async () => {
    const { registerStartTool } = await import('../../src/mcp/tools/start.js');
    const mock = createMockServer();
    registerStartTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(runSprint).mockReturnValue(new Promise(() => {}));

    const result = await mock.tools.get('deckent_start')!.handler({ autoApprove: false });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.estimatedDuration).toBeDefined();
    expect(typeof parsed.estimatedDuration).toBe('string');
    expect(parsed.estimatedDuration.length).toBeGreaterThan(0);
  });

  it('existing fields (success, jobId, status, message) preserved', async () => {
    const { registerStartTool } = await import('../../src/mcp/tools/start.js');
    const mock = createMockServer();
    registerStartTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(runSprint).mockReturnValue(new Promise(() => {}));

    const result = await mock.tools.get('deckent_start')!.handler({ autoApprove: false });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(true);
    expect(parsed.jobId).toMatch(/^sprint-\d+$/);
    expect(parsed.status).toBe('RUNNING');
    expect(parsed.message).toContain('background');
    expect(parsed._enriched).toBeDefined();
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

    expect(parsed.progressBar).toBeDefined();
    expect(typeof parsed.progressBar).toBe('string');
    expect(parsed.progressBar).toContain('█');
    expect(parsed.progressBar).toContain('░');
    expect(parsed.progressBar.length).toBe(10);
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

    expect(parsed.progressBar).toBe('░'.repeat(10));
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

    expect(parsed.progressBar).toBe('█'.repeat(10));
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

    expect(parsed.eta).toBeDefined();
    expect(typeof parsed.eta).toBe('string');
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

    expect(parsed.workerSummary).toBe('3 active');
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

    expect(parsed.alertSummary).toBe('2 alerts');
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

    expect(parsed.alertSummary).toBe('1 alert');
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

    expect(parsed.sprint.id).toBe('sprint-022');
    expect(parsed.job.jobId).toBe('sprint-999');
    expect(parsed._enriched).toBeDefined();
  });
});
