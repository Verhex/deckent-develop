import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { CapabilityVector } from '../../../src/core/routing/capability-vector.js';
import { CELL_MIN_USES } from '../../../src/core/routing/axis-numerical.js';
import { lintCatalog } from '../../../src/core/routing/agent-lint.js';
import { DEFAULT_ROUTING_V3_CONFIG, resolveRoutingV3Config } from '../../../src/core/routing/config.js';
import type { JournalEntryV3, RoutingDecisionV3 } from '../../../src/core/routing/decision-types.js';
import { appendDecision, hashConfig, readSprintJournal } from '../../../src/core/routing/journal.js';
import type { RequirementVector } from '../../../src/core/routing/requirement-vector.js';
import { routeTaskV3 } from '../../../src/core/routing/route-task-v3.js';
import type { RouteCatalog, RoutableTask } from '../../../src/core/routing/route-task-v3.js';
import type { AgentCandidate } from '../../../src/core/routing/stage-eliminate.js';
import { TIE_EPSILON } from '../../../src/core/routing/stage-rank.js';
import { BUILTIN_DOMAINS } from '../../../src/core/routing/vocabulary-builtin.js';

function capabilities(): CapabilityVector {
  return {
    capabilitiesVersion: 3,
    content: {
      workTypes: [{ type: 'build', proficiency: 'primary' }],
      expertise: [],
      personaSlices: ['implementation'],
    },
    positional: {
      domains: [{ id: 'core/runtime', proficiency: 'primary' }],
      surfaces: [],
      writeAuthority: true,
      role: 'implementer',
      deliverables: ['code-test'],
    },
    numerical: { costTier: 'standard', maxParallel: null },
  };
}

function candidate(agentId: string): AgentCandidate {
  return { agentId, capabilities: capabilities(), source: 'builtin' };
}

const cold = candidate('cold');
const warm = candidate('warm');
const catalog: RouteCatalog = {
  agents: [cold, warm],
  skills: [],
  vocabulary: {
    domains: BUILTIN_DOMAINS,
    knownDomainIds: new Set(BUILTIN_DOMAINS.map((domain) => domain.id)),
  },
};

const task: RoutableTask = {
  title: 'Add a routing regression test',
  description: 'Pin deterministic routing behavior.',
  scope: {
    directories: ['tests/core/routing/'],
    filesRead: [],
    filesWrite: ['tests/core/routing/example.test.ts'],
  },
};

const requirement: RequirementVector = {
  content: {
    workType: 'build',
    subtype: null,
    summary: null,
    semanticTags: null,
    provenance: 'structural',
    calibratedConfidence: 1,
  },
  positional: {
    domains: [{ id: 'core/runtime', weight: 1, evidence: 'fixture' }],
    deliverables: [{ type: 'code-test', ratio: 1 }],
    surfaces: [],
    needsWrite: true,
    language: 'en',
  },
  numerical: {
    estimatedSize: 'small',
    fileCount: 1,
    moduleCount: 1,
    effortClass: 'normal',
    riskClass: 'low',
  },
};

const baseConfig = { ...DEFAULT_ROUTING_V3_CONFIG, enabled: true };
const warmCells = new Map([
  [
    'build|core/runtime|warm',
    { uses: CELL_MIN_USES, successes: CELL_MIN_USES, qualitySum: CELL_MIN_USES },
  ],
]);

function contentFit(coldScore: number, warmScore: number) {
  return async () =>
    new Map([
      ['cold', { score: coldScore, evidence: ['fixture'] }],
      ['warm', { score: warmScore, evidence: ['fixture'] }],
    ]);
}

describe('routing exploration bonus behavior guard', () => {
  it('keeps routeTaskV3 output bit-identical for explicit zero and an absent config field', async () => {
    const explicitlyOff = resolveRoutingV3Config(
      null,
      { routing_v3: { enabled: true, explorationBonus: 0 } },
    );
    const absentAtInput = resolveRoutingV3Config(
      null,
      { routing_v3: { enabled: true } },
    );

    const explicitDecision = await routeTaskV3(task, catalog, {
      config: explicitlyOff,
      requirement,
      cells: warmCells,
      contentFit: contentFit(0.7, 0.8),
    });
    const absentDecision = await routeTaskV3(task, catalog, {
      config: absentAtInput,
      requirement,
      cells: warmCells,
      contentFit: contentFit(0.7, 0.8),
    });

    expect(JSON.stringify(absentDecision)).toBe(JSON.stringify(explicitDecision));
  });

  it('lets a cold eligible agent pass a reachable incumbent while a warm agent gets no bonus', async () => {
    const decision = await routeTaskV3(task, catalog, {
      config: { ...baseConfig, explorationBonus: 0.5 },
      requirement,
      cells: warmCells,
      contentFit: contentFit(0.7, 0.8),
    });

    expect(decision.agentId).toBe('cold');
    const rankDetail = decision.story.steps.find((step) => step.stage === 'rank')?.detail;
    expect(rankDetail).toMatchObject({
      bonusDecisive: true,
      explorationBonuses: [{ agentId: 'cold', explorationBonus: 0.5 }],
    });
  });

  it('bounds extreme blends at one and persists a journal entry that parses cleanly', async () => {
    const root = mkdtempSync(join(tmpdir(), 'exploration-bonus-'));
    try {
      const decision = await routeTaskV3(task, catalog, {
        config: { ...baseConfig, explorationBonus: 1 },
        requirement,
        cells: warmCells,
        contentFit: contentFit(1, 1),
      });

      expect(decision.ranked.every((entry) => entry.finalScore <= 1)).toBe(true);
      const entry: JournalEntryV3 = {
        schemaVersion: 1,
        taskId: 'exploration-extreme',
        sprintId: 'sprint-exploration',
        recordedAt: '2026-08-25T00:00:00.000Z',
        requirement,
        configHash: hashConfig({ ...baseConfig, explorationBonus: 1 }),
        catalog: { cold: cold.capabilities, warm: warm.capabilities },
        decision: decision as RoutingDecisionV3,
      };

      appendDecision(root, entry);
      const parsed = readSprintJournal(root, 'sprint-exploration');
      expect(parsed.corruptedLines).toEqual([]);
      expect(parsed.entries).toEqual([entry]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps agent-lint output bit-identical regardless of bonus configuration', () => {
    const zero = lintCatalog(catalog.agents, BUILTIN_DOMAINS, {
      ...baseConfig,
      explorationBonus: 0,
    });
    const nonzero = lintCatalog(catalog.agents, BUILTIN_DOMAINS, {
      ...baseConfig,
      explorationBonus: 1,
    });

    expect(JSON.stringify(nonzero)).toBe(JSON.stringify(zero));
  });

  it('reports a tie when exploration narrows the winner-runner-up gap below epsilon', async () => {
    const decision = await routeTaskV3(task, catalog, {
      config: { ...baseConfig, explorationBonus: 0.15 },
      requirement,
      cells: warmCells,
      contentFit: contentFit(0.76, 0.78),
    });

    const [winner, runnerUp] = decision.ranked;
    expect(winner).toBeDefined();
    expect(runnerUp).toBeDefined();
    expect(winner!.finalScore - runnerUp!.finalScore).toBeLessThan(TIE_EPSILON);
    expect(decision.escalation?.reason).toBe('tie');
  });
});
