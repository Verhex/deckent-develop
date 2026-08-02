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
// Closing these is a MASTER-PLAN item; see PAZARTESI.md.

const DOC_PATH = join(process.cwd(), 'docs', 'en', 'guide', 'getting-started.md');

describe('docs/guide/quickstart.md', () => {
  const content = readFileSync(DOC_PATH, 'utf-8');

  it('exists and is non-empty', () => {
    expect(content.length).toBeGreaterThan(100);
  });

  it.skip('contains Prerequisites section', () => {
    expect(content).toContain('## 1. Prerequisites');
    expect(content).toContain('Node.js');
    expect(content).toContain('>= 24');
    expect(content).toContain('git');
  });

  it.skip('contains Installation section', () => {
    expect(content).toContain('## 2. Installation');
    expect(content).toContain('npm install -g deckent');
  });

  it.skip('contains First Project Setup section', () => {
    expect(content).toContain('## 3. First Project Setup');
    expect(content).toContain('deckent init');
  });

  it.skip('contains Writing Directives section', () => {
    expect(content).toContain('## 4. Writing Directives');
    expect(content).toContain('DIRECTIVES.md');
    expect(content).toContain('## Task');
  });

  it.skip('contains Running a Sprint section', () => {
    expect(content).toContain('## 5. Running a Sprint');
    expect(content).toContain('deckent start');
    expect(content).toContain('deckent plan');
  });

  it.skip('contains Understanding Results section', () => {
    expect(content).toContain('## 6. Understanding Results');
    expect(content).toContain('deckent status');
    expect(content).toContain('DONE');
    expect(content).toContain('NO_GO');
    expect(content).toContain('GO_WITH_TECH_DEBT');
  });

  it.skip('contains Next Steps section', () => {
    expect(content).toContain('## 7. Next Steps');
    expect(content).toContain('config-reference.md');
  });

  it.skip('contains copy-pasteable commands', () => {
    expect(content).toContain('```bash');
    expect(content).toContain('npm install -g deckent');
    expect(content).toContain('deckent init');
    expect(content).toContain('deckent start');
    expect(content).toContain('deckent status');
    expect(content).toContain('deckent doctor');
  });

  it('is written in English', () => {
    expect(content).not.toContain('Kurulum');
    expect(content).not.toContain('Gereksinimler');
  });
});
