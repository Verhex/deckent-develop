// Sprint 169.5 P0 — Spurious NO_GO Cascade Prevention (TDD red-green)
//
// Replicates Sprint 169 169-001 forensic scenario:
//   - bug-fixer agent task with coverage:null + .tasks/task-${id}.plan in filesChanged
//   - Worker did high-quality work (rubricScores 95+, testsPassed=true, linesAdded=309)
//   - Spurious NO_GO cascade tetiklendi (schema gate + honest-gate çift downgrade)
//
// Two architectural fixes:
//   Bug 1B: honest-gate must allow .tasks/task-${id}.{plan,result,hb} (worker protocol)
//   Bug 1A: schema gate must relax coverage:null for bug-fixer/security-auditor/architect agents

import { describe, it, expect } from 'vitest';
import {
  enforceHonestResultGate,
  validateResultSchema,
  evaluateWithRubric,
} from '../../src/orchestra/result-evaluator.js';
import type { Task, TaskResult } from '../../src/core/task-types.js';

function bugFixTask(id = '169-001', overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: 'W3.1 C0c Collision Detection Investigation + Fix',
    description: 'Bug investigation + fix — bug-fixer agent',
    model: 'opus',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test bootstrap',
    scope: {
      directories: ['src/orchestra/', 'tests/orchestra/'],
      filesRead: [],
      filesWrite: [
        'src/orchestra/sprint-spawner.ts',
        'tests/orchestra/c0c-collision-live-fire.test.ts',
      ],
    },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'EXECUTING',
    assignedAgent: 'bug-fixer',
    ...overrides,
  };
}

function workerResult(id = '169-001', overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: id,
    workerId: `w-${id}`,
    filesChanged: [
      'src/orchestra/sprint-spawner.ts',
      'tests/orchestra/c0c-collision-live-fire.test.ts',
      `.tasks/task-${id}.plan`,
    ],
    linesAdded: 309,
    linesRemoved: 1,
    testsPassed: true,
    coverage: null as unknown as number,
    selfAssessment: 'DONE',
    notes: 'Bug fix complete. tsc clean. tests pass.',
    rubricScores: {
      correctness: 95,
      test_coverage: 95,
      scope_compliance: 100,
      documentation: 90,
    },
    ...overrides,
  } as TaskResult;
}

describe('Sprint 169.5 P0 — Spurious NO_GO Cascade Prevention', () => {
  describe('Bug 1B — honest-gate allows worker protocol files', () => {
    it('.tasks/task-${id}.plan in filesChanged is NOT a boundary violation', () => {
      const task = bugFixTask('169-001');
      const result = workerResult('169-001');

      const gate = enforceHonestResultGate(result, task);

      expect(gate.honest).toBe(true);
      expect(gate.violation).toBeUndefined();
      expect(gate.result.selfAssessment).toBe('DONE');
    });

    it('.tasks/task-${id}.result protocol file is allowed', () => {
      const task = bugFixTask('169-002');
      const result = workerResult('169-002', {
        filesChanged: [
          'src/orchestra/task-builder.ts',
          '.tasks/task-169-002.plan',
          '.tasks/task-169-002.result',
        ],
      });

      const gate = enforceHonestResultGate(result, task);

      expect(gate.honest).toBe(true);
    });

    it('.tasks/task-${id}.hb protocol file is allowed', () => {
      const task = bugFixTask('169-003');
      const result = workerResult('169-003', {
        filesChanged: [
          'src/orchestra/sprint-spawner.ts',
          '.tasks/task-169-003.hb',
        ],
      });

      const gate = enforceHonestResultGate(result, task);

      expect(gate.honest).toBe(true);
    });

    it('still flags non-protocol .tasks/ files as boundary violations', () => {
      const task = bugFixTask('169-001');
      const result = workerResult('169-001', {
        filesChanged: [
          'src/orchestra/sprint-spawner.ts',
          '.tasks/random-unauthorized-file.txt',
        ],
      });

      const gate = enforceHonestResultGate(result, task);

      expect(gate.honest).toBe(false);
      expect(gate.violation).toBe('BOUNDARY_VIOLATION');
    });

    it('still flags out-of-scope source files as boundary violations', () => {
      const task = bugFixTask('169-001');
      const result = workerResult('169-001', {
        filesChanged: [
          'src/orchestra/sprint-spawner.ts',
          'src/cli/main.ts',
        ],
      });

      const gate = enforceHonestResultGate(result, task);

      expect(gate.honest).toBe(false);
      expect(gate.violation).toBe('BOUNDARY_VIOLATION');
    });
  });

  describe('Bug 1A — schema gate relaxes coverage for non-code-dev agents', () => {
    it('bug-fixer task with coverage:null does NOT fail schema validation', () => {
      const task = bugFixTask('169-001');
      const result = workerResult('169-001');

      const schema = validateResultSchema(result, task);

      expect(schema.valid).toBe(true);
      expect(schema.missingFields).not.toContain('coverage');
    });

    it('security-auditor task with coverage:null is accepted', () => {
      const task = bugFixTask('169-005', { assignedAgent: 'security-auditor' });
      const result = workerResult('169-005');

      const schema = validateResultSchema(result, task);

      expect(schema.valid).toBe(true);
    });

    it('architect task with coverage:null is accepted', () => {
      const task = bugFixTask('169-009', { assignedAgent: 'architect' });
      const result = workerResult('169-009');

      const schema = validateResultSchema(result, task);

      expect(schema.valid).toBe(true);
    });

    it('generic code-development task without exempt agent still requires coverage', () => {
      const task = bugFixTask('169-100', { assignedAgent: 'generic' });
      const result = workerResult('169-100');

      const schema = validateResultSchema(result, task);

      expect(schema.valid).toBe(false);
      expect(schema.missingFields).toContain('coverage');
    });
  });

  describe('End-to-end — Sprint 169 169-001 cascade NOT triggered', () => {
    it('bug-fixer task with coverage:null AND .tasks/*.plan → NOT NO_GO (cascade prevented)', () => {
      const task = bugFixTask('169-001');
      const result = workerResult('169-001');

      const gate = enforceHonestResultGate(result, task);
      expect(gate.honest).toBe(true);

      const evaluation = evaluateWithRubric(gate.result, task);

      // Primary contract: spurious NO_GO eradicated. DONE or GO_WITH_TECH_DEBT both
      // mean "no fix worker spawn, no cascade" — the regression we are fixing.
      expect(evaluation.decision).not.toBe('NO_GO');
      expect(['DONE', 'GO_WITH_TECH_DEBT']).toContain(evaluation.decision);
      expect(evaluation.totalScore).toBeGreaterThan(0);
    });
  });
});
