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
// REWRITE — ardıl: docs/en/mcp.md + api-surface.md; sahip: DOCS-PRODUCT-001 — karar kaydı docs/analysis/DOC-GAP-DISPOSITION-2026-08-03.md.

const DOC_PATH = join(process.cwd(), 'docs', 'en', 'reference', 'api-surface.md');
const content = readFileSync(DOC_PATH, 'utf-8');

describe('docs/reference/api.md — Memory V2 stale reference check', () => {
  // (a) Stale references must be absent
  it('contains no MEMORY_FILE constant reference', () => {
    expect(content).not.toMatch(/const MEMORY_FILE\s*=/);
  });

  it('contains no DECISIONS_FILE constant reference', () => {
    expect(content).not.toMatch(/const DECISIONS_FILE\s*=/);
  });

  it('contains no DEBT_FILE constant reference', () => {
    expect(content).not.toMatch(/const DEBT_FILE\s*=/);
  });

  it('contains no .brain/MEMORY.md path reference', () => {
    expect(content).not.toContain('.brain/MEMORY.md');
  });

  it('contains no .brain/DEBT.md path reference', () => {
    expect(content).not.toContain('.brain/DEBT.md');
  });

  it('has zero stale Memory V1 references (combined regex)', () => {
    const stalePattern = /MEMORY_FILE|DECISIONS_FILE|DEBT_FILE|\.brain\/MEMORY\.md|\.brain\/DEBT\.md/g;
    const matches = content.match(stalePattern);
    expect(matches).toBeNull();
  });

  // (b) Memory V2 API examples must be present
  it.skip('documents Memory V2 DB-first architecture', () => {
    expect(content).toContain('memory.db');
    expect(content).toContain('Memory V2');
  });

  it.skip('documents searchMemory() FTS5 API', () => {
    expect(content).toContain('searchMemory');
    expect(content).toContain('FTS5');
  });

  it.skip('documents MemoryStore type-specific queries', () => {
    expect(content).toContain("store.getByType('adr')");
    expect(content).toContain("type='memory'");
    expect(content).toContain("type='debt'");
    expect(content).toContain("type='adr'");
  });

  it.skip('documents exports directory as auto-generated views', () => {
    expect(content).toContain('.brain/exports/memory.md');
    expect(content).toContain('.brain/exports/debt.md');
    expect(content).toContain('auto-generated');
  });

  it.skip('documents deckent memory export CLI command', () => {
    expect(content).toContain('deckent memory export');
  });

  // (c) REMOVED 2026-08-02 — three assertions read the live `.brain/exports/` tree
  // (`E_HERMETIC_LIVE_STATE_READ` x3, flagged by `npm run lint:hermetic`). They were
  // link-target checks for the archived docs/reference/api.md, so the doc contract they
  // guarded no longer exists, and they were never hermetic: a fresh checkout has no
  // generated exports. Runtime-state presence belongs in a runtime check, not a doc test.

  it.skip('MCP resource deckent://memory references exports path', () => {
    expect(content).toContain('deckent://memory');
    expect(content).toContain('exports/memory.md');
  });

  it.skip('MCP resource deckent://debt references exports path', () => {
    expect(content).toContain('deckent://debt');
    expect(content).toContain('exports/debt.md');
  });

  it.skip('HTTP GET /api/memory description references exports path', () => {
    const apiMemorySection = content.slice(content.indexOf('#### `GET /api/memory`'));
    const nextSection = apiMemorySection.indexOf('\n---\n', 1);
    const section = apiMemorySection.slice(0, nextSection > 0 ? nextSection : 500);
    expect(section).toContain('exports/memory.md');
    expect(section).not.toContain('.brain/MEMORY.md');
  });

  it.skip('HTTP GET /api/debt description references exports path', () => {
    const apiDebtSection = content.slice(content.indexOf('#### `GET /api/debt`'));
    const nextSection = apiDebtSection.indexOf('\n---\n', 1);
    const section = apiDebtSection.slice(0, nextSection > 0 ? nextSection : 500);
    expect(section).toContain('exports/debt.md');
    expect(section).not.toContain('.brain/DEBT.md');
  });
});
