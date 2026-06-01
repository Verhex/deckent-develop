import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import {
  CrossSprintAnalyzer,
  analyzeTrend,
  type SprintTrendPoint,
} from '../../src/orchestra/cross-sprint-analyzer.js';

vi.mock('node:fs');

const ROOT = '/tmp/test-project';
const LEARNINGS_PATH = `${ROOT}/.deckent/routing/learnings.json`;

function makeLearnings(overrides: Partial<{
  recentSprints: string[];
  agentPerformance: Record<string, unknown>;
  skillPerformance: Record<string, unknown>;
  skillSprintHistory: Record<string, Record<string, { successCount: number; failCount: number; avgCoverage: number }>>;
}> = {}) {
  return JSON.stringify({
    version: 1,
    updatedAt: '2026-06-01T00:00:00Z',
    totalOutcomes: 10,
    agentPerformance: {},
    skillPerformance: {},
    synergyMatrix: [],
    recentSprints: [],
    skillSprintHistory: {},
    ...overrides,
  });
}

function makeOutcomes(outcomes: Array<{ agentId?: string | null; evaluation: string }>) {
  return JSON.stringify(outcomes);
}

describe('analyzeTrend', () => {
  it('returns stable for single value', () => {
    expect(analyzeTrend([0.8])).toBe('stable');
  });

  it('returns stable for equal values', () => {
    expect(analyzeTrend([0.8, 0.8, 0.8, 0.8])).toBe('stable');
  });

  it('returns improving when second half is clearly higher', () => {
    // first half avg = 0.4, second half avg = 0.9
    expect(analyzeTrend([0.3, 0.5, 0.85, 0.95])).toBe('improving');
  });

  it('returns deteriorating when second half is clearly lower', () => {
    // first half avg = 0.9, second half avg = 0.3
    expect(analyzeTrend([0.85, 0.95, 0.3, 0.3])).toBe('deteriorating');
  });

  it('returns stable when difference is within threshold', () => {
    // diff = 0.02 which is < 0.05
    expect(analyzeTrend([0.8, 0.82])).toBe('stable');
  });
});

describe('CrossSprintAnalyzer', () => {
  let analyzer: CrossSprintAnalyzer;

  beforeEach(() => {
    vi.restoreAllMocks();
    analyzer = new CrossSprintAnalyzer(ROOT);
  });

  it('returns empty report when learnings.json does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const report = analyzer.analyze(5);
    expect(report.sprints).toHaveLength(0);
    expect(report.analyzedSprintCount).toBe(0);
    expect(report.trends.agentTrends).toHaveLength(0);
    expect(report.trends.skillTrends).toHaveLength(0);
    expect(report.trends.noGoTrend).toBe('stable');
  });

  it('returns empty report when no sprints in learnings', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === LEARNINGS_PATH);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p) === LEARNINGS_PATH) return makeLearnings({ recentSprints: [] });
      throw new Error('not found');
    });

    const report = analyzer.analyze(5);
    expect(report.sprints).toHaveLength(0);
    expect(report.analyzedSprintCount).toBe(0);
  });

  it('computes trend points from skill sprint history', () => {
    const sprintIds = ['sprint-100', 'sprint-101', 'sprint-102', 'sprint-103'];
    const skillSprintHistory = {
      'typescript-expert': {
        'sprint-100': { successCount: 3, failCount: 1, avgCoverage: 0.8 },
        'sprint-101': { successCount: 4, failCount: 0, avgCoverage: 0.9 },
        'sprint-102': { successCount: 4, failCount: 0, avgCoverage: 0.95 },
        'sprint-103': { successCount: 5, failCount: 0, avgCoverage: 1.0 },
      },
    };

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      return s === LEARNINGS_PATH || s.includes('/outcomes/');
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p) === LEARNINGS_PATH) {
        return makeLearnings({ recentSprints: sprintIds, skillSprintHistory });
      }
      // outcomes files return empty arrays
      return makeOutcomes([]);
    });

    const report = analyzer.analyze(10);
    expect(report.analyzedSprintCount).toBe(4);
    expect(report.sprints).toHaveLength(4);

    const firstPoint = report.sprints[0];
    expect(firstPoint.sprintId).toBe('sprint-100');
    // successCount=3, failCount=1 → 0.75
    expect(firstPoint.skillSuccessRates['typescript-expert']).toBeCloseTo(0.75);
  });

  it('detects improving skill trend', () => {
    const sprintIds = ['sprint-100', 'sprint-101', 'sprint-102', 'sprint-103'];
    const skillSprintHistory = {
      'typescript-expert': {
        'sprint-100': { successCount: 1, failCount: 9, avgCoverage: 0.1 }, // 0.1
        'sprint-101': { successCount: 2, failCount: 8, avgCoverage: 0.2 }, // 0.2
        'sprint-102': { successCount: 9, failCount: 1, avgCoverage: 0.9 }, // 0.9
        'sprint-103': { successCount: 10, failCount: 0, avgCoverage: 1.0 }, // 1.0
      },
    };

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      return s === LEARNINGS_PATH || s.includes('/outcomes/');
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p) === LEARNINGS_PATH) {
        return makeLearnings({ recentSprints: sprintIds, skillSprintHistory });
      }
      return makeOutcomes([]);
    });

    const report = analyzer.analyze(10);
    const skillTrend = report.trends.skillTrends.find(t => t.entityId === 'typescript-expert');
    expect(skillTrend).toBeDefined();
    expect(skillTrend!.direction).toBe('improving');
    expect(skillTrend!.secondHalfAvg).toBeGreaterThan(skillTrend!.firstHalfAvg);
  });

  it('detects deteriorating skill trend', () => {
    const sprintIds = ['sprint-100', 'sprint-101', 'sprint-102', 'sprint-103'];
    const skillSprintHistory = {
      'security-specialist': {
        'sprint-100': { successCount: 9, failCount: 1, avgCoverage: 0.9 }, // 0.9
        'sprint-101': { successCount: 10, failCount: 0, avgCoverage: 1.0 }, // 1.0
        'sprint-102': { successCount: 1, failCount: 9, avgCoverage: 0.1 }, // 0.1
        'sprint-103': { successCount: 0, failCount: 10, avgCoverage: 0.0 }, // 0.0
      },
    };

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      return s === LEARNINGS_PATH || s.includes('/outcomes/');
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p) === LEARNINGS_PATH) {
        return makeLearnings({ recentSprints: sprintIds, skillSprintHistory });
      }
      return makeOutcomes([]);
    });

    const report = analyzer.analyze(10);
    const skillTrend = report.trends.skillTrends.find(t => t.entityId === 'security-specialist');
    expect(skillTrend).toBeDefined();
    expect(skillTrend!.direction).toBe('deteriorating');
    expect(skillTrend!.secondHalfAvg).toBeLessThan(skillTrend!.firstHalfAvg);
  });

  it('computes agent success rates from outcomes files', () => {
    const sprintIds = ['sprint-200'];
    const outcomes = [
      { agentId: 'refactorer', evaluation: 'DONE' },
      { agentId: 'refactorer', evaluation: 'DONE' },
      { agentId: 'refactorer', evaluation: 'NO_GO' },
      { agentId: null, evaluation: 'DONE' },
    ];

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      return s === LEARNINGS_PATH || s.includes('sprint-200.json');
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p) === LEARNINGS_PATH) {
        return makeLearnings({ recentSprints: sprintIds });
      }
      return makeOutcomes(outcomes);
    });

    const report = analyzer.analyze(5);
    expect(report.sprints).toHaveLength(1);
    const point = report.sprints[0];
    expect(point.totalTasks).toBe(4);
    expect(point.noGoCount).toBe(1);
    // refactorer: 2 success / 3 total ≈ 0.667
    expect(point.agentSuccessRates['refactorer']).toBeCloseTo(2 / 3);
  });

  it('handles corrupt outcomes file gracefully', () => {
    const sprintIds = ['sprint-200'];

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      return s === LEARNINGS_PATH || s.includes('sprint-200.json');
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p) === LEARNINGS_PATH) {
        return makeLearnings({ recentSprints: sprintIds });
      }
      return 'not-json';
    });

    // Should not throw
    const report = analyzer.analyze(5);
    expect(report.sprints).toHaveLength(1);
    expect(report.sprints[0].totalTasks).toBe(0);
  });

  it('respects n limit — takes last n sprints', () => {
    const sprintIds = ['sprint-100', 'sprint-101', 'sprint-102', 'sprint-103', 'sprint-104'];

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      return s === LEARNINGS_PATH || s.includes('/outcomes/');
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p) === LEARNINGS_PATH) {
        return makeLearnings({ recentSprints: sprintIds });
      }
      return makeOutcomes([]);
    });

    const report = analyzer.analyze(3);
    expect(report.analyzedSprintCount).toBe(3);
    expect(report.sprints.map(p => p.sprintId)).toEqual(['sprint-102', 'sprint-103', 'sprint-104']);
  });
});
