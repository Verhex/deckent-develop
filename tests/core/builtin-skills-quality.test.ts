// ─── Builtin Skill Quality Invariants ───────────────────────────────────────
// Guards the maturity, factual cleanliness, and builtins↔.deckent sync of the
// bundled expert skills. These skills are injected raw into worker prompts
// (resolveSkillPrompts → buildWorkerPrompt), so a missing section,
// a stale model ID, or drift between the shipped source and the dogfood copy
// degrades every worker that loads them.
//
// Hermetic: reads only git-committed repo files (src/core/builtins/skills is
// the canonical source; .deckent/skills is the tracked dogfood mirror). No
// tmpdir, no HOME, no spawn. The drift guard is conditional on .deckent being
// present so the suite stays green under test:ci-sim (which may hide .deckent).

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const BUILTINS_DIR = path.join(repoRoot, 'src', 'core', 'builtins', 'skills');
const DECKENT_DIR = path.join(repoRoot, '.deckent', 'skills');

/** Stale / hallucinated model identifiers that must never appear in a skill. */
const FORBIDDEN_MODEL_IDS = [
  'claude-haiku-235', // hallucinated — never existed
  'claude-sonnet-4-20250514', // stale dated ID, rots
  'claude-opus-4-20250514', // stale dated ID, rots
];

function builtinSkillIds(): string[] {
  return fs
    .readdirSync(BUILTINS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((id) => fs.existsSync(path.join(BUILTINS_DIR, id, 'SKILL.md')))
    .sort();
}

function readSkill(dir: string, id: string): string {
  return fs.readFileSync(path.join(dir, id, 'SKILL.md'), 'utf8');
}

describe('builtin skill quality invariants', () => {
  const skillIds = builtinSkillIds();

  it('discovers the full builtin skill set', () => {
    // Sanity floor: 21 builtin expert skills ship today. Guards against a
    // vacuous pass if directory resolution silently returns nothing.
    expect(skillIds.length).toBeGreaterThanOrEqual(21);
  });

  describe.each(skillIds)('skill: %s', (id) => {
    const content = readSkill(BUILTINS_DIR, id);

    it('has an Anti-Patterns section', () => {
      // accessibility-expert uses "## Common Anti-Patterns"; the substring covers both.
      expect(content).toMatch(/Anti-Patterns/);
    });

    it('has a Karpathy Notes section', () => {
      expect(content).toContain('## Karpathy Notes');
    });

    it('contains no stale or hallucinated model IDs', () => {
      for (const forbidden of FORBIDDEN_MODEL_IDS) {
        expect(content).not.toContain(forbidden);
      }
    });

    it('matches the .deckent dogfood mirror byte-for-byte (when present)', () => {
      const mirror = path.join(DECKENT_DIR, id, 'SKILL.md');
      if (!fs.existsSync(mirror)) return; // .deckent hidden under ci-sim — skip
      expect(readSkill(DECKENT_DIR, id)).toBe(content);
    });
  });

  it('anthropic-sdk teaches tier-based model selection, not a hardcoded dated ID', () => {
    const content = readSkill(BUILTINS_DIR, 'anthropic-sdk');
    // Must steer toward registry/catalog resolution by tier.
    expect(content).toMatch(/tier|registry|catalog/i);
  });
});
