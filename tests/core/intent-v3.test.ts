// ─── Intent Classifier V3 — Sub-Intent Tests ─────────────────────────────────
// Sprint 148 Task 21: Routing V3 core-dev sub-intents + routingVersion

import { describe, it, expect } from 'vitest';
import { classifyIntent, detectSubIntent } from '../../src/core/intent-classifier.js';
import { routeTaskV2 } from '../../src/core/routing-engine.js';
import type { TaskScope } from '../../src/core/task-types.js';

function makeScope(overrides: Partial<TaskScope> = {}): TaskScope {
  return {
    directories: [],
    filesRead: [],
    filesWrite: [],
    ...overrides,
  };
}

describe('Intent Classifier V3 — Sub-Intents', () => {
  it('Task types/... → subIntent="types"', () => {
    const result = classifyIntent({
      title: 'Extend routing types',
      description: 'Add SubIntentType to routing-types.ts',
      scope: makeScope({
        directories: ['src/core/'],
        filesWrite: ['src/core/routing-types.ts'],
      }),
    });

    expect(result.subIntent).toBe('types');
  });

  it('Task config/... → subIntent="config"', () => {
    const result = classifyIntent({
      title: 'Update config defaults',
      description: 'Add nervous_system config defaults to config-defaults.ts',
      scope: makeScope({
        directories: ['src/core/'],
        filesWrite: ['src/core/config-defaults.ts', 'src/core/config.ts'],
      }),
    });

    expect(result.subIntent).toBe('config');
  });

  it('Task routing/router → subIntent="routing"', () => {
    const result = classifyIntent({
      title: 'Router V3 refinement',
      description: 'Refine routing engine for V3 sub-intent support',
      scope: makeScope({
        directories: ['src/core/'],
        filesWrite: ['src/core/routing-engine.ts'],
      }),
    });

    expect(result.subIntent).toBe('routing');
  });

  it('Task observer → subIntent="observer"', () => {
    const result = classifyIntent({
      title: 'Wire nervous observer',
      description: 'Enable nervous system observer integration',
      scope: makeScope({
        directories: ['src/nervous/'],
        filesWrite: ['src/nervous/observer.ts'],
      }),
    });

    expect(result.subIntent).toBe('observer');
  });

  it('routingMeta.routingVersion === "v2" (ROUTING-VERSION-LABEL reconcile)', () => {
    // Create minimal agent pool and skill pool
    const agentPool = new Map();
    agentPool.set('architect', {
      id: 'architect',
      name: 'Architect',
      enabled: true,
      triggerKeywords: ['architecture', 'design'],
      triggerScopes: ['src/'],
      triggerFilePatterns: [],
      priority: 5,
      totalUses: 0,
      successRate: 0,
    });

    const skillPool = new Map();

    const result = routeTaskV2(
      {
        title: 'Add types',
        description: 'Add new type definitions',
        scope: makeScope({
          directories: ['src/core/'],
          filesWrite: ['src/core/routing-types.ts'],
        }),
      },
      agentPool,
      skillPool,
    );

    expect(result.routingVersion).toBe('v2');
  });

  it('Backward compat — v2 tasks still parseable (subIntent is optional)', () => {
    // Tasks that don't match any sub-intent signal should return undefined
    const result = classifyIntent({
      title: 'Update CHANGELOG',
      description: 'Write changelog for sprint 148',
      scope: makeScope({
        directories: ['docs/'],
        filesWrite: ['CHANGELOG.md'],
      }),
    });

    // Documentation task — subIntent should be undefined (not core-dev)
    expect(result.subIntent).toBeUndefined();
    // Primary intent should still work correctly
    expect(result.intent.primary).toBe('documentation');
  });
});

describe('detectSubIntent — edge cases', () => {
  it('non-implementation task → undefined', () => {
    const result = detectSubIntent(
      'fix security vulnerability',
      makeScope({ directories: ['src/core/'], filesWrite: ['src/core/auth.ts'] }),
      'security',
    );
    expect(result).toBeUndefined();
  });

  it('registry keyword → subIntent="registry"', () => {
    const result = detectSubIntent(
      'implement model registry for providers',
      makeScope({ directories: ['src/core/'], filesWrite: ['src/core/model-registry.ts'] }),
      'implementation',
    );
    expect(result).toBe('registry');
  });

  it('dispatcher keyword → subIntent="dispatcher"', () => {
    const result = detectSubIntent(
      'notification dispatcher implementation',
      makeScope({ directories: ['src/core/'], filesWrite: ['src/core/notification-dispatcher.ts'] }),
      'implementation',
    );
    expect(result).toBe('dispatcher');
  });
});
