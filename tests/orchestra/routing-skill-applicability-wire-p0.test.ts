import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { CapabilityVector } from '../../src/core/routing/capability-vector.js';
import { DEFAULT_ROUTING_V3_CONFIG } from '../../src/core/routing/config.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { Task } from '../../src/core/task-types.js';
import { routeTasksV3ForPlan } from '../../src/orchestra/routing-plan-adapter.js';

const roots: string[] = [];

function project(): string {
  const value = mkdtempSync(join(tmpdir(), 'deckent-routing-skill-wire-'));
  roots.push(value);
  writeFileSync(join(value, 'package.json'), JSON.stringify({
    dependencies: { typescript: '^6', vitest: '^3' },
  }));
  writeFileSync(join(value, 'pyproject.toml'), '[project]\nname = "sidecar"\n');
  return value;
}

function agentPool() {
  const capabilities: CapabilityVector = {
    capabilitiesVersion: 3,
    content: {
      workTypes: [{ type: 'build', proficiency: 'primary' }],
      expertise: [], personaSlices: ['implementation'],
    },
    positional: {
      domains: [{ id: '*', proficiency: 'able' }],
      surfaces: [], writeAuthority: true, role: 'implementer', deliverables: ['code-src'],
    },
    numerical: { costTier: 'standard', maxParallel: null },
  };
  return new Map([['builder', { id: 'builder', source: 'builtin', capabilities }]]) as never;
}

function skills() {
  return new Map([
    ['python-expert', createSkillDefinition({
      id: 'python-expert', name: 'Python Expert', description: 'Python implementation',
      category: 'language', triggers: ['python', 'pytest'],
      stackDetection: { files: ['pyproject.toml'], dependencies: [], commands: [] },
      priority: 10,
    })],
    ['typescript-expert', createSkillDefinition({
      id: 'typescript-expert', name: 'TypeScript Expert', description: 'TypeScript implementation',
      category: 'language', triggers: ['typescript'],
      stackDetection: { files: ['tsconfig.json'], dependencies: ['typescript'], commands: [] },
      priority: 10,
    })],
  ]);
}

function task(id: string, path: string, forceSkills?: string[]): Task {
  return {
    id, title: `Implement ${path}`, description: 'Build the scoped implementation.',
    status: 'PENDING' as Task['status'], priority: 'NORMAL', effort: 'normal',
    scope: { filesRead: [], filesWrite: [path], directories: [] },
    ...(forceSkills ? { forceSkills } : {}),
  } as Task;
}

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('routing plan hard-applicability production wire', () => {
  it('routes TypeScript to TypeScript guidance and records Python as a task-local rejection', async () => {
    const root = project();
    const input = task('ts-1', 'src/core/feature.ts');
    const result = await routeTasksV3ForPlan([input], root, DEFAULT_ROUTING_V3_CONFIG, {
      journal: false,
      pools: { agents: agentPool(), skills: skills() },
    });

    expect(result.routed).toEqual(['ts-1']);
    expect(input.assignedSkills).toEqual(['typescript-expert']);
    expect(input.routingMeta).toMatchObject({
      routingVersion: 'v3',
      skillEvidenceDigest: expect.stringMatching(/^sha256:/),
      skillCatalogDigest: expect.stringMatching(/^sha256:/),
      skillDecisionDigest: expect.stringMatching(/^sha256:/),
    });
    expect(result.skillRejections).toContainEqual(expect.objectContaining({
      taskId: 'ts-1', skillId: 'python-expert', reason: 'required-evidence-missing',
    }));
  });

  it('routes a new .py write task to Python guidance, independent of root marker coincidence', async () => {
    const root = project();
    const input = task('py-1', 'services/worker/main.py');
    const result = await routeTasksV3ForPlan([input], root, DEFAULT_ROUTING_V3_CONFIG, {
      journal: false,
      pools: { agents: agentPool(), skills: skills() },
    });

    expect(result.routed).toEqual(['py-1']);
    expect(input.assignedSkills).toEqual(['python-expert']);
    expect(result.skillRejections).toContainEqual(expect.objectContaining({
      taskId: 'py-1', skillId: 'typescript-expert', reason: 'required-evidence-missing',
    }));
  });

  it('turns an inapplicable forced skill into a plan HOLD instead of a post-route union', async () => {
    const root = project();
    const input = task('forced-1', 'src/core/feature.ts', ['python-expert']);
    const result = await routeTasksV3ForPlan([input], root, DEFAULT_ROUTING_V3_CONFIG, {
      journal: false,
      pools: { agents: agentPool(), skills: skills() },
    });

    expect(result.routed).toEqual([]);
    expect(input.assignedAgent).toBeUndefined();
    expect(input.assignedSkills).toBeUndefined();
    expect(result.escalations).toContainEqual(expect.objectContaining({
      taskId: 'forced-1', reason: 'skill-selection-hold',
    }));
  });
});
