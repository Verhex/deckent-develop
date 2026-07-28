import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALLOWLIST,
  HERMETIC_PATTERNS,
  checkFile,
  createScanBudget,
  deriveWriterRegistry,
  evaluateProductionInventoryPolicy,
  evaluateUnresolvedPolicy,
  productionInventoryFingerprint,
  scanTestDir,
  traceCommandEffects,
  unresolvedRegistryFingerprint,
} from '../../scripts/lint-test-hermeticity.mjs';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '..', '..');

// Hermetic sandbox — each test gets a fresh tmpdir, cleaned up in afterEach
let sandbox: string;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'hermetic-lint-'));
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

// ─── checkFile — violation detection ─────────────────────────────────────────

describe('checkFile — violation detection', () => {
  it('detects process.cwd() + .deckent access as a violation', () => {
    const content = `const configPath = join(process.cwd(), '.deckent', 'config.json');`;
    const violations = checkFile(content, 'tests/bad.test.ts');
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].line).toBe(1);
    expect(violations[0].label).toContain('.deckent');
  });

  it('detects process.cwd() + .brain access as a violation', () => {
    const content = `const debtPath = join(process.cwd(), '.brain', 'exports', 'debt.md');`;
    const violations = checkFile(content, 'tests/bad.test.ts');
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].label).toContain('.brain');
  });

  it('detects .deckent/config.json as literal in readFileSync', () => {
    const content = `const raw = readFileSync('.deckent/config.json', 'utf-8');`;
    const violations = checkFile(content, 'tests/bad.test.ts');
    expect(violations.length).toBeGreaterThan(0);
  });

  it('passes clean test file (uses tmpdir sandbox) with 0 violations', () => {
    const content = [
      `import { tmpdir } from 'node:os';`,
      `const sandbox = mkdtempSync(join(tmpdir(), 'test-'));`,
      `writeFileSync(join(sandbox, '.deckent', 'config.json'), '{}');`,
    ].join('\n');
    const violations = checkFile(content, 'tests/clean.test.ts');
    expect(violations).toHaveLength(0);
  });

  it('does not flag comment-only lines', () => {
    const content = [
      `// process.cwd() + .deckent/config.json example in comment`,
      `// readFileSync('.brain/memory.db') is mentioned here too`,
    ].join('\n');
    const violations = checkFile(content, 'tests/comments.test.ts');
    expect(violations).toHaveLength(0);
  });

  it('includes file:line:match:label in each violation object', () => {
    const content = `const p = join(process.cwd(), '.deckent', 'config.json');`;
    const violations = checkFile(content, 'tests/reporter.test.ts');
    expect(violations.length).toBeGreaterThan(0);
    const v = violations[0];
    expect(v).toHaveProperty('file', 'tests/reporter.test.ts');
    expect(v).toHaveProperty('line', 1);
    expect(typeof v.label).toBe('string');
    expect(typeof v.match).toBe('string');
    expect(v.match).toContain('process.cwd()');
  });

  it('does not flag .deckent paths inside a tmpdir variable on the same line', () => {
    // Line that has both process.cwd() and tmpdir() — should be treated as hermetic
    const content = `const p = join(process.cwd(), tmpdir(), '.deckent', 'test');`;
    const violations = checkFile(content, 'tests/mixed.test.ts');
    expect(violations).toHaveLength(0);
  });

  it('does not flag lines using mkdtempSync sandbox with .deckent', () => {
    const content = [
      `const sandbox = mkdtempSync(join(tmpdir(), 'x-'));`,
      `const cfg = join(sandbox, '.deckent', 'config.json');`,
    ].join('\n');
    // Line 2 has .deckent but NOT process.cwd() — doesn't match any violation pattern
    const violations = checkFile(content, 'tests/sandbox.test.ts');
    expect(violations).toHaveLength(0);
  });

  it('detects split-line aliases that write into the live .tasks authority', () => {
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      `import { join } from 'node:path';`,
      `const ROOT = process.cwd();`,
      `const TASKS = join(ROOT, '.tasks');`,
      `const target = join(TASKS, 'task-leak.hb');`,
      `writeFileSync(target, '{}');`,
    ].join('\n');
    const violations = checkFile(content, 'tests/live-tasks.test.ts');
    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        line: 6,
        code: 'E_HERMETIC_TASKS_WRITE',
      }),
    ]));
  });

  it('detects projectDir capability forwarding into a spawned provider', () => {
    const content = [
      `const provider = makeProvider({ projectDir: process.cwd() });`,
      `provider.spawn('task-1', 'model', 'prompt');`,
    ].join('\n');
    const registry = deriveWriterRegistry(content, 'tests/provider.test.ts');
    expect(registry).toEqual(expect.arrayContaining([
      expect.objectContaining({
        effect: 'provider.spawn:project-capability',
        targetProvenance: 'live-tasks',
        classification: 'violation',
      }),
    ]));
  });

  it('does not classify a read-only open as a writer', () => {
    const content = [
      `import { openSync } from 'node:fs';`,
      `import { join } from 'node:path';`,
      `const tasks = join(process.cwd(), '.tasks');`,
      `const fd = openSync(join(tasks, 'task-1.json'), 'r');`,
    ].join('\n');
    expect(deriveWriterRegistry(content, 'tests/reader.test.ts')).toHaveLength(0);
  });

  it('classifies tmpdir-derived writers as sandboxed without a filename waiver', () => {
    const content = [
      `import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';`,
      `import { tmpdir } from 'node:os';`,
      `import { join } from 'node:path';`,
      `const root = mkdtempSync(join(tmpdir(), 'fixture-'));`,
      `const tasks = join(root, '.tasks');`,
      `mkdirSync(tasks, { recursive: true });`,
      `writeFileSync(join(tasks, 'task-1.hb'), '{}');`,
    ].join('\n');
    const registry = deriveWriterRegistry(content, 'tests/provider.test.ts');
    expect(registry.filter(entry => entry.classification === 'violation')).toHaveLength(0);
    expect(registry.filter(entry => entry.classification === 'sandboxed').length)
      .toBeGreaterThanOrEqual(2);
  });

  it('keeps repo-local .test-* scratch visible as migration debt, not live .tasks authority', () => {
    const content = [
      `import { mkdirSync } from 'node:fs';`,
      `import { join } from 'node:path';`,
      `const root = join(process.cwd(), '.test-worker-' + process.pid);`,
      `const tasks = join(root, '.tasks');`,
      `mkdirSync(tasks, { recursive: true });`,
    ].join('\n');
    const registry = deriveWriterRegistry(content, 'tests/legacy-scratch.test.ts');
    expect(registry).toEqual([
      expect.objectContaining({
        targetProvenance: 'repo-scratch',
        classification: 'migration',
      }),
    ]);
  });

  it('does not waive a live writer merely because it appears inside any toThrow assertion', () => {
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      `import { join } from 'node:path';`,
      `const target = join(process.cwd(), '.tasks', 'leak');`,
      `expect(() => { writeFileSync(target, 'x'); throw new Error('other'); }).toThrow();`,
    ].join('\n');
    const registry = deriveWriterRegistry(content, 'tests/fake-denial.test.ts');
    expect(registry).toEqual([
      expect.objectContaining({ classification: 'violation' }),
    ]);
  });

  it('records an exact stable-code guard assertion as a guarded denial', () => {
    const content = [
      `import { expect as assert } from 'vitest';`,
      `import { writeFileSync } from 'node:fs';`,
      `import { join } from 'node:path';`,
      `const target = join(process.cwd(), '.tasks', 'probe');`,
      `assert(() => writeFileSync(target, 'x')).toThrow(/E_HERMETIC_TASKS_WRITE/);`,
    ].join('\n');
    const registry = deriveWriterRegistry(content, 'tests/guard-denial.test.ts');
    expect(registry).toEqual([
      expect.objectContaining({ classification: 'guarded-denial' }),
    ]);
  });

  it('resolves same-name bindings by lexical identity instead of global name', () => {
    const content = [
      `import { mkdtempSync, writeFileSync } from 'node:fs';`,
      `import { tmpdir } from 'node:os';`,
      `import { join } from 'node:path';`,
      `const ROOT = process.cwd();`,
      `writeFileSync(join(ROOT, '.tasks', 'outer'), 'x');`,
      `{`,
      `  const ROOT = mkdtempSync(join(tmpdir(), 'inner-'));`,
      `  writeFileSync(join(ROOT, '.tasks', 'inner'), 'x');`,
      `}`,
    ].join('\n');
    const registry = deriveWriterRegistry(content, 'tests/scoped.test.ts');
    expect(registry).toEqual(expect.arrayContaining([
      expect.objectContaining({
        line: 5,
        targetProvenance: 'live-tasks',
        classification: 'violation',
      }),
      expect.objectContaining({
        line: 8,
        targetProvenance: 'temp',
        classification: 'sandboxed',
      }),
    ]));
    expect(registry.filter(entry => entry.classification === 'violation')).toHaveLength(1);
  });

  it('does not trust a local function that merely has the name tmpdir', () => {
    const content = [
      `import { mkdtempSync, writeFileSync } from 'node:fs';`,
      `import { join } from 'node:path';`,
      `function tmpdir() { return process.cwd(); }`,
      `const root = mkdtempSync(join(tmpdir(), 'fake-'));`,
      `writeFileSync(join(root, '.tasks', 'leak'), 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/fake-temp.test.ts')).toEqual([
      expect.objectContaining({
        code: 'E_HERMETIC_TASKS_WRITE',
        line: 5,
      }),
    ]);
  });

  it('does not treat a local same-named function as an fs mutation sink', () => {
    const content = [
      `function writeFileSync(_path: string, _value: string) {}`,
      `writeFileSync('.tasks/not-an-fs-write', 'x');`,
    ].join('\n');
    expect(deriveWriterRegistry(content, 'tests/fake-fs.test.ts')).toHaveLength(0);
  });

  it('honors lexical shadowing over an imported fs sink capability', () => {
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      `{`,
      `  const writeFileSync = (_path: string, _value: string) => undefined;`,
      `  writeFileSync('.tasks/not-an-fs-write', 'x');`,
      `}`,
    ].join('\n');
    expect(deriveWriterRegistry(content, 'tests/shadowed-fs.test.ts')).toHaveLength(0);
  });

  it('supports trusted Node import aliases, namespaces, and computed members', () => {
    const content = [
      `import { mkdtempSync as makeRoot, writeFileSync as write } from 'node:fs';`,
      `import { tmpdir as osTemp } from 'node:os';`,
      `import * as path from 'node:path';`,
      `const root = makeRoot(path['join'](osTemp(), 'fixture-'));`,
      `write(path.join(root, '.tasks', 'task'), 'x');`,
    ].join('\n');
    const registry = deriveWriterRegistry(content, 'tests/import-alias.test.ts');
    expect(registry).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetProvenance: 'temp',
        classification: 'sandboxed',
      }),
    ]));
    expect(registry.filter(entry => entry.classification === 'violation')).toHaveLength(0);
  });

  it('fails loud for exact relative live authority paths with boundary-specific codes', () => {
    const content = [
      `import { mkdirSync, writeFileSync } from 'node:fs';`,
      `writeFileSync('.tasks/task.hb', 'x');`,
      `mkdirSync('./.locks/worker', { recursive: true });`,
      `writeFileSync('dist/index.js', 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/relative-boundaries.test.ts')).toEqual([
      expect.objectContaining({ line: 2, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 3, code: 'E_HERMETIC_PROJECT_WRITE' }),
      expect.objectContaining({ line: 4, code: 'E_HERMETIC_DIST_CLEAN' }),
    ]);
  });

  it('keeps an unknown path base with a protected suffix honest-unresolved', () => {
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      `import { join } from 'node:path';`,
      `declare function externalRoot(): string;`,
      `writeFileSync(join(externalRoot(), '.tasks', 'task.hb'), 'x');`,
    ].join('\n');
    expect(deriveWriterRegistry(content, 'tests/unknown-base.test.ts')).toEqual([
      expect.objectContaining({
        line: 4,
        targetProvenance: 'unknown',
        classification: 'unresolved',
      }),
    ]);
  });

  it('requires the denial code to match the exact protected boundary', () => {
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      `expect(() => writeFileSync('dist/index.js', 'x'))`,
      `  .toThrow(/E_HERMETIC_TASKS_WRITE/);`,
    ].join('\n');
    expect(deriveWriterRegistry(content, 'tests/wrong-code.test.ts')).toEqual([
      expect.objectContaining({
        targetProvenance: 'live-dist',
        classification: 'violation',
      }),
    ]);
  });

  it('rejects a forged stable-code denial produced by an explicit throw', () => {
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      `expect(() => {`,
      `  writeFileSync('.tasks/probe', 'x');`,
      `  throw new Error('E_HERMETIC_TASKS_WRITE');`,
      `}).toThrow(/E_HERMETIC_TASKS_WRITE/);`,
    ].join('\n');
    expect(deriveWriterRegistry(content, 'tests/forged-denial.test.ts')).toEqual([
      expect.objectContaining({
        targetProvenance: 'live-tasks',
        classification: 'violation',
      }),
    ]);
  });

  it('reconstructs protected paths split across binary, template, and compound assignment', () => {
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      `writeFileSync('.ta' + 'sks/binary', 'x');`,
      "writeFileSync(`${'.ta'}sks/template`, 'x');",
      `let target = '.ta';`,
      `target += 'sks/compound';`,
      `writeFileSync(target, 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/static-splits.test.ts')).toEqual([
      expect.objectContaining({ line: 2, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 3, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 6, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]);
  });

  it('conservatively retains hazardous conditional and array-destructured branches', () => {
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      `const conditional = true ? '.locks/x' : 'safe';`,
      `const [destructured] = ['dist/x'];`,
      `writeFileSync(conditional, 'x');`,
      `writeFileSync(destructured, 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/static-branches.test.ts')).toEqual([
      expect.objectContaining({ line: 4, code: 'E_HERMETIC_PROJECT_WRITE' }),
      expect.objectContaining({ line: 5, code: 'E_HERMETIC_DIST_CLEAN' }),
    ]);
  });

  it('binds var declarations to the nearest function/source scope', () => {
    const content = [
      `import { mkdtempSync, writeFileSync } from 'node:fs';`,
      `import { tmpdir } from 'node:os';`,
      `import { join } from 'node:path';`,
      `var root = mkdtempSync(join(tmpdir(), 'safe-'));`,
      `{ var root = process.cwd(); }`,
      `writeFileSync(join(root, '.tasks', 'x'), 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/var-scope.test.ts')).toEqual([
      expect.objectContaining({ line: 6, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]);
  });

  it('propagates trusted fs authority through const and object-destructured aliases', () => {
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      `import * as fs from 'node:fs';`,
      `const saveTask = writeFileSync;`,
      `const { writeFileSync: saveLock } = fs;`,
      `saveTask('.tasks/x', 'x');`,
      `saveLock('.locks/x', 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/fs-capability-aliases.test.ts')).toEqual([
      expect.objectContaining({ line: 5, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 6, code: 'E_HERMETIC_PROJECT_WRITE' }),
    ]);
  });

  it('does not propagate fs authority through aliases of local fakes', () => {
    const content = [
      `const fake = (_path: string, _value: string) => undefined;`,
      `const save = fake;`,
      `const localFs = { writeFileSync: fake };`,
      `const { writeFileSync: destructured } = localFs;`,
      `save('.tasks/x', 'x');`,
      `destructured('.locks/x', 'x');`,
    ].join('\n');
    expect(deriveWriterRegistry(content, 'tests/fake-capability-aliases.test.ts'))
      .toHaveLength(0);
  });

  it('treats deferred path.resolve segments as absolute-reset risk without trusting join', () => {
    const content = [
      `import { mkdtempSync, writeFileSync } from 'node:fs';`,
      `import { tmpdir } from 'node:os';`,
      `import { join, resolve } from 'node:path';`,
      `function probe(base: string) {`,
      `  const temp = mkdtempSync(join(tmpdir(), 'safe-'));`,
      `  writeFileSync(resolve(temp, base, '.tasks/x'), 'x');`,
      `  writeFileSync(join(temp, base, '.tasks/y'), 'x');`,
      `}`,
      `probe(process.cwd());`,
    ].join('\n');
    const registry = deriveWriterRegistry(content, 'tests/resolve-reset.test.ts');
    expect(registry).toEqual(expect.arrayContaining([
      expect.objectContaining({
        line: 6,
        targetProvenance: 'live-tasks',
        classification: 'violation',
      }),
      expect.objectContaining({
        line: 7,
        classification: 'unresolved',
      }),
    ]));
  });

  it('normalizes only an effective first protected relative segment', () => {
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      `writeFileSync('fixtures/.tasks/x', 'x');`,
      `writeFileSync('.tasks/../safe.txt', 'x');`,
      `writeFileSync('foo/dist/x', 'x');`,
      `writeFileSync('./x/../.tasks/y', 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/normalized-boundary.test.ts')).toEqual([
      expect.objectContaining({ line: 5, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]);
  });

  it('requires a block denial thunk to contain exactly one direct mutation statement', () => {
    const content = [
      `import { expect } from 'vitest';`,
      `import { writeFileSync } from 'node:fs';`,
      `function forged() { throw new Error('E_HERMETIC_TASKS_WRITE'); }`,
      `expect(() => {`,
      `  writeFileSync('.tasks/x', 'x');`,
      `  forged();`,
      `}).toThrow(/E_HERMETIC_TASKS_WRITE/);`,
    ].join('\n');
    expect(deriveWriterRegistry(content, 'tests/indirect-denial.test.ts')).toEqual([
      expect.objectContaining({ classification: 'violation' }),
    ]);
  });

  it('registers Node 24 disposable temp APIs as protected fs sinks', () => {
    const content = [
      `import { mkdtempDisposableSync } from 'node:fs';`,
      `import { mkdtempDisposable } from 'node:fs/promises';`,
      `mkdtempDisposableSync('.tasks/disposable-');`,
      `mkdtempDisposable('.locks/disposable-');`,
    ].join('\n');
    expect(checkFile(content, 'tests/disposable-temp.test.ts')).toEqual([
      expect.objectContaining({ line: 3, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 4, code: 'E_HERMETIC_PROJECT_WRITE' }),
    ]);
  });

  it('retains live authority through cwd binary and template composition', () => {
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      `const binary = process.cwd() + '/.tasks/binary';`,
      'const template = `${process.cwd()}/.tasks/template`;',
      `writeFileSync(binary, 'x');`,
      `writeFileSync(template, 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/composed-live-path.test.ts')).toEqual([
      expect.objectContaining({ line: 4, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 5, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]);
  });

  it('retains a hazardous conditional object branch through destructuring', () => {
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      `const choice = true ? { target: '.tasks/x' } : { target: '/tmp/x' };`,
      `const { target } = choice;`,
      `writeFileSync(target, 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/conditional-destructure.test.ts')).toEqual([
      expect.objectContaining({ line: 4, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]);
  });

  it('models var redeclarations as one hoisted binding with hazardous branches dominant', () => {
    const content = [
      `import { mkdtempSync, writeFileSync } from 'node:fs';`,
      `import { tmpdir } from 'node:os';`,
      `import { join } from 'node:path';`,
      `var root = process.cwd();`,
      `if (false) { var root = mkdtempSync(join(tmpdir(), 'safe-')); }`,
      `writeFileSync(join(root, '.tasks/x'), 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/var-hoist-control-flow.test.ts')).toEqual([
      expect.objectContaining({ line: 6, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]);
  });

  it('keeps trusted fs capability at its use position despite a future reassignment', () => {
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      `let save = writeFileSync;`,
      `save('.tasks/x', 'x');`,
      `save = function () {};`,
    ].join('\n');
    expect(checkFile(content, 'tests/fs-use-order.test.ts')).toEqual([
      expect.objectContaining({ line: 3, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]);
  });

  it('propagates call arguments into an interprocedural fs sink helper', () => {
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      `function save(target: string) { writeFileSync(target, 'x'); }`,
      `save('.tasks/x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/sink-helper.test.ts')).toEqual([
      expect.objectContaining({ line: 2, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]);
  });

  it('propagates shorthand, spread, object alias, and receiver alias projectDir authority', () => {
    const content = [
      `const projectDir = process.cwd();`,
      `const base = { projectDir };`,
      `const options = { ...base };`,
      `const provider = makeProvider(options);`,
      `const alias = provider;`,
      `alias.spawn('task', 'model', 'prompt');`,
    ].join('\n');
    expect(deriveWriterRegistry(content, 'tests/project-shorthand.test.ts')).toEqual([
      expect.objectContaining({
        line: 6,
        effect: 'alias.spawn:project-capability',
        targetProvenance: 'live-tasks',
        classification: 'violation',
      }),
    ]);
  });

  it('honors path.resolve absolute resets and rejects temp-root traversal escapes', () => {
    const absoluteLiveTask = join(REPO_ROOT, '.tasks', 'absolute-reset');
    const content = [
      `import { mkdtempSync, writeFileSync } from 'node:fs';`,
      `import { tmpdir } from 'node:os';`,
      `import { join, resolve } from 'node:path';`,
      `const root = mkdtempSync(join(tmpdir(), 'safe-'));`,
      `writeFileSync(resolve(root, ${JSON.stringify(absoluteLiveTask)}), 'x');`,
      `writeFileSync(resolve(root, '..', '.tasks/escaped'), 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/resolve-absolute-reset.test.ts')).toEqual([
      expect.objectContaining({ line: 5, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 6, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]);
  });

  it('rejects a guard denial forged by an argument that throws before mutation', () => {
    const content = [
      `import { expect } from 'vitest';`,
      `import { writeFileSync } from 'node:fs';`,
      `expect(() => writeFileSync(`,
      `  '.tasks/x',`,
      `  (() => { throw new Error('E_HERMETIC_TASKS_WRITE'); })(),`,
      `)).toThrow(/E_HERMETIC_TASKS_WRITE/);`,
    ].join('\n');
    expect(deriveWriterRegistry(content, 'tests/argument-forged-denial.test.ts')).toEqual([
      expect.objectContaining({
        targetProvenance: 'live-tasks',
        classification: 'violation',
      }),
    ]);
  });

  it('recognizes fs.promises aliases and ambient CommonJS require capabilities', () => {
    const content = [
      `import * as fsImport from 'node:fs';`,
      `const fsp = fsImport.promises;`,
      `fsp.writeFile('.tasks/promise', 'x');`,
      `declare const require: NodeRequire;`,
      `const requiredFs = require('node:fs');`,
      `requiredFs.writeFileSync('.tasks/required', 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/fs-capability-family.test.ts')).toEqual([
      expect.objectContaining({ line: 3, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 6, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]);
  });

  it('retains fs capability through projections, bind, dynamic import, and import-equals', () => {
    const content = [
      `import * as fs from 'node:fs';`,
      `import fsEq = require('node:fs');`,
      `const { promises: destructuredPromises } = fs;`,
      `const computedPromises = fs['promises'];`,
      `const namespaceAlias = fs;`,
      `const boundWrite = fs.writeFileSync.bind(fs);`,
      `const dynamicFs = await import('node:fs');`,
      `destructuredPromises.writeFile('.tasks/destructured', 'x');`,
      `computedPromises.writeFile('.tasks/computed', 'x');`,
      `namespaceAlias.writeFileSync('.tasks/alias', 'x');`,
      `boundWrite('.tasks/bound', 'x');`,
      `fsEq.writeFileSync('.tasks/import-equals', 'x');`,
      `dynamicFs.writeFileSync('.tasks/dynamic', 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/fs-capability-extended.test.ts')).toEqual([
      expect.objectContaining({ line: 8, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 9, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 10, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 11, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 12, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 13, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]);
  });

  it('retains possible fs authority through logical, conditional, object, and computed aliases', () => {
    const content = [
      `import * as fs from 'node:fs';`,
      `import { writeFileSync } from 'node:fs';`,
      `declare const choose: boolean;`,
      `declare const fake: undefined | typeof writeFileSync;`,
      `let logical: typeof writeFileSync | undefined;`,
      `logical ||= writeFileSync;`,
      `logical('.tasks/logical', 'x');`,
      `let conditional = writeFileSync;`,
      `if (false) conditional = () => undefined;`,
      `conditional('.tasks/conditional', 'x');`,
      `const caps = { save: writeFileSync };`,
      `caps.save('.tasks/object', 'x');`,
      `const sink = 'writeFileSync';`,
      `fs[sink]('.tasks/computed', 'x');`,
      `const branch = choose ? writeFileSync : () => undefined;`,
      `branch('.tasks/branch', 'x');`,
      `const nullish = fake ?? writeFileSync;`,
      `nullish('.tasks/nullish', 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/fs-capability-branches.test.ts')).toEqual([
      expect.objectContaining({ line: 7, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 10, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 12, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 14, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 16, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 18, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]);
  });

  it('normalizes nested destructure and call/apply/bind fs invocation wrappers', () => {
    const content = [
      `import * as fs from 'node:fs';`,
      `import { writeFileSync } from 'node:fs';`,
      `const { promises: { writeFile: save } } = fs;`,
      `save('.tasks/destructured', 'x');`,
      `writeFileSync.call(null, '.tasks/call', 'x');`,
      `writeFileSync.apply(null, ['.tasks/apply', 'x']);`,
      `writeFileSync.bind(null)('.tasks/bind', 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/fs-invocation-wrappers.test.ts')).toEqual([
      expect.objectContaining({ line: 4, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 5, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 6, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 7, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]);
  });

  it('propagates destructured parameters and object-method helper arguments to sinks', () => {
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      `function save({ target }: { target: string }) { writeFileSync(target, 'x'); }`,
      `const helpers = { save(target: string) { writeFileSync(target, 'x'); } };`,
      `save({ target: '.tasks/destructured-helper' });`,
      `helpers.save('.tasks/object-method');`,
    ].join('\n');
    expect(checkFile(content, 'tests/structured-helpers.test.ts')).toEqual([
      expect.objectContaining({ line: 2, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 3, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]);
  });

  it('tracks property/destructuring assignments, aliased apply argv, and getBuiltinModule', () => {
    const content = [
      `import * as fs from 'node:fs';`,
      `import { writeFileSync } from 'node:fs';`,
      `let save: typeof writeFileSync;`,
      `({ writeFileSync: save } = fs);`,
      `const caps: { save?: typeof writeFileSync } = {};`,
      `caps.save = writeFileSync;`,
      `const args = ['.tasks/apply-alias', 'x'] as const;`,
      `caps.save!('.tasks/property-assignment', 'x');`,
      `save('.tasks/destructuring-assignment', 'x');`,
      `writeFileSync.apply(null, args);`,
      `process.getBuiltinModule('fs').writeFileSync('.tasks/get-builtin', 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/mutation-capabilities.test.ts')).toEqual([
      expect.objectContaining({ line: 8, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 9, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 10, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 11, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]);
  });

  it('does not waive a guard after a trusted fs spy replaces the sink', () => {
    const content = [
      `import * as fs from 'node:fs';`,
      `import { expect, vi } from 'vitest';`,
      `vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {`,
      `  throw new Error('E_HERMETIC_TASKS_WRITE');`,
      `});`,
      `expect(() => fs.writeFileSync('.tasks/spied', 'x'))`,
      `  .toThrow('E_HERMETIC_TASKS_WRITE');`,
    ].join('\n');
    expect(checkFile(content, 'tests/spied-guard.test.ts')).toEqual([
      expect.objectContaining({ line: 6, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]);
  });

  it('never authenticates guard denial through mocked fs or an unbound expect', () => {
    const content = [
      `import { expect, vi } from 'vitest';`,
      `import { writeFileSync } from 'node:fs';`,
      `vi.mock('node:fs', () => ({`,
      `  writeFileSync() { throw new Error('E_HERMETIC_TASKS_WRITE'); },`,
      `}));`,
      `expect(() => writeFileSync('.tasks/mocked', 'x'))`,
      `  .toThrow(/E_HERMETIC_TASKS_WRITE/);`,
      `{`,
      `  const expect = undefined as any;`,
      `  expect(() => writeFileSync('.tasks/unbound', 'x'))`,
      `    .toThrow(/E_HERMETIC_TASKS_WRITE/);`,
      `}`,
    ].join('\n');
    expect(deriveWriterRegistry(content, 'tests/guard-authenticity.test.ts')).toEqual([
      expect.objectContaining({ line: 6, classification: 'violation' }),
      expect.objectContaining({ line: 10, classification: 'violation' }),
    ]);
  });

  it('canonicalizes dot segments before matching absolute repo boundaries', () => {
    const liveRoot = REPO_ROOT.replaceAll('\\', '/');
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      `writeFileSync(${JSON.stringify(`${liveRoot}/../${liveRoot.split('/').at(-1)}/.tasks/a`)}, 'x');`,
      `writeFileSync(${JSON.stringify(`${liveRoot}/./.tasks/b`)}, 'x');`,
      `writeFileSync(${JSON.stringify(`${liveRoot}/foo/../.tasks/c`)}, 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/canonical-live-paths.test.ts')).toEqual([
      expect.objectContaining({ line: 2, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 3, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 4, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]);
  });

  it('treats portable case and trailing-dot aliases as live boundaries', () => {
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      `writeFileSync('.TASKS/case-alias', 'x');`,
      `writeFileSync('.tasks./trailing-dot-alias', 'x');`,
      `writeFileSync('DIST./output', 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/portable-path-aliases.test.ts')).toEqual([
      expect.objectContaining({ line: 2, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 3, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 4, code: 'E_HERMETIC_DIST_CLEAN' }),
    ]);
  });

  it('uses one protected-root policy for .brain and .deckent direct mutations', () => {
    const liveRoot = REPO_ROOT.replaceAll('\\', '/');
    const caseFoldedRoot = liveRoot.toUpperCase();
    const content = [
      `import { rmSync, writeFileSync } from 'node:fs';`,
      `import { join } from 'node:path';`,
      `writeFileSync('.brain/memory.db', 'x');`,
      `rmSync(join(process.cwd(), '.deckent', 'config.json'));`,
      `writeFileSync(${JSON.stringify(`${liveRoot}/.brain/state`)}, 'x');`,
      `writeFileSync(${JSON.stringify(`${caseFoldedRoot}/.DECKENT./state`)}, 'x');`,
      `writeFileSync('C:.tasks\\\\drive-relative', 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/protected-policy.test.ts')).toEqual(expect.arrayContaining([
      expect.objectContaining({ line: 3, code: 'E_HERMETIC_PROJECT_WRITE' }),
      expect.objectContaining({ line: 4, code: 'E_HERMETIC_PROJECT_WRITE' }),
      expect.objectContaining({ line: 5, code: 'E_HERMETIC_PROJECT_WRITE' }),
      expect.objectContaining({ line: 6, code: 'E_HERMETIC_PROJECT_WRITE' }),
      expect.objectContaining({ line: 7, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]));
  });

  it('keeps untranslatable Windows namespace paths honest-unresolved', () => {
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      String.raw`writeFileSync('\\\\?\\C:\\repo\\.tasks\\x', 'x');`,
    ].join('\n');
    expect(deriveWriterRegistry(content, 'tests/windows-namespace.test.ts')).toEqual([
      expect.objectContaining({
        line: 2,
        targetProvenance: 'unknown',
        classification: 'unresolved',
      }),
    ]);
  });

  it('never lets guarded-denial evidence waive a confirmed live target', () => {
    const content = [
      `import { expect } from 'vitest';`,
      `import { writeFileSync } from 'node:fs';`,
      `expect(() => writeFileSync('.tasks/probe', 'x'))`,
      `  .toThrow(/E_HERMETIC_TASKS_WRITE/);`,
    ].join('\n');
    expect(deriveWriterRegistry(content, 'tests/guard-evidence.test.ts')).toEqual([
      expect.objectContaining({ classification: 'guarded-denial' }),
    ]);
    expect(checkFile(content, 'tests/guard-evidence.test.ts')).toEqual([
      expect.objectContaining({ line: 3, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]);
  });

  it('registers opaque apply argv as unresolved instead of dropping the sink', () => {
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      `declare const args: Parameters<typeof writeFileSync>;`,
      `writeFileSync.apply(null, args);`,
    ].join('\n');
    expect(deriveWriterRegistry(content, 'tests/opaque-apply.test.ts')).toEqual([
      expect.objectContaining({
        line: 3,
        classification: 'unresolved',
        targetProvenance: 'unknown',
      }),
    ]);
  });

  it('tracks trusted createRequire/module.require builtin capabilities only', () => {
    const content = [
      `import { createRequire as makeRequire } from 'node:module';`,
      `const req = makeRequire(import.meta.url);`,
      `const fs = req('node:fs');`,
      `const { writeFileSync: save } = req('fs');`,
      `fs.writeFileSync('.tasks/create-require', 'x');`,
      `save('.brain/create-require', 'x');`,
      `module.require('node:fs').rmSync('.deckent/module-require');`,
      `declare const moduleName: string;`,
      `req(moduleName).writeFileSync('.tasks/opaque-module', 'x');`,
    ].join('\n');
    expect(deriveWriterRegistry(content, 'tests/create-require.test.ts')).toEqual([
      expect.objectContaining({
        line: 5,
        targetProvenance: 'live-tasks',
        classification: 'violation',
      }),
      expect.objectContaining({
        line: 6,
        targetProvenance: 'live-brain',
        classification: 'violation',
      }),
      expect.objectContaining({
        line: 7,
        targetProvenance: 'live-deckent',
        classification: 'violation',
      }),
      expect.objectContaining({
        line: 9,
        targetProvenance: 'unknown',
        classification: 'unresolved',
      }),
    ]);

    const shadowed = [
      `function createRequire(_url: string) {`,
      `  return (_name: string) => ({ writeFileSync() {} });`,
      `}`,
      `createRequire('local')('node:fs').writeFileSync('.tasks/fake', 'x');`,
    ].join('\n');
    expect(deriveWriterRegistry(shadowed, 'tests/local-create-require.test.ts')).toEqual([]);
  });

  it('canonicalizes temp and repo-scratch traversal before granting sandbox authority', () => {
    const liveRoot = REPO_ROOT.replaceAll('\\', '/');
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      `import { join } from 'node:path';`,
      `writeFileSync('/tmp/../${liveRoot.replace(/^\//, '')}/.tasks/temp-escape', 'x');`,
      `writeFileSync(join(process.cwd(), '.test-sandbox', '..', '.tasks/scratch-escape'), 'x');`,
      `writeFileSync(join(process.cwd(), '.tmp-safe', '..', 'dist/output'), 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/path-traversal-authority.test.ts')).toEqual([
      expect.objectContaining({ line: 3, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 4, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 5, code: 'E_HERMETIC_DIST_CLEAN' }),
    ]);
  });

  it('rejects guarded denial when identifier coercion can throw before the fs call', () => {
    const content = [
      `import { expect } from 'vitest';`,
      `import { writeFileSync } from 'node:fs';`,
      `const evil = { [Symbol.toPrimitive]() {`,
      `  throw new Error('E_HERMETIC_TASKS_WRITE');`,
      `} };`,
      `const target = false ? '.tasks/x' : evil;`,
      `expect(() => writeFileSync(target as any, 'x'))`,
      `  .toThrow(/E_HERMETIC_TASKS_WRITE/);`,
    ].join('\n');
    expect(deriveWriterRegistry(content, 'tests/coercion-forged-denial.test.ts')).toEqual([
      expect.objectContaining({ line: 7, classification: 'violation' }),
    ]);
  });

  it('preserves trusted capabilities through common TypeScript expression wrappers', () => {
    const content = [
      `import { writeFileSync } from 'node:fs';`,
      `const cast = writeFileSync as typeof writeFileSync;`,
      `const asserted = writeFileSync!;`,
      `const satisfied = writeFileSync satisfies typeof writeFileSync;`,
      `cast('.tasks/cast', 'x');`,
      `asserted('.tasks/asserted', 'x');`,
      `satisfied('.tasks/satisfied', 'x');`,
      `(writeFileSync as any)('.tasks/direct', 'x');`,
    ].join('\n');
    expect(checkFile(content, 'tests/ts-capability-wrappers.test.ts')).toEqual([
      expect.objectContaining({ line: 5, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 6, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 7, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 8, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]);
  });

  it('tracks async disposable ownership and destructured path projections as temp', () => {
    const content = [
      `import { mkdtempDisposable, writeFile } from 'node:fs/promises';`,
      `import { tmpdir } from 'node:os';`,
      `import { join } from 'node:path';`,
      `const owned = await mkdtempDisposable(join(tmpdir(), 'safe-'));`,
      `const { path: root } = await mkdtempDisposable(join(tmpdir(), 'safe-'));`,
      `await writeFile(join(owned.path, '.tasks/a'), 'x');`,
      `await writeFile(join(root, '.tasks/b'), 'x');`,
    ].join('\n');
    const writes = deriveWriterRegistry(content, 'tests/async-disposable-path.test.ts')
      .filter(entry => entry.effect === 'fs.writeFile');
    expect(writes).toEqual([
      expect.objectContaining({ line: 6, classification: 'sandboxed' }),
      expect.objectContaining({ line: 7, classification: 'sandboxed' }),
    ]);
  });

  it('covers additional fs mutators and the WriteStream constructor', () => {
    const content = [
      `import { WriteStream, lchownSync, lutimesSync } from 'node:fs';`,
      `new WriteStream('.tasks/stream');`,
      `lchownSync('.tasks/owner', 1, 1);`,
      `lutimesSync('.locks/time', new Date(), new Date());`,
    ].join('\n');
    expect(checkFile(content, 'tests/fs-mutation-matrix.test.ts')).toEqual([
      expect.objectContaining({ line: 2, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 3, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 4, code: 'E_HERMETIC_PROJECT_WRITE' }),
    ]);
  });

  it('propagates project authority through direct, computed, nested, conditional, and return flows', () => {
    const content = [
      `declare const makeProvider: any;`,
      `makeProvider({ projectDir: process.cwd() }).spawn('a', 'm', 'p');`,
      `const computed = makeProvider({ projectDir: process.cwd() });`,
      `computed['spawn']('b', 'm', 'p');`,
      `const providers = { live: makeProvider({ projectDir: process.cwd() }) };`,
      `providers.live.spawn('c', 'm', 'p');`,
      `let conditional = makeProvider({ projectDir: process.cwd() });`,
      `if (false) conditional = { spawn() {} };`,
      `conditional.spawn('d', 'm', 'p');`,
      `function make() { return makeProvider({ projectDir: process.cwd() }); }`,
      `const returned = make();`,
      `returned.spawn('e', 'm', 'p');`,
    ].join('\n');
    const violations = deriveWriterRegistry(content, 'tests/project-flow.test.ts')
      .filter(entry => entry.classification === 'violation');
    expect(violations.map(entry => entry.line)).toEqual([2, 4, 6, 9, 12]);
    expect(violations.every(entry => entry.targetProvenance === 'live-tasks')).toBe(true);
  });

  it('retains disposable temp ownership through its path projection', () => {
    const content = [
      `import { mkdtempDisposableSync, writeFileSync } from 'node:fs';`,
      `import { tmpdir } from 'node:os';`,
      `import { join } from 'node:path';`,
      `const owned = mkdtempDisposableSync(join(tmpdir(), 'safe-'));`,
      `writeFileSync(join(owned.path, '.tasks/x'), 'x');`,
    ].join('\n');
    expect(deriveWriterRegistry(content, 'tests/disposable-path.test.ts')).toEqual([
      expect.objectContaining({
        line: 4,
        targetProvenance: 'temp',
        classification: 'sandboxed',
      }),
      expect.objectContaining({
        line: 5,
        targetProvenance: 'temp',
        classification: 'sandboxed',
      }),
    ]);
  });

  it('detects legacy live reads through aliases without unrelated same-line temp waivers', () => {
    const content = [
      `import { readFileSync } from 'node:fs';`,
      `import { tmpdir } from 'node:os';`,
      `import { join } from 'node:path';`,
      `const root = process.cwd();`,
      `readFileSync(join(root, '.brain', 'memory.db'));`,
      `readFileSync(join(process.cwd(), '.brain', 'memory.db')); tmpdir();`,
    ].join('\n');
    expect(checkFile(content, 'tests/legacy-read-alias.test.ts')).toEqual([
      expect.objectContaining({ line: 5, code: 'E_HERMETIC_LIVE_STATE_READ' }),
      expect.objectContaining({ line: 6, code: 'E_HERMETIC_LIVE_STATE_READ' }),
    ]);
  });

  it('covers legacy fs read capabilities and conditional aliases without name-based waivers', () => {
    const content = [
      `import * as fs from 'node:fs';`,
      `import { join } from 'node:path';`,
      `declare const choose: boolean;`,
      `declare const tmpDir: boolean;`,
      `const root = process.cwd();`,
      `fs.existsSync(join(root, '.brain', 'memory.db'));`,
      `fs.openSync(join(root, '.brain', 'memory.db'), 'r');`,
      `fs.statSync(join(root, '.deckent', 'config.json'));`,
      `const read = choose ? fs.readFileSync : () => Buffer.from('');`,
      `read(join(root, '.brain', 'memory.db'));`,
      `fs.existsSync(join(process.cwd(), tmpDir ? 'safe' : '.brain', 'memory.db'));`,
    ].join('\n');
    expect(checkFile(content, 'tests/legacy-read-family.test.ts')).toEqual([
      expect.objectContaining({ line: 6, code: 'E_HERMETIC_LIVE_STATE_READ' }),
      expect.objectContaining({ line: 7, code: 'E_HERMETIC_LIVE_STATE_READ' }),
      expect.objectContaining({ line: 8, code: 'E_HERMETIC_LIVE_STATE_READ' }),
      expect.objectContaining({ line: 10, code: 'E_HERMETIC_LIVE_STATE_READ' }),
      expect.objectContaining({ line: 11, code: 'E_HERMETIC_LIVE_STATE_READ' }),
    ]);
  });

  it('ignores the obsolete whole-file skipLegacyReads escape hatch', () => {
    const content = [
      `import { readFileSync } from 'node:fs';`,
      `readFileSync('.DECKENT./CONFIG.JSON.');`,
    ].join('\n');
    expect(checkFile(
      content,
      'tests/obsolete-read-waiver.test.ts',
      { skipLegacyReads: true },
    )).toEqual([
      expect.objectContaining({ line: 2, code: 'E_HERMETIC_LIVE_STATE_READ' }),
    ]);
  });
});

// ─── scanTestDir — allowlist ──────────────────────────────────────────────────

describe('scanTestDir — sandbox + allowlist', () => {
  it('scans a cycle-safe local support graph and Vitest setupFiles', () => {
    mkdirSync(join(sandbox, 'tests'));
    mkdirSync(join(sandbox, 'src'));
    writeFileSync(
      join(sandbox, 'tests', 'safe.test.ts'),
      [
        `import './helper.js';`,
        `import './missing-support.js';`,
        `import '@/missing-alias';`,
        `import '../src/production.js';`,
        `import type { Marker } from './type-only.js';`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'src', 'production.ts'),
      `export const production = true;\n`,
    );
    writeFileSync(
      join(sandbox, 'tests', 'helper.ts'),
      [
        `import './cycle.js';`,
        `import { writeFileSync } from 'node:fs';`,
        `writeFileSync('.tasks/imported-helper', 'x');`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'tests', 'cycle.ts'),
      `import './helper.js';\n`,
    );
    writeFileSync(
      join(sandbox, 'tests', 'setup.ts'),
      [
        `import { writeFileSync } from 'node:fs';`,
        `writeFileSync('.locks/setup-file', 'x');`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'tests', 'global.ts'),
      [
        `import { writeFileSync } from 'node:fs';`,
        `writeFileSync('.brain/global-setup', 'x');`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'tests', 'type-only.ts'),
      [
        `export interface Marker { value: string }`,
        `import { writeFileSync } from 'node:fs';`,
        `writeFileSync('.deckent/type-only', 'x');`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'vitest.shared.ts'),
      `export const shared = { test: { globalSetup: './tests/global.ts' } };\n`,
    );
    writeFileSync(
      join(sandbox, 'vitest.config.ts'),
      [
        `import { shared } from './vitest.shared.js';`,
        `const setup = ['./tests/setup.ts'];`,
        `export default { ...shared, test: { ...shared.test, setupFiles: setup } };`,
      ].join('\n'),
    );
    writeFileSync(join(sandbox, 'package.json'), JSON.stringify({ scripts: {} }));

    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'tests/helper.ts',
        line: 3,
        code: 'E_HERMETIC_TASKS_WRITE',
      }),
      expect.objectContaining({
        file: 'tests/setup.ts',
        line: 2,
        code: 'E_HERMETIC_PROJECT_WRITE',
      }),
      expect.objectContaining({
        file: 'tests/global.ts',
        line: 2,
        code: 'E_HERMETIC_PROJECT_WRITE',
      }),
    ]));
    expect(result.registry).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'tests/safe.test.ts',
        line: 2,
        effect: 'test-support:unresolved-import',
      }),
      expect.objectContaining({
        file: 'tests/safe.test.ts',
        line: 3,
        effect: 'test-support:unresolved-import',
      }),
      expect.objectContaining({
        file: 'src/production.ts',
        effect: 'test-support:production-dependency',
        classification: 'inventory',
      }),
    ]));
    expect(result.checked).toBe(5);
  });

  it('scans the cycle-safe eager production graph without executing dormant code', () => {
    mkdirSync(join(sandbox, 'tests'));
    mkdirSync(join(sandbox, 'src'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({ scripts: {} }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'eager-production.test.ts'),
      [
        `import '../src/entry.js';`,
        `import '../src/common.cjs';`,
        `import type { Dormant } from '../src/type-only.js';`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'src', 'entry.ts'),
      [
        `import { writeFileSync } from 'node:fs';`,
        `import { importedDanger } from './helper.js';`,
        `import './side-effect.js';`,
        `import './left.js';`,
        `import './right.js';`,
        `export * from './reexport.js';`,
        `importedDanger();`,
        `function localDanger() { writeFileSync('.brain/local', 'x'); }`,
        `localDanger();`,
        `(() => writeFileSync('.tasks/iife', 'x'))();`,
        `class Boot { static value = writeFileSync('.locks/static', 'x');`,
        `  dormant() { writeFileSync('.tasks/dormant-method', 'x'); } }`,
        `if (process.env.BOOT) writeFileSync('.deckent/conditional', 'x');`,
        `await import('./dynamic.js');`,
        `function dormant() { writeFileSync('.tasks/dormant', 'x'); }`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'src', 'helper.ts'),
      [
        `import { writeFileSync } from 'node:fs';`,
        `export function importedDanger() {`,
        `  writeFileSync('.tasks/imported-helper', 'x');`,
        `}`,
      ].join('\n'),
    );
    for (const [name, target] of [
      ['side-effect.ts', '.brain/side-effect'],
      ['reexport.ts', '.deckent/reexport'],
      ['dynamic.ts', '.tasks/dynamic'],
    ]) {
      writeFileSync(
        join(sandbox, 'src', name),
        [
          `import { writeFileSync } from 'node:fs';`,
          `writeFileSync('${target}', 'x');`,
        ].join('\n'),
      );
    }
    writeFileSync(join(sandbox, 'src', 'left.ts'), `import './shared.js';\n`);
    writeFileSync(join(sandbox, 'src', 'right.ts'), `import './shared.js';\n`);
    writeFileSync(join(sandbox, 'src', 'shared.ts'), `import './entry.js';\n`);
    writeFileSync(
      join(sandbox, 'src', 'common.cjs'),
      [
        `const { writeFileSync } = require('node:fs');`,
        `writeFileSync('.tasks/commonjs', 'x');`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'src', 'type-only.ts'),
      [
        `import { writeFileSync } from 'node:fs';`,
        `writeFileSync('.tasks/type-only', 'x');`,
        `export interface Dormant { value: string }`,
      ].join('\n'),
    );

    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    const productionViolations = result.violations.filter(violation =>
      violation.label.startsWith('eager production'));
    expect(productionViolations.map(violation =>
      `${violation.file}:${violation.line}`).sort()).toEqual([
      'src/common.cjs:2',
      'src/dynamic.ts:2',
      'src/entry.ts:10',
      'src/entry.ts:11',
      'src/entry.ts:13',
      'src/entry.ts:8',
      'src/helper.ts:3',
      'src/reexport.ts:2',
      'src/side-effect.ts:2',
    ].sort());
    expect(productionViolations.map(violation => violation.file)).toEqual(
      expect.arrayContaining([
        'src/entry.ts',
        'src/helper.ts',
        'src/side-effect.ts',
        'src/reexport.ts',
        'src/dynamic.ts',
        'src/common.cjs',
      ]),
    );
    expect(productionViolations.filter(violation =>
      violation.file === 'src/entry.ts')).toHaveLength(4);
    expect(productionViolations.some(violation =>
      violation.file === 'src/type-only.ts')).toBe(false);

    const inventory = result.registry.filter(entry =>
      entry.effect === 'test-support:production-dependency');
    expect(new Set(inventory.map(entry => entry.file)).size).toBe(9);
    expect(inventory.some(entry => entry.file === 'src/type-only.ts')).toBe(false);
    expect(productionInventoryFingerprint(result.registry)).toEqual({
      count: 9,
      digest: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it('tracks eager child effects and keeps dormant child definitions out of authority', () => {
    mkdirSync(join(sandbox, 'tests'));
    mkdirSync(join(sandbox, 'src'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({ scripts: {} }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'child-init.test.ts'),
      `import '../src/child-init.js';\n`,
    );
    writeFileSync(
      join(sandbox, 'src', 'child-init.ts'),
      [
        `import { execSync } from 'node:child_process';`,
        `execSync('rm -rf .tasks');`,
        `function dormant() { execSync('rm -rf .brain'); }`,
      ].join('\n'),
    );

    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations.filter(violation =>
      violation.label.startsWith('eager production'))).toEqual([
      expect.objectContaining({
        file: 'src/child-init.ts',
        line: 2,
        code: 'E_HERMETIC_TASKS_WRITE',
      }),
    ]);
  });

  it('propagates eager imported const functions and class construction effects', () => {
    mkdirSync(join(sandbox, 'tests'));
    mkdirSync(join(sandbox, 'src'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({ scripts: {} }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'imported-construct.test.ts'),
      `import '../src/bootstrap.js';\n`,
    );
    writeFileSync(
      join(sandbox, 'src', 'bootstrap.ts'),
      [
        `import { ImportedBoot, runImported } from './imported.js';`,
        `new ImportedBoot();`,
        `runImported();`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'src', 'imported.ts'),
      [
        `import { writeFileSync } from 'node:fs';`,
        `export class ImportedBoot {`,
        `  static eager = writeFileSync('.tasks/static-class', 'x');`,
        `  eager = writeFileSync('.brain/instance-field', 'x');`,
        `  constructor() { writeFileSync('.locks/constructor', 'x'); }`,
        `  dormant() { writeFileSync('.deckent/dormant-method', 'x'); }`,
        `}`,
        `export const runImported = () => writeFileSync('.tasks/const-export', 'x');`,
      ].join('\n'),
    );

    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations.filter(violation =>
      violation.label.startsWith('eager production')).map(violation =>
      `${violation.file}:${violation.line}`).sort()).toEqual([
      'src/imported.ts:3',
      'src/imported.ts:4',
      'src/imported.ts:5',
      'src/imported.ts:8',
    ]);
    expect(result.registry.some(entry =>
      entry.effect === 'production:eager-imported-call-unresolved-export')).toBe(false);
  });

  it('executes local class/base construction exactly and keeps dormant methods out', () => {
    mkdirSync(join(sandbox, 'tests'));
    mkdirSync(join(sandbox, 'src'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({ scripts: {} }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'local-class.test.ts'),
      `import '../src/local-class.js';\n`,
    );
    writeFileSync(
      join(sandbox, 'src', 'local-class.ts'),
      [
        `import { writeFileSync } from 'node:fs';`,
        `class Base {`,
        `  field = writeFileSync('.tasks/base-field', 'x');`,
        `  constructor(value = writeFileSync('.brain/base-default', 'x')) {}`,
        `  dormant() { writeFileSync('.deckent/base-dormant', 'x'); }`,
        `}`,
        `class Local extends Base {`,
        `  field = writeFileSync('.brain/local-field', 'x');`,
        `  constructor(value = 'provided') { super(value); writeFileSync('.locks/local-constructor', 'x'); }`,
        `  dormant() { writeFileSync('.deckent/local-dormant', 'x'); }`,
        `}`,
        `new Local('explicit');`,
        `const Expression = class {`,
        `  field = writeFileSync('.tasks/expression-field', 'x');`,
        `  constructor(value = writeFileSync('.deckent/expression-default', 'x')) { writeFileSync('dist/expression-constructor', 'x'); }`,
        `  dormant() { writeFileSync('.brain/expression-dormant', 'x'); }`,
        `};`,
        `new Expression(undefined);`,
        `class Recursive { constructor() { if (false) new Recursive(); } }`,
        `new Recursive();`,
      ].join('\n'),
    );

    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations.filter(violation =>
      violation.label.startsWith('eager production')).map(violation =>
      `${violation.file}:${violation.line}`).sort()).toEqual([
      'src/local-class.ts:3',
      'src/local-class.ts:8',
      'src/local-class.ts:9',
      'src/local-class.ts:14',
      'src/local-class.ts:15',
      'src/local-class.ts:15',
    ].sort());
    expect(result.violations.some(violation =>
      violation.match.includes('dormant'))).toBe(false);
    expect(result.violations.some(violation =>
      violation.line === 4)).toBe(false);
  });

  it('maps concrete, omitted, undefined, spread, and destructured defaults across calls', () => {
    mkdirSync(join(sandbox, 'tests'));
    mkdirSync(join(sandbox, 'src'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({ scripts: {} }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'defaults.test.ts'),
      `import '../src/defaults.js';\n`,
    );
    writeFileSync(
      join(sandbox, 'src', 'defaults.ts'),
      [
        `import { writeFileSync } from 'node:fs';`,
        `import { importedDefault, ImportedDefault } from './imported-default.js';`,
        `function local(value = writeFileSync('.tasks/local-default', 'x')) {}`,
        `local('provided');`,
        `local();`,
        `function opaqueDefault(value = writeFileSync('.brain/opaque-default', 'x')) {}`,
        `const opaqueArgs = process.env.ARGS as unknown as string[];`,
        `opaqueDefault(...opaqueArgs);`,
        `function destructured({ value = writeFileSync('.locks/destructured-default', 'x') }) {}`,
        `destructured({ value: 'provided' });`,
        `destructured({});`,
        `class LocalDefault { constructor(value = writeFileSync('.deckent/constructor-default', 'x')) {} }`,
        `new LocalDefault('provided');`,
        `new LocalDefault(undefined);`,
        `importedDefault('provided');`,
        `importedDefault();`,
        `new ImportedDefault('provided');`,
        `new ImportedDefault();`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'src', 'imported-default.ts'),
      [
        `import { writeFileSync } from 'node:fs';`,
        `export function importedDefault(value = writeFileSync('.tasks/imported-default', 'x')) {}`,
        `export class ImportedDefault {`,
        `  constructor(value = writeFileSync('.brain/imported-constructor-default', 'x')) {}`,
        `}`,
      ].join('\n'),
    );

    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations.filter(violation =>
      violation.label.startsWith('eager production')).map(violation =>
      `${violation.file}:${violation.line}`).sort()).toEqual([
      'src/defaults.ts:12',
      'src/defaults.ts:3',
      'src/defaults.ts:9',
      'src/imported-default.ts:2',
      'src/imported-default.ts:4',
    ].sort());
    expect(result.violations.some(violation =>
      violation.line === 6 && violation.file === 'src/defaults.ts')).toBe(false);
    expect(result.registry).toContainEqual(expect.objectContaining({
      file: 'src/defaults.ts',
      line: 8,
      effect: 'production:eager-default-parameter-opaque',
      classification: 'unresolved',
    }));
  });

  it('accounts for callable branches, scheduled callbacks, tags, getters, and decorators', () => {
    mkdirSync(join(sandbox, 'tests'));
    mkdirSync(join(sandbox, 'src'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({ scripts: {} }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'eager-events.test.ts'),
      `import '../src/eager-events.js';\n`,
    );
    writeFileSync(
      join(sandbox, 'src', 'eager-events.ts'),
      [
        `import { writeFileSync } from 'node:fs';`,
        `function risky() { writeFileSync('.tasks/branch', 'x'); }`,
        `const selected = process.env.BRANCH ? risky : () => {};`,
        `selected();`,
        `queueMicrotask(() => writeFileSync('.brain/microtask', 'x'));`,
        `[1].forEach(() => writeFileSync('.locks/iteration', 'x'));`,
        `function tag(strings: TemplateStringsArray) { writeFileSync('.deckent/tag', 'x'); }`,
        `tag\`value\`;`,
        `const object = {`,
        `  get eager() { writeFileSync('dist/getter', 'x'); return 1; },`,
        `  dormant() { writeFileSync('.brain/dormant', 'x'); },`,
        `};`,
        `object.eager;`,
        `const { eager } = object;`,
        `function decorate(target: unknown) { writeFileSync('.tasks/decorator', 'x'); }`,
        `@decorate class Decorated {}`,
      ].join('\n'),
    );

    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations.filter(violation =>
      violation.label.startsWith('eager production')).map(violation =>
      `${violation.file}:${violation.line}`).sort()).toEqual([
      'src/eager-events.ts:10',
      'src/eager-events.ts:15',
      'src/eager-events.ts:2',
      'src/eager-events.ts:5',
      'src/eager-events.ts:6',
      'src/eager-events.ts:7',
    ].sort());
    expect(result.violations.some(violation =>
      violation.line === 11)).toBe(false);
  });

  it('records stable unresolved outcomes for unsupported eager invocation boundaries', () => {
    mkdirSync(join(sandbox, 'tests'));
    mkdirSync(join(sandbox, 'src'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({ scripts: {} }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'unsupported-events.test.ts'),
      `import '../src/unsupported-events.js';\n`,
    );
    writeFileSync(
      join(sandbox, 'src', 'unsupported-events.ts'),
      [
        `import { Service, invoke, run } from './service.js';`,
        `Service.start();`,
        `const bound = run.bind(null);`,
        `bound();`,
        `run()();`,
        `invoke(() => unknownCallbackEffect());`,
        `unknownHof(() => unknownCallbackEffect());`,
        `unknownCall();`,
        `new UnknownConstructor();`,
        `unknownTag\`value\`;`,
        `unknownObject.value;`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'src', 'service.ts'),
      [
        `export class Service { static start() {} }`,
        `export function run() { return () => {}; }`,
        `export function invoke(callback: () => void) { callback(); }`,
      ].join('\n'),
    );

    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    const effects = result.registry
      .filter(entry =>
        entry.file === 'src/unsupported-events.ts'
        && entry.classification === 'unresolved')
      .map(entry => entry.effect);
    expect(effects).toEqual(expect.arrayContaining([
      'production:eager-imported-member-call-unresolved',
      'production:eager-imported-bound-call-unresolved',
      'production:eager-returned-callable-unresolved',
      'production:eager-hof-callback-unresolved',
      'production:eager-call-unresolved',
      'production:eager-construction-unresolved',
      'production:eager-tag-unresolved',
      'production:eager-property-read-unresolved',
    ]));
    expect(result.registry).toContainEqual(expect.objectContaining({
      file: 'src/service.ts',
      effect: 'production:eager-callback-invocation-unresolved',
      classification: 'unresolved',
    }));
  });

  it('merges production-scale unresolved edges without exceeding call argument limits', () => {
    mkdirSync(join(sandbox, 'tests'));
    mkdirSync(join(sandbox, 'src'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({ scripts: {} }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'entry.test.ts'),
      `import '../src/entry.js';\n`,
    );
    writeFileSync(
      join(sandbox, 'src', 'entry.ts'),
      [
        `import { probe } from './probe.js';`,
        ...Array.from(
          { length: 128 },
          (_, profileSize) =>
            `probe([${Array.from({ length: profileSize }, () => '0').join(',')}]);`,
        ),
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'src', 'probe.ts'),
      [
        `export function probe(_profile: unknown[]) {`,
        ...Array.from({ length: 1_150 }, () => `  unknownBoundary();`),
        `}`,
      ].join('\n'),
    );
    const scanState = {
      seenFiles: new Set<string>(),
      seenEdges: new Set<string>(),
      seenProductionInventory: new Set<string>(),
      seenProductionEffects: new Set<string>(),
    };

    const result = scanTestDir(
      join(sandbox, 'tests'),
      [],
      sandbox,
      scanState,
    );
    const unresolved = result.registry.filter(entry =>
      entry.file === 'src/probe.ts'
      && entry.effect === 'production:eager-call-unresolved');

    expect(result.violations).toHaveLength(0);
    expect(unresolved).toHaveLength(1_150);
    expect(unresolved.map(entry => entry.line)).toEqual(
      Array.from({ length: 1_150 }, (_, index) => index + 2),
    );
  });

  it('resolves star exports once and fails loud for missing or ambiguous bindings', () => {
    mkdirSync(join(sandbox, 'tests'));
    mkdirSync(join(sandbox, 'src'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({ scripts: {} }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'star-resolution.test.ts'),
      `import '../src/star-entry.js';\n`,
    );
    writeFileSync(
      join(sandbox, 'src', 'star-entry.ts'),
      [
        `import { good } from './duplicate-barrel.js';`,
        `import { missing } from './missing-barrel.js';`,
        `import { ambiguous } from './ambiguous-barrel.js';`,
        `good();`,
        `missing();`,
        `ambiguous();`,
      ].join('\n'),
    );
    writeFileSync(join(sandbox, 'src', 'good.ts'), `export function good() {}\n`);
    writeFileSync(join(sandbox, 'src', 'good-a.ts'), `export * from './good.js';\n`);
    writeFileSync(join(sandbox, 'src', 'good-b.ts'), `export * from './good.js';\n`);
    writeFileSync(
      join(sandbox, 'src', 'duplicate-barrel.ts'),
      `export * from './good-a.js';\nexport * from './good-b.js';\n`,
    );
    writeFileSync(join(sandbox, 'src', 'empty-a.ts'), `export const otherA = true;\n`);
    writeFileSync(join(sandbox, 'src', 'empty-b.ts'), `export const otherB = true;\n`);
    writeFileSync(
      join(sandbox, 'src', 'missing-barrel.ts'),
      `export * from './empty-a.js';\nexport * from './empty-b.js';\n`,
    );
    writeFileSync(
      join(sandbox, 'src', 'ambiguous-a.ts'),
      `export function ambiguous() {}\n`,
    );
    writeFileSync(
      join(sandbox, 'src', 'ambiguous-b.ts'),
      `export function ambiguous() {}\n`,
    );
    writeFileSync(
      join(sandbox, 'src', 'ambiguous-barrel.ts'),
      `export * from './ambiguous-a.js';\nexport * from './ambiguous-b.js';\n`,
    );

    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.registry.filter(entry =>
      entry.effect === 'production:eager-imported-call-unresolved-export')).toEqual([
      expect.objectContaining({
        file: 'src/star-entry.ts',
        line: 5,
        specifier: './missing-barrel.js#missing',
      }),
    ]);
    expect(result.registry.filter(entry =>
      entry.effect === 'production:eager-ambiguous-star-export')).toEqual([
      expect.objectContaining({
        file: 'src/star-entry.ts',
        line: 6,
        specifier: './ambiguous-barrel.js#ambiguous',
      }),
    ]);
    expect(result.registry.some(entry =>
      entry.specifier === './duplicate-barrel.js#good'
      && entry.classification === 'unresolved')).toBe(false);
  });

  it('keeps star-group pending accounting stable across zero-target nested branches', () => {
    mkdirSync(join(sandbox, 'tests'));
    mkdirSync(join(sandbox, 'src'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({ scripts: {} }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'mixed-star.test.ts'),
      `import '../src/mixed-entry.js';\n`,
    );
    writeFileSync(
      join(sandbox, 'src', 'mixed-entry.ts'),
      `import { found } from './mixed-root.js';\nfound();\n`,
    );
    writeFileSync(
      join(sandbox, 'src', 'mixed-root.ts'),
      [
        `export * from './nested-missing.js';`,
        `export * from './found.js';`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'src', 'nested-missing.ts'),
      `export * from './absent.js';\n`,
    );
    writeFileSync(
      join(sandbox, 'src', 'found.ts'),
      `export function found() {}\n`,
    );

    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.registry).toContainEqual(expect.objectContaining({
      file: 'src/nested-missing.ts',
      effect: 'production:eager-star-reexport-unresolved-module',
      classification: 'unresolved',
    }));
    expect(result.registry.some(entry =>
      entry.effect === 'production:eager-imported-call-unresolved-export'
      && entry.specifier?.endsWith('#found'))).toBe(false);
  });

  it('does not execute exact ESM or CommonJS CLI main guards during import', () => {
    mkdirSync(join(sandbox, 'tests'));
    mkdirSync(join(sandbox, 'src'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({ scripts: {} }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'main-guards.test.ts'),
      [
        `import '../src/direct-main.js';`,
        `import '../src/function-main.js';`,
        `import '../src/common-main.cjs';`,
        `import '../src/alias-main.js';`,
        `import '../src/suffix-main.js';`,
        `import '../src/derived-main.js';`,
        `import '../src/derived-common.cjs';`,
        `import '../src/async-main.js';`,
        `import '../src/generator-main.js';`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'src', 'direct-main.ts'),
      [
        `import { writeFileSync } from 'node:fs';`,
        `import { fileURLToPath } from 'node:url';`,
        `if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {`,
        `  writeFileSync('.tasks/direct-main', 'x');`,
        `}`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'src', 'function-main.ts'),
      [
        `import { writeFileSync } from 'node:fs';`,
        `import { fileURLToPath } from 'node:url';`,
        `function isMain() {`,
        `  if (!process.argv[1]) return false;`,
        `  return process.argv[1] === fileURLToPath(import.meta.url);`,
        `}`,
        `if (isMain()) writeFileSync('.brain/function-main', 'x');`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'src', 'common-main.cjs'),
      [
        `const { writeFileSync } = require('node:fs');`,
        `if (require.main === module) writeFileSync('.locks/common-main', 'x');`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'src', 'alias-main.ts'),
      [
        `import { writeFileSync } from 'node:fs';`,
        `import { resolve } from 'node:path';`,
        `import { fileURLToPath } from 'node:url';`,
        `const entryArg = process.argv[1] ?? '';`,
        `if (entryArg !== '' && fileURLToPath(import.meta.url) === resolve(entryArg)) {`,
        `  writeFileSync('.tasks/alias-main', 'x');`,
        `}`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'src', 'suffix-main.ts'),
      [
        `import { writeFileSync } from 'node:fs';`,
        `const entryArg = process.argv[1] ?? '';`,
        `if (entryArg.endsWith('suffix-main.ts')) {`,
        `  writeFileSync('.deckent/suffix-main', 'x');`,
        `}`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'src', 'derived-main.ts'),
      [
        `import { writeFileSync } from 'node:fs';`,
        `if (String(process.argv[1]) === String(import.meta.url)) {`,
        `  writeFileSync('.brain/derived-main', 'x');`,
        `}`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'src', 'derived-common.cjs'),
      [
        `const { writeFileSync } = require('node:fs');`,
        `if (Boolean(require.main) === Boolean(module)) {`,
        `  writeFileSync('.tasks/derived-common', 'x');`,
        `}`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'src', 'async-main.ts'),
      [
        `import { writeFileSync } from 'node:fs';`,
        `import { fileURLToPath } from 'node:url';`,
        `async function isMain() {`,
        `  return process.argv[1] === fileURLToPath(import.meta.url);`,
        `}`,
        `if (isMain()) writeFileSync('.brain/async-main', 'x');`,
      ].join('\n'),
    );
    writeFileSync(
      join(sandbox, 'src', 'generator-main.ts'),
      [
        `import { writeFileSync } from 'node:fs';`,
        `import { fileURLToPath } from 'node:url';`,
        `function* isMain() {`,
        `  writeFileSync('.deckent/generator-dormant', 'x');`,
        `  return process.argv[1] === fileURLToPath(import.meta.url);`,
        `}`,
        `if (isMain()) writeFileSync('.tasks/generator-main', 'x');`,
      ].join('\n'),
    );

    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations.filter(violation =>
      violation.label.startsWith('eager production')).map(violation =>
      `${violation.file}:${violation.line}`).sort()).toEqual([
      'src/derived-common.cjs:3',
      'src/derived-main.ts:3',
      'src/async-main.ts:6',
      'src/generator-main.ts:7',
      'src/suffix-main.ts:4',
    ].sort());
    expect(result.registry.filter(entry =>
      entry.effect === 'production:eager-main-guard-unresolved'
      && entry.classification === 'unresolved').map(entry =>
      entry.file).sort()).toEqual([
      'src/derived-common.cjs',
      'src/derived-main.ts',
      'src/async-main.ts',
      'src/generator-main.ts',
      'src/suffix-main.ts',
    ].sort());
    expect(result.violations.some(violation =>
      violation.file === 'src/generator-main.ts'
      && violation.line === 4)).toBe(false);
  });

  it('records only genuine eager-analysis gaps and fingerprints content plus edges', () => {
    mkdirSync(join(sandbox, 'tests'));
    mkdirSync(join(sandbox, 'src'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({ scripts: {} }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'inventory.test.ts'),
      `import '../src/inventory.js';\n`,
    );
    const inventoryPath = join(sandbox, 'src', 'inventory.ts');
    writeFileSync(
      inventoryPath,
      [
        `const dynamicTarget = process.env.DYNAMIC_MODULE;`,
        `await import(dynamicTarget!);`,
        `function dormant() { return import(process.env.DORMANT_MODULE!); }`,
        `export const version = 1;`,
      ].join('\n'),
    );

    const first = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(first.registry.filter(entry =>
      entry.effect === 'production:eager-dynamic-import-expression')).toEqual([
      expect.objectContaining({
        file: 'src/inventory.ts',
        line: 2,
        classification: 'unresolved',
      }),
    ]);
    const firstFingerprint = productionInventoryFingerprint(first.registry);

    writeFileSync(join(sandbox, 'src', 'edge.ts'), `export const edge = true;\n`);
    writeFileSync(
      inventoryPath,
      [
        `import './edge.js';`,
        `const dynamicTarget = process.env.DYNAMIC_MODULE;`,
        `await import(dynamicTarget!);`,
        `function dormant() { return import(process.env.DORMANT_MODULE!); }`,
        `export const version = 2;`,
      ].join('\n'),
    );
    const second = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    const secondFingerprint = productionInventoryFingerprint(second.registry);
    expect(secondFingerprint.count).toBe(firstFingerprint.count + 1);
    expect(secondFingerprint.digest).not.toBe(firstFingerprint.digest);
  });

  it('keeps its own ratchet fingerprints stable across baseline value widths', () => {
    mkdirSync(join(sandbox, 'tests'));
    mkdirSync(join(sandbox, 'scripts'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({ scripts: {} }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'self-ratchet.test.ts'),
      `import '../scripts/lint-test-hermeticity.mjs';\n`,
    );
    const scannerPath = join(sandbox, 'scripts', 'lint-test-hermeticity.mjs');
    const scannerSource = (count: string, digest: string): string => [
      `export const UNRESOLVED_BASELINE = Object.freeze({`,
      `  count: ${count},`,
      `  digest: '${digest}',`,
      `});`,
      `export const PRODUCTION_INVENTORY_BASELINE = Object.freeze({`,
      `  count: ${count},`,
      `  digest: '${digest}',`,
      `});`,
      `unknownBoundary();`,
    ].join('\n');

    writeFileSync(scannerPath, scannerSource('9', 'short'));
    const narrow = scanTestDir(join(sandbox, 'tests'), [], sandbox);

    writeFileSync(
      scannerPath,
      scannerSource('123456789012345', 'f'.repeat(64)),
    );
    const wide = scanTestDir(join(sandbox, 'tests'), [], sandbox);

    expect(unresolvedRegistryFingerprint(wide.registry)).toEqual(
      unresolvedRegistryFingerprint(narrow.registry),
    );
    expect(productionInventoryFingerprint(wide.registry)).toEqual(
      productionInventoryFingerprint(narrow.registry),
    );
  });

  it('keeps scan identities and policy fingerprints equal across LF and CRLF', () => {
    mkdirSync(join(sandbox, 'tests'));
    mkdirSync(join(sandbox, 'src'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({ scripts: {} }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'eol.test.ts'),
      `import '../src/eol.js';\n`,
    );
    const sourcePath = join(sandbox, 'src', 'eol.ts');
    const lines = [
      `import { writeFileSync } from 'node:fs';`,
      `unknownBoundary();`,
      `writeFileSync('.tasks/eol', 'x');`,
    ];
    writeFileSync(sourcePath, `${lines.join('\n')}\n`);
    const lf = scanTestDir(join(sandbox, 'tests'), [], sandbox);

    writeFileSync(sourcePath, `${lines.join('\r\n')}\r\n`);
    const crlf = scanTestDir(join(sandbox, 'tests'), [], sandbox);

    expect(crlf.violations).toEqual(lf.violations);
    expect(unresolvedRegistryFingerprint(crlf.registry)).toEqual(
      unresolvedRegistryFingerprint(lf.registry),
    );
    expect(productionInventoryFingerprint(crlf.registry)).toEqual(
      productionInventoryFingerprint(lf.registry),
    );
  });

  it('invalidates local import resolution across missing and present rescans', () => {
    mkdirSync(join(sandbox, 'tests'));
    mkdirSync(join(sandbox, 'src'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({ scripts: {} }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'mutable-import.test.ts'),
      `import '../src/mutable.js';\n`,
    );
    const mutablePath = join(sandbox, 'src', 'mutable.ts');

    const missing = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(missing.registry).toContainEqual(expect.objectContaining({
      file: 'tests/mutable-import.test.ts',
      specifier: '../src/mutable.js',
      classification: 'unresolved',
    }));

    writeFileSync(mutablePath, `export const present = true;\n`);
    const present = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(present.registry.some(entry =>
      entry.specifier === '../src/mutable.js'
      && entry.classification === 'unresolved')).toBe(false);
    expect(present.registry).toContainEqual(expect.objectContaining({
      file: 'src/mutable.ts',
      effect: 'test-support:production-dependency',
      classification: 'inventory',
    }));

    rmSync(mutablePath);
    const missingAgain = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(missingAgain.registry).toContainEqual(expect.objectContaining({
      file: 'tests/mutable-import.test.ts',
      specifier: '../src/mutable.js',
      classification: 'unresolved',
    }));
  });

  it('enforces one cooperative monotonic budget across discovery and analysis', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'tests', 'budget.test.ts'),
      `expect(true).toBe(true);\n`,
    );
    const monotonicNow = 100;
    const expiredBudget = createScanBudget(monotonicNow - 25, 5, {
      clock: () => monotonicNow,
    });
    expect(expiredBudget.elapsedMs()).toBe(25);
    expect(expiredBudget.snapshot().elapsedMs).toBe(25);
    expect(() => scanTestDir(
      join(sandbox, 'tests'),
      [],
      sandbox,
      undefined,
      expiredBudget,
    )).toThrow(/\[E_HERMETIC_SCAN_BUDGET\]/);
  });

  it('enforces an injectable RSS/heap budget through the same scan guard', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'tests', 'memory-budget.test.ts'),
      `expect(true).toBe(true);\n`,
    );
    const monotonicNow = 100;
    const memoryBudget = createScanBudget(monotonicNow, 5_000, {
      maxRssBytes: 64,
      maxHeapBytes: 64,
      memorySampler: () => ({ rss: 65, heapUsed: 32 }),
      clock: () => monotonicNow,
    });
    expect(() => scanTestDir(
      join(sandbox, 'tests'),
      [],
      sandbox,
      undefined,
      memoryBudget,
    )).toThrow(/\[E_HERMETIC_SCAN_BUDGET:memory\]/);
  });

  it('detects violations in a synthetic non-hermetic test file', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'tests', 'bad.test.ts'),
      `const debtPath = join(process.cwd(), '.brain', 'exports', 'debt.md');\n`,
    );
    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0].file).toContain('bad.test.ts');
    expect(result.checked).toBe(1);
  });

  it('never lets a legacy allowlist suppress a newly introduced live read', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'tests', 'allowed.test.ts'),
      `const p = join(process.cwd(), '.deckent', 'config.json');\n`,
    );
    const result = scanTestDir(join(sandbox, 'tests'), ['tests/allowed.test.ts'], sandbox);
    expect(result.violations).toEqual([
      expect.objectContaining({ code: 'E_HERMETIC_LIVE_STATE_READ' }),
    ]);
    expect(result.skipped).toBe(1);
    expect(result.checked).toBe(0);
  });

  it('migrates only an exact legacy read callsite and rejects a new neighbor', () => {
    mkdirSync(join(sandbox, 'tests', 'core'), { recursive: true });
    writeFileSync(join(sandbox, 'package.json'), JSON.stringify({ scripts: {} }));
    const knownContent = readFileSync(
      join(REPO_ROOT, 'tests', 'core', 'debt-002.test.ts'),
      'utf-8',
    );
    const target = join(sandbox, 'tests', 'core', 'debt-002.test.ts');
    writeFileSync(target, knownContent);
    const accepted = scanTestDir(
      join(sandbox, 'tests'),
      ['tests/core/debt-002.test.ts'],
      sandbox,
    );
    expect(accepted.violations.filter(violation =>
      violation.code === 'E_HERMETIC_LIVE_STATE_READ')).toEqual([]);
    expect(accepted.registry).toEqual(expect.arrayContaining([
      expect.objectContaining({
        effect: 'legacy:live-state-read',
        classification: 'migration',
      }),
    ]));

    writeFileSync(
      target,
      `${knownContent}\nreadFileSync(join(process.cwd(), '.brain', 'memory.db'));\n`,
    );
    const drifted = scanTestDir(
      join(sandbox, 'tests'),
      ['tests/core/debt-002.test.ts'],
      sandbox,
    );
    expect(drifted.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'E_HERMETIC_LIVE_STATE_READ' }),
    ]));
  });

  it('never lets a legacy read allowlist suppress a live writer', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'tests', 'allowed.test.ts'),
      [
        `import { writeFileSync } from 'node:fs';`,
        `import { join } from 'node:path';`,
        `const root = process.cwd();`,
        `writeFileSync(join(root, '.tasks', 'leak'), 'x');`,
      ].join('\n'),
    );
    const result = scanTestDir(
      join(sandbox, 'tests'),
      ['tests/allowed.test.ts'],
      sandbox,
    );
    expect(result.skipped).toBe(1);
    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'E_HERMETIC_TASKS_WRITE' }),
    ]));
  });

  it('reports 0 violations for a fully hermetic test file', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'tests', 'clean.test.ts'),
      [
        `import { tmpdir } from 'node:os';`,
        `const s = mkdtempSync(join(tmpdir(), 'clean-'));`,
        `writeFileSync(join(s, '.deckent', 'config.json'), '{}');`,
      ].join('\n'),
    );
    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations).toHaveLength(0);
    expect(result.checked).toBe(1);
  });

  it('treats absent manifests as optional and malformed manifests as unresolved', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'tests', 'clean.test.ts'),
      `expect(true).toBe(true);\n`,
    );
    const absent = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(absent.violations).toEqual([]);

    writeFileSync(join(sandbox, 'package.json'), '{ malformed');
    const malformed = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(malformed.violations).toEqual([]);
    expect(malformed.registry).toEqual(expect.arrayContaining([
      expect.objectContaining({
        effect: 'test-support:unresolved-manifest',
        classification: 'unresolved',
      }),
    ]));
  });

  it('records an exact Vitest rejects guard as expected-missing evidence', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({ devDependencies: { vitest: 'test' } }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'expected-missing.test.ts'),
      [
        `import { expect } from 'vitest';`,
        `await expect(import('../src/removed-module.js')).rejects.toThrow();`,
      ].join('\n'),
    );
    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.registry).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'tests/expected-missing.test.ts',
        line: 2,
        effect: 'test-support:expected-missing-import',
        classification: 'expected-missing',
      }),
    ]));
    expect(unresolvedRegistryFingerprint(result.registry).count).toBe(0);
  });

  it('violation objects carry file:line info for reporting', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'tests', 'reporter.test.ts'),
      `// first line\nconst x = join(process.cwd(), '.brain', 'memory.db');\n`,
    );
    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations.length).toBeGreaterThan(0);
    const v = result.violations[0];
    expect(v).toHaveProperty('line', 2); // second line (first is comment)
    expect(v.file).toMatch(/reporter\.test\.ts/);
  });
});

describe('transitive child command effects', () => {
  it('traces npm aliases to the destructive clean sink', () => {
    const effects = traceCommandEffects('npm run verify', {
      verify: 'npm run build',
      build: 'npm run clean && tsc',
      clean: 'node scripts/clean.mjs',
    });
    expect(effects).toEqual([
      {
        effect: 'dist-clean',
        chain: ['npm:verify', 'npm:build', 'npm:clean', 'scripts/clean.mjs'],
      },
    ]);
  });

  it('terminates alias cycles without inventing an effect', () => {
    const effects = traceCommandEffects('npm run a', {
      a: 'npm run b',
      b: 'npm run a',
    });
    expect(effects).toEqual([]);
  });

  it('supports npm global flags, Windows launchers, and node.exe clean execution', () => {
    const scripts = {
      build: 'npm run clean && tsc',
      clean: 'node scripts/clean.mjs',
    };
    expect(traceCommandEffects('npm --silent run build', scripts)).toEqual([
      {
        effect: 'dist-clean',
        chain: ['npm:build', 'npm:clean', 'scripts/clean.mjs'],
      },
    ]);
    expect(traceCommandEffects('npm.cmd run build', scripts)).toEqual([
      {
        effect: 'dist-clean',
        chain: ['npm:build', 'npm:clean', 'scripts/clean.mjs'],
      },
    ]);
    expect(traceCommandEffects('node.exe scripts/clean.mjs', scripts)).toEqual([
      { effect: 'dist-clean', chain: ['scripts/clean.mjs'] },
    ]);
  });

  it('does not reinterpret quoted text or non-shell argv as commands', () => {
    const scripts = {
      build: 'npm run clean && tsc',
      clean: 'node scripts/clean.mjs',
    };
    expect(traceCommandEffects('echo "npm run build"', scripts)).toEqual([]);
    expect(traceCommandEffects('printf npm run build', scripts)).toEqual([]);
  });

  it('finds a test-to-shell-to-package clean chain without executing it', () => {
    mkdirSync(join(sandbox, 'tests'));
    mkdirSync(join(sandbox, 'scripts'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'npm run clean && tsc',
          clean: 'node scripts/clean.mjs',
        },
      }),
    );
    writeFileSync(join(sandbox, 'scripts', 'verify.sh'), '#!/bin/bash\nnpm run build\n');
    writeFileSync(
      join(sandbox, 'tests', 'script.test.ts'),
      `runScriptAsync('verify.sh');\n`,
    );

    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations).toEqual([
      expect.objectContaining({
        code: 'E_HERMETIC_DIST_CLEAN',
        label: expect.stringContaining('npm:build -> npm:clean -> scripts/clean.mjs'),
      }),
    ]);
  });

  it('traces a trusted child_process exec alias directly into npm clean', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'npm run clean && tsc',
          clean: 'node scripts/clean.mjs',
        },
      }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'direct-exec.test.ts'),
      [
        `import { exec as runCommand } from 'node:child_process';`,
        `const command = 'npm run build';`,
        `runCommand(command);`,
      ].join('\n'),
    );

    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations).toEqual([
      expect.objectContaining({
        line: 3,
        code: 'E_HERMETIC_DIST_CLEAN',
        label: expect.stringContaining('npm:build -> npm:clean -> scripts/clean.mjs'),
      }),
    ]);
  });

  it('traces trusted namespace/computed spawn with a literal argv vector', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({
        scripts: {
          clean: 'node scripts/clean.mjs',
        },
      }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'direct-spawn.test.ts'),
      [
        `import * as childProcess from 'node:child_process';`,
        `const args = ['run', 'clean'];`,
        `childProcess['spawn']('npm', args);`,
      ].join('\n'),
    );

    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations).toEqual([
      expect.objectContaining({
        line: 3,
        code: 'E_HERMETIC_DIST_CLEAN',
      }),
    ]);
  });

  it('does not trust a local function named exec as child_process authority', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({
        scripts: {
          clean: 'node scripts/clean.mjs',
        },
      }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'fake-exec.test.ts'),
      [
        `function exec(_command: string) {}`,
        `exec('npm run clean');`,
      ].join('\n'),
    );

    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations).toHaveLength(0);
  });

  it('propagates trusted child_process authority through a const alias', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'npm run clean && tsc',
          clean: 'node scripts/clean.mjs',
        },
      }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'child-alias.test.ts'),
      [
        `import { execSync } from 'node:child_process';`,
        `const run = execSync;`,
        `run('npm run build');`,
      ].join('\n'),
    );
    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations).toEqual([
      expect.objectContaining({ line: 3, code: 'E_HERMETIC_DIST_CLEAN' }),
    ]);
  });

  it('keeps spawn argv structured and recognizes npm.cmd argv directly', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'npm run clean && tsc',
          clean: 'node scripts/clean.mjs',
        },
      }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'structured-spawn.test.ts'),
      [
        `import { spawn } from 'node:child_process';`,
        `spawn('echo', ['npm', 'run', 'build']);`,
        `spawn('npm.cmd', ['--silent', 'run', 'build']);`,
      ].join('\n'),
    );
    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations).toEqual([
      expect.objectContaining({ line: 3, code: 'E_HERMETIC_DIST_CLEAN' }),
    ]);
  });

  it('resolves npm workspace/prefix lifecycle effects from the selected manifest', () => {
    mkdirSync(join(sandbox, 'tests'));
    mkdirSync(join(sandbox, 'packages', 'foo'), { recursive: true });
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({ scripts: { clean: 'echo root-safe' } }),
    );
    writeFileSync(
      join(sandbox, 'packages', 'foo', 'package.json'),
      JSON.stringify({
        name: '@deckent/foo',
        scripts: { clean: 'node ../../../scripts/clean.mjs' },
      }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'selected-package.test.ts'),
      [
        `import { spawnSync } from 'node:child_process';`,
        `spawnSync('npm', ['run', '--workspace', '@deckent/foo', 'clean']);`,
        `spawnSync('npm', ['--prefix', 'packages/foo', 'run', 'clean']);`,
        `spawnSync('npm', ['run', '--workspace', 'missing', 'clean']);`,
      ].join('\n'),
    );

    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations).toEqual([
      expect.objectContaining({ line: 2, code: 'E_HERMETIC_DIST_CLEAN' }),
      expect.objectContaining({ line: 3, code: 'E_HERMETIC_DIST_CLEAN' }),
    ]);
    expect(result.registry).toEqual(expect.arrayContaining([
      expect.objectContaining({
        line: 4,
        effect: 'child:unresolved-package-script',
        classification: 'unresolved',
      }),
    ]));
  });

  it('honors child cwd authority and resolves only exact root shell scripts', () => {
    mkdirSync(join(sandbox, 'tests'));
    mkdirSync(join(sandbox, 'scripts'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'npm run clean && tsc',
          clean: 'node scripts/clean.mjs',
        },
      }),
    );
    writeFileSync(join(sandbox, 'scripts', 'verify.sh'), '#!/bin/sh\nnpm run build\n');
    writeFileSync(
      join(sandbox, 'tests', 'child-authority.test.ts'),
      [
        `import { spawn } from 'node:child_process';`,
        `import { join } from 'node:path';`,
        `spawn('npm', ['run', 'clean'], { cwd: '/tmp/nonce-fixture' });`,
        `function runScriptAsync(_path: string) {}`,
        `runScriptAsync('/tmp/verify.sh');`,
        `spawn('bash', [join(process.cwd(), 'scripts', 'verify.sh')],`,
        `  { cwd: process.cwd() });`,
      ].join('\n'),
    );
    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations).toEqual([
      expect.objectContaining({
        line: 6,
        code: 'E_HERMETIC_DIST_CLEAN',
        label: expect.stringContaining('npm:build -> npm:clean -> scripts/clean.mjs'),
      }),
    ]);
  });

  it('rejects commands that escape an otherwise temporary child cwd', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({
        scripts: {
          clean: 'node scripts/clean.mjs',
        },
      }),
    );
    const repoClean = join(sandbox, 'scripts', 'clean.mjs');
    writeFileSync(
      join(sandbox, 'tests', 'temp-cwd-escape.test.ts'),
      [
        `import { execSync } from 'node:child_process';`,
        `execSync(${JSON.stringify(`cd ${sandbox} && npm run clean`)}, { cwd: '/tmp/nonce' });`,
        `execSync(${JSON.stringify(`node ${repoClean}`)}, { cwd: '/tmp/nonce' });`,
        `execSync('npm run clean', { cwd: '/tmp/nonce' });`,
      ].join('\n'),
    );
    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations.map(violation => violation.line)).toEqual([2, 3]);
    expect(result.violations.every(violation =>
      violation.code === 'E_HERMETIC_DIST_CLEAN')).toBe(true);
  });

  it.each([
    ['command substitution', 'echo "$(npm run clean)"'],
    ['combined bash flags', 'bash -lc "npm run clean"'],
    ['env unset prefix', 'env -u TOKEN npm run clean'],
    ['cross-env-shell quoted command', 'cross-env-shell X=1 "npm run clean"'],
    ['backslash-newline continuation', ['np\\', 'm run clean'].join('\n')],
  ])('recursively traces %s into the destructive clean sink', (_name, command) => {
    expect(traceCommandEffects(command, {
      clean: 'node scripts/clean.mjs',
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        effect: 'dist-clean',
        chain: expect.arrayContaining(['npm:clean', 'scripts/clean.mjs']),
      }),
    ]));
  });

  it('includes automatic npm pre/post lifecycle scripts in transitive effects', () => {
    expect(traceCommandEffects('npm run build', {
      prebuild: 'node scripts/clean.mjs',
      build: 'tsc',
      postbuild: 'echo complete',
    })).toEqual([
      {
        effect: 'dist-clean',
        chain: ['npm:build', 'npm:prebuild', 'scripts/clean.mjs'],
      },
    ]);
  });

  it('retains child authority through promisify/use-order and traces conditional commands', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({
        scripts: {
          clean: 'node scripts/clean.mjs',
        },
      }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'child-capability-family.test.ts'),
      [
        `import { promisify } from 'node:util';`,
        `import { exec, execSync } from 'node:child_process';`,
        `const asyncRun = promisify(exec);`,
        `asyncRun('npm run clean');`,
        `let run = execSync;`,
        `run('npm run clean');`,
        `run = () => '';`,
        `execSync(true ? 'npm run clean' : 'echo safe');`,
      ].join('\n'),
    );

    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations).toEqual([
      expect.objectContaining({ line: 4, code: 'E_HERMETIC_DIST_CLEAN' }),
      expect.objectContaining({ line: 6, code: 'E_HERMETIC_DIST_CLEAN' }),
      expect.objectContaining({ line: 8, code: 'E_HERMETIC_DIST_CLEAN' }),
    ]);
  });

  it('fails closed for dynamic child commands and destructive commands with opaque cwd', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({
        scripts: {
          clean: 'node scripts/clean.mjs',
        },
      }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'child-unresolved.test.ts'),
      [
        `import { execSync } from 'node:child_process';`,
        `declare function opaqueCwd(): string;`,
        `const dynamic = process.env.CMD;`,
        `if (dynamic) execSync(dynamic);`,
        `execSync('npm run clean', { cwd: opaqueCwd() });`,
        `execSync('npm run clean', { cwd: process.env.PROJECT_DIR });`,
      ].join('\n'),
    );
    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations).toEqual([
      expect.objectContaining({
        line: 4,
        code: 'E_HERMETIC_CHILD_EFFECT_UNRESOLVED',
      }),
    ]);
    expect(result.registry).toEqual(expect.arrayContaining([
      expect.objectContaining({ line: 5, classification: 'unresolved' }),
      expect.objectContaining({ line: 6, classification: 'unresolved' }),
    ]));
  });

  it('applies protected-root policy to child deletion and registers unknown interpreters', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({ scripts: {} }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'child-protected-roots.test.ts'),
      [
        `import { execSync, spawnSync } from 'node:child_process';`,
        `declare function opaqueCwd(): string;`,
        `execSync('rm -rf .tasks');`,
        `spawnSync('rm', ['-rf', '.locks']);`,
        `execSync('rm -rf .brain');`,
        `execSync('powershell -Command "Remove-Item -Recurse .deckent"');`,
        `execSync("node -e \\"require('node:fs').rmSync('.tasks',{recursive:true})\\"");`,
        `execSync('node scripts/other.mjs');`,
        `execSync('rm -rf .locks', { cwd: opaqueCwd() });`,
      ].join('\n'),
    );
    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ line: 3, code: 'E_HERMETIC_TASKS_WRITE' }),
      expect.objectContaining({ line: 4, code: 'E_HERMETIC_PROJECT_WRITE' }),
      expect.objectContaining({ line: 5, code: 'E_HERMETIC_PROJECT_WRITE' }),
      expect.objectContaining({ line: 6, code: 'E_HERMETIC_PROJECT_WRITE' }),
      expect.objectContaining({ line: 7, code: 'E_HERMETIC_TASKS_WRITE' }),
    ]));
    expect(result.registry).toEqual(expect.arrayContaining([
      expect.objectContaining({
        line: 8,
        effect: 'child:unresolved-child-effect',
        classification: 'unresolved',
      }),
      expect.objectContaining({
        line: 9,
        effect: 'child:protected-delete:live-locks',
        classification: 'unresolved',
      }),
    ]));
  });

  it('traces Node execFile/fork forms and conditional child capabilities', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({
        scripts: {
          clean: 'node scripts/clean.mjs',
        },
      }),
    );
    writeFileSync(
      join(sandbox, 'tests', 'child-executable-family.test.ts'),
      [
        `import { execFileSync, fork } from 'node:child_process';`,
        `import * as cp from 'node:child_process';`,
        `declare const choose: boolean;`,
        `execFileSync(process.execPath, ['scripts/clean.mjs']);`,
        `execFileSync('node', ['-r', 'tsx', 'scripts/clean.mjs']);`,
        `fork('scripts/clean.mjs');`,
        `const run = choose ? cp.execSync : () => undefined;`,
        `run('npm run clean');`,
      ].join('\n'),
    );
    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations.map(violation => violation.line)).toEqual([4, 5, 6, 8]);
    expect(result.violations.every(violation =>
      violation.code === 'E_HERMETIC_DIST_CLEAN')).toBe(true);
  });

  it.each([
    ['npm test lifecycle', 'npm test'],
    ['npm start lifecycle', 'npm start'],
    ['npm restart lifecycle', 'npm restart'],
    ['node require option', 'node -r tsx scripts/clean.mjs'],
    ['node loader option', 'node --loader tsx scripts/clean.mjs'],
    ['rimraf deletion', 'rimraf dist'],
    ['PowerShell deletion', 'powershell -Command "Remove-Item -Recurse -Force dist"'],
    ['corepack wrapper', 'corepack npm run clean'],
    ['command wrapper', 'command npm run clean'],
    ['nohup wrapper', 'nohup npm run clean'],
    ['backtick substitution', 'echo `npm run clean`'],
    ['eval nesting', 'eval "npm run clean"'],
    ['pnpm lifecycle', 'pnpm run clean'],
    ['yarn lifecycle', 'yarn clean'],
    ['bun lifecycle', 'bun run clean'],
    ['cmd rd deletion', 'cmd.exe /c "rd /s /q dist"'],
    ['hash inside a word', 'echo foo#bar; npm run clean'],
    ['ANSI-C shell quote', "bash -c $'npm run clean'"],
    ['static shell variable', 'NPM=npm; $NPM run clean'],
    [
      'Node eval fs deletion',
      `node -e "require('node:fs').rmSync('dist',{recursive:true})"`,
    ],
    ['npm install lifecycle', 'npm install'],
    ['npx wrapper', 'npx npm run clean'],
    ['npm workspace option', 'npm run --workspace foo clean'],
    ['npm prefix option', 'npm --prefix . test'],
    ['absolute Windows npm.cmd', '"C:\\Program Files\\nodejs\\npm.cmd" run clean'],
    ['cmd caret escape', 'cmd /c "n^pm run clean"'],
    ['glued npm redirection', 'npm run clean>/dev/null'],
    ['glued Node redirection', 'node scripts/clean.mjs>/dev/null'],
    ['glued rm redirection', 'rm -rf dist>/dev/null'],
    ['subshell grouping', '(npm run clean)'],
    ['brace grouping', '{ npm run clean; }'],
    ['if control structure', 'if true; then npm run clean; fi'],
    ['time wrapper', 'time npm run clean'],
  ])('traces %s without a shell/platform fail-open', (_name, command) => {
    const effects = traceCommandEffects(command, {
      clean: 'node scripts/clean.mjs',
      preinstall: 'node scripts/clean.mjs',
      test: 'echo test',
      pretest: 'node scripts/clean.mjs',
      start: 'echo start',
      prestart: 'node scripts/clean.mjs',
    });
    expect(effects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        effect: expect.stringMatching(/^dist-(?:clean|delete)$/),
      }),
    ]));
  });
});

// ─── ALLOWLIST integrity ──────────────────────────────────────────────────────

describe('ALLOWLIST', () => {
  it('contains the known skip-if-absent files', () => {
    expect(ALLOWLIST).toContain('tests/scripts/adr-validator.test.ts');
    expect(ALLOWLIST).toContain('tests/core/nervous-enabled-integration.test.ts');
    expect(ALLOWLIST).toContain('tests/orchestra/spawn-backend-docker.test.ts');
    // Meta-test itself is allowlisted (patterns appear as fixture data, not real access)
    expect(ALLOWLIST).toContain('tests/scripts/lint-test-hermeticity.test.ts');
  });

  it('is an array of strings', () => {
    expect(Array.isArray(ALLOWLIST)).toBe(true);
    for (const entry of ALLOWLIST) {
      expect(typeof entry).toBe('string');
    }
  });
});

describe('unresolved registry ratchet', () => {
  const unresolvedEntries = [
    {
      file: 'tests/b.test.ts',
      effect: 'fs.writeFileSync',
      targetProvenance: 'deferred',
      classification: 'unresolved',
      callsite: 'bbbbbbbb',
    },
    {
      file: 'tests/a.test.ts',
      effect: 'fs.mkdirSync',
      targetProvenance: 'unknown',
      classification: 'unresolved',
      callsite: 'aaaaaaaa',
    },
    {
      file: 'tests/ignored.test.ts',
      effect: 'fs.mkdirSync',
      targetProvenance: 'repo',
      classification: 'migration',
      callsite: 'cccccccc',
    },
  ];

  it('fingerprints unresolved semantic identity independent of registry order', () => {
    const forward = unresolvedRegistryFingerprint(unresolvedEntries);
    const reverse = unresolvedRegistryFingerprint([...unresolvedEntries].reverse());
    expect(forward).toEqual(reverse);
    expect(forward.count).toBe(2);
    expect(forward.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('blocks strict mode and any count/digest drift from an accepted baseline', () => {
    const baseline = unresolvedRegistryFingerprint(unresolvedEntries);
    expect(evaluateUnresolvedPolicy(unresolvedEntries, { baseline })).toEqual({
      blocking: false,
      reason: undefined,
      fingerprint: baseline,
    });
    expect(evaluateUnresolvedPolicy(unresolvedEntries, {
      baseline,
      strictUnresolved: true,
    })).toEqual(expect.objectContaining({
      blocking: true,
      reason: 'strict unresolved policy',
    }));
    expect(evaluateUnresolvedPolicy(unresolvedEntries.slice(1), { baseline })).toEqual(
      expect.objectContaining({
        blocking: true,
        reason: 'unresolved registry drift',
      }),
    );
  });

  it('ratchets production content and edge identity with full SHA-256', () => {
    const inventory = [
      {
        file: 'src/b.ts',
        effect: 'test-support:production-dependency',
        classification: 'inventory',
        contentDigest: `2:${'b'.repeat(64)}`,
        outgoing: ['external:node:fs'],
      },
      {
        file: 'src/a.ts',
        effect: 'test-support:production-dependency',
        classification: 'inventory',
        contentDigest: `1:${'a'.repeat(64)}`,
        outgoing: ['src/b.ts'],
      },
    ];
    const baseline = productionInventoryFingerprint(inventory);
    expect(baseline).toEqual({
      count: 2,
      digest: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(productionInventoryFingerprint([...inventory].reverse())).toEqual(
      baseline,
    );
    expect(evaluateProductionInventoryPolicy(inventory, { baseline })).toEqual({
      blocking: false,
      reason: undefined,
      fingerprint: baseline,
    });
    for (const drifted of [
      [
        { ...inventory[0], contentDigest: `2:${'c'.repeat(64)}` },
        inventory[1],
      ],
      [
        inventory[0],
        { ...inventory[1], outgoing: ['src/c.ts'] },
      ],
    ]) {
      expect(evaluateProductionInventoryPolicy(drifted, { baseline })).toEqual(
        expect.objectContaining({
          blocking: true,
          reason: 'production inventory drift',
        }),
      );
    }
  });
});

// ─── HERMETIC_PATTERNS integrity ─────────────────────────────────────────────

describe('HERMETIC_PATTERNS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(HERMETIC_PATTERNS)).toBe(true);
    expect(HERMETIC_PATTERNS.length).toBeGreaterThan(0);
  });

  it('each entry has re (RegExp) and label (string)', () => {
    for (const p of HERMETIC_PATTERNS) {
      expect(p.re).toBeInstanceOf(RegExp);
      expect(typeof p.label).toBe('string');
    }
  });

  it('process.cwd()+.deckent pattern matches expected input', () => {
    const input = `const p = join(process.cwd(), '.deckent', 'config.json');`;
    const matched = HERMETIC_PATTERNS.some(({ re }) => re.test(input));
    expect(matched).toBe(true);
  });

  it('process.cwd()+.brain pattern matches expected input', () => {
    const input = `const d = join(process.cwd(), '.brain', 'exports', 'debt.md');`;
    const matched = HERMETIC_PATTERNS.some(({ re }) => re.test(input));
    expect(matched).toBe(true);
  });
});
