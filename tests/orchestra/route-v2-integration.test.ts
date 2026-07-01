// ─── Route-V2 Integration Coverage (Sprint 351-011, ROUTE-V2-INTEGRATION-COVERAGE) ──
//
// V2 equivalents for the four scenarios the deleted V1-only integration suites used
// to cover through DecisionOrchestrator (removed in 51be370f ROUTE-V1-PURGE):
// full-sprint-e2e.test.ts, error-recovery.test.ts, project-types/monorepo.test.ts.
// All routing here goes through the real routeTaskV2 (src/core/routing-engine.ts)
// against hand-built, hermetic fixture pools — no live AgentPoolManager, no
// .brain/memory.db read.
//
// (a) mixed-task mini-set diversity (single-agent share <= 60%)
// (b) monorepo-type multi-directory task routing
// (c) force-* overrides preserved
// (d) role-mismatch penalty's live effect (reviewer not selected on an implement-task,
//     using real agent-pool role/domain fallback data)

import { describe, it, expect } from 'vitest';
import { routeTaskV2, getRoleMismatchPenalty } from '../../src/core/routing-engine.js';
import { getAgentRole, getAgentDomain, BUILTIN_AGENT_ROLES } from '../../src/core/agent-pool.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import type { TaskScope } from '../../src/core/task-types.js';
import type { ActivationConfig } from '../../src/core/routing-types.js';
import type { TaskKind } from '../../src/core/work-model.js';

// ─── Shared Fixture Helpers ──────────────────────────────────────────────────

function makeAgent(
  id: string,
  activation: ActivationConfig,
  overrides: Partial<AgentDefinition> = {},
): AgentDefinition {
  return createAgentDefinition({
    id,
    name: id,
    description: `${id} fixture agent`,
    manifestVersion: 2,
    activation,
    source: 'builtin',
    ...overrides,
  });
}

function makeTask(overrides: {
  title: string;
  description: string;
  scope: TaskScope;
  type?: TaskKind;
}): { title: string; description: string; scope: TaskScope; type?: TaskKind } {
  return { ...overrides };
}

const TS_SKILL: SkillDefinition = createSkillDefinition({
  id: 'typescript-expert',
  name: 'TypeScript Expert',
  category: 'language',
  triggers: ['typescript', 'type', 'ts', 'interface'],
  stackDetection: { files: ['tsconfig.json'], dependencies: ['typescript'], commands: ['tsc'] },
  priority: 10,
  activation: {
    rules: [{ name: 'ts-impl', when: { 'intent.primary': 'implementation' }, score: 8 }],
    exclude: [],
    minScore: 3,
  },
});

const TESTING_SKILL: SkillDefinition = createSkillDefinition({
  id: 'testing-expert',
  name: 'Testing Expert',
  category: 'tool',
  triggers: ['test', 'spec', 'coverage'],
  stackDetection: { files: [], dependencies: ['vitest'], commands: [] },
  priority: 5,
  activation: {
    rules: [
      { name: 'test-tag', when: { 'tags': { '$contains': 'test-coverage' } }, score: 6 },
      // Weaker general-purpose signal so testing-expert still clears skillMinScore on a
      // plain implementation task (used as the "next candidate" in the excludeSkills test
      // below — without this it would score 0 and the ROUTE-1 B4 empty-skill floor would
      // resurrect typescript-expert via the intent-default principled fallback, which reads
      // pool membership directly and is NOT excludeSkills-aware).
      { name: 'general-impl-lowscore', when: { 'intent.primary': 'implementation' }, score: 4 },
    ],
    exclude: [],
    minScore: 3,
  },
});

// ─── (a) Mixed-task mini-set diversity ──────────────────────────────────────
//
// Task fixtures below reuse the exact title/description/scope combinations from
// tests/core/routing-diversity-guard.test.ts (already proven, against the LIVE
// agent pool, to classify into the expected intent/domain bucket) — but routed here
// through a small, hand-built, single-purpose fixture pool per goCriteria's
// "fixture pool, no real DB" requirement.

function buildMiniDiversityPool(): AgentPool {
  const pool: AgentPool = new Map();

  pool.set('doc-writer', makeAgent('doc-writer', {
    rules: [{ name: 'intent-documentation', when: { 'intent.primary': 'documentation' }, score: 10 }],
    exclude: [],
    minScore: 5,
  }));

  pool.set('security-auditor', makeAgent('security-auditor', {
    rules: [{ name: 'intent-security', when: { 'intent.primary': 'security' }, score: 10 }],
    exclude: [],
    minScore: 5,
  }));

  pool.set('api-builder', makeAgent('api-builder', {
    rules: [{ name: 'domain-api', when: { 'domains': { '$contains': 'api' } }, score: 8 }],
    exclude: [],
    minScore: 5,
  }));

  pool.set('frontend-designer', makeAgent('frontend-designer', {
    rules: [{ name: 'intent-design', when: { 'intent.primary': 'design' }, score: 10 }],
    exclude: [],
    minScore: 5,
  }));

  pool.set('refactorer', makeAgent('refactorer', {
    rules: [{ name: 'intent-implementation', when: { 'intent.primary': 'implementation' }, score: 8 }],
    exclude: [],
    minScore: 5,
  }));

  return pool;
}

const MINI_SPRINT_TASKS = [
  makeTask({
    title: 'Update README documentation',
    description: 'Documentation update for changelog and readme guide',
    scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/guide.md'] },
  }),
  makeTask({
    title: 'Write ADR-100 architecture document',
    description: 'Write the ADR-100 architecture decision record documenting the new module structure decision.',
    scope: { directories: ['docs/adr/'], filesRead: [], filesWrite: ['docs/adr/100-new-module.md'] },
  }),
  makeTask({
    title: 'Harden JWT authentication helper',
    description: 'Harden authentication helper with stricter JWT signature checks and replay-attack mitigation.',
    scope: { directories: ['src/auth/'], filesRead: [], filesWrite: ['src/auth/jwt-helper.ts'] },
  }),
  makeTask({
    title: 'RBAC audit for API endpoints',
    description: 'Audit authentication and authorization checks across API endpoints for OWASP top-10 vulnerabilities.',
    scope: { directories: ['src/auth/', 'src/api/'], filesRead: [], filesWrite: ['src/auth/rbac-audit.ts'] },
  }),
  makeTask({
    title: 'Add /sprints REST endpoint',
    description: 'Add a new REST endpoint module to expose sprint status. Wire the route into the existing server.',
    scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/sprints-endpoint.ts'] },
  }),
  makeTask({
    title: 'SprintPanel dashboard component',
    description: 'Build a responsive React component for the dashboard. Tailwind-styled layout with sprint status panel.',
    scope: { directories: ['src/dashboard/'], filesRead: [], filesWrite: ['src/dashboard/SprintPanel.tsx'] },
  }),
  makeTask({
    title: 'Wire adaptive-agent to outcome-tracker',
    description: 'Wire adaptAgentRuntime call into outcome-tracker so agent success rates drive skill recommendations.',
    scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/outcome-tracker.ts'] },
  }),
  makeTask({
    title: 'Wire prompt-evolution into sprint reporter',
    description: 'Call wirePromptEvolutionFromOutcomes inside sprint-reporter retro phase to produce prompt improvement suggestions.',
    scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/sprint-reporter.ts'] },
  }),
];

describe('(a) mixed-task mini-set diversity', () => {
  const pool = buildMiniDiversityPool();

  it('8-task mini-set produces >=3 distinct agent selections', () => {
    const agents = MINI_SPRINT_TASKS.map(t => routeTaskV2(t, pool, new Map()).agentId);
    const distinct = new Set(agents);
    expect(
      distinct.size,
      `only ${distinct.size} distinct agents: ${JSON.stringify([...distinct])}`,
    ).toBeGreaterThanOrEqual(3);
  });

  it('no single agent wins more than 60% of the mini-set', () => {
    const agents = MINI_SPRINT_TASKS.map(t => routeTaskV2(t, pool, new Map()).agentId);
    const counts: Record<string, number> = {};
    for (const a of agents) counts[a ?? 'null'] = (counts[a ?? 'null'] ?? 0) + 1;
    const maxPct = Math.max(...Object.values(counts)) / agents.length;
    expect(
      maxPct,
      `routing collapsed: counts=${JSON.stringify(counts)}, max=${(maxPct * 100).toFixed(0)}%`,
    ).toBeLessThanOrEqual(0.6);
  });

  it('doc tasks route to doc-writer, security tasks route to security-auditor', () => {
    const doc1 = routeTaskV2(MINI_SPRINT_TASKS[0]!, pool, new Map());
    const doc2 = routeTaskV2(MINI_SPRINT_TASKS[1]!, pool, new Map());
    expect(doc1.agentId).toBe('doc-writer');
    expect(doc2.agentId).toBe('doc-writer');

    const sec1 = routeTaskV2(MINI_SPRINT_TASKS[2]!, pool, new Map());
    expect(sec1.agentId).toBe('security-auditor');
  });
});

// ─── (b) Monorepo-type multi-directory task routing ─────────────────────────
//
// Uses this repo's own multi-surface src/ layout (src/api/, src/dashboard/,
// src/orchestra/) rather than a literal packages/* layout: intent-classifier.ts's
// analyzeComplexity() only strips a leading src|tests|test|lib segment (not
// "packages"), so a packages/x/ path would collapse every package to a single
// 'packages' module for moduleCount purposes even though detectDomains() (used for
// the agent domain-match bonus) correctly extracts 'x'. src/<surface>/ exercises
// the real cross-cutting signal on both code paths without relying on that gap.

function buildMonorepoPool(): AgentPool {
  const pool: AgentPool = new Map();

  pool.set('api-builder', makeAgent('api-builder', {
    rules: [{ name: 'domain-api', when: { 'domains': { '$contains': 'api' } }, score: 8 }],
    exclude: [],
    minScore: 5,
  }));

  pool.set('frontend-designer', makeAgent('frontend-designer', {
    rules: [{ name: 'intent-design', when: { 'intent.primary': 'design' }, score: 10 }],
    exclude: [],
    minScore: 5,
  }));

  // Generic surface owner for modules with no domain specialist (e.g. src/orchestra/).
  pool.set('refactorer', makeAgent('refactorer', {
    rules: [{ name: 'intent-implementation', when: { 'intent.primary': 'implementation' }, score: 8 }],
    exclude: [],
    minScore: 5,
  }));

  return pool;
}

describe('(b) monorepo-type multi-directory task routing', () => {
  const pool = buildMonorepoPool();

  it('src/api/-only task routes to api-builder, not frontend-designer', () => {
    const task = makeTask({
      title: 'Add REST API user endpoint',
      description: 'Create user CRUD handler in the API surface. Add the REST endpoint route.',
      scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/users.ts'] },
    });
    const result = routeTaskV2(task, pool, new Map());
    expect(result.agentId).toBe('api-builder');
    expect(result.agentId).not.toBe('frontend-designer');
  });

  it('src/dashboard/-only task routes to frontend-designer, not api-builder', () => {
    const task = makeTask({
      title: 'Add button component to dashboard',
      description: 'Create a shared Button React component in the dashboard surface. Responsive layout, Tailwind styling.',
      scope: { directories: ['src/dashboard/'], filesRead: [], filesWrite: ['src/dashboard/Button.tsx'] },
    });
    const result = routeTaskV2(task, pool, new Map());
    expect(result.agentId).toBe('frontend-designer');
    expect(result.agentId).not.toBe('api-builder');
  });

  it('3-surface cross-cutting task: moduleCount >= 3, crossCutting true, domains span api+dashboard', () => {
    const task = makeTask({
      title: 'Share sprint status types across surfaces',
      description: 'Extract shared TypeScript interfaces used by the API, dashboard, and orchestra surfaces.',
      scope: {
        directories: ['src/api/', 'src/dashboard/', 'src/orchestra/'],
        filesRead: [],
        filesWrite: ['src/api/types.ts', 'src/dashboard/types.ts', 'src/orchestra/types.ts'],
      },
    });
    const result = routeTaskV2(task, pool, new Map());

    expect(result.taskDNA.complexity.moduleCount).toBeGreaterThanOrEqual(3);
    expect(result.taskDNA.complexity.crossCutting).toBe(true);

    const domainNames = result.taskDNA.domains.map(d => d.name);
    expect(domainNames).toContain('api');
    expect(domainNames).toContain('dashboard');

    // Engine always resolves to a concrete agent (static fallback if nothing clears
    // threshold) — never leaves a cross-cutting task unrouted.
    expect(result.agentId).toBeTruthy();
  });

  it('single-package isolation: independent api and dashboard tasks do not cross-contaminate', () => {
    const apiTask = makeTask({
      title: 'Add REST API order endpoint',
      description: 'Create order CRUD handler in the API surface.',
      scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/orders.ts'] },
    });
    const dashboardTask = makeTask({
      title: 'Add order card component to dashboard',
      description: 'Create a shared OrderCard React component in the dashboard surface. Responsive layout.',
      scope: { directories: ['src/dashboard/'], filesRead: [], filesWrite: ['src/dashboard/OrderCard.tsx'] },
    });

    const apiResult = routeTaskV2(apiTask, pool, new Map());
    const dashboardResult = routeTaskV2(dashboardTask, pool, new Map());

    expect(apiResult.agentId).not.toBe('frontend-designer');
    expect(dashboardResult.agentId).not.toBe('api-builder');
  });
});

// ─── (c) force-* overrides preserved ────────────────────────────────────────

function buildOverridePool(): AgentPool {
  const pool: AgentPool = new Map();
  pool.set('api-builder', makeAgent('api-builder', {
    rules: [{ name: 'domain-api', when: { 'domains': { '$contains': 'api' } }, score: 8 }],
    exclude: [],
    minScore: 5,
  }));
  pool.set('refactorer', makeAgent('refactorer', {
    rules: [{ name: 'intent-implementation', when: { 'intent.primary': 'implementation' }, score: 8 }],
    exclude: [],
    minScore: 5,
  }));
  return pool;
}

// Non-surface pool for the excludeAgents test: neither id is a USER_SURFACE_AGENTS
// member (api-builder/frontend-designer/ci-guardian), so excludeAgents is NOT bypassed
// by the surface-owner exclude-bypass (routing-engine.ts Sprint 216-003 — a genuine
// user-surface task like src/api/ intentionally lets its owner agent bypass excludes,
// which is exercised separately; this test isolates the plain exclude→next-candidate path).
function buildNonSurfaceAgentPool(): AgentPool {
  const pool: AgentPool = new Map();
  pool.set('refactorer', makeAgent('refactorer', {
    rules: [{ name: 'intent-implementation', when: { 'intent.primary': 'implementation' }, score: 8 }],
    exclude: [],
    minScore: 5,
  }));
  pool.set('architect', makeAgent('architect', {
    rules: [{ name: 'intent-implementation-weak', when: { 'intent.primary': 'implementation' }, score: 6 }],
    exclude: [],
    minScore: 5,
  }));
  return pool;
}

const API_FLAVORED_TASK = makeTask({
  title: 'Add REST API billing endpoint',
  description: 'Create billing CRUD handler in the API surface. Add the REST endpoint route and controller.',
  scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/billing.ts'] },
});

describe('(c) force-* overrides preserved', () => {
  const pool = buildOverridePool();
  const skillPool = new Map<string, SkillDefinition>([
    ['typescript-expert', TS_SKILL],
    ['testing-expert', TESTING_SKILL],
  ]);

  it('forceAgent wins over strong domain competition (api-flavored task forced to refactorer)', () => {
    // Baseline sanity: without an override this task goes to api-builder.
    const baseline = routeTaskV2(API_FLAVORED_TASK, pool, new Map());
    expect(baseline.agentId).toBe('api-builder');

    const result = routeTaskV2(API_FLAVORED_TASK, pool, new Map(), {
      overrides: [{ source: 'task-directive', forceAgent: 'refactorer', priority: 3 }],
    });
    expect(result.agentId).toBe('refactorer');
    expect(result.overrideSource).toBe('task-directive');
    expect(result.reasoning.some(r => r.includes('forced'))).toBe(true);
  });

  it('forceSkills bypasses automatic skill scoring', () => {
    const task = makeTask({
      title: 'Implement billing feature',
      description: 'Implement a new billing feature module.',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/billing.ts'] },
    });

    const result = routeTaskV2(task, pool, skillPool, {
      overrides: [{ source: 'task-directive', forceSkills: ['testing-expert'], priority: 3 }],
    });
    expect(result.skillIds).toEqual(['testing-expert']);
    expect(result.overrideSource).toBe('task-directive');
  });

  it('excludeAgents removes the would-be top pick; next candidate wins', () => {
    const nonSurfacePool = buildNonSurfaceAgentPool();
    const task = makeTask({
      title: 'Add object-comparison helper utility',
      description: 'Implement a small utility function for deep object comparison.',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/compare-utils.ts'] },
    });

    const baseline = routeTaskV2(task, nonSurfacePool, new Map());
    expect(baseline.agentId).toBe('refactorer');

    const result = routeTaskV2(task, nonSurfacePool, new Map(), {
      overrides: [{ source: 'task-directive', excludeAgents: ['refactorer'], priority: 3 }],
    });
    expect(result.agentId).not.toBe('refactorer');
    expect(result.agentId).toBe('architect');
  });

  it('excludeSkills removes a skill even when it would have scored highest', () => {
    const task = makeTask({
      title: 'Implement billing feature',
      description: 'Implement a new billing feature module.',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/billing.ts'] },
    });

    // Baseline sanity: typescript-expert wins without exclusion.
    const baseline = routeTaskV2(task, pool, skillPool);
    expect(baseline.skillIds).toContain('typescript-expert');

    const result = routeTaskV2(task, pool, skillPool, {
      overrides: [{ source: 'task-directive', excludeSkills: ['typescript-expert'], priority: 3 }],
    });
    expect(result.skillIds).not.toContain('typescript-expert');
  });

  it('priority resolution: task-directive (3) forceAgent beats conflicting sprint-directive (2)', () => {
    const result = routeTaskV2(API_FLAVORED_TASK, pool, new Map(), {
      overrides: [
        { source: 'sprint-directive', forceAgent: 'refactorer', priority: 2 },
        { source: 'task-directive', forceAgent: 'api-builder', priority: 3 },
      ],
    });
    // Higher-priority override (task-directive, forcing api-builder) wins the
    // resolution regardless of array order (resolveOverrides sorts by priority desc).
    expect(result.agentId).toBe('api-builder');
  });
});

// ─── (d) role-mismatch penalty's live effect ────────────────────────────────
//
// Uses real agent ids ('security-auditor', 'refactorer') WITHOUT setting an explicit
// `role` field on the fixture, so getAgentRole() falls back to the real production
// BUILTIN_AGENT_ROLES map (src/core/agent-pool.ts) — 'security-auditor' -> 'reviewer',
// 'refactorer' -> 'implementer'. Both fixtures get an IDENTICAL activation rule/score
// so the role-mismatch penalty is the only differentiator, isolating its live effect
// from any confounding domain-bonus or activation-strength asymmetry.

function buildRoleMismatchPool(): AgentPool {
  const pool: AgentPool = new Map();
  const tiedActivation: ActivationConfig = {
    rules: [{ name: 'intent-implementation', when: { 'intent.primary': 'implementation' }, score: 8 }],
    exclude: [],
    minScore: 5,
  };
  pool.set('security-auditor', makeAgent('security-auditor', tiedActivation));
  pool.set('refactorer', makeAgent('refactorer', tiedActivation));
  return pool;
}

const GENERIC_IMPL_TASK = makeTask({
  title: 'Add date-formatting helper utility',
  description: 'Implement a small utility function for date formatting.',
  scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/date-utils.ts'] },
});

describe('(d) role-mismatch penalty live effect', () => {
  const pool = buildRoleMismatchPool();

  it('reviewer (security-auditor) is NOT selected for a code-development implement-task despite a tied activation score', () => {
    const result = routeTaskV2({ ...GENERIC_IMPL_TASK, type: 'code-development' }, pool, new Map());

    expect(result.agentId).toBe('refactorer');
    expect(result.agentId).not.toBe('security-auditor');
    expect(
      result.reasoning.some(r => r.includes('security-auditor') && r.includes('role-mismatch penalty')),
    ).toBe(true);
  });

  it('role compatibility flips on an audit-kind task: reviewer wins, implementer is penalized', () => {
    const result = routeTaskV2({ ...GENERIC_IMPL_TASK, type: 'audit' }, pool, new Map());

    expect(result.agentId).toBe('security-auditor');
    expect(result.agentId).not.toBe('refactorer');
    expect(
      result.reasoning.some(r => r.includes('refactorer') && r.includes('role-mismatch penalty')),
    ).toBe(true);
  });

  it('undefined taskKind applies no role penalty (tie broken by learning bonus / stable order, both candidates present)', () => {
    const result = routeTaskV2(GENERIC_IMPL_TASK, pool, new Map());
    // No taskKind → getRoleMismatchPenalty returns 0 for both — no role-mismatch
    // reasoning line should be emitted at all.
    expect(result.reasoning.some(r => r.includes('role-mismatch penalty'))).toBe(false);
  });

  it('direct unit check: getRoleMismatchPenalty + real BUILTIN_AGENT_ROLES fallback', () => {
    expect(BUILTIN_AGENT_ROLES['security-auditor']).toBe('reviewer');
    expect(BUILTIN_AGENT_ROLES['refactorer']).toBe('implementer');

    const secAgent = pool.get('security-auditor')!;
    const refAgent = pool.get('refactorer')!;
    expect(getAgentRole(secAgent)).toBe('reviewer');
    expect(getAgentRole(refAgent)).toBe('implementer');
    expect(getAgentDomain(secAgent)).toBe('security');
    expect(getAgentDomain(refAgent)).toBe('system');

    expect(getRoleMismatchPenalty('reviewer', 'code-development')).toBe(-3);
    expect(getRoleMismatchPenalty('implementer', 'code-development')).toBe(0);
    expect(getRoleMismatchPenalty('reviewer', 'audit')).toBe(0);
    expect(getRoleMismatchPenalty('implementer', 'audit')).toBe(-3);
    expect(getRoleMismatchPenalty('implementer', undefined)).toBe(0);
  });
});
