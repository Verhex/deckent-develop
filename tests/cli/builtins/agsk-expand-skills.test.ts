// tests/cli/builtins/agsk-expand-skills.test.ts
// Sprint 359 Task 359-012 — AGSK-EXPAND (Sıra-85, dilim-1): load-smoke for the 3 new
// horizontal skills (ink-tui, file-watch-hygiene, sh-portability).
//
// Hermetic: reads only git-committed `.deckent/skills/*` files and drives a real
// SkillPoolManager against the actual repo root — no mocks, no tmpdir, no fixtures added
// to the existing tests/core/skill-pool.test.ts suite (that file stays untouched).
//
// Scope note: these 3 skills also belong in the `src/core/builtins/skills/` mirror (the
// real builtins-SSOT — see `src/cli/commands/init-steps.ts` `resolveBuiltinsDir()` and
// `tests/core/builtin-skills-quality.test.ts` BUILTINS_DIR). That tree is intentionally
// NOT touched by this task — see task-359-012 .result notes for the scope-defect this
// worker self-flagged (declared scope pointed at a non-existent `src/cli/builtins/`).

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SkillPoolManager } from '../../../src/core/skill-pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const SKILLS_DIR = path.join(repoRoot, '.deckent', 'skills');

const NEW_SKILL_IDS = ['ink-tui', 'file-watch-hygiene', 'sh-portability'] as const;

const MAX_SKILL_MD_BYTES = 4096;

function readManifest(id: string): Record<string, unknown> {
  const raw = fs.readFileSync(path.join(SKILLS_DIR, id, 'manifest.json'), 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function readSkillMd(id: string): string {
  return fs.readFileSync(path.join(SKILLS_DIR, id, 'SKILL.md'), 'utf8');
}

function allKnownSkillIds(): Set<string> {
  return new Set(
    fs
      .readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name),
  );
}

describe('AGSK-EXPAND — new skill directories exist', () => {
  it.each(NEW_SKILL_IDS)('%s has manifest.json and SKILL.md', (id) => {
    expect(fs.existsSync(path.join(SKILLS_DIR, id, 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(SKILLS_DIR, id, 'SKILL.md'))).toBe(true);
  });
});

describe('AGSK-EXPAND — manifest validates via SkillPoolManager', () => {
  it.each(NEW_SKILL_IDS)('%s manifest passes validateSkillDefinition', (id) => {
    const manifest = readManifest(id);
    const result = SkillPoolManager.validateSkillDefinition(manifest);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it.each(NEW_SKILL_IDS)('%s manifest id matches directory name', (id) => {
    expect(readManifest(id).id).toBe(id);
  });

  it.each(NEW_SKILL_IDS)('%s manifest has entrypoint SKILL.md and is enabled', (id) => {
    const m = readManifest(id);
    expect(m.entrypoint).toBe('SKILL.md');
    expect(m.enabled).toBe(true);
  });
});

describe('AGSK-EXPAND — real SkillPoolManager.loadSkills() surfaces the new skills', () => {
  it('loads all 3 new skill ids from the real .deckent/skills/ tree', () => {
    const manager = new SkillPoolManager(repoRoot);
    const pool = manager.loadSkills();
    for (const id of NEW_SKILL_IDS) {
      expect(pool.has(id)).toBe(true);
    }
  });

  it('each loaded skill keeps its declared category', () => {
    const manager = new SkillPoolManager(repoRoot);
    const pool = manager.loadSkills();
    expect(pool.get('ink-tui')?.category).toBe('framework');
    expect(pool.get('file-watch-hygiene')?.category).toBe('tool');
    expect(pool.get('sh-portability')?.category).toBe('tool');
  });
});

describe('AGSK-EXPAND — SKILL.md content quality (mirrors builtin-skills-quality invariants)', () => {
  it.each(NEW_SKILL_IDS)('%s SKILL.md is <= 4KB', (id) => {
    const bytes = Buffer.byteLength(readSkillMd(id), 'utf8');
    expect(bytes).toBeLessThanOrEqual(MAX_SKILL_MD_BYTES);
  });

  it.each(NEW_SKILL_IDS)('%s SKILL.md starts with a markdown heading', (id) => {
    expect(readSkillMd(id)).toMatch(/^# /m);
  });

  it.each(NEW_SKILL_IDS)('%s SKILL.md has an Anti-Patterns section', (id) => {
    expect(readSkillMd(id)).toMatch(/Anti-Patterns/);
  });

  it.each(NEW_SKILL_IDS)('%s SKILL.md has a Karpathy Notes section', (id) => {
    expect(readSkillMd(id)).toContain('## Karpathy Notes');
  });

  it.each(NEW_SKILL_IDS)('%s SKILL.md references a real sprint/born lesson', (id) => {
    // goCriteria: content must be lesson-referenced, not generic filler.
    expect(readSkillMd(id)).toMatch(/sprint|born-/i);
  });
});

describe('AGSK-EXPAND — cross-cutting manifest invariants', () => {
  it('composableWith references only real, existing skill ids', () => {
    const known = allKnownSkillIds();
    for (const id of NEW_SKILL_IDS) {
      const m = readManifest(id);
      const composable = m.composableWith as string[];
      expect(Array.isArray(composable)).toBe(true);
      for (const ref of composable) {
        expect(known.has(ref)).toBe(true);
      }
    }
  });

  it('no new skill is composable with itself', () => {
    for (const id of NEW_SKILL_IDS) {
      const m = readManifest(id);
      expect(m.composableWith).not.toContain(id);
    }
  });

  it('all new skill ids are unique across the pool', () => {
    const known = allKnownSkillIds();
    expect(new Set(NEW_SKILL_IDS).size).toBe(NEW_SKILL_IDS.length);
    for (const id of NEW_SKILL_IDS) {
      expect(known.has(id)).toBe(true);
    }
  });
});
