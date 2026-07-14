import { describe, it, expect } from 'vitest';
import {
  INTENT_TO_SKILL_ID,
  TASK_DOMAIN_TO_SKILL_ID,
  SKILL_DOMAIN_BONUS,
  routeTaskV2,
} from '../../src/core/routing-engine.js';
import { classifyIntent } from '../../src/core/intent-classifier.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTask(opts: {
  title?: string;
  description?: string;
  directories?: string[];
  filesWrite?: string[];
}) {
  return {
    title: opts.title ?? 'task',
    description: opts.description ?? '',
    scope: {
      directories: opts.directories ?? [],
      filesWrite: opts.filesWrite ?? [],
      filesRead: [],
    },
  };
}

// Minimal SkillDefinition stub for scoring tests
function makeSkillDef(id: string) {
  return {
    id,
    enabled: true,
    category: 'domain' as const,
    triggers: [],
    priority: 5,
    stackDetection: { language: '', framework: '', dependencies: [] },
    activation: { rules: [] },
  };
}

// ─── Map completeness ─────────────────────────────────────────────────────────

describe('INTENT_TO_SKILL_ID map', () => {
  it('maps security intent to security-specialist', () => {
    expect(INTENT_TO_SKILL_ID['security']).toBe('security-specialist');
  });

  it('maps devops intent to devops-engineer', () => {
    expect(INTENT_TO_SKILL_ID['devops']).toBe('devops-engineer');
  });

  it('maps design intent to react-specialist', () => {
    expect(INTENT_TO_SKILL_ID['design']).toBe('react-specialist');
  });

  it('does not map implementation (generic tasks keep typescript-expert default)', () => {
    expect(INTENT_TO_SKILL_ID['implementation']).toBeUndefined();
  });

  it('maps migration intent to database-migration', () => {
    expect(INTENT_TO_SKILL_ID['migration']).toBe('database-migration');
  });

  it('maps performance intent to performance-optimizer', () => {
    expect(INTENT_TO_SKILL_ID['performance']).toBe('performance-optimizer');
  });
});

// ─── Domain-to-skill map ──────────────────────────────────────────────────────

describe('TASK_DOMAIN_TO_SKILL_ID map', () => {
  it('maps api domain to api-builder', () => {
    expect(TASK_DOMAIN_TO_SKILL_ID['api']).toBe('api-builder');
  });

  it('maps auth domain to security-specialist', () => {
    expect(TASK_DOMAIN_TO_SKILL_ID['auth']).toBe('security-specialist');
  });

  it('maps dashboard domain to react-specialist', () => {
    expect(TASK_DOMAIN_TO_SKILL_ID['dashboard']).toBe('react-specialist');
  });

  it('maps db domain to database-migration', () => {
    expect(TASK_DOMAIN_TO_SKILL_ID['db']).toBe('database-migration');
  });

  it('maps docker domain to docker-expert', () => {
    expect(TASK_DOMAIN_TO_SKILL_ID['docker']).toBe('docker-expert');
  });

  it('maps kubernetes domain to docker-expert', () => {
    expect(TASK_DOMAIN_TO_SKILL_ID['kubernetes']).toBe('docker-expert');
  });
});

// ─── SKILL_DOMAIN_BONUS value ─────────────────────────────────────────────────

describe('SKILL_DOMAIN_BONUS', () => {
  it('is 3 — matching DOMAIN_MATCH_BONUS magnitude for agents', () => {
    expect(SKILL_DOMAIN_BONUS).toBe(3);
  });
});

// ─── Intent classification → skill bonus integration ──────────────────────────

describe('classifyIntent → domain signals for skill routing', () => {
  it('api scope task gets api domain in TaskDNA (triggers api-builder skill bonus)', () => {
    const task = makeTask({
      title: 'add api endpoint',
      description: 'implement REST endpoint for users',
      filesWrite: ['src/api/users.ts', 'tests/api/users.test.ts'],
      directories: ['src/api/', 'tests/api/'],
    });
    const dna = classifyIntent(task);
    const apiDomain = dna.domains.find(d => d.name === 'api');
    expect(apiDomain).toBeDefined();
    // api domain → TASK_DOMAIN_TO_SKILL_ID['api'] = 'api-builder' gets bonus
    expect(TASK_DOMAIN_TO_SKILL_ID[apiDomain!.name]).toBe('api-builder');
  });

  it('security scope task gets security intent → security-specialist gets intent bonus', () => {
    const task = makeTask({
      title: 'fix auth vulnerability',
      description: 'security patch for JWT validation',
      filesWrite: ['src/auth/jwt.ts'],
      directories: ['src/auth/'],
    });
    const dna = classifyIntent(task);
    // Should classify as security intent or have auth domain
    const hasSecuritySignal =
      dna.intent.primary === 'security' ||
      dna.domains.some(d => d.name === 'auth' || d.name === 'security');
    expect(hasSecuritySignal).toBe(true);
  });

  it('frontend/dashboard scope task gets design intent → react-specialist gets intent bonus', () => {
    const task = makeTask({
      title: 'add dashboard component',
      description: 'create new UI component for the dashboard',
      filesWrite: ['src/dashboard/Widget.tsx', 'src/components/Button.tsx'],
      directories: ['src/dashboard/', 'src/components/'],
    });
    const dna = classifyIntent(task);
    const hasFrontendSignal =
      dna.intent.primary === 'design' ||
      dna.domains.some(d => ['dashboard', 'components', 'frontend', 'ui'].includes(d.name));
    expect(hasFrontendSignal).toBe(true);
  });

  it('generic implementation task does NOT have api/security/design domains', () => {
    const task = makeTask({
      title: 'refactor core module',
      description: 'clean up core utility functions',
      filesWrite: ['src/core/utils.ts'],
      directories: ['src/core/'],
    });
    const dna = classifyIntent(task);
    const domainNames = dna.domains.map(d => d.name);
    const hasDomainSpecific = domainNames.some(n =>
      ['api', 'auth', 'dashboard', 'components', 'security'].includes(n),
    );
    expect(hasDomainSpecific).toBe(false);
  });

  it('docker/devops scope task gets devops domain → docker-expert skill bonus', () => {
    const task = makeTask({
      title: 'update docker config',
      description: 'improve Dockerfile and docker-compose setup',
      filesWrite: ['docker/Dockerfile', 'docker/compose.yml'],
      directories: ['docker/'],
    });
    const dna = classifyIntent(task);
    const hasDevopsSignal =
      dna.intent.primary === 'devops' ||
      dna.domains.some(d => d.name === 'docker');
    expect(hasDevopsSignal).toBe(true);
    if (dna.domains.some(d => d.name === 'docker')) {
      expect(TASK_DOMAIN_TO_SKILL_ID['docker']).toBe('docker-expert');
    }
  });
});

// ─── skill-floor removed — the intent/domain maps are now the SOLE selection path ──
// sprint-441, task 441-002. The ROUTE-1 B4 skill-floor (a never-empty fallback that
// injected a principled default, else the best sub-threshold candidate) was removed
// because it caused RELEVANCE INVERSION — sh-portability into 10/31 prompts,
// file-watch-hygiene into 6/31 on the 430-438 corpus. The intent/domain→skill maps
// exercised above are now the ONLY way a skill that lacks a matching activation rule
// reaches the threshold; when even that map has no entry in the pool, selection is
// honestly EMPTY instead of a forced irrelevant skill. These two tests pin both sides.
describe('skill-floor removed — map path lives, no-map path is honest-empty (sprint-441)', () => {
  function poolOf(...skills: SkillDefinition[]): Map<string, SkillDefinition> {
    return new Map(skills.map(s => [s.id, s]));
  }

  it('POSITIVE CONTROL: refactor task with code-simplifier in pool → mapped skill selected', () => {
    // INTENT_TO_SKILL_ID.refactor = code-simplifier → +SKILL_DOMAIN_BONUS lifts it to
    // the threshold even with no activation rule. The map path is intact post-removal.
    const decision = routeTaskV2(
      {
        title: 'refactor the module',
        description: 'refactor and restructure the module for clarity',
        scope: { directories: ['src/x/'], filesRead: [], filesWrite: ['src/x/y.ts'] },
        type: 'refactor',
      },
      new Map(),
      poolOf(createSkillDefinition({ id: 'code-simplifier', name: 'Code Simplifier', category: 'workflow', triggers: ['refactor'] })),
    );
    expect(INTENT_TO_SKILL_ID['refactor']).toBe('code-simplifier');
    expect(decision.skillIds).toContain('code-simplifier');
  });

  it('HONEST-EMPTY: classified task whose mapped skill is absent + nothing clears threshold → []', () => {
    // Pool holds only graphql-expert (activation needs a graphql domain — absent → 0)
    // and NOT code-simplifier, so no candidate clears the threshold. The removed floor
    // would have injected the refactor principled default (code-simplifier); now → [].
    const decision = routeTaskV2(
      {
        title: 'refactor the module',
        description: 'refactor and restructure the module for clarity',
        scope: { directories: ['src/x/'], filesRead: [], filesWrite: ['src/x/y.ts'] },
        type: 'refactor',
      },
      new Map(),
      poolOf(createSkillDefinition({
        id: 'graphql-expert', name: 'GraphQL Expert', category: 'workflow', triggers: ['graphql'],
        activation: { rules: [{ when: { 'domains': { $contains: 'graphql' } }, score: 10 }], exclude: [], minScore: 5 },
      })),
    );
    expect(decision.taskDNA.intent.primary).toBe('refactor'); // guard: classified, not 'unknown'
    expect(decision.skillIds).toEqual([]);
  });
});
