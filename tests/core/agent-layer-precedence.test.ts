import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn(),
}));
vi.mock('../../src/core/memory-query.js', () => ({
  searchMemory: vi.fn().mockReturnValue([]),
}));
vi.mock('../../src/core/token-counter.js', () => ({
  TokenCounter: vi.fn().mockImplementation(() => ({
    estimatePromptSize: vi.fn().mockReturnValue({ totalTokens: 1000 }),
  })),
}));

import * as fs from 'node:fs';
import { join } from 'node:path';
import { AgentPoolManager, __setBuiltinAgentsDirForTests } from '../../src/core/agent-pool.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { AgentDefinition } from '../../src/core/agent-types.js';

// Layer-precedence table for row 7011 slice S2 (D1, owner-approved 2026-08-11):
//   L1 project override  >  L2 learned/runtime  >  L0 shipped builtin
// with L2 limited to a field-level exception on an L1 collision: only `stats` (including
// `lastUsedInSprint`) and `capabilitiesProvisional` may cross from L2 onto the L1 record.
// Every combination of L0/L1/L2 presence for one colliding id is covered below.

const ROOT = '/test/project';
const BUILTIN_DIR = '/test/builtin-agents';

const PERSISTENT_DIR = join(ROOT, '.deckent', 'agents');
const TEMP_DIR = join(ROOT, '.tasks', 'agents');
const CONFIG_PATH = join(ROOT, '.deckent', 'config.json');

function mockDirEntry(name: string, isDir = true) {
  return { name, isDirectory: () => isDir } as unknown as fs.Dirent;
}

function makeAgent(overrides: Partial<AgentDefinition> & { id: string; name: string }): AgentDefinition {
  return createAgentDefinition(overrides);
}

interface LayerFixture {
  l0?: AgentDefinition;
  l1?: AgentDefinition;
  l2?: AgentDefinition;
}

/**
 * Wire the mocked fs so exactly the given layers exist for one colliding id, mirroring
 * agent-pool.ts's real path construction (persistentDir/<id>/agent.json, tempDir/<id>/agent.json,
 * builtinDir/<id>/agent.json + its own per-entry readdirSync for PROMPT.md/agent.json listing).
 */
function setupFixture({ l0, l1, l2 }: LayerFixture): void {
  const l1Path = l1 ? join(PERSISTENT_DIR, l1.id, 'agent.json') : undefined;
  const l2Path = l2 ? join(TEMP_DIR, l2.id, 'agent.json') : undefined;
  const l0EntryDir = l0 ? join(BUILTIN_DIR, l0.id) : undefined;
  const l0Path = l0 ? join(l0EntryDir!, 'agent.json') : undefined;

  vi.mocked(fs.existsSync).mockImplementation((p) => {
    const s = String(p);
    if (s === CONFIG_PATH) return true; // gate _loadBuiltinFallback open
    if (s === PERSISTENT_DIR) return !!l1;
    if (s === TEMP_DIR) return !!l2;
    if (s === BUILTIN_DIR) return !!l0;
    return false;
  });

  vi.mocked(fs.readdirSync).mockImplementation((dir) => {
    const s = String(dir);
    if (s === PERSISTENT_DIR) return l1 ? ([mockDirEntry(l1.id)] as any) : ([] as any);
    if (s === TEMP_DIR) return l2 ? ([mockDirEntry(l2.id)] as any) : ([] as any);
    if (s === BUILTIN_DIR) return l0 ? ([mockDirEntry(l0.id)] as any) : ([] as any);
    if (l0EntryDir && s === l0EntryDir) return [mockDirEntry('agent.json', false)] as any;
    throw new Error(`unexpected readdirSync(${s})`);
  });

  vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
    const s = String(filePath);
    if (l1Path && s === l1Path) return JSON.stringify(l1);
    if (l2Path && s === l2Path) return JSON.stringify(l2);
    if (l0Path && s === l0Path) return JSON.stringify(l0);
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
}

describe('AgentPoolManager layer precedence (row 7011 D1)', () => {
  let manager: AgentPoolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    __setBuiltinAgentsDirForTests(BUILTIN_DIR);
    manager = new AgentPoolManager(ROOT);
  });

  afterEach(() => {
    __setBuiltinAgentsDirForTests(null);
  });

  describe('single-layer presence', () => {
    it('L0 only: builtin record loads', () => {
      const l0 = makeAgent({ id: 'solo-agent', name: 'L0 Solo', source: 'builtin' });
      setupFixture({ l0 });

      const pool = manager.loadAgents();
      expect(pool.get('solo-agent')?.name).toBe('L0 Solo');
    });

    it('L1 only: project override record loads', () => {
      const l1 = makeAgent({ id: 'solo-agent', name: 'L1 Solo', source: 'user' });
      setupFixture({ l1 });

      const pool = manager.loadAgents();
      expect(pool.get('solo-agent')?.name).toBe('L1 Solo');
    });

    it('L2 only: learned/runtime record loads', () => {
      const l2 = makeAgent({ id: 'solo-agent', name: 'L2 Solo', source: 'learned' });
      setupFixture({ l2 });

      const pool = manager.loadAgents();
      expect(pool.get('solo-agent')?.name).toBe('L2 Solo');
    });
  });

  describe('two-layer collisions', () => {
    it('L0 + L1 (no L2): L1 wins whole-record — unchanged pre-existing behavior', () => {
      const l0 = makeAgent({ id: 'collide-01', name: 'L0 Name', source: 'builtin' });
      const l1 = makeAgent({ id: 'collide-01', name: 'L1 Name', source: 'user' });
      setupFixture({ l0, l1 });

      const pool = manager.loadAgents();
      const resolved = pool.get('collide-01');
      expect(resolved?.name).toBe('L1 Name');
      expect(resolved?.source).toBe('user');
    });

    it('L0 + L2 (no L1): L2 wins whole-record — unchanged pre-existing behavior', () => {
      const l0 = makeAgent({ id: 'collide-02', name: 'L0 Name', source: 'builtin' });
      const l2 = makeAgent({ id: 'collide-02', name: 'L2 Name', source: 'learned' });
      setupFixture({ l0, l2 });

      const pool = manager.loadAgents();
      const resolved = pool.get('collide-02');
      expect(resolved?.name).toBe('L2 Name');
      expect(resolved?.source).toBe('learned');
    });

    it('L1 + L2 (no L0): L1 wins identity/prompt/tools; L2 composes only stats + capabilitiesProvisional', () => {
      const l1 = makeAgent({
        id: 'collide-03',
        name: 'L1 Name',
        source: 'user',
        systemPrompt: 'L1 persona',
        allowedTools: ['Read', 'Edit'],
        triggerKeywords: ['l1-keyword'],
        stats: { totalUses: 3, successRate: 1, avgCoverage: 80, lastUsedInSprint: 'sprint-005' },
        capabilitiesProvisional: false,
      });
      const l2 = makeAgent({
        id: 'collide-03',
        name: 'L2 Name',
        source: 'learned',
        systemPrompt: 'L2 persona',
        allowedTools: ['Bash'],
        triggerKeywords: ['l2-keyword'],
        stats: { totalUses: 9, successRate: 0.5, avgCoverage: 40, lastUsedInSprint: 'sprint-020' },
        capabilitiesProvisional: true,
      });
      setupFixture({ l1, l2 });

      const pool = manager.loadAgents();
      const resolved = pool.get('collide-03');
      expect(resolved).toBeDefined();

      // Identity / prompt / tool grants / routing declarations stay L1's.
      expect(resolved!.name).toBe('L1 Name');
      expect(resolved!.source).toBe('user');
      expect(resolved!.systemPrompt).toBe('L1 persona');
      expect(resolved!.allowedTools).toEqual(['Read', 'Edit']);
      expect(resolved!.triggerKeywords).toEqual(['l1-keyword']);

      // Runtime-derived fields cross from L2.
      expect(resolved!.stats).toEqual({ totalUses: 9, successRate: 0.5, avgCoverage: 40, lastUsedInSprint: 'sprint-020' });
      expect(resolved!.capabilitiesProvisional).toBe(true);
    });

    it('L1 + L2 collision: L2 without capabilitiesProvisional leaves L1 value untouched', () => {
      const l1 = makeAgent({
        id: 'collide-04',
        name: 'L1 Name',
        source: 'user',
        capabilitiesProvisional: true,
        stats: { totalUses: 1, successRate: 1, avgCoverage: 100, lastUsedInSprint: 'sprint-001' },
      });
      const l2 = makeAgent({
        id: 'collide-04',
        name: 'L2 Name',
        source: 'learned',
        stats: { totalUses: 5, successRate: 0.8, avgCoverage: 60, lastUsedInSprint: 'sprint-030' },
      });
      setupFixture({ l1, l2 });

      const pool = manager.loadAgents();
      const resolved = pool.get('collide-04');
      expect(resolved!.name).toBe('L1 Name');
      expect(resolved!.capabilitiesProvisional).toBe(true); // preserved from L1, not cleared by L2's absence
      expect(resolved!.stats.totalUses).toBe(5); // stats still fully composed from L2
    });
  });

  describe('three-layer collision', () => {
    it('L0 + L1 + L2: L0 is irrelevant once the gap is filled — same result as L1 + L2', () => {
      const l0 = makeAgent({ id: 'collide-05', name: 'L0 Name', source: 'builtin' });
      const l1 = makeAgent({
        id: 'collide-05',
        name: 'L1 Name',
        source: 'user',
        systemPrompt: 'L1 persona',
        stats: { totalUses: 2, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-002' },
      });
      const l2 = makeAgent({
        id: 'collide-05',
        name: 'L2 Name',
        source: 'learned',
        systemPrompt: 'L2 persona',
        stats: { totalUses: 7, successRate: 0.7, avgCoverage: 50, lastUsedInSprint: 'sprint-025' },
      });
      setupFixture({ l0, l1, l2 });

      const pool = manager.loadAgents();
      expect(pool.size).toBe(1);
      const resolved = pool.get('collide-05');
      expect(resolved!.name).toBe('L1 Name');
      expect(resolved!.systemPrompt).toBe('L1 persona');
      expect(resolved!.stats.totalUses).toBe(7);
    });
  });
});
