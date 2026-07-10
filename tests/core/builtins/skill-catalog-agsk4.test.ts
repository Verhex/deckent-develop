// AGSK-4 (sprint-364 task 364-009) — own load-test for the new provider-cli-matrix
// built-in skill. Deliberately NOT added as a fixture to tests/core/skill-pool.test.ts or
// tests/core/skill-pool-stats.test.ts (those files mock node:fs) — this file owns
// disk-verification for the new catalog entry: real fs reads (no fs mock, hermetic — both
// .deckent/skills/ and src/core/builtins/skills/ are git-tracked, present on any fresh
// checkout) plus a real SkillPoolManager.loadSkills() smoke against the actual project root.
// Mirrors tests/core/builtins/skill-catalog-agsk3.test.ts's structure, adapted from a
// two-skill spec array to a single new skill.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SkillPoolManager } from '../../../src/core/skill-pool.js';
import type { SkillDefinition } from '../../../src/core/skill-types.js';

const PROJECT_ROOT = resolve(__dirname, '../../..');
const BUILTINS_DIR = resolve(PROJECT_ROOT, 'src/core/builtins/skills');
const POOL_DIR = resolve(PROJECT_ROOT, '.deckent/skills');
const MAX_SKILL_MD_BYTES = 4096;

const SKILL_ID = 'provider-cli-matrix';
const SKILL_NAME = 'Provider CLI Matrix';
const EXPECTED_CATEGORY = 'domain';
// Sprint-396 rule-rewrite: activation.rules[].when.domains.$contains moved from 'provider-cli'
// to 'providers' (+ an intent.primary:'implementation' sibling gate). Pinning the live contract.
const EXPECTED_DOMAIN = 'providers';
const SKILL_MD_KEYWORD = 'Repro-Before-Red Pattern';

// Reference field set (api-builder, DISK-VERIFIED per task instruction) — the new skill
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

describe('AGSK-4: provider-cli-matrix catalog', () => {
  for (const dir of [BUILTINS_DIR, POOL_DIR]) {
    describe(`tree: ${dir === BUILTINS_DIR ? 'src/core/builtins/skills' : '.deckent/skills'}`, () => {
      it('has manifest.json and SKILL.md on disk', () => {
        expect(existsSync(resolve(dir, SKILL_ID, 'manifest.json'))).toBe(true);
        expect(existsSync(resolve(dir, SKILL_ID, 'SKILL.md'))).toBe(true);
      });

      it('manifest.json passes SkillPoolManager.validateSkillDefinition', () => {
        const raw = readManifest(dir, SKILL_ID);
        const result = SkillPoolManager.validateSkillDefinition(raw);
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
      });

      it('has correct id/name/manifestVersion/source/enabled', () => {
        const raw = readManifest(dir, SKILL_ID);
        expect(raw.id).toBe(SKILL_ID);
        expect(raw.name).toBe(SKILL_NAME);
        expect(raw.manifestVersion).toBe(2);
        expect(raw.source).toBe('builtin');
        expect(raw.enabled).toBe(true);
      });

      it('has a zeroed stats object shaped like every other builtin', () => {
        const raw = readManifest(dir, SKILL_ID) as unknown as SkillDefinition;
        expect(raw.stats).toEqual({
          totalUses: 0,
          successCount: 0,
          successRate: 0,
          avgCoverage: 0,
          lastUsedInSprint: '',
        });
      });

      it('is a superset of the api-builder (disk-verified reference) field set', () => {
        const raw = readManifest(dir, SKILL_ID);
        const keys = new Set(Object.keys(raw));
        for (const refKey of apiBuilderKeys()) {
          expect(keys.has(refKey), `missing field '${refKey}' (api-builder parity)`).toBe(true);
        }
      });

      it('sets the expected category', () => {
        const raw = readManifest(dir, SKILL_ID);
        expect(raw.category).toBe(EXPECTED_CATEGORY);
      });

      it('carries activation.rules whose domains.$contains includes the expected domain', () => {
        const raw = readManifest(dir, SKILL_ID);
        const values = collectDomainRuleValues(raw.activation);
        expect(values, `expected domains.$contains('${EXPECTED_DOMAIN}')`).toContain(EXPECTED_DOMAIN);
      });

      it('SKILL.md stays within the 4KB rubric cap and covers its lineage theme', () => {
        const content = readSkillMd(dir, SKILL_ID);
        const byteLength = Buffer.byteLength(content, 'utf8');
        expect(byteLength).toBeLessThanOrEqual(MAX_SKILL_MD_BYTES);
        expect(byteLength).toBeGreaterThan(100);
        expect(content).toContain(SKILL_MD_KEYWORD);
        expect(content).toContain('Karpathy Notes');
      });

      it('SKILL.md documents all three providers and the silent-fallback ban', () => {
        const content = readSkillMd(dir, SKILL_ID);
        expect(content).toContain('Claude');
        expect(content).toContain('Codex');
        expect(content).toContain('Gemini');
        expect(content).toContain('Silent-Fallback Ban');
        expect(content).toContain('Exit-Code Honesty');
      });
    });
  }

  it('the two trees are byte-identical (bundle-builtins.mjs invariant)', () => {
    expect(readSkillMd(BUILTINS_DIR, SKILL_ID)).toBe(readSkillMd(POOL_DIR, SKILL_ID));
    expect(readManifest(BUILTINS_DIR, SKILL_ID)).toEqual(readManifest(POOL_DIR, SKILL_ID));
  });

  it('skill-pool load-smoke: SkillPoolManager.loadSkills() picks up the new skill from the real .deckent/skills pool', () => {
    const manager = new SkillPoolManager(PROJECT_ROOT);
    const pool = manager.loadSkills();
    const skill = pool.get(SKILL_ID);
    expect(skill, `pool missing '${SKILL_ID}'`).toBeDefined();
    expect(skill?.enabled).toBe(true);
    expect(skill?.category).toBe(EXPECTED_CATEGORY);
  });

  it('no existing built-in skill claims the new skill domain name (zero routing collision)', () => {
    const existingIds = [
      'accessibility-expert', 'anthropic-sdk', 'api-builder', 'ci-testing', 'code-simplifier',
      'database-migration', 'devops-engineer', 'docker-expert', 'documentation-writer',
      'file-watch-hygiene', 'frontend-design', 'git-expert', 'graphql-expert', 'ink-tui',
      'migration-expert', 'monorepo-expert', 'onboarding-ux', 'performance-optimizer',
      'python-expert', 'react-specialist', 'rpc-protocol', 'secure-coding',
      'security-specialist', 'sh-portability', 'system-architect', 'testing-expert',
      'typescript-expert',
    ];
    const claimed = new Set<string>();
    for (const id of existingIds) {
      const raw = readManifest(BUILTINS_DIR, id);
      for (const v of collectDomainRuleValues(raw.activation)) claimed.add(v);
    }
    expect(claimed.has(EXPECTED_DOMAIN)).toBe(false);
  });
});
