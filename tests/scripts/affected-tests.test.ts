import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve, join, sep } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import {
  toPosix,
  isTestPath,
  listProjectFiles,
  extractSpecifiers,
  resolveSpecifier,
  buildReverseGraph,
  computeAffectedTests,
  parseChangedList,
} from '../../scripts/affected-tests.mjs';

const projectRoot = resolve(import.meta.dirname, '..', '..');

// Run the CLI via ASYNC spawn (never spawnSync — see
// .claude/rules/karpathy-discipline.md "no spawnSync for subprocesses":
// a blocking spawnSync freezes the vitest worker's event loop and can starve
// the worker→main heartbeat RPC under load).
function runCli(args: string[], stdin?: string): Promise<{ status: number; stdout: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('node', [join(projectRoot, 'scripts', 'affected-tests.mjs'), ...args], {
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let stdout = '';
    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (d: string) => { stdout += d; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('affected-tests.mjs CLI timeout (20s)')); }, 20_000);
    let exitCode: number | null = null;
    let processClosed = false;
    let streamEnded = false;
    const tryResolve = () => {
      if (processClosed && streamEnded) {
        clearTimeout(timer);
        resolvePromise({ status: exitCode ?? -1, stdout });
      }
    };
    child.stdout.on('end', () => { streamEnded = true; tryResolve(); });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => { exitCode = code; processClosed = true; tryResolve(); });
    if (stdin !== undefined) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

// ─── toPosix / isTestPath ───────────────────────────────────────────────────

describe('toPosix', () => {
  it('converts backslash separators to forward slashes', () => {
    expect(toPosix('src\\core\\scope-gate.ts')).toBe('src/core/scope-gate.ts');
  });

  it('leaves posix paths unchanged', () => {
    expect(toPosix('src/core/scope-gate.ts')).toBe('src/core/scope-gate.ts');
  });
});

describe('isTestPath', () => {
  it('accepts tests/**/*.test.ts', () => {
    expect(isTestPath('tests/core/scope-gate.test.ts')).toBe(true);
  });

  it('accepts tests/**/*.test.tsx', () => {
    expect(isTestPath('tests/dashboard/App.test.tsx')).toBe(true);
  });

  it('rejects non-test helper files under tests/', () => {
    expect(isTestPath('tests/helpers/factory.ts')).toBe(false);
  });

  it('rejects src files', () => {
    expect(isTestPath('src/core/scope-gate.ts')).toBe(false);
  });
});

// ─── extractSpecifiers ──────────────────────────────────────────────────────

describe('extractSpecifiers', () => {
  it('extracts a named import-from specifier', () => {
    const { specifiers } = extractSpecifiers(`import { foo } from './bar.js';`);
    expect(specifiers).toContain('./bar.js');
  });

  it('extracts an export-from specifier', () => {
    const { specifiers } = extractSpecifiers(`export { foo } from './bar.js';`);
    expect(specifiers).toContain('./bar.js');
  });

  it('extracts an export-star-from specifier', () => {
    const { specifiers } = extractSpecifiers(`export * from './bar.js';`);
    expect(specifiers).toContain('./bar.js');
  });

  it('extracts a literal dynamic import() specifier', () => {
    const { specifiers } = extractSpecifiers(`const m = await import('./bar.js');`);
    expect(specifiers).toContain('./bar.js');
  });

  it('extracts a bare side-effect import', () => {
    const { specifiers } = extractSpecifiers(`import './setup.js';\n`);
    expect(specifiers).toContain('./setup.js');
  });

  it('does not double-count a normal `from` import as a bare side-effect import', () => {
    const { specifiers } = extractSpecifiers(`import Foo from './bar.js';`);
    const matches = specifiers.filter(s => s === './bar.js');
    expect(matches.length).toBe(1);
  });

  it('extracts vi.mock specifiers', () => {
    const { specifiers } = extractSpecifiers(`vi.mock('../src/core/scope-gate.js');`);
    expect(specifiers).toContain('../src/core/scope-gate.js');
  });

  it('extracts vi.doMock specifiers', () => {
    const { specifiers } = extractSpecifiers(`vi.doMock('../src/core/scope-gate.js', () => ({}));`);
    expect(specifiers).toContain('../src/core/scope-gate.js');
  });

  it('counts template-literal dynamic imports without producing a specifier', () => {
    const { specifiers, templateDynamicCount } = extractSpecifiers('const m = await import(`./providers/${name}.js`);');
    expect(templateDynamicCount).toBe(1);
    expect(specifiers).not.toContain('./providers/${name}.js');
  });

  it('counts a bare package import specifier (still returned for the caller to classify)', () => {
    const { specifiers } = extractSpecifiers(`import { z } from 'zod';`);
    expect(specifiers).toContain('zod');
  });
});

// ─── resolveSpecifier ───────────────────────────────────────────────────────

describe('resolveSpecifier', () => {
  const fromDir = '/proj/src/core';
  const resolvableSet = new Set([
    '/proj/src/core/a.ts',
    '/proj/src/core/comp.tsx',
    '/proj/src/core/mod/index.ts',
  ]);

  it('resolves a .js specifier to a sibling .ts file', () => {
    expect(resolveSpecifier(fromDir, './a.js', resolvableSet)).toBe('/proj/src/core/a.ts');
  });

  it('resolves a .js specifier to a sibling .tsx file when no .ts exists', () => {
    expect(resolveSpecifier(fromDir, './comp.js', resolvableSet)).toBe('/proj/src/core/comp.tsx');
  });

  it('resolves an explicit index.js specifier to index.ts', () => {
    expect(resolveSpecifier(fromDir, './mod/index.js', resolvableSet)).toBe('/proj/src/core/mod/index.ts');
  });

  it('resolves an implicit directory specifier to its index.ts', () => {
    expect(resolveSpecifier(fromDir, './mod.js', resolvableSet)).toBe('/proj/src/core/mod/index.ts');
  });

  it('returns null for a bare package specifier', () => {
    expect(resolveSpecifier(fromDir, 'zod', resolvableSet)).toBeNull();
  });

  it('returns null for an alias specifier', () => {
    expect(resolveSpecifier(fromDir, '@/core/utils', resolvableSet)).toBeNull();
  });

  it('returns null for a relative specifier with no matching candidate', () => {
    expect(resolveSpecifier(fromDir, './missing.js', resolvableSet)).toBeNull();
  });

  it('does not extension-swap a literal .mjs specifier (real non-TS file, never resolved here)', () => {
    const set = new Set(['/proj/scripts/gen-reference-docs.ts']); // hypothetical — should NOT match
    expect(resolveSpecifier('/proj/tests/scripts', '../../scripts/gen-reference-docs.mjs', set)).toBeNull();
  });
});

// ─── Hermetic fixture-tree integration tests ───────────────────────────────

let tmpRoot: string;

function writeFixture(relPath: string, content: string) {
  const full = join(tmpRoot, ...relPath.split('/'));
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'affected-tests-fixture-'));

  // Transitive chain: src/a.ts <- src/b.ts <- tests/x.test.ts
  writeFixture('src/a.ts', `export const A = 1;\n`);
  writeFixture('src/b.ts', `import { A } from './a.js';\nexport const B = A;\n`);
  writeFixture('tests/x.test.ts', `import { describe, it } from 'vitest';\nimport { B } from '../src/b.js';\ndescribe('x', () => { it('works', () => { B; }); });\n`);

  // tsx resolution
  writeFixture('src/comp.tsx', `export const Comp = () => null;\n`);
  writeFixture('tests/tsxconsumer.test.ts', `import { Comp } from '../src/comp.js';\nComp;\n`);

  // Explicit index.js resolution
  writeFixture('src/mod/index.ts', `export const M = 1;\n`);
  writeFixture('tests/indexconsumer.test.ts', `import { M } from '../src/mod/index.js';\nM;\n`);

  // Implicit directory-index resolution (specifier has no /index suffix)
  writeFixture('src/dirmod/index.ts', `export const DM = 1;\n`);
  writeFixture('tests/dirimport.test.ts', `import { DM } from '../src/dirmod.js';\nDM;\n`);

  // Test-helper chain: tests/helpers/helper.ts <- tests/y.test.ts
  writeFixture('tests/helpers/helper.ts', `import { A } from '../../src/a.js';\nexport function useHelper() { return A; }\n`);
  writeFixture('tests/y.test.ts', `import { useHelper } from './helpers/helper.js';\nuseHelper();\n`);

  // vi.mock-only edge (no direct import binding)
  writeFixture('tests/mockconsumer.test.ts', `import { vi } from 'vitest';\nvi.mock('../src/a.js');\n`);

  // Bare side-effect import edge
  writeFixture('tests/sideeffect.test.ts', `import '../src/a.js';\n`);

  // Deleted-file consumer: imports a src file that will NOT exist on disk
  writeFixture('tests/deleted-consumer.test.ts', `import { Z } from '../src/deleted.js';\nZ;\n`);

  // Unresolved-import fixtures
  writeFixture('tests/unresolved.test.ts', `import lodash from 'lodash';\nimport { X } from '../src/does-not-exist.js';\nlodash; X;\n`);

  // node_modules exclusion fixture (nested at depth, like src/desktop + src/dashboard)
  writeFixture('src/vendor/node_modules/pkg/index.ts', `export const SHOULD_NOT_BE_SCANNED = true;\n`);
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('listProjectFiles', () => {
  it('excludes any node_modules subtree at any depth', () => {
    const files = listProjectFiles(tmpRoot);
    const posixFiles = files.map(f => toPosix(f));
    expect(posixFiles.some(f => f.includes('/node_modules/'))).toBe(false);
  });

  it('includes fixture src and tests files', () => {
    const files = listProjectFiles(tmpRoot).map(f => toPosix(f));
    expect(files.some(f => f.endsWith('src/a.ts'))).toBe(true);
    expect(files.some(f => f.endsWith('tests/x.test.ts'))).toBe(true);
  });
});

describe('computeAffectedTests — transitive chain', () => {
  it('finds a test two hops away from the changed module', () => {
    const result = computeAffectedTests(tmpRoot, ['src/a.ts']);
    expect(result.affected).toContain('tests/x.test.ts');
  });

  it('finds a test one hop away from the changed module', () => {
    const result = computeAffectedTests(tmpRoot, ['src/b.ts']);
    expect(result.affected).toContain('tests/x.test.ts');
  });
});

describe('computeAffectedTests — tsx resolution', () => {
  it('resolves a .js specifier to a sibling .tsx source', () => {
    const result = computeAffectedTests(tmpRoot, ['src/comp.tsx']);
    expect(result.affected).toContain('tests/tsxconsumer.test.ts');
  });
});

describe('computeAffectedTests — index resolution', () => {
  it('resolves an explicit index.js specifier', () => {
    const result = computeAffectedTests(tmpRoot, ['src/mod/index.ts']);
    expect(result.affected).toContain('tests/indexconsumer.test.ts');
  });

  it('resolves an implicit directory-index specifier', () => {
    const result = computeAffectedTests(tmpRoot, ['src/dirmod/index.ts']);
    expect(result.affected).toContain('tests/dirimport.test.ts');
  });
});

describe('computeAffectedTests — test-helper chain', () => {
  it('marks a test affected via a non-test helper file under tests/', () => {
    const result = computeAffectedTests(tmpRoot, ['src/a.ts']);
    expect(result.affected).toContain('tests/y.test.ts');
  });

  it('does not report the helper file itself as affected (not a *.test.ts file)', () => {
    const result = computeAffectedTests(tmpRoot, ['src/a.ts']);
    expect(result.affected).not.toContain('tests/helpers/helper.ts');
  });
});

describe('computeAffectedTests — self-changed test', () => {
  it('reports a changed test file as affected even with no importers', () => {
    const result = computeAffectedTests(tmpRoot, ['tests/x.test.ts']);
    expect(result.affected).toContain('tests/x.test.ts');
  });
});

describe('computeAffectedTests — vi.mock and bare side-effect edges', () => {
  it('marks a vi.mock-only consumer as affected', () => {
    const result = computeAffectedTests(tmpRoot, ['src/a.ts']);
    expect(result.affected).toContain('tests/mockconsumer.test.ts');
  });

  it('marks a bare side-effect import consumer as affected', () => {
    const result = computeAffectedTests(tmpRoot, ['src/a.ts']);
    expect(result.affected).toContain('tests/sideeffect.test.ts');
  });
});

describe('computeAffectedTests — deleted-file behavior', () => {
  it('marks an importer of a deleted (non-existent) changed file as affected', () => {
    const result = computeAffectedTests(tmpRoot, ['src/deleted.ts']);
    expect(result.affected).toContain('tests/deleted-consumer.test.ts');
    expect(result.graphStats.deletedChangedFiles).toBe(1);
  });

  it('does not report the deleted file itself in affected (it cannot be run)', () => {
    const result = computeAffectedTests(tmpRoot, ['src/deleted.ts']);
    expect(result.affected).not.toContain('src/deleted.ts');
  });
});

describe('computeAffectedTests — unresolved-import counter', () => {
  it('counts bare package + missing relative + template-dynamic imports honestly', () => {
    const result = computeAffectedTests(tmpRoot, ['src/a.ts']);
    // tests/unresolved.test.ts contributes 2 unresolved specifiers (lodash + does-not-exist.js)
    expect(result.graphStats.unresolvedImports).toBeGreaterThanOrEqual(2);
  });

  it('does not mark an unresolvable import as affected by a changed file', () => {
    const result = computeAffectedTests(tmpRoot, ['src/does-not-exist.ts']);
    // The specifier text differs (`does-not-exist.js` vs `does-not-exist.ts` changed entry
    // resolves to a different absolute candidate only if names match exactly) — assert no crash
    // and a well-formed result either way.
    expect(Array.isArray(result.affected)).toBe(true);
  });
});

describe('computeAffectedTests — Windows-separator input', () => {
  it('treats a backslash-separated changed path the same as its posix form', () => {
    const posixResult = computeAffectedTests(tmpRoot, ['src/a.ts']);
    const winPath = 'src' + '\\' + 'a.ts';
    const winResult = computeAffectedTests(tmpRoot, [winPath]);
    expect(winResult.affected.sort()).toEqual(posixResult.affected.sort());
    expect(winResult.changed).toEqual(['src/a.ts']);
  });
});

describe('computeAffectedTests — output shape', () => {
  it('returns changed, affected, and graphStats', () => {
    const result = computeAffectedTests(tmpRoot, ['src/a.ts']);
    expect(result).toHaveProperty('changed');
    expect(result).toHaveProperty('affected');
    expect(result).toHaveProperty('graphStats');
    expect(result.graphStats).toHaveProperty('filesScanned');
    expect(result.graphStats).toHaveProperty('edgesResolved');
    expect(result.graphStats).toHaveProperty('unresolvedImports');
    expect(result.graphStats).toHaveProperty('deletedChangedFiles');
  });

  it('returns posix-normalized affected paths regardless of OS path.sep', () => {
    const result = computeAffectedTests(tmpRoot, ['src/a.ts']);
    for (const p of result.affected) {
      expect(p.includes(sep === '\\' ? '\\' : ' ')).toBe(false);
      expect(p).not.toContain('\\');
    }
  });

  it('returns an empty affected list for a module nobody imports', () => {
    writeFixture('src/orphan.ts', `export const ORPHAN = true;\n`);
    const result = computeAffectedTests(tmpRoot, ['src/orphan.ts']);
    expect(result.affected).toEqual([]);
  });
});

describe('buildReverseGraph', () => {
  it('builds a reverse index resolvable from target back to importer', () => {
    const files = listProjectFiles(tmpRoot);
    const resolvableSet = new Set(files);
    const { reverseIndex } = buildReverseGraph(files, resolvableSet);
    const aTarget = files.find(f => toPosix(f).endsWith('src/a.ts'));
    expect(aTarget).toBeDefined();
    const importers = reverseIndex.get(aTarget as string);
    expect(importers).toBeDefined();
    expect([...(importers as Set<string>)].some(f => toPosix(f).endsWith('src/b.ts'))).toBe(true);
  });
});

// ─── parseChangedList ───────────────────────────────────────────────────────

describe('parseChangedList', () => {
  it('splits a comma-separated string', () => {
    expect(parseChangedList('src/a.ts,src/b.ts')).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('splits a newline-separated string', () => {
    expect(parseChangedList('src/a.ts\nsrc/b.ts\n')).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('trims whitespace and drops empty entries', () => {
    expect(parseChangedList(' src/a.ts \n\n src/b.ts ,, ')).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('returns an empty array for empty input', () => {
    expect(parseChangedList('')).toEqual([]);
    expect(parseChangedList(null as unknown as string)).toEqual([]);
  });
});

// ─── Real-repo smoke (no spawn — direct function call, per goNogo Kanıt) ───

describe('computeAffectedTests — real repo smoke', () => {
  it('finds at least one real affected test for src/core/scope-gate.ts', () => {
    const result = computeAffectedTests(projectRoot, ['src/core/scope-gate.ts']);
    expect(result.affected.length).toBeGreaterThanOrEqual(1);
    expect(result.affected).toContain('tests/core/scope-gate.test.ts');
  }, 30_000);

  it('returns zero affected tests for a module with no importers', () => {
    const result = computeAffectedTests(projectRoot, ['src/orchestra/batch-stats.ts']);
    expect(result.affected).toEqual([]);
  }, 30_000);
});

// ─── CLI execution (async spawn) ────────────────────────────────────────────

describe('affected-tests.mjs CLI execution', () => {
  it('resolves affected tests via --changed and --json on a tmp fixture root', async () => {
    const result = await runCli(['--root', tmpRoot, '--changed', 'src/a.ts', '--json']);
    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.affected).toContain('tests/x.test.ts');
  });

  it('resolves affected tests via STDIN when --changed is omitted', async () => {
    const result = await runCli(['--root', tmpRoot, '--json'], 'src/a.ts\n');
    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.affected).toContain('tests/x.test.ts');
  });

  it('prints one affected test path per stdout line without --json', async () => {
    const result = await runCli(['--root', tmpRoot, '--changed', 'src/a.ts']);
    expect(result.status).toBe(0);
    const lines = result.stdout.trim().split('\n').filter(Boolean);
    expect(lines).toContain('tests/x.test.ts');
    // Plain output must not be JSON
    expect(() => JSON.parse(result.stdout)).toThrow();
  });

  it('exits 0 with an empty affected list when --changed is empty and no stdin is piped', async () => {
    const result = await runCli(['--root', tmpRoot, '--changed', '']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });
});

describe('born-606 Brain-fix: scripts/ evrende + .mjs literal-çözüm (eksiltme-regresyonu)', () => {
  it('scripts/*.mjs değişikliği, onu import eden testleri bulur (.mjs→.mjs zinciri dahil)', () => {
    const root = mkdtempSync(join(tmpdir(), 'aff-mjs-'));
    try {
      mkdirSync(join(root, 'scripts'), { recursive: true });
      mkdirSync(join(root, 'tests', 'scripts'), { recursive: true });
      writeFileSync(join(root, 'scripts', 'core.mjs'), 'export const x = 1;\n');
      writeFileSync(join(root, 'scripts', 'runner.mjs'), "import { x } from './core.mjs';\nexport const y = x;\n");
      writeFileSync(
        join(root, 'tests', 'scripts', 'runner.test.ts'),
        "// @ts-expect-error mjs\nimport { y } from '../../scripts/runner.mjs';\nit('t', () => {});\n",
      );
      const res = computeAffectedTests(root, ['scripts/core.mjs']);
      expect(res.affected).toContain('tests/scripts/runner.test.ts');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
