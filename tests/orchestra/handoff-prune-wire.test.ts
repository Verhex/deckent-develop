// ─── Sprint 331 Task 331-006 — B-HANDOFF-PRUNE finalize wiring ─────────────────
// Covers the non-blocking `pruneStaleHandoffs` hook wired into `finalizeSprint`.
// `.tasks/handoffs/` is an append-only registry that grows without bound across
// sprints; at sprint finalize the hook deletes stale cross-sprint handoff files
// (endpoints BOTH outside the current sprint) while leaving in-flight
// (current-sprint) handoffs intact, and must NEVER fail/block finalize.
//
// NOTE on scope (mirrors tests/kpi/finalizer-hook.test.ts): `finalizeSprint`
// itself runs real subprocesses (git diff + `runSelfAuditGate` which spawns
// `tsc`/`vitest`), so invoking it directly is neither hermetic nor fast and would
// violate the test-hermeticity rule. These tests therefore exercise the hook at
// its real seam — the exported `pruneStaleHandoffs(projectRoot, sprint)` helper,
// which is EXACTLY what the finalize step (12e) calls: same HandoffProtocol +
// the same current-sprint-task-id derivation. Pre-wire this export does not
// exist (RED); the finalize step never pruned the registry.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { HandoffProtocol } from '../../src/orchestra/handoff-protocol.js';
import { pruneStaleHandoffs } from '../../src/orchestra/sprint-finalizer.js';
import { SprintStatus, SprintPhase } from '../../src/core/sprint-types.js';
import type { Sprint } from '../../src/core/sprint-types.js';

const created: string[] = [];
function tmpRoot(): string {
  const d = mkdtempSync(join(tmpdir(), 'handoff-prune-wire-'));
  created.push(d);
  return d;
}

/** Minimal Sprint whose `tasks` carry only the ids the prune membership rule reads. */
function sprintWithTasks(id: string, taskIds: string[]): Sprint {
  return {
    id,
    number: 1,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.COMPLETE,
    tasks: taskIds.map(tid => ({ id: tid })) as Sprint['tasks'],
    workers: [],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  const dirs = created.splice(0);
  for (const d of dirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe('pruneStaleHandoffs — finalize storage-prune hook', () => {
  it('prunes stale cross-sprint handoffs, retains the current sprint, returns count > 0', () => {
    const root = tmpRoot();
    const hp = new HandoffProtocol(root);
    hp.createHandoff('295-001', '295-007', ['src/old.ts']);   // stale (old sprint)
    hp.createHandoff('301-006', '301-011', ['src/old2.ts']);  // stale (old sprint)
    hp.createHandoff('331-001', '331-002', ['src/new.ts']);   // current sprint
    expect(hp.listHandoffs()).toHaveLength(3);

    const pruned = pruneStaleHandoffs(root, sprintWithTasks('sprint-331', ['331-001', '331-002']));

    // pruned-count > 0 (pre-wire RED: the helper did not exist → finalize never pruned).
    expect(pruned).toBe(2);
    const remaining = hp.listHandoffs();
    expect(remaining).toHaveLength(1);                          // stale files deleted
    expect(remaining.map(h => h.id)).toEqual(['331-001-to-331-002']); // current retained
  });

  it('leaves an in-flight handoff intact when EITHER endpoint is in the current sprint', () => {
    const root = tmpRoot();
    const hp = new HandoffProtocol(root);
    // current → future: source is current sprint → in-flight, must survive.
    hp.createHandoff('331-002', '332-001', ['src/cross.ts']);
    hp.createHandoff('300-001', '300-002', ['src/stale.ts']);  // wholly old → pruned

    const pruned = pruneStaleHandoffs(root, sprintWithTasks('sprint-331', ['331-001', '331-002']));

    expect(pruned).toBe(1);
    expect(hp.listHandoffs().map(h => h.id)).toEqual(['331-002-to-332-001']);
  });

  it('is a no-op (returns 0) when no handoff registry exists', () => {
    const root = tmpRoot();
    expect(pruneStaleHandoffs(root, sprintWithTasks('sprint-331', ['331-001']))).toBe(0);
  });
});

describe('pruneStaleHandoffs — non-blocking guarantee (an injected throw must NOT fail finalize)', () => {
  it('swallows a thrown error from pruneCompletedSprints and returns 0', () => {
    const root = tmpRoot();
    const hp = new HandoffProtocol(root);
    hp.createHandoff('331-001', '331-002', ['src/new.ts']);

    // Inject a failure into the underlying prune — proves the hook's try/catch is
    // load-bearing: finalize must continue even if pruning blows up.
    const spy = vi.spyOn(HandoffProtocol.prototype, 'pruneCompletedSprints')
      .mockImplementation(() => { throw new Error('injected prune failure'); });

    let returned: number | undefined;
    expect(() => {
      returned = pruneStaleHandoffs(root, sprintWithTasks('sprint-331', ['331-001', '331-002']));
    }).not.toThrow();

    expect(returned).toBe(0);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
