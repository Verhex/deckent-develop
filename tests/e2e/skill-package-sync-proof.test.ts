/**
 * Effective-path regression proof for builtin skill package synchronization.
 *
 * This deliberately exercises an isolated project through the same seed and
 * sync entry points a user receives, then reads the effective catalog rather
 * than asserting only the materialized manifest shape.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { seedBuiltins } from '../../src/cli/commands/init-steps.js';
import { SkillPoolManager, syncBuiltinSkillManifests } from '../../src/core/skill-pool.js';

const roots: string[] = [];

function initializedRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-skill-package-proof-'));
  roots.push(root);
  mkdirSync(join(root, '.deckent', 'skills'), { recursive: true });
  writeFileSync(join(root, '.deckent', 'config.json'), '{}\n', 'utf8');
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('builtin skill package sync effective path', () => {
  it('delivers authored deckent profiles and bodies without overwriting local bodies', () => {
    const root = initializedRoot();

    seedBuiltins(root);
    const first = syncBuiltinSkillManifests(root);
    expect(first.issues).toEqual([]);

    const skillsRoot = join(root, '.deckent', 'skills');
    const deckentSkillIds = readdirSync(skillsRoot)
      .filter((id) => id.startsWith('deckent-'))
      .sort();
    expect(deckentSkillIds).toHaveLength(4);

    const manifestAndBodyBytes = new Map<string, { manifest: string; body: string }>();
    const pool = new SkillPoolManager(root);
    for (const id of deckentSkillIds) {
      const sourceManifest = JSON.parse(readFileSync(
        join(process.cwd(), 'src', 'core', 'builtins', 'skills', id, 'manifest.json'),
        'utf8',
      )) as { profile: unknown };
      const manifestPath = join(skillsRoot, id, 'manifest.json');
      const bodyPath = join(skillsRoot, id, 'SKILL.md');
      const materializedManifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        profileProvenance?: { origin?: string };
      };
      const effective = pool.getEffective(id);
      const body = pool.resolveBody(id);

      expect(body.ok, `${id} body should be deliverable`).toBe(true);
      expect(effective?.definition.profile).toEqual(sourceManifest.profile);
      expect(materializedManifest.profileProvenance?.origin).toBe('manifest-profile');
      expect(effective?.definition.profileProvenance?.origin).toBe('manifest-profile');
      manifestAndBodyBytes.set(id, {
        manifest: readFileSync(manifestPath, 'utf8'),
        body: readFileSync(bodyPath, 'utf8'),
      });
    }

    const second = syncBuiltinSkillManifests(root);
    expect(second.issues).toEqual([]);
    for (const id of deckentSkillIds) {
      const before = manifestAndBodyBytes.get(id);
      expect(before).toBeDefined();
      expect(readFileSync(join(skillsRoot, id, 'manifest.json'), 'utf8')).toBe(before!.manifest);
      expect(readFileSync(join(skillsRoot, id, 'SKILL.md'), 'utf8')).toBe(before!.body);
    }

    const locallyEditedId = deckentSkillIds[0]!;
    const locallyEditedBodyPath = join(skillsRoot, locallyEditedId, 'SKILL.md');
    const localBody = '# Local skill customization\n\nPreserve this edit.\n';
    writeFileSync(locallyEditedBodyPath, localBody, 'utf8');

    const third = syncBuiltinSkillManifests(root);
    expect(third.keptLocal).toContain(locallyEditedId);
    expect(readFileSync(locallyEditedBodyPath, 'utf8')).toBe(localBody);
  });
});
