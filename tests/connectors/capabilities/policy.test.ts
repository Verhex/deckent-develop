import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { resolvePolicy } from '../../../src/connectors/capabilities/policy.js';
import type { Capability, Tier, PolicyDecision } from '../../../src/connectors/capabilities/types.js';

function cap(tier: Tier, defaultPolicy: PolicyDecision, edition: 'solo' | 'enterprise' = 'solo'): Capability {
  return { id: 'c', titleKey: 't', tier, defaultPolicy, edition, paramsSchema: z.object({}), preview: () => '', run: async () => ({}) };
}
const base = { chatKey: 'chat1', edition: 'solo' as const };

describe('resolvePolicy', () => {
  it('master disabled → unavailable', () => {
    expect(resolvePolicy(cap('read', 'auto'), { ...base, config: { enabled: false } })).toBe('unavailable');
  });
  it('enabled → capability defaultPolicy', () => {
    expect(resolvePolicy(cap('read', 'auto'), { ...base, config: { enabled: true } })).toBe('auto');
    expect(resolvePolicy(cap('external', 'confirm'), { ...base, config: { enabled: true } })).toBe('confirm');
  });
  it('global override beats default', () => {
    expect(resolvePolicy(cap('read', 'auto'), { ...base, config: { enabled: true, policies: { c: 'confirm' } } })).toBe('confirm');
  });
  it('per-chat override beats global', () => {
    const config = { enabled: true, policies: { c: 'auto' as const }, perChat: { chat1: { c: 'deny' as const } } };
    expect(resolvePolicy(cap('read', 'auto'), { ...base, config })).toBe('deny');
  });
  it('destructive can NEVER be auto — clamped to confirm (global override source)', () => {
    const config = { enabled: true, policies: { c: 'auto' as const } };
    expect(resolvePolicy(cap('destructive', 'deny'), { ...base, config })).toBe('confirm');
  });
  it('destructive can NEVER be auto — clamped to confirm (per-chat source)', () => {
    const config = { enabled: true, policies: { c: 'deny' as const }, perChat: { chat1: { c: 'auto' as const } } };
    expect(resolvePolicy(cap('destructive', 'deny'), { ...base, config })).toBe('confirm');
  });
  it('destructive can NEVER be auto — clamped to confirm (defaultPolicy source)', () => {
    const config = { enabled: true };
    expect(resolvePolicy(cap('destructive', 'auto'), { ...base, config })).toBe('confirm');
  });
  it('enterprise capability is unavailable on solo edition', () => {
    expect(resolvePolicy(cap('read', 'auto', 'enterprise'), { ...base, config: { enabled: true } })).toBe('unavailable');
  });
});
