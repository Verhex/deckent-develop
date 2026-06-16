// tests/orchestra/autonomous/execute-dispatcher-jit.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeExecuteDispatcher, AUTONOMOUS_EXECUTE_ACTION } from '../../../src/orchestra/autonomous/execute-dispatcher.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';

let dir: string | undefined;
afterEach(() => { if (dir) { rmSync(dir, { recursive: true, force: true }); dir = undefined; } });

function setup(entry: BacklogEntry): string {
  dir = mkdtempSync(join(tmpdir(), 'jit-disp-'));
  mkdirSync(join(dir, '.deckent', 'autonomous'), { recursive: true });
  const p = join(dir, '.deckent', 'autonomous', 'backlog.json');
  writeFileSync(p, JSON.stringify({ _version: '1.0', entries: [entry] }), 'utf-8');
  return p;
}

const baseEntry: BacklogEntry = {
  id: 'i', title: 'Roles', kind: 'task', spec: { scopeDir: 'src/api/' }, policy: 'auto',
  trigger: { type: 'one-off' }, status: 'pending', planned: true, summary: 'roles crud',
  lastRun: null, lastResult: null,
};

describe('execute-dispatcher — JIT detail', () => {
  it('generates + persists the description before running a planned task', async () => {
    const backlogPath = setup(baseEntry);
    let ranWith = '';
    const handler = makeExecuteDispatcher({
      projectRoot: dir!, config: {} as any, backlogPath,
      runTask: async (ctx) => { ranWith = ctx.description; return { taskId: 'tid' }; },
      runSprint: async () => ({}),
      waitForResult: async () => ({ taskId: 'tid', selfAssessment: 'DONE' } as any),
      jitComplete: async () => 'DETAILED: add roles crud endpoints',
    });
    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry: baseEntry });
    expect(res.outcome).toBe('success');
    expect(ranWith).toContain('DETAILED');
    const saved = JSON.parse(readFileSync(backlogPath, 'utf-8'));
    expect(saved.entries[0].spec.description).toContain('DETAILED');
  });

  it('fails a process entry with an honest reason (F3-008 pending)', async () => {
    const backlogPath = setup({ ...baseEntry, kind: 'process' });
    const handler = makeExecuteDispatcher({
      projectRoot: dir!, config: {} as any, backlogPath,
      runTask: async () => ({ taskId: 't' }), runSprint: async () => ({}),
      waitForResult: async () => null,
    });
    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry: { ...baseEntry, kind: 'process' } });
    expect(res.outcome).toBe('failure');
    expect(res.error).toMatch(/process|workflow/i);
  });
});
