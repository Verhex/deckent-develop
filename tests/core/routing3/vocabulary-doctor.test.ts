// tests/core/routing3/vocabulary-doctor.test.ts
//
// Sprint-445 Task 445-021 — vocabulary doctor checks (layer shadowing, dead
// pathPatterns, duplicate aliases, domains missing a description). Hermetic:
// every fixture lives under a throwaway os.tmpdir() sandbox created per test
// and removed in afterEach — same pattern as
// tests/core/routing3/vocabulary-loader.test.ts (CUSTOM Test Hermeticity).
//
// Design note: BUILTIN_DOMAINS (vocabulary-builtin.ts) is always merged in by
// loadVocabulary and is NOT injectable, so a truly "all four categories
// empty" report is not constructible without coupling this test to the exact
// current content of the builtin registry (e.g. every builtin pathPattern
// would need a matching real file in the sandbox). Instead, each check is
// validated with both a POSITIVE fixture (the issue is detected) and a
// NEGATIVE fixture in the same domain set (a non-issue is NOT flagged) —
// this proves no false positives without depending on builtin content.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { runVocabularyDoctor } from '../../../src/core/routing3/vocabulary-doctor.js';
import { BUILTIN_DOMAINS } from '../../../src/core/routing3/vocabulary-builtin.js';
import { formatVocabularyDoctorLines } from '../../../src/cli/commands/doctor.js';
import type { VocabularyDoctorReport } from '../../../src/core/routing3/vocabulary-doctor.js';

const sandboxes: string[] = [];

function makeSandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deckent-vocab-doctor-'));
  sandboxes.push(dir);
  return dir;
}

function writeProjectVocab(root: string, content: unknown): void {
  const dir = join(root, '.deckent', 'routing');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'vocabulary.json'), typeof content === 'string' ? content : JSON.stringify(content));
}

function writeFileAt(root: string, relPath: string, content = ''): void {
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

afterEach(() => {
  while (sandboxes.length > 0) {
    const dir = sandboxes.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('runVocabularyDoctor — layer shadowing', () => {
  it('passes through loadVocabulary mergeReport.shadowed when a project domain overrides a builtin id', async () => {
    const root = makeSandbox();
    writeProjectVocab(root, {
      domains: [{ id: 'api', description: 'Project-overridden API domain for doctor test.' }],
    });

    const report = await runVocabularyDoctor(root);

    expect(report.shadowed).toContainEqual({
      domainId: 'api',
      shadowedLayer: 'builtin',
      shadowingLayer: 'project',
    });
    // Whole-entry replace, not additive — domain count stays at builtin size.
    expect(report.domainCount).toBe(BUILTIN_DOMAINS.length);
    expect(report.layerCounts).toEqual({ builtin: BUILTIN_DOMAINS.length, orgOverlay: 0, project: 1 });
  });

  it('reports zero shadowed domains when no project id collides with a builtin id', async () => {
    const root = makeSandbox();
    writeProjectVocab(root, {
      domains: [{ id: 'brand-new-fixture-domain', description: 'Not a builtin id.' }],
    });

    const report = await runVocabularyDoctor(root);

    expect(report.shadowed.some((s) => s.domainId === 'brand-new-fixture-domain')).toBe(false);
    expect(report.domainCount).toBe(BUILTIN_DOMAINS.length + 1);
  });
});

describe('runVocabularyDoctor — dead pathPatterns', () => {
  it('flags a pattern matching zero real files, and does not flag one that matches a real file', async () => {
    const root = makeSandbox();
    writeFileAt(root, 'fixture-live/thing.ts', '// real file');
    writeProjectVocab(root, {
      domains: [{
        id: 'fixture-check-patterns',
        description: 'Domain used to test dead-pattern detection.',
        pathPatterns: ['fixture-live/**', 'fixture-dead-xyz/**'],
      }],
    });

    const report = await runVocabularyDoctor(root);

    expect(report.deadPathPatterns).toContainEqual({
      domainId: 'fixture-check-patterns',
      pattern: 'fixture-dead-xyz/**',
    });
    expect(report.deadPathPatterns.some(
      (d) => d.domainId === 'fixture-check-patterns' && d.pattern === 'fixture-live/**',
    )).toBe(false);
  });

  it('prunes node_modules from the walk — a pattern matching only a file under node_modules is still dead', async () => {
    const root = makeSandbox();
    writeFileAt(root, 'node_modules/some-pkg/index.ts', '// vendored');
    writeProjectVocab(root, {
      domains: [{
        id: 'fixture-check-prune',
        description: 'Domain used to test node_modules pruning.',
        pathPatterns: ['node_modules/**'],
      }],
    });

    const report = await runVocabularyDoctor(root);

    expect(report.deadPathPatterns).toContainEqual({
      domainId: 'fixture-check-prune',
      pattern: 'node_modules/**',
    });
  });
});

describe('runVocabularyDoctor — duplicate aliases', () => {
  it('flags an alias shared by two domains, and does not flag a domain-unique alias', async () => {
    const root = makeSandbox();
    writeProjectVocab(root, {
      domains: [
        {
          id: 'fixture-dup-a',
          description: 'First domain sharing an alias.',
          aliases: ['fixture-shared-alias-445', 'fixture-only-a'],
        },
        {
          id: 'fixture-dup-b',
          description: 'Second domain sharing the same alias.',
          aliases: ['fixture-shared-alias-445'],
        },
      ],
    });

    const report = await runVocabularyDoctor(root);

    const shared = report.duplicateAliases.find((d) => d.alias === 'fixture-shared-alias-445');
    expect(shared).toBeDefined();
    expect([...(shared?.domainIds ?? [])].sort()).toEqual(['fixture-dup-a', 'fixture-dup-b']);

    expect(report.duplicateAliases.some((d) => d.alias === 'fixture-only-a')).toBe(false);
  });
});

describe('runVocabularyDoctor — domains with no description', () => {
  it('flags an empty/whitespace-only description, and does not flag a domain with a real description', async () => {
    const root = makeSandbox();
    writeProjectVocab(root, {
      domains: [
        { id: 'fixture-no-desc', description: '   ' },
        { id: 'fixture-has-desc', description: 'A real, non-empty description.' },
      ],
    });

    const report = await runVocabularyDoctor(root);

    expect(report.domainsMissingDescription).toContain('fixture-no-desc');
    expect(report.domainsMissingDescription).not.toContain('fixture-has-desc');
  });
});

// ─── formatVocabularyDoctorLines — bilingual rendering (en+tr pinned) ────────
//
// messages.ts/getMessage is outside this task's write scope (see the
// docImpact note in src/cli/commands/doctor.ts next to VOCABULARY_MESSAGES) —
// this is the closest in-scope equivalent to "pin getMessage keys in en+tr".

describe('formatVocabularyDoctorLines', () => {
  const cleanReport: VocabularyDoctorReport = {
    domainCount: 5,
    layerCounts: { builtin: 4, orgOverlay: 0, project: 1 },
    shadowed: [],
    deadPathPatterns: [],
    duplicateAliases: [],
    domainsMissingDescription: [],
  };

  it('renders a clean report with a PASS header and a PASS clean line (en)', () => {
    const lines = formatVocabularyDoctorLines(cleanReport, 'en');
    expect(lines[0]).toBe('Vocabulary:');
    expect(lines).toContain('  [PASS] 5 domain(s) loaded (builtin 4, org-overlay 0, project 1)');
    expect(lines).toContain('  [PASS] No shadowing, dead patterns, duplicate aliases, or missing descriptions.');
  });

  it('renders a clean report in Turkish', () => {
    const lines = formatVocabularyDoctorLines(cleanReport, 'tr');
    expect(lines[0]).toBe('Sözlük (Vocabulary):');
    expect(lines).toContain('  [PASS] 5 domain yüklendi (builtin 4, org-overlay 0, project 1)');
    expect(lines).toContain("  [PASS] Shadowing, ölü pattern, yinelenen alias veya eksik açıklama yok.");
  });

  it('renders every issue category as a WARN block, in both languages, with no leftover key placeholders', () => {
    const dirtyReport: VocabularyDoctorReport = {
      domainCount: 6,
      layerCounts: { builtin: 4, orgOverlay: 1, project: 1 },
      shadowed: [{ domainId: 'api', shadowedLayer: 'builtin', shadowingLayer: 'project' }],
      deadPathPatterns: [{ domainId: 'api', pattern: 'nonexistent/**' }],
      duplicateAliases: [{ alias: 'shared', domainIds: ['api', 'security'] }],
      domainsMissingDescription: ['no-desc-domain'],
    };

    for (const lang of ['en', 'tr'] as const) {
      const lines = formatVocabularyDoctorLines(dirtyReport, lang);
      const joined = lines.join('\n');

      expect(joined).not.toContain('doctor.vocabulary'); // no raw i18n key ever leaks to output
      expect(joined).toContain('[WARN]');
      expect(joined).toContain('api');
      expect(joined).toContain('nonexistent/**');
      expect(joined).toContain('shared');
      expect(joined).toContain('no-desc-domain');
    }
  });
});
