/**
 * tests/core/stats-sidecar.test.ts
 *
 * born-605 STATS-SIDECAR — sprint-finalizer.ts's "8d2" agent/skill stats-sync block
 * used to call `poolManager.saveAgent(agent)` / `skillPoolManager.saveSkill(skill)`
 * after mutating `.stats`, rewriting the ENTIRE git-tracked agent.json/manifest.json
 * on every sprint finalize — per-sprint repo-diff noise, a hermeticity/C5 violation,
 * and a two-tree sync conflict source.
 *
 * The fix moves live stats writes to a gitignored single-ledger sidecar
 * (`.deckent/stats/catalog-stats.json`, `{agents:{}, skills:{}}`), written
 * atomically (tmp+rename). Reads stay unified: AgentPoolManager.getAgent() /
 * SkillPoolManager.getSkill() overlay the sidecar value when present, else fall
 * back to the manifest-loaded value — so a consumer (marketplace/rating/routing
 * learningBonus) sees the identical value regardless of which store currently
 * holds it, and the manifest's own `stats` field is never rewritten by the new
 * `saveAgentStats()` / `saveSkillStats()` calls.
 *
 * This file exercises the REAL (non-mocked) AgentPoolManager/SkillPoolManager
 * against a real tmpdir — Test Hermeticity: no gitignored repo state is read,
 * everything is created fresh per test and torn down in afterEach.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { AgentPoolManager } from '../../src/core/agent-pool.js';
import { SkillPoolManager } from '../../src/core/skill-pool.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { AgentStats } from '../../src/core/agent-types.js';
import type { SkillStats } from '../../src/core/skill-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const SIDECAR_RELATIVE_PATH = join('.deckent', 'stats', 'catalog-stats.json');

function makeTempDir(): string {
  const dir = join(tmpdir(), `stats-sidecar-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function readSidecarRaw(root: string): { agents: Record<string, unknown>; skills: Record<string, unknown> } {
  return JSON.parse(readFileSync(join(root, SIDECAR_RELATIVE_PATH), 'utf-8'));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('stats sidecar (born-605 STATS-SIDECAR)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ─── RED → GREEN: manifest-mutation pin ────────────────────────────────────

  describe('RED → GREEN — finalizer-style stats update no longer mutates the manifest', () => {
    it('RED: saveAgent(agent) (the OLD finalizer call) DOES rewrite agent.json — proves the bug was real', () => {
      const pool = new AgentPoolManager(tempDir);
      const agent = createAgentDefinition({
        id: 'bug-fixer',
        name: 'Bug Fixer',
        stats: { totalUses: 5, successRate: 1, avgCoverage: 70, lastUsedInSprint: 'sprint-500' },
      });
      pool.saveAgent(agent);

      const manifestPath = join(tempDir, '.deckent', 'agents', 'bug-fixer', 'agent.json');
      const before = readFileSync(manifestPath, 'utf-8');

      // Simulates the OLD sprint-finalizer.ts 8d2 block: mutate `.stats`, then
      // call poolManager.saveAgent(agent) — the exact call this task removes.
      const loaded = pool.getAgent('bug-fixer')!;
      loaded.stats = { totalUses: 6, successRate: 1, avgCoverage: 85, lastUsedInSprint: 'sprint-501' };
      pool.saveAgent(loaded);

      const after = readFileSync(manifestPath, 'utf-8');
      expect(after).not.toBe(before);
      expect(JSON.parse(after).stats.totalUses).toBe(6);
    });

    it('GREEN: saveAgentStats(id, stats) (the NEW finalizer call) leaves agent.json byte-identical', () => {
      const pool = new AgentPoolManager(tempDir);
      const agent = createAgentDefinition({
        id: 'bug-fixer',
        name: 'Bug Fixer',
        stats: { totalUses: 5, successRate: 1, avgCoverage: 70, lastUsedInSprint: 'sprint-500' },
      });
      pool.saveAgent(agent);

      const manifestPath = join(tempDir, '.deckent', 'agents', 'bug-fixer', 'agent.json');
      const before = readFileSync(manifestPath, 'utf-8');

      // Simulates the NEW sprint-finalizer.ts 8d2 block.
      const newStats: AgentStats = { totalUses: 6, successRate: 1, avgCoverage: 85, lastUsedInSprint: 'sprint-501' };
      pool.saveAgentStats('bug-fixer', newStats);

      const after = readFileSync(manifestPath, 'utf-8');
      expect(after).toBe(before); // manifest byte-for-byte unchanged — no re-write at all

      const sidecar = readSidecarRaw(tempDir);
      expect(sidecar.agents['bug-fixer']).toEqual(newStats);
    });

    it('GREEN (skills): saveSkillStats(id, stats) leaves manifest.json byte-identical', () => {
      const pool = new SkillPoolManager(tempDir);
      const skill = createSkillDefinition({
        id: 'typescript-expert',
        name: 'TypeScript Expert',
        stats: { totalUses: 3, successCount: 3, successRate: 1, avgCoverage: 80, lastUsedInSprint: 'sprint-500' },
      });
      pool.saveSkill(skill);

      const manifestPath = join(tempDir, '.deckent', 'skills', 'typescript-expert', 'manifest.json');
      const before = readFileSync(manifestPath, 'utf-8');

      const newStats: SkillStats = { totalUses: 4, successCount: 4, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-501' };
      pool.saveSkillStats('typescript-expert', newStats);

      const after = readFileSync(manifestPath, 'utf-8');
      expect(after).toBe(before);

      const sidecar = readSidecarRaw(tempDir);
      expect(sidecar.skills['typescript-expert']).toEqual(newStats);
    });
  });

  // ─── Unified read — sidecar wins, else manifest fallback ───────────────────

  describe('unified read — sidecar overlay', () => {
    it('getAgent() returns sidecar stats when present, overriding the stale manifest value', () => {
      const pool = new AgentPoolManager(tempDir);
      pool.saveAgent(createAgentDefinition({
        id: 'refactorer',
        name: 'Refactorer',
        stats: { totalUses: 1, successRate: 1, avgCoverage: 50, lastUsedInSprint: 'sprint-100' },
      }));

      const newStats: AgentStats = { totalUses: 9, successRate: 0.8, avgCoverage: 77, lastUsedInSprint: 'sprint-109' };
      pool.saveAgentStats('refactorer', newStats);

      const agent = pool.getAgent('refactorer');
      expect(agent?.stats).toEqual(newStats);
    });

    it('getAgent() falls back to manifest stats when the sidecar has no entry for this id (migration-friendly, consumer regression-pin)', () => {
      const pool = new AgentPoolManager(tempDir);
      const manifestStats: AgentStats = { totalUses: 12, successRate: 0.75, avgCoverage: 66, lastUsedInSprint: 'sprint-200' };
      pool.saveAgent(createAgentDefinition({ id: 'architect', name: 'Architect', stats: manifestStats }));

      // A DIFFERENT agent gets a sidecar entry — 'architect' itself never does.
      pool.saveAgentStats('some-other-agent', { totalUses: 1, successRate: 1, avgCoverage: 100, lastUsedInSprint: 'sprint-201' });

      const agent = pool.getAgent('architect');
      expect(agent?.stats).toEqual(manifestStats); // unchanged — same value a consumer saw before the sidecar existed
    });

    it('getSkill() unified read mirrors the agent behavior', () => {
      const pool = new SkillPoolManager(tempDir);
      pool.saveSkill(createSkillDefinition({
        id: 'api-design',
        name: 'API Design',
        stats: { totalUses: 2, successCount: 2, successRate: 1, avgCoverage: 60, lastUsedInSprint: 'sprint-050' },
      }));

      const newStats: SkillStats = { totalUses: 7, successCount: 6, successRate: 0.857, avgCoverage: 71, lastUsedInSprint: 'sprint-059' };
      pool.saveSkillStats('api-design', newStats);

      const skill = pool.getSkill('api-design');
      expect(skill?.stats).toEqual(newStats);
    });
  });

  // ─── Migration — first sidecar write carries manifest history forward ──────

  describe('migration — first sidecar write for an id', () => {
    it("a finalizer-style read-then-write carries the manifest's prior stats forward on the FIRST sidecar write", () => {
      const pool = new AgentPoolManager(tempDir);
      pool.saveAgent(createAgentDefinition({
        id: 'security-auditor',
        name: 'Security Auditor',
        stats: { totalUses: 5, successRate: 1, avgCoverage: 70, lastUsedInSprint: 'sprint-500' },
      }));

      // No sidecar file exists yet at all.
      expect(existsSync(join(tempDir, SIDECAR_RELATIVE_PATH))).toBe(false);

      // Simulate the sprint-finalizer.ts 8d2 block exactly: read (unified —
      // falls back to the manifest since the sidecar is empty), blend in this
      // sprint's new sample, write ONLY to the sidecar.
      const agent = pool.getAgent('security-auditor')!;
      const stats = agent.stats;
      const prevTotal = stats.totalUses;
      stats.totalUses = prevTotal + 1;
      stats.avgCoverage = ((stats.avgCoverage * prevTotal) + 90) / stats.totalUses;
      stats.lastUsedInSprint = 'sprint-501';
      pool.saveAgentStats('security-auditor', stats);

      const updated = pool.getAgent('security-auditor');
      expect(updated?.stats.totalUses).toBe(6); // 5 (migrated from manifest) + 1, NOT reset to 1
      expect(updated?.stats.avgCoverage).toBeCloseTo((70 * 5 + 90) / 6, 5);

      // The manifest itself was never re-zeroed or otherwise touched.
      const rawManifest = JSON.parse(readFileSync(
        join(tempDir, '.deckent', 'agents', 'security-auditor', 'agent.json'), 'utf-8',
      ));
      expect(rawManifest.stats.totalUses).toBe(5);
      expect(rawManifest.stats.avgCoverage).toBe(70);
    });
  });

  // ─── Shared single-ledger — agents/skills writes don't clobber each other ──

  describe('shared single-ledger — read-merge-write correctness', () => {
    it('writing skill stats does not clobber a co-resident agents key, and vice versa', () => {
      const agentPool = new AgentPoolManager(tempDir);
      const skillPool = new SkillPoolManager(tempDir);

      agentPool.saveAgentStats('agent-a', { totalUses: 1, successRate: 1, avgCoverage: 100, lastUsedInSprint: 'sprint-001' });
      skillPool.saveSkillStats('skill-a', { totalUses: 2, successCount: 2, successRate: 1, avgCoverage: 90, lastUsedInSprint: 'sprint-002' });
      agentPool.saveAgentStats('agent-b', { totalUses: 3, successRate: 0.5, avgCoverage: 50, lastUsedInSprint: 'sprint-003' });

      const ledger = readSidecarRaw(tempDir);
      expect((ledger.agents['agent-a'] as AgentStats).totalUses).toBe(1);
      expect((ledger.agents['agent-b'] as AgentStats).totalUses).toBe(3);
      expect((ledger.skills['skill-a'] as SkillStats).totalUses).toBe(2);
    });

    it('sidecar write is atomic — no leftover .tmp file after a successful write', () => {
      const agentPool = new AgentPoolManager(tempDir);
      agentPool.saveAgentStats('atomic-agent', { totalUses: 1, successRate: 1, avgCoverage: 100, lastUsedInSprint: 'sprint-001' });

      const statsDir = join(tempDir, '.deckent', 'stats');
      const files = readdirSync(statsDir);
      expect(files).toEqual(['catalog-stats.json']);
    });
  });

  // ─── Hermetic — no sidecar present (fresh checkout) ─────────────────────────

  describe('hermetic — no sidecar present', () => {
    it('loadAgents()/loadSkills() work fine with no .deckent/stats/ directory at all (fresh checkout)', () => {
      const agentPool = new AgentPoolManager(tempDir);
      const skillPool = new SkillPoolManager(tempDir);
      agentPool.saveAgent(createAgentDefinition({ id: 'fresh-agent', name: 'Fresh Agent' }));
      skillPool.saveSkill(createSkillDefinition({ id: 'fresh-skill', name: 'Fresh Skill' }));

      expect(existsSync(join(tempDir, '.deckent', 'stats'))).toBe(false);

      const agents = agentPool.loadAgents();
      const skills = skillPool.loadSkills();
      expect(agents.get('fresh-agent')?.stats.totalUses).toBe(0);
      expect(skills.get('fresh-skill')?.stats.totalUses).toBe(0);
    });
  });
});
