// MOAT-1 — "worktree-merge-race / 8-wide source-merge" investigation + repro.
//
// Claim under test (MASTER-PLAN): "8-wide'da 3/11 source-merge düştü 🔴 P0".
//
// GROUNDING (2026-07-01, evidence-based): the claim does NOT reproduce as stated.
//   • The "3/11" is a MISREAD of `docs/audits/OVERNIGHT-2026-06-27-findings.md:395`
//     ("Poll 4 — 3/11 DONE" = progress, not dropped). That same run recorded the
//     opposite of a merge-race: ":396 no collision", ":397 off-limits sweep CLEAN,
//     all untouched vs HEAD" — isolation WORKED.
//   • The worker-rollback / git-stash revert mechanism is DEAD CODE: `setupTaskSnapshot`
//     (snapshot) and `applyRollbackVerdict` (revert) have ZERO live callers, so workers
//     write in-place and nothing reverts their work.
//   • The only real concurrency risk in the evidence (:260) is a SAME-FILE overwrite
//     when two writers touch one file — and that is exactly what the spawn-time
//     file-lock defends against. This harness proves that defense is sound AND not
//     over-broad, and documents the single genuine residual.
//
// SCOPE OF THIS HARNESS (honest): these calls are SEQUENTIAL (single Node thread),
// so they exercise the lock's conflict-REJECTION and atomic-BATCH semantics — not a
// true multi-process O_EXCL race. The concurrency-soundness rests on `acquireSpawnLock`
// creating the lock with `O_WRONLY|O_CREAT|O_EXCL` and mapping the loser's `EEXIST` to
// a `SpawnLockError` (file-lock.ts:369-388, verified by code-read: EEXIST → read holder
// → throw conflict, never overwrite; a corrupted-read still fails safe to conflict).
// A genuine multi-process reproduction is deliberately NOT built here (heavier harness,
// tracked separately if wanted) — but a narrow pre-check TOCTOU (a lock observed
// mid-write between its O_EXCL create and content write could be judged "corrupted"
// and unlinked) is a real hardening edge, noted as SPAWNLOCK-TOCTOU-HARDEN.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acquireSpawnLocks,
  releaseSpawnLocks,
  SpawnLockError,
} from '../../src/core/file-lock.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'moat1-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('MOAT-1: spawn-lock blocks the same-file overwrite race', () => {
  it('N tasks contending for the SAME file → exactly ONE wins, the rest are blocked', () => {
    const file = 'src/shared.ts';
    const winners: string[] = [];
    const blocked: string[] = [];
    for (let i = 0; i < 8; i++) {
      const taskId = `t-${i}`;
      try {
        acquireSpawnLocks(root, taskId, [file]);
        winners.push(taskId);
      } catch (e) {
        expect(e).toBeInstanceOf(SpawnLockError);
        blocked.push(taskId);
      }
    }
    // O_EXCL guarantees a single holder — the exact 8-wide "no two workers write
    // the same file" invariant. This is why "3/11 source dropped" does not occur.
    expect(winners).toHaveLength(1);
    expect(blocked).toHaveLength(7);
  });

  it('the SpawnLockError names the conflicting holder (observability)', () => {
    acquireSpawnLocks(root, 'holder', ['src/x.ts']);
    try {
      acquireSpawnLocks(root, 'intruder', ['src/x.ts']);
      throw new Error('expected SpawnLockError');
    } catch (e) {
      expect(e).toBeInstanceOf(SpawnLockError);
      expect((e as SpawnLockError).conflictingTaskId).toBe('holder');
    }
  });
});

describe('MOAT-1: the defense is NOT over-broad (disjoint scopes all run)', () => {
  it('8 tasks with DISJOINT scope.filesWrite all acquire — none falsely blocked', () => {
    // Guards against the "570 SPAWN:BLOCKED over-block" concern: non-overlapping
    // tasks must never be blocked.
    for (let i = 0; i < 8; i++) {
      expect(() => acquireSpawnLocks(root, `t-${i}`, [`src/mod-${i}.ts`])).not.toThrow();
    }
  });
});

describe('MOAT-1: batch acquisition is atomic (no partial-lock leak)', () => {
  it('a batch with one conflicting file rejects wholesale and leaks no lock', () => {
    acquireSpawnLocks(root, 'holder', ['src/shared.ts']);
    // Task B wants [shared.ts (conflict) + free.ts]. The whole batch must fail,
    // and free.ts must NOT be left locked (else a third task is falsely blocked).
    expect(() => acquireSpawnLocks(root, 'B', ['src/shared.ts', 'src/free.ts']))
      .toThrow(SpawnLockError);
    // free.ts was rolled back → a different task can still claim it.
    expect(() => acquireSpawnLocks(root, 'C', ['src/free.ts'])).not.toThrow();
  });

  it('releasing a lock makes the file re-acquirable (turnover, not deadlock)', () => {
    acquireSpawnLocks(root, 'A', ['src/turn.ts']);
    expect(() => acquireSpawnLocks(root, 'B', ['src/turn.ts'])).toThrow(SpawnLockError);
    releaseSpawnLocks(root, 'A', ['src/turn.ts']);
    expect(() => acquireSpawnLocks(root, 'B', ['src/turn.ts'])).not.toThrow();
  });
});

describe('MOAT-1: the single genuine residual (ADR-037 soft scope-enforcement)', () => {
  it('a write OUTSIDE any declared scope.filesWrite is NOT lock-guarded (known gap)', () => {
    // The spawn-lock only covers a task's DECLARED scope.filesWrite. Runtime scope
    // enforcement is advisory/soft in V1 (ADR-037: hard-flip is post-GA V2), so a
    // worker that writes a file it did NOT declare bypasses the lock and could clobber
    // another task's file. This is the real residual — a KNOWN design decision tracked
    // as TOOL-SCOPE, NOT the "3/11 merge-race" the row claims.
    acquireSpawnLocks(root, 'A', ['src/declared.ts']); // A locked only its declared file
    // A worker writes an UNDECLARED file directly — the lock system never saw it.
    mkdirSync(join(root, 'src'), { recursive: true });
    const undeclared = join(root, 'src', 'A-forgot-to-declare.ts');
    writeFileSync(undeclared, 'out-of-scope content');
    expect(readFileSync(undeclared, 'utf-8')).toBe('out-of-scope content');
    // No lock exists for the undeclared path → the defense simply does not apply,
    // so another task is free to claim (and clobber) it. This is the residual gap.
    expect(() => acquireSpawnLocks(root, 'B', ['src/A-forgot-to-declare.ts'])).not.toThrow();
  });
});
