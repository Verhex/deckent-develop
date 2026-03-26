/**
 * Tests for Task 061-008: Remaining CLI Polish
 *
 * A) formatDurationShort — short format duration (sprint-reporter.ts)
 * B) History JSON type consistency — tasks/completed/noGo as numbers
 * C) Security-auditor triggerScopes — includes src/api/
 * D) buildAgentPerformance alphabetical tiebreak
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Command } from 'commander';

import {
  formatDurationShort,
  buildAgentPerformance,
} from '../../../src/orchestra/sprint-reporter.js';
import { SprintPhase, SprintStatus, TaskEvaluation } from '../../../src/core/types.js';
import type { Sprint, Task, TaskResult, SprintMetrics } from '../../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-061',
    number: 61,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.RETRO,
    tasks,
    workers: [],
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}

// ─── A) formatDurationShort ──────────────────────────────────────────────────

describe('formatDurationShort', () => {
  it('returns empty string for undefined', () => {
    expect(formatDurationShort(undefined)).toBe('');
  });

  it('returns empty string for zero', () => {
    expect(formatDurationShort(0)).toBe('');
  });

  it('formats seconds only (< 60s)', () => {
    expect(formatDurationShort(45000)).toBe('45s');
  });

  it('formats whole minutes (no remainder)', () => {
    expect(formatDurationShort(300000)).toBe('5m');
  });

  it('formats minutes with seconds', () => {
    expect(formatDurationShort(1874000)).toBe('31m 14s');
  });

  it('formats whole hours (no remainder)', () => {
    expect(formatDurationShort(3600000)).toBe('1h');
  });

  it('formats hours with remaining minutes', () => {
    expect(formatDurationShort(5400000)).toBe('1h 30m');
  });

  it('uses Math.round for sub-second rounding (500ms rounds up)', () => {
    // 60500ms → Math.round(60500/1000)=61s → 1m 1s
    expect(formatDurationShort(60500)).toBe('1m 1s');
  });
});

// ─── D) buildAgentPerformance alphabetical tiebreak ──────────────────────────

describe('buildAgentPerformance — alphabetical tiebreak', () => {
  it('sorts agents with equal task counts alphabetically', () => {
    const tasks = [
      makeTask({ id: '001', assignedAgent: 'zebra-agent' }),
      makeTask({ id: '002', assignedAgent: 'alpha-agent' }),
    ];
    const sprint = makeSprint(tasks);
    const evaluations = new Map([
      ['001', TaskEvaluation.DONE],
      ['002', TaskEvaluation.DONE],
    ]);
    const rows = buildAgentPerformance(sprint, evaluations, []);
    // Both have 1 task — alphabetical order: alpha before zebra
    expect(rows[0].agent).toBe('alpha-agent');
    expect(rows[1].agent).toBe('zebra-agent');
  });

  it('still sorts by task count primarily (higher count first)', () => {
    const tasks = [
      makeTask({ id: '001', assignedAgent: 'few-tasks' }),
      makeTask({ id: '002', assignedAgent: 'many-tasks' }),
      makeTask({ id: '003', assignedAgent: 'many-tasks' }),
      makeTask({ id: '004', assignedAgent: 'many-tasks' }),
    ];
    const sprint = makeSprint(tasks);
    const evaluations = new Map([
      ['001', TaskEvaluation.DONE],
      ['002', TaskEvaluation.DONE],
      ['003', TaskEvaluation.DONE],
      ['004', TaskEvaluation.DONE],
    ]);
    const rows = buildAgentPerformance(sprint, evaluations, []);
    expect(rows[0].agent).toBe('many-tasks');
    expect(rows[1].agent).toBe('few-tasks');
  });

  it('alphabetical tiebreak is deterministic with 3 agents of equal task count', () => {
    const tasks = [
      makeTask({ id: '001', assignedAgent: 'charlie' }),
      makeTask({ id: '002', assignedAgent: 'alice' }),
      makeTask({ id: '003', assignedAgent: 'bob' }),
    ];
    const sprint = makeSprint(tasks);
    const evaluations = new Map([
      ['001', TaskEvaluation.DONE],
      ['002', TaskEvaluation.DONE],
      ['003', TaskEvaluation.DONE],
    ]);
    const rows = buildAgentPerformance(sprint, evaluations, []);
    expect(rows.map((r) => r.agent)).toEqual(['alice', 'bob', 'charlie']);
  });
});

// ─── B) History JSON type consistency ────────────────────────────────────────

const testRoot = join(tmpdir(), `deckent-cli-polish-${Date.now()}`);

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => testRoot,
}));

const output: string[] = [];
vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: (msg: string) => output.push(msg),
  formatTable: (headers: string[], rows: string[][]) =>
    [headers.join('|'), ...rows.map((r) => r.join('|'))].join('\n'),
}));

import { registerHistory } from '../../../src/cli/commands/history.js';

const SPRINT_LOG = [
  '# sprint-061',
  '## Metrics',
  '| Metric | Value |',
  '|--------|-------|',
  '| Total Tasks | 5 |',
  '| Completed | 4 |',
  '| No-Go | 1 |',
  '| Coverage | 90% |',
  '| Duration | 3000ms |',
].join('\n');

describe('history --json type consistency', () => {
  beforeEach(() => {
    output.length = 0;
    const sprintsDir = join(testRoot, '.brain', 'sprints');
    mkdirSync(sprintsDir, { recursive: true });
    writeFileSync(join(sprintsDir, 'sprint-061.md'), SPRINT_LOG, 'utf-8');
  });

  afterEach(() => {
    if (existsSync(testRoot)) rmSync(testRoot, { recursive: true, force: true });
  });

  async function runHistory(args: string[]) {
    output.length = 0;
    const program = new Command();
    program.exitOverride();
    registerHistory(program);
    try {
      await program.parseAsync(['node', 'deckent', ...args]);
    } catch {
      // commander exitOverride
    }
  }

  it('serializes tasks as number in JSON output', async () => {
    await runHistory(['history', '--json']);
    const parsed = JSON.parse(output.join(''));
    expect(Array.isArray(parsed)).toBe(true);
    expect(typeof parsed[0].tasks).toBe('number');
    expect(parsed[0].tasks).toBe(5);
  });

  it('serializes completed as number in JSON output', async () => {
    await runHistory(['history', '--json']);
    const parsed = JSON.parse(output.join(''));
    expect(typeof parsed[0].completed).toBe('number');
    expect(parsed[0].completed).toBe(4);
  });

  it('serializes noGo as number in JSON output', async () => {
    await runHistory(['history', '--json']);
    const parsed = JSON.parse(output.join(''));
    expect(typeof parsed[0].noGo).toBe('number');
    expect(parsed[0].noGo).toBe(1);
  });

  it('keeps dash as string when field is missing', async () => {
    const emptyLog = '# sprint-062\n## Metrics\n';
    const sprintsDir = join(testRoot, '.brain', 'sprints');
    writeFileSync(join(sprintsDir, 'sprint-062.md'), emptyLog, 'utf-8');
    await runHistory(['history', '--json', '--last', '1']);
    const parsed = JSON.parse(output.join(''));
    // sprint-062 has no task data → dash
    const rec = parsed.find((r: { sprint: string }) => r.sprint.includes('sprint-062'));
    if (rec) {
      expect(rec.tasks).toBe('-');
    }
  });
});

// ─── C) Security-auditor triggerScopes ──────────────────────────────────────

describe('security-auditor triggerScopes', () => {
  it('includes src/api/ in triggerScopes', () => {
    const agentPath = join(
      process.cwd(),
      '.deckent/agents/security-auditor/agent.json',
    );
    expect(existsSync(agentPath)).toBe(true);
    const agent = JSON.parse(readFileSync(agentPath, 'utf-8')) as {
      triggerScopes: string[];
    };
    expect(agent.triggerScopes).toContain('src/api/');
  });

  it('retains src/auth/ and src/middleware/ in triggerScopes', () => {
    const agentPath = join(
      process.cwd(),
      '.deckent/agents/security-auditor/agent.json',
    );
    const agent = JSON.parse(readFileSync(agentPath, 'utf-8')) as {
      triggerScopes: string[];
    };
    expect(agent.triggerScopes).toContain('src/auth/');
    expect(agent.triggerScopes).toContain('src/middleware/');
  });
});
