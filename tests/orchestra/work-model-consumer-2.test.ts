/**
 * WM-2c: work-model canonical consumer tests for task-router + adr-selector.
 * Sprint 240-001 — regression-zero bridge verification.
 *
 * Coverage:
 * (a) task.type set → routing key / ADR intent derived from canonical SSOT
 * (b) task.type absent → legacy fallback unchanged
 * (c) regression equality: 3 task kinds where canonical == legacy
 */
import { describe, it, expect } from 'vitest';
import { routeTask, type TaskRouterConfig } from '../../src/orchestra/task-router.js';
import { selectRelevantAdrs } from '../../src/orchestra/adr-selector.js';
import { TaskStatus, type Task } from '../../src/core/types.js';
import type { MemoryEntryV2 } from '../../src/core/memory-types.js';
import type { ProviderName } from '../../src/core/task-types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '240-test',
    title: 'Test task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

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

const ALL_PROVIDERS: ProviderName[] = ['claude', 'codex', 'gemini'];

const SKILL_ROUTING_CONFIG: TaskRouterConfig = {
  skill_routing: {
    docs: 'codex',
    design: 'gemini',
  },
};

// ─── Minimal ADRs for adr-selector tests ────────────────────────────

const MOCK_ADRS: MemoryEntryV2[] = [
  makeAdr({
    id: 'adr-g-015',
    title: 'Managed-Docs Universalization',
    content: 'Sprint lifecycle template-based document generation. Managed docs system under docs/. Template engine for documentation updates.',
    sprint_num: 131,
  }),
  makeAdr({
    id: 'adr-g-015',
    title: 'Template Engine Plugin Loader',
    content: 'Managed-Docs render pipeline. Template rendering for managed docs documentation.',
    sprint_num: 131,
  }),
  makeAdr({
    id: 'adr-d-004',
    title: 'Brain Merkezi Import — Tek Yönlü Bağımlılık',
    content: 'Brain is the central orchestrator. All imports in src/orchestra/ and src/core/ follow one-way dependency.',
    sprint_num: 8,
  }),
  makeAdr({
    id: 'adr-g-006',
    title: 'TaskRouter Module — 6-level routing',
    content: 'TaskRouter implements 6-level routing priority in sprint task assignment for src/orchestra/.',
    sprint_num: 44,
  }),
  makeAdr({
    id: 'adr-g-002',
    title: 'spawnSync Security Pattern',
    content: 'Security pattern for spawnSync. OWASP vulnerability protection and auth boundary enforcement.',
    sprint_num: 6,
  }),
  makeAdr({
    id: 'adr-g-020',
    title: 'Brain-Auditor-Worker Authority Matrix RBAC',
    content: 'RBAC protocol for brain, auditor, worker roles. Security permission enforcement and authority matrix.',
    sprint_num: 139,
  }),
];

// ═══ Task-Router Canonical Bridge Tests ══════════════════════════════

describe('task-router WM-2c canonical bridge', () => {
  // (a) canonical: task.type = 'documentation' → routing key 'docs' → skill_routing.docs provider
  it('canonical: task.type=documentation uses docs routing key', () => {
    const task = makeTask({
      type: 'documentation',
      scope: { directories: [], filesRead: [], filesWrite: [] },
    });
    const result = routeTask(task, SKILL_ROUTING_CONFIG, ALL_PROVIDERS);
    expect(result.provider).toBe('codex');
  });

  // (a) canonical: task.type = 'design' → routing key 'design' → skill_routing.design provider
  it('canonical: task.type=design uses design routing key', () => {
    const task = makeTask({
      type: 'design',
      scope: { directories: [], filesRead: [], filesWrite: [] },
    });
    const result = routeTask(task, SKILL_ROUTING_CONFIG, ALL_PROVIDERS);
    expect(result.provider).toBe('gemini');
  });

  // (a) canonical: task.type = 'code-development' → null routing key → falls through to default
  it('canonical: task.type=code-development uses null routing key (falls to default)', () => {
    const task = makeTask({
      type: 'code-development',
      scope: { directories: [], filesRead: [], filesWrite: [] },
    });
    const result = routeTask(task, SKILL_ROUTING_CONFIG, ALL_PROVIDERS);
    // No specific routing key for code-development; falls through to first available
    expect(result.provider).toBe('claude');
  });

  // (b) legacy: no task.type, docs/ scope → detectTaskType returns 'doc' → routing key 'docs'
  it('legacy fallback: no task.type with docs/ scope uses docs routing key', () => {
    const task = makeTask({
      // no type field
      scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/guide.md'] },
    });
    const result = routeTask(task, SKILL_ROUTING_CONFIG, ALL_PROVIDERS);
    expect(result.provider).toBe('codex');
  });

  // (b) legacy: no task.type, ui/ scope → detectTaskType returns 'design' → routing key 'design'
  it('legacy fallback: no task.type with ui/ scope uses design routing key', () => {
    const task = makeTask({
      scope: { directories: ['ui/'], filesRead: [], filesWrite: [] },
    });
    const result = routeTask(task, SKILL_ROUTING_CONFIG, ALL_PROVIDERS);
    expect(result.provider).toBe('gemini');
  });

  // (c) regression equality: task.type=documentation == docs/ legacy scope → same provider
  it('regression eq (docs): canonical task.type=documentation equals legacy docs/ scope routing', () => {
    const canonicalTask = makeTask({
      type: 'documentation',
      scope: { directories: [], filesRead: [], filesWrite: [] },
    });
    const legacyTask = makeTask({
      scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/guide.md'] },
    });
    const canonicalResult = routeTask(canonicalTask, SKILL_ROUTING_CONFIG, ALL_PROVIDERS);
    const legacyResult = routeTask(legacyTask, SKILL_ROUTING_CONFIG, ALL_PROVIDERS);
    expect(canonicalResult.provider).toBe(legacyResult.provider);
  });

  // (c) regression equality: task.type=design == ui/ legacy scope → same provider
  it('regression eq (design): canonical task.type=design equals legacy ui/ scope routing', () => {
    const canonicalTask = makeTask({
      type: 'design',
      scope: { directories: [], filesRead: [], filesWrite: [] },
    });
    const legacyTask = makeTask({
      scope: { directories: ['ui/'], filesRead: [], filesWrite: [] },
    });
    const canonicalResult = routeTask(canonicalTask, SKILL_ROUTING_CONFIG, ALL_PROVIDERS);
    const legacyResult = routeTask(legacyTask, SKILL_ROUTING_CONFIG, ALL_PROVIDERS);
    expect(canonicalResult.provider).toBe(legacyResult.provider);
  });

  // (c) regression equality: task.type=code-development == src/ legacy scope → same provider
  it('regression eq (code): canonical task.type=code-development equals legacy src/ scope routing', () => {
    const canonicalTask = makeTask({
      type: 'code-development',
      scope: { directories: [], filesRead: [], filesWrite: [] },
    });
    const legacyTask = makeTask({
      scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/core/util.ts'] },
    });
    const canonicalResult = routeTask(canonicalTask, SKILL_ROUTING_CONFIG, ALL_PROVIDERS);
    const legacyResult = routeTask(legacyTask, SKILL_ROUTING_CONFIG, ALL_PROVIDERS);
    expect(canonicalResult.provider).toBe(legacyResult.provider);
  });
});

// ═══ ADR-Selector Canonical Bridge Tests ═════════════════════════════

describe('adr-selector WM-2c canonical bridge', () => {
  // (a) canonical: task.type=documentation → 'docs' domain → docs ADRs preferred
  it('canonical: task.type=documentation selects docs-domain ADRs', () => {
    const task = makeTask({
      type: 'documentation',
      title: '',
      description: '',
      scope: { directories: [], filesRead: [], filesWrite: [] },
    });
    const results = selectRelevantAdrs(task, MOCK_ADRS, 3, 240);
    const ids = results.map(r => r.adrId);
    // Docs presets: adr-029, adr-030, adr-032 — at least adr-029/030 should appear
    expect(ids.some(id => id === 'adr-g-015' || id === 'adr-g-015')).toBe(true);
  });

  // (a) canonical: task.type=code-development → 'core-dev' domain → core ADRs preferred
  it('canonical: task.type=code-development selects core-dev-domain ADRs', () => {
    const task = makeTask({
      type: 'code-development',
      title: '',
      description: '',
      scope: { directories: [], filesRead: [], filesWrite: [] },
    });
    const results = selectRelevantAdrs(task, MOCK_ADRS, 3, 240);
    const ids = results.map(r => r.adrId);
    // core-dev presets: adr-001, adr-002, adr-008, adr-015 — adr-008/015 are in MOCK_ADRS
    expect(ids.some(id => id === 'adr-d-004' || id === 'adr-g-006')).toBe(true);
  });

  // (a) canonical: task.type=security → 'security' domain → security ADRs preferred
  it('canonical: task.type=security selects security-domain ADRs', () => {
    const task = makeTask({
      type: 'security',
      title: '',
      description: '',
      scope: { directories: [], filesRead: [], filesWrite: [] },
    });
    const results = selectRelevantAdrs(task, MOCK_ADRS, 3, 240);
    const ids = results.map(r => r.adrId);
    // security presets: adr-006, adr-037, adr-038 — adr-006/037 are in MOCK_ADRS
    expect(ids.some(id => id === 'adr-g-002' || id === 'adr-g-020')).toBe(true);
  });

  // (b) legacy fallback: no task.type, docs/ scope → classifyTaskIntent used
  it('legacy fallback: no task.type with docs/ scope uses classifyTaskIntent', () => {
    const task = {
      title: 'Documentation update',
      description: 'Update documentation and managed docs templates',
      scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/guide.md'] },
    };
    const results = selectRelevantAdrs(task, MOCK_ADRS, 3, 240);
    const ids = results.map(r => r.adrId);
    // docs domain → adr-029/030 should appear
    expect(ids.some(id => id === 'adr-g-015' || id === 'adr-g-015')).toBe(true);
  });

  // (c) regression eq: canonical task.type=documentation should prefer same ADRs as legacy docs task
  it('regression eq (docs): canonical task.type=documentation selects same domain ADRs as legacy docs/ task', () => {
    const canonicalTask = makeTask({
      type: 'documentation',
      title: '',
      description: '',
      scope: { directories: [], filesRead: [], filesWrite: [] },
    });
    const legacyTask = {
      title: 'Documentation update',
      description: 'Update documentation templates',
      scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/guide.md'] },
    };
    const canonicalResults = selectRelevantAdrs(canonicalTask, MOCK_ADRS, 3, 240);
    const legacyResults = selectRelevantAdrs(legacyTask, MOCK_ADRS, 3, 240);
    // Both should select docs-domain ADRs
    const canonicalIds = canonicalResults.map(r => r.adrId);
    const legacyIds = legacyResults.map(r => r.adrId);
    expect(canonicalIds.some(id => id === 'adr-g-015' || id === 'adr-g-015')).toBe(true);
    expect(legacyIds.some(id => id === 'adr-g-015' || id === 'adr-g-015')).toBe(true);
  });

  // empty ADRs still returns empty
  it('returns empty array for empty ADR list regardless of task.type', () => {
    const task = makeTask({ type: 'documentation' });
    expect(selectRelevantAdrs(task, [], 3, 240)).toEqual([]);
  });
});
