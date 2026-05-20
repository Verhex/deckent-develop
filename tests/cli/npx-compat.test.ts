import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../');

describe('npx deckent compatibility', () => {
  it('src/cli/entry.ts has shebang #!/usr/bin/env node', () => {
    const content = readFileSync(join(PROJECT_ROOT, 'src/cli/entry.ts'), 'utf-8');
    expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('package.json bin.deckent points to ./dist/cli/entry.js', () => {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    expect(pkg.bin.deckent).toBe('./dist/cli/entry.js');
  });

  it('package.json bin.deckent-mcp points to ./dist/mcp/server.js', () => {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    expect(pkg.bin['deckent-mcp']).toBe('./dist/mcp/server.js');
  });

  it('package.json exports has . entry with import and types', () => {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    expect(pkg.exports['.']).toBeDefined();
    expect(pkg.exports['.'].import).toBe('./dist/index.js');
    expect(pkg.exports['.'].types).toBe('./dist/index.d.ts');
  });

  it('package.json main points to ./dist/index.js', () => {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    expect(pkg.main).toBe('./dist/index.js');
  });

  it('package.json types points to ./dist/index.d.ts', () => {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    expect(pkg.types).toBe('./dist/index.d.ts');
  });

  it('package.json has type: module for ESM', () => {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    expect(pkg.type).toBe('module');
  });

  it('package.json engines requires node >= 24 (Active LTS)', () => {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    expect(pkg.engines.node).toMatch(/>=\s*24/);
  });

  it('package.json files includes dist', () => {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    expect(pkg.files).toContain('dist');
  });
});
