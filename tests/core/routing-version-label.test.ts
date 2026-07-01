// ROUTING-VERSION-LABEL (sprint-352-013, ADR-G-006 P2) — routeTaskV2 used to
// return `routingVersion: 'v3'` while sprint-planner.ts stamped tasks with
// `routingVersion: 'v2'`. There is no V3 engine — today's engine is V2 — so
// both the RoutingDecision return and the task.routingMeta stamp must read
// 'v2'. This test guards the reconcile so the label cannot silently drift
// back to 'v3' (or diverge again) without a test failure.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { routeTaskV2 } from '../../src/core/routing-engine.js';
import type { AgentPool } from '../../src/core/agent-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import type { TaskScope } from '../../src/core/task-types.js';

const projectRoot = resolve(import.meta.dirname, '..', '..');

function makeScope(overrides: Partial<TaskScope> = {}): TaskScope {
  return {
    directories: [],
    filesRead: [],
    filesWrite: [],
    ...overrides,
  };
}

function makePool(): AgentPool {
  return new Map();
}

function makeSkillPool(): Map<string, SkillDefinition> {
  return new Map();
}

// ─── Return side: routeTaskV2's RoutingDecision.routingVersion ─────────────

describe('ROUTING-VERSION-LABEL: routeTaskV2 return value', () => {
  it('returns routingVersion "v2" for a typical implementation task', () => {
    const result = routeTaskV2(
      {
        title: 'Add types',
        description: 'Add new type definitions',
        scope: makeScope({
          directories: ['src/core/'],
          filesWrite: ['src/core/routing-types.ts'],
        }),
      },
      makePool(),
      makeSkillPool(),
    );

    expect(result.routingVersion).toBe('v2');
    expect(result.routingVersion).not.toBe('v3');
  });

  it('returns routingVersion "v2" regardless of task intent/domain', () => {
    const scopes = [
      { directories: ['src/orchestra/'], filesWrite: ['src/orchestra/sprint-planner.ts'] },
      { directories: ['docs/'], filesWrite: ['CHANGELOG.md'] },
      { directories: ['tests/core/'], filesWrite: ['tests/core/foo.test.ts'] },
    ];

    for (const scope of scopes) {
      const result = routeTaskV2(
        { title: 'Task', description: 'desc', scope: makeScope(scope) },
        makePool(),
        makeSkillPool(),
      );
      expect(result.routingVersion).toBe('v2');
    }
  });
});

// ─── Stamp side: sprint-planner.ts task.routingMeta.routingVersion ────────
//
// planSprint() is a full-sprint integration surface (temp-agent generation,
// outcome-tracker/learnings loading, decision-trail logging) that is out of
// proportion to exercise end-to-end here. Instead this asserts the actual
// stamp literal shipped in the source, mirroring the project's existing
// source-scan convention (tests/scripts/zero-hardcode-audit.test.ts) — a
// faithful regression guard against the stamp drifting off 'v2' without
// requiring a planSprint harness.

describe('ROUTING-VERSION-LABEL: sprint-planner.ts routingMeta stamp', () => {
  it('stamps task.routingMeta.routingVersion as the literal "v2"', () => {
    const source = readFileSync(resolve(projectRoot, 'src/orchestra/sprint-planner.ts'), 'utf-8');
    expect(source).toContain("routingVersion: 'v2'");
    expect(source).not.toContain("routingVersion: 'v3'");
  });
});

// ─── Consistency: return + stamp agree ──────────────────────────────────────

describe('ROUTING-VERSION-LABEL: return and stamp are reconciled', () => {
  it('routeTaskV2 return matches the sprint-planner stamp literal', () => {
    const result = routeTaskV2(
      { title: 'Task', description: 'desc', scope: makeScope() },
      makePool(),
      makeSkillPool(),
    );
    const source = readFileSync(resolve(projectRoot, 'src/orchestra/sprint-planner.ts'), 'utf-8');
    const stampMatch = /routingVersion:\s*'(v2|v3)'/.exec(source);

    expect(stampMatch).not.toBeNull();
    expect(result.routingVersion).toBe(stampMatch?.[1]);
  });
});
