/**
 * MCP deckent_start — Cost Gate Integration Tests (Sprint 189 T-008)
 *
 * Verifies that the MCP start tool surfaces COST_GATE_EXCEEDED before any
 * detached sprint runner is forked. The cost gate must:
 *   - Block over-budget runs by default (return isError with payload)
 *   - Bypass the block when acknowledgeCost=true (overrideApplied set)
 *   - Skip the gate entirely when force=true (CLI parity)
 *   - Surface error.code / error.message via the formatErrorResponse pipeline
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const MOCK_SPRINT_PLAN: Sprint = {
  id: 'sprint-cost-test',
  number: 999,
  status: SprintStatus.PLANNING,
  phase: SprintPhase.PLANNING,
  tasks: [
    {
      id: '999-001',
      title: 'mock',
      description: 'mock task',
      model: 'opus',
      effort: 'high',
      priority: 'NORMAL',
      reason: 'test',
      scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      status: 'PENDING',
      sprintId: 'sprint-cost-test',
      createdAt: '2026-05-22T00:00:00.000Z',
    },
  ],
  workers: [],
  startedAt: '2026-05-22T00:00:00.000Z',
};

function fakeEstimate(opts?: { withinBudget?: boolean; cost?: number; budget?: number }): SprintCostEstimate {
  const cost = opts?.cost ?? 0.5;
  const budget = opts?.budget ?? 5;
  return {
    taskCount: 1,
    retryMultiplier: 1.2,
    cacheHitRatio: 0.7,
    perProvider: {},
    totalUncachedInputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    totalOutputTokens: 0,
    totalApiCostUsd: cost,
    subscriptionImpact: {},
    costNaive: cost * 0.7,
    costRealistic: cost,
    costWorstCase: cost * 1.6,
    budgetUsd: budget,
    withinBudget: opts?.withinBudget ?? cost <= budget,
    percentOfBudget: (cost / budget) * 100,
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

describe('deckent_start — cost gate (Sprint 189 T-008)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(planSprint).mockResolvedValue(MOCK_SPRINT_PLAN);
    // Default: cost gate passes
    vi.mocked(evaluateCostGate).mockReturnValue({
      ok: true,
      estimate: fakeEstimate({ withinBudget: true, cost: 0.5 }),
      autoConfirm: true,
      autoConfirmThresholdUsd: 2,
      overrideApplied: false,
    });
  });

  describe('schema parity (acknowledgeCost)', () => {
    it('inputSchema accepts acknowledgeCost flag (CLI/MCP parity)', async () => {
      const tool = await getStartTool();
      const cfg = tool.config as { inputSchema: { shape?: Record<string, unknown> } };
      // Zod schema exposes shape with keys when defined via z.object({...})
      const shape = (cfg.inputSchema as unknown as { shape?: Record<string, unknown> }).shape ?? {};
      expect(Object.keys(shape)).toContain('acknowledgeCost');
    });

    it('inputSchema includes autoApprove (debugging surface, default false for CLI parity)', async () => {
      const tool = await getStartTool();
      const cfg = tool.config as { inputSchema: { shape?: Record<string, unknown> } };
      const shape = (cfg.inputSchema as unknown as { shape?: Record<string, unknown> }).shape ?? {};
      expect(Object.keys(shape)).toContain('autoApprove');
    });
  });

  describe('COST_GATE_EXCEEDED — block by default', () => {
    it('returns isError with COST_GATE_EXCEEDED payload when estimate exceeds budget', async () => {
      vi.mocked(evaluateCostGate).mockReturnValue({
        ok: false,
        reason: 'COST_GATE_EXCEEDED',
        estimate: fakeEstimate({ withinBudget: false, cost: 50, budget: 5 }),
        estimatedUsd: 50,
        budgetUsd: 5,
        message: 'Sprint cost $50.00 exceeds budget $5.00. Override with acknowledgeCost=true.',
      });

      const tool = await getStartTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe(true);
      expect(parsed.code).toBe('COST_GATE_EXCEEDED');
      expect(parsed.estimated).toBe(50);
      expect(parsed.budget).toBe(5);
      expect(parsed.override).toBe('acknowledgeCost');
      expect(parsed.message).toContain('exceeds budget');
    });

    it('does not call writeJobState when cost gate blocks (no sprint spawned)', async () => {
      vi.mocked(evaluateCostGate).mockReturnValue({
        ok: false,
        reason: 'COST_GATE_EXCEEDED',
        estimate: fakeEstimate({ withinBudget: false, cost: 50, budget: 5 }),
        estimatedUsd: 50,
        budgetUsd: 5,
        message: 'over budget',
      });

      const { writeJobState } = await import('../../src/mcp/tools/job-runner.js');
      const tool = await getStartTool();
      await tool.handler({});

      expect(vi.mocked(writeJobState)).not.toHaveBeenCalled();
    });
  });

  describe('acknowledgeCost — explicit override', () => {
    it('passes acknowledgeCost flag through to evaluateCostGate', async () => {
      const tool = await getStartTool();
      await tool.handler({ acknowledgeCost: true });

      expect(vi.mocked(evaluateCostGate)).toHaveBeenCalledWith(
        expect.objectContaining({ acknowledgeCost: true }),
      );
    });

    it('proceeds to spawn when acknowledgeCost=true bypasses an over-budget estimate', async () => {
      vi.mocked(evaluateCostGate).mockReturnValue({
        ok: true,
        estimate: fakeEstimate({ withinBudget: false, cost: 50, budget: 5 }),
        autoConfirm: false,
        autoConfirmThresholdUsd: 2,
        overrideApplied: true,
      });

      const tool = await getStartTool();
      const result = await tool.handler({ acknowledgeCost: true });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBeUndefined();
      expect(parsed.success).toBe(true);
      expect(parsed.status).toBe('RUNNING');
    });
  });

  describe('force — full bypass (CLI parity)', () => {
    it('does not call evaluateCostGate when force=true', async () => {
      const tool = await getStartTool();
      await tool.handler({ force: true });

      expect(vi.mocked(evaluateCostGate)).not.toHaveBeenCalled();
    });

    it('proceeds to spawn even if the estimate would have blocked (force=true)', async () => {
      // Even if evaluateCostGate were called, it would block. force=true must
      // short-circuit the gate entirely.
      vi.mocked(evaluateCostGate).mockReturnValue({
        ok: false,
        reason: 'COST_GATE_EXCEEDED',
        estimate: fakeEstimate({ withinBudget: false, cost: 1000, budget: 5 }),
        estimatedUsd: 1000,
        budgetUsd: 5,
        message: 'huge overrun',
      });

      const tool = await getStartTool();
      const result = await tool.handler({ force: true });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBeUndefined();
      expect(parsed.success).toBe(true);
    });
  });

  describe('happy path — within budget', () => {
    it('passes the cost gate and starts the sprint when estimate is within budget', async () => {
      const tool = await getStartTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBeUndefined();
      expect(parsed.success).toBe(true);
      expect(parsed.jobId).toMatch(/^sprint-\d+$/);
      expect(parsed.status).toBe('RUNNING');
    });
  });

  describe('graceful degradation', () => {
    it('does not block sprint start when planSprint throws (cost gate silently skipped)', async () => {
      vi.mocked(planSprint).mockRejectedValue(new Error('planner unavailable'));

      const tool = await getStartTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBeUndefined();
      expect(parsed.success).toBe(true);
    });
  });
});
