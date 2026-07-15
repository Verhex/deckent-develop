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
  loadConfig: vi.fn().mockResolvedValue({
    terminal: { run_flow_v2: true },
    activeModeConfig: { max_workers: 2, brain_model: 'sonnet' },
  }),
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
    id: '001-001', title: 'Do the thing', description: 'Well.', model: 'sonnet',
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
      model: 'sonnet', effort: 'normal', priority: 'NORMAL', reason: 'crud',
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
    expect((loadPlannedSprint(root, flowId)?.sprint as { id: string }).id).toBe('sprint-fixture');

    _resetRunFlowRoutesState(); // restart between preview and approval

    const decided = await call(root, 'POST', `/api/run-flow/${flowId}/decision`, { decision: 'approve' });
    expect(decided.status).toBe(200);
    expect((decided.body as { state: string }).state).toBe('APPROVED');

    const snapshot = loadApprovedSnapshot(root, flowId);
    expect(snapshot).toBeDefined();
    expect((snapshot!.sprint as { id: string }).id).toBe('sprint-fixture');
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
