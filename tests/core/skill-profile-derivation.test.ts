import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, expect, it } from 'vitest';

import { deriveCanonicalSkillProfile } from '../../src/core/skill-profile-derivation.js';
import { resolveSkillCatalog } from '../../src/core/skill-pool.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import { validateSkillProfile } from '../../src/core/routing/capability-vector.js';

function representative(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return createSkillDefinition({
    id: 'representative',
    name: 'Representative',
    description: 'TypeScript API implementation, testing, review, and migration expertise',
    category: 'language',
    triggers: ['typescript', 'api', 'test', 'migration'],
    stackDetection: {
      files: ['tsconfig.json'],
      dependencies: ['typescript'],
      commands: ['tsc'],
    },
    composableWith: ['testing-expert'],
    priority: 10,
    ...overrides,
  });
}

describe('deriveCanonicalSkillProfile', () => {
  it('derives a deterministic, valid V3 profile from source metadata', () => {
    const first = deriveCanonicalSkillProfile(representative());
    const second = deriveCanonicalSkillProfile(representative({ id: 'different-id' }));

    expect(first.status).toBe('routable');
    expect(second.status).toBe('routable');
    if (first.status !== 'routable' || second.status !== 'routable') return;
    expect(validateSkillProfile(first.profile).ok).toBe(true);
    expect(first.origin).toBe('derived-profile');
    expect(first.provenance).toEqual({
      derivationVersion: 1,
      fields: {
        workTypes: {
          sourceFields: ['category', 'triggers', 'stackDetection', 'composableWith', 'priority', 'description'],
          note: 'canonical-profile-derived-from-manifest-source-metadata',
        },
        domains: {
          sourceFields: ['category', 'stackDetection'],
          note: 'canonical-profile-derived-from-manifest-source-metadata',
        },
        expertise: {
          sourceFields: ['category', 'triggers', 'stackDetection', 'composableWith', 'description'],
          note: 'canonical-profile-derived-from-manifest-source-metadata',
        },
        deliverables: {
          sourceFields: ['category', 'triggers', 'stackDetection', 'composableWith', 'priority', 'description'],
          note: 'canonical-profile-derived-from-manifest-source-metadata',
        },
      },
    });
    expect(first.profile).toEqual(second.profile);
  });

  it('returns a typed unroutable HOLD when source metadata cannot produce a profile', () => {
    const result = deriveCanonicalSkillProfile(representative({ description: '' }));

    expect(result).toEqual({
      status: 'unroutable',
      origin: 'derived-profile',
      profile: null,
      diagnostic: {
        disposition: 'HOLD',
        reasonCode: 'insufficient-source-metadata',
        message: 'canonical V3 profile requires a non-empty description and routing metadata',
        issues: [],
      },
    });
  });

  it('is byte-idempotent across repeated derivation', () => {
    const manifest = representative();
    const first = JSON.stringify(deriveCanonicalSkillProfile(manifest));
    const second = JSON.stringify(deriveCanonicalSkillProfile(manifest));

    expect(second).toBe(first);
  });

  it('attaches derived eligibility or a typed HOLD to the canonical effective record', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'deckent-profile-'));
    try {
      const skillsDir = path.join(root, '.deckent', 'skills');
      const good = representative({ id: 'good', name: 'Good' });
      const held = representative({ id: 'held', name: 'Held', description: '' });
      await fs.mkdir(path.join(skillsDir, 'good'), { recursive: true });
      await fs.mkdir(path.join(skillsDir, 'held'), { recursive: true });
      await fs.writeFile(path.join(skillsDir, 'good', 'manifest.json'), JSON.stringify(good));
      await fs.writeFile(path.join(skillsDir, 'held', 'manifest.json'), JSON.stringify(held));

      const resolution = resolveSkillCatalog(root);
      const byId = new Map(resolution.entries.map((entry) => [entry.id, entry]));
      expect(byId.get('good')?.routing.status).toBe('routable');
      expect(byId.get('good')?.definition.profile).toBeDefined();
      expect(byId.get('held')?.routing).toMatchObject({
        status: 'unroutable',
        diagnostic: { disposition: 'HOLD', reasonCode: 'insufficient-source-metadata' },
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('derives valid canonical profiles for every TRACKED builtin package manifest', async () => {
    // Hermetic: the tracked src/core/builtins/skills package tree (same 30
    // skills the installer seeds), never the live .deckent project root.
    const skillsDir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'src', 'core', 'builtins', 'skills');
    const entries = (await fs.readdir(skillsDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name));
    const withManifest = [] as typeof entries;
    for (const entry of entries) {
      // observability ships SKILL.md-only today (package-only observability
      // fallback, 7012 code-truth) — no manifest means nothing to derive from.
      try {
        await fs.access(path.join(skillsDir, entry.name, 'manifest.json'));
        withManifest.push(entry);
      } catch { /* manifest-less package — skip */ }
    }
    entries.length = 0;
    entries.push(...withManifest);
    const results = await Promise.all(entries.map(async (entry) => {
      const raw = JSON.parse(
        await fs.readFile(path.join(skillsDir, entry.name, 'manifest.json'), 'utf8'),
      ) as SkillDefinition;
      return deriveCanonicalSkillProfile(raw);
    }));

    // Count derived from the scan (31 tracked builtin packages today; the
    // installed project pool seeds 30 of them) — the invariant is TOTAL
    // coverage: every tracked builtin derives a routable canonical profile.
    expect(results.length).toBeGreaterThanOrEqual(30);
    expect(results.filter((result) => result.status === 'routable').length).toBe(results.length);
  });
});
