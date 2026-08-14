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
    const lock = JSON.parse(read('package-lock.json')) as { version: string; packages: Record<string, { version?: string }> };
    expect(lock.version).toBe('0.100.0');
    expect(lock.packages['']?.version).toBe('0.100.0');
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
});
