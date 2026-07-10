// ─── Domain-Alias Resolution Tests (born-589) ──────────────────────────────
// detectDomains (intent-classifier.ts) emits path-SEGMENT names; a number of built-in
// agent/skill activation rules check `domains.$contains <word>` against a DIFFERENT
// vocabulary detectDomains can never emit (sprint-agent-skill-prompt-audit-2026-07-10.md
// §0/B/C). These tests verify: (1) `withAliasedDomains` expands+never mutates, (2) at
// least 3 of the report's dead rules — including sh-portability's `orchestration` — now
// fire via the alias, and (3) the alias never leaks into routeTaskV2's persisted taskDNA.

import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../../src/core/intent-classifier.js';
import { evaluateActivation } from '../../src/core/activation-engine.js';
import { routeTaskV2, withAliasedDomains, DOMAIN_ALIAS_GROUPS } from '../../src/core/routing-engine.js';
import { createDefaultTaskDNA } from '../../src/core/routing-types.js';
import type { ActivationConfig, TaskDNA } from '../../src/core/routing-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { TaskScope } from '../../src/core/task-types.js';

function scopeDNA(directories: string[], filesWrite: string[] = []): TaskDNA {
  return classifyIntent({
    title: 'scope probe',
    description: 'scope probe for domain extraction',
    scope: { directories, filesRead: [], filesWrite } as TaskScope,
  });
}

describe('domain-alias resolution (born-589)', () => {
  describe('DOMAIN_ALIAS_GROUPS export', () => {
    it('includes the orchestra/orchestration synonym pair (sh-portability)', () => {
      const hasGroup = DOMAIN_ALIAS_GROUPS.some(
        (group) => group.includes('orchestra') && group.includes('orchestration'),
      );
      expect(hasGroup).toBe(true);
    });
  });

  describe('withAliasedDomains', () => {
    it('expands a real segment with its alias siblings', () => {
      const dna = createDefaultTaskDNA();
      dna.domains = [{ name: 'orchestra', weight: 1 }];

      const expanded = withAliasedDomains(dna);
      const names = expanded.domains.map((d) => d.name);

      expect(names).toContain('orchestra');
      expect(names).toContain('orchestration');
    });

    it('never mutates the input taskDNA (scoring-only view)', () => {
      const dna = createDefaultTaskDNA();
      dna.domains = [{ name: 'dashboard', weight: 1 }];
      const originalDomains = dna.domains;

      const expanded = withAliasedDomains(dna);

      expect(dna.domains).toBe(originalDomains);
      expect(dna.domains).toEqual([{ name: 'dashboard', weight: 1 }]);
      expect(expanded).not.toBe(dna);
      expect(expanded.domains.map((d) => d.name)).toEqual(
        expect.arrayContaining(['dashboard', 'frontend', 'accessibility', 'css']),
      );
    });

    it('returns the same reference when no present domain has an alias (no-op fast path)', () => {
      const dna = createDefaultTaskDNA();
      dna.domains = [{ name: 'agents', weight: 1 }]; // real segment, not part of any alias group
      const expanded = withAliasedDomains(dna);
      expect(expanded).toBe(dna);
    });

    it('does not duplicate a sibling that is already present natively', () => {
      const dna = createDefaultTaskDNA();
      dna.domains = [
        { name: 'orchestra', weight: 1 },
        { name: 'orchestration', weight: 0.5 },
      ];
      const expanded = withAliasedDomains(dna);
      const orchestrationEntries = expanded.domains.filter((d) => d.name === 'orchestration');
      expect(orchestrationEntries).toHaveLength(1);
    });

    it('routeTaskV2 never leaks alias words into the persisted taskDNA output (nogo guard)', () => {
      const task = {
        title: 'Sprint controller shell helper',
        description: 'Add a POSIX-sh helper invoked from the sprint controller.',
        scope: {
          directories: ['src/orchestra/'],
          filesRead: [],
          filesWrite: ['src/orchestra/sh-helper.ts'],
        } as TaskScope,
      };

      const decision = routeTaskV2(task, new Map(), new Map());
      const names = decision.taskDNA.domains.map((d) => d.name);

      expect(names).toContain('orchestra');
      expect(names).not.toContain('orchestration');
    });
  });

  // Real `activation` configs copied verbatim from the corresponding .deckent manifest —
  // proves THIS project's actual dead rules revive, not a synthetic stand-in.
  describe('fixture: report-dead rules fire via alias (>= 3, incl. sh-portability)', () => {
    it('sh-portability: domains.$contains "orchestration" fires for a src/orchestra/ scope', () => {
      const shPortabilityActivation: ActivationConfig = {
        rules: [{ when: { domains: { $contains: 'orchestration' } }, score: 10 }],
        exclude: [],
        minScore: 5,
      };
      const dna = scopeDNA(['src/orchestra/'], ['src/orchestra/sprint-controller.ts']);

      const before = evaluateActivation(dna, shPortabilityActivation);
      expect(before.score).toBe(0);

      const after = evaluateActivation(withAliasedDomains(dna), shPortabilityActivation);
      expect(after.score).toBe(10);
      expect(after.excluded).toBe(false);
    });

    it('frontend-designer: domains.$contains "frontend" fires for a src/dashboard/ scope', () => {
      const frontendDesignerActivation: ActivationConfig = {
        rules: [{ when: { domains: { $contains: 'frontend' } }, score: 8 }],
        exclude: [],
        minScore: 5,
      };
      const dna = scopeDNA(['src/dashboard/'], ['src/dashboard/SprintControl.tsx']);

      const before = evaluateActivation(dna, frontendDesignerActivation);
      expect(before.score).toBe(0);

      const after = evaluateActivation(withAliasedDomains(dna), frontendDesignerActivation);
      expect(after.score).toBe(8);
    });

    it('accessibility-auditor: domains.$contains "accessibility" fires for a src/dashboard/ scope', () => {
      const accessibilityAuditorActivation: ActivationConfig = {
        rules: [{ when: { domains: { $contains: 'accessibility' } }, score: 10 }],
        exclude: [],
        minScore: 5,
      };
      const dna = scopeDNA(['src/dashboard/'], ['src/dashboard/Panel.tsx']);

      const before = evaluateActivation(dna, accessibilityAuditorActivation);
      expect(before.score).toBe(0);

      const after = evaluateActivation(withAliasedDomains(dna), accessibilityAuditorActivation);
      expect(after.score).toBe(10);
    });

    it('rpc-protocol: domains.$contains "rpc" fires for a src/mcp/ scope', () => {
      const rpcProtocolActivation: ActivationConfig = {
        rules: [{ when: { domains: { $contains: 'rpc' } }, score: 10 }],
        exclude: [],
        minScore: 5,
      };
      const dna = scopeDNA(['src/mcp/'], ['src/mcp/tools/watch.ts']);

      const before = evaluateActivation(dna, rpcProtocolActivation);
      expect(before.score).toBe(0);

      const after = evaluateActivation(withAliasedDomains(dna), rpcProtocolActivation);
      expect(after.score).toBe(10);
    });

    it('devops-engineer: domains.$contains "infrastructure" fires for a tests/docker/ scope', () => {
      const devopsEngineerActivation: ActivationConfig = {
        rules: [{ when: { domains: { $contains: 'infrastructure' } }, score: 8 }],
        exclude: [],
        minScore: 5,
      };
      const dna = scopeDNA(['tests/docker/'], ['tests/docker/compose.test.ts']);

      const before = evaluateActivation(dna, devopsEngineerActivation);
      expect(before.score).toBe(0);

      const after = evaluateActivation(withAliasedDomains(dna), devopsEngineerActivation);
      expect(after.score).toBe(8);
    });
  });

  describe('end-to-end via routeTaskV2 — real single-skill pool', () => {
    it('an sh-portability-shaped skill is actually selected for a src/orchestra/ task', () => {
      const skill = createSkillDefinition({
        id: 'sh-portability',
        name: 'sh-portability',
        category: 'tool',
        activation: {
          rules: [{ when: { domains: { $contains: 'orchestration' } }, score: 10 }],
          exclude: [],
          minScore: 5,
        },
      });
      const task = {
        title: 'Sprint controller shell helper',
        description: 'Add a POSIX-sh helper invoked from the sprint controller.',
        scope: {
          directories: ['src/orchestra/'],
          filesRead: [],
          filesWrite: ['src/orchestra/sh-helper.ts'],
        } as TaskScope,
      };

      const decision = routeTaskV2(task, new Map(), new Map([['sh-portability', skill]]));
      expect(decision.skillIds).toContain('sh-portability');
    });
  });
});
