import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { AgentPerfAnalyzer } from '../../src/agents/cross-sprint-analyzer.js';
import type { SprintEntry, SprintRange } from '../../src/agents/cross-sprint-analyzer.js';

vi.mock('node:fs');

const ROOT = '/tmp/test-project';

function makeEntry(overrides: Partial<SprintEntry> = {}): SprintEntry {
  return {
    sprintId: 'sprint-001',
    evaluation: 'DONE',
    coverage: 80,
    taskType: 'feature',
    ...overrides,
  };
}

function makeLearningFile(entries: Array<SprintEntry & { agentId: string }>) {
  return JSON.stringify(entries);
}

describe('AgentPerfAnalyzer', () => {
  let analyzer: AgentPerfAnalyzer;
  const range: SprintRange = { from: 'sprint-001', to: 'sprint-010' };

  beforeEach(() => {
    vi.restoreAllMocks();
    analyzer = new AgentPerfAnalyzer(ROOT);
  });

  // ─── Empty / missing data ───────────────────────────────────────

  it('returns empty report when learning dir does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const report = analyzer.analyze('agent-1', range);
    expect(report.agentId).toBe('agent-1');
    expect(report.sprintsAnalyzed).toBe(0);
    expect(report.successTrend).toEqual([]);
    expect(report.improvementSuggestions).toEqual([]);
  });

  it('returns empty report when directory read fails', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockImplementation(() => { throw new Error('EACCES'); });
    const report = analyzer.analyze('agent-1', range);
    expect(report.sprintsAnalyzed).toBe(0);
  });

  it('returns empty report when no entries match agent', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(['data.json'] as unknown as fs.Dirent[]);
    vi.mocked(fs.readFileSync).mockReturnValue(makeLearningFile([
      { agentId: 'other-agent', sprintId: 'sprint-001', evaluation: 'DONE', coverage: 90, taskType: 'feature' },
    ]));
    const report = analyzer.analyze('agent-1', range);
    expect(report.sprintsAnalyzed).toBe(0);
  });

  // ─── _inRange ───────────────────────────────────────────────────

  it('filters entries within sprint range', () => {
    expect(analyzer._inRange('sprint-005', { from: 'sprint-001', to: 'sprint-010' })).toBe(true);
    expect(analyzer._inRange('sprint-011', { from: 'sprint-001', to: 'sprint-010' })).toBe(false);
    expect(analyzer._inRange('', { from: 'sprint-001', to: 'sprint-010' })).toBe(false);
  });

  // ─── Success trend ─────────────────────────────────────────────

  it('computes success trend per sprint', () => {
    const entries: SprintEntry[] = [
      makeEntry({ sprintId: 'sprint-001', evaluation: 'DONE' }),
      makeEntry({ sprintId: 'sprint-001', evaluation: 'NO_GO' }),
      makeEntry({ sprintId: 'sprint-002', evaluation: 'DONE' }),
      makeEntry({ sprintId: 'sprint-002', evaluation: 'DONE' }),
    ];
    const sprintIds = analyzer._uniqueSprintIds(entries);
    const trend = analyzer._computeSuccessTrend(entries, sprintIds);
    expect(trend).toEqual([0.5, 1.0]);
  });

  it('counts GO_WITH_TECH_DEBT as success in trend', () => {
    const entries: SprintEntry[] = [
      makeEntry({ sprintId: 'sprint-001', evaluation: 'GO_WITH_TECH_DEBT' }),
    ];
    const trend = analyzer._computeSuccessTrend(entries, ['sprint-001']);
    expect(trend).toEqual([1.0]);
  });

  // ─── Coverage trend ────────────────────────────────────────────

  it('computes coverage trend per sprint', () => {
    const entries: SprintEntry[] = [
      makeEntry({ sprintId: 'sprint-001', coverage: 60 }),
      makeEntry({ sprintId: 'sprint-001', coverage: 80 }),
      makeEntry({ sprintId: 'sprint-002', coverage: 90 }),
    ];
    const sprintIds = analyzer._uniqueSprintIds(entries);
    const trend = analyzer._computeCoverageTrend(entries, sprintIds);
    expect(trend).toEqual([70, 90]);
  });

  // ─── Task type distribution ────────────────────────────────────

  it('computes task type distribution', () => {
    const entries: SprintEntry[] = [
      makeEntry({ taskType: 'feature' }),
      makeEntry({ taskType: 'feature' }),
      makeEntry({ taskType: 'bugfix' }),
    ];
    const dist = analyzer._computeTaskTypeDistribution(entries);
    expect(dist).toEqual({ feature: 2, bugfix: 1 });
  });

  // ─── Best / worst task type ────────────────────────────────────

  it('identifies best and worst task types', () => {
    const entries: SprintEntry[] = [
      makeEntry({ taskType: 'feature', evaluation: 'DONE' }),
      makeEntry({ taskType: 'feature', evaluation: 'DONE' }),
      makeEntry({ taskType: 'bugfix', evaluation: 'NO_GO' }),
      makeEntry({ taskType: 'bugfix', evaluation: 'NO_GO' }),
    ];
    const { best, worst } = analyzer._computeBestWorstTaskType(entries);
    expect(best).toBe('feature');
    expect(worst).toBe('bugfix');
  });

  it('handles single task type for best and worst', () => {
    const entries: SprintEntry[] = [
      makeEntry({ taskType: 'test', evaluation: 'DONE' }),
    ];
    const { best, worst } = analyzer._computeBestWorstTaskType(entries);
    expect(best).toBe('test');
    expect(worst).toBe('test');
  });

  // ─── Suggestions ───────────────────────────────────────────────

  it('suggests improvement when success rate is low', () => {
    const suggestions = analyzer._generateSuggestions(
      [0.3, 0.2],
      [80, 85],
      { feature: 5 },
      [
        makeEntry({ evaluation: 'NO_GO' }),
        makeEntry({ evaluation: 'NO_GO' }),
        makeEntry({ evaluation: 'DONE' }),
        makeEntry({ evaluation: 'NO_GO' }),
      ],
    );
    expect(suggestions.some(s => s.includes('success rate'))).toBe(true);
  });

  it('suggests coverage improvement when average is low', () => {
    const suggestions = analyzer._generateSuggestions(
      [1.0],
      [40, 50],
      { feature: 2 },
      [makeEntry({ coverage: 45 })],
    );
    expect(suggestions.some(s => s.includes('coverage'))).toBe(true);
  });

  it('detects declining success trend', () => {
    const suggestions = analyzer._generateSuggestions(
      [0.9, 0.7, 0.5],
      [80, 80, 80],
      { feature: 3 },
      [makeEntry()],
    );
    expect(suggestions.some(s => s.includes('declining'))).toBe(true);
  });

  it('detects over-concentration on single task type', () => {
    const suggestions = analyzer._generateSuggestions(
      [1.0],
      [80],
      { feature: 9, bugfix: 1 },
      [makeEntry()],
    );
    expect(suggestions.some(s => s.includes('concentrated'))).toBe(true);
  });

  it('returns no suggestions for healthy agent', () => {
    const suggestions = analyzer._generateSuggestions(
      [1.0, 1.0],
      [90, 95],
      { feature: 5, bugfix: 5 },
      [makeEntry(), makeEntry()],
    );
    expect(suggestions).toEqual([]);
  });

  // ─── Full analyze flow ─────────────────────────────────────────

  it('produces full report from learning files', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(['sprint.json'] as unknown as fs.Dirent[]);
    vi.mocked(fs.readFileSync).mockReturnValue(makeLearningFile([
      { agentId: 'agent-1', sprintId: 'sprint-001', evaluation: 'DONE', coverage: 85, taskType: 'feature' },
      { agentId: 'agent-1', sprintId: 'sprint-002', evaluation: 'NO_GO', coverage: 60, taskType: 'bugfix' },
      { agentId: 'agent-1', sprintId: 'sprint-003', evaluation: 'DONE', coverage: 90, taskType: 'feature' },
    ]));
    const report = analyzer.analyze('agent-1', range);
    expect(report.agentId).toBe('agent-1');
    expect(report.sprintsAnalyzed).toBe(3);
    expect(report.successTrend).toHaveLength(3);
    expect(report.coverageTrend).toHaveLength(3);
    expect(report.taskTypeDistribution).toEqual({ feature: 2, bugfix: 1 });
    expect(report.bestTaskType).toBe('feature');
    expect(report.worstTaskType).toBe('bugfix');
  });

  it('skips invalid JSON files gracefully', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(['bad.json', 'good.json'] as unknown as fs.Dirent[]);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).includes('bad')) return 'not-json{{{';
      return makeLearningFile([
        { agentId: 'agent-1', sprintId: 'sprint-001', evaluation: 'DONE', coverage: 80, taskType: 'feature' },
      ]);
    });
    const report = analyzer.analyze('agent-1', range);
    expect(report.sprintsAnalyzed).toBe(1);
  });

  it('skips non-array JSON files', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(['obj.json'] as unknown as fs.Dirent[]);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ not: 'array' }));
    const report = analyzer.analyze('agent-1', range);
    expect(report.sprintsAnalyzed).toBe(0);
  });

  it('only reads .json files from learning dir', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(['data.json', 'readme.md', 'notes.txt'] as unknown as fs.Dirent[]);
    vi.mocked(fs.readFileSync).mockReturnValue(makeLearningFile([
      { agentId: 'agent-1', sprintId: 'sprint-001', evaluation: 'DONE', coverage: 80, taskType: 'feature' },
    ]));
    analyzer.analyze('agent-1', range);
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });
});
