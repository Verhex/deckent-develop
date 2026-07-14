/**
 * PCOMP-8 U2 — planner output-contract completer (planner-normalize.ts).
 * Fixtures mirror the REAL sprint-442 defect shape: filesRead shipped empty,
 * tests split into a separate task, mentioned paths absent from read scope.
 */
import { describe, it, expect } from 'vitest';
import { normalizePlannerResult } from '../../src/orchestra/planner-normalize.js';
import type { PlannerResult, PlannerTask } from '../../src/core/types.js';

const TRACKED = [
  'src/orchestra/run-flow-coordinator.ts',
  'src/core/run-flow-store.ts',
  'src/core/run-flow-contract.ts',
  'tests/orchestra/run-flow-coordinator.test.ts',
];

const CONTENT: Record<string, string> = {
  'src/orchestra/run-flow-coordinator.ts': [
    "import { readFlowEvents } from '../core/run-flow-store.js';",
    "import type { RunFlowEvent } from '../core/run-flow-contract.js';",
  ].join('\n'),
};

const deps = {
  trackedFiles: TRACKED,
  readFile: (p: string) => CONTENT[p] ?? null,
};

function makeTask(over: Partial<PlannerTask> = {}): PlannerTask {
  return {
    title: 'Coordinator gap-detection',
    description: 'src/orchestra/run-flow-coordinator.ts icindeki fold yoluna kontrol ekle.',
    model: 'sonnet', effort: 'normal', priority: 'NORMAL', reason: 'r',
    scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/run-flow-coordinator.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
    ...over,
  } as PlannerTask;
}

function plan(...tasks: PlannerTask[]): PlannerResult {
  return { reasoning: 'x', tasks } as PlannerResult;
}

describe('N1 — mentioned real paths join filesRead', () => {
  it('a tracked path named in the description lands in filesRead (never filesWrite)', () => {
    const out = normalizePlannerResult(plan(makeTask({
      description: 'davranışı src/core/run-flow-contract.ts sözleşmesine göre hizala',
    })), deps);
    expect(out.tasks[0]!.scope.filesRead).toContain('src/core/run-flow-contract.ts');
    expect(out.tasks[0]!.scope.filesWrite).not.toContain('src/core/run-flow-contract.ts');
  });

  it('untracked mentioned paths are NOT invented into scope', () => {
    const out = normalizePlannerResult(plan(makeTask({
      description: 'bkz. src/core/imaginary-module.ts',
    })), deps);
    expect(out.tasks[0]!.scope.filesRead).not.toContain('src/core/imaginary-module.ts');
  });
});

describe('N2 — written source files pull their imports into filesRead', () => {
  it('relative imports resolve to repo paths (.js→.ts) and join filesRead', () => {
    const out = normalizePlannerResult(plan(makeTask()), deps);
    const read = out.tasks[0]!.scope.filesRead;
    expect(read).toContain('src/core/run-flow-store.ts');
    expect(read).toContain('src/core/run-flow-contract.ts');
  });

  it('unreadable files are fail-soft (task unchanged, no throw)', () => {
    const out = normalizePlannerResult(plan(makeTask({
      scope: { directories: [], filesRead: [], filesWrite: ['src/core/run-flow-store.ts'] },
    })), { ...deps, readFile: () => null });
    expect(out.tasks[0]!.scope.filesWrite).toContain('src/core/run-flow-store.ts');
  });
});

describe('N3 — mirror-test create-if-missing (the G5 placeholder killer)', () => {
  it('a behavior-changing src task gains its mirror test in filesWrite', () => {
    const out = normalizePlannerResult(plan(makeTask()), deps);
    expect(out.tasks[0]!.scope.filesWrite).toContain('tests/orchestra/run-flow-coordinator.test.ts');
  });

  it('does NOT add the mirror when another task in the plan owns that test file (442-decomposition stays legal)', () => {
    const testTask = makeTask({
      title: 'Coordinator test-ailesi',
      scope: { directories: [], filesRead: [], filesWrite: ['tests/orchestra/run-flow-coordinator.test.ts'] },
    });
    const out = normalizePlannerResult(plan(makeTask(), testTask), deps);
    expect(out.tasks[0]!.scope.filesWrite).not.toContain('tests/orchestra/run-flow-coordinator.test.ts');
  });

  it('a pure test-authorship task is never given extra mirrors', () => {
    const t = makeTask({
      scope: { directories: [], filesRead: [], filesWrite: ['tests/orchestra/run-flow-coordinator.test.ts'] },
    });
    const out = normalizePlannerResult(plan(t), deps);
    expect(out.tasks[0]!.scope.filesWrite).toEqual(['tests/orchestra/run-flow-coordinator.test.ts']);
  });
});
