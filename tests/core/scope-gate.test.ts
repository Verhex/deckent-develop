import { describe, it, expect } from 'vitest';
import { evaluateScopeGate, type ScopeGateTask } from '../../src/core/scope-gate.js';

// A representative slice of a real tracked-file set (git ls-files).
const TRACKED = [
  'src/agents/worker.ts',
  'src/agents/adaptive-agent.ts',
  'src/core/provider.ts',
  'src/core/config.ts',
  'src/core/routing-engine.ts',
  'src/orchestra/sprint-controller.ts',
  'src/orchestra/task-builder.ts',
  'tests/core/routing-engine.test.ts',
  'src/foo/index.ts',
  'src/bar/index.ts',
];

function task(id: string, filesWrite: string[], filesRead: string[] = []): ScopeGateTask {
  return { id, scope: { filesWrite, filesRead } };
}

describe('evaluateScopeGate', () => {
  it('blocks the exact born-573/518 wrong-directory write with a did-you-mean suggestion', () => {
    const res = evaluateScopeGate({
      tasks: [
        task('t1', ['src/orchestra/worker.ts']),   // real file is src/agents/worker.ts
        task('t2', ['src/providers/provider.ts']), // real file is src/core/provider.ts
      ],
      trackedFiles: TRACKED,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('SCOPE_GATE_SUSPECT');
    expect(res.suspects.map(s => s.path).sort()).toEqual([
      'src/orchestra/worker.ts',
      'src/providers/provider.ts',
    ]);
    const w1 = res.suspects.find(s => s.path === 'src/orchestra/worker.ts')!;
    expect(w1.suggestion).toBe('src/agents/worker.ts');
    expect(res.message).toContain("did you mean 'src/agents/worker.ts'");
  });

  it('passes when acknowledgeScopePaths overrides the block', () => {
    const res = evaluateScopeGate({
      tasks: [task('t1', ['src/orchestra/worker.ts'])],
      trackedFiles: TRACKED,
      acknowledgeScopePaths: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.overrideApplied).toBe(true);
  });

  it('confirms an existing tracked write path', () => {
    const res = evaluateScopeGate({
      tasks: [task('t1', ['src/core/config.ts'])],
      trackedFiles: TRACKED,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.verdicts[0]!.classification).toBe('confirmed');
  });

  it('treats a brand-new file in an existing directory as new-plausible (does NOT block)', () => {
    const res = evaluateScopeGate({
      tasks: [
        task('t1', ['src/core/scope-gate.ts', 'tests/core/scope-gate.test.ts']),
      ],
      trackedFiles: TRACKED,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.verdicts.every(v => v.classification === 'new-plausible')).toBe(true);
  });

  it('does NOT flag a new file with a ubiquitous basename (index.ts) as wrong-dir', () => {
    // src/foo/index.ts and src/bar/index.ts both exist; a new src/core/index.ts (whose
    // parent IS a tracked dir) must be new-plausible, NOT a wrong-dir suspect — index.ts
    // legitimately recurs everywhere, so the basename collision is not evidence of a typo.
    const res = evaluateScopeGate({
      tasks: [task('t1', ['src/core/index.ts'])],
      trackedFiles: TRACKED,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.verdicts[0]!.classification).toBe('new-plausible');
  });

  it('flags a write into a fully invented directory as suspect (no suggestion)', () => {
    const res = evaluateScopeGate({
      tasks: [task('t1', ['src/nonexistent-dir/brand-new-thing.ts'])],
      trackedFiles: TRACKED,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.suspects[0]!.suggestion).toBeUndefined();
    expect(res.suspects[0]!.reason).toContain('is not in the repo');
  });

  it('does not block on a suspect READ path (advisory only)', () => {
    const res = evaluateScopeGate({
      tasks: [task('t1', ['src/core/config.ts'], ['src/orchestra/worker.ts'])],
      trackedFiles: TRACKED,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.advisories.some(a => a.path === 'src/orchestra/worker.ts' && a.role === 'read')).toBe(true);
  });

  it('confirms a READ of a file created by another task in the same plan', () => {
    const res = evaluateScopeGate({
      tasks: [
        task('t1', ['src/core/new-module.ts']),            // creates it (new-plausible)
        task('t2', ['src/core/config.ts'], ['src/core/new-module.ts']), // reads it
      ],
      trackedFiles: TRACKED,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const read = res.verdicts.find(v => v.role === 'read' && v.path === 'src/core/new-module.ts')!;
    expect(read.classification).toBe('confirmed');
  });

  // born-584 — greenfield (fresh `deckent init`, zero tracked files): the
  // invented-dir heuristic has NO signal (`git ls-files` exits 0 with empty
  // stdout, the gate still runs), so nested write paths must NOT hard-block a
  // legitimate first sprint — Advisory-WARN posture (Alperen, 2026-07-10).
  describe('greenfield (0 tracked files) — advisory, never blocks (born-584)', () => {
    it('does NOT block nested write paths in an empty repo', () => {
      const res = evaluateScopeGate({
        tasks: [task('t1', ['src/core/app.ts', 'src/cli/main.ts'])],
        trackedFiles: [],
      });
      expect(res.ok).toBe(true);
    });

    it('flags the pass as greenfield with a visible notice and advisory verdicts', () => {
      const res = evaluateScopeGate({
        tasks: [task('t1', ['src/core/app.ts']), task('t2', ['lib/util.ts'])],
        trackedFiles: [],
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.greenfield).toBe(true);
      expect(res.greenfieldNotice).toBeTruthy();
      // Every nested write is surfaced as an advisory (visible, not silent).
      const advisoryPaths = res.advisories.filter(a => a.role === 'write').map(a => a.path).sort();
      expect(advisoryPaths).toEqual(['lib/util.ts', 'src/core/app.ts']);
    });

    it('root-only repo (tracked files, ZERO tracked dirs — e.g. README+LICENSE) is also advisory', () => {
      // Structural predicate: trackedDirs.size === 0 is exactly the condition
      // under which the invented-dir rule has no signal — not a numeric threshold.
      const res = evaluateScopeGate({
        tasks: [task('t1', ['src/core/app.ts'])],
        trackedFiles: ['README.md', 'LICENSE'],
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.greenfield).toBe(true);
    });

    it('all-confirmed writes in a root-only repo carry NO greenfield notice (nothing unvalidated)', () => {
      const res = evaluateScopeGate({
        tasks: [task('t1', ['README.md'])],
        trackedFiles: ['README.md'],
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.greenfield).toBeUndefined();
      expect(res.greenfieldNotice).toBeUndefined();
    });

    it('non-greenfield behavior is untouched (no greenfield flag, block still fires)', () => {
      const res = evaluateScopeGate({
        tasks: [task('t1', ['src/invented/nowhere.ts'])],
        trackedFiles: TRACKED,
      });
      expect(res.ok).toBe(false);
      const pass = evaluateScopeGate({
        tasks: [task('t1', ['src/core/config.ts'])],
        trackedFiles: TRACKED,
      });
      expect(pass.ok).toBe(true);
      if (!pass.ok) return;
      expect(pass.greenfield).toBeUndefined();
      expect(pass.greenfieldNotice).toBeUndefined();
    });
  });
});
