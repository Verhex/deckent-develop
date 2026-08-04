import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { SprintStatus, SprintPhase, TaskStatus } from '../../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig } from '../../../src/core/types.js';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../../src/core/config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/core/config.js')>()),
  readAuthMode: vi.fn().mockResolvedValue('subscription'),
  resolveBrainModel: () => 'claude-sonnet-5',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(),
}));

vi.mock('../../../src/core/provider.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/core/provider.js')>()),
  bootstrapProviders: vi.fn().mockResolvedValue({
    connector: {},
    registered: ['claude'],
    skipped: [],
    defaultProvider: 'claude',
    providerEnvOverrides: {},
  }),
}));

vi.mock('../../../src/orchestra/brain.js', () => ({
  readContext: vi.fn(),
  planSprint: vi.fn(),
  confirmDraftTasks: vi.fn(),
  cleanupDraftTasks: vi.fn(),
}));

// Non-dry-run planning no longer calls planSprint directly — it goes through
// the exact-plan flow service (planRunFlow → flowId + revision + planDigest,
// then decideRunFlowPlan approve/reject). Mirror the proven MCP seam
// (tests/mcp/tools.test.ts): delegate to the mocked planSprint with the same
// arg order as the real preview generation, and derive a real sha256
// planDigest + a pass-verdict execution topology from the returned sprint.
vi.mock('../../../src/orchestra/run-flow-plan-service.js', () => {
  class RunFlowPlanServiceError extends Error {
    readonly code: string;
    readonly details: Record<string, unknown>;
    constructor(code: string, details: Record<string, unknown> = {}) {
      super(code);
      this.code = code;
      this.details = details;
    }
  }
  return {
    RunFlowPlanServiceError,
    decideRunFlowPlan: vi.fn(),
    planRunFlow: vi.fn(async (input: {
      projectRoot: string;
      config: unknown;
      recommendation?: { maxWorkers?: number };
      proposal?: { flowId?: string; revision?: number };
      source?: { brainContext?: unknown };
      previewOptions?: { mode?: string };
    }) => {
      const { planSprint: planSprintMock } = await import('../../../src/orchestra/brain.js');
      const sprint = await planSprintMock(
        input.projectRoot,
        input.config as never,
        input.source?.brainContext as never,
        input.recommendation as never,
        { mode: input.previewOptions?.mode } as never,
      );
      const maxWorkers = input.recommendation?.maxWorkers ?? 4;
      const tasks: Array<{ id: string }> = (sprint as { tasks?: Array<{ id: string }> })?.tasks ?? [];
      const waves: Array<{ wave: number; slots: number[] }> = [];
      for (let i = 0; i < tasks.length; i += maxWorkers) {
        waves.push({
          wave: waves.length + 1,
          slots: tasks.slice(i, i + maxWorkers).map((_t, j) => i + j + 1),
        });
      }
      const { createHash } = await import('node:crypto');
      return {
        flowId: input.proposal?.flowId ?? 'flow-test',
        revision: input.proposal?.revision ?? 1,
        approval: 'awaiting',
        reusedDurablePlan: false,
        sprint,
        preview: {
          topology: {
            schemaVersion: 1,
            configuredMaxWorkers: maxWorkers,
            effectiveConcurrency: Math.min(maxWorkers, Math.max(tasks.length, 1)),
            taskSlots: tasks.map((_t, i) => i + 1),
            collisions: [],
            authoredEdges: [],
            syntheticEdges: [],
            effectiveEdges: [],
            waves,
            findings: [],
            verdict: 'pass',
          },
          scopeGateResult: 'skipped',
          topologyGateResult: 'pass',
          planDigestVersion: 2,
        },
        planDigest: createHash('sha256')
          .update(JSON.stringify(tasks.map(t => t.id)))
          .digest('hex'),
      };
    }),
  };
});

// Approved-plan compatibility projection (task-file publish) touches the real
// filesystem at projectRoot ('/mock/root' here) — mock the whole boundary.
// The error classes must exist because plan.ts narrows with `instanceof`.
vi.mock('../../../src/orchestra/task-artifact-projection.js', () => {
  class TaskArtifactProjectionError extends Error {
    readonly code: string;
    readonly details: Record<string, unknown>;
    constructor(code: string, details: Record<string, unknown> = {}) {
      super(code);
      this.code = code;
      this.details = details;
    }
  }
  return {
    TaskArtifactProjectionError,
    inspectTaskArtifactsNoClobber: vi.fn(),
    publishTaskArtifactsNoClobber: vi.fn(),
    inspectStructuredCriteriaProjectionAdoption: vi.fn(),
  };
});

// --dry-run does not call planSprint directly — it delegates to the shared
// plan-preview-service (TERM2 424-001). Mock this boundary explicitly instead
// of relying on it falling through to the real implementation (which pulls in
// readAuthMode/digest machinery this test file has no business exercising).
vi.mock('../../../src/orchestra/plan-preview-service.js', () => ({
  generatePlanPreview: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatTable: vi.fn().mockImplementation((headers: string[], rows: string[][]) => {
    return [headers.join(' | '), ...rows.map(r => r.join(' | '))].join('\n');
  }),
}));

vi.mock('../../../src/cli/helpers/prompt.js', () => ({
  promptConfirm: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

import { loadConfig } from '../../../src/core/config.js';
import { bootstrapProviders } from '../../../src/core/provider.js';
import {
  readContext, planSprint, confirmDraftTasks, cleanupDraftTasks,
} from '../../../src/orchestra/brain.js';
import { generatePlanPreview } from '../../../src/orchestra/plan-preview-service.js';
import { decideRunFlowPlan, planRunFlow } from '../../../src/orchestra/run-flow-plan-service.js';
import { publishTaskArtifactsNoClobber } from '../../../src/orchestra/task-artifact-projection.js';
import { print, printError } from '../../../src/cli/helpers/output.js';
import { promptConfirm } from '../../../src/cli/helpers/prompt.js';
import { registerPlan } from '../../../src/cli/commands/plan.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeConfig(): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 8, brain_model: 'claude-opus-4-8', default_model: 'claude-sonnet-5',
      haiku_allowed: true,
      brain_planning: 'auto',
    },
    modes: {} as any,
    language: 'en', projectName: 'test', projectRoot: '/mock/root',
    version: '1.0.0', auto_docs: { tier1: true, tier2: true, tier3: false },
    worker_provider: 'claude',
    spawn_backend: 'docker',
    execution_budget: {
      roles: { worker: { default: { maxTurns: 1 } } },
      landing: { reserve_ratio: 0.25 },
    },
  };
}

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: '001-001', title: 'Test Task', description: 'desc', model: 'claude-sonnet-5',
    effort: 'normal', priority: 'NORMAL', reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.DRAFT, sprintId: 'sprint-001', createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSprint(overrides?: Partial<Sprint>): Sprint {
  return {
    id: 'sprint-001', number: 1,
    status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
    tasks: [makeTask()], workers: ['w-001-001'],
    ...overrides,
  };
}

function setupMocks(): void {
  vi.mocked(loadConfig).mockResolvedValue(makeConfig());
  vi.mocked(readContext).mockReturnValue({
    directives: '', memory: '', retro: '', debt: [],
    patterns: '', decisions: '', existingTasks: [],
    projectState: { gitStatus: '', fileTree: [] },
  });
  vi.mocked(planSprint).mockReturnValue(makeSprint());
  vi.mocked(generatePlanPreview).mockResolvedValue({
    sprint: makeSprint({ planningMode: 'structured' }),
    planDigest: 'test-plan-digest',
    generatedAt: '2026-07-23T00:00:00.000Z',
  });
}

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerPlan(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('plan command (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers plan command with options', () => {
    const program = new Command();
    registerPlan(program);
    const cmd = program.commands.find(c => c.name() === 'plan');
    expect(cmd).toBeDefined();
    expect(cmd!.options.some(o => o.long === '--no-confirm')).toBe(true);
    expect(cmd!.options.some(o => o.long === '--structured')).toBe(true);
  });

  it('calls readContext and planSprint', async () => {
    setupMocks();
    await runCommand(['plan', '--no-confirm']);
    expect(readContext).toHaveBeenCalled();
    expect(planSprint).toHaveBeenCalled();
  });

  it('prints task table with ID, Title, Model, Priority', async () => {
    setupMocks();
    vi.mocked(planSprint).mockReturnValue(makeSprint({
      tasks: [makeTask({ id: '001-001', title: 'Do Something', model: 'opus', priority: 'HIGH' })],
    }));
    await runCommand(['plan', '--no-confirm']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('1 tasks'));
  });

  it('--structured passes mode=structured to planSprint', async () => {
    setupMocks();
    await runCommand(['plan', '--structured', '--no-confirm']);
    expect(planSprint).toHaveBeenCalledWith(
      expect.any(String), expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ mode: 'structured' }),
    );
  });

  it('--no-confirm auto-approves the exact plan and skips prompt', async () => {
    setupMocks();
    await runCommand(['plan', '--no-confirm']);
    // asDraft is no longer a planSprint argument: the flow service always plans
    // durably and --no-confirm resolves as an immediate approve decision.
    expect(planSprint).toHaveBeenCalled();
    expect(decideRunFlowPlan).toHaveBeenCalledWith(
      '/mock/root',
      expect.any(String),
      expect.objectContaining({ decision: 'approve' }),
    );
    expect(promptConfirm).not.toHaveBeenCalled();
    expect(confirmDraftTasks).not.toHaveBeenCalled();
  });

  it('default (with confirm) shows approval prompt', async () => {
    setupMocks();
    vi.mocked(promptConfirm).mockResolvedValue(true);
    await runCommand(['plan']);
    expect(promptConfirm).toHaveBeenCalledWith('Approve this plan?');
    // Approval settles via the flow-service decision CAS (not legacy
    // confirmDraftTasks) and only then publishes the task projection.
    expect(decideRunFlowPlan).toHaveBeenCalledWith(
      '/mock/root',
      expect.any(String),
      expect.objectContaining({ decision: 'approve' }),
    );
    expect(publishTaskArtifactsNoClobber).toHaveBeenCalled();
  });

  it('rejected plan records a reject decision and publishes nothing', async () => {
    setupMocks();
    vi.mocked(promptConfirm).mockResolvedValue(false);
    await runCommand(['plan']);
    expect(confirmDraftTasks).not.toHaveBeenCalled();
    expect(decideRunFlowPlan).toHaveBeenCalledWith(
      '/mock/root',
      expect.any(String),
      expect.objectContaining({ decision: 'reject' }),
    );
    expect(publishTaskArtifactsNoClobber).not.toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith('Plan rejected.');
  });

  it('shows reasoning and planningMode when present', async () => {
    setupMocks();
    vi.mocked(planSprint).mockReturnValue(makeSprint({
      reasoning: 'AI chose tasks',
      planningMode: 'ai',
    }));
    await runCommand(['plan', '--no-confirm']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('AI chose tasks'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('Planning mode: ai'));
  });

  it('handles loadConfig error gracefully', async () => {
    vi.mocked(loadConfig).mockRejectedValue(new Error('config missing'));
    await runCommand(['plan']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('handles planSprint error gracefully', async () => {
    setupMocks();
    vi.mocked(planSprint).mockImplementation(() => { throw new Error('circular deps'); });
    await runCommand(['plan', '--no-confirm']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  // ─── B) --dry-run ────────────────────────────────────────────────

  it('--dry-run delegates to the shared structured plan preview service', async () => {
    setupMocks();
    await runCommand(['plan', '--dry-run', '--no-confirm']);
    expect(generatePlanPreview).toHaveBeenCalledWith(
      expect.any(String), expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ mode: 'structured' }),
    );
    expect(planSprint).not.toHaveBeenCalled();
  });

  it('--dry-run prints dry-run message and skips confirmation', async () => {
    setupMocks();
    await runCommand(['plan', '--dry-run']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));
    expect(promptConfirm).not.toHaveBeenCalled();
    expect(confirmDraftTasks).not.toHaveBeenCalled();
  });

  it('--dry-run preserves pre-existing DRAFT tasks by never invoking cleanupDraftTasks', async () => {
    setupMocks();
    await runCommand(['plan', '--structured', '--dry-run']);
    expect(cleanupDraftTasks).not.toHaveBeenCalled();
  });

  it('--dry-run surfaces and fails an undeclared shared-writer topology', async () => {
    setupMocks();
    const sprint = makeSprint({
      tasks: [
        makeTask({ id: 'z', scope: { directories: [], filesRead: [], filesWrite: ['src/shared.ts'] } }),
        makeTask({ id: 'a', scope: { directories: [], filesRead: [], filesWrite: ['./src/shared.ts'] } }),
        makeTask({ id: 'm', scope: { directories: [], filesRead: [], filesWrite: ['SRC\\SHARED.ts'] } }),
      ],
      planningMode: 'structured',
    });
    vi.mocked(generatePlanPreview).mockResolvedValue({
      sprint,
      planDigest: 'blocked-plan-digest',
      topology: {
        schemaVersion: 1,
        configuredMaxWorkers: 8,
        effectiveConcurrency: 1,
        taskSlots: [1, 2, 3],
        collisions: [{
          path: 'src/shared.ts',
          key: 'src/shared.ts',
          writerSlots: [1, 2, 3],
          declared: false,
        }],
        authoredEdges: [],
        syntheticEdges: [{ from: 1, to: 2, source: 'collision', paths: ['src/shared.ts'] }],
        effectiveEdges: [{ from: 1, to: 2, source: 'collision', paths: ['src/shared.ts'] }],
        waves: [
          { wave: 1, slots: [1] },
          { wave: 2, slots: [2] },
          { wave: 3, slots: [3] },
        ],
        findings: [{
          code: 'undeclared-writer-collision',
          severity: 'block',
          slots: [1, 2, 3],
          path: 'src/shared.ts',
        }],
        verdict: 'block',
      },
    } as Awaited<ReturnType<typeof generatePlanPreview>>);
    await runCommand(['plan', '--structured', '--dry-run']);

    expect(print).toHaveBeenCalledWith(expect.stringContaining('Execution topology: BLOCK'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('1:[1] 2:[2] 3:[3]'));
    expect(process.exitCode).toBe(1);
    expect(cleanupDraftTasks).not.toHaveBeenCalled();
  });

  // ─── C) exact-plan flow delegation (legacy draft cleanup retired) ──

  it('delegates planning to the exact-plan flow service without legacy draft cleanup', async () => {
    setupMocks();
    await runCommand(['plan', '--no-confirm']);
    // The CLI no longer owns the DRAFT-task lifecycle: planRunFlow is the
    // durable planning authority, so no ad-hoc cleanupDraftTasks call remains.
    expect(planRunFlow).toHaveBeenCalledWith(expect.objectContaining({
      projectRoot: '/mock/root',
      proposal: expect.objectContaining({ origin: 'cli', tenant: 'local' }),
    }));
    expect(cleanupDraftTasks).not.toHaveBeenCalled();
    expect(confirmDraftTasks).not.toHaveBeenCalled();
  });

  // ─── D) Registers --dry-run option ────────────────────────────────

  it('registers --dry-run option on the command', () => {
    const program = new Command();
    registerPlan(program);
    const cmd = program.commands.find(c => c.name() === 'plan');
    expect(cmd!.options.some(o => o.long === '--dry-run')).toBe(true);
  });

  // ─── E) Provider bootstrap ─────────────────────────────────────────

  it('calls bootstrapProviders before planning', async () => {
    setupMocks();
    await runCommand(['plan', '--no-confirm']);
    expect(bootstrapProviders).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'max_plan',
      language: 'en',
    }));
    // bootstrapProviders should be called before planSprint
    const bootstrapOrder = vi.mocked(bootstrapProviders).mock.invocationCallOrder[0];
    const planOrder = vi.mocked(planSprint).mock.invocationCallOrder[0];
    expect(bootstrapOrder).toBeLessThan(planOrder!);
  });

  it('falls back to structured mode when bootstrapProviders fails', async () => {
    setupMocks();
    vi.mocked(bootstrapProviders).mockRejectedValue(new Error('No API key'));
    await runCommand(['plan', '--no-confirm']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('[warn]'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('structured'));
    expect(planSprint).toHaveBeenCalledWith(
      expect.any(String), expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ mode: 'structured' }),
    );
  });

  it('does not override --structured flag when bootstrap fails', async () => {
    setupMocks();
    vi.mocked(bootstrapProviders).mockRejectedValue(new Error('No API key'));
    await runCommand(['plan', '--structured', '--no-confirm']);
    expect(planSprint).toHaveBeenCalledWith(
      expect.any(String), expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ mode: 'structured' }),
    );
    // Should NOT print fallback warning because --structured was already set
    const printCalls = vi.mocked(print).mock.calls.map(c => c[0]);
    const warnCalls = printCalls.filter(msg => typeof msg === 'string' && msg.includes('[warn]'));
    expect(warnCalls).toHaveLength(0);
  });

  it('--dry-run uses structured mode without calling bootstrapProviders', async () => {
    setupMocks();
    await runCommand(['plan', '--dry-run', '--no-confirm']);
    expect(bootstrapProviders).not.toHaveBeenCalled();
    expect(generatePlanPreview).toHaveBeenCalledWith(
      expect.any(String), expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ mode: 'structured' }),
    );
  });

  it('--dry-run + --structured skips bootstrap and uses structured', async () => {
    setupMocks();
    await runCommand(['plan', '--dry-run', '--structured', '--no-confirm']);
    expect(bootstrapProviders).not.toHaveBeenCalled();
    expect(generatePlanPreview).toHaveBeenCalledWith(
      expect.any(String), expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ mode: 'structured' }),
    );
  });

  it('successful bootstrap does not force structured mode', async () => {
    setupMocks();
    vi.mocked(bootstrapProviders).mockResolvedValue({
      connector: {} as any,
      registered: ['claude'],
      skipped: [],
      defaultProvider: 'claude',
      providerEnvOverrides: {},
    });
    await runCommand(['plan', '--no-confirm']);
    expect(planSprint).toHaveBeenCalledWith(
      expect.any(String), expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ mode: undefined }),
    );
  });
});
