// AGSK-2 dilim-2 (sprint-361 task 361-012) — own load-test for the two new built-in agents
// (integration-engineer, terminal-ux-engineer). Deliberately NOT added as fixtures to
// tests/core/agent-role-signal.test.ts (goCriteria explicitly calls that out) — this file
// owns disk-verification for the new catalog entries: real fs reads (no fs mock, hermetic —
// .deckent/agents/ is git-tracked, present on any fresh checkout) plus a real
// AgentPoolManager.loadAgents() smoke against the actual project root.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AgentPoolManager, getAgentRole, getAgentDomain } from '../../../src/core/agent-pool.js';
import type { AgentDefinition } from '../../../src/core/agent-types.js';

const PROJECT_ROOT = resolve(__dirname, '../../..');
const BUILTINS_DIR = resolve(PROJECT_ROOT, 'src/core/builtins/agents');
const POOL_DIR = resolve(PROJECT_ROOT, '.deckent/agents');
const MAX_PROMPT_BYTES = 4096;

interface NewAgentSpec {
  id: string;
  name: string;
  expectedRole: 'implementer';
  expectedDomain: string;
  expectedDomainRuleValues: string[];
  promptKeyword: string;
}

const NEW_AGENTS: NewAgentSpec[] = [
  {
    id: 'integration-engineer',
    name: 'Integration Engineer',
    expectedRole: 'implementer',
    expectedDomain: 'messaging',
    expectedDomainRuleValues: ['connectors', 'messaging', 'integrations'],
    promptKeyword: 'Fail-Honest Propagation',
  },
  {
    id: 'terminal-ux-engineer',
    name: 'Terminal UX Engineer',
    expectedRole: 'implementer',
    expectedDomain: 'terminal-ui',
    expectedDomainRuleValues: ['terminal-ui', 'cli'],
    promptKeyword: 'Raw Mode',
  },
];

// Reference field set (api-builder, DISK-VERIFIED per task instruction) — every new agent
// must be a superset of this key set. New agents legitimately add `role`/`domain` on top.
function apiBuilderKeys(): string[] {
  const raw = JSON.parse(
    readFileSync(resolve(BUILTINS_DIR, 'api-builder/agent.json'), 'utf8'),
  ) as Record<string, unknown>;
  return Object.keys(raw).sort();
}

function readAgentJson(dir: string, id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(dir, id, 'agent.json'), 'utf8')) as Record<string, unknown>;
}

function readPrompt(dir: string, id: string): string {
  return readFileSync(resolve(dir, id, 'PROMPT.md'), 'utf8');
}

function domainContains(clause: Record<string, unknown> | undefined): string | undefined {
  const domains = clause?.['domains'] as { $contains?: string } | undefined;
  return domains?.$contains;
}

// $or-aware (sprint-396 rule-rewrite): a rule's `when` may carry a direct top-level
// `domains.$contains` (pre-396 shape) OR wrap alternatives in `when.$or[]`, each shaped
// like its own `{ domains: { $contains } }` clause (post-396 shape). Both shapes coexist
// live across src/core/builtins (pre-396) and .deckent (post-396) trees, so both must be read.
function collectDomainRuleValues(activation: unknown): string[] {
  const rules = (activation as { rules?: Array<{ when: Record<string, unknown> }> })?.rules ?? [];
  const values: string[] = [];
  for (const rule of rules) {
    const direct = domainContains(rule.when);
    if (direct) values.push(direct);
    const orClauses = rule.when['$or'] as Array<Record<string, unknown>> | undefined;
    for (const clause of orClauses ?? []) {
      const value = domainContains(clause);
      if (value) values.push(value);
    }
  }
  return values;
}

describe('AGSK-2 dilim-2: integration-engineer + terminal-ux-engineer catalog', () => {
  for (const dir of [BUILTINS_DIR, POOL_DIR]) {
    describe(`tree: ${dir === BUILTINS_DIR ? 'src/core/builtins/agents' : '.deckent/agents'}`, () => {
      for (const spec of NEW_AGENTS) {
        describe(spec.id, () => {
          it('has agent.json and PROMPT.md on disk', () => {
            expect(existsSync(resolve(dir, spec.id, 'agent.json'))).toBe(true);
            expect(existsSync(resolve(dir, spec.id, 'PROMPT.md'))).toBe(true);
          });

          it('agent.json passes AgentPoolManager.validateAgentDefinition', () => {
            const raw = readAgentJson(dir, spec.id);
            const result = AgentPoolManager.validateAgentDefinition(raw);
            expect(result.errors).toEqual([]);
            expect(result.valid).toBe(true);
          });

          it('has correct id/name/manifestVersion/source/enabled', () => {
            const raw = readAgentJson(dir, spec.id);
            expect(raw.id).toBe(spec.id);
            expect(raw.name).toBe(spec.name);
            expect(raw.manifestVersion).toBe(2);
            expect(raw.source).toBe('builtin');
            expect(raw.enabled).toBe(true);
          });

          it('has a zeroed stats object shaped like every other builtin', () => {
            const raw = readAgentJson(dir, spec.id) as unknown as AgentDefinition;
            if (dir === BUILTINS_DIR) {
              // Şablon-ağaç: yeni builtin SIFIR stats ile gemiye biner.
              expect(raw.stats).toEqual({
                totalUses: 0,
                successRate: 0,
                avgCoverage: 0,
                lastUsedInSprint: '',
              });
            } else {
              // Canlı havuz (.deckent): sprint-finalizer stats'ı tasarım gereği
              // mutasyonlar (born-605 stats-sidecar'a kadar) — şekil + invariant pinle.
              expect(Object.keys(raw.stats).sort()).toEqual(
                ['avgCoverage', 'lastUsedInSprint', 'successRate', 'totalUses'],
              );
              expect(raw.stats.totalUses).toBeGreaterThanOrEqual(0);
              expect(raw.stats.successRate).toBeGreaterThanOrEqual(0);
              expect(raw.stats.successRate).toBeLessThanOrEqual(1);
              expect(typeof raw.stats.lastUsedInSprint).toBe('string');
            }
          });

          it('is a superset of the api-builder (disk-verified reference) field set', () => {
            const raw = readAgentJson(dir, spec.id);
            const keys = new Set(Object.keys(raw));
            for (const refKey of apiBuilderKeys()) {
              expect(keys.has(refKey), `missing field '${refKey}' (api-builder parity)`).toBe(true);
            }
          });

          it('sets role=implementer, resolved live via getAgentRole (not a fixture)', () => {
            const raw = readAgentJson(dir, spec.id) as unknown as AgentDefinition;
            expect(raw.role).toBe(spec.expectedRole);
            expect(getAgentRole(raw)).toBe(spec.expectedRole);
          });

          it('sets domain, resolved live via getAgentDomain (not a fixture)', () => {
            const raw = readAgentJson(dir, spec.id) as unknown as AgentDefinition;
            expect(raw.domain).toBe(spec.expectedDomain);
            expect(getAgentDomain(raw)).toBe(spec.expectedDomain);
          });

          it('carries activation.rules whose domains.$contains values are routing-consistent', () => {
            const raw = readAgentJson(dir, spec.id);
            const values = collectDomainRuleValues(raw.activation);
            for (const expected of spec.expectedDomainRuleValues) {
              expect(values, `expected domains.$contains('${expected}')`).toContain(expected);
            }
            // Primary domain (agent.domain) must itself be one of the live activation values —
            // otherwise the declared domain would be routing-inert.
            expect(values).toContain(spec.expectedDomain);
          });

          it('PROMPT.md stays within the 4KB rubric cap and covers its rubric theme', () => {
            const content = readPrompt(dir, spec.id);
            const byteLength = Buffer.byteLength(content, 'utf8');
            expect(byteLength).toBeLessThanOrEqual(MAX_PROMPT_BYTES);
            expect(byteLength).toBeGreaterThan(100);
            expect(content).toContain(spec.promptKeyword);
            expect(content).toContain('getMessage');
          });
        });
      }

      it('has unique ids and names across the two new agents', () => {
        const ids = NEW_AGENTS.map((s) => readAgentJson(dir, s.id).id);
        const names = NEW_AGENTS.map((s) => readAgentJson(dir, s.id).name);
        expect(new Set(ids).size).toBe(NEW_AGENTS.length);
        expect(new Set(names).size).toBe(NEW_AGENTS.length);
      });
    });
  }

  it('agent-pool load-smoke: AgentPoolManager.loadAgents() picks up both new agents from the real .deckent/agents pool', () => {
    const manager = new AgentPoolManager(PROJECT_ROOT);
    const pool = manager.loadAgents();
    for (const spec of NEW_AGENTS) {
      const agent = pool.get(spec.id);
      expect(agent, `pool missing '${spec.id}'`).toBeDefined();
      expect(agent?.enabled).toBe(true);
      expect(agent?.source).toBe('builtin');
      expect(getAgentRole(agent as AgentDefinition)).toBe(spec.expectedRole);
      expect(getAgentDomain(agent as AgentDefinition)).toBe(spec.expectedDomain);
    }
  });

  it('no existing built-in agent claims the new agents domain names (zero routing collision)', () => {
    const existingIds = [
      'accessibility-auditor', 'api-builder', 'architect', 'architecture-planner', 'bug-fixer',
      'ci-guardian', 'code-reviewer', 'data-engineer', 'devops-engineer', 'doc-writer',
      'frontend-designer', 'migration-specialist', 'performance-analyzer', 'refactorer',
      'security-auditor',
    ];
    const claimed = new Set<string>();
    for (const id of existingIds) {
      const raw = readAgentJson(BUILTINS_DIR, id);
      for (const v of collectDomainRuleValues(raw.activation)) claimed.add(v);
    }
    expect(claimed.has('connectors')).toBe(false);
    expect(claimed.has('messaging')).toBe(false);
    expect(claimed.has('integrations')).toBe(false);
    expect(claimed.has('terminal-ui')).toBe(false);
  });
});
