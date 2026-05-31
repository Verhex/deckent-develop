import { describe, it, expect } from 'vitest';
import {
  INTENT_TO_SKILL_ID,
  TASK_DOMAIN_TO_SKILL_ID,
  SKILL_DOMAIN_BONUS,
} from '../../src/core/routing-engine.js';
import { classifyIntent } from '../../src/core/intent-classifier.js';

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
