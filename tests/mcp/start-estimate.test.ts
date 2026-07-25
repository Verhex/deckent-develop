/**
 * MCP deckent_start — Sprint Duration Estimate Wire (B11 WIRE)
 *
 * Faithful regression for wiring the dormant `sprint-estimator` into the MCP
 * start response. Before the wire, `deckent_start` returned a fabricated
 * constant `estimatedDuration: '~10-30 minutes'` for every sprint and never
 * surfaced the real estimator output. After the wire, the cost-gate pre-plan is
 * reused to compute `estimateSprintFull(tasks, workers, root)` and the response
 * carries a real `estimatedDurationMin` plus a single-value human string.
 *
 * Pre-fix (hardcoded constant): `estimatedDurationMin` is undefined and
 * `estimatedDuration === '~10-30 minutes'` → the happy-path test FAILS.
 * Post-fix: a real positive estimate is surfaced → it passes.
 *
 * The estimator itself is NOT mocked here — this exercises the real wire seam
 * end-to-end. `.brain/sprints` is gitignored (absent on CI), so the heuristic
 * is deterministic there; assertions are variance-robust so they also hold
 * locally when historical sprint logs blend into the estimate.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SprintStatus, SprintPhase } from '../../src/core/types.js';
import type { Sprint, ResolvedConfig } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    fork: vi.fn(() => ({ on: vi.fn(), unref: vi.fn() })),
  };
});

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

vi.mock('../../src/core/config.js', () => ({
  resolveBrainModel: () => 'claude-sonnet-5',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(),
  readAuthMode: vi.fn().mockResolvedValue('subscription'),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(),
  readContext: vi.fn(() => ({})),
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

vi.mock('../../src/core/provider.js', () => ({
  bootstrapProviders: vi.fn(),
}));

vi.mock('../../src/core/cost-config-loader.js', () => ({
  initCostConfig: vi.fn(),
  loadCostConfig: vi.fn(() => ({
    _version: '1.0',
    providers: {},
    cost_limits: { sprint_max_usd: 5, daily_max_usd: 50, auto_confirm_below_usd: 2 },
    update_config: { sources_priority: ['bundled'] },
  })),
}));

vi.mock('../../src/core/cost-gate.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/cost-gate.js')>('../../src/core/cost-gate.js');
  return {
    ...actual,
    evaluateCostGate: vi.fn(),
  };
});

vi.mock('../../src/mcp/tools/job-runner.js', () => ({
  writeJobState: vi.fn(),
  buildTaskSummaries: vi.fn(() => []),
}));

vi.mock('../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((_toolName, response, _ctx) => ({ ...response })),
}));

vi.mock('../../src/mcp/helpers/format.js', () => ({
  formatStartResponse: vi.fn(() => 'mocked summary'),
  formatErrorResponse: vi.fn((data: { code?: string; message?: string }) =>
    `error: ${data.code ?? ''} ${data.message ?? ''}`,
  ),
  wrapResponse: vi.fn(<T>(data: T) => data),
}));

import { loadConfig } from '../../src/core/config.js';
import { planSprint } from '../../src/orchestra/brain.js';
import { evaluateCostGate } from '../../src/core/cost-gate.js';
import type { SprintCostEstimate } from '../../src/core/cost-calculator.js';

// ─── Test Fixtures ──────────────────────────────────────────────────

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

const MOCK_CONFIG: ResolvedConfig = {
  mode: 'max_plan',
  activeModeConfig: {
    max_workers: 4,
    brain_model: 'claude-opus-4-8',
    default_model: 'claude-sonnet-5',
    haiku_allowed: false,
  },
  modes: {} as ResolvedConfig['modes'],
  language: 'en',
  projectName: 'test',
  projectRoot: '/tmp/test',
  version: '0.1.0',
};

const MOCK_SPRINT_PLAN: Sprint = {
  id: 'sprint-estimate-test',
  number: 998,
  status: SprintStatus.PLANNING,
  phase: SprintPhase.PLANNING,
  tasks: [
    {
      id: '998-001',
      title: 'mock',
      description: 'mock task',
      model: 'claude-opus-4-8',
      effort: 'high',
      priority: 'NORMAL',
      reason: 'test',
      scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      status: 'PENDING',
      sprintId: 'sprint-estimate-test',
      createdAt: '2026-06-22T00:00:00.000Z',
    },
  ],
  workers: [],
  startedAt: '2026-06-22T00:00:00.000Z',
};

function fakeEstimate(): SprintCostEstimate {
  return {
    taskCount: 1,
    retryMultiplier: 1.2,
    cacheHitRatio: 0.7,
    perProvider: {},
    totalUncachedInputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    totalOutputTokens: 0,
    totalApiCostUsd: 0.5,
    subscriptionImpact: {},
    costNaive: 0.35,
    costRealistic: 0.5,
    costWorstCase: 0.8,
    budgetUsd: 5,
    withinBudget: true,
    percentOfBudget: 10,
    warnings: [],
    recommendations: [],
  };
}

async function getStartTool() {
  const { registerStartTool } = await import('../../src/mcp/tools/start.js');
  const server = createMockServer();
  registerStartTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  const tool = server.tools.get('deckent_start');
  expect(tool).toBeDefined();
  return tool!;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('deckent_start — sprint duration estimate wire (B11)', () => {
  // born-480 HERMETIC-RUNSTATE: the handler reads process.cwd() and passes it
  // into isSprintLocked()/cleanOrphanIpcDirs() — real, unmocked fs reads.
  // Redirect to a fresh tmpdir per test so a genuinely-live sprint lock on
  // the real host (same PID namespace as the test runner) can never leak in
  // and flip these success-path assertions into "Sprint already running".
  let sandboxRoot = '';
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(planSprint).mockResolvedValue(MOCK_SPRINT_PLAN);
    // Cost gate passes by default so the handler reaches the startData build.
    vi.mocked(evaluateCostGate).mockReturnValue({
      ok: true,
      estimate: fakeEstimate(),
      autoConfirm: true,
      autoConfirmThresholdUsd: 2,
      overrideApplied: false,
    });
    sandboxRoot = mkdtempSync(join(tmpdir(), 'deckent-start-estimate-test-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(sandboxRoot);
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    // node:fs/promises is NOT vi.mock'd here (only sync node:fs is) — this
    // really cleans up; the stubbed sync rmSync would silently no-op.
    await rm(sandboxRoot, { recursive: true, force: true });
  });

  it('surfaces the REAL sprint-estimator output, not the hardcoded ~10-30 minutes', async () => {
    const tool = await getStartTool();
    const result = await tool.handler({});
    const parsed = JSON.parse(result.content[0]!.text);

    // Wire fired: a real numeric estimate derived from the planned task is present.
    expect(typeof parsed.estimatedDurationMin).toBe('number');
    expect(Number.isFinite(parsed.estimatedDurationMin)).toBe(true);
    expect(parsed.estimatedDurationMin).toBeGreaterThan(0);

    // The fabricated constant is gone; the human string reflects the real value.
    expect(parsed.estimatedDuration).not.toBe('~10-30 minutes');
    expect(typeof parsed.estimatedDuration).toBe('string');
    expect(parsed.estimatedDuration).toMatch(/^~/);
  });

  it('passes the planned tasks through to the estimator (estimate scales with the plan)', async () => {
    // Single opus/high task → non-trivial estimate. An empty plan would yield 0,
    // so a positive value proves the planned tasks reached estimateSprintFull.
    const tool = await getStartTool();
    const single = JSON.parse((await tool.handler({})).content[0]!.text);

    // A heavier two-task plan must estimate at least as long (serial total grows).
    vi.mocked(planSprint).mockResolvedValue({
      ...MOCK_SPRINT_PLAN,
      tasks: [
        ...MOCK_SPRINT_PLAN.tasks,
        { ...MOCK_SPRINT_PLAN.tasks[0]!, id: '998-002' },
      ],
    });
    const doubled = JSON.parse((await tool.handler({})).content[0]!.text);

    expect(doubled.estimatedDurationMin).toBeGreaterThanOrEqual(single.estimatedDurationMin);
    expect(single.estimatedDurationMin).toBeGreaterThan(0);
  });

  it('force acknowledges numeric overrun without bypassing the cost pre-plan or duration evidence', async () => {
    // `force` may acknowledge only a numeric cost overrun. It must not bypass
    // the pre-plan/pricing path, so duration evidence remains plan-derived.
    const tool = await getStartTool();
    const result = await tool.handler({ force: true });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(true);
    expect(parsed.estimatedDuration).toBe('~25 minutes');
    expect(parsed.estimatedDurationMin).toBe(25);
    expect(planSprint).toHaveBeenCalled();
  });
});
