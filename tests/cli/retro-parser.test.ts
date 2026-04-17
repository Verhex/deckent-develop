import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseRetroToRichSummary,
  parseAgentPerformanceFromRetro,
  parseSkillPerformanceFromRetro,
  loadSprintTrend,
  loadPreviousRetro,
} from '../../src/cli/commands/retro-parser.js';

// ─── parseRetroToRichSummary ─────────────────────────────────────────────

describe('parseRetroToRichSummary', () => {
  it('parses sprint-reporter "Tasks completed | X/Y" format', () => {
    const content = '# Sprint sprint-055\n| Tasks completed | 7/10 |';
    const s = parseRetroToRichSummary(content);
    expect(s.sprintId).toBe('sprint-055');
    expect(s.completed).toBe(7);
    expect(s.totalTasks).toBe(10);
  });

  it('parses NO_GO rate format with parenthesized count', () => {
    const content = '| NO_GO rate | 20% (2/10) |';
    const s = parseRetroToRichSummary(content);
    expect(s.noGo).toBe(2);
  });

  it('parses legacy "| Total Tasks |" format', () => {
    const content = '| Total Tasks | 5 |\n| Completed | 3 |';
    const s = parseRetroToRichSummary(content);
    expect(s.totalTasks).toBe(5);
    expect(s.completed).toBe(3);
  });

  it('returns defaults for empty content', () => {
    const s = parseRetroToRichSummary('');
    expect(s.totalTasks).toBe(0);
    expect(s.completed).toBe(0);
    expect(s.noGo).toBe(0);
    expect(s.techDebt).toBe(0);
    expect(s.coverage).toBe('-');
    expect(s.duration).toBe('-');
    expect(s.sprintId).toBe('unknown');
  });

  it('counts GO_WITH_TECH_DEBT occurrences as techDebt fallback', () => {
    const content = '# Sprint x\n- Task 1: GO_WITH_TECH_DEBT\n- Task 2: GO_WITH_TECH_DEBT\n- Task 3: DONE';
    const s = parseRetroToRichSummary(content);
    expect(s.techDebt).toBe(2);
  });

  it('parses Sprint time format', () => {
    const content = '| Sprint time | 5m 12s |';
    const s = parseRetroToRichSummary(content);
    expect(s.duration).toBe('5m 12s');
  });

  it('falls back to non-table format', () => {
    const content = 'Sprint sprint-010\nTasks: 5\nCoverage: 80%\nDuration: 2m';
    const s = parseRetroToRichSummary(content);
    expect(s.totalTasks).toBe(5);
    expect(s.coverage).toBe('80%');
    expect(s.duration).toBe('2m');
  });

  it('stores raw content', () => {
    const content = '# Sprint sprint-001\nSome content';
    const s = parseRetroToRichSummary(content);
    expect(s.raw).toBe(content);
  });
});

// ─── parseAgentPerformanceFromRetro ──────────────────────────────────────

describe('parseAgentPerformanceFromRetro', () => {
  it('parses agent performance table rows', () => {
    const content = `## Agent Performance\n| Agent | Tasks | Done | Debt | NoGo | Avg Coverage |\n|-------|-------|------|------|------|--------------|\n| worker-1 | 5 | 4 | 1 | 0 | 80% |\n`;
    const rows = parseAgentPerformanceFromRetro(content);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.agent).toBe('worker-1');
    expect(rows[0]?.tasks).toBe('5');
    expect(rows[0]?.avgCoverage).toBe('80%');
  });

  it('returns empty array when no section found', () => {
    expect(parseAgentPerformanceFromRetro('# Sprint\n## Metrics')).toHaveLength(0);
  });

  it('parses multiple rows', () => {
    const content = `## Agent Performance\n| Agent | Tasks | Done | Debt | NoGo | Avg Coverage |\n|-------|-------|------|------|------|--------------|\n| a1 | 3 | 2 | 1 | 0 | 70% |\n| a2 | 5 | 5 | 0 | 0 | 95% |\n`;
    const rows = parseAgentPerformanceFromRetro(content);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.agent).toBe('a2');
  });
});

// ─── parseSkillPerformanceFromRetro ──────────────────────────────────────

describe('parseSkillPerformanceFromRetro', () => {
  it('parses skill performance table rows', () => {
    const content = `## Skill Performance\n| Skill | Tasks | Done | Debt | NoGo |\n|-------|-------|------|------|------|\n| testing-expert | 3 | 2 | 1 | 0 |\n`;
    const rows = parseSkillPerformanceFromRetro(content);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.skill).toBe('testing-expert');
  });

  it('returns empty array when no section found', () => {
    expect(parseSkillPerformanceFromRetro('# Sprint')).toHaveLength(0);
  });
});

// ─── loadSprintTrend ─────────────────────────────────────────────────────

describe('loadSprintTrend', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = mkdtempSync(join(tmpdir(), 'retro-parser-trend-'));
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('returns empty array when sprints dir does not exist', () => {
    expect(loadSprintTrend(testRoot)).toEqual([]);
  });

  it('loads trend entries from sprint files', () => {
    const sprintsDir = join(testRoot, '.brain', 'sprints');
    mkdirSync(sprintsDir, { recursive: true });
    writeFileSync(join(sprintsDir, 'sprint-001.md'), '# Sprint sprint-001\n| Tasks completed | 5/10 |');
    writeFileSync(join(sprintsDir, 'sprint-002.md'), '# Sprint sprint-002\n| Tasks completed | 8/10 |');

    const entries = loadSprintTrend(testRoot);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.sprintId).toBe('sprint-001');
    expect(entries[0]?.successRate).toBe(50);
    expect(entries[1]?.successRate).toBe(80);
  });

  it('respects the n limit', () => {
    const sprintsDir = join(testRoot, '.brain', 'sprints');
    mkdirSync(sprintsDir, { recursive: true });
    for (let i = 1; i <= 10; i++) {
      writeFileSync(join(sprintsDir, `sprint-${String(i).padStart(3, '0')}.md`), `# Sprint sprint-${i}\n| Tasks completed | ${i}/10 |`);
    }
    const entries = loadSprintTrend(testRoot, 3);
    expect(entries).toHaveLength(3);
  });
});

// ─── loadPreviousRetro ───────────────────────────────────────────────────

describe('loadPreviousRetro', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = mkdtempSync(join(tmpdir(), 'retro-parser-prev-'));
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('returns null when sprints dir does not exist', () => {
    expect(loadPreviousRetro(testRoot)).toBeNull();
  });

  it('returns null when no sprint files', () => {
    mkdirSync(join(testRoot, '.brain', 'sprints'), { recursive: true });
    expect(loadPreviousRetro(testRoot)).toBeNull();
  });

  it('returns previous sprint content when current retro matches last file', () => {
    const brainDir = join(testRoot, '.brain');
    const sprintsDir = join(brainDir, 'sprints');
    mkdirSync(sprintsDir, { recursive: true });
    writeFileSync(join(sprintsDir, 'sprint-054.md'), '# Sprint sprint-054 content');
    writeFileSync(join(sprintsDir, 'sprint-055.md'), '# Sprint sprint-055 content');
    writeFileSync(join(brainDir, 'RETRO.md'), '# Sprint sprint-055 Retrospective');

    const prev = loadPreviousRetro(testRoot);
    expect(prev).toContain('sprint-054');
  });

  it('returns last sprint file when no current retro exists', () => {
    const sprintsDir = join(testRoot, '.brain', 'sprints');
    mkdirSync(sprintsDir, { recursive: true });
    writeFileSync(join(sprintsDir, 'sprint-050.md'), '# Sprint sprint-050 content');

    const prev = loadPreviousRetro(testRoot);
    expect(prev).toContain('sprint-050');
  });
});
