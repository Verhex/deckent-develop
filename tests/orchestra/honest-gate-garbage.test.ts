import { describe, it, expect } from 'vitest';
import { detectGarbageThrows } from '../../src/orchestra/honest-gate.js';

describe('detectGarbageThrows', () => {
  it('detects throw new Error("unreachable")', () => {
    const contents = new Map([
      ['src/core/enterprise-config.ts', `export function getConfig() {\n  throw new Error('unreachable');\n}\n`],
    ]);
    const result = detectGarbageThrows(contents);
    expect(result.hasGarbageThrow).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.pattern).toBe("throw new Error('unreachable')");
    expect(result.matches[0]?.line).toBe(2);
  });

  it('detects throw new Error("placeholder") with double quotes', () => {
    const contents = new Map([
      ['src/core/tenant-context.ts', `export class TenantContext {\n  resolve() {\n    throw new Error("placeholder");\n  }\n}\n`],
    ]);
    const result = detectGarbageThrows(contents);
    expect(result.hasGarbageThrow).toBe(true);
    expect(result.matches[0]?.pattern).toBe("throw new Error('placeholder')");
  });

  it('detects throw new Error("TODO")', () => {
    const contents = new Map([
      ['src/core/feature.ts', `// stub\nthrow new Error('TODO');\n`],
    ]);
    const result = detectGarbageThrows(contents);
    expect(result.hasGarbageThrow).toBe(true);
    expect(result.matches[0]?.file).toBe('src/core/feature.ts');
  });

  it('returns clean for code with no garbage throws', () => {
    const contents = new Map([
      ['src/core/config.ts', `export function load(): Config {\n  return readJsonSync('.deckent/config.json');\n}\n`],
    ]);
    const result = detectGarbageThrows(contents);
    expect(result.hasGarbageThrow).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  it('passes legitimate throws like Error("file not found")', () => {
    const contents = new Map([
      ['src/core/io.ts', `export function readFile(p: string) {\n  if (!exists(p)) throw new Error('file not found');\n}\n`],
    ]);
    const result = detectGarbageThrows(contents);
    expect(result.hasGarbageThrow).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  it('detects multiple garbage throws across files', () => {
    const contents = new Map([
      ['src/a.ts', `throw new Error('unreachable');\n`],
      ['src/b.ts', `throw new Error('placeholder');\n`],
      ['src/c.ts', `console.log('clean');\n`],
    ]);
    const result = detectGarbageThrows(contents);
    expect(result.hasGarbageThrow).toBe(true);
    expect(result.matches).toHaveLength(2);
  });

  it('handles empty file map', () => {
    const result = detectGarbageThrows(new Map());
    expect(result.hasGarbageThrow).toBe(false);
    expect(result.matches).toHaveLength(0);
  });
});
