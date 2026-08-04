import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const {
  planSprint,
  readContext,
  startSprintDetached,
} = vi.hoisted(() => ({
  planSprint: vi.fn(),
  readContext: vi.fn(() => ({
    directives: '',
    memory: '',
    retro: '',
    debt: [],
    patterns: '',
    decisions: '',
    existingTasks: [],
    projectState: { gitStatus: '', fileTree: [] },
  })),
  startSprintDetached: vi.fn(() => ({ jobId: 'job-unexpected' })),
}));

vi.mock('../../src/orchestra/brain.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/orchestra/brain.js')>()),
  planSprint,
  readContext,
}));

vi.mock('../../src/api/sprint-job-runner.js', () => ({
  startSprintDetached,
}));

import type { ProviderAuthorityRuntimeServiceOpenResult } from '../../src/core/provider-authority-composition.js';
import {
  _resetRunFlowRoutesState,
  setRunFlowProposalPlanner,
} from '../../src/api/run-flow-routes.js';
import { getRunFlowCoordinator } from '../../src/orchestra/run-flow-coordinator-registry.js';
import { savePlannedSprint, loadRunHandle } from '../../src/core/run-flow-store.js';
import {
  RUN_FLOW_EVENT_SCHEMA_VERSION,
  type PlanPreview,
  type RunProposal,
} from '../../src/core/run-flow-contract.js';
import {
  SprintPhase,
  SprintStatus,
  TaskStatus,
  type Sprint,
} from '../../src/core/types.js';
import { call, startTestServer, type TestServerHandle } from './test-server-helper.js';
import { _resetActiveJob } from '../../src/api/server.js';

const AUTHORITY_REF = `provider-authority:${'d'.repeat(64)}`;
const providerAuthority: ProviderAuthorityRuntimeServiceOpenResult = {
  state: 'hold',
  reasonCode: 'keyring_unavailable',
  authorityEvidenceRef: AUTHORITY_REF,
  retryable: false,
  close: vi.fn(),
};

const sprint: Sprint = {
  id: 'sprint-api-authority',
  number: 1,
  status: SprintStatus.PLANNING,
  phase: SprintPhase.PLAN,
  tasks: [{
    id: 'api-authority-001',
    sprintId: 'sprint-api-authority',
    title: 'Provider-free fixture',
    description: 'Must never dispatch in this test.',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'fixture',
    scope: { directories: ['docs/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: {
      goCriteria: 'No provider work occurs.',
      noGoCriteria: 'Provider work occurs.',
      techDebtAcceptable: '',
    },
    status: TaskStatus.PENDING,
    createdAt: new Date(0).toISOString(),
  }],
  workers: ['worker-api-authority-001'],
};

let handle: TestServerHandle | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  _resetActiveJob();
  _resetRunFlowRoutesState();
});

afterEach(async () => {
  setRunFlowProposalPlanner(undefined);
  _resetRunFlowRoutesState();
  if (handle) {
    await handle.close();
    handle = null;
  }
});

async function boot(): Promise<TestServerHandle> {
  handle = await startTestServer({
    disableAuth: true,
    providerAuthority,
    seed: {
      config: {
        brain_provider: 'claude',
        worker_provider: 'claude',
        spawn_backend: 'docker',
        provider_fallback: {
          brain: ['codex', 'gemini'],
          unattended: false,
        },
        activeModeConfig: {
          brain_model: 'claude-fable-5',
          default_model: 'claude-sonnet-5',
          max_workers: 4,
        },
        terminal: { run_flow_v2: true },
      },
    },
  });
  return handle;
}

function expectHold(
  response: Awaited<ReturnType<typeof call>>,
  executionPrefix: string,
): void {
  expect(response.status).toBe(503);
  expect(response.json()).toMatchObject({
    code: 'PROVIDER_EXECUTION_AUTHORITY_HOLD',
    providerAuthorityHold: {
      executionId: expect.stringMatching(new RegExp(`^${executionPrefix}`)),
      role: 'brain',
      purpose: 'sprint-planning',
      reasonCode: 'keyring_unavailable',
      authorityEvidenceRefs: expect.arrayContaining([AUTHORITY_REF]),
      durableEvidenceWritten: true,
    },
  });
}

describe('HTTP Brain provider-authority front door', () => {
  it('retires direct start (410) and HOLDs plan before context read, planner, or detached spawn', async () => {
    const h = await boot();

    // FAZ4B: /api/start emekli — provider-authority kapısına dahi gelmeden
    // 410 LEGACY_START_RETIRED döner; hiçbir provider işi mümkün değildir.
    const startResponse = await call(h, '/api/start', {
      method: 'POST',
      body: JSON.stringify({ autoApprove: true }),
    });
    expect(startResponse.status).toBe(410);
    expect(startResponse.json()).toMatchObject({ code: 'LEGACY_START_RETIRED' });

    const planResponse = await call(h, '/api/plan', {
      method: 'POST',
      body: JSON.stringify({ mode: 'ai' }),
    });
    expectHold(planResponse, 'api-plan-');

    expect(startSprintDetached).not.toHaveBeenCalled();
    expect(readContext).not.toHaveBeenCalled();
    expect(planSprint).not.toHaveBeenCalled();
  });

  it('HOLDs RunFlow propose before planner or flow persistence', async () => {
    const planner = vi.fn();
    setRunFlowProposalPlanner(planner);
    const h = await boot();

    const response = await call(h, '/api/run-flow/propose', {
      method: 'POST',
      body: JSON.stringify({ intentSummary: 'Do not spend provider budget' }),
    });
    expectHold(response, 'api-run-flow-propose-');
    expect(planner).not.toHaveBeenCalled();
    expect(planSprint).not.toHaveBeenCalled();
    expect(getRunFlowCoordinator(h.projectRoot).listFlows()).toEqual([]);
  });

  it('HOLDs an approved RunFlow before START_REQUESTED, run handle, or detached spawn', async () => {
    const h = await boot();
    const flowId = 'flow-api-provider-authority';
    const proposal: RunProposal = {
      flowId,
      tenant: 'local',
      project: 'fixture',
      actor: { id: 'fixture-owner' },
      origin: 'api',
      revision: 1,
      intentSummary: 'Exercise the provider-authority gate',
    };
    const preview: PlanPreview = {
      schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
      flowId,
      revision: 1,
      planDigest: 'a'.repeat(64),
      taskSummaries: [],
      policyDecision: { decision: 'allow', reasons: [] },
      gateResult: { decision: 'GO', failures: [], warnings: [] },
    };
    const coordinator = getRunFlowCoordinator(h.projectRoot);
    coordinator.proposeFlow({ proposal });
    coordinator.recordPreview({ preview });
    coordinator.grantApproval({
      flowId,
      revision: 1,
      planDigest: preview.planDigest,
      approvedBy: { id: 'fixture-owner' },
    });
    savePlannedSprint(h.projectRoot, flowId, {
      revision: 1,
      sprint,
      planDigest: preview.planDigest,
    });

    const response = await call(h, `/api/run-flow/${flowId}/start`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expectHold(response, `api-run-flow-start-${flowId}`);
    expect(coordinator.getFlow(flowId).state).toBe('APPROVED');
    expect(loadRunHandle(h.projectRoot, flowId)).toBeUndefined();
    expect(startSprintDetached).not.toHaveBeenCalled();
  });

  it('writes one exact unattended Brain HOLD event per rejected ingress', async () => {
    const h = await boot();
    // FAZ4B: /api/start emekli (410, authority-preflight çalışmaz, event
    // yazmaz) — HOLD-kanıt zinciri artık canlı Brain ingress'i /api/plan
    // üzerinden sürülür.
    await call(h, '/api/plan', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const eventsDir = join(h.projectRoot, '.deckent', 'recently-works');
    const files = existsSync(eventsDir)
      ? readdirSync(eventsDir).filter(name => name.endsWith('-events.jsonl'))
      : [];
    expect(files).toHaveLength(1);
    const content = await import('node:fs/promises')
      .then(fs => fs.readFile(join(eventsDir, files[0]!), 'utf8'));
    const event = JSON.parse(content.trim()) as {
      channel: string;
      payload: Record<string, unknown>;
    };
    expect(event).toMatchObject({
      channel: 'BRAIN→AUDITOR:PROVIDER_AUTHORITY_HOLD',
      payload: {
        role: 'brain',
        purpose: 'sprint-planning',
        provider: 'claude',
        model: 'claude-opus-5',
        configuredBackend: 'unresolved-before-provider-bootstrap',
        fallbackProviders: ['codex', 'gemini'],
        unattended: true,
        reasonCode: 'keyring_unavailable',
      },
    });
  });
});
