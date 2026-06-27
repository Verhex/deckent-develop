/**
 * Tests that scanCodeAST signals TypeScript unavailability explicitly
 * rather than silently returning [] (indistinguishable from "scanned clean").
 *
 * The fix: when require('typescript') fails, scanCodeAST returns a sentinel
 * string '__SANDBOX_UNAVAILABLE__:typescript-not-installed' so callers can
 * distinguish "scanner could not run" from "scanner ran and found nothing".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock control ─────────────────────────────────────────────────────────────
// Module-level flag: when true, the mocked createRequire will throw when
// 'typescript' is requested, simulating a host without the TS compiler.
// eslint-disable-next-line prefer-const
let _throwOnTsRequire = false;

// vi.mock is hoisted by vitest before any imports. The inner closure captures
// _throwOnTsRequire by reference so individual tests can flip it.
vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:module')>();
  return {
    ...actual,
    createRequire: (url: string) => {
      const realRequire = actual.createRequire(url);
      return (id: string) => {
        if (id === 'typescript' && _throwOnTsRequire) {
          throw new Error('Cannot find module: typescript');
        }
        return realRequire(id);
      };
    },
  };
});

// Import AFTER vi.mock so skill-sandbox picks up the mocked createRequire.
import { scanCodeAST, SkillSandbox } from '../../src/core/marketplace/skill-sandbox.js';
import type { SkillSandboxFS } from '../../src/core/marketplace/skill-sandbox.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SENTINEL = '__SANDBOX_UNAVAILABLE__:typescript-not-installed';

function createMockFS(files: Record<string, string> = {}, dirs: Set<string> = new Set()): SkillSandboxFS {
  const store = new Map(Object.entries(files));
  return {
    existsSync: vi.fn((p: string) => store.has(p) || dirs.has(p)),
    mkdirSync: vi.fn((p: string) => { dirs.add(p); }),
    readdirSync: vi.fn((dirPath: string) => {
      const entries: Array<{ name: string; isDirectory: () => boolean }> = [];
      const prefix = dirPath.endsWith('/') ? dirPath : dirPath + '/';
      const seen = new Set<string>();
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const parts = rest.split('/');
          const name = parts[0]!;
          if (seen.has(name)) continue;
          seen.add(name);
          entries.push({ name, isDirectory: () => parts.length > 1 });
        }
      }
      return entries;
    }),
    readFileSync: vi.fn((p: string) => {
      if (!store.has(p)) throw new Error(`ENOENT: ${p}`);
      return store.get(p)!;
    }),
    renameSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('scanCodeAST — honest-fail when TypeScript unavailable', () => {
  beforeEach(() => { _throwOnTsRequire = false; });
  afterEach(() => { _throwOnTsRequire = false; });

  it('returns the sentinel (NOT empty array) when TypeScript is absent', () => {
    _throwOnTsRequire = true;
    // Use code that would be perfectly clean — no real violations.
    // Pre-fix: returned [] (silent pass). Post-fix: must return the sentinel.
    const result = scanCodeAST('export const x = 1;', 'test.ts');

    expect(result).not.toHaveLength(0);
    expect(result).toContain(SENTINEL);
  });

  it('sentinel is distinguishable from a clean-scan result', () => {
    // Regression for the original bug: a caller checking `result.length === 0`
    // to detect "clean" must NOT see an empty array when TS is absent.
    _throwOnTsRequire = true;
    const result = scanCodeAST('const x = 1;', 'test.ts');

    // Post-fix: length > 0, so a caller can detect "not clean / scanner unavailable"
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((v) => v.includes('__SANDBOX_UNAVAILABLE__'))).toBe(true);
  });

  it('sentinel does not look like a real AST violation', () => {
    // Sentinel must be visually distinguishable from real violation strings (which start with 'AST:')
    _throwOnTsRequire = true;
    const result = scanCodeAST('const x = 1;', 'test.ts');

    expect(result.every((v) => !v.startsWith('AST:'))).toBe(true);
    expect(result).toContain(SENTINEL);
  });

  it('validateSkillSafety marks safe:false when TypeScript is unavailable (sentinel propagates)', () => {
    _throwOnTsRequire = true;
    const mockFS = createMockFS(
      { '/skills/test/clean.ts': 'export const y = 2;' },
      new Set(['/skills/test']),
    );
    const sandbox = new SkillSandbox('/project', { fs: mockFS });

    const report = sandbox.validateSkillSafety('/skills/test');

    // safe must be false — sentinel surfaced as an issue
    expect(report.safe).toBe(false);
    expect(report.issues.some((i) => i.includes('__SANDBOX_UNAVAILABLE__'))).toBe(true);
  });

  it('validateSkillSafety issues list contains the sentinel string for every .ts file scanned', () => {
    _throwOnTsRequire = true;
    const mockFS = createMockFS(
      {
        '/skills/multi/a.ts': 'export const a = 1;',
        '/skills/multi/b.ts': 'export const b = 2;',
      },
      new Set(['/skills/multi']),
    );
    const sandbox = new SkillSandbox('/project', { fs: mockFS });

    const report = sandbox.validateSkillSafety('/skills/multi');

    // Both .ts files trigger the sentinel — issues list must contain at least 2 sentinel entries
    const sentinelIssues = report.issues.filter((i) => i.includes('__SANDBOX_UNAVAILABLE__'));
    expect(sentinelIssues.length).toBeGreaterThanOrEqual(2);
  });

  // ─── Happy path (TypeScript present) ─────────────────────────────────────

  it('happy path: real AST violation is detected when TypeScript is present', () => {
    _throwOnTsRequire = false; // TS available — real scanner runs
    const maliciousCode = 'const x = eval("alert(1)");';
    const result = scanCodeAST(maliciousCode, 'test.ts');

    expect(result.some((v) => v.includes('eval()'))).toBe(true);
    expect(result).not.toContain(SENTINEL);
  });

  it('happy path: clean code returns empty array when TypeScript is present', () => {
    _throwOnTsRequire = false;
    const cleanCode = 'export function add(a: number, b: number): number { return a + b; }';
    const result = scanCodeAST(cleanCode, 'test.ts');

    expect(result).toHaveLength(0);
    expect(result).not.toContain(SENTINEL);
  });

  it('happy path: validateSkillSafety marks clean .ts file as safe when TypeScript is present', () => {
    _throwOnTsRequire = false;
    const mockFS = createMockFS(
      { '/skills/safe/index.ts': 'export function hello() { return "hi"; }' },
      new Set(['/skills/safe']),
    );
    const sandbox = new SkillSandbox('/project', { fs: mockFS });

    const report = sandbox.validateSkillSafety('/skills/safe');

    expect(report.safe).toBe(true);
    expect(report.issues).toHaveLength(0);
  });
});
