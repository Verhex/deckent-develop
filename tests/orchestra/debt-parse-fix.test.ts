import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseDebtTable, generateDebtTable } from '../../src/core/utils.js';
import { writeRetrospective } from '../../src/orchestra/sprint-reporter.js';
import { TaskEvaluation, SprintPhase, SprintStatus, DebtPriority } from '../../src/core/types.js';
import type { Sprint, Task, SprintMetrics } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001',
    title: 'Test Task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Test reason',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'DONE',
    ...overrides,
  };
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-001',
    number: 1,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.RETRO,
    tasks: [makeTask()],
    workers: ['w-001'],
    startedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    completedAt: new Date('2026-01-01T01:00:00.000Z').toISOString(),
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: 1,
    completedTasks: 1,
    techDebtTasks: 0,
    noGoTasks: 0,
    durationMs: 3600000,
    coveragePercent: 90,
    noGoRate: 0,
    newDebtCount: 0,
    resolvedDebtCount: 0,
    totalOpenDebt: 0,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
    ...overrides,
  };
}

const VALID_DEBT_TABLE = [
  '| ID | Description | Task | Sprint | Priority | Open | Resolved | Fixed In | Created |',
  '|----|-------------|------|--------|----------|------|----------|----------|---------|',
  '| debt-125-001 | Auth middleware rewrite needed | 125-001 | sprint-125 | CRITICAL | 3 | false | - | 2026-04-01T10:00:00.000Z |',
  '| debt-126-001 | FIX faz evaluations bug | 126-001 | sprint-126 | HIGH | 2 | true | sprint-127 | 2026-04-02T10:00:00.000Z |',
  '| debt-127-001 | Promotion pipeline guard | 127-001 | sprint-127 | NORMAL | 0 | false | - | 2026-04-03T10:00:00.000Z |',
].join('\n');

// ─── Tests ──────────────────────────────────────────────────────────

describe('parseDebtTable — DEBT.md markdown table parser', () => {
  it('parses a valid markdown table with 3 rows correctly', () => {
    const items = parseDebtTable(VALID_DEBT_TABLE);

    expect(items).toHaveLength(3);

    // First row
    expect(items[0]!.id).toBe('debt-125-001');
    expect(items[0]!.description).toBe('Auth middleware rewrite needed');
    expect(items[0]!.originTaskId).toBe('125-001');
    expect(items[0]!.originSprintId).toBe('sprint-125');
    expect(items[0]!.priority).toBe(DebtPriority.CRITICAL);
    expect(items[0]!.sprintsOpen).toBe(3);
    expect(items[0]!.resolved).toBe(false);
    expect(items[0]!.resolvedInSprintId).toBeUndefined();
    expect(items[0]!.createdAt).toBe('2026-04-01T10:00:00.000Z');

    // Second row — resolved
    expect(items[1]!.id).toBe('debt-126-001');
    expect(items[1]!.resolved).toBe(true);
    expect(items[1]!.resolvedInSprintId).toBe('sprint-127');

    // Third row
    expect(items[2]!.id).toBe('debt-127-001');
    expect(items[2]!.priority).toBe(DebtPriority.NORMAL);
  });

  it('returns empty array for empty string', () => {
    const items = parseDebtTable('');
    expect(items).toEqual([]);
  });

  it('returns empty array for corrupt/invalid format without throwing', () => {
    const corruptInputs = [
      'just some random text',
      '{"id": "debt-001", "description": "json format"}',
      'col1,col2,col3\nval1,val2,val3',
      '| only | three | columns |\n|---|---|---|\n| a | b | c |',
    ];

    for (const input of corruptInputs) {
      expect(() => parseDebtTable(input)).not.toThrow();
      expect(parseDebtTable(input)).toEqual([]);
    }
  });

  it('returns empty array for header-only table (no data rows)', () => {
    const headerOnly = [
      '| ID | Description | Task | Sprint | Priority | Open | Resolved | Fixed In | Created |',
      '|----|-------------|------|--------|----------|------|----------|----------|---------|',
    ].join('\n');

    const items = parseDebtTable(headerOnly);
    expect(items).toEqual([]);
  });

  describe('writeRetrospective integration — DEBT.md markdown table does not throw', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = join(tmpdir(), `debt-parse-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(join(tmpDir, '.brain'), { recursive: true });
      mkdirSync(join(tmpDir, '.tasks'), { recursive: true });
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('writeRetrospective does not throw when DEBT.md contains markdown table', () => {
      // Write a markdown table DEBT.md (the real format)
      writeFileSync(join(tmpDir, '.brain', 'DEBT.md'), VALID_DEBT_TABLE, 'utf-8');

      const sprint = makeSprint();
      const evaluations = new Map<string, TaskEvaluation>([
        ['001', TaskEvaluation.DONE],
      ]);
      const metrics = makeMetrics();

      // This used to throw: "Unexpected token '|'" due to JSON.parse on markdown
      expect(() => {
        writeRetrospective(tmpDir, sprint, evaluations, metrics);
      }).not.toThrow();
    });
  });
});
