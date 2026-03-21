import { describe, it, expect } from 'vitest';
import { AgentPerformanceFormatter } from '../../../src/cli/helpers/agent-performance.js';
import type { TaskEvaluation } from '../../../src/core/types.js';

describe('AgentPerformanceFormatter', () => {
  const formatter = new AgentPerformanceFormatter();

  // ─── groupByAgent ─────────────────────────────────────────────────

  describe('groupByAgent', () => {
    it('groups evaluations by agent', () => {
      const evaluations = new Map<string, TaskEvaluation | string>([
        ['t1', 'DONE'],
        ['t2', 'NO_GO'],
      ]);
      const taskAgentMap = new Map([['t1', 'agent-a'], ['t2', 'agent-b']]);
      const groups = formatter.groupByAgent(evaluations, taskAgentMap);
      expect(groups.get('agent-a')).toHaveLength(1);
      expect(groups.get('agent-b')).toHaveLength(1);
    });

    it('uses "unknown" for unmapped tasks', () => {
      const evaluations = new Map<string, TaskEvaluation | string>([['t1', 'DONE']]);
      const taskAgentMap = new Map<string, string>();
      const groups = formatter.groupByAgent(evaluations, taskAgentMap);
      expect(groups.has('unknown')).toBe(true);
    });

    it('groups multiple tasks under same agent', () => {
      const evaluations = new Map<string, TaskEvaluation | string>([
        ['t1', 'DONE'],
        ['t2', 'DONE'],
      ]);
      const taskAgentMap = new Map([['t1', 'agent-a'], ['t2', 'agent-a']]);
      const groups = formatter.groupByAgent(evaluations, taskAgentMap);
      expect(groups.get('agent-a')).toHaveLength(2);
    });
  });

  // ─── calculateStats ──────────────────────────────────────────────

  describe('calculateStats', () => {
    it('calculates correct stats for single agent', () => {
      const groups = new Map([
        ['agent-a', [
          { taskId: 't1', evaluation: 'DONE' },
          { taskId: 't2', evaluation: 'NO_GO' },
        ]],
      ]);
      const stats = formatter.calculateStats(groups);
      expect(stats).toHaveLength(1);
      expect(stats[0]!.agentId).toBe('agent-a');
      expect(stats[0]!.doneTasks).toBe(1);
      expect(stats[0]!.noGoTasks).toBe(1);
      expect(stats[0]!.successRate).toBe(50);
    });

    it('sorts by success rate descending', () => {
      const groups = new Map([
        ['bad-agent', [{ taskId: 't1', evaluation: 'NO_GO' }]],
        ['good-agent', [{ taskId: 't2', evaluation: 'DONE' }]],
      ]);
      const stats = formatter.calculateStats(groups);
      expect(stats[0]!.agentId).toBe('good-agent');
      expect(stats[1]!.agentId).toBe('bad-agent');
    });

    it('counts tech debt tasks', () => {
      const groups = new Map([
        ['agent-a', [
          { taskId: 't1', evaluation: 'GO_WITH_TECH_DEBT' },
        ]],
      ]);
      const stats = formatter.calculateStats(groups);
      expect(stats[0]!.techDebtTasks).toBe(1);
    });

    it('returns 0 success rate for all NO_GO', () => {
      const groups = new Map([
        ['agent-a', [
          { taskId: 't1', evaluation: 'NO_GO' },
          { taskId: 't2', evaluation: 'NO_GO' },
        ]],
      ]);
      const stats = formatter.calculateStats(groups);
      expect(stats[0]!.successRate).toBe(0);
    });

    it('returns 100 success rate for all DONE', () => {
      const groups = new Map([
        ['agent-a', [
          { taskId: 't1', evaluation: 'DONE' },
          { taskId: 't2', evaluation: 'DONE' },
        ]],
      ]);
      const stats = formatter.calculateStats(groups);
      expect(stats[0]!.successRate).toBe(100);
    });
  });

  // ─── format ───────────────────────────────────────────────────────

  describe('format', () => {
    it('returns "No agent performance data" when empty', () => {
      const result = formatter.format(new Map(), new Map());
      expect(result).toBe('No agent performance data');
    });

    it('includes agent id and success rate', () => {
      const evaluations = new Map<string, TaskEvaluation | string>([['t1', 'DONE']]);
      const taskAgentMap = new Map([['t1', 'agent-a']]);
      const result = formatter.format(evaluations, taskAgentMap);
      expect(result).toContain('agent-a');
      expect(result).toContain('100%');
    });

    it('marks underperformers with label', () => {
      const evaluations = new Map<string, TaskEvaluation | string>([
        ['t1', 'NO_GO'],
        ['t2', 'NO_GO'],
        ['t3', 'DONE'],
      ]);
      const taskAgentMap = new Map([['t1', 'bad'], ['t2', 'bad'], ['t3', 'bad']]);
      const result = formatter.format(evaluations, taskAgentMap);
      expect(result).toContain('[UNDERPERFORMER]');
    });

    it('does not mark high performers as underperformers', () => {
      const evaluations = new Map<string, TaskEvaluation | string>([
        ['t1', 'DONE'],
        ['t2', 'DONE'],
      ]);
      const taskAgentMap = new Map([['t1', 'good'], ['t2', 'good']]);
      const result = formatter.format(evaluations, taskAgentMap);
      expect(result).not.toContain('[UNDERPERFORMER]');
    });

    it('shows tech debt count when present', () => {
      const evaluations = new Map<string, TaskEvaluation | string>([
        ['t1', 'GO_WITH_TECH_DEBT'],
      ]);
      const taskAgentMap = new Map([['t1', 'agent-a']]);
      const result = formatter.format(evaluations, taskAgentMap);
      expect(result).toContain('Tech Debt: 1');
    });

    it('shows NO_GO count when present', () => {
      const evaluations = new Map<string, TaskEvaluation | string>([
        ['t1', 'NO_GO'],
      ]);
      const taskAgentMap = new Map([['t1', 'agent-a']]);
      const result = formatter.format(evaluations, taskAgentMap);
      expect(result).toContain('NO_GO: 1');
    });

    it('contains header line', () => {
      const evaluations = new Map<string, TaskEvaluation | string>([['t1', 'DONE']]);
      const taskAgentMap = new Map([['t1', 'a']]);
      const result = formatter.format(evaluations, taskAgentMap);
      expect(result).toContain('Agent Performance:');
    });
  });
});
