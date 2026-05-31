import { describe, it, expect } from 'vitest';
import {
  parseEnterpriseConfig,
  mergeEnterpriseConfig,
  ENTERPRISE_CONFIG_DEFAULTS,
} from '../../src/core/enterprise-config.js';

describe('parseEnterpriseConfig', () => {
  it('returns safe opt-in defaults when called with undefined', () => {
    const cfg = parseEnterpriseConfig(undefined);
    expect(cfg.tenancy.enabled).toBe(false);
    expect(cfg.rbac.enabled).toBe(false);
    expect(cfg.rbac.defaultRole).toBe('viewer');
    expect(cfg.flow.maxConcurrent).toBeGreaterThanOrEqual(1);
  });

  it('returns safe opt-in defaults when called with null', () => {
    const cfg = parseEnterpriseConfig(null);
    expect(cfg.tenancy.enabled).toBe(false);
    expect(cfg.rbac.enabled).toBe(false);
  });

  it('parses a fully-specified valid config', () => {
    const cfg = parseEnterpriseConfig({
      tenancy: { enabled: true },
      rbac: { enabled: true, defaultRole: 'operator' },
      flow: { maxConcurrent: 5 },
    });
    expect(cfg.tenancy.enabled).toBe(true);
    expect(cfg.rbac.enabled).toBe(true);
    expect(cfg.rbac.defaultRole).toBe('operator');
    expect(cfg.flow.maxConcurrent).toBe(5);
  });

  it('parses partial config with missing sections using defaults', () => {
    const cfg = parseEnterpriseConfig({ rbac: { enabled: true, defaultRole: 'admin' } });
    expect(cfg.rbac.enabled).toBe(true);
    expect(cfg.rbac.defaultRole).toBe('admin');
    expect(cfg.tenancy.enabled).toBe(false);
    expect(cfg.flow.maxConcurrent).toBe(ENTERPRISE_CONFIG_DEFAULTS.flow.maxConcurrent);
  });

  it('throws on invalid rbac.defaultRole', () => {
    expect(() =>
      parseEnterpriseConfig({ rbac: { enabled: false, defaultRole: 'superadmin' } }),
    ).toThrow(/rbac\.defaultRole/);
  });

  it('throws on negative flow.maxConcurrent', () => {
    expect(() =>
      parseEnterpriseConfig({ flow: { maxConcurrent: -1 } }),
    ).toThrow(/flow\.maxConcurrent/);
  });

  it('throws on zero flow.maxConcurrent', () => {
    expect(() =>
      parseEnterpriseConfig({ flow: { maxConcurrent: 0 } }),
    ).toThrow(/flow\.maxConcurrent/);
  });

  it('throws on non-object top-level value', () => {
    expect(() => parseEnterpriseConfig('bad')).toThrow(/must be an object/);
    expect(() => parseEnterpriseConfig([1, 2])).toThrow(/must be an object/);
  });

  it('throws on non-boolean tenancy.enabled', () => {
    expect(() =>
      parseEnterpriseConfig({ tenancy: { enabled: 'yes' } }),
    ).toThrow(/tenancy\.enabled/);
  });
});

describe('mergeEnterpriseConfig', () => {
  it('merges only the specified override fields', () => {
    const base = parseEnterpriseConfig(undefined);
    const merged = mergeEnterpriseConfig(base, { tenancy: { enabled: true } });
    expect(merged.tenancy.enabled).toBe(true);
    expect(merged.rbac.enabled).toBe(false);
    expect(merged.flow.maxConcurrent).toBe(base.flow.maxConcurrent);
  });

  it('full override replaces all fields', () => {
    const base = parseEnterpriseConfig(undefined);
    const merged = mergeEnterpriseConfig(base, {
      tenancy: { enabled: true },
      rbac: { enabled: true, defaultRole: 'admin' },
      flow: { maxConcurrent: 10 },
    });
    expect(merged.tenancy.enabled).toBe(true);
    expect(merged.rbac.defaultRole).toBe('admin');
    expect(merged.flow.maxConcurrent).toBe(10);
  });

  it('empty override returns base unchanged', () => {
    const base = parseEnterpriseConfig(undefined);
    const merged = mergeEnterpriseConfig(base, {});
    expect(merged).toEqual(base);
  });

  it('does not mutate the base config', () => {
    const base = parseEnterpriseConfig(undefined);
    mergeEnterpriseConfig(base, { tenancy: { enabled: true } });
    expect(base.tenancy.enabled).toBe(false);
  });
});

describe('ENTERPRISE_CONFIG_DEFAULTS', () => {
  it('all enterprise features are disabled by default (opt-in)', () => {
    expect(ENTERPRISE_CONFIG_DEFAULTS.tenancy.enabled).toBe(false);
    expect(ENTERPRISE_CONFIG_DEFAULTS.rbac.enabled).toBe(false);
  });

  it('defaultRole is the least-privileged role', () => {
    expect(ENTERPRISE_CONFIG_DEFAULTS.rbac.defaultRole).toBe('viewer');
  });
});
