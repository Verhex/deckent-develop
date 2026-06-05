// tests/core/debt-export-guard.test.ts — Sprint 231 task 231-002.
//
// Verifies that writeGuardedExports applies the dbCount>0 && renderIsEmpty guard
// to debt.md symmetrically with summary.md/decisions.md/memory.md.
//
// Three scenarios (goCriteria):
//   1. DB has debt + render collapses to empty → guard trips, debt.md NOT overwritten
//   2. DB has 0 debt → guard does NOT trip, minimal debt.md written (0-legit-debt correct)
//   3. DB has debt + render is non-empty → guard does NOT trip, debt.md written normally
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

function makeDebt(overrides: Partial<CreateEntryInput> = {}): CreateEntryInput {
  return {
    id: overrides.id ?? 'debt-001',
    type: 'debt',
    title: overrides.title ?? 'Test Debt',
    content: overrides.content ?? 'Some technical debt item.',
    source: 'brain',
    status: overrides.status ?? 'active',
    priority: overrides.priority ?? 'normal',
    sprint_id: overrides.sprint_id ?? 'sprint-231',
    sprint_num: overrides.sprint_num ?? 231,
    lang: 'en',
    decay_exempt: false,
    tags: ['debt'],
    relations: [],
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'debt-export-guard-'));
  const dbPath = join(tmpDir, 'memory.db');
  store = new MemoryStore(dbPath);
  exportsDir = join(tmpDir, 'exports');
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('writeGuardedExports — debt.md guard (Sprint 231 task 231-002)', () => {
  // ── Test 1: DB has debt + render collapses → preserve previous file ──
  it('refuses to overwrite debt.md when render collapses to empty marker while DB has debt entries', () => {
    mkdirSync(exportsDir, { recursive: true });
    const debtPath = join(exportsDir, 'debt.md');
    const PRIOR_GOOD =
      '# Technical Debt (auto-generated)\n\n## Active Technical Debt\n\n' +
      '| ID | Title | Priority | Sprint | Status |\n' +
      '|----|-------|----------|--------|--------|\n' +
      '| debt-001 | Real Debt | critical | sprint-230 | active |\n';
    writeFileSync(debtPath, PRIOR_GOOD, 'utf-8');

    // Seed real debt entry.
    store.insert(makeDebt({ id: 'debt-001', title: 'Real Debt', priority: 'critical' }));
    expect(store.getByType('debt').length).toBe(1);

    // Targeted proxy: exportSummaryMd (processed first) also calls getByType('debt'),
    // so the call sequence for 'debt' is:
    //   call 1 — summary.md render (inside exportSummaryMd) → return real (don't interfere)
    //   call 2 — debt.md render   (inside exportDebtMd)     → return [] (simulate collapse)
    //   call 3 — debt.md guard count                         → return real (trips the guard)
    let debtCallCount = 0;
    const racyStore = new Proxy(store, {
      get(target, prop, receiver) {
        if (prop === 'getByType') {
          return (type: string) => {
            if (type === 'debt') {
              debtCallCount++;
              return debtCallCount === 2 ? [] : target.getByType(type as never);
            }
            return target.getByType(type as never);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const result = writeGuardedExports(racyStore as unknown as MemoryStore, exportsDir);

    // Guard tripped on debt.md.
    expect(result.skipped).toContain('debt.md');
    expect(result.warnings.some((w) => w.includes('debt.md'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('export-wipe-guard'))).toBe(true);

    // Previous file preserved byte-for-byte.
    const preserved = readFileSync(debtPath, 'utf-8');
    expect(preserved).toBe(PRIOR_GOOD);
  });

  // ── Test 2: DB has 0 debt → minimal output written (not suppressed) ──
  it('writes debt.md with minimal content when DB has no debt entries (0-legit-debt correct)', () => {
    expect(store.getByType('debt').length).toBe(0);

    const result = writeGuardedExports(store, exportsDir);

    // Guard does NOT trip — dbCount=0, so condition (dbCount>0 && renderIsEmpty) is false.
    expect(result.written).toContain('debt.md');
    expect(result.skipped).not.toContain('debt.md');
    expect(result.warnings.filter((w) => w.includes('debt.md')).length).toBe(0);

    const debtContent = readFileSync(join(exportsDir, 'debt.md'), 'utf-8');
    expect(debtContent).toContain('# Technical Debt (auto-generated)');
    expect(debtContent).toContain('_No technical debt recorded._');
    expect(existsSync(join(exportsDir, 'debt.md'))).toBe(true);
  });

  // ── Test 3: DB has debt + render is non-empty → written normally ──
  it('writes debt.md normally when DB has debt entries and the renderer emits real content', () => {
    store.insert(makeDebt({ id: 'debt-001', title: 'MCP Disconnect', priority: 'critical' }));
    store.insert(makeDebt({ id: 'debt-002', title: 'Memory Leak', priority: 'high' }));

    const result = writeGuardedExports(store, exportsDir);

    expect(result.written).toContain('debt.md');
    expect(result.skipped).not.toContain('debt.md');
    expect(result.warnings.filter((w) => w.includes('debt.md')).length).toBe(0);

    const debtContent = readFileSync(join(exportsDir, 'debt.md'), 'utf-8');
    expect(debtContent).toContain('MCP Disconnect');
    expect(debtContent).toContain('Memory Leak');
    expect(debtContent).toContain('critical');
    expect(debtContent).not.toContain('_No technical debt recorded._');
  });

  // ── Test 4: Other exports still guarded (regression) ──
  it('does not break existing guards for summary.md and decisions.md', () => {
    // 1 ADR inserted so guard could trip if render collapses.
    store.insert({
      id: 'adr-001',
      type: 'adr',
      title: 'TypeScript ESM',
      content: '**Status:** accepted\n\nDecision: use TypeScript.',
      source: 'brain',
      status: 'accepted',
      priority: 'normal',
      sprint_id: 'sprint-231',
      sprint_num: 231,
      lang: 'en',
      decay_exempt: true,
      tags: ['adr'],
      relations: [],
    });

    // Normal run (no racy proxy) — guard should NOT trip.
    const result = writeGuardedExports(store, exportsDir);

    expect(result.written).toContain('summary.md');
    expect(result.written).toContain('decisions.md');
    expect(result.written).toContain('memory.md');
    expect(result.written).toContain('debt.md');
    expect(result.skipped.length).toBe(0);
    expect(result.warnings.length).toBe(0);
  });
});
