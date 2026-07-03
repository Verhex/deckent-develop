// Sprint 362, Task 362-006 DOMAIN-ROUTE-WIRE — mirrors tests/core/route-domain-scope.test.ts
// conventions. Locks the routeTaskV2 wiring of BOTH flags:
//   (a) `domainFromScope` (359-005) — already fully wired before this task; this file adds
//       matrix coverage confirming it composes cleanly with (b).
//   (b) `openRouterDocRoute` (361-003's resolveOpenRouterDocRoute, newly wired by this task)
//       — flag-gated, requires openRouterConfig + openRouterCache, ASLA overrides an existing
//       task.forceModel/task.provider, surfaced via `reasoning` text (no dedicated
//       RoutingDecision field — routing-types.ts is outside this task's write scope).
import { describe, it, expect } from 'vitest';
import { routeTaskV2 } from '../../src/core/routing-engine.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import type { TaskScope } from '../../src/core/task-types.js';
import type { OpenRouterRouteConfig } from '../../src/core/routing-openrouter.js';
import type { FreeModelCache } from '../../src/core/openrouter-models.js';

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

// Same fixture shape as route-domain-scope.test.ts's 358-002-shaped regression case —
// a REPL/Ink task whose path-proxy domain ('cli') would otherwise route to api-builder.
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

function fullPool(): AgentPool {
  return makePool(refactorer, apiBuilder);
}

const FREE_MODEL_ID = 'meta-llama/llama-3.1-8b-instruct:free';

function cacheWith(...ids: string[]): FreeModelCache {
  return {
    generatedAt: '2026-07-02T00:00:00.000Z',
    models: ids.map((id) => ({ id, context: 8192, modality: 'text->text' })),
  };
}

function openRouterConfig(overrides: Partial<OpenRouterRouteConfig> = {}): OpenRouterRouteConfig {
  return { enabled: true, doc_route: true, model: FREE_MODEL_ID, ...overrides };
}

// A CLI-surface task — reused across the matrix so both flags have real signal to react to.
const cliTask = {
  title: 'Wire cross-process approval feed',
  description: 'Wire cross-process approval events into the REPL Ink UI.',
  scope: scope(['src/cli/repl/'], ['src/cli/repl/approval-feed.ts']),
};

// A doc-kind task — the only kind openRouterDocRoute may ever suggest for.
const docTask = {
  title: 'Update routing guide',
  description: 'Document the new routing flags.',
  type: 'documentation' as const,
  scope: scope(['docs/'], ['docs/guide.md']),
};

// ─── Matrix: domainFromScope x openRouterDocRoute ────────────────────────────

describe('DOMAIN-ROUTE-WIRE: flag matrix (off/off, on/off, off/on, on/on)', () => {
  it('off/off — no Scope-domain line, no OpenRouter doc-route line (baseline)', () => {
    const result = routeTaskV2(cliTask, fullPool(), makeSkillPool());
    expect(result.reasoning.some((r) => r.includes('Scope-domain'))).toBe(false);
    expect(result.reasoning.some((r) => r.includes('OpenRouter doc-route'))).toBe(false);
  });

  it('on/off — Scope-domain line present, no OpenRouter doc-route line', () => {
    const result = routeTaskV2(cliTask, fullPool(), makeSkillPool(), { domainFromScope: true });
    expect(result.reasoning.some((r) => r.includes("Scope-domain (born-470): 'terminal-ui'"))).toBe(true);
    expect(result.reasoning.some((r) => r.includes('OpenRouter doc-route'))).toBe(false);
  });

  it('off/on — OpenRouter doc-route suggestion line present, no Scope-domain line', () => {
    const result = routeTaskV2(docTask, fullPool(), makeSkillPool(), {
      openRouterDocRoute: true,
      openRouterConfig: openRouterConfig(),
      openRouterCache: cacheWith(FREE_MODEL_ID),
    });
    expect(result.reasoning.some((r) => r.includes('Scope-domain'))).toBe(false);
    expect(
      result.reasoning.some((r) => r.includes(`OpenRouter doc-route suggestion: provider='openrouter', model='${FREE_MODEL_ID}'`)),
    ).toBe(true);
  });

  it('on/on — both lines present simultaneously, agentId matches the domainFromScope-only case', () => {
    const onOff = routeTaskV2(cliTask, fullPool(), makeSkillPool(), { domainFromScope: true });
    const onOn = routeTaskV2(cliTask, fullPool(), makeSkillPool(), {
      domainFromScope: true,
      openRouterDocRoute: true,
      openRouterConfig: openRouterConfig(),
      openRouterCache: cacheWith(FREE_MODEL_ID),
    });

    expect(onOn.agentId).toBe(onOff.agentId);
    expect(onOn.reasoning.some((r) => r.includes("Scope-domain (born-470): 'terminal-ui'"))).toBe(true);
    // cliTask has no `type` set and its scope is not docs/*.md-only -> not doc-kind -> no suggestion,
    // but the wire itself must still run and record that outcome (proves independence, not silence).
    expect(hasNoSuggestionLine(onOn.reasoning)).toBe(true);
  });
});

function hasNoSuggestionLine(reasoning: string[]): boolean {
  return reasoning.some((r) => r === 'OpenRouter doc-route: no suggestion (not doc-kind, or model not cache-validated)');
}

// ─── openRouterDocRoute: config/cache prerequisites ──────────────────────────

describe('DOMAIN-ROUTE-WIRE: openRouterDocRoute prerequisites', () => {
  it('flag on but config/cache omitted -> explicit "not supplied" line, never a silent no-op', () => {
    const result = routeTaskV2(docTask, fullPool(), makeSkillPool(), { openRouterDocRoute: true });
    expect(
      result.reasoning.some((r) => r.includes('OpenRouter doc-route: flag on but openRouterConfig/openRouterCache not supplied')),
    ).toBe(true);
  });

  it('flag on, non-doc-kind (code) task, valid config+cache -> "no suggestion" (ineligible, not overridden)', () => {
    const codeTask = { title: 'fix bug', description: 'fix', scope: scope(['src/dashboard/'], ['src/dashboard/App.tsx']) };
    const result = routeTaskV2(codeTask, fullPool(), makeSkillPool(), {
      openRouterDocRoute: true,
      openRouterConfig: openRouterConfig(),
      openRouterCache: cacheWith(FREE_MODEL_ID),
    });
    expect(hasNoSuggestionLine(result.reasoning)).toBe(true);
    expect(result.reasoning.some((r) => r.includes('skipped'))).toBe(false);
  });
});

// ─── ASLA-override guarantee: forceModel/provider never clobbered ───────────

describe('DOMAIN-ROUTE-WIRE: force-override is never clobbered (negative test)', () => {
  it('task.forceModel set -> skipped, resolver never consulted, no suggestion line', () => {
    const forcedTask = { ...docTask, forceModel: 'opus' };
    const result = routeTaskV2(forcedTask, fullPool(), makeSkillPool(), {
      openRouterDocRoute: true,
      openRouterConfig: openRouterConfig(),
      openRouterCache: cacheWith(FREE_MODEL_ID),
    });
    expect(result.reasoning.some((r) => r.includes("skipped — task already has forceModel='opus' (never overridden)"))).toBe(true);
    expect(result.reasoning.some((r) => r.includes('suggestion:'))).toBe(false);
  });

  it('task.provider set -> skipped, resolver never consulted, no suggestion line', () => {
    const forcedTask = { ...docTask, provider: 'codex' as const };
    const result = routeTaskV2(forcedTask, fullPool(), makeSkillPool(), {
      openRouterDocRoute: true,
      openRouterConfig: openRouterConfig(),
      openRouterCache: cacheWith(FREE_MODEL_ID),
    });
    expect(result.reasoning.some((r) => r.includes("skipped — task already has provider='codex' (never overridden)"))).toBe(true);
    expect(result.reasoning.some((r) => r.includes('suggestion:'))).toBe(false);
  });

  it('without forceModel/provider, the SAME doc-task legitimately gets a suggestion (control case)', () => {
    const result = routeTaskV2(docTask, fullPool(), makeSkillPool(), {
      openRouterDocRoute: true,
      openRouterConfig: openRouterConfig(),
      openRouterCache: cacheWith(FREE_MODEL_ID),
    });
    expect(result.reasoning.some((r) => r.includes('OpenRouter doc-route suggestion:'))).toBe(true);
  });
});

// ─── Flag-off byte-identical guarantee ───────────────────────────────────────

describe('DOMAIN-ROUTE-WIRE: flag-off is byte-identical', () => {
  it('omitted options === explicit false for both flags', () => {
    const resultOmitted = routeTaskV2(cliTask, fullPool(), makeSkillPool());
    const resultExplicitOff = routeTaskV2(cliTask, fullPool(), makeSkillPool(), {
      domainFromScope: false,
      openRouterDocRoute: false,
    });
    expect(resultOmitted.agentId).toBe(resultExplicitOff.agentId);
    expect(resultOmitted.agentScore).toBe(resultExplicitOff.agentScore);
    expect(resultOmitted.reasoning).toEqual(resultExplicitOff.reasoning);
  });
});
