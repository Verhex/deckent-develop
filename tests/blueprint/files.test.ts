import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

describe('Blueprint file existence', () => {
  it('AGENTS.md exists and is non-empty', () => {
    const path = join(ROOT, 'AGENTS.md');
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf-8').trim().length).toBeGreaterThan(0);
  });

  it('docs/en/reference/api-surface.md exists and is non-empty', () => {
    // Sprint 172 doc-reorg (commit 1c8cef29): .contracts/ → docs/reference/.
    const path = join(ROOT, 'docs', 'en', 'reference', 'api-surface.md');
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf-8').trim().length).toBeGreaterThan(0);
  });

  it('.deckent/workspace/IDENTITY.md exists and is non-empty (skip in CI)', () => {
    const path = join(ROOT, '.deckent', 'workspace', 'IDENTITY.md');
    if (!existsSync(path)) return; // .deckent/ is gitignored — only exists locally after deckent init
    expect(readFileSync(path, 'utf-8').trim().length).toBeGreaterThan(0);
  });

  // Sprint 150 T-150-022: AGENTS.md refreshed — taxonomy reform per ADR-041
  // (test-writer removed, 15 built-in agents). "## Architecture" section dropped in
  // favor of agent catalog. Rewrite in Sprint 151 with new structure.
  it.skip('AGENTS.md contains Architecture section', () => {
    const content = readFileSync(join(ROOT, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('## Architecture');
    expect(content).toContain('orchestra/');
  });

  // DOC-GAP (2026-08-02): the archived docs/reference/api-surface.md documented the
  // `.tasks/` file format. The bilingual successor covers the HTTP/SSE surface only,
  // so this claim has no home yet. Skipped, not deleted. See PAZARTESI.md.
  it.skip('docs/en/reference/api-surface.md contains task format', () => {
    // Sprint 172 doc-reorg (commit 1c8cef29): .contracts/ → docs/reference/.
    const content = readFileSync(join(ROOT, 'docs', 'en', 'reference', 'api-surface.md'), 'utf-8');
    expect(content).toContain('.tasks/');
    expect(content).toContain('Module Import Rules');
  });
});
