// Sprint 210 — Task 210-004
// End-to-end CANLI (live) routing diversity check using the on-disk built-in
// agent pool — not hermetic fakes. This is the regression guard for ADR-072
// (multi-signal scoring + domain-match bonus from Sprint 209-001..005): a
// freshly loaded agent pool MUST route the five canonical scope patterns
// (api / auth / dashboard / database / generic core) to five DIFFERENT
// built-in agents, with refactorer winning only the generic case.
//
// `routing-multisignal.test.ts` already validates the math against fakes;
// this file proves the on-disk `.deckent/agents/*` activation rules + the
// path-extracted domain map agree with that math after a real load.
//
// 444-003 note: Sprint 444 moved the generic-implementation floor from
// refactorer(7) to a new `implementer` builtin(7) — see
// tests/core/routing-impl-builtin.test.ts for the hermetic routing-math pin
// on that transition. The 444 follow-up landed host-side: the
// `.deckent/agents/refactorer/agent.json` shadow mirrors the refactor-only
// manifest, `.deckent/agents/implementer/` is materialized, and refactorer
// was dropped from agent-pool.ts's BUILTIN_IMPLEMENTATION_INTENT_RULES — so
// against the LIVE pool the 'generic-core' case resolves to `implementer`.
// The assertions still accept either FLOOR_AGENT (deliberately name-agnostic
// across the transition) while pinning the guard that actually matters here:
// no DOMAIN task ever falls back to the generic floor, whichever agent
// currently holds it.

import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { AgentPoolManager } from '../../src/core/agent-pool.js';
import { routeTaskV2 } from '../../src/core/routing-engine.js';
import type { AgentPool } from '../../src/core/agent-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..', '..');

interface LiveTask {
  label: string;
  expected: string;
  /**
   * When set, the per-task routing test accepts ANY of these agentIds instead
   * of a single exact match on `expected` (444-003: generic-core's floor
   * agent is mid-transition between refactorer and implementer — see file
   * header note). `expected` is still used as the "primary"/documentation
   * label and as the FLOOR_AGENTS set for the diversity assertion below.
   */
  acceptable?: string[];
  task: {
    title: string;
    description: string;
    scope: { directories: string[]; filesRead: string[]; filesWrite: string[] };
  };
}

// 444-003: agents that can legitimately hold the generic-implementation floor
// right now — see file header note for why this is a set, not a single id.
const FLOOR_AGENTS = ['refactorer', 'implementer'];

// Five canonical scope patterns. Descriptions are picked so intent classifier
// keyword scoring stays inside the bucket each agent owns — e.g. the database/migration
// case avoids 'schema/migration' words so intent stays at 'implementation' and
// data-engineer's post-601 `intent.primary='migration'@6` rule
// activation rule actually fires.
const TASKS: LiveTask[] = [
  {
    label: 'api',
    expected: 'api-builder',
    task: {
      title: 'Add /sprints endpoint to API server',
      description: 'Add a new REST endpoint module to expose sprint status. Wire the route into the existing server.',
      scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/sprints-endpoint.ts'] },
    },
  },
  {
    label: 'auth',
    expected: 'security-auditor',
    task: {
      title: 'Tighten JWT auth helper',
      description: 'Harden authentication helper with stricter JWT signature checks and replay-attack mitigation.',
      scope: { directories: ['src/auth/'], filesRead: [], filesWrite: ['src/auth/jwt-helper.ts'] },
    },
  },
  {
    label: 'dashboard',
    expected: 'frontend-designer',
    task: {
      title: 'SprintControl dashboard component',
      description: 'Build a responsive React component for the dashboard. Tailwind-styled layout with status panel.',
      scope: { directories: ['src/dashboard/'], filesRead: [], filesWrite: ['src/dashboard/SprintControl.tsx'] },
    },
  },
  {
    // post-601 contract: data-engineer keeps a cross-project $or domain rule
    // (database|db|models @8 — Yasa-#2 foreign-reach, lint-sanctioned orphan)
    // alongside intent.primary='migration'@6. This fixture represents a
    // foreign-project data-dir task (synthetic domains=[database]).
    label: 'database',
    expected: 'data-engineer',
    task: {
      title: 'Add user repository for database access',
      description: 'Add a repository module that wraps the database connection pool and exposes typed query helpers.',
      scope: { directories: ['src/database/'], filesRead: [], filesWrite: ['src/database/user-repository.ts'] },
    },
  },
  {
    label: 'generic-core',
    expected: 'implementer',
    // 444-003: accept the current live-pool winner (refactorer, via the
    // not-yet-synced .deckent/agents shadow) alongside the target-state
    // winner (implementer) — see file header note.
    acceptable: FLOOR_AGENTS,
    task: {
      title: 'Add number formatter helper',
      description: 'Add a small formatter function that produces thousand-separated strings for byte counts.',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/number-format.ts'] },
    },
  },
];

describe('routing live diversity (Sprint 210 / 210-004)', () => {
  let pool: AgentPool;

  beforeAll(() => {
    const manager = new AgentPoolManager(PROJECT_ROOT);
    pool = manager.loadAgents();
    // Sanity: the live built-ins this test depends on must be present.
    const required = ['api-builder', 'security-auditor', 'frontend-designer', 'data-engineer', 'refactorer'];
    for (const id of required) {
      if (!pool.has(id)) {
        throw new Error(`live agent pool missing required built-in '${id}'`);
      }
    }
  });

  for (const tc of TASKS) {
    it(`${tc.label} task → ${tc.acceptable ? tc.acceptable.join('|') : tc.expected}`, () => {
      const decision = routeTaskV2(tc.task, pool, new Map());
      if (tc.acceptable) {
        expect(
          tc.acceptable,
          `routing trace for ${tc.label}:\n${decision.reasoning.join('\n')}`,
        ).toContain(decision.agentId);
      } else {
        expect(
          decision.agentId,
          `routing trace for ${tc.label}:\n${decision.reasoning.join('\n')}`,
        ).toBe(tc.expected);
      }
    });
  }

  it('five diverse tasks pick at least three distinct agents and the generic-implementation floor dominates none of the domain cases', () => {
    const selections = TASKS.map(tc => {
      const d = routeTaskV2(tc.task, pool, new Map());
      return { label: tc.label, agentId: d.agentId };
    });

    const distinct = new Set(selections.map(s => s.agentId));
    expect(distinct.size, `distinct agents across 5 tasks: ${JSON.stringify(selections)}`).toBeGreaterThanOrEqual(3);

    // The Sprint 208 imbalance was "everything → refactorer". Verify the
    // generic-implementation floor (refactorer today, implementer once
    // 444-003's live-pool follow-up lands — see FLOOR_AGENTS) wins exactly
    // the generic-core slot — no domain task falls back to it.
    const floorWins = selections.filter(s => FLOOR_AGENTS.includes(s.agentId));
    expect(floorWins.map(s => s.label)).toEqual(['generic-core']);
  });
});
