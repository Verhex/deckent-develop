// ─── Agent Routing Health Tests — Sprint 146 ───────────────────────────────────
// Validates intent classifier refresh + agent routing V2 re-training.
// Ensures correct agent assignment for various task types:
//   documentation → doc-writer, core-dev → architect, testing → test-writer, etc.

import { describe, it, expect } from 'vitest';
import { routeTaskV2 } from '../../src/core/routing-engine.js';
import { classifyIntent, detectPrimaryIntent, analyzeWriteScope } from '../../src/core/intent-classifier.js';
import { getDynamicExclusions } from '../../src/core/activation-engine.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import type { TaskScope } from '../../src/core/task-types.js';

// ─── Test Agent Fixtures ────────────────────────────────────────────────────

function makeAgent(id: string, overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id,
    name: id,
    description: `${id} agent`,
    systemPrompt: `You are ${id}.`,
    expertise: [],
    allowedTools: ['Read', 'Write'],
    deniedTools: [],
    preferredModel: 'sonnet',
    effortMultiplier: 1.0,
    triggerKeywords: [],
    triggerScopes: [],
    triggerFilePatterns: [],
    persistent: false,
    enabled: true,
    source: 'builtin',
    manifestVersion: 2,
    activation: { rules: [], exclude: [], minScore: 5 },
    stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
    ...overrides,
  };
}

function buildAgentPool(): AgentPool {
  const pool: AgentPool = new Map();

  pool.set('doc-writer', makeAgent('doc-writer', {
    activation: {
      rules: [
        { name: 'intent-documentation', when: { 'intent.primary': 'documentation' }, score: 10 },
      ],
      exclude: [
        { name: 'no-implementation-src', when: { 'intent.primary': 'implementation', 'scope.primaryWriteTarget': 'src/' } },
      ],
      minScore: 5,
    },
    triggerKeywords: ['docs', 'readme', 'changelog', 'documentation'],
  }));

  pool.set('test-writer', makeAgent('test-writer', {
    activation: {
      rules: [
        { name: 'intent-testing', when: { 'intent.primary': 'testing' }, score: 10 },
      ],
      exclude: [
        { name: 'no-documentation', when: { 'intent.primary': 'documentation' } },
      ],
      minScore: 5,
    },
    triggerKeywords: ['test', 'spec', 'coverage', 'vitest'],
  }));

  pool.set('architect', makeAgent('architect', {
    activation: {
      rules: [
        { name: 'intent-implementation', when: { 'intent.primary': 'implementation' }, score: 8 },
        { name: 'large-task', when: { 'complexity.estimatedSize': { '$in': ['large', 'epic'] } }, score: 10 },
      ],
      exclude: [
        { name: 'no-trivial-docs', when: { 'intent.primary': 'documentation', 'complexity.estimatedSize': 'trivial' } },
      ],
      minScore: 5,
    },
    triggerKeywords: ['architecture', 'design', 'module', 'system'],
  }));

  pool.set('bug-fixer', makeAgent('bug-fixer', {
    activation: {
      rules: [
        { name: 'intent-bugfix', when: { 'intent.primary': 'bugfix' }, score: 10 },
      ],
      exclude: [],
      minScore: 5,
    },
    triggerKeywords: ['fix', 'bug', 'error', 'crash'],
  }));

  pool.set('security-auditor', makeAgent('security-auditor', {
    activation: {
      rules: [
        { name: 'intent-security', when: { 'intent.primary': 'security' }, score: 10 },
      ],
      exclude: [],
      minScore: 5,
    },
    triggerKeywords: ['security', 'auth', 'vulnerability'],
  }));

  pool.set('refactorer', makeAgent('refactorer', {
    activation: {
      rules: [
        { name: 'intent-refactor', when: { 'intent.primary': 'refactor' }, score: 10 },
      ],
      exclude: [],
      minScore: 5,
    },
    triggerKeywords: ['refactor', 'cleanup', 'restructure'],
  }));

  pool.set('frontend-designer', makeAgent('frontend-designer', {
    activation: {
      rules: [
        { name: 'intent-design', when: { 'intent.primary': 'design' }, score: 10 },
      ],
      exclude: [],
      minScore: 5,
    },
    triggerKeywords: ['ui', 'component', 'layout'],
  }));

  pool.set('migration-specialist', makeAgent('migration-specialist', {
    activation: {
      rules: [
        { name: 'intent-migration', when: { 'intent.primary': 'migration' }, score: 10 },
      ],
      exclude: [],
      minScore: 5,
    },
    triggerKeywords: ['migrate', 'migration', 'upgrade'],
  }));

  pool.set('accessibility-auditor', makeAgent('accessibility-auditor', {
    activation: {
      rules: [
        { name: 'intent-design-a11y', when: { 'intent.primary': 'design' }, score: 5 },
      ],
      exclude: [],
      minScore: 5,
    },
    triggerKeywords: ['accessibility', 'wcag', 'a11y'],
  }));

  pool.set('devops-engineer', makeAgent('devops-engineer', {
    activation: {
      rules: [
        { name: 'intent-devops', when: { 'intent.primary': 'devops' }, score: 10 },
      ],
      exclude: [],
      minScore: 5,
    },
    triggerKeywords: ['deploy', 'ci', 'docker', 'pipeline'],
  }));

  pool.set('data-engineer', makeAgent('data-engineer', {
    activation: {
      rules: [
        { name: 'intent-config', when: { 'intent.primary': 'config' }, score: 5 },
      ],
      exclude: [],
      minScore: 5,
    },
    triggerKeywords: ['data', 'pipeline', 'etl'],
  }));

  return pool;
}

// Registers the two skills the forced-override test (Test 12) pins, in
// real SkillDefinition shape — a truly empty pool silently drops forced
// skill ids at routeTaskV2's forced-skill validation (skillPool.has(id)),
// phantom-dropping the override. Deterministic `activation: { rules: [] }`
// keeps the base score at 0 for every non-forced test in this file, so
// neither skill can outscore cfg.skillMinScore on its own and change an
// agentId assertion elsewhere.
function buildSkillPool(): Map<string, SkillDefinition> {
  const pool = new Map<string, SkillDefinition>();

  pool.set('typescript-expert', createSkillDefinition({
    id: 'typescript-expert',
    name: 'typescript-expert',
    category: 'language',
    triggers: ['typescript', 'ts'],
    activation: { rules: [], exclude: [], minScore: 5 },
  }));

  pool.set('testing-expert', createSkillDefinition({
    id: 'testing-expert',
    name: 'testing-expert',
    category: 'domain',
    triggers: ['test', 'spec', 'coverage', 'vitest'],
    activation: { rules: [], exclude: [], minScore: 5 },
  }));

  return pool;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Agent Routing Health — Sprint 146', () => {
  const pool = buildAgentPool();
  const skills = buildSkillPool();

  // Test 1: T-145-020 ANA-PLAN-TR documentation task → doc-writer
  it('T-145-020: root .md filesWrite → intent documentation, agent doc-writer', () => {
    const task = {
      title: 'ANA-PLAN-TR Güncellemesi',
      description: 'DECKENT-ANA-PLAN-TR.md doc update. Sprint 145 bölümü append.',
      scope: {
        directories: ['./'],
        filesRead: [],
        filesWrite: ['DECKENT-ANA-PLAN-TR.md'],
      },
    };

    const dna = classifyIntent(task);
    expect(dna.intent.primary).toBe('documentation');

    const decision = routeTaskV2(task, pool, skills);
    expect(decision.agentId).toBe('doc-writer');
  });

  // Test 2: T-145-002 Brain Heuristic Timeout Estimator → architect
  it('T-145-002: src/orchestra/ timeout estimator → agent architect', () => {
    const task = {
      title: 'Brain Heuristic Timeout Estimator',
      description: 'Adaptive timeout estimator implementation for brain heuristic timeout. Create timeout-estimator.ts module.',
      scope: {
        directories: ['src/orchestra/'],
        filesRead: ['src/orchestra/sprint-controller.ts'],
        filesWrite: ['src/orchestra/timeout-estimator.ts', 'tests/orchestra/timeout-estimator.test.ts'],
      },
    };

    const dna = classifyIntent(task);
    // Should be implementation, not testing
    expect(dna.intent.primary).not.toBe('testing');

    const decision = routeTaskV2(task, pool, skills);
    expect(decision.agentId).toBe('architect');
  });

  // Test 3: T-145-027 tests/integration/ scope → test-writer
  it('T-145-027: tests/integration/ scope → agent test-writer', () => {
    const task = {
      title: 'Integration Test Suite',
      description: 'Write integration tests for memory-v2 prod readiness. spec coverage for full pipeline.',
      scope: {
        directories: ['tests/integration/'],
        filesRead: ['src/core/memory-store.ts'],
        filesWrite: ['tests/integration/memory-v2-prod-readiness.test.ts'],
      },
    };

    const dna = classifyIntent(task);
    // Sprint 148: 'testing' removed as primary intent — test tasks classify as implementation
    expect(dna.intent.primary).not.toBe('testing');
    expect(dna.tags).toContain('test-coverage');

    const decision = routeTaskV2(task, pool, skills);
    // Sprint 148: test-writer removed — fallback chain provides alternative agent
    expect(decision.agentId).not.toBe('test-writer');
  });

  // Test 4: T-145-004 src/agents/ bug fix → bug-fixer or security-auditor
  it('T-145-004: src/agents/ bug fix task → agent bug-fixer or security-auditor', () => {
    const task = {
      title: 'Worker RBAC Bug Fix',
      description: 'Fix worker scope enforcement bug in agents. Runtime error when worker writes outside scope.',
      scope: {
        directories: ['src/agents/'],
        filesRead: ['src/core/types.ts'],
        filesWrite: ['src/agents/worker.ts', 'tests/agents/worker-rbac.test.ts'],
      },
    };

    const dna = classifyIntent(task);
    expect(dna.intent.primary).toBe('bugfix');

    const decision = routeTaskV2(task, pool, skills);
    expect(['bug-fixer', 'security-auditor']).toContain(decision.agentId);
  });

  // Tests 5-8: Dynamic exclusions per scope
  it('documentation intent → excludes migration-specialist, devops-engineer, security-auditor', () => {
    const exclusions = getDynamicExclusions('documentation', ['docs/']);
    expect(exclusions).toContain('migration-specialist');
    expect(exclusions).toContain('devops-engineer');
    expect(exclusions).toContain('security-auditor');
    expect(exclusions).not.toContain('doc-writer');
  });

  it('src/orchestra/ scope → excludes frontend-designer, accessibility-auditor', () => {
    const exclusions = getDynamicExclusions('implementation', ['src/orchestra/']);
    expect(exclusions).toContain('frontend-designer');
    expect(exclusions).toContain('accessibility-auditor');
    expect(exclusions).not.toContain('architect');
  });

  it('src/cli/ scope → excludes frontend-designer, accessibility-auditor, migration-specialist', () => {
    const exclusions = getDynamicExclusions('implementation', ['src/cli/']);
    expect(exclusions).toContain('frontend-designer');
    expect(exclusions).toContain('accessibility-auditor');
    expect(exclusions).toContain('migration-specialist');
  });

  it('src/dashboard/ scope → excludes data-engineer, migration-specialist', () => {
    const exclusions = getDynamicExclusions('design', ['src/dashboard/']);
    expect(exclusions).toContain('data-engineer');
    expect(exclusions).toContain('migration-specialist');
    expect(exclusions).not.toContain('frontend-designer');
  });

  // Test 9: Intent classifier confidence > 0.6 for canonical tasks
  it('canonical task types produce confidence > 0.6', () => {
    const docTask = classifyIntent({
      title: 'Update README documentation',
      description: 'Documentation update for changelog and readme guide',
      scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/guide.md'] },
    });
    expect(docTask.intent.confidence).toBeGreaterThan(0.6);

    const testTask = classifyIntent({
      title: 'Write unit tests',
      description: 'Add vitest spec coverage for memory module',
      scope: { directories: ['tests/'], filesRead: [], filesWrite: ['tests/core/memory.test.ts'] },
    });
    expect(testTask.intent.confidence).toBeGreaterThan(0.6);
  });

  // Test 10: Sprint 145 re-route simulation — non-test tasks must NOT go to test-writer
  it('Sprint 145 re-route: non-test tasks never route to test-writer (was 14/27)', () => {
    // Simulate Sprint 145 mixed tasks — the key assertion is that
    // implementation, doc, and bugfix tasks are NOT routed to test-writer.
    // Pure test tasks (scope=tests/) correctly going to test-writer is expected.
    const nonTestTasks = [
      // Implementation tasks
      { title: 'Adaptive Timeout Config', desc: 'Config timeout settings for adaptive timeout estimator', scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/config.ts'] } },
      { title: 'Brain Heuristic Timeout Estimator', desc: 'Timeout estimator implementation', scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/timeout-estimator.ts'] } },
      { title: 'Event Bus Implementation', desc: 'Create event bus module for sprint events', scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/event-bus.ts'] } },
      { title: 'Monitor Adapter', desc: 'Build monitor adapter module', scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/monitor-adapter.ts'] } },
      { title: 'CLI Status Renderer', desc: 'Build CLI status renderer helper', scope: { directories: ['src/cli/'], filesRead: [], filesWrite: ['src/cli/helpers/status-renderer.ts'] } },
      { title: 'Config Validator', desc: 'Add config validator for runtime validation', scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/config-validator.ts'] } },
      { title: 'MCP Watch Tool', desc: 'Implement watch tool for MCP server', scope: { directories: ['src/mcp/'], filesRead: [], filesWrite: ['src/mcp/tools/watch.ts'] } },
      { title: 'File Adapter Notify', desc: 'Add file adapter for notification system', scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/notify-adapters/file-adapter.ts'] } },
      // Documentation tasks (were misrouted to test-writer in Sprint 145)
      { title: 'Sprint 145 Audit Report', desc: 'Write audit doc for sprint 145', scope: { directories: ['docs/audits/'], filesRead: [], filesWrite: ['docs/audits/sprint-145/report.md'] } },
      { title: 'Governance Doc Update', desc: 'Update governance documentation', scope: { directories: ['docs/governance/'], filesRead: [], filesWrite: ['docs/governance/process.md'] } },
      { title: 'ANA-PLAN-TR Update', desc: 'DECKENT-ANA-PLAN-TR.md doc update güncelleme', scope: { directories: ['./'], filesRead: [], filesWrite: ['DECKENT-ANA-PLAN-TR.md'] } },
      { title: 'Nervous System Design Spec', desc: 'Write design documentation spec', scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/specs/nervous-system.md'] } },
      // Bug fix tasks
      { title: 'Orphan Cleaner IPC Fix', desc: 'Fix orphan cleaner IPC communication bug', scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/orphan-cleaner.ts'] } },
      { title: 'Self-Modifying Detection Fix', desc: 'Fix self-modifying detection runtime error', scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/self-modifying-detector.ts'] } },
      { title: 'Worker Adaptive Agent Fix', desc: 'Fix adaptive agent runtime bug', scope: { directories: ['src/agents/'], filesRead: [], filesWrite: ['src/agents/adaptive-agent.ts'] } },
    ];

    let testWriterCount = 0;
    for (const t of nonTestTasks) {
      const decision = routeTaskV2(
        { title: t.title, description: t.desc, scope: t.scope as TaskScope },
        pool,
        skills,
      );
      if (decision.agentId === 'test-writer') testWriterCount++;
    }

    // No non-test task should route to test-writer (was 5+ in Sprint 145)
    expect(testWriterCount).toBe(0);
  });

  // Test 11: routingMeta version is v2
  it('routing decision includes v2 taskDNA', () => {
    const task = {
      title: 'Simple Implementation',
      description: 'Add a new function',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/utils.ts'] },
    };

    const decision = routeTaskV2(task, pool, skills);
    expect(decision.taskDNA).toBeDefined();
    expect(decision.taskDNA.intent).toBeDefined();
    expect(decision.taskDNA.intent.primary).toBeDefined();
    expect(decision.taskDNA.intent.confidence).toBeGreaterThan(0);
  });

  // Test 12: Forced skills override still works (backward compat)
  it('forced skills override is respected', () => {
    const task = {
      title: 'Custom Task',
      description: 'Task with forced skills',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/utils.ts'] },
    };

    const decision = routeTaskV2(task, pool, skills, {
      overrides: [{
        source: 'task-directive',
        forceSkills: ['typescript-expert', 'testing-expert'],
        priority: 3,
      }],
    });

    expect(decision.skillIds).toEqual(['typescript-expert', 'testing-expert']);
    expect(decision.overrideSource).toBe('task-directive');
  });
});
