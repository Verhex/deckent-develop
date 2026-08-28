// tests/orchestra/canonical-attribution-consumer.test.ts
// MASTER 3356 P3 — the Docker consumer of the compiled scope selectors.
//
// `resolveCanonicalAttributionFiles` is what decides which files a Docker
// attempt is credited with having written, and it is the only production caller
// of `selectorMatches`. Nothing pinned it directly: the selector compiler had
// its own tests and the Docker backend had its own, but the seam between them —
// "a compiled directory-tree selector actually credits the files under it" —
// was unproven. That seam is exactly where a scope silently collapses to
// nothing without any test turning red.
import { describe, expect, it } from 'vitest';

import { compileCanonicalScope } from '../../src/core/execution-write-scope-policy.js';
import { resolveCanonicalAttributionFiles } from '../../src/orchestra/spawn-backend-docker.js';

/** Compile an authored scope the way the spawn path does, or fail loudly. */
function manifestFor(scope: {
  directories?: string[];
  filesRead?: string[];
  filesWrite?: string[];
}) {
  const result = compileCanonicalScope({
    scope: {
      directories: scope.directories ?? [],
      filesRead: scope.filesRead ?? [],
      filesWrite: scope.filesWrite ?? [],
    },
  });
  if (!result.ok) throw new Error(`fixture scope did not compile: ${JSON.stringify(result.holds)}`);
  return result.manifest;
}

describe('canonical attribution consumer (Docker)', () => {
  it('credits an exact-file selector', () => {
    const manifest = manifestFor({ filesWrite: ['src/a.ts'] });
    expect(resolveCanonicalAttributionFiles(manifest, ['src/a.ts', 'src/b.ts']))
      .toEqual(['src/a.ts']);
  });

  // Load-bearing and easy to get wrong: attribution follows WRITE authority, so
  // it reads `selectors.filesWrite` alone. A `directories` entry widens what the
  // task may read and work in; it never turns the tree into written files. A
  // future change that credited directories would silently attribute files the
  // attempt had no authority to write.
  it('does not credit files merely because a directory is in scope', () => {
    const manifest = manifestFor({ directories: ['src'], filesWrite: ['src/a.ts'] });
    expect(resolveCanonicalAttributionFiles(manifest, ['src/a.ts', 'src/nested/b.ts', 'docs/c.md']))
      .toEqual(['src/a.ts']);
  });

  // Consequence of the same rule, pinned so it cannot drift unnoticed: the write
  // field compiles to `exact-file` selectors only, so `selectorMatches`' tree and
  // glob branches are unreachable from this consumer today. If a non-exact
  // selector ever reaches `filesWrite`, attribution semantics need a fresh
  // decision rather than an accidental widening.
  it('compiles the write field to exact-file selectors only', () => {
    const manifest = manifestFor({ directories: ['src'], filesWrite: ['src/a.ts'] });
    expect(manifest.selectors.filesWrite.every(selector => selector.kind === 'exact-file')).toBe(true);
    expect(manifest.selectors.directories).toEqual([{ kind: 'directory-tree', path: 'src' }]);
  });

  it('credits an exact-file selector even when the file is absent from the inventory', () => {
    // A declared write target that produced no inventory entry is still the
    // attempt's declared authority; dropping it would hide a missing write.
    const manifest = manifestFor({ filesWrite: ['src/a.ts'] });
    expect(resolveCanonicalAttributionFiles(manifest, [])).toEqual(['src/a.ts']);
  });

  it('fails closed on a portable path collision rather than crediting one arbitrarily', () => {
    const manifest = manifestFor({ filesWrite: ['src/a.ts'] });
    expect(() => resolveCanonicalAttributionFiles(manifest, ['src/A.ts', 'src/a.ts']))
      .toThrow(/portable attribution path collision/);
  });

  it('credits nothing when the compiled scope selects nothing', () => {
    const manifest = manifestFor({});
    expect(resolveCanonicalAttributionFiles(manifest, ['src/a.ts'])).toEqual([]);
  });
});
