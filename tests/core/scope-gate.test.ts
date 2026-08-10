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

  it('does NOT flag a mirror-named NEW test whose task also owns the matching source (449-006 live case)', () => {
    // tests/cli/commands/history.test.ts exists; a NEW tests/mcp/tools/history.test.ts
    // is parallel suite naming, not a wrong directory, WHEN the same task also writes
    // src/mcp/tools/history.ts (the module's own test) — the wrong-dir rule killed the
    // RUN-RENAME dilim-2 run twice (flow-a7e3c2d2/2f42f845) on exactly this shape.
    const res = evaluateScopeGate({
      tasks: [task('t1', ['src/mcp/tools/history.ts', 'tests/mcp/tools/history.test.ts'])],
      trackedFiles: [
        ...TRACKED,
        'src/mcp/tools/history.ts',
        'tests/cli/commands/history.test.ts',
        'tests/mcp/tools/other.test.ts',
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.verdicts.map(v => v.classification)).toEqual(['confirmed', 'new-plausible']);
  });

  it('KEEPS the wrong-dir block for a mirror-named test with NO matching source in the task (397-007 shape)', () => {
    // The task writes an unrelated source file — a test name matching nothing the task
    // owns is the wrong-directory-reference shape; the auto-replace repair must survive.
    const res = evaluateScopeGate({
      tasks: [task('t1', ['src/core/config.ts', 'tests/mcp/tools/history.test.ts'])],
      trackedFiles: [...TRACKED, 'tests/cli/commands/history.test.ts', 'tests/mcp/tools/other.test.ts'],
    });
    expect(res.ok).toBe(false);
  });

  it('KEEPS the wrong-dir block for a mirror-named test whose parent directory is untracked', () => {
    // The test-basename exemption requires a tracked parent dir — an untracked dir
    // flows through the invented-dir rules unchanged (thin ancestor here ⇒ suspect).
    const res = evaluateScopeGate({
      tasks: [task('t1', ['src/mcp/tools/history.ts', 'tests/imaginary/history.test.ts'])],
      trackedFiles: [...TRACKED, 'src/mcp/tools/history.ts', 'tests/cli/commands/history.test.ts'],
    });
    expect(res.ok).toBe(false);
  });

  it('KEEPS the 573/518 wrong-dir block for source-module basenames even with a tracked parent', () => {
    // src/orchestra/ is tracked, yet worker.ts belongs to src/agents/ — the test-file
    // exemption must NOT leak onto source modules.
    const res = evaluateScopeGate({
      tasks: [task('t1', ['src/orchestra/worker.ts'])],
      trackedFiles: TRACKED,
    });
    expect(res.ok).toBe(false);
  });

  it('treats a glob scope pattern matching tracked files as confirmed (flow-63aedcaf live case)', () => {
    // Planner sometimes emits pattern scopes; a glob spanning real content is a
    // scope declaration, not a typo — it must not block the run post-approval.
    const res = evaluateScopeGate({
      tasks: [task('t1', ['src/core/**/*.ts', 'tests/core/*.test.ts'])],
      trackedFiles: TRACKED,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.verdicts.map(v => v.classification)).toEqual(['confirmed', 'confirmed']);
    expect(res.verdicts[0]!.reason).toContain('scope pattern matching');
  });

  it('still BLOCKS a glob pattern that matches no tracked file (wrong-directory pattern)', () => {
    const res = evaluateScopeGate({
      tasks: [task('t1', ['src/nonexistent/**/*.ts'])],
      trackedFiles: TRACKED,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.suspects[0]!.reason).toContain('matches no tracked file');
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

  // sprint-399/003 — SAN-2-CORE: born-N6 (397-007/011) evidence-backed suspect
  // resolution. `resolveSuggestions` is opt-in; the sprint that first surfaced this
  // gap had NO wiring for it and had to fall back to a blanket --force-scope.
  describe('resolveSuggestions — suggestion-adoption (sprint-399/003, born-N6)', () => {
    // 397-011 fixture: the SAME task's filesWrite lists both the wrong-dir typo
    // (docs/refdocs-adr-regen.test.ts) and the already-correct path
    // (tests/docs/refdocs-adr-regen.test.ts) side by side — a typo-duplicate.
    const DUPE_TRACKED = [...TRACKED, 'tests/docs/refdocs-adr-regen.test.ts'];
    function dupeTask() {
      return task('t1', ['docs/refdocs-adr-regen.test.ts', 'tests/docs/refdocs-adr-regen.test.ts']);
    }

    // 397-007 fixture: task wrote to tests/cli/error-handling-unification.test.ts
    // but the real (sole) tracked file is tests/core/error-handling-unification.test.ts.
    const RENAME_TRACKED = [...TRACKED, 'tests/core/error-handling-unification.test.ts'];
    function renameTask() {
      return task('t1', ['tests/cli/error-handling-unification.test.ts']);
    }

    it('REPRODUCE: 397-011 dupe-typo still blocks with resolveSuggestions unset (RED-before-fix baseline)', () => {
      const res = evaluateScopeGate({ tasks: [dupeTask()], trackedFiles: DUPE_TRACKED });
      expect(res.ok).toBe(false);
    });

    it('REPRODUCE: 397-007 wrong-dir rename still blocks with resolveSuggestions unset (RED-before-fix baseline)', () => {
      const res = evaluateScopeGate({ tasks: [renameTask()], trackedFiles: RENAME_TRACKED });
      expect(res.ok).toBe(false);
    });

    it('rule (a) drop-duplicate: resolveSuggestions=true does not block the 397-011 typo-dupe', () => {
      const res = evaluateScopeGate({
        tasks: [dupeTask()],
        trackedFiles: DUPE_TRACKED,
        resolveSuggestions: true,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.resolutions).toEqual([{
        taskId: 't1',
        path: 'docs/refdocs-adr-regen.test.ts',
        action: 'drop-duplicate',
        replacement: 'tests/docs/refdocs-adr-regen.test.ts',
        reason: expect.stringContaining('tests/docs/refdocs-adr-regen.test.ts'),
      }]);
      expect(res.advisories.some(a => a.path === 'docs/refdocs-adr-regen.test.ts' && a.role === 'write')).toBe(true);
    });

    // rule (0) — sprint-500 (2026-08-10): a parallel mirror tree is not a typo.
    // A doc task declared `docs/tr/reference/` in scope and planned to CREATE the
    // Turkish mirrors of two English pages. Both were absent (the point of the
    // task) and shared a basename with their English source, so rule (a) dropped
    // the task's only deliverables and left it scoped to overwrite the English
    // originals. A declared scope directory is stated operator intent and must
    // outrank a basename coincidence.
    it('rule (0): a suspect inside a declared scope directory is intent, not a duplicate', () => {
      const res = evaluateScopeGate({
        tasks: [{
          id: 't1',
          scope: {
            filesWrite: ['docs/en/reference/model-activation.md', 'docs/tr/reference/model-activation.md'],
            directories: ['docs/tr/reference/', 'docs/en/reference/'],
          },
        }],
        trackedFiles: ['docs/en/reference/model-activation.md', 'docs/en/reference/other.md'],
        resolveSuggestions: true,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      // The mirror must survive: no resolution may drop or rewrite it.
      expect(res.resolutions.some(r => r.path === 'docs/tr/reference/model-activation.md')).toBe(false);
    });

    it('rule (b) auto-replace: resolveSuggestions=true does not block the 397-007 unambiguous rename', () => {
      const res = evaluateScopeGate({
        tasks: [renameTask()],
        trackedFiles: RENAME_TRACKED,
        resolveSuggestions: true,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.resolutions).toEqual([{
        taskId: 't1',
        path: 'tests/cli/error-handling-unification.test.ts',
        action: 'auto-replace',
        replacement: 'tests/core/error-handling-unification.test.ts',
        reason: expect.stringContaining('tests/core/error-handling-unification.test.ts'),
      }]);
    });

    it('rule (c) ambiguous: same basename in 2+ tracked dirs stays unresolved and still blocks in true-mode', () => {
      const AMBIGUOUS_TRACKED = [...TRACKED, 'tests/core/error-handling-unification.test.ts', 'tests/api/error-handling-unification.test.ts'];
      const res = evaluateScopeGate({
        tasks: [renameTask()],
        trackedFiles: AMBIGUOUS_TRACKED,
        resolveSuggestions: true,
      });
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.resolutions).toEqual([]);
      expect(res.suspects.map(s => s.path)).toEqual(['tests/cli/error-handling-unification.test.ts']);
    });

    it('rule (c) no suggestion (invented-dir): no resolution is produced', () => {
      const res = evaluateScopeGate({
        tasks: [task('t1', ['src/nonexistent-dir/brand-new-thing.ts'])],
        trackedFiles: TRACKED,
        resolveSuggestions: true,
      });
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.resolutions).toEqual([]);
    });

    it('a suspect READ path never gets a resolution', () => {
      const res = evaluateScopeGate({
        tasks: [task('t1', ['src/core/config.ts'], ['src/orchestra/worker.ts'])],
        trackedFiles: TRACKED,
        resolveSuggestions: true,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.resolutions).toEqual([]);
    });

    it('false-mode (default/omitted) is bit-identical to pre-399/003 behavior — resolved suspects still block', () => {
      const withoutFlag = evaluateScopeGate({ tasks: [dupeTask()], trackedFiles: DUPE_TRACKED });
      const withFalseFlag = evaluateScopeGate({
        tasks: [dupeTask()],
        trackedFiles: DUPE_TRACKED,
        resolveSuggestions: false,
      });
      expect(withoutFlag.ok).toBe(false);
      expect(withFalseFlag.ok).toBe(false);
      if (withoutFlag.ok || withFalseFlag.ok) return;
      expect(withFalseFlag.suspects).toEqual(withoutFlag.suspects);
      expect(withFalseFlag.message).toEqual(withoutFlag.message);
      // resolutions is still advisory data in false-mode — present, but did not affect blocking.
      expect(withFalseFlag.resolutions).toEqual([{
        taskId: 't1',
        path: 'docs/refdocs-adr-regen.test.ts',
        action: 'drop-duplicate',
        replacement: 'tests/docs/refdocs-adr-regen.test.ts',
        reason: expect.stringContaining('tests/docs/refdocs-adr-regen.test.ts'),
      }]);
    });
  });
});
