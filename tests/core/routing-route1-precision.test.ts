import { describe, it, expect } from 'vitest';
import {
  isSurfaceBuildTask,
  getDomainMatchBonus,
  DOMAIN_MATCH_BONUS,
} from '../../src/core/routing-engine.js';
import { classifyIntent } from '../../src/core/intent-classifier.js';

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
