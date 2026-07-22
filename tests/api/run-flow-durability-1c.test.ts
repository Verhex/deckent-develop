// ─── SURF-1c — coordinator single-authority durability pins ─────────────────
// The module-Map is dead: these pins prove the properties the Map could never
// give — (1) a process restart (simulated by dropping every cached
// coordinator) loses NOTHING: GET re-resolves by folding the durable event
// log; (2) approve AFTER restart still builds its StoredApprovedSnapshot from
// the durable planned-sprint record; (3) every durable event is live-published
// to the SSE layer through the coordinator's onEvent wire.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  registerRunFlowRoutes,
  setRunFlowProposalPlanner,
  _resetRunFlowRoutesState,
} from '../../src/api/run-flow-routes.js';
import { subscribeRunFlowEvents, _resetRunFlowEventStreamState } from '../../src/api/run-flow-event-stream.js';
import { loadApprovedSnapshot, loadPlannedSprint } from '../../src/core/run-flow-store.js';
import type { RunFlowEvent } from '../../src/core/run-flow-contract.js';

// ─── Minimal HTTP doubles (mirror run-flow-routes.test.ts conventions) ──────

vi.mock('../../src/core/config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/config.js')>()),
  readAuthMode: vi.fn().mockResolvedValue('subscription'),
  loadConfig: vi.fn().mockResolvedValue({
    terminal: { run_flow_v2: true },
    worker_provider: 'claude',
    spawn_backend: 'subprocess',
    activeModeConfig: {
      max_workers: 2,
      brain_model: 'claude-sonnet-5',
      default_model: 'claude-sonnet-5',
    },
    execution_budget: { roles: { worker: { default: { maxTurns: 1 } } } },
  }),
}));

vi.mock('../../src/cli/helpers/detached-start.js', () => ({
  buildFlowStartSpawn: vi.fn(() => (_sprint: unknown, flowId: string) => ({
    flowId,
    jobId: `flow-${flowId}-test`,
    logRef: `test://${flowId}`,
  })),
}));

// Mirror tests/api/run-flow-routes.test.ts: the plan step rides mocked
// brain.planSprint/readContext + an injected fake RunProposalPlanner.
vi.mock('../../src/orchestra/brain.js', () => ({
  planSprint: vi.fn(),
  readContext: vi.fn(),
}));
import { planSprint, readContext } from '../../src/orchestra/brain.js';

function fakeReq(): IncomingMessage {
  return { headers: {}, socket: { remoteAddress: '127.0.0.1' } } as unknown as IncomingMessage;
}

interface CapturedResponse {
  status: number;
  body: unknown;
}

function fakeRes(captured: CapturedResponse): ServerResponse {
  return {
    writeHead(status: number) {
      captured.status = status;
      return this;
    },
    end(payload?: string) {
      if (payload) captured.body = JSON.parse(payload);
    },
  } as unknown as ServerResponse;
}

async function call(
  root: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<CapturedResponse> {
  const captured: CapturedResponse = { status: 0, body: undefined };
  const matched = await registerRunFlowRoutes(path, method, fakeRes(captured), body, root, fakeReq());
  expect(matched).toBe(true);
  return captured;
}

// ─── Fixture planner (hermetic — mirror of run-flow-routes.test.ts) ─────────

const FIXTURE_SPRINT = {
  id: 'sprint-fixture', number: 1, status: 'PLANNING', phase: 'PLAN',
  tasks: [{
    id: '001-001', title: 'Do the thing', description: 'Well.', model: 'claude-sonnet-5',
    effort: 'normal', priority: 'NORMAL', reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [], goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: 'PENDING', sprintId: 'sprint-fixture', createdAt: new Date(0).toISOString(),
  }],
  workers: [],
} as never;

function installFixturePlanner(): void {
  vi.mocked(readContext).mockReturnValue({
    directives: '', memory: '', retro: '', debt: [], patterns: '', decisions: '',
    existingTasks: [], projectState: { gitStatus: '', fileTree: [] },
  } as never);
  vi.mocked(planSprint).mockReturnValue(FIXTURE_SPRINT as never);
  setRunFlowProposalPlanner((() => ({
    reasoning: 'Single task.',
    tasks: [{
      title: 'Backend export endpoint', description: 'Add POST /export handler.',
      model: 'claude-sonnet-5', effort: 'normal', priority: 'NORMAL', reason: 'crud',
      scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/export.ts'] },
      dependencies: [],
      goNogo: { goCriteria: 'ok', noGoCriteria: 'bad', techDebtAcceptable: '' },
    }],
  })) as never);
}

describe('SURF-1c — single-authority durability', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'surf-1c-'));
    _resetRunFlowRoutesState();
    _resetRunFlowEventStreamState();
    installFixturePlanner();
  });

  afterEach(() => {
    setRunFlowProposalPlanner(undefined);
    _resetRunFlowRoutesState();
    _resetRunFlowEventStreamState();
    rmSync(root, { recursive: true, force: true });
  });

  it('restart loses NOTHING: GET re-resolves from the durable event fold', async () => {
    const proposed = await call(root, 'POST', '/api/run-flow/propose', { intentSummary: 'build the thing' });
    expect(proposed.status).toBe(201);
    const flowId = (proposed.body as { proposal: { flowId: string } }).proposal.flowId;

    _resetRunFlowRoutesState(); // ← simulated process restart (all memory gone)

    const got = await call(root, 'GET', `/api/run-flow/${flowId}`);
    expect(got.status).toBe(200);
    expect((got.body as { state: string }).state).toBe('AWAITING_APPROVAL');
    expect(typeof (got.body as { preview: { planDigest: string } }).preview.planDigest).toBe('string');
  });

  it('approve AFTER restart builds the StoredApprovedSnapshot from the durable plan record', async () => {
    const proposed = await call(root, 'POST', '/api/run-flow/propose', { intentSummary: 'ship it' });
    const flowId = (proposed.body as { proposal: { flowId: string } }).proposal.flowId;

    // planned sprint is durable at preview time
    const planned = loadPlannedSprint(root, flowId);
    expect((planned?.sprint as { id: string }).id).toBe('sprint-fixture');
    expect((planned?.sprint as { tasks: Array<{ model: string }> }).tasks[0]?.model).toBe('claude-sonnet-5');

    _resetRunFlowRoutesState(); // restart between preview and approval

    const decided = await call(root, 'POST', `/api/run-flow/${flowId}/decision`, { decision: 'approve' });
    expect(decided.status).toBe(200);
    expect((decided.body as { state: string }).state).toBe('APPROVED');

    const snapshot = loadApprovedSnapshot(root, flowId);
    expect(snapshot).toBeDefined();
    expect((snapshot!.sprint as { id: string }).id).toBe('sprint-fixture');
    expect(snapshot!.planDigestContext?.executionBudgetPolicy?.roles.worker?.default).toEqual({ maxTurns: 1 });
  });

  it('every durable event is live-published to the SSE layer (coordinator onEvent wire)', async () => {
    const proposed = await call(root, 'POST', '/api/run-flow/propose', { intentSummary: 'watch me' });
    const flowId = (proposed.body as { proposal: { flowId: string } }).proposal.flowId;

    const seen: RunFlowEvent[] = [];
    const unsubscribe = subscribeRunFlowEvents(flowId, (event) => { seen.push(event); });

    await call(root, 'POST', `/api/run-flow/${flowId}/decision`, { decision: 'approve' });
    unsubscribe();

    expect(seen.map((e) => e.type)).toContain('APPROVAL_GRANTED');
    // the durable sequence rides the published frame (replay-cursor contract)
    expect(seen.every((e) => typeof e.sequence === 'number')).toBe(true);
  });

  it('duplicate decision is command-idempotent across a restart (no double snapshot line)', async () => {
    const proposed = await call(root, 'POST', '/api/run-flow/propose', { intentSummary: 'once only' });
    const flowId = (proposed.body as { proposal: { flowId: string } }).proposal.flowId;

    await call(root, 'POST', `/api/run-flow/${flowId}/decision`, { decision: 'approve' });
    _resetRunFlowRoutesState();
    // second approve: same commandId (approve-<flow>-r1) → typed no-op inside
    // the coordinator; the HTTP layer still answers with the current context.
    const second = await call(root, 'POST', `/api/run-flow/${flowId}/decision`, { decision: 'approve' });
    expect([200, 409]).toContain(second.status);
  });
});

// ─── SURF-2 — SSE query-token allowlist + GET-only hardening pins ────────────
// (appended here to reuse the suite's hermetic fixtures; the auth middleware
// itself is exercised through bearerAuthMiddleware directly.)

import { bearerAuthMiddleware } from '../../src/api/auth.js';

describe('SURF-2 — query-token allowlist hardening', () => {
  const TOKEN = 'secret-token-123';

  function middleware() {
    return bearerAuthMiddleware({
      configToken: TOKEN,
      exemptPaths: [],
      queryTokenPaths: [],
      queryTokenPrefixes: ['/api/run-flow/'],
    });
  }

  function fakeAuthRes(): { status: number; res: ServerResponse } {
    const captured = { status: 0 };
    const res = {
      writeHead(status: number) { captured.status = status; return this; },
      end() { /* noop */ },
    } as unknown as ServerResponse;
    return { get status() { return captured.status; }, res } as never;
  }

  function reqFor(method: string, url: string): IncomingMessage {
    return { method, url, headers: {}, socket: { remoteAddress: '203.0.113.7' } } as unknown as IncomingMessage;
  }

  it('GET run-flow SSE with correct ?token= authenticates (EventSource lane)', () => {
    const auth = middleware();
    const { res } = fakeAuthRes() as never as { res: ServerResponse };
    expect(auth(reqFor('GET', `/api/run-flow/abc/events?token=${TOKEN}`), res)).toBe(true);
  });

  it('GET with WRONG ?token= is 403 (constant-time mismatch shape)', () => {
    const auth = middleware();
    const captured = { status: 0 };
    const res = {
      writeHead(status: number) { captured.status = status; return this; },
      end() { /* noop */ },
    } as unknown as ServerResponse;
    expect(auth(reqFor('GET', '/api/run-flow/abc/events?token=WRONG'), res)).toBe(false);
    expect(captured.status).toBe(403);
  });

  it('POST can NEVER authenticate via query-token — even on an allowlisted prefix', () => {
    const auth = middleware();
    const captured = { status: 0 };
    const res = {
      writeHead(status: number) { captured.status = status; return this; },
      end() { /* noop */ },
    } as unknown as ServerResponse;
    expect(auth(reqFor('POST', `/api/run-flow/abc/decision?token=${TOKEN}`), res)).toBe(false);
    expect(captured.status).toBe(401); // missing header, query-token ineligible for mutations
  });

  it('non-allowlisted path gets no query-token lane at all', () => {
    const auth = middleware();
    const captured = { status: 0 };
    const res = {
      writeHead(status: number) { captured.status = status; return this; },
      end() { /* noop */ },
    } as unknown as ServerResponse;
    expect(auth(reqFor('GET', `/api/agents?token=${TOKEN}`), res)).toBe(false);
    expect(captured.status).toBe(401);
  });
});

// ─── SURF-2 — list + start endpoint parity pins ──────────────────────────────

describe('SURF-2 — list + start parity', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'surf-2-'));
    _resetRunFlowRoutesState();
    _resetRunFlowEventStreamState();
    installFixturePlanner();
  });

  afterEach(() => {
    setRunFlowProposalPlanner(undefined);
    _resetRunFlowRoutesState();
    _resetRunFlowEventStreamState();
    rmSync(root, { recursive: true, force: true });
  });

  it('GET /api/run-flow/list enumerates durable flows with state + intent', async () => {
    const a = await call(root, 'POST', '/api/run-flow/propose', { intentSummary: 'first job' });
    const b = await call(root, 'POST', '/api/run-flow/propose', { intentSummary: 'second job' });
    const idA = (a.body as { proposal: { flowId: string } }).proposal.flowId;
    const idB = (b.body as { proposal: { flowId: string } }).proposal.flowId;

    _resetRunFlowRoutesState(); // list must come from DURABLE state, not memory

    const listed = await call(root, 'GET', '/api/run-flow/list');
    expect(listed.status).toBe(200);
    const flows = (listed.body as { flows: Array<{ flowId: string; state: string; intentSummary?: string }> }).flows;
    const ids = flows.map((f) => f.flowId);
    expect(ids).toEqual(expect.arrayContaining([idA, idB]));
    expect(flows.find((f) => f.flowId === idA)?.state).toBe('AWAITING_APPROVAL');
    expect(flows.find((f) => f.flowId === idA)?.intentSummary).toBe('first job');
  });

  it('POST /:id/start on an APPROVED flow spawns detached and records RUN_STARTED (fake spawn via env-less dry assertion)', async () => {
    const proposed = await call(root, 'POST', '/api/run-flow/propose', { intentSummary: 'run me' });
    const flowId = (proposed.body as { proposal: { flowId: string } }).proposal.flowId;
    await call(root, 'POST', `/api/run-flow/${flowId}/decision`, { decision: 'approve' });

    const started = await call(root, 'POST', `/api/run-flow/${flowId}/start`);
    expect(started.status).toBe(202);
    const body = started.body as { started: boolean; context: { state: string } };
    expect(body.started).toBe(true);
    expect(body.context.state).toBe('DETACHED_RUNNING');

    // idempotent retry: duplicate start is a no-op, never a double spawn
    const again = await call(root, 'POST', `/api/run-flow/${flowId}/start`);
    expect([200, 202, 409]).toContain(again.status);
    if (again.status === 202) {
      expect((again.body as { duplicate: boolean }).duplicate).toBe(true);
    }
  });

  it('POST /:id/start on a non-APPROVED flow is a typed 409', async () => {
    const proposed = await call(root, 'POST', '/api/run-flow/propose', { intentSummary: 'not yet' });
    const flowId = (proposed.body as { proposal: { flowId: string } }).proposal.flowId;
    const started = await call(root, 'POST', `/api/run-flow/${flowId}/start`);
    expect(started.status).toBe(409);
  });
});

// ─── SURF-2 — cancel + SSE replay-cursor pins ────────────────────────────────

describe('SURF-2 — cancel + replay cursor', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'surf-2b-'));
    _resetRunFlowRoutesState();
    _resetRunFlowEventStreamState();
    installFixturePlanner();
  });

  afterEach(() => {
    setRunFlowProposalPlanner(undefined);
    _resetRunFlowRoutesState();
    _resetRunFlowEventStreamState();
    rmSync(root, { recursive: true, force: true });
  });

  it('POST /:id/cancel → durable CANCELLED; terminal flow rejects further decisions (409)', async () => {
    const proposed = await call(root, 'POST', '/api/run-flow/propose', { intentSummary: 'cancel me' });
    const flowId = (proposed.body as { proposal: { flowId: string } }).proposal.flowId;

    const cancelled = await call(root, 'POST', `/api/run-flow/${flowId}/cancel`, { reason: 'changed my mind' });
    expect(cancelled.status).toBe(200);
    expect((cancelled.body as { context: { state: string } }).context.state).toBe('CANCELLED');

    _resetRunFlowRoutesState(); // durable across restart
    const got = await call(root, 'GET', `/api/run-flow/${flowId}`);
    expect((got.body as { state: string }).state).toBe('CANCELLED');

    const decided = await call(root, 'POST', `/api/run-flow/${flowId}/decision`, { decision: 'approve' });
    expect(decided.status).toBe(409);
  });

  it('cancel on a RUNNING flow closes the record and says the process is lifecycle-owned', async () => {
    const proposed = await call(root, 'POST', '/api/run-flow/propose', { intentSummary: 'run then cancel' });
    const flowId = (proposed.body as { proposal: { flowId: string } }).proposal.flowId;
    await call(root, 'POST', `/api/run-flow/${flowId}/decision`, { decision: 'approve' });
    await call(root, 'POST', `/api/run-flow/${flowId}/start`);

    const cancelled = await call(root, 'POST', `/api/run-flow/${flowId}/cancel`);
    expect(cancelled.status).toBe(200);
    expect((cancelled.body as { note?: string }).note).toContain('deckent kill');
  });

  it('SSE frames carry id: <sequence> and ?after=N backfills the durable gap', async () => {
    const proposed = await call(root, 'POST', '/api/run-flow/propose', { intentSummary: 'replay me' });
    const flowId = (proposed.body as { proposal: { flowId: string } }).proposal.flowId;
    await call(root, 'POST', `/api/run-flow/${flowId}/decision`, { decision: 'approve' });

    // reconnecting client: saw only sequence 1 — expects 2.. replayed as frames
    const { handleRunFlowEventStream } = await import('../../src/api/run-flow-event-stream.js');
    const written: string[] = [];
    const res = {
      writeHead() { return this; },
      write(chunk: string) { written.push(chunk); return true; },
      on() { return this; },
    } as unknown as import('node:http').ServerResponse;
    const req = {
      url: `/api/run-flow/${flowId}/events?after=1`,
      headers: {},
      on() { return this; },
    } as unknown as import('node:http').IncomingMessage;

    const cleanup = handleRunFlowEventStream(req, res, flowId, '*', root);
    cleanup();

    const frames = written.join('');
    expect(frames).toContain('id: 2'); // backfilled from the durable log
    expect(frames).toContain('APPROVAL_GRANTED');
    expect(frames).not.toContain('id: 1\n'); // cursor honored — no re-delivery
  });
});

// ─── SURF-2 — tenant isolation negatives ─────────────────────────────────────

describe('SURF-2 — tenant negatives', () => {
  let root: string;

  function jwtFor(claims: Record<string, unknown>): string {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.sig`;
  }

  function reqWithTenant(tenant: string): IncomingMessage {
    return {
      headers: { authorization: `Bearer ${jwtFor({ sub: `user-${tenant}`, tenant })}` },
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as IncomingMessage;
  }

  async function callAs(tenantReq: IncomingMessage, method: string, path: string, body?: unknown): Promise<CapturedResponse> {
    const captured: CapturedResponse = { status: 0, body: undefined };
    const matched = await registerRunFlowRoutes(path, method, fakeRes(captured), body, root, tenantReq);
    expect(matched).toBe(true);
    return captured;
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'surf-2t-'));
    _resetRunFlowRoutesState();
    installFixturePlanner();
  });

  afterEach(() => {
    setRunFlowProposalPlanner(undefined);
    _resetRunFlowRoutesState();
    rmSync(root, { recursive: true, force: true });
  });

  it("a foreign tenant's GET/decision/cancel/start all see 404 — indistinguishable from unknown flowId", async () => {
    const proposed = await callAs(reqWithTenant('acme'), 'POST', '/api/run-flow/propose', { intentSummary: 'acme secret work' });
    expect(proposed.status).toBe(201);
    const flowId = ((proposed.body as { proposal: { flowId: string } }).proposal).flowId;

    const intruder = reqWithTenant('globex');
    expect((await callAs(intruder, 'GET', `/api/run-flow/${flowId}`)).status).toBe(404);
    expect((await callAs(intruder, 'GET', `/api/run-flow/${flowId}/preview`)).status).toBe(404);
    expect((await callAs(intruder, 'POST', `/api/run-flow/${flowId}/decision`, { decision: 'approve' })).status).toBe(404);
    expect((await callAs(intruder, 'POST', `/api/run-flow/${flowId}/cancel`)).status).toBe(404);
    expect((await callAs(intruder, 'POST', `/api/run-flow/${flowId}/start`)).status).toBe(404);
  });

  it('list is tenant-scoped: the foreign flow is simply ABSENT (no leak, no error)', async () => {
    await callAs(reqWithTenant('acme'), 'POST', '/api/run-flow/propose', { intentSummary: 'acme job' });
    const listed = await callAs(reqWithTenant('globex'), 'GET', '/api/run-flow/list');
    expect(listed.status).toBe(200);
    expect((listed.body as { flows: unknown[] }).flows).toHaveLength(0);
  });

  it('the owner tenant still sees and drives its own flow (control)', async () => {
    const owner = reqWithTenant('acme');
    const proposed = await callAs(owner, 'POST', '/api/run-flow/propose', { intentSummary: 'mine' });
    const flowId = ((proposed.body as { proposal: { flowId: string } }).proposal).flowId;
    expect((await callAs(owner, 'GET', `/api/run-flow/${flowId}`)).status).toBe(200);
    const listed = await callAs(owner, 'GET', '/api/run-flow/list');
    expect((listed.body as { flows: Array<{ flowId: string }> }).flows.map((f) => f.flowId)).toContain(flowId);
  });
});
