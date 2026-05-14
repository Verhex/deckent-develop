/**
 * tests/core/adr-046-step-ordering-invariant.test.ts
 *
 * Sprint 168 Cluster C0a-2 — ADR-046 Step Ordering Contract invariant.
 *
 * Verifies the *outcome* contract of ADR-046 Step Ordering: any ADR
 * inserted in Step 3 (adrInsert) MUST be visible to Step 4 (ruleRegen)
 * when rules are regenerated from the same MemoryStore.
 *
 * This is the freshness invariant: regenerateRules MUST read from the
 * store at invocation time — not from a stale cached snapshot. If a
 * brand new ADR (e.g. ADR-046, ADR-047, ADR-048 from Sprint 168) is
 * inserted just before ruleRegen runs, the rule output MUST contain it.
 *
 * See: docs/adr/046-brain-self-update-hook-architecture.md (Section 5.1)
 *      tests/core/identity-generator-step-order.test.ts (hook ordering)
 *
 * This test is COMPLEMENTARY to identity-generator-step-order.test.ts —
 * that test verifies the call order at the hook chain level; this test
 * verifies the rule-generator's output contract given the freshness
 * assumption.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { renderRulesFromStore } from '../../src/core/rule-generator.js';
import { MemoryStore } from '../../src/core/memory-store.js';

const TEST_ROOT = join(tmpdir(), '.test-adr-046-step-ordering-' + process.pid);

function openTestStore(): MemoryStore {
  mkdirSync(TEST_ROOT, { recursive: true });
  const dbPath = join(TEST_ROOT, 'memory.db');
  if (existsSync(dbPath)) rmSync(dbPath);
  return new MemoryStore(dbPath);
}

describe('ADR-046 Step Ordering Contract — freshness invariant', () => {
  let store: MemoryStore | null = null;

  beforeEach(() => {
    store = null;
  });

  afterEach(() => {
    if (store) {
      try { store.close(); } catch { /* noop */ }
      store = null;
    }
    if (existsSync(TEST_ROOT)) {
      rmSync(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it('Step 3 → Step 4: freshly inserted ADR appears in regenerated rules', () => {
    store = openTestStore();

    // Simulate Step 3 (adrInsert): a brand new ADR is upserted into memory.db
    store.insert({
      id: 'adr-999',
      type: 'adr',
      title: 'Test Step Ordering Invariant ADR',
      content: 'Freshly inserted before Step 4 runs.',
      summary: 'Step 3 → Step 4 freshness test',
      status: 'accepted',
      decay_exempt: true,
      sprint_num: 168,
    });

    // Simulate Step 4 (ruleRegen): rules regenerate against the same store.
    const rules = renderRulesFromStore(store);

    // The new ADR MUST appear — proves Step 4 reads from the store, not from
    // a stale snapshot taken before Step 3.
    expect(rules.brainMd).toContain('ADR-999');
    expect(rules.auditorMd).toContain('ADR-999');
    expect(rules.workerMd).toContain('ADR-999');
  });

  it('does not contain ADR before insert (sanity check)', () => {
    store = openTestStore();

    // Empty store — no ADR-999 yet
    const before = renderRulesFromStore(store);
    expect(before.brainMd).not.toContain('ADR-999');

    // Now insert
    store.insert({
      id: 'adr-999',
      type: 'adr',
      title: 'Pre/Post Diff',
      content: 'x',
      status: 'accepted',
      decay_exempt: true,
    });

    // Re-render — ADR now visible
    const after = renderRulesFromStore(store);
    expect(after.brainMd).toContain('ADR-999');
  });

  it('multiple ADRs inserted in sequence all visible in one regen', () => {
    store = openTestStore();

    // Simulate Sprint 168 inserting ADR-047 + ADR-048 sequentially
    const ids = ['adr-047', 'adr-048'];
    for (const id of ids) {
      store.insert({
        id,
        type: 'adr',
        title: `Sprint 168 ADR ${id}`,
        content: 'New governance doc',
        status: 'accepted',
        decay_exempt: true,
        sprint_num: 168,
      });
    }

    const rules = renderRulesFromStore(store);
    expect(rules.brainMd).toContain('ADR-047');
    expect(rules.brainMd).toContain('ADR-048');
  });
});
