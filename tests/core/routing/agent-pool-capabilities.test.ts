// ─── agent-pool capabilities (445-012) — additive load ───────────────────────
// Pins: (1) loadAgents parses+validates an optional `capabilities` block via
// capabilityVectorSchema; (2) invalid capabilities are dropped + recorded as a
// WARNING (visible-skip) — never a full manifest reject; (3) the V2 scoring
// path was verified V2-identical until the V2 engine's S3 retirement,
// absence, or validity — bit-identical RoutingDecision either way.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('../../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn(),
}));
vi.mock('../../../src/core/memory-query.js', () => ({
  searchMemory: vi.fn().mockReturnValue([]),
}));
vi.mock('../../../src/core/token-counter.js', () => ({
  TokenCounter: vi.fn().mockImplementation(() => ({
    estimatePromptSize: vi.fn().mockReturnValue({ totalTokens: 1000 }),
  })),
}));

import * as fs from 'node:fs';
import { AgentPoolManager } from '../../../src/core/agent-pool.js';
import { createAgentDefinition } from '../../../src/core/agent-types.js';
import type { AgentDefinition, AgentPool } from '../../../src/core/agent-types.js';
import type { SkillDefinition } from '../../../src/core/skill-types.js';
import { createSkillDefinition } from '../../../src/core/skill-types.js';
import type { ActivationConfig } from '../../../src/core/routing-types.js';
import type { CapabilityVector } from '../../../src/core/routing/capability-vector.js';

const ROOT = '/test/project';

function mockDirEntry(name: string, isDir = true) {
  return { name, isDirectory: () => isDir } as unknown as fs.Dirent;
}

/** A full, spec-faithful valid CapabilityVector (mirrors capability-schema.test.ts). */
function validCapabilities(): CapabilityVector {
  return {
    capabilitiesVersion: 3,
    content: {
      workTypes: [{ type: 'build', proficiency: 'primary' }],
      expertise: ['feature construction'],
      personaSlices: ['implementation'],
    },
    positional: {
      domains: [{ id: '*', proficiency: 'able' }],
      surfaces: [],
      writeAuthority: true,
      role: 'implementer',
      deliverables: ['code-src', 'code-test'],
    },
    numerical: {
      preferredModel: 'claude-sonnet-5',
      costTier: 'standard',
      maxParallel: null,
    },
  };
}

// ─── loadAgents: capabilities parsing/validation ─────────────────────────────

describe('AgentPoolManager — capabilities (445-012, additive load)', () => {
  let manager: AgentPoolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new AgentPoolManager(ROOT);
  });

  it('parses and attaches a valid capabilities block onto the loaded AgentDefinition', () => {
    const agent = createAgentDefinition({ id: 'cap-agent', name: 'Cap Agent' });
    const withCaps = { ...agent, capabilities: validCapabilities() };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('cap-agent')] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(withCaps));

    const pool = manager.loadAgents();
    const loaded = pool.get('cap-agent');

    expect(loaded).toBeDefined();
    expect(loaded?.capabilities).toEqual(validCapabilities());
    expect(manager.getInvalidCount()).toBe(0);
  });

  it('drops invalid capabilities but still loads the agent, recorded as a WARNING (visible-skip, not a full reject)', () => {
    const agent = createAgentDefinition({ id: 'bad-cap-agent', name: 'Bad Cap Agent' });
    // capabilitiesVersion must be the literal 3 — 2 is a schema violation.
    const badCaps = { ...validCapabilities(), capabilitiesVersion: 2 };
    const withBadCaps = { ...agent, capabilities: badCaps };

    // Only .deckent/agents/ "exists" — .tasks/agents/ (temp dir) and
    // .deckent/config.json (builtin-fallback gate) must not, else the same
    // mocked readdirSync entry gets double-counted across dirs.
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      return s.includes('.deckent/agents') && !s.includes('.tasks');
    });
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('bad-cap-agent')] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(withBadCaps));

    const pool = manager.loadAgents();
    const loaded = pool.get('bad-cap-agent');

    // Agent still loads on its other V2 fields — only the bad `capabilities`
    // field itself is dropped.
    expect(loaded).toBeDefined();
    expect(loaded?.capabilities).toBeUndefined();
    expect(loaded?.name).toBe('Bad Cap Agent');

    const invalid = manager.getInvalidManifests();
    expect(invalid).toHaveLength(1);
    expect(invalid[0]?.id).toBe('bad-cap-agent');
    expect(invalid[0]?.severity).toBe('warning');
    expect(invalid[0]?.errors.length).toBeGreaterThan(0);
  });

  it('drops a nested legacy model alias instead of routing it', () => {
    const agent = createAgentDefinition({ id: 'alias-cap-agent', name: 'Alias Cap Agent' });
    const capabilities = validCapabilities();
    capabilities.numerical.preferredModel = 'sonnet';
    const withCaps = { ...agent, capabilities };

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      return s.includes('.deckent/agents') && !s.includes('.tasks');
    });
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('alias-cap-agent')] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(withCaps));

    const loaded = manager.loadAgents().get('alias-cap-agent');
    expect(loaded).toBeDefined();
    expect(loaded?.capabilities).toBeUndefined();
    expect(manager.getInvalidManifests()[0]?.errors).toContain(
      '"capabilities.numerical.preferredModel" must be a canonical registered model ID',
    );
  });

  it('leaves an agent with no capabilities field entirely unaffected (backward-compat / additive guarantee)', () => {
    const agent = createAgentDefinition({ id: 'no-cap-agent', name: 'No Cap Agent' });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('no-cap-agent')] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agent));

    const pool = manager.loadAgents();
    const loaded = pool.get('no-cap-agent');

    expect(loaded).toBeDefined();
    expect(loaded?.capabilities).toBeUndefined();
    expect(manager.getInvalidCount()).toBe(0);
  });

  it('validates capabilities for temp agents (.tasks/agents/) too — same _loadFromDir path', () => {
    const agent = createAgentDefinition({ id: 'temp-cap-agent', name: 'Temp Cap Agent' });
    const badCaps = { ...validCapabilities(), positional: { ...validCapabilities().positional, role: '' } };
    const withBadCaps = { ...agent, capabilities: badCaps };

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      if (s.includes('.tasks/agents')) return true;
      if (s.includes('.deckent/agents') && !s.includes('.tasks')) return false;
      if (s.includes('agent.json')) return true;
      return false;
    });
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('sprint-001-temp-cap-agent')] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(withBadCaps));

    const pool = manager.loadAgents();
    const loaded = pool.get('temp-cap-agent');

    expect(loaded).toBeDefined();
    expect(loaded?.capabilities).toBeUndefined();
    // Recorded under the directory name (sprint-scoped), matching the existing
    // born-590 convention — not the agent.json's own internal `id` field.
    expect(
      manager.getInvalidManifests().some((e) => e.id === 'sprint-001-temp-cap-agent' && e.severity === 'warning'),
    ).toBe(true);
  });
});

// ─── V2-decision-identical pin ────────────────────────────────────────────────

function makeAgent(id: string, activation?: ActivationConfig, capabilities?: CapabilityVector): AgentDefinition {
  const base = createAgentDefinition({ id, name: id });
  const withActivation = activation ? ({ ...base, activation } as AgentDefinition) : base;
  return capabilities ? ({ ...withActivation, capabilities } as AgentDefinition) : withActivation;
}

function makeSkill(id: string, activation?: ActivationConfig): SkillDefinition {
  const base = createSkillDefinition({ id, name: id });
  return activation ? ({ ...base, activation } as SkillDefinition) : base;
}

function makePool(...agents: AgentDefinition[]): AgentPool {
  return new Map(agents.map((a) => [a.id, a]));
}

function makeSkillPool(...skills: SkillDefinition[]): Map<string, SkillDefinition> {
  return new Map(skills.map((s) => [s.id, s]));
}
