import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

describe('package.json release preparation', () => {
  const pkgPath = join(ROOT, 'package.json');

  function readPkg(): Record<string, unknown> {
    return JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
  }

  it('package.json exists', () => {
    expect(existsSync(pkgPath)).toBe(true);
  });

  it('has name field', () => {
    const pkg = readPkg();
    expect(pkg.name).toBe('deckent');
  });

  it('has valid version field', () => {
    const pkg = readPkg();
    expect(typeof pkg.version).toBe('string');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('has description field', () => {
    const pkg = readPkg();
    expect(typeof pkg.description).toBe('string');
    expect((pkg.description as string).length).toBeGreaterThan(10);
  });

  it('has required keywords', () => {
    const pkg = readPkg();
    const keywords = pkg.keywords as string[];
    expect(keywords).toContain('agents');
    expect(keywords).toContain('skills');
    expect(keywords).toContain('marketplace');
    expect(keywords).toContain('analytics');
  });

  it('has original keywords preserved', () => {
    const pkg = readPkg();
    const keywords = pkg.keywords as string[];
    expect(keywords).toContain('ai');
    expect(keywords).toContain('agent');
    expect(keywords).toContain('orchestration');
    expect(keywords).toContain('claude');
    expect(keywords).toContain('cli');
  });

  it('files field includes dist/', () => {
    const pkg = readPkg();
    const files = pkg.files as string[];
    expect(files).toBeDefined();
    expect(files.some((f: string) => f === 'dist' || f.startsWith('dist/'))).toBe(true);
  });

  it('exports field is defined', () => {
    const pkg = readPkg();
    expect(pkg.exports).toBeDefined();
    const exports = pkg.exports as Record<string, unknown>;
    expect(exports['.']).toBeDefined();
  });

  it('exports field has import and types', () => {
    const pkg = readPkg();
    const exports = pkg.exports as Record<string, Record<string, string>>;
    const main = exports['.'];
    expect(main).toBeDefined();
    expect(main!.import).toContain('dist/');
    expect(main!.types).toContain('dist/');
  });

  it('has bin field for CLI entry points', () => {
    const pkg = readPkg();
    const bin = pkg.bin as Record<string, string>;
    expect(bin).toBeDefined();
    expect(bin.deckent).toContain('dist/');
  });

  it('has license field', () => {
    const pkg = readPkg();
    expect(pkg.license).toBe('MIT');
  });

  it('has engines field with node requirement', () => {
    const pkg = readPkg();
    const engines = pkg.engines as Record<string, string>;
    expect(engines).toBeDefined();
    expect(engines.node).toBeDefined();
    expect(engines.node).toContain('>=18');
  });

  it('type field is module (ESM)', () => {
    const pkg = readPkg();
    expect(pkg.type).toBe('module');
  });
});
