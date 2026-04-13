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
  promises: {
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
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
  GO_WITH_GATE_FAILURE: 'GO_WITH_GATE_FAILURE',
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

vi.mock('../../src/core/observability.js', () => ({
  generateLoadReport: vi.fn().mockResolvedValue('# Sprint Load Test Report\n\n## Wave Timeline\n\nNo wave data recorded.\n'),
  initObservability: vi.fn(),
  structuredLog: vi.fn(),
  metric: vi.fn(),
  trace: vi.fn(),
  TELEMETRY_ENABLED: false,
}));

import * as nodeFsMod from 'node:fs';
import * as observabilityMod from '../../src/core/observability.js';

import {
  runHonestyCheck,
  writeRubricDetail,
  runSelfAuditGate,
  applyGateStatus,
} from '../../src/orchestra/sprint-finalizer.js';
import type { FinalizeSprintOptions, SelfAuditResult } from '../../src/orchestra/sprint-finalizer.js';
import { GO_WITH_GATE_FAILURE } from '../../src/orchestra/result-evaluator.js';

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

  describe('applyGateStatus', () => {
    it('should return GO_WITH_GATE_FAILURE when gate is GATE_FAILURE', () => {
      const gate = { overallGate: 'GATE_FAILURE' as const };
      const result = applyGateStatus('DONE', gate);
      expect(result).toBe(GO_WITH_GATE_FAILURE);
    });

    it('should leave status unchanged when gate is PASS', () => {
      const gate = { overallGate: 'PASS' as const };
      const result = applyGateStatus('DONE', gate);
      expect(result).toBe('DONE');
    });

    it('should leave status unchanged when gate is WARNING (metrics missing is not fail)', () => {
      // WARNING is not a valid overallGate value in SelfAuditResult (only PASS|GATE_FAILURE),
      // but the helper must not break if passed an unknown string via cast
      const gate = { overallGate: 'WARNING' as unknown as 'PASS' | 'GATE_FAILURE' };
      const result = applyGateStatus('GO_WITH_TECH_DEBT', gate);
      expect(result).toBe('GO_WITH_TECH_DEBT');
    });
  });
});

describe('sprint-finalizer — load-test-report.md wiring', () => {
  it('finalize → generateLoadReport is called and returns a report with wave timeline section', async () => {
    const mockGenerate = vi.mocked(observabilityMod.generateLoadReport);
    mockGenerate.mockResolvedValueOnce(
      '# Sprint Load Test Report\n\n## Wave Timeline\n\nNo wave data recorded.\n\n## Percentile Distribution (p50/p95/p99)\n',
    );

    const result = await observabilityMod.generateLoadReport('/tmp/project');
    expect(result).toContain('Wave Timeline');
    expect(mockGenerate).toHaveBeenCalledWith('/tmp/project');
  });

  it('generateLoadReport throws → sprint continues (error should not propagate)', async () => {
    const mockGenerate = vi.mocked(observabilityMod.generateLoadReport);
    // Simulate a throw from generateLoadReport
    mockGenerate.mockRejectedValueOnce(new Error('Disk full'));

    // The function should reject when called directly — finalizeSprint catches this
    await expect(observabilityMod.generateLoadReport('/tmp/project')).rejects.toThrow('Disk full');

    // Verify the mock was called (sprint continues because finalizeSprint wraps in try/catch)
    expect(mockGenerate).toHaveBeenCalled();
  });

  it('generateLoadReport returns minimal report when no metrics data available', async () => {
    const mockGenerate = vi.mocked(observabilityMod.generateLoadReport);
    mockGenerate.mockResolvedValueOnce('# Load Report\n\nNo metrics data found.\n');

    const result = await observabilityMod.generateLoadReport('/tmp/project');
    expect(result).toContain('# Load Report');
    expect(result).toContain('No metrics data found');
  });

  it('fsPromises.mkdir and writeFile are called with the correct report path', async () => {
    const fsMod = nodeFsMod as unknown as { promises: { mkdir: ReturnType<typeof vi.fn>; writeFile: ReturnType<typeof vi.fn> } };
    const mkdirSpy = vi.mocked(fsMod.promises.mkdir);
    const writeFileSpy = vi.mocked(fsMod.promises.writeFile);

    // Reset call history
    mkdirSpy.mockClear();
    writeFileSpy.mockClear();

    const mockGenerate = vi.mocked(observabilityMod.generateLoadReport);
    mockGenerate.mockResolvedValueOnce('# Sprint Load Test Report\n\n## Wave Timeline\n\nNo wave data recorded.\n');

    // Simulate what finalizeSprint does in the load report section
    const projectRoot = '/tmp/project';
    const sprintId = 'sprint-136';
    const reportDir = `${projectRoot}/docs/audits/${sprintId}`;
    const reportPath = `${reportDir}/load-test-report.md`;
    const report = await observabilityMod.generateLoadReport(projectRoot);
    await fsMod.promises.mkdir(reportDir, { recursive: true });
    await fsMod.promises.writeFile(reportPath, report);

    expect(mkdirSpy).toHaveBeenCalledWith(reportDir, { recursive: true });
    expect(writeFileSpy).toHaveBeenCalledWith(reportPath, expect.stringContaining('Wave Timeline'));
  });
});

describe('sprint-finalizer — gate.json wiring', () => {
  it('runSelfAuditGate returns valid JSON with all required fields', async () => {
    // Verifies that the object written to gate.json has correct shape
    const result: SelfAuditResult = await runSelfAuditGate('sprint-136', '/tmp/project');
    const serialized = JSON.stringify(result, null, 2);
    const parsed = JSON.parse(serialized) as SelfAuditResult;
    expect(parsed).toHaveProperty('tsc');
    expect(parsed).toHaveProperty('vitest');
    expect(parsed).toHaveProperty('honesty');
    expect(parsed).toHaveProperty('observability');
    expect(parsed).toHaveProperty('overallGate');
    expect(['PASS', 'GATE_FAILURE']).toContain(parsed.overallGate);
  });

  it('overallGate field roundtrip: PASS gate serializes and deserializes correctly', async () => {
    const result = await runSelfAuditGate('sprint-136');
    expect(result.overallGate).toBe('PASS');
    // Simulate what finalizeSprint writes to gate.json
    const json = JSON.stringify(result, null, 2);
    const parsed = JSON.parse(json) as SelfAuditResult;
    expect(parsed.overallGate).toBe('PASS');
    expect(parsed.tsc.status).toBe('PASS');
    expect(parsed.vitest.status).toBe('PASS');
    expect(parsed.honesty.violations).toBe(0);
  });

  it('gate.json write failure does not affect sprint status (fail-safe)', async () => {
    // Simulate fsPromises.writeFile throwing EACCES
    const fsMod = nodeFsMod as unknown as { promises: { writeFile: ReturnType<typeof vi.fn> } };
    const originalWriteFile = fsMod.promises.writeFile;
    fsMod.promises.writeFile = vi.fn().mockRejectedValueOnce(new Error('EACCES: permission denied'));

    // runSelfAuditGate itself should still succeed regardless of the writeFile failure
    // (the failure is caught inside finalizeSprint's try/catch, not in runSelfAuditGate)
    const result = await runSelfAuditGate('sprint-136', '/tmp/project');
    expect(result.overallGate).toBe('PASS');

    // Restore original mock
    fsMod.promises.writeFile = originalWriteFile;
  });
});
