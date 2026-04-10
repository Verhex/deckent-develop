import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  cpSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync } from 'fs';
import { PromotionPipeline } from '../../src/orchestra/promotion-pipeline.js';
import type { EntityPerformance } from '../../src/orchestra/outcome-tracker.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockCpSync = vi.mocked(cpSync);
const mockReaddirSync = vi.mocked(readdirSync);

// ─── Helpers ────────────────────────────────────────────────────────

function makeMockTracker(agents: Record<string, EntityPerformance> = {}, skills: Record<string, EntityPerformance> = {}) {
  return {
    getLearnings: vi.fn().mockReturnValue({
      version: 1,
      updatedAt: '',
      totalOutcomes: 0,
      agentPerformance: agents,
      skillPerformance: skills,
      synergyMatrix: [],
      recentSprints: [],
    }),
    calculateBonuses: vi.fn().mockReturnValue([]),
    recordOutcome: vi.fn(),
    save: vi.fn(),
  } as any;
}

function makePerf(overrides: Partial<EntityPerformance> = {}): EntityPerformance {
  return {
    totalTasks: 10,
    successCount: 9,
    failCount: 1,
    successRate: 0.9,
    avgQualityScore: 80,
    qualityTaskCount: 10,
    byIntent: {},
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('PromotionPipeline', () => {
  let pipeline: PromotionPipeline;
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.restoreAllMocks();
    pipeline = new PromotionPipeline(projectRoot);
  });

  describe('promote', () => {
    it('should reject promotion of built-in agents', () => {
      // isBuiltIn checks for manifest with source: 'builtin'
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ source: 'builtin', id: 'test-writer' }));

      const result = pipeline.promote('test-writer', 'agent');

      expect(result).toBe(false);
      // Should NOT have called cpSync (no copy operation)
      expect(mockCpSync).not.toHaveBeenCalled();
    });

    it('should promote agent from persistent temp pool', () => {
      // isBuiltIn check → false (no manifest at permanent location)
      // Then existsSync for persistent temp dir → true
      // Then existsSync for manifest file → true
      mockExistsSync.mockImplementation((path: any) => {
        const p = String(path);
        if (p.includes('.deckent/agents/my-agent/agent.json')) return false; // not built-in
        if (p.includes('.deckent/agents/temp-my-agent')) return true;
        if (p.includes('temp-my-agent/agent.json')) return true;
        return false;
      });
      mockReadFileSync.mockReturnValue(JSON.stringify({ source: 'temp', id: 'temp-my-agent' }));

      const result = pipeline.promote('my-agent', 'agent');

      expect(result).toBe(true);
      expect(mockCpSync).toHaveBeenCalled();
      expect(mockMkdirSync).toHaveBeenCalled();
    });

    it('should return false when temp entity directory is not found', () => {
      mockExistsSync.mockReturnValue(false);

      const result = pipeline.promote('nonexistent-agent', 'agent');

      expect(result).toBe(false);
    });
  });

  describe('demote', () => {
    it('should reject demotion of built-in agents', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ source: 'builtin', id: 'security-auditor' }));

      const result = pipeline.demote('security-auditor', 'agent');

      expect(result).toBe(false);
    });

    it('should demote a non-built-in agent by setting enabled=false', () => {
      const manifestContent = { source: 'user', id: 'custom-agent', enabled: true };

      mockExistsSync.mockImplementation((path: any) => {
        const p = String(path);
        // isBuiltIn check → not built-in (source != 'builtin')
        if (p.endsWith('agent.json')) return true;
        return false;
      });
      mockReadFileSync.mockReturnValue(JSON.stringify(manifestContent));

      // isBuiltIn will read the manifest, see source: 'user', return false
      const result = pipeline.demote('custom-agent', 'agent');

      expect(result).toBe(true);
      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenContent = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string);
      expect(writtenContent.enabled).toBe(false);
      expect(writtenContent._demotedAt).toBeDefined();
    });

    it('should return false when manifest file does not exist', () => {
      // isBuiltIn → false (no manifest), then demote checks manifest too → false
      mockExistsSync.mockReturnValue(false);

      const result = pipeline.demote('ghost-agent', 'agent');

      expect(result).toBe(false);
    });
  });

  describe('evaluatePromotions', () => {
    it('should recommend promotion when criteria are met', () => {
      const perf = makePerf({ totalTasks: 10, successRate: 0.9 });
      const tracker = makeMockTracker({ 'my-custom-agent': perf });

      // isBuiltIn → false
      mockExistsSync.mockReturnValue(false);

      const results = pipeline.evaluatePromotions(tracker);

      expect(results.length).toBe(1);
      expect(results[0]!.action).toBe('promote');
      expect(results[0]!.entityId).toBe('my-custom-agent');
    });

    it('should recommend wait when task count is insufficient', () => {
      const perf = makePerf({ totalTasks: 3, successRate: 0.95 });
      const tracker = makeMockTracker({ 'new-agent': perf });

      mockExistsSync.mockReturnValue(false);

      const results = pipeline.evaluatePromotions(tracker);

      expect(results.length).toBe(1);
      expect(results[0]!.action).toBe('wait');
      expect(results[0]!.reason).toContain('more tasks');
    });

    it('should skip built-in agents in promotion evaluation', () => {
      const perf = makePerf({ totalTasks: 20, successRate: 0.95 });
      const tracker = makeMockTracker({ 'test-writer': perf });

      // isBuiltIn → true
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ source: 'builtin' }));

      const results = pipeline.evaluatePromotions(tracker);

      expect(results.length).toBe(0);
    });
  });

  describe('evaluateDemotions', () => {
    it('should recommend demotion when fail rate exceeds threshold', () => {
      const perf = makePerf({ totalTasks: 10, successRate: 0.4, failCount: 6, successCount: 4 });
      const tracker = makeMockTracker({ 'bad-agent': perf });

      // isBuiltIn → false
      mockExistsSync.mockReturnValue(false);

      const results = pipeline.evaluateDemotions(tracker);

      expect(results.length).toBe(1);
      expect(results[0]!.action).toBe('demote');
      expect(results[0]!.entityId).toBe('bad-agent');
      expect(results[0]!.reason).toContain('Fail rate');
    });
  });
});
