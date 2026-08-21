import { describe, expect, it } from 'vitest';

import {
  ConfigValidationError,
  createDefaultConfig,
  mergeConfigs,
  resolveApprovalConfig,
  validateConfig,
} from '../../src/core/config.js';

describe('approval lifecycle config resolver', () => {
  it('resolves the gate off and all four canonical profiles exactly', () => {
    const lifecycle = resolveApprovalConfig({}).lifecycle;
    expect(lifecycle).toEqual({
      enabled: false,
      profiles: {
        confirmation: {
          ttlMs: 28_800_000,
          slaMs: [300_000, 1_800_000, 7_200_000],
          riskTier: 'elevated',
          timeoutDisposition: 'park-undecidable',
          blocking: 'run',
        },
        'autonomous-trigger': {
          ttlMs: 3_600_000,
          slaMs: [120_000, 600_000, 1_800_000],
          riskTier: 'elevated',
          timeoutDisposition: 'park-alert',
          blocking: 'trigger',
        },
        'gateway-pairing': {
          ttlMs: 600_000,
          slaMs: [60_000, 180_000, 420_000],
          riskTier: 'critical',
          timeoutDisposition: 'deny-expire',
          blocking: 'security',
        },
        'broker-native': {
          ttlMs: 1_800_000,
          slaMs: [120_000, 600_000, 1_200_000],
          riskTier: 'routine',
          timeoutDisposition: 'request-default',
          blocking: 'request',
        },
      },
    });
  });

  it('accepts only monotonic tightening', () => {
    const resolved = resolveApprovalConfig({
      approval: {
        lifecycle: {
          enabled: true,
          profiles: {
            'broker-native': {
              ttlMs: 900_000,
              slaMs: [60_000, 300_000, 600_000],
              riskTier: 'critical',
              timeoutDisposition: 'deny-expire',
              blocking: 'security',
            },
          },
        },
      },
    });
    expect(resolved.lifecycle.enabled).toBe(true);
    expect(resolved.lifecycle.profiles['broker-native']).toMatchObject({
      ttlMs: 900_000,
      riskTier: 'critical',
      timeoutDisposition: 'deny-expire',
      blocking: 'security',
    });
  });

  it('rejects lengthening, delayed/non-monotonic SLA and risk/blocking weakening', () => {
    const invalidProfiles = [
      { confirmation: { ttlMs: 28_800_001 } },
      { confirmation: { slaMs: [300_001, 1_800_000, 7_200_000] } },
      { confirmation: { slaMs: [300_000, 300_000, 600_000] } },
      { confirmation: { riskTier: 'routine' } },
      { confirmation: { timeoutDisposition: 'request-default' } },
      { confirmation: { blocking: 'request' } },
    ];
    for (const profiles of invalidProfiles) {
      const config = createDefaultConfig();
      config.approval = { lifecycle: { profiles: profiles as never } };
      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    }
  });

  it('rejects a project layer that weakens a tighter global layer', () => {
    expect(() => mergeConfigs(
      {
        approval: { lifecycle: { profiles: {
          confirmation: { ttlMs: 1_200_000, slaMs: [60_000, 300_000, 600_000] },
        } } },
      },
      {
        approval: { lifecycle: { profiles: {
          confirmation: { ttlMs: 1_500_000, slaMs: [60_000, 300_000, 600_000] },
        } } },
      },
    )).toThrow(ConfigValidationError);
  });
});
