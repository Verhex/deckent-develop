/**
 * tests/core/rule-regen-db-query.test.ts
 *
 * Sprint 168 Cluster C0a-2 — Step 4 ruleRegen DB Query.
 *
 * Sprint 167 T3 HIGH finding: `.claude/rules/brain.md` Active ADR Constraints
 * showed 44/50 ADRs (11 missing). Root cause was that the regeneration path
 * was not regenerating from `store.getByType('adr')` — it relied on stale
 * state. This test pins the contract: rendering rules from a populated
 * MemoryStore must include EVERY accepted ADR.
 *
 * See: docs/superpowers/plans/2026-05-14-sprint-168-plan.md lines 1371-1379
 *      docs/audits/sprint-167/T5-brain-debug-phase2.md (Cluster A.2)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  renderRulesFromStore,
} from '../../src/core/rule-generator.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import type { CreateEntryInput } from '../../src/core/memory-types.js';

// ─── Helpers ─────────────────────────────────────────────────────

const TEST_ROOT = join(tmpdir(), '.test-rule-regen-db-query-' + process.pid);

function openTestStore(): MemoryStore {
  mkdirSync(TEST_ROOT, { recursive: true });
  const dbPath = join(TEST_ROOT, 'memory.db');
  if (existsSync(dbPath)) rmSync(dbPath);
  return new MemoryStore(dbPath);
}

function seedAdrEntries(store: MemoryStore, count: number, status: string = 'accepted'): void {
  for (let i = 1; i <= count; i++) {
    const padded = String(i).padStart(3, '0');
    const input: CreateEntryInput = {
      id: `adr-${padded}`,
      type: 'adr',
      title: `Test ADR ${padded}`,
      content: `Body for ADR ${padded}.`,
      summary: `Summary ${padded}`,
      status,
      decay_exempt: true,
      sprint_num: 1,
    };
    store.insert(input);
  }
}

function cleanup(store: MemoryStore | null): void {
  if (store) {
    try { store.close(); } catch { /* noop */ }
  }
  if (existsSync(TEST_ROOT)) {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  }
}

// ─── Tests ───────────────────────────────────────────────────────

describe('ruleRegen DB query — Active ADR Constraints fresh list', () => {
  let store: MemoryStore | null = null;

  beforeEach(() => {
    store = null;
  });

  afterEach(() => {
    cleanup(store);
    store = null;
  });

  it('renders brain.md from store.getByType(adr) — all 50 ADRs present', () => {
    store = openTestStore();
    seedAdrEntries(store, 50);

    const rules = renderRulesFromStore(store);

    // Count ADR bullet entries in brain.md output
    const adrMatches = rules.brainMd.match(/\*\*ADR-\d+\*\*/g) || [];
    expect(adrMatches.length, 'brain.md must include all 50 seeded ADRs (not 44)').toBe(50);

    // Spot-check first and last ADR ids
    expect(rules.brainMd).toContain('ADR-001');
    expect(rules.brainMd).toContain('ADR-050');
  });

  it('filters out non-accepted ADRs (only accepted reach the output)', () => {
    store = openTestStore();
    // Insert 5 accepted + 3 proposed
    seedAdrEntries(store, 5, 'accepted');
    for (let i = 100; i <= 102; i++) {
      store.insert({
        id: `adr-${i}`,
        type: 'adr',
        title: `Proposed ${i}`,
        content: 'pending',
        status: 'proposed',
        decay_exempt: true,
      });
    }

    const rules = renderRulesFromStore(store);
    const adrMatches = rules.brainMd.match(/\*\*ADR-\d+\*\*/g) || [];
    expect(adrMatches.length).toBe(5);
    expect(rules.brainMd).not.toContain('ADR-100');
    expect(rules.brainMd).not.toContain('ADR-101');
    expect(rules.brainMd).not.toContain('ADR-102');
  });

  it('returns auditor.md and worker.md alongside brain.md', () => {
    store = openTestStore();
    seedAdrEntries(store, 3);

    const rules = renderRulesFromStore(store);

    expect(rules.brainMd).toContain('# Brain Rules');
    expect(rules.auditorMd).toContain('# Auditor Rules');
    expect(rules.workerMd).toContain('# Worker Rules');

    // ADR section appears in all 3 role outputs
    for (const md of [rules.brainMd, rules.auditorMd, rules.workerMd]) {
      expect(md).toContain('ADR-001');
      expect(md).toContain('ADR-003');
    }
  });

  it('empty store produces rules without ADR section', () => {
    store = openTestStore();
    // no ADRs seeded

    const rules = renderRulesFromStore(store);
    const adrMatches = rules.brainMd.match(/\*\*ADR-\d+\*\*/g) || [];
    expect(adrMatches.length).toBe(0);
    // Template should still render
    expect(rules.brainMd).toContain('# Brain Rules');
  });

  it('renderRulesFromStore reads via getByType("adr") (uses store API)', () => {
    // Pure unit-style verification: pass a hand-rolled store-like object
    // so we can assert the exact query call. This guards against future
    // refactors that might switch to a different access pattern.
    let lastQuery: string | null = null;
    const fakeStore = {
      getByType(type: string) {
        lastQuery = type;
        return [
          {
            id: 'adr-001',
            type: 'adr',
            source: 'system' as const,
            title: 'Fake',
            content: 'fake content',
            summary: null,
            tag_text: '',
            title_norm: 'fake',
            content_norm: 'fake content',
            summary_norm: '',
            tag_norm: '',
            status: 'accepted',
            priority: 'normal',
            sprint_id: null,
            sprint_num: 0,
            lang: 'en',
            decay_exempt: true,
            metadata: '{}',
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
            deleted_at: null,
          },
        ];
      },
    };
    const rules = renderRulesFromStore(fakeStore);
    expect(lastQuery).toBe('adr');
    expect(rules.brainMd).toContain('ADR-001');
  });
});
