// Sprint 216 — Task 216-003
// User-surface routing: dashboard/cli/api/e2e tasks must route to their
// surface-aware agent owner (frontend-designer / api-builder / ci-guardian),
// not collapse to refactorer's generic impl@7 fallback.
//
// Hermetic — fakes the agent pool with the same activation rules the on-disk
// .deckent/agents/*.json files carry, so the test passes on a fresh checkout
// without a built `.deckent/` directory present.

import { describe, it, expect } from 'vitest';
import {
  routeTaskV2,
  getUserSurfaceBonus,
  USER_SURFACE_BONUS,
  USER_SURFACE_AGENTS,
  SURFACE_DOMAIN_TO_AGENT_ID,
} from '../../src/core/routing-engine.js';
import { classifyIntent } from '../../src/core/intent-classifier.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';

function makeAgent(id: string, overrides: Partial<AgentDefinition>): AgentDefinition {
  const base = createAgentDefinition({ id, name: id });
  return { ...base, ...overrides };
}

function makePool(...agents: AgentDefinition[]): AgentPool {
  return new Map(agents.map((a) => [a.id, a]));
}

// ── Hermetic agents (mirror on-disk activation rules from
// `src/core/builtins/agents/*/agent.json`) ──────────────────────────────────
const refactorer = makeAgent('refactorer', {
  source: 'builtin',
  activation: {
    rules: [
      { when: { 'intent.primary': 'refactor' }, score: 10 },
      { when: { 'intent.primary': 'implementation' }, score: 7 },
    ],
    exclude: [],
    minScore: 5,
  },
});

const apiBuilder = makeAgent('api-builder', {
  source: 'builtin',
  activation: {
    rules: [
      { when: { domains: { $contains: 'api' } }, score: 8 },
    ],
    exclude: [],
    minScore: 5,
  },
});

const frontendDesigner = makeAgent('frontend-designer', {
  source: 'builtin',
  activation: {
    rules: [
      { when: { 'intent.primary': 'design' }, score: 10 },
      { when: { domains: { $contains: 'frontend' } }, score: 8 },
    ],
    exclude: [],
    minScore: 5,
  },
});

const ciGuardian = makeAgent('ci-guardian', {
  source: 'builtin',
  activation: {
    rules: [
      { when: { 'intent.primary': 'devops' }, score: 10 },
    ],
    // Mirrors on-disk: ci-guardian excludes implementation intent —
    // the very rule that drops it from e2e/test-harness tasks today.
    // Sprint 216 surface bypass overrides this for `e2e`/`harness` domains.
    exclude: [{ when: { 'intent.primary': 'implementation' } }],
    minScore: 5,
  },
});

// All four agents in one pool — the actual competition surface for
// "refactorer collapse" regression cases.
function fullPool(): AgentPool {
  return makePool(refactorer, apiBuilder, frontendDesigner, ciGuardian);
}

describe('user-surface routing (Sprint 216 / 216-003)', () => {
  it('dashboard task (src/dashboard/) → frontend-designer wins, refactorer loses', () => {
    const decision = routeTaskV2(
      {
        title: 'SprintControl panel component',
        description: 'Build a responsive React panel that surfaces sprint phase and worker status.',
        scope: {
          directories: ['src/dashboard/'],
          filesRead: [],
          filesWrite: ['src/dashboard/SprintControl.tsx'],
        },
      },
      fullPool(),
      new Map(),
    );

    expect(decision.agentId).toBe('frontend-designer');
    expect(decision.reasoning.some(r => r.includes('user-surface bonus'))).toBe(true);
    // frontend-designer wins over refactorer impl@7 by a clean margin.
    // design@10 already wins, but the surface bonus enforces that even if
    // future intent-classification drift demotes 'design' the agent still
    // out-scores refactorer.
    expect(decision.agentScore).toBeGreaterThan(7);
  });

  it('api task (src/api/) → api-builder wins via domain + surface bonus', () => {
    const decision = routeTaskV2(
      {
        title: 'Add /sprints endpoint to server',
        description: 'Add a REST endpoint that exposes sprint status. Wire route into existing server module.',
        scope: {
          directories: ['src/api/'],
          filesRead: [],
          filesWrite: ['src/api/sprints-endpoint.ts'],
        },
      },
      fullPool(),
      new Map(),
    );

    expect(decision.agentId).toBe('api-builder');
    // api-builder: 8 (domain rule) + 3 (DOMAIN_MATCH) + 8 (USER_SURFACE) = 19,
    // refactorer impl@7 — surface bonus widens the margin so a learning
    // bonus on refactorer cannot flip the result.
    expect(decision.agentScore).toBeGreaterThanOrEqual(8 + USER_SURFACE_BONUS);
    expect(decision.reasoning.some(r => r.includes('user-surface bonus'))).toBe(true);
  });

  it('CLI surface task (src/cli/commands/serve.ts) → api-builder wins even though "cli" is outside TASK_DOMAIN_TO_AGENT_ID', () => {
    const decision = routeTaskV2(
      {
        title: 'Auto-mint localhost API token in serve',
        description: 'Add logic to randomly generate the API token on a fresh serve invocation when running on localhost without an explicit token.',
        scope: {
          directories: ['src/cli/commands/'],
          filesRead: [],
          filesWrite: ['src/cli/commands/serve.ts'],
        },
      },
      fullPool(),
      new Map(),
    );

    // The Sprint 214 regression: api-builder's `domains $contains 'api'`
    // rule does not fire for domain='cli', so without the surface bonus
    // refactorer impl@7 wins by default. With USER_SURFACE_BONUS = 8 the
    // bare bonus (0 + 8) clears refactorer's 7.
    expect(decision.agentId).toBe('api-builder');
    expect(decision.reasoning.some(r => r.includes('user-surface bonus'))).toBe(true);
  });

  it('refactorer never wins a user-surface task (anti-collapse regression guard)', () => {
    const surfaceCases = [
      { dir: 'src/dashboard/', file: 'src/dashboard/EvolutionPage.tsx', expected: 'frontend-designer' },
      { dir: 'src/api/', file: 'src/api/memory-search-endpoint.ts', expected: 'api-builder' },
      { dir: 'src/cli/commands/', file: 'src/cli/commands/chat.ts', expected: 'api-builder' },
    ];

    for (const tc of surfaceCases) {
      const decision = routeTaskV2(
        {
          title: 'Surface task',
          description: 'Add functionality to the user-facing surface.',
          scope: { directories: [tc.dir], filesRead: [], filesWrite: [tc.file] },
        },
        fullPool(),
        new Map(),
      );
      expect(decision.agentId, `surface task ${tc.dir} should not collapse to refactorer`).not.toBe('refactorer');
      expect(decision.agentId).toBe(tc.expected);
    }
  });

  it('e2e harness task (tests/e2e/) → ci-guardian wins despite impl-intent exclude bypass', () => {
    const decision = routeTaskV2(
      {
        title: 'e2e serve smoke harness',
        description: 'Boot the real CLI binary, request /api/status, and assert 200. Permanent regression guard for the serve user surface.',
        scope: {
          directories: ['tests/e2e/'],
          filesRead: [],
          filesWrite: ['tests/e2e/serve-smoke.test.ts'],
        },
      },
      fullPool(),
      new Map(),
    );

    // Sanity: this is exactly the case ci-guardian's on-disk exclude rule
    // (`intent.primary: 'implementation'`) blocks today. The surface bypass
    // is the whole point of this test.
    expect(decision.taskDNA.intent.primary).toBe('implementation');
    expect(decision.agentId).toBe('ci-guardian');
    expect(decision.reasoning.some(r => r.includes('surface exclude bypass'))).toBe(true);
    expect(decision.reasoning.some(r => r.includes('user-surface bonus'))).toBe(true);
  });

  it('getUserSurfaceBonus: returns USER_SURFACE_BONUS only for surface-owner agents on their domain', () => {
    const cliDNA = classifyIntent({
      title: 'tweak serve command',
      description: 'small fix to serve command',
      scope: {
        directories: ['src/cli/commands/'],
        filesRead: [],
        filesWrite: ['src/cli/commands/serve.ts'],
      },
    });
    expect(cliDNA.domains.some(d => d.name === 'cli')).toBe(true);

    // api-builder owns the cli surface.
    expect(getUserSurfaceBonus('api-builder', cliDNA)).toBe(USER_SURFACE_BONUS);
    // frontend-designer is a surface agent but doesn't own `cli`.
    expect(getUserSurfaceBonus('frontend-designer', cliDNA)).toBe(0);
    // Non-surface agents never receive the bonus.
    expect(getUserSurfaceBonus('refactorer', cliDNA)).toBe(0);
    expect(getUserSurfaceBonus('architect', cliDNA)).toBe(0);

    // The api surface still routes through the bonus (covers the existing
    // TASK_DOMAIN_TO_AGENT_ID `api` entry — surface bonus reuses the map).
    const apiDNA = classifyIntent({
      title: 'add endpoint',
      description: 'add endpoint',
      scope: {
        directories: ['src/api/'],
        filesRead: [],
        filesWrite: ['src/api/server.ts'],
      },
    });
    expect(getUserSurfaceBonus('api-builder', apiDNA)).toBe(USER_SURFACE_BONUS);
  });

  it('SURFACE_DOMAIN_TO_AGENT_ID covers the regression targets (cli, commands, serve, e2e, harness)', () => {
    // Guardrail: if any of these keys get dropped a future routing change
    // silently re-introduces refactorer-collapse for that surface.
    expect(SURFACE_DOMAIN_TO_AGENT_ID.cli).toBe('api-builder');
    expect(SURFACE_DOMAIN_TO_AGENT_ID.commands).toBe('api-builder');
    expect(SURFACE_DOMAIN_TO_AGENT_ID.serve).toBe('api-builder');
    expect(SURFACE_DOMAIN_TO_AGENT_ID.e2e).toBe('ci-guardian');
    expect(SURFACE_DOMAIN_TO_AGENT_ID.harness).toBe('ci-guardian');

    expect(USER_SURFACE_AGENTS.has('api-builder')).toBe(true);
    expect(USER_SURFACE_AGENTS.has('frontend-designer')).toBe(true);
    expect(USER_SURFACE_AGENTS.has('ci-guardian')).toBe(true);
    // Non-surface agents must stay out — adding e.g. refactorer here would
    // defeat the entire bonus.
    expect(USER_SURFACE_AGENTS.has('refactorer')).toBe(false);
  });
});
