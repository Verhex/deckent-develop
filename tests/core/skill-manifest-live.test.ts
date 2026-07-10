// born-592 / task-393-004 (sprint-393) — MANIFEST-REPAIR acceptance test for the three
// skills the audit report (§kök-neden-4b/tehlikeli-kırıntı) flagged:
//   - api-design:   live manifest.json exists (fake stats: totalUses 12, description:"")
//                    but SKILL.md is MISSING — a content-free "ghost" skill that still
//                    scores and accrues stat-credit. Real content already exists at
//                    src/core/builtins/skills/api-design/SKILL.md; it was just never
//                    copied into .deckent/skills/.
//   - i18n-quality:  builtin ships SKILL.md only (no manifest.json anywhere); nothing is
//                    materialized on disk under .deckent/skills/ at all.
//   - secure-coding: control case — already fully materialized live. Included so this file
//                    also acts as a regression guard against a future task un-materializing
//                    or diverging it from the builtin.
//
// SCOPE NOTE: this task's scope.filesWrite grants ONLY this test file — the three skill
// directories are read-scope, not write-scope (per worker-default.md: "the write list is
// the single authority ... note it in .result instead of editing"). This file therefore
// asserts the DESIRED end state (the goCriteria) against the real repo tree rather than
// fabricating the fix itself; until a task with write access to .deckent/skills/api-design/
// and .deckent/skills/i18n-quality/ lands the copy, the api-design/i18n-quality assertions
// below are EXPECTED to fail — see task-393-004.result notes. This mirrors the documented
// precedent in tests/core/builtins/skill-catalog-agsk5.test.ts ("367-008 was a NO_GO
// carryover ... this slice deliberately stays inside its narrower grant").
//
// Real fs reads throughout (no fs mock) — both .deckent/skills/ and
// src/core/builtins/skills/ are git-tracked and present on any fresh checkout, so this file
// is hermetic. Structure mirrors tests/core/builtins/skill-catalog-agsk3.test.ts /
// skill-catalog-agsk4.test.ts.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { SkillPoolManager } from '../../src/core/skill-pool.js';

const PROJECT_ROOT = resolve(__dirname, '../..');
const BUILTINS_DIR = resolve(PROJECT_ROOT, 'src/core/builtins/skills');
const POOL_DIR = resolve(PROJECT_ROOT, '.deckent/skills');

const TARGET_SKILLS = ['api-design', 'i18n-quality', 'secure-coding'] as const;

function readManifest(dir: string, id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(dir, id, 'manifest.json'), 'utf8')) as Record<string, unknown>;
}

function readSkillMd(dir: string, id: string): string {
  return readFileSync(resolve(dir, id, 'SKILL.md'), 'utf8');
}

describe('born-592: api-design / i18n-quality / secure-coding materialized live', () => {
  for (const id of TARGET_SKILLS) {
    describe(id, () => {
      it('has SKILL.md + manifest.json on disk under .deckent/skills/<id>/', () => {
        expect(existsSync(resolve(POOL_DIR, id)), `.deckent/skills/${id}/ missing`).toBe(true);
        expect(existsSync(resolve(POOL_DIR, id, 'SKILL.md')), `${id}/SKILL.md missing`).toBe(true);
        expect(existsSync(resolve(POOL_DIR, id, 'manifest.json')), `${id}/manifest.json missing`).toBe(true);
      });

      it('SKILL.md is non-trivial real content, not a stub', () => {
        const content = readSkillMd(POOL_DIR, id);
        expect(Buffer.byteLength(content, 'utf8')).toBeGreaterThan(100);
        expect(content.startsWith('# ')).toBe(true);
      });

      it('manifest.json passes SkillPoolManager.validateSkillDefinition', () => {
        const raw = readManifest(POOL_DIR, id);
        const result = SkillPoolManager.validateSkillDefinition(raw);
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
      });

      it('has correct id/source/enabled/entrypoint and a NON-EMPTY description (the api-design ghost symptom)', () => {
        const raw = readManifest(POOL_DIR, id);
        expect(raw.id).toBe(id);
        expect(raw.source).toBe('builtin');
        expect(raw.enabled).toBe(true);
        expect(raw.entrypoint).toBe('SKILL.md');
        expect(typeof raw.description).toBe('string');
        expect((raw.description as string).trim().length, `${id} manifest.description must not be empty`).toBeGreaterThan(0);
      });

      it('live SKILL.md is byte-identical to the builtin (materialize = copy, builtin untouched)', () => {
        expect(existsSync(resolve(BUILTINS_DIR, id, 'SKILL.md')), `builtin ${id}/SKILL.md missing`).toBe(true);
        expect(readSkillMd(POOL_DIR, id)).toBe(readSkillMd(BUILTINS_DIR, id));
      });

      it('EXACTLY-ONCE: exactly one on-disk directory in .deckent/skills/ matches this id', () => {
        const entries = existsSync(POOL_DIR)
          ? readdirSync(POOL_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
          : [];
        const occurrences = entries.filter((name) => name === id).length;
        expect(occurrences, `expected exactly one '${id}' dir under .deckent/skills/, found ${occurrences}`).toBe(1);
      });
    });
  }

  it('pool-load smoke: SkillPoolManager.loadSkills() lists all 3 skills, enabled, with readable non-empty content', () => {
    const manager = new SkillPoolManager(PROJECT_ROOT);
    const pool = manager.loadSkills();

    for (const id of TARGET_SKILLS) {
      const skill = pool.get(id);
      expect(skill, `pool missing '${id}'`).toBeDefined();
      expect(skill?.enabled).toBe(true);
      expect((skill?.description ?? '').trim().length, `${id} pool entry has empty description`).toBeGreaterThan(0);

      // "İçerikli" (content-bearing), not just manifest-present: resolve the entrypoint on
      // disk and confirm it is real, non-trivial content — this is what actually catches
      // the api-design ghost (manifest present, SKILL.md absent) at the pool layer.
      const entrypointPath = resolve(POOL_DIR, id, skill!.entrypoint || 'SKILL.md');
      expect(existsSync(entrypointPath), `${id} entrypoint file missing on disk: ${entrypointPath}`).toBe(true);
      const entrypointContent = readFileSync(entrypointPath, 'utf8');
      expect(Buffer.byteLength(entrypointContent, 'utf8')).toBeGreaterThan(100);
    }
  });

  it('EXACTLY-ONCE gate holds at the pool layer: a live-materialized skill is never also re-synthesized from the builtin fallback', () => {
    // SkillPoolManager.loadSkills() merges live .deckent/skills/ entries with an in-memory
    // builtin fallback (_loadBuiltinFallback) for ids the live dir does NOT define. Once a
    // skill is genuinely materialized live (this test's precondition), the fallback's own
    // `if (pool.has(entry.name)) continue;` guard means the live, on-disk manifest is what
    // wins — never a second, builtin-synthesized entry for the same id. A JS Map can only
    // hold one value per key, so any duplication would silently overwrite rather than throw;
    // this assertion instead proves the SURVIVING entry is the live one (source-of-record),
    // not the synthesized fallback shape (which always has an empty description — see
    // synthesizeSkillManifest's `lead` extraction — while a hand-authored live manifest for
    // these three skills does not).
    const manager = new SkillPoolManager(PROJECT_ROOT);
    const pool = manager.loadSkills();

    for (const id of TARGET_SKILLS) {
      const liveManifest = readManifest(POOL_DIR, id);
      const pooled = pool.get(id);
      expect(pooled?.description).toBe(liveManifest.description);
      expect(pooled?.version).toBe(liveManifest.version);
    }
  });

  it('no unrelated skill was touched by this repair (nogo: "başka skill\'e dokunma")', () => {
    const liveIds = readdirSync(POOL_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    // Every other previously-live skill must still be present — this repair only ever adds
    // to .deckent/skills/, it must never remove a sibling directory.
    const OTHER_PREVIOUSLY_LIVE_SKILLS = [
      'accessibility-expert', 'anthropic-sdk', 'api-builder', 'ci-testing', 'code-simplifier',
      'database-migration', 'devops-engineer', 'docker-expert', 'documentation-writer',
      'file-watch-hygiene', 'frontend-design', 'git-expert', 'graphql-expert', 'ink-tui',
      'migration-expert', 'monorepo-expert', 'onboarding-ux', 'performance-optimizer',
      'provider-cli-matrix', 'python-expert', 'react-specialist', 'rpc-protocol',
      'security-specialist', 'sh-portability', 'system-architect', 'testing-expert',
      'typescript-expert',
    ];
    for (const id of OTHER_PREVIOUSLY_LIVE_SKILLS) {
      expect(liveIds, `sibling skill '${id}' must not be removed by this repair`).toContain(id);
    }
  });
});
