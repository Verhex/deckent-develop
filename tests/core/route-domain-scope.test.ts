// Sprint 359, Task 359-005 ROUTE-DOMAIN-SCOPE (born-470, flag-gated) — mirrors
// tests/core/w5c-kind-affinity.test.ts conventions.
//
// born-470 (3-sprint-proven, 358-002: APR-XPROC-WIRE): a REPL/Ink task scoped
// under `src/cli/repl/` extracts the generic path-proxy domain name `'cli'`
// (intent-classifier.ts detectDomains — first path segment), which
// SURFACE_DOMAIN_TO_AGENT_ID maps to `'api-builder'`. So terminal-UI work was
// routed to the REST/HTTP specialist purely on a path-segment coincidence, not
// because the task has anything to do with APIs. See
// tests/core/user-surface-routing.test.ts "CLI surface task ... -> api-builder
// wins" for the flag-off baseline this file must NOT disturb.
//
// This file verifies the new curated scope-domain extraction
// (`extractScopeDomain`) and its flag-gated (`RoutingOptions.domainFromScope`,
// default-off) priority-replace behavior in `getDomainMatchBonus` /
// `getUserSurfaceBonus` / `routeTaskV2`.

import { describe, it, expect } from 'vitest';
import {
  routeTaskV2,
  extractScopeDomain,
  SCOPE_DOMAIN_TO_AGENT_ID,
  getDomainMatchBonus,
  getUserSurfaceBonus,
  USER_SURFACE_BONUS,
  DOMAIN_MATCH_BONUS,
} from '../../src/core/routing-engine.js';
import { classifyIntent } from '../../src/core/intent-classifier.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import type { TaskScope } from '../../src/core/task-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAgent(id: string, overrides: Partial<AgentDefinition>): AgentDefinition {
  const base = createAgentDefinition({ id, name: id });
  return { ...base, ...overrides };
}

function makePool(...agents: AgentDefinition[]): AgentPool {
  return new Map(agents.map((a) => [a.id, a]));
}

function makeSkillPool(): Map<string, SkillDefinition> {
  return new Map();
}

function scope(directories: string[], filesWrite: string[]): TaskScope {
  return { directories, filesRead: [], filesWrite };
}

// Hermetic agents (mirror on-disk activation rules — same fixtures as
// tests/core/user-surface-routing.test.ts, kept in sync deliberately so the
// 358-002-shaped fixture below reproduces the real regression).
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
    rules: [{ when: { domains: { $contains: 'api' } }, score: 8 }],
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

function fullPool(): AgentPool {
  return makePool(refactorer, apiBuilder, frontendDesigner);
}

// ─── Unit: extractScopeDomain ────────────────────────────────────────────────

describe('ROUTE-DOMAIN-SCOPE: extractScopeDomain', () => {
  it('src/cli/repl/* -> terminal-ui', () => {
    expect(extractScopeDomain(scope(['src/cli/repl/'], ['src/cli/repl/input.ts']))).toBe('terminal-ui');
  });

  it('src/cli/* (outside repl/) -> terminal-ui', () => {
    expect(extractScopeDomain(scope(['src/cli/commands/'], ['src/cli/commands/serve.ts']))).toBe('terminal-ui');
  });

  it('src/api/* -> api', () => {
    expect(extractScopeDomain(scope(['src/api/'], ['src/api/sprints-endpoint.ts']))).toBe('api');
  });

  it('src/dashboard/* -> frontend', () => {
    expect(extractScopeDomain(scope(['src/dashboard/'], ['src/dashboard/Panel.tsx']))).toBe('frontend');
  });

  it('src/core/* -> core', () => {
    expect(extractScopeDomain(scope(['src/core/'], ['src/core/routing-engine.ts']))).toBe('core');
  });

  it('src/orchestra/* -> orchestration', () => {
    expect(extractScopeDomain(scope(['src/orchestra/'], ['src/orchestra/brain.ts']))).toBe('orchestration');
  });

  it('docs/* -> doc', () => {
    expect(extractScopeDomain(scope(['docs/'], ['docs/reference/api-surface.md']))).toBe('doc');
  });

  it('src/connectors/* -> messaging', () => {
    expect(extractScopeDomain(scope(['src/connectors/'], ['src/connectors/telegram.ts']))).toBe('messaging');
  });

  it('a scope outside the curated table returns null', () => {
    expect(extractScopeDomain(scope(['src/agents/'], ['src/agents/worker.ts']))).toBeNull();
    expect(extractScopeDomain(scope([], []))).toBeNull();
  });

  it('checks filesWrite before directories, and returns the first match', () => {
    // filesWrite entry matches 'api', directories entry would match 'core' —
    // filesWrite is checked first per extractScopeDomain's declared order.
    expect(extractScopeDomain(scope(['src/core/'], ['src/api/endpoint.ts']))).toBe('api');
  });
});

// ─── Unit: getDomainMatchBonus / getUserSurfaceBonus scopeDomain param ───────

describe('ROUTE-DOMAIN-SCOPE: getDomainMatchBonus scopeDomain override', () => {
  const cliDNA = classifyIntent({
    title: 'tweak serve command',
    description: 'small fix to serve command',
    scope: scope(['src/cli/commands/'], ['src/cli/commands/serve.ts']),
  });

  it('omitted (undefined) scopeDomain behaves exactly like the pre-359-005 4-arg call', () => {
    const withUndefined = getDomainMatchBonus('api-builder', 'react', cliDNA, true, undefined);
    const without = getDomainMatchBonus('api-builder', 'react', cliDNA, true);
    expect(withUndefined).toBe(without);
  });

  it('null scopeDomain (flag on, no curated match) falls through to the generic lookup unchanged', () => {
    const withNull = getDomainMatchBonus('api-builder', 'react', cliDNA, true, null);
    const without = getDomainMatchBonus('api-builder', 'react', cliDNA, true);
    expect(withNull).toBe(without);
  });

  it("truthy scopeDomain='terminal-ui' (no owning agent) suppresses the bonus for every agent", () => {
    expect(getDomainMatchBonus('api-builder', 'react', cliDNA, true, 'terminal-ui')).toBe(0);
    expect(getDomainMatchBonus('refactorer', 'system', cliDNA, true, 'terminal-ui')).toBe(0);
  });

  it("truthy scopeDomain='api' grants the bonus only to api-builder", () => {
    expect(getDomainMatchBonus('api-builder', 'react', cliDNA, true, 'api')).toBe(DOMAIN_MATCH_BONUS);
    expect(getDomainMatchBonus('frontend-designer', 'react', cliDNA, true, 'api')).toBe(0);
  });

  it('scopeDomain override is ignored when allowPathProxy is false', () => {
    expect(getDomainMatchBonus('api-builder', 'react', cliDNA, false, 'api')).toBe(0);
  });
});

describe('ROUTE-DOMAIN-SCOPE: getUserSurfaceBonus scopeDomain override', () => {
  const cliDNA = classifyIntent({
    title: 'tweak serve command',
    description: 'small fix to serve command',
    scope: scope(['src/cli/commands/'], ['src/cli/commands/serve.ts']),
  });

  it('omitted (undefined) scopeDomain behaves exactly like the pre-359-005 2-arg call', () => {
    expect(getUserSurfaceBonus('api-builder', cliDNA, undefined)).toBe(getUserSurfaceBonus('api-builder', cliDNA));
    // Baseline: 'cli' IS in SURFACE_DOMAIN_TO_AGENT_ID, so flag-off api-builder wins today.
    expect(getUserSurfaceBonus('api-builder', cliDNA)).toBe(USER_SURFACE_BONUS);
  });

  it('null scopeDomain falls through to the generic lookup unchanged', () => {
    expect(getUserSurfaceBonus('api-builder', cliDNA, null)).toBe(USER_SURFACE_BONUS);
  });

  it("truthy scopeDomain='terminal-ui' suppresses api-builder's surface bonus (the born-470 fix)", () => {
    expect(getUserSurfaceBonus('api-builder', cliDNA, 'terminal-ui')).toBe(0);
    expect(getUserSurfaceBonus('frontend-designer', cliDNA, 'terminal-ui')).toBe(0);
  });

  it("truthy scopeDomain='frontend' grants the bonus only to frontend-designer", () => {
    expect(getUserSurfaceBonus('frontend-designer', cliDNA, 'frontend')).toBe(USER_SURFACE_BONUS);
    expect(getUserSurfaceBonus('api-builder', cliDNA, 'frontend')).toBe(0);
  });
});

// ─── SCOPE_DOMAIN_TO_AGENT_ID table ──────────────────────────────────────────

describe('ROUTE-DOMAIN-SCOPE: SCOPE_DOMAIN_TO_AGENT_ID', () => {
  it('only maps curated domains that have a genuine built-in specialist', () => {
    expect(SCOPE_DOMAIN_TO_AGENT_ID['api']).toBe('api-builder');
    expect(SCOPE_DOMAIN_TO_AGENT_ID['frontend']).toBe('frontend-designer');
    expect(SCOPE_DOMAIN_TO_AGENT_ID['doc']).toBe('doc-writer');
  });

  it("'terminal-ui', 'core', 'orchestration', 'messaging' deliberately have no agent (the born-470 fix)", () => {
    expect(SCOPE_DOMAIN_TO_AGENT_ID['terminal-ui']).toBeUndefined();
    expect(SCOPE_DOMAIN_TO_AGENT_ID['core']).toBeUndefined();
    expect(SCOPE_DOMAIN_TO_AGENT_ID['orchestration']).toBeUndefined();
    expect(SCOPE_DOMAIN_TO_AGENT_ID['messaging']).toBeUndefined();
  });
});

// ─── Flag-off: byte-identical routing ────────────────────────────────────────

describe('routing-v2: domainFromScope flag-off (byte-identical)', () => {
  it('omitted option === explicit false — CLI surface task still routes to api-builder (baseline unchanged)', () => {
    const task = {
      title: 'Auto-mint localhost API token in serve',
      description: 'Add logic to randomly generate the API token on a fresh serve invocation.',
      scope: scope(['src/cli/commands/'], ['src/cli/commands/serve.ts']),
    };

    const resultDefault = routeTaskV2(task, fullPool(), makeSkillPool());
    const resultExplicitOff = routeTaskV2(task, fullPool(), makeSkillPool(), { domainFromScope: false });

    expect(resultDefault.agentId).toBe('api-builder');
    expect(resultDefault.agentId).toBe(resultExplicitOff.agentId);
    expect(resultDefault.agentScore).toBe(resultExplicitOff.agentScore);
    expect(resultDefault.reasoning).toEqual(resultExplicitOff.reasoning);
    expect(resultDefault.reasoning.some((r) => r.includes('Scope-domain'))).toBe(false);
  });
});

// ─── Flag-on: 358-002-shaped regression fixture ──────────────────────────────

describe('routing-v2: domainFromScope flag-on', () => {
  it('358-002-shaped fixture (REPL cross-process approval feed, src/cli/repl/) — api-builder does NOT win', () => {
    const task = {
      title: 'APR-XPROC-WIRE — REPL cross-process approval feed',
      description: 'Wire cross-process approval events into the REPL Ink UI so the running terminal reflects live approval state.',
      scope: scope(['src/cli/repl/'], ['src/cli/repl/approval-feed.ts']),
    };

    const resultOff = routeTaskV2(task, fullPool(), makeSkillPool(), { domainFromScope: false });
    const resultOn = routeTaskV2(task, fullPool(), makeSkillPool(), { domainFromScope: true });

    // Flag-off reproduces the born-470 bug: api-builder wins via the 'cli' surface bonus.
    expect(resultOff.agentId).toBe('api-builder');

    // Flag-on: the born-470 fix — api-builder must NOT be selected.
    expect(resultOn.agentId).not.toBe('api-builder');
    // No dedicated terminal-ui specialist exists in the built-in roster (verified
    // against agent-pool.ts) — generic activation-rule scoring picks the best
    // available implementer instead (refactorer's impl@7, unaffected by the
    // suppressed domain/surface bonus).
    expect(resultOn.agentId).toBe('refactorer');
    expect(resultOn.reasoning.some((r) => r.includes("Scope-domain (born-470): 'terminal-ui'"))).toBe(true);
    expect(resultOn.reasoning.some((r) => r.includes('user-surface bonus'))).toBe(false);
  });

  it('flag-on, curated match that agrees with the real owner (src/api/) — api-builder still wins', () => {
    const task = {
      title: 'Add /sprints endpoint to server',
      description: 'Add a REST endpoint that exposes sprint status.',
      scope: scope(['src/api/'], ['src/api/sprints-endpoint.ts']),
    };

    const resultOn = routeTaskV2(task, fullPool(), makeSkillPool(), { domainFromScope: true });

    expect(resultOn.agentId).toBe('api-builder');
    expect(resultOn.reasoning.some((r) => r.includes("Scope-domain (born-470): 'api'"))).toBe(true);
  });

  it('flag-on, non-curated scope (src/agents/) falls through to flag-off behavior (no regression)', () => {
    const task = {
      title: 'Adjust adaptive agent timeout',
      description: 'Adjust the retry timeout used by the adaptive agent loop.',
      scope: scope(['src/agents/'], ['src/agents/adaptive-agent.ts']),
    };

    const resultOff = routeTaskV2(task, fullPool(), makeSkillPool(), { domainFromScope: false });
    const resultOn = routeTaskV2(task, fullPool(), makeSkillPool(), { domainFromScope: true });

    expect(resultOn.agentId).toBe(resultOff.agentId);
    expect(resultOn.agentScore).toBe(resultOff.agentScore);
    expect(resultOn.reasoning.some((r) => r.includes('Scope-domain (born-470): none'))).toBe(true);
  });
});
