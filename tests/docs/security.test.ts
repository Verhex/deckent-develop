import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

describe('SECURITY.md', () => {
  const securityPath = join(ROOT, 'SECURITY.md');

  it('file exists', () => {
    expect(existsSync(securityPath)).toBe(true);
  });

  it('is written in English and contains key sections', () => {
    const content = readFileSync(securityPath, 'utf-8');
    // SECURITY.md was rewritten with these canonical section headings.
    expect(content).toContain('Supported versions');
    expect(content).toContain('Reporting a vulnerability');
    expect(content).toContain('Security posture');
    expect(content).toContain('Known limitations');
    expect(content).toContain('Best practices');
  });

  it('contains security contact email', () => {
    const content = readFileSync(securityPath, 'utf-8');
    // Canonical security contact is the deckent.ai domain (matches the website
    // and SECURITY.md); the legacy security@verhex.com address was retired.
    expect(content).toContain('security@deckent.ai');
  });
});
