import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── DOC-GAP (2026-08-02) ────────────────────────────────────────────────────
// The 2026-08 docs reset (commit 97b91e69f) replaced the single-language doc corpus
// with a bilingual docs/{en,tr}/** tree. Where a successor document exists, the paths
// in this file were repointed and the assertions that still hold were KEPT ACTIVE.
// The `it.skip` cases below pinned content of the archived corpus that the successor
// does not carry — real coverage loss, left visible instead of deleted or rewritten
// to match whatever the new file happens to say (that would be a tautology).
// Archived originals: docs/archive/docs-pre-reset-2026-08-03/.
// REWRITE — anti-X ürün-sesi kuralı docs/en/vision.md karşısına; sahip: DOCS-PRODUCT-001 — karar kaydı docs/analysis/DOC-GAP-DISPOSITION-2026-08-03.md.

// NOTE: docs/vision/blueprint.md + blueprint-TR.md were intentionally retired —
// the 2989-line stale master-plan was moved to docs/archive/ (commit c12dac9c)
// and its vision/positioning role was superseded by docs/vision/VISION.md. The
// blueprint-specific assertions (positioning anchor, 6-scenario keywords, TR
// identity headings) are intentionally gone with the retired doc; the live
// positioning is now guarded against VISION.md below. (Mirrors the threat-model
// block removal in security-md-current.test.ts when a validated file is gone.)

const VISION_PATH = join(process.cwd(), 'docs/vision/VISION.md');

describe('Vision positioning — docs/vision/VISION.md (blueprint successor)', () => {
  it.skip('VISION.md exists and carries the positioning anchor without anti-X / anti-Devin phrasing', () => {
    expect(existsSync(VISION_PATH)).toBe(true);
    const content = readFileSync(VISION_PATH, 'utf-8');
    expect(content).not.toMatch(/anti-Devin/i);
    expect(content).not.toMatch(/anti-X/);
    expect(content).toMatch(/open source for open world/i);
  });
});
