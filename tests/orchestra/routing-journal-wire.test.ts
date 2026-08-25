import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AgentDefinition } from '../../src/core/agent-types.js';
import type { CapabilityVector } from '../../src/core/routing/capability-vector.js';
import { DEFAULT_ROUTING_V3_CONFIG } from '../../src/core/routing/config.js';
import { JOURNAL_V3_DIR } from '../../src/core/routing/journal.js';
import { BUILTIN_DOMAINS } from '../../src/core/routing/vocabulary-builtin.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

const capabilities: CapabilityVector = {
  capabilitiesVersion: 3,
  content: {
    workTypes: [{ type: 'build', proficiency: 'primary' }],
    expertise: [],
    personaSlices: ['implementation', 'default'],
  },
  positional: {
    domains: [{ id: '*', proficiency: 'primary' }],
    surfaces: [],
    writeAuthority: true,
    role: 'implementer',
    deliverables: ['code-src'],
  },
  numerical: { costTier: 'standard', maxParallel: null },
};

const agent = {
  id: 'journal-builder',
  source: 'user',
  capabilities,
} as AgentDefinition;

vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: class {
    loadAgents(): Map<string, AgentDefinition> {
      return new Map([[agent.id, agent]]);
    }
  },
}));

const { routeSingleTaskV3, routeTasksV3ForPlan } = await import(
  '../../src/orchestra/routing-plan-adapter.js'
);

const roots: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-routing-journal-'));
  roots.push(root);
  return root;
}

function task(id: string): Task {
  return {
    id,
    title: 'Route journal decision',
    description: 'Exercise the production routing journal wire.',
    model: 'test-model',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'routing-journal-test',
    scope: {
      directories: ['src/core/routing'],
      filesRead: [],
      filesWrite: ['src/core/routing/journal.ts'],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'Decision is journaled.',
      noGoCriteria: 'Decision disappears.',
      techDebtAcceptable: 'none',
    },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-journal-wire',
    createdAt: '2026-08-25T00:00:00.000Z',
  } as Task;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('routing decision journal wire', () => {
  it('planner routing appends a decision file in the project tmpdir', async () => {
    const root = fixture();
    const routed = await routeTasksV3ForPlan(
      [task('plan-task')],
      root,
      { ...DEFAULT_ROUTING_V3_CONFIG, enabled: true },
      {
        sprintId: 'sprint-journal-wire',
        pools: { agents: new Map([[agent.id, agent]]), skills: new Map() },
      },
    );

    const journal = readFileSync(
      join(root, JOURNAL_V3_DIR, 'sprint-journal-wire.jsonl'),
      'utf8',
    );
    expect(JSON.parse(journal.trim())).toMatchObject({ taskId: 'plan-task' });
    expect(routed.journalFailures).toBe(0);
  });

  it('single-task routing journals its ad-hoc decision', async () => {
    const root = fixture();

    await routeSingleTaskV3(task('single-task'), root);

    const journal = readFileSync(join(root, JOURNAL_V3_DIR, 'adhoc.jsonl'), 'utf8');
    expect(JSON.parse(journal.trim())).toMatchObject({ taskId: 'single-task' });
  });

  it('carries the strongest route-time domain into routingMeta', async () => {
    const root = fixture();
    const routedTask = task('domain-task');

    await routeTasksV3ForPlan(
      [routedTask],
      root,
      { ...DEFAULT_ROUTING_V3_CONFIG, enabled: true },
      {
        journal: false,
        pools: { agents: new Map([[agent.id, agent]]), skills: new Map() },
      },
    );

    const expectedDomain = BUILTIN_DOMAINS
      .filter((domain) =>
        domain.pathPatterns.some((pattern) => pattern.includes('src/core')),
      )[0]?.id;
    expect(expectedDomain).toBeDefined();
    expect(routedTask.routingMeta?.dominantDomain).toBe(expectedDomain);
  });
});
