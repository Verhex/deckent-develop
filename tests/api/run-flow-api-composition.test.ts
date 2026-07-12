// ═══ run-flow API composition tests — TERM-FLOW-UNIFY Sprint-7 dilim (429-010) ═
//
// D73 (TERM-7 kapanışı): tests/api/run-flow-routes.test.ts (429-008) drives
// registerRunFlowRoutes via a LOCAL mini-server (its own header comment:
// "this route is not wired into server.ts yet") and tests/api/
// run-flow-event-stream.test.ts (429-009) exercises the SSE pub/sub through
// direct publishRunFlowEvent() calls in isolation. Neither proves the two
// modules actually COMPOSE through the real production dispatch chain
// (server.ts's createHttpServer: auth-gate -> rate-limit -> route table).
// This file is the missing route-level e2e: propose -> preview -> approve ->
// state, and SSE event ordering, both driven through the REAL wired server
// (tests/api/test-server-helper.ts's startTestServer, same harness 429-009
// used) with a fake NL->plan planner (hermetic, no provider spawn) and
// mock-auth (auth-gate disabled via disableAuth, but a real unsigned JWT
// bearer still drives deriveRequestPrincipal's tenant/actor claims —
// mirrors 429-008's own fakeJwt/bearerHeaders technique).
//
// KNOWN GAP (see .result notes / docImpact): registerRunFlowRoutes never
// calls publishRunFlowEvent — the REST transition sites and the SSE
// pub/sub are two independently-correct but NOT wired-together modules
// (429-009's own header comment already flags this as a follow-up outside
// its write authority). The "SSE event order" test below therefore
// publishes the SAME-SHAPED RunFlowEvent sequence the real propose/decision
// chain produced (built from the actual REST response payloads, not
// invented fixtures) onto the live SSE stream for the real flowId, proving
// wire-level ordering + versioned-shape fidelity — not that routes.ts
// auto-publishes today (it doesn't).
//
// Hermetic: real tmpdir project root (test-server-helper's startTestServer),
// orchestra/brain.js's planSprint/readContext mocked (same pattern as
// 429-008's own tests/api/run-flow-routes.test.ts), a fake RunProposalPlanner
// injected via setRunFlowProposalPlanner for every propose() call so no real
// provider CLI is ever spawned.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

vi.mock('../../src/orchestra/brain.js', () => ({
  planSprint: vi.fn(),
  readContext: vi.fn(),
}));

import { planSprint, readContext } from '../../src/orchestra/brain.js';
import {
  setRunFlowProposalPlanner,
  _resetRunFlowRoutesState,
} from '../../src/api/run-flow-routes.js';
import {
  publishRunFlowEvent,
  _resetRunFlowEventStreamState,
} from '../../src/api/run-flow-event-stream.js';
import type { RunProposalPlanner } from '../../src/orchestra/run-proposal-compiler.js';
import { SprintStatus, SprintPhase, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, PlannerResult, PlannerTask } from '../../src/core/types.js';
import {
  RUN_FLOW_EVENT_SCHEMA_VERSION,
  type RunFlowContext,
  type RunFlowEvent,
  type PlanPreview,
} from '../../src/core/run-flow-contract.js';
import { startTestServer, call, type TestServerHandle } from './test-server-helper.js';

const mockPlanSprint = vi.mocked(planSprint);
const mockReadContext = vi.mocked(readContext);

// ─── Fixtures (mirrors tests/api/run-flow-routes.test.ts, 429-008) ────────

function makeBrainContext() {
  return {
    directives: '', memory: '', retro: '', debt: [], patterns: '', decisions: '',
    existingTasks: [], projectState: { gitStatus: '', fileTree: [] },
  };
}

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: '001-001', title: 'Do the thing', description: 'Do the thing well.', model: 'sonnet',
    effort: 'normal', priority: 'NORMAL', reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING, sprintId: 'sprint-001', createdAt: new Date(0).toISOString(),
    ...overrides,
  } as Task;
}

function makeSprint(overrides?: Partial<Sprint>): Sprint {
  return {
    id: 'sprint-001', number: 1,
    status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
    tasks: [makeTask()], workers: ['w-001-001'],
    ...overrides,
  };
}

function makePlannerTask(overrides?: Partial<PlannerTask>): PlannerTask {
  return {
    title: 'Backend export endpoint',
    description: 'Add POST /export handler.',
    model: 'sonnet', effort: 'normal', priority: 'NORMAL',
    reason: 'Single-module CRUD change.',
    scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/export.ts'] },
    dependencies: [],
    goNogo: {
      goCriteria: 'POST /export returns 200.',
      noGoCriteria: 'Endpoint 500s.',
      techDebtAcceptable: '',
    },
    ...overrides,
  };
}

function makePlannerResult(): PlannerResult {
  return { reasoning: 'Single task.', tasks: [makePlannerTask()] };
}

const fakePlanner: RunProposalPlanner = () => makePlannerResult();

/** Minimal fake JWT whose payload carries the given claims — parseOidcClaims
 *  decodes WITHOUT verifying the signature, so this is enough to drive
 *  deriveRequestPrincipal's tenant/actor derivation (same helper as
 *  tests/api/missions-route.test.ts / tests/api/run-flow-routes.test.ts). */
function fakeJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.fakesig`;
}

function bearerHeaders(claims: Record<string, unknown>): Record<string, string> {
  return { Authorization: `Bearer ${fakeJwt(claims)}` };
}

// ─── SSE collection helper (mirrors tests/api/run-flow-event-stream.test.ts) ──

async function collectSse(
  baseUrl: string,
  path: string,
  opts: { until: (body: string) => boolean; timeoutMs?: number },
): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 2500);
  let body = '';
  let status = 0;
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
    });
    status = res.status;
    if (!res.body || status !== 200) {
      try {
        body = await res.text();
      } catch {
        /* aborted / empty */
      }
      return { status, body };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
      if (opts.until(body)) break;
    }
  } catch {
    // abort on timeout — return what was collected
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  return { status, body };
}

function sseEventTypes(body: string): string[] {
  return body
    .split('\n\n')
    .filter((frame) => frame.startsWith('event: '))
    .map((frame) => frame.split('\n')[0]!.slice('event: '.length));
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Setup ──────────────────────────────────────────────────────────────

let handle: TestServerHandle | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  _resetRunFlowRoutesState();
  _resetRunFlowEventStreamState();
  setRunFlowProposalPlanner(fakePlanner);
  mockReadContext.mockReturnValue(makeBrainContext() as any);
  mockPlanSprint.mockReturnValue(makeSprint() as any);
});

afterEach(async () => {
  setRunFlowProposalPlanner(undefined);
  _resetRunFlowRoutesState();
  _resetRunFlowEventStreamState();
  if (handle) {
    await handle.close();
    handle = null;
  }
});

async function boot(): Promise<TestServerHandle> {
  // mock-auth: auth-gate disabled (bearerAuthMiddleware bypassed) while a
  // real fake-signed JWT is still attached per-request below so
  // deriveRequestPrincipal's tenant/actor derivation is exercised through
  // the real dispatch — never a bespoke local server (429-008's gap).
  handle = await startTestServer({
    disableAuth: true,
    seed: { config: { terminal: { run_flow_v2: true } } },
  });
  return handle;
}

// ─── Route-level e2e: propose -> preview -> approve -> state (real server) ──

describe('run-flow API composition — propose -> preview -> approve -> state (real wired server)', () => {
  it('drives the full chain through the REAL createHttpServer dispatch (auth-gate + route table), not a local mini-server', async () => {
    const h = await boot();
    const actorHeaders = bearerHeaders({ sub: 'alperen', tenant: 'acme', role: 'operator' });

    // propose
    const proposeRes = await call(h, '/api/run-flow/propose', {
      method: 'POST',
      headers: actorHeaders,
      body: JSON.stringify({ intentSummary: 'Fix the flaky retry test' }),
    });
    expect(proposeRes.status).toBe(201);
    const proposed = proposeRes.json<RunFlowContext>();
    expect(proposed.state).toBe('AWAITING_APPROVAL');
    expect(proposed.proposal?.tenant).toBe('acme');
    expect(proposed.proposal?.origin).toBe('api');
    const flowId = proposed.flowId!;

    // preview (already embedded in propose response, but re-fetched to prove
    // the GET composes with the same in-process flowStore through the real
    // route table)
    const previewRes = await call(h, `/api/run-flow/${flowId}/preview`, {
      headers: actorHeaders,
    });
    expect(previewRes.status).toBe(200);
    const preview = previewRes.json<PlanPreview>();
    expect(preview.planDigest).toBe(proposed.preview!.planDigest);
    expect(preview.taskSummaries).toEqual([{ title: 'Do the thing', summary: 'Do the thing well.' }]);

    // state (mid-chain)
    const midStateRes = await call(h, `/api/run-flow/${flowId}`, { headers: actorHeaders });
    expect(midStateRes.status).toBe(200);
    expect(midStateRes.json<RunFlowContext>().state).toBe('AWAITING_APPROVAL');

    // approve
    const decisionRes = await call(h, `/api/run-flow/${flowId}/decision`, {
      method: 'POST',
      headers: actorHeaders,
      body: JSON.stringify({ decision: 'approve' }),
    });
    expect(decisionRes.status).toBe(200);
    const approved = decisionRes.json<RunFlowContext>();
    expect(approved.state).toBe('APPROVED');
    expect(approved.approvedSnapshot?.planDigest).toBe(preview.planDigest);
    expect(approved.approvedSnapshot?.approvedBy).toEqual({ id: 'alperen', role: 'operator' });

    // state (post-approve — the "state" step of the zincir)
    const finalStateRes = await call(h, `/api/run-flow/${flowId}`, { headers: actorHeaders });
    expect(finalStateRes.status).toBe(200);
    const finalState = finalStateRes.json<RunFlowContext>();
    expect(finalState.state).toBe('APPROVED');
    expect(finalState.approvedSnapshot).toEqual(approved.approvedSnapshot);
  });

  it('reject path composes end-to-end too: propose -> reject -> CANCELLED state', async () => {
    const h = await boot();
    const proposeRes = await call(h, '/api/run-flow/propose', {
      method: 'POST',
      body: JSON.stringify({ intentSummary: 'Ship it' }),
    });
    const flowId = proposeRes.json<RunFlowContext>().flowId!;

    const decisionRes = await call(h, `/api/run-flow/${flowId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision: 'reject', reason: 'not now' }),
    });
    expect(decisionRes.status).toBe(200);
    expect(decisionRes.json<RunFlowContext>().state).toBe('CANCELLED');

    const stateRes = await call(h, `/api/run-flow/${flowId}`);
    expect(stateRes.json<RunFlowContext>().state).toBe('CANCELLED');
    expect(stateRes.json<RunFlowContext>().cancelReason).toBe('rejected');
  });

  it('tenant isolation still holds when routed through the real (mock-auth) dispatch', async () => {
    const h = await boot();
    const proposeRes = await call(h, '/api/run-flow/propose', {
      method: 'POST',
      headers: bearerHeaders({ sub: 'alice', tenant: 'acme' }),
      body: JSON.stringify({ intentSummary: 'Ship it' }),
    });
    const flowId = proposeRes.json<RunFlowContext>().flowId!;

    const crossTenantRes = await call(h, `/api/run-flow/${flowId}`, {
      headers: bearerHeaders({ sub: 'mallory', tenant: 'globex' }),
    });
    expect(crossTenantRes.status).toBe(404);
  });
});

// ─── SSE event order over the composed real server ─────────────────────────

describe('run-flow API composition — SSE event order (real wired server)', () => {
  it('a live subscriber on the REAL flowId (from an actual propose() response) observes the chain events in publish order, shape-consistent with the REST responses', async () => {
    const h = await boot();
    const actorHeaders = bearerHeaders({ sub: 'alperen', tenant: 'acme' });

    const proposeRes = await call(h, '/api/run-flow/propose', {
      method: 'POST',
      headers: actorHeaders,
      body: JSON.stringify({ intentSummary: 'Fix the flaky retry test' }),
    });
    const proposed = proposeRes.json<RunFlowContext>();
    const flowId = proposed.flowId!;
    const preview = proposed.preview!;

    const decisionRes = await call(h, `/api/run-flow/${flowId}/decision`, {
      method: 'POST',
      headers: actorHeaders,
      body: JSON.stringify({ decision: 'approve' }),
    });
    const approved = decisionRes.json<RunFlowContext>();

    // KNOWN GAP (see file header + .result docImpact): registerRunFlowRoutes
    // does not itself call publishRunFlowEvent, so nothing above already
    // reached the stream. Publish the SAME-SHAPED event sequence the real
    // chain produced onto the flowId the real chain assigned, then verify
    // wire-order + versioned-shape fidelity through the real SSE endpoint.
    const chainEvents: RunFlowEvent[] = [
      { schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION, flowId, timestamp: '2026-07-12T00:00:00.000Z', type: 'PROPOSAL_SUBMITTED', proposal: proposed.proposal! },
      { schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION, flowId, timestamp: '2026-07-12T00:00:01.000Z', type: 'PREVIEW_STARTED', revision: preview.revision },
      { schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION, flowId, timestamp: '2026-07-12T00:00:02.000Z', type: 'PREVIEW_READY', preview },
      { schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION, flowId, timestamp: '2026-07-12T00:00:03.000Z', type: 'APPROVAL_GRANTED', revision: approved.approvedSnapshot!.revision, planDigest: approved.approvedSnapshot!.planDigest, approvedBy: approved.approvedSnapshot!.approvedBy },
    ];
    const publishOrder = chainEvents.map((e) => e.type);

    const streamPromise = collectSse(
      h.baseUrl,
      `/api/run-flow/${flowId}/events`,
      { until: (body) => sseEventTypes(body).length >= chainEvents.length },
    );
    await sleep(200); // let the SSE subscription settle before publishing
    for (const event of chainEvents) {
      publishRunFlowEvent(event);
    }

    const { status, body } = await streamPromise;
    expect(status).toBe(200);
    expect(sseEventTypes(body)).toEqual(publishOrder);

    // Shape fidelity: the PREVIEW_READY frame's payload matches the exact
    // preview object the REST /propose response returned.
    const frames = body.split('\n\n').filter(Boolean);
    const previewFrame = frames.find((f) => f.startsWith('event: PREVIEW_READY'))!;
    const dataLine = previewFrame.split('\n').find((l) => l.startsWith('data: '))!;
    const parsed = JSON.parse(dataLine.slice('data: '.length)) as RunFlowEvent & { type: 'PREVIEW_READY' };
    expect(parsed.preview).toEqual(preview);
  });

  it('global-broadcast guard still holds inside the composed server: a different flowId does not see this flow\'s events', async () => {
    const h = await boot();
    const proposeRes = await call(h, '/api/run-flow/propose', {
      method: 'POST',
      body: JSON.stringify({ intentSummary: 'Ship it' }),
    });
    const flowId = proposeRes.json<RunFlowContext>().flowId!;

    const otherFlowStream = collectSse(
      h.baseUrl,
      '/api/run-flow/some-other-flow/events',
      { until: (b) => b.length > 0, timeoutMs: 800 },
    );
    await sleep(200);
    publishRunFlowEvent({
      schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
      flowId,
      timestamp: '2026-07-12T00:00:00.000Z',
      type: 'PREVIEW_STARTED',
      revision: 1,
    });
    const { status, body } = await otherFlowStream;
    expect(status).toBe(200);
    expect(sseEventTypes(body)).toEqual([]);
  });
});
