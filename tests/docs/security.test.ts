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
    expect(content).toContain('Supported Versions');
    expect(content).toContain('Reporting Vulnerabilities');
    expect(content).toContain('Security Model Overview');
    expect(content).toContain('Known Limitations');
    expect(content).toContain('Best Practices');
  });

  it('contains security contact email', () => {
    const content = readFileSync(securityPath, 'utf-8');
    expect(content).toContain('security@verhex.com');
  });
});
