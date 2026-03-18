/**
 * Brain Sub-Module Integration Test
 *
 * Verifies that brain.ts correctly re-exports from sub-modules:
 *   - model-selector.ts
 *   - task-builder.ts
 *   - debt-manager.ts
 *   - sprint-reporter.ts
 *
 * All re-exports from brain.ts must match direct imports from sub-modules.
 */
import { describe, it, expect, vi } from 'vitest';

// ─── Mocks required by brain.ts transitive imports ─────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({
    status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
  }),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn().mockReturnValue([]),
  startAuditor: vi.fn(),
  attach: vi.fn(),
  destroy: vi.fn(),
  isSessionActive: vi.fn().mockReturnValue(false),
  sendKeys: vi.fn(),
  TmuxError: class extends Error { constructor(m: string) { super(m); } },
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  resetDashboard: vi.fn(),
  updateDashboard: vi.fn(),
  detectDeadlocks: vi.fn().mockReturnValue([]),
  startScanLoop: vi.fn(),
  writeScanToDashboard: vi.fn(),
}));

vi.mock('../../src/agents/worker.js', () => ({
  releaseAllLocks: vi.fn(),
  updateTaskStatus: vi.fn(),
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
  writeResult: vi.fn(),
}));

// ─── Direct sub-module imports ──────────────────────────────────────

import * as modelSelector from '../../src/orchestra/model-selector.js';
import * as taskBuilder from '../../src/orchestra/task-builder.js';
import * as debtManager from '../../src/orchestra/debt-manager.js';
import * as sprintReporter from '../../src/orchestra/sprint-reporter.js';

// ─── Brain re-exports ───────────────────────────────────────────────

import {
  calculateModelScore,
  inferModelFromDirective,
  resolveTaskModel,
  createTask,
  extractScopeFromDirective,
  parseStructuredDirectives,
  buildWorkerPrompt,
  plannerTaskToParams,
  handleEvaluation,
  handleCrossDependencies,
  escalateDebt,
  resolveDebt,
  runDecay,
  decay,
  trimMemoryWithHeader,
  writeRetrospective,
  writeSprintLog,
  calculateMetrics,
  updateProjectDocs,
} from '../../src/orchestra/brain.js';

// ═══ Tests ════════════════════════════════════════════════════════════

describe('brain sub-module integration — re-exports match direct imports', () => {

  // ─── model-selector.ts ─────────────────────────────────────────────

  describe('model-selector.ts exports accessible from brain.ts', () => {
    it('calculateModelScore is the same function', () => {
      expect(calculateModelScore).toBe(modelSelector.calculateModelScore);
    });

    it('inferModelFromDirective is the same function', () => {
      expect(inferModelFromDirective).toBe(modelSelector.inferModelFromDirective);
    });

    it('resolveTaskModel is the same function', () => {
      expect(resolveTaskModel).toBe(modelSelector.resolveTaskModel);
    });

    it('calculateModelScore returns consistent results via both paths', () => {
      const scope = { directories: ['src/', 'tests/'], filesRead: [], filesWrite: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'] };
      const directScore = modelSelector.calculateModelScore('refactor brain', 'cross-cutting refactor', scope);
      const reExportScore = calculateModelScore('refactor brain', 'cross-cutting refactor', scope);
      expect(reExportScore).toBe(directScore);
    });

    it('inferModelFromDirective returns consistent results via both paths', () => {
      const scope = { directories: ['docs/'], filesRead: [], filesWrite: ['docs/README.md'] };
      const directModel = modelSelector.inferModelFromDirective('update docs', 'doc update', scope);
      const reExportModel = inferModelFromDirective('update docs', 'doc update', scope);
      expect(reExportModel).toBe(directModel);
    });
  });

  // ─── task-builder.ts ───────────────────────────────────────────────

  describe('task-builder.ts exports accessible from brain.ts', () => {
    it('createTask is the same function', () => {
      expect(createTask).toBe(taskBuilder.createTask);
    });

    it('extractScopeFromDirective is the same function', () => {
      expect(extractScopeFromDirective).toBe(taskBuilder.extractScopeFromDirective);
    });

    it('parseStructuredDirectives is the same function', () => {
      expect(parseStructuredDirectives).toBe(taskBuilder.parseStructuredDirectives);
    });

    it('buildWorkerPrompt is the same function', () => {
      expect(buildWorkerPrompt).toBe(taskBuilder.buildWorkerPrompt);
    });

    it('plannerTaskToParams is the same function', () => {
      expect(plannerTaskToParams).toBe(taskBuilder.plannerTaskToParams);
    });

    it('createTask produces identical output via both paths', () => {
      const params = {
        title: 'Test Task',
        description: 'A test',
        model: 'sonnet' as const,
        effort: 'normal' as const,
        priority: 'NORMAL' as const,
        reason: 'test',
        scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
        dependencies: [],
        goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
        sprintId: 'sprint-099',
      };
      const directTask = taskBuilder.createTask(params, 1);
      const reExportTask = createTask(params, 1);
      // Same structure (createdAt will differ slightly)
      expect(reExportTask.id).toBe(directTask.id);
      expect(reExportTask.title).toBe(directTask.title);
      expect(reExportTask.sprintId).toBe(directTask.sprintId);
    });
  });

  // ─── debt-manager.ts ───────────────────────────────────────────────

  describe('debt-manager.ts exports accessible from brain.ts', () => {
    it('handleEvaluation is the same function', () => {
      expect(handleEvaluation).toBe(debtManager.handleEvaluation);
    });

    it('handleCrossDependencies is the same function', () => {
      expect(handleCrossDependencies).toBe(debtManager.handleCrossDependencies);
    });

    it('escalateDebt is the same function', () => {
      expect(escalateDebt).toBe(debtManager.escalateDebt);
    });

    it('resolveDebt is the same function', () => {
      expect(resolveDebt).toBe(debtManager.resolveDebt);
    });

    it('runDecay is the same function', () => {
      expect(runDecay).toBe(debtManager.runDecay);
    });

    it('decay is the same function', () => {
      expect(decay).toBe(debtManager.decay);
    });
  });

  // ─── sprint-reporter.ts ───────────────────────────────────────────

  describe('sprint-reporter.ts exports accessible from brain.ts', () => {
    it('trimMemoryWithHeader is the same function', () => {
      expect(trimMemoryWithHeader).toBe(sprintReporter.trimMemoryWithHeader);
    });

    it('writeRetrospective is the same function', () => {
      expect(writeRetrospective).toBe(sprintReporter.writeRetrospective);
    });

    it('writeSprintLog is the same function', () => {
      expect(writeSprintLog).toBe(sprintReporter.writeSprintLog);
    });

    it('calculateMetrics is the same function', () => {
      expect(calculateMetrics).toBe(sprintReporter.calculateMetrics);
    });

    it('updateProjectDocs is the same function', () => {
      expect(updateProjectDocs).toBe(sprintReporter.updateProjectDocs);
    });

    it('trimMemoryWithHeader produces identical results via both paths', () => {
      const lines = Array.from({ length: 120 }, (_, i) => `line ${i}`);
      const direct = sprintReporter.trimMemoryWithHeader(lines, 50);
      const reExport = trimMemoryWithHeader(lines, 50);
      expect(reExport).toBe(direct);
    });
  });

  // ─── cross-module behavior ─────────────────────────────────────────

  describe('cross-module behavior', () => {
    it('model-selector + task-builder: resolveTaskModel output used in createTask', () => {
      const scope = { directories: ['src/'], filesRead: [], filesWrite: [] };
      const config = {
        mode: 'max_plan',
        activeModeConfig: {
          max_workers: 8,
          brain_model: 'opus' as const,
          default_model: 'sonnet' as const,
          haiku_allowed: true,
          usage_thresholds: { '5hr': 0.8, weekly: 0.6 },
          brain_planning: 'auto' as const,
        },
        modes: {} as any,
        language: 'en',
        projectName: 'test',
        projectRoot: '/tmp/test',
        version: '1.0.0',
        auto_docs: { tier1: true, tier2: true, tier3: false },
      };
      const usage = { fiveHourPercent: 10, weeklyPercent: 10, measuredAt: '' };
      const model = resolveTaskModel('Test task', 'a test', scope, config, usage);
      const task = createTask({
        title: 'Test task',
        description: 'a test',
        model,
        effort: 'normal',
        priority: 'NORMAL',
        reason: 'test',
        scope,
        dependencies: [],
        goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
        sprintId: 'sprint-001',
      }, 1);
      expect(task.model).toBe(model);
      expect(['opus', 'sonnet', 'haiku']).toContain(task.model);
    });

    it('all exported functions are actual functions', () => {
      const fns = [
        calculateModelScore, inferModelFromDirective, resolveTaskModel,
        createTask, extractScopeFromDirective, parseStructuredDirectives,
        buildWorkerPrompt, plannerTaskToParams,
        handleEvaluation, handleCrossDependencies, escalateDebt, resolveDebt, runDecay, decay,
        trimMemoryWithHeader, writeRetrospective, writeSprintLog, calculateMetrics, updateProjectDocs,
      ];
      for (const fn of fns) {
        expect(typeof fn).toBe('function');
      }
    });
  });
});
