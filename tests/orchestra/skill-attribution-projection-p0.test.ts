import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildSkillAttributionReceipt,
  SkillAttributionConflictError,
  writeSkillAttributionBatch,
  type SkillAttributionReceipt,
} from '../../src/core/routing/skill-attribution.js';
import { createDefaultTaskDNA } from '../../src/core/routing-types.js';
import { TaskEvaluation } from '../../src/core/types.js';
import {
  deriveFinalizerTaskDNA,
  writeCatalogStatsTerminalOutcomes,
  type CatalogStatsTerminalOutcome,
} from '../../src/orchestra/sprint-finalizer.js';
import { OutcomeTracker } from '../../src/orchestra/outcome-tracker.js';
import { RuleEvolver } from '../../src/orchestra/rule-evolver.js';
import { PromotionPipeline } from '../../src/orchestra/promotion-pipeline.js';

const roots: string[] = [];
const D = `sha256:${'a'.repeat(64)}`;

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'deckent-skill-attribution-projection-'));
  roots.push(value);
  return value;
}

function exposureOutcome(credited = false): {
  receipt: SkillAttributionReceipt;
  outcome: CatalogStatsTerminalOutcome;
} {
  const receipt = buildSkillAttributionReceipt({
    sprintId: 'sprint-708', logicalTaskId: '707-001', resolvingAttemptId: '707-001-fix',
    routingDecisionDigest: D, skillEvidenceDigest: D, logicalSettlementDigest: D,
    promptDeliveryState: 'CURRENT',
    selectedSkillIds: ['python-expert'], deliveredSkillIds: ['python-expert'],
    ...(credited ? {
      appliedEvidence: {
        authority: 'host-validated' as const, evidenceDigest: D, skillIds: ['python-expert'],
      },
    } : {}),
  });
  return { receipt, outcome: {
    taskId: '707-001', agentId: 'builder',
    skillIds: [...receipt.creditedSkillIds],
    selectedSkillIds: [...receipt.selectedSkillIds],
    deliveredSkillIds: [...receipt.deliveredSkillIds],
    creditedSkillIds: [...receipt.creditedSkillIds],
    skillAttributionState: receipt.state,
    skillAttributionReceiptDigest: receipt.receiptDigest,
    evaluation: TaskEvaluation.DONE,
    coverage: 90,
  } };
}

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('catalog stats causal skill projection', () => {
  it('projects V3 work/domain/scope facts instead of writing unknown empty TaskDNA', () => {
    const dna = deriveFinalizerTaskDNA({
      scope: {
        directories: ['src/core'], filesRead: [],
        filesWrite: ['src/core/router.ts', 'tests/core/router.test.ts'],
      },
      routingMeta: {
        routingVersion: 'v3', workType: 'fix', dominantDomain: 'core-runtime',
        confidence: 'high', policyTags: ['regulated'],
      },
    });

    expect(dna).toMatchObject({
      intent: { primary: 'bugfix', confidence: 0.9 },
      tags: ['regulated'],
      domains: [{ name: 'core-runtime', weight: 1 }],
      operations: [{ type: 'modify', weight: 1 }],
      complexity: { fileCount: 2, moduleCount: 2, crossCutting: true },
      scope: { testWriteRatio: 0.5 },
    });
  });

  it('quarantines legacy skill efficacy losslessly and counts exposure without efficacy credit', () => {
    const projectRoot = root();
    const statsDir = join(projectRoot, '.deckent', 'stats');
    mkdirSync(statsDir, { recursive: true });
    const legacy = {
      agents: {},
      skills: {
        'python-expert': {
          totalUses: 113, successCount: 107, successRate: 107 / 113,
          avgCoverage: 88, lastUsedInSprint: 'sprint-707',
        },
      },
    };
    writeFileSync(join(statsDir, 'catalog-stats.json'), JSON.stringify(legacy));

    const projected = exposureOutcome(false);
    writeSkillAttributionBatch(projectRoot, 'sprint-708', [projected.receipt]);
    writeCatalogStatsTerminalOutcomes(projectRoot, 'sprint-708', [projected.outcome]);
    const sidecar = JSON.parse(readFileSync(join(statsDir, 'catalog-stats.json'), 'utf8'));

    expect(sidecar.skillAttribution).toMatchObject({ authority: 'causal-receipt-v1' });
    expect(sidecar.legacySkillStatsQuarantine.skills['python-expert']).toMatchObject({
      totalUses: 113, successCount: 107,
    });
    expect(sidecar.skills['python-expert']).toBeUndefined();
    expect(sidecar.skillExposure['python-expert']).toMatchObject({
      selected: 1, delivered: 1, credited: 0, terminalOutcomes: 1,
    });
  });

  it('increments efficacy stats only for a host-validated credited receipt', () => {
    const projectRoot = root();
    const projected = exposureOutcome(true);
    writeSkillAttributionBatch(projectRoot, 'sprint-708', [projected.receipt]);
    writeCatalogStatsTerminalOutcomes(projectRoot, 'sprint-708', [projected.outcome]);
    const sidecar = JSON.parse(readFileSync(
      join(projectRoot, '.deckent', 'stats', 'catalog-stats.json'), 'utf8',
    ));

    expect(sidecar.skills['python-expert']).toMatchObject({ totalUses: 1, successCount: 1 });
    expect(sidecar.skillExposure['python-expert']).toMatchObject({ credited: 1 });
  });

  it('rejects a CREDITED projection that is not bound to the immutable attribution batch', () => {
    const projectRoot = root();
    const projected = exposureOutcome(true);

    expect(() => writeCatalogStatsTerminalOutcomes(
      projectRoot, 'sprint-708', [projected.outcome],
    )).toThrow(SkillAttributionConflictError);
    expect(() => readFileSync(
      join(projectRoot, '.deckent', 'stats', 'catalog-stats.json'), 'utf8',
    )).toThrow();
  });
});

describe('learning migration and consumer containment', () => {
  it('has no production RuleEvolver writer or evolved-rule injection consumer', () => {
    const finalizer = readFileSync(
      new URL('../../src/orchestra/sprint-finalizer.ts', import.meta.url), 'utf8',
    );
    const planner = readFileSync(
      new URL('../../src/orchestra/sprint-planner.ts', import.meta.url), 'utf8',
    );

    expect(finalizer).not.toContain('.evolveRules()');
    expect(finalizer).not.toContain('saveEvolvedRules(');
    expect(planner).not.toContain('allLearnings.evolvedRules');
    expect(planner).not.toContain('Injected ${injectedCount} auto-applied evolved rules');
  });

  it('moves poisoned skill learning into a digest-bound quarantine and keeps consumers inactive', () => {
    const projectRoot = root();
    const routingDir = join(projectRoot, '.deckent', 'routing');
    mkdirSync(routingDir, { recursive: true });
    const perf = {
      totalTasks: 113, successCount: 107, failCount: 6, successRate: 107 / 113,
      avgQualityScore: 80, qualityTaskCount: 113,
      byIntent: { unknown: { tasks: 113, successRate: 107 / 113 } },
    };
    writeFileSync(join(routingDir, 'learnings.json'), JSON.stringify({
      version: 1, updatedAt: '2026-08-28T00:00:00.000Z', totalOutcomes: 113,
      agentPerformance: {}, skillPerformance: { 'python-expert': perf },
      synergyMatrix: [{ pair: 'builder+python-expert', tasks: 113, successRate: 107 / 113, verdict: 'synergy' }],
      recentSprints: ['sprint-707'],
      skillSprintHistory: { 'python-expert': { 'sprint-707': { successCount: 107, failCount: 6, avgCoverage: 88 } } },
      evolvedRules: [{ entityType: 'skill', entityId: 'python-expert', status: 'auto-applied' }],
    }));

    const tracker = new OutcomeTracker(projectRoot);
    const learnings = tracker.getLearnings();
    expect(learnings.skillAttributionAuthority).toMatchObject({ mode: 'causal-receipt-v1' });
    expect(learnings.skillPerformance).toEqual({});
    expect(learnings.skillSprintHistory).toEqual({});
    expect(learnings.synergyMatrix).toEqual([]);
    expect(learnings.legacySkillQuarantine?.skillPerformance['python-expert']).toMatchObject({ totalTasks: 113 });
    expect(learnings.legacySkillQuarantine?.digest).toMatch(/^sha256:/);
    expect(new RuleEvolver(tracker, projectRoot).evolveRules().newRules).toEqual([]);
    expect(new PromotionPipeline(projectRoot).evaluatePromotions(tracker)).toEqual([]);
  });

  it('records an exposure outcome without populating skill performance', () => {
    const projectRoot = root();
    const tracker = new OutcomeTracker(projectRoot);
    tracker.recordOutcome({
      taskId: '708-001', sprintId: 'sprint-708', taskDNA: createDefaultTaskDNA(),
      agentId: 'builder', skillIds: [], skillExposureIds: ['python-expert'],
      skillAttributionState: 'EXPOSURE_ONLY', evaluation: 'DONE', coverage: 90,
      routingVersion: 'v3',
    });

    expect(tracker.getLearnings().skillPerformance).toEqual({});
    const outcomes = JSON.parse(readFileSync(
      join(projectRoot, '.deckent', 'routing', 'outcomes', 'sprint-708.json'), 'utf8',
    ));
    expect(outcomes[0]).toMatchObject({
      skillIds: [], skillExposureIds: ['python-expert'], skillAttributionState: 'EXPOSURE_ONLY',
    });
  });

  it('never re-injects legacy co-exposure outcomes through worst-combination planner input', () => {
    const projectRoot = root();
    const routingDir = join(projectRoot, '.deckent', 'routing');
    const outcomesDir = join(routingDir, 'outcomes');
    mkdirSync(outcomesDir, { recursive: true });
    writeFileSync(join(routingDir, 'learnings.json'), JSON.stringify({
      version: 1,
      updatedAt: '2026-08-28T00:00:00.000Z',
      totalOutcomes: 3,
      agentPerformance: {},
      skillPerformance: {},
      synergyMatrix: [],
      recentSprints: ['sprint-707'],
      skillSprintHistory: {},
      evolvedRules: [],
    }));
    writeFileSync(join(outcomesDir, 'sprint-707.json'), JSON.stringify(
      Array.from({ length: 3 }, (_, index) => ({
        taskId: `707-00${index + 1}`,
        sprintId: 'sprint-707',
        taskDNA: createDefaultTaskDNA(),
        agentId: 'builder',
        skillIds: ['python-expert'],
        evaluation: 'NO_GO',
        routingVersion: 'v2',
      })),
    ));

    expect(new OutcomeTracker(projectRoot).getWorstCombinations()).toBe('');
  });
});
