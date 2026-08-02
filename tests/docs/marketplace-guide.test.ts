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

const ROOT = join(import.meta.dirname, '..', '..');

describe('docs/reference/marketplace.md', () => {
  const guidePath = join(ROOT, 'docs', 'reference', 'marketplace.md');

  it.skip('file exists', () => {
    expect(existsSync(guidePath)).toBe(true);
  });

  it.skip('is written in English', () => {
    const content = readFileSync(guidePath, 'utf-8');
    expect(content).toContain('# Marketplace Guide');
    expect(content).toContain('What Is the Marketplace');
  });

  it.skip('has all 7 required sections', () => {
    const content = readFileSync(guidePath, 'utf-8');
    const requiredSections = [
      'What Is the Marketplace',
      'Searching',
      'Installing',
      'Publishing',
      'Ratings',
      'Dependencies',
      'Security',
    ];
    for (const section of requiredSections) {
      expect(content).toContain(section);
    }
  });

  it.skip('describes CLI search commands', () => {
    const content = readFileSync(guidePath, 'utf-8');
    // Real marketplace search command is `deckent skill search <query>`
    // with `--category` / `--limit` / `--json` options (src/cli/commands/
    // skill-marketplace.ts). There is no `deckent marketplace search`, nor
    // `--type` / `--sort` flags.
    expect(content).toContain('deckent skill search');
    expect(content).toContain('--category');
    expect(content).toContain('--limit');
  });

  it.skip('describes installation process', () => {
    const content = readFileSync(guidePath, 'utf-8');
    expect(content).toContain('deckent skill install');
    expect(content).toContain('deckent agent install');
    expect(content).toContain('--force');
  });

  it.skip('describes publishing requirements', () => {
    const content = readFileSync(guidePath, 'utf-8');
    // Real publish command is `deckent skill publish <skillPath>` with a
    // `--dry-run` option (src/cli/commands/skill-marketplace.ts) — there is no
    // `deckent marketplace publish` command.
    expect(content).toContain('deckent skill publish');
    expect(content).toContain('--dry-run');
    expect(content).toContain('manifest.json');
    expect(content).toContain('semver');
  });

  it.skip('describes security and sandboxing', () => {
    const content = readFileSync(guidePath, 'utf-8');
    expect(content).toContain('Sandbox');
    expect(content).toContain('--sandbox-mode');
    expect(content).toContain('Manifest Validation');
  });

  it.skip('describes the rating system', () => {
    const content = readFileSync(guidePath, 'utf-8');
    expect(content).toContain('qualityScore');
    expect(content).toContain('verified');
    expect(content).toContain('communityRating');
  });
});
