// ─── tests/orchestra/worker-prompt-bounded-discovery.test.ts ────────────────
//
// MASTER-PLAN 668. The same documentation task was SIGKILLed (exit 137) three
// times — 457-003, 458-005, 459-003 — each while running repository-wide
// discovery; the final death came mid `git log --oneline --all | grep`. Peak
// container memory at that instant was 0.20 GB of 6 GB with docker reporting no
// OOM, so the memory ceiling was not the cause. Bounding discovery in the
// directive let the identical task finish DONE in 31 turns.
//
// The rule now ships in the worker prompt itself rather than depending on
// whoever writes the directives remembering it. Read scope says what you may
// CHANGE — it never licensed scanning the whole repository to find it.

import { describe, it, expect } from 'vitest';
import { buildScopeBlock } from '../../src/orchestra/prompt-god-template.js';
import type { TaskScope } from '../../src/core/types.js';

function scope(overrides: Partial<TaskScope> = {}): TaskScope {
  return {
    directories: ['src/core/'],
    filesRead: ['src/core/deck-broker.ts'],
    filesWrite: ['src/core/deck-broker.ts'],
    ...overrides,
  } as TaskScope;
}

/** Every rendered variant must carry the same bounded-discovery contract. */
const VARIANTS: Array<[string, TaskScope]> = [
  ['write-authority list', scope()],
  ['directory fallback', scope({ filesWrite: [] })],
];

describe('worker prompt — bounded discovery (MASTER-PLAN 668)', () => {
  for (const [label, taskScope] of VARIANTS) {
    it(`forbids repository-wide discovery in the ${label} variant`, () => {
      const rules = buildScopeBlock(taskScope, [], false);
      expect(rules).toContain('Bounded discovery');
      expect(rules).toContain('git log --all');
      // The four scan shapes that actually burn a worker.
      for (const shape of ['grep', 'rg', 'find', 'ls -R']) {
        expect(rules).toContain(shape);
      }
    });

    it(`offers a bounded excerpt instead, in the ${label} variant`, () => {
      expect(buildScopeBlock(taskScope, [], false)).toContain("sed -n 'START,ENDp'");
    });

    it(`tells the worker to stop rather than widen, in the ${label} variant`, () => {
      const rules = buildScopeBlock(taskScope, [], false);
      expect(rules).toContain('NO_GO');
      expect(rules).toContain('do not widen the search');
    });
  }

  it('keeps the .tasks lifecycle exemption alongside the new rule', () => {
    const rules = buildScopeBlock(scope(), [], false);
    expect(rules).toContain('.tasks/');
    expect(rules).toContain('Bounded discovery');
  });
});
