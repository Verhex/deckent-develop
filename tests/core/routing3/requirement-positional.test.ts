// tests/core/routing3/requirement-positional.test.ts
//
// Sprint-445 Task 445-004 — RequirementVector schema + `producePositional`.
// Table-driven per goCriteria: tests-only / mixed-src+tests / docs / workflow
// deliverable cases, plus a negative pin proving agent display-names in
// title/description do not affect the (structural) positional output.

import { describe, it, expect } from 'vitest';
import { TaskStatus, type Task } from '../../../src/core/task-types.js';
import type { DomainDef } from '../../../src/core/routing3/types.js';
import { BUILTIN_DOMAINS } from '../../../src/core/routing3/vocabulary-builtin.js';
import {
  producePositional,
  requirementPositionalSchema,
  type RequirementVocabularySource,
} from '../../../src/core/routing3/requirement-vector.js';

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

// Isolated, non-overlapping fixture domains — avoids cross-domain noise from
// the generic builtin patterns (e.g. `**/core/**/*.ts`) when the point of a
// test case is to pin exact weight/evidence math.
const FIXTURE_DOMAINS: readonly DomainDef[] = [
  {
    id: 'fixture-src',
    aliases: [],
    pathPatterns: ['src/widgets/**'],
    stackMarkers: [],
    description: 'fixture source domain',
    surfaces: ['widgets-surface'],
    exclusiveRoles: [],
  },
  {
    id: 'fixture-tests',
    aliases: [],
    pathPatterns: ['tests/widgets/**'],
    stackMarkers: [],
    description: 'fixture tests domain',
    surfaces: ['test-surface'],
    exclusiveRoles: [],
  },
];
const FIXTURE_VOCAB: RequirementVocabularySource = { domains: FIXTURE_DOMAINS };
const BUILTIN_VOCAB: RequirementVocabularySource = { domains: BUILTIN_DOMAINS };

// ─── Table-driven deliverable/domain cases (goCriteria) ────────────────────

describe('producePositional — deliverable + domain table', () => {
  it('a task writing tests/ only → deliverables 100% code-test', () => {
    const task = makeTask({
      scope: {
        directories: ['tests/widgets/'],
        filesRead: [],
        filesWrite: ['tests/widgets/foo.test.ts', 'tests/widgets/bar.test.ts'],
      },
    });

    const result = producePositional(task, FIXTURE_VOCAB);

    expect(result.deliverables).toEqual([{ type: 'code-test', ratio: 1 }]);
    expect(result.domains).toEqual([{ id: 'fixture-tests', weight: 1, evidence: 'tests/widgets/**' }]);
    expect(result.surfaces).toEqual(['test-surface']);
    expect(result.needsWrite).toBe(true);
  });

  it('a mixed src+tests task → deliverables and domain weights split 50/50', () => {
    const task = makeTask({
      scope: {
        directories: ['src/widgets/', 'tests/widgets/'],
        filesRead: [],
        filesWrite: ['src/widgets/foo.ts', 'tests/widgets/foo.test.ts'],
      },
    });

    const result = producePositional(task, FIXTURE_VOCAB);

    expect(result.deliverables).toEqual([
      { type: 'code-src', ratio: 0.5 },
      { type: 'code-test', ratio: 0.5 },
    ]);
    expect(result.domains).toEqual(
      expect.arrayContaining([
        { id: 'fixture-src', weight: 0.5, evidence: 'src/widgets/**' },
        { id: 'fixture-tests', weight: 0.5, evidence: 'tests/widgets/**' },
      ]),
    );
    expect(result.domains).toHaveLength(2);
    expect(result.surfaces.sort()).toEqual(['test-surface', 'widgets-surface']);
    expect(result.needsWrite).toBe(true);
  });

  it('a docs task → deliverables 100% doc, single "docs" domain match', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/'],
        filesRead: [],
        filesWrite: ['docs/guide.md', 'docs/reference.md'],
      },
    });

    const result = producePositional(task, BUILTIN_VOCAB);

    expect(result.deliverables).toEqual([{ type: 'doc', ratio: 1 }]);
    expect(result.domains).toEqual([{ id: 'docs', weight: 1, evidence: 'docs/**' }]);
    expect(result.surfaces).toEqual([]);
    expect(result.needsWrite).toBe(true);
  });

  it('a .github/workflows task → deliverables 100% workflow, "devops/ci" domain match', () => {
    const task = makeTask({
      scope: {
        directories: ['.github/workflows/'],
        filesRead: [],
        filesWrite: ['.github/workflows/ci.yml', '.github/workflows/release.yml'],
      },
    });

    const result = producePositional(task, BUILTIN_VOCAB);

    expect(result.deliverables).toEqual([{ type: 'workflow', ratio: 1 }]);
    expect(result.domains).toEqual([{ id: 'devops/ci', weight: 1, evidence: '.github/workflows/**' }]);
    expect(result.surfaces).toEqual([]);
    expect(result.needsWrite).toBe(true);
  });
});

// ─── needsWrite / empty-scope edge cases ───────────────────────────────────

describe('producePositional — needsWrite + empty scope', () => {
  it('needsWrite is false and deliverables empty when filesWrite is empty', () => {
    const task = makeTask({
      scope: { directories: ['docs/'], filesRead: [], filesWrite: [] },
    });

    const result = producePositional(task, BUILTIN_VOCAB);

    expect(result.needsWrite).toBe(false);
    expect(result.deliverables).toEqual([]);
  });

  it('a directory-only match (no filesWrite yet) still surfaces the domain, at weight 0', () => {
    const task = makeTask({
      scope: { directories: ['docs/'], filesRead: [], filesWrite: [] },
    });

    const result = producePositional(task, BUILTIN_VOCAB);

    expect(result.domains).toEqual([{ id: 'docs', weight: 0, evidence: 'docs/**' }]);
  });

  it('fully empty scope yields empty domains/deliverables/surfaces and needsWrite=false', () => {
    const task = makeTask({ scope: { directories: [], filesRead: [], filesWrite: [] } });

    const result = producePositional(task, BUILTIN_VOCAB);

    expect(result.domains).toEqual([]);
    expect(result.deliverables).toEqual([]);
    expect(result.surfaces).toEqual([]);
    expect(result.needsWrite).toBe(false);
  });
});

// ─── Negative pin — agent display-names in title/description must NOT
// affect positional output (the K1-class failure V3 exists to kill). Only
// `language` reads title/description at all (by spec §2a design); every
// other field is scope-only and trivially invariant. Both fixtures below
// keep enough margin (EN: 0% TR-char ratio; TR: 50%+ ratio) that inserting
// one ASCII-only agent-name token cannot flip the detected language — an
// ASCII word can only hold or lower the TR ratio, never raise it. ─────────

describe('producePositional — negative pin: agent display-name in title/description', () => {
  const scope = {
    directories: ['src/widgets/', 'tests/widgets/'],
    filesRead: [],
    filesWrite: ['src/widgets/foo.ts', 'tests/widgets/foo.test.ts'],
  };

  it('an English task: adding "implementer" to title+description does not change positional output', () => {
    const base = makeTask({
      title: 'Build a retry mechanism for the connector',
      description:
        'Add exponential backoff retry logic to the messaging connector module for resiliency under transient failures.',
      scope,
    });
    const withAgentName = makeTask({
      title: 'implementer: Build a retry mechanism for the connector',
      description:
        'Add exponential backoff retry logic to the messaging connector module for resiliency under transient failures. Assigned to implementer.',
      scope,
    });

    const baseResult = producePositional(base, FIXTURE_VOCAB);
    const withNameResult = producePositional(withAgentName, FIXTURE_VOCAB);

    expect(withNameResult).toEqual(baseResult);
    expect(baseResult.language).toBe('en');
  });

  it('a Turkish task: adding "implementer" to title+description does not change positional output', () => {
    const base = makeTask({
      title: 'Bağlantı modülüne yeniden deneme mekanizması ekle',
      description:
        'Geçici hatalara karşı dayanıklılık için mesajlaşma bağlayıcısına üstel geri çekilme mantığı ekleyin.',
      scope,
    });
    const withAgentName = makeTask({
      title: 'implementer: Bağlantı modülüne yeniden deneme mekanizması ekle',
      description:
        'Geçici hatalara karşı dayanıklılık için mesajlaşma bağlayıcısına üstel geri çekilme mantığı ekleyin. Implementer will handle this.',
      scope,
    });

    const baseResult = producePositional(base, FIXTURE_VOCAB);
    const withNameResult = producePositional(withAgentName, FIXTURE_VOCAB);

    expect(withNameResult).toEqual(baseResult);
    expect(baseResult.language).toBe('tr');
  });
});

// ─── Schema round-trip + determinism ───────────────────────────────────────

describe('producePositional — schema conformance + determinism', () => {
  it('output round-trips through requirementPositionalSchema', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/'],
        filesRead: [],
        filesWrite: ['docs/guide.md'],
      },
    });

    const result = producePositional(task, BUILTIN_VOCAB);
    const parsed = requirementPositionalSchema.parse(result);

    expect(parsed).toEqual(result);
  });

  it('is a pure function of its arguments (same input → same output, called twice)', () => {
    const task = makeTask({
      scope: {
        directories: ['src/widgets/', 'tests/widgets/'],
        filesRead: [],
        filesWrite: ['src/widgets/foo.ts', 'tests/widgets/foo.test.ts'],
      },
    });

    expect(producePositional(task, FIXTURE_VOCAB)).toEqual(producePositional(task, FIXTURE_VOCAB));
  });
});
