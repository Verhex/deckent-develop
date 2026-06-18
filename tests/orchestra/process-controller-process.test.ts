// F3-008 (mode-transition 3/3) — kind=process via the process-controller surface.
// Confirms (c) the policy/RBAC gate is PRESERVED for processes: a process whose
// EffectClass is ambiguous parks for approval (fail-safe, ADR-040 default-deny),
// while a reversible (docs/-scoped) process auto-runs and is dispatched to the
// real process runtime. New file → no contention with process-controller.test.ts.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeProcessController, type ProcessControllerDeps } from '../../src/orchestra/process-controller.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';
import type { TaskResult } from '../../src/core/types.js';

const dirs: string[] = [];
function tmp(): string { const d = mkdtempSync(join(tmpdir(), 'proc-ctl-proc-')); dirs.push(d); return d; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function deps(overrides: Partial<ProcessControllerDeps> = {}): ProcessControllerDeps {
  let n = 0;
  const dir = tmp();
  return {
    projectRoot: dir,
    config: { deckent_style: 'process' } as unknown as ResolvedConfig,
    backlogPath: join(dir, 'backlog.json'),
    runTask: async () => ({ taskId: 'task-1' }),
    runSprint: async () => undefined,
    waitForResult: async () => ({ selfAssessment: 'DONE', filesChanged: [] } as unknown as TaskResult),
    capabilityRegistry: {
      invoke: async (target: { capability: string }) => ({
        ok: target.capability === 'erp.read',
        capability: target.capability,
        handler: 'mock',
        code: 'CAPABILITY_DENIED',
        error: 'write denied by mock',
      }),
    } as unknown as ProcessControllerDeps['capabilityRegistry'],
    idGen: () => `proc-${++n}`,
    ...overrides,
  };
}

describe('process-controller — kind=process policy gate (F3-008)', () => {
  it('(c) parks a process with no recognizable scope (fail-safe → critical-irreversible)', async () => {
    const ctl = makeProcessController(deps());
    const res = await ctl.submit({
      description: 'ambiguous process',
      kind: 'process',
      steps: [{ description: 'do work' }],
    });
    expect(res.status).toBe('pending-approval');
    // The persisted entry is still pending, awaiting human approval — never auto-ran.
    expect(ctl.status(res.executionId)?.status).toBe('pending');
  });

  it('(c) auto-runs a docs/-scoped (reversible) process and completes via the real runtime', async () => {
    const d = deps();
    const ref = join(tmp(), 'proc.json');
    writeFileSync(ref, JSON.stringify({ steps: [{ kind: 'capability', capabilityTarget: { capability: 'erp.read' } }] }));
    const ctl = makeProcessController(d);

    const res = await ctl.submit({
      description: 'summarize via a read-only process',
      kind: 'process',
      scopeDir: 'docs/',
      processRef: ref,
    });

    expect(res.status).toBe('completed');
    expect(ctl.status(res.executionId)?.status).toBe('done');
  });

  it('reports failure when an auto-run process has no definition (honest-fail, not silent ok)', async () => {
    const ctl = makeProcessController(deps());
    // docs/ scope → reversible → auto, but no steps/processRef → honest-fail.
    const res = await ctl.submit({ description: 'empty docs process', kind: 'process', scopeDir: 'docs/' });
    expect(res.status).toBe('failed');
    expect(res.reason ?? '').toMatch(/definition missing or invalid/);
  });
});
