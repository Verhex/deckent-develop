// Sprint 215 — Task 215-017
// Routing: frontend-design/react-specialist skill → frontend-designer agent.
//
// Locks the mapping definition introduced in Sprint 212-008 (SKILL_AGENT_MAP)
// against regression. Verifies that:
//   1. frontend-design   → frontend-designer affinity bonus is applied
//   2. react-specialist  → frontend-designer affinity bonus is applied
//   3. refactorer remains a valid candidate (NOT in the map — Sprint 205 fix)
//   4. multi-skill assignment yields a single (non-doubled) affinity bonus
//   5. integration via routeTaskV2: a dashboard UI task selects frontend-designer
//      over architecture-planner
//
// Hermetic: relies only on git-tracked .deckent/agents/*/agent.json (the temp-*
// subdirectories are gitignored but not required here). No reads of
// .deckent/config.json, .brain/memory.db, or HOME.

import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { AgentPoolManager } from '../../src/core/agent-pool.js';
import { routeTaskV2 } from '../../src/core/routing-engine.js';
import {
  getSkillAgentAffinityBonus,
  SKILL_AGENT_AFFINITY_BONUS,
  SKILL_AGENT_MAP,
} from '../../src/core/activation-engine.js';
import type { AgentPool } from '../../src/core/agent-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..', '..');

describe('frontend-design → frontend-designer mapping (Sprint 215-017)', () => {
  it('frontend-design skill maps to frontend-designer with full affinity bonus', () => {
    expect(SKILL_AGENT_MAP['frontend-design']).toBe('frontend-designer');
    expect(getSkillAgentAffinityBonus('frontend-designer', ['frontend-design']))
      .toBe(SKILL_AGENT_AFFINITY_BONUS);
    // Negative control: the same skill must not award the bonus to a different agent
    expect(getSkillAgentAffinityBonus('architecture-planner', ['frontend-design'])).toBe(0);
    expect(getSkillAgentAffinityBonus('architect', ['frontend-design'])).toBe(0);
  });

  it('react-specialist skill maps to frontend-designer with full affinity bonus', () => {
    expect(SKILL_AGENT_MAP['react-specialist']).toBe('frontend-designer');
    expect(getSkillAgentAffinityBonus('frontend-designer', ['react-specialist']))
      .toBe(SKILL_AGENT_AFFINITY_BONUS);
    // architecture-planner must not steal the bonus
    expect(getSkillAgentAffinityBonus('architecture-planner', ['react-specialist'])).toBe(0);
  });

  it('refactorer remains a valid candidate — NOT in SKILL_AGENT_MAP (Sprint 205 guard)', () => {
    // Sprint 205 fix: refactorer is a generalist that must remain eligible for all
    // task types. Including it as a SKILL_AGENT_MAP value would over-bias toward
    // refactorer whenever a generic skill (typescript-expert, etc.) is assigned.
    const mapValues = Object.values(SKILL_AGENT_MAP);
    expect(mapValues).not.toContain('refactorer');
    // Refactorer earns zero affinity even when the task assigns frontend skills —
    // it still competes for selection via base activation rules (impl@7) and
    // domain bonuses.
    expect(getSkillAgentAffinityBonus('refactorer', ['frontend-design'])).toBe(0);
    expect(getSkillAgentAffinityBonus('refactorer', ['react-specialist'])).toBe(0);
    expect(getSkillAgentAffinityBonus('refactorer', ['frontend-design', 'react-specialist'])).toBe(0);
  });

  it('multi-skill (frontend-design + react-specialist) yields a single non-doubled bonus', () => {
    // Capping mirrors DOMAIN_MATCH_BONUS semantics: a task with three frontend skills
    // still grants frontend-designer +SKILL_AGENT_AFFINITY_BONUS, not +3x.
    expect(
      getSkillAgentAffinityBonus('frontend-designer', ['frontend-design', 'react-specialist'])
    ).toBe(SKILL_AGENT_AFFINITY_BONUS);

    // Mixing with an unrelated skill must not change the cap
    expect(
      getSkillAgentAffinityBonus('frontend-designer', [
        'frontend-design',
        'react-specialist',
        'typescript-expert',
      ])
    ).toBe(SKILL_AGENT_AFFINITY_BONUS);

    // Empty / undefined skills → no bonus
    expect(getSkillAgentAffinityBonus('frontend-designer', [])).toBe(0);
    expect(getSkillAgentAffinityBonus('frontend-designer', undefined)).toBe(0);
  });
});

describe('frontend-designer beats architecture-planner for UI tasks (integration)', () => {
  let pool: AgentPool;

  beforeAll(() => {
    const manager = new AgentPoolManager(PROJECT_ROOT);
    pool = manager.loadAgents();
    const required = ['frontend-designer', 'architecture-planner', 'refactorer'];
    for (const id of required) {
      if (!pool.has(id)) {
        throw new Error(`live agent pool missing required built-in '${id}'`);
      }
    }
  });

  it('dashboard UI task with frontend-design skill routes to frontend-designer (not architecture-planner)', () => {
    const task = {
      title: 'Build AppShell layout component',
      description:
        'Build a top-level responsive React layout shell with header, sidebar, and Tailwind-styled content grid for the dashboard.',
      scope: {
        directories: ['src/dashboard/'],
        filesRead: [],
        filesWrite: ['src/dashboard/src/components/AppShell.tsx'],
      },
    };

    const decision = routeTaskV2(task, pool, new Map());
    expect(
      decision.agentId,
      `expected 'frontend-designer', got '${decision.agentId}'. Reasoning:\n${decision.reasoning.join('\n')}`,
    ).toBe('frontend-designer');
    // architecture-planner must not be the winner
    expect(decision.agentId).not.toBe('architecture-planner');
  });

  it('dashboard UI task with react-specialist concerns also routes to frontend-designer', () => {
    const task = {
      title: 'WorkerCard React component',
      description:
        'Create a WorkerCard React component displaying task progress and status indicators in the dashboard UI with responsive layout.',
      scope: {
        directories: ['src/dashboard/'],
        filesRead: [],
        filesWrite: ['src/dashboard/WorkerCard.tsx'],
      },
    };

    const decision = routeTaskV2(task, pool, new Map());
    expect(
      decision.agentId,
      `expected 'frontend-designer', got '${decision.agentId}'. Reasoning:\n${decision.reasoning.join('\n')}`,
    ).toBe('frontend-designer');
  });
});
