import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  syncBuiltinSkillManifests,
  type BuiltinSkillSyncReport,
} from '../../src/core/skill-pool.js';

const roots: string[] = [];

function initializedRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-sync-skill-'));
  roots.push(root);
  mkdirSync(join(root, '.deckent'), { recursive: true });
  writeFileSync(join(root, '.deckent', 'config.json'), '{}\n', 'utf8');
  return root;
}

function changedCount(report: BuiltinSkillSyncReport): number {
  return report.created.length + report.updated.length;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('deckent sync builtin skill branch', () => {
  it('materializes builtin manifests and bodies, then is idempotent', () => {
    const root = initializedRoot();

    const first = syncBuiltinSkillManifests(root);
    expect(changedCount(first)).toBeGreaterThan(0);
    expect(first.issues).toEqual([]);
    expect(first.created).toContain('observability');

    const observability = JSON.parse(readFileSync(
      join(root, '.deckent', 'skills', 'observability', 'manifest.json'),
      'utf8',
    )) as Record<string, unknown>;
    expect(observability.id).toBe('observability');
    expect(observability.builtinContentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(observability.profileProvenance).toMatchObject({
      origin: 'derived-profile',
      derivationVersion: 2,
    });
    expect(observability.profile).toMatchObject({ profileVersion: 3 });
    expect(readFileSync(
      join(root, '.deckent', 'skills', 'observability', 'SKILL.md'),
      'utf8',
    )).toBe(readFileSync(
      join('src', 'core', 'builtins', 'skills', 'observability', 'SKILL.md'),
      'utf8',
    ));

    const beforeSecondRun = readFileSync(
      join(root, '.deckent', 'skills', 'observability', 'manifest.json'),
      'utf8',
    );
    const second = syncBuiltinSkillManifests(root);
    expect(changedCount(second)).toBe(0);
    expect(second.unchanged.length).toBe(first.created.length);
    expect(readFileSync(
      join(root, '.deckent', 'skills', 'observability', 'manifest.json'),
      'utf8',
    )).toBe(beforeSecondRun);
  });

  it('preserves a user-edited builtin body and reports it as kept local', () => {
    const root = initializedRoot();
    syncBuiltinSkillManifests(root);
    const targetPath = join(root, '.deckent', 'skills', 'observability', 'SKILL.md');
    const localBody = '# Locally tailored observability\n';
    writeFileSync(targetPath, localBody, 'utf8');

    const report = syncBuiltinSkillManifests(root);

    expect(report.keptLocal).toContain('observability');
    expect(readFileSync(targetPath, 'utf8')).toBe(localBody);
  });

  it('persists and preserves an authored builtin profile with manifest provenance', () => {
    const root = initializedRoot();

    const first = syncBuiltinSkillManifests(root);
    expect(first.created).toContain('deckent-hermetic-testing');
    const targetPath = join(
      root,
      '.deckent',
      'skills',
      'deckent-hermetic-testing',
      'manifest.json',
    );
    const firstBytes = readFileSync(targetPath, 'utf8');
    const persisted = JSON.parse(firstBytes) as Record<string, unknown>;
    expect(persisted.profile).toMatchObject({
      profileVersion: 3,
      domains: [{ id: 'testing', proficiency: 'primary' }],
    });
    expect(persisted.profileProvenance).toMatchObject({
      origin: 'manifest-profile',
      derivationVersion: 2,
    });

    const second = syncBuiltinSkillManifests(root);
    expect(second.unchanged).toContain('deckent-hermetic-testing');
    expect(readFileSync(targetPath, 'utf8')).toBe(firstBytes);
  });

  it('does not overwrite a project-authored manifest with a builtin of the same id', () => {
    const root = initializedRoot();
    const targetDir = join(root, '.deckent', 'skills', 'api-design');
    mkdirSync(targetDir, { recursive: true });
    const authored = JSON.stringify({
      id: 'api-design', name: 'Local API Design', version: '1.0.0', source: 'project',
    }, null, 2) + '\n';
    writeFileSync(join(targetDir, 'manifest.json'), authored, 'utf8');

    const report = syncBuiltinSkillManifests(root);

    expect(report.keptLocal).toContain('api-design');
    expect(readFileSync(join(targetDir, 'manifest.json'), 'utf8')).toBe(authored);
  });

  it('repairs a stale builtin observability manifest while preserving disabled state', () => {
    const root = initializedRoot();
    const targetDir = join(root, '.deckent', 'skills', 'observability');
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, 'manifest.json'), JSON.stringify({
      id: 'observability',
      name: 'Observability',
      version: '0.1.0',
      source: 'builtin',
      enabled: false,
      builtinContentHash: 'sha256:stale',
      profile: { profileVersion: 1, domains: ['broken'] },
      profileProvenance: {
        origin: 'derived-profile',
        derivationVersion: 1,
      },
    }, null, 2) + '\n', 'utf8');

    const first = syncBuiltinSkillManifests(root);
    expect(first.updated).toContain('observability');

    const repaired = JSON.parse(readFileSync(
      join(targetDir, 'manifest.json'),
      'utf8',
    )) as Record<string, unknown>;
    expect(repaired.enabled).toBe(false);
    expect(repaired.builtinContentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(repaired.profileProvenance).toMatchObject({
      origin: 'derived-profile',
      derivationVersion: 2,
    });
    expect(repaired.profile).toMatchObject({ profileVersion: 3 });
    expect(readFileSync(join(targetDir, 'SKILL.md'), 'utf8')).toBe(readFileSync(
      join('src', 'core', 'builtins', 'skills', 'observability', 'SKILL.md'),
      'utf8',
    ));

    const repairedBytes = readFileSync(join(targetDir, 'manifest.json'), 'utf8');
    const second = syncBuiltinSkillManifests(root);
    expect(changedCount(second)).toBe(0);
    expect(second.unchanged).toContain('observability');
    expect(readFileSync(join(targetDir, 'manifest.json'), 'utf8')).toBe(repairedBytes);
  });

  it('reports dry-run changes without writing manifests', () => {
    const root = initializedRoot();

    const report = syncBuiltinSkillManifests(root, { dryRun: true });

    expect(changedCount(report)).toBeGreaterThan(0);
    expect(() => readFileSync(
      join(root, '.deckent', 'skills', 'observability', 'manifest.json'),
      'utf8',
    )).toThrow();
  });
});
