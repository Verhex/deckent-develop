// ─── born-590 ACTIVATION-VALIDATION ──────────────────────────────────────────
// Report §root-cause-2: `activation` (the sole real routing-score input) was
// never validated at pool-load time, and any invalid manifest (broken JSON,
// schema-violating activation, missing required field) was dropped from the
// pool with ZERO visible signal. These tests prove:
//   1. Each of the 3 broken-manifest fixture classes (bozuk-JSON,
//      şema-dışı-activation, eksik-alan) is excluded from the pool AND
//      surfaced via getInvalidCount()/getInvalidManifests() + debugLog.
//   2. Every currently-shipped-shape valid manifest (mirroring the real
//      .deckent/skills/*/manifest.json / .deckent/agents/*/agent.json
//      activation shape) still loads unchanged — no narrowing regression.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

import * as fs from 'node:fs';
import { SkillPoolManager } from '../../src/core/skill-pool.js';
import { AgentPoolManager } from '../../src/core/agent-pool.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { AgentDefinition } from '../../src/core/agent-types.js';

const ROOT = '/test/project';

function mockDirEntry(name: string, isDir = true) {
  return { name, isDirectory: () => isDir } as unknown as fs.Dirent;
}

/** The real activation shape shipped in .deckent/skills/api-builder/manifest.json. */
const REAL_ACTIVATION_SHAPE = {
  rules: [{ when: { domains: { $contains: 'api' } }, score: 8 }],
  exclude: [],
  minScore: 5,
};

function makeSkill(overrides: Partial<SkillDefinition> & { id: string; name: string }): SkillDefinition {
  return createSkillDefinition(overrides);
}

function makeAgent(overrides: Partial<AgentDefinition> & { id: string; name: string }): AgentDefinition {
  return createAgentDefinition(overrides);
}

describe('born-590: activation validation + visible-signal (SkillPoolManager)', () => {
  let manager: SkillPoolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SkillPoolManager(ROOT);
  });

  it('starts with zero invalid count before any load', () => {
    expect(manager.getInvalidCount()).toBe(0);
    expect(manager.getInvalidManifests()).toEqual([]);
  });

  it('control: a real-shaped valid manifest (with activation) loads unchanged, invalidCount stays 0', () => {
    const skill = makeSkill({ id: 'api-builder-like', name: 'API Builder Like', activation: REAL_ACTIVATION_SHAPE });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('api-builder-like')] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skill));

    const pool = manager.loadSkills();

    expect(pool.has('api-builder-like')).toBe(true);
    expect(manager.getInvalidCount()).toBe(0);
    expect(manager.getInvalidManifests()).toEqual([]);
  });

  it('control: a manifest with no activation field at all still loads unchanged (behavior not narrowed)', () => {
    const skill = makeSkill({ id: 'no-activation', name: 'No Activation' });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('no-activation')] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skill));

    const pool = manager.loadSkills();

    expect(pool.has('no-activation')).toBe(true);
    expect(manager.getInvalidCount()).toBe(0);
  });

  it('bozuk-JSON: corrupt manifest.json is excluded from pool AND visibly counted', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('corrupt-skill')] as any);
    vi.mocked(fs.readFileSync).mockReturnValue('{ this is not valid JSON');

    const pool = manager.loadSkills();

    expect(pool.size).toBe(0);
    expect(manager.getInvalidCount()).toBe(1);
    const [entry] = manager.getInvalidManifests();
    expect(entry.id).toBe('corrupt-skill');
    expect(entry.path).toContain('manifest.json');
    expect(entry.errors.join(' ')).toMatch(/invalid JSON|unreadable/);
  });

  it('şema-dışı-activation: activation.rules is a string (not an array) is excluded AND counted', () => {
    const skill: Record<string, unknown> = {
      ...makeSkill({ id: 'bad-activation-shape', name: 'Bad Activation Shape' }),
      activation: { rules: 'not-an-array', exclude: [], minScore: 5 },
    };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('bad-activation-shape')] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skill));

    const pool = manager.loadSkills();

    expect(pool.has('bad-activation-shape')).toBe(false);
    expect(manager.getInvalidCount()).toBe(1);
    expect(manager.getInvalidManifests()[0].errors.some(e => e.includes('activation'))).toBe(true);
  });

  it('şema-dışı-activation: a rule missing "score" is excluded AND counted', () => {
    const skill: Record<string, unknown> = {
      ...makeSkill({ id: 'rule-missing-score', name: 'Rule Missing Score' }),
      activation: { rules: [{ when: { 'intent.primary': 'security' } }], exclude: [], minScore: 5 },
    };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('rule-missing-score')] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skill));

    const pool = manager.loadSkills();

    expect(pool.has('rule-missing-score')).toBe(false);
    expect(manager.getInvalidCount()).toBe(1);
  });

  it('eksik-alan: a manifest missing the required "id" field is excluded AND counted', () => {
    const skill = { name: 'Missing Id' };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('missing-id-dir')] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skill));

    const pool = manager.loadSkills();

    expect(pool.size).toBe(0);
    expect(manager.getInvalidCount()).toBe(1);
    expect(manager.getInvalidManifests()[0].errors.some(e => e.includes('"id"'))).toBe(true);
  });

  it('eksik-alan: activation missing "minScore" is excluded AND counted', () => {
    const skill: Record<string, unknown> = {
      ...makeSkill({ id: 'missing-minscore', name: 'Missing MinScore' }),
      activation: { rules: [], exclude: [] },
    };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('missing-minscore')] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skill));

    const pool = manager.loadSkills();

    expect(pool.has('missing-minscore')).toBe(false);
    expect(manager.getInvalidCount()).toBe(1);
  });

  it('invalidManifests resets on each loadSkills() call (reflects most recent load only)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('corrupt-skill')] as any);
    vi.mocked(fs.readFileSync).mockReturnValue('NOT JSON');
    manager.loadSkills();
    expect(manager.getInvalidCount()).toBe(1);

    const skill = makeSkill({ id: 'now-valid', name: 'Now Valid' });
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('now-valid')] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skill));
    manager.loadSkills();

    expect(manager.getInvalidCount()).toBe(0);
  });

  describe('SkillPoolManager.validateSkillDefinition — activation sub-cases', () => {
    it('accepts a valid manifest with the real activation shape', () => {
      const result = SkillPoolManager.validateSkillDefinition({
        id: 'x', name: 'X', activation: REAL_ACTIVATION_SHAPE,
      });
      expect(result.valid).toBe(true);
    });

    it('accepts a manifest with no activation field (unvalidated, not narrowed)', () => {
      const result = SkillPoolManager.validateSkillDefinition({ id: 'x', name: 'X' });
      expect(result.valid).toBe(true);
    });

    it('rejects activation as a non-object (e.g. a string)', () => {
      const result = SkillPoolManager.validateSkillDefinition({ id: 'x', name: 'X', activation: 'nope' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('"activation'));
    });

    it('rejects activation as null', () => {
      const result = SkillPoolManager.validateSkillDefinition({ id: 'x', name: 'X', activation: null });
      expect(result.valid).toBe(false);
    });

    it('rejects activation.exclude that is not an array', () => {
      const result = SkillPoolManager.validateSkillDefinition({
        id: 'x', name: 'X', activation: { rules: [], exclude: 'nope', minScore: 5 },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('activation.exclude'));
    });

    it('rejects activation.minScore that is not a number', () => {
      const result = SkillPoolManager.validateSkillDefinition({
        id: 'x', name: 'X', activation: { rules: [], exclude: [], minScore: 'high' },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('activation.minScore'));
    });

    it('rejects a rule.score that is not a number', () => {
      const result = SkillPoolManager.validateSkillDefinition({
        id: 'x', name: 'X',
        activation: { rules: [{ when: {}, score: 'high' }], exclude: [], minScore: 5 },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('activation.rules.0.score'));
    });

    it('rejects a rule.when that is not an object', () => {
      const result = SkillPoolManager.validateSkillDefinition({
        id: 'x', name: 'X',
        activation: { rules: [{ when: 'nope', score: 5 }], exclude: [], minScore: 5 },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('activation.rules.0.when'));
    });

    it('accepts an exclusion rule with a "reason" string', () => {
      const result = SkillPoolManager.validateSkillDefinition({
        id: 'x', name: 'X',
        activation: { rules: [], exclude: [{ when: { 'intent.primary': 'design' }, reason: 'no design work' }], minScore: 5 },
      });
      expect(result.valid).toBe(true);
    });
  });
});

describe('born-590: activation validation + visible-signal (AgentPoolManager)', () => {
  let manager: AgentPoolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new AgentPoolManager(ROOT);
  });

  it('starts with zero invalid count before any load', () => {
    expect(manager.getInvalidCount()).toBe(0);
    expect(manager.getInvalidManifests()).toEqual([]);
  });

  it('control: a real-shaped valid agent.json (with activation) loads unchanged, invalidCount stays 0', () => {
    const agent = makeAgent({ id: 'api-builder-like', name: 'API Builder Like', activation: REAL_ACTIVATION_SHAPE });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('api-builder-like')] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agent));

    const pool = manager.loadAgents();

    expect(pool.has('api-builder-like')).toBe(true);
    expect(manager.getInvalidCount()).toBe(0);
  });

  it('control: an agent.json with no activation field still loads unchanged', () => {
    const agent = makeAgent({ id: 'no-activation', name: 'No Activation' });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('no-activation')] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agent));

    const pool = manager.loadAgents();

    expect(pool.has('no-activation')).toBe(true);
    expect(manager.getInvalidCount()).toBe(0);
  });

  it('bozuk-JSON: corrupt agent.json is excluded from pool AND visibly counted', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      if (s.includes('.tasks/agents')) return false;
      return true;
    });
    vi.mocked(fs.readdirSync).mockImplementation((p) => {
      const s = String(p);
      if (s.includes('.deckent/agents') && !s.includes('.tasks')) return [mockDirEntry('corrupt-agent')] as any;
      return [] as any;
    });
    vi.mocked(fs.readFileSync).mockReturnValue('{ not valid JSON');

    const pool = manager.loadAgents();

    expect(pool.size).toBe(0);
    expect(manager.getInvalidCount()).toBe(1);
    const [entry] = manager.getInvalidManifests();
    expect(entry.id).toBe('corrupt-agent');
    expect(entry.path).toContain('agent.json');
  });

  it('directories with no agent.json at all are NOT counted as invalid (no false positives)', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      if (s.includes('.tasks/agents')) return false;
      if (s.includes('agent.json')) return false; // agent.json itself never exists
      return true; // the directories exist
    });
    vi.mocked(fs.readdirSync).mockImplementation((p) => {
      const s = String(p);
      if (s.includes('.deckent/agents') && !s.includes('.tasks')) return [mockDirEntry('stray-dir')] as any;
      return [] as any;
    });

    const pool = manager.loadAgents();

    expect(pool.size).toBe(0);
    expect(manager.getInvalidCount()).toBe(0);
  });

  it('şema-dışı-activation: activation.rules is a string (not an array) is excluded AND counted', () => {
    const agent: Record<string, unknown> = {
      ...makeAgent({ id: 'bad-activation-shape', name: 'Bad Activation Shape' }),
      activation: { rules: 'not-an-array', exclude: [], minScore: 5 },
    };
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      if (s.includes('.tasks/agents')) return false;
      return true;
    });
    vi.mocked(fs.readdirSync).mockImplementation((p) => {
      const s = String(p);
      if (s.includes('.deckent/agents') && !s.includes('.tasks')) return [mockDirEntry('bad-activation-shape')] as any;
      return [] as any;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agent));

    const pool = manager.loadAgents();

    expect(pool.has('bad-activation-shape')).toBe(false);
    expect(manager.getInvalidCount()).toBe(1);
    expect(manager.getInvalidManifests()[0].errors.some(e => e.includes('activation'))).toBe(true);
  });

  it('eksik-alan: an agent.json missing the required "name" field is excluded AND counted', () => {
    const agent = { id: 'missing-name' };
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      if (s.includes('.tasks/agents')) return false;
      return true;
    });
    vi.mocked(fs.readdirSync).mockImplementation((p) => {
      const s = String(p);
      if (s.includes('.deckent/agents') && !s.includes('.tasks')) return [mockDirEntry('missing-name-dir')] as any;
      return [] as any;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agent));

    const pool = manager.loadAgents();

    expect(pool.size).toBe(0);
    expect(manager.getInvalidCount()).toBe(1);
    expect(manager.getInvalidManifests()[0].errors.some(e => e.includes('"name"'))).toBe(true);
  });

  describe('AgentPoolManager.validateAgentDefinition — activation sub-cases', () => {
    it('accepts a valid agent with the real activation shape', () => {
      const result = AgentPoolManager.validateAgentDefinition({
        id: 'x', name: 'X', activation: REAL_ACTIVATION_SHAPE,
      });
      expect(result.valid).toBe(true);
    });

    it('accepts an agent with no activation field (unvalidated, not narrowed)', () => {
      const result = AgentPoolManager.validateAgentDefinition({ id: 'x', name: 'X' });
      expect(result.valid).toBe(true);
    });

    it('rejects activation as a non-object', () => {
      const result = AgentPoolManager.validateAgentDefinition({ id: 'x', name: 'X', activation: 42 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('"activation'));
    });

    it('rejects activation.rules that is not an array', () => {
      const result = AgentPoolManager.validateAgentDefinition({
        id: 'x', name: 'X', activation: { rules: {}, exclude: [], minScore: 5 },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('activation.rules'));
    });

    it('rejects a rule missing "score"', () => {
      const result = AgentPoolManager.validateAgentDefinition({
        id: 'x', name: 'X',
        activation: { rules: [{ when: { 'intent.primary': 'security' } }], exclude: [], minScore: 5 },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('activation.rules.0.score'));
    });
  });
});
