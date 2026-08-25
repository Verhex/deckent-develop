// tests/core/routing/foundation-roundtrip.test.ts
//
// Sprint-445 Task 445-024 — end-to-end foundation proof on a tmpdir fixture
// project. Every prior routing3 Slice-0 task (445-003 vocabulary, 445-004/
// 445-005/445-006 RequirementVector producers, 445-009 v2->v3 migrator,
// 445-010 routing_v3 config) is unit-pinned in its own file; THIS file wires
// them together end to end: build the 3-layer vocabulary -> produce a full
// RequirementVector (positional+numerical+structural content) for 6
// representative task shapes (mirrors the system-debug 12-probe battery,
// .analysis/routing-v3-system-debug-2026-07-14.md §1, per DIRECTIVES Task 24:
// impl-generic, refactor-worded [pin], docs, CI workflow, i18n, tests-only)
// -> migrate a v2 fixture manifest against that SAME vocabulary -> validate
// every produced vector against its zod schema -> re-verify the two
// word-inference bans (spec §3: the token 'test'; an agent display-name in
// prose) at FULL-PIPELINE level (real merged vocabulary, the complete 3-axis
// vector), not just the per-axis unit level already covered by
// requirement-positional.test.ts / requirement-content-structural.test.ts.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStatus, type Task } from '../../../src/core/task-types.js';
import { loadVocabulary, type VocabularyRegistry } from '../../../src/core/routing/vocabulary.js';
import { BUILTIN_DOMAINS } from '../../../src/core/routing/vocabulary-builtin.js';
import {
  producePositional,
  produceNumerical,
  produceContentStructural,
  requirementVectorSchema,
  type RequirementVector,
  type RequirementVocabularySource,
} from '../../../src/core/routing/requirement-vector.js';
import { resolveRoutingV3Config, DEFAULT_ROUTING_V3_CONFIG } from '../../../src/core/routing/config.js';
import { migrateManifestV2toV3 } from '../../../src/core/manifest-migrator.js';
import { createAgentDefinition } from '../../../src/core/agent-types.js';
import { validateCapabilities, type CapabilityVector } from '../../../src/core/routing/capability-vector.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'foundation-task',
    title: 'Build a feature',
    description: 'Implement the described behavior in the codebase.',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'foundation-roundtrip fixture',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

/** Assemble the full 3-axis RequirementVector: positional -> numerical -> structural content. */
function produceFullVector(
  task: Task,
  vocabulary: RequirementVocabularySource,
  structuralConfidence: number,
): RequirementVector {
  const positional = producePositional(task, vocabulary);
  const numerical = produceNumerical(task, vocabulary);
  const content = produceContentStructural(task, positional, structuralConfidence);
  return { content, positional, numerical };
}

/** Look up a work-type entry's proficiency in a migrated capability vector. */
function workTypeProf(caps: CapabilityVector, type: string): string | undefined {
  return caps.content.workTypes.find((w) => w.type === type)?.proficiency;
}
/** Look up a domain entry's proficiency in a migrated capability vector. */
function domainProf(caps: CapabilityVector, id: string): string | undefined {
  return caps.positional.domains.find((d) => d.id === id)?.proficiency;
}

// ─── tmpdir sandbox — build the 3-layer vocabulary ONCE, reused by every
// stage below (CUSTOM Test Hermeticity: throwaway os.tmpdir(), removed in
// afterAll; loadVocabulary takes projectRoot/orgOverlayPath as explicit
// params so no HOME/env faking is needed). ─────────────────────────────────

const sandboxes: string[] = [];
let fixtureRegistry: VocabularyRegistry;
let vocabularySource: RequirementVocabularySource;
let structuralConfidence: number;

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'deckent-foundation-'));
  sandboxes.push(root);

  const overlayDir = join(root, 'org');
  mkdirSync(overlayDir, { recursive: true });
  const overlayPath = join(overlayDir, 'overlay.json');
  writeFileSync(
    overlayPath,
    JSON.stringify({
      domains: [
        {
          id: 'org-shared-widget',
          pathPatterns: ['src/widgets/**'],
          description: 'Org-shared widget domain overlay.',
        },
      ],
    }),
  );

  const projectVocabDir = join(root, '.deckent', 'routing');
  mkdirSync(projectVocabDir, { recursive: true });
  writeFileSync(
    join(projectVocabDir, 'vocabulary.json'),
    JSON.stringify({
      domains: [
        {
          id: 'project-local-feature',
          pathPatterns: ['src/local-feature/**'],
          description: 'Project-local feature domain.',
        },
      ],
    }),
  );

  fixtureRegistry = await loadVocabulary(root, { orgOverlayPath: overlayPath });
  vocabularySource = { domains: fixtureRegistry.domains };

  // Project-layer override, distinct from DEFAULT_ROUTING_V3_CONFIG.structuralConfidence
  // (0.7) — proves the content producer's calibratedConfidence is genuinely
  // config-sourced through the 445-010 resolver, not a hardcoded literal.
  structuralConfidence = resolveRoutingV3Config(null, {
    routing_v3: { structuralConfidence: 0.55 },
  }).structuralConfidence;
});

afterAll(() => {
  while (sandboxes.length > 0) {
    const dir = sandboxes.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Stage 1: 3-layer vocabulary build ─────────────────────────────────────

describe('foundation round-trip — 3-layer vocabulary build', () => {
  it('merges builtin + org-overlay + project layers into one registry', () => {
    expect(fixtureRegistry.mergeReport.layerCounts).toEqual({
      builtin: BUILTIN_DOMAINS.length,
      orgOverlay: 1,
      project: 1,
    });
    expect(fixtureRegistry.mergeReport.invalid).toEqual([]);
    expect(fixtureRegistry.domains.some((d) => d.id === 'org-shared-widget')).toBe(true);
    expect(fixtureRegistry.domains.some((d) => d.id === 'project-local-feature')).toBe(true);
    // A builtin id survives unshadowed alongside the two new layers.
    expect(fixtureRegistry.domains.some((d) => d.id === 'docs')).toBe(true);
  });

  it('resolves routing_v3.structuralConfidence from a project-layer override (445-010 config plumbing)', () => {
    expect(structuralConfidence).toBe(0.55);
    expect(structuralConfidence).not.toBe(DEFAULT_ROUTING_V3_CONFIG.structuralConfidence);
  });

  it('carries explorationBonus through default, global, and project layers', () => {
    const globalOnly = resolveRoutingV3Config(
      { routing_v3: { explorationBonus: 0.2 } },
      null,
    );
    const projectOverride = resolveRoutingV3Config(
      { routing_v3: { explorationBonus: 0.2 } },
      { routing_v3: { explorationBonus: 0.35 } },
    );

    expect(DEFAULT_ROUTING_V3_CONFIG.explorationBonus).toBe(0);
    expect(globalOnly.explorationBonus).toBe(0.2);
    expect(projectOverride.explorationBonus).toBe(0.35);
  });
});

// ─── Stage 2: 6 representative task shapes -> schema-valid RequirementVector
// (mirrors the system-debug 12-probe battery subset named in DIRECTIVES Task 24). ──

interface ShapeFixture {
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly directories: readonly string[];
  readonly filesWrite: readonly string[];
  readonly expectedDomainIds: readonly string[];
  readonly expectedDeliverables: readonly { type: string; ratio: number }[];
  readonly expectedWorkType: string;
}

const SHAPES: readonly ShapeFixture[] = [
  {
    label: 'impl-generic',
    title: 'Add a rate limiter to the connector',
    description: 'Implement token-bucket rate limiting for outbound connector calls.',
    directories: ['src/connectors/'],
    filesWrite: ['src/connectors/rate-limiter.ts'],
    expectedDomainIds: ['connectors/messaging'],
    expectedDeliverables: [{ type: 'code-src', ratio: 1 }],
    expectedWorkType: 'build',
  },
  {
    label: 'refactor-worded',
    title: 'Refactor the config loader into smaller functions',
    description: 'Refactor deepMerge and layer resolution into smaller, testable functions.',
    directories: ['src/core/'],
    filesWrite: ['src/core/config.ts'],
    expectedDomainIds: ['core/runtime'],
    expectedDeliverables: [{ type: 'code-src', ratio: 1 }],
    expectedWorkType: 'build',
  },
  {
    label: 'docs',
    title: 'Document the sync flags',
    description: 'Update the guide describing new sync CLI flags.',
    directories: ['docs/'],
    filesWrite: ['docs/guide.md'],
    expectedDomainIds: ['docs'],
    expectedDeliverables: [{ type: 'doc', ratio: 1 }],
    expectedWorkType: 'document',
  },
  {
    label: 'CI workflow',
    title: 'Add a CI workflow for lint gating',
    description: 'Add a GitHub Actions workflow that runs lint on every push.',
    directories: ['.github/workflows/'],
    filesWrite: ['.github/workflows/ci.yml'],
    expectedDomainIds: ['devops/ci'],
    expectedDeliverables: [{ type: 'workflow', ratio: 1 }],
    expectedWorkType: 'configure',
  },
  {
    label: 'i18n',
    title: 'Add missing Turkish messages',
    description: 'Add TR translations for the new CLI flags.',
    directories: ['src/cli/helpers/'],
    filesWrite: ['src/cli/helpers/messages.ts'],
    expectedDomainIds: ['cli/terminal', 'i18n'],
    expectedDeliverables: [{ type: 'code-src', ratio: 1 }],
    expectedWorkType: 'build',
  },
  {
    label: 'tests-only',
    title: 'Add regression tests for the widget renderer',
    description: 'Cover the widget renderer edge cases with regression tests.',
    directories: ['tests/widgets/'],
    filesWrite: ['tests/widgets/renderer.test.ts'],
    expectedDomainIds: ['test/quality'],
    expectedDeliverables: [{ type: 'code-test', ratio: 1 }],
    expectedWorkType: 'build',
  },
];

describe('foundation round-trip — 6 representative task shapes -> schema-valid RequirementVector', () => {
  it.each(SHAPES.map((s) => [s.label, s] as const))('%s', (_label, shape) => {
    const task = makeTask({
      title: shape.title,
      description: shape.description,
      scope: { directories: [...shape.directories], filesRead: [], filesWrite: [...shape.filesWrite] },
    });

    const vector = produceFullVector(task, vocabularySource, structuralConfidence);

    expect(vector.positional.domains.map((d) => d.id).sort()).toEqual([...shape.expectedDomainIds].sort());
    expect(vector.positional.deliverables).toEqual(shape.expectedDeliverables);
    expect(vector.content.workType).toBe(shape.expectedWorkType);
    expect(vector.content.provenance).toBe('structural');
    expect(vector.content.calibratedConfidence).toBe(structuralConfidence);

    // goCriteria: "all 6 shapes produce schema-valid vectors" — full RequirementVector round-trip.
    expect(requirementVectorSchema.parse(vector)).toEqual(vector);
  });
});

// ─── Refactor-worded PIN: the structural producer is immune to the word ────
// (beyond the table case above, which only proves the worded shape itself is
// schema-valid) — this directly compares worded vs. non-worded phrasing over
// the IDENTICAL scope, proving the word "Refactor" changes nothing.

describe('foundation round-trip — refactor-worded pin: structural producer immune to the word', () => {
  it('the word "Refactor" in title/description does not change the vector; workType stays "build", never "refactor"', () => {
    const scope: Task['scope'] = { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/config.ts'] };
    const base = makeTask({
      title: 'Split the config loader into smaller functions',
      description: 'Extract deepMerge and layer resolution helpers from config.ts.',
      scope,
    });
    const worded = makeTask({
      title: 'Refactor the config loader into smaller functions',
      description: 'Refactor deepMerge and layer resolution into smaller, testable functions.',
      scope,
    });

    const baseVector = produceFullVector(base, vocabularySource, structuralConfidence);
    const wordedVector = produceFullVector(worded, vocabularySource, structuralConfidence);

    expect(wordedVector).toEqual(baseVector);
    expect(wordedVector.content.workType).toBe('build');
    // There is no structural 'refactor' work-type signal by design (spec §2a) —
    // the word never leaks through, at any axis, in the full pipeline.
    expect(wordedVector.content.workType).not.toBe('refactor');
  });
});

// ─── Stage 3: v2 -> v3 manifest migration against the SAME loaded vocabulary ──

describe('foundation round-trip — v2 -> v3 manifest migration against the loaded vocabulary', () => {
  it('migrates a v2 fixture manifest into a schema-valid, provisional v3 capability vector', () => {
    const v2Manifest = createAgentDefinition({
      id: 'foundation-fixture-agent',
      name: 'Foundation Fixture Agent',
      manifestVersion: 2,
      deniedTools: [],
      preferredModel: 'sonnet',
      activation: {
        rules: [
          { when: { 'intent.primary': 'implementation' }, score: 10 },
          { when: { 'intent.primary': 'devops' }, score: 8 },
        ],
        exclude: [{ when: { 'intent.primary': 'security' } }],
        minScore: 5,
      },
    });

    const { capabilities, issues, provisional } = migrateManifestV2toV3(v2Manifest, vocabularySource.domains);

    expect(provisional).toBe(true);
    expect(workTypeProf(capabilities, 'build')).toBe('primary');
    expect(workTypeProf(capabilities, 'configure')).toBe('secondary');
    expect(domainProf(capabilities, 'devops/ci')).toBe('secondary');
    expect(domainProf(capabilities, 'security')).toBe('never');
    expect(capabilities.positional.writeAuthority).toBe(true);
    expect(capabilities.positional.role).toBe('implementer');
    // devops/ci and security are both builtin-vocabulary ids -> no spurious unknown-domain issue.
    expect(issues.some((i) => i.code === 'unknown-domain')).toBe(false);

    // goCriteria: "validate all against zod schemas" — CapabilityVector half.
    expect(validateCapabilities(capabilities).ok).toBe(true);
  });
});

// ─── Stage 4: word-inference bans — FULL PIPELINE re-verification ──────────
// (spec §3: the token 'test'; an agent display-name in prose). Already
// unit-pinned per axis with EMPTY_VOCAB/FIXTURE_VOCAB in
// requirement-positional.test.ts / requirement-content-structural.test.ts —
// here both pairs run through the REAL merged 3-layer vocabulary and the
// COMPLETE 3-axis vector is diffed in one `toEqual`, proving the ban holds
// end to end, not just at any single producer.

describe('foundation round-trip — word-inference bans hold through the FULL pipeline', () => {
  const scope: Task['scope'] = {
    directories: ['src/connectors/'],
    filesRead: [],
    filesWrite: ['src/connectors/rate-limiter.ts'],
  };

  it("the token 'test' anywhere in title/description does not alter positional, content, or numerical axes", () => {
    const base = makeTask({
      title: 'Add a rate limiter to the connector',
      description: 'Implement token-bucket rate limiting for outbound connector calls.',
      scope,
    });
    const withToken = makeTask({
      title: 'Add a rate limiter to the connector test',
      description:
        'Implement token-bucket rate limiting for outbound connector calls. Write a test for it and test the limiter.',
      scope,
    });

    const baseVector = produceFullVector(base, vocabularySource, structuralConfidence);
    const tokenVector = produceFullVector(withToken, vocabularySource, structuralConfidence);

    expect(tokenVector).toEqual(baseVector);
    // Guard: pure-ASCII English text on both sides means the one prose-reading
    // field (positional.language) cannot flip from adding an ASCII word.
    expect(baseVector.positional.language).toBe('en');
  });

  it('an agent display-name ("implementer"/"reviewer") in title/description does not alter positional, content, or numerical axes', () => {
    const base = makeTask({
      title: 'Add a rate limiter to the connector',
      description: 'Implement token-bucket rate limiting for outbound connector calls.',
      scope,
    });
    const withAgentName = makeTask({
      title: 'implementer: Add a rate limiter to the connector',
      description:
        'Implement token-bucket rate limiting for outbound connector calls. Assigned to implementer; reviewer will check it.',
      scope,
    });

    const baseVector = produceFullVector(base, vocabularySource, structuralConfidence);
    const nameVector = produceFullVector(withAgentName, vocabularySource, structuralConfidence);

    expect(nameVector).toEqual(baseVector);
    expect(baseVector.positional.language).toBe('en');
  });
});
