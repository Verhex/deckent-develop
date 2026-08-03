import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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

const DOC_PATH = join(process.cwd(), 'docs', 'en', 'reference', 'api-surface.md');

describe('docs/reference/api.md', () => {
  const content = readFileSync(DOC_PATH, 'utf-8');

  it('exists and is non-empty', () => {
    expect(content.length).toBeGreaterThan(500);
  });

  it('contains authentication note', () => {
    expect(content).toContain('authentication');
    expect(content).toContain('local');
  });

  it('is written in English', () => {
    expect(content).not.toContain('Gereksinimler');
    expect(content).not.toContain('Kurulum');
  });
});
