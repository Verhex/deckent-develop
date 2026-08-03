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
// DECISION — sahip: RELEASE-001 — karar kaydı docs/analysis/DOC-GAP-DISPOSITION-2026-08-03.md.

const DOC_PATH = join(process.cwd(), 'docs', 'en', 'operations', 'development-and-release.md');

describe('docs/release/release-checklist.md', () => {
  const content = readFileSync(DOC_PATH, 'utf-8');

  it('exists and is non-empty', () => {
    expect(content.length).toBeGreaterThan(200);
  });

  it.skip('contains step 1: tsc --noEmit', () => {
    expect(content).toContain('tsc --noEmit');
  });

  it.skip('contains step 2: vitest run', () => {
    expect(content).toContain('vitest run');
  });

  it('contains step 3: npm pack --dry-run', () => {
    expect(content).toContain('npm pack --dry-run');
  });

  it.skip('contains step 4: CHANGELOG updated', () => {
    expect(content).toContain('CHANGELOG');
  });

  it.skip('contains step 5: README updated', () => {
    expect(content).toContain('README');
  });

  it.skip('contains step 6: version number', () => {
    expect(content).toContain('Version');
    expect(content).toContain('npm version');
  });

  it.skip('contains step 7: git tag', () => {
    expect(content).toContain('git tag');
  });

  it.skip('contains step 8: npm publish --dry-run', () => {
    expect(content).toContain('npm publish --dry-run');
  });

  it('contains step 9: npm publish', () => {
    expect(content).toContain('npm publish');
  });

  it.skip('contains step 10: GitHub release', () => {
    expect(content).toContain('GitHub Release');
    expect(content).toContain('gh release create');
  });

  it.skip('contains step 11: announcement', () => {
    expect(content).toContain('Announcement');
  });

  it('is written in English', () => {
    expect(content).not.toContain('Adimlar');
    expect(content).not.toContain('Kontrol');
  });
});
