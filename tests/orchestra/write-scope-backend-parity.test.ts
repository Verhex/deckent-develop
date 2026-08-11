/**
 * Row 4061 — WRITE-SCOPE-SSOT parity.
 *
 * Before this test, two backends derived the same authority two different ways:
 *   - sprint-spawner.ts   → ['.tasks/', ...scope.directories, ...scope.filesWrite]
 *   - spawn-backend-docker.ts → filesWrite ? filesWrite : (inspectionOnly ? [] : directories)
 * so an inspection-only task (exact filesRead, empty filesWrite) received an empty
 * project write scope under docker but a fully writable read-context directory list
 * under the spawner path.
 *
 * Both call sites now consume the single deriver `deriveWorkerWriteTargets`. This test
 * drives BOTH entry points against the same fixture task and asserts byte-equal write
 * targets and byte-equal `--allowedTools` flags — the inspection-only case included.
 *
 * Hermetic: pure functions only, no filesystem, network or provider access (ADR-D-002 C1/C3).
 */

import { describe, it, expect } from 'vitest';
import type { Task, TaskScope } from '../../src/core/types.js';
import { buildAllowedWriteTargets } from '../../src/orchestra/sprint-spawner.js';
import {
  buildDockerAllowedTools,
  deriveWorkerWriteTargets,
  formatAllowedToolsFlag,
} from '../../src/orchestra/spawn-backend-docker.js';

interface Fixture {
  name: string;
  scope: TaskScope;
  /** Expected canonical write targets — spelled out so a silent widening fails loudly. */
  expected: string[];
}

function makeScope(
  directories: string[],
  filesRead: string[],
  filesWrite: string[],
): TaskScope {
  return { directories, filesRead, filesWrite } as TaskScope;
}

function makeTask(scope: TaskScope): Pick<Task, 'scope'> {
  return { scope };
}

const FIXTURES: Fixture[] = [
  {
    // The shape of essentially every planned task: explicit write list + read context dirs.
    name: 'normal task — explicit filesWrite is the sole write authority',
    scope: makeScope(
      ['src/orchestra/', 'tests/orchestra/', 'docs/adr/'],
      ['src/orchestra/spawn-backend.ts'],
      ['src/orchestra/sprint-spawner.ts', 'src/orchestra/spawn-backend-docker.ts'],
    ),
    expected: [
      '.tasks/',
      'src/orchestra/sprint-spawner.ts',
      'src/orchestra/spawn-backend-docker.ts',
    ],
  },
  {
    // The exact divergence row 4061 measured.
    name: 'inspection-only task — exact filesRead, no filesWrite → no project write scope',
    scope: makeScope(
      ['src/core/', 'src/orchestra/'],
      ['src/core/live-execution-budget.ts'],
      [],
    ),
    expected: ['.tasks/'],
  },
  {
    name: 'legacy directory-scoped task — no file lists at all → directories stay the fallback',
    scope: makeScope(['src/core/', 'tests/core/'], [], []),
    expected: ['.tasks/', 'src/core/', 'tests/core/'],
  },
  {
    name: 'scope-less task — never falls open to unrestricted Write/Edit',
    scope: makeScope([], [], []),
    expected: ['.tasks/'],
  },
  {
    name: 'ADR-013 protected + extension-only junk is rejected on both paths',
    scope: makeScope(
      ['CLAUDE.md', 'DECKENT.md', '.json', 'src/'],
      [],
      ['DECKENT.md/', 'src/agents/worker.ts'],
    ),
    expected: ['.tasks/', 'src/agents/worker.ts'],
  },
  {
    name: 'file-like trailing slash normalized, duplicates collapsed',
    scope: makeScope(
      ['src/core/', 'src/core/'],
      [],
      ['src/core/config.ts/', 'src/core/config.ts'],
    ),
    expected: ['.tasks/', 'src/core/config.ts'],
  },
];

describe('write-target derivation parity across backends (row 4061)', () => {
  for (const fixture of FIXTURES) {
    describe(fixture.name, () => {
      it('sprint-spawner and docker backends derive byte-equal write targets', () => {
        const spawnerTargets = buildAllowedWriteTargets(makeTask(fixture.scope));
        const dockerTargets = deriveWorkerWriteTargets(fixture.scope);

        expect(spawnerTargets).toEqual(dockerTargets);
        expect(spawnerTargets).toEqual(fixture.expected);
      });

      it('both backends emit a byte-equal --allowedTools flag', () => {
        const spawnerFlag = formatAllowedToolsFlag(
          buildAllowedWriteTargets(makeTask(fixture.scope)),
        );
        const dockerFlag = buildDockerAllowedTools(fixture.scope);

        expect(spawnerFlag).toBe(dockerFlag);
        const targets = fixture.expected.join(',');
        expect(dockerFlag).toBe(
          `Read,Write(${targets}),Edit(${targets}),Bash,Glob,Grep`,
        );
      });
    });
  }

  it('an inspection-only task derives the same empty project write scope in every backend', () => {
    const scope = makeScope(['src/core/'], ['src/core/config.ts'], []);

    const spawnerTargets = buildAllowedWriteTargets(makeTask(scope));
    const dockerTargets = deriveWorkerWriteTargets(scope);

    // `.tasks/` is worker-protocol authority, not project write scope.
    expect(spawnerTargets).toEqual(['.tasks/']);
    expect(dockerTargets).toEqual(['.tasks/']);
    expect(spawnerTargets.filter(t => t !== '.tasks/')).toEqual([]);
    expect(dockerTargets.filter(t => t !== '.tasks/')).toEqual([]);
  });

  it('no backend widens beyond the union of .tasks/, directories and filesWrite', () => {
    for (const fixture of FIXTURES) {
      const permitted = new Set([
        '.tasks/',
        ...fixture.scope.directories,
        ...fixture.scope.filesWrite,
        // trailing-slash-normalized variants of the declared entries
        ...fixture.scope.filesWrite.map(p => p.replace(/\/$/, '')),
      ]);
      for (const target of deriveWorkerWriteTargets(fixture.scope)) {
        expect(permitted.has(target)).toBe(true);
      }
    }
  });
});
