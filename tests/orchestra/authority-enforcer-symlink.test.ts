/**
 * ADR-G-017 SYMLINK-AUTHORITY-WIRE (Sprint 348 Task 003)
 *
 * Regression coverage for the runtime symlink scope-bypass: before this fix,
 * `checkAuthority`'s worker dynamic scope check compared nominal path strings
 * only (`normalizePath` + prefix-match) — a symlink placed inside
 * `scope.filesWrite` / `scope.directories` that resolves outside the scope
 * root passed the check because the real filesystem target was never
 * consulted. `isWithinScope` (authority-enforcer.ts) now resolves the
 * `realpathSync` of both the target and every scope root first.
 *
 * Hermetic: all fixtures live under a fresh `os.tmpdir()` directory created in
 * `beforeEach` and removed in `afterEach`. No project-root files are read.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkAuthority, _testing } from '../../src/orchestra/authority-enforcer.js';

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(() => null),
}));

const { isWithinScope, resolveRealPath } = _testing;

let projectRoot: string;
let outsideRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'authority-symlink-project-'));
  outsideRoot = mkdtempSync(join(tmpdir(), 'authority-symlink-outside-'));

  mkdirSync(join(projectRoot, 'src', 'orchestra'), { recursive: true });
  mkdirSync(join(projectRoot, 'src', 'core'), { recursive: true });
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
  rmSync(outsideRoot, { recursive: true, force: true });
});

// ═══ isWithinScope — direct unit coverage ════════════════════════════

describe('isWithinScope (realpath-based scope containment)', () => {
  it('rejects a symlink inside scope.directories that resolves outside scope (regression: was accepted)', () => {
    const secretFile = join(outsideRoot, 'secret.ts');
    writeFileSync(secretFile, 'export const secret = 1;\n');

    const evilLink = join(projectRoot, 'src', 'orchestra', 'evil-link.ts');
    symlinkSync(secretFile, evilLink);

    const result = isWithinScope(
      'src/orchestra/evil-link.ts',
      projectRoot,
      ['src/orchestra/'],
      [],
    );

    expect(result.within).toBe(false);
  });

  it('rejects a symlink inside scope.filesWrite that resolves outside scope (regression: was accepted)', () => {
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

    const result = isWithinScope(
      'src/orchestra/authority-enforcer.ts',
      projectRoot,
      ['src/orchestra/'],
      [],
    );

    expect(result.within).toBe(true);
    expect(result.matchedVia).toBe('directory');
  });

  it('allows a new (non-existent) in-scope file path — parent-realpath handling', () => {
    // Neither the file nor any intermediate directory below scope root exists yet.
    const result = isWithinScope(
      'src/orchestra/brand-new/nested/new-file.ts',
      projectRoot,
      ['src/orchestra/'],
      [],
    );

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
    mkdirSync(join(projectRoot, 'src', 'cli'), { recursive: true });
    writeFileSync(join(projectRoot, 'src', 'cli', 'entry.ts'), 'export {};\n');

    const result = isWithinScope(
      'src/cli/entry.ts',
      projectRoot,
      ['src/orchestra/'],
      ['src/core/config.ts'],
    );

    expect(result.within).toBe(false);
  });

  it('rejects a symlink cycle (ELOOP) instead of throwing', () => {
    const linkA = join(projectRoot, 'src', 'orchestra', 'cycle-a');
    const linkB = join(projectRoot, 'src', 'orchestra', 'cycle-b');
    symlinkSync(linkB, linkA);
    symlinkSync(linkA, linkB);

    expect(() => {
      const result = isWithinScope(
        'src/orchestra/cycle-a/file.ts',
        projectRoot,
        ['src/orchestra/'],
        [],
      );
      expect(result.within).toBe(false);
    }).not.toThrow();
  });
});

// ═══ resolveRealPath — direct unit coverage ══════════════════════════

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

// ═══ checkAuthority — end-to-end wiring through checkPathAuthority ═══

describe('checkAuthority — worker scope check wired through isWithinScope', () => {
  it('rejects a worker write to a symlink inside scope.directories resolving outside scope', () => {
    const secretFile = join(outsideRoot, 'secret.ts');
    writeFileSync(secretFile, 'export const secret = 1;\n');
    symlinkSync(secretFile, join(projectRoot, 'src', 'orchestra', 'evil-link.ts'));

    const result = checkAuthority({
      role: 'worker',
      action: 'write',
      target: 'src/orchestra/evil-link.ts',
      taskId: '348-003',
      scopeDirectories: ['src/orchestra/'],
      scopeFilesWrite: [],
      projectRoot,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('scope violation');
  });

  it('permits an ordinary in-scope write with an explicit projectRoot', () => {
    writeFileSync(join(projectRoot, 'src', 'orchestra', 'authority-enforcer.ts'), 'export {};\n');

    const result = checkAuthority({
      role: 'worker',
      action: 'write',
      target: 'src/orchestra/authority-enforcer.ts',
      taskId: '348-003',
      scopeDirectories: ['src/orchestra/'],
      scopeFilesWrite: [],
      projectRoot,
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('Worker scope');
  });

  it('permits creating a brand-new in-scope file with an explicit projectRoot', () => {
    const result = checkAuthority({
      role: 'worker',
      action: 'write',
      target: 'src/orchestra/not-created-yet.ts',
      taskId: '348-003',
      scopeDirectories: ['src/orchestra/'],
      scopeFilesWrite: [],
      projectRoot,
    });

    expect(result.allowed).toBe(true);
  });

  it('falls back to process.cwd() when projectRoot is omitted (backward-compatible default)', () => {
    // Uses the real repo checkout (this test file's own project root) — proves
    // existing callers that never pass projectRoot keep working unmodified.
    const result = checkAuthority({
      role: 'worker',
      action: 'write',
      target: 'src/orchestra/authority-enforcer.ts',
      taskId: '348-003',
      scopeDirectories: ['src/orchestra/'],
      scopeFilesWrite: [],
    });

    expect(result.allowed).toBe(true);
  });
});
