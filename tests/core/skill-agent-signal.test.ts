import { describe, it, expect } from 'vitest';
import {
  SKILL_AGENT_AFFINITY_BONUS,
  SKILL_AGENT_MAP,
  getSkillAgentAffinityBonus,
} from '../../src/core/activation-engine.js';

// ─── Sprint 212-008 — Routing skew fix ─────────────────────────────────────
// Skill→agent affinity signal: when a domain skill is in the task's
// assignedSkills, the matching domain agent gets a +bonus. Refactorer (and
// other generalist agents) get 0 bonus — they remain candidates through base
// activation rules but are no longer the sole winner of every sprint.

describe('skill→agent affinity signal', () => {
  describe('SKILL_AGENT_MAP', () => {
    it('maps the canonical frontend/security/api/doc cluster skills to their agents', () => {
      // Anchors against the cluster pairs called out in the directive.
      expect(SKILL_AGENT_MAP['frontend-design']).toBe('frontend-designer');
      expect(SKILL_AGENT_MAP['react-specialist']).toBe('frontend-designer');
      expect(SKILL_AGENT_MAP['security-specialist']).toBe('security-auditor');
      expect(SKILL_AGENT_MAP['api-builder']).toBe('api-builder');
      expect(SKILL_AGENT_MAP['documentation-writer']).toBe('doc-writer');
    });

    it('does NOT map refactorer/architect/bug-fixer as values for any generalist skill', () => {
      // Sprint 205 regression guard: refactorer must remain reachable via base
      // activation scoring, NOT via skill→agent affinity. Without this, the
      // bonus would re-introduce the very imbalance the task is solving.
      const generalistAgents = ['refactorer', 'bug-fixer', 'code-reviewer'];
      for (const value of Object.values(SKILL_AGENT_MAP)) {
        expect(generalistAgents).not.toContain(value);
      }
    });
  });

  describe('getSkillAgentAffinityBonus', () => {
    it('boosts frontend-designer for a task with frontend-design skill', () => {
      const bonus = getSkillAgentAffinityBonus('frontend-designer', ['frontend-design']);
      expect(bonus).toBe(SKILL_AGENT_AFFINITY_BONUS);
      expect(bonus).toBeGreaterThan(0);
    });

    it('boosts frontend-designer for a task with react-specialist skill (multi-skill→same-agent)', () => {
      const bonus = getSkillAgentAffinityBonus('frontend-designer', ['react-specialist']);
      expect(bonus).toBe(SKILL_AGENT_AFFINITY_BONUS);
    });

    it('boosts security-auditor for a task with security-specialist skill', () => {
      const bonus = getSkillAgentAffinityBonus('security-auditor', ['security-specialist']);
      expect(bonus).toBe(SKILL_AGENT_AFFINITY_BONUS);
    });

    it('boosts doc-writer for a task with documentation-writer skill', () => {
      const bonus = getSkillAgentAffinityBonus('doc-writer', ['documentation-writer']);
      expect(bonus).toBe(SKILL_AGENT_AFFINITY_BONUS);
    });

    it('boosts api-builder agent for a task with api-builder skill', () => {
      const bonus = getSkillAgentAffinityBonus('api-builder', ['api-builder']);
      expect(bonus).toBe(SKILL_AGENT_AFFINITY_BONUS);
    });

    it('refactorer gets 0 bonus even when frontend skills are assigned (still a candidate via base rules)', () => {
      // Sprint 205 fix preserved: refactorer is never excluded by this signal,
      // it just doesn't get an extra boost. Base activation scoring still
      // makes it a viable candidate for implementation/refactor intent tasks.
      const bonus = getSkillAgentAffinityBonus(
        'refactorer',
        ['frontend-design', 'security-specialist', 'api-builder'],
      );
      expect(bonus).toBe(0);
    });

    it('returns 0 for empty / undefined assigned skills', () => {
      expect(getSkillAgentAffinityBonus('frontend-designer', [])).toBe(0);
      expect(getSkillAgentAffinityBonus('frontend-designer', undefined)).toBe(0);
    });

    it('returns 0 for an unknown skill that has no agent affinity', () => {
      const bonus = getSkillAgentAffinityBonus('frontend-designer', ['typescript-expert', 'git-expert']);
      expect(bonus).toBe(0);
    });

    it('caps the bonus at a single application even with multiple matching skills', () => {
      // frontend-design AND react-specialist both map to frontend-designer.
      // Without a cap the bonus would compound to 6+. With the cap it stays at
      // SKILL_AGENT_AFFINITY_BONUS so the signal does not dominate base scoring.
      const bonus = getSkillAgentAffinityBonus(
        'frontend-designer',
        ['frontend-design', 'react-specialist', 'accessibility-expert'],
      );
      expect(bonus).toBe(SKILL_AGENT_AFFINITY_BONUS);
    });

    it('multi-skill task surfaces the correct agent for each cluster', () => {
      // A task with one frontend skill + one security skill grants the bonus
      // independently to each matching agent — neither steals the other's signal.
      const skills = ['frontend-design', 'security-specialist'];
      expect(getSkillAgentAffinityBonus('frontend-designer', skills)).toBe(SKILL_AGENT_AFFINITY_BONUS);
      expect(getSkillAgentAffinityBonus('security-auditor', skills)).toBe(SKILL_AGENT_AFFINITY_BONUS);
      // And an unrelated agent (refactorer) still receives 0 from the same set.
      expect(getSkillAgentAffinityBonus('refactorer', skills)).toBe(0);
    });
  });
});
