import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

describe('docs/reference/marketplace.md', () => {
  const guidePath = join(ROOT, 'docs', 'reference', 'marketplace.md');

  it('file exists', () => {
    expect(existsSync(guidePath)).toBe(true);
  });

  it('is written in English', () => {
    const content = readFileSync(guidePath, 'utf-8');
    expect(content).toContain('# Marketplace Guide');
    expect(content).toContain('What Is the Marketplace');
  });

  it('has all 7 required sections', () => {
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

  it('describes CLI search commands', () => {
    const content = readFileSync(guidePath, 'utf-8');
    // Real marketplace search command is `deckent skill search <query>`
    // with `--category` / `--limit` / `--json` options (src/cli/commands/
    // skill-marketplace.ts). There is no `deckent marketplace search`, nor
    // `--type` / `--sort` flags.
    expect(content).toContain('deckent skill search');
    expect(content).toContain('--category');
    expect(content).toContain('--limit');
  });

  it('describes installation process', () => {
    const content = readFileSync(guidePath, 'utf-8');
    expect(content).toContain('deckent skill install');
    expect(content).toContain('deckent agent install');
    expect(content).toContain('--force');
  });

  it('describes publishing requirements', () => {
    const content = readFileSync(guidePath, 'utf-8');
    // Real publish command is `deckent skill publish <skillPath>` with a
    // `--dry-run` option (src/cli/commands/skill-marketplace.ts) — there is no
    // `deckent marketplace publish` command.
    expect(content).toContain('deckent skill publish');
    expect(content).toContain('--dry-run');
    expect(content).toContain('manifest.json');
    expect(content).toContain('semver');
  });

  it('describes security and sandboxing', () => {
    const content = readFileSync(guidePath, 'utf-8');
    expect(content).toContain('Sandbox');
    expect(content).toContain('--sandbox-mode');
    expect(content).toContain('Manifest Validation');
  });

  it('describes the rating system', () => {
    const content = readFileSync(guidePath, 'utf-8');
    expect(content).toContain('qualityScore');
    expect(content).toContain('verified');
    expect(content).toContain('communityRating');
  });
});
