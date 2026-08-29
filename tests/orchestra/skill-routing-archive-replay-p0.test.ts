import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { DEFAULT_ROUTING_V3_CONFIG } from '../../src/core/routing/config.js';
import type { Task } from '../../src/core/task-types.js';
import { routeTasksV3ForPlan } from '../../src/orchestra/routing-plan-adapter.js';

interface ReplayFixture {
  schemaVersion: 1;
  source: { sha256: string; sprints: number[] };
  tasks: Array<{
    sprint: number;
    id: string;
    workType: string;
    domain: string;
    filesWrite: string[];
    historicalAssignedSkills: string[];
    historicalDeliveredSkills: string[];
  }>;
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function fixture(): ReplayFixture {
  return JSON.parse(readFileSync(
    new URL('../fixtures/skill-routing-p0-sprints-690-707.json', import.meta.url),
    'utf8',
  )) as ReplayFixture;
}

function task(row: ReplayFixture['tasks'][number]): Task {
  return {
    id: row.id,
    title: `Archived routing replay ${row.id}`,
    description: 'Replay only structural task authority; historical skill ids are evidence, not input.',
    model: 'gpt-5.6-sol',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'skill routing P0 archive replay',
    scope: { directories: [], filesRead: [], filesWrite: [...row.filesWrite] },
    dependencies: [],
    goNogo: { goCriteria: 'deterministic replay', noGoCriteria: 'skill drift', techDebtAcceptable: 'none' },
    status: 'PENDING',
    sprintId: `sprint-${row.sprint}`,
    routingMeta: { workType: row.workType, dominantDomain: row.domain },
  } as Task;
}

describe('skill routing P0 — measured 39-task archive replay', () => {
  it('turns historical Python 39/39 into Python 0/39 with exact task-local rejection evidence', async () => {
    const archive = fixture();
    const firstTasks = archive.tasks.map(task);
    const secondTasks = archive.tasks.map(task);

    expect(archive.tasks).toHaveLength(39);
    expect(archive.tasks.filter(row => row.historicalAssignedSkills.includes('python-expert')))
      .toHaveLength(39);
    expect(archive.tasks.filter(row => row.historicalDeliveredSkills.includes('python-expert')))
      .toHaveLength(39);

    const first = await routeTasksV3ForPlan(
      firstTasks, projectRoot, DEFAULT_ROUTING_V3_CONFIG, { journal: false },
    );
    const second = await routeTasksV3ForPlan(
      secondTasks, projectRoot, DEFAULT_ROUTING_V3_CONFIG, { journal: false },
    );

    expect(first.routed).toHaveLength(39);
    expect(firstTasks.filter(item => item.assignedSkills?.includes('python-expert')))
      .toHaveLength(0);
    expect(first.skillRejections.filter(rejection =>
      rejection.taskId !== undefined
      && rejection.skillId === 'python-expert'
      && rejection.reason === 'required-evidence-missing'))
      .toHaveLength(39);
    expect(firstTasks.every(item =>
      item.routingMeta?.routingVersion === 'v3'
      && item.routingMeta.skillEvidenceDigest?.startsWith('sha256:')
      && item.routingMeta.skillCatalogDigest?.startsWith('sha256:')
      && item.routingMeta.skillDecisionDigest?.startsWith('sha256:')))
      .toBe(true);
    expect(firstTasks.some(item => (item.assignedSkills?.length ?? 0) !== 3)).toBe(true);
    expect(secondTasks.map(item => ({
      id: item.id,
      skillIds: item.assignedSkills,
      evidence: item.routingMeta?.skillEvidenceDigest,
      catalog: item.routingMeta?.skillCatalogDigest,
      decision: item.routingMeta?.skillDecisionDigest,
    }))).toEqual(firstTasks.map(item => ({
      id: item.id,
      skillIds: item.assignedSkills,
      evidence: item.routingMeta?.skillEvidenceDigest,
      catalog: item.routingMeta?.skillCatalogDigest,
      decision: item.routingMeta?.skillDecisionDigest,
    })));
  });
});
