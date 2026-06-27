// Task 343-007 — Track C: routing-affinity enablement (ADR-075), default-off.
//
// Proves the two halves of the deliverable:
//   1. The skill→agent affinity flag, when threaded into `routeTaskV2` options,
//      makes the affinity bonus break an agent tiebreak (flag-on) while staying
//      byte-identical when off (flag-off) — the engine wire was already present;
//      this confirms a CALLER passing the flag actually changes the outcome.
//   2. The new `routing-affinity-observability` module records selections without
//      throwing and summarizes a deterministic agent distribution.
//   3. Wire-guard: each of the four production `routeTaskV2` call-sites threads
//      `skill_agent_affinity` (anti-regression for the ADR-075 wire-gap).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { routeTaskV2 } from '../../src/core/routing-engine.js';
import { classifyIntent } from '../../src/core/intent-classifier.js';
import {
  SKILL_AGENT_MAP,
  SKILL_AGENT_AFFINITY_BONUS,
} from '../../src/core/activation-engine.js';
import {
  InMemoryAgentSelectionSink,
  recordAgentSelection,
  summarizeAgentDistribution,
  type AgentSelectionRecord,
  type AgentSelectionSink,
} from '../../src/core/routing-affinity-observability.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import type { ActivationConfig, UserOverride } from '../../src/core/routing-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..', '..');

// ─── Synthetic two-agent pool ────────────────────────────────────────────────
// A neutral implementation task on `src/core/` scope (no domain/surface/exclusion
// signals). Both agents carry the SAME activation rule on the task's actual
// classified intent, so they TIE on base score. The generalist `refactorer` is
// inserted FIRST → it wins the (stable-sort) tie when affinity is off. The skill
// `security-specialist` maps to `security-auditor` in SKILL_AGENT_MAP, so with
// affinity ON that agent gains +SKILL_AGENT_AFFINITY_BONUS and takes the tie.

const TASK = {
  title: 'Implement a numeric helper utility',
  description: 'Implement a new helper utility function in the core module to compute aggregate values.',
  scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/agg-helper.ts'] },
};

const TIE_SCORE = 6; // ≥ default agentMinScore (5); identical for both agents → tie

function makeAgent(id: string, activation: ActivationConfig): AgentDefinition {
  return {
    id,
    name: id,
    description: `${id} synthetic test agent`,
    systemPrompt: '',
    expertise: [],
    allowedTools: [],
    deniedTools: [],
    preferredModel: 'sonnet',
    effortMultiplier: 1,
    triggerKeywords: [],
    triggerScopes: [],
    triggerFilePatterns: [],
    persistent: true,
    enabled: true,
    source: 'builtin',
    stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
    manifestVersion: 2,
    activation,
  };
}

/** Build the tie pool. refactorer is inserted first so it wins the flag-off tie. */
function buildTiePool(): AgentPool {
  const intent = classifyIntent(TASK).intent.primary;
  // Sanity: the chosen task must classify to an intent that excludes neither
  // agent (implementation has no dynamic exclusions). Guards against classifier drift.
  expect(intent).toBe('implementation');
  const rule: ActivationConfig = {
    rules: [{ name: `match-${intent}`, when: { 'intent.primary': intent }, score: TIE_SCORE }],
    exclude: [],
    minScore: 0,
  };
  const pool: AgentPool = new Map();
  pool.set('refactorer', makeAgent('refactorer', rule));
  pool.set('security-auditor', makeAgent('security-auditor', rule));
  return pool;
}

// security-specialist → security-auditor must hold for the scenario to be valid.
const AFFINITY_SKILL = 'security-specialist';
const AFFINITY_AGENT = 'security-auditor';

const forceSecuritySkill: UserOverride[] = [
  { source: 'task-directive', forceSkills: [AFFINITY_SKILL], priority: 3 },
];

describe('routing-affinity enablement (343-007, ADR-075)', () => {
  it('precondition: AFFINITY_SKILL maps to AFFINITY_AGENT in SKILL_AGENT_MAP', () => {
    expect(SKILL_AGENT_MAP[AFFINITY_SKILL]).toBe(AFFINITY_AGENT);
  });

  it('flag-OFF → generalist wins the tie (byte-identical baseline)', () => {
    const pool = buildTiePool();
    const decision = routeTaskV2(TASK, pool, new Map(), {
      overrides: forceSecuritySkill,
      skillAgentAffinity: false,
    });
    expect(decision.agentId).toBe('refactorer');
    expect(decision.skillIds).toEqual([AFFINITY_SKILL]);
  });

  it('flag-OMITTED → identical to flag-off (default-off contract)', () => {
    const pool = buildTiePool();
    const decision = routeTaskV2(TASK, pool, new Map(), { overrides: forceSecuritySkill });
    expect(decision.agentId).toBe('refactorer');
    expect(decision.skillIds).toEqual([AFFINITY_SKILL]);
  });

  it('flag-ON → affinity bonus flips the tie to the skill-mapped agent', () => {
    const pool = buildTiePool();
    const decision = routeTaskV2(TASK, pool, new Map(), {
      overrides: forceSecuritySkill,
      skillAgentAffinity: true,
    });
    expect(decision.agentId).toBe(AFFINITY_AGENT);
    // Skill assignment is unchanged by the flag — only the agent tiebreak moves.
    expect(decision.skillIds).toEqual([AFFINITY_SKILL]);
    // The winning agent's reasoning carries the affinity signal (used by the
    // sprint-planner observability wire to mark affinityApplied).
    expect(decision.reasoning.some((r) => r.includes('skill-affinity:'))).toBe(true);
  });

  it('flag-ON vs flag-OFF: skillIds are byte-identical (only the agent differs)', () => {
    const off = routeTaskV2(TASK, buildTiePool(), new Map(), {
      overrides: forceSecuritySkill,
      skillAgentAffinity: false,
    });
    const on = routeTaskV2(TASK, buildTiePool(), new Map(), {
      overrides: forceSecuritySkill,
      skillAgentAffinity: true,
    });
    expect(on.skillIds).toEqual(off.skillIds);
    expect(on.agentId).not.toBe(off.agentId);
  });
});

describe('routing-affinity observability module (343-007)', () => {
  it('recordAgentSelection never throws — even when the sink throws', () => {
    const throwingSink: AgentSelectionSink = {
      append() {
        throw new Error('sink is broken');
      },
    };
    expect(() =>
      recordAgentSelection(throwingSink, { taskId: 't1', agentId: 'refactorer', affinityApplied: false }),
    ).not.toThrow();
  });

  it('InMemoryAgentSelectionSink accumulates records in insertion order', () => {
    const sink = new InMemoryAgentSelectionSink();
    recordAgentSelection(sink, { taskId: 't1', agentId: 'a', affinityApplied: true });
    recordAgentSelection(sink, { taskId: 't2', agentId: 'b', affinityApplied: false });
    expect(sink.records.map((r) => r.taskId)).toEqual(['t1', 't2']);
  });

  it('summarizeAgentDistribution produces a deterministic snapshot over a seeded set', () => {
    // Seeded record set: 3× security-auditor (2 affinity), 2× refactorer, 1× api-builder (affinity).
    const records: AgentSelectionRecord[] = [
      { taskId: 't1', agentId: 'security-auditor', affinityApplied: true },
      { taskId: 't2', agentId: 'refactorer', affinityApplied: false },
      { taskId: 't3', agentId: 'security-auditor', affinityApplied: true },
      { taskId: 't4', agentId: 'api-builder', affinityApplied: true },
      { taskId: 't5', agentId: 'refactorer', affinityApplied: false },
      { taskId: 't6', agentId: 'security-auditor', affinityApplied: false },
    ];
    const snap = summarizeAgentDistribution(records);
    expect(snap).toEqual({
      total: 6,
      affinityInfluenced: 3,
      affinityInfluencedShare: 0.5,
      agents: [
        { agentId: 'security-auditor', count: 3, share: 0.5 },
        { agentId: 'refactorer', count: 2, share: 2 / 6 },
        { agentId: 'api-builder', count: 1, share: 1 / 6 },
      ],
    });
  });

  it('summarizeAgentDistribution is insertion-order-independent (count desc, id asc ties)', () => {
    const a: AgentSelectionRecord[] = [
      { taskId: '1', agentId: 'zeta', affinityApplied: false },
      { taskId: '2', agentId: 'alpha', affinityApplied: false },
      { taskId: '3', agentId: 'alpha', affinityApplied: false },
      { taskId: '4', agentId: 'zeta', affinityApplied: false },
    ];
    const b = [...a].reverse();
    // Equal counts (2 each) → tie broken by agentId ascending: alpha before zeta.
    const expectedAgents = [
      { agentId: 'alpha', count: 2, share: 0.5 },
      { agentId: 'zeta', count: 2, share: 0.5 },
    ];
    expect(summarizeAgentDistribution(a).agents).toEqual(expectedAgents);
    expect(summarizeAgentDistribution(b).agents).toEqual(expectedAgents);
  });

  it('summarizeAgentDistribution handles the empty set without dividing by zero', () => {
    expect(summarizeAgentDistribution([])).toEqual({
      total: 0,
      affinityInfluenced: 0,
      affinityInfluencedShare: 0,
      agents: [],
    });
  });
});

describe('routing-affinity wire-guard — all 4 call-sites thread the flag (343-007)', () => {
  // Anti-regression for the ADR-075 wire-gap: the engine reads the option, but the
  // feature ships dead unless every production caller passes it. This asserts the
  // wire EXISTS at each call-site (proving the wire, not just the def — ADR-075 lesson).
  const CALL_SITES = [
    'src/orchestra/sprint-planner.ts',
    'src/orchestra/task-mode-runner.ts',
    'src/mcp/tools/run.ts',
    'src/cli/commands/run.ts',
  ];

  for (const rel of CALL_SITES) {
    it(`${rel} threads skill_agent_affinity into routeTaskV2 options`, () => {
      const src = readFileSync(resolve(PROJECT_ROOT, rel), 'utf-8');
      expect(src).toContain('skill_agent_affinity');
      expect(src).toMatch(/skillAgentAffinity/);
    });
  }
});
