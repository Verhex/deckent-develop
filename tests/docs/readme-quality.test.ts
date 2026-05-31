import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Sprint 201 Task 201-001 — README + landing user-friendly quality gate.
// Validates that public-facing README and VitePress landing remain in shape
// for the OSS launch: correct repo URLs, no broken doc links, copy-paste
// quickstart, and EN/TR parity.

const ROOT = process.cwd();
const README_EN = readFileSync(join(ROOT, 'README.md'), 'utf-8');
const README_TR = readFileSync(join(ROOT, 'README-TR.md'), 'utf-8');
const INDEX_MD = readFileSync(join(ROOT, 'docs/index.md'), 'utf-8');

const BROKEN_PATHS = [
  'docs/superpowers',
  'docs/launch',
  'docs/directives',
  'docs/audits',
  'docs/alperen-analysis',
];

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    count++;
    i += needle.length;
  }
  return count;
}

describe('README quality gate (Sprint 201)', () => {
  it('badge-repo: README.md references VerhexIO/deckent at least 3 times', () => {
    // Kanit measures occurrences (badges + GitHub link), not unique lines.
    // README packs 5 badges on a single line plus a GitHub link below, so
    // occurrence count is the meaningful metric.
    const occurrences = countOccurrences(README_EN, 'VerhexIO/deckent');
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });

  it('badge-repo: every Verhex badge link points to the public repo, not a stale org', () => {
    const stale = ['deckent-org/', 'alperensartacoglu/', 'deckent-team/'];
    for (const ref of stale) {
      expect(README_EN).not.toContain(ref);
    }
    expect(README_EN).toContain('https://github.com/VerhexIO/deckent');
  });

  it('broken-link: README.md and docs/index.md contain no links to removed/private doc trees', () => {
    for (const path of BROKEN_PATHS) {
      expect(README_EN, `README.md still references ${path}`).not.toContain(path);
      expect(INDEX_MD, `docs/index.md still references ${path}`).not.toContain(path);
    }
  });

  it('quickstart copy-paste: install/init/start commands are present in the documented order', () => {
    const quickStartIdx = README_EN.indexOf('## Quick Start');
    expect(quickStartIdx).toBeGreaterThan(-1);
    const block = README_EN.slice(quickStartIdx, quickStartIdx + 1200);
    const installIdx = block.indexOf('npm install -g deckent');
    const initIdx = block.indexOf('deckent init');
    const startIdx = block.indexOf('deckent start');
    expect(installIdx, 'install command missing from Quick Start').toBeGreaterThan(-1);
    expect(initIdx, 'init command missing from Quick Start').toBeGreaterThan(-1);
    expect(startIdx, 'start command missing from Quick Start').toBeGreaterThan(-1);
    expect(installIdx).toBeLessThan(initIdx);
    expect(initIdx).toBeLessThan(startIdx);
  });

  it('tr-parity: README-TR.md keeps repo URL in sync with README.md', () => {
    expect(README_TR).toContain('VerhexIO/deckent');
    for (const path of BROKEN_PATHS) {
      expect(README_TR, `README-TR.md still references ${path}`).not.toContain(path);
    }
  });
});
