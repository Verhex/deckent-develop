// ─── Memory-store tenant isolation — fail-closed default (born-563, P1) ────────
// MemoryStore's tenant-aware read methods (getById/getByType/getByTags) used to
// default to a PERMISSIVE tenant clause when an explicit tenantId was supplied:
// `(tenant_id = ? OR tenant_id IS NULL)` — meaning any NULL-tenant row matched
// EVERY tenant's query, a cross-tenant leak surface. This suite locks in the new
// fail-closed default: strictTenantIsolation defaults to true, so a NULL-tenant
// row no longer matches any explicit-tenantId query unless the caller opts back
// into the legacy permissive mode via `{ strictTenantIsolation: false }`.
//
// Hermetic: every fixture lives under os.tmpdir(); no project/HOME state is read.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import type { CreateEntryInput } from '../../src/core/memory-types.js';

let store: MemoryStore;
let tmpDir: string;

function makeInput(overrides: Partial<CreateEntryInput> = {}): CreateEntryInput {
  return {
    id: overrides.id ?? 'test-001',
    type: overrides.type ?? 'memory',
    title: overrides.title ?? 'Test Entry',
    content: overrides.content ?? 'Some content about testing',
    source: overrides.source ?? 'brain',
    tags: overrides.tags ?? [],
    tenant_id: overrides.tenant_id,
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'memstore-tenant-iso-'));
  store = new MemoryStore(join(tmpDir, 'test.db')); // default opts — no strictTenantIsolation override
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('tenant isolation is fail-closed by default (born-563)', () => {
  it('tenant-A insert + tenant-B query via getById → A row invisible', () => {
    store.insert(makeInput({ id: 'entry-a', tenant_id: 'tenant-A' }));
    expect(store.getById('entry-a', { tenantId: 'tenant-B' })).toBeNull();
    expect(store.getById('entry-a', { tenantId: 'tenant-A' })?.id).toBe('entry-a');
  });

  it('tenant-A insert + tenant-B query via getByType → A row invisible', () => {
    store.insert(makeInput({ id: 'entry-a', type: 'adr', tenant_id: 'tenant-A' }));
    store.insert(makeInput({ id: 'entry-b', type: 'adr', tenant_id: 'tenant-B' }));
    const bView = store.getByType('adr', 'tenant-B');
    expect(bView.map(e => e.id)).not.toContain('entry-a');
    expect(bView.map(e => e.id)).toContain('entry-b');
  });

  it('tenant-A insert + tenant-B query via getByTags → A row invisible', () => {
    store.insert(makeInput({ id: 'entry-a', tags: ['shared'], tenant_id: 'tenant-A' }));
    store.insert(makeInput({ id: 'entry-b', tags: ['shared'], tenant_id: 'tenant-B' }));
    const bView = store.getByTags(['shared'], 'tenant-B');
    expect(bView.map(e => e.id)).not.toContain('entry-a');
    expect(bView.map(e => e.id)).toContain('entry-b');
  });

  it('NULL-tenant row does not match an explicit-tenantId getById query', () => {
    store.insert(makeInput({ id: 'entry-null' })); // no tenant_id → NULL
    expect(store.getById('entry-null', { tenantId: 'tenant-A' })).toBeNull();
    expect(store.getById('entry-null', { tenantId: 'tenant-B' })).toBeNull();
  });

  it('NULL-tenant row does not match an explicit-tenantId getByType query', () => {
    store.insert(makeInput({ id: 'entry-null', type: 'debt' })); // NULL tenant
    store.insert(makeInput({ id: 'entry-a', type: 'debt', tenant_id: 'tenant-A' }));
    const aView = store.getByType('debt', 'tenant-A');
    expect(aView.map(e => e.id)).not.toContain('entry-null');
    expect(aView.map(e => e.id)).toContain('entry-a');
  });

  it('NULL-tenant row does not match an explicit-tenantId getByTags query', () => {
    store.insert(makeInput({ id: 'entry-null', tags: ['multi'] })); // NULL tenant
    store.insert(makeInput({ id: 'entry-a', tags: ['multi'], tenant_id: 'tenant-A' }));
    const aView = store.getByTags(['multi'], 'tenant-A');
    expect(aView.map(e => e.id)).not.toContain('entry-null');
    expect(aView.map(e => e.id)).toContain('entry-a');
  });

  it('a NULL-tenant row never surfaces across ANY explicit tenant query (no all-tenant leak)', () => {
    store.insert(makeInput({ id: 'entry-null', type: 'memory' })); // NULL tenant
    for (const tenantId of ['tenant-A', 'tenant-B', 'tenant-C']) {
      const view = store.getByType('memory', tenantId);
      expect(view.map(e => e.id)).not.toContain('entry-null');
    }
  });

  it('existing single-tenant path is preserved: no-tenantId query is unaffected by the new default', () => {
    store.insert(makeInput({ id: 'entry-null', type: 'adr' })); // NULL tenant
    store.insert(makeInput({ id: 'entry-a', type: 'adr', tenant_id: 'tenant-A' }));
    store.insert(makeInput({ id: 'entry-b', type: 'adr', tenant_id: 'tenant-B' }));
    // No tenantId passed at all → no tenant clause applied, regardless of default.
    const all = store.getByType('adr');
    expect(all.map(e => e.id)).toEqual(
      expect.arrayContaining(['entry-null', 'entry-a', 'entry-b']),
    );
    expect(all).toHaveLength(3);
  });

  it('explicit opt-out (strictTenantIsolation: false) restores the legacy permissive NULL-fallback', () => {
    const permissiveTmp = mkdtempSync(join(tmpdir(), 'memstore-tenant-iso-permissive-'));
    const permissiveStore = new MemoryStore(join(permissiveTmp, 'test.db'), {
      strictTenantIsolation: false,
    });
    try {
      permissiveStore.insert(makeInput({ id: 'entry-null', type: 'adr' })); // NULL tenant
      permissiveStore.insert(makeInput({ id: 'entry-a', type: 'adr', tenant_id: 'tenant-A' }));
      const aView = permissiveStore.getByType('adr', 'tenant-A');
      expect(aView.map(e => e.id)).toContain('entry-null'); // deliberate opt-in leak
      expect(aView.map(e => e.id)).toContain('entry-a');
    } finally {
      permissiveStore.close();
      rmSync(permissiveTmp, { recursive: true, force: true });
    }
  });
});
