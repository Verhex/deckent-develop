import { describe, expect, it, onTestFinished } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Task } from '../../src/core/task-types.js';
import {
  evaluateTestDiscoverability,
  extractPlannedTestPaths,
  resolveTestDiscoveryContracts,
} from '../../src/core/test-discovery-contract.js';

function task(id: string, path: string): Task {
  return {
    id,
    title: 'test contract',
    description: `Run \`npx vitest run ${path}\`.`,
    scope: { directories: [], filesRead: [], filesWrite: [path] },
    goNogo: {
      goCriteria: `**Test:** npx vitest run ${path}`,
      noGoCriteria: 'test fails',
      techDebtAcceptable: 'none',
    },
    dependencies: [],
  } as Task;
}

describe('test discovery contract preflight', () => {
  it('extracts explicit test targets from scope and proof text once', () => {
    expect(extractPlannedTestPaths(task('001', 'deneme/task-001/example.test.ts')))
      .toEqual(['deneme/task-001/example.test.ts']);
  });

  // 7098 canary finding (owner-admitted fix 2026-08-20): prose referring back
  // to a qualified planned test by its bare filename is an anaphor, not a
  // second root-level planned file.
  it('suppresses a bare-filename anaphor when the qualified path is also planned', () => {
    const anaphoric = task('002', 'tests/orchestra/brain-skill.test.ts');
    anaphoric.description += ' Replace the literal inside brain-skill.test.ts with the canonical constant.';
    expect(extractPlannedTestPaths(anaphoric))
      .toEqual(['tests/orchestra/brain-skill.test.ts']);
  });

  it('keeps a bare filename with no qualified counterpart (genuine root-level plan)', () => {
    const bare = task('003', 'src/core/config.ts');
    bare.description = 'Write orphan.test.ts covering the new branch.';
    expect(extractPlannedTestPaths(bare)).toEqual(['orphan.test.ts']);
  });

  it('blocks the Run 475 failure class before dispatch', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-test-contract-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, 'vitest.config.ts'),
      `export default { test: { include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'] } }`,
      'utf-8',
    );

    const contracts = resolveTestDiscoveryContracts(root);
    expect(contracts).toEqual([
      expect.objectContaining({
        runner: 'vitest',
        include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
      }),
    ]);
    expect(evaluateTestDiscoverability(
      [task('475-001', 'deneme/task-001/example.test.ts')],
      contracts,
    )).toEqual([
      expect.objectContaining({
        taskId: '475-001',
        testPath: 'deneme/task-001/example.test.ts',
        configPath: 'vitest.config.ts',
      }),
    ]);
  });

  it('accepts a target matched by the configured runner include', () => {
    expect(evaluateTestDiscoverability(
      [task('001', 'tests/unit/example.test.ts')],
      [{
        runner: 'vitest',
        configPath: 'vitest.config.ts',
        include: ['tests/**/*.test.ts'],
        evidence: 'static-config',
      }],
    )).toEqual([]);
  });

  it('normalizes canonical and scavenged absolute workspace paths before matching', () => {
    const root = '/home/alperen/deckent-dev';
    const absolute = task('absolute', `${root}/tests/unit/example.test.ts`);
    absolute.scope.filesWrite.push('home/alperen/deckent-dev/tests/unit/example.test.ts');
    const contracts = [{
      runner: 'vitest', configPath: 'vitest.config.ts',
      include: ['tests/**/*.test.ts'], evidence: 'static-config' as const,
    }];
    expect(extractPlannedTestPaths(absolute, root)).toEqual(['tests/unit/example.test.ts']);
    expect(evaluateTestDiscoverability([absolute], contracts, root)).toEqual([]);
  });

  it('does not mistake coverage.include for the test discovery contract', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-test-contract-coverage-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(
      join(root, 'vitest.config.ts'),
      `export default { test: { coverage: { include: ['src/**/*.ts'] } } }`,
      'utf-8',
    );

    expect(resolveTestDiscoveryContracts(root)).toEqual([]);
  });
});
