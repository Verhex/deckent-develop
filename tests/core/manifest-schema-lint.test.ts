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
import { SkillPoolManager } from '../../src/core/skill-pool.js';
import { AgentPoolManager } from '../../src/core/agent-pool.js';
import { selectSkills } from '../../src/core/skill-selector.js';
import type { SkillDefinition, ProjectStack } from '../../src/core/skill-types.js';
import type { AgentDefinition } from '../../src/core/agent-types.js';

const ROOT = '/test/project';

function mockDirEntry(name: string, isDir = true) {
  return { name, isDirectory: () => isDir } as unknown as fs.Dirent;
}

/**
 * A minimal, otherwise-valid raw skill manifest (only `id`+`name` are hard-required
 * by SkillPoolManager.validateSkillDefinition). Callers omit whichever optional
 * field they're testing normalization for by deleting it from the returned object.
 */
function rawSkillManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'born-641-skill',
    name: 'Born 641 Skill',
    version: '0.1.0',
    description: 'test fixture',
    entrypoint: 'SKILL.md',
    category: 'domain',
    triggers: ['foo'],
    stackDetection: { files: [], dependencies: [], commands: [] },
    composableWith: [],
    priority: 5,
    promptInjection: { position: 'append', maxTokens: 1500 },
    enabled: true,
    ...overrides,
  };
}

function rawAgentManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'born-641-agent',
    name: 'Born 641 Agent',
    description: 'test fixture',
    systemPrompt: 'test',
    expertise: ['foo'],
    allowedTools: ['Read'],
    deniedTools: [],
    preferredModel: 'sonnet',
    effortMultiplier: 1,
    triggerKeywords: [],
    triggerScopes: [],
    triggerFilePatterns: [],
    persistent: false,
    enabled: true,
    source: 'user',
    ...overrides,
  };
}

/** Loads a single skill manifest through the real SkillPoolManager.loadSkills() path. */
function loadOneSkill(raw: Record<string, unknown>): SkillDefinition | undefined {
  vi.mocked(fs.existsSync).mockReturnValue(true);
  vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry(String(raw['id']))] as any);
  vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(raw));
  const manager = new SkillPoolManager(ROOT);
  const pool = manager.loadSkills();
  return pool.get(String(raw['id']));
}

/** Loads a single agent manifest through the real AgentPoolManager.loadAgents() path. */
function loadOneAgent(raw: Record<string, unknown>): AgentDefinition | undefined {
  vi.mocked(fs.existsSync).mockReturnValue(true);
  vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry(String(raw['id']))] as any);
  vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(raw));
  const manager = new AgentPoolManager(ROOT);
  const pool = manager.loadAgents();
  return pool.get(String(raw['id']));
}

const PROJECT_STACK: ProjectStack = {
  language: 'typescript',
  framework: 'node',
  dependencies: ['zod'],
  buildTool: 'tsc',
  testFramework: 'vitest',
  detectedAt: new Date(0).toISOString(),
};

describe('born-641 manifest schema normalization (pool-load)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Skill pool: missing-optional-field normalization ──────────────────────

  describe('SkillPoolManager — missing optional fields normalize to safe defaults', () => {
    it('defaults missing composableWith to []', () => {
      const raw = rawSkillManifest();
      delete raw['composableWith'];
      const skill = loadOneSkill(raw);
      expect(skill).toBeDefined();
      expect(skill!.composableWith).toEqual([]);
    });

    it('defaults missing triggers to []', () => {
      const raw = rawSkillManifest();
      delete raw['triggers'];
      const skill = loadOneSkill(raw);
      expect(skill).toBeDefined();
      expect(skill!.triggers).toEqual([]);
    });

    it('defaults missing category to a valid SkillCategory', () => {
      const raw = rawSkillManifest();
      delete raw['category'];
      const skill = loadOneSkill(raw);
      expect(skill).toBeDefined();
      expect(['language', 'framework', 'tool', 'domain', 'workflow']).toContain(skill!.category);
    });

    it('defaults an entirely-missing stackDetection to {files:[],dependencies:[],commands:[]}', () => {
      const raw = rawSkillManifest();
      delete raw['stackDetection'];
      const skill = loadOneSkill(raw);
      expect(skill).toBeDefined();
      expect(skill!.stackDetection).toEqual({ files: [], dependencies: [], commands: [] });
    });

    it('defaults a partially-populated stackDetection — missing sub-fields only', () => {
      const raw = rawSkillManifest({ stackDetection: { files: ['package.json'] } });
      const skill = loadOneSkill(raw);
      expect(skill).toBeDefined();
      expect(skill!.stackDetection.files).toEqual(['package.json']);
      expect(skill!.stackDetection.dependencies).toEqual([]);
      expect(skill!.stackDetection.commands).toEqual([]);
    });
  });

  // ─── Agent pool: missing-optional-field normalization ──────────────────────

  describe('AgentPoolManager — missing optional fields normalize to safe defaults', () => {
    it('defaults missing deniedTools to []', () => {
      const raw = rawAgentManifest();
      delete raw['deniedTools'];
      const agent = loadOneAgent(raw);
      expect(agent).toBeDefined();
      expect(agent!.deniedTools).toEqual([]);
    });

    it('defaults missing expertise to []', () => {
      const raw = rawAgentManifest();
      delete raw['expertise'];
      const agent = loadOneAgent(raw);
      expect(agent).toBeDefined();
      expect(agent!.expertise).toEqual([]);
    });
  });

  // ─── Non-regression: fail-soft behavior for genuinely malformed manifests ──

  describe('non-regression: malformed manifests are still skipped, not normalized', () => {
    it('skips manifest.json with invalid JSON (unchanged fail-soft behavior)', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('bad-skill')] as any);
      vi.mocked(fs.readFileSync).mockReturnValue('NOT JSON');

      const manager = new SkillPoolManager(ROOT);
      const pool = manager.loadSkills();
      expect(pool.size).toBe(0);
      expect(manager.getInvalidCount()).toBe(1);
    });

    it('rejects (does not silently normalize) a wrong-typed composableWith', () => {
      const raw = rawSkillManifest({ composableWith: 'not-an-array' });
      const skill = loadOneSkill(raw);
      expect(skill).toBeUndefined();
    });

    it('rejects (does not silently normalize) a wrong-typed expertise', () => {
      const raw = rawAgentManifest({ expertise: 'not-an-array' });
      const agent = loadOneAgent(raw);
      expect(agent).toBeUndefined();
    });
  });

  // ─── Concrete crash-repro: the actual born-641 class bug ───────────────────

  describe('born-641 crash-repro: selectSkills() must not throw on a normalized pool', () => {
    it('does not throw when a loaded skill was missing stackDetection entirely', () => {
      const raw = rawSkillManifest();
      delete raw['stackDetection'];
      const skill = loadOneSkill(raw);
      expect(skill).toBeDefined();

      const pool = new Map<string, SkillDefinition>([[skill!.id, skill!]]);

      // Before the pool-load normalization fix, `skill.stackDetection` is `undefined`
      // here, and skill-selector.ts's unguarded `skill.stackDetection.dependencies`
      // read (line 97) throws TypeError — this is the exact born-641 class bug.
      expect(() => selectSkills({ title: 'implement x', description: 'y' }, PROJECT_STACK, pool)).not.toThrow();
    });
  });
});
