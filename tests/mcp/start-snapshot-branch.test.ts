/**
 * MCP deckent_start — approved-snapshot-consuming branch (TERM-FLOW-UNIFY
 * Sprint-4, 426-001) e2e at the tool-handler level (born-673b, task 427-022).
 *
 * Twin of task 427-021's CLI e2e (tests/cli/start-snapshot-branch.test.ts —
 * that worker died before writing its file; see its .partial-result). Same
 * three branches, same underlying orchestra/run-job-service.ts CAS logic,
 * exercised here through src/mcp/tools/start.ts's registerStartTool handler
 * instead of cli/commands/start.ts's action handler:
 *
 *   1. valid  — flag-on + a CAS-matching approved snapshot -> snapshot-
 *      consuming start (readContext/planSprint NEVER called — no re-plan),
 *      spawnDetachedDeckent invoked with the CLI-parity args, saveRunHandle
 *      persists the handle. Sub-case: a second call against an identical
 *      CAS key is a safe noop-duplicate (spawnDetachedDeckent/saveRunHandle
 *      NOT invoked again).
 *   2. uyuşmazlık — every RunJobError typed-error path (digest mismatch,
 *      flow never approved, stale handle conflict) plus the two upstream
 *      param guards (incomplete flow args, run_flow_v2 disabled) surface as
 *      `isError:true` + a matching `code`, never spawn, never re-plan.
 *   3. flag-off — no flow args at all takes the pre-existing fork-based
 *      legacy path completely unchanged; the flow-only modules are never
 *      touched.
 *
 * Hermetic: run-flow-store.js and detached-start.js are mocked directly
 * (vi.fn()) — no real disk I/O for the snapshot/handle store, no real
 * subprocess spawn. orchestra/run-job-service.js's startApprovedRun is
 * deliberately left UNMOCKED — it is pure (zero I/O, every dependency
 * injected), so exercising the real CAS/idempotency logic here is what
 * makes this an e2e test of the branch rather than a mock-everything unit
 * test of the handler's plumbing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SprintStatus, SprintPhase } from '../../src/core/types.js';
import type { Sprint, ResolvedConfig } from '../../src/core/types.js';
import type { StoredApprovedSnapshot, StoredRunHandleRecord } from '../../src/core/run-flow-store.js';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Legacy (flag-off) branch forks a detached sprint-runner child — stub so no
// real process spawns during the test.
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    fork: vi.fn(() => ({ on: vi.fn(), unref: vi.fn() })),
  };
});

// Legacy branch's ipcDir bookkeeping — stubbed so it never writes under the
// real repo root. NOTE: core/run-flow-store.js is mocked wholesale below
// instead of exercised for real, specifically so it never has to share this
// stub (a real run-flow-store write would silently no-op under it).
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
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(),
  readAuthMode: vi.fn().mockResolvedValue('subscription'),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
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

vi.mock('../../src/mcp/tools/job-runner.js', () => ({
  writeJobState: vi.fn(),
  buildTaskSummaries: vi.fn(() => []),
}));

vi.mock('../../src/core/provider.js', () => ({
  bootstrapProviders: vi.fn(),
  orderedRoleProviders: vi.fn(() => ({ primary: 'claude', fallbacks: [] })),
  ProviderError: class ProviderError extends Error {},
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
  return { ...actual, evaluateCostGate: vi.fn() };
});

vi.mock('../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((_toolName, response: Record<string, unknown>) => ({ ...response })),
}));

vi.mock('../../src/mcp/helpers/format.js', () => ({
  formatStartResponse: vi.fn(() => 'mocked summary'),
  formatErrorResponse: vi.fn((data: { code?: string; message?: string }) =>
    `error: ${data.code ?? ''} ${data.message ?? ''}`,
  ),
  wrapResponse: vi.fn(<T>(data: T) => data),
}));

vi.mock('../../src/core/run-flow-store.js', () => ({
  loadApprovedSnapshot: vi.fn(),
  loadRunHandle: vi.fn(),
  saveRunHandle: vi.fn(),
}));

vi.mock('../../src/cli/helpers/detached-start.js', () => ({
  spawnDetachedDeckent: vi.fn(),
}));

vi.mock('../../src/orchestra/run-flow-decision-service.js', () => ({
  startRunFlow: vi.fn(),
}));

import { loadConfig } from '../../src/core/config.js';
import { readContext, planSprint } from '../../src/orchestra/brain.js';
import { loadApprovedSnapshot, loadRunHandle, saveRunHandle } from '../../src/core/run-flow-store.js';
import { spawnDetachedDeckent } from '../../src/cli/helpers/detached-start.js';
import { startRunFlow } from '../../src/orchestra/run-flow-decision-service.js';
import { fork } from 'node:child_process';
import { evaluateCostGate } from '../../src/core/cost-gate.js';

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

async function getStartTool() {
  const { registerStartTool } = await import('../../src/mcp/tools/start.js');
  const server = createMockServer();
  registerStartTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  const tool = server.tools.get('deckent_start');
  expect(tool).toBeDefined();
  return tool!;
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const BASE_CONFIG: ResolvedConfig = {
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

/** run_flow_v2=true is the only field the handler reads off `terminal` —
 *  the other TerminalConfig fields are irrelevant to this branch. */
const FLOW_ON_CONFIG: ResolvedConfig = {
  ...BASE_CONFIG,
  terminal: { run_flow_v2: true } as unknown as ResolvedConfig['terminal'],
};

const FLOW_OFF_CONFIG: ResolvedConfig = {
  ...BASE_CONFIG,
  terminal: { run_flow_v2: false } as unknown as ResolvedConfig['terminal'],
};

function makeSprint(id = 'flow-sprint-1'): Sprint {
  return {
    id,
    number: 1,
    status: SprintStatus.PLANNING,
    phase: SprintPhase.PLAN,
    tasks: [],
    workers: [],
  };
}

function makeApprovedSnapshot(overrides: Partial<StoredApprovedSnapshot> = {}): StoredApprovedSnapshot {
  return {
    flowId: 'flow-1',
    revision: 1,
    planDigest: 'digest-abc',
    approvedBy: { id: 'alperen' },
    approvedAt: '2026-07-12T00:00:00.000Z',
    sprint: makeSprint(),
    ...overrides,
  };
}

function makeRunHandleRecord(overrides: Partial<StoredRunHandleRecord> = {}): StoredRunHandleRecord {
  return {
    flowId: 'flow-1',
    revision: 1,
    planDigest: 'digest-abc',
    handle: { flowId: 'flow-1', jobId: 'flow-flow-1-r1', logRef: '/fake/log-1.log' },
    startedAt: '2026-07-12T00:01:00.000Z',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('deckent_start — approved-snapshot branch (born-673b)', () => {
  // born-480 HERMETIC-RUNSTATE: the handler reads process.cwd() and feeds it
  // straight into isSprintLocked()/cleanOrphanIpcDirs() (real, unmocked fs
  // reads) — redirect to a fresh tmpdir per test so a genuinely-live sprint
  // lock on the real host can never leak in and flip an assertion.
  let sandboxRoot = '';
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue(FLOW_ON_CONFIG);
    vi.mocked(loadApprovedSnapshot).mockReturnValue(undefined);
    vi.mocked(loadRunHandle).mockReturnValue(undefined);
    vi.mocked(spawnDetachedDeckent).mockReturnValue({ pid: 4242, logPath: '/fake/log.log', flowId: 'flow-1' });
    vi.mocked(startRunFlow).mockImplementation((_root, flowId, options) => {
      options.spawnStart({
        capability: {
          schemaVersion: 1,
          flowId,
          revision: 1,
          planDigest: 'digest-abc',
          generation: 1,
          attemptId: 'attempt-1',
          ownerNonce: 'owner-1',
        },
        sprint: makeSprint(),
        lineage: {} as never,
      });
      return {
        status: 'accepted',
        context: {} as never,
        attempt: { attemptId: 'attempt-1' } as never,
      };
    });
    vi.mocked(planSprint).mockResolvedValue(makeSprint());
    vi.mocked(evaluateCostGate).mockReturnValue({
      ok: true,
      estimate: {
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
        unpricedModels: [],
      },
      autoConfirm: true,
      autoConfirmThresholdUsd: 2,
      overrideApplied: false,
    });
    sandboxRoot = mkdtempSync(join(tmpdir(), 'deckent-start-snapshot-test-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(sandboxRoot);
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    // node:fs/promises is NOT vi.mock'd here (only sync node:fs is) — this
    // really cleans up; the stubbed sync rmSync would silently no-op.
    await rm(sandboxRoot, { recursive: true, force: true });
  });

  // ── Branch 1: valid (flag-on + CAS-matching snapshot) ──────────────────

  describe('branch 1 — valid snapshot: consumes without re-planning', () => {
    it('starts from the approved snapshot: no re-plan, spawns via spawnDetachedDeckent, persists the handle', async () => {
      const snapshot = makeApprovedSnapshot();
      vi.mocked(loadApprovedSnapshot).mockReturnValue(snapshot);

      const tool = await getStartTool();
      const result = await tool.handler({ flowId: 'flow-1', revision: 1, planDigest: 'digest-abc' });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBeUndefined();
      expect(parsed.success).toBe(true);
      expect(parsed.status).toBe('STARTING');
      expect(parsed.jobId).toBe('attempt-1');

      // Fresh-replan öldü: neither readContext nor planSprint is reachable
      // from this branch — the sprint is the exact one from the snapshot.
      expect(vi.mocked(readContext)).not.toHaveBeenCalled();
      expect(vi.mocked(planSprint)).not.toHaveBeenCalled();
      expect(vi.mocked(evaluateCostGate)).toHaveBeenCalledTimes(1);
      // Legacy fork-based spawn path never runs either.
      expect(vi.mocked(fork)).not.toHaveBeenCalled();

      expect(vi.mocked(spawnDetachedDeckent)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(spawnDetachedDeckent)).toHaveBeenCalledWith(
        ['start', '--flow-id', 'flow-1', '--revision', '1', '--plan-digest', 'digest-abc'],
        {
          projectRoot: sandboxRoot,
          flowId: 'flow-1',
          exactStart: { attemptId: 'attempt-1', ownerNonce: 'owner-1' },
        },
      );

      // born-681 tek-yazar sözleşmesi: MCP-parent handle'ı PERSIST ETMEZ —
      // yazar, spawn edilen child'ın kendisidir (persist-before-run).
      expect(vi.mocked(saveRunHandle)).not.toHaveBeenCalled();
    });

    it('forwards autoApprove/force-scope/force-prompt-gate/sandbox/timeout onto the spawned CLI args (CLI parity)', async () => {
      vi.mocked(loadApprovedSnapshot).mockReturnValue(makeApprovedSnapshot());

      const tool = await getStartTool();
      await tool.handler({
        flowId: 'flow-1',
        revision: 1,
        planDigest: 'digest-abc',
        autoApprove: true,
        acknowledgeScopePaths: true,
        acknowledgePromptGate: true,
        acknowledgeCost: true,
        sandbox: true,
        timeout: 60000,
      });

      expect(vi.mocked(spawnDetachedDeckent)).toHaveBeenCalledWith(
        [
          'start', '--flow-id', 'flow-1', '--revision', '1', '--plan-digest', 'digest-abc',
          '--auto-approve', '--force-scope', '--force-prompt-gate', '--force', '--sandbox-mode', '--timeout', '60000',
        ],
        {
          projectRoot: sandboxRoot,
          flowId: 'flow-1',
          exactStart: { attemptId: 'attempt-1', ownerNonce: 'owner-1' },
        },
      );
    });

    it('blocks unknown snapshot pricing before detached spawn, even with force=true', async () => {
      vi.mocked(loadApprovedSnapshot).mockReturnValue(makeApprovedSnapshot());
      vi.mocked(evaluateCostGate).mockReturnValue({
        ok: false,
        reason: 'COST_PRICING_UNKNOWN',
        ceilingTripped: 'pricing',
        estimate: { costRealistic: 0, budgetUsd: 5 } as never,
        estimatedUsd: 0,
        budgetUsd: 5,
        unpricedModels: ['openrouter/vendor/unknown-paid'],
        message: 'pricing unavailable',
      });

      const tool = await getStartTool();
      const result = await tool.handler({
        flowId: 'flow-1', revision: 1, planDigest: 'digest-abc', force: true,
      });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.code).toBe('COST_PRICING_UNKNOWN');
      expect(parsed.override).toBe('pricingEvidence');
      expect(vi.mocked(spawnDetachedDeckent)).not.toHaveBeenCalled();
      expect(vi.mocked(planSprint)).not.toHaveBeenCalled();
    });

    it('noop-duplicate: an identical CAS-matching second start does not re-spawn or re-save', async () => {
      const snapshot = makeApprovedSnapshot();
      vi.mocked(loadApprovedSnapshot).mockReturnValue(snapshot);
      vi.mocked(startRunFlow).mockReturnValue({
        status: 'noop-duplicate',
        context: {} as never,
        attempt: { attemptId: 'attempt-1' } as never,
      });

      const tool = await getStartTool();
      const result = await tool.handler({ flowId: 'flow-1', revision: 1, planDigest: 'digest-abc' });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBeUndefined();
      expect(parsed.success).toBe(true);
      expect(parsed.status).toBe('ALREADY_RUNNING');
      expect(parsed.jobId).toBe('attempt-1');

      expect(vi.mocked(spawnDetachedDeckent)).not.toHaveBeenCalled();
      expect(vi.mocked(saveRunHandle)).not.toHaveBeenCalled();
      expect(vi.mocked(readContext)).not.toHaveBeenCalled();
      expect(vi.mocked(planSprint)).not.toHaveBeenCalled();
    });
  });

  // ── Branch 2: uyuşmazlık — typed-error exits ────────────────────────────

  describe('branch 2 — typed-error exits: never spawn, never re-plan', () => {
    it('RUN_JOB_DIGEST_MISMATCH: approved snapshot exists but CAS key does not match', async () => {
      vi.mocked(loadApprovedSnapshot).mockReturnValue(
        makeApprovedSnapshot({ revision: 2, planDigest: 'digest-xyz' }),
      );

      const tool = await getStartTool();
      const result = await tool.handler({ flowId: 'flow-1', revision: 1, planDigest: 'digest-abc' });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.success).toBe(false);
      expect(parsed.code).toBe('RUN_JOB_DIGEST_MISMATCH');
      expect(vi.mocked(spawnDetachedDeckent)).not.toHaveBeenCalled();
      expect(vi.mocked(saveRunHandle)).not.toHaveBeenCalled();
    });

    it('RUN_JOB_FLOW_NOT_APPROVED: no snapshot was ever approved for this flowId', async () => {
      vi.mocked(loadApprovedSnapshot).mockReturnValue(undefined);

      const tool = await getStartTool();
      const result = await tool.handler({ flowId: 'flow-1', revision: 1, planDigest: 'digest-abc' });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.success).toBe(false);
      expect(parsed.code).toBe('RUN_JOB_FLOW_NOT_APPROVED');
      expect(vi.mocked(spawnDetachedDeckent)).not.toHaveBeenCalled();
      expect(vi.mocked(saveRunHandle)).not.toHaveBeenCalled();
    });

    it('EXACT_START_REFERENCE_MISMATCH: the durable attempt journal owns stale-start conflicts', async () => {
      vi.mocked(loadApprovedSnapshot).mockReturnValue(makeApprovedSnapshot());
      const conflict = new Error('exact start reference mismatch') as Error & { code: string };
      conflict.code = 'EXACT_START_REFERENCE_MISMATCH';
      vi.mocked(startRunFlow).mockImplementation(() => { throw conflict; });

      const tool = await getStartTool();
      const result = await tool.handler({ flowId: 'flow-1', revision: 1, planDigest: 'digest-abc' });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.success).toBe(false);
      expect(parsed.code).toBe('EXACT_START_REFERENCE_MISMATCH');
      expect(vi.mocked(spawnDetachedDeckent)).not.toHaveBeenCalled();
      expect(vi.mocked(saveRunHandle)).not.toHaveBeenCalled();
    });

    it('RUN_FLOW_INCOMPLETE_PARAMS: flowId given without revision/planDigest', async () => {
      const tool = await getStartTool();
      const result = await tool.handler({ flowId: 'flow-1' });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.code).toBe('RUN_FLOW_INCOMPLETE_PARAMS');
      expect(vi.mocked(loadApprovedSnapshot)).not.toHaveBeenCalled();
      expect(vi.mocked(spawnDetachedDeckent)).not.toHaveBeenCalled();
    });

    it('RUN_FLOW_V2_DISABLED: full flow args given but config.terminal.run_flow_v2 is not true', async () => {
      vi.mocked(loadConfig).mockResolvedValue(FLOW_OFF_CONFIG);

      const tool = await getStartTool();
      const result = await tool.handler({ flowId: 'flow-1', revision: 1, planDigest: 'digest-abc' });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.code).toBe('RUN_FLOW_V2_DISABLED');
      expect(vi.mocked(loadApprovedSnapshot)).not.toHaveBeenCalled();
      expect(vi.mocked(spawnDetachedDeckent)).not.toHaveBeenCalled();
    });
  });

  // ── Branch 3: flag-off — legacy path byte-identical ─────────────────────

  describe('branch 3 — flag-off: legacy fork-based path is untouched', () => {
    it('no flow args at all takes the pre-existing spawn path — flow modules never touched', async () => {
      const tool = await getStartTool();
      // force:true skips the orphan/lock pre-flight and acknowledges numeric
      // cost overruns; the cost gate still runs. This branch proves the
      // flow-only modules remain unreached.
      const result = await tool.handler({ autoApprove: false, force: true });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBeUndefined();
      expect(parsed.success).toBe(true);
      expect(parsed.status).toBe('RUNNING');
      expect(parsed.jobId).toMatch(/^job-\d{13}-[0-9a-f-]+$/);

      expect(vi.mocked(fork)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(loadApprovedSnapshot)).not.toHaveBeenCalled();
      expect(vi.mocked(loadRunHandle)).not.toHaveBeenCalled();
      expect(vi.mocked(saveRunHandle)).not.toHaveBeenCalled();
      expect(vi.mocked(spawnDetachedDeckent)).not.toHaveBeenCalled();
    });
  });
});
