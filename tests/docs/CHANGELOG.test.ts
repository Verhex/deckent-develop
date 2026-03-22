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

  it('references Keep a Changelog spec', () => {
    const content = readChangelog();
    expect(content).toContain('keepachangelog.com');
  });

  it('references Semantic Versioning spec', () => {
    const content = readChangelog();
    expect(content).toContain('semver.org');
  });

  it('all version headers use bracket format', () => {
    const content = readChangelog();
    const versions = extractVersionHeaders(content);
    expect(versions.length).toBeGreaterThan(0);
    // All versions should start with 0.1.0-
    versions.forEach((v) => {
      expect(v).toMatch(/^0\.1\.0-/);
    });
  });

  it('has multiple version entries', () => {
    const content = readChangelog();
    const versions = extractVersionHeaders(content);
    expect(versions.length).toBeGreaterThanOrEqual(10);
  });

  it('latest entry (sprint33) is at the top', () => {
    const content = readChangelog();
    const versions = extractVersionHeaders(content);
    expect(versions.length).toBeGreaterThan(0);
    expect(versions[0]).toContain('sprint33');
  });

  it('sprint33 entry contains expected content sections', () => {
    const content = readChangelog();
    const sprint33Section = content.split('## [0.1.0-sprint33]')[1]?.split('## [0.1.0-sprint32]')[0];
    expect(sprint33Section).toBeDefined();
    expect(sprint33Section).toContain('### Added');
  });

  it('has wave entries for early sprints', () => {
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
