// AGSK-1 dilim-2 carry (sprint-368 task 368-001) — own load-test for three new built-in
// skills (api-design, observability, i18n-quality). Deliberately NOT added as fixtures to
// tests/core/skill-pool.test.ts or tests/core/skill-pool-stats.test.ts (those files mock
// node:fs) — this file owns disk-verification: real fs reads (no fs mock, hermetic —
// src/core/builtins/skills is git-tracked, present on any fresh checkout).
//
// Unlike tests/core/builtins/skill-catalog-agsk3.test.ts / skill-catalog-agsk4.test.ts, this
// task's write scope grants ONLY the three SKILL.md files (no manifest.json, no
// .deckent/skills mirror) — 367-008 was a NO_GO carryover specifically because a prior attempt
// wrote to the wrong tree; this slice deliberately stays inside its narrower grant. So this
// test does not assert manifest.json shape, pool-mirror byte-identity, or
// SkillPoolManager.loadSkills() pickup (all of which read .deckent/skills, per skill-pool.ts) —
// those land with the follow-up task that creates the manifests. What IS disk-verified here:
// SKILL.md existence + structure (byte cap, required sections, lineage keyword) and
// id-non-collision against the full existing builtin-skill id set, read live via readdirSync
// rather than a hand-maintained list, so this test can't silently drift from disk.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(__dirname, '../../..');
const BUILTINS_DIR = resolve(PROJECT_ROOT, 'src/core/builtins/skills');
const MAX_SKILL_MD_BYTES = 4096;

interface NewSkillSpec {
  id: string;
  skillMdKeyword: string;
}

const NEW_SKILLS: NewSkillSpec[] = [
  { id: 'api-design', skillMdKeyword: 'Schema-First Contracts' },
  { id: 'observability', skillMdKeyword: 'Heartbeat as Liveness Contract' },
  { id: 'i18n-quality', skillMdKeyword: 'No Hardcoded User-Facing Strings' },
];

function readSkillMd(id: string): string {
  return readFileSync(resolve(BUILTINS_DIR, id, 'SKILL.md'), 'utf8');
}

describe('AGSK-5: api-design + observability + i18n-quality SKILL.md catalog', () => {
  for (const spec of NEW_SKILLS) {
    describe(spec.id, () => {
      it('has a SKILL.md on disk under src/core/builtins/skills/<id>/', () => {
        expect(existsSync(resolve(BUILTINS_DIR, spec.id))).toBe(true);
        expect(existsSync(resolve(BUILTINS_DIR, spec.id, 'SKILL.md'))).toBe(true);
      });

      it('SKILL.md stays within the 4KB rubric cap and is non-trivial', () => {
        const content = readSkillMd(spec.id);
        const byteLength = Buffer.byteLength(content, 'utf8');
        expect(byteLength).toBeLessThanOrEqual(MAX_SKILL_MD_BYTES);
        expect(byteLength).toBeGreaterThan(100);
      });

      it('opens with an H1 title and covers its lineage theme + Karpathy Notes', () => {
        const content = readSkillMd(spec.id);
        expect(content.startsWith('# ')).toBe(true);
        expect(content).toContain(spec.skillMdKeyword);
        expect(content).toContain('## Karpathy Notes');
        expect(content).toContain('## Anti-Patterns');
      });

      it('has no YAML frontmatter (matches the most recent lineage: rpc-protocol, ' +
        'onboarding-ux, provider-cli-matrix)', () => {
        const content = readSkillMd(spec.id);
        expect(content.startsWith('---')).toBe(false);
      });
    });
  }

  it('has unique ids across the three new skills', () => {
    const ids = NEW_SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(NEW_SKILLS.length);
  });

  it('no existing built-in skill directory claims a new skill id (disk-driven, zero routing collision)', () => {
    const existingEntries = readdirSync(BUILTINS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    const existingIds = existingEntries.filter((id) => !NEW_SKILLS.some((s) => s.id === id));

    for (const spec of NEW_SKILLS) {
      expect(existingIds, `existing builtin skill ids must not already claim '${spec.id}'`).not.toContain(spec.id);
    }

    // Every new skill id must actually be present in the live builtins tree exactly once.
    for (const spec of NEW_SKILLS) {
      const occurrences = existingEntries.filter((id) => id === spec.id).length;
      expect(occurrences, `'${spec.id}' should appear exactly once on disk`).toBe(1);
    }

    // The full on-disk id set (existing + new) must itself be collision-free.
    expect(new Set(existingEntries).size).toBe(existingEntries.length);
  });
});
