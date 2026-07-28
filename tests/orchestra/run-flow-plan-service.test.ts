import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  storedPlans: new Map<string, any>(),
  generatePlanPreview: vi.fn(),
  compileRunProposal: vi.fn(),
  normalizePlannerDependencies: vi.fn(),
  computeExecutionPlanDigestV3: vi.fn(),
  evaluateScopeGate: vi.fn(),
  applyScopeResolutions: vi.fn(),
  proposeFlow: vi.fn(),
  recordPreview: vi.fn(),
  decideRunFlow: vi.fn(),
  operationOrder: [] as string[],
  trackedFilesAvailable: true,
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
    child.kill = vi.fn();
    queueMicrotask(() => {
      if (mocks.trackedFilesAvailable) {
        child.stdout.emit('data', 'src/a.ts\nsrc/b.ts\n');
        child.emit('close', 0);
      } else {
        child.emit('close', 1);
      }
    });
    return child;
  }),
}));

vi.mock('../../src/orchestra/plan-preview-service.js', () => ({
  generatePlanPreview: mocks.generatePlanPreview,
}));

vi.mock('../../src/orchestra/run-proposal-compiler.js', () => ({
  compileRunProposal: mocks.compileRunProposal,
}));

vi.mock('../../src/orchestra/planner.js', () => ({
  normalizePlannerDependencies: mocks.normalizePlannerDependencies,
}));

vi.mock('../../src/core/execution-plan-digest.js', () => ({
  computeExecutionPlanDigestV3: mocks.computeExecutionPlanDigestV3,
}));

vi.mock('../../src/core/scope-gate.js', () => ({
  evaluateScopeGate: mocks.evaluateScopeGate,
  applyScopeResolutions: mocks.applyScopeResolutions,
}));

vi.mock('../../src/core/run-flow-store.js', () => ({
  loadPlannedSprint: vi.fn((_root: string, flowId: string) => mocks.storedPlans.get(flowId)),
  savePlannedSprint: vi.fn((_root: string, flowId: string, record: unknown) => {
    mocks.operationOrder.push('save-plan');
    mocks.storedPlans.set(flowId, { flowId, ...(record as object) });
  }),
}));

vi.mock('../../src/orchestra/run-flow-coordinator-registry.js', () => ({
  getRunFlowCoordinator: vi.fn(() => ({
    proposeFlow: mocks.proposeFlow,
    recordPreview: mocks.recordPreview,
  })),
}));

vi.mock('../../src/orchestra/run-flow-decision-service.js', () => ({
  decideRunFlow: mocks.decideRunFlow,
}));

import {
  planRunFlow,
  RunFlowPlanServiceError,
} from '../../src/orchestra/run-flow-plan-service.js';

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: '001-001',
    title: 'First',
    description: 'first',
    reason: 'test',
    model: 'gpt-5.6-terra',
    effort: 'normal',
    priority: 'NORMAL',
    status: 'PENDING',
    scope: {
      directories: ['src'],
      filesRead: [],
      filesWrite: ['src/a.ts'],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'green',
      noGoCriteria: 'red',
      techDebtAcceptable: 'none',
    },
    ...overrides,
  };
}

function sprint(tasks = [task()]) {
  return {
    id: 'sprint-001',
    number: 1,
    status: 'PLANNING',
    phase: 'PLAN',
    tasks,
    workers: tasks.map(item => `w-${item.id}`),
    planningMode: 'structured',
  };
}

const topology = {
  schemaVersion: 1,
  configuredMaxWorkers: 2,
  effectiveConcurrency: 1,
  taskSlots: [1],
  collisions: [],
  authoredEdges: [],
  syntheticEdges: [],
  effectiveEdges: [],
  verdict: 'pass',
  waves: [{ wave: 1, slots: [1] }],
  findings: [],
};

function preview(plannedSprint = sprint()) {
  return {
    sprint: plannedSprint,
    planDigest: 'digest-before-normalization',
    planDigestVersion: 3,
    planDigestContext: { configuredMaxWorkers: 2 },
    taskSummaries: plannedSprint.tasks.map(item => ({
      title: item.title,
      summary: item.description,
    })),
    gateResult: 'skipped',
    policyDecision: 'allow',
    gateFindings: [],
    topology,
    topologyGateResult: 'pass',
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    projectRoot: '/project',
    config: {
      projectName: 'project',
      activeModeConfig: { max_workers: 2 },
    },
    recommendation: {
      size: 'full',
      maxWorkers: 2,
      modelConstraint: null,
      reason: 'test',
    },
    proposal: {
      flowId: 'flow-1',
      tenant: 'tenant-1',
      project: 'project',
      actor: { id: 'owner-1' },
      origin: 'cli',
      revision: 1,
      intentSummary: 'Plan the directives',
    },
    lineage: {
      tenantId: 'tenant-1',
      actor: { id: 'owner-1' },
      origin: 'cli',
      correlationId: 'flow-1',
      idempotencyKey: 'plan:flow-1:r1',
      sourceRef: 'DIRECTIVES.md',
    },
    source: {
      sourceKind: 'directives',
      brainContext: {
        directives: '# Directives',
        memory: 'memory',
        retro: '',
        debt: [],
        patterns: '',
        decisions: '',
        existingTasks: [],
        projectState: { gitStatus: '', fileTree: ['src/a.ts'] },
      },
    },
    previewOptions: { mode: 'structured' },
    ...overrides,
  } as any;
}

describe('run-flow-plan-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storedPlans.clear();
    mocks.operationOrder.length = 0;
    mocks.trackedFilesAvailable = true;
    mocks.generatePlanPreview.mockResolvedValue(preview());
    mocks.compileRunProposal.mockResolvedValue({ directivesMarkdown: '# Compiled' });
    mocks.normalizePlannerDependencies.mockImplementation((tasks: any[]) => {
      const byTitle = new Map(tasks.map(item => [item.title, item.id]));
      for (const item of tasks) {
        item.dependencies = item.dependencies.map((ref: string) => byTitle.get(ref) ?? ref);
      }
      return { resolvedCount: 0, dropped: [] };
    });
    mocks.computeExecutionPlanDigestV3.mockImplementation((plannedSprint: any) => {
      mocks.operationOrder.push(`digest:${plannedSprint.tasks.flatMap((item: any) => item.dependencies).join(',')}`);
      return {
        digest: 'digest-final',
        version: 3,
        projection: {},
        budgetHolds: [],
        topology,
      };
    });
    mocks.evaluateScopeGate.mockReturnValue({
      ok: true,
      verdicts: [],
      advisories: [],
      resolutions: [],
    });
    mocks.applyScopeResolutions.mockImplementation((_taskId, filesWrite) => ({
      filesWrite: [...filesWrite],
      applied: [],
    }));
    mocks.proposeFlow.mockImplementation(() => {
      mocks.operationOrder.push('proposal-event');
      return { applied: true, context: { state: 'PREVIEWING' }, sequence: 2 };
    });
    mocks.recordPreview.mockImplementation(({ preview: planPreview }) => {
      mocks.operationOrder.push('preview-event');
      return {
        applied: true,
        context: {
          state: 'AWAITING_APPROVAL',
          flowId: planPreview.flowId,
          preview: planPreview,
        },
        sequence: 3,
      };
    });
    mocks.decideRunFlow.mockImplementation((_root, flowId, decision) => ({
      state: 'APPROVED',
      flowId,
      approvedSnapshot: {
        flowId,
        revision: 1,
        planDigest: 'digest-final',
        approvedBy: decision.actor,
        approvedAt: '2026-07-28T00:00:00.000Z',
      },
    }));
  });

  it('normalizes dependencies and scope before the final digest, then persists before events', async () => {
    const plannedSprint = sprint([
      task(),
      task({
        id: '001-002',
        title: 'Second',
        description: 'second',
        scope: {
          directories: ['src'],
          filesRead: [],
          filesWrite: ['wrong/a.ts'],
        },
        dependencies: ['First'],
      }),
    ]);
    mocks.generatePlanPreview.mockResolvedValue(preview(plannedSprint));
    mocks.evaluateScopeGate
      .mockReturnValueOnce({
        ok: true,
        verdicts: [],
        advisories: [],
        resolutions: [{
          taskId: '001-002',
          path: 'wrong/a.ts',
          action: 'auto-replace',
          replacement: 'src/a.ts',
          reason: 'unique basename',
        }],
      })
      .mockReturnValueOnce({
        ok: true,
        verdicts: [],
        advisories: [],
        resolutions: [],
      });
    mocks.applyScopeResolutions.mockReturnValue({
      filesWrite: ['src/a.ts'],
      applied: [{
        taskId: '001-002',
        path: 'wrong/a.ts',
        action: 'auto-replace',
        replacement: 'src/a.ts',
        reason: 'unique basename',
        appliedAction: 'replaced',
      }],
    });

    const result = await planRunFlow(input());

    expect(mocks.generatePlanPreview).toHaveBeenCalledOnce();
    expect(mocks.compileRunProposal).not.toHaveBeenCalled();
    expect(result.sprint.tasks[1]?.dependencies).toEqual(['001-001']);
    expect(result.sprint.tasks[1]?.scope.filesWrite).toEqual(['src/a.ts']);
    expect(result.planDigest).toBe('digest-final');
    expect(mocks.operationOrder).toEqual([
      'digest:001-001',
      'save-plan',
      'proposal-event',
      'preview-event',
    ]);
    expect(result.sourceAuthority).toMatchObject({
      sourceKind: 'directives',
      contentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      configSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      planningInputSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      scopeInputSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('compiles an intent exactly once and can approve the same persisted snapshot', async () => {
    const result = await planRunFlow(input({
      source: {
        sourceKind: 'intent',
        baseContext: input().source.brainContext,
      },
      approval: { actor: { id: 'owner-1' } },
    }));

    expect(mocks.compileRunProposal).toHaveBeenCalledOnce();
    expect(mocks.generatePlanPreview).toHaveBeenCalledOnce();
    expect(mocks.generatePlanPreview.mock.calls[0]?.[2]).toMatchObject({
      directives: '# Compiled',
      memory: 'memory',
    });
    expect(mocks.decideRunFlow).toHaveBeenCalledWith('/project', 'flow-1', {
      decision: 'approve',
      actor: { id: 'owner-1' },
    });
    expect(result.approval).toBe('approved');
  });

  it('reuses an exact durable plan on idempotent retry without compiling or planning again', async () => {
    const first = await planRunFlow(input());
    vi.clearAllMocks();

    const second = await planRunFlow(input());

    expect(second.reusedDurablePlan).toBe(true);
    expect(second.planDigest).toBe(first.planDigest);
    expect(mocks.compileRunProposal).not.toHaveBeenCalled();
    expect(mocks.generatePlanPreview).not.toHaveBeenCalled();
  });

  it('refuses unresolved dependencies before any durable mutation', async () => {
    mocks.normalizePlannerDependencies.mockReturnValue({
      resolvedCount: 0,
      dropped: [{
        taskId: '001-001',
        ref: 'Missing',
        looksLikePlanSlotId: false,
      }],
    });

    await expect(planRunFlow(input())).rejects.toMatchObject({
      code: 'UNRESOLVED_DEPENDENCY',
    });
    expect(mocks.storedPlans.size).toBe(0);
    expect(mocks.proposeFlow).not.toHaveBeenCalled();
  });

  it('keeps topology-denied plans unapproved even when an approval actor is supplied', async () => {
    mocks.computeExecutionPlanDigestV3.mockReturnValue({
      digest: 'digest-blocked',
      version: 3,
      projection: {},
      budgetHolds: [],
      topology: { ...topology, verdict: 'block' },
    });

    await expect(planRunFlow(input({
      approval: { actor: { id: 'owner-1' } },
    }))).rejects.toBeInstanceOf(RunFlowPlanServiceError);
    expect(mocks.decideRunFlow).not.toHaveBeenCalled();
    expect(mocks.storedPlans.get('flow-1')?.preview).toMatchObject({
      policyDecision: 'deny',
      topologyGateResult: 'fail',
    });
  });

  it('persists an explicit scope HOLD and refuses approval when tracked-file evidence is unavailable', async () => {
    mocks.trackedFilesAvailable = false;

    await expect(planRunFlow(input({
      approval: { actor: { id: 'owner-1' } },
    }))).rejects.toMatchObject({ code: 'SCOPE_GATE_HOLD' });

    expect(mocks.decideRunFlow).not.toHaveBeenCalled();
    expect(mocks.storedPlans.get('flow-1')?.preview).toMatchObject({
      policyDecision: 'deny',
      scopeGateResult: 'fail',
    });
  });
});
