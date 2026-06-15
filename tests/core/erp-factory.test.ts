// tests/core/erp-factory.test.ts
//
// buildErpConnectorFromConfig — the config → driver → connector binding.
// Hermetic: env is passed in (never reads the real process.env); the in-memory
// driver path needs no network. Vendor-driver paths assert construction +
// secret-from-env, not the wire (the driver tests own that).

import { describe, it, expect } from 'vitest';
import {
  buildErpConnectorFromConfig,
  type ErpRuntimeConfig,
} from '../../src/core/erp/factory.js';

const ENTITIES = { CustomerOrder: { fields: ['OrderNo', 'CustomerNo'], source: 'orders' } };

function cfg(overrides: Partial<ErpRuntimeConfig> = {}): ErpRuntimeConfig {
  return { enabled: true, driver: 'in-memory', entities: ENTITIES, ...overrides };
}

describe('buildErpConnectorFromConfig — opt-in / backward-safe', () => {
  it('returns undefined when config is absent', () => {
    expect(buildErpConnectorFromConfig(undefined, {})).toBeUndefined();
  });

  it('returns undefined when enabled is falsy (no erp.read handler installed)', () => {
    expect(buildErpConnectorFromConfig(cfg({ enabled: false }), {})).toBeUndefined();
  });
});

describe('buildErpConnectorFromConfig — in-memory round-trip', () => {
  it('builds a connector with the entity allow-list and queries through the driver', async () => {
    const connector = buildErpConnectorFromConfig(
      cfg({ memoryTables: { orders: [{ OrderNo: 'CO-1', CustomerNo: 'C-1' }, { OrderNo: 'CO-2', CustomerNo: 'C-2' }] } }),
      {},
    );
    expect(connector).toBeDefined();
    expect(connector!.hasEntity('CustomerOrder')).toBe(true);

    const result = await connector!.query({
      entity: 'CustomerOrder',
      fields: ['OrderNo'],
      filters: [{ field: 'CustomerNo', op: 'eq', value: 'C-1' }],
    });
    expect(result.rows).toEqual([{ OrderNo: 'CO-1' }]);
  });

  it('enforces the allow-list — an unregistered entity is rejected', async () => {
    const connector = buildErpConnectorFromConfig(cfg({ memoryTables: { orders: [] } }), {})!;
    await expect(connector.query({ entity: 'SecretTable' })).rejects.toThrow();
  });
});

describe('buildErpConnectorFromConfig — vendor drivers + secret hygiene', () => {
  it('builds an IFS connector, reading the token from the named env var', () => {
    const connector = buildErpConnectorFromConfig(
      cfg({ driver: 'ifs', baseUrl: 'https://ifs.example.com', projection: 'CustomerOrdersHandling', tokenEnv: 'MY_IFS_TOKEN' }),
      { MY_IFS_TOKEN: 'secret-123' },
    );
    expect(connector).toBeDefined();
    expect(connector!.hasEntity('CustomerOrder')).toBe(true);
  });

  it('defaults the secret env var to DECKENT_ERP_TOKEN', () => {
    expect(() =>
      buildErpConnectorFromConfig(
        cfg({ driver: 'dynamics', baseUrl: 'https://org.crm.dynamics.com' }),
        { DECKENT_ERP_TOKEN: 'tok' },
      ),
    ).not.toThrow();
  });

  it('builds an Odoo connector from url/db/uid + api key env', () => {
    const connector = buildErpConnectorFromConfig(
      cfg({ driver: 'odoo', url: 'https://erp.example.com/jsonrpc', db: 'prod', uid: 7 }),
      { DECKENT_ERP_TOKEN: 'odoo-key' },
    );
    expect(connector).toBeDefined();
  });

  it('builds a SAP basic-auth connector (username in config, password in env)', () => {
    const connector = buildErpConnectorFromConfig(
      cfg({ driver: 'sap', baseUrl: 'https://sap.example.com/odata', authKind: 'basic', username: 'svc' }),
      { DECKENT_ERP_TOKEN: 'pw' },
    );
    expect(connector).toBeDefined();
  });
});

describe('buildErpConnectorFromConfig — fail-loud misconfiguration', () => {
  it('throws when a network driver is enabled but the credential env var is missing', () => {
    expect(() =>
      buildErpConnectorFromConfig(cfg({ driver: 'ifs', baseUrl: 'https://x', projection: 'P' }), {}),
    ).toThrow(/DECKENT_ERP_TOKEN|credential/i);
  });

  it('throws when a required connection field is missing', () => {
    expect(() =>
      buildErpConnectorFromConfig(cfg({ driver: 'ifs', projection: 'P' }), { DECKENT_ERP_TOKEN: 't' }),
    ).toThrow(/baseUrl/i);
  });

  it('throws when no entities are declared (empty allow-list)', () => {
    expect(() =>
      buildErpConnectorFromConfig(cfg({ entities: {} }), {}),
    ).toThrow(/entity/i);
  });
});
