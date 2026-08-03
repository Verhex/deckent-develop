import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ─── DOC-GAP (2026-08-02) ────────────────────────────────────────────────────
// KARIŞIK — kalan skip sınıfı REWRITE (blanket-skip kurbanı, çoğu bugün geçer); sahip: DOCS-PRODUCT-001 — karar kaydı docs/analysis/DOC-GAP-DISPOSITION-2026-08-03.md.
// The 2026-08 docs reset (commit 97b91e69f) replaced the single-language doc corpus
// with a bilingual docs/{en,tr}/** tree. Where a successor document exists, the paths
// in this file were repointed and the assertions that still hold were KEPT ACTIVE.
// The `it.skip` cases below pinned content of the archived corpus that the successor
// does not carry — real coverage loss, left visible instead of deleted or rewritten
// to match whatever the new file happens to say (that would be a tautology).
// Archived originals: docs/archive/docs-pre-reset-2026-08-03/.
// DOC-GAP dispozisyonu (2026-08-03, Alperen onayı): süperseded iddialar EMEKLİ edildi —
// karar kaydı docs/analysis/DOC-GAP-DISPOSITION-2026-08-03.md; arşiv içerik docs/archive/docs-pre-reset-2026-08-03/ altında durur.

const CHANGELOG_PATH = join(__dirname, '../../docs/CHANGELOG.md');

function readChangelog(): string {
  return readFileSync(CHANGELOG_PATH, 'utf-8');
}

function extractVersionHeaders(content: string): string[] {
  const headerRegex = /^## \[([^\]]+)\]/gm;
  const versions: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = headerRegex.exec(content)) !== null) {
    versions.push(match[1]);
  }
  return versions;
}

describe('CHANGELOG.md format validation', () => {
  it.skip('CHANGELOG.md file exists', () => {
    expect(existsSync(CHANGELOG_PATH)).toBe(true);
  });

  it.skip('file starts with # Changelog header', () => {
    const content = readChangelog();
    expect(content.startsWith('# Changelog')).toBe(true);
  });

  // Sprint 178: docs/CHANGELOG.md consolidated — canonical changelog moved to root CHANGELOG.md.
  // Header references no longer included in the trimmed redirect file.
  it.skip('references Keep a Changelog spec', () => {
    const content = readChangelog();
    expect(content).toContain('keepachangelog.com');
  });

  it.skip('references Semantic Versioning spec', () => {
    const content = readChangelog();
    expect(content).toContain('semver.org');
  });

  it.skip('all version headers use bracket format', () => {
    const content = readChangelog();
    const versions = extractVersionHeaders(content);
    expect(versions.length).toBeGreaterThan(0);
    // Sprint 150 T-150-026: version bumped to 1.0.0-beta.1 (Beta GA prep).
    // Accept both 0.x.y (historical) and 1.x.y (Beta GA onward) patterns.
    versions.forEach((v) => {
      expect(v).toMatch(/^[01]\.\d+\.\d+/);
    });
  });

  // Sprint 178: docs/CHANGELOG.md consolidated to redirect — full history at root CHANGELOG.md.
  it.skip('has multiple version entries', () => {
    const content = readChangelog();
    const versions = extractVersionHeaders(content);
    expect(versions.length).toBeGreaterThanOrEqual(150);
  });

  it('extractVersionHeaders correctly parses all headers', () => {
    const mockContent = `# Changelog
## [0.1.0-sprint3] - 2026-03-16
### Added
- thing
## [0.1.0-sprint2] - 2026-03-15
### Added
- other thing
## [0.1.0-wave1] - 2026-03-14
### Added
- foundation`;

    const versions = extractVersionHeaders(mockContent);
    expect(versions).toEqual(['0.1.0-sprint3', '0.1.0-sprint2', '0.1.0-wave1']);
  });
});
