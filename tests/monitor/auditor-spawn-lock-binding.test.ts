// ═══ Auditor SpawnLock Binding Tests ═════════════════════════════════
// Sprint 168 C0b — RC4 Bug E SpawnLock symmetric cleanup
// Auditor scan loop binding: emits stale_spawn_lock alerts (L485 paterni).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireSpawnLock, checkSpawnLocks } from '../../src/core/file-lock.js';
import { runScanCycle } from '../../src/monitor/auditor.js';

/**
 * Mutate a spawnlock file's acquiredAt timestamp to simulate aging without
 * needing real wall-clock time. Returns count mutated.
 */
function ageAllSpawnLocks(projectRoot: string, ageMs: number): number {
  const locksDir = join(projectRoot, '.locks');
  const files = readdirSync(locksDir).filter(f => f.endsWith('.spawnlock'));
  let mutated = 0;
  const fakePast = new Date(Date.now() - ageMs).toISOString();
  for (const file of files) {
    const p = join(locksDir, file);
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as { acquiredAt: string };
    raw.acquiredAt = fakePast;
    writeFileSync(p, JSON.stringify(raw, null, 2), 'utf-8');
    mutated++;
  }
  return mutated;
}

describe('Auditor scan loop SpawnLock binding (Sprint 168 C0b)', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = join(tmpdir(), `deckent-auditor-spawn-lock-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testRoot, { recursive: true });
    // Brain Auditor expects .tasks dir present for task enumeration
    mkdirSync(join(testRoot, '.tasks'), { recursive: true });
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('emits stale_spawn_lock alert for orphan spawn locks (no matching task)', () => {
    // Spawn lock for a task that has no task.json file → orphan
    acquireSpawnLock(testRoot, '168-orphan', './foo.ts');

    const result = runScanCycle(testRoot, 'sprint-168', { autoCleanLocks: true });

    // Find an alert whose message identifies the spawn-lock cleanup
    const spawnAlert = result.alerts.find(a =>
      typeof a.message === 'string' && a.message.includes('stale_spawn_lock'),
    );
    expect(spawnAlert).toBeDefined();
    expect(spawnAlert?.message).toMatch(/orphan spawn lock/i);
  });

  it('preserves spawn locks for active tasks (task.json exists in non-terminal status)', () => {
    // Create a task file representing an ACTIVE task
    const taskJson = {
      id: '168-active',
      title: 'active task',
      description: '',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: '',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      status: 'EXECUTING',
      sprintId: 'sprint-168',
      createdAt: new Date().toISOString(),
    };
    writeFileSync(join(testRoot, '.tasks', 'task-168-active.json'), JSON.stringify(taskJson, null, 2), 'utf-8');
    acquireSpawnLock(testRoot, '168-active', './a.ts');

    const result = runScanCycle(testRoot, 'sprint-168', { autoCleanLocks: true });

    // Active task's spawn lock should still exist after scan
    const remaining = checkSpawnLocks(testRoot);
    expect(remaining.some(l => l.taskId === '168-active')).toBe(true);
    // No orphan spawn-lock alert
    const orphanAlert = result.alerts.find(a =>
      typeof a.message === 'string' && a.message.includes('orphan spawn lock'),
    );
    expect(orphanAlert).toBeUndefined();
  });

  it('emits stale_spawn_lock TTL alert for spawn locks older than 5 minutes', () => {
    acquireSpawnLock(testRoot, '168-old', './x.ts');
    // Create matching task.json so it's NOT orphan — must be stale via TTL
    const taskJson = {
      id: '168-old',
      title: 'aged task',
      description: '',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: '',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      status: 'EXECUTING',
      sprintId: 'sprint-168',
      createdAt: new Date().toISOString(),
    };
    writeFileSync(join(testRoot, '.tasks', 'task-168-old.json'), JSON.stringify(taskJson, null, 2), 'utf-8');
    // Age beyond 5min
    ageAllSpawnLocks(testRoot, 6 * 60 * 1000);

    const result = runScanCycle(testRoot, 'sprint-168', { autoCleanLocks: true });

    const staleAlert = result.alerts.find(a =>
      typeof a.message === 'string' &&
      a.message.includes('stale_spawn_lock') &&
      /stale|TTL/.test(a.message),
    );
    expect(staleAlert).toBeDefined();
  });

  it('does not emit spawn-lock alert when no spawn locks present', () => {
    const result = runScanCycle(testRoot, 'sprint-168', { autoCleanLocks: true });
    const spawnAlert = result.alerts.find(a =>
      typeof a.message === 'string' && a.message.includes('stale_spawn_lock'),
    );
    expect(spawnAlert).toBeUndefined();
  });
});
