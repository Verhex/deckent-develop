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
import { AgentPoolManager, isTempAgentStale, DEFAULT_MAX_TEMP_AGENTS, DEFAULT_MAX_AGENT_AGE } from '../../src/core/agent-pool.js';
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

    it('skips directories without agent.json (readJsonSafe returns null for missing file)', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true); // dir exists
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('orphan')] as any);
      // Simulate missing agent.json by making readFileSync throw ENOENT
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); });
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

  // ─── saveTempAgentToPool ─────────────────────────────────────────────────────

  describe('saveTempAgentToPool', () => {
    it('saves agent to .deckent/agents/temp-{id}/ directory', () => {
      const agent = makeAgent({ id: 'temp-react-ts-specialist', name: 'React TS Specialist' });
      manager.saveTempAgentToPool(agent);
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('temp-react-ts-specialist'),
        { recursive: true },
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('agent.json'),
        expect.any(String),
        'utf8',
      );
    });

    it('adds temp- prefix when agent id does not already have it', () => {
      const agent = makeAgent({ id: 'react-ts-specialist', name: 'React TS Specialist' });
      manager.saveTempAgentToPool(agent);
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('temp-react-ts-specialist'),
        { recursive: true },
      );
    });

    it('saves to .deckent/agents/ path (not .tasks/agents/)', () => {
      const agent = makeAgent({ id: 'temp-go-specialist', name: 'Go Specialist' });
      manager.saveTempAgentToPool(agent);
      const mkdirCall = vi.mocked(fs.mkdirSync).mock.calls[0]![0] as string;
      expect(mkdirCall).toContain('.deckent/agents');
      expect(mkdirCall).not.toContain('.tasks/agents');
    });
  });

  // ─── cleanupPersistentTempAgents ─────────────────────────────────────────────

  describe('cleanupPersistentTempAgents', () => {
    it('returns 0 when .deckent/agents/ does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const count = manager.cleanupPersistentTempAgents();
      expect(count).toBe(0);
    });

    it('removes all directories starting with temp-', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        mockDirEntry('temp-react-ts-specialist'),
        mockDirEntry('temp-go-specialist'),
        mockDirEntry('security-auditor'),
      ] as any);

      manager.cleanupPersistentTempAgents();

      expect(fs.rmSync).toHaveBeenCalledTimes(2);
      const calls = vi.mocked(fs.rmSync).mock.calls.map((c) => String(c[0]));
      expect(calls.some((p) => p.includes('temp-react-ts-specialist'))).toBe(true);
      expect(calls.some((p) => p.includes('temp-go-specialist'))).toBe(true);
      expect(calls.every((p) => !p.includes('security-auditor'))).toBe(true);
    });

    it('returns count of removed agents', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        mockDirEntry('temp-a'),
        mockDirEntry('temp-b'),
        mockDirEntry('builtin-c'),
      ] as any);

      const count = manager.cleanupPersistentTempAgents();
      expect(count).toBe(2);
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

// ─── isTempAgentStale ────────────────────────────────────────────────────────

describe('isTempAgentStale', () => {
  it('returns true when lastUsedInSprint is empty', () => {
    expect(isTempAgentStale('', 'sprint-037', 5)).toBe(true);
  });

  it('returns false when difference equals maxAge exactly (boundary)', () => {
    expect(isTempAgentStale('sprint-032', 'sprint-037', 5)).toBe(false);
  });

  it('returns true when difference exceeds maxAge by 1', () => {
    expect(isTempAgentStale('sprint-031', 'sprint-037', 5)).toBe(true);
  });

  it('returns false when agent was used recently (within maxAge)', () => {
    expect(isTempAgentStale('sprint-035', 'sprint-037', 5)).toBe(false);
  });

  it('returns false when sprint IDs cannot be parsed (safe default)', () => {
    expect(isTempAgentStale('unknown', 'sprint-037', 5)).toBe(false);
  });

  it('returns false when currentSprintId cannot be parsed', () => {
    expect(isTempAgentStale('sprint-001', 'invalid-id', 5)).toBe(false);
  });

  it('handles zero-padded sprint IDs correctly', () => {
    expect(isTempAgentStale('sprint-001', 'sprint-010', 5)).toBe(true);  // diff = 9
    expect(isTempAgentStale('sprint-006', 'sprint-010', 5)).toBe(false); // diff = 4
  });

  it('handles maxAge=0 (evict everything not used in current sprint)', () => {
    expect(isTempAgentStale('sprint-036', 'sprint-037', 0)).toBe(true);  // diff = 1 > 0
    expect(isTempAgentStale('sprint-037', 'sprint-037', 0)).toBe(false); // diff = 0
  });
});

// ─── LRU eviction in loadAgents ──────────────────────────────────────────────

describe('AgentPoolManager LRU eviction (loadAgents)', () => {
  let manager: AgentPoolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create a manager that allows max 3 temp agents
    manager = new AgentPoolManager(ROOT, 3);
  });

  it('loads all temp agents when count <= maxTempAgents', () => {
    const agents = [
      makeAgent({ id: 'a1', name: 'A1', stats: { totalUses: 1, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-010' } }),
      makeAgent({ id: 'a2', name: 'A2', stats: { totalUses: 1, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-009' } }),
    ];

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      if (s.includes('.tasks/agents')) return true;
      if (s.includes('.deckent/agents') && !s.includes('.tasks')) return false;
      if (s.includes('agent.json')) return true;
      return false;
    });
    vi.mocked(fs.readdirSync).mockReturnValue([
      mockDirEntry('sprint-010-a1'),
      mockDirEntry('sprint-009-a2'),
    ] as any);
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(agents[0]))
      .mockReturnValueOnce(JSON.stringify(agents[1]));

    const pool = manager.loadAgents();
    expect(pool.size).toBe(2);
  });

  it('keeps only the maxTempAgents most recent agents when over limit', () => {
    // 5 agents but max is 3 — should keep sprint-010, sprint-009, sprint-008
    const agents = [
      makeAgent({ id: 'a1', name: 'A1', stats: { totalUses: 1, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-005' } }),
      makeAgent({ id: 'a2', name: 'A2', stats: { totalUses: 1, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-010' } }),
      makeAgent({ id: 'a3', name: 'A3', stats: { totalUses: 1, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-007' } }),
      makeAgent({ id: 'a4', name: 'A4', stats: { totalUses: 1, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-008' } }),
      makeAgent({ id: 'a5', name: 'A5', stats: { totalUses: 1, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-009' } }),
    ];

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      if (s.includes('.tasks/agents')) return true;
      if (s.includes('.deckent/agents') && !s.includes('.tasks')) return false;
      if (s.includes('agent.json')) return true;
      return false;
    });
    vi.mocked(fs.readdirSync).mockReturnValue(
      agents.map((a) => mockDirEntry(`sprint-xxx-${a.id}`)) as any,
    );
    for (const a of agents) {
      vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(a));
    }

    const pool = manager.loadAgents();
    expect(pool.size).toBe(3);
    // The 3 most recent should be a2 (010), a5 (009), a4 (008)
    expect(pool.has('a2')).toBe(true);
    expect(pool.has('a5')).toBe(true);
    expect(pool.has('a4')).toBe(true);
    expect(pool.has('a1')).toBe(false); // sprint-005 — evicted
    expect(pool.has('a3')).toBe(false); // sprint-007 — evicted
  });

  it('DEFAULT_MAX_TEMP_AGENTS is 50', () => {
    expect(DEFAULT_MAX_TEMP_AGENTS).toBe(50);
  });

  it('DEFAULT_MAX_AGENT_AGE is 5', () => {
    expect(DEFAULT_MAX_AGENT_AGE).toBe(5);
  });

  it('persistent agents are never evicted by LRU', () => {
    const persistentAgent = makeAgent({ id: 'p1', name: 'P1', source: 'builtin' });
    const tempAgent = makeAgent({ id: 't1', name: 'T1', stats: { totalUses: 1, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-001' } });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync)
      .mockReturnValueOnce([mockDirEntry('p1')] as any)  // .deckent/agents/
      .mockReturnValueOnce([mockDirEntry('sprint-001-t1')] as any); // .tasks/agents/
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(persistentAgent))
      .mockReturnValueOnce(JSON.stringify(tempAgent));

    const pool = manager.loadAgents();
    expect(pool.has('p1')).toBe(true); // persistent agent always kept
  });
});

// ─── cleanup(maxAge) ─────────────────────────────────────────────────────────

describe('AgentPoolManager.cleanup', () => {
  let manager: AgentPoolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new AgentPoolManager(ROOT);
  });

  it('returns 0 when .tasks/agents does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(manager.cleanup(5, 'sprint-037')).toBe(0);
  });

  it('returns 0 when readdirSync throws', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockImplementation(() => { throw new Error('fail'); });
    expect(manager.cleanup(5, 'sprint-037')).toBe(0);
  });

  it('removes stale temp agents and returns count', () => {
    const staleAgent = makeAgent({
      id: 'stale-1',
      name: 'Stale',
      source: 'user',
      stats: { totalUses: 1, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-010' },
    });
    const freshAgent = makeAgent({
      id: 'fresh-1',
      name: 'Fresh',
      source: 'user',
      stats: { totalUses: 1, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-034' },
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([
      mockDirEntry('sprint-010-stale-1'),
      mockDirEntry('sprint-034-fresh-1'),
    ] as any);
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(staleAgent))
      .mockReturnValueOnce(JSON.stringify(freshAgent));

    const removed = manager.cleanup(5, 'sprint-037');
    expect(removed).toBe(1);
    expect(fs.rmSync).toHaveBeenCalledWith(
      expect.stringContaining('sprint-010-stale-1'),
      { recursive: true, force: true },
    );
    expect(fs.rmSync).not.toHaveBeenCalledWith(
      expect.stringContaining('sprint-034-fresh-1'),
      expect.anything(),
    );
  });

  it('never removes builtin agents', () => {
    const builtinAgent = makeAgent({
      id: 'builtin-1',
      name: 'Builtin',
      source: 'builtin',
      stats: { totalUses: 1, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-001' },
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('sprint-001-builtin-1')] as any);
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(builtinAgent));

    const removed = manager.cleanup(5, 'sprint-037');
    expect(removed).toBe(0);
    expect(fs.rmSync).not.toHaveBeenCalled();
  });

  it('infers current sprint from highest lastUsedInSprint when not provided', () => {
    const staleAgent = makeAgent({
      id: 'stale-a',
      name: 'Stale A',
      source: 'user',
      stats: { totalUses: 1, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-010' },
    });
    const recentAgent = makeAgent({
      id: 'recent-a',
      name: 'Recent A',
      source: 'user',
      stats: { totalUses: 1, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-037' },
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([
      mockDirEntry('sprint-010-stale-a'),
      mockDirEntry('sprint-037-recent-a'),
    ] as any);
    // cleanup reads each file twice: once to find max sprint, once to evict
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(staleAgent))
      .mockReturnValueOnce(JSON.stringify(recentAgent))
      .mockReturnValueOnce(JSON.stringify(staleAgent))
      .mockReturnValueOnce(JSON.stringify(recentAgent));

    const removed = manager.cleanup(5); // no currentSprintId — infer from data
    expect(removed).toBe(1);
  });

  it('returns 0 when no agents have parseable sprint IDs and no currentSprintId given', () => {
    const agentNoSprint = makeAgent({
      id: 'nosprint',
      name: 'No Sprint',
      source: 'user',
      stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('nosprint')] as any);
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(agentNoSprint));

    const removed = manager.cleanup(5);
    expect(removed).toBe(0);
  });

  it('skips directories without agent.json (readJsonSafe returns null for missing file)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('orphan-dir')] as any);
    // Simulate missing agent.json — readFileSync throws
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); });

    const removed = manager.cleanup(5, 'sprint-037');
    expect(removed).toBe(0);
    expect(fs.rmSync).not.toHaveBeenCalled();
  });

  it('skips invalid agent.json files during cleanup', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('broken-agent')] as any);
    vi.mocked(fs.readFileSync).mockReturnValueOnce('INVALID_JSON');

    const removed = manager.cleanup(5, 'sprint-037');
    expect(removed).toBe(0);
  });

  it('removes all stale agents when many are old', () => {
    const staleAgents = [
      makeAgent({ id: 'old1', name: 'Old1', source: 'user', stats: { totalUses: 1, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-001' } }),
      makeAgent({ id: 'old2', name: 'Old2', source: 'learned', stats: { totalUses: 1, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-002' } }),
    ];

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([
      mockDirEntry('sprint-001-old1'),
      mockDirEntry('sprint-002-old2'),
    ] as any);
    for (const a of staleAgents) {
      vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(a));
    }

    const removed = manager.cleanup(5, 'sprint-037');
    expect(removed).toBe(2);
    expect(fs.rmSync).toHaveBeenCalledTimes(2);
  });
});

// ─── Batch Read (Task 037-006) ────────────────────────────────────────────────

describe('AgentPoolManager batch read (loadAgents — O(N+1) syscalls)', () => {
  let manager: AgentPoolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new AgentPoolManager(ROOT);
  });

  it('calls readdirSync exactly once per directory (O(N+1) pattern)', () => {
    const agent = makeAgent({ id: 'batch-agent', name: 'Batch Agent' });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('batch-agent')] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agent));

    manager.loadAgents();

    // readdirSync called once per dir (persistent + temp = 2 calls total)
    expect(fs.readdirSync).toHaveBeenCalledTimes(2);
  });

  it('does NOT call existsSync for individual agent.json files', () => {
    const agent = makeAgent({ id: 'no-exists-check', name: 'No Exists Check' });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('no-exists-check')] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agent));

    manager.loadAgents();

    // existsSync should only be called for directory-level checks (persistent dir + temp dir)
    // NOT for individual agent.json file paths
    const existsCalls = vi.mocked(fs.existsSync).mock.calls.map((c) => String(c[0]));
    const agentJsonCalls = existsCalls.filter((p) => p.endsWith('agent.json'));
    expect(agentJsonCalls).toHaveLength(0);
  });

  it('loads multiple agents from a single directory in one batch', () => {
    const agents = [
      makeAgent({ id: 'batch-1', name: 'Batch 1' }),
      makeAgent({ id: 'batch-2', name: 'Batch 2' }),
      makeAgent({ id: 'batch-3', name: 'Batch 3' }),
    ];
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync)
      .mockReturnValueOnce(agents.map((a) => mockDirEntry(a.id)) as any) // persistent
      .mockReturnValueOnce([] as any); // temp
    for (const a of agents) {
      vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(a));
    }

    const pool = manager.loadAgents();
    expect(pool.size).toBe(3);
    for (const a of agents) {
      expect(pool.has(a.id)).toBe(true);
    }
  });

  it('handles mixed valid/invalid agent.json files in the same directory batch', () => {
    const validAgent = makeAgent({ id: 'valid-batch', name: 'Valid' });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync)
      .mockReturnValueOnce([
        mockDirEntry('valid-batch'),
        mockDirEntry('invalid-batch'),
        mockDirEntry('missing-batch'),
      ] as any)
      .mockReturnValueOnce([] as any);
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(validAgent))    // valid
      .mockReturnValueOnce('NOT_JSON')                    // invalid JSON
      .mockImplementationOnce(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); }); // missing

    const pool = manager.loadAgents();
    expect(pool.size).toBe(1);
    expect(pool.has('valid-batch')).toBe(true);
  });

  it('handles empty directory without calling readFileSync', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([] as any);

    manager.loadAgents();

    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it('preserves all LRU eviction logic while using batch read pattern', () => {
    // 4 temp agents but max is 2 — LRU must still evict 2 oldest
    const batchManager = new AgentPoolManager(ROOT, 2);
    const agents = [
      makeAgent({ id: 'lru-a', name: 'LRU A', stats: { totalUses: 1, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-037' } }),
      makeAgent({ id: 'lru-b', name: 'LRU B', stats: { totalUses: 1, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-036' } }),
      makeAgent({ id: 'lru-c', name: 'LRU C', stats: { totalUses: 1, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-010' } }),
      makeAgent({ id: 'lru-d', name: 'LRU D', stats: { totalUses: 1, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-005' } }),
    ];

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      if (s.includes('.tasks/agents')) return true;
      if (s.includes('.deckent/agents') && !s.includes('.tasks')) return false;
      return true;
    });
    vi.mocked(fs.readdirSync).mockReturnValue(
      agents.map((a) => mockDirEntry(`sprint-xxx-${a.id}`)) as any,
    );
    for (const a of agents) {
      vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(a));
    }

    const pool = batchManager.loadAgents();
    expect(pool.size).toBe(2);
    expect(pool.has('lru-a')).toBe(true);  // sprint-037 — most recent
    expect(pool.has('lru-b')).toBe(true);  // sprint-036 — second most recent
    expect(pool.has('lru-c')).toBe(false); // evicted
    expect(pool.has('lru-d')).toBe(false); // evicted
  });

  it('batch read result matches pre-refactor behavior for 0-agent case', () => {
    // When directory is empty, pool must be empty
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const pool = manager.loadAgents();
    expect(pool.size).toBe(0);
    expect(fs.readdirSync).not.toHaveBeenCalled();
  });
});
