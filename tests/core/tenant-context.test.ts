import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveTenant,
  tenantIsolationPath,
  isValidTenantId,
} from '../../src/core/tenant-context.js';

const ROOT = '/project';

describe('isValidTenantId', () => {
  it('accepts simple alphanumeric id', () => {
    expect(isValidTenantId('local')).toBe(true);
  });

  it('accepts id with hyphens', () => {
    expect(isValidTenantId('my-tenant-01')).toBe(true);
  });

  it('rejects id with path traversal', () => {
    expect(isValidTenantId('../evil')).toBe(false);
  });

  it('rejects id with uppercase letters', () => {
    expect(isValidTenantId('UPPER')).toBe(false);
  });

  it('rejects id with slashes', () => {
    expect(isValidTenantId('a/b')).toBe(false);
  });
});

describe('tenantIsolationPath', () => {
  it('builds correct isolation path for default local tenant', () => {
    const p = tenantIsolationPath(ROOT, 'local');
    expect(p).toBe('/project/.deckent/tenants/local');
  });

  it('builds correct isolation path for custom tenant', () => {
    const p = tenantIsolationPath(ROOT, 'acme-corp');
    expect(p).toBe('/project/.deckent/tenants/acme-corp');
  });

  it('throws on invalid tenantId', () => {
    expect(() => tenantIsolationPath(ROOT, '../bad')).toThrow(/Invalid tenantId/);
  });
});

describe('resolveTenant', () => {
  const ORIG_ENV = process.env['DECKENT_TENANT_ID'];

  beforeEach(() => {
    delete process.env['DECKENT_TENANT_ID'];
  });

  afterEach(() => {
    if (ORIG_ENV === undefined) {
      delete process.env['DECKENT_TENANT_ID'];
    } else {
      process.env['DECKENT_TENANT_ID'] = ORIG_ENV;
    }
  });

  it('returns local tenant by default', () => {
    const ctx = resolveTenant(ROOT);
    expect(ctx.tenantId).toBe('local');
    expect(ctx.isolationRoot).toBe('/project/.deckent/tenants/local');
    expect(ctx.createdAt).toBeTruthy();
  });

  it('reads tenantId from opts', () => {
    const ctx = resolveTenant(ROOT, { tenantId: 'custom-01' });
    expect(ctx.tenantId).toBe('custom-01');
    expect(ctx.isolationRoot).toBe('/project/.deckent/tenants/custom-01');
  });

  it('reads tenantId from DECKENT_TENANT_ID env var', () => {
    process.env['DECKENT_TENANT_ID'] = 'env-tenant';
    const ctx = resolveTenant(ROOT);
    expect(ctx.tenantId).toBe('env-tenant');
  });

  it('opts tenantId takes priority over env var', () => {
    process.env['DECKENT_TENANT_ID'] = 'env-tenant';
    const ctx = resolveTenant(ROOT, { tenantId: 'override' });
    expect(ctx.tenantId).toBe('override');
  });

  it('throws on invalid tenantId from opts', () => {
    expect(() => resolveTenant(ROOT, { tenantId: 'BAD_ID' })).toThrow(/Invalid tenantId/);
  });

  it('createdAt is a valid ISO 8601 string', () => {
    const ctx = resolveTenant(ROOT);
    expect(() => new Date(ctx.createdAt)).not.toThrow();
    expect(new Date(ctx.createdAt).toISOString()).toBe(ctx.createdAt);
  });
});
