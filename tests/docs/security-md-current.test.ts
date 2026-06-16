import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

describe('SECURITY.md — current version', () => {
  const securityPath = join(ROOT, 'SECURITY.md');
  const content = readFileSync(securityPath, 'utf-8');

  it('(a) Supported Versions shows 1.0.0-beta.x as current', () => {
    expect(content).toContain('1.0.0-beta.x');
    expect(content).toMatch(/1\.0\.0-beta\.x.*Yes/);
  });

  it('(a) legacy < 1.0 row is present and marked unsupported', () => {
    expect(content).toMatch(/< 1\.0.*No|No.*< 1\.0/i);
  });

  it('(a) obsolete 0.1.x version row is removed', () => {
    expect(content).not.toContain('0.1.x');
  });
});

// NOTE: docs/security/threat-model.md was removed 2026-06-16 (docs/security to be
// re-documented from scratch). Its block is intentionally gone; re-add coverage
// when the new security docs land.

describe('README.md — advisory role boundaries disclosure', () => {
  const readmePath = join(ROOT, 'README.md');
  const content = readFileSync(readmePath, 'utf-8');

  it('(c) README no longer says "strict role boundaries"', () => {
    expect(content).not.toContain('strict role boundaries');
  });

  it('(c) README says "advisory" role boundaries', () => {
    expect(content).toMatch(/advisory.*role boundaries|role boundaries.*advisory/i);
  });

  it('(c) README mentions audit trail and V2 post-GA', () => {
    expect(content).toMatch(/audit trail/i);
    expect(content).toMatch(/V2 post-GA|post-GA/i);
  });
});
