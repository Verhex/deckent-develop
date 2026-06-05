// tests/core/export-empty-db-guard.test.ts — Sprint 232 task 232-005.
//
// Verifies the dbCount===0 disk-protect guard in writeGuardedExports:
// when the DB is empty but the on-disk .md file has real content,
// the guard must refuse to overwrite (skip + warn) — preserving the file.
//
// Four scenarios (goCriteria):
//   1. Empty DB + disk decisions.md has real content → file PRESERVED (skipped + warning)
//   2. Empty DB + no disk file → writes normally (no guard trip)
//   3. Empty DB + disk file already contains emptyMarker → writes normally (not protected)
//   4. dbCount > 0 + normal render → written normally (no regression)
//
// Hermetic: tmpdir DB + tmpdir exports dir; no project-root or HOME I/O.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import type { CreateEntryInput } from '../../src/core/memory-types.js';
import { writeGuardedExports } from '../../src/core/memory-export.js';

let store: MemoryStore;
let tmpDir: string;
let exportsDir: string;

function makeAdr(overrides: Partial<CreateEntryInput> = {}): CreateEntryInput {
  return {
    id: overrides.id ?? 'adr-001',
    type: 'adr',
    title: overrides.title ?? 'TypeScript ESM',
    content: overrides.content ?? '**Status:** accepted\n\nDecision: use TypeScript.',
    source: 'brain',
    status: overrides.status ?? 'accepted',
    priority: 'normal',
    sprint_id: 'sprint-232',
    sprint_num: 232,
    lang: 'en',
    decay_exempt: true,
    tags: ['adr'],
    relations: [],
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'export-empty-db-guard-'));
  const dbPath = join(tmpDir, 'memory.db');
  store = new MemoryStore(dbPath);
  exportsDir = join(tmpDir, 'exports');
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('writeGuardedExports — dbCount===0 disk-protect guard (Sprint 232 task 232-005)', () => {
  // ── Test 1: empty DB + disk file has real content → preserve ──
  it('refuses to overwrite decisions.md when DB is empty but disk file has real content', () => {
    mkdirSync(exportsDir, { recursive: true });
    const decisionsPath = join(exportsDir, 'decisions.md');
    const PRIOR_GOOD =
      '# Architecture Decision Records (auto-generated)\n\n' +
      '## adr-001: TypeScript ESM\n\n' +
      '**Status:** accepted\n\n' +
      'Decision: use TypeScript with ESM imports.\n';
    writeFileSync(decisionsPath, PRIOR_GOOD, 'utf-8');

    // DB is empty — no entries at all
    expect(store.getByType('adr').length).toBe(0);

    const result = writeGuardedExports(store, exportsDir);

    // Guard tripped on decisions.md
    expect(result.skipped).toContain('decisions.md');
    expect(result.warnings.some((w) => w.includes('decisions.md'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('export-wipe-guard'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('DB is empty'))).toBe(true);

    // Previous file preserved byte-for-byte
    const preserved = readFileSync(decisionsPath, 'utf-8');
    expect(preserved).toBe(PRIOR_GOOD);
  });

  // ── Test 2: empty DB + no disk file → write normally ──
  it('writes normally when DB is empty and no disk file exists', () => {
    expect(store.getByType('adr').length).toBe(0);
    expect(existsSync(join(exportsDir, 'decisions.md'))).toBe(false);

    const result = writeGuardedExports(store, exportsDir);

    // Guard does NOT trip — no disk file to protect
    expect(result.written).toContain('decisions.md');
    expect(result.skipped).not.toContain('decisions.md');
    expect(result.warnings.filter((w) => w.includes('decisions.md')).length).toBe(0);

    // File was written with the empty marker
    const content = readFileSync(join(exportsDir, 'decisions.md'), 'utf-8');
    expect(content).toContain('_No architecture decisions recorded._');
  });

  // ── Test 3: empty DB + disk file already has emptyMarker → write normally ──
  it('writes normally when disk file already contains the emptyMarker (no real content to protect)', () => {
    mkdirSync(exportsDir, { recursive: true });
    const decisionsPath = join(exportsDir, 'decisions.md');
    // Disk file already contains the emptyMarker — nothing to protect
    const EMPTY_MARKER_CONTENT =
      '# Architecture Decision Records (auto-generated)\n\n' +
      '_No architecture decisions recorded._\n';
    writeFileSync(decisionsPath, EMPTY_MARKER_CONTENT, 'utf-8');

    expect(store.getByType('adr').length).toBe(0);

    const result = writeGuardedExports(store, exportsDir);

    // Guard does NOT trip — disk file has no real content to protect
    expect(result.written).toContain('decisions.md');
    expect(result.skipped).not.toContain('decisions.md');
    expect(result.warnings.filter((w) => w.includes('decisions.md') && w.includes('DB is empty')).length).toBe(0);
  });

  // ── Test 4: dbCount > 0 + normal render → written normally (no regression) ──
  it('writes decisions.md normally when DB has ADR entries and render is non-empty', () => {
    store.insert(makeAdr({ id: 'adr-001', title: 'TypeScript ESM' }));
    store.insert(makeAdr({ id: 'adr-002', title: 'Node16 Resolution' }));
    expect(store.getByType('adr').length).toBe(2);

    const result = writeGuardedExports(store, exportsDir);

    expect(result.written).toContain('decisions.md');
    expect(result.skipped).not.toContain('decisions.md');
    expect(result.warnings.filter((w) => w.includes('decisions.md')).length).toBe(0);

    const content = readFileSync(join(exportsDir, 'decisions.md'), 'utf-8');
    expect(content).toContain('TypeScript ESM');
    expect(content).toContain('Node16 Resolution');
    expect(content).not.toContain('_No architecture decisions recorded._');
  });
});
