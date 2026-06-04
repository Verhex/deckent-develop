// tests/orchestra/export-wipe-guard.test.ts — Sprint 227 task 227-002.
//
// Regression suite for the export-wipe-guard introduced to block the
// catastrophic finalize-path wipe observed in sprint-226: `runMemoryExport`
// overwrote `.brain/exports/decisions.md` from 8518 lines to 2 ("_No
// architecture decisions recorded._") while the DB still held 75 ADRs.
//
// `writeGuardedExports` (src/core/memory-export.ts) must refuse to overwrite
// a previously-good .md when the render collapses to the "no entries" marker
// but the DB has entries of the relevant type.
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
    title: overrides.title ?? 'Test ADR',
    content: overrides.content ?? '# ADR-001\n\n**Status:** accepted\n\nDecision: do the thing.',
    source: 'brain',
    status: overrides.status ?? 'accepted',
    priority: 'normal',
    sprint_id: overrides.sprint_id ?? 'sprint-227',
    sprint_num: overrides.sprint_num ?? 227,
    lang: 'en',
    decay_exempt: true,
    tags: ['adr'],
    relations: [],
  };
}

function makeMemory(overrides: Partial<CreateEntryInput> = {}): CreateEntryInput {
  return {
    id: overrides.id ?? 'mem-001',
    type: 'memory',
    title: overrides.title ?? 'Sprint Learning',
    content: overrides.content ?? 'We learned to guard exports.',
    source: 'brain',
    status: 'active',
    priority: 'normal',
    sprint_id: overrides.sprint_id ?? 'sprint-227',
    sprint_num: overrides.sprint_num ?? 227,
    lang: 'en',
    decay_exempt: false,
    tags: ['learning'],
    relations: [],
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'export-wipe-guard-'));
  const dbPath = join(tmpDir, 'memory.db');
  store = new MemoryStore(dbPath);
  exportsDir = join(tmpDir, 'exports');
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('writeGuardedExports — export-wipe-guard (Sprint 227 task 227-002)', () => {
  // ── Test 1: DB has ADRs but render is empty → preserve previous ──
  it('refuses to overwrite decisions.md when the render collapses to the empty marker while DB has ADRs (preserves previous file)', () => {
    // Seed a previous good decisions.md (mirrors sprint-226 8518-line state).
    mkdirSync(exportsDir, { recursive: true });
    const decisionsPath = join(exportsDir, 'decisions.md');
    const PRIOR_GOOD = '# Architecture Decision Records (auto-generated)\n\n## adr-001: Big ADR\n\n**Status:** accepted\n\n[8518 lines of real content]\n';
    writeFileSync(decisionsPath, PRIOR_GOOD, 'utf-8');

    // Real DB state: 1 ADR present.
    store.insert(makeAdr({ id: 'adr-001', title: 'Real ADR' }));
    expect(store.getByType('adr').length).toBe(1);

    // Racy-store proxy: alternate per-type so renderer call → empty view,
    // guard's count call → real view. The spec loop calls render() (which
    // queries getByType('adr') once for the ADR-keyed exports) and then the
    // guard counts via store.getByType(entryType). With odd-call=[],
    // even-call=real, both summary.md and decisions.md see render-empty +
    // count-non-zero. Precisely models the sprint-226 wipe race.
    const callCountByType = new Map<string, number>();
    const racyStore = new Proxy(store, {
      get(target, prop, receiver) {
        if (prop === 'getByType') {
          return (type: string) => {
            const n = (callCountByType.get(type) ?? 0) + 1;
            callCountByType.set(type, n);
            // Odd call (render) → empty view. Even call (guard) → real view.
            return n % 2 === 1 ? [] : target.getByType(type as never);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const result = writeGuardedExports(racyStore as unknown as MemoryStore, exportsDir);

    // Guard tripped on summary.md AND decisions.md (both keyed by entryType='adr').
    expect(result.skipped).toContain('decisions.md');
    expect(result.skipped).toContain('summary.md');
    expect(result.warnings.some((w) => w.includes('decisions.md'))).toBe(true);

    // Previous file preserved byte-for-byte.
    const preserved = readFileSync(decisionsPath, 'utf-8');
    expect(preserved).toBe(PRIOR_GOOD);
  });

  // ── Test 2: Normal case — DB has data, render is non-empty → write ──
  it('writes decisions.md normally when DB has ADRs and the renderer emits real content', () => {
    store.insert(makeAdr({ id: 'adr-001', title: 'First ADR' }));
    store.insert(makeAdr({ id: 'adr-002', title: 'Second ADR' }));

    const result = writeGuardedExports(store, exportsDir);

    expect(result.written).toContain('decisions.md');
    expect(result.written).toContain('summary.md');
    expect(result.skipped).not.toContain('decisions.md');
    expect(result.warnings.length).toBe(0);

    const decisionsContent = readFileSync(join(exportsDir, 'decisions.md'), 'utf-8');
    expect(decisionsContent).toContain('adr-001');
    expect(decisionsContent).toContain('adr-002');
    expect(decisionsContent).not.toContain('_No architecture decisions recorded._');
  });

  // ── Test 3: Empty DB + empty render → permitted (no false positive) ──
  it('writes decisions.md when DB has no ADRs (empty render is correct, not catastrophic)', () => {
    // No inserts — fresh store has zero ADRs.
    expect(store.getByType('adr').length).toBe(0);

    const result = writeGuardedExports(store, exportsDir);

    // Guard does NOT trip — DB has 0 entries, so the empty marker is correct.
    expect(result.written).toContain('decisions.md');
    expect(result.written).toContain('summary.md');
    expect(result.written).toContain('memory.md');
    expect(result.skipped.length).toBe(0);
    expect(result.warnings.length).toBe(0);

    const decisionsContent = readFileSync(join(exportsDir, 'decisions.md'), 'utf-8');
    expect(decisionsContent).toContain('_No architecture decisions recorded._');
  });

  // ── Test 4: Warning is emitted on skip + memory.md parallel ──
  it('emits a descriptive warning per guard trip and preserves memory.md alongside decisions.md', () => {
    // Seed previous good memory.md (simulates a populated prior state).
    mkdirSync(exportsDir, { recursive: true });
    const PRIOR_MEMORY = '# Sprint Learnings (auto-generated)\n\n## Sprint sprint-226 Learnings\n- Learned a lot\n';
    const memoryPath = join(exportsDir, 'memory.md');
    writeFileSync(memoryPath, PRIOR_MEMORY, 'utf-8');

    // Seed real memory entries so getByType('memory').length > 0 for the guard.
    store.insert(makeMemory({ id: 'mem-001', title: 'Real learning 1' }));
    store.insert(makeMemory({ id: 'mem-002', title: 'Real learning 2' }));

    // Racy proxy targeted at memory.md.
    // Call sequence for getByType('memory') inside writeGuardedExports:
    //   1. summary.md renderer → return real so summary content is sane
    //   2. memory.md renderer → return [] so it emits the empty marker
    //   3. memory.md guard count → return real so length > 0 trips the guard
    // ADR calls pass through (DB has 0 ADRs anyway; guards there don't trip).
    let memoryCount = 0;
    const racyStore = new Proxy(store, {
      get(target, prop, receiver) {
        if (prop === 'getByType') {
          return (type: string) => {
            if (type !== 'memory') return target.getByType(type as never);
            memoryCount++;
            return memoryCount === 2 ? [] : target.getByType(type as never);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const result = writeGuardedExports(racyStore as unknown as MemoryStore, exportsDir);

    // memory.md was guarded.
    expect(result.skipped).toContain('memory.md');
    const memoryWarning = result.warnings.find((w) => w.includes('memory.md'));
    expect(memoryWarning).toBeDefined();
    expect(memoryWarning).toContain('export-wipe-guard');
    expect(memoryWarning).toContain('refused to write');
    expect(memoryWarning).toMatch(/DB has \d+ memory entries/);

    // Previous memory.md preserved untouched.
    const preserved = readFileSync(memoryPath, 'utf-8');
    expect(preserved).toBe(PRIOR_MEMORY);
  });

  // ── Test 5: Bonus — debt.md is always written (renderer always non-empty) ──
  it('writes debt.md unconditionally (not gated by the empty-marker heuristic)', () => {
    store.insert(makeAdr());
    const result = writeGuardedExports(store, exportsDir);
    expect(result.written).toContain('debt.md');
    expect(existsSync(join(exportsDir, 'debt.md'))).toBe(true);
  });
});
