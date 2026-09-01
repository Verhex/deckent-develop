// tests/release/version-rebaseline.test.ts
//
// Hermetic proofs for the 0.100.0 version + changelog rebaseline (owner package,
// 2026-08-14). The prior `1.0.0-beta.1` version narrative is cancelled; the product
// is re-baselined at `0.100.0`, tagless, with publishing kept owner-manual.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DECKENT_VERSION } from '../../src/core/constants.js';
import { checkChangelogSectionForVersion } from '../../scripts/validate-publish.mjs';
import { isProductSuccessor, compareVersions, RETIRED_BETA_LINEAGE } from '../../src/cli/commands/upgrade.js';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf-8');

// Docs that carry a CURRENT-version claim — must never re-advertise the retired beta.1.
// (Historical surfaces — root CHANGELOG.md's demoted section, the archive, the CLOSURE
// brief's cancellation note — legitimately still contain the string and are NOT checked.)
const CURRENT_VERSION_DOCS = [
  'README.md',
  'README.tr.md',
  'docs/en/overview.md',
  'docs/en/cli.md',
  'docs/en/guide/getting-started.md',
  'docs/en/operations/development-and-release.md',
  'docs/tr/overview.md',
  'docs/tr/cli.md',
  'docs/tr/guide/getting-started.md',
  'docs/tr/operations/development-and-release.md',
];

describe('0.100.0 version rebaseline', () => {
  it('canonical package version is 0.100.0 (#1)', () => {
    const pkg = JSON.parse(read('package.json')) as { version: string };
    expect(pkg.version).toBe('0.100.0');
    const shrinkwrap = JSON.parse(read('npm-shrinkwrap.json')) as { version: string; packages: Record<string, { version?: string }> };
    expect(shrinkwrap.version).toBe('0.100.0');
    expect(shrinkwrap.packages['']?.version).toBe('0.100.0');
    expect(existsSync(join(ROOT, 'package-lock.json'))).toBe(false);
  });

  it('runtime DECKENT_VERSION (CLI --version source) resolves to 0.100.0 (#2)', () => {
    expect(DECKENT_VERSION).toBe('0.100.0');
  });

  it('current-version docs no longer advertise the retired 1.0.0-beta.1 (#4)', () => {
    for (const rel of CURRENT_VERSION_DOCS) {
      expect(read(rel), `${rel} still references 1.0.0-beta.1`).not.toContain('1.0.0-beta.1');
    }
  });

  it('the pre-0.100.0 sprint ledger is archived, not deleted (#5)', () => {
    const archive = 'docs/archive/docs-pre-reset-2026-08-14/CHANGELOG.md';
    expect(existsSync(join(ROOT, archive))).toBe(true);
    const entries = (read(archive).match(/## \[1\.0\.0-beta\.1-sprint/g) || []).length;
    expect(entries).toBeGreaterThanOrEqual(200);
  });

  it('root CHANGELOG.md is the product changelog: has [0.100.0] + [Unreleased] and demotes beta.1 (#6)', () => {
    const cl = read('CHANGELOG.md');
    expect(cl).toMatch(/^## \[0\.100\.0\]/m);
    expect(cl).toContain('## [Unreleased]');
    // beta.1 is retained ONLY as a historical section — never as "(current)".
    expect(cl).not.toContain('1.0.0-beta.1] — 2026-04-22 (current)');
    expect(cl).toMatch(/1\.0\.0-beta\.1\][^\n]*historical/);
  });

  it('the sprint-finalizer changelog automation no longer mints product-version headers (#6b)', () => {
    const updater = read('src/orchestra/doc-updaters/changelog.ts');
    expect(updater).toContain('const versionTag = `sprint${String(sprintNum).padStart(2, \'0\')}`;');
    expect(updater).not.toMatch(/versionTag = `\$\{version\}-sprint/);
  });
});

describe('publish-readiness changelog gate (checkChangelogSectionForVersion)', () => {
  const withFixture = (version: string, changelog: string, fn: (root: string) => void): void => {
    const dir = mkdtempSync(join(tmpdir(), 'v0100-changelog-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'deckent', version }));
      writeFileSync(join(dir, 'CHANGELOG.md'), changelog);
      fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('FAILS a version bump with no matching root-CHANGELOG section (#7)', () => {
    withFixture('0.101.0', '# Changelog\n\n## [0.100.0] — 2026-08-14\n\n### Added\n\n- prior\n', (root) => {
      const r = checkChangelogSectionForVersion(root);
      expect(r.ok).toBe(false);
      expect(r.gate).toBe('changelog_section');
    });
  });

  it('FAILS when the matching section exists but is empty (#7b)', () => {
    withFixture('0.101.0', '# Changelog\n\n## [0.101.0] — 2026-08-15\n\n## [0.100.0] — 2026-08-14\n\n### Added\n\n- prior\n', (root) => {
      expect(checkChangelogSectionForVersion(root).ok).toBe(false);
    });
  });

  it('does NOT prefix-match a sprint-tagged heading (#7c)', () => {
    withFixture('0.100.0', '# Changelog\n\n## [0.100.0-sprint84] — 2026-08-14\n\n### Added\n\n- x\n', (root) => {
      expect(checkChangelogSectionForVersion(root).ok).toBe(false);
    });
  });

  it('PASSES a version bump with a matching, non-empty section (#8)', () => {
    withFixture('0.101.0', '# Changelog\n\n## [0.101.0] — 2026-08-15\n\n### Added\n\n- real notes\n', (root) => {
      const r = checkChangelogSectionForVersion(root);
      expect(r.ok).toBe(true);
    });
  });

  it('PASSES for the repository itself (0.100.0 has a real section) (#8b)', () => {
    expect(checkChangelogSectionForVersion(ROOT).ok).toBe(true);
  });

  it('FAILS on a duplicate version heading — exactly one section required (#7d)', () => {
    withFixture('0.101.0', '# Changelog\n\n## [0.101.0] — 2026-08-15\n\n### Added\n\n- a\n\n## [0.101.0] — 2026-08-16\n\n### Added\n\n- dup\n', (root) => {
      const r = checkChangelogSectionForVersion(root);
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/duplicate/i);
    });
  });
});

describe('retired-lineage upgrade migration (SemVer beta.1 > 0.100.0)', () => {
  it('treats 0.100.0 as a product successor of the retired 1.0.0-beta.1 (upgrade)', () => {
    // SemVer says beta.1 > 0.100.0; the successor policy overrides that for upgrade.
    expect(compareVersions(RETIRED_BETA_LINEAGE, '0.100.0')).toBeGreaterThan(0);
    expect(isProductSuccessor(RETIRED_BETA_LINEAGE, '0.100.0')).toBe(true);
  });

  it('treats a later 0.x (0.101.0) as a successor of 1.0.0-beta.1 too', () => {
    expect(isProductSuccessor(RETIRED_BETA_LINEAGE, '0.101.0')).toBe(true);
    expect(isProductSuccessor('v1.0.0-beta.1', 'v0.101.0')).toBe(true);
  });

  it('does NOT invent a successor for a real downgrade or same-version', () => {
    expect(isProductSuccessor('0.101.0', '0.100.0')).toBe(false); // not the retired lineage
    expect(isProductSuccessor('0.100.0', '0.100.0')).toBe(false);
    // The generic downgrade guard is untouched: 0.101.0 -> 0.100.0 is still "not newer".
    expect(compareVersions('0.101.0', '0.100.0')).toBeGreaterThan(0);
  });

  it('applies ONLY to the exact retired 1.0.0-beta.1 string, never to arbitrary pre-releases', () => {
    expect(isProductSuccessor('1.0.0-beta.2', '0.100.0')).toBe(false);
    expect(isProductSuccessor('2.0.0', '0.100.0')).toBe(false);
    // The 0.x successor must itself be a release at/after the rebaseline floor.
    expect(isProductSuccessor(RETIRED_BETA_LINEAGE, '0.99.0')).toBe(false);
    expect(isProductSuccessor(RETIRED_BETA_LINEAGE, '0.100.0-rc.1')).toBe(false);
  });
});

describe('quickstart installs hermetically (no unpublished/tagless dependency)', () => {
  it('depends on the local repo via file:../.., not a tagless npm range (#3)', () => {
    const q = JSON.parse(read('examples/quickstart/package.json')) as { dependencies?: Record<string, string> };
    expect(q.dependencies?.deckent).toBe('file:../..');
    // A published range on the tagless/unpublished 0.100.0 would break `npm install`.
    expect(q.dependencies?.deckent ?? '').not.toMatch(/^[\^~]?\d/);
  });

  it('the local repo packs to the expected deckent-0.100.0 tarball name (#3b)', () => {
    // file:../.. resolves to this repo; `npm pack` emits `${name}-${version}.tgz`. The REAL
    // pack + tarball validation runs in the clean-worktree `npm run validate:publish` gate.
    const pkg = JSON.parse(read('package.json')) as { name: string; version: string };
    expect(`${pkg.name}-${pkg.version}.tgz`).toBe('deckent-0.100.0.tgz');
  });
});

describe('publishing is owner-manual', () => {
  it('validate:publish never shells out to npm publish (#10)', () => {
    const src = read('scripts/validate-publish.mjs');
    // No executable publish call — only the documented owner-manual note is allowed to name it.
    expect(src).not.toMatch(/execSync\([^)]*npm publish/);
    expect(src).not.toMatch(/spawn\([^)]*['"`]publish['"`]/);
    expect(src).toMatch(/does NOT run `npm publish`/);
  });

  it('the release workflow runs no automatic npm publish and creates no GitHub Release (#9)', () => {
    const wf = read('.github/workflows/release.yml');
    expect(wf).not.toMatch(/run:\s*npm publish/);
    expect(wf).not.toContain('- name: Publish to npm');
    expect(wf).not.toContain('- name: Create GitHub Release');
    expect(wf).not.toMatch(/uses: softprops\/action-gh-release/);
    expect(wf).toMatch(/OWNER-MANUAL/i);
  });

  it('release workflow uses least-privilege permissions and no --provenance (#5)', () => {
    const wf = read('.github/workflows/release.yml');
    expect(wf).toContain('contents: read');
    expect(wf).not.toContain('contents: write');
    expect(wf).not.toContain('id-token: write');
    expect(wf).not.toMatch(/npm publish[^\n]*--provenance/);
  });

  it('release-prepare.mjs documents owner-manual publish (no --provenance, no tag-triggered publish) (#4)', () => {
    const rp = read('scripts/release-prepare.mjs');
    expect(rp).toMatch(/npm publish --access public --ignore-scripts/);
    expect(rp).not.toMatch(/npm publish[^\n]*--provenance/);
    expect(rp).not.toMatch(/pushing the tag triggers[^\n]*publish/i);
    expect(rp).not.toContain('sole publish authority');
  });
});
