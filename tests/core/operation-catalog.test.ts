import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EFFECT_MIN_GATE, Op, OperationRef, OperationVersionMismatchError, UnknownOperationError,
  gateSatisfiesEffect, loadOperationCatalog, operationReference, resolveOperation,
  resolveOperationReference, validateOperationConvergence,
} from '../../src/core/operation-catalog/index.js';
import type { ExactOperationReference } from '../../src/core/operation-catalog/index.js';

const repositoryRoot = process.cwd();

async function fixtureRoot(prefix = 'operation-catalog-'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const catalogDirectory = join(root, 'src/core/operation-catalog');
  await mkdir(catalogDirectory, { recursive: true });
  await writeFile(join(root, 'src/core/work-model.ts'), "export type Capability = 'fs-read' | 'fs-write' | 'db-query' | 'db-write';\n");
  await writeFile(join(catalogDirectory, 'catalog.v1.json'), await readFile(join(repositoryRoot, 'src/core/operation-catalog/catalog.v1.json'), 'utf8'));
  return root;
}

function runLinter(root: string, ...args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/lint-operation-catalog.mjs', '--root', root, ...args], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish(() => reject(new Error('operation catalog linter timed out')));
    }, 15_000);
    child.stdout.on('data', chunk => { output += String(chunk); });
    child.stderr.on('data', chunk => { output += String(chunk); });
    child.once('error', error => finish(() => reject(error)));
    child.once('close', code => finish(() => resolve({ code: code ?? -1, output })));
  });
}

async function mutateCatalog(root: string, mutate: (catalog: { operations: Array<Record<string, unknown>> }) => void): Promise<void> {
  const path = join(root, 'src/core/operation-catalog/catalog.v1.json');
  const catalog = JSON.parse(await readFile(path, 'utf8')) as { operations: Array<Record<string, unknown>> };
  mutate(catalog);
  await writeFile(path, `${JSON.stringify(catalog, null, 2)}\n`);
}

describe('operation catalog — canonical versioned vocabulary', () => {
  it('preserves Op strings and exposes immutable exact references', () => {
    const exactRead: ExactOperationReference = OperationRef.FsRead;
    // @ts-expect-error exact references reject negative versions.
    const negativeVersion: ExactOperationReference = { operationId: Op.FsRead, version: -1, key: 'op.fs.read@-1' };
    // @ts-expect-error exact references bind the key to the operation ID and version.
    const mismatchedKey: ExactOperationReference = { operationId: Op.FsRead, version: 1, key: 'op.fs.write@1' };
    void exactRead;
    void negativeVersion;
    void mismatchedKey;
    expect(Op.FsWrite).toBe('op.fs.write');
    expect(OperationRef.FsWrite).toEqual({ operationId: Op.FsWrite, version: 1, key: 'op.fs.write@1' });
    expect(Object.isFrozen(OperationRef.FsWrite)).toBe(true);
    const catalog = loadOperationCatalog();
    expect(catalog).toHaveLength(6);
    for (const operation of catalog) {
      expect(operation.title.en.trim()).not.toBe('');
      expect(operation.title.tr.trim()).not.toBe('');
      expect(operation.auditEvent).toMatch(/\.v[1-9][0-9]*$/u);
      expect(operation.capabilities.length).toBeGreaterThan(0);
      expect(Object.isFrozen(operation)).toBe(true);
      expect(Object.isFrozen(operation.title)).toBe(true);
      expect(Object.isFrozen(operation.capabilities)).toBe(true);
    }
  });

  it('distinguishes unknown IDs from supplied version mismatches without fallback', () => {
    expect(() => resolveOperationReference({ operationId: 'op.no.such.operation', version: 1 })).toThrow(UnknownOperationError);
    expect(() => resolveOperationReference({ operationId: Op.FsRead, version: 2 })).toThrow(OperationVersionMismatchError);
    expect(() => operationReference('op.no.such.operation', 1)).toThrow(UnknownOperationError);
    expect(() => operationReference(Op.FsRead, 0)).toThrow(OperationVersionMismatchError);
    expect(() => operationReference(Op.FsRead, 2)).toThrow(OperationVersionMismatchError);
    expect(resolveOperationReference(OperationRef.FsRead).id).toBe(Op.FsRead);
    expect(resolveOperation(Op.FsWrite).effect).toBe('MUTATE_LOCAL');
  });

  it('keeps the effect-to-gate minimum contract', () => {
    expect(gateSatisfiesEffect('DESTRUCTIVE', 'G3')).toBe(true);
    expect(gateSatisfiesEffect('DESTRUCTIVE', 'G1')).toBe(false);
    expect(EFFECT_MIN_GATE.DB).toBe('G4');
  });
});

describe('registry-neutral convergence evidence', () => {
  const read = { operationId: Op.FsRead, version: 1 };

  it('converges equivalent declarations deterministically independent of input order', () => {
    const declarations = [
      { registry: 'mcp', action: 'file.read', semanticEquivalenceKey: 'file.read', operation: read },
      { registry: 'cli', action: 'read', semanticEquivalenceKey: 'file.read', operation: read },
    ];
    const forward = validateOperationConvergence(declarations);
    const reverse = validateOperationConvergence([...declarations].reverse());
    expect(forward).toEqual(reverse);
    expect(forward).toEqual({
      ok: true,
      evidence: [{
        semanticEquivalenceKey: 'file.read',
        operation: { operationId: Op.FsRead, version: 1, key: 'op.fs.read@1' },
        declarations: [{ registry: 'cli', action: 'read' }, { registry: 'mcp', action: 'file.read' }],
      }],
    });
  });

  it('fails closed with deterministic diagnostics for malformed, duplicate, unknown, wrong-version, and ambiguous declarations', () => {
    const malformed = validateOperationConvergence([{ registry: '', action: 'x', semanticEquivalenceKey: 'x', operation: read }]);
    expect(malformed).toEqual({ ok: false, diagnostics: ['malformed declaration: registry, action, semanticEquivalenceKey, and positive operation version are required'] });
    expect(validateOperationConvergence([{
      registry: ' cli', action: 'x', semanticEquivalenceKey: 'x', operation: read,
    }])).toEqual({
      ok: false,
      diagnostics: ['malformed declaration: registry, action, semanticEquivalenceKey, and positive operation version are required'],
    });
    expect(validateOperationConvergence([{
      registry: 'cli', action: 'x\u0000hidden', semanticEquivalenceKey: 'x', operation: read,
    }]).ok).toBe(false);
    const duplicate = validateOperationConvergence([
      { registry: 'cli', action: 'x', semanticEquivalenceKey: 'x', operation: read },
      { registry: 'cli', action: 'x', semanticEquivalenceKey: 'x', operation: read },
    ]);
    expect(duplicate).toEqual({ ok: false, diagnostics: ["duplicate declaration identity 'cli/x'"] });
    const validDuplicate = { registry: 'cli', action: 'same', semanticEquivalenceKey: 'same', operation: read };
    const unknownDuplicate = { registry: 'cli', action: 'same', semanticEquivalenceKey: 'same', operation: { operationId: 'op.no.such.operation', version: 1 } };
    expect(validateOperationConvergence([unknownDuplicate, validDuplicate]))
      .toEqual(validateOperationConvergence([validDuplicate, unknownDuplicate]));
    expect(validateOperationConvergence([{ registry: 'cli', action: 'x', semanticEquivalenceKey: 'x', operation: { operationId: 'op.no.such.operation', version: 1 } }]).ok).toBe(false);
    expect(validateOperationConvergence([{ registry: 'cli', action: 'x', semanticEquivalenceKey: 'x', operation: { operationId: Op.FsRead, version: 2 } }]).ok).toBe(false);
    const ambiguous = validateOperationConvergence([
      { registry: 'cli', action: 'x', semanticEquivalenceKey: 'x', operation: read },
      { registry: 'mcp', action: 'x', semanticEquivalenceKey: 'x', operation: { operationId: Op.FsWrite, version: 1 } },
    ]);
    expect(ambiguous).toEqual({ ok: false, diagnostics: ["ambiguous semantic-equivalence key 'x': op.fs.read@1, op.fs.write@1"] });
  });
});

describe('lint-operation-catalog — real deterministic entrypoint in isolated roots', () => {
  it('generates root-independent bytes, detects drift, and never writes in default/check mode', async () => {
    const root = await fixtureRoot('operation catalog native path-');
    const secondRoot = await fixtureRoot('operation-catalog-second-root-');
    try {
      expect((await runLinter(root, '--write')).code).toBe(0);
      const generatedPath = join(root, 'src/core/operation-catalog/generated.ts');
      const firstBytes = await readFile(generatedPath, 'utf8');
      expect((await runLinter(root, '--write')).code).toBe(0);
      expect(await readFile(generatedPath, 'utf8')).toBe(firstBytes);
      expect((await runLinter(secondRoot, '--write')).code).toBe(0);
      expect(await readFile(join(secondRoot, 'src/core/operation-catalog/generated.ts'), 'utf8')).toBe(firstBytes);
      expect(firstBytes).not.toContain(root);
      expect(firstBytes).not.toContain(secondRoot);
      await writeFile(generatedPath, `${firstBytes}// drift\n`);
      const beforeCheck = await readFile(generatedPath, 'utf8');
      const defaultCheck = await runLinter(root);
      const explicitCheck = await runLinter(root, '--check');
      expect(defaultCheck.code).toBe(1);
      expect(explicitCheck.code).toBe(1);
      expect(defaultCheck.output).toContain('generated.ts drift');
      expect(await readFile(generatedPath, 'utf8')).toBe(beforeCheck);
      const conflictingMode = await runLinter(root, '--check', '--write');
      expect(conflictingMode.code).toBe(1);
      expect(conflictingMode.output).toContain('mutually exclusive');
      expect(await readFile(generatedPath, 'utf8')).toBe(beforeCheck);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(secondRoot, { recursive: true, force: true });
    }
  });

  it('rejects duplicate IDs, symbol collisions, invalid versions, audit-version drift, and incomplete bilingual titles', async () => {
    const mutations: Array<{ expected: string; mutate: (root: string) => Promise<void> }> = [
      {
        expected: 'duplicate operation key',
        mutate: root => mutateCatalog(root, catalog => { catalog.operations.push({ ...catalog.operations[0] }); }),
      },
      {
        expected: 'generated symbol collision',
        mutate: root => mutateCatalog(root, catalog => {
          catalog.operations.push({ ...catalog.operations[0], id: 'op.foo-bar.baz', auditEvent: 'foo.bar.baz.v1' });
          catalog.operations.push({ ...catalog.operations[0], id: 'op.foo.bar-baz', auditEvent: 'foo.bar.baz.v1' });
        }),
      },
      {
        expected: 'is not a valid TypeScript identifier',
        mutate: root => mutateCatalog(root, catalog => {
          catalog.operations[0].id = 'op.123.write';
          catalog.operations[0].auditEvent = 'op.123.write.v1';
        }),
      },
      {
        expected: 'version must be a positive integer',
        mutate: root => mutateCatalog(root, catalog => { catalog.operations[0].version = 0; }),
      },
      {
        expected: 'auditEvent version must match',
        mutate: root => mutateCatalog(root, catalog => { catalog.operations[0].auditEvent = 'fs.read.v2'; }),
      },
      {
        expected: 'title must carry non-empty en AND tr',
        mutate: root => mutateCatalog(root, catalog => { catalog.operations[0].title = { en: 'Read', tr: '' }; }),
      },
    ];
    for (const testCase of mutations) {
      const root = await fixtureRoot();
      try {
        await testCase.mutate(root);
        const before = await readFile(join(root, 'src/core/operation-catalog/catalog.v1.json'), 'utf8');
        const result = await runLinter(root, '--check');
        expect(result.code).toBe(1);
        expect(result.output).toContain('[operation-catalog] FAIL');
        expect(result.output).toContain(testCase.expected);
        expect(await readFile(join(root, 'src/core/operation-catalog/catalog.v1.json'), 'utf8')).toBe(before);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  it('accepts the checked-in six-entry projection in read-only check mode', async () => {
    const result = await runLinter(repositoryRoot, '--check');
    expect(result.code).toBe(0);
    expect(result.output).toContain('6 operation(s) valid');
  });
});
