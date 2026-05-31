import { describe, it, expect } from 'vitest';
import {
  routeTaskV2,
  getDomainMatchBonus,
  DOMAIN_MATCH_BONUS,
  INTENT_TO_AGENT_DOMAIN,
  TASK_DOMAIN_TO_AGENT_ID,
} from '../../src/core/routing-engine.js';
import { classifyIntent } from '../../src/core/intent-classifier.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';

// Sprint 209 — Task 209-002
// Multi-signal agent scoring: domain-match bonus diversifies routing so
// domain-specialized agents beat the generic refactorer impl@7 candidate
// when intent or path-extracted domains align. Refactorer/architect still
// win generic implementation tasks (no domain bonus).

function makeAgent(id: string, overrides: Partial<AgentDefinition>): AgentDefinition {
  const base = createAgentDefinition({ id, name: id });
  return { ...base, ...overrides };
}

function makePool(...agents: AgentDefinition[]): AgentPool {
  return new Map(agents.map((a) => [a.id, a]));
}

// Mirror on-disk activation rules so tests are hermetic.
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

const architect = makeAgent('architect', {
  source: 'builtin',
  activation: {
    rules: [
      { when: { 'intent.primary': 'design' }, score: 8 },
      { when: { 'intent.primary': 'implementation' }, score: 6 },
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

const securityAuditor = makeAgent('security-auditor', {
  source: 'builtin',
  activation: {
    rules: [
      { when: { 'intent.primary': 'security' }, score: 10 },
    ],
    exclude: [
      { when: { 'intent.primary': 'documentation' } },
    ],
    minScore: 5,
  },
});

const devopsEngineer = makeAgent('devops-engineer', {
  source: 'builtin',
  activation: {
    rules: [
      { when: { 'intent.primary': 'devops' }, score: 8 },
    ],
    exclude: [],
    minScore: 5,
  },
});

describe('routing — multi-signal domain-match bonus (Sprint 209 / 209-002)', () => {
  it('api task (src/api/) → api-builder wins over refactorer via domain bonus', () => {
    const decision = routeTaskV2(
      {
        title: '209-007 — Dashboard API endpoint canlı veri parite',
        description:
          'Dashboard endpoint canlı veriye bağla. Sprint durumu, worker, ' +
          'agent, memory, debt endpoint güncellemesi.',
        scope: {
          directories: ['src/api/'],
          filesRead: [],
          filesWrite: ['src/api/server.ts'],
        },
      },
      makePool(refactorer, architect, apiBuilder),
      new Map(),
    );

    expect(decision.agentId).toBe('api-builder');
    // api-builder: 8 (domain $contains api) + 3 (domain-match bonus) = 11
    // refactorer:  7 (impl) — no bonus
    expect(decision.agentScore).toBeGreaterThanOrEqual(8 + DOMAIN_MATCH_BONUS);
    expect(decision.reasoning.some(r => r.includes('domain-match bonus'))).toBe(true);
  });

  it('security task (src/security/) → security-auditor wins via intent→domain match', () => {
    const decision = routeTaskV2(
      {
        title: 'Add access-control helper',
        description: 'Build authorization checks for resource boundary',
        scope: {
          directories: ['src/security/'],
          filesRead: [],
          filesWrite: ['src/security/access-control.ts'],
        },
      },
      makePool(refactorer, architect, securityAuditor),
      new Map(),
    );

    expect(decision.taskDNA.intent.primary).toBe('security');
    expect(decision.agentId).toBe('security-auditor');
    // security-auditor: 10 (security intent) + 3 (domain bonus) = 13
    expect(decision.agentScore).toBeGreaterThanOrEqual(10 + DOMAIN_MATCH_BONUS);
  });

  it('devops task (docker/) → devops-engineer wins via intent→domain match', () => {
    const decision = routeTaskV2(
      {
        title: 'Add multi-stage Dockerfile for slim runtime',
        description: 'Trim production image size',
        scope: {
          directories: ['docker/'],
          filesRead: [],
          filesWrite: ['docker/Dockerfile'],
        },
      },
      makePool(refactorer, architect, devopsEngineer),
      new Map(),
    );

    expect(decision.taskDNA.intent.primary).toBe('devops');
    expect(decision.agentId).toBe('devops-engineer');
    expect(decision.agentScore).toBeGreaterThanOrEqual(8 + DOMAIN_MATCH_BONUS);
  });

  it('generic implementation (src/core/) → refactorer still wins (no domain bonus)', () => {
    const decision = routeTaskV2(
      {
        title: 'Add number formatter helper',
        description: 'Produce thousand-separated string for byte counts',
        scope: {
          directories: ['src/core/'],
          filesRead: [],
          filesWrite: ['src/core/number-format.ts'],
        },
      },
      makePool(refactorer, architect, apiBuilder, securityAuditor, devopsEngineer),
      new Map(),
    );

    expect(decision.taskDNA.intent.primary).toBe('implementation');
    expect(decision.agentId).toBe('refactorer');
    // No api/security/devops domain → no bonus applied to any non-generic agent.
    expect(decision.reasoning.some(r =>
      r.includes("Agent 'refactorer' domain-match bonus"),
    )).toBe(false);
  });

  it('getDomainMatchBonus: +3 for api-builder when task domains contain "api", 0 for unrelated', () => {
    const apiTaskDNA = classifyIntent({
      title: 'API server canlı veri',
      description: 'src/api/ endpoint güncellemesi',
      scope: {
        directories: ['src/api/'],
        filesRead: [],
        filesWrite: ['src/api/server.ts'],
      },
    });

    // Sanity: domain extraction picked up 'api'.
    expect(apiTaskDNA.domains.some(d => d.name === 'api')).toBe(true);

    expect(getDomainMatchBonus('api-builder', 'react', apiTaskDNA)).toBe(DOMAIN_MATCH_BONUS);
    // refactorer has system domain — no match path for api task.
    expect(getDomainMatchBonus('refactorer', 'system', apiTaskDNA)).toBe(0);
  });

  it('getDomainMatchBonus: +3 when intent === security AND agent domain === security', () => {
    const securityTaskDNA = classifyIntent({
      title: 'Lock down auth flow',
      description: 'Tighten security boundary on src/security/',
      scope: {
        directories: ['src/security/'],
        filesRead: [],
        filesWrite: ['src/security/lock.ts'],
      },
    });

    expect(securityTaskDNA.intent.primary).toBe('security');

    expect(getDomainMatchBonus('security-auditor', 'security', securityTaskDNA))
      .toBe(DOMAIN_MATCH_BONUS);
    expect(getDomainMatchBonus('refactorer', 'system', securityTaskDNA))
      .toBe(0);
  });

  it('intent→agent-domain map covers the diversification targets (security, devops, design, doc, data)', () => {
    // Regression guard: if any of these get dropped, the diversification
    // promise from Task 209-002 silently breaks.
    expect(INTENT_TO_AGENT_DOMAIN.security).toBe('security');
    expect(INTENT_TO_AGENT_DOMAIN.devops).toBe('devops');
    expect(INTENT_TO_AGENT_DOMAIN.design).toBe('react');
    expect(INTENT_TO_AGENT_DOMAIN.documentation).toBe('doc');
    expect(INTENT_TO_AGENT_DOMAIN.migration).toBe('data');

    // Implementation must NOT carry a domain bonus or every generic task
    // would once again funnel into a single agent — defeating the fix.
    expect(INTENT_TO_AGENT_DOMAIN.implementation).toBeUndefined();
    expect(INTENT_TO_AGENT_DOMAIN.refactor).toBeUndefined();

    // Path-extracted domain names cover the key user-project signals.
    expect(TASK_DOMAIN_TO_AGENT_ID.api).toBe('api-builder');
    expect(TASK_DOMAIN_TO_AGENT_ID.dashboard).toBe('frontend-designer');
    expect(TASK_DOMAIN_TO_AGENT_ID.db).toBe('data-engineer');
  });
});
