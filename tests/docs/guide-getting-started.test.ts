import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── DOC-GAP (2026-08-02) ────────────────────────────────────────────────────
// The 2026-08 docs reset (commit 97b91e69f) replaced the single-language doc corpus
// with a bilingual docs/{en,tr}/** tree. Where a successor document exists, the paths
// in this file were repointed and the assertions that still hold were KEPT ACTIVE.
// The `it.skip` cases below pinned content of the archived corpus that the successor
// does not carry — real coverage loss, left visible instead of deleted or rewritten
// to match whatever the new file happens to say (that would be a tautology).
// Archived originals: docs/archive/docs-pre-reset-2026-08-03/.
// DOC-GAP dispozisyonu (2026-08-03, Alperen onayı): süperseded iddialar EMEKLİ edildi —
// karar kaydı docs/analysis/DOC-GAP-DISPOSITION-2026-08-03.md; arşiv içerik docs/archive/docs-pre-reset-2026-08-03/ altında durur.

const GUIDE_DIR = join(process.cwd(), 'docs', 'en', 'guide');

describe('docs/guide/getting-started.md', () => {
  const filePath = join(GUIDE_DIR, 'getting-started.md');
  const content = readFileSync(filePath, 'utf-8');

  it('exists and is non-empty', () => {
    expect(existsSync(filePath)).toBe(true);
    expect(content.length).toBeGreaterThan(500);
  });

  it('is written in English', () => {
    expect(content).not.toContain('Kurulum');
    expect(content).not.toContain('Gereksinimler');
    expect(content).not.toContain('Adımlar');
  });
});

describe('docs/guide/first-sprint.md', () => {
  const filePath = join(GUIDE_DIR, 'run-lifecycle.md');
  const content = readFileSync(filePath, 'utf-8');

  it('exists and is non-empty', () => {
    expect(existsSync(filePath)).toBe(true);
    expect(content.length).toBeGreaterThan(500);
  });

  it('contains plan preview step', () => {
    expect(content).toContain('deckent plan');
  });

  it('explains sprint lifecycle phases', () => {
    expect(content).toContain('PLAN');
    expect(content).toContain('SPAWN');
    expect(content).toContain('EXECUTE');
    expect(content).toContain('EVALUATE');
    expect(content).toContain('RETRO');
  });

  it('is written in English', () => {
    expect(content).not.toContain('Kurulum');
    expect(content).not.toContain('Sonuçlar');
  });
});

describe('docs/guide/concepts.md', () => {
  const filePath = join(process.cwd(), 'docs', 'en', 'overview.md');
  const content = readFileSync(filePath, 'utf-8');

  it('exists and is non-empty', () => {
    expect(existsSync(filePath)).toBe(true);
    expect(content.length).toBeGreaterThan(500);
  });

  it('is written in English', () => {
    expect(content).not.toContain('Kavramlar');
    expect(content).not.toContain('Görev');
    expect(content).not.toContain('Hafıza');
  });
});
