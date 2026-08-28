import { describe, expect, it } from 'vitest';
import {
  CANONICAL_SCOPE_MANIFEST_VERSION,
  compileCanonicalScope,
} from '../../src/core/execution-write-scope-policy.js';

describe('compileCanonicalScope', () => {
  it('produces a deterministic versioned exact manifest and removes write overlap from reads', () => {
    const scope = {
      directories: ['src\\core'],
      filesRead: ['src/core/a.ts', './src/core/b.ts'],
      filesWrite: ['src/core/a.ts'],
    };
    const first = compileCanonicalScope({ scope, inventory: ['src/core/b.ts', 'src/core/a.ts'] });
    const second = compileCanonicalScope({ scope, inventory: ['src/core/a.ts', 'src/core/b.ts'] });
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.manifest.version).toBe(CANONICAL_SCOPE_MANIFEST_VERSION);
    expect(first.manifest.scope).toEqual({
      directories: ['src/core'],
      filesRead: ['src/core/b.ts'],
      filesWrite: ['src/core/a.ts'],
    });
    expect(first.manifest.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.manifest.policyDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it.each([
    ['src/**/*.ts', 'LEGACY_WILDCARD_REQUIRES_SELECTOR'],
    ['../escape.ts', 'INVALID_PATH'],
    ['/rooted.ts', 'INVALID_PATH'],
    ['C:\\repo\\x.ts', 'INVALID_PATH'],
    ['//server/share.ts', 'INVALID_PATH'],
  ])('holds unsafe legacy path %s with typed evidence', (path, code) => {
    const result = compileCanonicalScope({
      scope: { directories: [], filesRead: [], filesWrite: [path] },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.holds[0]?.code).toBe(code);
  });

  it('holds case-fold inventory collisions and declared symlink ambiguity', () => {
    const collision = compileCanonicalScope({
      scope: { directories: [], filesRead: [], filesWrite: ['src/A.ts'] },
      inventory: ['src/A.ts', 'src/a.ts'],
    });
    expect(collision.ok).toBe(false);
    if (!collision.ok) expect(collision.holds.some(hold => hold.code === 'PORTABLE_PATH_COLLISION')).toBe(true);

    const symlink = compileCanonicalScope({
      scope: { directories: [], filesRead: ['src/link.ts'], filesWrite: [] },
      ambiguousSymlinks: ['src/link.ts'],
    });
    expect(symlink.ok).toBe(false);
    if (!symlink.ok) expect(symlink.holds[0]?.code).toBe('SYMLINK_AMBIGUITY');
  });

  it('does not widen an unrelated portable collision into the selected scope', () => {
    const scope = {
      directories: ['src/core'],
      filesRead: [],
      filesWrite: ['src/core/a.ts'],
    };
    const first = compileCanonicalScope({
      scope,
      inventory: ['.github/PULL_REQUEST_TEMPLATE.md', '.github/pull_request_template.md', 'src/core/a.ts'],
    });
    const second = compileCanonicalScope({
      scope,
      inventory: ['src/core/a.ts', '.github/pull_request_template.md', '.github/PULL_REQUEST_TEMPLATE.md'],
    });
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
  });
});

// MASTER 3356 — directory intent in a file field must hold, not miscompile.
//
// `filesWrite: ['src/']` used to compile to `{kind:'exact-file', path:'src'}`:
// the trailing slash was normalized away and the selector then matched only a
// file literally named `src`. A task authored that way appeared to declare a
// write scope while effectively having none, and `src` was still added to the
// attribution list as though it were a written file. The module already refuses
// ambiguous authored input elsewhere (`src/**` holds) — this closes the same
// class instead of guessing what the author meant.
describe('directory intent in a file field', () => {
  it('holds instead of silently compiling a trailing slash to exact-file', () => {
    const result = compileCanonicalScope({
      scope: { directories: [], filesRead: [], filesWrite: ['src/'] },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.holds).toEqual([
      { code: 'DIRECTORY_INTENT_REQUIRES_DIRECTORIES', field: 'filesWrite', value: 'src/' },
    ]);
  });

  it('holds for the read field on the same grounds', () => {
    const result = compileCanonicalScope({
      scope: { directories: [], filesRead: ['docs/'], filesWrite: [] },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.holds[0]?.field).toBe('filesRead');
  });

  // `directories` is the field that genuinely expresses a tree, so the same
  // spelling must keep working there — the hold redirects, it does not forbid.
  it('still accepts the same path in the directories field', () => {
    const result = compileCanonicalScope({
      scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.selectors.directories).toEqual([
      { kind: 'directory-tree', path: 'src' },
    ]);
  });

  it('leaves an ordinary file path untouched', () => {
    const result = compileCanonicalScope({
      scope: { directories: [], filesRead: [], filesWrite: ['src/a.ts'] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.selectors.filesWrite).toEqual([
      { kind: 'exact-file', path: 'src/a.ts' },
    ]);
  });
});
