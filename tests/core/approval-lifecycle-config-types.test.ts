import { describe, expect, it } from 'vitest';

import {
  APPROVAL_LIFECYCLE_BLOCKING_SCOPES,
  APPROVAL_LIFECYCLE_ORIGINS,
  APPROVAL_LIFECYCLE_SLA_STAGES,
  APPROVAL_RISK_TIERS,
  APPROVAL_TIMEOUT_DISPOSITIONS,
  type ApprovalConfig,
  type ResolvedApprovalLifecycleConfig,
} from '../../src/core/config-types.js';

describe('approval lifecycle config types', () => {
  it('pins the closed origin and policy vocabularies', () => {
    expect(APPROVAL_LIFECYCLE_ORIGINS).toEqual([
      'confirmation',
      'autonomous-trigger',
      'gateway-pairing',
      'broker-native',
    ]);
    expect(APPROVAL_RISK_TIERS).toEqual(['routine', 'elevated', 'critical']);
    expect(APPROVAL_TIMEOUT_DISPOSITIONS).toEqual([
      'request-default',
      'park-alert',
      'park-undecidable',
      'deny-expire',
    ]);
    expect(APPROVAL_LIFECYCLE_BLOCKING_SCOPES).toEqual(['request', 'trigger', 'run', 'security']);
    expect(APPROVAL_LIFECYCLE_SLA_STAGES).toEqual([
      'initial',
      'renotify',
      'alternate-channel',
      'park-alert',
      'expired',
    ]);
  });

  it('supports partial authored profiles and a complete resolved snapshot', () => {
    const raw = {
      lifecycle: {
        enabled: true,
        profiles: {
          confirmation: { ttlMs: 7_200_000, riskTier: 'critical' },
        },
      },
    } satisfies ApprovalConfig;
    expect(raw.lifecycle.profiles.confirmation.ttlMs).toBe(7_200_000);

    const resolved = {
      enabled: false,
      profiles: Object.fromEntries(APPROVAL_LIFECYCLE_ORIGINS.map((origin) => [origin, {
        ttlMs: 60_000,
        slaMs: [10_000, 20_000, 30_000],
        riskTier: 'critical',
        timeoutDisposition: 'deny-expire',
        blocking: 'security',
      }])),
    } as ResolvedApprovalLifecycleConfig;
    expect(Object.keys(resolved.profiles)).toEqual([...APPROVAL_LIFECYCLE_ORIGINS]);
  });
});
