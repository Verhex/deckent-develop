/**
 * PCOMP-6 D1a — exact targeted-test resolution for CRITICAL VERIFY STEPS.
 *
 * Ground-truth (prompt-refactor-6-step1, 2026-07-14): 31/31 regenerated
 * corpus prompts shipped the verify test line as a literal
 * `<path-to-the-test-file(s)-you-changed>` placeholder — the single most
 * frequent prompt defect. `resolveTargetedTestPaths` closes it purely from
 * plan-time data (scope test files + tracked mirror tests + goCriteria-named
 * families); `buildTestCommandLine` prints the exact set and keeps the legacy
 * placeholder byte-identical when no set resolves (backward compat).
 */
import { describe, it, expect } from 'vitest';
import {
  resolveTargetedTestPaths,
  buildTestCommandLine,
  buildTaskPrompt,
} from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/types.js';

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: '999-001',
    title: 'exact-verify fixture',
    description: 'fixture',
    model: 'sonnet',
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/run-flow-store.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'store appends events', noGoCriteria: 'data loss', techDebtAcceptable: 'minor' },
    ...over,
  } as Task;
}

describe('resolveTargetedTestPaths — three plan-time sources', () => {
  it('source 1: test files already in filesWrite are always included', () => {
    const t = makeTask({
      scope: {
        directories: [], filesRead: [],
        filesWrite: ['src/core/foo.ts', 'tests/core/foo-extra.test.ts'],
      },
    });
    expect(resolveTargetedTestPaths(t)).toContain('tests/core/foo-extra.test.ts');
  });

  it('source 2: mirror test of an src/ write-target is included ONLY when tracked (never invented)', () => {
    const t = makeTask({ scope: { directories: [], filesRead: [], filesWrite: ['src/core/foo.ts'] } });
    const tracked = ['src/core/foo.ts', 'tests/core/foo.test.ts'];
    expect(resolveTargetedTestPaths(t, tracked)).toContain('tests/core/foo.test.ts');
    // absent from trackedFiles → not invented
    expect(resolveTargetedTestPaths(t, ['src/core/foo.ts'])).not.toContain('tests/core/foo.test.ts');
  });

  it('source 3: goCriteria-named test families are included (explicit .test ext, even untracked-list-absent)', () => {
    const t = makeTask({
      goNogo: {
        goCriteria: 'mevcut tests/orchestra/run-flow-reducer.test.ts ailesi regresyonsuz kalır',
        noGoCriteria: 'x',
        techDebtAcceptable: 'none',
      },
    });
    expect(resolveTargetedTestPaths(t)).toContain('tests/orchestra/run-flow-reducer.test.ts');
  });

  it('deduplicates, sorts, and caps deterministically', () => {
    const files = Array.from({ length: 20 }, (_, i) => `tests/core/f${String(i).padStart(2, '0')}.test.ts`);
    const t = makeTask({ scope: { directories: [], filesRead: [], filesWrite: [...files, files[0]!] } });
    const out = resolveTargetedTestPaths(t, undefined, 12);
    expect(out).toHaveLength(12);
    expect(out).toEqual([...out].sort());
  });
});

describe('buildTestCommandLine — exact set vs legacy placeholder', () => {
  const vc = { test: 'npx vitest run', check: 'npx tsc --noEmit' };

  it('prints the exact resolved set verbatim', () => {
    const line = buildTestCommandLine(vc, ['tests/a.test.ts', 'tests/b.test.ts']);
    expect(line).toContain('`npx vitest run tests/a.test.ts tests/b.test.ts`');
    expect(line).not.toContain('<path-to-the-test-file');
  });

  it('empty/absent set → legacy placeholder line, byte-identical (backward compat)', () => {
    const legacy = `Run: \`npx vitest run <path-to-the-test-file(s)-you-changed>\` — this project's resolved test command, scoped to your changed file(s) — do NOT run it bare/unscoped (that is the Full test suite).`;
    expect(buildTestCommandLine(vc, [])).toBe(legacy);
    expect(buildTestCommandLine(vc)).toBe(legacy);
  });
});

describe('composition: full prompt carries the exact set when resolvable', () => {
  it('a task writing a tracked src file with tracked mirror test gets exact verify paths in the rendered prompt', () => {
    const t = makeTask({
      goNogo: { goCriteria: 'tests/core/run-flow-event-log.test.ts yeşil', noGoCriteria: 'x', techDebtAcceptable: 'none' },
    });
    const prompt = buildTaskPrompt(t, {
      verifyCommands: { test: 'npx vitest run', check: 'npx tsc --noEmit' },
      trackedFiles: [
        'src/core/run-flow-store.ts',
        'tests/core/run-flow-store.test.ts',
        'tests/core/run-flow-event-log.test.ts',
      ],
    } as never).prompt;
    expect(prompt).toContain('npx vitest run tests/core/run-flow-event-log.test.ts tests/core/run-flow-store.test.ts');
    expect(prompt).not.toContain('<path-to-the-test-file');
  });

  it('renders only a plain task-local Test command and hides wave-level commands', () => {
    const prompt = buildTaskPrompt(makeTask({
      description: '- Test: npx vitest run tests/orchestra/prompt-verify-exact-paths.test.ts',
    }), {
      verifyCommands: { test: 'npm run wave:test', check: 'npm run wave:check' },
    } as never).prompt;

    expect(prompt).toContain('`npx vitest run tests/orchestra/prompt-verify-exact-paths.test.ts`');
    expect(prompt).not.toContain('npm run wave:test');
    expect(prompt).not.toContain('npm run wave:check');
    expect(prompt).not.toContain('<path-to-the-test-file');
  });

  it('renders a typed HOLD instead of generic checks when scoped proof is absent', () => {
    const prompt = buildTaskPrompt(makeTask({ description: '- Test:' }), {
      verifyCommands: { test: 'npm run wave:test', check: 'npm run wave:check' },
    } as never).prompt;

    expect(prompt).toContain('SCOPED_PROOF_HOLD');
    expect(prompt).not.toContain('npm run wave:test');
    expect(prompt).not.toContain('npm run wave:check');
    expect(prompt).not.toContain('Examples: `tsc --noEmit`');
  });
});
