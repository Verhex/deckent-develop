import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOC_PATH = join(process.cwd(), 'docs', 'RELEASE-CHECKLIST.md');

describe('docs/RELEASE-CHECKLIST.md', () => {
  const content = readFileSync(DOC_PATH, 'utf-8');

  it('exists and is non-empty', () => {
    expect(content.length).toBeGreaterThan(200);
  });

  it('contains step 1: tsc --noEmit', () => {
    expect(content).toContain('tsc --noEmit');
  });

  it('contains step 2: vitest run', () => {
    expect(content).toContain('vitest run');
  });

  it('contains step 3: npm pack --dry-run', () => {
    expect(content).toContain('npm pack --dry-run');
  });

  it('contains step 4: CHANGELOG updated', () => {
    expect(content).toContain('CHANGELOG');
  });

  it('contains step 5: README updated', () => {
    expect(content).toContain('README');
  });

  it('contains step 6: version number', () => {
    expect(content).toContain('Version');
    expect(content).toContain('npm version');
  });

  it('contains step 7: git tag', () => {
    expect(content).toContain('git tag');
  });

  it('contains step 8: npm publish --dry-run', () => {
    expect(content).toContain('npm publish --dry-run');
  });

  it('contains step 9: npm publish', () => {
    expect(content).toContain('npm publish');
  });

  it('contains step 10: GitHub release', () => {
    expect(content).toContain('GitHub Release');
    expect(content).toContain('gh release create');
  });

  it('contains step 11: announcement', () => {
    expect(content).toContain('Announcement');
  });

  it('is written in English', () => {
    expect(content).not.toContain('Adimlar');
    expect(content).not.toContain('Kontrol');
  });
});
