// ─── Temp Agent Underperformer Demote Tests ──────────────────────────────────
// Verifies the underperformer demotion threshold:
//   successRate < 0.65 && totalTasks >= 20 → demote (OR with existing maxFailRate)

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PromotionPipeline } from '../../src/orchestra/promotion-pipeline.js';
import type { OutcomeTracker, EntityPerformance } from '../../src/orchestra/outcome-tracker.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePerf(successRate: number, totalTasks: number): EntityPerformance {
  const successCount = Math.round(totalTasks * successRate);
  return {
    totalTasks,
    successCount,
    failCount: totalTasks - successCount,
    successRate,
    avgQualityScore: 70,
    qualityTaskCount: totalTasks,
    byIntent: {},
  };
}

function makeTracker(agentPerformance: Record<string, EntityPerformance>): OutcomeTracker {
  return {
    getLearnings: () => ({
      version: 1,
      updatedAt: new Date().toISOString(),
      totalOutcomes: 0,
      agentPerformance,
      skillPerformance: {},
    }),
  } as unknown as OutcomeTracker;
}

function writeTempAgentManifest(root: string, agentId: string, source: 'builtin' | 'temp' | 'user'): void {
  const dir = join(root, '.deckent', 'agents', agentId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'agent.json'),
    JSON.stringify({ id: agentId, name: agentId, source, enabled: true }),
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PromotionPipeline — underperformer demote threshold', () => {
  let tmpDir: string;

  function setupTmpDir(): string {
    tmpDir = mkdtempSync(join(tmpdir(), 'demote-test-'));
    return tmpDir;
  }

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('60% success rate @ 120 tasks → demoted as underperformer', () => {
    const root = setupTmpDir();
    writeTempAgentManifest(root, 'temp-react-ts-specialist', 'temp');

    const pipeline = new PromotionPipeline(root);
    const tracker = makeTracker({ 'temp-react-ts-specialist': makePerf(0.60, 120) });

    const results = pipeline.evaluateDemotions(tracker);

    expect(results.length).toBeGreaterThanOrEqual(1);
    const demote = results.find(r => r.entityId === 'temp-react-ts-specialist');
    expect(demote).toBeDefined();
    expect(demote!.action).toBe('demote');
    expect(demote!.reason).toMatch(/[Uu]nderperform|60%|60 %/);
  });

  it('85% success rate @ 120 tasks → NOT demoted', () => {
    const root = setupTmpDir();
    writeTempAgentManifest(root, 'good-agent', 'temp');

    const pipeline = new PromotionPipeline(root);
    const tracker = makeTracker({ 'good-agent': makePerf(0.85, 120) });

    const results = pipeline.evaluateDemotions(tracker);

    const demote = results.find(r => r.entityId === 'good-agent' && r.action === 'demote');
    expect(demote).toBeUndefined();
  });

  it('built-in agent is never demoted even with 60% success @ 120 tasks', () => {
    const root = setupTmpDir();
    writeTempAgentManifest(root, 'refactorer', 'builtin');

    const pipeline = new PromotionPipeline(root);
    const tracker = makeTracker({ 'refactorer': makePerf(0.60, 120) });

    const results = pipeline.evaluateDemotions(tracker);

    const demote = results.find(r => r.entityId === 'refactorer' && r.action === 'demote');
    expect(demote).toBeUndefined();
  });

  it('60% success rate @ 5 tasks (< 20) → NOT demoted (too few tasks)', () => {
    const root = setupTmpDir();
    writeTempAgentManifest(root, 'new-agent', 'temp');

    const pipeline = new PromotionPipeline(root);
    const tracker = makeTracker({ 'new-agent': makePerf(0.60, 5) });

    const results = pipeline.evaluateDemotions(tracker);

    const demote = results.find(r => r.entityId === 'new-agent' && r.action === 'demote');
    expect(demote).toBeUndefined();
  });

  it('exactly 65% success rate @ 20 tasks → NOT demoted (threshold is strictly < 0.65)', () => {
    const root = setupTmpDir();
    writeTempAgentManifest(root, 'borderline-agent', 'temp');

    const pipeline = new PromotionPipeline(root);
    const tracker = makeTracker({ 'borderline-agent': makePerf(0.65, 20) });

    const results = pipeline.evaluateDemotions(tracker);

    const demote = results.find(r => r.entityId === 'borderline-agent' && r.action === 'demote');
    expect(demote).toBeUndefined();
  });
});
