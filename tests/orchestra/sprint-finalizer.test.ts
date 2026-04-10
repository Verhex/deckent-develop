/**
 * tests/orchestra/sprint-finalizer.test.ts
 *
 * Tests for the extracted sprint-finalizer module.
 * Covers: hook stubs (runHonestyCheck, writeRubricDetail, runSelfAuditGate),
 *         FinalizeSprintOptions type, SelfAuditResult type.
 */

import { describe, it, expect, vi } from 'vitest';
import { TaskEvaluation } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '' }),
}));

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return {
    ...actual,
    parseDebtTable: vi.fn().mockReturnValue([]),
    updateLastSprintId: vi.fn(),
    debugLog: vi.fn(),
  };
});

vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  writeRetrospective: vi.fn(),
  writeSprintLog: vi.fn(),
  calculateMetrics: vi.fn().mockReturnValue({
    totalTasks: 1,
    completedTasks: 1,
    techDebtTasks: 0,
    noGoTasks: 0,
    durationMs: 1000,
    coverage: 95,
  }),
  updateProjectDocs: vi.fn(),
  updateProjectIdentity: vi.fn(),
  buildAgentPerformance: vi.fn().mockReturnValue([]),
  archiveDirectives: vi.fn(),
}));

vi.mock('../../src/orchestra/result-evaluator.js', () => ({
  getRecentSprintStats: vi.fn().mockReturnValue({
    sprintCount: 0,
    avgNoGoRate: 0,
    avgCoverage: 80,
  }),
}));

vi.mock('../../src/orchestra/result-collector.js', () => ({
  buildResultsMap: vi.fn().mockReturnValue(new Map()),
}));

vi.mock('../../src/orchestra/debt-manager.js', () => ({
  runDecay: vi.fn(),
}));

vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({
    loadAgents: vi.fn().mockReturnValue(new Map()),
    updateAgentStats: vi.fn(),
    getAgent: vi.fn(),
    saveAgent: vi.fn(),
  })),
}));

vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({
    loadSkills: vi.fn().mockReturnValue(new Map()),
    updateSkillStats: vi.fn(),
    getSkill: vi.fn(),
    saveSkill: vi.fn(),
  })),
}));

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn(),
  loadPluginHooks: vi.fn(),
  clearHooks: vi.fn(),
}));

vi.mock('../../src/orchestra/sprint-utils.js', () => ({
  readFileSafe: vi.fn().mockReturnValue(''),
  now: vi.fn().mockReturnValue('2026-04-10T12:00:00Z'),
}));

vi.mock('../../src/cli/helpers/sprint-summary-rich.js', () => ({
  formatRichSprintSummary: vi.fn().mockReturnValue(null),
}));

import {
  runHonestyCheck,
  writeRubricDetail,
  runSelfAuditGate,
} from '../../src/orchestra/sprint-finalizer.js';
import type { FinalizeSprintOptions, SelfAuditResult } from '../../src/orchestra/sprint-finalizer.js';

describe('sprint-finalizer — hook stubs', () => {
  describe('runHonestyCheck', () => {
    it('should return 0 violations (stub)', async () => {
      const result = await runHonestyCheck('/tmp/project', 'sprint-134', []);
      expect(result).toBe(0);
    });

    it('should be call-safe with any arguments', async () => {
      const result = await runHonestyCheck('/tmp/project', 'sprint-999', [
        { taskId: 't1', workerId: 'w1', filesChanged: [], linesAdded: 0, linesRemoved: 0, testsPassed: true, coverage: 95, selfAssessment: 'DONE', notes: '' },
      ]);
      expect(result).toBe(0);
    });
  });

  describe('writeRubricDetail', () => {
    it('should return false when no results have rubric scores', async () => {
      const evaluations = new Map<string, TaskEvaluation>();
      const results = [
        { taskId: 't1', workerId: 'w1', filesChanged: [], linesAdded: 0, linesRemoved: 0, testsPassed: true, coverage: 95, selfAssessment: 'DONE' as const, notes: '' },
      ];
      const result = await writeRubricDetail('/tmp/project', 'sprint-134', results, evaluations);
      expect(result).toBe(false);
    });

    it('should return false for empty results', async () => {
      const evaluations = new Map<string, TaskEvaluation>();
      const result = await writeRubricDetail('/tmp/project', 'sprint-134', [], evaluations);
      expect(result).toBe(false);
    });
  });

  describe('runSelfAuditGate', () => {
    it('should return all-PASS result (stub)', async () => {
      const result = await runSelfAuditGate('sprint-134');
      expect(result.overallGate).toBe('PASS');
      expect(result.tsc.status).toBe('PASS');
      expect(result.vitest.status).toBe('PASS');
      expect(result.honesty.violations).toBe(0);
    });

    it('should have correct SelfAuditResult shape', async () => {
      const result: SelfAuditResult = await runSelfAuditGate('sprint-134', '/tmp/project');
      expect(result).toHaveProperty('tsc');
      expect(result).toHaveProperty('vitest');
      expect(result).toHaveProperty('honesty');
      expect(result).toHaveProperty('observability');
      expect(result).toHaveProperty('overallGate');
      expect(result.tsc.errors).toEqual([]);
      expect(result.honesty.flaggedTasks).toEqual([]);
    });
  });

  describe('FinalizeSprintOptions type', () => {
    it('should accept valid options', () => {
      const opts: FinalizeSprintOptions = {
        skipDecay: true,
        skipHooks: false,
      };
      expect(opts.skipDecay).toBe(true);
    });
  });
});
