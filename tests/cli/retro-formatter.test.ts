import { describe, it, expect } from 'vitest';
import type { RichSprintSummary, AgentPerfRow, SkillPerfRow, SprintTrendEntry } from '../../src/cli/commands/retro-parser.js';
import {
  lbl,
  formatRichSummary,
  computeRetroDelta,
  formatAgentPerfTable,
  formatSkillPerfTable,
  formatTrend,
} from '../../src/cli/commands/retro-formatter.js';

// ─── lbl (i18n label helper) ─────────────────────────────────────────────

describe('lbl', () => {
  it('returns English label by default', () => {
    expect(lbl('sprintRetro', 'en')).toBe('Sprint Retrospective');
  });

  it('returns Turkish label for lang=tr', () => {
    expect(lbl('sprintRetro', 'tr')).toBe('Sprint Retrospektifi');
  });

  it('returns key for unknown label', () => {
    expect(lbl('unknownKey', 'en')).toBe('unknownKey');
  });

  it('falls back to English for unknown language', () => {
    expect(lbl('tasks', 'de')).toBe('Tasks');
  });
});

// ─── formatRichSummary ───────────────────────────────────────────────────

describe('formatRichSummary', () => {
  const makeSummary = (overrides: Partial<RichSprintSummary> = {}): RichSprintSummary => ({
    sprintId: '042',
    totalTasks: 10,
    completed: 8,
    noGo: 1,
    techDebt: 1,
    coverage: '80%',
    duration: '5m',
    raw: '',
    ...overrides,
  });

  it('shows English labels by default', () => {
    const out = formatRichSummary(makeSummary());
    expect(out).toContain('Sprint Retrospective');
    expect(out).toContain('8/10 completed');
    expect(out).toContain('80% success');
  });

  it('shows Turkish labels when lang=tr', () => {
    const out = formatRichSummary(makeSummary(), 'tr');
    expect(out).toContain('Retrospektifi');
    expect(out).toContain('tamamlandı');
  });

  it('shows 0% success for zero tasks', () => {
    const out = formatRichSummary(makeSummary({ totalTasks: 0, completed: 0 }));
    expect(out).toContain('0% success');
  });

  it('includes sprint id', () => {
    const out = formatRichSummary(makeSummary({ sprintId: 'sprint-099' }));
    expect(out).toContain('sprint-099');
  });
});

// ─── computeRetroDelta ───────────────────────────────────────────────────

describe('computeRetroDelta', () => {
  const makeSummary = (overrides: Partial<RichSprintSummary> = {}): RichSprintSummary => ({
    sprintId: 'x',
    totalTasks: 10,
    completed: 8,
    noGo: 1,
    techDebt: 1,
    coverage: '80%',
    duration: '5m',
    raw: '',
    ...overrides,
  });

  it('computes positive delta', () => {
    const current = makeSummary({ completed: 8, totalTasks: 10, noGo: 1, techDebt: 1 });
    const previous = makeSummary({ completed: 5, totalTasks: 10, noGo: 3, techDebt: 2 });
    const out = computeRetroDelta(current, previous);
    expect(out).toContain('+30%');
    expect(out).toContain('-2'); // noGo: 1-3
    expect(out).toContain('-1'); // techDebt: 1-2
  });

  it('computes negative delta', () => {
    const current = makeSummary({ completed: 3, totalTasks: 10 });
    const previous = makeSummary({ completed: 8, totalTasks: 10 });
    const out = computeRetroDelta(current, previous);
    expect(out).toContain('-50%');
  });

  it('shows Turkish labels when lang=tr', () => {
    const current = makeSummary();
    const previous = makeSummary({ completed: 6 });
    const out = computeRetroDelta(current, previous, 'tr');
    expect(out).toContain('Fark');
  });
});

// ─── formatAgentPerfTable ────────────────────────────────────────────────

describe('formatAgentPerfTable', () => {
  it('returns empty string for empty rows', () => {
    expect(formatAgentPerfTable([])).toBe('');
  });

  it('formats agent performance table', () => {
    const rows: AgentPerfRow[] = [{ agent: 'w1', tasks: '5', done: '4', debt: '1', noGo: '0', avgCoverage: '80%' }];
    const out = formatAgentPerfTable(rows);
    expect(out).toContain('Agent Performance');
    expect(out).toContain('w1');
    expect(out).toContain('80%');
  });

  it('shows Turkish title when lang=tr', () => {
    const rows: AgentPerfRow[] = [{ agent: 'w1', tasks: '5', done: '4', debt: '1', noGo: '0', avgCoverage: '80%' }];
    expect(formatAgentPerfTable(rows, 'tr')).toContain('Ajan Performansı');
  });
});

// ─── formatSkillPerfTable ────────────────────────────────────────────────

describe('formatSkillPerfTable', () => {
  it('returns empty string for empty rows', () => {
    expect(formatSkillPerfTable([])).toBe('');
  });

  it('includes skill name in output', () => {
    const rows: SkillPerfRow[] = [{ skill: 'testing-expert', tasks: '3', done: '2', debt: '1', noGo: '0' }];
    expect(formatSkillPerfTable(rows)).toContain('testing-expert');
  });
});

// ─── formatTrend ─────────────────────────────────────────────────────────

describe('formatTrend', () => {
  it('shows no trend message for empty entries', () => {
    const out = formatTrend([]);
    expect(out).toContain('enough sprint');
  });

  it('formats trend entries', () => {
    const entries: SprintTrendEntry[] = [
      { sprintId: 'sprint-041', successRate: 80, noGo: 1, techDebt: 2, coverage: '75%' },
      { sprintId: 'sprint-042', successRate: 90, noGo: 0, techDebt: 1, coverage: '80%' },
    ];
    const out = formatTrend(entries);
    expect(out).toContain('Sprint Trend');
    expect(out).toContain('sprint-041');
    expect(out).toContain('90%');
  });

  it('shows Turkish title when lang=tr', () => {
    const entries: SprintTrendEntry[] = [{ sprintId: 'sprint-042', successRate: 90, noGo: 0, techDebt: 1, coverage: '80%' }];
    expect(formatTrend(entries, 'tr')).toContain('Sprint Trendi');
  });
});
