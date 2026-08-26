/**
 * E2E Test: Built-in Agent + Skill Seeding Pipeline
 *
 * Verifies that `seedBuiltins()` correctly copies built-in agents and skills
 * from src/core/builtins/ to a fresh project's .deckent/agents/ and .deckent/skills/.
 *
 * Sprint 150 Task 031 — P0 Beta GA Blocker.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  mkdtempSync, rmSync, existsSync, readFileSync,
  readdirSync, mkdirSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { seedBuiltins } from '../../src/cli/commands/init-steps.js';

// ─── Expected Built-in Agents (17) ─────────────────────────────────
// Grown from the original 15 by sprint-361 (integration-engineer,
// terminal-ux-engineer — commit 70fe74be). NOT listed here: api-designer,
// i18n-specialist, observability-engineer (sprint-369, commit ea87df64) —
// those ship PROMPT.md only, no agent.json yet, so they are excluded from
// this fully-wired allowlist pending manifest completion.

const EXPECTED_AGENTS = [
  'accessibility-auditor',
  'api-builder',
  'architect',
  'architecture-planner',
  'bug-fixer',
  'ci-guardian',
  'code-reviewer',
  'data-engineer',
  'devops-engineer',
  'doc-writer',
  'frontend-designer',
  'integration-engineer',
  'migration-specialist',
  'performance-analyzer',
  'refactorer',
  'security-auditor',
  'terminal-ux-engineer',
];

// ─── Expected Built-in Skills (28) ──────────────────────────────────
// Grown from the original 21 by sprints 359/363/364 (file-watch-hygiene,
// ink-tui — commit 06947b09; onboarding-ux, rpc-protocol — commit 08330de5;
// provider-cli-matrix — commit 874c7b6b) and commit ec91a409 (secure-coding)
// plus sh-portability (commit 06947b09). NOT listed here: api-design,
// i18n-quality, observability (sprint-368, commit 220a66f5) — those ship
// SKILL.md only, no manifest.json yet, so they are excluded from this
// fully-wired allowlist pending manifest completion.

const EXPECTED_SKILLS = [
  'accessibility-expert',
  'anthropic-sdk',
  'api-builder',
  'ci-testing',
  'code-simplifier',
  'database-migration',
  'devops-engineer',
  'docker-expert',
  'documentation-writer',
  'file-watch-hygiene',
  'frontend-design',
  'git-expert',
  'graphql-expert',
  'ink-tui',
  'migration-expert',
  'monorepo-expert',
  'onboarding-ux',
  'performance-optimizer',
  'provider-cli-matrix',
  'python-expert',
  'react-specialist',
  'rpc-protocol',
  'secure-coding',
  'security-specialist',
  'sh-portability',
  'system-architect',
  'testing-expert',
  'typescript-expert',
];

describe('Built-in Agent + Skill Seeding Pipeline', () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-seed-test-'));
    // Create minimal .deckent structure
    mkdirSync(join(tmpRoot, '.deckent', 'agents'), { recursive: true });
    mkdirSync(join(tmpRoot, '.deckent', 'skills'), { recursive: true });
  });

  afterAll(() => {
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* cleanup */ }
  });

  it('seedBuiltins() creates 15 agent directories', () => {
    seedBuiltins(tmpRoot);
    const agentDirs = readdirSync(join(tmpRoot, '.deckent', 'agents'));
    for (const agent of EXPECTED_AGENTS) {
      expect(agentDirs, `Missing agent: ${agent}`).toContain(agent);
    }
    // At least 15 agents (may have more from temp agents)
    expect(agentDirs.length).toBeGreaterThanOrEqual(15);
  });

  it('seedBuiltins() creates 21 skill directories', () => {
    const skillDirs = readdirSync(join(tmpRoot, '.deckent', 'skills'));
    for (const skill of EXPECTED_SKILLS) {
      expect(skillDirs, `Missing skill: ${skill}`).toContain(skill);
    }
    expect(skillDirs.length).toBeGreaterThanOrEqual(21);
  });

  it('each agent has agent.json + PROMPT.md', () => {
    for (const agent of EXPECTED_AGENTS) {
      const agentDir = join(tmpRoot, '.deckent', 'agents', agent);
      expect(existsSync(join(agentDir, 'agent.json')), `${agent}/agent.json missing`).toBe(true);
      expect(existsSync(join(agentDir, 'PROMPT.md')), `${agent}/PROMPT.md missing`).toBe(true);
    }
  });

  it('each skill has manifest.json + SKILL.md', () => {
    for (const skill of EXPECTED_SKILLS) {
      const skillDir = join(tmpRoot, '.deckent', 'skills', skill);
      expect(existsSync(join(skillDir, 'manifest.json')), `${skill}/manifest.json missing`).toBe(true);
      expect(existsSync(join(skillDir, 'SKILL.md')), `${skill}/SKILL.md missing`).toBe(true);
    }
  });

  it('agent.json files are valid JSON with required fields', () => {
    for (const agent of EXPECTED_AGENTS) {
      const jsonPath = join(tmpRoot, '.deckent', 'agents', agent, 'agent.json');
      const content = readFileSync(jsonPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.id).toBe(agent);
      expect(parsed.manifestVersion).toBe(2);
      expect(parsed.source).toBe('builtin');
      expect(typeof parsed.name).toBe('string');
      expect(typeof parsed.description).toBe('string');
    }
  });

  it('skill manifest.json files are valid JSON with required fields', () => {
    for (const skill of EXPECTED_SKILLS) {
      const jsonPath = join(tmpRoot, '.deckent', 'skills', skill, 'manifest.json');
      const content = readFileSync(jsonPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.id).toBe(skill);
      expect(parsed.manifestVersion).toBe(2);
      expect(typeof parsed.name).toBe('string');
      expect(typeof parsed.description).toBe('string');
    }
  });

  it('idempotent: user overrides are preserved on re-seed', () => {
    // Create a user override for architect agent
    const overridePath = join(tmpRoot, '.deckent', 'agents', 'architect', 'agent.json');
    const original = JSON.parse(readFileSync(overridePath, 'utf-8'));
    const customized = { ...original, description: 'USER_CUSTOM_OVERRIDE' };
    writeFileSync(overridePath, JSON.stringify(customized, null, 2));

    // Re-run seedBuiltins
    seedBuiltins(tmpRoot);

    // User override should be preserved (not overwritten)
    const afterReseed = JSON.parse(readFileSync(overridePath, 'utf-8'));
    expect(afterReseed.description).toBe('USER_CUSTOM_OVERRIDE');
  });

  it('does not seed temp agents', () => {
    const agentDirs = readdirSync(join(tmpRoot, '.deckent', 'agents'));
    const tempAgents = agentDirs.filter((d: string) => d.startsWith('temp-'));
    // Temp agents should not come from builtins seeding
    // (they may exist from other sources, but not from our seed)
    for (const t of tempAgents) {
      // If temp agent exists, verify it's not from builtins
      const builtinPath = join(tmpRoot, '..', '..', 'src', 'core', 'builtins', 'agents', t);
      expect(existsSync(builtinPath)).toBe(false);
    }
  });

  it('PROMPT.md files have non-trivial content', () => {
    for (const agent of EXPECTED_AGENTS) {
      const promptPath = join(tmpRoot, '.deckent', 'agents', agent, 'PROMPT.md');
      const content = readFileSync(promptPath, 'utf-8');
      // Each PROMPT.md should have meaningful content (at least 100 chars)
      expect(content.length, `${agent}/PROMPT.md too short`).toBeGreaterThan(100);
    }
  });

  it('SKILL.md files have non-trivial content', () => {
    for (const skill of EXPECTED_SKILLS) {
      const skillPath = join(tmpRoot, '.deckent', 'skills', skill, 'SKILL.md');
      const content = readFileSync(skillPath, 'utf-8');
      expect(content.length, `${skill}/SKILL.md too short`).toBeGreaterThan(50);
    }
  });
});

describe('Built-in Source Directory Integrity', () => {
  it('src/core/builtins/agents/ contains exactly 22 agents', () => {
    const builtinsAgentDir = join(process.cwd(), 'src', 'core', 'builtins', 'agents');
    expect(existsSync(builtinsAgentDir)).toBe(true);
    const agents = readdirSync(builtinsAgentDir);
    // 17 fully-wired (EXPECTED_AGENTS) + 3 manifest-incomplete carryovers
    // (api-designer, i18n-specialist, observability-engineer — sprint-369,
    // PROMPT.md only, no agent.json yet).
    expect(agents.length).toBe(22); // 445: +implementer (F3); 696: +test-guardian
    for (const agent of EXPECTED_AGENTS) {
      expect(agents).toContain(agent);
    }
  });

  it('src/core/builtins/skills/ contains exactly 35 skills', () => {
    const builtinsSkillDir = join(process.cwd(), 'src', 'core', 'builtins', 'skills');
    expect(existsSync(builtinsSkillDir)).toBe(true);
    const skills = readdirSync(builtinsSkillDir);
    // 28 fully-wired (EXPECTED_SKILLS) + 3 manifest-incomplete carryovers
    // (api-design, i18n-quality, observability — sprint-368, SKILL.md only,
    // no manifest.json yet).
    expect(skills.length).toBe(35); // 696: +4 deckent-* dogfood suite
    for (const skill of EXPECTED_SKILLS) {
      expect(skills).toContain(skill);
    }
  });

  it('no temp agents in builtins source', () => {
    const builtinsAgentDir = join(process.cwd(), 'src', 'core', 'builtins', 'agents');
    const agents = readdirSync(builtinsAgentDir);
    const tempAgents = agents.filter((a: string) => a.startsWith('temp-'));
    expect(tempAgents).toEqual([]);
  });

  it('bundled stats are zeroed (clean distribution)', () => {
    const builtinsAgentDir = join(process.cwd(), 'src', 'core', 'builtins', 'agents');
    for (const agent of EXPECTED_AGENTS) {
      const jsonPath = join(builtinsAgentDir, agent, 'agent.json');
      const parsed = JSON.parse(readFileSync(jsonPath, 'utf-8'));
      if (parsed.stats) {
        expect(parsed.stats.totalUses).toBe(0);
        expect(parsed.stats.successRate).toBe(0);
      }
    }
  });
});
