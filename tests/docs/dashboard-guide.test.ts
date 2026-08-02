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
// Closing these is a MASTER-PLAN item; see PAZARTESI.md.

const filePath = join(process.cwd(), 'docs', 'guide', 'dashboard.md');
const content = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';

describe('docs/guide/dashboard.md', () => {
  it.skip('exists and is non-empty', () => {
    expect(existsSync(filePath)).toBe(true);
    expect(content.length).toBeGreaterThan(500);
  });

  it.skip('covers all 8 dashboard pages', () => {
    expect(content).toContain('Dashboard');
    expect(content).toContain('Chat');
    expect(content).toContain('History');
    expect(content).toContain('Memory');
    expect(content).toContain('Config');
    expect(content).toContain('Evolution');
    expect(content).toContain('Nervous');
    expect(content).toContain('Enterprise');
  });

  it.skip('explains how to start the serve', () => {
    expect(content).toContain('serve');
    expect(content).toContain('deckent serve');
    expect(content).toContain('--port');
  });

  it.skip('explains sprint start via directives editor', () => {
    expect(content).toContain('directives');
    expect(content).toContain('DIRECTIVES');
    expect(content).toContain('Start Sprint');
  });

  it.skip('covers chat usage', () => {
    expect(content).toContain('chat');
    expect(content).toContain('/api/chat');
  });

  it.skip('covers terminal usage', () => {
    expect(content).toContain('terminal');
    expect(content).toContain('Terminal');
  });

  it.skip('covers evolution, nervous, enterprise pages', () => {
    expect(content).toContain('evolution');
    expect(content).toContain('nervous');
    expect(content).toContain('enterprise');
  });

  it.skip('contains code examples', () => {
    expect(content).toContain('```bash');
    expect(content).toContain('```');
  });
});
