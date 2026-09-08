import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';

import {
  containAndRetireFailedExecutionAuthority,
  retireFailedPrePlanAuthority,
  retireFailedSpawnAuthority,
} from '../../src/orchestra/spawn-failure-authority.js';

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-spawn-failure-authority-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.deckent', 'pids'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  return root;
}

describe('failed SPAWN authority retirement', () => {
  it('wires startup reconciliation failure to pre-plan authority retirement', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/orchestra/sprint-controller.ts'),
      'utf8',
    );
    const recoveryStart = source.indexOf(
      'recoveryReport = await reconcileSpawnBackendBeforeRestore(recoveryBackend)',
    );
    const recoveryBoundary = source.slice(recoveryStart, recoveryStart + 700);

    expect(recoveryStart).toBeGreaterThan(-1);
    expect(recoveryBoundary).toContain('retireFailedPrePlanAuthority(projectRoot)');
    expect(recoveryBoundary).toContain('throw error');
  });

  it('retires only the current pre-plan lock while preserving forensic state', () => {
    const root = makeRoot();
    const sprintId = 'sprint-714';
    const lockPath = join(root, '.deckent', 'sprint.lock');
    const statePath = join(root, '.deckent', 'sprint-state.json');
    const checkpointPath = join(root, '.deckent', `${sprintId}-checkpoint.json`);
    writeFileSync(lockPath, JSON.stringify({
      pid: process.pid,
      env: 'test',
      sprintId,
      acquiredAt: new Date().toISOString(),
    }));
    writeFileSync(statePath, JSON.stringify({ sprintId: 'sprint-previous' }));
    writeFileSync(checkpointPath, JSON.stringify({ sprintId, checkpointNumber: 1 }));

    retireFailedPrePlanAuthority(root);

    expect(existsSync(lockPath)).toBe(false);
    expect(existsSync(statePath)).toBe(true);
    expect(existsSync(checkpointPath)).toBe(true);
  });

  it('retires live PID and owned lock while preserving exact process-generation evidence', () => {
    const root = makeRoot();
    const sprintId = 'sprint-481';
    const pidPath = join(root, '.deckent', 'pids', `${sprintId}.pid`);
    const snapshotPath = join(root, '.deckent', 'pids', `${sprintId}.snapshot.json`);
    const lockPath = join(root, '.deckent', 'sprint.lock');
    const statePath = join(root, '.deckent', 'sprint-state.json');
    const taskPath = join(root, '.tasks', 'task-481-001.json');

    writeFileSync(pidPath, JSON.stringify({ pid: process.pid, sprintId }));
    writeFileSync(snapshotPath, JSON.stringify({
      pid: process.pid,
      sprintId,
      lastHeartbeat: new Date().toISOString(),
    }));
    writeFileSync(lockPath, JSON.stringify({
      pid: process.pid,
      env: 'test',
      sprintId,
      acquiredAt: new Date().toISOString(),
    }));
    writeFileSync(statePath, JSON.stringify({
      sprintId,
      phase: 'SPAWN',
      status: 'PLANNING',
    }));
    writeFileSync(taskPath, JSON.stringify({
      id: '481-001',
      status: 'PENDING',
    }));

    retireFailedSpawnAuthority(root, sprintId);

    expect(existsSync(pidPath)).toBe(false);
    expect(existsSync(snapshotPath)).toBe(true);
    expect(existsSync(lockPath)).toBe(false);
    expect(existsSync(statePath)).toBe(true);
    expect(existsSync(taskPath)).toBe(true);
  });

  it('contains exact EXECUTE effects before retiring live authority', async () => {
    const root = makeRoot();
    const sprintId = 'sprint-714';
    const pidPath = join(root, '.deckent', 'pids', `${sprintId}.pid`);
    const lockPath = join(root, '.deckent', 'sprint.lock');
    writeFileSync(pidPath, JSON.stringify({ pid: process.pid, sprintId }));
    writeFileSync(lockPath, JSON.stringify({
      pid: process.pid,
      env: 'test',
      sprintId,
      acquiredAt: new Date().toISOString(),
    }));
    const observations: string[] = [];

    await containAndRetireFailedExecutionAuthority(root, sprintId, {
      async reconcileExactLifecycle(mode) {
        observations.push(mode);
        expect(existsSync(pidPath)).toBe(true);
        expect(existsSync(lockPath)).toBe(true);
      },
    });

    expect(observations).toEqual(['contain']);
    expect(existsSync(pidPath)).toBe(false);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('keeps live authority visible when exact EXECUTE containment holds', async () => {
    const root = makeRoot();
    const sprintId = 'sprint-714';
    const pidPath = join(root, '.deckent', 'pids', `${sprintId}.pid`);
    const lockPath = join(root, '.deckent', 'sprint.lock');
    writeFileSync(pidPath, JSON.stringify({ pid: process.pid, sprintId }));
    writeFileSync(lockPath, JSON.stringify({
      pid: process.pid,
      env: 'test',
      sprintId,
      acquiredAt: new Date().toISOString(),
    }));

    await expect(containAndRetireFailedExecutionAuthority(root, sprintId, {
      async reconcileExactLifecycle() {
        throw new Error('EXACT_CONTAINMENT_INCOMPLETE');
      },
    })).rejects.toThrow('EXACT_CONTAINMENT_INCOMPLETE');

    expect(existsSync(pidPath)).toBe(true);
    expect(existsSync(lockPath)).toBe(true);
  });
});
