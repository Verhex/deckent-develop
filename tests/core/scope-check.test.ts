/**
 * ADR-D-004 SCOPECHECK-CORE (Sprint 353 Task 353-001)
 *
 * Direct unit coverage of the canonical realpath-based scope-containment
 * primitive now living in src/core/scope-check.ts — single source for
 * src/orchestra/authority-enforcer.ts's `isWithinScope` and
 * src/core/tool-scope-gate.ts's `resolveContainment` (previously two
 * independent duplicates, ADR-G-017 SYMLINK-AUTHORITY-WIRE).
 *
 * Hermetic: all fixtures live under a fresh `os.tmpdir()` directory created
 * in `beforeEach` and removed in `afterEach`. No project-root files are read.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  normalizePath,
  resolveRealPath,
  resolveContainment,
  isWithinScope,
} from '../../src/core/scope-check.js';

let projectRoot: string;
let outsideRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'scope-check-project-'));
  outsideRoot = mkdtempSync(join(tmpdir(), 'scope-check-outside-'));

  mkdirSync(join(projectRoot, 'src', 'core'), { recursive: true });
  mkdirSync(join(projectRoot, 'src', 'orchestra'), { recursive: true });
  mkdirSync(join(projectRoot, 'src', 'cli'), { recursive: true });
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
  rmSync(outsideRoot, { recursive: true, force: true });
});

// ═══ normalizePath ═══════════════════════════════════════════════════

describe('normalizePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('src\\core\\config.ts')).toBe('src/core/config.ts');
  });

  it('strips a trailing slash', () => {
    expect(normalizePath('src/core/')).toBe('src/core');
  });
});

// ═══ resolveRealPath ═════════════════════════════════════════════════

describe('resolveRealPath', () => {
  it('resolves an existing path to its real path', () => {
    const realFile = join(projectRoot, 'src', 'core', 'config.ts');
    writeFileSync(realFile, 'export const x = 1;\n');

    const resolved = resolveRealPath(realFile);
    expect(resolved).not.toBeNull();
    expect(resolved).toContain('src/core/config.ts');
  });

  it('walks up to the nearest existing parent for a non-existent nested path', () => {
    const resolved = resolveRealPath(join(projectRoot, 'src', 'core', 'brand-new', 'x.ts'));
    expect(resolved).not.toBeNull();
    expect(resolved).toContain('src/core/brand-new/x.ts');
  });

  it('follows a symlink to its real (out-of-scope) target', () => {
    const secretFile = join(outsideRoot, 'secret.ts');
    writeFileSync(secretFile, 'export const secret = 1;\n');
    const link = join(projectRoot, 'src', 'core', 'link.ts');
    symlinkSync(secretFile, link);

    const resolved = resolveRealPath(link);
    expect(resolved).not.toBeNull();
    expect(resolved).not.toContain(projectRoot.split('\\').join('/'));
  });

  it('returns null on a symlink cycle', () => {
    const linkA = join(projectRoot, 'cycle-a');
    const linkB = join(projectRoot, 'cycle-b');
    symlinkSync(linkB, linkA);
    symlinkSync(linkA, linkB);

    expect(resolveRealPath(linkA)).toBeNull();
  });
});

// ═══ resolveContainment ══════════════════════════════════════════════

describe('resolveContainment', () => {
  it('allows an ordinary in-scope existing path matched via directory', () => {
    const realFile = join(projectRoot, 'src', 'core', 'thing.ts');
    writeFileSync(realFile, 'export const x = 1;\n');

    const result = resolveContainment('src/core/thing.ts', projectRoot, ['src/core/'], []);

    expect(result.within).toBe(true);
    expect(result.matchedVia).toBe('directory');
  });

  it('allows a new (non-existent) in-scope path — parent-realpath handling', () => {
    const result = resolveContainment(
      'src/core/brand-new/nested/new-file.ts',
      projectRoot,
      ['src/core/'],
      [],
    );

    expect(result.within).toBe(true);
    expect(result.matchedVia).toBe('directory');
  });

  it('allows a new (non-existent) file matched via a filesWrite exact list', () => {
    const result = resolveContainment(
      'src/core/new-module.ts',
      projectRoot,
      [],
      [{ via: 'filesWrite', files: ['src/core/new-module.ts'] }],
    );

    expect(result.within).toBe(true);
    expect(result.matchedVia).toBe('filesWrite');
  });

  it('allows a path matched via a filesRead exact list', () => {
    const result = resolveContainment(
      'src/core/config.ts',
      projectRoot,
      [],
      [{ via: 'filesRead', files: ['src/core/config.ts'] }],
    );

    expect(result.within).toBe(true);
    expect(result.matchedVia).toBe('filesRead');
  });

  it('checks exact lists in order and falls through to directories', () => {
    const result = resolveContainment(
      'src/orchestra/authority-enforcer.ts',
      projectRoot,
      ['src/orchestra/'],
      [{ via: 'filesWrite', files: ['src/core/config.ts'] }],
    );

    expect(result.within).toBe(true);
    expect(result.matchedVia).toBe('directory');
  });

  it('denies a path genuinely outside the declared scope', () => {
    writeFileSync(join(projectRoot, 'src', 'cli', 'entry.ts'), 'export {};\n');

    const result = resolveContainment(
      'src/cli/entry.ts',
      projectRoot,
      ['src/orchestra/'],
      [{ via: 'filesWrite', files: ['src/core/config.ts'] }],
    );

    expect(result.within).toBe(false);
  });

  it('denies every target when no scope is declared (fail-closed)', () => {
    const result = resolveContainment('src/core/anything.ts', projectRoot, [], []);
    expect(result.within).toBe(false);
  });

  it('rejects a symlink inside a directory scope that resolves outside scope', () => {
    const secretFile = join(outsideRoot, 'secret.ts');
    writeFileSync(secretFile, 'export const secret = 1;\n');
    const evilLink = join(projectRoot, 'src', 'core', 'evil-link.ts');
    symlinkSync(secretFile, evilLink);

    const result = resolveContainment('src/core/evil-link.ts', projectRoot, ['src/core/'], []);

    expect(result.within).toBe(false);
  });

  it('rejects a symlink matched via an exact list that resolves outside scope (planted-symlink/TOCTOU)', () => {
    const secretFile = join(outsideRoot, 'secret.ts');
    writeFileSync(secretFile, 'export const secret = 1;\n');
    const evilLink = join(projectRoot, 'src', 'core', 'evil-link.ts');
    symlinkSync(secretFile, evilLink);

    const result = resolveContainment(
      'src/core/evil-link.ts',
      projectRoot,
      [],
      [{ via: 'filesWrite', files: ['src/core/evil-link.ts'] }],
    );

    expect(result.within).toBe(false);
  });

  it('rejects a symlink cycle (ELOOP) instead of throwing', () => {
    const linkA = join(projectRoot, 'src', 'core', 'cycle-a');
    const linkB = join(projectRoot, 'src', 'core', 'cycle-b');
    symlinkSync(linkB, linkA);
    symlinkSync(linkA, linkB);

    expect(() => {
      const result = resolveContainment('src/core/cycle-a/file.ts', projectRoot, ['src/core/'], []);
      expect(result.within).toBe(false);
    }).not.toThrow();
  });
});

// ═══ isWithinScope — authority-enforcer's 2-array call shape ═════════

describe('isWithinScope (scopeDirectories, scopeFilesWrite wrapper)', () => {
  it('rejects a symlink inside scope.directories that resolves outside scope', () => {
    const secretFile = join(outsideRoot, 'secret.ts');
    writeFileSync(secretFile, 'export const secret = 1;\n');
    const evilLink = join(projectRoot, 'src', 'orchestra', 'evil-link.ts');
    symlinkSync(secretFile, evilLink);

    const result = isWithinScope('src/orchestra/evil-link.ts', projectRoot, ['src/orchestra/'], []);

    expect(result.within).toBe(false);
  });

  it('rejects a symlink inside scope.filesWrite that resolves outside scope', () => {
    const secretFile = join(outsideRoot, 'secret.ts');
    writeFileSync(secretFile, 'export const secret = 1;\n');
    const evilLink = join(projectRoot, 'src', 'orchestra', 'evil-link.ts');
    symlinkSync(secretFile, evilLink);

    const result = isWithinScope(
      'src/orchestra/evil-link.ts',
      projectRoot,
      [],
      ['src/orchestra/evil-link.ts'],
    );

    expect(result.within).toBe(false);
  });

  it('allows an ordinary in-scope path with no symlink involved', () => {
    const realFile = join(projectRoot, 'src', 'orchestra', 'authority-enforcer.ts');
    writeFileSync(realFile, 'export const x = 1;\n');

    const result = isWithinScope('src/orchestra/authority-enforcer.ts', projectRoot, ['src/orchestra/'], []);

    expect(result.within).toBe(true);
    expect(result.matchedVia).toBe('directory');
  });

  it('allows a new (non-existent) file matched via scope.filesWrite', () => {
    const result = isWithinScope(
      'src/orchestra/new-module.ts',
      projectRoot,
      [],
      ['src/orchestra/new-module.ts'],
    );

    expect(result.within).toBe(true);
    expect(result.matchedVia).toBe('filesWrite');
  });

  it('denies a path genuinely outside assigned scope', () => {
    writeFileSync(join(projectRoot, 'src', 'cli', 'entry.ts'), 'export {};\n');

    const result = isWithinScope('src/cli/entry.ts', projectRoot, ['src/orchestra/'], ['src/core/config.ts']);

    expect(result.within).toBe(false);
  });
});
