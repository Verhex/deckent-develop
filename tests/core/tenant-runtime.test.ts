import { describe, it, expect } from 'vitest';
import {
  withTenant,
  currentTenant,
  tenantPath,
} from '../../src/core/tenant-context.js';

const ROOT = '/project';

describe('withTenant', () => {
  it('inner fn sees the correct tenantId', () => {
    let seen = '';
    withTenant('acme', ROOT, () => {
      seen = currentTenant(ROOT).tenantId;
    });
    expect(seen).toBe('acme');
  });

  it('after scope exits, tenantId is no longer set in ALS', () => {
    withTenant('temp-tenant', ROOT, () => {/* noop */});
    // Outside the scope, falls back to 'local'
    const ctx = currentTenant(ROOT);
    expect(ctx.tenantId).toBe('local');
  });

  it('nested withTenant overrides the outer tenant', () => {
    const results: string[] = [];
    withTenant('outer', ROOT, () => {
      results.push(currentTenant(ROOT).tenantId);
      withTenant('inner', ROOT, () => {
        results.push(currentTenant(ROOT).tenantId);
      });
      results.push(currentTenant(ROOT).tenantId);
    });
    expect(results).toEqual(['outer', 'inner', 'outer']);
  });

  it('throws on invalid tenantId', () => {
    expect(() => withTenant('../evil', ROOT, () => undefined)).toThrow(/Invalid tenantId/);
  });
});

describe('currentTenant', () => {
  it('returns local tenant by default (outside withTenant)', () => {
    const ctx = currentTenant(ROOT);
    expect(ctx.tenantId).toBe('local');
    expect(ctx.isolationRoot).toBe('/project/.deckent/tenants/local');
  });

  it('returns active tenant inside withTenant scope', () => {
    let ctx!: ReturnType<typeof currentTenant>;
    withTenant('my-org', ROOT, () => {
      ctx = currentTenant(ROOT);
    });
    expect(ctx.tenantId).toBe('my-org');
    expect(ctx.isolationRoot).toBe('/project/.deckent/tenants/my-org');
  });
});

describe('tenantPath', () => {
  it('resolves relative path under current tenant isolation root', () => {
    let resolved = '';
    withTenant('acme', ROOT, () => {
      resolved = tenantPath('flows/my-flow.json', ROOT);
    });
    expect(resolved).toBe('/project/.deckent/tenants/acme/flows/my-flow.json');
  });

  it('defaults to local tenant when called outside withTenant scope', () => {
    const p = tenantPath('config.json', ROOT);
    expect(p).toBe('/project/.deckent/tenants/local/config.json');
  });
});
