import { describe, expect, it } from 'vitest';

import {
  ApprovalLifecyclePolicyError,
  applyApprovalLifecycleProfileTransition,
  approvalLifecyclePolicyDigest,
  mapLegacyApprovalRisk,
  maxApprovalRiskTier,
  resolveApprovalLifecyclePolicy,
  resolveApprovalTimeout,
  resolveEffectiveApprovalExpiry,
  resolveEffectiveApprovalRiskTier,
  tightenApprovalLifecycleProfile,
  tightenApprovalLifecyclePolicy,
} from '../../src/core/approval-lifecycle-policy.js';

describe('approval lifecycle policy authority', () => {
  it('maps legacy risk once and applies origin floors/sensitive promotion', () => {
    expect(['none', 'low'].map(mapLegacyApprovalRisk)).toEqual(['routine', 'routine']);
    expect(['medium', 'high'].map(mapLegacyApprovalRisk)).toEqual(['elevated', 'elevated']);
    expect(mapLegacyApprovalRisk('critical')).toBe('critical');
    expect(maxApprovalRiskTier('routine', 'critical', 'elevated')).toBe('critical');
    expect(resolveEffectiveApprovalRiskTier({
      origin: 'confirmation', producerRisk: 'none',
    })).toBe('elevated');
    expect(resolveEffectiveApprovalRiskTier({
      origin: 'confirmation', producerRisk: 'low', securitySensitive: true,
    })).toBe('critical');
    expect(resolveEffectiveApprovalRiskTier({
      origin: 'autonomous-trigger', producerRisk: 'low', destructive: true,
    })).toBe('critical');
    expect(resolveEffectiveApprovalRiskTier({
      origin: 'gateway-pairing', producerRisk: 'none',
    })).toBe('critical');
  });

  it('uses the injected clock and caps producer expiry without resetting createdAt', () => {
    const profile = resolveApprovalLifecyclePolicy().profiles['broker-native'];
    const result = resolveEffectiveApprovalExpiry({
      createdAt: '2026-08-21T00:00:00.000Z',
      producerExpiresAt: '2026-08-21T02:00:00.000Z',
      profile,
      clock: () => new Date('2026-08-21T00:29:59.000Z'),
    });
    expect(result).toEqual({
      now: '2026-08-21T00:29:59.000Z',
      expiresAt: '2026-08-21T00:30:00.000Z',
      expired: false,
      producerExpiryCapped: true,
    });
  });

  it('resolves exact origin timeout safety and never trusts defaultAction alone', () => {
    const policy = resolveApprovalLifecyclePolicy();
    expect(resolveApprovalTimeout({
      origin: 'confirmation',
      profile: policy.profiles.confirmation, riskTier: 'elevated',
    })).toMatchObject({ action: 'park', terminalState: 'UNDECIDABLE', replayAllowed: false });
    expect(resolveApprovalTimeout({
      origin: 'autonomous-trigger',
      profile: policy.profiles['autonomous-trigger'], riskTier: 'elevated',
    })).toMatchObject({ action: 'park', terminalState: 'EXPIRED', alert: true, replayAllowed: false });
    expect(resolveApprovalTimeout({
      origin: 'gateway-pairing',
      profile: policy.profiles['gateway-pairing'], riskTier: 'critical',
    })).toMatchObject({ action: 'deny', accessGrantAllowed: false });
    expect(resolveApprovalTimeout({
      origin: 'broker-native',
      profile: policy.profiles['broker-native'],
      riskTier: 'routine',
      requestDefaultAction: 'allow',
      requestKind: 'not-reviewed',
    })).toMatchObject({ action: 'deny', reason: 'request-default-not-allowlisted' });
    expect(resolveApprovalTimeout({
      origin: 'broker-native',
      profile: policy.profiles['broker-native'],
      riskTier: 'critical',
      requestDefaultAction: 'allow',
    })).toMatchObject({ action: 'deny', reason: 'critical-fail-closed' });
  });

  it('produces a stable digest and rejects in-flight weakening', () => {
    const authored = resolveApprovalLifecyclePolicy({ profiles: {
      'broker-native': { ttlMs: 900_000, slaMs: [60_000, 300_000, 600_000] },
    } });
    expect(approvalLifecyclePolicyDigest(authored)).toMatch(/^[a-f0-9]{64}$/u);
    expect(approvalLifecyclePolicyDigest(structuredClone(authored))).toBe(
      approvalLifecyclePolicyDigest(authored),
    );

    const weakened = structuredClone(authored);
    weakened.profiles['broker-native'].ttlMs = 1_000_000;
    expect(() => tightenApprovalLifecycleProfile(
      'broker-native',
      authored.profiles['broker-native'],
      weakened.profiles['broker-native'],
    )).toThrow(ApprovalLifecyclePolicyError);
    expect(() => tightenApprovalLifecyclePolicy(authored, weakened)).toThrow(ApprovalLifecyclePolicyError);
  });

  it('ignores per-field weakening while retaining tightening from the same transition', () => {
    const authored = resolveApprovalLifecyclePolicy().profiles['broker-native'];
    const transition = applyApprovalLifecycleProfileTransition(authored, {
      ttlMs: 1_200_000,
      slaMs: [180_000, 480_000, 900_000],
      riskTier: 'elevated',
      timeoutDisposition: 'park-alert',
      blocking: 'trigger',
    });
    expect(transition).toEqual({
      profile: {
        ttlMs: 1_200_000,
        slaMs: [120_000, 480_000, 900_000],
        riskTier: 'elevated',
        timeoutDisposition: 'park-alert',
        blocking: 'trigger',
      },
      transitionChanged: true,
      weakeningIgnored: true,
    });
  });
});
