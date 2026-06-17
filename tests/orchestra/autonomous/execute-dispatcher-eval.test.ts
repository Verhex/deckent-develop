import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeExecuteDispatcher, AUTONOMOUS_EXECUTE_ACTION } from '../../../src/orchestra/autonomous/execute-dispatcher.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';
import type { FlowStepRecord } from '../../../src/orchestra/autonomous/flow-reporter.js';
import { makeFlowReporter } from '../../../src/orchestra/autonomous/flow-reporter.js';

let dir: string | undefined;
afterEach(() => { if (dir) { rmSync(dir, { recursive: true, force: true }); dir = undefined; } });

const entry: BacklogEntry = {
  id: 'roles', title: 'Roles', kind: 'task', spec: { scopeDir: 'src/api/' }, policy: 'auto',
  trigger: { type: 'one-off' }, status: 'pending', lastRun: null, lastResult: null,
};

function setup(): string {
  dir = mkdtempSync(join(tmpdir(), 'disp-eval-'));
  mkdirSync(join(dir, '.deckent', 'autonomous'), { recursive: true });
  const p = join(dir, '.deckent', 'autonomous', 'backlog.json');
  writeFileSync(p, JSON.stringify({ _version: '1.0', entries: [entry] }), 'utf-8');
  return p;
}

describe('execute-dispatcher — Brain+Auditor+CrossVerify wire', () => {
  it('drives the Brain verdict into the rich lastResult and fires ordered flow steps', async () => {
    const backlogPath = setup();
    const records: FlowStepRecord[] = [];
    const handler = makeExecuteDispatcher({
      projectRoot: dir!, config: {} as any, backlogPath,
      runTask: async () => ({ taskId: 'run-1' }),
      runSprint: async () => ({}),
      waitForResult: async () => ({ taskId: 'run-1', selfAssessment: 'NO_GO' } as any),
      evaluate: () => ({ decision: 'GO_WITH_TECH_DEBT', quality: 78, reconciled: true, reason: 'low coverage' }),
      audit: async () => ({ boundary: 'clean', adr: 'ok', functional: 'pass' }),
      crossVerify: async () => ({ ran: true, verdict: 'confirmed' }),
      flow: makeFlowReporter({ audit: (r) => records.push(r), now: () => 'T' }),
    });

    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry });
    expect(res.outcome).toBe('success');

    const saved = JSON.parse(readFileSync(backlogPath, 'utf-8')).entries[0];
    expect(saved.status).toBe('done');
    expect(saved.lastResult.decision).toBe('GO_WITH_TECH_DEBT');
    expect(saved.lastResult.reconciled).toBe(true);
    expect(saved.lastResult.quality).toBe(78);
    expect(saved.lastResult.audit).toEqual({ boundary: 'clean', adr: 'ok', functional: 'pass' });
    expect(saved.lastResult.crossVerify).toEqual({ ran: true, verdict: 'confirmed' });

    expect(records.map((r) => r.step)).toEqual(
      ['spawned', 'brain_verdict', 'audit_verdict', 'cross_verify', 'done'],
    );
  });

  it('a Brain NO_GO marks the entry failed', async () => {
    const backlogPath = setup();
    const handler = makeExecuteDispatcher({
      projectRoot: dir!, config: {} as any, backlogPath,
      runTask: async () => ({ taskId: 'run-1' }),
      runSprint: async () => ({}),
      waitForResult: async () => ({ taskId: 'run-1', selfAssessment: 'NO_GO' } as any),
      evaluate: () => ({ decision: 'NO_GO', quality: 10, reconciled: false, reason: 'tests failed' }),
      audit: async () => ({ boundary: 'clean', adr: 'ok', functional: 'fail' }),
      crossVerify: async () => ({ ran: false }),
    });
    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry });
    expect(res.outcome).toBe('failure');
    expect(JSON.parse(readFileSync(backlogPath, 'utf-8')).entries[0].status).toBe('failed');
  });

  it('reconciles a Brain NO_GO into done when the Auditor independently confirms real work (live false-NO_GO fix)', async () => {
    const backlogPath = setup();
    const handler = makeExecuteDispatcher({
      projectRoot: dir!, config: {} as any, backlogPath,
      runTask: async () => ({ taskId: 'run-1' }),
      runSprint: async () => ({}),
      waitForResult: async () => ({ taskId: 'run-1', selfAssessment: 'DONE', filesChanged: ['src/cli/helpers/output.ts'] } as any),
      evaluate: () => ({ decision: 'NO_GO', quality: 0, reconciled: false, reason: 'Schema violation: missing required fields [coverage]', schemaRejected: true }),
      audit: async () => ({ boundary: 'clean', adr: 'ok', functional: 'pass' }),
      crossVerify: async () => ({ ran: false }),
    });
    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry });
    expect(res.outcome).toBe('success');
    const saved = JSON.parse(readFileSync(backlogPath, 'utf-8')).entries[0];
    expect(saved.status).toBe('done');
    expect(saved.lastResult.decision).toBe('GO_WITH_TECH_DEBT');
    expect(saved.lastResult.reconciled).toBe(true);
  });

  it('an out-of-scope boundary violation stays advisory (still done on a GO decision)', async () => {
    const backlogPath = setup();
    const handler = makeExecuteDispatcher({
      projectRoot: dir!, config: {} as any, backlogPath,
      runTask: async () => ({ taskId: 'run-1' }),
      runSprint: async () => ({}),
      waitForResult: async () => ({ taskId: 'run-1', selfAssessment: 'DONE' } as any),
      evaluate: () => ({ decision: 'DONE', quality: 95, reconciled: false, reason: 'ok' }),
      audit: async () => ({ boundary: [{ type: 'file_outside_scope', agentId: 'w', detail: 'File outside scope: x.ts', timestamp: 'T' }], adr: 'ok', functional: 'pass' }),
      crossVerify: async () => ({ ran: false }),
    });
    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry });
    expect(res.outcome).toBe('success');
    const saved = JSON.parse(readFileSync(backlogPath, 'utf-8')).entries[0];
    expect(saved.status).toBe('done');
    expect(saved.lastResult.audit.boundary).toEqual(['File outside scope: x.ts']);
  });

  it('writes the Brain assessment back into the worker .result file', async () => {
    const backlogPath = setup();
    // mimic the worker having written its .result
    const resultPath = join(dir!, '.tasks', 'task-run-1.result');
    mkdirSync(join(dir!, '.tasks'), { recursive: true });
    writeFileSync(resultPath, JSON.stringify({ taskId: 'run-1', selfAssessment: 'DONE', filesChanged: ['src/api/x.ts'] }), 'utf-8');

    const handler = makeExecuteDispatcher({
      projectRoot: dir!, config: {} as any, backlogPath,
      runTask: async () => ({ taskId: 'run-1' }),
      runSprint: async () => ({}),
      waitForResult: async () => ({ taskId: 'run-1', selfAssessment: 'DONE', filesChanged: ['src/api/x.ts'] } as any),
      evaluate: () => ({ decision: 'DONE', quality: 95, reconciled: false, reason: 'ok' }),
      audit: async () => ({ boundary: 'clean', adr: 'ok', functional: 'pass' }),
      crossVerify: async () => ({ ran: false }),
    });
    await handler(AUTONOMOUS_EXECUTE_ACTION, { entry });

    const saved = JSON.parse(readFileSync(resultPath, 'utf-8'));
    expect(saved.brainAssessment.decision).toBe('DONE');
    expect(saved.brainAssessment.audit.functional).toBe('pass');
    expect(saved.selfAssessment).toBe('DONE'); // worker field preserved
  });
});
