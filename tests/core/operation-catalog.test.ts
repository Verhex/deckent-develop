// ═══ OPERATION-001 O1 — catalog contract + fail-closed lint tests ══════════
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadOperationCatalog,
  resolveOperation,
  UnknownOperationError,
  gateSatisfiesEffect,
  EFFECT_MIN_GATE,
  Op,
} from '../../src/core/operation-catalog/index.js';
import { lintOperationCatalog } from '../../scripts/lint-operation-catalog.mjs';

describe('operation catalog — canonical vocabulary', () => {
  it('loads every entry with the full eight-field schema (D1)', () => {
    const ops = loadOperationCatalog();
    expect(ops.length).toBeGreaterThan(0);
    for (const op of ops) {
      expect(op.id).toMatch(/^op\./u);
      expect(op.version).toBeGreaterThanOrEqual(1);
      expect(op.title.en.length).toBeGreaterThan(0);
      expect(op.title.tr.length).toBeGreaterThan(0);
      expect(op.effect).toBeTruthy();
      expect(op.gate).toMatch(/^G[0-7]$/u);
      expect(op.risk).toBeTruthy();
      expect(op.capabilities.length).toBeGreaterThan(0);
      expect(op.idempotency).toBeTruthy();
      expect(op.auditEvent).toMatch(/\.v\d+$/u);
    }
  });

  it('resolves a known operation and fails CLOSED on an unknown one', () => {
    expect(resolveOperation(Op.FsWrite).effect).toBe('MUTATE_LOCAL');
    expect(() => resolveOperation('op.does.not.exist')).toThrowError(UnknownOperationError);
  });

  it('destructive and DB operations carry their stricter gates, not G1', () => {
    expect(resolveOperation(Op.FsDelete).gate).toBe('G3');
    expect(resolveOperation(Op.MemoryWrite).gate).toBe('G4');
  });

  it('gateSatisfiesEffect enforces the minimum-gate ladder', () => {
    expect(gateSatisfiesEffect('DESTRUCTIVE', 'G3')).toBe(true);
    expect(gateSatisfiesEffect('DESTRUCTIVE', 'G4')).toBe(true);  // stricter is allowed
    expect(gateSatisfiesEffect('DESTRUCTIVE', 'G1')).toBe(false); // weaker is not
    expect(gateSatisfiesEffect('READ', 'G0')).toBe(true);
    expect(EFFECT_MIN_GATE.DB).toBe('G4');
  });

  it('every catalog entry satisfies its own effect→gate minimum', () => {
    for (const op of loadOperationCatalog()) {
      expect(gateSatisfiesEffect(op.effect, op.gate), `${op.id} gate too weak`).toBe(true);
    }
  });
});

describe('lint-operation-catalog — fail-closed governance gate', () => {
  it('accepts the repository catalog as-is', () => {
    const { errors, count } = lintOperationCatalog() as { errors: string[]; count: number };
    expect(errors).toEqual([]);
    expect(count).toBeGreaterThan(0);
  });

  // The lint reads fixed repo paths, so defect cases are proven by asserting the
  // exact rules against crafted entries through the same matrix the lint uses.
  it('the effect→gate matrix would reject an authority downgrade', () => {
    // A DESTRUCTIVE operation declared at G1 is precisely the silent-downgrade
    // this gate exists to stop.
    expect(gateSatisfiesEffect('DESTRUCTIVE', 'G1')).toBe(false);
    expect(gateSatisfiesEffect('MEMORY_LAW', 'G4')).toBe(false);
    expect(gateSatisfiesEffect('PROVIDER_CALL', 'G6')).toBe(false);
  });

  it('the catalog file on disk is valid JSON with a pinned schemaVersion', () => {
    const raw = JSON.parse(readFileSync(
      join(process.cwd(), 'src/core/operation-catalog/catalog.v1.json'), 'utf-8',
    )) as { schemaVersion: number; operations: unknown[] };
    expect(raw.schemaVersion).toBe(1);
    expect(Array.isArray(raw.operations)).toBe(true);
  });

  it('a scratch catalog copy keeps the same entry count (source-of-truth check)', () => {
    const root = mkdtempSync(join(tmpdir(), 'op-catalog-'));
    try {
      const src = readFileSync(join(process.cwd(), 'src/core/operation-catalog/catalog.v1.json'), 'utf-8');
      const copy = join(root, 'catalog.v1.json');
      writeFileSync(copy, src);
      const parsed = JSON.parse(readFileSync(copy, 'utf-8')) as { operations: unknown[] };
      expect(parsed.operations.length).toBe(loadOperationCatalog().length);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
