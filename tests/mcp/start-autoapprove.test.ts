/**
 * MCP deckent_start — autoApprove parity tests (Sprint 189 T-009)
 *
 * Verifies that the MCP start tool:
 *   - Exposes autoApprove in its inputSchema with default false (CLI parity).
 *   - Flows the caller-supplied autoApprove value through to the detached
 *     sprint runner's IPC config file (previously hardcoded to true,
 *     which made the schema default a dead-letter).
 *   - Default (no autoApprove) writes runnerConfig.autoApprove = false.
 *   - Explicit autoApprove=true writes runnerConfig.autoApprove = true.
 *   - autoApprove flag does not affect cost-gate evaluation (independent
 *     concerns — kept separate so over-budget runs still need
 *     acknowledgeCost regardless of autoApprove).
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
  resolveBrainModel: () => 'claude-sonnet-5',
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
  ProviderError: class ProviderError extends Error {},
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
  enrichResponse: vi.fn((_toolName, response) => ({ ...response })),
}));

vi.mock('../../src/mcp/helpers/format.js', () => ({
  formatStartResponse: vi.fn(() => 'mocked summary'),
  formatErrorResponse: vi.fn(() => 'mocked error summary'),
  wrapResponse: vi.fn(<T>(data: T) => data),
}));

import { writeFileSync } from 'node:fs';
import { loadConfig } from '../../src/core/config.js';
import { planSprint } from '../../src/orchestra/brain.js';
import { evaluateCostGate } from '../../src/core/cost-gate.js';
import type { SprintCostEstimate } from '../../src/core/cost-calculator.js';

// ─── Fixtures ───────────────────────────────────────────────────────

type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

interface MockServer {
  tools: Map<string, { config: { inputSchema: unknown }; handler: ToolHandler }>;
  registerTool: (name: string, config: { inputSchema: unknown }, handler: ToolHandler) => void;
}

function createMockServer(): MockServer {
  const tools = new Map<string, { config: { inputSchema: unknown }; handler: ToolHandler }>();
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
  id: 'sprint-autoapprove-test',
  number: 999,
  status: SprintStatus.PLANNING,
  phase: SprintPhase.PLANNING,
  tasks: [
    {
      id: '999-001',
      title: 'mock',
      description: 'mock task',
      model: 'claude-opus-4-8',
      effort: 'low',
      priority: 'NORMAL',
      reason: 'test',
      scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      status: 'PENDING',
      sprintId: 'sprint-autoapprove-test',
      createdAt: '2026-05-22T00:00:00.000Z',
    },
  ],
  workers: [],
  startedAt: '2026-05-22T00:00:00.000Z',
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

/**
 * Find the runnerConfig JSON written to the IPC dir and parse it. The
 * sprint-runner-entry layout writes `<jobId>-ipc/config.json` under
 * `.deckent/`. Returns null if no config file was written (e.g. the
 * handler errored before the fork).
 */
function readRunnerConfigFromMock(): { autoApprove?: boolean; jobId?: string } | null {
  const calls = vi.mocked(writeFileSync).mock.calls as Array<[unknown, unknown, unknown?]>;
  const ipcCall = calls.find(([path]) =>
    typeof path === 'string' && path.includes('-ipc') && path.endsWith('config.json'),
  );
  if (!ipcCall) return null;
  const body = ipcCall[1];
  if (typeof body !== 'string') return null;
  try {
    return JSON.parse(body) as { autoApprove?: boolean; jobId?: string };
  } catch {
    return null;
  }
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('deckent_start — autoApprove parity (Sprint 189 T-009)', () => {
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
    vi.mocked(evaluateCostGate).mockReturnValue({
      ok: true,
      estimate: fakeEstimate(),
      autoConfirm: true,
      autoConfirmThresholdUsd: 2,
      overrideApplied: false,
    });
    sandboxRoot = mkdtempSync(join(tmpdir(), 'deckent-start-autoapprove-test-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(sandboxRoot);
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    // node:fs/promises is NOT vi.mock'd here (only sync node:fs is) — this
    // really cleans up; the stubbed sync rmSync would silently no-op.
    await rm(sandboxRoot, { recursive: true, force: true });
  });

  describe('schema parity', () => {
    it('inputSchema exposes autoApprove (CLI/MCP parity — ADR-022-V2)', async () => {
      const tool = await getStartTool();
      const shape = (tool.config.inputSchema as unknown as { shape?: Record<string, unknown> }).shape ?? {};
      expect(Object.keys(shape)).toContain('autoApprove');
    });

    it('autoApprove schema validates without explicit input (default applies) and accepts explicit true', async () => {
      const tool = await getStartTool();
      const schema = tool.config.inputSchema as {
        parse: (input: unknown) => Record<string, unknown>;
      };
      // Zod default kicks in when the key is omitted.
      const parsed = schema.parse({});
      expect(parsed.autoApprove).toBe(false);
      const parsedExplicit = schema.parse({ autoApprove: true });
      expect(parsedExplicit.autoApprove).toBe(true);
    });
  });

  describe('runner config — autoApprove flows through', () => {
    it('default call (no autoApprove) writes runnerConfig.autoApprove = false', async () => {
      const tool = await getStartTool();
      const result = await tool.handler({});

      // Sanity: the start succeeded so we reached the fork step
      expect(result.isError).toBeUndefined();

      const runnerConfig = readRunnerConfigFromMock();
      expect(runnerConfig).not.toBeNull();
      expect(runnerConfig!.autoApprove).toBe(false);
    });

    it('explicit autoApprove=false writes runnerConfig.autoApprove = false', async () => {
      const tool = await getStartTool();
      await tool.handler({ autoApprove: false });

      const runnerConfig = readRunnerConfigFromMock();
      expect(runnerConfig).not.toBeNull();
      expect(runnerConfig!.autoApprove).toBe(false);
    });

    it('explicit autoApprove=true writes runnerConfig.autoApprove = true (opt-in old behavior)', async () => {
      const tool = await getStartTool();
      await tool.handler({ autoApprove: true });

      const runnerConfig = readRunnerConfigFromMock();
      expect(runnerConfig).not.toBeNull();
      expect(runnerConfig!.autoApprove).toBe(true);
    });
  });

  describe('autoApprove orthogonal to cost gate', () => {
    it('autoApprove=true does not bypass cost gate (acknowledgeCost still required for over-budget)', async () => {
      vi.mocked(evaluateCostGate).mockReturnValue({
        ok: false,
        reason: 'COST_GATE_EXCEEDED',
        estimate: fakeEstimate(),
        estimatedUsd: 50,
        budgetUsd: 5,
        message: 'over budget',
      });

      const tool = await getStartTool();
      const result = await tool.handler({ autoApprove: true });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.code).toBe('COST_GATE_EXCEEDED');
    });

    it('autoApprove=true still passes through when cost gate accepts (composability)', async () => {
      const tool = await getStartTool();
      const result = await tool.handler({ autoApprove: true });

      expect(result.isError).toBeUndefined();
      const runnerConfig = readRunnerConfigFromMock();
      expect(runnerConfig!.autoApprove).toBe(true);
    });
  });
});
