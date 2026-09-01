/**
 * tests/release/release-prepare.test.ts — Sprint 414 task 414-002 (RC4B, REL-03/04).
 *
 * Covers: (1) the exported pure functions of scripts/release-prepare.mjs, hermetically; (2) a
 * real-binary round-trip against a tmpdir COPY of the actual package.json/npm-shrinkwrap.json/
 * CHANGELOG.md (never the real repo files — test-hermeticity rule), proving package.json +
 * npm-shrinkwrap.json (both version fields) + CHANGELOG.md are prevalidated together and prerelease
 * metadata survives; (3) that the script never tags/pushes/publishes; (4) the retired
 * scripts/bump-version.sh stub; (5) the two-file changelog-canonicity role-banners + the MRR text
 * fix in the REAL root CHANGELOG.md; (6) a regression pin that validateChangelogSectionFormat
 * accepts the real root CHANGELOG.md's current [0.100.0] section — the exact-anchor contract
 * .github/workflows/release.yml's extractor (and any future parser) relies on.
 *
 * Async child process only (no spawnSync — would freeze the vitest worker's heartbeat RPC), all mutable
 * fixtures under os.tmpdir(), cleaned up in afterEach.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import {
  closeSync,
  copyFileSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseVersionArg,
  applyVersionToPackageJson,
  applyVersionToNpmShrinkwrap,
  validateChangelogSectionFormat,
  buildChangelogSectionSkeleton,
  insertChangelogSection,
  prepareRelease,
} from '../../scripts/release-prepare.mjs';

const PROJECT_ROOT = join(__dirname, '../../');
const RELEASE_PREPARE_PATH = join(PROJECT_ROOT, 'scripts', 'release-prepare.mjs');
const BUMP_VERSION_PATH = join(PROJECT_ROOT, 'scripts', 'bump-version.sh');
const ROOT_CHANGELOG_PATH = join(PROJECT_ROOT, 'CHANGELOG.md');
const DOCS_CHANGELOG_PATH = join(PROJECT_ROOT, 'docs', 'archive', 'docs-pre-reset-2026-08-03', 'CHANGELOG.md');

const tmpDirs: string[] = [];

function makeTmpFixtureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'release-prepare-test-'));
  tmpDirs.push(dir);
  copyFileSync(join(PROJECT_ROOT, 'package.json'), join(dir, 'package.json'));
  copyFileSync(join(PROJECT_ROOT, 'npm-shrinkwrap.json'), join(dir, 'npm-shrinkwrap.json'));
  copyFileSync(ROOT_CHANGELOG_PATH, join(dir, 'CHANGELOG.md'));
  return dir;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

// ASYNC subprocess runner — never spawnSync (see file header + scripts/scripts.test.ts precedent).
function runExecutableAsync(
  executable: string,
  args: string[],
  timeoutMs = 15000,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const releasePrepareEnv = { ...process.env };
  for (const name of [
    'DECKENT_TEST_HERMETICITY',
    'NODE_CHANNEL_FD',
    'NODE_CHANNEL_SERIALIZATION_MODE',
    'VITEST',
    'VITEST_POOL_ID',
    'VITEST_WORKER_ID',
  ]) {
    delete releasePrepareEnv[name];
  }
  const captureDir = mkdtempSync(join(tmpdir(), 'release-prepare-output-'));
  tmpDirs.push(captureDir);
  const stdoutPath = join(captureDir, 'stdout.txt');
  const stderrPath = join(captureDir, 'stderr.txt');
  const stdoutFd = openSync(stdoutPath, 'w');
  const stderrFd = openSync(stderrPath, 'w');
  return new Promise((resolvePromise) => {
    const child = spawn(executable, args, {
      cwd: PROJECT_ROOT,
      env: releasePrepareEnv,
      stdio: ['ignore', stdoutFd, stderrFd],
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      closeSync(stdoutFd);
      closeSync(stderrFd);
      const stdout = readFileSync(stdoutPath, 'utf8');
      const stderr = readFileSync(stderrPath, 'utf8');
      resolvePromise({
        code: timedOut ? null : code,
        stdout,
        stderr: timedOut ? `${stderr}\n[timeout]` : stderr,
      });
    });
  });
}

function runNodeScriptAsync(
  args: string[],
  timeoutMs = 15000,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return runExecutableAsync(
    process.execPath,
    [RELEASE_PREPARE_PATH, ...args],
    timeoutMs,
  );
}

function runBashScriptAsync(
  scriptPath: string,
  args: string[],
  timeoutMs = 15000,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return runExecutableAsync('bash', [scriptPath, ...args], timeoutMs);
}

// ─── parseVersionArg ─────────────────────────────────────────────────────────

describe('parseVersionArg', () => {
  it('accepts a bare semver', () => {
    expect(parseVersionArg('1.2.3')).toBe('1.2.3');
  });

  it('strips a leading v/V', () => {
    expect(parseVersionArg('v1.2.3')).toBe('1.2.3');
    expect(parseVersionArg('V1.2.3')).toBe('1.2.3');
  });

  it('preserves prerelease metadata', () => {
    expect(parseVersionArg('v1.0.0-beta.1')).toBe('1.0.0-beta.1');
  });

  it('preserves build metadata', () => {
    expect(parseVersionArg('1.2.3+build.42')).toBe('1.2.3+build.42');
  });

  it('preserves combined prerelease+build metadata', () => {
    expect(parseVersionArg('v1.2.3-rc.1+build.7')).toBe('1.2.3-rc.1+build.7');
  });

  it('rejects a missing version', () => {
    expect(() => parseVersionArg(undefined as unknown as string)).toThrow(/required/);
  });

  it('rejects a malformed version', () => {
    expect(() => parseVersionArg('not-a-version')).toThrow(/not a valid semver/);
    expect(() => parseVersionArg('1.2')).toThrow(/not a valid semver/);
    expect(() => parseVersionArg('1.2.3.4')).toThrow(/not a valid semver/);
  });
});

// ─── applyVersionToPackageJson / applyVersionToNpmShrinkwrap ────────────────

describe('applyVersionToPackageJson', () => {
  it('updates only the version field, preserving everything else', () => {
    const original = JSON.stringify({ name: 'x', version: '1.0.0', dependencies: { foo: '^1.0.0' } }, null, 2);
    const updated = applyVersionToPackageJson(`${original}\n`, '2.0.0');
    const parsed = JSON.parse(updated);
    expect(parsed.version).toBe('2.0.0');
    expect(parsed.name).toBe('x');
    expect(parsed.dependencies.foo).toBe('^1.0.0');
    expect(updated.endsWith('\n')).toBe(true);
  });
});

describe('applyVersionToNpmShrinkwrap', () => {
  it('updates BOTH the top-level version and packages[""].version', () => {
    const original = JSON.stringify(
      {
        name: 'x',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {
          '': { name: 'x', version: '1.0.0', dependencies: {} },
          'node_modules/foo': { version: '1.0.0' },
        },
      },
      null,
      2,
    );
    const updated = applyVersionToNpmShrinkwrap(`${original}\n`, '2.0.0');
    const parsed = JSON.parse(updated);
    expect(parsed.version).toBe('2.0.0');
    expect(parsed.packages[''].version).toBe('2.0.0');
    // Nested dependency versions must NOT be touched — only the root package's two fields.
    expect(parsed.packages['node_modules/foo'].version).toBe('1.0.0');
  });

  it('round-trips the REAL npm-shrinkwrap.json touching only the two root version fields', () => {
    const realShrinkwrap = readFileSync(join(PROJECT_ROOT, 'npm-shrinkwrap.json'), 'utf-8');
    const updated = applyVersionToNpmShrinkwrap(realShrinkwrap, '9.9.9-diff-check.1');
    const originalLines = realShrinkwrap.split('\n');
    const updatedLines = updated.split('\n');
    const changedLines = updatedLines.filter((line, i) => line !== originalLines[i]);
    expect(changedLines.length).toBe(2);
    expect(changedLines.every((l) => l.includes('9.9.9-diff-check.1'))).toBe(true);
  });
});

// ─── validateChangelogSectionFormat ──────────────────────────────────────────

describe('validateChangelogSectionFormat', () => {
  it('accepts a singular, non-empty, well-headed section', () => {
    const content = '# Changelog\n\n## [1.2.3] — 2026-01-01\n\n### Added\n\n- thing\n\n---\n\n## [1.2.2] — 2025-12-01\n';
    const result = validateChangelogSectionFormat(content, '1.2.3');
    expect(result.ok).toBe(true);
    expect(result.matchCount).toBe(1);
  });

  it('rejects a missing section', () => {
    const content = '# Changelog\n\n## [1.2.2] — 2025-12-01\n\n### Added\n\n- thing\n';
    const result = validateChangelogSectionFormat(content, '1.2.3');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no heading/);
  });

  it('rejects duplicate headings for the same version', () => {
    const content = '# Changelog\n\n## [1.2.3] — 2026-01-01\n\n- a\n\n## [1.2.3] — 2026-01-02\n\n- b\n';
    const result = validateChangelogSectionFormat(content, '1.2.3');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/duplicate/);
    expect(result.matchCount).toBe(2);
  });

  it('rejects an empty section body', () => {
    const content = '# Changelog\n\n## [1.2.3] — 2026-01-01\n\n## [1.2.2] — 2025-12-01\n\n- thing\n';
    const result = validateChangelogSectionFormat(content, '1.2.3');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/empty/);
  });

  it('does not prefix-match a longer sprint-suffixed heading (the exact bug REL-03 fixed)', () => {
    const content = '# Changelog\n\n## [0.100.0-sprint413] — 2026-07-11\n\n### Added\n\n- x\n';
    const result = validateChangelogSectionFormat(content, '0.100.0');
    expect(result.ok).toBe(false);
  });

  it('regression pin: the REAL root CHANGELOG.md current [0.100.0] section satisfies the contract', () => {
    const content = readFileSync(ROOT_CHANGELOG_PATH, 'utf-8');
    const result = validateChangelogSectionFormat(content, '0.100.0');
    expect(result.ok).toBe(true);
  });
});

// ─── buildChangelogSectionSkeleton / insertChangelogSection ─────────────────

describe('buildChangelogSectionSkeleton + insertChangelogSection', () => {
  it('produces a section that itself passes validateChangelogSectionFormat', () => {
    const section = buildChangelogSectionSkeleton('3.4.5', '2026-08-01');
    const inserted = insertChangelogSection('# Changelog\n\n> banner\n\n## [3.4.4] — 2026-07-01\n\nold\n', section);
    const result = validateChangelogSectionFormat(inserted, '3.4.5');
    expect(result.ok).toBe(true);
  });

  it('inserts before the first existing heading, preserving older sections untouched', () => {
    const section = buildChangelogSectionSkeleton('3.4.5', '2026-08-01');
    const before = '# Changelog\n\n> banner\n\n## [3.4.4] — 2026-07-01\n\nold content\n';
    const inserted = insertChangelogSection(before, section);
    expect(inserted.indexOf('[3.4.5]')).toBeLessThan(inserted.indexOf('[3.4.4]'));
    expect(inserted).toContain('old content');
    expect(inserted.startsWith('# Changelog')).toBe(true);
  });
});

// ─── prepareRelease (in-process, tmpdir fixture) ─────────────────────────────

describe('prepareRelease', () => {
  it('errors honestly when a required file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-prepare-missing-'));
    tmpDirs.push(dir);
    const result = prepareRelease({ version: '1.2.3', root: dir });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/missing required file/);
  });

  it('refuses to create a duplicate section for an already-present version', () => {
    const dir = makeTmpFixtureDir();
    const first = prepareRelease({ version: '9.9.9-dup.1', root: dir, today: '2026-08-01' });
    expect(first.ok).toBe(true);
    const second = prepareRelease({ version: '9.9.9-dup.1', root: dir, today: '2026-08-02' });
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/already has a section/);
  });

  it('dry-run leaves all three files byte-for-byte unchanged', () => {
    const dir = makeTmpFixtureDir();
    const before = {
      pkg: readFileSync(join(dir, 'package.json'), 'utf-8'),
      shrinkwrap: readFileSync(join(dir, 'npm-shrinkwrap.json'), 'utf-8'),
      changelog: readFileSync(join(dir, 'CHANGELOG.md'), 'utf-8'),
    };
    const result = prepareRelease({ version: '9.9.9-dry.1', root: dir, dryRun: true, today: '2026-08-01' });
    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(readFileSync(join(dir, 'package.json'), 'utf-8')).toBe(before.pkg);
    expect(readFileSync(join(dir, 'npm-shrinkwrap.json'), 'utf-8')).toBe(before.shrinkwrap);
    expect(readFileSync(join(dir, 'CHANGELOG.md'), 'utf-8')).toBe(before.changelog);
  });
});

// ─── Real-binary round-trip (proof-of-function) ──────────────────────────────

describe('release-prepare.mjs CLI — real-binary round-trip on a tmpdir copy-fixture', () => {
  it('updates package.json + npm-shrinkwrap.json (both version fields) + CHANGELOG.md in sync, prerelease preserved', async () => {
    const dir = makeTmpFixtureDir();
    const version = '9.9.9-e2e.1';
    const { code, stdout } = await runNodeScriptAsync(['--version', version, '--root', dir]);
    expect(code).toBe(0);
    expect(stdout).toContain('release-prepare complete');

    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
    const shrinkwrap = JSON.parse(readFileSync(join(dir, 'npm-shrinkwrap.json'), 'utf-8'));
    const changelog = readFileSync(join(dir, 'CHANGELOG.md'), 'utf-8');

    expect(pkg.version).toBe(version);
    expect(shrinkwrap.version).toBe(version);
    expect(shrinkwrap.packages[''].version).toBe(version);
    expect(validateChangelogSectionFormat(changelog, version).ok).toBe(true);
    expect(changelog).toContain(`## [${version}]`);
  });

  it('--dry-run performs zero writes against the real-shaped fixture', async () => {
    const dir = makeTmpFixtureDir();
    const before = readFileSync(join(dir, 'package.json'), 'utf-8');
    const { code, stdout } = await runNodeScriptAsync(['--version', '9.9.9-drycli.1', '--root', dir, '--dry-run']);
    expect(code).toBe(0);
    expect(stdout).toContain('Dry-run');
    expect(readFileSync(join(dir, 'package.json'), 'utf-8')).toBe(before);
  });

  it('a second invocation for the same version exits 1 and does not corrupt the files', async () => {
    const dir = makeTmpFixtureDir();
    const version = '9.9.9-repeat.1';
    const first = await runNodeScriptAsync(['--version', version, '--root', dir]);
    expect(first.code).toBe(0);
    const afterFirst = readFileSync(join(dir, 'CHANGELOG.md'), 'utf-8');

    const second = await runNodeScriptAsync(['--version', version, '--root', dir]);
    expect(second.code).toBe(1);
    expect(second.stderr).toMatch(/already has a section/);
    expect(readFileSync(join(dir, 'CHANGELOG.md'), 'utf-8')).toBe(afterFirst);
  });

  it('missing --version prints usage and exits 1', async () => {
    const dir = makeTmpFixtureDir();
    const { code, stderr } = await runNodeScriptAsync(['--root', dir]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/Usage:/);
  });

  it('an invalid semver exits 1 with a clear error, no writes', async () => {
    const dir = makeTmpFixtureDir();
    const before = readFileSync(join(dir, 'package.json'), 'utf-8');
    const { code, stderr } = await runNodeScriptAsync(['--version', 'nope', '--root', dir]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/not a valid semver/);
    expect(readFileSync(join(dir, 'package.json'), 'utf-8')).toBe(before);
  });

  it('never tags, pushes, or publishes — source never imports child_process, so it cannot shell out at all', () => {
    // The script only ever mentions "git tag" / "git push" / "npm publish" inside its own
    // console.log next-steps guidance strings (asserted below) — never executes them. The
    // strongest proof of that is the absence of ANY subprocess-execution capability whatsoever.
    const source = readFileSync(RELEASE_PREPARE_PATH, 'utf-8');
    expect(source).not.toMatch(/execSync|spawnSync|spawn\(|child_process/);
  });

  it('next-steps guidance is owner-manual publish (no tag-triggered publish, no --provenance)', async () => {
    const dir = makeTmpFixtureDir();
    const { stdout } = await runNodeScriptAsync(['--version', '9.9.9-guidance.1', '--root', dir]);
    expect(stdout).toMatch(/does NOT create git tags, push, or publish/);
    expect(stdout).toContain('npm publish --access public --ignore-scripts');
    // The publish COMMAND carries no --provenance (the guidance may still say "no --provenance").
    expect(stdout).not.toMatch(/npm publish[^\n]*--provenance/);
    expect(stdout).not.toMatch(/pushing the tag triggers[^\n]*publish/i);
  });
});

// ─── bump-version.sh retire-stub ─────────────────────────────────────────────

describe('bump-version.sh — retire-stub', () => {
  it('exits 1 and points to release-prepare.mjs, regardless of args', async () => {
    const { code, stderr } = await runBashScriptAsync(BUMP_VERSION_PATH, ['patch', '--dry-run']);
    expect(code).toBe(1);
    expect(stderr).toMatch(/retired/i);
    expect(stderr).toContain('release-prepare.mjs');
  });

  it('is NOT deleted and still carries its shebang', () => {
    const content = readFileSync(BUMP_VERSION_PATH, 'utf-8');
    expect(content.startsWith('#!/bin/bash')).toBe(true);
    expect(content).toMatch(/RETIRED/);
  });
});

// ─── Changelog canonicity role-banners (real files) ──────────────────────────

describe('CHANGELOG canonicity role-banners (real files)', () => {
  it('root CHANGELOG.md declares itself canonical and no longer defers to docs/ for "the full changelog"', () => {
    const content = readFileSync(ROOT_CHANGELOG_PATH, 'utf-8');
    expect(content.startsWith('# Changelog')).toBe(true);
    expect(content).toMatch(/[Cc]anonical/);
    expect(content).not.toMatch(/for the full changelog/i);
  });

  it('docs/CHANGELOG.md declares itself an auto-generated per-sprint log, not release notes', () => {
    const content = readFileSync(DOCS_CHANGELOG_PATH, 'utf-8');
    expect(content.startsWith('# Changelog')).toBe(true);
    expect(content).toMatch(/[Aa]uto-generated/);
    expect(content).toMatch(/not.*release notes|release notes.*not/i);
  });

  it('root CHANGELOG.md MRR bullet reflects the scheduler-truth born-610 correction', () => {
    const content = readFileSync(ROOT_CHANGELOG_PATH, 'utf-8');
    expect(content).toMatch(/born-610/);
    expect(content).toMatch(/terminal-non-satisfying/);
  });
});
