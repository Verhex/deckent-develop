import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}));

import * as fs from 'node:fs';
import { AgentPoolManager } from '../../src/core/agent-pool.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { AgentDefinition } from '../../src/core/agent-types.js';

const ROOT = '/test/project';

function makeAgent(overrides: Partial<AgentDefinition> & { id: string; name: string }): AgentDefinition {
  return createAgentDefinition(overrides);
}

function mockDirEntry(name: string, isDir = true) {
  return { name, isDirectory: () => isDir } as unknown as fs.Dirent;
}

describe('AgentPoolManager', () => {
  let manager: AgentPoolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new AgentPoolManager(ROOT);
  });

  // ─── loadAgents ──────────────────────────────────────────────────────────────

  describe('loadAgents', () => {
    it('returns empty pool when no directories exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const pool = manager.loadAgents();
      expect(pool.size).toBe(0);
    });

    it('loads agents from .deckent/agents/', () => {
      const agent = makeAgent({ id: 'test-agent', name: 'Test Agent' });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('test-agent')] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agent));

      const pool = manager.loadAgents();
      expect(pool.has('test-agent')).toBe(true);
    });

    it('loads agents from .tasks/agents/ (temp agents)', () => {
      const agent = makeAgent({ id: 'temp-agent', name: 'Temp Agent' });

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p);
        // Only .tasks/agents/ exists, not .deckent/agents/
        if (s.includes('.tasks/agents')) return true;
        if (s.includes('.deckent/agents') && !s.includes('.tasks')) return false;
        if (s.includes('agent.json')) return true;
        return false;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('sprint-001-temp-agent')] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agent));

      const pool = manager.loadAgents();
      expect(pool.has('temp-agent')).toBe(true);
    });

    it('skips non-directory entries', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('README.md', false)] as any);
      const pool = manager.loadAgents();
      expect(pool.size).toBe(0);
    });

    it('skips directories without agent.json', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p);
        if (s.endsWith('agent.json')) return false;
        return true;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('orphan')] as any);
      const pool = manager.loadAgents();
      expect(pool.size).toBe(0);
    });

    it('skips directories with invalid JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('bad-agent')] as any);
      vi.mocked(fs.readFileSync).mockReturnValue('NOT_JSON');
      const pool = manager.loadAgents();
      expect(pool.size).toBe(0);
    });

    it('skips agents that fail validation', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('invalid')] as any);
      // Missing required 'id' and 'name'
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ foo: 'bar' }));
      const pool = manager.loadAgents();
      expect(pool.size).toBe(0);
    });

    it('handles readdirSync throwing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation(() => { throw new Error('permission denied'); });
      const pool = manager.loadAgents();
      expect(pool.size).toBe(0);
    });
  });

  // ─── saveAgent ───────────────────────────────────────────────────────────────

  describe('saveAgent', () => {
    it('creates directory and writes agent.json', () => {
      const agent = makeAgent({ id: 'my-agent', name: 'My Agent' });
      manager.saveAgent(agent);
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('my-agent'),
        { recursive: true },
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('agent.json'),
        expect.stringContaining('"id": "my-agent"'),
        'utf8',
      );
    });

    it('writes valid JSON with trailing newline', () => {
      const agent = makeAgent({ id: 'x', name: 'X' });
      manager.saveAgent(agent);
      const written = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      expect(written.endsWith('\n')).toBe(true);
      expect(() => JSON.parse(written)).not.toThrow();
    });
  });

  // ─── removeAgent ─────────────────────────────────────────────────────────────

  describe('removeAgent', () => {
    it('returns false when agent dir does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(manager.removeAgent('nonexistent')).toBe(false);
    });

    it('removes the directory and returns true', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const result = manager.removeAgent('my-agent');
      expect(result).toBe(true);
      expect(fs.rmSync).toHaveBeenCalledWith(
        expect.stringContaining('my-agent'),
        { recursive: true, force: true },
      );
    });
  });

  // ─── getAgent ────────────────────────────────────────────────────────────────

  describe('getAgent', () => {
    it('returns undefined when agent not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(manager.getAgent('nope')).toBeUndefined();
    });

    it('returns the agent when found', () => {
      const agent = makeAgent({ id: 'found', name: 'Found' });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('found')] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agent));

      const result = manager.getAgent('found');
      expect(result).toBeDefined();
      expect(result!.id).toBe('found');
    });
  });

  // ─── listAgents ──────────────────────────────────────────────────────────────

  describe('listAgents', () => {
    it('returns empty array when no agents', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(manager.listAgents()).toEqual([]);
    });

    it('returns all agents as array', () => {
      const a1 = makeAgent({ id: 'a1', name: 'A1' });
      const a2 = makeAgent({ id: 'a2', name: 'A2' });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      // First call for .deckent/agents/, second call for .tasks/agents/
      vi.mocked(fs.readdirSync)
        .mockReturnValueOnce([mockDirEntry('a1'), mockDirEntry('a2')] as any)
        .mockReturnValueOnce([] as any);
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(a1))
        .mockReturnValueOnce(JSON.stringify(a2));

      const list = manager.listAgents();
      expect(list).toHaveLength(2);
    });
  });

  // ─── listEnabled ─────────────────────────────────────────────────────────────

  describe('listEnabled', () => {
    it('filters out disabled agents', () => {
      const enabled = makeAgent({ id: 'e1', name: 'Enabled', enabled: true });
      const disabled = makeAgent({ id: 'd1', name: 'Disabled', enabled: false });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      // First call for .deckent/agents/, second for .tasks/agents/
      vi.mocked(fs.readdirSync)
        .mockReturnValueOnce([mockDirEntry('e1'), mockDirEntry('d1')] as any)
        .mockReturnValueOnce([] as any);
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(enabled))
        .mockReturnValueOnce(JSON.stringify(disabled));

      const list = manager.listEnabled();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('e1');
    });
  });

  // ─── createTempAgent ─────────────────────────────────────────────────────────

  describe('createTempAgent', () => {
    it('creates temp agent directory with sprint prefix', () => {
      const agent = makeAgent({ id: 'temp1', name: 'Temp1' });
      manager.createTempAgent('sprint-005', agent);
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('sprint-005-temp1'),
        { recursive: true },
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('agent.json'),
        expect.stringContaining('"id": "temp1"'),
        'utf8',
      );
    });
  });

  // ─── cleanupTempAgents ───────────────────────────────────────────────────────

  describe('cleanupTempAgents', () => {
    it('does nothing when .tasks/agents does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      manager.cleanupTempAgents('sprint-005');
      expect(fs.rmSync).not.toHaveBeenCalled();
    });

    it('removes only directories matching the sprint prefix', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        mockDirEntry('sprint-005-a1'),
        mockDirEntry('sprint-005-a2'),
        mockDirEntry('sprint-006-b1'),
      ] as any);

      manager.cleanupTempAgents('sprint-005');
      expect(fs.rmSync).toHaveBeenCalledTimes(2);
      expect(fs.rmSync).toHaveBeenCalledWith(
        expect.stringContaining('sprint-005-a1'),
        { recursive: true, force: true },
      );
      expect(fs.rmSync).toHaveBeenCalledWith(
        expect.stringContaining('sprint-005-a2'),
        { recursive: true, force: true },
      );
    });

    it('handles readdirSync throwing gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation(() => { throw new Error('fail'); });
      // Should not throw
      manager.cleanupTempAgents('sprint-005');
      expect(fs.rmSync).not.toHaveBeenCalled();
    });
  });

  // ─── updateAgentStats ────────────────────────────────────────────────────────

  describe('updateAgentStats', () => {
    it('does nothing if agent not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      manager.updateAgentStats('nonexistent', 'DONE', 90, 'sprint-001');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('increments totalUses on DONE', () => {
      const agent = makeAgent({ id: 'ua1', name: 'UA1' });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('ua1')] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agent));

      manager.updateAgentStats('ua1', 'DONE', 95, 'sprint-002');

      const written = JSON.parse(
        (vi.mocked(fs.writeFileSync).mock.calls[0][1] as string),
      );
      expect(written.stats.totalUses).toBe(1);
      expect(written.stats.successRate).toBe(1);
      expect(written.stats.avgCoverage).toBe(95);
      expect(written.stats.lastUsedInSprint).toBe('sprint-002');
    });

    it('counts GO_WITH_TECH_DEBT as success', () => {
      const agent = makeAgent({ id: 'ua2', name: 'UA2' });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('ua2')] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agent));

      manager.updateAgentStats('ua2', 'GO_WITH_TECH_DEBT', 70, 'sprint-003');

      const written = JSON.parse(
        (vi.mocked(fs.writeFileSync).mock.calls[0][1] as string),
      );
      expect(written.stats.successRate).toBe(1);
    });

    it('counts NO_GO as failure (successRate goes down)', () => {
      const agent = makeAgent({
        id: 'ua3',
        name: 'UA3',
        stats: {
          totalUses: 1,
          successRate: 1.0,
          avgCoverage: 90,
          lastUsedInSprint: 'sprint-001',
        },
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('ua3')] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agent));

      manager.updateAgentStats('ua3', 'NO_GO', 0, 'sprint-002');

      const written = JSON.parse(
        (vi.mocked(fs.writeFileSync).mock.calls[0][1] as string),
      );
      expect(written.stats.totalUses).toBe(2);
      expect(written.stats.successRate).toBe(0.5); // 1 success out of 2
    });
  });
});

// ─── validateAgentDefinition (Task 12) ──────────────────────────────────────

describe('AgentPoolManager.validateAgentDefinition', () => {
  it('returns valid for a complete AgentDefinition', () => {
    const agent = makeAgent({ id: 'valid', name: 'Valid Agent' });
    const result = AgentPoolManager.validateAgentDefinition(agent);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects null', () => {
    const result = AgentPoolManager.validateAgentDefinition(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Agent definition must be a non-null object');
  });

  it('rejects array', () => {
    const result = AgentPoolManager.validateAgentDefinition([]);
    expect(result.valid).toBe(false);
  });

  it('rejects non-object', () => {
    const result = AgentPoolManager.validateAgentDefinition('string');
    expect(result.valid).toBe(false);
  });

  it('rejects missing id', () => {
    const result = AgentPoolManager.validateAgentDefinition({ name: 'X' });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('"id"'),
    ]));
  });

  it('rejects missing name', () => {
    const result = AgentPoolManager.validateAgentDefinition({ id: 'x' });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('"name"'),
    ]));
  });

  it('rejects empty string id', () => {
    const result = AgentPoolManager.validateAgentDefinition({ id: '  ', name: 'X' });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid preferredModel', () => {
    const result = AgentPoolManager.validateAgentDefinition({
      id: 'x', name: 'X', preferredModel: 'gpt-4',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('"preferredModel"'),
    ]));
  });

  it('accepts valid preferredModel values', () => {
    for (const model of ['opus', 'sonnet', 'haiku']) {
      const result = AgentPoolManager.validateAgentDefinition({
        id: 'x', name: 'X', preferredModel: model,
      });
      expect(result.errors.filter((e) => e.includes('preferredModel'))).toEqual([]);
    }
  });

  it('rejects invalid source', () => {
    const result = AgentPoolManager.validateAgentDefinition({
      id: 'x', name: 'X', source: 'external',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('"source"'),
    ]));
  });

  it('rejects effortMultiplier out of range (too low)', () => {
    const result = AgentPoolManager.validateAgentDefinition({
      id: 'x', name: 'X', effortMultiplier: 0.05,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('0.1 and 3.0'),
    ]));
  });

  it('rejects effortMultiplier out of range (too high)', () => {
    const result = AgentPoolManager.validateAgentDefinition({
      id: 'x', name: 'X', effortMultiplier: 5.0,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects non-number effortMultiplier', () => {
    const result = AgentPoolManager.validateAgentDefinition({
      id: 'x', name: 'X', effortMultiplier: 'high',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('"effortMultiplier" must be a number'),
    ]));
  });

  it('rejects non-boolean persistent', () => {
    const result = AgentPoolManager.validateAgentDefinition({
      id: 'x', name: 'X', persistent: 'yes',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('"persistent"'),
    ]));
  });

  it('rejects non-array triggerKeywords', () => {
    const result = AgentPoolManager.validateAgentDefinition({
      id: 'x', name: 'X', triggerKeywords: 'test',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('"triggerKeywords"'),
    ]));
  });

  it('rejects triggerKeywords with non-string items', () => {
    const result = AgentPoolManager.validateAgentDefinition({
      id: 'x', name: 'X', triggerKeywords: [123],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid stats (not an object)', () => {
    const result = AgentPoolManager.validateAgentDefinition({
      id: 'x', name: 'X', stats: 'bad',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('"stats" must be an object'),
    ]));
  });

  it('rejects stats with non-number totalUses', () => {
    const result = AgentPoolManager.validateAgentDefinition({
      id: 'x', name: 'X', stats: { totalUses: 'five' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('"stats.totalUses"'),
    ]));
  });

  it('accepts minimal valid object (only id + name)', () => {
    const result = AgentPoolManager.validateAgentDefinition({ id: 'min', name: 'Min' });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('returns multiple errors at once', () => {
    const result = AgentPoolManager.validateAgentDefinition({
      preferredModel: 'invalid',
      effortMultiplier: -1,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3); // id, name, model, effort
  });

  it('rejects non-string description', () => {
    const result = AgentPoolManager.validateAgentDefinition({
      id: 'x', name: 'X', description: 123,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('"description"'),
    ]));
  });
});
