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

    it('generic code-development task with source-only change (no tests) still requires coverage', () => {
      // Sprint 207 P0-1: the schema relaxation is now SIGNAL-based, not agent-based.
      // A generic-agent code task that wrote NO test file and reports coverage:null
      // is genuinely missing coverage → must still fail schema (anti-regression guard).
      const task = bugFixTask('169-100', { assignedAgent: 'generic' });
      const result = workerResult('169-100', {
        filesChanged: ['src/orchestra/sprint-spawner.ts', '.tasks/task-169-100.plan'],
      });

      const schema = validateResultSchema(result, task);

      expect(schema.valid).toBe(false);
      expect(schema.missingFields).toContain('coverage');
    });

    it('generic code-development task that wrote a test file is exempt (P0-1 signal-based)', () => {
      // The permanent fix: coverage:null is tolerated when the result shows new
      // test files, regardless of which agent ran it — this is what rescued the
      // Sprint 206 refactorer tasks that were false-NO_GO under the old allowlist.
      const task = bugFixTask('169-101', { assignedAgent: 'generic' });
      const result = workerResult('169-101'); // default filesChanged includes a .test. file

      const schema = validateResultSchema(result, task);

      expect(schema.valid).toBe(true);
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

// ─── Sprint 171 Bug A — schema gate testsPassed 2. spurious-NO_GO katmanı ───
//
// Sprint 171 self-audit mega-sprint forensic:
//   - 171-014 (devops-engineer) + 171-023 (doc-writer) audit-only task
//   - Worker raporu yazdı, .result'a testsPassed YAZMADI (audit task test
//     çalıştırmaz — Worker Contract "TDD YOK")
//   - coverage:null P0-1 ile relax oldu (coverageRelaxed=true) AMA
//     testsPassed guard'sız → schema NO_GO → Bug B reconcile etmedi
//   - decisionRationale: "Schema invalid: missing [Schema violation:
//     missing required fields [testsPassed]] (coverageRelaxed=true)"
//
// RC: validateResultSchema coverage'ı coverageOptional(task) ile guard'lıyor
// ama testsPassed'i etmiyor. İkisi de test-yürütme-bağımlı alan; audit/non-code
// task ikisini de legit atlar. Fix: testsPassed'i AYNI guard altına al (alan-alan
// yama değil, test-yürütme-bağımlı alan GRUBU — Sprint 137-171 maske döngüsünü kır).

function auditTask(id = '171-014', overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: 'extensions + scripts Audit',
    description: 'Audit-only task — Türkçe rapor',
    model: 'opus',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test bootstrap',
    scope: {
      directories: ['docs/audits/sprint-171/'],
      filesRead: [],
      filesWrite: [`docs/audits/sprint-171/extensions-scripts.md`],
    },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'EXECUTING',
    // 171-014 gerçek agent'ı: devops-engineer — COVERAGE_OPTIONAL_AGENTS'ta YOK.
    // Schema'nın TaskType='audit' yolundan relax etmesi gerek, agent allowlist'ten değil.
    assignedAgent: 'devops-engineer',
    ...overrides,
  };
}

function auditResultNoTestsPassed(
  id = '171-014',
  overrides: Partial<TaskResult> = {},
): TaskResult {
  // 171-014 .result şekli: testsPassed ANAHTARI YOK (undefined), coverage:null
  const r = {
    taskId: id,
    workerId: `docker-${id}`,
    filesChanged: [`docs/audits/sprint-171/extensions-scripts.md`],
    linesAdded: 0,
    linesRemoved: 0,
    coverage: null as unknown as number,
    selfAssessment: 'DONE',
    notes: 'Audit raporu Türkçe yazıldı. 4+1 bölüm tam.',
  } as TaskResult;
  return { ...r, ...overrides };
}

describe('Sprint 171 Bug A — schema gate testsPassed relax (audit task)', () => {
  it('audit task (testsPassed YOK, coverage:null) schema validation GEÇER', () => {
    const task = auditTask('171-014');
    const result = auditResultNoTestsPassed('171-014');

    const schema = validateResultSchema(result, task);

    expect(schema.valid).toBe(true);
    expect(schema.missingFields).not.toContain('testsPassed');
    expect(schema.missingFields).not.toContain('coverage');
  });

  it('171-023 doc-writer audit task da kabul edilir', () => {
    const task = auditTask('171-023', {
      assignedAgent: 'doc-writer',
      scope: {
        directories: ['docs/audits/sprint-171/'],
        filesRead: [],
        filesWrite: ['docs/audits/sprint-171/docs-root.md'],
      },
    });
    const result = auditResultNoTestsPassed('171-023', {
      filesChanged: ['docs/audits/sprint-171/docs-root.md'],
    });

    const schema = validateResultSchema(result, task);

    expect(schema.valid).toBe(true);
  });

  it('REGRESYON: code-development task testsPassed YOK ise hâlâ REDDEDİLİR', () => {
    const task = bugFixTask('171-900', {
      assignedAgent: 'generic',
      scope: {
        directories: ['src/orchestra/'],
        filesRead: [],
        filesWrite: ['src/orchestra/foo.ts'],
      },
    });
    const result = auditResultNoTestsPassed('171-900', {
      filesChanged: ['src/orchestra/foo.ts'],
    });

    const schema = validateResultSchema(result, task);

    expect(schema.valid).toBe(false);
    expect(schema.missingFields).toContain('testsPassed');
  });

  it('DEFANS: audit task testsPassed:false açıkça verilirse yine geçer', () => {
    const task = auditTask('171-015');
    const result = auditResultNoTestsPassed('171-015', { testsPassed: false });

    const schema = validateResultSchema(result, task);

    expect(schema.valid).toBe(true);
  });

  it('UÇTAN-UCA: gerçek 171-014 raporu (testsPassed YOK) → schema_validation NO_GO DEĞİL', () => {
    // Bug A'nın davranış kontratı: SCHEMA GATE artık testsPassed eksikliğinde
    // audit task'ı reddetmiyor. Gerçek commit'li rapor dosyasına yöneltilir
    // (reorg sonrası path) ki audit içerik skorlaması (audit_completeness/
    // finding_count/citation_density) gerçek içeriği okusun — Bug A'yı
    // audit-content-scoring'den izole eder.
    const realReport = 'docs/audits/sprint-171/01-modul-derin/14-extensions-scripts.md';
    const task = auditTask('171-014', {
      scope: {
        directories: ['docs/audits/sprint-171/'],
        filesRead: [],
        filesWrite: [realReport],
      },
    });
    const result = auditResultNoTestsPassed('171-014', {
      filesChanged: [realReport],
    });

    const evaluation = evaluateWithRubric(result, task);

    // Birincil kontrat: schema_validation kaynaklı spurious NO_GO YOK.
    const schemaNoGo =
      evaluation.decision === 'NO_GO' &&
      evaluation.rubricScores?.[0]?.criterion === 'schema_validation';
    expect(schemaNoGo).toBe(false);
  });
});
