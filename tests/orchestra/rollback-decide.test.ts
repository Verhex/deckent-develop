// ROLLBACK-DECIDE (born-427, task 355-005) — decision record + regression guard.
//
// CLAIM (MASTER-PLAN #427): worker-rollback stash/verdict mechanism —
// `setupTaskSnapshot` (src/agents/worker.ts) + `applyRollbackVerdict`
// (src/orchestra/result-evaluator.ts) — is DEAD CODE (0 live callers,
// confirmed by `grep -rn "setupTaskSnapshot(\|applyRollbackVerdict(" src/ tests/`
// excluding the definitions themselves, 2026-07-01).
//
// DECISION: KILL (ADR-D-006 §3 "Remove" tier), not WIRE. Reasons:
//   1. Wiring it would fight the sprint's existing NO_GO handling: `runFixPhase`
//      dispatches fix-forward tasks against a NO_GO worker's EXISTING files, and
//      unresolved NO_GO work is tracked as debt (debt-manager.ts), never reverted.
//      Auto-reverting NO_GO files to pre-task HEAD destroys the state FIX/debt
//      tracking needs.
//   2. `snapshotWorkerScope`/`rollbackWorkerScope` no-op whenever
//      `detectDeckentRepo()` is true (ADR-039 self-project guard) — deckent's
//      primary workload (dogfooding on its own repo) would never exercise it.
//   3. Even if dispatched, `applyRollbackVerdict` called
//      `rollbackWorkerScope(root, stashRef, [])` — an always-empty scope, which
//      (per that function's own Sprint-326 safety branch) performs NO file-level
//      revert, only drops the stash. A real WIRE needed scope-threading, a new
//      config flag, and spawn-path changes in a different subsystem — for a
//      behavior that (1) makes undesirable anyway.
//   4. The one genuinely live export, `revertFilesToHead`, already covers the
//      real need (out-of-scope file revert on partial-promotion downgrade,
//      sprint-phases.ts PROMOTE-W1b) and was kept.
//
// Removed: setupTaskSnapshot (worker.ts), applyRollbackVerdict (result-evaluator.ts),
// and the underlying git-stash snapshot/verdict apparatus in worker-rollback.ts
// (snapshotWorkerScope, rollbackWorkerScope, dropWorkerSnapshot, writeStashRef,
// readStashRef, clearStashRef, WorkerRollbackError, NOSTASH_SENTINEL, etc.) plus
// their exclusive test files (tests/agents/worker-rollback*.test.ts).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { revertFilesToHead } from '../../src/agents/worker-rollback.js';
import * as workerRollback from '../../src/agents/worker-rollback.js';
import * as worker from '../../src/agents/worker.js';
import * as resultEvaluator from '../../src/orchestra/result-evaluator.js';

function git(repo: string, args: string[]): void {
  execFileSync('git', args, { cwd: repo, stdio: ['ignore', 'ignore', 'pipe'] });
}

describe('ROLLBACK-DECIDE (born-427): dead worker-rollback apparatus removed', () => {
  it('setupTaskSnapshot is no longer exported from worker.ts', () => {
    expect((worker as Record<string, unknown>).setupTaskSnapshot).toBeUndefined();
  });

  it('applyRollbackVerdict is no longer exported from result-evaluator.ts', () => {
    expect((resultEvaluator as Record<string, unknown>).applyRollbackVerdict).toBeUndefined();
  });

  it('the git-stash snapshot/verdict primitives are no longer exported from worker-rollback.ts', () => {
    const removed = workerRollback as Record<string, unknown>;
    expect(removed.snapshotWorkerScope).toBeUndefined();
    expect(removed.rollbackWorkerScope).toBeUndefined();
    expect(removed.dropWorkerSnapshot).toBeUndefined();
    expect(removed.writeStashRef).toBeUndefined();
    expect(removed.readStashRef).toBeUndefined();
    expect(removed.clearStashRef).toBeUndefined();
    expect(removed.WorkerRollbackError).toBeUndefined();
  });

  it('revertFilesToHead (the one live export, PROMOTE-W1b) still exists and works', () => {
    expect(typeof revertFilesToHead).toBe('function');
  });
});

describe('revertFilesToHead — kept live mechanism still functions (tmpdir git fixture)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'rollback-decide-'));
    git(tmp, ['init', '-q']);
    git(tmp, ['config', 'user.email', 'test@test']);
    git(tmp, ['config', 'user.name', 'test']);
    writeFileSync(join(tmp, 'tracked.ts'), 'export const x = 1;\n');
    git(tmp, ['add', '-A']);
    git(tmp, ['commit', '-q', '-m', 'initial']);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('reverts a modified tracked file back to HEAD', () => {
    writeFileSync(join(tmp, 'tracked.ts'), 'export const x = 999;\n');
    revertFilesToHead(tmp, ['tracked.ts']);
    expect(readFileSync(join(tmp, 'tracked.ts'), 'utf-8')).toBe('export const x = 1;\n');
  });

  it('cleans an untracked file that is not in HEAD', () => {
    mkdirSync(join(tmp, 'src'), { recursive: true });
    const untracked = join(tmp, 'src', 'untracked.ts');
    writeFileSync(untracked, 'export const y = 2;\n');
    revertFilesToHead(tmp, ['src/untracked.ts']);
    expect(existsSync(untracked)).toBe(false);
  });

  it('leaves files outside the given path list untouched', () => {
    writeFileSync(join(tmp, 'tracked.ts'), 'export const x = 999;\n');
    writeFileSync(join(tmp, 'other.ts'), 'export const z = 3;\n');
    revertFilesToHead(tmp, ['tracked.ts']);
    expect(readFileSync(join(tmp, 'tracked.ts'), 'utf-8')).toBe('export const x = 1;\n');
    expect(existsSync(join(tmp, 'other.ts'))).toBe(true);
  });
});
