/**
 * Tests for Task-Type ADR Preset Matrix + Filler Cleanup
 * Sprint 146 — Task 146-006
 *
 * Tests:
 * 1. core-dev preset ADRs appear in top results
 * 2. docs preset ADRs appear in top results
 * 3. Preset + relevance combined score correctness
 * 4. Skill block empty → no header emitted (filler cleanup)
 * 5. Skill block with skills → header present
 * 6. Dependencies section absent when deps = []
 */
import { describe, it, expect } from 'vitest';
import {
  selectRelevantAdrs,
  TASK_TYPE_ADR_PRESETS,
  type AdrRelevance,
} from '../../src/orchestra/adr-selector.js';
import { buildTaskPrompt } from '../../src/orchestra/prompt-god-template.js';
import type { MemoryEntryV2 } from '../../src/core/memory-types.js';
import type { Task } from '../../src/core/task-types.js';

// ─── Mock ADR Factory ────────────────────────────────────────────────

function makeAdr(overrides: Partial<MemoryEntryV2> & { id: string; title: string }): MemoryEntryV2 {
  return {
    type: 'adr',
    source: 'system',
    content: overrides.content ?? `Content for ${overrides.id}`,
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

// Minimal ADR set covering core-dev + docs presets
const CORE_DEV_ADRS: MemoryEntryV2[] = [
  makeAdr({ id: 'adr-d-001', title: 'TypeScript + ESM', content: 'TypeScript as the core language for src/core/ modules.', sprint_num: 1 }),
  makeAdr({ id: 'adr-d-001', title: 'Node16 Module Resolution', content: 'Node16 module resolution for TypeScript ESM.', sprint_num: 2 }),
  makeAdr({ id: 'adr-d-004', title: 'Brain Merkezi Import', content: 'Brain is the central orchestrator. One-way dependency in src/orchestra/.', sprint_num: 8 }),
  makeAdr({ id: 'adr-g-006', title: 'TaskRouter Module', content: 'TaskRouter 6-level routing for src/orchestra/ task assignment.', sprint_num: 44 }),
  makeAdr({ id: 'adr-033', title: 'Product Vision', content: 'Product not service. CLI distribution.', sprint_num: 132 }),
  makeAdr({ id: 'adr-g-020', title: 'RBAC Protocol', content: 'Security boundaries for brain, auditor, worker roles.', sprint_num: 139 }),
];

const DOCS_ADRS: MemoryEntryV2[] = [
  makeAdr({ id: 'adr-g-015', title: 'Managed-Docs Universalization', content: 'Sprint lifecycle template-based document generation for docs/.', sprint_num: 131 }),
  makeAdr({ id: 'adr-g-015', title: 'Template Engine + Plugin Loader', content: 'Managed-Docs render pipeline for documentation templates.', sprint_num: 131 }),
  makeAdr({ id: 'adr-032', title: 'i18n Pattern System', content: 'TR/EN content diversity support for documentation templates.', sprint_num: 131 }),
  makeAdr({ id: 'adr-d-001', title: 'TypeScript + ESM', content: 'TypeScript for src/core/.', sprint_num: 1 }),
  makeAdr({ id: 'adr-d-004', title: 'Brain Merkezi Import', content: 'Brain orchestrator in src/orchestra/.', sprint_num: 8 }),
];

function makeTask(
  title: string,
  description: string,
  dirs: string[],
  filesWrite: string[] = [],
): Pick<Task, 'scope' | 'title' | 'description'> {
  return {
    title,
    description,
    scope: { directories: dirs, filesRead: [], filesWrite },
  };
}

function makeFullTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-001',
    title: 'Test Task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'testing',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: 'PENDING',
    sprintId: 'sprint-146',
    createdAt: '2026-04-20T00:00:00.000Z',
    assignedAgent: 'test-writer',
    assignedSkills: [],
    provider: 'claude',
    ...overrides,
  };
}

// ═══ Tests ═══════════════════════════════════════════════════════════

describe('TASK_TYPE_ADR_PRESETS', () => {
  it('exports preset matrix with expected task types', () => {
    expect(TASK_TYPE_ADR_PRESETS).toBeDefined();
    expect(TASK_TYPE_ADR_PRESETS['core-dev']).toContain('adr-d-001');
    expect(TASK_TYPE_ADR_PRESETS['core-dev']).toContain('adr-d-004');
    expect(TASK_TYPE_ADR_PRESETS['docs']).toContain('adr-g-015');
    expect(TASK_TYPE_ADR_PRESETS['test']).toContain('adr-d-002');
    expect(TASK_TYPE_ADR_PRESETS['security']).toContain('adr-g-020');
    expect(TASK_TYPE_ADR_PRESETS['observability']).toContain('adr-g-018');
  });
});

describe('adr-preset: selectRelevantAdrs with preset bonus', () => {
  // Test 1: core-dev task → preset ADRs (adr-001, adr-002, adr-008, adr-015) in top results
  it('core-dev preset ADRs appear in top-4 results', () => {
    const task = makeTask(
      'Config and Types Refactor',
      'Refactor core config types and model registry',
      ['src/core/'],
    );

    const results = selectRelevantAdrs(task, CORE_DEV_ADRS, 4, 146);
    const ids = results.map(r => r.adrId);

    // Preset ADRs for core-dev: adr-001, adr-002, adr-008, adr-015
    // All 4 are in CORE_DEV_ADRS, preset bonus ensures they rank
    expect(results.length).toBeGreaterThan(0);
    // At least 2 of the core-dev presets should appear
    const presetIds = TASK_TYPE_ADR_PRESETS['core-dev']!;
    const found = ids.filter(id => presetIds.includes(id));
    expect(found.length).toBeGreaterThanOrEqual(2);
  });

  // Test 2: docs task → preset ADRs (adr-029, adr-030, adr-032) in top results
  it('docs preset ADRs appear in top-3 results', () => {
    const task = makeTask(
      'Documentation Template Update',
      'Update managed docs templates for sprint lifecycle documentation',
      ['docs/'],
    );

    const results = selectRelevantAdrs(task, DOCS_ADRS, 3, 146);
    const ids = results.map(r => r.adrId);

    // All 3 docs preset ADRs are in DOCS_ADRS
    const docsPresets = TASK_TYPE_ADR_PRESETS['docs']!;
    const found = ids.filter(id => docsPresets.includes(id));
    expect(found.length).toBeGreaterThanOrEqual(2);
    // adr-029 and adr-030 should definitely be in results
    expect(ids).toContain('adr-g-015');
  });

  // Test 3: Preset + relevance combined score
  it('preset bonus adds +0.3 to combined score', () => {
    // ADR-008 is in core-dev preset AND is scope-relevant for src/core/
    const task = makeTask(
      'Core module update',
      'Update core module',
      ['src/core/'],
    );

    const results = selectRelevantAdrs(task, CORE_DEV_ADRS, 10, 146);
    const adr008 = results.find(r => r.adrId === 'adr-d-004');

    expect(adr008).toBeDefined();
    // Should have preset-match in reasons (preset bonus applied)
    expect(adr008!.matchReasons).toContain('preset-match');
    // Score should be >= 0.3 (at minimum the preset bonus alone)
    expect(adr008!.score).toBeGreaterThanOrEqual(0.3);
  });
});

describe('adr-preset: filler header cleanup in buildTaskPrompt', () => {
  // Test 4: No skills → skill section absent (no "=== Skills ===" header)
  it('skill block absent when no skills provided', () => {
    const task = makeFullTask();
    const artifact = buildTaskPrompt(task, {
      agentId: undefined,
      agentPrompt: undefined,
      skillPrompts: [], // empty skills
      allAdrs: [],
      dependencies: [],
    });

    // Should NOT contain the skills header since no skills provided
    expect(artifact.prompt).not.toContain('=== Skills ===');
  });

  // Test 5: With skills → skill section present
  it('skill block present when skills provided', () => {
    const task = makeFullTask();
    const artifact = buildTaskPrompt(task, {
      agentId: 'test-writer',
      agentPrompt: undefined,
      skillPrompts: [
        { name: 'typescript-expert', content: '# TypeScript Expert\nStrict mode always.' },
      ],
      allAdrs: [],
      dependencies: [],
    });

    // Skills header should appear
    expect(artifact.prompt).toContain('=== Skills ===');
    expect(artifact.prompt).toContain('typescript-expert');
  });

  // Test 6: Dependencies absent when deps = []
  it('dependencies section absent when task has no dependencies', () => {
    const task = makeFullTask({ dependencies: [] });
    const artifact = buildTaskPrompt(task, {
      agentId: undefined,
      agentPrompt: undefined,
      skillPrompts: [],
      allAdrs: [],
      dependencies: [], // explicitly empty
    });

    // Dependencies section should NOT appear
    expect(artifact.prompt).not.toContain('## Dependencies');
    expect(artifact.prompt).not.toContain('This task depends on:');
  });
});
