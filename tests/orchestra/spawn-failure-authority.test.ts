import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';

import { retireFailedSpawnAuthority } from '../../src/orchestra/spawn-failure-authority.js';

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-spawn-failure-authority-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.deckent', 'pids'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  return root;
}

describe('failed SPAWN authority retirement', () => {
  it('retires PID, snapshot and owned lock while preserving resumable evidence', () => {
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
    expect(existsSync(snapshotPath)).toBe(false);
    expect(existsSync(lockPath)).toBe(false);
    expect(existsSync(statePath)).toBe(true);
    expect(existsSync(taskPath)).toBe(true);
  });
});
