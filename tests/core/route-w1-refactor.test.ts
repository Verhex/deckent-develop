import { describe, it, expect } from 'vitest';
import { classifyIntent, detectPrimaryIntent } from '../../src/core/intent-classifier.js';
import type { TaskScope } from '../../src/core/task-types.js';

// ─── ROUTE-W1 (Sprint 303) — refactor-to-spec ≠ bugfix ───────────────────────
// `intent-classifier.ts` used to (a) score `bugfix` on the weak/ambiguous tokens
// 'wire'/'runtime' and (b) lack a refactor-to-spec discriminator. A task whose
// root-cause AND fix are already spelled out ("remove the threshold branch → use a
// ternary; add the string to a Set") therefore routed to bug-fixer, which then ran
// dead-weight 5-Whys / bisect analysis. The fix: drop 'wire'/'runtime' from the bugfix
// keywords and add an operation-verb + structure-noun + small-scope refactor boost that
// suppresses an incidental bugfix score.

const oneSrcFile: TaskScope = {
  directories: ['src/orchestra/'],
  filesRead: [],
  filesWrite: ['src/orchestra/sprint-phases.ts'],
};

describe('ROUTE-W1 — refactor-to-spec discrimination', () => {
  // Directive primary case (1).
  it('"remove threshold logic → waitMs ternary; add string to Set" (1-file) → refactor, NOT bugfix', () => {
    const dna = classifyIntent({
      title: 'remove threshold logic',
      description: 'remove threshold logic → waitMs ternary; add string to Set',
      scope: oneSrcFile,
    });
    expect(dna.intent.primary).toBe('refactor');
    expect(dna.intent.primary).not.toBe('bugfix');
  });

  // Directive primary case (2): a genuine bug is still classified as bugfix.
  it('"fix crash on null" → bugfix preserved', () => {
    const dna = classifyIntent({
      title: 'fix crash on null',
      description: 'fix crash on null input',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/config.ts'] },
    });
    expect(dna.intent.primary).toBe('bugfix');
  });

  // 'broken' stays a bugfix keyword but is context-gated: a spelled-out structural edit
  // suppresses the incidental bugfix hit so the task still routes to refactor.
  it('a structural edit that mentions "broken" still classifies as refactor (bugfix suppressed)', () => {
    const dna = classifyIntent({
      title: 'replace broken threshold branch',
      description: 'the threshold is broken — remove it and replace it with a waitMs ternary; track seen ids in a Set',
      scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/x.ts'] },
    });
    expect(dna.intent.primary).toBe('refactor');
    expect(dna.intent.primary).not.toBe('bugfix');
  });

  // Keyword cleanup: 'wire'/'runtime' alone no longer force a bugfix classification.
  // (Pre-fix this scored bugfix=4 via wire+runtime and routed to bug-fixer.)
  it('"wire the engine at runtime" no longer classifies as bugfix', () => {
    const result = detectPrimaryIntent('wire the engine at runtime', {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/engine.ts'],
    });
    expect(result.intent).not.toBe('bugfix');
    expect(result.intent).toBe('implementation');
  });

  // A structure noun WITHOUT an operation verb must not hijack a genuine bug.
  it('"fix the broken loop on null" → bugfix (struct-noun alone does not trigger the refactor boost)', () => {
    const result = detectPrimaryIntent('fix the broken loop on null', oneSrcFile);
    expect(result.intent).toBe('bugfix');
  });

  // The refactor boost is gated to small scope: the SAME text routes to refactor on a
  // 1-file scope but not when the write set exceeds 2 files.
  it('refactor boost is scope-gated (1 file → refactor; >2 files → not refactor)', () => {
    const text = 'remove the threshold loop; replace it with a ternary';
    const small = detectPrimaryIntent(text, {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/a.ts'],
    });
    const large = detectPrimaryIntent(text, {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/a.ts', 'src/orchestra/b.ts', 'src/orchestra/c.ts'],
    });
    expect(small.intent).toBe('refactor');
    expect(large.intent).not.toBe('refactor');
  });

  // Regression guard: the existing ROUTE-1 B1 comment/import sweep still classifies as
  // refactor (the new block has no struct-noun match here, so it must not interfere).
  it('B1 sweep — "delete unused imports" stays refactor (W1 block does not interfere)', () => {
    const dna = classifyIntent({
      title: 'remove unused imports',
      description: 'delete unused imports across the module',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/x.ts'] },
    });
    expect(dna.intent.primary).toBe('refactor');
  });
});
