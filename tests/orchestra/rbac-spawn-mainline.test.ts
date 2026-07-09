// born-560 — SPAWN-mainline RBAC authority gate.
// Verifies collectRbacBlockedTaskIds (wired into spawnWorkers) mirrors the
// autonomous runtime-loop's kind=sprint gate: dormant by default (enforce_rbac
// off → nothing deferred), permissive for role-less tasks, and HARD-defers a
// role-denied capability only when enforce_rbac=true. Hermetic: the audit
// bridge writes under a tmpdir projectRoot, torn down after each test.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectRbacBlockedTaskIds } from '../../src/orchestra/sprint-runtime.js';
import type { Task } from '../../src/core/task-types.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';

/** Minimal Task fixture — collectRbacBlockedTaskIds only reads id/scope/actor. */
function makeTask(id: string, opts: { role?: string; write?: boolean; tenantId?: string }): Task {
  return {
    id,
    scope: {
      filesRead: ['src/a.ts'],
      filesWrite: opts.write ? ['src/a.ts'] : [],
      directories: [],
    },
    actor: opts.role ? { id: 'actor-1', role: opts.role, tenantId: opts.tenantId } : undefined,
  } as unknown as Task;
}

function cfg(enforceRbac?: boolean): ResolvedConfig {
  return { enforce_rbac: enforceRbac } as unknown as ResolvedConfig;
}

describe('born-560 — SPAWN-mainline RBAC gate (collectRbacBlockedTaskIds)', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rbac-spawn-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  const audit = () => ({ projectRoot: root, sprintId: 'sprint-test' });

  it('DORMANT default (enforce_rbac undefined): a viewer write-task is NOT deferred', () => {
    const tasks = [makeTask('t1', { role: 'viewer', write: true })];
    expect(collectRbacBlockedTaskIds(tasks, cfg(undefined), audit())).toEqual([]);
  });

  it('DORMANT (enforce_rbac=false): a viewer write-task is NOT deferred (soft-warn)', () => {
    const tasks = [makeTask('t1', { role: 'viewer', write: true })];
    expect(collectRbacBlockedTaskIds(tasks, cfg(false), audit())).toEqual([]);
  });

  it('ENFORCE: a viewer role lacking fs-write is HARD-deferred for a write-task', () => {
    const tasks = [makeTask('t1', { role: 'viewer', write: true })];
    expect(collectRbacBlockedTaskIds(tasks, cfg(true), audit())).toEqual(['t1']);
  });

  it('ENFORCE: a viewer read-only task is permitted (viewer has fs-read)', () => {
    const tasks = [makeTask('t1', { role: 'viewer', write: false })];
    expect(collectRbacBlockedTaskIds(tasks, cfg(true), audit())).toEqual([]);
  });

  it('ENFORCE: an engineer role IS permitted for a write-task (has fs-write)', () => {
    const tasks = [makeTask('t1', { role: 'engineer', write: true })];
    expect(collectRbacBlockedTaskIds(tasks, cfg(true), audit())).toEqual([]);
  });

  it('ENFORCE: a role-less task always permits (permissive ADR-037 V1.0 default)', () => {
    const tasks = [makeTask('t1', { write: true })];
    expect(collectRbacBlockedTaskIds(tasks, cfg(true), audit())).toEqual([]);
  });

  it('ENFORCE: mixed batch defers only the role-denied task, preserving ids', () => {
    const tasks = [
      makeTask('ok-engineer', { role: 'engineer', write: true }),
      makeTask('deny-viewer', { role: 'viewer', write: true }),
      makeTask('ok-roleless', { write: true }),
    ];
    expect(collectRbacBlockedTaskIds(tasks, cfg(true), audit())).toEqual(['deny-viewer']);
  });

  it('ENFORCE: an unknown role permits (permissive — unknown role is not in the matrix)', () => {
    const tasks = [makeTask('t1', { role: 'wizard', write: true })];
    expect(collectRbacBlockedTaskIds(tasks, cfg(true), audit())).toEqual([]);
  });
});
