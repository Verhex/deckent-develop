/**
 * init.ts npm-publish compatibility — real publish-compat regression guards.
 *
 * (323-030 / C5 dead-test cleanup) This file previously carried 8 tautological
 * tests — five `expect(true).toBe(true)` placeholders and three assertions on
 * mocks that were never invoked (the init command was never actually run, so
 * `expect(writeFileSync).not.toHaveBeenCalled()` was trivially true). They
 * provided ZERO coverage and were removed along with their now-unused module
 * mocks. The assertions below test REAL publish-compat properties of the shipped
 * package and the path-resolution mechanism that makes the binary work from
 * `dist/` after `npm install`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECKENT_VERSION } from '../../src/core/constants.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readPkg = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8')) as Record<string, unknown>;

describe('init.ts npm publish compatibility', () => {
  it('package.json files field includes dist and LICENSE', () => {
    const files = readPkg().files as string[];
    expect(files).toContain('dist');
    expect(files).toContain('LICENSE');
  });

  it('bin entry points to dist/cli/entry.js', () => {
    const bin = readPkg().bin as { deckent: string };
    expect(bin.deckent).toBe('./dist/cli/entry.js');
  });

  it('DECKENT_VERSION resolves to the real package version (install-path, not the 0.0.0 fallback)', () => {
    // Behaviour guard: constants.ts resolves the version via the INSTALL path, so
    // it must equal package.json's version. If resolution broke (e.g. CWD-relative
    // with a wrong path), the IIFE's catch returns '0.0.0' — which would not match.
    expect(DECKENT_VERSION).toBe(readPkg().version);
  });

  it('constants.ts resolves DECKENT_VERSION via import.meta.url, never process.cwd()', () => {
    // Source guard for the mechanism behind the test above: from dist/ after
    // npm install the version must resolve relative to the installed file.
    const src = readFileSync(join(repoRoot, 'src', 'core', 'constants.ts'), 'utf-8');
    const start = src.indexOf('DECKENT_VERSION');
    const versionBlock = src.slice(start, start + 320);
    expect(versionBlock).toContain('fileURLToPath(import.meta.url)');
    expect(versionBlock).not.toContain('process.cwd()');
  });

  it('init.ts constructs paths with join(), never from process.cwd()', () => {
    const src = readFileSync(join(repoRoot, 'src', 'cli', 'commands', 'init.ts'), 'utf-8');
    expect(src).toContain('join(');
    expect(src).not.toContain('process.cwd()');
  });
});
