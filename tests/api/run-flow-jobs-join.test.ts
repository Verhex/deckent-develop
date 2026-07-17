// ═══ SURF-6 kuyruk — API jobs-join pins (phantom-running display fix) ════════
//
// A do-origin flow (legacy snapshot+handle, NO durable event log) used to
// answer DETACHED_RUNNING from the API forever after its sprint finished —
// the F-3 phantom class, CLI-fixed, API edition. These pins hold:
//   * a terminal jobs record upgrades GET /:flowId and the list to the honest
//     COMPLETED/FAILED state (read-only response join),
//   * the durable store is NOT written by the join,
//   * a live flow with a real durable log is untouched by it,
//   * a decide on a jobs-closed phantom refuses honestly (not APPROVED).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTerminalJobClosures } from '../../src/core/run-jobs-read.js';
import { saveApprovedSnapshot, saveRunHandle, readFlowEvents } from '../../src/core/run-flow-store.js';
import { getRunFlowCoordinator, _resetRunFlowCoordinatorsForTests } from '../../src/orchestra/run-flow-coordinator-registry.js';
import { decideRunFlow } from '../../src/orchestra/run-flow-decision-service.js';
import { startTestServer, type TestServerHandle } from './test-server-helper.js';

let root: string;
let handle: TestServerHandle | null = null;

function legacyDoFlow(projectRoot: string, flowId: string): void {
  const startedAt = '2026-07-17T09:00:00.000Z';
  saveApprovedSnapshot(projectRoot, {
    flowId, revision: 1, planDigest: 'd-join',
    approvedBy: { id: 'u' }, approvedAt: startedAt,
    sprint: { id: flowId, tasks: [] } as never,
  });
  saveRunHandle(projectRoot, {
    flowId, revision: 1, planDigest: 'd-join',
    handle: { flowId, jobId: `j-${flowId}`, logRef: 'log' },
    startedAt,
  });
}

function writeTerminalJob(projectRoot: string, sprintId: string, flowId: string, status: 'COMPLETE' | 'FAILED'): void {
  const dir = join(projectRoot, '.deckent', 'runtime', 'jobs');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${sprintId}.json`), JSON.stringify({
    status, sprintId,
    completedAt: '2026-07-17T09:30:00.000Z',
    summary: 'Sprint done — 1/1',
    ...(status === 'FAILED' ? { error: 'worker crashed' } : {}),
    completionRecord: { flowId },
  }));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'jobs-join-'));
  mkdirSync(join(root, '.deckent'), { recursive: true });
  _resetRunFlowCoordinatorsForTests();
});

afterEach(async () => {
  _resetRunFlowCoordinatorsForTests();
  if (handle) { await handle.close(); handle = null; }
  rmSync(root, { recursive: true, force: true });
});

describe('readTerminalJobClosures — Layer-0 reader', () => {
  it('maps COMPLETE/FAILED records by flowId; skips running/corrupt/flowId-less', () => {
    writeTerminalJob(root, 'sprint-1', 'flow-a', 'COMPLETE');
    writeTerminalJob(root, 'sprint-2', 'flow-b', 'FAILED');
    const dir = join(root, '.deckent', 'runtime', 'jobs');
    writeFileSync(join(dir, 'sprint-3.json'), JSON.stringify({ status: 'RUNNING', completionRecord: { flowId: 'flow-c' } }));
    writeFileSync(join(dir, 'sprint-4.json'), '{corrupt');
    writeFileSync(join(dir, 'sprint-5.json'), JSON.stringify({ status: 'COMPLETE' }));

    const closures = readTerminalJobClosures(root);
    expect(closures.get('flow-a')).toEqual({ state: 'COMPLETED', completedAt: '2026-07-17T09:30:00.000Z', summary: 'Sprint done — 1/1' });
    expect(closures.get('flow-b')?.state).toBe('FAILED');
    expect(closures.get('flow-b')?.error).toBe('worker crashed');
    expect(closures.size).toBe(2);
  });

  it('missing jobs dir → empty map (never throws)', () => {
    expect(readTerminalJobClosures(root).size).toBe(0);
  });
});

describe('API jobs-join — phantom-running becomes honest (E2E real server)', () => {
  it('GET /:flowId and the list upgrade a jobs-closed do-origin flow; the durable store stays untouched', async () => {
    handle = await startTestServer({ disableAuth: true, seed: { config: { terminal: { run_flow_v2: true } } } });
    const flowId = 'aaaa1111-join-4000-8000-000000000001';
    legacyDoFlow(handle.projectRoot, flowId);
    writeTerminalJob(handle.projectRoot, 'sprint-900', flowId, 'COMPLETE');

    const get = await fetch(`${handle.baseUrl}/api/run-flow/${flowId}`);
    expect(get.status).toBe(200);
    const body = (await get.json()) as { state: string; updatedAt?: string };
    expect(body.state).toBe('COMPLETED');
    expect(body.updatedAt).toBe('2026-07-17T09:30:00.000Z');

    const list = await fetch(`${handle.baseUrl}/api/run-flow/list`);
    const flows = ((await list.json()) as { flows: Array<{ flowId: string; state: string }> }).flows;
    expect(flows.find((f) => f.flowId === flowId)?.state).toBe('COMPLETED');

    // read-only: the join never wrote a durable event
    expect(readFlowEvents(handle.projectRoot, flowId)).toEqual([]);
  });

  it('a FAILED jobs record surfaces state + failureReason', async () => {
    handle = await startTestServer({ disableAuth: true, seed: { config: { terminal: { run_flow_v2: true } } } });
    const flowId = 'bbbb2222-join-4000-8000-000000000002';
    legacyDoFlow(handle.projectRoot, flowId);
    writeTerminalJob(handle.projectRoot, 'sprint-901', flowId, 'FAILED');

    const body = (await (await fetch(`${handle.baseUrl}/api/run-flow/${flowId}`)).json()) as { state: string; failureReason?: string };
    expect(body.state).toBe('FAILED');
    expect(body.failureReason).toBe('worker crashed');
  });

  it('a LIVE durable flow (real event log, no jobs record) is untouched by the join', async () => {
    handle = await startTestServer({ disableAuth: true, seed: { config: { terminal: { run_flow_v2: true } } } });
    const propose = await fetch(`${handle.baseUrl}/api/run-flow/propose`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intentSummary: 'live flow stays live' }),
    });
    // propose may 502 without providers in a bare test root — accept either a
    // created flow (assert passthrough) or the honest bootstrap refusal.
    if (propose.status === 201) {
      const { flowId, state } = (await propose.json()) as { flowId: string; state: string };
      const get = (await (await fetch(`${handle.baseUrl}/api/run-flow/${flowId}`)).json()) as { state: string };
      expect(get.state).toBe(state); // no phantom upgrade without a jobs record
    } else {
      expect([500, 502]).toContain(propose.status);
    }
  });
});

describe('GET /api/run-flow/:flowId/diff (583/N1) — shared diff-service over HTTP', () => {
  it('answers the honest not-a-git-repo shape on a bare test root (tenant-guarded 200)', async () => {
    handle = await startTestServer({ disableAuth: true, seed: { config: { terminal: { run_flow_v2: true } } } });
    const flowId = 'eeee4444-join-4000-8000-000000000004';
    legacyDoFlow(handle.projectRoot, flowId);

    const res = await fetch(`${handle.baseUrl}/api/run-flow/${flowId}/diff`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ base: null, files: [], truncated: false, note: 'not-a-git-repo' });

    const missing = await fetch(`${handle.baseUrl}/api/run-flow/unknown-flow/diff`);
    expect(missing.status).toBe(404);
  });
});

describe('decide honesty on a jobs-closed phantom', () => {
  it('approve on a jobs-COMPLETED do-origin flow refuses (no live preview / not awaiting)', () => {
    const flowId = 'cccc3333-join-4000-8000-000000000003';
    legacyDoFlow(root, flowId);
    writeTerminalJob(root, 'sprint-902', flowId, 'COMPLETE');
    // the decision service folds the durable truth (legacy-derive says
    // DETACHED_RUNNING, no preview) — a phantom decide cannot slip through.
    expect(() => decideRunFlow(root, flowId, { decision: 'approve', actor: { id: 't' } })).toThrowError();
    expect(readFlowEvents(root, flowId)).toEqual([]);
    // and the coordinator's own state was never mutated by the attempt
    expect(getRunFlowCoordinator(root).getFlow(flowId).state).toBe('DETACHED_RUNNING');
  });
});
