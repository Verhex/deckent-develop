import { describe, it, expect } from 'vitest';
import {
  isSurfaceBuildTask,
  getDomainMatchBonus,
  DOMAIN_MATCH_BONUS,
  routeTaskV2,
} from '../../src/core/routing-engine.js';
import { classifyIntent } from '../../src/core/intent-classifier.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';

// ROUTE-1 — routing-v2 precision: path-proxy + surface bonus gated by operation/medium.

describe('ROUTE-1 B2 — isSurfaceBuildTask gate', () => {
  it('suppresses for refactor intent', () => {
    expect(isSurfaceBuildTask('refactor')).toBe(false);
  });
  it('suppresses for documentation intent', () => {
    expect(isSurfaceBuildTask('documentation')).toBe(false);
  });
  it('suppresses for audit / documentation TaskKind even on a build-ish intent', () => {
    expect(isSurfaceBuildTask('implementation', 'audit')).toBe(false);
    expect(isSurfaceBuildTask('implementation', 'documentation')).toBe(false);
  });
  it('allows genuine builds', () => {
    expect(isSurfaceBuildTask('implementation', 'code-development')).toBe(true);
    expect(isSurfaceBuildTask('design', 'design')).toBe(true);
    expect(isSurfaceBuildTask('implementation')).toBe(true);
  });
});

describe('ROUTE-1 B2 — getDomainMatchBonus path-proxy gating', () => {
  const apiTaskDNA = classifyIntent({
    title: 'clean stale comments',
    description: 'remove stale comments from the api module',
    scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/x.ts'] },
  });

  it('path-proxy bonus applies when allowed (default)', () => {
    // api-builder is the path-proxy owner for the extracted `api` domain.
    expect(apiTaskDNA.domains.some((d) => d.name.toLowerCase() === 'api')).toBe(true);
    expect(getDomainMatchBonus('api-builder', 'api', apiTaskDNA)).toBe(DOMAIN_MATCH_BONUS);
  });

  it('path-proxy bonus suppressed when allowPathProxy=false', () => {
    expect(getDomainMatchBonus('api-builder', 'api', apiTaskDNA, false)).toBe(0);
  });

  it('intent-driven domain bonus (path 1) is NOT suppressed by the gate', () => {
    const secDNA = classifyIntent({
      title: 'fix auth vulnerability',
      description: 'patch the jwt verification security hole',
      scope: { directories: ['src/auth/'], filesRead: [], filesWrite: ['src/auth/jwt.ts'] },
    });
    // security intent → security agent domain (INTENT_TO_AGENT_DOMAIN), path 1.
    expect(secDNA.intent.primary).toBe('security');
    expect(getDomainMatchBonus('security-auditor', 'security', secDNA, false)).toBe(DOMAIN_MATCH_BONUS);
  });
});

function makeAgent(id: string, overrides: Partial<AgentDefinition>): AgentDefinition {
  return { ...createAgentDefinition({ id, name: id }), ...overrides };
}
function makeAgentPool(...agents: AgentDefinition[]): AgentPool {
  return new Map(agents.map((a) => [a.id, a]));
}
const emptySkillPool = new Map<string, SkillDefinition>();

// Hermetic mirror of the relevant on-disk activation rules.
const refactorer = makeAgent('refactorer', {
  source: 'builtin',
  activation: { rules: [
    { when: { 'intent.primary': 'refactor' }, score: 10 },
    { when: { 'intent.primary': 'implementation' }, score: 7 },
  ], exclude: [], minScore: 5 },
});
const codeReviewer = makeAgent('code-reviewer', {
  source: 'builtin',
  activation: { rules: [{ when: { 'intent.primary': 'refactor' }, score: 8 }], exclude: [], minScore: 5 },
});
const apiBuilder = makeAgent('api-builder', {
  source: 'builtin',
  activation: { rules: [{ when: { domains: { $contains: 'api' } }, score: 8 }], exclude: [], minScore: 5 },
});
const pool = makeAgentPool(refactorer, codeReviewer, apiBuilder);

describe('ROUTE-1 B2/B3 — agent selection', () => {
  it('comment-sweep touching src/api/ → refactorer (NOT api-builder)', () => {
    const decision = routeTaskV2(
      { title: 'clean stale comments', description: 'remove stale comments from the api module',
        scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/x.ts'] },
        type: 'code-development' },
      pool, emptySkillPool,
    );
    expect(['refactorer', 'code-reviewer']).toContain(decision.agentId);
    expect(decision.agentId).not.toBe('api-builder');
  });

  it('LOSSLESS: genuine "build the /api/users endpoint" → api-builder', () => {
    const decision = routeTaskV2(
      { title: 'add POST /api/users endpoint', description: 'implement the create-user endpoint and validation',
        scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/users.ts'] },
        type: 'code-development' },
      pool, emptySkillPool,
    );
    expect(decision.agentId).toBe('api-builder');
  });

  it('B3: unknown-intent task adopts TaskKind SSOT intent', () => {
    const decision = routeTaskV2(
      { title: 'zzz', description: 'zzz',
        scope: { directories: [], filesRead: [], filesWrite: [] },
        type: 'refactor' },
      pool, emptySkillPool,
    );
    expect(decision.taskDNA.intent.primary).toBe('refactor');
  });
});

describe('ROUTE-1 B4 — skill selection', () => {
  function makeSkillPool(...defs: Array<Partial<SkillDefinition> & { id: string; name: string }>): Map<string, SkillDefinition> {
    const p = new Map<string, SkillDefinition>();
    for (const d of defs) { const s = createSkillDefinition(d); p.set(s.id, s); }
    return p;
  }

  const skillPool = makeSkillPool(
    { id: 'code-simplifier', name: 'Code Simplifier', category: 'workflow', triggers: ['refactor', 'cleanup', 'simplify'], priority: 8 },
    { id: 'typescript-expert', name: 'TypeScript Expert', category: 'language', triggers: ['typescript', 'ts', 'types'], priority: 10 },
    { id: 'api-builder', name: 'API Builder', category: 'workflow', triggers: ['api', 'endpoint', 'rest'], priority: 7 },
  );

  it('refactor comment-sweep → non-empty skills incl. code-simplifier', () => {
    const decision = routeTaskV2(
      { title: 'clean stale comments', description: 'remove stale comments from the api module',
        scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/x.ts'] },
        type: 'code-development' },
      pool, skillPool,
    );
    expect(decision.skillIds.length).toBeGreaterThan(0);
    expect(decision.skillIds).toContain('code-simplifier');
  });

  it('refactor task does NOT pull the api path-proxy skill', () => {
    const decision = routeTaskV2(
      { title: 'remove dead comments', description: 'delete dead comments in api',
        scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/x.ts'] },
        type: 'code-development' },
      pool, skillPool,
    );
    expect(decision.skillIds).not.toContain('api-builder');
  });

  it('build api task DOES include api-builder (positive-control: path-proxy allowed for builds)', () => {
    const decision = routeTaskV2(
      { title: 'implement new endpoint', description: 'implement a new rest api endpoint for users',
        scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/users.ts'] },
        type: 'code-development' },
      pool, skillPool,
    );
    expect(decision.skillIds).toContain('api-builder');
  });

  it('floor: a classified task never returns empty skills when a default exists', () => {
    const decision = routeTaskV2(
      { title: 'tidy comments', description: 'sweep stale comments',
        scope: { directories: ['src/x/'], filesRead: [], filesWrite: ['src/x/y.ts'] },
        type: 'refactor' },
      pool, makeSkillPool(
        { id: 'code-simplifier', name: 'Code Simplifier', category: 'workflow', triggers: ['xyzzy'], priority: 1 },
      ),
    );
    expect(decision.skillIds).toContain('code-simplifier');
  });
});

describe('ROUTE-1 — capstone: dual-perspective end-to-end', () => {
  // Local skill pool — mirrors B4 makeSkillPool but visible at capstone scope.
  function makeCapstoneSkillPool(...defs: Array<Partial<SkillDefinition> & { id: string; name: string }>): Map<string, SkillDefinition> {
    const p = new Map<string, SkillDefinition>();
    for (const d of defs) { const s = createSkillDefinition(d); p.set(s.id, s); }
    return p;
  }
  const skillPool = makeCapstoneSkillPool(
    { id: 'code-simplifier', name: 'Code Simplifier', category: 'workflow', triggers: ['refactor', 'cleanup', 'simplify'], priority: 8 },
    { id: 'typescript-expert', name: 'TypeScript Expert', category: 'language', triggers: ['typescript', 'ts', 'types'], priority: 10 },
    { id: 'api-builder', name: 'API Builder', category: 'workflow', triggers: ['api', 'endpoint', 'rest'], priority: 7 },
  );

  it('DOGFOOD: deckent comment-sweep → refactorer + code-simplifier, never api-builder/[]', () => {
    const d = routeTaskV2(
      { title: 'stale-comment sweep', description: 'clean stale and dead comments across modules',
        scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/x.ts'] },
        type: 'code-development' },
      pool, skillPool,
    );
    expect(d.agentId).not.toBe('api-builder');
    expect(['refactorer', 'code-reviewer']).toContain(d.agentId);
    expect(d.skillIds.length).toBeGreaterThan(0);
    expect(d.skillIds).toContain('code-simplifier');
  });

  it('PRODUCT: a user project refactor/cleanup sweep under src/api/ is not hijacked to api-builder', () => {
    // "cleanup" / "remove dead code" → refactor intent → buildTask=false → surface+path-proxy
    // bonuses suppressed → refactorer(10) > api-builder(8) → not api-builder.
    // (Justification: "remove obsolete jsdoc" classifies as documentation intent, where
    // no pool agent activates on documentation, so api-builder wins via domain rule — that
    // is NOT the B2 misroute class; the B2 gate only suppresses the BONUS, not base scores.)
    const d = routeTaskV2(
      { title: 'cleanup and remove dead code in api handlers', description: 'refactor and remove dead code from api module',
        scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/handlers.ts'] },
        type: 'code-development' },
      pool, skillPool,
    );
    expect(d.agentId).not.toBe('api-builder');
  });

  it('LOSSLESS PRODUCT: a user building their API still gets api-builder', () => {
    const d = routeTaskV2(
      { title: 'build the orders endpoint', description: 'implement POST /api/orders with validation',
        scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/orders.ts'] },
        type: 'code-development' },
      pool, skillPool,
    );
    expect(d.agentId).toBe('api-builder');
  });

  it('SAFETY-NET: pure documentation sweep under src/api/ → doc-writer, not api-builder (base-activation, not B2)', () => {
    // B2 suppresses path-proxy / surface BONUSES for documentation intent, but NOT
    // an agent's base activation rule. The real safety-net is doc-writer activating
    // on documentation intent at score 10 (> api-builder's domain rule at score 8).
    // This test pins that invariant so a future activation change can't silently
    // reopen the hole.
    const docPool = makeAgentPool(
      makeAgent('doc-writer', {
        source: 'builtin',
        activation: { rules: [{ when: { 'intent.primary': 'documentation' }, score: 10 }], exclude: [], minScore: 5 },
      }),
      makeAgent('api-builder', {
        source: 'builtin',
        activation: { rules: [{ when: { domains: { $contains: 'api' } }, score: 8 }], exclude: [], minScore: 5 },
      }),
    );
    const d = routeTaskV2(
      { title: 'update API documentation',
        description: 'write and update the api endpoint documentation guide',
        scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/x.ts'] },
        type: 'documentation' },
      docPool, emptySkillPool,
    );
    // Guard: task must classify as documentation for the test to exercise the intended path.
    expect(d.taskDNA.intent.primary).toBe('documentation');
    expect(d.agentId).toBe('doc-writer');
    expect(d.agentId).not.toBe('api-builder');
  });
});
