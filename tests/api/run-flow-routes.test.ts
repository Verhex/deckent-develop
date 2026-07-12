// ═══ run-flow-routes tests — TERM-FLOW-UNIFY Sprint-7 dilim (429-008) ══════
//
// Hermetic: real tmpdir project root (`.deckent/config.json` toggles
// `terminal.run_flow_v2`), a local mini http server calling
// registerRunFlowRoutes directly (mirrors tests/api/missions-route.ts's own
// local-server pattern — this route is not wired into server.ts yet, that
// is a later task per DIRECTIVES.md Task 9/10). orchestra/brain.js's
// planSprint/readContext are mocked (mirrors tests/cli/run-flow-controller.
// test.ts / tests/orchestra/plan-preview-service.test.ts's exact pattern);
// a fake RunProposalPlanner is injected via setRunFlowProposalPlanner for
// every propose() call so no real provider CLI is ever spawned (mirrors
// tests/orchestra/run-proposal-planner.test.ts) — the Test Hermeticity rule
// forbids a real spawnSync from a test.

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server, type IncomingMessage } from 'node:http';

vi.mock('../../src/orchestra/brain.js', () => ({
  planSprint: vi.fn(),
  readContext: vi.fn(),
}));

import { planSprint, readContext } from '../../src/orchestra/brain.js';
import {
  registerRunFlowRoutes,
  setRunFlowProposalPlanner,
  _resetRunFlowRoutesState,
} from '../../src/api/run-flow-routes.js';
import { loadApprovedSnapshot } from '../../src/core/run-flow-store.js';
import type { RunProposalPlanner } from '../../src/orchestra/run-proposal-compiler.js';
import { SprintStatus, SprintPhase, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, PlannerResult, PlannerTask } from '../../src/core/types.js';
import type { RunFlowContext, PlanPreview } from '../../src/core/run-flow-contract.js';

const mockPlanSprint = vi.mocked(planSprint);
const mockReadContext = vi.mocked(readContext);

// ─── Fixtures ────────────────────────────────────────────────────────────

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

/** Build a minimal fake JWT whose payload carries the given claims — same
 *  helper as tests/api/missions-route.test.ts's fakeJwt/bearerHeaders. */
function fakeJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.fakesig`;
}

function bearerHeaders(claims: Record<string, unknown>): Record<string, string> {
  return { Authorization: `Bearer ${fakeJwt(claims)}` };
}

// ─── Test project root + mini server (route not yet wired into server.ts) ──

function makeProjectRoot(opts: { runFlowV2?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'run-flow-routes-'));
  mkdirSync(join(root, '.deckent'), { recursive: true });
  writeFileSync(
    join(root, '.deckent', 'config.json'),
    JSON.stringify({ terminal: { run_flow_v2: opts.runFlowV2 ?? true } }),
    'utf-8',
  );
  return root;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) { resolvePromise({}); return; }
      try {
        resolvePromise(JSON.parse(raw));
      } catch (e) {
        reject(e as Error);
      }
    });
    req.on('error', reject);
  });
}

async function startServer(root: string): Promise<{ server: Server; baseUrl: string }> {
  const s = createServer((req, res) => {
    void (async () => {
      const method = req.method ?? 'GET';
      let body: unknown;
      if (method === 'POST') {
        try {
          body = await readBody(req);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
          return;
        }
      }
      const matched = await registerRunFlowRoutes(req.url ?? '/', method, res, body, root, req);
      if (!matched) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
      }
    })();
  });
  await new Promise<void>((resolvePromise) => s.listen(0, '127.0.0.1', () => resolvePromise()));
  const addr = s.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { server: s, baseUrl: `http://127.0.0.1:${port}` };
}

async function stopServer(s: Server): Promise<void> {
  await new Promise<void>((resolvePromise, reject) =>
    s.close((err) => (err ? reject(err) : resolvePromise())),
  );
}

let projectRoot: string;
let server: Server;
let baseUrl: string;

beforeEach(() => {
  vi.clearAllMocks();
  _resetRunFlowRoutesState();
  setRunFlowProposalPlanner(fakePlanner);
  mockReadContext.mockReturnValue(makeBrainContext() as any);
  mockPlanSprint.mockReturnValue(makeSprint() as any);
});

afterEach(async () => {
  setRunFlowProposalPlanner(undefined);
  _resetRunFlowRoutesState();
  if (server) await stopServer(server);
  if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
  server = undefined as unknown as Server;
  projectRoot = undefined as unknown as string;
  baseUrl = undefined as unknown as string;
});

async function boot(opts: { runFlowV2?: boolean } = {}): Promise<void> {
  projectRoot = makeProjectRoot(opts);
  const started = await startServer(projectRoot);
  server = started.server;
  baseUrl = started.baseUrl;
}

async function propose(intentSummary = 'Ship the exporter', headers: Record<string, string> = {}): Promise<{ status: number; body: RunFlowContext }> {
  const res = await fetch(`${baseUrl}/api/run-flow/propose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ intentSummary }),
  });
  return { status: res.status, body: await res.json() as RunFlowContext };
}

// ─── Flag-gate: terminal.run_flow_v2 off -> honest 404 everywhere ─────────

describe('terminal.run_flow_v2 flag-off — every route answers 404, honestly', () => {
  it('POST /propose, GET /:flowId, GET /:flowId/preview, POST /:flowId/decision all 404', async () => {
    await boot({ runFlowV2: false });

    const proposeRes = await fetch(`${baseUrl}/api/run-flow/propose`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intentSummary: 'x' }),
    });
    expect(proposeRes.status).toBe(404);
    const proposeBody = await proposeRes.json() as { error: string };
    expect(proposeBody.error).toContain('terminal.run_flow_v2');

    const stateRes = await fetch(`${baseUrl}/api/run-flow/any-flow-id`);
    expect(stateRes.status).toBe(404);

    const previewRes = await fetch(`${baseUrl}/api/run-flow/any-flow-id/preview`);
    expect(previewRes.status).toBe(404);

    const decisionRes = await fetch(`${baseUrl}/api/run-flow/any-flow-id/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    expect(decisionRes.status).toBe(404);
  });
});

// ─── POST /api/run-flow/propose ────────────────────────────────────────────

describe('POST /api/run-flow/propose', () => {
  it('rejects a body with no intentSummary (400)', async () => {
    await boot();
    const res = await fetch(`${baseUrl}/api/run-flow/propose`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('drives COLLECTING -> AWAITING_APPROVAL with a REAL plan preview (compiler+preview-service+reducer)', async () => {
    await boot();
    const { status, body } = await propose('Fix the flaky retry test');

    expect(status).toBe(201);
    expect(body.state).toBe('AWAITING_APPROVAL');
    expect(body.flowId).toBeDefined();
    expect(body.proposal?.intentSummary).toBe('Fix the flaky retry test');
    expect(body.proposal?.origin).toBe('api');
    // taskSummaries come from the (mocked) planned Sprint, not the planner's
    // PlannerTask — plan-preview-service.ts's generatePlanPreview derives
    // them from planSprint()'s result, matching makeSprint()/makeTask() here.
    expect((body.preview as PlanPreview).taskSummaries).toEqual([
      { title: 'Do the thing', summary: 'Do the thing well.' },
    ]);
    expect((body.preview as PlanPreview).planDigest).toMatch(/^[a-f0-9]{64}$/);

    expect(mockPlanSprint).toHaveBeenCalledTimes(1);
    const [, , brainContextArg] = mockPlanSprint.mock.calls[0]!;
    expect((brainContextArg as { directives: string }).directives).toContain('Fix the flaky retry test');
  });

  it('derives tenant/actor from the verified bearer, never from the request body', async () => {
    await boot();
    const { body } = await propose('Ship it', bearerHeaders({ sub: 'alice', tenant: 'acme', role: 'operator' }));
    expect(body.proposal?.tenant).toBe('acme');
    expect(body.proposal?.actor).toEqual({ id: 'alice', role: 'operator' });
  });

  it('a planner failure surfaces as an honest 502, nothing persisted', async () => {
    await boot();
    setRunFlowProposalPlanner(() => { throw new Error('simulated provider timeout'); });

    const res = await fetch(`${baseUrl}/api/run-flow/propose`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intentSummary: 'x' }),
    });
    expect(res.status).toBe(502);
    const errBody = await res.json() as { error: string };
    expect(errBody.error).toContain('simulated provider timeout');
  });
});

// ─── GET /api/run-flow/:flowId  and  /:flowId/preview ─────────────────────

describe('GET /api/run-flow/:flowId (flow-state-get) and /preview (preview-get)', () => {
  it('404 for an unknown flowId', async () => {
    await boot();
    const res = await fetch(`${baseUrl}/api/run-flow/does-not-exist`);
    expect(res.status).toBe(404);
  });

  it('400 for a syntactically invalid flowId', async () => {
    await boot();
    const res = await fetch(`${baseUrl}/api/run-flow/${encodeURIComponent('bad id!')}`);
    expect(res.status).toBe(400);
  });

  it('returns the full context / the live preview for a known flow', async () => {
    await boot();
    const { body: proposed } = await propose();
    const flowId = proposed.flowId!;

    const stateRes = await fetch(`${baseUrl}/api/run-flow/${flowId}`);
    expect(stateRes.status).toBe(200);
    const state = await stateRes.json() as RunFlowContext;
    expect(state.flowId).toBe(flowId);
    expect(state.state).toBe('AWAITING_APPROVAL');

    const previewRes = await fetch(`${baseUrl}/api/run-flow/${flowId}/preview`);
    expect(previewRes.status).toBe(200);
    const preview = await previewRes.json() as PlanPreview;
    expect(preview.flowId).toBe(flowId);
    expect(preview.planDigest).toBe(proposed.preview!.planDigest);
  });

  it('tenant isolation: a caller from a different tenant gets 404 (no existence leak)', async () => {
    await boot();
    const { body: proposed } = await propose('Ship it', bearerHeaders({ sub: 'alice', tenant: 'acme' }));
    const flowId = proposed.flowId!;

    const res = await fetch(`${baseUrl}/api/run-flow/${flowId}`, {
      headers: bearerHeaders({ sub: 'mallory', tenant: 'globex' }),
    });
    expect(res.status).toBe(404);

    // admin sees across tenants
    const adminRes = await fetch(`${baseUrl}/api/run-flow/${flowId}`, {
      headers: bearerHeaders({ sub: 'root', tenant: 'globex', role: 'admin' }),
    });
    expect(adminRes.status).toBe(200);
  });
});

// ─── POST /api/run-flow/:flowId/decision ───────────────────────────────────

describe('POST /api/run-flow/:flowId/decision', () => {
  it('400 for an invalid decision body', async () => {
    await boot();
    const { body: proposed } = await propose();
    const res = await fetch(`${baseUrl}/api/run-flow/${proposed.flowId}/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'maybe' }),
    });
    expect(res.status).toBe(400);
  });

  it('404 for an unknown flowId', async () => {
    await boot();
    const res = await fetch(`${baseUrl}/api/run-flow/does-not-exist/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    expect(res.status).toBe(404);
  });

  it('approve -> APPROVED with a CAS-matched approvedSnapshot, persisted to run-flow-store', async () => {
    await boot();
    const { body: proposed } = await propose('Ship it', bearerHeaders({ sub: 'alperen', tenant: 'acme' }));
    const flowId = proposed.flowId!;

    const res = await fetch(`${baseUrl}/api/run-flow/${flowId}/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...bearerHeaders({ sub: 'alperen', tenant: 'acme' }) },
      body: JSON.stringify({ decision: 'approve' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as RunFlowContext;
    expect(body.state).toBe('APPROVED');
    expect(body.approvedSnapshot?.revision).toBe(proposed.preview!.revision);
    expect(body.approvedSnapshot?.planDigest).toBe(proposed.preview!.planDigest);
    expect(body.approvedSnapshot?.approvedBy).toEqual({ id: 'alperen' });

    // approve() delegates to the SAME durable store startApproved() would
    // later read back from — never a second, hand-rolled persistence path.
    const stored = loadApprovedSnapshot(projectRoot, flowId);
    expect(stored).toBeDefined();
    expect(stored!.planDigest).toBe(proposed.preview!.planDigest);
    expect(stored!.sprint.tasks[0]!.title).toBe('Do the thing');
  });

  it('reject -> CANCELLED', async () => {
    await boot();
    const { body: proposed } = await propose();
    const res = await fetch(`${baseUrl}/api/run-flow/${proposed.flowId}/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'reject', reason: 'not now' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as RunFlowContext;
    expect(body.state).toBe('CANCELLED');
    expect(body.cancelReason).toBe('rejected');
  });

  it('a second decision on an already-CANCELLED flow -> 409 (typed transition error, not a silent no-op)', async () => {
    await boot();
    const { body: proposed } = await propose();
    const flowId = proposed.flowId!;
    await fetch(`${baseUrl}/api/run-flow/${flowId}/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'reject' }),
    });
    const res = await fetch(`${baseUrl}/api/run-flow/${flowId}/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }),
    });
    expect(res.status).toBe(409);
  });

  it('tenant isolation: a different-tenant caller cannot decide someone else\'s flow', async () => {
    await boot();
    const { body: proposed } = await propose('Ship it', bearerHeaders({ sub: 'alice', tenant: 'acme' }));
    const res = await fetch(`${baseUrl}/api/run-flow/${proposed.flowId}/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...bearerHeaders({ sub: 'mallory', tenant: 'globex' }) },
      body: JSON.stringify({ decision: 'approve' }),
    });
    expect(res.status).toBe(404);
  });
});
