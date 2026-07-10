// AGSK-3 dilim-3 (sprint-363 task 363-010) — own load-test for the two new built-in skills
// (rpc-protocol, onboarding-ux). Deliberately NOT added as fixtures to
// tests/core/skill-pool.test.ts or tests/core/skill-pool-stats.test.ts (those files mock
// node:fs) — this file owns disk-verification for the new catalog entries: real fs reads (no
// fs mock, hermetic — both .deckent/skills/ and src/core/builtins/skills/ are git-tracked,
// present on any fresh checkout) plus a real SkillPoolManager.loadSkills() smoke against the
// actual project root. Mirrors tests/core/builtins/agent-catalog-agsk2.test.ts's structure,
// adapted from agent.json/PROMPT.md to manifest.json/SKILL.md.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SkillPoolManager } from '../../../src/core/skill-pool.js';
import type { SkillDefinition } from '../../../src/core/skill-types.js';

const PROJECT_ROOT = resolve(__dirname, '../../..');
const BUILTINS_DIR = resolve(PROJECT_ROOT, 'src/core/builtins/skills');
const POOL_DIR = resolve(PROJECT_ROOT, '.deckent/skills');
const MAX_SKILL_MD_BYTES = 4096;

interface NewSkillSpec {
  id: string;
  name: string;
  expectedCategory: 'domain' | 'workflow';
  /** Dead-word domain rules were rewritten to real signals in sprint-396 (born-601):
   * onboarding-ux now carries an intent-rule, not a domains rule — expectedDomain
   * became expectedRule with both shapes supported. */
  expectedRule: { kind: 'domain'; value: string } | { kind: 'intent'; value: string };
  skillMdKeyword: string;
}

const NEW_SKILLS: NewSkillSpec[] = [
  {
    id: 'rpc-protocol',
    name: 'RPC Protocol',
    expectedCategory: 'domain',
    expectedRule: { kind: 'domain', value: 'rpc' },
    skillMdKeyword: 'Dual-Consumer Testing',
  },
  {
    id: 'onboarding-ux',
    name: 'Onboarding UX',
    expectedCategory: 'workflow',
    // sprint-396 born-601: 'onboarding' ölü-domain kuralı intent.primary='config'
    // dar-sinyaline çevrildi ('cli'ye alias her CLI-task'ta ateşlerdi — lint-gerekçesi).
    expectedRule: { kind: 'intent', value: 'config' },
    skillMdKeyword: 'Degrade-Safe Teasers',
  },
];

// Reference field set (api-builder, DISK-VERIFIED per task instruction) — every new skill
// must be a superset of this key set.
function apiBuilderKeys(): string[] {
  const raw = JSON.parse(
    readFileSync(resolve(BUILTINS_DIR, 'api-builder/manifest.json'), 'utf8'),
  ) as Record<string, unknown>;
  return Object.keys(raw).sort();
}

function readManifest(dir: string, id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(dir, id, 'manifest.json'), 'utf8')) as Record<string, unknown>;
}

function readSkillMd(dir: string, id: string): string {
  return readFileSync(resolve(dir, id, 'SKILL.md'), 'utf8');
}

function collectDomainRuleValues(activation: unknown): string[] {
  const rules = (activation as { rules?: Array<{ when: Record<string, unknown> }> })?.rules ?? [];
  const values: string[] = [];
  for (const rule of rules) {
    const domains = rule.when['domains'] as { $contains?: string } | undefined;
    if (domains?.$contains) values.push(domains.$contains);
  }
  return values;
}

describe('AGSK-3 dilim-3: rpc-protocol + onboarding-ux catalog', () => {
  for (const dir of [BUILTINS_DIR, POOL_DIR]) {
    describe(`tree: ${dir === BUILTINS_DIR ? 'src/core/builtins/skills' : '.deckent/skills'}`, () => {
      for (const spec of NEW_SKILLS) {
        describe(spec.id, () => {
          it('has manifest.json and SKILL.md on disk', () => {
            expect(existsSync(resolve(dir, spec.id, 'manifest.json'))).toBe(true);
            expect(existsSync(resolve(dir, spec.id, 'SKILL.md'))).toBe(true);
          });

          it('manifest.json passes SkillPoolManager.validateSkillDefinition', () => {
            const raw = readManifest(dir, spec.id);
            const result = SkillPoolManager.validateSkillDefinition(raw);
            expect(result.errors).toEqual([]);
            expect(result.valid).toBe(true);
          });

          it('has correct id/name/manifestVersion/source/enabled', () => {
            const raw = readManifest(dir, spec.id);
            expect(raw.id).toBe(spec.id);
            expect(raw.name).toBe(spec.name);
            expect(raw.manifestVersion).toBe(2);
            expect(raw.source).toBe('builtin');
            expect(raw.enabled).toBe(true);
          });

          it('has a zeroed stats object shaped like every other builtin', () => {
            const raw = readManifest(dir, spec.id) as unknown as SkillDefinition;
            if (dir === BUILTINS_DIR) {
              // Şablon-ağaç: yeni builtin SIFIR stats ile gemiye biner.
              expect(raw.stats).toEqual({
                totalUses: 0,
                successCount: 0,
                successRate: 0,
                avgCoverage: 0,
                lastUsedInSprint: '',
              });
            } else {
              // Canlı havuz (.deckent): sprint-finalizer stats'ı tasarım gereği
              // mutasyonlar (born-605 stats-sidecar'a kadar) — şekil + invariant pinle.
              expect(Object.keys(raw.stats).sort()).toEqual(
                ['avgCoverage', 'lastUsedInSprint', 'successCount', 'successRate', 'totalUses'],
              );
              expect(raw.stats.totalUses).toBeGreaterThanOrEqual(0);
              expect(raw.stats.successCount).toBeGreaterThanOrEqual(0);
              expect(raw.stats.successRate).toBeGreaterThanOrEqual(0);
              expect(raw.stats.successRate).toBeLessThanOrEqual(1);
              expect(typeof raw.stats.lastUsedInSprint).toBe('string');
            }
          });

          it('is a superset of the api-builder (disk-verified reference) field set', () => {
            const raw = readManifest(dir, spec.id);
            const keys = new Set(Object.keys(raw));
            for (const refKey of apiBuilderKeys()) {
              expect(keys.has(refKey), `missing field '${refKey}' (api-builder parity)`).toBe(true);
            }
          });

          it('sets the expected category', () => {
            const raw = readManifest(dir, spec.id);
            expect(raw.category).toBe(spec.expectedCategory);
          });

          it('carries the expected activation rule (domain or intent — post-601 contract)', () => {
            const raw = readManifest(dir, spec.id);
            if (spec.expectedRule.kind === 'domain') {
              const values = collectDomainRuleValues(raw.activation);
              expect(values, `expected domains.$contains('${spec.expectedRule.value}')`).toContain(spec.expectedRule.value);
            } else {
              const intents = (raw.activation?.rules ?? [])
                .map((r: { when?: Record<string, unknown> }) => r.when?.['intent.primary'])
                .filter((v: unknown): v is string => typeof v === 'string');
              expect(intents, `expected intent.primary rule '${spec.expectedRule.value}'`).toContain(spec.expectedRule.value);
            }
          });

          it('SKILL.md stays within the 4KB rubric cap and covers its lineage theme', () => {
            const content = readSkillMd(dir, spec.id);
            const byteLength = Buffer.byteLength(content, 'utf8');
            expect(byteLength).toBeLessThanOrEqual(MAX_SKILL_MD_BYTES);
            expect(byteLength).toBeGreaterThan(100);
            expect(content).toContain(spec.skillMdKeyword);
            expect(content).toContain('Karpathy Notes');
          });
        });
      }

      it('has unique ids and names across the two new skills', () => {
        const ids = NEW_SKILLS.map((s) => readManifest(dir, s.id).id);
        const names = NEW_SKILLS.map((s) => readManifest(dir, s.id).name);
        expect(new Set(ids).size).toBe(NEW_SKILLS.length);
        expect(new Set(names).size).toBe(NEW_SKILLS.length);
      });
    });
  }

  it('the two trees match for both new skills: SKILL.md byte-eş, manifest stats-hariç eş', () => {
    for (const spec of NEW_SKILLS) {
      expect(readSkillMd(BUILTINS_DIR, spec.id)).toBe(readSkillMd(POOL_DIR, spec.id));
      // stats hariç karşılaştır: canlı havuzda sprint-finalizer stats'ı mutasyonlar
      // (born-605 stats-sidecar'a kadar); manifest'in geri kalanı bire-bir eş kalmalı.
      const { stats: _b, ...builtinRest } = readManifest(BUILTINS_DIR, spec.id) as Record<string, unknown> & { stats?: unknown };
      const { stats: _p, ...poolRest } = readManifest(POOL_DIR, spec.id) as Record<string, unknown> & { stats?: unknown };
      expect(builtinRest).toEqual(poolRest);
    }
  });

  it('skill-pool load-smoke: SkillPoolManager.loadSkills() picks up both new skills from the real .deckent/skills pool', () => {
    const manager = new SkillPoolManager(PROJECT_ROOT);
    const pool = manager.loadSkills();
    for (const spec of NEW_SKILLS) {
      const skill = pool.get(spec.id);
      expect(skill, `pool missing '${spec.id}'`).toBeDefined();
      expect(skill?.enabled).toBe(true);
      expect(skill?.category).toBe(spec.expectedCategory);
    }
  });

  it('no existing built-in skill claims the new skills domain names (zero routing collision)', () => {
    const existingIds = [
      'accessibility-expert', 'anthropic-sdk', 'api-builder', 'ci-testing', 'code-simplifier',
      'database-migration', 'devops-engineer', 'docker-expert', 'documentation-writer',
      'file-watch-hygiene', 'frontend-design', 'git-expert', 'graphql-expert', 'ink-tui',
      'migration-expert', 'monorepo-expert', 'performance-optimizer', 'python-expert',
      'react-specialist', 'secure-coding', 'security-specialist', 'sh-portability',
      'system-architect', 'testing-expert', 'typescript-expert',
    ];
    const claimed = new Set<string>();
    for (const id of existingIds) {
      const raw = readManifest(BUILTINS_DIR, id);
      for (const v of collectDomainRuleValues(raw.activation)) claimed.add(v);
    }
    expect(claimed.has('rpc')).toBe(false);
    expect(claimed.has('onboarding')).toBe(false);
  });
});
