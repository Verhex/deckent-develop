/**
 * tests/sdk/package-exports.test.ts
 *
 * Sprint 390 Task 390-003 (born-576) — package.json `exports` must publish the
 * embeddable SDK entry point so an external npm consumer can
 * `import { createDeckentClient } from 'deckent/sdk'`. Guards both the new
 * `./sdk` subpath and the pre-existing `.`/`main`/`bin` entries (regression).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

function readPackageJson(): Record<string, unknown> {
  const raw = readFileSync(join(ROOT, 'package.json'), 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

describe('package.json exports — SDK publish surface', () => {
  it('is valid JSON', () => {
    expect(() => readPackageJson()).not.toThrow();
  });

  it('publishes the SDK entry under an exports subpath, resolving to a real dist file', () => {
    const pkg = readPackageJson();
    const exportsMap = pkg.exports as Record<string, { import?: string; types?: string }>;
    expect(exportsMap).toBeDefined();

    const sdkExport = exportsMap['./sdk'];
    expect(sdkExport, 'exports["./sdk"] must exist').toBeDefined();
    expect(typeof sdkExport.import).toBe('string');
    expect(typeof sdkExport.types).toBe('string');

    const importTarget = join(ROOT, sdkExport.import as string);
    const typesTarget = join(ROOT, sdkExport.types as string);
    expect(existsSync(importTarget), `${sdkExport.import} must exist on disk`).toBe(true);
    expect(existsSync(typesTarget), `${sdkExport.types} must exist on disk`).toBe(true);
  });

  it('preserves the existing "." export entry', () => {
    const pkg = readPackageJson();
    const exportsMap = pkg.exports as Record<string, { import?: string; types?: string }>;
    expect(exportsMap['.']).toEqual({
      import: './dist/index.js',
      types: './dist/index.d.ts',
    });
  });

  it('preserves existing main/types/bin entries', () => {
    const pkg = readPackageJson();
    expect(pkg.main).toBe('./dist/index.js');
    expect(pkg.types).toBe('./dist/index.d.ts');
    expect(pkg.bin).toEqual({
      deckent: './dist/cli/entry.js',
      'deckent-mcp': './dist/mcp/server.js',
    });
  });
});
