// F3-008 (mode-transition 3/3) — process-runtime kernel.
// A process is an ORDERED list of steps run STRICTLY SEQUENTIALLY through the same
// runTask/capability primitives the task path uses, reported in a TaskResult
// envelope. Missing/invalid definition → honest NO_GO (never a silent success).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess, readProcessDefinition } from '../../src/orchestra/process-runtime.js';
import { createDefaultRegistry } from '../../src/core/capability-broker.js';
import type { BacklogEntry } from '../../src/orchestra/autonomous/backlog-types.js';
import type { TaskResult } from '../../src/core/types.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';

const dirs: string[] = [];
function tmp(): string { const d = mkdtempSync(join(tmpdir(), 'proc-rt-')); dirs.push(d); return d; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const cfg = {} as ResolvedConfig;

function processEntry(spec: Record<string, unknown>): BacklogEntry {
  return {
    id: 'p1', title: 'proc', kind: 'process',
    spec: spec as BacklogEntry['spec'],
    policy: 'auto', trigger: { type: 'one-off' }, status: 'pending',
    lastRun: null, lastResult: null,
  };
}

const doneResult = (taskId: string): TaskResult => ({
  taskId, workerId: 'w', filesChanged: [`f-${taskId}.ts`], linesAdded: 1, linesRemoved: 0,
  testsPassed: true, coverage: 0, selfAssessment: 'DONE', notes: 'ok',
});

describe('runProcess — sequential execution + envelope', () => {
  it('(a) runs a 2-step task process strictly sequentially and reports a DONE envelope', async () => {
    const order: string[] = [];
    const runTask = vi.fn(async (ctx: { description: string }) => {
      order.push(`run:${ctx.description}`);
      return { taskId: `t-${order.filter((o) => o.startsWith('run')).length}` };
    });
    const waitForResult = vi.fn(async (_root: string, taskId: string) => {
      order.push(`wait:${taskId}`);
      return doneResult(taskId);
    });

    const entry = processEntry({ steps: [
      { description: 'step A', scopeDir: 'src/a' },
      { description: 'step B', scopeDir: 'src/b' },
    ] });
    const res = await runProcess(entry, { projectRoot: tmp(), config: cfg, runTask, waitForResult });

    expect(res.selfAssessment).toBe('DONE');
    expect(res.taskId).toBe('p1');
    expect(res.notes).toMatch(/2 step\(s\) ran sequentially/);
    // Strict sequencing: step A fully resolves (run + wait) before step B starts.
    expect(order).toEqual(['run:step A', 'wait:t-1', 'run:step B', 'wait:t-2']);
    expect(runTask).toHaveBeenCalledTimes(2);
    // Aggregated filesChanged from both steps.
    expect(res.filesChanged).toEqual(['f-t-1.ts', 'f-t-2.ts']);
  });

  it('(a) runs a mixed task→capability process sequentially (capability via F8 broker)', async () => {
    const order: string[] = [];
    const runTask = vi.fn(async () => { order.push('task'); return { taskId: 't-1' }; });
    const waitForResult = vi.fn(async () => doneResult('t-1'));
    const registry = createDefaultRegistry(); // echo preinstalled
    const realInvoke = registry.invoke.bind(registry);
    registry.invoke = vi.fn(async (target, ctx) => { order.push('cap'); return realInvoke(target, ctx); }) as typeof registry.invoke;

    const entry = processEntry({ steps: [
      { kind: 'task', description: 'first' },
      { kind: 'capability', capabilityTarget: { capability: 'echo', args: { ping: 1 } } },
    ] });
    const res = await runProcess(entry, { projectRoot: tmp(), config: cfg, runTask, waitForResult, capabilityRegistry: registry });

    expect(res.selfAssessment).toBe('DONE');
    expect(order).toEqual(['task', 'cap']); // task ran before the capability step
  });

  it('aggregates GO_WITH_TECH_DEBT when a step carries tech debt but none fail', async () => {
    const runTask = vi.fn()
      .mockResolvedValueOnce({ taskId: 't-1' })
      .mockResolvedValueOnce({ taskId: 't-2' });
    const waitForResult = vi.fn()
      .mockResolvedValueOnce(doneResult('t-1'))
      .mockResolvedValueOnce({ ...doneResult('t-2'), selfAssessment: 'GO_WITH_TECH_DEBT' });

    const entry = processEntry({ steps: [{ description: 'a' }, { description: 'b' }] });
    const res = await runProcess(entry, { projectRoot: tmp(), config: cfg, runTask, waitForResult });
    expect(res.selfAssessment).toBe('GO_WITH_TECH_DEBT');
  });
});

describe('runProcess — honest failure (no silent success)', () => {
  it('(b) NO_GO when the entry carries no process definition (not "not available")', async () => {
    const entry = processEntry({ description: 'just a human label, not JSON' });
    const res = await runProcess(entry, { projectRoot: tmp(), config: cfg, runTask: vi.fn(), waitForResult: vi.fn() });
    expect(res.selfAssessment).toBe('NO_GO');
    expect(res.notes).toMatch(/process definition missing or invalid/);
    expect(res.notes).not.toMatch(/not available/);
  });

  it('(b) NO_GO on an empty steps array', async () => {
    const entry = processEntry({ steps: [] });
    const res = await runProcess(entry, { projectRoot: tmp(), config: cfg, runTask: vi.fn(), waitForResult: vi.fn() });
    expect(res.selfAssessment).toBe('NO_GO');
  });

  it('(c) short-circuits on the first failing step — remaining steps are NOT run', async () => {
    const runTask = vi.fn()
      .mockResolvedValueOnce({ taskId: 't-1' })
      .mockResolvedValueOnce({ taskId: 't-2' });
    const waitForResult = vi.fn()
      .mockResolvedValueOnce({ ...doneResult('t-1'), selfAssessment: 'NO_GO', notes: 'boom' });

    const entry = processEntry({ steps: [{ description: 'step 1' }, { description: 'step 2' }] });
    const res = await runProcess(entry, { projectRoot: tmp(), config: cfg, runTask, waitForResult });

    expect(res.selfAssessment).toBe('NO_GO');
    expect(res.notes).toMatch(/step 1 failed: boom/);
    expect(runTask).toHaveBeenCalledTimes(1); // step 2 never launched (sequential short-circuit)
  });

  it('NO_GO when a capability step fails (broker denies/not-found)', async () => {
    const entry = processEntry({ steps: [{ kind: 'capability', capabilityTarget: { capability: 'erp.read' } }] });
    const res = await runProcess(entry, { projectRoot: tmp(), config: cfg, runTask: vi.fn(), waitForResult: vi.fn(), capabilityRegistry: createDefaultRegistry() });
    expect(res.selfAssessment).toBe('NO_GO');
    expect(res.notes).toMatch(/CAPABILITY_NOT_FOUND/);
  });

  it('NO_GO when a task step launches but returns no taskId (untrackable)', async () => {
    const entry = processEntry({ steps: [{ description: 'x' }] });
    const res = await runProcess(entry, { projectRoot: tmp(), config: cfg, runTask: vi.fn(async () => ({})), waitForResult: vi.fn() });
    expect(res.selfAssessment).toBe('NO_GO');
    expect(res.notes).toMatch(/no taskId/);
  });
});

describe('readProcessDefinition — definition sources', () => {
  it('reads a structured spec.steps array', () => {
    const def = readProcessDefinition(processEntry({ steps: [{ description: 'a' }] }), '/tmp');
    expect(def?.steps).toHaveLength(1);
  });

  it('reads inline JSON from spec.description', () => {
    const def = readProcessDefinition(processEntry({ description: JSON.stringify({ steps: [{ description: 'a' }, { description: 'b' }] }) }), '/tmp');
    expect(def?.steps).toHaveLength(2);
  });

  it('reads a spec.processRef JSON file (absolute path)', () => {
    const dir = tmp();
    const ref = join(dir, 'proc.json');
    writeFileSync(ref, JSON.stringify({ steps: [{ kind: 'capability', capabilityTarget: { capability: 'echo' } }] }));
    const def = readProcessDefinition(processEntry({ processRef: ref }), dir);
    expect(def?.steps).toHaveLength(1);
    expect(def?.steps[0]!.kind).toBe('capability');
  });

  it('returns null for a processRef that points at a missing file (honest-fail)', () => {
    const def = readProcessDefinition(processEntry({ processRef: '/no/such/proc.json' }), '/tmp');
    expect(def).toBeNull();
  });

  it('returns null when no definition source is present', () => {
    expect(readProcessDefinition(processEntry({ description: 'plain text' }), '/tmp')).toBeNull();
  });
});
