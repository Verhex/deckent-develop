import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../../src/core/intent-classifier.js';

// Sprint 209 — Task 209-001
// Regression suite for intent-classifier scope-based diversification.
// Verifies that domain/scope signals are strong enough to override the
// generic "implementation" default boost so refactorer no longer wins
// every routing decision (Sprint 208 imbalance).

describe('intent-classifier — scope diversification (Sprint 209)', () => {
  it('api scope → routes through api domain (not refactor)', () => {
    const dna = classifyIntent({
      title: '209-006 — API auth disabled-flag bağımlılığı kaldır',
      description: 'Auth akışını düzelt — localhost caller token auto-inject',
      scope: {
        directories: ['src/api/', 'tests/api/'],
        filesRead: [],
        filesWrite: ['src/api/auth.ts', 'tests/api/auth-no-disable-flag.test.ts'],
      },
    });

    // api-builder activates via domains.$contains('api') — domain detection
    // is the routing signal for API tasks (there is no 'api' IntentType).
    expect(dna.domains.some(d => d.name === 'api')).toBe(true);
    expect(dna.intent.primary).not.toBe('refactor');
  });

  it('security scope (src/security/) → intent.primary === "security"', () => {
    const dna = classifyIntent({
      title: 'Build access-control helper',
      description: 'Add allow/deny logic for resource access',
      scope: {
        directories: ['src/security/'],
        filesRead: [],
        filesWrite: ['src/security/access-control.ts'],
      },
    });

    expect(dna.intent.primary).toBe('security');
  });

  it('dashboard scope → intent.primary === "design"', () => {
    const dna = classifyIntent({
      title: 'Add live worker widget to dashboard',
      description: 'Render the running-worker list panel',
      scope: {
        directories: ['src/dashboard/'],
        filesRead: [],
        filesWrite: ['src/dashboard/worker-widget.tsx'],
      },
    });

    expect(dna.intent.primary).toBe('design');
  });

  it('db scope → db domain surfaces (data-engineer routing signal)', () => {
    const dna = classifyIntent({
      title: 'Add migrations table to persistence layer',
      description: 'Persist sprint state rows for resume capability',
      scope: {
        directories: ['src/db/'],
        filesRead: [],
        filesWrite: ['src/db/migrations-table.ts'],
      },
    });

    // Domain detection routes to data-engineer; intent itself does not need
    // to be 'data' (no such IntentType), but the result must not collapse to
    // a generic refactor.
    expect(dna.domains.some(d => d.name === 'db')).toBe(true);
    expect(dna.intent.primary).not.toBe('refactor');
  });

  it('generic core utility scope → intent.primary === "implementation"', () => {
    const dna = classifyIntent({
      title: 'Add tiny number formatter helper',
      description: 'Produce thousand-separated string for byte counts',
      scope: {
        directories: ['src/core/'],
        filesRead: [],
        filesWrite: ['src/core/number-format.ts'],
      },
    });

    // No domain-specific signal → falls through to the implementation default.
    expect(dna.intent.primary).toBe('implementation');
  });

  it('docker scope (Dockerfile path) → intent.primary === "devops"', () => {
    const dna = classifyIntent({
      title: 'Add multi-stage Dockerfile',
      description: 'Slim down runtime image',
      scope: {
        directories: ['docker/'],
        filesRead: [],
        filesWrite: ['docker/Dockerfile', 'docker/compose.yml'],
      },
    });

    expect(dna.intent.primary).toBe('devops');
  });
});
