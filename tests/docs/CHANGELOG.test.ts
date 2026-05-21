import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

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
  it('CHANGELOG.md file exists', () => {
    expect(existsSync(CHANGELOG_PATH)).toBe(true);
  });

  it('file starts with # Changelog header', () => {
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

  it('all version headers use bracket format', () => {
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

  it('latest entry is at the top and follows sprint naming convention', () => {
    const content = readChangelog();
    const versions = extractVersionHeaders(content);
    expect(versions.length).toBeGreaterThan(0);
    expect(versions[0]).toMatch(/sprint\d+/);
  });

  // Sprint 178: historical sprint33 + wave entries reside in root CHANGELOG.md (consolidation).
  it.skip('sprint33 entry contains expected content sections', () => {
    const content = readChangelog();
    const sprint33Section = content.split('## [0.1.0-sprint33]')[1]?.split('## [0.1.0-sprint32]')[0];
    expect(sprint33Section).toBeDefined();
    expect(sprint33Section).toContain('### Added');
  });

  it.skip('has wave entries for early sprints', () => {
    const content = readChangelog();
    const versions = extractVersionHeaders(content);
    const waveVersions = versions.filter((v) => v.includes('wave'));
    expect(waveVersions.length).toBeGreaterThan(0);
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
