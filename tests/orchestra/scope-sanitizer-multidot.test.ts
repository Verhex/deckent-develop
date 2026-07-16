import { describe, it, expect } from 'vitest';
import { sanitizeScope, hasMultiDotBasename } from '../../src/orchestra/scope-sanitizer.js';

// born-675 live case: 'src/agent/assets/soul.default.md' — Files+Scope qualified even —
// reached sanitizeScope reduced to a bare fragment (soul.default.md / default.md, no
// directory separator) and Rule 5 silently dropped it as "just needs a directory prefix".
// The gate warned correctly (SAN-1); the upstream parser producing the bare fragment was
// the actual bug. sanitizeScope is the last line of defense: a multi-dot compound
// basename (soul.default.md, a.b.c.ts) must survive even bare, while a genuinely
// single-extension unqualified name (init.ts) must keep dropping exactly as before.

describe('scope-sanitizer — born-675 multi-dot basename preservation', () => {
  it('preserves a bare multi-dot basename (soul.default.md) with no warning', () => {
    const result = sanitizeScope(['soul.default.md', 'src/core/config.ts']);
    expect(result.filesWrite).toEqual(['soul.default.md', 'src/core/config.ts']);
    expect(result.warnings).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it('preserves a bare triple-dot basename (a.b.c.ts) with no warning', () => {
    const result = sanitizeScope(['a.b.c.ts', 'src/core/config.ts']);
    expect(result.filesWrite).toEqual(['a.b.c.ts', 'src/core/config.ts']);
    expect(result.warnings).toEqual([]);
  });

  it('directory-prefixed variant is unaffected (no regression — Rule 5 never applied)', () => {
    const result = sanitizeScope(['src/agent/assets/soul.default.md']);
    expect(result.filesWrite).toEqual(['src/agent/assets/soul.default.md']);
    expect(result.warnings).toEqual([]);
  });

  it('mixed batch: multi-dot bare + directory-qualified + genuinely-unqualified single-dot', () => {
    const result = sanitizeScope([
      'soul.default.md',
      'src/agent/assets/soul.default.md',
      'init.ts',
      'src/core/init.ts',
    ]);
    // multi-dot bare preserved, directory variant preserved, genuinely-unqualified
    // single-dot "init.ts" still drops (only its qualified sibling remains)
    expect(result.filesWrite).toEqual([
      'soul.default.md',
      'src/agent/assets/soul.default.md',
      'src/core/init.ts',
    ]);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('init.ts');
  });

  it('existing genuine-drop behavior preserved: single-dot bare SOURCE names still drop', () => {
    // F-1: README.md moved out of this fixture — it is now a preserved
    // well-known root file (sparse-project carve-out), not a genuine drop.
    const result = sanitizeScope(['init.ts', 'helper.js', 'src/core/config.ts']);
    expect(result.filesWrite).toEqual(['src/core/config.ts']);
    expect(result.warnings.length).toBe(2);
  });

  it('trackedRootFiles + multi-dot preservation compose without interference', () => {
    const result = sanitizeScope(
      ['soul.default.md', 'README.md', 'init.ts'],
      new Set(['README.md']),
    );
    expect(result.filesWrite).toEqual(['soul.default.md', 'README.md']);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('init.ts');
  });

  it('GLOBAL_PROTECTED still wins even for a multi-dot-shaped protected name', () => {
    // config.json is single-dot, so this documents the precedence order rather than
    // overlapping with the new rule — a bare protected file never survives via Rule 5.
    const result = sanitizeScope(['config.json', 'soul.default.md']);
    expect(result.filesWrite).toEqual(['soul.default.md']);
    expect(result.filesWrite).not.toContain('config.json');
  });
});

describe('hasMultiDotBasename', () => {
  it('true for genuine compound basenames', () => {
    expect(hasMultiDotBasename('soul.default.md')).toBe(true);
    expect(hasMultiDotBasename('a.b.c.ts')).toBe(true);
    expect(hasMultiDotBasename('config.default.json')).toBe(true);
  });

  it('false for single-extension bare names (still genuinely unqualified)', () => {
    expect(hasMultiDotBasename('init.ts')).toBe(false);
    expect(hasMultiDotBasename('README.md')).toBe(false);
  });

  it('false for directory-qualified paths (Rule 5 precondition — has a separator)', () => {
    expect(hasMultiDotBasename('src/agent/assets/soul.default.md')).toBe(false);
    expect(hasMultiDotBasename('a/b.c.ts')).toBe(false);
  });

  it('false for a single word with no dots', () => {
    expect(hasMultiDotBasename('Makefile')).toBe(false);
    expect(hasMultiDotBasename('LICENSE')).toBe(false);
  });

  it('false when the trailing segment is not a real alpha-led extension', () => {
    // Guards against dot-heavy non-file tokens slipping through as "preserved".
    expect(hasMultiDotBasename('2.23.4')).toBe(false);
    expect(hasMultiDotBasename('v1.2.3')).toBe(false);
  });
});
