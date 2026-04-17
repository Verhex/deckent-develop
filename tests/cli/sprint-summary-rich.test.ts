import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  formatRichSummary,
  formatDuration,
  type RichSummaryData,
  type RichTaskResult,
  type RichAgentPerf,
  type RichSkillPerf,
  type RichCostEntry,
} from '../../src/cli/helpers/sprint-summary-rich.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function makeData(overrides: Partial<RichSummaryData> = {}): RichSummaryData {
  return {
    sprintId: 'sprint-144',
    sprintNumber: 144,
    startedAt: '2026-04-17T08:00:00.000Z',
    completedAt: '2026-04-17T10:00:00.000Z',
    phase: 'RETRO',
    tasks: [
      { id: 't-001', title: 'Init split', status: 'DONE', agent: 'refactorer' },
      { id: 't-002', title: 'Doctor split', status: 'DONE', agent: 'refactorer' },
      { id: 't-003', title: 'Dead code', status: 'GO_WITH_TECH_DEBT', agent: 'refactorer' },
      { id: 't-004', title: 'ADR fix', status: 'NO_GO', agent: 'architect' },
    ],
    agentPerf: [
      { agentId: 'refactorer', tasks: 3, done: 2, techDebt: 1, noGo: 0, successRate: 67 },
      { agentId: 'architect', tasks: 1, done: 0, techDebt: 0, noGo: 1, successRate: 0 },
    ],
    skillPerf: [
      { skillId: 'typescript-expert', tasks: 4, done: 3, successRate: 75 },
    ],
    costs: [
      { provider: 'claude', model: 'opus', inputTokens: 15000, outputTokens: 4000, estimatedCostUsd: 0.25 },
      { provider: 'claude', model: 'sonnet', inputTokens: 8000, outputTokens: 2000, estimatedCostUsd: 0.05 },
    ],
    adrChecksTotal: 4,
    adrChecksCompliant: 3,
    adrViolations: ['ADR-008: worker imports from CLI'],
    recommendations: [],
    coveragePercent: 75.5,
    ...overrides,
  };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('formatRichSummary — ADR-020 7-section rich summary', () => {
  let savedNoColor: string | undefined;

  beforeEach(() => {
    savedNoColor = process.env['NO_COLOR'];
    delete process.env['NO_COLOR'];
  });

  afterEach(() => {
    if (savedNoColor !== undefined) {
      process.env['NO_COLOR'] = savedNoColor;
    } else {
      delete process.env['NO_COLOR'];
    }
  });

  // ── Test 1: Overview section renders correctly ───────────────────────────

  it('renders §1 header with sprint ID and duration', () => {
    const output = stripAnsi(formatRichSummary(makeData()));
    expect(output).toContain('Sprint #144 (sprint-144)');
    expect(output).toContain('2h 0m'); // 2-hour duration
    expect(output).toContain('RETRO');
  });

  it('renders §1 header with date from startedAt', () => {
    const output = stripAnsi(formatRichSummary(makeData()));
    expect(output).toContain('Date:');
    // The date "2026-04-17T08:00..." should produce some date string
    expect(output).toMatch(/Date:\s+\S/);
  });

  it('renders §1 header using durationMs when no timestamps provided', () => {
    const output = stripAnsi(formatRichSummary(makeData({
      startedAt: undefined,
      completedAt: undefined,
      durationMs: 3600_000,
    })));
    expect(output).toContain('1h 0m');
  });

  // ── Test 2: Task Results section ─────────────────────────────────────────

  it('renders §2 task results with DONE/NO_GO/TECH_DEBT counts', () => {
    const output = stripAnsi(formatRichSummary(makeData()));
    expect(output).toContain('§2 Task Results');
    expect(output).toContain('2 DONE');
    expect(output).toContain('1 TECH_DEBT');
    expect(output).toContain('1 NO_GO');
    expect(output).toContain('total: 4');
  });

  it('renders §2 task table with task IDs and titles', () => {
    const output = stripAnsi(formatRichSummary(makeData()));
    expect(output).toContain('t-001');
    expect(output).toContain('Init split');
    expect(output).toContain('t-004');
    expect(output).toContain('ADR fix');
  });

  it('shows TECH_DEBT status label instead of GO_WITH_TECH_DEBT', () => {
    const output = stripAnsi(formatRichSummary(makeData()));
    expect(output).toContain('TECH_DEBT');
    expect(output).not.toContain('GO_WITH_TECH_DEBT');
  });

  // ── Test 3: Agent/Skill Performance section ───────────────────────────────

  it('renders §3 agent performance with success rates', () => {
    const output = stripAnsi(formatRichSummary(makeData()));
    expect(output).toContain('§3 Agent / Skill Performance');
    expect(output).toContain('refactorer');
    expect(output).toContain('67%');
    expect(output).toContain('architect');
    expect(output).toContain('0%');
  });

  it('renders §3 skill performance rows', () => {
    const output = stripAnsi(formatRichSummary(makeData()));
    expect(output).toContain('typescript-expert');
    expect(output).toContain('75%');
  });

  it('shows placeholder when no agent data provided', () => {
    const output = stripAnsi(formatRichSummary(makeData({ agentPerf: undefined, skillPerf: undefined })));
    expect(output).toContain('§3 Agent / Skill Performance');
    expect(output).toContain('No agent performance data available');
  });

  // ── Test 4: Dependency Map DOT format ────────────────────────────────────

  it('renders §4 dependency map with DOT format when dependencies exist', () => {
    const tasks: RichTaskResult[] = [
      { id: 'A', title: 'Task A', status: 'DONE' },
      { id: 'B', title: 'Task B', status: 'DONE', dependencies: ['A'] },
      { id: 'C', title: 'Task C', status: 'NO_GO', dependencies: ['A', 'B'] },
    ];
    const output = stripAnsi(formatRichSummary(makeData({ tasks })));
    expect(output).toContain('§4 Dependency Map (DOT)');
    expect(output).toContain('digraph sprint');
    expect(output).toContain('"A" -> "B"');
    expect(output).toContain('"A" -> "C"');
    expect(output).toContain('"B" -> "C"');
    expect(output).toContain('rankdir=LR');
  });

  it('renders §4 with no-deps placeholder when no dependencies', () => {
    const output = stripAnsi(formatRichSummary(makeData()));
    expect(output).toContain('§4 Dependency Map (DOT)');
    expect(output).toContain('No task dependencies defined');
    expect(output).toContain('digraph sprint');
  });

  // ── Test 5: Cost Breakdown section ───────────────────────────────────────

  it('renders §5 cost breakdown with provider, model, and tokens', () => {
    const output = stripAnsi(formatRichSummary(makeData()));
    expect(output).toContain('§5 Cost Breakdown');
    expect(output).toContain('claude');
    expect(output).toContain('opus');
    expect(output).toContain('sonnet');
    expect(output).toContain('15000');
    expect(output).toContain('TOTAL');
  });

  it('shows total cost sum in §5', () => {
    const output = stripAnsi(formatRichSummary(makeData()));
    // Total is 0.25 + 0.05 = 0.30
    expect(output).toContain('$0.3000');
  });

  it('shows placeholder when no cost data', () => {
    const output = stripAnsi(formatRichSummary(makeData({ costs: undefined })));
    expect(output).toContain('§5 Cost Breakdown');
    expect(output).toContain('No token usage data recorded');
  });

  // ── Test 6: ADR Compliance Score ─────────────────────────────────────────

  it('renders §6 ADR compliance score with percentage', () => {
    const output = stripAnsi(formatRichSummary(makeData()));
    expect(output).toContain('§6 ADR Compliance Score');
    expect(output).toContain('75%'); // 3/4
    expect(output).toContain('3/4 tasks compliant');
  });

  it('shows ADR violations in §6', () => {
    const output = stripAnsi(formatRichSummary(makeData()));
    expect(output).toContain('ADR-008: worker imports from CLI');
  });

  it('shows 100% message when fully compliant', () => {
    const output = stripAnsi(formatRichSummary(makeData({
      adrChecksTotal: 4,
      adrChecksCompliant: 4,
      adrViolations: [],
    })));
    expect(output).toContain('100%');
    expect(output).toContain('All tasks comply with active ADRs');
  });

  it('computes compliance from task.adrCompliant when no explicit totals', () => {
    const tasks: RichTaskResult[] = [
      { id: 'a', title: 'A', status: 'DONE', adrCompliant: true },
      { id: 'b', title: 'B', status: 'DONE', adrCompliant: false },
    ];
    const output = stripAnsi(formatRichSummary(makeData({
      tasks,
      adrChecksTotal: undefined,
      adrChecksCompliant: undefined,
    })));
    expect(output).toContain('§6 ADR Compliance Score');
    // 1/2 = 50%
    expect(output).toContain('50%');
  });

  // ── Test 7: Recommendations section ─────────────────────────────────────

  it('renders §7 recommendations section', () => {
    const output = stripAnsi(formatRichSummary(makeData()));
    expect(output).toContain('§7 Recommendations');
  });

  it('auto-generates NO_GO fix recommendation', () => {
    const output = stripAnsi(formatRichSummary(makeData()));
    expect(output).toContain('→ Fix 1 NO_GO task(s): t-004');
  });

  it('auto-generates tech debt recommendation', () => {
    const output = stripAnsi(formatRichSummary(makeData()));
    expect(output).toContain('→ Resolve 1 tech debt item(s)');
  });

  it('auto-generates coverage recommendation when below 80%', () => {
    const output = stripAnsi(formatRichSummary(makeData({ coveragePercent: 60 })));
    expect(output).toContain('→ Improve test coverage from 60.0% to 80%+');
  });

  it('shows "ready for next sprint" when all tasks done', () => {
    const tasks: RichTaskResult[] = [
      { id: 'a', title: 'A', status: 'DONE' },
      { id: 'b', title: 'B', status: 'DONE' },
    ];
    const output = stripAnsi(formatRichSummary(makeData({
      tasks,
      coveragePercent: 90,
      adrChecksTotal: 2,
      adrChecksCompliant: 2,
      adrViolations: [],
      recommendations: [],
    })));
    expect(output).toContain('→ All tasks complete');
    expect(output).toContain('ready for next sprint');
  });

  it('uses custom recommendations when provided', () => {
    const output = stripAnsi(formatRichSummary(makeData({
      recommendations: ['Custom action item 1', 'Custom action item 2'],
    })));
    expect(output).toContain('→ Custom action item 1');
    expect(output).toContain('→ Custom action item 2');
  });

  // ── Test 8: NO_COLOR support ──────────────────────────────────────────────

  it('strips ANSI codes when NO_COLOR is set', () => {
    process.env['NO_COLOR'] = '1';
    const output = formatRichSummary(makeData());
    // Should contain no ANSI escape sequences
    expect(output).not.toMatch(/\x1b\[[0-9;]*m/);
    // But should still have content
    expect(output).toContain('Sprint #144');
    expect(output).toContain('§2 Task Results');
    expect(output).toContain('§7 Recommendations');
  });

  it('includes ANSI codes when NO_COLOR is not set', () => {
    delete process.env['NO_COLOR'];
    const output = formatRichSummary(makeData());
    expect(output).toMatch(/\x1b\[[0-9;]*m/);
  });

  // ── Test 9: All 7 sections present ───────────────────────────────────────

  it('produces output containing all 7 section headers', () => {
    const output = stripAnsi(formatRichSummary(makeData()));
    // §1 is the header (no explicit §1 label but contains sprint info)
    expect(output).toContain('Sprint #144');
    expect(output).toContain('§2 Task Results');
    expect(output).toContain('§3 Agent / Skill Performance');
    expect(output).toContain('§4 Dependency Map (DOT)');
    expect(output).toContain('§5 Cost Breakdown');
    expect(output).toContain('§6 ADR Compliance Score');
    expect(output).toContain('§7 Recommendations');
  });

  // ── Test 10: formatDuration helper ───────────────────────────────────────

  it('formatDuration handles hours and minutes', () => {
    expect(formatDuration(3_600_000)).toBe('1h 0m');
    expect(formatDuration(7_200_000)).toBe('2h 0m');
    expect(formatDuration(5_400_000)).toBe('1h 30m');
  });

  it('formatDuration handles minutes and seconds', () => {
    expect(formatDuration(90_000)).toBe('1m 30s');
    expect(formatDuration(60_000)).toBe('1m 0s');
  });

  it('formatDuration handles seconds only', () => {
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(0)).toBe('0s');
  });

  // ── Test 11: Empty tasks fallback ────────────────────────────────────────

  it('renders gracefully with empty tasks array', () => {
    const output = stripAnsi(formatRichSummary(makeData({ tasks: [] })));
    expect(output).toContain('§2 Task Results');
    expect(output).toContain('0 DONE');
    expect(output).toContain('0 TECH_DEBT');
    expect(output).toContain('0 NO_GO');
    expect(output).toContain('total: 0');
  });

  // ── Test 12: Sprint without number ────────────────────────────────────────

  it('handles sprint without number field', () => {
    const output = stripAnsi(formatRichSummary(makeData({ sprintNumber: undefined })));
    expect(output).toContain('sprint-144');
  });
});
