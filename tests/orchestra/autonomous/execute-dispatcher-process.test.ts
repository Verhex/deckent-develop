// F3-008 (mode-transition 3/3) — kind=process through the execute-dispatcher.
// Asserts the dispatcher's process branch is a REAL dispatch (runProcess), not the
// old "process/workflow execution is not available yet" honest-fail.
// Kept in its own file so it does not contend with the shared execute-dispatcher.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeExecuteDispatcher } from '../../../src/orchestra/autonomous/execute-dispatcher.js';
import { loadBacklog } from '../../../src/orchestra/autonomous/backlog.js';
import { createDefaultRegistry } from '../../../src/core/capability-broker.js';
import type { BacklogEntry, BacklogFile } from '../../../src/orchestra/autonomous/backlog-types.js';
import type { TaskResult } from '../../../src/core/types.js';

let tmpDir: string;
beforeEach(() => {
  tmpDir = join(tmpdir(), `exec-disp-proc-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});
afterEach(() => { if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true }); });

function seed(entry: BacklogEntry): string {
  const bl: BacklogFile = { _version: '1.0', entries: [entry] };
  const path = join(tmpDir, 'backlog.json');
  writeFileSync(path, JSON.stringify(bl, null, 2), 'utf-8');
  return path;
}

const baseProcess: Omit<BacklogEntry, 'spec'> = {
  id: 'pr', title: 'proc', kind: 'process', policy: 'auto',
  trigger: { type: 'one-off' }, status: 'pending', lastRun: null, lastResult: null,
};

describe('execute-dispatcher — kind=process (F3-008)', () => {
  it('process with a capability step → real dispatch, backlog done, reason is NOT "not available"', async () => {
    const entry: BacklogEntry = {
      ...baseProcess,
      spec: { steps: [{ kind: 'capability', capabilityTarget: { capability: 'echo', args: { x: 1 } } }] } as BacklogEntry['spec'],
    };
    const backlogPath = seed(entry);
    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask: vi.fn(), runSprint: vi.fn(),
      backlogPath, waitForResult: vi.fn(),
      capabilityRegistry: createDefaultRegistry(),
    });

    const res = await handler('autonomous.execute', { entry });

    expect(res.outcome).toBe('success');
    const e = loadBacklog(backlogPath).entries.find((x) => x.id === 'pr');
    expect(e?.status).toBe('done');
    expect(e?.lastResult?.ok).toBe(true);
    expect(e?.lastResult?.reason ?? '').not.toMatch(/not available/);
    expect(e?.lastResult?.reason ?? '').toMatch(/ran sequentially/);
  });

  it('process with a task step → runTask invoked sequentially, backlog done', async () => {
    const doneResult: TaskResult = {
      taskId: 't-1', workerId: 'w', filesChanged: [], linesAdded: 0, linesRemoved: 0,
      testsPassed: true, coverage: 0, selfAssessment: 'DONE', notes: 'ok',
    };
    const runTask = vi.fn().mockResolvedValue({ taskId: 't-1' });
    const waitForResult = vi.fn().mockResolvedValue(doneResult);
    const entry: BacklogEntry = {
      ...baseProcess, id: 'pr-task',
      spec: { steps: [{ description: 'do the thing', scopeDir: 'src/' }] } as BacklogEntry['spec'],
    };
    const backlogPath = seed(entry);
    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, runSprint: vi.fn(), backlogPath, waitForResult,
    });

    const res = await handler('autonomous.execute', { entry });

    expect(res.outcome).toBe('success');
    expect(runTask).toHaveBeenCalledOnce();
    expect(runTask.mock.calls[0]![0].description).toBe('do the thing');
    expect(loadBacklog(backlogPath).entries.find((x) => x.id === 'pr-task')?.status).toBe('done');
  });

  it('process with NO definition → honest-fail (failed; reason NOT "not available")', async () => {
    const entry: BacklogEntry = { ...baseProcess, id: 'pr-empty', spec: { description: 'no steps here' } };
    const backlogPath = seed(entry);
    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask: vi.fn(), runSprint: vi.fn(), backlogPath, waitForResult: vi.fn(),
    });

    const res = await handler('autonomous.execute', { entry });

    expect(res.outcome).toBe('failure');
    expect(res.error ?? '').toMatch(/definition missing or invalid/);
    expect(res.error ?? '').not.toMatch(/not available/);
    const e = loadBacklog(backlogPath).entries.find((x) => x.id === 'pr-empty');
    expect(e?.status).toBe('failed');
    expect(e?.lastResult?.ok).toBe(false);
  });
});
