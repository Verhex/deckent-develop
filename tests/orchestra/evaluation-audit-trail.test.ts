// ═══ EvaluationAuditTrail Tests — Sprint 157 T-001 ═════════════════════
// Five scenarios from DIRECTIVES.md:
//   1. audit rubric record
//   2. doc-write rubric record (coverageRelaxed)
//   3. code rubric record
//   4. decisionRationale formatting (4 variants)
//   5. multi-attempt overwrite

import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EVALUATIONS_DIR } from '../../src/core/constants.js';
import {
  buildDecisionRationale,
  evaluationAuditPath,
  writeEvaluationAudit,
  type AuditCriterionScore,
  type AuditSchemaValidation,
  type EvaluationAuditInput,
} from '../../src/orchestra/evaluation-audit-trail.js';

// ─── Helpers ────────────────────────────────────────────────────────────

function makeProjectRoot(): string {
  return mkdtempSync(join(tmpdir(), 'deckent-eval-audit-'));
}

const VALID_SCHEMA: AuditSchemaValidation = {
  valid: true,
  missingFields: [],
  coverageRelaxed: false,
};

const FIXED_TS = '2026-05-12T14:15:53.000Z';

// ─── Suite ──────────────────────────────────────────────────────────────

describe('evaluation-audit-trail', () => {
  let root: string;

  beforeEach(() => {
    root = makeProjectRoot();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // ─── Scenario 1: AUDIT rubric ─────────────────────────────────────────
  it('writes an audit-rubric record under the canonical layout', () => {
    const criteria: AuditCriterionScore[] = [
      { name: 'audit_completeness', score: 90, threshold: 60, weight: 0.4, passed: true, reason: '4/4 sections present' },
      { name: 'finding_count',      score: 80, threshold: 40, weight: 0.3, passed: true, reason: '6 findings' },
      { name: 'citation_density',   score: 70, threshold: 40, weight: 0.2, passed: true, reason: '8 citations' },
      { name: 'migration_triage',   score: 60, threshold: 40, weight: 0.1, passed: true, reason: 'P0/P1/P2 present' },
    ];
    const input: EvaluationAuditInput = {
      ruleSet: 'AUDIT',
      schemaValidation: VALID_SCHEMA,
      criterionScores: criteria,
      totalScore: 80,
      decision: 'DONE',
      timestamp: FIXED_TS,
    };

    const record = writeEvaluationAudit(root, 'sprint-157', 'task-7', 1, input);

    const expectedPath = join(root, EVALUATIONS_DIR, 'sprint-157', 'task-7-attempt-1.json');
    expect(existsSync(expectedPath)).toBe(true);
    expect(evaluationAuditPath(root, 'sprint-157', 'task-7', 1)).toBe(expectedPath);

    const onDisk = JSON.parse(readFileSync(expectedPath, 'utf-8'));
    expect(onDisk).toEqual(record);
    expect(onDisk.ruleSet).toBe('AUDIT');
    expect(onDisk.evaluator).toBe('brain');
    expect(onDisk.timestamp).toBe(FIXED_TS);
    expect(onDisk.taskId).toBe('task-7');
    expect(onDisk.sprintId).toBe('sprint-157');
    expect(onDisk.attemptNum).toBe(1);
    expect(onDisk.criterionScores).toHaveLength(4);
    expect(onDisk.totalScore).toBe(80);
    expect(onDisk.decision).toBe('DONE');
    expect(typeof onDisk.decisionRationale).toBe('string');
    expect(onDisk.decisionRationale.length).toBeGreaterThan(0);
  });

  // ─── Scenario 2: DOC_WRITE rubric with coverage relaxed ───────────────
  it('writes a doc-write record that reflects coverageRelaxed in schemaValidation', () => {
    const schema: AuditSchemaValidation = {
      valid: true,
      missingFields: [],
      coverageRelaxed: true,
    };
    const criteria: AuditCriterionScore[] = [
      { name: 'correctness',            score: 90, threshold: 60, weight: 0.3,  passed: true, reason: 'self DONE + tests pass' },
      { name: 'word_count',             score: 85, threshold: 50, weight: 0.25, passed: true, reason: '950 words' },
      { name: 'scope_compliance',       score: 100, threshold: 80, weight: 0.25, passed: true, reason: 'no source files touched' },
      { name: 'documentation_quality',  score: 70, threshold: 30, weight: 0.2,  passed: true, reason: 'headings present' },
    ];

    const record = writeEvaluationAudit(root, 'sprint-157', 'task-12', 1, {
      ruleSet: 'DOC_WRITE',
      schemaValidation: schema,
      criterionScores: criteria,
      totalScore: 86.25,
      decision: 'DONE',
      timestamp: FIXED_TS,
    });

    const filePath = evaluationAuditPath(root, 'sprint-157', 'task-12', 1);
    const onDisk = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(onDisk.ruleSet).toBe('DOC_WRITE');
    expect(onDisk.schemaValidation.coverageRelaxed).toBe(true);
    expect(onDisk.schemaValidation.valid).toBe(true);
    expect(onDisk.schemaValidation.missingFields).toEqual([]);
    expect(record.totalScore).toBe(86.25);
  });

  // ─── Scenario 3: CODE rubric with partial failures ────────────────────
  it('writes a code-rubric record and preserves criterionScores round-trip', () => {
    const criteria: AuditCriterionScore[] = [
      { name: 'correctness',      score: 80, threshold: 60, weight: 0.4,  passed: true,  reason: 'tests passed' },
      { name: 'test_coverage',    score: 40, threshold: 50, weight: 0.25, passed: false, reason: '40% < 50%' },
      { name: 'scope_compliance', score: 100, threshold: 80, weight: 0.2,  passed: true,  reason: 'no boundary violations' },
      { name: 'documentation',    score: 25, threshold: 30, weight: 0.15, passed: false, reason: 'no JSDoc on public exports' },
    ];

    const record = writeEvaluationAudit(root, 'sprint-157', 'task-1', 1, {
      ruleSet: 'CODE',
      schemaValidation: VALID_SCHEMA,
      criterionScores: criteria,
      totalScore: 65.75,
      decision: 'GO_WITH_TECH_DEBT',
      timestamp: FIXED_TS,
    });

    const filePath = evaluationAuditPath(root, 'sprint-157', 'task-1', 1);
    const onDisk = JSON.parse(readFileSync(filePath, 'utf-8')) as typeof record;

    // Round-trip: all four criteria preserved verbatim
    expect(onDisk.criterionScores).toEqual(criteria);
    expect(onDisk.ruleSet).toBe('CODE');
    expect(onDisk.decision).toBe('GO_WITH_TECH_DEBT');

    // Sanity: failed-criterion subset is preserved
    const failed = onDisk.criterionScores.filter(c => !c.passed).map(c => c.name);
    expect(failed).toEqual(['test_coverage', 'documentation']);
  });

  // ─── Scenario 4: decisionRationale formats ────────────────────────────
  it('formats decisionRationale for DONE / TECH_DEBT / NO_GO and schema-invalid variants', () => {
    const passingScores: AuditCriterionScore[] = [
      { name: 'correctness',      score: 90, threshold: 60, weight: 0.4,  passed: true, reason: '' },
      { name: 'test_coverage',    score: 80, threshold: 50, weight: 0.25, passed: true, reason: '' },
      { name: 'scope_compliance', score: 100, threshold: 80, weight: 0.2,  passed: true, reason: '' },
      { name: 'documentation',    score: 60, threshold: 30, weight: 0.15, passed: true, reason: '' },
    ];
    const mixedScores: AuditCriterionScore[] = [
      { name: 'correctness',      score: 80, threshold: 60, weight: 0.4,  passed: true,  reason: '' },
      { name: 'test_coverage',    score: 40, threshold: 50, weight: 0.25, passed: false, reason: '' },
      { name: 'scope_compliance', score: 100, threshold: 80, weight: 0.2,  passed: true,  reason: '' },
      { name: 'documentation',    score: 25, threshold: 30, weight: 0.15, passed: false, reason: '' },
    ];

    const done = buildDecisionRationale('DONE', 84.5, passingScores, VALID_SCHEMA);
    expect(done).toContain('decision=DONE');
    expect(done).toContain('score=84.5/100');
    expect(done).toContain('(4 criteria, 4 passed)');
    expect(done).not.toContain('Top fails');

    const techDebt = buildDecisionRationale('GO_WITH_TECH_DEBT', 65.75, mixedScores, VALID_SCHEMA);
    expect(techDebt).toContain('decision=GO_WITH_TECH_DEBT');
    expect(techDebt).toContain('score=65.75/100');
    expect(techDebt).toContain('(4 criteria, 2 passed)');
    expect(techDebt).toContain('Top fails: test_coverage, documentation');

    const noGo = buildDecisionRationale('NO_GO', 30.25, mixedScores, VALID_SCHEMA);
    expect(noGo).toContain('decision=NO_GO');
    expect(noGo).toContain('score=30.25/100');
    expect(noGo).toContain('Top fails: test_coverage, documentation');

    const invalidSchema: AuditSchemaValidation = {
      valid: false,
      missingFields: ['coverage', 'selfAssessment'],
      coverageRelaxed: false,
    };
    const schemaInvalid = buildDecisionRationale('NO_GO', 0, [], invalidSchema);
    expect(schemaInvalid).toBe(
      'Schema invalid: missing [coverage, selfAssessment] (coverageRelaxed=false)',
    );
  });

  // ─── Scenario 5: multi-attempt overwrite semantics ────────────────────
  it('writes distinct files per attempt; same-decision rewrite is idempotent, different-decision is conflict-fail-closed', () => {
    const baseInput: EvaluationAuditInput = {
      ruleSet: 'CODE',
      schemaValidation: VALID_SCHEMA,
      criterionScores: [
        { name: 'correctness', score: 50, threshold: 60, weight: 1.0, passed: false, reason: 'tests failed' },
      ],
      totalScore: 50,
      decision: 'NO_GO',
      timestamp: FIXED_TS,
    };

    // Attempt 1: NO_GO
    writeEvaluationAudit(root, 'sprint-157', 'task-3', 1, baseInput);
    // Attempt 2: DONE (FIX phase retried)
    writeEvaluationAudit(root, 'sprint-157', 'task-3', 2, {
      ...baseInput,
      criterionScores: [
        { name: 'correctness', score: 90, threshold: 60, weight: 1.0, passed: true, reason: 'tests passed' },
      ],
      totalScore: 90,
      decision: 'DONE',
    });

    const path1 = evaluationAuditPath(root, 'sprint-157', 'task-3', 1);
    const path2 = evaluationAuditPath(root, 'sprint-157', 'task-3', 2);
    expect(path1).not.toBe(path2);
    expect(existsSync(path1)).toBe(true);
    expect(existsSync(path2)).toBe(true);

    const attempt1 = JSON.parse(readFileSync(path1, 'utf-8'));
    const attempt2 = JSON.parse(readFileSync(path2, 'utf-8'));
    expect(attempt1.attemptNum).toBe(1);
    expect(attempt2.attemptNum).toBe(2);
    expect(attempt1.decision).toBe('NO_GO');
    expect(attempt2.decision).toBe('DONE');

    // RECEIPT-BEFORE-DONE conflict-fail-closed (2026-08-16): re-writing the same
    // attempt with the SAME decision is idempotent (crash/replay safe)…
    writeEvaluationAudit(root, 'sprint-157', 'task-3', 1, {
      ...baseInput, totalScore: 51, decisionRationale: 'idempotent replay',
    });
    const idem = JSON.parse(readFileSync(path1, 'utf-8'));
    expect(idem.attemptNum).toBe(1);
    expect(idem.decision).toBe('NO_GO'); // decision unchanged
    // …but re-writing the same attempt with a DIFFERENT decision is a forensic
    // CONFLICT and is refused — a dependent must never be admitted on a silently
    // rewritten receipt.
    expect(() => writeEvaluationAudit(root, 'sprint-157', 'task-3', 1, {
      ...baseInput, totalScore: 55, decision: 'GO_WITH_TECH_DEBT',
    })).toThrow(/EVALUATION_AUDIT_CONFLICT/);
    // The prior receipt is intact (NO_GO), never clobbered by the rejected write.
    expect(JSON.parse(readFileSync(path1, 'utf-8')).decision).toBe('NO_GO');

    // An existing malformed receipt is also immutable evidence: recovery must
    // disposition it explicitly rather than silently replacing forensic bytes.
    writeFileSync(path2, '{not-json\n', 'utf-8');
    expect(() => writeEvaluationAudit(root, 'sprint-157', 'task-3', 2, {
      ...baseInput, decision: 'DONE',
    })).toThrow(/EVALUATION_AUDIT_CONFLICT/);
    expect(readFileSync(path2, 'utf-8')).toBe('{not-json\n');

    // File contents must be valid JSON only (single record, no NDJSON append)
    const raw = readFileSync(path1, 'utf-8');
    expect(raw.trim().startsWith('{')).toBe(true);
    expect(raw.trim().endsWith('}')).toBe(true);
    // Should parse without throwing in a single JSON.parse call
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  // ─── Bonus: directory layout is created when absent ───────────────────
  it('creates the sprint subdirectory on first write', () => {
    const sprintDir = join(root, EVALUATIONS_DIR, 'sprint-200');
    expect(existsSync(sprintDir)).toBe(false);

    writeEvaluationAudit(root, 'sprint-200', 'task-99', 1, {
      ruleSet: 'AUDIT',
      schemaValidation: VALID_SCHEMA,
      criterionScores: [],
      totalScore: 0,
      decision: 'NO_GO',
      timestamp: FIXED_TS,
      decisionRationale: 'empty rubric — synthetic',
    });

    expect(existsSync(sprintDir)).toBe(true);
    expect(existsSync(join(sprintDir, 'task-99-attempt-1.json'))).toBe(true);
  });

  // ─── Default timestamp is a valid ISO-8601 UTC string ─────────────────
  it('defaults timestamp to an ISO-8601 UTC string when omitted', () => {
    const before = Date.now();
    const record = writeEvaluationAudit(root, 'sprint-157', 'task-5', 1, {
      ruleSet: 'CODE',
      schemaValidation: VALID_SCHEMA,
      criterionScores: [],
      totalScore: 0,
      decision: 'NO_GO',
    });
    const after = Date.now();

    // ISO-8601 with millisecond precision and Z suffix
    expect(record.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const t = Date.parse(record.timestamp);
    expect(Number.isFinite(t)).toBe(true);
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });
});

// ─── Defensive: writing into an existing dir does not corrupt siblings ──
describe('evaluation-audit-trail · sibling integrity', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-eval-audit-sib-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('does not touch a pre-existing unrelated file in the sprint dir', () => {
    // Pre-seed an unrelated file in the target directory
    const sprintDir = join(root, EVALUATIONS_DIR, 'sprint-157');
    writeEvaluationAudit(root, 'sprint-157', 'task-a', 1, {
      ruleSet: 'CODE',
      schemaValidation: VALID_SCHEMA,
      criterionScores: [],
      totalScore: 0,
      decision: 'NO_GO',
      timestamp: FIXED_TS,
    });
    const sidecar = join(sprintDir, 'README.md');
    writeFileSync(sidecar, 'hand-written audit notes\n', 'utf-8');

    // Write a different task — must not disturb sidecar
    writeEvaluationAudit(root, 'sprint-157', 'task-b', 1, {
      ruleSet: 'AUDIT',
      schemaValidation: VALID_SCHEMA,
      criterionScores: [],
      totalScore: 0,
      decision: 'NO_GO',
      timestamp: FIXED_TS,
    });

    expect(readFileSync(sidecar, 'utf-8')).toBe('hand-written audit notes\n');
    expect(existsSync(join(sprintDir, 'task-a-attempt-1.json'))).toBe(true);
    expect(existsSync(join(sprintDir, 'task-b-attempt-1.json'))).toBe(true);
  });
});
