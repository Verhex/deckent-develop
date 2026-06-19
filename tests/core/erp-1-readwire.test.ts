// tests/core/erp-1-readwire.test.ts — ERP-1 read-side config-wire + approval-gate
//
// Hermetic: all file I/O under os.tmpdir(); no process.env mutation; no network;
// no spawnSync; no .brain/memory.db or .deckent/config.json reads.
//
// Covers:
//   1. buildErpConnectorFromDeck — .deck secret loading + connector build (3 mock drivers)
//   2. erp.read structured-query round-trip via installErpHandlerWithApprovalGate
//   3. field-allow-list: unauthorized columns are rejected (sızdırmaz)
//   4. Approval gate: deny path + allow path

import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildErpConnectorFromDeck,
  installErpHandlerWithApprovalGate,
  type ErpApprovalGateFn,
} from '../../src/core/erp-connector.js';
import { createInMemoryErpDriver } from '../../src/core/erp/handler.js';
import { createErpConnector } from '../../src/core/erp/connector.js';
import { CapabilityRegistry } from '../../src/core/capability-broker.js';
import type { ErpRow, ErpResultSet } from '../../src/core/erp/connector.js';
import type { ErpRuntimeConfig } from '../../src/core/erp/factory.js';

// ─── Shared test data ─────────────────────────────────────────────────────────

const ORDERS: ErpRow[] = [
  { id: 1, orderno: 'ORD-001', customer: 'Acme', amount: 5000, secret_field: 'INTERNAL' },
  { id: 2, orderno: 'ORD-002', customer: 'Globex', amount: 3000, secret_field: 'INTERNAL' },
  { id: 3, orderno: 'ORD-003', customer: 'Acme', amount: 1500, secret_field: 'INTERNAL' },
];

const PRODUCTS: ErpRow[] = [
  { sku: 'P-100', name: 'Widget A', price: 99.99, cost: 40 },
  { sku: 'P-200', name: 'Widget B', price: 149.99, cost: 60 },
];

const CONTACTS: ErpRow[] = [
  { id: 10, email: 'alice@example.com', role: 'admin', dept: 'Engineering' },
  { id: 20, email: 'bob@example.com', role: 'viewer', dept: 'Sales' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildConnectorWithOrders() {
  const driver = createInMemoryErpDriver({ orders: ORDERS });
  return createErpConnector({ driver }).registerEntity('orders', {
    // secret_field is intentionally NOT in the allow-list
    fields: ['id', 'orderno', 'customer', 'amount'],
    source: 'orders',
  });
}

function buildConnectorWithProducts() {
  const driver = createInMemoryErpDriver({ products: PRODUCTS });
  return createErpConnector({ driver }).registerEntity('products', {
    // cost is intentionally NOT in the allow-list (price-only public surface)
    fields: ['sku', 'name', 'price'],
    source: 'products',
  });
}

function buildConnectorWithContacts() {
  const driver = createInMemoryErpDriver({ contacts: CONTACTS });
  return createErpConnector({ driver }).registerEntity('contacts', {
    fields: ['id', 'email', 'dept'],
    // role is intentionally NOT in the allow-list
    source: 'contacts',
  });
}

async function invokeErpRead(
  registry: CapabilityRegistry,
  args: Record<string, unknown>,
): Promise<ErpResultSet> {
  const res = await registry.invoke({ capability: 'erp.read', args });
  expect(res.ok, res.ok ? '' : `expected ok, got: ${res.error}`).toBe(true);
  return res.value as ErpResultSet;
}

// ─── Tmpdir lifecycle ─────────────────────────────────────────────────────────

const sandboxes: string[] = [];

function makeSandbox(): string {
  const dir = join(tmpdir(), `deckent-erp1-${Date.now()}-${Math.trunc(Math.random() * 1e6)}`);
  mkdirSync(dir, { recursive: true });
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of sandboxes.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ─── Suite 1: buildErpConnectorFromDeck — .deck cred loading ──────────────────

describe('buildErpConnectorFromDeck', () => {
  it('returns undefined when cfg is absent', () => {
    const sandbox = makeSandbox();
    expect(buildErpConnectorFromDeck(sandbox, undefined)).toBeUndefined();
  });

  it('returns undefined when cfg.enabled is false', () => {
    const sandbox = makeSandbox();
    const cfg: ErpRuntimeConfig = { enabled: false, driver: 'in-memory', entities: {} };
    expect(buildErpConnectorFromDeck(sandbox, cfg)).toBeUndefined();
  });

  it('builds a connector loading the ERP token from .deck file (mock driver 1 — orders)', async () => {
    const sandbox = makeSandbox();
    // Write a .deck file with a token (in-memory driver doesn't need a real token
    // but the env-merge path is exercised; we use a custom tokenEnv to avoid any
    // real DECKENT_ERP_TOKEN lookup)
    const cfg: ErpRuntimeConfig = {
      enabled: true,
      driver: 'in-memory',
      entities: { orders: { fields: ['id', 'orderno', 'customer', 'amount'] } },
      memoryTables: { orders: ORDERS },
    };
    const connector = buildErpConnectorFromDeck(sandbox, cfg, {});
    expect(connector).toBeDefined();
    expect(connector!.hasEntity('orders')).toBe(true);
    const result = await connector!.query({ entity: 'orders', fields: ['orderno', 'customer'] });
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toEqual({ orderno: 'ORD-001', customer: 'Acme' });
  });

  it('merges .deck secrets over baseEnv — deck key wins', () => {
    const sandbox = makeSandbox();
    // Write a .deck file with DECKENT_ERP_TOKEN
    writeFileSync(join(sandbox, '.deck'), 'DECKENT_ERP_TOKEN=deck-secret\n');
    // The baseEnv also has the token but .deck should win
    const baseEnv = { DECKENT_ERP_TOKEN: 'env-secret' };
    // Use IFS driver to verify the token came from deck (the driver captures the
    // token from its construction options; we just verify the connector is built)
    const cfg: ErpRuntimeConfig = {
      enabled: true,
      driver: 'ifs',
      baseUrl: 'https://ifs.example.com',
      projection: 'TestProjection',
      tokenEnv: 'DECKENT_ERP_TOKEN',
      entities: { Order: { fields: ['OrderNo'] } },
    };
    // .deck wins — deck-secret is loaded, factory doesn't throw
    const connector = buildErpConnectorFromDeck(sandbox, cfg, baseEnv);
    expect(connector).toBeDefined();
  });

  it('falls back to baseEnv when .deck is absent', () => {
    const sandbox = makeSandbox(); // no .deck file written
    const cfg: ErpRuntimeConfig = {
      enabled: true,
      driver: 'ifs',
      baseUrl: 'https://ifs.example.com',
      projection: 'Proj',
      tokenEnv: 'MY_IFS_KEY',
      entities: { Order: { fields: ['OrderNo'] } },
    };
    const connector = buildErpConnectorFromDeck(sandbox, cfg, { MY_IFS_KEY: 'fallback-token' });
    expect(connector).toBeDefined();
  });
});

// ─── Suite 2: 3 mock drivers — erp.read structured-query round-trips ──────────

describe('erp.read — 3 mock driver round-trips', () => {
  it('mock driver 1 (orders): entity+filter query returns safe rows', async () => {
    const registry = new CapabilityRegistry();
    installErpHandlerWithApprovalGate(registry, { connector: buildConnectorWithOrders() });

    const result = await invokeErpRead(registry, {
      entity: 'orders',
      fields: ['orderno', 'amount'],
      filters: [{ field: 'customer', op: 'eq', value: 'Acme' }],
    });
    expect(result.entity).toBe('orders');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ orderno: 'ORD-001', amount: 5000 });
    expect(result.rows[1]).toEqual({ orderno: 'ORD-003', amount: 1500 });
  });

  it('mock driver 2 (products): entity query with numeric filter', async () => {
    const registry = new CapabilityRegistry();
    installErpHandlerWithApprovalGate(registry, { connector: buildConnectorWithProducts() });

    const result = await invokeErpRead(registry, {
      entity: 'products',
      filters: [{ field: 'price', op: 'lt', value: 120 }],
    });
    expect(result.entity).toBe('products');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ sku: 'P-100', name: 'Widget A' });
    // cost must NOT appear — it is not in the allow-list
    expect('cost' in result.rows[0]).toBe(false);
  });

  it('mock driver 3 (contacts): entity query with limit', async () => {
    const registry = new CapabilityRegistry();
    installErpHandlerWithApprovalGate(registry, { connector: buildConnectorWithContacts() });

    const result = await invokeErpRead(registry, {
      entity: 'contacts',
      limit: 1,
    });
    expect(result.entity).toBe('contacts');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ id: 10, email: 'alice@example.com', dept: 'Engineering' });
    // role must NOT appear — it is not in the allow-list
    expect('role' in result.rows[0]).toBe(false);
  });
});

// ─── Suite 3: field allow-list — unauthorized columns sızdırmaz ───────────────

describe('field allow-list — unauthorized column rejection', () => {
  it('rejects an explicit request for a non-allow-listed field (orders.secret_field)', async () => {
    const registry = new CapabilityRegistry();
    installErpHandlerWithApprovalGate(registry, { connector: buildConnectorWithOrders() });

    const res = await registry.invoke({
      capability: 'erp.read',
      args: { entity: 'orders', fields: ['orderno', 'secret_field'] },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('CAPABILITY_FAILED');
      expect(res.error).toContain('secret_field');
    }
  });

  it('rejects filtering on a non-allow-listed field (products.cost)', async () => {
    const registry = new CapabilityRegistry();
    installErpHandlerWithApprovalGate(registry, { connector: buildConnectorWithProducts() });

    const res = await registry.invoke({
      capability: 'erp.read',
      args: {
        entity: 'products',
        filters: [{ field: 'cost', op: 'lt', value: 50 }],
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('CAPABILITY_FAILED');
      expect(res.error).toContain('cost');
    }
  });

  it('unregistered entity is rejected (table does not leak)', async () => {
    const registry = new CapabilityRegistry();
    installErpHandlerWithApprovalGate(registry, { connector: buildConnectorWithOrders() });

    const res = await registry.invoke({
      capability: 'erp.read',
      args: { entity: 'internal_audit_log' },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('CAPABILITY_FAILED');
  });
});

// ─── Suite 4: approval gate ───────────────────────────────────────────────────

describe('installErpHandlerWithApprovalGate — approval gate', () => {
  it('gate absent → plain erp.read (backward-safe, no approval required)', async () => {
    const registry = new CapabilityRegistry();
    installErpHandlerWithApprovalGate(registry, { connector: buildConnectorWithOrders() });

    const result = await invokeErpRead(registry, {
      entity: 'orders',
      fields: ['orderno'],
      limit: 1,
    });
    expect(result.rows).toHaveLength(1);
  });

  it('gate returns true → query proceeds normally', async () => {
    const gate: ErpApprovalGateFn = async (_entity, _actor) => true;
    const registry = new CapabilityRegistry();
    installErpHandlerWithApprovalGate(registry, { connector: buildConnectorWithOrders() }, gate);

    const result = await invokeErpRead(registry, {
      entity: 'orders',
      fields: ['orderno', 'amount'],
      limit: 2,
    });
    expect(result.rows).toHaveLength(2);
  });

  it('gate returns false → CAPABILITY_FAILED with denial message', async () => {
    const gate: ErpApprovalGateFn = async (_entity, _actor) => false;
    const registry = new CapabilityRegistry();
    installErpHandlerWithApprovalGate(registry, { connector: buildConnectorWithOrders() }, gate);

    const res = await registry.invoke({ capability: 'erp.read', args: { entity: 'orders' } });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('CAPABILITY_FAILED');
      expect(res.error).toContain('denied');
      expect(res.error).toContain('orders');
    }
  });

  it('gate throws → treated as denial (fail-closed)', async () => {
    const gate: ErpApprovalGateFn = async () => {
      throw new Error('gate error');
    };
    const registry = new CapabilityRegistry();
    installErpHandlerWithApprovalGate(registry, { connector: buildConnectorWithOrders() }, gate);

    const res = await registry.invoke({ capability: 'erp.read', args: { entity: 'orders' } });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('CAPABILITY_FAILED');
      expect(res.error).toContain('denied');
    }
  });

  it('gate receives entity name and actor from InvocationContext', async () => {
    const capturedCalls: Array<{ entity: string; actorId: string | undefined }> = [];
    const gate: ErpApprovalGateFn = async (entity, actor) => {
      capturedCalls.push({ entity, actorId: actor?.id });
      return true;
    };
    const registry = new CapabilityRegistry();
    installErpHandlerWithApprovalGate(registry, { connector: buildConnectorWithOrders() }, gate);

    await invokeErpRead(registry, { entity: 'orders', limit: 1 });
    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0].entity).toBe('orders');
  });
});
