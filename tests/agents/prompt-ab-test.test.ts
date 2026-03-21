import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PromptABTester } from '../../src/agents/prompt-ab-test.js';
import type { Experiment, ExperimentAnalysis } from '../../src/agents/prompt-ab-test.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';

// ─── Helpers ────────────────────────────────────────────────────────

let tmpDir: string;

function setup(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-ab-'));
  return dir;
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('PromptABTester', () => {
  beforeEach(() => {
    tmpDir = setup();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  // ─── createExperiment ──────────────────────────────────────────

  describe('createExperiment', () => {
    it('creates an experiment with correct fields', () => {
      const tester = new PromptABTester(tmpDir);
      const exp = tester.createExperiment('agent-1', 'Prompt A content', 'Prompt B content');
      expect(exp.id).toBeTruthy();
      expect(exp.agentId).toBe('agent-1');
      expect(exp.variantA).toBe('Prompt A content');
      expect(exp.variantB).toBe('Prompt B content');
      expect(exp.results).toEqual([]);
      expect(exp.status).toBe('active');
      expect(exp.createdAt).toBeTruthy();
    });

    it('persists experiment to disk', () => {
      const tester = new PromptABTester(tmpDir);
      const exp = tester.createExperiment('agent-1', 'A', 'B');
      const dir = path.join(tmpDir, '.deckent', 'experiments', 'agent-1');
      expect(fs.existsSync(dir)).toBe(true);
      const files = fs.readdirSync(dir);
      expect(files.length).toBe(1);
      expect(files[0]).toContain('.json');
    });

    it('throws if agent already has active experiment', () => {
      const tester = new PromptABTester(tmpDir);
      tester.createExperiment('agent-1', 'A', 'B');
      expect(() => tester.createExperiment('agent-1', 'C', 'D')).toThrow('already has an active experiment');
    });

    it('allows experiment for different agents', () => {
      const tester = new PromptABTester(tmpDir);
      const exp1 = tester.createExperiment('agent-1', 'A', 'B');
      const exp2 = tester.createExperiment('agent-2', 'C', 'D');
      expect(exp1.agentId).toBe('agent-1');
      expect(exp2.agentId).toBe('agent-2');
    });
  });

  // ─── getActiveExperiment ───────────────────────────────────────

  describe('getActiveExperiment', () => {
    it('returns null when no experiments exist', () => {
      const tester = new PromptABTester(tmpDir);
      expect(tester.getActiveExperiment('agent-1')).toBeNull();
    });

    it('returns active experiment', () => {
      const tester = new PromptABTester(tmpDir);
      const exp = tester.createExperiment('agent-1', 'A', 'B');
      const active = tester.getActiveExperiment('agent-1');
      expect(active).not.toBeNull();
      expect(active!.id).toBe(exp.id);
    });

    it('returns null after experiment is completed', () => {
      const tester = new PromptABTester(tmpDir);
      const exp = tester.createExperiment('agent-1', 'A', 'B');
      tester.completeExperiment(exp.id);
      expect(tester.getActiveExperiment('agent-1')).toBeNull();
    });
  });

  // ─── assignVariant ─────────────────────────────────────────────

  describe('assignVariant', () => {
    it('returns A or B', () => {
      const tester = new PromptABTester(tmpDir);
      const exp = tester.createExperiment('agent-1', 'A', 'B');
      const variant = tester.assignVariant(exp.id);
      expect(['A', 'B']).toContain(variant);
    });

    it('distributes approximately 50/50 over many calls', () => {
      const tester = new PromptABTester(tmpDir);
      const exp = tester.createExperiment('agent-1', 'A', 'B');
      let aCount = 0;
      let bCount = 0;
      for (let i = 0; i < 100; i++) {
        const variant = tester.assignVariant(exp.id);
        if (variant === 'A') aCount++;
        else bCount++;
      }
      // Allow wide margin for randomness
      expect(aCount).toBeGreaterThan(20);
      expect(bCount).toBeGreaterThan(20);
    });
  });

  // ─── recordResult ──────────────────────────────────────────────

  describe('recordResult', () => {
    it('records a result for variant A', () => {
      const tester = new PromptABTester(tmpDir);
      const exp = tester.createExperiment('agent-1', 'A', 'B');
      tester.recordResult(exp.id, 'A', 'DONE', 90, 'sprint-001');
      const updated = tester.getExperiment(exp.id);
      expect(updated!.results.length).toBe(1);
      expect(updated!.results[0]!.variant).toBe('A');
      expect(updated!.results[0]!.evaluation).toBe('DONE');
    });

    it('records multiple results', () => {
      const tester = new PromptABTester(tmpDir);
      const exp = tester.createExperiment('agent-1', 'A', 'B');
      tester.recordResult(exp.id, 'A', 'DONE', 85, 'sprint-001');
      tester.recordResult(exp.id, 'B', 'NO_GO', 30, 'sprint-001');
      tester.recordResult(exp.id, 'A', 'DONE', 90, 'sprint-002');
      const updated = tester.getExperiment(exp.id);
      expect(updated!.results.length).toBe(3);
    });

    it('throws for non-existent experiment', () => {
      const tester = new PromptABTester(tmpDir);
      expect(() => tester.recordResult('fake-id', 'A', 'DONE', 90, 'sprint-001')).toThrow('not found');
    });

    it('throws for completed experiment', () => {
      const tester = new PromptABTester(tmpDir);
      const exp = tester.createExperiment('agent-1', 'A', 'B');
      tester.completeExperiment(exp.id);
      expect(() => tester.recordResult(exp.id, 'A', 'DONE', 90, 'sprint-001')).toThrow('not active');
    });
  });

  // ─── analyzeExperiment ─────────────────────────────────────────

  describe('analyzeExperiment', () => {
    it('returns inconclusive with no results', () => {
      const tester = new PromptABTester(tmpDir);
      const exp = tester.createExperiment('agent-1', 'A', 'B');
      const analysis = tester.analyzeExperiment(exp.id);
      expect(analysis.winner).toBe('inconclusive');
      expect(analysis.sampleSize).toBe(0);
    });

    it('returns inconclusive with fewer than 4 samples', () => {
      const tester = new PromptABTester(tmpDir);
      const exp = tester.createExperiment('agent-1', 'A', 'B');
      tester.recordResult(exp.id, 'A', 'DONE', 90, 'sprint-001');
      tester.recordResult(exp.id, 'B', 'DONE', 80, 'sprint-001');
      tester.recordResult(exp.id, 'A', 'DONE', 95, 'sprint-002');
      const analysis = tester.analyzeExperiment(exp.id);
      expect(analysis.winner).toBe('inconclusive');
      expect(analysis.sampleSize).toBe(3);
    });

    it('declares winner A when A is significantly better', () => {
      const tester = new PromptABTester(tmpDir);
      const exp = tester.createExperiment('agent-1', 'A', 'B');
      tester.recordResult(exp.id, 'A', 'DONE', 95, 'sprint-001');
      tester.recordResult(exp.id, 'A', 'DONE', 90, 'sprint-001');
      tester.recordResult(exp.id, 'B', 'NO_GO', 20, 'sprint-002');
      tester.recordResult(exp.id, 'B', 'NO_GO', 15, 'sprint-002');
      const analysis = tester.analyzeExperiment(exp.id);
      expect(analysis.winner).toBe('A');
      expect(analysis.aStats.successRate).toBe(1);
      expect(analysis.bStats.successRate).toBe(0);
    });

    it('declares winner B when B is significantly better', () => {
      const tester = new PromptABTester(tmpDir);
      const exp = tester.createExperiment('agent-1', 'A', 'B');
      tester.recordResult(exp.id, 'A', 'NO_GO', 10, 'sprint-001');
      tester.recordResult(exp.id, 'A', 'NO_GO', 15, 'sprint-001');
      tester.recordResult(exp.id, 'B', 'DONE', 90, 'sprint-002');
      tester.recordResult(exp.id, 'B', 'DONE', 95, 'sprint-002');
      const analysis = tester.analyzeExperiment(exp.id);
      expect(analysis.winner).toBe('B');
    });

    it('computes aStats correctly', () => {
      const tester = new PromptABTester(tmpDir);
      const exp = tester.createExperiment('agent-1', 'A', 'B');
      tester.recordResult(exp.id, 'A', 'DONE', 80, 'sprint-001');
      tester.recordResult(exp.id, 'A', 'NO_GO', 40, 'sprint-002');
      tester.recordResult(exp.id, 'B', 'DONE', 90, 'sprint-001');
      tester.recordResult(exp.id, 'B', 'DONE', 85, 'sprint-002');
      const analysis = tester.analyzeExperiment(exp.id);
      expect(analysis.aStats.uses).toBe(2);
      expect(analysis.aStats.successRate).toBe(0.5);
      expect(analysis.aStats.avgCoverage).toBe(60);
      expect(analysis.bStats.uses).toBe(2);
      expect(analysis.bStats.successRate).toBe(1);
      expect(analysis.bStats.avgCoverage).toBe(87.5);
    });

    it('throws for non-existent experiment', () => {
      const tester = new PromptABTester(tmpDir);
      expect(() => tester.analyzeExperiment('fake-id')).toThrow('not found');
    });

    it('returns inconclusive when only one variant has data', () => {
      const tester = new PromptABTester(tmpDir);
      const exp = tester.createExperiment('agent-1', 'A', 'B');
      tester.recordResult(exp.id, 'A', 'DONE', 90, 'sprint-001');
      tester.recordResult(exp.id, 'A', 'DONE', 95, 'sprint-002');
      tester.recordResult(exp.id, 'A', 'DONE', 88, 'sprint-003');
      tester.recordResult(exp.id, 'A', 'DONE', 92, 'sprint-004');
      const analysis = tester.analyzeExperiment(exp.id);
      expect(analysis.winner).toBe('inconclusive');
    });

    it('computes confidencePercent', () => {
      const tester = new PromptABTester(tmpDir);
      const exp = tester.createExperiment('agent-1', 'A', 'B');
      tester.recordResult(exp.id, 'A', 'DONE', 90, 'sprint-001');
      tester.recordResult(exp.id, 'A', 'DONE', 95, 'sprint-002');
      tester.recordResult(exp.id, 'B', 'NO_GO', 10, 'sprint-003');
      tester.recordResult(exp.id, 'B', 'NO_GO', 15, 'sprint-004');
      const analysis = tester.analyzeExperiment(exp.id);
      expect(analysis.confidencePercent).toBeGreaterThan(0);
    });
  });

  // ─── completeExperiment ────────────────────────────────────────

  describe('completeExperiment', () => {
    it('marks experiment as completed', () => {
      const tester = new PromptABTester(tmpDir);
      const exp = tester.createExperiment('agent-1', 'A', 'B');
      tester.completeExperiment(exp.id);
      const updated = tester.getExperiment(exp.id);
      expect(updated!.status).toBe('completed');
    });

    it('throws for non-existent experiment', () => {
      const tester = new PromptABTester(tmpDir);
      expect(() => tester.completeExperiment('fake-id')).toThrow('not found');
    });
  });

  // ─── getExperiment ─────────────────────────────────────────────

  describe('getExperiment', () => {
    it('returns null for non-existent experiment', () => {
      const tester = new PromptABTester(tmpDir);
      expect(tester.getExperiment('fake-id')).toBeNull();
    });

    it('returns experiment by id', () => {
      const tester = new PromptABTester(tmpDir);
      const exp = tester.createExperiment('agent-1', 'A', 'B');
      const found = tester.getExperiment(exp.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(exp.id);
    });
  });
});
