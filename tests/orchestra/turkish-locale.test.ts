// ─── Turkish Locale Fix Tests ─────────────────────────────────────────────
// Regression tests for .toLowerCase() → .toLocaleLowerCase('tr-TR') fix.
// Verifies that Turkish İ/ı and I/i characters are handled correctly in
// section title matching (findGenerator, findSectionByTitle).

import { describe, it, expect } from 'vitest';
import { findGenerator } from '../../src/orchestra/managed-docs/content-generators.js';
import { findSectionByTitle, parseSections } from '../../src/orchestra/managed-docs/section-updater.js';

// ─── findGenerator Turkish locale ─────────────────────────────────────────

describe('findGenerator — Turkish locale (toLocaleLowerCase tr-TR)', () => {
  it('matches "Sprint Metrikleri" via patternsByLang tr', () => {
    const gen = findGenerator('Sprint Metrikleri');
    expect(gen).not.toBeNull();
    expect(gen!.id).toBe('sprint-metrics');
  });

  it('matches "İlerleme" heading (İ → i with tr-TR) via patternsByLang tr', () => {
    // "İlerleme" contains İ (capital dotted I), toLocaleLowerCase('tr-TR') → 'ilerleme'
    // patternsByLang.tr for sprint-history includes 'ilerleme'
    const gen = findGenerator('İlerleme');
    expect(gen).not.toBeNull();
    expect(gen!.id).toBe('sprint-history');
  });

  it('matches "Agent Performansı" via patternsByLang tr', () => {
    const gen = findGenerator('Agent Performansı');
    expect(gen).not.toBeNull();
    expect(gen!.id).toBe('agent-performance');
  });

  it('pattern matching is case-insensitive for Turkish characters', () => {
    // "SPRINT METRİKLERİ" uppercase with Türkçe İ
    const gen = findGenerator('SPRINT METRİKLERİ');
    expect(gen).not.toBeNull();
    expect(gen!.id).toBe('sprint-metrics');
  });
});

// ─── findSectionByTitle Turkish locale ────────────────────────────────────

describe('findSectionByTitle — Turkish locale (toLocaleLowerCase tr-TR)', () => {
  const markdown = [
    '# Proje Belgesi',
    '',
    '## Sprint Metrikleri',
    'İçerik burada.',
    '',
    '## İçindekiler',
    'Liste burada.',
    '',
    '## Active Debt',
    'Some content.',
  ].join('\n');

  const sections = parseSections(markdown);

  it('finds "Sprint Metrikleri" section by exact title', () => {
    const sec = findSectionByTitle(sections, 'Sprint Metrikleri');
    expect(sec).not.toBeNull();
    expect(sec!.heading).toBe('## Sprint Metrikleri');
  });

  it('finds "İçindekiler" section — İ character handled correctly', () => {
    // 'İçindekiler'.toLocaleLowerCase('tr-TR') → 'içindekiler' (correct)
    // 'İçindekiler'.toLowerCase() → 'i̇çindekiler' (incorrect — dotted i)
    const sec = findSectionByTitle(sections, 'İçindekiler');
    expect(sec).not.toBeNull();
    expect(sec!.heading).toBe('## İçindekiler');
  });

  it('finds section with mixed-case Turkish title search', () => {
    const sec = findSectionByTitle(sections, 'sprint metrikleri');
    expect(sec).not.toBeNull();
    expect(sec!.heading).toBe('## Sprint Metrikleri');
  });
});
