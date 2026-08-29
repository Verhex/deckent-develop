import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  applyDirectivesFixes,
  checkDirectives,
  ENGINE_HOT_PATHS,
  findSameLineReadsFiles,
} from '../../scripts/lint-directives.mjs';
import { buildRepairDirectives } from '../../scripts/gen-repair-directives.mjs';
import {
  resolveRunPolicyFromDirectives,
  RUN_POLICY_DIRECTIVES_SECTION,
} from '../../src/orchestra/run-policy-resolver.js';

type Scope = { directories: string[]; filesRead: string[]; filesWrite: string[] };
const task = (title: string, scope: Scope, testTarget?: string, dependencies: string[] = []) =>
  ({ title, scope, testTarget, dependencies });

describe('directives start-öncesi lint', () => {
  it('flags same-line Reads+Files, empty scope, write collision and missing test as typed problems', () => {
    const content = '## Task 1: x\n- Files: a.test.ts, Reads: src/x.ts\n';
    expect(findSameLineReadsFiles(content)).toEqual([2]);
    const result = checkDirectives({
      repoRoot: '/nonexistent-root', content,
      tasks: [
        task('boş', { directories: [], filesRead: [], filesWrite: [] }),
        task('a', { directories: [], filesRead: [], filesWrite: ['tests/x.test.ts'] }),
        task('b', { directories: [], filesRead: [], filesWrite: ['tests/x.test.ts'] }, 'npx vitest run tests/x.test.ts'),
      ],
    });
    const codes = result.problems.map((p: { code: string }) => p.code).sort();
    expect(result.ok).toBe(false);
    // Style-warning since the parser multi-label fix (no longer a data-loss BLOCK).
    const sameLine = result.problems.find((p: { code: string }) => p.code === 'D_SAME_LINE_READS_FILES') as
      { severity: string } | undefined;
    expect(sameLine?.severity).toBe('WARN');
    expect(codes).toContain('D_EMPTY_SCOPE');
    expect(codes).toContain('D_WRITE_COLLISION');
    expect(codes).toContain('D_NO_TEST');
    expect(result.table).toHaveLength(3);
  });

  it('blocks uncovered direct src-imports (sprint-670 lesson) and the generator repairs exactly that gap', () => {
    const root = mkdtempSync(join(tmpdir(), 'dlint-'));
    mkdirSync(join(root, 'src/core'), { recursive: true });
    mkdirSync(join(root, 'tests/core'), { recursive: true });
    writeFileSync(join(root, 'src/core/thing.ts'), 'export const thing = 1;\n');
    writeFileSync(join(root, 'tests/core/thing.test.ts'),
      "import { thing } from '../../src/core/thing.js';\nexport const t = thing;\n");

    const noReads = checkDirectives({ repoRoot: root, content: '',
      tasks: [task('eksik', { directories: [], filesRead: [], filesWrite: ['tests/core/thing.test.ts'] }, 'npx vitest run tests/core/thing.test.ts')] });
    const block = noReads.problems.find((p: { code: string }) => p.code === 'D_NO_READS_FOR_SRC') as
      { uncoveredSrc?: string[] } | undefined;
    expect(noReads.ok).toBe(false);
    expect(block?.uncoveredSrc).toEqual(['src/core/thing.ts']);

    // Aynı açığı generator deterministik kapatır: Reads import-taramasından gelir.
    const generated = buildRepairDirectives({ repoRoot: root, files: ['tests/core/thing.test.ts'], chunkSize: 14 });
    expect(generated.content).toContain('- Reads: src/core/thing.ts');
    expect(generated.content).toContain(RUN_POLICY_DIRECTIVES_SECTION);
    expect(resolveRunPolicyFromDirectives(generated.content)?.constraints).toHaveLength(4);
    const repaired = checkDirectives({ repoRoot: root, content: generated.content,
      tasks: [task('tam', { directories: [], filesRead: ['src/core/thing.ts'], filesWrite: ['tests/core/thing.test.ts'] }, 'npx vitest run tests/core/thing.test.ts')] });
    expect(repaired.ok).toBe(true);

    // --fix system-assignment: a draft missing Reads AND Test is repaired
    // in-text and the repaired text re-validates clean (fix-then-verify).
    const draft = '# T\n\n## Task 1: hizala\n- Files: tests/core/thing.test.ts\n- Priority: HIGH\n### Description\nHizala.\n';
    const before = checkDirectives({ repoRoot: root, content: draft,
      tasks: [task('hizala', { directories: [], filesRead: [], filesWrite: ['tests/core/thing.test.ts'] })] });
    expect(before.ok).toBe(false);
    const fixedOut = applyDirectivesFixes({ content: draft, table: before.table, problems: before.problems });
    expect(fixedOut.content).toContain('- Reads: src/core/thing.ts');
    expect(fixedOut.content).toContain('- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/thing.test.ts');
    const after = checkDirectives({ repoRoot: root, content: fixedOut.content,
      tasks: [task('hizala', { directories: [], filesRead: ['src/core/thing.ts'], filesWrite: ['tests/core/thing.test.ts'] }, 'x')] });
    expect(after.ok).toBe(true);
  });

  it('warns when a later task depends transitively on a task changing the engine', () => {
    const fakeParser = () => [
      task('motor', { directories: [], filesRead: [], filesWrite: ['src/orchestra/task-builder.ts'] }, 'test'),
      task('ara', { directories: [], filesRead: ['src/a.ts'], filesWrite: [] }, undefined, ['task-1']),
      task('tüketici', { directories: [], filesRead: ['src/b.ts'], filesWrite: [] }, undefined, ['task-2']),
    ];

    const result = checkDirectives({ repoRoot: '/nonexistent-root', content: '', tasks: fakeParser() });
    const warning = result.problems.find((problem: { code: string }) =>
      problem.code === 'D_ENGINE_SELF_CHANGE') as { severity: string; detail: string } | undefined;

    expect(ENGINE_HOT_PATHS).toContain('src/orchestra/task-builder.ts');
    expect(warning).toMatchObject({
      severity: 'WARN',
      detail: 'task-1 motoru değiştiriyor ve task-2 ona bağımlı — etki next-run-only, mini-run önerisi (sprint-674 dersi)',
    });
    expect(result.problems).toContainEqual(expect.objectContaining({
      code: 'D_ENGINE_SELF_CHANGE',
      detail: 'task-1 motoru değiştiriyor ve task-3 ona bağımlı — etki next-run-only, mini-run önerisi (sprint-674 dersi)',
    }));
  });

  it('does not warn when an engine-changing task has no dependent task', () => {
    const fakeParser = () => [
      task('motor', { directories: [], filesRead: [], filesWrite: ['src/orchestra/task-builder.ts'] }, 'test'),
      task('bağımsız', { directories: [], filesRead: ['src/a.ts'], filesWrite: [] }),
    ];

    const result = checkDirectives({ repoRoot: '/nonexistent-root', content: '', tasks: fakeParser() });

    expect(result.problems.some((problem: { code: string }) =>
      problem.code === 'D_ENGINE_SELF_CHANGE')).toBe(false);
  });
});
