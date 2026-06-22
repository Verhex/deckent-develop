/**
 * R8/ADR-087 faithful regression — the reconciliation subprocess probes must be
 * ASYNC (non-blocking).
 *
 * Before this fix the git-diff / tsc / vitest probes inside reconcileSpuriousNoGo()
 * used `spawnSync`, which FROZE the Brain event loop for up to git10+tsc60+vitest120
 * ≈ 190s on every EVALUATE that reached a NO_GO with a projectRoot — no heartbeats,
 * no dashboard SSE, no other worker results could be serviced for that whole window.
 *
 * These tests are red on the pre-fix (sync) implementation: a synchronous function
 * returns a plain value, so `toBeInstanceOf(Promise)` fails. They are green only once
 * the functions are async `spawn`. The injected runner drives parsing without ever
 * touching a real subprocess (hermetic).
 */

import { describe, it, expect } from 'vitest';
import {
  defaultGetGitDiffStats,
  defaultRunTscCheck,
  defaultRunVitestScopeCheck,
  reconcileSpuriousNoGo,
  type SubprocessRunner,
} from '../../src/orchestra/mid-sprint-adapter.js';
import type { Task, TaskResult } from '../../src/core/task-types.js';

const ok = (stdout: string): SubprocessRunner => async () => ({ status: 0, stdout, error: false });
const fail = (): SubprocessRunner => async () => ({ status: 1, stdout: '', error: false });

const GIT_DIFF_STAT =
  ' src/foo.ts | 10 +++++-----\n' +
  ' src/bar.ts |  5 ++---\n' +
  ' 2 files changed, 15 insertions(+), 0 deletions(-)\n';

const VITEST_JSON = '{"numPassedTests":8,"numTotalTests":10}';

describe('R8/ADR-087 — reconciliation probes are async (non-blocking)', () => {
  it('defaultGetGitDiffStats returns a Promise (was spawnSync — froze the event loop)', () => {
    // Pre-fix: sync function returns a plain object → this assertion fails.
    expect(defaultGetGitDiffStats('/proj', { directories: ['src/'] } as Task['scope'], ok(GIT_DIFF_STAT)))
      .toBeInstanceOf(Promise);
  });

  it('defaultGetGitDiffStats parses the injected async runner output', async () => {
    const out = await defaultGetGitDiffStats('/proj', { directories: ['src/'] } as Task['scope'], ok(GIT_DIFF_STAT));
    expect(out.filesChanged).toEqual(['src/foo.ts', 'src/bar.ts']);
    expect(out.linesChanged).toBe(15);
  });

  it('defaultRunTscCheck returns a Promise and maps exit status', async () => {
    expect(defaultRunTscCheck('/proj', ok(''))).toBeInstanceOf(Promise);
    expect(await defaultRunTscCheck('/proj', ok(''))).toBe(true);
    expect(await defaultRunTscCheck('/proj', fail())).toBe(false);
  });

  it('defaultRunVitestScopeCheck returns a Promise and parses the JSON pass ratio', async () => {
    expect(defaultRunVitestScopeCheck('/proj', ['src/'], ok(VITEST_JSON))).toBeInstanceOf(Promise);
    const out = await defaultRunVitestScopeCheck('/proj', ['src/'], ok(VITEST_JSON));
    expect(out.passRatio).toBeCloseTo(0.8);
    expect(out.passed).toBe(true);
  });

  it('reconcileSpuriousNoGo is async end-to-end (returns a Promise resolving to the verdict)', async () => {
    const task = { id: 't1', scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/foo.ts'] } } as Task;
    const result = { taskId: 't1', selfAssessment: 'NO_GO', filesChanged: ['src/foo.ts'] } as TaskResult;
    const pending = reconcileSpuriousNoGo(result, task, '/proj', {
      getGitDiffStats: () => ({ linesChanged: 120, filesChanged: ['src/foo.ts'] }),
      runTscCheck: () => true,
      runVitestScopeCheck: () => ({ passRatio: 0.9, passed: true }),
    });
    expect(pending).toBeInstanceOf(Promise);
    const verdict = await pending;
    expect(verdict.decision).toBe('GO_WITH_TECH_DEBT');
    expect(verdict.reconciled).toBe(true);
  });
});
