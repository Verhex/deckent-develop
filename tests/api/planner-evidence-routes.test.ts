import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

const state = vi.hoisted(() => ({
  code: 'PLANNER_EVIDENCE_HOLD',
  hostile: 'SECRET receipt body /private/path',
}));

function refusalError(): Error & { code: string } {
  return Object.assign(new Error(state.hostile), { code: state.code });
}

const approvedContext = {
  state: 'APPROVED',
  proposal: { tenant: 'local', actor: { id: 'owner' }, origin: 'api' },
  approvedSnapshot: { revision: 1, planDigest: 'digest-1' },
};

vi.mock('../../src/core/config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/config.js')>()),
  loadConfig: vi.fn(async () => ({
    language: 'en',
    terminal: { run_flow_v2: true },
    activeModeConfig: { max_workers: 1 },
  })),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  readContext: vi.fn(() => ({
    directives: '', memory: '', retro: '', debt: [], patterns: '', decisions: '',
    existingTasks: [], projectState: { gitStatus: '', fileTree: [] },
  })),
}));

vi.mock('../../src/orchestra/run-flow-coordinator-registry.js', () => ({
  getRunFlowCoordinator: vi.fn(() => ({
    getFlow: vi.fn(() => approvedContext),
    listFlows: vi.fn(() => ['flow-1']),
  })),
  _resetRunFlowCoordinatorsForTests: vi.fn(),
}));

vi.mock('../../src/orchestra/run-flow-plan-service.js', () => ({
  planRunFlow: vi.fn(async () => { throw refusalError(); }),
}));

vi.mock('../../src/orchestra/run-flow-decision-service.js', () => ({
  decideRunFlow: vi.fn(() => { throw refusalError(); }),
  startRunFlow: vi.fn(() => { throw refusalError(); }),
  RunFlowDecisionError: class RunFlowDecisionError extends Error {},
}));

vi.mock('../../src/core/run-jobs-read.js', () => ({
  readTerminalJobClosures: vi.fn(() => new Map()),
}));

vi.mock('../../src/api/auth-me-endpoint.js', () => ({
  deriveRequestPrincipal: vi.fn(() => ({ id: 'api-static', claimsVerified: false })),
}));

import { registerRunFlowRoutes } from '../../src/api/run-flow-routes.js';
import { planRunFlow } from '../../src/orchestra/run-flow-plan-service.js';
import { decideRunFlow, startRunFlow } from '../../src/orchestra/run-flow-decision-service.js';

type CapturedResponse = {
  status: number;
  body: unknown;
};

function responseCapture(): { response: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 200, body: undefined };
  const response = {
    writeHead(status: number) { captured.status = status; return this; },
    end(body?: string) { captured.body = body ? JSON.parse(body) : undefined; return this; },
  } as unknown as ServerResponse;
  return { response, captured };
}

async function invoke(path: string, body: unknown): Promise<CapturedResponse> {
  const { response, captured } = responseCapture();
  const handled = await registerRunFlowRoutes(
    `/api/run-flow/${path}`,
    'POST',
    response,
    body,
    '/fixture',
    { headers: {} } as IncomingMessage,
  );
  expect(handled).toBe(true);
  return captured;
}

const CODES = [
  'PLANNER_EVIDENCE_HOLD',
  'PLANNER_EVIDENCE_REPLAN_REQUIRED',
  'EXACT_START_PLANNER_EVIDENCE_HOLD',
  'EXACT_START_PLANNER_EVIDENCE_REPLAN_REQUIRED',
] as const;

describe('registered API planner-evidence refusal routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const route of [
    { path: 'propose', body: { intentSummary: 'safe plan' } },
    { path: 'flow-1/decision', body: { decision: 'approve' } },
    { path: 'flow-1/start', body: {} },
  ] as const) {
    it.each(CODES)(`${route.path} returns HTTP 409 for %s without raw evidence`, async (code) => {
      state.code = code;

      const result = await invoke(route.path, route.body);

      expect(result.status).toBe(409);
      expect(result.body).toEqual({
        error: code,
        code,
        nextAction: code.includes('REPLAN') ? 'replan' : 'inspect-evidence',
      });
      expect(JSON.stringify(result.body)).not.toContain(state.hostile);
      const expectedService = route.path === 'propose'
        ? planRunFlow
        : route.path.endsWith('/decision') ? decideRunFlow : startRunFlow;
      expect(expectedService).toHaveBeenCalledTimes(1);
    });
  }

  it('preserves the existing proposal response for an unknown error', async () => {
    state.code = 'UNKNOWN_DOMAIN_CODE';

    const result = await invoke('propose', { intentSummary: 'safe plan' });

    expect(result.status).toBe(502);
    expect(result.body).toEqual({ error: state.hostile });
    expect(planRunFlow).toHaveBeenCalledTimes(1);
  });
});
