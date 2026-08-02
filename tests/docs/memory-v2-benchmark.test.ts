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
// Closing these is a MASTER-PLAN item; see PAZARTESI.md.

const BENCHMARK_PATH = join(process.cwd(), 'docs/benchmark/memory-v2.md');

describe('Memory V2 benchmark document', () => {
  it.skip('benchmark file exists at docs/benchmark/memory-v2.md', () => {
    expect(existsSync(BENCHMARK_PATH)).toBe(true);
  });

  it.skip('contains methodology section with at least one reduction percentage', () => {
    const content = readFileSync(BENCHMARK_PATH, 'utf-8');
    expect(content).toMatch(/reduction/i);
    expect(content).toMatch(/\d+(\.\d+)?%/);
  });

  it.skip('references FTS5 as the search technology', () => {
    const content = readFileSync(BENCHMARK_PATH, 'utf-8');
    expect(content).toContain('FTS5');
  });

  it.skip('contains verifiable context size numbers from real files', () => {
    const content = readFileSync(BENCHMARK_PATH, 'utf-8');
    // Must mention actual byte or line counts from measured files
    expect(content).toMatch(/\d{3,}/);
    // Must reference the pre-V2 archive or the exports directory
    expect(content).toMatch(/pre-v2|exports\/summary/i);
  });
});
