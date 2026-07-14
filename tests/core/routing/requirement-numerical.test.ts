// tests/core/routing/requirement-numerical.test.ts
//
// Sprint-445 Task 445-005 — RequirementVector `produceNumerical`.
// Table-driven per goCriteria: size-tier thresholds (mirroring
// analyzeComplexity()'s 5-tier table, intent-classifier.ts), riskClass's
// vocabulary-driven (not hardcoded) derivation, effortClass passthrough,
// fileCount/moduleCount correctness, purity, and schema round-trip.

import { describe, it, expect } from 'vitest';
import { TaskStatus, type Task, type TaskEffort } from '../../../src/core/task-types.js';
import type { DomainDef } from '../../../src/core/routing/types.js';
import { BUILTIN_DOMAINS } from '../../../src/core/routing/vocabulary-builtin.js';
import {
  produceNumerical,
  requirementNumericalSchema,
  type RequirementVocabularySource,
} from '../../../src/core/routing/requirement-vector.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-task',
    title: 'Build a feature',
    description: 'Implement the described behavior in the codebase.',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test fixture',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

const BUILTIN_VOCAB: RequirementVocabularySource = { domains: BUILTIN_DOMAINS };

/** Build a scope with an exact fileCount (non-risky src files) and moduleCount. */
function buildScope(fileCount: number, moduleCount: number): Task['scope'] {
  const directories = Array.from({ length: moduleCount }, (_, i) => `src/mod${i}/`);
  const filesWrite = Array.from({ length: fileCount }, (_, i) => `src/mod0/file${i}.ts`);
  return { directories, filesRead: [], filesWrite };
}

// ─── Size-tier thresholds (table-driven, mirrors analyzeComplexity()) ──────

describe('produceNumerical — estimatedSize threshold table', () => {
  const cases: Array<[number, number, string]> = [
    [0, 0, 'trivial'],
    [1, 1, 'trivial'],
    [2, 1, 'small'],
    [2, 0, 'small'],
    [3, 2, 'medium'],
    [5, 2, 'medium'],
    [3, 4, 'large'], // fileCount<=5 but moduleCount>2 fails medium; fileCount<=10 → large
    [10, 3, 'large'],
    [12, 0, 'large'], // moduleCount<=3 keeps it large even though fileCount>10 (OR-logic)
    [11, 4, 'epic'], // fileCount>10 AND moduleCount>3 → only true epic case
  ];

  it.each(cases)('fileCount=%i moduleCount=%i → estimatedSize=%s', (fileCount, moduleCount, expected) => {
    const task = makeTask({ scope: buildScope(fileCount, moduleCount) });
    const result = produceNumerical(task, BUILTIN_VOCAB);

    expect(result.fileCount).toBe(fileCount);
    expect(result.moduleCount).toBe(moduleCount);
    expect(result.estimatedSize).toBe(expected);
  });
});

// ─── fileCount / moduleCount correctness ───────────────────────────────────

describe('produceNumerical — fileCount/moduleCount derivation', () => {
  it('moduleCount dedupes the top-level module across src/tests/lib prefixes', () => {
    const task = makeTask({
      scope: {
        directories: ['src/widgets/', 'tests/widgets/', 'lib/other/'],
        filesRead: [],
        filesWrite: ['src/widgets/foo.ts', 'tests/widgets/foo.test.ts'],
      },
    });

    const result = produceNumerical(task, BUILTIN_VOCAB);

    expect(result.fileCount).toBe(2);
    expect(result.moduleCount).toBe(2); // {widgets, other}
  });

  it('fileCount/moduleCount are 0 for a fully empty scope', () => {
    const task = makeTask({ scope: { directories: [], filesRead: [], filesWrite: [] } });
    const result = produceNumerical(task, BUILTIN_VOCAB);

    expect(result.fileCount).toBe(0);
    expect(result.moduleCount).toBe(0);
    expect(result.estimatedSize).toBe('trivial');
  });
});

// ─── effortClass passthrough ────────────────────────────────────────────────

describe('produceNumerical — effortClass', () => {
  it.each<TaskEffort>(['low', 'normal', 'high'])('passes through task.effort=%s', (effort) => {
    const task = makeTask({ effort });
    const result = produceNumerical(task, BUILTIN_VOCAB);
    expect(result.effortClass).toBe(effort);
  });

  it('defaults to "normal" when task.effort is absent at runtime', () => {
    const task = makeTask();
    const withoutEffort = { ...task, effort: undefined } as unknown as Task;
    const result = produceNumerical(withoutEffort, BUILTIN_VOCAB);
    expect(result.effortClass).toBe('normal');
  });
});

// ─── riskClass — deliverable-driven (config/migration) ─────────────────────

describe('produceNumerical — riskClass config/migration deliverable', () => {
  it('a config-deliverable write (e.g. a .yaml file) yields riskClass "high"', () => {
    const task = makeTask({
      scope: { directories: ['src/mod0/'], filesRead: [], filesWrite: ['src/mod0/settings.yaml'] },
    });
    const result = produceNumerical(task, BUILTIN_VOCAB);
    expect(result.riskClass).toBe('high');
  });

  it('a migration-deliverable write (e.g. a .sql file) yields riskClass "high"', () => {
    const task = makeTask({
      scope: { directories: ['migrations/'], filesRead: [], filesWrite: ['migrations/001-init.sql'] },
    });
    const result = produceNumerical(task, BUILTIN_VOCAB);
    expect(result.riskClass).toBe('high');
  });

  it('a plain code-src write at trivial size yields riskClass "low" (no risky deliverable)', () => {
    const task = makeTask({
      scope: { directories: ['src/mod0/'], filesRead: [], filesWrite: ['src/mod0/file0.ts'] },
    });
    const result = produceNumerical(task, BUILTIN_VOCAB);
    expect(result.estimatedSize).toBe('trivial');
    expect(result.riskClass).toBe('low');
  });
});

// ─── riskClass — vocabulary-driven pin (security domain, NOT string literal) ─

describe('produceNumerical — riskClass vocabulary-driven pin (security domain)', () => {
  // Path deliberately contains no literal "security" substring — a hardcoded
  // `path.includes('security')` check would NOT flag it. Only a genuine
  // glob-pattern match against the fixture vocabulary's 'security' domain
  // pathPatterns can produce riskClass 'high' here.
  const riskyScope: Task['scope'] = {
    directories: ['src/secretsauce/'],
    filesRead: [],
    filesWrite: ['src/secretsauce/vault.ts'],
  };

  function fixtureVocab(securityPathPatterns: readonly string[]): RequirementVocabularySource {
    const securityDomain: DomainDef = {
      id: 'security',
      aliases: [],
      pathPatterns: securityPathPatterns,
      stackMarkers: [],
      description: 'fixture security domain',
      surfaces: [],
      exclusiveRoles: [],
    };
    return { domains: [securityDomain] };
  }

  it('matching security pathPattern → riskClass "high"', () => {
    const task = makeTask({ scope: riskyScope });
    const result = produceNumerical(task, fixtureVocab(['src/secretsauce/**']));
    expect(result.riskClass).toBe('high');
  });

  it('renaming the security pathPattern so it no longer matches → riskClass drops out of "high"', () => {
    const task = makeTask({ scope: riskyScope });
    const result = produceNumerical(task, fixtureVocab(['src/somewhere-else/**']));
    expect(result.riskClass).not.toBe('high');
    expect(result.estimatedSize).toBe('trivial');
    expect(result.riskClass).toBe('low');
  });
});

// ─── riskClass — 'low'|'medium' by size fallback ───────────────────────────

describe('produceNumerical — riskClass by-size fallback (no risky write)', () => {
  it('trivial/small size with no risky write → riskClass "low"', () => {
    const task = makeTask({ scope: buildScope(2, 1) });
    const result = produceNumerical(task, BUILTIN_VOCAB);
    expect(result.estimatedSize).toBe('small');
    expect(result.riskClass).toBe('low');
  });

  it('medium+ size with no risky write → riskClass "medium"', () => {
    const task = makeTask({ scope: buildScope(5, 2) });
    const result = produceNumerical(task, BUILTIN_VOCAB);
    expect(result.estimatedSize).toBe('medium');
    expect(result.riskClass).toBe('medium');
  });
});

// ─── produceNumerical(task) — vocabulary defaults to the builtin base ──────

describe('produceNumerical — default vocabulary parameter', () => {
  it('can be called with just `task` (vocabulary defaults to BUILTIN_DOMAINS)', () => {
    const task = makeTask({
      scope: { directories: ['src/security/'], filesRead: [], filesWrite: ['src/security/auth.ts'] },
    });
    const result = produceNumerical(task);
    expect(result.riskClass).toBe('high');
  });
});

// ─── Purity + schema round-trip ─────────────────────────────────────────────

describe('produceNumerical — purity + schema conformance', () => {
  it('is a pure function of its arguments (same input → same output, called twice)', () => {
    const task = makeTask({ scope: buildScope(3, 2) });
    expect(produceNumerical(task, BUILTIN_VOCAB)).toEqual(produceNumerical(task, BUILTIN_VOCAB));
  });

  it('output round-trips through requirementNumericalSchema', () => {
    const task = makeTask({ scope: buildScope(3, 2) });
    const result = produceNumerical(task, BUILTIN_VOCAB);
    const parsed = requirementNumericalSchema.parse(result);
    expect(parsed).toEqual(result);
  });
});
