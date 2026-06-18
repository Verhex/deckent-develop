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
