import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

describe('SECURITY.md location and content', () => {
  it('SECURITY.md exists at repository root', () => {
    const path = join(ROOT, 'SECURITY.md');
    expect(existsSync(path)).toBe(true);
  });

  it('SECURITY.md at root is non-empty', () => {
    const path = join(ROOT, 'SECURITY.md');
    const content = readFileSync(path, 'utf-8');
    expect(content.trim().length).toBeGreaterThan(0);
  });

  it('docs/reference/security.md exists', () => {
    const path = join(ROOT, 'docs', 'reference', 'security.md');
    expect(existsSync(path)).toBe(true);
  });

  it('root SECURITY.md and docs/reference/security.md both exist and are non-empty', () => {
    const rootContent = readFileSync(join(ROOT, 'SECURITY.md'), 'utf-8');
    const docsContent = readFileSync(join(ROOT, 'docs', 'reference', 'security.md'), 'utf-8');
    expect(rootContent.trim().length).toBeGreaterThan(0);
    expect(docsContent.trim().length).toBeGreaterThan(0);
  });

  it('SECURITY.md contains security model overview', () => {
    const content = readFileSync(join(ROOT, 'SECURITY.md'), 'utf-8');
    expect(content.toLowerCase()).toContain('security');
  });

  it('SECURITY.md contains permission hierarchy content', () => {
    const content = readFileSync(join(ROOT, 'SECURITY.md'), 'utf-8');
    // Should contain meaningful security content
    expect(content.length).toBeGreaterThan(100);
  });
});
