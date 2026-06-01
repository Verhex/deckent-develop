// Sprint 212 — Task 212-009
// Routing diversity regression guard: routes a representative 16-task mixed
// sprint DNA (UI, security, API, doc, impl, devops) through the live agent
// pool and asserts that the agent distribution stays diverse.
//
// Guards against the routing skew pattern where a single agent (historically
// refactorer) wins 75-100% of tasks. Relies on domain-match bonus (ADR-072/073,
// Sprint 209) and intent-based routing. Also validates the 212-008
// skill→agent affinity signal added to activation-engine.ts.

import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { AgentPoolManager } from '../../src/core/agent-pool.js';
import { routeTaskV2 } from '../../src/core/routing-engine.js';
import {
  getSkillAgentAffinityBonus,
  SKILL_AGENT_AFFINITY_BONUS,
  SKILL_AGENT_MAP,
} from '../../src/core/activation-engine.js';
import type { AgentPool } from '../../src/core/agent-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..', '..');

// ─── Representative 16-Task Sprint Mix ──────────────────────────────────────
// Mirrors a realistic sprint: UI, security, API, doc, generic impl, devops.
// Descriptions and scopes are chosen so intent classification lands each task
// in the right bucket (matching the domain-match bonus paths in routing-engine.ts).

interface TaskFixture {
  label: string;
  category: 'ui' | 'security' | 'api' | 'doc' | 'impl' | 'devops';
  task: {
    title: string;
    description: string;
    scope: { directories: string[]; filesRead: string[]; filesWrite: string[] };
  };
}

const SPRINT_TASKS: TaskFixture[] = [
  // UI / Frontend (3)
  {
    label: 'ui-sprint-panel',
    category: 'ui',
    task: {
      title: 'SprintPanel dashboard component',
      description: 'Build a responsive React component for the dashboard. Tailwind-styled layout with sprint status panel.',
      scope: { directories: ['src/dashboard/'], filesRead: [], filesWrite: ['src/dashboard/SprintPanel.tsx'] },
    },
  },
  {
    label: 'ui-worker-card',
    category: 'ui',
    task: {
      title: 'WorkerCard UI component',
      description: 'Create a React WorkerCard component displaying task progress and status indicators in the dashboard.',
      scope: { directories: ['src/dashboard/'], filesRead: [], filesWrite: ['src/dashboard/WorkerCard.tsx'] },
    },
  },
  {
    label: 'ui-onboarding-wizard',
    category: 'ui',
    task: {
      title: 'Onboarding wizard step component',
      description: 'Add an onboarding wizard React component with step-by-step guidance for first-time dashboard users.',
      scope: { directories: ['src/dashboard/src/components/'], filesRead: [], filesWrite: ['src/dashboard/src/components/Onboarding.tsx'] },
    },
  },

  // Security (2)
  {
    label: 'security-jwt-hardening',
    category: 'security',
    task: {
      title: 'Harden JWT authentication helper',
      description: 'Harden authentication helper with stricter JWT signature checks and replay-attack mitigation.',
      scope: { directories: ['src/auth/'], filesRead: [], filesWrite: ['src/auth/jwt-helper.ts'] },
    },
  },
  {
    label: 'security-rbac-audit',
    category: 'security',
    task: {
      title: 'RBAC audit for API endpoints',
      description: 'Audit authentication and authorization checks across API endpoints for OWASP top-10 vulnerabilities.',
      scope: { directories: ['src/auth/', 'src/api/'], filesRead: [], filesWrite: ['src/auth/rbac-audit.ts'] },
    },
  },

  // API (2)
  {
    label: 'api-sprints-endpoint',
    category: 'api',
    task: {
      title: 'Add /sprints REST endpoint',
      description: 'Add a new REST endpoint module to expose sprint status. Wire the route into the existing server.',
      scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/sprints-endpoint.ts'] },
    },
  },
  {
    label: 'api-routing-distribution',
    category: 'api',
    task: {
      title: 'Routing distribution API endpoint',
      description: 'Add GET /api/routing/distribution endpoint that reads routing learnings and returns agent distribution JSON.',
      scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/routing-distribution.ts'] },
    },
  },

  // Documentation (2)
  {
    label: 'doc-mcp-reference',
    category: 'doc',
    task: {
      title: 'Update MCP tools reference docs',
      description: 'Update the MCP tools reference documentation in docs/reference/mcp-tools.md with new tool descriptions.',
      scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/reference/mcp-tools.md'] },
    },
  },
  {
    label: 'doc-adr-write',
    category: 'doc',
    task: {
      title: 'Write ADR-075 architecture document',
      description: 'Write the ADR-075 architecture decision record documenting F5 evolution runtime wiring decisions.',
      scope: { directories: ['docs/adr/'], filesRead: [], filesWrite: ['docs/adr/075-evolution-runtime-wiring.md'] },
    },
  },

  // Generic Implementation (5) — these should land on refactorer/architect
  {
    label: 'impl-skill-agent-affinity',
    category: 'impl',
    task: {
      title: 'Add skill-agent affinity to activation engine',
      description: 'Add skill→agent affinity bonus map to activation-engine.ts so assigned skills influence agent scoring.',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/activation-engine.ts'] },
    },
  },
  {
    label: 'impl-outcome-tracker-wire',
    category: 'impl',
    task: {
      title: 'Wire adaptive-agent to outcome-tracker',
      description: 'Wire adaptAgentRuntime call into outcome-tracker so agent success rates drive skill recommendations.',
      scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/outcome-tracker.ts'] },
    },
  },
  {
    label: 'impl-sprint-reporter-wire',
    category: 'impl',
    task: {
      title: 'Wire prompt-evolution into sprint reporter',
      description: 'Call wirePromptEvolutionFromOutcomes inside sprint-reporter retro phase to produce prompt improvement suggestions.',
      scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/sprint-reporter.ts'] },
    },
  },
  {
    label: 'impl-content-generator',
    category: 'impl',
    task: {
      title: 'Code-derived module counts in content generators',
      description: 'Replace hardcoded module count numbers in managed-docs content-generators with runtime filesystem reads.',
      scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/managed-docs/content-generators.ts'] },
    },
  },
  {
    label: 'impl-promotion-pipeline',
    category: 'impl',
    task: {
      title: 'Wire agent-genealogy into promotion pipeline',
      description: 'Call genealogy recording in promotion-pipeline when temp agents are promoted to permanent.',
      scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/promotion-pipeline.ts'] },
    },
  },

  // DevOps (2)
  {
    label: 'devops-docker-build',
    category: 'devops',
    task: {
      title: 'Optimize Docker build pipeline',
      description: 'Optimize the Docker build pipeline by adding layer caching and reducing image size for deployment.',
      scope: { directories: ['docker/', '.github/workflows/'], filesRead: [], filesWrite: ['docker/Dockerfile'] },
    },
  },
  {
    label: 'devops-ci-pipeline',
    category: 'devops',
    task: {
      title: 'Fix CI test pipeline configuration',
      description: 'Fix the CI pipeline configuration to run tests in parallel and report coverage correctly on deploy.',
      scope: { directories: ['.github/workflows/'], filesRead: [], filesWrite: ['.github/workflows/ci.yml'] },
    },
  },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('routing diversity guard (Sprint 212-009)', () => {
  let pool: AgentPool;

  beforeAll(() => {
    const manager = new AgentPoolManager(PROJECT_ROOT);
    pool = manager.loadAgents();
    const required = ['refactorer', 'frontend-designer', 'security-auditor', 'api-builder', 'doc-writer'];
    for (const id of required) {
      if (!pool.has(id)) throw new Error(`live agent pool missing required built-in '${id}'`);
    }
  });

  // Test 1: ≥4 distinct agents across the full 16-task set
  it('mixed 16-task sprint produces ≥4 distinct agent selections', () => {
    const agents = SPRINT_TASKS.map(tc => routeTaskV2(tc.task, pool, new Map()).agentId);
    const distinct = new Set(agents);
    expect(
      distinct.size,
      `only ${distinct.size} distinct agents across 16 tasks: ${JSON.stringify([...distinct])}`,
    ).toBeGreaterThanOrEqual(4);
  });

  // Test 2: single-agent cap — no agent wins more than 60% of tasks
  it('no single agent wins more than 60% of the 16-task sprint', () => {
    const agents = SPRINT_TASKS.map(tc => routeTaskV2(tc.task, pool, new Map()).agentId);
    const counts: Record<string, number> = {};
    for (const a of agents) {
      counts[a ?? 'null'] = (counts[a ?? 'null'] ?? 0) + 1;
    }
    const total = agents.length;
    const maxPct = Math.max(...Object.values(counts)) / total;
    expect(
      maxPct,
      `routing collapsed: counts=${JSON.stringify(counts)}, max=${(maxPct * 100).toFixed(0)}%`,
    ).toBeLessThanOrEqual(0.6);
  });

  // Test 3: UI tasks → frontend-designer (domain-match: dashboard scope)
  it('dashboard/UI tasks route to frontend-designer', () => {
    const uiTasks = SPRINT_TASKS.filter(tc => tc.category === 'ui');
    expect(uiTasks.length).toBeGreaterThanOrEqual(2);
    for (const tc of uiTasks) {
      const { agentId, reasoning } = routeTaskV2(tc.task, pool, new Map());
      expect(
        agentId,
        `'${tc.label}' expected frontend-designer, got '${agentId}'. Routing:\n${reasoning.join('\n')}`,
      ).toBe('frontend-designer');
    }
  });

  // Test 4: security tasks → security-auditor (auth scope + security intent)
  it('auth/security tasks route to security-auditor', () => {
    const secTasks = SPRINT_TASKS.filter(tc => tc.category === 'security');
    expect(secTasks.length).toBeGreaterThanOrEqual(1);
    for (const tc of secTasks) {
      const { agentId, reasoning } = routeTaskV2(tc.task, pool, new Map());
      expect(
        agentId,
        `'${tc.label}' expected security-auditor, got '${agentId}'. Routing:\n${reasoning.join('\n')}`,
      ).toBe('security-auditor');
    }
  });

  // Test 5: 212-008 signal — getSkillAgentAffinityBonus is correctly wired for key clusters
  it('212-008 skill→agent affinity signal covers all four directive clusters', () => {
    // frontend cluster
    expect(getSkillAgentAffinityBonus('frontend-designer', ['frontend-design'])).toBe(SKILL_AGENT_AFFINITY_BONUS);
    expect(getSkillAgentAffinityBonus('frontend-designer', ['react-specialist'])).toBe(SKILL_AGENT_AFFINITY_BONUS);
    // security cluster
    expect(getSkillAgentAffinityBonus('security-auditor', ['security-specialist'])).toBe(SKILL_AGENT_AFFINITY_BONUS);
    // api cluster
    expect(getSkillAgentAffinityBonus('api-builder', ['api-builder'])).toBe(SKILL_AGENT_AFFINITY_BONUS);
    // doc cluster
    expect(getSkillAgentAffinityBonus('doc-writer', ['documentation-writer'])).toBe(SKILL_AGENT_AFFINITY_BONUS);
    // refactorer is NOT in the map (generalist — base scoring only)
    expect(getSkillAgentAffinityBonus('refactorer', ['frontend-design', 'security-specialist', 'api-builder'])).toBe(0);
  });

  // Test 6: SKILL_AGENT_MAP contains all four directive-specified agent clusters
  it('SKILL_AGENT_MAP covers frontend/security/api/doc clusters as required by 212-008', () => {
    const mapValues = Object.values(SKILL_AGENT_MAP);
    expect(mapValues).toContain('frontend-designer');
    expect(mapValues).toContain('security-auditor');
    expect(mapValues).toContain('api-builder');
    expect(mapValues).toContain('doc-writer');
    // Generalist agents must NOT appear as values (Sprint 205 regression guard)
    expect(mapValues).not.toContain('refactorer');
    expect(mapValues).not.toContain('bug-fixer');
    expect(mapValues).not.toContain('code-reviewer');
  });
});
