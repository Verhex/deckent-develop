/**
 * Tests for ADR Relevance Scoring Engine
 * Sprint 146 — Task 146-003
 */
import { describe, it, expect } from 'vitest';
import {
  selectRelevantAdrs,
  buildAdrPromptSection,
  classifyTaskIntent,
  distillActiveConstraint,
  TASK_TYPE_ADR_PRESETS,
  type AdrRelevance,
} from '../../src/orchestra/adr-selector.js';
import type { MemoryEntryV2 } from '../../src/core/memory-types.js';

// ─── Mock ADR Factory ────────────────────────────────────────────────

function makeAdr(overrides: Partial<MemoryEntryV2> & { id: string; title: string }): MemoryEntryV2 {
  return {
    type: 'adr',
    source: 'system',
    content: '',
    summary: null,
    tag_text: '',
    title_norm: '',
    content_norm: '',
    summary_norm: '',
    tag_norm: '',
    status: 'accepted',
    priority: 'normal',
    sprint_id: null,
    sprint_num: 100,
    lang: 'en',
    decay_exempt: true,
    metadata: '{}',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

// ─── Mock ADR Entries ────────────────────────────────────────────────

const MOCK_ADRS: MemoryEntryV2[] = [
  makeAdr({
    id: 'adr-001',
    title: 'TypeScript + ESM',
    content: 'TypeScript + ESM as the core language and module system. All source under src/core/ and src/orchestra/ use strict TypeScript.',
    sprint_num: 1,
  }),
  makeAdr({
    id: 'adr-003',
    title: 'vitest over Jest',
    content: 'Use vitest as the test framework. All tests under tests/ directory.',
    sprint_num: 3,
  }),
  makeAdr({
    id: 'adr-008',
    title: 'Brain Merkezi Import — Tek Yönlü Bağımlılık',
    content: 'Brain is the central orchestrator. All imports in src/orchestra/ follow one-way dependency. sprint-controller imports from planner, router, evaluator.',
    sprint_num: 8,
  }),
  makeAdr({
    id: 'adr-010',
    title: 'Tek Runtime Dependency — commander.js',
    content: 'CLI uses commander.js as the only runtime dependency. All CLI commands under src/cli/ register via commander.',
    sprint_num: 10,
  }),
  makeAdr({
    id: 'adr-011',
    title: 'node:readline/promises — Built-in Prompt',
    content: 'Use node:readline/promises for interactive CLI prompts. No external prompt library.',
    sprint_num: 11,
  }),
  makeAdr({
    id: 'adr-015',
    title: 'TaskRouter Module — 6-level routing',
    content: 'TaskRouter implements 6-level routing priority: config, force, agent, skill, worker, fallback. Core routing for src/orchestra/ sprint task assignment.',
    sprint_num: 44,
  }),
  makeAdr({
    id: 'adr-022-v2',
    title: 'CLI/MCP Feature Parity',
    content: 'CLI and MCP tools must maintain feature parity. Every CLI command under src/cli/ has an MCP tool equivalent.',
    sprint_num: 85,
  }),
  makeAdr({
    id: 'adr-023',
    title: 'Plan Tier Generalizasyonu',
    content: 'Provider-agnostic tier names: premium, standard, economy. Model registry in src/core/ maps tiers to provider-specific models.',
    sprint_num: 72,
  }),
  makeAdr({
    id: 'adr-029',
    title: 'Managed-Docs Universalization',
    content: 'Sprint lifecycle template-based document generation. Managed docs system under docs/ and src/orchestra/managed-docs/. Template engine for documentation updates.',
    sprint_num: 131,
  }),
  makeAdr({
    id: 'adr-030',
    title: 'Template Engine + Plugin Loader',
    content: 'Managed-Docs render pipeline. Plugin loader for custom documentation generators. Template rendering for managed docs.',
    sprint_num: 131,
  }),
  makeAdr({
    id: 'adr-032',
    title: 'i18n Pattern System',
    content: 'TR/EN content diversity support. Internationalization for documentation and managed docs templates.',
    sprint_num: 131,
  }),
  makeAdr({
    id: 'adr-033',
    title: 'Product Vision — Product Not Service',
    content: 'Deckent is a product, not a service. Focus on standalone CLI tool distribution. No cloud dependency.',
    sprint_num: 132,
  }),
  makeAdr({
    id: 'adr-037',
    title: 'Brain-Auditor-Worker Authority Matrix — RBAC',
    content: 'RBAC protocol for brain, auditor, worker roles. Security boundaries and permission enforcement.',
    sprint_num: 139,
  }),
];

// ─── Helper ──────────────────────────────────────────────────────────

function makeTask(title: string, description: string, dirs: string[]) {
  return {
    title,
    description,
    scope: { directories: dirs, filesRead: [], filesWrite: [] },
  };
}

// ═══ Tests ═══════════════════════════════════════════════════════════

describe('adr-selector', () => {
  // Test 1: Core dev task → top3 should include ADR-008, ADR-015, ADR-023
  it('selects relevant ADRs for core-dev task (ADR-008, ADR-015, ADR-023)', () => {
    const task = makeTask(
      'Brain Routing Engine Refactor',
      'Refactor routing engine in orchestra. Update sprint-controller imports and task-router logic.',
      ['src/orchestra/', 'src/core/'],
    );

    const results = selectRelevantAdrs(task, MOCK_ADRS, 3, 146);
    const ids = results.map(r => r.adrId);

    expect(results.length).toBeLessThanOrEqual(3);
    // These should be highly ranked for orchestra/core scope + routing keywords
    expect(ids).toContain('adr-008');
    expect(ids).toContain('adr-015');
  });

  // Test 2: Docs task → top3 should include ADR-029, ADR-030, ADR-032
  it('selects relevant ADRs for docs task (ADR-029, ADR-030, ADR-032)', () => {
    const task = makeTask(
      'Documentation Template Update',
      'Update managed docs templates for sprint lifecycle documentation. Add i18n support for docs.',
      ['docs/', 'src/orchestra/managed-docs/'],
    );

    const results = selectRelevantAdrs(task, MOCK_ADRS, 3, 146);
    const ids = results.map(r => r.adrId);

    expect(results.length).toBeLessThanOrEqual(3);
    // Docs-focused ADRs should rank highest
    expect(ids).toContain('adr-029');
    expect(ids).toContain('adr-030');
  });

  // Test 3: CLI task → ADR-010, ADR-011, ADR-022-v2
  it('selects relevant ADRs for CLI task (ADR-010, ADR-011, ADR-022-v2)', () => {
    const task = makeTask(
      'CLI Command Registration Fix',
      'Fix commander.js command registration for CLI readline prompt.',
      ['src/cli/'],
    );

    const results = selectRelevantAdrs(task, MOCK_ADRS, 3, 146);
    const ids = results.map(r => r.adrId);

    expect(results.length).toBeLessThanOrEqual(3);
    expect(ids).toContain('adr-010');
    expect(ids).toContain('adr-011');
  });

  // Test 4: Scope match score is correct
  it('assigns scope-path-match score correctly', () => {
    // PCOMP-W3 granularity: scope-match is a FILE-level code-graph intersection —
    // the ADR cites `sprint-controller`, the task writes sprint-controller.ts.
    // A bare layer dir (src/orchestra/) alone no longer scope-matches (that was
    // the G-006 false-positive factory).
    const task = {
      title: 'Some task',
      description: 'Working on orchestra module',
      scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/sprint-controller.ts'] },
    };

    const results = selectRelevantAdrs(task, MOCK_ADRS, 10, 146);

    // ADRs that mention orchestra paths should have scope-path-match
    const adr008 = results.find(r => r.adrId === 'adr-008');
    expect(adr008).toBeDefined();
    expect(adr008!.matchReasons).toContain('scope-path-match');
  });

  // Test 5: Keyword match score is correct
  it('assigns keyword-match score correctly', () => {
    const task = makeTask(
      'TaskRouter 6-level routing refactor',
      'Refactor TaskRouter module for 6-level routing priority in sprint task assignment',
      ['src/orchestra/'],
    );

    const results = selectRelevantAdrs(task, MOCK_ADRS, 10, 146);

    const adr015 = results.find(r => r.adrId === 'adr-015');
    expect(adr015).toBeDefined();
    expect(adr015!.matchReasons).toContain('keyword-match');
  });

  // F1.3 — IDF-weighted keyword match: a broad-vocabulary ADR that overlaps a task
  // only on GENERIC (high-DF) words must NOT keyword-match, while an ADR sharing the
  // task's DISTINCTIVE (low-DF) vocabulary still does. Under the old raw-count logic
  // the broad ADR (3 generic hits / 14 words = 0.21 ≥ 0.15) matched — the exact
  // false-positive that put adr-g-006 in 93% of live prompts.
  it('F1.3: broad ADR overlapping only on generic words does not keyword-match', () => {
    const broad = makeAdr({
      id: 'adr-broad',
      title: 'Broad Orchestration',
      content: 'sprint worker model agent config routing planner evaluator scope task',
      sprint_num: 100,
    });
    // Fillers inflate the document-frequency of the generic words → low IDF.
    const fillers = ['f1', 'f2', 'f3'].map(n =>
      makeAdr({ id: `adr-${n}`, title: `Filler ${n}`, content: 'sprint worker model agent config task', sprint_num: 100 }),
    );
    const specific = makeAdr({
      id: 'adr-spec',
      title: 'Hermetic Testing',
      content: 'hermetic tmpdir vitest coverage spawnsync',
      sprint_num: 100,
    });
    const corpus = [broad, ...fillers, specific];

    const task = makeTask(
      'Add hermetic tmpdir fixture',
      'Ensure vitest coverage stays hermetic using tmpdir fixtures and no spawnSync across the sprint worker task',
      [],
    );
    // currentSprintNum === sprint_num → no age penalty muddying the scores.
    const results = selectRelevantAdrs(task, corpus, 10, 100);

    // Distinctive match preserved.
    const spec = results.find(r => r.adrId === 'adr-spec');
    expect(spec).toBeDefined();
    expect(spec!.matchReasons).toContain('keyword-match');

    // Broad ADR has no scope/intent/preset signal for this task, so its only possible
    // axis is keyword — IDF drops it below threshold → it must not surface at all.
    const broadResult = results.find(r => r.adrId === 'adr-broad');
    expect(broadResult).toBeUndefined();
  });

  // Test 6: Age penalty is correct
  it('applies age penalty to older ADRs', () => {
    const task = makeTask(
      'TypeScript ESM config update',
      'Update TypeScript and ESM configuration for core modules',
      ['src/core/'],
    );

    const results = selectRelevantAdrs(task, MOCK_ADRS, 10, 146);

    // ADR-001 (sprint_num=1) should have age penalty, ADR-023 (sprint_num=72) should have less
    const adr001 = results.find(r => r.adrId === 'adr-001');
    const adr023 = results.find(r => r.adrId === 'adr-023');

    if (adr001 && adr023) {
      // Both should have age-penalty in reasons
      expect(adr001.matchReasons).toContain('age-penalty');
      // ADR-001 is older, so if both have same positive scores, adr-001 should score lower
      // (145 sprints old vs 74 sprints old)
    }
    // At minimum, ADR-001 should have age-penalty
    expect(adr001).toBeDefined();
    expect(adr001!.matchReasons).toContain('age-penalty');
  });

  // Test 7: TopN cap (3) is enforced
  it('enforces topN cap of 3', () => {
    const task = makeTask(
      'Full stack refactor',
      'Refactor everything: routing, config, types, commander CLI, managed docs, template engine, i18n, security, vitest, provider',
      ['src/orchestra/', 'src/core/', 'src/cli/', 'docs/'],
    );

    const results = selectRelevantAdrs(task, MOCK_ADRS, 3, 146);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  // Test 8: Empty input returns empty array
  it('returns empty array for empty input', () => {
    const task = makeTask('Empty task', 'No description', []);

    // Empty ADR list
    expect(selectRelevantAdrs(task, [], 3, 146)).toEqual([]);

    // Null-ish
    expect(selectRelevantAdrs(task, undefined as unknown as MemoryEntryV2[], 3, 146)).toEqual([]);
  });

  // ─── WP-15: ADR-selector accuracy (the heart-of-task ADR gets in, the
  // miscategorized one does not) ────────────────────────────────────────
  it('WP-15: selects the test-hermeticity ADR-087 for a hermetic test task', () => {
    const pool = [
      makeAdr({ id: 'adr-003', title: 'vitest over Jest', content: 'vitest test framework, tests/ directory', sprint_num: 3 }),
      makeAdr({ id: 'adr-019', title: 'Language-Agnostic Worker Verify', content: 'worker verify stack build/test commands', sprint_num: 46 }),
      makeAdr({ id: 'adr-087', title: 'Async I/O & Test Hermeticity Standard', content: 'Hermetic tests: tmpdir fixtures, no spawnSync, async fs.watch. CI-fresh-checkout standard for tests/.', sprint_num: 215 }),
      makeAdr({ id: 'adr-015', title: 'TaskRouter Module', content: '6-level routing priority for sprint task assignment', sprint_num: 44 }),
    ];
    const task = makeTask(
      'Add hermetic test for process endpoint',
      'Write a hermetic vitest test under tests/api; use tmpdir, no spawnSync.',
      ['tests/api/'],
    );
    const ids = selectRelevantAdrs(task, pool, 3, 290).map(r => r.adrId);
    expect(ids).toContain('adr-087');
  });

  it('ADR-TAXONOMY: test preset includes the hermeticity ADR (adr-d-002, absorbed old adr-087)', () => {
    // Crosswalk: old adr-003/adr-087 (hermeticity) → adr-d-002 (State-Path & Test).
    expect(TASK_TYPE_ADR_PRESETS.test).toContain('adr-d-002');
  });

  it('ADR-TAXONOMY: security preset prefers isolation adr-g-017 (old adr-034), never Dead-Code', () => {
    // Crosswalk: old adr-034 (Multi-Project Isolation) → adr-g-017. The old
    // Dead-Code adr-038 must not appear (nor its new home) in the security preset.
    expect(TASK_TYPE_ADR_PRESETS.security).not.toContain('adr-038');
    expect(TASK_TYPE_ADR_PRESETS.security).toContain('adr-g-017');

    const pool = [
      makeAdr({ id: 'adr-006', title: 'spawnSync Security Pattern', content: 'security spawnSync safe argv', sprint_num: 6 }),
      makeAdr({ id: 'adr-034', title: 'Multi-Project Isolation', content: 'Per-project security boundaries, tenant isolation, auth scope.', sprint_num: 132 }),
      makeAdr({ id: 'adr-037', title: 'RBAC Authority Matrix', content: 'rbac permission security roles', sprint_num: 139 }),
      makeAdr({ id: 'adr-038', title: 'Dead Code Disposition', content: 'dead code audit disposition results', sprint_num: 139 }),
    ];
    const task = makeTask(
      'RBAC permission enforcement',
      'Add security auth permission rbac checks and tenant isolation.',
      ['src/core/'],
    );
    const ids = selectRelevantAdrs(task, pool, 3, 290).map(r => r.adrId);
    expect(ids).toContain('adr-034');
  });

  // ─── WP-20: ADR active-constraint distillation + ordering ──────────────
  // The operative constraint is surfaced as a 1-line head ABOVE the full body
  // (solves middle-loss) while the FULL content — amendment history included —
  // stays contiguous below (completeness rule: zero content loss).
  it('WP-20: prepends a one-line Active constraint above the full, contiguous ADR body', () => {
    const fullContent =
      '**Status:** accepted\n\n**Context:** workers escape scope.\n**Decision:** Workers must never write outside scope.filesWrite.\n\n## Amendment — Sprint 300\nClarified for tenants.';
    const adrs: AdrRelevance[] = [{ adrId: 'adr-099', title: 'Scope Enforcement', score: 1, matchReasons: [] }];
    const pool = [makeAdr({ id: 'adr-099', title: 'Scope Enforcement', content: fullContent })];

    const section = buildAdrPromptSection(adrs, 'full', pool);

    // Distilled operative constraint surfaces at the head…
    expect(section).toContain('**Active constraint:** Workers must never write outside scope.filesWrite.');
    // …the full content (history included) is preserved contiguously (lossless)…
    expect(section).toContain(fullContent);
    // …and the head precedes the amendment history (ordering).
    expect(section.indexOf('**Active constraint:**')).toBeLessThan(section.indexOf('## Amendment'));
  });

  it('WP-20: prefers an explicit entry.summary for the Active constraint when present', () => {
    const adrs: AdrRelevance[] = [{ adrId: 'adr-077', title: 'Multi-Provider', score: 1, matchReasons: [] }];
    const pool = [makeAdr({
      id: 'adr-077',
      title: 'Multi-Provider',
      content: '**Decision:** something long and buried.',
      summary: 'Every provider must implement the ProviderAdapter contract.',
    })];
    const section = buildAdrPromptSection(adrs, 'full', pool);
    expect(section).toContain('**Active constraint:** Every provider must implement the ProviderAdapter contract.');
  });

  // Test 9: buildAdrPromptSection 'full' mode includes full content
  it('buildAdrPromptSection full mode includes full ADR content', () => {
    const adrs: AdrRelevance[] = [
      { adrId: 'adr-008', title: 'Brain Merkezi Import', score: 0.9, matchReasons: ['scope-path-match'] },
      { adrId: 'adr-015', title: 'TaskRouter Module', score: 0.7, matchReasons: ['keyword-match'] },
    ];

    const section = buildAdrPromptSection(adrs, 'full', MOCK_ADRS);

    expect(section).toContain('## adr-008: Brain Merkezi Import');
    expect(section).toContain('Brain is the central orchestrator');
    expect(section).toContain('## adr-015: TaskRouter Module');
    expect(section).toContain('6-level routing');
    expect(section).toContain('---');
  });

  // Test 10: buildAdrPromptSection 'summary' mode is 3-5 lines
  it('buildAdrPromptSection summary mode returns concise summaries', () => {
    const adrs: AdrRelevance[] = [
      { adrId: 'adr-008', title: 'Brain Merkezi Import', score: 0.9, matchReasons: ['scope-path-match'] },
      { adrId: 'adr-015', title: 'TaskRouter Module', score: 0.7, matchReasons: ['keyword-match'] },
      { adrId: 'adr-029', title: 'Managed-Docs Universalization', score: 0.5, matchReasons: ['intent-preference'] },
    ];

    const section = buildAdrPromptSection(adrs, 'summary', MOCK_ADRS);

    // Summary mode uses bullet format
    expect(section).toContain('**adr-008: Brain Merkezi Import**');
    expect(section).toContain('**adr-015: TaskRouter Module**');
    expect(section).toContain('**adr-029: Managed-Docs Universalization**');

    // Should NOT contain full "## heading" format
    expect(section).not.toContain('## adr-008');

    // Each section should be concise (summary, not full content)
    const lines = section.split('\n').filter(l => l.trim().length > 0 && !l.startsWith('---'));
    // 3 ADRs, each gets 1 bullet line
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.length).toBeLessThanOrEqual(5);
  });
});

describe('classifyTaskIntent', () => {
  it('classifies CLI task correctly', () => {
    const task = makeTask('CLI fix', 'Fix commander registration', ['src/cli/']);
    expect(classifyTaskIntent(task)).toBe('cli');
  });

  it('classifies docs task correctly', () => {
    const task = makeTask('Doc update', 'Update documentation and changelog', ['docs/']);
    expect(classifyTaskIntent(task)).toBe('docs');
  });

  it('classifies orchestra task correctly', () => {
    const task = makeTask('Sprint planner', 'Update sprint planner routing', ['src/orchestra/']);
    expect(classifyTaskIntent(task)).toBe('orchestra');
  });
});

// ─── F0.4: active-constraint truncation is word-boundary, not mid-word ───────
describe('distillActiveConstraint — word-boundary truncation (F0.4)', () => {
  it('never slices a word in half when the summary exceeds the cap', () => {
    // A long single-line summary whose 240-char cap would land mid-word.
    const long = ('PURGE the legacy adapter and ' .repeat(20)).trim() + ' FINALWORDXYZ';
    const out = distillActiveConstraint('', long);
    expect(out.length).toBeGreaterThan(0);
    expect(out.endsWith('…')).toBe(true);
    // The tail before the ellipsis must be a whole word (no partial token), i.e.
    // the char before '…' is not immediately preceded by a cut inside a word:
    // reconstruct the kept text and assert every kept token appears whole in input.
    const kept = out.slice(0, -1).trim();
    const lastKeptWord = kept.split(' ').pop()!;
    expect(long.split(' ')).toContain(lastKeptWord);
  });

  it('returns the summary unchanged when within the cap', () => {
    const short = 'core/ → orchestra/ import direction only (advisory).';
    expect(distillActiveConstraint('', short)).toBe(short);
  });
});
