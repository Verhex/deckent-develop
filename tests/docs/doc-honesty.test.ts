import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

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

const root = join(import.meta.dirname ?? __dirname, '../../');

describe('doc-honesty', () => {
  it('Gate #8 is marked PARTIAL in beta-tracker.md', () => {
    // beta-tracker.md was moved docs/release/ → docs/archive/ (superseded
    // internal-strategy doc, commit ebc55b03); its Gate #8 PARTIAL/Docker-runtime
    // honesty disclosure is preserved at the archive path.
    const content = readFileSync(join(root, 'docs/archive/beta-tracker.md'), 'utf8');
    expect(content).toMatch(/PARTIAL/);
    expect(content).toMatch(/Docker runtime/);
  });

  it('Sprint 185-200 section is marked historical in ROADMAP-GOD-LEVEL.md', () => {
    const content = readFileSync(join(root, 'docs/archive/ROADMAP-GOD-LEVEL.md'), 'utf8');
    const hasHistorical = /historical plan/i.test(content);
    const hasSuperseded = /superseded/i.test(content);
    const hasExecutionTracker = /EXECUTION TRACKER/i.test(content);
    expect(hasHistorical || hasSuperseded).toBe(true);
    expect(hasExecutionTracker).toBe(true);
  });
});
