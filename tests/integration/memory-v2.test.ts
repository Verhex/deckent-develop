/**
 * Memory V2 Integration Test — Full lifecycle exercising all modules together.
 *
 * Tests:
 *   1. Full lifecycle: insert -> search -> export -> reimport -> verify roundtrip
 *   2. Turkish i18n: ISIK and isik both find the same entry
 *   3. Decay preserves exempt entries
 *   4. Upsert records history
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import { searchMemory } from '../../src/core/memory-query.js';
import { exportSummaryMd, exportDecisionsMd } from '../../src/core/memory-export.js';
import { parseDecisionsMd } from '../../src/core/memory-import.js';

let store: MemoryStore;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'memv2-integ-'));
  const dbPath = join(tmpDir, 'integration.db');
  store = new MemoryStore(dbPath);
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Test 1: Full lifecycle ──────────────────────────────────────────

describe('full lifecycle: insert -> search -> export -> reimport -> verify', () => {
  it('roundtrips entries through all modules', () => {
    // 1. Insert 3 entries: 2 ADRs + 1 memory
    store.insert({
      id: 'ADR-006',
      type: 'adr',
      title: 'spawnSync Security Pattern',
      content:
        '**Decision:** All shell commands use spawnSync with args array.\n' +
        '**Context:** Command injection risk must be zero.\n' +
        '**Consequence:** Template literal or string concat for commands is banned.',
      source: 'system',
      tags: ['security', 'spawnSync', 'shell-injection'],
      status: 'accepted',
      sprint_num: 130,
      sprint_id: 'sprint-130',
      decay_exempt: true,
    });

    store.insert({
      id: 'ADR-008',
      type: 'adr',
      title: 'Brain Merkezi Import Kurali',
      content:
        '**Decision:** Brain projede diger modulleri import eden TEK moduldur.\n' +
        '**Context:** Circular imports ESM de tanimsiz davranisa yol acar.\n' +
        '**Consequence:** Worker ve auditor brain import etmez.',
      source: 'system',
      tags: ['brain', 'import', 'circular'],
      status: 'accepted',
      sprint_num: 131,
      sprint_id: 'sprint-131',
      lang: 'tr',
      decay_exempt: true,
    });

    store.insert({
      id: 'mem-139-docker',
      type: 'memory',
      title: 'Docker HB Core Fix',
      content:
        'atomicWriteFileSync + SIGTERM fsync handler + 15s grace period. ' +
        'Docker heartbeat daemon now writes reliably.',
      source: 'brain',
      tags: ['docker', 'heartbeat', 'atomicWrite'],
      sprint_id: 'sprint-139',
      sprint_num: 139,
    });

    // 2. Verify all 3 inserted
    expect(store.totalCount()).toBe(3);

    // 3. FTS search: 'docker heartbeat' -> finds memory entry
    const dockerResults = searchMemory(store, { text: 'docker heartbeat', limit: 10 });
    expect(dockerResults.length).toBeGreaterThanOrEqual(1);
    expect(dockerResults.some(r => r.entry.id === 'mem-139-docker')).toBe(true);

    // 4. Structured filter + text: type=adr, status=accepted, text='import' -> finds ADR-008
    const importResults = searchMemory(store, {
      text: 'import',
      type: ['adr'],
      status: ['accepted'],
      limit: 10,
    });
    expect(importResults.length).toBeGreaterThanOrEqual(1);
    expect(importResults.some(r => r.entry.id === 'ADR-008')).toBe(true);

    // 5. Export summary.md -> verify contains all entry IDs, is under 5000 chars
    const summaryMd = exportSummaryMd(store);
    expect(summaryMd.length).toBeLessThan(5000);
    expect(summaryMd).toContain('ADR-006');
    expect(summaryMd).toContain('ADR-008');
    expect(summaryMd).toContain('Docker HB Core Fix');

    // 6. Export decisions.md -> verify contains ADR titles
    const decisionsMd = exportDecisionsMd(store);
    expect(decisionsMd).toContain('spawnSync Security Pattern');
    expect(decisionsMd).toContain('Brain Merkezi Import Kurali');
    expect(decisionsMd).toContain('ADR-006');
    expect(decisionsMd).toContain('ADR-008');

    // 7. Reimport: parse the exported decisions.md into a SECOND fresh MemoryStore
    const reimported = parseDecisionsMd(decisionsMd);
    const dbPath2 = join(tmpDir, 'reimport.db');
    const store2 = new MemoryStore(dbPath2);
    try {
      for (const entry of reimported) {
        store2.insert(entry);
      }

      // 8. Verify roundtrip: reimported ADR count = original ADR count (2)
      const originalAdrCount = store.getByType('adr').length;
      const reimportedAdrCount = store2.getByType('adr').length;
      expect(reimportedAdrCount).toBe(originalAdrCount);
      expect(reimportedAdrCount).toBe(2);

      // Verify titles survived the roundtrip
      const reimportedAdrs = store2.getByType('adr');
      const titles = reimportedAdrs.map(a => a.title);
      expect(titles).toContain('spawnSync Security Pattern');
      expect(titles).toContain('Brain Merkezi Import Kurali');
    } finally {
      store2.close();
    }
  });
});

// ── Test 2: Turkish i18n ────────────────────────────────────────────

describe('Turkish i18n: IŞIK and ışık both find the same entry', () => {
  it('case-insensitive Turkish search with ASCII fallback', () => {
    // 1. Insert entry with Turkish title and content
    store.insert({
      id: 'tr-isik-001',
      type: 'error',
      title: 'IŞIK Sensörü Hatası',
      content: 'Işık sensörü düşük seviyede ışık algılamada hata veriyor. Çözüm için ışık eşiği ayarlanmalı.',
      source: 'worker',
      tags: ['sensor', 'isik'],
      lang: 'tr',
    });

    // 2. Search 'ışık' (lowercase Turkish) -> finds it
    const r1 = searchMemory(store, { text: 'ışık', limit: 10 });
    expect(r1.length).toBeGreaterThanOrEqual(1);
    const found1 = r1.find(r => r.entry.id === 'tr-isik-001');
    expect(found1).toBeDefined();

    // 3. Search 'IŞIK' (uppercase Turkish) -> finds it
    const r2 = searchMemory(store, { text: 'IŞIK', limit: 10 });
    expect(r2.length).toBeGreaterThanOrEqual(1);
    const found2 = r2.find(r => r.entry.id === 'tr-isik-001');
    expect(found2).toBeDefined();

    // 4. Search 'isik' (plain ASCII) -> finds it
    const r3 = searchMemory(store, { text: 'isik', limit: 10 });
    expect(r3.length).toBeGreaterThanOrEqual(1);
    const found3 = r3.find(r => r.entry.id === 'tr-isik-001');
    expect(found3).toBeDefined();

    // 5. All three return the same entry id
    expect(found1!.entry.id).toBe('tr-isik-001');
    expect(found2!.entry.id).toBe('tr-isik-001');
    expect(found3!.entry.id).toBe('tr-isik-001');
  });
});

// ── Test 3: Decay preserves exempt entries ──────────────────────────

describe('decay preserves exempt entries', () => {
  it('deletes old non-exempt, preserves exempt and recent', () => {
    // 1. Insert permanent identity (sprint 1, decay_exempt=true)
    store.insert({
      id: 'identity-001',
      type: 'identity',
      title: 'Project Identity',
      content: 'Deckent is an AI agent orchestration CLI.',
      source: 'system',
      sprint_num: 1,
      sprint_id: 'sprint-1',
      decay_exempt: true,
    });

    // 2. Insert old learning (sprint 100, NOT exempt)
    store.insert({
      id: 'mem-100-old',
      type: 'memory',
      title: 'Old Sprint Learning',
      content: 'Some old learning from sprint 100 that should be decayed.',
      source: 'brain',
      sprint_num: 100,
      sprint_id: 'sprint-100',
      decay_exempt: false,
    });

    // 3. Insert recent learning (sprint 139, NOT exempt)
    store.insert({
      id: 'mem-139-recent',
      type: 'memory',
      title: 'Recent Sprint Learning',
      content: 'A recent learning from sprint 139 that should survive.',
      source: 'brain',
      sprint_num: 139,
      sprint_id: 'sprint-139',
      decay_exempt: false,
    });

    expect(store.totalCount()).toBe(3);

    // 4. Run decay(139, 20) -> threshold = 119
    //    Entries with sprint_num < 119 AND decay_exempt=false get soft-deleted
    const result = store.decay(139, 20);

    // 5. Verify: old learning deleted, permanent and recent preserved
    expect(store.getById('identity-001')).not.toBeNull();   // exempt -> preserved
    expect(store.getById('mem-100-old')).toBeNull();         // sprint 100 < 119 -> decayed
    expect(store.getById('mem-139-recent')).not.toBeNull();  // sprint 139 >= 119 -> preserved

    // 6. Verify deletedCount = 1
    expect(result.deletedCount).toBe(1);

    // Bonus: verify the decayed entry still exists when includeDeleted=true
    const decayed = store.getById('mem-100-old', { includeDeleted: true });
    expect(decayed).not.toBeNull();
    expect(decayed!.deleted_at).not.toBeNull();
  });
});

// ── Test 4: Upsert records history ─────────────────────────────────

describe('upsert records history', () => {
  it('tracks field-level changes with changedBy', () => {
    // 1. Insert entry with title 'V1'
    store.insert({
      id: 'upsert-test-001',
      type: 'memory',
      title: 'V1',
      content: 'Original content for the upsert test.',
      source: 'brain',
      sprint_num: 140,
    });

    // Verify initial insert
    const v1 = store.getById('upsert-test-001');
    expect(v1).not.toBeNull();
    expect(v1!.title).toBe('V1');

    // 2. Upsert same id with title 'V2', changedBy='user'
    store.upsert(
      {
        id: 'upsert-test-001',
        type: 'memory',
        title: 'V2',
        content: 'Original content for the upsert test.',
        source: 'brain',
        sprint_num: 140,
      },
      'user',
    );

    // 3. Verify entry.title = 'V2'
    const v2 = store.getById('upsert-test-001');
    expect(v2).not.toBeNull();
    expect(v2!.title).toBe('V2');

    // 4. Verify history has record: field='title', old_value='V1', new_value='V2'
    const history = store.getHistory('upsert-test-001');

    // Should have at least 2 records: 1 create + 1 update(title)
    expect(history.length).toBeGreaterThanOrEqual(2);

    // Find the title change record
    const titleChange = history.find(
      h => h.field === 'title' && h.change_type === 'update',
    );
    expect(titleChange).toBeDefined();
    expect(titleChange!.old_value).toBe('V1');
    expect(titleChange!.new_value).toBe('V2');
    expect(titleChange!.changed_by).toBe('user');
  });
});
