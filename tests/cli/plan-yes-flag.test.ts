/**
 * PLAN-W1 Bug 2 — `deckent plan --yes` non-interactive auto-approve.
 *
 * Without `--yes`, `deckent plan` plans tasks as DRAFT and then blocks on an
 * interactive `promptConfirm('Approve this plan?')`. In a non-interactive
 * context (CI, pipe, MCP) that confirm gets EOF → returns false → the DRAFT
 * compatibility tasks are never published as PENDING, so `deckent start`
 * finds nothing runnable.
 *
 * The fix: `--yes` (alias `-y`) skips the interactive confirm and approves the
 * exact plan directly and publishes its PENDING compatibility projection, so
 * the lifecycle completes without a human at the keyboard.
 *
 * Hermetic: fs / readline / config / brain / prompt all mocked, no disk I/O.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Module-level mocks ──────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  constants: { W_OK: 2, R_OK: 4, F_OK: 0 },
  renameSync: vi.fn(),
}));

vi.mock('node:readline/promises', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn().mockResolvedValue(''),
    close: vi.fn(),
  })),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn().mockResolvedValue({
    language: 'en',
    plan: undefined,
    activeModeConfig: { max_workers: 4 },
  }),
}));

vi.mock('../../src/core/provider.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/provider.js')>();
  return {
    ...actual,
    bootstrapProviders: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../src/orchestra/brain.js', () => ({
  readContext: vi.fn().mockReturnValue({
    directives: '', memory: '', retro: '', debt: [],
    patterns: '', decisions: '', existingTasks: [],
    projectState: { gitStatus: '', fileTree: [] },
  }),
  planSprint: vi.fn().mockResolvedValue({
    id: 'sprint-291',
    number: 291,
    tasks: [{ id: '291-001', title: 'T', model: 'sonnet', priority: 'NORMAL', status: 'DRAFT' }],
    reasoning: undefined,
    planningMode: 'structured',
  }),
}));

vi.mock('../../src/orchestra/run-flow-plan-service.js', () => ({
  planRunFlow: vi.fn().mockResolvedValue({
    flowId: 'flow-cli-1',
    revision: 1,
    planDigest: 'digest-cli-1',
    sprint: {
      id: 'sprint-291',
      number: 291,
      tasks: [{ id: '291-001', title: 'T', model: 'sonnet', priority: 'NORMAL', status: 'PENDING', dependencies: [], scope: { directories: [], filesRead: [], filesWrite: [] } }],
      reasoning: undefined,
      planningMode: 'structured',
    },
    preview: {
      flowId: 'flow-cli-1',
      revision: 1,
      planDigest: 'digest-cli-1',
      taskSummaries: [],
      policyDecision: 'allow',
      gateResult: 'skipped',
      topology: {
        schemaVersion: 1,
        configuredMaxWorkers: 4,
        effectiveConcurrency: 1,
        taskSlots: [1],
        collisions: [],
        authoredEdges: [],
        syntheticEdges: [],
        effectiveEdges: [],
        verdict: 'pass',
        waves: [{ wave: 1, slots: [1] }],
        findings: [],
      },
      topologyGateResult: 'pass',
      scopeGateResult: 'skipped',
    },
    context: { state: 'AWAITING_APPROVAL' },
    sourceAuthority: {},
    approval: 'awaiting',
    reusedDurablePlan: false,
  }),
  decideRunFlowPlan: vi.fn().mockReturnValue({ state: 'APPROVED' }),
}));

vi.mock('../../src/orchestra/task-artifact-projection.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/task-artifact-projection.js')>();
  return {
    ...actual,
    inspectTaskArtifactsNoClobber: vi.fn().mockReturnValue({
      taskIds: ['291-001'],
      idempotent: [],
      missing: ['291-001'],
    }),
    publishTaskArtifactsNoClobber: vi.fn().mockReturnValue({
      taskIds: ['291-001'],
      created: ['291-001'],
      idempotent: [],
    }),
  };
});

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/project'),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatTable: vi.fn().mockReturnValue(''),
}));

vi.mock('../../src/cli/helpers/prompt.js', () => ({
  promptConfirm: vi.fn().mockResolvedValue(false), // simulate non-interactive EOF → false
}));

// ─── Imports (after mocks) ───────────────────────────────────────────

import { registerPlan } from '../../src/cli/commands/plan.js';
import {
  decideRunFlowPlan,
  planRunFlow,
} from '../../src/orchestra/run-flow-plan-service.js';
import {
  inspectTaskArtifactsNoClobber,
  publishTaskArtifactsNoClobber,
} from '../../src/orchestra/task-artifact-projection.js';
import { promptConfirm } from '../../src/cli/helpers/prompt.js';

// ─── Tests ───────────────────────────────────────────────────────────

describe('PLAN-W1 Bug 2 — deckent plan --yes auto-approves (PENDING, not DRAFT)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a --yes option', () => {
    const program = new Command();
    registerPlan(program);
    const planCmd = program.commands.find((c) => c.name() === 'plan');
    expect(planCmd).toBeDefined();
    const hasYes = planCmd!.options.some((o) => o.long === '--yes');
    expect(hasYes).toBe(true);
  });

  it('--yes approves the exact plan and publishes PENDING tasks without prompting', async () => {
    const program = new Command();
    program.exitOverride();
    registerPlan(program);

    await program.parseAsync(['node', 'test', 'plan', '--yes']).catch(() => {});

    expect(vi.mocked(planRunFlow)).toHaveBeenCalledOnce();
    expect(vi.mocked(planRunFlow)).toHaveBeenCalledWith(expect.objectContaining({
      source: expect.objectContaining({ sourceKind: 'directives' }),
    }));

    // …then auto-approved and no-clobber-published WITHOUT the interactive confirm.
    expect(vi.mocked(decideRunFlowPlan)).toHaveBeenCalledWith(
      '/project',
      'flow-cli-1',
      expect.objectContaining({ decision: 'approve' }),
    );
    expect(vi.mocked(inspectTaskArtifactsNoClobber)).toHaveBeenCalledOnce();
    expect(vi.mocked(publishTaskArtifactsNoClobber)).toHaveBeenCalledOnce();
    expect(vi.mocked(publishTaskArtifactsNoClobber).mock.invocationCallOrder[0])
      .toBeGreaterThan(vi.mocked(decideRunFlowPlan).mock.invocationCallOrder[0]!);
    expect(vi.mocked(promptConfirm)).not.toHaveBeenCalled();
    const canonical = await vi.mocked(planRunFlow).mock.results[0]!.value;
    expect(canonical.sprint.tasks[0].status).toBe('PENDING');
  });

  it('without --yes, the interactive confirm still gates approval (regression baseline)', async () => {
    const program = new Command();
    program.exitOverride();
    registerPlan(program);

    await program.parseAsync(['node', 'test', 'plan']).catch(() => {});

    // promptConfirm is the gate; mocked to false (EOF) → no publication.
    expect(vi.mocked(promptConfirm)).toHaveBeenCalledOnce();
    expect(vi.mocked(publishTaskArtifactsNoClobber)).not.toHaveBeenCalled();
    expect(vi.mocked(decideRunFlowPlan)).toHaveBeenCalledWith(
      '/project',
      'flow-cli-1',
      expect.objectContaining({ decision: 'reject' }),
    );
  });
});
