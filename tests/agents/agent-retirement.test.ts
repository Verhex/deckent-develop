import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { AgentRetirement } from '../../src/agents/agent-retirement.js';
import type { RetirementStats } from '../../src/agents/agent-retirement.js';

vi.mock('node:fs');

const ROOT = '/tmp/test-project';

function makeStats(overrides: Partial<RetirementStats> = {}): RetirementStats {
  return {
    successRate: 0.2,
    totalUses: 15,
    sprintsParticipated: 6,
    ...overrides,
  };
}

describe('AgentRetirement', () => {
  let retirement: AgentRetirement;

  beforeEach(() => {
    vi.restoreAllMocks();
    retirement = new AgentRetirement(ROOT);
  });

  // ─── evaluateForRetirement ─────────────────────────────────────

  describe('evaluateForRetirement', () => {
    it('recommends retirement when all criteria met', () => {
      const result = retirement.evaluateForRetirement('agent-1', makeStats(), 'user');
      expect(result.shouldRetire).toBe(true);
      expect(result.reasons.some(r => r.includes('Success rate'))).toBe(true);
    });

    it('does not retire built-in agents', () => {
      const result = retirement.evaluateForRetirement('agent-1', makeStats(), 'builtin');
      expect(result.shouldRetire).toBe(false);
      expect(result.reasons[0]).toContain('Built-in');
    });

    it('does not retire with too few uses', () => {
      const result = retirement.evaluateForRetirement('agent-1', makeStats({ totalUses: 3 }), 'user');
      expect(result.shouldRetire).toBe(false);
      expect(result.reasons.some(r => r.includes('uses'))).toBe(true);
    });

    it('does not retire with too few sprints', () => {
      const result = retirement.evaluateForRetirement('agent-1', makeStats({ sprintsParticipated: 2 }), 'user');
      expect(result.shouldRetire).toBe(false);
      expect(result.reasons.some(r => r.includes('sprints'))).toBe(true);
    });

    it('does not retire with adequate success rate', () => {
      const result = retirement.evaluateForRetirement('agent-1', makeStats({ successRate: 0.5 }), 'user');
      expect(result.shouldRetire).toBe(false);
    });

    it('respects custom config thresholds', () => {
      const result = retirement.evaluateForRetirement(
        'agent-1',
        makeStats({ successRate: 0.4 }),
        'user',
        { minSuccessRate: 0.5, minSprints: 3, minUses: 5 },
      );
      expect(result.shouldRetire).toBe(true);
    });

    it('handles learned source same as user', () => {
      const result = retirement.evaluateForRetirement('agent-1', makeStats(), 'learned');
      expect(result.shouldRetire).toBe(true);
    });
  });

  // ─── retire ────────────────────────────────────────────────────

  describe('retire', () => {
    it('moves agent to retired directory', () => {
      const agentData = { id: 'agent-1', source: 'user', stats: { successRate: 0.2, totalUses: 15 } };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agentData));
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
      vi.mocked(fs.rmSync).mockReturnValue(undefined);

      const result = retirement.retire('agent-1', 'Low performance');
      expect(result).toBe(true);
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
      expect(fs.rmSync).toHaveBeenCalled();
    });

    it('returns false when agent file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = retirement.retire('agent-1', 'reason');
      expect(result).toBe(false);
    });

    it('prevents retiring built-in agents', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ source: 'builtin' }));
      const result = retirement.retire('agent-1', 'reason');
      expect(result).toBe(false);
    });

    it('returns false on invalid JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('not-json');
      const result = retirement.retire('agent-1', 'reason');
      expect(result).toBe(false);
    });
  });

  // ─── reinstate ─────────────────────────────────────────────────

  describe('reinstate', () => {
    it('restores agent from retired to active', () => {
      const agentData = { id: 'agent-1', source: 'user' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agentData));
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
      vi.mocked(fs.rmSync).mockReturnValue(undefined);

      const result = retirement.reinstate('agent-1');
      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(fs.rmSync).toHaveBeenCalled();
    });

    it('returns false when retired agent not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = retirement.reinstate('agent-1');
      expect(result).toBe(false);
    });

    it('returns false on invalid JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('bad-json');
      const result = retirement.reinstate('agent-1');
      expect(result).toBe(false);
    });
  });

  // ─── listRetired ──────────────────────────────────────────────

  describe('listRetired', () => {
    it('returns empty array when retired dir does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(retirement.listRetired()).toEqual([]);
    });

    it('returns retired records', () => {
      const record = { id: 'agent-1', retiredAt: '2026-01-01T00:00:00Z', reason: 'Low perf', stats: {}, source: 'user' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'agent-1', isDirectory: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(record));

      const records = retirement.listRetired();
      expect(records).toHaveLength(1);
      expect(records[0].id).toBe('agent-1');
    });

    it('skips non-directory entries', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'file.txt', isDirectory: () => false },
      ] as unknown as fs.Dirent[]);
      expect(retirement.listRetired()).toEqual([]);
    });

    it('skips invalid retired.json', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'agent-1', isDirectory: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue('not-json');
      expect(retirement.listRetired()).toEqual([]);
    });

    it('returns empty on readdir error', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation(() => { throw new Error('EACCES'); });
      expect(retirement.listRetired()).toEqual([]);
    });
  });
});
