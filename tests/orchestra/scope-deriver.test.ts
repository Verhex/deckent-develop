import { describe, it, expect } from 'vitest';
import { deriveTestScope } from '../../src/orchestra/scope-deriver.js';
import { createTask } from '../../src/orchestra/task-builder.js';

describe('deriveTestScope', () => {
  // (a) src/core/X.ts → tests/core/X.test.ts inferred
  it('infers mirror test path for src/core/X.ts', () => {
    const result = deriveTestScope(['src/core/memory-store.ts']);
    expect(result.extraFiles).toContain('tests/core/memory-store.test.ts');
    expect(result.extraDirs).toContain('tests/core/');
  });

  // (b) Multi-file: src/orchestra/A.ts + B.ts → A.test.ts + B.test.ts both
  it('infers test paths for multiple source files', () => {
    const result = deriveTestScope([
      'src/orchestra/task-builder.ts',
      'src/orchestra/sprint-planner.ts',
    ]);
    expect(result.extraFiles).toContain('tests/orchestra/task-builder.test.ts');
    expect(result.extraFiles).toContain('tests/orchestra/sprint-planner.test.ts');
    expect(result.extraDirs).toContain('tests/orchestra/');
  });

  // (c) scripts/X.mjs → tests/scripts/X.test.ts
  it('infers tests/scripts/X.test.ts for scripts/X.mjs', () => {
    const result = deriveTestScope(['scripts/sprint-retroactive-reclassify.mjs']);
    expect(result.extraFiles).toContain('tests/scripts/sprint-retroactive-reclassify.test.ts');
    expect(result.extraDirs).toContain('tests/scripts/');
  });

  // (d) docs/X.md → no test path (doc-only)
  it('returns no test paths for docs/*.md files', () => {
    const result = deriveTestScope(['docs/CHANGELOG.md', 'docs/reference/api-surface.md']);
    expect(result.extraFiles).toHaveLength(0);
    expect(result.extraDirs).toHaveLength(0);
  });

  // (e) Idempotency: files already in filesWrite still appear in extraFiles
  //     (caller filters against existing scope; deriveTestScope returns candidates unconditionally)
  it('returns all derived candidates regardless of existing scope (caller handles idempotency)', () => {
    const existing = [
      'src/core/config.ts',
      'tests/core/config.test.ts',
    ];
    const result = deriveTestScope(existing);
    // src/core/config.ts derives test paths
    expect(result.extraFiles).toContain('tests/core/config.test.ts');
    // tests/core/config.test.ts starts with tests/ not src/ → no derivation for it
    const doubleDerived = result.extraFiles.filter(f => f.startsWith('tests/core/config.test.ts'));
    expect(doubleDerived).toHaveLength(1); // exactly one, not doubled
  });

  // (f) Edge: src/X.ts (no subdir) → tests/X.test.ts
  it('infers tests/X.test.ts for top-level src/X.ts', () => {
    const result = deriveTestScope(['src/index.ts']);
    expect(result.extraFiles).toContain('tests/index.test.ts');
    expect(result.extraDirs).toContain('tests/');
  });

  it('includes edge and split variants for src/ files', () => {
    const result = deriveTestScope(['src/core/utils.ts']);
    expect(result.extraFiles).toContain('tests/core/utils.test.ts');
    expect(result.extraFiles).toContain('tests/core/utils-edge.test.ts');
    expect(result.extraFiles).toContain('tests/core/utils-split.test.ts');
  });

  it('handles scripts/*.ts the same as scripts/*.mjs', () => {
    const result = deriveTestScope(['scripts/build-helper.ts']);
    expect(result.extraFiles).toContain('tests/scripts/build-helper.test.ts');
  });

  it('returns empty for empty filesWrite', () => {
    const result = deriveTestScope([]);
    expect(result.extraFiles).toHaveLength(0);
    expect(result.extraDirs).toHaveLength(0);
  });
});

describe('createTask scopeDerivation audit trail (Sprint 196 WP-3)', () => {
  it('populates routingMeta.scopeDerivation when src/ files in scope', () => {
    const task = createTask({
      title: 'Test task',
      description: 'Test',
      model: 'claude-sonnet-5',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'test',
      scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/scope-deriver.ts'] },
      dependencies: [],
      goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
      sprintId: 'sprint-196',
    }, 4);
    expect(task.routingMeta?.scopeDerivation).toBeDefined();
    expect(task.routingMeta?.scopeDerivation?.extraFiles).toContain('tests/orchestra/scope-deriver.test.ts');
    expect(task.routingMeta?.scopeDerivation?.reason).toBe('test-mirror');
  });

  it('does not set routingMeta.scopeDerivation when no derivable files (docs only)', () => {
    const task = createTask({
      title: 'Docs task',
      description: 'Docs only',
      model: 'claude-haiku-4-5-20251001',
      effort: 'low',
      priority: 'NORMAL',
      reason: 'test',
      scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/guide.md'] },
      dependencies: [],
      goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
      sprintId: 'sprint-196',
    }, 5);
    expect(task.routingMeta?.scopeDerivation).toBeUndefined();
  });
});
