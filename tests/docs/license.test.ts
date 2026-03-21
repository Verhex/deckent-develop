import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

describe('LICENSE file', () => {
  const licensePath = join(ROOT, 'LICENSE');

  it('LICENSE file exists', () => {
    expect(existsSync(licensePath)).toBe(true);
  });

  it('contains MIT license text', () => {
    const content = readFileSync(licensePath, 'utf-8');
    expect(content).toContain('MIT License');
  });

  it('contains correct copyright holder', () => {
    const content = readFileSync(licensePath, 'utf-8');
    expect(content).toContain('Copyright (c) 2026 Alperen @ Verhex');
  });

  it('package.json license field is MIT', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    expect(pkg.license).toBe('MIT');
  });
});
