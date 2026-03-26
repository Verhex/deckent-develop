import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AgentPoolManager } from '../../src/core/agent-pool.js';
import { selectAgent } from '../../src/core/agent-selector.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const AGENT_DIR = path.join(PROJECT_ROOT, '.deckent/agents/ci-guardian');
const AGENT_JSON_PATH = path.join(AGENT_DIR, 'agent.json');
const PROMPT_MD_PATH = path.join(AGENT_DIR, 'PROMPT.md');

function loadCiGuardianJson(): Record<string, unknown> {
  const raw = fs.readFileSync(AGENT_JSON_PATH, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function loadCiGuardianAgent(): AgentDefinition {
  return loadCiGuardianJson() as unknown as AgentDefinition;
}

function makePool(...agents: Parameters<typeof createAgentDefinition>[0][]): AgentPool {
  const pool: AgentPool = new Map();
  for (const def of agents) {
    const agent = createAgentDefinition(def);
    pool.set(agent.id, agent);
  }
  return pool;
}

// ─── agent.json Validation ──────────────────────────────────────────────────

describe('ci-guardian agent.json', () => {
  it('exists on disk', () => {
    expect(fs.existsSync(AGENT_JSON_PATH)).toBe(true);
  });

  it('is valid JSON', () => {
    expect(() => loadCiGuardianJson()).not.toThrow();
  });

  it('passes AgentPoolManager validation', () => {
    const raw = loadCiGuardianJson();
    const result = AgentPoolManager.validateAgentDefinition(raw);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('has correct id and name', () => {
    const agent = loadCiGuardianAgent();
    expect(agent.id).toBe('ci-guardian');
    expect(agent.name).toBe('CI Guardian');
  });

  it('has source set to builtin', () => {
    const agent = loadCiGuardianAgent();
    expect(agent.source).toBe('builtin');
  });

  it('has CI-related triggerKeywords', () => {
    const agent = loadCiGuardianAgent();
    expect(agent.triggerKeywords).toContain('ci');
    expect(agent.triggerKeywords).toContain('test');
    expect(agent.triggerKeywords).toContain('build');
    expect(agent.triggerKeywords).toContain('regression');
    expect(agent.triggerKeywords).toContain('coverage');
    expect(agent.triggerKeywords).toContain('tsc');
    expect(agent.triggerKeywords).toContain('vitest');
  });

  it('has triggerScopes covering tests and CI directories', () => {
    const agent = loadCiGuardianAgent();
    expect(agent.triggerScopes).toContain('tests/');
    expect(agent.triggerScopes).toContain('.github/');
    expect(agent.triggerScopes).toContain('src/');
  });

  it('has triggerFilePatterns for test and config files', () => {
    const agent = loadCiGuardianAgent();
    expect(agent.triggerFilePatterns).toContain('*.test.ts');
    expect(agent.triggerFilePatterns).toContain('*.yml');
    expect(agent.triggerFilePatterns).toContain('vitest.config.*');
    expect(agent.triggerFilePatterns).toContain('tsconfig.*');
  });

  it('has a non-empty systemPrompt', () => {
    const agent = loadCiGuardianAgent();
    expect(agent.systemPrompt).toBeTruthy();
    expect(agent.systemPrompt.length).toBeGreaterThan(50);
  });

  it('has valid stats object', () => {
    const agent = loadCiGuardianAgent();
    expect(typeof agent.stats.totalUses).toBe('number');
    expect(typeof agent.stats.successRate).toBe('number');
    expect(typeof agent.stats.avgCoverage).toBe('number');
    expect(typeof agent.stats.lastUsedInSprint).toBe('string');
  });
});

// ─── PROMPT.md ──────────────────────────────────────────────────────────────

describe('ci-guardian PROMPT.md', () => {
  it('exists on disk', () => {
    expect(fs.existsSync(PROMPT_MD_PATH)).toBe(true);
  });

  it('has substantial content', () => {
    const content = fs.readFileSync(PROMPT_MD_PATH, 'utf8');
    expect(content.length).toBeGreaterThan(500);
  });

  it('contains key CI topics', () => {
    const content = fs.readFileSync(PROMPT_MD_PATH, 'utf8');
    expect(content).toContain('tsc --noEmit');
    expect(content).toContain('vitest');
    expect(content).toContain('regression');
    expect(content).toContain('coverage');
    expect(content).toContain('baseline');
  });
});

// ─── selectAgent Integration ────────────────────────────────────────────────

describe('selectAgent with ci-guardian', () => {
  const ciGuardianDef = loadCiGuardianAgent();

  it('selects ci-guardian for CI pipeline task', () => {
    const pool = makePool(ciGuardianDef);
    const task = {
      title: 'Fix CI pipeline regression',
      description: 'CI build is failing after recent changes, regression detected in vitest',
      scope: { directories: ['tests/', '.github/'], filesWrite: ['tests/core/new.test.ts'] },
    };
    const result = selectAgent(task, pool);
    expect(result.agent).not.toBeNull();
    expect(result.agent!.id).toBe('ci-guardian');
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it('selects ci-guardian for tsc/vitest validation task', () => {
    const pool = makePool(ciGuardianDef);
    const task = {
      title: 'Validate tsc and vitest pass after refactor',
      description: 'Run tsc --noEmit and vitest to ensure build passes',
      scope: { directories: ['src/'], filesWrite: [] },
    };
    const result = selectAgent(task, pool);
    expect(result.agent).not.toBeNull();
    expect(result.agent!.id).toBe('ci-guardian');
  });

  it('selects ci-guardian for coverage tracking task', () => {
    const pool = makePool(ciGuardianDef);
    const task = {
      title: 'Track test coverage regression',
      description: 'Coverage dropped after sprint, investigate and fix',
      scope: { directories: ['tests/'], filesWrite: [] },
    };
    const result = selectAgent(task, pool);
    expect(result.agent).not.toBeNull();
    expect(result.agent!.id).toBe('ci-guardian');
  });

  it('selects ci-guardian over generic agent for CI task', () => {
    const pool = makePool(
      ciGuardianDef,
      {
        id: 'generic-agent',
        name: 'Generic',
        triggerKeywords: ['code'],
        triggerScopes: [],
      },
    );
    const task = {
      title: 'Fix CI test regression in pipeline',
      description: 'Regression detected in CI, vitest failures after merge',
      scope: { directories: ['tests/'], filesWrite: ['tests/core/fix.test.ts'] },
    };
    const result = selectAgent(task, pool);
    expect(result.agent!.id).toBe('ci-guardian');
  });

  it('does not select ci-guardian for unrelated task', () => {
    const pool = makePool(ciGuardianDef);
    const task = {
      title: 'Add new database migration',
      description: 'Create migration for users table schema update',
      scope: { directories: ['migrations/'], filesWrite: ['migrations/001.sql'] },
    };
    const result = selectAgent(task, pool);
    // ci-guardian may or may not match (src/ scope is broad) — but it should not be a strong match
    // Since migrations/ is not in ci-guardian triggerScopes and no keyword overlap, score should be low
    if (result.agent) {
      expect(result.agent.id).not.toBe('ci-guardian');
    }
  });
});
