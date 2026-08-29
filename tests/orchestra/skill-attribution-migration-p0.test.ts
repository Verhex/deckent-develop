import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  applySkillAttributionMigration,
  inspectSkillAttributionMigration,
  prepareSkillAttributionMigration,
  SkillAttributionMigrationError,
} from '../../src/orchestra/skill-attribution-migration.js';
import { OutcomeTracker } from '../../src/orchestra/outcome-tracker.js';
import { persistCatalogStatsSkillAttributionCutover } from '../../src/orchestra/sprint-finalizer.js';

const roots: string[] = [];

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'deckent-skill-attribution-migration-'));
  roots.push(value);
  return value;
}

function writeJson(projectRoot: string, relative: string, value: unknown): void {
  const path = join(projectRoot, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('skill attribution P0 migration authority', () => {
  it('moves every legacy attribution namespace into digest-bound quarantine and replays one receipt', () => {
    const projectRoot = root();
    const performance = {
      totalTasks: 113, successCount: 107, failCount: 6, successRate: 107 / 113,
      avgQualityScore: 80, qualityTaskCount: 113,
      byIntent: { unknown: { tasks: 113, successRate: 107 / 113 } },
    };
    writeJson(projectRoot, '.deckent/routing/learnings.json', {
      version: 1, updatedAt: '2026-08-28T00:00:00.000Z', totalOutcomes: 113,
      agentPerformance: {}, skillPerformance: { 'python-expert': performance, testing: performance },
      skillSprintHistory: { 'python-expert': { 'sprint-707': { successCount: 107, failCount: 6, avgCoverage: 88 } } },
      synergyMatrix: [{ pair: 'builder+python-expert', tasks: 113, successRate: 107 / 113, verdict: 'synergy' }],
      evolvedRules: [
        { entityType: 'skill', entityId: 'python-expert', status: 'auto-applied' },
        { entityType: 'agent', entityId: 'builder', status: 'suggested' },
      ],
      recentSprints: ['sprint-707'],
    });
    writeJson(projectRoot, '.deckent/stats/catalog-stats.json', {
      agents: { builder: { totalUses: 39, successCount: 37 } },
      skills: { 'python-expert': { totalUses: 113, successCount: 107 } },
    });

    expect(inspectSkillAttributionMigration(projectRoot)).toMatchObject({
      state: 'READY',
      inventory: {
        learningsSkillIds: 2, learningsHistoryIds: 1, learningsSynergyRows: 1,
        learningsEvolvedSkillRules: 1, sidecarSkillIds: 1,
      },
    });
    const first = applySkillAttributionMigration(projectRoot);
    const replay = applySkillAttributionMigration(projectRoot);

    expect(replay).toEqual(first);
    expect(first).toMatchObject({ state: 'COMMITTED' });
    expect(first.receiptDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    const learnings = JSON.parse(readFileSync(
      join(projectRoot, '.deckent/routing/learnings.json'), 'utf8',
    ));
    expect(learnings.skillPerformance).toEqual({});
    expect(learnings.skillSprintHistory).toEqual({});
    expect(learnings.synergyMatrix).toEqual([]);
    expect(learnings.evolvedRules).toEqual([
      { entityType: 'agent', entityId: 'builder', status: 'suggested' },
    ]);
    expect(learnings.legacySkillQuarantine).toMatchObject({
      skillPerformance: { 'python-expert': performance, testing: performance },
      evolvedSkillRules: [{ entityType: 'skill', entityId: 'python-expert', status: 'auto-applied' }],
    });
    const stats = JSON.parse(readFileSync(
      join(projectRoot, '.deckent/stats/catalog-stats.json'), 'utf8',
    ));
    expect(stats.agents.builder).toMatchObject({ totalUses: 39, successCount: 37 });
    expect(stats.skills).toEqual({});
    expect(stats.legacySkillStatsQuarantine.skills['python-expert'])
      .toMatchObject({ totalUses: 113, successCount: 107 });
    expect(inspectSkillAttributionMigration(projectRoot).state).toBe('ALREADY_APPLIED');
  });

  it('holds malformed source bytes without overwriting or minting a receipt', () => {
    const projectRoot = root();
    const path = join(projectRoot, '.deckent', 'routing', 'learnings.json');
    mkdirSync(join(projectRoot, '.deckent', 'routing'), { recursive: true });
    writeFileSync(path, '{malformed', 'utf8');

    expect(inspectSkillAttributionMigration(projectRoot).state).toBe('HOLD');
    expect(() => applySkillAttributionMigration(projectRoot))
      .toThrow(SkillAttributionMigrationError);
    expect(readFileSync(path, 'utf8')).toBe('{malformed');
    expect(existsSync(join(
      projectRoot, '.deckent', 'routing', 'skill-attribution', 'cutover-v1.json',
    ))).toBe(false);
  });

  it('resumes from PREPARED after only the learnings projection was persisted', () => {
    const projectRoot = root();
    writeJson(projectRoot, '.deckent/routing/learnings.json', {
      version: 1, updatedAt: '2026-08-28T00:00:00.000Z', totalOutcomes: 3,
      agentPerformance: {}, skillPerformance: { 'python-expert': { totalTasks: 3 } },
      skillSprintHistory: {}, synergyMatrix: [], evolvedRules: [], recentSprints: [],
    });
    writeJson(projectRoot, '.deckent/stats/catalog-stats.json', {
      agents: {}, skills: { 'python-expert': { totalUses: 3, successCount: 3 } },
    });

    const prepared = prepareSkillAttributionMigration(projectRoot);
    expect(prepared).toMatchObject({ state: 'PREPARED', inventory: { sidecarSkillIds: 1 } });
    new OutcomeTracker(projectRoot).persistSkillAttributionCutover();

    const committed = applySkillAttributionMigration(projectRoot);
    expect(committed).toMatchObject({
      state: 'COMMITTED',
      sourceDigests: prepared.sourceDigests,
      inventory: prepared.inventory,
    });
    expect(inspectSkillAttributionMigration(projectRoot).state).toBe('ALREADY_APPLIED');
  });

  it('resumes from PREPARED after only the catalog-stats projection was persisted', () => {
    const projectRoot = root();
    writeJson(projectRoot, '.deckent/routing/learnings.json', {
      version: 1, updatedAt: '2026-08-28T00:00:00.000Z', totalOutcomes: 3,
      agentPerformance: {}, skillPerformance: { 'python-expert': { totalTasks: 3 } },
      skillSprintHistory: {}, synergyMatrix: [], evolvedRules: [], recentSprints: [],
    });
    writeJson(projectRoot, '.deckent/stats/catalog-stats.json', {
      agents: {}, skills: { 'python-expert': { totalUses: 3, successCount: 3 } },
    });

    const prepared = prepareSkillAttributionMigration(projectRoot);
    persistCatalogStatsSkillAttributionCutover(projectRoot, prepared.cutoverId);

    expect(applySkillAttributionMigration(projectRoot)).toMatchObject({ state: 'COMMITTED' });
    const learnings = JSON.parse(readFileSync(
      join(projectRoot, '.deckent/routing/learnings.json'), 'utf8',
    ));
    expect(learnings.skillAttributionAuthority).toMatchObject({ mode: 'causal-receipt-v1' });
  });

  it('holds an unexpected mutation after PREPARED and preserves the prepared receipt', () => {
    const projectRoot = root();
    writeJson(projectRoot, '.deckent/routing/learnings.json', {
      version: 1, agentPerformance: {}, skillPerformance: {}, skillSprintHistory: {},
      synergyMatrix: [], evolvedRules: [], recentSprints: [],
    });
    const prepared = prepareSkillAttributionMigration(projectRoot);
    writeJson(projectRoot, '.deckent/routing/learnings.json', {
      version: 1, unexpected: 'concurrent mutation', agentPerformance: {},
      skillPerformance: {}, skillSprintHistory: {}, synergyMatrix: [], evolvedRules: [],
      recentSprints: [],
    });

    expect(() => applySkillAttributionMigration(projectRoot))
      .toThrow(SkillAttributionMigrationError);
    const receipt = JSON.parse(readFileSync(
      join(projectRoot, '.deckent/routing/skill-attribution/cutover-v1.json'), 'utf8',
    ));
    expect(receipt).toMatchObject({ state: 'PREPARED', receiptDigest: prepared.receiptDigest });
  });
});
